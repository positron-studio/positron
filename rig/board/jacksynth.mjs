// Instruments that are JACK clients: jackd (dummy clock or the card) -> the synth -> ffmpeg -f jack
// capture (raw s16 on stdout into the board). MIDI in by writing raw bytes to a snd-virmidi device
// that aconnect routes to the synth's sequencer port.
// why: lessons/rig-board-synth.md#js-header
import { spawn, execFileSync, execSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { openSync, writeSync, closeSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
// Every JACK connection goes through jack.mjs: a small document planned against the graph, applied,
// and read back.
// why: lessons/rig-board-synth.md#js-jack-mjs
import { sourcesOf as alsaSourcesOf } from './alsa.mjs';
import { parseJackLsp, listJack, plan as jackPlan, apply as jackApply, diff as jackDiff, setPortNames } from './jack.mjs';
export { parseJackLsp };

export const RATE = 48000, FRAME = 960;

// A minimal OSC encoder for sclang's /pappus/cmd OSCdef on 57120: address, typetag, args, each
// null-terminated and padded to four.
// why: lessons/rig-board-synth.md#osc
function oscPad(buf) {
  const pad = 4 - (buf.length % 4 || 4);
  return pad === 4 ? buf : Buffer.concat([buf, Buffer.alloc(pad)]);
}
function oscStr(str) { return oscPad(Buffer.concat([Buffer.from(str, 'ascii'), Buffer.alloc(1)])); }
export function oscMessage(address, args = []) {
  // A Uint8Array is a blob `b`: int32 length, bytes, padded to four (for /d_recv).
  // why: lessons/rig-board-synth.md#blob
  const isBlob = (a) => a instanceof Uint8Array;
  const tags = ',' + args.map((a) => (typeof a === 'string' ? 's' : isBlob(a) ? 'b' : Number.isInteger(a) ? 'i' : 'f')).join('');
  const parts = [oscStr(address), oscStr(tags)];
  for (const a of args) {
    if (typeof a === 'string') { parts.push(oscStr(a)); continue; }
    if (isBlob(a)) {
      const n = Buffer.alloc(4); n.writeInt32BE(a.length);
      parts.push(n, oscPad(Buffer.from(a.buffer, a.byteOffset, a.length)));
      continue;
    }
    const b = Buffer.alloc(4);
    if (Number.isInteger(a)) b.writeInt32BE(a); else b.writeFloatBE(a);
    parts.push(b);
  }
  return Buffer.concat(parts);
}

/** Seconds from 1900 to 1970, which is where an OSC timetag counts from. */
export const NTP_EPOCH_OFFSET = 2208988800;
// An OSC timetag for epoch ms, [seconds, fraction] as uint32, computed in ms so the fraction keeps
// its
// digits (same arithmetic as demo/shell/scsynth.mjs ntpOf). null is "immediately", [0, 1].
// why: lessons/rig-board-synth.md#ntp
export function ntpTimetag(atMs) {
  if (atMs == null) return [0, 1];
  const whole = Math.floor(atMs / 1000);
  const frac = Math.min(0xFFFFFFFF, Math.round(((atMs - whole * 1000) / 1000) * 4294967296));
  return [whole + NTP_EPOCH_OFFSET, frac];
}
// An OSC bundle: `#bundle`, the timetag, then int32-sized elements. scsynth runs it at the timetag,
// so
// everything in it starts in one sample.
// why: lessons/rig-board-synth.md#bundle
export function oscBundle(timetag, messages) {
  const [sec, frac] = Array.isArray(timetag) ? timetag : ntpTimetag(timetag);
  const head = Buffer.alloc(16);
  head.write('#bundle\0', 0, 'ascii');
  head.writeUInt32BE(sec >>> 0, 8);
  head.writeUInt32BE(frac >>> 0, 12);
  const parts = [head];
  for (const [address, ...args] of messages) {
    const m = oscMessage(address, args);
    const n = Buffer.alloc(4); n.writeInt32BE(m.length);
    parts.push(n, m);
  }
  return Buffer.concat(parts);
}


const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); } catch { return ''; } };
const have = (bin) => { try { execFileSync('which', [bin], { stdio: 'pipe' }); return true; } catch { return false; } };

// The audio path's port names, once. `posboard` is the ffmpeg capture's JACK client: what is summed
// into `posboard:input_1` is what a page hears.
// why: lessons/rig-board-synth.md#ports
const CAP_CLIENT = 'posboard';
const CAP = `${CAP_CLIENT}:input_1`;
const SCIN = 'SuperCollider:in_1', SCIN2 = 'SuperCollider:in_2';
const SCOUT = 'SuperCollider:out_1', SCOUT2 = 'SuperCollider:out_2';

// Patch the graph to a document and report; never throws. An owned input also loses any other
// source feeding it (a stray summed into the capture is indistinguishable from the instrument), and
// a plan naming a missing port applies nothing.
// why: lessons/rig-board-synth.md#wire
export function wire(doc, { onLog, what = 'jack' } = {}) {
  const g = listJack();
  if (g.error) { onLog?.(`${what}: ${g.error}, nothing patched`); return { ok: false, planned: null, ran: [], reason: g.error }; }
  // The bay's links ride on every re-patch, so an owned input keeps a bay link into it.
  // why: lessons/rig-board-synth.md#bay-rides
  const planned = jackPlan(withBay(doc, g.rows), g.rows);
  if (!planned.ok) {
    onLog?.(`${what}: refused, ${planned.problems.join('; ')}`);
    return { ok: false, planned, ran: [], reason: planned.problems.join('; ') };
  }
  const r = jackApply(planned);
  for (const s of r.ran) if (s.said) onLog?.(`${what}: ${s.act} ${s.from} -> ${s.to} (${s.said})`);
  if (!r.ok) onLog?.(`${what}: read back disagrees, missing ${JSON.stringify(r.after.missing)} extra ${JSON.stringify(r.after.extra)}`);
  return { ...r, planned };
}
const l = (from, to) => ({ from, to });

// A bay link is part of what the board believes: wire() adds its rows to every document and
// jackChain
// wants them, so fx.pappus and jack.rebuild keep them. Missing ports are skipped; in memory only.
// why: lessons/rig-board-synth.md#bay-rows
let bayRows = [];
export function setBayRows(rows) { bayRows = Array.isArray(rows) ? rows.map((r) => l(r.from, r.to)) : []; }
export function getBayRows() { return bayRows.map((r) => l(r.from, r.to)); }
// An engine that sounds beside the instrument (the sampler) names its standing links, kept on every
// re-patch; only that engine removes them, by setting its name to [].
// why: lessons/rig-board-synth.md#standing
const standing = new Map();
export function setStandingRows(name, rows) {
  if (Array.isArray(rows) && rows.length) standing.set(name, rows.map((r) => l(r.from, r.to)));
  else standing.delete(name);
}
export function getStandingRows() { return [...standing.values()].flat().map((r) => l(r.from, r.to)); }
const present = (rows, port) => rows.some((r) => r.port === port);
const bayOnGraph = (rows) => [...bayRows, ...getStandingRows()].filter((r) => present(rows, r.from) && present(rows, r.to));
function withBay(doc, rows) {
  const extra = bayOnGraph(rows);
  return extra.length ? { ...doc, links: [...(doc.links ?? []), ...extra] } : doc;
}

// jackd on the card: one clock, no resampler (alsa_in resampling read up to -18.8 dBFS of noise).
// `card` comes from BOARD_INPUTS; capture (-C), and playback (-P) when its jackd says `playback`.
// `-r` before -d is no-realtime, after it the rate.
// why: lessons/rig-board-synth.md#card
let CARD = null;
export function setJackCard(card) { CARD = card ?? null; }
export function jackdArgs(card) {
  if (!card) return ['-r', '-d', 'dummy', '-r', String(RATE), '-p', '1024'];
  return ['-r', '-d', 'alsa', '-C', card.device, ...(card.playback ? ['-P', card.device] : []), '-r', String(RATE), '-p', String(card.period), '-n', String(card.periods)];
}
// JACK_NO_AUDIO_RESERVATION: a service has no D-Bus session bus, so jackd could not reserve the
// card.
// why: lessons/rig-board-synth.md#no-reservation
export const JACKD_ENV = { JACK_NO_AUDIO_RESERVATION: '1' };
/** The card's capture ports shown by the input's name (`jack.mjs` `setPortNames`). */
export function cardPortNames(card) {
  if (!card) return {};
  return Object.fromEntries(Array.from({ length: card.channels }, (_, i) => [`system:capture_${i + 1}`, `${card.name}:capture_${i + 1}`]));
}
/** Whether a running jackd, by its `pgrep -a` line, is the one on this card. */
export function jackdOwns(cmdline, card) {
  if (!card || !cmdline) return false;
  const words = cmdline.split(/\s+/);
  // A capture only server is not the one a playback card asks for, nor the other way round.
  return /\s-d\s+alsa\b/.test(cmdline) && words.includes(card.device) && words.includes('-P') === !!card.playback;
}
/** jackd's own xrun lines, counted. The memory-lock complaint is not one. */
export function countXruns(text) {
  return String(text).split('\n').filter((l) => /xrun/i.test(l) && !/^Cannot lock down/.test(l.trim())).length;
}
const jackdState = { xruns: 0, card: null, since: null, lines: 0 };
export const jackdStats = () => ({ ...jackdState });

// jackd, raised if JACK does not answer; shared with the inputs on JACK. Returns the clock card or
// null.
// why: lessons/rig-board-synth.md#ensure-jackd
// Callers at the same moment share one attempt: a second one's `pkill -9 -x jackd` would kill the
// server the first is still raising.
let jackdRaising = null;
export function ensureJackd(o = {}) {
  if (!jackdRaising) jackdRaising = raiseJackd(o).finally(() => { jackdRaising = null; });
  return jackdRaising;
}
async function raiseJackd({ onLog } = {}) {
  // Ask JACK (jack_lsp), not the process table: pgrep finds servers this process may not reach.
  // why: lessons/rig-board-synth.md#ask-jack
  if (sh('jack_lsp 2>/dev/null').trim()) {
    const owns = jackdOwns(sh('pgrep -ax jackd 2>/dev/null').split('\n')[0], CARD);
    setPortNames(cardPortNames(owns ? CARD : null));
    return { ok: true, started: false, card: owns ? CARD.name : null };
  }
  sh('pkill -9 -x jackd 2>/dev/null');            // a server we cannot reach is worse than none
  await wait(400);
  // The card first, the dummy clock second, so an unplugged card does not cost the instrument its
  // server.
  // why: lessons/rig-board-synth.md#card-first
  for (const card of CARD ? [CARD, null] : [null]) {
    const p = spawn('jackd', jackdArgs(card), { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, ...JACKD_ENV } });
    p.unref();
    const said = [];
    let gone = false;
    const hear = (d) => {
      const t = String(d);
      const n = countXruns(t);
      jackdState.xruns += n;
      for (const l of t.split('\n').map((x) => x.trim()).filter((x) => x && !/^Cannot lock down/.test(x))) {
        said.push(l);
        // The card unplugged: jackd stops its cycle and hangs rather than exiting, and every client with it
        // (12 min on 2026-11-11). Killed, the clients' restarts raise it again on the dummy clock.
        // why: lessons/venue-setup.md#the-fast-tracks-usb-is-the-pis-whole-audio
        if (card && !gone && /No such device|ProcessAsync: read error, stopping/.test(l)) {
          gone = true;
          onLog?.(`jackd: ${card.device} went away, stopping jackd so the dummy clock takes over`);
          try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch { /* gone */ } }
        }
        // Every line for the first 40, then only xruns, one in fifty.
        jackdState.lines++;
        if (jackdState.lines <= 40 || (/xrun/i.test(l) && jackdState.xruns % 50 === 1)) onLog?.(`jackd: ${l.slice(0, 200)}${/xrun/i.test(l) ? ` (xruns ${jackdState.xruns})` : ''}`);
      }
    };
    p.stdout?.on('data', hear); p.stderr?.on('data', hear);
    p.stdout?.unref?.(); p.stderr?.unref?.();
    let exited = false;
    p.on('exit', (code, sig) => { exited = true; onLog?.(`jackd exited (${sig ?? code})`); });
    // Poll rather than sleep a guessed amount: 2.5 s was enough on a warm board
    // and not on a cold one, which is the worst kind of timing constant.
    let up = false;
    for (let i = 0; i < 20 && !up && !exited; i++) { await wait(500); up = !!sh('jack_lsp 2>/dev/null').trim(); }
    if (up) {
      setPortNames(cardPortNames(card));
      Object.assign(jackdState, { card: card?.name ?? null, since: Date.now(), xruns: 0 });
      onLog?.(card ? `jackd up on ${card.device}, period ${card.period} x ${card.periods}: ${card.name} is the clock`
                   : `jackd up${CARD ? `, on the dummy clock because ${CARD.device} would not open` : ''}`);
      return { ok: true, started: true, card: card?.name ?? null };
    }
    try { p.kill('SIGKILL'); } catch { /* gone */ }
    if (card) onLog?.(`jackd would not start on ${card.device}: ${said.slice(-2).join(' / ') || 'nothing said'}`);
    await wait(400);
  }
  setPortNames({});
  return { ok: false, reason: 'jackd would not start' };
}

// The instruments this module can raise. One jackd, one capture, one room, so one instrument.
// Pappus
// is an insert, not an instrument (see pappusFx()).
// why: lessons/rig-board-synth.md#jack-synths
export const JACK_SYNTHS = {
  // Empty of Yoshimi on purpose: its entry is in archive/yoshimi/jacksynth-entry.mjs, and this
  // table
  // stays so a JACK synth is one entry again.
  // why: lessons/rig-board-synth.md#empty

  // An archive source played ERR's 1965 radio here; it is in archive/box-pappus/.
  // why: lessons/rig-board-synth.md#archive-source
};

// Pappus as an insert: off, instrument L+R -> posboard; on, L+R -> SuperCollider:in_1/in_2,
// out_1/out_2 -> posboard. The engine keeps running while bypassed (it compiles for half a minute);
// bypass is a re-patch. Both channels both ways, or a dry right channel sits under the granulator.
// why: lessons/rig-board-synth.md#pappus-fx
let pappusProc = null;
// A JACK port is not a ready engine: commands sent before `PAPPUS READY` (about seven seconds
// later)
// vanish. The engine prints it last, after run-pappus.scd's startup settings.
// why: lessons/rig-board-synth.md#pappus-ready
let pappusReady = false;

export function pappusAvailable() {
  return ['sclang', 'jackd'].every(have) && existsSync('/opt/positron-board/rig/board/norns/run-pappus.scd');
}

export async function pappusFx(on, { instrumentPort, instrumentPortR, onLog } = {}) {
  if (!on) {
    // The instrument straight into the capture, and the capture and the
    // granulator's inputs owned, so the insert's return and the instrument's
    // feed into it are both cut. An absent `SuperCollider:in_*` is skipped.
    let w = null;
    if (instrumentPort) {
      w = wire({ v: 1,
        links: [l(instrumentPort, CAP), ...(instrumentPortR ? [l(instrumentPortR, CAP)] : [])],
        own: [CAP, SCIN, SCIN2] }, { onLog, what: 'pappus bypass' });
    }
    onLog?.('pappus bypassed');
    return { ok: true, on: false, ...(w ? { wired: w.ok } : {}) };
  }
  if (!pappusAvailable()) return { ok: false, reason: 'supercollider or the engine is not installed' };

  if (!sh('jack_lsp 2>/dev/null').includes('SuperCollider')) {
    const rt = '/tmp/rt';
    try { mkdirSync(rt, { recursive: true, mode: 0o700 }); } catch { /* there already */ }
    pappusProc = spawn('sclang', ['/opt/positron-board/rig/board/norns/run-pappus.scd'], {
      // No autoconnect: with jackd on the card, scsynth would patch the Circuit into the granulator
      // unasked.
      // why: lessons/rig-board-synth.md#no-autoconnect
      env: { ...process.env, XDG_RUNTIME_DIR: rt, QT_QPA_PLATFORM: 'offscreen', QTWEBENGINE_DISABLE_SANDBOX: '1',
             SC_JACK_DEFAULT_INPUTS: 'posnothing:none', SC_JACK_DEFAULT_OUTPUTS: 'posnothing:none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    pappusReady = false;
    pappusProc.stdout?.on('data', (d) => {
      for (const l of String(d).split('\n')) {
        const t = l.trim();
        if (!t || /^(sc3>|->)/.test(t)) continue;
        // Guard on the exact line the engine prints, not on a substring of it.
        if (/^PAPPUS READY\b/.test(t)) pappusReady = true;
        onLog?.(t);
      }
    });
    pappusProc.stderr?.on('data', (d) => onLog?.(String(d).trim()));
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { await wait(500); up = sh('jack_lsp 2>/dev/null').includes('SuperCollider:out_1'); }
    if (!up) { pappusProc?.kill(); pappusProc = null; return { ok: false, reason: 'the pappus engine did not come up' }; }
    // ...and now wait for the engine itself. 60 s: a Pi 4 takes about seven
    // from the port appearing, and the cost of waiting too long is a slow
    // switch while the cost of not waiting is a silent one.
    for (let i = 0; i < 120 && !pappusReady; i++) await wait(500);
    if (!pappusReady) { stopPappus(); return { ok: false, reason: 'the engine came up but never reported READY' }; }
  } else {
    // An sclang already running (another process, or before a restart) is treated as ready.
    // why: lessons/rig-board-synth.md#adopted
    pappusReady = true;
  }

  // Insert both channels each way and capture both granulator outputs (it pans), summed mono in
  // JACK.
  // With no instrument the inputs are not owned.
  // why: lessons/rig-board-synth.md#insert
  const w = wire({ v: 1,
    links: [
      ...(instrumentPort ? [l(instrumentPort, SCIN)] : []),
      ...(instrumentPortR ? [l(instrumentPortR, SCIN2)] : []),
      l(SCOUT, CAP), l(SCOUT2, CAP),
    ],
    own: instrumentPort ? [CAP, SCIN, ...(instrumentPortR ? [SCIN2] : [])] : [] }, { onLog, what: 'pappus insert' });
  onLog?.(instrumentPort
    ? `pappus inserted${instrumentPortR ? '' : ' (mono source — no right channel)'}`
    : 'pappus running, nothing feeding it');
  return { ok: true, on: true, fed: !!instrumentPort, stereo: !!instrumentPortR, ready: pappusReady, wired: w.ok };
}

// Unplug the instrument from the granulator's input while generated material plays: scsynth sums
// JACK into its input bus. Unplugged, not stopped, since posboard belongs to the instrument's
// chain.
// why: lessons/rig-board-synth.md#source-feed
export function sourceFeed(on, { instrumentPort, instrumentPortR, onLog } = {}) {
  if (!instrumentPort) return { ok: true, instrument: null, fed: false };
  // `on` means the generated source is the material; both channels; it owns only the granulator's
  // inputs.
  // why: lessons/rig-board-synth.md#pairs
  const pairs = [[instrumentPort, SCIN], ...(instrumentPortR ? [[instrumentPortR, SCIN2]] : [])];
  const w = wire({ v: 1, links: on ? [] : pairs.map(([p, bus]) => l(p, bus)), own: pairs.map(([, bus]) => bus) },
                 { onLog, what: 'source feed' });
  const said = [w.reason ?? '', ...w.ran.map((s) => s.said ?? '')];
  onLog?.(on ? `${instrumentPort} unplugged from the granulator` : `${instrumentPort} feeding the granulator again`);
  // jack_connect answers non-empty on failure AND on "already connected"; the
  // second is not an error, so the text travels rather than a boolean nobody
  // can interpret.
  return { ok: true, instrument: instrumentPort, fed: !on, said: said.join(' ').trim() || null, wired: w.ok };
}

export function pappusOsc(cmdName, ...args) {
  const m = oscMessage('/pappus/cmd', [cmdName, ...args]);
  const u = createSocket('udp4');
  u.send(m, 0, m.length, 57120, '127.0.0.1', () => u.close());
  return true;
}


// The roll and drift live in pappus.mjs; pappusOsc below is the panic path.
// why: lessons/rig-board-synth.md#roll-moved

// Silence the insert too: bufclear and delayclear, since its buffer, taps and tail keep sounding.
// why: lessons/rig-board-synth.md#panic
export function pappusPanic() {
  pappusOsc('bufclear', 1);
  pappusOsc('delayclear', 1);
  // The reverb has no clear: collapse its time, then restore it.
  // why: lessons/rig-board-synth.md#rtime
  pappusOsc('rtime', 0.2);
  setTimeout(() => pappusOsc('rtime', 2.5), 900);
  return true;
}

export function stopPappus() {
  pappusReady = false;
  if (pappusProc) { try { pappusProc.kill('SIGTERM'); } catch { /* gone */ } pappusProc = null; }
  // Kill scsynth by pid, keeping KEEP_SC_PORTS (the sampler, poscollide): a name match would kill
  // them.
  // why: lessons/rig-board-synth.md#kill-pids
  for (const pid of pappusScsynthPids(sh('pgrep -ax scsynth 2>/dev/null'))) sh(`kill -9 ${pid} 2>/dev/null`);
  sh('pkill -9 -x sclang 2>/dev/null');
}

/** The sampler's scsynth listens here and nowhere else (`scsampler.mjs`). */
export const SAMPLER_SC_PORT = 57130;
/** The page programs' own scsynth, `poscollide`, when it has one (`scollide.mjs`). */
export const COLLIDE_SC_PORT = 57131;
// Every scsynth the granulator does not own, by port; an unused port matches nothing.
// why: lessons/rig-board-synth.md#keep-ports
export const KEEP_SC_PORTS = Object.freeze([SAMPLER_SC_PORT, COLLIDE_SC_PORT]);
// The pids stopPappus may kill, from `pgrep -ax scsynth`; pure, so it is graded without a board.
// why: lessons/rig-board-synth.md#scsynth-pids
export function pappusScsynthPids(pgrepAx, keepPorts = KEEP_SC_PORTS) {
  const keep = [keepPorts].flat().map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return String(pgrepAx).split('\n').map((x) => x.trim()).filter(Boolean)
    .filter((line) => !keep.some((port) => new RegExp(`(^|\\s)-u\\s+${port}(\\s|$)`).test(line)))
    .map((line) => Number(line.split(/\s+/)[0])).filter((n) => Number.isInteger(n) && n > 0);
}

export function jackSynthAvailable(name) {
  const d = JACK_SYNTHS[name];
  return !!d && d.needs.every(have);
}

// The JACK audio graph, readable over the relay (ports.get is only MIDI). jackGraph and jackChain
// only
// read; jackRebuild writes the diff. Parser graded on jack_lsp text captured off the Pi.
// why: lessons/rig-board-synth.md#graph

/** `jack_lsp -c` and what can be read beside it, as an object. */
export function jackGraph() {
  if (!have('jack_lsp')) {
    return { ok: false, server: 'unknown', reason: 'jack_lsp is not installed on this board',
             ports: [], graph: [], procs: null, jackd: null };
  }
  // `-p -t` too, so every row has direction and type.
  // why: lessons/rig-board-synth.md#lsp-pt
  const graph = listJack().rows;
  // An empty listing means no server.
  // why: lessons/rig-board-synth.md#server
  const server = graph.length ? 'up' : 'down';

  // Process counts, so a right-looking graph can still be wrong (a duplicate or an orphan).
  // `pgrep -cx`, never `-f`, which matches itself.
  // why: lessons/rig-board-synth.md#procs
  const procs = {};
  for (const n of ['jackd', 'yoshimi', 'sclang', 'scsynth', 'ffmpeg']) {
    const c = sh(`pgrep -cx ${n} 2>/dev/null`).trim();
    procs[n] = c === '' ? 0 : Number(c) || 0;
  }
  // `-a` adds the command line (declared rate and period, not measured); the match stays `-x`.
  // why: lessons/rig-board-synth.md#jackd-line
  const jackd = sh('pgrep -ax jackd 2>/dev/null').split('\n')[0]?.trim() || null;
  const rateArgs = jackd ? [...jackd.matchAll(/-r\s+(\d+)/g)].map((m) => Number(m[1])) : [];
  return {
    ok: server === 'up',
    server,
    ports: graph.map((p) => p.port),
    graph,
    procs,
    jackd,
    declaredRate: rateArgs.at(-1) ?? null,
    declaredPeriod: jackd ? Number(jackd.match(/-p\s+(\d+)/)?.[1]) || null : null,
    clock: jackdOwns(jackd, CARD) ? CARD.name : 'pi',
    xruns: jackdStats().xruns,
    ...(server === 'down' ? { reason: 'jack_lsp lists no ports at all, so there is no server to look at' } : {}),
  };
}

// What the graph should be for what plays, and what it is: one edge list for report and repair.
// Only the edges into the capture and the granulator's inputs are its business.
// why: lessons/rig-board-synth.md#chain
export function jackChain({ instrumentPort, instrumentPortR, insert = false, source = false, graph = null } = {}) {
  const g = graph ?? jackGraph();
  const rows = g.graph ?? [];
  const sourcesOf = (port) => rows.find((p) => p.port === port)?.connected ?? [];
  const present = (port) => rows.some((p) => p.port === port);

  const want = [];
  if (instrumentPort) {
    if (!insert) {
      // Both channels into one input, which SUMS in JACK. That is deliberate
      // and measured: mono-left read a note at 1661 Hz where mono-sum read
      // 2029 Hz, an apparent 0.29-octave difference that was the wiring.
      want.push([instrumentPort, CAP]);
      if (instrumentPortR) want.push([instrumentPortR, CAP]);
    } else {
      // With generated material the instrument stays unplugged; a rebuild must not put it back.
      // why: lessons/rig-board-synth.md#unplugged
      if (!source) {
        want.push([instrumentPort, SCIN]);
        if (instrumentPortR) want.push([instrumentPortR, SCIN2]);
      }
      want.push([SCOUT, CAP], [SCOUT2, CAP]);
    }
  }

  // The bay's links are wanted too.
  // why: lessons/rig-board-synth.md#bay-wanted
  for (const r of bayOnGraph(rows)) if (!want.some(([f, t]) => f === r.from && t === r.to)) want.push([r.from, r.to]);

  // Anything else feeding those sinks is a stray; the granulator's inputs are swept whenever they
  // exist.
  // why: lessons/rig-board-synth.md#sinks
  const sinks = [CAP, ...(present(SCIN) ? [SCIN, SCIN2] : [])];
  // The chain is a jack.mjs document: report and repair read one description.
  // why: lessons/rig-board-synth.md#chain-doc
  const doc = { v: 1, links: want.map(([from, to]) => ({ from, to })), own: sinks };
  const { missing, extra } = jackDiff(doc, rows);
  return {
    want, missing, extra, doc,
    intact: !!instrumentPort && missing.length === 0 && extra.length === 0,
    // Named separately because they are three different faults with three
    // different repairs, and a caller reading one boolean cannot tell them
    // apart: no instrument at all, a capture that has gone, a graph that drifted.
    capture: { port: CAP, present: present(CAP), sources: sourcesOf(CAP) },
    insert: { port: SCIN, present: present(SCIN), on: !!insert,
              sources: sourcesOf(SCIN), out: sourcesOf(CAP).filter((s) => s.startsWith('SuperCollider:')) },
    instrumentPort: instrumentPort ?? null,
    instrumentPortR: instrumentPortR ?? null,
    material: source ? 'generated' : null,
  };
}

// Put the graph back as a diff: a right graph runs nothing, it kills nothing, disconnects before
// connecting (a few ms gap beats two sources live), and `plan: true` runs nothing.
// why: lessons/rig-board-synth.md#rebuild
export function jackRebuild({ instrumentPort, instrumentPortR, insert = false, source = false,
                              plan = false, graph = null, onLog } = {}) {
  const at = { instrumentPort, instrumentPortR, insert, source };
  // `graph` is for the plan path and tests; the applied path reads the graph back itself.
  // why: lessons/rig-board-synth.md#graph-arg
  const before = jackChain({ ...at, graph });
  if (!instrumentPort) {
    return { ok: false, plan, changed: 0, steps: [], before, after: before,
             reason: 'nothing is playing on the JACK graph, so there is no chain to rebuild. Send audio.start first' };
  }
  if (!before.capture.present) {
    // The capture is an ffmpeg inside `startJackSynth`'s closure, so no amount
    // of patching brings it back. Say which verbs do, rather than running a
    // list of connects against a port that is not there and reporting failure.
    return { ok: false, plan, changed: 0, steps: [], before, after: before,
             reason: `${CAP} is not on the graph: the capture process is gone, and only audio.stop then audio.start raises it again` };
  }
  const rows = graph?.graph ?? listJack().rows;
  const planned = jackPlan(before.doc, rows);
  if (!planned.ok) {
    return { ok: false, plan, changed: 0, steps: [], before, after: before, reason: planned.problems.join('; ') };
  }
  const steps = planned.steps;
  if (plan) {
    onLog?.(steps.length ? `${steps.length} step${steps.length === 1 ? '' : 's'} would run, nothing did` : 'the graph is already what it should be');
    return { ok: true, plan: true, changed: 0, steps, before, after: before };
  }
  // The text travels: jack_connect exits 1 for "already connected" and for failure alike.
  // why: lessons/rig-board-synth.md#text
  const ran = jackApply(planned, { read: () => [] }).ran;
  ran.forEach((r, i) => { steps[i].said = r.said; });
  for (const s of steps) onLog?.(`${s.act} ${s.from} -> ${s.to}${s.said ? ` (${s.said})` : ''}`);
  // `ok` is the graph read back, not the commands having run.
  // why: lessons/rig-board-synth.md#ok
  const after = jackChain(at);
  return { ok: after.intact, plan: false, changed: steps.length, steps, before, after };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The Csound reverb insert is in archive/keys-space/; Pappus is the insert left.
// why: lessons/rig-board-synth.md#reverb-gone

// Sources feeding sequencer client `client` that are not the board's virmidi port; empty is
// healthy.
// why: lessons/rig-board-synth.md#stray-midi
export function strayMidiSources(listing, client, virmidiClient) {
  const own = virmidiClient != null ? `${virmidiClient}:0` : null;
  // By NUMBER, not name: two yoshimis can share a name and one of them is ours.
  return alsaSourcesOf(listing, (id) => id === String(client)).filter((s) => s.id !== own);
}

/** snd-virmidi's raw device, and the sequencer client that mirrors it. */
function findVirmidi() {
  const l = sh('aconnect -l');
  const m = l.match(/client (\d+): 'Virtual Raw MIDI (\d+)-0'/);
  if (!m) return null;
  const dev = `/dev/snd/midiC${m[2]}D0`;
  return existsSync(dev) ? { client: m[1], dev } : null;
}

export async function startJackSynth(name, { onFrame, onLog, ...opts } = {}) {
  const def = JACK_SYNTHS[name];
  if (!def) return { ok: false, reason: `unknown jack synth ${name}` };
  const missing = def.needs.filter((b) => !have(b));
  if (missing.length) return { ok: false, reason: `not installed: ${missing.join(', ')}` };

  const procs = [];
  let stopping = false;               // so an orderly teardown is not reported as a death
  // 1. A clock with no hardware. Ask JACK, not the process table. jackd is not in `procs`: it
  // outlives
  // instruments, and killing it broke the next one.
  // why: lessons/rig-board-synth.md#step-1
  {
    const j = await ensureJackd({ onLog });
    if (!j.ok) return { ok: false, reason: j.reason };
  }

  // 3. The instrument (a feeder step 2 left with hexter; archive/box-fluidsynth-hexter/).
  // why: lessons/rig-board-synth.md#step-3

  // 3. The instrument. `spawnAll` for a source that is several processes (unused today); whichever
  // registers the port `portMatch` finds is patched.
  // why: lessons/rig-board-synth.md#spawn-all
  const spawned = def.spawnAll ? def.spawnAll(opts) : [def.spawn(opts)];
  procs.push(...spawned);
  const synth = spawned[spawned.length - 1];
  let log = '';
  // Forward stdout too (sclang posts there). Strip Yoshimi's `yoshimi> ` prompt, then drop empty
  // lines.
  // why: lessons/rig-board-synth.md#say
  const say = (raw) => {
    const t = String(raw).replace(/^(?:yoshimi>\s*)+/, '').trim();
    if (!t || /^@ \w+/.test(t) || /^(sc3>|->)/.test(t)) return;
    onLog?.(t);
  };
  for (const pr of spawned) {
    pr.stdout?.on('data', (d) => { log += d; for (const line of String(d).split('\n')) say(line); });
    pr.stderr?.on('data', (d) => { log += d; for (const line of String(d).split('\n')) say(line); });
    // Say when a process dies: a bridge keeps its port, so a dead writer looks like a healthy
    // graph.
    // why: lessons/rig-board-synth.md#exit
    pr.on('exit', (code, sig) => {
      if (stopping) return;               // an orderly teardown is not news
      onLog?.(`⚠ ${pr.spawnfile} exited (${sig ?? code}) — this source is no longer making sound`);
    });
  }
  // Poll for the port up to the warmup ceiling, never sleep a guess (a warm switch took 9540 ms);
  // `settle` is waited only after the port exists.
  // why: lessons/rig-board-synth.md#warmup
  const ceiling = def.warmup ?? 6000;   // Yoshimi's 13 s is `warmup` on its archived entry
  const t0port = Date.now();
  let ready = false;
  while (!ready && Date.now() - t0port < ceiling) {
    ready = sh('jack_lsp 2>/dev/null').split('\n').some((p) => def.portMatch.test(p));
    if (!ready) await wait(250);
  }
  onLog?.(ready ? `port up in ${Date.now() - t0port} ms` : `no port after ${ceiling} ms — carrying on so the failure is reported below`);
  if (ready && def.settle) await wait(def.settle);

  // 3. Capture, shared since the sampler sums into it: this instrument holds it.
  // why: lessons/rig-board-synth.md#capture
  await ensureCapture(name, { onFrame, onLog });

  // 4. wire the instrument's output into the capture client
  const port = sh('jack_lsp').split('\n').find((p) => def.portMatch.test(p));
  if (!port) { procs.forEach((p) => p.kill()); releaseCapture(name); return { ok: false, reason: `${name} registered no JACK port`, log: log.slice(-300) }; }
  // And the right channel: many ports into one input sum in JACK (mono-left read 1661 Hz, mono-sum
  // 2029).
  // why: lessons/rig-board-synth.md#port-r
  let portR = null;
  if (def.portMatch2) {
    portR = sh('jack_lsp').split('\n').find((p) => def.portMatch2.test(p)) ?? null;
    if (!portR) onLog?.(`${name}: no right channel found, so the capture is one channel of a stereo source`);
  }
  // Additive, not owned; jack.rebuild cuts strays.
  // why: lessons/rig-board-synth.md#additive
  const wired = wire({ v: 1, links: [l(port, CAP), ...(portR ? [l(portR, CAP)] : [])] }, { onLog, what: `${name} into the capture` });

  // 5. MIDI in, through virmidi; pappusFx() joins the instrument to the granulator.
  // why: lessons/rig-board-synth.md#step-5

  // 5. MIDI in, through virmidi
  const vm = findVirmidi();
  // A source need not have MIDI at all, because a recording played into the
  // graph has no notes, so `alsaMatch` is optional rather than assumed.
  const alsa = def.alsaMatch
    ? sh('aconnect -l').split('\n').find((l) => /^client \d+:/.test(l) && def.alsaMatch.test(l))
    : null;
  const alsaClient = alsa?.match(/client (\d+):/)?.[1];
  let midiFd = null;
  if (vm && alsaClient) {
    sh(`aconnect ${vm.client}:0 ${alsaClient}:0`);
    try { midiFd = openSync(vm.dev, 'w'); } catch (e) { onLog?.(`virmidi open failed: ${e.message}`); }
  }
  // The virmidi port must be the only source; strays are cut by name in the log.
  // why: lessons/rig-board-synth.md#strays
  const strays = alsaClient ? strayMidiSources(sh('aconnect -l'), alsaClient, vm?.client) : [];
  for (const s of strays) { sh(`aconnect -d ${s.id} ${alsaClient}:0`); onLog?.(`cut ${s.name ?? s.id} (${s.id}) -> ${name}: the board is its only MIDI source`); }

  // 6. the capture's bytes, cut into 20 ms frames: `ensureCapture` does it.

  // `def.oscCmd` is the running parameter socket of a SuperCollider engine.
  // why: lessons/rig-board-synth.md#osc-cmd

  const midi = (bytes) => { if (midiFd !== null) { try { writeSync(midiFd, Buffer.from(bytes)); } catch { /* gone */ } } };

  // The OSC channel, for engines that are driven by parameters rather than notes.
  const udp = def.oscCmd ? createSocket('udp4') : null;
  const osc = (cmdName, ...args) => {
    if (!udp) return false;
    const m = oscMessage('/pappus/cmd', [cmdName, ...args]);
    udp.send(m, 0, m.length, 57120, '127.0.0.1');
    return true;
  };
  return {
    // `jack: true` is load-bearing: the insert is gated on it.
    // why: lessons/rig-board-synth.md#jack-true
    ok: true, source: name, jack: true, port, portR, channels: portR ? 2 : 1, alsaClient, midi: !!midiFd, wired: wired.ok,
    rate: RATE, msgPerSec: RATE / FRAME,
    noteOn: (ch, n, v) => midi([0x90 | (ch & 15), n & 127, v & 127]),
    noteOff: (ch, n) => midi([0x80 | (ch & 15), n & 127, 0]),
    cc: (ch, c, v) => midi([0xb0 | (ch & 15), c & 127, v & 127]),
    program: (ch, p) => midi([0xc0 | (ch & 15), p & 127]),
    panic: () => { for (let c = 0; c < 16; c++) midi([0xb0 | c, 123, 0]); },
    osc,
    stop: () => {
      stopping = true;                // an orderly teardown is not a death
      try { udp?.close(); } catch { /* already closed */ }
      if (midiFd !== null) { try { closeSync(midiFd); } catch {} }
      for (const p of procs) { try { p.kill('SIGTERM'); } catch {} }
      releaseCapture(name);
    },
  };
}

// One ffmpeg on `posboard`, held by name while any holder sounds; a second holder reuses it (JACK
// would name another `posboard-01`, wired to nothing). The pump is the newest holder's onFrame.
// why: lessons/rig-board-synth.md#capture-holders
const capture = { proc: null, users: new Set(), onFrame: null, onUnit: null };
export const captureHolders = () => [...capture.users];
// Half a frame as soon as it exists, for the main socket's direct path; relay frames are unchanged.
// why: lessons/rig-board-synth.md#capture-unit
export function setCaptureUnit(fn) { capture.onUnit = typeof fn === 'function' ? fn : null; }
export async function ensureCapture(user, { onFrame, onLog } = {}) {
  capture.users.add(user);
  if (onFrame) capture.onFrame = onFrame;
  if (capture.proc && sh('jack_lsp 2>/dev/null').includes(CAP)) return { ok: true, started: false };
  if (capture.proc) { try { capture.proc.kill('SIGTERM'); } catch { /* gone */ } capture.proc = null; }
  const cap = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'jack', '-i', CAP_CLIENT,
    '-f', 's16le', '-ar', String(RATE), '-ac', '1', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
  capture.proc = cap;
  // Read in HALF frames, so the direct path sends 10 ms as soon as 10 ms
  // exists (inputs.mjs does the same); the relay gets its whole 20 ms frame.
  const HALF = FRAME / 2, IN = HALF * 2;
  let carry = Buffer.alloc(0), halves = [];
  cap.stdout.on('data', (chunk) => {
    carry = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    while (carry.length >= IN) {
      const one = new Int16Array(carry.buffer.slice(carry.byteOffset, carry.byteOffset + IN));
      carry = carry.subarray(IN);
      capture.onUnit?.(one);
      halves.push(one);
      if (halves.length < 2) continue;
      const whole = new Int16Array(FRAME);
      whole.set(halves[0], 0); whole.set(halves[1], HALF);
      halves = [];
      capture.onFrame?.(whole);
    }
  });
  cap.stderr?.on('data', (d) => onLog?.(`ffmpeg: ${String(d).trim()}`));
  cap.on('exit', () => { if (capture.proc === cap) capture.proc = null; });
  // The capture's own client, rather than 2.5 s of hoping.
  const t0cap = Date.now();
  while (Date.now() - t0cap < 8000) {
    if (sh('jack_lsp 2>/dev/null').includes(CAP)) break;
    await wait(200);
  }
  return { ok: sh('jack_lsp 2>/dev/null').includes(CAP), started: true };
}
/** Let go. The ffmpeg stops when nobody holds it. Answers whether it is still running. */
export function releaseCapture(user) {
  capture.users.delete(user);
  if (!capture.users.size && capture.proc) { try { capture.proc.kill('SIGTERM'); } catch { /* gone */ } capture.proc = null; }
  return !!capture.proc;
}
