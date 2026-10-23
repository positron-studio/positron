// The SCORE tab of /csound/: a typed Csound score compiled to a document, played from
// a deck built off the EXPANDED compile, since a repeat under a tempo ramp is different
// material in time (578 ms off at the end if quoted). `deck.reduceAt` answers a seek.
// See lessons/page-csound.md#csound-23

import { el } from '/shell/shell.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi, publishTransport } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { scoreDoc, quotation, scoreDocToJSONL } from '/timeline/score.mjs';
import { csoundPart, compileCsound, tempoMap } from '/timeline/csound.mjs';
import { createCompileIdle, IDLE_MS, NOTE_SAYS } from '/shell/compile-idle.mjs';
import { createCodeBox } from '/shell/code-box.mjs';
import { createDiagram } from '/shell/diagram.mjs';

/** Under the tab row, in the page's one fixed box. */
export const about = 'A Csound score you can edit, compiled when you stop typing, whose every note plays where its slowing tempo puts it, even after a jump into the repeat.';

export const readout = { bend: 'ms', beat: '', fold: '', sounded: '' };

const DEFAULT_SCORE = [
  '; a fragment in the shape vClick scores are written in',
  't 0 120  4.75 120  9.5 72   ; steady through part 1, then eases to 72 across part 2',
  '',
  'm theme',
  'i 1 0    0.5  8000 440',
  'i 1 +    .    .    550',
  'i 1 +    .    .    660',
  'i 1 +    1.0  .    880',
  '',
  'i 2 4    0.25 6000 220',
  'i 2 +    .    .    .',
  'i 2 +    .    .    .',
  'n theme                 ; and again, a reference, not seven more lines',
].join('\n');

export function build({ panel, d, assert, log, set }) {
  const host = panel.el;

  // Ink: the part is slate in strip and document; yellow is a note that has sounded,
  // its dim twin one that has not yet.
  // See lessons/page-csound.md#csound-24
  const INK = { on: '#ffd400', off: '#6b5a12' };
  const DERIVED = '#6f7d94';        // 02 and 03's slate: shown, never measured

  const parent = createDeck({ items: [], adapters: {}, range: [0, 1000] });

  let doc = null, part = null, tm = null, compiled = null, structural = null, bendMs = 0;
  // the TRACE: every note of the expanded compile, at the time it really sounds
  let traceItems = [];
  let LINES = [], lineEls = [], lineOfRow = new Map(), lineOfUse = new Map();
  const plays = new Map();
  let sounded = 0, ctx = null, soundAsserted = false;

  const code = createCodeBox({
    language: 'csound-sco',
    rows: DEFAULT_SCORE.split('\n').length,
    value: DEFAULT_SCORE,
    ariaLabel: 'the Csound score this tab compiles',
  });
  const ta = code.input;
  // The host is the box the compile note sits in the corner of. See below.
  const editor = code.el;
  editor.classList.add('und-editor');
  editor.style.setProperty('--ln-on', INK.on);
  editor.style.setProperty('--ln-off', INK.off);
  editor.style.setProperty('--ln-derived', DERIVED);
  host.append(editor);
  const warnEl = el('div', 'warn');
  host.append(warnEl);

  /* `command.play` runs in the gesture, so the AudioContext is made there. The resume is
     not awaited: outside a gesture it never settles and left the deck unbuilt.
     This is the page's one published bar; CLICK's is not published.
     See lessons/page-csound.md#csound-25 */
  let playOpened = false;
  const control = createTransportControl(parent, {
    command: { play: () => {
      openAudio();
      /* Graded on the first press, inside it.
         See lessons/page-csound.md#csound-26 */
      if (!playOpened) {
        playOpened = true;
        assert('the transport’s own play opens the sound inside its press, with no second button',
          ctx !== null && bus !== null && ctx.state !== 'closed' && !d.el.querySelector('.pos-controls button'),
          `context ${ctx?.state}, voice bus ${bus ? 'built' : 'missing'}`);
      }
      parent.play();
    } } });
  const bar = createBar({
    start: [playToggle(control).el],
    middle: [clockView(control).el, noteView(control).el],
    end: [loopView(control).el, ratesView(control).el],
  });
  host.append(bar.el);
  bindTransportKeys(control, { scope: bar.el });
  const transport = transportApi(control, { el: bar.el });
  publishTransport(transport);

  const pre = el('pre', 'sc');

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

  /** does the tempo actually go anywhere? a flat line is a constant, not a fact */
  const tempoVaries = (points) => points.length > 1
    && points.some(([, m]) => Math.abs(m - points[0][1]) > 1e-9);

  const view = createStripView(host, parent, {
    size: 'auto', follow: false, gutter: 150,
    lanes: [
      /* Slate (#6f7d94, this tab's DERIVED, CLICK's words lane). Yellow stays on what is
         lit now: a sounded note and the current line.
         See lessons/page-csound.md#csound-27 */
      { id: 'deck-span', kind: 'deck-span', label: 'part', height: 46, barPad: 7,
        as: 'spans', stack: false, barGap: 3, terse: true, color: DERIVED,
        // Each use measured through the tempo map, so a part under the ramp draws wider.
        // See lessons/page-csound.md#csound-28
        rows: () => {
          if (!doc || !tm) return [];
          return doc.uses.map((u) => {
            const b0 = Number(u.at), b1 = b0 + (Number(u.out) - Number(u.in));
            const from = tm.msAt(b0), to = tm.msAt(b1);
            return { at: from, id: u.id, kind: 'deck-span',
                     payload: { durMs: to - from, use: u.id, beats: b1 - b0 } };
          });
        },
        labelOf: (s, { bw } = {}) => {
          const id = s.row?.payload?.use || '';
          return bw && bw < 84 ? id.slice(0, 6) : id;
        },
        describeRow: (r) => {
          const p = r.payload || {};
          const line = lineOfUse.get(p.use);
          return [`${p.use}, ${Math.round(p.durMs)} ms`,
                  line === undefined ? 'a use' : `line ${line}`];
        } },
      { id: 'rows', kind: 'note', label: 'event', height: 42, width: 2, as: 'ticks',
        color: INK.off, terse: true,
        // the notes the deck will actually fire, at the times it will fire them
        rows: () => traceItems.map((it) => ({ at: it.at, id: it.id, kind: 'note',
                                              payload: it.payload })),
        colorOfRow: (r) => (plays.get(r.payload?.row) ? INK.on : INK.off),
        describeRow: (r) => {
          const p = r.payload || {};
          const line = lineOfRow.get(p.row);
          const n = plays.get(p.row) || 0;
          return [`line ${line}, beat ${Math.round(p.beat * 100) / 100}`,
                  n ? `played ${n}x` : 'not played yet'];
        } },
      // The tempo lane is derived (sampled from a function), so it is slate and the gutter says
      // so. It is removed, not flattened, when the tempo does not vary.
      // See lessons/page-csound.md#csound-29
      { id: 'tempo', kind: 'note', label: 'tempo', height: 46, as: 'continuous',
        color: DERIVED, terse: true, dots: false, show: false,
        value: (p) => p.bpm,
        rows: () => {
          if (!doc || !tm) return [];
          const pts = doc.tempo;
          if (!tempoVaries(pts)) return [];
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

  host.append(pre);

  // ── highlighting, from the deck and never from a timer ──────────────────
  const fading = new Map();
  const setState = (i, st) => { const l = lineEls[i]; if (l) l.dataset.state = st; };

  function lightRow(rowId) {
    const i = lineOfRow.get(rowId);
    if (i === undefined) return;
    setState(i, 'now');
    clearTimeout(fading.get(i));
    fading.set(i, setTimeout(() => { setState(i, 'played'); fading.delete(i); }, 450));
  }

  /** A use line lights because a note INSIDE it fired, not because a timer
   *  noticed the playhead was in range. It stays lit until a different use
   *  takes over, since a use lasts as long as its notes do. */
  let litUse = null;
  function lightUse(useId) {
    if (useId === undefined || useId === litUse) return;
    if (litUse !== undefined && litUse !== null) {
      const prev = lineOfUse.get(litUse);
      if (prev !== undefined) setState(prev, 'played');
    }
    litUse = useId;
    const i = lineOfUse.get(useId);
    if (i !== undefined) setState(i, 'now');
  }

  /**
   * Two sawtooths 7 cents apart through a closing lowpass, about 1 s decay, and a room from
   * a noise buffer (no fetch). The attack stays 4 ms because the onset is the claim.
   * Quiet: 0.09 a voice into a 0.7 bus and a -10 dB compressor, so overlaps do not clip.
   * See lessons/page-csound.md#csound-30
   */
  let bus = null;
  function openAudio() {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume().catch(() => {});
    if (bus) return;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    bus = ctx.createGain();
    bus.gain.value = 0.7;
    bus.connect(comp);
    const room = ctx.createConvolver();
    const len = Math.round(ctx.sampleRate * 1.1);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    room.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    bus.connect(room); room.connect(wet); wet.connect(comp);
  }

  /** One note per row, so a seek is audible as well as assertable. */
  function voice(p) {
    if (!ctx || !bus) return;
    const freq = Number(p[4]);
    if (!Number.isFinite(freq) || freq <= 0) return;
    const t = ctx.currentTime;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(Math.min(freq * 8, 9000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 300), t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    lp.connect(g); g.connect(bus);
    for (const cents of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(lp);
      o.start(t); o.stop(t + 1.15);
    }
    sounded++;
    set('sounded', sounded, 'ok');
    // Asserted when the evidence arrives, not at load, when nothing has sounded yet.
    // See lessons/page-csound.md#csound-31
    if (!soundAsserted) {
      soundAsserted = true;
      assert('notes actually sounded', sounded > 0, `${sounded} voices`);
    }
  }

  const noteAdapter = {
    caps: { rates: [0.25, 0.5, 1, 2], continuous: false, assertOnSeek: true },
    actuate(payload) {
      plays.set(payload.row, (plays.get(payload.row) || 0) + 1);
      lightRow(payload.row);
      lightUse(payload.use);
      voice(payload.p);
      view.strip.invalidate();
    },
    // The fold: how many notes have sounded by a position. It is what makes
    // "start at bar 9" answerable, and the checks probe it either side of
    // every note.
    reduce: (rows) => ({ count: rows.length }),
    assertState: (s) => s,
  };

  // one deck, one adapter, registered once. Registering bumps the scheduler's
  // adapter generation, which is what lets the transport bar find this deck's
  // rate lattice, and the bar is built before any of this exists.
  parent.sched.registerAdapter('note', noteAdapter);

  /**
   * Csound's m/n into the container's `uses`. A repeat lands where it is written, so the
   * score is placed end to end (before, the quoted span, after) and no two uses of one
   * deck overlap in parent time (rule 7g).
   * See lessons/page-csound.md#csound-32
   */
  function usesFor(cp, lastBeat) {
    const uses = [];
    let cursor = 0, at = 0, i = 0;
    for (const r of [...cp.repeats].sort((a, b) => a.atBeat - b.atBeat)) {
      if (r.atBeat > cursor) {
        uses.push(quotation({ id: `part${++i}`, ref: 'theme', at, in: cursor, out: r.atBeat }));
        at += r.atBeat - cursor;
        cursor = r.atBeat;
      }
      const span = r.outBeat - r.inBeat;
      if (span > 0) {
        uses.push(quotation({ id: `part${++i}`, ref: 'theme', at, in: r.inBeat, out: r.outBeat }));
        at += span;
      }
    }
    if (lastBeat > cursor) uses.push(quotation({ id: `part${++i}`, ref: 'theme', at, in: cursor, out: lastBeat }));
    return uses;
  }

  function teardown() {
    for (const t of fading.values()) clearTimeout(t);
    fading.clear();
    plays.clear();
    litUse = null;
  }

  /**
   * A compile failure is a normal human error here, not a page fault: keep the last good
   * document, say what was wrong, and let them fix the line.
   * See lessons/page-csound.md#csound-33
   */
  function compile() {
    let cp, exp, str;
    try {
      cp = csoundPart(ta.value);
      exp = compileCsound(ta.value, { expand: true });
      str = compileCsound(ta.value, { expand: false });
    } catch (e) {
      warnEl.textContent = `score did not compile: ${String(e?.message ?? e)}`;
      log(`score did not compile: ${String(e?.message ?? e)}`, 'bad');
      return false;
    }
    if (!cp.part.rows.length) {
      warnEl.textContent = 'the score compiled to no rows';
      return false;
    }

    parent.pause();
    teardown();

    compiled = exp; structural = str;
    part = cp.part;
    const lastBeat = Math.max(...cp.part.rows.map((r) => r.at + Math.max(0, r.dur)), 1);
    doc = scoreDoc({ id: 'sound', tempo: cp.tempo.length ? cp.tempo : [[0, 60]],
      parts: { theme: cp.part }, uses: usesFor(cp, lastBeat) });
    tm = tempoMap(doc.tempo);

    // the document, one record per line, coloured by the part it belongs to
    LINES = scoreDocToJSONL(doc).split('\n');
    lineOfRow = new Map();
    lineOfUse = new Map();
    pre.replaceChildren();
    lineEls = LINES.map((text, i) => {
      const rec = JSON.parse(text);
      const row = el('span', 'sc-l');
      // the part's hue, the same as its lane in the strip
      // See lessons/page-csound.md#csound-34
      if (rec.t === 'row' || rec.t === 'part' || rec.t === 'use') row.style.borderLeftColor = DERIVED;
      if (rec.t === 'row') lineOfRow.set(rec.id, i);
      else if (rec.t === 'use' && rec.id) lineOfUse.set(rec.id, i);
      row.append(el('span', 'sc-n', String(i).padStart(2, ' ') + '  '),
                 document.createTextNode(text));
      pre.append(row);
      return row;
    });

    // The trace: every note of the expanded compile at its tempo-map time. An expanded note
    // keeps its source line, so the second pass lights the same lines the first one did.
    // See lessons/page-csound.md#csound-35
    const rowIdByLine = new Map(cp.part.rows.map((r) => [r.line, r.id]));
    const useSpans = doc.uses.map((u) => ({
      id: u.id, from: Number(u.at), to: Number(u.at) + (Number(u.out) - Number(u.in)),
    }));
    const useAtBeat = (b) => {
      const hit = useSpans.find((u) => b >= u.from - 1e-9 && b < u.to - 1e-9);
      return (hit || useSpans[useSpans.length - 1] || {}).id;
    };

    parent.sched.clear();
    traceItems = exp.items.map((it, i) => ({
      at: it.at, kind: 'note', id: `t${i + 1}`,
      payload: { row: rowIdByLine.get(it.payload.line), use: useAtBeat(it.payload.beat),
                 p: it.payload.p, beat: it.payload.beat },
    }));
    for (const it of traceItems) parent.schedule(it);

    const endBeat = Math.max(...doc.uses.map((u) => Number(u.at) + (Number(u.out) - Number(u.in))));
    parent.setRange([0, Math.ceil(tm.msAt(endBeat) + 300)]);

    // The bend against the shortcut: the true curve is the trapezoid of 60/tempo; averaging
    // the tempo gives a straight line and every note lands slightly early.
    // See lessons/page-csound.md#csound-36
    const pts = doc.tempo;
    const meanBpm = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    bendMs = tm.msAt(lastBeat) - (60000 * lastBeat) / meanBpm;

    // the tempo lane appears only when the tempo goes somewhere
    const varies = tempoVaries(pts);
    const tempoLane = view.strip.lanes().find((l) => l.id === 'tempo');
    if (tempoLane) {
      tempoLane.show = varies;
      tempoLane.subLabel = varies
        ? [`${Math.round(pts[0][1])} → ${Math.round(pts[pts.length - 1][1])} bpm`, 'drawn from the score']
        : null;
    }
    const partLane = view.strip.lanes().find((l) => l.id === 'deck-span');
    if (partLane) partLane.subLabel = [`${doc.uses.length} of them,`,
      structural.repeats.length
        ? `${structural.repeats.length} a repeat, played slower`
        : 'none a repeat'];
    const eventLane = view.strip.lanes().find((l) => l.id === 'rows');
    if (eventLane) eventLane.subLabel = [`${part.rows.length} written,`, 'each one a line below'];

    set('bend', Math.round(bendMs));
    set('sounded', sounded);
    warnEl.textContent = compiled.warnings.length
      ? compiled.warnings.map((w) => `warning: ${w}`).join('\n') : '';

    view.strip.fit();
    view.strip.invalidate();
    return true;
  }

  // The kit's idle compile (shared with /fau/): waits IDLE_MS after the last keystroke,
  // never runs two at once; the full refusal reason prints in the line under the box.
  // No `notNow`: a compile pauses and rebuilds the deck, with no held note to take away.
  // See lessons/page-csound.md#csound-37
  const idle = createCompileIdle({
    input: ta,
    host: editor,
    compile: () => {
      if (!compile()) return { ok: false, error: warnEl.textContent };
      log(`recompiled, ${part.rows.length} rows`);
      return { ok: true };
    },
  });

  setInterval(() => {
    if (!tm || !traceItems.length) return;
    const pos = parent.position();
    set('beat', Math.round(tm.beatAtMs(pos) * 100) / 100);
    const fold = parent.reduceAt('note', pos);
    set('fold', fold && Number.isFinite(fold.count) ? fold.count : '');
  }, 200);

  /**
   * How it works, last in the tab: one machine, the Browser. No speakers box, since the
   * drawer gives every top-level box the same height (a 300 px empty slab at 1280 px).
   * Drawn on first showing, so it is laid out at a real width.
   * See lessons/page-csound.md#csound-38
   */
  const DIAGRAM = {
    caption: 'Everything happens in the page: the score is compiled, scheduled and played without a request to any server.',
    nodes: [
      { id: 'you', label: 'Browser', sub: 'phone or laptop', kind: 'here', tech: 'browser',
        children: [
          { id: 'score', label: 'score', sub: 'code box',
            note: `The Csound score you type, coloured line by line in the ink of the lane that draws it. It goes to the **compiler** ${IDLE_MS} ms after the last keystroke, never while you are still typing.` },
          { id: 'compiler', label: 'compiler', sub: 'Csound in JS',
            note: 'Reads Csound\u2019s score format in JavaScript, bending seconds per beat linearly in beat the way Csound does. It writes the document with the repeat as one line, and expands the repeat into real notes for playing.' },
          { id: 'timeline', label: 'timeline', sub: 'Worker clock',
            note: 'Every expanded note at the millisecond the tempo map gives it, so a jump into the slower repeat lands where it should. A Web Worker wakes it every 25 ms, which keeps time in a background tab.' },
          { id: 'audio', label: 'AudioContext', sub: 'WebAudio', tech: 'sound',
            note: 'Two sawtooths seven cents apart through a closing lowpass and a room built from a noise buffer, compressed at -10 dB into this device\u2019s own output. The 4 ms attack keeps each onset where the **timeline** puts it.' },
        ] },
    ],
    links: [
      { from: 'score', to: 'compiler', note: 'The text as it stood at the last keystroke, once the typing has paused.' },
      { from: 'compiler', to: 'timeline', note: 'Each note with its time in milliseconds, scheduled once per compile.' },
      { from: 'timeline', to: 'audio', note: 'One voice per note, started the moment the timeline fires it, and the line it was written on lights.' },
    ],
  };
  let dg = null;
  function drawDiagram() {
    if (dg) return;
    const box = el('div');
    host.append(box);
    dg = createDiagram(box, DIAGRAM, { how: true });
  }

  // No "jump into the repeat" button. Seeking into the score IS this tab's
  // claim, but the button only did by hand what two asserts already do on
  // their own, and the strip is a position surface you can drag there yourself.
  compile();
  log('edit the score and it compiles when you stop, t bends the tempo lane and m/n becomes one use');

  return {
    deck: parent,
    show() {
      drawDiagram();
      requestAnimationFrame(() => requestAnimationFrame(() => { view.strip.fit?.(); view.strip.invalidate?.(); }));
    },
    // Leaving the tab stops the notes: nothing new is scheduled once the deck
    // is paused, and a voice already sounding decays inside 1.15 s.
    hide() { parent.pause(); },

    async check({ A }) {
      // ── the checks, carried over from vclick and adapted to the container ──
      A('the score compiles to rows', part.rows.length > 0, `${part.rows.length} rows`);
      A('no warnings from a score this simple', compiled.warnings.length === 0,
        compiled.warnings.join(' | ') || 'none');

      // Tempo 120 -> 72 over 16 beats is the trapezoid of seconds-per-beat (Csound interpolates
      // 60/tempo linearly in beat, checked against csound 6.18), not the mean-tempo line.
      // See timeline/lab/csound-oracle.mjs.
      // See lessons/page-csound.md#csound-39
      const bend = Math.round(bendMs);
      A('the tempo map bends away from the mean-tempo line', Math.abs(bend) > 20,
        `${bend} ms by the end`);

      A('the repeat compiled to a use, not to more rows',
        structural.repeats.length > 0
          && doc.uses.length === structural.repeats.length + 1
          && part.rows.length === structural.items.length,
        `${structural.repeats.length} repeat, ${doc.uses.length} uses, ${part.rows.length} rows written`);

      // Every note must sit where the tempo map puts it. Quoting the first pass at rate 1
      // passes every structural check and still plays the second pass 578 ms early.
      // See lessons/page-csound.md#csound-40
      {
        let worst = 0;
        for (const t of traceItems) worst = Math.max(worst, Math.abs(t.at - tm.msAt(t.payload.beat)));
        // where the last note would land if the repeat merely replayed the
        // first pass's spacing, shifted: the wrong answer, quantified
        const late = traceItems[traceItems.length - 1];
        const firstUse = doc.uses[0] && doc.uses[0].id;
        const firstPass = new Map();
        for (const t of traceItems) if (t.payload.use === firstUse && !firstPass.has(t.payload.row)) firstPass.set(t.payload.row, t.at);
        const lateUse = doc.uses.find((u) => u.id === late.payload.use);
        const naive = lateUse && firstPass.has(late.payload.row)
          ? tm.msAt(Number(lateUse.at)) + firstPass.get(late.payload.row) - tm.msAt(Number(doc.uses[0].at))
          : null;
        const stretch = naive === null ? null : Math.round(late.at - naive);
        A('every note is scheduled where the tempo map puts it', worst < 2,
          `worst ${worst.toFixed(2)} ms`
          + (stretch === null ? '' : `, the repeat is stretched ${stretch} ms, not merely moved`));
      }

      A('the deck spans the score', parent.range[1] > 0
        && Math.abs(parent.range[1] - compiled.durationMs) < 1500,
        `${parent.range[1]} vs ${Math.round(compiled.durationMs)} ms`);

      // THE FOLD, either side of every note: the same probe 15 seek runs
      // against a recording, run here against a written score.
      {
        let wrong = 0, probes = 0;
        for (const it of traceItems) {
          for (const at of [it.at - 1, it.at, it.at + 1]) {
            if (at < 0) continue;
            probes++;
            const want = traceItems.filter((x) => x.at <= at).length;
            const got = parent.reduceAt('note', at);
            if (!got || got.count !== want) wrong++;
          }
        }
        A('the fold is exact either side of every note', wrong === 0,
          `${probes} probes, ${wrong} wrong`);
      }

      // Before `ready` and awaited: a compile pauses the deck and would break verify.mjs's play
      // drill. Two edits closer than IDLE_MS give one compile, with the second edit's rows.
      // See lessons/page-csound.md#csound-41
      {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const typeInto = (text) => { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); };
        const rows0 = part.rows.length, runs0 = idle.runs();
        typeInto(`${DEFAULT_SCORE}\ni 1 20   0.5  8000 660`);
        await sleep(200);
        typeInto(`${DEFAULT_SCORE}\ni 1 20   0.5  8000 660\ni 1 21   0.5  8000 550`);
        await sleep(IDLE_MS / 2);
        A('typing compiles nothing while it goes on, and the corner stays empty until a compile starts',
          idle.runs() === runs0 && idle.state() === 'due' && idle.shown() === '',
          `${idle.runs() - runs0} compiles ${IDLE_MS / 2} ms after the last keystroke, ${idle.state()}, note "${idle.shown()}"`);
        await sleep(IDLE_MS / 2 + 150);
        const anim = getComputedStyle(idle.el).animationName;
        A('once the typing pauses the score compiles once, as it stood at the last keystroke, under a breathing Compiling note',
          idle.runs() === runs0 + 1 && part.rows.length === rows0 + 2
            && idle.shown() === NOTE_SAYS.compiling && anim === 'pos-cnote-breathe' && idle.el.tagName !== 'BUTTON',
          `${idle.runs() - runs0} compile, ${rows0} rows became ${part.rows.length}, note "${idle.shown()}" ${anim}`);
        await idle.settled();
        A('and then the note is gone, not drawn at all',
          idle.shown() === '' && getComputedStyle(idle.el).display === 'none',
          `"${idle.shown()}", display ${getComputedStyle(idle.el).display}`);
        // Put the score back the way a visitor finds it, without the note.
        code.set(DEFAULT_SCORE);
        compile();
        // The code box's invariant: the coloured layer holds exactly the textarea's text at its
        // metrics, after two typed edits and a set(). A statement letter on every note line.
        // See lessons/page-csound.md#csound-42
        const cs = (e) => getComputedStyle(e);
        const PROPS = ['font-size', 'line-height', 'padding-top', 'padding-left', 'white-space'];
        const differ = PROPS.filter((p) => cs(code.ink).getPropertyValue(p) !== cs(ta).getPropertyValue(p));
        const letters = code.ink.querySelectorAll('.pos-tk-keyword').length;
        A('the score is drawn coloured over the box exactly as typed, at the box’s own metrics',
          code.ink.textContent === ta.value && differ.length === 0 && letters === 10,
          `${ta.value.length} characters, ${differ.length ? `differs in ${differ.join(' ')}` : 'metrics equal'}, `
          + `${letters} statement letters`);
      }

      // A seek inside the repeat, the position a score cannot describe. It leaves the playhead
      // there, so the harness's `notes actually sounded` needs a note in the next half second.
      // See lessons/page-csound.md#csound-43
      {
        const rep = structural.repeats[0];
        const use = rep && [...doc.uses]
          .filter((u) => Math.abs(Number(u.in) - rep.inBeat) < 1e-9
                      && Math.abs(Number(u.out) - rep.outBeat) < 1e-9)
          .sort((a, b) => Number(b.at) - Number(a.at))[0];
        let mid = use ? tm.msAt(Number(use.at) + (Number(use.out) - Number(use.in)) / 2) : null;
        /* 120 ms before the next note, only where that note is still inside the repeat.
           See lessons/page-csound.md#csound-44 */
        const end = use ? tm.msAt(Number(use.at) + (Number(use.out) - Number(use.in))) : null;
        const next = mid !== null && traceItems.find((x) => x.at > mid && x.at < end);
        if (next) mid = Math.max(mid, next.at - 120);
        if (mid !== null) parent.seek(mid);
        const pos = parent.position();
        const want = traceItems.filter((x) => x.at <= pos).length;
        const got = parent.reduceAt('note', pos);
        A('a seek into the repeat folds correctly', !!got && got.count === want,
          `at ${Math.round(pos)} ms, fold ${got && got.count} of ${want}`);
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
        // A box per machine the tab talks to. It talks to none, so the only
        // machine is the Browser, and that is checked against what the page
        // really requested rather than against the description of it.
        const own = new URL('.', import.meta.url).pathname;
        const res = performance.getEntriesByType('resource');
        const away = res.filter((r) => {
          const p = new URL(r.name, location.href).pathname;
          return !(p.startsWith('/shell/') || p.startsWith('/timeline/') || p.startsWith(own)
            || (p === '/_log' && /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname)));
        });
        const machines = DIAGRAM.nodes.filter((n) => n.children).map((n) => n.label);
        const boxes = DIAGRAM.nodes.reduce((k, n) => k + 1 + (n.children?.length || 0), 0);
        const drawn = dg ? dg.svg.querySelectorAll('.pos-dg-n').length : 0;
        const kids = DIAGRAM.nodes[0].children.map((c) => c.label);
        A('the diagram boxes are what the tab uses: one machine, the Browser, because the tab asks no server for anything',
          away.length === 0 && machines.length === 1 && machines[0] === 'Browser' && drawn === boxes,
          away.length ? `the page asked for ${away.map((r) => r.name).join(', ')}, which has no box`
            : `${drawn} of ${boxes} boxes drawn, machines ${machines.join(', ')}, inside it ${kids.join(', ')}, ${res.length} requests all local code`);
      }

      A('this is the page’s one published transport', window.__demo?.transport === transport,
        window.__demo?.transport === transport ? 'the harness drills this bar' : 'another bar is published');
    },
  };
}
