// The mix's encoder: s16le 44.1 kHz stereo in, MP3 128 kbit/s out, cut into whole frames.
// No ID3 and no Xing frame, and a flush per packet, so a frame leaves as soon as LAME makes it.
import { spawn } from 'node:child_process';
import { createFramer } from '../mp3.mjs';   // the image keeps workers/cast's layout, so this is the worker's own framer

/** `{ write(pcm) -> Promise, close(), exited, error }`; each whole MP3 frame goes to `onFrame`. */
export function openEncoder({ onFrame, ffmpeg = process.env.FFMPEG || 'ffmpeg', kbps = 128, log = () => {} } = {}) {
  const p = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', '44100', '-ac', '2', '-i', 'pipe:0',
    '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-id3v2_version', '0', '-write_xing', '0', '-flush_packets', '1', '-f', 'mp3', 'pipe:1'],
  { stdio: ['pipe', 'pipe', 'pipe'] });
  const framer = createFramer();
  let err = '';
  const enc = { exited: false, error: null, frames: 0, seconds: 0, bytes: 0, get skipped() { return framer.skipped; } };
  const emit = (fs) => { for (const f of fs) { enc.frames++; enc.seconds += f.seconds; enc.bytes += f.data.length; onFrame?.(f); } };
  p.stdout.on('data', (b) => emit(framer.push(b)));
  p.stdout.on('end', () => emit(framer.push(new Uint8Array(0), true)));
  p.stderr.on('data', (b) => { err = (err + b).slice(-400); });
  p.stdin.on('error', () => { /* the exit below says why */ });
  p.on('error', (e) => { enc.error = e.message; enc.exited = true; });
  p.on('close', (code, sig) => {
    enc.exited = true;
    if (code) { enc.error = `encoder ffmpeg ${code ?? sig}: ${err.trim().split('\n').at(-1) || ''}`; log(enc.error); }
  });
  enc.write = (pcm) => new Promise((res) => {
    if (enc.exited || p.stdin.write(pcm)) return res();
    p.stdin.once('drain', res);
  });
  enc.close = () => new Promise((res) => { if (enc.exited) return res(); p.once('close', res); p.stdin.end(); });
  enc.kill = () => { if (!enc.exited) p.kill('SIGKILL'); };
  return enc;
}
