// The station with no Cloudflare import, so node can run it (station-test.mjs): radio1965's program from the cast,
// live.gen.mjs (live.mjs) driving station-grains.mjs, and the MP3 frames it makes, paced on a wall clock.
// `pump(now)` renders up to LEAD_S ahead of the wall and answers what it did; the object calls it from its alarm, and
// `fresh()` every FRESH_EVERY_MS. The playlist rules are the Caster's own, workers/cast/program.mjs.
import { configureEngine } from './station-grains.mjs';
import { configureSources } from './source.mjs';
import { createDecoderPool } from './codec.mjs';
import { startLive } from './live.gen.mjs';
import { T } from './vclock.mjs';
import { tasteOf, fileWeight } from '../../demo/radio/cast/life.mjs';
import { pickBy, longOnly, resolveIds, freshLook, goneFrom, freshQueue, FRESH_EVERY_MS } from '../cast/program.mjs';

export const CAST = 'https://cast.positron.studio';
/** The cast station whose stored program this one plays. */
export const PROGRAM_OF = 'radio1965';
/** How far ahead of the wall the station renders, the most it renders in one pump, and the lag at which it skips. */
export const LEAD_S = 2, MAX_PUMP_S = 6, SKIP_S = 8, BURST_S = 2;
export { FRESH_EVERY_MS };

const json = async (f, url) => { const r = await f(url); if (!r.ok) throw new Error(`${url} answered ${r.status}`); return r.json(); };
/** The cast's feed (gains, kinds, moments and seconds already on each), each file through the cast's own file pass. */
export async function loadFeed(f = fetch) {
  return ((await json(f, `${CAST}/feed`)).items || []).map((x) => ({ ...x, url: `${CAST}/file/${encodeURIComponent(x.id)}` }));
}

/**
 * The program as the Caster starts radio1965: its stored program (ids resolved through the feed, in its order), or
 * when that is empty the whole feed shuffled by the votes; files under MIN_FILE_S left out while longer ones exist.
 */
export async function loadProgram({ fetch: f = fetch, rand = Math.random, of = PROGRAM_OF } = {}) {
  const [items, votes, st] = await Promise.all([loadFeed(f), json(f, `${CAST}/votes`).catch(() => ({ votes: [] })), json(f, `${CAST}/status/${of}`).catch(() => null)]);
  const vs = (votes.votes || []).filter((v) => v.vote && v.def).slice(-2000).map(({ def, vote, file }) => ({ def, vote, file }));
  const ids = (st?.program || []).map((x) => x.id), prog = resolveIds(ids, items), fs = tasteOf(vs).file;
  const list = prog.length ? prog : pickBy(items, (t) => fileWeight(fs[t]), Infinity, rand);
  return { queue: longOnly(list), votes: vs,
    program: { of, source: prog.length ? `${of}'s program` : `the feed shuffled by the votes (${of}'s program ${st ? 'is empty' : 'did not answer'})`, stored: ids.length, found: prog.length } };
}

let poolP = null;
/** One station. `onFrame(frame)` gets every whole MP3 frame; `log(line)` the driver's lines. */
export async function createStation({ wasmModule, glue, lameModule, mpgModule, fetch: f = (u, o) => fetch(u, o), seed, queue, votes = [], program = null, log = () => {}, onFrame = () => {}, now = () => Date.now() }) {
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
  // what plays from here on, as the Caster keeps want.queue: the program, then what the feed checks made of it
  let list = queue.slice();
  const curId = () => { const s = live.status(); return s.slots?.[s.from]?.id ?? null; };
  return {
    live, st, pool,
    get queue() { return list; },
    /**
     * One feed check with the Caster's rules (program.mjs): new files next, newest first; gone files out of what is to
     * come (the one playing finishes); a quiet hour brings a recent arrival round. `prev` is the kept state, answered
     * back to keep. Its last outcome is in status().fresh.
     */
    async fresh(prev, startedAt) {
      const items = await loadFeed(f), cur = curId(), t = now();
      const look = freshLook(prev, items, { startedAt, cur, now: t });
      const out = { at: new Date(t).toISOString(), feed: items.length, added: [], gone: [], did: look.baseline ? `the first look: ${items.length} files in the feed, none of them new` : 'nothing new' };
      if (!look.baseline) {
        const gone = goneFrom(list, look.ids);
        if (look.add.length || gone.length) {
          const q = longOnly(freshQueue(list, look.add, look.ids, cur));
          if (q.length) { list = q; live.queue(q); }
          out.added = look.add.map((x) => x.title); out.gone = gone.map((x) => x.title);
          out.did = [out.added.length && `${look.why}: ${out.added.join(', ')}`, out.gone.length && `left the archive, out of the queue: ${out.gone.join(', ')}`].filter(Boolean).join('; ');
          say(out.did);
        }
      }
      st.fresh = out;
      return look.st;
    },
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
        pumps: st.pumps, maxPumpS: +st.maxPumpS.toFixed(2), file: s.slots?.[s.from]?.title ?? null, fileId: s.slots?.[s.from]?.id ?? null, phase: s.phase, next: s.next ?? null,
        program: program ? { ...program, files: list.length } : null, fresh: st.fresh ?? null,
        scene: s.life ? { si: s.life.si, inst: s.life.inst, patch: s.life.patch, param: s.life.param, kind: s.life.kind, wet: s.life.wet, file: s.life.file, phase: s.life.phase,
          at: s.life.at, dwell: s.life.dwell, blend: s.life.blend, level: s.life.level, ghost: s.life.ghost, layersUp: s.life.layersUp, counts: s.life.counts,
          fx: [s.life.def?.fx, s.life.def?.fx2].filter(Boolean), type: s.life.def?.type ?? null, iKind: s.life.def?.iKind ?? null,
          layers: s.life.layers ? (({ drone, res, harm, ghost }) => ({ drone, res, harm, ghost }))(s.life.layers) : null } : null,
        out: s.grains?.out ?? null, quanta: s.grains?.quanta, grains: s.grains?.grains,
        memory: { scsynth: h?.chain?.memoryBytes?.() ?? null, mpg123: pool.memoryBytes, mpg123Handles: pool.handles, lame: h?.encoder?.memoryBytes ?? null },
        errors: st.errors.slice(-5), lines: st.lines.slice(-12) };
    },
    stop() { try { live.stop(); } catch (e) { fail(e); } T.reset(); },
  };
}
// startGrains' own handle (render, ready), which live.gen.mjs passes out as __g
const grains = (live) => live.__g;
