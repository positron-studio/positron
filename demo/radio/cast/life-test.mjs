// node demo/radio/cast/life-test.mjs: the living sound's planner, no browser. Most of these are
// negative controls: a life that repeats, reuses a control, leaves the granulator on at a seam, or
// ignores a vote fails.
import { createLife, tasteOf, sceneId, coreId, envelope, swell, MOVABLE, FRESH, LENGTHS, INTERLUDE, toT } from './life.mjs';

let ok = 0, bad = 0;
const check = (name, pass, detail = '') => { if (pass) ok++; else { bad++; console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`); } };
const N = 300, many = (life, n = N) => Array.from({ length: n }, (_, i) => life.scene(i));
const life = createLife({ seed: 1 }), S = many(life);
const reused = (list) => list.findIndex((p, i) => list.slice(Math.max(0, i - FRESH), i).includes(p));
const period = (keys) => { for (let p = 1; p <= 40; p++) if (keys.slice(0, 120).every((k, i) => k === keys[i + p])) return p; return 0; };
const key = (s) => `${s.patch}|${s.param}|${s.len}|${s.iParam}`;
function rules(name, S) {
  check(`${name}: no scene has the patch of the one before it`, S.every((s, i) => !i || s.patch !== S[i - 1].patch));
  const order = S.flatMap((s) => [s.param, s.iParam]);
  check(`${name}: no control is moved again within ${FRESH} movements`, reused(order) === -1, `at ${reused(order)}`);
  check(`${name}: never three scenes of one length in a row`, S.every((s, i) => i < 2 || !(s.len === S[i - 1].len && s.len === S[i - 2].len)));
  check(`${name}: it does not loop, scenes or patches`, period(S.map(key)) === 0 && period(S.map((s) => s.patch)) === 0);
}

check('the envelope and the swell are 0 at both ends and 1 at the top', envelope(0) === 0 && envelope(1) === 0 && envelope(0.5) === 1 && swell(0) === 0 && swell(1) === 0 && Math.abs(swell(0.5) - 1) < 1e-12);
rules('no votes', S);
check('NEGATIVE CONTROL: the freshness check catches a control moved twice in a row', reused(['size', 'pitch', 'pitch']) === 2);
check('NEGATIVE CONTROL: the period check finds a loop of 3', period(Array.from({ length: 200 }, (_, i) => String(i % 3))) === 3);
check('every length kind, every control and all ten patches are used', Object.keys(LENGTHS).every((k) => S.some((s) => s.len === k))
  && Object.keys(MOVABLE).every((k) => S.some((s) => s.param === k)) && new Set(S.map((s) => s.patch)).size === 10);
check('the clock can carry every scene: dwell within 5..600 s, blend within the interlude range',
  S.every((s) => s.dwell >= 5 && s.dwell <= 600 && s.blend >= INTERLUDE[0] && s.blend <= INTERLUDE[1]));

const inRange = (k, v) => v >= MOVABLE[k][0] - 1e-9 && v <= MOVABLE[k][1] + 1e-9;
let seams = true, range = true, oneMove = true, light = true, faster = true;
for (let i = 0; i < 60; i++) {
  const s = S[i], at = (x) => life.inScene(i, x * s.dwell);
  if (at(0).wet !== 0 || at(1).wet !== 0 || life.inInterlude(i, 0).wet !== 0 || life.inInterlude(i, s.blend).wet !== 0) seams = false;
  const xs = Array.from({ length: 101 }, (_, j) => at(j / 100)), ys = Array.from({ length: 101 }, (_, j) => life.inInterlude(i, (j / 100) * s.blend));
  if (![...xs, ...ys].every((v) => inRange(v.param, v.value) && v.wet >= 0 && v.wet <= 1)) range = false;
  const t = xs.map((v) => toT(s.param, v.value)), turns = t.slice(2).filter((v, j) => Math.sign(v - t[j + 1]) * Math.sign(t[j + 1] - t[j]) < 0 && Math.abs(v - t[j + 1]) > 1e-4).length;
  if (turns > 1 || Math.abs(t[85] - t[15]) < 0.2) oneMove = false;
  if (Math.max(...ys.map((v) => v.wet)) > 0.36 || Math.max(...ys.map((v) => v.wet)) >= s.peak) light = false;
  const u = ys.map((v) => toT(v.param, v.value)), uTurns = u.slice(2).filter((v, j) => Math.sign(v - u[j + 1]) * Math.sign(u[j + 1] - u[j]) < 0).length;
  if (uTurns < 2) faster = false;
}
check('the granulator is out at every seam', seams);
check('every value stays in its control\'s range and the wet in 0..1', range);
check('a scene is ONE movement: one way across its window, at most one turn (the settle)', oneMove);
check('an interlude is lighter than its scene', light);
check('an interlude moves faster: its control turns at least twice in one blend', faster);
const first = (o) => { const l = createLife(o); return many(l, 20).map(key).join(); };
check('the same seed and votes are the same life, another seed another', first({ seed: 1 }) === S.slice(0, 20).map(key).join() && first({ seed: 2 }) !== first({ seed: 1 }));
check('a scene\'s def is plain JSON that rebuilds the same id', S.slice(0, 20).every((s) => sceneId(JSON.parse(JSON.stringify(life.defOf(s)))) === s.id));

// votes: liked scenes come back as variations and their patch and control come up more; disliked ones less
const liked = S[3], hated = S[5];
const votes = [...Array(3)].map(() => ({ def: life.defOf(liked), vote: 3 })).concat([...Array(3)].map(() => ({ def: life.defOf(hated), vote: 1 })));
const taste = tasteOf(votes);
check('the votes are read: a liked scene, a disliked one, and scores per patch and control',
  taste.liked.length === 1 && taste.liked[0].score === 3 && taste.disliked[0] === coreId(hated) && taste.patch[liked.patch] >= 3 - (liked.patch === hated.patch ? 3 : 0));
check('NEGATIVE CONTROL: a vote with no def, an unknown patch or a number off the scale counts for nothing',
  tasteOf([{ vote: 3 }, { def: { patch: 'Nope', param: 'size' }, vote: 3 }, { def: life.defOf(liked), vote: 0 }, { def: life.defOf(liked), vote: 7 }]).liked.length === 0);
const share = (L, f) => L.filter(f).length / L.length;
const V = many(createLife({ seed: 1, votes }));
rules('with votes', V);
const isVar = (s) => s.from === liked.id;
check('liked scenes come back as variations, one thing changed', V.filter(isVar).length >= 30
  && V.filter(isVar).every((s) => s.patch === liked.patch && s.param === liked.param && (s.len !== liked.len || s.lo !== liked.lo || s.iParam !== liked.iParam)), `${V.filter(isVar).length} variations`);
check('the liked patch plays more than without votes', share(V, (s) => s.patch === liked.patch) > share(S, (s) => s.patch === liked.patch) * 1.5,
  `${share(S, (s) => s.patch === liked.patch).toFixed(2)} to ${share(V, (s) => s.patch === liked.patch).toFixed(2)}`);
check('the disliked scene does not come back as it was', !V.some((s) => coreId(s) === coreId(hated)));
if (hated.patch !== liked.patch) check('the disliked patch plays less', share(V, (s) => s.patch === hated.patch) < share(S, (s) => s.patch === hated.patch),
  `${share(S, (s) => s.patch === hated.patch).toFixed(2)} to ${share(V, (s) => s.patch === hated.patch).toFixed(2)}`);
check('the liked patch comes up more even among new scenes, not only as variations',
  share(V.filter((s) => !s.from), (s) => s.patch === liked.patch) > share(S, (s) => s.patch === liked.patch) * 1.3,
  `${share(S, (s) => s.patch === liked.patch).toFixed(2)} to ${share(V.filter((s) => !s.from), (s) => s.patch === liked.patch).toFixed(2)}`);
// dislikes alone, over a long life: the exact scene never, its patch and control together rarely
const B = many(createLife({ seed: 9 }), 1500), D = many(createLife({ seed: 9, votes: [...Array(3)].map(() => ({ def: life.defOf(B[40]), vote: 1 })) }), 1500);
const pairOf = (x) => (s) => s.patch === x.patch && s.param === x.param;
const banned = B.slice(0, 40).map(coreId), Dall = many(createLife({ seed: 9, votes: B.slice(0, 40).map((x) => ({ def: life.defOf(x), vote: 1 })) }), 400);
check('a disliked scene never comes back as it was: the same seed without the votes plays all 40, with them none', !Dall.some((x) => banned.includes(coreId(x))) && banned.length === 40);
check('its patch and control together come up at most half as often', D.filter(pairOf(B[40])).length * 2 <= B.filter(pairOf(B[40])).length,
  `${B.filter(pairOf(B[40])).length} to ${D.filter(pairOf(B[40])).length}`);
const g = tasteOf([{ def: life.defOf(liked), vote: 4 }]), m = tasteOf([{ def: life.defOf(liked), vote: 2 }]);
check('great counts twice a good, and meh leans away: no vote sits in the middle', g.liked[0]?.score === 2 && m.patch[liked.patch] === -1 && m.liked.length === 0
  && tasteOf([{ def: life.defOf(liked), vote: 3 }]).liked[0]?.score === 1);
// learning a kind: great on long scenes heavy with granulator, bad on short ones, across patches
const Z = many(createLife({ seed: 5 }), 600), longHeavy = Z.filter((x) => x.len === 'long' && x.peak > 0.75).slice(0, 8), short = Z.filter((x) => x.len === 'short').slice(0, 8);
const K = many(createLife({ seed: 5, votes: [...longHeavy.map((x) => ({ def: life.defOf(x), vote: 4 })), ...short.map((x) => ({ def: life.defOf(x), vote: 1 }))] }), 600);
const newOnes = K.filter((x) => !x.from), mean = (L, f) => L.reduce((a, x) => a + f(x), 0) / L.length;
check('a liked KIND comes up more on new scenes, not copies: long scenes rise and short ones fall',
  share(newOnes, (x) => x.len === 'long') > share(Z, (x) => x.len === 'long') + 0.1 && share(newOnes, (x) => x.len === 'short') < share(Z, (x) => x.len === 'short') - 0.1,
  `long ${share(Z, (x) => x.len === 'long').toFixed(2)} to ${share(newOnes, (x) => x.len === 'long').toFixed(2)}, short ${share(Z, (x) => x.len === 'short').toFixed(2)} to ${share(newOnes, (x) => x.len === 'short').toFixed(2)}`);
check('and more granulator: the mean peak of new scenes rises', mean(newOnes, (x) => x.peak) > mean(Z, (x) => x.peak) + 0.02, `${mean(Z, (x) => x.peak).toFixed(3)} to ${mean(newOnes, (x) => x.peak).toFixed(3)}`);
check('it still explores: all ten patches and every control still play, and most scenes are new, not variations',
  new Set(K.map((x) => x.patch)).size === 10 && Object.keys(MOVABLE).every((k) => K.some((x) => x.param === k)) && newOnes.length > K.length / 2, `${newOnes.length} new of ${K.length}`);
check('NEGATIVE CONTROL: with no votes nothing is a variation', S.every((s) => !s.from));
console.log(`life-test: ${ok}/${ok + bad}`);
process.exit(bad ? 1 : 0);
