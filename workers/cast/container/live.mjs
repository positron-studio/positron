// The cast's live mode: the page's life (life.mjs) and layers (layers.mjs) driving the grains chain, on
// air. The same driver as demo/radio/cast/index.html's lifeTick, on the mix clock (engine seconds) instead
// of the page's performance.now(). why: lessons/workers-cast.md#live-container
import { startGrains } from './grains.mjs';
import { openDecoder } from './decode.mjs';
import { levelOf, SR } from './mixer.mjs';
import { createLife, fromT, DWELL_NOISE, patchFor, freezesAfterDry } from './sc/radio/cast/life.mjs';
/** What the engine is handed for a scene's patch: a cast patch becomes its base plus its values; the scene's own set wins, a patch's lock stays. */
const engPatch = (name, set = {}) => { const p = patchFor(name); return { name: p.name, set: { ...p.set, ...set, ...(p.set.lock ? { lock: 1 } : {}) } }; };
import { createLayerEngine, euclid, stepSeconds, layerLevel, sceneLevel, blendLevel, pitchClass, KEY_FROM, KEY_HZ, ghostGap } from './sc/radio/cast/layers.mjs';
import { createSoften } from './sc/radio/cast/soften.mjs';

export const TICK_MS = 50, CHROMA_N = 8192, ONSET_N = 1024, RING_NODE = 4000;

/** A scene's controls set aside its patch, as values (the page's tweaksOf). */
export const tweaksOf = (s) => Object.fromEntries(Object.entries(s.tweak || {}).map(([n, t]) => [n, fromT(n, t)]));
/** The ring's grains on the beat when the scene's pulse is on the grains. */
export const lockOf = (s) => (s.layers?.bpm && s.layers.pulseOn === 'grains' ? 1 : 0);

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr0 = Math.cos(ang), wi0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = t;
      }
    }
  }
}

/**
 * The page's key, heard: an AnalyserNode's spectrum (fftSize 8192, Blackman, smoothing 0.8, |X| / N) read once a
 * tick, each bin from 60 to 1000 Hz added to its pitch class. `add(frame)` one read; `root()` the strongest class.
 */
export function createChroma({ sr = SR, n = CHROMA_N } = {}) {
  const win = Float64Array.from({ length: n }, (_, i) => 0.42 - 0.5 * Math.cos(2 * Math.PI * i / n) + 0.08 * Math.cos(4 * Math.PI * i / n));
  const re = new Float64Array(n), im = new Float64Array(n), sm = new Float64Array(n / 2), acc = new Float64Array(12);
  const hzPer = sr / n, lo = Math.ceil(KEY_HZ[0] / hzPer), hi = Math.min(n / 2, KEY_HZ[1] / hzPer);
  const pc = Array.from({ length: n / 2 }, (_, i) => (i ? pitchClass(i * hzPer) : 0));
  return {
    acc,
    reset() { acc.fill(0); sm.fill(0); },
    add(frame) {
      for (let i = 0; i < n; i++) { re[i] = (frame[i] || 0) * win[i]; im[i] = 0; }
      fft(re, im);
      for (let i = 0; i < n / 2; i++) sm[i] = 0.8 * sm[i] + 0.2 * Math.hypot(re[i], im[i]) / n;
      for (let i = lo; i < hi; i++) acc[pc[i]] += sm[i];
    },
    root() { const m = Math.max(...acc); return m > 0 ? acc.indexOf(m) : null; },
  };
}

/**
 * Live on air: `{ queue, target, life: { seed, votes }, set }`. Returns startGrains' handle plus `step(by)` and
 * `status().life`. `decoder(item, { from })` opens a file (openDecoder); `rand` moves the ghosts.
 */
export function startLive({ queue, target, life: lo = {}, set = {}, resume = null, hold = false }, { openSink, say = () => {}, fail = () => {}, onMp3 = null, decoder = null, rand = Math.random } = {}) {
  const seed = Number.isFinite(+lo.seed) ? Math.round(+lo.seed) : (Math.random() * 2 ** 31) | 0;
  const votes = (Array.isArray(lo.votes) ? lo.votes : []).filter((v) => v && v.def && v.vote);
  const life = createLife({ seed, votes });
  const open = decoder || ((it, o) => openDecoder(it, { log: say, ...o }));
  // a twin rebuilds the life's scenes as the station made them (each file's kind, each key it heard), so scene `si`
  // is the station's to the bit. why: lessons/workers-cast.md#handover
  const hist = Array.isArray(resume?.hist) ? resume.hist : [];
  for (let k = 0; k < hist.length; k++) { const s = life.scene(k, { kind: hist[k]?.kind || undefined, soft: !!hist[k]?.soft }); if (hist[k]?.key?.heard) s.key = { ...hist[k].key }; }
  const si0 = resume && Number.isInteger(resume.si) && resume.si >= 0 ? resume.si : 0;
  const s0 = life.scene(si0, { kind: queue[0]?.kind || undefined, soft: !!queue[0]?.soften });
  const L = { land: -1, si: si0, sceneAt: 0, blendAt: 0, phase: '', patch: '', inst: '', file: '', item: null, prevItem: null, want: null, now: null, level: 0 };
  const ghost = { next: 0, until: 0, stopAt: 0, src: null, item: null, level: 1, soften: null };
  const counts = { pulses: 0, onsets: 0, ghosts: 0, keys: 0, chains: 0 };
  const recent = new Float32Array(CHROMA_N), chroma = createChroma(), onset = { avg: 0, last: 0 };
  let w = 0, layers = null, pulseTimer = 0, pulseStep = 0, stopped = false;

  function closeGhost() { try { ghost.src?.close(); } catch { /* gone */ } ghost.src = null; ghost.item = null; ghost.stopAt = 0; }
  function readGhost(n) {
    if (!ghost.src) return null;
    const x = ghost.src.read(n);
    if (ghost.level !== 1) for (let i = 0; i < n; i++) x[i] *= ghost.level;
    ghost.soften?.process(x);
    return x;
  }
  const g = startGrains({ queue, target, set: { ...set, drift: 1, dwell: s0.dwell, blend: s0.blend, noise: DWELL_NOISE },
    patch: engPatch(s0.patch, { mix: 0, ...tweaksOf(s0), lock: lockOf(s0) }), resume, hold },
  { openSink, say, fail, onMp3, inputs: 4, ghost: readGhost,
    onBlock(mono) { for (let i = 0; i < mono.length; i++) { recent[w] = mono[i]; w = (w + 1) % CHROMA_N; } },
    async onChain(chain) {
      layers = null; counts.chains++;
      const sc = { send: chain.send, sendAndWait: (test, ms, address, ...args) => chain.ask((m) => test([m.address, ...m.args]), ms, address, ...args).then((m) => m && [m.address, ...m.args]) };
      const e = await createLayerEngine(sc, { log: say });
      if (chain.dead || stopped) return;
      layers = e;
      if (L.land >= 0) { const s = life.scene(L.si); layers.apply(s.layers, s.key); layers.level(L.level); }
    } });
  const e = g.engine;
  /** The last `n` samples the tuner made, oldest first. */
  const last = (n) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = recent[(w - n + i + CHROMA_N) % CHROMA_N]; return o; };

  function beat() { const ch = g.chain; if (!ch || ch.dead) return; ch.send('/n_set', RING_NODE, 'beat', 1); setTimeout(() => ch.send('/n_set', RING_NODE, 'beat', 0), 15); }
  // a euclidean pattern at the scene's tempo, on the wall clock as the page's setTimeout is
  function pulse(Ly) {
    clearTimeout(pulseTimer); pulseTimer = 0;
    if (!Ly?.bpm || Ly.pulseOn === 'onsets') return;
    const [k, n] = Ly.pattern, hits = euclid(k, n), dt = stepSeconds(Ly.bpm, n) * 1000;
    const go = () => {
      if (stopped) return;
      if (hits[pulseStep++ % n]) { counts.pulses++; if (Ly.pulseOn === 'res') layers?.hit((dt / 1000) * 1.5); else beat(); }
      pulseTimer = setTimeout(go, dt);
    };
    go();
  }
  function layersFor(s, t) {
    chroma.reset(); L.keyDone = false;
    ghost.next = t + ghostGap(s.layers, L.item?.seconds) * 0.5; ghost.until = 0; closeGhost();
    if (layers) { layers.apply(s.layers, s.key); layers.level(0); layers.ghost(false); }
    pulse(s.layers);
  }
  function layerTick(st, t) {
    const s = life.scene(L.si), since = t - L.sceneAt;
    L.level = st.phase === 'blend' ? blendLevel(L.now?.bridge) : sceneLevel(since / s.dwell, s);
    layers?.level(L.level);
    if (L.keyDone) return;
    if (since >= KEY_FROM[0] && since < KEY_FROM[1]) chroma.add(last(CHROMA_N));
    else if (since >= KEY_FROM[1]) {
      L.keyDone = true;
      const root = chroma.root();
      if (root != null) { s.key = { ...s.key, root, heard: true }; counts.keys++; layers?.apply(s.layers, s.key); }
    }
  }
  // a ghost: the next file in the queue, or the one before, from somewhere inside it, for a few seconds
  function ghostTick(t) {
    if (ghost.stopAt && !ghost.until && t >= ghost.stopAt) closeGhost();
    const Ly = layers?.layers;
    if (!Ly || Ly.ghost === 'none' || (!ghost.until && layerLevel((t - L.sceneAt) / (life.scene(L.si).dwell || 1), life.scene(L.si).dry, life.scene(L.si).rise, life.scene(L.si).hold) < 0.5)) return;
    if (ghost.until && t >= ghost.until) { layers.ghost(false); ghost.until = 0; ghost.stopAt = t + 2.5; ghost.next = t + ghostGap(Ly, L.item?.seconds) * (0.7 + 0.6 * rand()); }
    else if (!ghost.until && t >= ghost.next) {
      const nx = e.nextItem, who = Ly.ghostSide === 'prev' && L.prevItem ? L.prevItem : (nx && nx.title !== L.file ? nx : L.prevItem);
      if (!who) { ghost.next = t + 10; return; }
      const at = 20 + rand() * 180, from = Math.min(at, Math.max(0, (who.seconds || at) - 15));
      closeGhost();
      ghost.src = open(who, { from }); ghost.item = who; ghost.level = levelOf(who.gain); ghost.soften = who.soften ? createSoften(SR) : null;
      layers.ghost(true); ghost.until = t + Ly.ghostLen; counts.ghosts++;
      say(`a ghost: ${who.title} from ${Math.round(from)} s`);
    }
  }
  // the speech's own onsets, off the tuner, struck when that sound reaches scsynth
  function onsetTick() {
    const Ly = layers?.layers;
    if (!Ly?.bpm || Ly.pulseOn !== 'onsets') return;
    const x = last(ONSET_N);
    let s2 = 0; for (const v of x) s2 += v * v;
    const r = Math.sqrt(s2 / ONSET_N), now = Date.now();
    if (r > 0.01 && r > onset.avg * 1.6 && now - onset.last > 120) {
      onset.last = now; counts.onsets++;
      const late = Math.max(0, (e.seconds - g.heard()) * 1000);
      setTimeout(() => layers?.hit(0.25), late);
    }
    onset.avg = onset.avg * 0.9 + r * 0.1;
  }
  function tick() {
    if (stopped) return;
    // a twin's scene starts where the station's was, once align() has set the clock
    if (resume?.wall && !e.frames) return;
    try {
      const st = e.status(), t = e.seconds;
      if (st.landings !== L.land) {
        const first = L.land === -1;
        L.si = first ? si0 : L.want ?? L.si + 1; L.want = null;
        L.land = st.landings; L.sceneAt = e.cycleFrom; L.inst = first && resume?.inst ? resume.inst : `${Date.now().toString(36)}-${L.si}`;
        L.prevItem = L.item; L.item = e.onItem; L.file = L.item?.title || '';
        const s = life.scene(L.si, { kind: L.item?.kind || undefined, soft: !!L.item?.soften });
        e.set('dwell', s.dwell); e.set('blend', s.blend); e.set('noise', DWELL_NOISE); e.set('path', s.iPath ?? 0);
        // a frozen patch stays open until the scene's dry share is over
        g.patch(engPatch(s.patch, { mix: 0, ...tweaksOf(s), lock: lockOf(s), ...(s.set || {}), ...(freezesAfterDry(s.patch) ? { freeze: 0 } : {}) })); L.patch = s.patch; L.bridged = '';
        layersFor(s, t);
        if (first && resume && s.key?.heard) L.keyDone = true;
        say(`scene ${L.si}: ${s.patch}, ${s.param}, ${s.len} on ${L.file}`);
      }
      // a twin's settle moves the clock under the first scene: the scene moves with it
      if (resume?.wall && L.land === 0 && !g.aligned && st.phase === 'dwell') L.sceneAt = e.cycleFrom;
      ghostTick(t); onsetTick(); layerTick(st, t);
      if (st.phase === 'blend' && L.phase !== 'blend') {
        const s = life.scene(L.si);
        L.blendAt = e.cycleFrom + e.ctl.dwell; e.set('noise', s.iNoise);
      }
      L.phase = st.phase;
      L.at = st.phase === 'blend' ? t - L.blendAt : t - L.sceneAt;
      const v = st.phase === 'blend' ? life.inInterlude(L.si, L.at) : life.inScene(L.si, L.at);
      if (v.patch !== L.patch) { L.patch = v.patch; g.patch(engPatch(v.patch, { mix: 0 })); }
      g.patch({ set: { [v.param]: v.value, mix: v.wet, ...v.extra } });
      // a bridge holds some layers across the blend and retunes them to the next scene's key from halfway
      if (v.bridge && layers) { const bk = `${L.si}|${v.bridge.key?.root}|${v.bridge.key?.minor}`; if (bk !== L.bridged) { L.bridged = bk; layers.apply(v.bridge.layers, v.bridge.key); } }
      L.now = v;
    } catch (err) { fail(err); }
  }
  const timer = setInterval(tick, TICK_MS);

  return {
    engine: e, heard: g.heard, set: g.set, queue: g.queue, next: g.next, patch: g.patch, go: g.go,
    get chain() { return g.chain; },
    get layers() { return layers; },
    /** Previous (-1) or next (1) scene: the transition starts now and the asked scene lands with the next file. */
    step(by) {
      if (L.land < 0 || L.want != null) return false;
      L.want = Math.max(0, L.si + (by < 0 ? -1 : 1));
      e.next(); return true;
    },
    /** For a test: a tick now, rather than on the timer. */
    tick,
    stop() { stopped = true; clearInterval(timer); clearTimeout(pulseTimer); closeGhost(); layers?.stop(); g.stop(); },
    /**
     * Where the station is, as what scsynth hears now: the file and second on air, the seconds into its dwell, the
     * scene and the life's past. `safeS`: seconds of dwell left before the blend. why: lessons/workers-cast.md#handover
     */
    handoff() {
      const x = g.status(), back = Math.max(0, x.clockBacklog ?? x.backlog ?? 0), on = x.slots[x.from], s = L.land >= 0 ? life.scene(L.si) : null;
      if (!s || !on?.id) return null;
      const made = Array.from({ length: L.si + 1 }, (_, k) => { const sc = life.scene(k); return { kind: sc.kind, soft: !!sc.soft, key: sc.key }; });
      const left = Number.isFinite(on.seconds) ? on.seconds - on.played - x.blend - 1 : Infinity;
      return { id: on.id, title: on.title, pos: +(on.played - back).toFixed(3), cycleT: +(x.cycleT - back).toFixed(3), wall: Date.now(),
        si: L.si, inst: L.inst, hist: made, def: life.defOf(s), phase: x.phase, safeS: x.phase === 'dwell' ? +Math.min(x.dwell - x.cycleT, left).toFixed(1) : 0, seed };
    },
    status() {
      const x = g.status(), v = L.now, s = L.land >= 0 ? life.scene(L.si) : null;
      return { ...x, mode: 'live',
        life: v && s ? { si: L.si, inst: L.inst, def: life.defOf(s), phase: L.phase, kind: v.kind, patch: v.patch, param: v.param,
          value: v.value, wet: v.wet, len: v.len, layers: s.layers, key: s.key, from: s.from ?? null,
          file: L.file, at: L.at, sceneAt: L.sceneAt, dwell: s.dwell, blend: s.blend,
          level: +L.level.toFixed(3), ghost: ghost.item?.title ?? null, want: L.want, seed, votes: votes.length, layersUp: !!layers, counts: { ...counts } } : null };
    },
  };
}
