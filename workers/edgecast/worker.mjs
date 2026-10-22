// edgecast: can the cast's engine (the vendored wasm scsynth, the ring, the layers and the master) run inside a
// Durable Object, fed 48 kHz stereo s16 PCM over a WebSocket the way the Realtime SFU WebSocket adapter feeds it?
// An experiment, not on air. GET /ws upgrades; the first text message picks the mode:
//   {"cmd":"boot","mode":"full"|"ring"|"echo","seed":7}   then binary PCM frames in, each answered with
//   [Float64 seq, Float64 workMs, Float64 quanta] + s16 stereo PCM out; {"cmd":"stats"} answers the object's tallies;
//   {"cmd":"ping","n":k} is answered at once, ahead of any queued frame, as {"pong":k}.
//   {"cmd":"program","slot":0|1,"src":"{ ... }"} puts an sclang-lite program in an insert slot while it plays, answered
//   {"program":{ok,slot,ms,compileMs,controls,error?}}; {"cmd":"set","slot":0|1|"ring","params":{name:value}} is /n_set,
//   clamped, answered {"set":{ok,slot,applied,refused}}. The slots and their busses are in chain.mjs.
// Station mode (station.mjs): GET /listen, GET /status, POST /start?key=&cap=<minutes>, POST /stop?key= play
// radio1965's cast program on the object's own clock to any number of listeners, from one object, station-preview.
// /radio/edgecast/ is the station's page; /ws is kept for client.mjs and the experiment and no page opens it.
// /adapter/*: the Realtime SFU WebSocket adapter both ways, in the object 'adapter' (adapter.mjs), started with CAST_KEY.
// One session at a time in one object: the engine's wasm memory is 73 MB of an isolate's 128 MB, and objects of
// one class may share an isolate, so a second engine is refused rather than risked.
import { DurableObject } from 'cloudflare:workers';
import wasmModule from '../../demo/shell/vendor/scsynth-nrt.wasm';
import glue from './glue.gen.mjs';
import { QUANTUM, MEM } from './engine.mjs';
import { startChain, createInserts, SLOTS, LIMITS } from './chain.mjs';
export { Station } from './station.mjs';
import { createAdapter } from './adapter.mjs';

// who may open a socket: the site, a local dev server on any port, and a client with no Origin (client.mjs)
const ORIGIN_OK = /^(https:\/\/positron\.studio|https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/;
// a session ends itself after this long, so a tab left open does not hold the engine for a day
const SESSION_MS = 15 * 60 * 1000, IDLE_MS = 10 * 1000;

export class Edgecast extends DurableObject {
  async fetch(req) {
    // the SFU adapter pair, in the object named 'adapter'. why: lessons/workers-edgecast-adapter.md#flow
    if (new URL(req.url).pathname.startsWith('/adapter/')) {
      this.adapter ||= createAdapter({ env: this.env, boot: (mode, seed) => startChain({ wasmModule, glue, mode, seed }) });
      return this.adapter.fetch(req);
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('edgecast: WebSocket only', { status: 426 });
    const origin = req.headers.get('Origin');
    if (origin && !ORIGIN_OK.test(origin)) return new Response('edgecast: not from this origin', { status: 403 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    // a busy engine answers in words and closes; a session silent for IDLE_MS gives its place up
    if (this.busy && Date.now() - this.busy.last < IDLE_MS) {
      server.send(JSON.stringify({ busy: true, error: 'edgecast is playing for somebody else; try again in a minute' }));
      server.close(1013, 'busy');
      return new Response(null, { status: 101, webSocket: client });
    }
    try { this.busy?.socket.close(1012, 'taken over'); } catch { /* gone */ }
    const me = { socket: server, last: Date.now() };
    this.busy = me;
    const release = () => { if (this.busy === me) this.busy = null; chain = null; clearTimeout(limit); };
    const limit = setTimeout(() => { try { server.send(JSON.stringify({ ended: 'the session reached 15 minutes' })); server.close(1000, 'time'); } catch { /* gone */ } release(); }, SESSION_MS);
    const logs = [];
    const log = (l) => { if (logs.length < 200) logs.push(String(l).slice(0, 300)); };
    let chain = null, inserts = null, mode = 'echo', seq = 0;
    // the input FIFO: frames arrive in any size, the engine eats 128 at a time
    const cap = 8192 * 4, fl = new Float32Array(cap), fr = new Float32Array(cap);
    let have = 0;
    // with no frames arriving, a program's /n_go would never come out, so silent quanta are run until it does
    const pump = (done) => {
      const go = () => { if (done() || chain !== c) return; if (Date.now() - st.lastAt > 200) for (let i = 0; i < 16; i++) c.w.quantum((k, b) => b.fill(0)); setTimeout(go, 50); };
      const c = chain; setTimeout(go, 250);
    };
    const work = [], st = { frames: 0, inFrames: 0, outFrames: 0, workMs: 0, firstAt: 0, lastAt: 0, bytesIn: 0 };
    // a Blob's arrayBuffer() is async, so the frames are handled in a chain to keep them in order
    let line = Promise.resolve();
    server.addEventListener('message', (ev) => {
      me.last = Date.now();
      // a ping skips the line, so its answer leaves before the frame that follows it is worked on
      if (typeof ev.data === 'string' && ev.data.startsWith('{"cmd":"ping"')) {
        try { server.send(JSON.stringify({ pong: JSON.parse(ev.data).n })); } catch { /* closed */ }
        return;
      }
      line = line.then(() => handle(ev));
    });
    const handle = async (ev) => {
      try {
        if (typeof ev.data === 'string') {
          const m = JSON.parse(ev.data);
          if (m.cmd === 'boot') {
            mode = m.mode || 'full';
            try {
              chain = await startChain({ wasmModule, glue, mode, seed: m.seed ?? 7, log });
              inserts = createInserts(chain, { pump });
              server.send(JSON.stringify({ booted: true, mode, timing: chain.timing, scene: chain.scene, memoryBytes: chain.w.memoryBytes(), MEM, logs,
                slots: chain.slots ? SLOTS.map((x) => x.name) : [], limits: LIMITS }));
            } catch (e) { server.send(JSON.stringify({ booted: false, error: String(e && e.stack || e), logs })); }
          } else if (m.cmd === 'program') {
            // answered later, off the line: the new node's /n_go comes out of the frames queued behind this message
            if (!inserts) { server.send(JSON.stringify({ program: { ok: false, slot: m.slot, error: 'edgecast has not booted' } })); return; }
            inserts.program(m).then((a) => { try { server.send(JSON.stringify(a)); } catch { /* closed */ } });
          } else if (m.cmd === 'set') {
            server.send(JSON.stringify(inserts ? inserts.set(m) : { set: { ok: false, slot: m.slot, error: 'edgecast has not booted' } }));
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
    server.addEventListener('close', () => { release(); try { server.close(); } catch { /* gone */ } });
    server.addEventListener('error', release);
    return new Response(null, { status: 101, webSocket: client });
  }
}

const CORS = { 'access-control-allow-origin': '*' };
const keyOk = (env, k) => {
  const want = env.CAST_KEY;
  if (typeof want !== 'string' || !want || typeof k !== 'string' || k.length !== want.length) return false;
  let d = 0;
  for (let i = 0; i < k.length; i++) d |= k.charCodeAt(i) ^ want.charCodeAt(i);
  return d === 0;
};
async function relay(req, env, u) {
  const want = u.pathname === '/relay/status' ? 'GET' : 'POST';
  if (req.method !== want) return Response.json({ error: `${want} ${u.pathname}` }, { status: 405, headers: CORS });
  if (!env.RELAY) return Response.json({ error: 'no RELAY binding' }, { status: 500, headers: CORS });
  const to = new URL(`https://relay${u.pathname.slice('/relay'.length)}`);
  for (const k of ['key', 'min']) if (u.searchParams.has(k)) to.searchParams.set(k, u.searchParams.get(k));
  try {
    const r = await env.RELAY.fetch(to, { method: want });
    return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', ...CORS } });
  } catch (e) { return Response.json({ error: `the relay did not answer: ${e.message}` }, { status: 502, headers: CORS }); }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/ws') return env.EDGECAST.get(env.EDGECAST.idFromName(u.searchParams.get('room') || 'lab')).fetch(req);
    // the adapter's sockets carry their own token; start, stop and status need CAST_KEY (start makes Cloudflare dial us)
    if (u.pathname.startsWith('/adapter/')) {
      const obj = () => env.EDGECAST.get(env.EDGECAST.idFromName('adapter'));
      if (u.pathname.startsWith('/adapter/ws/')) return env.SFU_ADMIN ? obj().fetch(req) : new Response('no SFU_ADMIN binding', { status: 500 });
      // a page drives start, stop and status too (/radio/return/), so they answer across origins; the key still gates them
      // why: lessons/workers-edgecast-adapter.md#page
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' } });
      if (!keyOk(env, u.searchParams.get('key'))) return Response.json({ error: 'key' }, { status: 403, headers: CORS });
      if (!env.SFU_ADMIN) return Response.json({ error: 'no SFU_ADMIN binding' }, { status: 500, headers: CORS });
      const r = await obj().fetch(req);
      return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', ...CORS } });
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST' } });
    if (['/listen', '/status', '/start', '/stop'].includes(u.pathname)) return env.STATION.get(env.STATION.idFromName('station-preview')).fetch(req);
    // the relay to radio1965 through the RELAY binding, so a page never talks to its workers.dev name; the relay checks the key
    if (['/relay/start', '/relay/stop', '/relay/status'].includes(u.pathname)) return relay(req, env, u);
    return new Response('edgecast: an experiment; GET /ws with a WebSocket, or the station: GET /listen, GET /status, POST /start?key=&cap=<minutes>, POST /stop?key=; the relay: GET /relay/status, POST /relay/start?key=&min=, POST /relay/stop?key=; the SFU adapter: POST /adapter/start?key=, POST /adapter/stop?key=, GET /adapter/status?key=\n');
  },
};
