// demo/shell/mem.mjs: MEM, a memory looper. Takes cut from a live ring at onsets loop in N small speakers placed in a
// stereo room, through slow moods; JS decides everything, scsynth does each speaker's colour, the room and the master.
// One engine for node, a Web Worker and a Durable Object: the host gives the rate, the ring and the player cap.
// The same file, byte for byte, in v2in server/engines/mem/: it imports only its neighbours, and each repository
// supplies its own sclang-lite.mjs, mem-master.mjs and scsynth-sync.mjs beside it. The host passes its own boot.
// why: lessons/mem.md#header
import { compile } from './sclang-lite.mjs';
import { program as masterProgram, MASTER } from './mem-master.mjs';
import DATA from './mem-presets.json' with { type: 'json' };
import { QUANTUM } from './scsynth-sync.mjs';

const PRESETS = { default: DATA.default, presets: DATA.presets }, HOSTS = DATA.hosts;

export { PRESETS, HOSTS };
// the defaults, a server's: lengths are counted on a 10 ms grid, so a host's rate must be a multiple of 100
export const SR = 44100, GRID = SR / 100;
export const RING_S = 300;
const SEAM_S = 0.02;                          // crossfaded over every loop's seam
const CELL_S = 0.03;                          // disintegration's holes
// scsynth is booted for MAX_PLAYERS speakers whatever the preset (an unused one is silent and costs nothing), so a new
// preset can add players without a new graph
const MAX_PLAYERS = 12, MIX_BUS = 24, NODE = { spk: 1000, dry: 1100, rev: 1101, mst: 1102 };
const GLIDE_S = 8;                            // a new preset's places, colour and reverb glide this long

// Waves's master, gentler: a slow leveller with less lift, so a far arrangement stays quieter than a near one; its
// limiter's ceiling (0.65) keeps true peaks near -3.7 dBTP after MP3. A preset's `master` overrides.
const MEM_MASTER = { TARGET: 0.14, GMAX: 3, SLOW: 12, GLIDE: 6 };   // about -16 LUFS, level with v2in's other channels
const dB = (x) => (x > 0 ? 10 * Math.log10(x) : -120);


// ── seeded numbers ──────────────────────────────────────────────────────────────────────────────────────────────────
/** mulberry32: `next()` in [0, 1), the rest built on it. */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  const next = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: ([lo, hi]) => lo + (hi - lo) * next(), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)] };
}
/** A stateless hash of three integers to [0, 1): the same hole in the same pass every time. */
function hash3(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ── the lengths ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
/**
 * A loop length in grid steps (10 ms) between lo and hi, with no common factor with any of `others` (also in grid steps)
 * and their least common multiple at least `minLcmS` seconds: the loops then return to one alignment only after that.
 * Draws up to 400 candidates; failing all, the one whose worst pair is best. Returns `{ n, ok }`.
 */
export function chooseLength(r, lo, hi, others, minLcmS = 300) {
  lo = Math.max(1, Math.round(lo)); hi = Math.max(lo, Math.round(hi));
  let best = lo, bestScore = -Infinity;
  for (let k = 0; k < 400; k++) {
    const n = r.int(lo, hi);
    let worst = Infinity;
    for (const o of others) { const lcmS = (n / gcd(n, o)) * o / 100; worst = Math.min(worst, gcd(n, o) > 1 ? -1 / gcd(n, o) : lcmS); }
    if (worst === Infinity || worst >= minLcmS) return { n, ok: true };
    if (worst > bestScore) { bestScore = worst; best = n; }
  }
  return { n: best, ok: false };
}

// ── the live ring ───────────────────────────────────────────────────────────────────────────────────────────────────
// ── what a stretch sounds like: talk or not ──────────────────────────────────────────────────────────────────────────
// Speech is voiced energy (the band where a voice's pitch and first formant sit, around 150 to 900 Hz) coming and going
// at the rate of syllables, a few times a second. Music, tones and AM noise hold that band steadier. So: the voiced
// band's level in dB per 10 ms cell, smoothed to 40 ms less smoothed to 250 ms (what moves at about 2 to 12 Hz), its RMS
// over the stretch: the syllabic swing, in dB. MEASURED on the AM test material (5 s windows, 2026-11-07): the five talk
// stations in server/media/huddersfield-talk have medians 3.5 to 5.4 dB and 10th percentiles of 2.4 or more; skywave
// noise and steady stations 0.6 to 1.8. `speechOf` maps 1.8 dB to 0 and 3.2 dB to 1.
export const SPEECH_DB = [1.8, 3.2];
/** A band pass (RBJ biquad, constant peak gain) at f with quality q, per sample. */
function bandpass(f, q, sr = SR) {
  const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
const VOICED = [370, 0.65];
/** The syllabic swing in dB of each half second of a run of voiced band cell energies (mean squares). */
export function swingOf(bands) {
  const n = bands.length; if (n < 30) return [];
  const L = new Float64Array(n), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { L[i] = 10 * Math.log10(bands[i] + 1e-10); pre[i + 1] = pre[i] + L[i]; }
  const ma = (i, k) => { const a = Math.max(0, i - (k >> 1)), b = Math.min(n, a + k); return (pre[b] - pre[a]) / (b - a); };
  // the swing of each half second, so a take that is a third talk reads as about a third talk
  const out = []; for (let b = 0; b + 50 <= n || (b === 0 && n); b += 50) { const e = Math.min(n, b + 50); let v = 0; for (let i = b; i < e; i++) v += (ma(i, 4) - ma(i, 25)) ** 2; out.push(Math.sqrt(v / (e - b))); }
  return out;
}
/** 0 (music, tone, noise) to 1 (talk): the share of half seconds that swing like syllables, each graded between the two. */
export const speechOfSwing = (sw) => (sw.length ? sw.reduce((a, x) => a + Math.max(0, Math.min(1, (x - SPEECH_DB[0]) / (SPEECH_DB[1] - SPEECH_DB[0]))), 0) / sw.length : 0);
/** How speech-like a mono 16-bit snippet is, 0 to 1. */
export function speechOf(x, sr = SR) {
  const grid = sr / 100, bp = bandpass(...VOICED, sr), n = Math.floor(x.length / grid), b = new Float32Array(n);
  for (let c = 0; c < n; c++) { let e = 0; for (let i = c * grid; i < (c + 1) * grid; i++) { const y = bp(x[i] / 32768); e += y * y; } b[c] = e / grid; }
  return speechOfSwing(swingOf(b));
}

export class Ring {
  constructor(seconds = RING_S, sr = SR) {
    this.sr = sr; this.grid = sr / 100;
    this.n = Math.round(seconds * sr); this.d = new Int16Array(this.n * 2); this.w = 0;          // w: frames written, ever
    this.cells = new Float32Array(Math.ceil(this.n / this.grid)); this.cAcc = 0; this.cN = 0;
    this.bands = new Float32Array(this.cells.length); this.bAcc = 0; this.bp = bandpass(...VOICED, sr);   // the voiced band, beside
  }
  /** s16le interleaved stereo in (an Int16Array, or bytes). */
  write(buf) {
    const s = buf instanceof Int16Array ? buf : new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
    const frames = s.length >> 1, nc = this.cells.length, GRID = this.grid;
    for (let i = 0; i < frames; i++) {
      const j = (this.w % this.n) * 2, l = s[2 * i], r = s[2 * i + 1];
      this.d[j] = l; this.d[j + 1] = r;
      const m = (l + r) / 65536, y = this.bp(m); this.cAcc += m * m; this.bAcc += y * y; this.cN++;
      this.w++;
      if (this.cN === GRID) { const c = (this.w / GRID - 1) % nc; this.cells[c] = this.cAcc / GRID; this.bands[c] = this.bAcc / GRID; this.cAcc = this.bAcc = 0; this.cN = 0; }
    }
  }
  silence(frames) { const SR = this.sr, z = new Int16Array(Math.min(frames, SR) * 2); while (frames > 0) { const k = Math.min(frames, SR); this.write(z.subarray(0, k * 2)); frames -= k; } }
  /** The oldest frame still held. */
  get from() { return Math.max(0, this.w - this.n); }
  /** Energy (mean square) of the 10 ms cells [c0, c1), cells counted from the start of the feed. */
  cellsOf(c0, c1, arr = this.cells) { const nc = arr.length, out = new Float32Array(Math.max(0, c1 - c0)); for (let c = c0; c < c1; c++) out[c - c0] = arr[c % nc]; return out; }
  /** How speech-like the cells [c0, c1) are, 0 to 1. */
  speech(c0, c1) { return speechOfSwing(swingOf(this.cellsOf(c0, c1, this.bands))); }
  /** Frames [f0, f0 + n) summed to mono, 16-bit. */
  mono(f0, n) { const o = new Int16Array(n); for (let i = 0; i < n; i++) { const j = ((f0 + i) % this.n) * 2; o[i] = (this.d[j] + this.d[j + 1]) >> 1; } return o; }
  frame(f) { const j = (f % this.n) * 2; return [this.d[j] / 32768, this.d[j + 1] / 32768]; }
  clear() { this.d.fill(0); this.cells.fill(0); this.bands.fill(0); }
}

/** 10 ms cell energies of a mono 16-bit array. */
export function cellsOfMono(x, grid = GRID) {
  const n = Math.floor(x.length / grid), o = new Float32Array(n);
  for (let c = 0; c < n; c++) { let s = 0; for (let i = c * grid; i < (c + 1) * grid; i++) { const v = x[i] / 32768; s += v * v; } o[c] = s / grid; }
  return o;
}

/**
 * Where a take of `need` cells starts in `cells` (the energies of a stretch), searching the first `search` start cells:
 * only where the take's mean is over the gate and most of its cells have sound (the level gate), and there at the
 * strongest onset (a cell much louder than the 100 ms before it). -1 when nothing passes the gate.
 */
export function findStart(cells, need, search, gateDb) {
  const gate = 10 ** (gateDb / 10), floor = gate / 10;
  const pre = new Float64Array(cells.length + 1);
  for (let i = 0; i < cells.length; i++) pre[i + 1] = pre[i] + cells[i];
  let best = -1, bestScore = -Infinity;
  for (let s = 0; s <= search && s + need <= cells.length; s++) {
    const mean = (pre[s + need] - pre[s]) / need;
    if (mean < gate) continue;
    let had = 0; for (let c = s; c < s + need; c += 5) if (cells[c] > floor) had++;
    if (had < 0.6 * Math.ceil(need / 5)) continue;
    const before = s >= 10 ? (pre[s] - pre[s - 10]) / 10 : cells[s];
    const score = cells[s] > gate ? dB(cells[s] + 1e-12) - dB(before + 1e-12) : -60;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

/**
 * No speed between 0.3 and 0.9, for any loop, talk or not: slowed AM is a voice slowed down (owner, 2026-11-09: *Darth
 * Vader voices: no*, *only if super low and stretched*), and talk is not always recognised as talk. A slowed slot (a
 * drone) stays at 0.16 or under, where a voice is gone (0.16 was still heard as one); anything else plays at 0.9 or
 * faster.
 */
function talkRate(rate, base) {
  const a = Math.abs(rate), s = Math.sign(rate) || 1;
  return base < 0.9 ? s * Math.min(a, 0.16) : s * Math.max(a, 0.9);
}

// ── a voice: one take looping in one player ─────────────────────────────────────────────────────────────────────────
// The unwrapped phase in take frames at engine frame t, from the voice's anchor: a glide from rate r0 to r1 over T
// frames is a ramp, so its integral is a quadratic. Re-anchoring (a new glide) is a state change; nothing is summed.
function phaseAt(v, t) {
  const dt = t - v.t0;
  if (dt <= 0) return v.ph0;
  if (dt < v.T) return v.ph0 + v.r0 * dt + (v.r1 - v.r0) * dt * dt / (2 * v.T);
  return v.ph0 + v.r0 * v.T + (v.r1 - v.r0) * v.T / 2 + v.r1 * (dt - v.T);
}
function rateAt(v, t) { const dt = t - v.t0; return dt <= 0 ? v.r0 : dt < v.T ? v.r0 + (v.r1 - v.r0) * dt / v.T : v.r1; }

// ── the room: arrangements of N speakers, each { a: degrees -90..90, d: distance, 1 near } ──────────────────────────
export const ARRANGEMENTS = {
  ring:   (n) => Array.from({ length: n }, (_, i) => ({ a: n > 1 ? -80 + 160 * i / (n - 1) : 0, d: i % 2 ? 2.2 : 1.0 })),
  line:   (n) => Array.from({ length: n }, (_, i) => ({ a: n > 1 ? -60 + 120 * i / (n - 1) : 0, d: 1.4 })),
  corner: (n, side = 1) => Array.from({ length: n }, (_, i) => ({ a: side * 50 + (i - (n - 1) / 2) * 6, d: 1.8 + 0.4 * (i % 3) })),
  pairs:  (n) => { const k = Math.ceil(n / 2); return Array.from({ length: n }, (_, i) => ({ a: k > 1 ? -70 + 140 * Math.floor(i / 2) / (k - 1) : 0, d: i % 2 ? 3.2 : 0.7 })); },
};
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));

/** One speaker's controls from its angle and distance (plans/plan-huddersfield.md, "The room, in stereo"). */
export function place(a, d, room) {
  a = Math.max(-90, Math.min(90, a)); d = Math.max(0.5, d);
  const s = Math.sin(a * Math.PI / 180), phi = (a / 90 + 1) * Math.PI / 4;
  const itd = (room.itd ?? 0.0006) * Math.abs(s), shadow = 20000 * (1 - 0.6 * Math.abs(s));
  return {
    gl: Math.cos(phi), gr: Math.sin(phi),
    dl: s > 0 ? itd : 0, dr: s < 0 ? itd : 0,            // the far ear hears it later
    fl: s > 0 ? shadow : 20000, fr: s < 0 ? shadow : 20000, // and darker
    gain: Math.min(1.3, 1 / d), air: 18000 / (1 + 0.6 * (d - 0.5)),
    send: Math.min(0.85, 0.08 + 0.12 * d) * (room.reverb?.send ?? 1),
  };
}

// ── the SynthDefs ───────────────────────────────────────────────────────────────────────────────────────────────────
// sclang-lite: operators left to right with no precedence, so every expression is bracketed.
const SPEAKER = `{ var x = In.ar(\\inbus.kr(2), 1);
  var c = LPF.ar(HPF.ar(x, \\hp.kr(200, 4)), \\lp.kr(7000, 4));
  var d = \\drive.kr(1.5, 4);
  var s = (c * d).tanh / d;
  var a = LPF.ar(s, \\air.kr(18000, 1)) * \\gain.kr(1, 1);
  var l = LPF.ar(DelayC.ar(a * \\gl.kr(0.7, 1), 0.002, \\dl.kr(0, 1)), \\fl.kr(20000, 1));
  var r = LPF.ar(DelayC.ar(a * \\gr.kr(0.7, 1), 0.002, \\dr.kr(0, 1)), \\fr.kr(20000, 1));
  [l, r] }`;
const REVERB = (n, top = 6000) => `{ var m = ${Array.from({ length: n }, (_, i) => `(In.ar(${2 + i}, 1) * \\s${i}.kr(0, 1))`).join(' + ')} + ((In.ar(${2 + n}, 1) + In.ar(${3 + n}, 1)) * \\sd.kr(0, 2));
  var w = LPF.ar(HPF.ar(m, 200), ${top});
  var v = FreeVerb2.ar(w, DelayC.ar(w, 0.05, 0.023), 1, \\room.kr(0.8), \\damp.kr(0.5));
  v * \\level.kr(0.3, 2) }`;
// the feed is mono, so the two sides take it through two slightly different short delays and it opens out rather than
// sitting in the middle; the reverb hears it too (`sd` on the reverb, following `dry`)
const DRY = (n) => `{ var x = ((In.ar(${2 + n}, 1) + In.ar(${3 + n}, 1)) * 0.5) * \\dry.kr(0, 2);
  [(x * 0.75) + (DelayC.ar(x, 0.05, 0.023) * 0.45), (x * 0.75) + (DelayC.ar(x, 0.05, 0.031) * 0.45)] }`;

/** A preset by name. */
export function presetOf(name, presets = PRESETS) {
  const p = presets.presets[name || presets.default];
  if (!p) throw new Error(`no preset ${name}: ${Object.keys(presets.presets).join(', ')}`);
  return { name: name || presets.default, ...p };
}
/** A host by name or as given: its rate, ring seconds and player cap. */
export function hostOf(host = 'server') {
  const h = typeof host === 'string' ? HOSTS[host] : host;
  if (!h) throw new Error(`no host ${host}: ${Object.keys(HOSTS).join(', ')}`);
  if (!Number.isInteger(h.rate / 100)) throw new Error(`a host rate must be a multiple of 100 Hz, not ${h.rate}`);
  return { name: typeof host === 'string' ? host : h.name || 'custom', ...h };
}

/**
 * MEM. `new Mem({ preset, seed, host, log, recordings })`, then `await mem.boot(bootSync, vendor)` (scsynth-sync.mjs); the
 * feed goes into `mem.ring.write()` at the host's rate; `mem.render(frames)` returns an Int16Array of stereo frames. `recordings` is `{ list(), decode(file, at, s) }`
 * or null: `decode` may return the mono Int16Array (offline) or a promise of it (live).
 */
export class Mem {
  constructor({ preset = PRESETS.default, seed = 1, host = 'server', log = () => {}, recordings = null, now = () => Date.now() } = {}) {
    this.host = hostOf(host);
    this.sr = this.host.rate; this.grid = this.sr / 100; this.seam = Math.round(SEAM_S * this.sr); this.cell = Math.round(CELL_S * this.sr);
    this.levelK = 1 - Math.exp(-QUANTUM / (3 * this.sr));   // the players' level follows their count over about 3 s
    this.top = Math.min(18000, Math.floor(this.sr * 0.45));   // no filter above this: under the host's Nyquist
    this.cap = Math.min(MAX_PLAYERS, this.host.players ?? MAX_PLAYERS);
    this.p = typeof preset === 'string' ? presetOf(preset) : preset;
    this.seed = seed >>> 0; this.r = rng(this.seed); this.log = log; this.recordings = recordings; this.now = now;
    this.n = Math.min(this.cap, this.p.players);   // the players wanted; while a new preset settles, more or fewer play
    this.ring = new Ring(this.host.ringS ?? RING_S, this.sr);
    this.t = 0; this.takes = []; this.tid = 0; this.vid = 0; this.counts = { takes: 0, gated: 0, past: 0, replaced: 0, freezes: 0, glides: 0, presets: 0 };
    this.players = Array.from({ length: this.n }, (_, i) => this.newPlayer(i, i));
    this.gk = this.gainTarget(); this.sw = null; this.enterAt = Infinity; this.dryUntil = 0;
    this.calmUntil = 0; this.wakeAt = 0; this.balanceAt = 0; this.colourNext = 0; this.mood = null; this.moodEnd = 0; this.moodPlayers = this.n;
    this.newMood(true);
    this.spreadAt = this.r.next();
    // a slot that keeps (the drone) is ranked first, so a thin opening mood never rests it
    // a slot that keeps (the drone) plays on top of the mood's count and never rests
    { const rank = [...this.players].filter((pl) => !this.slotAt(pl.k)?.keep).sort((x, y) => this.spread(x) - this.spread(y)); rank.forEach((pl, j) => { pl.rest = j >= this.moodPlayers; }); }   // a thin mood starts with fewer
    this.nextTake = 0; this.firstTake = true;
    // preset `open` { dry, hold, fade }: the feed itself, dry, from the first frame until the loops have taken over, so
    // nothing waits in silence for the first take; then it fades to the preset's own `dry`
    this.opening = !!this.p.open; this.openFade = null;
    const rm = this.p.room;
    this.arr = { from: this.r.pick(rm.arrangements), to: null, side: this.r.chance(0.5) ? 1 : -1, moveAt: 0, moveS: 0, holdUntil: this.r.range(rm.hold) * this.sr };
    this.roomAt = 0; this.dryRead = 0; this.ins = []; this.out = new Int16Array(0);
  }

  /**
   * The register a place sits in (preset `slots`, low to high): places are dealt to slots in order, `players` each.
   * A slot narrows the colour ranges, and may set a base speed (`rate`), a take tier, its own `life`, and `keep`
   * (never sent to rest by a mood), so a low slot can drone under the rest. No `slots`, no change.
   */
  slotAt(k) { const S = this.p.slots; if (!S?.length) return null; const deal = S.flatMap((x) => Array(x.players ?? 1).fill(x)); return deal[k % deal.length]; }
  colourAt(k) { const x = this.slotAt(k); return x?.colour ? { ...this.p.colour, ...x.colour } : this.p.colour; }
  /** A player in slot `i` (its scsynth input and speaker node), at place `k` of the arrangement, coloured by the preset. */
  newPlayer(i, k) {
    const c = this.colourAt(k);
    return { i, k, voices: [], replaceAt: Infinity, freezing: false, leaving: false,
      colour: { hp: this.r.range(c.hp), lp: this.r.range(c.lp), drive: this.r.range(c.drive) },
      walk: this.newWalk(),
      buf: new Float32Array(QUANTUM), at: null };
  }
  /**
   * A speaker's colour that keeps moving (preset `colour.walk`): it glides to a new point inside the preset's colour
   * ranges over `glide` seconds, holds for `hold`, and goes again; filters move in octaves, drive in a straight line.
   * Set four times a second; the speaker's own 4 s lag smooths the steps.
   */
  walkColour(pl, t) {
    const W = this.p.colour.walk, c = this.colourAt(pl.k), r = this.r;
    let w = pl.cw;
    if (!w || t >= w.t0 + w.T + w.hold) {
      w = pl.cw = { from: { ...pl.colour }, to: { hp: r.range(c.hp), lp: r.range(c.lp), drive: r.range(c.drive) },
        t0: t, T: Math.max(1, r.range(W.glide)) * this.sr, hold: r.range(W.hold ?? [0, 0]) * this.sr };
    }
    const u = Math.min(1, (t - w.t0) / w.T), e = (1 - Math.cos(Math.PI * u)) / 2, oct = (a, b) => a * (b / a) ** e;
    pl.colour = { hp: oct(w.from.hp, w.to.hp), lp: oct(w.from.lp, w.to.lp), drive: w.from.drive + (w.to.drive - w.from.drive) * e };
    this.w?.send('/n_set', NODE.spk + pl.i, 'hp', pl.colour.hp, 'lp', Math.min(this.top, pl.colour.lp), 'drive', pl.colour.drive);
  }
  /**
   * The reverb that moves (preset `room.reverb.walk`): its level glides to a share of the preset's (`amount`) and holds,
   * and now and then (`dryP`) to almost nothing (`dry`) for `dryHold` s: dry moments. The node's own 2 s lag smooths it.
   */
  walkReverb(t) {
    const W = this.p.room.reverb.walk, r = this.r;
    let w = this.rw;
    if (!w || t >= w.t0 + w.T + w.hold) {
      const dry = r.chance(W.dryP ?? 0), to = dry ? r.range(W.dry ?? [0.03, 0.12]) : r.range(W.amount ?? [0.6, 1.3]);
      w = this.rw = { from: w ? w.at : 1, to, at: w ? w.at : 1, t0: t, T: Math.max(1, r.range(W.glide ?? [6, 20])) * this.sr,
        hold: r.range(dry ? W.dryHold ?? [10, 30] : W.hold ?? [10, 40]) * this.sr };
    }
    const u = Math.min(1, (t - w.t0) / w.T), e = (1 - Math.cos(Math.PI * u)) / 2;
    w.at = w.from + (w.to - w.from) * e;
    this.w?.send('/n_set', NODE.rev, 'level', this.p.room.reverb.level * w.at);
  }
  /**
   * Solo passages (preset `solo`): every `every` s one sounding loop stays and every other goes, drones too, holds
   * `hold` s, and all come back; never the same player twice running. Each way is a fade of `fade` s or, at `sudden`, a
   * cut of 0.2 to 0.8 s, decided apart, so it can surprise (owner: *keep surprise element*). The others keep looping
   * underneath, so they come back where they are.
   */
  stepSolo(t) {
    const S = this.p.solo, r = this.r, sr = this.sr;
    this.soloNext ??= t + r.range(S.every) * sr;
    const o = this.soloState;
    if (!o) {
      if (t < this.soloNext) return;
      // never a slowed loop (an octave down, a drone): those play under the others, not alone
      const can = this.players.filter((pl) => !pl.leaving && !pl.rest && pl !== this.soloLast && pl.voices.some((v) => !v.out && Math.abs(v.r1) >= 0.5));
      if (can.length < 1 || this.players.filter((pl) => pl.voices.some((v) => !v.out)).length < 2) { this.soloNext = t + 10 * sr; return; }
      // `music`: the share of passages given to a loop that is not talk, when one plays
      const music = can.filter((x) => (x.voices.find((v) => !v.out)?.take.speech ?? 1) < 0.5);
      const pl = r.pick(music.length && r.chance(S.music ?? 0) ? music : can);
      const way = () => Math.max(1, (r.chance(S.sudden ?? 0) ? r.range([0.2, 0.8]) : r.range(S.fade ?? [3, 8])) * sr);
      // `drones`: the share of passages where the kept slots (the drones) stay under the lone loop
      this.soloState = { pl, t0: t, hold: r.range(S.hold) * sr, out: way(), back: way(), drones: r.chance(S.drones ?? 0) }; this.soloLast = pl; this.counts.solos = (this.counts.solos || 0) + 1;
      return;
    }
    if (t >= o.t0 + o.out + o.hold + o.back) { this.soloState = null; this.soloNext = t + r.range(S.every) * sr; }
  }
  /** How much of a player is heard under a solo: 1, or down to 0 and back for everyone but the soloist. */
  soloGain(pl, t) {
    const o = this.soloState;
    if (!o || pl === o.pl || (o.drones && this.slotAt(pl.k)?.keep)) return 1;
    const x = t - o.t0, c = (u) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2;
    return x < o.out ? 1 - c(x / o.out) : x < o.out + o.hold ? 0 : c((x - o.out - o.hold) / o.back);
  }
  /** The dry feed's level, and as much again into the reverb at half, so the feed sits in the room. */
  setDry(x) { this.w?.send('/n_set', NODE.dry, 'dry', x); this.w?.send('/n_set', NODE.rev, 'sd', x * 0.5); }
  /** The opening's dry feed: held until the first loop has played `hold` s, then down to the preset's `dry` over `fade` s. */
  openStep(t) {
    const O = this.p.open || {}, to = this.p.dry ?? 0;
    if (!this.openFade) { if (this.players.filter((pl) => pl.voices.some((v) => !v.out)).length >= Math.min(3, this.n)) this.openFade = { t0: t + (O.hold ?? 10) * this.sr, T: Math.max(1, (O.fade ?? 15) * this.sr) }; return; }
    if (t < this.openFade.t0) return;
    const u = Math.min(1, (t - this.openFade.t0) / this.openFade.T), from = O.dry ?? 0.5;
    this.setDry(from + (to - from) * (1 - Math.cos(Math.PI * u)) / 2);
    if (u >= 1) this.opening = false;
  }
  /** A speaker's slow walk around its place: two slow sines each in angle and distance, or none (it stands still). */
  newWalk() {
    const W = this.p.room.walk || { p: 0.6, angle: 12, distance: 0.3, period: [60, 180] }, r = this.r;
    if (!r.chance(W.p)) return null;
    const one = (amp) => ({ amp: amp * r.range([0.4, 1]), p1: r.next() * 6.283, h1: 1 / r.range(W.period), p2: r.next() * 6.283, h2: 1 / (r.range(W.period) * 1.7) });
    return { a: one(W.angle), d: one(W.distance) };
  }
  walkAt(w, t) { const s = t / this.sr; return w.amp * (0.65 * Math.sin(w.p1 + 6.283 * w.h1 * s) + 0.35 * Math.sin(w.p2 + 6.283 * w.h2 * s)); }

  // ── moods: slow phases of how many play, how long their loops are, how fast things change ──
  /** The next mood in the preset's list (the list is a cycle, entered at a seeded place), or none. */
  newMood(first = false) {
    const M = this.p.moods;
    if (!M?.length) { this.mood = null; this.moodPlayers = this.n; this.moodEnd = Infinity; return; }
    this.moodI = first || this.moodI == null ? Math.floor(this.r.next() * M.length) : (this.moodI + 1) % M.length;
    this.mood = M[this.moodI]; this.moodStart = this.t;
    const [lo, hi] = this.mood.players; this.moodPlayers = Math.min(this.n, this.r.int(lo, hi));
    this.moodEnd = this.t + this.r.range(this.mood.s) * this.sr;
    if (!first) this.log(`mood ${this.mood.name}: ${this.moodPlayers} of ${this.n} players`);
    this.counts.moods = (this.counts.moods || 0) + 1;
  }
  /** Who rests first and wakes last: places spread by the golden ratio, so a few players sound across the room, not on one side. */
  spread(pl) { return ((pl.k + 0.5) * 0.6180339887 + this.spreadAt) % 1; }
  get pace() { return this.mood?.pace ?? 1; }
  get proc() { return this.mood?.process ?? 1; }
  /** Players to rest or wake, toward the mood's count: a resting one fades at its next change, a waking one enters. */
  balance() {
    const t = this.t, r = this.r, want = this.mood ? Math.min(this.n, this.moodPlayers) : this.n;
    // a kept slot (the drone) is outside the mood's count: always on, never rested or woken here
    const kept = (pl) => !!this.slotAt(pl.k)?.keep;
    const active = this.players.filter((pl) => !pl.leaving && !pl.rest && !kept(pl)), keep = active.filter((pl) => !pl.toRest);
    if (keep.length > want) {
      keep.sort((x, y) => this.spread(y) - this.spread(x)).slice(0, keep.length - want).forEach((pl) => {
        pl.toRest = true; pl.replaceAt = Math.min(pl.replaceAt, t + r.range([15, 60]) * this.pace * this.sr);
      });
    } else if (keep.length < want) {
      let k = keep.length;
      for (const pl of active) if (pl.toRest && k < want) { pl.toRest = false; k++; }
      const resting = this.players.filter((pl) => pl.rest && !pl.leaving && !kept(pl)).sort((x, y) => this.spread(x) - this.spread(y));
      if (k < want && resting.length && t >= this.wakeAt && !this.firstTake) {
        const pl = resting[0]; pl.rest = false; pl.replaceAt = t; this.wakeAt = t + r.range(this.p.enter) * this.pace * this.sr;
      }
    }
  }
  /** One change at a time: false while the last one is still settling (`spacing` seconds). */
  calm() { return this.t >= this.calmUntil; }
  changed(k = 1) { this.calmUntil = this.t + (this.p.spacing ?? 0) * k * this.pace * this.sr; }
  later() { return this.calmUntil + this.r.range([0.2, 1.5]) * (this.p.spacing ?? 0) * this.sr; }

  // ── loop lengths in tiers ──
  tiers() { const T = this.p.takes; return T.tiers || { all: [T.min, T.max] }; }
  /** A tier for a player: the one furthest under its share of the mood's (or the preset's) mix, a little at random. */
  pickTier(except) {
    const tiers = this.tiers(), names = Object.keys(tiers), mix = this.mood?.mix || this.p.takes.mix || {};
    const w = Object.fromEntries(names.map((x) => [x, mix[x] ?? 1])), sum = names.reduce((a, x) => a + w[x], 0) || 1;
    const have = Object.fromEntries(names.map((x) => [x, 0])); let n = 0;
    for (const pl of this.players) if (pl !== except && !pl.leaving && !pl.rest && pl.tier in have && pl.voices.some((v) => !v.out)) { have[pl.tier]++; n++; }
    let best = names[0], score = -Infinity;
    for (const x of names) { if (!w[x]) continue; const sc = w[x] / sum - have[x] / (n + 1) + this.r.next() * 0.25; if (sc > score) { score = sc; best = x; } }
    return best;
  }
  /** A take length (seconds) for a new take: a tier by the mix, a length in it. */
  takeSeconds() {
    const tiers = this.tiers(), mix = this.mood?.mix || this.p.takes.mix || {}, names = Object.keys(tiers).filter((x) => (mix[x] ?? 1) > 0);
    let u = this.r.next() * names.reduce((a, x) => a + (mix[x] ?? 1), 0), pick = names[0];
    for (const x of names) { u -= mix[x] ?? 1; if (u <= 0) { pick = x; break; } }
    return this.r.range(tiers[pick]);
  }
  gainTarget() { return (this.p.level ?? 1) / Math.sqrt(this.n) * 2; }
  spk(pl, action = 1, target = 0) {
    this.w.send('/s_new', 'mspk', NODE.spk + pl.i, action, target, 'inbus', 2 + pl.i, 'hp', pl.colour.hp, 'lp', Math.min(this.top, pl.colour.lp), 'drive', pl.colour.drive);
  }

  /** `bootSync` and `vendor` ({ wasmModule, glue }) from scsynth-sync.mjs, so the engine imports no runtime. */
  async boot(bootSync, vendor) {
    const defs = [compile(SPEAKER, { name: 'mspk', bus: MIX_BUS }), compile(DRY(MAX_PLAYERS), { name: 'mdry', bus: MIX_BUS }),
      compile(REVERB(MAX_PLAYERS, Math.min(6000, this.top)), { name: 'mrev', bus: MIX_BUS }), compile(masterProgram(MIX_BUS, { ...MASTER, ...MEM_MASTER, ...this.p.master }), { name: 'mmst' })];
    for (const d of defs) if (!d.ok) throw new Error(`a SynthDef did not compile: ${d.message}`);
    const w = this.w = await bootSync({ ...vendor, inputs: MAX_PLAYERS + 2, sr: this.sr, log: (l) => this.log(`wasm: ${l}`) });
    const boot = async (p) => { let r; p.then((x) => { r = x; }); for (let i = 0; i < 4000 && r === undefined; i++) { w.quantum((c, b) => b.fill(0)); if (i % 8 === 7) await new Promise((s) => setTimeout(s, 0)); } return r; };
    const done = (cmd) => (m) => (m[0] === '/done' && m[1] === cmd) || m[0] === '/fail';
    if ((await boot(w.ask(done('/notify'), 3000, '/notify', 1)))?.[0] !== '/done') throw new Error('wasm scsynth did not answer /notify');
    for (const d of defs) { const a = await boot(w.ask(done('/d_recv'), 5000, '/d_recv', d.bytes)); if (a?.[0] !== '/done') throw new Error(`scsynth refused ${d.name}: ${a ? a.join(' ') : 'no answer'}`); }
    for (const pl of this.players) this.spk(pl);
    w.send('/s_new', 'mdry', NODE.dry, 1, 0, 'dry', this.opening ? this.p.open.dry ?? 0.5 : this.p.dry ?? 0);
    const rv = this.p.room.reverb;
    w.send('/s_new', 'mrev', NODE.rev, 1, 0, 'room', rv.room, 'damp', rv.damp, 'level', rv.level, 'sd', (this.opening ? this.p.open.dry ?? 0.5 : this.p.dry ?? 0) * 0.5);
    w.send('/s_new', 'mmst', NODE.mst, 1, 0);
    this.ins = Array.from({ length: MAX_PLAYERS + 2 }, () => new Float32Array(QUANTUM));
    this.room(true);
    return this;
  }

  // ── the takes ──
  /** Copies a take out of the ring now, or returns why not. */
  //   Where in the ring: a dozen places drawn across all it holds (half of them in its last 30 s, so the moment still
  //   comes first), each moved to its strongest onset within 2 s and kept only if it passes the level gate and does not
  //   overlap the last few takes (with `apart` seconds to spare); then one of those drawn with talk weighted down by
  //   `takes.speech` (1 takes talk as anything else, 0.2 at a fifth the weight, 0 never unless there is nothing else).
  takeFromRing(seconds, { talk = false } = {}) {   // talk: take talk as it comes (a drone slot, where it is texture)
    const T = this.p.takes, r = this.r, need = Math.round(seconds * 100), span = need + 3;
    const lastCell = Math.floor(this.ring.w / this.grid) - 2, firstCell = Math.ceil(this.ring.from / this.grid);
    if (lastCell - firstCell < span + 3) return 'not enough heard yet';
    const apart = (T.apart ?? 8) * 100, recent = this.recentTakes || [];
    const free = (a) => recent.every(([x0, x1]) => a + span + apart <= x0 || a >= x1 + apart);
    const cands = [];
    for (let k = 0; k < 12; k++) {
      const lo = k % 2 ? Math.max(firstCell, lastCell - span - 3000) : firstCell, hi = lastCell - span - 200;
      if (hi <= lo) continue;
      const c = lo + Math.floor(r.next() * (hi - lo));
      const s = findStart(this.ring.cellsOf(c, Math.min(lastCell, c + 200 + span)), span, 200, T.gateDb);
      if (s < 0 || !free(c + s)) continue;
      cands.push({ c: c + s, speech: this.ring.speech(c + s, c + s + span) });
    }
    // and the newest stretch, as before: the strongest onset in the last 10 s that leaves room for the take
    const c0 = Math.max(firstCell, lastCell - span - 1000), s = findStart(this.ring.cellsOf(c0, lastCell), span, lastCell - c0 - span, T.gateDb);
    if (s >= 0 && free(c0 + s)) cands.push({ c: c0 + s, speech: this.ring.speech(c0 + s, c0 + s + span) });
    if (!cands.length) return 'no sound';
    const wt = (x) => 1 - x.speech * (1 - (T.speech ?? 1)) + 1e-3;
    let u = r.next() * cands.reduce((a, x) => a + wt(x), 0), pick = cands[0];
    for (const x of cands) { u -= wt(x); if (u <= 0) { pick = x; break; } }
    // talk is also passed over outright at the same odds, unless nothing has been taken for a long while (a feed that
    // is all talk still gives takes): the players keep what they have or take an older take meanwhile
    const long = (this.t - (this.lastTakeAt ?? 0)) / this.sr > (this.takes.length ? 1.5 * T.every[1] : 45);   // at the start, 45 s at most
    // an opening takes its first take, talk or not
    if (pick.speech >= 0.5 && !long && !talk && !(this.firstTake && this.p.open) && r.next() > (T.speech ?? 1)) { this.counts.passed = (this.counts.passed || 0) + 1; return 'talk'; }
    this.recentTakes = [...recent, [pick.c, pick.c + span]].slice(-4);
    const f0 = pick.c * this.grid, data = this.ring.mono(f0, need * this.grid + this.seam + 2);
    // ringAt: the frame of the feed it was cut at, so a host that knows what it fed can name the source
    return this.addTake(data, need, { from: 'live', speech: pick.speech, ringAt: f0, wall: this.now() - (this.ring.w - f0) / this.sr * 1000 });
  }
  addTake(data, cs, meta) {
    let ss = 0; for (let i = 0; i < data.length; i++) { const v = data[i] / 32768; ss += v * v; }
    const rms = Math.sqrt(ss / data.length) + 1e-9;
    const take = { id: ++this.tid, data, cs, at: this.t / this.sr, uses: 0, gain: Math.min(2.5, 0.1 / rms), ...meta };   // at most +8 dB: a faint take of hiss or whistle is not turned up to everything else
    take.speech ??= speechOf(data, this.sr); this.lastTakeAt = this.t;
    this.takes.push(take); this.counts.takes++; if (meta.from !== 'live') this.counts.past++;
    if (take.speech >= 0.5) this.counts.talk = (this.counts.talk || 0) + 1;
    // a take that is not talk: the loops of talk playing are replaced soon, one after another (when talk is weighted down)
    if (take.speech < 0.5 && (this.p.takes.speech ?? 1) < 1) {
      const talking = this.players.filter((pl) => !pl.rest && !pl.leaving && !pl.toRest && pl.voices.some((v) => !v.out && v.take.speech >= 0.5));
      talking.forEach((pl, j) => { pl.replaceAt = Math.min(pl.replaceAt, this.t + (this.r.range([5, 25]) + j * 2 * (this.p.spacing ?? 0)) * this.sr); });
    }
    this.onTake?.(take);
    while (this.takes.length > this.p.takes.memory) { const k = this.takes.findIndex((x) => !x.uses); if (k < 0) break; this.takes.splice(k, 1); }
    return take;
  }
  /** A take from an earlier recording, when there is one; `recordings.decode` may answer later (live). */
  takeFromPast(seconds) {
    const rec = this.recordings, files = rec?.list() || [];
    if (!files.length) return 'no recordings';
    const f = this.r.pick(files), need = Math.round(seconds * 100), lead = 5;
    if (f.seconds < seconds + lead + 2) return 'recording too short';
    const at = this.r.next() * (f.seconds - seconds - lead - 1);
    const got = rec.decode(f.path, at, seconds + lead + 0.1);
    const land = (x) => {
      if (!x || x.length < (need + 3) * this.grid) return;
      const s = findStart(cellsOfMono(x, this.grid), need + 3, Math.floor(lead * 100), this.p.takes.gateDb);
      if (s < 0) { this.counts.gated++; return; }
      const piece = x.slice(s * this.grid, s * this.grid + need * this.grid + this.seam + 2), sp = speechOf(piece, this.sr);
      if (sp >= 0.5 && this.r.next() > (this.p.takes.speech ?? 1)) { this.counts.passed = (this.counts.passed || 0) + 1; return; }   // talk, passed over
      this.addTake(piece, need, { from: f.name, speech: sp, wall: f.mtime - (f.seconds - at - s / 100) * 1000 });
    };
    if (got?.then) got.then(land, (e) => this.log(`past take failed: ${e.message}`)); else land(got);
    return null;
  }
  clear() { this.takes = []; for (const pl of this.players) { for (const v of pl.voices) this.fadeOut(v, 2); pl.replaceAt = this.t + this.sr * 4; } this.ring.clear(); }

  // ── voices ──
  liveLengths(except) { const o = []; for (const pl of this.players) for (const v of pl.voices) if (v !== except && !v.out) o.push(v.cs); return o; }
  newVoice(take, cs, inF = 0, { proc = true, base = 1 } = {}) {
    const P = this.p.process, r = this.r;
    let rate = base;   // a slot's base speed; the varispeed glides are relative to it
    if (proc && r.chance(P.speed.p * this.proc)) rate = base * r.range([P.speed.lo, P.speed.hi]);
    if (proc && r.chance(P.reverse * this.proc)) rate = -rate;
    rate = talkRate(rate, base, take);
    // `process.octave`: now and then a loop exactly two octaves down, in tune with the rest, held there (no speed glides)
    const octave = proc && !!P.octave && r.chance(P.octave.p * this.proc);
    if (octave) rate = (Math.sign(rate) || 1) * 0.25;
    const v = { id: ++this.vid, take, cs, len: cs * this.grid, in: inF, t0: this.t, ph0: 0, r0: rate, r1: rate, T: 0, phStart: 0,
      base, seed: (this.seed ^ Math.imul(this.vid, 2654435761)) | 0, dis: proc ? r.range(P.disintegrate) * Math.min(1.5, this.proc) : 0, cg: 1, lp: 0, pass: 0,
      octave, speedAt: !octave && proc && P.speed.p > 0 ? this.t + r.range(P.speed.every) * this.pace * this.sr : Infinity, fin: null, out: null };
    take.uses++;
    return v;
  }
  /** `enter`: from silence, on a raised cosine, which starts flat, so a loop arriving is not an attack. */
  fadeIn(v, s, enter = false) { v.fin = { t: this.t, n: Math.max(1, s * this.sr), enter }; }
  fadeOut(v, s) { if (v.out) return; v.out = { t: this.t, n: Math.max(1, s * this.sr) }; }
  /** A new take, or an old one come back, crossfaded into a player at a length no other live loop shares a factor with. */
  replace(pl) {
    const T = this.p.takes, r = this.r;
    if (!this.takes.length) { pl.replaceAt = this.t + this.sr; return; }
    const slot = this.slotAt(pl.k), tier = slot?.tier && this.tiers()[slot.tier] ? slot.tier : this.pickTier(pl), [lo, hi] = this.tiers()[tier], fits = (x) => x.cs >= lo * 100;
    // fresh takes newest first, talk after the rest; an older take comes back by `revisit`, or when the feed offers only talk
    const talky = (x) => x.speech >= 0.5;
    let fresh = this.takes.filter((x) => !x.played && fits(x)).sort((a, b) => talky(a) - talky(b) || b.id - a.id);
    const old = this.takes.filter(fits), calmOld = old.filter((x) => !talky(x));
    let revisit = old.length > 0 && r.chance(T.revisit);
    if (!fresh.length && !revisit) {   // nothing new of this length in memory: a take now, if the feed has sound
      const got = this.takeFromRing(r.range([lo, hi]), { talk: !!slot?.tier });
      if (typeof got !== 'string') fresh = [got];
    }
    // a slot with its own tier (the low drone) waits for a take that long rather than looping a short one
    // and after 15 s with nothing that long, the longest take there is, if it is 4 s or more
    if (slot?.tier && !fresh.length && !old.length) {
      pl.waitSince ??= this.t;
      const longest = this.takes.reduce((a, x) => (!a || x.cs > a.cs ? x : a), null);
      if (this.t - pl.waitSince < 15 * this.sr || !longest || longest.cs < 400) { pl.replaceAt = this.t + 5 * this.sr; return; }   // never shorter than 4 s
      fresh = [longest];
    }
    pl.waitSince = null;
    if (!revisit && fresh.length && talky(fresh[0]) && calmOld.length && r.next() > (T.speech ?? 1)) revisit = true;
    let take;
    if (fresh.length && !revisit) take = fresh[0];
    else {
      let pool = revisit && calmOld.length && r.next() > (T.speech ?? 1) ? calmOld : old.length ? old : this.takes;
      // preset `takes.alone`: no two players loop one take; a player waits up to 20 s for one of its own
      if (T.alone) {
        const busy = new Set(this.players.filter((p) => p !== pl).flatMap((p) => p.voices.filter((v) => !v.out).map((v) => v.take.id)));
        const mine = pool.filter((x) => !busy.has(x.id)), any = this.takes.filter((x) => !busy.has(x.id));
        if (mine.length) pool = mine; else if (any.length) pool = any;
        else { pl.aloneSince ??= this.t; if (this.t - pl.aloneSince < 20 * this.sr) { pl.replaceAt = this.t + 3 * this.sr; return; } }
      }
      take = r.pick(pool);
    }
    pl.aloneSince = null;
    take.played = true;
    const cur = pl.voices.find((v) => !v.out);
    const minCs = Math.min(lo * 100, take.cs), maxCs = Math.min(hi * 100, take.cs);
    const { n } = chooseLength(r, minCs, maxCs, this.liveLengths(cur), T.minLcm);
    const v = this.newVoice(take, n, 0, { base: slot?.rate ? r.range(slot.rate) : 1 });
    const x = r.range(T.xfade) * (tier === 'long' ? 1.5 : 1);
    if (cur) this.fadeOut(cur, x);
    if (cur) this.fadeIn(v, x); else if (this.p.open && !this.counts.replaced) this.fadeIn(v, 3, true); else this.fadeIn(v, T.fadeIn ? r.range(T.fadeIn) : Math.max(2, x * 0.7), true);   // preset `takes.fadeIn`, seconds
    pl.voices.push(v); pl.freezing = false; pl.tier = tier; this.counts.replaced++; this.changed();
    // a long loop lives long enough to be heard round three times, within the preset's longest life
    const talkLife = take.speech >= 0.5 ? 0.5 + 0.5 * (T.speech ?? 1) : 1;   // talk, when it comes, does not stay long
    // a share of the loops stay long (preset `takes.stay`), the rest come and go at `life`
    const life = slot?.life ? r.range(slot.life) : T.stay && r.chance(T.stay.p) ? r.range(T.stay.life) : r.range(T.life);
    pl.replaceAt = this.t + Math.max(life, Math.min(3 * n / 100, T.life[1])) * this.pace * talkLife * this.sr;
    // a freeze, now and then, partway through the take's life
    const F = this.p.process.freeze;
    if (F.p > 0 && r.chance(F.p * this.proc)) pl.freezeAt = this.t + r.range([0.25, 0.6]) * (pl.replaceAt - this.t); else pl.freezeAt = Infinity;
  }
  /** The loop shrinks to a second or so where it is now and holds there, until the next replacement. */
  freeze(pl) {
    const cur = pl.voices.find((v) => !v.out); pl.freezeAt = Infinity;
    if (!cur) return;
    const F = this.p.process.freeze, r = this.r;
    const ph = phaseAt(cur, this.t), pos = ((ph % cur.len) + cur.len) % cur.len;
    const { n } = chooseLength(r, F.len[0] * 100, F.len[1] * 100, this.liveLengths(cur), 0);
    const room = cur.take.data.length - this.seam - 2 - n * this.grid;
    if (room <= 0) return;
    const inF = Math.min(room, cur.in + Math.floor(pos));
    const v = this.newVoice(cur.take, n, inF, { proc: false });
    v.dis = Math.min(1, cur.dis * 1.5 + 0.05); v.r0 = v.r1 = Math.abs(rateAt(cur, this.t)) * Math.sign(cur.r1 || 1);
    this.fadeOut(cur, 1.5); this.fadeIn(v, 1.5); pl.voices.push(v); pl.freezing = true; this.counts.freezes++; this.changed();
    pl.replaceAt = Math.min(pl.replaceAt, this.t + r.range(F.hold) * this.sr);
  }
  glide(v) {
    const P = this.p.process.speed, r = this.r, t = this.t;
    const ph = phaseAt(v, t), now = rateAt(v, t), sign = Math.sign(now) || 1;
    v.ph0 = ph; v.t0 = t; v.r0 = now; v.r1 = talkRate(sign * r.range([P.lo, P.hi]) * (v.base ?? 1), v.base ?? 1, v.take); v.T = r.range(P.glide) * this.sr;
    v.speedAt = t + r.range(P.every) * this.pace * this.sr; this.counts.glides++; this.changed(0.5);
  }

  // ── the performer, once a quantum ──
  perform() {
    const t = this.t, T = this.p.takes, r = this.r;
    if (t >= this.nextTake) {
      const secs = this.firstTake && this.p.open ? this.r.range([2, 4]) : this.takeSeconds();   // an opening's first take is short, so it comes soon
      const why = this.recordings && r.chance(T.past) ? this.takeFromPast(secs) : this.takeFromRing(secs);
      if (typeof why === 'string') { if (why === 'no sound') this.counts.gated++; this.nextTake = t + (why === 'talk' ? r.range(T.every) * this.pace : 2) * this.sr; }   // talk passed over: the next try at the usual pace, so talk comes in at `speech` times the rate
      else {
        // with `alone`, a take every 3 to 6 s until there is one for each player, then at the preset's pace
        this.nextTake = t + (T.alone && this.takes.length < this.n ? r.range([3, 6]) : r.range(T.every) * this.pace) * this.sr;
        if (this.firstTake) {   // the players come in one by one after the first take, as a looper fills
          this.firstTake = false;
          // a kept slot (the drone) waits for its own long take and takes no place in the line
          let at = t; for (const pl of this.players) if (!pl.rest) { pl.replaceAt = at; if (!this.slotAt(pl.k)?.keep) at += r.range(this.p.enter) * this.sr; }
          this.wakeAt = at;
        }
      }
    }
    if (t >= this.enterAt) this.enter();
    if (t >= this.balanceAt) { if (t >= this.moodEnd) this.newMood(); this.balance(); this.balanceAt = t + this.sr; }
    if (t >= this.colourNext && this.opening) this.openStep(t);
    if (t >= this.colourNext) {
      this.colourNext = t + this.sr / 4;
      if (this.p.colour.walk) for (const pl of this.players) this.walkColour(pl, t);
      if (this.p.room.reverb?.walk) this.walkReverb(t);
      if (this.p.solo) this.stepSolo(t);
    }
    for (let j = this.players.length - 1; j >= 0; j--) {   // a leaving player whose loop has faded is let go
      const pl = this.players[j];
      if (pl.leaving && !pl.voices.length) this.drop(pl);
    }
    for (const pl of this.players) {
      if (pl.leaving || pl.toRest) {   // its loop's life is over: it fades out instead of taking another
        if (t >= pl.replaceAt) {
          if (!this.calm() && pl.toRest) { pl.replaceAt = this.later(); continue; }
          for (const v of pl.voices) this.fadeOut(v, this.r.range(T.xfade) * 1.5);
          pl.replaceAt = pl.freezeAt = Infinity; if (pl.toRest) { pl.rest = true; pl.toRest = false; this.changed(); }
        }
      } else if (t >= pl.replaceAt) { if (this.calm()) this.replace(pl); else pl.replaceAt = this.later(); }
      else if (t >= (pl.freezeAt ?? Infinity)) {
        const F = this.p.process.freeze, frozen = this.players.filter((x) => x.freezing).length;
        if (this.calm() && frozen < (F.max ?? 1)) this.freeze(pl); else pl.freezeAt = this.later() + this.sr * 5;
      }
      for (const v of pl.voices) {
        if (!v.out && t >= v.speedAt) {
          const S = this.p.process.speed, gliding = this.players.reduce((a, x) => a + x.voices.filter((u) => !u.out && t < u.t0 + u.T).length, 0);
          if (this.calm() && gliding < (S.max ?? 2)) this.glide(v); else v.speedAt = this.later() + this.sr * 3;
        }
        if (!v.out && v.pass >= this.p.process.maxPasses && t < pl.replaceAt - 1) pl.replaceAt = t;   // worn out
      }
    }
    if (t >= this.roomAt) { this.room(); this.roomAt = t + Math.round(0.1 * this.sr); }
  }

  /** Where each speaker is now, sent to scsynth; arrangements held, then moved between slowly. */
  room(first = false) {
    const t = this.t, rm = this.p.room, r = this.r, a = this.arr, n = this.n, sw = this.sw;
    if (!a.to && t >= a.holdUntil && rm.arrangements.length > 1) {
      a.to = r.pick(rm.arrangements.filter((x) => x !== a.from)); a.moveAt = t; a.moveS = r.range(rm.move);
      if (a.to === 'corner') a.side = r.chance(0.5) ? 1 : -1;
    }
    const lay = (name) => ARRANGEMENTS[name](n, a.side);
    let k = 0, A = lay(a.from), B = A;
    if (a.to) {
      B = lay(a.to); k = smooth((t - a.moveAt) / (a.moveS * this.sr));
      if (k >= 1) { a.from = a.to; a.to = null; A = B; k = 0; a.holdUntil = t + r.range(rm.hold) * this.sr; }
    }
    // a new preset's glide: from where each speaker was (a leaving one stays there) and the old reverb to the new
    const g = sw ? smooth((t - sw.t) / (GLIDE_S * this.sr)) : 1, mix = (x, y) => x + (y - x) * g;
    const rv = sw ? Object.fromEntries(['room', 'damp', 'level', 'send'].map((key) => [key, mix(sw.rv[key] ?? 1, rm.reverb[key] ?? 1)])) : rm.reverb;
    const rmNow = sw ? { ...rm, itd: mix(sw.itd, rm.itd ?? 0.0006), reverb: rv } : rm;
    const sets = [];
    for (const pl of this.players) {
      const wa = pl.walk ? this.walkAt(pl.walk.a, t) : 0, wd = pl.walk ? this.walkAt(pl.walk.d, t) : 0;
      let ang, dist;
      if (pl.leaving || pl.k >= n) ({ a: ang, d: dist } = pl.base || { a: 0, d: 1 });
      else {
        ang = ((1 - k) * A[pl.k].a + k * B[pl.k].a) * (rm.width ?? 1);
        dist = ((1 - k) * A[pl.k].d + k * B[pl.k].d) * (rm.distance ?? 1);
        if (sw && pl.from) { ang = pl.from.a + (ang - pl.from.a) * g; dist = pl.from.d + (dist - pl.from.d) * g; }
      }
      pl.base = { a: ang, d: dist };
      ang += wa; dist = Math.max(0.5, dist * (1 + wd));
      const c = place(ang, dist, rmNow), top = this.top;
      c.air = Math.min(top, c.air); c.fl = Math.min(top, c.fl); c.fr = Math.min(top, c.fr);
      pl.at = { a: ang, d: dist };
      this.w.send('/n_set', NODE.spk + pl.i, 'gl', c.gl, 'gr', c.gr, 'dl', c.dl, 'dr', c.dr, 'fl', c.fl, 'fr', c.fr, 'gain', c.gain, 'air', c.air);
      sets.push(`s${pl.i}`, c.send);
    }
    this.w.send('/n_set', NODE.rev, ...sets, ...(sw ? ['room', rv.room, 'damp', rv.damp, 'level', rv.level] : []));
    if (sw && g >= 1) { this.sw = null; for (const pl of this.players) pl.from = null; }
    if (first) a.holdUntil = Math.max(a.holdUntil, t + 1);
  }

  // ── a new preset, while playing ──
  /**
   * The preset `name` from now on, with no cut: what plays goes on, each loop follows the new rules from its next
   * replacement; players over the new count finish their loop's life and fade out, new ones enter one by one with the
   * new `enter` spacing; places, colour, reverb, the dry feed and the level glide. Returns false for the preset in force.
   */
  setPreset(name, { force = false } = {}) {
    const next = typeof name === 'string' ? presetOf(name) : name;
    if (!force && next.name === this.p.name) return false;
    const old = this.p, t = this.t, r = this.r, a = this.arr;
    // where everything is now, for the glide
    this.sw = { t, from: old.name, rv: { ...old.room.reverb }, itd: old.room.itd ?? 0.0006 };
    for (const pl of this.players) pl.from = pl.base ? { ...pl.base } : null;
    this.p = next; this.counts.presets++;
    const n = this.n = Math.min(this.cap, next.players);
    // the players: the leaving come back first, then the rest of the change by leaving or entering
    const staying = this.players.filter((pl) => !pl.leaving).sort((x, y) => x.k - y.k);
    const back = this.players.filter((pl) => pl.leaving).reverse();
    while (staying.length < n && back.length) {
      const pl = back.shift(); pl.leaving = false; staying.push(pl);
      if (pl.replaceAt === Infinity) pl.replaceAt = pl.voices.some((v) => !v.out) ? t + r.range(next.takes.life) * this.sr : t;   // faded out: a take again now
    }
    staying.slice(n).forEach((pl) => { pl.leaving = true; });
    staying.slice(0, n).forEach((pl, k) => { pl.k = k; });
    this.enterAt = staying.length < n ? t : Infinity;
    // colour by the new preset, glided by the speakers' lag
    for (const pl of staying.slice(0, n)) {
      const c = this.colourAt(pl.k);
      pl.colour = { hp: r.range(c.hp), lp: r.range(c.lp), drive: r.range(c.drive) };
      this.w?.send('/n_set', NODE.spk + pl.i, 'hp', pl.colour.hp, 'lp', Math.min(this.top, pl.colour.lp), 'drive', pl.colour.drive);
    }
    // the dry feed fades by its lag, so it is fed a little longer when the new preset has none
    if ((old.dry ?? 0) > 0) this.dryUntil = t + 6 * this.sr;
    this.setDry(next.dry ?? 0);
    // the arrangements: one of the new list, held for the new hold
    const rm = next.room;
    if (!rm.arrangements.includes(a.from) || (a.to && !rm.arrangements.includes(a.to))) {
      a.from = rm.arrangements.includes(a.to) ? a.to : r.pick(rm.arrangements); a.to = null; a.holdUntil = t + r.range(rm.hold) * this.sr;
    }
    this.newMood(true); this.balanceAt = t;
    this.log(`preset ${next.name}, was ${old.name}: ${n} players wanted, ${staying.length - n > 0 ? `${staying.length - n} leaving` : staying.length < n ? `${n - staying.length} to enter` : 'as many as before'}`);
    return true;
  }
  /**
   * The preset in force with some numbers changed, for a person tuning it while it plays: every decision reads the new
   * numbers from now on, the reverb, the dry level and the colours follow at once, and only a new player count,
   * arrangement list or mood list goes through setPreset (its glide, its new mood).
   */
  edit(next) {
    const old = this.p, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    next = { ...next, name: old.name };
    if (next.players !== old.players || !same(next.room.arrangements, old.room.arrangements) || !same(next.moods, old.moods)) {
      this.counts.edits = (this.counts.edits || 0) + 1;
      return this.setPreset(next, { force: true });
    }
    this.p = next; this.counts.edits = (this.counts.edits || 0) + 1;
    const rv = next.room.reverb;
    this.w?.send('/n_set', NODE.rev, 'room', rv.room, 'damp', rv.damp, 'level', rv.level);
    this.setDry(next.dry ?? 0);
    if (!same(next.colour, old.colour)) {
      for (const pl of this.players) if (!pl.leaving) {
        const c = this.colourAt(pl.k);
        pl.colour = { hp: this.r.range(c.hp), lp: this.r.range(c.lp), drive: this.r.range(c.drive) };
        this.w?.send('/n_set', NODE.spk + pl.i, 'hp', pl.colour.hp, 'lp', Math.min(this.top, pl.colour.lp), 'drive', pl.colour.drive);
      }
    }
    return true;
  }
  /** A new player in the first free slot, while fewer play than the preset wants; the next after the preset's `enter`. */
  enter() {
    const playing = this.players.filter((pl) => !pl.leaving).length;
    if (playing >= this.n) { this.enterAt = Infinity; return; }
    const used = new Set(this.players.map((pl) => pl.i)), i = [...Array(MAX_PLAYERS).keys()].find((x) => !used.has(x));
    if (i === undefined) { this.enterAt = this.t + this.sr; return; }   // every slot still fading: a second later
    const pl = this.newPlayer(i, playing);
    pl.replaceAt = this.firstTake ? Infinity : this.t;   // before the first take the first take brings everyone in
    this.players.push(pl);
    this.spk(pl, 2, NODE.dry);   // before the dry, reverb and master nodes, so the master hears it in the same quantum
    this.enterAt = playing + 1 < this.n ? this.t + this.r.range(this.p.enter) * this.sr : Infinity;
  }
  /** A leaving player, faded out: its speaker freed, its input and send silent. */
  drop(pl) {
    this.players.splice(this.players.indexOf(pl), 1);
    this.w.send('/n_free', NODE.spk + pl.i);
    this.w.send('/n_set', NODE.rev, `s${pl.i}`, 0);
    this.ins[pl.i].fill(0);
  }

  /** One player's mono quantum: its voices, each read at its computed position. */
  fill(pl, out) {
    out.fill(0);
    const t = this.t, P = this.p.process, sg = (this.slotAt(pl.k)?.gain ?? 1) * this.soloGain(pl, this.t);   // a slot's own level (the drone's lift)
    for (const v of pl.voices) {
      const d = v.take.data, len = v.len, g = v.take.gain * this.gk * sg;
      // this quantum's pass: darker, quieter and more holes the more passes
      const ph = phaseAt(v, t);
      v.pass = Math.floor(Math.abs(ph - v.phStart) / len);
      const k = v.pass * Math.min(1, len / (6 * this.sr)), a = v.dis;   // a loop under 6 s wears by the time it has played, not by its many passes
      const lpHz = Math.min(this.top, Math.max(400, 12000 * (1 - 0.35 * a) ** k)), lpc = 1 - Math.exp(-2 * Math.PI * lpHz / this.sr);
      const pg = Math.max(0.35, 1 - 0.03 * a * k), drop = Math.min(0.6, a * 0.06 * k);
      for (let i = 0; i < QUANTUM; i++) {
        const tt = t + i;
        let env = 1;
        if (v.fin) { const x = (tt - v.fin.t) / v.fin.n; env = x >= 1 ? 1 : x <= 0 ? 0 : v.fin.enter ? (1 - Math.cos(x * Math.PI)) / 2 : Math.sin(x * Math.PI / 2); }
        if (v.out) { const x = (tt - v.out.t) / v.out.n; env *= x >= 1 ? 0 : x <= 0 ? 1 : Math.cos(x * Math.PI / 2); }
        if (env === 0) continue;
        const p = phaseAt(v, tt), pos = p - Math.floor(p / len) * len;
        const i0 = Math.floor(pos), fr = pos - i0;
        const s0 = this.at(d, v.in, i0, len), s1 = this.at(d, v.in, i0 + 1, len);
        let x = s0 + (s1 - s0) * fr;
        const hole = drop > 0 && hash3(v.seed, Math.floor(p / len), Math.floor(pos / this.cell)) < drop ? 0 : 1;
        v.cg += (hole - v.cg) * 0.01;
        v.lp += lpc * (x * v.cg - v.lp);
        out[i] += v.lp * env * g * pg;
      }
    }
    // the faded out are let go
    for (let j = pl.voices.length - 1; j >= 0; j--) { const v = pl.voices[j]; if (v.out && t + QUANTUM >= v.out.t + v.out.n) { v.take.uses--; pl.voices.splice(j, 1); } }
  }
  /** A take's sample j of the loop [in, in + len), its first this.seam frames crossfaded with what follows the loop's end. */
  at(d, inF, j, len) {
    if (j >= len) j -= len;
    if (j < this.seam) { const w = j / this.seam; return (d[inF + j] * w + d[inF + len + j] * (1 - w)) / 32768; }
    return d[inF + j] / 32768;
  }

  /** `frames` (a multiple of 128 is best; rounded up) of stereo s16le out. */
  render(frames) {
    const q = Math.ceil(frames / QUANTUM), need = q * QUANTUM * 2;
    if (this.out.length < need) this.out = new Int16Array(need);
    const o16 = this.out;
    const dl = this.ins[MAX_PLAYERS], dr = this.ins[MAX_PLAYERS + 1];
    let o = 0;
    for (let k = 0; k < q; k++) {
      this.perform();
      this.gk += (this.gainTarget() - this.gk) * this.levelK;
      for (const pl of this.players) this.fill(pl, this.ins[pl.i]);
      // the dry feed: read a little behind what has been written (and a little longer after a preset without it)
      if ((this.p.dry ?? 0) > 0 || this.t < this.dryUntil || this.opening) {
        const w = this.ring.w;
        if (this.dryRead > w - QUANTUM || this.dryRead < w - this.sr * 3) this.dryRead = Math.max(0, w - Math.round(this.sr * (this.p.dryDelay ?? 0.5)));
        for (let i = 0; i < QUANTUM; i++) { const [l, r] = this.dryRead + i < w ? this.ring.frame(this.dryRead + i) : [0, 0]; dl[i] = l; dr[i] = r; }
        this.dryRead += QUANTUM;
      } else if (this.dryUntil) { dl.fill(0); dr.fill(0); this.dryUntil = 0; }
      const ins = this.ins;
      this.onQuantum?.(ins);
      const y = this.w.quantum((c, b) => b.set(ins[c]));
      const L = y[0], R = y[1];
      for (let i = 0; i < QUANTUM; i++) {
        const l = L[i] * 32767, r = R[i] * 32767;
        o16[o++] = l > 32767 ? 32767 : l < -32768 ? -32768 : Math.round(l);
        o16[o++] = r > 32767 ? 32767 : r < -32768 ? -32768 : Math.round(r);
      }
      this.t += QUANTUM;
    }
    return this.out.subarray(0, need);
  }

  /** What MEM is doing, for the status line and the title. */
  status() {
    const loops = [];
    for (const pl of [...this.players].sort((x, y) => x.leaving - y.leaving || x.k - y.k)) {
      const v = pl.voices.find((x) => !x.out) || pl.voices[0];
      if (!v) { loops.push(null); continue; }
      const ph = phaseAt(v, this.t), pos = ((ph % v.len) + v.len) % v.len;
      loops.push({ player: pl.i + 1, leaving: pl.leaving, slot: this.slotAt(pl.k)?.name ?? null, alone: this.soloState?.pl === pl, take: v.take.id, ringAt: v.take.ringAt ?? null, file: v.take.file ?? null, len: v.cs / 100, pos: +(pos / this.sr).toFixed(2), pass: v.pass, rate: +rateAt(v, this.t).toFixed(3),
        frozen: pl.freezing, dis: +v.dis.toFixed(2), speech: +(v.take.speech ?? 0).toFixed(2), tier: pl.tier ?? null, resting: !!pl.rest, a: Math.round(pl.at?.a ?? 0), d: +(pl.at?.d ?? 0).toFixed(1), from: v.take.from, wall: v.take.wall });
    }
    const mb = (this.takes.reduce((s, x) => s + x.data.length * 2, 0) + this.ring.d.length * 2) / 1048576;
    const a = this.arr;
    return { t: +(this.t / this.sr).toFixed(1), preset: this.p.name, seed: this.seed, players: this.players.filter((pl) => !pl.leaving).length,
      want: this.n, mood: this.mood ? `${this.mood.name} ${this.moodPlayers}` : null, resting: this.players.filter((pl) => pl.rest).length, leaving: this.players.filter((pl) => pl.leaving).length, gliding: !!this.sw, takes: this.takes.length, memoryMB: +mb.toFixed(1), counts: { ...this.counts },
      arrangement: a.to ? `${a.from} to ${a.to} ${Math.round(100 * smooth((this.t - a.moveAt) / (a.moveS * this.sr)))}%` : a.from, loops };
  }
}
