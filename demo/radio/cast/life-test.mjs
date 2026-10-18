// node demo/radio/cast/life-test.mjs: the living sound's planner, no browser. Most of these are
// negative controls: a life that repeats, reuses a control or leaves the granulator on at a seam fails.
import { createLife, envelope, swell, MOVABLE, FRESH, LENGTHS, INTERLUDE, toT } from './life.mjs';

let ok = 0, bad = 0;
const check = (name, pass, detail = '') => { if (pass) ok++; else { bad++; console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`); } };
const N = 300, life = createLife({ seed: 1 }), S = Array.from({ length: N }, (_, i) => life.scene(i));

check('the envelope and the swell are 0 at both ends and 1 at the top', envelope(0) === 0 && envelope(1) === 0 && envelope(0.5) === 1 && swell(0) === 0 && swell(1) === 0 && Math.abs(swell(0.5) - 1) < 1e-12);
check('no scene has the patch of the one before it', S.every((s, i) => !i || s.patch !== S[i - 1].patch));
const order = S.flatMap((s) => [s.param, s.interlude.param]);
const reused = (list) => list.findIndex((p, i) => list.slice(Math.max(0, i - FRESH), i).includes(p));
check(`no control is moved again within ${FRESH} movements, scenes and interludes together`, reused(order) === -1, `at ${reused(order)}`);
check('NEGATIVE CONTROL: the freshness check catches a control moved twice in a row', reused(['size', 'pitch', 'pitch']) === 2);
check('the interlude never moves the control its scene moved', S.every((s) => s.param !== s.interlude.param));
check('never three scenes of one length in a row', S.every((s, i) => i < 2 || !(s.len === S[i - 1].len && s.len === S[i - 2].len)));
check('every length kind and every control is used', Object.keys(LENGTHS).every((k) => S.some((s) => s.len === k)) && Object.keys(MOVABLE).every((k) => order.includes(k)));
check('the clock can carry every scene: dwell within 5..600 s, blend within the interlude range and 2..120 s',
  S.every((s) => s.dwell >= 5 && s.dwell <= 600 && s.interlude.blend >= INTERLUDE[0] && s.interlude.blend <= INTERLUDE[1]));
const key = (s) => `${s.patch}|${s.param}|${s.len}|${s.interlude.param}`;
const period = (keys) => { for (let p = 1; p <= 40; p++) if (keys.slice(0, 120).every((k, i) => k === keys[i + p])) return p; return 0; };
check('it does not repeat: no period up to 40 scenes in the first 160', period(S.map(key)) === 0);
check('the patches alone do not loop either, and all ten are used', period(S.map((s) => s.patch)) === 0 && new Set(S.map((s) => s.patch)).size === 10);
check('NEGATIVE CONTROL: the period check finds a loop of 3', period(Array.from({ length: 200 }, (_, i) => String(i % 3))) === 3);

// one scene, sampled: dry at the seams, one movement in the middle, every value in range
const inRange = (k, v) => v >= MOVABLE[k][0] - 1e-9 && v <= MOVABLE[k][1] + 1e-9;
let seams = true, range = true, oneMove = true, light = true, faster = true;
for (let i = 0; i < 60; i++) {
  const s = S[i], at = (x) => life.inScene(i, x * s.dwell);
  if (at(0).wet !== 0 || at(1).wet !== 0 || life.inInterlude(i, 0).wet !== 0 || life.inInterlude(i, s.interlude.blend).wet !== 0) seams = false;
  const xs = Array.from({ length: 101 }, (_, j) => at(j / 100)), ys = Array.from({ length: 101 }, (_, j) => life.inInterlude(i, (j / 100) * s.interlude.blend));
  if (![...xs, ...ys].every((v) => inRange(v.param, v.value) && v.wet >= 0 && v.wet <= 1)) range = false;
  // one reach: the control's travel is monotone apart from the hand's settle at the end
  const t = xs.map((v) => toT(s.param, v.value)), turns = t.slice(2).filter((v, j) => Math.sign(v - t[j + 1]) * Math.sign(t[j + 1] - t[j]) < 0 && Math.abs(v - t[j + 1]) > 1e-4).length;
  if (turns > 1 || Math.abs(t[85] - t[15]) < 0.2) oneMove = false;
  if (Math.max(...ys.map((v) => v.wet)) > 0.36 || Math.max(...ys.map((v) => v.wet)) >= s.peak) light = false;
  const u = ys.map((v) => toT(v.param, v.value)), uTurns = u.slice(2).filter((v, j) => Math.sign(v - u[j + 1]) * Math.sign(u[j + 1] - u[j]) < 0).length;
  if (uTurns < 2) faster = false;
}
check('the granulator is out at every seam: a scene starts and ends dry, so does its interlude', seams);
check('every value stays in its control\'s range and the wet in 0..1', range);
check('a scene is ONE movement: the control travels one way across its window, at most one turn (the settle)', oneMove);
check('an interlude is lighter than its scene: wet at most 0.35 and below the scene\'s peak', light);
check('an interlude moves faster: its control turns at least twice in one blend', faster);
const first = (seed) => { const l = createLife({ seed }); return Array.from({ length: 20 }, (_, k) => key(l.scene(k))).join(); };
check('the same seed is the same life, another seed another', first(1) === S.slice(0, 20).map(key).join() && first(2) !== first(1));
console.log(`life-test: ${ok}/${ok + bad}`);
process.exit(bad ? 1 : 0);
