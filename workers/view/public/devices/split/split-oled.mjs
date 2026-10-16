// demo/devices/split/split-oled.mjs: several things on the Pi's 128x64 OLED at once. Each region is drawn
// into its own 1-bit surface and blitted into the 1024 byte page major frame the SSD1306 takes.
// Pure functions, no DOM and no wasm, so rig/board can import it in node.

export const W = 128, H = 64;
/** A strip of 3 px on each region's left: a 2 px bar there marks the region (or the drum row) the keys act in. */
export const GUTTER = 3;
export const SHAPES = ['sine', 'tri', 'saw', 'square'];
export const TEMPOS = [90, 120, 150];

/** Where each region sits, and the 1 px dividers between them. Regions and dividers never overlap. */
export const LAYOUTS = {
  stack: {
    label: 'two bands',
    regions: [{ id: 'drums', x: 0, y: 0, w: 128, h: 36 }, { id: 'scope', x: 0, y: 37, w: 128, h: 27 }],
    dividers: [{ x: 0, y: 36, w: 128, h: 1 }],
  },
  bands: {
    label: 'three bands',
    regions: [{ id: 'status', x: 0, y: 0, w: 128, h: 9 }, { id: 'drums', x: 0, y: 10, w: 128, h: 30 },
      { id: 'scope', x: 0, y: 41, w: 128, h: 23 }],
    dividers: [{ x: 0, y: 9, w: 128, h: 1 }, { x: 0, y: 40, w: 128, h: 1 }],
  },
  halves: {
    label: 'halves',
    regions: [{ id: 'drums', x: 0, y: 0, w: 63, h: 64 }, { id: 'scope', x: 64, y: 0, w: 64, h: 47 },
      { id: 'status', x: 64, y: 48, w: 64, h: 16 }],
    dividers: [{ x: 63, y: 0, w: 1, h: 64 }, { x: 64, y: 47, w: 64, h: 1 }],
  },
};

/** A w by h one bit surface, one byte a pixel; anything drawn outside it is dropped. */
export function createSurface(w, h) {
  const bits = new Uint8Array(w * h);
  const set = (x, y, on = 1) => { if (x >= 0 && y >= 0 && x < w && y < h) bits[y * w + x] = on ? 1 : 0; };
  const fill = (x, y, fw, fh, on = 1) => { for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) set(x + i, y + j, on); };
  return { w, h, bits, set, fill, get: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? bits[y * w + x] : 0) };
}

/** One pixel of a page major frame: page `y >> 3`, bit `y & 7`, LSB the top pixel. */
export const pixel = (frame, x, y) => (frame[(y >> 3) * W + x] >> (y & 7)) & 1;
const setPixel = (frame, x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) frame[(y >> 3) * W + x] |= 1 << (y & 7); };

/** Copy a surface's lit pixels into the frame at (x, y). */
export function blit(frame, s, x, y) {
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) if (s.bits[j * s.w + i]) setPixel(frame, x + i, y + j);
}

// ── a 3x5 font, enough for a status line: digits, capitals and four marks ──
const GLYPHS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '/': '001001010100100', '-': '000000111000000', ':': '000010000010000',
  '>': '100110111110100', '#': '000111111111000', ' ': '000000000000000',
};
export const ADV = 4;
/** Draw `str` at (x, y), 5 px tall, 4 px a character; returns the x after it. */
export function text(s, x, y, str) {
  for (const ch of String(str).toUpperCase()) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') s.set(x + (i % 3), y + Math.floor(i / 3));
    x += ADV;
  }
  return x;
}

const frameBox = (s, x, y, w, h) => { s.fill(x, y, w, 1); s.fill(x, y + h - 1, w, 1); s.fill(x, y, 1, h); s.fill(x + w - 1, y, 1, h); };
const PITCH = 7, CW = 5;

/** The drum grid in a w by h surface: 16 steps when they fit, else the 8 step half holding the running step. */
export function drumGeometry(w, h, rows) {
  const n = w >= 16 * PITCH ? 16 : 8;
  const gw = n * PITCH - 2, x0 = Math.floor((w - gw) / 2);
  const paged = n < 16, gh = rows * PITCH - 2 + (paged ? 5 : 0);
  const y0 = Math.floor((h - gh) / 2) + 1;
  return { n, x0, y0, paged, rowY: (r) => y0 + r * PITCH };
}

/** `st`: `{ pattern: ['1000...'], step, playing }`. An on step is a filled 5 px square, an off one a 2x2 dot. */
export function drawDrums(s, st) {
  const rows = st.pattern.length, g = drumGeometry(s.w, s.h, rows);
  const head = Math.max(0, st.step | 0) % 16, page = g.paged ? Math.floor(head / 8) : 0, first = page * g.n;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < g.n; c++) {
      const x = g.x0 + c * PITCH, y = g.rowY(r);
      if (st.pattern[r][first + c] === '1') s.fill(x, y, CW, CW); else s.fill(x + 2, y + 2, 2, 2);
    }
  }
  // the running step (or the cursor while stopped): a frame in the 1 px gutter round its column
  const c = head - first, x = g.x0 + c * PITCH;
  frameBox(s, x - 1, g.y0 - 1, CW + 2, rows * PITCH);
  // which half is showing: two short bars under the grid, the lit one 2 px tall
  if (g.paged) {
    const y = g.y0 + rows * PITCH + 1, mid = g.x0 + Math.floor((g.n * PITCH - 2) / 2);
    for (let p = 0; p < 2; p++) s.fill(mid + (p ? 2 : -10), y, 8, p === page ? 2 : 1);
  }
  return g;
}

/** `st`: `{ samples }` in -1..1, one per column; a dotted zero line and the trace joined column to column. */
export function drawScope(s, st) {
  const mid = Math.floor((s.h - 1) / 2);
  for (let x = 0; x < s.w; x += 4) s.set(x, mid);
  const smp = st.samples || [], yOf = (v) => Math.round(mid - Math.max(-1, Math.min(1, v)) * (mid - 1));
  let prev = null;
  for (let x = 0; x < s.w; x++) {
    const v = smp.length ? smp[Math.min(smp.length - 1, Math.floor((x * smp.length) / s.w))] : 0, y = yOf(v);
    const a = prev === null ? y : Math.min(prev, y), b = prev === null ? y : Math.max(prev, y);
    // a vertical run from the last column's height, so a square wave's edges are drawn
    for (let j = a; j <= b; j++) s.set(x, j);
    prev = y;
  }
}

/** `st`: `{ playing, bpm, shape, step }`, one line, as much as the width holds. */
export function drawStatus(s, st) {
  const y = Math.floor((s.h - 5) / 2);
  const words = [st.playing ? '>' : '#', String(st.bpm), st.shape === 'square' ? 'SQR' : String(st.shape).toUpperCase(),
    String((st.step | 0) + 1).padStart(2, '0')];
  let x = 1;
  for (const w of words) {
    if (x + w.length * ADV - 1 > s.w) break;
    x = text(s, x, y, w) + ADV - 1;
  }
}

const DRAW = { drums: drawDrums, scope: drawScope, status: drawStatus };

/** Every place the keys can act, top to bottom: each drum row is a stop of its own. */
export function focusStops(layout, rows) {
  const L = LAYOUTS[layout] || LAYOUTS.stack, out = [];
  for (const r of L.regions) {
    if (r.id === 'drums') for (let i = 0; i < rows; i++) out.push({ region: 'drums', row: i });
    else out.push({ region: r.id });
  }
  return out;
}

/**
 * The 1024 byte frame for `layout`. `state` is `{ drums, scope, status, focus }`, `focus` a stop from
 * `focusStops`. `only` draws one region id, or 'dividers', and nothing else (the page's checks use it);
 * `marks: false` leaves out the focus bar.
 */
export function compose(layout, state, { only = null, marks = true } = {}) {
  const L = LAYOUTS[layout] || LAYOUTS.stack, frame = new Uint8Array((W * H) / 8);
  for (const r of L.regions) {
    if (only && only !== r.id) continue;
    const inner = createSurface(r.w - GUTTER, r.h);
    const g = DRAW[r.id](inner, state[r.id] || {});
    blit(frame, inner, r.x + GUTTER, r.y);
    const f = state.focus;
    if (!marks || !f || f.region !== r.id) continue;
    // the focus bar: beside the focused drum row, or down the whole region less a pixel each end
    const y = r.id === 'drums' && g ? r.y + g.rowY(f.row || 0) : r.y + 1, h = r.id === 'drums' && g ? CW : r.h - 2;
    for (let j = 0; j < h; j++) { setPixel(frame, r.x, y + j); setPixel(frame, r.x + 1, y + j); }
  }
  if (!only || only === 'dividers') for (const d of L.dividers) for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) setPixel(frame, d.x + i, d.y + j);
  return frame;
}

/** Lit pixels of `frame` outside `rects`, as `[x, y]` pairs (the checks want none). */
export function strays(frame, rects) {
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!pixel(frame, x, y)) continue;
    if (!rects.some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h)) out.push([x, y]);
  }
  return out;
}
export const lit = (frame) => { let n = 0; for (const b of frame) for (let v = b; v; v >>= 1) n += v & 1; return n; };

/** One cycle-ish of `shape` at `phase`, scaled by `amp`, as `n` samples: what the simulated synth sends. */
export function wave(shape, n, { cycles = 2.5, phase = 0, amp = 1 } = {}) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = ((i / n) * cycles + phase) % 1;
    const v = shape === 'tri' ? 1 - 4 * Math.abs(p - 0.5) : shape === 'saw' ? 2 * p - 1 : shape === 'square' ? (p < 0.5 ? 1 : -1)
      : Math.sin(2 * Math.PI * p);
    out[i] = v * amp;
  }
  return out;
}
