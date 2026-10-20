// node workers/cast/gate.mjs [--name v1] [--ref <commit>] [--station radio1965 | --ids a,b] [--seconds 900] [--seed 7] [--no-upload]
// [--dry] or --each "name:ref:seed[:dry] ...": one render per version, all at once (each its own container and worktree).
// the quality gate before any sound goes on air. Renders the station in the grains image (the tree's code, the
// station's program, the files as /file/ serves them), measures loudness, peaks, gaps, scene lengths and every
// hand-over, and prints PASS or FAIL per check. The MP3 goes to R2 and the timeline to
// demo/radio/cast/renders/renders.json for /radio/cast/renders/. why: lessons/workers-cast.md#gate
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '../..');
const argv = process.argv.slice(2), flag = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const S = Number(flag('--seconds', 900)), seed = Number(flag('--seed', 7)), station = flag('--station', 'radio1965');
const name = flag('--name', `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-s${seed}`);
const NAME_OK = /^[a-z0-9][a-z0-9-]{0,40}$/;
if (!NAME_OK.test(name)) { console.error(`--name: lowercase letters, digits and dashes (${name})`); process.exit(2); }
const API = 'https://cast.positron.studio', CACHE = join(homedir(), '.cache/positron-cast-files'), OUT = join(homedir(), '.cache/positron-cast-renders');
let DRY = argv.includes('--dry'), REF = flag('--ref', null);
const IMAGE = 'grains-local', BUCKET = 'positron-station', PREFIX = 'cast-renders';
const MEDIA = 'https://positron-station.kristjan-jansen.workers.dev/media/';
const INDEX = join(ROOT, 'demo/radio/cast/renders/renders.json');
mkdirSync(CACHE, { recursive: true }); mkdirSync(OUT, { recursive: true });
const OWN = ['--each', '--name', '--ref', '--seed'], pass0 = argv.filter((a, i) => a !== '--dry' && !OWN.includes(a) && !OWN.includes(argv[i - 1]));
if (flag('--each')) {
  // versions side by side: one child per version, in parallel; each prints its own gate
  const kids = flag('--each').trim().split(/\s+/).map((spec) => {
    const [n, ref = 'HEAD', sd = String(seed), dry] = spec.split(':');
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--name', n, ...(ref === 'tree' ? [] : ['--ref', ref]), '--seed', sd, ...(dry === 'dry' ? ['--dry'] : []), ...pass0], { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (b) => process.stdout.write(String(b).replace(/^(?=.)/gm, `[${n}] `)));
    p.stderr.on('data', (b) => process.stderr.write(String(b).replace(/^(?=.)/gm, `[${n}] `)));
    return new Promise((r) => p.on('exit', (c) => r([n, c])));
  });
  const res = await Promise.all(kids);
  console.log(`\n${res.map(([n, c]) => `${n}: ${c === 0 ? 'PASS' : c === 1 ? 'FAIL' : `exit ${c}`}`).join(', ')}`);
  process.exit(res.every(([, c]) => c === 0) ? 0 : 1);
}
const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); };

// --measure: no render, the checks again on <name>.mp3 and <name>.run.json from an earlier run
const MEASURE = argv.includes('--measure'), was = MEASURE ? JSON.parse(readFileSync(join(OUT, `${name}.json`), 'utf8')) : null;
let sha = was?.code, dirty = was?.dirty ?? false;
if (was) { DRY = !!was.dry; REF = was.ref ?? null; }
if (!MEASURE) {
// ── 1. the code: the working tree, or a commit's in a worktree of its own; the shared files copied in as deploy.mjs does ──
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const TREE = REF ? join(OUT, `tree-${name}`) : ROOT, CAST = join(TREE, 'workers/cast');
if (REF) {
  git('worktree', 'remove', '--force', TREE);
  const w = git('worktree', 'add', '--detach', TREE, REF);
  if (w.status !== 0) { console.error(`--ref ${REF}: ${w.stderr.trim()}`); process.exit(2); }
  // an older commit may have no render.mjs: this one drives it
  copyFileSync(join(HERE, 'render.mjs'), join(CAST, 'render.mjs'));
  process.on('exit', () => git('worktree', 'remove', '--force', TREE));
}
const { SC_FILES } = await import(join(CAST, 'sc-files.mjs'));
for (const f of SC_FILES) { const t = join(CAST, 'container/sc', f); mkdirSync(dirname(t), { recursive: true }); copyFileSync(join(TREE, 'demo', f), t); }
copyFileSync(join(TREE, 'demo/shell/tuner-mix.mjs'), join(CAST, 'container/tuner-mix.mjs'));
sha = git('-C', TREE, 'rev-parse', '--short=8', 'HEAD').stdout.trim();
dirty = !REF && git('status', '--porcelain', '--', 'demo/radio/cast', 'demo/shell', 'workers/cast').stdout.trim().length > 0;

// ── 2. the program and the files: what the Caster would send (levels from gains.mjs, short files left out) ──
const { pickFiles, MIN_FILE_S } = await import('./worker.mjs');
const feed = (await getJson(`${API}/feed`)).items, byId = new Map(feed.map((x) => [String(x.id), x]));
const votes = ((await getJson(`${API}/votes`)).votes || []).filter((v) => v.vote && v.def).slice(-2000).map(({ def, vote, file }) => ({ def, vote, file }));
let ids = flag('--ids', '') ? flag('--ids').split(',') : ((await getJson(`${API}/status/${station}`)).program || []).map((x) => x.id);
if (!ids.length) ids = pickFiles(feed, votes, Infinity);
let queue = ids.map((id) => byId.get(String(id))).filter(Boolean).map(({ id, title, gain, kind, kindConf, soften, seconds }) => ({ id, title, gain, kind, kindConf, soften, seconds }));
const long = queue.filter((x) => !(Number(x.seconds) > 0 && Number(x.seconds) < MIN_FILE_S));
if (long.length) queue = long;
if (!queue.length) { console.error('no program: nothing in the feed matches'); process.exit(2); }
for (const it of queue) {
  const f = join(CACHE, `${it.id}.mp3`);
  if (!existsSync(f) || statSync(f).size === 0) {
    process.stdout.write(`fetching ${it.title} through ${API}/file/ ... `);
    const r = await fetch(`${API}/file/${it.id}`);
    if (!r.ok) throw new Error(`/file/${it.id}: ${r.status}`);
    writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log(`${(statSync(f).size / 1e6).toFixed(1)} MB`);
  }
  it.url = `/files/${it.id}.mp3`;
}
writeFileSync(join(OUT, `${name}.queue.json`), JSON.stringify({ queue, votes }));
console.log(`program (${queue.length}): ${queue.map((x) => x.title).join(', ')}`);

// ── 3. the render, in real time on the image's JACK clock, at the station's size (1 vCPU, 3 GiB) ──
const cname = `cast-gate-${process.pid}`;
const kill = () => spawnSync('docker', ['rm', '-f', cname], { stdio: 'ignore' });
process.on('exit', kill); process.on('SIGINT', () => process.exit(130));
console.log(`rendering ${S} s, seed ${seed}, code ${sha}${dirty ? ' + working tree' : ''}${DRY ? ', DRY' : ''} (${Math.ceil(S / 60)} min of wall time)`);
const t0 = Date.now();
const code = await new Promise((res) => {
  const p = spawn('docker', ['run', '--rm', '--name', cname, '--cpus', '1', '--memory', '3072m', '-v', `${CAST}:/app`, '-v', `${CACHE}:/files:ro`, '-v', `${OUT}:/out`,
    IMAGE, 'node', '/app/render.mjs', '--queue', `/out/${name}.queue.json`, '--seconds', String(S), '--seed', String(seed), '--out', `/out/${name}`, ...(DRY ? ['--dry'] : [])], { stdio: 'inherit' });
  p.on('exit', res);
});
if (code !== 0) { console.error(`render exited ${code}`); process.exit(1); }
console.log(`rendered in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
const mp3 = join(OUT, `${name}.mp3`), run = JSON.parse(readFileSync(join(OUT, `${name}.run.json`), 'utf8'));

// ── 4. the measurements, with ffmpeg on the MP3 a listener gets ──
const ff = (...a) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mp3, ...a, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], { encoding: 'utf8' }).stdout);
const eb = ff('-af', 'ebur128=peak=true');
const num = (re) => { const m = re.exec(eb); return m ? Number(m[1]) : null; };
const I = num(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/), LRA = num(/LRA:\s+(-?[\d.]+) LU\s*\n/), TP = num(/Peak:\s+(-?[\d.inf]+) dBFS/);
// momentary (400 ms) and short-term (3 s) loudness every 100 ms, kept at 1 s for the page
const M = [], Sx = [];
for (const m of eb.matchAll(/t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.inf]+)\s+S:\s*(-?[\d.inf]+)/g)) { M.push([+m[1], +m[2]]); Sx.push([+m[1], +m[3]]); }
const lufs = []; for (const [t, s] of Sx) if (Math.abs(t - Math.round(t)) < 0.05) lufs.push(+(Number.isFinite(s) ? Math.max(-70, s) : -70).toFixed(1));
const sil = ff('-af', 'silencedetect=noise=-50dB:d=0.7');
const gaps = [...sil.matchAll(/silence_start: (-?[\d.]+)[\s\S]*?silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ at: +(+m[1]).toFixed(2), s: +(+m[3]).toFixed(2) })).filter((g) => g.at > 3);
const meanS = (a, b) => { const v = Sx.filter(([t]) => t >= a && t < b).map(([, s]) => s).filter(Number.isFinite); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };

// a scene's real length is from its landing to the next one's; a hand-over is the blend from one file into the next
const scenes = run.scenes.map((s, i, a) => ({ ...s, real: a[i + 1] ? +(a[i + 1].at - s.at).toFixed(1) : null }));
const handovers = run.blends.map((b) => {
  const next = scenes.find((s) => s.at > b.at), to = next?.at ?? null;
  const before = meanS(b.at - 6, b.at), after = to != null ? meanS(to + 1, to + 7) : null, during = to != null ? meanS(b.at, to) : null;
  // the steepest loudness move inside the blend: the momentary reading against the one 1 s earlier
  let steep = 0; if (to != null) for (let k = 10; k < M.length; k++) { const [t, m] = M[k], p = M[k - 10][1]; if (t >= b.at && t <= to + 2 && Number.isFinite(m) && Number.isFinite(p)) steep = Math.max(steep, Math.abs(m - p)); }
  return { at: b.at, to, s: to != null ? +(to - b.at).toFixed(1) : null, from: b.from, into: next?.file ?? null,
    before: before && +before.toFixed(1), during: during && +during.toFixed(1), after: after && +after.toFixed(1),
    jump: before != null && after != null ? +(after - before).toFixed(1) : null, dip: before != null && during != null ? +(during - before).toFixed(1) : null, steep: +steep.toFixed(1) };
});
// a loud event anywhere: the momentary reading 10 LU over the 3 s before it
// a loud event anywhere: the short-term (3 s) reading 10 LU over the one 3 s before it. Momentary (400 ms) was
// tried first and fired 40 times on the dry render, on speech coming back after a breath. why: lessons/workers-cast.md#gate
const abrupt = []; for (let k = 30; k < Sx.length; k++) { const [t, m] = Sx[k], p = Sx[k - 30][1]; if (t > 10 && Number.isFinite(p) && m - p > 10 && (!abrupt.length || t - abrupt.at(-1).at > 3)) abrupt.push({ at: +t.toFixed(1), rise: +(m - p).toFixed(1) }); }
const quiet = []; for (const [t, s] of Sx) if (t > 10 && s < -30 && (!quiet.length || t - quiet.at(-1).end > 2)) quiet.push({ at: +t.toFixed(1), end: +t.toFixed(1), min: s }); else if (quiet.length && s < -30 && t - quiet.at(-1).end <= 2) { quiet.at(-1).end = +t.toFixed(1); quiet.at(-1).min = Math.min(quiet.at(-1).min, s); }

// ── 5. the gate ──
const done = scenes.filter((s) => s.real != null);
const checks = [
  ['integrated loudness -18 to -14 LUFS', I != null && I >= -18 && I <= -14, `${I} LUFS`],
  ['loudness range under 8 LU', LRA != null && LRA < 8, `${LRA} LU`],
  ['true peak under -1 dBFS', TP != null && TP < -1, `${TP} dBFS`],
  ['no silence over 0.7 s', !gaps.length, gaps.length ? gaps.map((g) => `${g.at} s for ${g.s} s`).join(', ') : 'none'],
  ['no quiet stretch under -30 LUFS short-term', !quiet.length, quiet.length ? quiet.map((q) => `${q.at} to ${q.end} s`).join(', ') : 'none'],
  ['no sudden rise of 10 LU in 3 s (short-term)', !abrupt.length, abrupt.length ? abrupt.map((a) => `${a.at} s +${a.rise}`).join(', ') : 'none'],
  ['every hand-over within 6 LU, before against after', handovers.every((h) => h.jump == null || Math.abs(h.jump) <= 6), handovers.map((h) => h.jump).join(' ')],
  ['no hand-over dips 8 LU', handovers.every((h) => h.dip == null || h.dip > -8), handovers.map((h) => h.dip).join(' ')],
  ['every finished scene 40 s or longer', done.every((s) => s.real >= 40), done.map((s) => s.real).join(' ')],
  ['the render is as long as asked (within 5 s)', Math.abs(dur - S) < 5 + run.offset, `${dur.toFixed(1)} s`],
  ['no xruns', run.xruns === 0, String(run.xruns)],
  ['no failures in the driver', !run.fails.length, run.fails.map((f) => f.line).slice(0, 3).join(' | ') || 'none'],
];
const pass = checks.every(([, ok]) => ok);
console.log(`\ngate ${name}: ${pass ? 'PASS' : 'FAIL'}`);
for (const [what, ok, got] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${got}`);
console.log(`\n${scenes.length} scenes, ${handovers.length} hand-overs, ${run.ghosts.length} ghosts; MP3 ${mp3}`);
for (const h of handovers) console.log(`  hand-over ${h.at} s (${h.s} s): ${h.from} -> ${h.into}, ${h.before} / ${h.during} / ${h.after} LUFS, steepest ${h.steep} LU in 1 s`);

// ── 6. publish: the MP3 to R2 (immutable, so a new name per render), the timeline into the page's index ──
const report = { name, made: was?.made ?? new Date().toISOString(), measured: new Date().toISOString(), code: sha, ref: REF, dry: DRY, dirty, seed, station: was?.station ?? (flag('--ids', '') ? 'ids' : station), seconds: +dur.toFixed(2), pass,
  url: `${MEDIA}${PREFIX}/${name}.mp3`, I, LRA, TP, checks: checks.map(([what, ok, got]) => ({ what, ok, got })),
  scenes: scenes.map(({ mixAt, ...s }) => s), handovers, ghosts: run.ghosts.map(({ mixAt, mixEnd, ...g }) => g), gaps, quiet, abrupt, lufs,
  queue: run.queue, xruns: run.xruns, maxLag: run.maxLag, offset: run.offset };
writeFileSync(join(OUT, `${name}.json`), JSON.stringify(report, null, 1));
if (argv.includes('--no-upload')) { console.log(`not uploaded (--no-upload); report ${join(OUT, `${name}.json`)}`); process.exit(pass ? 0 : 1); }
if (!MEASURE) {
const env = { ...process.env }; delete env.CF_API_TOKEN; delete env.CLOUDFLARE_API_TOKEN;
  const up = spawnSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${PREFIX}/${name}.mp3`, '--file', mp3, '--content-type', 'audio/mpeg', '--remote'], { cwd: join(ROOT, 'workers/station'), env, encoding: 'utf8' });
  if (up.status !== 0) { console.error(`upload failed: ${up.stderr.slice(-400)}`); process.exit(1); }
  const head = await fetch(report.url, { method: 'HEAD' });
  console.log(`uploaded: ${report.url} (${head.status}, ${head.headers.get('content-length')} bytes)`);
}
mkdirSync(dirname(INDEX), { recursive: true });
// renders running side by side finish together: one writer at a time, by a lock directory
const LOCK = `${INDEX}.lock`;
for (let k = 0; ; k++) { try { mkdirSync(LOCK); break; } catch { if (k > 200) rmSync(LOCK, { recursive: true, force: true }); await new Promise((r) => setTimeout(r, 50)); } }
const all = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : { renders: [] };
all.renders = [report, ...all.renders.filter((r) => r.name !== name)];
writeFileSync(INDEX, JSON.stringify(all));
rmSync(LOCK, { recursive: true, force: true });
console.log(`index: ${all.renders.length} renders in demo/radio/cast/renders/renders.json (a site deploy shows it)`);
process.exit(pass ? 0 : 1);
