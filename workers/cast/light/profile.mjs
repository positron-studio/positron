// node /app/light/profile.mjs [--chain today|light] [--seconds 70] [--poll 250] [--name x] [--wav]
// A station's live run on the three cached files, in the grains image, measured from second 10 to the end:
// the container's cgroup CPU, each process's CPU and each thread's, memory, lag and xruns. Not on air: the
// MP3 goes to /out/<name>.mp3. Run from the repo root:
//   docker run --rm --name cast-light-prof --cpus 1 --memory 3072m -v $PWD/workers/cast:/app \
//     -v <files>:/files:ro -v <out>:/out grains-local node /app/light/profile.mjs --chain today
import { readFileSync, readdirSync, createWriteStream, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const argv = process.argv.slice(2), flag = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const CHAIN = flag('--chain', 'today'), S = Number(flag('--seconds', 70)), POLL = Number(flag('--poll', 250));
const LIVE_AT = Number(flag('--live-at', 0)), NAME = flag('--name', CHAIN), WAV = argv.includes('--wav'), FROM = 10, seed = Number(flag('--seed', 7));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { startLive } = CHAIN === 'light' ? await import('./live-light.mjs') : await import('./today/live.mjs');
const dir = flag('--files', '/files');
const q = [['driving', 'evt_1791874248959', -1.3, 'field', true, 102], ['evening', 'evt_1791829792104', -1.4, 'music', false, 132], ['kalle', 'evt_1791488203609', -8.2, 'music', true, 319]]
  .map(([t, id, gain, kind, soften, seconds]) => ({ id, title: t, url: `${dir}/${t}.mp3`, gain, kind, soften, seconds }));

// the output PCM as a WAV, written as it comes (s16 stereo 44.1 kHz), header fixed at the end
let wfd = null, wbytes = 0;
if (WAV) { wfd = openSync(`/out/${NAME}.wav`, 'w'); writeSync(wfd, Buffer.alloc(44)); globalThis.__lightTap = (b) => { writeSync(wfd, b); wbytes += b.length; }; }
const file = createWriteStream(`/out/${NAME}.mp3`), logs = [], t0 = Date.now();
const say = (l) => logs.push(`${((Date.now() - t0) / 1000).toFixed(1)} ${l}`);
const openSink = async () => ({ closed: false, write: (b) => new Promise((r) => file.write(b, r)), close() {} });
const L = startLive({ queue: q, target: { kind: 'file', mount: 'test' }, life: { seed, votes: [] } }, { openSink, say, fail: (e) => say(`FAIL ${e.message || e}`) });

const cg = (k) => { try { return readFileSync(`/sys/fs/cgroup/${k}`, 'utf8'); } catch { return null; } };
const cgCpu = () => Number(/usage_usec (\d+)/.exec(cg('cpu.stat') || '')?.[1] ?? NaN);
const throttled = () => { const s = cg('cpu.stat') || ''; return { periods: Number(/nr_throttled (\d+)/.exec(s)?.[1] ?? NaN), usec: Number(/throttled_usec (\d+)/.exec(s)?.[1] ?? NaN) }; };
const cmdOf = (d) => { try { return readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { return ''; } };
const procName = (d, comm) => (comm === 'ffmpeg' ? (cmdOf(d).includes('libmp3lame') ? 'ffmpeg (LAME)' : 'ffmpeg (decode)') : comm);
const ticksOf = (raw) => { const f = raw.slice(raw.lastIndexOf(')') + 2).split(' '); return (Number(f[11]) + Number(f[12])) / 100; };
const sysOf = (raw) => Number(raw.slice(raw.lastIndexOf(')') + 2).split(' ')[12]) / 100;
const commOf = (raw) => raw.slice(raw.indexOf('(') + 1, raw.lastIndexOf(')'));
/** CPU seconds by process name and by process/thread name; dead processes drop out (their seconds are counted in the cgroup only). */
function snapshot() {
  const proc = {}, thr = {};
  for (const d of readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
    try {
      const raw = readFileSync(`/proc/${d}/stat`, 'utf8'), name = procName(d, commOf(raw));
      if (name === 'sh' || name === 'docker-init') continue;
      proc[name] = (proc[name] || 0) + ticksOf(raw); proc[`${name} (kernel)`] = (proc[`${name} (kernel)`] || 0) + sysOf(raw);
      for (const t of readdirSync(`/proc/${d}/task`)) {
        try { const tr = readFileSync(`/proc/${d}/task/${t}/stat`, 'utf8'), k = `${name} / ${commOf(tr)}`; thr[k] = (thr[k] || 0) + ticksOf(tr); } catch { /* gone */ }
      }
    } catch { /* gone */ }
  }
  return { proc, thr };
}
const rss = () => { const o = {}; for (const d of readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { try {
  const raw = readFileSync(`/proc/${d}/stat`, 'utf8'), n = procName(d, commOf(raw)), m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${d}/status`, 'utf8'));
  if (m) o[n] = +((o[n] || 0) + Number(m[1]) / 1024).toFixed(1); } catch { /* gone */ } } return o; };

// --live-at T: at T s a live source arrives, a file played into a FIFO at its own speed (ffmpeg -re), queued next
let liveProc = null, liveAt = null;
function goLive() {
  spawnSync('rm', ['-f', '/tmp/live.fifo']); spawnSync('mkfifo', ['/tmp/live.fifo']);
  liveProc = spawn('ffmpeg', ['-v', 'error', '-re', '-i', `${dir}/kalle.mp3`, '-c', 'copy', '-f', 'mp3', '-y', '/tmp/live.fifo'], { stdio: 'ignore' });
  const live = { id: 'live', title: 'live', url: '/tmp/live.fifo', gain: -8.2, kind: 'music', soften: true };
  L.queue([live, ...q]); L.next(); liveAt = L.engine.seconds; say(`test: a live source queued at mix ${liveAt.toFixed(2)} s`);
}
process.on('exit', () => { try { liveProc?.kill('SIGKILL'); } catch { /* gone */ } });
let c0 = null, s0 = null, th0 = null, tc0 = 0, x10 = null, maxMem = 0, maxBack = 0, maxAhead = -Infinity, minAhead = Infinity, maxLag = -Infinity, samples = 0, last = null;
while ((Date.now() - t0) / 1000 < S) {
  await sleep(POLL);
  const t = (Date.now() - t0) / 1000, s = L.status(); last = s; samples++;
  if (LIVE_AT && !liveProc && t >= LIVE_AT) goLive();
  const mem = Number(cg('memory.current')) / 1048576; if (mem > maxMem) maxMem = mem;
  if (!c0 && t >= FROM) { c0 = cgCpu(); s0 = snapshot(); th0 = throttled(); tc0 = t; x10 = s.grains?.chain?.xruns ?? 0; }
  if (c0) { maxBack = Math.max(maxBack, s.backlog ?? 0); maxAhead = Math.max(maxAhead, s.ahead ?? 0); minAhead = Math.min(minAhead, s.ahead ?? 0); maxLag = Math.max(maxLag, s.lag ?? 0); }
}
const c1 = cgCpu(), s1 = snapshot(), th1 = throttled(), span = (Date.now() - t0) / 1000 - tc0, mems = rss();
const pct = (a, b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, +(((v - (a?.[k] ?? 0)) / span) * 100).toFixed(2)])).valueOf();
const per = pct(s0.proc, s1.proc), thr = Object.fromEntries(Object.entries(pct(s0.thr, s1.thr)).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]));
const st = last, ch = st.grains?.chain;
const out = {
  chain: CHAIN, name: NAME, seconds: +span.toFixed(1), poll: POLL, noClock: process.env.LIGHT_NO_CLOCK === '1', period: ch?.period ?? null,
  cgroupPct: +(((c1 - c0) / 1e6 / span) * 100).toFixed(2), throttled: { periods: th1.periods - th0.periods, ms: Math.round((th1.usec - th0.usec) / 1000) },
  perProcess: Object.fromEntries(Object.entries(per).sort((a, b) => b[1] - a[1])), threads: thr,
  memPeakMiB: Math.round(maxMem), rssMiB: mems,
  mixSeconds: +L.engine.seconds.toFixed(2), wall: +((Date.now() - t0) / 1000).toFixed(2), lagEnd: st.lag, maxLag: +maxLag.toFixed(2),
  ahead: [+minAhead.toFixed(2), +maxAhead.toFixed(2)], maxBacklog: +maxBack.toFixed(3), xruns: [x10, ch?.xruns ?? null], underruns: st.underruns,
  live: LIVE_AT ? { queuedAtMix: liveAt, onAir: st.slots?.find((x) => x.title === 'live') ?? null, landed: logs.filter((l) => /landed on slot .: live|scene .*on live/.test(l)) } : null,
  life: st.life ? { si: st.life.si, counts: st.life.counts, layersUp: st.life.layersUp } : null, glitches: st.light ?? null,
};
L.stop(); await sleep(1500); file.end();
if (wfd != null) {
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + wbytes, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(44100, 24); h.writeUInt32LE(44100 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(wbytes, 40);
  writeSync(wfd, h, 0, 44, 0); closeSync(wfd);
}
writeFileSync(`/out/${NAME}.json`, JSON.stringify(out, null, 1));
writeFileSync(`/out/${NAME}.log`, logs.join('\n'));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
