// MP3 in and out as wasm, for the station (station.mjs): mpg123 (mpg123-decoder 1.0.3, MIT) to decode files,
// LAME (wasm-media-encoders 0.7.0, MIT) to encode the stream. Both take a WebAssembly.Module the caller compiled
// or imported, because a Worker may not compile wasm from bytes at runtime. Sources in vendor/.
// Each wasm instance starts with 16 MB of memory, and the isolate has 128 MB with scsynth holding 73 of it, so
// every file shares ONE mpg123 instance (a decoder handle each), never one instance per file.
import WASMAudioDecoderCommon from './vendor/mpg123-common.js';
import EmscriptenWASM from './vendor/mpg123-emscripten.js';
import { createEncoder } from './vendor/wasm-media-encoders.mjs';

const IN_BYTES = 2 ** 16, OUT_FLOATS = 2889 * 16 * 2;

/** One mpg123 instance; `open()` makes a streaming decoder handle in it, `decode(u8)` answers `{ left, right, n, rate }`. */
export async function createDecoderPool(module) {
  const common = await new WASMAudioDecoderCommon().instantiate(EmscriptenWASM, module);
  const w = common.wasm;
  let open = 0;
  const heap = () => w.HEAP;
  return {
    get memoryBytes() { return heap().byteLength; },
    get handles() { return open; },
    open() {
      const ptr = (n) => { const p = w.malloc(n); if (!p) throw new Error('mpg123: out of memory'); return p; };
      const inP = ptr(IN_BYTES), outP = ptr(OUT_FLOATS * 4), decP = ptr(4), nP = ptr(4), rateP = ptr(4), errP = ptr(4);
      const u32 = (p) => new Uint32Array(heap(), p, 1);
      const e = w.mpeg_frame_decoder_create(decP, 1);
      if (e) throw new Error(`mpg123: create failed ${e}`);
      const dec = u32(decP)[0];
      open++;
      let freed = false, errors = 0;
      return {
        get errors() { return errors; },
        decode(data) {
          const Ls = [], Rs = [];
          let total = 0;
          for (let off = 0; off < data.length; off += IN_BYTES) {
            const chunk = data.subarray(off, off + IN_BYTES);
            new Uint8Array(heap(), inP, chunk.length).set(chunk);
            let err = w.mpeg_decoder_feed(dec, inP, chunk.length);
            if (err === -10) continue;
            for (;;) {
              u32(nP)[0] = 0;
              err = w.mpeg_decoder_read(dec, outP, OUT_FLOATS, nP, rateP, errP);
              const n = u32(nP)[0];
              if (n) { const f = new Float32Array(heap(), outP, n * 2); Ls.push(f.slice(0, n)); Rs.push(f.slice(n, 2 * n)); total += n; }
              if (err === -11) continue;
              if (err === -10) break;
              if (err) { errors++; break; }
            }
          }
          const cat = (a) => { if (a.length === 1) return a[0]; const o = new Float32Array(total); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
          return { left: total ? cat(Ls) : null, right: total ? cat(Rs) : null, n: total, rate: u32(rateP)[0] };
        },
        free() {
          if (freed) return; freed = true; open--;
          try { w.mpeg_frame_decoder_destroy(dec); } catch { /* gone */ }
          for (const p of [inP, outP, decP, nP, rateP, errP]) w.free(p);
        },
      };
    },
  };
}

/** LAME, CBR: `encode(left, right)` answers a COPY of the MP3 bytes it made (the wasm's buffer is reused). */
export async function createMp3Encoder(module, { sampleRate = 44100, kbps = 128 } = {}) {
  const e = await createEncoder('audio/mpeg', module);
  e.configure({ channels: 2, sampleRate, bitrate: kbps });
  return {
    encode(left, right) { return e.encode([left, right]).slice(); },
    flush() { return e.finalize().slice(); },
    get memoryBytes() { return e.module.memory.buffer.byteLength; },
  };
}
