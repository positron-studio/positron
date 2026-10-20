// The playlist of a cast station, pure: no Cloudflare, no container, no fetch. The Caster (worker.mjs) and edgecast's
// station (workers/edgecast/station.mjs) both call it, so a station on air and the one on the edge pick, skip and
// take new files by the same rules. Tested by program-test.mjs; the Caster's use of it by fresh-test.mjs.
// why: lessons/workers-cast.md#fresh, #program

/** Seconds under which a file is left out of what plays while a longer one can (the clip tests are 15 s). */
export const MIN_FILE_S = 40;
// On air the feed is read every FRESH_EVERY_MS: a file new to it plays next (newest first), one gone from it leaves
// the queue and the program (the one playing finishes). After QUIET_MS with nothing new, an arrival of the last
// RECENT_MS comes round again every REVISIT_MS.
export const FRESH_EVERY_MS = 30_000, QUIET_MS = 60 * 60_000, RECENT_MS = 12 * 3600_000, REVISIT_MS = 30 * 60_000;

const sid = (x) => String(x.id);

/**
 * Items for a program of `n`, in the order to play: each weighted by `weightOf(title)` (the votes, fileWeight of
 * tasteOf in life.mjs), none at weight 0, a plain shuffle when every weight is 1.
 */
export function pickBy(items, weightOf, n = Infinity, rand = Math.random) {
  const pool = items.map((x) => ({ x, w: weightOf(x.title) })).filter((p) => p.w > 0);
  if (pool.every((p) => p.w === 1)) {
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.map((p) => p.x).slice(0, n);
  }
  return pool.map((p) => ({ ...p, k: rand() ** (1 / p.w) })).sort((a, b) => b.k - a.k).map((p) => p.x).slice(0, n);
}

/** A file measured under MIN_FILE_S is a blip between scenes: left out, unless nothing longer is there. */
export const isShort = (x) => Number(x?.seconds) > 0 && Number(x.seconds) < MIN_FILE_S;
export function longOnly(queue) {
  const long = queue.filter((x) => !isShort(x));
  return long.length ? long : queue;
}

/** Ids to feed items, in the order given, dropping any no longer in the feed. */
export function resolveIds(ids, items) {
  const byId = new Map(items.map((x) => [sid(x), x]));
  return (Array.isArray(ids) ? ids : []).map((id) => byId.get(String(id))).filter(Boolean);
}

/** The list turned so the file after `cur` comes first and `cur` last; unchanged when `cur` is not in it. */
export function rotateAfter(list, cur) {
  const i = list.findIndex((x) => sid(x) === String(cur));
  return i < 0 ? list : [...list.slice(i + 1), ...list.slice(0, i + 1)];
}

/**
 * One look at the feed while a session (`startedAt`) is on air, `cur` the id playing. Answers the state to keep
 * (`st`), the feed's ids, and `add`: what plays next. The first look of a session is the baseline: what is in the
 * feed at the start is not new. New files come newest first by `at`; after a quiet hour the newest arrival of the
 * last RECENT_MS that is not playing and has not come round in the hour comes again, then every REVISIT_MS.
 */
export function freshLook(prev, items, { startedAt, cur, now }) {
  const ids = new Set(items.map(sid));
  if (!prev || prev.startedAt !== startedAt) return { baseline: true, ids, add: [], why: '', st: { startedAt, known: [...ids], revisitAt: now + QUIET_MS, heard: {} } };
  const st = { ...prev, heard: { ...(prev.heard || {}) } }, known = new Set(st.known), at = (x) => Date.parse(x.at || 0) || 0;
  const fresh = items.filter((x) => !known.has(sid(x))).sort((a, b) => at(b) - at(a));
  let add = fresh, why = fresh.length ? `${fresh.length} new in the archive, next` : '';
  if (fresh.length) st.revisitAt = now + QUIET_MS;
  else if (now >= st.revisitAt) {
    const pick = items.filter((x) => now - at(x) < RECENT_MS && sid(x) !== String(cur) && now - (st.heard[x.id] || 0) > QUIET_MS).sort((a, b) => at(b) - at(a))[0];
    if (pick) { add = [pick]; st.heard[pick.id] = now; why = 'quiet: a recent arrival again'; }
    st.revisitAt = now + REVISIT_MS;
  }
  st.known = [...ids];
  return { baseline: false, ids, add, why, st };
}

/** The queued files the feed no longer has. */
export const goneFrom = (queue, ids) => queue.filter((x) => !ids.has(sid(x)));

/**
 * The queue after a look: `add` first, files gone from the feed out, the rest turned to follow `cur` (which is never
 * cut: it plays on, and comes round again last if it is still in the feed).
 */
export function freshQueue(queue, add, ids, cur) {
  const addIds = new Set(add.map(sid));
  const rest = queue.filter((x) => ids.has(sid(x)) && !addIds.has(sid(x)));
  return [...add, ...rotateAfter(rest, cur)];
}

/** The stored program less files gone from the feed, or null when none went. */
export const programLess = (program, ids) => (program?.length && program.some((x) => !ids.has(sid(x))) ? program.filter((x) => ids.has(sid(x))) : null);
