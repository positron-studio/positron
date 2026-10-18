// One slot's source: ffmpeg decodes a file or URL to f32le 44.1 kHz stereo, read as mono floats.
// Read no further ahead than MAX_S: stdout is paused, so ffmpeg and the download wait on the mixer.
// A mono file reaches both channels at unity and nothing is clipped, as in the browser. why: lessons/workers-cast.md#level
import { spawn } from 'node:child_process';

const MAX_S = 8, FRAME = 8, BYTES_PER_S = 44100 * FRAME;
// ffmpeg's own upmix puts a mono file at -3 dB in each channel; this keeps it at 0 dB and passes stereo as it is
export const UPMIX = 'pan=stereo|FL=FL+FC|FR=FR+FC';
const UA = 'positron-cast/1 (+https://positron.studio)';

/** `{ read(n), ended, buffered, underrun, close(), error }`; `read` never blocks and zero-fills a gap. */
export function openDecoder(item, { ffmpeg = process.env.FFMPEG || 'ffmpeg', log = () => {} } = {}) {
  const url = item.url, http = /^https?:/.test(url);
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error',
    ...(http ? ['-user_agent', UA, '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'] : []),
    '-i', url, '-vn', '-af', UPMIX, '-f', 'f32le', '-ar', '44100', '-ac', '2', 'pipe:1'];
  const p = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [];
  let tail = Buffer.alloc(0), have = 0, head = 0, exited = false, closed = false, started = false, err = '';
  const src = {
    item, underrun: 0, error: null, decoded: 0,
    get buffered() { return have / BYTES_PER_S; },
    get ended() { return exited && have < FRAME; },
    read(n) {
      const out = new Float32Array(n);
      let i = 0;
      while (i < n && chunks.length) {
        const c = chunks[0], take = Math.min((c.length - head) / FRAME, n - i);
        // 0.5 (L + R): the 'speakers' downmix into the graph's mono highpass
        for (let q = 0; q < take; q++, head += FRAME) out[i++] = 0.5 * (c.readFloatLE(head) + c.readFloatLE(head + 4));
        have -= take * FRAME;
        if (head >= c.length) { chunks.shift(); head = 0; }
      }
      if (i < n && started && !exited) src.underrun += n - i;
      if (p.stdout.isPaused() && have < (MAX_S / 2) * BYTES_PER_S) p.stdout.resume();
      return out;
    },
    close() { closed = true; if (!exited) p.kill('SIGKILL'); },
  };
  p.stdout.on('data', (b) => {
    if (tail.length) b = Buffer.concat([tail, b]);
    const cut = b.length - (b.length % FRAME);
    tail = b.subarray(cut); b = b.subarray(0, cut);
    if (!b.length) return;
    started = true; chunks.push(b); have += b.length; src.decoded += b.length / BYTES_PER_S;
    if (have > MAX_S * BYTES_PER_S) p.stdout.pause();
  });
  p.stderr.on('data', (b) => { err = (err + b).slice(-400); });
  p.on('error', (e) => { src.error = e.message; exited = true; });
  // 'close', not 'exit': it waits for stdout to drain, so `ended` never drops the last second
  p.on('close', (code) => {
    exited = true;
    if (!closed && code) { src.error = `ffmpeg ${code}: ${err.trim().split('\n').at(-1) || ''}`; log(`${item.title}: ${src.error}`); }
  });
  return src;
}
