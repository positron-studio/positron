// demo/shell/hand.mjs: what a hand does to a slider, as numbers. No DOM: `plan()` and `positionAt()`
// are pure, so hand-test.mjs grades the real number in 0..1; through a 0..127 lane every case reads
// crest factor 1.000. Not xr-hands.mjs, which is a headset's tracked hands.
// why: lessons/kit-hand.md#header

/**
 * A movement is ten numbers and a name; the parameters are the format, so a custom one is free.
 * why: lessons/kit-hand.md#moves
 */
export const MOVES = [
  ['sweep', {
    // The speed profile of one reach. See `betaY` below for why these two
    // integers are the whole of "human feel".
    a: 3, b: 4,
    shape: 'beta',
    /**
     * 14000 ms, a slow breath in and out. The shape is unaffected (tests use ratios of a lap).
     * /knobs/ reads `lapMs` from here to size its wait, and throws if missing.
     * why: lessons/kit-hand.md#lapms
     */
    lapMs: 14000,        // one end to the other
    span: [0, 1],        // as a share of the lane's travel
    settle: 0.15,        // the share of a lap spent correcting the overshoot
    turnMs: 130,         // held still at each end
    endJit: 0.030,       // how far an end wanders, as a share of travel
    timeJit: 0.120,      // how much a lap's duration wanders
    over: 0.022,         // overshoot, as a share of travel
    wobble: 0.050,       // speed micro-variation inside one reach
  }],
];

/**
 * The presets the button cycles, in order; separate so a preset can exist before it is on the button.
 * why: lessons/kit-hand.md#move-turn
 */
export const MOVE_TURN = [0];

/**
 * The button's face per movement: the glyph is the state, not the next press. Not `⇆`, which
 * means a there-and-back loop on /archive/radio/ and /replay/.
 * why: lessons/kit-hand.md#move-glyph
 */
// ⇄: two arrows pointing opposite ways is what a sweep back and forth is.
// why: lessons/kit-hand.md#glyph-sweep
export const MOVE_GLYPH = { sweep: '\u21c4' };
export const MOVE_SAYS = { sweep: 'moving by itself, back and forth. press to stop' };
export const MOVE_OFF = 'not moving by itself. press to let go of it';

/**
 * Everything except the shape switched off, so the test can ask what a profile does on its own.
 * why: lessons/kit-hand.md#bare
 */
export const BARE = { settle: 0, turnMs: 0, endJit: 0, timeJit: 0, over: 0, wobble: 0 };

/** How many harmonics the speed wobble uses. See `warp`. */
export const HARMONICS = 2;

// The same numbers as `MOVES[0]`, and `lapMs` must move in both: a partial preset falls back here.
// why: lessons/kit-hand.md#defaults
const DEFAULTS = {
  a: 3, b: 4, shape: 'beta', lapMs: 14000, span: [0, 1],
  settle: 0.15, turnMs: 130, endJit: 0.03, timeJit: 0.12, over: 0.022, wobble: 0.05,
};

/**
 * The coarsest lane that can show a hand: the ends wander by `endJit * N` steps, and below one step
 * every lap turns at the same number. At 8 steps the crest factor reads 1.000.
 * why: lessons/kit-hand.md#minsteps
 */
export const minSteps = (preset = MOVES[0][1]) =>
  Math.ceil(1 / Math.max(1e-9, preset.endJit ?? DEFAULTS.endJit));

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * mulberry32: small, seeded and repeatable.
 * why: lessons/kit-hand.md#rng
 */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function binom(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Position along one reach for a `Beta(a, b)` speed profile, a polynomial for whole a and b:
 * 1,1 triangle; 3,3 minimum jerk; 3,4 the hand. `a < b` puts peak speed at 0.400, not 0.500;
 * `b = a` is the sabotage hand-test.mjs catches.
 * why: lessons/kit-hand.md#betay
 */
export function betaY(a, b, t) {
  const x = clamp01(t);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const n = a + b - 1;
  let s = 0;
  for (let j = a; j <= n; j++) s += binom(n, j) * Math.pow(x, j) * Math.pow(1 - x, n - j);
  return s;
}

/** A raised cosine. Only the test uses it, as the decoy the ask names. */
export const sineY = (t) => (1 - Math.cos(Math.PI * clamp01(t))) / 2;

export const shapeY = (shape, a, b, t) => (shape === 'sine' ? sineY(t) : betaY(a, b, t));

/**
 * Speed micro-variation by warping time: `sin(π m t)` is zero at both ends, so endpoints never move,
 * and it stays monotone while `amp * π * HARMONICS < 1` (0.314 at 0.05 and two).
 * why: lessons/kit-hand.md#warp
 */
export function warp(t, amp, phases) {
  if (!amp || !phases?.length) return clamp01(t);
  let s = 0;
  for (let m = 1; m <= phases.length; m++) {
    s += (Math.sin(Math.PI * m * t) * Math.cos(phases[m - 1])) / m;
  }
  return clamp01(t + amp * s);
}

/**
 * Turn a movement into a list of legs, a value the test can sample at any rate; each leg names
 * its kind. One lap: reach (1 - settle), settle (Beta(3,3) back), turn (turnMs held).
 * @param preset one row of `MOVES`, or the same ten numbers with no name
 * @param [o.lo] [o.hi]  the window in 0..1 the movement may use
 * @param [o.seed]  fixed for the test; advanced by the page when a plan runs out
 * @param [o.laps]  how many reaches
 * @param [o.from]  where to pick up, for a plan that follows another
 * why: lessons/kit-hand.md#plan
 */
export function plan(preset = MOVES[0][1], { lo = 0, hi = 1, seed = 1, laps = 10, from = null } = {}) {
  const p = { ...DEFAULTS, ...preset };
  const rnd = rng(seed);
  const loEnd = lo + (hi - lo) * p.span[0];
  const hiEnd = lo + (hi - lo) * p.span[1];
  const travel = hiEnd - loEnd;

  // An end is inset by the overshoot before it wanders, so the handle never passes the lane's end;
  // clamping would flatten the overshoot being measured.
  // why: lessons/kit-hand.md#endat
  const endAt = (top) => {
    const inset = (p.over + rnd() * p.endJit) * travel;
    return top ? hiEnd - inset : loEnd + inset;
  };

  let at = from == null ? endAt(false) : Math.max(loEnd, Math.min(hiEnd, from));
  let up = from == null ? true : at - loEnd < travel / 2;
  const legs = [];
  let t = 0;
  for (let k = 0; k < laps; k++) {
    const target = endAt(up);
    const lapMs = p.lapMs * (1 + p.timeJit * (rnd() * 2 - 1));
    const reachMs = lapMs * (1 - p.settle);
    const settleMs = lapMs * p.settle;
    const shoot = target + (up ? 1 : -1) * p.over * travel;
    const phases = [];
    for (let m = 0; m < HARMONICS; m++) phases.push(rnd() * Math.PI * 2);
    legs.push({ kind: 'reach', t0: t, ms: reachMs, from: at, to: shoot,
      a: p.a, b: p.b, shape: p.shape, wobble: p.wobble, phases });
    t += reachMs;
    if (settleMs > 0) {
      // Symmetric on purpose: a corrective submovement is the case minimum jerk describes.
      // why: lessons/kit-hand.md#settle
      legs.push({ kind: 'settle', t0: t, ms: settleMs, from: shoot, to: target,
        a: 3, b: 3, shape: 'beta', wobble: 0, phases: [] });
      t += settleMs;
    }
    if (p.turnMs > 0) {
      legs.push({ kind: 'turn', t0: t, ms: p.turnMs, from: target, to: target,
        a: p.a, b: p.b, shape: p.shape, wobble: 0, phases: [] });
      t += p.turnMs;
    }
    at = target;
    up = !up;
  }
  return { legs, totalMs: t, lo: loEnd, hi: hiEnd, seed, preset: p };
}

/**
 * Where the handle is at `tMs` into a plan, 0 to 1. A function of the clock, never accumulated
 * per frame, so a dropped frame skips a sample and never drifts the phase.
 * why: lessons/kit-hand.md#positionat
 */
export function positionAt(pl, tMs) {
  const legs = pl?.legs;
  if (!legs?.length) return 0;
  if (!(tMs > 0)) return legs[0].from;
  if (tMs >= pl.totalMs) return legs[legs.length - 1].to;
  let i = 0, j = legs.length - 1;
  while (i < j) {
    const m = (i + j + 1) >> 1;
    if (legs[m].t0 <= tMs) i = m; else j = m - 1;
  }
  const g = legs[i];
  if (g.kind === 'turn') return g.to;
  const k = g.ms > 0 ? clamp01((tMs - g.t0) / g.ms) : 1;
  return g.from + (g.to - g.from) * shapeY(g.shape, g.a, g.b, warp(k, g.wobble, g.phases));
}
