// demo/radio/cast/life.mjs: the living sound as numbers, no DOM. A scene is one file on the dial: one
// patch, the granulator rising and letting go, ONE movement of the kit's invisible hand (hand.mjs) on
// one control. The blend to the next file is an interlude: lighter, faster, on another control.
// A scene is a plain description (`def`) a vote can carry; votes tilt the picks and liked scenes come
// back as variations. Seeded, so the same seed and votes give the same life.
import { plan, positionAt, rng, MOVES } from '../../shell/hand.mjs';
import { PATCHES, valuesOf } from '../../granulator/grain-ring.mjs';

/** How long the needle stays on a file, by kind, in seconds (the clock's dwell, at most 600). */
export const LENGTHS = { short: 45, mid: 80, long: 150 };
/** An interlude is the blend between two files, in seconds (the clock's blend, at most 120). */
export const INTERLUDE = [3, 20];
/** The tuning noise while a scene sits on its station, as the clock's `noise`; an interlude's own level comes only with its blend.
 * Quiet talk and field recordings were heard as static under 0.04 times a radio interlude's noise held all scene. */
export const DWELL_NOISE = 0.2;
/**
 * What an interlude sounds like, by kind: the tuning noise (the clock's `noise`, 0 to 2), how far the
 * granulator swells, how long the blend is, whether the granulator freezes the outgoing file, the
 * hand-over path (crossfade.mjs PATHS: 0 the dial's sweep, 1 dissolve, 2 filter, 3 gap) and how often.
 * radio is the dial's hiss, kept rare as the station's signature; smear carries a frozen grain cloud
 * across; clean is a short dissolve; filter darkens one file into the next; pause is a breath of silence.
 */
export const IKINDS = {
  radio: { noise: [0.25, 0.5], wet: [0.15, 0.3], blend: [10, 16], freeze: false, path: 0, odds: 0.27 },
  drift: { noise: [0.1, 0.25], wet: [0.3, 0.5], blend: [8, 14], freeze: false, path: 0, odds: 0.27 },
  smear: { noise: [0, 0.12], wet: [0.6, 0.9], blend: [8, 18], freeze: true, path: 0, odds: 1 },
  clean: { noise: [0, 0], wet: [0.05, 0.15], blend: [4, 8], freeze: false, path: 1, odds: 1 },
  dissolve: { noise: [0, 0], wet: [0.1, 0.25], blend: [8, 20], freeze: false, path: 1, odds: 1.2 },
  filter: { noise: [0, 0], wet: [0.2, 0.4], blend: [10, 20], freeze: false, path: 2, odds: 1, param: 'tone' },
  pause: { noise: [0, 0], wet: [0, 0], blend: [3, 6], freeze: false, path: 3, odds: 0.6, quiet: true },
};
/** The controls a hand may move: range, and whether it reads on a log scale. */
export const MOVABLE = {
  density: [2, 48, true], size: [0.03, 1.2, true], pitch: [0.5, 2, true], speed: [0.25, 2, true],
  tone: [800, 16000, true], scatter: [0, 1, false], echo: [0, 0.75, false], detune: [0, 0.03, false], pan: [0, 1, false],
};
/** A control is not moved again until this many others have been (scenes and interludes count). */
export const FRESH = 4;
/**
 * The layers a scene may carry over the file (plans/plan-cast-reinterpret.md section 2): a drone bed, a
 * resonator bank in the scene's key, harmonizer voices in the ring, ghosts of the next or previous file,
 * a pulse at the scene's tempo, and a room. Each is a choice the votes learn.
 */
export const LAYERS = {
  drone: ['none', 'freeze', 'key', 'both'],
  res: ['none', 'fifths', 'minor7', 'major', 'cluster'],
  harm: ['none', 'octfifth', 'triad', 'quartal', 'cluster'],
  ghost: ['none', 'bpf', 'comb', 'res'],
  pulse: [[3, 8], [5, 8], [7, 16], [5, 16], [4, 4]],
  // what the pulse moves: the grains, the resonators, or (on talk) the speech's own onsets
  pulseOn: ['grains', 'res', 'onsets'],
};
/**
 * How likely each layer is, by what the file is (most of the archive is talk or field recordings): talk
 * through resonators and a harmonizer sings, noise through resonators turns pitched, music needs less.
 */
export const ODDS = {
  speech: { drone: 0.95, res: 0.7, harm: 0.6, ghost: 0.6, pulse: 0.3 },
  field: { drone: 0.95, res: 0.6, harm: 0.35, ghost: 0.6, pulse: 0.4 },
  music: { drone: 0.85, res: 0.35, harm: 0.4, ghost: 0.5, pulse: 0.5 },
};
ODDS.unknown = ODDS.speech;
/** Each scene is picked from this many new candidates plus up to VARIATIONS of liked scenes. */
export const CANDIDATES = 12, VARIATIONS = 4;
/** How hard the pick leans toward what the votes liked: the best candidate at most e^LEAN times the worst. */
export const LEAN = 10;
/** Controls set aside the patch in each scene, so there is more than the patch to learn about. */
export const TWEAKS = 2;
/**
 * The cast's own patches: a page patch as the base, values set on top (the engines take a base name and a
 * set, so nothing new reaches the ring's program). Sentence cased, as every patch name is.
 */
export const CAST_PATCHES = [
  { name: 'Fog', base: 'Cloud', set: { tone: 1400, dark: 900, echo: 0.7, time: 0.6, size: 0.8, density: 16, scatter: 0.8, pitch: 0.75 } },
  { name: 'Cathedral', base: 'Frozen choir', set: { size: 1.6, density: 6, scatter: 0.3, pitch: 0.5, echo: 0.6, time: 0.9, dark: 3000, back: 2 } },
  { name: 'Swarm', base: 'Sparks', set: { density: 60, size: 0.04, scatter: 1, jitter: 2, pitch: 1, detune: 0.05, pan: 1 } },
  { name: 'Tide', base: 'Slow motion', set: { speed: 0.25, size: 1.2, density: 10, back: 3, dir: -1, echo: 0.4, time: 0.7 } },
  { name: 'Stutter', base: 'Gate', set: { lock: 1, density: 8, size: 0.12, drop: 0.3, ramp: 2, echo: 0.3, time: 0.25 } },
  { name: 'Glass', base: 'Shimmer', set: { pitch: 1.5, size: 0.2, density: 20, tone: 9000, echo: 0.4, time: 0.25, scatter: 0.3 } },
].filter((p) => PATCHES.some((q) => q.name === p.base));
/**
 * Every patch belongs to a family, and a family says which controls the hand and the tweaks may move and
 * how far (in control values; the hand's window is these turned to 0 to 1 by toT, within MOVABLE). A
 * control not listed is never moved, so pitch is never moved. why: plans/plan-cast-patches-scenes.md 2.1
 */
export const FAMILIES = {
  drone: { tone: [500, 3000], speed: [0.1, 0.5], echo: [0.2, 0.6], pan: [0, 1], detune: [0, 0.01] },
  cloud: { size: [0.25, 1.2], density: [8, 40], tone: [1500, 8000], scatter: [0.4, 1], echo: [0.1, 0.6], pan: [0, 1], speed: [0.25, 1] },
  choir: { tone: [1500, 6000], detune: [0, 0.015], echo: [0, 0.75], pan: [0, 1], size: [0.6, 2.5] },
  tape: { tone: [800, 16000], echo: [0.1, 0.8], size: [0.3, 2.5], speed: [0.25, 1], pan: [0, 1], density: [2, 12] },
  rhythmic: { tone: [800, 16000], echo: [0, 0.75], pan: [0, 1], size: [0.06, 0.6], speed: [0.5, 1] },
  glitch: { tone: [2000, 10000], echo: [0, 0.75], size: [0.02, 0.1], pan: [0, 1] },
  spectral: { tone: [800, 6000], detune: [0, 0.02], echo: [0, 0.75], pan: [0, 1] },
};
/** Lengths a family never plays at. */
export const NOT_LEN = { glitch: ['long'], spectral: ['short'] };
export const FAMILY_OF = {
  'Tape stop': 'tape', Dub: 'tape', Backwards: 'tape', Tide: 'tape', Cloud: 'cloud', Fog: 'cloud',
  'Frozen choir': 'choir', Shimmer: 'choir', Glass: 'choir', 'Slow motion': 'drone', Undertow: 'drone', Cathedral: 'drone',
  Gate: 'rhythmic', Stutter: 'rhythmic', Sparks: 'glitch', Swarm: 'glitch',
};
export const familyOf = (name) => FAMILY_OF[name] || 'cloud';
const NAMES = [...PATCHES.map((p) => p.name), ...CAST_PATCHES.map((p) => p.name)], PARAMS = Object.keys(MOVABLE), KINDS = Object.keys(LENGTHS);
/** What an engine is handed for a patch name: a page patch's own name, or a cast patch's base and its values. */
export function patchFor(name) {
  const c = CAST_PATCHES.find((p) => p.name === name);
  return c ? { name: c.base, set: { ...c.set } } : { name, set: {} };
}
/** A patch's control values, the cast's included. */
export const patchValues = (name) => { const { name: base, set } = patchFor(name); return { ...valuesOf(PATCHES.find((p) => p.name === base) || PATCHES[0]), ...set }; };
/** How often a scene is naked (no granulator, no layers, no noise), by what its file is: long talk, left to speak. */
export const NAKED = { speech: 0.2, ambiguous: 0.2, unknown: 0.08, field: 0.05, music: 0.05 };
const WIDTH = { short: 0.35, mid: 0.55, long: 0.8 };

/** The window (0 to 1, as toT) a patch's family lets the hand use on `param`, or null when it may not move it. */
export function guardT(patch, param) {
  const g = FAMILIES[familyOf(patch)]?.[param];
  if (!g || !MOVABLE[param]) return null;
  const [lo, hi] = MOVABLE[param], a = toT(param, Math.max(lo, g[0])), b = toT(param, Math.min(hi, g[1]));
  return b - a >= 0.05 ? [r2(a), r2(b)] : null;
}
/** The controls a patch's family lets move. */
export const movableFor = (patch) => PARAMS.filter((p) => guardT(patch, p));
/** A patch that freezes the ring freezes only after the scene's dry share, never the blend before it. */
export const freezesAfterDry = (patch) => patchValues(patch).freeze >= 1;
/**
 * The duck rule: no scene reaches pitch over 1.3 with grains under 0.5 s and scatter over 0.3, unless its
 * patch is already there and the scene moves none of the three further. why: plans/plan-cast-patches-scenes.md 1.2
 */
export function ducks(d) {
  const base = patchValues(d.patch), at = { ...base };
  for (const [k, t] of Object.entries(d.tweak || {})) if (MOVABLE[k]) at[k] = fromT(k, t);
  const span = (k) => {
    const v = [at[k]];
    if (d.param === k) v.push(fromT(k, d.lo), fromT(k, d.lo + d.width));
    if (d.iParam === k && d.ilo != null) v.push(fromT(k, d.ilo), fromT(k, d.ilo + d.iw));
    return [Math.min(...v), Math.max(...v)];
  }, e = 1e-6;
  const [, pHi] = span('pitch'), [sLo] = span('size'), [, cHi] = span('scatter');
  return pHi > 1.3 && sLo < 0.5 && cHi > 0.3 && (pHi > base.pitch + e || sLo < base.size - e || cHi > base.scatter + e);
}
export const toT = (k, v) => { const [lo, hi, log] = MOVABLE[k]; const x = log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo); return Math.min(1, Math.max(0, x)); };
export const fromT = (k, t) => { const [lo, hi, log] = MOVABLE[k]; return log ? lo * (hi / lo) ** t : lo + (hi - lo) * t; };
const ease = (u) => u * u * (3 - 2 * u);
/** The scene's granulator: rises over the first quarter, holds, lets go over the last; 0 at both ends. */
/**
 * The scene's arc: dry for its first `dry` share (the original, recognisable), then a rise into the
 * granulator over 0.18, a long deep hold, and the release only over the last 0.15. 0 at both ends.
 */
export const envelope = (x, dry = 0.2) => (x <= dry || x >= 1 ? 0 : x < dry + 0.18 ? ease((x - dry) / 0.18) : x > 0.85 ? ease((1 - x) / 0.15) : 1);
/** The longer form: intensity rises and falls over ARC scenes, from 0.55 to 1. */
export const ARC = 5;
export const intensityAt = (i, jitter = 0) => Math.min(1, Math.max(0.5, 0.55 + 0.45 * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / ARC)) + jitter));
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
/** What the votes say: a score per patch, per control, per patch and control, per file, and the liked scenes. */
export function tasteOf(votes = []) {
  const patch = {}, param = {}, pair = {}, file = {}, byId = new Map();
  for (const v of votes) {
    const d = v?.def, n = scoreOf(v?.vote);
    if (n && v?.file) file[v.file] = (file[v.file] || 0) + n;
    if (!d || !n || !NAMES.includes(d.patch) || !PARAMS.includes(d.param)) continue;
    patch[d.patch] = (patch[d.patch] || 0) + n;
    param[d.param] = (param[d.param] || 0) + n;
    pair[`${d.patch}|${d.param}`] = (pair[`${d.patch}|${d.param}`] || 0) + n;
    const id = sceneId(d), e = byId.get(id) || { def: d, score: 0 };
    e.score += n; byId.set(id, e);
  }
  const liked = [...byId.values()].filter((e) => e.score > 0);
  return { patch, param, pair, file, liked, disliked: [...byId.values()].filter((e) => e.score < 0).map((e) => coreId(e.def)) };
}
const pickOne = (list, r) => list[Math.floor(r() * list.length)];
/** How often a file is picked for a program, by its score: 1/8 to 8 times, and never at -6 or below. */
export const fileWeight = (score = 0) => (score <= -6 ? 0 : 2 ** Math.min(3, Math.max(-3, score / 2)));
const kern = (x, y, w = 0.15) => Math.exp(-(((x - y) / w) ** 2));
const mid = (d) => (d.lo ?? 0) + (d.width ?? WIDTH[d.len] ?? 0.5) / 2;
const peakT = (d) => ((d.peak ?? 0.85) - 0.7) / 0.3;
/**
 * The features a vote can teach, each a weight and how much a scene shares it with a voted one (0 to 1):
 * patch, control, length, where the hand moves on that control, how much granulator, the interlude's
 * control, and each control set aside the patch.
 */
export const FEATURES = [
  [3, (a, b) => (a.patch === b.patch ? 1 : 0)],
  [1.5, (a, b) => (a.param === b.param ? 1 : 0)],
  [1, (a, b) => (a.len === b.len ? 1 : 0)],
  [0.8, (a, b) => (a.param === b.param ? kern(mid(a), mid(b)) : 0)],
  [1.5, (a, b) => kern(peakT(a), peakT(b), 0.25)],
  [0.4, (a, b) => (a.iParam === b.iParam ? 1 : 0)],
  [0.8, (a, b) => (a.iKind && a.iKind === b.iKind ? 1 : 0)],
  [1, (a, b) => (a.naked && b.naked ? 1 : 0)],
  ...Object.keys(MOVABLE).map((k) => [0.3, (a, b) => (a.tweak?.[k] != null && b.tweak?.[k] != null ? kern(a.tweak[k], b.tweak[k], 0.2) : 0)]),
  ...['drone', 'res', 'harm', 'ghost'].map((k) => [0.8, (a, b) => (a.layers?.[k] && a.layers[k] === b.layers?.[k] ? 1 : 0)]),
  [0.6, (a, b) => (a.layers && b.layers && !a.layers.bpm === !b.layers.bpm ? (a.layers.bpm ? kern(a.layers.bpm / 120, b.layers.bpm / 120, 0.1) : 1) : 0)],
  [0.5, (a, b) => (a.layers && b.layers ? kern(a.layers.room, b.layers.room, 0.15) : 0)],
  // the same layer on the same kind of file: what works on talk need not work on a field recording
  ...['drone', 'res', 'harm', 'ghost'].map((k) => [0.6, (a, b) => (a.kind && a.kind === b.kind && a.layers?.[k] === b.layers?.[k] ? 1 : 0)]),
];
// The scale the weighted sum is read against: the weights before the layers, so adding a feature adds
// to what the votes can say rather than thinning every other feature.
const FEATURE_NORM = 10.7;
/**
 * What the votes say about a scene, -1 to 1: per feature, the mean vote (as -1 to 1) of the voted scenes
 * that share it, shrunk toward 0 when few do; then the features' weighted sum over FEATURE_NORM. 0 with no votes.
 */
export function prefer(d, said) {
  let s = 0;
  for (const [w, m] of FEATURES) {
    let num = 0, den = 1;
    for (const v of said) { const x = m(d, v.def); num += (v.s / 2) * x; den += x * Math.abs(v.s) / 2; }
    s += w * (num / den);
  }
  return s / FEATURE_NORM;
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
  const lensFor = (patch, notLen) => { const ks = KINDS.filter((k) => k !== notLen && !NOT_LEN[familyOf(patch)]?.includes(k)); return ks.length ? ks : KINDS.filter((k) => k !== notLen); };
  /** The hand's window on `param` for a scene of `len`: inside the family's guard, near `centre`. */
  function windowOf(patch, param, len, centre, nudge) {
    const [g0, g1] = guardT(patch, param), width = r2(WIDTH[len] * (g1 - g0));
    return { width, lo: r2(clamp(clamp(centre, g0, g1) - width / 2 + nudge * (g1 - g0), g0, g1 - width)) };
  }
  function fresh(r, prev, recent, i) {
    // a patch with at least two controls not moved lately, one for the scene and one for its interlude
    const free = (n) => movableFor(n).filter((p) => !recent.includes(p)).length >= 2, pool = NAMES.filter((n) => n !== prev?.patch);
    const patch = pickOne(pool.filter(free).length ? pool.filter(free) : pool, r), can = movableFor(patch);
    const param = pickOne(can.filter((p) => !recent.includes(p)).length ? can.filter((p) => !recent.includes(p)) : can, r);
    const same = i >= 2 && prev.len === scenes[i - 2].len, len = pickOne(lensFor(patch, same ? prev.len : null), r);
    const centre = toT(param, patchValues(patch)[param] ?? fromT(param, 0.5));
    // the window sits near where the patch has the control, give or take, inside the family's guard
    return { patch, param, len, ...windowOf(patch, param, len, centre, (r() - 0.5) * 0.3) };
  }
  /** A liked scene with one thing changed: its length, where its window sits, or its interlude. */
  function vary(base, r, prev, recent, i) {
    if (base.patch === prev?.patch || recent.includes(base.param) || !LENGTHS[base.len] || !guardT(base.patch, base.param)
      || movableFor(base.patch).filter((p) => p !== base.param && !recent.includes(p)).length < 1) return null;
    const same = i >= 2 && prev.len === scenes[i - 2].len;
    const [g0, g1] = guardT(base.patch, base.param), w0 = r2(WIDTH[base.len] * (g1 - g0));
    const d = { patch: base.patch, param: base.param, len: base.len, lo: r2(clamp(base.lo, g0, g1 - w0)), width: w0, tweak: { ...(base.tweak || {}) }, peak: base.peak,
      iKind: IKINDS[base.iKind] ? base.iKind : undefined, key: base.key ? { ...base.key } : undefined, layers: base.layers ? { ...base.layers } : undefined };
    const what = same && base.len === prev.len ? 0 : r() * (d.layers ? 4 / 3 : 1);
    if (what >= 1) { const k = pickOne(['drone', 'res', 'harm', 'ghost'], r); d.layers[k] = pickOne(LAYERS[k].filter((x) => x !== d.layers[k]), r); }
    else if (what < 1 / 3) { d.len = pickOne(lensFor(d.patch, null).filter((k) => k !== base.len && !(same && k === prev.len)), r) ?? d.len; d.width = r2(WIDTH[d.len] * (g1 - g0)); d.lo = r2(clamp(d.lo, g0, g1 - d.width)); }
    else if (what < 2 / 3) {
      const step = (r() < 0.5 ? -1 : 1) * (0.08 + 0.1 * r()) * (g1 - g0);
      const lo0 = d.lo;
      d.lo = r2(clamp(lo0 + step, g0, g1 - d.width));
      if (d.lo === lo0) d.lo = r2(clamp(lo0 - step, g0, g1 - d.width));
    } else { d.notI = base.iParam; d.notKind = base.iKind; delete d.iKind; }
    d.from = sceneId(base);
    return d;
  }
  /** The rest of a scene: its time, its granulator, its interlude, and two other controls set aside the patch. */
  function complete(d, r, recent, prev) {
    d.dwell = Math.round(LENGTHS[d.len] * (0.8 + 0.4 * r()));
    d.peak ??= r2(0.7 + 0.3 * r());
    // never the same kind of interlude twice in a row; a filter hand-over needs tone free for its hand
    const tone = [d.param, d.notI, ...recent].includes('tone') || !guardT(d.patch, 'tone');
    if (!d.iKind || d.iKind === prev?.iKind || (tone && IKINDS[d.iKind]?.param)) {
      d.iKind = weighted(Object.keys(IKINDS).filter((k) => k !== prev?.iKind && k !== d.notKind && !(tone && IKINDS[k].param)), (k) => IKINDS[k].odds, r);
    }
    delete d.notKind;
    const K = IKINDS[d.iKind], within = ([a, b]) => a + r() * (b - a), can = movableFor(d.patch);
    const iCan = can.filter((p) => ![...recent, d.param, d.notI].includes(p)), iAny = can.filter((p) => p !== d.param);
    d.iParam = K.param ?? pickOne(iCan.length ? iCan : iAny.length ? iAny : PARAMS.filter((p) => p !== d.param), r);
    delete d.notI;
    d.blend = Math.round(within(K.blend));
    d.iNoise = r2(within(K.noise));
    d.iWet = r2(within(K.wet));
    d.iFreeze = K.freeze;
    d.iPath = K.path;
    const [i0, i1] = guardT(d.patch, d.iParam) ?? [0, 1], iw = r2(Math.min(K.param ? 0.6 * (i1 - i0) : 0.25, i1 - i0));
    d.ilo = r2(i0 + r() * Math.min(0.4, i1 - i0 - iw)); d.iw = iw;
    d.up = r() < 0.5;
    // the tweaks sit near the patch's own value, inside the family's guard, never anywhere in the range
    const near = (k, x) => { const [g0, g1] = guardT(d.patch, k); return r2(clamp(x, g0, g1)); };
    if (!d.tweak || !Object.keys(d.tweak).length) {
      d.tweak = {};
      for (const k of can.filter((p) => p !== d.param && p !== d.iParam).sort(() => r() - 0.5).slice(0, TWEAKS)) d.tweak[k] = near(k, toT(k, patchValues(d.patch)[k] ?? fromT(k, 0.5)) + (r() - 0.5) * 0.3);
    }
    for (const k of Object.keys(d.tweak)) if (k === d.param || k === d.iParam || !guardT(d.patch, k)) delete d.tweak[k]; else d.tweak[k] = near(k, d.tweak[k]);
    // the scene's key (a fifth or a step from the last, sometimes a leap) and its layers
    if (!d.key) { const from = prev?.key?.root ?? Math.floor(r() * 12), move = pickOne([0, 7, 5, 2, 10, Math.floor(r() * 12)], r); d.key = { root: (from + move) % 12, minor: r() < 0.6 }; }
    if (!d.layers) d.layers = layersOf(r, d.kind);
    return d;
  }
  const learned = (d) => (said.length ? prefer(d, said) : 0);
  /** A fresh set of layers, with odds by what the file is (ODDS). */
  function layersOf(r, kind) {
    const o = ODDS[kind] || ODDS.unknown, some = (k) => (r() < o[k] ? pickOne(LAYERS[k].slice(1), r) : 'none');
    const pulse = r() < o.pulse;
    // a drone in nearly every scene, and both kinds at once as often as either alone
    const drone = r() < o.drone ? pickOne(['freeze', 'key', 'both', 'both'], r) : 'none';
    return { drone, droneLevel: r2(0.3 + 0.3 * r()), droneOct: r() < 0.5 ? -1 : -2,
      res: some('res'), resDecay: r2(0.5 + 3.5 * r()), resWet: r2(0.15 + 0.35 * r()),
      harm: some('harm'), harmSpread: r2(r()),
      ghost: some('ghost'), ghostEvery: Math.round(20 + 40 * r()), ghostLen: Math.round(3 + 7 * r()), ghostSide: r() < 0.5 ? 'next' : 'prev', ghostLevel: r2(0.1 + 0.15 * r()),
      bpm: pulse ? Math.round(60 + 60 * r()) : 0, pattern: pickOne(LAYERS.pulse, r), pulseOn: pickOne(kind === 'speech' ? LAYERS.pulseOn : LAYERS.pulseOn.slice(0, 2), r),
      room: r2(0.1 + 0.3 * r()), roomSize: r2(0.4 + 0.5 * r()) };
  }
  function make(i, ctx = {}) {
    const prev = scenes[i - 1], r = rng(seed * 7919 + i * 104729);
    const recent = scenes.flatMap((s) => [s.param, s.iParam]).slice(-FRESH);
    const cands = [];
    for (let k = 0; k < CANDIDATES; k++) cands.push(fresh(r, prev, recent, i));
    const kind = ctx.kind || 'unknown';
    // a variation never follows a variation, so at least half the scenes are new
    for (let k = 0; taste.liked.length && !prev?.from && k < VARIATIONS; k++) { const v = vary(weighted(taste.liked, (e) => e.score, r).def, r, prev, recent, i); if (v) cands.push(v); }
    const ok = cands.map((d) => complete(Object.assign(d, { kind }), r, recent, prev)).filter((d) => !taste.disliked.includes(coreId(d)) && !ducks(d));
    // lean toward what was liked, never only toward it: the best is at most e^LEAN times the worst
    const d = weighted(ok.length ? ok : cands, (x) => Math.exp(LEAN * learned(x)), r);
    // sometimes a long scene left to speak: its own draw, so every other choice stays as it was
    // and within the same rules as any scene: not two in a row, not a third long scene, not a clean interlude twice
    const allowed = !prev?.naked && prev?.iKind !== 'clean' && !(i >= 2 && prev.len === 'long' && scenes[i - 2].len === 'long');
    if (allowed && rng(seed * 31337 + i * 7907)() < (NAKED[kind] ?? NAKED.music)) { const n = naked(d, rng(seed * 4241 + i)); if (!taste.disliked.includes(coreId(n))) return n; }
    return d;
  }
  /** A naked scene: long, no granulator, no layers, no drone, a plain fade after it. */
  function naked(d, r) {
    return { ...d, naked: true, len: 'long', width: WIDTH.long, lo: r2(clamp(d.lo, 0, 1 - WIDTH.long)), dwell: Math.round(LENGTHS.long * (0.8 + 0.4 * r())), peak: 0, iKind: 'clean', iNoise: 0, iWet: 0,
      blend: Math.round(IKINDS.clean.blend[0] + r() * (IKINDS.clean.blend[1] - IKINDS.clean.blend[0])), iFreeze: false, iPath: IKINDS.clean.path, tweak: {},
      layers: { ...d.layers, drone: 'none', droneLevel: 0, res: 'none', harm: 'none', ghost: 'none', bpm: 0, room: 0 } };
  }
  /** A def turned into the hand's two plans; pure in the def and the seed. */
  function build(d, i) {
    const move = plan({ ...MOVES[0][1], lapMs: d.dwell * 1000 * 0.7, turnMs: 0 },
      { lo: d.lo, hi: d.lo + d.width, seed: seed * 31 + i, laps: 1, from: d.up ? d.lo : d.lo + d.width });
    const iMove = plan({ ...MOVES[0][1], lapMs: (d.blend * 1000) / 4, turnMs: 0 },
      { lo: d.ilo, hi: d.ilo + d.iw, seed: seed * 37 + i, laps: 4 });
    return { ...d, i, id: sceneId(d), move, iMove };
  }
  /** Scene i; `ctx.kind` (speech, field, music) is what its file is, taken when the scene is first made. */
  // the arc's two numbers per scene, from their own draws so they move nothing else in the life
  const arc = (d, i) => { const a = rng(seed * 977 + i * 31); d.dry ??= d.naked ? 1 : r2(0.12 + 0.18 * a()); d.intensity ??= d.naked ? 0 : r2(intensityAt(i, (a() - 0.5) * 0.15)); return d; };
  const scene = (i, ctx) => { while (scenes.length <= i) scenes.push(build(arc(make(scenes.length, scenes.length === i ? ctx : undefined), scenes.length), scenes.length)); return scenes[i]; };
  /** The JSON a vote stores: everything that makes the scene, nothing derived. */
  const defOf = (s) => { const { i, id, move, iMove, ...d } = s; return d; };
  return {
    scene, defOf, taste,
    /** Scene i, `t` seconds after its file landed: what the granulator does and the hand holds. */
    inScene(i, t) {
      const s = scene(i), x = t / s.dwell;
      return { kind: 'scene', i, id: s.id, patch: s.patch, param: s.param, len: s.len, wet: s.peak * (0.6 + 0.4 * (s.intensity ?? 1)) * envelope(x, s.dry ?? 0.2),
        value: fromT(s.param, positionAt(s.move, (x - 0.15) * s.dwell * 1000)), extra: freezesAfterDry(s.patch) ? { freeze: x > (s.dry ?? 0.2) ? 1 : 0 } : {} };
    },
    /** The interlude after scene i, `t` seconds into its blend. */
    inInterlude(i, t) {
      const s = scene(i), x = t / s.blend;
      return { kind: 'interlude', i, id: s.id, patch: s.patch, param: s.iParam, len: `${s.iKind} interlude`, wet: s.iWet * swell(x),
        value: fromT(s.iParam, positionAt(s.iMove, t * 1000)), extra: s.iFreeze ? { freeze: swell(x) } : {} };
    },
  };
}
