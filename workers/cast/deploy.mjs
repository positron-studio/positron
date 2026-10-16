// Deploys the cast worker from its own directory with CF_API_TOKEN and CLOUDFLARE_API_TOKEN unset:
// from the repo root with them set, wrangler fails with `Authentication error [code: 10000]`.
// No build step: worker.mjs is the artefact, so there is no build/upload interlock to keep.
// why: lessons/workers-shout.md#deploy
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const env = { ...process.env };
delete env.CF_API_TOKEN;
delete env.CLOUDFLARE_API_TOKEN;
const up = spawnSync('npx', ['wrangler', 'deploy'], { cwd: HERE, stdio: 'inherit', env });
process.exit(up.status ?? 1);
