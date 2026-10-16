// demo/devices/control/screens.mjs: the Pi's five OLED screens, each in a full (128x64) and a half (128x32)
// version, simulated. Full versions use the board's own renderer (oled-ui.wasm) where it has the mode;
// half versions draw on a 128x32 surface. Nothing names a screen on the screen itself.

import { createSurface, blit, text, drawDrums, drawScope, wave, W } from '../split/split-oled.mjs';
import { createRings } from '/shell/rings.mjs';

export const SCREENS = [
  { key: 'text', what: 'a line of text and the keys held', by: '/devices/text/' },
  { key: 'rings', what: 'a ring of dots for each note playing', by: '/devices/dots/' },
  { key: 'patch', what: 'boxes and wires, a bead on each event', by: '/devices/patches/, /devices/keys/, /devices/synth/' },
  { key: 'steps', what: 'the drum grid, the running step framed', by: '/devices/drums/, /devices/beat/, /devices/circuit/' },
  { key: 'camera', what: 'the camera in one bit dots', by: '/devices/camera/' },
  { key: 'scope', what: 'the waveform of what is playing', by: 'new, not on the Pi yet' },
  { key: 'knobs', what: 'eight sliders, a two letter name over each and its value under it', by: 'new, not on the Pi yet' },
  { key: 'knobs16', what: 'sixteen sliders, the fills only', by: 'new, not on the Pi yet' },
];

const PATTERN = ['1000100010001000', '0000100000001000', '1010101010101010', '0000000000000010',
  '0000000010000000', '0010000000100000', '0000001000000000', '0001000000010001'];
// Where the board's text screen starts its key column (panel-screen.mjs: 14 px wide).
const KEYS_X = 114;
const TEXT = 'hello from the Pi in the other building, playing drums on its own clock while you read this';
/** Words wrapped to `n` characters a line. */
const wrap = (str, n) => str.split(' ').reduce((ls, w) => { const l = ls[ls.length - 1]; if ((l + ' ' + w).trim().length <= n) ls[ls.length - 1] = (l + ' ' + w).trim(); else ls.push(w); return ls; }, ['']);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** A simulated feed for every screen, driven by one clock `t` in ms. */
export function createScreens(ui) {
  const ringsFull = createRings({ w: 128, h: 64 }), ringsHalf = createRings({ w: 128, h: 32 });
  let lastNote = -1;
  const step = (t) => Math.floor(t / 125) % 16;
  function playNotes(t) {
    // a three note chord every 4 s, each note held 3.6 s, so a ring draws most of its circle
    const k = Math.floor(t / 4000);
    if (k === lastNote) return;
    lastNote = k;
    const root = [48, 53, 55, 50][k % 4];
    for (const n of [root, root + 4, root + 7]) for (const r of [ringsFull, ringsHalf]) {
      r.noteOn(n, t); setTimeout(() => r.noteOff(n, performance.now()), 3600);
    }
  }
  // the camera: a round soft blob circling the middle over a faint gradient, ordered dither. Distances in
  // pixels, so the blob is round on a 2:1 screen; its radius and its orbit follow the screen's height.
  const camera = (s, t) => {
    const a = t / 1400, orbit = s.h * 0.55, r = s.h * 0.42;
    const cx = s.w / 2 + Math.cos(a) * orbit, cy = s.h / 2 + Math.sin(a) * orbit * 0.45;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      const v = Math.max(0, 1 - d) * 0.9 + (x / s.w) * 0.1;
      if (v * 16 > BAYER[(y & 3) * 4 + (x & 3)]) s.set(x, y);
    }
  };
  // the scope: two and a half cycles, the shape sliding from sine to saw and back
  const scope = (sf, t) => {
    const m = (Math.sin(t / 2200) + 1) / 2, a = wave('sine', sf.w, { phase: t / 400 }), b = wave('saw', sf.w, { phase: t / 400 });
    drawScope(sf, { samples: a.map((v, i) => v * (1 - m) + b[i] * m) });
  };
  // knobs: vertical sliders, a 1 px track with the corner pixels off and a fill rising to the value. With `named`
  // a two letter name sits over each and its value, 0 to 127, under it; sixteen is the fills alone.
  const NAMES = ['CU', 'RE', 'AT', 'DE', 'SU', 'RL', 'LF', 'DR'];
  const sliders = (sf, t, n, named) => {
    const gap = n > 8 ? 2 : 4, cw = Math.floor((sf.w - gap * (n - 1)) / n), x0 = Math.floor((sf.w - (cw * n + gap * (n - 1))) / 2);
    const top = named ? 7 : 1, bottom = named ? sf.h - 7 : sf.h - 1, h = bottom - top;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (cw + gap), v = 0.5 + 0.45 * Math.sin(t / (900 + i * 170) + i);
      sf.fill(x + 1, top, cw - 2, 1); sf.fill(x + 1, bottom - 1, cw - 2, 1); sf.fill(x, top + 1, 1, h - 2); sf.fill(x + cw - 1, top + 1, 1, h - 2);
      const fh = Math.round((h - 4) * v);
      sf.fill(x + 2, bottom - 2 - fh, cw - 4, fh);
      if (named) {
        const c = (str) => x + Math.floor((cw - (str.length * 4 - 1)) / 2);
        text(sf, c(NAMES[i]), 0, NAMES[i]);
        const val = String(Math.round(v * 127));
        text(sf, c(val), sf.h - 5, val);
      }
    }
  };
  const knobs = (sf, t) => sliders(sf, t, 8, true);
  const knobs16 = (sf, t) => sliders(sf, t, 16, false);
  // the patch: three columns, the players, the sounds, the output; MIDI wires dashed, audio solid, a bead on
  // each. One drawing for both heights: rows spread over the surface's height, boxes a third of it.
  const patch = (sf, t) => {
    const bw = 34, bh = Math.floor((sf.h - 2) / 3), row = (i, n) => Math.round(i * (sf.h - bh) / (n - 1));
    const box = (x, y, name) => {
      sf.fill(x + 1, y, bw - 2, 1); sf.fill(x + 1, y + bh - 1, bw - 2, 1); sf.fill(x, y + 1, 1, bh - 2); sf.fill(x + bw - 1, y + 1, 1, bh - 2);
      const ty = y + Math.floor((bh - 5) / 2);
      text(sf, x + Math.floor((bw - name.length * 4 + 1) / 2), ty, name);
      return { x, r: x + bw, m: ty + 2 };
    };
    const seq = box(1, row(0, 3), 'SEQ'), circ = box(1, row(1, 3), 'CIRCUIT'), mk = box(1, row(2, 3), 'MK-425C');
    const mid = Math.round((sf.h - bh) / 2), spread = Math.round(bh * 0.6);
    const drums = box(47, mid - spread, 'DRUMS'), plaits = box(47, mid + spread, 'PLAITS'), pwm = box(93, mid, 'PWM');
    const wire = (a, b, dashed, k) => {
      const xm = Math.floor((a.r + b.x) / 2);
      for (let x = a.r; x <= xm; x++) if (!dashed || x % 3) sf.set(x, a.m);
      for (let y = Math.min(a.m, b.m); y <= Math.max(a.m, b.m); y++) if (!dashed || y % 3) sf.set(xm, y);
      for (let x = xm; x < b.x; x++) if (!dashed || x % 3) sf.set(x, b.m);
      const f = (t / 700 + k * 0.37) % 1, bx = a.r + Math.floor(f * (b.x - a.r - 2));
      sf.fill(bx, (bx < xm ? a.m : b.m) - 1, 2, 3);
    };
    wire(seq, drums, true, 0); wire(circ, drums, true, 1); wire(mk, plaits, true, 2);
    wire(drums, pwm, false, 3); wire(plaits, pwm, false, 4);
  };
  const surfaceFrame = (draw, t) => { const sf = createSurface(W, 64), f = new Uint8Array(1024); draw(sf, t); blit(f, sf, 0, 0); return f; };
  const full = {
    // The board's text screen draws the four key symbols down its right edge; here only the text.
    text: () => { const f = ui.frame({ text: TEXT, held: [] }); for (let p = 0; p < 8; p++) f.fill(0, p * 128 + KEYS_X, p * 128 + 128); return f; },
    rings: (t) => { playNotes(t); return ui.frame({ mode: 'rings', rings: ringsFull, t }); },
    patch: (t) => surfaceFrame(patch, t),
    steps: (t) => ui.frame({ mode: 'steps', steps: { voices: ['BD', 'SD', 'CH', 'OH', 'CP', 'LT', 'HT', 'CB'], pattern: PATTERN,
      step: step(t), voice: -1, playing: true, look: { empty: 'dot', head: 'frame' } } }),
    camera: (t) => { const s = createSurface(W, 64), f = new Uint8Array(1024); camera(s, t); blit(f, s, 0, 0); return f; },
    scope: (t) => surfaceFrame(scope, t),
    knobs: (t) => surfaceFrame(knobs, t),
    knobs16: (t) => surfaceFrame(knobs16, t),
  };
  // half: 128x32 surfaces, the same content made to fit
  const half = {
    text: (s) => { wrap(TEXT, 31).slice(0, 5).forEach((l, i) => text(s, 2, 1 + i * 6, l)); },
    rings: (s, t) => { playNotes(t); ringsHalf.draw((x, y) => s.set(x, y), t); },
    patch: (s, t) => patch(s, t),
    steps: (s, t) => { drawDrums(s, { pattern: PATTERN.slice(0, 4), step: step(t), playing: true }); },
    camera: (s, t) => camera(s, t),
    scope: (s, t) => scope(s, t),
    knobs: (s, t) => knobs(s, t),
    knobs16: (s, t) => knobs16(s, t),
  };
  return {
    /** One screen, `full` (the whole 128x64) or `half` (128x32, at `top` or bottom). */
    frame(key, t) { return full[key](t); },
    half(key, t) { const s = createSurface(W, 32); half[key](s, t); return s; },
  };
}
