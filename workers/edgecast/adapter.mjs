// edgecast as both ends of the Realtime SFU WebSocket adapter: a publication in an SFU room comes in as PCM on the
// egress socket, runs through the mode's chain (echo, ring, full), and goes back out on the ingest socket, which the
// SFU publishes as a new session a page can pull. One pair at a time, in the object named 'adapter'.
// The SFU connects TO these routes, with the token in the URL; positron-sfu's SfuAdmin creates the adapters.
// why: lessons/workers-edgecast-adapter.md#flow
import { decodePacket, encodePacket } from './packet.mjs';
import { QUANTUM } from './engine.mjs';

export const ADAPTER_MS = 10 * 60 * 1000;   // a pair ends itself after this long
const EGRESS_GONE_MS = 20 * 1000;           // the SFU retries egress for 15 s; past that the pair is over
const OUT_FRAMES = 960;                      // 20 ms per ingest message: 3840 bytes, far under 32 KB
const HOST = 'edgecast.positron.studio';
const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/, ROOM_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const token = () => { const b = crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3) : null; };

/**
 * The adapter's state and routes for one Durable Object. `boot(mode, seed)` answers a chain ({ w }) or null for echo.
 * Routes: POST /adapter/start {room, sessionId, proof, trackName, mode, seed}, POST /adapter/stop, GET /adapter/status,
 * GET /adapter/ws/egress?t=, GET /adapter/ws/ingest?t=. The worker checks CAST_KEY on start and stop before this.
 */
export function createAdapter({ env, boot }) {
  let pair = null, last = null;   // the pair on now, and the stats of the one that ended

  function stats() {
    if (!pair) return { on: false, last };
    const s = pair.st;
    return { on: true, mode: pair.mode, room: pair.room, startedAt: s.startedAt, ingest: pair.ingest, adapters: pair.ids.length,
      egress: { connected: !!pair.egressWs, connects: s.egConnects, packets: s.inPackets, bytes: s.inBytes, seconds: +(s.inFrames / 48000).toFixed(2),
        payloadSizes: Object.fromEntries([...s.sizes].slice(0, 6)), seqGaps: s.seqGaps, tsStepFirst: s.tsSteps.slice(0, 5),
        gapMs: { median: q(s.gaps, 0.5), p99: q(s.gaps, 0.99), worst: q(s.gaps, 1) }, rmsIn: s.inFrames ? +Math.sqrt(s.inSq / s.inFrames / 2).toFixed(5) : null,
        badPackets: s.bad, lastError: s.lastError },
      ingest_socket: { connected: !!pair.ingestWs, connects: s.inConnects, packets: s.outPackets, bytes: s.outBytes, seconds: +(s.outFrames / 48000).toFixed(2), dropped: s.dropped },
      workMs: { median: q(s.work, 0.5), p99: q(s.work, 0.99), worst: q(s.work, 1) }, boot: s.boot, closed: s.closed };
  }

  async function stop(why) {
    const p = pair;
    if (!p) return { stopped: false, last };
    const snap = stats();
    pair = null;
    for (const t of Object.values(p.timers)) clearTimeout(t);
    let closed = null;
    if (p.ids.length) closed = await env.SFU_ADMIN.adapterClose(p.ids).catch((e) => ({ error: String(e.message || e) }));
    for (const ws of [p.egressWs, p.ingestWs]) try { ws?.close(1000, why); } catch { /* gone */ }
    last = { ...snap, on: false, closed: { why, closed } };
    return { stopped: true, why, closed, last };
  }

  async function start(b) {
    if (!ROOM_RE.test(b?.room || '') || !NAME_RE.test(b?.trackName || '') || typeof b?.sessionId !== 'string' || typeof b?.proof !== 'string') {
      return Response.json({ error: 'start needs room, sessionId, proof, trackName' }, { status: 400 });
    }
    const mode = ['echo', 'ring', 'full'].includes(b.mode) ? b.mode : 'echo';
    if (pair) await stop('replaced');
    const st = { startedAt: Date.now(), egConnects: 0, inConnects: 0, inPackets: 0, inBytes: 0, inFrames: 0, inSq: 0, sizes: new Map(), seqGaps: 0, tsSteps: [],
      gaps: [], bad: 0, lastError: null, outPackets: 0, outBytes: 0, outFrames: 0, dropped: 0, work: [], boot: null, closed: null };
    const p = { t: token(), mode, chain: null, room: b.room, ids: [], ingest: null, egressWs: null, ingestWs: null, st, timers: {}, seq: 0, ts: 0,
      lastSeq: null, lastTs: null, lastAt: 0, fl: new Float32Array(32768), fr: new Float32Array(32768), have: 0, out: new Int16Array(OUT_FRAMES * 2), outN: 0 };
    pair = p;
    const t0 = Date.now();
    if (mode !== 'echo') {
      try { p.chain = await boot(mode, b.seed ?? 7); } catch (e) { pair = null; return Response.json({ error: `boot: ${e.message || e}` }, { status: 500 }); }
    }
    st.boot = { mode, ms: Date.now() - t0 };
    p.timers.cap = setTimeout(() => stop('the pair reached its time'), ADAPTER_MS);
    const base = `wss://${HOST}/adapter/ws`;
    const outName = NAME_RE.test(b.outName || '') ? b.outName : 'edgecast';
    const t1 = Date.now();
    // ingest first, so the output has somewhere to go before the first egress packet arrives
    const ing = await env.SFU_ADMIN.adapterNew(b.room, [{ location: 'local', trackName: outName, endpoint: `${base}/ingest?t=${p.t}` }]);
    const it = ing.tracks?.[0];
    if (!it || it.errorCode || !it.adapterId) { await stop('ingest refused'); return Response.json({ error: 'ingest adapter refused', sfu: ing }, { status: 502 }); }
    p.ids.push(it.adapterId);
    p.ingest = { sessionId: it.sessionId, proof: it.proof, trackName: outName };
    const eg = await env.SFU_ADMIN.adapterNew(b.room, [{ location: 'remote', sessionId: b.sessionId, proof: b.proof, trackName: b.trackName, endpoint: `${base}/egress?t=${p.t}` }]);
    const et = eg.tracks?.[0];
    if (!et || et.errorCode || !et.adapterId) { await stop('egress refused'); return Response.json({ error: 'egress adapter refused', sfu: eg }, { status: 502 }); }
    p.ids.push(et.adapterId);
    st.adaptersMs = Date.now() - t1;
    return Response.json({ ok: true, mode, room: b.room, ingest: p.ingest, bootMs: st.boot.ms, adaptersMs: st.adaptersMs }, { headers: { 'cache-control': 'no-store' } });
  }

  function sendOut(p, frames) {
    // frames: Int16Array interleaved stereo, any length; cut into 20 ms messages
    let i = 0;
    while (i < frames.length) {
      const n = Math.min(frames.length - i, p.out.length - p.outN);
      p.out.set(frames.subarray(i, i + n), p.outN); p.outN += n; i += n;
      if (p.outN === p.out.length) {
        const ws = p.ingestWs;
        if (ws) {
          const msg = encodePacket({ sequenceNumber: ++p.seq, timestamp: (p.ts += OUT_FRAMES), payload: new Uint8Array(p.out.buffer.slice(0)) });
          try { ws.send(msg); p.st.outPackets++; p.st.outBytes += msg.length; p.st.outFrames += OUT_FRAMES; } catch { p.st.dropped++; }
        } else p.st.dropped++;
        p.outN = 0;
      }
    }
  }

  function onEgress(p, data) {
    const st = p.st, now = Date.now();
    let pkt;
    try { pkt = decodePacket(new Uint8Array(data)); } catch (e) { st.bad++; st.lastError = e.message; return; }
    const pl = pkt.payload;
    if (pl.length % 4) { st.bad++; st.lastError = `payload ${pl.length} bytes is not whole stereo s16 frames`; return; }
    st.inPackets++; st.inBytes += data.byteLength;
    st.sizes.set(pl.length, (st.sizes.get(pl.length) || 0) + 1);
    if (p.lastSeq !== null && pkt.sequenceNumber !== p.lastSeq + 1) st.seqGaps++;
    if (p.lastTs !== null && st.tsSteps.length < 5) st.tsSteps.push(pkt.timestamp - p.lastTs);
    if (p.lastAt && st.gaps.length < 20000) st.gaps.push(now - p.lastAt);
    p.lastSeq = pkt.sequenceNumber; p.lastTs = pkt.timestamp; p.lastAt = now;
    // a copy aligned for Int16Array: the payload view may sit at an odd offset
    const pcm = new Int16Array(pl.slice().buffer), n = pcm.length >> 1;
    for (let i = 0; i < pcm.length; i++) st.inSq += (pcm[i] / 32768) ** 2;
    st.inFrames += n;
    const w0 = performance.now();
    if (!p.chain) { sendOut(p, pcm); st.work.length < 20000 && st.work.push(performance.now() - w0); return; }
    const { fl, fr } = p;
    if (p.have + n > fl.length) { p.have = 0; st.lastError = 'input fifo overflow, reset'; }
    for (let i = 0; i < n; i++) { fl[p.have + i] = pcm[2 * i] / 32768; fr[p.have + i] = pcm[2 * i + 1] / 32768; }
    p.have += n;
    const qn = Math.floor(p.have / QUANTUM), o16 = new Int16Array(qn * QUANTUM * 2);
    let o = 0;
    for (let k = 0; k < qn; k++) {
      const s = k * QUANTUM;
      const y = p.chain.w.quantum((c, b) => { if (c === 0) b.set(fl.subarray(s, s + QUANTUM)); else if (c === 1) b.set(fr.subarray(s, s + QUANTUM)); else b.fill(0); });
      for (let i = 0; i < QUANTUM; i++) {
        const l = y[0][i] * 32767, r = y[1][i] * 32767;
        o16[o++] = l > 32767 ? 32767 : l < -32768 ? -32768 : Math.round(l);
        o16[o++] = r > 32767 ? 32767 : r < -32768 ? -32768 : Math.round(r);
      }
    }
    const used = qn * QUANTUM;
    if (used) { fl.copyWithin(0, used, p.have); fr.copyWithin(0, used, p.have); p.have -= used; }
    sendOut(p, o16);
    if (st.work.length < 20000) st.work.push(performance.now() - w0);
  }

  function socket(req, side) {
    const u = new URL(req.url);
    const p = pair;
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('edgecast adapter: WebSocket only', { status: 426 });
    if (!p || !same(u.searchParams.get('t'), p.t)) return new Response('edgecast adapter: no such pair', { status: 403 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    if (side === 'egress') {
      try { p.egressWs?.close(1000, 'replaced'); } catch { /* gone */ }
      p.egressWs = server; p.st.egConnects++;
      clearTimeout(p.timers.gone);
      // the event's data may be an ArrayBuffer or a Blob; keep order with a promise chain
      let line = Promise.resolve();
      server.addEventListener('message', (ev) => {
        if (typeof ev.data === 'string') return;
        line = line.then(async () => { if (pair !== p) return; onEgress(p, ev.data instanceof ArrayBuffer ? ev.data : await ev.data.arrayBuffer()); })
          .catch((e) => { p.st.lastError = String(e.message || e); });
      });
      const gone = () => {
        if (p.egressWs !== server) return;
        p.egressWs = null;
        p.timers.gone = setTimeout(() => { if (pair === p && !p.egressWs) stop('egress did not come back'); }, EGRESS_GONE_MS);
      };
      server.addEventListener('close', gone); server.addEventListener('error', gone);
    } else {
      try { p.ingestWs?.close(1000, 'replaced'); } catch { /* gone */ }
      p.ingestWs = server; p.st.inConnects++;
      const gone = () => { if (p.ingestWs === server) p.ingestWs = null; };
      server.addEventListener('close', gone); server.addEventListener('error', gone);
      server.addEventListener('message', () => {});
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  return {
    async fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === '/adapter/ws/egress') return socket(req, 'egress');
      if (path === '/adapter/ws/ingest') return socket(req, 'ingest');
      if (path === '/adapter/status') return Response.json(stats(), { headers: { 'cache-control': 'no-store' } });
      if (path === '/adapter/stop') return Response.json(await stop('asked'));
      if (path === '/adapter/start') return start(await req.json().catch(() => null));
      return new Response('edgecast adapter: no such route', { status: 404 });
    },
  };
}
