// node workers/cast/fresh-test.mjs: a running station's feed check (Caster.freshTick) against a fake feed and clock.
// New files play next, newest first; files gone from the feed leave the queue and the program; the playing file is
// never cut; a quiet hour brings a recent arrival round again.
import { Caster } from './worker.mjs';

let pass = 0, fail = 0;
const check = (name, ok, got = '') => { if (ok) { pass++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name}${got ? `: ${got}` : ''}`); } };

let FEED = [];
globalThis.caches = { default: { match: async () => ({ json: async () => FEED }), put: async () => {} } };
let NOW = Date.parse('2026-10-20T12:00:00Z');
Date.now = () => NOW;
const H = 3600_000, MIN = 60_000;
const file = (id, hoursAgo) => ({ id, title: `file ${id}`, url: `https://eccm.ee/${id}.mp3`, at: new Date(NOW - hoursAgo * H).toISOString().slice(0, 19) });

function station(queue, program = []) {
  const mem = new Map([['want', { startedAt: 1, queue }], ['program', program]]);
  const posts = [], lines = [];
  const me = { st: { get: async (k) => mem.get(k), put: async (k, v) => { mem.set(k, v); } }, ctx: {},
    cpost: async (path, body) => { posts.push([path, body]); }, say: (l) => lines.push(l), push: () => {}, freshAt: 0, resolve: Caster.prototype.resolve };
  const tick = async (cur) => { me.freshAt = 0; await Caster.prototype.freshTick.call(me, mem.get('want'), cur); };
  return { me, mem, posts, lines, tick };
}
const ids = (q) => q.map((x) => x.id).join(',');

// the archive at the start: a b c d, d playing
FEED = [file('a', 300), file('b', 200), file('c', 100), file('d', 50)];
const s = station(FEED.map(({ id, title, url }) => ({ id, title, url })), [{ id: 'a' }, { id: 'b' }]);
await s.tick('d');
check('the first look of a session is a baseline: nothing posted', s.posts.length === 0 && s.mem.get('fresh')?.known.length === 4);

await s.tick('d');
check('nothing new and not quiet: nothing posted', s.posts.length === 0);

// a burst: two arrive between looks, x older than y
NOW += 3 * MIN; FEED = [...FEED, file('x', 0.5), file('y', 0.1)];
await s.tick('d');
const q1 = s.posts.at(-1)?.[1].queue || [];
check('a burst plays next, newest first, then the queue after the file playing, the playing one last', ids(q1) === 'y,x,a,b,c,d', ids(q1));
check('the log names what arrived', /2 new in the archive, next: file y, file x/.test(s.lines.join('\n')), s.lines.join(' | '));

// b leaves the archive, and so does d while it plays
NOW += 3 * MIN; FEED = FEED.filter((x) => x.id !== 'b' && x.id !== 'd');
s.posts.length = 0;
await s.tick('d');
const q2 = s.posts.at(-1)?.[1].queue || [];
check('files gone from the feed leave the queue; the playing one is not cut (no next), only not queued again', ids(q2) === 'y,x,a,c' && !s.posts.some(([p]) => p === '/next'), ids(q2));
check('and leave the stored program', ids(s.mem.get('program')) === 'a', ids(s.mem.get('program') || []));

// an hour with nothing new: the newest recent arrival comes round again, not the one playing
s.posts.length = 0;
NOW += 30 * MIN; await s.tick('a');
check('under an hour quiet: nothing posted', s.posts.length === 0);
NOW += 35 * MIN; await s.tick('y');
const q3 = s.posts.at(-1)?.[1].queue || [];
check('after a quiet hour a recent arrival comes again next, and not the one playing', q3[0]?.id === 'x', ids(q3));
NOW += 10 * MIN; s.posts.length = 0; await s.tick('x');
check('the next revisit waits its half hour', s.posts.length === 0);

// NEGATIVE CONTROL: an archive file (100 h old) is never "recent"
FEED = [file('c', 100)]; NOW += 2 * H; s.posts.length = 0; await s.tick('zz');
check('NEGATIVE CONTROL: an old file is not brought round as a recent arrival', !s.posts.some(([, b]) => b.queue?.[0]?.id === 'c' && s.lines.at(-1)?.startsWith('quiet')), s.lines.at(-1));

console.log(`\nfresh-test: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
