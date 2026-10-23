// LOOPS tab: one two-second recording placed three times, the last looping twice
// in the chosen direction. The direction is this tab's own `createChoice` of three
// words; the drift checks ride the first play of the bar drill that follows.
// See lessons/page-time.md#time-25

import { el } from '/shell/shell.mjs';
import { SELFCHECK } from '/shell/selfcheck.mjs';
import { createChoice } from '/shell/choice.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createGlue } from '/shell/glue.mjs';
import { LOOP_WAYS, LOOP_TURN, WAY_GLYPH, WAY_SAYS } from '/shell/looper.mjs';
import { createDeck, workerTickHost } from '/timeline/transport.mjs';
import { createNest, nestedDrift } from '/timeline/nested.mjs';
import { refDeck, quotation } from '/timeline/score.mjs';
import { markAdapter, marks } from '/shell/fixture.mjs';
import { tabDiagram } from './how.mjs';

const PARENT = 12000, CHILD = 2000;

/** The kit's three DIRECTIONS and not all five ways: `half` is a speed and
 *  `chop` a length, and this tab already shows both as widths. */
const WAYS = LOOP_TURN.map((i) => LOOP_WAYS[i][0]);      // round, back, pingpong
const WAY_WORD = { round: 'forwards', back: 'backwards', pingpong: 'there and back' };

/** No readout: the numbers live under the lane they describe. */
// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = `One ${CHILD / 1000} second recording placed three times, the last of them looping twice in the direction you pick under the timeline.`;

export const readout = null;

export function build({ panel, assert, log }) {
  /** FOUR MARKS, NOT EVENLY SPACED: an evenly spaced set is its own mirror, so
   *  a backwards pass would draw the forwards picture and the button would be a
   *  claim with no readout. */
  const SRC_AT = [0, 300, 1100, 1600];
  const childItems = SRC_AT.map((at, i) => ({ at, kind: 'mark', id: `m${i}`, payload: { i } }));
  const mirror = (at) => SRC_AT[0] + SRC_AT[SRC_AT.length - 1] - at;
  const rewoundItems = childItems
    .map((m) => ({ ...m, at: mirror(m.at), id: `${m.id}r` }))
    .sort((a, b) => a.at - b.at);

  // The log names the position IN THE RECORDING, which both copies agree on
  // through `payload.i`.
  const kidMarks = markAdapter({
    rates: [0.25, 0.5, 1, 2],
    onFire: (payload, ev) => {
      if (!Number.isFinite(ev?.at)) return;
      const src = childItems[payload?.i]?.at;
      log(`recording mark at ${((Number.isFinite(src) ? src : ev.at) / 1000).toFixed(1)}s`);
    },
  });
  // NOT `autoStart: false`: autoStart is what starts the scheduler, and the
  // nest only drives the transport. Without it the recording never fired.
  const child = createDeck({ items: childItems, adapters: { mark: kidMarks.adapter }, range: [0, CHILD] });
  refDeck(child, 'kurenniemi-1972');
  // BACKWARDS IS A MIRRORED COPY: no quotation runs a child at a negative rate.
  const rewound = createDeck({ items: rewoundItems, adapters: { mark: kidMarks.adapter }, range: [0, CHILD] });
  refDeck(rewound, 'kurenniemi-1972-rewound');
  const REFS = { forward: 'kurenniemi-1972', rewound: 'kurenniemi-1972-rewound' };
  const isBack = (sp) => sp && sp.deck === rewound;
  const itemsOf = (sp) => (isBack(sp) ? rewoundItems : childItems);
  const srcOf = (sp, at) => (isBack(sp) ? mirror(at) : at);

  let asserted = false;
  const own = markAdapter({ rates: [0.25, 0.5, 1, 2] });
  const parent = createDeck({
    items: marks(8, PARENT),
    adapters: { mark: own.adapter },
    range: [0, PARENT],
    // An ARRAY of per-event rows; `nestedDrift()` has no top-level p50.
    onDrift: (rows) => { if (rows.length && !asserted && SELFCHECK) { asserted = true; checkArrangement(assert); } },
  });

  // A wrap is a committed one-shot and needs a host: one host for every rebuild,
  // or each press would start a worker.
  // See lessons/page-time.md#time-26
  const boundaryHost = workerTickHost();

  // Declared before `buildNest`, which reads it; a later `const` is in its dead zone.
  // See lessons/page-time.md#time-27
  let view = null;
  let nest = null, loopIds = [], wraps = 0;
  function buildNest(way) {
    nest?.dispose();
    wraps = 0;
    nest = createNest(parent, {
      resolve: (ref) => (ref === REFS.forward ? child : ref === REFS.rewound ? rewound : null),
      tickHost: boundaryHost,
    });
    // THREE USES, ONE RECORDING: plain, at 2x, and looped.
    nest.add(quotation({ id: 'plain', ref: REFS.forward, at: 1000, in: 0, out: CHILD }));
    nest.add(quotation({ id: 'fast', ref: REFS.forward, at: 4000, in: 0, out: CHILD, rate: 2 }));
    if (way === 'pingpong') {
      // Pingpong is two quotations end to end, so it has no wrap: its joint is a
      // presence exit and enter, both logged.
      // See lessons/page-time.md#time-28
      nest.add(quotation({ id: 'loop', ref: REFS.forward, at: 6000, in: 0, out: CHILD }));
      nest.add(quotation({ id: 'loop-back', ref: REFS.rewound, at: 8000, in: 0, out: CHILD }));
      loopIds = ['loop', 'loop-back'];
    } else {
      nest.add(quotation({ id: 'loop', ref: way === 'back' ? REFS.rewound : REFS.forward,
                           at: 6000, in: 0, out: CHILD, repeat: 2 }));
      loopIds = ['loop'];
    }
    nest.onWrap(() => { wraps++; });
    nest.onPresence(({ span, present, parentPos }) => {
      log(`${span} ${present ? 'starts' : 'ends'} at ${(parentPos / 1000).toFixed(2)}s`,
        present ? 'hi' : 'info');
    });
    view?.strip.fit();
    view?.strip.invalidate();
  }

  let wayIx = 0;
  const way = () => WAYS[wayIx];
  // The words are the kit's own (`WAY_SAYS`), so the tooltip and the face say
  // the same thing a screen reader hears.
  const wayPick = createChoice({
    label: 'the loop plays',
    options: WAYS.map((w) => [WAY_WORD[w], w]),
    title: (w) => WAY_SAYS[w],
    onPick: (w) => {
      wayIx = WAYS.indexOf(w);
      buildNest(way());
      log(`loop ${way()}`, 'hi');
    },
  });

  buildNest(way());

  const host = el('div');
  const control = createTransportControl(parent);
  const bar = createBar({
    start: [playToggle(control).el],
    middle: [clockView(control).el, noteView(control).el],
    end: [loopView(control).el, ratesView(control).el],
  });
  host.append(bar.el);
  bindTransportKeys(control, { scope: bar.el });
  const transport = transportApi(control, { el: bar.el });
  view = createStripView(host, parent, {
    size: 'auto', follow: false, gutter: 150,
    lanes: [
      // One slice per pass, so the loop reads as [ ][ ]. A part is placed, an event is
      // one occurrence inside it (Cubase's words), and nothing is copied.
      // See lessons/page-time.md#time-29
      { id: 'deck-span', kind: 'deck-span', label: 'part', height: 52, barPad: 8, as: 'spans',
        stack: false, barGap: 3, terse: true, color: '#c9a0ff', alpha: 0.9,
        rows: () => {
          const out = [];
          for (const sp of nest.spans()) {
            const n = sp.iterations || 1;
            for (let i = 0; i < n; i++) {
              const from = nest.iterationAt(sp.id, i);
              const to = nest.iterationAt(sp.id, i + 1);
              const end = Number.isFinite(to) ? to : from + (sp.onePassMs ?? (sp.out - sp.in));
              if (!Number.isFinite(from) || !(end > from)) continue;
              out.push({ at: from, id: `${sp.id}#${i + 1}`, kind: 'deck-span',
                         payload: { durMs: end - from, pass: i + 1, of: n, quo: sp.id,
                                    from: sp.c0, to: sp.c1, rate: sp.rate || 1,
                                    back: isBack(sp) } });
            }
          }
          return out;
        },
        labelOf: (sp, { bw } = {}) => {
          const p = sp.row?.payload || {};
          const n = (ms) => String(+(ms / 1000).toFixed(1));
          const range = `${n(p.from)}–${n(p.to)}s`;
          const fast = p.rate && p.rate !== 1 ? `@${p.rate}x` : '';
          const pass = p.of > 1 ? `${p.pass}/${p.of}` : '';
          const turn = p.back ? WAY_GLYPH.back : '';
          if (bw && bw < 84) return turn || fast || pass || range;
          return [range, fast, pass, turn].filter(Boolean).join(' ');
        },
        describeRow: (r) => {
          const p = r.payload || {};
          const src = `takes ${(p.from / 1000).toFixed(1)}–${(p.to / 1000).toFixed(1)}s of it`;
          const turn = p.back ? 'read from the end' : 'read from the start';
          if (p.of > 1) return [src, `pass ${p.pass} of ${p.of}`, turn];
          if (p.rate !== 1) return [src, `played at ${p.rate}x speed`, turn];
          return [src, 'played once, at normal speed', turn];
        } },
      // WHERE THE SOURCE'S OWN MARKS LAND, in slate: derived, never measured.
      { id: 'from-source', kind: 'mark', label: 'event', height: 44, width: 2,
        as: 'ticks', color: '#6f7d94', terse: true,
        subLabel: ['the same four,', 'inside every part'],
        rows: () => {
          const out = [];
          for (const sp of nest.spans()) {
            const n = sp.iterations || 1;
            for (let i = 0; i < n; i++) {
              const base = nest.iterationAt(sp.id, i);
              if (!Number.isFinite(base)) continue;
              for (const m of itemsOf(sp)) {
                if (m.at < sp.c0 || m.at >= sp.c1) continue;
                out.push({ at: base + (m.at - sp.c0) / (sp.rate || 1),
                           id: `${sp.id}#${i}:${m.id}`, kind: 'mark',
                           payload: { srcAt: srcOf(sp, m.at), back: isBack(sp) } });
              }
            }
          }
          return out;
        },
        colorOfRow: () => '#6f7d94',
        describeRow: (r) => [
          `${((r.payload?.srcAt ?? 0) / 1000).toFixed(1)}s into the recording`,
          r.payload?.back ? 'this pass reads from the end' : 'this pass reads from the start',
        ] },
    ],
  });
  // The bar and the strip are one surface; the way button sits under them.
  // See lessons/page-time.md#time-30
  const pair = createGlue(bar.el, view.surface);
  const row = el('div', 'time-row');
  row.append(wayPick.el);
  panel.add(pair, row);
  view.strip.fit();

  const loopPasses = () => loopIds.reduce((t, id) => t + (nest.span(id)?.iterations || 1), 0);

  // The part lane's gutter: how many placements, and the wraps once there are
  // any. Two lines, no glue between them.
  setInterval(() => {
    const L = view.strip.lanes().find((l) => l.id === 'deck-span');
    if (!L) return;
    L.subLabel = [`${nest.spans().length} of them,`,
                  wraps ? `1 recording, ${wraps} wrap${wraps === 1 ? '' : 's'}` : '1 recording'];
    view.strip.invalidate();
  }, 200);

  /** The asserts the old page ran on its first drift row. */
  function checkArrangement(A) {
    const spans = nest.spans();
    A('three placements of one recording',
      spans.length - loopIds.length + 1 === 3, spans.map((sp) => sp.id).join(','));
    A('the loop is 2 passes', loopPasses() === 2,
      `${loopPasses()} over ${loopIds.length} quotation${loopIds.length === 1 ? '' : 's'}`);
    const k = nestedDrift(parent)?.kinds?.mark;
    A('nest reports drift as rows, not as a scalar', !!k && Number.isFinite(k.p50), JSON.stringify(k));
    A('the loop boundary is committed, not polled', nest.boundary() === 'lookahead', nest.boundary());
    const quoted = nest.quotationsOf(child).length + nest.quotationsOf(rewound).length;
    A('quotations round-trip out of the nest', quoted === spans.length, `${quoted} of ${spans.length}`);
    const fast = spans.find((sp) => sp.id === 'fast');
    A('the fast use really runs at 2x', fast && fast.rateReport?.chose === 2,
      JSON.stringify(fast && fast.rateReport));
    // Only where a wrap is the mechanism; pingpong's joint is not a wrap.
    const oneQuotation = loopIds.length === 1;
    const firstWrap = oneQuotation ? nest.iterationAt?.('loop', 1) : null;
    const reached = Number.isFinite(firstWrap) && parent.position() >= firstWrap;
    A('wraps observed once past the first boundary',
      !oneQuotation || wraps > 0 || !reached,
      `${wraps} wraps, pos ${Math.round(parent.position())}, first boundary ${firstWrap}`);
  }

  /** Every direction, graded off the nest's own inverse map and with no
   *  playback, so "not reached yet" cannot pass it. */
  function loopEvents() {
    const out = [];
    for (const id of loopIds) {
      const sp = nest.span(id);
      if (!sp) continue;
      const n = sp.iterations || 1;
      for (let i = 0; i < n; i++) {
        for (const m of itemsOf(sp)) {
          const at = nest.parentPos(id, m.at, i);
          // Where in the recording, by the event's identity (`payload.i`), not by
          // `srcOf`, which runs a mirrored pass back through `mirror()` and so cannot
          // tell a copy that was never mirrored.
          // See lessons/page-time.md#time-31
          if (Number.isFinite(at)) out.push({ at, src: childItems[m.payload.i].at, pass: `${id}#${i}` });
        }
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }
  const falls = (a) => a.length > 1 && a.every((v, i) => i === 0 || v < a[i - 1]);
  const rises = (a) => a.length > 1 && a.every((v, i) => i === 0 || v > a[i - 1]);
  function checkWay(A, w) {
    buildNest(w);
    const rows = loopEvents();
    const byPass = new Map();
    for (const r of rows) { if (!byPass.has(r.pass)) byPass.set(r.pass, []); byPass.get(r.pass).push(r.src); }
    const passes = [...byPass.values()];
    const want = w === 'round' ? [false, false] : w === 'back' ? [true, true] : [false, true];
    const ok = passes.length === want.length
      && rows.length === childItems.length * want.length
      && passes.every((pp, i) => pp.length === childItems.length && (want[i] ? falls(pp) : rises(pp)));
    A(`${w}: every pass reads the recording ${WAY_WORD[w]}`, ok,
      `${rows.length} events over ${passes.length} passes, `
      + passes.map((pp) => pp.map((v) => (v / 1000).toFixed(1)).join(' ')).join(' then '));
  }

  log(`${PARENT / 1000}s long, one ${CHILD / 1000}s recording of ${childItems.length} marks, used three ways`);

  /**
   * A parent deck, a nest quoting one child three times, and a mirrored deck for
   * backwards passes, since no quotation runs a child at a negative rate. The
   * Worker committing the wrap is in the nest's note, keeping the chain one line.
   * See lessons/page-time.md#time-32
   */
  const how = tabDiagram(panel, () => ({
    caption: 'One recording, placed three times. Every placement quotes the same deck and none '
      + 'of them copies its marks.',
    nodes: [
      // `join: false`: two neighbours with no declared link between them do
      // not feed each other here, and an undeclared gap would draw an arrow.
      { id: 'br', label: 'Browser', sub: 'phone or laptop', kind: 'here', tech: 'browser', join: false,
        children: [
          { id: 'parent', label: 'parent deck', sub: `${PARENT / 1000}s, ${parent.items.length} marks`, tech: 'browser',
            note: 'The timeline the bar plays. Its scheduler fires its own marks, and the '
                + '**nest** hangs every placement off its position.' },
          { id: 'nest', label: 'nest', sub: 'createNest', tech: 'browser',
            note: '**createNest** maps the parent\'s position into each placement, by modulo where '
                + 'it loops. The turn round is a one-shot **setTimeout** in a **Web Worker**, armed '
                + 'for the exact instant like any event.' },
          { id: 'rec', label: 'recording', sub: `${CHILD / 1000}s, ${childItems.length} marks`, tech: 'sound',
            note: `One child deck with marks at ${SRC_AT.map((t) => t / 1000).join(', ')} s, uneven on `
                + 'purpose so a backwards pass cannot look like a forwards one.' },
          { id: 'mirror', label: 'mirrored copy', sub: 'backwards', tech: 'sound',
            note: 'A second deck holding the same four marks in reverse order. A backwards loop, '
                + 'and the second half of there and back, quote this one.' },
        ] },
    ],
    links: [
      { from: 'parent', to: 'nest',
        note: 'The parent\'s position, read on every tick, is the only clock a placement has.' },
      { from: 'nest', to: 'rec',
        note: 'Plain at 1 s, at 2x from 4 s, and looped from 6 s: each a **quotation** of a few '
            + 'numbers, a start, an in and out point, a speed and a repeat.' },
      { from: 'nest', to: 'mirror',
        note: 'Quoted only when the loop plays backwards, or there and back.' },
    ],
  }));

  return {
    deck: parent, bar,
    // Two frames on: a strip fitted before its panel lays out fits its range into
    // the width it had then (20 s in about 160 px at 1280).
    // See lessons/page-time.md#time-33
    show() {
      how.draw();
      requestAnimationFrame(() => requestAnimationFrame(() => { view.strip.fit(); view.strip.invalidate(); }));
    },
    hide() { if (parent.playing()) parent.pause(); },
    bars: [{ name: 'loops', bar: transport, strip: view.el }],
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
      for (const w of WAYS) checkWay(A, w);
      buildNest(way());
      // The press the harness used to make, made here and graded: the face,
      // the name and the arrangement all move to the next direction together.
      const was = way();
      const back = wayPick.buttons[WAYS.indexOf('back')];
      back.click();
      const loopSpan = nest.span('loop');
      const lit = wayPick.buttons.filter((b) => b.getAttribute('aria-pressed') === 'true');
      A('pressing backwards turns the loop round, the lit word and the arrangement together',
        was === 'round' && way() === 'back' && isBack(loopSpan)
          && lit.length === 1 && lit[0] === back && back.textContent === WAY_WORD.back,
        `${was} -> ${way()}, the loop quotes the ${isBack(loopSpan) ? 'mirrored' : 'forward'} copy, lit ${lit.map((b) => b.textContent).join(',') || 'nothing'}`);
      // Read while the loop is backwards, so the mirrored copy is in use.
      how.check(A, [
        ['parent deck', parent.items.length === 8 && parent.range[1] === PARENT,
          `${parent.items.length} marks over ${parent.range[1]} ms`],
        ['nest', nest.spans().length === 3 && nest.boundary() === 'lookahead',
          `${nest.spans().length} placements, wrap ${nest.boundary()}`],
        ['recording', nest.quotationsOf(child).length === 2 && child.range[1] === CHILD,
          `quoted ${nest.quotationsOf(child).length} times`],
        ['mirrored copy', nest.quotationsOf(rewound).length === 1
          && rewoundItems.map((m) => m.payload.i).join() === '3,2,1,0',
          `quoted ${nest.quotationsOf(rewound).length} time, marks ${rewoundItems.map((m) => m.payload.i).join(' ')}`],
      ]);
    },
  };
}
