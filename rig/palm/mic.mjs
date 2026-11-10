#!/usr/bin/env node
// The SM57 on the Fast Track Pro's input 2, to a page over the relay, in the board's own audio frames
// (rig/board/inputs.mjs sendPcm), so demo/shell/board.mjs plays it unchanged. Sends only under a
// page's lease: `input.want` holds it for 60 s, the page renews every 20 s, `input.stop` ends it.
//
//   node ~/palm/mic.mjs                        # room studio-1-mic, port circuit:capture_2
//   node ~/palm/mic.mjs --room studio-1-mic --port circuit:capture_2 --relay wss://ws.positron.studio
//   --line --port system:capture_1 --room studio-1-line --client posline   # the Circuit on input 1
//   --secs 25                                  # stop by itself after 25 s
//
// One JACK client (ffmpeg's `posmic`) and one connection, capture_2 to it, made here and undone on
// exit. Never capture_1, never any playback port, nothing of the board's.
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const ROOM = opt('--room', 'studio-1-mic');
const RELAY = opt('--relay', 'wss://ws.positron.studio');
const PORT = opt('--port', 'circuit:capture_2');
const SECS = Number(opt('--secs', 0));
const RATE = 48000, FRAME = 960, FRAME_MS = 20;   // the board's: BOARD_RATE, BOARD_FRAME_MS, mono
const LEASE_MS = 60_000, BEAT_MS = 5000;
const CLIENT = opt('--client', 'posmic'), IN = `${CLIENT}:input_1`;
if ((/capture_1$/.test(PORT) && !args.includes('--line')) || /playback/.test(PORT)) { console.error(`refusing ${PORT}: this reads the microphone only`); process.exit(2); }

const id = (n = 16) => randomBytes(n).toString('base64url').slice(0, n);
const FROM = `mic-${id(6)}`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── the capture: always on, so levels print with nobody listening ──
const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'jack', '-channels', '1', '-i', CLIENT,
  '-f', 's16le', '-ar', String(RATE), '-ac', '1', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
ff.stderr.on('data', (d) => { const t = String(d).split('\n').filter((x) => x && !/Cannot lock down/.test(x)).join(' '); if (t) log('ffmpeg:', t.slice(0, 200)); });
let connected = false;
const t0 = Date.now();
const tryConnect = () => {
  try { execFileSync('jack_connect', [PORT, IN], { stdio: 'ignore' }); connected = true; log(`${PORT} -> ${IN}`); }
  catch { if (Date.now() - t0 < 5000) setTimeout(tryConnect, 100); else { log(`could not connect ${PORT} to ${IN}`); quit(1); } }
};
setTimeout(tryConnect, 100);

let aseq = 0, sent = 0, carry = Buffer.alloc(0);
let sumSq = 0, n = 0, peak = 0;
ff.stdout.on('data', (chunk) => {
  carry = carry.length ? Buffer.concat([carry, chunk]) : chunk;
  while (carry.length >= FRAME * 2) {
    const pcm = carry.subarray(0, FRAME * 2);
    carry = carry.subarray(FRAME * 2);
    for (let i = 0; i < FRAME; i++) { const v = pcm.readInt16LE(i * 2) / 32768; sumSq += v * v; const a = Math.abs(v); if (a > peak) peak = a; }
    n += FRAME;
    if (leased() && ws?.readyState === 1) {
      // the board's frame: uint32 LE sequence, float64 LE performance.now(), then int16 LE samples
      const out = Buffer.allocUnsafe(12 + FRAME * 2);
      out.writeUInt32LE(aseq++ >>> 0, 0);
      out.writeDoubleLE(performance.now(), 4);
      pcm.copy(out, 12);
      ws.send(out); sent++;
    }
  }
});
ff.on('exit', (code, sig) => { log(`ffmpeg exited ${sig ?? code}`); quit(1); });

const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
const levels = setInterval(() => {
  if (!n) { log('no audio from ffmpeg yet'); return; }
  log(`RMS ${db(Math.sqrt(sumSq / n))} dBFS, peak ${db(peak)} dBFS, ${leased() ? `sending, ${sent} frames so far` : 'nobody listening, not sending'}`);
  sumSq = 0; n = 0; peak = 0;
}, 3000);

// ── the room: the same verbs and envelope as the board's inputs ──
let lease = 0, ws = null, seq = 0, lastHeard = Date.now(), backoff = 500, closing = false;
const leased = () => Date.now() < lease;
const send = (msg) => { if (ws?.readyState !== 1) return; ws.send(JSON.stringify({ id: id(), type: '', ...msg, from: FROM, sent: Date.now(), seq: seq++ })); };
const shape = () => ({ name: 'mic', input: 'mic', audioChannels: 1, frameMs: FRAME_MS, direct: false });
const status = () => ({ ok: leased(), source: 'mic', room: ROOM, port: PORT, frames: sent, leaseLeftMs: Math.max(0, lease - Date.now()) });

function connect() {
  if (closing) return;
  const sock = new WebSocket(`${RELAY}/room/${ROOM}/ws`);
  sock.binaryType = 'arraybuffer';
  ws = sock;
  sock.onopen = () => { backoff = 500; lastHeard = Date.now(); log(`joined ${ROOM}`); send({ type: 'board.hello', ...shape() }); };
  sock.onmessage = (e) => {
    lastHeard = Date.now();
    if (typeof e.data !== 'string') return;
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (!m || m.from === FROM) return;
    const reply = (type, body) => send({ type, re: m.id, ...body });
    if (m.type === 'input.want') {
      const was = leased();
      lease = Date.now() + LEASE_MS;
      if (!was) log(`a page asked (${m.from}), sending`);
      return reply('input.wanted', { ...status(), started: !was });
    }
    if (m.type === 'input.stop') { if (leased()) log('a page said stop'); lease = 0; return reply('input.stopped', { ok: true, source: 'mic' }); }
    if (m.type === 'audio.status') return reply('audio.started', status());
  };
  sock.onclose = () => {
    if (ws === sock) ws = null;
    if (closing) return;
    log(`socket closed, again in ${backoff} ms`);
    setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30_000);
  };
  sock.onerror = () => {};
}
connect();

const beat = setInterval(() => {
  if (lease && !leased()) { lease = 0; log('nobody renewed the lease, stopped sending'); }
  // the relay echoes our own beat back; silence for three beats means a dead socket that never closed
  if (ws?.readyState === 1 && Date.now() - lastHeard > 3 * BEAT_MS + 1000) { log('no echo, reconnecting'); try { ws.close(); } catch {} return; }
  send({ type: 'board.alive', ...shape(), audio: leased() ? 'mic' : null, frames: sent, leaseLeftMs: Math.max(0, lease - Date.now()) });
}, BEAT_MS);

function quit(code = 0) {
  if (closing) return;
  closing = true;
  clearInterval(levels); clearInterval(beat);
  if (connected) { try { execFileSync('jack_disconnect', [PORT, IN], { stdio: 'ignore' }); log(`disconnected ${PORT}`); } catch {} }
  try { ff.kill('SIGINT'); } catch {}
  try { ws?.close(); } catch {}
  log(`sent ${sent} frames`);
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => quit(0));
process.on('SIGTERM', () => quit(0));
if (SECS > 0) setTimeout(() => quit(0), SECS * 1000);
