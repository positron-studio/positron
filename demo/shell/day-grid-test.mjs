// node demo/shell/day-grid-test.mjs: day-grid.mjs's layout, no browser.
import { layoutDays, cellAt } from './day-grid.mjs';
let fails = 0;
const ok = (name, c, d = '') => { console.log(`${c ? 'ok  ' : 'FAIL'}  ${name}${d ? `  (${d})` : ''}`); if (!c) fails++; };
const span = (g, k) => k * g.cell + (k - 1) * g.gap;
const fitsIn = (g, w, h) => span(g, g.cols) <= w && span(g, g.rows) <= h && g.x0 >= 0 && g.y0 >= 0;

for (const [w, h] of [[1080, 1920], [1080, 1350], [1080, 1080], [1920, 1080], [390, 844], [200, 50], [37, 1000]]) {
  for (const n of [1, 7, 365, 1712]) {
    const g = layoutDays({ n, w, h });
    const ok1 = g.cols * g.rows >= n && fitsIn(g, w, h) && g.pages === 1;
    // no other column count gives a bigger cell
    let better = 0;
    const most = (len, k) => { let c = len; while (c > 0 && k * c + (k - 1) * Math.round(0.12 * c) > len) c--; return c; };
    for (let c = 1; c <= n; c++) { const cell = Math.min(most(w, c), most(h, Math.ceil(n / c))); if (cell > g.cell) better = c; }
    if (!ok1 || better) ok(`${n} days in ${w}x${h}`, false, `${g.cols}x${g.rows} cell ${g.cell}, better cols ${better}`);
  }
}
ok('every size and count: all days fit, one page, the biggest cell', fails === 0);

const story = layoutDays({ n: 1712, w: 1080, h: 1920 });
ok('1712 days on a story fill it as squares of over 30 px', story.cell >= 30 && story.cols * story.rows >= 1712, `${story.cols}x${story.rows} cell ${story.cell}`);

const paged = layoutDays({ n: 1712, w: 1080, h: 1920, minCell: 90 });
ok('a minimum cell pages the days', paged.cell === 90 && paged.pages === Math.ceil(1712 / paged.per) && paged.pages > 1 && fitsIn(paged, 1080, 1920), `${paged.cols}x${paged.rows}, ${paged.pages} pages`);
const last = cellAt(paged, paged.pages - 1, 0);
ok('the last page starts on the day after the one before ends', last.i === (paged.pages - 1) * paged.per && last.x === paged.x0 && last.y === paged.y0);
ok('a minimum the fit already beats changes nothing', JSON.stringify(layoutDays({ n: 1712, w: 1080, h: 1920, minCell: 10 })) === JSON.stringify(story));
ok('no gap means cells touch', (() => { const g = layoutDays({ n: 100, w: 1000, h: 1000, gap: 0 }); return g.gap === 0 && g.cell === 100 && g.x0 === 0; })());
const hours = layoutDays({ n: 41088, w: 1080, h: 1920, group: 24 });
ok('41088 hours on a story fit whole days a row', hours.cols % 24 === 0 && hours.cols * hours.rows >= 41088 && fitsIn(hours, 1080, 1920) && hours.cell >= 4, `${hours.cols}x${hours.rows} cell ${hours.cell}`);
const hp = layoutDays({ n: 41088, w: 1080, h: 1920, group: 24, minCell: 20 });
ok('paged hours keep whole days a row', hp.cols % 24 === 0 && hp.pages > 1 && fitsIn(hp, 1080, 1920), `${hp.cols}x${hp.rows}, ${hp.pages} pages`);
ok('a group wider than the box is dropped, not forced', (() => { const g = layoutDays({ n: 100, w: 10, h: 1000, group: 24 }); return g.cols < 24 && fitsIn(g, 10, 1000); })());
// edge to edge: cells tile the full width from the top, the last row inside the height, every cell within a pixel
const tiles = (g, n, w, h) => {
  const cs = Array.from({ length: Math.min(n, g.per) }, (_, k) => cellAt(g, 0, k)), first = cs.filter((c, k) => k < g.cols);
  const right = Math.max(...first.map((c) => c.x + c.w)), bottom = Math.max(...cs.map((c) => c.y + c.h)), sizes = cs.map((c) => c.w).concat(cs.map((c) => c.h));
  return first[0].x === 0 && cs[0].y === 0 && right === w && bottom <= h && Math.max(...sizes) - Math.min(...sizes) <= 1
    && first.every((c, k) => k === 0 || c.x === first[k - 1].x + first[k - 1].w + g.gap);
};
for (const [n, w, h, o] of [[1712, 1080, 1920, {}], [41088, 1080, 1920, { group: 24, gap: 0 }], [1712, 1080, 1350, {}], [365, 1920, 1080, {}], [1712, 1080, 1920, { minCell: 90 }], [41088, 1080, 1920, { group: 24, gap: 0, minCell: 20 }]]) {
  const g = layoutDays({ n, w, h, edge: true, ...o });
  ok(`edge to edge: ${n} in ${w}x${h} ${JSON.stringify(o)}`, tiles(g, n, w, h) && (o.minCell ? g.pages > 1 : g.pages === 1 && g.cols * g.rows >= n) && (!o.group || g.cols % o.group === 0), `${g.cols}x${g.rows} cell ${g.cell}`);
}
for (const o of [{}, { group: 24, gap: 0 }]) {
  const n = o.group ? 41088 : 1712, g = layoutDays({ n, w: 1080, h: 1920, edge: 'bottom', ...o });
  const last = cellAt(g, 0, g.cols * g.rows - 1), top = layoutDays({ n, w: 1080, h: 1920, edge: true, ...o });
  ok(`bottom edge: the last row ends on the bottom, the same grid as from the top ${JSON.stringify(o)}`, last.y + last.h === 1920 && g.y0 > 0 && g.cols === top.cols && g.rows === top.rows, `y0 ${g.y0}`);
}
{
  // a week a row on a 4:5 post: the width filled, the last row on the bottom edge, rectangles a pixel apart at most
  const g = layoutDays({ n: 41088, w: 1080, h: 1122, group: 24, gap: 0, edge: 'bottom', cols: 168 });
  const cs = [0, 167, 41087, 168 * 244].map((k) => cellAt(g, 0, k)), last = cellAt(g, 0, g.cols * g.rows - 1);
  const ws = cs.map((c) => c.w), hs = cs.map((c) => c.h);
  ok('fixed columns: a week a row fills a 4:5 post as rectangles', g.cols === 168 && g.rows === 245 && cs[1].x + cs[1].w === 1080 && last.y + last.h === 1122 && cs[0].y >= 0
    && Math.max(...ws) - Math.min(...ws) <= 1 && Math.max(...hs) - Math.min(...hs) <= 1 && hs[0] < ws[0], `${ws[0]} x ${hs[0]} px, top ${g.y0}`);
  const sq = layoutDays({ n: 41088, w: 1080, h: 1920 - 324, group: 24, gap: 0, edge: 'bottom', cols: 168 });
  ok('fixed columns that fit stay square', sq.pitchY === sq.pitch, `${sq.pitch.toFixed(2)} px`);
}
ok('NEGATIVE CONTROL: the centred grid is not edge to edge', !tiles(story, 1712, 1080, 1920));
ok('NEGATIVE CONTROL: nothing to lay out is no grid', layoutDays({ n: 0, w: 100, h: 100 }).cols === 0);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
