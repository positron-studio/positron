// The cast's mix mode, pure: two slots on an AM dial, the drift's clock, pink noise, the band and the
// saturation of /radio/tuner/'s graph, ported sample by sample. No I/O; sources are injected.
// why: lessons/workers-cast.md#mixer
import { createMix, DRIVE, SAT_K, handTurn, WHISTLE_SOFT } from './tuner-mix.mjs';
import { createSoften } from './sc/radio/cast/soften.mjs';
import { crossfade, dwellMix } from './sc/radio/cast/crossfade.mjs';

export const SR = 44100;
export const BLOCK = 882;                      // 20 ms
export const QUANTUM = 128;                    // filter coefficients move at Web Audio's render quantum
// /radio/scenery/'s two slots, 0.08 apart, so halfway is a blend under noise and whistle.
export const SLOTS = [{ at: 0.46, echo: 0.09 }, { at: 0.54, echo: 0.13 }];
export const DEFAULTS = { tune: SLOTS[0].at, drift: 1, dwell: 40, blend: 16, noise: 1, path: 0 };
// path: how the next blend hands over (crossfade.mjs PATHS), 0 the dial's sweep
export const LIMITS = { tune: [0, 1], drift: [0, 1], dwell: [5, 600], blend: [2, 120], noise: [0, 2], path: [0, 3] };
// The cast's whistle is WHISTLE_SOFT, and the needle crosses a blend by handTurn. why: lessons/workers-cast.md#whistle
export const WHISTLE = true;

// Each file is levelled to one loudness before the tuner: its feed item's `gain` in dB, clamped to GAIN_DB.
// why: lessons/workers-cast.md#level
export const GAIN_DB = [-14, 12];
/** The linear factor for an item's `gain`; 1 when it has none. */
export function levelOf(gain) {
  const x = Number(gain);
  return gain == null || !Number.isFinite(x) ? 1 : 10 ** (Math.min(GAIN_DB[1], Math.max(GAIN_DB[0], x)) / 20);
}

/** Clamps one control to LIMITS, or null when the name or value is not one. */
export function clampSet(name, v) {
  const lim = LIMITS[name], x = Number(v);
  if (!lim || !Number.isFinite(x)) return null;
  const c = Math.min(lim[1], Math.max(lim[0], x));
  return name === 'drift' ? (c >= 0.5 ? 1 : 0) : name === 'path' ? Math.round(c) : c;
}

/**
 * BiquadFilterNode's coefficients, normalised by a0, as the Web Audio spec writes them. Lowpass and
 * highpass read Q in dB, bandpass reads it linear. why: lessons/workers-cast.md#biquad
 */
export function biquad(type, f, q, sr = SR) {
  const w0 = 2 * Math.PI * Math.min(f, sr / 2) / sr, c = Math.cos(w0), s = Math.sin(w0);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'bandpass') {
    const al = s / (2 * q);
    b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
  } else {
    const al = s / (2 * 10 ** (q / 20));
    a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
    if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === 'highpass') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else throw new Error(`no biquad ${type}`);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** |H| of those coefficients at frequency f, for the test. */
export function gainAt({ b0, b1, b2, a1, a2 }, f, sr = SR) {
  const w = 2 * Math.PI * f / sr;
  const re = (k0, k1, k2) => k0 + k1 * Math.cos(-w) + k2 * Math.cos(-2 * w), im = (k1, k2) => k1 * Math.sin(-w) + k2 * Math.sin(-2 * w);
  const nr = re(b0, b1, b2), ni = im(b1, b2), dr = re(1, a1, a2), di = im(a1, a2);
  return Math.hypot(nr, ni) / Math.hypot(dr, di);
}

/** A mono biquad, transposed direct form II, `set(f)` moving its frequency. */
export function createBiquad(type, f, q, sr = SR) {
  let k = biquad(type, f, q, sr), z1 = 0, z2 = 0, fNow = f;
  return {
    set(fNew) { if (fNew !== fNow) { fNow = fNew; k = biquad(type, fNew, q, sr); } },
    step(x) { const y = k.b0 * x + z1; z1 = k.b1 * x - k.a1 * y + z2; z2 = k.b2 * x - k.a2 * y; return y; },
  };
}

/** tuner-mix's pinkNoise, the same loop and coefficients, into a plain array to loop. */
export function pinkBuffer(seconds = 4, rand = Math.random, sr = SR) {
  const n = sr * seconds, a = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
    a[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
  }
  return a;
}

/** The WaveShaper's curve: tanh(SAT_K x) / tanh(SAT_K) over 1024 points, read with linear interpolation. */
export function shaperCurve(k = SAT_K, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
export function shape(curve, x) {
  const n = curve.length, v = ((x + 1) / 2) * (n - 1);
  if (v <= 0) return curve[0];
  if (v >= n - 1) return curve[n - 1];
  const i = Math.floor(v), f = v - i;
  return curve[i] + (curve[i + 1] - curve[i]) * f;
}

/** A mulberry32, so a test can ask for the same noise twice. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * createTunerGraph in samples: each slot's clear (gain, then a lowpass at `bright`) and echo (gain, a
 * delay with 0.35 feedback, a 900 Hz bandpass), noise and whistle, into the mono 200 Hz highpass,
 * 3500 Hz lowpass, DRIVE, the tanh shaper and 0.8 (`drive` and `k` are options only for a test). `render(inputs, m, out)`
 * moves every gain toward `m` with setTargetAtTime's 0.04 s constant. `taps` holds each part's sum of squares for the meters.
 */
export function createTuner({ slots = SLOTS, sr = SR, rand = Math.random, drive = DRIVE, k = SAT_K } = {}) {
  const hp = createBiquad('highpass', 200, 0.7, sr), lp = createBiquad('lowpass', 3500, 0.7, sr);
  const curve = shaperCurve(k), noise = pinkBuffer(4, rand, sr);
  const a = 1 - Math.exp(-1 / (0.04 * sr));        // one sample of setTargetAtTime(tc 0.04)
  const legs = slots.map((st) => {
    const d = Math.round((st.echo ?? 0.1) * sr);
    // the per-leg lowpass never sets Q, so it has BiquadFilterNode's default, 1 (dB for a lowpass)
    return { clear: 0, echo: 0, bright: 3500, lp: createBiquad('lowpass', 3500, 1, sr),
      ring: new Float32Array(d), w: 0, dull: createBiquad('bandpass', 900, 0.9, sr) };
  });
  let nGain = 0, wGain = 0, pitch = 150, phase = 0, ni = 0;
  const taps = { slot: slots.map(() => 0), noise: 0, whistle: 0, out: 0, peak: 0, n: 0 };
  return {
    taps,
    resetTaps() { taps.slot.fill(0); taps.noise = taps.whistle = taps.out = taps.peak = 0; taps.n = 0; },
    render(inputs, m, out, { whistle: on = true } = {}) {
      const n = out.length;
      for (let i0 = 0; i0 < n; i0 += QUANTUM) {
        const i1 = Math.min(n, i0 + QUANTUM);
        for (const g of legs) g.lp.set(g.bright);
        for (let i = i0; i < i1; i++) {
          let sum = 0;
          for (let j = 0; j < legs.length; j++) {
            const g = legs[j], s = m.st[j], x = inputs[j] ? inputs[j][i] : 0;
            g.clear += (s.clear - g.clear) * a; g.echo += (s.echo - g.echo) * a; g.bright += (s.bright - g.bright) * a;
            const delayed = g.ring[g.w];
            const fed = g.echo * x + 0.35 * delayed;
            g.ring[g.w] = Math.abs(fed) < 1e-20 ? 0 : fed;   // a dying echo tail stops at zero, never in denormals
            g.w = (g.w + 1) % g.ring.length;
            const part = g.lp.step(g.clear * x) + g.dull.step(delayed);
            taps.slot[j] += part * part;
            sum += part;
          }
          nGain += (m.noise - nGain) * a;
          const nz = nGain * noise[ni]; ni = (ni + 1) % noise.length;
          wGain += ((on ? m.whistle : 0) - wGain) * a; pitch += (m.pitch - pitch) * a;
          phase += pitch / sr; if (phase >= 1) phase -= 1;
          const wh = wGain * Math.sin(2 * Math.PI * phase);
          taps.noise += nz * nz; taps.whistle += wh * wh;
          // why: lessons/workers-cast.md#drive
          const y = 0.8 * shape(curve, drive * lp.step(hp.step(sum + nz + wh)));
          out[i] = y;
          taps.out += y * y; if (Math.abs(y) > taps.peak) taps.peak = Math.abs(y);
        }
      }
      taps.n += n;
    },
  };
}

const rms = (ss, n) => (n ? Math.sqrt(ss / n) : 0);
const db = (x) => (x > 0 ? +(20 * Math.log10(x)).toFixed(1) : null);

/**
 * The mix: a queue of items, two slots, the drift's clock in audio seconds, the tuner. `open(item)`
 * returns a source `{ read(n) -> Float32Array mono, ended, close(), buffered }`. `block()` renders
 * BLOCK frames of interleaved stereo s16. why: lessons/workers-cast.md#drift
 */
/** Seconds under which a file is not played while a longer one is queued (the clip tests are 15 s, a stray stream 31 s). */
export const MIN_FILE_S = 40;
export function createEngine({ open, queue = [], set = {}, sr = SR, rand = Math.random, log = () => {}, prefetchS = 6, resume = null } = {}) {
  const ctl = { ...DEFAULTS, ...set };
  const mix = createMix(SLOTS, WHISTLE_SOFT), tuner = createTuner({ sr, rand });
  const slots = SLOTS.map(() => ({ item: null, src: null, level: 1 }));
  let items = queue.slice(), nextIdx = 0, pending = null;
  let from = 0, cycleFrom = 0, frames = 0, phase = 'dwell', k = 0, tune = ctl.tune, m = mix(tune);
  let underruns = 0, landings = 0, meter = null;
  const tSec = () => frames / sr;
  // a file measured under MIN_FILE_S is a blip that ends a scene abruptly: passed over while a longer one is queued
  const short = (it) => Number(it?.seconds) > 0 && Number(it.seconds) < MIN_FILE_S;
  const skipShort = () => { if (!items.some((x) => !short(x))) return; for (let n = 0; n < items.length && short(items[nextIdx % items.length]); n++) nextIdx = (nextIdx + 1) % items.length; };
  const peekNext = () => { if (!items.length) return null; skipShort(); return items[nextIdx % items.length]; };
  function take() { const it = peekNext(); if (it) nextIdx = (nextIdx + 1) % items.length; return it; }
  function place(j, it, src) {
    const sl = slots[j];
    try { sl.src?.close(); } catch { /* gone */ }
    sl.item = it; sl.src = src || (it ? open(it) : null); sl.level = levelOf(it?.gain); sl.played = 0;
    // after the level, before the tuner, as the page's worklet is. why: lessons/workers-cast.md#soften
    sl.soften = it?.soften ? createSoften(sr) : null;
    if (it) log(`slot ${'ab'[j]}: ${it.title}`);
  }
  function prefetch() { if (!pending) { const it = take(); if (it) pending = { item: it, src: open(it) }; } }
  function arrive(j) { if (!pending) prefetch(); if (pending) { place(j, pending.item, pending.src); pending = null; } }
  function land() {
    const to = 1 - from;
    place(from, null);
    from = to; cycleFrom = tSec(); phase = 'dwell'; k = 0; landings++;
    log(`landed on slot ${'ab'[to]}: ${slots[to].item?.title ?? 'nothing'}`);
  }
  const ended = (j) => !slots[j].src || slots[j].src.ended;
  /** Seconds the file in slot j still has to play, from the feed's length and what has been read; else unknown. */
  const left = (j) => { const sl = slots[j], d = sl.item?.seconds; return sl.src && Number.isFinite(d) ? d - (sl.played || 0) : Infinity; };

  function clock() {
    const to = 1 - from, preroll = Math.min(ctl.dwell / 2, 4);
    if (!ctl.drift) {
      // the page holds the dial: an empty slot, or one whose file ended, takes the next file
      for (let j = 0; j < slots.length; j++) if (!slots[j].item || ended(j)) arrive(j);
      phase = 'held'; k = 0; tune = ctl.tune; return;
    }
    let t = tSec() - cycleFrom;
    // a file shorter than its scene: the next is fetched and opened in time, and the blend ends with the file
    // rather than starting from its silence. why: lessons/workers-cast.md#short-files
    const early = left(from) - ctl.blend - 1;
    if (t < ctl.dwell && early <= preroll + prefetchS && !slots[to].item) prefetch();
    if (t < ctl.dwell && early <= preroll && !slots[to].item) arrive(to);
    if (t < ctl.dwell && early <= 0 && slots[to].item) { cycleFrom = tSec() - ctl.dwell; t = ctl.dwell; }
    // the station on air ran out in its dwell: start the blend now
    if (t < ctl.dwell && slots[from].item && ended(from)) { cycleFrom = tSec() - ctl.dwell; t = ctl.dwell; }
    if (t >= ctl.dwell - preroll - prefetchS && !slots[to].item) prefetch();
    if (t >= ctl.dwell - preroll && !slots[to].item) arrive(to);
    if (t < ctl.dwell) { phase = 'dwell'; k = 0; tune = SLOTS[from].at; return; }
    if (t < ctl.dwell + ctl.blend) {
      phase = 'blend'; k = (t - ctl.dwell) / ctl.blend;
      tune = SLOTS[from].at + (SLOTS[to].at - SLOTS[from].at) * handTurn(k); return;
    }
    tune = SLOTS[to].at; land();
  }

  const mono = new Float32Array(BLOCK), pcm = Buffer.alloc(BLOCK * 4);
  return {
    get frames() { return frames; },
    get seconds() { return frames / sr; },
    get ctl() { return { ...ctl }; },
    /** The tuner's last block, mono floats: what the ring hears, for a meter or a key. */
    get mono() { return mono; },
    /** The item the next file to arrive will be. */
    get nextItem() { return pending?.item ?? peekNext(); },
    /** Mix seconds when the clock's cycle began: the last landing, or the start, moved back by next(). */
    get cycleFrom() { return cycleFrom; },
    /** The item on air (the slot the needle left from), or null. */
    get onItem() { return slots[from].item; },
    // resume `{ from, cycleT }`: the first file opened `from` seconds in, `cycleT` seconds into its dwell.
    // why: lessons/workers-cast.md#handover
    start() {
      if (!slots[from].item) { const it = take(); if (it) place(from, it, resume?.from > 0 ? open(it, { from: resume.from }) : undefined); }
      if (resume?.from > 0 && slots[from].item) slots[from].played = resume.from;
      cycleFrom = tSec() - (resume?.cycleT > 0 ? resume.cycleT : 0);
    },
    /** Seconds of the file on air played so far (its seek included). */
    get onPlayed() { return slots[from].played || 0; },
    /** Drops up to `s` seconds of the file on air, no more than it holds, as if they had played; returns what it dropped. */
    skip(s) {
      const sl = slots[from], n = Math.floor(Math.min(s, sl.src?.buffered ?? 0) * sr);
      if (!sl.src || n <= 0) return 0;
      sl.src.read(n); sl.played = (sl.played || 0) + n / sr; cycleFrom -= n / sr;
      return n / sr;
    },
    /** Resolves when the slot on air holds a second of sound, has ended, or `ms` passed: the clock starts after it. */
    async ready(ms = 8000) {
      const t0 = Date.now(), src = () => slots[from].src;
      while (Date.now() - t0 < ms && src() && !src().ended && (src().buffered ?? 1) < 1) await new Promise((r) => setTimeout(r, 50));
      return Date.now() - t0;
    },
    /** Replaces what comes after the slots now playing; the next file to arrive is queue[0]. */
    queue(q) { items = q.slice(); nextIdx = 0; if (pending) { try { pending.src.close(); } catch { /* gone */ } pending = null; } },
    /** Starts the blend now, or with the dial held, puts the next file in the slot not tuned. */
    next() {
      if (ctl.drift) { const t = tSec() - cycleFrom; if (t < ctl.dwell) cycleFrom = tSec() - ctl.dwell; }
      else arrive(m.near === 0 ? 1 : 0);
    },
    set(name, v) {
      const c = clampSet(name, v);
      if (c === null) return null;
      if (name === 'drift' && c && !ctl.drift) { from = m.near; cycleFrom = tSec(); }
      ctl[name] = c;
      if (name === 'tune') ctl.drift = 0;   // a hand on the dial holds it
      return c;
    },
    block() {
      clock();
      m = ctl.path && phase === 'blend' ? crossfade(ctl.path, from, k) : ctl.path && phase === 'dwell' ? dwellMix(mix(tune), from) : mix(tune);
      m = { ...m, noise: m.noise * ctl.noise };
      const inputs = slots.map((sl) => {
        if (!sl.src) return null;
        const x = sl.src.read(BLOCK); sl.played = (sl.played || 0) + BLOCK / sr;
        if (sl.level !== 1) for (let i = 0; i < x.length; i++) x[i] *= sl.level;
        if (sl.soften) sl.soften.process(x);
        return x;
      });
      for (const sl of slots) if (sl.src?.underrun) { underruns += sl.src.underrun; sl.src.underrun = 0; }
      tuner.render(inputs, m, mono, { whistle: WHISTLE });
      for (let i = 0; i < BLOCK; i++) {
        const v = Math.max(-32768, Math.min(32767, Math.round(mono[i] * 32767)));
        pcm.writeInt16LE(v, i * 4); pcm.writeInt16LE(v, i * 4 + 2);
      }
      frames += BLOCK;
      if (tuner.taps.n >= sr) {
        const n = tuner.taps.n;
        meter = { at: +(frames / sr).toFixed(2), slot: tuner.taps.slot.map((x) => db(rms(x, n))), noise: db(rms(tuner.taps.noise, n)),
          whistle: db(rms(tuner.taps.whistle, n)), out: db(rms(tuner.taps.out, n)), peak: db(tuner.taps.peak) };
        tuner.resetTaps();
      }
      return pcm;
    },
    /** The last whole second's levels in dBFS: each slot's part, the noise, the whistle, the output. */
    get meter() { return meter; },
    status() {
      return { mode: 'mix', ...ctl, tune: +tune.toFixed(4), phase, k: +k.toFixed(3), from, landings, underruns, cycleT: +(tSec() - cycleFrom).toFixed(3),
        noiseLevel: +m.noise.toFixed(3), seconds: +(frames / sr).toFixed(2),
        slots: slots.map((sl, j) => ({ id: sl.item?.id ?? null, title: sl.item?.title ?? null, played: +(sl.played || 0).toFixed(3), seconds: sl.item?.seconds ?? null, gain: sl.item ? +(20 * Math.log10(sl.level)).toFixed(2) : 0, soften: !!sl.soften, clear: +m.st[j].clear.toFixed(3),
          echo: +m.st[j].echo.toFixed(3), buffered: sl.src ? +(sl.src.buffered ?? 0).toFixed(1) : 0, ended: !!sl.src?.ended })),
        next: pending?.item?.title ?? peekNext()?.title ?? null, meter };
    },
    close() { for (const sl of slots) { try { sl.src?.close(); } catch { /* gone */ } } try { pending?.src.close(); } catch { /* gone */ } },
  };
}

/**
 * Blocks owed to the wall clock: never more than `leadS` ahead of `now()`, the copy caster's rule.
 * `move(s)` shifts the start when the sink was down, so a reconnect never bursts.
 */
export function createClock({ now = Date.now, leadS = 2, blockS = BLOCK / SR } = {}) {
  let t0 = now(), made = 0;
  return {
    owed() { const due = (now() - t0) / 1000 + leadS; return Math.max(0, Math.floor((due - made * blockS) / blockS)); },
    made(n = 1) { made += n; },
    move(s) { t0 += s * 1000; },
    get seconds() { return made * blockS; },
    lag() { return (now() - t0) / 1000 - made * blockS; },
  };
}
