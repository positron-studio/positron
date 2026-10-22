// demo/room/mesh.mjs: a full mesh of WebRTC peer connections, one per other tab, signalled over the
// relay room the page already joined. The tab whose site sorts first makes the offer, so two tabs
// never offer at once. Both sides hold an audio, a camera and a screen transceiver from the start, so
// a camera or a share switched off and on again is a replaceTrack, never a new offer.
// A mesh sends your camera once per peer: fine for a few, wrong for many. See
// plans/plan-video-room.md §3 for where it stops and the SFU takes over.
// why: lessons/kit-participant.md#mesh

/**
 * @param {object} o
 * @param {string} o.site                     this tab's site
 * @param {(msg: object) => boolean} o.send   puts one JSON message on the room
 * @param {RTCIceServer[]} [o.iceServers]
 * @param {() => {audio: MediaStreamTrack|null, video: MediaStreamTrack|null, screen?: MediaStreamTrack|null}} o.tracks  what to send now
 * @param {(site: string, stream: MediaStream) => void} o.onStream
 * @param {(site: string, stream: MediaStream|null) => void} [o.onShare]  a peer's screen, null when it is gone
 * @param {(site: string, state: string, how?: string) => void} [o.onState]
 * @param {(line: string, kind?: string) => void} [o.log]
 */
export function createMesh({ site, send, iceServers = [], tracks, onStream, onShare = () => {}, onState = () => {}, log = () => {} }) {
  const peers = new Map();   // site -> { pc, stream, queue, offerer }
  // The transceivers by position: the offerer adds them in this order and the answerer gets them
  // in the same order from the offer. Two are video, so the kind cannot tell them apart.
  // why: lessons/kit-participant.md#share-mesh
  const ROLES = ['audio', 'video', 'screen'];
  const roleOf = (pc, tr) => ROLES[pc.getTransceivers().indexOf(tr)] || '';

  function make(other) {
    const pc = new RTCPeerConnection({ iceServers });
    const offerer = site < other;
    const p = { pc, stream: new MediaStream(), screen: null, queue: [], offerer, restarted: false, born: Date.now() };
    peers.set(other, p);
    if (offerer) {
      for (const role of ROLES) pc.addTransceiver(role === 'audio' ? 'audio' : 'video', { direction: 'sendrecv' });
      attach(p);
    }
    pc.ontrack = (e) => {
      if (roleOf(pc, e.transceiver) === 'screen') {
        p.screen = new MediaStream([e.track]);
        onShare(other, p.screen);
        return;
      }
      if (!p.stream.getTracks().includes(e.track)) p.stream.addTrack(e.track);
      onStream(other, p.stream);
    };
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'rtc.sig', site, to: other, cand: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = async () => {
      onState(other, pc.connectionState, how(p));
      if (pc.connectionState === 'connected') how(p, true);
      if (pc.connectionState === 'failed' && p.offerer && !p.restarted) {
        // One ICE restart, then it stays failed and says so.
        p.restarted = true;
        log(`${other}: failed, restarting ICE once`, 'warn');
        try { await offer(other, p, { iceRestart: true }); } catch (e) { log(`${other}: restart ${e.message}`, 'warn'); }
      }
    };
    if (offerer) offer(other, p).catch((e) => log(`${other}: offer ${e.message}`, 'warn'));
    return p;
  }

  /** Put this tab's current tracks on a peer's three transceivers. */
  function attach(p) {
    const t = tracks();
    for (const tr of p.pc.getTransceivers()) {
      const role = roleOf(p.pc, tr);
      if (!role || tr.stopped) continue;
      tr.direction = 'sendrecv';
      tr.sender.replaceTrack(t[role] || null).catch(() => { /* closed */ });
      if (role === 'screen') {
        tr.sender.setParameters({ ...tr.sender.getParameters(), degradationPreference: 'maintain-resolution' }).catch(() => {});
      }
    }
  }

  /** Was the route a TURN relay? Read once connected, from the selected candidate pair. */
  function how(p, read = false) {
    if (read) {
      p.pc.getStats().then((s) => {
        let pair = null;
        s.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = s.get(r.selectedCandidatePairId); });
        const local = pair && s.get(pair.localCandidateId);
        p.route = local ? (local.candidateType === 'relay' ? `relay ${local.relayProtocol || local.protocol}` : local.candidateType) : '';
      }).catch(() => {});
    }
    return p.route || '';
  }

  async function offer(other, p, opts = {}) {
    const o = await p.pc.createOffer(opts);
    await p.pc.setLocalDescription(o);
    send({ type: 'rtc.sig', site, to: other, sdp: p.pc.localDescription.toJSON() });
  }

  /** One signalling message from the room, already checked to come from the site it names. */
  async function signal(m) {
    if (m.to !== site) return;
    const other = m.site;
    if (m.bye) { drop(other); return; }
    let p = peers.get(other);
    if (!p) {
      if (!m.sdp || m.sdp.type !== 'offer') return;   // a stray candidate for a peer we closed
      p = make(other);
    }
    try {
      if (m.sdp) {
        await p.pc.setRemoteDescription(m.sdp);
        for (const c of p.queue.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
        if (m.sdp.type === 'offer') {
          attach(p);
          const a = await p.pc.createAnswer();
          await p.pc.setLocalDescription(a);
          send({ type: 'rtc.sig', site, to: other, sdp: p.pc.localDescription.toJSON() });
        }
      } else if (m.cand) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.cand).catch(() => {});
        else p.queue.push(m.cand);
      }
    } catch (e) { log(`${other}: ${e.message}`, 'warn'); }
  }

  function drop(other) {
    const p = peers.get(other);
    if (!p) return;
    try { p.pc.close(); } catch { /* gone */ }
    peers.delete(other);
    if (p.screen) onShare(other, null);
    onState(other, 'closed');
  }

  return {
    /** Connect to exactly these sites: the offerer side starts, the others wait for an offer. */
    want(sites) {
      for (const s of sites) if (s !== site && !peers.has(s) && site < s) make(s);
      // A peer that offered before its graph reached us is kept for a few seconds, or it would be
      // dropped by the very reconcile its offer raced.
      for (const [s, p] of [...peers]) if (!sites.includes(s) && Date.now() - p.born > 10_000) drop(s);
    },
    signal,
    /** Every peer gets the current tracks again: after a mute, a camera off or on. */
    retrack() { for (const p of peers.values()) attach(p); },
    leave() {
      for (const other of [...peers.keys()]) { send({ type: 'rtc.sig', site, to: other, bye: true }); drop(other); }
    },
    peers: () => [...peers.entries()].map(([s, p]) => ({ site: s, state: p.pc.connectionState, route: p.route || '', offerer: p.offerer })),
    /** The screen this tab receives from a peer, if any. */
    share: (s) => peers.get(s)?.screen || null,
  };
}
