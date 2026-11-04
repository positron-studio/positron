// Copied from positron workers/edgecast-relay/icecast.mjs (silentFrame) at commit c316c417 (2026-11-03), the import
// path changed to the flat copy of mp3.mjs. eccm's silence() in src/station/station.mjs at tag radio-last (5729fa1)
// builds the same frame. B's silence layer is a stream of these: no encoder, and a listener never goes dry.
import { frameAt } from './mp3.mjs';

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
