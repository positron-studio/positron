// node research/ua-alerts/kyiv.mjs: Kyiv City alerts from both CSVs, duplicates removed, overlaps merged; the README's numbers.
import { SOURCES, alerts, merge } from './alerts.mjs';

const SINCE = Date.parse('2025-01-01T00:00:00Z'), MIN = 60e3;
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
function report(name, m, since) {
  m = m.filter(([s]) => s >= since);
  const d = m.map(([s, e]) => (e - s) / MIN), r = (x) => Math.round(x);
  console.log(`${name}: ${m.length} alerts ${day(m[0][0])} to ${day(m.at(-1)[0])}, p50 ${r(pct(d, 50))} p90 ${r(pct(d, 90))} p95 ${r(pct(d, 95))} p99 ${r(pct(d, 99))} max ${r(Math.max(...d))} min, ${r(d.reduce((a, b) => a + b, 0) / 60)} h`);
}
const [off, vol] = SOURCES.map(([f, k]) => merge(alerts(f, k)));
report('official', off, SINCE); report('volunteer', vol, SINCE);
report('volunteer since official ends', vol, Date.parse('2026-09-07T00:00:00Z'));
const c = {}, h = {};
for (const [s, e] of vol) {
  const t = new Date(s);
  if (t.getUTCFullYear() !== 2026) continue;
  const k = t.getUTCMonth() + 1; c[k] = (c[k] || 0) + 1; h[k] = (h[k] || 0) + (e - s) / 3600e3;
}
console.log('2026 by month:', Object.keys(c).map((k) => `${k}:${c[k]}/${Math.round(h[k])}h`).join(' '));
const o = off.filter(([s]) => s >= SINCE), v = vol.filter(([s]) => s >= SINCE && s <= off.at(-1)[0]).map(([s]) => s);
console.log(`official with a volunteer start within 2 min: ${o.filter(([s]) => v.some((t) => Math.abs(s - t) <= 120e3)).length} of ${o.length}`);
