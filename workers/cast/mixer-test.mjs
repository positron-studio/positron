// node workers/cast/mixer-test.mjs [--live 60]: the cast's mix mode with no container and no network.
// The port is graded against the page's own createTunerGraph, run on a fake AudioContext that records
// every value it is given, so the two cannot drift apart. 11 of the asserts are NEGATIVE CONTROLS.
// --live S runs the mixer and the encoder against the wall clock for S seconds into a sink that counts.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as M from './container/mixer.mjs';
import { createTunerGraph, pinkNoise, createMix, DRIVE } from '../../demo/shell/tuner-mix.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;

// ── 1. the copy is the page's file ──
ok('container/tuner-mix.mjs is byte for byte demo/shell/tuner-mix.mjs',
  readFileSync(`${HERE}container/tuner-mix.mjs`, 'utf8') === readFileSync(`${HERE}../../demo/shell/tuner-mix.mjs`, 'utf8'));

// ── 2. the graph's values, recorded off the real createTunerGraph ──
function fakeCtx(sampleRate = 44100) {
  const made = [], edges = [];
  const param = (v) => ({ value: v, setTargetAtTime() {} });
  const node = (kind, extra = {}) => { const n = { kind, connect(t) { edges.push([n, t]); return t; }, disconnect() {}, ...extra }; made.push(n); return n; };
  return {
    made, edges, sampleRate, currentTime: 0,
    createBiquadFilter: () => node('biquad', { type: 'lowpass', frequency: param(350), Q: param(1) }),
    createWaveShaper: () => node('shaper', { curve: null, oversample: 'none' }),
    createGain: () => node('gain', { gain: param(1) }),
    createOscillator: () => node('osc', { type: 'sine', frequency: param(440), start() {} }),
    createDelay: (max) => node('delay', { max, delayTime: param(0) }),
    createBuffer: (ch, n, sr) => { const d = new Float32Array(n); return { sampleRate: sr, getChannelData: () => d }; },
  };
}
const ctx = fakeCtx(), g = createTunerGraph(ctx, M.SLOTS), bq = ctx.made.filter((n) => n.kind === 'biquad');
const shaper = ctx.made.find((n) => n.kind === 'shaper');
const hp = bq.find((n) => n.type === 'highpass'), bands = bq.filter((n) => n.type === 'bandpass');
const lps = bq.filter((n) => n.type === 'lowpass');
ok('master highpass is 200 Hz at Q 0.7, as ported', hp.frequency.value === 200 && hp.Q.value === 0.7);
ok('master lowpass is 3500 Hz at Q 0.7, and each leg\'s lowpass keeps the default Q 1',
  lps[0].frequency.value === 3500 && lps[0].Q.value === 0.7 && lps.slice(1).every((n) => n.frequency.value === 3500 && n.Q.value === 1), `${lps.length} lowpasses`);
ok('each echo is a 900 Hz bandpass at Q 0.9', bands.length === 2 && bands.every((n) => n.frequency.value === 900 && n.Q.value === 0.9));
ok('the delays are the slots\' echo times, 0.09 and 0.13 s',
  ctx.made.filter((n) => n.kind === 'delay').map((n) => n.delayTime.value).join() === '0.09,0.13');
ok('the feedback is 0.35 and the output 0.8', ctx.made.some((n) => n.kind === 'gain' && n.gain.value === 0.35) && g.out.gain.value === 0.8);
const curve = M.shaperCurve();
ok('the shaper curve is the page\'s, point for point', shaper.curve.length === curve.length && shaper.curve.every((v, i) => v === curve[i]));
ok('NEGATIVE CONTROL: tanh(2.0x) is not that curve', M.shaperCurve(2.0).some((v, i) => Math.abs(v - curve[i]) > 1e-3));
const into = (n) => ctx.edges.filter(([, t]) => t === n).map(([f]) => f), driveNode = into(shaper)[0];
ok(`the master lowpass reaches the shaper only through one gain of DRIVE ${DRIVE}`,
  into(shaper).length === 1 && driveNode.kind === 'gain' && driveNode.gain.value === DRIVE && into(driveNode).length === 1 && into(driveNode)[0] === lps[0],
  `into the shaper: ${into(shaper).map((n) => `${n.kind} ${n.gain?.value ?? ''}`).join(', ')}`);
const r1 = M.seeded(7), r2 = M.seeded(7), saved = Math.random;
Math.random = r1; const page = pinkNoise(fakeCtx(), 1).getChannelData(0); Math.random = saved;
const ours = M.pinkBuffer(1, r2);
ok('the pink noise is the page\'s loop, sample for sample, on one seed', page.length === ours.length && page.every((v, i) => v === ours[i]));
ok('NEGATIVE CONTROL: another seed is other noise', M.pinkBuffer(1, M.seeded(8)).some((v, i) => v !== ours[i]));

// ── 3. the biquads against the Web Audio spec's own definitions ──
const lp = M.biquad('lowpass', 3500, 0.7), hpk = M.biquad('highpass', 200, 0.7), bp = M.biquad('bandpass', 900, 0.9);
ok('lowpass: unity at DC, 10^(Q/20) at its corner (Q in dB)', near(M.gainAt(lp, 1), 1, 1e-6) && near(M.gainAt(lp, 3500), 10 ** (0.7 / 20), 1e-6),
  `|H(3500)| ${M.gainAt(lp, 3500).toFixed(4)}`);
ok('NEGATIVE CONTROL: a lowpass reading Q linear would be 0.7 at the corner, and ours is not', !near(M.gainAt(lp, 3500), 0.7, 0.05));
ok('highpass: unity near Nyquist, 10^(Q/20) at 200 Hz, -24 dB by 50 Hz',
  near(M.gainAt(hpk, 20000), 1, 1e-3) && near(M.gainAt(hpk, 200), 10 ** (0.7 / 20), 1e-6) && M.gainAt(hpk, 50) < 0.07, `|H(50)| ${M.gainAt(hpk, 50).toFixed(4)}`);
ok('bandpass: unity at 900 Hz, Q linear', near(M.gainAt(bp, 900), 1, 1e-6) && M.gainAt(bp, 90) < 0.15 && M.gainAt(bp, 9000) < 0.15);

// ── 4. the engine on two tones a fifth apart, offline ──
function toneSource(freq, seconds = 1e9, sr = 44100) {
  let i = 0;
  return { underrun: 0, buffered: 8, get ended() { return i >= seconds * sr; },
    read(n) { const o = new Float32Array(n); for (let k = 0; k < n && i < seconds * sr; k++, i++) o[k] = 0.5 * Math.sin(2 * Math.PI * freq * i / sr); return o; }, close() {} };
}
function run(engine, seconds) {
  const meters = [];
  for (let b = 0; b < Math.round(seconds * 44100 / M.BLOCK); b++) { engine.block(); const m = engine.meter; if (m && m !== meters.at(-1)) meters.push(m); }
  return meters;
}
const items = [{ id: 'a', title: 'A', f: 220 }, { id: 'b', title: 'B', f: 330 }];
const eng = M.createEngine({ open: (it) => toneSource(it.f), queue: items, set: { dwell: 6, blend: 4 }, rand: M.seeded(3) });
eng.start();
const met = run(eng, 30);
const at = (s) => met.find((x) => x.at >= s);
// cycle: dwell 0..6 on A (B arrives at 3), blend 6..10, dwell on B 10..16, blend 16..20, A again 20..
ok('on a slot alone, only that slot sounds: B is silent before it is opened', at(2).slot[0] > -12 && at(2).slot[1] === null, JSON.stringify(at(2).slot));
ok('B opens at dwell minus preroll and is heard faintly as the echo', at(5).slot[1] !== null && at(5).slot[1] < at(5).slot[0] - 9, JSON.stringify(at(5).slot));
const mid = at(9), onB = at(12), loud = Math.max(...met.filter((x) => x.at > 6 && x.at <= 10).map((x) => x.noise));
ok('after the blend B carries the sound and A has gone (its echo tail under -60 dB) until it arrives again', onB.slot[1] > -12 && (onB.slot[0] === null || onB.slot[0] < -60), JSON.stringify(onB.slot));
ok('noise rises between stations: the loudest blend second at least 9 dB over the floor on a slot', loud - at(2).noise >= 9, `floor ${at(2).noise} dB, blend ${loud} dB`);
const half = createMix(M.SLOTS)(0.5).noise, on = createMix(M.SLOTS)(M.SLOTS[0].at).noise;
ok('and the gain behind it is 0.04 on a slot and over 0.2 halfway', near(on, 0.04, 0.001) && half > 0.2, `${on.toFixed(3)} and ${half.toFixed(3)}`);
ok('the cast carries no whistle: not one second of the 30 has any', M.WHISTLE === false && met.every((x) => x.whistle === null), `mid blend ${mid.whistle}`);
const wt = M.createTuner({ rand: M.seeded(1) }), wo = new Float32Array(M.BLOCK * 50), half5 = { ...createMix(M.SLOTS)(0.5), noise: 0 };
for (let i = 0; i < wo.length; i += M.BLOCK) wt.render([null, null], half5, wo.subarray(i, i + M.BLOCK));
ok('NEGATIVE CONTROL: createTuner with its whistle on sounds it halfway, so the meter can see one', wt.taps.whistle > 0, `${(10 * Math.log10(wt.taps.whistle / wt.taps.n)).toFixed(1)} dB`);
ok('no clipping: every second peaks under 0 dBFS', met.every((x) => x.peak < 0), `loudest ${Math.max(...met.map((x) => x.peak))} dB`);
const st = eng.status();
ok('landings at 10 and 20 s at dwell 6 blend 4, and blending again at 30', st.landings === 2 && st.phase === 'blend', `${st.landings} landings, phase ${st.phase}`);
const held = M.createEngine({ open: (it) => toneSource(it.f), queue: items, set: { dwell: 6, blend: 4, drift: 0 }, rand: M.seeded(3) });
held.start(); run(held, 30);
ok('NEGATIVE CONTROL: with the dial held nothing lands', held.status().landings === 0 && held.status().phase === 'held');
ok('with the dial held both slots hold a file', held.status().slots.every((x) => x.title), held.status().slots.map((x) => x.title).join(' and '));
const quiet = M.createEngine({ open: (it) => toneSource(it.f), queue: items, set: { dwell: 6, blend: 4, noise: 0 }, rand: M.seeded(3) });
quiet.start();
ok('NEGATIVE CONTROL: noise trim 0 leaves no noise at all', run(quiet, 12).every((x) => x.noise === null));
held.set('tune', 0.5);
ok('set tune clamps and holds; drift 1 starts the clock from the nearer slot', held.set('tune', 7) === 1 && held.ctl.drift === 0 && held.set('drift', 1) === 1 && held.ctl.drift === 1);
ok('NEGATIVE CONTROL: an unknown control or a non number is refused', held.set('gain', 1) === null && held.set('dwell', 'x') === null);
const short = M.createEngine({ open: (it) => toneSource(it.f, it.id === 'a' ? 2 : 1e9), queue: items, set: { dwell: 20, blend: 4 }, rand: M.seeded(3) });
short.start(); run(short, 8);
ok('a file that runs out in its dwell starts the blend at once', short.status().landings === 1, `${short.status().landings} landings by 8 s`);

// ── 5. the AM band: quiet white noise in, dead on a slot, the share of energy above 4 kHz ──
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, b = a + len / 2;
      const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
      re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
    }
  }
}
/** dB of the energy above `f` against the energy from 300 Hz to 3 kHz, averaged over 4096 point frames. */
function hfShare(x, f = 4000, sr = 44100) {
  const N = 4096; let hi = 0, lo = 0;
  for (let o = 0; o + N <= x.length; o += N) {
    const re = Float64Array.from(x.subarray(o, o + N), (v, i) => v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))), im = new Float64Array(N);
    fft(re, im);
    for (let k = 1; k < N / 2; k++) { const e = re[k] ** 2 + im[k] ** 2, hz = k * sr / N; if (hz > f) hi += e; else if (hz >= 300 && hz <= 3000) lo += e; }
  }
  return 10 * Math.log10(hi / lo);
}
const wr = M.seeded(11), white = new Float32Array(44100 * 3).map(() => (wr() * 2 - 1) * 0.1);
const tun = M.createTuner({ rand: M.seeded(1) }), outA = new Float32Array(white.length);
const dead = { ...createMix(M.SLOTS)(M.SLOTS[0].at), noise: 0, whistle: 0 };
for (let i = 0; i < white.length; i += M.BLOCK) tun.render([white.subarray(i, i + M.BLOCK), null], dead, outA.subarray(i, i + M.BLOCK));
const clearHf = hfShare(white), amHf = hfShare(outA.subarray(8820));
ok('the AM path: energy above 4 kHz, against 300 Hz to 3 kHz, at least 15 dB lower than the clear input', clearHf - amHf >= 15,
  `clear ${clearHf.toFixed(1)} dB, AM ${amHf.toFixed(1)} dB`);
ok('NEGATIVE CONTROL: the instrument sees no drop between the clear input and itself', Math.abs(hfShare(white) - clearHf) < 0.01);

// ── 5b. a hot master: the Kalle files reach the shaper at +6 dBFS. why: lessons/workers-cast.md#drive ──
// A 1 kHz tone at full scale, dead on a slot, no noise: the share of the output that is not the tone (THD+N).
function thd(tuner, amp = 1) {
  const tone = new Float32Array(44100 * 2).map((_, i) => amp * Math.sin(2 * Math.PI * 1000 * i / 44100)), out = new Float32Array(tone.length);
  for (let i = 0; i < tone.length; i += M.BLOCK) tuner.render([tone.subarray(i, i + M.BLOCK), null], dead, out.subarray(i, i + M.BLOCK));
  const y = out.subarray(44100);
  let c = 0, sn = 0, all = 0;
  for (let i = 0; i < y.length; i++) { c += y[i] * Math.cos(2 * Math.PI * 1000 * i / 44100); sn += y[i] * Math.sin(2 * Math.PI * 1000 * i / 44100); all += y[i] * y[i]; }
  const fund = 2 * (c * c + sn * sn) / y.length;
  return 10 * Math.log10((all - fund) / fund);
}
const hot = thd(M.createTuner({ rand: M.seeded(1) })), was = thd(M.createTuner({ rand: M.seeded(1), drive: 1, k: 2.2 }));
ok('a full scale tone leaves the saturation under 5 per cent THD+N (-26 dB)', hot < -26, `${hot.toFixed(1)} dB`);
ok('NEGATIVE CONTROL: without DRIVE and at k 2.2 the same tone is squashed past 10 per cent (-20 dB)', was > -20, `${was.toFixed(1)} dB`);
const quietT = thd(M.createTuner({ rand: M.seeded(1) }), 0.05);
ok('NEGATIVE CONTROL: a tone at -26 dBFS passes nearly clean, so the instrument is not reading its own floor', quietT < -45, `${quietT.toFixed(1)} dB`);

// ── 6. the clock, on a fake wall ──
let fakeNow = 0;
const clk = M.createClock({ now: () => fakeNow, leadS: 2 });
let ahead = 0;
for (let ms = 0; ms <= 60000; ms += 7) { fakeNow = ms; const n = clk.owed(); clk.made(n); ahead = Math.max(ahead, clk.seconds - ms / 1000); }
ok('the clock never runs more than the lead plus one block ahead of the wall', ahead <= 2 + M.BLOCK / 44100 + 1e-9, `max ahead ${ahead.toFixed(3)} s`);
ok('after 60 s it has made 60 s plus the lead, within a block', near(clk.seconds, 62, M.BLOCK / 44100), `${clk.seconds.toFixed(3)} s`);
fakeNow += 5000; clk.move(5);
ok('NEGATIVE CONTROL: a sink down 5 s moves the clock, so nothing is owed in a burst', clk.owed() <= 1, `${clk.owed()} blocks owed`);

// ── 7. the encoder, if this machine has ffmpeg with LAME ──
const ff = process.env.FFMPEG || 'ffmpeg';
const lame = spawnSync(ff, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
if (lame.status !== 0 || !/libmp3lame/.test(lame.stdout)) console.log(`skip the encoder: ${ff} has no libmp3lame here`);
else {
  const { openEncoder } = await import('./container/encode.mjs');
  const e2 = M.createEngine({ open: (it) => toneSource(it.f), queue: items, set: { dwell: 6, blend: 4 } });
  e2.start();
  let frames = 0, head = null;
  const enc = openEncoder({ onFrame: (f) => { frames++; head ||= f.data.subarray(0, 4); } });
  for (let b = 0; b < 3 * 50; b++) await enc.write(e2.block());
  await enc.close();
  ok('3 s of mix encode to 3 s of whole MP3 frames at 44.1 kHz, no ID3 at the head', near(enc.seconds, 3, 0.1) && head?.[0] === 0xff,
    `${frames} frames, ${enc.seconds.toFixed(3)} s, ${(enc.bytes / 1024).toFixed(1)} KiB`);
}

// ── 8. --live S: the mixer and encoder against the wall clock ──
const li = process.argv.indexOf('--live');
if (li > 0) {
  const S = Number(process.argv[li + 1]) || 60;
  const { openEncoder } = await import('./container/encode.mjs');
  const e3 = M.createEngine({ open: (it) => toneSource(it.f), queue: items, set: { dwell: 10, blend: 5 } });
  e3.start();
  const t0 = Date.now();
  let sent = 0, first = null, maxAhead = -Infinity, minAhead = Infinity;
  const enc = openEncoder({ onFrame: (f) => { sent += f.seconds; first ??= Date.now() - t0; } });
  const clock = M.createClock({ leadS: 2 });
  const cpu0 = process.cpuUsage();
  while (Date.now() - t0 < S * 1000) {
    for (let n = clock.owed(); n > 0; n--) { await enc.write(e3.block()); clock.made(); }
    const wall = (Date.now() - t0) / 1000;
    maxAhead = Math.max(maxAhead, clock.seconds - wall); minAhead = Math.min(minAhead, clock.seconds - wall);
    await new Promise((r) => setTimeout(r, 20));
  }
  const wall = (Date.now() - t0) / 1000, cpu = process.cpuUsage(cpu0);
  await enc.close();
  const drift = clock.seconds - wall - 2;
  ok(`live ${S} s: the mixer never ran ahead of the wall by more than the lead plus a block`, maxAhead <= 2 + M.BLOCK / 44100 + 0.001,
    `ahead between ${minAhead.toFixed(3)} and ${maxAhead.toFixed(3)} s`);
  ok(`live ${S} s: made minus wall minus lead is under 100 ms`, Math.abs(drift) < 0.1,
    `${clock.seconds.toFixed(3)} s made in ${wall.toFixed(3)} s, drift ${(drift * 1000).toFixed(0)} ms, ${sent.toFixed(2)} s of MP3, first frame at ${first} ms, node CPU ${((cpu.user + cpu.system) / 1e4 / wall).toFixed(1)} %`);
}

console.log(`\n${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
