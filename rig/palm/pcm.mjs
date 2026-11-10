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
//   node pcm.mjs /dev/ttyUSB0 probe                   # every 'P' 'C' variant, a table, then 4 s of 1 kHz
//                                                     # on the first that made a stream (--secs, --hz)
//
// Packet: 'P' 'A' len_hi len_lo, then len bytes. pframe starts its stream when
// its ring (8192 bytes, 0.74 s) is half full, so the first 0.5 s goes at once.
// Ctrl-C and the end send 'P' 'Q'; the Palm's watchdog stops the stream 2 s
// after the last packet anyway.
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const VALUED = ['--secs', '--pct', '--gain', '--log', '--chunk', '--hz'];
const pos = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
const dev = pos[0] || '/dev/ttyUSB0';
const kind = pos[1] || 'sine';
const PROBE = kind === 'probe';
let RATE = 11025;
const secs = Number(opt('--secs', PROBE ? 4 : 8));
const pct = Number(opt('--pct', 100));
const gain = 10 ** (Number(opt('--gain', 0)) / 20);
const CHUNK = Number(opt('--chunk', 256));
let PREFILL = Math.min(Math.round(RATE * 0.5), 6144);   // pframe's ring is 8192 bytes
const logFile = opt('--log', null);
const LIMIT = 0.5;                                   // -6 dBFS
let REL = Math.exp(-1 / (RATE * 0.010));             // 10 ms release

async function source() {
  const n = Math.round(RATE * secs);
  const x = new Float32Array(n);
  if (kind === 'sine' || PROBE) {
    const hz = Number(PROBE ? opt('--hz', 1000) : pos[2] ?? 1000);
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

const isDev = dev.startsWith('/dev/');
if (isDev) { try { execFileSync('stty', ['-F', dev, '115200', 'raw', '-echo'], { stdio: 'ignore' }); } catch {} }
const fd = fs.openSync(dev, isDev ? 'r+' : 'w');
const QUIET = Buffer.from([0x50, 0x51]);
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
const sleep0 = (ms) => new Promise((r) => setTimeout(r, ms));

// What the Palm says back. Lines starting "pcm create" answer a probe.
const answers = [];
if (isDev) {
  const reader = fs.createReadStream(dev, { flags: 'r' });
  let line = '';
  reader.on('data', (b) => {
    line += b.toString('latin1');
    let i;
    while ((i = line.indexOf('\n')) >= 0) {
      const l = line.slice(0, i); line = line.slice(i + 1);
      if (l.startsWith('pcm create')) answers.push(l);
      else if (!l.startsWith('p ')) console.log(`  palm: ${l}`);
    }
  });
  reader.on('error', () => {});
}

// 'P' 'C' type rate_hi rate_lo frames_hi frames_lo variant. Variant bits: 1 stereo,
// 2 SndStreamCreateExtended with MyPlayer's callback, 4 volume after start, 8 run 0.2 s.
const TYPES = { u8: 0x11, s16le: 0x12, s16be: 0x02 };
const create = (type, rate, frames, variant) => Buffer.from([0x50, 0x43, type, rate >> 8, rate & 0xff, frames >> 8, frames & 0xff, variant]);
const vname = (v) => [(v & 1) ? 'stereo' : 'mono', (v & 2) ? 'ext' : 'plain', (v & 4) ? 'vol-after' : 'vol-before', (v & 8) ? 'run' : ''].filter(Boolean).join(' ');
function variants() {
  const list = [];
  const add = (t, rate, frames, v) => list.push({ t, rate, frames, v });
  // The two creates first, at the default and at MyPlayer's 0 (the system's size), each run for 0.2 s.
  for (const v of [8, 10]) for (const frames of [512, 0]) add('u8', 11025, frames, v);
  for (const t of ['u8', 's16le', 's16be']) for (const rate of [8000, 11025, 22050, 44100]) for (const v of [8, 10]) add(t, rate, 512, v);
  for (const frames of [256, 1024, 4096]) for (const v of [8, 10]) add('u8', 11025, frames, v);
  for (const t of ['u8', 's16le']) for (const v of [9, 11, 12, 14]) add(t, 11025, 512, v);
  return list;
}

async function probe() {
  const rows = [];
  for (const p of variants()) {
    if (stopped) break;
    const before = answers.length;
    fs.writeSync(fd, create(TYPES[p.t], p.rate, p.frames, p.v));
    const t0 = performance.now();
    while (answers.length === before && performance.now() - t0 < 1500) await sleep0(20);
    const a = answers[before] || '(no answer in 1.5 s)';
    const m = /err 0x(\w+) vol 0x(\w+)(?: start 0x(\w+) pulls (\d+) under (\d+))?/.exec(a);
    rows.push({ ...p, a, err: m ? parseInt(m[1], 16) : null, vol: m?.[2], start: m?.[3], pulls: m?.[4], under: m?.[5] });
    await sleep0(50);
  }
  console.log('\ntype   rate   frames variant                      err     vol     start   pulls under');
  for (const r of rows) {
    const hex = (x) => x == null ? '-' : '0x' + String(x).padStart(4, '0');
    console.log(`${r.t.padEnd(6)} ${String(r.rate).padEnd(6)} ${String(r.frames).padEnd(6)} ${vname(r.v).padEnd(28)} ${(r.err == null ? r.a : hex(r.err.toString(16))).padEnd(7)} ${hex(r.vol).padEnd(7)} ${hex(r.start).padEnd(7)} ${String(r.pulls ?? '-').padEnd(5)} ${r.under ?? '-'}`);
  }
  // Prefer a variant whose callback was seen to run, then any that made a stream.
  const ran = (r) => r.err === 0 && r.start === '0' && Number(r.pulls) > 0;
  const ok = rows.find((r) => ran(r) && r.rate === 11025) || rows.find(ran) || rows.find((r) => r.err === 0 && r.rate === 11025) || rows.find((r) => r.err === 0);
  if (!ok) { console.log('\nno variant made a stream'); return null; }
  console.log(`\nstreaming on: ${ok.t} ${ok.rate} Hz ${ok.frames} frames ${vname(ok.v & 7)}`);
  fs.writeSync(fd, create(TYPES[ok.t], ok.rate, ok.frames, ok.v & 7));
  const before = answers.length;
  const t0 = performance.now();
  while (answers.length === before && performance.now() - t0 < 1500) await sleep0(20);
  console.log(`  palm: ${answers[before] || '(no answer)'}`);
  return ok;
}
const head = (n) => Buffer.from([0x50, 0x41, n >> 8, n & 0xff]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (PROBE) {
  if (!isDev) { console.error('probe needs the device'); process.exit(2); }
  const ok = await probe();
  if (!ok) { fs.writeSync(fd, QUIET); process.exit(1); }
  RATE = ok.rate;
  PREFILL = Math.min(Math.round(RATE * 0.5), 6144);
  REL = Math.exp(-1 / (RATE * 0.010));
}
const { out: pcm, peak } = toU8(await source());
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
process.exit(0);
