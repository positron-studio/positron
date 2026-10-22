// How many people hear a broadcast of ours on a Väin mount: their Icecast's status-json, read only while one of our
// stations is on air there, at most once a minute, corrected for the shout relay (one connection at Väin, many behind it).
// Pure parts here; the Caster (worker.mjs) owns the fetches and the storage. why: lessons/workers-cast.md#listeners

/** Seconds a status-json answer is shared by every station in one isolate or colo; a station asks at most every LISTEN_EVERY_MS. */
export const STATUS_KEEP_S = 50, LISTEN_EVERY_MS = 55_000, STATUS_TIMEOUT_MS = 8000;
// a failed read holds the last count this long, no further; the broadcasts kept in storage
export const GAP_MAX_MS = 3 * 60_000, KEEP = 20;
/** The shout relay's tee per station: one upstream at the origin, `listeners` behind it (workers/shout/worker.mjs STATIONS). */
export const TEE_OF = { radio1965: 'radio1965', preview: 'preview' };

export const statusUrl = (t) => `http://${t.host}:${t.port}/status-json.xsl`;

const MOUNT_TAIL = (mount) => new RegExp(`/${mount.replace(/[^a-z0-9_-]/gi, '')}$`);

/**
 * One mount's listeners out of Icecast 2.4.4's status-json text. `icestats.source` is an object with one source and
 * an array with several. Malformed JSON (2.4.x leaves some metadata unescaped) falls back to scanning that mount's object.
 * Returns `{ ok, listeners, how }` or `{ ok: false, why }`.
 */
export function parseStatus(text, mount) {
  const tail = MOUNT_TAIL(mount);
  let j = null;
  try { j = JSON.parse(text); } catch { /* scanned below */ }
  if (j) {
    const src = j?.icestats?.source;
    const list = Array.isArray(src) ? src : src && typeof src === 'object' ? [src] : [];
    const s = list.find((x) => typeof x?.listenurl === 'string' && tail.test(x.listenurl.replace(/\?.*$/, '')));
    if (!s) return { ok: false, why: `no source on /${mount}` };
    const n = Number(s.listeners);
    if (s.listeners == null || !Number.isInteger(n) || n < 0) return { ok: false, why: `/${mount} has no listener count` };
    return { ok: true, listeners: n, how: 'json' };
  }
  // the object holding this mount's listenurl, between its braces
  const at = String(text).search(new RegExp(`"listenurl"\\s*:\\s*"[^"]*/${mount.replace(/[^a-z0-9_-]/gi, '')}"`));
  if (at < 0) return { ok: false, why: 'not JSON, and no source on that mount' };
  const open = text.lastIndexOf('{', at), close = text.indexOf('}', at);
  const m = /"listeners"\s*:\s*(\d+)/.exec(text.slice(open, close < 0 ? undefined : close));
  if (!m) return { ok: false, why: `not JSON, and /${mount} has no listener count` };
  return { ok: true, listeners: Number(m[1]), how: 'scanned' };
}

/**
 * The people behind a count: the origin's own number, less the relay's connections there, plus who listens through the
 * relay. `tee` null (the relay did not answer, or the mount has none) leaves the origin's number as it is.
 */
export function trueCount(origin, tee) {
  if (!Number.isInteger(origin)) return null;
  if (!tee) return origin;
  const ups = Math.max(0, Number(tee.upstreamConnections ?? (tee.upstream ? 1 : 0)) || 0);
  const subs = Math.max(0, Number(tee.listeners) || 0);
  return Math.max(0, origin - ups) + subs;
}

/** A new broadcast's record. */
const fresh = (startedAt, mount) => ({ startedAt, mount, endedAt: null, now: null, peak: 0, peakAt: null, minutes: 0, polls: 0, misses: 0, lastAt: null, triedAt: null, why: null, from: null });

/** Listener minutes from the last count to `t`: the count held, never over GAP_MAX_MS of it. */
export function heldMinutes(rec, t) {
  if (rec.lastAt == null || rec.now == null) return 0;
  return (rec.now * Math.min(GAP_MAX_MS, Math.max(0, t - rec.lastAt))) / 60_000;
}

/** One reading folded into a record: the minutes since the last one, then the new count and the peak. */
export function fold(rec, sample, t) {
  const r = { ...rec, triedAt: t };
  if (!sample?.ok) return { ...r, misses: r.misses + 1, why: sample?.why || 'no answer' };
  r.minutes = +(r.minutes + heldMinutes(rec, t)).toFixed(3);
  r.now = sample.count; r.lastAt = t; r.polls = r.polls + 1; r.why = null; r.from = sample.from || null;
  if (r.polls === 1 || sample.count > r.peak) { r.peak = sample.count; r.peakAt = t; }
  return r;
}

/** Ends a record at `t`: the count held to then, and no count now. */
export function close(rec, t) {
  if (rec.endedAt != null) return rec;
  return { ...rec, minutes: +(rec.minutes + heldMinutes(rec, t)).toFixed(3), endedAt: t, now: null };
}

/**
 * One sweep's look. Reads nothing unless `want` is set and the station is `onAir`, and then at most every LISTEN_EVERY_MS.
 * `read()` answers `{ ok, count, from }` (the worker's fetches); `list` is what storage holds, newest last.
 * Returns `{ list, read, changed }`; a list a new broadcast started on has the old one closed.
 */
export async function listenTick({ list = [], want, onAir, mount, read, now }) {
  if (!want || !onAir || typeof read !== 'function') return { list, read: false, changed: false };
  let out = list.slice(), cur = out.at(-1), changed = false;
  if (cur && (cur.startedAt !== want.startedAt || cur.endedAt != null)) { out[out.length - 1] = close(cur, cur.lastAt ?? now); cur = null; }
  if (!cur) { cur = fresh(want.startedAt, mount); out.push(cur); changed = true; }
  if (cur.triedAt != null && now - cur.triedAt < LISTEN_EVERY_MS) return { list: out, read: false, changed };
  let sample;
  try { sample = await read(); } catch (e) { sample = { ok: false, why: String(e?.message || e).slice(0, 120) }; }
  out[out.length - 1] = fold(cur, sample, now);
  while (out.length > KEEP) out.shift();
  return { list: out, read: true, changed: true, ok: !!sample?.ok };
}

/** Status for a page: the broadcast on air (or null) and the last ones, newest first. */
export function listenStatus(list = [], now = Date.now()) {
  const cur = list.at(-1);
  const on = cur && cur.endedAt == null ? { now: cur.now, peak: cur.polls ? cur.peak : null, minutes: Math.round(cur.minutes + heldMinutes(cur, now)),
    at: cur.lastAt, ageS: cur.lastAt == null ? null : Math.round((now - cur.lastAt) / 1000), polls: cur.polls, misses: cur.misses, why: cur.why, from: cur.from, since: cur.startedAt } : null;
  const past = list.filter((x) => x.endedAt != null).reverse().slice(0, 10)
    .map(({ startedAt, endedAt, peak, minutes, polls, mount }) => ({ startedAt, endedAt, peak: polls ? peak : null, minutes: Math.round(minutes), mount }));
  return { listeners: on, listens: past };
}

/**
 * One Analytics Engine point per successful reading, and one when a broadcast closes. The field order is fixed and the
 * reading back depends on it: index1 station; blob1 mount, blob2 kind (vain | preview), blob3 event (reading | closed),
 * blob4 the broadcast's start; double1 the origin's own count, double2 the relay's connections there, double3 who
 * listens through the relay, double4 people, double5 peak so far, double6 listener minutes so far.
 * why: lessons/workers-cast.md#listen-points
 */
export const DATASET = 'cast_listeners';
export function listenPoint(station, kind, rec, event = 'reading') {
  const f = rec.from || {}, tee = f.tee || {};
  const reading = event === 'reading';
  return {
    indexes: [station],
    blobs: [rec.mount || station, kind, event, new Date(rec.startedAt).toISOString()],
    doubles: [reading ? f.origin ?? 0 : 0, reading ? tee.upstreamConnections ?? 0 : 0, reading ? tee.listeners ?? 0 : 0,
      reading ? rec.now ?? 0 : 0, rec.peak ?? 0, Math.round((rec.minutes ?? 0) * 1000) / 1000],
  };
}

/** Bucket sizes in minutes, the longest range read back, and the most rows one answer carries. */
export const STEPS = [1, 5, 15, 60], RANGE_MAX_MS = 14 * 86400_000, ROWS_MAX = 2000;
const when = (v, dflt) => { if (v == null || v === '') return dflt; const n = Number(v); const t = Number.isFinite(n) ? n : Date.parse(v); return Number.isFinite(t) ? t : NaN; };

/**
 * The SQL for one station's listeners between `from` and `to` (ms or ISO), bucketed by `step` minutes. A step too fine
 * for the range is raised to the first that fits ROWS_MAX; no step picks one. `{ error }` for a range it will not read.
 */
export function listensQuery({ station, from, to, step, now = Date.now() }) {
  const t1 = when(to, now), t0 = when(from, t1 - 2 * 3600_000);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return { error: 'from and to are times, from before to' };
  if (t1 - t0 > RANGE_MAX_MS) return { error: `at most ${RANGE_MAX_MS / 86400_000} days at once` };
  const asked = step == null || step === '' || step === 'auto' ? 0 : Number(step);
  if (asked !== 0 && !STEPS.includes(asked)) return { error: `step is one of ${STEPS.join(', ')} minutes` };
  const fits = (m) => (t1 - t0) / (m * 60_000) <= ROWS_MAX;
  const m = STEPS.find((x) => x >= asked && fits(x)) ?? STEPS.at(-1);
  const query = `SELECT toStartOfInterval(timestamp, INTERVAL '${m}' MINUTE) AS t, APPROX_MAX(double4) AS people, APPROX_MAX(double1) AS vain, COUNT(*) AS readings `
    + `FROM events.analyticsEngine.${DATASET} WHERE index1 = $station AND blob3 = 'reading' AND timestamp >= $from AND timestamp < $to `
    + `GROUP BY t ORDER BY t LIMIT ${ROWS_MAX}`;
  return { query, params: { station, from: new Date(t0).toISOString(), to: new Date(t1).toISOString() }, from: t0, to: t1, step: m };
}

/** Rows as the page reads them: `{ t (ms), people, vain, readings }`, in time order, numbers or null. */
export function listensRows(data = []) {
  const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return data.map((r) => ({ t: Date.parse(/Z|[+-]\d\d:?\d\d$/.test(String(r.t)) ? r.t : `${String(r.t).replace(' ', 'T')}Z`), people: num(r.people), vain: num(r.vain), readings: num(r.readings) }))
    .filter((r) => Number.isFinite(r.t)).sort((a, b) => a.t - b.t);
}

/** The same rows as CSV, one header line, times in ISO UTC. */
export function listensCsv(rows) {
  return ['time,listening,vain_count,readings', ...rows.map((r) => [new Date(r.t).toISOString(), r.people ?? '', r.vain ?? '', r.readings ?? ''].join(','))].join('\n') + '\n';
}
