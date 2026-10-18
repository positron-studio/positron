// One listener's mp3 stream that can be moved from one Icecast to another without ending: whole frames only,
// so the cut is on a frame boundary, and the new stream's burst is dropped so it joins at the live edge.
// Pure web streams, the worker's and node's alike. why: lessons/workers-cast.md#handover
import { createFramer } from './mp3.mjs';

// Icecast's burst on connect is at most burst-size (container/icecast.xml), less on a mount on air for under 4 s;
// it arrives back to back, the live stream once per JACK period (186 ms), so the first pause of LIVE_GAP_MS
// after MIN_BYTES ends it.
export const BURST_BYTES = 65536, MIN_BYTES = 4096, LIVE_GAP_MS = 50, SPLICE_MS = 15000;

/**
 * `{ readable, splice(body), stats }`: `readable` is what the listener gets. `splice(body)` moves it onto another
 * stream's live edge and resolves `{ ok, discarded, at }`, or `{ ok: false, why }` with the old one still playing.
 */
export function createEar(body, { burstBytes = MIN_BYTES, liveGapMs = LIVE_GAP_MS, spliceMs = SPLICE_MS, now = Date.now, onEnd = () => {} } = {}) {
  let ctl = null, closed = false, cur = null, pending = null;
  const stats = { frames: 0, bytes: 0, seconds: 0, splices: [] };
  const end = () => {
    if (closed) return;
    closed = true;
    for (const s of [cur, pending]) s?.reader.cancel().catch(() => {});
    try { ctl.close(); } catch { /* already */ }
    onEnd();
  };
  const readable = new ReadableStream({ start(c) { ctl = c; }, cancel() { end(); } });
  const send = (f) => { if (closed) return; ctl.enqueue(f.data); stats.frames++; stats.bytes += f.data.length; stats.seconds += f.seconds; };

  function pump(src, { live = true, done = () => {} } = {}) {
    (async () => {
      for (;;) {
        let r;
        try { r = await src.reader.read(); } catch (e) { r = { done: true, error: e }; }
        if (r.done) {
          if (!src.live) done({ ok: false, why: 'the new stream ended before its live edge' });
          // the stream on air ended with no other to take over: the listener's stream ends too
          if (src === cur && !pending) end();
          if (src === cur) cur = null;
          return;
        }
        const t = now(), gap = src.last == null ? 0 : t - src.last;
        src.last = t; src.bytes += r.value.length;
        const frames = src.framer.push(r.value);
        if (!src.live) {
          if (src.bytes - r.value.length >= burstBytes && gap >= liveGapMs) {
            src.live = true;
            const old = cur;
            cur = src; pending = null;
            old?.reader.cancel().catch(() => {});
            // this chunk ends at the new stream's live edge and the old one was last heard at old.lastAt: what of
            // it is older than that the listener already has, so it is dropped rather than heard twice
            const span = frames.reduce((a, f) => a + f.seconds, 0), overlap = old?.sentAt ? span - (t - old.sentAt) / 1000 : 0;
            let drop = 0;
            for (let a = 0; drop < frames.length && a + frames[drop].seconds / 2 < overlap; drop++) a += frames[drop].seconds;
            frames.splice(0, drop);
            const s = { ok: true, at: t, byte: stats.bytes, discarded: src.bytes - r.value.length, dropped: drop, waitedMs: t - src.t0 };
            stats.splices.push(s); done(s);
          } else continue;
        }
        if (src !== cur) return;
        if (frames.length) src.sentAt = t;
        for (const f of frames) send(f);
      }
    })();
  }

  cur = { reader: body.getReader(), framer: createFramer(), bytes: 0, last: null, live: true, t0: now() };
  pump(cur);

  return {
    readable, stats,
    get closed() { return closed; },
    splice(next) {
      if (closed) { next.cancel?.().catch?.(() => {}); return Promise.resolve({ ok: false, why: 'the listener left' }); }
      return new Promise((resolve) => {
        const src = { reader: next.getReader(), framer: createFramer(), bytes: 0, last: null, live: false, t0: now() };
        pending = src;
        let settled = false;
        const done = (s) => {
          if (settled) return; settled = true; clearTimeout(timer);
          if (!s.ok && pending === src) pending = null;
          if (!s.ok && !cur) end();   // the old stream is gone as well: nothing left to play
          resolve(s);
        };
        const timer = setTimeout(() => {
          if (src.live) return;
          src.reader.cancel().catch(() => {});
          done({ ok: false, why: `no live edge in ${spliceMs} ms` });
        }, spliceMs);
        pump(src, { done });
      });
    },
  };
}
