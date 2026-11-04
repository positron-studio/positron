// v2in-gate: option B's raid gate, one Durable Object on a 1 s alarm running core/gate.mjs and core/layers.mjs
// unchanged. The layers file is bundled at deploy (a/config/layers.txt) and stays the default until a PUT replaces it
// in the object's storage. The same answers as A's gate (a/conductor/gate.mjs), show keys and the log included:
//   GET  /state         { state, since, silent, channels, on, oneshots, switches, live, kicked, sim, rev, inputs }
//   GET  /layers        the layers file as text
//   GET  /layers.json   { rev, channels } the parsed file, which v2in-cast reads when `rev` changes
// Admin, Authorization: Bearer <ADMIN_TOKEN> (a Worker secret):
//   POST /admin/sim     {"raid": bool} | {"auto": {"every": s, "length": s} | null}, as tools/raid.mjs sends
//   POST /admin/switch  {name, on}: a switch:<name> layer on or off, kept in the object's storage
//   DELETE /admin/switch/<name>   forgets a switch set by hand (one the layers name stays, off)
//   PUT  /admin/layers  the layers file (text/plain), parsed with core/layers.mjs, refused with its errors if broken
//   DELETE /admin/layers  back to the bundled file
//   GET  /admin/keys    every key, its state and use, never the key itself
//   POST /admin/keys {channel, title, artist?, description?, window_start?, window_end?}   -> { id, key } once
//   POST /admin/keys/<id>/revoke | /kick | /rotate
//   POST /admin/clear {"days": 90}   removes keys revoked or expired that long ago; the log stays
//   GET  /admin/attempts?limit=100
// Who may go live: core/shows.mjs's rules, as in A; only a key's hash is kept, in the object's SQLite. v2in-cast asks
// through the named entrypoint `Live` (a service binding only, never public): publish when OBS posts to /whip/<channel>,
// beat every second while the show is on (false once it was kicked or taken over), done when it ends. A show whose cast
// object stops beating for LOST_MS is taken off as lost, so a reset cast object cannot hold a channel.
// When a raid ends it picks one ALL CLEAR file at random from R2 cast/<playlist>/index.json, the same for every
// channel; each oneshot also carries `at` (ms) and the file's artist, title and seconds, so a channel that starts
// listening mid-piece can join it there.
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { initial, step, isSilent } from '../../../core/gate.mjs';
import { parse, whenOn, oneshots } from '../../../core/layers.mjs';
import { newKey, hashKey, stateOf, mayPublish } from '../../../core/shows.mjs';
import LAYERS from '../../../a/config/layers.txt';

const TICK_MS = 1000, TZ = 'Europe/Tallinn', LOST_MS = 30_000, KICK_MS = 5000;
if (parse(LAYERS).errors.length) throw new Error(`a/config/layers.txt: ${parse(LAYERS).errors.join('; ')}`);
// a short tag for the file's content: v2in-cast refetches /layers.json when it changes
const revOf = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7).toString(36).replace('-', 'n');

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-max-age': '86400' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
const text = (t) => new Response(t, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...CORS } });
const body = async (req) => { try { return await req.json(); } catch { return null; } };
const time = (v) => (v == null || v === '' ? null : typeof v === 'number' ? v : Date.parse(v) || null);

export class Gate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // the same tables as A's gate.sqlite
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS shows (
        id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT UNIQUE NOT NULL, channel TEXT NOT NULL, title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
        window_start INTEGER, window_end INTEGER, created_at INTEGER NOT NULL,
        revoked_at INTEGER, revoked_why TEXT, uses INTEGER NOT NULL DEFAULT 0, last_used INTEGER);
      CREATE TABLE IF NOT EXISTS attempts (
        id INTEGER PRIMARY KEY, at INTEGER NOT NULL, show_id INTEGER, channel TEXT, via TEXT, addr TEXT,
        ok INTEGER NOT NULL, reason TEXT NOT NULL);`);
    this.loaded = ctx.blockConcurrencyWhile(async () => {
      const s = await ctx.storage.get(['gate', 'sim', 'shots', 'layers', 'switches', 'live']);
      this.live = new Map(s.get('live') || []);   // channel -> { show, via, since, beat }
      // beats are kept in memory only: a gate that restarts (a deploy) gives each show a fresh LOST_MS to beat again
      for (const l of this.live.values()) l.beat = Date.now();
      this.kicked = new Map();                     // channel -> until (ms), for /state as A has it
      this.gate = s.get('gate') || initial(Date.now());
      this.sim = s.get('sim') || { raid: false, auto: null, autoFrom: Date.now() };
      this.shots = new Map(s.get('shots') || []);
      this.set = s.get('switches') || {};   // switches set by hand: name -> bool
      this.use(s.get('layers') || LAYERS);
      this.saved = '';
    });
  }

  /** The layers file in force: the bundled one until a PUT stored another. */
  use(t) {
    this.text = t; this.config = parse(t); this.rev = revOf(t);
    for (const k of oneshots(this.config)) if (!this.shots.has(k)) this.shots.set(k, { seq: 0, file: '' });
  }

  /** Every switch: those the layers name (off until set) and those set by hand, as A lists them. */
  switches() {
    const named = this.config.channels.flatMap((c) => c.layers.filter((l) => l.when.startsWith('switch:')).map((l) => [l.when.slice(7), false]));
    return { ...Object.fromEntries(named), ...this.set };
  }

  simRaid(now) {
    const s = this.sim;
    return s.auto ? ((now - s.autoFrom) / 1000) % s.auto.every < s.auto.length : s.raid;
  }

  async pick(playlist) {
    const o = await this.env.MEDIA.get(`cast/${playlist}/index.json`);
    const files = o ? (await o.json()).files : [];
    const f = files[Math.floor(Math.random() * files.length)];
    return f ? { file: f.key, artist: f.artist, title: f.title, seconds: f.seconds } : { file: '' };
  }

  async tick() {
    const now = Date.now(), prev = this.gate;
    this.gate = step(prev, { sim: { raid: this.simRaid(now), at: now } }, now);
    if (this.gate.ended > prev.ended) {
      for (const [k, v] of this.shots) {
        if (k.startsWith('kyiv-alert|')) this.shots.set(k, { seq: v.seq + 1, at: now, ...(await this.pick(k.split('|')[1])) });
      }
    }
    if (this.gate.state !== prev.state) console.log(new Date(now).toISOString(), prev.state, '->', this.gate.state);
    for (const [channel, l] of this.live) if (now - l.beat > LOST_MS) await this.off(channel, 'lost');
    // storage only when something a restart must keep has changed, not every second of a raid
    const keep = JSON.stringify([this.gate.state, this.gate.ended, this.sim, [...this.shots]]);
    if (keep !== this.saved || now - (this.savedAt || 0) > 60_000) {
      await this.ctx.storage.put({ gate: this.gate, sim: this.sim, shots: [...this.shots] });
      this.saved = keep; this.savedAt = now;
    }
  }

  state() {
    const g = this.gate, since = new Date(g.since).toISOString();
    const on = whenOn(this.config, { signals: { 'kyiv-alert': isSilent(g) }, switches: this.switches(), tz: TZ }).map(({ channel, i }) => {
      const l = this.config.channels.find((c) => c.id === channel).layers[i];
      const title = l.kind !== 'silence' ? '' : l.when === 'kyiv-alert' ? `Air raid alert, silence since ${since.slice(11, 16)} UTC` : (l.arg || 'Silence');
      return { channel, i, title };
    });
    return { state: g.state, since, silent: isSilent(g), channels: this.config.channels.map((c) => c.id), on,
      oneshots: [...this.shots].map(([key, v]) => ({ key, ...v })), switches: this.switches(),
      live: [...this.live].map(([channel, l]) => ({ channel, id: l.show.id, title: l.show.title, artist: l.show.artist, via: l.via, since: new Date(l.since).toISOString() })),
      kicked: [...this.kicked].filter(([, t]) => t > Date.now()).map(([c]) => c), sim: this.sim, rev: this.rev,
      inputs: ['whip'] };   // how a show goes live here: the admin page prints OBS's WHIP settings by it
  }

  // ── who may go live, as a/conductor/gate.mjs decides it ────────────────────────────────────────────────────────
  row(id) { return this.sql.exec('SELECT * FROM shows WHERE id = ?', id).toArray()[0] || null; }
  log(show_id, channel, via, addr, ok, reason) {
    this.sql.exec('INSERT INTO attempts (at, show_id, channel, via, addr, ok, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      Date.now(), show_id ?? null, channel ?? '', via ?? '', addr || '', ok ? 1 : 0, reason);
  }
  saveLive() { return this.ctx.storage.put('live', [...this.live]); }
  pub(s) {
    return { id: s.id, channel: s.channel, title: s.title, artist: s.artist, description: s.description,
      window_start: s.window_start, window_end: s.window_end, created_at: s.created_at, state: stateOf(s, Date.now()),
      revoked_at: s.revoked_at, revoked_why: s.revoked_why, uses: s.uses, last_used: s.last_used,
      on_air: [...this.live.values()].some((l) => l.show.id === s.id) };
  }
  async create(j) {
    if (!this.config.channels.some((c) => c.id === j?.channel) || !j.title) return null;
    const key = newKey();
    const id = this.sql.exec(`INSERT INTO shows (hash, channel, title, artist, description, window_start, window_end, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, await hashKey(key), j.channel, String(j.title), String(j.artist || ''),
      String(j.description || ''), time(j.window_start), time(j.window_end), Date.now()).one().id;
    return { id, key };
  }
  revoke(id, why) { this.sql.exec('UPDATE shows SET revoked_at = ?, revoked_why = ? WHERE id = ? AND revoked_at IS NULL', Date.now(), why, id); }

  /** Ends whatever is live on `channel`: the cast object hears it at its next beat and closes the input. */
  async off(channel, why) {
    const cur = this.live.get(channel);
    if (!cur) return false;
    this.live.delete(channel);
    if (why !== 'ended') this.kicked.set(channel, Date.now() + KICK_MS);
    this.log(cur.show.id, channel, cur.via, '', 1, why);
    console.log('live off', channel, why, `#${cur.show.id}`);
    await this.saveLive();
    return true;
  }

  /** RPC from v2in-cast: may this key go live on `channel` now? Logged either way, with the reason. */
  async publish({ channel, key, via = 'whip', addr = '' }) {
    await this.loaded;
    const now = Date.now();
    const show = key ? this.sql.exec('SELECT * FROM shows WHERE hash = ?', await hashKey(key)).toArray()[0] || null : null;
    const holder = this.live.get(channel)?.show || null;
    const d = this.config.channels.some((c) => c.id === channel) ? mayPublish(show, channel, now, holder) : { ok: false, reason: 'no such channel' };
    this.log(show?.id, channel, via, addr, d.ok, d.reason);
    console.log(d.ok ? 'live on' : 'refused', channel, via, d.reason, show ? `#${show.id} ${show.title}` : '');
    if (!d.ok) return { ok: false, reason: d.reason };
    if (d.takeover) await this.off(channel, 'taken over');
    if (d.reason !== 'reconnect') this.sql.exec('UPDATE shows SET uses = uses + 1, last_used = ? WHERE id = ?', now, show.id);
    this.live.set(channel, { show: { id: show.id, title: show.title, artist: show.artist }, via, since: this.live.get(channel)?.since ?? now, beat: now });
    this.kicked.delete(channel);
    await this.saveLive();
    return { ok: true, reason: d.reason, show: { id: show.id, title: show.title, artist: show.artist } };
  }
  /** RPC: the cast object is still playing show `id` on `channel`; false when the gate has taken it off. */
  async beat({ channel, id }) {
    await this.loaded;
    const cur = this.live.get(channel);
    if (!cur || cur.show.id !== id) return false;
    cur.beat = Date.now();
    return true;
  }
  /** RPC: the show's input ended (OBS stopped, or its connection did not come back). */
  async done({ channel, id, why = 'ended' }) {
    await this.loaded;
    if (this.live.get(channel)?.show.id !== id) return false;
    return this.off(channel, why);
  }

  async fetch(req) {
    await this.loaded;
    if (!(await this.ctx.storage.getAlarm())) { await this.tick(); await this.ctx.storage.setAlarm(Date.now() + TICK_MS); }
    const path = new URL(req.url).pathname, m = req.method;
    if (m === 'GET' && path === '/state') return json(this.state());
    if (m === 'GET' && path === '/layers') return text(this.text);
    if (m === 'GET' && path === '/layers.json') return json({ rev: this.rev, channels: this.config.channels });
    // the worker below lets /admin/* through only with the token
    if (m === 'POST' && path === '/admin/sim') {
      const j = await body(req);
      if (!j) return json({ error: 'JSON body' }, 400);
      if ('raid' in j) this.sim = { ...this.sim, raid: !!j.raid, auto: null };
      if ('auto' in j) this.sim = { ...this.sim, auto: j.auto ? { every: Number(j.auto.every), length: Number(j.auto.length) } : null, autoFrom: Date.now() };
      await this.tick();
      return json(this.state());
    }
    const del = /^\/admin\/switch\/([a-z0-9-]+)$/.exec(path);
    if (m === 'DELETE' && del) {
      const { [del[1]]: _, ...rest } = this.set;
      this.set = rest;
      await this.ctx.storage.put('switches', this.set);
      return json(this.switches());
    }
    if (m === 'POST' && path === '/admin/switch') {
      const j = await body(req);
      if (!/^[a-z0-9-]+$/.test(j?.name || '')) return json({ error: 'name' }, 400);
      this.set = { ...this.set, [j.name]: !!j.on };
      await this.ctx.storage.put('switches', this.set);
      return json(this.switches());
    }
    if (m === 'PUT' && path === '/admin/layers') {
      const t = await req.text(), { errors } = parse(t);
      if (errors.length) return json({ error: `The layers file has ${errors.length} error${errors.length > 1 ? 's' : ''}: ${errors.join('; ')}`, errors }, 400);
      this.use(t);
      await this.ctx.storage.put({ layers: t, shots: [...this.shots] });
      console.log(new Date().toISOString(), 'layers', this.rev);
      return json({ rev: this.rev, channels: this.config.channels });
    }
    if (m === 'DELETE' && path === '/admin/layers') {   // back to the bundled file
      await this.ctx.storage.delete('layers');
      this.use(LAYERS);
      return json({ rev: this.rev, channels: this.config.channels });
    }
    if (m === 'GET' && path === '/admin/keys') return json(this.sql.exec('SELECT * FROM shows ORDER BY id DESC').toArray().map((s) => this.pub(s)));
    if (m === 'GET' && path === '/admin/attempts') {
      const limit = Math.min(1000, Number(new URL(req.url).searchParams.get('limit') || 100) || 100);
      return json(this.sql.exec('SELECT * FROM attempts ORDER BY id DESC LIMIT ?', limit).toArray());
    }
    if (m === 'POST' && path === '/admin/keys') {
      const made = await this.create(await body(req));
      return made ? json(made, 201) : json({ error: 'channel and title' }, 400);
    }
    if (m === 'POST' && path === '/admin/clear') {
      const days = Number((await body(req))?.days ?? 90), before = Date.now() - days * 86400_000;
      const where = 'WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR (window_end IS NOT NULL AND window_end < ?)';
      const removed = this.sql.exec(`SELECT COUNT(*) AS n FROM shows ${where}`, before, before).one().n;
      this.sql.exec(`DELETE FROM shows ${where}`, before, before);
      return json({ removed });
    }
    const k = /^\/admin\/keys\/(\d+)\/(revoke|kick|rotate)$/.exec(path);
    if (m === 'POST' && k) {
      const s = this.row(Number(k[1]));
      if (!s) return json({ error: 'no such key' }, 404);
      const on = [...this.live].find(([, l]) => l.show.id === s.id);
      if (k[2] === 'revoke') { this.revoke(s.id, 'revoked'); return json(this.pub(this.row(s.id))); }
      if (k[2] === 'kick') {
        this.revoke(s.id, 'kicked');
        const dropped = on ? await this.off(on[0], 'kicked') : false;
        return json({ ...this.pub(this.row(s.id)), dropped });
      }
      this.revoke(s.id, 'rotated');
      return json(await this.create(s), 201);
    }
    return json({ error: 'GET /state, /layers, /layers.json; /admin/*: sim, switch, layers, keys, clear, attempts' }, 404);
  }

  async alarm() {
    await this.loaded;
    await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    await this.tick();
  }
}

/** v2in-cast's way in (a service binding with "entrypoint": "Live"); a named entrypoint is never public. */
export class Live extends WorkerEntrypoint {
  gate() { return this.env.GATE.get(this.env.GATE.idFromName('kyiv')); }
  publish(a) { return this.gate().publish(a); }
  beat(a) { return this.gate().beat(a); }
  done(a) { return this.gate().done(a); }
}

export default {
  fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (new URL(req.url).pathname.startsWith('/admin/') && (!env.ADMIN_TOKEN || req.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`))
      return json({ error: 'admin token' }, 401);
    return env.GATE.get(env.GATE.idFromName('kyiv')).fetch(req);
  },
};
