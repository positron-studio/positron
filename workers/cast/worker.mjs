// positron-cast: Väin's archive played live into an Icecast mount from Cloudflare, no machine of ours.
//   GET  /feed                 their public archive (audio and recordings on eccm.ee / uuu.ee), cached 60 s
//   GET  /control/<target>     WebSocket, ?key=: play / next / stop, and the caster's status once a second
//   GET  /status/<target>      the same status, read only
//   PUT  /ingest/<mount>       our own test Icecast receiver: a source client's PUT, Basic auth `source:`
//   GET  /ingest/<mount>       the same as a WebSocket: the PUT's header lines as one text message, then audio
//   GET  /listen/<mount>       the receiver's mount, audio/mpeg, to any number of listeners
//   GET  /rx/<mount>           what the receiver saw: auth, the source's headers, bytes, listeners
// The audio source runs in a Container (container/server.mjs); the Caster object only holds the wanted
// session in storage, boots the container, relays commands and restarts it when it dies.
// The source speaks exactly what Väin's own app sends (radio1965 app/icecastbroadcaster.cpp): PUT over
// HTTP/1.0, `ice-audio-info: send_notification=0;save_stream=0`, on air at a ` 200` status line.

const FEED = 'https://live.uuu.ee/radio1965/api/events?status=new&status=shelved';
const FEED_TYPES = new Set(['audio', 'streamrecording']);
const FEED_HOSTS = new Set(['eccm.ee', 'uuu.ee', 'www.uuu.ee']);
// Smallest custom size; memory and vCPU are coupled at the platform's floor. Sweep every 30 s.
const CAST_INSTANCE = { vcpu: 0.25, memoryMib: 1024, diskMb: 2048 };
const ALARM_MS = 30_000, IDLE_MS = 10 * 60_000, READY_MS = 20_000, BOOT_TRIES = 3, DEATHS_KEEP = 50;

/** Where each target sends: our receiver, or one of Väin's user channels once a password is set. */
function targets(env) {
  const t = { test: { kind: 'ws', url: 'wss://cast.positron.studio/ingest/test', mount: 'test', label: 'our test receiver', pw: env.TEST_PW || '' } };
  for (const n of [1, 2, 3, 4]) t[`user${n}`] = { kind: 'icecast', host: 'live.uuu.ee', port: 8001, mount: `user${n}`, label: `Väin user${n}`, pw: env.VAIN_SOURCE_PW || '' };
  return t;
}

const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-type' };
const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
const NAME = /^[a-z0-9]{1,16}$/;

/** Their archive as `{ id, title, url, type, at, author }`, only audio on their own hosts. */
async function feed(ctx) {
  const cache = caches.default, key = new Request('https://cast.positron.studio/__feed');
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const r = await fetch(FEED, { headers: { 'user-agent': 'positron-cast/1 (+https://positron.studio)' } });
  if (!r.ok) throw new Error(`their feed answered ${r.status}`);
  const items = ((await r.json()).events || []).filter((e) => FEED_TYPES.has(e.type) && e.url && (() => {
    try { return FEED_HOSTS.has(new URL(e.url).hostname); } catch { return false; } })())
    .map((e) => ({ id: e.id, title: e.title, url: e.url, type: e.type, at: e.publish_at, author: e.author_name || '' }));
  ctx?.waitUntil?.(cache.put(key, new Response(JSON.stringify(items), { headers: { 'cache-control': 'max-age=60' } })));
  return items;
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url), [, route, name] = u.pathname.split('/');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, PUT', 'access-control-allow-headers': '*' } });
    if (route === 'feed') { try { return json({ items: await feed(ctx) }); } catch (e) { return json({ error: e.message }, 502); } }
    if (!NAME.test(name || '')) return json({ error: 'no such route' }, 404);
    if (route === 'control' || route === 'status') {
      if (!targets(env)[name]) return json({ error: `no target ${name}` }, 404);
      if (route === 'control' && (!env.CAST_KEY || u.searchParams.get('key') !== env.CAST_KEY)) return json({ error: 'the control needs its key' }, 403);
      return env.CASTER.get(env.CASTER.idFromName(name)).fetch(req);
    }
    if (route === 'ingest' || route === 'listen' || route === 'rx') return env.RX.get(env.RX.idFromName(name)).fetch(req);
    return json({ error: 'no such route' }, 404);
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (t) => new Date(t).toISOString().slice(0, 19) + 'Z';

/**
 * One caster per target, control only. The wanted session (queue, target, start) lives in storage, the
 * audio in the container. An alarm every 30 s reads the container, writes `progress`, and on a death
 * dates it in `deaths` and starts a new container that resumes the queue where progress last saw it.
 */
export class Caster {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.sockets = new Set();
    this.lines = [];
    this.booting = null; this.watching = false; this.misses = 0; this.killing = false;
    // A restarted object has no inactivity timeout, so set it again on every wake.
    if (ctx.container?.running) ctx.container.setInactivityTimeout(IDLE_MS).catch(() => { /* next wake */ });
  }
  say(line) { this.lines.push(`${new Date().toISOString().slice(11, 19)} ${line}`); if (this.lines.length > 40) this.lines.shift(); }
  get c() { return this.ctx.container; }
  get st() { return this.ctx.storage; }

  /** The container's /status, or null when it is not running or does not answer in 4 s. */
  async cstatus() {
    if (!this.c?.running) return null;
    try {
      const r = await Promise.race([this.c.getTcpPort(8080).fetch('http://c/status'), sleep(4000).then(() => null)]);
      return r ? await r.json() : null;
    } catch { return null; }
  }
  async cpost(path, body) {
    const r = await this.c.getTcpPort(8080).fetch(`http://c${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `the container answered ${r.status}`);
    return j;
  }

  async status() {
    const [want, progress, deaths, boot] = await Promise.all(['want', 'progress', 'deaths', 'boot'].map((k) => this.st.get(k)));
    const t = targets(this.env)[this.name], s = await this.cstatus();
    const lines = [...this.lines, ...(s?.lines || [])].sort().slice(-12);
    return { target: this.name, to: t?.label, playing: !!want, onAir: !!s?.onAir, now: s?.now || null,
      queue: want ? want.queue.map((x) => x.title) : [], index: s?.index ?? null, since: want?.startedAt ?? null,
      onAirSeconds: s?.onAir ? Math.round(s.seconds) : 0, files: s?.files ?? 0, frames: s?.frames ?? 0, bytes: s?.bytes ?? 0,
      seconds: s?.seconds ?? 0, skipped: s?.skipped ?? 0, rate: s?.rate ?? 0, kbps: s?.kbps ?? 0, lag: s?.lag ?? null, wall: s?.wall ?? null,
      container: { running: !!this.c?.running, answering: !!s, bootMs: boot?.ms ?? null, bootedAt: boot ? iso(boot.at) : null, uptime: s?.uptime ?? null,
        rss: s?.rss ?? null, sinkDeaths: s?.sinkDeaths ?? 0, lastError: s?.lastError || null },
      progress: progress || null, deaths: deaths || [], lines };
  }
  async push() {
    if (this.pushing || !this.sockets.size) return;
    this.pushing = true;
    try { const m = JSON.stringify({ type: 'status', ...(await this.status()) }); for (const w of this.sockets) { try { w.send(m); } catch { this.sockets.delete(w); } } }
    finally { this.pushing = false; }
  }

  async fetch(req) {
    const u = new URL(req.url);
    this.name = u.pathname.split('/')[2];
    if ((await this.st.get('name')) !== this.name) await this.st.put('name', this.name);
    if (u.pathname.startsWith('/status/')) return json(await this.status());
    if (req.headers.get('upgrade') !== 'websocket') return json({ error: 'a WebSocket' }, 426);
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sockets.add(server);
    server.addEventListener('message', (e) => this.command(e.data).catch((err) => { this.say(`refused: ${err.message}`); this.push(); }));
    server.addEventListener('close', () => this.sockets.delete(server));
    this.status().then((s) => server.send(JSON.stringify({ type: 'status', ...s }))).catch(() => { /* next push */ });
    if (!this.ticker) this.ticker = setInterval(() => { if (this.sockets.size) this.push(); }, 1000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async command(text) {
    let m; try { m = JSON.parse(text); } catch { throw new Error('not JSON'); }
    if (m.cmd === 'stop') return this.stop('asked to stop');
    if (m.cmd === 'next') { if (this.c?.running) await this.cpost('/next'); return; }
    // Owner only, through the keyed control socket: destroys the container and leaves the session wanted.
    if (m.cmd === 'kill') { if (this.c?.running) { this.killing = true; this.say('killing the container on purpose'); await this.c.destroy().catch(() => {}); } return; }
    if (m.cmd === 'play') {
      const t = targets(this.env)[this.name];
      if (!t.pw) throw new Error(`no source password for ${t.label}: waiting on Väin's OK`);
      const items = await feed(this.ctx), byId = new Map(items.map((x) => [String(x.id), x]));
      const queue = (m.ids || []).map((id) => byId.get(String(id))).filter(Boolean).map(({ id, title, url }) => ({ id, title, url }));
      if (!queue.length) throw new Error('none of those is in their archive feed');
      const want = await this.st.get('want');
      if (want && this.c?.running) {
        await this.st.put('want', { ...want, queue });
        await this.cpost('/play', { queue, target: t });
        this.say(`queue replaced, ${queue.length} files`); return;
      }
      await this.st.put('want', { queue, target: this.name, startedAt: Date.now() });
      await this.st.delete(['progress', 'deaths']);
      await this.st.setAlarm(Date.now() + ALARM_MS);
      await this.bring('asked to play');
      this.push();
    }
  }

  async stop(why) {
    await this.st.delete(['want', 'progress']);
    await this.st.deleteAlarm();
    if (this.c?.running) { try { await this.cpost('/stop'); } catch { /* going anyway */ } await this.c.destroy().catch(() => {}); }
    this.say(`off air, ${why}`);
    this.push();
  }

  /** Starts the container if it is not running and waits for server.mjs to listen. */
  up() {
    if (this.booting) return this.booting;
    // A start just after a destroy can hang without listening: give each try READY_MS, then destroy and retry.
    // why: lessons/workers-cast.md#boot-retry
    this.booting = (async () => {
      const t0 = Date.now();
      let started = false;
      for (let attempt = 1; ; attempt++) {
        const ta = Date.now();
        if (!this.c.running) { started = true; this.c.start({ image: this.c.images.cast, instance: CAST_INSTANCE, enableInternet: true }); }
        this.watch();
        try { await this.c.setInactivityTimeout(IDLE_MS); } catch { /* set again on the next wake */ }
        let up = false;
        while (!(up = !!(await this.cstatus())) && Date.now() - ta < READY_MS) await sleep(100);
        if (up) break;
        if (attempt >= BOOT_TRIES) throw new Error(`container not listening after ${BOOT_TRIES} tries`);
        this.say(`try ${attempt}: not listening ${READY_MS / 1000} s after start, destroying and trying again`);
        this.retrying = true;
        await this.c.destroy().catch(() => {});
        await sleep(2000);
      }
      if (!started) return;
      const ms = Date.now() - t0;
      await this.st.put('boot', { id: t0, at: t0, ms });
      this.say(`container up in ${ms} ms`);
    })().finally(() => { this.booting = null; });
    return this.booting;
  }

  /** monitor() resolves or rejects when the container exits; while a session is wanted that is a death. */
  watch() {
    if (this.watching) return;
    this.watching = true;
    const bootAt = Date.now();
    this.c.monitor()
      .then(() => (this.retrying ? null : this.died(this.killing ? 'killed on purpose' : 'the container exited', bootAt)))
      .catch((e) => (this.retrying ? null : this.died(this.killing ? 'killed on purpose' : `the container failed: ${String(e?.message || e).slice(0, 160)}`, bootAt)))
      .finally(() => { this.watching = false; this.killing = false; this.retrying = false; });
  }

  /** Dates a death once per boot, then brings the source back within a second. */
  async died(why) {
    const want = await this.st.get('want');
    if (!want) return;
    const boot = await this.st.get('boot'), deaths = (await this.st.get('deaths')) || [];
    if (boot && deaths.some((d) => d.boot === boot.id)) return;
    const at = Date.now();
    deaths.push({ at: iso(at), t: at, boot: boot?.id ?? null, why, last: (await this.st.get('progress')) || null });
    while (deaths.length > DEATHS_KEEP) deaths.shift();
    await this.st.put('deaths', deaths);
    this.say(`death: ${why}; restarting`);
    await this.st.setAlarm(Date.now() + 1000);
  }

  /** Boots if needed and hands the container the queue, resuming where progress last saw it. */
  async bring(why) {
    const want = await this.st.get('want');
    if (!want) return;
    await this.up();
    const t = targets(this.env)[want.target], p = await this.st.get('progress');
    const resume = p?.index != null && p.now ? { index: p.index, at: p.now.at } : null;
    await this.cpost('/play', { queue: want.queue, target: t, resume });
    this.say(`${why}: container playing${resume ? ` from file ${resume.index + 1} at ${resume.at} s` : ''}`);
    // the gap: from the death being dated to the source being on air again
    for (let i = 0; i < 40; i++) {
      const s = await this.cstatus();
      if (s?.onAir) {
        const deaths = (await this.st.get('deaths')) || [], d = deaths.at(-1);
        if (d && !d.back) { d.back = iso(Date.now()); d.gapS = +((Date.now() - d.t) / 1000).toFixed(1); await this.st.put('deaths', deaths); this.say(`back on air ${d.gapS} s after the death`); }
        break;
      }
      await sleep(500);
    }
  }

  async alarm() {
    try {
      const want = await this.st.get('want');
      if (!want) { if (this.c?.running) await this.c.destroy().catch(() => {}); return; }
      this.name ||= want.target;
      const boot = await this.st.get('boot');
      if (!this.c.running) {
        await this.died('found not running');
        await this.bring('restart');
      } else {
        this.watch();
        try { await this.c.setInactivityTimeout(IDLE_MS); } catch { /* the constructor set it */ }
        const s = await this.cstatus();
        if (!s) {
          if (++this.misses >= 2) { this.misses = 0; await this.died('status unreachable twice'); await this.c.destroy().catch(() => {}); await this.bring('restart'); }
        } else if (!s.playing) {
          this.misses = 0;
          // the process restarted under us, or the session ended inside it
          if (boot && s.bootedAt > boot.at + 60_000) await this.died('the container restarted on its own');
          await this.bring('resume');
        } else {
          this.misses = 0;
          await this.st.put('progress', { at: iso(Date.now()), t: Date.now(), onAir: s.onAir, seconds: s.seconds, wall: s.wall,
            sessionS: Math.round((Date.now() - want.startedAt) / 1000), files: s.files, lag: s.lag, down: s.down,
            sinkDeaths: s.sinkDeaths, index: s.index, now: s.now, bytes: s.bytes, rss: s.rss });
        }
      }
    } catch (e) { this.say(`sweep: ${e.message}`); }
    finally {
      if (await this.st.get('want')) await this.st.setAlarm(Date.now() + ALARM_MS);
      this.push();
    }
  }
}

/** Our own Icecast receiver: one source per mount, its bytes copied to every listener. */
export class Rx {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.listeners = new Set();
    this.source = null; this.last = null;
    this.bytes = 0; this.refused = 0;
  }
  async fetch(req) {
    const u = new URL(req.url), route = u.pathname.split('/')[1];
    if (route === 'rx') return json({ source: this.source, last: this.last, listeners: this.listeners.size, bytes: this.bytes, refused: this.refused });
    if (route === 'listen') {
      const { readable, writable } = new TransformStream();
      const w = writable.getWriter();
      this.listeners.add(w);
      return new Response(readable, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'icy-name': 'positron cast test', ...cors } });
    }
    if (route === 'ingest' && req.headers.get('upgrade') === 'websocket') return this.ingestSocket();
    if (route !== 'ingest' || req.method !== 'PUT') return json({ error: 'PUT /ingest/<mount>' }, 405);
    const why = this.refuse(req.headers.get('authorization'));
    if (why) return new Response(why[1], { status: why[0] });
    this.begin(Object.fromEntries([...req.headers]), 'put');
    const src = this.source, reader = req.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.feed(value);
      }
    } finally { if (this.source === src) this.end(); }
    return new Response('ok');
  }

  /** `[status, words]` when this source may not have the mount. A silent WebSocket source gives way after 5 s. */
  refuse(auth) {
    if (!this.env.TEST_PW || auth !== `Basic ${btoa(`source:${this.env.TEST_PW}`)}`) { this.refused++; return [401, 'wrong source password']; }
    if (this.source && !(this.sourceWs && Date.now() - this.source.lastAt > 5000)) return [403, 'this mount already has a source'];
    if (this.source) { try { this.sourceWs.close(4009, 'replaced by a new source'); } catch { /* gone */ } this.end(); }
    return null;
  }
  begin(headers, via) {
    const h = Object.fromEntries(Object.entries(headers).filter(([k]) => k.startsWith('ice-') || k === 'content-type'));
    // What Väin's on-connect hook would do with this source: notify and record unless each flag is 0.
    const info = Object.fromEntries((h['ice-audio-info'] || '').split(';').map((p) => p.split('=')).filter((p) => p.length === 2));
    this.source = { since: Date.now(), via, headers: h, wouldNotify: info.send_notification !== '0', wouldRecord: info.save_stream !== '0', bytes: 0, lastAt: Date.now() };
  }
  end() { this.last = { ...this.source, ended: Date.now() }; this.source = null; this.sourceWs = null; }
  feed(value) {
    this.bytes += value.length; this.source.bytes += value.length; this.source.lastAt = Date.now();
    for (const w of this.listeners) {
      if (w.desiredSize !== null && w.desiredSize < -512 * 1024) { this.listeners.delete(w); w.abort().catch(() => {}); continue; }
      w.write(value).catch(() => this.listeners.delete(w));
    }
  }

  /** The PUT as a WebSocket, because the edge holds a streamed request body until it ends. */
  // why: lessons/workers-cast.md#rx-websocket
  ingestSocket() {
    const [client, ws] = Object.values(new WebSocketPair());
    ws.accept();
    let src = null, chain = Promise.resolve();
    ws.addEventListener('message', (e) => {
      // binary may arrive as a Blob; one promise chain keeps the frames in order across its await
      if (src) {
        if (typeof e.data === 'string') return;
        chain = chain.then(async () => { const b = e.data instanceof ArrayBuffer ? e.data : await e.data.arrayBuffer(); if (this.source === src) this.feed(new Uint8Array(b)); }).catch(() => {});
        return;
      }
      let head = [];
      try { head = JSON.parse(e.data).head || []; } catch { /* refused below */ }
      const h = Object.fromEntries(head.map((l) => [l.slice(0, l.indexOf(':')).trim().toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
      const why = this.refuse(h.authorization);
      if (why) { ws.send(`HTTP/1.0 ${why[0]} ${why[1]}`); ws.close(4000 + why[0] % 1000, why[1]); return; }
      this.begin(h, 'websocket');
      src = this.source; this.sourceWs = ws;
      ws.send('HTTP/1.0 200 OK');
    });
    const gone = () => { if (src && this.source === src) this.end(); };
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
}
