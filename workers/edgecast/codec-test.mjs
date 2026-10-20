// node workers/edgecast/codec-test.mjs [file.mp3]: the wasm decoder and encoder in node, as the object runs them.
// Decodes a file, encodes it again at 128 kbit/s, and prints the CPU of each per second of audio.
import { readFileSync, writeFileSync } from 'node:fs';
import { createDecoderPool, createMp3Encoder } from './codec.mjs';

const here = (p) => new URL(p, import.meta.url);
const file = process.argv[2];
const mp3 = file ? readFileSync(file) : null;
if (!mp3) { console.log('usage: node codec-test.mjs <file.mp3> [out.mp3]'); process.exit(2); }
const dm = await WebAssembly.compile(readFileSync(here('./vendor/mpg123.wasm')));
const em = await WebAssembly.compile(readFileSync(here('./vendor/lame.wasm')));
const pool = await createDecoderPool(dm), dec = pool.open(), dec2 = pool.open();
let t0 = performance.now(), L = [], R = [], n = 0, rate = 0;
for (let i = 0; i < mp3.length; i += 16384) { const r = dec.decode(new Uint8Array(mp3.subarray(i, i + 16384))); if (r.n) { L.push(r.left); R.push(r.right); n += r.n; rate = r.rate; } }
const decMs = performance.now() - t0, secs = n / rate;
console.log(`decoded ${secs.toFixed(1)} s at ${rate} Hz in ${decMs.toFixed(0)} ms: ${(decMs / secs).toFixed(3)} ms per audio second, ${(decMs / secs / 10).toFixed(3)} % of a core; decoder memory ${pool.memoryBytes} B with ${pool.handles} handles, errors ${dec.errors}`);
const cat = (a) => { const o = new Float32Array(n); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
const l = cat(L), r = cat(R);
const enc = await createMp3Encoder(em, { sampleRate: rate });
t0 = performance.now();
const out = [];
for (let i = 0; i < n; i += 4608) out.push(enc.encode(l.subarray(i, i + 4608), r.subarray(i, i + 4608)));
out.push(enc.flush());
const encMs = performance.now() - t0;
const bytes = out.reduce((a, b) => a + b.length, 0);
console.log(`encoded at 128 kbit/s in ${encMs.toFixed(0)} ms: ${(encMs / secs).toFixed(3)} ms per audio second, ${(encMs / secs / 10).toFixed(3)} % of a core; ${bytes} B, ${(bytes * 8 / secs / 1000).toFixed(1)} kbit/s; encoder memory ${enc.memoryBytes} B`);
if (process.argv[3]) { const b = new Uint8Array(bytes); let k = 0; for (const x of out) { b.set(x, k); k += x.length; } writeFileSync(process.argv[3], b); }
