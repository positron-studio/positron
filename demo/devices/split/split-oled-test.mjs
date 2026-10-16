// node demo/devices/split/split-oled-test.mjs: the compositor with no browser. Every region draws ink, and
// only inside its own rectangle; dividers sit between regions; the focus bar lands in the focused region.
import { LAYOUTS, compose, strays, lit, focusStops, wave, pixel, W, H } from './split-oled.mjs';

let ok = 0, bad = 0;
const t = (name, cond, detail = '') => { if (cond) ok++; else bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const state = (focus) => ({
  drums: { pattern: ['1000100010001000', '0000100000001000', '1010101010101010', '0000000000100000'], step: 11, playing: true },
  scope: { samples: wave('saw', 128, { amp: 0.9 }) },
  status: { playing: true, bpm: 120, shape: 'saw', step: 11 },
  focus,
});

for (const [name, L] of Object.entries(LAYOUTS)) {
  const all = [...L.regions, ...L.dividers];
  t(`${name}: nothing overlaps`, all.every((a, i) => all.every((b, j) => i === j || !overlap(a, b))));
  t(`${name}: everything is on the panel`, all.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H));
  for (const r of L.regions) {
    const f = compose(name, state(null), { only: r.id });
    const s = strays(f, [r]);
    t(`${name}: ${r.id} draws only inside its rectangle`, s.length === 0, s.length ? `${s.length} strays, first ${s[0]}` : `${lit(f)} lit`);
    t(`${name}: ${r.id} draws something`, lit(f) > 0);
  }
  const dv = compose(name, state(null), { only: 'dividers' });
  t(`${name}: dividers draw only themselves`, strays(dv, L.dividers).length === 0 && lit(dv) === L.dividers.reduce((n, d) => n + d.w * d.h, 0));
  const stops = focusStops(name, 4);
  t(`${name}: ${stops.length} focus stops, four drum rows among them`, stops.length === L.regions.length + 3);
  for (const fo of stops) {
    const a = compose(name, state(fo)), b = compose(name, state(null));
    const diff = new Uint8Array(a.length).map((_, i) => a[i] & ~b[i]);
    const r = L.regions.find((x) => x.id === fo.region);
    t(`${name}: focus on ${fo.region}${fo.row !== undefined ? ` row ${fo.row}` : ''} marks only that region`, lit(diff) > 0 && strays(diff, [r]).length === 0);
  }
}
// the drum row bars move with the row
const r0 = compose('stack', state({ region: 'drums', row: 0 })), r3 = compose('stack', state({ region: 'drums', row: 3 }));
const barY = (f) => { for (let y = 0; y < H; y++) if (pixel(f, 0, y)) return y; return -1; };
t('the focus bar on drum row 4 sits 21 px under row 1', barY(r3) - barY(r0) === 21, `${barY(r0)} ${barY(r3)}`);
// NEGATIVE CONTROL: a region drawn at a wrong rectangle is caught
const moved = compose('stack', state(null), { only: 'drums' });
t('NEGATIVE CONTROL: drums judged against the scope rectangle have strays', strays(moved, [LAYOUTS.stack.regions[1]]).length > 0);

console.log(`${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
