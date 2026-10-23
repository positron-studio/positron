// The CLICK tab of /csound/: two vClick scores (tarmoj/vclick, GPL-3.0, (c) Tarmo
// Johannes) copied verbatim and embedded, so the tab makes no request of any kind.
// Its bar is not published (SCORE owns the transport); `hide()` pauses the deck.
// See lessons/page-csound.md#csound-1

import { el } from '/shell/shell.mjs';
import { createChoice } from '/shell/choice.mjs';
import { createStepper } from '/shell/stepper.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { scoreDoc, quotation, scoreDocToJSONL, parseScoreDocJSONL } from '/timeline/score.mjs';
import { csoundPart, tempoMap } from '/timeline/csound.mjs';
import { createDiagram } from '/shell/diagram.mjs';

const SCORES = {
  'test.sco': `; vClick score - for test and demo
#define TUTTI #0#
#define TEMPO1 #80#
#define TEMPO2 #52#
#define BEGIN #9#
#define REPTEMPO #$TEMPO1#

t 0 $TEMPO1
i 1 0 0 $TEMPO1 0
i "countdown" 0 4 4 $TUTTI
i "notification" 3 1 "READY"
s

;ADVANCE
t 0 $TEMPO1 4 $TEMPO1 12 $TEMPO2
i1 4 8 $TEMPO1 $TEMPO2 8
i1 12 0 $TEMPO2 0

i	2	0	4	4	4	0	1	$TUTTI
i	2	4	4	4	4	0	2	$TUTTI
i	2	8	4	4	4	0	3	$TUTTI
i	2	12	4	4	4	0	4	$TUTTI

i	2	18	1	1	4	0	5	$TUTTI
i	2	19	1.5	1	[8/3]	0	-5.2	$TUTTI
i	2	20.5	1	1	4	0	-5.3	$TUTTI

i	2	21.5	0.5	1	[16/3]	0	6	$TUTTI
i	2	22	0.75	1	4	0	-6.2	$TUTTI
i	2	22.75	0.5	1	4	0	7	$TUTTI
i	2	23.25	0.75	1	[16/3]	0	-7.2	$TUTTI

i	2	24	0.75	[16/3]	4	0	8	$TUTTI
i	2	24.75	0.5	1	4	0	-8.2	$TUTTI

i	2	25.25	0.75	[16/3]	4	0	9	$TUTTI
i	2	26	0.5	1	4	0	-9.2	$TUTTI

i	"notification"	0	2	"Go!"
i	"notification"	4	8	"Ritenuto"
i	"notification"	16	2	"Complex"
i	"notification"	18	3	"2+3+2/8"
i	"notification"	21.5	3	"5/16"
`,
  'simple-4-4.sco': `; vClick score template							
							
;count-down 								
								
								
#define TUTTI  #0#								
#define TEMPO1 #60#								
#define REPTEMPO #$TEMPO1# ; REPTEMPO for setting tempo for countdown (if starts from section in another tempo)								
#define BEGIN #5#								
								
								
t 0 $REPTEMPO								
i 1 0 0 $REPTEMPO 0								
i "countdown" 0 4 4 $TUTTI			; four click in four beats					
i "notification" 3 0.9 "READY"			; notification					
f 0 4 	; workaround – not to leave early – FIX IT							
s								
								
								
t	0	$TEMPO1						
								
i 	1	0	0	$TEMPO1	0	0	; set the tempo	
								
								
								
								
								
;ADVANCE		; do not change by hand!						
; a 0 0.01 < beats>								

							
; times bar by bar								
;i	instrnr	start	duration	number of beats	part of the whole note	subdivision	bar number	instruments
i	2	0	4	4	4	0	1	$TUTTI
i	2	4	4	4	4	0	2	$TUTTI
i	2	8	4	4	4	0	3	$TUTTI
i	2	12	4	4	4	0	4	$TUTTI
i	2	16	4	4	4	0	5	$TUTTI
i	2	20	4	4	4	0	6	$TUTTI
i	2	24	4	4	4	0	7	$TUTTI
i	2	28	4	4	4	0	8	$TUTTI
i	2	32	4	4	4	0	9	$TUTTI
i	2	36	4	4	4	0	10	$TUTTI
i	2	40	4	4	4	0	11	$TUTTI
i	2	44	4	4	4	0	12	$TUTTI
i	2	48	4	4	4	0	13	
i	2	52	4	4	4	0	14	
i	2	56	4	4	4	0	15	
i	2	60	4	4	4	0	16	
i	2	64	4	4	4	0	17	
i	2	68	4	4	4	0	18	
i	2	72	4	4	4	0	19	
i	2	76	4	4	4	0	20	
i	2	80	4	4	4	0	21	
i	2	84	4	4	4	0	22	
i	2	88	4	4	4	0	23	
i	2	92	4	4	4	0	24	
i	2	96	4	4	4	0	25	
i	2	100	4	4	4	0	26	
i	2	104	4	4	4	0	27	
i	2	108	4	4	4	0	28	
i	2	112	4	4	4	0	29	
i	2	116	4	4	4	0	30	
i	2	120	4	4	4	0	31	
i	2	124	4	4	4	0	32	
i	2	128	4	4	4	0	33	
i	2	132	4	4	4	0	34	
i	2	136	4	4	4	0	35	
i	2	140	4	4	4	0	36	
i	2	144	4	4	4	0	37	
i	2	148	4	4	4	0	38	
i	2	152	4	4	4	0	39	
i	2	156	4	4	4	0	40	
i	2	160	4	4	4	0	41	
i	2	164	4	4	4	0	42	
i	2	168	4	4	4	0	43	
i	2	172	4	4	4	0	44	
i	2	176	4	4	4	0	45	
i	2	180	4	4	4	0	46	
i	2	184	4	4	4	0	47	
i	2	188	4	4	4	0	48	
i	2	192	4	4	4	0	49	
i	2	196	4	4	4	0	50	
								
								
								
; CUES								
								
i	"playfile"	0	999	"test.wav"	0	; t1		
								
								
								
								
; NOTIFICATIONS								
								
i	"notification"	0	2	"Start"				
`,
};

/** Under the tab row, in the page's one fixed box. */
export const about = 'U:\u2019s vClick score worked out once in the page, so every player\u2019s screen could read the bar and the beat off its own clock instead of the hall\u2019s wifi.';

// `bytes` is the score document sent once; `pushed` is what vClick puts on the wifi
// and climbs for the whole piece. `late` is each flash against the score's moment.
// See lessons/page-csound.md#csound-2
export const readout = { bar: '', beat: '', tempo: 'bpm', late: 'ms', pushed: '', bytes: 'B' };

export function build({ panel, log, set }) {
  const host = panel.el;

  // One deck owns the clock, on its default worker tick host: rAF stops in a
  // background tab and bunched the flashes. A locked phone still stops it (no wake lock).
  // See lessons/page-csound.md#csound-3
  const deck = createDeck({ items: [], adapters: {}, range: [0, 1000] });

  // ── compiling, which is all the work there is ────────────────────────────
  let cp = null, tm = null, doc = null;
  let events = [];        // {ms, bar, beat, lamp, bpm} or {ms, text, durMs}
  let wouldSend = 0;      // messages their server would have pushed by now
  let worstLate = 0;
  let scoreName = 'test.sco';
  const warn = el('p', 'warn', '');

  /**
   * A bar statement expands into its own beats, per their `metro_sendosc.orc` instr 2:
   * p4 beats, p5 note value, p6 subdivision, p7 bar; beat k is 4/p5 score-beats on.
   * A negative bar means no red first beat; its fraction is the beat to count from.
   * See lessons/page-csound.md#csound-4
   */
  function barBeats(r) {
    const p = r.payload.p;
    const count = Math.max(1, Math.round(Number(p[3]) || 1));
    const value = Number(p[4]) || 4;
    const barNo = Number(p[6]) || 0;
    const shown = Math.abs(Math.trunc(barNo));
    const frac = Math.abs(barNo % 1);
    const first = frac === 0 ? 1 : Math.round(frac * 10);
    const step = 4 / value;
    const out = [];
    for (let k = 0; k < count; k++) {
      const gb = r.at + k * step;
      out.push({
        ms: tm.msAt(gb),
        bar: shown,
        beat: first + k,
        lamp: (k === 0 && barNo >= 0) ? 0 : 1,
        bpm: bpmAtBeat(gb),
        row: r.id,
      });
    }
    return out;
  }

  function bpmAtBeat(beat) {
    const a = tm.msAt(beat), b = tm.msAt(beat + 0.001);
    return b > a ? 60000 / ((b - a) * 1000) : 0;
  }

  function compileScore() {
    warn.textContent = '';
    let part;
    try { part = csoundPart(SCORES[scoreName]); }
    catch (e) { warn.textContent = `${scoreName} did not compile: ${e.message}`; return; }
    cp = part;
    tm = tempoMap(part.tempo.length ? part.tempo : [[0, 60]]);

    // The Csound rows keep their p-fields verbatim and round-trip byte-identically,
    // so `bytes` is the real size of the document that would cross.
    // See lessons/page-csound.md#csound-5
    const lastBeat = part.part.rows.length
      ? Math.max(...part.part.rows.map((r) => r.at + (r.dur || 0))) : 0;
    doc = scoreDoc({
      id: scoreName.replace(/\W+/g, '-'),
      tempo: part.tempo.length ? part.tempo : [[0, 60]],
      parts: { click: part.part },
      uses: [quotation({ id: 'u1', ref: 'click', at: 0, in: 0, out: lastBeat || 1 })],
    });

    const ev = [];
    for (const r of part.part.rows) {
      const instr = String(r.payload.instr).replace(/"/g, '');
      const atMs = tm.msAt(r.at);
      const durMs = tm.msAt(r.at + (r.dur || 0)) - atMs;
      if (instr === '2') ev.push(...barBeats(r));
      else if (instr === 'countdown') {
        // a count-in: p4 clicks spread over p3, shown as negative numbers, and
        // the last one green rather than blue, their instr 18, exactly
        const clicks = Math.max(1, Math.round(Number(r.payload.p[3]) || 1));
        for (let k = 0; k < clicks; k++) {
          ev.push({ ms: atMs + (durMs * k) / clicks, bar: 0, beat: -(clicks - k),
                    lamp: k === clicks - 1 ? 1 : 2, bpm: bpmAtBeat(r.at), row: r.id });
        }
      } else if (instr === 'notification') {
        ev.push({ ms: atMs, text: String(r.payload.p[3] ?? '').replace(/"/g, ''), durMs, row: r.id });
      }
    }
    ev.sort((a, b) => a.ms - b.ms);
    events = ev;

    // hand the whole piece to the deck, once. This is the argument in one line:
    // everything the piece will ever ask for is scheduled up front, and nothing
    // crosses a network again.
    deck.sched.clear();
    let n = 0;
    for (const e of ev) {
      deck.schedule(e.text !== undefined
        ? { at: e.ms, kind: 'word', id: `w${n++}`, payload: { ...e } }
        : { at: e.ms, kind: 'flash', id: `f${n++}`, payload: { ...e } });
    }
    const end = ev.length ? ev[ev.length - 1].ms + 2000 : 1000;
    deck.setRange([0, Math.max(end, part.durationMs)]);
    view.strip.invalidate();
    drawDoc();

    // UTF-8 bytes, not `String.length` (UTF-16 code units).
    // See lessons/page-csound.md#csound-6
    set('bytes', new TextEncoder().encode(scoreDocToJSONL(doc)).length);
    // Not 0: nothing has played, and a zero would read as a measurement.
    // See lessons/page-csound.md#csound-7
    set('pushed', '');
    set('late', '');
    worstLate = 0; wouldSend = 0;
    if (part.part.warnings.length) warn.textContent = part.part.warnings.join(', ');
    log(`${scoreName}: ${part.part.rows.length} rows, ${ev.length} to show`, 'hi');
    lanesLabel();
  }

  // ── the adapters: what a scheduled thing DOES when its moment comes ───────
  const flashAdapter = {
    caps: { rates: [0.5, 1, 2], continuous: false, assertOnSeek: true },
    actuate(p) {
      set('tempo', Math.round(p.bpm));
      set('bar', p.bar);
      set('beat', p.beat);
      // Lateness against the millisecond the score asks for, not against the previous flash.
      // See lessons/page-csound.md#csound-8
      worstLate = Math.max(worstLate, Math.abs(deck.position() - p.ms));
      set('late', worstLate.toFixed(1));
      // what vClick would have put on the wire to reach one player: the
      // beat/bar pair and the lamp are two separate OSC messages in their
      // `instr send`, and there is one of each per beat, per player.
      wouldSend += 2;
      set('pushed', wouldSend);
      lightRow(p.row);
    },
    reduce: (rows) => ({ count: rows.length }),
    assertState: (s) => s,
  };
  const wordAdapter = {
    caps: { rates: [0.5, 1, 2], continuous: false, assertOnSeek: true },
    actuate(p) { lightRow(p.row); },
    // Count only: the rows a reducer gets are not the scheduled items, so do not read payloads.
    // See lessons/page-csound.md#csound-9
    reduce: (rows) => ({ count: rows.length }),
    assertState: (s) => s,
  };
  deck.sched.registerAdapter('flash', flashAdapter);
  deck.sched.registerAdapter('word', wordAdapter);

  // The operator's half goes first: these pick what you are looking at.
  // See lessons/page-csound.md#csound-10
  const op = el('div', 'op');
  const pick = createChoice({
    label: 'Score',
    options: Object.keys(SCORES).map((k) => [k, k]),
    at: 0,
    onPick: (id) => { scoreName = id; compileScore(); },
  });
  let startBar = 1;
  const barLabel = el('span', '', 'bar 1');
  const stepper = createStepper({
    what: 'the starting bar',
    prev: () => { startBar = Math.max(1, startBar - 1); barLabel.textContent = `bar ${startBar}`; seekBar(); },
    next: () => { startBar = startBar + 1; barLabel.textContent = `bar ${startBar}`; seekBar(); },
  });
  op.append(pick.el, el('label', '', 'Start from'), stepper.el, barLabel);
  host.append(op);

  // The strip below is the one position surface, so the bar has no slider, and it is
  // not published: SCORE's bar is the page's transport.
  // See lessons/page-csound.md#csound-11
  const control = createTransportControl(deck);
  const bar = createBar({
    start: [playToggle(control).el],
    middle: [clockView(control).el, noteView(control).el],
    end: [loopView(control).el, ratesView(control).el],
  });
  host.append(bar.el);
  bindTransportKeys(control, { scope: bar.el });
  const transport = transportApi(control, { el: bar.el });

  const INK = { beat: '#ffd400', word: '#6f7d94' };

  const view = createStripView(host, deck, {
    size: 'auto', follow: true, gutter: 150,
    lanes: [
      { id: 'beats', kind: 'flash', label: 'beat', height: 44, width: 2, as: 'ticks',
        color: INK.beat, terse: true,
        rows: () => events.filter((e) => e.text === undefined)
          .map((e, i) => ({ at: e.ms, id: `f${i}`, kind: 'flash', payload: { ...e } })),
        describeRow: (r) => {
          const p = r.payload || {};
          return [`bar ${p.bar} beat ${p.beat}`, `${Math.round(p.bpm)} bpm`];
        } },
      { id: 'words', kind: 'word', label: 'word', height: 40, barPad: 6,
        as: 'spans', stack: false, barGap: 3, terse: true, color: INK.word,
        rows: () => events.filter((e) => e.text !== undefined)
          .map((e, i) => ({ at: e.ms, id: `w${i}`, kind: 'word',
                            payload: { ...e, durMs: e.durMs } })),
        labelOf: (s, { bw } = {}) => {
          const t = s.row?.payload?.text || '';
          return bw && bw < 60 ? t.slice(0, 4) : t;
        },
        describeRow: (r) => {
          const p = r.payload || {};
          return [p.text, `${Math.round(p.durMs)} ms`];
        } },
    ],
  });

  // ── theirs and ours, under the line that plays them ──────────────────────
  // Side by side because the claim is a TRANSLATION: the same moment lights in
  // both columns as it plays. One column on a narrow screen (see the page CSS).
  const two = el('div', 'two');
  const srcCol = el('div'), docCol = el('div');
  srcCol.append(el('h4', '', 'their score'));
  docCol.append(el('h4', '', 'our document'));
  const srcPre = el('pre', 'sc');
  const pre = el('pre', 'sc');
  srcCol.append(srcPre); docCol.append(pre);
  two.append(srcCol, docCol);
  host.append(two, warn);
  let lineOfRow = new Map();     // row id -> line index in OUR document
  let srcOfRow = new Map();      // row id -> line number in THEIR score

  /**
   * Draw the document, and remember which line each row is on. Rebuilt only when the
   * score changes; the per-beat path flips `data-state` on one element.
   * See lessons/page-csound.md#csound-12
   */
  function drawInto(box, lines) {
    box.textContent = '';
    lines.forEach((text, i) => {
      const line = el('span', 'sc-l');
      line.append(el('span', 'sc-n', String(i + 1).padStart(3, ' ') + '  '));
      line.append(document.createTextNode(text));
      box.append(line);
    });
  }

  function drawDoc() {
    // OURS: one JSON object a line, and which line each row is on
    const lines = scoreDocToJSONL(doc).split('\n').filter(Boolean);
    lineOfRow = new Map();
    drawInto(pre, lines);
    lines.forEach((text, i) => {
      try {
        const o = JSON.parse(text);
        if (o && o.t === 'row' && o.id) lineOfRow.set(o.id, i);
      } catch { /* a line that is not a row is not addressable, and that is fine */ }
    });
    // THEIRS: the file as the composer typed it, tabs and comments included.
    // `csoundPart` keeps each row's `line`, so the two columns are joined
    // without a second reading of the format.
    drawInto(srcPre, SCORES[scoreName].split('\n'));
    srcOfRow = new Map();
    for (const r of cp.part.rows) if (r.line) srcOfRow.set(r.id, r.line - 1);
  }

  /** Light the line a beat came from. Several beats belong to ONE bar
   *  statement, so the same line lights again, which is the honest picture:
   *  the document has one line there, not four. */
  function lightOne(box, i) {
    for (const e of box.children) if (e.dataset.state === 'now') e.dataset.state = 'played';
    if (i !== undefined && box.children[i]) box.children[i].dataset.state = 'now';
  }
  function lightRow(id) {
    lightOne(pre, lineOfRow.get(id));
    lightOne(srcPre, srcOfRow.get(id));
  }

  /** The per-lane numbers, in the lane's own gutter rather than in a table. */
  function lanesLabel() {
    const beats = events.filter((e) => e.text === undefined);
    const words = events.filter((e) => e.text !== undefined);
    const bl = view.strip.lanes().find((l) => l.id === 'beats');
    const wl = view.strip.lanes().find((l) => l.id === 'words');
    const bpms = beats.map((e) => Math.round(e.bpm)).filter((x) => x > 0);
    if (bl) bl.subLabel = [`${beats.length} of them,`,
      bpms.length && Math.min(...bpms) !== Math.max(...bpms)
        ? `${Math.min(...bpms)}–${Math.max(...bpms)} bpm` : `${bpms[0] ?? 0} bpm`];
    if (wl) wl.subLabel = [`${words.length} of them,`, 'shown, never sounded'];
  }

  /**
   * Where in the piece a bar number starts: a list search and a `deck.seek()`, where
   * vClick's server rewrites the score text. The tempo map needs no repair.
   * See lessons/page-csound.md#csound-13
   */
  function msOfBar(n) {
    const hit = events.find((e) => e.bar === n && e.beat === 1);
    return hit ? hit.ms : null;
  }
  function seekBar() {
    const at = msOfBar(startBar);
    if (at === null) { log(`bar ${startBar} is not in ${scoreName}`, 'bad'); return; }
    worstLate = 0; wouldSend = 0;
    deck.seek(at);
    log(`bar ${startBar} is ${Math.round(at)} ms in`, 'hi');
  }

  /**
   * How it works, last in the tab: its own picture, since the score is carried and it
   * ends in the readout. One machine; drawn on first showing into a panel with a width.
   * See lessons/page-csound.md#csound-14
   */
  const DIAGRAM = {
    caption: 'Nothing on this tab reaches a network: the piece is worked out once in the page and played off its own clock.',
    nodes: [
      { id: 'you', label: 'Browser', sub: 'phone or laptop', kind: 'here', tech: 'browser',
        children: [
          { id: 'score', label: 'vClick score', sub: 'in the page',
            note: 'U:\u2019s own test.sco and simple-4-4.sco from tarmoj/vclick, copied verbatim with their tabs and comments. They are carried rather than fetched, so no beat waits on the network.' },
          { id: 'compiler', label: 'compiler', sub: 'Csound in JS',
            note: 'Expands each bar statement into its beats by the rule in vClick\u2019s own orchestra, and writes the score document. That document\u2019s size is the **bytes** cell, the only thing that would ever need to cross.' },
          { id: 'timeline', label: 'timeline', sub: 'Worker clock',
            note: 'The whole piece is scheduled at once, so starting from any bar is a seek rather than a rewrite of the score text. A Web Worker wakes it every 25 ms, so a background tab keeps time.' },
          { id: 'readout', label: 'readout', sub: 'bar, beat, tempo',
            note: 'Each beat writes the bar, beat and tempo cells and lights its line in both scores. This tab makes no sound.' },
        ] },
    ],
    links: [
      { from: 'score', to: 'compiler', note: 'The score text exactly as the composer typed it.' },
      { from: 'compiler', to: 'timeline', note: 'Every beat, count-in click and cue word with its time in milliseconds, scheduled once.' },
      { from: 'timeline', to: 'readout', note: 'One flash per beat, and the late cell is how far each one landed from the millisecond the score asks for.' },
    ],
  };
  let dg = null;
  function drawDiagram() {
    if (dg) return;
    const box = el('div');
    host.append(box);
    dg = createDiagram(box, DIAGRAM, { how: true });
  }

  compileScore();
  seekBar();
  log('press \u25b6 on the bar, or step the bar number to start anywhere', 'hi');

  return {
    deck,
    bars: [{ name: 'the click', bar: transport, strip: view.el }],
    show() {
      drawDiagram();
      requestAnimationFrame(() => requestAnimationFrame(() => { view.strip.fit?.(); view.strip.invalidate?.(); }));
    },
    hide() { deck.pause(); },

    check({ A }) {
      A('their real score compiles', !!cp && cp.part.rows.length === 25,
        cp ? `${cp.part.rows.length} rows` : 'did not compile');
      A('it compiles with nothing to warn about', !!cp && cp.part.warnings.length === 0,
        (cp?.part.warnings || []).join(', ') || 'no warnings');
      A('every bar statement expanded into its own beats', events.length > cp.part.rows.length,
        `${cp.part.rows.length} rows became ${events.length} things to show`);
      // the document is the thing that would cross, so it has to survive the trip
      A('the score document round-trips byte-identically',
        scoreDocToJSONL(parseScoreDocJSONL(scoreDocToJSONL(doc))) === scoreDocToJSONL(doc),
        `${new TextEncoder().encode(scoreDocToJSONL(doc)).length} B`);
      {
        // Counted on the deck's side of the boundary, not on the page's.
        // See lessons/page-csound.md#csound-15
        const on = deck.eventsOf('flash').length + deck.eventsOf('word').length;
        A('the whole piece is on the deck', on === events.length,
          `${on} scheduled of ${events.length}`);
      }

      // A bar's first beat must land on the row's own millisecond: the
      // expansion walks the tempo map by hand, so this is the one place it
      // could disagree with the compiler that produced the row.
      {
        let worst = 0;
        for (const r of cp.part.rows) {
          if (String(r.payload.instr).replace(/"/g, '') !== '2') continue;
          worst = Math.max(worst, Math.abs(barBeats(r)[0].ms - tm.msAt(r.at)));
        }
        A('each bar\u2019s first beat lands on the row\u2019s own time', worst < 1e-6,
          `worst ${worst.toExponential(2)} ms over ${cp.part.rows.length} rows`);
      }

      // Every bar the score names can be seeked to, and the fold says what has sounded by then.
      // See lessons/page-csound.md#csound-16
      {
        const barsIn = [...new Set(events.filter((e) => e.beat === 1 && e.bar > 0).map((e) => e.bar))];
        const found = barsIn.filter((b) => msOfBar(b) !== null);
        A('every bar in the score can be started from', barsIn.length > 0 && found.length === barsIn.length,
          `${found.length} of ${barsIn.length} bars: ${barsIn.join(', ')}`);
        let wrong = 0;
        for (const b of barsIn) {
          const at = msOfBar(b);
          const want = events.filter((e) => e.text === undefined && e.ms <= at).length;
          const got = deck.reduceAt('flash', at);
          if (!got || got.count !== want) wrong++;
        }
        A('and the count of what has sounded is exact at every one', wrong === 0,
          `${barsIn.length} bars probed, ${wrong} wrong`);
      }

      // The score declares its tempo twice and the two must agree, or the
      // number a player reads is not the number the beats are spaced by.
      {
        const rows = cp.part.rows.filter((r) => String(r.payload.instr) === '1'
          && Number(r.payload.p[3]) > 0);
        let worst = 0;
        for (const r of rows) worst = Math.max(worst, Math.abs(bpmAtBeat(r.at) - Number(r.payload.p[3])));
        A('the two ways the score states its tempo agree', rows.length > 0 && worst < 1.5,
          `${rows.length} tempo rows, worst ${worst.toFixed(2)} bpm apart`);
      }

      // Offline: only the kit, the timeline and this page's directory. `/_log` (the shell's
      // local log tap, TAP_LOCAL) is allowed on localhost only; it is never made on the deploy.
      // See lessons/page-csound.md#csound-17
      {
        const own = new URL('.', import.meta.url).pathname;
        const res = performance.getEntriesByType('resource');
        const away = res.filter((r) => {
          const p = new URL(r.name, location.href).pathname;
          return !(p.startsWith('/shell/') || p.startsWith('/timeline/') || p.startsWith(own)
            || (p === '/_log' && /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname)));
        });
        A('the page asked the network for nothing', away.length === 0,
          away.length ? `asked for ${away.map((r) => r.name).join(', ')}` : `${res.length} resources, all local code`);
      }

      // ── the picture, graded the way /sync/'s AFTER tab grades its own ─────
      {
        const w = dg ? Number(dg.svg.getAttribute('width')) : 0;
        const room = dg ? Math.floor(dg.el.clientWidth) : 0;
        A('the diagram is built, last in the tab, and laid out at the width it is shown at, measured rather than estimated',
          !!dg && dg.el.isConnected && dg.measured && room > 0 && Math.abs(w - room) <= 1
            && host.lastElementChild?.contains(dg.el),
          dg ? `${w} px drawn in ${room} px, ${dg.mode}, ${dg.measured ? 'text measured' : 'text ESTIMATED'}` : 'never drawn');
        A('the diagram drew every name and every arrow whole, with no headless line in it',
          !!dg && dg.cuts.length === 0 && dg.ties === 0,
          dg ? (dg.cuts.map((c) => `${c.where} ${c.id}: ${c.shown}`).join(', ') || `nothing cut, nothing refused, ${dg.ties} ties`) : 'no diagram');
        // A box per machine the tab talks to: none but the Browser, read off
        // the same request list as the check above. And no sound box, because
        // nothing on this tab builds an AudioContext.
        const own = new URL('.', import.meta.url).pathname;
        const away = performance.getEntriesByType('resource').filter((r) => {
          const p = new URL(r.name, location.href).pathname;
          return !(p.startsWith('/shell/') || p.startsWith('/timeline/') || p.startsWith(own)
            || (p === '/_log' && /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname)));
        });
        const machines = DIAGRAM.nodes.filter((n) => n.children).map((n) => n.label);
        const boxes = DIAGRAM.nodes.reduce((k, n) => k + 1 + (n.children?.length || 0), 0);
        const drawn = dg ? dg.svg.querySelectorAll('.pos-dg-n').length : 0;
        const kids = DIAGRAM.nodes[0].children.map((c) => c.label);
        A('the diagram boxes are what the tab uses: one machine, the Browser, and no sound box, because it asks no server for anything and makes no sound',
          away.length === 0 && machines.length === 1 && machines[0] === 'Browser'
            && DIAGRAM.nodes.length === 1 && !kids.includes('AudioContext') && drawn === boxes,
          away.length ? `the page asked for ${away.map((r) => r.name).join(', ')}, which has no box`
            : `${drawn} of ${boxes} boxes drawn, machines ${machines.join(', ')}, inside it ${kids.join(', ')}`);
      }
    },
  };
}
