// demo/room/sfu.mjs: the video room through Cloudflare Realtime's SFU, by way of workers/sfu (which holds the
// secret). The same face as mesh.mjs, so the page swaps one for the other: want(sites), signal(m), retrack(),
// leave(), peers(). Two peer connections: one sends this tab's camera, microphone and screen once, whatever the room's
// size; the other receives every other tab's. Each is driven by one queue, because the SFU refuses a call on a
// session while the last one's offer and answer are unfinished. Who published what is said on the relay room as
// `sfu.pub`, with the proof the worker signed, so a tab can pull only what was published in its own room.
// why: lessons/kit-participant.md#sfu

/** Three layers of the camera, named smallest first (a quarter, b half, c full), because the SFU's fallback
 *  when a layer is not flowing takes the next name in alphabetical order: named f, h, q it jumped to full size.
 *  why: lessons/kit-participant.md#sfu */
const LAYERS = [{ rid: 'c', scaleResolutionDownBy: 1, maxBitrate: 900_000 },
  { rid: 'b', scaleResolutionDownBy: 2, maxBitrate: 300_000 }, { rid: 'a', scaleResolutionDownBy: 4, maxBitrate: 100_000 }];
/** The layer for a tile this many CSS pixels wide, on this screen's pixel density. */
export const ridFor = (w, dpr = 1) => (w * dpr >= 640 ? 'c' : w * dpr >= 320 ? 'b' : 'a');
/** A screen share goes out as one layer: every viewer draws it on the stage, and a smaller copy of a
 *  screen is text nobody can read. why: lessons/kit-participant.md#share-sfu */
const SCREEN = [{ maxBitrate: 2_500_000 }];
/** A live stream (/room/stage/) goes out as one layer too, for the same reason, and its sound at music quality.
 *  why: lessons/kit-participant.md#stream */
const STREAM = [{ maxBitrate: 2_500_000 }], SOUND = [{ maxBitrate: 128_000 }];
/** What this tab can publish: a camera, a microphone, a screen, a stream's picture and its sound. */
const KINDS = ['audio', 'video', 'screen', 'stream', 'sound'];
/** The kinds drawn on the stage rather than in a tile, said only while they carry something. */
const STAGED = ['screen', 'stream', 'sound'];

/** One promise chain per session: each step starts when the last has finished, failed or not. */
function queue() {
  let tail = Promise.resolve();
  return (fn) => { const p = tail.then(fn); tail = p.catch(() => {}); return p; };
}
/** Wait for candidates, at most `ms`: the SFU takes the whole description in one call. */
const gathered = (pc, ms = 1500) => new Promise((resolve) => {
  if (pc.iceGatheringState === 'complete') return resolve();
  const done = () => { pc.removeEventListener('icegatheringstatechange', check); clearTimeout(t); resolve(); };
  const check = () => { if (pc.iceGatheringState === 'complete') done(); };
  pc.addEventListener('icegatheringstatechange', check);
  const t = setTimeout(done, ms);
});

/**
 * @param {object} o
 * @param {string} o.base       the worker, https://sfu.positron.studio
 * @param {string} o.room
 * @param {string} o.site       this tab's site
 * @param {(msg: object) => boolean} o.send   puts one JSON message on the relay room
 * @param {RTCIceServer[]} [o.iceServers]
 * @param {() => {audio: MediaStreamTrack|null, video: MediaStreamTrack|null, screen?: MediaStreamTrack|null,
 *   stream?: MediaStreamTrack|null, sound?: MediaStreamTrack|null}} o.tracks  what to send now
 * @param {(site: string, stream: MediaStream) => void} o.onStream
 * @param {(site: string, stream: MediaStream|null) => void} [o.onShare]  a site's screen or live stream, null when it is gone
 * @param {(site: string, state: string, how?: string) => void} [o.onState]
 * @param {(line: string, kind?: string) => void} [o.log]
 */
export function createSfu({ base, room, site, send, iceServers = [], tracks, onStream, onShare = () => {}, onState = () => {}, log = () => {} }) {
  const api = async (path, body) => {
    const r = await fetch(`${base}/room/${encodeURIComponent(room)}/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path.split('/').pop()} ${r.status} ${j.error || ''} ${j.detail ? JSON.stringify(j.detail).slice(0, 160) : ''}`.trim());
    return j;
  };
  const mk = () => new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
  const out = { pc: mk(), q: queue(), session: null, published: new Map() };   // kind -> { trackName, transceiver }
  const inn = { pc: mk(), q: queue(), session: null, mids: new Map() };      // mid -> { site, kind, trackName }
  const remotes = new Map();   // site -> { sessionId, proof, tracks: [{ trackName, kind }] }
  const pulled = new Map();    // `${site} ${trackName}` -> mid ('' while pending)
  const streams = new Map();   // site -> MediaStream
  const shares = new Map();    // site -> MediaStream, its screen, or its stream's picture and sound
  const sending = new Set();   // kinds with a live track now
  // Tracks this tab announces but did not publish: the room's film, sent by a container in its own session.
  // Every tab pulls them as this site's, this tab as well. why: lessons/kit-participant.md#film
  let external = [];           // [{ trackName, kind, sessionId, proof }]
  let wanted = [], rid = 'b', closed = false, ready = null;

  inn.pc.ontrack = (e) => {
    const t = inn.mids.get(e.transceiver.mid);
    if (!t) { log(`a track arrived on mid ${e.transceiver.mid} that nothing asked for`, 'warn'); return; }
    if (STAGED.includes(t.kind)) {
      // A stream's picture and sound arrive as two tracks and are one MediaStream on the stage.
      let s = shares.get(t.site);
      if (!s || t.kind === 'screen') { s = new MediaStream(); shares.set(t.site, s); }
      for (const old of s.getTracks().filter((x) => x.kind === e.track.kind)) s.removeTrack(old);
      s.addTrack(e.track);
      onShare(t.site, s);
      return;
    }
    let s = streams.get(t.site);
    if (!s) { s = new MediaStream(); streams.set(t.site, s); }
    for (const old of s.getTracks().filter((x) => x.kind === e.track.kind)) s.removeTrack(old);
    s.addTrack(e.track);
    onStream(t.site, s);
    // A tile that arrives on a connection already up gets no state change of its own.
    if (inn.pc.connectionState === 'connected') onState(t.site, 'connected', route.in);
  };
  const route = { in: '', out: '' };
  for (const [side, pc] of [['out', out.pc], ['in', inn.pc]]) {
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') how(pc).then((r) => { route[side] = r; for (const s of streams.keys()) onState(s, 'connected', route.in); });
      if (pc.connectionState === 'failed') log(`sfu ${side === 'out' ? 'sending' : 'receiving'} connection failed`, 'warn');
      if (side === 'in') for (const s of streams.keys()) onState(s, pc.connectionState, route.in);
    };
  }
  /** Was the route a TURN relay? Read once connected, from the selected candidate pair. */
  async function how(pc) {
    try {
      const s = await pc.getStats();
      let pair = null;
      s.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = s.get(r.selectedCandidatePairId); });
      const local = pair && s.get(pair.localCandidateId);
      return local ? (local.candidateType === 'relay' ? `relay ${local.relayProtocol || local.protocol}` : local.candidateType) : '';
    } catch { return ''; }
  }

  // Both sessions exist before anything else is asked of them.
  function start() {
    ready ||= Promise.all([api('session'), api('session')]).then(([a, b]) => { out.session = a; inn.session = b; });
    return ready;
  }

  /** Say what this tab publishes, for every other tab; repeated for a late joiner. A screen is said
   *  only while it is shared, or a late joiner would pull a track with nothing on it. */
  function announce() {
    if (!out.session || closed) return;
    send({ type: 'sfu.pub', site, sessionId: out.session.sessionId, proof: out.session.proof,
      tracks: [...out.published].filter(([kind]) => !STAGED.includes(kind) || sending.has(kind))
        .map(([kind, p]) => ({ trackName: p.trackName, kind })).concat(external) });
  }

  /** Publish a kind the first time it has a track; after that only swap the track (null stops sending). */
  function setTrack(kind, track) {
    return out.q(async () => {
      if (closed) return;
      await start();
      const had = out.published.get(kind);
      const was = sending.has(kind);
      if (track) sending.add(kind); else sending.delete(kind);
      if (had) {
        await had.transceiver.sender.replaceTrack(track || null).catch(() => {});
        if (STAGED.includes(kind) && was !== !!track) announce();
        return;
      }
      if (!track) return;
      const enc = kind === 'video' ? { sendEncodings: LAYERS } : kind === 'screen' ? { sendEncodings: SCREEN }
        : kind === 'stream' ? { sendEncodings: STREAM } : kind === 'sound' ? { sendEncodings: SOUND } : {};
      const transceiver = out.pc.addTransceiver(track, { direction: 'sendonly', ...enc });
      if (kind === 'screen') {
        // Keep the text sharp and let the frame rate give: a screen is read, not watched.
        const p = transceiver.sender.getParameters();
        p.degradationPreference = 'maintain-resolution';
        await transceiver.sender.setParameters(p).catch(() => {});
      }
      await out.pc.setLocalDescription(await out.pc.createOffer());
      await gathered(out.pc);
      const trackName = `${site}-${kind}`;
      const r = await api(`${out.session.sessionId}/publish`, { proof: out.session.proof, offer: out.pc.localDescription.toJSON(),
        tracks: [{ mid: transceiver.mid, trackName }] });
      await out.pc.setRemoteDescription(r.answer);
      const bad = r.tracks.find((t) => t.errorCode);
      if (bad) throw new Error(`publish ${kind}: ${bad.errorCode} ${bad.errorDescription || ''}`);
      out.published.set(kind, { trackName, transceiver });
      log(`sfu published ${kind}${kind === 'video' ? ' in three layers' : kind === 'screen' || kind === 'stream' ? ' in one layer' : ''}`);
      announce();
    }).catch((e) => log(`sfu ${e.message}`, 'warn'));
  }

  /** Pull what the wanted sites published and have not been pulled; one queue step, one renegotiation. */
  function reconcile() {
    return inn.q(async () => {
      if (closed) return;
      await start();
      const ask = [];
      const live = new Set();
      for (const [s, r] of [...wanted.map((w) => [w, remotes.get(w)]), [site, { tracks: external }]]) {
        for (const t of r?.tracks || []) {
          const k = `${s} ${t.trackName}`;
          live.add(k);
          if (pulled.has(k)) continue;
          ask.push({ site: s, kind: t.kind, sessionId: t.sessionId || r.sessionId, proof: t.proof || r.proof, trackName: t.trackName,
            ext: !!t.sessionId, ...(t.kind === 'video' ? { rid } : {}) });
        }
      }
      // Sites that left, and a film that ended: stop forwarding their tracks.
      const gone = [...pulled].filter(([k, mid]) => mid && ((!wanted.includes(k.split(' ')[0]) && k.split(' ')[0] !== site)
        || (inn.mids.get(mid)?.ext && !live.has(k))));
      if (gone.length) {
        await api(`${inn.session.sessionId}/close`, { proof: inn.session.proof, mids: gone.map(([, mid]) => mid) }).catch((e) => log(`sfu ${e.message}`, 'warn'));
        const filmGone = new Set(gone.filter(([, mid]) => inn.mids.get(mid)?.ext).map(([k]) => k.split(' ')[0]));
        for (const [k, mid] of gone) { pulled.delete(k); inn.mids.delete(mid); }
        for (const s of [...streams.keys()]) if (!wanted.includes(s)) { streams.delete(s); onState(s, 'closed'); }
        for (const s of [...shares.keys()]) if ((!wanted.includes(s) && s !== site) || filmGone.has(s)) { shares.delete(s); onShare(s, null); }
      }
      if (!ask.length) return;
      const r = await api(`${inn.session.sessionId}/pull`, { proof: inn.session.proof,
        tracks: ask.map(({ sessionId, proof, trackName, rid: x }) => ({ sessionId, proof, trackName, ...(x ? { rid: x } : {}) })) });
      let retry = false;
      r.tracks.forEach((t, i) => {
        const a = ask[i];
        if (t.errorCode || !t.mid) { retry = true; log(`sfu pull ${a.trackName}: ${t.errorCode || 'no mid'}`, 'warn'); return; }
        // The mid is mapped before the offer is applied: ontrack fires while it is.
        inn.mids.set(t.mid, { site: a.site, kind: a.kind, trackName: a.trackName, ext: a.ext });
        pulled.set(`${a.site} ${a.trackName}`, t.mid);
      });
      if (r.offer) {
        await inn.pc.setRemoteDescription(r.offer);
        await inn.pc.setLocalDescription(await inn.pc.createAnswer());
        await gathered(inn.pc);
        await api(`${inn.session.sessionId}/answer`, { proof: inn.session.proof, answer: inn.pc.localDescription.toJSON() });
      }
      // A track published a moment ago may not carry media yet (empty_track_error): ask again shortly.
      if (retry) setTimeout(() => reconcile(), 3000);
    }).catch((e) => log(`sfu ${e.message}`, 'warn'));
  }

  /** A site said goodbye: stop forwarding its tracks and take its tile down now, not when its graph goes stale. */
  function drop(s) {
    if (streams.delete(s)) onState(s, 'closed');
    if (shares.delete(s)) onShare(s, null);
    inn.q(async () => {
      const mine = [...pulled].filter(([k, mid]) => k.startsWith(`${s} `) && mid);
      for (const [k] of [...pulled]) if (k.startsWith(`${s} `)) pulled.delete(k);
      if (!mine.length) return;
      for (const [, mid] of mine) inn.mids.delete(mid);
      await api(`${inn.session.sessionId}/close`, { proof: inn.session.proof, mids: mine.map(([, mid]) => mid) });
    }).catch((e) => log(`sfu ${e.message}`, 'warn'));
  }

  return {
    /** Receive from exactly these sites. */
    want(sites) { wanted = sites.filter((s) => s !== site); reconcile(); },
    /** One message from the room, already checked to come from the site it names. */
    signal(m) {
      if (m.type === 'sfu.bye') { remotes.delete(m.site); drop(m.site); return; }
      if (m.type !== 'sfu.pub' || typeof m.sessionId !== 'string' || !Array.isArray(m.tracks)) return;
      const had = remotes.get(m.site);
      // A new session from the same site is a reload: what was pulled from the old one is dead.
      if (had && had.sessionId !== m.sessionId) for (const k of [...pulled.keys()]) if (k.startsWith(`${m.site} `)) pulled.delete(k);
      remotes.set(m.site, { sessionId: m.sessionId, proof: m.proof, tracks: m.tracks.filter((t) => t && KINDS.includes(t.kind)
        && (t.sessionId === undefined || (typeof t.sessionId === 'string' && typeof t.proof === 'string'))) });
      reconcile();
    },
    announce,
    /** The room's film as this site's stream and sound, or null when it ended: { sessionId, proof, tracks }. */
    film(pub) {
      external = pub ? pub.tracks.map((t) => ({ trackName: t.trackName, kind: t.kind, sessionId: pub.sessionId, proof: pub.proof })) : [];
      start().then(announce);
      reconcile();
    },
    /** Send the current tracks: a kind is published the first time it has one. */
    retrack() { const t = tracks(); for (const k of KINDS) setTrack(k, t[k] || null); },
    /** Every pulled camera at this layer; asked only when it changes. */
    layer(next) {
      if (next === rid) return;
      rid = next;
      inn.q(async () => {
        const mids = [...inn.mids].filter(([, t]) => t.kind === 'video').map(([mid]) => ({ mid, rid }));
        if (mids.length) await api(`${inn.session.sessionId}/update`, { proof: inn.session.proof, tracks: mids });
      }).catch((e) => log(`sfu ${e.message}`, 'warn'));
    },
    leave() {
      closed = true;
      send({ type: 'sfu.bye', site });
      for (const pc of [out.pc, inn.pc]) try { pc.close(); } catch { /* gone */ }
      for (const s of streams.keys()) onState(s, 'closed');
      for (const s of shares.keys()) onShare(s, null);
      streams.clear(); shares.clear();
    },
    peers: () => [...streams.keys()].map((s) => ({ site: s, state: inn.pc.connectionState, route: route.in })),
    layerNow: () => rid,
    published: () => [...out.published.keys()].filter((k) => !STAGED.includes(k) || sending.has(k)),
    /** The screen or stream this tab pulled from a site, if any. */
    share: (s) => shares.get(s) || null,
    /** The two peer connections, for a page that reads their stats (/radio/return/); read only. */
    connections: () => ({ send: out.pc, receive: inn.pc }),
  };
}
