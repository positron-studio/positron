// edgecast-relay: holds one Icecast source on Väin's mount for the edgecast station, so a station restart or a deploy
// of edgecast is a stretch of silence on their mount, never a dropped source (their mount takes one source and their
// players do not reconnect). Deployed rarely: a deploy of this worker does drop the source.
//   POST /start?key=&min=<minutes>   take the mount, stop by itself after min (RELAY_MAX_MIN at most)
//   POST /stop?key=                  let go of it
//   POST /push?key=                  the station's MP3 frames as the body (the service binding from edgecast)
//   GET  /status                     state, gaps, drops, refusals; never the password
// Env: ICE_HOST, ICE_PORT, ICE_MOUNT (no default, so nothing reaches a real server by accident), VAIN_SOURCE_PW and
// CAST_KEY (secrets), RELAY_MAX_MIN. why: lessons/edgecast.md#relay
import { DurableObject } from 'cloudflare:workers';
import { connect } from 'cloudflare:sockets';
import { openSource } from './source.mjs';
import { createRelay } from './relay-core.mjs';

const TICK_MS = 100, ALARM_MS = 2000, PUSH_MAX = 1 << 20;
const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const maxMin = (env) => Math.max(1, Number(env.RELAY_MAX_MIN) || 120);

export class Relay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.r = null; this.timer = null;
  }

  relay() {
    if (this.r) return this.r;
    const e = this.env;
    this.r = createRelay({ log: (l) => console.log(`relay: ${l}`),
      openSink: () => openSource({ connect, host: e.ICE_HOST, port: e.ICE_PORT, mount: e.ICE_MOUNT, pw: e.VAIN_SOURCE_PW || '' }) });
    return this.r;
  }

  run() {
    if (this.timer) return;
    const go = async () => { try { await this.r?.tick(); } catch (err) { console.log(`relay: tick: ${err}`); } this.timer = this.r?.wanted ? setTimeout(go, TICK_MS) : null; };
    this.timer = setTimeout(go, TICK_MS);
  }

  async fetch(req) {
    const u = new URL(req.url), p = u.pathname;
    if (p === '/status') return json({ mount: this.env.ICE_MOUNT || null, host: this.env.ICE_HOST || null, maxMin: maxMin(this.env), want: (await this.ctx.storage.get('want')) || null, ...(this.r ? this.r.status() : { state: 'off' }) });
    if (req.method !== 'POST') return json({ error: 'POST' }, 405);
    if (!this.env.CAST_KEY || u.searchParams.get('key') !== this.env.CAST_KEY) return json({ error: 'needs the key' }, 403);
    if (p === '/push') {
      const b = new Uint8Array(await req.arrayBuffer());
      if (b.length > PUSH_MAX) return json({ error: 'too large' }, 413);
      if (!this.r?.wanted) return json({ ok: false, state: this.r?.st.state || 'off' });
      this.r.push(b);
      return json({ ok: true, state: this.r.st.state });
    }
    if (p === '/stop') {
      await this.ctx.storage.delete('want'); await this.ctx.storage.deleteAlarm();
      this.r?.stop('stopped by request');
      return json(this.r?.status() || { state: 'off' });
    }
    if (p === '/start') {
      if (!this.env.ICE_HOST || !this.env.ICE_PORT || !this.env.ICE_MOUNT) return json({ error: 'ICE_HOST, ICE_PORT and ICE_MOUNT are not set' }, 500);
      const min = Math.min(maxMin(this.env), Math.max(1, Number(u.searchParams.get('min')) || 30));
      const want = { until: Date.now() + min * 60000, min, startedAt: Date.now() };
      await this.ctx.storage.put('want', want);
      this.r?.stop('restarted by request');
      this.r = null;
      this.relay().start(want.until);
      this.run();
      await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
      return json(this.r.status());
    }
    return json({ error: 'POST /start, /stop, /push; GET /status' }, 404);
  }

  /** Keeps the object awake while it holds the mount, and takes the mount again after an eviction. */
  async alarm() {
    const want = await this.ctx.storage.get('want');
    if (!want) return;
    if (Date.now() >= want.until) { this.r?.stop('the cap'); await this.ctx.storage.delete('want'); return; }
    if (!this.r?.wanted) { this.r = null; this.relay().start(want.until); console.log('relay: taken again after an eviction'); }
    this.run();
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
  }
}

export default {
  async fetch(req, env) {
    if (!env.ICE_MOUNT) return json({ error: 'ICE_MOUNT is not set' }, 500);
    return env.RELAY.get(env.RELAY.idFromName(env.ICE_MOUNT)).fetch(req);
  },
};
