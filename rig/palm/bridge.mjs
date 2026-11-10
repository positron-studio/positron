#!/usr/bin/env node
// The Pi's synths with the Palm as their picture: notes heard in the board's relay rooms are drawn
// on the Palm (pframe) as rings, keys or a roll; --voice plays the top note on the Palm, and --pen
// turns the stylus into two Circuit macro CCs sent the way /remote/circuit/ sends them.
//
//   sudo modprobe visor                                   # pframe's tty
//   node bridge.mjs /dev/ttyUSB0 --view rings --voice --pen
//   node bridge.mjs /dev/ttyUSB0 --demo                   # an arpeggio made here, no relay: the Palm alone
//   node bridge.mjs --dry --snap /tmp/palm.pgm --secs 10  # no Palm: log notes, write the picture as PGM
//   --view rings|keys|roll  --fmt 1|2|4 (default 4)  --fps N (default 15 at 4 bit, 30 at 1 bit)
//   --room studio-1   --relay wss://...   --pen-cc 80,81   --pen-ch 1   --dry   --demo   --secs N   --light (black on white; the default is white on black)   --no-oled
//
// Where the notes come from (read only, nothing is asked of the board):
//   room <room>-circuit  `midi.send` {bytes} from /remote/circuit/ on its default relay path, and
//                        `midi.panic`. The relay echoes every message to every socket in the room.
//   room <room>          `note.on/off/panic` {note, vel, node} (Plaits, the sampler) and `screen.note`.
// Not heard: /remote/circuit/?path=direct (WebRTC straight to the Pi), the MK-425C on the Pi and
// the board's own sequencer, which all write the Circuit inside the board and never reach a room.
//
// Packets (frame.c): 'P' 'F' fmt len_hi len_lo + frame; 'P' 'N' key vel dur_hi dur_lo (dur 0
// holds); 'P' 'Q' quiet; 'P' '?' ping, sent once a second while the voice holds a note, because
// pframe's watchdog quiets a note after 2 s with no packet and frames do not count as packets.
// One writer: every packet goes through one queue, whole, so a note never lands inside a frame.
// The Palm draws its status lines over rows 124 to 159, so the picture uses rows 0 to 121.
import fs from 'node:fs';
import tty from 'node:tty';
import { execFileSync } from 'node:child_process';

const W = 160, H = 160, DH = 122;
const args = process.argv.slice(2);
const VALUED = ['--view', '--fmt', '--fps', '--room', '--relay', '--pen-cc', '--pen-ch', '--snap', '--secs'];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);
const dev = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1])) || '/dev/ttyUSB0';
const VIEW = opt('--view', 'rings');
const FMT = Number(opt('--fmt', 4));
const FPS = Number(opt('--fps', FMT === 1 ? 30 : FMT === 2 ? 20 : 15));
const ROOM = opt('--room', 'studio-1');
const RELAY = opt('--relay', 'wss://ws.positron.studio');
const [PEN_X, PEN_Y] = opt('--pen-cc', '80,81').split(',').map(Number);
const PEN_CH = Number(opt('--pen-ch', 1));
const VOICE = flag('--voice'), PEN = flag('--pen'), DRY = flag('--dry'), DEMO = flag('--demo');
const SNAP = opt('--snap', null), SECS = Number(opt('--secs', 0));
// White on black by default (the owner: "circle notes on palm. white on black"); --light draws black on white.
const LIGHT = flag('--light');
// The board's OLED mirrors the rings unless --no-oled.
const OLED = !flag('--no-oled');
if (!['rings', 'keys', 'roll'].includes(VIEW)) die('--view rings, keys or roll');
if (![1, 2, 4].includes(FMT)) die('--fmt 1, 2 or 4 (the picture is grey)');
if (!(FPS > 0 && FPS <= 50)) die('--fps 1 to 50');
if (![PEN_X, PEN_Y].every((c) => Number.isInteger(c) && c >= 0 && c <= 119)) die('--pen-cc two controller numbers, e.g. 80,81');
if (!(PEN_CH >= 1 && PEN_CH <= 16)) die('--pen-ch 1 to 16');
function die(s) { console.error(s); process.exit(2); }
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

// ── the notes ──────────────────────────────────────────────────────────────
// key -> { n, vel, ch, on, src }; released notes keep fading in `gone`.
const held = new Map(), gone = [], hits = [];
const STUCK_MS = 30_000, FADE_MS = 3000;
let lastNote = null, lastAt = 0, heard = 0, dirty = true;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

function noteOn(src, ch, n, vel) {
  if (!(n >= 0 && n <= 127)) return;
  if (!vel) return noteOff(src, ch, n);
  const t = Date.now();
  heard++; dirty = true; lastAt = t;
  if (ch === 10) { hits.push({ n, vel, t }); if (hits.length > 32) hits.shift(); return; }
  const k = `${src}:${ch}:${n}`;
  if (held.has(k)) noteOff(src, ch, n);
  const s = { n, vel, ch, on: t, src };
  held.set(k, s);
  lastNote = { n, vel, ch, src };
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
  if (!OLED || s.src.startsWith('screen:')) return;
  const n = fold(s.n, O_LO, O_HI), c = oledHeld.get(n) || 0;
  if (on) { oledHeld.set(n, c + 1); if (!c) sendTo(ROOM, { type: 'screen.note', n, on: true }); }
  else if (c) { if (c === 1) { oledHeld.delete(n); sendTo(ROOM, { type: 'screen.note', n, on: false }); } else oledHeld.set(n, c - 1); }
}
function panic(src) {
  for (const s of [...held.values()]) if (!src || s.src === src) noteOff(s.src, s.ch, s.n);
}
setInterval(() => { const t = Date.now(); for (const s of [...held.values()]) if (t - s.on > STUCK_MS) noteOff(s.src, s.ch, s.n); }, 1000);

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
let writing = false, frameQueued = false, sent = { frames: 0, notes: 0, bytes: 0 };
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

// ── the voice: the top held note, mono, quiet on silence ─────────────────
let sounding = null;
const notePkt = (n, vel) => Buffer.from([0x50, 0x4e, n, vel, 0, 0]);
const QUIET = Buffer.from([0x50, 0x51]), PING = Buffer.from([0x50, 0x3f]);
function voice() {
  if (!VOICE) return;
  let top = null;
  for (const s of held.values()) if (!top || s.n > top.n) top = s;
  if (top && sounding && top.n === sounding.n && top.on === sounding.on) return;
  if (top) { enqueue(notePkt(top.n, Math.max(1, Math.min(127, top.vel))), { front: true }); sounding = top; }
  else if (sounding) { enqueue(QUIET, { front: true }); sounding = null; }
}
if (VOICE) setInterval(() => { if (sounding) enqueue(PING, { front: true }); }, 1000);

// ── the pen: x and y to two CCs on the Circuit, through its room like /remote/circuit/ ───
let pen = null, penSent = {}, penWant = {}, penTimer = null, penCount = 0;
const clamp = (v) => Math.max(0, Math.min(127, Math.round(v)));
function onPen(x, y, down) {
  if (y >= DH) return;
  pen = { x, y, down };
  dirty = true;
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
      else if (line === 'stop') { log('a hard button on the Palm stopped the sound'); sounding = null; }
      else if (line.startsWith('st ')) { if (!saidSt) log(`the Palm answers the ping: ${line}`); saidSt = true; }
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
function drawRings(t) {
  const cx = 80, cy = 62;
  rect(cx, 1, 1, 4, 15);
  for (const s of [...gone, ...held.values()]) {
    const lv = level(s, t);
    if (lv <= 0) continue;
    const end = s.off || t, span = Math.min(FULL, (end - s.on) * TURN), a0 = (t - end) * TURN;
    const r = R_IN + (fold(s.n, R_LO, R_HI) - R_LO) * R_STEP;
    const v = Math.max(3, Math.round(lv * 15));
    const step = 0.5 / r, steps = Math.floor(span / step) + 1;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + Math.min(i * step, span);
      const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
      put(Math.round(x), Math.round(y), v);
      if (!s.off) put(Math.round(x + Math.sin(a)), Math.round(y - Math.cos(a)), v);   // held: two pixels thick
    }
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
  if (VIEW === 'rings') drawRings(t); else if (VIEW === 'keys') drawKeys(t); else drawRoll(t);
  // The note, large, top left; its velocity and channel under it.
  if (lastNote) {
    const label = nameOf(lastNote.n), fresh = t - lastAt < 1500 || [...held.values()].length;
    text(2, 2, label, 2, fresh ? 15 : 6);
    text(2, 20, `v${lastNote.vel} ch${lastNote.ch}`, 1, fresh ? 12 : 5);
  } else text(2, 2, DEMO ? 'demo' : 'waiting', 1, 8);
  const tag = DEMO ? 'demo' : `${sockets[CROOM]?.open && sockets[ROOM]?.open ? 'relay' : 'no relay'}`;
  text(W - 2 - textW(tag), 2, tag, 1, 7);
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
const moving = (t) => held.size || gone.some((s) => t - s.off < FADE_MS) || hits.some((h) => t - h.t < 400) || dirty;
setInterval(() => {
  const t = Date.now();
  if (!moving(t) && t - lastFrame < 1000) return;
  if (frameQueued) return;   // the link is behind: skip this one rather than queue a stale picture
  dirty = false; lastFrame = t;
  render(t);
  enqueue(pack(FMT), { frame: true });
}, 1000 / FPS);
if (SNAP) setInterval(() => { render(Date.now()); snap(SNAP); }, 1000);

let win = { t: Date.now(), f: 0, b: 0 };
setInterval(() => {
  const dt = (Date.now() - win.t) / 1000;
  const fps = (sent.frames - win.f) / dt, kbs = (sent.bytes - win.b) / dt / 1024;
  win = { t: Date.now(), f: sent.frames, b: sent.bytes };
  const top = sounding ? nameOf(sounding.n) : '-';
  log(`${VIEW} fmt ${FMT}: ${DRY ? 'dry' : `${fps.toFixed(1)} frames/s ${kbs.toFixed(0)} KB/s`}, heard ${heard}, held ${held.size}${VOICE ? `, voice ${top}` : ''}${PEN ? `, pen ccs ${penCount}` : ''}`);
}, 5000);

log(`bridge: ${DRY ? 'dry, no tty' : dev}, view ${VIEW}, fmt ${FMT} at ${FPS} fps${VOICE ? ', voice' : ''}${PEN ? `, pen to cc ${PEN_X},${PEN_Y} ch ${PEN_CH}` : ''}, ${DEMO ? 'demo notes' : `rooms ${ROOM} and ${CROOM}`}`);

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  if (fd === null) { if (OLED && oledHeld.size) sendTo(ROOM, { type: 'screen.note', panic: true }); return setTimeout(() => process.exit(0), 200); }
  if (OLED && oledHeld.size) sendTo(ROOM, { type: 'screen.note', panic: true });
  queue.length = 0;
  enqueue(QUIET);
  const wait = () => (writing || queue.length ? setTimeout(wait, 10) : process.exit(0));
  wait();
  setTimeout(() => process.exit(0), 1000);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
if (SECS > 0) setTimeout(stop, SECS * 1000);
