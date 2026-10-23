// The drum machine the /drums/ pages build on: the kit's step grid, a sequencer whose GM drum
// notes (ch 10) reach each SuperCollider voice through its own filtered wire, hits scheduled
// 150 ms ahead as timestamped bundles, a closed hat choking the open one. A visit opens nothing.
// See lessons/page-drums.md#drums-9

import { el } from '/shell/shell.mjs';
import { createBay } from '/shell/bay.mjs';
import { addNodes } from '/shell/nodes.mjs';
import { createPatchbay } from '/shell/patchbay.mjs';
import { createStepGrid } from '/shell/step-grid.mjs';
import { createPanelLayout } from '/shell/panel-layout.mjs';
import { createBar, barButton } from '/shell/bar.mjs';
import { createTransportControl, transportApi, publishTransport, transportOnBay } from '/shell/transport-control.mjs';
import { playToggle, ratesView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createGlue } from '/shell/glue.mjs';
import { createStepper } from '/shell/stepper.mjs';
import { createKnob } from '/shell/knob.mjs';
import { createKnobGrid } from '/shell/knob-grid.mjs';
import { createWaveShape } from '/shell/synth-view.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { bootScsynth, loadScsynth } from '/shell/scsynth.mjs';
import { compile } from '/shell/sclang-lite.mjs';
import { LIFE } from './voices.mjs';

/**
 * `createDrumMachine(d, o)`: transport, grid, patchbay and optional knobs. A voice's `label` and
 * `title` are read on every draw; `opens` and `closes` name the choke pair (default hho, hhc).
 * @param {object} d  what `mount()` returned, for its log
 * @param {object} o
 * @param {object[]} o.voices  from `voices()` in voices.mjs, with or without knobs
 * @param {boolean} [o.patternIn]  a sequencer `value-in` taking a whole pattern,
 *   `{ of: 'pattern', rows }`; the grid is read only and empty (/drums/camera/)
 * @param {(lap: number) => void} [o.onBar]  called before each bar's first step is handed over
 * @param {(link: object, playing: boolean) => boolean} [o.flowing]  which wires the patchbay lights
 * @param {(engine: object, ctx: AudioContext) => Promise<void>} [o.onWake]  awaited once the
 *   engine and definitions are in (/drums/samples/ loads samples). Voices may bring `def`,
 *   `params` and `args()` (null skips the hit); see `paramsOf` and `hit`
 * @param {(ctx: AudioContext) => Promise<void>} [o.onStart]  awaited on every Play before the
 *   first hit (/drums/remote/ joins the Pi here)
 * @param {() => void} [o.onStop]  called on every stop
 * @param {boolean} [o.scopes]  one scope per drum, `web:scope-<drum>` (/drums/knobs/)
 * @param {number | (() => number)} [o.ahead]  ms each hit is handed over early, read every
 *   tick; 150 by default
 * @param {() => AudioContext} [o.context]  the page's own context; left out, one is made
 * @param {{ node: string, label: string }} [o.mix]  the drums go into `web:<node>`, not the
 *   speakers; the page routes `api.mixOut()`. Left out, the node is `web:speaker`
 * @param {{ rows: number, steps: number }} [o.shape]  rows (the first n voices) and steps, 16
 *   by default; `api.setShape` lands at the next loop. Other rows stay loaded
 * @param {(shape: {rows: number, steps: number}) => void} [o.onShape]  called as a new shape
 *   lands, before its first step is read
 * @param {boolean} [o.start]  false: the grid starts empty, not four on the floor
 * @param {(rows: number) => number} [o.gain]  the mix's level for this many rows; left out,
 *   it follows how many drums there are in all
 * @param {(ev: object) => void} [o.sequence]  where the grid's notes go instead of the
 *   sequencer wires
 * @param {(ev: object) => void} [o.onValue]  what reaches `sequencer:value-in` when it is not a
 *   pattern wire (/devices/drums/'s keys, which edit the grid)
 * @param {(voice: object) => boolean} [o.silent]  a row this tab will not sound; its lit pads stay grey
 * @param {(nodeId: string) => boolean} [o.hide]  nodes the patchbay leaves out, with their ports and
 *   wires; read on every draw
 * @param {() => boolean} [o.local]  false: Play runs the grid's clock and boots no SuperCollider
 *   (/devices/drums/ when the Circuit on the Pi plays the notes)
 * @param {{ over: number, node: string, label: (rows: number) => string }} [o.group]  above
 *   `over` rows the patchbay draws them as one box; the picture only, each hit keeps its wire
 * @returns {{ surface: HTMLElement, knobs: ?HTMLElement, scopes: ?HTMLElement[], patchbay: HTMLElement, api: object }}
 * See lessons/page-drums.md#drums-10
 */
export function createDrumMachine(d, { voices, patternIn = false, onBar = null, flowing = null, scopes: wantScopes = false, onWake = null,
  onStart = null, onStop = null, ahead = 150, context = null, mix = null, shape: shapeOpt = null, onShape = null,
  start: startPattern = true, gain = null, group = null, sequence = null, onValue = null, silent = null, local = () => true, hide = null }) {
  const S = 'web';
  const ID = (node, port) => `${S}:${node}:${port}`;
  const SEQ = ID('sequencer', 'midi-out');
  const OUT = mix ? mix.node : 'speaker';
  const SPK = ID(OUT, 'audio-in');

  // The tempo and the bar: 120 bpm, four steps a beat, a 125 ms step and a 2 s bar, looped.
  // The tempo is the bar's `- bpm +` stepper (the kit's `createStepper`), 60 to 180 in fives.
  // See lessons/page-drums.md#drums-11
  const BPM_AT_START = 120, BPM_MIN = 60, BPM_MAX = 180, BPM_STEP = 5;
  let STEPS = shapeOpt?.steps ?? 16;
  const stepMsAt = (b) => 60000 / (b * 4);
  let bpm = BPM_AT_START;
  const BAR = STEPS * stepMsAt(BPM_AT_START);
  const TICK = 25;                           // look every 25 ms
  const aheadMs = () => (typeof ahead === 'function' ? ahead() : ahead);   // hand each hit over this early, 150 by default

  const ALL = voices;
  /** The drums that are rows now: the first `shape.rows` of `voices`. */
  let VOICES = ALL.slice(0, shapeOpt?.rows ?? ALL.length);
  /**
   * A voice's knobs: `v.params` (a list) or `v.param` (one), each `{ name, value, min, max, unit }`
   * plus optional `control`, `label`, `sub`, `toArg(x)` and `life: true` (how long a hit rings,
   * which the choke window follows). `name` is the bay node's, so unique on the page.
   * See lessons/page-drums.md#drums-12
   */
  const paramsOf = (v) => v.params ?? (v.param ? [v.param] : []);
  const KNOBS = ALL.filter((v) => paramsOf(v).length);

  // Each drum on a stereo pair of its own (busses 2i, 2i+1), so a drum's `audio-out` wire and its
  // scope are real. Over sixteen drums (a worklet carries at most 32 channels in Chrome) all play
  // on 0 and 1 and a drum's wire is honoured at the hit instead.
  // See lessons/page-drums.md#drums-13
  const SPLIT = 2 * ALL.length <= 32;
  const BUS = new Map(ALL.map((v, i) => [v.key, SPLIT ? 2 * i : 0]));
  // A voice may bring its definition as bytes (`v.def`, rhythm/020's
  // `drumsample`, written with synthdef.mjs); it then takes its pair as `out`.
  const compiled = new Map(ALL.map((v) => {
    if (v.def) return [v.key, { ok: true, bytes: v.def }];
    const r = compile(v.program, { name: v.name, bus: BUS.get(v.key) });
    if (!r.ok) throw new Error(`${v.label} did not compile: ${r.message}`);
    return [v.key, r];
  }));

  // ── the engine, booted on the first play ─────────────────────────────────
  let ctx = null, eng = null, waking = null, junction = null, an = null, buf = null;
  /** key -> the drum's own stereo signal, and its scope's analyser */
  const outs = new Map(), scopeAn = new Map();
  let nextId = 3000;
  const stat = { bootMs: null, loadMs: null, started: {}, ended: {}, chokes: 0, fails: 0 };
  for (const v of ALL) { stat.started[v.key] = 0; stat.ended[v.key] = 0; }
  const nodeVoice = new Map();               // node id -> voice key, until its /n_end
  let openHat = null;                        // { id, until } the open hat that may still be ringing
  /** Each voice's knob value, sent with every hit of that voice. */
  const values = new Map(KNOBS.map((v) => [v.key, new Map(paramsOf(v).map((p) => [p.name, p.value]))]));
  let paramSends = 0;

  function heard(m) {
    if (m[0] === '/n_end') {
      const k = nodeVoice.get(m[1]);
      if (k) { stat.ended[k]++; nodeVoice.delete(m[1]); }
      return true;
    }
    if (m[0] === '/fail') { stat.fails++; d.log(`SuperCollider: ${m.slice(1).join(' ')}`, 'warn'); }
    return false;
  }

  function wake() {
    if (eng) return Promise.resolve(eng);
    waking ??= (async () => {
      const e = await bootScsynth({ audioContext: ctx, log: d.log, onReply: heard,
        scsynthOptions: { numOutputBusChannels: SPLIT ? 2 * ALL.length : 2, numInputBusChannels: 2 } });
      stat.bootMs = Math.round(e.bootMs);
      // The engine's sound goes where the bay says, so it comes off the speakers here. A silent
      // branch to the destination stays: an engine nobody pulls never answers /d_recv.
      // See lessons/page-drums.md#drums-14
      e.out.disconnect();
      const pull = ctx.createGain(); pull.gain.value = 0; pull.connect(ctx.destination);
      e.out.connect(pull);
      // Eight channels in, one stereo pair per drum out.
      const split = SPLIT ? ctx.createChannelSplitter(2 * ALL.length) : null;
      if (split) e.out.connect(split);
      stat.channels = e.out.channelCount;
      if (!SPLIT) outs.set('*', e.out);
      (SPLIT ? ALL : []).forEach((v, i) => {
        const pair = ctx.createChannelMerger(2);
        split.connect(pair, 2 * i, 0);
        split.connect(pair, 2 * i + 1, 1);
        outs.set(v.key, pair);
        if (wantScopes) {
          // 32768 samples (0.68 s at 48 kHz) holds the longest window, 500 ms,
          // plus the output latency and the 30 ms the capture waits.
          const a = ctx.createAnalyser(); a.fftSize = 32768;
          // An analyser is pulled through a silent branch, as `an` is below.
          const z = ctx.createGain(); z.gain.value = 0; a.connect(z); z.connect(ctx.destination);
          scopeAn.set(v.key, { an: a, buf: new Float32Array(a.fftSize) });
          views[i].listen(a);
        }
      });
      junction = ctx.createGain();
      // Eight drums at once (050) sum about 3 dB hotter than four, and the
      // loudest bar measured -1.5 dBFS RMS, so the mix comes down to 0.7 there.
      // Eighteen (050 at 2x) come down to 0.5.
      junction.gain.value = levelFor();
      if (!mix) junction.connect(ctx.destination);
      an = ctx.createAnalyser(); an.fftSize = 1024; buf = new Float32Array(an.fftSize);
      junction.connect(an);
      route();
      const t = performance.now();
      const sent = new Set();
      for (const v of ALL) {
        if (sent.has(v.name)) continue;   // one definition several rows share goes once
        sent.add(v.name);
        const got = await e.sendAndWait((m) => (m[0] === '/done' || m[0] === '/fail') && m[1] === '/d_recv', 5000,
          '/d_recv', compiled.get(v.key).bytes);
        if (!got || got[0] !== '/done') throw new Error(`SuperCollider did not take ${v.label}`);
      }
      if (onWake) await onWake(e, ctx);
      stat.loadMs = Math.round(performance.now() - t);
      d.log(`SuperCollider booted in ${stat.bootMs} ms and took the ${ALL.length} drums in ${stat.loadMs} ms`);
      eng = e;
      return e;
    })().catch((err) => { waking = null; d.log(`SuperCollider did not start: ${err?.message || err}`, 'bad'); throw err; });
    return waking;
  }

  /** THE ROUTER: each drum's pair goes where its `audio-out` wires say. */
  function route() {
    if (!SPLIT) {
      // One mix: it reaches the speakers whole, and each drum's wire is read at the hit.
      const o = outs.get('*');
      if (o) { try { o.disconnect(); } catch { /* not connected */ } o.connect(junction); }
      return;
    }
    for (const v of ALL) {
      const o = outs.get(v.key);
      if (!o) continue;
      try { o.disconnect(); } catch { /* not connected */ }
      for (const l of bay.links()) {
        if (l.from !== ID(v.key, 'audio-out')) continue;
        if (l.to === SPK) o.connect(junction);
        if (l.to === ID(`scope-${v.key}`, 'audio-in') && scopeAn.get(v.key)) o.connect(scopeAn.get(v.key).an);
      }
    }
  }

  /** The mix's level: the page's, for the rows there are now, or by how many drums there are in all. */
  const levelFor = () => (gain ? gain(VOICES.length) : ALL.length > 9 ? 0.5 : ALL.length > 4 ? 0.7 : 1);
  /** Which rows are an open hat and the closed hat that chokes it. */
  const opens = (v) => (v.opens ?? v.key === 'hho');
  const closes = (v) => (v.closes ?? v.key === 'hhc');

  /** One hit, at `at` on performance.now()'s clock, as a timestamped bundle. */
  /** Whether a drum's sound has a wire to the speakers (read at the hit when the outputs are not split). */
  const wired = (key) => bay.links().some((l) => l.from === ID(key, 'audio-out') && l.to === SPK);

  function hit(v, at) {
    if (!eng) return;
    if (!SPLIT && !wired(v.key)) return;
    const id = nextId++;
    if (closes(v) && openHat && at < openHat.until) {
      // The choke, in the same bundle time as the closed hat itself.
      eng.sendAt(at, '/n_set', openHat.id, 'gate', 0);
      stat.chokes++;
      openHat = null;
    }
    // A knob's value goes in the hit's own bundle, so the hit sounds with the
    // value the knob had when it was handed over.
    const args = [];
    let life = LIFE[v.key] ?? 0.5;
    for (const p of paramsOf(v)) {
      const x = values.get(v.key).get(p.name);
      args.push(p.control ?? p.name, p.toArg ? p.toArg(x) : x);
      if (p.life) life = x;
    }
    if (v.def) args.push('out', BUS.get(v.key));
    if (v.args) { const more = v.args(); if (!more) return; args.push(...more); }   // null: nothing to play (no sample yet)
    eng.sendAt(at, '/s_new', v.name, id, 0, 0, ...args);
    nodeVoice.set(id, v.key);
    stat.started[v.key]++;
    if (opens(v)) openHat = { id, until: at + life * 1000 };
  }

  // ── the bay ──────────────────────────────────────────────────────────────
  // The shapes are demo/shell/nodes.mjs's; the labels and what arrives are
  // this file's. Every port keeps its own `node:port` as its label (portLabel).
  const bay = createBay();
  const heardBy = {};
  const names = ['sequencer'], deliver = {}, ports = {};
  for (const v of ALL) {
    heardBy[v.key] = 0;
    names.push({ name: 'drum', as: v.key, label: `${v.label}, SuperCollider` });
    deliver[`${v.key}:midi-in`] = (e) => { if (e.d1 !== v.note || !e.d2) return; heardBy[v.key]++; hit(v, e.at); };
  }
  names.push(mix ? { name: 'mix', as: OUT, label: mix.label } : 'speaker');
  if (wantScopes) for (const v of ALL) {
    const sc = `scope-${v.key}`;
    names.push({ name: 'scope', as: sc });
    // What starts a trace arrives on a wire too: the drum's own note, filtered
    // the same way, so the scope triggers on exactly the hits its drum plays.
    deliver[`${sc}:midi-in`] = (e) => {
      if (e.d1 !== v.note || !e.d2) return;
      if (!bay.links().some((l) => l.from === ID(v.key, 'audio-out') && l.to === ID(sc, 'audio-in'))) return;
      views?.[ALL.indexOf(v)].trigger(e.at);
    };
  }
  // A knob per drum, each a node of its own with a value wire into its voice.
  for (const v of KNOBS) {
    const pnames = paramsOf(v).map((p) => p.name);
    for (const p of paramsOf(v)) {
      names.push({ name: 'knob', as: `knob-${p.name}`, label: `${v.label} ${p.label ?? p.name}` });
    }
    ports[`${v.key}:value-in`] = { shape: { of: 'param', names: pnames } };
    deliver[`${v.key}:value-in`] = (e) => {
      if (e?.of !== 'param' || !pnames.includes(e.name)) return;
      values.get(v.key).set(e.name, e.v); paramSends++;
    };
  }
  // A whole pattern from a wire: every pad set to what the rows say (setPattern, below).
  if (patternIn) {
    deliver['sequencer:value-in'] = (e) => { if (e?.of === 'pattern') setPattern(e.rows); };
  } else if (onValue) deliver['sequencer:value-in'] = (e) => onValue(e);
  addNodes(bay, S, names, { deliver, ports, portLabel: 'node:port' });
  const lay = (from, to, tf = []) => { const r = bay.link(from, to, tf, { site: S }); if (!r.ok) d.log(`${from} -> ${to} refused: ${r.why}`, 'warn'); };
  for (const v of ALL) {
    lay(SEQ, ID(v.key, 'midi-in'), [{ op: 'range', lo: v.note, hi: v.note }]);
    lay(ID(v.key, 'audio-out'), SPK);
    if (wantScopes) {
      lay(ID(v.key, 'audio-out'), ID(`scope-${v.key}`, 'audio-in'));
      lay(SEQ, ID(`scope-${v.key}`, 'midi-in'), [{ op: 'range', lo: v.note, hi: v.note }]);
    }
  }
  for (const v of KNOBS) for (const p of paramsOf(v)) lay(ID(`knob-${p.name}`, 'value-out'), ID(v.key, 'value-in'));

  // ── the grid ─────────────────────────────────────────────────────────────
  // No label column: a pad's hover says its row's patch name.
  // why: lessons/page-drums.md#drums-no-column
  const panel = createPanelLayout({ side: null, flow: false, strip: { role: 'group', label: 'steps' } });
  const makeGrid = () => createStepGrid({
    strip: panel.strip, rows: VOICES.length, steps: STEPS,
    label: (r) => VOICES[r].label,
    padTitle: (r) => VOICES[r].title ?? VOICES[r].label,
    ticks: true, readOnly: patternIn,
    silent: (r) => !!silent?.(VOICES[r]),
    onToggle: (r, s, lit, why) => { if (why !== 'quiet') d.log(`${VOICES[r].label} step ${s + 1} ${lit ? 'on' : 'off'}`); },
  });
  let grid = makeGrid();
  /** A new shape: the grid is built again for it, empty, in the same panel. */
  function reshape(sh) {
    VOICES = ALL.slice(0, sh.rows);
    STEPS = sh.steps;
    grid.destroy();
    panel.strip.textContent = '';
    grid = makeGrid();
    if (playing) grid.live(true);
    if (junction) junction.gain.value = levelFor();
    api.grid = grid;
    onShape?.({ rows: sh.rows, steps: sh.steps });
    pb.refresh();
  }
  let pendingShape = null;
  // A plain four on the floor, backbeat snare, open hats on the offbeats and
  // closed hats around them, each closed hat after an open one choking it.
  const START = {
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hho: [2, 6, 10, 14],
    hhc: [0, 3, 4, 7, 8, 11, 12, 15],
  };
  if (!patternIn && startPattern) VOICES.forEach((v, r) => { for (const s of START[v.key] ?? []) grid.set(r, s, true, 'quiet'); });
  /** A whole pattern from a wire: every pad set to what the rows say. */
  let patternsIn = 0;
  function setPattern(rows) {
    for (let r = 0; r < VOICES.length; r++) for (let s = 0; s < STEPS; s++) grid.set(r, s, !!rows?.[r]?.[s], 'quiet');
    patternsIn++;
  }

  // The sequencer wakes every 25 ms and hands over what is due in the next 150. The deck carries
  // only the play state; its range is a day, because it pauses itself at its end.
  // See lessons/page-drums.md#drums-15
  const deck = createDeck({ items: [], range: [0, 24 * 3600e3] });
  let loop = null, raf = 0, t0 = 0, next = 0, playing = false, laps = 0, shown = -1;
  /** The absolute step the current loop began at, so a loop can change length at its end. */
  let loopStart = 0, loopIndex = 0;
  const stepOf = new Map();                       // absolute step -> [the step of the grid it played, which loop]
  /**
   * When each step sounds, as an anchor and a step length. A tempo change moves the anchor to the
   * first step not yet handed over; handed over hits keep their times, so nothing is doubled,
   * skipped or squeezed.
   * See lessons/page-drums.md#drums-16
   */
  let anchor = { k: 0, t: 0, ms: stepMsAt(bpm) };
  const heardAt = (k) => anchor.t + (k - anchor.k) * anchor.ms;   // performance.now() ms of absolute step k
  const handed = new Map();                       // absolute step -> the time it was handed over for
  function tick() {
    const horizon = performance.now() + aheadMs();
    while (heardAt(next) < horizon) {
      if (next - loopStart >= STEPS) {
        loopStart = next; loopIndex++;
        // A new shape lands here, at the top of a loop, before its first step is read.
        if (pendingShape) { const sh = pendingShape; pendingShape = null; reshape(sh); }
      }
      const s = next - loopStart, at = heardAt(next);
      handed.set(next, at);
      stepOf.set(next, [s, loopIndex]);
      handed.delete(next - 128); stepOf.delete(next - 128);
      next++;
      if (s === 0 && onBar) onBar(Math.floor((next - 1) / STEPS));
      if (at < performance.now()) continue;      // already gone by: never sent late
      VOICES.forEach((v, r) => {
        if (!grid.get(r, s)) return;
        const ev = { cls: 'note', ch: 10, d1: v.note, d2: 100, at, step: s };
        if (sequence) sequence(ev); else bay.send(SEQ, ev);
      });
    }
  }
  /** The playhead follows what is being HEARD, not what was handed over. */
  function frame() {
    raf = 0;
    if (!playing) return;
    const now = performance.now();
    // Walk on to the newest step whose time has come, reading the times the
    // steps were actually handed over for, so a tempo change cannot move it.
    let k = shown;
    while (handed.has(k + 1) && handed.get(k + 1) <= now) k++;
    if (k !== shown && k >= 0) {
      shown = k;
      const [s, lap] = stepOf.get(k) ?? [0, laps];
      grid.at(s);
      laps = lap;
    }
    sample(now);
    drawScopes();
    raf = requestAnimationFrame(frame);
  }
  async function start() {
    if (playing) return;
    ctx ??= context ? context() : new AudioContext({ latencyHint: 'interactive' });
    ctx.resume();
    bar.el.dataset.busy = '1';
    if (local()) { try { await wake(); } catch { delete bar.el.dataset.busy; return; } }
    if (onStart) { try { await onStart(ctx); } catch (e) { d.log(`before play: ${e.message}`, 'warn'); } }
    delete bar.el.dataset.busy;
    playing = true;
    // The first step is handed over at once, so it gets the lead the rest get:
    // 80 ms at the 150 default, and 100 more at 250 (remote/040 on the relay,
    // where a first hit 80 ms ahead would reach the Pi after its time).
    t0 = performance.now() + 80 + Math.max(0, aheadMs() - 150);
    anchor = { k: 0, t: t0, ms: stepMsAt(bpm) };
    next = 0; laps = 0; shown = -1; handed.clear(); stepOf.clear(); loopStart = 0; loopIndex = 0; openHat = null;
    grid.at(0); grid.live(true);
    deck.seek(0); deck.play();
    clearInterval(loop);
    loop = setInterval(tick, TICK);
    tick();
    raf ||= requestAnimationFrame(frame);
    pb.refresh();
  }
  async function stop() {
    playing = false;
    if (onStop) onStop();
    clearInterval(loop); loop = null;
    cancelAnimationFrame(raf); raf = 0;
    if (deck.playing()) deck.pause();
    deck.seek(0);
    grid.live(false); grid.at(0);
    openHat = null;
    if (eng) {
      // Every hit already handed over is still in a scheduler, the page's and
      // the engine's: purge clears both, then everything sounding is freed.
      try { await eng.sonic.purge(); } catch { /* an older engine */ }
      eng.send('/g_freeAll', 0);
      views?.forEach((w) => w.flat());   // the scopes go flat with the sound
    }
    pb.refresh();
  }

  // ── the tempo selector on the bar's right, and the clear button beside play ──
  const BPMS = [];
  for (let v = BPM_MIN; v <= BPM_MAX; v += BPM_STEP) BPMS.push(v);
  const tempo = createStepper({
    what: 'tempo',
    prev: () => setBpm(bpm - BPM_STEP),
    next: () => setBpm(bpm + BPM_STEP),
    pick: { options: BPMS.map((v) => `${v} bpm`), at: BPMS.indexOf(bpm), onPick: (i) => setBpm(BPMS[i]) },
  });
  function setBpm(v) {
    const was = bpm;
    bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v / BPM_STEP) * BPM_STEP));
    const i = BPMS.indexOf(bpm);
    tempo.show(`${bpm} bpm`, i >= 0 ? i : undefined);
    if (bpm === was) return;
    // From the first step not yet handed over, at the time it already had.
    if (playing) anchor = { k: next, t: heardAt(next), ms: stepMsAt(bpm) };
    d.log(`tempo ${bpm} bpm, a step is ${stepMsAt(bpm).toFixed(1)} ms`);
  }
  setBpm(bpm);
  // Clear: every pad off. Playback keeps running, so a pattern can be built
  // again from nothing while it loops.
  const clear = barButton({ icon: 'trash', aria: 'clear the grid', onPress: () => {
    let n = 0;
    for (let r = 0; r < VOICES.length; r++) for (let s = 0; s < STEPS; s++) if (grid.get(r, s)) { grid.set(r, s, false, 'quiet'); n++; }
    d.log(`cleared ${n} hits`);
  } });

  // ── the transport: the kit's bar, glued over the grid ─────────────────────
  const barHost = el('div');
  // The transport is a node on this bay: play and the keys press along a link. why: lessons/kit-bar.md#bay
  const control = createTransportControl(deck, { command: { play: () => start(), pause: () => stop() } });
  const send = transportOnBay(bay, { site: S, control });
  const bar = createBar({ start: [playToggle(control, { verb: 'stop', send }).el, ...(patternIn ? [] : [clear])],
    end: [tempo.el, ratesView(control, { send }).el] });
  barHost.append(bar.el);
  bindTransportKeys(control, { scope: bar.el, send });
  publishTransport(transportApi(control, { el: bar.el }));
  // Intent: fetch the engine from our origin, boot nothing.
  for (const ev of ['pointerenter', 'focusin', 'touchstart']) barHost.addEventListener(ev, () => loadScsynth().catch(() => {}), { once: true, passive: true });
  const surface = createGlue(barHost, panel.el);

  // ── the patchbay ─────────────────────────────────────────────────────────
  // A page that adds wires of its own (050's camera) says when those flow.
  // The patchbay shows the drums that are rows now; the others stay loaded and leave the picture.
  const offRow = (id) => { const k = id.split(':')[1]; return ALL.some((v) => v.key === k) && !VOICES.some((v) => v.key === k); };
  const filtered = {
    nodes: () => bay.nodes().filter((n) => !offRow(n.id)),
    ports: () => bay.ports().filter((p) => !offRow(p.id)),
    links: () => bay.links().filter((l) => !offRow(l.from) && !offRow(l.to)),
  };
  // With `group`: each row's box is named by its voice's label as it is now,
  // and above `over` rows the rows are drawn as one box. A row's own node and
  // ports are `web:<key>` and `web:<key>:<port>`; the scopes' are not.
  const rowOf = (id) => { const k = id.split(':')[1]; return VOICES.find((v) => v.key === k) ?? null; };
  const GID = `${S}:${group?.node ?? 'samples'}`;
  const many = () => !!group && VOICES.length > group.over;
  const toGroup = (id) => (rowOf(id) ? `${GID}:${id.split(':')[2]}` : id);
  const groupedView = {
    nodes() {
      const ns = filtered.nodes().map((n) => { const v = rowOf(n.id); return v ? { ...n, label: `${v.label}, SuperCollider` } : n; });
      if (!many()) return ns;
      const at = ns.findIndex((n) => rowOf(n.id));
      const out = ns.filter((n) => !rowOf(n.id));
      out.splice(Math.max(0, at), 0, { id: GID, kind: 'engine', label: group.label(VOICES.length), place: 'browser' });
      return out;
    },
    ports() {
      const ps = filtered.ports();
      if (!many()) return ps;
      const g = group.node;
      return [...ps.filter((p) => !rowOf(p.id)),
        { id: `${GID}:midi-in`, label: `${g}:midi-in`, dir: 'in', medium: 'midi', accepts: ['note'] },
        { id: `${GID}:audio-out`, label: `${g}:audio-out`, dir: 'out', medium: 'audio' }];
    },
    links() {
      const ls = filtered.links();
      if (!many()) return ls;
      // One wire per pair of ends, carrying the rows' traffic summed.
      const by = new Map();
      for (const l of ls) {
        const from = toGroup(l.from), to = toGroup(l.to);
        if (from === l.from && to === l.to) { by.set(l.id, l); continue; }
        const k = `${from}>${to}`, was = by.get(k);
        if (was) { was.sent += l.sent || 0; continue; }
        by.set(k, { ...l, id: `g-${k}`, from, to, transforms: [], sent: l.sent || 0 });
      }
      return [...by.values()];
    },
  };
  const base = group ? groupedView : SPLIT && !shapeOpt ? bay : filtered;
  const nodeOf = (id) => id.split(':').slice(0, 2).join(':');
  const view = !hide ? base : {
    nodes: () => base.nodes().filter((n) => !hide(n.id)),
    ports: () => base.ports().filter((p) => !hide(nodeOf(p.id))),
    links: () => base.links().filter((l) => !hide(nodeOf(l.from)) && !hide(nodeOf(l.to))),
  };
  const pb = createPatchbay(view, { flowing: (l) => (flowing ? flowing(l, playing) : playing) });

  // ── the knobs, one row, each sending on its own wire ─────────────────────
  let knobs = null, knobGrid = null;
  if (KNOBS.length) {
    knobs = new Map(KNOBS.flatMap((v) => paramsOf(v).map((p) => {
      const knob = createKnob({
        label: p.label ?? p.name, sub: p.sub ?? '', min: p.min, max: p.max, value: p.value, hand: true,
        ...(p.step ? { step: p.step } : {}),
        onInput: (x) => bay.send(ID(`knob-${p.name}`, 'value-out'), { of: 'param', name: p.name, v: x }),
      });
      knob.el.dataset.param = p.name;
      knob.el.title = `${v.label} ${p.label ?? p.name}, ${p.min} to ${p.max} ${p.unit}`;
      return [p.name, knob];
    })));
    knobGrid = createKnobGrid(knobs, { row: true });
  }

  // ── the scopes, one per drum, each fed by that drum's own wire ───────────
  /** Each scope's loudness over the last frames, for a check that one drum
   *  is on its own scope and nowhere else. */
  const scopeLevels = new Map(ALL.map((v) => [v.key, []]));
  /**
   * Triggered, held scopes: each takes its drum's window from the hit's onset and holds it until
   * the next hit, the previous trace faint beneath (`createWaveShape({ mode: 'triggered' })`).
   * Label and span are fixed strings, so nothing changes size on redraw.
   * See lessons/page-drums.md#drums-17
   */
  const WINDOW = { kick: 250, snare: 200, hho: 500, hhc: 80 };
  // The analyser exists only once the engine is up, so it is handed over then (`listen`).
  const views = wantScopes ? ALL.map((v) => createWaveShape({ reason: null, colour: '--hi', height: 90, name: v.label,
    axes: { x: `${WINDOW[v.key]} ms` }, mode: 'triggered', window: WINDOW[v.key], fade: 1, full: 0.6 })) : null;
  /** Each scope's own loudness, measured per frame, for a check that one drum
   *  is on its own scope and nowhere else. Not drawn. */
  function drawScopes() {
    if (!views) return;
    ALL.forEach((v) => {
      const s = scopeAn.get(v.key);
      if (!s) return;
      s.an.getFloatTimeDomainData(s.buf);
      // The newest 2048 samples: the buffer holds 0.68 s, and its old end
      // would still hold a hit from before the last stop.
      let sum = 0;
      for (let i = s.buf.length - 2048; i < s.buf.length; i++) sum += s.buf[i] * s.buf[i];
      const L = scopeLevels.get(v.key);
      L.push({ t: performance.now(), rms: Math.sqrt(sum / 2048) });
      if (L.length > 600) L.splice(0, L.length - 600);
    });
  }

  // ── the level, for a check that wants to know a hit was HEARD ─────────────
  // A short history of the mix's loudness against performance.now(), shifted
  // by the output latency, so a window of time can be asked what it held.
  const levels = [];
  function sample(now) {
    if (!an) return;
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    const late = ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000;
    // Zero crossings per second, a rough pitch or brightness, for the knob checks.
    let zc = 0;
    for (let i = 1; i < buf.length; i++) if ((buf[i - 1] < 0) !== (buf[i] < 0)) zc++;
    levels.push({ t: now + late, rms: Math.sqrt(s / buf.length), zc: zc * ctx.sampleRate / buf.length });
    if (levels.length > 2400) levels.splice(0, levels.length - 2400);
  }

  addEventListener('pagehide', () => { stop(); ctx?.close(); });

  const api = {
    bay, grid, deck, bar, stat, heardBy, levels, compiled, values, knobs, knobGrid,
    BAR, tempo, clear, setBpm,
    /** The drums that are rows now (every one of `voices` unless a shape says fewer). */
    get VOICES() { return VOICES; },
    ALL,
    paramSends: () => paramSends, patternsIn: () => patternsIn, refresh: () => pb.refresh(),
    scopeLevels, route, views,
    /** A drum's own stereo signal (its output pair), once the engine is up. */
    outOf: (key) => outs.get(key) ?? null,
    /** With `mix`: the drums' sum, once the engine is up, for the page to route. */
    mixOut: () => junction,
    aheadMs,
    bpm: () => bpm, stepMs: () => stepMsAt(bpm),
    /** When absolute step k was handed over to sound, on performance.now()'s clock. */
    stepTime: (k) => handed.get(k),
    playing: () => playing, laps: () => laps, t0: () => t0, shown: () => shown,
    ctx: () => ctx, engine: () => eng,
    /** The mix's loudness right now, read off the analyser, 0 before the first play. */
    level: () => { if (!an) return 0; an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); },
    start, stop,
    /** One note into the voices as if the sequencer had sent it, along its own wires (a hit only once the engine is up). */
    play: (ev) => bay.send(SEQ, { at: performance.now(), ...ev }),
    /** Bring the engine up without starting the sequencer: the context, scsynth and the definitions. */
    boot() { ctx ??= context ? context() : new AudioContext({ latencyHint: 'interactive' }); ctx.resume(); return wake(); },
    /** The shape now, and a new one: at once when stopped, at the top of the next loop when playing. */
    shape: () => ({ rows: VOICES.length, steps: STEPS }),
    /** `fresh`: build the grid again, empty, even when the shape is the same (a new kit). */
    setShape(sh, { fresh = false } = {}) {
      if (!fresh && sh.rows === VOICES.length && sh.steps === STEPS) { pendingShape = null; return; }
      if (playing) pendingShape = sh; else reshape(sh);
    },
    pendingShape: () => pendingShape,
  };
  return { surface, knobs: knobGrid?.el ?? null, scopes: views ? views.map((w) => w.el) : null, patchbay: pb.el, api };
}
