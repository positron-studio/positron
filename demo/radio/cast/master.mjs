// demo/radio/cast/master.mjs: the cast's last stage, on the sum of everything, so the stream sits at a
// podcast's loudness on a phone in a train. A slow leveller (a mean-square window of seconds, the gain
// towards TARGET, at most GMAX), then a soft-knee squeeze over a short window, then a peak limiter.
// The container runs PROGRAM in scsynth; LOCAL runs the same arithmetic as an AudioWorklet.
// why: plans/plan-cast-listenable.md section 1

/** The numbers, linear: TARGET is the leveller's RMS of the mono sum, KNEE where the squeeze starts, CEIL the peak. */
export const MASTER = { HP: 90, TARGET: 0.15, GMAX: 10, QUIET: 0.002, SLOW: 6, GLIDE: 3, FAST: 0.15, KNEE: 0.26, CEIL: 0.7, LOOK: 0.005, FLOOR: 0.0003 };
// GMAX 5 left quiet stretches at -30 to -42 LUFS short-term; 16 reached -15.1 LUFS but lifted noisy clips and left a
// phone speaker distorting on bass (under 150 Hz was -21.5 of -18 dB RMS). So: a high-pass first, no lift under QUIET
// (-54 dBFS), and 3 dB of headroom for MP3 and small speakers. Measured on preview 2026-10-19.
/** The private stereo pair everything writes to in the container; the master reads it and writes the output. */
export const MASTER_BUS = 12;

/** The SuperCollider program (sclang-lite), reading `bus` and `bus + 1`. */
export const program = (bus = MASTER_BUS, M = MASTER) => `{ var l = HPF.ar(In.ar(${bus}, 1), ${M.HP});
  var r = HPF.ar(In.ar(${bus + 1}, 1), ${M.HP});
  var e1 = Lag.ar(((l + r) * 0.5).squared, ${M.SLOW}).sqrt + ${M.FLOOR};
  var g1 = Lag.ar(Lag.ar((${M.TARGET} / (e1 * ${M.GMAX})).tanh * ${M.GMAX} * (e1 / (e1 + ${M.QUIET})), ${M.GLIDE}), ${M.GLIDE});
  var l1 = l * g1;
  var r1 = r * g1;
  var e2 = Lag.ar(((l1 + r1) * 0.5).squared, ${M.FAST}).sqrt + ${M.FLOOR};
  var g2 = (e2 / ${M.KNEE}).tanh * ${M.KNEE} / e2;
  [Limiter.ar(l1 * g2, ${M.CEIL}, ${M.LOOK}), Limiter.ar(r1 * g2, ${M.CEIL}, ${M.LOOK})] }`;

/** The same leveller and squeeze per sample, stereo in place; the peak limit is the caller's (LOCAL's compressor). */
export function createMaster(sr = 44100, M = MASTER) {
  // SuperCollider's Lag: the coefficient that falls 60 dB in `t` seconds
  const lag = (t) => Math.exp(Math.log(0.001) / (t * sr));
  const bs = lag(M.SLOW), bg = lag(M.GLIDE), bf = lag(M.FAST);
  // a Butterworth high-pass per channel, as SuperCollider's HPF
  const hp = () => { const c = Math.tan(Math.PI * M.HP / sr), c2 = c * c, s2 = Math.SQRT2 * c, a0 = 1 / (1 + s2 + c2), b1 = 2 * (1 - c2) * a0, b2 = -(1 - s2 + c2) * a0;
    let y1 = 0, y2 = 0; return (x) => { const y0 = x + b1 * y1 + b2 * y2, o = a0 * (y0 - 2 * y1 + y2); y2 = y1; y1 = y0; return o; }; };
  const hl = hp(), hr = hp();
  let p1 = 0, ga = 1, gb = 1, p2 = 0;
  return {
    get gain() { return gb; },
    process(L, R) {
      for (let i = 0; i < L.length; i++) {
        const l = hl(L[i]), r = R ? hr(R[i]) : l, m = (l + r) * 0.5;
        p1 = m * m + bs * (p1 - m * m);
        const e1 = Math.sqrt(p1) + M.FLOOR, want = Math.tanh(M.TARGET / (e1 * M.GMAX)) * M.GMAX * (e1 / (e1 + M.QUIET));
        ga = want + bg * (ga - want); gb = ga + bg * (gb - ga);
        const l1 = l * gb, r1 = r * gb, m1 = (l1 + r1) * 0.5;
        p2 = m1 * m1 + bf * (p2 - m1 * m1);
        const e2 = Math.sqrt(p2) + M.FLOOR, g2 = Math.tanh(e2 / M.KNEE) * M.KNEE / e2;
        L[i] = l1 * g2; if (R) R[i] = r1 * g2;
      }
    },
  };
}

/** The AudioWorkletProcessor's source, registered as `cast-master`: one stereo input, one stereo output. */
export const WORKLET = `const MASTER = ${JSON.stringify(MASTER)};
const createMaster = ${createMaster.toString()};
registerProcessor('cast-master', class extends AudioWorkletProcessor {
  constructor() { super(); this.m = createMaster(sampleRate, MASTER); }
  process(inputs, outputs) {
    const i = inputs[0], o = outputs[0];
    if (!o[0]) return true;
    o[0].set(i[0] || new Float32Array(o[0].length));
    if (o[1]) o[1].set(i[1] || i[0] || new Float32Array(o[1].length));
    this.m.process(o[0], o[1]);
    return true;
  }
});`;
