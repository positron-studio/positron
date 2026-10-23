// AHEAD tab: every beat is a moment on a loop clock `{ bpm, epoch }` both ends
// compute, so only the clock offset crosses the wire. A second peer, SKEW_MS
// fast, runs beside this one over `pairTransports`; the relay waits for a press.
// See lessons/page-sync.md#sync-15

import { el } from '/shell/shell.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createGlue } from '/shell/glue.mjs';
import { createButtonGroup } from '/shell/button-group.mjs';
import { DEEP } from '/shell/selfcheck.mjs';
import { beatToShared } from '/shell/timebase.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { scoreDoc, quotation } from '/timeline/score.mjs';
import { createPeer, pairTransports, wsTransport, epochNow } from '/proto/looper/peer.mjs';
import { tabDiagram } from './how.mjs';

const Q = new URLSearchParams(location.search);
// The Pi's rig joins `jam-demo` by default, so that is this tab's default
// room too. A harness run passes its own `?room=` and gets `<room>-clock`,
// which keeps these messages out of ARRIVAL's room.
const ROOM = Q.get('room') ? `${Q.get('room')}-clock` : 'jam-demo';
const BEATS = 8, LOOP = 2000, STEP = LOOP / BEATS;
const LAPS = 2;                               // the deck holds two laps; see `wrap`
const CLOCK = { bpm: (60000 / STEP), epoch: 0 };   // the loop clock both ends compute
const SKEW_MS = 137;                          // how fast the second clock runs, unknown to it
const HOP_MS = 20, HOP_JITTER_MS = 2;         // the in-tab hop: 18 to 22 ms each way
const AGREE_MS = 3;                           // measured between two real machines. See lessons/page-sync.md#sync-16
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mod = (a, n) => ((a % n) + n) % n;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

const rid = () => Math.random().toString(36).slice(2, 8);

/**
 * `wsTransport` keeps one callback (a second `onMessage` replaces the first), so
 * a socket both a peer and a counter listen to is fanned out here.
 * See lessons/page-sync.md#sync-17
 */
function fan(t) {
  const cbs = [];
  t.onMessage((m) => { for (const cb of cbs) cb(m); });
  return { send: (o) => t.send(o), onMessage: (cb) => cbs.push(cb), close: () => t.close() };
}

/** A transport made of several: what one sends goes out on all of them. */
function mux(first) {
  const list = [first], cbs = [];
  return {
    send(o) { for (const t of list) t.send(o); },
    onMessage(cb) { cbs.push(cb); for (const t of list) t.onMessage(cb); },
    add(t) { list.push(t); for (const cb of cbs) t.onMessage(cb); },
    count: () => list.length,
    close() { for (const t of list) t.close?.(); },
  };
}

// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = `Two clocks, the second set ${SKEW_MS} ms fast on purpose, agree on the time and then play the same beats without a message per beat. Press play and both rows light together.`;

export const readout = { correction: 'ms', apart: 'ms', 'round trip': 'ms', beat: '' };

/**
 * Both clocks, both decks and the click in one Browser; the relay is a side leg
 * only `Open to other devices` adds. Every number is this file's constant.
 * See lessons/page-sync.md#sync-18
 */
export const diagramSpec = () => ({
  caption: 'Two clocks agree once on what time it is, and after that every beat is worked out at each end and never sent.',
  nodes: [
    { id: 'br', label: 'Browser', sub: 'this tab', kind: 'here', tech: 'browser',
      children: [
        { id: 'other', label: 'second clock', sub: `${SKEW_MS}ms fast`,
          note: `Reads **epochNow()** plus ${SKEW_MS} ms and is not told so. It finds the error itself and `
              + 'carries the correction in the readout, which should come to the same number with the sign flipped.' },
        { id: 'here', label: 'this clock', sub: 'reference',
          note: 'The peer with the lowest id is the reference, so it corrects by exactly zero. Both clocks are '
              + '**peer.mjs** peers, the same code that runs between two machines.' },
        { id: 'decks', label: 'two decks', sub: `${BEATS} beats, ${LOOP / 1000}s`,
          note: `One deck per clock, each holding the same ${BEATS} beats. A beat is due when its own clock `
              + 'reads the grid time **beatToShared** gives, so the two decks light their rows together.' },
        { id: 'audio', label: 'AudioContext', sub: 'click',
          note: 'An 880 Hz square wave 50 ms long on each beat of this clock\u2019s deck. It is made only once '
              + 'Sound on is pressed, so a visit makes no sound.' },
      ] },
    { id: 'cf', label: 'Cloudflare', kind: 'cloud', tech: 'cloudflare',
      children: [
        { id: 'relay', label: 'Relay object', sub: 'Durable Object',
          note: 'Hands both clocks\u2019 messages to every socket in the room, so a phone or the Raspberry Pi can '
              + 'join the count. It is never asked the time, because a server clock measured 50 ms of bias.' },
      ] },
  ],
  links: [
    { from: 'other', to: 'here',
      note: `Pings in bursts of five every 2 s over an in-tab hop of ${HOP_MS} ms with ${HOP_JITTER_MS} ms of `
          + 'jitter. Only the reply with the shortest round trip is kept, which is how NTP filters a path.' },
    { from: 'here', to: 'decks',
      note: 'The shared clock, epoch time plus the correction, is what each deck schedules on. Play joins the '
          + 'grid where the shared clock has got to, never at zero.' },
    { from: 'decks', to: 'audio',
      note: 'Each beat this clock\u2019s deck plays starts one click, 20 ms after the beat fires, on the '
          + '**AudioContext**\u2019s own clock.' },
    { from: 'br', to: 'relay', label: 'ping, pong',
      note: 'Only after Open to other devices is pressed. Both clocks then send their pings into the room as '
          + 'well as to each other, and nothing per beat.' },
  ],
});

export function build({ panel, log, set }) {
  // ── the score, as a document ──────────────────────────────────────────────
  // Eight beats in two seconds is 240 bpm, written as a score document so it
  // is the same KIND of thing the score and click pages hold.
  const part = {
    lang: 'pulse',
    rows: Array.from({ length: BEATS }, (_, i) => ({
      id: `b${i + 1}`, at: i, dur: 0, kind: 'beat', payload: { beat: i + 1 },
    })),
  };
  const doc = scoreDoc({
    id: 'eight-beats', tempo: [[0, CLOCK.bpm]],
    parts: { pulse: part },
    uses: [quotation({ id: 'u1', ref: 'pulse', at: 0, in: 0, out: BEATS })],
  });

  // The two clocks. Two machines agree to about 3 ms over a real link; quote 3 ms.
  // The second id sorts after the first, and peer.mjs elects the lowest as the
  // reference, so the skew the other must find is exactly SKEW_MS.
  // See lessons/page-sync.md#sync-19
  const id = rid();
  const pair = pairTransports({ schedule: (ms, fn) => setTimeout(fn, ms), delayMs: HOP_MS,
                                jitterMs: HOP_JITTER_MS, rng: Math.random });
  const tHere = mux(pair.a), tOther = mux(pair.b);
  const here = createPeer({ id, transport: tHere });
  const other = createPeer({ id: `${id}~`, transport: tOther, now: () => epochNow() + SKEW_MS });

  // ── a deck on each clock ──────────────────────────────────────────────────
  // `phase(p)` is where the loop clock has got to on peer p's shared clock.
  const phase = (p) => mod(p.now() - CLOCK.epoch, LOOP);
  const rows = Array.from({ length: BEATS * LAPS }, (_, i) => ({ at: i * STEP, i }));

  function pulseRow(label) {
    const row = el('div', 'sync-pulse');
    const cap = el('div', 'sync-pulse-cap', label);
    const cells = Array.from({ length: BEATS }, () => { const c = el('i'); row.append(c); return c; });
    const wrap = el('div', 'sync-pulse-wrap');
    wrap.append(cap, row);
    return { wrap, cells };
  }

  /**
   * One deck on one peer's clock, beats recorded in true time (`epochNow()`) and
   * by grid beat, so two decks compare beat for beat.
   * See lessons/page-sync.md#sync-20
   */
  function deckOn(peer, row) {
    const fires = [];            // { k: grid beat, trueAt, intendedTrue }
    let lastBeat = -1, count = 0, lit = null;
    const hooks = {};
    const deck = createDeck({ clock: peer.clock, items: [], range: [0, LAPS * LOOP] });
    deck.sched.registerAdapter('beat', {
      // NO `rates`: a lattice of one draws a lone `1` on the bar, which is a
      // control with nothing to choose between (the old /replay/ lesson).
      caps: { continuous: false, assertOnSeek: true },
      actuate(p, rec) {
        const trueAt = epochNow();
        const shared = rec.intendedUs / 1000;
        // the shared clock's map onto true time, read now, so a correction
        // that has landed since is in it
        const intendedTrue = shared - (peer.now() - trueAt);
        fires.push({ k: Math.round((shared - CLOCK.epoch) / STEP), trueAt, intendedTrue });
        if (fires.length > 64) fires.shift();
        lastBeat = p.i % BEATS;
        count++;
        if (row) {
          row.cells.forEach((c, j) => c.classList.toggle('on', j === lastBeat));
          lit = row.cells.findIndex((c) => c.classList.contains('on'));
        }
        hooks.onBeat?.(p, deck);
        // The lap keeps the grid: a beat in the second lap steps back exactly one loop.
        // A microtask, because seeking from inside what the seek re-fires is re-entrant.
        // See lessons/page-sync.md#sync-21
        if (p.i >= BEATS) queueMicrotask(() => deck.seek(deck.position() - LOOP));
      },
      reduce: (rs) => ({ count: rs.length }),
      assertState: (s) => s,
    });
    for (const r of rows) deck.schedule({ at: r.at, kind: 'beat', id: `b${r.i}`, payload: { beat: (r.i % BEATS) + 1, i: r.i } });
    /**
     * Play joins the count where the shared clock has got to, in the lap that keeps
     * the position at or after where it was, so `play advances position` holds.
     * See lessons/page-sync.md#sync-22
     */
    function start() {
      const was = deck.position(), ph = phase(peer);
      let at = ph;
      for (let k = 0; k < LAPS && at < was - 0.5; k++) at = ph + k * LOOP;
      if (at < was - 0.5) at = ph;
      deck.seek(at);
      deck.play();
    }
    return { deck, fires, hooks, start, lastBeat: () => lastBeat, count: () => count, lit: () => lit };
  }

  const rowHere = pulseRow('this clock');
  const rowOther = pulseRow(`a second clock, ${SKEW_MS} ms fast`);
  const A1 = deckOn(here, rowHere);
  const B1 = deckOn(other, rowOther);

  // ── sound, from a press only ─────────────────────────────────────────────
  let ctx = null;
  function click() {
    if (!ctx) return;
    const at = ctx.currentTime + 0.02;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; o.type = 'square';
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    o.connect(g); g.connect(ctx.destination);
    o.start(at); o.stop(at + 0.06);
  }
  A1.hooks.onBeat = (p) => { click(); set('beat', `${p.beat}/${BEATS}`); };

  // The bar drives this clock's deck; the second deck follows the same presses.
  // The shelf is in the page before the strip is made: a detached strip measures
  // 300 px and never refits.
  // See lessons/page-sync.md#sync-23
  const btns = createButtonGroup({ buttons: [
    { id: 'join', label: 'Open to other devices', onPress: () => joinRoom() },
    { id: 'sound', label: 'Sound on', onPress: () => {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      // NOT awaited: a context made without a gesture waits rather than rejects
      ctx.resume().catch(() => {});
      log('sound on', 'hi');
    } },
  ] });
  const shelf = el('div');
  panel.add(btns.el, rowHere.wrap, rowOther.wrap, shelf);
  const control = createTransportControl(A1.deck, {
    command: {
      play: () => { A1.start(); B1.start(); },
      pause: () => { A1.deck.pause(); B1.deck.pause(); },
    },
  });
  const bar = createBar({
    start: [playToggle(control).el],
    middle: [clockView(control).el, noteView(control).el],
    end: [ratesView(control).el],
  });
  shelf.append(bar.el);
  bindTransportKeys(control, { scope: bar.el });
  const transport = transportApi(control, { el: bar.el });
  const view = createStripView(shelf, A1.deck, {
    size: 'auto', follow: false, gutter: 150,
    lanes: [
      { id: 'beats', kind: 'beat', label: 'beat', height: 44, width: 2, as: 'ticks',
        color: '#ffd400', terse: true,
        rows: () => rows.map((r) => ({ at: r.at, id: `b${r.i}`, kind: 'beat', payload: { beat: (r.i % BEATS) + 1 } })),
        describeRow: (r) => [`beat ${r.payload.beat} of ${BEATS}`, `${Math.round(STEP)} ms apart`] },
    ],
  });
  {
    const lane = view.strip.lanes().find((l) => l.id === 'beats');
    if (lane) lane.subLabel = [`${BEATS} beats in ${LOOP / 1000} s,`, 'played twice'];
  }

  // ── the relay, from a press only ─────────────────────────────────────────
  const relay = { here: null, other: null, rx: 0 };
  function joinRoom() {
    if (relay.here) return;
    const url = `wss://ws.positron.studio/room/${ROOM}/ws`;
    relay.here = fan(wsTransport(url));
    relay.other = fan(wsTransport(url));
    // counted on the far side of the wire: a message from the other clock
    // that reached THIS clock's socket through the relay
    relay.here.onMessage((m) => { if (m && m.from === other.id) relay.rx++; });
    tHere.add(relay.here);
    tOther.add(relay.other);
    log(`both clocks joined ${ROOM}. Open this tab on a phone, or run node rig/peer.mjs --room ${ROOM}`, 'hi');
  }
  shelf.append(createGlue(bar.el, view.el));

  // ── who is here, and the numbers that say how well ───────────────────────
  let roster = null;
  /** The newest beat both decks played, and how far apart in true time. */
  function gaps(X, Y, key = 'trueAt') {
    const byK = new Map(Y.fires.map((f) => [f.k, f]));
    return X.fires.filter((f) => byK.has(f.k)).map((f) => f[key] - byK.get(f.k)[key]);
  }
  const timer = setInterval(() => {
    set('correction', other.peers().length ? Math.round(other.offsetMs() * 10) / 10 : '');
    const g = gaps(A1, B1);
    set('apart', g.length ? Math.round(g[g.length - 1] * 10) / 10 : '');
    const ps = other.peers().filter((p) => Number.isFinite(p.rttMs));
    set('round trip', ps.length ? Math.round(Math.min(...ps.map((p) => p.rttMs)) * 10) / 10 : '');
    const now = here.peers().map((p) => p.id).sort().join(' ');
    if (now !== roster) {
      roster = now;
      // a state CHANGE goes in the log, once, when it changes
      log(`this clock hears ${here.peers().map((p) => (p.id === other.id ? 'the second clock' : p.id)).join(', ') || 'nobody yet'}`);
    }
  }, 500);
  addEventListener('pagehide', () => { clearInterval(timer); here.dispose(); other.dispose(); });

  const how = tabDiagram(panel, diagramSpec);

  return {
    bars: [{ name: 'the pulse', bar: transport, strip: view.el }],
    show() { how.draw(); },
    hide() { if (A1.deck.playing?.()) { A1.deck.pause(); B1.deck.pause(); } },

    async check({ A }) {
      A('nothing joined the relay before a press in this tab', !relay.here && tHere.count() === 1,
        `${tHere.count()} transport(s) under this clock, the in-tab hop only`);
      // the offset, once the clock exchange has had a round trip or two
      const by = performance.now() + 1500;
      while ((!other.peers().length || !Number.isFinite(other.peers()[0].rttMs)) && performance.now() < by) await sleep(20);
      await sleep(4 * HOP_MS);
      const err = other.offsetMs() + SKEW_MS;
      A(`the second clock found the ${SKEW_MS} ms it was off, to within ${AGREE_MS} ms`,
        other.peers().length > 0 && Math.abs(err) < AGREE_MS,
        `it moved ${other.offsetMs().toFixed(2)} ms, ${Math.abs(err).toFixed(2)} ms from the truth, `
        + `on a ${HOP_MS} ms hop with ${HOP_JITTER_MS} ms of jitter`);
      A('the reference clock moves by exactly zero, because there is nothing to correct it to',
        here.offsetMs() === 0 && here.peers().some((p) => p.id === other.id),
        `this clock ${here.offsetMs()} ms, hearing ${here.peers().length} peer(s)`);
      A('the deck runs on the SHARED clock, not this document’s',
        A1.deck.transport.clock.domain === 'shared-epoch' && A1.deck.transport.clock === here.clock,
        A1.deck.transport.clock.domain);
      A('the whole loop is on the deck, twice', A1.deck.eventsOf('beat').length === BEATS * LAPS,
        `${A1.deck.eventsOf('beat').length} of ${BEATS * LAPS}`);
      A('the score is a document that round-trips', !!doc && doc.parts.pulse.rows.length === BEATS,
        `${doc.parts.pulse.rows.length} rows`);
      {
        // the fold: what has sounded by a position, which is what makes
        // joining part-way through answerable
        let wrong = 0;
        for (let i = 0; i < BEATS * LAPS; i++) {
          const got = A1.deck.reduceAt('beat', i * STEP);
          if (!got || got.count !== i + 1) wrong++;
        }
        A('the count of what has sounded is exact at every beat', wrong === 0, `${BEATS * LAPS} probed, ${wrong} wrong`);
      }

      // Negative control: the same skewed clock with every clock message lost. The
      // comparison must see the whole skew, or the agreement above proves nothing.
      // See lessons/page-sync.md#sync-24
      const lost = pairTransports({ schedule: (ms, fn) => setTimeout(fn, ms), lossRate: 1, rng: () => 0 });
      const deaf = createPeer({ id: `${id}~~`, transport: lost.b, now: () => epochNow() + SKEW_MS, pingEveryMs: 0 });
      const N = deckOn(deaf, null);

      // Press play the way a finger does, and let a few beats go by on all three.
      const startPos = A1.deck.position();
      transport.el.querySelector('.tbar-toggle').click();
      N.start();
      const until = performance.now() + 2500;
      while ((gaps(A1, B1).length < 4 || gaps(A1, N).length < 4) && performance.now() < until) await sleep(25);
      A('the lit square is the beat the deck is on', A1.count() > 0 && A1.lit() === A1.lastBeat(),
        `square ${A1.lit() + 1} lit, deck says ${A1.lastBeat() + 1} of ${BEATS}`);
      A('the pulse is running, on the grid', A1.count() > 0 && A1.fires.every((f) => Math.abs(f.intendedTrue - beatToShared(CLOCK, f.k)) < 1),
        `${A1.count()} beat(s), started from ${startPos.toFixed(0)} ms`);
      const g = gaps(A1, B1), gi = gaps(A1, B1, 'intendedTrue');
      const worstI = gi.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      A(`two clocks, ${SKEW_MS} ms apart before they spoke, play the same beats within ${AGREE_MS} ms`,
        gi.length >= 4 && worstI < AGREE_MS && Math.abs(median(g)) < AGREE_MS,
        `${gi.length} beats matched, scheduled ${worstI.toFixed(2)} ms apart at worst, `
        + `fired a median ${median(g).toFixed(2)} ms apart (worst ${g.reduce((m, x) => Math.max(m, Math.abs(x)), 0).toFixed(2)})`);
      const gn = gaps(A1, N, 'intendedTrue');
      A(`NEGATIVE CONTROL: with every clock message lost the second clock plays its beats the whole ${SKEW_MS} ms early`,
        gn.length >= 4 && gn.every((x) => Math.abs(x - SKEW_MS) < AGREE_MS),
        `${gn.length} beats matched, a median ${median(gn).toFixed(2)} ms apart, ${deaf.peers().length} peer(s) heard`);
      N.deck.pause(); deaf.dispose();
      transport.el.querySelector('.tbar-toggle').click();
      A1.deck.seek(0); B1.deck.seek(0);

      // A relay round trip is a deep check; an ordinary run logs that, not a pass.
      // See lessons/page-sync.md#sync-25
      if (DEEP) {
        btns.button('join').click();
        const t = performance.now() + 6000;
        while (relay.rx < 3 && performance.now() < t) await sleep(100);
        A('DEEP: both clocks joined the room and the relay carries the second clock’s messages to this one',
          relay.rx >= 3, `${relay.rx} message(s) from the second clock arrived through ${ROOM}`);
      } else {
        log('left for the deep run: joining the relay room with both clocks');
      }
      // Written out here rather than read off the spec: two clocks, one of
      // them SKEW_MS fast, a deck each, the click, and the room the join opens.
      await how.check(A, ['Browser, this tab', `second clock, ${SKEW_MS}ms fast`, 'this clock, reference',
        `two decks, ${BEATS} beats, ${LOOP / 1000}s`, 'AudioContext, click',
        'Cloudflare', 'Relay object, Durable Object']);
    },
  };
}
