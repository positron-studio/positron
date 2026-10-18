// demo/radio/cast/layers.mjs: the layers a live scene carries over the file (plans/plan-cast-reinterpret.md
// section 2), as numbers. This half is pure: a key and a chord into frequencies, a voicing into pitch
// ratios, a pulse into hits. The SuperCollider programs that sound them are below the line.

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
