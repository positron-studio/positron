// node workers/cast/load.mjs <station> [--image]: loads demo/radio/cast/life.mjs and layers.mjs into the station on air,
// taken at its next scene, with no deploy and no hand-over. The tests run first; any red and nothing is sent.
// --image goes back to the composer the image was built with. Reads CAST_KEY from .env. why: plans/plan-cast-load.md
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [target, flag] = process.argv.slice(2);
if (!target) { console.error('usage: node workers/cast/load.mjs <station> [--image]'); process.exit(2); }
const root = new URL('../../', import.meta.url);
const key = readFileSync(new URL('.env', root), 'utf8').match(/^CAST_KEY=(.*)$/m)?.[1]?.trim();
if (!key) { console.error('no CAST_KEY in .env'); process.exit(2); }

let msg;
if (flag === '--image') msg = { cmd: 'load', sha: 'image' };
else {
  for (const t of ['demo/radio/cast/life-test.mjs', 'demo/radio/cast/layers-test.mjs']) {
    const r = spawnSync('node', [new URL(t, root).pathname], { encoding: 'utf8' });
    const last = r.stdout.trim().split('\n').at(-1);
    if (r.status !== 0) { console.error(`${t} is red, nothing sent:\n${r.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n')}`); process.exit(1); }
    console.log(last);
  }
  const files = Object.fromEntries(['radio/cast/life.mjs', 'radio/cast/layers.mjs'].map((f) => [f, readFileSync(new URL(`demo/${f}`, root), 'utf8')]));
  const sha = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12);
  msg = { cmd: 'load', files, sha };
}

const ws = new WebSocket(`wss://cast.positron.studio/control/${encodeURIComponent(target)}?key=${encodeURIComponent(key)}`);
const done = (code, line) => { console.log(line); ws.close(); process.exit(code); };
setTimeout(() => done(1, 'no answer in 30 s'), 30_000);
ws.onopen = () => ws.send(JSON.stringify(msg));
// the answer is a status whose last line is the station's verdict on this load
ws.onmessage = (e) => {
  const m = JSON.parse(e.data), last = (m.lines || []).at(-1) || '';
  if (/load refused|refused: /.test(last)) done(1, last);
  if (/load .*checked|image's composer/.test(last)) done(0, `${target}: ${last.replace(/^\S+ /, '')}`);
};
