// node workers/chamber/client.mjs <ws url> <mode full|ring|echo> <frame ms 20|170> <seconds> <out.wav> [file.mp3]
// Decodes a cached file to 48 kHz stereo s16 with ffmpeg, sends it to the chamber in real time, one message per frame
// (the adapter's shape: at most 32 KB), writes what comes back to a WAV, and prints the timings as JSON.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const [url, mode = 'full', frameMs = '20', secs = '60', outWav = 'out.wav', file = `${homedir()}/.cache/positron-cast-files/evt_1791829792104.mp3`] = process.argv.slice(2);
const SR = 48000, FMS = Number(frameMs), N = Math.round(SR * FMS / 1000), SECS = Number(secs), START = 30;
const pcm = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(START), '-t', String(SECS + 1), '-i', file, '-f', 's16le', '-ac', '2', '-ar', String(SR), 'pipe:1'], { maxBuffer: 1e9 }).stdout;
const frames = Math.floor(pcm.length / 4 / N);
if (N * 4 > 32768) throw new Error(`a ${FMS} ms frame is ${N * 4} bytes, over 32 KB`);
const ws = new WebSocket(url); ws.binaryType = 'arraybuffer';
const sentAt = [], rtt = [], work = [], outs = [];
let booted = null, stats = null, errors = [], got = 0, maxBehind = 0, late = 0;
const t0 = { boot: 0 };
const done = new Promise((ok) => {
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const m = JSON.parse(ev.data);
      if ('booted' in m) { booted = m; booted.clientBootMs = Date.now() - t0.boot; if (!m.booted) { console.error(JSON.stringify(m, null, 1)); ws.close(); ok(); return; } run(); }
      else if (m.stats) { stats = m.stats; ws.close(); ok(); }
      else if (m.error) errors.push(m.error);
      return;
    }
    const h = new Float64Array(ev.data, 0, 3), seq = h[0];
    work.push(h[1]); rtt.push(performance.now() - sentAt[seq]);
    outs.push(Buffer.from(ev.data.slice(24)));
    got++;
  };
  ws.onclose = () => ok();
  ws.onerror = (e) => { errors.push(String(e.message || e)); ok(); };
});
ws.onopen = () => { t0.boot = Date.now(); ws.send(JSON.stringify({ cmd: 'boot', mode, seed: 7 })); };
async function run() {
  const start = performance.now();
  for (let i = 0; i < frames; i++) {
    const due = start + i * FMS;
    let now = performance.now();
    if (due > now) await new Promise((r) => setTimeout(r, due - now));
    now = performance.now();
    if (now - due > FMS) late++;
    sentAt[i] = performance.now();
    ws.send(pcm.subarray(i * N * 4, (i + 1) * N * 4));
    maxBehind = Math.max(maxBehind, i - got);
  }
  const t = performance.now(); while (got < frames && performance.now() - t < 10000) await new Promise((r) => setTimeout(r, 20));
  ws.send(JSON.stringify({ cmd: 'stats' }));
}
await done;
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3) : null; };
const body = Buffer.concat(outs), hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + body.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(body.length, 40);
writeFileSync(outWav, Buffer.concat([hdr, body]));
const sumWork = work.reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ url, mode, frameMs: FMS, frameBytes: N * 4, sent: frames, got, inSeconds: +(frames * N / SR).toFixed(2), outSeconds: +(body.length / 4 / SR).toFixed(2),
  boot: booted && { ok: booted.booted, clientMs: booted.clientBootMs, timing: booted.timing, scene: booted.scene, memoryBytes: booted.memoryBytes, logs: booted.logs?.slice(0, 8) },
  workMs: { median: q(work, 0.5), p99: q(work, 0.99), worst: q(work, 1), sum: +sumWork.toFixed(1), perAudioSecond: +(sumWork / (frames * N / SR)).toFixed(2), zeros: work.filter((x) => x === 0).length },
  rttMs: { median: q(rtt, 0.5), p90: q(rtt, 0.9), p99: q(rtt, 0.99), worst: q(rtt, 1) }, overFrame: rtt.filter((x) => x > FMS).length, sendLate: late, maxBehind, errors: errors.slice(0, 5), stats }, null, 1));
