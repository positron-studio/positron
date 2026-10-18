// demo/radio/cast/life.mjs: the living sound as numbers, no DOM. A scene is one file on the dial: one
// patch, the granulator rising and letting go, ONE movement of the kit's invisible hand (hand.mjs) on
// one control. The blend to the next file is an interlude: lighter, faster, on another control.
// Scene i follows the dial's own clock (its i-th landing); seeded, so it does not repeat.
import { plan, positionAt, rng, MOVES } from '../../shell/hand.mjs';
import { PATCHES, valuesOf } from '../../granulator/grain-ring.mjs';

/** How long the needle stays on a file, by kind, in seconds (the clock's dwell, at most 600). */
export const LENGTHS = { short: 45, mid: 100, long: 200 };
/** An interlude is the blend between two files, in seconds (the clock's blend, at most 120). */
export const INTERLUDE = [8, 20];
/** The controls a hand may move: range, and whether it reads on a log scale. */
export const MOVABLE = {
  density: [2, 48, true], size: [0.03, 1.2, true], pitch: [0.5, 2, true], speed: [0.25, 2, true],
  tone: [800, 16000, true], scatter: [0, 1, false], echo: [0, 0.75, false], detune: [0, 0.03, false], pan: [0, 1, false],
};
/** A control is not moved again until this many others have been (scenes and interludes count). */
export const FRESH = 4;
const NAMES = PATCHES.map((p) => p.name), PARAMS = Object.keys(MOVABLE), KINDS = Object.keys(LENGTHS);

export const toT = (k, v) => { const [lo, hi, log] = MOVABLE[k]; const x = log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo); return Math.min(1, Math.max(0, x)); };
export const fromT = (k, t) => { const [lo, hi, log] = MOVABLE[k]; return log ? lo * (hi / lo) ** t : lo + (hi - lo) * t; };
const ease = (u) => u * u * (3 - 2 * u);
/** The scene's granulator: rises over the first quarter, holds, lets go over the last; 0 at both ends. */
export const envelope = (x) => (x <= 0 || x >= 1 ? 0 : x < 0.25 ? ease(x / 0.25) : x > 0.75 ? ease((1 - x) / 0.25) : 1);
/** The interlude's: one quick swell, 0 at both ends. */
export const swell = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);

/** One reach of the hand across `width` of a control's travel, starting near where the patch has it. */
function reach(param, patch, width, ms, seed, r) {
  const centre = toT(param, valuesOf(PATCHES[NAMES.indexOf(patch)])[param] ?? fromT(param, 0.5));
  const lo = Math.max(0, Math.min(1 - width, centre - width / 2));
  return plan({ ...MOVES[0][1], lapMs: ms, turnMs: 0 }, { lo, hi: lo + width, seed, laps: 1, from: r() < 0.5 ? lo : lo + width });
}

/**
 * @param {object} [o]
 * @param {number} [o.seed]  a different seed is a different life; the same seed, the same one
 */
export function createLife({ seed = 1 } = {}) {
  const scenes = [];
  function make(i) {
    const prev = scenes[i - 1], r = rng(seed * 7919 + i * 104729);
    const pick = (list, not = []) => { const ok = list.filter((x) => !not.includes(x)); return ok[Math.floor(r() * ok.length)]; };
    const recent = scenes.flatMap((s) => [s.param, s.interlude.param]).slice(-FRESH);
    const patch = pick(NAMES, prev ? [prev.patch] : []);
    const param = pick(PARAMS, recent);
    const len = pick(KINDS, i >= 2 && prev.len === scenes[i - 2].len ? [prev.len] : []);
    const dwell = Math.round(LENGTHS[len] * (0.8 + 0.4 * r()));
    // the one movement fills the middle of the scene, where the granulator is fully in
    const move = reach(param, patch, { short: 0.35, mid: 0.55, long: 0.8 }[len], dwell * 1000 * 0.7, seed * 31 + i, r);
    const iParam = pick(PARAMS, [...recent, param]);
    const blend = Math.round(INTERLUDE[0] + r() * (INTERLUDE[1] - INTERLUDE[0]));
    // lighter and faster: a narrow window, there and back twice
    const iMove = plan({ ...MOVES[0][1], lapMs: (blend * 1000) / 4, turnMs: 0 },
      { lo: 0.4 * r(), hi: 0.4 * r() + 0.25, seed: seed * 37 + i, laps: 4 });
    return { i, patch, param, len, dwell, peak: 0.55 + 0.35 * r(), move,
      interlude: { param: iParam, blend, wet: 0.15 + 0.2 * r(), move: iMove } };
  }
  const scene = (i) => { while (scenes.length <= i) scenes.push(make(scenes.length)); return scenes[i]; };
  return {
    scene,
    /** Scene i, `t` seconds after its file landed: what the granulator does and the hand holds. */
    inScene(i, t) {
      const s = scene(i), x = t / s.dwell;
      return { kind: 'scene', patch: s.patch, param: s.param, len: s.len, wet: s.peak * envelope(x),
        value: fromT(s.param, positionAt(s.move, (x - 0.15) * s.dwell * 1000)) };
    },
    /** The interlude after scene i, `t` seconds into its blend. */
    inInterlude(i, t) {
      const { interlude: n, patch } = scene(i), x = t / n.blend;
      return { kind: 'interlude', patch, param: n.param, len: 'interlude', wet: n.wet * swell(x),
        value: fromT(n.param, positionAt(n.move, t * 1000)) };
    },
  };
}
