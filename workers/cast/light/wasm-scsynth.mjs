// The vendored SuperSonic scsynth (demo/shell/vendor/scsynth-nrt.wasm, the engine LOCAL runs in a tab) hosted in
// node, in this thread: the vendor's own AudioWorklet processor is evaluated with a stand-in for the Web Audio
// globals, and node calls its process() one 128 frame quantum at a time. No AudioContext, no JACK, no UDP.
// The processor runs in postMessage mode, so OSC goes in and replies come out as port messages.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// in the image, demo/shell/vendor is mounted (or would be copied, as SC_FILES are) at LIGHT_VENDOR
const VENDOR = process.env.LIGHT_VENDOR || fileURLToPath(new URL('../../../demo/shell/vendor/', import.meta.url));
export const QUANTUM = 128;
// SuperSonic's memory layout (supersonic.js `T`), the defaults a tab gets
const MEM = { wasmHeapSize: 25165824, memArenaSize: 33554432, ringBufferReserved: 2097152, guestMemorySize: 4194304, inboxSize: 4194304, outboxSize: 4194304 };
MEM.outboxOffset = MEM.wasmHeapSize + MEM.ringBufferReserved + MEM.memArenaSize;
MEM.guestMemoryOffset = MEM.outboxOffset + MEM.outboxSize;
MEM.inboxOffset = MEM.guestMemoryOffset + MEM.guestMemorySize;
MEM.totalMemory = MEM.inboxOffset + MEM.inboxSize;

/** supersonic.js `xs`: the world options as the 72 bytes the engine reads at boot. */
function guestConfig(o) {
  const t = new ArrayBuffer(72), s = new Uint32Array(t);
  s[0] = o.numBuffers ?? 1024; s[1] = o.maxNodes ?? 1024; s[2] = o.maxGraphDefs ?? 1024; s[3] = o.maxWireBufs ?? 64;
  s[4] = o.numAudioBusChannels ?? 128; s[5] = o.numInputBusChannels ?? 0; s[6] = o.numOutputBusChannels ?? 2; s[7] = o.numControlBusChannels ?? 4096;
  s[8] = 128; s[9] = o.realTimeMemorySize ?? 8192; s[10] = o.numRGens ?? 64; s[11] = 0; s[12] = 0; s[13] = 0; s[14] = 0; s[15] = o.verbosity ?? 0; s[17] = 1;
  return t;
}

// ── OSC, the shapes the cast sends: i f s b in, i f s b d out ──
const pad4 = (n) => (n + 3) & ~3;
const enc = new TextEncoder();
export function oscEncode(address, args = []) {
  const parts = [], str = (s) => { const b = enc.encode(s), o = new Uint8Array(pad4(b.length + 1)); o.set(b); parts.push(o); };
  str(address); str(',' + args.map((a) => (typeof a === 'string' ? 's' : a instanceof Uint8Array ? 'b' : Number.isInteger(a) ? 'i' : 'f')).join(''));
  for (const a of args) {
    if (typeof a === 'string') str(a);
    else if (a instanceof Uint8Array) { const n = new Uint8Array(4); new DataView(n.buffer).setInt32(0, a.length); const d = new Uint8Array(pad4(a.length)); d.set(a); parts.push(n, d); }
    else { const b = new Uint8Array(4), v = new DataView(b.buffer); if (Number.isInteger(a)) v.setInt32(0, a); else v.setFloat32(0, a); parts.push(b); }
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const dec = new TextDecoder('latin1');
export function oscDecode(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let o = 0;
  const str = () => { let e = o; while (e < u8.length && u8[e]) e++; const s = dec.decode(u8.subarray(o, e)); o = pad4(e + 1); return s; };
  const address = str();
  if (address === '#bundle') return [address];
  const tags = o < u8.length ? str() : ',', args = [];
  for (const t of tags.slice(1)) {
    if (t === 'i') { args.push(v.getInt32(o)); o += 4; } else if (t === 'f') { args.push(v.getFloat32(o)); o += 4; }
    else if (t === 'd') { args.push(v.getFloat64(o)); o += 8; } else if (t === 's') args.push(str());
    else if (t === 'b') { const n = v.getInt32(o); args.push(u8.slice(o + 4, o + 4 + n)); o = pad4(o + 4 + n); } else break;
  }
  return [address, ...args];
}

/**
 * Boots the engine. Resolves `{ send, ask, render(inputs, frames), output, status() }`: `inputs` is one Float32Array
 * per input bus channel, `render` runs ceil(frames / 128) quanta and returns the stereo output, planar.
 */
export async function bootWasm({ inputs = 4, outputs = 2, sr = 44100, log = () => {}, onReply = null, options = {} } = {}) {
  const src = readFileSync(`${VENDOR}clockwork_audio_worklet.js`, 'utf8');
  const wasmBytes = readFileSync(`${VENDOR}scsynth-nrt.wasm`);
  let Proc = null, toMain = null;
  const g = { currentTime: 0, currentFrame: 0, sampleRate: sr };
  class AudioWorkletProcessor { constructor() { this.port = { postMessage: (m) => toMain?.(m), onmessage: null, start() {}, close() {} }; } }
  const ctx = vm.createContext({
    AudioWorkletProcessor, registerProcessor: (n, c) => { Proc = c; },
    console: { log: (...a) => log(a.join(' ')), error: (...a) => log(`error: ${a.join(' ')}`), warn: (...a) => log(`warn: ${a.join(' ')}`) },
    WebAssembly, Atomics, SharedArrayBuffer, ArrayBuffer, Uint8Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView,
    TextDecoder, TextEncoder, Map, Set, Math, Date, Error, Object, Array, JSON, Number, String, BigInt, Promise, Symbol, Reflect, Boolean, RangeError, TypeError,
    MessagePort: class {}, crypto: globalThis.crypto, performance: globalThis.performance, setTimeout, clearTimeout,
  });
  Object.defineProperty(ctx, 'currentTime', { get: () => g.currentTime });
  Object.defineProperty(ctx, 'currentFrame', { get: () => g.currentFrame });
  Object.defineProperty(ctx, 'sampleRate', { get: () => g.sampleRate });
  vm.runInContext(src, ctx, { filename: 'clockwork_audio_worklet.js' });
  if (!Proc) throw new Error('the worklet registered no processor');
  const proc = new Proc({ numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [outputs], processorOptions: {} });
  const replies = [], waiters = [];
  const deliver = (m) => {
    if (onReply && onReply(m)) return;
    for (const w of waiters.slice()) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.t); w.ok(m); return; }
    replies.push(m); if (replies.length > 200) replies.shift();
  };
  let ready = null, booted;
  const up = new Promise((ok, no) => { ready = { ok, no }; });
  toMain = (m) => {
    if (m.type === 'initialized') { if (m.success) ready.ok(m); else ready.no(new Error(m.error || 'init failed')); return; }
    if (m.type === 'error') { log(`worklet error: ${m.error}`); ready.no(new Error(m.error)); return; }
    if (m.type === 'oscReplies' && m.count) {
      const b = new Uint8Array(m.buffer);
      for (let i = 0; i < m.count; i++) { const e = m.messages[i]; try { deliver(oscDecode(b.subarray(e.offset, e.offset + e.length))); } catch { /* malformed */ } }
    }
    if (m.type === 'requestNodeIdRange') post({ type: 'nodeIdRange', from: 1000000, to: 2000000 });
  };
  const post = (m) => proc.port.onmessage({ data: m, ports: [] });
  post({ type: 'init', mode: 'postMessage' });
  post({ type: 'loadWasm', wasmBytes, guestConfigBytes: guestConfig({ numInputBusChannels: inputs, numOutputBusChannels: outputs, ...options }),
    guestMemoryOffset: MEM.guestMemoryOffset, guestMemorySize: MEM.guestMemorySize, inboxOffset: MEM.inboxOffset, inboxSize: MEM.inboxSize,
    outboxOffset: MEM.outboxOffset, outboxSize: MEM.outboxSize, memArenaSize: MEM.memArenaSize, inputChannels: inputs, outputChannels: outputs, sampleRate: sr,
    memoryPages: Math.ceil(MEM.totalMemory / 65536), maxMemoryPages: Math.ceil(MEM.totalMemory / 65536) });
  booted = await up;
  post({ type: 'listening' });

  const ins = [Array.from({ length: inputs }, () => new Float32Array(QUANTUM))];
  const outs = [Array.from({ length: outputs }, () => new Float32Array(QUANTUM))];
  let quanta = 0;
  const send = (address, ...args) => post({ type: 'osc', oscData: oscEncode(address, args), sourceId: 0 });
  const ask = (test, ms, address, ...args) => new Promise((ok) => {
    const w = { test, ok, t: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); ok(null); }, ms) };
    waiters.push(w); send(address, ...args);
  });
  /** One quantum: `inp(ch, buf)` fills each input channel, the output is left in `outs[0]`. */
  function quantum(fill) {
    for (let c = 0; c < inputs; c++) fill(c, ins[0][c]);
    g.currentTime = quanta * QUANTUM / sr; g.currentFrame = quanta * QUANTUM;
    proc.process(ins, outs, {});
    quanta++;
    return outs[0];
  }
  return {
    proc, booted, send, ask, quantum, replies,
    get quanta() { return quanta; },
    get seconds() { return quanta * QUANTUM / sr; },
    /** Polls replies until the engine answers (each wait runs quanta, since replies leave only from process()). */
    async pump(ms = 20) { const t = Date.now(); while (Date.now() - t < ms) { quantum((c, b) => b.fill(0)); await new Promise((r) => setImmediate(r)); } },
  };
}
