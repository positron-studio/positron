// node workers/cast/program-test.mjs: program.mjs, the playlist both the Caster and edgecast's station use, with no
// browser, no network and no Cloudflare. The pick is graded against the Caster's pickFiles as it was before the
// extraction (copied below verbatim), seed by seed. The checks then run against three broken copies of the module,
// and each copy must take at least one of them red (the negative controls).
import * as P from './program.mjs';
import { tasteOf, fileWeight } from '../../demo/radio/cast/life.mjs';

let pass = 0, fail = 0;
const check = (name, ok, got = '') => { if (ok) { pass++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name}${got ? `: ${got}` : ''}`); } };
const seeded = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const ids = (q) => q.map((x) => x.id).join(',');

// the Caster's pickFiles before 2026-10-20, verbatim
function oldPickFiles(items, votes, n, rand = Math.random) {
  const fs = tasteOf(votes).file, pool = items.map((x) => ({ id: x.id, w: fileWeight(fs[x.title]) })).filter((x) => x.w > 0);
  if (pool.every((x) => x.w === 1)) { for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } return pool.map((x) => x.id).slice(0, n); }
  return pool.map((x) => ({ ...x, k: rand() ** (1 / x.w) })).sort((a, b) => b.k - a.k).map((x) => x.id).slice(0, n);
}

const H = 3600_000, MIN = 60_000, T0 = Date.parse('2026-10-20T12:00:00Z');
const file = (id, hoursAgo, seconds, now = T0) => ({ id, title: `file ${id}`, at: new Date(now - hoursAgo * H).toISOString().slice(0, 19), ...(seconds ? { seconds } : {}) });

/** Every check, against a module `M`; answers the names that failed. */
function grade(M, say = check) {
  const failed = [];
  const c = (name, ok, got) => { if (!ok) failed.push(name); say(name, ok, got); };
  // the pick, against the old code
  const items = 'abcdefgh'.split('').map((id) => ({ id, title: `t ${id}` }));
  const def = { patch: 'Cloud', param: 'pos' };
  const votes = [{ def, vote: 4, file: 't a' }, { def, vote: 4, file: 't a' }, { def, vote: 1, file: 't c' }, { def, vote: 1, file: 't c' }, { def, vote: 1, file: 't c' }];
  const weightOf = (vs) => { const fs = tasteOf(vs).file; return (t) => fileWeight(fs[t]); };
  const same = (vs, n) => Array.from({ length: 60 }, (_, i) => ids(M.pickBy(items, weightOf(vs), n, seeded(i + 1))) === oldPickFiles(items, vs, n, seeded(i + 1)).join(',')).every(Boolean);
  c('the pick is the old pickFiles, seed by seed, with no votes', same([], Infinity));
  c('and with votes, whole and cut to 3', same(votes, Infinity) && same(votes, 3));
  const w0 = fileWeight(tasteOf(votes).file['t c']);
  c('a file the votes put at weight 0 is never picked', w0 === 0 && Array.from({ length: 50 }, (_, i) => M.pickBy(items, weightOf(votes), Infinity, seeded(i + 3))).every((p) => !p.some((x) => x.id === 'c')));
  // the short file skip
  const q = [file('long', 1, 300), file('clip', 1, 15), file('unknown', 1)];
  c('a file under MIN_FILE_S is left out while longer ones can play; one of unknown length stays', ids(M.longOnly(q)) === 'long,unknown', ids(M.longOnly(q)));
  c('a queue of nothing but short files plays them rather than nothing', ids(M.longOnly([file('c1', 1, 15), file('c2', 1, 20)])) === 'c1,c2');
  c('the threshold is 40 s, the same number the container mixer uses', M.MIN_FILE_S === 40 && !M.isShort({ seconds: 40 }) && M.isShort({ seconds: 39 }));
  // resolve and rotate
  const feed = [file('a', 5), file('b', 4), file('c', 3)];
  c('ids resolve in the order given, a gone id dropped', ids(M.resolveIds(['c', 'zz', 'a'], feed)) === 'c,a');
  c('a rotation puts the file after the one playing first and the playing one last', ids(M.rotateAfter(feed, 'b')) === 'c,a,b' && ids(M.rotateAfter(feed, 'zz')) === 'a,b,c');
  // the fresh rules on a clock
  let now = T0, st = null;
  const look = (items2, cur) => { const r = M.freshLook(st, items2, { startedAt: 1, cur, now }); st = r.st; return r; };
  let F = [file('a', 300), file('b', 200), file('c', 100), file('d', 50)];
  const r0 = look(F, 'd');
  c('the first look of a session is a baseline and adds nothing', r0.baseline && !r0.add.length && st.known.length === 4);
  c('a second look with nothing new adds nothing', !look(F, 'd').add.length);
  now += 3 * MIN; F = [...F, file('x', 0.5, 0, now), file('y', 0.1, 0, now)];
  const r1 = look(F, 'd');
  c('a burst comes newest first', ids(r1.add) === 'y,x' && /2 new/.test(r1.why), ids(r1.add));
  const q1 = M.freshQueue(F.slice(0, 4), r1.add, r1.ids, 'd');
  c('the new files go first, then the queue after the one playing, the playing one last', ids(q1) === 'y,x,a,b,c,d', ids(q1));
  c('with the playing file mid queue, the rest is turned to follow it', ids(M.freshQueue(F.slice(0, 4), r1.add, r1.ids, 'b')) === 'y,x,c,d,a,b', ids(M.freshQueue(F.slice(0, 4), r1.add, r1.ids, 'b')));
  now += 3 * MIN; F = F.filter((x) => x.id !== 'b' && x.id !== 'd');
  const r2 = look(F, 'd');
  c('files gone from the feed are named and leave the queue, the playing one too (it plays on, it is not queued)',
    ids(M.goneFrom(q1, r2.ids)) === 'b,d' && ids(M.freshQueue(q1, r2.add, r2.ids, 'd')) === 'y,x,a,c', ids(M.freshQueue(q1, r2.add, r2.ids, 'd')));
  c('and leave the stored program; a program with nothing gone is left alone (null)', ids(M.programLess([{ id: 'a' }, { id: 'b' }], r2.ids)) === 'a' && M.programLess([{ id: 'a' }], r2.ids) === null);
  now += 30 * MIN;
  c('under an hour quiet, nothing comes round', !look(F, 'a').add.length);
  now += 35 * MIN;
  const r3 = look(F, 'y');
  c('after a quiet hour the newest recent arrival comes round, never the one playing', ids(r3.add) === 'x' && /quiet/.test(r3.why), ids(r3.add));
  now += 10 * MIN;
  c('the next revisit waits its half hour', !look(F, 'x').add.length);
  now += 2 * H;
  c('NEGATIVE CONTROL: a file 100 h old is never a recent arrival', !look([file('c', 100, 0, now)], 'zz').add.length);
  const r4 = M.freshLook(st, F, { startedAt: 2, cur: 'a', now });
  c('NEGATIVE CONTROL: a new session is a new baseline, so its feed is not news', r4.baseline && !r4.add.length);
  return failed;
}

grade(P);

// the negative controls: three broken copies of the module, each must be caught
const broken = {
  'a skip that drops every short file even when nothing longer is left': { ...P, longOnly: (q) => q.filter((x) => !P.isShort(x)) },
  'a look with no baseline (the whole archive arrives as news on a start)': { ...P, freshLook: (prev, items, o) => P.freshLook(prev || { startedAt: o.startedAt, known: [], revisitAt: o.now + P.QUIET_MS, heard: {} }, items, o) },
  'a fresh queue that does not turn the rest after the file playing': { ...P, freshQueue: (queue, add, ids2) => [...add, ...queue.filter((x) => ids2.has(String(x.id)) && !add.some((a) => a.id === x.id))] },
};
for (const [name, M] of Object.entries(broken)) {
  const f = grade(M, () => {});
  check(`NEGATIVE CONTROL: the checks catch ${name}`, f.length > 0, f.length ? `caught by ${f.length}` : 'nothing went red');
}

console.log(`\nprogram-test: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
