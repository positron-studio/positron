// node workers/cast/measure-gains.mjs [--all] [--dir <folder of <id>.mp3>]: every feed file with no row in gains.mjs
// (every one with --all) is fetched ONCE through our edge cache, /file/<id>, never their host, measured with ffmpeg's
// ebur128 as the tuner hears it and tagged speech, field or music (kind.mjs), and gains.mjs is written again.
// Run by hand after an upload. why: lessons/workers-cast.md#level
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GAIN_DB } from './container/mixer.mjs';
import { UPMIX } from './container/decode.mjs';
import { KIND_SR, features, classify } from './kind.mjs';
import { TARGET, GAINS, UNMEASURED } from './gains.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), BASE = process.env.CAST_BASE || 'https://cast.positron.studio';
const all = process.argv.includes('--all'), di = process.argv.indexOf('--dir'), dir = di > 0 ? process.argv[di + 1] : null;
const ff = process.env.FFMPEG || 'ffmpeg';
// what the tuner's mono highpass gets: a mono file at unity, a stereo one 0.5 (L + R)
const FILTER = `${UPMIX},pan=mono|c0=0.5*FL+0.5*FR,ebur128=peak=true`;

/** `{ lufs, tp, lra, seconds }` of one local file, or `{ why }`. */
export function measure(path) {
  if (!existsSync(path) || statSync(path).size === 0) return { why: 'an empty file from /file/' };
  const r = spawnSync(ff, ['-nostdin', '-hide_banner', '-nostats', '-i', path, '-vn', '-af', FILTER, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const sum = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const num = (re) => { const m = re.exec(sum); return m ? Number(m[1]) : null; };
  const lufs = num(/I:\s+(-?[\d.]+|-inf) LUFS/), lra = num(/LRA:\s+(-?[\d.]+) LU/), tp = num(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/);
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr);
  if (r.status !== 0 || lufs == null || !Number.isFinite(lufs)) return { why: `ffmpeg could not measure it (${r.stderr.trim().split('\n').at(-1)})` };
  return { lufs, tp, lra, seconds: dur ? Math.round(+dur[1] * 3600 + +dur[2] * 60 + +dur[3]) : null };
}
/** Mono samples at KIND_SR as the tuner hears them: the whole file up to 10 min, else 20 pieces of 30 s spread over it. */
export function samplesFor(path, seconds) {
  const one = (ss, t) => {
    const r = spawnSync(ff, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...(ss ? ['-ss', String(ss)] : []), ...(t ? ['-t', String(t)] : []),
      '-i', path, '-vn', '-af', `${UPMIX},pan=mono|c0=0.5*FL+0.5*FR`, '-ar', String(KIND_SR), '-f', 'f32le', 'pipe:1'], { maxBuffer: 1 << 30 });
    return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 2);
  };
  if (!seconds || seconds <= 600) return one(0, 0);
  const parts = Array.from({ length: 20 }, (_, i) => one(Math.round((seconds - 30) * i / 19), 30));
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const gainFor = (lufs) => Math.min(GAIN_DB[1], Math.max(GAIN_DB[0], Math.round((TARGET - lufs) * 10) / 10));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const items = (await (await fetch(`${BASE}/feed`)).json()).items;
  const rows = { ...GAINS }, none = {};
  const tmp = mkdtempSync(join(tmpdir(), 'cast-lufs-'));
  try {
    for (const it of items) {
      const id = String(it.id);
      if (!all && rows[id]?.kind) continue;
      let path = dir && join(dir, `${id}.mp3`);
      if (!path || !existsSync(path)) {
        path = join(tmp, `${id}.mp3`);
        const r = await fetch(`${BASE}/file/${encodeURIComponent(id)}`);
        if (!r.ok || !r.body) { none[id] = { title: it.title, why: `/file/ answered ${r.status}` }; continue; }
        await pipeline(Readable.fromWeb(r.body), createWriteStream(path));
      }
      const m = measure(path);
      if (m.why) { none[id] = { title: it.title, why: m.why }; delete rows[id]; console.log(`${id} ${it.title}: ${m.why}`); continue; }
      const f = features(samplesFor(path, m.seconds)), c = classify(f);
      rows[id] = { title: it.title, lufs: m.lufs, tp: m.tp, lra: m.lra, seconds: m.seconds, gain: gainFor(m.lufs),
        kind: c.kind, kindConf: c.conf, kindLean: c.lean, kindBy: c.by, features: f };
      console.log(`${id} ${it.title}: ${m.lufs} LUFS, true peak ${m.tp} dBFS, gain ${rows[id].gain} dB, ${c.kind} ${c.conf} (${c.by})`);
      if (path.startsWith(tmp)) rmSync(path, { force: true });
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  for (const [id, x] of Object.entries(UNMEASURED)) if (!rows[id] && !none[id] && !items.some((it) => String(it.id) === id)) none[id] = x;
  const out = `// Written by measure-gains.mjs, not by hand: each archive file's loudness as the tuner hears it, the gain that
// brings it to TARGET (clamped to GAIN_DB) and its kind. A feed id with no row plays at 0 dB. why: lessons/workers-cast.md#level
export const TARGET = ${TARGET};
export const GAINS = ${JSON.stringify(rows, null, 1)};
export const UNMEASURED = ${JSON.stringify(none, null, 1)};
/** What /feed adds to an item: gain in dB (0 when never measured), kind and kindConf (null then). */
export const levelFor = (id) => { const g = GAINS[String(id)]; return { gain: g?.gain ?? 0, kind: g?.kind ?? null, kindConf: g?.kindConf ?? null }; };
`;
  writeFileSync(join(HERE, 'gains.mjs'), out);
  console.log(`gains.mjs: ${Object.keys(rows).length} measured, ${Object.keys(none).length} not`);
}
