// Copied from positron workers/edgecast/codec.mjs (createMp3Encoder) at commit a742863e (2026-11-04), with one change:
// LAME is given an output rate, so the SFU's 48 kHz PCM comes out at 44.1 kHz like every file on B's channels.
// vendor/lame.wasm and vendor/wasm-media-encoders.mjs are positron's workers/edgecast/vendor/ copies at the same commit
// (wasm-media-encoders 0.7.0, MIT, github.com/arseneyr/wasm-media-encoders; LAME is LGPL).
// The wasm is imported as a WebAssembly.Module, because a Worker may not compile wasm from bytes at runtime.
import { createEncoder } from './vendor/wasm-media-encoders.mjs';

/** LAME, CBR: `encode(left, right)` answers a COPY of the MP3 bytes it made (the wasm's buffer is reused). */
export async function createMp3Encoder(module, { sampleRate = 44100, outputSampleRate = 44100, kbps = 128 } = {}) {
  const e = await createEncoder('audio/mpeg', module);
  e.configure({ channels: 2, sampleRate, bitrate: kbps, outputSampleRate });
  return {
    encode(left, right) { return e.encode([left, right]).slice(); },
    flush() { return e.finalize().slice(); },
    get memoryBytes() { return e.module.memory.buffer.byteLength; },
  };
}
