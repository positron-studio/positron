// castlab: can the cast's engine (the vendored wasm scsynth, the ring, the layers and the master) run inside a
// Durable Object, fed 48 kHz stereo s16 PCM over a WebSocket the way the Realtime SFU WebSocket adapter feeds it?
// An experiment, not on air. GET /ws upgrades; the first text message picks the mode:
//   {"cmd":"boot","mode":"full"|"ring"|"echo","seed":7}   then binary PCM frames in, each answered with
//   [Float64 seq, Float64 workMs, Float64 quanta] + s16 stereo PCM out; {"cmd":"stats"} answers the object's tallies.
import { DurableObject } from 'cloudflare:workers';
import wasmModule from '../../demo/shell/vendor/scsynth-nrt.wasm';
import glue from './glue.gen.mjs';
import { bootWasm, QUANTUM, MEM } from './engine.mjs';
import { PROGRAM, PATCHES, RING_SECONDS, valuesOf } from '../../demo/granulator/grain-ring.mjs';
import { compile } from '../../demo/shell/sclang-lite.mjs';
import { program as masterProgram, MASTER_BUS } from '../../demo/radio/cast/master.mjs';
import * as LAYERS from '../../demo/radio/cast/layers.mjs';
import * as LIFE from '../../demo/radio/cast/life.mjs';

const SR = 48000, NODE = 4000, BUF = 0, DEF = 'gring', MASTER_NODE = 4100, INPUTS = 4;
const tick = () => new Promise((r) => setTimeout(r, 0));

async function startChain({ mode, seed, log }) {
  const t = { t0: Date.now(), p0: performance.now() };
  const good = compile(PROGRAM, { name: DEF, bus: MASTER_BUS });
  if (!good.ok) throw new Error(`the ring did not compile: ${good.message}`);
  const mst = compile(masterProgram(MASTER_BUS), { name: 'lmaster' });
  if (!mst.ok) throw new Error(`the master did not compile: ${mst.message}`);
  t.compileMs = performance.now() - t.p0;
  const waiters = [];
  let grains = 0;
  const w = await bootWasm({ wasmModule, glue, inputs: INPUTS, sr: SR, log, onReply: (m) => {
    if (m[0] === '/grain') { grains++; return; }
    for (const x of waiters.slice()) if (x.test(m)) { waiters.splice(waiters.indexOf(x), 1); clearTimeout(x.t); x.ok(m); return; }
  } });
  t.bootMs = performance.now() - t.p0;
  const send = (a, ...args) => w.send(a, ...args);
  // replies only leave from process(): until the stream runs, waiting means pumping silent quanta
  const sendAndWait = async (test, ms, address, ...args) => {
    let r, done = false;
    const p = new Promise((ok) => { const x = { test, ok, t: setTimeout(() => { waiters.splice(waiters.indexOf(x), 1); ok(null); }, ms) }; waiters.push(x); });
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
  if (mode !== 'echo') {
    const def = await sendAndWait(isDone('/d_recv'), 5000, '/d_recv', good.bytes);
    if (def?.[0] !== '/done') throw new Error(`the engine did not take the ring: ${def ? def.join(' ') : 'no answer'}`);
    const go = await sendAndWait((m) => (m[0] === '/n_go' && m[1] === NODE) || (m[0] === '/fail' && m[1] === '/s_new'), 5000,
      '/s_new', DEF, NODE, 1, 0, 'buf', BUF, 'inbus', 2, ...Object.entries(vals).filter(([, v]) => typeof v === 'number').flat());
    if (go?.[0] !== '/n_go') throw new Error(`the ring did not start: ${go ? go.join(' ') : 'no answer'}`);
    if ((await sendAndWait(isDone('/d_recv'), 5000, '/d_recv', mst.bytes))?.[0] !== '/done') throw new Error('the engine did not take the master');
    send('/s_new', 'lmaster', MASTER_NODE, 3, NODE);
  }
  let layers = null, layerN = 0;
  if (mode === 'full') {
    layers = await LAYERS.createLayerEngine({ send, sendAndWait: (test, ms, a, ...args) => sendAndWait(test, ms, a, ...args) }, { log, to: MASTER_BUS, before: MASTER_NODE });
    // every layer audible, so the measurement is the busy case rather than a scene's quiet start
    const L = { ...(s.layers || {}), drone: 'both', droneLevel: 0.4, res: s.layers?.res && s.layers.res !== 'none' ? s.layers.res : 'minor7', resWet: 0.4, resDecay: 1.5,
      harm: s.layers?.harm && s.layers.harm !== 'none' ? s.layers.harm : 'triad', harmSpread: 0.5, voc: 'fifths', ghost: 'none', room: 0.3, roomSize: 0.7 };
    layers.apply(L, s.key || { root: 0 });
    layers.level(1);
    layerN = Object.keys(LAYERS.PROGRAMS).length + 1;
  }
  t.chainMs = performance.now() - t.p0;
  t.chainWallMs = Date.now() - t.t0;
  return { w, send, timing: t, scene: { patch: s.patch, layers: layerN, defBytes: good.bytes.length }, get grains() { return grains; } };
}

export class CastLab extends DurableObject {
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('castlab: WebSocket only', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const logs = [];
    const log = (l) => { if (logs.length < 200) logs.push(String(l).slice(0, 300)); };
    let chain = null, mode = 'echo', seq = 0;
    // the input FIFO: frames arrive in any size, the engine eats 128 at a time
    const cap = 8192 * 4, fl = new Float32Array(cap), fr = new Float32Array(cap);
    let have = 0;
    const work = [], st = { frames: 0, inFrames: 0, outFrames: 0, workMs: 0, firstAt: 0, lastAt: 0, bytesIn: 0 };
    // a Blob's arrayBuffer() is async, so the frames are handled in a chain to keep them in order
    let line = Promise.resolve();
    server.addEventListener('message', (ev) => { line = line.then(() => handle(ev)); });
    const handle = async (ev) => {
      try {
        if (typeof ev.data === 'string') {
          const m = JSON.parse(ev.data);
          if (m.cmd === 'boot') {
            mode = m.mode || 'full';
            try {
              chain = await startChain({ mode, seed: m.seed ?? 7, log });
              server.send(JSON.stringify({ booted: true, mode, timing: chain.timing, scene: chain.scene, memoryBytes: chain.w.memoryBytes(), MEM, logs }));
            } catch (e) { server.send(JSON.stringify({ booted: false, error: String(e && e.stack || e), logs })); }
          } else if (m.cmd === 'stats') {
            const s = work.slice().sort((a, b) => a - b), q = (p) => s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3) : null;
            server.send(JSON.stringify({ stats: { ...st, mode, median: q(0.5), p99: q(0.99), worst: s.at(-1) ?? null, nonzero: s.filter((x) => x > 0).length,
              grains: chain?.grains ?? 0, quanta: chain?.w.quanta ?? 0, memoryBytes: chain?.w.memoryBytes() ?? null, logs: logs.slice(-20) } }));
          }
          return;
        }
        const raw = ev.data instanceof ArrayBuffer ? ev.data : ev.data?.buffer ? ev.data.buffer.slice(ev.data.byteOffset, ev.data.byteOffset + ev.data.byteLength) : await ev.data.arrayBuffer();
        const p0 = performance.now();
        st.kind ||= Object.prototype.toString.call(ev.data);
        const pcm = new Int16Array(raw), n = pcm.length >> 1;
        st.bytesIn += raw.byteLength;
        for (let i = 0; i < n; i++) { fl[have + i] = pcm[2 * i] / 32768; fr[have + i] = pcm[2 * i + 1] / 32768; }
        have += n;
        const qn = Math.floor(have / QUANTUM), out = new ArrayBuffer(24 + qn * QUANTUM * 4), o16 = new Int16Array(out, 24);
        let o = 0;
        for (let q = 0; q < qn; q++) {
          const s = q * QUANTUM;
          let L, R;
          if (chain && mode !== 'echo') {
            const y = chain.w.quantum((c, b) => { if (c === 0) b.set(fl.subarray(s, s + QUANTUM)); else if (c === 1) b.set(fr.subarray(s, s + QUANTUM)); else b.fill(0); });
            L = y[0]; R = y[1];
          } else { L = fl.subarray(s, s + QUANTUM); R = fr.subarray(s, s + QUANTUM); }
          for (let i = 0; i < QUANTUM; i++) {
            const l = L[i] * 32767, r = R[i] * 32767;
            o16[o++] = l > 32767 ? 32767 : l < -32768 ? -32768 : Math.round(l);
            o16[o++] = r > 32767 ? 32767 : r < -32768 ? -32768 : Math.round(r);
          }
        }
        const used = qn * QUANTUM;
        if (used) { fl.copyWithin(0, used, have); fr.copyWithin(0, used, have); have -= used; }
        const ms = performance.now() - p0;
        new Float64Array(out, 0, 3).set([seq++, ms, qn]);
        work.push(ms); st.frames++; st.inFrames += n; st.outFrames += used; st.workMs += ms;
        st.firstAt ||= Date.now(); st.lastAt = Date.now();
        server.send(out);
      } catch (e) { try { server.send(JSON.stringify({ error: String(e && e.stack || e) })); } catch { /* closed */ } }
    };
    server.addEventListener('close', () => { try { server.close(); } catch { /* gone */ } });
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/ws') return env.LAB.get(env.LAB.idFromName(u.searchParams.get('room') || 'lab')).fetch(req);
    return new Response('castlab: an experiment; GET /ws with a WebSocket\n');
  },
};
