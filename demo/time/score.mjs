// SCORE tab: one file format for scores written in different languages; the
// sounding line lights up. The five scores are a choice in this tab, and the
// check asserts the score block holds its twelve lines through all five.
// See lessons/page-time.md#time-4

import { el } from '/shell/shell.mjs';
import { createChoice } from '/shell/choice.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createGlue } from '/shell/glue.mjs';
import { createDeck, workerTickHost } from '/timeline/transport.mjs';
import {
  scoreDoc, quotation, refDeck, partItems, partRangeMs, loadScoreDoc,
  scoreDocToJSON, parseScoreDoc, scoreDocToJSONL, parseScoreDocJSONL,
} from '/timeline/score.mjs';
import { csoundPart, tempoMap } from '/timeline/csound.mjs';
import { tabDiagram } from './how.mjs';

// ── five documents, each adding exactly one idea to the one before ───────
const cs = (lines) => csoundPart(lines.join('\n'));
const tempoOf = (cp) => (cp.tempo.length ? cp.tempo : [[0, 60]]);

const SCORES = [
  {
    id: 'one', label: 'one note',
    note: 'The least a score can be: one instruction, played once. No tempo, so a beat is a second.',
    build() {
      const cp = cs(['i 1 0 1 8000 440']);
      return scoreDoc({ id: 'one-note', tempo: tempoOf(cp),
        parts: { tune: cp.part },
        uses: [quotation({ id: 'u1', ref: 'tune', at: 0, in: 0, out: 1 })] });
    },
  },
  {
    id: 'bar', label: 'bar',
    note: 'Four instructions and a tempo. At 120 the beats are half-seconds, so the same numbers mean different times.',
    build() {
      const cp = cs(['t 0 120',
        'i 1 0 0.5 8000 440', 'i 1 1 0.5 8000 550',
        'i 1 2 0.5 8000 660', 'i 1 3 0.5 8000 880']);
      return scoreDoc({ id: 'a-bar', tempo: tempoOf(cp),
        parts: { tune: cp.part },
        uses: [quotation({ id: 'u1', ref: 'tune', at: 0, in: 0, out: 4 })] });
    },
  },
  {
    id: 'ramp', label: 'tempo ramp',
    note: 'The tempo falls from 120 to 60 across eight beats. The beats are evenly numbered and the gaps get longer. That is why a score is compiled, not read.',
    build() {
      const cp = cs(['t 0 120 8 60',
        ...Array.from({ length: 8 }, (_, i) => `i 1 ${i} 0.4 8000 ${440 + i * 55}`)]);
      return scoreDoc({ id: 'tempo-ramp', tempo: tempoOf(cp),
        parts: { tune: cp.part },
        uses: [quotation({ id: 'u1', ref: 'tune', at: 0, in: 0, out: 8 })] });
    },
  },
  {
    id: 'loop', label: 'loop',
    note: 'One part, used twice: the second time it says "twice". Both passes light the SAME line below, because there is only one.',
    build() {
      const cp = cs(['t 0 120',
        'i 1 0 0.5 8000 440', 'i 1 0.5 0.5 8000 550',
        'i 1 1 0.5 8000 660', 'i 1 1.5 0.5 8000 550']);
      return scoreDoc({ id: 'a-loop', tempo: tempoOf(cp),
        parts: { tune: cp.part },
        uses: [
          quotation({ id: 'u1', ref: 'tune', at: 0, in: 0, out: 2 }),
          quotation({ id: 'u2', ref: 'tune', at: 3, in: 0, out: 2, repeat: 2 }),
        ] });
    },
  },
  {
    id: 'two', label: 'two languages',
    note: 'A Csound part and a MIDI part in one document. The Csound rows keep their p-fields, the MIDI rows keep channel and velocity, and neither is translated into the other.',
    build() {
      const cp = cs(['t 0 120',
        'i 1 0   1   8000 440', 'i 1 1   0.5 8000 550', 'i 1 1.5 0.5 8000 660',
        'f 1 0 8192 10 1        ; an f-table carries no timeline row']);
      // The MIDI part is DATA: its rows land on the timeline and do not sound.
      const midi = { lang: 'midi', rows: [
        { id: 'm1', at: 0,   dur: 0.25, kind: 'note', payload: { ch: 0, note: 60, vel: 100 } },
        { id: 'm2', at: 0.5, dur: 0.25, kind: 'note', payload: { ch: 0, note: 64, vel: 88 } },
        { id: 'm3', at: 1,   dur: 0.25, kind: 'note', payload: { ch: 0, note: 67, vel: 96 } },
      ] };
      return scoreDoc({ id: 'two-languages', tempo: tempoOf(cp),
        parts: { verse: cp.part, pulse: midi },
        uses: [
          quotation({ id: 'u1', ref: 'verse', at: 0, in: 0, out: 2 }),
          quotation({ id: 'u2', ref: 'verse', at: 3, in: 0, out: 2, repeat: 2 }),
          quotation({ id: 'u3', ref: 'pulse', at: 7, in: 0, out: 1.5 }),
        ] });
    },
  },
];

// One hue per part, used in three places so no legend is needed; LIGHTNESS
// carries whether a thing has played, hue never does.
const INK = [
  { on: '#ffd400', off: '#6b5a12' },
  { on: '#7fb8e0', off: '#37526a' },
  { on: '#c9a0ff', off: '#584a72' },
];
const DERIVED = '#6f7d94';            // slate: shown, never measured
const SCORE_LINES = 12;               // the block never changes height

/** bpm at a beat, interpolated linearly IN BEAT exactly as Csound does */
function bpmAtBeat(points, beat) {
  if (!points.length) return 60;
  for (let i = 0; i < points.length; i++) {
    const [b0, m0] = points[i], next = points[i + 1];
    if (!next) return m0;
    if (beat <= next[0]) {
      const span = next[0] - b0;
      return span <= 0 ? m0 : m0 + ((next[1] - m0) * (beat - b0)) / span;
    }
  }
  return points[points.length - 1][1];
}
const tempoVaries = (points) => points.length > 1
  && points.some(([, m]) => Math.abs(m - points[0][1]) > 1e-9);

// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = 'Five small scores in one file format, where each line below is one instruction and lights up while it sounds. Pick a score and press play.';

export const readout = null;

export function build({ panel, log }) {
  const DOCS = SCORES.map((s) => s.build());

  // One parent and one boundary host outlive a score change; only the
  // children, the nest and the drawing are rebuilt.
  const parent = createDeck({ items: [], adapters: {}, range: [0, 1000] });
  const boundaryHost = workerTickHost();

  let doc = null, decks = {}, nest = null, inkOf = {};
  let lineEls = [], lineOfRow = new Map(), lineOfUse = new Map();
  const plays = new Map();              // `${part}#${rowId}` -> times fired

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
  const pre = el('pre', 'sc');

  const partOfSpan = (sp) => {
    for (const [name, deck] of Object.entries(decks)) if (deck === sp.deck) return name;
    return '?';
  };

  const view = createStripView(host, parent, {
    size: 'auto', follow: false, gutter: 150,
    lanes: [
      { id: 'deck-span', kind: 'deck-span', label: 'part', height: 52, barPad: 8,
        as: 'spans', stack: false, barGap: 3, terse: true,
        rows: () => {
          if (!nest) return [];
          const out = [];
          for (const sp of nest.spans()) {
            const n = sp.iterations || 1;
            for (let i = 0; i < n; i++) {
              const from = nest.iterationAt(sp.id, i);
              const to = nest.iterationAt(sp.id, i + 1);
              const end = Number.isFinite(to) ? to : from + (sp.onePassMs ?? (sp.c1 - sp.c0));
              if (!Number.isFinite(from) || !(end > from)) continue;
              out.push({ at: from, id: `${sp.id}#${i + 1}`, kind: 'deck-span',
                         payload: { durMs: end - from, pass: i + 1, of: n, use: sp.id,
                                    part: partOfSpan(sp) } });
            }
          }
          return out;
        },
        colorOf: (s) => (inkOf[s.row?.payload?.part] || INK[0]).on,
        labelOf: (s, { bw } = {}) => {
          const p = s.row?.payload || {};
          const pass = p.of > 1 ? `${p.pass}/${p.of}` : '';
          if (bw && bw < 84) return pass || String(p.part);
          return [p.part, pass].filter(Boolean).join(' ');
        },
        describeRow: (r) => {
          const p = r.payload || {};
          const where = lineOfUse.get(p.use);
          return p.of > 1
            ? [`${p.part}, pass ${p.pass} of ${p.of}`, `every pass is line ${where}`]
            : [`${p.part}, played once`, `line ${where}`];
        } },
      { id: 'rows', kind: 'note', label: 'event', height: 46, width: 2, as: 'ticks',
        color: '#3b424e', terse: true,
        rows: () => {
          if (!nest || !doc) return [];
          const out = [];
          for (const sp of nest.spans()) {
            const part = partOfSpan(sp);
            const items = partItems(doc, part, { tempoMap });
            const n = sp.iterations || 1;
            for (let i = 0; i < n; i++) {
              const base = nest.iterationAt(sp.id, i);
              if (!Number.isFinite(base)) continue;
              for (const it of items) {
                if (it.at < sp.c0 || it.at >= sp.c1) continue;
                out.push({ at: base + (it.at - sp.c0) / (sp.rate || 1),
                           id: `${sp.id}#${i}:${it.id}`, kind: 'note',
                           payload: { part, row: it.payload.row } });
              }
            }
          }
          return out;
        },
        colorOfRow: (r) => {
          const p = r.payload || {};
          const ink = inkOf[p.part] || INK[0];
          return plays.get(`${p.part}#${p.row}`) ? ink.on : ink.off;
        },
        describeRow: (r) => {
          const p = r.payload || {};
          const line = lineOfRow.get(`${p.part}#${p.row}`);
          const n = plays.get(`${p.part}#${p.row}`) || 0;
          return [`line ${line}, ${p.part}`, n ? `played ${n}x` : 'not played yet'];
        } },
      // THE TEMPO, DERIVED, so slate; REMOVED rather than flattened when it
      // does not vary, because a flat line is a constant dressed as a reading.
      { id: 'tempo', kind: 'note', label: 'tempo', height: 44, as: 'continuous',
        color: DERIVED, terse: true, dots: false, show: false,
        value: (p) => p.bpm,
        rows: () => {
          if (!doc) return [];
          const pts = doc.tempo;
          if (!tempoVaries(pts)) return [];
          const tm = tempoMap(pts);
          const [lo, hi] = parent.range;
          const out = [];
          for (let i = 0; i <= 120; i++) {
            const ms = lo + ((hi - lo) * i) / 120;
            out.push({ at: ms, id: `t${i}`, kind: 'note',
                       payload: { bpm: bpmAtBeat(pts, tm.beatAtMs(ms)) } });
          }
          return out;
        },
        describeRow: (r) => [`${Math.round(r.payload?.bpm ?? 0)} bpm`, 'read off the score'] },
    ],
  });
  // The bar and the strip are one surface, and the score goes under them.
  // See lessons/page-time.md#time-5
  const pair = createGlue(bar.el, view.surface);

  // ── highlighting, driven by the deck and never by a timer ───────────────
  // Each channel owns its own lines: `onPresence` holds a use line for its
  // whole span, an event line fades on its own timer.
  const fading = new Map();
  const setState = (i, state) => { const l = lineEls[i]; if (l) l.dataset.state = state; };
  function lightEvent(key) {
    const i = lineOfRow.get(key);
    if (i === undefined) return;
    setState(i, 'now');
    clearTimeout(fading.get(i));
    fading.set(i, setTimeout(() => { setState(i, 'played'); fading.delete(i); }, 450));
  }
  function partAdapter(part) {
    return {
      caps: { rates: [0.25, 0.5, 1, 2], continuous: false, assertOnSeek: true },
      actuate(payload) {
        const key = `${part}#${payload.row}`;
        plays.set(key, (plays.get(key) || 0) + 1);
        lightEvent(key);
        view.strip.invalidate();
      },
      reduce(rows) { return { count: rows.length }; },
      assertState(state) { return state; },
    };
  }

  function teardown() {
    if (nest) { nest.dispose(); nest = null; }
    for (const deck of Object.values(decks)) deck.dispose();
    decks = {};
    for (const t of fading.values()) clearTimeout(t);
    fading.clear();
    plays.clear();
  }

  function load(index) {
    parent.pause();
    teardown();
    doc = DOCS[index];
    inkOf = {};
    Object.keys(doc.parts).forEach((name, i) => { inkOf[name] = INK[i % INK.length]; });

    const lines = scoreDocToJSONL(doc).split('\n');
    lineOfRow = new Map();
    lineOfUse = new Map();
    pre.replaceChildren();
    lineEls = lines.map((text, i) => {
      const rec = JSON.parse(text);
      const row = el('span', 'sc-l');
      const part = rec.t === 'row' ? rec.part : rec.t === 'part' ? rec.part : rec.t === 'use' ? rec.ref : null;
      if (part && inkOf[part]) row.style.borderLeftColor = inkOf[part].on;
      if (rec.t === 'row') lineOfRow.set(`${rec.part}#${rec.id}`, i);
      else if (rec.t === 'use' && rec.id) lineOfUse.set(rec.id, i);
      row.append(el('span', 'sc-n', String(i).padStart(2, ' ') + '  '), document.createTextNode(text));
      pre.append(row);
      return row;
    });
    // A FIXED TWELVE LINES, padded, so picking a score never moves the strip.
    for (let i = lines.length; i < SCORE_LINES; i++) pre.append(el('span', 'sc-l sc-pad', ' '));

    for (const name of Object.keys(doc.parts)) {
      const deck = createDeck({
        items: partItems(doc, name, { tempoMap }),
        adapters: { note: partAdapter(name) },
        range: partRangeMs(doc, name, { tempoMap }),
      });
      refDeck(deck, name);
      decks[name] = deck;
    }
    const tm = tempoMap(doc.tempo);
    const endBeat = Math.max(...doc.uses.map((u) => Number(u.at) + (Number(u.out) - Number(u.in)) * (u.repeat || 1)));
    parent.setRange([0, Math.ceil(tm.msAt(endBeat) + 400)]);

    nest = loadScoreDoc(doc, (name) => decks[name], { parent, tempoMap, tickHost: boundaryHost }).nest;
    nest.onPresence(({ span, present, parentPos }) => {
      const line = lineOfUse.get(span);
      if (line !== undefined) setState(line, present ? 'now' : 'played');
      log(`${span} ${present ? 'starts' : 'ends'} at ${(parentPos / 1000).toFixed(2)}s`, present ? 'hi' : 'info');
    });

    const rowCount = Object.values(doc.parts).reduce((n, p) => n + p.rows.length, 0);
    const lane = (id) => view.strip.lanes().find((l) => l.id === id);
    const nParts = Object.keys(doc.parts).length;
    if (lane('deck-span')) lane('deck-span').subLabel = [
      `${doc.uses.length} of them, ${nParts} source${nParts === 1 ? '' : 's'}`,
      doc.uses.some((u) => u.repeat) ? 'one of them repeats' : 'none repeat'];
    if (lane('rows')) lane('rows').subLabel = [`${rowCount} in the document,`, 'each one a line below'];
    const varies = tempoVaries(doc.tempo);
    const tl = lane('tempo');
    if (tl) {
      tl.show = varies;
      tl.subLabel = varies
        ? [`${Math.round(doc.tempo[0][1])} → ${Math.round(doc.tempo[doc.tempo.length - 1][1])} bpm`, 'drawn from the score']
        : null;
    }
    view.strip.fit();
    view.strip.invalidate();
    log(SCORES[index].note, 'hi');
  }

  const pick = createChoice({
    label: 'score',
    options: SCORES.map((s, i) => [s.label, i]),
    at: 0,
    onPick: (i) => load(i),
  });
  panel.add(pick.el, pair, pre);
  load(0);

  /**
   * How it works: Csound text and a MIDI part compiled into one document's rows,
   * loaded into one deck per part, whose `actuate()` lights the document's lines.
   * See lessons/page-time.md#time-6
   */
  const how = tabDiagram(panel, () => ({
    caption: 'A score is compiled once into one document, and the document is what plays.',
    nodes: [
      // `join: false`: two neighbours with no declared link between them do
      // not feed each other here, and an undeclared gap would draw an arrow.
      { id: 'br', label: 'Browser', sub: 'phone or laptop', kind: 'here', tech: 'browser', join: false,
        children: [
          { id: 'cs', label: 'Csound text', sub: 'i and t lines', tech: 'sound',
            note: 'Every score starts as **Csound** score lines, **i** for a note in beats and **t** '
                + 'for the tempo. Csound itself never runs here.' },
          { id: 'comp', label: 'compiler', sub: 'csoundPart', tech: 'browser',
            note: 'Turns each line into a row that keeps its p-fields as written. A line with no '
                + 'place on a timeline, such as an **f** table, becomes a warning in the document.' },
          { id: 'midi', label: 'MIDI rows', sub: 'ch, note, vel', tech: 'device',
            note: 'The two languages score adds a MIDI part as plain rows. Nothing in this tab '
                + 'makes a sound, Csound or MIDI: every row only lights its line.' },
          { id: 'doc', label: 'document', sub: 'JSONL', tech: 'browser',
            note: '**scoreDoc** holds each part in its own language and the uses that place a part '
                + 'at a beat, with a repeat. It is printed below one record per line and '
                + 'round-trips byte for byte.' },
          { id: 'nest', label: 'nest', sub: '1 deck per part', tech: 'browser',
            note: '**loadScoreDoc** turns beats into milliseconds with **tempoMap**, which '
                + 'interpolates seconds per beat the way Csound does. Each part gets its own deck '
                + 'under one **createNest**.' },
          { id: 'lines', label: 'score lines', sub: `${SCORE_LINES} lines`, tech: 'graphics',
            note: 'A row\'s **actuate()** lights its own line as it plays, and a use line stays '
                + 'lit for as long as its part is sounding.' },
        ] },
    ],
    links: [
      { from: 'cs', to: 'comp', note: 'Plain text, the same lines Csound would read.' },
      { from: 'comp', to: 'doc', note: 'Rows in beats with their p-fields untouched, and the tempo points.' },
      { from: 'midi', to: 'doc', note: 'Rows of channel, note and velocity, kept as they are.' },
      { from: 'doc', to: 'nest',
        note: 'Parts and uses, all in beats. Only here does anything become milliseconds.' },
      { from: 'nest', to: 'lines', note: 'Which row just fired, and which use is sounding.' },
    ],
  }));

  return {
    deck: parent, bar,
    // Two frames on: a strip fitted before its panel lays out fits its range into
    // the width it had then (20 s in about 160 px at 1280).
    // See lessons/page-time.md#time-7
    show() {
      how.draw();
      requestAnimationFrame(() => requestAnimationFrame(() => { view.strip.fit(); view.strip.invalidate(); }));
    },
    hide() { if (parent.playing()) parent.pause(); },
    bars: [{ name: 'score', bar: transport, strip: view.el }],
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

      // Over every document, about the MECHANISM, decidable without playback.
      const canon = DOCS.map(scoreDocToJSON);
      A('every document round-trips byte-identically',
        DOCS.every((_, i) => scoreDocToJSON(parseScoreDoc(JSON.parse(canon[i]))) === canon[i]),
        `${DOCS.length} documents, ${canon.reduce((n, c) => n + c.length, 0)} bytes`);
      A('every JSONL view round-trips to the same document',
        DOCS.every((doc0, i) => scoreDocToJSON(parseScoreDocJSONL(scoreDocToJSONL(doc0))) === canon[i]),
        `${DOCS.reduce((n, x) => n + scoreDocToJSONL(x).split('\n').length, 0)} lines`);
      const loopDoc = DOCS[3];
      const loopUses = scoreDocToJSONL(loopDoc).split('\n').filter((l) => JSON.parse(l).t === 'use');
      A('the loop is ONE line saying twice, not two lines',
        loopUses.length === loopDoc.uses.length
          && loopDoc.uses.filter((u) => u.repeat).length === 1
          && loopDoc.uses.find((u) => u.repeat).repeat === 2,
        `${loopUses.length} use lines for ${loopDoc.uses.length} uses`);
      A('the repeat was never expanded into rows',
        loopDoc.parts.tune.rows.length === 4, `${loopDoc.parts.tune.rows.length} rows`);
      const two = DOCS[4];
      const vp = two.parts.verse.rows[0].payload, mp = two.parts.pulse.rows[0].payload;
      A('two languages, neither translated into the other',
        two.parts.verse.lang === 'csound' && two.parts.pulse.lang === 'midi'
          && Array.isArray(vp.p) && Number.isFinite(mp.vel)
          && vp.vel === undefined && mp.p === undefined,
        `csound keeps p[${vp.p.length}], midi keeps vel=${mp.vel}`);
      A('the compiler\'s warnings survive into the document',
        Array.isArray(two.parts.verse.warnings) && two.parts.verse.warnings.length === 1,
        two.parts.verse.warnings[0]);
      // THE RAMP, measured against csound 6.18: Csound interpolates SECONDS PER
      // BEAT linearly in beat, so beat 8 is the trapezoid, 6.000 s. Averaging
      // the tempo says 5.333 s and interpolating the tempo says 5.545 s.
      const rampMs = tempoMap(DOCS[2].tempo).msAt(8);
      A('the tempo ramp matches Csound, not an average and not a log',
        Math.abs(rampMs - 6000) < 1,
        `beat 8 at ${rampMs.toFixed(2)} ms (mean-tempo 5333, linear-in-tempo 5545)`);
      A('every use in every score resolves to a part it names',
        DOCS.every((doc0) => doc0.uses.every((u) => !!doc0.parts[u.ref])),
        `${DOCS.reduce((n, x) => n + x.uses.length, 0)} uses`);

      // The five presses the harness used to make blind, made and graded: the
      // score block is the same height whichever score is up.
      const heights = [];
      for (let i = 0; i < SCORES.length; i++) {
        pick.set(i);
        heights.push(pre.getBoundingClientRect().height);
      }
      pick.set(0);
      const lines = pre.querySelectorAll('.sc-l').length;
      A('picking each of the five scores leaves the score block the same height',
        heights.length === 5 && heights.every((h) => h > 0 && Math.abs(h - heights[0]) < 0.5) && lines === SCORE_LINES,
        `${heights.map((h) => h.toFixed(1)).join(', ')} px, ${lines} lines on score 1`);
      // Read on score 1, which `pick.set(0)` just put back.
      const shownLines = pre.querySelectorAll('.sc-l:not(.sc-pad)').length;
      how.check(A, [
        ['Csound text', DOCS.every((x) => Object.values(x.parts).some((q) => q.lang === 'csound')),
          `in all ${DOCS.length} scores`],
        ['compiler', two.parts.verse.warnings.length === 1, `${two.parts.verse.warnings.length} warning kept`],
        ['MIDI rows', two.parts.pulse.lang === 'midi' && two.parts.pulse.rows.length === 3,
          `${two.parts.pulse.rows.length} rows in score 5`],
        ['document', shownLines === scoreDocToJSONL(doc).split('\n').length, `${shownLines} records printed`],
        ['nest', !!nest && nest.spans().length === doc.uses.length
          && Object.keys(decks).length === Object.keys(doc.parts).length,
          `${nest ? nest.spans().length : 0} uses over ${Object.keys(decks).length} deck`],
        ['score lines', panel.el.contains(pre) && pre.querySelectorAll('.sc-l').length === SCORE_LINES,
          `${pre.querySelectorAll('.sc-l').length} lines`],
      ]);
    },
  };
}
