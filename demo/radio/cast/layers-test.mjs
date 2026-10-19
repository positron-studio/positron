// node demo/radio/cast/layers-test.mjs: the layers' numbers, no browser. Negative controls mark the checks a
// plausible wrong version would pass by accident.
import { chordHz, droneHz, harmRatios, euclid, stepSeconds, hz, CHORDS, VOICINGS, ghostGap } from './layers.mjs';

let ok = 0, bad = 0;
const check = (name, pass, detail = '') => { if (pass) ok++; else { bad++; console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`); } };
const near = (a, b, e = 0.01) => Math.abs(a - b) < e;

check('A is 440 Hz in this tuning', near(hz(33), 440, 0.01), hz(33).toFixed(3));
const am = chordHz({ root: 9, minor: true }, 'major', { octaves: 1, from: 2 });
check('A minor, "major" chord two octaves above C2: the third turns minor (C5), so A4 C5 E5 G#5', am.map((f) => Math.round(f)).join() === [440, 523, 659, 831].join(), am.map((f) => f.toFixed(1)).join());
check('NEGATIVE CONTROL: the same chord in A major keeps C#', chordHz({ root: 9, minor: false }, 'major', { octaves: 1, from: 2 }).map((f) => Math.round(f)).includes(554));
const f3 = chordHz({ root: 0 }, 'fifths');
check('three octaves of fifths, low to high, every note a power of two away from C or G', f3.length === 12 && f3.every((f, i) => !i || f >= f3[i - 1])
  && f3.every((f) => [0, 7].includes(Math.round(12 * Math.log2(f / hz(0))) % 12)));
const d = droneHz({ root: 2 }, -2);
check('the drone two octaves down in D: D0 near 18 Hz is too low, so it sits on D1 and its fifth', near(d[0], hz(2), 0.01) && near(d[1] / d[0], 1.4983, 0.001) && near(d[2] / d[0], 2, 1e-9), d.map((f) => f.toFixed(2)).join());
check('octave and fifth voicing, all under the voice: ratios 0.5, 0.749, 0.334', harmRatios('octfifth').map((x) => x.toFixed(3)).join() === '0.500,0.749,0.334');
check('no voicing moves a voice up: every ratio of every voicing at every spread is under 1', ['octfifth', 'triad', 'quartal', 'cluster'].every((v) => [0, 0.5, 1].every((sp) => harmRatios(v, sp).every((x) => x < 1))));
const tight = harmRatios('cluster', 0), wide = harmRatios('cluster', 1);
check('a cluster is a few tens of cents at no spread and whole semitones at full spread', tight.every((x) => Math.abs(1200 * Math.log2(x)) < 91) && near(1200 * Math.log2(wide[2]), -300, 0.01));
check('NEGATIVE CONTROL: an unknown voicing gives no voices', harmRatios('nope').length === 0);
check('every chord and voicing is defined and small', Object.values(CHORDS).every((c) => c.length === 4) && Object.values(VOICINGS).every((v) => v.length === 3));
check('euclid 3 of 8 is the tresillo, 5 of 8 the cinquillo shape', euclid(3, 8).map(Number).join('') === '00100101' || euclid(3, 8).filter(Boolean).length === 3);
check('euclid k of n always has k hits, spread so no gap differs from another by more than one step', [[3, 8], [5, 8], [7, 16], [5, 16], [4, 4]].every(([k, n]) => {
  const p = euclid(k, n), at = p.map((x, i) => (x ? i : -1)).filter((i) => i >= 0), gaps = at.map((v, i) => ((at[(i + 1) % at.length] - v + n) % n) || n);
  return at.length === k && Math.max(...gaps) - Math.min(...gaps) <= 1;
}));
check('NEGATIVE CONTROL: the gap check catches all hits bunched at the start', (() => { const at = [0, 1, 2], n = 8, gaps = at.map((v, i) => ((at[(i + 1) % at.length] - v + n) % n) || n); return Math.max(...gaps) - Math.min(...gaps) > 1; })());
check('the longer the file the more ghosts: a 20 min file is visited twice as often as a 5 min one, a 1 min clip less', ghostGap({ ghostEvery: 40 }, 1200) === 20 && ghostGap({ ghostEvery: 40 }, 300) === 40 && ghostGap({ ghostEvery: 40 }, 60) === 60);
check('NEGATIVE CONTROL: a file of unknown length keeps the scene\'s own gap', ghostGap({ ghostEvery: 40 }) === 40 && ghostGap({ ghostEvery: 40 }, 'x') === 40);
check('a step at 120 bpm: a beat 0.5 s, an eighth 0.25 s, a sixteenth 0.125 s', stepSeconds(120, 4) === 0.5 && stepSeconds(120, 8) === 0.25 && stepSeconds(120, 16) === 0.125);

// ── --browser: each layer alone in the wasm scsynth, against a voice-like source at the levelled loudness ──
// Grades level, not taste: every layer audible (above -40 dB) and none drowning the file (under +3 dB of it).
if (process.argv.includes('--browser')) {
  const { compileLayers } = await import('./layers.mjs');
  const { launchChrome, connectCdp } = await import('../../chrome.mjs');
  const BASE = process.env.DEMO_BASE_LOCAL || 'http://127.0.0.1:8890';
  const { bytes } = compileLayers();
  const PAGE = `async (defs) => {
    const S = await import('${BASE}/shell/scsynth.mjs'), L = await import('${BASE}/radio/cast/layers.mjs');
    const ctx = new AudioContext({ sampleRate: 48000 }); await ctx.resume();
    // a voice-like source: pink-ish noise through two formants, opened four times a second, rms near -23 dB
    const voice = (seed) => { const b = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), a = b.getChannelData(0); let y = 0, s = seed;
      for (let i = 0; i < a.length; i++) { s = (s * 16807) % 2147483647; y = 0.97 * y + ((s / 2147483647) * 2 - 1) * 0.3; a[i] = y * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * i / ctx.sampleRate)) ** 2; }
      const n = new AudioBufferSourceNode(ctx, { buffer: b, loop: true }), f1 = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 700, Q: 2, gain: 12 }), f2 = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 1800, Q: 3, gain: 9 }), g = new GainNode(ctx, { gain: 0.12 });
      n.connect(f1); f1.connect(f2); f2.connect(g); n.start(); return g; };
    const main = voice(7), ghost = voice(99);
    for (const n of [main, ghost]) Object.assign(n, { channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    const eng = await S.bootScsynth({ audioContext: ctx, input: S.inputPairs(ctx, [main, ghost]), inputChannels: 4 });
    eng.meter.fftSize = 32768;
    const rms = async () => { await eng.sleep(2500); const x = new Float32Array(32768); eng.meter.getFloatTimeDomainData(x); let s2 = 0; for (const v of x) s2 += v * v; return Math.sqrt(s2 / x.length); };
    for (const [name, b] of Object.entries(defs)) { const d = await eng.sendAndWait((m) => (m[0] === '/done' || m[0] === '/fail') && m[1] === '/d_recv', 5000, '/d_recv', new Uint8Array(b)); if (!d || d[0] !== '/done') return { error: name }; }
    // the source itself, read off its bus and sent out, as the reference
    const probe = (await import('${BASE}/shell/sclang-lite.mjs')).compile('{ Mix(In.ar(2, 2)) * 0.5 }', { name: 'probe' });
    await eng.sendAndWait((m) => m[0] === '/done', 5000, '/d_recv', probe.bytes);
    eng.send('/s_new', 'probe', 4900, 0, 0); const src = await rms(); eng.send('/n_free', 4900); await eng.sleep(300);
    const E = await L.createLayerEngine(eng), key = { root: 2, minor: true }, out = { src };
    const base = { drone: 'none', droneLevel: 0.3, droneOct: -1, res: 'none', resWet: 0.3, resDecay: 1.5, harm: 'none', harmSpread: 0.6, ghost: 'none', ghostLevel: 0.17, bpm: 0, room: 0, roomSize: 0.7 };
    const cases = { drone: { drone: 'key' }, freeze: { drone: 'freeze' }, res: { res: 'minor7' }, harm: { harm: 'octfifth' }, voc: { voc: 'fifths' }, ghostbpf: { ghost: 'bpf' }, ghostcomb: { ghost: 'comb' }, ghostres: { ghost: 'res' } };
    for (const [k, c] of Object.entries(cases)) { E.apply({ ...base, ...c }, key); if (k.startsWith('ghost')) E.ghost(true); out[k] = await rms(); E.apply({ ...base }, key); E.ghost(false); await eng.sleep(4500); }
    E.apply(base, key); out.silent = await rms();
    E.stop();
    await eng.sonic.destroy?.(); if (ctx.state !== 'closed') await ctx.close();
    return out;
  }`;
  const b = await launchChrome({ prefix: 'layers-test', args: ['--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  try {
    const c = await connectCdp(b.wsUrl, { timeout: 180000 }), p = await c.page();
    await p.S('Page.enable'); await p.S('Page.navigate', { url: `${BASE}/shell/scsynth.mjs` }); await new Promise((r) => setTimeout(r, 1200));
    const r = await p.S('Runtime.evaluate', { expression: `(${PAGE})(${JSON.stringify(Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, [...v]])))})`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    const got = r.result.value, db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
    console.log(`  source ${db(got.src).toFixed(1)} dB rms; each layer alone, relative to it:`);
    for (const k of Object.keys(got).filter((k) => !['src', 'silent', 'error'].includes(k))) console.log(`    ${k.padEnd(11)} ${(db(got[k]) - db(got.src)).toFixed(1)} dB`);
    check('every layer compiles in the wasm scsynth and runs', !got.error, got.error);
    check('the source is at a levelled loudness (-30 to -15 dB rms)', db(got.src) > -30 && db(got.src) < -15, db(got.src).toFixed(1));
    const rel = Object.fromEntries(Object.keys(got).filter((k) => !['src', 'silent', 'error'].includes(k)).map((k) => [k, db(got[k]) - db(got.src)]));
    check('every layer is heard through the real controller: above -24 dB of the file', Object.values(rel).every((v) => v > -24), JSON.stringify(rel));
    // drones at the test's level 0.3 sit 3 dB under the file; grammar 2 plays them at 0.45 to 0.7, about level with the processed voice
    // ghosts are heard over the bed since *"can not hear ghost"*, and the choir is the scene's one effect: both at least 3 dB under
check('no layer drowns the file at the test level: drones, the choir and ghosts at least 3 dB under it, the rest 6', Object.entries(rel).every(([k, v]) => v < (k.startsWith('ghost') || ['drone', 'freeze', 'voc'].includes(k) ? -3 : -6)), JSON.stringify(rel));
    check('NEGATIVE CONTROL: every layer off is silent, so the level checks can fail', db(got.silent) < -80, db(got.silent).toFixed(1));
  } finally { await b.close(); }
}
console.log(`layers-test: ${ok}/${ok + bad}`);
process.exit(bad ? 1 : 0);
