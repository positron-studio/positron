// research/ua-alerts/alerts.mjs: Kyiv City alerts out of the dataset's two CSVs (no quoted fields in either).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const SOURCES = [['official_data_en.csv', 'oblast'], ['volunteer_data_en.csv', 'region']];

/** [start, end] in ms for every Kyiv City alert with an end in one CSV, exact duplicates removed. */
export function alerts(file, key, region = 'Kyiv City') {
  const [head, ...lines] = readFileSync(HERE + file, 'utf8').trim().split('\n');
  const col = Object.fromEntries(head.split(',').map((c, i) => [c, i]));
  const seen = new Set();
  for (const line of lines) {
    const f = line.split(',');
    if (f[col[key]] !== region || !f[col.finished_at]) continue;
    seen.add(`${Date.parse(f[col.started_at].replace(' ', 'T'))},${Date.parse(f[col.finished_at].replace(' ', 'T'))}`);
  }
  return [...seen].map((s) => s.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Overlapping alerts joined into one. */
export function merge(list) {
  const out = [];
  for (const [s, e] of list) {
    if (out.length && s <= out.at(-1)[1]) out.at(-1)[1] = Math.max(out.at(-1)[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** The calendar day in Kyiv of a moment, as YYYY-MM-DD. */
export const kyivDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(ms);
/** The day after a YYYY-MM-DD. */
export const nextDay = (day) => new Date(Date.parse(`${day}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10);
