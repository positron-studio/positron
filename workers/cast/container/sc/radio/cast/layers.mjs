// demo/radio/cast/layers.mjs: the layers a live scene carries over the file (plans/plan-cast-reinterpret.md
// section 2), as numbers. This half is pure: a key and a chord into frequencies, a voicing into pitch
// ratios, a pulse into hits. The SuperCollider programs that sound them are below the line.

import { compile } from '../../shell/sclang-lite.mjs';

/** Semitones above the root, by chord: what the resonators ring at and the drone holds. */
export const CHORDS = {
  fifths: [0, 7, 12, 19],
  minor7: [0, 3, 7, 10],
  major: [0, 4, 7, 11],
  cluster: [0, 1, 2, 5],
};
/** Semitones each harmonizer voice is moved by, by voicing; the dry voice is not one of them. Every voice is under the
 *  speaker, never above: a voice pitched up is a duck, and not respectful to whoever spoke (2026-10-19). */
export const VOICINGS = {
  octfifth: [-12, -5, -19],
  triad: [-12, -8, -5],
  quartal: [-5, -10, -15],
  cluster: [-1, -2, -3],
};
/** The lowest note the drone and resonators are built on: C2, 65.41 Hz. */
export const BASE_HZ = 65.406;

export const hz = (semis) => BASE_HZ * 2 ** (semis / 12);
/** A scene key's chord across `octaves`, in Hz, low to high; minor keys turn a major third minor. */
export function chordHz(key, kind, { octaves = 3, from = 1 } = {}) {
  const tones = (CHORDS[kind] || CHORDS.fifths).map((t) => (key?.minor && t === 4 ? 3 : t));
  const out = [];
  for (let o = from; o < from + octaves; o++) for (const t of tones) out.push(hz((key?.root ?? 0) + 12 * o + t));
  return out.sort((a, b) => a - b);
}
/** The drone's three notes: root, fifth and root again, `oct` octaves below the middle register. */
export const droneHz = (key, oct = -1) => [0, 7, 12].map((t) => hz((key?.root ?? 0) + 12 * (2 + oct) + t));
/** The harmonizer's pitch ratios, spread 0 to 1 widening a cluster's semitones into cents and back. */
export function harmRatios(voicing, spread = 0.5) {
  const v = VOICINGS[voicing];
  if (!v) return [];
  return v.map((s) => 2 ** ((voicing === 'cluster' ? s * (0.3 + 0.7 * spread) : s) / 12));
}
/** A euclidean rhythm: `k` hits spread as evenly as they go over `n` steps (Bjorklund by rounding). */
export function euclid(k, n) {
  return Array.from({ length: n }, (_, i) => Math.floor(((i + 1) * k) / n) - Math.floor((i * k) / n) === 1);
}
/** Seconds of each step at a tempo, when the pattern counts eighths (n 8) or sixteenths (n 16), or beats. */
export const stepSeconds = (bpm, n) => 60 / bpm / (n === 16 ? 4 : n === 8 ? 2 : 1);

const ease = (u) => u * u * (3 - 2 * u);
/** The layers' level at `x` of a scene (0 to 1): silent to 12 %, rising to 30 %, falling from 80 % to silent at 95 %. */
/** The layers follow the scene's arc: silent through its dry share, up over 0.18, down from 0.85 to 0.97. */
export const layerLevel = (x, dry = 0.12, rise = 0.18, hold = 0.85) => (x < dry ? 0 : Math.min(ease(Math.min(1, (x - dry) / rise)), ease(Math.min(1, Math.max(0, (0.97 - x) / Math.max(0.01, 0.97 - hold))))));
/** The layers' level at `x` of scene `s`: its arc and intensity, pushed toward full by its soak (and by `more`, the
 *  page's own slider), and up to about 3.5 dB louder at full: the drivers on the page and in the container call this. */
// the layers never fall below CARRY, at a scene's end, through the blend or in the next one's opening, so a scene change
// does not drop the effects: *"when i push next scene ... do you drop fx?"* (2026-10-19); the pitches glide meanwhile.
// 0.2, not 0.45: at 0.45 the effects never breathed out and the stream tired (*"lower the floor?"*, same day)
export const CARRY = 0.2, PUSH_TO = 0.75;
/** Every level the drivers set is this much of it: with the granulator's WET_CAP, the composition sounds as the page's
 *  slider did at 0.4 (*"on 0.4 its more toreable"*, 2026-10-19). */
export const LAYER_SCALE = 0.8, DRONE_TRIM = 0.7;
/** The layers' level through a blend: the bridge's, never under CARRY. Both drivers call this. */
export const blendLevel = (bridge) => Math.max(bridge?.level ?? 0, CARRY) * LAYER_SCALE;
export const sceneLevel = (x, s, more = 0) => {
  // a drier scene (soak under 0) keeps its layers down by as much and is never pushed; a wetter one is pushed toward full
  const sk = s?.soak ?? 0, p = 1 - (1 - Math.max(0, sk)) * (1 - more);
  const lv = Math.max(CARRY, layerLevel(x, s.dry, s.rise, s.hold)) * (0.6 + 0.4 * (s.intensity ?? 1)) * (1 + Math.min(0, sk));
  // a push lifts toward 0.75 and never past it, with no boost: at full it was too much (*"again too much"*, 2026-10-19)
  return (lv < PUSH_TO ? lv + (PUSH_TO - lv) * p : lv) * LAYER_SCALE;
};
/** The key is heard in these seconds of a scene, over these frequencies: a chroma of what the tuner makes. */
export const KEY_FROM = [1, 5], KEY_HZ = [60, 1000];
/** A frequency's pitch class, 0 C to 11 B, on BASE_HZ. */
export const pitchClass = (f) => ((Math.round(12 * Math.log2(f / BASE_HZ)) % 12) + 12) % 12;

// ── the programs that sound them, in the scsynth the grain ring runs in ──────────────────────────────
// The layers read the tuner on busses 2 and 3 and the ghost player on 4 and 5, write to the private
// pair 8 and 9, and the room reads that pair and writes the output. sclang-lite has no array controls,
// so a chord is f0 to f11. why: lessons/workers-cast.md#layers

export const LAYER_BUS = 8, DRONE_BUS = 10, RES_N = 12, GHOST_N = 4;
/** A ghost arrives at its own pitch: a person's recording is never transposed, up or down. why: plans/plan-cast-listenable.md */
export const GHOST_SHIFTS = [1];
/** Where in the visiting file a ghost starts: in its middle half, at least 20 s before its end; 20 to 200 s in when its
 *  length is unknown. Both engines (*"does ghosts tart from beginning. maybe in middle?"*, 2026-10-19). */
export const ghostFrom = (seconds, rnd) => (Number(seconds) > 40 ? Math.min(Number(seconds) * (0.25 + 0.5 * rnd), Number(seconds) - 20) : Number(seconds) > 0 ? 0 : 20 + 180 * rnd);
/** Seconds between ghost visits: the scene's own gap, shorter on a long file (300 s is as drawn), 0.5 to 1.5 times. */
export const ghostGap = (L, seconds) => (L?.ghostEvery ?? 40) * (Number(seconds) > 0 ? Math.min(1.5, Math.max(0.5, 300 / Number(seconds))) : 1);
/** The drones stay up across scenes and glide to the next key; the other layers fade with each scene. */
export const DRONES = ['ldrone', 'lfreeze'];
// a pitch the layers move glides like a voice sliding to a note: three Lags in a row start slowly, move and settle (Lag3,
// which sclang-lite does not have); one Lag alone does half its move in the first tenth of its time
const glide = (x, t) => `Lag.kr(Lag.kr(Lag.kr(${x}, ${t}), ${t}), ${t})`;
const fs = (n, from = 0) => Array.from({ length: n }, (_, i) => glide(`\\f${from + i}.kr(${110 * (i + 1)})`, 2));
export const PROGRAMS = {
  // three saws on root, fifth and octave, never still: the low-pass sweeps slowly over three octaves, each
  // saw's shape drifts, and the octave wanders up to a semitone either side, so the drone changes over a minute
  ldrone: `{ var amp = Lag.kr(\\amp.kr(0), 4);
  var cut = \\cut.kr(500) * (1 + (LFNoise2.kr(0.02) * 0.85)) * (1 + (LFNoise2.kr(0.11) * 0.2));
  var w = (LFNoise2.kr(0.04) * 0.35) + 0.5;
  var s = (VarSaw.ar(${glide('\\f0.kr(55)', 8)}, 0, w * 0.6) + (VarSaw.ar(${glide('\\f1.kr(82)', 8)} * (1 + (LFNoise2.kr(0.015) * 0.012)), 0, w) * 0.7) + (VarSaw.ar(${glide('\\f2.kr(110)', 8)} * (1.003 + (LFNoise2.kr(0.02) * 0.06)), 0, 1 - w) * 0.5)) * 0.25;
  Pan2.ar(RLPF.ar(s, cut, 0.35 + ((LFNoise2.kr(0.03) + 1) * 0.3)) * amp, LFNoise2.kr(0.03) * 0.3) }`,
  // the file itself into a long room, low-passed (the corner sweeping slowly), at its own pitch
  lfreeze: `{ var amp = Lag.kr(\\amp.kr(0), 4);
  var low = LPF.ar(Mix(In.ar(2, 2)) * 0.5, 900 * (1 + (LFNoise2.kr(0.025) * 0.7)));
  Pan2.ar(LeakDC.ar(FreeVerb.ar(low, 1, 0.97, 0.6)) * amp, 0) }`,
  // a bank of resonators at the scene's chord; on a pulse only the hits open it
  // fed a low-passed file and low-passed after, so speech's hiss does not ping the upper rings: *"very mettallic"*
  lres: `{ var amp = Lag.kr(\\amp.kr(0), 1);
  var x = LPF.ar(Mix(In.ar(2, 2)), 1200) * 0.02;
  var d = \\decay.kr(1.5);
  var env = EnvGen.kr(Env.perc(0.005, \\hitlen.kr(0.3)), \\hit.kr(0));
  var p = \\pulse.kr(0);
  var bank = Mix([${fs(RES_N).map((f) => `Ringz.ar(x, ${f}, d)`).join(', ')}]);
  Pan2.ar(Limiter.ar(LPF.ar(LeakDC.ar(bank), 1800) * ((1 - p) + (p * env)), 0.5, 0.01) * amp, 0) }`,
  // three grain pitch-shifted copies of the file, spread across the field; a longer window and wide time and pitch
  // dispersion smear the grains so the voices blur rather than phase metallic, and a low-pass softens them
  lharm: `{ var amp = Lag.kr(\\amp.kr(0), 1);
  var x = Mix(In.ar(2, 2)) * 0.5;
  var sp = \\spread.kr(0.6);
  var a = PitchShift.ar(x, 0.3, ${glide('\\r0.kr(0.5)', 5)}, 0.01, 0.12);
  var b = PitchShift.ar(x, 0.3, ${glide('\\r1.kr(1.5)', 5)}, 0.01, 0.12);
  var c = PitchShift.ar(x, 0.3, ${glide('\\r2.kr(2)', 5)}, 0.01, 0.12);
  LPF.ar(Pan2.ar(a, sp * -1) + Pan2.ar(b, 0) + Pan2.ar(c, sp), 3500) * amp * 0.5 }`,
  // a visit is heard as a voice from elsewhere, not a tint: its own voice whole, the colour under it, a drier room,
  // near the middle (*"cpuld not hear oriental"*, 2026-10-19)
  // the other file visiting: transposed per visit, some of its own voice kept, coloured by a band-pass, a comb
  // on the root or four resonators, into a big room of its own, drifting wide
  // a ghost swells in and out on an S curve over about 7 s (glide), and the bed ducks the same way:
  // *"they seems too sudden"*, *"they come and go too harsly"* (2026-10-19)
  lghost: `{ var amp = ${glide('\\amp.kr(0)', 2.5)};
  var x = Mix(In.ar(4, 2)) * 0.5;
  var sh = PitchShift.ar(x, 0.25, Lag.kr(\\shift.kr(1), 0.5), 0.01, 0.05);
  var bp = BPF.ar(sh, 300 + ((LFNoise2.kr(0.2) + 1) * 900), 0.5) * 3;
  var cb = CombC.ar(sh * 0.3, 0.1, 1 / \\root.kr(110), 3);
  var rs = Mix([${fs(GHOST_N).map((f) => `Ringz.ar(sh * 0.03, ${f}, 1.5)`).join(', ')}]);
  var s = sh + (bp * \\wb.kr(1)) + (cb * \\wc.kr(0) * 0.25) + (rs * \\wr.kr(0) * 0.06);
  var w = FreeVerb.ar(LeakDC.ar(s), 0.35, 0.92, 0.4);
  Pan2.ar(Limiter.ar(w * amp, 0.3, 0.01), LFNoise2.kr(0.15) * 0.6) }`,
};
// The room's ceiling is 0.4: the ring adds its own output beside it on the same bus with no limiter after the sum,
// and the ring peaks near 0.43 (-7.4 dBFS), so the two stay under full scale. At 0.9 a soaked scene clipped:
// *"too loud, clips"* (2026-10-19). A ghost goes straight to the output under its own 0.3, and while it visits the
// room ducks (`duck`) and its ceiling drops to 0.25 (`ceil`), so a visit is heard over the bed and the sum holds:
// *"can not hear ghost"* (2026-10-19).
export const ROOM = `{ var g = Lag.kr(\\gain.kr(1), 2) * ${glide('\\duck.kr(1)', 2.5)};
  // the drones half fixed and half following the scene's level, so they swell and recede rather than hold flat
  var dg = Lag.kr(\\dgain.kr(1), 3);
  var l = (In.ar(${LAYER_BUS}, 1) * g) + (In.ar(${DRONE_BUS}, 1) * dg);
  var r = (In.ar(${LAYER_BUS + 1}, 1) * g) + (In.ar(${DRONE_BUS + 1}, 1) * dg);
  var w = FreeVerb2.ar(l, r, \\mix.kr(0.3), \\size.kr(0.7), 0.5);
  Limiter.ar(w, ${glide('\\ceil.kr(0.4)', 2.5)}, 0.01) }`;

/** Compile every program; `bad` lists any the compiler refused, with why. The ghost and the room write `to` (the container's master bus). */
export function compileLayers({ to = 0 } = {}) {
  const out = {}, bad = [];
  for (const [name, src] of Object.entries(PROGRAMS)) { const r = compile(src, { name, bus: name === 'lghost' ? to : DRONES.includes(name) ? DRONE_BUS : LAYER_BUS }); if (r.ok) out[name] = r.bytes; else bad.push(`${name}: ${r.message}`); }
  const room = compile(ROOM, { name: 'lroom', bus: to });
  if (room.ok) out.lroom = room.bytes; else bad.push(`lroom: ${room.message}`);
  return { bytes: out, bad };
}

const NODES = { ldrone: 5101, lfreeze: 5102, lres: 5103, lharm: 5104, lghost: 5105, lroom: 5199 };

/**
 * The layers in a booted scsynth (`local.scsynth`). `apply(layers, key)` sets a scene's layers; `ghost(on)`,
 * `hit()` and `level(v)` are what the page's clocks move. Every node starts silent.
 */
export async function createLayerEngine(sc, { log = () => {}, to = 0, before = null } = {}) {
  const { bytes, bad } = compileLayers({ to });
  if (bad.length) throw new Error(`the layers did not compile: ${bad.join('; ')}`);
  for (const [name, b] of Object.entries(bytes)) {
    const done = await sc.sendAndWait((m) => (m[0] === '/done' && m[1] === '/d_recv') || m[0] === '/fail', 5000, '/d_recv', b);
    if (!done || done[0] !== '/done') throw new Error(`${name} was not taken: ${done?.[2] || 'no answer'}`);
  }
  // the layers at the head, the room at the tail after them and the ring, or just before the master (`before`)
  for (const name of Object.keys(PROGRAMS)) sc.send('/s_new', name, NODES[name], 0, 0, 'amp', 0);
  if (before != null) sc.send('/s_new', 'lroom', NODES.lroom, 2, before, 'mix', 0.3); else sc.send('/s_new', 'lroom', NODES.lroom, 1, 0, 'mix', 0.3);
  log(`the layers up: ${Object.keys(bytes).length} programs`);
  const set = (name, kv) => sc.send('/n_set', NODES[name], ...Object.entries(kv).flat());
  let now = null;
  return {
    get layers() { return now; },
    apply(L, key) {
      now = L;
      if (!L) { for (const n of Object.keys(PROGRAMS)) set(n, { amp: 0 }); return; }
      const dz = droneHz(key, L.droneOct ?? -1), ch = chordHz(key, L.res === 'none' ? 'fifths' : L.res, { octaves: 2, from: 1 }), rt = harmRatios(L.harm, L.harmSpread);
      // the levels put each layer about 8 to 16 dB under a file at -23 LUFS (layers-test --browser)
      // DRONE_TRIM: the drones about 3 dB under where they were, which tired over a section (*"tiring drone"*, 2026-10-19)
      set('ldrone', { amp: ['key', 'both'].includes(L.drone) ? L.droneLevel * 0.55 * DRONE_TRIM : 0, f0: dz[0], f1: dz[1], f2: dz[2], cut: 300 + 600 * (L.droneLevel ?? 0.3) });
      set('lfreeze', { amp: ['freeze', 'both'].includes(L.drone) ? (L.droneLevel ?? 0.3) * 5.5 * DRONE_TRIM : 0 });
      set('lres', { amp: L.res !== 'none' ? L.resWet * 0.55 : 0, decay: L.resDecay, pulse: L.bpm && L.pulseOn !== 'grains' ? 1 : 0,
        ...Object.fromEntries(ch.slice(0, RES_N).map((f, i) => [`f${i}`, f])) });
      set('lharm', { amp: L.harm !== 'none' ? 1.4 : 0, spread: L.harmSpread, r0: rt[0] ?? 1, r1: rt[1] ?? 1, r2: rt[2] ?? 1 });
      const gc = chordHz(key, 'fifths', { octaves: 1, from: 2 });
      set('lghost', { amp: 0, wb: L.ghost === 'bpf' ? 1 : 0, wc: L.ghost === 'comb' ? 1 : 0, wr: L.ghost === 'res' ? 1 : 0, root: hz((key?.root ?? 0) + 24),
        ...Object.fromEntries(gc.slice(0, GHOST_N).map((f, i) => [`f${i}`, f])) });
      set('lroom', { mix: L.room ?? 0.3, size: L.roomSize ?? 0.7 });
    },
    /** A ghost rising (`on`) or fading; its level is the scene's, its pitch picked per visit (GHOST_SHIFTS). */
    ghost(on, shift = GHOST_SHIFTS[Math.floor(Math.random() * GHOST_SHIFTS.length)]) {
      const visit = on && now?.ghost !== 'none';
      set('lghost', visit ? { amp: now.ghostLevel * 9, shift } : { amp: 0 });
      set('lroom', visit ? { duck: 0.45, ceil: 0.25 } : { duck: 1, ceil: 0.4 });
    },
    /** One pulse hit on the resonators: opens them for `len` seconds. */
    hit(len = 0.3) { set('lres', { hit: 1, hitlen: len }); setTimeout(() => set('lres', { hit: 0 }), 20); },
    /** Everything the layers make, 0 to 1, for a fade with the scene. */
    level(v) { set('lroom', { gain: v, dgain: 0.5 + 0.5 * Math.min(1, v) }); },
    stop() { for (const id of Object.values(NODES)) sc.send('/n_free', id); },
  };
}
