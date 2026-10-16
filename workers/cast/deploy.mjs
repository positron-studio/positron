// Deploys the cast worker from its own directory with CF_API_TOKEN and CLOUDFLARE_API_TOKEN unset:
// from the repo root with them set, wrangler fails with `Authentication error [code: 10000]`.
// The container's `durable_object` policy needs wrangler 4.148 (rig/containers-next); npx here is 4.75.
// why: lessons/workers-shout.md#deploy
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRANGLER = join(HERE, '../../rig/containers-next/node_modules/.bin/wrangler');
const env = { ...process.env };
delete env.CF_API_TOKEN;
delete env.CLOUDFLARE_API_TOKEN;
const [cmd, args] = existsSync(WRANGLER) ? [WRANGLER, ['deploy']] : ['npx', ['wrangler@4.148.0', 'deploy']];
const up = spawnSync(cmd, args, { cwd: HERE, stdio: 'inherit', env });
process.exit(up.status ?? 1);
