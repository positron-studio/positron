// startGrains' handle (container/grains.mjs, light/grains-light.mjs) for a Durable Object: the tuner (mixer.mjs),
// the vendored wasm scsynth with the ring and the master, and LAME in wasm, all in one isolate. Nothing runs by
// itself: the station calls render(seconds), which makes that much sound, advances the driver's audio clock (vclock)
// after every block, and hands whole MP3 frames to onMp3. The station paces render() on the wall.
import { PROGRAM, PATCHES, DEFAULTS as RING_DEFAULTS, RING_SECONDS, valuesOf } from '../../demo/granulator/grain-ring.mjs';
import { clampPatch, PATCH_LIMITS } from '../cast/container/grain-patch.mjs';
import { compile } from '../../demo/shell/sclang-lite.mjs';
import { createEngine, BLOCK } from '../cast/container/mixer.mjs';
import { program as masterProgram, MASTER_BUS } from '../../demo/radio/cast/master.mjs';
import { createFramer } from '../cast/mp3.mjs';
import { bootWasm, QUANTUM } from './engine.mjs';
import { openDecoder } from './source.mjs';
import { createMp3Encoder } from './codec.mjs';
import { T } from './vclock.mjs';

export { PATCHES, clampPatch, PATCH_LIMITS };
export const SR = 44100, NODE = 4000, BUF = 0, DEF = 'gring', MASTER_NODE = 4100;
const ENC_FRAMES = 1152 * 4;
const ctx = { wasmModule: null, glue: null, lameModule: null };
/** The station hands over the modules its bundler compiled (a Worker may not compile wasm at runtime). */
export function configureEngine(c) { Object.assign(ctx, c); }
const tick = () => new Promise((r) => setTimeout(r, 0));

/** The engine with the ring and the master loaded, grains-light's startChain on edgecast's bootWasm. */
export async function startChain({ values = valuesOf(PATCHES[0]), mix = 1, inputs = 4, log = () => {} } = {}) {
  const t0 = Date.now(), counts = { grains: 0, quanta: 0 };
  const good = compile(PROGRAM, { name: DEF, bus: MASTER_BUS });
  if (!good.ok) throw new Error(`the ring did not compile: ${good.message}`);
  const mst = compile(masterProgram(MASTER_BUS), { name: 'lmaster' });
  if (!mst.ok) throw new Error(`the master did not compile: ${mst.message}`);
  const waiters = [];
  const w = await bootWasm({ wasmModule: ctx.wasmModule, glue: ctx.glue, inputs, sr: SR, log: (l) => log(`wasm: ${l}`), onReply: (m) => {
    if (m[0] === '/grain') { counts.grains++; return; }
    const o = { address: m[0], args: m.slice(1) };
    for (const x of waiters.slice()) if (x.test(o)) { waiters.splice(waiters.indexOf(x), 1); clearTimeout(x.t); x.ok(o); return; }
  } });
  const send = (address, ...args) => w.send(address, ...args);
  const ask = (test, ms, address, ...args) => new Promise((ok) => {
    const x = { test, ok, t: setTimeout(() => { const i = waiters.indexOf(x); if (i >= 0) waiters.splice(i, 1); ok(null); }, ms) };
    waiters.push(x); send(address, ...args);
  });
  // before the station renders, replies only leave from process(): the boot runs silent quanta itself
  const boot = async (p) => { let r; p.then((x) => { r = x; }); for (let i = 0; i < 4000 && r === undefined; i++) { w.quantum((c, b) => b.fill(0)); if (i % 8 === 7) await tick(); } return r; };
  const done = (cmd) => (m) => (m.address === '/done' && m.args[0] === cmd) || (m.address === '/fail' && m.args[0] === cmd);
  if (!await boot(ask(done('/notify'), 3000, '/notify', 1))) throw new Error('wasm scsynth did not answer /notify');
  if ((await boot(ask(done('/b_alloc'), 5000, '/b_alloc', BUF, RING_SECONDS * SR, 1)))?.address !== '/done') throw new Error('the ring buffer was not allocated');
  if ((await boot(ask(done('/d_recv'), 5000, '/d_recv', good.bytes)))?.address !== '/done') throw new Error('the engine did not take the ring');
  const go = await boot(ask((m) => (m.address === '/n_go' && m.args[0] === NODE) || (m.address === '/fail' && m.args[0] === '/s_new'), 5000,
    '/s_new', DEF, NODE, 1, 0, 'buf', BUF, 'inbus', 2, 'mix', mix, ...Object.entries(values).flat()));
  if (go?.address !== '/n_go') throw new Error('the ring did not start');
  if ((await boot(ask(done('/d_recv'), 5000, '/d_recv', mst.bytes)))?.address !== '/done') throw new Error('the engine did not take the master');
  send('/s_new', 'lmaster', MASTER_NODE, 3, NODE);
  const bootMs = Date.now() - t0;
  log(`station: wasm chain up in ${bootMs} ms, ring ${good.bytes.length} B`);

  const cap = BLOCK * 4, fm = new Float32Array(cap), fx = new Float32Array(cap), oL = new Float32Array(cap), oR = new Float32Array(cap);
  let have = 0;
  const ch = {
    dead: null, counts, send, ask, bootMs, inputs,
    get pending() { return have; },
    get quanta() { return w.quanta; },
    memoryBytes: () => w.memoryBytes(),
    /** A block of the mix (mono) and the ghost's (or null) in; `{ L, R, n }` of the engine's output out. */
    push(mono, x) {
      fm.set(mono, have); if (x) fx.set(x, have); else fx.fill(0, have, have + mono.length);
      have += mono.length;
      let q = 0;
      while (have - q * QUANTUM >= QUANTUM) {
        const s = q * QUANTUM;
        const y = w.quantum((c, b) => { if (c < 2) b.set(fm.subarray(s, s + QUANTUM)); else if (c < 4) b.set(fx.subarray(s, s + QUANTUM)); else b.fill(0); });
        oL.set(y[0], s); oR.set(y[1], s);
        q++;
      }
      counts.quanta += q;
      const used = q * QUANTUM;
      if (used) { fm.copyWithin(0, used, have); fx.copyWithin(0, used, have); have -= used; }
      return { L: oL, R: oR, n: used };
    },
    set(vals) { const e = Object.entries(vals); if (e.length) send('/n_set', NODE, ...e.flat()); },
    land() { send('/n_set', NODE, 'sync', 1); T.setTimeout(() => send('/n_set', NODE, 'sync', 0), 40); },
    close() { ch.closed = true; },
  };
  return ch;
}

/** The same handle as container/grains.mjs's startGrains, plus `render(seconds)` and `ready`. */
export function startGrains({ queue, set = {}, patch = { name: PATCHES[0].name } }, { say = () => {}, fail = () => {}, onMp3 = null,
  inputs = 2, ghost = null, onChain = null, onBlock = null } = {}) {
  const m = { stopped: false, startedAt: Date.now(), ready: false, frames: 0, bytes: 0, mp3S: 0, outRms: null, outPeak: null, peakMax: 0, clipped: 0 };
  const first = clampPatch(patch);
  const g = { patch: first.patch, values: { ...RING_DEFAULTS, ...first.values }, mix: first.values.mix ?? 1 };
  delete g.values.mix;
  const engine = createEngine({ open: (it, o) => openDecoder(it, { log: say, ...o }), queue, set, log: say });
  let chain = null, enc = null;
  const framer = createFramer();
  const eL = new Float32Array(ENC_FRAMES + BLOCK * 2), eR = new Float32Array(ENC_FRAMES + BLOCK * 2);
  let eHave = 0, ss = 0, pk = 0, n = 0;
  const heard = () => (chain ? engine.seconds - chain.pending / SR : 0);
  const emit = (bytes) => { for (const f of framer.push(bytes)) { m.frames++; m.bytes += f.data.length; m.mp3S += f.seconds; onMp3?.(f); } };
  function block() {
    engine.block();
    const mono = engine.mono;
    onBlock?.(mono);
    const x = inputs >= 4 ? ghost?.(mono.length) : null;
    const y = chain.push(mono, x);
    for (let i = 0; i < y.n; i++) {
      let l = y.L[i], r = y.R[i];
      const a = Math.max(Math.abs(l), Math.abs(r));
      if (a > pk) pk = a;
      if (a > 1) { m.clipped++; l = Math.max(-1, Math.min(1, l)); r = Math.max(-1, Math.min(1, r)); }
      ss += (l * l + r * r) / 2; n++;
      eL[eHave] = l; eR[eHave] = r; eHave++;
    }
    if (n >= SR * 2) { m.outRms = ss ? +(10 * Math.log10(ss / n)).toFixed(1) : null; m.outPeak = pk ? +(20 * Math.log10(pk)).toFixed(1) : null; m.peakMax = Math.max(m.peakMax, pk); ss = pk = n = 0; }
    if (eHave >= ENC_FRAMES) { emit(enc.encode(eL.subarray(0, eHave), eR.subarray(0, eHave))); eHave = 0; }
    T.advance(engine.seconds * 1000);
  }
  const up = (async () => {
    engine.start();
    say(`station: first file ready in ${await engine.ready()} ms`);
    enc = await createMp3Encoder(ctx.lameModule, { sampleRate: SR, kbps: 128 });
    chain = await startChain({ values: g.values, mix: g.mix, inputs, log: say });
    if (onChain) Promise.resolve().then(() => onChain(chain)).catch((e) => fail(e));
    m.ready = true;
  })().catch((e) => { fail(e); m.error = String(e.message || e); throw e; });

  return {
    engine, heard, clockHeard: heard, up,
    get ready() { return m.ready; },
    get encoder() { return enc; },
    /** Renders `seconds` of sound now, yielding every `yieldBlocks` so replies and timers land; answers the seconds made. */
    async render(seconds, { yieldBlocks = 25 } = {}) {
      if (!m.ready || m.stopped) return 0;
      const blocks = Math.max(0, Math.round(seconds * SR / BLOCK));
      for (let k = 0; k < blocks && !m.stopped; k++) { block(); if (k % yieldBlocks === yieldBlocks - 1) await tick(); }
      return blocks * BLOCK / SR;
    },
    set: (name, v) => engine.set(name, v),
    queue: (q) => engine.queue(q),
    next: () => engine.next(),
    patch(p) {
      const c = clampPatch(p);
      if (c.values.mix != null) g.mix = c.values.mix;
      const vals = { ...c.values }; delete vals.mix;
      Object.assign(g.values, vals); if (c.patch) g.patch = c.patch; else if (Object.keys(vals).length) g.patch = null;
      if (chain && !chain.dead) { chain.set(c.values); if (c.patch) chain.land(); }
      return c;
    },
    get chain() { return chain; },
    get aligned() { return true; },
    go() { return false; },
    stop() { m.stopped = true; engine.close(); chain?.close(); },
    status() {
      const e = engine.status();
      return { ...e, mode: 'grains', seconds: +engine.seconds.toFixed(2), mp3Seconds: +m.mp3S.toFixed(2), frames: m.frames, bytes: m.bytes,
        backlog: +(engine.seconds - heard()).toFixed(3), clockBacklog: +(engine.seconds - heard()).toFixed(3),
        grains: { patch: g.patch, mix: g.mix, out: { rms: m.outRms, peak: m.outPeak, peakMax: m.peakMax ? +(20 * Math.log10(m.peakMax)).toFixed(2) : null, clipped: m.clipped },
          quanta: chain?.quanta ?? 0, grains: chain?.counts.grains ?? 0 } };
    },
  };
}
