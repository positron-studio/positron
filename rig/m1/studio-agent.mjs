// The studio Mac on the patchbay: site `m1` in room `m1-1`, its apps as nodes (macGraph). Speaks the board's
// wire, so a page opens it with createBoard: notes into Ableton Live over CoreMIDI (midisend), Live's sound back
// through a Core Audio process tap (audiotap) only while a page asks, transport and tempo over AbletonOSC. Opening
// an app or loading an instrument needs the owner's key. Replaces live-agent.mjs.
// node rig/m1/studio-agent.mjs [--relay wss://...] [--room m1-1] [--tap <audiotap>] [--midisend <midisend>]
// why: lessons/rig-m1.md#studio-agent

import { spawn, execFile } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import dgram from 'node:dgram';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { format, parse, randomId } from '../../demo/shell/wire.mjs';
import { macGraph, MAC_ROOM } from '../../demo/shell/graph-registry.mjs';
import { createMainDirect } from '../board/rtc.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const RELAY = arg('relay', 'wss://ws.positron.studio');
const ROOM = arg('room', MAC_ROOM);
// The tap's capture grant is keyed to its path and hash: it stays where it was granted, never moved or rebuilt casually.
const TAP = arg('tap', join(homedir(), 'positron-rack', 'bin', 'audiotap'));
// midisend stamps notes with host time (rig/m1/midisend.c), built on the Mac into ~/positron-studio/bin.
const MIDISEND = arg('midisend', join(homedir(), 'positron-studio', 'bin', 'midisend'));
const KEY_FILE = join(homedir(), '.positron', 'studio-key');
const RATE = 48000, FRAME = RATE / 50, FRAME_MS = 20, CH = 1;
// Sound stops when no page has said anything for this long: nobody listening costs 50 relay messages a second.
const QUIET_MS = 20_000;
const APPS = { live: { proc: 'Live', open: 'Ableton Live 11 Standard' }, obs: { proc: 'OBS', open: 'OBS' } };

const FROM = `m1-${randomId(6)}`, ID = randomId(8), SINCE = Date.now();
let ws = null, seq = 0, aseq = 0, sent = 0, lastHeard = Date.now(), backoff = 500;
let midi = null, tap = null, running = { live: false, obs: false };
const held = new Set();
let ranges = new Map();   // Live parameter index -> { min, max }, from the last live.params
const clientSeen = new Map();   // from -> last message time
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const send = (m) => { if (ws?.readyState === 1) { ws.send(format(m, { from: FROM, seq: seq++ })); return true; } return false; };

// ── the key ────────────────────────────────────────────────────────────────
// A command that starts something carries `sig` = HMAC-SHA256(key, `${type}\n${t}\n${what}`) in hex and `t` within
// 30 s. The key is a file on this Mac and in the owner's browser, never in page source.
const key = (() => { try { return readFileSync(KEY_FILE, 'utf8').trim(); } catch { return ''; } })();
function signedOk(m, what) {
  if (!key) return 'this Mac has no studio key';
  if (!m.sig) return 'not signed with the studio key';
  if (!Number.isFinite(m.t) || Math.abs(Date.now() - m.t) > 30_000) return 'the signature is too old';
  const want = createHmac('sha256', key).update(`${m.type}\n${m.t}\n${what}`).digest();
  let got; try { got = Buffer.from(String(m.sig || ''), 'hex'); } catch { got = Buffer.alloc(0); }
  return got.length === want.length && timingSafeEqual(got, want) ? '' : 'not signed with the studio key';
}

// ── the apps ───────────────────────────────────────────────────────────────
const isRunning = (proc) => new Promise((ok) => execFile('/usr/bin/pgrep', ['-x', proc], (e) => ok(!e)));
async function look() {
  const was = JSON.stringify(running);
  running = { live: await isRunning(APPS.live.proc), obs: await isRunning(APPS.obs.proc) };
  if (JSON.stringify(running) !== was) { log('apps:', JSON.stringify(running)); send(alive()); }
}
const graph = () => macGraph({ room: ROOM, live: running.live, obs: running.obs, frameMs: FRAME_MS });

// ── notes into Live ────────────────────────────────────────────────────────
function startMidi() {
  if (midi) return midi;
  midi = spawn(MIDISEND, ['IAC'], { stdio: ['pipe', 'ignore', 'pipe'] });
  midi.stderr.on('data', (d) => log('midisend:', String(d).trim().split('\n')[0]));
  midi.on('exit', (c) => { log(`midisend exited (${c})`); midi = null; });
  return midi;
}
const midiLine = (line) => { try { startMidi().stdin.write(line + '\n'); return true; } catch { return false; } };
const byte = (v, lo = 0) => Math.max(lo, Math.min(127, Math.round(Number(v) || 0)));

// ── Live's sound, only while asked ──────────────────────────────────────────
function startTap() {
  if (tap) return;
  tap = spawn(TAP, ['Live'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let carry = Buffer.alloc(0);
  tap.stdout.on('data', (chunk) => {
    carry = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    const per = FRAME * 2 * 4;          // the tap hands interleaved stereo float32
    while (carry.length >= per) {
      const block = carry.subarray(0, per);
      carry = carry.subarray(per);
      const out = new Int16Array(FRAME * CH);
      for (let i = 0; i < FRAME; i++) {
        let v = block.readFloatLE(i * 2 * 4);
        v = v > 1 ? 1 : v < -1 ? -1 : v;   // clip before int16, or full scale wraps to noise
        out[i] = (v * 32767) | 0;
      }
      sendPcm(out);
    }
  });
  tap.stderr.on('data', (d) => {
    const t = String(d).trim();
    if (/refus|denied|not permitted/i.test(t)) log('tap refused: run it once in a terminal and click Allow');
  });
  tap.on('exit', (c) => { log(`audiotap exited (${c})`); tap = null; });
  log('sound on');
}
function stopTap(why) {
  if (!tap) return;
  try { tap.kill('SIGTERM'); } catch { /* gone */ }
  tap = null;
  log(`sound off: ${why}`);
}
function sendPcm(int16) {
  mainDirect?.frame(int16);
  if (ws?.readyState !== 1) return;
  const out = Buffer.allocUnsafe(12 + int16.byteLength);
  out.writeUInt32LE(aseq++ >>> 0, 0);
  out.writeDoubleLE(performance.now(), 4);
  Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength).copy(out, 12);
  ws.send(out);
  sent++;
}

// ── Live's transport over AbletonOSC (UDP on this machine; every ask retries) ──
const osc = dgram.createSocket({ type: 'udp4', reuseAddr: true });
let oscUp = false;
osc.on('error', (e) => log('osc:', e.message));
osc.bind(11001, () => { oscUp = true; });
const ostr = (s) => { const b = Buffer.from(s + '\0', 'utf8'); return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]); };
function oscEncode(addr, args = []) {
  let tags = ',', body = [];
  for (const a of args) {
    if (Number.isInteger(a)) { tags += 'i'; const b = Buffer.alloc(4); b.writeInt32BE(a); body.push(b); }
    else if (typeof a === 'number') { tags += 'f'; const b = Buffer.alloc(4); b.writeFloatBE(a); body.push(b); }
    else { tags += 's'; body.push(ostr(String(a))); }
  }
  return Buffer.concat([ostr(addr), ostr(tags), ...body]);
}
function oscDecode(buf) {
  let o = 0;
  const rs = () => { const e = buf.indexOf(0, o); const s = buf.toString('utf8', o, e); o = Math.ceil((e + 1) / 4) * 4; return s; };
  const addr = rs(), tags = rs(), out = [];
  for (const t of tags.slice(1)) {
    if (t === 'i') { out.push(buf.readInt32BE(o)); o += 4; } else if (t === 'f') { out.push(buf.readFloatBE(o)); o += 4; }
    else if (t === 's') out.push(rs()); else if (t === 'T') out.push(true); else if (t === 'F') out.push(false); else if (t === 'N') out.push(null);
  }
  return { addr, args: out };
}
function ask(addr, args = [], tries = 3) {
  return new Promise((resolve) => {
    if (!oscUp) return resolve(null);
    let done = false, n = 0;
    const on = (m) => { const d = oscDecode(m); if (!done && d.addr === addr) { done = true; osc.off('message', on); resolve(d.args); } };
    osc.on('message', on);
    const go = () => { if (done) return; if (n++ >= tries) { osc.off('message', on); return resolve(null); } osc.send(oscEncode(addr, args), 11000, '127.0.0.1'); setTimeout(go, 400); };
    go();
  });
}
const tell = (addr, args = []) => { if (oscUp) osc.send(oscEncode(addr, args), 11000, '127.0.0.1'); };
async function liveState() {
  if (!running.live) return { ok: false, why: 'Ableton Live is not open' };
  const [tempo, playing, metro, devices] = await Promise.all([ask('/live/song/get/tempo'), ask('/live/song/get/is_playing'),
    ask('/live/song/get/metronome'), ask('/live/track/get/devices/name', [0])]);
  if (!tempo) return { ok: false, why: 'Live does not answer on AbletonOSC' };
  // The instrument is track 1's first device, the one notes from IAC reach.
  return { ok: true, tempo: +Number(tempo.at(-1)).toFixed(2), playing: !!playing?.at(-1), metronome: !!metro?.at(-1),
    instrument: devices?.[1] ?? null };
}

// ── the wire ───────────────────────────────────────────────────────────────
const hello = () => ({ type: 'board.hello', name: 'studio Mac', id: ID, since: SINCE, audioChannels: CH, frameMs: FRAME_MS,
  instruments: { live: running.live }, direct: !!mainDirect?.direct, graph: graph() });
const alive = () => ({ type: 'board.alive', name: 'studio Mac', id: ID, upSec: Math.round((Date.now() - SINCE) / 1000),
  audio: tap ? 'live' : null, frames: sent, apps: running, graph: graph() });

async function handle(m, reply) {
  switch (m.type) {
    case 'note.on':
      if (!Number.isInteger(m.note)) return;
      held.add(m.note); midiLine(`on ${byte(m.note)} ${byte(m.vel ?? 100, 1)}`); return;
    case 'note.off':
      held.delete(m.note); midiLine(`off ${byte(m.note)}`); return;
    case 'note.panic':
      held.clear(); midiLine('panic 0'); return reply('note.panic', { ok: true });
    case 'cc':
      midiLine(`cc ${byte(m.ctrl)} ${byte(m.value)}`); return;
    case 'audio.start':
      if (!running.live) return reply('audio.started', { ok: false, reason: 'Ableton Live is not open' });
      startTap(); return reply('audio.started', { ok: true, source: 'live' });
    case 'audio.stop':
      stopTap('a page asked'); return reply('audio.stopped', { ok: true });
    case 'audio.status':
      return reply('audio.started', tap ? { ok: true, source: 'live' } : { ok: false, reason: 'nothing playing' });
    case 'live.get':
      return reply('live.state', await liveState());
    case 'live.set': {
      if (!running.live) return reply('live.state', { ok: false, why: 'Ableton Live is not open' });
      if (m.play === true) tell('/live/song/start_playing');
      if (m.play === false) tell('/live/song/stop_playing');
      if (Number.isFinite(m.tempo)) tell('/live/song/set/tempo', [Math.max(20, Math.min(999, Number(m.tempo)))]);
      if (typeof m.metronome === 'boolean') tell('/live/song/set/metronome', [m.metronome ? 1 : 0]);
      return reply('live.state', await liveState());
    }
    // The instrument's own parameters (track 1, device 1): names, ranges and values, and one set by index.
    case 'live.params': {
      if (!running.live) return reply('live.params', { ok: false, why: 'Ableton Live is not open' });
      const [names, mins, maxs, vals] = await Promise.all(['name', 'min', 'max', 'value']
        .map((k) => ask(`/live/device/get/parameters/${k}`, [0, 0])));
      if (!names) return reply('live.params', { ok: false, why: 'Live did not answer' });
      const list = names.slice(2).map((name, i) => ({ i, name, min: mins?.[i + 2], max: maxs?.[i + 2], value: vals?.[i + 2] }));
      ranges = new Map(list.map((x) => [x.i, x]));
      return reply('live.params', { ok: true, device: (await ask('/live/track/get/devices/name', [0]))?.[1] ?? null, params: list });
    }
    // `set: [[index, 0..127], ...]` from a page's send gate, mapped onto each parameter's range as live.params read it.
    case 'live.param': {
      if (!running.live || !Array.isArray(m.set)) return;
      for (const [i, v] of m.set.slice(0, 16)) {
        const r = ranges.get(i);
        if (!r || !Number.isFinite(v) || !Number.isFinite(r.min) || !Number.isFinite(r.max)) continue;
        tell('/live/device/set/parameter/value', [0, 0, i, r.min + (Math.max(0, Math.min(127, v)) / 127) * (r.max - r.min)]);
      }
      return;
    }
    case 'live.instrument': {
      const name = String(m.name || '').slice(0, 60);
      const no = signedOk(m, name);
      if (no) return reply('live.instrument', { ok: false, why: no });
      // An instrument on the track, then the track listening to IAC Bus 1, armed, monitoring In: a track with no
      // device or no input makes no sound however well the MIDI arrives. The setters do not reply, so read back.
      const track = Number.isInteger(m.track) ? m.track : 0;
      ranges = new Map();
      const r = await ask('/live/browser/load', [track, name], 2);
      if (!r) return reply('live.instrument', { ok: false, why: 'Live did not answer the load' });
      tell('/live/track/set/input_routing_type', [track, 'IAC Driver (Bus 1)']);
      tell('/live/track/set/arm', [track, 1]);
      tell('/live/track/set/current_monitoring_state', [track, 0]);
      await new Promise((ok) => setTimeout(ok, 300));
      const [input, armed, devices] = await Promise.all([ask('/live/track/get/input_routing_type', [track]),
        ask('/live/track/get/arm', [track]), ask('/live/track/get/devices/name', [track])]);
      return reply('live.instrument', { ok: true, name, track, input: input?.at(-1) ?? null, armed: !!armed?.at(-1), devices: devices?.slice(1) ?? [] });
    }
    case 'app.open': {
      const app = APPS[m.app];
      if (!app) return reply('app.open', { ok: false, why: `no app called ${m.app}` });
      const no = signedOk(m, m.app);
      if (no) return reply('app.open', { ok: false, app: m.app, why: no });
      execFile('/usr/bin/open', ['-a', app.open], (e) => { if (e) log(`open ${app.open}:`, e.message); });
      return reply('app.open', { ok: true, app: m.app });
    }
  }
}

function connect() {
  ws = new WebSocket(`${RELAY}/room/${ROOM}/ws`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { backoff = 500; lastHeard = Date.now(); log(`joined ${ROOM} as ${FROM}`); send(hello()); };
  ws.onmessage = (e) => {
    lastHeard = Date.now();
    const got = parse(e.data);
    if (got.kind !== 'json' || !got.msg) return;
    const m = got.msg;
    if (m.from === FROM) return;
    if (typeof m.from === 'string') clientSeen.set(m.from, Date.now());
    // The direct path's offers and candidates, answered or refused out loud (rig/board/rtc.mjs).
    if (mainDirect?.signalling(m)) return;
    const reply = (type, body) => send({ type, re: m.id, ...body });
    Promise.resolve().then(() => handle(m, reply)).catch((err) => { log('handler threw:', err.message); send({ type: 'board.error', re: m.id, error: err.message }); });
  };
  ws.onclose = (e) => { log(`closed ${e.code}, back in ${backoff} ms`); stopTap('the socket closed'); setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30_000); };
  ws.onerror = () => {};
}

// The heartbeat with the graph; the quiet sweep stops the sound nobody hears.
setInterval(() => {
  const last = Math.max(0, ...clientSeen.values());
  mainDirect?.sweep();
  // A direct peer's pings never reach handle(), so an open peer counts as somebody listening.
  if (tap && !mainDirect?.size && Date.now() - last > QUIET_MS) { stopTap('no page has spoken for 20 s'); if (held.size) { held.clear(); midiLine('panic 0'); } }
  send(alive());
}, 5000);
// The relay echoes every message: three missing heartbeats mean a dead socket, whatever readyState says.
setInterval(() => { if (ws?.readyState === 1 && Date.now() - lastHeard > 16_000) { log('no echo in 16 s, reconnecting'); try { ws.close(); } catch { /* gone */ } } }, 4000);
setInterval(look, 5000);

process.on('SIGTERM', () => { midiLine('panic 0'); stopTap('stopping'); setTimeout(() => process.exit(0), 150); });
process.on('SIGINT', () => { midiLine('panic 0'); stopTap('stopping'); setTimeout(() => process.exit(0), 150); });
// The direct path, as the Pi's: node-datachannel when it is installed, the relay only without it. Notes and asks over
// `ctl` go through the same handle(); Live's sound goes out on `pcm` in half-relay frames.
// why: lessons/rig-m1.md#studio-direct
let PeerConnection = null;
try { PeerConnection = (await import('node-datachannel')).default.PeerConnection; } catch (e) { log('no direct path:', e.code || e.message); }
const mainDirect = createMainDirect({
  PeerConnection, signal: send, frame: FRAME, rate: RATE, log: (...a) => log('direct:', ...a),
  handle: (m, reply, peer) => {
    const from = typeof m.from === 'string' ? m.from : `rtc-${peer}`;
    clientSeen.set(from, Date.now());
    return handle({ ...m, from }, reply);
  },
});
log(`tap ${TAP}, midisend ${MIDISEND}, key ${key ? 'present' : 'missing'}, direct ${mainDirect.direct ? 'yes' : 'no'}`);
await look();
connect();
