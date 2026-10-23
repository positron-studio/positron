// FAR END: a picture goes live over WebRTC to a second RTCPeerConnection in this
// page, and what it receives is recorded and played back. Host candidates only.
// `?room=NAME` also offers it over the relay; that leg is logged, never asserted.
// See lessons/page-capture.md#capture-9

import { recorderMime, el, armVideo, playOrPrompt } from '/shell/shell.mjs';
import { hueFor } from '/shell/pattern.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi } from '/shell/transport-control.mjs';
import { playToggle, clockView, scrubView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { mediaMaster } from '/timeline/media-master.mjs';
import { SELFCHECK } from '/shell/selfcheck.mjs';
import { createButtonRow, createSource, resolveDuration, slot, wait } from './common.mjs';

const SEG_MS = 1000;
const REC_MS = 3200;       // four segments, a scrubbable archive, a short show

// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = 'The clock goes live over WebRTC to a second connection in this page, and that receiving end records what it got. Press Go live and record, then Play it back.';

export const readout = { source: '', 'to live': 'ms', fps: '', segments: '', total: 'KiB', length: 's' };

export function build({ panel, log, set }) {
  const ROOM = new URLSearchParams(location.search).get('room');
  const ID = Math.random().toString(36).slice(2, 8);

  // Declared above the source, which reads them on its first frame.
  let srcStream = null, pcOut = null, pcIn = null, remote = null;
  let recording = false;

  // Alive while the leg is up: a captured stream off an undrawn canvas stops.
  // See lessons/page-capture.md#capture-10
  const source = createSource({ opts: () => ({ hue: hueFor('show') }), alive: () => !!pcOut });
  const pair = el('div', 'cap-pair');
  const srcFig = el('figure');
  srcFig.append(source.canvas, el('figcaption', 'pos-cap', 'source'));
  const liveFig = el('figure');
  const liveVideo = el('video', '', null, { playsinline: '', autoplay: '' });
  liveVideo.muted = true;
  liveFig.append(liveVideo, el('figcaption', 'pos-cap', 'received over webrtc'));
  pair.append(srcFig, liveFig);

  const back = el('video', 'cap-back', null, { playsinline: '', muted: '', controls: '' });
  back.muted = true;
  back.hidden = true;
  const segsEl = el('div', 'cap-segs');
  segsEl.hidden = true;

  // ONE primary that does the whole capture leg, first.
  const row = createButtonRow([
    { id: 'run', label: 'Go live and record 3 s', primary: true },
    { id: 'camera', label: 'Use the camera' },
    { id: 'play', label: 'Play it back' },
  ], log);
  const barSlot = slot();
  panel.add(pair, back, segsEl, row.el, barSlot);

  row.on('camera', async () => {
    // the track already published keeps flowing: the canvas is the source of
    // truth for the wire, so switching sources needs no renegotiation
    if (await source.camera(log)) set('source', 'camera');
  });

  // ── the live leg ─────────────────────────────────────────────────────────
  let liveAt = null, framesDecoded = 0;

  // One shared promise, not a boolean: a second caller must WAIT for the first
  // negotiation, not sail past it.
  let livePromise = null;
  const goLive = () => (livePromise ||= goLiveOnce());

  async function goLiveOnce() {
    set('source', source.cameraOn() ? 'camera' : 'canvas');
    srcStream = source.canvas.captureStream(25);
    pcOut = new RTCPeerConnection();
    pcIn = new RTCPeerConnection();
    // Loopback trickle: each end's candidates are the other's.
    pcOut.onicecandidate = (e) => e.candidate && pcIn.addIceCandidate(e.candidate).catch(() => {});
    pcIn.onicecandidate = (e) => e.candidate && pcOut.addIceCandidate(e.candidate).catch(() => {});
    pcIn.ontrack = (e) => {
      remote = e.streams[0];
      liveVideo.srcObject = remote;
      liveVideo.play().catch(() => {});
    };
    pcOut.onconnectionstatechange = () => log(`live leg: ${pcOut.connectionState}`);

    const t0 = performance.now();
    for (const t of srcStream.getTracks()) pcOut.addTrack(t, srcStream);
    const offer = await pcOut.createOffer();
    await pcOut.setLocalDescription(offer);
    await pcIn.setRemoteDescription(offer);
    const answer = await pcIn.createAnswer();
    await pcIn.setLocalDescription(answer);
    await pcOut.setRemoteDescription(answer);

    // First DECODED frame, not first byte. rVFC is precise and throttled in a
    // background tab, so videoWidth is polled beside it and the first wins.
    await new Promise((res) => {
      let iv = null;
      const done = () => {
        if (liveAt == null) { liveAt = performance.now() - t0; set('to live', Math.round(liveAt)); }
        clearInterval(iv); res();
      };
      liveVideo.requestVideoFrameCallback?.(done);
      liveVideo.addEventListener('loadeddata', done, { once: true });
      iv = setInterval(() => { if (liveVideo.videoWidth > 0) done(); }, 100);
      setTimeout(() => { clearInterval(iv); res(); }, 5000);
    });
    log(`live in ${liveAt == null ? '>5000' : Math.round(liveAt)} ms, ${liveVideo.videoWidth}x${liveVideo.videoHeight}`, 'hi');
    if (ROOM) joinRoom();
  }

  // Decoded-frame rate off the receiver's own stats. Deliberately NOT the
  // candidate-pair RTT: on a loopback hop that is ~0 and would read as a
  // latency claim this tab has not earned.
  let lastFrames = 0, lastStatsAt = 0, saidThrottled = false;
  setInterval(async () => {
    if (!pcIn) return;
    const stats = await pcIn.getStats();
    for (const s of stats.values()) {
      if (s.type !== 'inbound-rtp' || s.kind !== 'video') continue;
      framesDecoded = s.framesDecoded ?? 0;
      const now = performance.now();
      let fps = null;
      if (lastStatsAt) {
        fps = (framesDecoded - lastFrames) / ((now - lastStatsAt) / 1000);
        set('fps', Math.round(fps * 10) / 10, fps > 15 ? 'ok' : fps > 5 ? '' : 'bad');
      }
      // A background tab is not a broken demo: Chrome throttles the canvas timer to ~1 Hz.
      // See lessons/page-capture.md#capture-11
      if (!saidThrottled && fps != null && fps < 5 && document.visibilityState === 'hidden') {
        saidThrottled = true;
        log('the page is in the background, so the source canvas is throttled to ~1 fps, not the wire', 'bad');
      }
      lastFrames = framesDecoded; lastStatsAt = now;
    }
  }, 1000);

  /**
   * The optional real remote leg, `?room=NAME`. Logged, never asserted. It both
   * offers and answers, glare broken by id order, so two copies connect.
   * See lessons/page-capture.md#capture-12
   */
  function joinRoom() {
    const ws = new WebSocket(`wss://ws.positron.studio/room/${ROOM}/ws`);
    const peers = new Map();
    const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify({ ...o, from: ID }));
    const wire = (peer, pc) => {
      peers.set(peer, pc);
      pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', to: peer, c: e.candidate });
      pc.onconnectionstatechange = () => log(`peer ${peer}: ${pc.connectionState}`);
      pc.ontrack = (e) => { peerTile(peer).srcObject = e.streams[0]; };
      for (const t of srcStream.getTracks()) pc.addTrack(t, srcStream);
    };
    const offerTo = async (peer) => {
      if (peers.has(peer)) return;
      const pc = new RTCPeerConnection();
      wire(peer, pc);
      const o = await pc.createOffer();
      await pc.setLocalDescription(o);
      send({ type: 'offer', to: peer, sdp: o.sdp });
    };
    ws.onopen = () => { log(`offering this show to room ${ROOM} as ${ID}`); send({ type: 'hello' }); };
    ws.onmessage = async (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.from === ID || (m.to && m.to !== ID)) return;
      if (m.type === 'hello') { send({ type: 'here' }); offerTo(m.from); return; }
      if (m.type === 'here') { offerTo(m.from); return; }
      if (m.type === 'offer') {
        if (peers.has(m.from) && ID < m.from) return;
        peers.get(m.from)?.close();
        const pc = new RTCPeerConnection();
        wire(m.from, pc);
        await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
        const a = await pc.createAnswer();
        await pc.setLocalDescription(a);
        send({ type: 'answer', to: m.from, sdp: a.sdp });
        return;
      }
      if (m.type === 'answer') {
        const pc = peers.get(m.from);
        if (pc?.signalingState === 'have-local-offer') await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
        return;
      }
      if (m.type === 'ice') { try { await peers.get(m.from)?.addIceCandidate(m.c); } catch { /* late */ } }
    };
    addEventListener('pagehide', () => { try { ws.close(); } catch { /* gone */ } });
  }

  const peerTiles = new Map();
  function peerTile(peer) {
    if (!peerTiles.has(peer)) {
      const fig = el('figure');
      const v = el('video', '', null, { playsinline: '', autoplay: '' });
      v.muted = true;
      fig.append(v, el('figcaption', 'pos-cap', `peer ${peer}`));
      pair.append(fig);
      peerTiles.set(peer, v);
    }
    return peerTiles.get(peer);
  }

  // ── recording the FAR END ────────────────────────────────────────────────
  // MediaRecorder is pointed at the RECEIVED stream, not at the canvas: what
  // lands in the archive is what came off the wire, decode losses and all.
  const segs = [];
  let recTrack = null, mime = null, bytes = 0;

  function paintSegs() {
    set('segments', segs.length || '');
    set('total', bytes ? Math.round(bytes / 1024) : '');
    segsEl.hidden = segs.length === 0;
    segsEl.replaceChildren(...segs.slice(-20).map((b, i) =>
      el('i', '', `${segs.length - Math.min(20, segs.length) + i}:${Math.round(b.size / 1024)}k`)));
  }

  async function record() {
    if (recording) return;
    await goLive();
    if (!remote) { log('no received stream to record', 'bad'); return; }
    segs.length = 0; bytes = 0; assembling = null; duration = null; paintSegs();
    mime = recorderMime({ log });
    if (!mime) return;
    const rec = new MediaRecorder(remote, { mimeType: mime, videoBitsPerSecond: 800_000 });
    // WHAT is being recorded, kept as the object itself: a remote MediaStream
    // carries the SENDER's msid, so an id comparison passes vacuously.
    recTrack = remote.getVideoTracks()[0] || null;
    rec.ondataavailable = (e) => {
      if (!e.data?.size) return;
      segs.push(e.data); bytes += e.data.size; paintSegs();
    };
    rec.onerror = (e) => log(`recorder: ${e.error?.name ?? 'error'}`, 'bad');
    recording = true;
    rec.start(SEG_MS);
    log(`recording the received stream, ${mime}, ${SEG_MS / 1000}s segments`, 'hi');
    await wait(REC_MS);
    rec.stop();
    await wait(400);
    recording = false;
    log(`recorded ${segs.length} segments off the wire, ${Math.round(bytes / 1024)} KiB`);
    // Resolve the duration and raise the bar HERE: the bar appears exactly when
    // there is something to scrub.
    await buildDeck();
  }

  const settled = async () => { for (let i = 0; i < 100 && recording; i++) await wait(200); };

  // ── playback, on the deck ────────────────────────────────────────────────
  let deck = null, bar = null, duration = null, assembling = null;
  const assemble = () => (assembling ||= assembleOnce());

  async function assembleOnce() {
    if (!segs.length) return null;
    back.src = URL.createObjectURL(new Blob(segs, { type: mime || 'video/webm' }));
    const ms = await resolveDuration(back);
    duration = ms == null ? null : ms / 1000;
    if (duration != null) set('length', Math.round(duration * 100) / 100);
    return duration;
  }

  /** One deck for the recording, built once the duration is known. */
  async function buildDeck() {
    const dur = await assemble();
    if (dur == null) return null;
    if (!deck) {
      deck = createDeck({ items: [], adapters: {}, range: [0, Math.round(dur * 1000)] });
      // The picture is the master: every seek goes through `deck.seek()`, so wrapping it
      // once applies a scrub to the picture before the vector snaps back.
      // See lessons/page-capture.md#capture-13
      mediaMaster(deck, back, {});
      const seek = deck.seek.bind(deck);
      deck.seek = (p, opts) => {
        const q = seek(p, opts);
        if (Number.isFinite(q)) back.currentTime = q / 1000;
        return q;
      };
      // Not published: the tab page's transport is another tab's; the drill gets this api.
      const control = createTransportControl(deck);
      const loop = loopView(control);
      const tb = createBar({ start: [playToggle(control).el], middle: [scrubView(control).el, clockView(control).el, noteView(control).el],
        end: [loop.el, ratesView(control).el] });
      barSlot.append(tb.el);
      bindTransportKeys(control, { scope: tb.el });
      bar = transportApi(control, { el: tb.el, loopView: loop });
      barSlot.hidden = false;
    }
    return deck;
  }

  row.on('run', record);          // record() goes live first if it has to

  row.on('play', async () => {
    await settled();
    armVideo(back);
    if (!(await buildDeck())) { log('nothing recorded yet. Press Go live first', 'bad'); return; }
    pair.hidden = true;
    back.hidden = false;
    await playOrPrompt(back, { log });
    deck.play?.();
    log(`playing back ${duration.toFixed(2)}s of the received stream, scrub it`, 'hi');
  });

  return {
    get bars() { return bar ? [{ name: 'far end', bar }] : []; },
    hide() { if (!back.paused) back.pause(); },
    /** Presses Go live, then Play it back, and grades what they produced. */
    async check({ A }) {
      A('building this tab opened nothing: no connection, no camera',
        !pcOut && !pcIn && !source.cameraOn(), `connections ${pcOut || pcIn ? 'OPEN' : 'none'} before a press`);
      await row.press('run');
      // Land the immediate ones first, then wait.
      A('the live leg is connected', pcOut?.connectionState === 'connected'
        && pcIn?.connectionState === 'connected', `${pcOut?.connectionState}/${pcIn?.connectionState}`);
      A('a picture arrived at the far end', liveVideo.videoWidth > 0,
        `${liveVideo.videoWidth}x${liveVideo.videoHeight}`);
      for (let i = 0; i < 25 && framesDecoded === 0; i++) await wait(200);
      A('frames decoded off the wire', framesDecoded > 0, `${framesDecoded} frame(s)`);
      const rxTrack = pcIn?.getReceivers().find((r) => r.track?.kind === 'video')?.track ?? null;
      const txTrack = srcStream?.getVideoTracks()[0] ?? null;
      A('the recording is the RECEIVER\'s track, not the source',
        !!recTrack && recTrack === rxTrack && recTrack !== txTrack,
        `receiver ${recTrack === rxTrack ? 'yes' : 'NO'}, source ${recTrack === txTrack ? 'YES' : 'no'}`
        + ` (ids are equal by msid: ${String(remote?.id).slice(0, 8)})`);
      A('segments closed', segs.length > 0, `${segs.length} segment(s), ${Math.round(bytes / 1024)} KiB`);
      await row.press('play');
      A('the recording resolves a duration', duration != null && duration > 0,
        duration == null ? 'Infinity' : `${duration.toFixed(2)}s`);
      // deck.range is the span ARRAY, mutated in place by setRange
      A('the deck spans the recording', !!deck && Math.abs(deck.range[1] - duration * 1000) < 1500,
        deck ? `${deck.range[1]} ms vs ${Math.round(duration * 1000)} ms` : 'no deck');
      // the seek has to move the PICTURE, not just the vector; harness only,
      // because it drags somebody's playback to the middle
      if (SELFCHECK) {
        const mid = Math.round((duration ?? 0) * 500);
        deck?.seek(mid);
        for (let i = 0; i < 6 && Math.abs(back.currentTime * 1000 - mid) > 400; i++) await wait(50);
        A('the seek moves the picture', !!deck && Math.abs(back.currentTime * 1000 - mid) < 400,
          `${Math.round(back.currentTime * 1000)} ms ~ ${mid} ms`);
      }
      // the archive is a FILE, not a live stream
      A('playback is off the recording, not the live stream',
        back.srcObject == null && String(back.src).startsWith('blob:'), String(back.src).slice(0, 24));
      // Back to the start, so the bar drill's `5` key has to move the playhead to land.
      // See lessons/page-capture.md#capture-14
      deck?.pause?.();
      deck?.seek(0);
      back.pause();
    },
  };
}
