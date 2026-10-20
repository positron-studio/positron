// The driver's timers on audio time: live.gen.mjs calls T.setTimeout and T.setInterval where live.mjs calls the
// global ones, and the station advances T after every 20 ms block it renders. In an object whose clock stands still
// while code runs, a wall timer would fire between renders, not between the blocks it was meant for.
export function createClock() {
  let now = 0, seq = 1;
  const timers = new Map();
  const add = (fn, ms, every) => { const id = seq++; timers.set(id, { fn, at: now + Math.max(0, +ms || 0), every }); return id; };
  return {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms, 0),
    setInterval: (fn, ms) => add(fn, ms, Math.max(1, +ms || 1)),
    clearTimeout: (id) => { timers.delete(id); },
    clearInterval: (id) => { timers.delete(id); },
    /** Moves audio time to `ms`, firing every timer due on the way, in order. */
    advance(ms) {
      for (;;) {
        let next = null, nid = 0;
        for (const [id, t] of timers) if (t.at <= ms && (!next || t.at < next.at || (t.at === next.at && id < nid))) { next = t; nid = id; }
        if (!next) break;
        now = Math.max(now, next.at);
        if (next.every) next.at += next.every; else timers.delete(nid);
        try { next.fn(); } catch (e) { console.log(`vclock: ${e && e.message}`); }
      }
      now = Math.max(now, ms);
    },
    get size() { return timers.size; },
    reset() { timers.clear(); now = 0; },
  };
}
export const T = createClock();
