// demo/shell/rt-scope.mjs: the runtime of a `scope` node on /connect/ (node-runtime.mjs).
// Its audio-in is an AnalyserNode pulled by a silent sink: an analyser nothing pulls reads silence.
// why: lessons/kit-rt-scope.md#header

import { createWaveShape } from './synth-view.mjs';

const WINDOW = 512, FULL = 0.5;

/** One window from the first rising zero crossing, so a steady tone stands still, at one fixed scale, so a level change shows. */
export function scopeWindow(b) {
  let i0 = 0;
  for (let i = 1; i < b.length - WINDOW; i++) if (b[i - 1] < 0 && b[i] >= 0) { i0 = i; break; }
  return Array.from(b.subarray(i0, i0 + WINDOW), (v) => Math.max(-1, Math.min(1, v / FULL)));
}

export function make() {
  const wave = createWaveShape({ reason: null, colour: '--hi', height: 120, name: '' });
  let an = null, pull = null, buf = null, raf = 0;
  function read() {
    if (!an) return null;
    an.getFloatTimeDomainData(buf);
    return buf;
  }
  function frame() {
    wave.set({ points: scopeWindow(read()), reason: '', name: '' });
    raf = requestAnimationFrame(frame);
  }
  return {
    face: wave.el, slot: 'picture',
    start(ctx) {
      an = ctx.createAnalyser(); an.fftSize = 2048;
      buf = new Float32Array(an.fftSize);
      wave.listen(an);
      pull = ctx.createGain(); pull.gain.value = 0;
      an.connect(pull); pull.connect(ctx.destination);
      raf = requestAnimationFrame(frame);
    },
    audio: { in: () => an },
    read,
    /** The loudest sample in the analyser's window now, 0 before any sound. */
    heard() { const b = read(); let m = 0; if (b) for (const v of b) m = Math.max(m, Math.abs(v)); return m; },
    close() {
      cancelAnimationFrame(raf);
      try { an?.disconnect(); pull?.disconnect(); } catch { /* not connected */ }
      wave.destroy?.(); wave.el.remove();
    },
  };
}
