// Edgecast's chain, with no Cloudflare import so node can run it (chain-test.mjs): the ring, the layers, the
// master, and two insert slots a visitor may put a program in while it plays. worker.mjs hands it the wasm module
// and the glue; node compiles the same wasm itself.
//
// The order of nodes and the busses between them, every quantum:
//   layers (5101..5105) -> ring 4000 and lroom 5199 write MASTER_BUS 12-13
//   slot 0, "before the master": reads `in` (12-13), writes PRE_BUS 20-21
//   master 4100: reads 20-21, writes POST_BUS 22-23
//   slot 1, "after the master": reads `in` (22-23), writes 0-1, which is what goes back over the socket
// Both slots start with THROUGH. Slot 0 is where an effect belongs; the master's leveller (6 s window, glide 3 s)
// then levels whatever it makes, so a gain there is undone within seconds. Slot 1 is heard exactly as written.
// A program replaces its slot's node with /s_new addAction 4 (replace), sent as /d_recv's completion message,
// so the new node runs from the first quantum after the def is in and the old one is gone in the same quantum.
import { QUANTUM, MEM, bootWasm, oscEncode } from './engine.mjs';
import { PROGRAM, RING_SECONDS } from '../../demo/granulator/grain-ring.mjs';
import { compile } from '../../demo/shell/sclang-lite.mjs';
import { program as masterProgram, MASTER_BUS } from '../../demo/radio/cast/master.mjs';
import { clampPatch } from '../cast/container/grain-patch.mjs';
import * as LAYERS from '../../demo/radio/cast/layers.mjs';
import * as LIFE from '../../demo/radio/cast/life.mjs';

export const SR = 48000, NODE = 4000, BUF = 0, DEF = 'gring', MASTER_NODE = 4100, INPUTS = 4;
export const PRE_BUS = 20, POST_BUS = 22;
/** The two slots: where each reads, where it writes, and where it sits in the order. */
export const SLOTS = [
  { name: 'before the master', in: MASTER_BUS, out: PRE_BUS },
  { name: 'after the master', in: POST_BUS, out: 0 },
];
export const THROUGH = '{ In.ar(\\in.kr(0), 2) }';
/** What a visitor may send: the source's size in bytes, one program a second, the graph's size in UGens. */
export const LIMITS = { srcBytes: 8192, programEveryMs: 1000, blocks: 256, setsPerSecond: 120 };
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function startChain({ wasmModule, glue, mode = 'full', seed = 7, log = () => {} }) {
  const t = { t0: Date.now(), p0: performance.now() };
  const good = compile(PROGRAM, { name: DEF, bus: MASTER_BUS });
  if (!good.ok) throw new Error(`the ring did not compile: ${good.message}`);
  const mst = compile(masterProgram(PRE_BUS), { name: 'lmaster', bus: POST_BUS });
  if (!mst.ok) throw new Error(`the master did not compile: ${mst.message}`);
  const thr = SLOTS.map((s, i) => compile(THROUGH, { name: `ins${i}_0`, bus: s.out }));
  t.compileMs = performance.now() - t.p0;
  const waiters = [];
  let grains = 0;
  const w = await bootWasm({ wasmModule, glue, inputs: INPUTS, sr: SR, log, onReply: (m) => {
    if (m[0] === '/grain') { grains++; return; }
    for (const x of waiters.slice()) if (x.test(m)) { waiters.splice(waiters.indexOf(x), 1); clearTimeout(x.t); x.ok(m); return; }
  } });
  t.bootMs = performance.now() - t.p0;
  const send = (a, ...args) => w.send(a, ...args);
  // a waiter that resolves on a reply, which only leaves from process(): the stream's own quanta, or pumped ones
  const wait = (test, ms) => new Promise((ok) => { const x = { test, ok, t: setTimeout(() => { waiters.splice(waiters.indexOf(x), 1); ok(null); }, ms) }; waiters.push(x); });
  // before the stream runs, waiting means pumping silent quanta
  const sendAndWait = async (test, ms, address, ...args) => {
    let r, done = false;
    const p = wait(test, ms);
    p.then((x) => { r = x; done = true; });
    send(address, ...args);
    for (let i = 0; i < 4000 && !done; i++) { w.quantum((c, b) => b.fill(0)); if (i % 8 === 7) await tick(); }
    return r;
  };
  const isDone = (cmd) => (m) => (m[0] === '/done' && m[1] === cmd) || (m[0] === '/fail' && m[1] === cmd);
  if (!await sendAndWait(isDone('/notify'), 3000, '/notify', 1)) throw new Error('wasm scsynth did not answer /notify');
  if ((await sendAndWait(isDone('/b_alloc'), 5000, '/b_alloc', BUF, RING_SECONDS * SR, 1))?.[0] !== '/done') throw new Error('the ring buffer was not allocated');
  const life = LIFE.createLife({ seed });
  const s = life.scene(0);
  // freeze 0 as live.mjs does for a patch that freezes after the dry part (freezesAfterDry): a frozen empty ring is silent
  const vals = { ...LIFE.patchValues(s.patch), mix: 1, ...(LIFE.freezesAfterDry(s.patch) ? { freeze: 0 } : {}) };
  let slots = null;
  if (mode !== 'echo') {
    const def = await sendAndWait(isDone('/d_recv'), 5000, '/d_recv', good.bytes);
    if (def?.[0] !== '/done') throw new Error(`the engine did not take the ring: ${def ? def.join(' ') : 'no answer'}`);
    const go = await sendAndWait((m) => (m[0] === '/n_go' && m[1] === NODE) || (m[0] === '/fail' && m[1] === '/s_new'), 5000,
      '/s_new', DEF, NODE, 1, 0, 'buf', BUF, 'inbus', 2, ...Object.entries(vals).filter(([, v]) => typeof v === 'number').flat());
    if (go?.[0] !== '/n_go') throw new Error(`the ring did not start: ${go ? go.join(' ') : 'no answer'}`);
    if ((await sendAndWait(isDone('/d_recv'), 5000, '/d_recv', mst.bytes))?.[0] !== '/done') throw new Error('the engine did not take the master');
    send('/s_new', 'lmaster', MASTER_NODE, 3, NODE);
    for (const r of thr) if ((await sendAndWait(isDone('/d_recv'), 5000, '/d_recv', r.bytes))?.[0] !== '/done') throw new Error('the engine did not take an insert');
    slots = SLOTS.map((sl, i) => ({ ...sl, node: 6000 + i * 1000, def: `ins${i}_0`, n: 0, controls: [], src: THROUGH }));
    // slot 0 just before the master, slot 1 just after it
    send('/s_new', slots[0].def, slots[0].node, 2, MASTER_NODE, 'in', slots[0].in);
    send('/s_new', slots[1].def, slots[1].node, 3, MASTER_NODE, 'in', slots[1].in);
  }
  let layers = null, layerN = 0;
  if (mode === 'full') {
    layers = await LAYERS.createLayerEngine({ send, sendAndWait }, { log, to: MASTER_BUS, before: MASTER_NODE });
    // every layer audible, so the measurement is the busy case rather than a scene's quiet start
    const L = { ...(s.layers || {}), drone: 'both', droneLevel: 0.4, res: s.layers?.res && s.layers.res !== 'none' ? s.layers.res : 'minor7', resWet: 0.4, resDecay: 1.5,
      harm: s.layers?.harm && s.layers.harm !== 'none' ? s.layers.harm : 'triad', harmSpread: 0.5, voc: 'fifths', ghost: 'none', room: 0.3, roomSize: 0.7 };
    layers.apply(L, s.key || { root: 0 });
    layers.level(1);
    layerN = Object.keys(LAYERS.PROGRAMS).length + 1;
  }
  t.chainMs = performance.now() - t.p0;
  t.chainWallMs = Date.now() - t.t0;
  return { w, send, wait, sendAndWait, slots, timing: t, scene: { patch: s.patch, layers: layerN, defBytes: good.bytes.length },
    get grains() { return grains; } };
}

const enc = new TextEncoder();
const controlsOf = (r) => (r.controls || []).filter((c) => c.name !== 'in').map((c) => ({ name: c.name, value: c.value, spec: c.spec }));

/**
 * The live half: `program(m)` and `set(m)` for one booted chain, each answering an object for the socket.
 * `program` resolves when the new node answers /n_go, which needs quanta to run (the stream's, or `pump`).
 * `now` is a clock that moves across I/O (Date.now on Cloudflare, where performance.now() stands still).
 */
export function createInserts(chain, { now = () => Date.now(), pump = null } = {}) {
  const { slots } = chain;
  let lastProgram = -Infinity, setBucket = { at: 0, n: 0 }, busy = false;
  async function program({ slot = 0, src } = {}) {
    const at = now();
    const p0 = performance.now();
    const no = (error, extra = {}) => ({ program: { ok: false, slot, error, ...extra } });
    if (!slots) return no('edgecast runs no engine in echo mode');
    if (!Number.isInteger(slot) || !slots[slot]) return no(`there is no slot ${JSON.stringify(slot)}; the slots are 0 (${SLOTS[0].name}) and 1 (${SLOTS[1].name})`);
    if (typeof src !== 'string') return no('a program is sent as src, a string of sclang-lite');
    const bytes = enc.encode(src).length;
    if (bytes > LIMITS.srcBytes) return no(`that program is ${bytes} bytes and edgecast takes ${LIMITS.srcBytes}`);
    if (busy) return no('the last program is still being put in');
    if (at - lastProgram < LIMITS.programEveryMs) return no(`one program a second; wait ${Math.ceil((LIMITS.programEveryMs - (at - lastProgram)) / 100) / 10} s`);
    lastProgram = at;
    const s = slots[slot], n = s.n + 1, def = `ins${slot}_${n}`;
    const r = compile(src, { name: def, bus: s.out });
    const compileMs = performance.now() - p0;
    if (!r.ok) return no(r.message, { compileMs, line: r.line, col: r.col });
    if (r.blocks > LIMITS.blocks) return no(`that program has ${r.blocks} UGens and a slot takes ${LIMITS.blocks}`, { compileMs });
    if (r.freesItself) return no('that program frees itself (doneAction: 2), which would leave its slot silent', { compileMs });
    const node = s.node + n;
    const go = chain.wait((m) => (m[0] === '/n_go' && m[1] === node) || m[0] === '/fail', 3000);
    busy = true;
    let done = false;
    chain.send('/d_recv', r.bytes, oscBlob('/s_new', def, node, 4, s.node, 'in', s.in));
    if (pump) pump(() => done);
    const m = await go;
    done = true;
    busy = false;
    if (!m || m[0] !== '/n_go') return no(m ? `the engine refused it: ${m.slice(1).join(' ')}` : 'the engine did not start it within 3 s', { compileMs });
    chain.send('/d_free', s.def);
    Object.assign(s, { node, def, n, controls: controlsOf(r), src });
    return ({ program: { ok: true, slot, ms: now() - at, compileMs, bytes: r.bytes.length, blocks: r.blocks, wires: r.wires, controls: s.controls,
      warnings: (r.warnings || []).filter((x) => !/freq argument|doneAction|gate is/.test(x)) } });
  }
  function set({ slot = 0, params = {} } = {}) {
    const no = (error) => ({ set: { ok: false, slot, error } });
    if (!slots) return no('edgecast runs no engine in echo mode');
    if (!params || typeof params !== 'object') return no('set takes params, an object of name to number');
    const t = now();
    if (t - setBucket.at >= 1000) setBucket = { at: t, n: 0 };
    if (++setBucket.n > LIMITS.setsPerSecond) return no(`at most ${LIMITS.setsPerSecond} sets a second`);
    const applied = {}, refused = [];
    if (slot === 'ring') {
      const c = clampPatch({ set: params });
      Object.assign(applied, c.values); refused.push(...c.refused);
      if (Object.keys(applied).length) chain.send('/n_set', NODE, ...Object.entries(applied).flat());
      return { set: { ok: refused.length === 0, slot, applied, refused } };
    }
    const s = slots[slot];
    if (!s) return no(`there is no slot ${JSON.stringify(slot)}; the slots are 0, 1 and "ring"`);
    for (const [k, v] of Object.entries(params)) {
      const c = s.controls.find((x) => x.name === k), x = Number(v);
      if (!c || !Number.isFinite(x)) { refused.push(k); continue; }
      const lo = Math.min(c.spec.min, c.spec.max), hi = Math.max(c.spec.min, c.spec.max);
      applied[k] = Math.min(hi, Math.max(lo, x));
    }
    if (Object.keys(applied).length) chain.send('/n_set', s.node, ...Object.entries(applied).flat());
    return { set: { ok: refused.length === 0, slot, applied, refused } };
  }
  return { program, set, get slots() { return slots?.map(({ name, node, def, controls }) => ({ name, node, def, controls })) ?? null; } };
}

// an OSC message as a blob, for /d_recv's completion message
const oscBlob = (address, ...args) => oscEncode(address, args);
export { QUANTUM, MEM };
