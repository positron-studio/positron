// demo/shell/transport-control.mjs: a transport is a controller. Play, pause, seek, the end of a bounded piece, the
// rates a deck can play at, the loop and its three directions, the live window. No DOM: its buttons are views
// (transport-views.mjs) that show its state and send it a command, on a bay link where the page has a bay.
// Moved out of transport-bar.mjs on 2026-10-23 (plans/plan-bars.md); the rules it keeps are in
// lessons/kit-transport-bar.md, cited by anchor.
// why: lessons/kit-bar.md#control

import { observePosition } from '/timeline/transport.mjs';
import { LOOP_TURN, LOOP_WAYS } from './looper.mjs';

/**
 * @param {object} deck  createDeck() or anything with its shape
 * @param {object} [o]
 * @param {{play?: Function, pause?: Function, seek?: Function}} [o.command]  a media-driven deck's own verbs
 *   (why: lessons/kit-transport-bar.md#command)
 * @param {boolean} [o.endStop]       stop at the end of a bounded piece (#end-stop); no longer tied to a play button
 * @param {boolean} [o.live]          a live source: the loop is a window filled in real time (#live-loop)
 * @param {number}  [o.liveWindowMs]  how much live sound one loop may hold (#live-window)
 * @param {boolean} [o.loopWays]      round, back and pingpong laps, driven here (#loop-ways)
 * @param {(r: number) => void} [o.onRate]   (#on-rate)
 * @param {() => boolean} [o.settling]       is the armed rate not yet audible (#settling)
 * @param {(what: string, a: number|null, b: number|null) => void} [o.onLoop]  (#on-loop)
 * @param {(way: string) => void} [o.onWay]
 * @param {(f: number|null) => void} [o.onLoopPos]  (#on-loop-pos)
 */
export function createTransportControl(deck, {
  command = null, endStop = true, live = false, liveWindowMs = 20000, loopWays = false,
  onRate = null, settling = null, onLoop = null, onWay = null, onLoopPos = null,
} = {}) {
  const cmd = {
    play: () => (command?.play ? command.play() : deck.play()),
    pause: () => (command?.pause ? command.pause() : deck.pause()),
    seek: (pos) => (command?.seek ? command.seek(pos) : deck.seek(pos)),
  };
  const seekable = Number.isFinite(deck.durationMs) && deck.durationMs > 0;
  let gen = deck.rangeGen?.() ?? 0, range = deck.range;
  let lattice = null, agen = -1;
  let note = '';
  let atEnd = false, endTimer = null;
  let loopA = null, loopB = null, lastWrap = 0;
  let filling = false, fillEnds = null, fillTimer = null;
  let wayAt = 0;
  let lapRaf = 0, lapAt = 0, lapPrev = 0;
  let lastLoopFrac = null, warn = false, pos = deck.position();
  const subs = new Set();
  const LIVE_WARN_FRAC = 0.25;

  const wayName = () => LOOP_WAYS[LOOP_TURN[wayAt]][1];
  const rolling = () => (deck.playing?.() ?? false) || !!lapRaf;
  const changed = (why) => { for (const f of subs) f(why); };
  const setNote = (msg) => { const n = msg ? String(msg).slice(0, 60) : ''; if (n !== note) { note = n; changed('note'); } };

  function relattice() {
    agen = deck.adapterGen?.() ?? 0;
    lattice = latticeFor(deck);
    changed('lattice');
  }
  relattice();

  // ── the end of a bounded piece: a committed one-shot, never a check in a frame loop (#end-one-shot) ──
  const clearEnd = () => { if (endTimer) { clearTimeout(endTimer); endTimer = null; } };
  function closeAtEnd() {
    if (!seekable || filling || loopA == null || loopB != null) return false;
    if (range[1] - loopA < 1) return false;
    startLoop(loopA, range[1]);
    return true;
  }
  function hitEnd() {
    endTimer = null;
    if (!endStop || !deck.playing?.()) return;
    if (loopA != null && loopB != null) return;
    if (closeAtEnd()) return;
    cmd.pause();
    cmd.seek(range[1]);
    atEnd = true;
    changed('end');
  }
  function armEnd() {
    clearEnd();
    if (!endStop || !seekable || !(deck.playing?.() ?? false)) return;
    const rate = typeof deck.rate === 'function' ? deck.rate() : deck.rate;
    if (!(rate > 0)) return;
    const t = deck.transport;
    const due = t?.timeAt ? t.timeAt(range[1]) : null;
    if (due == null) return;
    const delay = due - t.clock.now();
    if (delay <= 0) return hitEnd();
    endTimer = setTimeout(hitEnd, delay);
  }

  // ── the live window, the same kind of one-shot (#arm-fill) ──
  const clearFill = () => { if (fillTimer) { clearTimeout(fillTimer); fillTimer = null; } };
  function armFill() {
    clearFill();
    if (!filling || fillEnds == null) return;
    const t = deck.transport;
    const due = t?.timeAt ? t.timeAt(fillEnds) : null;
    if (due == null) return;
    const delay = due - t.clock.now();
    if (delay <= 0) return closeWindow();
    fillTimer = setTimeout(closeWindow, delay);
  }
  function closeWindow() {
    fillTimer = null;
    if (!filling || fillEnds == null || loopA == null) return;
    startLoop(loopA, fillEnds);
  }
  const offState = deck.transport?.onState ? deck.transport.onState(() => { armEnd(); armFill(); changed('state'); }) : null;

  // ── laps backwards and both ways: the deck is paused and seeked once a frame (#lap) ──
  function lapRate() {
    const r = typeof deck.targetRate === 'function' ? deck.targetRate() : deck.targetRate;
    const n = Math.abs(Number(r));
    return n > 0 ? n : 1;
  }
  function startLap() {
    stopLap();
    if (loopA == null || loopB == null || loopB - loopA <= 0) return;
    if (deck.playing?.()) cmd.pause();
    const at = Math.min(Math.max(deck.position(), loopA), loopB);
    const into = wayName() === 'back' ? loopB - at : at - loopA;
    lapAt = performance.now() - into / lapRate();
    lapPrev = into;
    lapRaf = requestAnimationFrame(driveLap);
  }
  function stopLap() { if (lapRaf) cancelAnimationFrame(lapRaf); lapRaf = 0; }
  function driveLap(now) {
    lapRaf = 0;
    if (loopA == null || loopB == null || wayName() === 'round') return;
    const span = loopB - loopA;
    if (!(span > 0)) return;
    const gone = Math.max(0, (now - lapAt) * lapRate());
    let p, at;
    if (wayName() === 'back') { p = gone % span; at = loopB - p; }
    else { p = gone % (span * 2); at = p < span ? loopA + p : loopB - (p - span); }
    if (p < lapPrev) onLoop?.('wrap', loopA, loopB);
    lapPrev = p;
    doSeek(at);
    lapRaf = requestAnimationFrame(driveLap);
  }

  // ── the loop: one control pressed three times, start, end, off (#loop-button) ──
  function startLoop(a, b) {
    filling = false; fillEnds = null; clearFill();
    loopA = a; loopB = b;
    setNote('');
    doSeek(loopA);
    if (wayName() === 'round') { if (!(deck.playing?.() ?? false)) cmd.play(); } else startLap();
    publishLoop();
    onLoop?.('set', loopA, loopB);
  }
  function clearLoop() {
    const wasLive = live && loopA != null;
    stopLap();
    loopA = loopB = null;
    filling = false; fillEnds = null; clearFill();
    publishLoop();
    reportLoopPos(null);
    onLoop?.('off', null, null);
    if (wasLive) doSeek(deck.range[1]);           // a live source goes back to now (#live-loop-off)
    setNote('');
  }
  function publishLoop() {
    const on = loopA != null && loopB != null;
    deck.setLoopView?.(loopA == null ? null : { a: loopA, b: loopB, state: on ? 'on' : 'armed', filling });
    changed('loop');
  }
  function pressLoop() {
    if (!seekable) return;
    const p = deck.position();
    if (loopA == null) {
      let at = p;
      const going = deck.playing?.() ?? false;
      if (!going && !live && endStop && (atEnd || p >= range[1])) { leaveEnd(range[0]); at = range[0]; }
      loopA = at; loopB = null;
      filling = live;
      fillEnds = live ? loopA + liveWindowMs : null;
      publishLoop();
      if (filling) { onLoop?.('fill', loopA, fillEnds); armFill(); } else if (!going) cmd.play();
      return;
    }
    if (loopB == null) {
      const a = Math.min(loopA, p), b = Math.max(loopA, p);
      if (b - a < 1) return;                      // a zero-length loop stays armed (#zero-length)
      startLoop(a, b);
      return;
    }
    clearLoop();
  }
  function cycleWay() {
    wayAt = (wayAt + 1) % LOOP_TURN.length;
    const name = wayName();
    onWay?.(name);
    changed('way');
    if (loopA == null || loopB == null) return;   // it acts on the next loop
    if (name === 'round') { stopLap(); if (!deck.playing?.()) cmd.play(); } else startLap();
  }
  function reportLoopPos(p) {
    let f = null;
    if (loopA != null && loopB != null && loopB > loopA && p != null) f = Math.min(1, Math.max(0, (p - loopA) / (loopB - loopA)));
    if (f === null && lastLoopFrac === null) return;
    lastLoopFrac = f;
    onLoopPos?.(f);
  }

  // ── play, pause, seek, rate ──
  function leaveEnd(to) { atEnd = false; setNote(''); cmd.seek(to); }
  function doSeek(p) {
    if (atEnd && p < range[1]) { atEnd = false; setNote(''); changed('end'); }
    const res = cmd.seek(p);
    if (res && res.degraded) setNote(res.reason);
  }
  /** Parked at the end, play replays from the start, as a sequencer does (#replay-at-end). */
  function toggle() {
    if (lapRaf) { stopLap(); changed('state'); return; }
    if (deck.playing?.()) return cmd.pause();
    if (loopA != null && loopB != null && wayName() !== 'round') return startLap();
    if (endStop && (atEnd || (seekable && deck.position() >= range[1]))) leaveEnd(range[0]);
    cmd.play();
  }
  function setRate(r) {
    const res = deck.setRate(r);
    setNote(res && res.degraded ? res.reason : '');
    onRate?.(r);                                    // before the views sync, or the pulse flickers (#on-rate-order)
    changed('rate');
  }
  const fracToPos = (f) => range[0] + f * (range[1] - range[0]);

  /** One command by name, for a view or a bay link: { do, arg }. */
  function run(what, arg) {
    switch (what) {
      case 'toggle': return toggle();
      case 'play': return deck.playing?.() ? undefined : toggle();
      case 'pause': return deck.playing?.() || lapRaf ? toggle() : undefined;
      case 'seek': return doSeek(Number(arg));
      case 'seekFrac': return doSeek(fracToPos(Math.min(1, Math.max(0, Number(arg)))));
      case 'step': return doSeek(Math.min(range[1], Math.max(range[0], deck.position() + Number(arg) * (range[1] - range[0]))));
      case 'rate': return setRate(Number(arg));
      case 'loop': return pressLoop();
      case 'way': return cycleWay();
      case 'loopOff': return loopA != null ? clearLoop() : undefined;
      default: throw new Error(`transport: no command called ${what}`);
    }
  }

  // ── the position tick: the loop's wrap and outrun, and every view's paint (#wrap, #outrun) ──
  function tick({ pos: p }) {
    pos = p;
    if (deck.rangeGen && deck.rangeGen() !== gen) { gen = deck.rangeGen(); range = deck.range; changed('range'); }
    if (deck.adapterGen && deck.adapterGen() !== agen) relattice();
    const going = rolling();
    if (!lapRaf && loopA != null && loopB != null && going && p >= loopB) {
      const t = performance.now();
      if (t - lastWrap > 150) { lastWrap = t; doSeek(loopA); onLoop?.('wrap', loopA, loopB); }
    }
    if (going && loopA != null && loopB == null && !filling && p >= range[1]) closeAtEnd();
    const outrunsEnd = !live && (loopB ?? loopA) > range[1];
    if (loopA != null && (loopA < range[0] || outrunsEnd)) clearLoop();
    warn = filling && fillEnds != null && loopA != null && p >= fillEnds - (fillEnds - loopA) * LIVE_WARN_FRAC;
    reportLoopPos(p);
    changed('tick');
  }
  const stopTick = observePosition(deck.transport, tick, { hz: 60 });

  return {
    deck, seekable, live,
    run,
    toggle, setRate, pressLoop, cycleWay,
    seek: (p) => doSeek(p),
    get position() { return deck.position(); },
    get pos() { return pos; },
    get playing() { return deck.playing?.() ?? false; },
    /** a reversed lap counts as playing, for the play button's face */
    get rolling() { return rolling(); },
    get atEnd() { return atEnd; },
    get range() { return range; },
    get rangeGen() { return deck.rangeGen?.() ?? 0; },
    get lattice() { return lattice; },
    get targetRate() { return deck.targetRate?.() ?? (typeof deck.rate === 'function' ? deck.rate() : deck.rate); },
    get rate() { return typeof deck.rate === 'function' ? deck.rate() : deck.rate; },
    get settling() { return settling ? !!settling() : false; },
    get note() { return note; },
    get loop() { return loopA != null && loopB != null ? [loopA, loopB] : null; },
    get loopA() { return loopA; },
    get loopArmed() { return loopA != null && loopB == null; },
    get loopFilling() { return filling; },
    get loopFillEnds() { return fillEnds; },
    get loopWindowMs() { return liveWindowMs; },
    get loopWarn() { return warn; },
    get loopFrac() { return lastLoopFrac; },
    get way() { return wayName(); },
    get loopWays() { return loopWays; },
    get endStop() { return endStop; },
    get commanded() { return !!command; },
    /** `fn(why)` on every change and every position tick; returns the unsubscribe. */
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    destroy() { stopTick(); stopLap(); clearEnd(); clearFill(); offState?.(); subs.clear(); },
  };
}

/**
 * `__demo.transport`, the harness's handle on the page's transport: the control's state plus `el`, the element
 * holding its play button (`.tbar-toggle`) and its keys. `toggles` says whether there is a play button at all.
 * why: lessons/kit-transport-bar.md#api
 */
export function transportApi(control, { el, toggles = true, live = null, loopView = null } = {}) {
  return {
    el, live,
    get position() { return control.position; },
    get playing() { return toggles ? control.playing : false; },
    get toggles() { return toggles; },
    get rate() { return control.rate; },
    get range() { return control.range; },
    get rangeGen() { return control.rangeGen; },
    get lattice() { return control.lattice; },
    get degraded() { return control.note || null; },
    get seekable() { return control.seekable; },
    get loop() { return control.loop; },
    get way() { return control.way; },
    get loopArmed() { return control.loopArmed; },
    get loopFilling() { return control.loopFilling; },
    get loopFillEnds() { return control.loopFillEnds; },
    get loopWindowMs() { return control.loopWindowMs; },
    get loopBlinking() { return control.loopWarn; },
    get loopFrac() { return control.loopFrac; },
    /** press it the way a finger does, so a check drives the real handler; once, never twice */
    pressLoop() { if (loopView?.button) loopView.button.click(); else control.pressLoop(); },
    loopExtra: (id) => loopView?.extra?.(id) ?? null,
    slot: () => null,
  };
}

/** Publish an api as the page's transport; a page with two names one. Returns the unpublish. */
export function publishTransport(api) {
  if (window.__demo) window.__demo.transport = api;
  return () => { if (window.__demo && window.__demo.transport === api) window.__demo.transport = null; };
}

/**
 * The transport as a bay node on the page's own bay: `<site>:transport` (engine) takes `{ of: 'transport', do, arg }`
 * on its value-in, and `<site>:transport-buttons` (person) sends them. Returns the `send` the views use.
 * why: lessons/kit-bar.md#bay
 */
export function transportOnBay(bay, { site, control, label = 'transport' }) {
  const T = `${site}:transport`, B = `${site}:transport-buttons`;
  if (!bay.node?.(T)) {
    bay.addNode({ id: T, kind: 'engine', label });
    bay.addNode({ id: B, kind: 'person', label: 'transport buttons' });
  }
  bay.addPort({ id: `${T}:value-in`, label: 'play, seek, rate, loop', dir: 'in', medium: 'value', shape: { of: 'transport' },
    deliver: (e) => control.run(e.do, e.arg) });
  bay.addPort({ id: `${T}:value-out`, label: 'position, playing', dir: 'out', medium: 'value', shape: { of: 'transport' } });
  bay.addPort({ id: `${B}:value-out`, label: 'press', dir: 'out', medium: 'value', shape: { of: 'transport' } });
  const r = bay.link(`${B}:value-out`, `${T}:value-in`);
  if (!r.ok) throw new Error(`transportOnBay: ${r.why}`);
  return (what, arg) => bay.send(`${B}:value-out`, { of: 'transport', do: what, arg });
}

/**
 * Intersection of every declared caps.rates lattice; null when none declared (#lattice-for).
 */
export function latticeFor(deck) {
  let capsByKind = null;
  try { capsByKind = typeof deck.caps === 'function' ? deck.caps() : null; } catch { capsByKind = null; }
  const list = capsByKind && typeof capsByKind === 'object' && !Array.isArray(capsByKind)
    ? Object.values(capsByKind)
    : (deck.adapters instanceof Map ? [...deck.adapters.keys()] : Object.keys(deck.adapters || {})).map((k) => deck.caps?.(k));
  let acc = null;
  for (const c of list) {
    const r = c && Array.isArray(c.rates) ? c.rates : null;
    if (!r) continue;
    acc = acc === null ? [...r] : acc.filter((x) => r.includes(x));
  }
  return acc;
}

export function clock(ms, absolute) {
  if (absolute) return new Date(ms).toISOString().slice(11, 23);
  const neg = ms < 0; const t = Math.abs(ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const f = Math.floor(t % 1000);
  return `${neg ? '-' : ''}${m}:${String(s).padStart(2, '0')}.${String(f).padStart(3, '0')}`;
}
