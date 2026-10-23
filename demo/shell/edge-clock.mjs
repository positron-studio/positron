// demo/shell/edge-clock.mjs: one clock two machines can share, read off a worker's GET /time. The offset is taken
// from the fastest of several round trips, so it is right to within half that round trip.
// why: lessons/kit-participant.md#stage-lag

/** `{ offset, rtt }`: edge time is `Date.now() + offset`. Throws when no round trip answered. */
export async function syncEdgeClock(base, tries = 8) {
  let best = null;
  for (let i = 0; i < tries; i++) {
    const t0 = Date.now();
    const j = await fetch(`${base}/time`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    const t1 = Date.now();
    if (!Number.isFinite(j?.t)) continue;
    if (!best || t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: j.t - (t0 + t1) / 2 };
  }
  if (!best) throw new Error(`no answer from ${base}/time`);
  return best;
}

/** The barcode a clock page paints: 30 bits of edge time in 40 px cells across the top of a 1280 px frame,
 *  then one white cell and one black cell as the threshold. */
export const STAMP = { bits: 30, cell: 40, height: 80, mod: 2 ** 30 };

/** The stamp in one video frame drawn to `ctx` at its own size, or null when the frame carries none. */
export function readStamp(ctx, w) {
  const k = w / 1280, y = Math.round((STAMP.height / 2) * k);
  const d = ctx.getImageData(0, y, w, 1).data;
  const lum = (x) => { const i = Math.round(x * k) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; };
  const hi = lum(STAMP.bits * STAMP.cell + STAMP.cell / 2), lo = lum((STAMP.bits + 1) * STAMP.cell + STAMP.cell / 2);
  if (hi - lo < 100) return null;
  const th = (hi + lo) / 2;
  let v = 0;
  for (let i = 0; i < STAMP.bits; i++) v = v * 2 + (lum(i * STAMP.cell + STAMP.cell / 2) > th ? 1 : 0);
  return v;
}

/** Milliseconds from a stamp to `edgeNow`, across the stamp's wrap. */
export const stampAge = (stamp, edgeNow) => ((Math.round(edgeNow) % STAMP.mod) - stamp + STAMP.mod) % STAMP.mod;
