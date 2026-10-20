// node workers/edgecast/tail-cpu.mjs <tail.jsonl>: the station's CPU from `wrangler tail --format json`. Each alarm is
// one invocation with its own cpuTime; the audio it rendered is in the status, so this sums cpuTime by event kind and
// prints the alarms' spread. The audio seconds come from the caller (status.seconds at the end), passed as argv[3].
import { readFileSync } from 'node:fs';

const txt = readFileSync(process.argv[2], 'utf8'), audioS = Number(process.argv[3]) || null;
// wrangler prints one pretty JSON object per event: split on top-level braces
const evs = []; let depth = 0, start = -1, inStr = false, esc = false;
for (let i = 0; i < txt.length; i++) {
  const c = txt[i];
  if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true; else if (c === '{') { if (!depth++) start = i; } else if (c === '}' && !--depth) { try { evs.push(JSON.parse(txt.slice(start, i + 1))); } catch { /* partial */ } }
}
const kind = (e) => `${e.entrypoint || "worker"} ${e.event?.request ? `fetch ${new URL(e.event.request.url).pathname}` : e.event?.scheduledTime ? "alarm" : e.eventType || "other"}`;
const by = {};
for (const e of evs) {
  const k = kind(e), b = (by[k] ||= { n: 0, cpuMs: 0, wallMs: 0, cpu: [], outcomes: {} });
  b.n++; b.cpuMs += e.cpuTime || 0; b.wallMs += e.wallTime || 0; b.cpu.push(e.cpuTime || 0); b.outcomes[e.outcome] = (b.outcomes[e.outcome] || 0) + 1;
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const out = {};
for (const [k, b] of Object.entries(by)) out[k] = { n: b.n, cpuMs: b.cpuMs, median: q(b.cpu, 0.5), p99: q(b.cpu, 0.99), max: Math.max(...b.cpu), wallMs: b.wallMs, outcomes: b.outcomes };
const total = Object.values(by).reduce((a, b) => a + b.cpuMs, 0);
const t = evs.map((e) => e.eventTimestamp).filter(Boolean);
console.log(JSON.stringify({ events: evs.length, from: t.length ? new Date(Math.min(...t)).toISOString() : null, to: t.length ? new Date(Math.max(...t)).toISOString() : null,
  totalCpuMs: total, ...(audioS ? { audioS, cpuMsPerAudioS: +(total / audioS).toFixed(2), percentOfCore: +(total / audioS / 10).toFixed(2) } : {}), byKind: out,
  logs: evs.flatMap((e) => (e.logs || []).map((l) => `${new Date(l.timestamp).toISOString().slice(11, 19)} ${[].concat(l.message).join(' ')}`)).filter((l) => !/scene \d|landed|ghost/.test(l)).slice(-30),
  exceptions: evs.flatMap((e) => e.exceptions || []).slice(0, 5) }, null, 1));
