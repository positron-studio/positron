// demo/shell/sclang-layers-test.mjs: the cast layers' UGens (Ringz, CombC, CombL, BPF, FreeVerb, FreeVerb2,
// PitchShift, Limiter, LeakDC, Lag, LFNoise2, VarSaw), graded by structure and then by sound.
//   node demo/shell/sclang-layers-test.mjs            structure, no browser
//   ... --browser   the wasm scsynth in headless Chrome (needs node demo/server.mjs on :8890), plus the ghost input
//   ... --native    the container's scsynth 3.13 in NRT (docker image grains-local)
//   ... --cpu       CPU of each layer in the browser and natively (--cpu-browser, --cpu-native for one)
// Every sound check has a NEGATIVE CONTROL that must fail it: a swapped argument in UGENS, the wrong rate, or the
// same program without the block. why: lessons/kit-sclang-lite.md#test-layers

import { readSynthDef, sameBytes, graph, RATE, OP } from './synthdef.mjs';
import * as L from './sclang-lite.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { compile, UGENS } = L;
const argv = process.argv.slice(2);
const BASE = process.env.DEMO_BASE_LOCAL || 'http://127.0.0.1:8890';
const SR = 48000, N = 32768;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

/** Compile with two of a UGen's arguments swapped in the table, the way a wrong row would be. */
function sabotaged(cls, a, b, src, name) {
  const args = UGENS[cls].args, i = args.findIndex(([k]) => k === a), j = args.findIndex(([k]) => k === b);
  const was = args.slice();
  [args[i], args[j]] = [args[j], args[i]];
  try { return compile(src, { name }); } finally { args.splice(0, args.length, ...was); }
}

// ── 1. structure ──────────────────────────────────────────────────────────────

const inp = (d, i) => (i.from === -1 ? d.constants[i.out] : `${d.blocks[i.from].name}:${i.out}`);
const one = (src, cls) => {
  const r = compile(src, { name: 't' });
  if (!r.ok) return { r, b: null, d: null };
  const d = readSynthDef(r.bytes).defs[0];
  return { r, d, b: d.blocks.find((x) => x.name === cls) };
};
const ins = (d, b) => b.inputs.map((i) => inp(d, i)).join(' ');

function structure() {
  head('structure: inputs in the class file\'s order, defaults, rates, outputs (Version-3.13.0)');
  const rows = [
    ['Ringz', '{ Ringz.ar(Impulse.ar(4)) }', 'Impulse:0 440 1', 2, 1],
    ['BPF', '{ BPF.ar(WhiteNoise.ar) }', 'WhiteNoise:0 440 1', 2, 1],
    ['Lag', '{ Lag.ar(Saw.ar) }', 'Saw:0 0.1', 2, 1],
    ['LeakDC', '{ LeakDC.ar(Saw.ar) }', 'Saw:0 0.995', 2, 1],
    ['CombC', '{ CombC.ar(Saw.ar) }', 'Saw:0 0.2 0.2 1', 2, 1],
    ['CombL', '{ CombL.ar(Saw.ar) }', 'Saw:0 0.2 0.2 1', 2, 1],
    ['FreeVerb', '{ FreeVerb.ar(Saw.ar) }', 'Saw:0 0.33 0.5 0.5', 2, 1],
    ['FreeVerb2', '{ FreeVerb2.ar(Saw.ar, Pulse.ar) }', 'Saw:0 Pulse:0 0.33 0.5 0.5', 2, 2],
    ['PitchShift', '{ PitchShift.ar(Saw.ar) }', 'Saw:0 0.2 1 0 0', 2, 1],
    ['Limiter', '{ Limiter.ar(Saw.ar) }', 'Saw:0 1 0.01', 2, 1],
    ['LFNoise2', '{ LFNoise2.ar }', '500', 2, 1],
    ['VarSaw', '{ VarSaw.ar }', '440 0 0.5', 2, 1],
  ];
  const f = (x) => String(Math.fround(x));
  for (const [cls, src, want, rate, outs] of rows) {
    const { r, d, b } = one(src, cls);
    const got = b ? ins(d, b) : (r.ok ? 'no block' : r.message);
    const wantF = want.split(' ').map((w) => (/^[\d.]+$/.test(w) ? f(Number(w)) : w)).join(' ');
    ok(`${cls}: inputs ${want}, rate ${rate}, ${outs} output${outs > 1 ? 's' : ''}`,
      b && got === wantF && b.rate === rate && b.outputs.length === outs, `${got}, rate ${b?.rate}, ${b?.outputs.length} out`);
  }
  {
    const { d, b } = one('{ LeakDC.kr(LFNoise1.kr); Saw.ar }', 'LeakDC');
    ok('LeakDC.kr defaults its coef to 0.9 and .ar to 0.995, as Filter.sc has it', b && inp(d, b.inputs[1]) === Math.fround(0.9) && b.rate === 1, b ? ins(d, b) : '');
  }
  {
    const a = compile('{ Lag.ar(Saw.ar, 0) }'), z = compile('{ Saw.ar }');
    ok('Lag with lagTime 0 is its input, Lag.sc\'s own early return, byte for byte', a.ok && z.ok && sameBytes(a.bytes, z.bytes));
    const s = compile('{ SinOsc.ar(Lag.kr(300, 2)) }'), s0 = compile('{ SinOsc.ar(300) }');
    ok('and Lag of a number is the number', s.ok && s0.ok && sameBytes(s.bytes, s0.bytes));
  }
  // The same graphs by hand with synthdef.mjs. A swapped row in UGENS must change the file.
  {
    const g = graph('t'); const k = g.value;
    const imp = g.block('Impulse', RATE.sample, [k(4), k(0)]);
    const rz = g.block('Ringz', RATE.sample, [imp, k(440), k(1)]);
    const m = g.block('BinaryOpUGen', RATE.sample, [rz, k(0.05)], 1, OP.mul);
    g.out(m, m);
    const src = '{ Ringz.ar(Impulse.ar(4), freq: 440, decaytime: 1) * 0.05 }';
    const r = compile(src, { name: 't' });
    ok('Ringz by hand and as text are the same file, byte for byte', r.ok && sameBytes(r.bytes, g.bytes()));
    const s = sabotaged('Ringz', 'freq', 'decaytime', src, 't');
    ok('NEGATIVE CONTROL: Ringz with freq and decaytime swapped in UGENS is a different file', s.ok && !sameBytes(s.bytes, g.bytes()));
  }
  {
    const g = graph('t'); const k = g.value;
    const a = g.block('Saw', RATE.sample, [k(440)]), b = g.block('Pulse', RATE.sample, [k(440), k(0.5)]);
    const fv = g.block('FreeVerb2', RATE.sample, [a, b, k(1), k(0.9), k(0)], 2);
    g.out({ from: fv.from, out: 0 }, { from: fv.from, out: 1 });
    const r = compile('{ FreeVerb2.ar(Saw.ar, Pulse.ar, 1, 0.9, 0) }', { name: 't' });
    ok('FreeVerb2 by hand and as text are the same file: one block, two outputs, left and right', r.ok && r.channels === 2 && sameBytes(r.bytes, g.bytes()));
  }
  head('refusals sclang makes too');
  const refuse = [
    ['{ FreeVerb.kr(Saw.ar) }', /FreeVerb\.kr does not exist/],
    ['{ Limiter.kr(Saw.ar); Saw.ar }', /Limiter\.kr does not exist/],
    ['{ PitchShift.kr(Saw.ar); Saw.ar }', /PitchShift\.kr does not exist/],
    ['{ Ringz.ar(Impulse.kr(4)) }', /first input is control rate/],
    ['{ BPF.ar(LFNoise1.kr) }', /first input is control rate/],
    ['{ FreeVerb2.ar(Saw.ar, LFNoise1.kr) }', /input 1 is control rate/],
    ['{ FreeVerb.ar }', /needs its in argument/],
    ['{ CombC.ar(LFNoise1.kr) }', /first input is control rate/],
    ['{ Klank.ar(1) }', /Klank is not in this subset/],
  ];
  for (const [src, re] of refuse) {
    const r = compile(src);
    ok(`refused: ${src}`, !r.ok && re.test(r.message), r.ok ? 'compiled' : r.message);
  }
}

// ── 2. the sound checks, the same for both engines ────────────────────────────

function fft(re) {
  const n = re.length, im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const p = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i];
  return p;
}
/** What every judge reads: level, DC, a Hann spectrum, bands and peaks. */
function measure(x) {
  const n = x.length;
  let peak = 0, sum = 0, sq = 0, live = 0;
  for (const v of x) { peak = Math.max(peak, Math.abs(v)); sum += v; sq += v * v; if (Math.abs(v) > 1e-4) live++; }
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  const p = fft(w), hz = SR / n;
  const band = (lo, hi) => { let s = 1e-30; for (let i = Math.ceil(lo / hz); i <= Math.floor(hi / hz); i++) s += p[i]; return s; };
  const dens = (lo, hi) => band(lo, hi) / (hi - lo);
  const peakHz = (lo, hi) => { let b = -1, at = 0; for (let i = Math.ceil(lo / hz); i <= Math.floor(hi / hz); i++) if (p[i] > b) { b = p[i]; at = i; } return at * hz; };
  return { peak, mean: sum / n, rms: Math.sqrt(sq / n), live: live / n, band, dens, peakHz };
}
const dB = (a, b) => 10 * Math.log10(a / b);
const near = (f, want, tol) => Math.abs(f - want) <= tol;

/** A comb at 500 Hz: its harmonics stand above the points half way between them. */
const combJudge = (m) => {
  let even = 0, odd = 0;
  for (let h = 500; h <= 5000; h += 500) even += m.band(h - 4, h + 4);
  for (let h = 750; h <= 4750; h += 500) odd += m.band(h - 4, h + 4);
  const d = dB(even, odd);
  return { pass: d >= 25 && m.rms > 1e-3, detail: `500 Hz harmonics ${d.toFixed(1)} dB over the points between` };
};
const verbJudge = (m) => ({ pass: m.live >= 0.5 && m.rms > 1e-3, detail: `${(m.live * 100).toFixed(0)} % of samples sound, rms ${m.rms.toFixed(4)}` });

/**
 * Each case: a program, how its sound is judged, and its negative controls. `ref` names a case whose
 * measures the judge also reads. A negative is `{ src }` or `{ swap: [a, b] }` on the case's own UGen.
 */
const CASES = [
  { id: 'ringz', cls: 'Ringz', src: '{ Ringz.ar(Impulse.ar(4), freq: 440, decaytime: 1) * 0.05 }',
    judge: (m) => { const f = m.peakHz(50, 5000); return { pass: near(f, 440, 3) && m.rms > 1e-3, detail: `rings at ${f.toFixed(1)} Hz` }; },
    neg: [{ swap: ['freq', 'decaytime'] }, { src: '{ Mix.ar([Ringz.kr(Impulse.kr(4), freq: 440, decaytime: 1)]) * 0.05 }', why: 'control rate' }] },
  { id: 'bpf', cls: 'BPF', src: '{ BPF.ar(WhiteNoise.ar * 0.5, freq: 2000, rq: 0.05) }',
    judge: (m) => { const lo = dB(m.dens(1950, 2050), m.dens(300, 800)), hi = dB(m.dens(1950, 2050), m.dens(5000, 9000));
      return { pass: lo >= 20 && hi >= 20 && m.rms > 1e-3, detail: `the band ${lo.toFixed(1)} dB over 300 to 800 Hz, ${hi.toFixed(1)} dB over 5 to 9 kHz` }; },
    neg: [{ swap: ['freq', 'rq'] }, { src: '{ WhiteNoise.ar * 0.05 }', why: 'without the BPF' }] },
  { id: 'pulse', ref: true, src: '{ Pulse.ar(100) * 0.3 }' },
  { id: 'lag', cls: 'Lag', src: '{ Lag.ar(in: Pulse.ar(100) * 0.3, lagTime: 0.003) }', uses: 'pulse',
    judge: (m, r) => { const k = (x) => dB(x.band(2000, 12000), x.band(90, 110)); const d = k(r) - k(m);
      return { pass: d >= 15 && m.rms > 1e-3, detail: `2 to 12 kHz ${d.toFixed(1)} dB further down than the raw Pulse` }; },
    neg: [{ swap: ['in', 'lagTime'] }, { src: '{ Lag.ar(Pulse.ar(100) * 0.3, lagTime: 0) }', why: 'lagTime 0' }] },
  { id: 'leakdc', cls: 'LeakDC', src: '{ LeakDC.ar(in: SinOsc.ar(440, 0, 0.1, 0.5), coef: 0.995) }',
    judge: (m) => ({ pass: Math.abs(m.mean) < 0.01 && m.rms > 0.05, detail: `mean ${m.mean.toFixed(4)}, rms ${m.rms.toFixed(3)}` }),
    neg: [{ swap: ['in', 'coef'] }, { src: '{ SinOsc.ar(440, 0, 0.1, 0.5) }', why: 'without the LeakDC' }] },
  { id: 'combc', cls: 'CombC', src: '{ CombC.ar(Impulse.ar(4) * 0.5, maxdelaytime: 0.01, delaytime: 0.002, decaytime: 1) * 0.2 }', judge: combJudge,
    neg: [{ swap: ['maxdelaytime', 'decaytime'] }, { src: '{ Mix.ar([CombC.kr(Impulse.kr(4) * 0.5, maxdelaytime: 0.01, delaytime: 0.002, decaytime: 1)]) * 0.2 }', why: 'control rate' }] },
  { id: 'combl', cls: 'CombL', src: '{ CombL.ar(Impulse.ar(4) * 0.5, maxdelaytime: 0.01, delaytime: 0.002, decaytime: 1) * 0.2 }', judge: combJudge,
    neg: [{ swap: ['maxdelaytime', 'decaytime'] }, { src: '{ Mix.ar([CombL.kr(Impulse.kr(4) * 0.5, maxdelaytime: 0.01, delaytime: 0.002, decaytime: 1)]) * 0.2 }', why: 'control rate' }] },
  { id: 'freeverb', cls: 'FreeVerb', src: '{ FreeVerb.ar(Impulse.ar(1) * 0.5, mix: 1, room: 0.9, damp: 0) }', judge: verbJudge,
    neg: [{ swap: ['mix', 'damp'] }, { src: '{ FreeVerb.ar(Impulse.ar(1) * 0.5, mix: 0, room: 0.9, damp: 0) }', why: 'mix 0' }] },
  { id: 'freeverb2', cls: 'FreeVerb2', src: '{ FreeVerb2.ar(Impulse.ar(1) * 0.5, Impulse.ar(1) * 0.5, mix: 1, room: 0.9, damp: 0) }', judge: verbJudge,
    neg: [{ swap: ['mix', 'damp'] }, { src: '{ FreeVerb2.ar(Impulse.ar(1) * 0.5, Impulse.ar(1) * 0.5, mix: 0, room: 0.9, damp: 0) }', why: 'mix 0' }] },
  { id: 'pitchshift', cls: 'PitchShift', src: '{ PitchShift.ar(SinOsc.ar(440) * 0.3, windowSize: 0.2, pitchRatio: 1.5) }',
    judge: (m) => { const f = m.peakHz(100, 3000); return { pass: near(f, 660, 6) && m.rms > 1e-3, detail: `the loudest partial at ${f.toFixed(1)} Hz` }; },
    neg: [{ swap: ['windowSize', 'pitchRatio'] }, { src: '{ PitchShift.ar(SinOsc.ar(440) * 0.3, windowSize: 0.2, pitchRatio: 1) }', why: 'ratio 1' }] },
  { id: 'limiter', cls: 'Limiter', src: '{ Limiter.ar(in: SinOsc.ar(440) * 4, level: 0.5, dur: 0.01) }',
    judge: (m) => { const f = m.peakHz(50, 5000);
      return { pass: m.peak >= 0.4 && m.peak <= 0.51 && near(f, 440, 3) && m.rms > 0.25, detail: `peak ${m.peak.toFixed(3)}, rms ${m.rms.toFixed(3)}, at ${f.toFixed(1)} Hz` }; },
    neg: [{ swap: ['in', 'level'] }, { src: '{ SinOsc.ar(440) * 4 }', why: 'without the Limiter' }] },
  { id: 'lfnoise1', ref: true, src: '{ LFNoise1.ar(100) * 0.3 }' },
  { id: 'lfnoise2', cls: 'LFNoise2', src: '{ LFNoise2.ar(100) * 0.3 }', uses: 'lfnoise1',
    judge: (m, r) => { const k = (x) => dB(x.band(1000, 20000), x.band(1, 200)); const d = k(r) - k(m);
      return { pass: k(m) <= -40 && d >= 6 && m.rms > 1e-3, detail: `1 to 20 kHz ${k(m).toFixed(1)} dB under the band, ${d.toFixed(1)} dB under LFNoise1's` }; },
    neg: [{ src: '{ WhiteNoise.ar * 0.3 }', why: 'white noise' }] },
  { id: 'varsaw', cls: 'VarSaw', src: '{ VarSaw.ar(200, iphase: 0, width: 0.5) * 0.3 }',
    judge: (m) => { const d = dB(m.band(597, 603), m.band(397, 403) + m.band(797, 803));
      return { pass: d >= 20 && m.rms > 1e-3, detail: `the 3rd harmonic ${d.toFixed(1)} dB over the 2nd and 4th` }; },
    neg: [{ swap: ['iphase', 'width'] }, { src: '{ VarSaw.ar(200, iphase: 0, width: 0.2) * 0.3 }', why: 'width 0.2' }] },
];

/** Every program both engines play: the cases, then each negative, compiled here. */
function programs() {
  const out = [];
  for (const c of CASES) {
    const name = `L_${c.id}`;
    const r = compile(c.src, { name });
    if (!r.ok) throw new Error(`${c.id} does not compile: ${r.message}`);
    out.push({ id: c.id, name, bytes: [...r.bytes] });
    (c.neg ?? []).forEach((n, i) => {
      const nm = `L_${c.id}_n${i}`;
      const rr = n.swap ? sabotaged(c.cls, n.swap[0], n.swap[1], c.src, nm) : compile(n.src, { name: nm });
      n.label = n.swap ? `${c.cls} with ${n.swap.join(' and ')} swapped in UGENS` : n.why;
      if (!rr.ok) { n.refused = rr.message; return; }
      out.push({ id: `${c.id}_n${i}`, name: nm, bytes: [...rr.bytes] });
    });
  }
  return out;
}

function grade(engine, got) {
  head(`sound, ${engine}`);
  for (const id of Object.keys(got)) if (!got[id].done) ok(`${id}: the engine took the definition and started it`, false, got[id].why);
  const m = Object.fromEntries(Object.entries(got).filter(([, v]) => v.samples).map(([k, v]) => [k, measure(Float64Array.from(v.samples))]));
  for (const c of CASES.filter((x) => x.judge)) {
    if (!m[c.id]) { ok(`${c.cls}: no sound came back`, false); continue; }
    const j = c.judge(m[c.id], m[c.uses]);
    ok(`${c.cls}: ${j.detail}`, j.pass);
    (c.neg ?? []).forEach((n, i) => {
      if (n.refused) { ok(`NEGATIVE CONTROL: ${n.label} is refused before it reaches the engine`, true, n.refused.replace(/^line \d+, column \d+: /, '')); return; }
      const mm = m[`${c.id}_n${i}`];
      const jj = mm ? c.judge(mm, m[c.uses]) : null;
      ok(`NEGATIVE CONTROL: ${n.label} fails the same check`, jj && !jj.pass, jj ? jj.detail : 'no sound');
    });
  }
}

// ── 3. the browser ────────────────────────────────────────────────────────────

async function withPage(fn) {
  const { launchChrome, connectCdp } = await import('../chrome.mjs');
  const b = await launchChrome({ prefix: 'sclang-layers', args: ['--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  try {
    const c = await connectCdp(b.wsUrl, { timeout: 120000 });
    const p = await c.page();
    await p.S('Page.enable');
    // A same-origin document with nothing on it: the module itself, shown as text.
    await p.S('Page.navigate', { url: `${BASE}/shell/scsynth.mjs` });
    await new Promise((r) => setTimeout(r, 1200));
    const run = async (expr) => {
      const r = await p.S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    return await fn(run, b, c);
  } finally { await b.close(); }
}

/** In the page: boot once, then per program /d_recv, /s_new, listen, /n_free. */
const PAGE_BOOT = `async () => {
  const S = await import('${BASE}/shell/scsynth.mjs');
  const ctx = new AudioContext({ sampleRate: ${SR} }); await ctx.resume();
  const eng = await S.bootScsynth({ audioContext: ctx });
  eng.meter.fftSize = ${N};
  window.__eng = eng; window.__id = 2000;
  return eng.sonic.mode;
}`;
const PAGE_ONE = `async (p, listen) => {
  const eng = window.__eng, bytes = new Uint8Array(p.bytes);
  const d = await eng.sendAndWait((m) => (m[0] === '/done' || m[0] === '/fail') && m[1] === '/d_recv', 5000, '/d_recv', bytes);
  if (!d || d[0] !== '/done') return { done: false, why: d ? d.map(String).join(' ') : 'no answer to /d_recv' };
  const node = window.__id++;
  const go = await eng.sendAndWait((m) => (m[0] === '/n_go' && m[1] === node) || m[0] === '/fail', 3000, '/s_new', p.name, node, 0, 0);
  if (!go || go[0] !== '/n_go') return { done: false, why: go ? go.map(String).join(' ') : 'no /n_go' };
  await eng.sleep(listen);
  const x = new Float32Array(${N}); eng.meter.getFloatTimeDomainData(x);
  eng.send('/n_free', node); eng.send('/d_free', p.name);
  await eng.sleep(150);
  return { done: true, samples: Array.from(x) };
}`;

/** The ghost input: two oscillators on two stereo pairs, read back at In.ar(2, 2) and In.ar(4, 2). */
const PAGE_GHOST = `async (progs, inputChannels) => {
  const S = await import('${BASE}/shell/scsynth.mjs');
  const ctx = new AudioContext({ sampleRate: ${SR} }); await ctx.resume();
  const a = new OscillatorNode(ctx, { frequency: 300 }), b = new OscillatorNode(ctx, { frequency: 700 });
  a.start(); b.start();
  const input = S.inputPairs(ctx, [a, b]);
  const eng = await S.bootScsynth({ audioContext: ctx, input, inputChannels });
  eng.meter.fftSize = ${N};
  const got = { channels: eng.inputChannels, worklet: eng.sonic.node.input.channelCount, metrics: eng.sonic.getMetrics().audioInputChannels };
  let id = 3000;
  for (const p of progs) {
    const d = await eng.sendAndWait((m) => (m[0] === '/done' || m[0] === '/fail') && m[1] === '/d_recv', 5000, '/d_recv', new Uint8Array(p.bytes));
    if (!d || d[0] !== '/done') { got[p.id] = null; continue; }
    const node = id++;
    eng.send('/s_new', p.name, node, 0, 0);
    await eng.sleep(800);
    const x = new Float32Array(${N}); eng.meter.getFloatTimeDomainData(x);
    eng.send('/n_free', node); await eng.sleep(150);
    got[p.id] = Array.from(x);
  }
  await eng.sonic.destroy?.(); if (ctx.state !== 'closed') await ctx.close();
  return got;
}`;

const GHOST = [['bus2', '{ Mix(In.ar(2, 2)) * 0.5 }'], ['bus4', '{ Mix(In.ar(4, 2)) * 0.5 }']]
  .map(([id, src]) => ({ id, name: `G_${id}`, bytes: [...compile(src, { name: `G_${id}` }).bytes] }));

function gradeGhost(label, got, expectSecond) {
  const m2 = measure(Float64Array.from(got.bus2)), m4 = measure(Float64Array.from(got.bus4));
  const t = (m, f) => m.band(f - 3, f + 3);
  const a2 = dB(t(m2, 300), t(m2, 700)), a4 = dB(t(m4, 700), t(m4, 300));
  console.log(`  ${label}: engine ${got.channels} inputs, worklet input channelCount ${got.worklet}, metrics audioInputChannels ${got.metrics}`);
  ok(`${label}: In.ar(2, 2) hears the first pair (300 Hz) ${a2.toFixed(1)} dB over the second`, a2 >= 40 && m2.rms > 0.05, `rms ${m2.rms.toFixed(3)}`);
  if (expectSecond) ok(`${label}: In.ar(4, 2) hears the second pair (700 Hz) ${a4.toFixed(1)} dB over the first`, a4 >= 40 && m4.rms > 0.05, `rms ${m4.rms.toFixed(3)}`);
  else ok(`NEGATIVE CONTROL, ${label}: In.ar(4, 2) is silent, so the check above can fail`, m4.rms < 1e-4, `rms ${m4.rms.toExponential(2)}`);
}

async function browser() {
  const progs = programs();
  await withPage(async (run) => {
    await run(`(${PAGE_BOOT})()`);
    const got = {};
    for (const p of progs) got[p.id] = await run(`(${PAGE_ONE})(${JSON.stringify(p)}, 1200)`);
    // NEGATIVE CONTROL for /done itself: Ringz renamed Ringy, a class the engine does not have.
    const bad = Uint8Array.from(progs[0].bytes), at = Buffer.from(bad).indexOf('Ringz');
    bad[at + 4] = 'y'.charCodeAt(0);
    const u = await run(`(${PAGE_ONE})(${JSON.stringify({ name: progs[0].name, bytes: [...bad] })}, 10)`);
    const unknown = u.done ? ['/done'] : u.why.split(' ');
    head('the engine\'s own answer');
    ok('every definition answered /done /d_recv and started with /n_go', Object.values(got).every((v) => v.done), `${Object.keys(got).length} definitions`);
    ok('NEGATIVE CONTROL: a class the engine lacks (Ringy) answers /fail, not /done', unknown && unknown[0] === '/fail', unknown ? unknown.join(' ') : 'no answer');
    grade('wasm scsynth in headless Chrome', got);
    head('ghost input: a second stereo pair on busses 4 and 5');
    gradeGhost('inputChannels 4', await run(`(${PAGE_GHOST})(${JSON.stringify(GHOST)}, 4)`), true);
    gradeGhost('default boot', await run(`(${PAGE_GHOST})(${JSON.stringify(GHOST)}, 2)`), false);
  });
}

// ── 4. the container's scsynth, in NRT ────────────────────────────────────────

const IMAGE = process.env.GRAINS_IMAGE || 'grains-local';
function oscMsg(addr, args) {
  const parts = [], pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4 || 0)]);
  const str = (s) => { const b = Buffer.from(`${s}\0`, 'latin1'); return pad(b); };
  let tags = ',';
  for (const a of args) {
    if (typeof a === 'string') { tags += 's'; parts.push(str(a)); }
    else if (a instanceof Uint8Array) { tags += 'b'; const n = Buffer.alloc(4); n.writeInt32BE(a.length); parts.push(n, pad(Buffer.from(a))); }
    else if (Number.isInteger(a)) { tags += 'i'; const n = Buffer.alloc(4); n.writeInt32BE(a); parts.push(n); }
    else { tags += 'f'; const n = Buffer.alloc(4); n.writeFloatBE(a); parts.push(n); }
  }
  return Buffer.concat([str(addr), str(tags), ...parts]);
}
/** An NRT score: each entry an int32 length then a bundle. Seconds are 32.32 fixed point. */
function score(events) {
  const out = [];
  for (const [t, msgs] of events.sort((a, b) => a[0] - b[0])) {
    const tt = Buffer.alloc(8); tt.writeUInt32BE(Math.floor(t)); tt.writeUInt32BE(Math.round((t % 1) * 2 ** 32) >>> 0, 4);
    const els = msgs.flatMap((m) => { const b = oscMsg(m[0], m.slice(1)); const n = Buffer.alloc(4); n.writeInt32BE(b.length); return [n, b]; });
    const bundle = Buffer.concat([Buffer.from('#bundle\0'), tt, ...els]);
    const n = Buffer.alloc(4); n.writeInt32BE(bundle.length);
    out.push(n, bundle);
  }
  return Buffer.concat(out);
}
function wavFloat(file) {
  const b = readFileSync(file);
  let p = 12, fmt = null;
  while (p < b.length) {
    const id = b.toString('latin1', p, p + 4), len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') {
      const n = len / 4 / fmt.ch, chans = Array.from({ length: fmt.ch }, () => new Float32Array(n));
      for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) chans[c][i] = b.readFloatLE(p + 8 + (i * fmt.ch + c) * 4);
      return chans;
    }
    p += 8 + len + (len % 2);
  }
  throw new Error(`${file}: no data chunk`);
}
function haveDocker() {
  const r = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' });
  return r.status === 0;
}
/** Run a score in the image; `input` is an optional stereo float WAV. Returns the channels and the seconds it took. */
function nrt(dir, scoreBuf, seconds, input = null) {
  writeFileSync(join(dir, 'score.osc'), scoreBuf);
  const t0 = process.hrtime.bigint();
  const r = spawnSync('docker', ['run', '--rm', '--cpus', '1', '-v', `${dir}:/w`, '--entrypoint', 'sh', IMAGE, '-c',
    // The shell's own /proc stat after the wait: fields 16 and 17 are its children's user and system ticks.
    `cd /w && scsynth -N score.osc ${input ? 'in.wav' : '_'} out.wav ${SR} WAV float -o 2 -i 2 > log.txt 2>&1; cat log.txt | tail -5; echo; cat /proc/$$/stat`], { encoding: 'utf8' });
  const wall = Number(process.hrtime.bigint() - t0) / 1e9;
  const stat = (r.stdout ?? '').trim().split('\n').at(-1), f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const user = (Number(f[13]) + Number(f[14])) / 100;
  return { chans: wavFloat(join(dir, 'out.wav')), wall, user, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

async function native() {
  if (!haveDocker()) { console.log(`\n(native skipped: docker image ${IMAGE} is not here)`); return; }
  const progs = programs();
  const dir = mkdtempSync(join(tmpdir(), 'sclang-layers-'));
  try {
    const step = 2.5, listen = 1.2, ev = [];
    progs.forEach((p, i) => {
      const t = i * step + 0.01;
      ev.push([t, [['/d_recv', Uint8Array.from(p.bytes)]]]);
      ev.push([t + 0.01, [['/s_new', p.name, 2000 + i, 0, 0]]]);
      ev.push([t + 2.2, [['/n_free', 2000 + i]]]);
    });
    ev.push([progs.length * step, [['/c_set', 0, 0]]]);
    const r = nrt(dir, score(ev), progs.length * step);
    const got = {};
    progs.forEach((p, i) => {
      const s = Math.round((i * step + 0.02 + listen) * SR);
      const L0 = r.chans[0].subarray(s, s + N), R0 = r.chans[1].subarray(s, s + N);
      got[p.id] = { done: true, samples: Array.from(L0, (v, k) => 0.5 * (v + R0[k])) };
    });
    const fail = /not installed|FAILURE|not found/i.test(r.out);
    ok('native scsynth took every definition with no FAILURE or missing UGen in its log', !fail, fail ? r.out.slice(0, 300) : '');
    grade(`native scsynth 3.13 in ${IMAGE}, NRT`, got);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ── 5. CPU ────────────────────────────────────────────────────────────────────

const FREQS16 = [55, 82.5, 110, 130.8, 165, 196, 220, 261.6, 330, 392, 440, 523.3, 660, 784, 880, 1046.5];
async function loads() {
  const { PROGRAM, valuesOf, PATCHES } = await import('../granulator/grain-ring.mjs');
  const cloud = valuesOf(PATCHES.find((p) => p.name === 'Cloud'));
  const reader = (k, pitch) => `GrainBuf.ar(2, Dust.ar(40), 0.25, 0, ${pitch}, LFNoise1.kr(${0.3 + k * 0.1}).range(0, 1), 2, LFNoise1.kr(1).range(-0.8, 0.8))`;
  const L_ = {
    ring: { src: PROGRAM, set: ['buf', 0, 'inbus', 2, ...Object.entries(cloud).flat()] },
    readers3: { src: `{ (${reader(0, 1.5)} + ${reader(1, 0.75)} + ${reader(2, 2)}) * 0.2 }` },
    ringz16: { src: `{ var in = Mix(In.ar(2, 2)) * 0.05; Mix(Ringz.ar(in, [${FREQS16.join(', ')}], 2)) * 0.05 }` },
    freeverb2: { src: '{ FreeVerb2.ar(In.ar(2, 1), In.ar(3, 1), 0.5, 0.9, 0.3) }' },
    pitchshift: { src: '{ PitchShift.ar(In.ar(2, 1), 0.2, 1.5, 0.01, 0.01) }' },
  };
  for (const [k, v] of Object.entries(L_)) {
    const r = compile(v.src, { name: `C_${k}` });
    if (!r.ok) throw new Error(`${k}: ${r.message}`);
    v.name = `C_${k}`; v.bytes = [...r.bytes]; v.blocks = r.blocks; v.wires = r.wires;
  }
  return L_;
}

/**
 * The audio thread's own clock: Chrome's trace event `AudioWorkletProcessor::Process` (category
 * disabled-by-default-audio-worklet) is one render quantum of the worklet, so its summed duration over
 * the wall time is the share of the 2.67 ms budget scsynth uses. Peak is the worst quantum.
 */
async function traceLoad(c, ms) {
  const ev = [];
  const off1 = (m) => { if (m.method === 'Tracing.dataCollected') ev.push(...m.params.value); };
  c.on(off1);
  let finish;
  const done = new Promise((r) => { finish = r; });
  c.on((m) => { if (m.method === 'Tracing.tracingComplete') finish(); });
  await c.send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-audio-worklet'] }, transferMode: 'ReportEvents' });
  await new Promise((r) => setTimeout(r, ms));
  await c.send('Tracing.end');
  await done;
  const q = ev.filter((e) => e.name === 'AudioWorkletProcessor::Process' && e.ph === 'X');
  const d = q.map((e) => e.dur).sort((a, b) => a - b);
  const span = q.length ? (q.at(-1).ts + q.at(-1).dur - q[0].ts) : 1;
  ev.length = 0;
  return { n: q.length, load: d.reduce((a, b) => a + b, 0) / span, p99: d[Math.floor(d.length * 0.99)] ?? 0, max: d.at(-1) ?? 0 };
}

const PAGE_CPU_BOOT = `async () => {
  const S = await import('${BASE}/shell/scsynth.mjs');
  const ctx = new AudioContext({ sampleRate: ${SR} }); await ctx.resume();
  // Stereo noise into busses 2 and 3, so every layer works on sound and not on zeros.
  const nb = ctx.createBuffer(2, ${SR} * 2, ${SR});
  for (let c = 0; c < 2; c++) { const d = nb.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.2; }
  const src = new AudioBufferSourceNode(ctx, { buffer: nb, loop: true }); src.start();
  // The ring's SendReply is consumed here, as grain-ring.mjs does, or it fills the reply list.
  const eng = await S.bootScsynth({ audioContext: ctx, input: src, onReply: (m) => m[0] === '/grain' });
  const a = await eng.sendAndWait((m) => (m[0] === '/done' || m[0] === '/fail') && String(m[1]).startsWith('/b_alloc'), 5000, '/b_alloc', 0, 8 * ${SR}, 1);
  window.__eng = eng;
  return a && a[0];
}`;

async function cpuBrowser() {
  const lo = await loads();
  head('CPU in the browser: the worklet\'s render time per quantum from Chrome\'s trace, 6 s per row, as a share of real time');
  await withPage(async (run, b, c) => {
    ok('the 8 s ring buffer is allocated', (await run(`(${PAGE_CPU_BOOT})()`)) === '/done');
    await new Promise((r) => setTimeout(r, 3000));
    const fmt = (t) => `${(t.load * 100).toFixed(1).padStart(5)} %   p99 ${(t.p99 / 1000).toFixed(2)} ms   worst ${(t.max / 1000).toFixed(2)} ms of 2.67   (${t.n} quanta)`;
    const idle = await traceLoad(c, 6000);
    console.log(`  ${'idle engine, noise in'.padEnd(52)} ${fmt(idle)}`);
    let node = 5000;
    const rows = [];
    const start = async (k) => { const n = node++; return { n, r: await run(`(async () => { const e = window.__eng, p = ${JSON.stringify({ name: lo[k].name, bytes: lo[k].bytes, set: lo[k].set ?? [] })};
      const d = await e.sendAndWait((m) => (m[0] === '/done' || m[0] === '/fail') && m[1] === '/d_recv', 5000, '/d_recv', new Uint8Array(p.bytes));
      const g = await e.sendAndWait((m) => (m[0] === '/n_go' && m[1] === ${n}) || m[0] === '/fail', 3000, '/s_new', p.name, ${n}, 1, 0, ...p.set);
      return [d && d[0], g && g[0]]; })()`) }; };
    for (const set of [['ring'], ['readers3'], ['ringz16'], ['freeverb2'], ['pitchshift'], ['ring', 'readers3', 'ringz16', 'freeverb2', 'pitchshift']]) {
      const nodes = [];
      for (const k of set) { const s = await start(k); if (s.r[0] !== '/done' || s.r[1] !== '/n_go') console.log(`  ${k} did not start: ${s.r}`); nodes.push(s.n); }
      await new Promise((r) => setTimeout(r, 1500));
      const t = await traceLoad(c, 6000);
      rows.push([set.join(' + '), t.load - idle.load]);
      console.log(`  ${set.join(' + ').padEnd(52)} ${fmt(t)}   over idle ${((t.load - idle.load) * 100).toFixed(1)} %`);
      for (const n of nodes) await run(`window.__eng.send('/n_free', ${n})`);
      await new Promise((r) => setTimeout(r, 800));
    }
    const glitch = await run('window.__eng.sonic.getMetrics().glitchCount');
    console.log(`  glitches the engine counted over the run: ${glitch}`);
    ok('the measure moves: the ring costs more than the idle engine', rows[0][1] > 0.005, `${(rows[0][1] * 100).toFixed(1)} % over idle`);
  });
}

async function cpuNative() {
  const lo = await loads();
  if (!haveDocker()) { console.log(`\n(native CPU skipped: docker image ${IMAGE} is not here)`); return; }
  head(`CPU natively: scsynth 3.13 in ${IMAGE} (--cpus 1), NRT, CPU seconds per second of sound rendered`);
  const dir = mkdtempSync(join(tmpdir(), 'sclang-layers-cpu-'));
  try {
    // A stereo float WAV of noise for the input busses.
    const S_ = 120, n = S_ * SR, data = Buffer.alloc(n * 8);
    for (let i = 0; i < n * 2; i++) data.writeFloatLE((Math.random() * 2 - 1) * 0.2, i * 4);
    const hdr = Buffer.alloc(44); hdr.write('RIFF'); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16);
    hdr.writeUInt16LE(3, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 8, 28); hdr.writeUInt16LE(8, 32); hdr.writeUInt16LE(32, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
    writeFileSync(join(dir, 'in.wav'), Buffer.concat([hdr, data]));
    const run1 = (keys) => {
      const ev = [[0, [['/b_alloc', 0, 8 * SR, 1]]]];
      keys.forEach((k, i) => { ev.push([0.001, [['/d_recv', Uint8Array.from(lo[k].bytes)]]]); ev.push([0.01, [['/s_new', lo[k].name, 5000 + i, 1, 0, ...(lo[k].set ?? [])]]]); });
      ev.push([S_, [['/c_set', 0, 0]]]);
      return nrt(dir, score(ev), S_, true);
    };
    const empty = run1([]);
    if (process.env.LAYERS_DEBUG) console.log(empty.out);
    console.log(`  nothing playing: ${(empty.user / S_ * 100).toFixed(2)} % (user+sys ${empty.user} s for ${S_} s)`);
    for (const set of [['ring'], ['readers3'], ['ringz16'], ['freeverb2'], ['pitchshift'], ['ring', 'readers3', 'ringz16', 'freeverb2', 'pitchshift']]) {
      const r = run1(set);
      const x = r.chans[0].subarray(10 * SR); let sq = 0; for (const v of x) sq += v * v;
      console.log(`  ${set.join(' + ').padEnd(52)} ${(((r.user - empty.user) / S_) * 100).toFixed(2).padStart(6)} % of a core  (user+sys ${r.user} s for ${S_} s, output rms ${Math.sqrt(sq / x.length).toFixed(3)})`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ── run ───────────────────────────────────────────────────────────────────────

structure();
if (argv.includes('--browser')) await browser();
if (argv.includes('--native')) await native();
if (argv.includes('--cpu') || argv.includes('--cpu-browser')) await cpuBrowser();
if (argv.includes('--cpu') || argv.includes('--cpu-native')) await cpuNative();
console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
