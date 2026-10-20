// positron-cast: Väin's archive played live into an Icecast mount from Cloudflare, no machine of ours.
//   GET  /feed                 their public archive (audio and recordings on eccm.ee / uuu.ee), cached 60 s, each with
//                              gain (dB to -23 LUFS), kind (speech | field | music | ambiguous), kindConf, soften (the input
//                              stage for clicks, soften.mjs) and seconds from gains.mjs
//   GET  /control/<target>     WebSocket, ?key=: play (cuts) / queue (after the current file) / next / stop, status once a second;
//                              extend ({ms}: stop at now + ms, 15 min to 14 days, workers/cast/extend.mjs); every start stops itself at `until`, 7 days on;
//                              program (the station's stored list, kept while off air, START plays it);
//                              every station plays live (life.mjs and layers.mjs in the container); step ({by: 1 | -1}:
//                              the next or previous scene); mode, set and patch are refused since 2026-10-18
//   GET  /status/<target>      the same status, read only
//   GET  /file/<id>            one archive file by feed id, with CORS and Range, cached at the edge a year (the page's LOCAL)
//   GET  /live                 per channel, whether their own stream is on it (a `livestream` event), cached 15 s
//   GET  /listen/preview       the preview Icecast inside the `preview` caster's container, moved across a handover; 503
//                              when it is not running
//   GET  /votes                the owner's votes on live scenes (demo/radio/cast/life.mjs), newest last
//   POST /votes?key=           {inst, def, vote: 1 bad | 2 meh | 3 good | 4 great | null, comment, file, station?}: one row per
//                              scene played (`inst`, a station's from its status.life); no vote and no comment takes it back
// The audio source runs in a Container (container/server.mjs); the Caster object only holds the wanted
// session in storage, boots the container, relays commands and restarts it when it dies. A deploy hands
// a station to a twin container with no gap (handover, lessons/workers-cast.md#handover).
// The source speaks exactly what Väin's own app sends (radio1965 app/icecastbroadcaster.cpp): PUT over
// HTTP/1.0, `ice-audio-info: send_notification=0;save_stream=0`, on air at a ` 200` status line.

import { levelFor } from './gains.mjs';
import { tasteOf, fileWeight } from './container/sc/radio/cast/life.mjs';
import { createEar } from './splice.mjs';
import { pickBy, longOnly, resolveIds, rotateAfter, freshLook, goneFrom, freshQueue, programLess, MIN_FILE_S, FRESH_EVERY_MS } from './program.mjs';

const FEED = 'https://live.uuu.ee/radio1965/api/events?status=new&status=shelved';
const FEED_TYPES = new Set(['audio', 'streamrecording']);
const FEED_HOSTS = new Set(['eccm.ee', 'uuu.ee', 'www.uuu.ee']);
// Half a vCPU: live measured 27 to 31 % of a core locally at --cpus 0.5. Memory is the 3 GiB per vCPU floor.
// Sweep every 30 s. why: lessons/workers-cast.md#grains-size, #live-container
const CAST_INSTANCE = { vcpu: 1, memoryMib: 3072, diskMb: 2048 };
// Live only since 2026-10-18 (*"rm copy mix and grains, arvhice. keep live only"*); the container keeps the
// others for its tests. why: lessons/workers-cast.md#live-container
const MODES = ['live'], RETIRED_MODES = ['copy', 'mix', 'grains'];
// An empty program starts as this many files, picked as the page picks them; at most VOTES_SENT votes reach the life.
const PICK = Infinity, VOTES_SENT = 2000; // an empty program starts as the whole archive, shuffled by the votes
const ALARM_MS = 30_000, IDLE_MS = 10 * 60_000, READY_MS = 20_000, BOOT_TRIES = 3, DEATHS_KEEP = 50;
// A handover starts with at least SAFE_S of dwell left and goes on with MIN_S once the twin is up; waiting, the
// alarm looks again every RETRY_MS; TRIES failures in a row refresh the old way. why: lessons/workers-cast.md#handover
const HANDOVER_SAFE_S = 25, HANDOVER_MIN_S = 10, HANDOVER_RETRY_MS = 3000, HANDOVER_TRIES = 3;
const other = (k) => (k === 'b' ? 'a' : 'b'), twinOf = (name) => `${name}~b`;
// Every start stops itself at `until`, kept in the wanted session. why: lessons/workers-cast.md#cap
const CAP_MS = 7 * 24 * 3600_000, EXTEND_MIN = 15 * 60_000, CAP_MAX = 14 * 24 * 3600_000, PLAY_CAP_MIN = 60_000;
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
const EVENTS_S = 15, FEED_S = 30;
// On air the feed is read every FRESH_EVERY_MS (30 s, asked *"30 sec"*; the feed's edge cache is 30 s to match); the rules
// (new files next, gone files out, the quiet hour) are program.mjs's, shared with edgecast. why: lessons/workers-cast.md#fresh
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
  // test recordings play like any other file: *"test recordings are fine, let the team handle it"* (2026-10-19)
  const fs = tasteOf(votes).file;
  return pickBy(items, (title) => fileWeight(fs[title]), n, rand).map((x) => x.id);
}

/** Seconds under which a file is left out of what plays (the clip tests are 15 s); program.mjs's. */
export { MIN_FILE_S };
/**
 * Whether the container on air runs older code than this deploy: by the image's hash when both sides know it (a Worker
 * deploy alone changes nothing on air), else by the Worker version as before. why: plans/plan-cast-load.md
 */
export const newCode = (boot, env) => (boot.image && env.CAST_IMAGE ? boot.image !== env.CAST_IMAGE : !!env.CF_VERSION_METADATA?.id && boot.version !== env.CF_VERSION_METADATA.id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (t) => new Date(t).toISOString().slice(0, 19) + 'Z';

/**
 * One caster per target: the wanted session in storage, the audio in slot `a` (its own container) or `b` (the
 * container of a Caster `<name>~b` that only hosts it); a deploy hands it from one to the other. An alarm every
 * 30 s writes `progress` and brings a dead container back. why: lessons/workers-cast.md#handover
 */
export class Caster {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.sockets = new Set();
    this.ears = new Set();
    this.lines = [];
    this.booting = {}; this.watching = false; this.misses = 0; this.killing = false; this.handing = false;
    // A restarted object has no inactivity timeout, so set it again on every wake.
    if (ctx.container?.running) ctx.container.setInactivityTimeout(IDLE_MS).catch(() => { /* next wake */ });
  }
  say(line) { this.lines.push(`${new Date().toISOString().slice(11, 19)} ${line}`); if (this.lines.length > 40) this.lines.shift(); }
  get c() { return this.ctx.container; }
  get st() { return this.ctx.storage; }

  /** The slot on air, `a` or `b`, from storage once per wake. */
  async key() { this.activeK ??= (await this.st.get('active')) || 'a'; return this.activeK; }
  async setActive(k) { this.activeK = k; await this.st.put('active', k); }

  /** A slot's container behind one shape: running(), start(env), destroy(), idle(), fetch(port, path, init). */
  slot(k) {
    if (k !== 'b') {
      return { k: 'a', running: async () => !!this.c?.running, idle: () => this.c.setInactivityTimeout(IDLE_MS), destroy: () => this.c.destroy(),
        start: async (env) => { this.c.start({ image: this.c.images.cast, instance: CAST_INSTANCE, enableInternet: true, env }); this.watch(); },
        fetch: (port, path, init) => this.c.getTcpPort(port).fetch(`http://c${path}`, init) };
    }
    const stub = this.env.CASTER.get(this.env.CASTER.idFromName(twinOf(this.name)));
    const host = async (op, init) => {
      const r = await stub.fetch(`https://cast/host/${this.name}/${op}`, init);
      if (r.status === 599) throw new Error((await r.json()).error);
      return r;
    };
    return { k: 'b',
      running: async () => { try { return !!(await (await host('running')).json()).running; } catch { return false; } },
      idle: () => host('idle', { method: 'POST' }),
      destroy: () => host('destroy', { method: 'POST' }),
      start: async (env) => { await host('start', { method: 'POST', body: JSON.stringify({ env }) }); },
      fetch: (port, path, init) => host(`port/${port}${path}`, init) };
  }

  /** The twin's side: a Caster named `<station>~b` hosts one container for the station and nothing else. */
  async host(req, u) {
    const [, , station, op, ...rest] = u.pathname.split('/');
    try {
      if (op === 'running') return json({ running: !!this.c?.running });
      if (op === 'idle') { if (this.c?.running) await this.c.setInactivityTimeout(IDLE_MS); return json({ ok: true }); }
      if (op === 'destroy') { this.hostKilling = true; if (this.c?.running) await this.c.destroy().catch(() => {}); return json({ ok: true }); }
      if (op === 'start') {
        const { env } = await req.json();
        if (!this.c.running) this.c.start({ image: this.c.images.cast, instance: CAST_INSTANCE, enableInternet: true, env: env || {} });
        try { await this.c.setInactivityTimeout(IDLE_MS); } catch { /* the next call sets it */ }
        if (!this.watching) {
          this.watching = true;
          // an exit the station did not ask for is a death on the station's side
          this.c.monitor().then(() => 'the twin container exited', (e) => `the twin container failed: ${String(e?.message || e).slice(0, 160)}`)
            .then((why) => (this.hostKilling ? null : this.env.CASTER.get(this.env.CASTER.idFromName(station))
              .fetch(`https://cast/hostexit/${station}`, { method: 'POST', body: JSON.stringify({ why }) }).catch(() => {})))
            .finally(() => { this.watching = false; this.hostKilling = false; });
        }
        return json({ ok: true });
      }
      if (op === 'port') {
        if (!this.c?.running) return json({ error: 'the twin container is not running' }, 599);
        const path = `/${rest.slice(1).join('/')}${u.search}`;
        return await this.c.getTcpPort(Number(rest[0])).fetch(`http://c${path}`, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body });
      }
    } catch (e) { return json({ error: e.message }, 599); }
    return json({ error: 'no such host route' }, 404);
  }

  /** A slot's /status (the slot on air by default), or null when it is not running or does not answer in 4 s. */
  async cstatus(k) {
    const sl = this.slot(k ?? await this.key());
    if (!(await sl.running())) return null;
    try {
      const r = await Promise.race([sl.fetch(8080, '/status'), sleep(4000).then(() => null)]);
      return r ? await r.json() : null;
    } catch { return null; }
  }
  async running(k) { return this.slot(k ?? await this.key()).running(); }
  async cpost(path, body, k) {
    // every queue carries each file's gain from the table, a stored one too. why: lessons/workers-cast.md#level
    if (Array.isArray(body?.queue)) body = { ...body, queue: body.queue.map((x) => ({ ...x, ...levelFor(x.id) })) };
    // a file under MIN_FILE_S is a blip between scenes, so it does not play while longer ones can (*"Same feeds go back and forth, with quite abrupt change"*, 2026-10-19)
    if (Array.isArray(body?.queue)) body = { ...body, queue: longOnly(body.queue) };
    const r = await this.slot(k ?? await this.key()).fetch(8080, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `the container answered ${r.status}`);
    return j;
  }

  async status() {
    const [want, progress, deaths, boot, prog, stopped, handovers] = await Promise.all(['want', 'progress', 'deaths', 'boot', 'program', 'stopped', 'handovers'].map((k) => this.st.get(k)));
    const t = targets(this.env)[this.name], k = await this.key(), s = await this.cstatus(k), up = await this.running(k);
    const lines = [...this.lines, ...(s?.lines || [])].sort().slice(-12);
    return { target: this.name, to: t?.label, playing: !!want, onAir: !!s?.onAir, now: s?.now || null,
      program: (prog || []).map(({ id, title }) => ({ id, title })),
      queue: want ? want.queue.map((x) => x.title) : [], ids: want ? want.queue.map((x) => x.id) : [], next: s?.next || null, index: s?.index ?? null, since: want?.startedAt ?? null,
      until: want ? (want.until ?? want.startedAt + CAP_MS) : null, stopped: stopped || null,
      onAirSeconds: s?.onAir ? Math.round(s.seconds) : 0, files: s?.files ?? 0, frames: s?.frames ?? 0, bytes: s?.bytes ?? 0,
      seconds: s?.seconds ?? 0, skipped: s?.skipped ?? 0, rate: s?.rate ?? 0, kbps: s?.kbps ?? 0, lag: s?.lag ?? null, wall: s?.wall ?? null,
      container: { running: up, slot: k, answering: !!s, bootMs: boot?.ms ?? null, bootedAt: boot ? iso(boot.at) : null, uptime: s?.uptime ?? null,
        rss: s?.rss ?? null, sinkDeaths: s?.sinkDeaths ?? 0, lastError: s?.lastError || null, handing: this.handing },
      icecast: s?.icecast || null,
      mode: s?.mode || 'live', wanted: { mode: 'live' }, life: s?.mix?.life ?? null,
      mix: s?.mix ? (({ tune, drift, dwell, blend, noise, phase, k, noiseLevel, slots, next, meter, landings, underruns, encoderRestarts, backlog }) =>
        ({ tune, drift, dwell, blend, noise, phase, k, noiseLevel, slots: slots.map((x) => ({ title: x.title, clear: x.clear, soften: x.soften })), next, meter, landings, underruns, encoderRestarts, backlog }))(s.mix) : null,
      grains: s?.mix?.grains ? (({ patch, mix, values, out, chainStarts, chain: c }) => ({ patch, mix, values, out, chainStarts,
        chain: c && { dead: c.dead, upS: c.upS, xruns: c.xruns, late: c.late, grains: c.grains, scsynth: c.scsynth,
          procs: Object.fromEntries(Object.entries(c.procs || {}).map(([k, v]) => [k, v && { cpuPct: v.cpuPct, rssMiB: v.rssMiB }])) } }))(s.mix.grains) : null,
      usage: s?.usage || null,
      progress: progress ? (({ handoff, ...p }) => ({ ...p, scene: handoff?.si ?? null }))(progress) : null, deaths: deaths || [], handovers: handovers || [], lines };
  }
  async push() {
    if (this.pushing || !this.sockets.size) return;
    this.pushing = true;
    try { const m = JSON.stringify({ type: 'status', ...(await this.status()) }); for (const w of this.sockets) { try { w.send(m); } catch { this.sockets.delete(w); } } }
    finally { this.pushing = false; }
  }

  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname.startsWith('/host/')) return this.host(req, u);
    this.name = u.pathname.split('/')[2];
    if ((await this.st.get('name')) !== this.name) await this.st.put('name', this.name);
    if (u.pathname.startsWith('/hostexit/')) {
      const { why } = await req.json().catch(() => ({}));
      if ((await this.key()) === 'b' && !this.handing && !this.retrying) await this.died(this.killing ? 'killed on purpose' : why || 'the twin container exited');
      this.killing = false;
      return json({ ok: true });
    }
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
   * A listener on the preview Icecast of the slot on air, frame by frame so a handover can move it (splice.mjs).
   * Never starts a container: nothing on air is a 503. why: lessons/workers-cast.md#preview-listen, #handover
   */
  async listen() {
    const off = (why) => json({ error: why, onAir: false }, 503);
    if (!targets(this.env)[this.name]?.local) return json({ error: 'no listening here' }, 404);
    const sl = this.slot(await this.key());
    if (!(await sl.running())) return off('preview is not on air: its container is not running');
    let r;
    try { r = await sl.fetch(8000, '/preview', { headers: { 'user-agent': 'positron-cast listen' } }); } catch (e) { return off(`the preview Icecast did not answer: ${e.message}`); }
    if (r.status !== 200 || !r.body) { r.body?.cancel(); return off(`the preview Icecast answered ${r.status}: no source on /preview`); }
    const ct = r.headers.get('content-type'); // forwarded, never invented
    const ear = createEar(r.body, { onEnd: () => this.ears.delete(ear) });
    this.ears.add(ear);
    return new Response(ear.readable, { headers: { ...(ct ? { 'content-type': ct } : {}), 'cache-control': 'no-store', ...cors } });
  }

  /** Every listener onto slot k's Icecast, each at its live edge; resolves with each one's splice. */
  async spliceAll(k) {
    const sl = this.slot(k);
    return Promise.all([...this.ears].map(async (ear) => {
      try {
        const r = await sl.fetch(8000, '/preview', { headers: { 'user-agent': 'positron-cast listen' } });
        if (r.status !== 200 || !r.body) { r.body?.cancel(); return { ok: false, why: `the twin's Icecast answered ${r.status}` }; }
        return await ear.splice(r.body);
      } catch (e) { return { ok: false, why: e.message }; }
    }));
  }

  async command(text) {
    let m; try { m = JSON.parse(text); } catch { throw new Error('not JSON'); }
    if (m.cmd === 'stop') return this.stop('asked to stop');
    if (m.cmd === 'extend') return this.extend(m.ms);
    if (m.cmd === 'mode') return this.mode(m.mode);
    if (m.cmd === 'set' || m.cmd === 'patch') throw new Error(`${m.cmd} is the life's on a live station: it moves the sound itself`);
    // a handover copies the station into a twin: a change now would reach only the one going away
    if (this.handing && ['step', 'next', 'kill', 'program', 'play', 'queue', 'load'].includes(m.cmd)) throw new Error('handing over to the new code: try again in a few seconds');
    if (m.cmd === 'step') return this.step(m.by);
    // a new composer into the running container, no hand-over (workers/cast/load.mjs). why: plans/plan-cast-load.md
    if (m.cmd === 'load') {
      if (!(await this.running())) throw new Error('not on air: a load goes into a running station');
      const r = await this.slot(await this.key()).fetch(8080, '/load', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: m.files, sha: m.sha }) });
      const j = await r.json().catch(() => ({}));
      this.say(j.ok ? `load ${j.sha} checked, taken at the next scene` : `load refused: ${j.why || j.error || r.status}`); this.push(); return;
    }
    if (m.cmd === 'next') { if (await this.running()) await this.cpost('/next'); return; }
    // Owner only, through the keyed control socket: destroys the container and leaves the session wanted.
    if (m.cmd === 'kill') { if (await this.running()) { this.killing = true; this.say('killing the container on purpose'); await this.slot(await this.key()).destroy().catch(() => {}); } return; }
    if (m.cmd === 'program') return this.program(m.ids);
    if (m.cmd === 'play' || m.cmd === 'queue') {
      const t = targets(this.env)[this.name];
      const want = await this.st.get('want'), on = !!(want && await this.running());
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
    return resolveIds(ids, await feed(this.ctx)).map(({ id, title, url }) => ({ id, title, url }));
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
    if (!want || !(await this.running())) { this.say(`program ${prog.length} files${want ? '' : ', plays on start'}`); this.push(); return; }
    // An empty program is the whole archive less what the votes ruled out, on air
    const list = prog.length ? prog : await this.resolve(pickFiles(await feed(this.ctx), await this.votes(), Infinity));
    const queue = rotateAfter(list, (await this.cstatus())?.now?.id);
    await this.cpost('/queue', { queue });
    await this.st.put('want', { ...want, queue });
    this.say(prog.length ? `program ${prog.length} files, after this one` : 'program cleared, the whole archive after this one'); this.push();
  }

  /** What the container is told on every /play: live, with this start's seed and the owner's votes up to `upTo`. */
  async mixBody(upTo) {
    const want = await this.st.get('want');
    return { mode: 'live', life: { seed: want?.seed ?? 1, votes: await this.votes(upTo) } };
  }

  /** The owner's votes as the life reads them, `{ def, vote, file }`, newest VOTES_SENT, none cast after `upTo`. */
  async votes(upTo = Infinity) {
    try {
      const r = await this.env.VOTES.get(this.env.VOTES.idFromName('owner')).fetch('https://cast/votes');
      return ((await r.json()).votes || []).filter((v) => v.vote && v.def && !(v.at > upTo)).slice(-VOTES_SENT).map(({ def, vote, file }) => ({ def, vote, file }));
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
    if (!(await this.st.get('want')) || !(await this.running())) throw new Error('not on air: nothing to step');
    await this.cpost('/step', { by });
    this.say(`step ${by > 0 ? 'next' : 'previous'} scene`); this.push();
  }

  /**
   * What arrived in their archive since the last look plays next, newest first; what left it leaves the queue and the
   * program; a quiet hour brings a recent arrival round again. `cur` is the id playing, which is never cut.
   */
  async freshTick(want, cur) {
    if (Date.now() - (this.freshAt || 0) < FRESH_EVERY_MS) return;
    this.freshAt = Date.now();
    const items = await feed(this.ctx);
    const look = freshLook(await this.st.get('fresh'), items, { startedAt: want.startedAt, cur, now: Date.now() });
    await this.st.put('fresh', look.st);
    if (look.baseline) return;
    const queue0 = want.queue || [], gone = goneFrom(queue0, look.ids);
    if (!look.add.length && !gone.length) return;
    const q = await this.resolve(look.add.map((x) => x.id));
    const queue = freshQueue(queue0, q, look.ids, cur);
    if (!queue.length) return;
    await this.cpost('/queue', { queue });
    await this.st.put('want', { ...want, queue });
    const prog = programLess(await this.st.get('program'), look.ids);
    if (prog) await this.st.put('program', prog);
    if (q.length) this.say(`${look.why}: ${q.map((x) => x.title).join(', ')}`);
    if (gone.length) this.say(`left the archive, out of the queue: ${gone.map((x) => x.title).join(', ')}`);
    this.push();
  }

  /** Moves the stop to now + ms, 15 min to 14 days; only while wanted. */
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
    const k = await this.key();
    if (await this.running(k)) { try { await this.cpost('/stop', {}, k); } catch { /* going anyway */ } this.killing = true; await this.slot(k).destroy().catch(() => {}); }
    // a twin left by a handover that did not finish goes too
    if (await this.running(other(k))) await this.slot(other(k)).destroy().catch(() => {});
    this.say(`off air, ${why}`);
    this.push();
  }

  /**
   * Starts slot k's container if it is not running and waits for server.mjs to listen. Returns the boot
   * record, and stores it as `boot` when k is the slot on air.
   */
  up(k) {
    if (this.booting[k]) return this.booting[k];
    const sl = this.slot(k);
    // A start just after a destroy can hang without listening: give each try READY_MS, then destroy and retry.
    // why: lessons/workers-cast.md#boot-retry
    this.booting[k] = (async () => {
      const t0 = Date.now();
      let started = false;
      for (let attempt = 1; ; attempt++) {
        const ta = Date.now();
        if (!(await sl.running())) {
          started = true;
          const t = targets(this.env)[this.name];
          await sl.start(t?.local ? { ICECAST_PW: t.pw } : {});
        }
        try { await sl.idle(); } catch { /* set again on the next wake */ }
        let up = false;
        while (!(up = !!(await this.cstatus(k))) && Date.now() - ta < READY_MS) await sleep(100);
        if (up) break;
        if (attempt >= BOOT_TRIES) throw new Error(`container not listening after ${BOOT_TRIES} tries`);
        this.say(`try ${attempt}: not listening ${READY_MS / 1000} s after start, destroying and trying again`);
        this.retrying = true;
        await sl.destroy().catch(() => {});
        await sleep(2000);
        this.retrying = false;
      }
      const boot = { id: t0, at: t0, ms: Date.now() - t0, version: this.env.CF_VERSION_METADATA?.id ?? null, image: this.env.CAST_IMAGE ?? null, slot: k };
      if (!started) return (await this.st.get('boot')) || boot;
      if (k === await this.key()) await this.st.put('boot', boot);
      this.say(`container ${k} up in ${boot.ms} ms`);
      return boot;
    })().finally(() => { this.booting[k] = null; });
    return this.booting[k];
  }

  /** monitor() resolves or rejects when slot a's container exits; while a session is wanted on it that is a death. */
  watch() {
    if (this.watching || !this.c) return;
    this.watching = true;
    const bootAt = Date.now();
    const gone = (why) => (this.retrying || this.handing || this.activeK === 'b' ? null : this.died(this.killing ? 'killed on purpose' : why, bootAt));
    this.c.monitor()
      .then(() => gone('the container exited'))
      .catch((e) => gone(`the container failed: ${String(e?.message || e).slice(0, 160)}`))
      .finally(() => { this.watching = false; this.killing = false; });
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

  /** Boots if needed and hands the container the queue, resuming the file, second and scene progress last saw. */
  async bring(why) {
    const want = await this.st.get('want');
    if (!want) return;
    const k = await this.key();
    await this.up(k);
    const t = targets(this.env)[want.target], p = await this.st.get('progress');
    // after a death the life goes on from the scene it was in, not at the wall: the sound in between is lost
    const { queue, resume } = continueFrom(want.queue, p?.handoff ? { ...p.handoff, wall: null } : null);
    const votesAt = Date.now();
    await this.cpost('/play', { queue, target: t, resume, ...(await this.mixBody(votesAt)) }, k);
    await this.st.put('want', { ...want, votesAt });
    this.say(`${why}: container playing${resume ? ` from scene ${resume.si} in ${resume.title} at ${Math.round(resume.pos)} s` : ''}`);
    // the gap: from the death being dated to the source being on air again
    for (let i = 0; i < 40; i++) {
      const s = await this.cstatus(k);
      if (s?.onAir) {
        const deaths = (await this.st.get('deaths')) || [], d = deaths.at(-1);
        if (d && !d.back) { d.back = iso(Date.now()); d.gapS = +((Date.now() - d.t) / 1000).toFixed(1); await this.st.put('deaths', deaths); this.say(`back on air ${d.gapS} s after the death`); }
        break;
      }
      await sleep(500);
    }
  }

  /**
   * A twin on the new code continues the station where it is (file, second, scene, at the wall), takes the
   * listeners or the mount, then the old one stops. False: wait for a dwell. why: lessons/workers-cast.md#handover
   */
  async handover() {
    const t = targets(this.env)[this.name], fromK = await this.key(), toK = other(fromK), to = this.slot(toK);
    let h = (await this.cstatus(fromK))?.handoff;
    // a twin left running holds whatever code it booted with: start it again
    if (!this.handing && await to.running()) { await to.destroy().catch(() => {}); await sleep(1500); }
    if (!h) { this.say('handover: the station gave no handoff, refreshing it the old way'); await this.refresh(); return true; }
    if (h.safeS < HANDOVER_SAFE_S) { this.say(`handover waits for a dwell: ${h.safeS} s before the blend`); return false; }
    this.handing = true;
    const rec = { at: iso(Date.now()), from: fromK, to: toK, scene: h.si, file: h.title, local: !!t.local };
    const t0 = Date.now();
    try {
      this.say(`new code deployed: handing ${fromK} over to a twin in ${toK}`);
      const boot = await this.up(toK);
      rec.bootMs = Date.now() - t0;
      // a fresh look at the station, now that the twin can take it
      h = (await this.cstatus(fromK))?.handoff;
      if (!h || h.safeS < HANDOVER_MIN_S) throw new Error(`the blend is ${h?.safeS ?? '?'} s away: next sweep`);
      const want = await this.st.get('want');
      const { queue, resume } = continueFrom(want.queue, h);
      await this.cpost('/play', { queue, target: t, resume, hold: !t.local, mode: 'live', life: { seed: want.seed ?? 1, votes: await this.votes(want.votesAt) } }, toK);
      let tw = null;
      // its chain, then align() and settle(): about 10 s here
      for (let i = 0; i < 160; i++) {
        tw = await this.cstatus(toK);
        if (tw?.mix?.aligned && (t.local ? tw.onAir : tw.mix.held) && tw.handoff) break;
        tw = null; await sleep(250);
      }
      if (!tw) throw new Error('the twin did not line up in 40 s');
      rec.alignErrMs = tw.mix.align?.errMs ?? null; rec.settled = tw.mix.align?.settled ?? null;
      rec.sameScene = tw.handoff.si === h.si && JSON.stringify(tw.handoff.def) === JSON.stringify(h.def);
      if (t.local) {
        await this.setActive(toK);
        const sp = await this.spliceAll(toK);
        rec.listeners = sp.length; rec.spliced = sp.filter((x) => x.ok).length;
        rec.splices = sp.slice(0, 4).map(({ ok, why, dropped, waitedMs }) => ({ ok, why, dropped, waitedMs }));
      } else {
        // one source per mount: the old lets go, the held twin takes it, retrying every 100 ms
        const g0 = Date.now();
        await this.cpost('/stop', {}, fromK).catch(() => {});
        await this.cpost('/go', {}, toK);
        await this.setActive(toK);
        for (let i = 0; i < 100; i++) { const s = await this.cstatus(toK); if (s?.onAir) { rec.goMs = s.mix?.goMs ?? Date.now() - g0; break; } await sleep(100); }
      }
      await this.st.put('boot', { ...boot, slot: toK });
      await this.cpost('/stop', {}, fromK).catch(() => {});
      await this.slot(fromK).destroy().catch(() => {});
      rec.overlapS = +((Date.now() - t0) / 1000).toFixed(1);
      this.handovers = 0;
      this.say(`handed over to ${toK}: two containers for ${rec.overlapS} s, ${t.local ? `${rec.spliced} of ${rec.listeners} listeners moved` : `the mount taken in ${rec.goMs} ms`}`);
    } catch (e) {
      rec.failed = e.message;
      this.say(`handover failed: ${e.message}; ${fromK} plays on`);
      if ((await this.key()) === fromK) await to.destroy().catch(() => {});
      this.failedHandovers = (this.failedHandovers || 0) + 1;
    } finally {
      this.handing = false;
      const list = (await this.st.get('handovers')) || [];
      list.push(rec); while (list.length > DEATHS_KEEP) list.shift();
      await this.st.put('handovers', list);
    }
    return !rec.failed;
  }

  /** The old refresh: destroy, boot again and resume. A handover that cannot happen falls back to it. */
  async refresh() {
    this.killing = true;
    await this.slot(await this.key()).destroy().catch(() => {});
    await sleep(1500);
    await this.bring('refreshed onto the new code');
  }

  async alarm() {
    let soon = false;
    try {
      const want = await this.st.get('want');
      if (!want) { for (const k of ['a', 'b']) if (await this.running(k)) await this.slot(k).destroy().catch(() => {}); return; }
      this.name ||= want.target;
      // the cap holds across a restarted object and container: until is in storage
      if (Date.now() >= (want.until ?? want.startedAt + CAP_MS)) return await this.stop('stopped at the cap');
      if (!targets(this.env)[want.target]) return await this.stop(`no station ${want.target}`);
      const boot = await this.st.get('boot'), k = await this.key(), sl = this.slot(k);
      if (!(await sl.running())) {
        await this.died('found not running');
        await this.bring('restart');
      } else if (boot && newCode(boot, this.env)) {
        // a deploy since this container booted: a twin on the new code takes over. why: lessons/workers-cast.md#handover
        if ((this.failedHandovers || 0) >= HANDOVER_TRIES) { this.failedHandovers = 0; this.say(`${HANDOVER_TRIES} handovers failed: refreshing the old way`); await this.refresh(); }
        else soon = !(await this.handover());
      } else {
        if (k === 'a') this.watch();
        try { await sl.idle(); } catch { /* the constructor set it */ }
        // a twin a failed handover left behind
        if (!this.handing && await this.running(other(k))) await this.slot(other(k)).destroy().catch(() => {});
        const s = await this.cstatus(k);
        if (!s) {
          if (++this.misses >= 2) { this.misses = 0; await this.died('status unreachable twice'); await sl.destroy().catch(() => {}); await this.bring('restart'); }
        } else if (!s.playing) {
          this.misses = 0;
          // the process restarted under us, or the session ended inside it
          if (boot && s.bootedAt > boot.at + 60_000) await this.died('the container restarted on its own');
          await this.bring('resume');
        } else {
          this.misses = 0;
          await this.st.put('progress', { at: iso(Date.now()), t: Date.now(), onAir: s.onAir, seconds: s.seconds, wall: s.wall,
            sessionS: Math.round((Date.now() - want.startedAt) / 1000), files: s.files, lag: s.lag, down: s.down,
            sinkDeaths: s.sinkDeaths, index: s.index, now: s.now, bytes: s.bytes, rss: s.rss, handoff: s.handoff || null });
          await this.freshTick(want, s.now?.id).catch((e) => this.say(`feed check: ${e.message}`));
        }
      }
    } catch (e) { this.say(`sweep: ${e.message}`); }
    finally {
      const w = await this.st.get('want');
      // waiting for a dwell to hand over in: look again in a few seconds rather than at the next sweep
      if (w) await this.st.setAlarm(Math.max(Date.now() + 1000, Math.min(Date.now() + (soon ? HANDOVER_RETRY_MS : ALARM_MS), w.until ?? w.startedAt + CAP_MS)));
      this.push();
    }
  }
}

/**
 * The queue rotated to start at the file on air, and `resume` the handoff; a file no longer queued keeps only
 * the life's scene. why: lessons/workers-cast.md#handover
 */
export function continueFrom(queue, h) {
  if (!h) return { queue, resume: null };
  const i = queue.findIndex((x) => String(x.id) === String(h.id));
  const { def, phase, safeS, seed, ...r } = h;
  if (i < 0) return { queue, resume: { si: r.si, hist: r.hist, inst: r.inst } };
  return { queue: [...queue.slice(i), ...queue.slice(0, i)], resume: r };
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
