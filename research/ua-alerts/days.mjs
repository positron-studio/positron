// node research/ua-alerts/days.mjs: Kyiv City, one character a day from 2022-02-24 (Kyiv time) to yesterday,
// 1 = an air-raid alert touched that day in either source, 0 = none. Writes demo/resources/ua-alerts/kyiv-days.json.
// The dataset starts 2022-02-25; sirens sounded in Kyiv on 2022-02-24, so day 1 is set to 1 by hand.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SOURCES, alerts, kyivDay, nextDay } from './alerts.mjs';

const days = new Set();
for (const [file, key] of SOURCES) {
  for (const [s, e] of alerts(file, key)) {
    const last = kyivDay(e);
    for (let d = kyivDay(s); d <= last; d = nextDay(d)) days.add(d);
  }
}
const start = '2022-02-24', end = kyivDay(Date.now() - 86400e3);
let bits = '';
for (let d = start; d <= end; d = nextDay(d)) bits += days.has(d) ? '1' : '0';
bits = '1' + bits.slice(1);
const out = fileURLToPath(new URL('../../demo/resources/ua-alerts/kyiv-days.json', import.meta.url));
mkdirSync(new URL('../../demo/resources/ua-alerts/', import.meta.url), { recursive: true });
writeFileSync(out, JSON.stringify({ region: 'Kyiv City', tz: 'Europe/Kyiv', start, end, raid: '1', days: bits,
  source: 'github.com/Vadimkin/ukrainian-air-raid-sirens-dataset, official and volunteer, MIT', made: kyivDay(Date.now()) }));
console.log(out, bits.length, bits.split('1').length - 1, bits.split('0').length - 1);
