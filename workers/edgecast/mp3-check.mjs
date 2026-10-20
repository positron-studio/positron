// node workers/edgecast/mp3-check.mjs <file.mp3> [--gaps gaps.json]: the cast gate's checks that need only the MP3
// (workers/cast/gate.mjs section 4 and 5, the same thresholds), plus the stream's own framing: every byte in a whole
// frame, every frame 44.1 kHz 128 kbit/s. Prints JSON and PASS or FAIL per check.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createFramer } from '../cast/mp3.mjs';

const mp3 = process.argv[2];
if (!mp3) { console.log('usage: node mp3-check.mjs <file.mp3>'); process.exit(2); }
const bytes = readFileSync(mp3);
const fr = createFramer(), frames = fr.push(new Uint8Array(bytes), true);
const odd = frames.filter((f) => f.rate !== 44100 || f.kbps !== 128).length, frameS = frames.reduce((a, f) => a + f.seconds, 0);
const ff = (...a) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mp3, ...a, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
const dec = ff();
// joining a live MP3 mid-stream, the first frame may point back into a frame the file does not have (Icecast's alike)
const errLines = dec.split('\n').filter((l) => /error|invalid|corrupt/i.test(l)), backsteps = errLines.filter((l) => /backstep/.test(l)).length, decodeErrors = errLines.length - backsteps;
const eb = ff('-af', 'ebur128=peak=true');
const num = (re) => { const m = re.exec(eb); return m ? Number(m[1]) : null; };
const I = num(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/), LRA = num(/LRA:\s+(-?[\d.]+) LU\s*\n/), TP = num(/Peak:\s+(-?[\d.inf]+) dBFS/);
const Sx = [];
for (const m of eb.matchAll(/t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.inf]+)\s+S:\s*(-?[\d.inf]+)/g)) Sx.push([+m[1], +m[3]]);
const sil = ff('-af', 'silencedetect=noise=-50dB:d=0.7');
const gaps = [...sil.matchAll(/silence_start: (-?[\d.]+)[\s\S]*?silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ at: +(+m[1]).toFixed(2), s: +(+m[3]).toFixed(2) })).filter((g) => g.at > 3);
const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', mp3, '-ac', '2', '-ar', '44100', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 }).stdout;
const xs = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2), clicks = [], hot = [], SEC = 44100 * 2;
for (let s0 = 0; s0 + SEC <= xs.length; s0 += SEC) {
  let sum = 0, pk = 0; for (let i = 0; i < SEC - 2; i++) { sum += Math.abs(xs[s0 + i + 2] - xs[s0 + i]); pk = Math.max(pk, Math.abs(xs[s0 + i])); }
  const mean = sum / SEC; for (let i = 0; i < SEC - 2; i++) { const d = Math.abs(xs[s0 + i + 2] - xs[s0 + i]); if (d > 0.25 && d > 12 * mean) { clicks.push(+((s0 + i) / SEC).toFixed(2)); i += 400; } }
  if (pk > 0.891) hot.push(s0 / SEC);
}
const abrupt = []; for (let k = 30; k < Sx.length; k++) { const [t, m] = Sx[k], p = Sx[k - 30][1]; if (t > 10 && Number.isFinite(p) && m - p > 10 && (!abrupt.length || t - abrupt.at(-1).at > 3)) abrupt.push({ at: +t.toFixed(1), rise: +(m - p).toFixed(1) }); }
const quiet = []; for (const [t, s] of Sx) if (t > 10 && s < -30 && (!quiet.length || t - quiet.at(-1).end > 2)) quiet.push({ at: +t.toFixed(1), end: +t.toFixed(1) }); else if (quiet.length && s < -30 && t - quiet.at(-1).end <= 2) quiet.at(-1).end = +t.toFixed(1);
const checks = [
  ['every byte in a whole frame', fr.skipped === 0, `${fr.skipped} bytes skipped`],
  ['every frame 44.1 kHz 128 kbit/s', odd === 0, `${odd} other`],
  ['ffmpeg decodes it with no error (a first frame reaching back is listed)', decodeErrors === 0, `${decodeErrors}, and ${backsteps} backstep`],
  ['integrated loudness -18 to -14 LUFS', I != null && I >= -18 && I <= -14, `${I} LUFS`],
  ['loudness range under 8 LU', LRA != null && LRA < 8, `${LRA} LU`],
  ['true peak under -3 dBFS', TP != null && TP < -3, `${TP} dBFS`],
  ['at most 10 seconds decoded over -1 dBFS', hot.length <= 10, `${hot.length} s`],
  ['at most 3 clicks', clicks.length <= 3, clicks.length ? `${clicks.length}: ${clicks.slice(0, 8).join(' ')} s` : 'none'],
  ['no silence over 0.7 s', !gaps.length, gaps.length ? gaps.map((g) => `${g.at} s for ${g.s} s`).join(', ') : 'none'],
  ['quiet stretches under -30 LUFS short-term (listed)', true, quiet.length ? quiet.map((q) => `${q.at} to ${q.end} s`).join(', ') : 'none'],
  ['sudden rises of 10 LU in 3 s (listed)', true, abrupt.length ? abrupt.map((a) => `${a.at} s +${a.rise}`).join(', ') : 'none'],
];
console.log(JSON.stringify({ file: mp3, bytes: bytes.length, frames: frames.length, frameSeconds: +frameS.toFixed(2), I, LRA, TP, clicks: clicks.length, hot: hot.length, gaps, quiet: quiet.length, abrupt: abrupt.length }));
let pass = true;
for (const [what, ok, got] of checks) { if (!ok) pass = false; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${got}`); }
console.log(pass ? 'PASS' : 'FAIL');
