// TAKES: record, then record again. Each take lands on the line after the one
// before, and the whole line plays and scrubs as one. The tab's `check` records
// two short takes itself, so every sequence check runs.
// See lessons/page-capture.md#capture-37

import { recorderMime, el, armVideo } from '/shell/shell.mjs';
import { createBar, barButton } from '/shell/bar.mjs';
import { createTransportControl, transportApi, publishTransport } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { setIcon } from '/shell/icon-button.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { mediaMaster } from '/timeline/media-master.mjs';
import { videoHue } from '/shell/pattern.mjs';
import { ifSelfcheck } from '/shell/selfcheck.mjs';
import { createButtonRow, createSource, resolveDuration, wait } from './common.mjs';

const CAP_MS   = 10_000;   // a backstop, not the mechanism: stop is manual
const SLICE_MS = 500;      // the timeslice we ask MediaRecorder for
const FPS      = 25;

// No readout: see the header.
// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = 'Record the moving clock in several takes, each placed after the last on one line that plays and scrubs as a single recording. Press the red button on the bar to record a take.';

export const readout = null;

export function build({ panel, assert, log }) {
  const ink = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;
  const hueOf = (i) => videoHue(i);

  // Declared above the source, whose first frame is drawn during build and
  // reads them: a `let` further down would be in its dead zone at that moment.
  const parts = [];
  let recording = null, landing = null, totalMs = 0;
  let previewT0 = performance.now();

  // While recording the burned number is the position on the line, so 6.5 s reads
  // 6.5 off the picture. Otherwise it is the wall clock, the frame not being on it.
  // See lessons/page-capture.md#capture-38
  const source = createSource({
    opts: () => {
      const rec = recording;
      const hue = rec ? rec.part.hue : hueOf(parts.length);
      if (!rec) return { hue };
      const line = rec.part.startMs + (performance.now() - rec.t0);
      return { hue, position: line / 1000 };
    },
    alive: () => !!recording,
  });

  const stage = el('div', 'cap-pair');
  const srcFig = el('figure');
  srcFig.append(source.canvas, el('figcaption', 'pos-cap', 'source'));
  const seqFig = el('figure');
  // ONE VIEWPORT for the whole sequence: parts laid end to end mean exactly one
  // is live at a time, so a gallery of N pictures would draw a claim the
  // timeline does not make.
  const seq = el('div', 'cap-seq');
  const seqCap = el('figcaption', 'pos-cap', 'playback');
  seqFig.append(seq, seqCap);
  stage.append(srcFig, seqFig);

  const row = createButtonRow([{ id: 'camera', label: 'Use the camera' }], log);
  row.on('camera', async (b) => {
    if (await source.camera(log)) { b.disabled = true; b.textContent = 'Camera on'; }
  });

  // ── the line ─────────────────────────────────────────────────────────────
  // ONE DECK for the tab's life: the bar and the strip bind theirs at
  // construction. `setRange` grows as takes are appended.
  const deck = createDeck({ items: [], adapters: {}, range: [0, CAP_MS] });
  let active = null;
  const handovers = [];

  const partAt = (ms) => {
    for (let i = parts.length - 1; i >= 0; i--) if (ms >= parts[i].startMs) return parts[i];
    return parts[0] || null;
  };
  const localOf = (p, ms) => Math.max(0, Math.min((p.lenMs ?? 0) - 40, ms - p.startMs)) / 1000;

  // Laid end to end, EXACTLY ONE part is under the playhead, so the part being
  // played is the master and media-master's L1 holds unchanged.
  const mm = mediaMaster(deck, () => {
    const p = active;
    if (!p || !p.video) return null;
    return { el: p.video, pos: p.startMs + p.video.currentTime * 1000, key: `take${p.n}` };
  }, {
    autoPlayPause: false,            // a part ENDING is a handover here, not a stop
    onEvent: (e) => log(`clock: ${e.reason}${e.key ? `, ${e.key}` : ''}`),
  });

  function handOver(p, pos, why) {
    const from = active;
    if (from && from.video) { from.video.pause(); from.video.hidden = true; }
    active = p;
    if (!p) { seqCap.textContent = 'playback'; return; }
    p.video.hidden = false;
    const want = localOf(p, pos);
    if (Math.abs(p.video.currentTime - want) > 0.08) p.video.currentTime = want;
    seqCap.textContent = `playback, take ${p.n}`;
    if (from !== p) handovers.push({ at: pos, from: from ? from.n : null, to: p.n, why });
    mm.release('handover');
  }

  // Every seek is a command to the element, or the media master pulls the vector
  // back. One seek in flight, latest wins: a drag fires one per pointermove.
  // See lessons/page-capture.md#capture-39
  const seeks = [];
  let pendingSeek = null, inServo = false, queuedSeek = null;
  deck.transport.onState((st) => {
    if (st.reason !== 'seek' || inServo || !parts.length) return;
    const pos = st.p0;
    const p = partAt(pos);
    if (!p) return;
    if (p !== active) handOver(p, pos, 'seek');
    pendingSeek = pos;
    const want = localOf(p, pos);
    if (p.video.seeking) { queuedSeek = { p, want }; return; }
    queuedSeek = null;
    p.video.currentTime = want;
  });

  function onSeeked(p) {
    if (pendingSeek === null || p !== active) return;
    const got = p.startMs + p.video.currentTime * 1000;
    seeks.push({ asked: pendingSeek, got, offMs: got - pendingSeek, part: p.n });
    pendingSeek = null;
    if (queuedSeek && queuedSeek.p === p) {
      const q = queuedSeek; queuedSeek = null;
      p.video.currentTime = q.want;
    }
    paint();
  }

  let rafOn = false;
  function tick() {
    if (!parts.length) return;
    const playing = deck.playing();
    let pos = deck.position();
    // A part running out is a handover, resolved before the servo reads an ended
    // element as the clock, or the playhead pins to the boundary.
    // See lessons/page-capture.md#capture-40
    if (active && active.video.ended) {
      const next = parts[parts.indexOf(active) + 1];
      if (next) pos = next.startMs;
      else if (playing) { deck.pause(); log('the line ran out'); }
    }
    const want = partAt(pos);
    if (want && want !== active) handOver(want, pos, 'boundary');
    if (active && active.video) {
      if (playing && active.video.paused && !active.video.ended) active.video.play().catch(() => {});
      if (!playing && !active.video.paused) active.video.pause();
    }
    inServo = true;
    try { mm.tick(); } finally { inServo = false; }
  }

  // ── recording ────────────────────────────────────────────────────────────
  // Every chunk is stamped when it ARRIVES, the only instant this API offers.
  // MediaRecorder publishes no per-chunk capture timestamp.
  function startRecording(capMs = CAP_MS) {
    if (recording) { log('already recording'); return null; }
    const mime = recorderMime({ log });
    if (!mime) return null;
    const stream = source.canvas.captureStream(FPS);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 900_000 });
    const part = {
      n: parts.length + 1, hue: hueOf(parts.length), mime,
      chunks: [], blobs: [], bytes: 0, recordedMs: null, fileMs: null,
      // KNOWN NOW: a take is appended, so it starts where the line ends.
      startMs: totalMs, lenMs: null, video: null, capMs,
    };
    let landed;
    part.done = new Promise((r) => { landed = r; });
    const t0 = performance.now();
    let lastAt = 0;
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const at = performance.now() - t0;
      part.chunks.push({ at, size: e.data.size, gapMs: part.chunks.length ? at - lastAt : at });
      lastAt = at;
      part.blobs.push(e.data);
      part.bytes += e.data.size;
      paint();
    };
    rec.onerror = (ev) => log(`recorder: ${ev.error?.name ?? 'error'}`, 'bad');
    rec.onstop = async () => {
      try {
        part.recordedMs = performance.now() - t0;
        landing = { ...part, lenMs: Math.round(part.recordedMs) };
        recording = null;
        // Shrink the axis once, here: collapsing the runway later moves every mark.
        // See lessons/page-capture.md#capture-41
        deck.setRange([0, Math.round(totalMs + landing.lenMs)]);
        previewT0 = performance.now();
        setRecUI(false);
        for (const t of stream.getTracks()) t.stop();
        await wait(250);                                  // let the last chunk land
        await landPart(part);
        landing = null;
        await runChecks();
      } finally { landed(); }
    };

    recording = { rec, part, t0 };
    rec.start(SLICE_MS);
    // A RUNWAY: the axis opens to the full cap and the take grows into it.
    deck.setRange([0, Math.round(totalMs + capMs)]);
    // A head that moves with the recording is the strip's wall cursor, not the
    // playhead: seeking the deck every frame would corrupt the seek measurement.
    // See lessons/page-capture.md#capture-42
    view.strip.armWall(part.startMs);
    setRecUI(true);
    log(`take ${part.n}: recording ${mime}, ${SLICE_MS} ms slices, stop when you like, ${capMs / 1000}s cap`, 'hi');
    recording.capTimer = setTimeout(() => {
      if (recording?.rec === rec) { log(`take ${part.n}: hit the ${capMs / 1000}s cap`); stopRecording(); }
    }, capMs);
    return part.done;
  }

  function stopRecording() {
    if (!recording) return;
    view.strip.state.wallAnchor = null;
    view.strip.invalidate();
    clearTimeout(recording.capTimer);
    try { recording.rec.stop(); } catch { /* already stopped */ }
  }

  function setRecUI(on) {
    const b = recBtn;
    // the record icon to start, the stop icon to stop, on the same square as
    // the play button beside them. `setIcon` writes `title` as well, so the
    // cap the bar was given is put back.
    if (b) {
      b.dataset.on = on ? '1' : '';
      const keep = b.title;
      setIcon(b, on ? 'stop' : 'record', on ? 'Stop recording' : 'Record');
      if (keep) b.title = keep;
    }
  }

  /** a landed take becomes a PART, appended where the last one finished */
  async function landPart(part) {
    if (!part.blobs.length) { log(`take ${part.n}: nothing recorded`, 'bad'); return; }
    part.url = URL.createObjectURL(new Blob(part.blobs, { type: part.mime }));
    const v = el('video', '', null, { playsinline: '', muted: '' });
    v.muted = true; v.hidden = true;
    // Arm before the source: with no `src`, `play()` rejects and consumes the
    // activation. Arming after `src` lets the paused deck creep and snap back.
    // See lessons/page-capture.md#capture-43
    armVideo(v);
    v.autoplay = false;
    v.src = part.url;
    seq.append(v);
    part.video = v;
    v.pause();
    v.addEventListener('seeked', () => onSeeked(part));

    part.fileMs = await resolveDuration(v);
    part.lenMs = Math.round(part.fileMs ?? part.recordedMs);
    // END TO END, checked rather than assumed: if the line moved under it, the
    // burned numbers in the frames are lying.
    if (part.startMs !== totalMs) {
      log(`take ${part.n}: the line moved under it (${part.startMs} vs ${totalMs}), burned positions are stale`, 'bad');
      part.startMs = totalMs;
    }
    totalMs += part.lenMs;
    parts.push(part);
    deck.setRange([0, Math.round(totalMs)]);
    if (!active) handOver(part, 0, 'first');
    if (!rafOn) { rafOn = true; (function loop() { requestAnimationFrame(loop); tick(); })(); }
    paint();
    log(`take ${part.n} landed: ${(part.lenMs / 1000).toFixed(2)}s at `
      + `${(part.startMs / 1000).toFixed(2)}s, ${Math.round(part.bytes / 1024)} KiB`
      + (part.fileMs === null ? ', the file would not say its length' : ''), 'hi');
  }

  // ── the strip ────────────────────────────────────────────────────────────
  const NOT_YET = '#3b424e';
  const BANDS = [[1, '#8fd6a8'], [2, '#ffd400'], [Infinity, '#e0908a']];
  const bandFor = (ms) => BANDS.find(([lim]) => Math.abs(ms) / SLICE_MS < lim)[1];
  const median = (xs) => {
    if (!xs.length) return null;
    const a = [...xs].sort((p, q) => p - q);
    return a[a.length >> 1];
  };

  // The take in flight is already on the line. `parts` holds landed takes only,
  // because every assert reads it; this is a view for the strip.
  // See lessons/page-capture.md#capture-44
  const inFlight = () => {
    const r = recording;
    if (!r) return null;
    return { ...r.part, lenMs: Math.min(r.part.capMs, performance.now() - r.t0), live: true };
  };
  const shown = () => { const l = inFlight() || landing; return l ? parts.concat([l]) : parts; };

  const partLane = {
    id: 'parts', kind: 'part', label: 'takes', height: 52, barPad: 8,
    spanLine: false,
    as: 'spans', stack: false, barGap: 3, terse: true, alpha: 0.9,
    colorOf: (s) => ink(s.row?.payload?.hue ?? 210, 62, 68),
    labelOf: (s, { bw }) => {
      const p = s.row?.payload || {};
      return bw > 128 ? `take ${p.n}, ${(p.lenMs / 1000).toFixed(2)}s`
        : bw > 66 ? `take ${p.n}, ${(p.lenMs / 1000).toFixed(1)}s` : `${p.n}`;
    },
    rows: () => shown().map((p) => ({
      at: p.startMs, id: `take${p.n}`, kind: 'part',
      payload: { durMs: p.lenMs, n: p.n, hue: p.hue, lenMs: p.lenMs, kib: Math.round(p.bytes / 1024) },
    })),
    describeRow: (r) => [`${r.payload.kib} KiB`, `${(r.payload.lenMs / 1000).toFixed(2)}s of the line`],
  };

  const chunkLane = {
    id: 'chunks', kind: 'chunk', label: 'slices', height: 40, width: 2,
    as: 'ticks', color: NOT_YET, terse: true,
    // colour means HOW IT LANDED against the timeslice asked for, never which
    // take it came from: that is the part lane's job.
    rows: () => shown().flatMap((p) => p.chunks.map((c, i) => ({
      at: p.startMs + c.at, id: `p${p.n}c${i}`, kind: 'chunk', payload: { n: p.n, ...c },
    }))),
    colorOfRow: (r) => bandFor(r.payload.gapMs - SLICE_MS),
    describeRow: (r) => {
      const p = r.payload, off = p.gapMs - SLICE_MS;
      return [`take ${p.n}, ${Math.round(p.size / 1024)} KiB`,
              `${off >= 0 ? '+' : ''}${off.toFixed(0)} ms off the ${SLICE_MS} ms slice`];
    },
  };

  // The PUBLISHED bar of `/capture/`: the harness drills this one itself.
  panel.add(stage, row.el);
  const barHost = panel.stack().el;
  // No scrub: the strip is the only position surface in this tab. Recording is a transport verb here.
  const control = createTransportControl(deck);
  const recBtn = barButton({ icon: 'record', aria: 'Record', primary: true,
    title: `stop when you like, ${CAP_MS / 1000}s cap`,
    onPress: () => (recording ? stopRecording() : startRecording(CAP_MS)) });
  const loop = loopView(control);
  const tb = createBar({ start: [playToggle(control).el, recBtn], middle: [clockView(control).el, noteView(control).el],
    end: [loop.el, ratesView(control).el] });
  barHost.append(tb.el);
  bindTransportKeys(control, { scope: tb.el });
  const bar = transportApi(control, { el: tb.el, loopView: loop });
  publishTransport(bar);
  setRecUI(false);
  const view = createStripView(barHost, deck, {
    size: 'auto', follow: false, gutter: 150, wallStyle: 'head',
    lanes: [partLane, chunkLane],
  });

  function paint() {
    // A gutter carries what its lane measured, counting what the lane draws,
    // in-flight take included; with nothing measured it carries nothing.
    // See lessons/page-capture.md#capture-45
    const L = view.strip.lanes();
    const sh = shown();
    const C = L.find((l) => l.id === 'chunks');
    const offs = sh.flatMap((p) => p.chunks.slice(1).map((x) => Math.abs(x.gapMs - SLICE_MS)));
    if (C) C.subLabel = offs.length
      ? [`${offs.length + sh.length} slices, ${median(offs).toFixed(0)} ms typ`,
         `worst ${Math.max(...offs).toFixed(0)} ms off ${SLICE_MS}`]
      : null;
    view.strip.invalidate();
  }
  setInterval(() => {
    if (recording) paint();
    else if (!barHost.closest('[hidden]')) paint();
  }, 250);

  // ── the checks ───────────────────────────────────────────────────────────
  // They run when a take lands, and they assert the MECHANISM.
  let didRecording = false, didSequence = false;

  function seekAndWait(ms) {
    return new Promise((res) => {
      const before = seeks.length;
      deck.seek(ms);
      let i = 0;
      const iv = setInterval(() => {
        if (seeks.length > before || ++i > 40) { clearInterval(iv); res(seeks[seeks.length - 1] || null); }
      }, 100);
    });
  }

  async function runChecks() {
    if (!parts.length) return;
    const p1 = parts[0];

    if (!didRecording) {
      didRecording = true;
      assert('the mime was negotiated, not assumed',
        typeof p1.mime === 'string' && /^video\//.test(p1.mime), String(p1.mime));
      assert('chunks arrived with sizes',
        p1.chunks.length > 0 && p1.chunks.every((c) => c.size > 0),
        `${p1.chunks.length} chunks, ${Math.round(p1.bytes / 1024)} KiB`);
      assert('every chunk is stamped on arrival',
        p1.chunks.every((c) => Number.isFinite(c.at) && Number.isFinite(c.gapMs)),
        `first at ${p1.chunks[0] ? Math.round(p1.chunks[0].at) : 'none'} ms`);
      assert('the take is seekable: a finite range, not Infinity',
        Number.isFinite(deck.durationMs) && deck.durationMs > 0, `${deck.durationMs} ms`);
      assert('the recorded length and the file length are both known',
        Number.isFinite(p1.recordedMs) && (p1.fileMs === null || Number.isFinite(p1.fileMs)),
        p1.fileMs === null
          ? `recorded ${Math.round(p1.recordedMs)} ms, the file would not say`
          : `recorded ${Math.round(p1.recordedMs)} ms, file ${Math.round(p1.fileMs)} ms, `
            + `${Math.round(p1.fileMs - p1.recordedMs)} ms apart`);
      assert('the cap is a backstop, not the mechanism',
        Number.isFinite(p1.recordedMs) && p1.recordedMs <= p1.capMs + 1500,
        `${Math.round(p1.recordedMs)} ms against a ${p1.capMs} ms cap`);
    }

    // The sequence asserts need two parts; a vacuous pass on one hides a missing
    // subject, so they wait and the log says so.
    // See lessons/page-capture.md#capture-46
    if (parts.length < 2) {
      log(`${parts.length} take on the line. The eight sequence checks (end to end, `
        + 'boundary handover, one clock) need a second one. Press record again.', 'hi');
    }
    if (parts.length < 2 || didSequence) { paint(); return; }
    didSequence = true;

    assert('parts are laid end to end: no gap, no overlap',
      parts.every((p, i) => (i === 0 ? p.startMs === 0 : p.startMs === parts[i - 1].startMs + parts[i - 1].lenMs)),
      parts.map((p) => `${p.n}@${p.startMs}+${p.lenMs}`).join(' '));
    assert('the line is as long as the takes put together',
      deck.durationMs === parts.reduce((a, p) => a + p.lenMs, 0),
      `${deck.durationMs} ms`);

    // The six below seek this tab's own transport twice, so they wait for a harness
    // rather than jump the playhead in front of somebody who just stopped recording.
    // See lessons/page-capture.md#capture-47
    await ifSelfcheck(async () => {
      const b = parts[1].startMs;
      await seekAndWait(Math.max(0, b - 400));
      const inFirst = active;
      const after = await seekAndWait(b + 400);
      const inSecond = active;

      assert('crossing a boundary hands the picture over',
        inFirst === parts[0] && inSecond === parts[1],
        `${b - 400} ms to take ${inFirst ? inFirst.n : 'none'}, ${b + 400} ms to take ${inSecond ? inSecond.n : 'none'}`);
      assert('exactly one part is under the playhead',
        parts.filter((p) => deck.position() >= p.startMs && deck.position() < p.startMs + p.lenMs).length === 1,
        `at ${Math.round(deck.position())} ms`);
      assert('the part under the playhead is the one driving the clock',
        mm.key() === `take${inSecond ? inSecond.n : '?'}` && mm.driving(),
        `${mm.key()}, driving ${mm.driving()}`);
      assert('the new part plays its OWN time, not the line\'s',
        Math.abs(parts[1].video.currentTime * 1000 - 400) < 300,
        `${Math.round(parts[1].video.currentTime * 1000)} ms into take 2, `
          + `which sits at ${Math.round(b)} ms on the line`);
      assert('a seek reports what it actually got, not what it asked for',
        !!after && Number.isFinite(after.got),
        after ? `asked ${Math.round(after.asked)} ms, got ${Math.round(after.got)} ms, `
                + `${Math.round(after.offMs)} ms apart` : 'no seeked event');
      assert('the handover was recorded, not inferred',
        handovers.some((h) => h.from === 1 && h.to === 2),
        handovers.map((h) => `${h.from ?? 'none'} to ${h.to} at ${Math.round(h.at)}`).join(', '));
    }, { log, say: 'the six boundary checks jump the playhead across the join, so they are '
      + 'left to the harness. Drag the line over it yourself and watch the picture hand over' });
    paint();
  }

  log(`${CAP_MS / 1000}s cap per take, press the record button on the bar`, 'hi');

  return {
    bar,
    /**
     * Two short takes, pressed through the bar's own record button, so every check
     * above runs. The first assert: building the tab asked for nothing.
     * See lessons/page-capture.md#capture-48
     */
    async check({ A }) {
      A('building this tab opened nothing: no camera, no recording',
        !source.cameraOn() && !recording && parts.length === 0,
        `camera ${source.cameraOn() ? 'ON' : 'off'}, ${parts.length} take(s) before any press`);
      const rec = recBtn;
      for (const ms of [1600, 1300]) {
        if (!rec) break;
        rec.click();
        const part = recording?.part;
        await wait(ms);
        rec.click();
        if (part) await Promise.race([part.done, wait(12000)]);
      }
      if (!didRecording) {
        A('the mime was negotiated, not assumed', false, 'no take landed, so none of the recording checks ran');
      }
    },
  };
}
