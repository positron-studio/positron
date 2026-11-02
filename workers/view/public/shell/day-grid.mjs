// demo/shell/day-grid.mjs: n days as square cells filling any w x h, in reading order, paged when they would be smaller
// than `minCell`. Pure layout plus one draw call, so a page, a share card or a test can use it.
//   const g = layoutDays({ n: 1712, w: 1080, h: 1920 });            // { cols, rows, cell, gap, per, pages, x0, y0 }
//   drawDays(ctx, { days: '1011...', w, h, page: 0, colours: { '1': '#000', '0': '#0057b7' }, bg: '#000' });

/** The largest square cell that fits `n` cells in w x h with `gap` between them; with `minCell`, the cell stops
 *  there and the days run onto pages. `gap` is a fraction of the cell. `group` keeps the column count a multiple of
 *  it (24 for hours, so a row is whole days) when one fits. */
export function layoutDays({ n, w, h, gap = 0.12, minCell = 0, group = 1 }) {
  if (!(n > 0 && w > 0 && h > 0)) return { cols: 0, rows: 0, cell: 0, gap: 0, per: 0, pages: 0, x0: 0, y0: 0 };
  // k cells of size c take k*c plus (k - 1) gaps of round(gap*c) whole pixels
  const gapOf = (c) => Math.round(gap * c), span = (k, c) => k * c + (k - 1) * gapOf(c);
  const fits = (len, k) => { let c = Math.floor(len / (k + gap * (k - 1))); while (span(k, c + 1) <= len) c++; while (c > 0 && span(k, c) > len) c--; return c; };
  let best = { cols: 0, rows: 0, cell: -1 };
  const step = group > 1 && n >= group && fits(w, group) > 0 ? group : 1;
  for (let cols = step; cols <= n + step - 1; cols += step) {
    const rows = Math.ceil(n / cols), cell = Math.min(fits(w, cols), fits(h, rows));
    if (cell > best.cell || (cell === best.cell && cols * rows < best.cols * best.rows)) best = { cols, rows, cell };
  }
  let { cols, rows, cell } = best, per = n, pages = 1;
  if (minCell && cell < minCell) {
    cell = Math.floor(minCell);
    const g = gapOf(cell);
    cols = Math.max(1, Math.floor((w + g) / (cell + g)));
    if (step > 1 && cols >= step) cols -= cols % step;
    rows = Math.max(1, Math.floor((h + g) / (cell + g)));
    // the last page keeps the full page's grid, so cells sit in the same place on every page
    per = cols * rows; pages = Math.ceil(n / per);
  }
  return { cols, rows, cell, gap: gapOf(cell), per, pages, x0: Math.floor((w - span(cols, cell)) / 2), y0: Math.floor((h - span(rows, cell)) / 2) };
}

/** Cell `k` of page `page`: its top left corner and the day index `i` it shows. */
export function cellAt(g, page, k) {
  return { x: g.x0 + (k % g.cols) * (g.cell + g.gap), y: g.y0 + Math.floor(k / g.cols) * (g.cell + g.gap), i: page * g.per + k };
}

/** Draws one page of `days` (a string, one character a day) at (x, y) in a w x h box. Answers the layout. */
export function drawDays(ctx, { days, w, h, x = 0, y = 0, page = 0, gap, minCell, group, colours, bg }) {
  const g = layoutDays({ n: days.length, w, h, gap, minCell, group });
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); }
  for (let k = 0; k < g.per; k++) {
    const c = cellAt(g, page, k);
    if (c.i >= days.length) break;
    ctx.fillStyle = colours[days[c.i]] ?? colours.default ?? '#808080';
    ctx.fillRect(x + c.x, y + c.y, g.cell, g.cell);
  }
  return g;
}
