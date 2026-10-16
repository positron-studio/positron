// rig/board/panel.mjs: the 0.96" OLED and its four keys on the header (plans/plan-pi-oled.md), for
// /devices/text/ and the other /devices/ pages. The layout is demo/shell/panel-screen.mjs, shared with the page's simulated screen and
// reloaded here whenever that file changes (rig/board/panel-sync.mjs copies it over on every save).
// Nothing runs unless the screen answers at 0x3c, so a board without one is unchanged.
// why: lessons/rig-board-panel.md#header

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync, statSync } from 'node:fs';

const BUS = '1', ADDR = '0x3c', T = '/usr/sbin/i2ctransfer';
// GPIO line -> key, MEASURED 2026-10-15 by press: K1 ^, K2 v, K3 #, K4 *; a press reads low.
export const KEYS = { 5: { k: 1, sym: '^' }, 6: { k: 2, sym: 'v' }, 13: { k: 3, sym: '#' }, 26: { k: 4, sym: '*' } };
const WASM = new URL('../../demo/resources/pico/oled-ui.wasm', import.meta.url);
const LAYOUT = new URL('../../demo/shell/panel-screen.mjs', import.meta.url);
const RINGS = new URL('../../demo/shell/rings.mjs', import.meta.url);
const FRAME_MS = 66;                // the rings' animation, about 15 a second over i2ctransfer
// rig/pico/firmware/ssd1306.c's init, so the panel is lit as the Pico lights it.
const INIT = [0xAE, 0x20, 0x00, 0x40, 0xA1, 0xA8, 63, 0xC8, 0xD3, 0x00, 0xDA, 0x12, 0xD5, 0x80,
  0xD9, 0xF1, 0xDB, 0x30, 0x81, 0xFF, 0xA4, 0xA6, 0x8D, 0x14, 0xAF];

const hex = (b) => `0x${b.toString(16).padStart(2, '0')}`;
// Async: the board's process also streams audio, and a frame is nine writes.
const run = promisify(execFile);
const write = (bytes) => run(T, ['-y', BUS, `w${bytes.length}@${ADDR}`, ...bytes.map(hex)]);

/**
 * A frame with the hold bar over its bottom two rows (page 7, bits 6 and 7), `share` 0 to 1 of the width,
 * on a copy so the mode's own frame is untouched. `null` is no bar.
 * why: lessons/rig-board-stop.md#bar
 */
export function withBar(fb, share) {
  if (share == null) return fb;
  const out = Uint8Array.from(fb);
  const w = Math.round(128 * Math.max(0, Math.min(1, share)));
  for (let x = 0; x < w; x++) out[7 * 128 + x] |= 0xC0;
  return out;
}

/** The panel, or null when no screen answers. `onKey({ k, sym, gpio, down })`. */
export async function openPanel({ log = () => {}, onKey = () => {} } = {}) {
  if (!existsSync(T) || !existsSync(WASM) || !existsSync(LAYOUT)) { log('panel: no i2ctransfer, oled-ui.wasm or panel-screen.mjs, no screen'); return null; }
  try { await write([0x00, 0xE3]); } catch { log(`panel: nothing answers at ${ADDR} on i2c-${BUS}, no screen`); return null; }
  const wasm = readFileSync(WASM);
  // The layout module, imported again under a new query whenever the file's mtime moves.
  let ui = null, loadedAt = 0;
  async function layout() {
    const m = statSync(LAYOUT).mtimeMs;
    if (ui && m === loadedAt) return false;
    const mod = await import(`${LAYOUT.href}?v=${m}`);
    ui = await mod.loadPanelUi(wasm);
    loadedAt = m;
    return true;
  }
  await layout();
  for (let i = 0; i < INIT.length; i += 16) await write([0x00, ...INIT.slice(i, i + 16)]);

  const { createRings } = await import(RINGS.href);
  const rings = createRings();
  const state = { text: '', held: new Set(), shown: 0, layoutAt: 0, mode: 'text', frameMs: 0, bar: null };
  // One draw at a time; a change during a draw is drawn once it ends.
  let busy = false, again = false;
  async function draw() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const t0 = Date.now();
      // `raw` is a finished frame (screen-camera.mjs), drawn as it is.
      const fb = state.mode === 'raw' ? state.raw : ui.frame(state.mode === 'rings' ? { mode: 'rings', rings, t: t0 }
        : state.mode === 'patch' ? { mode: 'patch', patch: state.patch, t: t0 / 1000, events: state.events }
          : state.mode === 'steps' ? { mode: 'steps', steps: state.steps } : { text: state.text, held: [...state.held] });
      // the whole frame in one transfer: the window, then 1024 bytes
      await write([0x00, 0x21, 0, 127, 0x22, 0, 7]);
      await write([0x40, ...withBar(fb, state.bar)]);
      state.shown++;
      state.frameMs = Date.now() - t0;
    } catch (e) {
      log(`panel: draw failed: ${e.message}`);
    } finally {
      busy = false;
      if (again) { again = false; draw(); }
    }
  }
  // The rings turn and a patch's wires run, so both redraw on a clock: the rings while anything is left to
  // draw, a patch while it is on the screen.
  let ticking = null;
  const moving = () => (state.mode === 'rings' && rings.alive(Date.now())) || state.mode === 'patch';
  function animate() {
    if (ticking) return;
    ticking = setInterval(() => {
      if (!moving()) { clearInterval(ticking); ticking = null; draw(); return; }
      draw();
    }, FRAME_MS);
  }

  // A saved layout redraws within a second; a broken one is logged and the old one kept.
  setInterval(() => {
    layout().then((changed) => { if (changed) { state.layoutAt = Date.now(); log('panel: layout reloaded'); draw(); } })
      .catch((e) => log(`panel: the new layout did not load, keeping the old one: ${e.message}`));
  }, 1000).unref?.();

  // The keys: gpiomon prints `<line> <edge>` per edge, debounced 10 ms; the module pulls each line up.
  let mon = null;
  function watch() {
    // stdbuf -oL: into a pipe gpiomon buffers its lines, and a press would wait for the buffer to fill.
    mon = spawn('stdbuf', ['-oL', 'gpiomon', '-c', 'gpiochip0', '-e', 'both', '-p', '10ms', '-F', '%o %E', ...Object.keys(KEYS)]);
    let buf = '';
    mon.stderr.on('data', (d) => log(`panel: gpiomon: ${String(d).trim()}`));
    mon.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const [line, edge] = buf.slice(0, i).trim().split(/\s+/);
        buf = buf.slice(i + 1);
        const key = KEYS[line];
        if (!key) continue;
        const down = edge === 'falling';
        if (down) state.held.add(key.k); else state.held.delete(key.k);
        onKey({ k: key.k, sym: key.sym, gpio: Number(line), down });
        draw();
      }
    });
    mon.on('exit', (code) => { log(`panel: gpiomon exited ${code}, watching again in 2 s`); mon = null; setTimeout(watch, 2000).unref?.(); });
  }
  watch();
  draw();
  log(`panel: the screen answers at ${ADDR}, keys on GPIO ${Object.keys(KEYS).join(', ')}`);
  return {
    text(s) { state.mode = 'text'; state.text = String(s ?? '').slice(0, 120) || ' '; draw(); return state.shown; },
    /** A note on or off for the dot piano: the screen turns to the rings and animates. */
    note(n, on) { state.mode = 'rings'; if (on) rings.noteOn(n, Date.now()); else rings.noteOff(n, Date.now()); animate(); },
    panic() { rings.panic(Date.now()); animate(); },
    /** A small patch, `{ nodes: [{ id }], links: [{ from, to, medium }] }`, drawn as bay-oled.mjs lays it out. */
    patch(p) {
      const nodes = (p?.nodes || []).slice(0, 16).map((n) => ({ id: String(n.id) }));
      const MEDIA = ['midi', 'audio', 'video', 'value', 'clock', 'file', 'state'];
      const links = (p?.links || []).slice(0, 24).map((l) => ({ from: String(l.from), to: String(l.to), ...(MEDIA.includes(l.medium) ? { medium: l.medium } : {}) }));
      state.mode = 'patch'; state.patch = { nodes, links }; state.events = {}; draw(); animate();
    },
    /** Events on the shown patch's links, by link index: each sends one bead along its wire. */
    patchEvent(links) {
      if (state.mode !== 'patch') return state.shown;
      const now = Date.now() / 1000;
      for (const i of [].concat(links)) if (Number.isInteger(i) && i >= 0 && i < 24) state.events[i] = now;
      return state.shown;
    },
    /** A drum pattern, `{ voices, pattern, step, voice, playing, look }`, drawn by steps-oled.mjs; a step change is one frame. */
    steps(p) {
      const voices = (p?.voices || []).slice(0, 8).map((v) => String(v).slice(0, 2));
      const pattern = (p?.pattern || []).slice(0, 8).map((r) => (Array.isArray(r) ? r.map((x) => (x ? '1' : '0')).join('') : String(r)).slice(0, 16));
      const int = (x) => (Number.isInteger(x) ? x : -1);
      const look = { empty: String(p?.look?.empty ?? ''), head: String(p?.look?.head ?? '') };
      state.mode = 'steps'; state.steps = { voices, pattern, step: int(p?.step), voice: int(p?.voice), playing: !!p?.playing, look }; draw();
      return state.shown;
    },
    /** A finished 1024 byte page major frame, drawn as it is; frames arriving mid draw collapse to the newest. */
    frame(bytes) {
      if (!bytes || bytes.length !== 1024) return state.shown;
      state.mode = 'raw'; state.raw = bytes; draw();
      return state.shown;
    },
    /** The hold bar, 0 to 1, over whatever mode is showing; `null` takes it away. */
    bar(share) {
      const v = share == null ? null : Math.max(0, Math.min(1, Number(share) || 0));
      if (v === state.bar) return state.shown;
      state.bar = v; draw();
      return state.shown;
    },
    status: () => ({ mode: state.mode, text: state.text, held: [...state.held], shown: state.shown, layoutAt: state.layoutAt, frameMs: state.frameMs, bar: state.bar }),
    close() { mon?.kill(); write([0x00, 0xAE]).catch(() => {}); },
  };
}
