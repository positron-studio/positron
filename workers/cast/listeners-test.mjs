// node workers/cast/listeners-test.mjs: the listener count of a broadcast (listeners.mjs and Caster.countListeners), with
// no network. Their status-json in both shapes and broken ones, the shout correction, listener minutes across polls, and
// that nothing is fetched off air. Negative controls are named; a stand-in server answers instead of their Icecast.
import { createServer } from 'node:http';
import { parseStatus, trueCount, listenTick, listenStatus, close, LISTEN_EVERY_MS, GAP_MAX_MS, KEEP } from './listeners.mjs';
import { Caster, originStatus } from './worker.mjs';

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
globalThis.fetch = realFetch;
srv.close();

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
