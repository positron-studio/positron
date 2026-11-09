// demo/shell/scsynth-sync.mjs: the vendored SuperSonic scsynth run synchronously, one 128 frame quantum per call, with
// no AudioContext: in a Web Worker, in node, and (given a bundled module and glue) in workerd. The caller owns the clock,
// so the same code renders in real time or as fast as it can. workers/edgecast/engine.mjs is the workerd twin.
// why: plans/plan-v2in-for-positron.md section 9.3

export const QUANTUM = 128;
// SuperSonic's memory layout (supersonic.js `T`), the defaults a tab gets
const MEM = { wasmHeapSize: 25165824, memArenaSize: 33554432, ringBufferReserved: 2097152, guestMemorySize: 4194304, inboxSize: 4194304, outboxSize: 4194304 };
MEM.outboxOffset = MEM.wasmHeapSize + MEM.ringBufferReserved + MEM.memArenaSize;
MEM.guestMemoryOffset = MEM.outboxOffset + MEM.outboxSize;
MEM.inboxOffset = MEM.guestMemoryOffset + MEM.guestMemorySize;
MEM.totalMemory = MEM.inboxOffset + MEM.inboxSize;

function guestConfig(o) {
  const t = new ArrayBuffer(72), s = new Uint32Array(t);
  s[0] = o.numBuffers ?? 1024; s[1] = o.maxNodes ?? 1024; s[2] = o.maxGraphDefs ?? 1024; s[3] = o.maxWireBufs ?? 64;
  s[4] = o.numAudioBusChannels ?? 128; s[5] = o.numInputBusChannels ?? 0; s[6] = o.numOutputBusChannels ?? 2; s[7] = o.numControlBusChannels ?? 4096;
  s[8] = 128; s[9] = o.realTimeMemorySize ?? 8192; s[10] = o.numRGens ?? 64; s[11] = 0; s[12] = 0; s[13] = 0; s[14] = 0; s[15] = o.verbosity ?? 0; s[17] = 1;
  return t;
}

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
    else if (t === 's') args.push(str());
    else if (t === 'b') { const n = v.getInt32(o); o += 4; args.push(u8.slice(o, o + n)); o = pad4(o + n); }
    else if (t === 'd') { args.push(v.getFloat64(o)); o += 8; }
  }
  return [address, ...args];
}

/** The vendor's worklet source as a function of the globals it reads, without eval at its call. */
export const glueOf = (source) => new Function('WebAssembly', 'AudioWorkletProcessor', 'registerProcessor', 'console',
  source.replace(/\/\/# sourceMappingURL=.*$/m, ''));

/**
 * Loads what a browser needs from the deployed vendor folder: `{ wasmModule, glue }` for bootSync.
 * `base` is where demo/shell/vendor/ is served, `/shell/vendor/` on the site.
 */
export async function loadVendor(base = '/shell/vendor/') {
  const [wasmModule, src] = await Promise.all([
    WebAssembly.compileStreaming ? WebAssembly.compileStreaming(fetch(`${base}scsynth-nrt.wasm`)) : fetch(`${base}scsynth-nrt.wasm`).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b)),
    fetch(`${base}clockwork_audio_worklet.js`).then((r) => r.text()),
  ]);
  return { wasmModule, glue: glueOf(src) };
}

/**
 * Boots one engine. Resolves `{ send, ask, quantum(fill), quanta }`: `send(address, ...args)` posts OSC,
 * `ask(test, ms, address, ...args)` posts and resolves the first reply `test` accepts (or null after `ms` of engine
 * time, counted in quanta the caller runs), `quantum(fill)` calls `fill(channel, Float32Array)` for each input and
 * returns the outputs of one quantum. The worklet's free globals are getters on globalThis: one engine per realm.
 */
export async function bootSync({ wasmModule, glue, inputs = 4, outputs = 2, sr = 44100, log = () => {}, onReply = null, options = {} }) {
  let Proc = null, toMain = null;
  const g = { currentTime: 0, currentFrame: 0, sampleRate: sr };
  for (const k of ['currentTime', 'currentFrame', 'sampleRate']) Object.defineProperty(globalThis, k, { get: () => g[k], configurable: true });
  class AudioWorkletProcessor { constructor() { this.port = { postMessage: (m) => toMain?.(m), onmessage: null, start() {}, close() {} }; } }
  const WA = { ...WebAssembly, Memory: WebAssembly.Memory, Module: WebAssembly.Module, Instance: WebAssembly.Instance,
    compile: async () => wasmModule, instantiate: (m, imp) => WebAssembly.instantiate(m, imp) };
  const con = { log: (...a) => log(a.join(' ')), error: (...a) => log(`error: ${a.join(' ')}`), warn: (...a) => log(`warn: ${a.join(' ')}`) };
  glue(WA, AudioWorkletProcessor, (n, c) => { Proc = c; }, con);
  if (!Proc) throw new Error('the worklet registered no processor');
  const proc = new Proc({ numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [outputs], processorOptions: {} });
  const waiting = new Set();
  const deliver = (m) => { for (const w of waiting) if (w.test(m)) { waiting.delete(w); w.ok(m); } onReply?.(m); };
  let ready = null;
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
  post({ type: 'loadWasm', wasmBytes: new Uint8Array(1), guestConfigBytes: guestConfig({ numInputBusChannels: inputs, numOutputBusChannels: outputs, ...options }),
    guestMemoryOffset: MEM.guestMemoryOffset, guestMemorySize: MEM.guestMemorySize, inboxOffset: MEM.inboxOffset, inboxSize: MEM.inboxSize,
    outboxOffset: MEM.outboxOffset, outboxSize: MEM.outboxSize, memArenaSize: MEM.memArenaSize, inputChannels: inputs, outputChannels: outputs, sampleRate: sr,
    memoryPages: Math.ceil(MEM.totalMemory / 65536), maxMemoryPages: Math.ceil(MEM.totalMemory / 65536) });
  const booted = await up;
  post({ type: 'listening' });

  const ins = [Array.from({ length: inputs }, () => new Float32Array(QUANTUM))];
  const outs = [Array.from({ length: outputs }, () => new Float32Array(QUANTUM))];
  let quanta = 0;
  const send = (address, ...args) => post({ type: 'osc', oscData: oscEncode(address, args), sourceId: 0 });
  const ask = (test, ms, address, ...args) => new Promise((ok) => {
    const w = { test, ok, until: quanta + Math.ceil(ms / 1000 * sr / QUANTUM) };
    waiting.add(w); send(address, ...args);
  });
  function quantum(fill) {
    for (let c = 0; c < inputs; c++) fill(c, ins[0][c]);
    g.currentTime = quanta * QUANTUM / sr; g.currentFrame = quanta * QUANTUM;
    proc.process(ins, outs, {});
    quanta++;
    for (const w of waiting) if (quanta > w.until) { waiting.delete(w); w.ok(null); }
    return outs[0];
  }
  return { proc, booted, send, ask, quantum, get quanta() { return quanta; }, memoryBytes: () => proc.wasmMemory?.buffer?.byteLength ?? null };
}
