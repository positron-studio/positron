#!/usr/bin/env node
// T5 (plans/plan-palm-sound.md 2): 8 bit unsigned PCM at 11,025 Hz to pframe's
// ring over the USB serial link, paced at the sample rate, through a DC blocker
// and a -6 dBFS peak limiter so nothing leaves louder than that.
//
//   node pcm.mjs /dev/ttyUSB0 sine 1000 --secs 8     # a 1 kHz sine
//   node pcm.mjs /dev/ttyUSB0 sweep --secs 8          # 200 Hz to 4 kHz, log sweep
//   node pcm.mjs /dev/ttyUSB0 file voice.mp3 --secs 15  # any file ffmpeg reads, to mono 11,025 Hz
//   --pct 101      send at 101 % of the rate (100, 101, 103 show drift as overflow or underrun)
//   --gain -6      dB before the limiter
//   --log s.jsonl  one line for the first sample: listen.mjs --sends turns it into latency
//   node pcm.mjs out.bin sine 440 --secs 1            # packets to a file, no device
//
// Packet: 'P' 'A' len_hi len_lo, then len bytes. pframe starts its stream when
// its ring (8192 bytes, 0.74 s) is half full, so the first 0.5 s goes at once.
// Ctrl-C and the end send 'P' 'Q'; the Palm's watchdog stops the stream 2 s
// after the last packet anyway.
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const VALUED = ['--secs', '--pct', '--gain', '--log', '--chunk'];
const pos = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
const dev = pos[0] || '/dev/ttyUSB0';
const kind = pos[1] || 'sine';
const RATE = 11025;
const secs = Number(opt('--secs', 8));
const pct = Number(opt('--pct', 100));
const gain = 10 ** (Number(opt('--gain', 0)) / 20);
const CHUNK = Number(opt('--chunk', 256));
const PREFILL = Math.round(RATE * 0.5);
const logFile = opt('--log', null);
const LIMIT = 0.5;                                   // -6 dBFS
const REL = Math.exp(-1 / (RATE * 0.010));           // 10 ms release

async function source() {
  const n = Math.round(RATE * secs);
  const x = new Float32Array(n);
  if (kind === 'sine') {
    const hz = Number(pos[2] ?? 1000);
    for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * hz * i / RATE);
  } else if (kind === 'sweep') {
    let ph = 0;
    for (let i = 0; i < n; i++) { const f = 200 * (4000 / 200) ** (i / n); ph += 2 * Math.PI * f / RATE; x[i] = 0.5 * Math.sin(ph); }
  } else if (kind === 'file') {
    const file = pos[2];
    if (!file) { console.error('file needs a path'); process.exit(2); }
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-t', String(secs), '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
      { stdio: ['ignore', 'pipe', 'inherit'] });
    const bufs = [];
    for await (const b of ff.stdout) bufs.push(b);
    const all = Buffer.concat(bufs);
    const m = Math.min(n, Math.floor(all.length / 4));
    for (let i = 0; i < m; i++) x[i] = all.readFloatLE(i * 4);
    return x.subarray(0, m);
  } else {
    console.error('source is sine, sweep or file'); process.exit(2);
  }
  return x;
}

// DC blocker, gain, then a peak limiter: nothing above LIMIT leaves.
function toU8(x) {
  const out = Buffer.alloc(x.length);
  let x1 = 0, y1 = 0, env = 0, peak = 0;
  for (let i = 0; i < x.length; i++) {
    const y = x[i] - x1 + 0.995 * y1; x1 = x[i]; y1 = y;
    const v = y * gain;
    env = Math.max(Math.abs(v), env * REL);
    let s = env > LIMIT ? v * LIMIT / env : v;
    s = Math.max(-LIMIT, Math.min(LIMIT, s));
    peak = Math.max(peak, Math.abs(s));
    out[i] = Math.max(0, Math.min(255, Math.round(s * 127) + 128));
  }
  return { out, peak };
}

const { out: pcm, peak } = toU8(await source());
const isDev = dev.startsWith('/dev/');
if (isDev) { try { execFileSync('stty', ['-F', dev, '115200', 'raw', '-echo'], { stdio: 'ignore' }); } catch {} }
const fd = fs.openSync(dev, isDev ? 'r+' : 'w');
const QUIET = Buffer.from([0x50, 0x51]);
const head = (n) => Buffer.from([0x50, 0x41, n >> 8, n & 0xff]);
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`${kind}: ${pcm.length} samples, ${(pcm.length / RATE).toFixed(2)} s at ${RATE} Hz, ${pct} % pace, peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS, to ${dev}`);
const bps = RATE * pct / 100;
let sent = 0, t0 = null;
while (sent < pcm.length && !stopped) {
  // Bytes due by now: the prefill plus the rate since the first write. No drift from timer slop.
  const due = t0 === null ? PREFILL : PREFILL + (performance.now() - t0) / 1000 * bps;
  if (sent < due) {
    const n = Math.min(CHUNK, pcm.length - sent);
    fs.writeSync(fd, Buffer.concat([head(n), pcm.subarray(sent, sent + n)]));
    if (t0 === null) {
      t0 = performance.now();
      if (logFile) fs.appendFileSync(logFile, JSON.stringify({ t: Date.now(), hz: Number(pos[2]) || 1, amp: 1, test: 'pcm', label: 'first sample' }) + '\n');
    }
    sent += n;
    continue;
  }
  await sleep(Math.max(1, (CHUNK / bps) * 1000 / 2));
}
const took = t0 === null ? 0 : (performance.now() - t0) / 1000;
// Let the ring play out (at most 0.74 s), then quiet.
if (!stopped) await sleep(800);
fs.writeSync(fd, QUIET);
fs.closeSync(fd);
console.log(`${stopped ? 'stopped' : 'done'}: ${sent} bytes in ${took.toFixed(2)} s (${(sent / Math.max(took, 1e-3)).toFixed(0)} B/s), quiet sent`);
