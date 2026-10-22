// The relay's pure parts, no Cloudflare import, so relay-test.mjs runs them in node: the source request Väin's app
// sends, reading Icecast's answer, an MPEG-1 Layer III silent frame shaped like the station's, and the pacer that
// sends station frames at real time and fills a gap in them with silence. why: lessons/edgecast.md#relay
import { frameAt } from '../cast/mp3.mjs';

/** The request head, byte for byte what workers/cast/container/server.mjs sourceHead sends, as Latin-1 bytes. */
export function sourceHead({ mount, pw }) {
  const lines = [`PUT /${mount} HTTP/1.0`, `Authorization: Basic ${btoa(`source:${pw}`)}`, 'Content-Type: audio/mpeg',
    'ice-name: Väin', 'ice-description: Mixed by positron.studio', 'ice-genre: archive', `ice-url: ${mount}`, 'ice-audio-info: send_notification=0;save_stream=0', '', ''];
  return latin1(lines.join('\r\n'));
}

/** Latin-1 bytes: Icecast reads header bytes as Latin-1, so UTF-8 "Väin" would arrive as "VÃ¤in". */
export function latin1(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c > 255) throw new Error(`not Latin-1: ${s[i]}`); b[i] = c; }
  return b;
}

/**
 * Icecast's first line, read as the cast does: on air only on ` 200`. Answers `{ ok, code, line, why }`;
 * `why` is a state name the relay reports: `refused-auth` (401), `refused-in-use` (403, Väin's own app or a stale
 * source of ours), `refused` (anything else). null until a whole line has arrived.
 */
export function readStatus(text) {
  const end = text.indexOf('\r\n');
  if (end < 0) return text.length > 4096 ? { ok: false, code: 0, line: text.slice(0, 80), why: 'refused' } : null;
  const line = text.slice(0, end), code = Number((line.match(/^\S+ (\d{3})/) || [])[1]) || 0;
  if (line.includes(' 200')) return { ok: true, code: 200, line, why: null };
  return { ok: false, code, line, why: code === 401 ? 'refused-auth' : code === 403 ? 'refused-in-use' : 'refused' };
}

/** The bitrate table frameAt reads, for the inverse lookup. */
const KBPS1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], RATES1 = [44100, 48000, 32000];

/**
 * A silent frame: the header of `like` (or MPEG-1 Layer III 44.1 kHz 128 kbit/s joint stereo), no CRC, no padding,
 * and every other byte zero. Zero side info is part2_3_length 0 in every granule, which a decoder plays as silence.
 */
export function silentFrame(like = null) {
  let h;
  if (like && frameAt(like, 0)) h = [like[0], like[1] | 1, like[2] & ~0x02, like[3]];
  else h = [0xff, 0xfb, (KBPS1.indexOf(128) << 4) | (RATES1.indexOf(44100) << 2), 0x44];
  const f = frameAt(Uint8Array.from(h), 0);
  if (!f) throw new Error('silentFrame: not a frame header');
  const data = new Uint8Array(f.bytes);
  data.set(h);
  return { data, seconds: f.seconds, rate: f.rate, kbps: f.kbps, silent: true };
}

/**
 * The pacer. `push(frame)` queues a station frame; `take(nowMs)` answers the frames due now, in order, keeping the
 * mount LEAD_S ahead of the wall. When the queue runs dry and the lead falls under FILL_S, silence goes out instead,
 * so Icecast (source-timeout 10 s) never sees the source go quiet. After a gap the station is let back only once
 * RESUME_S is queued, or its 0.5 s posts arrive just in time and every late one is a 50 ms hole. `restart(nowMs)` starts the clock again after a
 * reconnect: what was queued is older than the new clock and is dropped down to LEAD_S.
 */
export function createPacer({ leadS = 1, fillS = 0.25, resumeS = 1, maxQueueS = 8, now = () => Date.now() } = {}) {
  const q = [];
  let qS = 0, t0 = null, sentS = 0, like = null, silent = null, gap = null;
  const st = { stationFrames: 0, stationS: 0, silentFrames: 0, silentS: 0, droppedS: 0, gaps: [], bytes: 0 };
  const drop = (keepS) => { while (qS > keepS && q.length) { const f = q.shift(); qS -= f.seconds; st.droppedS += f.seconds; } };
  return {
    st,
    get queuedS() { return +qS.toFixed(3); },
    get sentS() { return sentS; },
    get filling() { return !!gap; },
    push(f) {
      q.push(f); qS += f.seconds;
      if (!like || (like[2] & ~2) !== (f.data[2] & ~2) || like[3] !== f.data[3]) { like = f.data.slice(0, 4); silent = null; }
      if (qS > maxQueueS) drop(maxQueueS);
    },
    restart(t = now()) { t0 = t; sentS = 0; drop(leadS); },
    take(t = now()) {
      if (t0 == null) t0 = t;
      const wallS = (t - t0) / 1000, out = [];
      while (sentS < wallS + leadS) {
        let f = gap && qS < resumeS ? null : q.shift();
        if (f) {
          qS -= f.seconds;
          if (gap) { st.gaps.push({ at: new Date(gap.at).toISOString(), s: +gap.s.toFixed(3) }); if (st.gaps.length > 200) st.gaps.shift(); gap = null; }
          st.stationFrames++; st.stationS += f.seconds;
        } else if (sentS < wallS + fillS) {
          silent ||= silentFrame(like);
          f = silent;
          gap ||= { at: t, s: 0 };
          gap.s += f.seconds; st.silentFrames++; st.silentS += f.seconds;
        } else break;
        sentS += f.seconds; st.bytes += f.data.length;
        out.push(f);
      }
      return out;
    },
  };
}

/** Frames into one write. */
export function concat(frames) {
  let n = 0;
  for (const f of frames) n += f.data.length;
  const b = new Uint8Array(n);
  let o = 0;
  for (const f of frames) { b.set(f.data, o); o += f.data.length; }
  return b;
}
