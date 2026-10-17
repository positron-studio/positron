// positron-cast: Väin's archive played live into an Icecast mount from Cloudflare, no machine of ours.
//   GET  /feed                 their public archive (audio and recordings on eccm.ee / uuu.ee), cached 60 s
//   GET  /control/<target>     WebSocket, ?key=: play (cuts) / queue (after the current file) / next / stop, status once a second;
//                              program (the station's stored list, kept while off air, START plays it);
//                              mode (copy | mix | grains), set (tune, drift, dwell, blend, noise) for the mix,
//                              patch ({name?, set?}: the grain ring, clamped, kept, at most 20 a second)
//   GET  /status/<target>      the same status, read only
//   GET  /live                 per channel, whether their own stream is on it (a `livestream` event), cached 15 s
//   PUT  /ingest/<mount>       our own test Icecast receiver: a source client's PUT, Basic auth `source:`
//   GET  /ingest/<mount>       the same as a WebSocket: the PUT's header lines as one text message, then audio
//   GET  /listen/<mount>       the receiver's mount, audio/mpeg, to any number of listeners
//   GET  /listen/preview       the preview Icecast inside the `preview` caster's container; 503 when it is not running
//   GET  /rx/<mount>           what the receiver saw: auth, the source's headers, bytes, listeners
// The audio source runs in a Container (container/server.mjs); the Caster object only holds the wanted
// session in storage, boots the container, relays commands and restarts it when it dies.
// The source speaks exactly what Väin's own app sends (radio1965 app/icecastbroadcaster.cpp): PUT over
// HTTP/1.0, `ice-audio-info: send_notification=0;save_stream=0`, on air at a ` 200` status line.

import { clampSet, DEFAULTS as MIX_DEFAULTS } from './container/mixer.mjs';
import { clampPatch } from './container/grain-patch.mjs';

const FEED = 'https://live.uuu.ee/radio1965/api/events?status=new&status=shelved';
const FEED_TYPES = new Set(['audio', 'streamrecording']);
const FEED_HOSTS = new Set(['eccm.ee', 'uuu.ee', 'www.uuu.ee']);
// Half a vCPU for every mode: grains measured 23 to 25 % of a core locally. Memory is the 3 GiB per
// vCPU floor. Sweep every 30 s. why: lessons/workers-cast.md#grains-size
const CAST_INSTANCE = { vcpu: 0.5, memoryMib: 1536, diskMb: 2048 };
const SET_EVERY_MS = 50;
const MODES = ['copy', 'mix', 'grains'];   // mix controls reach the container at most 20 a second
const ALARM_MS = 30_000, IDLE_MS = 10 * 60_000, READY_MS = 20_000, BOOT_TRIES = 3, DEATHS_KEEP = 50;

/**
 * Where each target sends: our receiver, our preview Icecast, or one of Väin's mounts (radio1965 never
 * records or notifies, their on-connect hook). `preview` is Icecast 2.4.4 in its own container, reached
 * over the same TCP source code as theirs; `local` makes the container start it.
 */
function targets(env) {
  const t = { test: { kind: 'ws', url: 'wss://cast.positron.studio/ingest/test', mount: 'test', label: 'our test receiver', pw: env.TEST_PW || '' },
    preview: { kind: 'icecast', host: '127.0.0.1', port: 8000, mount: 'preview', label: 'our preview Icecast', pw: env.TEST_PW || '', local: true } };
  for (const m of ['radio1965', 'user1', 'user2', 'user3', 'user4']) t[m] = { kind: 'icecast', host: 'live.uuu.ee', port: 8001, mount: m, label: `Väin ${m}`, pw: env.VAIN_SOURCE_PW || '' };
  return t;
}

const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-type' };
const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
const NAME = /^[a-z0-9]{1,16}$/;

const CHANNELS = ['radio1965', 'user1', 'user2', 'user3', 'user4'];
// Their events API, asked only when a page or a command needs it: one answer per colo per EVENTS_S,
// and one request per isolate however many viewers ask at once. why: lessons/workers-cast.md#live
const EVENTS_S = 15, FEED_S = 60;
let eventsInFlight = null;
async function events(ctx) {
  const cache = caches.default, key = new Request('https://cast.positron.studio/__events');
  const hit = await cache.match(key);
  if (hit) return hit.json();
  eventsInFlight ||= (async () => {
    const r = await fetch(FEED, { headers: { 'user-agent': 'positron-cast/1 (+https://positron.studio)' } });
    if (!r.ok) throw new Error(`their feed answered ${r.status}`);
    const list = ((await r.json()).events || []).map(({ id, type, status, title, url, publish_at, author_name }) => ({ id, type, status, title, url, publish_at, author_name }));
    const body = JSON.stringify({ at: Date.now(), list });
    ctx?.waitUntil?.(cache.put(key, new Response(body, { headers: { 'cache-control': `max-age=${EVENTS_S}` } })));
    return JSON.parse(body);
  })().finally(() => { eventsInFlight = null; });
  return eventsInFlight;
}

/** Per channel `{ vain, title, id, since }`: a new `livestream` event their on-connect hook published for it. */
async function live(ctx) {
  const ev = await events(ctx), out = {};
  for (const ch of CHANNELS) {
    const e = ev.list.find((x) => x.type === 'livestream' && x.status === 'new' && /\/([a-z0-9]+)$/.exec(x.url || '')?.[1] === ch);
    out[ch] = e ? { vain: true, title: e.title, id: e.id, since: e.publish_at } : { vain: false };
  }
  return { at: ev.at, ageS: Math.round((Date.now() - ev.at) / 1000), everyS: EVENTS_S, channels: out };
}

/** Their archive as `{ id, title, url, type, at, author }`, only audio on their own hosts. */
async function feed(ctx) {
  const cache = caches.default, key = new Request('https://cast.positron.studio/__feed');
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const items = (await events(ctx)).list.filter((e) => FEED_TYPES.has(e.type) && e.url && (() => {
    try { return FEED_HOSTS.has(new URL(e.url).hostname); } catch { return false; } })())
    .map((e) => ({ id: e.id, title: e.title, url: e.url, type: e.type, at: e.publish_at, author: e.author_name || '' }));
  ctx?.waitUntil?.(cache.put(key, new Response(JSON.stringify(items), { headers: { 'cache-control': `max-age=${FEED_S}` } })));
  return items;
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url), [, route, name] = u.pathname.split('/');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, PUT', 'access-control-allow-headers': '*' } });
    if (route === 'feed') { try { return json({ items: await feed(ctx) }); } catch (e) { return json({ error: e.message }, 502); } }
    if (route === 'live') { try { return json(await live(ctx)); } catch (e) { return json({ error: e.message }, 502); } }
    if (!NAME.test(name || '')) return json({ error: 'no such route' }, 404);
    if (route === 'control' || route === 'status') {
      if (!targets(env)[name]) return json({ error: `no target ${name}` }, 404);
      if (route === 'control' && (!env.CAST_KEY || u.searchParams.get('key') !== env.CAST_KEY)) return json({ error: 'the control needs its key' }, 403);
      return env.CASTER.get(env.CASTER.idFromName(name)).fetch(req);
    }
    if (route === 'listen' && name === 'preview') return env.CASTER.get(env.CASTER.idFromName(name)).fetch(req);
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
    const [want, progress, deaths, boot, mx, prog] = await Promise.all(['want', 'progress', 'deaths', 'boot', 'mix', 'program'].map((k) => this.st.get(k)));
    const t = targets(this.env)[this.name], s = await this.cstatus();
    const lines = [...this.lines, ...(s?.lines || [])].sort().slice(-12);
    return { target: this.name, to: t?.label, playing: !!want, onAir: !!s?.onAir, now: s?.now || null,
      program: (prog || []).map(({ id, title }) => ({ id, title })),
      queue: want ? want.queue.map((x) => x.title) : [], ids: want ? want.queue.map((x) => x.id) : [], next: s?.next || null, index: s?.index ?? null, since: want?.startedAt ?? null,
      onAirSeconds: s?.onAir ? Math.round(s.seconds) : 0, files: s?.files ?? 0, frames: s?.frames ?? 0, bytes: s?.bytes ?? 0,
      seconds: s?.seconds ?? 0, skipped: s?.skipped ?? 0, rate: s?.rate ?? 0, kbps: s?.kbps ?? 0, lag: s?.lag ?? null, wall: s?.wall ?? null,
      container: { running: !!this.c?.running, answering: !!s, bootMs: boot?.ms ?? null, bootedAt: boot ? iso(boot.at) : null, uptime: s?.uptime ?? null,
        rss: s?.rss ?? null, sinkDeaths: s?.sinkDeaths ?? 0, lastError: s?.lastError || null },
      icecast: s?.icecast || null,
      mode: s?.mode || mx?.mode || 'copy', wanted: { mode: mx?.mode || 'copy', set: { ...MIX_DEFAULTS, ...(mx?.set || {}) }, patch: mx?.patch || null },
      mix: s?.mix ? (({ tune, drift, dwell, blend, noise, phase, k, noiseLevel, slots, next, meter, landings, underruns, encoderRestarts }) =>
        ({ tune, drift, dwell, blend, noise, phase, k, noiseLevel, slots: slots.map((x) => ({ title: x.title, clear: x.clear })), next, meter, landings, underruns, encoderRestarts }))(s.mix) : null,
      grains: s?.mix?.grains ? (({ patch, mix, values, out, chainStarts, chain: c }) => ({ patch, mix, values, out, chainStarts,
        chain: c && { dead: c.dead, upS: c.upS, xruns: c.xruns, late: c.late, grains: c.grains, scsynth: c.scsynth,
          procs: Object.fromEntries(Object.entries(c.procs || {}).map(([k, v]) => [k, v && { cpuPct: v.cpuPct, rssMiB: v.rssMiB }])) } }))(s.mix.grains) : null,
      usage: s?.usage || null,
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
    if (u.pathname.startsWith('/listen/')) return this.listen();
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

  /**
   * A listener on the preview Icecast, proxied from the container's :8000. Never starts a container:
   * nothing on air is a 503 the page can read. why: lessons/workers-cast.md#preview-listen
   */
  async listen() {
    const off = (why) => json({ error: why, onAir: false }, 503);
    if (!targets(this.env)[this.name]?.local) return json({ error: 'no listening here' }, 404);
    if (!this.c?.running) return off('preview is not on air: its container is not running');
    let r;
    try { r = await this.c.getTcpPort(8000).fetch('http://c/preview', { headers: { 'user-agent': 'positron-cast listen' } }); } catch (e) { return off(`the preview Icecast did not answer: ${e.message}`); }
    if (r.status !== 200 || !r.body) { r.body?.cancel(); return off(`the preview Icecast answered ${r.status}: no source on /preview`); }
    const ct = r.headers.get('content-type'); // forwarded, never invented
    return new Response(r.body, { headers: { ...(ct ? { 'content-type': ct } : {}), 'cache-control': 'no-store', ...cors } });
  }

  async command(text) {
    let m; try { m = JSON.parse(text); } catch { throw new Error('not JSON'); }
    if (m.cmd === 'stop') return this.stop('asked to stop');
    if (m.cmd === 'mode') return this.mode(m.mode);
    if (m.cmd === 'set') return this.set(m.name, m.v);
    if (m.cmd === 'patch') return this.patch(m);
    if (m.cmd === 'next') { if (this.c?.running) await this.cpost('/next'); return; }
    // Owner only, through the keyed control socket: destroys the container and leaves the session wanted.
    if (m.cmd === 'kill') { if (this.c?.running) { this.killing = true; this.say('killing the container on purpose'); await this.c.destroy().catch(() => {}); } return; }
    if (m.cmd === 'program') return this.program(m.ids);
    if (m.cmd === 'play' || m.cmd === 'queue') {
      const t = targets(this.env)[this.name];
      const want = await this.st.get('want'), on = !!(want && this.c?.running);
      // queue on air: what follows the current file, which keeps playing. why: lessons/workers-cast.md#queue
      if (m.cmd === 'queue') return this.program(m.ids);
      if (!t.pw) throw new Error(`no source password for ${t.label}: waiting on Väin's OK`);
      const queue = m.ids ? await this.resolve(m.ids) : ((await this.st.get('program')) || []);
      if (!queue.length) throw new Error(m.ids ? 'none of those is in their archive feed' : 'the program is empty');
      await this.st.put('program', queue);
      // Their own stream on this channel: their Icecast would answer 403 to a second source anyway.
      if (!t.local && !on) {
        const l = (await live(this.ctx)).channels[this.name];
        if (l?.vain) throw new Error(`Väin is streaming here: ${l.title}`);
      }
      if (on) {
        await this.st.put('want', { ...want, queue });
        await this.cpost('/play', { queue, target: t, ...(await this.mixBody()) });
        this.say(`queue replaced, ${queue.length} files`); return;
      }
      await this.st.put('want', { queue, target: this.name, startedAt: Date.now() });
      await this.st.delete(['progress', 'deaths']);
      await this.st.setAlarm(Date.now() + ALARM_MS);
      await this.bring('asked to play');
      this.push();
    }
  }

  /** Feed ids to `{ id, title, url }`, in the order given, dropping any no longer in their feed. */
  async resolve(ids) {
    const byId = new Map((await feed(this.ctx)).map((x) => [String(x.id), x]));
    return (Array.isArray(ids) ? ids : []).map((id) => byId.get(String(id))).filter(Boolean).map(({ id, title, url }) => ({ id, title, url }));
  }

  /**
   * The station's own program, kept in storage whether or not it is on air; START plays it. On air the
   * same edit goes to the container as a queue, rotated so the file after the current one plays next.
   * why: lessons/workers-cast.md#program
   */
  async program(ids) {
    const prog = await this.resolve(ids);
    if (ids?.length && !prog.length) throw new Error('none of those is in their archive feed');
    await this.st.put('program', prog);
    const want = await this.st.get('want');
    if (!want || !this.c?.running) { this.say(`program ${prog.length} files${want ? '' : ', plays on start'}`); this.push(); return; }
    // An empty program is the whole archive, on air as on start.
    const list = prog.length ? prog : (await feed(this.ctx)).map(({ id, title, url }) => ({ id, title, url }));
    const cur = (await this.cstatus())?.now?.id, i = list.findIndex((x) => String(x.id) === String(cur));
    const queue = i < 0 ? list : [...list.slice(i + 1), ...list.slice(0, i + 1)];
    await this.cpost('/queue', { queue });
    await this.st.put('want', { ...want, queue });
    this.say(prog.length ? `program ${prog.length} files, after this one` : 'program cleared, the whole archive after this one'); this.push();
  }

  /** What the container is told about the mix on every /play: the stored mode and every control. */
  async mixBody() {
    const mx = (await this.st.get('mix')) || {};
    return { mode: MODES.includes(mx.mode) ? mx.mode : 'copy', set: mx.set || {}, ...(mx.patch ? { patch: mx.patch } : {}) };
  }

  /** copy (the frame copier, the fallback), mix, or grains (the mix through the ring); on air it restarts the source in the other mode. */
  async mode(mode) {
    if (!MODES.includes(mode)) throw new Error(`mode is ${MODES.join(', ')}`);
    const mx = (await this.st.get('mix')) || {};
    await this.st.put('mix', { ...mx, mode });
    const want = await this.st.get('want');
    if (want && this.c?.running) await this.cpost('/play', { queue: want.queue, target: targets(this.env)[this.name], ...(await this.mixBody()) });
    this.say(`mode ${mode}${want ? ', on air' : ', for the next play'}`);
    this.push();
  }

  /** One mix control, clamped and kept; forwarded at most every SET_EVERY_MS. A hand on tune holds the dial. */
  async set(name, v) {
    const c = clampSet(name, v);
    if (c === null) throw new Error(`no mix control ${name} = ${v}`);
    const mx = (await this.st.get('mix')) || {}, add = name === 'tune' ? { tune: c, drift: 0 } : { [name]: c };
    await this.st.put('mix', { ...mx, set: { ...(mx.set || {}), ...add } });
    this.pendingSet = { ...(this.pendingSet || {}), ...add };
    if (this.setTimer) return;
    const flush = async () => {
      this.setTimer = null;
      const set = this.pendingSet; this.pendingSet = null;
      if (!set || !this.c?.running || !['mix', 'grains'].includes(((await this.st.get('mix')) || {}).mode)) return;
      this.lastSetAt = Date.now();
      try { await this.cpost('/set', { set }); } catch (e) { this.say(`set: ${e.message}`); }
    };
    this.setTimer = setTimeout(flush, Math.max(0, SET_EVERY_MS - (Date.now() - (this.lastSetAt || 0))));
  }

  /**
   * A grain ring patch: a name (the page's PATCHES) resets the values to that patch, `set` moves controls on
   * top. Clamped, kept for the next start, forwarded in grains mode at most every SET_EVERY_MS.
   */
  async patch({ name, set } = {}) {
    const byName = name != null ? clampPatch({ name }) : null, vals = clampPatch({ set: set || {} });
    if (byName?.refused.length) throw new Error(`no grain patch ${name}`);
    if (!byName && !Object.keys(vals.values).length) throw new Error(`no grain control in ${JSON.stringify(set)}`);
    const mx = (await this.st.get('mix')) || {}, prev = mx.patch || { name: null, set: {} };
    const next = byName ? { name: byName.patch, set: vals.values } : { name: prev.name, set: { ...prev.set, ...vals.values } };
    await this.st.put('mix', { ...mx, patch: next });
    const p = this.pendingPatch || { set: {} };
    this.pendingPatch = byName ? { name: byName.patch, set: vals.values } : { ...p, set: { ...p.set, ...vals.values } };
    if (this.patchTimer) return;
    const flush = async () => {
      this.patchTimer = null;
      const body = this.pendingPatch; this.pendingPatch = null;
      if (!body || !this.c?.running || ((await this.st.get('mix')) || {}).mode !== 'grains') return;
      this.lastPatchAt = Date.now();
      try { await this.cpost('/patch', body); } catch (e) { this.say(`patch: ${e.message}`); }
    };
    this.patchTimer = setTimeout(flush, Math.max(0, SET_EVERY_MS - (Date.now() - (this.lastPatchAt || 0))));
    if (byName) this.say(`grain patch ${byName.patch}`);
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
        if (!this.c.running) {
          started = true;
          const t = targets(this.env)[this.name];
          this.c.start({ image: this.c.images.cast, instance: CAST_INSTANCE, enableInternet: true, env: t?.local ? { ICECAST_PW: t.pw } : {} });
        }
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
    await this.cpost('/play', { queue: want.queue, target: t, resume, ...(await this.mixBody()) });
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
