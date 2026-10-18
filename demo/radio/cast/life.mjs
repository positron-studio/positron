// demo/radio/cast/life.mjs: the living sound as numbers, no DOM. A scene is one file on the dial: one
// patch, the granulator rising and letting go, ONE movement of the kit's invisible hand (hand.mjs) on
// one control. The blend to the next file is an interlude: lighter, faster, on another control.
// A scene is a plain description (`def`) a vote can carry; votes tilt the picks and liked scenes come
// back as variations. Seeded, so the same seed and votes give the same life.
import { plan, positionAt, rng, MOVES } from '../../shell/hand.mjs';
import { PATCHES, valuesOf } from '../../granulator/grain-ring.mjs';

/** How long the needle stays on a file, by kind, in seconds (the clock's dwell, at most 600). */
export const LENGTHS = { short: 45, mid: 80, long: 150 };
/** Grammar 2 adds a breath: a short light scene after a storm. */
export const LENGTHS2 = { ...LENGTHS, breath: 30 };
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
  // grammar 2 only (odds 0): each scene type names the ones it leaves by. why: plans/plan-cast-patches-scenes.md 3.3
  echowash: { noise: [0, 0], wet: [0.6, 0.8], blend: [10, 18], freeze: false, path: 1, odds: 0 },
  tapestop: { noise: [0, 0], wet: [1, 1], blend: [6, 10], freeze: false, path: 3, odds: 0 },
  frozenbridge: { noise: [0, 0], wet: [0.9, 0.9], blend: [10, 18], freeze: false, path: 3, odds: 0 },
  dronebridge: { noise: [0, 0], wet: [0, 0], blend: [10, 20], freeze: false, path: 3, odds: 0 },
  chordbridge: { noise: [0, 0], wet: [0.2, 0.2], blend: [12, 20], freeze: false, path: 1, odds: 0 },
};
/** The controls a hand may move: range, and whether it reads on a log scale. */
export const MOVABLE = {
  density: [2, 48, true], size: [0.03, 1.2, true], pitch: [0.5, 2, true], speed: [0.25, 2, true],
  tone: [800, 16000, true], scatter: [0, 1, false], echo: [0, 0.75, false], detune: [0, 0.03, false], pan: [0, 1, false],
  // only the spectral family moves jitter, so grammar 1 never draws it
  jitter: [0, 4, false],
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
// a new patch starts from no freeze, no drop, forward, unlocked, so its base's own never leaks in
const full = (set) => ({ freeze: 0, drop: 0, ramp: 0.5, dir: 1, lock: 0, ...set });
// `sub` grains a beat and `beats` of echo: a locked patch's density and time come from the scene's bpm.
// `types` and `lens` narrow where a patch may play. Every amp is a first guess. why: plans/plan-cast-patches-scenes.md 2.3
const MORE = [
  ['drone', 'Sediment', 'Undertow', { size: 2.5, density: 6, pitch: 0.5, speed: 0.25, back: 3, scatter: 0.6, jitter: 1.5, detune: 0.004, pan: 0.7, tone: 900, echo: 0.55, time: 1.1, dark: 600, amp: 1.4 }],
  ['drone', 'Low choir', 'Frozen choir', { freeze: 1, size: 3, density: 5, pitch: 0.5, speed: 0, back: 2, scatter: 0.3, jitter: 0.8, detune: 0.008, pan: 0.9, tone: 1600, echo: 0.4, time: 0.9, dark: 1500, amp: 1.4 }],
  ['drone', 'Fifth below', 'Undertow', { size: 1.8, density: 8, pitch: 0.667, speed: 0.33, back: 2.5, scatter: 0.5, jitter: 1, detune: 0.003, pan: 0.8, tone: 2000, echo: 0.45, time: 0.75, dark: 1200, amp: 1.4 }],
  ['drone', 'Hum', 'Undertow', { size: 4, density: 4, pitch: 0.25, speed: 0.125, back: 4, scatter: 0.4, jitter: 2, detune: 0.002, pan: 0.5, tone: 600, echo: 0.3, time: 1.3, dark: 400, amp: 1.6 }],
  ['drone', 'Breath bed', 'Slow motion', { size: 2, density: 6, pitch: 1, speed: 0.1, back: 1.5, scatter: 0.8, jitter: 1.2, detune: 0.002, pan: 1, tone: 2500, echo: 0.25, time: 0.6, dark: 2000, amp: 1.7 }],
  ['drone', 'Riverbed', 'Undertow', { dir: -1, size: 2.2, density: 7, pitch: 0.5, speed: 0.4, back: 3, scatter: 0.7, jitter: 1.5, detune: 0.005, pan: 0.9, tone: 1100, echo: 0.5, time: 1, dark: 700, amp: 1.4 }],
  ['cloud', 'Mist', 'Cloud', { size: 0.5, density: 24, pitch: 1, speed: 1, back: 2.5, scatter: 1, jitter: 2, detune: 0.006, pan: 1, tone: 5000, echo: 0.35, time: 0.3, dark: 3000, amp: 1.4 }],
  ['cloud', 'Murmur', 'Cloud', { size: 0.3, density: 32, pitch: 1, speed: 0.5, back: 3, scatter: 1, jitter: 3, detune: 0.01, pan: 1, tone: 4000, echo: 0.2, time: 0.25, dark: 2500, amp: 1.4 }],
  ['cloud', 'Haze', 'Cloud', { size: 1, density: 14, pitch: 1, speed: 0.75, back: 1.5, scatter: 0.7, jitter: 0.8, detune: 0.004, pan: 0.8, tone: 3000, echo: 0.5, time: 0.7, dark: 1800, amp: 1.4 }],
  ['cloud', 'Eddy', 'Cloud', { size: 0.6, density: 18, pitch: 1, speed: 1, back: 4, scatter: 0.5, jitter: 3.5, detune: 0.003, pan: 0.9, tone: 6000, echo: 0.3, time: 0.45, dark: 3500, amp: 1.4 }],
  ['cloud', 'Dusk', 'Cloud', { size: 0.9, density: 12, pitch: 0.841, speed: 0.6, back: 2, scatter: 0.8, jitter: 1, detune: 0.005, pan: 0.9, tone: 1800, echo: 0.6, time: 0.8, dark: 1000, amp: 1.4 }],
  ['cloud', 'Rain', 'Cloud', { size: 0.12, density: 40, pitch: 1, speed: 1, back: 3, scatter: 1, jitter: 2.5, detune: 0.01, pan: 1, tone: 7000, echo: 0.15, time: 0.15, dark: 4000, amp: 1.6 }, { types: ['storm'] }],
  ['choir', 'Choir of fifths', 'Shimmer', { size: 0.9, density: 10, pitch: 1.5, speed: 0.25, back: 1.5, scatter: 0.2, jitter: 0.15, detune: 0.004, pan: 0.8, tone: 4500, echo: 0.45, time: 0.6, dark: 2500, amp: 1.4 }],
  ['choir', 'Halo', 'Shimmer', { freeze: 1, size: 1.2, density: 8, pitch: 2, speed: 0, back: 1, scatter: 0.15, jitter: 0.08, detune: 0.006, pan: 0.9, tone: 5000, echo: 0.5, time: 0.5, dark: 3000, amp: 1.3 }],
  ['choir', 'Plainchant', 'Frozen choir', { size: 0.8, density: 12, pitch: 1.335, speed: 0.5, back: 1, scatter: 0.1, jitter: 0.1, detune: 0.002, pan: 0.6, tone: 5000, echo: 0.35, time: 0.75, dark: 2500, amp: 1.4 }],
  ['choir', 'Undersong', 'Frozen choir', { size: 1.4, density: 9, pitch: 0.749, speed: 0.33, back: 2, scatter: 0.25, jitter: 0.3, detune: 0.003, pan: 0.7, tone: 2500, echo: 0.4, time: 0.8, dark: 1500, amp: 1.4 }],
  ['choir', 'Hymn', 'Frozen choir', { freeze: 1, size: 2, density: 8, pitch: 1, speed: 0, back: 1.5, scatter: 0.4, jitter: 0.5, detune: 0.012, pan: 1, tone: 4000, echo: 0.55, time: 0.9, dark: 2200, amp: 1.3 }],
  ['choir', 'Organ', 'Frozen choir', { freeze: 1, size: 0.8, density: 16, pitch: 1, speed: 0, back: 1, scatter: 0, jitter: 0.02, detune: 0, pan: 0.3, tone: 3000, echo: 0.3, time: 0.6, dark: 2000, amp: 1.3 }],
  ['tape', 'Rewind', 'Backwards', { dir: -1, size: 1, density: 5, pitch: 1, speed: 1, back: 2, scatter: 0.2, jitter: 0.2, detune: 0.002, pan: 0.6, tone: 7000, echo: 0.3, time: 0.5, dark: 3500, amp: 1.4 }],
  ['tape', 'Reverse dub', 'Backwards', { dir: -1, size: 0.5, density: 4, pitch: 1, speed: 1, back: 0.8, scatter: 0, jitter: 0.05, detune: 0, pan: 0.5, tone: 3500, echo: 0.65, time: 0.5, dark: 1500, amp: 1.5 }],
  ['tape', 'Worn tape', 'Dub', { drop: 0.15, ramp: 0.08, size: 0.4, density: 12, pitch: 1, speed: 1, back: 0.4, scatter: 0.2, jitter: 0.05, detune: 0.004, pan: 0.4, tone: 3000, echo: 0.2, time: 0.3, dark: 2000, amp: 1.4 }],
  ['tape', 'Slow stop', 'Tape stop', { drop: 1, ramp: 0.1, size: 0.3, density: 24, pitch: 1, speed: 1, back: 0.1, scatter: 0, jitter: 0, detune: 0, pan: 0.2, tone: 8000, echo: 0.15, time: 0.3, dark: 4000, amp: 0.95 }, { lens: ['short', 'mid'] }],
  ['tape', 'Wow', 'Tape stop', { drop: 0.06, ramp: 0.7, size: 0.25, density: 30, pitch: 1, speed: 1, back: 0.15, scatter: 0, jitter: 0, detune: 0.002, pan: 0.3, tone: 6000, echo: 0.1, time: 0.2, dark: 4000, amp: 1 }],
  ['tape', 'Long dub', 'Dub', { drop: 0.03, ramp: 0.1, size: 0.5, density: 3, pitch: 1, speed: 1, back: 1, scatter: 0, jitter: 0.02, detune: 0, pan: 0.9, tone: 2500, echo: 0.8, time: 0.75, dark: 1000, amp: 1.5 }],
  ['tape', 'Reverse swell', 'Backwards', { dir: -1, size: 2.5, density: 2, pitch: 1, speed: 0.5, back: 3, scatter: 0.3, jitter: 0.5, detune: 0.003, pan: 0.8, tone: 5000, echo: 0.4, time: 1.2, dark: 2000, amp: 1.5 }],
  ['rhythmic', 'Pulse', 'Gate', { lock: 1, density: 3, size: 0.18, pitch: 1, speed: 1, back: 0.25, scatter: 0, jitter: 0, detune: 0, pan: 0.3, tone: 6000, echo: 0.3, time: 0.5, dark: 3000, amp: 1.8 }, { sub: 2, beats: 0.75 }],
  ['rhythmic', 'Triplets', 'Gate', { lock: 1, density: 4.5, size: 0.12, pitch: 1, speed: 1, back: 0.5, scatter: 0, jitter: 0.02, detune: 0, pan: 0.6, tone: 5000, echo: 0.25, time: 0.444, dark: 3000, amp: 1.9 }, { sub: 3, beats: 0.667 }],
  ['rhythmic', 'Half time', 'Gate', { lock: 1, density: 1.5, size: 0.6, pitch: 0.749, speed: 0.5, back: 1, scatter: 0, jitter: 0, detune: 0.002, pan: 0.5, tone: 3000, echo: 0.5, time: 0.333, dark: 1500, amp: 1.5 }, { sub: 1, beats: 0.5 }],
  ['rhythmic', 'Shuffle', 'Gate', { lock: 1, density: 6, size: 0.08, pitch: 1, speed: 1, back: 0.1, scatter: 0.15, jitter: 0.01, detune: 0, pan: 0.8, tone: 7000, echo: 0.35, time: 0.5, dark: 4000, drop: 0.2, ramp: 0.375, amp: 2 }, { sub: 4, beats: 0.75, types: ['storm', 'rhythm'], lens: ['mid'] }],
  ['rhythmic', 'Heartbeat', 'Gate', { lock: 1, density: 1.5, size: 0.3, pitch: 0.5, speed: 1, back: 0.3, scatter: 0, jitter: 0, detune: 0, pan: 0, tone: 900, echo: 0.55, time: 0.167, dark: 600, amp: 2 }, { sub: 1, beats: 0.25 }],
  ['rhythmic', 'Pendulum', 'Backwards', { lock: 1, dir: -1, density: 3, size: 0.4, pitch: 1, speed: 1, back: 0.6, scatter: 0, jitter: 0.03, detune: 0, pan: 1, tone: 5000, echo: 0.2, time: 0.667, dark: 2500, amp: 1.6 }, { sub: 2, beats: 1 }],
  ['rhythmic', 'Skip', 'Gate', { lock: 1, density: 6, speed: 0, size: 0.07, pitch: 1, back: 0.07, scatter: 0, jitter: 0, detune: 0, pan: 0.2, tone: 7000, echo: 0.2, time: 0.333, dark: 4000, amp: 1.8 }, { sub: 4, beats: 0.5 }],
  ['glitch', 'Splinter', 'Gate', { size: 0.03, density: 20, pitch: 1, speed: 1, back: 0.5, scatter: 0.3, jitter: 0.1, detune: 0, pan: 0.7, tone: 9000, echo: 0.4, time: 0.0625, dark: 6000, drop: 0.5, ramp: 3, amp: 2.2 }, { lens: ['short'] }],
  ['glitch', 'Crumble', 'Sparks', { size: 0.05, density: 30, pitch: 0.5, speed: 1, back: 2, scatter: 1, jitter: 1, detune: 0.03, pan: 1, tone: 2500, echo: 0.3, time: 0.11, dark: 1500, amp: 2 }],
  ['spectral', 'Smear', 'Frozen choir', { freeze: 1, size: 3.5, density: 6, scatter: 1, jitter: 3, pitch: 1, speed: 0, back: 3, detune: 0.002, pan: 1, tone: 6000, echo: 0.3, time: 1.2, dark: 3000, amp: 1.4 }],
  ['spectral', 'Spectrum', 'Slow motion', { size: 2, density: 10, scatter: 1, jitter: 3.5, pitch: 1, speed: 0.05, back: 4, detune: 0.02, pan: 1, tone: 3500, echo: 0.6, time: 1.4, dark: 1800, amp: 1.4 }],
  ['spectral', 'Prism', 'Frozen choir', { freeze: 1, size: 1.5, density: 12, scatter: 1, jitter: 2, pitch: 1.5, speed: 0, back: 2, detune: 0.002, pan: 1, tone: 5000, echo: 0.45, time: 0.9, dark: 2500, amp: 1.3 }],
  ['spectral', 'Ember', 'Frozen choir', { freeze: 1, size: 2.5, density: 8, scatter: 0.8, jitter: 2, pitch: 0.5, speed: 0, back: 3, detune: 0.004, pan: 0.8, tone: 1200, echo: 0.5, time: 1.1, dark: 800, amp: 1.5 }],
].map(([family, name, base, set, more = {}]) => ({ name, base, family, set: full(set), ...more }));
const FIRST = CAST_PATCHES.length;
CAST_PATCHES.push(...MORE.filter((p) => PATCHES.some((q) => q.name === p.base)));
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
  spectral: { tone: [800, 6000], detune: [0, 0.02], echo: [0, 0.75], pan: [0, 1], jitter: [1, 4], scatter: [0.6, 1] },
};
/** Lengths a family never plays at. */
export const NOT_LEN = { glitch: ['long'], spectral: ['short'] };
export const FAMILY_OF = {
  'Tape stop': 'tape', Dub: 'tape', Backwards: 'tape', Tide: 'tape', Cloud: 'cloud', Fog: 'cloud',
  'Frozen choir': 'choir', Shimmer: 'choir', Glass: 'choir', 'Slow motion': 'drone', Undertow: 'drone', Cathedral: 'drone',
  Gate: 'rhythmic', Stutter: 'rhythmic', Sparks: 'glitch', Swarm: 'glitch',
};
export const familyOf = (name) => FAMILY_OF[name] || CAST_PATCHES.find((p) => p.name === name)?.family || 'cloud';
/** A cast patch's own record (sub, beats, types, lens), or null for a page patch. */
export const patchInfo = (name) => CAST_PATCHES.find((p) => p.name === name) || null;
// grammar 1 plays the 16 patches it always did; grammar 2 every one
const NAMES = [...PATCHES.map((p) => p.name), ...CAST_PATCHES.map((p) => p.name)], NAMES1 = NAMES.slice(0, PATCHES.length + FIRST), PARAMS = Object.keys(MOVABLE), KINDS = Object.keys(LENGTHS);
/** What an engine is handed for a patch name: a page patch's own name, or a cast patch's base and its values. */
export function patchFor(name) {
  const c = CAST_PATCHES.find((p) => p.name === name);
  return c ? { name: c.base, set: { ...c.set } } : { name, set: {} };
}
/** A patch's control values, the cast's included. */
export const patchValues = (name) => { const { name: base, set } = patchFor(name); return { ...valuesOf(PATCHES.find((p) => p.name === base) || PATCHES[0]), ...set }; };
/** How often a scene is naked (no granulator, no layers, no noise), by what its file is: long talk, left to speak. */
export const NAKED = { speech: 0.2, ambiguous: 0.2, unknown: 0.08, field: 0.05, music: 0.05 };
const WIDTH = { short: 0.35, mid: 0.55, long: 0.8, breath: 0.3 };

/** The window (0 to 1, as toT) a patch's family lets the hand use on `param`, or null when it may not move it. */
export function guardT(patch, param) {
  const g = FAMILIES[familyOf(patch)]?.[param];
  if (!g || !MOVABLE[param]) return null;
  const [lo, hi] = MOVABLE[param], a = toT(param, Math.max(lo, g[0])), b = toT(param, Math.min(hi, g[1]));
  return b - a >= 0.05 ? [r2(a), r2(b)] : null;
}
/** The controls a patch's family lets move. */
export const movableFor = (patch) => PARAMS.filter((p) => guardT(patch, p));
/** Grains sounding at once (density times size): the ring's CPU and how it piles up. */
export const overlapOf = (name) => { const v = patchValues(name); return v.density * v.size; };
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
export const envelope = (x, dry = 0.2, rise = 0.18, hold = 0.85) => (x <= dry || x >= 1 ? 0 : Math.min(ease(Math.min(1, (x - dry) / rise)), ease(Math.min(1, (1 - x) / (1 - hold)))));
/**
 * Grammar 2's scene types (plans/plan-cast-patches-scenes.md 3.2): the dry share, the rise, where the release
 * starts, the granulator's peak, the intensity band the tide moves inside, the families and lengths it plays,
 * and the interludes it leaves by.
 */
const TYPE = (o) => o;
export const TYPES = {
  intro: TYPE({ dry: [0.12, 0.2], rise: 0.15, hold: 0.92, peak: [0.75, 0.95], band: [0.6, 0.8], fam: ['choir', 'cloud', 'drone'], lens: ['mid'], outs: ['dissolve', 'filter', 'clean'] }),
  build: TYPE({ dry: [0.06, 0.1], rise: 0.35, hold: 0.9, peak: [0.8, 1], band: [0.6, 0.9], fam: ['drone', 'cloud', 'choir'], lens: ['long'], outs: ['echowash', 'dronebridge', 'smear'] }),
  deep: TYPE({ dry: [0.04, 0.08], rise: 0.15, hold: 0.9, peak: [0.9, 1], band: [0.8, 1], fam: ['drone', 'spectral'], lens: ['long'], outs: ['dronebridge', 'frozenbridge'] }),
  storm: TYPE({ dry: [0.05, 0.05], rise: 0.1, hold: 0.85, peak: [1, 1], band: [0.85, 1], fam: ['cloud', 'glitch', 'spectral'], lens: ['short', 'mid'], outs: ['tapestop', 'pause', 'smear'] }),
  rhythm: TYPE({ dry: [0.06, 0.06], rise: 0.12, hold: 0.88, peak: [0.8, 1], band: [0.6, 0.9], fam: ['rhythmic', 'tape'], lens: ['mid'], outs: ['tapestop', 'filter'] }),
  choir: TYPE({ dry: [0.06, 0.1], rise: 0.25, hold: 0.88, peak: [0.8, 1], band: [0.6, 0.9], fam: ['choir', 'spectral'], lens: ['mid', 'long'], outs: ['chordbridge', 'frozenbridge', 'dissolve'] }),
  breath: TYPE({ dry: [0.1, 0.1], rise: 0.2, hold: 0.6, peak: [0.6, 0.8], band: [0.4, 0.6], fam: ['drone', 'cloud'], lens: ['breath'], outs: ['dissolve', 'pause'] }),
  coda: TYPE({ dry: [0.05, 0.05], rise: 0.2, hold: 0.5, peak: [0.9, 0.9], band: [0.5, 0.8], fam: ['drone', 'spectral'], lens: ['long'], outs: ['pause', 'dronebridge'] }),
};
// the same types narrowed to one family, as a section asks for them
TYPES.tapebuild = { ...TYPES.build, fam: ['tape'] };
TYPES.cloudbuild = { ...TYPES.build, fam: ['cloud'] };
TYPES.sdeep = { ...TYPES.deep, fam: ['spectral'] };
for (const [k, v] of Object.entries(TYPES)) v.name = k;
/**
 * Sections: an order of types, and how intense the section is as a whole (what the tide is matched to).
 * `open` is a dry intro; `stormy` a storm or a rhythmic scene.
 */
export const SECTIONS = {
  arrival: { types: ['intro', 'build', 'deep', 'coda'], level: 0.55 },
  weather: { types: ['intro', 'cloudbuild', 'storm', 'stormy', 'breath'], level: 0.85 },
  ritual: { types: ['intro', 'rhythm', 'rhythm', 'choir', 'coda'], level: 0.6 },
  chapel: { types: ['open', 'choir', 'deep', 'breath'], level: 0.35 },
  tape: { types: ['intro', 'tapebuild', 'rhythm', 'coda'], level: 0.55 },
  night: { types: ['deep', 'sdeep', 'breath'], level: 0.8 },
};
/** The tide: the piece's intensity over this many planned seconds, low to high and back. */
export const TIDE_S = 3600;
export const tideOf = (t, phase = 0) => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / TIDE_S + phase);
/** The families that smooth a clicking file, and what its sharp scene types become. */
export const SMOOTH = ['drone', 'choir', 'spectral'];
export const SHARP_TYPES = { storm: 'deep', rhythm: 'choir', tapebuild: 'build', cloudbuild: 'build' };
/** No patch has more grains sounding at once than this. */
export const OVERLAP_CAP = 24;
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
// grammar 2 also learns the scene type, the patch's family and how long the scene stays dry
const FEATURES2 = [...FEATURES,
  [2, (a, b) => (a.type && a.type === b.type ? 1 : 0)],
  [2, (a, b) => (familyOf(a.patch) === familyOf(b.patch) ? 1 : 0)],
  [1, (a, b) => (a.dry != null && b.dry != null ? kern(a.dry, b.dry, 0.1) : 0)],
];
// The scale the weighted sum is read against: the weights before the layers, so adding a feature adds
// to what the votes can say rather than thinning every other feature.
const FEATURE_NORM = 10.7;
/**
 * What the votes say about a scene, -1 to 1: per feature, the mean vote (as -1 to 1) of the voted scenes
 * that share it, shrunk toward 0 when few do; then the features' weighted sum over FEATURE_NORM. 0 with no votes.
 */
export function prefer(d, said, features = FEATURES) {
  let s = 0;
  for (const [w, m] of features) {
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
export function createLife({ seed = 1, votes = [], grammar = 2 } = {}) {
  const G2 = grammar === 2;
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
  /** The patches a scene type may play: its families, the patch's own types and lengths, under the overlap cap. */
  const poolFor = (T) => NAMES.filter((n) => { const f = patchInfo(n); return T.fam.includes(familyOf(n)) && (!f?.types || f.types.includes(T.name))
    && (!f?.lens || f.lens.some((l) => T.lens.includes(l))) && overlapOf(n) <= OVERLAP_CAP; });
  const lensOf = (T, patch, notLen) => {
    const f = patchInfo(patch), ok = (k) => k !== notLen && !NOT_LEN[familyOf(patch)]?.includes(k) && (!f?.lens || f.lens.includes(k));
    const ks = T.lens.filter(ok);
    const any = Object.keys(LENGTHS).filter((k) => k !== notLen);
    return ks.length ? ks : Object.keys(LENGTHS).filter(ok).length ? Object.keys(LENGTHS).filter(ok) : any;
  };
  function fresh(r, prev, recent, i, T) {
    // a patch with at least two controls not moved lately, one for the scene and one for its interlude
    const free = (n) => movableFor(n).filter((p) => !recent.includes(p)).length >= 2, pool = (T ? poolFor(T) : NAMES1).filter((n) => n !== prev?.patch);
    const patch = pickOne(pool.filter(free).length ? pool.filter(free) : pool, r), can = movableFor(patch);
    const param = pickOne(can.filter((p) => !recent.includes(p)).length ? can.filter((p) => !recent.includes(p)) : can, r);
    const same = i >= 2 && prev.len === scenes[i - 2].len, len = pickOne(T ? lensOf(T, patch, same ? prev.len : null) : lensFor(patch, same ? prev.len : null), r);
    const centre = toT(param, patchValues(patch)[param] ?? fromT(param, 0.5));
    // the window sits near where the patch has the control, give or take, inside the family's guard
    return { patch, param, len, ...windowOf(patch, param, len, centre, (r() - 0.5) * 0.3) };
  }
  /** A liked scene with one thing changed: its length, where its window sits, or its interlude. */
  function vary(base, r, prev, recent, i, T) {
    if (T && (!poolFor(T).includes(base.patch) || !lensOf(T, base.patch, null).includes(base.len))) return null;
    if (base.patch === prev?.patch || recent.includes(base.param) || !LENGTHS2[base.len] || !guardT(base.patch, base.param)
      || movableFor(base.patch).filter((p) => p !== base.param && !recent.includes(p)).length < 1) return null;
    const same = i >= 2 && prev.len === scenes[i - 2].len;
    const [g0, g1] = guardT(base.patch, base.param), w0 = r2(WIDTH[base.len] * (g1 - g0));
    const d = { patch: base.patch, param: base.param, len: base.len, lo: r2(clamp(base.lo, g0, g1 - w0)), width: w0, tweak: { ...(base.tweak || {}) }, peak: base.peak,
      iKind: IKINDS[base.iKind] ? base.iKind : undefined, key: base.key ? { ...base.key } : undefined, layers: base.layers ? { ...base.layers } : undefined };
    const what = same && base.len === prev.len ? 0 : r() * (d.layers ? 4 / 3 : 1);
    if (what >= 1) { const k = pickOne(['drone', 'res', 'harm', 'ghost'], r); d.layers[k] = pickOne(LAYERS[k].filter((x) => x !== d.layers[k]), r); }
    else if (what < 1 / 3) { d.len = pickOne((T ? lensOf(T, d.patch, null) : lensFor(d.patch, null)).filter((k) => k !== base.len && !(same && k === prev.len)), r) ?? d.len; d.width = r2(WIDTH[d.len] * (g1 - g0)); d.lo = r2(clamp(d.lo, g0, g1 - d.width)); }
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
  function complete(d, r, recent, prev, T) {
    d.dwell = Math.round(LENGTHS2[d.len] * (0.8 + 0.4 * r()));
    if (T) { if (!(d.peak >= T.peak[0] && d.peak <= T.peak[1])) d.peak = r2(T.peak[0] + (T.peak[1] - T.peak[0]) * r()); } else d.peak ??= r2(0.7 + 0.3 * r());
    // never the same kind of interlude twice in a row; a filter hand-over needs tone free for its hand
    const tone = [d.param, d.notI, ...recent].includes('tone') || !guardT(d.patch, 'tone');
    // grammar 2: the type's own ways out, and the dial's sweep only between sections, rarely
    const outs = T ? [...T.outs, ...(d.secLast ? ['radio'] : [])] : Object.keys(IKINDS), odds = (k) => (T ? (k === 'radio' ? 0.15 : 1) : IKINDS[k].odds);
    if (!d.iKind || d.iKind === prev?.iKind || (tone && IKINDS[d.iKind]?.param) || (T && !outs.includes(d.iKind))) {
      const can = outs.filter((k) => k !== prev?.iKind && k !== d.notKind && !(tone && IKINDS[k].param));
      d.iKind = can.length ? weighted(can, odds, r) : 'dissolve';
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
    if (d.iKind === 'echowash') d.iTime = r2(0.9 + 0.4 * r());
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
  const learned = (d) => (said.length ? prefer(d, said, G2 ? FEATURES2 : FEATURES) : 0);
  /** A fresh set of layers, with odds by what the file is (ODDS). */
  function layersOf(r, kind) {
    const o = ODDS[kind] || ODDS.unknown, some = (k) => (r() < o[k] ? pickOne(LAYERS[k].slice(1), r) : 'none');
    const pulse = r() < o.pulse;
    // a drone in nearly every scene, and both kinds at once as often as either alone
    const drone = r() < o.drone ? pickOne(['freeze', 'key', 'both', 'both'], r) : 'none';
    return { drone, droneLevel: r2(G2 ? 0.45 + 0.25 * r() : 0.3 + 0.3 * r()), droneOct: r() < 0.5 ? -1 : -2,
      res: some('res'), resDecay: r2(0.5 + 3.5 * r()), resWet: r2(0.15 + 0.35 * r()),
      harm: some('harm'), harmSpread: r2(r()),
      ghost: some('ghost'), ghostEvery: Math.round(20 + 40 * r()), ghostLen: Math.round(8 + 7 * r()), ghostSide: r() < 0.5 ? 'next' : 'prev', ghostLevel: r2(0.15 + 0.15 * r()),
      bpm: pulse ? Math.round(60 + 60 * r()) : 0, pattern: pickOne(LAYERS.pulse, r), pulseOn: pickOne(kind === 'speech' ? LAYERS.pulseOn : LAYERS.pulseOn.slice(0, 2), r),
      room: r2(0.1 + 0.3 * r()), roomSize: r2(0.4 + 0.5 * r()) };
  }
  function make(i, ctx = {}) {
    if (G2) return make2(i, ctx);
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
  // ── grammar 2: sections of scene types over a tide (plans/plan-cast-patches-scenes.md 3 and 4) ──
  const secs = [], phase = rng(seed * 613)() * 2 * Math.PI;
  /** The tide at scene i, from the planned time before it: pure in the seed, so a twin rebuilds it. */
  const tideAt = (i) => tideOf(scenes.slice(0, i).reduce((a, x) => a + x.dwell + x.blend, 0), phase);
  const secScore = {};
  for (const v of said) if (v.def.section) secScore[v.def.section] = (secScore[v.def.section] || 0) + v.s;
  const secWeight = (n) => { const x = secScore[n] || 0; return Math.exp((2 * x) / (Math.abs(x) + 4)); };
  function sectionAt(i) {
    if (secs[i]) return secs[i];
    const r = rng(seed * 8191 + i * 131), tide = tideAt(i), before = i ? secs[i - 1]?.section : null;
    const names = Object.keys(SECTIONS).filter((n) => n !== before && (n !== 'weather' || tide > 0.5));
    const name = weighted(names, (n) => Math.exp(-(((SECTIONS[n].level - tide) / 0.3) ** 2)) * secWeight(n), r);
    const list = [...SECTIONS[name].types], m = Math.floor(list.length / 2), u = r();
    if (u < 0.3 && list.length > 3) list.splice(m, 1); else if (u < 0.6 && list.length < 6) list.splice(m, 0, list[m]);
    list.forEach((type, k) => { secs[i + k] = { section: name, type, pos: k, last: k === list.length - 1, tide }; });
    return secs[i];
  }
  function make2(i, ctx = {}) {
    const prev = scenes[i - 1], r = rng(seed * 7919 + i * 104729), kind = ctx.kind || 'unknown', at = sectionAt(i);
    const recent = scenes.flatMap((x) => [x.param, x.iParam]).slice(-FRESH);
    // no naked speech: the owner does not want it (2026-10-18), so a section opens on a dry intro
    let type = at.type === 'open' ? 'intro' : at.type === 'stormy' ? (r() < 0.5 ? 'storm' : 'rhythm') : at.type;
    // a file with clicks in it (`soft`, the soften stage's files: Kalle, Kalle 2, Driving along) gets long
    // smooth grains only: echoes, chops and glitches repeat its clicks. why: lessons/workers-cast.md#soft-files
    if (ctx.soft && SHARP_TYPES[type]) type = SHARP_TYPES[type];
    const T = ctx.soft ? { ...TYPES[type], fam: TYPES[type].fam.filter((f) => SMOOTH.includes(f)).length ? TYPES[type].fam.filter((f) => SMOOTH.includes(f)) : ['drone', 'choir'] } : TYPES[type];
    const cands = [];
    for (let k = 0; k < CANDIDATES; k++) cands.push(fresh(r, prev, recent, i, T));
    for (let k = 0; taste.liked.length && !prev?.from && k < VARIATIONS; k++) { const v = vary(weighted(taste.liked, (e) => e.score, r).def, r, prev, recent, i, T); if (v) cands.push(v); }
    for (const c of cands) Object.assign(c, { kind, type, section: at.section, secLast: at.last, ...(ctx.soft ? { soft: true } : {}) });
    const ok = cands.map((c) => complete(c, r, recent, prev, T)).filter((c) => !taste.disliked.includes(coreId(c)) && !ducks(c));
    const d = weighted(ok.length ? ok : cands, (x) => Math.exp(LEAN * learned(x)), r);
    const a = rng(seed * 977 + i * 31), within = ([lo, hi]) => lo + (hi - lo) * a();
    const Tt = TYPES[d.type];
    d.dry = r2(within(Tt.dry)); d.rise = Tt.rise; d.hold = Tt.hold; d.tide = r2(tideAt(i));
    // inside its type's band by the tide, and the whole band a little lower at low tide
    d.intensity = r2(clamp((Tt.band[0] + (Tt.band[1] - Tt.band[0]) * d.tide) * (0.85 + 0.15 * d.tide) + (a() - 0.5) * 0.15, 0, 1));
    d.layers = typeLayers(d.layers, Tt, rng(seed * 2741 + i * 59));
    // a locked patch plays on the scene's tempo: so many grains a beat, its echo so many beats
    const f = patchInfo(d.patch);
    if (f?.sub) {
      if (!d.layers.bpm) d.layers = { ...d.layers, bpm: Math.round(70 + 40 * a()), pulseOn: 'grains' };
      d.set = { density: r2((d.layers.bpm / 60) * f.sub * 1000) / 1000, time: Math.round((f.beats * 60 / d.layers.bpm) * 1000) / 1000 };
    }
    // the key the scene after this one starts in, drawn now so a bridge can glide or pivot to it
    if (prev?.nextKey) d.key = { ...prev.nextKey };
    const kr = rng(seed * 523 + i * 17), move = pickOne([0, 7, 5, 2, 10], kr);
    d.nextKey = { root: (d.key.root + move) % 12, minor: kr() < 0.6 };
    return d;
  }
  /** A type's layers over the drawn ones: what each type keeps, adds and leaves out. */
  function typeLayers(L, T, r) {
    const n = T.name.replace(/^(tape|cloud)build$/, 'build').replace(/^sdeep$/, 'deep'), ghost = () => pickOne(['res', 'comb', 'bpf'], r);
    const none = { res: 'none', harm: 'none', ghost: 'none', bpm: 0 };
    switch (n) {
      // speech as an instrument from the start: sung through resonators over a full drone, never plain talk
      case 'intro': return { ...L, ...none, drone: 'both', droneLevel: r2(0.45 + 0.15 * r()), res: pickOne(['fifths', 'major', 'minor7'], r), harm: r() < 0.5 ? 'octfifth' : 'none', room: r2(0.2 + 0.2 * r()) };
      case 'build': return { ...L, drone: L.drone === 'none' ? 'key' : L.drone };
      case 'deep': return { ...L, drone: 'both', droneLevel: r2(0.4 + 0.2 * r()), res: pickOne(['fifths', 'minor7'], r), harm: pickOne(['none', 'octfifth'], r), bpm: 0,
        ghost: ghost(), ghostLevel: r2(0.25 + 0.15 * r()), ghostEvery: Math.round(25 + 20 * r()), room: r2(0.3 + 0.2 * r()) };
      case 'storm': return { ...L, drone: pickOne(['none', 'freeze'], r), res: 'none', harm: pickOne(['cluster', 'none'], r), bpm: 0,
        ghost: ghost(), ghostLevel: r2(0.25 + 0.15 * r()), ghostEvery: Math.round(15 + 15 * r()), room: 0.3 };
      case 'rhythm': return { ...L, drone: 'key', bpm: Math.round(70 + 40 * r()), pattern: pickOne(LAYERS.pulse, r), pulseOn: pickOne(['res', 'grains'], r),
        res: L.res === 'none' ? pickOne(['fifths', 'minor7', 'major'], r) : L.res };
      case 'choir': return { ...L, drone: 'key', harm: pickOne(['octfifth', 'triad'], r), res: pickOne(['major', 'minor7'], r), bpm: 0 };
      case 'breath': return { ...L, ...none, drone: L.drone === 'none' ? 'key' : L.drone, droneLevel: r2(0.45 + 0.15 * r()) };
      case 'coda': return { ...L, ...none, drone: pickOne(['freeze', 'both'], r), room: r2(0.4 + 0.1 * r()) };
      default: return L;
    }
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
  /**
   * What an interlude does at x (0 to 1 of its blend): the granulator's wet and extra values, and for a
   * bridge the layers held across it (`level` of them, retuned to the next scene's key from halfway).
   */
  function shapeOf(s, x) {
    const L = s.layers || {}, key2 = x < 0.5 ? s.key : s.nextKey || s.key, quiet = { harm: 'none', ghost: 'none', bpm: 0 };
    switch (s.iKind) {
      case 'echowash': return { wet: s.iWet * swell(x), extra: { echo: 0.85, time: s.iTime ?? 1.1, dark: 2500, scatter: 1, size: 1 },
        bridge: { level: 0.3, key: s.key, layers: { ...L, ...quiet, res: 'none', room: 0.8, roomSize: 0.95 } } };
      case 'tapestop': { const e = ease(Math.min(1, x / 0.4));
        return { wet: x < 0.1 ? x / 0.1 : x < 0.45 ? 1 : Math.max(0, 1 - (x - 0.45) / 0.2), extra: { pitch: r2(1 - 0.75 * e), speed: r2(1 - e), freeze: x > 0.35 ? 1 : 0 } }; }
      case 'frozenbridge': return { wet: s.iWet * (x < 0.1 ? x / 0.1 : x < 0.7 ? 1 : Math.max(0, (1 - x) / 0.3)), extra: { freeze: 1, size: 1.5, density: 12, scatter: 0.6 } };
      case 'dronebridge': return { wet: 0, extra: {}, bridge: { level: 0, key: key2, layers: { ...L, ...quiet, res: 'none', drone: L.drone === 'none' ? 'key' : L.drone, droneLevel: 0.5 } } };
      case 'chordbridge': return { wet: s.iWet * swell(x), extra: {}, bridge: { level: 0.4, key: key2, layers: { ...L, ...quiet, res: L.res === 'none' ? 'major' : L.res, resWet: 0.5 } } };
      case 'pause': return { wet: 0, extra: {}, bridge: { level: 0, key: s.key, layers: { ...L, ...quiet, res: 'none', drone: 'none', droneLevel: 0 } } };
      default: return { wet: s.iWet * swell(x), extra: s.iFreeze ? { freeze: swell(x) } : {} };
    }
  }
  /** The JSON a vote stores: everything that makes the scene, nothing derived. */
  const defOf = (s) => { const { i, id, move, iMove, ...d } = s; return d; };
  return {
    scene, defOf, taste,
    /** Scene i, `t` seconds after its file landed: what the granulator does and the hand holds. */
    inScene(i, t) {
      const s = scene(i), x = t / s.dwell;
      return { kind: 'scene', i, id: s.id, patch: s.patch, param: s.param, len: s.len, wet: s.peak * (0.6 + 0.4 * (s.intensity ?? 1)) * envelope(x, s.dry ?? 0.2, s.rise, s.hold),
        value: fromT(s.param, positionAt(s.move, (x - 0.15) * s.dwell * 1000)), extra: freezesAfterDry(s.patch) ? { freeze: x > (s.dry ?? 0.2) ? 1 : 0 } : {} };
    },
    /** The interlude after scene i, `t` seconds into its blend. */
    inInterlude(i, t) {
      const s = scene(i), x = t / s.blend, sh = shapeOf(s, Math.min(1, Math.max(0, x)));
      return { kind: 'interlude', i, id: s.id, patch: s.patch, param: s.iParam, len: `${s.iKind} interlude`, wet: sh.wet,
        value: fromT(s.iParam, positionAt(s.iMove, t * 1000)), extra: sh.extra, ...(sh.bridge ? { bridge: sh.bridge } : {}) };
    },
  };
}
