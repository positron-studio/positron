// The board as a service: it dials out to the relay (no listening port, no browser) and answers
// anyone in its room. node board.mjs --room studio-1 [--dry plan only] [--once].
// The envelope is demo/shell/wire.mjs, imported so both ends share one shape.
// why: lessons/rig-board.md#header
import { format, parse, randomId, RELAY_BASE, LIMITS } from '../../demo/shell/wire.mjs';
import { listPorts, addressable, plan, apply, clearAll, backend } from './alsa.mjs';
import { createSynth, createMoogSynth, MOOG_PATCHES, alsaNotes, FRAME, RATE } from './synth.mjs';
import { startJackSynth, jackSynthAvailable, JACK_SYNTHS,
         pappusFx, pappusAvailable, pappusPanic, stopPappus, sourceFeed,
         jackGraph, jackChain, jackRebuild, ensureJackd, setJackCard, wire as jackWire, setBayRows, getBayRows,
         setCaptureUnit,
       } from './jacksynth.mjs';
import { startScSampler, samplerAvailable, startPlan, stopPlan, isForSampler, SETS as SAMPLER_SETS } from './scsampler.mjs';
import { PATCHES as PLAITS_PATCHES } from '../../demo/shell/plaits-params.mjs';
import { createCollideService, collideAvailable } from './scollide.mjs';
import { createPlaitsService, plaitsAvailable, PLAITS_PARAMS } from './plaits.mjs';
import { captureHolders } from './jacksynth.mjs';
import { openPappus, CHARACTER_NAMES } from './pappus.mjs';
import { startVideo, videoAvailable, sweepStrayEncoders, V3DPIPE } from './video.mjs';
import { createCameraRoom, framePieces, findCamera } from './camera.mjs';
import { createHdmi } from './hdmi.mjs';
import { parseInputs, createInputs } from './inputs.mjs';
import { createOutputs, outputFacts } from './outputs.mjs';
import { createMainDirect } from './rtc.mjs';
import { helloMsg, aliveMsg, graphOf } from './beat.mjs';
import { jackRows, PWM_PORTS } from '../../demo/shell/graph-registry.mjs';
import { listJack, plan as jackPlan, apply as jackApply, canonical as jackCanonical, diff as jackDiff } from './jack.mjs';
import { openPanel } from './panel.mjs';
import { createSequencerService } from './sequencer.mjs';
import { createKeyboardService, rawMidiReader } from './keyboard.mjs';
import { createCircuitDrumsService } from './circuit-drums.mjs';
import { DRUM_MAPS } from '../../demo/shell/drum-maps.mjs';
import { createScreenCamera } from './screen-camera.mjs';
import { createStop, createHold, checkLines, HOLD_MS } from './stop.mjs';
import { spawn, execFileSync } from 'node:child_process';
import * as fsMod from 'node:fs';

const arg = (k, dflt) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const flag = (k) => process.argv.includes(`--${k}`);

const ROOM = arg('room', 'board-dev');
const NAME = arg('name', process.env.BOARD_NAME || 'positron-board');
// The one name that is this board, minted once by setup.sh into /etc/default/positron-board.
// `hostname`, `from` and the room cannot tell two boards apart. `unset` if never provisioned.
// why: lessons/rig-board.md#board-id
const BOARD_ID = arg('id', process.env.BOARD_ID || null);
// This board's network, as bay.mjs reads `net`; unset by default, since a guess could pick a
// transport two buildings cannot open.
// why: lessons/rig-board.md#net
const NET = arg('net', process.env.BOARD_NET || null);
// This board's patchbay site, the first part of every port id: `pi-1` by default, `pi-2` for a
// second.
// Not the room.
// why: lessons/rig-board.md#site
const SITE = arg('site', process.env.BOARD_SITE || null);
const DRY = flag('dry');
const ONCE = flag('once');
const AUDIO_DEV = arg('audio', process.env.BOARD_AUDIO || 'default');
// A `hw:` device opens at its own channel count or not at all (the Fast Track Pro is stereo only),
// so
// it opens at BOARD_AUDIO_CHANNELS and keeps one, BOARD_AUDIO_TAKE (1-based); no downmix of noise.
// why: lessons/rig-board.md#audio-ch
const AUDIO_CH = Number(arg('audio-channels', process.env.BOARD_AUDIO_CHANNELS || 1));
const AUDIO_TAKE = Number(arg('audio-take', process.env.BOARD_AUDIO_TAKE || 1));
// Which relay is a PARAMETER, not a constant. A hop over the LAN and a hop
// over the internet are the same protocol, and cost 6 ms against 69 ms
// (measured, this repo). Choosing per hop is the point.
const RELAY = arg('relay', RELAY_BASE);
const URL_ = `${RELAY}/room/${ROOM}/ws`;

const FROM = `board-${randomId(6)}`;   // per SOCKET, per wire.mjs: `seq` counts a connection
let seq = 0, ws = null, audio = null, since = Date.now();
// What `graph` on the hello and on every beat is built from: gathered at each
// hello, the port list refreshed by every `state()`. Null until the first one.
let graphFacts = null;
// One variable for whatever makes sound; `inst.jack` is what downstream needs (the insert wraps
// only JACK).
// why: lessons/rig-board.md#inst
let synth = null, stopSynth = null, midiIn = null, inst = null;
// Set before any await: a chain takes about 13 s, and a note mid-start would start a second
// instrument.
// why: lessons/rig-board.md#starting
let starting = null;
// The sampler is not `inst`: it sounds beside it into the same capture (scsampler.mjs `startPlan`).
// why: lessons/rig-board.md#sampler
let samp = null, sampStarting = null;
// Programs a page typed, on the board's scsynth (scollide.mjs); answers sc.*, clock.ping and the
// `collide` node's notes, and starts nothing until audio.start {source: 'collide'}.
// why: lessons/rig-board.md#collide
const collide = createCollideService({ onFrame: (f) => sendPcm(f), log: (l) => log('collide:', l), sampler: () => samp });
// Plaits as a JACK source beside the sampler and collide (plaits.mjs); starts nothing until
// audio.start {source: 'plaits'}. A held note is released once its page has been quiet 15 s.
const plaits = createPlaitsService({ onFrame: (f) => sendPcm(f), log: (l) => log('plaits:', l), heardAt: (f) => clientSeen.get(f) });
// The board's own step sequencer (sequencer.mjs), on the Pi's clock, into the Circuit through its
// input's gate and the `drummap circuit` link. It keeps running with no tab open; nothing starts it but seq.start.
// why: lessons/rig-board-sequencer.md#board
// The Circuit's one writer: every message whole, one writeSync, through its input's gate (inputs.mjs).
// The sequencer and the keyboard both write here, so their messages interleave and never split.
// why: lessons/rig-board-keyboard.md#one-writer
function circuitSend(bytes, refused) {
  const c = hwInputs.get('circuit');
  if (!c) { refused('this board has no circuit input'); return; }
  c.handle({ type: 'midi.send', bytes }, (type, body) => { if (type === 'midi.refused') refused(body?.why || 'refused'); });
}
// One hit on the board's SuperCollider drums by GM voice name; a closed hat chokes the open one.
function drumHit(name, from) {
  const core = collide.core();
  if (!core) return { ok: false, why: 'the drums are not running on the Pi, a page starts them' };
  const choke = name === 'hhc' && core.loaded().some((d) => d.name === 'hho') ? { choke: 'hho' } : {};
  const r = core.hit({ hits: [{ name, ...choke }] }, { from });
  return r.ok ? { ok: true } : { ok: false, why: r.refused?.[0]?.reason || 'refused' };
}
const drumSeq = createSequencerService({
  graph: () => (graphFacts ? graphOf(graphFacts) : null),
  midiSend: circuitSend,
  hit: (name) => drumHit(name, 'sequencer'),
  // While the Circuit's drums hold the screen, the sequencer runs without drawing.
  screen: (steps) => { if (panel && steps && !cdrums.held()) panel.steps(steps); },
  log: (l) => log(l),
});
// The MK-425C on the Pi into the Circuit (keyboard.mjs): held by the board until kbd.unlink, so it
// outlives the tab that made it. A note on puts a bead on the shown patch's mk-425c -> circuit wire.
// why: lessons/rig-board-keyboard.md#board
let screenPatch = null;
const kbd = createKeyboardService({
  graph: () => (graphFacts ? graphOf(graphFacts) : null),
  refresh: () => { state(); },
  midiSend: circuitSend,
  // Into the board's own Plaits with no sender, so its quiet sweep never ends a key still held.
  play: (ev) => {
    const core = plaits.core();
    if (!core) return { ok: false, why: 'Plaits is not running on the Pi, a page starts it' };
    const r = ev.off || !ev.d2 ? core.noteOff({ note: ev.d1 }) : core.noteOn({ note: ev.d1, vel: ev.d2 });
    return r?.ok === false ? { ok: false, why: r.why || r.reason || 'refused' } : { ok: true };
  },
  open: rawMidiReader({ spawn, readlinkSync: fsMod.readlinkSync }),
  present: (card) => fsMod.existsSync(`/proc/asound/${card}`),
  onNote: () => {
    if (!panel || !screenPatch) return;
    const node = (id) => String(id).split(':').slice(0, 2).join(':');
    const idx = (screenPatch.links || []).map((l, i) => (node(l.from).endsWith(':mk-425c') && node(l.to).endsWith(':circuit') ? i : -1)).filter((i) => i >= 0);
    if (idx.length) panel.patchEvent(idx);
  },
  log: (l) => log(l),
});
// The Circuit's drums into the board's SuperCollider drums (circuit-drums.mjs): read off the Circuit's
// out by its input's tap, never written to it, held until cdrums.unlink. The screen is its grid meanwhile.
// why: lessons/rig-board-circuit-drums.md#board
const cdrums = createCircuitDrumsService({
  graph: () => (graphFacts ? graphOf(graphFacts) : null),
  tap: (fn) => hwInputs.get('circuit')?.tap(fn) ?? null,
  hit: (name) => drumHit(name, 'circuit-drums'),
  screen: (steps) => { if (panel && steps) panel.steps(steps); },
  log: (l) => log(l),
});
/** Why a page may not draw on the screen now, or ''. */
const screenTaken = () => (cdrums.held() ? 'the Circuit\'s drums hold the screen while that link is held (cdrums.unlink lets it go)' : '');
let fxOn = false;          // pappus inserted between the instrument and the capture
// The bay's JACK links, `"<from id> -> <to id>"` to the JACK rows it was
// applied as. See `jack.link`.
const bayLinks = new Map();

// Who switched the insert, and when, reported in fx.pappus, audio.status and board.alive, so a page
// sees a change it did not make. A client id is per connection.
// why: lessons/rig-board.md#fx-asked
let fxAsked = null;        // { by, at, on }, the last client to change it; why: lessons/rig-board.md#fx-asked-shape

// When each client was last heard from: liveness with no lease to leak. A live tab polls.
// why: lessons/rig-board.md#client-seen
const clientSeen = new Map();          // from -> ms
// 15 s is 3.75 of /grains/'s 4 s polls, so a lost poll or two never drops a live page's insert.
// why: lessons/rig-board.md#insert-held
const INSERT_HELD_MS = 15000;          // 3.75 of `/grains/`'s 4 s polls
const stillHere = (who) => !!who && (Date.now() - (clientSeen.get(who) ?? 0)) < INSERT_HELD_MS;
/** What the board will say about its own insert, to anybody who asks or listens. */
function insertState() {
  const by = fxAsked?.by ?? null;
  return {
    fx: fxOn ? 'pappus' : null,
    fxBy: by,
    fxAgoSec: fxAsked ? Math.round((Date.now() - fxAsked.at) / 1000) : null,
    fxHeld: fxOn && !!fxAsked?.on && stillHere(by),
  };
}

// The board drops an insert nobody is talking to (an orphan kept a -6.1 dBFS drone going). The
// relay
// has no "peer left" signal, so it is an idle rule; an open page polls, so it is never swept.
// why: lessons/rig-board.md#sweep
let sweeping = false;
async function sweepInsert(why) {
  if (!fxOn || sweeping) return null;
  const by = fxAsked?.by ?? null;
  if (stillHere(by)) return null;
  const quietMs = by && clientSeen.has(by) ? Date.now() - clientSeen.get(by) : null;
  sweeping = true;
  try {
    const r = await pappusFx(false, { instrumentPort: inst?.port, instrumentPortR: inst?.portR,
                                      onLog: (l) => log('pappus:', l) });
    if (!r.ok) { log(`the insert would not come out: ${r.reason}`); return null; }
    // The same three assignments as fx.pappus's off path, or the insert comes back on the next
    // change.
    // why: lessons/rig-board.md#sweep-off
    fxOn = false;
    fxAsked = null;
    madeSource = null;
    log(`insert dropped: ${by ?? 'nobody'} ${quietMs === null ? 'never spoke' : `went quiet ${Math.round(quietMs / 1000)} s ago`}`
      + `. the board waits ${INSERT_HELD_MS / 1000} s. ${why}`);
    // Said on the heartbeat (board.alive carries insertState()), sent now rather than in up to 5 s.
    // why: lessons/rig-board.md#sweep-beat
    send(alive());
    return r;
  } finally { sweeping = false; }
}

// The generated material a page asked for: the same sines a browser builds from the same spec.
// why: lessons/rig-board.md#made-source
let madeSource = null;     // { spec, partials, top } while PosSource is feeding pappus
let lastHeard = Date.now();
// The granulator's own OSC socket, kept while bypassed so the drift does not audibly stop.
// why: lessons/rig-board.md#pap
let pap = null;
const pappus = () => (pap ||= openPappus({ onLog: (l) => log('pappus:', l) }));

// The picture on its own socket, room `<room>-video`: video would push the audio socket over the
// relay's per-socket cap, and every page treats a binary frame on the main room as PCM.
// why: lessons/rig-board.md#video
let video = null, vws = null, vseq = 0, vsent = 0;
const VIDEO_ROOM = `${ROOM}-video`;

/** What a client needs to render it, plus what only this end can count. */
function videoShape() {
  const st = video?.stats() ?? {};
  return {
    w: video?.w, h: video?.h, fps: video?.fps, bitrate: video?.bitrate, gop: video?.gop,
    codec: 'avc1.42E01E',        // baseline 3.0, what h264_v4l2m2m emits here; why: lessons/rig-board.md#codec
    mirrors: video?.params().seg, grain: video?.params().scale, hue: video?.params().hue,
    // What actually drew it, read off the renderer rather than declared here.
    renderer: st.renderer ?? null,
    // Sent, not delivered: compare with the counter in the payload. `framesSent` because `sent` is
    // an
    // envelope field.
    // why: lessons/rig-board.md#frames-sent
    framesSent: vsent, ...st,
  };
}

function videoConnect() {
  if (vws && (vws.readyState === 0 || vws.readyState === 1)) return;
  vws = new WebSocket(`${RELAY}/room/${VIDEO_ROOM}/ws`);
  vws.binaryType = 'arraybuffer';
  vws.onopen = () => log(`video socket joined ${VIDEO_ROOM}`);
  vws.onclose = () => { log('video socket closed'); vws = null; if (video) setTimeout(videoConnect, 1000); };
  vws.onerror = () => { /* close follows; one report is enough */ };
}

// One frame out with an 8-byte header: a uint32 counter (the relay drops silently; 101 of 361 lost
// at 8 Mbit/s) and a flag word whose low bit marks a keyframe.
// why: lessons/rig-board.md#send-frame
function sendFrame(unit, key) {
  // The direct viewers first (`video.direct` below), then the relay room. The
  // counter rises once per frame whoever it reaches, so a viewer switching
  // path sees one counter.
  const at = vseq;
  if (videoDirects.size) sendVideoDirect(at, unit, key);
  if (vws?.readyState !== 1) { if (videoDirects.size) vseq++; return; }
  const out = Buffer.allocUnsafe(8 + unit.byteLength);
  out.writeUInt32LE(vseq++, 0);
  out.writeUInt32LE(key ? 1 : 0, 4);
  Buffer.from(unit.buffer, unit.byteOffset, unit.byteLength).copy(out, 8);
  vws.send(out);
  vsent++;
}

// The picture on a direct link: a third data channel `vid`, ordered and reliable, frames cut into
// 16 KB pieces, sent only after `video.direct`. No key: the relay room is already open.
// why: lessons/rig-board.md#video-direct
const videoDirects = new Map();   // peer -> { sink, waitKey, sent, dropped }
const VIDEO_DIRECT_BACKLOG = 1024 * 1024;
function sendVideoDirect(at, unit, key) {
  for (const [peer, x] of videoDirects) {
    let open = false;
    try { open = x.dc.isOpen(); } catch { /* closed under us */ }
    if (!open) { videoDirects.delete(peer); log(`video: ${peer} back on the relay, its channel closed, after ${x.sent} direct frames`); continue; }
    let backlog = 0;
    try { backlog = x.dc.bufferedAmount(); } catch { /* */ }
    if (backlog > VIDEO_DIRECT_BACKLOG) x.waitKey = true;
    if (x.waitKey) { if (!key) { x.dropped++; continue; } x.waitKey = false; }
    try { for (const b of framePieces(at, key, unit)) x.dc.sendMessageBinary(b); x.sent++; }
    catch (e) { videoDirects.delete(peer); log(`video: ${peer} back on the relay, a send failed, ${e.message}`); }
  }
}
/** `video.direct` over `ctl`: attach the peer's `vid` channel, waiting up to 500 ms for it to arrive. */
function videoDirect(reply, peer, waited = 0) {
  if (!peer) return reply('video.direct', { ok: false, why: 'the picture goes direct only over a direct link, never through this room' });
  const dc = mainDirect?.channel(peer, 'vid');
  if (!dc && waited < 500 && mainDirect?.has(peer)) { setTimeout(() => videoDirect(reply, peer, waited + 25), 25); return undefined; }
  if (!dc) return reply('video.direct', { ok: false, why: 'open the vid channel first', retry: true });
  if (!videoDirects.has(peer) && videoDirects.size >= 4) return reply('video.direct', { ok: false, why: '4 direct viewers already, use the relay' });
  videoDirects.set(peer, { dc, waitKey: true, sent: 0, dropped: 0 });
  log(`video: frames go direct to ${peer}, ${videoDirects.size} direct`);
  return reply('video.direct', { ok: true, running: !!video });
}

// Stop the renderer when nobody watches: one visit used to leave 25% CPU and 2 Mbit/s running for
// hours.
// why: lessons/rig-board.md#video-idle
const VIDEO_IDLE_MS = 2 * 60e3;
let videoWatch = null, videoAloneSince = null;

/** How many sockets are in a room, or null when the relay will not say. */
async function roomSockets(room) {
  try {
    const r = await fetch(`${RELAY.replace(/^ws/, 'http')}/room/${room}/stats`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).sockets ?? null;
  } catch { return null; }
}

// Viewers say `video.watching` every ten seconds; socket counts are not viewers (stale sockets read
// 7).
// why: lessons/rig-board.md#watching
let lastWatchAt = 0;

function watchVideoViewers() {
  if (videoWatch) return;
  videoAloneSince = null;
  lastWatchAt = Date.now();          // grace: nobody has had a chance to say yet
  videoWatch = setInterval(() => {
    if (!video) return stopVideoWatch();
    if (Date.now() - lastWatchAt < VIDEO_IDLE_MS) { videoAloneSince = null; return; }
    videoAloneSince ??= lastWatchAt;
    log(`video: nobody has said they are watching for ${Math.round(VIDEO_IDLE_MS / 60000)} min — stopping the renderer`);
    const st = video.stats();
    video.stop(); video = null;
    try { vws?.close(); } catch { /* already */ }
    vws = null;
    stopVideoWatch();
    send({ type: 'video.stopped', ok: true, reason: 'nobody watching', ...st });
  }, 30e3);
  videoWatch.unref?.();
}
function stopVideoWatch() { if (videoWatch) { clearInterval(videoWatch); videoWatch = null; videoAloneSince = null; } }

// Which controller selects a bank: 32, the MIDI standard.
// why: lessons/rig-board.md#bank-cc
const bankCC = () => 32;

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (msg) => { if (ws?.readyState === 1) { ws.send(format(msg, { from: FROM, seq: seq++ })); return true; } return false; };
// The OLED and keys, when a screen answers (panel.mjs). A key is a message to the whole room.
let panel = null;
// The board's stop (stop.mjs), made at the bottom of this file once every service it stops exists.
let stopper = null;
// `*` held HOLD_MS is stop all (a silence); a bar fills along the bottom while it is held. Every edge still
// reaches the room as `panel.key`; the release after a hold that fired carries `stopAll: true`.
// why: lessons/rig-board-stop.md#hold
const starHold = createHold({ onFire: () => stopFromKeys() });
let starTick = null;
function starKey(down) {
  if (down) {
    starHold.down(Date.now());
    clearInterval(starTick);
    starTick = setInterval(() => {
      const p = starHold.tick(Date.now());
      if (starHold.fired()) { clearInterval(starTick); starTick = null; return; }
      panel?.bar(p);
    }, 66);
    starTick.unref?.();
    return false;
  }
  clearInterval(starTick); starTick = null;
  const r = starHold.up(Date.now());
  panel?.bar(null);
  return r.fired;
}
function stopFromKeys() {
  panel?.bar(null);
  if (!stopper) { log('stop: * held, but the board is still starting'); return; }
  log(`stop: * held ${HOLD_MS} ms on the Pi's keys, stop all (silence)`);
  stopper.stop({ level: 'silence', asked: 'keys' }).then((r) => {
    const check = stopper.check({ level: 'silence' });
    panel?.text(`stopped\n${checkLines(check)}`);
    log(`stop: check after the keys' stop ${check.ok ? 'all green' : `red: ${check.rows.filter((x) => x.ok === false).map((x) => `${x.key} (${x.said})`).join(', ')}`}`);
    send({ type: 'board.stopped', ...r, check, via: 'keys' });
  }).catch((e) => log('stop: the stop from the keys threw:', e.message));
}
// The OLED's frames to the HDMI screen while it mirrors the OLED; set once `hdmi` exists further down.
let mirrorFrame = () => {};
openPanel({ log: (l) => log(l), onFrame: (fb) => mirrorFrame(fb), onKey: (k) => {
  const fired = k.k === 4 ? starKey(k.down) : false;
  send({ type: 'panel.key', ...k, ...(fired ? { stopAll: true } : {}), at: Date.now() });
} }).then((p) => { panel = p; }).catch((e) => log('panel: did not open:', e.message));
// The main socket's direct path (rtc.mjs `createMainDirect`), made at the
// bottom of this file once node-datachannel has been asked for. Null until then.
let mainDirect = null;

// Grains shipped four times a second, sclang's own batch, with the count in the window so a dropped
// message is not mistaken for a quiet granulator.
// why: lessons/rig-board.md#grains-shipping
const GRAIN_TTL = 30000;        // how long one `grain.report` keeps it shipping
let grainUntil = 0, grainPump = null;
function startGrainPump() {
  if (grainPump) return;
  grainPump = setInterval(() => {
    if (Date.now() > grainUntil) { stopGrainPump(); pap?.report(false); return; }
    const g = pap?.takeGrains?.();
    if (!g || (!g.list.length && !g.seen)) return;
    // `heardAt`, since `format()` throws on a payload field named like the envelope's.
    // why: lessons/rig-board.md#heard-at
    send({ type: 'grain.marks', seen: g.seen, marks: g.list, heardAt: g.at });
  }, 250);
  grainPump.unref?.();
}
function stopGrainPump() { if (grainPump) { clearInterval(grainPump); grainPump = null; } }

const state = () => {
  // `error` and `hint` go over the relay: zero ports alone cannot tell a broken sequencer from an
  // empty rig.
  // why: lessons/rig-board.md#ports-error
  const { backend: be, clients, error, hint } = listPorts();
  const ports = addressable(clients);
  // The graph on the beat reads the last list asked for rather than asking
  // again: `aconnect -l` is a blocking spawn and the beat runs while audio
  // frames are going out. Every hello and every `ports.*` verb refreshes it.
  if (graphFacts) graphFacts.ports = ports;
  return { backend: be, ports, error: error ?? null, hint: hint ?? null };
};

// Audio out, same 12-byte header and 20 ms framing as demo/carry: `synth` makes the sound itself,
// `capture` reads a device through arecord.
// why: lessons/rig-board.md#audio-out
const BYTES = FRAME * 2;
let aseq = 0, sentFrames = 0;

function sendPcm(int16) {
  if (ws?.readyState !== 1) return;
  const out = Buffer.allocUnsafe(12 + int16.byteLength);
  out.writeUInt32LE(aseq++, 0);
  out.writeDoubleLE(performance.now(), 4);
  Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength).copy(out, 12);
  ws.send(out);
  sentFrames++;
}
// A source that makes whole frames only (the synth, `arecord`): the frame to
// the relay and, in two halves, to every direct listener. The JACK capture
// feeds the direct path half by half itself (`setCaptureUnit` below).
function pcmOut(int16) {
  mainDirect?.frame(int16);
  sendPcm(int16);
}

async function startAudio(source = 'synth', msg = null) {
  // Replace, do not refuse: two sources on one socket interleave samples and overrun the relay.
  // why: lessons/rig-board.md#replace
  if (source === 'sampler') return startSampler();
  // A pipe source beside the sampler would interleave two streams; only a JACK instrument can sum
  // with it.
  // why: lessons/rig-board.md#pipe-beside
  if (samp && !JACK_SYNTHS[source]) return { ok: false, reason: `the sampler is sounding through the JACK capture, and ${source} writes its own frames, so the two would interleave. Stop the sampler first` };
  if (starting) return { ok: false, reason: `already starting ${starting}`, starting };
  // A new instrument does not inherit an insert nobody is holding; a live page's insert stays.
  // why: lessons/rig-board.md#new-instrument
  await sweepInsert('an instrument was asked for');
  const running = inst ? inst.source : stopSynth ? 'synth' : audio ? 'capture' : null;
  if (running) {
    // An already-running source is described as fully as a fresh start.
    // why: lessons/rig-board.md#already
    if (running === source) {
      return { ok: true, already: true, source: running, jack: !!inst?.jack, port: inst?.port ?? null,
               ...insertState() };
    }
    log(`switching ${running} -> ${source}`);
    stopAudio();
    await new Promise((r) => setTimeout(r, 600));   // let the old one actually die
  }

  // A JACK instrument: jacksynth.mjs raises jackd, the synth and a capture, and plays via
  // snd-virmidi.
  // why: lessons/rig-board.md#jack-synth
  if (JACK_SYNTHS[source]) {
    if (!jackSynthAvailable(source)) return { ok: false, reason: `${source} is not installed on this board` };
    starting = source;
    log(`starting ${source} (jack chain) ...`);
    let r;
    try { r = await startJackSynth(source, { onFrame: sendPcm, onLog: (l) => log(`${source}:`, l) }); }
    finally { starting = null; }
    if (!r.ok) { log(`${source} failed: ${r.reason}`); return r; }
    inst = r;
    log(`${source} up · port ${r.port} · midi ${r.midi ? 'in' : 'NONE'}`);
    // An instrument change re-patches the graph, so a switched-on insert has to
    // be put back or it silently drops out from under the new instrument.
    if (fxOn) await pappusFx(true, { instrumentPort: r.port, instrumentPortR: r.portR, onLog: (l) => log('pappus:', l) });
    // Re-feed the generated material after a new instrument, or pappusFx patches the instrument
    // back in.
    // why: lessons/rig-board.md#source-feed
    if (fxOn && madeSource) sourceFeed(true, { instrumentPort: r.port, instrumentPortR: r.portR, onLog: (l) => log('source:', l) });
    return { ok: true, source, jack: true, port: r.port, midi: r.midi, rate: r.rate, msgPerSec: r.msgPerSec,
             channels: r.channels, ...insertState() };
  }


  // One jackd, one capture, one room: one instrument. A dummy jackd runs with no sound hardware at
  // all.
  // why: lessons/rig-board.md#one-instrument

  // 'synth' and 'moog' are reachable only by name, kept to reproduce measurements; never offered.
  // why: lessons/rig-board.md#moog
  if (source === 'moog') {
    synth = createMoogSynth({ patch: msg?.patch ?? 'bass' });
    stopSynth = synth.startRealtime(pcmOut);
    log(`moog up · patch ${msg?.patch ?? 'bass'}`);
    return { ok: true, source: 'moog', patch: msg?.patch ?? 'bass', patches: Object.keys(MOOG_PATCHES),
             rate: RATE, msgPerSec: RATE / FRAME, needs: 'nothing plugged in' };
  }

  if (source === 'synth') {
    synth = createSynth();
    stopSynth = synth.startRealtime(pcmOut);
    // A real keyboard patched with aconnect plays it too.
    // why: lessons/rig-board.md#aconnect
    if (backend() === 'alsa') {
      try {
        midiIn = alsaNotes(spawn, (kind, note, vel) => kind === 'on' ? synth.noteOn(note, vel) : synth.noteOff(note));
        midiIn.on('exit', () => { midiIn = null; });
      } catch (e) { log('aseqdump unavailable:', e.message); }
    }
    log(`synth up · ${RATE} Hz · ${FRAME}-sample frames · 50 msg/s (cap ${LIMITS.msgPerSec})`);
    return { ok: true, source: 'synth', rate: RATE, frameMs: 1000 * FRAME / RATE, msgPerSec: RATE / FRAME,
             midi: !!midiIn, needs: 'nothing plugged in' };
  }

  // Capture is asked for by name; an unknown source is an error, never a microphone.
  // why: lessons/rig-board.md#capture-by-name
  if (source !== 'capture') {
    return { ok: false, reason: `unknown source ${JSON.stringify(source)}`,
             known: [...Object.keys(JACK_SYNTHS), 'synth', 'moog', 'capture', 'sampler', 'collide', 'plaits'] };
  }
  if (backend() !== 'alsa') return { ok: false, reason: 'no arecord here — capture needs the board' };
  if (!(AUDIO_TAKE >= 1 && AUDIO_TAKE <= AUDIO_CH)) {
    return { ok: false, reason: `BOARD_AUDIO_TAKE ${AUDIO_TAKE} is not one of ${AUDIO_CH} channels` };
  }
  const p = spawn('arecord', ['-D', AUDIO_DEV, '-f', 'S16_LE', '-r', String(RATE), '-c', String(AUDIO_CH), '-t', 'raw', '-q'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  const IN = BYTES * AUDIO_CH;
  let carry = Buffer.alloc(0);
  p.stdout.on('data', (chunk) => {
    carry = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    while (carry.length >= IN) {
      const all = new Int16Array(carry.buffer.slice(carry.byteOffset, carry.byteOffset + IN));
      if (AUDIO_CH === 1) pcmOut(all);
      else {
        const one = new Int16Array(FRAME);
        for (let i = 0; i < FRAME; i++) one[i] = all[i * AUDIO_CH + AUDIO_TAKE - 1];
        pcmOut(one);
      }
      carry = carry.subarray(IN);
    }
  });
  // arecord's complaints go to stderr and are the only clue when a device name
  // is wrong. Silence here is what made three "BlackHole is silent" readings.
  p.stderr.on('data', (d) => log('arecord:', String(d).trim()));
  p.on('exit', (code) => { log(`arecord exited ${code} after ${sentFrames} frames`); audio = null; });
  audio = p;
  return { ok: true, source: 'capture', device: AUDIO_DEV, rate: RATE, deviceChannels: AUDIO_CH, take: AUDIO_TAKE };
}

async function startSampler() {
  const plan = startPlan('sampler', { running: inst?.source ?? null, sampler: !!samp });
  if (plan.act === 'already') return { ok: true, already: true, ...samp.status() };
  if (sampStarting) return { ok: false, reason: 'the sampler is already starting', starting: 'sampler' };
  sampStarting = 'sampler';
  log('starting the sampler (its own scsynth, beside whatever else is playing) ...');
  let r;
  try { r = await startScSampler({ onFrame: sendPcm, onLog: (l) => log('sampler:', l), onState: (s) => { if (s === 'exited') samp = null; } }); }
  catch (e) { r = { ok: false, reason: e.message }; }
  finally { sampStarting = null; }
  if (!r.ok) { log(`sampler failed: ${r.reason}`); return { ...r, source: 'sampler' }; }
  samp = r;
  return { ok: true, ...samp.status(), beside: inst?.source ?? null };
}

function stopSampler() {
  if (!samp) return { ok: true, was: null };
  collide.samplerGone();
  const held = samp.stop();
  samp = null;
  if (!held) aseq = 0;            // the capture stopped too, so a new one restarts the sequence
  return { ok: true, was: 'sampler', captureStillRunning: held };
}

function stopAudio() {
  const was = inst ? inst.source : stopSynth ? 'synth' : audio ? 'capture' : null;
  // The sequence restarts only with the capture, or listeners see a reorder.
  // why: lessons/rig-board.md#aseq
  if (!captureHolders().filter((h) => h !== was).length) aseq = 0;
  if (inst) { inst.stop(); inst = null; }
  if (stopSynth) { stopSynth(); stopSynth = null; synth = null; }
  if (midiIn) { midiIn.kill('SIGTERM'); midiIn = null; }
  if (audio) { audio.kill('SIGTERM'); audio = null; }
  return { ok: true, was, frames: sentFrames };
}

// Coalesce controller messages, do not queue them: only the last value is true. The drain is a
// timer
// (DRAIN_MS, well under the 20 ms frame) so a burst costs one write per controller.
// why: lessons/rig-board.md#coalesce
const DRAIN_MS = 5;
// `last` is what each controller was written to, with the sender: an unseen CC 7 at 8 once left the
// output at 0.003 of full scale for days. Folded values are never reported as written.
// why: lessons/rig-board.md#ctl
const ctl = { pending: new Map(), last: new Map(), by: new Map(), timer: null, ch: 0,
              in: 0, out: 0, folded: 0, since: Date.now() };

function ctlDrain() {
  if (ctl.timer) return;                         // one drain in flight is enough
  ctl.timer = setTimeout(() => {
    ctl.timer = null;
    if (!ctl.pending.size) return;
    // No instrument: drop pending values, or a knob turned now arrives minutes later.
    // why: lessons/rig-board.md#no-inst
    if (!inst) { ctl.pending.clear(); return; }
    for (const [c, v] of ctl.pending) {
      inst.cc(ctl.ch, c, v);
      ctl.out++;
      // Recorded at the WRITE, which is the only moment this board knows the
      // instrument was actually told something.
      ctl.last.set(c, { v, at: Date.now(), by: ctl.by.get(c) ?? null });
    }
    ctl.pending.clear();
  }, DRAIN_MS);
  ctl.timer.unref?.();
}

/** What the page displays: what arrived, what was written, what was overtaken. */
function ctlMeter() {
  const forMs = Date.now() - ctl.since;
  const now = Date.now();
  // The controllers this board is set to, newest first. `name` only where measured on this
  // instrument.
  // why: lessons/rig-board.md#ctl-set
  const set = [...ctl.last.entries()]
    .map(([c, r]) => ({ ctrl: c, value: r.v, agoMs: now - r.at, by: r.by,
                        name: CTL_NAMES[c] ?? null }))
    .sort((a, b) => a.agoMs - b.agoMs);
  return { in: ctl.in, out: ctl.out, folded: ctl.folded, forMs,
           on: inst ? inst.source : null, channel: ctl.ch,
           set,
           // Volume first; `null` means never told, which is not 127.
           // why: lessons/rig-board.md#volume
           volume: ctl.last.has(7) ? ctl.last.get(7).v : null };
}

// Controller meanings measured on this instrument; anything else is reported by number.
// why: lessons/rig-board.md#ctl-names
const CTL_NAMES = {
  7: 'volume', 11: 'expression', 71: 'filter Q', 74: 'filter cutoff',
  75: 'bandwidth', 76: 'FM amplitude', 77: 'resonance centre', 78: 'resonance bandwidth',
};

// Every verb that changes the rig has a plan twin. `replyVia` is the direct path's ctl channel, so
// an answer returns the way its question came.
// why: lessons/rig-board.md#handle
async function handle(msg, replyVia = null) {
  const reply = replyVia || ((type, body) => send({ type, re: msg.id, ...body }));
  // The collide engine's own verbs first, so `audio.start {source: 'collide'}`
  // and a `note.on {node: 'collide'}` never fall through to Yoshimi.
  if (collide.handles(msg)) return collide.handle(msg, reply).then(() => true);
  if (plaits.handles(msg)) return plaits.handle(msg, reply).then(() => true);
  if (drumSeq.handles(msg)) return drumSeq.handle(msg, reply).then(() => true);
  if (kbd.handles(msg)) return kbd.handle(msg, reply).then(() => true);
  if (cdrums.handles(msg)) return cdrums.handle(msg, reply).then(() => true);
  if (hdmi.handles(msg)) return hdmi.handle(msg, reply).then(() => true);
  switch (msg.type) {
    // A page that joins late asks, and gets the beat now rather than up to five
    // seconds from now. The beat already carries the graph (`beat.mjs`), so the
    // answer is that, unchanged: one shape, one place.
    case 'graph.ask':
      send(alive());
      return;
    case 'ports.get': {
      const s = state();
      return reply('ports.list', { backend: s.backend, ports: s.ports });
    }
    case 'patch.plan': {
      const s = state();
      return reply('patch.planned', { ...plan(msg.patch, s.ports), backend: s.backend });
    }
    case 'patch.apply': {
      const s = state();
      const planned = plan(msg.patch, s.ports);
      if (!planned.ok) return reply('patch.applied', { ok: false, ...planned, applied: false });
      const res = apply(planned, { dry: DRY });
      log(`patch: ${res.ran.map((r) => `${r.label} ${r.result}`).join(', ') || 'nothing to do'}`);
      return reply('patch.applied', { ...res, applied: !DRY, steps: planned.steps });
    }
    case 'patch.clear':
      log('clearing every subscription');
      return reply('patch.cleared', clearAll({ dry: DRY }));
    case 'audio.start':
      // No default instrument: a bare audio.start is refused in words.
      // why: lessons/rig-board.md#no-default
      if (!msg.source) return reply('audio.started', { ok: false, reason: 'say which instrument to start: audio.start {source: "sampler"}, "collide", "plaits" or "synth"; there is no default since Yoshimi left this board on 2026-10-13' });
      startAudio(msg.source, msg).then((r) => reply('audio.started', r));
      return true;
    // Notes from anywhere: a browser keyboard, a phone, `ask.mjs`. The board does
    // not care which, and does not need one to exist.
    case 'note.on':
      // `node: 'sampler'` notes go to the sampler; never starts anything.
      // why: lessons/rig-board.md#sampler-node
      if (isForSampler(msg)) {
        if (!samp) return reply('note.ack', { note: msg.note, node: 'sampler', dropped: true, reason: 'the sampler is not running, send audio.start {source: "sampler"}' });
        return reply('note.ack', { node: 'sampler', ...samp.noteOn(msg.note, msg.vel ?? 100) });
      }
      // Mid-start, a note is dropped rather than starting a second instrument.
      // why: lessons/rig-board.md#mid-start
      if (starting) return reply('note.ack', { note: msg.note, dropped: true, starting });
      // A note to an idle board starts nothing.
      // why: lessons/rig-board.md#idle-note
      if (!synth && !inst) return reply('note.ack', { note: msg.note, dropped: true, reason: 'nothing is playing on this board, send audio.start {source: ...} first' });
      if (inst) inst.noteOn(msg.channel ?? 0, msg.note, msg.vel ?? 100);
      else synth?.noteOn(msg.note, msg.vel ?? 100);
      // A key does not pitch a grain voice; `params.set gates` opens the voices.
      // why: lessons/rig-board.md#note-ack
      return reply('note.ack', { note: msg.note, channel: msg.channel ?? 0,
        on: inst ? inst.source : 'synth' });
    case 'note.off':
      if (isForSampler(msg)) { samp?.noteOff(msg.note); return reply('note.ack', { note: msg.note, node: 'sampler' }); }
      if (inst) inst.noteOff(msg.channel ?? 0, msg.note);
      else if (synth) synth.noteOff(msg.note);
      return reply('note.ack', { note: msg.note });
    case 'note.panic':
      // Each engine's own: a page stopping Yoshimi does not cut somebody's piano.
      if (isForSampler(msg)) { samp?.panic(); return reply('note.ack', { panic: true, node: 'sampler' }); }
      if (inst) inst.panic();
      if (synth) synth.allOff();
      // An insert keeps sounding after notes stop, so it is silenced too.
      // why: lessons/rig-board.md#panic
      if (fxOn) pappusPanic();
      // ...and close the grain voices, or eight gates stay open and the buffer
      // keeps sounding through a panic that said it had stopped everything.
      if (pap) pap.notes.panic();
      return reply('note.ack', { panic: true, fx: fxOn ? 'pappus cleared' : null });
    // What patches this board has, read off the board.
    // why: lessons/rig-board.md#voices-list
    case 'voices.list': {
      const src = msg.source ?? inst?.source ?? null;
      // `fixed` tells "nothing is playing" from a library that failed to read.
      // why: lessons/rig-board.md#voices-fixed
      return reply('voices.listed', {
        source: src, ok: false, fixed: !!src, banks: [], count: 0,
        reason: src ? `${src}'s programs are a fixed table, not a library on this board` : 'nothing is playing',
      });
    }
    // The multitimbral surface: one call per channel, then sixteen channels are
    // sixteen instruments.
    case 'voice.select': {
      // The sampler's program change: 0 the piano, 1 the Rhodes.
      if (isForSampler(msg)) {
        if (!samp) return reply('voice.selected', { ok: false, node: 'sampler', reason: 'the sampler is not running' });
        const r = samp.program(msg.program);
        // Answer when the set is IN, so a page can say so: the Rhodes is
        // fetched and converted the first time it is asked for.
        const load = r.ok ? await samp.loadSet(msg.program) : null;
        return reply('voice.selected', { node: 'sampler', ...r, load });
      }
      // A program number, never a name: a name only meant something in a table for a removed
      // instrument.
      // why: lessons/rig-board.md#program
      if (inst) {
        const prog = msg.program;
        if (!Number.isInteger(prog)) {
          return reply('voice.selected',
            { ok: false, reason: 'send {program:<0-127>}, and {bank:<n>} with it to change bank', on: inst.source });
        }
        // Bank select is CC 32 from the instrument's own config, never CC 0 (the root directory);
        // bank and
        // program go out back to back on one byte stream.
        // why: lessons/rig-board.md#bank
        const bank = Number.isInteger(msg.bank) ? msg.bank : null;
        if (bank !== null) inst.cc(msg.channel ?? 0, bankCC(inst.source), bank);
        inst.program(msg.channel ?? 0, prog);
        return reply('voice.selected', { ok: true, on: inst.source, channel: msg.channel ?? 0,
                                         bank, bankCC: bank === null ? null : bankCC(inst.source), program: prog, name: msg.name ?? null });
      }
      return reply('voice.selected', { ok: false, reason: 'no instrument running' });
    }
    // ctl.set takes a batch, folds it and writes at most one value per controller per drain,
    // reporting
    // `folded`; the last value sent is the one written. `cc` stays as it was.
    // why: lessons/rig-board.md#ctl-set-verb
    case 'ctl.set': {
      if (!Array.isArray(msg.set)) return reply('ctl.ack', { ok: false, reason: 'ctl.set wants set: [[controller, value], ...]' });
      ctl.ch = msg.channel ?? ctl.ch;
      for (const pair of msg.set) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const c = pair[0] | 0, v = Math.max(0, Math.min(127, pair[1] | 0));
        ctl.in++;
        if (ctl.pending.has(c)) ctl.folded++;      // this one overtook another
        ctl.pending.set(c, v);
        ctl.by.set(c, msg.from ?? null);           // whose hand was last on it
      }
      ctlDrain();
      // No ack per value; ctl.meter reports once a second.
      // why: lessons/rig-board.md#no-ack
      return;
    }
    case 'ctl.meter':
      return reply('ctl.meter', ctlMeter());
    case 'cc': {
      if (isForSampler(msg)) return reply('cc.ack', { node: 'sampler', ok: !!samp, moved: samp ? samp.cc(msg.ctrl, msg.value) : null });
      // Yoshimi answers CC 74 (cutoff) and 71 (resonance) for real, which is
      // the pair `/knobs/` is built on.
      if (inst) { inst.cc(msg.channel ?? 0, msg.ctrl, msg.value); return reply('cc.ack', { ok: true, on: inst.source }); }
      // 74 and 71 are the conventional cutoff and resonance, so a hardware knob
      // maps onto them with no translation anywhere.
      const k = msg.ctrl === 74 ? 'cutoff' : msg.ctrl === 71 ? 'resonance' : msg.ctrl === 79 ? 'envAmount' : null;
      const ok = !!(k && synth?.set?.(k, msg.value));
      return reply('cc.ack', { ok, on: ok ? 'moog' : null, control: k, value: msg.value, patch: ok ? synth.patch : null });
    }
    case 'moog.patch':
      return reply('moog.patched', { ok: !!synth?.setPatch?.(msg.patch), patch: msg.patch, patches: Object.keys(MOOG_PATCHES) });
    case 'audio.stop': {
      // `{source: 'sampler'}` stops the sampler and nothing else; no source
      // stops the instrument and never the sampler (scsampler.mjs `stopPlan`).
      const sp = stopPlan(msg.source ?? null, { running: inst?.source ?? null, sampler: !!samp });
      if (msg.source === 'sampler') return reply('audio.stopped', { ...stopSampler(), source: 'sampler' });
      return reply('audio.stopped', { ...(sp.stopInst || stopSynth || audio ? stopAudio() : { ok: true, was: null }),
                                      sampler: samp ? 'still running' : null });
    }
    // Pappus is an insert, not an instrument: it wraps what is on the JACK graph. An unknown verb
    // falls through to `default` (it is usually somebody else's traffic).
    // why: lessons/rig-board.md#fx-pappus
    case 'fx.pappus': {
      const want = msg.on !== false;
      // The gate is `inst.jack`, a property the source reports about itself.
      // why: lessons/rig-board.md#jack-gate
      if (want && !inst?.jack) return reply('fx.pappus', {
        ok: false,
        ...insertState(),
        reason: inst ? `${inst.source} writes to a pipe, not to JACK — the insert can only wrap what is on the JACK graph`
                      : 'nothing is playing for an insert to wrap',
      });
      // `onlyIfIdle`: take it out unless a client is still holding it; refuses out loud with the
      // holder and
      // ages. Opt in; plain fx.pappus {on: false} still forces it, to fix a wedged board.
      // why: lessons/rig-board.md#only-if-idle
      if (!want && msg.onlyIfIdle === true && fxOn && fxAsked?.on
          && fxAsked.by !== msg.from && stillHere(fxAsked.by)) {
        const heldFor = Math.round((Date.now() - fxAsked.at) / 1000);
        const heardAgo = Math.round((Date.now() - clientSeen.get(fxAsked.by)) / 1000);
        return reply('fx.pappus', {
          // `on: true` explicitly: pages read `m.on` and insertState() reports `fx`.
          // why: lessons/rig-board.md#on-true
          ok: true, on: true, kept: true, ...insertState(), instrument: inst?.source ?? null,
          reason: `another page asked for the granulator ${heldFor} s ago and was heard from ${heardAgo} s ago`,
        });
      }
      const r = await pappusFx(want, { instrumentPort: inst?.port, instrumentPortR: inst?.portR, onLog: (l) => log('pappus:', l) });
      // Recorded only when it changed, so a refused request does not become the holder.
      // why: lessons/rig-board.md#recorded
      if (r.ok) { fxOn = want; fxAsked = { by: msg.from ?? null, at: Date.now(), on: want }; }
      // Restore the generated source's patching after pappusFx(true); with no source, tell sclang
      // (which outlives this process) to drop any source synth it still holds.
      // why: lessons/rig-board.md#re-patch
      if (r.ok && want) {
        if (madeSource) sourceFeed(true, { instrumentPort: inst?.port, instrumentPortR: inst?.portR, onLog: (l) => log('source:', l) });
        else pappus().sourceOff();
      }
      if (r.ok && !want) madeSource = null;
      // Switching off returns the sampler to its cheap path: one process, no
      // jackd, no capture.
      return reply('fx.pappus', { ...r, ...insertState(), instrument: inst?.source ?? null });
    }

    // ── the reverb, as an insert ─────────────────────────────────────────

    // A seeded roll in one of six characters, the seed returned so a good roll can be asked for
    // again.
    // why: lessons/rig-board.md#params-random
    case 'params.random': {
      if (!fxOn) return reply('params.rolled', { ok: false, reason: 'pappus is not switched on' });
      // With material loaded the keyboard owns the eight grain voices, so the
      // roll leaves `pitches`/`gates` alone rather than pulling the instrument
      // out from under whoever is playing it.
      const r = pappus().roll(Number.isInteger(msg.seed) ? msg.seed : undefined, { voices: true });
      // A roll switches the drift back on (the reply carries driftStats()); measuring must turn it
      // off after.
      // why: lessons/rig-board.md#drift-on
      pappus().startDrift();
      log(`rolled ${r.character.m}/${r.character.n} · seed ${r.seed} · ${r.m.rate}/${r.n.rate} grains per second`);
      return reply('params.rolled', { ok: true, on: 'pappus', ...r, characters: CHARACTER_NAMES, drift: pappus().driftStats() });
    }
    // The slow movement lives on the board, so the sound moves with nobody connected; pages can
    // stop it.
    // why: lessons/rig-board.md#params-drift
    case 'params.drift': {
      if (!fxOn) return reply('params.drifted', { ok: false, reason: 'pappus is not switched on' });
      const want = msg.on !== false;
      const changed = want ? pappus().startDrift(msg.hz) : pappus().stopDrift();
      return reply('params.drifted', { ok: true, on: want, changed, ...pappus().driftStats() });
    }
    // The engine reports each grain as GrainBuf fires; a request expires after GRAIN_TTL so a
    // closed page stops it. source.set builds material from the page's spec (partialsOf,
    // PosSource.sc), and takes the instrument out of scsynth's input rather than stopping it.
    // why: lessons/rig-board.md#source-set
    case 'source.set': {
      const onLog = (l) => log('source:', l);
      if (msg.on === false) {
        pap?.sourceOff();
        madeSource = null;
        const back = sourceFeed(false, { instrumentPort: inst?.port, instrumentPortR: inst?.portR, onLog });
        return reply('source.applied', { ok: true, on: false, instrument: inst?.source ?? null, fed: back.fed });
      }
      if (!fxOn) return reply('source.applied', { ok: false, on: false, reason: 'pappus is not switched on, so there is nothing to feed' });
      const r = pappus().source(msg.spec ?? {});
      if (!r.ok) return reply('source.applied', { ok: false, on: !!madeSource, reason: r.reason });
      madeSource = { spec: r.spec, partials: r.partials, top: r.top };
      const feed = sourceFeed(true, { instrumentPort: inst?.port, instrumentPortR: inst?.portR, onLog });
      // `ok` means scsynth answers /s_get for a real node (3 s wait), not that a message was sent.
      // why: lessons/rig-board.md#engine-has-it
      let st = pappus().sourceState();
      for (let i = 0; i < 30 && !st.on; i++) { await wait(100); st = pappus().sourceState(); }
      // Values are compared: a node holding the def's defaults never received the spec.
      // why: lessons/rig-board.md#holds
      const holds = st.on && st.voices === r.spec.chord.length && Math.abs(st.hz - r.spec.hz) < 0.1;
      if (!holds) {
        log(`source: the engine did not confirm it — node ${st.node}, ${st.voices} voices, ${st.hz} Hz`);
        return reply('source.applied', {
          ok: false, on: false, reason: st.on
            ? `the engine holds ${st.voices} voices at ${st.hz} Hz, not ${r.spec.chord.length} at ${r.spec.hz}`
            : 'the engine never answered — the synth was not built',
          node: st.node, partials: r.partials,
        });
      }
      log(`source: ${r.partials} sine partials, top ${Math.round(r.top)} Hz, engine node ${st.node}`);
      return reply('source.applied', {
        ok: true, on: true, partials: r.partials, spec: r.spec, topHz: Math.round(r.top),
        // What the ENGINE answered, which is the only part of this that is
        // evidence rather than intent.
        engine: { node: st.node, voices: st.voices, hz: st.hz, saidMs: st.ms },
        instrument: inst?.source ?? null, fed: feed.fed,
      });
    }
    case 'grain.report': {
      if (!fxOn) return reply('grain.reported', { ok: false, reason: 'pappus is not switched on' });
      const want = msg.on !== false;
      grainUntil = want ? Date.now() + GRAIN_TTL : 0;
      pappus().report(want);
      if (want) startGrainPump(); else stopGrainPump();
      return reply('grain.reported', { ok: true, on: want, forMs: want ? GRAIN_TTL : 0 });
    }
    case 'params.state':
      return reply('params.state', {
        ok: fxOn, roll: pap?.current() ?? null, drift: pap?.driftStats() ?? null,
        // What it is chewing, for a page that joined later.
        // why: lessons/rig-board.md#made
        made: madeSource ? { ...madeSource, engine: pap?.sourceState() ?? null } : null,
        // What the board sent, not what the engine did: tells "never sent" from "took it and made
        // no sound".
        // why: lessons/rig-board.md#notes-sent
        notes: pap?.notes.state() ?? null,
      });
    // One named engine command forwarded: the measurement surface, so a harness can sweep a
    // parameter.
    // Its blast radius is one granulator's parameters.
    // why: lessons/rig-board.md#params-set
    case 'params.set': {
      if (!fxOn) return reply('params.set', { ok: false, reason: 'pappus is not switched on' });
      // A command NAME, not arbitrary text: this becomes an OSC address on a
      // socket, and the engine takes any string without complaint.
      const cmd = typeof msg.cmd === 'string' && /^[a-z][a-z0-9_]{0,23}$/.test(msg.cmd) ? msg.cmd : null;
      if (!cmd) return reply('params.set', { ok: false, reason: 'send {cmd:"<name>", args:[<numbers>]}' });
      const args = (Array.isArray(msg.args) ? msg.args : [msg.value])
        .filter((v) => typeof v === 'number' && Number.isFinite(v));
      // 48 because the resonator bank takes 48 frequencies in one message, and
      // nothing here takes more.
      if (!args.length || args.length > 48) return reply('params.set', { ok: false, reason: 'args must be 1..48 finite numbers' });
      // `.set`, not `.send`: a chosen value becomes the centre the drift circles.
      // why: lessons/rig-board.md#set-centre
      const centred = pappus().set(cmd, ...args);
      // Opening the voice gates updates the keyboard's mirror, so `notes.gate` stays one authority.
      // why: lessons/rig-board.md#gates-mirror
      if (cmd === 'gates') pappus().notes.adopt(args);
      // params.set never switches the drift on: a sweep must not grade a moving target.
      // why: lessons/rig-board.md#no-drift
      return reply('params.set', { ok: true, cmd, args, centred: centred ? centred.join(' ') : null });
    }

    // The picture. source.set builds sound from a spec; nothing here touches ERR's archive.
    // why: lessons/rig-board.md#picture

    // ── the picture ──────────────────────────────────────────────────────
    case 'video.start': {
      if (video) return reply('video.started', { ok: true, already: true, room: VIDEO_ROOM, ...videoShape() });
      // The Pi camera (camera.mjs) encodes on the same exclusive device, and a
      // second user of it blocks rather than failing.
      if (camera?.running()) return reply('video.started', { ok: false, reason: 'the Pi camera is using the hardware encoder for /remote/circuit-on-pi/, so the shader picture waits' });
      videoConnect();
      const r = startVideo({
        w: Math.min(msg.w ?? 1280, 1920), h: Math.min(msg.h ?? 720, 1080),
        fps: Math.min(msg.fps ?? 30, 60),
        // Capped at 4 Mbit/s: 2 and 4 arrive intact, 8 loses 28% of frames silently.
        // why: lessons/rig-board.md#bitrate
        bitrate: Math.min(msg.bitrate ?? 2_000_000, 4_000_000),
        gop: Math.min(msg.gop ?? 30, 120),
        passes: Math.min(msg.passes ?? 1, 4),
        onFrame: sendFrame,
        onLog: (l) => log('video:', l),
      });
      if (!r.ok) return reply('video.started', { ok: false, reason: r.reason });
      video = r; vseq = 0; vsent = 0;
      watchVideoViewers();
      log(`video up · ${r.w}x${r.h} @${r.fps} · ${(r.bitrate / 1e6).toFixed(1)} Mbit/s · room ${VIDEO_ROOM}`);
      return reply('video.started', { ok: true, room: VIDEO_ROOM, ...videoShape() });
    }
    // The picture's knobs, named; the page's shader body is compiled here as 310 es: one text, two
    // GPUs.
    // why: lessons/rig-board.md#video-shader
    case 'video.shader': {
      if (!video) return reply('video.shader.applied', { ok: false, reason: 'no picture running' });
      const r = await video.shader(msg.body);
      log(r.ok ? `new shader sent to the renderer — ${r.bytes} bytes` : `shader refused — ${r.reason}`);
      return reply('video.shader.applied', r);
    }
    case 'video.params': {
      if (!video) return reply('video.params', { ok: false, reason: 'no picture running' });
      // Page names to renderer uniforms; `segments` is the same uniform as `mirrors`.
      // why: lessons/rig-board.md#uniform-map
      const MAP = { mirrors: ['seg', 2, 64], segments: ['seg', 2, 64], grain: ['scale', 0.5, 40], hue: ['hue', 0, 3] };
      let n = 0;
      for (const [name, [key, lo, hi]] of Object.entries(MAP)) {
        if (!Number.isFinite(msg[name])) continue;
        n += video.set(key, Math.max(lo, Math.min(hi, msg[name]))) ? 1 : 0;
      }
      const p = video.params();
      log(`video params: ${p.seg} mirrors · grain ${p.scale} · hue ${p.hue}`);
      // Reported as sent, not applied: the renderer cannot answer. `paramsSent`, not `sent`.
      // why: lessons/rig-board.md#params-sent
      return reply('video.params', { ok: n > 0, paramsSent: n, mirrors: p.seg, grain: p.scale, hue: p.hue });
    }
    // A viewer saying it is watching: no reply, one message per viewer per ten seconds.
    // why: lessons/rig-board.md#video-watching
    case 'video.watching':
      lastWatchAt = Date.now();
      return true;
    case 'video.stop': {
      if (!video) return reply('video.stopped', { ok: true, was: null });
      const st = video.stats();
      video.stop(); video = null;
      stopVideoWatch();
      try { vws?.close(); } catch { /* already */ }
      vws = null;
      log(`video stopped after ${st.frames} frames`);
      return reply('video.stopped', { ok: true, ...st });
    }
    case 'video.status':
      return reply('video.started', video
        ? { ok: true, room: VIDEO_ROOM, ...videoShape() }
        : { ok: false, reason: 'no picture running', available: videoAvailable(), renderer: V3DPIPE });

    // insertState() here too, so a page asking what plays sees who holds the insert.
    // why: lessons/rig-board.md#audio-status
    case 'audio.status':
      // `inputs` rides along: each hardware input streams in a room of its
      // own (inputs.mjs), so this room's slot says nothing about them.
      return reply('audio.started', { ...(inst ? { ok: true, source: inst.source, jack: !!inst.jack, ...insertState() }
        : stopSynth ? { ok: true, source: 'synth', ...insertState() }
        : audio ? { ok: true, source: 'capture', ...insertState() }
        : { ok: false, reason: 'nothing playing', ...insertState() }), inputs: hwInputs.status(),
        // The sampler beside it, never in place of it (option b).
        sampler: samp ? samp.status() : { ok: false, available: samplerAvailable(), starting: !!sampStarting },
        plaits: plaits.status(),
        // The main socket's direct listeners, or null on a board without the library.
        direct: mainDirect ? mainDirect.status() : null });
    case 'sampler.cpu':
      return reply('sampler.cpu', samp ? { ok: true, ...(await samp.cpu()), voices: samp.status().voices } : { ok: false, reason: 'the sampler is not running' });
    // `pongAt`, not `at` (an envelope field once, and format() throws). Callers time the round trip
    // on
    // their own clock; the field only makes the reply more than an echo.
    // why: lessons/rig-board.md#board-ping
    case 'board.ping':    return reply('board.pong', { pongAt: Date.now() });

    // The OLED and its keys (panel.mjs), for /devices/text/: a tab's text drawn on the screen, and
    // a press or release sent to the room as `panel.key`. No screen answers `ok: false`.
    case 'oled.text': {
      if (!panel) return reply('oled.shown', { ok: false, why: 'no screen answered at 0x3c on this board' });
      if (screenTaken()) return reply('oled.shown', { ok: false, why: screenTaken() });
      panel.text(msg.text);
      return reply('oled.shown', { ok: true, text: panel.status().text });
    }
    // The dot piano on the same screen (/devices/dots/): a note on or off, sent and not asked, as keys are.
    case 'screen.note': { if (panel && !screenTaken()) { if (msg.panic) panel.panic(); else panel.note(Number(msg.n), !!msg.on); } return; }
    // A small patch for the screen (/devices/patches/), asked so the page can say it landed.
    case 'screen.patch.event': {
      if (!panel) return reply('screen.patched', { ok: false, why: 'no screen answered at 0x3c on this board' });
      panel.patchEvent(msg.links);
      return;
    }
    case 'screen.patch': {
      if (!panel) return reply('screen.patched', { ok: false, why: 'no screen answered at 0x3c on this board' });
      if (screenTaken()) return reply('screen.patched', { ok: false, why: screenTaken() });
      panel.patch(msg.patch);
      screenPatch = msg.patch && typeof msg.patch === 'object' ? msg.patch : null;
      return reply('screen.patched', { ok: true, nodes: msg.patch?.nodes?.length || 0 });
    }
    // A drum pattern and its playhead (/devices/drums/), sent per step and not asked; ask.mjs's reply is for a terminal.
    case 'screen.steps': {
      if (!panel) return reply('screen.stepped', { ok: false, why: 'no screen answered at 0x3c on this board' });
      // While the board's sequencer runs, the screen is its own: it draws from the board's clock.
      if (drumSeq.core.running()) return msg.ask ? reply('screen.stepped', { ok: false, why: 'the board\'s sequencer is running and draws the screen' }) : undefined;
      if (screenTaken()) return msg.ask ? reply('screen.stepped', { ok: false, why: screenTaken() }) : undefined;
      panel.steps(msg.steps);
      return msg.ask ? reply('screen.stepped', { ok: true, shown: panel.status().shown }) : undefined;
    }
    case 'panel.status': return reply('panel.status', panel ? { ok: true, ...panel.status() } : { ok: false, why: 'no screen on this board' });

    // jack.graph reads and writes nothing; jack.rebuild returns the graph before and after, so it
    // is a
    // diff. Each answers in its own name.
    // why: lessons/rig-board.md#jack-graph
    case 'jack.graph': {
      const g = jackGraph();
      const chain = jackChain({ instrumentPort: inst?.port, instrumentPortR: inst?.portR,
                                insert: fxOn, source: !!madeSource, graph: g });
      // What the board believes beside what the graph says: the pairing is the diagnosis.
      // why: lessons/rig-board.md#believes
      return reply('jack.graph', {
        ...g,
        believes: { source: inst?.source ?? null, port: inst?.port ?? null, portR: inst?.portR ?? null,
                    jack: !!inst?.jack, material: madeSource ? 'generated' : null, ...insertState() },
        chain,
      });
    }
    case 'jack.rebuild': {
      // The board cannot see listeners, so jack.rebuild is a diff (a healthy graph runs nothing),
      // kills
      // nothing, and says who asked and who else was heard in 15 s. No service-restart verb.
      // why: lessons/rig-board.md#rebuild
      const wantPlan = msg.plan === true || DRY;
      const others = [...clientSeen.entries()]
        .filter(([who, t]) => who !== msg.from && Date.now() - t < INSERT_HELD_MS)
        .map(([who, t]) => ({ by: who, heardAgoSec: Math.round((Date.now() - t) / 1000) }));
      // `ok: true, kept: true`, as fx.pappus refuses: a refusal on the caller's instruction is not
      // an error.
      // why: lessons/rig-board.md#kept
      if (!wantPlan && msg.onlyIfIdle === true && others.length) {
        return reply('jack.rebuild', {
          ok: true, kept: true, changed: 0, steps: [], others,
          chain: jackChain({ instrumentPort: inst?.port, instrumentPortR: inst?.portR,
                             insert: fxOn, source: !!madeSource }),
          reason: `${others.length} other client${others.length === 1 ? '' : 's'} heard from inside ${INSERT_HELD_MS / 1000} s`
                + '. Send jack.rebuild without onlyIfIdle to do it anyway',
        });
      }
      const r = jackRebuild({ instrumentPort: inst?.port, instrumentPortR: inst?.portR,
                              insert: fxOn, source: !!madeSource, plan: wantPlan,
                              onLog: (l) => log('jack:', l) });
      // One journal line: who asked, how many links moved, who else was in the room.
      // why: lessons/rig-board.md#journal
      log(`jack.rebuild${wantPlan ? ' (plan)' : ''} by ${msg.from ?? 'nobody'}: `
        + `${r.changed} link${r.changed === 1 ? '' : 's'} moved, ${others.length} other client(s) in the room`
        + `${r.reason ? `. ${r.reason}` : ''}`);
      return reply('jack.rebuild', { ...r, others, dry: DRY });
    }
    // jack.list (jack_lsp -c -p -t), jack.plan (steps and refusals, no change) and jack.apply
    // (graph read back, since jack_connect exits 1 for "already" and for failure). The board's
    // chain still wins.
    // why: lessons/rig-board.md#jack-list
    case 'jack.list': {
      const g = listJack();
      return reply('jack.list', { ok: !g.error, ...g });
    }
    case 'jack.plan': {
      const g = listJack();
      if (g.error) return reply('jack.planned', { ok: false, steps: [], problems: [g.error], backend: g.backend });
      return reply('jack.planned', { ...jackPlan(msg.patch, g.rows), backend: g.backend });
    }
    case 'jack.apply': {
      const g = listJack();
      if (g.error) return reply('jack.applied', { ok: false, applied: false, steps: [], problems: [g.error] });
      const planned = jackPlan(msg.patch, g.rows);
      if (!planned.ok) return reply('jack.applied', { ok: false, applied: false, ...planned });
      const others = [...clientSeen.entries()]
        .filter(([who, t]) => who !== msg.from && Date.now() - t < INSERT_HELD_MS)
        .map(([who, t]) => ({ by: who, heardAgoSec: Math.round((Date.now() - t) / 1000) }));
      if (!DRY && planned.steps.length && msg.onlyIfIdle === true && others.length) {
        return reply('jack.applied', { ok: true, kept: true, applied: false, steps: planned.steps, others,
          reason: `${others.length} other client${others.length === 1 ? '' : 's'} heard from inside ${INSERT_HELD_MS / 1000} s. Send jack.apply without onlyIfIdle to do it anyway` });
      }
      const r = jackApply(planned, { dry: DRY });
      log(`jack.apply by ${msg.from ?? 'nobody'}: ${planned.steps.map((x) => `${x.act} ${x.from} -> ${x.to}`).join(', ') || 'nothing to do'}`
        + `, read back ${r.ok ? 'agrees' : 'DISAGREES'}, ${others.length} other client(s) in the room`);
      return reply('jack.applied', { ...r, applied: !DRY, steps: planned.steps, doc: jackCanonical(msg.patch), others });
    }
    // jack.link / jack.unlink "<from> -> <to>" by announced ids, resolved into jackRows, applied,
    // read back. Held links survive re-patches; an unlink cuts only rows nothing else wants;
    // jack.links lists.
    // why: lessons/rig-board.md#jack-link
    case 'jack.link':
    case 'jack.unlink': {
      const unlink = msg.type === 'jack.unlink';
      // `link: "<from> -> <to>"`, never `from`/`to` fields: `from` is the envelope's sender.
      // why: lessons/rig-board.md#link-field
      const [fromId, toId] = String(msg.link ?? '').split(/\s*->\s*/);
      const answer = (body) => reply(unlink ? 'jack.unlinked' : 'jack.linked', { link: `${fromId} -> ${toId}`, ...body });
      const g = graphFacts ? graphOf(graphFacts) : null;
      const a = g?.ports.find((p) => p.id === fromId), b = g?.ports.find((p) => p.id === toId);
      const problems = [];
      if (!a) problems.push(`${fromId || '(nothing)'} is not a port this board announces`);
      if (!b) problems.push(`${toId || '(nothing)'} is not a port this board announces`);
      if (a && (a.dir !== 'out' || a.medium !== 'audio')) problems.push(`${a.id} is not an audio output`);
      if (b && (b.dir !== 'in' || b.medium !== 'audio')) problems.push(`${b.id} is not an audio input`);
      const jr = a && b ? jackRows(a.jack, b.jack) : null;
      if (jr && !jr.ok) problems.push(jr.why);
      if (problems.length) return answer({ ok: false, applied: false, problems });
      const key = `${a.id} -> ${b.id}`;
      const live = listJack();
      if (live.error) return answer({ ok: false, applied: false, problems: [live.error] });
      const flat = () => [...bayLinks.values()].flat();
      const sinks = [...new Set(jr.rows.map((r) => r.to))];
      const feeding = (rows) => Object.fromEntries(sinks.map((t) => [t, rows.find((r) => r.port === t)?.connected ?? null]));
      if (!unlink) {
        const planned = jackPlan({ v: 1, links: jr.rows }, live.rows);
        if (!planned.ok) {
          // Say which verb raises a missing end, rather than only that it is missing.
          const hint = planned.problems.some((p) => /SuperCollider/.test(p)) ? ' The granulator is not running: fx.pappus on raises it.'
            : planned.problems.some((p) => /posboard/.test(p)) ? ' The capture is not running: audio.start raises it.'
            : '';
          return answer({ ok: false, applied: false, rows: jr.rows, problems: planned.problems, hint: hint.trim() || null });
        }
        if (!DRY) { bayLinks.set(key, jr.rows); setBayRows(flat()); }
        const r = jackApply(planned, { dry: DRY });
        const after = DRY ? null : listJack().rows;
        log(`jack.link by ${msg.from ?? 'nobody'}: ${key}, ${jr.says}, ${planned.steps.length} step(s), read back ${r.ok ? 'agrees' : 'DISAGREES'}`);
        return answer({ ok: r.ok, applied: !DRY, rows: jr.rows, says: jr.says, steps: planned.steps,
                        after: r.after ?? null, feeding: after ? feeding(after) : null, held: bayLinks.size });
      }
      const had = bayLinks.delete(key);
      setBayRows(flat());
      // Rows still wanted by the board's own chain or another bay link stay.
      const chain = jackChain({ instrumentPort: inst?.port, instrumentPortR: inst?.portR, insert: fxOn,
                                source: !!madeSource, graph: { graph: live.rows } });
      const k = (r) => `${r.from}\u0000${r.to}`;
      const keep = new Set([...getBayRows().map(k), ...chain.want.map(([f, t]) => k({ from: f, to: t }))]);
      // Only a row that is really there is cut; one that never landed is not
      // reported as cut, or an unlink of nothing would read as work done.
      const cut = jr.rows.filter((r) => !keep.has(k(r)) && (live.rows.find((x) => x.port === r.to)?.connected ?? []).includes(r.from));
      // An owned input with everything it has now, minus the cut rows, is a
      // document that disconnects exactly those and nothing else.
      const cutSinks = [...new Set(cut.map((r) => r.to))].filter((t) => live.rows.some((x) => x.port === t));
      const doc = { v: 1, own: cutSinks, links: cutSinks.flatMap((t) => (live.rows.find((x) => x.port === t)?.connected ?? [])
        .filter((f) => !cut.some((c) => c.from === f && c.to === t)).map((f) => ({ from: f, to: t }))) };
      const planned = jackPlan(doc, live.rows);
      if (!planned.ok) return answer({ ok: false, applied: false, held: had, problems: planned.problems });
      const r = jackApply(planned, { dry: DRY });
      const after = DRY ? null : listJack().rows;
      log(`jack.unlink by ${msg.from ?? 'nobody'}: ${key}, ${planned.steps.length} step(s) cut, ${jr.rows.length - cut.length} row(s) kept because something else wants them`);
      return answer({ ok: r.ok, applied: !DRY, held: had, rows: jr.rows, cut, kept: jr.rows.filter((x) => keep.has(k(x))),
                      steps: planned.steps, feeding: after ? feeding(after) : null });
    }
    // The board's stop: stop all in its order (`level` silence or full, full by default) and the
    // read only check, which a stop answers with too.
    // why: lessons/rig-board-stop.md#verbs
    case 'board.stop': {
      if (!stopper) return reply('board.stopped', { ok: false, why: 'the board is still starting' });
      const r = await stopper.stop({ level: msg.level ?? 'full', asked: msg.from ?? null });
      return reply('board.stopped', { ...r, check: r.steps ? stopper.check({ level: r.level }) : null });
    }
    case 'board.check':
      if (!stopper) return reply('board.checked', { ok: false, why: 'the board is still starting' });
      return reply('board.checked', stopper.check({ level: msg.level === 'silence' ? 'silence' : 'full' }));
    case 'outputs.status': return reply('outputs.status', { ok: true, pwm: HAS_PWM, clients: outs.status(), level: outs.level().db ?? null });
    case 'pwm.level': return reply('pwm.level', outs.level(msg.db));
    case 'jack.links': {
      const live = listJack();
      const links = [...bayLinks.entries()].map(([link, rows]) => {
        const d = live.error ? null : jackDiff({ v: 1, links: rows }, live.rows);
        return { link, rows, intact: d ? d.intact : null, missing: d?.missing ?? null };
      });
      return reply('jack.links', { ok: !live.error, links, ...(live.error ? { error: live.error } : {}) });
    }
    default: return false;      // another client's traffic; the relay is verbatim
  }
}

// Reconnect forever, backing off with a cap.
// why: lessons/rig-board.md#backoff
let backoff = 500;
function connect() {
  log(`dialing ${URL_} as ${FROM}`);
  ws = new WebSocket(URL_);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    backoff = 500;
    lastHeard = Date.now();
    const s = state();
    log(`joined ${ROOM} · backend ${s.backend} · ${s.ports.length} ports${DRY ? ' · DRY' : ''}`);
    if (s.error) log(`  ALSA: ${s.error}${s.hint ? `\n  -> ${s.hint}` : ''}`);
    // `beat.mjs` has the shape and the `audioChannels` note. The facts are
    // gathered HERE and kept, because each instrument check is a `which` spawn
    // and the beat every five seconds should not be.
    const instruments = { synth: true, pappusFx: pappusAvailable(),
                          ...Object.fromEntries(Object.keys(JACK_SYNTHS).map((k) => [k, jackSynthAvailable(k)])),
                          sampler: samplerAvailable(),
                          // The page programs' scsynth (scollide.mjs), announced as
                          // `collide` and `drums` (graph-registry.mjs `boardGraph`).
                          collide: collideAvailable(),
                          // posplaits, built on this board (plaits/build.sh), announced as `plaits`.
                          plaits: plaitsAvailable() };
    // `jack`: this board has a JACK graph (the sampler, or an input on JACK), so its JACK ends are
    // announced.
    // why: lessons/rig-board.md#jack-announce
    const jack = samplerAvailable() || instruments.plaits || [...inputsCfg.inputs.values()].some((i) => i.via === 'jack');
    graphFacts = { room: ROOM, site: SITE, net: NET, instruments, inputs: inputsCfg.inputs, ports: s.ports, jack, plaitsParams: PLAITS_PARAMS,
                   // Patch names on each instrument's midi-in, for a `patch` transform (bay.mjs), in program order.
                   patches: { sampler: Object.values(SAMPLER_SETS).sort((a, b) => a.program - b.program).map((x) => x.name),
                              plaits: PLAITS_PATCHES.map((p) => p.name) },
                   // Drum maps on each drum instrument's midi-in, for a `drummap` transform (drum-maps.mjs).
                   drums: { circuit: DRUM_MAPS.circuit, drums: DRUM_MAPS.gm }, sequencer: true,
                   midiPresent: (port) => fsMod.existsSync(`/proc/asound/${port}`),
                   ...outputFacts({ pwm: HAS_PWM }),
                   frameMs: 1000 * FRAME / RATE, gpu: videoAvailable(), camera: cameraFound,
                   screens: () => hdmi.screens() };
    send(helloMsg({ name: NAME, id: BOARD_ID, backend: s.backend, ports: s.ports, dry: DRY, since,
                    frameMs: 1000 * FRAME / RATE, instruments, error: s.error, hint: s.hint, graphFacts,
                    direct: !!mainDirect?.direct, kbd: kbd.beat(), cdrums: cdrums.beat() }));
    if (ONCE) { console.log(JSON.stringify(s, null, 2)); setTimeout(() => process.exit(0), 400); }
  };
  ws.onmessage = (e) => {
    lastHeard = Date.now();                               // ANY frame proves the socket lives
    if (typeof e.data !== 'string') return;               // audio is ours, outbound only
    const { kind, msg } = parse(e.data);
    if (kind !== 'json' || msg.from === FROM) return;      // never answer yourself
    // Date every message, handled or not: it is the only evidence a client is still there.
    // why: lessons/rig-board.md#every-message
    if (typeof msg.from === 'string') {
      clientSeen.set(msg.from, Date.now());
      // Bounded, so a long-lived board does not accumulate every tab that ever
      // visited. Anything this old cannot hold an insert anyway.
      if (clientSeen.size > 64) {
        const cut = Date.now() - INSERT_HELD_MS;
        for (const [k, t] of clientSeen) if (t < cut) clientSeen.delete(k);
      }
    }
    // Direct-path signalling arrives here only, answered or refused out loud; a ctl channel cannot
    // open a peer.
    // why: lessons/rig-board.md#rtc
    if (msg.type === 'rtc.offer' || msg.type === 'rtc.candidate') {
      if (mainDirect) mainDirect.signalling(msg);
      else if (msg.type === 'rtc.offer') send({ type: 'rtc.refused', peer: msg.peer, why: 'this board has not finished starting, use the relay' });
      return;
    }
    // handle() is async, so a throw is a rejection; an unhandled one would take the service down.
    // why: lessons/rig-board.md#rejection
    Promise.resolve().then(() => handle(msg)).catch((err) => {
      log('handler threw:', err.message);
      send({ type: 'board.error', re: msg.id, error: err.message });
    });
  };
  ws.onclose = (e) => {
    clearInterval(ws.__watchdog);
    log(`closed ${e.code} — retrying in ${backoff} ms`);
    stopAudio();
    stopSampler();
    if (!ONCE) setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  };
  // A close always follows an error here, so retrying on both would double the
  // reconnects and halve the backoff.
  ws.onerror = () => {};

  // A dead socket does not always close: the relay echoes every message, so three missing
  // heartbeats
  // mean reconnect, whatever readyState says.
  // why: lessons/rig-board.md#watchdog
  ws.__watchdog = setInterval(() => {
    if (ws.readyState !== 1) return;
    if (Date.now() - lastHeard < 16000) return;
    log('no echo in 16 s -- socket dead but not closed. reconnecting.');
    try { ws.close(); } catch { /* already gone, which is the point */ }
  }, 4000);
  ws.__watchdog.unref?.();
}

// The heartbeat carries the insert and the graph (beat.mjs `aliveMsg`); sweepInsert sends the same
// object, one shape in one place.
// why: lessons/rig-board.md#alive
function alive() {
  return aliveMsg({ name: NAME, id: BOARD_ID, upSec: Math.round((Date.now() - since) / 1000),
                    audio: inst ? inst.source : stopSynth ? 'synth' : audio ? 'capture' : null,
                    voices: synth?.voices ?? 0, frames: sentFrames, insert: insertState(), graphFacts,
                    direct: !!mainDirect?.direct, kbd: kbd.beat(), cdrums: cdrums.beat() });
}
setInterval(() => {
  // Sweep before the beat, so no heartbeat announces an orphaned insert. `.catch` because it is not
  // awaited.
  // why: lessons/rig-board.md#sweep-first
  sweepInsert('the page that asked for it stopped talking')
    .catch((e) => log('the insert sweep threw:', e.message));
  mainDirect?.sweep();
  send(alive());
}, 5000).unref?.();

// The control plane's report, once a second and only while something moves.
// why: lessons/rig-board.md#ctl-said
// The keyboard link's state, once a second and only while it forwards, so a page's counts move.
// why: lessons/rig-board-keyboard.md#board
let kbdSaid = -1;
setInterval(() => {
  const b = kbd.beat();
  if (!b.held || b.forwarded === kbdSaid) return;
  kbdSaid = b.forwarded;
  send({ type: 'kbd.state', ...kbd.status() });
}, 1000).unref?.();
// The Circuit drums link's state, once a second while hits go through it.
let cdrumsSaid = -1;
setInterval(() => {
  const b = cdrums.beat();
  if (!b.held || b.played + b.refused === cdrumsSaid) return;
  cdrumsSaid = b.played + b.refused;
  send({ type: 'cdrums.state', ...cdrums.status() });
}, 1000).unref?.();
let ctlSaid = { in: 0, out: 0 };
setInterval(() => {
  if (ctl.in === ctlSaid.in && ctl.out === ctlSaid.out) return;
  ctlSaid = { in: ctl.in, out: ctl.out };
  send({ type: 'ctl.meter', ...ctlMeter() });
}, 1000).unref?.();

// Sweep orphaned audio children at startup (they survive a service restart and collide with the new
// chain). `pkill -x`, never `-f`, which would match this process.
// why: lessons/rig-board.md#sweep-orphans
function sweepOrphans() {
  // Names nothing here starts any more stay listed: an old build's process can still hold JACK or a
  // device after a restart. `alsa_in` holds its card while it runs.
  // why: lessons/rig-board.md#orphan-names
  for (const name of ['fluidsynth', 'jack-dssi-host', 'yoshimi', 'sclang', 'scsynth', 'posplaits', 'csound', 'ffmpeg', 'alsa_in', 'alsa_out', 'jack_metro', 'jackd']) {
    try { execFileSync('pkill', ['-9', '-x', name], { stdio: 'pipe' }); log(`swept a stray ${name}`); }
    catch { /* nothing of that name, which is the normal case */ }
  }
}
if (backend() === 'alsa') sweepOrphans();
// Stray video encoders are swept separately: `pkill -x ffmpeg` later would kill the audio capture
// too.
// why: lessons/rig-board.md#encoders
sweepStrayEncoders((l) => log('video:', l));

// The Pi camera, joined in `<room>-cam` with BOARD_CAM_KEY, started only for a viewer the relay
// admitted.
// why: lessons/rig-board.md#camera
const camera = (DRY || ONCE) ? null : createCameraRoom({
  relay: RELAY, room: `${ROOM}-cam`, key: process.env.BOARD_CAM_KEY || '',
  log: (l) => log(l), encoderBusy: () => !!video,
  held: () => (hdmi.showing() === 'camera' ? 'the camera is on the Pi\'s HDMI screen (/devices/hdmi/), so it waits until hdmi.stop' : ''),
  size: {
    w: Math.min(Number(process.env.BOARD_CAM_W) || 1280, 1920),
    h: Math.min(Number(process.env.BOARD_CAM_H) || 720, 1080),
    fps: Math.min(Number(process.env.BOARD_CAM_FPS) || 30, 30),
    bitrate: Math.min(Number(process.env.BOARD_CAM_BITRATE) || 1_500_000, 4_000_000),
  },
});
// The camera on the OLED (/devices/camera/), keyed in the same `<room>-cam` and never while the H.264 picture runs.
// why: lessons/rig-board-panel.md#screen-camera
const screenCam = (DRY || ONCE) ? null : createScreenCamera({
  relay: RELAY, room: `${ROOM}-cam`, key: process.env.BOARD_CAM_KEY || '',
  log: (l) => log(l), panel: () => (screenTaken() ? null : panel), cameraBusy: () => !!camera?.running(),
  held: () => (hdmi.showing() === 'camera' ? 'the camera is on the Pi\'s HDMI screen (/devices/hdmi/), so the OLED waits' : ''),
});

// The HDMI0 screen (hdmi.mjs): one show at a time into /dev/fb0, refused while camera.mjs or the
// OLED's camera holds the camera, or another program holds the screen.
const hdmi = createHdmi({ spawn, findCamera: () => findCamera(), log: (l) => log(l),
  cameraBusy: () => (camera?.running() ? 'the camera is streaming its picture to /remote/circuit/, so the screen waits'
    : screenCam?.running() ? 'the camera is on the Pi\'s OLED (/devices/camera/), so the screen waits' : ''),
  oledFrame: () => panel?.lastFrame?.() ?? null });
mirrorFrame = (fb) => hdmi.frame(fb);

// Announce `pi-1:camera` only with a key and a camera found, asked once (findCamera spawns
// synchronously).
// why: lessons/rig-board.md#camera-found
const cameraFound = !!camera?.enabled && findCamera().ok === true;
if (camera?.enabled) log(`camera: ${cameraFound ? 'found, announced as camera' : 'none found, so none is announced'}`);

// Hardware inputs, each in its own room, from BOARD_INPUTS; a bad entry is reported and skipped.
// why: lessons/rig-board.md#inputs
const inputsCfg = parseInputs(process.env.BOARD_INPUTS || '');
const HAS_PWM = fsMod.existsSync('/proc/asound/Headphones');
for (const p of inputsCfg.problems) log('inputs:', p);
// jackd on an input's card, set before anything can raise jackd.
// why: lessons/rig-board.md#jackd-card
{
  const c = [...inputsCfg.inputs.values()].find((i) => i.jackd);
  setJackCard(c ? { name: c.name, device: c.device, channels: c.channels, ...c.jackd } : null);
  if (c) log(`inputs: jackd runs on ${c.device}, so ${c.name} is the clock`);
}
// The direct path is optional (node-datachannel); without it the board runs on the relay only.
// why: lessons/rig-board.md#peer
let PeerConnection = null;
try { PeerConnection = (await import('node-datachannel')).default.PeerConnection; log('direct path available (node-datachannel)'); }
catch (e) { log('no direct path, node-datachannel is not installed:', e.code || e.message); }

// The main socket answers offers too, with the same handler as the relay; each ctl peer gets a
// `from`
// and is dated in clientSeen.
// why: lessons/rig-board.md#main-direct
mainDirect = createMainDirect({
  PeerConnection, signal: send, frame: FRAME, rate: RATE, log: (...a) => log('direct:', ...a),
  handle: (m, reply, peer) => {
    const from = typeof m.from === 'string' ? m.from : `rtc-${peer}`;
    clientSeen.set(from, Date.now());
    // The shader picture on this peer's `vid` channel (sendFrame above). Over
    // `ctl` only, because only `ctl` knows which peer asked.
    if (m.type === 'video.direct') return videoDirect(reply, peer);
    if (m.type === 'video.relay') { videoDirects.delete(peer); return reply('video.relay', { ok: true }); }
    return handle({ ...m, from }, reply);
  },
  channels: ['vid'],
  onChannelClosed: (p, label) => { if (label === 'vid' && videoDirects.delete(p.id)) log(`video: ${p.id} back on the relay, its channel closed`); },
});
setCaptureUnit((u) => mainDirect.unit(u));
const hwInputs = createInputs({
  inputs: inputsCfg.inputs, room: ROOM, relay: RELAY, frame: FRAME, rate: RATE, name: NAME, id: BOARD_ID,
  spawn, WebSocket, format, parse, randomId, fs: fsMod, log: (...a) => log('input', ...a), PeerConnection,
  // The camera's frames may ride a page's direct link to an input, behind the camera's own two
  // gates.
  // why: lessons/rig-board.md#camera-direct
  camera,
  // Only an input configured `via: "jack"` touches this (inputs.mjs).
  jack: { ensure: () => ensureJackd({ onLog: (l) => log('input', l) }),
          wire: (doc, what) => jackWire(doc, { onLog: (l) => log('input', l), what }) },
});
if (!DRY && !ONCE) hwInputs.start();
// The Pi 4's PWM output, on the JACK graph beside jackd's card (outputs.mjs).
const outs = createOutputs({ pwm: HAS_PWM, spawn,
  run: (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), log: (...a) => log('output', ...a),
  jack: { ensure: () => ensureJackd({ onLog: (l) => log('output', l) }) } });
if (!DRY && !ONCE && backend() === 'alsa') outs.start();

// The stop calls the board's own verbs and the same calls `note.panic` and the SIGTERM handler make.
// why: lessons/rig-board-stop.md#board
const quiet = () => {};
const circuitIn = () => hwInputs.get('circuit');
stopper = createStop({
  sequencer: { stop: () => drumSeq.handle({ type: 'seq.stop', from: 'board.stop' }, quiet), running: () => drumSeq.core.running() },
  keyboard: { release: () => kbd.handle({ type: 'kbd.unlink', from: 'board.stop' }, quiet), held: () => kbd.beat().held },
  circuitDrums: { release: () => cdrums.handle({ type: 'cdrums.unlink', from: 'board.stop' }, quiet), held: () => cdrums.held() },
  circuit: circuitIn()?.status().midi ? {
    panic: () => { let n = 0; circuitIn()?.handle({ type: 'midi.panic' }, (type, body) => { n = body?.n ?? 0; }); return n; },
    allOff: (ch) => { let why = ''; circuitSend([0xB0 | (ch - 1), 123, 0], (w) => { why = w || 'refused'; }); return why; },
    held: () => circuitIn()?.status().midi?.held ?? null,
  } : null,
  engines: [
    { name: 'instrument', up: () => !!(inst || stopSynth || audio), held: () => null, down: () => stopAudio(),
      panic: () => { inst?.panic(); synth?.allOff(); if (fxOn) pappusPanic(); pap?.notes.panic(); } },
    { name: 'collide', up: () => !!collide.core(), held: () => collide.core()?.stats().live ?? 0, panic: () => collide.core()?.panic(), down: () => collide.stop() },
    { name: 'plaits', up: () => !!plaits.core(), held: () => plaits.core()?.stats().held ?? 0, panic: () => plaits.core()?.panic(), down: () => plaits.stop() },
    { name: 'sampler', up: () => !!samp, held: () => null, panic: () => samp?.panic(), down: () => stopSampler() },
  ],
  jack: {
    held: () => [...bayLinks.keys()],
    unlink: async (link) => { let got = null; await handle({ type: 'jack.unlink', link, from: 'board.stop' }, (type, body) => { got = body; }); return got; },
  },
  // Anything still on the output after the board's own links are cut (a jack.apply, say) is cut too.
  output: HAS_PWM ? {
    ports: PWM_PORTS,
    read: () => listJack(),
    cut: () => {
      const g = listJack();
      const planned = jackPlan({ v: 1, own: PWM_PORTS.filter((p) => g.rows.some((r) => r.port === p)), links: [] }, g.rows);
      if (!planned.ok) { log(`stop: the output could not be cut, ${planned.problems.join('; ')}`); return planned; }
      log(`stop: cutting what was left on the output, ${planned.steps.map((x) => `${x.from} -> ${x.to}`).join(', ')}`);
      return jackApply(planned, { dry: DRY });
    },
  } : null,
  screen: { stopped: () => { if (panel) panel.text('all stopped\nengines down'); } },
  displays: [{ name: 'hdmi', showing: () => hdmi.showing(), stop: () => hdmi.stop('the board stopped everything') }],
  log: (l) => log(l),
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { drumSeq.stop(); kbd.stop(); cdrums.stop(); camera?.stop(); screenCam?.stop(); hdmi.stop('the board is stopping'); stopAudio(); collide.stop(); plaits.stop(); stopSampler(); hwInputs.close(); outs.close(); mainDirect?.close(); try { ws?.close(); } catch {} process.exit(0); });
connect();
