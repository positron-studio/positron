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
export const INTERLUDE = [4, 20];
/**
 * What an interlude sounds like, by kind: the tuning noise (the clock's `noise`, 0 to 2), how far the
 * granulator swells, how long the blend is, and whether the granulator freezes the outgoing file.
 * radio is the dial's hiss, smear carries a frozen grain cloud across, clean is a plain short fade,
 * drift a little of both.
 */
export const IKINDS = {
  radio: { noise: [0.7, 1.4], wet: [0.08, 0.2], blend: [10, 20], freeze: false },
  smear: { noise: [0, 0.12], wet: [0.45, 0.75], blend: [8, 18], freeze: true },
  clean: { noise: [0, 0.05], wet: [0, 0.08], blend: [4, 8], freeze: false },
  drift: { noise: [0.25, 0.5], wet: [0.2, 0.4], blend: [8, 16], freeze: false },
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
  speech: { drone: 0.8, res: 0.7, harm: 0.6, ghost: 0.6, pulse: 0.3 },
  field: { drone: 0.8, res: 0.6, harm: 0.35, ghost: 0.6, pulse: 0.4 },
  music: { drone: 0.6, res: 0.35, harm: 0.4, ghost: 0.5, pulse: 0.5 },
};
ODDS.unknown = ODDS.speech;
/** Each scene is picked from this many new candidates plus up to VARIATIONS of liked scenes. */
export const CANDIDATES = 12, VARIATIONS = 4;
/** How hard the pick leans toward what the votes liked: the best candidate at most e^LEAN times the worst. */
export const LEAN = 10;
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
const peakT = (d) => ((d.peak ?? 0.7) - 0.55) / 0.35;
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
    const d = { patch: base.patch, param: base.param, len: base.len, lo: base.lo, width: base.width ?? WIDTH[base.len], tweak: { ...(base.tweak || {}) }, peak: base.peak,
      iKind: IKINDS[base.iKind] ? base.iKind : undefined, key: base.key ? { ...base.key } : undefined, layers: base.layers ? { ...base.layers } : undefined };
    const what = same && base.len === prev.len ? 0 : r() * (d.layers ? 4 / 3 : 1);
    if (what >= 1) { const k = pickOne(['drone', 'res', 'harm', 'ghost'], r); d.layers[k] = pickOne(LAYERS[k].filter((x) => x !== d.layers[k]), r); }
    else if (what < 1 / 3) { d.len = pickOne(KINDS.filter((k) => k !== base.len && !(same && k === prev.len)), r); d.width = WIDTH[d.len]; d.lo = r2(clamp(d.lo, 0, 1 - d.width)); }
    else if (what < 2 / 3) {
      const step = (r() < 0.5 ? -1 : 1) * (0.08 + 0.1 * r());
      d.lo = r2(clamp(d.lo + step, 0, 1 - d.width));
      if (d.lo === base.lo) d.lo = r2(clamp(base.lo - step, 0, 1 - d.width));
    } else { d.notI = base.iParam; d.notKind = base.iKind; delete d.iKind; }
    d.from = sceneId(base);
    return d;
  }
  /** The rest of a scene: its time, its granulator, its interlude, and two other controls set aside the patch. */
  function complete(d, r, recent, prev) {
    d.dwell = Math.round(LENGTHS[d.len] * (0.8 + 0.4 * r()));
    d.peak ??= r2(0.55 + 0.35 * r());
    d.iParam = pickOne(PARAMS.filter((p) => ![...recent, d.param, d.notI].includes(p)), r);
    delete d.notI;
    // never the same kind of interlude twice in a row
    if (!d.iKind || d.iKind === prev?.iKind) d.iKind = pickOne(Object.keys(IKINDS).filter((k) => k !== prev?.iKind && k !== d.notKind), r);
    delete d.notKind;
    const K = IKINDS[d.iKind], within = ([a, b]) => a + r() * (b - a);
    d.blend = Math.round(within(K.blend));
    d.iNoise = r2(within(K.noise));
    d.iWet = r2(within(K.wet));
    d.iFreeze = K.freeze;
    d.ilo = r2(0.4 * r()); d.iw = 0.25;
    d.up = r() < 0.5;
    if (!d.tweak || !Object.keys(d.tweak).length) {
      d.tweak = {};
      for (const k of PARAMS.filter((p) => p !== d.param && p !== d.iParam).sort(() => r() - 0.5).slice(0, TWEAKS)) d.tweak[k] = r2(r());
    }
    for (const k of Object.keys(d.tweak)) if (k === d.param || k === d.iParam) delete d.tweak[k];
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
    return { drone: some('drone'), droneLevel: r2(0.15 + 0.25 * r()), droneOct: r() < 0.5 ? -1 : -2,
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
    const ok = cands.map((d) => complete(Object.assign(d, { kind }), r, recent, prev)).filter((d) => !taste.disliked.includes(coreId(d)));
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
  /** Scene i; `ctx.kind` (speech, field, music) is what its file is, taken when the scene is first made. */
  const scene = (i, ctx) => { while (scenes.length <= i) scenes.push(build(make(scenes.length, scenes.length === i ? ctx : undefined), scenes.length)); return scenes[i]; };
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
      return { kind: 'interlude', i, id: s.id, patch: s.patch, param: s.iParam, len: `${s.iKind} interlude`, wet: s.iWet * swell(x),
        value: fromT(s.iParam, positionAt(s.iMove, t * 1000)), extra: s.iFreeze ? { freeze: swell(x) } : {} };
    },
  };
}
