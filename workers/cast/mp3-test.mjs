// node workers/cast/mp3-test.mjs: the framer on a file ffmpeg makes here, its duration against ffprobe's.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFramer, id3Length } from './mp3.mjs';
let pass = 0, fail = 0;
const ok = (name, c, info = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${name}${info ? ` | ${info}` : ''}`); c ? pass++ : fail++; };
const dir = mkdtempSync(join(tmpdir(), 'cast-mp3-'));
try {
  const f = join(dir, 't.mp3');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=7.3', '-c:a', 'libmp3lame', '-b:a', '128k',
    '-metadata', 'title=positron test', f]);
  const b = new Uint8Array(readFileSync(f));
  const want = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));
  ok('the file starts with an ID3 tag, which is skipped', id3Length(b) > 0, `${id3Length(b)} bytes`);
  for (const size of [1, 417, 4096, b.length]) {
    const fr = createFramer(); let frames = [];
    for (let i = 0; i < b.length; i += size) frames = frames.concat(fr.push(b.subarray(i, i + size), i + size >= b.length));
    const secs = frames.reduce((n, x) => n + x.seconds, 0), bytes = frames.reduce((n, x) => n + x.data.length, 0);
    ok(`fed ${size} bytes at a time: the duration matches ffprobe within 0.1 s (ffprobe trims the encoder delay and the Info frame)`, Math.abs(secs - want) < 0.1, `${secs.toFixed(3)} s against ${want} s, ${frames.length} frames`);
    ok(`fed ${size} bytes at a time: every byte after the tag is in a frame, bar a short tail`, b.length - id3Length(b) - bytes < 2000, `${b.length - id3Length(b) - bytes} left over`);
  }
  const fr = createFramer();
  ok('NEGATIVE CONTROL: noise is no frames', fr.push(new Uint8Array(5000).map((_, i) => (i * 37) & 0x7f), true).length === 0);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log(`\n${pass}/${pass + fail} ${fail ? 'RED' : 'green'}`);
process.exit(fail ? 1 : 0);
