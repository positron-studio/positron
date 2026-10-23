// Local listeners of the encoder: the same whole MP3 frames the source connection gets, for the Caster's /listen on a
// station whose mount is somebody else's (radio1965). A listener that falls 512 kB behind is dropped, never waited for.
// why: lessons/workers-cast.md#tap
export const taps = new Set();
const SLOW_BYTES = 512 * 1024;
export function tap(buf) {
  for (const r of taps) {
    if (r.destroyed || r.writableLength > SLOW_BYTES) { taps.delete(r); r.destroy(); continue; }
    r.write(buf);
  }
}
