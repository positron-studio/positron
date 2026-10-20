// node /app/light/analyse.mjs <a.wav|a.mp3> [<b>]: loudness (ebur128), clicks and dropouts for each; for a pair,
// the lag between them, the difference after aligning (dB under the signal) and how alike their loudness moves.
import { spawnSync } from 'node:child_process';

const files = process.argv.slice(2), SR = 44100;
const db = (x) => +(20 * Math.log10(Math.max(x, 1e-12))).toFixed(1);
function load(f) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1'], { maxBuffer: 2e9 }).stdout;
  const x = new Float32Array(r.buffer, r.byteOffset, r.length >> 2), n = x.length >> 1, m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = 0.5 * (x[2 * i] + x[2 * i + 1]);
  return { st: x, m, n };
}
function loudness(f) {
  const t = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const g = (re) => Number(re.exec(t.slice(t.lastIndexOf('Summary')))?.[1]);
  return { I: g(/I:\s+(-?[\d.]+) LUFS/), LRA: g(/LRA:\s+(-?[\d.]+) LU/), peak: g(/Peak:\s+(-?[\d.]+) dBFS/) };
}
/**
 * A click: a second difference far out of line with its surroundings (over 10 times the RMS of the second
 * difference in the 2048 samples around it, and over 0.02 absolute). A dropout: 64 or more exact zeros in a row
 * after the first second, inside sound.
 */
function glitches({ m, n }) {
  const d2 = new Float32Array(n);
  for (let i = 2; i < n; i++) d2[i] = m[i] - 2 * m[i - 1] + m[i - 2];
  const W = 2048; let clicks = 0, at = [];
  for (let s = SR; s + W < n; s += W) {
    let e = 0; for (let i = s; i < s + W; i++) e += d2[i] * d2[i];
    const r = Math.sqrt(e / W);
    for (let i = s; i < s + W; i++) if (Math.abs(d2[i]) > 10 * r && Math.abs(d2[i]) > 0.02) { clicks++; if (at.length < 8) at.push(+(i / SR).toFixed(2)); i += 64; }
  }
  let drops = 0, run = 0;
  for (let i = SR; i < n; i++) { if (m[i] === 0) run++; else { if (run >= 64) drops++; run = 0; } }
  return { clicks, clickAt: at, dropouts: drops };
}
const one = (f) => { const a = load(f); return { file: f.split('/').pop(), seconds: +(a.n / SR).toFixed(1), ...loudness(f), ...glitches(a), a }; };
const A = one(files[0]), out = [A];
if (files[1]) {
  const B = one(files[1]); out.push(B);
  // the lag: cross-correlation of the first 20 s (after 2 s) over +-1.5 s, on a 4x decimated envelope first, then exact
  const a = A.a.m, b = B.a.m, off = 2 * SR, len = 20 * SR, maxLag = 1.5 * SR;
  let best = 0, bv = -Infinity;
  for (let L = -maxLag; L <= maxLag; L += 4) { let s = 0; for (let i = off; i < off + len; i += 4) s += a[i] * (b[i + L] || 0); if (s > bv) { bv = s; best = L; } }
  for (let L = best - 4; L <= best + 4; L++) { let s = 0; for (let i = off; i < off + len; i++) s += a[i] * (b[i + L] || 0); if (s > bv) { bv = s; best = L; } }
  let es = 0, ed = 0; const n = Math.min(A.a.n, B.a.n - best) - SR;
  for (let i = SR; i < n; i++) { const x = A.a.st[2 * i], y = B.a.st[2 * (i + best)], x2 = A.a.st[2 * i + 1], y2 = B.a.st[2 * (i + best) + 1]; es += x * x + x2 * x2; ed += (x - y) ** 2 + (x2 - y2) ** 2; }
  // loudness moving together: per 400 ms RMS in dB, Pearson over the run
  const env = (m, sh) => { const o = []; for (let s = SR + Math.max(0, sh); s + 17640 < m.length; s += 17640) { let e = 0; for (let i = s; i < s + 17640; i++) e += m[i] * m[i]; o.push(10 * Math.log10(e / 17640 + 1e-12)); } return o; };
  const ea = env(a, 0), eb = env(b, best), k = Math.min(ea.length, eb.length);
  const mean = (v) => v.slice(0, k).reduce((p, c) => p + c, 0) / k, ma = mean(ea), mb = mean(eb);
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < k; i++) { sab += (ea[i] - ma) * (eb[i] - mb); saa += (ea[i] - ma) ** 2; sbb += (eb[i] - mb) ** 2; }
  out.push({ lagMs: +(best / SR * 1000).toFixed(2), lagSamples: best, differenceDb: db(Math.sqrt(ed / Math.max(es, 1e-20))), envelopeR: +(sab / Math.sqrt(saa * sbb)).toFixed(3), envelopeMeanDbDiff: +(mb - ma).toFixed(2) });
}
console.log(JSON.stringify(out.map(({ a, ...r }) => r), null, 1));
