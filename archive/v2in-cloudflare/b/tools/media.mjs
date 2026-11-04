// node b/tools/media.mjs <playlist> <dir> [--dry]: B's playout copies of one playlist, into R2 v2in-media/cast/<playlist>/.
// v2in-cast sends MP3 frames as they are, never decoding, so every file it plays must have one format: MPEG-1
// Layer III, 44.1 kHz, 128 kbit/s CBR, stereo, no Xing/Info frame. Files already in that format are copied (-c copy),
// the rest re-encoded; the ID3 artist and title are kept. Writes cast/<playlist>/index.json beside them: each file's
// key, artist, title, the byte of its first frame, its frame count and seconds, which the cast seeks by.
// The sources are local folders (a/media/radio1965 and a/media/allclear are R2's radio1965/ and allclear/; the kcmd
// sources were eccm-radio/uploads/ubu-*.mp3 fetched from R2). Needs ffmpeg, ffprobe and b/node_modules (npm i in b/).
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createFramer, frameAt } from '../workers/v2in-cast/mp3.mjs';

const [playlist, dir, flag] = process.argv.slice(2);
if (!playlist || !dir) { console.error('usage: node b/tools/media.mjs <playlist> <dir> [--dry]'); process.exit(2); }
const B = new URL('..', import.meta.url).pathname;
const OUT = join(tmpdir(), `v2in-cast-${playlist}`);
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });

const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', f]));
const ascii = (s) => s.normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
const keyOf = (f) => ascii(basename(f)).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');

const files = [];
for (const name of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.mp3')).sort()) {
  const src = join(dir, name), out = join(OUT, keyOf(name));
  const p = probe(src), s = p.streams.find((x) => x.codec_type === 'audio');
  const tags = Object.fromEntries(Object.entries(p.format.tags || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const uniform = s.codec_name === 'mp3' && s.sample_rate === '44100' && s.channels === 2 && s.bit_rate === '128000';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-map', '0:a', '-map_metadata', '0',
    ...(uniform ? ['-c:a', 'copy'] : ['-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2']),
    '-write_xing', '0', '-id3v2_version', '3', out]);

  const b = new Uint8Array(readFileSync(out));
  const fr = createFramer();
  const frames = fr.push(b, true);
  const odd = frames.filter((f) => f.kbps !== 128 || f.rate !== 44100 || (f.data[3] >> 6) === 3);
  if (odd.length) throw new Error(`${name}: ${odd.length} frames not 128 kbit/s 44.1 kHz stereo`);
  let start = 0;
  while (!(frameAt(b, start) && frameAt(b, start + frameAt(b, start).bytes))) start++;
  const seconds = frames.reduce((a, f) => a + f.seconds, 0);
  files.push({ key: `cast/${playlist}/${basename(out)}`, artist: tags.artist || '', title: tags.title || basename(name, '.mp3'),
    start, bytes: statSync(out).size, frames: frames.length, seconds: +seconds.toFixed(3) });
  console.log(`${uniform ? 'copied ' : 'encoded'} ${basename(out)}  ${seconds.toFixed(1)} s  ${frames.length} frames  ${tags.artist || ''} - ${tags.title || ''}`);
}
const index = { playlist, format: 'mp3 44100 Hz 128 kbit/s stereo CBR', made: new Date().toISOString(),
  seconds: +files.reduce((a, f) => a + f.seconds, 0).toFixed(3), files };
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
console.log(`${files.length} files, ${(index.seconds / 60).toFixed(1)} min, in ${OUT}`);
if (flag === '--dry') process.exit(0);

const ENV = { ...process.env }; delete ENV.CF_API_TOKEN; delete ENV.CLOUDFLARE_API_TOKEN;   // the machine's wrangler login
const put = (key, file, type) => execFileSync(join(B, 'node_modules/.bin/wrangler'),
  ['r2', 'object', 'put', `v2in-media/${key}`, '--remote', '--file', file, '--content-type', type],
  { cwd: B, stdio: ['ignore', 'ignore', 'inherit'], env: ENV });
for (const f of files) { put(f.key, join(OUT, basename(f.key)), 'audio/mpeg'); console.log('put', f.key); }
put(`cast/${playlist}/index.json`, join(OUT, 'index.json'), 'application/json');
console.log('put', `cast/${playlist}/index.json`);
