// demo/devices/control/menu-oled.mjs: the patchbay manager's menu on the Pi's screen (plans/plan-patchbay-manager.md
// sections 3 and 4): a model of the manager's one record and the 1024 byte frame it draws. Pure, no DOM and no wasm, so rig/board can
// import it in node. Every function takes the time `t` in ms, so a check can press for exactly 999 ms.

import { W, H, createSurface, blit, text, ADV, drawDrums } from '../split/split-oled.mjs';

export { W, H };
export const HOLD_MS = 1000;
export const LOAD_MS = 400;
/** The five built-in patches of plan section 1.4, their links in the bay's text form. */
export const PATCHES = [
  { name: 'drums', label: 'Pi drums', screen: 'steps',
    links: ['pi-1:sequencer:midi-out -> pi-1:drums:midi-in { drummap gm }', 'pi-1:drums:audio-out -> pi-1:pwm:audio-in'] },
  { name: 'beat', label: 'Circuit drums from the Pi', screen: 'steps',
    links: ['pi-1:sequencer:midi-out -> pi-1:circuit:midi-in { drummap circuit }'] },
  { name: 'synth', label: 'Keyboard to Plaits', screen: 'patch',
    links: ['pi-1:mk-425c:midi-out -> pi-1:plaits:midi-in', 'pi-1:plaits:audio-out -> pi-1:pwm:audio-in'] },
  { name: 'keys', label: 'Keyboard to the Circuit', screen: 'patch',
    links: ['pi-1:mk-425c:midi-out -> pi-1:circuit:midi-in { channel 1 }'] },
  { name: 'circuit', label: 'Circuit drums on the Pi', screen: 'circuit',
    links: ['pi-1:circuit:midi-out -> pi-1:drums:midi-in { drummap circuit }', 'pi-1:drums:audio-out -> pi-1:pwm:audio-in'] },
];
/** Plaits' sound in the synth patch, as ^ and v pick it. */
export const SOUNDS = ['Virtual analog', 'Waveshaping', 'Fm', 'Grains', 'Additive', 'Wavetable', 'Chords', 'Speech'];
export const VOICES = ['BD', 'SD', 'CH', 'OH'];
const START = ['1000100010001000', '0000100000001000', '1010101010101010', '0000000000100000'];

/** The menu's geometry: a header line, four 11 px rows on a 12 px pitch, the hold bar on the last 3 lines. */
export const MENU = { headerH: 9, rowY: (i) => 11 + i * 12, rowH: 11, rows: 4, barY: 61, barH: 3 };

/**
 * The board's record and its keys. `key(k, down, t)` takes K1 to K4 (^ v # *), `tick(t)` moves the
 * clock and fires the held * at 1000 ms, `load(name, t)` and `stop(t)` are what the remote page sends.
 * `onChange(why)` is called after anything a viewer could see changed.
 */
export function createPiModel({ patches = PATCHES, onChange = () => {} } = {}) {
  const s = {
    view: 'menu', sel: 0, top: 0, playing: null, loading: null, loadAt: 0,
    seq: { running: false, t0: 0, bpm: 120, step: 0, row: 0, pattern: START.map((r) => r.split('').map((c) => c === '1')) },
    channel: 1, sound: 0, notes: 0,
    held: new Set(), holdAt: null, fired: false, stops: 0, by: null,
  };
  const P = (name) => patches.find((p) => p.name === name) || null;
  const said = (why) => onChange(why);
  const stepMs = () => 60000 / s.seq.bpm / 4;

  function keepInView() {
    if (s.sel < s.top) s.top = s.sel;
    if (s.sel >= s.top + MENU.rows) s.top = s.sel - MENU.rows + 1;
  }
  /** The link lines the board holds now, with what the keys changed folded in. */
  function links() {
    const p = P(s.playing);
    if (!p) return [];
    return p.links.map((l) => (p.name === 'keys' ? l.replace(/\{ channel \d \}/, `{ channel ${s.channel} }`) : l));
  }
  function load(name, t, by = 'remote') {
    const p = P(name);
    if (!p) return { ok: false, why: `no patch called ${name}` };
    if (s.loading) return { ok: false, why: `${s.loading} is still loading` };
    s.loading = name; s.loadAt = t; s.by = by; s.sel = patches.indexOf(p); keepInView();
    s.playing = null; s.seq.running = false;
    said('loading');
    return { ok: true };
  }
  function finishLoad(t) {
    const p = P(s.loading);
    s.loading = null; s.playing = p.name; s.view = 'play';
    if (p.screen === 'steps') { s.seq.running = true; s.seq.t0 = t; s.seq.step = 0; }
    said('loaded');
  }
  /** Stop all: note sources, targets, links and engines, in the plan's order; here, the record cleared. */
  function stop(t, by = 'remote') {
    s.seq.running = false; s.loading = null; s.playing = null; s.view = 'menu'; s.stops++; s.by = by;
    said('stopped');
    return { ok: true };
  }
  function tap(k, t) {
    const p = P(s.playing);
    if (s.loading) return;
    if (s.view === 'menu') {
      if (k === 1) { s.sel = (s.sel + patches.length - 1) % patches.length; keepInView(); }
      else if (k === 2) { s.sel = (s.sel + 1) % patches.length; keepInView(); }
      else if (k === 3) {
        if (patches[s.sel].name === s.playing) s.view = 'play';
        else load(patches[s.sel].name, t, 'keys');
      }
      return said('key');
    }
    if (!p) return;
    if (p.screen === 'steps') {
      const q = s.seq;
      if (k === 1) q.row = (q.row + VOICES.length - 1) % VOICES.length;
      else if (k === 2) q.row = (q.row + 1) % VOICES.length;
      else if (k === 3) q.pattern[q.row][q.step] = !q.pattern[q.row][q.step];
      return said('key');
    }
    if (p.name === 'synth') {
      if (k === 1) s.sound = (s.sound + SOUNDS.length - 1) % SOUNDS.length;
      else if (k === 2) s.sound = (s.sound + 1) % SOUNDS.length;
      else if (k === 3) s.notes++;
      return said('key');
    }
    if (p.name === 'keys') {
      if (k === 1) s.channel = 1;
      else if (k === 2) s.channel = 2;
      else if (k === 3) s.notes++;
      return said(k === 3 ? 'key' : 'links');
    }
  }
  function key(k, down, t) {
    if (down) {
      if (s.held.has(k)) return;
      s.held.add(k);
      if (k === 4) { s.holdAt = t; s.fired = false; return said('hold'); }
      // ^ and v together open the menu; the first of the two already acted on its own press
      if ((k === 1 && s.held.has(2)) || (k === 2 && s.held.has(1))) {
        if (!s.loading && s.view !== 'menu') { s.view = 'menu'; return said('menu'); }
        return;
      }
      if (k !== 4) tap(k, t);
      return;
    }
    if (!s.held.has(k)) return;
    s.held.delete(k);
    if (k !== 4) return said('key');
    const long = s.holdAt !== null && t - s.holdAt >= HOLD_MS;
    const was = s.fired;
    s.holdAt = null; s.fired = false;
    if (was) return said('key');
    if (long) { stop(t, 'keys'); return; }
    // a tap of *: the sequencer plays or stops, or the menu goes back to what is playing
    const p = P(s.playing);
    if (s.view === 'menu') { if (p) s.view = 'play'; }
    else if (p?.screen === 'steps') {
      s.seq.running = !s.seq.running;
      if (s.seq.running) { s.seq.t0 = t - s.seq.step * stepMs(); }
    }
    said('key');
  }
  function tick(t) {
    if (s.loading && t - s.loadAt >= LOAD_MS) finishLoad(t);
    if (s.holdAt !== null && !s.fired && t - s.holdAt >= HOLD_MS) { s.fired = true; stop(t, 'keys'); }
    if (s.seq.running) {
      const st = Math.floor((t - s.seq.t0) / stepMs()) % 16;
      if (st !== s.seq.step) { s.seq.step = st; said('step'); }
    }
  }
  /** How far the held * has filled, 0 to 1, or null when * is not held. */
  const hold = (t) => (s.holdAt === null || s.fired ? null : Math.min(1, (t - s.holdAt) / HOLD_MS));
  return { s, patches, links, load, stop, key, tick, hold, frame: (t, o) => drawPi(api(), t, o) };
  function api() { return { s, patches, links, hold }; }
}

// ── drawing: one 1-bit surface the size of the panel, packed page major at the end ──

/** A 3x5 glyph at twice its size, 6x10, 8 px a character. */
function bigText(sf, x, y, str, on = 1) {
  const tmp = createSurface(ADV * String(str).length, 5);
  text(tmp, 0, 0, str);
  for (let j = 0; j < 5; j++) for (let i = 0; i < tmp.w; i++) if (tmp.bits[j * tmp.w + i]) sf.fill(x + 2 * i, y + 2 * j, 2, 2, on);
  return x + 2 * tmp.w;
}
/** Text drawn unlit, for a row whose box is filled. */
function smallText(sf, x, y, str, on = 1) {
  const tmp = createSurface(ADV * String(str).length, 5);
  text(tmp, 0, 0, str);
  for (let j = 0; j < 5; j++) for (let i = 0; i < tmp.w; i++) if (tmp.bits[j * tmp.w + i]) sf.set(x + i, y + j, on);
  return x + tmp.w;
}
const ring = (sf, x, y) => { sf.fill(x + 1, y, 3, 1); sf.fill(x + 1, y + 4, 3, 1); sf.fill(x, y + 1, 1, 3); sf.fill(x + 4, y + 1, 1, 3); };
const tw = (str) => String(str).length * ADV - 1;

function header(sf, left, right) {
  smallText(sf, 0, 2, left);
  if (right) smallText(sf, W - tw(right), 2, right);
  sf.fill(0, MENU.headerH - 1 + 1, W, 1);
}

function drawMenu(sf, m) {
  const { s, patches } = m;
  // the relay dot: a ring, because this simulation reaches no relay; filled when the board's socket is open
  ring(sf, 0, 2);
  smallText(sf, 8, 2, s.loading ? `LOADING ${s.loading}` : s.playing ? `PLAYING ${s.playing}` : 'NOTHING PLAYING');
  sf.fill(0, MENU.headerH, W, 1);
  for (let i = 0; i < MENU.rows; i++) {
    const p = patches[s.top + i];
    if (!p) break;
    const y = MENU.rowY(i), on = s.top + i === s.sel;
    if (on) sf.fill(0, y, W, MENU.rowH, 1);
    bigText(sf, 4, y + 1, p.name, on ? 0 : 1);
    // the playing patch carries a play mark at the right end of its row
    if (p.name === s.playing) bigText(sf, W - 10, y + 1, '>', on ? 0 : 1);
    else if (p.name === s.loading) bigText(sf, W - 22, y + 1, '--', on ? 0 : 1);
  }
  // more rows than fit: a 1 px scroll mark down the right edge
  if (patches.length > MENU.rows) {
    const span = MENU.rows * 12 - 1, h = Math.round((span * MENU.rows) / patches.length), y0 = MENU.rowY(0) + Math.round((span * s.top) / patches.length);
    sf.fill(W - 1, y0, 1, h, 1);
  }
}

function drawSteps(sf, m) {
  const { s } = m, q = s.seq;
  header(sf, s.playing, `${q.bpm} ${q.running ? '>' : '#'}`);
  // the row labels, the edited row inverted, beside the drum grid of split-oled.mjs
  const grid = createSurface(114, 30);
  const g = drawDrums(grid, { pattern: q.pattern.map((r) => r.map((x) => (x ? '1' : '0')).join('')), step: q.step });
  blit2(sf, grid, 13, 12);
  for (let r = 0; r < VOICES.length; r++) {
    const y = 12 + g.rowY(r);
    if (r === q.row) { sf.fill(0, y - 1, 10, 7, 1); smallText(sf, 1, y, VOICES[r], 0); }
    else smallText(sf, 1, y, VOICES[r]);
  }
  smallText(sf, 0, 47, `STEP ${String(q.step + 1).padStart(2, '0')}`);
  smallText(sf, W - tw(`ROW ${VOICES[q.row]}`), 47, `ROW ${VOICES[q.row]}`);
}

function drawPatch(sf, m) {
  const { s } = m;
  header(sf, s.playing, s.playing === 'keys' ? `CH ${s.channel}` : '');
  const lines = m.links().map((l) => {
    const [a, b] = l.split('->').map((x) => x.trim().split(/\s/)[0].split(':')[1]);
    return `${a} > ${b}`;
  });
  lines.forEach((ln, i) => smallText(sf, 0, 14 + i * 8, ln));
  const y = 14 + lines.length * 8 + 3;
  if (s.playing === 'synth') smallText(sf, 0, y, SOUNDS[s.sound]);
  if (s.notes) smallText(sf, W - tw(`NOTE ${s.notes}`), 47, `NOTE ${s.notes}`);
}

function drawLoading(sf, m) {
  const { s } = m;
  header(sf, 'LOADING', '');
  bigText(sf, Math.round((W - 8 * s.loading.length) / 2), 26, s.loading);
}

/** A surface copied into another at (x, y). */
function blit2(dst, src, x, y) { for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) if (src.bits[j * src.w + i]) dst.set(x + i, y + j); }

/**
 * The 1024 byte page major frame. `bar: false` leaves out the hold bar (the checks compare with it).
 * Answers the frame with `.view`, the screen it drew, for a reader.
 */
export function drawPi(m, t, { bar = true } = {}) {
  const sf = createSurface(W, H), { s } = m;
  let view = 'menu';
  if (s.loading) { view = 'loading'; drawLoading(sf, m); }
  else if (s.view === 'menu' || !s.playing) drawMenu(sf, m);
  else {
    const p = m.patches.find((x) => x.name === s.playing);
    view = p.screen === 'steps' ? 'steps' : 'patch';
    if (view === 'steps') drawSteps(sf, m); else drawPatch(sf, m);
  }
  const h = m.hold(t);
  if (bar && h !== null) {
    // the stop all bar fills left to right along the bottom while * is held, over whatever is there
    sf.fill(0, MENU.barY - 1, W, MENU.barH + 1, 0);
    sf.fill(0, MENU.barY, Math.max(1, Math.round(W * h)), MENU.barH, 1);
  }
  const frame = new Uint8Array((W * H) / 8);
  blit(frame, sf, 0, 0);
  frame.view = view;
  return frame;
}
