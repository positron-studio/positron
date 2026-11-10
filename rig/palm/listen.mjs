#!/usr/bin/env node
// Listens to the Palm through the Fast Track Pro's input 2 (the microphone) for
// N seconds and prints the level, the strongest frequency, and every onset with
// its pitch. With --sends it joins the onsets to tones.mjs's send log and prints
// send to sound latency and jitter. plans/plan-palm-sound.md 2 and 4.
//
//   node listen.mjs 10                         # 10 s, auto: JACK if jackd runs, else arecord
//   node listen.mjs 10 --via arecord           # jackd not running: the card itself, keep channel 2
//   node listen.mjs 12 --sends sends.jsonl     # latency: start this first, then tones.mjs --log sends.jsonl
//   node listen.mjs 10 --wav palm.wav          # also keep the recording (mono, 16 bit, 48 kHz)
//   --band 440                onsets and their level from a Goertzel filter at this frequency, not
//                             the broadband RMS: a quiet beep under room rumble still counts
//   --port P                  the JACK port; default circuit:capture_2 when the board's alsa_in
//                             client "circuit" holds the card (jackd itself then runs on the dummy
//                             driver, so system:capture_2 is silence), else system:capture_2.
//                             Reading it adds a connection and changes none of the board's.
//   --device hw:CARD=Pro,DEV=0   the ALSA device for arecord
//
// Under jackd it adds one JACK client (ffmpeg's) and one connection from
// capture_2 to it. It never touches capture_1 or any other connection, so the
// Circuit path stays as it is. arecord cannot open the card while jackd holds it.
// The Fast Track Pro captures stereo only (arecord -c 1 is refused), so arecord
// opens two channels and keeps the second.
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const VALUED = ['--via', '--sends', '--wav', '--port', '--device', '--floor', '--band'];
const pos = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
const secs = Number(pos[0] ?? 10);
const RATE = 48000;
const jackPorts = (() => { try { return execFileSync('jack_lsp', [], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return ''; } })();
const port = opt('--port', /^circuit:capture_2$/m.test(jackPorts) ? 'circuit:capture_2' : 'system:capture_2');
const band = opt('--band', null) === null ? null : Number(opt('--band'));
const device = opt('--device', 'hw:CARD=Pro,DEV=0');
const sendsFile = opt('--sends', null);
const wavFile = opt('--wav', null);
const floorDb = Number(opt('--floor', -50));   // an onset is a 10 ms window this many dBFS or louder

const jackUp = () => jackPorts.length > 0;
const via = opt('--via', jackUp() ? 'jack' : 'arecord');
const CLIENT = 'palmlisten';

let proc, channels;
if (via === 'jack') {
  channels = 1;
  proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'jack', '-channels', '1', '-i', CLIENT,
    '-t', String(secs), '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
  // ffmpeg registers palmlisten:input_1; connect it once it exists.
  const t = Date.now();
  const tryConnect = () => {
    try { execFileSync('jack_connect', [port, `${CLIENT}:input_1`], { stdio: 'ignore' }); console.error(`listening on ${port} through JACK`); }
    catch { if (Date.now() - t < 3000) setTimeout(tryConnect, 50); else { console.error(`could not connect ${port} to ${CLIENT}:input_1`); proc.kill(); } }
  };
  setTimeout(tryConnect, 50);
} else if (via === 'arecord') {
  channels = 2;
  proc = spawn('arecord', ['-q', '-D', device, '-c', '2', '-f', 'S16_LE', '-r', String(RATE), '-t', 'raw', '-d', String(Math.ceil(secs))],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  console.error(`listening on ${device} channel 2 through arecord`);
} else {
  console.error('--via is jack or arecord'); process.exit(2);
}

// Samples of channel 2 (or the one JACK channel) as floats, with the wall time of sample 0.
// The time is taken from the first chunk's arrival less its own length: good to a JACK period
// or an ALSA period plus pipe buffering, roughly 10 to 30 ms (INFERRED, not measured).
const chunks = [];
let total = 0, t0 = null, rest = Buffer.alloc(0);
const frameBytes = 2 * channels;
proc.stdout.on('data', (buf) => {
  const now = Date.now();
  buf = rest.length ? Buffer.concat([rest, buf]) : buf;
  const frames = Math.floor(buf.length / frameBytes);
  rest = buf.subarray(frames * frameBytes);
  if (t0 === null) t0 = now - frames / RATE * 1000;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = buf.readInt16LE(i * frameBytes + (channels - 1) * 2) / 32768;
  chunks.push(out); total += frames;
});
const stop = () => { try { proc.kill('SIGINT'); } catch {} };
process.on('SIGINT', stop);
const timer = setTimeout(stop, secs * 1000 + 2000);

proc.on('close', () => {
  clearTimeout(timer);
  if (!total) { console.error('no audio arrived'); process.exit(1); }
  const x = new Float32Array(total);
  let o = 0; for (const c of chunks) { x.set(c, o); o += c.length; }
  if (wavFile) writeWav(wavFile, x);
  report(x);
});

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const fmtDb = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-inf');

function report(x) {
  let sum = 0, peak = 0;
  for (const v of x) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
  const rms = Math.sqrt(sum / x.length);
  console.log(`${(x.length / RATE).toFixed(2)} s via ${via}: RMS ${fmtDb(db(rms))} dBFS, peak ${fmtDb(db(peak))} dBFS`);
  const loud = loudestWindow(x, 8192);
  console.log(`strongest frequency: ${strongest(x.subarray(loud, loud + 8192)).toFixed(1)} Hz (the loudest 171 ms)`);

  // Onsets: 10 ms windows; an onset is the first window over the floor after at least 30 ms under it.
  const W = RATE / 100, onsets = [];
  let quiet = 3;
  for (let i = 0; i + W <= x.length; i += W) {
    let lv;
    if (band) lv = db(goertzel(x.subarray(i, i + W), band));
    else { let s = 0; for (let k = 0; k < W; k++) s += x[i + k] ** 2; lv = db(Math.sqrt(s / W)); }
    if (lv >= floorDb) {
      if (quiet >= 3) {
        const seg = x.subarray(i, Math.min(x.length, i + 4096));
        onsets.push({ at: t0 + i / RATE * 1000, ms: i / RATE * 1000, db: lv, hz: seg.length === 4096 ? strongest(seg) : NaN });
      }
      quiet = 0;
    } else quiet++;
  }
  console.log(`${onsets.length} onsets over ${floorDb} dBFS${band ? ` at ${band} Hz` : ''}`);
  for (const n of onsets) console.log(`  ${n.ms.toFixed(0).padStart(6)} ms  ${fmtDb(n.db).padStart(6)} dBFS  ${Number.isFinite(n.hz) ? n.hz.toFixed(0) + ' Hz' : ''}`);
  const gaps = onsets.slice(1).map((n, i) => n.ms - onsets[i].ms);
  if (gaps.length > 1) console.log(`inter-onset ms: mean ${mean(gaps).toFixed(1)}, sd ${sd(gaps).toFixed(1)}, min ${Math.min(...gaps).toFixed(0)}, max ${Math.max(...gaps).toFixed(0)}`);

  if (sendsFile) latency(onsets);
}

// Each send is matched to the first onset within 1 s after it.
function latency(onsets) {
  const sends = fs.readFileSync(sendsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((s) => s.amp > 0 && s.t >= t0 - 1000);
  const lat = [];
  let j = 0;
  for (const s of sends) {
    while (j < onsets.length && onsets[j].at < s.t) j++;
    if (j < onsets.length && onsets[j].at - s.t < 1000) { lat.push(onsets[j].at - s.t); j++; }
    else console.log(`  no sound for ${s.label ?? s.hz + ' Hz'} sent at ${s.t}`);
  }
  if (!lat.length) { console.log('latency: no send matched an onset'); return; }
  console.log(`latency send to sound, ${lat.length} of ${sends.length} matched: median ${median(lat).toFixed(0)} ms, ` +
    `min ${Math.min(...lat).toFixed(0)}, max ${Math.max(...lat).toFixed(0)}, sd ${sd(lat).toFixed(1)} (clock offset of the capture about 10 to 30 ms, INFERRED)`);
}

// RMS of the component at f in s (a sine of amplitude A reads A / sqrt 2, like RMS).
function goertzel(s, f) {
  const k = 2 * Math.cos(2 * Math.PI * f / RATE);
  let a = 0, c = 0;
  for (let i = 0; i < s.length; i++) { const t = s[i] + k * a - c; c = a; a = t; }
  return Math.sqrt(Math.max(0, a * a + c * c - k * a * c)) / s.length * Math.SQRT2;
}

function loudestWindow(x, n) {
  let best = 0, bestE = -1;
  for (let i = 0; i + n <= x.length; i += n / 2) {
    let e = 0; for (let k = 0; k < n; k++) e += x[i + k] ** 2;
    if (e > bestE) { bestE = e; best = i; }
  }
  return best;
}

// The strongest bin of a Hann windowed FFT, refined by parabolic interpolation.
function strongest(seg) {
  let n = 1; while (n * 2 <= seg.length) n *= 2;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = seg[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  fft(re, im);
  let k = 1, best = -1;
  const mag = (i) => Math.hypot(re[i], im[i]);
  for (let i = 2; i < n / 2 - 1; i++) { const m = mag(i); if (m > best) { best = m; k = i; } }   // skip DC and 1 bin
  const a = mag(k - 1), b = mag(k), c = mag(k + 1), d = a - 2 * b + c;
  const p = d ? 0.5 * (a - c) / d : 0;
  return (k + p) * RATE / n;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

function writeWav(file, x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
  console.error(`kept ${file}`);
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
