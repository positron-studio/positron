// positron-earlog: web and Väin listeners per cast station, one reading a minute, read back as JSON or CSV.
//   GET /<station>?from=&to= (ms or ISO, default the last 24 h) &step= 1 | 5 | 15 | 60 min &format=csv
// Reads only cast /state, which never asks a container and is edge cached 5 s. why: lessons/workers-earlog.md#header

const CAST = 'https://cast.positron.studio';
const STATIONS = ['radio1965', 'user1', 'user2', 'user3', 'user4', 'preview'];
const DATASET = 'cast_web_listeners';
const STEPS = [1, 5, 15, 60], ROWS_MAX = 2000, RANGE_MAX_MS = 14 * 86400_000;
const cors = { 'access-control-allow-origin': '*' };

async function tick(env) {
  return Promise.all(STATIONS.map(async (station) => {
    try {
      const s = await fetch(`${CAST}/state/${station}`).then((r) => r.json());
      if (!s?.playing) return `${station}: off`;
      env.EARS.writeDataPoint({ indexes: [station], blobs: [station, s.title || ''],
        doubles: [Number(s.ears) || 0, Number(s.listeners?.now) || 0] });
      return `${station}: web ${s.ears} vain ${s.listeners?.now}`;
    } catch (e) { console.log(`earlog ${station}: ${e.message}`); return `${station}: ${e.message}`; }
  }));
}

const when = (v, dflt) => { if (v == null || v === '') return dflt; const n = Number(v); return Number.isFinite(n) ? n : Date.parse(v); };

async function read(req, env) {
  const u = new URL(req.url);
  // what one tick reads right now, without writing twice in a minute: the check that the cron can see the cast
  if (u.pathname === '/now') return Response.json(await Promise.all(STATIONS.map((st) => fetch(`${CAST}/state/${st}`).then((r) => r.json()).then((s) => ({ st, playing: s.playing, web: s.ears, vain: s.listeners?.now })).catch((e) => ({ st, error: e.message })))), { headers: cors });
  const station = u.pathname.slice(1);
  if (!STATIONS.includes(station)) return Response.json({ error: `a station: ${STATIONS.join(', ')}` }, { status: 404, headers: cors });
  const t1 = when(u.searchParams.get('to'), Date.now()), t0 = when(u.searchParams.get('from'), t1 - 86400_000);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0 || t1 - t0 > RANGE_MAX_MS) return Response.json({ error: 'from before to, at most 14 days' }, { status: 400, headers: cors });
  const asked = Number(u.searchParams.get('step') || 0);
  const m = STEPS.find((x) => x >= asked && (t1 - t0) / (x * 60_000) <= ROWS_MAX) ?? 60;
  const query = `SELECT toStartOfInterval(timestamp, INTERVAL '${m}' MINUTE) AS t, APPROX_MAX(double1) AS web, APPROX_MAX(double2) AS vain, COUNT(*) AS readings `
    + `FROM events.analyticsEngine.${DATASET} WHERE index1 = $station AND timestamp >= $from AND timestamp < $to GROUP BY t ORDER BY t LIMIT ${ROWS_MAX}`;
  const { data = [] } = await env.ANALYTICS_SQL.query({ query, params: { station, from: new Date(t0).toISOString(), to: new Date(t1).toISOString() } });
  const rows = data.map((r) => ({ t: new Date(`${String(r.t).replace(' ', 'T')}Z`).toISOString(), web: Number(r.web), vain: Number(r.vain), readings: Number(r.readings) }));
  if (u.searchParams.get('format') === 'csv') {
    const csv = ['time,web,vain,readings', ...rows.map((r) => `${r.t},${r.web},${r.vain},${r.readings}`)].join('\n') + '\n';
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'max-age=30', ...cors } });
  }
  return Response.json({ station, step: m, rows }, { headers: { 'cache-control': 'max-age=30', ...cors } });
}

export default {
  scheduled: (ev, env, ctx) => ctx.waitUntil(tick(env)),
  fetch: (req, env) => read(req, env).catch((e) => Response.json({ error: String(e?.message || e).slice(0, 200) }, { status: 502, headers: cors })),
};
