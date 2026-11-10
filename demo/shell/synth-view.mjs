// demo/shell/synth-view.mjs: three pictures of one voice (envelope, filter response, waveform).
// Each draws a refusal when the shape cannot honestly be derived; the envelope is proportions.
// THE FILTER CURVE IS A SCHEMATIC and says so on its face (synth-view-test asserts this phrase).
// why: lessons/kit-synth-view.md#header

import { el } from './shell.mjs';

/**
 * How much of an envelope's width the sustain hold takes when any stage has a
 * length. Sustain is a LEVEL rather than a time, so it has no width of its own
 * and needs to be given one or it cannot be seen.
 */
export const HOLD_SHARE = 0.25;

/** The top and the bottom of the filter figure's vertical scale, in decibels.
 *  A drawing choice: wide enough for a resonant peak, deep enough to show a
 *  four pole slope going away. Neither end is a measurement of anything. */
export const DB_TOP = 18;
export const DB_FLOOR = -48;

/** How many octaves the filter figure's full width covers. A drawing choice,
 *  about the range of hearing, and the reason no frequency is printed on it. */
export const OCTAVES = 10;

/** The resonance scale, from flat to a peak worth looking at. */
export const Q_MIN = 0.707;
export const Q_MAX = 10;

/** The shapes this file can derive from their own definitions and nothing else. */
export const WAVE_SHAPES = ['sine', 'triangle', 'saw', 'square', 'pulse'];

/**
 * Exact names only: a substring test would draw a plain ramp for the nine `saw 9:1 PW` blends.
 * why: lessons/kit-synth-view.md#by-name
 */
const BY_NAME = new Map([
  ['sine', 'sine'],
  ['triangle', 'triangle'],
  ['sawtooth', 'saw'],
  ['saw', 'saw'],
  ['square', 'square'],
]);

/**
 * The shape behind a wave's name, or `null` when the name does not name one.
 * `pulse` is never returned: a pulse needs a duty cycle no name carries.
 * @param {string} name
 * @returns {'sine'|'triangle'|'saw'|'square'|null}
 * why: lessons/kit-synth-view.md#shape-for
 */
export function shapeFor(name) {
  return BY_NAME.get(String(name ?? '').trim().toLowerCase()) ?? null;
}

/**
 * One sample of a shape, at a phase from 0 to 1, between -1 and 1. Phase and polarity are
 * drawing conventions; the shape is the claim.
 * @param {string} shape
 * @param {number} phase  0 to 1 over one cycle
 * @param {object} [o]
 * @param {number} [o.duty]  for `pulse` only, the share of the cycle that is high
 * why: lessons/kit-synth-view.md#wave-sample
 */
export function waveSample(shape, phase, { duty = 0.5 } = {}) {
  const p = ((Number(phase) || 0) % 1 + 1) % 1;
  switch (shape) {
    case 'sine': return Math.sin(2 * Math.PI * p);
    case 'triangle': return 4 * Math.abs(((p - 0.25) % 1 + 1) % 1 - 0.5) - 1;
    case 'saw': return 2 * p - 1;
    case 'square': return p < 0.5 ? 1 : -1;
    case 'pulse': return p < Math.max(0, Math.min(1, duty)) ? 1 : -1;
    default: return NaN;
  }
}

/**
 * `count` samples of a shape over `cycles` cycles; two by default, so the picture shows it repeats.
 * @returns {Float64Array|null} `null` for a shape this file cannot derive
 * why: lessons/kit-synth-view.md#wave-points
 */
export function wavePoints(shape, count, { cycles = 2, duty = 0.5 } = {}) {
  if (!WAVE_SHAPES.includes(shape)) return null;
  const n = Math.max(2, Math.floor(Number(count) || 0));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = waveSample(shape, (i / (n - 1)) * cycles, { duty });
  return out;
}

/**
 * An envelope as six points, x 0 to 1 across, y 0 at the bottom to 1 at the top.
 * Widths follow the settings (0 to 127, no published seconds), not time. Sustain is a level and
 * gets `hold` of the width; with every timed stage at zero it takes the whole width.
 * @param {object} o
 * @param {number} [o.delay]    Env 3 on the Circuit has one, Env 1 and 2 do not
 * @param {number} [o.attack]
 * @param {number} [o.decay]
 * @param {number} [o.sustain]  a LEVEL, 0 to `max`
 * @param {number} [o.release]
 * @param {number} [o.max]      the top of every parameter, default 127
 * @param {number} [o.hold]     the sustain's share of the width
 * @returns {{points:Array<{x:number,y:number}>, sustain:number, hold:number,
 *   stages:{delay:number,attack:number,decay:number,hold:number,release:number},
 *   silent:boolean, end:number}}
 * why: lessons/kit-synth-view.md#envelope-path
 */
export function envelopePath({ delay = 0, attack = 0, decay = 0, sustain = 0,
                               release = 0, max = 127, hold = HOLD_SHARE } = {}) {
  const m = Math.max(1e-9, Number(max) || 1);
  const n = (x) => Math.max(0, Math.min(1, (Number(x) || 0) / m));
  const d = n(delay), a = n(attack), dec = n(decay), r = n(release);
  const s = n(sustain);
  const tot = d + a + dec + r;
  const h = tot > 0 ? Math.max(0, Math.min(1, Number(hold))) : 1;
  const timed = 1 - h;
  const w = (x) => (tot > 0 ? (x / tot) * timed : 0);
  const x1 = w(d);
  const x2 = x1 + w(a);
  const x3 = x2 + w(dec);
  const x4 = x3 + h;
  const x5 = x4 + w(r);
  return {
    points: [
      { x: 0, y: 0 }, { x: x1, y: 0 }, { x: x2, y: 1 },
      { x: x3, y: s }, { x: x4, y: s }, { x: x5, y: 0 },
    ],
    sustain: s,
    hold: h,
    stages: { delay: w(d), attack: w(a), decay: w(dec), hold: h, release: w(r) },
    silent: tot === 0,
    end: x5,
  };
}

/**
 * The kind and pole count read from a filter type's name, or `null` when the name does not say.
 * No table here: the names live once in FILTER_TYPES (circuit-patch.mjs), 6 dB/octave is one pole.
 * @param {string} name
 * @returns {{kind:'lp'|'hp'|'bp', poles:number}|null}
 * why: lessons/kit-synth-view.md#filter-shape-for
 */
export function filterShapeFor(name) {
  const s = String(name ?? '').trim().toLowerCase();
  const kind = s.includes('low pass') ? 'lp'
    : s.includes('high pass') ? 'hp'
      : s.includes('band pass') ? 'bp' : null;
  if (!kind) return null;
  const nums = (s.match(/\d+/g) || []).map(Number).filter((x) => x > 0);
  if (!nums.length) return null;
  const perSide = Math.max(...nums);
  if (perSide % 6 !== 0) return null;
  const poles = kind === 'bp' ? (perSide / 6) * 2 : perSide / 6;
  return poles > 0 ? { kind, poles } : null;
}

/** A two pole prototype, as a magnitude. `w` is the ratio to the corner. */
function biquad(kind, w, q) {
  const x = w * w;
  const den = Math.sqrt((1 - x) * (1 - x) + (w / q) * (w / q)) || 1e-12;
  if (kind === 'hp') return x / den;
  if (kind === 'bp') return (w / q) / den;
  return 1 / den;
}

/**
 * The filter figure's curve, 0 at the bottom of the box to 1 at the top. A schematic: corner,
 * slope and resonance direction are right, nothing is a measurement.
 * @param {object} o
 * @param {'lp'|'hp'|'bp'} [o.kind]
 * @param {number} [o.poles]
 * @param {number} [o.freq]        the cutoff PARAMETER, 0 to `max`
 * @param {number} [o.resonance]   0 to `max`
 * @param {number} [o.max]
 * @param {number} [o.points]
 * @param {number} [o.octaves]     how wide the picture is, a drawing choice
 * @returns {{y:Float64Array, db:Float64Array, cornerAt:number, peakAt:number,
 *   peakDb:number, zeroY:number}}
 * why: lessons/kit-synth-view.md#filter-curve
 */
export function filterCurve({ kind = 'lp', poles = 2, freq = 64, resonance = 0,
                              max = 127, points = 160, octaves = OCTAVES } = {}) {
  const n = Math.max(8, Math.floor(Number(points) || 0));
  const m = Math.max(1e-9, Number(max) || 1);
  const fc = Math.max(0, Math.min(1, (Number(freq) || 0) / m));
  const res = Math.max(0, Math.min(1, (Number(resonance) || 0) / m));
  const q = Q_MIN + res * (Q_MAX - Q_MIN);
  const stages = Math.max(1, Math.round(poles / 2));
  const y = new Float64Array(n);
  const db = new Float64Array(n);
  let peakAt = 0, peakDb = -Infinity;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const w = Math.pow(2, (u - fc) * octaves);
    // One resonant stage and the rest flat: two resonant biquads would square the peak.
    // why: lessons/kit-synth-view.md#one-resonant-stage
    let mag = biquad(kind, w, q);
    for (let s = 1; s < stages; s++) mag *= biquad(kind, w, Q_MIN);
    const v = 20 * Math.log10(Math.max(1e-9, mag));
    db[i] = v;
    if (v > peakDb) { peakDb = v; peakAt = u; }
    y[i] = Math.max(0, Math.min(1, (v - DB_FLOOR) / (DB_TOP - DB_FLOOR)));
  }
  return {
    y,
    db,
    cornerAt: fc,
    peakAt,
    peakDb,
    zeroY: (0 - DB_FLOOR) / (DB_TOP - DB_FLOOR),
  };
}

/* ── the frame the three figures share ─────────────────────────────────── */

const CSS_ID = 'pos-sv-css';

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const s = el('style', '', `
.pos-sv { display: block; background: var(--card); border: var(--edge);
          border-radius: var(--r); overflow: hidden; }
.pos-sv[hidden] { display: none; }
.pos-sv-c { display: block; width: 100%; height: var(--sv-h, 96px); }
`);
  s.id = CSS_ID;
  document.head.prepend(s);
}

/**
 * The bordered box, canvas, device pixel ratio and resize observation, once. The border is on
 * the wrapper: on a border-box canvas it would make the content 2 px narrower than the backing store.
 * why: lessons/kit-synth-view.md#figure
 */
function figure({ host, cls, height, label, ground = '--card' }) {
  ensureCss();
  const wrap = el('div', `pos-sv ${cls}`);
  const canvas = el('canvas', 'pos-sv-c', '', { role: 'img', 'aria-label': label || '' });
  wrap.append(canvas);
  // A custom property, never `canvas.style.height`, which nothing could override.
  // why: lessons/kit-synth-view.md#custom-property
  if (height) wrap.style.setProperty('--sv-h', `${Math.round(height)}px`);
  host?.append(wrap);

  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fb) => (css.getPropertyValue(n) || '').trim() || fb;
  /**
   * Three greys and one highlight: `--hi` marks the one place a reader is meant to look.
   * why: lessons/kit-synth-view.md#greys
   */
  const C = {
    /**
     * A caller may pass a lighter ground token; safe because `ink()` reads the field back out of the canvas.
     * why: lessons/kit-synth-view.md#ground
     */
    field: tok(ground, '#11151d'),
    grid: tok('--line', '#1f2937'),
    ink: tok('--dim', '#8b93a1'),
    faint: tok('--dim2', '#6a7280'),
    hi: tok('--hi', '#ffd400'),
    back: tok('--bg', '#0b0e14'),
  };
  const mono = tok('--mono', 'ui-monospace, Menlo, monospace');

  let W = 0, H = 0, dpr = 1, paints = 0;
  let draw = () => {};
  /**
   * The field colour read back out of the canvas after the fill, never parsed from the token:
   * the parsed version counted every pixel as ink (three envelopes all read 10032).
   * why: lessons/kit-synth-view.md#field
   */
  let field = null;

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(0, Math.round(wrap.clientWidth));
    const h = Math.max(0, Math.round(canvas.clientHeight));
    if (w === W && h === H && canvas.width) return false;
    W = w; H = h;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    return true;
  }

  function paint() {
    if (!W || !H) return;
    paints++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = C.field;
    ctx.fillRect(0, 0, W, H);
    if (!field) {
      try { field = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); }
      catch { field = null; }
    }
    draw();
  }

  /** One short line of text, cut to fit rather than allowed to run off. */
  function say(text, x, yy, { colour = C.faint, px = 9, align = 'left', room = W } = {}) {
    ctx.font = `${px}px ${mono}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colour;
    let s = String(text ?? '');
    if (ctx.measureText(s).width > room) {
      while (s.length > 1 && ctx.measureText(`${s}…`).width > room) s = s.slice(0, -1);
      s = `${s}…`;
    }
    ctx.fillText(s, x, yy);
    ctx.textAlign = 'left';
  }

  const ro = new ResizeObserver(() => { if (size()) paint(); });
  ro.observe(wrap);

  return {
    wrap,
    canvas,
    ctx,
    C,
    mono,
    /**
     * A colour from a token name or a literal; it exists for the second trace.
     * why: lessons/kit-synth-view.md#tok
     */
    tok,
    say,
    get W() { return W; },
    get H() { return H; },
    get paints() { return paints; },
    setDraw(fn) { draw = fn; },
    resize: size,
    paint,
    /**
     * How many sampled pixels are not the field colour. Compare it with `area()`: a count alone
     * cannot tell a drawing from a filled box.
     * why: lessons/kit-synth-view.md#ink
     */
    ink(step = 2) {
      if (!canvas.width || !canvas.height || !field) return 0;
      let data;
      try { data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; }
      catch { return -1; }
      let n = 0;
      const stride = Math.max(1, Math.floor(step)) * 4;
      for (let i = 0; i < data.length; i += stride) {
        if (data[i + 3] === 0) continue;
        if (Math.abs(data[i] - field[0]) > 6 || Math.abs(data[i + 1] - field[1]) > 6
          || Math.abs(data[i + 2] - field[2]) > 6) n++;
      }
      return n;
    },
    /** How many pixels `ink()` looked at, which is the denominator it needs. */
    area(step = 2) {
      if (!canvas.width || !canvas.height) return 0;
      return Math.ceil((canvas.width * canvas.height) / Math.max(1, Math.floor(step)));
    },
    destroy() { ro.disconnect(); },
  };
}

/* ── the envelope ──────────────────────────────────────────────────────── */

/**
 * @param {object} o
 * @param {HTMLElement} [o.host]
 * @param {string} [o.label]    drawn into the picture, bottom left
 * @param {number} [o.height]
 * @param {number} [o.max]
 * @param {string} [o.unit]     `''` for proportions, or a real unit (then no `proportions` mark)
 * @param {number} [o.delay] @param {number} [o.attack] @param {number} [o.decay]
 * @param {number} [o.sustain] @param {number} [o.release]
 * @returns {{el:HTMLElement, canvas:HTMLCanvasElement, set:Function,
 *   get:()=>object, path:()=>object, ink:Function, paints:number, destroy:Function}}
 * why: lessons/kit-synth-view.md#create-envelope-view
 */
export function createEnvelopeView({ host, label = '', height = 96, max = 127,
                                     unit = '', delay = 0, attack = 0, decay = 0,
                                     sustain = 0, release = 0 } = {}) {
  const f = figure({ host, cls: 'pos-sv-env', height, label: label || 'envelope' });
  let v = { delay, attack, decay, sustain, release };
  let path = envelopePath({ ...v, max });

  const PAD = 10;
  // The foot sits as far off the bottom as the picture sits off the sides, and the plot floor
  // gives up the same 6 px or the curve lands on the label.
  // why: lessons/kit-synth-view.md#foot-room
  const FOOT_ROOM = 16;

  f.setDraw(() => {
    const { W, H, ctx, C } = f;
    const x0 = PAD, x1 = W - PAD;
    const yTop = PAD, yBot = H - PAD - FOOT_ROOM;
    const px = (x) => x0 + x * (x1 - x0);
    const py = (y) => yBot - y * (yBot - yTop);

    // The floor and the sustain level, which are the two lines a reader
    // measures against. The sustain gets the highlight because it is the one
    // value in an envelope that is a level rather than a length.
    ctx.fillStyle = C.grid;
    ctx.fillRect(x0, yBot - 0.5, x1 - x0, 1);
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = C.hi;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(x0, py(path.sustain) + 0.5);
    ctx.lineTo(x1, py(path.sustain) + 0.5);
    ctx.stroke();
    ctx.restore();

    // The stage boundaries, so the four lengths can be read off the picture
    // rather than only seen.
    ctx.save();
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    for (const p of path.points.slice(1, -1)) {
      ctx.moveTo(Math.round(px(p.x)) + 0.5, yTop);
      ctx.lineTo(Math.round(px(p.x)) + 0.5, yBot);
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    path.points.forEach((p, i) => (i ? ctx.lineTo(px(p.x), py(p.y)) : ctx.moveTo(px(p.x), py(p.y))));
    ctx.stroke();

    const foot = H - 4;
    if (label) f.say(label, PAD, foot, { room: W / 2 });
    // Painted into the picture: stage widths follow 0 to 127 settings, so this axis is not time.
    // why: lessons/kit-synth-view.md#proportions-mark
    f.say(unit ? `stages in ${unit}` : 'proportions, not seconds',
      W - PAD, foot, { align: 'right', room: W / 2 });
  });

  function relabel() {
    f.canvas.setAttribute('aria-label',
      `${label || 'envelope'}, attack ${v.attack}, decay ${v.decay}, `
      + `sustain ${v.sustain}, release ${v.release} of ${max}`);
  }

  f.resize();
  relabel();
  f.paint();

  return {
    el: f.wrap,
    canvas: f.canvas,
    /** Change any of the five and redraw. Omitted values are left alone. */
    set(next = {}) {
      v = { ...v, ...next };
      path = envelopePath({ ...v, max });
      relabel();
      f.resize();
      f.paint();
      return { ...v };
    },
    get: () => ({ ...v }),
    path: () => path,
    /**
     * Measure and paint now: a resize observation is a frame away, and a synchronous check
     * (the /kit/ measuring window) would otherwise read `ink()` 0 off a zero-width paint.
     * why: lessons/kit-synth-view.md#redraw
     */
    redraw() { f.resize(); f.paint(); },
    ink: (step) => f.ink(step),
    area: (step) => f.area(step),
    get paints() { return f.paints; },
    destroy: () => f.destroy(),
  };
}

/* ── the filter ────────────────────────────────────────────────────────── */

/**
 * @param {object} o
 * @param {string} [o.type]  the type's own NAME, read by `filterShapeFor`; unreadable is refused in words
 * @param {number} [o.freq]       the cutoff PARAMETER, 0 to `max`
 * @param {number} [o.resonance]  0 to `max`
 * @param {number} [o.max]
 * why: lessons/kit-synth-view.md#create-filter-view
 */
export function createFilterView({ host, label = '', height = 96, max = 127, ground = '--card2',
                                   type = 'low pass 12dB', freq = 64,
                                   resonance = 0 } = {}) {
  const f = figure({ host, cls: 'pos-sv-filt', height, label: label || 'filter', ground });
  let v = { type, freq, resonance };
  let shape = filterShapeFor(v.type);
  let curve = shape ? filterCurve({ ...shape, freq: v.freq, resonance: v.resonance, max }) : null;

  const PAD = 10;

  f.setDraw(() => {
    const { W, H, ctx, C } = f;
    const x0 = PAD, x1 = W - PAD;
    const yTop = PAD, yBot = H - PAD - 10;
    const foot = H - PAD;   // the same inset as the sides. See FOOT_ROOM.

    if (!curve) {
      // The refusal is the picture: an unreadable name is never drawn as the default low pass.
      // Name above reason at the foot, 13 px apart against an 11 px name.
      // why: lessons/kit-synth-view.md#filter-refusal
      f.say(v.type || 'no type', PAD, foot - 13, { colour: C.ink, px: 11, room: W - PAD * 2 });
      f.say('this name does not say which filter it is', PAD, foot,
        { room: W - PAD * 2 });
      return;
    }

    // 0 dB, which is the one line worth having: it says where the passband sits
    // and therefore how far the resonance has lifted the corner above it.
    const yz = yBot - curve.zeroY * (yBot - yTop);
    ctx.fillStyle = C.grid;
    ctx.fillRect(x0, Math.round(yz) + 0.5, x1 - x0, 1);

    // The corner, which is the one number a reader is working with.
    const cx = x0 + curve.cornerAt * (x1 - x0);
    ctx.save();
    // Dotted: a zero length dash with a round cap is a real dot. The envelope's sustain keeps dashes.
    // why: lessons/kit-synth-view.md#dotted
    ctx.lineCap = 'round';
    ctx.setLineDash([0, 3]);
    ctx.strokeStyle = C.hi;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(Math.round(cx) + 0.5, yTop);
    ctx.lineTo(Math.round(cx) + 0.5, yBot);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < curve.y.length; i++) {
      const x = x0 + (i / (curve.y.length - 1)) * (x1 - x0);
      const y = yBot - curve.y[i] * (yBot - yTop);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();

    if (label) f.say(label, PAD, foot, { room: W / 2 });
    // The word that makes this honest, in the picture: nothing here measured the filter.
    // why: lessons/kit-synth-view.md#schematic
    f.say('schematic', W - PAD, foot, { align: 'right', room: W / 2 });
  });

  function relabel() {
    f.canvas.setAttribute('aria-label',
      `${label || 'filter'}, ${v.type}, cutoff ${v.freq} of ${max}, `
      + `resonance ${v.resonance} of ${max}, drawn as a schematic`);
  }

  f.resize();
  relabel();
  f.paint();

  return {
    el: f.wrap,
    canvas: f.canvas,
    set(next = {}) {
      v = { ...v, ...next };
      shape = filterShapeFor(v.type);
      curve = shape ? filterCurve({ ...shape, freq: v.freq, resonance: v.resonance, max }) : null;
      relabel();
      f.resize();
      f.paint();
      return { ...v };
    },
    get: () => ({ ...v }),
    /** `null` when the type's name does not say which filter it is. */
    shape: () => shape,
    curve: () => curve,
    /**
     * Measure and paint now: see the envelope's redraw.
     * why: lessons/kit-synth-view.md#filter-redraw
     */
    redraw() { f.resize(); f.paint(); },
    ink: (step) => f.ink(step),
    area: (step) => f.area(step),
    get paints() { return f.paints; },
    destroy: () => f.destroy(),
  };
}

/* ── the waveform ──────────────────────────────────────────────────────── */

/** What the refusal says when a caller gives no reason of its own. */
export const NO_SHAPE = 'no shape is published for this one';

/**
 * The samples a trace draws: what the caller measured (`points`) outranks a derived `shape`.
 * Nothing here takes a tap, a context or a frame loop; the page calls `set({ points })`.
 * why: lessons/kit-synth-view.md#trace-of
 */
export function traceOf(t = {}, fallback = '--dim') {
  const shape = t.shape ?? shapeFor(t.name);
  const cycles = t.cycles ?? 2;
  const duty = t.duty ?? 0.5;
  const pts = t.points?.length
    ? Float64Array.from(t.points)
    : wavePoints(shape, 512, { cycles, duty });
  return { ...t, shape, cycles, duty, pts, colour: t.colour || fallback };
}

/* ── the spectrogram ───────────────────────────────────────────────────── */

// The radio's spectre (v2in web/wave.mjs): a 1024-point FFT of the analyser's time-domain samples,
// one column a frame, rows log-spaced 60 Hz to 12 kHz, ink alpha over 60 dB under the recent loudest bin.
// why: lessons/kit-synth-view.md#spectrogram
const SG_N = 1024, SG_LO = 60, SG_HI = 12000, SG_RANGE = 60, SG_FALL = 3, SG_CEIL = -20;
const SG_HANN = Float32Array.from({ length: SG_N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / SG_N));

/** In-place radix-2 FFT, exported for the node test. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const p = i + j, q = p + len / 2, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** One spectrogram column into `s` ({ canvas, re, im, buf, top, at }), scrolled in from the right. */
function spectroColumn(s, analyser, w, h, rgb) {
  const cv = s.canvas;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; s.col = null; }
  if (!w || !h) return;
  const g = cv.getContext('2d');
  const step = Math.max(1, Math.round(Math.min(2, window.devicePixelRatio || 1)));
  s.col ??= g.createImageData(step, h);
  if (!s.buf || s.buf.length !== analyser.fftSize) s.buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(s.buf);
  const now = performance.now(), dt = Math.min(0.1, s.at ? (now - s.at) / 1000 : 1 / 60);
  s.at = now;
  s.re ??= new Float32Array(SG_N); s.im ??= new Float32Array(SG_N);
  const off = Math.max(0, s.buf.length - SG_N);
  for (let i = 0; i < SG_N; i++) { s.re[i] = (s.buf[off + i] || 0) * SG_HANN[i]; s.im[i] = 0; }
  fft(s.re, s.im);
  const sr = analyser.context.sampleRate, hi = Math.min(SG_HI, sr / 2), dbs = new Float32Array(h);
  let top = -Infinity;
  for (let y = 0; y < h; y++) {
    const f = SG_LO * (hi / SG_LO) ** (1 - y / h), k = Math.min(SG_N / 2 - 1, Math.max(1, Math.round(f / sr * SG_N)));
    dbs[y] = 20 * Math.log10(Math.hypot(s.re[k], s.im[k]) / (SG_N / 4) + 1e-9);
    if (dbs[y] > top) top = dbs[y];
  }
  s.top = Math.max(top, Math.min(SG_CEIL, (s.top ?? top) - (SG_RANGE / SG_FALL) * dt));
  const p = s.col.data;
  for (let y = 0; y < h; y++) {
    const a = Math.round(255 * Math.max(0, Math.min(1, (dbs[y] - (s.top - SG_RANGE)) / SG_RANGE)) ** 1.5);
    for (let x = 0; x < step; x++) { const o = (y * step + x) * 4; p[o] = rgb[0]; p[o + 1] = rgb[1]; p[o + 2] = rgb[2]; p[o + 3] = a; }
  }
  g.globalCompositeOperation = 'copy'; g.drawImage(cv, -step, 0); g.globalCompositeOperation = 'source-over';
  g.putImageData(s.col, w - step, 0);
}

const VIEW_KEY = () => `pos-scope-view:${location.pathname}`;

/**
 * createWaveShape takes { name, shape, duty, reason, points, colour, over }; `over` is ONE second
 * trace in its own colour (see the lesson).
 *
 * Triggered scope: where a hit's onset sits in an analyser buffer whose last sample is at `end`
 * (context clock): `(end - onset) * rate` back, then the first sample within `look` s reaching
 * `gate` of the peak, so every trace starts on the same edge. Graded in synth-view-test.mjs.
 * @returns {number} an index into `buf`, or -1 when the window does not fit
 * why: lessons/kit-synth-view.md#onset-index
 */
export function onsetIndex(buf, { rate, end, onset, windowS, look = 0.01, gate = 0.1 }) {
  const n = buf.length;
  const want = Math.round(n - (end - onset) * rate);
  const len = Math.round(windowS * rate);
  if (!(want >= 0) || want + len > n) return -1;
  let peak = 0;
  for (let i = want; i < want + len; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (!(peak > 0)) return want;
  const lim = Math.min(n - len, want + Math.round(look * rate));
  for (let i = Math.max(0, want - Math.round(look * rate)); i <= lim; i++) if (Math.abs(buf[i]) >= gate * peak) return i;
  return want;
}

/**
 * `len` samples from `from`, down to `points` values: in each bucket the
 * sample with the largest magnitude, sign kept, so a 24,000 sample hat is still
 * its envelope rather than an aliased handful of noise samples.
 */
export function captureTrace(buf, from, len, points = 512) {
  const out = new Float32Array(points);
  for (let p = 0; p < points; p++) {
    const a = from + Math.floor((p * len) / points), b = Math.max(a + 1, from + Math.floor(((p + 1) * len) / points));
    let best = 0;
    for (let i = a; i < b && i < buf.length; i++) if (Math.abs(buf[i]) > Math.abs(best)) best = buf[i];
    out[p] = best;
  }
  return out;
}

export function createWaveShape({ host, label = '', height = 96, name = '', ground = '--card2',
                                  shape, duty = 0.5, reason = '', cycles = 2,
                                  points, colour = '--dim', over = null, axes = null, trail: trailOpt = 0,
                                  mode = 'free', window: windowMs = 250, fade = 1, source: sourceOpt = null, full = 0.5 } = {}) {
  // Triggered: `trigger(atMs)` takes the window from that hit's onset off `source` (an AnalyserNode)
  // and holds it. Free mode is the default.
  // why: lessons/kit-synth-view.md#triggered-mode
  const TRIG = mode === 'triggered';
  let source = sourceOpt;
  const trail = TRIG ? Math.max(0, fade) : trailOpt;
  if (TRIG && points === undefined) points = new Float32Array(512);   // flat until the first hit
  // The filter's lighter ground; safe because `ink()` reads the field back. The envelope stays `--card`.
  // why: lessons/kit-synth-view.md#wave-ground
  const f = figure({ host, cls: 'pos-sv-wave', height, label: label || 'waveform', ground });
  let v = { name, shape: shape ?? shapeFor(name), duty, reason, cycles, points, colour, over, axes };
  let triggered = 0, held = 0, missed = 0, gen = 0;
  let a = traceOf(v, colour);
  let b = v.over ? traceOf(v.over, '--hi') : null;
  let pts = a.pts;
  /* The windows behind the current one, oldest first. Empty unless a caller
     asked for a `trail`, so a figure that never moves carries no cost. */
  const past = [];

  const PAD = 8;

  /**
   * Wave or spectrum, toggled by a press once a free-running scope has an analyser (`listen()`).
   * The choice is kept per page; the default is the wave.
   */
  let view = 'wave';
  try { if (!TRIG && localStorage.getItem(VIEW_KEY()) === 'spectrum') view = 'spectrum'; } catch {}
  const sg = { canvas: document.createElement('canvas') };
  let sgRgb = null;
  const toggles = () => !TRIG && !!source;
  const spectrumOn = () => toggles() && view === 'spectrum';
  function arm() {
    if (!toggles() || f.wrap.dataset.views) return;
    f.wrap.dataset.views = '1';
    f.wrap.setAttribute('role', 'button');
    f.wrap.tabIndex = 0;
    f.wrap.style.cursor = 'pointer';
    f.wrap.addEventListener('click', flip);
    f.wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    relabel();
  }
  function flip() {
    view = view === 'wave' ? 'spectrum' : 'wave';
    try { localStorage.setItem(VIEW_KEY(), view); } catch {}
    relabel();
    f.paint();
  }

  f.setDraw(() => {
    const { W, H, ctx, C } = f;
    const foot = H - 4;
    const yTop = PAD, yBot = H - PAD - 10;
    const mid = (yTop + yBot) / 2;

    if (toggles()) f.say(view, W - PAD, foot, { align: 'right', px: 10, colour: C.faint, room: W / 3 });
    if (spectrumOn()) {
      if (sg.canvas.width) ctx.drawImage(sg.canvas, PAD, yTop, W - PAD * 2, yBot - yTop);
      return;
    }

    // The zero line is drawn only under a wave: a rule through a refusal's text reads as a failed load.
    // why: lessons/kit-synth-view.md#zero-line
    if (pts) {
      ctx.fillStyle = C.grid;
      ctx.fillRect(PAD, Math.round(mid) + 0.5, W - PAD * 2, 1);
    }

    if (!pts) {
      /**
       * The refusal sits on the foot at `PAD`; `reason: null` draws nothing at all (the absence is
       * explained elsewhere on the page), and the figure keeps its height either way.
       * why: lessons/kit-synth-view.md#wave-refusal
       */
      if (v.reason !== null) {
        f.say(v.reason || NO_SHAPE, PAD, foot, { room: W - PAD * 2 });
        f.say(v.name || 'no wave', PAD, foot - 13, { colour: C.ink, px: 11, room: W - PAD * 2 });
        if (label) f.say(label, W - PAD, foot - 13, { align: 'right', room: W / 2 });
      }
      // An idle scope still draws its axes and name, in the same type as the drawn name so it does
      // not change size when the signal comes and goes.
      // why: lessons/kit-synth-view.md#idle-labels
      if (v.reason === null && v.axes && v.name) f.say(v.name, PAD, foot, { room: W - PAD * 2 });
      if (v.axes?.y) f.say(v.axes.y, W - PAD, yTop + 9, { align: 'right', px: 10, colour: C.faint, room: W / 2 });
      if (v.axes?.x) f.say(v.axes.x, W - PAD, yBot - 3, { align: 'right', px: 10, colour: C.faint, room: W / 2 });
      return;
    }

    /* Each trace in its own ink, the first on top of the second so a caller's
       primary signal is never buried under whatever it was put through. */
    const room = (yBot - yTop) / 2;
    const line = (t, alpha = 1, width = 1.5) => {
      if (!t?.pts) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = f.tok(t.colour, t.colour);
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < t.pts.length; i++) {
        const x = PAD + (i / (t.pts.length - 1)) * (W - PAD * 2);
        const y = mid - Math.max(-1, Math.min(1, t.pts[i])) * room;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    /**
     * Old windows painted on the next `set`, faintest oldest (cubed), never animated. Faint because
     * an eye adds its own persistence: four ghosts at 0.30 added 0.226 of ink under a still line.
     * why: lessons/kit-synth-view.md#phosphor
     */
    for (let i = 0; i < past.length; i++) {
      const age = (past.length - i) / (past.length + 1);
      line({ pts: past[i], colour: a.colour }, Math.pow(1 - age, 3) * 0.16, 1);
    }

    line(b);
    line(a);

    /**
     * Names on the left so a column lines up, each in its own trace's ink (the legend).
     * `axes: { x, y }` are the caller's strings: y at the top, x under the trace's right edge.
     * why: lessons/kit-synth-view.md#names-and-axes
     */
    if (v.axes?.y) f.say(v.axes.y, W - PAD, yTop + 9, { align: 'right', px: 10, colour: C.faint, room: W / 2 });
    if (v.axes?.x) f.say(v.axes.x, W - PAD, yBot - 3, { align: 'right', px: 10, colour: C.faint, room: W / 2 });

    const nameA = v.name || a.shape || '';
    if (b) {
      const nameB = v.over?.name || b.shape || '';
      f.say(nameA, PAD, foot, { colour: f.tok(a.colour, a.colour), room: W / 2 - PAD });
      f.say(nameB, W - PAD, foot, { align: 'right', colour: f.tok(b.colour, b.colour), room: W / 2 - PAD });
    } else if (label) {
      f.say(label, PAD, foot, { room: W / 2 });
      f.say(nameA, W - PAD, foot, { align: 'right', room: W / 2 });
    } else {
      f.say(nameA, PAD, foot, { room: W - PAD * 2 - (toggles() ? W / 3 : 0) });
    }
  });

  function relabel() {
    // `not drawn` stays in the announcement: a reader with no picture has no empty box to read.
    // why: lessons/kit-synth-view.md#announce
    const how = a.points?.length ? 'measured' : `${a.cycles} cycles of a ${a.shape}`;
    const one = pts
      ? `${v.name || a.shape || "waveform"} drawn as ${how}`
      : `${v.name || 'wave'}, not drawn: ${v.reason || NO_SHAPE}`;
    const two = b?.pts
      ? `, over ${v.over?.name || b.shape} in a second colour`
      : '';
    f.canvas.setAttribute('aria-label', spectrumOn() ? `${v.name || 'sound'} drawn as a spectrogram` : one + two);
    if (toggles()) f.wrap.setAttribute('aria-label', `scope showing the ${view}, press for the ${view === 'wave' ? 'spectrum' : 'wave'}`);
  }

  f.resize();
  arm();
  relabel();
  f.paint();

  return {
    el: f.wrap,
    canvas: f.canvas,
    set(next = {}) {
      // Keep the old window only when a real one is replaced; clearing leaves no ghost.
      // why: lessons/kit-synth-view.md#keep-old
      if (trail > 0 && next.points && pts && pts.length) {
        past.push(pts);
        while (past.length > trail) past.shift();
      }
      if (trail > 0 && next.points === null) past.length = 0;
      v = { ...v, ...next };
      if (next.shape === undefined && next.name !== undefined) v.shape = shapeFor(next.name);
      a = traceOf(v, v.colour);
      b = v.over ? traceOf(v.over, '--hi') : null;
      pts = a.pts;
      relabel();
      f.resize();
      if (spectrumOn() && f.W && f.H) {
        if (!sgRgb) {
          f.ctx.fillStyle = f.tok(v.colour, v.colour);
          const m = /^#([0-9a-f]{6})$/i.exec(f.ctx.fillStyle), n = m ? parseInt(m[1], 16) : 0xffd400;
          sgRgb = [n >> 16, (n >> 8) & 255, n & 255];
        }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        spectroColumn(sg, source, Math.round((f.W - PAD * 2) * dpr), Math.round((f.H - PAD * 2 - 10) * dpr), sgRgb);
      }
      f.paint();
      return { ...v };
    },
    get: () => ({ ...v }),
    mode: TRIG ? 'triggered' : 'free',
    /**
     * Triggered mode: a hit sounds at `atMs` (performance.now()'s clock, the
     * time it reaches the speakers). One read of `source`, timed for when the
     * window has finished, then the trace is drawn and held. No frame loop:
     * one timer per hit. Returns false in free mode or with no source.
     */
    trigger(atMs) {
      if (!TRIG || !source) return false;
      const ctx = source.context;
      const due = atMs + windowMs + 30 - performance.now();
      const mine = gen;
      setTimeout(() => {
        if (mine !== gen) return;      // `flat()` since: a stopped scope stays flat
        const ts = ctx.getOutputTimestamp?.() || {};
        // The context time the hit was rendered at: the output pair maps the
        // speakers' clock to the context's.
        const onset = ts.performanceTime ? ts.contextTime + (atMs - ts.performanceTime) / 1000 : ctx.currentTime - (performance.now() - atMs) / 1000;
        const buf = new Float32Array(source.fftSize);
        source.getFloatTimeDomainData(buf);
        const at = onsetIndex(buf, { rate: ctx.sampleRate, end: ctx.currentTime, onset, windowS: windowMs / 1000 });
        triggered++;
        if (at < 0) { missed++; return; }
        const tr = captureTrace(buf, at, Math.round((windowMs / 1000) * ctx.sampleRate));
        held++;
        this.set({ points: Array.from(tr, (x) => Math.max(-1, Math.min(1, x / full))) });
      }, Math.max(0, due));
      return true;
    },
    /** The analyser to capture from, for a caller whose audio graph exists only after a press
     *  (nothing opens on a visit). In free mode it also arms the wave/spectrum toggle. */
    listen(analyser) { source = analyser; arm(); },
    /** Free mode with an analyser: 'wave' or 'spectrum', and a press's flip. */
    view: () => (toggles() ? view : 'wave'),
    flip: () => { if (toggles()) flip(); return toggles() ? view : 'wave'; },
    /** Triggered mode: back to a flat line, the faint traces gone. */
    flat() { gen++; past.length = 0; this.set({ points: Array.from(new Float32Array(512)) }); },
    /** How many hits asked for a trace, how many were drawn, how many did not fit. */
    triggers: () => ({ triggered, held, missed }),
    /** `false` when this wave has no shape to draw, which is the honest case. */
    drawn: () => !!pts,
    /** `false` when there is no second trace, or it has nothing to draw. */
    overDrawn: () => !!b?.pts,
    /** The two traces' inks, resolved, so a check can tell them apart. */
    inks: () => [f.tok(a.colour, a.colour), b ? f.tok(b.colour, b.colour) : null],
    /**
     * Measure and paint now: see the envelope's redraw.
     * why: lessons/kit-synth-view.md#wave-redraw
     */
    redraw() { f.resize(); f.paint(); },
    ink: (step) => f.ink(step),
    area: (step) => f.area(step),
    get paints() { return f.paints; },
    destroy: () => f.destroy(),
  };
}
