#!/usr/bin/env node
// The Pi's synths with the Palm as their picture: notes heard in the board's relay rooms are drawn
// on the Palm (pframe) as rings, keys, a roll, or split (a spectrogram of --wave-port over the rings);
// the default view is the Pi's USB camera on the Palm (160x160, 4 bit grey) and on the OLED (128x64, 1 bit); --voice plays the held notes on the Palm (arp, mono, echo or chip), and --pen
// turns the stylus into two Circuit macro CCs sent the way /remote/circuit/ sends them.
//
//   sudo modprobe visor                                   # pframe's tty
//   node bridge.mjs /dev/ttyUSB0 --voice --pen            # the camera on the Palm and the OLED
//   node bridge.mjs /dev/ttyUSB0 --view split             # spectrogram on top, rings below
//   node bridge.mjs /dev/ttyUSB0 --demo                   # an arpeggio made here, no relay: the Palm alone
//   node bridge.mjs --dry --snap /tmp/palm.pgm --secs 10  # no Palm: log notes, write the picture as PGM
//   node bridge.mjs /dev/ttyUSB0 --view drums             # a 16 step grid of 16 drums, drawn with the stylus, played by the board's sequencer, Plaits' wave under it
//   node bridge.mjs --dry --view drums --snap p.pgm --oled-snap o.pgm --secs 3   # no Palm, no room messages: both pictures as PGM, a made up wave off the Pi
//   --view camera|split|rings|keys|roll|drums  --drums-target drums|circuit (default drums)  --bpm 120  --cam-fps 15  --video /dev/videoN  --wave-port circuit:capture_1 (capture_2 is the SM57)  --synth-port posplaits:out_1 (drums: the wave under the grid)  --fmt 1|2|4 (default 4)  --fps N (default 15 at 4 bit, 30 at 1 bit)
//   --room studio-1   --relay wss://...   --pen-cc 80,81   --pen-ch 1   --dry   --demo   --secs N   --light (black on white; the default is white on black)   --no-oled
//   the voice (with --voice): --voice-mode arp|mono|echo|chip|plain (default arp)   --pattern up|down|updown|random
//   --rate 110 (ms an arp step)   --glide 40 (ms)   --vib 0 (cents, 5.5 Hz)   --echo 0.5 (feedback 0 to 0.85)   --echo-ms 240
//   --double off|octave|fifth|both   --tuning equal|just|q24|drift   --drums-below 36 (lower keys are noise bursts)
//   The knobs move the same settings live: palm.cc {cc, v} and palm.bend {v} in <room>, sent by /palm/ (see onCC).
//
// Where the notes come from (read only, nothing is asked of the board):
//   room <room>-circuit  `midi.send` {bytes} from /remote/circuit/ on its default relay path, and
//                        `midi.panic`. The relay echoes every message to every socket in the room.
//   room <room>          `note.on/off/panic` {note, vel, node} (Plaits, the sampler) and `screen.note`.
// Not heard: /remote/circuit/?path=direct (WebRTC straight to the Pi), the MK-425C on the Pi and
// the board's own sequencer, which all write the Circuit inside the board and never reach a room.
//
// Packets (frame.c): 'P' 'F' fmt len_hi len_lo + frame; 'P' 'T' hz_hi hz_lo dur_hi dur_lo amp (sndCmdFrqOn,
// any whole Hz, a new tone cuts the old); 'P' 'N' key vel dur_hi dur_lo (only --voice-mode plain);
// 'P' 'Q' quiet; 'P' '?' ping. The voice sends a tone every TICK ms while the pitch moves and every
// REFRESH_MS while it stands, each lasting TONE_MS, so a bridge that dies goes quiet by itself.
// One writer: every packet goes through one queue, whole, so a note never lands inside a frame.
// The spectrogram (split) is read only from JACK: ffmpeg is one more client with one connection from
// --wave-port to it, as listen.mjs reads capture_2; no board lease, none of the board's connections touched.
// The OLED gets screen.raw frames (1024 bytes, page major) in <room>, or with --oled-notes screen.note, so the board draws its own rings.
// The Palm draws its status lines over rows 124 to 159, so the picture uses rows 0 to 121.
import fs from 'node:fs';
import tty from 'node:tty';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { findVideo, holdersOf, ffArgs, levels, BAYER4 } from './camera.mjs';
// The drum grid's picture and pen (demo/shell/palm-drums.mjs, shared with /devices/palmdrums/); on the Pi a copy sits beside this file.
let PD = null;
for (const u of ['../../demo/shell/palm-drums.mjs', './palm-drums.mjs']) { try { PD = await import(new URL(u, import.meta.url).href); break; } catch { /* not here */ } }

// No text on the Palm by default (the owner: "rm text / debug lines from palm"); --text brings it back.
const TEXT = process.argv.includes('--text');
const W = 160, H = 160, DH = TEXT ? 122 : 160;
const args = process.argv.slice(2);
const VALUED = ['--view', '--fmt', '--fps', '--room', '--relay', '--pen-cc', '--pen-ch', '--snap', '--oled-snap', '--secs', '--wave-port', '--synth-port',
  '--drums-target', '--bpm', '--cam-fps', '--video', '--voice-mode', '--pattern', '--rate', '--glide', '--vib', '--echo', '--echo-ms', '--double', '--tuning', '--drums-below'];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);
const dev = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1])) || '/dev/ttyUSB0';
const VIEW = opt('--view', 'camera');
const CAM_FPS = Number(opt('--cam-fps', 15));
// the drum grid's wave is Plaits alone, never the drums: its own JACK output (--synth-port), not the capture,
// so drums.sh's --wave-port system:capture_1 does not reach it
const WAVE_PORT = VIEW === 'drums' ? opt('--synth-port', 'posplaits:out_1') : opt('--wave-port', 'circuit:capture_1');
// the drum grid goes at 1 bit: a quarter of the bytes, so a tap's flip reaches the Palm sooner
const FMT = Number(opt('--fmt', VIEW === 'drums' ? 1 : 4));
const FPS = Number(opt('--fps', FMT === 1 ? 30 : FMT === 2 ? 20 : 15));
const ROOM = opt('--room', 'studio-1');
const RELAY = opt('--relay', 'wss://ws.positron.studio');
const [PEN_X, PEN_Y] = opt('--pen-cc', '80,81').split(',').map(Number);
const PEN_CH = Number(opt('--pen-ch', 1));
const VOICE = flag('--voice'), PEN = flag('--pen'), DRY = flag('--dry'), DEMO = flag('--demo');
const SNAP = opt('--snap', null), OLED_SNAP = opt('--oled-snap', null), SECS = Number(opt('--secs', 0));
// White on black by default (the owner: "circle notes on palm. white on black"); --light draws black on white.
const LIGHT = flag('--light');
// The board's OLED shows the split at 128x64 as screen.raw frames unless --no-oled; --oled-notes sends
// screen.note instead, so the board draws its own rings.
const OLED = !flag('--no-oled'), OLED_RAW = OLED && !flag('--oled-notes');
if (!['camera', 'split', 'rings', 'keys', 'roll', 'drums'].includes(VIEW)) die('--view camera, split, rings, keys, roll or drums');
if (!(CAM_FPS > 0 && CAM_FPS <= 30)) die('--cam-fps 1 to 30');
if (![1, 2, 4].includes(FMT)) die('--fmt 1, 2 or 4 (the picture is grey)');
if (!(FPS > 0 && FPS <= 50)) die('--fps 1 to 50');
if (![PEN_X, PEN_Y].every((c) => Number.isInteger(c) && c >= 0 && c <= 119)) die('--pen-cc two controller numbers, e.g. 80,81');
if (!(PEN_CH >= 1 && PEN_CH <= 16)) die('--pen-ch 1 to 16');
// The voice's settings; the knobs change them live (onCC).
const MODES = ['mono', 'arp', 'echo', 'chip'], PATTERNS = ['up', 'down', 'updown', 'random'];
const DOUBLES = ['off', 'octave', 'fifth', 'both'], TUNINGS = ['equal', 'just', 'q24', 'drift'];
const vs = {
  vol: 1,   // 0 to 1, CC 7, scales every tone under AMP (the Palm cannot go louder than sndMaxAmp)
  mode: opt('--voice-mode', 'arp'), pattern: opt('--pattern', 'updown'), rate: Number(opt('--rate', 110)),
  glide: Number(opt('--glide', 40)), vib: Number(opt('--vib', 0)), echo: Number(opt('--echo', 0.5)),
  echoMs: Number(opt('--echo-ms', 240)), double: opt('--double', 'off'), tuning: opt('--tuning', 'equal'), bend: 0,
};
const DRUMS_BELOW = Number(opt('--drums-below', 36));
if (![...MODES, 'plain'].includes(vs.mode)) die('--voice-mode arp, mono, echo, chip or plain');
if (!PATTERNS.includes(vs.pattern)) die('--pattern up, down, updown or random');
if (!DOUBLES.includes(vs.double)) die('--double off, octave, fifth or both');
if (!TUNINGS.includes(vs.tuning)) die('--tuning equal, just, q24 or drift');
if (!(vs.rate >= 20 && vs.rate <= 2000 && vs.glide >= 0 && vs.vib >= 0 && vs.vib <= 200 && vs.echo >= 0 && vs.echo <= 0.85 && vs.echoMs >= 40)) die('--rate 20 to 2000, --glide 0 up, --vib 0 to 200, --echo 0 to 0.85, --echo-ms 40 up');
function die(s) { console.error(s); process.exit(2); }
let stopping = false;
const t0 = Date.now();
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

// ── the notes ──────────────────────────────────────────────────────────────
// key -> { n, vel, ch, on, src }; released notes keep fading in `gone`.
const held = new Map(), gone = [], hits = [];
// /palm/ latches a released key while it processes, so its notes may hold for minutes; a lost off elsewhere goes at 30 s.
const STUCK_MS = 30_000, SCREEN_STUCK_MS = 600_000, FADE_MS = 3000;
let lastNote = null, lastAt = 0, heard = 0, dirty = true;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

function noteOn(src, ch, n, vel) {
  if (!(n >= 0 && n <= 127)) return;
  if (!vel) return noteOff(src, ch, n);
  const t = Date.now();
  heard++; dirty = true; lastAt = t;
  if (ch === 10 || n < DRUMS_BELOW) { hits.push({ n, vel, t }); if (hits.length > 32) hits.shift(); hit(n, t); return; }
  const k = `${src}:${ch}:${n}`;
  if (held.has(k)) noteOff(src, ch, n);
  const s = { n, vel, ch, on: t, src };
  held.set(k, s);
  lastNote = { n, vel, ch, src };
  muted = false;
  if (vs.mode === 'echo') { echoes.push({ n, t }); if (echoes.length > 16) echoes.shift(); }
  voice();
  mirror(s, true);
}
function noteOff(src, ch, n) {
  const k = `${src}:${ch}:${n}`, s = held.get(k);
  if (!s) return;
  held.delete(k);
  s.off = Date.now();
  gone.push(s); if (gone.length > 64) gone.shift();
  dirty = true;
  voice();
  mirror(s, false);
}

// The Pi's OLED shows the same rings: `screen.note` {n, on} into the board's room, the message
// /devices/dots/ sends and the board already draws (panel.note). Its rings span C3 to G4 only, so a
// note is folded into that by octaves; notes that came in as screen.note are on the OLED already.
const O_LO = 48, O_HI = 67, oledHeld = new Map();
function mirror(s, on) {
  if (!OLED || OLED_RAW || s.src.startsWith('screen:')) return;
  const n = fold(s.n, O_LO, O_HI), c = oledHeld.get(n) || 0;
  if (on) { oledHeld.set(n, c + 1); if (!c) sendTo(ROOM, { type: 'screen.note', n, on: true }); }
  else if (c) { if (c === 1) { oledHeld.delete(n); sendTo(ROOM, { type: 'screen.note', n, on: false }); } else oledHeld.set(n, c - 1); }
}
function panic(src) {
  for (const s of [...held.values()]) if (!src || s.src === src) noteOff(s.src, s.ch, s.n);
}
setInterval(() => { const t = Date.now(); for (const s of [...held.values()]) if (t - s.on > (s.src.startsWith('screen:') ? SCREEN_STUCK_MS : STUCK_MS)) noteOff(s.src, s.ch, s.n); }, 1000);

// MIDI bytes as a page sends them: whole messages, channel voice only.
function fromBytes(src, bytes) {
  if (!Array.isArray(bytes)) return;
  for (let i = 0; i < bytes.length; i++) {
    const st = bytes[i];
    if (st < 0x80 || st >= 0xF0) continue;
    const hi = st & 0xF0, ch = (st & 0x0F) + 1, d1 = bytes[i + 1], d2 = bytes[i + 2];
    if (hi === 0x90) { noteOn(src, ch, d1, d2); i += 2; }
    else if (hi === 0x80) { noteOff(src, ch, d1); i += 2; }
    else if (hi === 0xB0) { if (d1 === 123 || d1 === 120) for (const s of [...held.values()]) if (s.ch === ch) noteOff(s.src, s.ch, s.n); i += 2; }
    else if (hi === 0xC0 || hi === 0xD0) i += 1;
    else i += 2;
  }
}

// ── the relay: two rooms, listened to; the Circuit's room also carries the pen's CCs ─────
const rid = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.random() * 36 | 0]).join('');
const sockets = {};
function join(room, onMsg) {
  const st = { ws: null, from: `palm-${rid(6)}`, seq: 0, open: false };
  sockets[room] = st;
  const connect = () => {
    st.from = `palm-${rid(6)}`; st.seq = 0;
    const ws = new WebSocket(`${RELAY}/room/${room}/ws`);
    st.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { st.open = true; log(`joined ${room} as ${st.from}`); };
    ws.onclose = (e) => { st.open = false; log(`${room} closed (${e.code}), again in 2 s`); setTimeout(connect, 2000); };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (!m || m.from === st.from) return;
      try { onMsg(m); } catch (err) { log(`${room}: ${m.type} threw ${err.message}`); }
    };
  };
  connect();
  return st;
}
function sendTo(room, msg) {
  const st = sockets[room];
  if (!st?.open) return false;
  st.ws.send(JSON.stringify({ id: rid(16), type: '', ...msg, from: st.from, sent: Date.now(), seq: st.seq++, by: 'tool' }));
  return true;
}
const CROOM = `${ROOM}-circuit`;
if (!DEMO) {
  join(CROOM, (m) => {
    if (m.type === 'midi.send') fromBytes(`c:${m.from}`, m.bytes);
    else if (m.type === 'midi.panic') panic();
    else if (m.type === 'midi.refused') log(`the board refused: ${m.why}`);
  });
  join(ROOM, (m) => {
    const node = m.node || 'board';
    if (m.type === 'note.on') noteOn(`${node}:${m.from}`, (m.channel ?? 0) + 1, Number(m.note), m.vel ?? 100);
    else if (m.type === 'note.off') noteOff(`${node}:${m.from}`, (m.channel ?? 0) + 1, Number(m.note));
    else if (m.type === 'note.panic') panic();
    else if (m.type === 'seq.state') { answered(m); if (VIEW === 'drums') onSeqState(m); }
    else if (m.type === 'seq.pattern') { if (VIEW === 'drums' && m.pattern) { editAt = 0; adopt(m.pattern); } }
    else if (m.type === 'audio.started' || m.type === 'sc.loaded' || m.type === 'jack.linked') answered(m);
    else if (m.type === 'palm.cc') onCC(Number(m.cc), Number(m.v));
    else if (m.type === 'palm.bend') { vs.bend = Math.max(-1, Math.min(1, Number(m.v) / 8192 || 0)) * 200; }
    else if (m.type === 'screen.note') { if (m.panic) panic(); else if (m.on) noteOn(`screen:${m.from}`, 1, Number(m.n), 100); else noteOff(`screen:${m.from}`, 1, Number(m.n)); }
  });
}
if (DEMO && OLED) join(ROOM, () => {});
if (DEMO) {
  // A minor arpeggio with a held bass and a drum, so every part of the picture moves.
  const seq = [57, 60, 64, 69, 72, 69, 64, 60];
  let i = 0;
  setInterval(() => {
    const n = seq[i % seq.length], prev = seq[(i + seq.length - 1) % seq.length];
    noteOff('demo', 1, prev);
    noteOn('demo', 1, n, 50 + (i * 23) % 77);
    if (i % 4 === 0) noteOn('demo', 10, 36, 110);
    if (i % 16 === 0) { noteOff('demo', 2, 45); noteOn('demo', 2, 45, 90); }
    i++;
  }, 250);
}

// ── the tty: one queue, whole packets ─────────────────────────────────────
let fd = null;
if (!DRY) {
  if (dev.startsWith('/dev/')) {
    let holders = '';
    try { holders = execFileSync('fuser', [dev], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* none, or no fuser */ }
    if (holders) die(`${dev} is open in process ${holders}: one writer at a time, stop it first`);
    // Non blocking, as cam.mjs: a blocking open waits behind a close still draining to a Palm that stopped reading.
    const { O_RDWR, O_NONBLOCK, O_NOCTTY } = fs.constants;
    fd = fs.openSync(dev, O_RDWR | O_NONBLOCK | O_NOCTTY);
    try { execFileSync('stty', ['raw', '-echo', 'clocal'], { stdio: [fd, 'ignore', 'ignore'], timeout: 2000 }); } catch { /* the visor tty refuses some settings */ }
  } else fd = fs.openSync(dev, 'w');
}
// Through libuv's tty handles, not the thread pool: a blocked pool read keeps the process from exiting.
const isTty = fd !== null && tty.isatty(fd);
const out = isTty ? new tty.WriteStream(fd) : null;
out?._handle?.setBlocking?.(false);
out?.on('error', (e) => log(`tty: ${e.message}`));
const queue = [];
let writing = false, frameQueued = false, sent = { frames: 0, notes: 0, bytes: 0, tones: 0 };
function enqueue(buf, { front = false, frame = false } = {}) {
  if (DRY) { if (!frame) log(`packet ${[...buf].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`); return; }
  if (frame) frameQueued = true;
  const item = { buf, frame };
  if (front) queue.unshift(item); else queue.push(item);
  pump();
}
function pump() {
  if (writing || !queue.length) return;
  const item = queue.shift();
  writing = true;
  writeAll(item.buf, () => {
    writing = false;
    sent.bytes += item.buf.length;
    if (item.frame) { frameQueued = false; sent.frames++; } else sent.notes++;
    if (item.buf[1] === 0x54) sent.tones++;
    pump();
  });
}
function writeAll(buf, done) {
  if (out) return out.write(buf, (e) => { if (e) { log(`write: ${e.message}`); process.exit(1); } done(); });
  fs.write(fd, buf, 0, buf.length, null, (e, n) => {
    if (e) {
      if (e.code === 'EAGAIN') return setTimeout(() => writeAll(buf, done), 5);
      log(`write: ${e.message}`); process.exit(1);
    }
    if (n < buf.length) return writeAll(buf.subarray(n), done);
    done();
  });
}

// ── the voice: the Pi sequences 'P' 'T' tones, one square voice, pitch moved by resending ──
// arp: the held notes in turn, every rate ms, gliding; mono: the top note; echo: every note-on repeats
// every echoMs, falling by echo each time; chip: the held notes and the top one's octave every 30 ms.
// Released notes ring on as an echo tail (arp keeps stepping, mono repeats) until the level is under 3.
// --voice-mode plain is the old way: 'P' 'N' for the top note, nothing else.
const TICK = 15, AMP = 64, TONE_MS = 250, REFRESH_MS = 120, VIB_HZ = 5.5, CHIP_MS = 30, BLIP = 0.6;
const JUST = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];
const DOUBLE_IV = { off: [], octave: [12], fifth: [7], both: [7, 12] };
let sounding = null, silent = true, muted = false, soundingNote = null, lastSt = 0;
let cur = null, lastTx = { f: 0, a: 0, t: 0 }, seqStart = 0, prevHeld = [], tail = null, drum = null, voiceItem = null;
let drift = 0, driftTo = 0, driftAt = 0, lastTick = Date.now();
const echoes = [];
const notePkt = (n, vel) => Buffer.from([0x50, 0x4e, n, vel, 0, 0]);
const QUIET = Buffer.from([0x50, 0x51]), PING = Buffer.from([0x50, 0x3f]);
const tonePkt = (f, a) => Buffer.from([0x50, 0x54, f >> 8, f & 0xff, TONE_MS >> 8, TONE_MS & 0xff, a]);

// cents above A0's 27.5 Hz, so glide and vibrato are additions; q24 makes each key a quarter tone from C4
function centsOf(n) {
  if (vs.tuning === 'just') { const c = Math.floor(n / 12) * 12; return (c - 21) * 100 + 1200 * Math.log2(JUST[n % 12]); }
  if (vs.tuning === 'q24') return (60 - 21) * 100 + (n - 60) * 50;
  return (n - 21) * 100;
}
const hzOf = (cents) => 27.5 * 2 ** (cents / 1200);
const heldPitches = () => [...new Set([...held.values()].map((s) => s.n))].sort((a, b) => a - b);

function sendVoice(buf) {
  if (DRY) { if (buf[1] === 0x54) sent.tones++; else log(`packet ${[...buf].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`); return; }
  // one voice packet waits in the queue at most: a newer pitch replaces it rather than queueing behind it
  if (voiceItem && queue.includes(voiceItem)) { voiceItem.buf = buf; return; }
  voiceItem = { buf, frame: false };
  queue.unshift(voiceItem);
  pump();
}
function tone(f, a, t) {
  a *= vs.vol;
  f = Math.max(30, Math.min(12000, Math.round(f))); a = Math.max(0, Math.min(AMP, Math.round(a)));
  if (a < 3) return hush();
  if (!silent && Math.abs(f - lastTx.f) < 1 && a === lastTx.a && t - lastTx.t < REFRESH_MS) return;
  sendVoice(tonePkt(f, a));
  silent = false; lastTx = { f, a, t };
}
function hush() {
  if (silent) return;
  sendVoice(QUIET);
  silent = true; soundingNote = null; cur = null; dirty = true;
}

// A drum: rapid random tones for a short burst; a kick falls, a snare is mid noise, a hat is high noise.
function hit(n, t) {
  if (!VOICE || vs.mode === 'plain' || muted) return;
  const kind = n === 35 || n === 36 || (n < DRUMS_BELOW && n % 12 === 0) ? 'kick' : [42, 44, 46].includes(n) || (n < DRUMS_BELOW && n % 12 >= 6) ? 'hat' : 'snare';
  drum = { kind, t, until: t + (kind === 'kick' ? 90 : kind === 'hat' ? 45 : 80) };
}
function drumHz(d, t) {
  const p = (t - d.t) / (d.until - d.t);
  if (d.kind === 'kick') return 160 * (1 - p) + 45;
  if (d.kind === 'hat') return 5000 + Math.random() * 4000;
  return 300 + Math.random() * 2700;
}

// voice() runs on every note change: plain mode plays here, the others only note where a phrase starts and ends.
function voice() {
  if (!VOICE) return;
  const now = heldPitches(), t = Date.now();
  if (vs.mode === 'plain') {
    let top = null;
    for (const s of held.values()) if (!top || s.n > top.n) top = s;
    if (top && sounding && top.n === sounding.n && top.on === sounding.on) return;
    if (top && !muted) { enqueue(notePkt(top.n, 127), { front: true }); sounding = top; silent = false; soundingNote = top.n; }
    else if (sounding) { enqueue(QUIET, { front: true }); sounding = null; silent = true; soundingNote = null; }
    return;
  }
  if (now.length && !prevHeld.length) { seqStart = t; tail = null; }
  if (!now.length && prevHeld.length && vs.echo > 0) tail = { notes: prevHeld, at: t, step: seqStart };
  prevHeld = now;
}

// The arp's order over the notes it has; random picks per step, the same pick for the whole step.
function arpNote(list, step) {
  const L = list.length;
  if (L === 1) return list[0];
  if (vs.pattern === 'up') return list[step % L];
  if (vs.pattern === 'down') return list[L - 1 - (step % L)];
  if (vs.pattern === 'random') return list[(Math.imul(step + 1, 2654435761) >>> 0) % L];
  const cyc = 2 * L - 2, i = step % cyc;
  return list[i < L ? i : cyc - i];
}

function tick() {
  if (!VOICE || vs.mode === 'plain' || stopping) return;
  const t = Date.now(), dt = Math.min(100, t - lastTick);
  lastTick = t;
  if (muted) { echoes.length = 0; tail = null; return hush(); }
  if (drum) {
    if (t < drum.until) { soundingNote = null; return tone(drumHz(drum, t), AMP, t); }
    drum = null; cur = null;
  }
  let n = null, amp = AMP, jump = false;
  const now = heldPitches();
  if (vs.mode === 'echo') {
    // the newest repeat that is sounding now: repeat k starts k echo times after its note, at echo^k
    const fb = Math.max(0.3, vs.echo), len = Math.min(BLIP * vs.echoMs, 160);
    let best = null;
    for (let i = echoes.length - 1; i >= 0; i--) {
      const e = echoes[i], k = Math.floor((t - e.t) / vs.echoMs), a = AMP * fb ** k;
      if (a < 3) { echoes.splice(i, 1); continue; }
      const start = e.t + k * vs.echoMs;
      if (t - start < len && (!best || start > best.start)) best = { n: e.n, a, start };
    }
    if (best) { n = best.n; amp = best.a; }
  } else {
    let list = now, from = seqStart;
    if (!list.length && tail) {
      const k = Math.floor((t - tail.at) / vs.echoMs);
      amp = AMP * vs.echo ** (k + 1);
      if (amp < 3) tail = null;
      else {
        list = tail.notes; from = tail.step;
        // mono repeats as blips; arp and chip keep stepping, quieter each echo time
        if ((vs.mode === 'mono' || list.length === 1) && t - (tail.at + k * vs.echoMs) > BLIP * vs.echoMs) list = [];
      }
    }
    if (list.length) {
      if (vs.mode === 'mono') n = list[list.length - 1];
      else if (vs.mode === 'chip') {
        const seq = list.length === 1 ? [list[0], list[0] + 12] : [...list, list[list.length - 1] + 12];
        n = seq[Math.floor((t - from) / CHIP_MS) % seq.length]; jump = true;
      } else n = arpNote(list, Math.floor((t - from) / vs.rate));
    }
  }
  if (n === null) return hush();
  let target = centsOf(n);
  if (jump || vs.glide <= 0 || cur === null) cur = target;
  else cur += (target - cur) * (1 - Math.exp(-dt / vs.glide));
  // octave or fifth doubling: the voice alternates with the doubled pitch every tick
  const ivs = DOUBLE_IV[vs.double], sub = Math.floor(t / TICK) % (ivs.length + 1);
  const shown = sub ? n + ivs[sub - 1] : n;
  let c = cur + (sub ? ivs[sub - 1] * 100 : 0) + vs.bend;
  if (vs.vib > 0) c += vs.vib * Math.sin(2 * Math.PI * VIB_HZ * t / 1000);
  if (vs.tuning === 'drift') {
    if (t - driftAt > 1500) { driftTo = (Math.random() * 2 - 1) * 25; driftAt = t; }
    drift += (driftTo - drift) * (1 - Math.exp(-dt / 800));
    c += drift;
  }
  if (soundingNote !== shown) dirty = true;
  soundingNote = shown;
  tone(hzOf(c), amp, t);
}
if (VOICE) setInterval(tick, TICK);
// plain holds a note with dur 0, and pframe's watchdog quiets it after 2 s without a packet
if (VOICE) setInterval(() => { if (vs.mode === 'plain' && sounding) enqueue(PING, { front: true }); }, 1000);

// The MK-425C's knobs, as /ambient/drone/ measured them, and the mod wheel; four zones on a knob choose among four.
const CC_MAP = { 7: 'vol', 1: 'vib', 74: 'mode', 71: 'rate', 91: 'glide', 93: 'pattern', 73: 'echo', 72: 'echoMs', 5: 'double', 84: 'tuning' };
function onCC(cc, v) {
  const key = CC_MAP[cc];
  if (!key || !(v >= 0 && v <= 127)) return;
  const zone = Math.min(3, v >> 5), was = vs[key];
  if (key === 'vol') vs.vol = v / 127;
  else if (key === 'vib') vs.vib = Math.round(v / 127 * 80);
  else if (key === 'mode') vs.mode = MODES[zone];
  else if (key === 'rate') vs.rate = Math.round(400 - v / 127 * 370);
  else if (key === 'glide') vs.glide = Math.round((v / 127) ** 2 * 400);
  else if (key === 'pattern') vs.pattern = PATTERNS[zone];
  else if (key === 'echo') vs.echo = Math.round(v / 127 * 85) / 100;
  else if (key === 'echoMs') vs.echoMs = Math.round(60 + v / 127 * 540);
  else if (key === 'double') vs.double = DOUBLES[zone];
  else if (key === 'tuning') vs.tuning = TUNINGS[zone];
  if (vs[key] !== was && typeof was === 'string') log(`voice ${key} ${vs[key]} (cc ${cc})`);
  if (key === 'mode' && vs.mode !== was) { echoes.length = 0; tail = null; prevHeld = []; voice(); }
}

// ── the pen: x and y to two CCs on the Circuit, through its room like /remote/circuit/ ───
let pen = null, penSent = {}, penWant = {}, penTimer = null, penCount = 0;
const clamp = (v) => Math.max(0, Math.min(127, Math.round(v)));
function onPen(x, y, down) {
  if (VIEW === 'drums') { pen = { x, y, down }; dirty = true; return drumPen(x, y, down); }   // a pen up off the screen still ends the stroke
  if (y >= DH) return;
  pen = { x, y, down };
  dirty = true;
  if (VIEW === 'drums') return drumPen(x, y, down);
  if (!PEN || !down) return;
  penWant[PEN_X] = clamp(x / (W - 1) * 127);
  penWant[PEN_Y] = clamp((1 - (y - 14) / (DH - 1 - 14)) * 127);
  if (!penTimer) penFlush();
}
function penFlush() {
  penTimer = null;
  let any = false;
  for (const cc of [PEN_X, PEN_Y]) {
    const v = penWant[cc];
    if (v === undefined || v === penSent[cc]) continue;
    const bytes = [0xB0 | (PEN_CH - 1), cc, v];
    if (DRY) log(`pen cc ${cc} = ${v} (dry, not sent)`);
    else if (!sendTo(CROOM, { type: 'midi.send', bytes })) continue;
    penSent[cc] = v; penCount++; any = true;
  }
  if (any) penTimer = setTimeout(penFlush, 40);   // at most 25 a second per CC, the last value wins
}

// ── the drum grid (--view drums): the board's own sequencer (rig/board/sequencer.mjs), edited by the pen ──
// The picture and the pen are palm-drums.mjs. Edits land on the next bar; the OLED gets all 16 rows and
// Plaits' wave from this bridge (drumsOled). The playhead is the board's step, read every 2 s.
const DRUMS_TARGET = opt('--drums-target', 'drums'), DRUMS_BPM = Number(opt('--bpm', 120));
if (!['drums', 'circuit'].includes(DRUMS_TARGET)) die('--drums-target drums or circuit');
if (!(DRUMS_BPM >= 40 && DRUMS_BPM <= 240)) die('--bpm 40 to 240');
if (VIEW === 'drums' && !PD) die('drums: no palm-drums.mjs in ../../demo/shell or beside this bridge');
const G_STEPS = PD?.STEPS ?? 16, G_ROWS = PD?.ROWS ?? 16, SHORT = PD?.SHORT ?? {};
let gVoices = null;                                  // [{ key, name, program }] from demo/drums/voices.mjs
const grid = PD ? PD.emptyGrid() : [];
// something to hear on the first tap: four on the floor, a backbeat, closed hats
if (PD) for (let c = 0; c < G_STEPS; c++) { grid[0][c] = c % 4 === 0; grid[1][c] = c % 8 === 4; grid[3][c] = c % 2 === 0; }
const seqS = { running: false, bpm: DRUMS_BPM, step: -1, at: 0, pending: false, said: '' };
let editAt = 0, editTimer = null, drumsUp = false, starting = false, drawnStep = -2;
const waiters = [];
function ask(msg, type, ms = 8000) {
  const id = rid(16);
  if (!sendTo(ROOM, { ...msg, id })) return Promise.resolve(null);
  return new Promise((resolve) => {
    const w = { id, type, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); resolve(null); }, ms) };
    waiters.push(w);
  });
}
function answered(m) {
  const i = waiters.findIndex((w) => w.type === m.type && w.id === m.re);
  if (i < 0) return;
  const [w] = waiters.splice(i, 1);
  clearTimeout(w.timer); w.resolve(m);
}
const patternNow = () => ({ v: 1, name: 'palm', bpm: seqS.bpm, steps: G_STEPS,
  rows: gVoices.map((v, r) => ({ voice: v.key, steps: grid[r].map((x) => (x ? '1' : '0')).join(''), mute: false })) });
const screenNow = () => ({ voices: gVoices.map((v) => SHORT[v.key] || v.key.slice(0, 2).toUpperCase()), look: { empty: 'dot', head: 'frame' } });
/** A pattern somebody else set: the rows this grid has are taken, by voice name. */
function adopt(p) {
  if (!gVoices || !p?.rows || drumPens?.active()) return;
  for (const [r, v] of gVoices.entries()) {
    const row = p.rows.find((x) => x.voice === v.key);
    for (let c = 0; c < G_STEPS; c++) grid[r][c] = !!row && row.steps[c] === '1';
  }
  if (Number.isFinite(p.bpm)) seqS.bpm = p.bpm;
  dirty = true;
}
function onSeqState(m) {
  if (!m?.ok) { if (m?.why && m.why !== seqS.said) { seqS.said = m.why; log(`sequencer: ${m.why}`); } return; }
  seqS.running = !!m.running; seqS.pending = !!m.pending;
  if (Number.isFinite(m.bpm)) seqS.bpm = m.bpm;
  seqS.step = Number.isInteger(m.step) ? m.step : -1; seqS.at = Date.now();
  // its own edit still on its way, or not landed until the next bar: the board's copy is the older one
  if (m.pattern && !m.pending && Date.now() - editAt > 3000) adopt(m.pattern);
  if (m.refused && m.lastRefusal && m.lastRefusal !== seqS.said) { seqS.said = m.lastRefusal; log(`sequencer: ${m.refused} hits not taken (${m.lastRefusal})`); }
  dirty = true;
}
/** The step playing now: the board's last one, counted on by the clock since it said so. */
function stepNow(t = Date.now()) {
  if (!seqS.running || seqS.step < 0) return -1;
  return (seqS.step + Math.floor((t - seqS.at) / (60000 / (seqS.bpm * 4)))) % G_STEPS;
}
function edited() {
  editAt = Date.now(); dirty = true;
  if (!editTimer) editTimer = setTimeout(() => { editTimer = null; tell(); }, 60);
}
function tell() {
  if (!gVoices) return;
  if (DRY) return log(`seq.pattern (dry, not sent): ${patternNow().rows.filter((r) => r.steps.includes('1')).map((r) => `${r.voice} ${r.steps}`).join(', ')}`);
  if (!sockets[ROOM]?.open) return log('seq.pattern: not sent, the relay room is not open yet (sent once it is)');
  ask({ type: 'seq.pattern', pattern: patternNow(), screen: screenNow() }, 'seq.state', 4000).then((m) => {
    if (!m) return log('seq.pattern: the board did not answer in 4 s');
    if (m.ok) log(`seq.pattern: the board took it, ${m.landed ?? 'now'}`);
    onSeqState(m);
  });
}
/** The drums compiled on the Pi's SuperCollider and their sound on the PWM output, as /devices/drums/ does. */
async function drumsOnPi() {
  const up = await ask({ type: 'audio.start', source: 'collide' }, 'audio.started', 15000);
  if (!up?.ok) { log(`drums: the Pi did not start its drums: ${up?.reason ?? 'no answer'}`); return false; }
  if (drumsUp && up.already) return true;
  for (const v of gVoices) {
    const r = await ask({ type: 'sc.load', name: v.name, text: v.program }, 'sc.loaded', 8000);
    if (!r?.ok) { log(`drums: the Pi did not take ${v.name}: ${r?.reason ?? 'no answer'}`); return false; }
  }
  const j = await ask({ type: 'jack.link', link: 'pi-1:drums:audio-out -> pi-1:pwm:audio-in' }, 'jack.linked', 8000);
  if (!j?.ok) { log(`drums: no sound to the PWM output: ${(j?.problems || []).join(', ') || j?.hint || 'no answer'}`); return false; }
  log(`drums: ${gVoices.length} compiled on the Pi, pi-1:drums:audio-out -> pi-1:pwm:audio-in held`);
  return (drumsUp = true);
}
async function transport() {
  if (starting || !gVoices) return;
  if (DRY) { seqS.running = !seqS.running; seqS.step = 0; seqS.at = Date.now(); return log(`seq.${seqS.running ? 'start' : 'stop'} (dry, not sent)`); }
  starting = true; dirty = true;
  try {
    if (seqS.running) { const m = await ask({ type: 'seq.stop', from: 'palm' }, 'seq.state', 6000); if (m) onSeqState(m); return; }
    if (DRUMS_TARGET === 'drums' && !await drumsOnPi()) return;
    const m = await ask({ type: 'seq.start', target: DRUMS_TARGET, pattern: patternNow(), screen: screenNow() }, 'seq.state', 6000);
    if (m) onSeqState(m);
    log(`sequencer: ${m?.ok ? `${m.running ? 'running' : 'stopped'} at ${m.bpm} bpm into ${m.target}` : `refused: ${m?.why ?? 'no answer'}`}`);
  } finally { starting = false; dirty = true; }
}
function clearGrid() {
  for (const row of grid) row.fill(false);
  log('clear: every step off');
  edited();
}
// pframe (2026-11-11 build) sends "key <chr> <keyCode> <modifiers>" in hex for each button and icon it takes, and
// "sys ..." for one left to Palm OS. Names from Chars.h and palmOneNavigator.h; the 5-way may send either form.
const KEY_NAMES = { 0x204: 'hard1', 0x205: 'hard2', 0x206: 'hard3', 0x207: 'hard4', 0xb: 'up', 0xc: 'down',
  0x132: 'up', 0x133: 'down', 0x134: 'left', 0x135: 'right', 0x136: 'center', 0x105: 'menu', 0x10a: 'find', 0x10b: 'calc' };
const NAV_BITS = [[0x01, 0x100, 'up'], [0x02, 0x200, 'down'], [0x04, 0x400, 'left'], [0x08, 0x800, 'right'], [0x10, 0x1000, 'center']];
const keyAt = {};
let selRow = 0;
function onKey(line) {
  const [kind, ...hex] = line.split(' '), [chr, code, mods] = hex.map((h) => parseInt(h, 16));
  let name = KEY_NAMES[chr] ?? null;
  if (chr === 0x503) name = NAV_BITS.find(([bit, change]) => (code & change) && (code & bit))?.[2] ?? null;   // a release has no bit
  log(`${kind} ${hex.join(' ')}${name ? ` (${name})` : ''}`);
  if (kind !== 'key' || !name) return;
  if (VIEW !== 'drums') { muted = true; silent = true; sounding = null; return; }
  // one press can come as two forms, and a held key repeats: the same name within 150 ms is the same press
  const t = Date.now(), repeat = (mods & 0x40) !== 0;
  if (t - (keyAt[name] ?? 0) < 150 || (repeat && !['left', 'right', 'up', 'down'].includes(name))) return;
  keyAt[name] = t;
  drumKey(name);
}
/** The buttons on the drum grid: centre plays, left and right move the tempo, up and down pick a row,
 *  the left app button puts a hit on every beat of it, the right one empties it, menu clears all, find dices it. */
function drumKey(name) {
  if (!gVoices) return;
  const row = grid[selRow];
  if (name === 'center') return transport();
  if (name === 'left' || name === 'right') { seqS.bpm = Math.max(40, Math.min(240, seqS.bpm + (name === 'left' ? -5 : 5))); log(`tempo ${seqS.bpm}`); return edited(); }
  if (name === 'up' || name === 'down') { selRow = (selRow + (name === 'up' ? G_ROWS - 1 : 1)) % G_ROWS; dirty = true; return log(`row ${gVoices[selRow].key}`); }
  if (name === 'hard1') { for (let c = 0; c < G_STEPS; c++) row[c] = c % 4 === 0; log(`${gVoices[selRow].key}: every beat`); return edited(); }
  if (name === 'hard2') { row.fill(false); log(`${gVoices[selRow].key}: cleared`); return edited(); }
  if (name === 'menu') return clearGrid();
  if (name === 'find') { for (let c = 0; c < G_STEPS; c++) row[c] = Math.random() < 0.3; log(`${gVoices[selRow].key}: diced`); return edited(); }
}
// The old pframe answers any hard button with one "stop" line and never says which: play and stop.
let buttonAt = 0;
function hardButton() {
  const t = Date.now();
  if (t - buttonAt < 400) return;
  buttonAt = t;
  log(`hard button: ${seqS.running ? 'stop' : 'play'}`);
  transport();
}
// the stylus on the grid, palm-drums.mjs's, the same pen the tab copy uses
const drumPens = PD ? PD.createPen(grid, {
  onFlip: (r, c, on, first) => { if (first && gVoices) log(`pen down: ${gVoices[r].key} step ${c + 1} ${on ? 'on' : 'off'}`); edited(); },
  onPlay: () => { log(`pen down: ${seqS.running ? 'stop' : 'play'}`); transport(); },
  onClear: () => clearGrid(),
  onUp: (x, y, flips) => log(`pen up ${x} ${y}${flips === null ? '' : `, ${flips} squares flipped`}`),
}) : null;
function drumPen(x, y, down) { if (gVoices) drumPens.pen(x, y, down); }
function drawDrums(t) {
  const now = stepNow(t);
  drawnStep = now;
  PD.draw({ rect, put }, { grid, step: now, running: now >= 0, starting, selRow, pen, wave: waveCols });
}
async function drumsInit() {
  // demo/drums/voices.mjs from this checkout, or the board's copy on the Pi (the bridge runs from ~/palm there)
  for (const u of [new URL('../../demo/drums/voices.mjs', import.meta.url).href, 'file:///opt/positron-board/demo/drums/voices.mjs']) {
    try { gVoices = (await import(u)).voices({ more: true }).slice(0, G_ROWS); break; } catch { /* not here */ }
  }
  if (!gVoices) die('drums: no demo/drums/voices.mjs beside this bridge or in /opt/positron-board');
  log(`drums: ${gVoices.map((v) => v.key).join(' ')}, into ${DRUMS_TARGET} at ${DRUMS_BPM} bpm`);
  dirty = true;
  if (DRY || DEMO) return;
  while (!sockets[ROOM]?.open) await new Promise((r) => setTimeout(r, 200));
  const m = await ask({ type: 'seq.status' }, 'seq.state', 4000);
  if (m?.ok && m.pattern) { adopt(m.pattern); log(`drums: took the board's pattern${m.running ? `, running at ${m.bpm} bpm` : ''}`); }
  if (m) onSeqState(m);
  // the OLED draws the grid from this pattern; while it runs, the same pattern lands on the next bar, no change
  tell();
  setInterval(() => { if (sockets[ROOM]?.open) ask({ type: 'seq.status' }, 'seq.state', 3000).then((s) => s && onSeqState(s)); }, 2000);
}
if (VIEW === 'drums') drumsInit();
if (isTty) {
  const rd = new tty.ReadStream(fd);
  let saidSt = false;
  let pending = '';
  rd.on('data', (chunk) => {
    pending += chunk.toString('latin1');
    let i;
    while ((i = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, i).trim();
      pending = pending.slice(i + 1);
      const m = /^p (-?\d+) (-?\d+) ([01])$/.exec(line);
      if (m) onPen(Number(m[1]), Number(m[2]), m[3] === '1');
      else if (line.startsWith('key ') || line.startsWith('sys ')) onKey(line);
      else if (line === 'stop' && VIEW === 'drums') hardButton();
      else if (line === 'stop') { log('a hard button on the Palm stopped the sound, quiet until the next note'); muted = true; silent = true; sounding = null; }
      else if (line.startsWith('st ')) { if (!saidSt || stopping) log(`the Palm answers the ping: ${line}`); saidSt = true; lastSt = Date.now(); }
      else if (line && !line.startsWith('pal')) log(`palm: ${line}`);
    }
  });
  rd.on('error', (e) => { log(`read: ${e.message}`); process.exit(1); });
}

// ── the picture: ink 0 (white) to 15 (black) per pixel, rows 0 to DH-1 ────
const ink = new Uint8Array(W * H);
const put = (x, y, v) => {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= DH) return;
  const i = y * W + x;
  if (v > ink[i]) ink[i] = Math.min(15, v);
};
const rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, v); };
const box = (x, y, w, h, v) => { rect(x, y, w, 1, v); rect(x, y + h - 1, w, 1, v); rect(x, y, 1, h, v); rect(x + w - 1, y, 1, h, v); };
// GLCD 5x7 (demo/shell/oled-font.mjs), the characters this picture uses, 5 column bytes each, bit 0 on top.
const FONT_CHARS = ' #-.:/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const FONT_HEX = '0000000000147f147f1408080808080000606000000014000020100804023e5149453e00427f400072494949462141494d331814127f1027454545393c4a49493141211109073649494936464949291e7c1211127c7f494949363e414141227f4141413e7f494949417f090909013e414151737f0808087f00417f41002040413f017f081422417f404040407f021c027f7f0408107f3e4141413e7f090909063e4151215e7f09192946264949493203017f01033f4040403f1f2040201f3f4038403f631408146303047804036159494d4320545478407f284444383844444428384444287f385454541800087e090218a4a49c787f0804047800447d40002040403d007f1028440000417f40007c047804787c080404783844444438fc1824241818242418fc7c08040408485454542404043f44243c4040207c1c2040201c3c4030403c44281028444c9090907c4464544c44';
const FONT = Buffer.from(FONT_HEX, 'hex');
function text(x, y, s, scale = 1, v = 15) {
  if (!TEXT) return;
  for (const c of String(s)) {
    const k = FONT_CHARS.indexOf(c);
    if (k >= 0) for (let col = 0; col < 5; col++) {
      const b = FONT[k * 5 + col];
      for (let row = 0; row < 8; row++) if (b & (1 << row)) rect(x + col * scale, y + row * scale, scale, scale, v);
    }
    x += 6 * scale;
  }
}
const textW = (s, scale = 1) => String(s).length * 6 * scale - scale;
// A note's strength now: its velocity while held, fading over FADE_MS once released.
const level = (s, t) => (s.vel / 127) * (s.off ? Math.max(0, 1 - (t - s.off) / FADE_MS) : 1);
const fold = (n, lo, hi) => { while (n < lo) n += 12; while (n > hi) n -= 12; return n; };

// Rings, after demo/shell/rings.mjs: one ring a pitch, low inside; the picture turns clockwise under
// a pen at the top, so a held note draws an arc and a released one keeps turning and fades.
const R_LO = 48, R_HI = 72, R_IN = 8, R_STEP = 2, TURN = 0.7 / 1000, FULL = 2 * Math.PI * 0.984;
function drawRings(t, { cx = 80, cy = 62, rIn = R_IN, rStep = R_STEP, top = 1 } = {}) {
  rect(cx, top, 1, 4, 15);
  for (const s of [...gone, ...held.values()]) {
    const lv = level(s, t);
    if (lv <= 0) continue;
    const end = s.off || t, span = Math.min(FULL, (end - s.on) * TURN), a0 = (t - end) * TURN;
    const r = rIn + (fold(s.n, R_LO, R_HI) - R_LO) * rStep;
    const v = Math.max(3, Math.round(lv * 15));
    const step = 0.5 / r, steps = Math.floor(span / step) + 1;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + Math.min(i * step, span);
      const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
      put(Math.round(x), Math.round(y), v);
      if (!s.off) put(Math.round(x + Math.sin(a)), Math.round(y - Math.cos(a)), v);   // held: two pixels thick
    }
  }
  // the note the Palm sounds this moment (the arp's step, a doubling, an echo): a spoke to its ring and a dot on it
  if (soundingNote !== null) {
    const r = rIn + (fold(soundingNote, R_LO, R_HI) - R_LO) * rStep;
    rect(cx, Math.round(cy - r), 1, Math.round(r), 6);
    rect(cx - 2, Math.round(cy - r) - 2, 5, 5, 15);
  }
  drawHits(t);
}
// Keys: C3 to C6, held keys filled by velocity, released ones fading.
const K_LO = 48, K_HI = 84, BLACK = [1, 3, 6, 8, 10];
function drawKeys(t) {
  const top = 58, wh = 58, bh = 34, kw = 7;
  const whites = [];
  for (let n = K_LO; n <= K_HI; n++) if (!BLACK.includes(n % 12)) whites.push(n);
  const x0 = Math.floor((W - whites.length * kw) / 2);
  const lvOf = new Map();
  for (const s of [...gone, ...held.values()]) {
    const n = fold(s.n, K_LO, K_HI), lv = level(s, t);
    if (lv > (lvOf.get(n) || 0)) lvOf.set(n, lv);
  }
  whites.forEach((n, i) => {
    const x = x0 + i * kw, lv = lvOf.get(n) || 0;
    box(x, top, kw + 1, wh, 15);
    if (lv > 0) rect(x + 1, top + bh, kw - 1, wh - bh - 1, Math.max(3, Math.round(lv * 15)));
  });
  for (let n = K_LO; n <= K_HI; n++) {
    if (!BLACK.includes(n % 12)) continue;
    const left = whites.indexOf(n - 1), x = x0 + left * kw + kw - 2, lv = lvOf.get(n) || 0;
    // A held black key goes pale, by velocity: ink only darkens, so it is drawn at its level.
    for (let j = 0; j < bh; j++) for (let k = 0; k < 5; k++) ink[(top + j) * W + x + k] = 0;
    rect(x, top, 5, bh, lv > 0 ? 15 - Math.round(lv * 11) : 15);
    if (lv > 0) box(x, top, 5, bh, 15);
  }
  drawHits(t);
}
// Roll: four seconds across, newest on the right, C3 to C6 bottom to top.
const ROLL_MS = 4000, P_LO = 48, P_HI = 84;
function drawRoll(t) {
  const y0 = 20, y1 = DH - 10;
  const yOf = (n) => y1 - (fold(n, P_LO, P_HI) - P_LO) * (y1 - y0) / (P_HI - P_LO);
  for (let n = P_LO; n <= P_HI; n += 12) rect(0, Math.round(yOf(n)), W, 1, 2);
  for (const s of [...gone, ...held.values()]) {
    const end = s.off || t;
    if (t - end > ROLL_MS) continue;
    const xa = W - 1 - (t - s.on) * W / ROLL_MS, xb = W - 1 - (t - end) * W / ROLL_MS;
    const y = Math.round(yOf(s.n)) - 1, v = Math.max(4, Math.round((s.vel / 127) * 15));
    rect(Math.max(0, Math.floor(xa)), y, Math.max(1, Math.ceil(xb - Math.max(0, xa))), 3, v);
  }
  drawHits(t);
}
// ── the sound for the spectrogram: --wave-port from JACK, 48 kHz mono s16 ──────────
const RATE = 48000, WBUF = 8192, wave = new Float32Array(WBUF);
let wPos = 0, wGot = 0, wProc = null, wConnected = false, wPeak = 0;
function waveStart() {
  if ((VIEW !== 'split' && VIEW !== 'drums') || stopping) return;
  const client = `palmwave${process.pid % 1000}`;
  let carry = null;
  wConnected = false;
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'jack', '-channels', '1', '-i', client,
    '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
  wProc = p;
  p.on('error', (e) => { log(`wave: ffmpeg ${e.message}`); });
  // JACK's client library prints three harmless lines about memory locking on this Pi; the rest is logged.
  p.stderr.on('data', (d) => { for (const l of d.toString().split('\n')) if (l.trim() && !/BDB|DB environment|lock down/.test(l)) log(`wave: ${l.trim().slice(0, 160)}`); });
  p.stdout.on('data', (chunk) => {
    if (carry) { chunk = Buffer.concat([carry, chunk]); carry = null; }
    const n = chunk.length >> 1;
    if (chunk.length & 1) carry = chunk.subarray(chunk.length - 1);
    for (let i = 0; i < n; i++) { wave[wPos] = chunk.readInt16LE(i * 2) / 32768; wPos = (wPos + 1) % WBUF; }
    wGot += n; if (VIEW === 'split') dirty = true;
  });
  p.on('exit', (code) => {
    if (wProc === p) wProc = null;
    if (!stopping) { log(`wave: ffmpeg ended (${code}), again in 3 s`); setTimeout(waveStart, 3000); }
  });
  const t0 = Date.now();
  // jackd names the Fast Track system: or circuit: depending on how it was started, so the other prefix is tried too
  const ports = [...new Set([WAVE_PORT, WAVE_PORT.replace(/^system:/, 'circuit:'), WAVE_PORT.replace(/^circuit:/, 'system:')])];
  const tryConnect = () => {
    if (wProc !== p) return;
    for (const port of ports) {
      try { execFileSync('jack_connect', [port, `${client}:input_1`], { stdio: 'ignore', timeout: 2000 }); wConnected = port; log(`wave: reading ${port} through JACK as ${client}`); if (VIEW === 'drums') waitPlaits(p, client, [port], true); return; }
      catch { /* not this name, or the client is not up yet */ }
    }
    if (Date.now() - t0 < 5000) setTimeout(tryConnect, 100);
    else if (VIEW === 'drums') waitPlaits(p, client, ports);
    else { log(`wave: could not connect ${ports.join(' or ')} to ${client}:input_1`); p.kill(); }
  };
  setTimeout(tryConnect, 100);
}
// Plaits comes and goes with the pages that start it: ffmpeg stays up reading silence, and every 3 s
// jack_lsp says whether the port still feeds it, and jack_connect is tried when it does not.
function waitPlaits(p, client, ports, quiet = false) {
  if (!quiet) log(`wave: no ${ports[0]} yet (Plaits is not running), asking every 3 s`);
  const iv = setInterval(() => {
    if (wProc !== p) return clearInterval(iv);
    execFile('jack_lsp', ['-c', `${client}:input_1`], { timeout: 2000 }, (e1, out) => {
      if (String(out || '').includes(ports[0])) return;
      if (wConnected) { wConnected = false; log(`wave: ${ports[0]} went away`); }
      execFile('jack_connect', [ports[0], `${client}:input_1`], { timeout: 2000 }, (err) => {
        if (!err) { wConnected = ports[0]; log(`wave: reading ${ports[0]} through JACK as ${client}`); }
      });
    });
  }, 3000);
}
// The spectrogram (/palm/'s, on the Pi): one column every SPEC_COL_MS, newest on the right, rows log 60 Hz to
// 12 kHz, ink over SPEC_RANGE dB under the loudest recent bin, which falls back SPEC_FALL dB a second.
const SPEC_N = 1024, SPEC_LO = 60, SPEC_HI = 12000, SPEC_RANGE = 60, SPEC_FALL = 20, SPEC_FLOOR = -90, SPEC_CEIL = -20, SPEC_COL_MS = 1000 / 15;
const SPEC_H = 59, spec = new Uint8Array(W * SPEC_H);
const HANN = Float32Array.from({ length: SPEC_N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / SPEC_N));
const sRe = new Float32Array(SPEC_N), sIm = new Float32Array(SPEC_N);
const sBins = Int32Array.from({ length: SPEC_H }, (_, y) => Math.max(1, Math.min(SPEC_N / 2 - 1, Math.round(SPEC_LO * (SPEC_HI / SPEC_LO) ** (1 - y / (SPEC_H - 1)) / RATE * SPEC_N))));
let specTop = null, specAt = 0;
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const p = i + j, q = p + len / 2, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
        const tt = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = tt;
      }
    }
  }
}
function specColumn(dt) {
  let pk = 0;
  for (let i = 0; i < SPEC_N; i++) { const v = wave[((wPos - SPEC_N + i) % WBUF + WBUF) % WBUF]; if (Math.abs(v) > pk) pk = Math.abs(v); sRe[i] = v * HANN[i]; sIm[i] = 0; }
  wPeak = pk;
  fft(sRe, sIm);
  const db = new Float32Array(SPEC_H);
  let peak = -Infinity;
  for (let y = 0; y < SPEC_H; y++) { const k = sBins[y]; db[y] = 20 * Math.log10(Math.hypot(sRe[k], sIm[k]) / (SPEC_N / 4) + 1e-9); if (db[y] > peak) peak = db[y]; }
  // the floor keeps silence black: with no sound every bin would be the loudest one
  specTop = Math.max(SPEC_FLOOR, peak, Math.min(SPEC_CEIL, (specTop ?? peak) - SPEC_FALL * dt));
  // one shift of the whole buffer: each row's first pixel lands in the row above's last column, which is written next
  spec.copyWithin(0, 1);
  for (let y = 0; y < SPEC_H; y++) {
    const v = Math.max(0, Math.min(1, (db[y] - (specTop - SPEC_RANGE)) / SPEC_RANGE)) ** 1.5;
    spec[y * W + W - 1] = Math.round(v * 15);
  }
}
function drawSpec(t) {
  // columns are made by time, so a skipped frame scrolls as far as a sent one
  if (wGot >= SPEC_N) {
    if (!specAt) specAt = t;
    let n = Math.min(W, Math.floor((t - specAt) / SPEC_COL_MS));
    if (n > 0) specAt += n * SPEC_COL_MS;
    // several columns from one window when frames were skipped: the picture keeps time, the detail does not
    while (n-- > 0) specColumn(SPEC_COL_MS / 1000);
  }
  for (let y = 0; y < SPEC_H; y++) for (let x = 0; x < W; x++) { const v = spec[y * W + x]; if (v) put(x, y, v); }
}
// Split: the spectrogram over the top half, the rings in the bottom half.
function drawSplit(t) {
  drawSpec(t);
  rect(0, 60, W, 1, 4);
  drawRings(t, { cx: 80, cy: 91, rIn: 4, rStep: 1, top: 62 });
  drawHits(t);
}

// Drum hits (channel 10) flash along the bottom.
function drawHits(t) {
  for (const h of hits) {
    const age = t - h.t;
    if (age > 400) continue;
    const v = Math.round((1 - age / 400) * 15 * (h.vel / 127));
    rect(((h.n - 35) * 7 % 150 + 150) % 150 + 2, DH - 6, 6, 5, v);
  }
}

function render(t) {
  ink.fill(0);
  if (VIEW === 'drums') return drawDrums(t);
  if (VIEW === 'split') drawSplit(t);
  else if (VIEW === 'rings') drawRings(t); else if (VIEW === 'keys') drawKeys(t); else drawRoll(t);
  // The note, large, top left; its velocity and channel under it. Split: small, bottom left.
  if (VIEW === 'split') {
    const fresh = lastNote && (t - lastAt < 1500 || held.size);
    text(2, DH - 9, lastNote ? nameOf(lastNote.n) : (DEMO ? 'demo' : 'waiting'), 1, fresh ? 15 : 6);
  } else if (lastNote) {
    const label = nameOf(lastNote.n), fresh = t - lastAt < 1500 || [...held.values()].length;
    text(2, 2, label, 2, fresh ? 15 : 6);
    text(2, 20, `v${lastNote.vel} ch${lastNote.ch}`, 1, fresh ? 12 : 5);
  } else text(2, 2, DEMO ? 'demo' : 'waiting', 1, 8);
  const tag = DEMO ? 'demo' : `${sockets[CROOM]?.open && sockets[ROOM]?.open ? 'relay' : 'no relay'}`;
  text(W - 2 - textW(tag), VIEW === 'split' ? 64 : 2, tag, 1, 7);
  if (pen) {
    rect(pen.x - 4, pen.y, 9, 1, 15); rect(pen.x, pen.y - 4, 1, 9, 15);
    if (PEN) { const s = `cc${PEN_X} ${penSent[PEN_X] ?? '-'} cc${PEN_Y} ${penSent[PEN_Y] ?? '-'}`; text(W - 2 - textW(s), DH - 9, s, 1, 10); }
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function pack(fmt) {
  const len = W * H * fmt / 8, buf = Buffer.alloc(5 + len);
  buf[0] = 0x50; buf[1] = 0x46; buf[2] = fmt; buf[3] = len >> 8; buf[4] = len & 0xff;
  const lv = (1 << fmt) - 1, per = 8 / fmt;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = LIGHT ? ink[i] : 15 - ink[i];
    if (!k) continue;
    const v = fmt === 1 ? (k * 16 / 15 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5 ? 1 : 0) : Math.round(k / 15 * lv);
    buf[5 + (i / per | 0)] |= v << (8 - fmt * (i % per + 1));
  }
  return buf;
}
function snap(file) {
  const head = Buffer.from(`P5\n${W} ${H}\n255\n`), px = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) px[i] = LIGHT ? 255 - ink[i] * 17 : ink[i] * 17;
  fs.writeFileSync(file, Buffer.concat([head, px]));
}

// Frames at FPS while anything moves, once a second when still.
let lastFrame = 0;
const moving = (t) => held.size || !silent || gone.some((s) => t - s.off < FADE_MS) || hits.some((h) => t - h.t < 400) || dirty || (VIEW === 'drums' && stepNow(t) !== drawnStep);
if (VIEW !== 'camera') setInterval(() => {
  const t = Date.now();
  // a still grid refreshes every 5 s, so a tap seldom lands behind a frame nobody needed
  if (!moving(t) && t - lastFrame < (VIEW === 'drums' ? 5000 : 1000)) return;
  if (frameQueued) return;   // the link is behind: skip this one rather than queue a stale picture
  dirty = false; lastFrame = t;
  render(t);
  enqueue(pack(FMT), { frame: true });
}, 1000 / FPS);
if (!DRY || process.platform === 'linux') waveStart();
else if (VIEW === 'drums') fakePlaits();

// The OLED: the same split at 128x64, the spectrogram's newest 128 columns over 32 rows and the rings under it,
// dithered to one bit and packed page major (8 pages of 128 bytes, bit 0 on top) as the SSD1306 takes it.
const OW = 128, OH = 64, OLED_FPS = 10;
let oledSent = 0;
function oledFrame(t) {
  ink.fill(0);
  if (VIEW === 'split') drawSpec(t);
  const img = new Uint8Array(OW * OH);
  for (let y = 0; y < 32; y++) { const sy = Math.round(y * (SPEC_H - 1) / 31); for (let x = 0; x < OW; x++) img[y * OW + x] = ink[sy * W + x + (W - OW)]; }
  ink.fill(0);
  drawRings(t, { cx: 64, cy: 48, rIn: 2, rStep: 0.55, top: 33 });
  for (let y = 32; y < OH; y++) for (let x = 0; x < OW; x++) img[y * OW + x] = ink[y * W + x];
  const out = Buffer.alloc(OW * OH / 8);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const k = img[y * OW + x];
    if (k && k * 16 / 15 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5) out[(y >> 3) * OW + x] |= 1 << (y & 7);
  }
  return out;
}
// ── the drum grid's wave and OLED, 10 a second: Plaits' wave as a still trace, the grid over it on the OLED ──
// The trace starts on a rising crossing of a smoothed copy, so a held note stands still; it is scaled to its
// own peak (at least WAVE_MIN), so the knobs show as shape. Silence is no cols: a flat line.
const SCOPE_N = 2048, WAVE_MIN = 0.2, WAVE_QUIET = 0.002;
let waveCols = null, waveSent = 0, waveWas = false, oledLast = null, oledAt = 0;
function scopeCols() {
  if (wGot < SCOPE_N * 2) return null;
  const at = (i) => wave[((i % WBUF) + WBUF) % WBUF];
  let start = wPos - SCOPE_N, lp = 0, prev = 0, peak = 0;
  for (let i = wPos - SCOPE_N; i < wPos; i++) peak = Math.max(peak, Math.abs(at(i)));
  wPeak = peak;
  if (peak < WAVE_QUIET) return null;
  // one pole at about 150 Hz: a folded wave crosses zero many times a period, its fundamental once
  for (let i = wPos - SCOPE_N * 2; i < wPos - SCOPE_N; i++) {
    lp += 0.02 * (at(i) - lp);
    if (prev < 0 && lp >= 0) start = i;
    prev = lp;
  }
  const n = PD.WAVE_COLS, per = SCOPE_N / n, k = 100 / Math.max(peak, WAVE_MIN), cols = new Array(n * 2);
  for (let c = 0; c < n; c++) {
    let lo = 1, hi = -1;
    for (let j = 0; j < per; j++) { const v = at(start + c * per + j); if (v < lo) lo = v; if (v > hi) hi = v; }
    cols[c * 2] = Math.max(-100, Math.round(lo * k)); cols[c * 2 + 1] = Math.min(100, Math.round(hi * k));
  }
  return cols;
}
/** --dry off the Pi: a C2 drone folded like the Growl patch, three seconds on and one off, so both lanes are seen. */
function fakePlaits() {
  let ph = 0, n = 0;
  setInterval(() => {
    for (let i = 0; i < RATE / 50; i++, n++) {
      const on = n % (RATE * 4) < RATE * 3, x = Math.sin(ph) * (1.5 + Math.sin(n / RATE));
      wave[wPos] = on ? 0.3 * Math.sin(x * 1.7) : 0;
      wPos = (wPos + 1) % WBUF; ph += 2 * Math.PI * 65.4 / RATE;
    }
    wGot += RATE / 50;
  }, 20);
}
/** The OLED in the drum view: 16 steps of 8 px over 16 rows of 3 (a hit is 6 by 2), the playing step inverted, the wave in rows 49 to 63. */
function drumsOled(t) {
  const img = new Uint8Array(OW * OH);
  const r1 = (x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < OW && j < OH) img[j * OW + i] = v ? 1 : 0; };
  const now = stepNow(t);
  if (now >= 0) r1(now * 8, 0, 8, 48, 1);
  for (let r = 0; r < G_ROWS; r++) for (let c = 0; c < G_STEPS; c++) {
    const on = c === now ? 0 : 1;
    if (grid[r][c]) r1(c * 8 + 1, r * 3, 6, 2, on);
    else if (c % 4 === 0 && c !== now) r1(c * 8 + 4, r * 3, 1, 1, 1);
  }
  PD.drawWave((x, y, w, h) => r1(x, y, w, h, 1), 0, 49, OW, 15, waveCols);
  const out = Buffer.alloc(OW * OH / 8);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) if (img[y * OW + x]) out[(y >> 3) * OW + x] |= 1 << (y & 7);
  return out;
}
function oledPgm(file, b) {
  const px = Buffer.alloc(OW * OH);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) px[y * OW + x] = b[(y >> 3) * OW + x] & (1 << (y & 7)) ? 255 : 0;
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${OW} ${OH}\n255\n`), px]));
}
if (VIEW === 'drums') setInterval(() => {
  if (stopping || !PD || !gVoices) return;
  const t = Date.now();
  waveCols = scopeCols();
  if (waveCols || waveWas) dirty = true;
  // the page's lane (/present/pipalm/): only while there is a wave, and once more when it goes quiet; never --dry
  if (!DRY && (waveCols || waveWas) && sendTo(ROOM, { type: 'palm.wave', cols: waveCols || [] })) waveSent++;
  waveWas = !!waveCols;
  if (!OLED_RAW) return;
  const b = drumsOled(t);
  if (OLED_SNAP) oledPgm(OLED_SNAP, b);
  // a still frame once a second keeps the board's own grid drawing from coming back (board.mjs, rawAt)
  if (DRY || (oledLast && b.equals(oledLast) && t - oledAt < 1000)) return;
  if (sendTo(ROOM, { type: 'screen.raw', b64: b.toString('base64') })) { oledSent++; oledLast = b; oledAt = t; }
}, 100);
if (OLED_RAW && VIEW !== 'camera' && VIEW !== 'drums') setInterval(() => {
  if (stopping) return;
  const t = Date.now(), b = oledFrame(t);
  if (sendTo(ROOM, { type: 'screen.raw', b64: b.toString('base64') })) oledSent++;
}, 1000 / OLED_FPS);
if (SNAP && VIEW !== 'camera') setInterval(() => { render(Date.now()); snap(SNAP); }, 1000);

// ── the camera view: the Pi's USB camera on the Palm and the OLED, nothing drawn over it ──
// One capture (cam.mjs's: 320x240, square crop, 160x160 grey), levels stretched 2 to 98 percent.
// The Palm gets each new frame whole at 4 bit grey, no dither, whenever the last one has gone out;
// the OLED gets the middle 160x80 band scaled to 128x64, Bayer dithered to 1 bit, at OLED_CAM_FPS.
const OLED_CAM_FPS = 12;
let camProc = null, camFrame = null, camFresh = false, camFrames = 0, camVideo = null;
function camStart() {
  if (VIEW !== 'camera' || stopping) return;
  camVideo = findVideo(opt('--video', null));
  if (!camVideo) { log('camera: none listed by v4l2-ctl, again in 5 s'); return setTimeout(camStart, 5000); }
  const who = holdersOf(camVideo);
  if (who.length) { log(`camera: ${camVideo} is held (one holder at a time, nothing stopped), again in 5 s: ${who.join('; ')}`); return setTimeout(camStart, 5000); }
  const p = spawn('ffmpeg', ffArgs(camVideo, CAM_FPS, W, H), { stdio: ['ignore', 'pipe', 'pipe'] });
  camProc = p;
  let acc = Buffer.alloc(0);
  p.on('error', (e) => log(`camera: ffmpeg ${e.message}`));
  p.stderr.on('data', (d) => { for (const l of d.toString().split('\n')) if (l.trim()) log(`camera: ${l.trim().slice(0, 160)}`); });
  p.stdout.on('data', (chunk) => {
    acc = acc.length ? Buffer.concat([acc, chunk]) : chunk;
    while (acc.length >= W * H) {
      camFrame = Buffer.from(acc.subarray(0, W * H)); acc = acc.subarray(W * H);
      camFresh = true; camFrames++;
      camToPalm();
    }
  });
  p.on('exit', (code, sig) => {
    if (camProc === p) camProc = null;
    if (!stopping) { log(`camera: ffmpeg ended (${sig ?? code}), again in 2 s`); setTimeout(camStart, 2000); }
  });
  log(`camera: ${camVideo} 320x240 at ${CAM_FPS} fps, square crop to ${W}x${H}`);
}
function camPack(g) {
  const len = W * H / 2, buf = Buffer.alloc(5 + len);
  buf[0] = 0x50; buf[1] = 0x46; buf[2] = 4; buf[3] = len >> 8; buf[4] = len & 0xff;
  const { min, max } = levels(g), k = 255 / Math.max(1, max - min);
  // pframe draws 0 as white and 15 as black
  for (let i = 0; i < W * H; i++) {
    const v = Math.max(0, Math.min(255, (g[i] - min) * k));
    buf[5 + (i >> 1)] |= Math.round((255 - v) / 17) << (i & 1 ? 0 : 4);
  }
  return buf;
}
function camToPalm() {
  if (DRY || stopping || !camFresh || frameQueued) return;   // the link is behind: the newest frame goes next
  camFresh = false;
  enqueue(camPack(camFrame), { frame: true });
}
const OY0 = (H - W / 2) / 2;   // the 2:1 band: rows 40 to 119 of the square
function camOled(g) {
  const b = Buffer.alloc(OW * OH / 8), band = g.subarray(OY0 * W, (OY0 + W / 2) * W), { min, max } = levels(band);
  const k = 255 / Math.max(1, max - min), sx = W / OW, sy = (W / 2) / OH;
  for (let y = 0; y < OH; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < OW; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let n = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { n += band[yy * W + xx]; c++; }
      const v = (n / c - min) * k;
      if (v > (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) * 16) b[(y >> 3) * OW + x] |= 1 << (y & 7);
    }
  }
  return b;
}
if (VIEW === 'camera') {
  // the tty takes a frame, then the newest camera frame goes, so the Palm runs as fast as it reads
  setInterval(camToPalm, 5);
  if (OLED_RAW) setInterval(() => {
    if (stopping || !camFrame) return;
    if (sendTo(ROOM, { type: 'screen.raw', b64: camOled(camFrame).toString('base64') })) oledSent++;
  }, 1000 / OLED_CAM_FPS);
  if (SNAP) setInterval(() => { if (camFrame) fs.writeFileSync(SNAP, Buffer.concat([Buffer.from(`P5\n${W} ${H}\n255\n`), camFrame])); }, 1000);
  camStart();
}

let win = { t: Date.now(), f: 0, b: 0 };
setInterval(() => {
  const dt = (Date.now() - win.t) / 1000;
  const cf = VIEW === 'camera' ? `, camera ${((camFrames - (win.cam ?? 0)) / dt).toFixed(1)} frames/s` : '';
  const fps = (sent.frames - win.f) / dt, kbs = (sent.bytes - win.b) / dt / 1024, tps = (sent.tones - (win.tones ?? 0)) / dt;
  win = { t: Date.now(), f: sent.frames, b: sent.bytes, tones: sent.tones, cam: camFrames };
  const top = soundingNote !== null ? nameOf(soundingNote) : '-';
  const w = VIEW === 'split' || VIEW === 'drums' ? `, wave ${wConnected || 'off'} ${(wGot / RATE / Math.max(1, (Date.now() - t0) / 1000) * 100).toFixed(0)}% peak ${wPeak.toFixed(4)}${VIEW === 'drums' ? `, palm.wave sent ${waveSent}` : ''}` : '';
  log(`${VIEW} fmt ${FMT}: ${DRY ? 'dry' : `${fps.toFixed(1)} frames/s ${kbs.toFixed(0)} KB/s`}, heard ${heard}, held ${held.size}${VOICE ? `, voice ${vs.mode} ${top} ${tps.toFixed(1)} tones/s` : ''}${PEN ? `, pen ccs ${penCount}` : ''}${VIEW === 'drums' ? `, strokes ${drumPens?.strokes() ?? 0}${seqS.running ? ` playing step ${stepNow() + 1}` : ''}` : ''}${OLED_RAW ? `, oled frames ${oledSent}` : ''}${cf}${w}`);
}, 5000);

log(`bridge: ${DRY ? 'dry, no tty' : dev}, view ${VIEW}, fmt ${FMT} at ${FPS} fps${VOICE ? `, voice ${JSON.stringify(vs)}` : ''}${PEN ? `, pen to cc ${PEN_X},${PEN_Y} ch ${PEN_CH}` : ''}, ${DEMO ? 'demo notes' : `rooms ${ROOM} and ${CROOM}`}`);

function stop() {
  if (stopping) return;
  stopping = true;
  wProc?.kill();
  camProc?.kill('SIGKILL');
  if (fd === null) { if (OLED && oledHeld.size) sendTo(ROOM, { type: 'screen.note', panic: true }); return setTimeout(() => process.exit(0), 200); }
  if (OLED && oledHeld.size) sendTo(ROOM, { type: 'screen.note', panic: true });
  queue.length = 0;
  enqueue(QUIET);
  // a last ping: the answer says pframe is still alive after the voice
  const asked = Date.now();
  enqueue(PING);
  const wait = () => (lastSt >= asked || (!isTty && !writing && !queue.length) ? process.exit(0) : setTimeout(wait, 10));
  wait();
  setTimeout(() => { log('no answer to the last ping in 1.5 s'); process.exit(0); }, 1500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);
process.on('exit', () => { try { camProc?.kill('SIGKILL'); } catch { /* gone */ } });
if (SECS > 0) setTimeout(stop, SECS * 1000);
