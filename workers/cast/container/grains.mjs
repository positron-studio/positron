// Stage 2: /radio/scenery/'s grain ring after the tuner mix. jackd (dummy clock) -> jack-stdin ->
// scsynth running the page's own PROGRAM -> jack-stdout -> LAME. JACK is the clock: node writes the
// mix as fast as the pipe takes it. why: lessons/workers-cast.md#grains
import { spawn, execFile } from 'node:child_process';
import { createSocket } from 'node:dgram';
import fs from 'node:fs';
import { PROGRAM, PATCHES, DEFAULTS as RING_DEFAULTS, RING_SECONDS, valuesOf } from './sc/granulator/grain-ring.mjs';
import { clampPatch, PATCH_LIMITS } from './grain-patch.mjs';
import { compile } from './sc/shell/sclang-lite.mjs';
import { createEngine } from './mixer.mjs';
import { openDecoder } from './decode.mjs';
import { openEncoder } from './encode.mjs';
import { usage } from './mixcast.mjs';
import { program as masterProgram, MASTER_BUS } from './sc/radio/cast/master.mjs';

export { PATCHES, clampPatch, PATCH_LIMITS };
// 8192 frames (186 ms): at half a vCPU 2048 and 4096 xrun when a file arrives, 8192 did not. why: lessons/workers-cast.md#live-container
export const SR = 44100, PERIOD = Number(process.env.GRAINS_PERIOD) || 8192, NODE = 4000, BUF = 0, DEF = 'gring', PORT = 57110;
// the ring and the layers write MASTER_BUS; the master (master.mjs) after them levels the sum to a podcast's loudness
export const MASTER_NODE = 4100;
// the stdio rings, in frames: jack-stdin keeps its ring full while node is ahead, so what it has read leads what scsynth
// hears by the whole ring. MEASURED 0.70 to 0.74 s with the 32768 here. why: lessons/workers-cast.md#handover
export const RING_SAMPLES = Math.max(8192, PERIOD * 4);
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
// A twin's seek lands this far past the station, about its chain's start (2 to 3 s), and go() retries every 100 ms
// for 5 s while the old source lets go of the mount. why: lessons/workers-cast.md#handover
const ALIGN_LEAD_S = 4, GO_RETRY_MS = [...Array(50).fill(100), ...BACKOFF_MS];
// The clock is the best of CLOCK_S of reads; a twin reads it SETTLE_S after each correction, done within SETTLE_OK_S.
const CLOCK_S = 6, SETTLE_S = 2, SETTLE_OK_S = 0.01;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastClose = Promise.resolve();   // a new chain waits for the last one's processes to be gone

// ── OSC, the few shapes scsynth speaks: i f s b out, and d as well in (/status.reply's rates) ──
const pad4 = (n) => (n + 3) & ~3;
function oscStr(s) { const b = Buffer.alloc(pad4(Buffer.byteLength(s) + 1)); b.write(s, 'latin1'); return b; }
export function oscMessage(address, args = []) {
  const tags = ',' + args.map((a) => (typeof a === 'string' ? 's' : a instanceof Uint8Array ? 'b' : Number.isInteger(a) ? 'i' : 'f')).join('');
  const parts = [oscStr(address), oscStr(tags)];
  for (const a of args) {
    if (typeof a === 'string') parts.push(oscStr(a));
    else if (a instanceof Uint8Array) { const n = Buffer.alloc(4); n.writeInt32BE(a.length); const d = Buffer.alloc(pad4(a.length)); d.set(a); parts.push(n, d); }
    else { const b = Buffer.alloc(4); if (Number.isInteger(a)) b.writeInt32BE(a); else b.writeFloatBE(a); parts.push(b); }
  }
  return Buffer.concat(parts);
}
export function oscParse(buf) {
  let o = 0;
  const str = () => { const e = buf.indexOf(0, o); const s = buf.toString('latin1', o, e); o = pad4(e + 1); return s; };
  const address = str();
  if (address === '#bundle') return null;
  const tags = o < buf.length ? str() : ',';
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === 'i') { args.push(buf.readInt32BE(o)); o += 4; }
    else if (t === 'f') { args.push(buf.readFloatBE(o)); o += 4; }
    else if (t === 'd') { args.push(buf.readDoubleBE(o)); o += 8; }
    else if (t === 's') args.push(str());
    else if (t === 'b') { const n = buf.readInt32BE(o); args.push(buf.subarray(o + 4, o + 4 + n)); o = pad4(o + 4 + n); }
    else return { address, args, partial: true };
  }
  return { address, args };
}

/** CPU (per cent of one core since the last read) and RSS of one pid, from /proc; null off Linux. */
const ticks = new Map();
function procUsage(pid) {
  try {
    const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    const t = Number(st[11]) + Number(st[12]), now = Date.now(), prev = ticks.get(pid);
    let cpu = null;
    if (prev && now - prev.at > 200) cpu = +(((t - prev.t) / 100) / ((now - prev.at) / 1000) * 100).toFixed(1);
    if (!prev || now - prev.at > 4000) ticks.set(pid, { t, at: now });
    const rss = /VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'));
    return { cpuPct: cpu, rssMiB: rss ? +(Number(rss[1]) / 1024).toFixed(1) : null, cpuS: +(t / 100).toFixed(2) };
  } catch { return null; }
}

/**
 * The JACK chain with the ring running in scsynth. Resolves `{ feed, out, send, ask, status(), close(), dead }`
 * once the definition is loaded and the synth is going; `feed` takes s16le stereo, `out` gives it back.
 */
export async function startChain({ values = valuesOf(PATCHES[0]), mix = 1, inputs = 2, log = () => {}, onDeath = () => {} } = {}) {
  const env = { ...process.env, JACK_NO_AUDIO_RESERVATION: '1', JACK_NO_START_SERVER: '1' };
  const procs = {}, counts = { xruns: 0, late: 0, underruns: 0, grains: 0 }, tail = [];
  const ch = { dead: null, startedAt: Date.now(), timing: {}, inputs };
  const note = (who, b) => {
    for (const line of String(b).split('\n').map((x) => x.trim()).filter(Boolean)) {
      if (/xrun/i.test(line)) counts.xruns++;
      if (/\blate\b/i.test(line)) counts.late++;
      if (/underrun/i.test(line)) counts.underruns++;
      tail.push(`${who}: ${line.slice(0, 160)}`); if (tail.length > 30) tail.shift();
    }
  };
  const run = (name, cmd, args) => {
    const p = spawn(cmd, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    procs[name] = p;
    p.stderr.on('data', (b) => note(name, b));
    p.stdin.on('error', () => { /* the exit says why */ });
    p.on('error', (e) => note(name, e.message));
    p.on('exit', (code, sig) => {
      if (ch.closing) return;
      ch.dead ||= `${name} exited ${code ?? sig}`; log(`grains: ${ch.dead}`); onDeath(ch.dead);
    });
    return p;
  };
  const waitFor = (p, re, ms, what) => new Promise((ok, no) => {
    let got = '';
    const t = setTimeout(() => no(new Error(`${what}: nothing in ${ms} ms`)), ms);
    p.stdout.on('data', (b) => { note(what, b); got += b; if (re.test(got)) { clearTimeout(t); ok(); } });
    p.on('exit', (c) => { clearTimeout(t); no(new Error(`${what} exited ${c} before it was ready`)); });
  });
  await lastClose;
  const t0 = Date.now();
  // the compile is the page's: same PROGRAM, same compiler, same name
  const good = compile(PROGRAM, { name: DEF, bus: MASTER_BUS });
  if (!good.ok) throw new Error(`the ring did not compile: ${good.message}`);
  const mst = compile(masterProgram(MASTER_BUS), { name: 'lmaster' });
  if (!mst.ok) throw new Error(`the master did not compile: ${mst.message}`);
  ch.timing.compileMs = Date.now() - t0;
  let sock = null;
  try {
    run('jackd', 'jackd', ['--no-realtime', '-d', 'dummy', '-r', String(SR), '-p', String(PERIOD), '-C', '2', '-P', '2']);
    procs.jackd.stdout.on('data', (b) => note('jackd', b));
    await new Promise((ok, no) => execFile('jack_wait', ['-w', '-t', '10'], { env }, (e, out) => (e || !/available/.test(out) ? no(new Error('jackd did not come up')) : ok())));
    ch.timing.jackMs = Date.now() - t0;
    // inputs 4 adds busses 4 and 5 (the live ghost) beside the ring's 2 and 3. why: lessons/workers-cast.md#live-container
    const sc = run('scsynth', 'scsynth', ['-u', String(PORT), '-i', String(inputs), '-o', '2', '-R', '0', '-l', '1']);
    await waitFor(sc, /server ready/, 10000, 'scsynth');
    ch.timing.scsynthMs = Date.now() - t0;

    sock = createSocket('udp4');
    const waiters = [];
    let lastStatus = null;
    sock.on('message', (b) => {
      let m; try { m = oscParse(b); } catch { return; }
      if (!m) return;
      if (m.address === '/grain') { counts.grains++; return; }
      if (m.address === '/status.reply') { const a = m.args.map((x) => (typeof x === 'number' ? x : NaN)); lastStatus = { at: Date.now(), ugens: a[1], synths: a[2], avgCPU: +(+a[5]).toFixed(2), peakCPU: +(+a[6]).toFixed(2), sr: a[7], actualSR: +(+a[8]).toFixed(3) }; }
      if (m.address === '/fail') note('scsynth', `/fail ${m.args.join(' ')}`);
      for (const w of waiters.slice()) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.t); w.ok(m); }
    });
    await new Promise((r) => sock.bind(0, '127.0.0.1', r));
    const send = (address, ...args) => sock.send(oscMessage(address, args), PORT, '127.0.0.1');
    const ask = (test, ms, address, ...args) => new Promise((ok) => {
      const w = { test, ok, t: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); ok(null); }, ms) };
      waiters.push(w); send(address, ...args);
    });
    const done = (cmd) => (m) => (m.address === '/done' && m.args[0] === cmd) || (m.address === '/fail' && m.args[0] === cmd);
    if (!await ask(done('/notify'), 3000, '/notify', 1)) throw new Error('scsynth did not answer /notify');
    const alloc = await ask(done('/b_alloc'), 5000, '/b_alloc', BUF, RING_SECONDS * SR, 1);
    if (alloc?.address !== '/done') throw new Error('the ring buffer was not allocated');
    const def = await ask(done('/d_recv'), 5000, '/d_recv', good.bytes);
    if (def?.address !== '/done') throw new Error(`scsynth did not take the definition: ${def ? def.args.join(' ') : 'no answer'}`);
    ch.timing.defMs = Date.now() - t0; ch.defBytes = good.bytes.length;
    const go = await ask((m) => (m.address === '/n_go' && m.args[0] === NODE) || (m.address === '/fail' && m.args[0] === '/s_new'), 5000,
      '/s_new', DEF, NODE, 1, 0, 'buf', BUF, 'inbus', 2, 'mix', mix, ...Object.entries(values).flat());
    if (go?.address !== '/n_go') throw new Error('the ring did not start');
    if ((await ask(done('/d_recv'), 5000, '/d_recv', mst.bytes))?.address !== '/done') throw new Error('scsynth did not take the master');
    // after the ring (addAfter); the layers' room is added before it
    send('/s_new', 'lmaster', MASTER_NODE, 3, NODE);
    ch.timing.synthMs = Date.now() - t0;
    // the feed and the tap connect themselves to scsynth's ports; -S is their ring in frames, four periods
    const ringS = String(RING_SAMPLES);
    const feed = run('jack-stdin', 'jack-stdin', ['-q', '-L', '-b', '16', '-S', ringS, ...Array.from({ length: inputs }, (_, i) => `SuperCollider:in_${i + 1}`)]);
    const tap = run('jack-stdout', 'jack-stdout', ['-q', '-L', '-b', '16', '-S', ringS, 'SuperCollider:out_1', 'SuperCollider:out_2']);
    ch.timing.chainMs = Date.now() - t0;
    const statusTimer = setInterval(() => send('/status'), 1000);
    log(`grains: chain up in ${ch.timing.chainMs} ms, definition ${good.bytes.length} B taken at ${ch.timing.defMs} ms`);

    Object.assign(ch, {
      feed: feed.stdin, feedPid: feed.pid, out: tap.stdout, send, ask, counts,
      set(vals) { const e = Object.entries(vals); if (e.length) send('/n_set', NODE, ...e.flat()); },
      // a new patch starts the read head at the write head, as the page's land() does
      land() { send('/n_set', NODE, 'sync', 1); setTimeout(() => send('/n_set', NODE, 'sync', 0), 40); },
      async read(name) { const r = await ask((m) => m.address === '/n_set' && m.args[1] === name, 2000, '/s_get', NODE, name); return r ? r.args[2] : null; },
      status() {
        const p = Object.fromEntries(Object.entries(procs).map(([k, x]) => [k, x.pid ? { pid: x.pid, ...procUsage(x.pid) } : null]));
        p.node = { pid: process.pid, ...procUsage(process.pid) };
        return { dead: ch.dead, upS: Math.round((Date.now() - ch.startedAt) / 1000), timing: ch.timing, defBytes: ch.defBytes,
          scsynth: lastStatus, xruns: counts.xruns, late: counts.late, underruns: counts.underruns, grains: counts.grains, period: PERIOD, procs: p, lines: tail.slice(-8) };
      },
      close() {
        if (ch.closing) return lastClose;
        ch.closing = true; clearInterval(statusTimer);
        try { sock.close(); } catch { /* gone */ }
        const gone = (p) => new Promise((r) => { if (!p || p.exitCode !== null || p.signalCode) return r(); p.once('exit', r); p.kill('SIGTERM'); setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, 2000); });
        lastClose = (async () => { await Promise.all(['jack-stdin', 'jack-stdout', 'scsynth'].map((n) => gone(procs[n]))); await gone(procs.jackd); })();
        return lastClose;
      },
    });
    return ch;
  } catch (e) {
    ch.closing = true;
    try { sock?.close(); } catch { /* gone */ }
    for (const p of Object.values(procs)) { try { p.kill('SIGKILL'); } catch { /* gone */ } }
    lastClose = Promise.all(Object.values(procs).map((p) => (p.exitCode !== null || p.signalCode ? null : new Promise((r) => p.once('exit', r)))));
    throw e;
  }
}

/** Bytes a process has read (rchar in /proc/<pid>/io), or null off Linux. */
export function readBytes(pid) {
  try { return Number(/rchar:\s*(\d+)/.exec(fs.readFileSync(`/proc/${pid}/io`, 'utf8'))[1]); } catch { return null; }
}

/** s16 stereo and a mono block (or none) as four interleaved s16 channels: the mix on 1 and 2, `x` on 3 and 4. */
export function widen(pcm, x) {
  const n = pcm.length >> 2, out = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) {
    const v = x ? Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))) : 0;
    out.writeInt16LE(pcm.readInt16LE(i * 4), i * 8); out.writeInt16LE(pcm.readInt16LE(i * 4 + 2), i * 8 + 2);
    out.writeInt16LE(v, i * 8 + 4); out.writeInt16LE(v, i * 8 + 6);
  }
  return out;
}

/**
 * Mix mode with the ring after it: `{ queue, target, set, patch }` on air through `openSink(target, title)`.
 * Returns `{ status(), set(name, v), patch({name, set}), queue(q), next(), stop() }`, the shape of startMix plus patch.
 * `inputs: 4` feeds `ghost(n)` (mono floats or null) to scsynth's busses 4 and 5; `onChain(chain)` runs on each
 * chain that comes up, `onBlock(mono)` on each block of the tuner. live.mjs drives these.
 */
export function startGrains({ queue, target, set = {}, patch = { name: PATCHES[0].name }, resume = null, hold = false }, { openSink, say = () => {}, fail = () => {}, onMp3 = null,
  inputs = 2, ghost = null, onChain = null, onBlock = null } = {}) {
  const m = { stopped: false, sink: null, onAir: false, startedAt: Date.now(), first: null, sent: 0, frames: 0, bytes: 0, down: 0,
    sinkDeaths: 0, sinkFails: 0, chainStarts: 0, ahead: 0, outRms: null, outPeak: null, held: !!hold, lined: !resume?.wall, aligned: !resume?.wall, align: null, goAt: null, onAirAt: null };
  const clk = [];   // (heard - wall) samples over CLOCK_S
  const first = clampPatch(patch);
  const g = { patch: first.patch, values: { ...RING_DEFAULTS, ...first.values }, mix: first.values.mix ?? 1 };
  delete g.values.mix;
  // a twin opens its first file a little past where the station will be when its chain is up, then lines up
  // to the wall in align(). why: lessons/workers-cast.md#handover
  const lead = resume?.wall ? (Date.now() - resume.wall) / 1000 + (resume.leadS ?? ALIGN_LEAD_S) : 0;
  const engine = createEngine({ open: (it, o) => openDecoder(it, { log: say, ...o }), queue, set, log: say,
    resume: resume ? { from: Math.max(0, (resume.pos || 0) + lead), cycleT: (resume.cycleT || 0) + lead } : null });
  let chain = null, enc = null, writing = Promise.resolve(), anchor = null, fed = null;
  const newEncoder = () => openEncoder({ log: say, onFrame: (f) => {
    if (m.first == null) m.first = Date.now();
    onMp3?.(f);
    if (!m.sink || m.sink.closed) return;             // nobody to send to: dropped, JACK keeps the clock
    writing = writing.then(() => m.sink?.write(f.data)).then(() => { m.sent += f.seconds; m.frames++; m.bytes += f.data.length; }).catch(() => {});
  } });
  async function connect(why, backoff = BACKOFF_MS) {
    const t0 = Date.now();
    for (let i = 0; !m.stopped; i++) {
      try {
        m.sink = await openSink(target, engine.status().slots.find((x) => x.title)?.title);
        m.onAir = true; m.onAirAt ??= Date.now(); say(why ? `grains ${why === 'go' ? 'on air, handed over,' : 'back on air'} after ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'grains on air');
        return (Date.now() - t0) / 1000;
      } catch (e) { fail(e); m.sinkFails++; await sleep(backoff[Math.min(i, backoff.length - 1)]); }
    }
    return 0;
  }
  /** Lines the file on air up with `resume.pos` at `resume.wall`, by dropping sound or waiting; before the first block. */
  async function align() {
    const t0 = Date.now(), at = () => resume.pos + (Date.now() - resume.wall) / 1000;
    let skipped = 0, waited = 0;
    while (!m.stopped && Date.now() - t0 < 15000) {
      const d = at() - engine.onPlayed;
      if (Math.abs(d) < 0.005) break;
      if (d < 0) { const ms = Math.min(-d * 1000, 10000); waited += ms; await sleep(ms); continue; }
      const got = engine.skip(d); skipped += got;
      if (got < d - 0.005) await sleep(50);
    }
    m.align = { errMs: +((at() - engine.onPlayed) * 1000).toFixed(1), skippedS: +skipped.toFixed(3), waitedMs: Math.round(waited), ms: Date.now() - t0, settled: [] };
    m.lined = true; m.settleAt = Date.now() + SETTLE_S * 1000; clk.length = 0;
    // without /proc there is no clock to settle on
    if (readBytes(process.pid) == null) m.aligned = true;
    say(`lined up with the station: ${m.align.errMs} ms off, ${m.align.skippedS} s dropped, ${m.align.waitedMs} ms waited`);
  }
  /**
   * Once the twin plays, what scsynth hears is measured (clockHeard) against the station's: a twin behind drops the
   * difference, one ahead holds its writes that long. Before any listener or mount is moved to it.
   */
  async function settle() {
    const t = Date.now(), e = clockHeard() - engine.seconds + engine.onPlayed - (resume.pos + (t - resume.wall) / 1000);
    m.align.settled.push(+(e * 1000).toFixed(1));
    if (Math.abs(e) > SETTLE_OK_S && m.align.settled.length < 3) {
      if (e < 0) { let left = -e; for (let i = 0; left > 0.002 && i < 100; i++) { left -= engine.skip(left); if (left > 0.002) await sleep(20); } }
      else await sleep(e * 1000);
      clk.length = 0; m.settleAt = Date.now() + SETTLE_S * 1000;
      return;
    }
    m.aligned = true; m.align.errMs = +(e * 1000).toFixed(1);
    say(`settled on the station: ${m.align.errMs} ms off after ${m.align.settled.length} reads`);
  }
  // the output, metered per second on its way to LAME
  let ss = 0, pk = 0, n = 0;
  const tapOut = (b) => {
    for (let i = 0; i + 1 < b.length; i += 2) { const v = b.readInt16LE(i) / 32768; ss += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); n++; }
    if (n >= SR * 2) { m.outRms = ss ? +(10 * Math.log10(ss / n)).toFixed(1) : null; m.outPeak = pk ? +(20 * Math.log10(pk)).toFixed(1) : null; ss = pk = n = 0; }
    enc?.write(b);
  };
  async function up() {
    m.chainStarts++;
    chain = await startChain({ values: g.values, mix: g.mix, inputs, log: say });
    chain.out.on('data', tapOut);
    // not awaited: the mix flows while what rides on the chain (live's layers) loads beside it
    if (onChain) Promise.resolve().then(() => onChain(chain)).catch((e) => fail(e));
  }
  (async () => {
    engine.start();
    say(`grains: first file ready in ${await engine.ready()} ms`);
    enc = newEncoder();
    if (!hold) connect(null).then(() => {});
    while (!m.stopped) {
      // no chain yet, or it died: bring one up, the mix waiting
      if (!chain || chain.dead) {
        if (chain) { fail(new Error(`grains chain died: ${chain.dead}`)); await chain.close(); chain = null; await sleep(1000); }
        if (m.stopped) break;
        try { await up(); } catch (e) { fail(e); chain = null; await sleep(2000); }
        continue;
      }
      if (!m.lined) { await align(); continue; }
      if (!m.aligned && Date.now() >= m.settleAt) { await settle(); continue; }
      if (m.onAir && (!m.sink || m.sink.closed)) {
        m.onAir = false; m.sinkDeaths++; fail(new Error(`source connection lost: ${m.sink?.why || 'closed'}`));
        const t0 = Date.now(); connect('lost').then(() => { m.down += (Date.now() - t0) / 1000; });
      }
      if (enc.exited) { say(`encoder gone (${enc.error || 'exited'}), starting another`); enc = newEncoder(); }
      // never more than 3 s of mix ahead of the wall, whatever the pipes hold
      m.ahead = engine.seconds - (Date.now() - m.startedAt) / 1000;
      if (m.ahead > 3) { await sleep(50); continue; }
      const feed = chain.feed, pcm = engine.block();
      onBlock?.(engine.mono);
      anchor ??= Date.now();
      // what jack-stdin has read is what scsynth hears, give or take its ring: the baseline is this chain's first write
      if (fed?.chain !== chain) fed = { chain, base: engine.seconds - pcm.length / 4 / SR, at0: readBytes(chain.feedPid) };
      sampleClock();
      if (!feed.write(inputs === 4 ? widen(pcm, ghost?.(pcm.length >> 2)) : pcm)) await new Promise((r) => { const go = () => { clearTimeout(t); feed.off('drain', go); r(); }; const t = setTimeout(go, 500); feed.on('drain', go); });
    }
  })().catch((e) => fail(e)).finally(() => { engine.close(); chain?.close(); enc?.kill(); m.sink?.close(); });

  /**
   * Mix seconds scsynth has had: what jack-stdin has read from its pipe (/proc rchar), never past what was written.
   * Without /proc, the wall since the first write. why: lessons/workers-cast.md#handover
   */
  function heard() {
    if (anchor == null) return 0;
    const b = fed?.at0 != null ? readBytes(fed.chain.feedPid) : null;
    if (b != null) return Math.max(fed.base, Math.min(engine.seconds, fed.base + (b - fed.at0) / (inputs * 2 * SR) - RING_SAMPLES / SR));
    const h = (Date.now() - anchor) / 1000;
    if (h > engine.seconds) { anchor = Date.now() - engine.seconds * 1000; return engine.seconds; }
    return h;
  }
  /**
   * heard() is low while jack-stdin's ring is not full, never high, and scsynth runs on JACK's clock: so the best
   * of the last CLOCK_S of (heard - wall) is where scsynth is. why: lessons/workers-cast.md#handover
   */
  function sampleClock() {
    // until jack-stdin has read a whole ring, heard() is held at the chain's start and says nothing
    if (fed?.at0 == null || (readBytes(fed.chain.feedPid) - fed.at0) / (inputs * 2) < RING_SAMPLES) return;
    const t = Date.now() / 1000;
    clk.push([t, heard() - t]);
    while (clk.length && clk[0][0] < t - CLOCK_S) clk.shift();
  }
  function clockHeard() {
    if (!clk.length) return heard();
    let d = -Infinity; for (const [, x] of clk) if (x > d) d = x;
    return Math.min(engine.seconds, Date.now() / 1000 + d);
  }
  return {
    engine, heard, clockHeard,
    set: (name, v) => engine.set(name, v),
    queue: (q) => engine.queue(q),
    next: () => engine.next(),
    /** A patch by name and/or values; returns what was applied. */
    patch(p) {
      const c = clampPatch(p);
      if (c.values.mix != null) { g.mix = c.values.mix; }
      const vals = { ...c.values }; delete vals.mix;
      Object.assign(g.values, vals); if (c.patch) g.patch = c.patch; else if (Object.keys(vals).length) g.patch = null;
      if (chain && !chain.dead) { chain.set(c.values); if (c.patch) chain.land(); }
      return c;
    },
    get chain() { return chain; },
    get aligned() { return m.aligned; },
    /** A held twin opens its source now, retrying fast while the old one lets go of the mount. */
    go() {
      if (!m.held) return false;
      m.held = false; m.goAt = Date.now();
      connect('go', GO_RETRY_MS).then(() => {});
      return true;
    },
    stop() { m.stopped = true; m.sink?.close(); },
    status() {
      const e = engine.status(), now = Date.now(), wallOut = m.first ? (now - m.first) / 1000 : 0;
      return { ...e, mode: 'grains', onAir: m.onAir, since: m.startedAt, seconds: +engine.seconds.toFixed(2), mp3Seconds: +m.sent.toFixed(2),
        wall: +((now - m.startedAt) / 1000).toFixed(2), backlog: +(engine.seconds - heard()).toFixed(3), lag: +(wallOut - (enc?.seconds ?? 0)).toFixed(2), ahead: +m.ahead.toFixed(2), down: +m.down.toFixed(1),
        frames: m.frames, bytes: m.bytes, sinkDeaths: m.sinkDeaths, sinkFails: m.sinkFails, usage: usage(),
        held: m.held, aligned: m.aligned, align: m.align, clockBacklog: +(engine.seconds - clockHeard()).toFixed(3), goMs: m.goAt && m.onAirAt ? m.onAirAt - m.goAt : null,
        grains: { patch: g.patch, mix: g.mix, values: g.values, out: { rms: m.outRms, peak: m.outPeak }, chainStarts: m.chainStarts, chain: chain?.status() ?? null } };
    },
  };
}
