// node workers/cast/grains-test.mjs: stage 2's pure parts, anywhere (5 of the asserts are NEGATIVE CONTROLS).
// --live S a.mp3 b.mp3 [--mix 0|1] [--patch Name] [--at 50:tone=600] [--out f.mp3]: the whole chain, in the
// grains image only, into a file; prints a JSON report. --analyse on.mp3 [off.mp3] [--split 50]: the measures.
import { readFileSync, readdirSync, createWriteStream, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const argv = process.argv.slice(2), flag = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };

if (argv[0] === '--live') await live();
else if (argv[0] === '--analyse') analyse();
else await pure();

async function pure() {
  // ── 1. the program is the page's, byte for byte ──
  const { SC_FILES } = await import('./sc-files.mjs');
  const pairs = SC_FILES.map((f) => [`sc/${f}`, `demo/${f}`]);
  for (const [ours, page] of pairs) {
    let same = false;
    try { same = readFileSync(`${HERE}container/${ours}`, 'utf8') === readFileSync(`${HERE}../../${page}`, 'utf8'); } catch { /* absent */ }
    ok(`container/${ours} is ${page}`, same);
  }
  const G = await import('./container/grains.mjs');
  const { PROGRAM, DEFAULTS, PATCHES, valuesOf } = await import('./container/sc/granulator/grain-ring.mjs');
  const { compile } = await import('./container/sc/shell/sclang-lite.mjs');
  ok('node has no DOM here, so the compile below needs none', typeof document === 'undefined' && typeof window === 'undefined');
  const c = compile(PROGRAM, { name: 'gring' });
  const names = (c.controls || []).map((x) => x.name);
  ok('PROGRAM compiles in node to a SynthDef', c.ok && c.bytes?.length > 1000, `${c.bytes?.length} B`);
  ok('the definition starts SCgf, version 2', c.ok && Buffer.from(c.bytes.subarray(0, 4)).toString() === 'SCgf' && Buffer.from(c.bytes).readInt32BE(4) === 2);
  ok('every DEFAULTS control and mix is a control of the definition', [...Object.keys(DEFAULTS), 'mix', 'buf', 'inbus'].every((k) => names.includes(k)), names.join(' '));
  ok('NEGATIVE CONTROL: a misspelt UGen does not compile', !compile(PROGRAM.replace('GrainBuf.ar', 'GrainBuff.ar'), { name: 'x' }).ok);

  // ── 2. a patch is clamped values ──
  const dub = G.clampPatch({ name: 'Dub' });
  ok('a patch by name is its values over DEFAULTS', dub.patch === 'Dub' && dub.values.echo === 0.72 && dub.values.dir === 1 && !dub.refused.length);
  const wild = G.clampPatch({ set: { density: 1000, tone: 5, echo: 1.2, mix: 0.5 } });
  ok('values past the limits are clamped to them', wild.values.density === 64 && wild.values.tone === 200 && wild.values.echo === 0.9 && wild.values.mix === 0.5);
  ok('NEGATIVE CONTROL: an unknown control and a NaN are refused, not sent', (() => { const r = G.clampPatch({ set: { gate: 1, size: 'big' } }); return !('gate' in r.values) && !('size' in r.values) && r.refused.join() === 'gate,size'; })());
  ok('NEGATIVE CONTROL: an unknown patch name is refused', G.clampPatch({ name: 'Nope' }).refused[0] === 'patch Nope');
  ok('NEGATIVE CONTROL: dir is -1 or 1, never in between', G.clampPatch({ set: { dir: 0.3 } }).values.dir === 1 && G.clampPatch({ set: { dir: -0.2 } }).values.dir === -1);
  ok('every DEFAULTS control has a limit', Object.keys(DEFAULTS).every((k) => G.PATCH_LIMITS[k]));
  const outside = PATCHES.flatMap((p) => Object.entries(valuesOf(p)).filter(([k, v]) => { const l = G.PATCH_LIMITS[k]; return v < l[0] || v > l[1]; }).map(([k]) => `${p.name}.${k}`));
  ok('every page patch sits inside the limits, so a stored patch is not changed by them', !outside.length, outside.join(' '));

  // ── 3. OSC as scsynth reads it ──
  const msg = G.oscMessage('/n_set', [4000, 'tone', 600.5, 'dir', -1]);
  ok('an OSC message is four byte aligned', msg.length % 4 === 0);
  const back = G.oscParse(msg);
  ok('it parses back to the same address and arguments', back.address === '/n_set' && back.args.join() === '4000,tone,600.5,dir,-1');
  ok('NEGATIVE CONTROL: 600 goes as an int and 600.5 as a float', G.oscMessage('/x', [600]).includes(Buffer.from(',i')) && G.oscMessage('/x', [600.5]).includes(Buffer.from(',f')));
  const blob = G.oscParse(G.oscMessage('/d_recv', [new Uint8Array([1, 2, 3, 4, 5])]));
  ok('a blob round trips with its length', blob.args[0].length === 5 && blob.args[0][4] === 5);
  console.log(`\n${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
}

// ── the chain, live, in the grains image ──
async function live() {
  const S = Number(argv[1] || 75), files = argv.slice(2).filter((a) => a.endsWith('.mp3') && a !== flag('--out')).slice(0, 2);
  const out = flag('--out', '/tmp/grains.mp3'), mix = Number(flag('--mix', 1)), name = flag('--patch', 'Cloud');
  const at = (flag('--at', '') || '').split(',').filter(Boolean).map((x) => { const [t, kv] = x.split(':'); const [k, v] = kv.split('='); return { t: Number(t), k, v: Number(v), done: false }; });
  const { startGrains } = await import('./container/grains.mjs');
  const file = createWriteStream(out), t0 = Date.now(), rows = [], logs = [];
  const say = (l) => logs.push(`${((Date.now() - t0) / 1000).toFixed(2)} ${l}`);
  const openSink = async () => ({ closed: false, write: (b) => new Promise((r) => file.write(b, r)), close() {} });
  const items = files.map((f, i) => ({ id: String(i), title: f.split('/').at(-1), url: f }));
  const g = startGrains({ queue: items, target: { kind: 'file' }, set: { dwell: 25, blend: 10 }, patch: { name, set: { mix } } }, { openSink, say, fail: (e) => say(`FAIL ${e.message || e}`) });
  const cgroup = () => { try { return { cpuUsec: Number(/usage_usec (\d+)/.exec(readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8'))[1]), memB: Number(readFileSync('/sys/fs/cgroup/memory.current', 'utf8')), peakB: Number(readFileSync('/sys/fs/cgroup/memory.peak', 'utf8')) }; } catch { return null; } };
  // every process in the container by command, so the decoders and LAME are counted too
  const byComm = () => { const o = {}; for (const d of (() => { try { return readdirSync('/proc'); } catch { return []; } })()) { if (!/^\d+$/.test(d)) continue;
    try { const raw = readFileSync(`/proc/${d}/stat`, 'utf8'), comm = raw.slice(raw.indexOf('(') + 1, raw.lastIndexOf(')')), f = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
      const rss = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${d}/status`, 'utf8'))?.[1] || 0) / 1024;
      const k = comm === 'ffmpeg' ? (readFileSync(`/proc/${d}/cmdline`, 'utf8').includes('libmp3lame') ? 'ffmpeg (LAME)' : 'ffmpeg (decode)') : comm;
      o[k] ||= { cpuS: 0, rssMiB: 0, n: 0 }; o[k].cpuS += (Number(f[11]) + Number(f[12])) / 100; o[k].rssMiB += rss; o[k].n++; } catch { /* gone */ } } return o; };
  let base = null, cg0 = null, pc0 = null;
  while (Date.now() - t0 < S * 1000) {
    await new Promise((r) => setTimeout(r, 1000));
    const s = g.status(), t = (Date.now() - t0) / 1000, ch = s.grains.chain;
    for (const a of at) if (!a.done && t >= a.t) { a.done = true; const r = g.patch({ set: { [a.k]: a.v } }); say(`patch ${a.k}=${a.v} applied ${JSON.stringify(r.values)}`); if (g.chain) say(`read back ${a.k} = ${await g.chain.read(a.k)}`); }
    // the CPU window starts at 10 s, once everything is up and the first file plays
    if (!base && t >= 10 && ch) { base = { t, lag: s.lag, mp3: s.mp3Seconds, procs: ch.procs, sc: ch.scsynth }; cg0 = cgroup(); pc0 = byComm(); }
    rows.push({ t: +t.toFixed(1), lag: s.lag, ahead: s.ahead, mp3: s.mp3Seconds, out: s.grains.out, grains: ch?.grains, xruns: ch?.xruns, late: ch?.late,
      sc: ch?.scsynth && { avg: ch.scsynth.avgCPU, peak: ch.scsynth.peakCPU, sr: ch.scsynth.actualSR }, underruns: s.underruns, phase: s.phase });
  }
  const s = g.status(), ch = s.grains.chain, t = (Date.now() - t0) / 1000, cg1 = cgroup();
  const pc1 = byComm(), byCommand = {};
  for (const [k, v] of Object.entries(pc1)) byCommand[k] = { cpuPct: +(((v.cpuS - (pc0?.[k]?.cpuS ?? 0)) / (t - base.t)) * 100).toFixed(1), rssMiB: +v.rssMiB.toFixed(1), n: v.n };
  const per = {};
  for (const [k, p] of Object.entries(ch.procs)) {
    const p0 = base?.procs[k];
    per[k] = p && p0 ? { cpuPct: +(((p.cpuS - p0.cpuS) / (t - base.t)) * 100).toFixed(1), rssMiB: p.rssMiB } : p;
  }
  const report = { seconds: +t.toFixed(1), file: out, mix, patch: name, timing: ch.timing, defBytes: ch.defBytes, xruns: ch.xruns, late: ch.late, grains: ch.grains,
    grainsPerSec: +(ch.grains / (t - ch.timing.synthMs / 1000)).toFixed(1), chainStarts: s.grains.chainStarts, dead: ch.dead,
    lag: { at10: base?.lag, end: s.lag, drift: base ? +(s.lag - base.lag).toFixed(3) : null, over: base ? +(t - base.t).toFixed(1) : null },
    mp3Seconds: s.mp3Seconds, scsynth: ch.scsynth, procs: per, byCommand,
    container: cg0 && cg1 ? { cpuPct: +(((cg1.cpuUsec - cg0.cpuUsec) / 1e6) / (t - base.t) * 100).toFixed(1), memMiB: Math.round(cg1.memB / 1048576), peakMiB: Math.round(cg1.peakB / 1048576) } : null,
    underruns: s.underruns, landings: s.landings, lines: ch.lines, logs };
  g.stop();
  await new Promise((r) => setTimeout(r, 500));
  file.end();
  writeFileSync(out.replace(/\.mp3$/, '.json'), JSON.stringify({ report, rows }, null, 1));
  console.log(JSON.stringify(report, null, 1));
  process.exit(0);
}

// ── what the output sounds like, measured ──
function pcm(f) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-ar', '44100', 'pipe:1'], { maxBuffer: 1 << 30 });
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 2);
}
function volume(f) {
  const e = spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return { mean: Number(/mean_volume: (-?[\d.]+)/.exec(e)?.[1]), max: Number(/max_volume: (-?[\d.]+)/.exec(e)?.[1]), seconds: Number(/time=(\d+):(\d+):([\d.]+)/.exec(e)?.slice(1).reduce((a, x, i) => a + x * [3600, 60, 1][i], 0)) };
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}
/** Per 2048 window: centroid (Hz), flux (L2 of positive magnitude change, normalised), and 50 ms envelope. */
function features(x, from, to) {
  const N = 2048, a = Math.floor(from * 44100), b = Math.min(x.length, Math.floor(to * 44100)), win = [], env = [];
  let prev = null;
  for (let o = a; o + N <= b; o += N) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[o + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    fft(re, im);
    const mag = new Float64Array(N / 2);
    let sum = 0, wsum = 0;
    for (let k = 1; k < N / 2; k++) { mag[k] = Math.hypot(re[k], im[k]); sum += mag[k]; wsum += mag[k] * k * 44100 / N; }
    let flux = 0;
    if (prev) { let tot = 0; for (let k = 1; k < N / 2; k++) { const d = mag[k] - prev[k]; if (d > 0) flux += d * d; tot += mag[k] * mag[k]; } flux = tot ? Math.sqrt(flux / tot) : 0; }
    win.push({ centroid: sum ? wsum / sum : 0, flux }); prev = mag;
  }
  for (let o = a; o + 2205 <= b; o += 2205) { let s = 0; for (let i = 0; i < 2205; i++) s += x[o + i] * x[o + i]; env.push(Math.sqrt(s / 2205)); }
  const mean = (k) => win.slice(1).reduce((s, w) => s + w[k], 0) / Math.max(1, win.length - 1);
  return { centroid: Math.round(mean('centroid')), flux: +mean('flux').toFixed(4), env };
}
function corr(p, q) { const n = Math.min(p.length, q.length); let mp = 0, mq = 0; for (let i = 0; i < n; i++) { mp += p[i]; mq += q[i]; } mp /= n; mq /= n; let c = 0, vp = 0, vq = 0; for (let i = 0; i < n; i++) { c += (p[i] - mp) * (q[i] - mq); vp += (p[i] - mp) ** 2; vq += (q[i] - mq) ** 2; } return +(c / Math.sqrt(vp * vq)).toFixed(3); }
function analyse() {
  // windows inside the dwells (no blend), so the drift's crossfade is not what is measured
  const [on, off] = argv.slice(1).filter((a) => a.endsWith('.mp3'));
  const wins = (flag('--windows', '10-24,40-59,72-88')).split(',').map((w) => w.split('-').map(Number));
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,bit_rate', '-of', 'csv=p=0', on], { encoding: 'utf8' }).stdout.trim();
  const res = { valid: probe.startsWith('mp3,'), probe, on: volume(on) };
  const x = pcm(on), y = off ? pcm(off) : null;
  const clip = (z) => z.reduce((n, v) => n + (Math.abs(v) >= 0.999 ? 1 : 0), 0);
  res.on.clipped = clip(x);
  res.windows = wins.map(([a, b]) => {
    const A = features(x, a, b), r = { at: `${a}-${b}`, on: { centroid: A.centroid, flux: A.flux } };
    if (y) { const O = features(y, a, b); r.off = { centroid: O.centroid, flux: O.flux }; r.envCorr = corr(A.env, O.env); }
    return r;
  });
  if (y) { res.off = volume(off); res.off.clipped = clip(y); }
  console.log(JSON.stringify(res, null, 1));
}
