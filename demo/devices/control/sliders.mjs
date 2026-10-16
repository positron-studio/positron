// demo/devices/control/sliders.mjs: a row of vertical sliders on a 1 bit surface (split-oled.mjs's
// createSurface). Pure, no DOM, so /devices/control/'s knobs screen and /devices/knobs/ draw one way.

import { text } from '../split/split-oled.mjs';

/**
 * `cols`: `[{ v, name?, value? }]`, `v` 0..1 the slider's height, `name` printed over it, `value` (a string)
 * under it. Names and values take 7 rows each; with `named: false` neither is drawn.
 * `look`: 'track' (1 px outline, corner pixels off, a fill rising inside), 'fill' or 'outline'.
 * A `null` column keeps its place and draws nothing. Returns each column's `{ x, w }`.
 */
export function drawSliders(sf, cols, { named = true, look = 'track', gap: g = null } = {}) {
  const n = cols.length;
  const gap = g ?? (n > 8 ? 2 : 4), cw = Math.floor((sf.w - gap * (n - 1)) / n), x0 = Math.floor((sf.w - (cw * n + gap * (n - 1))) / 2);
  const top = named ? 7 : 1, bottom = named ? sf.h - 7 : sf.h - 1, h = bottom - top;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (cw + gap);
    out.push({ x, w: cw });
    if (!cols[i]) continue;
    const v = cols[i].v;
    if (look === 'track') {
      sf.fill(x + 1, top, cw - 2, 1); sf.fill(x + 1, bottom - 1, cw - 2, 1); sf.fill(x, top + 1, 1, h - 2); sf.fill(x + cw - 1, top + 1, 1, h - 2);
      const fh = Math.round((h - 4) * v);
      sf.fill(x + 2, bottom - 2 - fh, cw - 4, fh);
    } else if (look === 'fill') {
      const fh = Math.max(1, Math.round(h * v));
      sf.fill(x, bottom - fh, cw, fh);
    } else {
      // the outline is the value: a box from the floor up to it, corner pixels off, nothing inside
      const bh = Math.max(3, Math.round(h * v)), y = bottom - bh;
      sf.fill(x + 1, y, cw - 2, 1); sf.fill(x, bottom - 1, cw, 1); sf.fill(x, y + 1, 1, bh - 1); sf.fill(x + cw - 1, y + 1, 1, bh - 1);
    }
    if (named) {
      const c = (str) => x + Math.floor((cw - (str.length * 4 - 1)) / 2);
      if (cols[i].name) text(sf, c(cols[i].name), 0, cols[i].name);
      if (cols[i].value != null) text(sf, c(String(cols[i].value)), sf.h - 5, String(cols[i].value));
    }
  }
  return out;
}
