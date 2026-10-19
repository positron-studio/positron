// The cast's audio source, in a Cloudflare Container: archive mp3s paced to the wall clock into one
// source connection. Control is plain HTTP on :8080 from the Caster Durable Object.
//   POST /play  { queue: [{id,title,url}], target, resume?: {index, at} }   POST /next   POST /stop
//   POST /queue { queue }   what plays after the current file, which keeps playing
//   POST /load { files, sha }   a new composer, checked now and taken at the next scene (load.mjs)
//   POST /play  { ..., mode: 'mix', set }   the mix instead: two slots on an AM dial (mixcast.mjs)
//   POST /set   { name, v }   a mix control: tune, drift, dwell, blend, noise
//   POST /play  { ..., mode: 'grains', set, patch }   the mix through the grain ring (grains.mjs)
//   POST /patch { name?, set? }   a grain ring patch by name and/or values, clamped
//   POST /play  { ..., mode: 'live', life: { seed, votes } }   the page's life and layers over grains (live.mjs)
//   POST /step  { by: 1 | -1 }   live: the next or previous scene, its transition at once
//   POST /play  { ..., mode: 'live', resume: { id, pos, wall, cycleT, si, hist }, hold }   a twin: continues the station
//                where `handoff` saw it; held, it opens no source until POST /go. why: lessons/workers-cast.md#handover
//   GET  /status
// The worker sends only live since 2026-10-18; copy, mix and grains stay here for the tests.
// target is { kind: 'icecast', host, port, mount, pw } or { kind: 'ws', url, mount, pw } (our test receiver).
// With ICECAST_PW set it also runs Icecast 2.4.4 on :8000, mount /preview, for the `preview` target.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createFramer } from '../mp3.mjs';
import { startMix, usage } from './mixcast.mjs';
import { startGrains } from './grains.mjs';
import { startLive } from './live.mjs';

// Frames go out this far ahead of the clock, and a file is read no further ahead than READ_AHEAD.
const LEAD_S = 2, READ_AHEAD_S = 20, TICK_MS = 200;
const UA = 'positron-cast/1 (+https://positron.studio)';
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
const bootedAt = Date.now();

let s = null;              // the wanted session, or null
let lines = [], lastError = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let secrets = [];
const redact = (t) => secrets.reduce((a, x) => (x ? a.split(x).join('***') : a), String(t));
function say(line) {
  lines.push(`${new Date().toISOString().slice(11, 19)} ${redact(line)}`);
  if (lines.length > 40) lines.shift();
}
function fail(e) { lastError = { at: Date.now(), what: redact(e?.message || e) }; say(lastError.what); }

// ── the preview Icecast: started at boot when the Caster passes ICECAST_PW, restarted when it exits ──
// why: lessons/workers-cast.md#preview-icecast
const ICE_PW = process.env.ICECAST_PW || '';
const ice = { wanted: !!ICE_PW, pid: null, startedAt: null, starts: 0, exits: [], stats: null, statsAt: 0 };
function iceStart() {
  const rand = () => crypto.randomBytes(18).toString('base64url');
  fs.mkdirSync('/tmp/icecast', { recursive: true });
  const [, , u, g] = (fs.readFileSync('/etc/passwd', 'utf8').split('\n').find((l) => l.startsWith('icecast:')) || '').split(':');
  fs.chownSync('/tmp/icecast', Number(u), Number(g));
  const xml = fs.readFileSync(new URL('./icecast.xml', import.meta.url), 'utf8')
    .replaceAll('@@SOURCE@@', ICE_PW).replaceAll('@@RELAY@@', rand()).replaceAll('@@ADMIN@@', rand());
  fs.writeFileSync('/tmp/icecast/icecast.xml', xml, { mode: 0o600 });
  fs.chownSync('/tmp/icecast/icecast.xml', Number(u), Number(g));
  const p = spawn('icecast', ['-c', '/tmp/icecast/icecast.xml'], { uid: Number(u), gid: Number(g), stdio: ['ignore', 'pipe', 'pipe'] });
  ice.pid = p.pid; ice.startedAt = Date.now(); ice.starts++;
  const out = (b) => say(`icecast: ${String(b).trim().slice(0, 160)}`);
  p.stdout.on('data', out); p.stderr.on('data', out);
  p.on('exit', (code, sig) => {
    ice.pid = null;
    ice.exits.push({ at: new Date().toISOString().slice(0, 19) + 'Z', code, sig, ranS: Math.round((Date.now() - ice.startedAt) / 1000) });
    if (ice.exits.length > 10) ice.exits.shift();
    say(`icecast exited ${code ?? sig}; restarting in 1 s`);
    setTimeout(iceStart, 1000);
  });
  say(`icecast started, pid ${p.pid}`);
}
/** Icecast's own status-json, at most every 2 s; null when it does not answer. */
async function iceStats() {
  if (!ice.wanted) return null;
  if (Date.now() - ice.statsAt > 2000) {
    ice.statsAt = Date.now();
    try {
      const r = await fetch('http://127.0.0.1:8000/status-json.xsl', { signal: AbortSignal.timeout(1000) });
      const st = (await r.json()).icestats || {};
      const srcs = [].concat(st.source || []);
      ice.stats = { version: st.server_id || null, mounts: srcs.map((x) => ({ mount: new URL(x.listenurl).pathname, listeners: x.listeners,
        peak: x.listener_peak, since: x.stream_start_iso8601 || x.stream_start || null, bitrate: x.bitrate ?? x['ice-bitrate'] ?? null })) };
    } catch { ice.stats = null; }
  }
  return { running: !!ice.pid, pid: ice.pid, starts: ice.starts, upS: ice.pid ? Math.round((Date.now() - ice.startedAt) / 1000) : 0,
    exits: ice.exits, answering: !!ice.stats, ...(ice.stats || {}) };
}
if (ICE_PW) iceStart();

function sourceHead(t, title) {
  return [`PUT /${t.mount} HTTP/1.0`, `Authorization: Basic ${Buffer.from(`source:${t.pw}`).toString('base64')}`, 'Content-Type: audio/mpeg',
    'ice-name: positron cast', `ice-description: ${(title || 'Väin archive').replace(/[^\x20-\x7e]/g, '?')}`,
    'ice-genre: archive', `ice-url: ${t.mount}`, 'ice-audio-info: send_notification=0;save_stream=0'];
}

/** A source connection: `{ write(buf), close(), closed, why }`, resolved once the server says yes. */
function icecastSink(t, title) {
  return new Promise((ok, no) => {
    const sock = net.connect({ host: t.host, port: t.port });
    const sink = { closed: false, why: null };
    let got = '', settled = false;
    const done = (e) => { if (settled) return; settled = true; clearTimeout(timer); if (e) { sock.destroy(); no(e); } else ok(sink); };
    const timer = setTimeout(() => done(new Error(`${t.host} answered nothing in 8 s`)), 8000);
    sock.setNoDelay(true);
    sock.on('connect', () => sock.write([...sourceHead(t, title), '', ''].join('\r\n')));
    sock.on('data', (b) => {
      if (settled) return; // drain whatever follows the status line, as their app does
      got += b.toString('latin1');
      if (!got.includes('\r\n')) return;
      const line = got.split('\r\n')[0];
      done(line.includes(' 200') ? null : new Error(`${t.host} answered "${line}"`));
    });
    sock.on('error', (e) => { sink.why = e.message; done(e); });
    sock.on('close', () => { sink.closed = true; sink.why ||= 'the server closed the connection'; done(new Error(sink.why)); });
    // A write that does not drain in 15 s is a dead peer: destroy, so the loop reconnects instead of hanging.
    sink.write = (buf) => new Promise((res) => {
      if (sink.closed || sock.write(buf)) return res();
      const t = setTimeout(() => { sink.why = 'the server stopped reading for 15 s'; sock.destroy(); }, 15000);
      const go = () => { clearTimeout(t); sock.off('drain', go); sock.off('close', go); res(); };
      sock.on('drain', go); sock.on('close', go);
    });
    sink.close = () => sock.destroy();
  });
}

/** Our test receiver over a WebSocket: the PUT's header lines first as one text message, then audio. */
function wsSink(t, title) {
  return new Promise((ok, no) => {
    const ws = new WebSocket(t.url);
    ws.binaryType = 'arraybuffer';
    const sink = { closed: false, why: null };
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { ws.close(); } catch { /* gone */ } no(new Error('the receiver answered nothing in 8 s')); } }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({ head: sourceHead(t, title).slice(1) }));
    ws.onmessage = (e) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      const line = String(e.data);
      if (line.includes(' 200')) ok(sink); else { try { ws.close(); } catch { /* gone */ } no(new Error(`the receiver answered "${line}"`)); }
    };
    ws.onclose = (e) => { sink.closed = true; sink.why ||= `the receiver closed ${e.code} ${e.reason || ''}`.trim(); if (!settled) { settled = true; clearTimeout(timer); no(new Error(sink.why)); } };
    ws.onerror = () => { sink.why ||= 'the receiver socket failed'; };
    sink.write = async (buf) => {
      if (sink.closed) return;
      const t = Date.now();
      while (ws.bufferedAmount > 512 * 1024 && !sink.closed) {
        if (Date.now() - t > 15000) { sink.why = 'the receiver stopped reading for 15 s'; sink.closed = true; try { ws.close(); } catch { /* gone */ } return; }
        await sleep(50);
      }
      ws.send(buf);
    };
    sink.close = () => { try { ws.close(1000, 'stop'); } catch { /* gone */ } };
  });
}

const openSink = (t, title) => (t.kind === 'ws' ? wsSink(t, title) : icecastSink(t, title));

/** Opens the sink, retrying with backoff while the session is wanted. Returns the seconds it was down. */
async function connect(sess, why) {
  const t0 = Date.now();
  for (let i = 0; !sess.stopped; i++) {
    try {
      sess.sink = await openSink(sess.target, (sess.item || sess.queue[0])?.title);
      sess.onAir = true;
      say(why ? `back on air after ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'on air');
      return (Date.now() - t0) / 1000;
    } catch (e) {
      fail(e);
      sess.sinkFails++;
      await sleep(BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)]);
    }
  }
  return (Date.now() - t0) / 1000;
}

/** The queue, round and round, paced against the wall clock; a reconnect moves the clock, never bursts. */
async function run(sess) {
  await connect(sess, null);
  sess.t0 = Date.now();
  let resume = sess.resume;
  // index -1 is a queue set while a file outside it plays: start the queue from its top
  sess.index = resume && resume.index >= 0 ? resume.index - 1 : -1;
  while (!sess.stopped) {
    sess.index = (sess.index + 1) % sess.queue.length;
    sess.item = sess.queue[sess.index]; sess.skip = false; sess.fileSeconds = 0;
    const from = resume && resume.index === sess.index ? resume.at || 0 : 0;
    resume = null;
    sess.files++;
    say(`playing ${sess.item.title}${from ? ` from ${Math.round(from)} s` : ''}`);
    let reader;
    try {
      const r = await fetch(sess.item.url, { headers: { 'user-agent': UA } });
      if (!r.ok || !r.body) throw new Error(`${sess.item.title}: ${r.status}, skipped`);
      reader = r.body.getReader();
      const framer = createFramer();
      let ended = false, frames = [], ahead = 0;
      const fill = async () => {
        while (!ended && ahead < READ_AHEAD_S) {
          const { value, done } = await reader.read();
          const got = done ? framer.push(new Uint8Array(0), true) : framer.push(value);
          if (done) ended = true;
          for (const f of got) {
            if (sess.fileSeconds < from) { sess.fileSeconds += f.seconds; continue; } // resuming: skip, unsent
            frames.push(f); ahead += f.seconds;
          }
        }
      };
      await fill();
      while (!sess.stopped && !sess.skip && (frames.length || !ended)) {
        if (!sess.sink || sess.sink.closed) {
          sess.onAir = false; sess.sinkDeaths++;
          fail(new Error(`source connection lost: ${sess.sink?.why || 'closed'}`));
          const down = await connect(sess, 'lost');
          sess.t0 += down * 1000; sess.downSeconds += down;
          continue;
        }
        const due = (Date.now() - sess.t0) / 1000 + LEAD_S;
        while (frames.length && sess.sent < due && !sess.sink.closed) {
          const f = frames.shift();
          ahead -= f.seconds;
          await sess.sink.write(f.data);
          sess.sent += f.seconds; sess.fileSeconds += f.seconds;
          sess.frames++; sess.bytes += f.data.length; sess.rate = f.rate; sess.kbps = f.kbps;
        }
        if (!ended && ahead < READ_AHEAD_S / 2) await fill();
        if (sess.sent >= due || !frames.length) await sleep(TICK_MS);
      }
      sess.skipped += framer.skipped;
    } catch (e) {
      fail(e);
      await sleep(1000);
    } finally {
      try { reader?.cancel(); } catch { /* done */ }
    }
  }
}

// The mix session, when mode is 'mix' or 'grains'; copy (`s`) is the fallback and is untouched by it.
let mx = null, mxTarget = null, mxMode = null;
/** A file new to the archive has no measured length: read it with ffprobe, in place, before it lands, so its scene ends
 *  before the file does (a 31 s recording cut a scene off mid-effect, 2026-10-19). */
function probeLengths(queue) {
  for (const it of queue) {
    if (Number(it.seconds) > 0 || !it.url || it.probing) continue;
    it.probing = true;
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', it.url]);
    let out = ''; p.stdout.on('data', (b) => { out += b; });
    p.on('error', () => {}); p.on('exit', () => { const d = Number(out.trim()); if (d > 0) { it.seconds = Math.round(d); say(`${it.title}: ${it.seconds} s (probed)`); } });
  }
}
function start(body) {
  const { queue, target } = body;
  if (!Array.isArray(queue) || !queue.length) throw new Error('an empty queue');
  probeLengths(queue);
  if (!target?.pw || !target.mount) throw new Error('a target with a mount and a password');
  secrets = [target.pw, Buffer.from(`source:${target.pw}`).toString('base64')];
  if (body.mode === 'mix' || body.mode === 'grains' || body.mode === 'live') {
    if (s) stop(`switching to ${body.mode}`);
    if (mx && mxMode !== body.mode) { mx.stop(); mx = null; say(`${mxMode} stopped, switching to ${body.mode}`); }
    if (mx) {
      mx.queue(queue); for (const [k, v] of Object.entries(body.set || {})) mx.set(k, v);
      if (mxMode === 'grains' && body.patch) mx.patch(body.patch);
      mx.next(); say(`${mxMode} queue replaced, ${queue.length} files`); return;
    }
    mxTarget = target; mxMode = body.mode;
    mx = body.mode === 'live' ? startLive({ queue, target, life: body.life || {}, set: body.set || {}, resume: body.resume || null, hold: !!body.hold }, { openSink, say, fail })
      : body.mode === 'grains' ? startGrains({ queue, target, set: body.set || {}, patch: body.patch || undefined }, { openSink, say, fail })
        : startMix({ queue, target, set: body.set || {} }, { openSink, say, fail });
    say(`${body.mode} started, ${queue.length} files`);
    return;
  }
  if (mx) { mx.stop(); mx = null; say(`${mxMode} stopped, switching to copy`); }
  if (s) { s.queue = queue; s.index = -1; s.skip = true; say(`queue replaced, ${queue.length} files`); return; }
  s = { queue, target, resume: body.resume || null, index: -1, item: null, sink: null, onAir: false, stopped: false, skip: false,
    startedAt: Date.now(), t0: Date.now(), sent: 0, fileSeconds: 0, downSeconds: 0, files: 0, frames: 0, bytes: 0,
    skipped: 0, rate: 0, kbps: 0, sinkDeaths: 0, sinkFails: 0 };
  const sess = s;
  run(sess).catch((e) => fail(e)).finally(() => { if (s === sess) { s.sink?.close(); s = null; } });
}

/** Replaces what follows the current file without cutting it: the next file is queue[0]. */
function queue(body) {
  if (Array.isArray(body.queue)) probeLengths(body.queue);
  if (mx && Array.isArray(body.queue) && body.queue.length) { mx.queue(body.queue); say(`mix queue set, ${body.queue.length} files`); return; }
  if (!s) throw new Error('nothing is playing: play starts a queue');
  if (!Array.isArray(body.queue) || !body.queue.length) throw new Error('an empty queue');
  s.queue = body.queue; s.index = -1;
  say(`queue set, ${body.queue.length} files after this one`);
}

function stop(why) {
  if (mx) { mx.stop(); mx = null; say(`mix off air, ${why}`); }
  if (!s) return;
  s.stopped = true; s.sink?.close(); say(`off air, ${why}`); s = null;
}

async function status() {
  const now = Date.now();
  if (mx) {
    const x = mx.status(), on = x.slots.reduce((a, b) => (b.clear > a.clear ? b : a));
    return { icecast: await iceStats(), mode: mxMode, bootedAt, uptime: Math.round((now - bootedAt) / 1000), playing: true, onAir: x.onAir,
      now: on?.title ? { id: on.id, title: on.title, at: null } : null, index: null, next: x.next ? { id: null, title: x.next } : null,
      to: `${mxTarget.kind} /${mxTarget.mount}`, since: x.since, files: x.landings, frames: x.frames, bytes: x.bytes, seconds: x.seconds,
      wall: x.wall, lag: x.lag, lead: x.lead, down: x.down, sinkDeaths: x.sinkDeaths, sinkFails: x.sinkFails, skipped: 0, rate: 44100, kbps: 128,
      mix: x, usage: x.usage, rss: x.usage.nodeRssMiB, handoff: mx.handoff?.() ?? null, at: now, lines: lines.slice(-12), lastError };
  }
  return {
    mode: s ? 'copy' : null, usage: usage(),
    icecast: await iceStats(),
    bootedAt, uptime: Math.round((now - bootedAt) / 1000), playing: !!s, onAir: !!s?.onAir,
    now: s?.item ? { id: s.item.id, title: s.item.title, at: Math.round(s.fileSeconds) } : null,
    index: s?.index ?? null, queue: s ? s.queue.map((x) => x.title) : [], ids: s ? s.queue.map((x) => x.id) : [],
    next: s ? (({ id, title }) => ({ id, title }))(s.queue[(s.index + 1) % s.queue.length]) : null, to: s ? `${s.target.kind} /${s.target.mount}` : null,
    since: s?.startedAt ?? null, files: s?.files ?? 0, frames: s?.frames ?? 0, bytes: s?.bytes ?? 0,
    seconds: s ? +s.sent.toFixed(2) : 0, wall: s ? +((now - s.startedAt) / 1000).toFixed(2) : 0,
    // on pace this reads about minus LEAD_S: frames go out that far ahead of the clock
    lag: s ? +((now - s.t0) / 1000 - s.sent).toFixed(2) : 0, lead: LEAD_S, down: s ? +s.downSeconds.toFixed(1) : 0,
    sinkDeaths: s?.sinkDeaths ?? 0, sinkFails: s?.sinkFails ?? 0, skipped: s?.skipped ?? 0, rate: s?.rate ?? 0, kbps: s?.kbps ?? 0,
    rss: Math.round(process.memoryUsage().rss / 1048576), lines: lines.slice(-12), lastError,
  };
}

const reply = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/status') return reply(res, 200, await status());
    if (req.method !== 'POST') return reply(res, 404, { error: 'no such route' });
    let raw = '';
    for await (const c of req) raw += c;
    if (req.url === '/play') { start(JSON.parse(raw || '{}')); return reply(res, 200, await status()); }
    if (req.url === '/load') {
      if (!mx || mxMode !== 'live' || !mx.load) return reply(res, 409, { error: 'a load needs a live station on air' });
      const r = await mx.load(JSON.parse(raw || '{}'));
      return reply(res, r.ok ? 200 : 422, r);
    }
    if (req.url === '/queue') { queue(JSON.parse(raw || '{}')); return reply(res, 200, await status()); }
    if (req.url === '/next') { if (mx) mx.next(); else if (s) s.skip = true; return reply(res, 200, await status()); }
    if (req.url === '/set') {
      const b = JSON.parse(raw || '{}');
      if (!mx) return reply(res, 409, { error: 'not mixing: the value is kept for the next mix' });
      for (const [k, v] of Object.entries(b.set || { [b.name]: b.v })) if (mx.set(k, v) === null) throw new Error(`no control ${k}`);
      return reply(res, 200, await status());
    }
    if (req.url === '/step') {
      if (mxMode !== 'live' || !mx) return reply(res, 409, { error: 'not live: a step is a scene of the life' });
      const b = JSON.parse(raw || '{}');
      if (b.by !== 1 && b.by !== -1) throw new Error('step by 1 or -1');
      if (!mx.step(b.by)) return reply(res, 409, { error: 'a step is already on its way' });
      return reply(res, 200, await status());
    }
    if (req.url === '/patch') {
      if (mxMode !== 'grains' || !mx) return reply(res, 409, { error: 'not in grains mode: the patch is kept for the next start' });
      const r = mx.patch(JSON.parse(raw || '{}'));
      if (r.refused.length) say(`patch refused ${r.refused.join(', ')}`);
      return reply(res, 200, await status());
    }
    if (req.url === '/stop') { stop('asked to stop'); return reply(res, 200, await status()); }
    // a held twin takes the mount: the Caster sends it right after the old source's /stop
    if (req.url === '/go') { if (!mx?.go?.()) return reply(res, 409, { error: 'nothing is held' }); return reply(res, 200, await status()); }
    return reply(res, 404, { error: 'no such route' });
  } catch (e) { fail(e); return reply(res, 400, { error: redact(e.message) }); }
}).listen(8080, () => say('listening on 8080'));
