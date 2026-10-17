// demo/shell/tuner-mix.mjs: what an AM dial does to the stations on it, lifted
// out of /radio/tuner/ so /social/radio/ tunes by the same maths. No AudioContext
// until pinkNoise or createTunerGraph (the AM graph, used by /radio/scenery/) is handed one.

export const CLEAR_W = 0.035, ECHO_W = 0.13, ECHO_MAX = 0.35;

/**
 * mix(t) for stations at `at` (0 to 1) on the dial: clear is a narrow bell, echo a faint wide
 * one, noise fills what no station holds, and the whistle is an off-tune carrier's beat.
 * why: lessons/kit-tuner-mix.md#create-mix
 */
export function createMix(stations) {
  return function mix(t) {
    const st = stations.map((s) => {
      const dist = Math.abs(t - s.at);
      const clear = Math.exp(-((dist / CLEAR_W) ** 2));
      const echo = ECHO_MAX * Math.exp(-((dist / ECHO_W) ** 2)) * (1 - clear);
      // Off tune the sidebands go first, so the clear path also dulls.
      const bright = 1200 + 2300 * Math.exp(-((dist / 0.03) ** 2));
      return { dist, clear, echo, bright };
    });
    const best = Math.max(...st.map((s) => s.clear));
    const near = st.reduce((a, s, i) => (s.dist < st[a].dist ? i : a), 0);
    const nd = st[near].dist;
    return {
      st, near,
      noise: 0.04 + 0.26 * (1 - best),
      whistle: 0.05 * (1 - Math.exp(-((nd / 0.012) ** 2))) * Math.exp(-((nd / 0.07) ** 2)),
      pitch: Math.min(3200, 150 + 40000 * nd),
    };
  };
}

/** Pink-ish noise, `seconds` long, to loop (Paul Kellet's economy filter). */
export function pinkNoise(ctx, seconds = 4) {
  const n = ctx.sampleRate * seconds, buf = ctx.createBuffer(1, n, ctx.sampleRate), a = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
    a[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
  }
  return buf;
}

/**
 * /radio/tuner/'s AM graph, in one place for a page that tunes buffers: every leg through its
 * clear (a dulling lowpass) and its echo, noise and the whistle into one mono band-pass and
 * a soft saturation. `legs[i].input` takes station i, `noiseIn` the noise; `out` is the set.
 * `apply(m, { whistle })` moves every gain to `mix(t)`'s answer `m`.
 */
export function createTunerGraph(ctx, stations) {
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 200; hp.Q.value = 0.7;
  hp.channelCount = 1; hp.channelCountMode = 'explicit'; hp.channelInterpretation = 'speakers';
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500; lp.Q.value = 0.7;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024), k = 2.2;
  for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
  shaper.curve = curve; shaper.oversample = '2x';
  const out = ctx.createGain(); out.gain.value = 0.8;
  hp.connect(lp); lp.connect(shaper); shaper.connect(out);
  const whistle = ctx.createOscillator(); whistle.type = 'sine';
  const wGain = ctx.createGain(); wGain.gain.value = 0;
  whistle.connect(wGain); wGain.connect(hp); whistle.start();
  const noiseIn = ctx.createGain(), nGain = ctx.createGain(); nGain.gain.value = 0;
  noiseIn.connect(nGain); nGain.connect(hp);
  const legs = stations.map((st) => {
    const input = ctx.createGain();
    const clear = ctx.createGain(); clear.gain.value = 0;
    const sLp = ctx.createBiquadFilter(); sLp.type = 'lowpass'; sLp.frequency.value = 3500;
    // a neighbour heard faintly, late and dull, smearing like a skywave
    const echo = ctx.createGain(); echo.gain.value = 0;
    const delay = ctx.createDelay(0.5); delay.delayTime.value = st.echo ?? 0.1;
    const dull = ctx.createBiquadFilter(); dull.type = 'bandpass'; dull.frequency.value = 900; dull.Q.value = 0.9;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    input.connect(clear); clear.connect(sLp); sLp.connect(hp);
    input.connect(echo); echo.connect(delay); delay.connect(dull); dull.connect(hp); delay.connect(fb); fb.connect(delay);
    return { input, clear, lp: sLp, echo };
  });
  return {
    out, legs, noiseIn,
    apply(m, { whistle: on = true, tc = 0.04 } = {}) {
      const t = ctx.currentTime;
      legs.forEach((g, i) => {
        const s = m.st[i];
        g.clear.gain.setTargetAtTime(s.clear, t, tc);
        g.echo.gain.setTargetAtTime(s.echo, t, tc);
        g.lp.frequency.setTargetAtTime(s.bright, t, tc);
      });
      nGain.gain.setTargetAtTime(m.noise, t, tc);
      wGain.gain.setTargetAtTime(on ? m.whistle : 0, t, tc);
      whistle.frequency.setTargetAtTime(m.pitch, t, tc);
    },
  };
}
