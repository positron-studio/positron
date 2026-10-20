// The relay with no Cloudflare import, so relay-test.mjs drives it on a fake clock and a fake Icecast: it holds one
// source on the mount, takes the station's MP3 bytes from push(), sends them at real time from tick(), fills any gap
// with silence, reconnects a dropped source, and stops at its cap. why: lessons/edgecast.md#relay
import { createFramer } from '../cast/mp3.mjs';
import { createPacer, concat } from './icecast.mjs';

/** Retry delays after a source fails; Väin's app and the cast's /go retry every 100 ms at first. */
export const BACKOFF_MS = [100, 100, 100, 250, 500, 1000, 2000, 5000];
/** A 403 (mount in use) is retried this often for this long: Icecast lets go of a dead source of ours in seconds. */
export const IN_USE_RETRY_MS = 5000, IN_USE_GIVE_UP_MS = 60000;
/** No push for this long and the station is reported gone (silence is already going out by then). */
export const STATION_GONE_MS = 3000;

export function createRelay({ openSink, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, leadS, fillS, maxQueueS } = {}) {
  const pacer = createPacer({ leadS, fillS, maxQueueS, now });
  const framer = createFramer();
  const st = { state: 'off', why: null, until: null, startedAt: null, onAirAt: null, connects: 0, drops: [], refusals: [], pushes: 0, stationBytes: 0,
    lastPushAt: null, writes: 0, writeBytes: 0, stationReturns: 0, lines: [] };
  let sink = null, wanted = false, writing = false, gen = 0, stationUp = false;
  const say = (l) => { const line = `${new Date(now()).toISOString().slice(11, 23)} ${l}`; st.lines.push(line); if (st.lines.length > 40) st.lines.shift(); log(line); };

  async function connect(reason) {
    const my = ++gen, t0 = now();
    st.state = reason ? 'reconnecting' : 'connecting';
    for (let i = 0; wanted && my === gen; i++) {
      try {
        const s = await openSink();
        if (!wanted || my !== gen) { s.close(); return; }
        sink = s; st.connects++; st.state = 'on-air'; st.why = null; st.onAirAt = now();
        pacer.restart(now());
        say(reason ? `back on air after ${((now() - t0) / 1000).toFixed(2)} s (${reason})` : 'on air');
        s.closed.then((why) => {
          if (sink !== s) return;
          sink = null;
          st.drops.push({ at: new Date(now()).toISOString(), why });
          if (st.drops.length > 50) st.drops.shift();
          say(`the source dropped: ${why}`);
          if (wanted) connect(why);
        });
        return;
      } catch (e) {
        const why = e.why || 'refused';
        st.refusals.push({ at: new Date(now()).toISOString(), why, msg: String(e.message).slice(0, 160) });
        if (st.refusals.length > 50) st.refusals.shift();
        if (why === 'refused-auth' || why === 'unconfigured') { st.state = why; st.why = e.message; say(`refused, not retrying: ${e.message}`); return; }
        if (why === 'refused-in-use') {
          if (now() - t0 >= IN_USE_GIVE_UP_MS) { st.state = why; st.why = e.message; say(`the mount stayed in use for ${IN_USE_GIVE_UP_MS / 1000} s: giving up`); return; }
          st.why = e.message; await sleep(IN_USE_RETRY_MS); continue;
        }
        st.why = e.message;
        await sleep(BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)]);
      }
    }
  }

  return {
    st, pacer,
    get onAir() { return !!sink; },
    get wanted() { return wanted; },
    /** Takes the mount until `until` (epoch ms). */
    start(until) {
      if (wanted) return;
      wanted = true; st.until = until; st.startedAt = now(); st.why = null;
      say(`start, until ${new Date(until).toISOString().slice(11, 19)}`);
      connect(null);
    },
    stop(why = 'stopped') {
      wanted = false; gen++;
      const s = sink; sink = null; s?.close();
      st.state = 'off'; st.why = why;
      say(`stopped: ${why}`);
    },
    /** The station's bytes, whole frames or not; the framer keeps a partial frame for the next push. */
    push(bytes) {
      const t = now();
      if (!stationUp && st.lastPushAt != null) { st.stationReturns++; say(`the station is back after ${((t - st.lastPushAt) / 1000).toFixed(1)} s`); }
      stationUp = true;
      st.pushes++; st.stationBytes += bytes.length; st.lastPushAt = t;
      for (const f of framer.push(bytes, true)) pacer.push(f);
    },
    /** Called every ~100 ms: the cap, the station's absence, and the frames due now. */
    async tick() {
      const t = now();
      if (wanted && st.until && t >= st.until) { this.stop('the cap'); return; }
      if (stationUp && st.lastPushAt != null && t - st.lastPushAt > STATION_GONE_MS) { stationUp = false; say('the station went quiet: silence goes out'); }
      if (!sink || writing) return;
      const frames = pacer.take(t);
      if (!frames.length) return;
      writing = true;
      const s = sink, b = concat(frames);
      try { if (await s.write(b)) { st.writes++; st.writeBytes += b.length; } } finally { writing = false; }
    },
    status() {
      const p = pacer.st, t = now();
      return { state: st.state, why: st.why, until: st.until ? new Date(st.until).toISOString() : null,
        onAirS: st.onAirAt && sink ? +((t - st.onAirAt) / 1000).toFixed(1) : 0, connects: st.connects, drops: st.drops, refusals: st.refusals.slice(-10),
        station: { up: stationUp, pushes: st.pushes, bytes: st.stationBytes, lastPushAgoS: st.lastPushAt ? +((t - st.lastPushAt) / 1000).toFixed(2) : null, returns: st.stationReturns, skipped: framer.skipped },
        sent: { writes: st.writes, bytes: st.writeBytes, sentS: +pacer.sentS.toFixed(2), queuedS: pacer.queuedS, filling: pacer.filling,
          stationFrames: p.stationFrames, stationS: +p.stationS.toFixed(2), silentFrames: p.silentFrames, silentS: +p.silentS.toFixed(2), droppedS: +p.droppedS.toFixed(2), gaps: p.gaps.slice(-20) },
        lines: st.lines.slice(-20) };
    },
  };
}
