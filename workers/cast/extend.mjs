// node workers/cast/extend.mjs <station> <hours>: moves an on-air station's stop to now + hours (15 min to 14 days).
// Reads CAST_KEY from .env in the repository root; prints the station's answer.
import { readFileSync } from 'node:fs';

const [target, hours] = process.argv.slice(2);
if (!target || !(Number(hours) > 0)) { console.error('usage: node workers/cast/extend.mjs <station> <hours>'); process.exit(2); }
const key = readFileSync(new URL('../../.env', import.meta.url), 'utf8').match(/^CAST_KEY=(.*)$/m)?.[1]?.trim();
if (!key) { console.error('no CAST_KEY in .env'); process.exit(2); }

const ws = new WebSocket(`wss://cast.positron.studio/control/${encodeURIComponent(target)}?key=${encodeURIComponent(key)}`);
const done = (code, msg) => { console.log(msg); ws.close(); process.exit(code); };
setTimeout(() => done(1, 'no answer in 15 s'), 15_000);
const want = Date.now() + Math.round(Number(hours) * 3600_000);
ws.onopen = () => ws.send(JSON.stringify({ cmd: 'extend', ms: want - Date.now() }));
// the answer is the next status: `until` near the asked time, or a `refused:` line
ws.onmessage = (e) => {
  const m = JSON.parse(e.data), last = (m.lines || []).at(-1) || '';
  if (last.includes('refused: ')) done(1, last);
  if (m.until && Math.abs(m.until - want) < 120_000) done(0, `${target} stops at ${new Date(m.until).toISOString()}`);
};
