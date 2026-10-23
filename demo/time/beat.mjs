// BEAT tab: one beat sent several ways at once. Code lands within a ms or so; the
// sound card and MIDI port get the instant ahead and hit it themselves. The
// hardware button moves out of `.pos-controls` into this tab's own row.
// See lessons/page-time.md#time-8

import { el } from '/shell/shell.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createGlue } from '/shell/glue.mjs';
import { createHardware } from '/shell/hardware.mjs';
import { createDeck, createAudioLane, createMidiLane } from '/timeline/transport.mjs';
import { markAdapter, marks } from '/shell/fixture.mjs';
import { tabDiagram } from './how.mjs';

const DURATION = 16000;
const BEAT = 500;
const AHEAD = 100;          // how far ahead every lane hands its work over

// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = 'One beat sent several ways at once, where code fires it a little late and the sound card and MIDI port, told in advance, hit it exactly. Press the yellow button for sound and MIDI, then watch each lane.';

export const readout = null;

const nap = (ms) => new Promise((r) => setTimeout(r, ms));

export function build({ panel, d, log }) {
  const { fired, adapter } = markAdapter({ rates: [0.25, 0.5, 1, 2] });
  const driftOf = new Map();          // position -> deltaMs, worker lane
  const deck = createDeck({
    items: marks(Math.floor(DURATION / BEAT), DURATION),
    adapters: { mark: adapter },
    range: [0, DURATION],
    onDrift: (_rows, all) => { for (const r of all) driftOf.set(r.at, r.deltaMs); },
  });

  const host = el('div');
  // No slider: the strip below is the position surface. Not published,
  // because SCHEDULE's bar is the page's.
  const control = createTransportControl(deck);
  const bar = createBar({
    start: [playToggle(control).el],
    middle: [clockView(control).el, noteView(control).el],
    end: [loopView(control).el, ratesView(control).el],
  });
  host.append(bar.el);
  bindTransportKeys(control, { scope: bar.el });
  const transport = transportApi(control, { el: bar.el });

  // A mark's colour says how it landed, never which lane: grey not played, slate
  // played without a promise, green inside its promise, amber or red later.
  // See lessons/page-time.md#time-9
  const UNMEASURED = '#6f7d94', NOT_YET = '#3b424e';
  const LANES = [
    { id: 'worker', label: 'code', swatch: '#ffd400', note: 'code ran here' },
    { id: 'sound', label: 'sound card', swatch: '#8fd6a8', note: 'the card played here' },
    { id: 'midi', label: 'midi out', swatch: '#7fb8e0', note: 'the port sent here' },
    { id: 'midiin', label: 'midi in', swatch: '#c9a0ff', note: 'a note arrived here',
      onlyMeasured: true },
  ];
  const loopOf = new Map();           // position -> ms late, midi lane
  const soundOf = new Map();          // position -> render error, ms
  const sentOf = new Set();
  const BUDGET = 5;
  const bandColour = (ms) => (Math.abs(ms) < BUDGET ? '#8fd6a8'
    : Math.abs(ms) < BUDGET * 4 ? '#ffd400' : '#e0908a');
  // A lane may only be coloured by evidence it produced: the loopback number
  // belongs to MIDI IN, never to MIDI OUT.
  function metricOf(id, r) {
    if (id === 'worker') return driftOf.get(Math.round(r.at));
    if (id === 'midiin') return loopOf.get(Math.round(r.at));
    if (id === 'sound') return soundOf.get(Math.round(r.at));
    return undefined;
  }
  function happened(id, r) {
    const at = Math.round(r.at);
    if (id === 'worker') return driftOf.has(r.at) || driftOf.has(at);
    if (id === 'sound') return soundOf.has(at);
    if (id === 'midi') return sentOf.has(at);
    if (id === 'midiin') return loopOf.has(at);
    return false;
  }
  function outcomeOf(id, r) {
    const m = metricOf(id, r);
    if (m !== undefined) return bandColour(m);
    return happened(id, r) ? UNMEASURED : NOT_YET;
  }
  function verdictOf(id, r) {
    const m = metricOf(id, r);
    if (m === undefined) return null;
    return `${Math.abs(m).toFixed(2)} ms ${m < 0 ? 'early' : 'late'}`;
  }
  const sign = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;

  const laneSpec = (L) => ({
    id: L.id, kind: 'mark', label: L.label, height: 52, width: 2, latch: true,
    color: L.swatch,
    terse: true,
    // The capture lane shows a row only where something ACTUALLY ARRIVED:
    // drawing a row for a note that never came back would invent evidence.
    rows: L.onlyMeasured ? (rows) => rows.filter((r) => loopOf.has(Math.round(r.at))) : undefined,
    colorOfRow: (r, wasFired) => (!wasFired ? NOT_YET : outcomeOf(L.id, r)),
    describeRow: (r) => {
      if (!happened(L.id, r)) return 'not played yet';
      const v = verdictOf(L.id, r);
      return v ? [L.note, v] : [L.note, 'no per-note feedback from this lane'];
    },
  });

  const PAD = Math.max(...LANES.map((L) => L.label.length)) + 2;
  const view = createStripView(host, deck, {
    size: 'auto', follow: false, gutter: 132,
    // One tooltip for all the rows: this tab compares lanes at one instant.
    // See lessons/page-time.md#time-10
    describeHit: (hit) => {
      const r = hit.row;
      if (!r) return null;
      const shown = view.strip.lanes().map((l) => l.id);
      const lines = [{ text: `beat at ${(r.at / 1000).toFixed(3)} s`, dim: true }];
      for (const L of LANES) {
        if (!shown.includes(L.id)) continue;
        const name = L.label.padEnd(PAD);
        const line = (t) => lines.push({ text: `${name}${t}`, colour: L.swatch });
        if (!happened(L.id, r)) { line(L.id === 'midiin' ? 'nothing arrived' : 'not played yet'); continue; }
        const m = metricOf(L.id, r);
        if (m !== undefined) { line(`${m >= 0 ? '+' : ''}${m.toFixed(2)} ms`); continue; }
        const rt = L.id === 'midi' ? loopOf.get(Math.round(r.at)) : undefined;
        line(rt === undefined ? 'sent, no way to check' : `sent, at most ${sign(rt)} ms`);
      }
      return lines;
    },
    lanes: [laneSpec(LANES[0])],          // the others appear with their device
  });
  // The bar and the strip are one surface.
  // See lessons/page-time.md#time-11
  const pair = createGlue(bar.el, view.surface);

  const showLane = (id) => {
    if (view.strip.lanes().some((l) => l.id === id)) return;
    const spec = laneSpec(LANES.find((L) => L.id === id));
    const want = LANES.map((L) => L.id);
    const next = [...view.strip.lanes(), spec].sort((a, b) => want.indexOf(a.id) - want.indexOf(b.id));
    view.strip.setLanes(next);
  };

  let audio = null, midi = null, out = null, probe = null, impulse = null, hold = null, ctxOf = null;

  /** AN AUDIBLE CLICK, plus a one-sample impulse at the same instant into the
   *  probe bus, which only the ear hears: a threshold on a 2 ms ramp lags about
   *  0.75 ms, twenty times the quantity being measured. */
  const audibleClick = (ctx, at) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 1320;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.3, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(g); g.connect(out);
    osc.start(at); osc.stop(at + 0.06);
    if (probe) {
      const tick = ctx.createBufferSource();
      tick.buffer = impulse;
      tick.connect(probe);
      tick.start(at);
    }
    return osc;
  };

  const heard = [];                   // audio-domain seconds, from the ear
  const hw = createHardware(d, {
    onAudio(ctx) {
      ctxOf = ctx;
      out = ctx.createGain();
      out.gain.value = 1;
      out.connect(ctx.destination);
      // THE EAR: what the card renders on the probe bus, timestamped on the
      // audio thread to the sample. Web Audio has no per-note callback.
      impulse = ctx.createBuffer(1, 2, ctx.sampleRate);
      impulse.getChannelData(0)[0] = 1;
      probe = ctx.createGain();
      probe.gain.value = 1;
      // Chrome latches a silent bus and hands the worklet an EMPTY input; a
      // started ConstantSourceNode at 0 keeps it live without a sound.
      hold = ctx.createConstantSource();
      hold.offset.value = 0;
      hold.connect(probe);
      hold.start();
      ctx.audioWorklet.addModule('/shell/impulse-worklet.js').then(() => {
        const ear = new AudioWorkletNode(ctx, 'impulse-detect');
        ear.port.onmessage = (e) => heard.push(e.data.at);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        probe.connect(ear); ear.connect(mute); mute.connect(ctx.destination);
        log('ear listening on the audio thread');
      }).catch((e) => log(`no ear: ${e.name}, so the sound card stays unmeasured`, 'bad'));

      audio = createAudioLane(deck.transport, ctx, { horizonMs: AHEAD, makeNode: audibleClick });
      for (let at = 0; at < DURATION; at += BEAT) audio.schedule({ at, kind: 'click', id: `c${at}` });
      audio.start();
      showLane('sound');
      // at rate 0 the lane has nothing to anchor to, so arming implies rolling
      if (!deck.playing()) deck.play();
      log(`sound on, ${Math.floor(DURATION / BEAT)} clicks queued`);
    },
    onMidiIn(input) { listenOn(input); showLane('midiin'); },
    onMidi(port) {
      midi?.dispose();
      midi = createMidiLane(deck.transport, port, { horizonMs: AHEAD });
      for (let at = 0, i = 0; at < DURATION; at += BEAT, i++) {
        midi.schedule({ at, note: 60 + (i % 4) * 5, id: `n${at}` });
      }
      midi.start();
      showLane('midi');
      log(`midi out: ${port.name}`);
    },
  });
  // The five nodes `createHardware` just appended to the page's control row:
  // the button, then a tag and a picker for each direction.
  const row = el('div', 'time-row');
  row.append(...[...hw.el.children].slice(-5));
  panel.add(pair, row);
  view.strip.fit?.();

  function pairHeard() {
    if (!heard.length || !audio) return;
    const want = audio.scheduled();
    for (const t of heard.splice(0)) {
      let best = null, bd = Infinity;
      for (const x of want) {
        const d0 = Math.abs(x.intendedAudioT - t);
        if (d0 < bd) { bd = d0; best = x; }
      }
      // intendedAudioT is in the audio clock's own domain, so this never
      // touches the main thread's idea of the time.
      if (best && bd < 0.25) soundOf.set(Math.round(best.at), (t - best.intendedAudioT) * 1000);
    }
  }

  /**
   * The MIDI loopback (macOS IAC bus). `e.timeStamp` is the send stamp, so it
   * pairs a note; `performance.now()` in the handler is the upper bound on delivery.
   * See lessons/page-time.md#time-12
   */
  let listening = null;
  function listenOn(input) {
    if (listening && listening !== input) listening.onmidimessage = null;
    listening = input;
    log(`midi in: ${input.name}`);
    input.onmidimessage = (e) => {
      if ((e.data[0] & 0xf0) !== 0x90 || e.data[2] === 0) return;      // note-on only
      const want = midi?.scheduled() || [];
      const arrived = performance.now();
      let best = null, bd = Infinity;
      for (const x of want) {
        const d0 = Math.abs(x.sentAtPerf - e.timeStamp);
        if (d0 < bd) { bd = d0; best = x; }
      }
      if (!best || bd > 500) return;
      const late = arrived - best.sentAtPerf;
      loopOf.set(Math.round(best.at), late);
      log(`◀ note ${e.data[1]} vel ${e.data[2]}, ${late >= 0 ? '+' : ''}${late.toFixed(2)} ms`);
    };
  }

  const summarise = (xs) => {
    const a = [...xs].sort((p, q) => p - q);
    return { n: a.length, p50: a[a.length >> 1], worst: a.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0) };
  };
  const laneOf = (id) => view.strip.lanes().find((l) => l.id === id);
  const say = (id, ...lines) => { const L = laneOf(id); if (L) L.subLabel = lines; };

  /** The three facts the old page asserted, kept until the check reads them. */
  let verdict = null;
  function measure() {
    const take = (id, xs) => {
      if (!xs.length) return false;
      const sm = summarise(xs);
      say(id, `typical ${sign(sm.p50)} ms`, `worst ${sign(sm.worst)} ms`);
      return true;
    };
    if (!take('worker', [...driftOf.values()])) say('worker', 'not started');

    pairHeard();
    const sched = audio ? audio.scheduled() : [];
    if (!audio) say('sound', 'not enabled');
    else if (!take('sound', [...soundOf.values()])) say('sound', `${sched.length} sent`, 'ear not listening yet');

    // MIDI out has no feedback path; the loopback round trip bounds it from
    // above, so it is worded as a ceiling and the lane stays uncoloured.
    if (midi) for (const x of midi.scheduled()) sentOf.add(Math.round(x.at));
    if (!midi) say('midi', 'no device');
    else {
      const back = [...loopOf.values()];
      const bound = back.length ? summarise(back).p50 : null;
      say('midi', `${midi.scheduled().length} sent`,
        bound === null ? 'no way to check' : `at most ${sign(bound)} ms`);
    }
    if (!listening) say('midiin', 'no device');
    else if (!take('midiin', [...loopOf.values()])) say('midiin', 'nothing arrived');
    view.strip.invalidate();

    if (verdict || !sched.length) return;
    const byPos = new Map(fired.filter((f) => f.at !== null).map((f) => [Math.round(f.at), f.wall]));
    const pairs = sched
      .filter((x) => Number.isFinite(x.intendedUs) && byPos.has(Math.round(x.at)))
      .map((x) => byPos.get(Math.round(x.at)) - x.intendedUs / 1000);
    if (!pairs.length) return;
    verdict = { p50: summarise(pairs.map(Math.abs)).p50, pairs: pairs.length,
                sched: sched.length, fired: fired.length };
  }
  setInterval(measure, 200);

  log(`${DURATION / 1000}s, one beat every ${BEAT} ms`);

  /**
   * One deck with its Worker-timed `code` lane, and two lanes handing beats ahead to
   * the AudioContext and a MIDI port, drawn inside the Browser. Headless Chrome has
   * no MIDI permission, so the MIDI fact is the picker, not a note sent.
   * See lessons/page-time.md#time-13
   */
  const how = tabDiagram(panel, () => ({
    caption: 'One beat, sent three ways. Code runs it on time as best it can, and the sound card '
      + 'and the MIDI port are told in advance and play it themselves.',
    nodes: [
      // `join: false`: two neighbours with no declared link between them do
      // not feed each other here, and an undeclared gap would draw an arrow.
      { id: 'br', label: 'Browser', sub: 'phone or laptop', kind: 'here', tech: 'browser', join: false,
        children: [
          { id: 'deck', label: 'deck', sub: `${deck.items.length} beats, ${BEAT}ms`, tech: 'browser',
            note: 'The **code** lane: a **Web Worker** timer wakes the page just before each beat '
                + 'and JavaScript runs it, about a millisecond late. Both lanes below read this '
                + 'deck\'s clock.' },
          { id: 'audio', label: 'audio lane', sub: 'AudioContext', tech: 'sound',
            note: `Every 25 ms it hands the **AudioContext** the clicks due in the next ${AHEAD} ms, `
                + 'each with **start(t)** at its exact time. An **AudioWorklet** hears every click '
                + 'to the sample.' },
          { id: 'spk', label: 'speakers', sub: 'sound card', tech: 'device',
            note: 'The sound card plays each click on its own clock, so the page never has to be '
                + 'on time, only early.' },
          { id: 'midi', label: 'MIDI lane', sub: 'Web MIDI', tech: 'device',
            note: `**MIDIOutput.send()** takes a timestamp, so each note leaves the page ${AHEAD} ms `
                + 'early and the browser sends it on the beat.' },
          { id: 'port', label: 'MIDI port', sub: 'IAC or USB', tech: 'device',
            note: 'Whatever the out picker names. A loopback such as the macOS **IAC** bus hands '
                + 'every note back on the in picker, which is the only way to time this lane.' },
        ] },
    ],
    links: [
      { from: 'deck', to: 'audio',
        note: 'The same **deck.transport**, so a pause or a seek cancels every click already '
            + 'handed over.' },
      { from: 'audio', to: 'spk',
        note: 'Oscillator starts scheduled in the audio clock\'s own seconds, never in the page\'s.' },
      { from: 'deck', to: 'midi',
        note: 'The same **deck.transport**, so a pause clears the port\'s queue and sends '
            + 'all-notes-off.' },
      { from: 'midi', to: 'port',
        note: 'Note on and note off queued together, each with its own **send()** timestamp.' },
      { from: 'port', to: 'midi', back: true,
        note: '**onmidimessage** on the in port. When it arrives is an upper bound on when the '
            + 'note left.' },
    ],
  }));

  return {
    deck, bar,
    // Two frames on: a strip fitted before its panel lays out fits its range into
    // the width it had then (20 s in about 160 px at 1280).
    // See lessons/page-time.md#time-14
    show() {
      how.draw();
      requestAnimationFrame(() => requestAnimationFrame(() => { view.strip.fit?.(); view.strip.invalidate(); }));
    },
    hide() { if (deck.playing()) deck.pause(); },
    bars: [{ name: 'beat', bar: transport, strip: view.el }],
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
      A('nothing made a sound before the press in this tab',
        !ctxOf && !audio && hw.button.closest('.pos-controls') === null,
        `${ctxOf ? 'a sound card was opened' : 'no sound card'}, the button is in ${hw.button.parentElement?.className}`);

      // The press a person makes. Under the harness only; it plays the deck.
      hw.button.click();
      for (let i = 0; i < 15 && !verdict; i++) await nap(100);
      if (deck.playing()) deck.pause();
      A('lanes agree within 50 ms at the same position', !!verdict && verdict.p50 < 50,
        verdict ? `typically ${verdict.p50.toFixed(1)} ms over ${verdict.pairs} paired positions` : 'nothing paired in 1.5 s');
      // Thin: one committed click passes it.
      // See lessons/page-time.md#time-15
      A('audio schedule anchored', !!verdict && verdict.sched > 0,
        `${verdict ? verdict.sched : 0} committed`);
      A('both lanes advanced', !!verdict && verdict.fired > 0 && verdict.sched > 0,
        `worker ${verdict ? verdict.fired : 0} / sound card ${verdict ? verdict.sched : 0}`);
      // After the press, so the sound half is a reading rather than a promise.
      how.check(A, [
        ['deck', deck.hostName === 'worker' && deck.items.length === DURATION / BEAT,
          `${deck.items.length} beats on a ${deck.hostName} timer`],
        ['audio lane', !!audio && audio.scheduled().length > 0,
          `${audio ? audio.scheduled().length : 0} clicks handed over`],
        ['speakers', !!ctxOf, ctxOf ? `AudioContext ${ctxOf.state} at ${ctxOf.sampleRate} Hz` : 'no AudioContext'],
        ['MIDI lane', row.contains(hw.outPick), `out picker here, ${hw.state.midi}`],
        ['MIDI port', row.contains(hw.inPick), `in picker here, ${hw.state.midiIn}`],
      ]);
    },
  };
}
