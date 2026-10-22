// positron-sfu: Cloudflare Realtime SFU for /room/video/, holding the app secret so no page does.
// Not a proxy: five calls, each scoped to a room. A session is created for a room and comes back with a
// proof, HMAC(room, session), which the page shows on every later call and shares with the room so
// others may pull from it. A pull names the publisher's session and its proof, so only a session
// published in the same room can be pulled. The room code is the gate, as on the relay: anybody with
// the link is in.
//   POST /room/<room>/session                      -> { sessionId, proof }
//   POST /room/<room>/<sid>/publish   { proof, offer, tracks: [{ mid, trackName, simulcast? }] } -> { answer, tracks }
//   POST /room/<room>/<sid>/pull      { proof, tracks: [{ sessionId, proof, trackName, rid? }] } -> { offer?, tracks }
//   POST /room/<room>/<sid>/answer    { proof, answer }
//   POST /room/<room>/<sid>/update    { proof, tracks: [{ mid, rid }] }
//   POST /room/<room>/<sid>/close     { proof, mids: [..] }
//   POST /room/<room>/film/start|stop, GET /room/<room>/film/status: the room's film, sent into the SFU by a container
//   (film/server.mjs) as one more publisher. -> { sessionId, proof, tracks } like a tab's sfu.pub. why: lessons/workers-sfu.md#film
// Secrets: CF_REALTIME_APP_SECRET (the SFU's), SFU_PROOF_KEY (signs proofs). CF_REALTIME_APP_ID is a var.
// why: lessons/workers-sfu.md#header
// SfuAdmin (below the public handler) is a second, PRIVATE entry point: WebSocket adapters, reached only over a
// service binding with "entrypoint": "SfuAdmin" from positron-edgecast. why: lessons/workers-edgecast-adapter.md#sfu-admin
import { WorkerEntrypoint } from 'cloudflare:workers';
import { Container, getContainer } from '@cloudflare/containers';

const SFU = 'https://rtc.live.cloudflare.com/v1/apps';
// Cloudflare's edge 1010-blocks a generic user agent on a server-to-server fetch.
const UA = 'positron-sfu/1.0';
const ROOM_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
// a, b, c: quarter, half and full size, smallest first (demo/room/sfu.mjs LAYERS)
const RID_RE = /^[abc]$/;
// Keep the layer asked for; when it is not flowing take the next in name order, which is the next bigger.
const SIMULCAST = (rid) => ({ preferredRid: rid, priorityOrdering: 'none', ridNotAvailable: 'asciibetical' });
// the site, a local dev server on any port, and a script with no Origin
const ORIGIN_OK = /^(https:\/\/positron\.studio|https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/;
const MAX_BODY = 64 * 1024;           // an SDP with three layers is about 6 KB
const MAX_TRACKS = 24;                 // per call; the SFU takes 64

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function proofOf(env, room, sid) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SFU_PROOF_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(`${room}\n${sid}`))).slice(0, 32);
}
/** Same length, then every character, so the answer does not leak a prefix through timing. */
const same = (a, b) => {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function sfu(env, method, path, body) {
  const r = await fetch(`${SFU}/${env.CF_REALTIME_APP_ID}/${path}`, {
    method,
    headers: { authorization: `Bearer ${env.CF_REALTIME_APP_SECRET}`, 'content-type': 'application/json', 'user-agent': UA },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

function cors(origin) {
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}
const reply = (origin, status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) },
});

/** Only the fields the SFU needs, from a page's request, checked; null when anything is off. */
function localTracks(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_TRACKS) return null;
  const out = [];
  for (const t of list) {
    if (typeof t?.mid !== 'string' || t.mid.length > 8 || !NAME_RE.test(t.trackName || '')) return null;
    out.push({ location: 'local', mid: t.mid, trackName: t.trackName });
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if (origin && !ORIGIN_OK.test(origin)) return new Response('positron-sfu: not from this origin', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === '/' && request.method === 'GET') {
      return reply(origin, 200, { sfu: 'positron-sfu', usage: 'POST /room/<room>/session, then publish, pull, answer, update, close' });
    }
    if (!env.CF_REALTIME_APP_SECRET || !env.SFU_PROOF_KEY) return reply(origin, 503, { error: 'no SFU secret on this worker' });
    const f = url.pathname.match(/^\/room\/([^/]+)\/film\/(start|stop|status)$/);
    if (f && ROOM_RE.test(f[1])) return film(env, url, origin, f[1], f[2], request.method);
    if (request.method !== 'POST') return reply(origin, 405, { error: 'POST' });

    const m = url.pathname.match(/^\/room\/([^/]+)\/(?:(session)|([^/]+)\/(publish|pull|answer|update|close))$/);
    if (!m || !ROOM_RE.test(m[1])) return reply(origin, 404, { error: 'use /room/<room>/session or /room/<room>/<session>/<verb>' });
    const room = m[1];

    if (m[2] === 'session') {
      const r = await sfu(env, 'POST', 'sessions/new');
      if (r.status !== 201 || !r.json?.sessionId) return reply(origin, 502, { error: `sfu sessions/new ${r.status}` });
      return reply(origin, 201, { sessionId: r.json.sessionId, proof: await proofOf(env, room, r.json.sessionId) });
    }

    const sid = m[3], verb = m[4];
    if (!SID_RE.test(sid)) return reply(origin, 400, { error: 'not a session id' });
    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply(origin, 413, { error: 'too big' });
    let b;
    try { b = JSON.parse(raw); } catch { return reply(origin, 400, { error: 'not json' }); }
    // The caller must hold the proof for its own session in this room.
    if (!same(b?.proof, await proofOf(env, room, sid))) return reply(origin, 403, { error: 'not your session, or not this room' });

    let r;
    if (verb === 'publish') {
      const tracks = localTracks(b.tracks);
      if (!tracks || b.offer?.type !== 'offer' || typeof b.offer.sdp !== 'string') return reply(origin, 400, { error: 'publish needs an offer and tracks' });
      r = await sfu(env, 'POST', `sessions/${sid}/tracks/new`, { sessionDescription: { type: 'offer', sdp: b.offer.sdp }, tracks });
      if (r.status !== 200) return reply(origin, 502, { error: `sfu publish ${r.status}`, detail: r.json || r.text.slice(0, 200) });
      return reply(origin, 200, { answer: r.json.sessionDescription, tracks: r.json.tracks || [] });
    }
    if (verb === 'pull') {
      const list = b.tracks;
      if (!Array.isArray(list) || !list.length || list.length > MAX_TRACKS) return reply(origin, 400, { error: 'pull needs tracks' });
      const tracks = [];
      for (const t of list) {
        if (!SID_RE.test(t?.sessionId || '') || !NAME_RE.test(t.trackName || '')) return reply(origin, 400, { error: 'a track needs a session and a name' });
        // Only a publisher in this room: its proof is for this room.
        if (!same(t.proof, await proofOf(env, room, t.sessionId))) return reply(origin, 403, { error: `${t.trackName} was not published in this room` });
        tracks.push({ location: 'remote', sessionId: t.sessionId, trackName: t.trackName,
          ...(RID_RE.test(t.rid || '') ? { simulcast: SIMULCAST(t.rid) } : {}) });
      }
      r = await sfu(env, 'POST', `sessions/${sid}/tracks/new`, { tracks });
      if (r.status !== 200) return reply(origin, 502, { error: `sfu pull ${r.status}`, detail: r.json || r.text.slice(0, 200) });
      return reply(origin, 200, { offer: r.json.requiresImmediateRenegotiation ? r.json.sessionDescription : null, tracks: r.json.tracks || [] });
    }
    if (verb === 'answer') {
      if (b.answer?.type !== 'answer' || typeof b.answer.sdp !== 'string') return reply(origin, 400, { error: 'answer needs an answer' });
      r = await sfu(env, 'PUT', `sessions/${sid}/renegotiate`, { sessionDescription: { type: 'answer', sdp: b.answer.sdp } });
      if (r.status !== 200) return reply(origin, 502, { error: `sfu renegotiate ${r.status}`, detail: r.json || r.text.slice(0, 200) });
      return reply(origin, 200, { ok: true });
    }
    if (verb === 'update') {
      const list = b.tracks;
      if (!Array.isArray(list) || !list.length || list.length > MAX_TRACKS || list.some((t) => typeof t?.mid !== 'string' || !RID_RE.test(t.rid || ''))) {
        return reply(origin, 400, { error: 'update needs mids and rids' });
      }
      r = await sfu(env, 'PUT', `sessions/${sid}/tracks/update`, { tracks: list.map((t) => ({ location: 'remote', mid: t.mid,
        simulcast: SIMULCAST(t.rid) })) });
      if (r.status !== 200) return reply(origin, 502, { error: `sfu update ${r.status}`, detail: r.json || r.text.slice(0, 200) });
      return reply(origin, 200, { tracks: r.json?.tracks || [] });
    }
    // close: force, so a tab that is leaving does not have to finish an SDP exchange.
    const mids = b.mids;
    if (!Array.isArray(mids) || !mids.length || mids.length > MAX_TRACKS || mids.some((x) => typeof x !== 'string')) return reply(origin, 400, { error: 'close needs mids' });
    r = await sfu(env, 'PUT', `sessions/${sid}/tracks/close`, { tracks: mids.map((mid) => ({ mid })), force: true });
    if (r.status !== 200) return reply(origin, 502, { error: `sfu close ${r.status}`, detail: r.json || r.text.slice(0, 200) });
    return reply(origin, 200, { tracks: r.json?.tracks || [] });
  },
};

// ── the film: one container per room, at most FILM_ROOMS at once ──────────────
// The container is a participant like a tab: it asks this worker's public routes for a session and publishes with
// its proof, so it holds no secret. The room code is the gate, as for a tab. why: lessons/workers-sfu.md#film
const FILM = 'mimproject/party-container-vabaduse-valjak-2010-webrtc.mp4';
const BASE_OK = /^https:\/\/(sfu\.positron\.studio|positron-sfu\.kristjan-jansen\.workers\.dev)$/;
export class Film extends Container {
  defaultPort = 8080;
  // The film is 2:37 and plays once; the box goes a little after it ends or is stopped.
  sleepAfter = '90s';
}
async function film(env, url, origin, room, verb, method) {
  if (verb === 'status' ? method !== 'GET' : method !== 'POST') return reply(origin, 405, { error: verb === 'status' ? 'GET' : 'POST' });
  const box = getContainer(env.FILM, `room-${room}`);
  try {
    // A cold box answers "There is no container instance" until server.mjs listens.
    if (verb === 'start') await box.startAndWaitForPorts();
    if (verb === 'status') {
      const r = await box.fetch(new Request('http://c/status'));
      return reply(origin, 200, await r.json());
    }
    if (verb === 'stop') {
      const r = await box.fetch(new Request('http://c/stop', { method: 'POST', body: '{}' }));
      return reply(origin, 200, await r.json());
    }
    const base = BASE_OK.test(url.origin) ? url.origin : 'https://sfu.positron.studio';
    const r = await box.fetch(new Request('http://c/start', { method: 'POST', body: JSON.stringify({ room, base, film: FILM }) }));
    return reply(origin, r.status === 200 ? 201 : 502, await r.json());
  } catch (e) {
    // max_instances reached, or the box is still waking.
    return reply(origin, 503, { error: `film: ${String(e.message || e).slice(0, 160)}` });
  }
}

// An adapter makes Cloudflare open a WebSocket to `endpoint` on this account's bill, so only edgecast's adapter
// routes are allowed, and only over the binding. why: lessons/workers-edgecast-adapter.md#sfu-admin
const ADAPTER_ENDPOINT = /^wss:\/\/(edgecast\.positron\.studio|positron-edgecast\.kristjan-jansen\.workers\.dev)\/adapter\/ws\/(egress|ingest)\?t=[A-Za-z0-9_-]{16,128}$/;
const ADAPTER_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

export class SfuAdmin extends WorkerEntrypoint {
  /**
   * Create 1 to 4 WebSocket adapters for one room. Each entry is
   *   { location: 'remote', sessionId, proof, trackName, endpoint }  egress: a publication in this room, as PCM
   *   { location: 'local', trackName, endpoint }                     ingest: PCM in, published as a new session
   * Answers { status, tracks }, an ingest track with `proof` for its new session so a page can pull it in the room.
   */
  async adapterNew(room, list) {
    const env = this.env;
    if (!env.CF_REALTIME_APP_SECRET || !env.SFU_PROOF_KEY) return { status: 503, error: 'no SFU secret on this worker' };
    if (!ROOM_RE.test(room || '')) return { status: 400, error: 'not a room' };
    if (!Array.isArray(list) || !list.length || list.length > 4) return { status: 400, error: '1 to 4 adapters' };
    const tracks = [];
    for (const t of list) {
      if (!ADAPTER_ENDPOINT.test(t?.endpoint || '') || !NAME_RE.test(t.trackName || '')) return { status: 400, error: 'endpoint or trackName refused' };
      if (t.location === 'remote') {
        if (!SID_RE.test(t.sessionId || '')) return { status: 400, error: 'egress needs a session' };
        if (!same(t.proof, await proofOf(env, room, t.sessionId))) return { status: 403, error: `${t.trackName} was not published in this room` };
        tracks.push({ location: 'remote', sessionId: t.sessionId, trackName: t.trackName, endpoint: t.endpoint, outputCodec: 'pcm' });
      } else if (t.location === 'local') {
        tracks.push({ location: 'local', trackName: t.trackName, endpoint: t.endpoint, inputCodec: 'pcm' });
      } else return { status: 400, error: 'location is remote or local' };
    }
    const r = await sfu(env, 'POST', 'adapters/websocket/new', { tracks });
    const out = [];
    for (const x of r.json?.tracks || []) {
      // never hand the endpoint (it carries edgecast's token) back further than the caller
      const y = { trackName: x.trackName, adapterId: x.adapterId, sessionId: x.sessionId, errorCode: x.errorCode, errorDescription: x.errorDescription };
      if (x.sessionId && !x.errorCode) y.proof = await proofOf(env, room, x.sessionId);
      out.push(y);
    }
    return { status: r.status, tracks: out, ...(r.status >= 300 ? { error: (r.json?.errorDescription || r.text || '').slice(0, 200) } : {}) };
  }

  /** Close adapters by id; closing one already closed counts as success. */
  async adapterClose(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 4 || ids.some((x) => !ADAPTER_ID_RE.test(x || ''))) return { status: 400, error: 'adapter ids' };
    const r = await sfu(this.env, 'POST', 'adapters/websocket/close', { tracks: ids.map((adapterId) => ({ adapterId })) });
    return { status: r.status, tracks: r.json?.tracks || [], ...(r.status >= 300 ? { error: (r.text || '').slice(0, 200) } : {}) };
  }
}
