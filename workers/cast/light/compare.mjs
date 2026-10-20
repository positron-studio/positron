// node /app/light/compare.mjs --engine native|wasm [--patch Cloud] [--mix 1] [--seconds 60] [--in /files/evening.mp3]
// One file straight into the ring and the master, no tuner, no life: the same input and patch through today's
// JACK chain (native scsynth) or the light one (wasm scsynth), the output to /out/cmp-<engine>-<patch>-<mix>.wav.
// With --mix 0 the ring passes the input dry, so the two outputs should match sample for sample once aligned.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2), flag = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const ENGINE = flag('--engine', 'wasm'), PATCH = flag('--patch', 'Cloud'), MIX = Number(flag('--mix', 1)), S = Number(flag('--seconds', 60));
const IN = flag('--in', '/files/evening.mp3'), SR = 44100, N = S * SR;
const { PATCHES, valuesOf } = await import('../container/sc/granulator/grain-ring.mjs');
const p = PATCHES.find((x) => x.name === PATCH);
if (!p) throw new Error(`no patch ${PATCH}: ${PATCHES.map((x) => x.name).join(', ')}`);
const values = valuesOf(p);
delete values.mix;
// the input: mono floats at -6 dB, the level a levelled file reaches the ring at
const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', IN, '-t', String(S + 2), '-ac', '1', '-f', 'f32le', '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 30 }).stdout;
const src = new Float32Array(dec.buffer, dec.byteOffset, dec.length >> 2).map((v) => v * 0.5);
const out = Buffer.alloc(N * 4);
{ let e = 0; for (const v of src) e += v * v; console.error(`input ${src.length} samples, rms ${(10 * Math.log10(e / Math.max(1, src.length))).toFixed(1)} dB`); }
let got = 0;
const t0 = Date.now();
if (ENGINE === 'native') {
  const { startChain, widen } = await import('../container/grains.mjs');
  const ch = await startChain({ inputs: 4, values, mix: MIX });
  ch.out.on('data', (b) => { const n = Math.min(b.length, out.length - got); b.copy(out, got, 0, n); got += n; });
  const B = 882; let i = 0;
  while (got < out.length) {
    const pcm = Buffer.alloc(B * 4);
    for (let k = 0; k < B; k++) { const v = Math.max(-32768, Math.min(32767, Math.round((src[i + k] || 0) * 32767))); pcm.writeInt16LE(v, k * 4); pcm.writeInt16LE(v, k * 4 + 2); }
    i += B;
    if (!ch.feed.write(widen(pcm, null))) await new Promise((r) => ch.feed.once('drain', r));
  }
  await ch.close();
} else {
  const { startChain } = await import('./grains-light.mjs');
  const ch = await startChain({ inputs: 4, values, mix: MIX });
  const B = 882;
  for (let i = 0; got < out.length; i += B) {
    // the same s16 rounding the JACK chain's pipe applies, so a dry run can match it to the sample
    const blk = Float32Array.from(src.subarray(i, i + B), (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767))) / 32768);
    const y = ch.push(blk.length === B ? blk : new Float32Array(B), null);
    const n = Math.min(y.length, out.length - got); y.copy(out, got, 0, n); got += n;
    if (i % (B * 50) === 0) await new Promise((r) => setImmediate(r));   // replies (and /grain) leave between quanta
  }
  await ch.close();
}
const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + out.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(out.length, 40);
const f = `/out/cmp-${ENGINE}-${PATCH.replace(/\W+/g, '')}-${MIX}.wav`;
writeFileSync(f, Buffer.concat([h, out]));
console.log(JSON.stringify({ engine: ENGINE, patch: PATCH, mix: MIX, seconds: S, wallS: (Date.now() - t0) / 1000, file: f }));
process.exit(0);
