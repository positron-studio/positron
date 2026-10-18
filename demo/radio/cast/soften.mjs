// demo/radio/cast/soften.mjs: a per-file input stage before the tuner, for the files marked `soften` in
// workers/cast/gains.mjs: a de-clicker (while a short sharp tick passes above 2 kHz the sound crossfades to
// its own 1 kHz low-pass, 1 ms look-ahead) then a gentle one-pole low-pass. Plain per-sample code with no DOM, so the container's
// mixer and the page's AudioWorklet run the same function. why: lessons/workers-cast.md#soften

/** The stage's numbers: frequencies in Hz, times in seconds. */
export const SOFTEN = { lowpass: 3000, detect: 2000, band: 1000, ratio: 4, floor: 0.003, ahead: 0.001, hold: 0.002, attack: 0.0002, release: 0.003, fast: 0.0005, slow: 0.03 };

/** `step(x)` one sample, `process(buf)` in place. Mono, any block size, state carried between calls. */
export function createSoften(sr = 44100, o = SOFTEN) {
  // biquads with Web Audio's coefficients (Q 0 dB): a highpass to hear a tick, a lowpass for what replaces it
  const bq = (f, high) => {
    const w0 = 2 * Math.PI * f / sr, c = Math.cos(w0), al = Math.sin(w0) / 2, a0 = 1 + al;
    const b0 = (high ? 1 + c : 1 - c) / 2 / a0, b1 = (high ? -(1 + c) : 1 - c) / a0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
    let z1 = 0, z2 = 0;
    return (x) => { const y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b0 * x - a2 * y; return y; };
  };
  const hear = bq(o.detect, true), dull = bq(o.band, false);
  let fast = 0, slow = 0, g = 0, held = 0, lp = 0, w = 0;
  const k = (s) => 1 - Math.exp(-1 / (s * sr));
  const kf = k(o.fast), ks = k(o.slow), ka = k(o.attack), kr = k(o.release), kl = 1 - Math.exp(-2 * Math.PI * o.lowpass / sr);
  const D = Math.max(1, Math.round(o.ahead * sr)), HOLD = Math.round(o.hold * sr), dx = new Float32Array(D), dl = new Float32Array(D);
  const api = {
    /** How often the duck has closed, for a meter. */
    ducks: 0,
    step(x) {
      const a = Math.abs(hear(x)), l = dull(x);
      fast = a > fast ? a : fast + (a - fast) * kf;
      slow += (a - slow) * ks;
      if (fast > o.ratio * slow + o.floor) { if (!held) api.ducks++; held = HOLD + D; }
      const want = held > 0 ? 1 : 0; if (held > 0) held--;
      g += (want - g) * (want > g ? ka : kr);
      // the look-ahead: the sound leaves D samples late, so the duck is closed when the tick arrives
      const x0 = dx[w], l0 = dl[w]; dx[w] = x; dl[w] = l; w = (w + 1) % D;
      lp += (x0 + g * (l0 - x0) - lp) * kl;
      return Math.abs(lp) < 1e-20 ? (lp = 0) : lp;
    },
    process(buf) { for (let i = 0; i < buf.length; i++) buf[i] = api.step(buf[i]); return buf; },
  };
  return api;
}

/** The AudioWorkletProcessor's source, registered as `cast-soften`: one mono input, one mono output. */
export const WORKLET = `const SOFTEN = ${JSON.stringify(SOFTEN)};
const createSoften = ${createSoften.toString()};
registerProcessor('cast-soften', class extends AudioWorkletProcessor {
  constructor() { super(); this.s = createSoften(sampleRate, SOFTEN); }
  process(inputs, outputs) {
    const i = inputs[0][0], o = outputs[0][0];
    if (!o) return true;
    if (!i) { o.fill(0); for (let n = 0; n < o.length; n++) o[n] = this.s.step(0); return true; }
    for (let n = 0; n < o.length; n++) o[n] = this.s.step(i[n]);
    return true;
  }
});`;
