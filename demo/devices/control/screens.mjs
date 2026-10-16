// demo/devices/control/screens.mjs: the Pi's OLED screens, each in a full (128x64) and a half (128x32)
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
  { key: 'knobs fill', what: 'eight sliders as fills alone, no outline', by: 'new, not on the Pi yet' },
  { key: 'knobs line', what: 'eight sliders as an outline that rises to the value, no fill', by: 'new, not on the Pi yet' },
  { key: 'landscape', what: 'a horizon scrolling past, its height from the sound', by: '/radio/scenery/, /shader/landscape/' },
  { key: 'shader', what: 'a shader preset in one bit dots, the presets taking turns', by: '/shader/mirror/, /shader/remote/' },
  { key: 'tuner', what: 'a dial, a mark per station, the needle moving between them', by: '/radio/tuner/' },
  { key: 'piano roll', what: 'notes scrolling past a playhead', by: '/synth/recorder/, /synth/timeline/' },
  { key: 'keyboard', what: 'two octaves, the keys held drawn pressed', by: '/synth/keyboard/, /code/piano/' },
  { key: 'grains', what: 'a waveform with a line where each grain reads', by: '/granulator/grains/, /granulator/beat/' },
  { key: 'tempo', what: 'a waveform with a line on each beat, the bar line longer', by: '/radio/tempo/, /radio/live/' },
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
  const sliders = (sf, t, n, named, look = 'track') => {
    const gap = n > 8 ? 2 : 4, cw = Math.floor((sf.w - gap * (n - 1)) / n), x0 = Math.floor((sf.w - (cw * n + gap * (n - 1))) / 2);
    const top = named ? 7 : 1, bottom = named ? sf.h - 7 : sf.h - 1, h = bottom - top;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (cw + gap), v = 0.5 + 0.45 * Math.sin(t / (900 + i * 170) + i);
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
        text(sf, c(NAMES[i]), 0, NAMES[i]);
        const val = String(Math.round(v * 127));
        text(sf, c(val), sf.h - 5, val);
      }
    }
  };
  const knobs = (sf, t) => sliders(sf, t, 8, true);
  const knobs16 = (sf, t) => sliders(sf, t, 16, false);
  const knobsFill = (sf, t) => sliders(sf, t, 8, true, 'fill');
  const knobsLine = (sf, t) => sliders(sf, t, 8, true, 'line');
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
  // a bumpy value, the same at any width: two slow sines and a faster one
  const hill = (x, t, k = 1) => Math.sin(x * 0.045 * k + t / 2400) * 0.5 + Math.sin(x * 0.11 * k - t / 1700) * 0.3 + Math.sin(x * 0.27 * k + t / 900) * 0.2;
  const landscape = (sf, t) => {
    const off = t / 40;
    for (let x = 0; x < sf.w; x++) {
      const y = Math.round(sf.h * 0.55 - hill(x + off, 0) * sf.h * 0.3);
      sf.set(x, y);
      for (let yy = y + 2; yy < sf.h; yy += 2) if ((x + yy) % 4 === 0) sf.set(x, yy);
    }
  };
  // shader presets taking turns every 4 s, as /shader/mirror/ steps its looks
  const shader = (sf, t) => {
    const which = Math.floor(t / 4000) % 3, u = t / 1000;
    for (let y = 0; y < sf.h; y++) for (let x = 0; x < sf.w; x++) {
      const nx = x / sf.h, ny = y / sf.h;
      const v = which === 0 ? Math.sin(nx * 6 + u) + Math.sin(ny * 7 - u * 1.3) + Math.sin((nx + ny) * 5 + u * 0.7)
        : which === 1 ? Math.sin(Math.hypot(nx - sf.w / sf.h / 2, ny - 0.5) * 18 - u * 3) * 2
          : Math.sin(nx * 14 + Math.sin(ny * 6 + u) * 2) * 2;
      if ((v + 3) / 6 * 16 > BAYER[(y & 3) * 4 + (x & 3)]) sf.set(x, y);
    }
  };
  // the tuner: a scale of ticks, a taller mark per station, the needle gliding to the next station every 3 s
  const STATIONS = [0.08, 0.21, 0.36, 0.5, 0.63, 0.79, 0.92];
  const tuner = (sf, t) => {
    const y0 = Math.round(sf.h * 0.62), k = Math.floor(t / 3000), f = Math.min(1, (t % 3000) / 900), e = f * f * (3 - 2 * f);
    for (let x = 4; x < sf.w - 4; x += 4) sf.fill(x, y0, 1, x % 16 === 0 ? 3 : 2);
    sf.fill(4, y0 + 3, sf.w - 8, 1);
    for (const st of STATIONS) sf.fill(Math.round(4 + st * (sf.w - 8)), y0 - Math.round(sf.h * 0.18), 1, Math.round(sf.h * 0.18));
    const a = STATIONS[k % STATIONS.length], b = STATIONS[(k + 1) % STATIONS.length], at = a + (b - a) * e;
    const nx = Math.round(4 + at * (sf.w - 8));
    sf.fill(nx - 1, 1, 3, y0 + 3);
  };
  // piano roll: notes as bars scrolling left past a playhead a quarter in
  const ROLL = [[0, 4, 7], [2, 3, 5], [4, 2, 9], [6, 6, 3], [8, 4, 10], [10, 2, 6], [11, 3, 1], [13, 5, 8], [15, 2, 4]];
  const pianoRoll = (sf, t) => {
    const px = 6, beats = 16, span = beats * px, off = (t / 125) * (px / 2) % span, ph = Math.round(sf.w / 4), rh = Math.max(2, Math.floor(sf.h / 12));
    for (let rep = -1; rep < 3; rep++) for (const [st, len, row] of ROLL) {
      const x = Math.round(st * px + rep * span - off), y = sf.h - 1 - (row + 1) * rh;
      sf.fill(x, y, len * px - 1, rh - 1);
    }
    for (let y = 0; y < sf.h; y += 2) sf.set(ph, y);
  };
  // the keyboard: two octaves, white keys as outlines, black ones filled; a held white key filled, a held black one hollow
  const WHITE = [0, 2, 4, 5, 7, 9, 11], BLACK = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
  const keyboard = (sf, t) => {
    const k = Math.floor(t / 900), chord = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [9, 12, 16]][k % 4].map((n) => n + (k % 8 >= 4 ? 1 : 0));
    const held = new Set(chord), ww = Math.floor(sf.w / 14), x0 = Math.floor((sf.w - ww * 14) / 2), h = sf.h - 1, bh = Math.round(h * 0.6);
    for (let o = 0; o < 2; o++) WHITE.forEach((n, i) => {
      const x = x0 + (o * 7 + i) * ww, on = held.has(o * 12 + n);
      sf.fill(x, 0, 1, h); sf.fill(x, h - 1, ww, 1);
      // held: filled below the black keys, where a finger presses a white key
      if (on) sf.fill(x + 2, bh + 2, ww - 3, h - bh - 4);
    });
    sf.fill(x0 + ww * 14, 0, 1, h);
    for (let o = 0; o < 2; o++) for (const [n, wi] of Object.entries(BLACK)) {
      const x = x0 + (o * 7 + wi) * ww + Math.round(ww * 0.65), bw = Math.max(3, Math.round(ww * 0.6)), on = held.has(o * 12 + Number(n));
      for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
        const edge = xx === 0 || xx === bw - 1 || yy === bh - 1;
        sf.set(x + xx, yy, on ? edge : 1);
        if (on && !edge) sf.set(x + xx, yy, 0);
      }
    }
  };
  // a waveform's envelope drawn as a mirrored outline, the shared ground for grains and tempo
  const envelope = (sf, t, scroll) => {
    const mid = Math.floor(sf.h / 2);
    for (let x = 0; x < sf.w; x++) {
      const v = Math.abs(hill(x + scroll, t, 1.7)) * 0.7 + 0.15, a = Math.round(v * (mid - 1));
      sf.set(x, mid - a); sf.set(x, mid + a);
      if (x % 2 === 0) sf.set(x, mid);
    }
  };
  const grains = (sf, t) => {
    envelope(sf, 0, 0);
    // twelve grains, each a short line at where it reads, drifting forward and spreading a little
    for (let g = 0; g < 12; g++) {
      const ph = (t / 2600 + g * 0.083) % 1, x = Math.round((0.3 + ph * 0.4 + Math.sin(g * 2.1) * 0.08) * sf.w);
      const len = Math.round(sf.h * (0.25 + 0.35 * Math.sin(ph * Math.PI)));
      sf.fill(x, Math.floor((sf.h - len) / 2), 1, len);
    }
  };
  const tempo = (sf, t) => {
    const beatPx = 16, scroll = t / 31.25;
    envelope(sf, t, scroll);
    for (let x = -((scroll % beatPx) | 0); x < sf.w; x += beatPx) {
      const n = Math.round((x + scroll) / beatPx), bar = n % 4 === 0;
      if (bar) sf.fill(x, 0, 1, sf.h); else for (let y = Math.round(sf.h * 0.2); y < sf.h * 0.8; y += 2) sf.set(x, y);
    }
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
    'knobs fill': (t) => surfaceFrame(knobsFill, t),
    'knobs line': (t) => surfaceFrame(knobsLine, t),
    landscape: (t) => surfaceFrame(landscape, t),
    shader: (t) => surfaceFrame(shader, t),
    tuner: (t) => surfaceFrame(tuner, t),
    'piano roll': (t) => surfaceFrame(pianoRoll, t),
    keyboard: (t) => surfaceFrame(keyboard, t),
    grains: (t) => surfaceFrame(grains, t),
    tempo: (t) => surfaceFrame(tempo, t),
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
    'knobs fill': (s, t) => knobsFill(s, t),
    'knobs line': (s, t) => knobsLine(s, t),
    landscape, shader, tuner, 'piano roll': pianoRoll, keyboard, grains, tempo,
  };
  return {
    /** One screen, `full` (the whole 128x64) or `half` (128x32, at `top` or bottom). */
    frame(key, t) { return full[key](t); },
    half(key, t) { const s = createSurface(W, 32); half[key](s, t); return s; },
  };
}
