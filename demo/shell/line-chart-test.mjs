// node demo/shell/line-chart-test.mjs: chartLayout, the pure half of line-chart.mjs, with no document.
// Scales, ticks, the broken line, the peak and the empty state. Negative controls are named: a layout that drew
// every series to the same height, put the peak on the last point or ticked at random would pass a naive suite.
import { chartLayout, niceStep, TIME_STEPS, TICK_PX } from './line-chart.mjs';

let pass = 0, fail = 0;
const check = (name, ok, got = '') => { if (ok) { pass++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name}${got ? `: ${got}` : ''}`); } };
const MIN = 60_000, H = 60 * MIN;
const T0 = Date.UTC(2026, 9, 22, 18, 0);
const base = { from: T0, to: T0 + 2 * H, width: 600, height: 180, offsetMin: 0 };
const pts = (vals, every = 10 * MIN) => vals.map((v, i) => [T0 + i * every, v]);

// the empty state
for (const [why, o] of [['no series', {}], ['a series with no points', { series: [{ points: [] }] }], ['only nulls', { series: [{ points: pts([null, null]) }] }],
  ['points all outside the range', { series: [{ points: [[T0 - H, 3], [T0 + 3 * H, 4]] }] }], ['no width yet (a closed tab)', { series: [{ points: pts([1, 2]) }], width: 0 }]]) {
  const L = chartLayout({ ...base, ...o });
  check(`empty: ${why} draws nothing`, L.empty && !L.lines.length && !L.xTicks.length && !L.yTicks.length && L.peak === null);
}

// scales
const L = chartLayout({ ...base, series: [{ name: 'people', points: pts([2, 5, 3, 7, 7, 4, 1, 0, 2, 3, 6, 5, 4]) }, { name: 'raw', points: pts([1, 3, 2, 4, 4, 2, 1, 0, 1, 2, 3, 3, 2]) }] });
check('the time range spans the plot: from at the left edge, to at the right', Math.abs(L.x(T0) - L.plot.l) < 1e-9 && Math.abs(L.x(T0 + 2 * H) - L.plot.r) < 1e-9);
check('0 sits on the baseline and the top tick holds the largest value', L.y(0) === L.plot.b && L.yTop >= 7 && L.yTicks.at(-1).v === L.yTop, `${L.yTop}`);
check('the counts are whole: every y tick is an integer, evenly spaced', L.yTicks.every((t) => Number.isInteger(t.v)) && new Set(L.yTicks.slice(1).map((t, i) => t.v - L.yTicks[i].v)).size === 1, L.yTicks.map((t) => t.v).join());
check('NEGATIVE CONTROL: the two series are not drawn on the same line', L.lines[0].d !== L.lines[1].d && L.lines.length === 2);
check('x ticks are inside the range, on whole steps, never closer than TICK_PX', L.xTicks.length >= 2 && L.xTicks.every((t) => t.t >= T0 && t.t <= T0 + 2 * H && t.t % L.step === 0)
  && L.xTicks.slice(1).every((t, i) => t.x - L.xTicks[i].x >= TICK_PX - 1e-6), L.xTicks.map((t) => t.label).join(' '));
check('tick labels are the hour and minute in the offset given', L.xTicks[0].label === '18:00', L.xTicks.map((t) => t.label).join(' '));
const L2 = chartLayout({ ...base, offsetMin: 180, series: [{ points: pts([1, 2]) }] });
check('NEGATIVE CONTROL: another offset labels the same instant differently', L2.xTicks[0].label === '21:00', L2.xTicks.map((t) => t.label).join(' '));
const wide = chartLayout({ ...base, to: T0 + 48 * H, width: 1200, series: [{ points: pts([1, 2, 3], 6 * H) }] });
check('48 hours: a coarser step, and a day start is labelled as a day', wide.step >= 3 * H && wide.xTicks.some((t) => t.label === '23 Oct'), wide.xTicks.map((t) => t.label).join(' '));
check('NEGATIVE CONTROL: a narrow chart takes fewer ticks than a wide one over the same range',
  chartLayout({ ...base, width: 300, series: [{ points: pts([1]) }] }).xTicks.length < chartLayout({ ...base, width: 1200, series: [{ points: pts([1]) }] }).xTicks.length);

// the line breaks at a missing reading
const gap = chartLayout({ ...base, series: [{ points: pts([1, 2, null, 3, 4]) }] });
check('a null breaks the line: two runs', (gap.lines[0].d.match(/M/g) || []).length === 2, gap.lines[0].d);
check('NEGATIVE CONTROL: without the null it is one run', (chartLayout({ ...base, series: [{ points: pts([1, 2, 3, 4]) }] }).lines[0].d.match(/M/g) || []).length === 1);

// the peak
check('the peak is series 0\'s largest value, the earliest of a tie', L.peak.v === 7 && L.peak.t === T0 + 30 * MIN && L.peak.label === 'peak 7', JSON.stringify({ v: L.peak.v, t: (L.peak.t - T0) / MIN }));
check('NEGATIVE CONTROL: the peak is not the last point and not series 1', L.peak.v !== 4 && L.peak.v !== 5);
check('the peak sits where its value is drawn', L.peak.x === L.x(L.peak.t) && L.peak.y === L.y(7));
const late = chartLayout({ ...base, series: [{ points: pts([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9]) }] });
check('a peak in the right half is labelled leftwards, so the words stay on the chart', late.peak.anchor === 'end' && L.peak.anchor === 'start');

// a flat zero is still a chart, with a top of 1
const zero = chartLayout({ ...base, series: [{ points: pts([0, 0, 0]) }] });
check('all zeros: a chart with a top of 1, not a division by zero', !zero.empty && zero.yTop === 1 && Number.isFinite(zero.y(0)));
check('niceStep: 1, 2 or 5 times a power of ten', niceStep(7, 4) === 2 && niceStep(37, 4) === 10 && niceStep(3, 4) === 1 && niceStep(130, 4) === 50);
check('TIME_STEPS run smallest first', TIME_STEPS.every((s, i) => !i || s > TIME_STEPS[i - 1]));

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
