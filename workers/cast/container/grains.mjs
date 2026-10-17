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

export { PATCHES, clampPatch, PATCH_LIMITS };
export const SR = 44100, PERIOD = Number(process.env.GRAINS_PERIOD) || 2048, NODE = 4000, BUF = 0, DEF = 'gring', PORT = 57110;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
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
export async function startChain({ values = valuesOf(PATCHES[0]), mix = 1, log = () => {}, onDeath = () => {} } = {}) {
  const env = { ...process.env, JACK_NO_AUDIO_RESERVATION: '1', JACK_NO_START_SERVER: '1' };
  const procs = {}, counts = { xruns: 0, late: 0, grains: 0 }, tail = [];
  const ch = { dead: null, startedAt: Date.now(), timing: {} };
  const note = (who, b) => {
    for (const line of String(b).split('\n').map((x) => x.trim()).filter(Boolean)) {
      if (/xrun/i.test(line)) counts.xruns++;
      if (/\blate\b/i.test(line)) counts.late++;
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
  const good = compile(PROGRAM, { name: DEF });
  if (!good.ok) throw new Error(`the ring did not compile: ${good.message}`);
  ch.timing.compileMs = Date.now() - t0;
  let sock = null;
  try {
    run('jackd', 'jackd', ['--no-realtime', '-d', 'dummy', '-r', String(SR), '-p', String(PERIOD), '-C', '2', '-P', '2']);
    procs.jackd.stdout.on('data', (b) => note('jackd', b));
    await new Promise((ok, no) => execFile('jack_wait', ['-w', '-t', '10'], { env }, (e, out) => (e || !/available/.test(out) ? no(new Error('jackd did not come up')) : ok())));
    ch.timing.jackMs = Date.now() - t0;
    const sc = run('scsynth', 'scsynth', ['-u', String(PORT), '-i', '2', '-o', '2', '-R', '0', '-l', '1']);
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
    ch.timing.synthMs = Date.now() - t0;
    // the feed and the tap connect themselves to scsynth's ports; -S is their ring in samples
    const feed = run('jack-stdin', 'jack-stdin', ['-q', '-L', '-b', '16', '-S', '8192', 'SuperCollider:in_1', 'SuperCollider:in_2']);
    const tap = run('jack-stdout', 'jack-stdout', ['-q', '-L', '-b', '16', '-S', '8192', 'SuperCollider:out_1', 'SuperCollider:out_2']);
    ch.timing.chainMs = Date.now() - t0;
    const statusTimer = setInterval(() => send('/status'), 1000);
    log(`grains: chain up in ${ch.timing.chainMs} ms, definition ${good.bytes.length} B taken at ${ch.timing.defMs} ms`);

    Object.assign(ch, {
      feed: feed.stdin, out: tap.stdout, send, ask, counts,
      set(vals) { const e = Object.entries(vals); if (e.length) send('/n_set', NODE, ...e.flat()); },
      // a new patch starts the read head at the write head, as the page's land() does
      land() { send('/n_set', NODE, 'sync', 1); setTimeout(() => send('/n_set', NODE, 'sync', 0), 40); },
      async read(name) { const r = await ask((m) => m.address === '/n_set' && m.args[1] === name, 2000, '/s_get', NODE, name); return r ? r.args[2] : null; },
      status() {
        const p = Object.fromEntries(Object.entries(procs).map(([k, x]) => [k, x.pid ? { pid: x.pid, ...procUsage(x.pid) } : null]));
        p.node = { pid: process.pid, ...procUsage(process.pid) };
        return { dead: ch.dead, upS: Math.round((Date.now() - ch.startedAt) / 1000), timing: ch.timing, defBytes: ch.defBytes,
          scsynth: lastStatus, xruns: counts.xruns, late: counts.late, grains: counts.grains, procs: p, lines: tail.slice(-8) };
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

/**
 * Mix mode with the ring after it: `{ queue, target, set, patch }` on air through `openSink(target, title)`.
 * Returns `{ status(), set(name, v), patch({name, set}), queue(q), next(), stop() }`, the shape of startMix plus patch.
 */
export function startGrains({ queue, target, set = {}, patch = { name: PATCHES[0].name } }, { openSink, say = () => {}, fail = () => {}, onMp3 = null } = {}) {
  const m = { stopped: false, sink: null, onAir: false, startedAt: Date.now(), first: null, sent: 0, frames: 0, bytes: 0, down: 0,
    sinkDeaths: 0, sinkFails: 0, chainStarts: 0, ahead: 0, outRms: null, outPeak: null };
  const first = clampPatch(patch);
  const g = { patch: first.patch, values: { ...RING_DEFAULTS, ...first.values }, mix: first.values.mix ?? 1 };
  delete g.values.mix;
  const engine = createEngine({ open: (it) => openDecoder(it, { log: say }), queue, set, log: say });
  let chain = null, enc = null, writing = Promise.resolve();
  const newEncoder = () => openEncoder({ log: say, onFrame: (f) => {
    if (m.first == null) m.first = Date.now();
    onMp3?.(f);
    if (!m.sink || m.sink.closed) return;             // nobody to send to: dropped, JACK keeps the clock
    writing = writing.then(() => m.sink?.write(f.data)).then(() => { m.sent += f.seconds; m.frames++; m.bytes += f.data.length; }).catch(() => {});
  } });
  async function connect(why) {
    const t0 = Date.now();
    for (let i = 0; !m.stopped; i++) {
      try {
        m.sink = await openSink(target, engine.status().slots.find((x) => x.title)?.title);
        m.onAir = true; say(why ? `grains back on air after ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'grains on air');
        return (Date.now() - t0) / 1000;
      } catch (e) { fail(e); m.sinkFails++; await sleep(BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)]); }
    }
    return 0;
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
    chain = await startChain({ values: g.values, mix: g.mix, log: say });
    chain.out.on('data', tapOut);
  }
  (async () => {
    engine.start();
    say(`grains: first file ready in ${await engine.ready()} ms`);
    enc = newEncoder();
    connect(null).then(() => {});
    while (!m.stopped) {
      // no chain yet, or it died: bring one up, the mix waiting
      if (!chain || chain.dead) {
        if (chain) { fail(new Error(`grains chain died: ${chain.dead}`)); await chain.close(); chain = null; await sleep(1000); }
        if (m.stopped) break;
        try { await up(); } catch (e) { fail(e); chain = null; await sleep(2000); }
        continue;
      }
      if (m.onAir && (!m.sink || m.sink.closed)) {
        m.onAir = false; m.sinkDeaths++; fail(new Error(`source connection lost: ${m.sink?.why || 'closed'}`));
        const t0 = Date.now(); connect('lost').then(() => { m.down += (Date.now() - t0) / 1000; });
      }
      if (enc.exited) { say(`encoder gone (${enc.error || 'exited'}), starting another`); enc = newEncoder(); }
      // never more than 3 s of mix ahead of the wall, whatever the pipes hold
      m.ahead = engine.seconds - (Date.now() - m.startedAt) / 1000;
      if (m.ahead > 3) { await sleep(50); continue; }
      const feed = chain.feed;
      if (!feed.write(engine.block())) await new Promise((r) => { const go = () => { clearTimeout(t); feed.off('drain', go); r(); }; const t = setTimeout(go, 500); feed.on('drain', go); });
    }
  })().catch((e) => fail(e)).finally(() => { engine.close(); chain?.close(); enc?.kill(); m.sink?.close(); });

  return {
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
    stop() { m.stopped = true; m.sink?.close(); },
    status() {
      const e = engine.status(), now = Date.now(), wallOut = m.first ? (now - m.first) / 1000 : 0;
      return { ...e, mode: 'grains', onAir: m.onAir, since: m.startedAt, seconds: +engine.seconds.toFixed(2), mp3Seconds: +m.sent.toFixed(2),
        wall: +((now - m.startedAt) / 1000).toFixed(2), lag: +(wallOut - (enc?.seconds ?? 0)).toFixed(2), ahead: +m.ahead.toFixed(2), down: +m.down.toFixed(1),
        frames: m.frames, bytes: m.bytes, sinkDeaths: m.sinkDeaths, sinkFails: m.sinkFails, usage: usage(),
        grains: { patch: g.patch, mix: g.mix, values: g.values, out: { rms: m.outRms, peak: m.outPeak }, chainStarts: m.chainStarts, chain: chain?.status() ?? null } };
    },
  };
}
