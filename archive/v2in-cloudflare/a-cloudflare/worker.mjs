// v2in-a: option A's one container (a/Dockerfile) on Cloudflare Containers, at https://a.v2in.positron.studio.
// One Durable Object, Station "a", owns one container: it starts it, keeps it awake with an alarm every 30 s, starts it
// again when it dies, and forwards every request to it:
//   PUT /<channel>       an Icecast source (BUTT, the VÄIN app, ffmpeg) to Liquidsoap's harbor, port 8005
//   GET /live/<channel>  a WebSocket from web/live.html, passed through as an upgrade to nginx, which hands it to the
//                        harbor: the one live input that works here, since Cloudflare holds a PUT's body to its end
//   everything else      nginx, port 8088: the player at /, admin.html, /stream/<channel>, /state, /admin/*
// The container's boot (a/conductor/boot.mjs) asks http://v2in.boot/, which never leaves Cloudflare: the Station
// intercepts that host for its container and the Boot entrypoint answers from R2 (the container has no Internet):
//   GET /_boot/list?prefix=   the keys under a prefix of R2 v2in-media
//   GET /_boot/media/<key>    one file of v2in-media
//   GET /_boot/db             the gate's last database snapshot (R2 v2in-media/a-state/gate.sqlite), 404 if none
// Admin token: GET /_ops/status (the container's state, the Station's last log lines), POST /_ops/stop (copies the
// database out, stops the container and the alarm; every other request answers 503 until) POST /_ops/start.
// The gate's database is copied out every minute (GET /admin/db in the container) and restored on the next start;
// recordings and the raid simulator's state are lost on a restart. RTMP cannot reach a Worker (raw TCP).
// A live WebSocket passes through the Station, so a deploy that resets it ends the show: web/live.html then reconnects.
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

// standard-1: half a vCPU, 4 GiB, 8 GB. The durable_object policy offers no `basic` (a quarter vCPU), a custom size
// starts at 1 vCPU and 3 GiB, and lite (1/16 vCPU) cannot hold three channels. Measured locally: 0.15 to 0.3 of a core.
const INSTANCE = 'standard-1';
const ALARM_MS = 30_000, IDLE_MS = 15 * 60_000, READY_MS = 240_000;
const DB_KEY = 'a-state/gate.sqlite';
const LOG_KEEP = 40;

const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const admin = (req, env) => !!env.ADMIN_TOKEN && req.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
/** A container call that may never settle (a port not yet open, a container still being placed) ends after `ms`. */
const within = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(`${what}: no answer in ${ms / 1000} s`); })]);

async function boot(env, u) {
  if (u.pathname === '/_boot/list') {
    const prefix = u.searchParams.get('prefix') || '';
    const keys = [];
    let cursor;
    do {
      const l = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
      keys.push(...l.objects.map((o) => o.key));
      cursor = l.truncated ? l.cursor : undefined;
    } while (cursor);
    return json({ keys });
  }
  const key = u.pathname === '/_boot/db' ? DB_KEY : decodeURIComponent(u.pathname.slice('/_boot/media/'.length));
  const o = await env.MEDIA.get(key);
  if (!o) return json({ error: 'not found' }, 404);
  return new Response(o.body, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(o.size) } });
}

/** What the container's http://v2in.boot/ reaches (Station.start intercepts it). */
export class Boot extends WorkerEntrypoint {
  fetch(req) { return boot(this.env, new URL(req.url)); }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    return env.STATION.get(env.STATION.idFromName('a')).fetch(req);
  },
};

export class Station extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = false;
    this.watching = false;
    // a restarted object (a deploy) starts without an inactivity timeout: set it again, and watch the container
    if (ctx.container?.running) {
      ctx.blockConcurrencyWhile(() => within(ctx.container.setInactivityTimeout(IDLE_MS), 10_000, 'setInactivityTimeout').catch(() => {}));
      this.watch();
    }
  }
  get c() { return this.ctx.container; }

  async say(line) {
    console.log(line);
    const log = (await this.ctx.storage.get('log')) || [];
    log.push(`${new Date().toISOString().slice(0, 19)}Z ${line}`);
    await this.ctx.storage.put('log', log.slice(-LOG_KEEP));
  }

  start(why) {
    const e = this.env;
    console.log(`starting (${why}), image ${this.c.images?.a}`);
    this.c.start({
      image: this.c.images.a, instance: INSTANCE, enableInternet: false,
      env: { ICECAST_SOURCE_PASSWORD: e.ICECAST_SOURCE_PASSWORD, ICECAST_ADMIN_PASSWORD: e.ICECAST_ADMIN_PASSWORD,
        HARBOR_PASSWORD: e.HARBOR_PASSWORD, ADMIN_TOKEN: e.ADMIN_TOKEN, BOOT_URL: e.BOOT_URL, MEDIA_MAP: e.MEDIA_MAP,
        CONFIG_DIR: '/app/a/config' },
    });
    this.ready = false;
    this.watch();
    this.ctx.storage.put('startedImage', String(this.c.images.a));
    // resolves once the container is placed, which can take a minute or two; boot.mjs keeps asking until then
    this.ctx.waitUntil(within(this.c.interceptOutboundHttp('v2in.boot', this.ctx.exports.Boot({ props: {} })), 300_000, 'intercept v2in.boot')
      .then(() => this.say('v2in.boot intercepted'), (err) => this.say(err.message)));
    return this.say(`container started (${why}), image ${String(this.c.images.a).slice(-20)}`);
  }

  /** monitor() settles when the container exits: log it and let the alarm start it again in a second. */
  watch() {
    if (this.watching) return;
    this.watching = true;
    this.ctx.waitUntil(this.c.monitor()
      .then(() => 'exited', (err) => `failed: ${String(err?.message || err).slice(0, 200)}`)
      .then(async (how) => {
        this.ready = false;
        await this.say(`container ${how}`);
        if (!(await this.ctx.storage.get('stopped'))) await this.ctx.storage.setAlarm(Date.now() + 1000);
      })
      .finally(() => { this.watching = false; }));
  }

  /** Running and answering on 8088 (nginx, with the gate behind /state); one wait shared by every request. */
  async ensure() {
    if (!this.c.running) await this.start('a request');
    // it answers only once the container is placed; never wait on it here
    this.ctx.waitUntil(within(this.c.setInactivityTimeout(IDLE_MS), 300_000, 'setInactivityTimeout').catch(() => {}));
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    if (this.ready) return;
    this.waiting ??= (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < READY_MS && this.c.running) {
        try {
          const r = await within(this.c.getTcpPort(8088).fetch('http://c/state'), 3000, 'port 8088');
          await r.body?.cancel();
          if (r.ok) { this.ready = true; await this.say(`ready after ${((Date.now() - t0) / 1000).toFixed(1)} s of waiting`); return; }
        } catch { /* not yet */ }
        await sleep(1000);
      }
      throw new Error(this.c.running ? 'the container did not answer on 8088' : 'the container stopped while starting');
    })().finally(() => { this.waiting = null; });
    return this.waiting;
  }

  async fetch(req) {
    const u = new URL(req.url);
    if (req.method === 'POST' && (u.pathname === '/_ops/stop' || u.pathname === '/_ops/start')) {
      if (!admin(req, this.env)) return json({ error: 'admin token' }, 401);
      if (u.pathname === '/_ops/start') {
        await this.ctx.storage.delete('stopped');
        await this.say('start asked');
        try { await this.ensure(); } catch (e) { return json({ error: e.message }, 503); }
        return json({ running: true });
      }
      await this.ctx.storage.put('stopped', true);
      if (this.ready) await this.snapshot();
      await this.ctx.storage.deleteAlarm();
      await this.say('stop asked');
      if (this.c.running) await within(this.c.destroy(), 30_000, 'destroy').catch(() => {});
      return json({ running: this.c.running });
    }
    if (await this.ctx.storage.get('stopped') && u.pathname !== '/_ops/status') return json({ error: 'stopped: POST /_ops/start with the admin token' }, 503);
    if (u.pathname === '/_ops/status') {
      if (!admin(req, this.env)) return json({ error: 'admin token' }, 401);
      let info = null;
      try { info = this.c.running ? await within(this.c.inspect(), 3000, 'inspect') : null; } catch (e) { info = { error: e.message }; }
      return json({ stopped: !!(await this.ctx.storage.get('stopped')), running: this.c.running, ready: this.ready, instance: INSTANCE, image: this.c.images.a, info,
        alarm: await this.ctx.storage.getAlarm(), db: await this.ctx.storage.get('dbAt'), log: await this.ctx.storage.get('log') });
    }
    try { await this.ensure(); } catch (e) { return json({ error: e.message }, 503); }
    // an Icecast source's PUT goes to the harbor (mount = channel, password = show key); the rest to nginx
    const port = req.method === 'PUT' || req.method === 'SOURCE' ? 8005 : 8088;
    const headers = new Headers(req.headers);
    headers.delete('host');
    const init = { method: req.method, headers, redirect: 'manual' };
    if (req.method !== 'GET' && req.method !== 'HEAD') init.body = req.body;
    try {
      // a WebSocket goes through with its own request, so the upgrade reaches nginx and the 101 comes back with its socket
      if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') return await this.c.getTcpPort(8088).fetch(`http://c${u.pathname}`, req);
      return await this.c.getTcpPort(port).fetch(`http://c${u.pathname}${u.search}`, init);
    } catch (e) {
      return json({ error: `the container: ${e.message}` }, 502);
    }
  }

  /** Every 30 s: start a dead container, take a new image, and copy the gate's database out when it changed. */
  async alarm() {
    if (await this.ctx.storage.get('stopped')) return;
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    if (!this.c.running) await this.start('the alarm found it stopped');
    this.ctx.waitUntil(within(this.c.setInactivityTimeout(IDLE_MS), 25_000, 'setInactivityTimeout').catch(() => {}));
    this.watch();
    if (!this.ready) { try { await this.ensure(); } catch (e) { await this.say(e.message); return; } }
    // the image this container was started with, as this code knew it; a deploy that changed the image changes images.a
    const image = await this.ctx.storage.get('startedImage');
    if (this.ready) await this.snapshot();
    if (image && image !== String(this.c.images.a)) {
      await this.say(`a new image was deployed: restarting (listeners drop)`);
      await this.c.destroy().catch(() => {});
      return;   // monitor() sees the exit and the next alarm starts the new image
    }
  }

  async snapshot() {
    try {
      const r = await within(this.c.getTcpPort(8080).fetch('http://c/admin/db', { headers: { authorization: `Bearer ${this.env.ADMIN_TOKEN}` } }), 5000, 'the db copy');
      if (!r.ok) { await r.body?.cancel(); return; }
      const bytes = await r.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
      if (hash === (await this.ctx.storage.get('dbHash'))) return;
      await this.env.MEDIA.put(DB_KEY, bytes);
      await this.ctx.storage.put({ dbHash: hash, dbAt: new Date().toISOString() });
      await this.say(`gate database copied to R2, ${bytes.byteLength} bytes`);
    } catch (e) { console.log(`snapshot: ${e.message}`); }
  }
}
