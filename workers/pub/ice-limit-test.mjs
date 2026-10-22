// workers/pub/ice-limit-test.mjs (node workers/pub/ice-limit-test.mjs): who gets TURN credentials.
// NEGATIVE CONTROL lines must refuse something.
// why: lessons/workers-pub.md#ice-room

import { iceVerdict, ICE_LIMITS as L } from './ice-limit.mjs';

let pass = 0, fail = 0;
const ok = (name, good, detail = '') => { good ? pass++ : fail++; console.log(`${good ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };
/** Ask n times, keeping each granted hit, and answer how many were granted. */
const run = (hits, n, ask) => { let got = 0; for (let i = 0; i < n; i++) { const v = iceVerdict(hits, ask); if (v.ok) { got++; hits.push({ who: ask.who, ...(v.room ? { room: v.room } : {}) }); } } return got; };
const ROOM = 'k4p9xz', OTHER = 'm7qwer';

ok('25 people behind one public address, in one room, all get credentials', run([], 25, { who: 'office', room: ROOM }) === 25);
ok('NEGATIVE CONTROL: the same 25 with no room stop at 20, the old rule', run([], 25, { who: 'office' }) === L.address);
const h = [];
ok('a room takes at most 60 an hour however many addresses', run(h, 70, { who: 'a', room: ROOM }) === L.roomAddress
  && run(h, 70, { who: 'b', room: ROOM }) === L.room - L.roomAddress, `${h.length}`);
const spray = [];
let got = 0;
for (let i = 0; i < 100; i++) got += run(spray, 1, { who: 'x', room: `made-up-${i}` });
ok('NEGATIVE CONTROL: one address inventing rooms is held at 40', got === L.roomAddress, `${got}`);
ok('NEGATIVE CONTROL: a room name the relay would refuse counts per address', iceVerdict([], { who: 'y', room: 'no spaces/here' }).room === null);
const full = Array.from({ length: L.hour }, (_, i) => ({ who: `w${i}`, room: OTHER }));
ok('NEGATIVE CONTROL: 120 an hour overall is still the ceiling', !iceVerdict(full, { who: 'new', room: ROOM }).ok);

console.log(`\n${pass}/${pass + fail} green${fail ? `  (${fail} FAILED)` : ''}\n`);
process.exit(fail ? 1 : 0);
