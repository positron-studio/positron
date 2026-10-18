// demo/radio/cast/local.mjs: a station's SOUND played in this browser, free and off air. The tuner is
// /radio/scenery/'s graph (createTunerGraph), the drift clock is the cast container's, the grains are the
// page's ring on wasm scsynth. Nothing is made until start(). why: lessons/workers-cast.md#local
import { createMix, createTunerGraph, pinkNoise, handTurn, WHISTLE_SOFT } from '../../shell/tuner-mix.mjs';
import { createRingEngine, PATCHES, valuesOf, DEFAULTS as RING_DEFAULTS, RING_SECONDS } from '../../granulator/grain-ring.mjs';

// The container's numbers (workers/cast/container/mixer.mjs, grain-patch.mjs); workers/cast/local-test.mjs goes red if they differ.
export const SR = 44100;
export const SLOTS = [{ at: 0.46, echo: 0.09 }, { at: 0.54, echo: 0.13 }];
export const DEFAULTS = { tune: SLOTS[0].at, drift: 1, dwell: 40, blend: 16, noise: 1 };
export const LIMITS = { tune: [0, 1], drift: [0, 1], dwell: [5, 600], blend: [2, 120], noise: [0, 2] };
export const PATCH_LIMITS = { freeze: [0, 1], speed: [0, 4], back: [0, RING_SECONDS - 0.5], density: [0.5, 64], scatter: [0, 1],
  size: [0.02, 4], jitter: [0, 4], pitch: [0.25, 4], detune: [0, 0.1], pan: [0, 1], amp: [0, 3], tone: [200, 20000], echo: [0, 0.9],
  time: [0.01, 1.5], dark: [200, 20000], drop: [0, 1], ramp: [0.05, 4], dir: [-1, 1], lock: [0, 1], mix: [0, 1] };
export const MODES = ['copy', 'mix', 'grains'];
// The cast's whistle is WHISTLE_SOFT, and the needle crosses a blend by handTurn. why: lessons/workers-cast.md#whistle
export const WHISTLE = true;
const PREFETCH_S = 6;
// Each file is levelled to one loudness before the tuner by its feed item's `gain`, as the container does.
// why: lessons/workers-cast.md#level
export const GAIN_DB = [-14, 12];
/** The linear factor for an item's `gain`; 1 when it has none. */
export function levelOf(gain) {
  const x = Number(gain);
  return gain == null || !Number.isFinite(x) ? 1 : 10 ** (Math.min(GAIN_DB[1], Math.max(GAIN_DB[0], x)) / 20);
}

/** One mix control clamped as the container clamps it, or null. */
export function clampSet(name, v) {
  const lim = LIMITS[name], x = Number(v);
  if (!lim || !Number.isFinite(x)) return null;
  const c = Math.min(lim[1], Math.max(lim[0], x));
  return name === 'drift' ? (c >= 0.5 ? 1 : 0) : c;
}

/** A patch by name (filled from DEFAULTS) then `set` on top, each clamped, as grain-patch.mjs does. */
export function clampPatch({ name, set = {} } = {}) {
  const out = {}, refused = [];
  let base = null;
  if (name != null) { base = PATCHES.find((p) => p.name === name); if (!base) refused.push(`patch ${name}`); else Object.assign(out, valuesOf(base)); }
  for (const [k, v] of Object.entries(set || {})) {
    const lim = PATCH_LIMITS[k], x = Number(v);
    if (!lim || !Number.isFinite(x)) { refused.push(k); continue; }
    out[k] = k === 'dir' ? (x < 0 ? -1 : 1) : Math.min(lim[1], Math.max(lim[0], x));
  }
  return { values: out, patch: base?.name ?? null, refused };
}


/**
 * `fileUrl(item)` is where a file is read from (it must send CORS). `start({ queue, mode, set, patch })` plays;
 * `mode`, `set`, `patch`, `queue` and `next` change it while it plays, each heard at once.
 */
export function createLocal({ fileUrl, log = () => {} } = {}) {
  const ctl = { ...DEFAULTS };
  const g = { patch: PATCHES[0].name, values: { ...RING_DEFAULTS, ...valuesOf(PATCHES[0]) }, mix: 1 };
  const mix = createMix(SLOTS, WHISTLE_SOFT);
  let mode = 'mix', ctx = null, graph = null, master = null, analyser = null, gates = null, toGrains = null, noise = null;
  let engine = null, eng = null, booting = null, grains = 0;
  let items = [], nextIdx = 0, pending = null, playing = false, timer = 0;
  let from = 0, cycleFrom = 0, phase = 'off', k = 0, tune = ctl.tune, m = mix(tune), landings = 0;
  const slots = SLOTS.map(() => ({ item: null, el: null, src: null }));
  const now = () => ctx.currentTime;

  function build() {
    ctx = new AudioContext({ sampleRate: SR });
    graph = createTunerGraph(ctx, SLOTS);
    master = ctx.createGain();
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
    master.connect(analyser); analyser.connect(ctx.destination);
    // three gates into the master, one open per mode; the tuner always feeds the ring's input
    gates = { copy: ctx.createGain(), mix: ctx.createGain(), grains: ctx.createGain() };
    for (const x of Object.values(gates)) { x.gain.value = 0; x.connect(master); }
    graph.out.connect(gates.mix);
    toGrains = ctx.createGain(); graph.out.connect(toGrains);
    noise = ctx.createBufferSource(); noise.buffer = pinkNoise(ctx); noise.loop = true; noise.connect(graph.noiseIn); noise.start();
    // each slot: what it plays reaches its tuner leg through its level, and in copy mode the master straight, unlevelled
    // as the container's frame copier is
    slots.forEach((s, j) => {
      s.bus = ctx.createGain(); s.level = ctx.createGain(); s.bus.connect(s.level); s.level.connect(graph.legs[j].input);
      s.copy = ctx.createGain(); s.copy.gain.value = 0; s.bus.connect(s.copy); s.copy.connect(gates.copy);
    });
  }

  function open(item) {
    const el = new Audio();
    el.crossOrigin = 'anonymous'; el.preload = 'auto';
    el.src = fileUrl(item);
    const src = ctx.createMediaElementSource(el);
    el.addEventListener('error', () => log(`${item.title} did not load`, 'warn'));
    return { item, el, src };
  }
  function close(x) { if (!x?.el) return; x.el.pause(); x.el.removeAttribute('src'); x.el.load(); try { x.src.disconnect(); } catch { /* gone */ } }
  function place(j, p) {
    const s = slots[j];
    close(s); s.item = s.el = s.src = null;
    if (!p) return;
    Object.assign(s, p);
    s.level.gain.value = levelOf(p.item.gain);
    s.src.connect(s.bus);
    s.el.play().catch(() => { /* the error event says why */ });
    log(`slot ${'ab'[j]}: ${p.item.title}`);
  }
  const peekNext = () => (items.length ? items[nextIdx % items.length] : null);
  function take() { const it = peekNext(); if (it) nextIdx = (nextIdx + 1) % items.length; return it; }
  function prefetch() { if (!pending) { const it = take(); if (it) pending = open(it); } }
  function arrive(j) { if (!pending) prefetch(); if (pending) { place(j, pending); pending = null; } }
  const ended = (j) => !slots[j].el || slots[j].el.ended;

  // The container's clock (mixer.mjs createEngine), in this context's audio seconds.
  function clock() {
    const to = 1 - from, preroll = Math.min(ctl.dwell / 2, 4);
    if (mode === 'copy') {
      // files whole, one after another, in the slot on air
      if (slots[to].item) place(to, null);
      if (!slots[from].item || ended(from)) arrive(from);
      phase = 'copy'; k = 0; cycleFrom = now(); tune = SLOTS[from].at; return;
    }
    if (!ctl.drift) {
      for (let j = 0; j < slots.length; j++) if (!slots[j].item || ended(j)) arrive(j);
      phase = 'held'; k = 0; tune = ctl.tune; return;
    }
    let t = now() - cycleFrom;
    if (t < ctl.dwell && slots[from].item && ended(from)) { cycleFrom = now() - ctl.dwell; t = ctl.dwell; }
    if (t >= ctl.dwell - preroll - PREFETCH_S && !slots[to].item) prefetch();
    if (t >= ctl.dwell - preroll && !slots[to].item) arrive(to);
    if (t < ctl.dwell) { phase = 'dwell'; k = 0; tune = SLOTS[from].at; return; }
    if (t < ctl.dwell + ctl.blend) { phase = 'blend'; k = (t - ctl.dwell) / ctl.blend; tune = SLOTS[from].at + (SLOTS[to].at - SLOTS[from].at) * handTurn(k); return; }
    tune = SLOTS[to].at;
    place(from, null);
    from = to; cycleFrom = now(); phase = 'dwell'; k = 0; landings++;
    log(`landed on slot ${'ab'[to]}: ${slots[to].item?.title ?? 'nothing'}`);
  }
  function tick() {
    if (!playing) return;
    clock();
    m = mix(tune);
    graph.apply({ ...m, noise: m.noise * ctl.noise }, { whistle: WHISTLE });
  }
  function route() {
    if (!ctx) return;
    const t = now(), on = (x) => (playing ? x : 0);
    gates.copy.gain.setTargetAtTime(on(mode === 'copy' ? 1 : 0), t, 0.005);
    gates.mix.gain.setTargetAtTime(on(mode === 'mix' || (mode === 'grains' && !eng) ? 1 : 0), t, 0.005);
    gates.grains.gain.setTargetAtTime(on(mode === 'grains' && eng ? 1 : 0), t, 0.005);
    slots.forEach((s, j) => s.copy.gain.setTargetAtTime(j === from ? 1 : 0, t, 0.005));
    if (eng) engine.run(playing && mode === 'grains');
    if (playing && mode === 'grains' && !eng) bootGrains();
  }
  function bootGrains() {
    engine ||= createRingEngine({ log });
    booting ||= engine.boot({ ctx, input: toGrains, log, grain: () => { grains++; } }).then((r) => {
      r.out.gain.value = 1; r.out.connect(gates.grains);
      engine.fixed(g.values); engine.knob('mix', g.mix); engine.fresh(); engine.land();
      eng = r; route();
    }, (e) => { booting = null; log(`the granulator did not come up: ${e?.message || e}`, 'bad'); });
    return booting;
  }

  const api = {
    get ctx() { return ctx; },
    get analyser() { return analyser; },
    nodes: () => ({ master, tuner: graph?.out, grains: eng?.out ?? null, gates }),
    get playing() { return playing; },
    /** Plays `queue` (`{ id, title, gain }`, gain in dB from the feed) with the station's stored sound; resolves when the first file can play. */
    async start({ queue = [], mode: md, set = {}, patch } = {}) {
      if (playing) api.stop();
      if (!ctx) build();
      await ctx.resume().catch(() => { /* a press resumes it */ });
      if (MODES.includes(md)) mode = md;
      for (const [n, v] of Object.entries(set || {})) { const c = clampSet(n, v); if (c !== null) ctl[n] = c; }
      if (patch) api.patch(patch);
      items = queue.slice(); nextIdx = 0;
      playing = true; from = 0; landings = 0;
      arrive(0);
      // the clock starts when the first file can play, as the container's ready()
      const el = slots[0].el;
      if (el) await new Promise((r) => { if (el.readyState >= 3) return r(); const done = () => { clearTimeout(tt); r(); }; const tt = setTimeout(r, 8000); el.addEventListener('canplay', done, { once: true }); el.addEventListener('error', done, { once: true }); });
      if (!playing) return api.status();
      cycleFrom = now(); tune = ctl.drift ? SLOTS[0].at : ctl.tune;
      tick(); route();
      clearInterval(timer); timer = setInterval(tick, 20);
      return api.status();
    },
    stop() {
      if (!ctx) return;
      playing = false; phase = 'off';
      clearInterval(timer);
      for (let j = 0; j < slots.length; j++) place(j, null);
      close(pending); pending = null;
      route();
      ctx.suspend().catch(() => { /* already */ });
    },
    /** copy, mix or grains; heard on the next render quantum (grains boots once, about a second). */
    mode(md) { if (!MODES.includes(md)) return null; mode = md; if (playing) { tick(); route(); } return mode; },
    /** tune, drift, dwell, blend, noise: clamped; a hand on tune holds the dial, as on the container. */
    set(name, v) {
      const c = clampSet(name, v);
      if (c === null) return null;
      if (name === 'drift' && c && !ctl.drift && ctx) { from = m.near; cycleFrom = now(); }
      ctl[name] = c;
      if (name === 'tune') ctl.drift = 0;
      if (playing) tick();
      return c;
    },
    /** A grain patch by name and/or values; a name starts the read head again, as the container's land(). */
    patch(p = {}) {
      const c = clampPatch(p);
      if (c.values.mix != null) g.mix = c.values.mix;
      const vals = { ...c.values }; delete vals.mix;
      Object.assign(g.values, vals);
      if (c.patch) g.patch = c.patch; else if (Object.keys(vals).length) g.patch = null;
      if (eng) { engine.fixed(vals); if (c.values.mix != null) engine.knob('mix', g.mix); if (c.patch) engine.land(); }
      return c;
    },
    queue(q) { items = q.slice(); nextIdx = 0; close(pending); pending = null; },
    next() {
      if (!playing) return;
      if (mode === 'copy') arrive(from);
      else if (ctl.drift) { const t = now() - cycleFrom; if (t < ctl.dwell) cycleFrom = now() - ctl.dwell; }
      else arrive(m.near === 0 ? 1 : 0);
      tick();
    },
    status() {
      return { playing, mode, ...ctl, tune: +tune.toFixed(4), phase, k: +k.toFixed(3), from, landings,
        noiseLevel: +(m.noise * ctl.noise).toFixed(3), at: ctx ? +now().toFixed(2) : 0,
        slots: slots.map((s, j) => ({ id: s.item?.id ?? null, title: s.item?.title ?? null,
          gain: s.item ? +(20 * Math.log10(levelOf(s.item.gain))).toFixed(2) : 0, clear: +m.st[j].clear.toFixed(3),
          at: s.el ? +s.el.currentTime.toFixed(2) : 0, ended: !!s.el?.ended })),
        next: pending?.item?.title ?? peekNext()?.title ?? null,
        grains: { up: !!eng, patch: g.patch, mix: g.mix, values: { ...g.values }, heard: grains } };
    },
  };
  return api;
}
