// ROUND TRIP: the WHIP and WHEP leg is retired (its input is deleted, /whip is
// 410), so Send and receive asks for relay servers, then logs the leg as retired.
// A deep run reads the leg asserts red with that reason, by design.
// See lessons/page-capture.md#capture-15

import { el, armVideo, recorderMime } from '/shell/shell.mjs';
import { setIcon } from '/shell/icon-button.mjs';
import { putWhole, fetchBack } from '/shell/ingest.mjs';
import { RETIRED_LEG, fetchIceServers, readIcePath } from '/shell/live.mjs';
import { createPanelValues } from '/shell/video-panel.mjs';
import { readBurnedFrom, videoHue } from '/shell/pattern.mjs';
import { createBar, barButton } from '/shell/bar.mjs';
import { createTransportControl, transportApi } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { mediaMaster } from '/timeline/media-master.mjs';
import { ifSelfcheck, SELFCHECK, DEEP } from '/shell/selfcheck.mjs';
import { createButtonRow, createSource, resolveDuration, requests, wait } from './common.mjs';

const CAP_MS = 10_000;   // a backstop, not the mechanism: stop is manual
const SLICE_MS = 500;
const FPS = 25, FRAME_MS = 1000 / FPS;

// No readout: see the header.
// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = 'The clock went out to Cloudflare and came back, and what you recorded was the copy that came back. The leg was retired on 2026-10-13, so Send and receive now says so and stops.';

export const readout = null;

export function build({ panel, assert, log }) {
  // R2 IS OPT-IN, by `?r2=1`, exactly as SEGMENTS does it: the caps are real.
  const useR2 = new URLSearchParams(location.search).get('r2') === '1';

  // WHAT SURVIVES A RELOAD: localStorage holds only what is needed to find the
  // R2 takes again, never the video, and anything past its six hours is
  // dropped on the way in rather than fetched and found missing.
  const REMEMBER = 'keep.takes.v1';
  const remembered = () => {
    try {
      const all = JSON.parse(localStorage.getItem(REMEMBER) || '[]');
      return all.filter((t) => t.expiresAt && new Date(t.expiresAt) > new Date());
    } catch { return []; }
  };
  const remember = (t) => {
    try { localStorage.setItem(REMEMBER, JSON.stringify([...remembered(), t])); } catch { /* full or off */ }
  };
  const forget = () => { try { localStorage.removeItem(REMEMBER); } catch { /* off */ } };

  const ink = (h, s, l, a = 1) => `hsl(${h} ${s}% ${l}% / ${a})`;

  // Declared above the source, whose first frame is drawn during build.
  const parts = [];      // { n, hue, mime, blobs[], bytes, lenMs, startMs, video }
  let totalMs = 0, recording = null, landing = null, active = null;
  let pub = null, sub = null, legs = [];
  const scratch = document.createElement('canvas');

  // The source: our own picture. Alive while a leg is up, because a captured
  // stream off a canvas that stops being drawn stops.
  // See lessons/page-capture.md#capture-16
  const source = createSource({
    opts: () => ({ hue: videoHue(parts.length) }),
    alive: () => !!pub,
    media: true,
  });
  const stage = el('div', 'cap-pair');
  const srcFig = el('figure');
  srcFig.append(source.canvas, el('figcaption', 'pos-cap', 'sent'));
  const seqFig = el('figure');
  const seq = el('div', 'cap-seq');
  const live = el('video', '', null, { playsinline: '', muted: '' });
  live.muted = true;
  seq.append(live);
  const seqCap = el('figcaption', 'pos-cap', 'received');
  // Round trip and route as two cells on the picture: `direct` or `relay`, since a
  // relayed round trip is not comparable to a direct one.
  // See lessons/page-capture.md#capture-17
  const legVals = createPanelValues([
    { key: 'rt', label: 'round trip', reserve: 7 },
    { key: 'path', label: '', reserve: 6 },
  ]);
  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const legText = () => { legVals.set('rt', legs.length ? `+${Math.round(median(legs))} ms` : ''); };
  seqFig.append(seq, seqCap, legVals.el);
  stage.append(srcFig, seqFig);

  const row = createButtonRow([
    { id: 'go', label: 'Send and receive', primary: true },
    { id: 'camera', label: 'Use the camera' },
    { id: 'clear', label: 'Delete takes', end: true },
  ], log);
  panel.add(stage, row.el);

  row.on('camera', () => source.camera(log));

  row.on('clear', () => {
    if (checking) { log('the checks are using the takes, so they stay until those finish'); return; }
    if (recording) { log('stop recording first'); return; }
    for (const p of parts) { try { p.video.remove(); URL.revokeObjectURL(p.url); } catch { /* gone */ } }
    parts.length = 0; totalMs = 0; active = null; handovers = [];
    deck.setRange([0, CAP_MS]);
    deck.seek(0);
    live.hidden = false;
    legText();
    asserted = false; didClock = false;
    paint();
    forget();
    log('takes deleted, and forgotten. The R2 files stay until their six hours '
      + 'are up, but this tab will not pick them up again');
  });

  // ── the line ──────────────────────────────────────────────────────────────
  const deck = createDeck({ items: [], adapters: {}, range: [0, CAP_MS] });
  const inFlight = () => {
    const r = recording;
    if (!r) return null;
    return { ...r.part, lenMs: Math.min(CAP_MS, performance.now() - r.t0) };
  };
  const shown = () => { const l = inFlight() || landing; return l ? parts.concat([l]) : parts; };
  const partAt = (pos) => parts.find((p) => pos >= p.startMs && pos < p.startMs + p.lenMs);
  const localOf = (p, ms) => Math.max(0, Math.min((p.lenMs ?? 0) - 40, ms - p.startMs)) / 1000;

  // Relay servers are asked for on the press, never on load. `fetchIceServers`
  // never throws: with no relay it returns STUN alone and says why.
  // See lessons/page-capture.md#capture-18
  let ice = null, iceAsks = 0, pressAt = null;
  // Measured, not counted by this tab: every request the browser made to the
  // relay route, from resource timing, and how many started before the press.
  const iceLoadAsks = () => requests((u) => /\/ice(\?|$)/.test(u), pressAt);
  let paths = { out: null, back: null };
  const routeOf = () => {
    const { out, back } = paths;
    if (!out?.path || !back?.path) return null;
    return out.path === 'relay' || back.path === 'relay' ? 'relay' : 'direct';
  };
  async function readPaths() {
    if (!pub || !sub) return;
    const [out, back] = await Promise.all([readIcePath(pub.pc), readIcePath(sub.pc)]);
    const was = routeOf();
    paths = { out, back };
    const now = routeOf();
    legVals.set('path', now || '');
    if (now && now !== was) {
      const say = (p) => (p.path === 'relay' ? `relay over ${p.relayProtocol || p.protocol}` : `direct over ${p.protocol}`);
      log(`out ${say(out)}, back ${say(back)}`, 'hi');
    }
  }

  let restored = false;
  row.on('go', async () => {
    if (pub) { log('already sending'); return; }
    pressAt ??= performance.now();
    if (useR2 && !restored) { restored = true; await restore(); }
    iceAsks++;
    ice = await fetchIceServers({ log: (m) => log(m) });
    // Graded right after the press: the one fact that needs no leg.
    // See lessons/page-capture.md#capture-19
    assert('relay servers were asked for on the press and not on load',
      iceAsks >= 1 && iceLoadAsks() === 0 && !!ice,
      `${iceAsks} ask(s) after the press, ${iceLoadAsks()} before it by resource timing, `
      + (ice.relay ? 'a relay came back' : `no relay: ${ice.why}`));
    // The round trip is a deep check (see the header).
    // See lessons/page-capture.md#capture-20
    if (SELFCHECK && !DEEP) {
      log('left for the deep run: the round trip through Cloudflare and its two takes (DEMO_DEEP=1)');
      return;
    }
    const noLegs = async (why) => {
      assert('both legs hold what the ask returned', false, why);
      assert('the path the media took is named beside the round trip', false, why);
      // red with the reason rather than missing, so the count does not move
      // with the network
      if (SELFCHECK) await roundTripChecks();
    };
    // No leg to open (see the header), so say so and stop.
    // See lessons/page-capture.md#capture-21
    log(`${RETIRED_LEG}: its input and pub's /whip are deleted, so nothing is sent`, 'bad');
    await noLegs(RETIRED_LEG);
  });

  /**
   * How far the picture travelled, on one clock: this machine burned the number
   * before it left, so `now - burned` needs no cross-machine offset.
   * See lessons/page-capture.md#capture-22
   */
  let readable = 0, unreadable = 0;
  function legSampler() {
    setInterval(() => {
      if (!live.videoWidth) return;
      const e = readBurnedFrom(live, scratch);
      if (e === null) { unreadable++; return; }
      readable++;
      const ms = Date.now() - e;
      if (ms > 0 && ms < 10000) legs.push(ms);
      if (legs.length > 200) legs = legs.slice(-200);
      legText();
    }, 200);
  }

  // ── recording the RECEIVED picture ────────────────────────────────────────
  function startRecording() {
    if (recording || !sub) { if (!sub) log('nothing to record yet. Press Send and receive', 'bad'); return null; }
    const mime = recorderMime({ log });
    if (!mime) return null;
    // THE RECEIVER'S TRACK, not the source, and VIDEO ONLY: Cloudflare refuses a
    // single-track WHEP offer, so the subscription carries a live, forever
    // silent audio track, and a MediaRecorder handed it writes NOTHING.
    const vTracks = sub.inbound.getVideoTracks();
    if (!vTracks.length) { log('no video track to record', 'bad'); return null; }
    const rec = new MediaRecorder(new MediaStream(vTracks), { mimeType: mime, videoBitsPerSecond: 900_000 });
    rec.onerror = (ev) => log(`recorder: ${ev.error?.name ?? 'error'}`, 'bad');
    const part = { n: parts.length + 1, hue: videoHue(parts.length), mime,
                   blobs: [], chunks: [], bytes: 0, startMs: totalMs, lenMs: null, video: null };
    const t0 = performance.now();
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      part.blobs.push(e.data);
      part.bytes += e.data.size;
      paint();
    };
    let landed;
    part.done = new Promise((r) => { landed = r; });
    rec.onstop = async () => {
      try {
        landing = { ...part, lenMs: Math.round(performance.now() - t0) };
        recording = null;
        setRecUI(false);
        view.strip.state.wallAnchor = null;
        deck.setRange([0, Math.round(totalMs + landing.lenMs)]);
        await wait(250);
        await landPart(part);
        landing = null;
        await runChecks();
      } finally { landed(); }
    };
    recording = { rec, part, t0 };
    rec.start(SLICE_MS);
    setRecUI(true);
    view.strip.armWall(part.startMs);
    log(`take ${part.n}: recording what came back, ${CAP_MS / 1000}s cap`, 'hi');
    recording.capTimer = setTimeout(() => {
      if (recording?.rec === rec) { log(`take ${part.n}: hit the cap`); stopRecording(); }
    }, CAP_MS);
    return part.done;
  }
  function stopRecording() {
    if (!recording) return;
    clearTimeout(recording.capTimer);
    try { recording.rec.stop(); } catch { /* already */ }
  }
  function setRecUI(on) {
    const b = recBtn;
    b.dataset.on = on ? '1' : '';
    // the kit's record and stop icons; `setIcon` writes `title` too, so the
    // cap the bar was given is put back
    const keep = b.title;
    setIcon(b, on ? 'stop' : 'record', on ? 'Stop recording' : 'Record');
    if (keep) b.title = keep;
  }

  async function landPart(part) {
    if (!part.blobs.length) { log(`take ${part.n}: nothing recorded`, 'bad'); return; }
    // In R2 mode local copies are dropped and playback is fetched back, one file per
    // take: about 900 KB for eight seconds, and slicing buys nothing.
    // See lessons/page-capture.md#capture-23
    let blob = null;
    if (useR2) {
      const whole = new Blob(part.blobs, { type: part.mime });
      const put = await putWhole(whole, { log });
      if (put) {
        part.manifest = put.url;
        part.expiresAt = put.expiresAt;
        log(`take ${part.n}: ${Math.round(whole.size / 1024)} KiB stored as one file`, 'hi');
        blob = await fetchBack(put.url, part.mime, { log });
        if (blob) {
          part.blobs.length = 0;                       // the local copy is gone
          remember({ url: put.url, mime: part.mime, expiresAt: put.expiresAt });
        } else log(`take ${part.n}: could not fetch it back, keeping the local copy`, 'bad');
      }
    }
    part.from = blob ? 'r2' : 'local';
    part.url = URL.createObjectURL(blob || new Blob(part.blobs, { type: part.mime }));
    addVideo(part);
    part.lenMs = Math.round((await resolveDuration(part.video)) ?? (performance.now()));
    if (part.startMs !== totalMs) part.startMs = totalMs;
    totalMs += part.lenMs;
    parts.push(part);
    deck.setRange([0, Math.round(totalMs)]);
    if (!active) handOver(part, 0);
    startTicking();
    paint();
    log(`take ${part.n} landed: ${(part.lenMs / 1000).toFixed(2)}s at `
      + `${(part.startMs / 1000).toFixed(2)}s, playing from ${part.from === 'r2' ? 'R2' : 'memory'}`, 'hi');
    if (part.expiresAt) {
      const mins = Math.round((new Date(part.expiresAt) - Date.now()) / 60000);
      log(`this recording is deleted in ${Math.floor(mins / 60)}h ${mins % 60}m. Six hours is the cap, `
        + 'and a cron enforces it', 'hi');
    }
  }

  function addVideo(part) {
    const v = el('video', '', null, { playsinline: '', muted: '' });
    v.muted = true; v.hidden = true;
    // armed BEFORE the source: with no src, play() rejects and the activation is
    // consumed without starting anything (media-master L1, see TAKES)
    armVideo(v);
    v.autoplay = false;
    v.src = part.url;
    seq.append(v);
    part.video = v;
    v.addEventListener('seeked', () => {
      if (queuedSeek && queuedSeek.p === part) {
        const q = queuedSeek; queuedSeek = null;
        part.video.currentTime = q.want;
      }
    });
  }

  // ── one picture under the playhead at a time ──────────────────────────────
  const mm = mediaMaster(deck, () => {
    const p = active;
    if (!p || !p.video) return null;
    return { el: p.video, pos: p.startMs + p.video.currentTime * 1000, key: `take${p.n}` };
  }, {
    autoPlayPause: false,
    onEvent: (e) => log(`clock: ${e.reason}${e.key ? `, ${e.key}` : ''}`),
  });
  let rafOn = false, handovers = [];
  const startTicking = () => {
    if (!rafOn) { rafOn = true; (function loop() { requestAnimationFrame(loop); tick(); })(); }
  };
  function handOver(p, pos) {
    const from = active;
    if (from && from.video) { from.video.pause(); from.video.hidden = true; }
    active = p;
    p.video.hidden = false;
    live.hidden = true;
    const want = localOf(p, pos);
    if (Math.abs(p.video.currentTime - want) > 0.08) p.video.currentTime = want;
    mm.release('handover');
    handovers.push(`${from ? from.n : 'none'} to ${p.n} at ${Math.round(pos)}`);
  }
  // Every seek is a command to the element; without this mirror the clock check
  // reads the same frame twice.
  // See lessons/page-capture.md#capture-24
  let inServo = false, queuedSeek = null;
  deck.transport.onState((st) => {
    if (st.reason !== 'seek' || inServo || !parts.length) return;
    const pos = st.p0;
    const p = partAt(pos);
    if (!p) return;
    if (p !== active) handOver(p, pos);
    const want = localOf(p, pos);
    if (p.video.seeking) { queuedSeek = { p, want }; return; }
    queuedSeek = null;
    p.video.currentTime = want;
  });

  function tick() {
    if (!parts.length) return;
    const playing = deck.playing();
    let pos = deck.position();
    if (active && active.video.ended) {
      const next = parts[parts.indexOf(active) + 1];
      if (next) pos = next.startMs;
      else if (playing) { deck.pause(); log('the line ran out'); }
    }
    const want = partAt(pos);
    if (want && want !== active) handOver(want, pos);
    if (active && active.video) {
      if (playing && active.video.paused && !active.video.ended) active.video.play().catch(() => {});
      if (!playing && !active.video.paused) active.video.pause();
    }
    inServo = true;
    try { mm.tick(); } finally { inServo = false; }
  }

  // ── the picture of the line ───────────────────────────────────────────────
  const takeLane = {
    id: 'parts', kind: 'part', label: 'takes', height: 52, barPad: 8,
    as: 'spans', stack: false, barGap: 3, terse: true, alpha: 0.9, spanLine: false,
    colorOf: (sp) => ink(sp.row?.payload?.hue ?? 210, 62, 68),
    labelOf: (sp, { bw }) => {
      const p = sp.row?.payload || {};
      return bw > 110 ? `take ${p.n}, ${(p.lenMs / 1000).toFixed(2)}s` : `${p.n}`;
    },
    rows: () => shown().map((p) => ({
      at: p.startMs, id: `take${p.n}`, kind: 'part',
      payload: { durMs: p.lenMs, n: p.n, hue: p.hue, lenMs: p.lenMs, kib: Math.round(p.bytes / 1024) },
    })),
    describeRow: (r) => [`${r.payload.kib} KiB`, `${(r.payload.lenMs / 1000).toFixed(2)}s of the line`],
  };

  const tl = panel.stack().el;
  // Not published: the drill gets this api through `bars`. The strip below is the position surface.
  const control = createTransportControl(deck);
  const recBtn = barButton({ icon: 'record', aria: 'Record', primary: true,
    title: `stop when you like. ${CAP_MS / 1000}s cap`,
    onPress: () => {
      if (checking) { log('the checks are recording, this press waits for them'); return; }
      return recording ? stopRecording() : startRecording();
    } });
  const loop = loopView(control);
  const tb = createBar({ start: [playToggle(control).el, recBtn], middle: [clockView(control).el, noteView(control).el],
    end: [loop.el, ratesView(control).el] });
  tl.append(tb.el);
  bindTransportKeys(control, { scope: tb.el });
  const bar = transportApi(control, { el: tb.el, loopView: loop });
  setRecUI(false);
  const view = createStripView(tl, deck, {
    size: 'auto', follow: false, gutter: 150, wallStyle: 'head',
    lanes: [takeLane],
  });
  const stripCanvas = tl.querySelector('canvas.pos-strip');

  function paint() { view.strip.invalidate(); }
  setInterval(() => { if (recording) paint(); }, 40);

  // ── the checks ────────────────────────────────────────────────────────────
  let asserted = false, didClock = false, checking = false;

  /**
   * Every round trip check from one place, under SELFCHECK: records two short takes.
   * Each assert is made exactly once, red with the reason when nothing arrived.
   * Waits up to 20 s for a readable frame, since WHEP ramps up from 640x360.
   * See lessons/page-capture.md#capture-25
   */
  async function roundTripChecks() {
    if (checking) return;
    checking = true;
    try {
      if (sub && live.videoWidth && sub.inbound.getVideoTracks().length) {
        for (let i = 0; i < 80 && readable === 0; i++) await wait(250);
        log(`checks: recording two takes, ${readable} clean frame(s) read so far`);
        for (const ms of [3000, 2500]) {
          const done = startRecording();
          if (!done) break;
          await wait(ms);
          stopRecording();
          await Promise.race([done, wait(15000)]);
        }
      }
      if (!asserted) await runChecks();
      if (!didClock) { didClock = true; await clockChecks(); }
    } finally { checking = false; }
  }

  async function runChecks() {
    if (!asserted) {
      asserted = true;
      assert('the picture went out and came back', !!pub && !!sub && live.videoWidth > 0,
        live.videoWidth ? `${live.videoWidth}x${live.videoHeight}` : 'no frame');
      assert('what was recorded is the RECEIVED track, not the source',
        !!recording || parts.length > 0
          ? sub.pc.getReceivers().some((r) => r.track && sub.inbound.getTracks().includes(r.track))
          : false,
        'by object identity against getReceivers()');
      assert('the round trip is a real number, not a guess', legs.length > 0 && median(legs) > 0,
        legs.length ? `${Math.round(median(legs))} ms, n=${legs.length}` : 'nothing read');
      // The row needs full resolution: WHEP ramps 640x360, 960x540, 1280x720 over
      // the first half-minute, and the row is drawn on a 1280 grid.
      // See lessons/page-capture.md#capture-26
      assert('the clock survived the round trip', readable > 0,
        `${readable} clean of ${readable + unreadable} read, now ${live.videoWidth}x${live.videoHeight}`);
      assert('the format was negotiated, not assumed', !!parts[0]?.mime, parts[0]?.mime || 'none');
      assert('the take is seekable: a finite range, not Infinity',
        Number.isFinite(deck.durationMs) && deck.durationMs > 0, `${deck.durationMs} ms`);
      // TWO SLOTS, ALWAYS, saying which mode they graded.
      const p0 = parts[0];
      assert('the upload leg did what the mode asked',
        useR2 ? !!p0?.manifest : !p0?.manifest,
        useR2 ? `R2: ${p0?.manifest ? 'stored' : 'NOT stored'}` : 'off (add ?r2=1)');
      assert('playback comes from where the mode says',
        useR2 ? (p0?.from === 'r2' && p0.blobs.length === 0) : p0?.from === 'local',
        `${p0?.from ?? 'none'}${useR2 ? `, ${p0?.blobs.length ?? '?'} local copies kept` : ''}`);
    }
    if (parts.length >= 2 && !didClock) { didClock = true; await clockChecks(); }
    else if (parts.length < 2) {
      log(`${parts.length} take on the line. The clock check needs a second one, so press record again.`);
    }
  }

  /**
   * Seek to two positions inside one take, read the burned clock at each, and
   * assert it advanced as much as the playhead. Across two takes it would measure
   * the pause between them, which the line drops and the pixels keep.
   * See lessons/page-capture.md#capture-27
   */
  async function clockChecks() {
    if (parts.length < 2) {
      const why = `${parts.length} take(s) landed, the clock check needs two`;
      assert('takes are laid end to end: no gap, no overlap', false, why);
      assert('exactly one take is under the playhead', false, why);
      assert('the clock in the picture moved with the playhead', false, why);
      return;
    }
    assert('takes are laid end to end: no gap, no overlap',
      parts.every((p, i) => (i === 0 ? p.startMs === 0 : p.startMs === parts[i - 1].startMs + parts[i - 1].lenMs)),
      parts.map((p) => `${p.n}@${p.startMs}+${p.lenMs}`).join(' '));
    assert('exactly one take is under the playhead',
      parts.filter((p) => deck.position() >= p.startMs && deck.position() < p.startMs + p.lenMs).length === 1,
      `at ${Math.round(deck.position())} ms`);

    // Everything below drives the playhead, so it waits for a harness.
    // See lessons/page-capture.md#capture-28
    await ifSelfcheck(async () => {
      const readAt = async (pos) => {
        deck.seek(pos);
        await wait(700);
        const p = partAt(pos);
        return p ? readBurnedFrom(p.video, scratch) : null;
      };
      const long = parts.reduce((a, b) => (b.lenMs > a.lenMs ? b : a));
      const p1 = Math.round(long.startMs + long.lenMs * 0.2);
      const p2 = Math.round(long.startMs + long.lenMs * 0.75);
      const e1 = await readAt(p1), e2 = await readAt(p2);
      if (e1 === null || e2 === null) {
        assert('the clock in the picture moved with the playhead', false,
          `could not read the row back at ${e1 === null ? p1 : p2} ms`);
        return;
      }
      const err = (e2 - e1) - (p2 - p1);
      assert('the clock in the picture moved with the playhead',
        Math.abs(err) <= FRAME_MS * 3,
        `playhead +${p2 - p1} ms, picture +${e2 - e1} ms, ${err >= 0 ? '+' : ''}${Math.round(err)} ms apart`);
      // The gap the line dropped is still in the pixels. Reported, not asserted: it
      // depends on how long a person waited.
      // See lessons/page-capture.md#capture-29
      const endOf1 = await readAt(Math.round(parts[0].startMs + parts[0].lenMs - 200));
      const startOf2 = await readAt(Math.round(parts[1].startMs + 120));
      if (endOf1 !== null && startOf2 !== null) {
        log(`the pause between take 1 and take 2 was ${((startOf2 - endOf1) / 1000).toFixed(2)}s. `
          + 'The line does not show it, the pixels still do', 'hi');
      }
    }, { log, say: 'the clock check sends the line to four places to read a frame at each, '
      + 'so it is left to the harness. Drag the bar and watch the number in the picture move with it' });
  }

  // ── pick up where the last visit left off, on the press ───────────────────
  async function restore() {
    const saved = remembered();
    if (!saved.length) return;
    // a note THIS BROWSER made to itself, not an index: another device sees none
    log(`${saved.length} recording${saved.length > 1 ? 's' : ''} still in R2, fetching them back. `
      + 'This list is a note this browser made; another device would see none of them', 'hi');
    for (const t of saved) {
      const blob = await fetchBack(t.url, t.mime, { log });
      if (!blob) continue;
      const part = { n: parts.length + 1, hue: videoHue(parts.length), mime: t.mime,
                     blobs: [], chunks: [], bytes: blob.size, startMs: totalMs,
                     lenMs: null, video: null, manifest: t.url, expiresAt: t.expiresAt, from: 'r2' };
      part.url = URL.createObjectURL(blob);
      addVideo(part);
      part.lenMs = Math.round((await resolveDuration(part.video)) ?? 0);
      if (!part.lenMs) continue;
      part.startMs = totalMs; totalMs += part.lenMs;
      parts.push(part);
      deck.setRange([0, Math.round(totalMs)]);
      if (!active) handOver(part, 0);
      startTicking();
      const mins = Math.round((new Date(t.expiresAt) - Date.now()) / 60000);
      log(`take ${part.n} back from R2, ${(part.lenMs / 1000).toFixed(2)}s, `
        + `${Math.floor(mins / 60)}h ${mins % 60}m left`, 'hi');
    }
    paint();
  }
  if (useR2 && remembered().length) {
    log(`${remembered().length} take(s) of yours are still in R2 and come back when you press Send and receive`, 'hi');
  }

  return {
    get bars() { return [{ name: 'round trip', bar, strip: stripCanvas }]; },
    /**
     * Presses Send and receive. An ordinary run grades the relay ask and stops.
     * See lessons/page-capture.md#capture-30
     */
    async check({ A }) {
      A('building this tab opened nothing: no relay ask, no leg, no camera',
        iceAsks === 0 && iceLoadAsks() === 0 && !pub && !sub && !source.cameraOn(),
        `${iceLoadAsks()} relay ask(s) before a press, legs ${pub || sub ? 'UP' : 'down'}`);
      await row.press('go');
    },
  };
}
