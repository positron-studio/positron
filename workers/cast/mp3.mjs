// MPEG audio framing, enough to pace a file at real time: frame length and duration from each header.
// Pure, no I/O, so mp3-test.mjs runs it in node.
const BR = { // kbit/s by version group and layer, index 1..14
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SR = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

/** The frame at `b[i]`, or null: `{ bytes, seconds, rate, kbps }`. Layer III only, which is every mp3. */
export function frameAt(b, i) {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const v = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3;
  if (v === 1 || layer !== 1) return null;
  const ver = v === 3 ? 1 : v === 2 ? 2 : 25;
  const bi = (b[i + 2] >> 4) & 15, si = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
  if (bi === 0 || bi === 15 || si === 3) return null;
  const kbps = BR[ver === 1 ? '1-3' : '2-3'][bi], rate = SR[ver][si];
  const samples = ver === 1 ? 1152 : 576;
  const bytes = Math.floor((samples / 8) * kbps * 1000 / rate) + pad;
  return { bytes, seconds: samples / rate, rate, kbps };
}

/** Bytes of an ID3v2 tag at the start, 0 when there is none. */
export function id3Length(b) {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0;
  return 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f)) + (b[5] & 0x10 ? 10 : 0);
}

/**
 * Cuts a byte stream into whole frames. `push(chunk)` returns the frames completed so far, each
 * `{ data, seconds }`; bytes between frames (a tag, junk) are skipped. A frame is believed only when the
 * next one starts where it says, or at the end of input.
 */
export function createFramer() {
  let buf = new Uint8Array(0), started = false, skipped = 0;
  return {
    get skipped() { return skipped; },
    push(chunk, end = false) {
      const nb = new Uint8Array(buf.length + chunk.length); nb.set(buf); nb.set(chunk, buf.length); buf = nb;
      if (!started) { if (buf.length < 10) return []; const t = id3Length(buf); if (buf.length < t) return []; buf = buf.subarray(t); skipped += t; started = true; }
      const out = [];
      let i = 0;
      while (i + 4 <= buf.length) {
        const f = frameAt(buf, i);
        if (!f) { i++; skipped++; continue; }
        if (i + f.bytes > buf.length) break;
        const next = i + f.bytes;
        if (next + 4 <= buf.length) { if (!frameAt(buf, next)) { i++; skipped++; continue; } }
        else if (!end) break;
        out.push({ data: buf.slice(i, next), seconds: f.seconds, rate: f.rate, kbps: f.kbps });
        i = next;
      }
      buf = buf.slice(i);
      return out;
    },
  };
}
