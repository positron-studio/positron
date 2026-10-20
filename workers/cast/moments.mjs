// node workers/cast/moments.mjs <file.mp3>: the moments in one recording a surprise effect should land on, as seconds into
// the file: a phrase starting after a pause, or a strong rise in music. Read once per file, before it plays. why: lessons/workers-cast.md#moments
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** A pause is MOMENTARY loudness PAUSE_LU under the file's own, held PAUSE_S; a phrase starts where it climbs VOICE_LU under. */
export const PAUSE_LU = 10, VOICE_LU = 4, PAUSE_S = 0.7, RISE_LU = 8, GAP_S = 4;

/** `[{ at, score }]`, at least GAP_S apart, from ffmpeg's ebur128 (momentary, every 0.1 s). */
export function momentsOf(file) {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
  const M = [...out.matchAll(/t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.inf]+)/g)].map((m) => [+m[1], Number.isFinite(+m[2]) ? +m[2] : -70]);
  const I = Number(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/.exec(out)?.[1] ?? -23);
  const found = [];
  let quiet = 0;
  for (let k = 0; k < M.length; k++) {
    const [t, m] = M[k];
    if (m < I - PAUSE_LU) { quiet += 0.1; continue; }
    // a phrase after a pause: the voice back within 4 LU of the file's loudness
    if (quiet >= PAUSE_S && m > I - VOICE_LU) found.push({ at: +t.toFixed(1), score: +(Math.min(3, quiet) * 3 + (m - (I - PAUSE_LU))).toFixed(1), kind: 'phrase' });
    // a rise with no pause in front of it, the way music arrives: RISE_LU over the quietest of the second before
    else if (k >= 10) { const lo = Math.min(...M.slice(k - 10, k).map((x) => x[1])); if (m - lo >= RISE_LU && m > I - VOICE_LU) found.push({ at: +t.toFixed(1), score: +(m - lo).toFixed(1), kind: 'rise' }); }
    if (m > I - VOICE_LU) quiet = 0;
  }
  // the strongest of any that crowd within GAP_S
  const kept = [];
  for (const f of found.sort((a, b) => b.score - a.score)) if (kept.every((k) => Math.abs(k.at - f.at) >= GAP_S)) kept.push(f);
  return kept.sort((a, b) => a.at - b.at);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ms = momentsOf(process.argv[2]);
  console.log(`${ms.length} moments: ${ms.slice(0, 30).map((m) => `${m.at}${m.kind === 'rise' ? 'r' : ''}`).join(' ')}${ms.length > 30 ? ' ...' : ''}`);
}
