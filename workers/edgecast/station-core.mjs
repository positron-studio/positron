// The station with no Cloudflare import, so node can run it (station-test.mjs): the program from the cast's feed,
// live.gen.mjs (live.mjs) driving station-grains.mjs, and the MP3 frames it makes, paced on a wall clock.
// `pump(now)` renders up to LEAD_S ahead of the wall and answers what it did; the object calls it from its alarm.
import { configureEngine } from './station-grains.mjs';
import { configureSources } from './source.mjs';
import { createDecoderPool } from './codec.mjs';
import { startLive } from './live.gen.mjs';
import { T } from './vclock.mjs';
import { tasteOf, fileWeight } from '../../demo/radio/cast/life.mjs';

export const CAST = 'https://cast.positron.studio';
/** How far ahead of the wall the station renders, the most it renders in one pump, and the lag at which it skips. */
export const LEAD_S = 2, MAX_PUMP_S = 6, SKIP_S = 8, BURST_S = 2, MIN_FILE_S = 40;

/** The cast worker's pickFiles: each file weighted by the votes on it, none at weight 0, a plain shuffle with none. */
export function pickFiles(items, votes, rand = Math.random) {
  const fs = tasteOf(votes).file, pool = items.map((x) => ({ x, w: fileWeight(fs[x.title]) })).filter((p) => p.w > 0);
  if (pool.every((p) => p.w === 1)) { for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } return pool.map((p) => p.x); }
  return pool.map((p) => ({ ...p, k: rand() ** (1 / p.w) })).sort((a, b) => b.k - a.k).map((p) => p.x);
}

/** The program as the Caster makes it: the feed (gains, kinds, moments already on it), files under 40 s left out while longer ones exist. */
export async function loadProgram({ fetch: f = fetch, rand = Math.random } = {}) {
  const [feed, votes] = await Promise.all([f(`${CAST}/feed`).then((r) => r.json()), f(`${CAST}/votes`).then((r) => r.json()).catch(() => ({ votes: [] }))]);
  const vs = (votes.votes || []).filter((v) => v.vote && v.def).slice(-2000).map(({ def, vote, file }) => ({ def, vote, file }));
  let items = (feed.items || []).map((x) => ({ ...x, url: `${CAST}/file/${encodeURIComponent(x.id)}` }));
  const long = items.filter((x) => !(Number(x.seconds) > 0 && Number(x.seconds) < MIN_FILE_S));
  if (long.length) items = long;
  return { queue: pickFiles(items, vs, rand), votes: vs };
}

let poolP = null;
/** One station. `onFrame(frame)` gets every whole MP3 frame; `log(line)` the driver's lines. */
export async function createStation({ wasmModule, glue, lameModule, mpgModule, fetch: f = (u, o) => fetch(u, o), seed, queue, votes = [], log = () => {}, onFrame = () => {}, now = () => Date.now() }) {
  poolP ||= createDecoderPool(mpgModule);
  const pool = await poolP;
  configureEngine({ wasmModule, glue, lameModule });
  configureSources({ pool, fetch: f, log });
  T.reset();
  const st = { startedAt: now(), wall0: null, late: 0, lateMaxS: 0, skips: 0, skippedS: 0, pumps: 0, madeS: 0, maxPumpS: 0, errors: [], lines: [] };
  let live = null;
  const at = () => (live?.__g?.engine.seconds ?? 0).toFixed(1);
  const say = (l) => { st.lines.push(`${new Date(now()).toISOString().slice(11, 19)} ${at()} ${l}`); if (st.lines.length > 60) st.lines.shift(); log(`${at()} ${l}`); };
  const fail = (e) => { const s = String(e && e.stack || e).slice(0, 400); st.errors.push(s); if (st.errors.length > 20) st.errors.shift(); log(`error: ${s}`); };
  const burst = [];
  let burstS = 0;
  live = startLive({ queue, target: 'edgecast', life: { seed, votes } }, { say, fail, onMp3: (fr) => {
    burst.push(fr); burstS += fr.seconds;
    while (burstS > BURST_S && burst.length > 1) burstS -= burst.shift().seconds;
    onFrame(fr);
  } });
  return {
    live, st, pool,
    /** The frames of the last BURST_S seconds, what a new listener is given first. */
    burst: () => burst.slice(),
    get ready() { return !!grains(live)?.ready; },
    /**
     * Renders what the wall is owed: up to LEAD_S ahead, at most MAX_PUMP_S in one pump. A lag past SKIP_S moves the
     * wall on rather than bursting, and is counted.
     */
    async pump() {
      const h = grains(live);
      if (!h?.ready) return { made: 0, ready: false };
      const t = now();
      if (st.wall0 == null) st.wall0 = t - h.engine.seconds * 1000;
      let wallS = (t - st.wall0) / 1000;
      const lag = wallS - h.engine.seconds;
      if (lag > 0) { st.late++; st.lateMaxS = Math.max(st.lateMaxS, lag); }
      if (lag > SKIP_S) { st.skips++; st.skippedS += lag; st.wall0 += lag * 1000; wallS -= lag; say(`behind by ${lag.toFixed(1)} s: the wall moved on`); }
      const want = Math.min(MAX_PUMP_S, wallS + LEAD_S - h.engine.seconds);
      const made = want > 0.02 ? await h.render(want) : 0;
      st.pumps++; st.madeS += made; st.maxPumpS = Math.max(st.maxPumpS, made);
      return { made, lead: +(h.engine.seconds - wallS).toFixed(3), wallS };
    },
    status() {
      const h = grains(live), s = live.status(), t = now();
      const wallS = st.wall0 == null ? 0 : (t - st.wall0) / 1000;
      return { ready: !!h?.ready, seconds: s.seconds, mp3Seconds: s.mp3Seconds, lead: h?.ready ? +(h.engine.seconds - wallS).toFixed(3) : null,
        underruns: { decoderSamples: s.underruns, late: st.late, lateMaxS: +st.lateMaxS.toFixed(3), skips: st.skips, skippedS: +st.skippedS.toFixed(2) },
        pumps: st.pumps, maxPumpS: +st.maxPumpS.toFixed(2), file: s.slots?.[s.from]?.title ?? null, phase: s.phase,
        scene: s.life ? { si: s.life.si, patch: s.life.patch, param: s.life.param, kind: s.life.kind, wet: s.life.wet, file: s.life.file, dwell: s.life.dwell, level: s.life.level, ghost: s.life.ghost, layersUp: s.life.layersUp, counts: s.life.counts } : null,
        out: s.grains?.out ?? null, quanta: s.grains?.quanta, grains: s.grains?.grains,
        memory: { scsynth: h?.chain?.memoryBytes?.() ?? null, mpg123: pool.memoryBytes, mpg123Handles: pool.handles, lame: h?.encoder?.memoryBytes ?? null },
        errors: st.errors.slice(-5), lines: st.lines.slice(-12) };
    },
    stop() { try { live.stop(); } catch (e) { fail(e); } T.reset(); },
  };
}
// startGrains' own handle (render, ready), which live.gen.mjs passes out as __g
const grains = (live) => live.__g;
