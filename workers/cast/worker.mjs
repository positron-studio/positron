// positron-cast: Väin's archive played live into an Icecast mount from Cloudflare, no machine of ours.
//   GET  /feed                 their public archive (audio and recordings on eccm.ee / uuu.ee), cached 60 s
//   GET  /control/<target>     WebSocket, ?key=: play / next / stop, and the caster's status once a second
//   GET  /status/<target>      the same status, read only
//   PUT  /ingest/<mount>       our own test Icecast receiver: a source client's PUT, Basic auth `source:`
//   GET  /listen/<mount>       the receiver's mount, audio/mpeg, to any number of listeners
//   GET  /rx/<mount>           what the receiver saw: auth, the source's headers, bytes, listeners
// A caster speaks exactly what Väin's own app sends (radio1965 app/icecastbroadcaster.cpp): PUT over
// HTTP/1.0, `ice-audio-info: send_notification=0;save_stream=0`, on air at a ` 200` status line.
import { connect } from 'cloudflare:sockets';
import { createFramer } from './mp3.mjs';

const FEED = 'https://live.uuu.ee/radio1965/api/events?status=new&status=shelved';
const FEED_TYPES = new Set(['audio', 'streamrecording']);
const FEED_HOSTS = new Set(['eccm.ee', 'uuu.ee', 'www.uuu.ee']);
// Frames go out this far ahead of the clock, and a file is read no further ahead than READ_AHEAD.
const LEAD_S = 2, READ_AHEAD_S = 20, TICK_MS = 200, ALARM_MS = 10_000;

/** Where each target sends: our receiver, or one of Väin's user channels once a password is set. */
function targets(env) {
  const t = { test: { kind: 'rx', mount: 'test', label: 'our test receiver' } };
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

/**
 * One caster per target. It holds one source connection for the whole session and writes the queue's
 * files into it back to back at real time, so a listener hears one stream across files.
 */
export class Caster {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.sockets = new Set();
    this.s = null;          // the running session, or null
    this.lines = [];        // the last things it said
    this.stats = { files: 0, frames: 0, bytes: 0, seconds: 0, skipped: 0, rate: 0, kbps: 0 };
  }
  say(line) { this.lines.push(`${new Date().toISOString().slice(11, 19)} ${line}`); if (this.lines.length > 40) this.lines.shift(); }
  target() { return targets(this.env)[this.name]; }

  status() {
    const s = this.s, t = this.target();
    return { target: this.name, to: t?.label, playing: !!s, onAir: !!s?.onAir, now: s?.item ? { id: s.item.id, title: s.item.title, at: Math.round(s.fileSeconds) } : null,
      queue: s ? s.queue.map((x) => x.title) : [], index: s?.index ?? null, since: s?.since ?? null,
      onAirSeconds: s?.onAir ? Math.round(this.stats.seconds) : 0, ...this.stats, lines: this.lines.slice(-12) };
  }
  push() { const m = JSON.stringify({ type: 'status', ...this.status() }); for (const w of this.sockets) { try { w.send(m); } catch { this.sockets.delete(w); } } }

  async fetch(req) {
    const u = new URL(req.url);
    this.name = u.pathname.split('/')[2];
    if (u.pathname.startsWith('/status/')) return json(this.status());
    if (req.headers.get('upgrade') !== 'websocket') return json({ error: 'a WebSocket' }, 426);
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sockets.add(server);
    server.addEventListener('message', (e) => this.command(e.data).catch((err) => { this.say(`refused: ${err.message}`); this.push(); }));
    server.addEventListener('close', () => this.sockets.delete(server));
    server.send(JSON.stringify({ type: 'status', ...this.status() }));
    if (!this.ticker) this.ticker = setInterval(() => { if (this.sockets.size) this.push(); }, 1000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async command(text) {
    let m; try { m = JSON.parse(text); } catch { throw new Error('not JSON'); }
    if (m.cmd === 'stop') { await this.stop('asked to stop'); return; }
    if (m.cmd === 'next') { if (this.s) this.s.skip = true; return; }
    if (m.cmd === 'play') {
      const items = await feed(this.ctx), byId = new Map(items.map((x) => [String(x.id), x]));
      const queue = (m.ids || []).map((id) => byId.get(String(id))).filter(Boolean);
      if (!queue.length) throw new Error('none of those is in their archive feed');
      if (this.s) { this.s.queue = queue; this.s.index = -1; this.s.skip = true; this.say(`queue replaced, ${queue.length} files`); return; }
      await this.start(queue);
    }
  }

  /** Opens the sink: `{ write(bytes), close(), onAir, closed }`. Refuses in words. */
  async openSink(item) {
    const t = this.target();
    const pw = t.kind === 'rx' ? this.env.TEST_PW : t.pw;
    if (!pw) throw new Error(`no source password for ${t.label}: waiting on Väin's OK`);
    const head = [`PUT /${t.mount} HTTP/1.0`, `Authorization: Basic ${btoa(`source:${pw}`)}`, 'Content-Type: audio/mpeg',
      'ice-name: positron cast', `ice-description: ${(item?.title || 'Väin archive').replace(/[^\x20-\x7e]/g, '?')}`,
      'ice-genre: archive', `ice-url: ${t.mount}`, 'ice-audio-info: send_notification=0;save_stream=0', '', ''].join('\r\n');
    if (t.kind === 'rx') {
      const { readable, writable } = new TransformStream();
      const w = writable.getWriter();
      const headers = Object.fromEntries(head.split('\r\n').slice(1).filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
      const stub = this.env.RX.get(this.env.RX.idFromName(t.mount));
      const sink = { onAir: true, closed: false };
      stub.fetch(`https://rx/ingest/${t.mount}`, { method: 'PUT', headers, body: readable }).then(async (r) => {
        sink.closed = true; if (r.status !== 200) { sink.why = `the receiver answered ${r.status}: ${await r.text()}`; this.say(sink.why); }
      }).catch((e) => { sink.closed = true; sink.why = e.message; });
      sink.write = (b) => w.write(b);
      sink.close = () => w.close().catch(() => {});
      return sink;
    }
    const socket = connect({ hostname: t.host, port: t.port });
    const w = socket.writable.getWriter();
    await w.write(new TextEncoder().encode(head));
    const r = socket.readable.getReader();
    let got = '';
    const deadline = Date.now() + 8000;
    while (!got.includes('\r\n') && Date.now() < deadline) {
      const { value, done } = await Promise.race([r.read(), new Promise((res) => setTimeout(() => res({ timeout: true }), 1000))]);
      if (done) break;
      if (value) got += new TextDecoder().decode(value);
    }
    const line = got.split('\r\n')[0];
    if (!line.includes(' 200')) { try { socket.close(); } catch { /* gone */ } throw new Error(`${t.host} answered "${line || 'nothing'}"`); }
    const sink = { onAir: true, closed: false, write: (b) => w.write(b), close: () => { try { socket.close(); } catch { /* gone */ } } };
    socket.closed.then(() => { sink.closed = true; }, (e) => { sink.closed = true; sink.why = e.message; });
    // Drain whatever the server says after the status line, as their app does.
    (async () => { try { for (;;) { const { done } = await r.read(); if (done) break; } } catch { /* closed */ } })();
    return sink;
  }

  async start(queue) {
    const sink = await this.openSink(queue[0]);
    this.s = { queue, index: -1, item: null, sink, onAir: true, since: Date.now(), skip: false, fileSeconds: 0 };
    this.stats = { files: 0, frames: 0, bytes: 0, seconds: 0, skipped: 0, rate: 0, kbps: 0 };
    this.say(`on air on ${this.target().label}`);
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    this.run(this.s).catch((e) => { this.say(`stopped: ${e.message}`); this.stop(e.message); });
    this.push();
  }

  async stop(why) {
    const s = this.s;
    if (!s) return;
    this.s = null;
    s.stopped = true;
    s.sink.close();
    this.say(`off air, ${why}`);
    this.push();
  }

  /** The queue, round and round, paced against the wall clock from the session's first frame. */
  async run(s) {
    const t0 = Date.now();
    let sent = 0; // seconds of audio written since t0
    while (!s.stopped) {
      s.index = (s.index + 1) % s.queue.length;
      s.item = s.queue[s.index]; s.skip = false; s.fileSeconds = 0;
      this.stats.files++;
      this.say(`playing ${s.item.title}`);
      this.push();
      const r = await fetch(s.item.url, { headers: { 'user-agent': 'positron-cast/1 (+https://positron.studio)' } });
      if (!r.ok || !r.body) { this.say(`${s.item.title}: ${r.status}, skipped`); await sleep(1000); continue; }
      const reader = r.body.getReader(), framer = createFramer();
      let ended = false, frames = [];
      const fill = async () => {
        while (!ended && frames.reduce((n, f) => n + f.seconds, 0) < READ_AHEAD_S) {
          const { value, done } = await reader.read();
          if (done) { ended = true; frames = frames.concat(framer.push(new Uint8Array(0), true)); break; }
          frames = frames.concat(framer.push(value));
        }
      };
      await fill();
      while (!s.stopped && !s.skip && (frames.length || !ended)) {
        if (s.sink.closed) throw new Error(s.sink.why || 'the server closed the connection');
        const due = (Date.now() - t0) / 1000 + LEAD_S;
        while (frames.length && sent < due) {
          const f = frames.shift();
          await s.sink.write(f.data);
          sent += f.seconds; s.fileSeconds += f.seconds;
          this.stats.frames++; this.stats.bytes += f.data.length; this.stats.seconds = sent; this.stats.rate = f.rate; this.stats.kbps = f.kbps;
        }
        if (!ended && frames.length < 50) await fill();
        if (sent >= due || !frames.length) await sleep(TICK_MS);
      }
      this.stats.skipped += framer.skipped;
      try { reader.cancel(); } catch { /* done */ }
    }
  }

  // An alarm every 10 s while on air keeps the object awake through a long broadcast.
  async alarm() {
    if (this.s) { await this.ctx.storage.setAlarm(Date.now() + ALARM_MS); this.push(); }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (route !== 'ingest' || req.method !== 'PUT') return json({ error: 'PUT /ingest/<mount>' }, 405);
    if (!this.env.TEST_PW || req.headers.get('authorization') !== `Basic ${btoa(`source:${this.env.TEST_PW}`)}`) { this.refused++; return new Response('wrong source password', { status: 401 }); }
    if (this.source) return new Response('this mount already has a source', { status: 403 });
    const h = Object.fromEntries([...req.headers].filter(([k]) => k.startsWith('ice-') || k === 'content-type'));
    // What Väin's on-connect hook would do with this source: notify and record unless each flag is 0.
    const info = Object.fromEntries((h['ice-audio-info'] || '').split(';').map((p) => p.split('=')).filter((p) => p.length === 2));
    this.source = { since: Date.now(), headers: h, wouldNotify: info.send_notification !== '0', wouldRecord: info.save_stream !== '0', bytes: 0 };
    const reader = req.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.bytes += value.length; this.source.bytes += value.length;
        for (const w of this.listeners) {
          if (w.desiredSize !== null && w.desiredSize < -512 * 1024) { this.listeners.delete(w); w.abort().catch(() => {}); continue; }
          w.write(value).catch(() => this.listeners.delete(w));
        }
      }
    } finally {
      this.last = { ...this.source, ended: Date.now() };
      this.source = null;
    }
    return new Response('ok');
  }
}
