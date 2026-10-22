// demo/room/together.mjs: the arithmetic of a video room's presenter and of a film watched together, pure,
// so together-test.mjs grades it without a browser. Who presents when two press Share at once, the order
// of the strip under the stage, where the film should be on the shared clock, and how a player steers to it.
// why: lessons/kit-participant.md#together

/** A claim to present goes stale when nobody repeated it for this long (the presenter repeats every 10 s). */
export const CLAIM_STALE_MS = 25_000;

/**
 * Who presents. `claims` is site -> { t, last }: `t` when that site pressed Share (its own clock), `last`
 * when this tab last heard it. The earliest press wins, the site breaks a tie, a stale claim counts for nothing.
 * Every tab runs this over the same claims, so every tab names the same presenter.
 * @param {Map<string, {t: number, last: number}>} claims
 * @param {number} now
 * @returns {string} the site, or '' for nobody
 */
export function pickPresenter(claims, now, staleMs = CLAIM_STALE_MS) {
  let best = '', bt = Infinity;
  for (const [site, c] of claims) {
    if (!c || !Number.isFinite(c.t) || !(now - c.last <= staleMs)) continue;
    if (c.t < bt || (c.t === bt && site < best)) { best = site; bt = c.t; }
  }
  return best;
}

/**
 * The strip's order while somebody presents: the presenter's camera, then whoever speaks, then you,
 * then everybody else as they were. Each site once.
 * @param {string[]} sites   in join order
 * @param {{presenter?: string, speaker?: string, self?: string}} o
 */
export function stripOrder(sites, { presenter = '', speaker = '', self = '' } = {}) {
  const first = [presenter, speaker, self].filter((s, i, a) => s && sites.includes(s) && a.indexOf(s) === i);
  return [...first, ...sites.filter((s) => !first.includes(s))];
}

/**
 * Where a shared film should be, in seconds, at shared time `S` (ms). A state says: at shared time `at`
 * the film is at `pos`, playing or not. Before `at` it waits at `pos`.
 * @param {{pos: number, at: number, playing: boolean}} state
 * @param {number} S
 */
export function filmTarget(state, S) {
  if (!state || !Number.isFinite(state.pos)) return null;
  if (!state.playing || !Number.isFinite(state.at) || !Number.isFinite(S) || S < state.at) return state.pos;
  return state.pos + (S - state.at) / 1000;
}

/**
 * How a player gets back to the target. `drift` is where it is minus where it should be, in seconds.
 * Far off it seeks; near, it plays a little faster or slower, which nobody sees; inside the dead band it
 * plays at 1. The rate comes in a few steps, never a smooth curve: every change of playbackRate costs
 * the player a few ms, so a rate re-set every tick never caught up (measured). A seek costs a decoder
 * flush, so it is only worth it past `seekOver`.
 * why: lessons/kit-participant.md#steer
 * @returns {{seek: boolean, rate: number}}
 */
export function steer(drift, { seekOver = 0.5, dead = 0.02, steps = [[0.06, 0.02], [0.15, 0.05], [Infinity, 0.1]] } = {}) {
  if (!Number.isFinite(drift)) return { seek: false, rate: 1 };
  const a = Math.abs(drift);
  if (a > seekOver) return { seek: true, rate: 1 };
  if (a <= dead) return { seek: false, rate: 1 };
  const by = steps.find(([upto]) => a <= upto)[1];
  return { seek: false, rate: drift > 0 ? 1 - by : 1 + by };
}

/** Is state `a` newer than `b`: later `at`, then the higher `by` breaks a tie, so every tab keeps the same one. */
export function newer(a, b) {
  if (!a) return false;
  if (!b || !Number.isFinite(b.at)) return true;
  if (a.at !== b.at) return a.at > b.at;
  return String(a.by || '') > String(b.by || '');
}
