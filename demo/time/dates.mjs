// DATES tab: two thousand years on one line, many dates a bracket rather than a
// day; the sandbox for `timeline/strip.mjs`. Checks run only from the check pass.
// The bar is glued with `scrub: false`, the strip being its position surface.
// See lessons/page-time.md#time-34

import { el, fmtNum } from '/shell/shell.mjs';
import { SELFCHECK } from '/shell/selfcheck.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createGlue } from '/shell/glue.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { zoomCeilingPps, ulpMs, DATE_WALL_MS, calendarLOD, calendarDate, calendarSpan, calendarStep,
  calendarLabel, calendarTicks } from '/timeline/strip.mjs';
import { markAdapter } from '/shell/fixture.mjs';
import { tabDiagram } from './how.mjs';

const YEAR = 365.2425 * 24 * 3600 * 1000;
const SPAN = 2000 * YEAR;
const t0 = Date.UTC(100, 0, 1);
const yr = (year) => t0 + (year - 100) * YEAR;
const GLYPH = { exact: '·', ignorance: '?', vagueness: '~' };

/**
 * Four cells in calendar words: the date under the playhead, time in view, the
 * ruler's step, dates on screen. The float limits behind the axis are asserted
 * in `check`, not shown: the calendar runs out of meaning first.
 * See lessons/page-time.md#time-35
 */
// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = 'Two thousand years on one line, where many dates are a range rather than a day. Zoom in until each mark shows how sure its date is.';

export const readout = { date: '', 'in view': '', grid: '', 'dates shown': '' };

export function build({ panel, set, log }) {
  // Shaped like an archive: dates crowd towards the present and get vaguer further
  // back. Deterministic, so every load draws the same.
  // See lessons/page-time.md#time-36
  const items = [];
  for (let i = 0; i < 22; i++) {
    const u = i / 21;
    const year = Math.round(1990 - 1840 * (1 - u) * (1 - u));
    const half = year < 1400 ? Math.max(6, Math.round((1400 - year) / 14)) : 0;
    // IGNORANCE is a date that exists and is not known, VAGUENESS one that was
    // never sharp: drawn alike, not the same claim.
    const kind = !half ? null : (i % 2 ? 'vagueness' : 'ignorance');
    // A bracketed row sits at its EARLIEST bound, so `at` claims no precision
    // the row does not have.
    const row = { id: `d${i}`, kind: 'era', at: yr(year - half),
                  payload: { label: String(year), sure: kind || 'exact' } };
    if (kind) {
      row.when = { kind, earliest: yr(year - half), latest: yr(year + half),
                   rule: 'positron-demo-bracket@1' };
    }
    items.push(row);
  }
  const bracketed = items.filter((r) => r.when).length;

  const { adapter } = markAdapter({ rates: [0.25, 0.5, 1, 2] });
  const deck = createDeck({ items, adapters: { era: adapter }, range: [t0, t0 + SPAN] });
  // Open on a real date: position 0 is 1970, where `ulpMs(0)` is the smallest denormal.
  // See lessons/page-time.md#time-37
  deck.seek(t0 + SPAN / 2);

  const host = el('div');
  // The clock prints a date, because hours on a two millennia deck are a true
  // number nobody can read. Not published: SCHEDULE's bar is the page's.
  const control = createTransportControl(deck);
  const bar = createBar({
    start: [playToggle(control).el],
    middle: [clockView(control, { fmt: (pos, range) => `${calendarDate(pos)} / ${calendarSpan(range[1] - range[0])}` }).el,
      noteView(control).el],
    end: [loopView(control).el, ratesView(control).el],
  });
  host.append(bar.el);
  bindTransportKeys(control, { scope: bar.el });
  const transport = transportApi(control, { el: bar.el });

  const HI = getComputedStyle(document.documentElement).getPropertyValue('--hi').trim() || '#ffd400';
  const view = createStripView(host, deck, {
    size: 'auto',
    // Follow off: following puts the playhead at 28% and slides the dates off the left.
    // See lessons/page-time.md#time-38
    follow: false,
    // DATES on the axis, not a distance from 1970.
    absolute: true,
    // ...and ruled in real years, months and days, as a calendar is.
    // See lessons/page-time.md#time-39
    calendar: true,
    // The `in view` cell says it, in a box that is there at every width; the
    // strip's own gutter copy dropped out at 375 and repeated it at 1280.
    zoomReadout: false,
    lanes: [
      // The mark becomes its character where zoom has made room. `gutterReserve`
      // sizes the gutter for the widest line, so the plot's left edge never moves.
      // See lessons/page-time.md#time-40
      { id: 'sure', kind: 'era', label: 'how sure', height: 26, as: 'ticks',
        color: HI, width: 2, glyphOf: (r) => GLYPH[r.payload?.sure] || '',
        gutterReserve: `${items.length} of ${items.length} legible` },
      { id: 'span', kind: 'era', label: 'brackets', height: 30, as: 'spans',
        color: HI, stack: false, labels: false,
        gutterReserve: `${items.length} bracketed` },
      // The bracketed rows only: a written date is a point mass and would
      // flatten every bracket's smear to half a pixel.
      { id: 'spread', kind: 'era', label: 'spread out', height: 46, as: 'spans',
        filter: (r) => !!r.when, bars: false, aggregate: true,
        gutterReserve: `${bracketed} of ${bracketed} counted` },
    ],
  });
  const { strip } = view;
  const pair = createGlue(bar.el, view.surface);

  /** Per-lane numbers beside their own ink, one short line each. */
  function gutters() {
    const by = {};
    const g = strip.lanes().find((L) => L.id === 'sure')?.glyphState;
    if (g) by.sure = [`${g.drawn} of ${g.had} legible`];
    const st = strip.spanStates('span');
    if (st) by.span = [`${st.smeared} bracketed`];
    const a = strip.aggregateStat('spread');
    if (a) by.spread = [`${a.counted} of ${a.items} counted`];
    for (const L of strip.lanes()) if (by[L.id]) L.subLabel = by[L.id];
  }

  /** How many of the dates touch the view, bracket and all. */
  const shown = (t0, t1) => items.filter((r) =>
    (r.when ? r.when.latest : r.at) >= t0 && (r.when ? r.when.earliest : r.at) <= t1).length;

  // The plot can widen after the fit (2000 years drawn as 4,862). A width change
  // with the view untouched keeps the span, not the scale; zoom and pan are left alone.
  // See lessons/page-time.md#time-41
  let last = null;
  function keepSpan() {
    const v = strip.view();
    const [a, b] = strip.visible();
    const w = ((b - a) * v.pxPerSecond) / 1000;
    if (last && Math.abs(w - last.w) > 1 && v.pxPerSecond === last.pps
        && v.originTime === last.origin && v.scrollX === last.scroll) {
      strip.fit(last.a, last.b, { pad: 0 });
      return keepSpan();
    }
    last = { w, a, b, pps: v.pxPerSecond, origin: v.originTime, scroll: v.scrollX };
    return [a, b];
  }

  function refresh() {
    const [a, b] = keepSpan();
    const v = strip.view();
    const t = deck.position();
    const { major } = calendarLOD(v.pxPerSecond);
    set('date', calendarDate(t, major));
    set('in view', calendarSpan(b - a));
    set('grid', calendarStep(major));
    set('dates shown', `${shown(a, b)} of ${items.length}`);
    gutters();
    strip.invalidate();
  }

  /**
   * Zoom about the playhead, not the plot's centre, whose pixel error multiplies on
   * every press. The playhead's x is the anchor; off screen, it is centred first.
   * See lessons/page-time.md#time-42
   */
  function zoom(f) {
    const t = deck.position();
    const [a, b] = strip.visible();
    const w = strip.timeToX(b) - strip.timeToX(a);
    let px = strip.timeToX(t);
    if (!(px >= 0 && px <= w)) {
      const v = strip.view();
      strip.setView({ scrollX: v.scrollX + px - w / 2 });
      px = w / 2;
    }
    strip.zoomAt(f, px);
    refresh();
  }

  const btn = (label, onclick, cls = '') => {
    const b = el('button', cls, label, { type: 'button' });
    b.onclick = onclick;
    return b;
  };
  const row = el('div', 'time-row');
  row.append(
    btn('Zoom in', () => zoom(1.5)),
    btn('Zoom out', () => zoom(1 / 1.5)),
    // Primary: it is the one that puts the whole subject in view.
    btn('Fit', () => { strip.fit(); refresh(); }, 'pos-pri'),
  );
  panel.add(pair, row);
  strip.fit();
  setInterval(refresh, 250);
  refresh();
  log(`${(SPAN / YEAR).toFixed(0)} years, ${bracketed} of ${items.length} dates carry a bracket`);

  /**
   * Dated rows, some with a `when` bracket, on a deck in epoch ms, drawn in three
   * lanes under a calendar ruler; the zoom buttons move the view about the playhead.
   * See lessons/page-time.md#time-43
   */
  const how = tabDiagram(panel, () => ({
    caption: 'Two thousand years on one ordinary timeline. What changes is how sure each date is '
      + 'and how the ruler counts.',
    nodes: [
      { id: 'br', label: 'Browser', sub: 'phone or laptop', kind: 'here', tech: 'browser',
        children: [
          { id: 'dates', label: 'dates', sub: `${items.length}, ${bracketed} brackets`, tech: 'archive',
            note: 'A bracketed date carries a **when** with an earliest and a latest. **ignorance** '
                + 'means it was one day and nobody knows which, **vagueness** that it never was '
                + 'one day.' },
          { id: 'deck', label: 'deck', sub: 'ms since 1970', tech: 'browser',
            note: 'Positions are milliseconds since 1970 in an ordinary **Float64**, so year 100 is '
                + 'a large negative number. The further from 1970, the coarser the smallest step '
                + 'it can hold.' },
          { id: 'strip', label: 'strip', sub: '3 lanes, canvas', tech: 'graphics',
            note: 'A mark per date, a bar per bracket, and each bracket\'s weight spread across its '
                + 'pixels. The ruler steps in real years, months and days, picked from how many '
                + 'pixels a second gets.' },
          { id: 'zoom', label: 'zoom', sub: 'in, out, Fit', tech: 'browser',
            note: '**zoomAt()** holds the playhead\'s own pixel still, so press after press stays on '
                + 'the date you started from. **Fit** puts every year back in view.' },
        ] },
    ],
    links: [
      { from: 'dates', to: 'deck',
        note: 'Each row at its earliest bound, so a position claims no precision the date '
            + 'does not have.' },
      { from: 'deck', to: 'strip',
        note: 'The playhead and the rows in view, read on every frame.' },
      { from: 'zoom', to: 'strip', back: true,
        note: 'A new number of pixels per second and a scroll, and nothing else.' },
    ],
  }));

  return {
    deck, bar,
    // Two frames on: a strip fitted before its panel lays out fits its range into
    // the width it had then (20 s in about 160 px at 1280).
    // See lessons/page-time.md#time-44
    show() {
      how.draw();
      requestAnimationFrame(() => requestAnimationFrame(() => { strip.fit(); refresh(); }));
    },
    hide() { if (deck.playing()) deck.pause(); },
    bars: [{ name: 'dates', bar: transport, strip: view.el }],
    async check({ A }) {
      const tab = panel.el;
      A('one bar and one strip, and they are one surface',
        tab.querySelectorAll('.tbar').length === 1
          && tab.querySelectorAll('canvas.pos-strip').length === 1
          && bar.el.parentElement === view.surface.parentElement
          && !!bar.el.parentElement?.classList.contains('pos-glue'),
        `${tab.querySelectorAll('.tbar').length} bar(s), `
        + `${tab.querySelectorAll('canvas.pos-strip').length} strip(s), `
        + `in .${bar.el.parentElement?.className}`);
      strip.fit(); refresh();
      const t = deck.position();
      A('the zoom stops at a number, not at infinity', Number.isFinite(zoomCeilingPps(t)),
        `${fmtNum(zoomCeilingPps(t))} px a second at ${new Date(t).getUTCFullYear()}`);
      A('the further from now, the coarser the smallest step',
        ulpMs(DATE_WALL_MS) > ulpMs(t), `${ulpMs(t)} ms here, ${ulpMs(DATE_WALL_MS)} ms at the wall`);
      A('past 8.64e15 ms a date is no longer a date', DATE_WALL_MS === 8.64e15, String(DATE_WALL_MS));

      // The statistic is read off the picture: `aggregateStat` is what the last frame drew.
      // See lessons/page-time.md#time-45
      strip.draw();
      const a = strip.aggregateStat('spread');
      A('uncertain dates spread out, they do not spike', !!a && a.max > 0 && a.cols > 1,
        a ? `${a.cols} columns, tallest ${a.max.toFixed(4)}` : 'the lane drew nothing');
      A('the spread keeps the weight it was given', !!a && a.total > 0, a ? a.total.toFixed(3) : 'none');
      // The ledger balances at every zoom: counted plus added-nothing is all.
      // See lessons/page-time.md#time-46
      A('the spread accounts for every bracket it was handed',
        !!a && a.items === a.counted + a.open && a.items <= bracketed,
        a ? `${a.items} of ${bracketed} brackets in this window, counted ${a.counted},`
          + ` added nothing ${a.open}, cut by the edge ${a.clipped}` : 'none');
      A('it names the method it used', !!a && typeof a.method === 'string' && a.method.length > 0,
        a ? a.method : 'none');
      // The ruler is a calendar: fitted, every label is a whole year on a round step,
      // the same writing the `date` cell uses.
      // See lessons/page-time.md#time-47
      const cal = calendarLOD(strip.view().pxPerSecond).major;
      const [v0, v1] = strip.visible();
      const labels = calendarTicks(cal, v0, v1).map((x) => calendarLabel(x, cal));
      // `ticks.calendar` is set only by the calendar ruler's own draw, so this
      // goes red if the strip fell back to the ms ladder.
      const drawn = strip.readout().ticks?.calendar;
      A('the ruler reads whole years on a round step when the whole span is in view',
        drawn === calendarStep(cal) && cal.u === 'y' && labels.length >= 2
          && labels.every((l) => /^-?\d+$/.test(l) && +l % cal.n === 0),
        `every ${drawn || '(ms ladder drew it)'}: ${labels.join(' ')}`);

      // A RELATIONSHIP, NOT A COUNT: zoom in and more characters appear, zoom
      // out and they go. Saved and restored inside one task.
      if (SELFCHECK) {
        const saved = strip.view();
        const glyphs = () => {
          strip.draw();
          return strip.lanes().find((L) => L.id === 'sure')?.glyphState || { had: 0, drawn: 0 };
        };
        strip.fit();
        const wide = glyphs();
        strip.fit(yr(1900), yr(2000));
        const close = glyphs();
        strip.setView(saved); strip.draw();
        A('zoom in far enough and a mark says how sure its date is',
          wide.had > wide.drawn && close.drawn === close.had && close.drawn > 0,
          `${wide.drawn} of ${wide.had} legible across 2000 years, `
          + `${close.drawn} of ${close.had} across the last hundred`);
      }
      how.check(A, [
        ['dates', items.length === 22 && bracketed > 0 && items.filter((r) => r.when).length === bracketed,
          `${bracketed} of ${items.length} carry a when`],
        ['deck', deck.range[0] === t0 && t0 < 0, `from ${new Date(t0).getUTCFullYear()}, ${t0} ms`],
        ['strip', panel.el.contains(view.el) && strip.lanes().length === 3 && !!strip.readout().ticks?.calendar,
          `${strip.lanes().length} lanes, ruler every ${strip.readout().ticks?.calendar}`],
        ['zoom', panel.el.contains(row) && row.querySelectorAll('button').length === 3,
          `${row.querySelectorAll('button').length} buttons`],
      ]);
      const st = strip.spanStates('span');
      log(`${st.smeared} of ${items.length} dates are a bracket, ${st.ignorance} unknown, ${st.vagueness} vague`);
    },
  };
}
