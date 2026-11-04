// node tools/deploy-cast.mjs [--now] [message]   (from b/): deploys v2in-cast so that a busy channel keeps its old code
// and its listeners, and a live show its input, for up to 24 hours: the Durable Objects code update strategy
// {"mode": "deferred", "max_delay": 86400}. wrangler 4.107 (pinned here, see CLAUDE.md) cannot set it, so this uploads a
// version with wrangler and makes the deployment through the API with the strategy. An idle channel object resets
// itself at its next request to adopt the new code (worker.mjs compares versions), so title polls cannot hold old
// code. A busy one adopts it once it is idle (20 s after its last listener leaves, no show live), or after 24 h, when
// Cloudflare resets it and the watchdog in worker.mjs ends its streams so players dial again. Deferral is Cloudflare's
// best effort, not a promise. Measured: 396 s held with no silence (2026-11-03), and on 2026-11-04 a live show with a
// listener ran 370 s past such a deploy on the old code, untouched; idle objects were on the new code within 8 s.
//   --now      the update at once ({"mode": "immediate"}): a fix that must reach listeners now; every stream ends
// Routes are applied with `wrangler triggers deploy` (a version upload does not touch them). A new Durable Object
// migration cannot go up as a version: use a plain `wrangler deploy` for that one.
// Auth: wrangler's own login (its OAuth token, refreshed by the upload just before), with CF_API_TOKEN and
// CLOUDFLARE_API_TOKEN unset, as every deploy here.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const now = process.argv.includes('--now');
const message = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ') || 'deploy-cast';
const env = { ...process.env }; delete env.CF_API_TOKEN; delete env.CLOUDFLARE_API_TOKEN;
const wrangler = (...a) => execFileSync('./node_modules/.bin/wrangler', [...a, '-c', 'workers/v2in-cast/wrangler.jsonc'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const up = wrangler('versions', 'upload', '--message', message);
const version = /Worker Version ID:\s*([0-9a-f-]{36})/.exec(up)?.[1];
if (!version) { console.log(up); throw new Error('no version id in the upload output'); }
console.log('version', version);

const cfg = [join(homedir(), 'Library/Preferences/.wrangler/config/default.toml'), join(homedir(), '.config/.wrangler/config/default.toml'), join(homedir(), '.wrangler/config/default.toml')]
  .map((p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } }).find(Boolean);
const token = /oauth_token\s*=\s*"([^"]+)"/.exec(cfg || '')?.[1];
if (!token) throw new Error('no wrangler login found: run wrangler login');
const api = async (path, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
  const j = await r.json();
  if (!j.success) throw new Error(`${path}: ${JSON.stringify(j.errors)}`);
  return j.result;
};
const account = /Account ID\s*│\s*([0-9a-f]{32})|│\s*([0-9a-f]{32})\s*│/.exec(execFileSync('./node_modules/.bin/wrangler', ['whoami'], { env, encoding: 'utf8' }));
const accountId = account?.[1] || account?.[2];
if (!accountId) throw new Error('no account id from wrangler whoami');

const strategy = now ? { mode: 'immediate' } : { mode: 'deferred', max_delay: 86400 };
const d = await api(`/accounts/${accountId}/workers/scripts/v2in-cast/deployments`, { method: 'POST', body: JSON.stringify({
  strategy: 'percentage', versions: [{ version_id: version, percentage: 100 }], annotations: { 'workers/message': message },
  code_update_strategy: strategy }) });
// the API takes code_update_strategy but never answers it back (write-only), so only the request can be shown
console.log('deployment', d.id, 'asked', JSON.stringify(strategy));
console.log(wrangler('triggers', 'deploy').trim().split('\n').filter((l) => /positron|workers\.dev/.test(l)).join('\n'));
