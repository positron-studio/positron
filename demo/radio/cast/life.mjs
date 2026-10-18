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
/** Each scene is picked from this many new candidates plus up to VARIATIONS of liked scenes. */
export const CANDIDATES = 12, VARIATIONS = 4;
/** How hard the pick leans toward what the votes liked: the best candidate at most e^LEAN times the worst. */
export const LEAN = 8;
/** Controls set aside the patch in each scene, so there is more than the patch to learn about. */
export const TWEAKS = 2;
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

/** A vote is 1 bad, 2 meh, 3 good, 4 great: no middle, and great counts twice. */
export const VOTES = { 1: 'bad', 2: 'meh', 3: 'good', 4: 'great' };
const scoreOf = (v) => ({ 1: -2, 2: -1, 3: 1, 4: 2 })[Number(v)] ?? 0;
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
const pickOne = (list, r) => list[Math.floor(r() * list.length)];
const kern = (x, y, w = 0.15) => Math.exp(-(((x - y) / w) ** 2));
const mid = (d) => (d.lo ?? 0) + (d.width ?? WIDTH[d.len] ?? 0.5) / 2;
const peakT = (d) => ((d.peak ?? 0.7) - 0.55) / 0.35;
/**
 * The features a vote can teach, each a weight and how much a scene shares it with a voted one (0 to 1):
 * patch, control, length, where the hand moves on that control, how much granulator, the interlude's
 * control, and each control set aside the patch.
 */
export const FEATURES = [
  [2, (a, b) => (a.patch === b.patch ? 1 : 0)],
  [1.5, (a, b) => (a.param === b.param ? 1 : 0)],
  [1, (a, b) => (a.len === b.len ? 1 : 0)],
  [0.8, (a, b) => (a.param === b.param ? kern(mid(a), mid(b)) : 0)],
  [1, (a, b) => kern(peakT(a), peakT(b), 0.25)],
  [0.4, (a, b) => (a.iParam === b.iParam ? 1 : 0)],
  ...Object.keys(MOVABLE).map((k) => [0.3, (a, b) => (a.tweak?.[k] != null && b.tweak?.[k] != null ? kern(a.tweak[k], b.tweak[k], 0.2) : 0)]),
];
const FEATURE_W = FEATURES.reduce((a, [w]) => a + w, 0);
/**
 * What the votes say about a scene, -1 to 1: per feature, the mean vote (as -1 to 1) of the voted scenes
 * that share it, shrunk toward 0 when few do; then the features' weighted mean. 0 with no votes.
 */
export function prefer(d, said) {
  let s = 0;
  for (const [w, m] of FEATURES) {
    let num = 0, den = 1;
    for (const v of said) { const x = m(d, v.def); num += (v.s / 2) * x; den += x * Math.abs(v.s) / 2; }
    s += w * (num / den);
  }
  return s / FEATURE_W;
}
/**
 * @param {object} [o]
 * @param {number} [o.seed]   a different seed is a different life
 * @param {Array<{def: object, vote: number}>} [o.votes]  1 bad, 2 meh, 3 good, 4 great
 */
export function createLife({ seed = 1, votes = [] } = {}) {
  const taste = tasteOf(votes), scenes = [];
  const said = votes.map((v) => ({ def: v?.def, s: scoreOf(v?.vote) })).filter((v) => v.s && v.def && NAMES.includes(v.def.patch) && PARAMS.includes(v.def.param));
  function weighted(list, w, r) {
    const ws = list.map(w), sum = ws.reduce((a, b) => a + b, 0);
    let x = r() * sum;
    for (let i = 0; i < list.length; i++) { x -= ws[i]; if (x <= 0) return list[i]; }
    return list.at(-1);
  }
  function fresh(r, prev, recent, i) {
    const patch = pickOne(NAMES.filter((n) => n !== prev?.patch), r);
    const param = pickOne(PARAMS.filter((p) => !recent.includes(p)), r);
    const same = i >= 2 && prev.len === scenes[i - 2].len, len = pickOne(KINDS.filter((k) => !(same && k === prev.len)), r);
    const width = WIDTH[len];
    const centre = toT(param, valuesOf(PATCHES[NAMES.indexOf(patch)])[param] ?? fromT(param, 0.5));
    // the window sits near where the patch has the control, give or take
    return { patch, param, len, width, lo: r2(clamp(centre - width / 2 + (r() - 0.5) * 0.3, 0, 1 - width)) };
  }
  /** A liked scene with one thing changed: its length, where its window sits, or its interlude. */
  function vary(base, r, prev, recent, i) {
    if (base.patch === prev?.patch || recent.includes(base.param) || !LENGTHS[base.len]) return null;
    const same = i >= 2 && prev.len === scenes[i - 2].len;
    const d = { patch: base.patch, param: base.param, len: base.len, lo: base.lo, width: base.width ?? WIDTH[base.len], tweak: { ...(base.tweak || {}) }, peak: base.peak };
    const what = same && base.len === prev.len ? 0 : r();
    if (what < 1 / 3) { d.len = pickOne(KINDS.filter((k) => k !== base.len && !(same && k === prev.len)), r); d.width = WIDTH[d.len]; d.lo = r2(clamp(d.lo, 0, 1 - d.width)); }
    else if (what < 2 / 3) {
      const step = (r() < 0.5 ? -1 : 1) * (0.08 + 0.1 * r());
      d.lo = r2(clamp(d.lo + step, 0, 1 - d.width));
      if (d.lo === base.lo) d.lo = r2(clamp(base.lo - step, 0, 1 - d.width));
    } else d.notI = base.iParam;
    d.from = sceneId(base);
    return d;
  }
  /** The rest of a scene: its time, its granulator, its interlude, and two other controls set aside the patch. */
  function complete(d, r, recent) {
    d.dwell = Math.round(LENGTHS[d.len] * (0.8 + 0.4 * r()));
    d.peak ??= r2(0.55 + 0.35 * r());
    d.iParam = pickOne(PARAMS.filter((p) => ![...recent, d.param, d.notI].includes(p)), r);
    delete d.notI;
    d.blend = Math.round(INTERLUDE[0] + r() * (INTERLUDE[1] - INTERLUDE[0]));
    d.iWet = r2(0.15 + 0.2 * r());
    d.ilo = r2(0.4 * r()); d.iw = 0.25;
    d.up = r() < 0.5;
    if (!d.tweak || !Object.keys(d.tweak).length) {
      d.tweak = {};
      for (const k of PARAMS.filter((p) => p !== d.param && p !== d.iParam).sort(() => r() - 0.5).slice(0, TWEAKS)) d.tweak[k] = r2(r());
    }
    for (const k of Object.keys(d.tweak)) if (k === d.param || k === d.iParam) delete d.tweak[k];
    return d;
  }
  const learned = (d) => (said.length ? prefer(d, said) : 0);
  function make(i) {
    const prev = scenes[i - 1], r = rng(seed * 7919 + i * 104729);
    const recent = scenes.flatMap((s) => [s.param, s.iParam]).slice(-FRESH);
    const cands = [];
    for (let k = 0; k < CANDIDATES; k++) cands.push(fresh(r, prev, recent, i));
    for (let k = 0; taste.liked.length && k < VARIATIONS; k++) { const v = vary(weighted(taste.liked, (e) => e.score, r).def, r, prev, recent, i); if (v) cands.push(v); }
    const ok = cands.map((d) => complete(d, r, recent)).filter((d) => !taste.disliked.includes(coreId(d)));
    // lean toward what was liked, never only toward it: the best is at most e^LEAN times the worst
    return weighted(ok.length ? ok : cands, (d) => Math.exp(LEAN * learned(d)), r);
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
