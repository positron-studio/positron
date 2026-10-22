// node workers/cast/listeners-test.mjs: the listener count of a broadcast (listeners.mjs and Caster.countListeners), with
// no network. Their status-json in both shapes and broken ones, the shout correction, listener minutes across polls, and
// that nothing is fetched off air. Negative controls are named; a stand-in server answers instead of their Icecast.
import { createServer } from 'node:http';
import { parseStatus, trueCount, listenTick, listenStatus, close, LISTEN_EVERY_MS, GAP_MAX_MS, KEEP, listenPoint, listensQuery, listensRows, listensCsv, STEPS, ROWS_MAX } from './listeners.mjs';
import worker, { Caster, originStatus } from './worker.mjs';

let pass = 0, fail = 0;
const check = (name, ok, got = '') => { if (ok) { pass++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name}${got ? `: ${got}` : ''}`); } };
const MIN = 60_000;

// shapes as Icecast 2.4.4 writes them (the fields the Väin app reads, listenurl, plus listeners)
const src = (mount, listeners) => ({ listenurl: `http://live.uuu.ee:8001/${mount}`, listeners, listener_peak: 9, server_name: mount, stream_start: 'Wed, 22 Oct 2026 10:00:00 +0300' });
const ONE = JSON.stringify({ icestats: { admin: 'x', server_id: 'Icecast 2.4.4', source: src('radio1965', 4) } });
const MANY = JSON.stringify({ icestats: { server_id: 'Icecast 2.4.4', source: [src('user1', 2), src('radio1965', 7), src('user12', 30)] } });

// ── parse ──
check('one source is an object: its count', parseStatus(ONE, 'radio1965').listeners === 4);
check('several sources are an array: the mount asked for', parseStatus(MANY, 'radio1965').listeners === 7 && parseStatus(MANY, 'user1').listeners === 2);
check('NEGATIVE CONTROL: user1 is not user12 (the path ends at the mount)', parseStatus(MANY, 'user1').listeners !== 30);
check('NEGATIVE CONTROL: a mount that is not on the server is no count, not 0', parseStatus(MANY, 'user3').ok === false && parseStatus(ONE, 'user1').ok === false, JSON.stringify(parseStatus(MANY, 'user3')));
const noCount = JSON.stringify({ icestats: { source: { listenurl: 'http://live.uuu.ee:8001/radio1965' } } });
check('NEGATIVE CONTROL: a source with no listeners field is no count, not 0', parseStatus(noCount, 'radio1965').ok === false);
check('NEGATIVE CONTROL: no source at all (nothing on air there) is no count', parseStatus(JSON.stringify({ icestats: { server_id: 'Icecast 2.4.4' } }), 'radio1965').ok === false);
// 2.4.x writes a title with a bare quote in it: not JSON, and the mount's own object is still readable
const BROKEN = `{"icestats":{"source":[{"listenurl":"http://live.uuu.ee:8001/user1","listeners":1,"title":"a "quoted" title"},{"listenurl":"http://live.uuu.ee:8001/radio1965","listeners":5,"title":"x"}]}}`;
check('malformed JSON: the mount\'s object is scanned for its count', parseStatus(BROKEN, 'radio1965').listeners === 5 && parseStatus(BROKEN, 'radio1965').how === 'scanned');
check('NEGATIVE CONTROL: malformed with nothing for the mount is no count', parseStatus('<html>502 Bad Gateway</html>', 'radio1965').ok === false && parseStatus(BROKEN, 'user4').ok === false);

// ── the shout correction ──
check('one relay connection at Väin with three behind it: 4 at Väin is 6 people', trueCount(4, { listeners: 3, upstreamConnections: 1 }) === 6);
check('the relay holding the mount for nobody (its 20 s linger): 1 at Väin is 0 people', trueCount(1, { listeners: 0, upstreamConnections: 1 }) === 0);
check('the relay not connected: Väin\'s count as it is, plus nobody', trueCount(5, { listeners: 0, upstreamConnections: 0 }) === 5);
check('the relay did not answer: Väin\'s count as it is', trueCount(5, null) === 5);
check('NEGATIVE CONTROL: a count read before the relay dialled never goes below 0', trueCount(0, { listeners: 2, upstreamConnections: 1 }) === 2);
check('NEGATIVE CONTROL: no count from Väin is no count, whatever the relay says', trueCount(null, { listeners: 3, upstreamConnections: 1 }) === null);

// ── listener minutes across polls ──
const want = { startedAt: 1000 };
let list = [], reads = 0;
const seq = (counts) => async () => { reads++; const c = counts.shift(); return c == null ? { ok: false, why: 'their status answered 502' } : { ok: true, count: c }; };
let t = 1000;
const step = async (read, dt = LISTEN_EVERY_MS) => { t += dt; ({ list } = await listenTick({ list, want, onAir: true, mount: 'radio1965', read, now: t })); };
const r1 = seq([2, 4, null, 4, 1]);
await step(r1, 0); await step(r1, MIN); await step(r1, MIN); await step(r1, MIN); await step(r1, MIN);
const cur = list.at(-1);
// 2 for a minute, 4 for a minute, a miss holds 4 for two minutes (under the gap ceiling), then 1
check('minutes are the count held between readings: 2 + 4 + 4 + 4 = 14', Math.abs(cur.minutes - 14) < 1e-9, cur.minutes);
check('peak is the most at one reading, the newest count is now', cur.peak === 4 && cur.now === 1 && cur.polls === 4 && cur.misses === 1, JSON.stringify(cur));
const before = reads;
await step(r1, 20_000);
check('a sweep 20 s later reads nothing: at most one reading a minute', reads === before);
// a long outage counts no more than GAP_MAX_MS of the last count
list = []; t = 1000;
const r2 = seq([3, 3]);
await step(r2, 0); await step(r2, 60 * MIN);
check('NEGATIVE CONTROL: an hour with no reading adds the gap ceiling, not the hour', Math.abs(list.at(-1).minutes - 3 * GAP_MAX_MS / MIN) < 1e-9, list.at(-1).minutes);
// a stop closes it, holding the count to the stop
const closed = close({ ...list.at(-1) }, t + MIN);
check('a stop ends the record and holds the count to it', closed.endedAt === t + MIN && closed.now === null && Math.abs(closed.minutes - (9 + 3)) < 1e-9, closed.minutes);
// a new start opens a new record, the old one closed, and the list is capped
list = [closed];
({ list } = await listenTick({ list, want: { startedAt: 99 }, onAir: true, mount: 'radio1965', read: seq([1]), now: t + 2 * MIN }));
check('a new broadcast is a new record after the old', list.length === 2 && list[0].endedAt != null && list[1].startedAt === 99 && list[1].now === 1);
let big = Array.from({ length: KEEP }, (_, i) => ({ startedAt: i, endedAt: i + 1, peak: 1, minutes: 1, polls: 1 }));
({ list: big } = await listenTick({ list: big, want: { startedAt: 500 }, onAir: true, mount: 'radio1965', read: seq([1]), now: 1e9 }));
check(`storage keeps the last ${KEEP} broadcasts`, big.length === KEEP && big.at(-1).startedAt === 500 && big[0].startedAt === 1);
const ss = listenStatus(list, t + 2 * MIN);
check('status: the broadcast on air and the last ones, newest first', ss.listeners?.now === 1 && ss.listens.length === 1 && ss.listens[0].peak === 3, JSON.stringify(ss));
check('status off air: no broadcast on air', listenStatus([closed]).listeners === null);

// ── no fetch off air ──
reads = 0;
for (const [w, on] of [[null, false], [null, true], [want, false]]) await listenTick({ list: [], want: w, onAir: on, mount: 'radio1965', read: seq([1]), now: 5 });
check('nothing is read with no station wanted or not on air', reads === 0);

// the Caster itself, against a stand-in of their Icecast and a stand-in relay, counting every request
let served = 0, body = MANY;
const srv = createServer((req, res) => { served++; res.writeHead(req.url === '/status-json.xsl' ? 200 : 404, { 'content-type': 'application/json' }); res.end(body); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
let mem = new Map();
const tees = [];
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
const env = { SHOUT: { fetch: async (u) => { tees.push(u); return new Response(JSON.stringify({ listeners: 3, upstreamConnections: 1 })); } } };
// each station its own object and its own storage, as on Cloudflare
const caster = (name) => { const m = new Map(); mem = m; return Object.assign(Object.create(Caster.prototype), { name, env, ctx: { storage: { get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); } } }, ears: new Set(), lines: [] }); };
// the station's target points at the stand-in: the real targets() is read for the mount, the host swapped here
const realFetch = globalThis.fetch;
globalThis.fetch = (u, init) => realFetch(String(u).replace('http://live.uuu.ee:8001', `http://127.0.0.1:${port}`), init);
const c = caster('radio1965');
await c.countListeners(null, false); await c.countListeners({ startedAt: 1 }, false);
check('the Caster off air or not yet on air asks their server nothing and the relay nothing', served === 0 && tees.length === 0 && !mem.get('listens'));
await c.countListeners({ startedAt: 1 }, true);
const got = mem.get('listens')?.at(-1);
check('on air on radio1965: 7 at the stand-in, one relay connection with 3 behind it, is 9', got?.now === 9 && got.from?.origin === 7 && served === 1 && tees[0] === 'https://shout/tee/radio1965', JSON.stringify(got));
const u2 = caster('user2');
await u2.countListeners({ startedAt: 1 }, true);
check('a second station inside the shared minute reads the same answer: one request for both', served === 1 && tees.length === 1, `${served} ${tees.length}`);
check('NEGATIVE CONTROL: user2 has no relay, so no correction (and its own mount is not on the server: no count)', mem.get('listens').at(-1).why === 'no source on /user2', JSON.stringify(mem.get('listens').at(-1)));
body = ONE; await new Promise((r) => setTimeout(r, 10));
const text = await originStatus({ host: 'live.uuu.ee', port: 8001 }, {});
check('NEGATIVE CONTROL: inside STATUS_KEEP_S the answer is the shared one, not a new request', served === 1 && text === MANY);
tees.length = 0;
const pv = caster('preview'); pv.ears = new Set([1, 2]);
await pv.countListeners({ startedAt: 1 }, true);
check('preview counts its own listeners (the relay is one of them) and asks Väin nothing', mem.get('listens').at(-1).now === 4 && served === 1, JSON.stringify(mem.get('listens').at(-1)));

// ── Analytics Engine points ──
const points = [];
env.LISTENS = { writeDataPoint: (p) => { points.push(p); } };
served = 0; body = MANY;
const p1 = caster('radio1965');
await p1.countListeners(null, false); await p1.countListeners({ startedAt: 1 }, false);
check('no point off air or not yet on air', points.length === 0);
await new Promise((r) => setTimeout(r, 0));
await p1.countListeners({ startedAt: 1 }, true);
const pt = points[0];
check('a point per successful reading, field order fixed: station; mount, kind, event, start; raw, relay up, relay listeners, people, peak, minutes',
  points.length === 1 && JSON.stringify(pt.indexes) === '["radio1965"]' && JSON.stringify(pt.blobs) === JSON.stringify(['radio1965', 'vain', 'reading', new Date(1).toISOString()])
  && JSON.stringify(pt.doubles) === JSON.stringify([7, 1, 3, 9, 9, 0]), JSON.stringify(pt));
await p1.countListeners({ startedAt: 1 }, true);
check('a sweep inside the minute writes nothing more', points.length === 1);
const bad = caster('user3');
await bad.countListeners({ startedAt: 1 }, true);
check('no point on a failed read (no source on that mount)', points.length === 1 && bad.ctx.storage && true);
const pre = caster('preview'); pre.ears = new Set([1]);
await pre.countListeners({ startedAt: 5 }, true);
check('preview writes its points as kind preview', points.length === 2 && points[1].blobs[1] === 'preview' && points[1].doubles[3] === 3, JSON.stringify(points[1]));
const swapped = listenPoint('radio1965', 'vain', { mount: 'radio1965', startedAt: 1, now: 9, peak: 9, minutes: 2, from: { origin: 7, tee: { listeners: 3, upstreamConnections: 1 } } });
check('NEGATIVE CONTROL: people is double4 and Väin\'s own count double1, never the other way round', swapped.doubles[3] === 9 && swapped.doubles[0] === 7 && swapped.doubles[3] !== swapped.doubles[0]);
const shut = listenPoint('radio1965', 'vain', close({ mount: 'radio1965', startedAt: 1, now: 4, peak: 6, minutes: 10, lastAt: 0, from: { origin: 5 } }, 60_000), 'closed');
check('a closed broadcast\'s point says so and carries its peak and minutes, no count', shut.blobs[2] === 'closed' && shut.doubles[3] === 0 && shut.doubles[4] === 6 && shut.doubles[5] === 14, JSON.stringify(shut.doubles));

// ── reading back ──
const NOWQ = Date.parse('2026-10-22T12:00:00Z');
const q = listensQuery({ station: 'radio1965', now: NOWQ });
check('no range: the last two hours, 1 minute buckets, the station a parameter not text', q.step === 1 && q.to === NOWQ && q.from === NOWQ - 2 * 3600_000 && q.params.station === 'radio1965' && !q.query.includes("'radio1965'") && /events\.analyticsEngine\.cast_listeners/.test(q.query) && /blob3 = 'reading'/.test(q.query), q.query);
check('48 hours asking for 1 minute is raised to the first step under the row cap', listensQuery({ station: 'x', from: NOWQ - 48 * 3600_000, to: NOWQ, step: 1 }).step === 5);
check('NEGATIVE CONTROL: a step that is not on the list is refused, not passed into the SQL', !!listensQuery({ station: 'x', step: "1' MINUTE) --", now: NOWQ }).error);
check('NEGATIVE CONTROL: more than 14 days is refused', !!listensQuery({ station: 'x', from: NOWQ - 15 * 86400_000, to: NOWQ }).error && !listensQuery({ station: 'x', from: NOWQ - 14 * 86400_000, to: NOWQ }).error);
check('NEGATIVE CONTROL: to before from is refused', !!listensQuery({ station: 'x', from: NOWQ, to: NOWQ - 1 }).error);
check(`every step keeps a full 14 days under ${ROWS_MAX} rows or says so`, STEPS.at(-1) * 60_000 * ROWS_MAX >= 14 * 86400_000);
const rows = listensRows([{ t: '2026-10-22 10:05:00', people: '4', vain: 2, readings: 5 }, { t: '2026-10-22 10:00:00', people: 3, vain: null, readings: 5 }]);
check('rows: SQL times read as UTC, in order, numbers or null', rows.length === 2 && rows[0].t === Date.parse('2026-10-22T10:00:00Z') && rows[1].people === 4 && rows[0].vain === null, JSON.stringify(rows));
check('CSV: one header, a line per bucket, ISO times', listensCsv(rows) === 'time,listening,vain_count,readings\n2026-10-22T10:00:00.000Z,3,,5\n2026-10-22T10:05:00.000Z,4,2,5\n', JSON.stringify(listensCsv(rows)));
// the route, against a stand-in SQL binding
const sqlSeen = [];
const routeEnv = { ...env, CAST_KEY: 'k', ANALYTICS_SQL: { query: async (x) => { sqlSeen.push(x); return { data: [{ t: '2026-10-22 10:00:00', people: 2, vain: 1, readings: 1 }], rows: 1 }; } } };
const ask = (path) => worker.fetch(new Request(`https://cast.positron.studio${path}`), routeEnv, { waitUntil: () => {} });
const j = await (await ask('/listens/radio1965?from=2026-10-22T09:00:00Z&to=2026-10-22T11:00:00Z')).json();
check('GET /listens answers rows from the SQL binding', j.rows?.[0]?.people === 2 && j.step === 1 && sqlSeen[0]?.params?.station === 'radio1965', JSON.stringify(j));
const csvRes = await ask('/listens/radio1965?from=2026-10-22T09:00:00Z&to=2026-10-22T11:00:00Z&format=csv');
check('?format=csv answers text/csv', /text\/csv/.test(csvRes.headers.get('content-type')) && (await csvRes.text()).startsWith('time,listening'));
check('NEGATIVE CONTROL: an unknown station is a 404 and asks the SQL nothing', (await ask('/listens/nosuch')).status === 404 && sqlSeen.length === 2);
check('NEGATIVE CONTROL: a bad range is a 400 and asks the SQL nothing', (await ask('/listens/radio1965?from=2026-01-01&to=2026-10-22')).status === 400 && sqlSeen.length === 2);
globalThis.fetch = realFetch;
srv.close();

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
