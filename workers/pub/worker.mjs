// positron-pub: /stage/'s film, the /video/ loopbacks, /ice TURN credentials and device logs.
// Viewers are reference counted, not left to sleepAfter: ffmpeg publishing makes no requests.
// why: lessons/workers-pub.md#header

import { iceVerdict } from './ice-limit.mjs';
import { Container, getContainer } from '@cloudflare/containers';
import { DurableObject } from 'cloudflare:workers';
import { json, OPEN, keyMatches } from '../_lib/http.mjs';
import { LOOP_CLEAN_MS, LOOP_OLD_MS, loopCeil, loopReady, storage, loopVideos, lifecycle, clean } from './loop.mjs';

const SWEEP_MS = 30_000;   // alarm cadence
const WHIP_PER_HOUR = 20;  // browser publishes allowed per hour, DO-counted
// Relay credentials an hour: 120 overall, 20 per address, or per room with ?room=. ice-limit.mjs.
const ICE_TTL_S = 4 * 3600;      // longer than a camera is left on; a credential cannot be refreshed mid-call here
const GRACE_TICKS = 2;     // ~60 s of nobody watching before we stop
// The main instance publishes nothing: it holds the device log and the /ice rate limits.
// why: lessons/workers-pub.md#main
const NAME = 'p1';
// /stage/'S OWN INSTANCE of the same class: the MIM film on its own WebRTC
// input (STAGE_WHIP_URL), WHIP only, no clocks, no RTMPS. Routed by the /stage
// prefix, so the test pattern instance above is untouched.
const STAGE = 'stage';
const STAGE_PATHS = new Set(['/watch', '/status', '/start', '/stop']);
// The main instance's routes, and the retired ones that answer 410.
// why: lessons/workers-pub.md#main-paths
const MAIN_PATHS = new Set(['/ice', '/log', '/logs', '/logs/clear']);
// No page calls these; they are the owner's, with `x-pub-key` matching the
// PUB_KEY secret (`wrangler secret put PUB_KEY`). Unset refuses.
const OWNER_PATHS = new Set(['/stage/start', '/stage/stop', '/logs/clear']);
const RETIRED = new Set(['/watch', '/status', '/start', '/stop', '/whip', '/cam', '/cam/status']);
// The camera instance only proxies the WebRTC publish (/cam/whip) onto "positron-cam-whip".
// why: lessons/workers-pub.md#cam
const CAM = 'cam';
// NEXT (PubNext, the durable_object runtime). The instance is pub's custom
// size from wrangler.jsonc, spelled the new API's way (camelCase, in code):
// 1 vCPU, 3 GiB, 2 GB disk. The memory and vCPU coupling noted there applies.
const NEXT_INSTANCE = { vcpu: 1, memoryMib: 3072, diskMb: 2048 };
// The backstop sleepAfter was: how long the container outlives an object that
// has gone quiet. The sweep wakes the object every SWEEP_MS while anybody
// watches, so this only fires when the sweep itself has stopped.
const NEXT_IDLE_MS = 10 * 60_000;
const NEXT_READY_MS = 60_000;
const NEXT_WHIP_SNDBUF = 4 * 1024 * 1024;
const LOG_KEEP = 400;          // ring buffer of device reports
const LOG_MAX_BODY = 2000;     // one report cannot flood the rest out
// How long a WebRTC camera session may hold "positron-cam-whip" before the
// next publish replaces it (a tab that left without its DELETE).
const CAM_MAX_MS = 300_000;
const CAM_IDLE_MS = 5_000;     // no chunk this long and the DO ends a loopback take
const CAM_TICK_MS = 5_000;     // the alarm's cadence while a loopback take is live
// /cam/whip has its own input, one camera at a time; a dead tab's session looks live, so it holds
// for at most CAM_MAX_MS. `loop` is the LL-HLS loopback on its own input: LOOP_MAX_MS caps a take
// at 50 s of RTMPS, LOOP_OPEN_MS a publisher that never opened.
// why: lessons/workers-pub.md#cam-whip-loop
const LOOP = 'loop';
const LOOP_MAX_MS = 50_000;
const LOOP_OPEN_MS = 60_000;
const LOOP_PER_HOUR = 30;
const LOOP_RETRY_MS = 30_000;   // a clean that left something, asked again
const LOOP_TRIES = 6;           // then the cron has it
const LOOP_SWEEP_GAP_MS = 60_000; // the public sweep route, at most this often
const LOOP_STATUS_TTL_MS = 5_000; // /loop/status asks Stream at most this often
const CAM_WHIP_MISSING = 'the camera WebRTC input is not provisioned: the owner runs src/provision-cam-whip.sh, which stores CAM_WHIP_URL';

// Two runtimes, one body: `Pub` (legacy, `default` policy) and `PubNext` (`durable_object`),
// differing in `#c()` and lines marked NEXT. A policy cannot change in place, so `Pub` stays
// exported and a rollback is redeploying the previous file.
// why: lessons/workers-pub.md#two-runtimes
const pubOn = (Base, NEXT) => class extends Base {
  defaultPort = 8080;
  // A generous backstop only. The sweep below is what actually decides.
  // (Legacy only. NEXT's backstop is NEXT_IDLE_MS through setInactivityTimeout.)
  sleepAfter = '10m';

  // A worker var reaches the container only through `envVars` or `start({ env })`, read at start.
  // why: lessons/workers-pub.md#env
  constructor(ctx, env) {
    super(ctx, env);
    if (!NEXT) return;
    // NEXT only: a 4 MiB UDP send buffer for the WHIP leg, the runtime's wmem_max (measured).
    // why: lessons/workers-pub.md#sndbuf
    this.#pass = { PUB_WHIP_SNDBUF: String(NEXT_WHIP_SNDBUF) };
    // A restarted object has no inactivity timeout, so set it again on every wake; not awaited.
    // why: lessons/workers-pub.md#inactivity
    if (ctx.container?.running) ctx.container.setInactivityTimeout(NEXT_IDLE_MS).catch(() => { /* next wake */ });
  }

  #pass = {};
  #booting = null;
  /** NEXT: how the container last exited, from monitor(), for /status. */
  #exit = null;

  // The one way to the container. Legacy forwards; NEXT starts it, waits for server.mjs, forwards.
  // Callers treat a throw as still waking.
  // why: lessons/workers-pub.md#c
  async #c(req) {
    if (!NEXT) return super.fetch(req);
    await this.#up();
    return this.ctx.container.getTcpPort(8080).fetch(req);
  }

  // NEXT: forward only to a running container; #c would start one just to stop it.
  // why: lessons/workers-pub.md#c-if-up
  async #cIfUp(req) {
    if (NEXT && !this.ctx.container.running && !this.#booting) return null;
    return this.#c(req);
  }

  /** NEXT: a camera session ended, so come back in a minute and retire the box. */
  async #camRetireLater() {
    if ((await this.#getRole()) === LOOP) return this.#loopArm();
    if (!NEXT || this.#camLive()) return;
    try { await this.ctx.storage.setAlarm(Date.now() + 60_000); } catch { /* the timeout is the floor */ }
  }

  #up() {
    const c = this.ctx.container;
    if (this.#booting) return this.#booting;
    if (c.running) return Promise.resolve();
    this.#booting = this.#boot().finally(() => { this.#booting = null; });
    return this.#booting;
  }

  // NEXT: start() returns before the container listens, so poll /status (spawns nothing).
  // Ready in about 0.83 s warm and about 10 s after an image push.
  // why: lessons/workers-pub.md#boot
  async #boot() {
    const c = this.ctx.container;
    const t0 = Date.now();
    c.start({ image: c.images.pub, instance: NEXT_INSTANCE, enableInternet: true, env: this.#pass });
    this.#exit = null;
    // monitor() resolves on exit and rejects on error. It also holds the
    // object in memory for up to 15 minutes, which the docs say is the point.
    c.monitor()
      .then(() => { this.#exit = { at: Date.now(), how: 'exited' }; })
      .catch((e) => { this.#exit = { at: Date.now(), how: 'error', error: String(e?.message || e).slice(0, 200) }; });
    try { await c.setInactivityTimeout(NEXT_IDLE_MS); } catch { /* set again on the next wake */ }
    const port = c.getTcpPort(8080);
    for (;;) {
      try {
        const r = await port.fetch('http://c/status');
        await r.arrayBuffer();
        this.bootMs = Date.now() - t0;
        return;
      } catch { /* not listening yet */ }
      if (Date.now() - t0 > NEXT_READY_MS) throw new Error(`container not listening ${NEXT_READY_MS / 1000} s after start`);
      await new Promise((ok) => setTimeout(ok, 25));
    }
  }

  #idleTicks = 0;
  // 'stage', 'cam' or 'main', told by the entry worker's x-pub-role header and remembered, since an
  // alarm has no request and an object is not told its own name.
  // why: lessons/workers-pub.md#role
  #role = null;
  async #getRole() {
    if (this.#role === null) {
      try { this.#role = (await this.ctx.storage.get('role')) || 'main'; } catch { this.#role = 'main'; }
    }
    return this.#role;
  }
  /** id -> resource URL of browser WHIP publishes */
  #whipRes = new Map();
  // Rate-limit stamps for the past hour, in storage so an eviction does not reset them.
  // why: lessons/workers-pub.md#hits
  #hits = null;
  async #getHits(kind) {
    if (!this.#hits) {
      try { this.#hits = (await this.ctx.storage.get('hits')) || {}; } catch { this.#hits = {}; }
    }
    const now = Date.now();
    this.#hits[kind] = (this.#hits[kind] || []).filter((h) => now - (h.at ?? h) < 3600_000);
    return this.#hits[kind];
  }
  async #addHit(kind, h) {
    (await this.#getHits(kind)).push(h);
    try { await this.ctx.storage.put('hits', this.#hits); } catch { /* counted in memory until the next write */ }
  }
  #cam = null;
  /** Ring buffer of device reports. Diagnostic; dies with the DO. */
  #log = [];
  #hydrated = false;

  // Read the ring back after an eviction, lazily: the constructor cannot await, and other routes
  // must not wait on a read they do not use.
  // why: lessons/workers-pub.md#hydrate
  async #hydrate() {
    if (this.#hydrated) return;
    this.#hydrated = true;
    try { this.#log = (await this.ctx.storage.get('log')) || []; }
    catch { this.#log = []; }
    if (NEXT) await this.#adoptLegacyLog();
  }

  // NEXT: the first ring read on the main instance merges the legacy `p1` object's lines in, object
  // to object; the flag is written only after a copy that worked.
  // why: lessons/workers-pub.md#adopt
  async #adoptLegacyLog() {
    if ((await this.#getRole()) !== 'main' || !this.env.PUB) return;
    try {
      if (await this.ctx.storage.get('logAdopted')) return;
      const r = await this.env.PUB.get(this.env.PUB.idFromName(NAME)).fetch('http://c/logs');
      if (!r.ok) return;
      const old = (await r.json()).log || [];
      const seen = new Set(this.#log.map((l) => l.at + l.who + l.body));
      const merged = old.filter((l) => !seen.has(l.at + l.who + l.body)).concat(this.#log)
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      this.#log = merged.slice(-LOG_KEEP);
      await this.#persist();
      await this.ctx.storage.put('logAdopted', { at: new Date().toISOString(), lines: old.length });
    } catch { /* tried again on the next read */ }
  }

  // Trimmed from the front: a DO value caps at 128 KiB and the ring can reach 800 KB. Keep the
  // newest.
  // why: lessons/workers-pub.md#persist
  async #persist() {
    let out = this.#log;
    while (out.length > 1 && JSON.stringify(out).length > 100000) out = out.slice(Math.ceil(out.length / 8));
    this.#log = out;
    try { await this.ctx.storage.put('log', out); } catch { /* diagnostics are never load-bearing */ }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const hdr = request.headers.get('x-pub-role');
    const told = hdr === STAGE ? STAGE : hdr === CAM ? CAM : hdr === LOOP ? LOOP : 'main';
    if ((await this.#getRole()) !== told) {
      this.#role = told;
      try { await this.ctx.storage.put('role', told); } catch { /* re-told on the next request */ }
    }

    // A viewer (/stage/watch only).
    // why: lessons/workers-pub.md#watch
    if (url.pathname === '/watch') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const pair = new WebSocketPair();
      // TAGGED, so a socket's role is readable after hibernation.
      this.ctx.acceptWebSocket(pair[1], ['watch']);   // hibernatable
      this.#idleTicks = 0;
      await this.#ensureAlarm();
      // Fire and forget: awaiting the publish delayed the 101 by the container's cold start. The
      // sweep retries.
      // why: lessons/workers-pub.md#fire-forget
      if (this.viewers() === 1) this.#startPublish().catch(() => { /* sweep retries */ });
      try {
        pair[1].send(JSON.stringify({ t: 'hello', viewers: this.viewers() }));
      } catch { /* raced a close */ }
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // The LL-HLS loopback camera: MediaRecorder chunks POSTed in order to the container, rewrapped
    // to RTMPS on LOOP_STREAM_KEY. A refusal is in band (`{t:'busy'}`, close 4409): a browser
    // cannot read a refused upgrade's status. plans/plan-cam-llhls.md.
    // why: lessons/workers-pub.md#loop-cam
    const role = await this.#getRole();
    if (url.pathname === '/cam' && role === LOOP) {
      const busy = this.#camBusy();
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json(busy || { free: true }, busy ? 409 : 200);
      }
      const pair = new WebSocketPair();
      const now = Date.now();
      const camHits = await this.#getHits('cam');
      const refuse = busy
        || (camHits.length >= LOOP_PER_HOUR ? { error: 'too many camera sessions this hour', limit: LOOP_PER_HOUR, status: 429 } : null)
        || (!this.#camKey() ? { error: 'no camera stream key on this worker', status: 503 } : null)
        || await this.#loopGuard();
      if (refuse) {
        this.ctx.acceptWebSocket(pair[1], ['cam-refused']);
        pair[1].serializeAttachment({ role: 'refused' });
        try {
          pair[1].send(JSON.stringify({ t: 'busy', ...refuse }));
          pair[1].close(refuse.status === 409 ? 4409 : 4000 + (refuse.status % 1000), String(refuse.error).slice(0, 120));
        } catch { /* gone */ }
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      await this.#addHit('cam', now);
      const sid = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      this.ctx.acceptWebSocket(pair[1], ['cam']);
      pair[1].serializeAttachment({ role: 'cam', sid, at: now });
      this.#cam = { sid, at: now, lastAt: now, bytes: 0, chunks: 0, open: false, chain: Promise.resolve(), ws: pair[1] };
      await this.#loopPut('loopTake', { sid, at: now, uid: null });
      await this.ctx.storage.setAlarm(now + CAM_TICK_MS);
      try { pair[1].send(JSON.stringify({ t: 'hello', sid, maxS: this.#camMax() / 1000 })); } catch { /* raced */ }
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (role === LOOP && url.pathname === '/status') return json(await this.#loopStatus(url.searchParams.get('fresh') === '1'));
    if (role === LOOP && url.pathname === '/sweep' && request.method === 'POST') {
      const cron = request.headers.get('x-pub-cron') === '1';
      const last = await this.ctx.storage.get('loopSweep');
      if (!cron && last && Date.now() - Date.parse(last.at) < LOOP_SWEEP_GAP_MS) {
        return json({ error: 'swept less than a minute ago', last }, 429);
      }
      const r = await clean(this.env, { olderThanMs: LOOP_OLD_MS, why: cron ? 'cron' : 'asked' });
      await this.#loopPut('loopSweep', r);
      this.#loopCache = null;
      return json(r);
    }

    if (url.pathname === '/status') {
      let container = null;
      // NEXT: a status read does not start a container; it answers with the idle shape server.mjs
      // uses.
      // why: lessons/workers-pub.md#status-idle
      if (NEXT && !this.ctx.container.running && !this.#booting) {
        container = { publishing: false, running: false, whip: { publishing: false }, cam: { publishing: false }, exit: this.#exit };
      } else {
        try {
          const r = await this.#c(new Request('http://c/status'));
          container = await r.json();
          if (NEXT) container.bootMs = this.bootMs ?? null;
        } catch (e) { container = { error: String(e).slice(0, 200) }; }
      }
      const c = this.#cam;
      return json({
        viewers: this.viewers(),
        cam: c ? { sid: c.sid, open: c.open, ageS: Math.round((Date.now() - c.at) / 1000), chunks: c.chunks, bytes: c.bytes, lastChunkAgoMs: Date.now() - c.lastAt } : null,
        idleTicks: this.#idleTicks,
        graceTicks: GRACE_TICKS,
        sweepMs: SWEEP_MS,
        container,
      });
    }

    // A device posts what it saw (buffers, hole seeks) to a capped ring, persisted so an eviction
    // cannot drop a report and make the device look silent. Diagnostic only, no secrets.
    // why: lessons/workers-pub.md#log
    if (url.pathname === '/log' && request.method === 'POST') {
      const body = (await request.text()).slice(0, LOG_MAX_BODY);
      const ua = request.headers.get('user-agent') || '';
      const ip = request.headers.get('cf-connecting-ip') || '';
      const line = {
        at: new Date().toISOString(),
        // never store the address itself, only enough to group one device's
        // lines together across posts
        who: await shortHash(ip + ua),
        ios: /iPhone|iPad|iPod/.test(ua),
        body,
      };
      await this.#hydrate();
      this.#log.push(line);
      if (this.#log.length > LOG_KEEP) this.#log.splice(0, this.#log.length - LOG_KEEP);
      await this.#persist();
      return json({ ok: true, kept: this.#log.length });
    }

    if (url.pathname === '/logs') {
      await this.#hydrate();
      if (url.searchParams.get('format') === 'text') {
        const txt = this.#log
          .map((l) => `${l.at} ${l.ios ? 'iOS' : '   '} ${l.who} ${l.body}`)
          .join('\n');
        return new Response(txt || '(nothing reported)', {
          headers: { 'content-type': 'text/plain; charset=utf-8', ...OPEN },
        });
      }
      return json({ lines: this.#log.length, log: this.#log });
    }

    if (url.pathname === '/logs/clear' && request.method === 'POST') {
      await this.#hydrate();
      const had = this.#log.length;
      this.#log = [];
      await this.ctx.storage.delete('log');
      this.#hydrated = true;          // emptied on purpose, do not re-read
      return json({ ok: true, cleared: had });
    }

    if (url.pathname === '/start' && request.method === 'POST') {
      await this.#startPublish();
      return json({ ok: true, viewers: this.viewers() });
    }
    if (url.pathname === '/stop' && request.method === 'POST') {
      await this.#stopPublish();
      return json({ ok: true });
    }

    // Short-lived TURN credentials: Stream's WHIP/WHEP is ICE-lite UDP only, so a UDP-dropping
    // network needs TURN over TLS on 443. TURN_KEY_ID and TURN_KEY_API_TOKEN never reach a page;
    // 503 without them. Rate limited per address and overall, in this object.
    // why: lessons/workers-pub.md#ice
    if (url.pathname === '/ice' && (request.method === 'GET' || request.method === 'HEAD')) {
      const keyId = this.env.TURN_KEY_ID, token = this.env.TURN_KEY_API_TOKEN;
      if (!keyId || !token) {
        return json({ error: 'no TURN key on this worker, so there is no relay for networks that block UDP', iceServers: null }, 503);
      }
      const now = Date.now();
      // Hashed, because the stamps are now kept in storage for the hour.
      const who = await shortHash(request.headers.get('cf-connecting-ip') || 'unknown');
      const iceHits = await this.#getHits('ice');
      // A room counts for everybody in it, who may share one public address.
      // why: lessons/workers-pub.md#ice-room
      const v = iceVerdict(iceHits, { who, room: url.searchParams.get('room') });
      if (!v.ok) return json({ error: v.why, limit: v.limit }, 429);
      let up;
      try {
        up = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ttl: ICE_TTL_S }),
        });
      } catch (e) {
        return json({ error: `turn upstream: ${e.message}`, iceServers: null }, 502);
      }
      if (!up.ok) return json({ error: `turn upstream ${up.status}`, iceServers: null }, 502);
      await this.#addHit('ice', { at: now, who, ...(v.room ? { room: v.room } : {}) });
      const got = await up.json();
      // Port 53 is refused by browsers and only costs a gathering timeout,
      // which is Cloudflare's own advice. Nothing else is filtered: ICE picks.
      const iceServers = (got.iceServers || []).map((s) => ({
        ...s,
        urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)),
      })).filter((s) => s.urls.length);
      return new Response(JSON.stringify({ iceServers, ttl: ICE_TTL_S }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          ...OPEN,
          // A credential with a clock on it is never cached anywhere.
          'cache-control': 'no-store',
        },
      });
    }

    // A browser publishes WHIP without the key, which sits in the URL path: one offer, one answer
    // (no
    // trickle), and media goes browser to Cloudflare directly. The camera instance only.
    // why: lessons/workers-pub.md#whip
    if (url.pathname === '/whip' && request.method === 'POST') {
      if ((await this.#getRole()) !== CAM) return json({ error: 'retired 2026-10-13' }, 410);
      const whip = this.env.CAM_WHIP_URL;
      if (!whip) return json({ error: CAM_WHIP_MISSING }, 503);

      // A tokenless publish proxy is an open door to our live input, so it gets
      // the same discipline `ingest` has: a small per-hour cap, counted here
      // because a DO is the only place two requests cannot both pass a check.
      const now = Date.now();
      if ((await this.#getHits('whip')).length >= WHIP_PER_HOUR) {
        return json({ error: 'too many publishes this hour', limit: WHIP_PER_HOUR }, 429);
      }

      // One camera at a time. Two publishers on one input is one publisher
      // and a fight, so a second is told 409 in words rather than racing.
      const held = await this.#camWhipHeld();
      if (held) {
        if (now - held.at < CAM_MAX_MS) {
          return json({ error: 'input busy: another camera is on the camera WebRTC input', sinceS: Math.round((now - held.at) / 1000) }, 409);
        }
        // Older than any session may be: a tab that left without its DELETE.
        if (held.url) { try { await fetch(held.url, { method: 'DELETE' }); } catch { /* gone */ } }
        await this.#camWhipSet(null);
      }

      const offer = await request.text();
      let up;
      try {
        up = await fetch(whip, {
          method: 'POST',
          headers: { 'content-type': 'application/sdp' },
          body: offer,
        });
      } catch (e) {
        return json({ error: `whip upstream: ${e.message}` }, 502);
      }
      if (!up.ok) return json({ error: `whip upstream ${up.status}`, detail: (await up.text()).slice(0, 200) }, 502);

      // The WHIP `Location` is itself a credential, so it stays here behind an opaque id; DELETE is
      // proxied.
      // why: lessons/workers-pub.md#location
      const loc = up.headers.get('location');
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      this.#whipRes = this.#whipRes || new Map();
      this.#whipRes.set(id, { url: loc ? new URL(loc, whip).toString() : null, at: now });
      await this.#addHit('whip', now);
      for (const [k, v] of this.#whipRes) if (now - v.at > 6 * 3600_000) this.#whipRes.delete(k);
      await this.#camWhipSet({ id, url: this.#whipRes.get(id).url, at: now });

      return new Response(await up.text(), {
        status: 201,
        headers: {
          'content-type': 'application/sdp',
          ...OPEN,
          'access-control-expose-headers': 'x-whip-id',
          'x-whip-id': id,
        },
      });
    }
    if (url.pathname.startsWith('/whip/') && request.method === 'DELETE') {
      const id = url.pathname.slice('/whip/'.length);
      // The camera's session is also in storage, so a DELETE still finds it
      // after the object was evicted between the publish and the stop.
      const held = (await this.#getRole()) === CAM ? await this.#camWhipHeld() : null;
      const rec = this.#whipRes?.get(id) || (held?.id === id ? held : null);
      if (!rec) return json({ error: 'unknown publish' }, 404);
      this.#whipRes?.delete(id);
      if (held?.id === id) await this.#camWhipSet(null);
      if (rec.url) { try { await fetch(rec.url, { method: 'DELETE' }); } catch { /* gone */ } }
      return json({ ok: true }, 200);
    }
    // The preflight covers `/whip/<id>`, since a cross-origin DELETE preflights.
    // why: lessons/workers-pub.md#preflight
    if (url.pathname.startsWith('/whip') && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        ...OPEN,
        'access-control-allow-methods': 'POST,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      } });
    }

    return json({ error: 'not a route on this instance' }, 404);
  }

  // Only `watch` sockets are viewers, written as all but camera sockets because an untagged viewer
  // restored after a deploy is still watching. A camera session's input is the loopback's.
  // why: lessons/workers-pub.md#viewers
  #camKey() { return this.#role === LOOP ? this.env.LOOP_STREAM_KEY : null; }
  #camMax() { return LOOP_MAX_MS; }

  async #loopPut(k, v) { try { await this.ctx.storage.put(k, v); } catch { /* the cron is the floor */ } }
  async #loopGet(k, d) { try { return (await this.ctx.storage.get(k)) ?? d; } catch { return d; } }

  // Refuse a take near the account cap, or when storage cannot be read.
  // why: lessons/workers-pub.md#loop-guard
  async #loopGuard() {
    if (!loopReady(this.env)) return { error: 'the loopback input is not provisioned: the owner runs src/provision-loop.sh', status: 503 };
    let s;
    try { s = await storage(this.env); }
    catch { return { error: 'could not read the account\'s Stream storage, so no take', status: 503 }; }
    const ceil = loopCeil(this.env);
    if (s.used >= ceil) {
      return { error: `the account holds ${Math.round(s.used)} of ${s.cap} Stream storage minutes, at or over the ${ceil} this loopback stops at`, status: 507, used: s.used, ceiling: ceil };
    }
    return null;
  }

  // A take ended, however: its clean is queued in storage with its uid; the alarm runs it later.
  // why: lessons/workers-pub.md#loop-ended
  async #loopEnded(sid) {
    if ((await this.#getRole()) !== LOOP) return;
    const take = await this.#loopGet('loopTake', null);
    const pending = await this.#loopGet('loopPending', []);
    const now = Date.now();
    if (!pending.some((p) => p.sid && p.sid === (take?.sid || sid))) {
      pending.push({ sid: take?.sid || sid || null, uid: take?.uid || null, endedAt: now, due: now + LOOP_CLEAN_MS, tries: 0 });
    }
    await this.#loopPut('loopPending', pending);
    try { await this.ctx.storage.delete('loopTake'); } catch { /* replaced by the next take */ }
    await this.#loopArm();
  }

  /** One alarm per object, so the loop role sets it to the EARLIEST thing due. */
  async #loopArm() {
    const now = Date.now();
    const pending = await this.#loopGet('loopPending', []);
    const due = [];
    if (this.#camLive()) {
      due.push(now + CAM_TICK_MS);
      // The cap lands on its own time, not on the next 5 s tick.
      const c = this.#camState();
      if (c) due.push(Math.max(now + 250, c.open ? (c.openAt || c.at) + LOOP_MAX_MS : c.at + LOOP_OPEN_MS));
    }
    for (const p of pending) due.push(Math.max(p.due, now + 1000));
    if (NEXT && !this.#camLive() && (this.ctx.container.running || this.#booting)) due.push(now + 60_000);
    if (!due.length) return;
    try { await this.ctx.storage.setAlarm(Math.min(...due)); } catch { /* the cron is the floor */ }
  }

  async #loopAlarm() {
    const now = Date.now();
    const c = this.#camLive() ? this.#camState() : null;
    if (c) {
      if (c.open && now - c.lastAt > CAM_IDLE_MS) await this.#endCam('stopped', `no video from the camera for ${Math.round((now - c.lastAt) / 1000)} s`);
      else if (c.open && now - (c.openAt || c.at) >= LOOP_MAX_MS) await this.#endCam('stopped', `a take is capped at ${LOOP_MAX_MS / 1000} s of RTMPS, because every one is recorded on Stream`);
      else if (!c.open && now - c.at >= LOOP_OPEN_MS) await this.#endCam('stopped', `the publisher did not open within ${LOOP_OPEN_MS / 1000} s`);
      else {
        // The take's own video, while Stream still says which it is.
        const take = await this.#loopGet('loopTake', null);
        if (take && !take.uid) {
          try {
            const l = await lifecycle(this.env);
            if (l?.live && l.videoUID) await this.#loopPut('loopTake', { ...take, uid: l.videoUID });
          } catch { /* the list at clean time is the other half */ }
        }
      }
    }
    // Every clean that is due. A clean that leaves something (a recording not
    // yet finished, a failed DELETE) is asked again; after LOOP_TRIES the cron
    // has it, and it never lets go of anything older than five minutes.
    const pending = await this.#loopGet('loopPending', []);
    const left = [];
    for (const p of pending) {
      if (p.due > now) { left.push(p); continue; }
      const r = await clean(this.env, { uids: [p.uid], why: `take ${p.sid || '?'} ended ${Math.round((now - p.endedAt) / 1000)} s ago` });
      r.take = p.sid;
      await this.#loopPut('loopClean', r);
      this.#loopCache = null;
      // Asked again: a failure, a recording still closing with no take running,
      // or nothing found yet on the first two passes (a video can be listed late).
      const rest = !r.ok || r.kept.some((k) => k.why === 'still live' && !this.#camLive())
        || (r.deleted.length === 0 && p.tries < 2);
      if (rest && p.tries + 1 < LOOP_TRIES) left.push({ ...p, tries: p.tries + 1, due: now + LOOP_RETRY_MS });
    }
    await this.#loopPut('loopPending', left);
    if (!this.#camLive()) {
      const last = Math.max(0, ...pending.map((p) => p.endedAt || 0));
      if (now - last >= 60_000) await this.#retire();
    }
    await this.#loopArm();
  }

  #loopCache = null;
  /** What is on the loopback input right now, and the account's storage. */
  async #loopStatus(fresh) {
    const now = Date.now();
    if (!fresh && this.#loopCache && now - this.#loopCache.t < LOOP_STATUS_TTL_MS) return this.#loopCache.v;
    const v = { input: this.env.LOOP_UID || null, take: null, recordings: null, storage: null, ceiling: loopCeil(this.env) };
    if (!loopReady(this.env)) { v.error = 'not provisioned'; return v; }
    const take = await this.#loopGet('loopTake', null);
    v.take = this.#camLive() && take ? { sid: take.sid, ageS: Math.round((now - take.at) / 1000), uid: take.uid } : null;
    try { v.recordings = await loopVideos(this.env); } catch (e) { v.recordingsError = String(e.message || e); }
    try { v.storage = await storage(this.env); } catch (e) { v.storageError = String(e.message || e); }
    v.pending = (await this.#loopGet('loopPending', [])).map((p) => ({ sid: p.sid, uid: p.uid, inS: Math.max(0, Math.round((p.due - now) / 1000)), tries: p.tries }));
    v.lastClean = await this.#loopGet('loopClean', null);
    v.lastSweep = await this.#loopGet('loopSweep', null);
    this.#loopCache = { t: now, v };
    return v;
  }

  viewers() {
    return this.ctx.getWebSockets().length
      - this.ctx.getWebSockets('cam').length
      - this.ctx.getWebSockets('cam-refused').length;
  }

  /** The camera's WebRTC session, { id, url, at }, or null. Kept in storage. */
  async #camWhipHeld() {
    try { return (await this.ctx.storage.get('camWhip')) || null; } catch { return null; }
  }

  async #camWhipSet(v) {
    try { v ? await this.ctx.storage.put('camWhip', v) : await this.ctx.storage.delete('camWhip'); } catch { /* next publish re-reads */ }
  }

  /** Why a camera cannot have its input right now, or null. One at a time. */
  #camBusy() {
    return this.#camLive() ? { error: 'another take is already on the LL-HLS loopback input', status: 409 } : null;
  }

  #camLive() {
    return this.ctx.getWebSockets('cam').some((ws) => ws.readyState === 1 || ws.readyState === 0);
  }

  /** The live camera session, rebuilt from its socket after an eviction. */
  #camState() {
    if (this.#cam) return this.#cam;
    const ws = this.ctx.getWebSockets('cam')[0];
    if (!ws) return null;
    const a = ws.deserializeAttachment() || {};
    // After an eviction the counters are gone. The session is taken as open
    // and fresh, so the idle check starts again; the container's own watchdog
    // is the floor under that guess.
    this.#cam = { sid: a.sid, at: a.at || Date.now(), openAt: a.openAt || null, lastAt: Date.now(), bytes: 0, chunks: 0, open: true, chain: Promise.resolve(), ws };
    return this.#cam;
  }

  // End the camera session: tell the page why, close its socket, stop the leg. All three stops land
  // here.
  // why: lessons/workers-pub.md#end-cam
  async #endCam(t, why) {
    const c = this.#camState();
    this.#cam = null;
    for (const ws of this.ctx.getWebSockets('cam')) {
      try { ws.send(JSON.stringify({ t, why })); } catch { /* gone */ }
      try { ws.close(4000, String(why).slice(0, 120)); } catch { /* gone */ }
    }
    try {
      await this.#cIfUp(new Request('http://c/cam/stop', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sid: c?.sid, why }),
      }));
    } catch { /* the container's watchdog is the floor */ }
    await this.#loopEnded(c?.sid);
    await this.#camRetireLater();
  }

  async #ensureAlarm() {
    const at = await this.ctx.storage.getAlarm();
    if (at === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
  }

  async #startPublish() {
    if ((await this.#getRole()) === STAGE) {
      // One leg and no encode: the pre-transcoded film copied onto WHIP.
      // why: lessons/workers-pub.md#stage-whip
      const url = this.env.STAGE_WHIP_URL;
      if (!url) return;
      try {
        await this.#c(new Request('http://c/start-whip', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url, source: 'film-copy', burn: false }),
        }));
      } catch { /* container still waking; the sweep retries */ }
      return;
    }
    // Any other role publishes nothing since the test pattern was retired.
  }

  async #stopPublish() {
    // NEXT: a container that is not running has nothing to stop, and a
    // forward would START one just to tell it to stop.
    if (NEXT && !this.ctx.container.running && !this.#booting) return;
    // /stop stops both legs
    try { await this.#c(new Request('http://c/stop', { method: 'POST' })); }
    catch { /* already gone */ }
  }

  async alarm() {
    // The camera instance's alarm: a quiet socket and the length cap, every CAM_TICK_MS while live.
    // why: lessons/workers-pub.md#cam-alarm
    if ((await this.#getRole()) === LOOP) return this.#loopAlarm();
    // The camera instance holds no sockets since /cam was retired, so an
    // alarm left over from then only retires a container that is still up.
    if ((await this.#getRole()) === CAM) { await this.#retire(); return; }
    const n = this.viewers();
    if (n > 0) {
      this.#idleTicks = 0;
      // Touching the container checks health and renews its activity timeout. NEXT: the alarm wakes
      // the
      // object every SWEEP_MS and sets the timeout again.
      // why: lessons/workers-pub.md#renew
      if (NEXT && this.ctx.container.running) {
        try { await this.ctx.container.setInactivityTimeout(NEXT_IDLE_MS); } catch { /* the constructor set it */ }
      }
      try {
        const r = await this.#c(new Request('http://c/status'));
        const s = await r.json();
        // the film's leg dying under a live viewer gets restarted (stage only;
        // the main instance has had no viewers since /watch was retired)
        if ((await this.#getRole()) === STAGE && !s.whip?.publishing) await this.#startPublish();
      } catch { /* waking */ }
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
      return;
    }

    this.#idleTicks++;
    if (this.#idleTicks < GRACE_TICKS) {
      // a page reload should not thrash the container
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
      return;
    }
    // NEXT: stop the publish, then destroy the box a sweep later so ffmpeg closes RTMPS cleanly.
    // why: lessons/workers-pub.md#grace
    if (NEXT && this.#idleTicks > GRACE_TICKS) {
      await this.#retire();
      await this.ctx.storage.deleteAlarm();
      this.#idleTicks = 0;
      return;
    }
    await this.#stopPublish();
    if (NEXT && this.ctx.container.running) {
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
      return;
    }
    await this.ctx.storage.deleteAlarm();
    this.#idleTicks = 0;
  }

  // NEXT: the sweep destroys the container, since a pending monitor() blocks the inactivity timeout
  // for the container's life (a 3 GiB box up 25 minutes). A fresh start is about 0.83 s.
  // why: lessons/workers-pub.md#retire
  async #retire() {
    if (!NEXT || !this.ctx.container.running) return;
    try { await this.ctx.container.destroy(); } catch { /* destroy may reject with the exit */ }
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment?.() || {};
    if (a.role === 'cam') {
      // The first stop: the page closed, or its tab died (1006). Only the
      // CURRENT session's close ends the leg, so a stale socket cannot stop a
      // newer camera.
      const c = this.#cam;
      if (!c || c.sid === a.sid) {
        this.#cam = null;
        try {
          await this.#cIfUp(new Request('http://c/cam/stop', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sid: a.sid, why: 'the camera page closed its socket' }),
          }));
        } catch { /* the container's watchdog is the floor */ }
        await this.#loopEnded(a.sid);
        await this.#camRetireLater();
      }
      return;
    }
    if (a.role === 'refused') return;
    if (this.viewers() === 0) await this.#ensureAlarm();
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }

  // Text is control, binary is one MediaRecorder chunk, chained through one promise: the input gate
  // does not cover a non-storage await, and two swapped WebM clusters break the stream.
  // why: lessons/workers-pub.md#ws-message
  async webSocketMessage(ws, msg) {
    const a = ws.deserializeAttachment?.() || {};
    if (a.role !== 'cam') return;
    // The role decides the input, and a woken object has forgotten it: read it first.
    // why: lessons/workers-pub.md#role-first
    await this.#getRole();
    const c = this.#camState();
    if (!c || c.sid !== a.sid) return;
    if (typeof msg === 'string') {
      let m = {};
      try { m = JSON.parse(msg); } catch { return; }
      if (m.t !== 'open' || c.open) return;
      try {
        // A 503 here is the platform with no instance yet: retried four times 3 s apart. Legacy
        // only in
        // practice; on PubNext a container not listening throws instead.
        // why: lessons/workers-pub.md#retry-503
        let r = null;
        for (let i = 0; i < 5; i++) {
          r = await this.#c(new Request('http://c/cam/open', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: this.#camKey(), fmt: m.fmt === 'mp4' ? 'mp4' : 'webm', sid: c.sid }),
          }));
          if (r.status !== 503 || this.#cam !== c) break;
          await new Promise((ok) => setTimeout(ok, 3000));
        }
        if (!r.ok) throw new Error(`container ${r.status}`);
      } catch (e) {
        return this.#endCam('stopped', `the publisher did not start: ${String(e.message || e).slice(0, 80)}`);
      }
      // Ended while the container woke: stop the orphan ffmpeg by sid now, not after its 5 s
      // watchdog.
      // why: lessons/workers-pub.md#ended-waking
      if (this.#cam !== c) {
        try {
          await this.#cIfUp(new Request('http://c/cam/stop', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sid: c.sid, why: 'the camera page left while the publisher was starting' }),
          }));
        } catch { /* the container's watchdog is the floor */ }
        return;
      }
      c.open = true;
      c.lastAt = Date.now();
      // When RTMPS opened, which is when Stream starts recording: the loop's
      // cap counts from here, and the attachment keeps it across an eviction.
      c.openAt = c.lastAt;
      try { ws.serializeAttachment({ ...a, openAt: c.openAt }); } catch { /* the accept time is the fallback */ }
      if (this.#role === LOOP) await this.#loopArm();
      // ONLY NOW does the page start recording, so the first chunk, which
      // carries the WebM header, cannot arrive before ffmpeg exists.
      try { ws.send(JSON.stringify({ t: 'ready', sid: c.sid })); } catch { /* gone */ }
      return;
    }
    if (!c.open) return;
    c.lastAt = Date.now();
    c.chunks++;
    c.bytes += msg.byteLength ?? msg.size ?? 0;
    const sid = c.sid;
    c.chain = c.chain.then(async () => {
      if (this.#cam !== c) return;
      try {
        const r = await this.#c(new Request(`http://c/cam/chunk?sid=${sid}`, { method: 'POST', body: msg }));
        if (r.status === 409 || r.status === 503) {
          const why = r.status === 503 ? 'Stream stopped taking the camera\'s bytes' : 'the publisher lost the camera session';
          await this.#endCam('stopped', why);
        }
      } catch { /* one lost chunk; the idle checks catch a dead leg */ }
    });
  }
};

export class Pub extends pubOn(Container, false) {}
export class PubNext extends pubOn(DurableObject, true) {}

// Group one device's lines without storing who it is: truncated SHA-256 of
// ip+ua. Enough to tell two phones apart in the log, not enough to identify
// either of them.
async function shortHash(v) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(d)].slice(0, 3).map((b) => b.toString(16).padStart(2, "0")).join("");
}


// Which runtime answers: `PUB_RT` by default, `?rt=next` or `?rt=legacy` per request.
// why: lessons/workers-pub.md#ns
const ns = (env, url) => {
  const rt = url.searchParams.get('rt') || env.PUB_RT || 'legacy';
  return rt === 'next' && env.PUB_NEXT ? env.PUB_NEXT : env.PUB;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '') {
      return json({
        worker: 'positron-pub',
        routes: ['/stage/watch', '/stage/status', '/cam/whip', '/loop', '/loop/status', '/loop/sweep', '/ice', '/log', '/logs'],
        retired: { at: '2026-10-13', routes: [...RETIRED] },
        runtime: ns(env, url) === env.PUB_NEXT ? 'next' : 'legacy',
      });
    }
    if (OWNER_PATHS.has(url.pathname) && !await keyMatches(request.headers.get('x-pub-key'), env.PUB_KEY)) {
      return json({ error: 'this route needs the x-pub-key header' }, 403);
    }
    // /stage/<path> is the stage instance, and only its four routes.
    if (url.pathname.startsWith('/stage/')) {
      const path = url.pathname.slice('/stage'.length);
      if (!STAGE_PATHS.has(path)) return json({ error: 'use /stage/watch /stage/status /stage/start /stage/stop' }, 404);
      if (!env.STAGE_WHIP_URL) {
        return json({ error: 'the stage input is not provisioned: run src/provision-stage.sh' }, 503);
      }
      url.pathname = path;
      const req = new Request(url, request);
      req.headers.set('x-pub-role', STAGE);
      return getContainer(ns(env, url), STAGE).fetch(req);
    }
    // /cam/whip[/<id>] is the camera's WebRTC publish, on the camera instance,
    // to the camera's own WebRTC input. The OPTIONS goes through whatever the
    // secret, so a browser can read the 503 below rather than a CORS failure.
    if (url.pathname === '/cam/whip' || url.pathname.startsWith('/cam/whip/')) {
      if (!env.CAM_WHIP_URL && request.method !== 'OPTIONS') return json({ error: CAM_WHIP_MISSING }, 503);
      url.pathname = url.pathname.slice('/cam'.length);
      const req = new Request(url, request);
      req.headers.set('x-pub-role', CAM);
      return getContainer(ns(env, url), CAM).fetch(req);
    }
    // /loop, /loop/status and /loop/sweep are the loopback instance: the
    // camera route on the loopback's own input, and what is on that input.
    if (url.pathname === '/loop' || url.pathname === '/loop/status' || url.pathname === '/loop/sweep') {
      url.pathname = url.pathname === '/loop' ? '/cam' : url.pathname.slice('/loop'.length);
      const req = new Request(url, request);
      req.headers.set('x-pub-role', LOOP);
      req.headers.delete('x-pub-cron');
      // The NEW runtime only, whatever ?rt= says: `Pub` is capped at three
      // instances and all three are taken (wrangler.jsonc).
      return getContainer(env.PUB_NEXT || env.PUB, LOOP).fetch(req);
    }
    // The test pattern (/watch and its routes) and /cam/'s RTMPS camera are
    // gone, and say so rather than 404, because an archived page still asks.
    if (RETIRED.has(url.pathname) || url.pathname.startsWith('/whip/')) {
      return json({ error: 'retired 2026-10-13: the test pattern and /cam/\'s RTMPS camera no longer publish' }, 410);
    }
    // What is left on the main instance: the device log and the TURN relay.
    if (!MAIN_PATHS.has(url.pathname)) return json({ error: 'not a route', routes: '/ /stage/* /cam/whip /loop /loop/status /loop/sweep /ice /log /logs /logs/clear' }, 404);
    const req = new Request(request);
    req.headers.delete('x-pub-role');
    return getContainer(ns(env, url), NAME).fetch(req);
  },

  // The loopback cron (every 10 minutes): delete anything on its input older than five minutes,
  // inside the loop object on the new runtime, which starts no container.
  // why: lessons/workers-pub.md#scheduled
  async scheduled(_event, env, ctx) {
    const url = new URL('https://pub.positron.studio/sweep');
    const req = new Request(url, { method: 'POST', headers: { 'x-pub-role': LOOP, 'x-pub-cron': '1' } });
    ctx.waitUntil(getContainer(env.PUB_NEXT || env.PUB, LOOP).fetch(req)
      .then((r) => r.text())
      .then((t) => console.log(`loop sweep ${t}`), (e) => console.log(`loop sweep failed ${e}`)));
  },
};
