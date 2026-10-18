// What an archive file mostly is, speech, field or music, from measured features of its mono samples.
// A guess from numbers, nobody listened: `classify` says `ambiguous` rather than forcing a kind. why: lessons/workers-cast.md#kind
export const KIND_SR = 16000;
const HOP = 160, WIN = 512, BIN = KIND_SR / WIN;     // 10 ms hops, 32 ms frames, 31.25 Hz bins

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr0 = Math.cos(ang), wi0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = t;
      }
    }
  }
}
const hann = (n) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
const median = (a) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
const r3 = (x) => (x == null ? null : +x.toFixed(3));

/**
 * Features of mono samples at KIND_SR, over frames within 45 dB of the loudest:
 * `syll` the 3 to 6 Hz density of the loudness envelope's modulation over the density around it (1 for noise),
 * `depth` that envelope's spread in dB, `gaps` short silences (50 to 500 ms, 15 dB under the median) a minute,
 * `tonal` the share of frames holding a spectral peak 300 Hz to 4 kHz on one bin for 200 ms,
 * `flat` the median flatness of the pink-whitened spectrum, `beat` the median onset autocorrelation peak at 0.3 to 1.5 s.
 */
export function features(x) {
  const w = hann(WIN), nF = Math.max(0, Math.floor((x.length - WIN) / HOP));
  const lo = Math.round(100 / BIN), hi = Math.round(6000 / BIN), pLo = Math.round(300 / BIN), pHi = Math.round(4000 / BIN);
  const eDb = new Float64Array(nF), flat = new Float64Array(nF), flux = new Float64Array(nF), peaks = new Uint8Array(nF * (pHi + 2));
  const re = new Float64Array(WIN), im = new Float64Array(WIN), P = new Float64Array(hi + 8);
  let prev = new Float64Array(hi + 1), cur = new Float64Array(hi + 1);
  for (let f = 0; f < nF; f++) {
    const o = f * HOP;
    for (let i = 0; i < WIN; i++) { re[i] = x[o + i] * w[i]; im[i] = 0; }
    fft(re, im);
    let e = 0, lg = 0, ew = 0, fl = 0;
    for (let k = 1; k < hi + 8; k++) P[k] = re[k] * re[k] + im[k] * im[k] + 1e-12;
    for (let k = lo; k <= hi; k++) {
      const pw = P[k] * k;                    // times f: pink noise reads flat
      e += P[k]; ew += pw; lg += Math.log(pw); cur[k] = Math.sqrt(P[k]);
      const d = cur[k] - prev[k]; if (d > 0) fl += d;
    }
    const nb = hi - lo + 1;
    eDb[f] = 10 * Math.log10(e / nb); flat[f] = Math.exp(lg / nb) / (ew / nb); flux[f] = fl;
    for (let k = pLo; k <= pHi; k++) {
      if (P[k] < P[k - 1] || P[k] < P[k + 1]) continue;
      let side = 0; for (let d = 3; d <= 6; d++) side += P[k - d] + P[k + d];
      if (P[k] > 4 * side / 8) peaks[f * (pHi + 2) + k] = 1;
    }
    [prev, cur] = [cur, prev];
  }
  const top = median(Array.from(eDb).sort((a, b) => b - a).slice(0, Math.max(1, nF / 20) | 0)) ?? -200;
  const active = (f) => eDb[f] > Math.max(top - 45, -100);
  const act = []; for (let f = 0; f < nF; f++) if (active(f)) act.push(f);
  const med = median(act.map((f) => eDb[f])) ?? -200;
  let gaps = 0, q = 0;
  for (let f = 0; f <= nF; f++) { if (f < nF && eDb[f] < med - 15) { q++; continue; } if (q >= 5 && q <= 50) gaps++; q = 0; }

  // a peak held on one bin (or its neighbour) for 20 hops
  const HOLD = 20; let tonal = 0;
  for (const f of act) {
    if (f + HOLD >= nF) continue;
    let held = false;
    for (let k = pLo; k <= pHi && !held; k++) {
      if (!peaks[f * (pHi + 2) + k]) continue;
      let h = 1;
      for (; h < HOLD; h++) { const r = (f + h) * (pHi + 2); if (!(peaks[r + k] || peaks[r + k - 1] || peaks[r + k + 1])) break; }
      held = h === HOLD;
    }
    if (held) tonal++;
  }

  // loudness envelope's modulation spectrum, 2.56 s windows, 0.39 Hz bins
  const M = 256, mw = hann(M), sylls = [], depths = [];
  for (let o = 0; o + M <= nF; o += M / 2) {
    let n = 0; for (let i = 0; i < M; i++) if (active(o + i)) n++;
    if (n < M / 2) continue;
    const v = (i) => Math.max(eDb[o + i], med - 30);
    let mean = 0; for (let i = 0; i < M; i++) mean += v(i); mean /= M;
    let sd = 0; for (let i = 0; i < M; i++) sd += (v(i) - mean) ** 2; depths.push(Math.sqrt(sd / M));
    const mr = new Float64Array(M), mi = new Float64Array(M);
    for (let i = 0; i < M; i++) mr[i] = (v(i) - mean) * mw[i];
    fft(mr, mi);
    let band = 0, nb = 0, rest = 0, nr = 0;
    for (let k = 1; k < M / 2; k++) {
      const hz = k * 100 / M, p = mr[k] * mr[k] + mi[k] * mi[k];
      if (hz >= 3 && hz <= 6) { band += p; nb++; } else if ((hz >= 0.5 && hz < 2) || (hz > 8 && hz <= 12)) { rest += p; nr++; }
    }
    if (rest > 0) sylls.push((band / nb) / (rest / nr));
  }

  // onset regularity: the flux's autocorrelation over 6 s windows
  const B = 600, beats = [];
  for (let o = 0; o + B <= nF; o += B / 2) {
    let n = 0; for (let i = 0; i < B; i++) if (active(o + i)) n++;
    if (n < B * 0.7) continue;
    let mean = 0; for (let i = 0; i < B; i++) mean += flux[o + i]; mean /= B;
    const d = Float64Array.from({ length: B }, (_, i) => flux[o + i] - mean);
    let r0 = 0; for (const v of d) r0 += v * v;
    if (!r0) continue;
    let best = 0;
    for (let l = 30; l <= 150; l++) { let r = 0; for (let i = 0; i + l < B; i++) r += d[i] * d[i + l]; r /= r0 * (B - l) / B; if (r > best) best = r; }
    beats.push(best);
  }
  const min = nF / 6000;
  return { syll: r3(median(sylls)), depth: r3(median(depths)), gaps: r3(min ? gaps / min : 0), tonal: r3(act.length ? tonal / act.length : 0),
    flat: r3(median(act.map((f) => flat[f]))), beat: r3(median(beats)), seconds: Math.round(x.length / KIND_SR) };
}

/**
 * `{ kind, conf, by, lean, split }` from `features`. Music is a held tonal peak (T), speech is many short gaps in a
 * formant-shaped spectrum (S), field is neither: music T, speech S (1 - T), field (1 - T)(1 - S), which add to 1.
 * The largest is `lean`; under 0.65 the kind is `ambiguous`. The ramps were set on 13 files nobody listened to.
 */
export function classify(f) {
  const ramp = (v, a, b) => (v == null ? 0 : Math.min(1, Math.max(0, (v - a) / (b - a))));
  const T = ramp(f.tonal, 0.08, 0.18), S = ramp(f.gaps, 25, 55) * (1 - ramp(f.flat, 0.06, 0.14));
  const split = { music: T, speech: S * (1 - T), field: (1 - T) * (1 - S) };
  const [lean, conf] = Object.entries(split).sort((a, b) => b[1] - a[1])[0];
  const by = { music: `tonal ${f.tonal}`, speech: `gaps ${f.gaps}/min, flat ${f.flat}`, field: `tonal ${f.tonal}, gaps ${f.gaps}/min` }[lean];
  return { kind: conf < 0.65 ? 'ambiguous' : lean, lean, conf: +conf.toFixed(2), by, split: Object.fromEntries(Object.entries(split).map(([k, v]) => [k, +v.toFixed(2)])) };
}
