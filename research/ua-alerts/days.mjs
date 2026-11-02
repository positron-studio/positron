// node research/ua-alerts/days.mjs: Kyiv City, one character a day from 2022-02-24 (Kyiv time) to yesterday,
// 1 = an air-raid alert touched that day in either source, 0 = none; and `hours`, 24 a Kyiv day, the same per clock
// hour. Writes demo/resources/ua-alerts/kyiv-days.json. The dataset starts 2022-02-25: sirens sounded in Kyiv on
// 2022-02-24, so day 1 is set to 1 by hand, and its hours, which nobody recorded, are 2 (no data).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SOURCES, alerts, kyivDay, kyivHour, nextDay } from './alerts.mjs';

const days = new Set(), hours = new Set();
for (const [file, key] of SOURCES) {
  for (const [s, e] of alerts(file, key)) {
    const last = kyivDay(e);
    for (let d = kyivDay(s); d <= last; d = nextDay(d)) days.add(d);
    for (let t = s - (s % 3600e3); t < e; t += 3600e3) hours.add(kyivHour(t));
  }
}
const start = '2022-02-24', end = kyivDay(Date.now() - 86400e3);
let bits = '';
for (let d = start; d <= end; d = nextDay(d)) bits += days.has(d) ? '1' : '0';
bits = '1' + bits.slice(1);
let hbits = '';
for (let d = start; d <= end; d = nextDay(d)) for (let h = 0; h < 24; h++) hbits += d === start ? '2' : hours.has(`${d} ${String(h).padStart(2, '0')}`) ? '1' : '0';
const out = fileURLToPath(new URL('../../demo/resources/ua-alerts/kyiv-days.json', import.meta.url));
mkdirSync(new URL('../../demo/resources/ua-alerts/', import.meta.url), { recursive: true });
writeFileSync(out, JSON.stringify({ region: 'Kyiv City', tz: 'Europe/Kyiv', start, end, raid: '1', days: bits, hours: hbits,
  source: 'github.com/Vadimkin/ukrainian-air-raid-sirens-dataset, official and volunteer, MIT', made: kyivDay(Date.now()) }));
console.log(out, bits.length, bits.split('1').length - 1, bits.split('0').length - 1, 'hours', hbits.length, hbits.split('1').length - 1);
