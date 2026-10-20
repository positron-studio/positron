// node workers/edgecast/chain-test.mjs: edgecast's live changes against the real engine (the vendored wasm
// scsynth, booted by chain.mjs in node as the Durable Object boots it), fed two tones a fifth apart with the upper
// one pulsing. No socket, no Cloudflare. Most checks are NEGATIVE CONTROLS: a refusal must name its reason, and the
// sound must go on after it. Prints the measured numbers as JSON at the end.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { startChain, createInserts, LIMITS, SR } from './chain.mjs';
import { QUANTUM } from './engine.mjs';

const here = (p) => new URL(p, import.meta.url);
if (!existsSync(here('./glue.gen.mjs'))) execFileSync(process.execPath, [here('./gen-glue.mjs').pathname]);
const glue = (await import('./glue.gen.mjs')).default;
const wasmModule = await WebAssembly.compile(readFileSync(here('../../demo/shell/vendor/scsynth-nrt.wasm')));

let pass = 0, fail = 0;
const A = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };
const tick = () => new Promise((r) => setTimeout(r, 0));
const db = (x) => 20 * Math.log10(Math.max(1e-9, x));

const chain = await startChain({ wasmModule, glue, mode: 'full', seed: 7 });
// the clock the inserts read: audio time, so "one program a second" is a second of sound here
let frame = 0;
const ins = createInserts(chain, { now: () => frame / SR * 1000 });

// the input: 220 Hz and 330 Hz, the 330 pulsing at 2 Hz, -12 dBFS-ish
const tone = (c, b) => {
  if (c > 1) { b.fill(0); return; }
  for (let i = 0; i < QUANTUM; i++) {
    const t = (frame + i) / SR, pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t);
    b[i] = 0.18 * Math.sin(2 * Math.PI * 220 * t) + 0.12 * pulse * Math.sin(2 * Math.PI * 330 * t);
  }
};
const work = [];
/** Run `secs` of audio, a tick every 8 quanta so replies and timers land; answers RMS per 20 ms block. */
async function run(secs) {
  const blocks = [];
  let acc = 0, n = 0;
  const q = Math.round(secs * SR / QUANTUM);
  for (let k = 0; k < q; k++) {
    const p0 = performance.now();
    const y = chain.w.quantum(tone);
    work.push(performance.now() - p0);
    frame += QUANTUM;
    for (let i = 0; i < QUANTUM; i++) acc += (y[0][i] * y[0][i] + y[1][i] * y[1][i]) / 2;
    n += QUANTUM;
    if (n >= 960) { blocks.push(Math.sqrt(acc / n)); acc = 0; n = 0; }
    if (k % 8 === 7) await tick();
  }
  return blocks;
}
const rms = (b) => Math.sqrt(b.reduce((s, x) => s + x * x, 0) / b.length);
/** Send while the audio runs, as the socket's frames do; answers the reply and the RMS blocks after it. */
async function live(fn, secs) {
  let answer = null;
  const p = Promise.resolve(fn()).then((a) => { answer = a; });
  const at = frame;
  const blocks = await run(secs);
  await p;
  return { answer, blocks, at };
}
const msPerQuantum = (from) => { const s = work.slice(from).sort((a, b) => a - b); return { median: +s[s.length >> 1].toFixed(4), p99: +s[Math.floor(s.length * 0.99)].toFixed(4), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(4) }; };

A('the chain boots with two insert slots, each holding a through program', chain.slots?.length === 2 && chain.slots.every((s) => s.def.endsWith('_0')), JSON.stringify(ins.slots));
await run(8);
let w0 = work.length;
const base = await run(4);
const cpuThrough = msPerQuantum(w0);
const baseRms = rms(base);
A('what comes out through both through slots is sound', baseRms > 0.02, `rms ${db(baseRms).toFixed(1)} dBFS`);

// 1. a gain of 0.25 after the master: heard exactly as written, about -12 dB, within a frame or two
const gain = '{ In.ar(\\in.kr(0), 2) * \\gain.kr(0.25) }';
const g1 = await live(() => ins.program({ slot: 1, src: gain }), 4);
A('a program after the master compiles and goes in', g1.answer?.program?.ok === true, JSON.stringify(g1.answer));
const afterRms = rms(g1.blocks.slice(25));
const drop1 = db(afterRms) - db(baseRms);
A('a gain of 0.25 after the master takes about 12 dB off what comes out', drop1 < -10 && drop1 > -14, `${drop1.toFixed(2)} dB`);
const firstLow = g1.blocks.findIndex((b) => db(b) < db(baseRms) - 8);
A('the change is heard within 100 ms of the send', firstLow >= 0 && firstLow * 20 <= 100, `first quieter 20 ms block: ${firstLow}`);
const gap = g1.blocks.slice(0, 25).some((b) => b < baseRms * 0.05);
A('there is no gap of silence at the swap', !gap, `lowest block ${db(Math.min(...g1.blocks.slice(0, 25))).toFixed(1)} dBFS`);

// 2. a parameter live: gain 1 on that program brings it back
const s1 = await live(() => ins.set({ slot: 1, params: { gain: 1 } }), 2);
const up = db(rms(s1.blocks.slice(10))) - db(afterRms);
A('set moves the program\'s own parameter, and the level comes back', s1.answer?.set?.ok && up > 10, `${up.toFixed(2)} dB, ${JSON.stringify(s1.answer)}`);
const clamp = ins.set({ slot: 1, params: { gain: 99 } });
A('set clamps to the control\'s range', clamp.set.applied.gain === 1, JSON.stringify(clamp));
const noIn = ins.set({ slot: 1, params: { in: 4, nope: 1 } });
A('NEGATIVE CONTROL: set refuses `in` and a name the program does not have', !noIn.set.ok && noIn.set.refused.includes('in') && noIn.set.refused.includes('nope') && !('in' in noIn.set.applied), JSON.stringify(noIn));
const ring = ins.set({ slot: 'ring', params: { speed: 99, bogus: 1 } });
A('set on the ring clamps by PATCH_LIMITS and names what it dropped', ring.set.applied.speed === 4 && ring.set.refused.includes('bogus'), JSON.stringify(ring));

// 3. the refusals, each with its reason, and the sound goes on
await run(1.1);
const lvl = rms(await run(1));
let fast = null;
const broken = await live(async () => { const a = await ins.program({ slot: 1, src: '{ In.ar(\\in.kr(0), 2) * SinOsc.ar(' }); fast = await ins.program({ slot: 1, src: gain }); return a; }, 1);
A('NEGATIVE CONTROL: a program that does not compile is refused with the compiler\'s message', broken.answer.program.ok === false && /line \d+, column \d+/.test(broken.answer.program.error), broken.answer.program.error);
A('and the sound goes on at the level it had', Math.abs(db(rms(broken.blocks)) - db(lvl)) < 3, `${db(rms(broken.blocks)).toFixed(1)} against ${db(lvl).toFixed(1)}`);
A('NEGATIVE CONTROL: a second program inside a second is refused', fast.program.ok === false && /one program a second/.test(fast.program.error), fast.program.error);
await run(1.1);
const big = await ins.program({ slot: 1, src: `{ In.ar(\\in.kr(0), 2) /*${'x'.repeat(LIMITS.srcBytes)}*/ }` });
A('NEGATIVE CONTROL: a program over 8 KB is refused before it is compiled', big.program.ok === false && /bytes/.test(big.program.error), big.program.error);
await run(1.1);
const frees = await ins.program({ slot: 1, src: '{ In.ar(\\in.kr(0), 2) * EnvGen.kr(Env.perc(0.01, 1), doneAction: 2) }' });
A('NEGATIVE CONTROL: a program that frees itself is refused, so its slot cannot go silent', frees.program.ok === false && /frees itself/.test(frees.program.error), frees.program.error);
await run(1.1);
const noslot = await ins.program({ slot: 2, src: gain });
A('NEGATIVE CONTROL: a slot that does not exist is refused', noslot.program.ok === false && /no slot/.test(noslot.program.error), noslot.program.error);
await run(1.1);
const evalish = await ins.program({ slot: 1, src: '{ "x".interpret }' });
A('NEGATIVE CONTROL: anything outside the whitelist is a compile error, not code', evalish.program.ok === false, evalish.program.error);

// 4. before the master: an echo, the CPU it costs, and the leveller that undoes a gain there
await run(1.1);
const echo = '{ var x = In.ar(\\in.kr(0), 2); var t = \\time.kr(0.35, spec: [0.05, 1]); x + (CombC.ar(x, 1, t, t * 6) * \\mix.kr(0.3)) }';
w0 = work.length;
const e = await live(() => ins.program({ slot: 0, src: echo }), 5);
const cpuEcho = msPerQuantum(w0 + Math.round(SR / QUANTUM));
A('an echo goes in before the master', e.answer?.program?.ok === true, JSON.stringify(e.answer?.program));
A('its answer lists its knobs with their ranges, and not `in`', e.answer.program.controls.map((c) => c.name).join() === 'time,mix' && e.answer.program.controls[0].spec.max === 1, JSON.stringify(e.answer.program.controls));
const mixSet = await live(() => ins.set({ slot: 0, params: { mix: 0 } }), 0.2);
A('a knob on the echo is applied', mixSet.answer.set.ok && mixSet.answer.set.applied.mix === 0, JSON.stringify(mixSet.answer));
await run(1.1);
const g0 = await live(() => ins.program({ slot: 0, src: gain }), 12);
const second = (k) => db(rms(g0.blocks.slice(k * 50, k * 50 + 50))) - db(lvl);
const curve = Array.from({ length: 12 }, (_, k) => +second(k).toFixed(1));
A('a gain of 0.25 before the master drops at once and the leveller lifts it back', curve[0] < -4 && curve[11] > curve[0] + 4, `dB against before, per second: ${curve.join(' ')}`);

console.log(JSON.stringify({
  baseRmsDb: +db(baseRms).toFixed(2), postGainDropDb: +drop1.toFixed(2), firstQuieterBlock20ms: firstLow,
  programMs: { post: g1.answer.program.ms, pre: e.answer.program.ms, compileMs: +g1.answer.program.compileMs.toFixed(2), echoCompileMs: +e.answer.program.compileMs.toFixed(2) },
  cpuPerQuantumMs: { through: cpuThrough, echoBefore: cpuEcho, framesPer20ms: 7.5 },
  preGainCurveDb: curve,
}, null, 1));
console.log(`${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
