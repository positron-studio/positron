// demo/shell/palm-drums.mjs: the drum grid on the Palm's 160x160 screen, drawn and played by the stylus.
// One picture and one pen for the real Palm (rig/palm/bridge.mjs --view drums) and its copy in a tab
// (/devices/palmdrums/). Pure: no DOM, no socket; node imports it.

export const W = 160, H = 160;
export const STEPS = 16, ROWS = 16;
// the grid starts 8 rows under pframe's old top strip, so a tap on the kick row stays clear of it
export const TOP = 22, PY = 7, CH = 6, PX = 10, CW = 8, X0 = 1;
/** The lane under the grid, 24 rows: play and stop left of PLAY_X, clear from CLEAR_X, nothing between. */
export const LANE = TOP + ROWS * PY + 2;
export const PLAY_X = 40, CLEAR_X = 120;

/** An empty grid, `ROWS` arrays of `STEPS` booleans. */
export const emptyGrid = () => Array.from({ length: ROWS }, () => new Array(STEPS).fill(false));

/** What a point on the screen is: `{ kind: 'cell', r, c }`, `{ kind: 'play' }`, `{ kind: 'clear' }` or `{ kind: 'none' }`. */
export function hitAt(x, y) {
  if (y >= LANE) return { kind: x < PLAY_X ? 'play' : x >= CLEAR_X ? 'clear' : 'none' };
  const r = Math.floor((y - TOP) / PY), c = Math.floor((x - X0) / PX);
  return r >= 0 && r < ROWS && c >= 0 && c < STEPS ? { kind: 'cell', r, c } : { kind: 'none' };
}

/**
 * `draw({ rect, put }, s)`: `rect(x, y, w, h, v)` and `put(x, y, v)` paint ink 0 to 15, and `s` is
 * `{ grid, step, running, starting, selRow, pen }`. Shapes, not greys, so it reads the same at 1 bit.
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
  // play (a square while running, dim while the Pi is being asked) at the left, clear (an X) at the right
  const v = s.starting ? 5 : 15, cx = 16, cy = LANE + 12;
  if (s.running) rect(cx - 4, cy - 4, 9, 9, v);
  else for (let i = 0; i < 6; i++) rect(cx - 3 + i, cy - 5 + i, 1, 11 - 2 * i, v);
  for (let i = 0; i < 9; i++) { put(140 + i, cy - 4 + i, 15); put(148 - i, cy - 4 + i, 15); put(141 + i, cy - 4 + i, 15); put(147 - i, cy - 4 + i, 15); }
  if (s.pen?.down) put(s.pen.x, s.pen.y, 15);
}

/**
 * The stylus on the grid: `pen(x, y, down)` for every event, and only a pen up ends a stroke (a stylus held
 * still sends nothing). Every square a stroke crosses flips once, so drawing over a filled one erases it.
 * `onFlip(r, c, on, first)` after each flip, `onPlay()` and `onClear()` on a tap in the lane.
 * why: lessons/rig-palm-drums.md#strokes
 */
export function createPen(grid, { onFlip = () => {}, onPlay = () => {}, onClear = () => {}, onUp = () => {} } = {}) {
  let stroke = null, last = null, strokes = 0;
  function pen(x, y, down) {
    if (!down) { if (stroke) onUp(x, y, stroke === 'lane' ? null : stroke.flips); stroke = null; last = null; return; }
    if (!stroke) {
      strokes++;
      const h = hitAt(x, y);
      if (y >= LANE) { stroke = 'lane'; if (h.kind === 'play') onPlay(); else if (h.kind === 'clear') onClear(); return; }
      stroke = { seen: new Set(), flips: 0 };
    }
    if (stroke === 'lane') return;
    const h = hitAt(x, y);
    if (h.kind !== 'cell') return;
    const k = h.r * STEPS + h.c;
    if (k === last || stroke.seen.has(k)) return;
    last = k; stroke.seen.add(k);
    grid[h.r][h.c] = !grid[h.r][h.c];
    onFlip(h.r, h.c, grid[h.r][h.c], !stroke.flips++);
  }
  return { pen, active: () => !!stroke && stroke !== 'lane', strokes: () => strokes };
}

/** Two letters a row, for the Pi's OLED beside 16 steps. */
export const SHORT = { kick: 'BD', snare: 'SD', hho: 'OH', hhc: 'CH', clap: 'CP', tomlo: 'LT', tomhi: 'HT', cowbell: 'CB',
  rim: 'RS', ride: 'RD', crash: 'CR', shaker: 'SH', tamb: 'TB', claves: 'CL', congalo: 'LC', congahi: 'HC' };
