// demo/shell/palm-drums.mjs: the drum grid on the Palm's 160x160 screen, drawn and played by the stylus.
// One picture and one pen for the real Palm (rig/palm/bridge.mjs --view drums) and its copy in a tab
// (/devices/palmdrums/). Pure: no DOM, no socket; node imports it.

export const W = 160, H = 160;
export const STEPS = 16, ROWS = 8;
// three bands: the 8 rows in the top third, Plaits' wave in the middle third, three Plaits sliders in the bottom third
export const TOP = 6, PY = 6, CH = 5, PX = 10, CW = 8, X0 = 1;
/** Plaits' wave under the grid, the middle third; the pen does nothing there. */
export const WAVE_Y = 57, WAVE_H = 46;
/** No lane on the screen any more (play is the Palm's centre button, clear its Menu icon): LANE is the bottom edge. */
export const LANE = H;
export const PLAY_X = 40, CLEAR_X = 120;
/** The bottom third: one row of `SL_H` px per Plaits control, a track from SL_X0 to SL_X1 with a letter left of it. */
export const SLIDERS = ['harmonics', 'timbre', 'morph'];
export const SL_Y = 106, SL_H = 18, SL_X0 = 10, SL_X1 = 156;
/** A slider's value 0..1 at screen x, the track's ends included. */
export const slideAt = (x) => Math.max(0, Math.min(1, (x - SL_X0) / (SL_X1 - SL_X0)));
// 3x5 letters, a row a number of 3 bits, top first
const GLYPH = { harmonics: [5, 5, 7, 5, 5], timbre: [7, 2, 2, 2, 2], morph: [5, 7, 7, 5, 5] };
/** A wave is `WAVE_COLS` columns as [lo, hi] pairs, flat, each -100 to 100 (the palm.wave message's `cols`). */
export const WAVE_COLS = 64;

/** An empty grid, `ROWS` arrays of `STEPS` booleans. */
export const emptyGrid = () => Array.from({ length: ROWS }, () => new Array(STEPS).fill(false));

/** What a point on the screen is: `{ kind: 'cell', r, c }`, `{ kind: 'slider', i }`, `{ kind: 'play' }`, `{ kind: 'clear' }` or `{ kind: 'none' }`. */
export function hitAt(x, y) {
  if (y >= SL_Y - 2 && y < LANE) return { kind: 'slider', i: Math.max(0, Math.min(SLIDERS.length - 1, Math.floor((y - SL_Y) / SL_H))) };
  if (y >= LANE) return { kind: x < PLAY_X ? 'play' : x >= CLEAR_X ? 'clear' : 'none' };
  const r = Math.floor((y - TOP) / PY), c = Math.floor((x - X0) / PX);
  return r >= 0 && r < ROWS && c >= 0 && c < STEPS ? { kind: 'cell', r, c } : { kind: 'none' };
}

/**
 * `draw({ rect, put }, s)`: `rect(x, y, w, h, v)` and `put(x, y, v)` paint ink 0 to 15, and `s` is
 * `{ grid, step, running, starting, selRow, pen, wave, sliders }`, sliders `{ harmonics, timbre, morph }` 0..1 (none, none drawn).
 * Shapes, not greys, so it reads the same at 1 bit.
 */
export function draw({ rect, put }, s) {
  const now = s.running ? s.step : -1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < STEPS; c++) {
    const x = X0 + c * PX, y = TOP + r * PY;
    // a beat's dot is wider, the picked row's taller
    if (s.grid[r][c]) rect(x, y, CW, CH, 15);
    else if (r === s.selRow) rect(x + 3, y + 1, 2, 3, 15);
    else rect(x + (c % 4 === 0 ? 3 : 4), y + 2, c % 4 === 0 ? 2 : 1, 1, 15);
  }
  if (now >= 0) {
    const x = X0 + now * PX;
    rect(x - 1, TOP - 1, CW + 2, 1, 15); rect(x - 1, TOP + ROWS * PY, CW + 2, 1, 15);
    rect(x - 1, TOP - 1, 1, ROWS * PY + 2, 15); rect(x + CW, TOP - 1, 1, ROWS * PY + 2, 15);
    rect(x, TOP - 5, CW, 3, 15);
  }
  drawWave(rect, 0, WAVE_Y, W, WAVE_H, s.wave);
  if (s.sliders) drawSliders(rect, s.sliders);
  if (s.pen?.down) put(s.pen.x, s.pen.y, 15);
}

/** Each slider: its letter, a solid bar from the left end to the value, a dithered track after it, a 3x9 thumb. */
export function drawSliders(rect, sl) {
  SLIDERS.forEach((name, i) => {
    const cy = SL_Y + i * SL_H + (SL_H >> 1), v = Math.max(0, Math.min(1, Number(sl[name]) || 0));
    const vx = SL_X0 + Math.round(v * (SL_X1 - SL_X0));
    GLYPH[name].forEach((bits, j) => { for (let k = 0; k < 3; k++) if (bits & (4 >> k)) rect(2 + k, cy - 2 + j, 1, 1, 15); });
    if (vx > SL_X0) rect(SL_X0, cy - 1, vx - SL_X0, 3, 15);
    for (let x = vx + 2; x <= SL_X1; x++) if ((x & 1) === 0) rect(x, cy, 1, 1, 15);
    rect(SL_X1, cy - 2, 1, 5, 15);
    rect(vx - 1, cy - 4, 3, 9, 15);
  });
}

/**
 * `drawWave(rect, x, y, w, h, cols)`: `cols` (see WAVE_COLS) stretched over w as one connected trace, each
 * column joined to the one before; no cols, or silence, is a flat line through the middle.
 */
export function drawWave(rect, x0, y0, w, h, cols) {
  const n = cols?.length >> 1, mid = y0 + (h >> 1), k = (h - 1) / 200;
  // dithered: every other pixel of the trace, in a checkerboard, so a one pixel line reads lighter and thinner at 1 bit
  const span = (x, a, b) => { for (let y = a; y <= b; y++) if (((x + y) & 1) === 0) rect(x, y, 1, 1, 15); };
  if (!n) { for (let x = 0; x < w; x++) span(x0 + x, mid, mid); return; }
  const yOf = (v) => Math.round(mid - v * k);
  let pTop = null, pBot = null;
  for (let x = 0; x < w; x++) {
    const c = Math.min(n - 1, Math.floor(x * n / w)), top = yOf(cols[c * 2 + 1]), bot = yOf(cols[c * 2]);
    const a = pTop === null ? top : Math.min(top, pBot), b = pTop === null ? bot : Math.max(bot, pTop);
    span(x0 + x, a, b);
    pTop = top; pBot = bot;
  }
}

/**
 * The stylus on the grid: `pen(x, y, down)` for every event, and only a pen up ends a stroke (a stylus held
 * still sends nothing). Every square a stroke crosses flips once, so drawing over a filled one erases it.
 * `onFlip(r, c, on, first)` after each flip, `onPlay()` and `onClear()` on a tap in the lane. A stroke that starts on a
 * slider only drags it, `onSlide(name, v)` with v from x, and never flips a square whatever y it crosses.
 * why: lessons/rig-palm-drums.md#strokes
 */
export function createPen(grid, { onFlip = () => {}, onPlay = () => {}, onClear = () => {}, onSlide = () => {}, onUp = () => {} } = {}) {
  let stroke = null, strokes = 0;
  function cell(x, y) {
    const h = hitAt(x, y);
    if (h.kind !== 'cell') return;
    const k = h.r * STEPS + h.c;
    if (stroke.seen.has(k)) return;
    stroke.seen.add(k);
    grid[h.r][h.c] = !grid[h.r][h.c];
    onFlip(h.r, h.c, grid[h.r][h.c], !stroke.flips++);
  }
  function pen(x, y, down) {
    if (!down) { if (stroke) onUp(x, y, stroke === 'lane' || stroke.slide ? null : stroke.flips); stroke = null; return; }
    if (!stroke) {
      strokes++;
      const h = hitAt(x, y);
      if (h.kind === 'slider') { stroke = { slide: SLIDERS[h.i] }; return onSlide(stroke.slide, slideAt(x)); }
      if (y >= LANE) { stroke = 'lane'; if (h.kind === 'play') onPlay(); else if (h.kind === 'clear') onClear(); return; }
      stroke = { seen: new Set(), flips: 0, x, y };
      return cell(x, y);
    }
    if (stroke === 'lane') return;
    if (stroke.slide) return onSlide(stroke.slide, slideAt(x));
    // the stylus is reported every few tens of ms, so a fast stroke jumps squares: walk the line between
    // two reports in 2 px steps and flip every square on it
    const n = Math.max(1, Math.ceil(Math.hypot(x - stroke.x, y - stroke.y) / 2));
    for (let i = 1; i <= n; i++) cell(stroke.x + (x - stroke.x) * i / n, stroke.y + (y - stroke.y) * i / n);
    stroke.x = x; stroke.y = y;
  }
  return { pen, active: () => !!stroke && stroke !== 'lane' && !stroke.slide, strokes: () => strokes };
}

/** Two letters a row, for the Pi's OLED beside 16 steps. */
export const SHORT = { kick: 'BD', snare: 'SD', hho: 'OH', hhc: 'CH', clap: 'CP', tomlo: 'LT', tomhi: 'HT', cowbell: 'CB',
  rim: 'RS', ride: 'RD', crash: 'CR', shaker: 'SH', tamb: 'TB', claves: 'CL', congalo: 'LC', congahi: 'HC' };
