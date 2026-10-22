// node workers/edgecast-relay/relay-test.mjs: the source head, Icecast's answers, the silent frame (decoded by
// ffmpeg), the pacer and the gap filler on a fake clock, the relay's reconnects and refusals on a fake Icecast,
// openSource on a fake socket, and the station's feed. No network.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceHead, readStatus, silentFrame, createPacer, concat } from './icecast.mjs';
import { openSource } from './source.mjs';
import { createRelay, IN_USE_GIVE_UP_MS } from './relay-core.mjs';
import { frameAt, createFramer } from '../cast/mp3.mjs';
import { createRelayFeed } from '../edgecast/relay-feed.mjs';

let pass = 0, fail = 0;
const ok = (name, c, info = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${name}${info ? ` | ${info}` : ''}`); c ? pass++ : fail++; };
const tick = () => new Promise((r) => setImmediate(r));

// ── the head ──
{
  const b = sourceHead({ mount: 'radio1965', pw: 'p:w' }), s = String.fromCharCode(...b), lines = s.split('\r\n');
  ok('the request line is PUT /<mount> HTTP/1.0', lines[0] === 'PUT /radio1965 HTTP/1.0', lines[0]);
  ok('Basic auth is source:<password>', Buffer.from(lines[1].split(' ')[2], 'base64').toString() === 'source:p:w');
  ok('ice-name is Väin in Latin-1 (one byte 0xE4, not UTF-8 C3 A4)', b.includes(0xe4) && !b.includes(0xc3) && lines.includes('ice-name: Väin'));
  ok('the same lines as the cast sends, in order, with the description', JSON.stringify(lines.slice(2, 8)) === JSON.stringify(['Content-Type: audio/mpeg', 'ice-name: Väin', 'ice-description: Mixed by positron.studio', 'ice-genre: archive', 'ice-url: radio1965', 'ice-audio-info: send_notification=0;save_stream=0']));
  ok('the head ends with an empty line', s.endsWith('\r\n\r\n'));
}

// ── Icecast's answers ──
ok('200 is on air', readStatus('HTTP/1.0 200 OK\r\n\r\n')?.ok === true);
ok('401 is refused-auth', readStatus('HTTP/1.0 401 Authentication Required\r\n')?.why === 'refused-auth');
ok('403 is refused-in-use', readStatus('HTTP/1.0 403 Forbidden\r\nContent-Type: text/html\r\n\r\nMountpoint in use')?.why === 'refused-in-use');
ok('half a line is no answer yet', readStatus('HTTP/1.0 20') === null);
ok('NEGATIVE CONTROL: a body saying 200 after a 500 line is not on air', readStatus('HTTP/1.0 500 x\r\n 200')?.ok === false);

// ── the silent frame ──
const dir = mkdtempSync(join(tmpdir(), 'relay-test-'));
try {
  const sf = silentFrame();
  const h = frameAt(sf.data, 0);
  ok('the default silent frame is MPEG-1 Layer III 44.1 kHz 128 kbit/s, 417 bytes, 26.1 ms', h && h.rate === 44100 && h.kbps === 128 && sf.data.length === 417 && Math.abs(sf.seconds - 1152 / 44100) < 1e-9, JSON.stringify(h));
  const f = join(dir, 'sine.mp3');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', '-write_xing', '0', '-id3v2_version', '0', f]);
  const real = createFramer().push(new Uint8Array(execFileSync('cat', [f])), true);
  const like = silentFrame(real[5].data);
  ok('a silent frame takes the station frame\'s rate and bitrate', frameAt(like.data, 0).rate === real[5].rate && frameAt(like.data, 0).kbps === real[5].kbps);
  // sine, 4 s of silence, sine: decodes with no error, and the middle is silent
  const sil = Array.from({ length: Math.round(4 / like.seconds) }, () => like);
  const mixed = join(dir, 'mixed.mp3');
  writeFileSync(mixed, concat([...real, ...sil, ...real]));
  const err = execFileSync('ffmpeg', ['-v', 'error', '-i', mixed, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  ok('ffmpeg decodes station frames, silence, station frames with no error', err.trim() === '', err.slice(0, 120));
  const vd = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -ss 3.5 -t 3 -i '${mixed}' -af volumedetect -f null - 2>&1 | grep max_volume`], { encoding: 'utf8' });
  ok('the silent stretch decodes to digital silence', /max_volume: -(9[01]|inf)/.test(vd), vd.trim());
  const vs = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -t 2 -i '${mixed}' -af volumedetect -f null - 2>&1 | grep max_volume`], { encoding: 'utf8' });
  ok('NEGATIVE CONTROL: the sine stretch is not silent', !/max_volume: -(9[01]|inf)/.test(vs), vs.trim());
  const sd = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i '${mixed}' -af silencedetect=n=-60dB:d=0.5 -f null - 2>&1 | grep -c silence_end || true`], { encoding: 'utf8' });
  ok('silencedetect finds exactly the one silent stretch', sd.trim() === '1', sd.trim());
} finally { rmSync(dir, { recursive: true, force: true }); }

// ── the pacer ──
const fr = (i) => ({ data: Uint8Array.from([0xff, 0xfb, 0x90, 0x44, i & 255]), seconds: 1152 / 44100 });
{
  let t = 1000;
  const p = createPacer({ leadS: 1, fillS: 0.25, maxQueueS: 8, now: () => t });
  for (let i = 0; i < 230; i++) p.push(fr(i)); // 6 s
  let sent = p.take(t);
  ok('the first take sends the lead, 1 s', Math.abs(p.sentS - 1) < 0.03, `${p.sentS.toFixed(3)} s`);
  for (let k = 0; k < 40; k++) { t += 100; sent = sent.concat(p.take(t)); }
  ok('after 4 s of wall, 5 s are sent (the wall plus the lead), all from the station', Math.abs(p.sentS - 5) < 0.03 && p.st.silentFrames === 0, `${p.sentS.toFixed(3)} s`);
  ok('in order', sent.every((f, i) => f.data[4] === (i & 255)));
  for (let k = 0; k < 60; k++) { t += 100; p.take(t); }
  ok('the station dry for 4 s: silence fills, the lead never under 0.25 s', p.st.silentFrames > 0 && p.sentS >= (t - 1000) / 1000 + 0.2, `silence ${p.st.silentS.toFixed(2)} s, lead ${(p.sentS - (t - 1000) / 1000).toFixed(3)} s`);
  const need = (t - 1000) / 1000 + 0.25 - 230 * 1152 / 44100;
  ok('silence is only what the wall needed (the wall plus the 0.25 s floor, less the 6 s the station gave, within a frame)', p.st.silentS >= need - 0.001 && p.st.silentS <= need + 0.027, `${p.st.silentS.toFixed(3)} s against ${need.toFixed(3)} s`);
  for (let i = 0; i < 100; i++) p.push(fr(i));
  t += 100; p.take(t);
  ok('the station back: the gap is recorded with its length', p.st.gaps.length === 1 && p.st.gaps[0].s > 2, JSON.stringify(p.st.gaps));
  ok('and station frames go out again, filling the lead back to 1 s', !p.filling && Math.abs(p.sentS - ((t - 1000) / 1000 + 1)) < 0.03);
  for (let i = 0; i < 1000; i++) p.push(fr(i));
  ok('a queue past 8 s is cut to 8 s, the oldest first', p.queuedS <= 8.01 && p.st.droppedS > 15, `${p.queuedS} s queued, ${p.st.droppedS.toFixed(1)} s dropped`);
  p.restart(t);
  ok('a restart (a reconnect) keeps only the lead', p.queuedS <= 1.01 && p.sentS === 0);
}
{
  let t = 0;
  const p = createPacer({ leadS: 1, fillS: 0.25, now: () => t });
  p.take(t); t += 5000; const out = p.take(t);
  ok('NEGATIVE CONTROL: with no station at all the pacer still keeps the mount fed', p.st.silentS > 5 && out.every((f) => f.silent));
}

// a station back after a gap posts 0.5 s every 0.5 s, some posts 150 ms late (measured in the rehearsal: with no
// re-buffer the relay cut a 52 ms hole at every late post)
const jitter = (resumeS) => {
  let t = 0, i = 0;
  const p = createPacer({ leadS: 1, fillS: 0.25, resumeS, now: () => t });
  for (; t < 5000; t += 100) p.take(t); // a gap of 5 s, silence going out
  for (let post = 0; post < 40; post++) {
    const due = 5000 + post * 500 + (post % 3 === 1 ? 150 : 0);
    for (; t < due; t += 50) p.take(t);
    for (let k = 0; k < 19; k++) p.push(fr(i++));
  }
  for (; t < 26000; t += 50) p.take(t);
  return p.st.gaps;
};
{
  const g = jitter(1), g0 = jitter(0);
  ok('a station back after a gap is let in once 1 s is queued: one gap, then none', g.length === 1, `${g.length} gaps: ${JSON.stringify(g.slice(0, 3))}`);
  ok('NEGATIVE CONTROL: let in at once, late posts cut holes', g0.length > 3, `${g0.length} gaps`);
}

// ── openSource on a fake socket ──
function fakeSocket(answer, { hang = false, closeAfter = false } = {}) {
  const wrote = [];
  let push, closedRes;
  const readable = new ReadableStream({ start(c) { push = c; } });
  const sock = {
    opened: Promise.resolve(), closed: new Promise((r) => { closedRes = r; }), wrote,
    readable, writable: new WritableStream({ write(chunk) { wrote.push(chunk); if (wrote.length === 1 && !hang) { push.enqueue(Buffer.from(answer, 'latin1')); if (closeAfter) push.close(); } } }),
    close() { try { push.close(); } catch { /* closed */ } closedRes(); },
  };
  return sock;
}
{
  let s1;
  const sink = await openSource({ connect: () => (s1 = fakeSocket('HTTP/1.0 200 OK\r\n\r\n')), host: 'h', port: 1, mount: 'm', pw: 'x' });
  ok('openSource resolves on 200 after writing the head', !!sink && String.fromCharCode(...s1.wrote[0]).startsWith('PUT /m HTTP/1.0'));
  ok('a write goes to the socket', (await sink.write(new Uint8Array([1, 2, 3]))) && s1.wrote.length === 2);
  sink.close();
  ok('after close, a write is refused and the reason is kept', !(await sink.write(new Uint8Array([1]))) && sink.why === 'closed by the relay');
  const why = async (o) => { try { await openSource({ host: 'h', port: 1, mount: 'm', pw: 'x', answerMs: 50, ...o }); return 'opened'; } catch (e) { return e.why; } };
  ok('401 rejects as refused-auth', (await why({ connect: () => fakeSocket('HTTP/1.0 401 Authentication Required\r\n\r\n') })) === 'refused-auth');
  ok('403 rejects as refused-in-use', (await why({ connect: () => fakeSocket('HTTP/1.0 403 Forbidden\r\n\r\nMountpoint in use') })) === 'refused-in-use');
  ok('silence rejects as timeout', (await why({ connect: () => fakeSocket('', { hang: true }) })) === 'timeout');
  ok('a close before any answer rejects as refused', (await why({ connect: () => fakeSocket('', { closeAfter: true }) })) === 'refused');
  ok('a throwing connect rejects as unreachable', (await why({ connect: () => { throw new Error('no route'); } })) === 'unreachable');
  ok('no host rejects as unconfigured, before any connect', (await why({ host: '', connect: () => { throw new Error('reached'); } })) === 'unconfigured');
}

// ── the relay on a fake Icecast ──
function fakeIcecast(plan) {
  const ice = { attempts: 0, sinks: [], bytes: 0 };
  ice.open = async () => {
    const step = plan[Math.min(ice.attempts++, plan.length - 1)];
    if (step !== 'ok') throw Object.assign(new Error(step), { why: step });
    let res;
    const s = { why: null, closed: new Promise((r) => { res = r; }), write: async (b) => { if (s.why) return false; ice.bytes += b.length; return true; }, close: () => { if (!s.why) { s.why = 'closed by the relay'; res(s.why); } }, drop: (w) => { s.why = w; res(w); } };
    ice.sinks.push(s);
    return s;
  };
  return ice;
}
{
  let t = 0;
  const ice = fakeIcecast(['timeout', 'ok', 'ok']);
  const r = createRelay({ openSink: ice.open, now: () => t, sleep: async (ms) => { t += ms; await tick(); } });
  r.start(t + 60_000);
  for (let i = 0; i < 5; i++) await tick();
  ok('a timeout is retried and the relay goes on air', r.st.state === 'on-air' && ice.attempts === 2, `${r.st.state} after ${ice.attempts} attempts`);
  for (let k = 0; k < 20; k++) { t += 100; await r.tick(); }
  ok('with no station yet, silence keeps the mount fed', ice.bytes > 0 && r.pacer.st.silentFrames > 0, `${ice.bytes} B`);
  const real = Array.from({ length: 40 }, (_, i) => { const d = new Uint8Array(417); d.set([0xff, 0xfb, 0x90, 0x44, i]); return { data: d, seconds: 1152 / 44100 }; });
  r.push(concat(real));
  for (let k = 0; k < 20; k++) { t += 100; await r.tick(); }
  ok('station frames pushed as one body come out as whole frames, all 40', r.pacer.st.stationFrames === 40, `${r.pacer.st.stationFrames} frames`);
  ice.sinks[0].drop('the server closed the connection');
  for (let i = 0; i < 5; i++) await tick();
  ok('a dropped source is taken again', r.st.state === 'on-air' && ice.attempts === 3 && r.st.drops.length === 1, `${r.st.state}, ${ice.attempts} attempts`);
  t = 60_001; await r.tick();
  ok('the cap stops it and lets go of the mount', r.st.state === 'off' && r.st.why === 'the cap' && ice.sinks[1].why === 'closed by the relay');
}
{
  let t = 0;
  const ice = fakeIcecast(['refused-auth']);
  const r = createRelay({ openSink: ice.open, now: () => t, sleep: async (ms) => { t += ms; await tick(); } });
  r.start(t + 60_000);
  for (let i = 0; i < 10; i++) await tick();
  ok('401 is not retried and is reported', r.st.state === 'refused-auth' && ice.attempts === 1);
}
{
  let t = 0;
  const ice = fakeIcecast(['refused-in-use', 'refused-in-use', 'ok']);
  const r = createRelay({ openSink: ice.open, now: () => t, sleep: async (ms) => { t += ms; await tick(); } });
  r.start(t + 600_000);
  for (let i = 0; i < 10; i++) await tick();
  ok('403 in use is retried every 5 s and goes on air when the mount frees', r.st.state === 'on-air' && t === 10_000, `${r.st.state} at ${t} ms`);
}
{
  let t = 0;
  const ice = fakeIcecast(['refused-in-use']);
  const r = createRelay({ openSink: ice.open, now: () => t, sleep: async (ms) => { t += ms; await tick(); } });
  r.start(t + 600_000);
  for (let i = 0; i < 40; i++) await tick();
  ok(`403 for ${IN_USE_GIVE_UP_MS / 1000} s gives up and says so`, r.st.state === 'refused-in-use' && t >= IN_USE_GIVE_UP_MS, `${r.st.state} at ${t} ms after ${ice.attempts}`);
}

// ── the station's feed ──
{
  const got = [];
  const feed = createRelayFeed({ post: async (b) => { got.push(b); return { ok: true }; }, maxBytes: 12 });
  feed.push(fr(1)); feed.push(fr(2)); feed.push(fr(3));
  await feed.flush(); await feed.flush();
  ok('the feed posts what collected as one body, once', got.length === 1 && got[0].length === 10 && got[0][4] === 1 && got[0][9] === 2);
  ok('past maxBytes a frame is dropped and counted', feed.st.dropped === 5);
  const bad = createRelayFeed({ post: async () => ({ ok: false, status: 403 }) });
  bad.push(fr(1)); await bad.flush();
  ok('a refused post is counted, not thrown', bad.st.failed === 1 && /403/.test(bad.st.lastError));
  let t = 0, sent = 0;
  const idle = createRelayFeed({ post: async () => { sent++; return { ok: true, idle: true }; }, idleMs: 10_000, now: () => t });
  idle.push(fr(1)); await idle.flush();
  idle.push(fr(2)); await idle.flush();
  ok('an idle relay is not posted to again inside idleMs', sent === 1 && idle.st.idle === 5);
  t = 10_001; idle.push(fr(3)); await idle.flush();
  ok('after idleMs the relay is asked again', sent === 2);
  const live = createRelayFeed({ post: async () => { sent++; return { ok: true }; }, now: () => t });
  sent = 0; live.push(fr(1)); await live.flush(); live.push(fr(2)); await live.flush();
  ok('control: a relay on air gets every flush', sent === 2);
}

console.log(`\n${pass}/${pass + fail} ${fail ? 'RED' : 'green'}`);
process.exit(fail ? 1 : 0);
