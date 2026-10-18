// demo/radio/cast/life.mjs: the living sound as numbers, no DOM. A scene is one file on the dial: one
// patch, the granulator rising and letting go, ONE movement of the kit's invisible hand (hand.mjs) on
// one control. The blend to the next file is an interlude: lighter, faster, on another control.
// A scene is a plain description (`def`) a vote can carry; votes tilt the picks and liked scenes come
// back as variations. Seeded, so the same seed and votes give the same life.
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
/** The share of scenes that are a variation of a liked one, once there is one. */
export const BUILD_ON = 0.4;
const NAMES = PATCHES.map((p) => p.name), PARAMS = Object.keys(MOVABLE), KINDS = Object.keys(LENGTHS);
const WIDTH = { short: 0.35, mid: 0.55, long: 0.8 };

export const toT = (k, v) => { const [lo, hi, log] = MOVABLE[k]; const x = log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo); return Math.min(1, Math.max(0, x)); };
export const fromT = (k, t) => { const [lo, hi, log] = MOVABLE[k]; return log ? lo * (hi / lo) ** t : lo + (hi - lo) * t; };
const ease = (u) => u * u * (3 - 2 * u);
/** The scene's granulator: rises over the first quarter, holds, lets go over the last; 0 at both ends. */
export const envelope = (x) => (x <= 0 || x >= 1 ? 0 : x < 0.25 ? ease(x / 0.25) : x > 0.75 ? ease((1 - x) / 0.25) : 1);
/** The interlude's: one quick swell, 0 at both ends. */
export const swell = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r2 = (x) => Math.round(x * 100) / 100;

/** A scene's name for a vote: what it plays and moves, not when. */
export const sceneId = (d) => `${d.patch}|${d.param}|${d.len}|${d.lo}|${d.iParam}`;
/** The scene without its interlude: what a dislike rules out. */
export const coreId = (d) => `${d.patch}|${d.param}|${d.len}|${d.lo}`;

/** A vote is 1 bad, 2 ok, 3 good; ok counts as neither. */
export const VOTES = { 1: 'bad', 2: 'ok', 3: 'good' };
const scoreOf = (v) => ({ 1: -1, 2: 0, 3: 1 })[Number(v)] ?? 0;
/** What the votes say: a score per patch, per control, per patch and control, and the liked scenes. */
export function tasteOf(votes = []) {
  const patch = {}, param = {}, pair = {}, byId = new Map();
  for (const v of votes) {
    const d = v?.def, n = scoreOf(v?.vote);
    if (!d || !n || !NAMES.includes(d.patch) || !PARAMS.includes(d.param)) continue;
    patch[d.patch] = (patch[d.patch] || 0) + n;
    param[d.param] = (param[d.param] || 0) + n;
    pair[`${d.patch}|${d.param}`] = (pair[`${d.patch}|${d.param}`] || 0) + n;
    const id = sceneId(d), e = byId.get(id) || { def: d, score: 0 };
    e.score += n; byId.set(id, e);
  }
  const liked = [...byId.values()].filter((e) => e.score > 0);
  return { patch, param, pair, liked, disliked: [...byId.values()].filter((e) => e.score < 0).map((e) => coreId(e.def)) };
}
const weight = (score = 0) => 2 ** clamp(score, -3, 3);

/**
 * @param {object} [o]
 * @param {number} [o.seed]   a different seed is a different life
 * @param {Array<{def: object, vote: number}>} [o.votes]  1 bad, 2 ok, 3 good
 */
export function createLife({ seed = 1, votes = [] } = {}) {
  const taste = tasteOf(votes), scenes = [];
  let owed = false; // a variation the freshness rules put off is owed to the next scene
  function weighted(list, w, r) {
    const ws = list.map(w), sum = ws.reduce((a, b) => a + b, 0);
    let x = r() * sum;
    for (let i = 0; i < list.length; i++) { x -= ws[i]; if (x <= 0) return list[i]; }
    return list.at(-1);
  }
  function fresh(r, prev, recent, i) {
    const patch = weighted(NAMES.filter((n) => n !== prev?.patch), (n) => weight(taste.patch[n]), r);
    const param = weighted(PARAMS.filter((p) => !recent.includes(p)), (p) => weight(taste.param[p]) * (taste.pair[`${patch}|${p}`] < 0 ? 0.25 : 1), r);
    const same = i >= 2 && prev.len === scenes[i - 2].len, kinds = KINDS.filter((k) => !(same && k === prev.len));
    const len = kinds[Math.floor(r() * kinds.length)];
    const width = WIDTH[len];
    const centre = toT(param, valuesOf(PATCHES[NAMES.indexOf(patch)])[param] ?? fromT(param, 0.5));
    return { patch, param, len, lo: r2(clamp(centre - width / 2, 0, 1 - width)), width };
  }
  /** A liked scene with one thing changed: its length, where its window sits, or its interlude. */
  function vary(base, r, prev, recent) {
    if (base.patch === prev?.patch || recent.includes(base.param) || !LENGTHS[base.len]) return null;
    const d = { patch: base.patch, param: base.param, len: base.len, lo: base.lo, width: base.width ?? WIDTH[base.len] };
    const what = r();
    if (what < 1 / 3) { d.len = KINDS.filter((k) => k !== base.len)[Math.floor(r() * 2)]; d.width = WIDTH[d.len]; d.lo = r2(clamp(d.lo, 0, 1 - d.width)); }
    else if (what < 2 / 3) {
      const step = (r() < 0.5 ? -1 : 1) * (0.08 + 0.1 * r());
      d.lo = r2(clamp(d.lo + step, 0, 1 - d.width));
      if (d.lo === base.lo) d.lo = r2(clamp(base.lo - step, 0, 1 - d.width));
    } else d.notI = base.iParam;
    d.from = sceneId(base);
    return d;
  }
  function make(i) {
    const prev = scenes[i - 1], r = rng(seed * 7919 + i * 104729);
    const recent = scenes.flatMap((s) => [s.param, s.iParam]).slice(-FRESH);
    let d = null;
    if (taste.liked.length && (r() < BUILD_ON || owed)) { d = vary(weighted(taste.liked, (e) => e.score, r).def, r, prev, recent); owed = !d; }
    for (let k = 0; k < 6 && (!d || taste.disliked.includes(coreId(d))); k++) d = fresh(r, prev, recent, i);
    if (i >= 2 && prev.len === scenes[i - 2].len && d.len === prev.len) { d.len = KINDS.filter((k) => k !== prev.len)[Math.floor(r() * 2)]; d.width = WIDTH[d.len]; d.lo = r2(clamp(d.lo, 0, 1 - d.width)); }
    d.dwell = Math.round(LENGTHS[d.len] * (0.8 + 0.4 * r()));
    d.peak = r2(0.55 + 0.35 * r());
    d.iParam = weighted(PARAMS.filter((p) => ![...recent, d.param, d.notI].includes(p)), (p) => weight(taste.param[p]), r);
    delete d.notI;
    d.blend = Math.round(INTERLUDE[0] + r() * (INTERLUDE[1] - INTERLUDE[0]));
    d.iWet = r2(0.15 + 0.2 * r());
    d.ilo = r2(0.4 * r()); d.iw = 0.25;
    d.up = r() < 0.5;
    return d;
  }
  /** A def turned into the hand's two plans; pure in the def and the seed. */
  function build(d, i) {
    const move = plan({ ...MOVES[0][1], lapMs: d.dwell * 1000 * 0.7, turnMs: 0 },
      { lo: d.lo, hi: d.lo + d.width, seed: seed * 31 + i, laps: 1, from: d.up ? d.lo : d.lo + d.width });
    const iMove = plan({ ...MOVES[0][1], lapMs: (d.blend * 1000) / 4, turnMs: 0 },
      { lo: d.ilo, hi: d.ilo + d.iw, seed: seed * 37 + i, laps: 4 });
    return { ...d, i, id: sceneId(d), move, iMove };
  }
  const scene = (i) => { while (scenes.length <= i) scenes.push(build(make(scenes.length), scenes.length)); return scenes[i]; };
  /** The JSON a vote stores: everything that makes the scene, nothing derived. */
  const defOf = (s) => { const { i, id, move, iMove, ...d } = s; return d; };
  return {
    scene, defOf, taste,
    /** Scene i, `t` seconds after its file landed: what the granulator does and the hand holds. */
    inScene(i, t) {
      const s = scene(i), x = t / s.dwell;
      return { kind: 'scene', i, id: s.id, patch: s.patch, param: s.param, len: s.len, wet: s.peak * envelope(x),
        value: fromT(s.param, positionAt(s.move, (x - 0.15) * s.dwell * 1000)) };
    },
    /** The interlude after scene i, `t` seconds into its blend. */
    inInterlude(i, t) {
      const s = scene(i), x = t / s.blend;
      return { kind: 'interlude', i, id: s.id, patch: s.patch, param: s.iParam, len: 'interlude', wet: s.iWet * swell(x),
        value: fromT(s.iParam, positionAt(s.iMove, t * 1000)) };
    },
  };
}
