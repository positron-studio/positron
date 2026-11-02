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
ok('NEGATIVE CONTROL: nothing to lay out is no grid', layoutDays({ n: 0, w: 100, h: 100 }).cols === 0);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
