// One slot's source for the station: decode.mjs's shape (`{ read(n), ended, buffered, underrun, close(), error }`)
// with no ffmpeg. The file comes from cast.positron.studio/file/<id> (our edge cache), mpg123 decodes it in wasm,
// a mono file plays at unity in both channels as UPMIX does, and anything not 44.1 kHz is resampled (cubic).
// Decoding happens inside read(), so its CPU lands in the render that asked for it; the fetch only reads ahead.
import { frameAt, id3Length } from '../cast/mp3.mjs';

export const SR = 44100;
const RAW_AHEAD_S = 8, DECODE_BYTES = 8192;
const ctx = { pool: null, fetch: (u, o) => fetch(u, o), log: () => {} };
/** The station hands the sources its mpg123 pool and its fetch once. */
export function configureSources(c) { Object.assign(ctx, c); }
const kbpsSeen = new Map();

/** What mp3 bytes say about themselves at the first frame that is followed by another: `{ rate, kbps, mono }` or null. */
function sniff(b) {
  for (let i = id3Length(b); i + 4 < b.length; i++) {
    const f = frameAt(b, i);
    if (f && frameAt(b, i + f.bytes)) return { rate: f.rate, kbps: f.kbps, mono: (b[i + 3] >> 6) === 3 };
  }
  return null;
}

/** A streaming cubic (Catmull-Rom) resampler from `from` Hz to SR. */
function createResampler(from) {
  const step = from / SR;
  let h = [0, 0, 0, 0], t = 0;   // h: the last four input samples, t: position after h[1]
  return (x) => {
    if (from === SR) return x;
    const out = new Float32Array(Math.ceil((x.length + 2) / step));
    let o = 0, i = 0;
    for (; i < x.length; i++) {
      h = [h[1], h[2], h[3], x[i]];
      while (t < 1) {
        const [a, b, c, d] = h, u = t;
        out[o++] = b + 0.5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)));
        t += step;
      }
      t -= 1;
    }
    return out.subarray(0, o);
  };
}

/** Opens `item.url` from `from` seconds in (a byte offset at the file's bitrate; a 200 is skipped through). */
export function openDecoder(item, { from = 0, log = ctx.log } = {}) {
  const raw = [];
  let rawBytes = 0, done = false, closed = false, wake = null, dec = null, resample = null, info = null;
  const pcm = [];
  let pcmHave = 0, head = 0;
  const src = { item, underrun: 0, error: null, decoded: 0, started: false,
    get buffered() { return (pcmHave + (rawBytes / ((info?.kbps || 128) * 125)) * SR) / SR; },
    get ended() { return done && !rawBytes && pcmHave < 1; },
    read(n) {
      while (pcmHave < n && rawBytes) decodeSome();
      const out = new Float32Array(n);
      let i = 0;
      while (i < n && pcm.length) {
        const c = pcm[0], take = Math.min(c.length - head, n - i);
        out.set(c.subarray(head, head + take), i); i += take; head += take; pcmHave -= take;
        if (head >= c.length) { pcm.shift(); head = 0; }
      }
      if (i < n && src.started && !done) src.underrun += n - i;
      if (wake && rawBytes < RAW_AHEAD_S * (info?.kbps || 128) * 125 / 2) { const w = wake; wake = null; w(); }
      return out;
    },
    close() { closed = true; dec?.free(); dec = null; wake?.(); },
  };
  function decodeSome() {
    let b = raw.shift(); rawBytes -= b.length;
    if (b.length > DECODE_BYTES) { raw.unshift(b.subarray(DECODE_BYTES)); rawBytes += b.length - DECODE_BYTES; b = b.subarray(0, DECODE_BYTES); }
    if (!dec) return;
    const r = dec.decode(b);
    if (!r.n) return;
    resample ||= createResampler(r.rate || info?.rate || SR);
    const m = new Float32Array(r.n);
    for (let k = 0; k < r.n; k++) m[k] = 0.5 * (r.left[k] + r.right[k]);
    const y = resample(m);
    if (y.length) { pcm.push(y.slice()); pcmHave += y.length; src.decoded += y.length / SR; src.started = true; }
  }
  (async () => {
    dec = ctx.pool.open();
    const known = kbpsSeen.get(item.id) || 128;
    const off = from > 0 ? Math.floor(from * known * 125) : 0;
    const r = await ctx.fetch(item.url, off ? { headers: { range: `bytes=${off}-` } } : {});
    if (!r.ok || !r.body) { r.body?.cancel(); throw new Error(`the file answered ${r.status}`); }
    let skip = off && r.status === 200 ? off : 0;
    const reader = r.body.getReader();
    for (;;) {
      if (closed) { reader.cancel().catch(() => {}); return; }
      if (rawBytes > RAW_AHEAD_S * (info?.kbps || 128) * 125) { await new Promise((w) => { wake = w; }); continue; }
      const { done: d, value } = await reader.read();
      if (d) break;
      let v = value;
      if (skip) { const k = Math.min(skip, v.length); skip -= k; v = v.subarray(k); if (!v.length) continue; }
      if (!info) { info = sniff(v); if (info) kbpsSeen.set(item.id, info.kbps); }
      raw.push(v); rawBytes += v.length;
    }
  })().catch((e) => { src.error = String(e.message || e); log(`${item.title}: ${src.error}`); }).finally(() => { done = true; });
  return src;
}
