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
/** Semitones each harmonizer voice is moved by, by voicing; the dry voice is not one of them. */
export const VOICINGS = {
  octfifth: [-12, 7, 12],
  triad: [-12, 3, 7],
  quartal: [5, 10, 15],
  cluster: [-1, 1, 2],
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
export const layerLevel = (x) => (x < 0.12 ? 0 : x < 0.3 ? ease((x - 0.12) / 0.18) : x > 0.8 ? ease(Math.max(0, (0.95 - x) / 0.15)) : 1);
/** The key is heard in these seconds of a scene, over these frequencies: a chroma of what the tuner makes. */
export const KEY_FROM = [1, 5], KEY_HZ = [60, 1000];
/** A frequency's pitch class, 0 C to 11 B, on BASE_HZ. */
export const pitchClass = (f) => ((Math.round(12 * Math.log2(f / BASE_HZ)) % 12) + 12) % 12;

// ── the programs that sound them, in the scsynth the grain ring runs in ──────────────────────────────
// The layers read the tuner on busses 2 and 3 and the ghost player on 4 and 5, write to the private
// pair 8 and 9, and the room reads that pair and writes the output. sclang-lite has no array controls,
// so a chord is f0 to f11. why: lessons/workers-cast.md#layers

export const LAYER_BUS = 8, RES_N = 12, GHOST_N = 4;
const fs = (n, from = 0) => Array.from({ length: n }, (_, i) => `\\f${from + i}.kr(${110 * (i + 1)})`);
export const PROGRAMS = {
  // three detuned saws on root, fifth and octave, breathing through a slow low-pass
  ldrone: `{ var amp = Lag.kr(\\amp.kr(0), 4);
  var cut = \\cut.kr(500) * (1 + (LFNoise2.kr(0.05) * 0.5));
  var s = (VarSaw.ar(\\f0.kr(55), 0, 0.3) + (VarSaw.ar(\\f1.kr(82), 0, 0.4) * 0.7) + (VarSaw.ar(\\f2.kr(110) * 1.003, 0, 0.5) * 0.5)) * 0.25;
  Pan2.ar(RLPF.ar(s, cut, 0.6) * amp, LFNoise2.kr(0.03) * 0.3) }`,
  // the file itself held and slowed: low-passed, an octave down, into a long room
  lfreeze: `{ var amp = Lag.kr(\\amp.kr(0), 4);
  var low = LPF.ar(Mix(In.ar(2, 2)) * 0.5, 600);
  var down = PitchShift.ar(low, 0.4, \\ratio.kr(0.5), 0.02, 0.2);
  Pan2.ar(LeakDC.ar(FreeVerb.ar(down, 1, 0.97, 0.6)) * amp, 0) }`,
  // a bank of resonators at the scene's chord; on a pulse only the hits open it
  lres: `{ var amp = Lag.kr(\\amp.kr(0), 1);
  var x = Mix(In.ar(2, 2)) * 0.02;
  var d = \\decay.kr(1.5);
  var env = EnvGen.kr(Env.perc(0.005, \\hitlen.kr(0.3)), \\hit.kr(0));
  var p = \\pulse.kr(0);
  var bank = Mix([${fs(RES_N).map((f) => `Ringz.ar(x, ${f}, d)`).join(', ')}]);
  Pan2.ar(Limiter.ar(LeakDC.ar(bank) * ((1 - p) + (p * env)), 0.5, 0.01) * amp, 0) }`,
  // three grain pitch-shifted copies of the file, spread across the field
  lharm: `{ var amp = Lag.kr(\\amp.kr(0), 1);
  var x = Mix(In.ar(2, 2)) * 0.5;
  var sp = \\spread.kr(0.6);
  var a = PitchShift.ar(x, 0.2, \\r0.kr(0.5), 0.005, 0.02);
  var b = PitchShift.ar(x, 0.2, \\r1.kr(1.5), 0.005, 0.02);
  var c = PitchShift.ar(x, 0.2, \\r2.kr(2), 0.005, 0.02);
  (Pan2.ar(a, sp * -1) + Pan2.ar(b, 0) + Pan2.ar(c, sp)) * amp * 0.5 }`,
  // the other file visiting: band-passed, through a comb on the root, or through four resonators
  lghost: `{ var amp = Lag.kr(\\amp.kr(0), 1.5);
  var x = Mix(In.ar(4, 2)) * 0.5;
  var bp = BPF.ar(x, 300 + ((LFNoise2.kr(0.2) + 1) * 900), 0.3) * 2;
  var cb = CombC.ar(x * 0.3, 0.1, 1 / \\root.kr(110), 2);
  var rs = Mix([${fs(GHOST_N).map((f) => `Ringz.ar(x * 0.02, ${f}, 1.2)`).join(', ')}]);
  var s = (bp * \\wb.kr(1)) + (cb * \\wc.kr(0) * 0.5) + (rs * \\wr.kr(0) * 0.12);
  Pan2.ar(Limiter.ar(LeakDC.ar(s), 0.5, 0.01) * amp, LFNoise2.kr(0.1) * 0.8) }`,
};
export const ROOM = `{ var w = FreeVerb2.ar(In.ar(${LAYER_BUS}, 1), In.ar(${LAYER_BUS + 1}, 1), \\mix.kr(0.3), \\size.kr(0.7), 0.5);
  Limiter.ar(w * Lag.kr(\\gain.kr(1), 2), 0.9, 0.01) }`;

/** Compile every program; `bad` lists any the compiler refused, with why. */
export function compileLayers() {
  const out = {}, bad = [];
  for (const [name, src] of Object.entries(PROGRAMS)) { const r = compile(src, { name, bus: LAYER_BUS }); if (r.ok) out[name] = r.bytes; else bad.push(`${name}: ${r.message}`); }
  const room = compile(ROOM, { name: 'lroom', bus: 0 });
  if (room.ok) out.lroom = room.bytes; else bad.push(`lroom: ${room.message}`);
  return { bytes: out, bad };
}

const NODES = { ldrone: 5101, lfreeze: 5102, lres: 5103, lharm: 5104, lghost: 5105, lroom: 5199 };

/**
 * The layers in a booted scsynth (`local.scsynth`). `apply(layers, key)` sets a scene's layers; `ghost(on)`,
 * `hit()` and `level(v)` are what the page's clocks move. Every node starts silent.
 */
export async function createLayerEngine(sc, { log = () => {} } = {}) {
  const { bytes, bad } = compileLayers();
  if (bad.length) throw new Error(`the layers did not compile: ${bad.join('; ')}`);
  for (const [name, b] of Object.entries(bytes)) {
    const done = await sc.sendAndWait((m) => (m[0] === '/done' && m[1] === '/d_recv') || m[0] === '/fail', 5000, '/d_recv', b);
    if (!done || done[0] !== '/done') throw new Error(`${name} was not taken: ${done?.[2] || 'no answer'}`);
  }
  // the layers at the head, the room at the tail after them and the ring
  for (const name of Object.keys(PROGRAMS)) sc.send('/s_new', name, NODES[name], 0, 0, 'amp', 0);
  sc.send('/s_new', 'lroom', NODES.lroom, 1, 0, 'mix', 0.3);
  log(`the layers up: ${Object.keys(bytes).length} programs`);
  const set = (name, kv) => sc.send('/n_set', NODES[name], ...Object.entries(kv).flat());
  let now = null;
  return {
    get layers() { return now; },
    apply(L, key) {
      now = L;
      if (!L) { for (const n of Object.keys(PROGRAMS)) set(n, { amp: 0 }); return; }
      const dz = droneHz(key, L.droneOct ?? -1), ch = chordHz(key, L.res === 'none' ? 'fifths' : L.res, { octaves: 3, from: 1 }), rt = harmRatios(L.harm, L.harmSpread);
      // the levels put each layer about 8 to 16 dB under a file at -23 LUFS (layers-test --browser)
      set('ldrone', { amp: ['key', 'both'].includes(L.drone) ? L.droneLevel * 0.35 : 0, f0: dz[0], f1: dz[1], f2: dz[2], cut: 300 + 600 * (L.droneLevel ?? 0.3) });
      set('lfreeze', { amp: ['freeze', 'both'].includes(L.drone) ? (L.droneLevel ?? 0.3) * 3.5 : 0, ratio: L.droneOct === -2 ? 0.25 : 0.5 });
      set('lres', { amp: L.res !== 'none' ? L.resWet * 0.4 : 0, decay: L.resDecay, pulse: L.bpm && L.pulseOn !== 'grains' ? 1 : 0,
        ...Object.fromEntries(ch.slice(0, RES_N).map((f, i) => [`f${i}`, f])) });
      set('lharm', { amp: L.harm !== 'none' ? 1 : 0, spread: L.harmSpread, r0: rt[0] ?? 1, r1: rt[1] ?? 1, r2: rt[2] ?? 1 });
      const gc = chordHz(key, 'fifths', { octaves: 1, from: 2 });
      set('lghost', { amp: 0, wb: L.ghost === 'bpf' ? 1 : 0, wc: L.ghost === 'comb' ? 1 : 0, wr: L.ghost === 'res' ? 1 : 0, root: hz((key?.root ?? 0) + 24),
        ...Object.fromEntries(gc.slice(0, GHOST_N).map((f, i) => [`f${i}`, f])) });
      set('lroom', { mix: L.room ?? 0.3, size: L.roomSize ?? 0.7 });
    },
    /** A ghost rising (`on`) or fading; its level is the scene's. */
    ghost(on) { set('lghost', { amp: on && now?.ghost !== 'none' ? now.ghostLevel * 2 : 0 }); },
    /** One pulse hit on the resonators: opens them for `len` seconds. */
    hit(len = 0.3) { set('lres', { hit: 1, hitlen: len }); setTimeout(() => set('lres', { hit: 0 }), 20); },
    /** Everything the layers make, 0 to 1, for a fade with the scene. */
    level(v) { set('lroom', { gain: v }); },
    stop() { for (const id of Object.values(NODES)) sc.send('/n_free', id); },
  };
}
