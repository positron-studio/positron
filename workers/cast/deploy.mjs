// Deploys the cast worker from its own directory with CF_API_TOKEN and CLOUDFLARE_API_TOKEN unset:
// from the repo root with them set, wrangler fails with `Authentication error [code: 10000]`.
// The container's `durable_object` policy needs wrangler 4.148 (rig/containers-next); npx here is 4.75.
// why: lessons/workers-shout.md#deploy
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SC_FILES } from './sc-files.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRANGLER = join(HERE, '../../rig/containers-next/node_modules/.bin/wrangler');
// the image's build context is this directory, so the page's tuner maths is copied in, unchanged
const TUNER = [join(HERE, '../../demo/shell/tuner-mix.mjs'), join(HERE, 'container/tuner-mix.mjs')];
if (readFileSync(TUNER[0], 'utf8') !== readFileSync(TUNER[1], 'utf8')) { writeFileSync(TUNER[1], readFileSync(TUNER[0])); console.log('container/tuner-mix.mjs refreshed from demo/shell'); }
// and the grain ring's program and compiler, the live planner, its layers and the soften stage, as the page has them
for (const f of SC_FILES) {
  const [from, to] = [join(HERE, '../../demo', f), join(HERE, 'container/sc', f)];
  if (!existsSync(to) || readFileSync(from, 'utf8') !== readFileSync(to, 'utf8')) { mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, readFileSync(from)); console.log(`container/sc/${f} refreshed from demo`); }
}
// The image's own hash, over every file the Dockerfile copies: the Caster hands a station to a new container only when
// this changes, so a deploy of the Worker alone leaves the station playing. why: plans/plan-cast-load.md
const walk = (d) => readdirSync(d).sort().flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const image = createHash('sha256');
for (const f of [join(HERE, 'mp3.mjs'), ...walk(join(HERE, 'container'))]) image.update(f.slice(HERE.length)).update(readFileSync(f));
const IMAGE = image.digest('hex').slice(0, 16);
console.log(`image ${IMAGE}`);
const env = { ...process.env };
delete env.CF_API_TOKEN;
delete env.CLOUDFLARE_API_TOKEN;
const [cmd, args] = existsSync(WRANGLER) ? [WRANGLER, ['deploy', '--var', `CAST_IMAGE:${IMAGE}`]] : ['npx', ['wrangler@4.148.0', 'deploy', '--var', `CAST_IMAGE:${IMAGE}`]];
const up = spawnSync(cmd, args, { cwd: HERE, stdio: 'inherit', env });
process.exit(up.status ?? 1);
