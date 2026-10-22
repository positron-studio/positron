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
/** What this tab can publish: a camera, a microphone, a screen. */
const KINDS = ['audio', 'video', 'screen'];

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
 * @param {() => {audio: MediaStreamTrack|null, video: MediaStreamTrack|null, screen?: MediaStreamTrack|null}} o.tracks  what to send now
 * @param {(site: string, stream: MediaStream) => void} o.onStream
 * @param {(site: string, stream: MediaStream|null) => void} [o.onShare]  a site's screen, null when it is gone
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
  const shares = new Map();    // site -> MediaStream, its screen
  const sending = new Set();   // kinds with a live track now
  let wanted = [], rid = 'b', closed = false, ready = null;

  inn.pc.ontrack = (e) => {
    const t = inn.mids.get(e.transceiver.mid);
    if (!t) { log(`a track arrived on mid ${e.transceiver.mid} that nothing asked for`, 'warn'); return; }
    if (t.kind === 'screen') {
      const s = new MediaStream([e.track]);
      shares.set(t.site, s);
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
      tracks: [...out.published].filter(([kind]) => kind !== 'screen' || sending.has('screen'))
        .map(([kind, p]) => ({ trackName: p.trackName, kind })) });
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
        if (kind === 'screen' && was !== !!track) announce();
        return;
      }
      if (!track) return;
      const enc = kind === 'video' ? { sendEncodings: LAYERS } : kind === 'screen' ? { sendEncodings: SCREEN } : {};
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
      log(`sfu published ${kind}${kind === 'video' ? ' in three layers' : kind === 'screen' ? ' in one layer' : ''}`);
      announce();
    }).catch((e) => log(`sfu ${e.message}`, 'warn'));
  }

  /** Pull what the wanted sites published and have not been pulled; one queue step, one renegotiation. */
  function reconcile() {
    return inn.q(async () => {
      if (closed) return;
      await start();
      const ask = [];
      for (const s of wanted) {
        const r = remotes.get(s);
        for (const t of r?.tracks || []) {
          const k = `${s} ${t.trackName}`;
          if (pulled.has(k)) continue;
          ask.push({ site: s, kind: t.kind, sessionId: r.sessionId, proof: r.proof, trackName: t.trackName, ...(t.kind === 'video' ? { rid } : {}) });
        }
      }
      // Sites that left: stop forwarding their tracks.
      const gone = [...pulled].filter(([k, mid]) => mid && !wanted.includes(k.split(' ')[0]));
      if (gone.length) {
        await api(`${inn.session.sessionId}/close`, { proof: inn.session.proof, mids: gone.map(([, mid]) => mid) }).catch((e) => log(`sfu ${e.message}`, 'warn'));
        for (const [k, mid] of gone) { pulled.delete(k); inn.mids.delete(mid); }
        for (const s of [...streams.keys()]) if (!wanted.includes(s)) { streams.delete(s); onState(s, 'closed'); }
        for (const s of [...shares.keys()]) if (!wanted.includes(s)) { shares.delete(s); onShare(s, null); }
      }
      if (!ask.length) return;
      const r = await api(`${inn.session.sessionId}/pull`, { proof: inn.session.proof,
        tracks: ask.map(({ sessionId, proof, trackName, rid: x }) => ({ sessionId, proof, trackName, ...(x ? { rid: x } : {}) })) });
      let retry = false;
      r.tracks.forEach((t, i) => {
        const a = ask[i];
        if (t.errorCode || !t.mid) { retry = true; log(`sfu pull ${a.trackName}: ${t.errorCode || 'no mid'}`, 'warn'); return; }
        // The mid is mapped before the offer is applied: ontrack fires while it is.
        inn.mids.set(t.mid, { site: a.site, kind: a.kind, trackName: a.trackName });
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
      remotes.set(m.site, { sessionId: m.sessionId, proof: m.proof, tracks: m.tracks.filter((t) => t && KINDS.includes(t.kind)) });
      reconcile();
    },
    announce,
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
    published: () => [...out.published.keys()].filter((k) => k !== 'screen' || sending.has('screen')),
    /** The screen this tab pulled from a site, if any. */
    share: (s) => shares.get(s) || null,
    /** The two peer connections, for a page that reads their stats (/radio/return/); read only. */
    connections: () => ({ send: out.pc, receive: inn.pc }),
  };
}
