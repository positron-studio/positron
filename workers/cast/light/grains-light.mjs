// The light chain: startGrains' shape with no JACK, no jack-stdio, no native scsynth and no UDP. One node process
// runs the tuner (mixer.mjs) and the vendored wasm scsynth (wasm-scsynth.mjs, LOCAL's engine) in the same thread,
// the tuner's float block goes straight onto the engine's input busses, and its output straight into LAME. The
// clock is the wall: node renders up to LEAD_S ahead of it, a few blocks at a time. Not on air.
import { PROGRAM, PATCHES, DEFAULTS as RING_DEFAULTS, RING_SECONDS, valuesOf } from '../container/sc/granulator/grain-ring.mjs';
import { clampPatch, PATCH_LIMITS } from '../container/grain-patch.mjs';
import { compile } from '../container/sc/shell/sclang-lite.mjs';
import { createEngine, BLOCK } from '../container/mixer.mjs';
import { openDecoder } from '../container/decode.mjs';
import { openEncoder } from '../container/encode.mjs';
import { usage } from '../container/mixcast.mjs';
import { program as masterProgram, MASTER_BUS } from '../container/sc/radio/cast/master.mjs';
import { bootWasm, QUANTUM } from './wasm-scsynth.mjs';

export { PATCHES, clampPatch, PATCH_LIMITS };
export const SR = 44100, NODE = 4000, BUF = 0, DEF = 'gring', MASTER_NODE = 4100;
/** How far ahead of the wall node renders, and how often it looks. */
export const LEAD_S = Number(process.env.LIGHT_LEAD_S) || 0.5, LOOP_MS = Number(process.env.LIGHT_LOOP_MS) || 20;
const ENC_FRAMES = Number(process.env.LIGHT_ENC_FRAMES) || 4096;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
const ALIGN_LEAD_S = 4, GO_RETRY_MS = [...Array(50).fill(100), ...BACKOFF_MS];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The engine with the ring and the master loaded. `{ send, ask, set, land, read, status, close, dead, push(mix, x), counts }`.
 * `ask(test, ms, address, ...args)` hands `test` `{ address, args }`, as grains.mjs's UDP chain does.
 */
export async function startChain({ values = valuesOf(PATCHES[0]), mix = 1, inputs = 2, log = () => {} } = {}) {
  const t0 = Date.now(), counts = { grains: 0, late: 0, quanta: 0 }, timing = {};
  let lastStatus = null;
  const good = compile(PROGRAM, { name: DEF, bus: MASTER_BUS });
  if (!good.ok) throw new Error(`the ring did not compile: ${good.message}`);
  const mst = compile(masterProgram(MASTER_BUS), { name: 'lmaster' });
  if (!mst.ok) throw new Error(`the master did not compile: ${mst.message}`);
  timing.compileMs = Date.now() - t0;
  const waiters = [];
  const w = await bootWasm({ inputs, log: (l) => log(`wasm: ${l}`), onReply: (m) => {
    if (m[0] === '/grain') { counts.grains++; return true; }
    if (m[0] === '/status.reply') lastStatus = { at: Date.now(), ugens: m[2], synths: m[3], avgCPU: +(+m[6]).toFixed(2), peakCPU: +(+m[7]).toFixed(2) };
    const o = { address: m[0], args: m.slice(1) };
    for (const x of waiters.slice()) if (x.test(o)) { waiters.splice(waiters.indexOf(x), 1); clearTimeout(x.t); x.ok(o); return true; }
    return false;
  } });
  timing.bootMs = Date.now() - t0;
  const send = (address, ...args) => w.send(address, ...args);
  const ask = (test, ms, address, ...args) => new Promise((ok) => {
    const x = { test, ok, t: setTimeout(() => { waiters.splice(waiters.indexOf(x), 1); ok(null); }, ms) };
    waiters.push(x); send(address, ...args);
  });
  // until the render loop runs, replies only leave from process(): the boot pumps silence through quanta itself
  const boot = async (p) => { let r; p.then((x) => { r = x; }); for (let i = 0; i < 2000 && r === undefined; i++) { w.quantum((c, b) => b.fill(0)); if (i % 8 === 7) await new Promise((s) => setImmediate(s)); } return r; };
  const done = (cmd) => (m) => (m.address === '/done' && m.args[0] === cmd) || (m.address === '/fail' && m.args[0] === cmd);
  if (!await boot(ask(done('/notify'), 3000, '/notify', 1))) throw new Error('wasm scsynth did not answer /notify');
  if ((await boot(ask(done('/b_alloc'), 5000, '/b_alloc', BUF, RING_SECONDS * SR, 1)))?.address !== '/done') throw new Error('the ring buffer was not allocated');
  const def = await boot(ask(done('/d_recv'), 5000, '/d_recv', good.bytes));
  if (def?.address !== '/done') throw new Error(`the engine did not take the definition: ${def ? def.args.join(' ') : 'no answer'}`);
  const go = await boot(ask((m) => (m.address === '/n_go' && m.args[0] === NODE) || (m.address === '/fail' && m.args[0] === '/s_new'), 5000,
    '/s_new', DEF, NODE, 1, 0, 'buf', BUF, 'inbus', 2, 'mix', mix, ...Object.entries(values).flat()));
  if (go?.address !== '/n_go') throw new Error('the ring did not start');
  if ((await boot(ask(done('/d_recv'), 5000, '/d_recv', mst.bytes)))?.address !== '/done') throw new Error('the engine did not take the master');
  send('/s_new', 'lmaster', MASTER_NODE, 3, NODE);
  timing.chainMs = Date.now() - t0;
  log(`light: wasm chain up in ${timing.chainMs} ms (boot ${timing.bootMs} ms), definition ${good.bytes.length} B`);

  // the input FIFO: the tuner's blocks (882) are cut into the engine's quanta (128); the rest waits for the next block
  const cap = BLOCK * 4, fm = new Float32Array(cap), fx = new Float32Array(cap);
  let have = 0;
  const out16 = new Int16Array(cap * 2), out = Buffer.from(out16.buffer);
  const ch = {
    dead: null, startedAt: t0, timing, counts, inputs, send, ask, defBytes: good.bytes.length,
    /** Frames waiting in the FIFO, not yet heard by the engine. */
    get pending() { return have; },
    get quanta() { return w.quanta; },
    /** A block of the mix (mono floats) and the ghost's (or null) in; the engine's stereo output, s16 interleaved, out. */
    push(mono, x) {
      fm.set(mono, have); if (x) fx.set(x, have); else fx.fill(0, have, have + mono.length);
      have += mono.length;
      let o = 0, q = 0;
      while (have - q * QUANTUM >= QUANTUM) {
        const s = q * QUANTUM;
        const y = w.quantum((c, b) => { if (c < 2) b.set(fm.subarray(s, s + QUANTUM)); else if (c < 4) b.set(fx.subarray(s, s + QUANTUM)); else b.fill(0); });
        const L = y[0], R = y[1];
        // an Int16Array clamps nothing, so the clamp is here; o counts samples, two a frame
        for (let i = 0; i < QUANTUM; i++) {
          const l = L[i] * 32767, r = R[i] * 32767;
          out16[o++] = l > 32767 ? 32767 : l < -32768 ? -32768 : Math.round(l);
          out16[o++] = r > 32767 ? 32767 : r < -32768 ? -32768 : Math.round(r);
        }
        q++;
      }
      counts.quanta += q;
      const used = q * QUANTUM;
      if (used) { fm.copyWithin(0, used, have); fx.copyWithin(0, used, have); have -= used; }
      return out.subarray(0, o * 2);
    },
    set(vals) { const e = Object.entries(vals); if (e.length) send('/n_set', NODE, ...e.flat()); },
    land() { send('/n_set', NODE, 'sync', 1); setTimeout(() => send('/n_set', NODE, 'sync', 0), 40); },
    async read(name) { const r = await ask((m) => m.address === '/n_set' && m.args[1] === name, 2000, '/s_get', NODE, name); return r ? r.args[2] : null; },
    status() { return { dead: ch.dead, upS: Math.round((Date.now() - t0) / 1000), timing, defBytes: ch.defBytes, scsynth: lastStatus, xruns: 0, late: counts.late, underruns: 0, grains: counts.grains, quanta: w.quanta, period: QUANTUM }; },
    close() { ch.closed = true; return Promise.resolve(); },
  };
  const statusTimer = setInterval(() => send('/status'), 1000);
  const close0 = ch.close; ch.close = () => { clearInterval(statusTimer); return close0(); };
  return ch;
}

/** The same handle as container/grains.mjs's startGrains, on the light chain. */
export function startGrains({ queue, target, set = {}, patch = { name: PATCHES[0].name }, resume = null, hold = false }, { openSink, say = () => {}, fail = () => {}, onMp3 = null,
  inputs = 2, ghost = null, onChain = null, onBlock = null } = {}) {
  const m = { stopped: false, sink: null, onAir: false, startedAt: Date.now(), first: null, sent: 0, frames: 0, bytes: 0, down: 0, sinkDeaths: 0, sinkFails: 0, chainStarts: 0,
    ahead: 0, outRms: null, outPeak: null, held: !!hold, lined: !resume?.wall, aligned: !resume?.wall, align: null, goAt: null, onAirAt: null,
    wall0: null, lateAt: [], stallAt: [], minLead: Infinity, maxLead: -Infinity, late: 0, loops: 0, maxBlocks: 0, stallMs: 0 };
  const first = clampPatch(patch);
  const g = { patch: first.patch, values: { ...RING_DEFAULTS, ...first.values }, mix: first.values.mix ?? 1 };
  delete g.values.mix;
  const lead = resume?.wall ? (Date.now() - resume.wall) / 1000 + (resume.leadS ?? ALIGN_LEAD_S) : 0;
  const engine = createEngine({ open: (it, o) => openDecoder(it, { log: say, ...o }), queue, set, log: say,
    resume: resume ? { from: Math.max(0, (resume.pos || 0) + lead), cycleT: (resume.cycleT || 0) + lead } : null });
  let chain = null, enc = null, writing = Promise.resolve();
  const newEncoder = () => openEncoder({ log: say, onFrame: (f) => {
    if (m.first == null) m.first = Date.now();
    onMp3?.(f);
    if (!m.sink || m.sink.closed) return;
    writing = writing.then(() => m.sink?.write(f.data)).then(() => { m.sent += f.seconds; m.frames++; m.bytes += f.data.length; }).catch(() => {});
  } });
  async function connect(why, backoff = BACKOFF_MS) {
    const t0 = Date.now();
    for (let i = 0; !m.stopped; i++) {
      try {
        m.sink = await openSink(target, engine.status().slots.find((x) => x.title)?.title);
        m.onAir = true; m.onAirAt ??= Date.now(); say(why ? `light ${why === 'go' ? 'on air, handed over,' : 'back on air'} after ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'light on air');
        return;
      } catch (e) { fail(e); m.sinkFails++; await sleep(backoff[Math.min(i, backoff.length - 1)]); }
    }
  }
  // what the engine has heard is exact here: the mix less what waits in the FIFO; no ring to estimate
  const heard = () => (chain ? engine.seconds - chain.pending / SR : 0);
  async function align() {
    const t0 = Date.now(), at = () => resume.pos + (Date.now() - resume.wall) / 1000;
    let skipped = 0, waited = 0;
    while (!m.stopped && Date.now() - t0 < 15000) {
      const d = at() - engine.onPlayed;
      if (Math.abs(d) < 0.005) break;
      if (d < 0) { const ms = Math.min(-d * 1000, 10000); waited += ms; await sleep(ms); continue; }
      const got = engine.skip(d); skipped += got;
      if (got < d - 0.005) await sleep(50);
    }
    m.align = { errMs: +((at() - engine.onPlayed) * 1000).toFixed(1), skippedS: +skipped.toFixed(3), waitedMs: Math.round(waited), ms: Date.now() - t0 };
    m.lined = true; m.aligned = true;   // the clock is the wall and heard() is exact, so there is nothing to settle
    say(`lined up with the station: ${m.align.errMs} ms off`);
  }
  let ss = 0, pk = 0, n = 0, encHave = 0;
  const encBuf = Buffer.alloc((ENC_FRAMES + BLOCK * 4) * 4);
  const tapOut = (b) => {
    for (let i = 0; i + 1 < b.length; i += 2) { const v = b.readInt16LE(i) / 32768; ss += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); n++; }
    if (n >= SR * 2) { m.outRms = ss ? +(10 * Math.log10(ss / n)).toFixed(1) : null; m.outPeak = pk ? +(20 * Math.log10(pk)).toFixed(1) : null; ss = pk = n = 0; }
    globalThis.__lightTap?.(b);
    // LAME takes ENC_FRAMES at a time: one pipe write a tenth of a second, not one per tuner block
    b.copy(encBuf, encHave); encHave += b.length;
    if (encHave >= ENC_FRAMES * 4) { enc?.write(Buffer.from(encBuf.subarray(0, encHave))); encHave = 0; }
  };
  /** One tuner block through the engine and out. */
  function block() {
    engine.block();
    const mono = engine.mono;
    onBlock?.(mono);
    const x = inputs >= 4 ? ghost?.(mono.length) : null;
    const y = chain.push(mono, x);
    if (y.length) tapOut(y);
  }
  (async () => {
    engine.start();
    say(`light: first file ready in ${await engine.ready()} ms`);
    enc = newEncoder();
    if (!hold) connect(null);
    while (!m.stopped && !chain) {
      try { m.chainStarts++; chain = await startChain({ values: g.values, mix: g.mix, inputs, log: say }); }
      catch (e) { fail(e); await sleep(2000); }
    }
    if (onChain) Promise.resolve().then(() => onChain(chain)).catch((e) => fail(e));
    if (!m.lined) await align();
    m.wall0 = Date.now() - engine.seconds * 1000;   // the wall the mix is paced on: second s of the mix is due at wall0 + s
    let lastLoop = Date.now();
    while (!m.stopped) {
      const now = Date.now();
      if (now - lastLoop > 100) m.stallMs = Math.max(m.stallMs, now - lastLoop);
      const lastLoop0 = lastLoop; lastLoop = now; m.loops++;
      if (m.onAir && (!m.sink || m.sink.closed)) {
        m.onAir = false; m.sinkDeaths++; fail(new Error(`source connection lost: ${m.sink?.why || 'closed'}`));
        const t0 = Date.now(); connect('lost').then(() => { m.down += (Date.now() - t0) / 1000; });
      }
      if (enc.exited) { say(`encoder gone (${enc.error || 'exited'}), starting another`); enc = newEncoder(); }
      const wallS = (now - m.wall0) / 1000, leadNow = heard() - wallS;
      if (m.frames || engine.seconds > 1) { m.minLead = Math.min(m.minLead, leadNow); m.maxLead = Math.max(m.maxLead, leadNow); }
      if (leadNow < 0) { m.late++; chain.counts.late++; if (m.lateAt.length < 12) m.lateAt.push(+engine.seconds.toFixed(1)); }
      if (now - lastLoop0 > 300 && m.stallAt.length < 12) m.stallAt.push([+engine.seconds.toFixed(1), now - lastLoop0]);
      // never more than LEAD_S ahead; at most 20 blocks (0.4 s) a pass so the event loop breathes
      let k = 0;
      while (!m.stopped && engine.seconds < wallS + LEAD_S && k < 20) { block(); k++; }
      m.maxBlocks = Math.max(m.maxBlocks, k);
      m.ahead = engine.seconds - wallS;
      await sleep(LOOP_MS);
    }
  })().catch((e) => fail(e)).finally(() => { engine.close(); chain?.close(); enc?.kill(); m.sink?.close(); });

  return {
    engine, heard, clockHeard: heard,
    set: (name, v) => engine.set(name, v),
    queue: (q) => engine.queue(q),
    next: () => engine.next(),
    patch(p) {
      const c = clampPatch(p);
      if (c.values.mix != null) { g.mix = c.values.mix; }
      const vals = { ...c.values }; delete vals.mix;
      Object.assign(g.values, vals); if (c.patch) g.patch = c.patch; else if (Object.keys(vals).length) g.patch = null;
      if (chain && !chain.dead) { chain.set(c.values); if (c.patch) chain.land(); }
      return c;
    },
    get chain() { return chain; },
    get aligned() { return m.aligned; },
    go() { if (!m.held) return false; m.held = false; m.goAt = Date.now(); connect('go', GO_RETRY_MS); return true; },
    stop() { m.stopped = true; m.sink?.close(); },
    status() {
      const e = engine.status(), now = Date.now(), wallOut = m.first ? (now - m.first) / 1000 : 0;
      return { ...e, mode: 'grains', onAir: m.onAir, since: m.startedAt, seconds: +engine.seconds.toFixed(2), mp3Seconds: +m.sent.toFixed(2),
        wall: +((now - m.startedAt) / 1000).toFixed(2), backlog: +(engine.seconds - heard()).toFixed(3), lag: +(wallOut - (enc?.seconds ?? 0)).toFixed(2), ahead: +m.ahead.toFixed(2), down: +m.down.toFixed(1),
        frames: m.frames, bytes: m.bytes, sinkDeaths: m.sinkDeaths, sinkFails: m.sinkFails, usage: usage(),
        held: m.held, aligned: m.aligned, align: m.align, clockBacklog: +(engine.seconds - heard()).toFixed(3), goMs: m.goAt && m.onAirAt ? m.onAirAt - m.goAt : null,
        light: { minLead: +m.minLead.toFixed(3), maxLead: +m.maxLead.toFixed(3), late: m.late, lateAt: m.lateAt, stallAt: m.stallAt, loops: m.loops, maxBlocks: m.maxBlocks, stallMs: m.stallMs, leadS: LEAD_S },
        grains: { patch: g.patch, mix: g.mix, values: g.values, out: { rms: m.outRms, peak: m.outPeak }, chainStarts: m.chainStarts, chain: chain?.status() ?? null } };
    },
  };
}
