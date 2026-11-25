// Hardware audio inputs, each its own stream in its own room `<room>-<name>` (two sources on one
// socket corrupt both). A page asks for a name, configured in BOARD_INPUTS, never a device. The
// room is joined for good; the capture runs only under a lease renewed by `input.want`.
// why: lessons/rig-board.md#inputs-header

import { CIRCUIT_CC } from '../../demo/shell/circuit-cc.mjs';
import { kindOf } from '../../demo/shell/midi-kinds.mjs';
import { createRtc } from './rtc.mjs';
import { createMidiParser, backVerdict, createBackLimiter, GAP_MS } from './midi-back.mjs';
import { constants as FS } from 'node:fs';

export const LEASE_MS = 60_000;

// The synth controllers from the table /shape/ sends from, its channel 1/2 rows only: a control
// change
// replaces nothing stored. Drum and session rows stay out.
// why: lessons/rig-board.md#synth-cc
export const SYNTH_CC = new Set(CIRCUIT_CC.filter((p) => p.ch === '1/2').map((p) => p.cc));
export const SYNTH_CHANNELS = [1, 2];

// The one SysEx read allowed: Current Patch Dump Request F0 00 20 29 01 60 40 <00|01> F7 (9 bytes,
// Programmer's Reference 1.3 p13). Matched byte for byte and by length, never by prefix (a Replace
// Patch shares the header). Returns 0 or 1 (Synth 1 or 2), or null.
// why: lessons/rig-board.md#dump-request
export const DUMP_REQUEST_HEAD = Object.freeze([0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x40]);
export function dumpRequestSynth(bytes) {
  if (!Array.isArray(bytes) || bytes.length !== 9) return null;
  for (let i = 0; i < DUMP_REQUEST_HEAD.length; i++) if (bytes[i] !== DUMP_REQUEST_HEAD[i]) return null;
  if (bytes[7] !== 0x00 && bytes[7] !== 0x01) return null;
  if (bytes[8] !== 0xF7) return null;
  return bytes[7];
}

// The universal Device Inquiry F0 7E 7F 06 01 F7, all-call only; it changes nothing. 06 02 is the
// reply and never leaves the board.
// why: lessons/rig-board.md#device-inquiry
export const DEVICE_INQUIRY = Object.freeze([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]);
export function isDeviceInquiry(bytes) {
  return Array.isArray(bytes) && bytes.length === DEVICE_INQUIRY.length && DEVICE_INQUIRY.every((b, i) => bytes[i] === b);
}
// Stock firmware 3592 lights one LED: F0 00 20 29 01 60 74 <led> <r> <g> <b> F7, colours 0 to 63, held in a layer
// the UI adds to and never clears. The Circuit does not bound <led>; above 68 it writes past a RAM array.
// why: lessons/rig-board.md#pad-light
export const PAD_LIGHT_HEAD = Object.freeze([0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x74]);
export const PAD_LIGHT_LEDS = 69;
export function isPadLight(bytes) {
  if (!Array.isArray(bytes) || bytes.length !== 12) return false;
  if (!PAD_LIGHT_HEAD.every((b, i) => bytes[i] === b) || bytes[11] !== 0xF7) return false;
  return bytes[7] < PAD_LIGHT_LEDS && bytes.slice(8, 11).every((c) => c <= 63);
}
export function padLightBytes(led, r, g, b) {
  return [...PAD_LIGHT_HEAD, led, r, g, b, 0xF7];
}
// A Novation Identity Reply (F0 7E <dev> 06 02 00 20 29 ...), with slack on length so a reply is
// not
// refused for its size.
// why: lessons/rig-board.md#identity-reply
export function isIdentityReply(msg) {
  if (!msg || msg.length < 15 || msg.length > 24) return false;
  const want = [0xF0, 0x7E, null, 0x06, 0x02, 0x00, 0x20, 0x29];
  if (!want.every((b, i) => b === null || msg[i] === b)) return false;
  return msg[msg.length - 1] === 0xF7;
}

// The 350-byte Replace Current Patch the Circuit sends back for the asked location; nothing else
// passes.
// why: lessons/rig-board.md#patch-reply
export function isPatchReply(msg, loc) {
  if (!msg || msg.length !== 350) return false;
  for (let i = 0; i < 6; i++) if (msg[i] !== DUMP_REQUEST_HEAD[i]) return false;
  if (msg[6] !== 0x00 || msg[7] !== loc || msg[349] !== 0xF7) return false;
  for (let i = 1; i < 349; i++) if (msg[i] > 0x7F) return false;
  return true;
}

// SysEx out of a raw byte stream: real-time bytes dropped, an unclosed SysEx discarded on the next
// status, anything over `max` abandoned.
// why: lessons/rig-board.md#sysex-catcher
export function createSysexCatcher(max = 400) {
  let cur = null;
  return {
    feed(chunk) {
      const done = [];
      for (const b of chunk) {
        if (b >= 0xF8) continue;
        if (b === 0xF0) { cur = [b]; continue; }
        if (!cur) continue;
        if (b === 0xF7) { cur.push(b); done.push(cur); cur = null; continue; }
        if (b > 0x7F) { cur = null; continue; }
        cur.push(b);
        if (cur.length > max) cur = null;
      }
      return done;
    },
  };
}

/** How long the board listens for the Circuit's answer before saying none came. */
export const DUMP_MS = 1000;

// What a page may send the instrument, an allowlist: note on/off and CC 123 on configured channels,
// SYNTH_CC on 1 and 2, program change 0 to 63 on 1 and 2 only (on 16 it is a session), the two
// SysEx reads, and the one LED write. Nothing else: the relay room is reachable by anyone who knows its name.
// why: lessons/rig-board.md#midi-verdict
export function midiVerdict(bytes, channels) {
  const v = verdict(bytes, channels);
  // A refusal names its kind in bay.mjs and alsa.mjs's vocabulary.
  // why: lessons/rig-board.md#refusal-kind
  return v.ok ? v : { ...v, kind: Array.isArray(bytes) ? kindOf(bytes) : 'other' };
}

function verdict(bytes, channels) {
  if (!Array.isArray(bytes) || !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return { ok: false, why: 'bytes are 0 to 255' };
  if (isDeviceInquiry(bytes)) return { ok: true, identity: true };
  if (isPadLight(bytes)) return { ok: true, light: true };
  const loc = dumpRequestSynth(bytes);
  if (loc !== null) {
    const ch = loc + 1;
    if (!channels.includes(ch)) return { ok: false, why: `a patch dump request for synth ${ch} and channel ${ch} is not one this input plays` };
    return { ok: true, dump: loc };
  }
  if (bytes.length === 2 && (bytes[0] & 0xF0) === 0xC0) {
    const ch = (bytes[0] & 0x0F) + 1, p = bytes[1];
    if (!SYNTH_CHANNELS.includes(ch) || !channels.includes(ch)) return { ok: false, why: `a program change on channel ${ch} is not a synth patch` };
    if (p > 63) return { ok: false, why: 'a synth patch is 0 to 63' };
    return { ok: true };
  }
  if (bytes.length !== 3) return { ok: false, why: 'three bytes, a channel voice message' };
  const [st, a, b] = bytes;
  if (a > 127 || b > 127) return { ok: false, why: 'data bytes are 0 to 127' };
  const kind = st & 0xF0, ch = (st & 0x0F) + 1;
  const note = kind === 0x80 || kind === 0x90;
  const allNotesOff = kind === 0xB0 && a === 123 && b === 0;
  const synthCc = kind === 0xB0 && SYNTH_CC.has(a);
  if (!note && !allNotesOff && !synthCc) {
    return { ok: false, why: `${kindOf(bytes)} is refused, only notes, all notes off and the synth control changes reach the instrument` };
  }
  if (!channels.includes(ch)) return { ok: false, why: `channel ${ch} is not one this input plays (${channels.join(', ')})` };
  if (synthCc && !SYNTH_CHANNELS.includes(ch)) {
    return { ok: false, why: `CC ${a} is a synth control and channel ${ch} is not a synth` };
  }
  return { ok: true };
}
export const BEAT_MS = 5_000;
const NAME_RE = /^[a-z0-9]{1,24}$/;

// BOARD_INPUTS is JSON (ALSA names contain `:` and `,`); returns valid inputs and a reason per
// refused one.
// why: lessons/rig-board.md#parse-inputs
export function parseInputs(text) {
  const inputs = new Map();
  const problems = [];
  if (!text || !String(text).trim()) return { inputs, problems };
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return { inputs, problems: [`BOARD_INPUTS is not JSON: ${e.message}`] }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { inputs, problems: ['BOARD_INPUTS is an object of name to input'] };
  }
  for (const [name, v] of Object.entries(raw)) {
    if (!NAME_RE.test(name)) { problems.push(`${JSON.stringify(name)}: a name is 1 to 24 of a-z and 0-9`); continue; }
    const device = v?.device;
    if (typeof device !== 'string' || !device || /\s/.test(device)) { problems.push(`${name}: device is an ALSA name with no spaces`); continue; }
    const channels = Number(v.channels ?? 1);
    if (!Number.isInteger(channels) || channels < 1 || channels > 8) { problems.push(`${name}: channels is 1 to 8`); continue; }
    const take = Number(v.take ?? 1);
    if (!Number.isInteger(take) || take < 1 || take > channels) { problems.push(`${name}: take is 1 to ${channels}`); continue; }
    let midi = null;
    if (v.midi != null) {
      const port = v.midi?.port;
      const mch = v.midi?.channels;
      if (typeof port !== 'string' || !/^[A-Za-z0-9_]{1,32}$/.test(port)) { problems.push(`${name}: midi.port is an ALSA card id`); continue; }
      if (!Array.isArray(mch) || !mch.length || !mch.every((c) => Number.isInteger(c) && c >= 1 && c <= 16)) {
        problems.push(`${name}: midi.channels is a list of 1 to 16`); continue;
      }
      midi = { port, channels: mch };
    }
    // `via`: `arecord` (default) or `jack`, which puts the input on the graph as
    // `<name>:capture_N`.
    // why: lessons/rig-board.md#via
    const via = v.via ?? 'arecord';
    if (via !== 'arecord' && via !== 'jack') { problems.push(`${name}: via is arecord or jack, not ${JSON.stringify(via)}`); continue; }
    // `jackd`: this input's card is jackd's clock (one input only). 512 x 3 by default: 256 x 3
    // gave
    // xruns on the Pi 4; 512 frames (10.7 ms) matches arecord's 480-frame period.
    // why: lessons/rig-board.md#jackd
    let jackd = null;
    if (v.jackd != null && v.jackd !== false) {
      if (via !== 'jack') { problems.push(`${name}: jackd needs via jack, the card cannot be both arecord's and jackd's`); continue; }
      if ([...inputs.values()].some((i) => i.jackd)) { problems.push(`${name}: there is one jackd, and another input is already its card`); continue; }
      const o = v.jackd === true ? {} : v.jackd;
      const period = Number(o?.period ?? 512), periods = Number(o?.periods ?? 3);
      if (!Number.isInteger(period) || period < 32 || period > 4096 || (period & (period - 1))) { problems.push(`${name}: jackd period is a power of two, 32 to 4096`); continue; }
      if (!Number.isInteger(periods) || periods < 2 || periods > 8) { problems.push(`${name}: jackd periods is 2 to 8`); continue; }
      // `playback: true` opens the card's outputs too, as `system:playback_N`; capture only otherwise.
      if (o?.playback != null && typeof o.playback !== 'boolean') { problems.push(`${name}: jackd playback is true or false`); continue; }
      jackd = { period, periods, ...(o?.playback ? { playback: true } : {}) };
    }
    inputs.set(name, { name, device, channels, take, midi, via, ...(jackd ? { jackd } : {}) });
  }
  return { inputs, problems };
}

// One channel out of an interleaved frame, `take` 1-based; never a downmix of an unpatched input's
// noise.
// why: lessons/rig-board.md#take-channel
export function takeChannel(all, channels, take, frame) {
  if (channels === 1) return all;
  const one = new Int16Array(frame);
  for (let i = 0; i < frame; i++) one[i] = all[i * channels + take - 1];
  return one;
}

// High-byte step sizes read as LE and swapped: the Fast Track Pro once sent big endian under S16_LE
// (hiss at -17 to -32 dBFS). The high byte moves slowly when read the right way round.
// why: lessons/rig-board.md#byte-order-steps
export function byteOrderSteps(all, channels) {
  let le = 0, be = 0;
  for (let i = channels; i < all.length; i++) {
    const a = all[i], b = all[i - channels];
    le += Math.abs((a >> 8) - (b >> 8));
    be += Math.abs(((a << 24) >> 24) - ((b << 24) >> 24));
  }
  return { le, be };
}

// Decides whether to swap bytes: a quarter second of evidence and one reading twice as steady.
// why: lessons/rig-board.md#byte-order
export function createByteOrder({ channels, windowSamples = 12_000, onChange = () => {} } = {}) {
  let swap = false, le = 0, be = 0, n = 0;
  return {
    get swapped() { return swap; },
    fix(all) {
      const s = byteOrderSteps(all, channels);
      le += s.le; be += s.be; n += all.length / channels;
      if (n >= windowSamples) {
        const was = swap;
        if (!swap && be * 2 < le) swap = true;
        else if (swap && le * 2 < be) swap = false;
        if (swap !== was) onChange(swap, { le, be });
        le = be = n = 0;
      }
      if (swap) for (let i = 0; i < all.length; i++) { const v = all[i]; all[i] = ((v & 0xFF) << 8) | ((v >> 8) & 0xFF); }
      return all;
    },
  };
}

/** Has the lease run out. Pure, so the sweep's one decision is graded. */
export function leaseExpired(lease, now) {
  return !(Number.isFinite(lease) && now < lease);
}

// The live half; sockets and processes come in as arguments, so tests run on fakes.
// why: lessons/rig-board.md#create-inputs
export function createInputs({
  inputs, room, relay, frame, rate, name: boardName, id: boardId,
  spawn, WebSocket, format, parse, randomId, log = () => {}, now = () => Date.now(), fs = null,
  // node-datachannel's PeerConnection, or null. Null is a board with no npm
  // install, and it is a board with the relay only, never a broken one.
  PeerConnection = null,
  leaseMs = LEASE_MS, beatMs = BEAT_MS,
  // 10 ms a period, four periods of buffer. See the capture below.
  periodFrames = 480, bufferFrames = 1920,
  // `{ ensure(), wire(doc, what) }` from `jacksynth.mjs`, or null on a board
  // with no JACK. Only an input configured `via: "jack"` uses it.
  jack = null, setTimer = setTimeout,
  // The Pi camera's keyed room, or null; camera.mjs decides whether frames go on a direct link's
  // `cam`.
  // why: lessons/rig-board.md#input-camera
  camera = null,
}) {
  const live = new Map();
  // The capture's unit: half a frame when a frame halves, so the direct path
  // can send 10 ms of a 20 ms frame. The relay's frame is unchanged.
  const UNIT = frame % 2 === 0 ? frame / 2 : frame;

  function one(cfg) {
    const s = {
      cfg, room: `${room}-${cfg.name}`, from: `board-${cfg.name}-${randomId(6)}`,
      ws: null, seq: 0, aseq: 0, proc: null, lease: 0, frames: 0, startedAt: null, lastHeard: now(),
      backoff: 500, closed: false, midiFd: null, held: new Set(), notesOut: 0, refused: 0, rtc: null,
      bridge: null, bridgeAt: 0, bridgeBackoff: 2000, bridgeStarts: 0, fed: null, dump: null, onCard: false,
      back: null, backSaid: '', backSent: 0, backDirect: 0, taps: new Set(), tapped: 0,
    };
    // An input on JACK: `alsa_in` puts it on the graph, always on (3.4% of a core, no relay time),
    // and ffmpeg -f jack reads it back for the room under the same lease. `plughw:`, not `hw:` (hw
    // read 48 dB hot). No byte-order fix on this path; `via: "arecord"` restores it.
    // why: lessons/rig-board.md#on-jack
    const onJack = cfg.via === 'jack' && !!jack;
    const reader = `pos${cfg.name}`;
    const jackPort = `${cfg.name}:capture_${cfg.take}`;
    const send = (msg) => {
      if (s.ws?.readyState !== 1) return false;
      s.ws.send(format(msg, { from: s.from, seq: s.seq++ }));
      return true;
    };
    // `direct` tells a page whether to offer at all, so a board without the
    // library costs a page nothing rather than a three second wait.
    const shape = () => ({ name: boardName, id: boardId, input: cfg.name, audioChannels: 1, frameMs: 1000 * frame / rate,
                           direct: !!s.rtc });
    const alive = () => ({ type: 'board.alive', ...shape(), audio: s.proc ? cfg.name : null, frames: s.frames,
                           leaseLeftMs: s.proc ? Math.max(0, s.lease - now()) : 0 });
    const status = () => ({ ok: !!s.proc, source: cfg.name, room: s.room, device: cfg.device, via: onJack ? 'jack' : 'arecord',
                            ...(onJack ? { jack: { port: jackPort, bridge: s.onCard || !!s.bridge, by: s.onCard ? 'jackd' : s.bridge ? 'alsa_in' : null, bridgeStarts: s.bridgeStarts, reader: `${reader}:input_1`, fed: s.fed } } : {}),
                            frames: s.frames, midi: cfg.midi ? { port: cfg.midi.port, channels: cfg.midi.channels, out: s.notesOut, held: s.held.size, refused: s.refused,
                              back: { open: !!s.back, sent: s.backSent, direct: s.backDirect, taps: s.taps.size, tapped: s.tapped, ...(s.back ? s.back.limiter.counts() : {}) } } : null,
                            leaseLeftMs: s.proc ? Math.max(0, s.lease - now()) : 0,
                            direct: s.rtc ? s.rtc.status() : null,
                            ...(s.proc ? {} : { reason: 'nothing playing' }) });

    function sendPcm(int16) {
      if (s.ws?.readyState !== 1) return;
      const out = Buffer.allocUnsafe(12 + int16.byteLength);
      out.writeUInt32LE(s.aseq++, 0);
      out.writeDoubleLE(performance.now(), 4);
      Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength).copy(out, 12);
      s.ws.send(out);
      s.frames++;
    }

    // ── the JACK half: the bridge, always on, and the leased reader ─────────
    const quiet = (d) => String(d).split('\n').map((x) => x.trim())
      .filter((x) => x && !/^Cannot lock down \d+ byte memory area/.test(x)).join(' ');
    function startBridge() {
      if (!onJack || s.bridge || s.closed) return;
      Promise.resolve(jack.ensure?.()).then((j) => {
        if (s.bridge || s.closed) return;
        if (j && j.ok === false) {
          log(`${cfg.name}: no JACK server (${j.reason}), trying again in ${s.bridgeBackoff / 1000} s`);
          setTimer(startBridge, s.bridgeBackoff); s.bridgeBackoff = Math.min(s.bridgeBackoff * 2, 60_000);
          return;
        }
        // jackd owns this card: its own capture ports, nothing to bridge.
        // why: lessons/rig-board.md#on-card
        s.onCard = j?.card === cfg.name;
        if (s.onCard) { log(`${cfg.name}: ${cfg.device} is jackd's own card, ${jackPort} with no alsa_in`); return; }
        const dev = cfg.device.replace(/^hw:/, 'plughw:');
        const p = spawn('alsa_in', ['-j', cfg.name, '-d', dev, '-c', String(cfg.channels), '-r', String(rate),
          '-p', '256', '-n', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
        s.bridge = p; s.bridgeAt = now(); s.bridgeStarts++;
        log(`${cfg.name}: ${dev} onto JACK as ${cfg.name}:capture_1..${cfg.channels}`);
        p.stdout?.on('data', () => {});
        p.stderr?.on('data', (d) => { const t = quiet(d); if (t) log(`${cfg.name} alsa_in: ${t.slice(0, 200)}`); });
        p.on('exit', (code, sig) => {
          if (s.bridge === p) s.bridge = null;
          if (s.closed) return;
          // A bridge that ran a while is a fresh fault, not the same one again.
          if (now() - s.bridgeAt > 30_000) s.bridgeBackoff = 2000;
          log(`${cfg.name}: alsa_in exited (${sig ?? code}), so ${jackPort} is gone; again in ${s.bridgeBackoff / 1000} s`);
          setTimer(startBridge, s.bridgeBackoff); s.bridgeBackoff = Math.min(s.bridgeBackoff * 2, 60_000);
        });
      });
    }
    /** Feed the reader from the device, owning its input. Retried until both ports are up. */
    function feedReader(p, tries = 0) {
      if (s.proc !== p) return;
      const w = jack.wire?.({ v: 1, links: [{ from: jackPort, to: `${reader}:input_1` }], own: [`${reader}:input_1`] },
        `${cfg.name} into its room`);
      if (w?.ok) { s.fed = true; log(`${cfg.name}: ${jackPort} feeds ${reader}:input_1, read back`); return; }
      s.fed = false;
      if (tries < 40) { setTimer(() => feedReader(p, tries + 1), 200); return; }
      log(`${cfg.name}: ${jackPort} could not be patched into ${reader}:input_1 in 8 s${w?.reason ? `, ${w.reason}` : ''}`);
    }

    function startCapture() {
      if (s.proc) return;
      if (onJack) { startReader(); return; }
      // A short period: ALSA's default 6000-frame period made audio leave in 125 ms lumps.
      // why: lessons/rig-board.md#period
      const p = spawn('arecord', ['-D', cfg.device, '-f', 'S16_LE', '-r', String(rate),
        '-c', String(cfg.channels), '-t', 'raw', '-q',
        `--period-size=${periodFrames}`, `--buffer-size=${bufferFrames}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      // Read in half frames when the direct path wants 10 ms; the relay still gets 20 ms frames.
      // why: lessons/rig-board.md#half-frames
      const IN = UNIT * 2 * cfg.channels;
      let carry = Buffer.alloc(0), halves = [];
      const order = createByteOrder({ channels: cfg.channels, onChange: (swapped, s) =>
        log(`${cfg.name}: ${swapped ? 'the device is sending big endian, swapping its bytes' : 'the device is little endian again'} (high byte steps ${s.le} as sent, ${s.be} swapped)`) });
      p.stdout.on('data', (chunk) => {
        carry = carry.length ? Buffer.concat([carry, chunk]) : chunk;
        while (carry.length >= IN) {
          const all = order.fix(new Int16Array(carry.buffer.slice(carry.byteOffset, carry.byteOffset + IN)));
          const one = takeChannel(all, cfg.channels, cfg.take, UNIT);
          carry = carry.subarray(IN);
          s.rtc?.pcm(one);
          if (UNIT === frame) { sendPcm(one); continue; }
          halves.push(one);
          if (halves.length < frame / UNIT) continue;
          const whole = new Int16Array(frame);
          halves.forEach((h, i) => whole.set(h, i * UNIT));
          halves = [];
          sendPcm(whole);
        }
      });
      // arecord's stderr is the only clue when a device is busy or gone.
      p.stderr.on('data', (d) => log(`${cfg.name} arecord:`, String(d).trim()));
      p.on('exit', (code) => {
        log(`${cfg.name}: arecord exited ${code} after ${s.frames} frames`);
        if (s.proc === p) s.proc = null;
        send(alive());
      });
      s.proc = p; s.startedAt = now();
      log(`${cfg.name}: capturing ${cfg.device} channel ${cfg.take} of ${cfg.channels} into ${s.room}`);
    }

    // The leased half on JACK. Same frames, same pump, same relay and direct
    // path as `arecord`: one mono channel out of ffmpeg, so `takeChannel` is a
    // pass and the byte order fix is skipped (see the header of this block).
    function startReader() {
      startBridge();
      const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'jack', '-channels', '1', '-i', reader,
        '-f', 's16le', '-ar', String(rate), '-ac', '1', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
      const IN = UNIT * 2;
      let carry = Buffer.alloc(0), halves = [];
      p.stdout.on('data', (chunk) => {
        carry = carry.length ? Buffer.concat([carry, chunk]) : chunk;
        while (carry.length >= IN) {
          const one = new Int16Array(carry.buffer.slice(carry.byteOffset, carry.byteOffset + IN));
          carry = carry.subarray(IN);
          s.rtc?.pcm(one);
          if (UNIT === frame) { sendPcm(one); continue; }
          halves.push(one);
          if (halves.length < frame / UNIT) continue;
          const whole = new Int16Array(frame);
          halves.forEach((h, i) => whole.set(h, i * UNIT));
          halves = [];
          sendPcm(whole);
        }
      });
      p.stderr.on('data', (d) => { const t = quiet(d); if (t) log(`${cfg.name} ffmpeg:`, t.slice(0, 200)); });
      p.on('exit', (code) => {
        log(`${cfg.name}: the JACK reader exited ${code} after ${s.frames} frames`);
        if (s.proc === p) { s.proc = null; s.fed = null; }
        send(alive());
      });
      s.proc = p; s.startedAt = now(); s.fed = false;
      log(`${cfg.name}: reading ${jackPort} off JACK into ${s.room}`);
      setTimer(() => feedReader(p), 300);
    }

    function stopCapture(why) {
      if (!s.proc) return false;
      const p = s.proc; s.proc = null;
      try { p.kill('SIGTERM'); } catch { /* already gone */ }
      log(`${cfg.name}: stopped, ${why}`);
      send(alive());
      return true;
    }

    // The raw MIDI card is resolved by name every open: card numbers move.
    // why: lessons/rig-board.md#midi-dev
    function midiDev() {
      const card = fs.readlinkSync(`/proc/asound/${cfg.midi.port}`);   // 'card7'
      const n = /^card(\d+)$/.exec(card)?.[1];
      if (n == null) throw new Error(`/proc/asound/${cfg.midi.port} is ${card}`);
      return n;
    }
    function midiOpen() {
      if (s.midiFd !== null) return s.midiFd;
      const n = midiDev();
      // Non-blocking open: while a sequencer subscription exists the open waits and would freeze
      // the board.
      // Writes are non-blocking too (EAGAIN logged); the 4 KB buffer fits about 1,300 note offs.
      // why: lessons/rig-board.md#nonblock
      s.midiFd = fs.openSync(`/dev/snd/midiC${n}D0`, FS.O_WRONLY | FS.O_NONBLOCK);
      log(`${cfg.name}: notes go to /dev/snd/midiC${n}D0 (${cfg.midi.port})`);
      return s.midiFd;
    }
    function midiWrite(bytes) {
      try { fs.writeSync(midiOpen(), Buffer.from(bytes)); }
      catch (e) {
        log(`${cfg.name}: midi write failed, ${e.message}`);
        if (s.midiFd !== null) { try { fs.closeSync(s.midiFd); } catch {} s.midiFd = null; }
        return false;
      }
      const [st, a, b] = bytes, kind = st & 0xF0, key = `${st & 0x0F}:${a}`;
      if (kind === 0x90 && b > 0) s.held.add(key); else if (kind === 0x80 || kind === 0x90) s.held.delete(key);
      // Only CC 123 releases a channel's held notes, or a filter sweep would empty the set.
      // why: lessons/rig-board.md#cc123
      else if (kind === 0xB0 && a === 123) for (const k of [...s.held]) if (k.startsWith(`${st & 0x0F}:`)) s.held.delete(k);
      s.notesOut++;
      return true;
    }
    // The input is opened only while an answer is expected, before the request is written, and
    // polled
    // non-blocking every 10 ms; it is not held between requests.
    // why: lessons/rig-board.md#finish-dump
    function finishDump(d, body) {
      if (s.dump !== d) return;
      s.dump = null;
      if (d.fd !== null) { try { fs.closeSync(d.fd); } catch { /* gone */ } }
      d.reply(d.type, { ...d.extra, ...body });
    }
    // What one chunk off the instrument's input means to an open question.
    // True when the question is answered and closed.
    function feedDump(d, buf) {
      if (s.dump !== d) return true;
      d.seen += buf.length;
      for (const b of buf) {
        if (b >= 0xF8) d.realtime++;
        else if (d.head.length < 24) d.head.push(b.toString(16).padStart(2, '0'));
      }
      for (const m of d.catcher.feed(buf)) {
        if (d.match(m)) {
          log(`${cfg.name}: ${d.what} read back, ${now() - d.at} ms, ${m.length} bytes${d.type === 'midi.identity' ? `: ${m.map((b) => b.toString(16).padStart(2, '0')).join(' ')}` : ''}`);
          finishDump(d, { ok: true, bytes: m });
          return true;
        }
        d.other++;
        if (d.others.length < 3) d.others.push(m.slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join(' '));
      }
      return false;
    }
    function pollDump(d) {
      if (s.dump !== d) return;
      // While the macro listener holds the input it feeds every chunk to feedDump (a second open is
      // EBUSY).
      // why: lessons/rig-board.md#shared-input
      if (d.fd !== null) {
        const chunk = Buffer.alloc(1024);
        for (;;) {
          let n = 0;
          try { n = fs.readSync(d.fd, chunk, 0, chunk.length, null); }
          catch (e) {
            if (e.code === 'EAGAIN' || e.code === 'EWOULDBLOCK') break;
            log(`${cfg.name}: reading the patch failed, ${e.message}`);
            return finishDump(d, { ok: false, why: `the instrument input could not be read, ${e.code || e.message}` });
          }
          if (!n) break;
          if (feedDump(d, chunk.subarray(0, n))) return;
        }
      }
      if (now() >= d.until) {
        log(`${cfg.name}: no ${d.what} came back in ${DUMP_MS} ms (${d.seen} bytes heard, ${d.realtime} of them real time, ${d.other} other SysEx${d.others.length ? ` [${d.others.join('] [')}]` : ''}${d.head.length ? `, the rest began ${d.head.join(' ')}` : ''})`);
        return finishDump(d, { ok: false, why: `no ${d.short} came back from the instrument in ${DUMP_MS} ms` });
      }
      setTimer(() => pollDump(d), 10);
    }

    // Hand-turned macro knobs, read only under a lease (midi-back.mjs), polled every 20 ms; a busy
    // input
    // is said once and retried, never thrown.
    // why: lessons/rig-board.md#macro-back
    const BACK_POLL_MS = 20;
    // While something on the board reads the instrument's out (`tap`), polled every 5 ms.
    // why: lessons/rig-board-io.md#tap
    const TAP_POLL_MS = 5;
    const leased = () => !leaseExpired(s.lease, now());
    function backOpen() {
      if (s.back || !cfg.midi || !fs?.readSync) return;
      let fd;
      try { fd = fs.openSync(`/dev/snd/midiC${midiDev()}D0`, FS.O_RDONLY | FS.O_NONBLOCK); }
      catch (e) {
        const why = e.code || e.message;
        if (s.backSaid !== why) log(`${cfg.name}: the instrument input could not be opened for its macro knobs, ${why}`);
        s.backSaid = why;
        return;
      }
      s.backSaid = '';
      const limiter = createBackLimiter({ gapMs: GAP_MS, now, setTimer,
        emit: ({ ch, cc, v }) => {
          if (send({ type: 'midi.cc', input: cfg.name, ch, cc, v })) s.backSent++;
          // On every direct link too, marked, so a page can drop the relay's copy.
          // why: lessons/rig-board.md#cc-direct
          if (s.rtc?.broadcast({ type: 'midi.cc', input: cfg.name, ch, cc, v, path: 'direct' })) s.backDirect++;
        } });
      s.back = { fd, parser: createMidiParser(), limiter, timer: null };
      log(`${cfg.name}: reading the instrument's macro knobs (CC 80 to 87) off /dev/snd/midiC${midiDev()}D0`);
      const b = s.back;
      const tick = () => {
        if (s.back !== b) return;
        pollBack(b);
        if (s.back === b) b.timer = setTimer(tick, s.taps.size ? TAP_POLL_MS : BACK_POLL_MS);
      };
      tick();
    }
    function pollBack(b) {
      const chunk = Buffer.alloc(1024);
      for (let i = 0; i < 64; i++) {
        let n = 0;
        try { n = fs.readSync(b.fd, chunk, 0, chunk.length, null); }
        catch (e) {
          if (e.code === 'EAGAIN' || e.code === 'EWOULDBLOCK') return;
          log(`${cfg.name}: reading the instrument's macro knobs failed, ${e.code || e.message}`);
          backClose('the input failed');
          return;
        }
        if (!n) return;
        const buf = chunk.subarray(0, n);
        if (s.dump && s.dump.fd === null) feedDump(s.dump, buf);
        if (s.taps.size) {
          const readAt = performance.now();
          s.tapped += n;
          for (const fn of s.taps) { try { fn(buf, readAt); } catch (e) { log(`${cfg.name}: a reader of the instrument's out threw, ${e.message}`); } }
        }
        // The macros go to the room only under a page's lease, not because the board itself reads.
        const toRoom = leased();
        for (const m of b.parser.feed(buf)) {
          const v = backVerdict(m);
          if (v && toRoom) b.limiter.push(v);
        }
      }
    }
    function backClose(why) {
      const b = s.back;
      if (!b) return;
      s.back = null;
      if (b.timer) clearTimeout(b.timer);
      b.limiter.close();
      try { fs.closeSync(b.fd); } catch { /* gone */ }
      log(`${cfg.name}: stopped reading the macro knobs, ${why}`);
    }

    // `want` names what is listened for: the reply type, how to recognise it,
    // and the words a log line uses. One question open at a time, of either kind.
    const wantPatch = (loc) => ({ type: 'midi.patch', extra: { synth: loc + 1 }, what: `patch for synth ${loc + 1}`, short: 'patch', match: (m) => isPatchReply(m, loc) });
    const WANT_IDENTITY = { type: 'midi.identity', extra: {}, what: 'identity', short: 'identity', match: isIdentityReply };
    function askBack(bytes, want, reply) {
      const { type, extra } = want;
      if (s.dump) return reply(type, { ok: false, ...extra, why: `the ${s.dump.what} is already being read, one question at a time` });
      // The macro listener already holds the input open and triggered, so the
      // question rides on its reads (see `pollDump`) and needs no read first.
      if (s.back) {
        const d = { ...want, fd: null, reply, others: [], at: now(), until: now() + DUMP_MS, catcher: createSysexCatcher(), seen: 0, other: 0, realtime: 0, head: [] };
        s.dump = d;
        if (!midiWrite(bytes)) return finishDump(d, { ok: false, why: 'the instrument port could not be written' });
        setTimer(() => pollDump(d), 10);
        return undefined;
      }
      let fd;
      try { fd = fs.openSync(`/dev/snd/midiC${midiDev()}D0`, FS.O_RDONLY | FS.O_NONBLOCK); }
      catch (e) {
        log(`${cfg.name}: the instrument input could not be opened, ${e.message}`);
        return reply(type, { ok: false, ...extra, why: `the instrument input could not be opened, ${e.code || e.message}` });
      }
      const d = { ...want, fd, reply, others: [], at: now(), until: now() + DUMP_MS, catcher: createSysexCatcher(), seen: 0, other: 0, realtime: 0, head: [] };
      s.dump = d;
      // Read once before writing the request: snd-usb-audio drops input until the first read
      // triggers it,
      // and the Circuit's reply comes faster than the first 10 ms poll.
      // why: lessons/rig-board.md#pre-read
      const pre = Buffer.alloc(1024);
      for (let i = 0; i < 64; i++) {
        let n = 0;
        try { n = fs.readSync(fd, pre, 0, pre.length, null); }
        catch (e) {
          if (e.code === 'EAGAIN' || e.code === 'EWOULDBLOCK') break;
          log(`${cfg.name}: the instrument input could not be read, ${e.message}`);
          return finishDump(d, { ok: false, why: `the instrument input could not be read, ${e.code || e.message}` });
        }
        if (!n) break;
      }
      if (!midiWrite(bytes)) return finishDump(d, { ok: false, why: 'the instrument port could not be written' });
      setTimer(() => pollDump(d), 10);
      return undefined;
    }

    /** Every note this board started and nobody ended, ended. */
    function midiPanic(why) {
      if (!cfg.midi || !s.held.size) return 0;
      const n = s.held.size;
      for (const k of [...s.held]) {
        const [ch, note] = k.split(':').map(Number);
        midiWrite([0x80 | ch, note, 0]);
      }
      log(`${cfg.name}: released ${n} held note${n === 1 ? '' : 's'}, ${why}`);
      return n;
    }

    // The camera on a direct link only over `ctl`: the key is checked against BOARD_CAM_KEY and the
    // viewer
    // must be in `<room>-cam`. Over the tokenless relay it is refused.
    // why: lessons/rig-board.md#cam-direct
    const camId = (peerId) => `${cfg.name}:${peerId}`;
    // The ask can overtake its channel, so a missing `cam` channel is waited for (25 ms steps, 0.5
    // s).
    // why: lessons/rig-board.md#cam-wait
    function camDirect(msg, reply, peerId, waited = 0) {
      if (!peerId) return reply('cam.direct', { ok: false, why: 'the camera goes direct only over a direct link, never through this room' });
      if (!camera?.attachDirect) return reply('cam.direct', { ok: false, why: 'this board has no camera room' });
      const dc = s.rtc?.peers.get(peerId)?.ch?.cam;
      if (!dc && waited < 500 && s.rtc?.peers.has(peerId)) { setTimer(() => camDirect(msg, reply, peerId, waited + 25), 25); return undefined; }
      if (!dc) return reply('cam.direct', { ok: false, why: 'open the cam channel first', retry: true });
      const r = camera.attachDirect({
        id: camId(peerId), viewer: msg.viewer, key: msg.key,
        sink: {
          open: () => { try { return dc.isOpen(); } catch { return false; } },
          backlog: () => { try { return dc.bufferedAmount(); } catch { return 0; } },
          send: (buf) => dc.sendMessageBinary(buf),
          text: (m) => dc.sendMessage(JSON.stringify(m)),
        },
      });
      return reply('cam.direct', r);
    }

    // `answer` is how a reply leaves: the relay room by default, the peer's own
    // `ctl` channel when the message came over one, and then `peerId` says which.
    function handle(msg, answer = null, peerId = null) {
      const reply = answer || ((type, body) => send({ type, re: msg.id, ...body }));
      if (msg.type === 'cam.direct') return camDirect(msg, reply, answer ? peerId : null);
      if (msg.type === 'cam.relay') { if (answer && peerId) camera?.detachDirect?.(camId(peerId), 'the page asked for the relay'); return reply('cam.relay', { ok: true }); }
      if (msg.type === 'input.want') {
        s.lease = now() + leaseMs;
        const was = !!s.proc;
        startCapture();
        backOpen();
        return reply('input.wanted', { ...status(), started: !was });
      }
      if (msg.type === 'input.stop') {
        s.lease = 0;
        if (!s.taps.size) backClose('asked');
        return reply('input.stopped', { ok: stopCapture('asked'), source: cfg.name });
      }
      if (msg.type === 'audio.status') return reply('audio.started', status());
      if (msg.type === 'midi.send') {
        if (!cfg.midi || !fs) return reply('midi.refused', { why: `${cfg.name} has no MIDI port configured` });
        const v = midiVerdict(msg.bytes, cfg.midi.channels);
        if (!v.ok) { s.refused++; return reply('midi.refused', { why: v.why }); }
        if (v.dump != null) return askBack(msg.bytes, wantPatch(v.dump), reply);
        if (v.identity) return askBack(msg.bytes, WANT_IDENTITY, reply);
        if (!midiWrite(msg.bytes)) return reply('midi.refused', { why: 'the instrument port could not be written' });
        return undefined;   // no reply per note: a keyboard is not a request/response
      }
      if (msg.type === 'midi.panic') return reply('midi.released', { n: midiPanic('asked') });
      return undefined;
    }

    function connect() {
      if (s.closed) return;
      const ws = new WebSocket(`${relay}/room/${s.room}/ws`);
      ws.binaryType = 'arraybuffer';
      s.ws = ws;
      ws.onopen = () => {
        s.backoff = 500; s.lastHeard = now();
        log(`${cfg.name}: joined ${s.room}`);
        send({ type: 'board.hello', ...shape() });
      };
      ws.onmessage = (e) => {
        s.lastHeard = now();
        if (typeof e.data !== 'string') return;
        const { kind, msg } = parse(e.data);
        if (kind !== 'json' || msg.from === s.from) return;
        // Signalling for the direct path arrives here and ONLY here: a `ctl`
        // channel cannot open another peer.
        if (msg.type === 'rtc.offer') {
          if (!s.rtc) return send({ type: 'rtc.refused', peer: msg.peer, why: 'this board has no direct path, use the relay' });
          try { s.rtc.offer(msg); } catch (err) { log(`${cfg.name}: offer threw`, err.message); }
          return;
        }
        if (msg.type === 'rtc.candidate') { try { s.rtc?.candidate(msg); } catch {} return; }
        try { handle(msg); } catch (err) { log(`${cfg.name}: handler threw`, err.message); }
      };
      ws.onclose = () => {
        if (s.ws === ws) s.ws = null;
        if (s.closed) return;
        log(`${cfg.name}: socket closed, retrying in ${s.backoff} ms`);
        setTimeout(connect, s.backoff);
        s.backoff = Math.min(s.backoff * 2, 30_000);
      };
      ws.onerror = () => {};
    }

    // The beat: proof of life for the page, the lease sweep, and the same
    // self-echo watchdog the main socket uses, because a dead socket does not
    // always close.
    function beat() {
      if (s.proc && leaseExpired(s.lease, now())) { stopCapture('nobody renewed the lease'); midiPanic('the lease ran out'); }
      if (s.back && leaseExpired(s.lease, now()) && !s.taps.size) backClose('nobody renewed the lease');
      else if (!s.back && (!leaseExpired(s.lease, now()) || s.taps.size)) backOpen();
      s.rtc?.sweep();
      if (s.ws?.readyState === 1 && now() - s.lastHeard > 3 * beatMs + 1000) {
        log(`${cfg.name}: no echo, reconnecting`);
        try { s.ws.close(); } catch { /* the point */ }
        return;
      }
      send(alive());
    }

    if (PeerConnection) {
      s.rtc = createRtc({
        PeerConnection, signal: send, handle, now, rate, unitMs: 1000 * UNIT / rate,
        log: (...a) => log(`${cfg.name}:`, ...a),
        channels: ['cam'],
        onChannelClosed: (p, label) => { if (label === 'cam') camera?.detachDirect?.(camId(p.id), 'its cam channel closed'); },
        // A direct listener that goes away lets go of the notes IT started.
        // Everybody else's stay, which is why this is not `midiPanic`.
        onGone: (p) => {
          camera?.detachDirect?.(camId(p.id), 'its direct link closed');
          if (!cfg.midi || !fs) return;
          for (const k of p.held) {
            if (!s.held.has(k)) continue;
            const [ch, note] = k.split(':').map(Number);
            midiWrite([0x80 | ch, note, 0]);
          }
        },
      });
    }

    /**
     * Every chunk off the instrument's MIDI out, raw (clock and all), to `fn(bytes, readAt)` until the
     * returned function is called. Shares the one open of the input with the macros and the dumps.
     * why: lessons/rig-board-io.md#tap
     */
    function tap(fn) {
      if (!cfg.midi) return null;
      s.taps.add(fn);
      backOpen();
      return () => {
        if (!s.taps.delete(fn)) return;
        if (!s.taps.size && !leased()) backClose('nothing on the board reads it');
      };
    }

    return {
      s, connect, beat, handle, status, stopCapture, startBridge, onJack, jackPort, tap,
      reading: () => !!s.back,
      close() {
        s.closed = true; midiPanic('shutting down'); stopCapture('shutting down'); backClose('shutting down'); s.rtc?.close();
        if (s.bridge) { try { s.bridge.kill('SIGTERM'); } catch { /* gone */ } s.bridge = null; }
        if (s.dump) { if (s.dump.fd !== null) { try { fs.closeSync(s.dump.fd); } catch {} } s.dump = null; }
        if (s.midiFd !== null) { try { fs.closeSync(s.midiFd); } catch {} s.midiFd = null; }
        try { s.ws?.close(); } catch {}
      },
    };
  }

  for (const cfg of inputs.values()) live.set(cfg.name, one(cfg));
  let timer = null;

  return {
    start() {
      for (const x of live.values()) { x.connect(); x.startBridge(); }
      timer = setInterval(() => { for (const x of live.values()) x.beat(); }, beatMs);
      timer.unref?.();
    },
    status: () => Object.fromEntries([...live].map(([k, x]) => [k, x.status()])),
    get: (name) => live.get(name),
    close() { clearInterval(timer); for (const x of live.values()) x.close(); },
  };
}
