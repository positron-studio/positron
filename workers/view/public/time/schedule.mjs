// SCHEDULE tab: twenty events, one a second, timers armed a fraction ahead so
// pause stops and dragging skips. Its bar is the page's `__demo.transport`, so
// its measurements arrive after `ready`, from the harness's 500 ms play.
// See lessons/page-time.md#time-16

import { el } from '/shell/shell.mjs';
import { SELFCHECK } from '/shell/selfcheck.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi, publishTransport } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createGlue } from '/shell/glue.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { markAdapter, marks } from '/shell/fixture.mjs';
import { tabDiagram } from './how.mjs';

const DURATION = 20000;
// Handed to createDeck below AND printed in the lane's tooltip, from these same
// constants, so the page cannot describe a setting it does not use.
const TICK = 25, HORIZON = 100, GRACE = 150;

/** No readout: the numbers live under the lane they describe, in its gutter. */
// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = `${DURATION / 1000} events a second apart, each timer set only a moment ahead, so pause really stops and dragging really skips. Press play and the lane shows how late each one fired.`;

export const readout = null;

export function build({ panel, assert, log }) {
  const { fired, adapter } = markAdapter();
  const measured = new Map();            // id -> its measured row
  let asserted = false;
  let topAtRest = null;

  const deck = createDeck({
    items: marks(20, DURATION),
    adapters: { mark: adapter },
    range: [0, DURATION],
    tickMs: TICK, horizonMs: HORIZON, lateGraceMs: GRACE,
    // onDrift hands (newRows, allRows): an ARRAY of per-event rows. Reading it
    // as a scalar is how this readout once printed a confident 0 while holding
    // twenty real measurements.
    onDrift: (_rows, all) => report(all),
  });

  // Each mark is judged against its own way of firing: a committed timer lands
  // within a few ms, a swept mark anywhere in the check interval.
  // See lessons/page-time.md#time-17
  const budgetFor = (m) => (m.origin === 'tick-late' ? TICK : 5);
  const BANDS = [
    [1, '#8fd6a8', 'as expected'],
    [2, '#ffd400', 'over'],
    [4, '#e0b060', 'well over'],
    [Infinity, '#e0908a', 'far over'],
  ];
  const bandFor = (m) => BANDS.find(([lim]) => Math.abs(m.deltaMs) / budgetFor(m) < lim);

  // The page's own bar, so `__demo.transport` is this one. No slider: the
  // strip is the position surface.
  const host = el('div');
  const control = createTransportControl(deck);
  const bar = createBar({
    start: [playToggle(control).el],
    middle: [clockView(control).el, noteView(control).el],
    end: [loopView(control).el, ratesView(control).el],
  });
  host.append(bar.el);
  bindTransportKeys(control, { scope: bar.el });
  const transport = transportApi(control, { el: bar.el });
  publishTransport(transport);
  const view = createStripView(host, deck, {
    size: 'auto',
    gutter: 132,
    // A bounded piece has nowhere to run to, so the strip holds the whole range
    // rather than sliding its axis out from under the bar.
    follow: false,
    lanes: [{
      // NO `latch`: a mark's colour is a fact about what was observed, and
      // scrubbing back is not an observation, so colour comes from `measured`.
      id: 'mark', kind: 'mark', label: 'events', height: 72, width: 2,
      color: '#6a7280',
      // A line under the name from the first frame keeps the label block from jumping
      // when the numbers arrive; they replace it in place.
      // See lessons/page-time.md#time-18
      subLabel: 'nothing fired yet',
      terse: true,
      colorOfRow: (r) => {
        const m = measured.get(r.id);
        return m ? bandFor(m)[1] : '#3b424e';
      },
      describeRow: (r) => {
        const m = measured.get(r.id);
        if (!m) return 'not played yet';
        const [, , verdict] = bandFor(m);
        return [
          `${Math.abs(m.deltaMs).toFixed(2)} ms ${m.deltaMs < 0 ? 'early' : 'late'}`,
          verdict,
          m.origin === 'tick-late' ? `no timer, the ${TICK} ms check caught it` : 'timer set ahead',
        ];
      },
    }],
  });
  // The bar and the strip are one surface; `createGlue` re-parents both out of `host`.
  // See lessons/page-time.md#time-19
  const pair = createGlue(bar.el, view.surface);
  panel.add(pair);
  view.strip.fit?.();

  /** `typical` is the median and `worst` the largest, because a typical value
   *  alone hides the one bad fire that is the whole reason to look. */
  function report(rows) {
    for (const r of rows) measured.set(r.id, r);
    const xs = rows.map((r) => r.deltaMs).filter(Number.isFinite).sort((a, b) => a - b);
    if (!xs.length) return;
    const typical = xs[xs.length >> 1], worst = xs[xs.length - 1];
    const L = view.strip.lanes()[0];
    if (L) {
      L.subLabel = [`typical +${typical.toFixed(2)} ms`, `worst +${worst.toFixed(2)} ms`];
      view.strip.invalidate();
    }
    // On the first row (the harness plays 500 ms, one mark), behind the selfcheck
    // gate: a visitor pressing play is not asking to be graded.
    // See lessons/page-time.md#time-20
    if (!SELFCHECK || asserted) return;
    asserted = true;
    assert('every mark reports a real lateness', xs.every(Number.isFinite),
      `n=${xs.length} typical=${typical}`);
    assert('fire count <= item count', fired.length <= 20, `${fired.length}/20`);
    // The jump graded against the picture, two frames on, because `invalidate()`
    // schedules a draw rather than making one.
    // See lessons/page-time.md#time-21
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const after = gutterTop();
      assert('the lane does not move when the numbers arrive',
        topAtRest !== null && after !== null && Math.abs(after - topAtRest) <= 1,
        `top ${topAtRest} px before, ${after} px after (51 then 22 when this was reported)`);
    }));
  }

  /** Where the lane's label block sits, in canvas pixels, read off the picture:
   *  the first gutter row holding a pixel that is not the gutter's own fill. */
  function gutterTop() {
    const cv = view.el;
    const box = cv.getBoundingClientRect();
    if (!box.width || !cv.width) return null;
    const g = Math.max(1, Math.round(view.strip.readout().gutter * (cv.width / box.width)));
    const im = cv.getContext('2d').getImageData(0, 0, g, cv.height).data;
    const ground = [im[0], im[1], im[2]];
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < g; x++) {
        const i = (y * g + x) * 4;
        if (Math.abs(im[i] - ground[0]) + Math.abs(im[i + 1] - ground[1])
            + Math.abs(im[i + 2] - ground[2]) >= 24) return y;
      }
    }
    return null;
  }
  // The at-rest reading, kept fresh until the first mark is measured. Behind
  // the gate: reading the canvas back every frame is work no visitor asked for.
  if (SELFCHECK) (function sampleAtRest() {
    if (measured.size) return;
    const t = gutterTop();
    if (t !== null) topAtRest = t;
    requestAnimationFrame(sampleAtRest);
  })();

  log(`${DURATION / 1000}s, 20 events, speeds ${adapter.caps.rates.join('/')}x`);

  /**
   * The bar moves a deck whose Worker-woken scheduler arms a one-shot per event
   * inside `HORIZON`; the strip colours what came back. Numbers are the constants above.
   * See lessons/page-time.md#time-22
   */
  const how = tabDiagram(panel, () => ({
    caption: 'One deck keeps the time. Everything else in this tab asks it where it has got to.',
    nodes: [
      { id: 'br', label: 'Browser', sub: 'phone or laptop', kind: 'here', tech: 'browser',
        children: [
          { id: 'bar', label: 'transport bar', sub: 'play, pause, seek', tech: 'browser',
            note: 'Play and pause set the **deck** rate to 1 or 0, and a press on the strip is a '
                + 'seek. The bar keeps no time of its own.' },
          { id: 'deck', label: 'deck', sub: `${HORIZON}ms ahead`, tech: 'browser',
            note: `**createDeck** holds ${deck.items.length} events and works out the position from `
                + '**performance.now()**, the start plus the time since, times the rate. A pause or '
                + 'a seek cancels every timer it has set.' },
          { id: 'worker', label: 'Worker', sub: `${TICK}ms tick`, tech: 'browser',
            note: 'A **Web Worker** runs the **setInterval** and every one-shot **setTimeout**, '
                + 'because timers in a worker are not slowed to once a second in a background tab.' },
          { id: 'events', label: 'events', sub: `${deck.items.length}, 1s apart`, tech: 'browser',
            note: `An event no timer caught is fired by the next tick, up to ${GRACE} ms late. `
                + 'Each **actuate()** writes down when it really ran.' },
          { id: 'strip', label: 'strip', sub: 'canvas', tech: 'graphics',
            note: 'One tick per event on a **canvas**, coloured by lateness against its own way of '
                + `firing: 5 ms for a timer, one ${TICK} ms tick for a caught one.` },
        ] },
    ],
    links: [
      { from: 'bar', to: 'deck',
        note: '**play()**, **pause()** and **seek()**, which change a rate and a starting point '
            + 'and nothing else.' },
      { from: 'deck', to: 'worker',
        note: `Every ${TICK} ms the deck looks ${HORIZON} ms ahead and asks the worker for one `
            + '**setTimeout** per event it finds there.' },
      { from: 'worker', to: 'events',
        note: 'A **postMessage** from the worker wakes the page at the moment, and the event fires.' },
      { from: 'events', to: 'strip',
        note: 'Its lateness in milliseconds, which is the number under the lane name.' },
    ],
  }));

  return {
    deck, bar,
    // Two frames on: a strip fitted before its panel lays out fits its range into
    // the width it had then (20 s in about 160 px at 1280).
    // See lessons/page-time.md#time-23
    show() {
      how.draw();
      requestAnimationFrame(() => requestAnimationFrame(() => { view.strip.fit?.(); view.strip.invalidate(); }));
    },
    // A deck left running in a tab nobody can see is a sound nobody chose.
    hide() { if (deck.playing()) deck.pause(); },
    // No `bars`: this one is published and the harness drills it.
    bars: [],
    async check({ A }) {
      // One bar and one strip, counted from the DOM: a second build would double the bar.
      // See lessons/page-time.md#time-24
      const tab = panel.el;
      A('one bar and one strip, and they are one surface',
        tab.querySelectorAll('.tbar').length === 1
          && tab.querySelectorAll('canvas.pos-strip').length === 1
          && bar.el.parentElement === view.surface.parentElement
          && !!bar.el.parentElement?.classList.contains('pos-glue'),
        `${tab.querySelectorAll('.tbar').length} bar(s), `
        + `${tab.querySelectorAll('canvas.pos-strip').length} strip(s), `
        + `in .${bar.el.parentElement?.className}`);
      A('this is the bar the page publishes, so the harness drills it',
        !!window.__demo && window.__demo.transport === transport,
        window.__demo?.transport === transport ? '__demo.transport is SCHEDULE\'s' : 'another bar is published');
      how.check(A, [
        ['transport bar', panel.el.contains(bar.el), 'in this tab'],
        ['deck', deck.items.length === 20 && deck.range[1] === DURATION,
          `${deck.items.length} events over ${deck.range[1]} ms`],
        ['Worker', deck.hostName === 'worker', `host ${deck.hostName}`],
        ['events', deck.adapter('mark') === adapter, 'the mark adapter'],
        ['strip', panel.el.contains(view.el) && view.el.tagName === 'CANVAS', 'a canvas'],
      ]);
    },
  };
}
