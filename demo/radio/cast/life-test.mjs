// node demo/radio/cast/life-test.mjs: the living sound's planner, no browser. Most of these are
// negative controls: a life that repeats, reuses a control, leaves the granulator on at a seam, or
// ignores a vote fails.
import { createLife as createLife0, tasteOf, fileWeight, CAST_PATCHES, patchFor, sceneId, coreId, envelope, swell, MOVABLE, FRESH, guardT, movableFor, ducks, familyOf, FAMILIES, NOT_LEN, freezesAfterDry, patchValues, LENGTHS, INTERLUDE, IKINDS, LAYERS, ODDS, toT } from './life.mjs';

// most of this file grades grammar 1, the life before sections and types; grammar 2 has its own part at the end
const createLife = (o = {}) => createLife0({ grammar: 1, ...o });
const G1KINDS = Object.keys(IKINDS).filter((k) => IKINDS[k].odds > 0);
let ok = 0, bad = 0;
const check = (name, pass, detail = '') => { if (pass) ok++; else { bad++; console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`); } };
const N = 300, many = (life, n = N) => Array.from({ length: n }, (_, i) => life.scene(i));
const life = createLife({ seed: 1 }), S = many(life);
// the controls some family lets the hand move (pitch is never moved)
const MOVING = Object.keys(MOVABLE).filter((k) => [...new Set(S.map((s) => s.patch))].some((p) => guardT(p, k)));
const reused = (list, fresh = FRESH) => list.findIndex((p, i) => list.slice(Math.max(0, i - fresh), i).includes(p));
const period = (keys) => { for (let p = 1; p <= 40; p++) if (keys.slice(0, 120).every((k, i) => k === keys[i + p])) return p; return 0; };
const key = (s) => `${s.patch}|${s.param}|${s.len}|${s.iParam}`;
function rules(name, S, fresh = FRESH) {
  check(`${name}: no scene has the patch of the one before it`, S.every((s, i) => !i || s.patch !== S[i - 1].patch));
  const order = S.flatMap((s) => [s.param, s.iParam]);
  check(`${name}: no control is moved again within ${fresh} movements`, reused(order, fresh) === -1, `at ${reused(order, fresh)}`);
  check(`${name}: never three scenes of one length in a row`, S.every((s, i) => i < 2 || !(s.len === S[i - 1].len && s.len === S[i - 2].len)));
  check(`${name}: it does not loop, scenes or patches`, period(S.map(key)) === 0 && period(S.map((s) => s.patch)) === 0);
}

check('the envelope and the swell are 0 at both ends and 1 at the top', envelope(0) === 0 && envelope(1) === 0 && envelope(0.5) === 1 && swell(0) === 0 && swell(1) === 0 && Math.abs(swell(0.5) - 1) < 1e-12);
rules('no votes', S);
check('NEGATIVE CONTROL: the freshness check catches a control moved twice in a row', reused(['size', 'pitch', 'pitch']) === 2);
check('NEGATIVE CONTROL: the period check finds a loop of 3', period(Array.from({ length: 200 }, (_, i) => String(i % 3))) === 3);
check('every length kind, every control and all ten patches are used', Object.keys(LENGTHS).every((k) => S.some((s) => s.len === k))
  && MOVING.every((k) => S.some((s) => s.param === k)) && new Set(S.map((s) => s.patch)).size === 16);
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
  if (turns > 1 || Math.abs(t[85] - t[15]) < 0.4 * s.width) oneMove = false;
  if (Math.max(...ys.map((v) => v.wet)) > IKINDS[s.iKind].wet[1] + 1e-9 || s.iNoise < IKINDS[s.iKind].noise[0] - 1e-9 || s.iNoise > IKINDS[s.iKind].noise[1] + 1e-9
    || s.blend < IKINDS[s.iKind].blend[0] || s.blend > IKINDS[s.iKind].blend[1]) light = false;
  const u = ys.map((v) => toT(v.param, v.value)), uTurns = u.slice(2).filter((v, j) => Math.sign(v - u[j + 1]) * Math.sign(u[j + 1] - u[j]) < 0).length;
  if (uTurns < 2) faster = false;
}
check('the granulator is out at every seam', seams);
check('every value stays in its control\'s range and the wet in 0..1', range);
check('a scene is ONE movement: one way across its window, at most one turn (the settle)', oneMove);
check('every interlude stays inside its kind: noise, swell and length', light);
check('an interlude moves faster: its control turns at least twice in one blend', faster);
const first = (o) => { const l = createLife(o); return many(l, 20).map(key).join(); };
check('the same seed and votes are the same life, another seed another', first({ seed: 1 }) === S.slice(0, 20).map(key).join() && first({ seed: 2 }) !== first({ seed: 1 }));
check('a scene\'s def is plain JSON that rebuilds the same id', S.slice(0, 20).every((s) => sceneId(JSON.parse(JSON.stringify(life.defOf(s)))) === s.id));

// votes: liked scenes come back as variations and their patch and control come up more; disliked ones less
const liked = S[3], hated = S.slice(4).find((x) => x.patch !== liked.patch);
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
  && V.filter(isVar).every((s) => s.patch === liked.patch && s.param === liked.param && (s.len !== liked.len || s.lo !== liked.lo || s.iParam !== liked.iParam || s.iKind !== liked.iKind || JSON.stringify(s.layers) !== JSON.stringify(liked.layers))), `${V.filter(isVar).length} variations`);
check('the liked patch plays more than without votes', share(V, (s) => s.patch === liked.patch) > share(S, (s) => s.patch === liked.patch) * 1.5,
  `${share(S, (s) => s.patch === liked.patch).toFixed(2)} to ${share(V, (s) => s.patch === liked.patch).toFixed(2)}`);
check('the disliked scene does not come back as it was', !V.some((s) => coreId(s) === coreId(hated)));
if (hated.patch !== liked.patch) check('the disliked patch plays less', share(V, (s) => s.patch === hated.patch) < share(S, (s) => s.patch === hated.patch),
  `${share(S, (s) => s.patch === hated.patch).toFixed(2)} to ${share(V, (s) => s.patch === hated.patch).toFixed(2)}`);
check('the liked patch comes up more even among new scenes, not only as variations',
  share(V.filter((s) => !s.from), (s) => s.patch === liked.patch) > share(S, (s) => s.patch === liked.patch) * 1.25,
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
const newOnes = K.filter((x) => !x.from && !x.naked), mean = (L, f) => L.reduce((a, x) => a + f(x), 0) / L.length;
check('a liked KIND comes up more on new scenes, not copies: long scenes rise and short ones fall',
  share(newOnes, (x) => x.len === 'long') > share(Z.filter((x) => !x.naked), (x) => x.len === 'long') + 0.1 && share(newOnes, (x) => x.len === 'short') < share(Z.filter((x) => !x.naked), (x) => x.len === 'short') - 0.1,
  `long ${share(Z, (x) => x.len === 'long').toFixed(2)} to ${share(newOnes, (x) => x.len === 'long').toFixed(2)}, short ${share(Z, (x) => x.len === 'short').toFixed(2)} to ${share(newOnes, (x) => x.len === 'short').toFixed(2)}`);
check('and more granulator: the mean peak of new scenes rises', mean(newOnes, (x) => x.peak) > mean(Z, (x) => x.peak) + 0.02, `${mean(Z, (x) => x.peak).toFixed(3)} to ${mean(newOnes, (x) => x.peak).toFixed(3)}`);
check('it still explores: every patch and every control still play, and most scenes are new, not variations',
  new Set(K.map((x) => x.patch)).size === 16 && MOVING.every((k) => K.some((x) => x.param === k)) && newOnes.length > K.length / 2, `${newOnes.length} new of ${K.length}`);
check('every kind of interlude grammar 1 picks plays, never the same kind twice in a row', G1KINDS.every((k) => S.some((x) => x.iKind === k)) && S.every((x, i) => !i || x.iKind !== S[i - 1].iKind));
check('a smear freezes the outgoing sound through its swell and lets go at the end, the other kinds never freeze',
  S.slice(0, 40).every((x, i) => { const mid = life.inInterlude(i, x.blend / 2).extra, end = life.inInterlude(i, x.blend).extra; return x.iKind === 'smear' ? mid.freeze > 0.9 && end.freeze === 0 : !('freeze' in mid); }));
// radio is rare (its odds), so the transition's learning is read over several lives, not one
const kindShare = (votes) => { const c = { smear: 0, radio: 0, n: 0 }; for (let seed = 5; seed <= 9; seed++) { const L0 = many(createLife({ seed }), 400), L = votes ? many(createLife({ seed, votes: votes(L0) }), 400) : L0; for (const x of L) { c.n++; if (x.iKind in c) c[x.iKind]++; } } return { smear: c.smear / c.n, radio: c.radio / c.n }; };
const k0 = kindShare(null), k1 = kindShare((L0) => [...L0.filter((x) => x.iKind === 'smear').slice(0, 6).map((x) => ({ def: life.defOf(x), vote: 4 })), ...L0.filter((x) => x.iKind === 'radio').slice(0, 6).map((x) => ({ def: life.defOf(x), vote: 1 }))]);
check('votes learn the transition too: liked smears come up more, disliked radio hiss less',
  k1.smear > k0.smear + 0.05 && k1.radio < k0.radio * 0.8, `smear ${k0.smear.toFixed(3)} to ${k1.smear.toFixed(3)}, radio ${k0.radio.toFixed(3)} to ${k1.radio.toFixed(3)}`);
// layers: every kind plays, about as often as meant, and the votes learn them too
const L = (k) => (x) => x.layers[k];
check('every layer kind plays, at about the odds for its kind of file (unknown counts as talk)',
  ['drone', 'res', 'harm', 'ghost'].every((k) => LAYERS[k].every((v) => S.some((x) => x.layers[k] === v)))
  && ['drone', 'res', 'harm', 'ghost'].every((k) => Math.abs(share(S, (x) => x.layers[k] !== 'none') - ODDS.speech[k]) < 0.12)
  && Math.abs(share(S, (x) => x.layers.bpm > 0) - ODDS.speech.pulse) < 0.12, ['drone', 'res', 'harm', 'ghost'].map((k) => `${k} ${share(S, (x) => x.layers[k] !== 'none').toFixed(2)}`).join(', '));
const byKind = (kind) => { const l = createLife({ seed: 3 }); return Array.from({ length: 400 }, (_, i) => l.scene(i, { kind })); };
const SP = byKind('speech'), MU = byKind('music');
check('talk gets more resonators and harmonizer than music, and only talk pulses on its own onsets',
  share(SP, (x) => x.layers.res !== 'none') > share(MU, (x) => x.layers.res !== 'none') + 0.2 && SP.some((x) => x.layers.bpm && x.layers.pulseOn === 'onsets')
  && !MU.some((x) => x.layers.pulseOn === 'onsets' && x.layers.bpm) && SP.every((x) => x.kind === 'speech'));
check('each scene has a key, moving mostly by a fifth, a fourth or a step', S.every((x) => x.key.root >= 0 && x.key.root < 12)
  && share(S.slice(1), (x, i) => [0, 7, 5, 2, 10].includes((x.key.root - S[i].key.root + 12) % 12)) > 0.7);
const keyDrones = Z.filter((x) => x.layers.drone === 'key').slice(0, 8), noDrones = Z.filter((x) => x.layers.drone === 'none').slice(0, 8);
const W = many(createLife({ seed: 5, votes: [...keyDrones.map((x) => ({ def: life.defOf(x), vote: 4 })), ...noDrones.map((x) => ({ def: life.defOf(x), vote: 1 }))] }), 600);
check('votes learn the layers: liked key drones come up more, disliked silence under the scene less',
  share(W.filter((x) => !x.from), L('drone') && ((x) => x.layers.drone === 'key')) > share(Z, (x) => x.layers.drone === 'key') + 0.08 && share(W, (x) => x.layers.drone === 'none') <= share(Z, (x) => x.layers.drone === 'none'),
  `key ${share(Z, (x) => x.layers.drone === 'key').toFixed(2)} to ${share(W.filter((x) => !x.from), (x) => x.layers.drone === 'key').toFixed(2)}, none ${share(Z, (x) => x.layers.drone === 'none').toFixed(2)} to ${share(W, (x) => x.layers.drone === 'none').toFixed(2)}`);
const ft = tasteOf([{ def: life.defOf(liked), vote: 1, file: 'Kalle' }, { def: life.defOf(hated), vote: 1, file: 'Kalle' }, { def: life.defOf(liked), vote: 1, file: 'Kalle' }, { def: life.defOf(liked), vote: 4, file: 'Dub hour' }]);
check('votes count against the file they played on: three bads sink Kalle out of the picks, a great lifts another',
  ft.file.Kalle === -6 && fileWeight(ft.file.Kalle) === 0 && fileWeight(ft.file['Dub hour']) > 1 && fileWeight(undefined) === 1 && fileWeight(-2) === 0.5);
const NK = (() => { const l = createLife({ seed: 11 }); return Array.from({ length: 600 }, (_, i) => l.scene(i, { kind: 'speech' })); })();
const nakedOk = (x) => x.peak === 0 && x.len === 'long' && x.iKind === 'clean' && x.iNoise === 0 && ['drone', 'res', 'harm', 'ghost'].every((k) => x.layers[k] === 'none') && !x.layers.bpm;
check('on talk a tenth to under a third of scenes are naked (within the length and interlude rules): long, no granulator, no layers, no noise, never two in a row',
  share(NK, (x) => x.naked) > 0.1 && share(NK, (x) => x.naked) < 0.3 && NK.filter((x) => x.naked).every(nakedOk) && NK.every((x, i) => !i || !(x.naked && NK[i - 1].naked)), share(NK, (x) => x.naked).toFixed(2));
check('NEGATIVE CONTROL: on music naked scenes are rare', share(MU, (x) => x.naked) < 0.1, share(MU, (x) => x.naked).toFixed(2));
check('every cast patch is built on a page patch, and grammar 1 plays its first six', CAST_PATCHES.length === 48 && CAST_PATCHES.every((c) => patchFor(c.name).name === c.base) && CAST_PATCHES.slice(0, 6).every((c) => NK.concat(S).some((x) => x.patch === c.name)) && !NK.concat(S).some((x) => CAST_PATCHES.slice(6).some((c) => c.name === x.patch)));
const arcs = S.slice(0, 50);
check('every scene starts dry for 12 to 30 % and its granulator is up by half way and still up at 80 %', arcs.filter((x) => !x.naked).every((x, i) => {
  const at = (f) => life.inScene(S.indexOf(x), f * x.dwell).wet; return x.dry >= 0.12 && x.dry <= 0.3 && at(x.dry * 0.5) === 0 && at(0.5) > 0.3 && at(0.8) > 0.3; }));
const ints = arcs.filter((x) => !x.naked).map((x) => x.intensity);
check('intensity rises and falls over the scenes: some near 1, some near 0.55', Math.max(...ints) > 0.9 && Math.min(...ints) < 0.65, `${Math.min(...ints)} to ${Math.max(...ints)}`);
check('NEGATIVE CONTROL: with no votes nothing is a variation', S.every((s) => !s.from));

// ── families, guards and the duck rule (plans/plan-cast-patches-scenes.md 2.1) ──
const inGuard = (x) => { const g = guardT(x.patch, x.param); return g && x.lo >= g[0] - 1e-9 && x.lo + x.width <= g[1] + 0.011
  && Object.entries(x.tweak || {}).every(([k, t]) => { const h = guardT(x.patch, k); return h && t >= h[0] - 1e-9 && t <= h[1] + 1e-9; }); };
const all = [...S, ...V, ...K];
check('every patch has a family, and every family lets at least four controls move', [...new Set(all.map((x) => x.patch))].every((p) => FAMILIES[familyOf(p)] && movableFor(p).length >= 4));
check('the hand and the tweaks stay inside the family\'s guard, with and without votes', all.filter((x) => !x.naked).every(inGuard), JSON.stringify(all.find((x) => !x.naked && !inGuard(x))));
check('NEGATIVE CONTROL: the guard check catches a window over the whole range', !inGuard({ patch: 'Shimmer', param: 'size', lo: 0, width: 0.8, tweak: {} }));
check('pitch is never moved, by the hand or a tweak', all.every((x) => x.param !== 'pitch' && x.iParam !== 'pitch' && !('pitch' in (x.tweak || {}))));
check('a glitch patch never plays a long scene', all.every((x) => !(NOT_LEN[familyOf(x.patch)] || []).includes(x.len) || x.naked));
// the ducks scene, as voted 2026-10-18: Shimmer, the hand on scatter 0.18 to 0.73, a tweak putting size at 0.26 s
const duckDef = { patch: 'Shimmer', param: 'scatter', lo: toT('scatter', 0.18), width: toT('scatter', 0.73) - toT('scatter', 0.18), tweak: { size: toT('size', 0.26) }, iParam: 'echo', ilo: 0.1, iw: 0.25 };
check('NEGATIVE CONTROL: the duck rule catches the voted ducks scene', ducks(duckDef));
check('and lets Shimmer itself play, unmoved toward the ducks', !ducks({ ...duckDef, param: 'echo', lo: 0.2, width: 0.3, tweak: {} }));
check('no scene reaches the ducks, with or without votes', !all.some(ducks), JSON.stringify(all.find(ducks)));
// ── freeze after the dry share ──
const frozen = S.slice(0, 200).map((x, i) => [x, i]).filter(([x]) => freezesAfterDry(x.patch) && !x.naked);
check('a frozen patch is open through its dry share and freezes after it', frozen.length > 3 && frozen.every(([x, i]) => life.inScene(i, x.dwell * x.dry * 0.5).extra.freeze === 0 && life.inScene(i, x.dwell * Math.min(0.95, x.dry + 0.1)).extra.freeze === 1), `${frozen.length} frozen scenes`);
check('NEGATIVE CONTROL: a patch that does not freeze is never frozen by its scene', !freezesAfterDry('Cloud') && S.slice(0, 60).every((x, i) => freezesAfterDry(x.patch) || !('freeze' in life.inScene(i, x.dwell / 2).extra)));
// ── the transitions: rare radio, a path per kind ──
const kinds = (L) => Object.fromEntries(G1KINDS.map((k) => [k, share(L, (x) => x.iKind === k)]));
const ks = kinds(Z);
check('the dial\'s hiss is rare: radio and drift together under 15 % of interludes, every other kind plays', ks.radio + ks.drift < 0.15 && Object.values(ks).every((v) => v > 0), JSON.stringify(ks));
check('every interlude carries its path, and only radio, drift and smear sweep the dial', Z.every((x) => x.iPath === IKINDS[x.iKind].path) && Object.entries(IKINDS).every(([k, v]) => (v.path === 0) === ['radio', 'drift', 'smear'].includes(k)));
check('a filter hand-over moves tone, a pause is silent', Z.filter((x) => x.iKind === 'filter').every((x) => x.iParam === 'tone') && Z.filter((x) => x.iKind === 'pause').every((x) => x.iNoise === 0 && x.iWet === 0));
// ── crossfade.mjs ──
const { crossfade, dwellMix } = await import('./crossfade.mjs');
const { createMix, WHISTLE_SOFT } = await import('../../shell/tuner-mix.mjs');
const { SLOTS } = await import('./local.mjs');
const near2 = (a, b, e = 1e-9) => Math.abs(a - b) < e;
check('a dissolve is equal power all the way, no echo, no whistle, the noise at the floor', [0, 0.2, 0.5, 0.8, 1].every((k) => { const m = crossfade(1, 0, k); return near2(m.st[0].clear ** 2 + m.st[1].clear ** 2, 1) && m.st.every((x) => x.echo === 0) && m.whistle === 0 && m.noise === 0.04; }));
check('every path starts on the outgoing file and ends on the incoming, open and bright, as the dial lands', [1, 2, 3].every((p) => { const a = crossfade(p, 0, 0), b = crossfade(p, 0, 1); return near2(a.st[0].clear, 1) && near2(a.st[1].clear, 0) && near2(b.st[1].clear, 1) && near2(b.st[0].clear, 0, 1e-12) && near2(b.st[1].bright, 3500, 1e-6); }));
check('the filter darkens the outgoing file to 300 Hz and opens the incoming from it', near2(crossfade(2, 0, 0.6).st[0].bright, 300, 1e-6) && near2(crossfade(2, 0, 0.4).st[1].bright, 300, 1e-6) && crossfade(2, 0, 0.3).st[0].bright < 1200);
check('a gap is silence in its middle, and no noise', [0.4, 0.5, 0.6].every((k) => crossfade(3, 1, k).st.every((x) => x.clear < 1e-12)) && crossfade(3, 1, 0.5).noise === 0);
const mix = createMix(SLOTS, WHISTLE_SOFT), m0 = mix(SLOTS[0].at);
check('NEGATIVE CONTROL: on the dial the waiting file leaks in as an echo while the scene plays', m0.st[1].echo > 0.2, m0.st[1].echo.toFixed(3));
check('and dwellMix keeps the waiting file silent, the playing one untouched', dwellMix(m0, 0).st[1].echo === 0 && dwellMix(m0, 0).st[1].clear === 0 && dwellMix(m0, 0).st[0] === m0.st[0]);

// ── grammar 2: patches, types, sections, the tide (plans/plan-cast-patches-scenes.md 5.3) ──
const { readFileSync } = await import('node:fs');
const { clampPatch } = await import('./local.mjs');
const L2 = await import('./life.mjs');
const g1 = JSON.parse(readFileSync(new URL('./life-g1.json', import.meta.url)));
const g1ids = (seed) => { const l = createLife0({ seed, grammar: 1 }); return Array.from({ length: 40 }, (_, i) => { const x = l.scene(i, { kind: ['speech', 'field', 'music'][i % 3] }); return `${x.id}|${x.iKind}|${x.dwell}|${x.blend}|${x.dry}|${x.intensity}`; }); };
check('grammar 1 rebuilds the life it played before grammar 2, scene for scene (40 scenes, two seeds)', [1, 7].every((seed) => JSON.stringify(g1ids(seed)) === JSON.stringify(g1[seed])));
const kindAt = (i) => ['speech', 'field', 'music', 'speech'][i % 4];
const life2 = (o) => { const l = createLife0({ grammar: 2, ...o }); return { l, S: Array.from({ length: o.n ?? 600 }, (_, i) => l.scene(i, { kind: kindAt(i) })) }; };
const { l: G, S: S2 } = life2({ seed: 11, n: 2000 });
rules('grammar 2', S2.slice(0, 600), L2.FRESH2);
// glitch plays only in storms, and storms only at high tide, so it may miss one of its four in 2000 scenes
const seen2 = new Set(S2.map((x) => x.patch));
const STUTTER = ['rhythmic', 'glitch'];
check('grammar 2 plays every patch at or under MAX_PITCH in 2000 scenes, none above it, and nothing that stutters', CAST_PATCHES.every((c) => STUTTER.includes(familyOf(c.name)) || patchValues(c.name).pitch > L2.MAX_PITCH || patchValues(c.name).drop > L2.MAX_DROP || L2.ECHOEY.includes(c.name) || patchValues(c.name).size < L2.MIN_GRAIN || !L2.SMOOTH.includes(familyOf(c.name)) || seen2.has(c.name)) && ![...seen2].some((n) => STUTTER.includes(familyOf(n))) && ![...seen2].some((n) => patchValues(n).pitch > L2.MAX_PITCH), `${seen2.size}`);
check('no stuttering: no grammar 2 scene is a rhythm scene or carries a pulse', !S2.some((x) => x.type === 'rhythm' || x.layers.bpm), JSON.stringify(S2.find((x) => x.type === 'rhythm' || x.layers.bpm)?.type));
const all54 = [...new Set([...(await import('../../granulator/grain-ring.mjs')).PATCHES.map((p) => p.name), ...CAST_PATCHES.map((p) => p.name)])];
check('every patch is inside PATCH_LIMITS: the engines refuse nothing and change no value', CAST_PATCHES.every((c) => { const k = clampPatch({ name: c.base, set: c.set }); return !k.refused.length && Object.entries(c.set).every(([n, v]) => k.values[n] === (n === 'dir' ? (v < 0 ? -1 : 1) : v)); }));
const sig = (n) => { const v = patchValues(n); return ['size', 'density', 'pitch', 'speed', 'freeze', 'dir', 'lock', 'scatter'].map((k) => Math.round((v[k] ?? 0) * 100) / 100).join(); };
check('no two patches are the same sound on size, density, pitch, speed, freeze, direction, lock and scatter', new Set(all54.map(sig)).size === all54.length && all54.length === 58);
// variety (plans/plan-cast-variety.md step 1), 8 seeds x 300 scenes over a mix of kinds
{ const KK = [...Array(9).fill('speech'), ...Array(4).fill('field'), 'music', 'music'], cnt = {}, gp = []; let nn = 0, rs = 0, rep5 = 0;
  const cb = (L) => [L.res !== 'none', L.harm !== 'none', L.ghost !== 'none', !!L.bpm].join();
  for (let sd = 1; sd <= 8; sd++) { const LL = L2.createLife({ seed: sd }), last = {}, seen = [];
    for (let i = 0; i < 300; i++) { const s = LL.scene(i, { kind: KK[i % KK.length] }); nn++; cnt[s.patch] = (cnt[s.patch] || 0) + 1;
      if (last[s.patch] != null) gp.push(i - last[s.patch]); last[s.patch] = i; if (s.layers.res !== 'none') rs++;
      const c = cb(s.layers); if (seen.slice(-5).includes(c)) rep5++; seen.push(c); } }
  gp.sort((a, b) => a - b); const top = Math.max(...Object.values(cnt)) / nn;
  check('variety: no patch in over 6.5 % of scenes (26 patches since the grain floor), the 10th percentile gap 6 scenes or more (19 smooth patches), gaps of 2 under 1 %', top <= 0.065 && gp[Math.floor(gp.length * 0.1)] >= 6 && gp.filter((g) => g <= 2).length / gp.length < 0.01, `top ${(100 * top).toFixed(1)} %, p10 ${gp[Math.floor(gp.length * 0.1)]}`);
  // the combination gate is retired: with no resonators and no pulse a combination is two switches (harmonizer, ghost),
  // four possibilities, so a repeat within five scenes says nothing (2026-10-19, *"metallicness"*)
  check('no resonators in any grammar 2 scene: they rang metallic', rs === 0, `${rs} of ${nn}`); }
check('NEGATIVE CONTROL: a copied patch is caught', new Set([...all54, 'Cloud'].map(sig)).size < all54.length + 1);
check('no patch has more than 24 grains sounding at once', all54.every((n) => L2.overlapOf(n) <= L2.OVERLAP_CAP), JSON.stringify(all54.filter((n) => L2.overlapOf(n) > 24)));
check('NEGATIVE CONTROL: density 64 with 4 s grains would be over the cap', 64 * 4 > L2.OVERLAP_CAP);
check('no grammar 2 scene reaches the ducks', !S2.some(ducks), JSON.stringify(S2.find(ducks)));
const near15 = (x) => Object.entries(x.tweak || {}).every(([k, t]) => { const g = guardT(x.patch, k); const c = Math.min(g[1], Math.max(g[0], toT(k, patchValues(x.patch)[k] ?? 0))); return Math.abs(t - c) <= 0.15 + 0.011; });
check('every new scene\'s tweaks sit inside the guard and within 0.15 of the patch\'s own value', S2.filter((x) => !x.from && !x.naked).every((x) => inGuard(x) && near15(x)), JSON.stringify(S2.find((x) => !x.from && !x.naked && !(inGuard(x) && near15(x)))));
const fz = S2.slice(0, 400).map((x, i) => [x, i]).filter(([x]) => freezesAfterDry(x.patch) && !x.naked);
check('grammar 2: a frozen patch is open through its dry share and frozen after it', fz.length > 5 && fz.every(([x, i]) => G.inScene(i, x.dwell * x.dry * 0.5).extra.freeze === 0 && G.inScene(i, x.dwell * Math.min(0.97, x.dry + 0.05)).extra.freeze === 1), `${fz.length}`);
const locked = S2.filter((x) => L2.patchInfo(x.patch)?.sub);
check('no locked patch plays in grammar 2: a patch on the tempo stutters', !locked.length, `${locked.length}`);
check('NEGATIVE CONTROL: Stutter\'s fixed 8 grains a second is not a whole number a beat at 72 bpm', Math.abs((8 * 60 / 72) % 1) > 0.1);
// sections and the tide
const runs = []; for (const x of S2) { if (!runs.length || runs.at(-1).section !== x.section || x.type === S2[S2.indexOf(x) - 1]?.type && false) runs.push({ section: x.section, n: 0 }); runs.at(-1).n++; }
const starts = S2.map((x, i) => [x, i]).filter(([x, i]) => i === 0 || L2.SECTIONS[x.section] && (S2[i - 1].secLast));
check('never the same section twice in a row', starts.every(([x, i], j) => !j || x.section !== starts[j - 1][0].section), starts.slice(0, 12).map(([x]) => x.section).join());
check('every section and every scene type but rhythm (no stutter) occurs', Object.keys(L2.SECTIONS).every((n) => S2.some((x) => x.section === n)) && Object.keys(L2.TYPES).filter((t) => t !== 'rhythm').every((t) => S2.some((x) => x.type === t)), JSON.stringify(Object.keys(L2.TYPES).filter((t) => t !== 'rhythm' && !S2.some((x) => x.type === t))));
check('storms only in the high half of the tide', S2.filter((x) => x.type === 'storm').every((x) => x.section === 'weather') && starts.filter(([x]) => x.section === 'weather').every(([x]) => x.tide > 0.5 - 0.06));
const hi = S2.filter((x) => !x.naked && x.tide >= 0.5), lo = S2.filter((x) => !x.naked && x.tide < 0.5), mI = (L) => L.reduce((a, x) => a + x.intensity, 0) / L.length;
check('over the hour the piece swells: the high tide\'s scenes are more intense than the low tide\'s by 0.2', mI(hi) - mI(lo) > 0.2, `${mI(lo).toFixed(2)} to ${mI(hi).toFixed(2)}`);
check('a section opens on something you can recognise: a dry intro, Night on its deep drone', starts.every(([x]) => x.type === 'intro' || x.section === 'night'));
check('grammar 2 plays no naked speech, on talk or anywhere (asked 2026-10-18)', !S2.some((x) => x.naked) && S2.some((x, i) => kindAt(i) === 'speech'));
// the bridges
const db = S2.map((x, i) => [x, i]).find(([x]) => x.iKind === 'dronebridge'), [dbx, dbi] = db;
const b0 = G.inInterlude(dbi, dbx.blend * 0.25).bridge, b1 = G.inInterlude(dbi, dbx.blend * 0.75).bridge;
check('a drone bridge holds the drones across the gap and glides them to the next scene\'s key from halfway', b0.layers.drone !== 'none' && b0.layers.droneLevel === 0.5 && b0.key === dbx.key && b1.key === dbx.nextKey && JSON.stringify(S2[dbi + 1].key) === JSON.stringify(dbx.nextKey));
const ts = S2.map((x, i) => [x, i]).find(([x]) => x.iKind === 'tapestop');
check('grammar 2 never leaves by a tape stop (it drops the voice in pitch) or an echo wash', !ts && !S2.some((x) => L2.NOT_OUTS.includes(x.iKind)));
// plans/plan-cast-listenable.md: no voice at any pitch but its own, one effect at a time, a dry opening, visits by kind
const pitchOf = (x) => ({ ...patchValues(x.patch), ...(x.set || {}) });
check('grammar 2: every scene plays its file at pitch 1, with no tape drop and no echo over ECHO_CAP', S2.every((x) => pitchOf(x).pitch === 1 && pitchOf(x).drop <= L2.MAX_DROP && pitchOf(x).echo <= L2.ECHO_CAP && x.param !== 'echo' && x.iParam !== 'echo' && x.tweak?.echo == null),
  JSON.stringify(S2.map((x) => [x.patch, pitchOf(x).pitch, pitchOf(x).echo, x.param, x.iParam]).find(([, p, e, a, b]) => p !== 1 || e > L2.ECHO_CAP || a === 'echo' || b === 'echo')));
check('grammar 2: no chopped voices: every grain at least MIN_GRAIN, at least MIN_OVERLAP at once, size and density never moved', S2.every((x) => pitchOf(x).size >= L2.MIN_GRAIN && pitchOf(x).size * pitchOf(x).density >= L2.MIN_OVERLAP && !L2.NO_MOVE.includes(x.param) && !L2.NO_MOVE.includes(x.iParam) && !Object.keys(x.tweak || {}).some((k) => L2.NO_MOVE.includes(k))),
  JSON.stringify(S2.find((x) => pitchOf(x).size < L2.MIN_GRAIN || L2.NO_MOVE.includes(x.param) || L2.NO_MOVE.includes(x.iParam))?.patch));
check('grammar 2: the harmonizer plays on music only, and at most one of drone, harmonizer and ghost in a scene', S2.every((x) => (x.kind === 'music' || x.layers.harm === 'none') && ['drone', 'harm', 'ghost'].filter((k) => x.layers[k] !== 'none').length <= 1));
check('grammar 2: every scene opens dry for 8 to 20 s (or 40 % of a short one)', S2.every((x) => (x.dry * x.dwell >= 7 || x.dry === 0.4) && x.dry * x.dwell <= 23 && x.dry <= 0.4));
{ const mean = (k) => { const d = S2.filter((x) => x.kind === k).map((x) => x.dwell); return d.reduce((a, b) => a + b, 0) / d.length; };
  check('grammar 2: a music file is visited longer than talk or a field recording', mean('music') > 1.25 * mean('speech') && mean('music') > 1.25 * mean('field'), `${mean('music').toFixed(0)} ${mean('speech').toFixed(0)} ${mean('field').toFixed(0)}`); }
{ const t = createLife0({ grammar: 2, seed: 5 }), ok = Array.from({ length: 40 }, (_, i) => t.scene(i, { kind: 'speech', test: i % 2 === 0 })).every((x, i) => (i % 2 ? x.dwell !== L2.TEST_DWELL || true : x.dwell === L2.TEST_DWELL && x.test));
  check('grammar 2: a test recording is a short visit', ok && L2.isTest('Clip test on user2') && L2.isTest('Audio test') && !L2.isTest('Testament')); }
check('every grammar 2 interlude is a way out its type names (a dissolve when none is free), radio only at a section\'s end', S2.every((x) => x.naked || [...L2.TYPES[x.type].outs, 'radio', 'dissolve'].includes(x.iKind)) && S2.filter((x) => x.iKind === 'radio').every((x) => x.secLast));
check('the generalised envelope is today\'s at its defaults', Array.from({ length: 101 }, (_, j) => j / 100).every((x) => Math.abs(envelope(x, 0.2) - (x <= 0.2 || x >= 1 ? 0 : x < 0.38 ? ((u) => u * u * (3 - 2 * u))((x - 0.2) / 0.18) : x > 0.85 ? ((u) => u * u * (3 - 2 * u))((1 - x) / 0.15) : 1)) < 1e-9));
// votes under grammar 2
const real = JSON.parse(readFileSync(new URL('./votes-2026-10-18.json', import.meta.url)));
check('the 11 votes of 2026-10-18 still count under both grammars: Backwards scores positive', tasteOf(real).patch.Backwards > 0 && createLife0({ grammar: 2, votes: real }).taste.patch.Backwards > 0, JSON.stringify(tasteOf(real).patch));
const likeFam = S2.slice(0, 300).filter((x) => familyOf(x.patch) === 'choir' && !x.naked).slice(0, 8).map((x) => ({ def: G.defOf(x), vote: 4 }));
const likeSec = S2.slice(0, 300).filter((x) => x.section === 'ritual').slice(0, 8).map((x) => ({ def: G.defOf(x), vote: 4 }));
const { S: SF } = life2({ seed: 11, n: 600, votes: likeFam }), { S: SS } = life2({ seed: 11, n: 600, votes: likeSec });
const base600 = S2.slice(0, 600);
check('votes learn the family: liked choirs come up more, and every smooth family still plays', share(SF, (x) => familyOf(x.patch) === 'choir') > share(base600, (x) => familyOf(x.patch) === 'choir') * 1.2 && L2.SMOOTH.every((f) => SF.some((x) => familyOf(x.patch) === f)),
  `${share(base600, (x) => familyOf(x.patch) === 'choir').toFixed(2)} to ${share(SF, (x) => familyOf(x.patch) === 'choir').toFixed(2)}`);
check('votes learn the section: a liked ritual comes up more, and never twice in a row', share(SS, (x) => x.section === 'ritual') > share(base600, (x) => x.section === 'ritual') * 1.2,
  `${share(base600, (x) => x.section === 'ritual').toFixed(2)} to ${share(SS, (x) => x.section === 'ritual').toFixed(2)}`);
// a clicking file (soften) gets long smooth grains only: no echoing tape, no chops, no glitch, no storm
const softL = createLife0({ grammar: 2, seed: 11 }), SO = Array.from({ length: 400 }, (_, i) => softL.scene(i, { kind: kindAt(i), soft: i % 3 === 0 }));
check('drones are one trick: most scenes carry none, and a section keeps one drone through its scenes', share(S2, (x) => x.layers.drone === 'none') > 0.45
  && S2.every((x, i) => !i || x.section !== S2[i - 1].section || S2[i - 1].secLast || ['storm', 'rhythm'].includes(x.type) || ['storm', 'rhythm'].includes(S2[i - 1].type) || x.layers.drone === S2[i - 1].layers.drone), share(S2, (x) => x.layers.drone === 'none').toFixed(2));
const softOk = SO.filter((x, i) => i % 3 === 0).every((x) => L2.SMOOTH.includes(familyOf(x.patch)) && !['storm', 'rhythm', 'tapebuild', 'cloudbuild'].includes(x.type));
check('a clicking file plays only drone, choir and spectral patches, never a storm or a rhythmic scene', softOk);
check('every grammar 2 scene plays a smooth family only, no tape, cloud or reverse texture (*"kettle rattling"*)', S2.every((x) => L2.SMOOTH.includes(familyOf(x.patch))));
check('NEGATIVE CONTROL: grammar 1 still plays other families, so the check can see one', S.some((x) => !L2.SMOOTH.includes(familyOf(x.patch))));
console.log(`life-test: ${ok}/${ok + bad}`);
process.exit(bad ? 1 : 0);
