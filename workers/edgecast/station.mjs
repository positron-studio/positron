// The station: edgecast playing radio1965's cast on its own clock and serving listeners itself, no Icecast. One object
// (`station-preview`) runs station-core.mjs (radio1965's program, live.mjs driving the tuner, scsynth and LAME, all wasm)
// and every listener of GET /listen gets the same MP3 frames. The alarm is the clock: every TICK_MS it renders
// what the wall is owed, LEAD_S ahead, so each render is its own invocation with its own CPU allowance.
// A start stops itself at its cap (30 min by default, 24 h at most). An eviction or a deploy loses the engine:
// the next alarm boots it again from the program (the life restarts at scene 0) and counts a restart. On air the feed is
// checked every FRESH_EVERY_MS with the Caster's rules (workers/cast/program.mjs): new files next, gone files out.
import { DurableObject } from 'cloudflare:workers';
import wasmModule from '../../demo/shell/vendor/scsynth-nrt.wasm';
import lameModule from './vendor/lame.wasm';
import mpgModule from './vendor/mpg123.wasm';
import glue from './glue.gen.mjs';
import { createStation, loadProgram, LEAD_S, FRESH_EVERY_MS } from './station-core.mjs';
import { createRelayFeed, bindingPost } from './relay-feed.mjs';

// which code is answering, so a deploy's restart shows in /status
export const CODE = 'station-3';
export const TICK_MS = 500, CAP_MIN = { default: 30, min: 1, max: 24 * 60 }, READY_MS = 20000, EAR_MAX_QUEUED = 1 << 20;
const cors = { 'access-control-allow-origin': '*' };
const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });

export class Station extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null; this.ears = new Set(); this.boot = null; this.ticks = 0; this.bootedAt = null; this.lastPump = null;
  }

  async fetch(req) {
    const u = new URL(req.url), p = u.pathname.replace(/^\/station/, '');
    if (p === '/listen') return this.listen();
    if (p === '/status') return json(await this.status());
    if (p === '/start' || p === '/stop') {
      if (req.method !== 'POST') return json({ error: `POST ${p}` }, 405);
      if (!this.env.CAST_KEY || u.searchParams.get('key') !== this.env.CAST_KEY) return json({ error: `${p} needs the key` }, 403);
      if (p === '/stop') { await this.halt('stopped by request'); return json(await this.status()); }
      const cap = Math.round(Math.min(CAP_MIN.max, Math.max(CAP_MIN.min, Number(u.searchParams.get('cap')) || CAP_MIN.default)));
      if (await this.ctx.storage.get('want')) return json({ error: 'already playing: stop it first', ...(await this.status()) }, 409);
      const now = Date.now();
      await this.ctx.storage.put('want', { seed: crypto.getRandomValues(new Uint32Array(1))[0] >>> 1, startedAt: now, until: now + cap * 60000, capMin: cap });
      await this.ctx.storage.put('restarts', []);
      await this.ctx.storage.delete('fresh');
      try { await this.up('start'); } catch (e) { await this.halt(`the start failed: ${e.message}`); return json({ error: e.message }, 500); }
      await this.ctx.storage.setAlarm(Date.now() + 50);
      return json(await this.status());
    }
    return json({ error: 'GET /listen, GET /status, POST /start?key=&cap=<minutes>, POST /stop?key=' }, 404);
  }

  /** Boots the station (once, however many ask) and waits until it renders. */
  up(why) {
    this.boot ||= (async () => {
      const want = await this.ctx.storage.get('want');
      if (!want) throw new Error('nothing wanted');
      const t0 = Date.now();
      const { queue, votes, program } = await loadProgram();
      if (!queue.length) throw new Error('the archive feed is empty');
      const s = await createStation({ wasmModule, glue, lameModule, mpgModule, seed: want.seed, queue, votes, program,
        log: (l) => { if (/error|ghost|scene \d|landed|behind/.test(l)) console.log(`station: ${l}`); },
        onFrame: (f) => this.send(f) });
      for (let i = 0; !s.ready; i++) {
        if (s.st.errors.length && !s.live.__g) throw new Error(s.st.errors[0]);
        if (Date.now() - t0 > READY_MS) { s.stop(); throw new Error(`not ready in ${READY_MS / 1000} s: ${s.st.errors[0] || 'no error'}`); }
        await new Promise((r) => setTimeout(r, 50));
      }
      this.s = s; this.bootedAt = Date.now();
      const rec = { at: t0, why, ms: Date.now() - t0, files: queue.length, program: program.source };
      if (why !== 'start') { const r = (await this.ctx.storage.get('restarts')) || []; r.push(rec); await this.ctx.storage.put('restarts', r.slice(-50)); }
      await this.ctx.storage.put('boot', rec);
      console.log(`station: up (${why}) in ${rec.ms} ms, ${queue.length} files from ${program.source}, seed ${want.seed}`);
      this.freshAt = 0;
    })().finally(() => { this.boot = null; });
    return this.boot;
  }

  async alarm() {
    const want = await this.ctx.storage.get('want');
    if (!want) return;
    if (Date.now() >= want.until) { await this.halt(`the cap of ${want.capMin} min`); return; }
    try {
      if (!this.s) await this.up(this.bootedAt ? 'after an error' : 'restart (eviction or deploy)');
      const r = await this.s.pump();
      await this.relayFeed?.flush();
      this.ticks++; this.lastPump = { at: Date.now(), ...r };
      // the feed check runs beside the render, never in front of it: a slow feed must not cost the lead
      if (this.s.ready && !this.freshing && Date.now() - (this.freshAt || 0) >= FRESH_EVERY_MS) {
        this.freshAt = Date.now();
        const s = this.s;
        this.freshing = (async () => {
          const st = await s.fresh(await this.ctx.storage.get('fresh'), want.startedAt);
          if (this.s === s) await this.ctx.storage.put('fresh', st);
        })().catch((e) => { s.st.fresh = { at: new Date().toISOString(), did: `the feed check failed: ${e.message}`, added: [], gone: [] }; })
          .finally(() => { this.freshing = null; });
        this.ctx.waitUntil?.(this.freshing);
      }
    } catch (e) { console.log(`station: alarm: ${e && e.stack || e}`); }
    if (await this.ctx.storage.get('want')) await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  async halt(why) {
    await this.ctx.storage.delete('want');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.put('last', { stoppedAt: Date.now(), why, seconds: this.s?.status().seconds ?? null });
    try { this.s?.stop(); } catch { /* gone */ }
    this.s = null;
    for (const ear of this.ears) { try { ear.w.close(); } catch { /* gone */ } }
    this.ears.clear();
    console.log(`station: stopped, ${why}`);
  }

  /** Every listener gets every frame; one that falls a megabyte behind, or whose write fails (gone), is let go. */
  send(f) {
    for (const ear of this.ears) this.feed(ear, f);
    if (this.env.RELAY) (this.relayFeed ||= createRelayFeed({ post: bindingPost(this.env) })).push(f);
  }

  feed(ear, f) {
    if (ear.queued > EAR_MAX_QUEUED) { this.drop(ear); return; }
    ear.queued += f.data.length;
    ear.w.write(f.data).then(() => { ear.queued -= f.data.length; ear.bytes += f.data.length; }, () => this.drop(ear));
  }

  drop(ear) { if (!this.ears.delete(ear)) return; try { ear.w.abort(); } catch { /* gone */ } }

  async listen() {
    if (!this.s?.ready || !(await this.ctx.storage.get('want'))) return json({ error: 'the station is not playing', playing: false }, 503);
    const { readable, writable } = new TransformStream();
    const ear = { w: writable.getWriter(), bytes: 0, queued: 0, since: Date.now() };
    const burst = this.s.burst();
    this.ears.add(ear);
    for (const f of burst) this.feed(ear, f);
    return new Response(readable, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'x-edgecast-burst-frames': String(burst.length), ...cors } });
  }

  async status() {
    const [want, last, restarts, boot, alarm] = await Promise.all(['want', 'last', 'restarts', 'boot'].map((k) => this.ctx.storage.get(k)).concat(this.ctx.storage.getAlarm()));
    const s = this.s?.status() ?? null;
    return { code: CODE, playing: !!(want && this.s?.ready), wanted: !!want, until: want ? new Date(want.until).toISOString() : null, capMin: want?.capMin ?? null,
      startedAt: want ? new Date(want.startedAt).toISOString() : null, listeners: this.ears.size, listenerBytes: [...this.ears].map((e) => e.bytes),
      seconds: s?.seconds ?? null, lead: s?.lead ?? null, leadTargetS: LEAD_S, tickMs: TICK_MS, ticks: this.ticks, lastPump: this.lastPump, alarm: alarm ? new Date(alarm).toISOString() : null,
      // performance.now() and Date.now() stand still while code runs on Cloudflare: the CPU is measured by wrangler tail
      cpu: { perAudioSecond: null, how: 'wrangler tail: the cpuTime of each alarm, over the audio seconds it rendered (lastPump.made)' },
      underruns: s?.underruns ?? null, scene: s?.scene ?? null, file: s?.file ?? null, fileId: s?.fileId ?? null, next: s?.next ?? null,
      program: s?.program ?? null, fresh: s?.fresh ? { everyS: FRESH_EVERY_MS / 1000, ...s.fresh } : null, out: s?.out ?? null, memory: s?.memory ?? null,
      boot: boot ?? null, restarts: restarts ?? [], last: last ?? null, errors: s?.errors ?? [], lines: s?.lines ?? [] };
  }
}
