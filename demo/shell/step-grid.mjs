// demo/shell/step-grid.mjs: rows of square pads over a ruler, with a head that walks them
// (lifted from /tom/; not pad.mjs's createPadGrid). Pads are sized in JS so labels align.
// Read only is a state, not disabled; the clock is opt in, needs a `whose`, and makes no sound.
// why: lessons/kit-step-grid.md#header

import { el } from './shell.mjs';

/**
 * The smallest a pad gets before the strip scrolls. At 390 px a strip has about 360 px,
 * 20 px a pad over sixteen steps.
 * why: lessons/kit-step-grid.md#pad-min
 */
export const PAD_MIN = 10;

/** The gutter between pads, and the one place it is read. It is also the row
 *  gap, which is what lets the label column and the steps share one pitch. */
export const PAD_GAP = 2;

/**
 * Head light rise and fall in ms. The trail behind the head is only the fall transition.
 * 180 ms is 1.4 steps at 120 bpm (a step is 125 ms). RISE is on the head rule, FALL on the base.
 * why: lessons/kit-step-grid.md#rise-fall
 */
export const RISE_MS = 90;
export const FALL_MS = 180;

/**
 * How wide one pad is in whole CSS pixels, never below `min`, so a narrow box scrolls
 * instead of drawing nothing.
 * why: lessons/kit-step-grid.md#cell-size
 */
export function cellSize(boxW, steps, gap = PAD_GAP, min = PAD_MIN) {
  const n = Math.max(1, Math.floor(Number(steps) || 0));
  const g = Math.max(0, Number(gap) || 0);
  const w = Math.max(0, Number(boxW) || 0);
  return Math.max(min, Math.floor((w - (n - 1) * g) / n));
}

/**
 * Which step a position in ms is inside, clamped at both ends (never step `n`).
 * why: lessons/kit-step-grid.md#step-at
 */
export function stepAt(pos, stepMs, steps) {
  const ms = Math.max(1e-9, Number(stepMs) || 1);
  const n = Math.max(1, Math.floor(Number(steps) || 0));
  const i = Math.floor((Number(pos) || 0) / ms);
  return Math.max(0, Math.min(n - 1, i));
}

/**
 * How long one step is, at a tempo.
 *
 * @param {number} bpm
 * @param {number} [perBeat]  steps in a beat, four by default, which is a
 *   sixteenth note grid and is what both pages here use.
 */
export function stepMsFor(bpm, perBeat = 4) {
  const b = Math.max(1e-9, Number(bpm) || 0);
  const p = Math.max(1, Math.floor(Number(perBeat) || 1));
  return 60000 / (b * p);
}

/**
 * Where an arrow, Home or End lands from `r, s`. Clamps, never wraps.
 * @returns {[number, number]|null} `null` for a key this does not handle
 * why: lessons/kit-step-grid.md#roving-next
 */
export function rovingNext(key, r, s, rows, steps) {
  const R = Math.max(1, Math.floor(Number(rows) || 0));
  const S = Math.max(1, Math.floor(Number(steps) || 0));
  const to = {
    ArrowLeft: [r, s - 1], ArrowRight: [r, s + 1],
    ArrowUp: [r - 1, s], ArrowDown: [r + 1, s],
    Home: [r, 0], End: [r, S - 1],
  }[key];
  if (!to) return null;
  return [Math.max(0, Math.min(R - 1, to[0])), Math.max(0, Math.min(S - 1, to[1]))];
}

/**
 * Whether a step is a beat and whether it is a bar. The field carries it, never ink.
 * why: lessons/kit-step-grid.md#marks-at
 */
export function marksAt(s, beat = 4, bar = 16) {
  const i = Math.max(0, Math.floor(Number(s) || 0));
  return {
    beat: beat > 0 && i % beat === 0,
    bar: bar > 0 && i % bar === 0,
  };
}

// Two rules a step. Parked lifts with filter: brightness() so a bar column stays a bar,
// and breathes shallower and slower; playing replaces. One sheet for every grid, grown to the widest.
// why: lessons/kit-step-grid.md#head-rules
const SHEET_ID = 'pos-pg-steps';
let widest = 0;

function ensureSteps(steps) {
  const n = Math.max(0, Math.floor(steps));
  if (n <= widest) return;
  let sheet = document.getElementById(SHEET_ID);
  if (!sheet) {
    sheet = el('style');
    sheet.id = SHEET_ID;
    document.head.append(sheet);
  }
  const out = [];
  for (let i = widest; i < n; i++) {
    const at = `.pos-pg-pad:nth-child(${i + 1})`;
    out.push(`.pos-pg-rows[data-now="${i}"] ${at}{filter:brightness(1.45);`
      + 'animation:pg-breathe 2.2s ease-in-out infinite}');
    /**
     * The running head lifts the pad with an inset box-shadow so on, mute and bar still show
     * through, never `background:var(--pg-now)`, which would replace them (step-grid-test reads this).
     * A box-shadow because it has to transition smoothly.
     * why: lessons/kit-step-grid.md#running-head
     */
    out.push(`.pos-pg-rows[data-live][data-now="${i}"] ${at}{`
      + 'filter:brightness(1.12);'
      + 'box-shadow:inset 0 0 0 999px color-mix(in oklab, var(--pg-now) 58%, transparent);'
      + `transition:box-shadow ${RISE_MS}ms ease-out,filter ${RISE_MS}ms ease-out;`
      + 'animation:pg-breathe 1.4s ease-in-out infinite}');
  }
  sheet.textContent += (sheet.textContent ? '\n' : '') + out.join('\n');
  widest = n;
}

/**
 * @param {object} o
 * @param {HTMLElement} [o.fixed]  where the label column goes; omit it for no column, and then
 *   each pad's hover and accessible name carry `label(r)`
 * @param {HTMLElement} o.strip    the scroller for ruler and rows; pad size is measured from it
 * @param {number} o.rows
 * @param {number} o.steps
 * @param {(r:number)=>string} [o.label]   the text in the label column
 * @param {(r:number)=>string} [o.title]   the hover on one label
 * @param {(r:number)=>void} [o.onLabel]   makes a label pressable; without it a label is a div
 * @param {(r:number)=>boolean} [o.canPress]  whether THIS row's label is pressable
 * @param {string} [o.corner]  the cell above the label column; '' is a plain spacer
 * @param {boolean} [o.readOnly]  pads cannot be pressed and do not look pressable
 * @param {(r:number)=>boolean} [o.silent]  this row makes no sound, so its lit pads stay grey
 * @param {(r:number,s:number)=>string} [o.padTitle]  the hover on one pad; with no column it defaults to `label(r)`
 * @param {(r:number,s:number,on:boolean,why:string)=>void} [o.onToggle]
 * @param {(step:number)=>void} [o.onSeek]  a press on the ruler
 * @param {{bpm:number, whose:string, perBeat?:number}} [o.rate]  adds a `clock`; throws without `whose`
 * @param {(step:number)=>void} [o.onStep]  fired by the clock, never by `at()`
 * @param {number} [o.beat] @param {number} [o.bar]
 * @param {boolean|((s:number,m:object)=>string)} [o.ticks]  number the step axis; true numbers beats
 * @param {number} [o.minCell]
 * @param {string} [o.cls]
 * why: lessons/kit-step-grid.md#create-step-grid
 */
export function createStepGrid({
  fixed = null, strip, rows = 1, steps = 16,
  label = (r) => String(r), title, onLabel = null, canPress = () => true,
  corner = null, readOnly = false, silent = () => false, padTitle = null,
  onToggle = null, onSeek = null,
  rate = null, onStep = null,
  beat = 4, bar = 16, ticks = false, minCell = PAD_MIN, cls = '',
} = {}) {
  if (!strip) throw new Error('step grid: no strip to put the steps in');
  if (rate && !rate.whose) {
    // A grid that plays claims a tempo, and a tempo has an owner.
    // why: lessons/kit-step-grid.md#rate-whose
    throw new Error('step grid: a rate needs a `whose`, because a tempo nobody '
      + 'owns is a number presented as the file\'s');
  }

  let R = Math.max(1, Math.floor(rows));
  const S = Math.max(1, Math.floor(steps));
  ensureSteps(S);

  let on = Array.from({ length: R }, () => new Uint8Array(S));
  let pads = [];        // pads[r][s]
  let labelEls = [];
  let tickEls = [];
  let nowStep = -1;
  let focusR = 0, focusS = 0;
  let lastLit = -1;

  const gridEl = el('div', `pos-pg ${cls}`.trim());
  // Fall published as a custom property (never the transition itself) so the number lives here once.
  // why: lessons/kit-step-grid.md#pg-fall
  gridEl.style.setProperty('--pg-fall', `${FALL_MS}ms`);
  const rulerEl = el('div', 'pos-pg-ruler', '', {
    role: 'slider', tabindex: '0', 'aria-label': 'position',
    'aria-valuemin': '1', 'aria-valuemax': String(S), 'aria-valuenow': '1',
  });
  const rowsEl = el('div', 'pos-pg-rows');
  if (readOnly) {
    // A static grid is a table: role=grid promises a keyboard it does not have.
    // why: lessons/kit-step-grid.md#readonly-table
    rowsEl.setAttribute('role', 'table');
    rowsEl.setAttribute('aria-readonly', 'true');
  }
  gridEl.append(rulerEl, rowsEl);
  strip.append(gridEl);
  if (fixed) fixed.classList.add('pos-pg-labs');

  /**
   * What a tick says: nothing unless asked. `true` numbers the beats, not all 64 steps, which
   * would not fit a 26 px cell. A caller's own function owns its own budget.
   * why: lessons/kit-step-grid.md#tick-text
   */
  function tickText(s, m) {
    if (!ticks) return '';
    if (typeof ticks === 'function') return String(ticks(s, m) ?? '');
    return m.beat && beat > 0 ? String(Math.floor(s / beat) + 1) : '';
  }

  /* ── drawing ─────────────────────────────────────────────────────────── */

  function draw() {
    if (fixed) fixed.textContent = '';
    rowsEl.textContent = '';
    rulerEl.textContent = '';
    pads = []; labelEls = []; tickEls = [];
    focusR = Math.min(focusR, R - 1);
    focusS = Math.min(focusS, S - 1);

    if (fixed) {
      // The corner is reserved even when empty, or labels and pad rows never line up.
      // why: lessons/kit-step-grid.md#corner
      const c = el('div', 'pos-pg-corner', corner || '');
      if (corner) c.classList.add('pos-pg-corner-said');
      fixed.append(c);
    }

    for (let s = 0; s < S; s++) {
      const m = marksAt(s, beat, bar);
      const t = el('div', 'pos-pg-tick', tickText(s, m));
      if (m.beat) t.dataset.beat = '1';
      if (m.bar) t.dataset.bar = '1';
      t.dataset.step = String(s);
      tickEls.push(t);
      rulerEl.append(t);
    }

    for (let r = 0; r < R; r++) {
      if (fixed) {
        const pressable = !!onLabel && canPress(r);
        const nm = el(pressable ? 'button' : 'div', 'pos-pg-lab', label(r));
        if (pressable) { nm.type = 'button'; nm.dataset.row = String(r); }
        const tip = title ? title(r) : '';
        if (tip) nm.title = tip;
        labelEls.push(nm);
        fixed.append(nm);
      }

      const rowEl = el('div', 'pos-pg-row');
      if (readOnly) rowEl.setAttribute('role', 'row');
      const mute = !!silent(r);
      const line = [];
      for (let s = 0; s < S; s++) {
        const lit = !!on[r][s];
        const c = readOnly
          ? el('div', 'pos-pg-pad', '', fixed ? { role: 'cell' } : { role: 'cell', 'aria-label': `${label(r)}, step ${s + 1}` })
          : el('button', 'pos-pg-pad', '', {
            type: 'button',
            'aria-label': `${label(r)}, step ${s + 1}`,
            'aria-pressed': lit ? 'true' : 'false',
          });
        const m = marksAt(s, beat, bar);
        if (m.beat) c.dataset.beat = '1';
        if (m.bar) c.dataset.bar = '1';
        c.dataset.row = String(r); c.dataset.step = String(s);
        if (lit) c.dataset.on = '1';
        if (lit && mute) c.dataset.mute = '1';
        // With no label column the pad is where a row says its name.
        // why: lessons/kit-step-grid.md#no-column
        const tip = padTitle ? padTitle(r, s) : (fixed ? '' : label(r));
        if (tip) c.title = tip;
        if (!readOnly) c.tabIndex = (r === focusR && s === focusS) ? 0 : -1;
        line.push(c);
        rowEl.append(c);
      }
      pads.push(line);
      rowsEl.append(rowEl);
    }

    nowStep = -1;
    size();
  }

  /* ── the measured pad ────────────────────────────────────────────────── */

  function size() {
    // Room is the content box, not clientWidth: a panel strip's 16 px padding cut the sixteenth pad.
    // why: lessons/kit-step-grid.md#size-content-box
    const cs = getComputedStyle(strip);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const box = Math.max(0, (strip.clientWidth || 0) - pad);
    if (!box) return false;
    const w = cellSize(box, S, PAD_GAP, minCell);
    // A custom property, never a written width, so a stylesheet can still take it back.
    // why: lessons/kit-step-grid.md#pg-cell
    gridEl.style.setProperty('--pg-cell', `${w}px`);
    if (fixed) fixed.style.setProperty('--pg-cell', `${w}px`);
    return true;
  }

  // ResizeObserver, not `resize`: the strip also changes when something above it grows.
  // why: lessons/kit-step-grid.md#resize-observer
  const ro = new ResizeObserver(() => size());
  ro.observe(strip);

  /* ── the head ────────────────────────────────────────────────────────── */

  function at(step) {
    const s = Math.max(0, Math.min(S - 1, Math.floor(Number(step) || 0)));
    if (s === nowStep) return s;
    if (tickEls[nowStep]) delete tickEls[nowStep].dataset.now;
    nowStep = s;
    if (tickEls[s]) tickEls[s].dataset.now = '1';
    rulerEl.setAttribute('aria-valuenow', String(s + 1));
    rowsEl.dataset.now = String(s);
    return s;
  }

  function live(yes) {
    // Deleted, never set empty: `[data-live]` matches on presence.
    // why: lessons/kit-step-grid.md#live-delete
    if (yes) rowsEl.dataset.live = '1'; else delete rowsEl.dataset.live;
  }

  /* ── switching a pad ─────────────────────────────────────────────────── */

  function set(r, s, v, why = 'page') {
    if (!on[r] || s < 0 || s >= S) return false;
    const want = v ? 1 : 0;
    on[r][s] = want;
    const c = pads[r] && pads[r][s];
    if (c) {
      if (want) c.dataset.on = '1'; else delete c.dataset.on;
      if (want && silent(r)) c.dataset.mute = '1'; else delete c.dataset.mute;
      if (!readOnly) c.setAttribute('aria-pressed', want ? 'true' : 'false');
    }
    if (why !== 'quiet') onToggle?.(r, s, !!want, why);
    return true;
  }

  const count = () => on.reduce((n, row) => n + row.reduce((m, v) => m + v, 0), 0);

  // Hold and draw. The first pad decides on or off for the whole stroke. Listeners sit on the
  // container with no setPointerCapture (it would retarget pointerover), and no click handler.
  // why: lessons/kit-step-grid.md#stroke
  let stroke = null;

  function paint(c, first) {
    const r = +c.dataset.row, s = +c.dataset.step;
    if (Number.isNaN(r) || Number.isNaN(s)) return;
    if (on[r][s] === (stroke ? 1 : 0)) return;      // already what the stroke wants
    // `draw` is the word a reader meets; `stroke` is this file's private one.
    // why: lessons/kit-step-grid.md#draw-word
    set(r, s, stroke, first ? 'press' : 'draw');
    if (first) rove(r, s, false);
  }

  if (!readOnly) {
    rowsEl.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.pos-pg-pad');
      if (!c || e.button !== 0) return;
      e.preventDefault();
      stroke = !on[+c.dataset.row][+c.dataset.step];
      paint(c, true);
    });
    rowsEl.addEventListener('pointerover', (e) => {
      if (stroke === null) return;
      const c = e.target.closest('.pos-pg-pad');
      if (c) paint(c, false);
    });
  }
  // On the window: a stroke that ends off the grid still has to end.
  // why: lessons/kit-step-grid.md#end-stroke
  const endStroke = () => { stroke = null; };
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, endStroke);

  if (fixed && onLabel) {
    fixed.addEventListener('click', (e) => {
      const b = e.target.closest('button.pos-pg-lab');
      if (!b) return;
      onLabel(+b.dataset.row);
    });
  }

  /**
   * The ruler seeks on a press, not a drag, so a finger can still scroll the steps.
   * why: lessons/kit-step-grid.md#ruler-seek
   */
  if (onSeek) {
    rulerEl.addEventListener('click', (e) => {
      const t = e.target.closest('.pos-pg-tick');
      if (t) onSeek(+t.dataset.step);
    });
  }

  // Roving tab stop, set while the pads are made (1,024 tab stops otherwise). Arrows must not
  // reach transport-keys.mjs's window keys, which seek.
  // why: lessons/kit-step-grid.md#keyboard
  function rove(r, s, focus = true) {
    const old = pads[focusR] && pads[focusR][focusS];
    if (old) old.tabIndex = -1;
    focusR = Math.max(0, Math.min(R - 1, r));
    focusS = Math.max(0, Math.min(S - 1, s));
    const next = pads[focusR] && pads[focusR][focusS];
    if (next) { next.tabIndex = 0; if (focus) next.focus(); }
    return next;
  }

  if (!readOnly) {
    rowsEl.addEventListener('keydown', (e) => {
      const c = e.target.closest('.pos-pg-pad');
      if (!c) return;
      const r = +c.dataset.row, s = +c.dataset.step;
      /**
       * Space plays (prevented, left to bubble to the transport bar); Enter toggles a pad and is
       * prevented too, or the button's click toggles it twice.
       * why: lessons/kit-step-grid.md#space-enter
       */
      if (e.key === ' ') { e.preventDefault(); return; }
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        set(r, s, !on[r][s], 'key');
        return;
      }
      const to = rovingNext(e.key, r, s, R, S);
      if (!to) return;
      e.preventDefault();
      e.stopPropagation();
      rove(to[0], to[1]);
    });
  }

  /* ── the clock, which is the page's ──────────────────────────────────── */

  let clock = null;
  if (rate) {
    let bpm = Math.max(1, Number(rate.bpm) || 120);
    const perBeat = Math.max(1, Math.floor(rate.perBeat ?? 4));
    let raf = 0, t0 = 0, running = false, laps = 0;
    const listeners = onStep ? [onStep] : [];

    /**
     * The step is a function of the clock, never an accumulation. A hidden tab stops frames, so
     * nothing that must happen on every step belongs here.
     * why: lessons/kit-step-grid.md#clock-frame
     */
    const frame = () => {
      raf = 0;
      if (!running) return;
      const elapsed = performance.now() - t0;
      const ms = stepMsFor(bpm, perBeat);
      const total = Math.floor(elapsed / ms);
      laps = Math.floor(total / S);
      const s = total % S;
      if (s !== nowStep) {
        at(s);
        for (const fn of listeners) fn(s, { laps });
      }
      raf = requestAnimationFrame(frame);
    };

    clock = {
      /** The words the caller gave for whose tempo this is. */
      whose: String(rate.whose),
      bpm: () => bpm,
      setBpm(n) { bpm = Math.max(1, Number(n) || bpm); return bpm; },
      stepMs: () => stepMsFor(bpm, perBeat),
      perBeat,
      playing: () => running,
      laps: () => laps,
      play() {
        if (running) return;
        running = true;
        // Resumes where the head is, or the ruler's seek would be useless.
        // why: lessons/kit-step-grid.md#clock-resume
        t0 = performance.now() - Math.max(0, nowStep) * stepMsFor(bpm, perBeat);
        live(true);
        if (!raf) raf = requestAnimationFrame(frame);
      },
      /**
       * Stop, not pause: it goes back to the first column.
       * why: lessons/kit-step-grid.md#clock-stop
       */
      stop() {
        running = false;
        cancelAnimationFrame(raf); raf = 0;
        live(false);
        at(0);
      },
      toggle() { if (running) this.stop(); else this.play(); },
      onStep(fn) { listeners.push(fn); return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      }; },
    };
  }

  draw();
  at(0);

  return {
    el: gridEl,
    fixed,
    ruler: rulerEl,
    rowsEl,
    get pads() { return pads; },
    get labels() { return labelEls; },
    get ticks() { return tickEls; },
    steps: S,
    get rows() { return R; },
    readOnly,
    clock,

    get: (r, s) => !!(on[r] && on[r][s]),
    set,
    count,
    /** Every row as a plain array, for a page that wants to save one. */
    pattern: () => on.map((row) => [...row]),

    at,
    step: () => nowStep,
    live,
    size,
    focus: (r, s) => rove(r, s),
    focused: () => [focusR, focusS],

    /**
     * Flash one label for a row that just did something: a colour, never a box (a box says chosen).
     * why: lessons/kit-step-grid.md#lit
     */
    lit(r) {
      if (labelEls[lastLit]) delete labelEls[lastLit].dataset.lit;
      lastLit = r;
      if (labelEls[r]) labelEls[r].dataset.lit = '1';
    },

    /**
     * Change how many rows there are, keeping every pad that still has a row (asserted).
     * why: lessons/kit-step-grid.md#set-rows
     */
    setRows(n) {
      const want = Math.max(1, Math.floor(Number(n) || 1));
      const next = Array.from({ length: want }, (_, r) => {
        const row = new Uint8Array(S);
        if (on[r]) row.set(on[r].subarray(0, S));
        return row;
      });
      on = next; R = want;
      draw();
      at(Math.max(0, nowStep));
      return R;
    },
    /** Rebuild in place, for a caller whose labels or silences have changed. */
    redraw() { const was = nowStep; draw(); at(Math.max(0, was)); },

    destroy() {
      ro.disconnect();
      for (const ev of ['pointerup', 'pointercancel']) removeEventListener(ev, endStroke);
      clock?.stop?.();
    },
  };
}
