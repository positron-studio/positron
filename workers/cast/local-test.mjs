// node workers/cast/local-test.mjs: the cast page's LOCAL engine (demo/radio/cast/local.mjs) holds the container's
// numbers, so what is tried in the browser is what START puts on air. No browser, no network.
// 6 of the asserts are NEGATIVE CONTROLS.
import * as L from '../../demo/radio/cast/local.mjs';
import * as M from './container/mixer.mjs';
import { clampPatch, PATCH_LIMITS } from './container/grain-patch.mjs';
import { PATCHES } from './container/sc/granulator/grain-ring.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok('SLOTS are the container\'s', same(L.SLOTS, M.SLOTS), JSON.stringify(L.SLOTS));
ok('mix DEFAULTS are the container\'s', same(L.DEFAULTS, M.DEFAULTS), JSON.stringify(L.DEFAULTS));
ok('mix LIMITS are the container\'s', same(L.LIMITS, M.LIMITS));
ok('SR is the container\'s 44100', L.SR === M.SR);
ok('both carry the soft whistle, as the container\'s', L.WHISTLE === true && M.WHISTLE === true);
ok('PATCH_LIMITS are the container\'s', same(L.PATCH_LIMITS, PATCH_LIMITS));
// the clamps, on values in range, on both edges, past them and on garbage
const SETS = [['tune', 0.5], ['tune', -1], ['tune', 2], ['drift', 0.4], ['drift', 0.6], ['dwell', 1], ['dwell', 9999], ['blend', 30],
  ['noise', 3], ['noise', 'x'], ['volume', 1], ['tune', NaN]];
ok('clampSet answers what the container answers, on 12 inputs', SETS.every(([n, v]) => Object.is(L.clampSet(n, v), M.clampSet(n, v))),
  SETS.map(([n, v]) => `${n}=${v}:${L.clampSet(n, v)}`).join(' '));
const PS = [{ name: 'Dub' }, { name: 'Cloud', set: { density: 99, mix: 0.4 } }, { set: { dir: -0.2, pitch: 0.1, tone: 1e6 } },
  { name: 'Nope' }, { set: { wobble: 3, size: 'x' } }, ...PATCHES.map((p) => ({ name: p.name }))];
ok(`clampPatch answers what the container answers, on ${PS.length} inputs`, PS.every((p) => same(L.clampPatch(p), clampPatch(p))));
// the level: one gain per file, in dB from the feed, clamped the same, applied right after each engine's source
ok('GAIN_DB is the container\'s', same(L.GAIN_DB, M.GAIN_DB), JSON.stringify(L.GAIN_DB));
const GS = [-30, -14, -8.2, 0, 3.8, 12, 30, '6', '', 'x', null, undefined, NaN, Infinity];
ok(`levelOf answers what the container answers, on ${GS.length} inputs`, GS.every((g) => Object.is(L.levelOf(g), M.levelOf(g))),
  GS.map((g) => `${String(g)}:${+L.levelOf(g).toFixed(4)}`).join(' '));
// the page's engine on a fake AudioContext that records every node and edge
function fakeCtx() {
  const made = [], edges = [];
  const param = (v) => ({ value: v, setTargetAtTime() {} });
  const node = (kind, extra = {}) => { const n = { kind, connect(t) { edges.push([n, t]); return t; }, disconnect() {}, ...extra }; made.push(n); return n; };
  return { made, edges, sampleRate: 44100, currentTime: 0, destination: node('destination'),
    resume: async () => {}, suspend: async () => {},
    createBiquadFilter: () => node('biquad', { type: 'lowpass', frequency: param(350), Q: param(1) }),
    createWaveShaper: () => node('shaper', { curve: null }),
    createGain: () => node('gain', { gain: param(1) }),
    createOscillator: () => node('osc', { type: 'sine', frequency: param(440), start() {} }),
    createDelay: () => node('delay', { delayTime: param(0) }),
    createBuffer: (ch, n, sr) => { const d = new Float32Array(n); return { sampleRate: sr, getChannelData: () => d }; },
    createBufferSource: () => node('buffer', { start() {} }),
    createAnalyser: () => node('analyser', { fftSize: 2048 }),
    createMediaElementSource: (el) => node('media', { el }) };
}
let fctx;
globalThis.AudioContext = function () { fctx = fakeCtx(); return fctx; };
globalThis.Audio = function () { return { readyState: 4, currentTime: 0, ended: false, addEventListener() {}, removeAttribute() {}, load() {}, pause() {}, play: async () => {} }; };
async function localLevel(gain) {
  const loc = L.createLocal({ fileUrl: (it) => `/file/${it.id}` });
  await loc.start({ queue: [{ id: 'a', title: 'A', gain }, { id: 'b', title: 'B' }], mode: 'mix' });
  const st = loc.status(); loc.stop();
  const media = fctx.made.find((n) => n.kind === 'media'), out = (n) => fctx.edges.filter(([a]) => a === n).map(([, b]) => b);
  const bus = out(media)[0], level = out(bus).find((n) => n.kind === 'gain' && out(n).some((x) => x.kind === 'gain' && out(x).length >= 2));
  return { value: level?.gain.value, toLeg: !!level, st };
}
// the container's engine on a steady tone, one second of its slot meter
function containerLevel(gain) {
  const tone = () => { let i = 0; return { buffered: 8, underrun: 0, ended: false, read(n) { const o = new Float32Array(n); for (let k = 0; k < n; k++, i++) o[k] = 0.25 * Math.sin(2 * Math.PI * 700 * i / 44100); return o; }, close() {} }; };
  const e = M.createEngine({ open: tone, queue: [{ id: 'a', title: 'A', gain }], set: { drift: 0, tune: M.SLOTS[0].at, noise: 0 }, rand: M.seeded(1) });
  e.start(); for (let b = 0; b < 100; b++) e.block();
  return { slot: e.meter.slot[0], st: e.status() };
}
const lv = await localLevel(-8.2), lv0 = await localLevel(undefined), cv = containerLevel(-8.2), cv0 = containerLevel(undefined);
ok('LOCAL: the media element reaches its tuner leg through a gain set to levelOf(the item\'s gain)', lv.toLeg && Object.is(lv.value, M.levelOf(-8.2)), `${lv.value}`);
ok('LOCAL: an item with no gain plays at 1', lv0.value === 1);
ok('both engines report the same gain on the slot', lv.st.slots[0].gain === -8.2 && cv.st.slots[0].gain === -8.2, `${lv.st.slots[0].gain} and ${cv.st.slots[0].gain}`);
ok('the container: the slot\'s part is 8.2 dB under the same file with no gain', Math.abs(cv.slot - cv0.slot + 8.2) <= 0.1, `${cv0.slot} and ${cv.slot} dB`);
ok('both clamp 30 dB to the cap', containerLevel(30).st.slots[0].gain === M.GAIN_DB[1] && (await localLevel(30)).st.slots[0].gain === M.GAIN_DB[1]);
// NEGATIVE CONTROLS: the comparison can fail
ok('NEGATIVE CONTROL: a level with the sign turned would not compare equal', !Object.is(L.levelOf(8.2), M.levelOf(-8.2)));
ok('NEGATIVE CONTROL: the meter sees a gain the engine ignores', Math.abs(cv0.slot - containerLevel(0).slot) <= 0.05 && Math.abs(containerLevel(-3).slot - cv0.slot + 3) <= 0.1);
ok('NEGATIVE CONTROL: a file at -8.2 and one at 0 do not land on one level node value', lv.value !== lv0.value);
ok('NEGATIVE CONTROL: a moved slot would not compare equal', !same([{ at: 0.47, echo: 0.09 }, L.SLOTS[1]], M.SLOTS));
ok('NEGATIVE CONTROL: a clamp that let 9999 through would differ', L.clampSet('dwell', 9999) !== 9999 && M.clampSet('dwell', 9999) !== 9999);
ok('NEGATIVE CONTROL: an unknown patch is refused by both', L.clampPatch({ name: 'Nope' }).refused.length === 1);
console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
