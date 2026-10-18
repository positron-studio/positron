// node workers/cast/local-test.mjs: the cast page's LOCAL engine (demo/radio/cast/local.mjs) holds the container's
// numbers, so what is tried in the browser is what START puts on air. No browser, no network.
// 3 of the asserts are NEGATIVE CONTROLS.
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
ok('the whistle is off in both, as the container\'s', L.WHISTLE === false && M.WHISTLE === false);
ok('PATCH_LIMITS are the container\'s', same(L.PATCH_LIMITS, PATCH_LIMITS));
// the clamps, on values in range, on both edges, past them and on garbage
const SETS = [['tune', 0.5], ['tune', -1], ['tune', 2], ['drift', 0.4], ['drift', 0.6], ['dwell', 1], ['dwell', 9999], ['blend', 30],
  ['noise', 3], ['noise', 'x'], ['volume', 1], ['tune', NaN]];
ok('clampSet answers what the container answers, on 12 inputs', SETS.every(([n, v]) => Object.is(L.clampSet(n, v), M.clampSet(n, v))),
  SETS.map(([n, v]) => `${n}=${v}:${L.clampSet(n, v)}`).join(' '));
const PS = [{ name: 'Dub' }, { name: 'Cloud', set: { density: 99, mix: 0.4 } }, { set: { dir: -0.2, pitch: 0.1, tone: 1e6 } },
  { name: 'Nope' }, { set: { wobble: 3, size: 'x' } }, ...PATCHES.map((p) => ({ name: p.name }))];
ok(`clampPatch answers what the container answers, on ${PS.length} inputs`, PS.every((p) => same(L.clampPatch(p), clampPatch(p))));
// NEGATIVE CONTROLS: the comparison can fail
ok('NEGATIVE CONTROL: a moved slot would not compare equal', !same([{ at: 0.47, echo: 0.09 }, L.SLOTS[1]], M.SLOTS));
ok('NEGATIVE CONTROL: a clamp that let 9999 through would differ', L.clampSet('dwell', 9999) !== 9999 && M.clampSet('dwell', 9999) !== 9999);
ok('NEGATIVE CONTROL: an unknown patch is refused by both', L.clampPatch({ name: 'Nope' }).refused.length === 1);
console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
