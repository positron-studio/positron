// positron-cast: Väin's archive played live into an Icecast mount from Cloudflare, no machine of ours.
//   GET  /feed                 their public archive (audio and recordings on eccm.ee / uuu.ee), cached 60 s, each with
//                              gain (dB to -23 LUFS), kind (speech | field | music | ambiguous), kindConf, soften (the input
//                              stage for clicks, soften.mjs) and seconds from gains.mjs
//   GET  /control/<target>     WebSocket, ?key=: play (cuts) / queue (after the current file) / next / stop, status once a second;
//                              extend ({ms}: stop at now + ms, 15 min to 12 h); every start stops itself at `until`, 2 h on;
//                              program (the station's stored list, kept while off air, START plays it);
//                              every station plays live (life.mjs and layers.mjs in the container); step ({by: 1 | -1}:
//                              the next or previous scene); mode, set and patch are refused since 2026-10-18
//   GET  /status/<target>      the same status, read only
//   GET  /file/<id>            one archive file by feed id, with CORS and Range, cached at the edge a year (the page's LOCAL)
//   GET  /live                 per channel, whether their own stream is on it (a `livestream` event), cached 15 s
//   GET  /listen/preview       the preview Icecast inside the `preview` caster's container; 503 when it is not running
//   GET  /votes                the owner's votes on live scenes (demo/radio/cast/life.mjs), newest last
//   POST /votes?key=           {inst, def, vote: 1 bad | 2 meh | 3 good | 4 great | null, comment, file, station?}: one row per
//                              scene played (`inst`, a station's from its status.life); no vote and no comment takes it back
// The audio source runs in a Container (container/server.mjs); the Caster object only holds the wanted
// session in storage, boots the container, relays commands and restarts it when it dies.
// The source speaks exactly what Väin's own app sends (radio1965 app/icecastbroadcaster.cpp): PUT over
// HTTP/1.0, `ice-audio-info: send_notification=0;save_stream=0`, on air at a ` 200` status line.

import { levelFor } from './gains.mjs';
import { tasteOf, fileWeight } from './container/sc/radio/cast/life.mjs';

const FEED = 'https://live.uuu.ee/radio1965/api/events?status=new&status=shelved';
const FEED_TYPES = new Set(['audio', 'streamrecording']);
const FEED_HOSTS = new Set(['eccm.ee', 'uuu.ee', 'www.uuu.ee']);
// Half a vCPU: live measured 27 to 31 % of a core locally at --cpus 0.5. Memory is the 3 GiB per vCPU floor.
// Sweep every 30 s. why: lessons/workers-cast.md#grains-size, #live-container
const CAST_INSTANCE = { vcpu: 0.5, memoryMib: 1536, diskMb: 2048 };
// Live only since 2026-10-18 (*"rm copy mix and grains, arvhice. keep live only"*); the container keeps the
// others for its tests. why: lessons/workers-cast.md#live-container
const MODES = ['live'], RETIRED_MODES = ['copy', 'mix', 'grains'];
// An empty program starts as this many files, picked as the page picks them; at most VOTES_SENT votes reach the life.
const PICK = Infinity, VOTES_SENT = 2000; // an empty program starts as the whole archive, shuffled by the votes
const ALARM_MS = 30_000, IDLE_MS = 10 * 60_000, READY_MS = 20_000, BOOT_TRIES = 3, DEATHS_KEEP = 50;
// Every start stops itself at `until`, kept in the wanted session. why: lessons/workers-cast.md#cap
const CAP_MS = 2 * 3600_000, EXTEND_MIN = 15 * 60_000, CAP_MAX = 12 * 3600_000, PLAY_CAP_MIN = 60_000;
const clampMs = (ms, lo) => (Number.isFinite(+ms) ? Math.min(CAP_MAX, Math.max(lo, Math.round(+ms))) : null);

/**
 * Where each target sends: our preview Icecast, or one of Väin's mounts (radio1965 never records or
 * notifies, their on-connect hook). `preview` is Icecast 2.4.4 in its own container, reached over the
 * same TCP source code as theirs; `local` makes the container start it.
 */
function targets(env) {
  const t = { preview: { kind: 'icecast', host: '127.0.0.1', port: 8000, mount: 'preview', label: 'our preview Icecast', pw: env.TEST_PW || '', local: true } };
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

/** Their archive as `{ id, title, url, type, at, author, gain, kind, kindConf }`, only audio on their own hosts. */
async function feed(ctx) {
  const cache = caches.default, key = new Request('https://cast.positron.studio/__feed');
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const items = (await events(ctx)).list.filter((e) => FEED_TYPES.has(e.type) && e.url && (() => {
    try { return FEED_HOSTS.has(new URL(e.url).hostname); } catch { return false; } })())
    .map((e) => ({ id: e.id, title: e.title, url: e.url, type: e.type, at: e.publish_at, author: e.author_name || '', ...levelFor(e.id) }));
  ctx?.waitUntil?.(cache.put(key, new Response(JSON.stringify(items), { headers: { 'cache-control': `max-age=${FEED_S}` } })));
  return items;
}

/**
 * One archive file with CORS, for the page's LOCAL play: the id resolves through the feed (an allowlist, never
 * a URL), the file is asked of their host once per colo and kept a year. why: lessons/workers-cast.md#file
 */
const FILE_ID = /^[A-Za-z0-9_-]{1,64}$/, FILE_KEEP_S = 365 * 86400;
const fileCors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-type, content-length, content-range, accept-ranges, x-cast-cache' };
async function file(req, id, ctx) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'GET a file' }, 405);
  if (!FILE_ID.test(id || '')) return json({ error: 'no such file' }, 404);
  const cache = caches.default, key = `https://cast.positron.studio/__file/${id}`, range = req.headers.get('range');
  // the cache answers a Range itself, 206 from the whole file it holds
  const hit = await cache.match(new Request(key, range ? { headers: { range } } : {}));
  const send = (r, how) => {
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(fileCors)) h.set(k, v);
    h.set('x-cast-cache', how);
    return new Response(req.method === 'HEAD' ? null : r.body, { status: r.status, headers: h });
  };
  if (hit) return send(hit, 'hit');
  let item;
  try { item = (await feed(ctx)).find((x) => String(x.id) === id); } catch (e) { return json({ error: e.message }, 502); }
  if (!item) return json({ error: 'not in their archive feed' }, 404);
  const u = new URL(item.url);
  if (!/^https?:$/.test(u.protocol) || u.port) return json({ error: 'not a file on their web host' }, 404);
  const up = await fetch(u, { headers: { 'user-agent': 'positron-cast/1 (+https://positron.studio)' }, cf: { cacheEverything: true, cacheTtl: FILE_KEEP_S } });
  if (up.status !== 200 || !up.body) { up.body?.cancel(); return json({ error: `their host answered ${up.status}` }, 502); }
  const h = new Headers({ 'cache-control': `public, max-age=${FILE_KEEP_S}, immutable`, 'accept-ranges': 'bytes' });
  for (const k of ['content-type', 'content-length', 'last-modified', 'etag']) { const v = up.headers.get(k); if (v) h.set(k, v); } // forwarded, never invented
  const [a, b] = up.body.tee();
  ctx.waitUntil(cache.put(key, new Response(a, { headers: h })).catch(() => { /* the next request asks again */ }));
  // a miss answers the whole file even to a Range: a media element takes a 200
  return send(new Response(b, { headers: h }), 'miss');
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url), [, route, name] = u.pathname.split('/');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, PUT, POST', 'access-control-allow-headers': '*' } });
    if (route === 'feed') { try { return json({ items: await feed(ctx) }); } catch (e) { return json({ error: e.message }, 502); } }
    if (route === 'live') { try { return json(await live(ctx)); } catch (e) { return json({ error: e.message }, 502); } }
    if (route === 'file') return file(req, name, ctx);
    if (route === 'votes') {
      if (req.method === 'POST' && (!env.CAST_KEY || u.searchParams.get('key') !== env.CAST_KEY)) return json({ error: 'a vote needs the key' }, 403);
      return env.VOTES.get(env.VOTES.idFromName('owner')).fetch(req);
    }
    if (!NAME.test(name || '')) return json({ error: 'no such route' }, 404);
    if (route === 'control' || route === 'status') {
      if (!targets(env)[name]) return json({ error: `no target ${name}` }, 404);
      if (route === 'control' && (!env.CAST_KEY || u.searchParams.get('key') !== env.CAST_KEY)) return json({ error: 'the control needs its key' }, 403);
      return env.CASTER.get(env.CASTER.idFromName(name)).fetch(req);
    }
    if (route === 'listen' && name === 'preview') return env.CASTER.get(env.CASTER.idFromName(name)).fetch(req);
    return json({ error: 'no such route' }, 404);
  },
};

/**
 * Feed ids for a program of `n`: each file weighted by fileWeight of its votes (keyed by title, as the page's
 * tasteOf is), none at weight 0, a plain shuffle when no file has a vote. The page's startIds, here.
 */
export function pickFiles(items, votes, n, rand = Math.random) {
  const fs = tasteOf(votes).file, pool = items.map((x) => ({ id: x.id, w: fileWeight(fs[x.title]) })).filter((x) => x.w > 0);
  if (pool.every((x) => x.w === 1)) { for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } return pool.map((x) => x.id).slice(0, n); }
  return pool.map((x) => ({ ...x, k: rand() ** (1 / x.w) })).sort((a, b) => b.k - a.k).map((x) => x.id).slice(0, n);
}

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
    // every queue carries each file's gain from the table, a stored one too. why: lessons/workers-cast.md#level
    if (Array.isArray(body?.queue)) body = { ...body, queue: body.queue.map((x) => ({ ...x, ...levelFor(x.id) })) };
    const r = await this.c.getTcpPort(8080).fetch(`http://c${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `the container answered ${r.status}`);
    return j;
  }

  async status() {
    const [want, progress, deaths, boot, prog, stopped] = await Promise.all(['want', 'progress', 'deaths', 'boot', 'program', 'stopped'].map((k) => this.st.get(k)));
    const t = targets(this.env)[this.name], s = await this.cstatus();
    const lines = [...this.lines, ...(s?.lines || [])].sort().slice(-12);
    return { target: this.name, to: t?.label, playing: !!want, onAir: !!s?.onAir, now: s?.now || null,
      program: (prog || []).map(({ id, title }) => ({ id, title })),
      queue: want ? want.queue.map((x) => x.title) : [], ids: want ? want.queue.map((x) => x.id) : [], next: s?.next || null, index: s?.index ?? null, since: want?.startedAt ?? null,
      until: want ? (want.until ?? want.startedAt + CAP_MS) : null, stopped: stopped || null,
      onAirSeconds: s?.onAir ? Math.round(s.seconds) : 0, files: s?.files ?? 0, frames: s?.frames ?? 0, bytes: s?.bytes ?? 0,
      seconds: s?.seconds ?? 0, skipped: s?.skipped ?? 0, rate: s?.rate ?? 0, kbps: s?.kbps ?? 0, lag: s?.lag ?? null, wall: s?.wall ?? null,
      container: { running: !!this.c?.running, answering: !!s, bootMs: boot?.ms ?? null, bootedAt: boot ? iso(boot.at) : null, uptime: s?.uptime ?? null,
        rss: s?.rss ?? null, sinkDeaths: s?.sinkDeaths ?? 0, lastError: s?.lastError || null },
      icecast: s?.icecast || null,
      mode: s?.mode || 'live', wanted: { mode: 'live' }, life: s?.mix?.life ?? null,
      mix: s?.mix ? (({ tune, drift, dwell, blend, noise, phase, k, noiseLevel, slots, next, meter, landings, underruns, encoderRestarts, backlog }) =>
        ({ tune, drift, dwell, blend, noise, phase, k, noiseLevel, slots: slots.map((x) => ({ title: x.title, clear: x.clear, soften: x.soften })), next, meter, landings, underruns, encoderRestarts, backlog }))(s.mix) : null,
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
    if (m.cmd === 'extend') return this.extend(m.ms);
    if (m.cmd === 'mode') return this.mode(m.mode);
    if (m.cmd === 'set' || m.cmd === 'patch') throw new Error(`${m.cmd} is the life's on a live station: it moves the sound itself`);
    if (m.cmd === 'step') return this.step(m.by);
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
      let queue = m.ids?.length ? await this.resolve(m.ids) : ((await this.st.get('program')) || []);
      if (m.ids?.length && !queue.length) throw new Error('none of those is in their archive feed');
      // an empty program: PICK files weighted by what the votes said of each, as the page picks them
      if (!queue.length) queue = await this.resolve(pickFiles((await feed(this.ctx)), await this.votes(), PICK));
      if (!queue.length) throw new Error('the archive feed is empty');
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
      // capMs below the default only through this keyed socket, at least a minute, for a check that must end itself
      const cap = m.capMs != null ? clampMs(m.capMs, PLAY_CAP_MIN) : CAP_MS;
      if (cap == null) throw new Error('capMs is a number of ms');
      // a new life on every start; a restart after a death keeps the start's seed
      await this.st.put('want', { queue, target: this.name, startedAt: Date.now(), until: Date.now() + cap, seed: crypto.getRandomValues(new Uint32Array(1))[0] >>> 1 });
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
    // An empty program is the whole archive less what the votes ruled out, on air
    const list = prog.length ? prog : await this.resolve(pickFiles(await feed(this.ctx), await this.votes(), Infinity));
    const cur = (await this.cstatus())?.now?.id, i = list.findIndex((x) => String(x.id) === String(cur));
    const queue = i < 0 ? list : [...list.slice(i + 1), ...list.slice(0, i + 1)];
    await this.cpost('/queue', { queue });
    await this.st.put('want', { ...want, queue });
    this.say(prog.length ? `program ${prog.length} files, after this one` : 'program cleared, the whole archive after this one'); this.push();
  }

  /** What the container is told on every /play: live, with this start's seed and the owner's votes. */
  async mixBody() {
    const want = await this.st.get('want');
    return { mode: 'live', life: { seed: want?.seed ?? 1, votes: await this.votes() } };
  }

  /** The owner's votes as the life reads them, `{ def, vote, file }`, newest VOTES_SENT. */
  async votes() {
    try {
      const r = await this.env.VOTES.get(this.env.VOTES.idFromName('owner')).fetch('https://cast/votes');
      return ((await r.json()).votes || []).filter((v) => v.vote && v.def).slice(-VOTES_SENT).map(({ def, vote, file }) => ({ def, vote, file }));
    } catch (e) { this.say(`votes: ${e.message}`); return []; }
  }

  /** Every station plays live; the retired modes are refused by name. */
  async mode(mode) {
    if (RETIRED_MODES.includes(mode)) throw new Error(`${mode} was retired on 2026-10-18: every station plays live`);
    if (!MODES.includes(mode)) throw new Error('the mode is live');
    this.say('mode live'); this.push();
  }

  /** The next (1) or previous (-1) scene of the life on air: its transition starts at once. */
  async step(by) {
    if (by !== 1 && by !== -1) throw new Error('step by 1 or -1');
    if (!(await this.st.get('want')) || !this.c?.running) throw new Error('not on air: nothing to step');
    await this.cpost('/step', { by });
    this.say(`step ${by > 0 ? 'next' : 'previous'} scene`); this.push();
  }

  /** Moves the stop to now + ms, 15 min to 12 h; only while wanted. */
  async extend(ms) {
    const want = await this.st.get('want');
    if (!want) throw new Error('not on air: nothing to extend');
    const add = clampMs(ms, EXTEND_MIN);
    if (add == null) throw new Error('extend needs ms');
    const until = Date.now() + add;
    await this.st.put('want', { ...want, until });
    await this.st.setAlarm(Math.min(Date.now() + ALARM_MS, until));
    this.say(`stops at ${iso(until)}`);
    this.push();
  }

  async stop(why) {
    await this.st.put('stopped', { at: iso(Date.now()), t: Date.now(), why });
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
      // the cap holds across a restarted object and container: until is in storage
      if (Date.now() >= (want.until ?? want.startedAt + CAP_MS)) return await this.stop('stopped at the cap');
      if (!targets(this.env)[want.target]) return await this.stop(`no station ${want.target}`);
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
      const w = await this.st.get('want');
      if (w) await this.st.setAlarm(Math.max(Date.now() + 1000, Math.min(Date.now() + ALARM_MS, w.until ?? w.startedAt + CAP_MS)));
      this.push();
    }
  }
}

/** The owner's votes on live scenes: one row per scene played, a def small enough to rebuild it. */
const VOTE_CAP = 5000, DEF_MAX = 2000, COMMENT_MAX = 1000;
export class Votes {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS vote(inst TEXT PRIMARY KEY, at INTEGER, sid TEXT, vote INTEGER, def TEXT, file TEXT)');
    try { this.sql.exec('ALTER TABLE vote ADD COLUMN comment TEXT'); } catch { /* already there */ }
    try { this.sql.exec('ALTER TABLE vote ADD COLUMN station TEXT'); } catch { /* already there */ }
  }
  async fetch(req) {
    if (req.method === 'GET') {
      const rows = this.sql.exec('SELECT inst, at, sid, vote, def, file, comment, station FROM vote ORDER BY at').toArray();
      return json({ votes: rows.map((x) => ({ ...x, def: JSON.parse(x.def) })) });
    }
    let b = null;
    try { b = await req.json(); } catch { return json({ error: 'not JSON' }, 400); }
    const inst = String(b?.inst || '').slice(0, 64), vote = b?.vote == null ? null : Number(b.vote), def = JSON.stringify(b?.def ?? null);
    const comment = String(b?.comment ?? '').trim().slice(0, COMMENT_MAX);
    if (!inst || (vote !== null && ![1, 2, 3, 4].includes(vote))) return json({ error: 'inst and a vote of 1 to 4 or none' }, 400);
    if (vote === null && !comment) { this.sql.exec('DELETE FROM vote WHERE inst = ?', inst); return json({ ok: true, inst, vote }); }
    if (def.length > DEF_MAX || typeof b.def?.patch !== 'string' || typeof b.def?.param !== 'string') return json({ error: 'a def with a patch and a param, under 2000 bytes' }, 400);
    const sid = `${b.def.patch}|${b.def.param}|${b.def.len}|${b.def.lo}|${b.def.iParam}`.slice(0, 200);
    // station: the cast station whose life played the scene (its status.life), none for the page's local one
    const station = NAME.test(b.station || '') ? b.station : null;
    this.sql.exec('INSERT OR REPLACE INTO vote(inst, at, sid, vote, def, file, comment, station) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', inst, Date.now(), sid, vote, def, String(b.file || '').slice(0, 200), comment, station);
    this.sql.exec('DELETE FROM vote WHERE inst IN (SELECT inst FROM vote ORDER BY at DESC LIMIT -1 OFFSET ?)', VOTE_CAP);
    return json({ ok: true, inst, vote, sid });
  }
}
