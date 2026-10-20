// node workers/edgecast/listen.mjs <base> <seconds> <out.mp3>: one listener of the station's GET /listen, recording to
// a file. A stream that ends is opened again at once (a deploy or a restart) and the break is logged with its length.
// Prints a line every 30 s and a JSON summary at the end: bytes, bytes per second, the breaks.
import { createWriteStream } from 'node:fs';

const [base = 'https://edgecast.positron.studio', secs = '60', out = 'listen.mp3'] = process.argv.slice(2);
const until = Date.now() + Number(secs) * 1000, file = createWriteStream(out);
const t0 = Date.now(), breaks = [], opens = [];
let bytes = 0, lastAt = null, lastLog = t0;
while (Date.now() < until) {
  const at = Date.now();
  let r;
  try { r = await fetch(`${base}/listen`, { signal: AbortSignal.timeout(until - at + 1000) }); } catch (e) { breaks.push({ at: (at - t0) / 1000, why: `fetch: ${e.message}` }); await new Promise((s) => setTimeout(s, 1000)); continue; }
  if (r.status !== 200) { const t = await r.text(); breaks.push({ at: (at - t0) / 1000, why: `${r.status} ${t.slice(0, 120)}` }); await new Promise((s) => setTimeout(s, 1000)); continue; }
  opens.push({ at: +((at - t0) / 1000).toFixed(1), burstFrames: r.headers.get('x-edgecast-burst-frames') });
  if (lastAt) breaks.push({ at: +((lastAt - t0) / 1000).toFixed(1), gapS: +((Date.now() - lastAt) / 1000).toFixed(2), why: 'the stream ended and was opened again' });
  try {
    for await (const chunk of r.body) {
      file.write(chunk); bytes += chunk.length; lastAt = Date.now();
      if (lastAt - lastLog > 30000) { lastLog = lastAt; console.log(`${((lastAt - t0) / 1000).toFixed(0)} s: ${bytes} B, ${(bytes * 8 / ((lastAt - t0) / 1000) / 1000).toFixed(1)} kbit/s`); }
      if (lastAt >= until) break;
    }
  } catch (e) { if (Date.now() < until) breaks.push({ at: +((Date.now() - t0) / 1000).toFixed(1), why: `read: ${e.message}` }); }
}
file.end();
const wall = (Date.now() - t0) / 1000;
console.log(JSON.stringify({ seconds: +wall.toFixed(1), bytes, kbps: +(bytes * 8 / wall / 1000).toFixed(1), opens, breaks }));
process.exit(0);
