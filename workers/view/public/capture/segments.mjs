// SEGMENTS: MediaRecorder in 2 s segments over a fixed 6 s show. A closed segment
// is held until handed off (a PUT to ingest with `?r2=1`, a 300 ms stand-in
// without), then dropped. Playback assembles from the far side.
// See lessons/page-capture.md#capture-31

import { recorderMime, el, armVideo, playOrPrompt, createShipper } from '/shell/shell.mjs';
import { hueFor } from '/shell/pattern.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi } from '/shell/transport-control.mjs';
import { playToggle, clockView, scrubView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { mediaMaster } from '/timeline/media-master.mjs';
import { SELFCHECK } from '/shell/selfcheck.mjs';
import { createButtonRow, createSource, resolveDuration, requests, slot, wait } from './common.mjs';

const INGEST = 'https://ingest.positron.studio';
const SEG_MS = 2000;
const SHOW_MS = 6200;      // three segments, a fixed short show
const STAND_IN_MS = 300;   // the stood-in hand-off, `record`'s number

// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = `A short show recorded in ${SEG_MS / 1000} second pieces, each sent off as soon as it closes, so what this page holds never grows. Press Record, then Play it back.`;

export const readout = { segments: '', holding: 'KiB', 'most held': 'KiB', sent: 'KiB', 'sent to': '', length: 's' };

export function build({ panel, assert, log, set }) {
  // The R2 leg is OPT-IN. The ingest caps are real (5 sessions per address per
  // hour), so an always-on upload would exhaust the quota under the suite and
  // then fail it on a 429.
  const useR2 = new URLSearchParams(location.search).get('r2') === '1';
  const ship = createShipper();

  let recording = false;
  const source = createSource({ opts: () => ({ hue: hueFor('capture') }), alive: () => recording });
  source.canvas.className = 'cap-src';
  const video = el('video', 'cap-back', null, { playsinline: '', muted: '', controls: '' });
  video.muted = true;
  video.hidden = true;
  const segsEl = el('div', 'cap-segs');
  segsEl.hidden = true;                        // until there is a segment in it

  const row = createButtonRow([
    { id: 'rec', label: 'Record 6 seconds', primary: true },
    { id: 'camera', label: 'Use the camera' },
    { id: 'play', label: 'Play it back' },
  ], log);
  const barSlot = slot();
  panel.add(source.canvas, video, segsEl, row.el, barSlot);

  // ── what is held, what was handed off ────────────────────────────────────
  // Counts drive the asserts (a bound of two segments is the claim); bytes
  // drive the readout, because the counts cannot move and the bytes can.
  let session = null, mime = null, manifestUrl = null, pressedAt = null;
  let closed = 0, held = 0, peak = 0, heldBytes = 0, peakBytes = 0, sentBytes = 0, recordedBytes = 0;
  const segs = [];                 // { n, blob, bytes, shipped }
  const pile = [];                 // the stood-in far side, without ?r2=1

  function paint() {
    // Blank, never 0, before anything has happened: a zero reads as a very
    // confident measurement of nothing.
    set('segments', closed || '');
    set('holding', closed ? Math.round(heldBytes / 1024) : '');
    set('most held', peakBytes ? Math.round(peakBytes / 1024) : '', peak <= 2 ? 'ok' : 'bad');
    set('sent', sentBytes ? Math.round(sentBytes / 1024) : '');
    segsEl.hidden = segs.length === 0;
    segsEl.replaceChildren(...segs.slice(-20).map((s) =>
      el('i', s.shipped ? 'gone' : 'held', `${s.n}:${Math.round(s.bytes / 1024)}k`)));
  }

  async function openSession() {
    const r = await fetch(`${INGEST}/open`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) { log(`ingest refused: ${j.error}${j.retryInS ? ` (retry in ${j.retryInS}s)` : ''}`, 'bad'); return null; }
    log(`ingest session ${j.session}, caps ${j.limits.maxSegments} segments, ${Math.round(j.limits.maxSessionBytes / 1048576)} MiB`, 'hi');
    return j.session;
  }

  /**
   * The hand-off, then the drop: at most two segments are held, the one being
   * written and the one being shipped, however long the show runs.
   * See lessons/page-capture.md#capture-32
   */
  function handedOff(s) {
    if (s.shipped) return;
    s.shipped = true;
    held--;
    heldBytes -= s.bytes;
    sentBytes += s.bytes;
    if (!useR2) pile.push(s.blob);
    s.blob = null;                 // dropped from what is held
    paint();
  }

  async function shipSeg(s) {
    if (!useR2) { setTimeout(() => handedOff(s), STAND_IN_MS); return; }
    if (!session) return;
    const r = await fetch(`${INGEST}/seg/${session}/${s.n}?fmt=webm`, { method: 'PUT', body: s.blob });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      log(`segment ${s.n} refused: HTTP ${r.status} ${j.error || ''}`, 'bad');
      return;
    }
    handedOff(s);
  }

  row.on('camera', () => source.camera(log));

  row.on('rec', async () => {
    if (recording) return;
    pressedAt ??= performance.now();
    closed = 0; held = 0; peak = 0; heldBytes = 0; peakBytes = 0; sentBytes = 0; recordedBytes = 0;
    segs.length = 0; pile.length = 0; manifestUrl = null;
    session = useR2 ? await openSession() : null;
    set('sent to', useR2 ? (session ? 'R2' : 'refused') : 'local');
    set('length', '');
    paint();
    if (useR2 && !session) return;

    mime = recorderMime({ log });
    if (!mime) return;
    const rec = new MediaRecorder(source.canvas.captureStream(25), { mimeType: mime, videoBitsPerSecond: 800_000 });
    // the timeslice IS the segmenter: each tick closes a chunk
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const s = { n: closed++, blob: e.data, bytes: e.data.size, shipped: false };
      segs.push(s);
      held++;
      heldBytes += s.bytes;
      recordedBytes += s.bytes;
      peak = Math.max(peak, held);
      peakBytes = Math.max(peakBytes, heldBytes);
      paint();
      shipSeg(s);
    };
    rec.onerror = (e) => log(`recorder: ${e.error?.name ?? 'error'}`, 'bad');
    recording = true;
    rec.start(SEG_MS);
    log(`recording ${mime}, ${SEG_MS / 1000}s segments, source ${source.cameraOn() ? 'camera' : 'canvas'}, `
      + (useR2 ? 'each one uploaded as it closes' : 'each one handed off to a stand-in and dropped'), 'hi');

    await wait(SHOW_MS);
    rec.stop();
    await wait(400 + STAND_IN_MS);
    recording = false;

    if (useR2 && session) {
      const r = await fetch(`${INGEST}/close/${session}?fmt=webm`, { method: 'POST' });
      const j = await r.json();
      if (r.ok) {
        manifestUrl = j.manifest;
        log(`closed: ${j.segments} segments, ${Math.round(j.bytes / 1024)} KiB in R2`, 'hi');
        log(j.manifest);
        ship(`CAPTURE ${j.segments} segs ${j.bytes}B ${j.manifest}`);
      } else log(`close refused: ${j.error}`, 'bad');
    } else {
      log(`recorded ${closed} segments, ${Math.round(recordedBytes / 1024)} KiB, never more than ${peak} held at once`);
    }
  });

  // ── playback, on the deck ────────────────────────────────────────────────
  let deck = null, bar = null, lastDur = null;

  /**
   * Timeslice chunks concatenate into one playable WebM (the first carries the
   * header). Assembled from the far side, never from what was held.
   * See lessons/page-capture.md#capture-33
   */
  async function assemble() {
    let parts = pile;
    if (useR2 && manifestUrl) {
      const m = await (await fetch(manifestUrl, { cache: 'no-store' })).json();
      log(`fetching ${m.segments.length} segments back from R2`);
      parts = [];
      for (const name of m.segments) {
        const r = await fetch(`${m.base}/${name}`, { cache: 'no-store' });
        if (!r.ok) { log(`segment ${name} HTTP ${r.status}`, 'bad'); return null; }
        parts.push(await r.blob());
      }
    }
    if (!parts.length) { log('nothing recorded yet', 'bad'); return null; }
    video.src = URL.createObjectURL(new Blob(parts, { type: mime || 'video/webm' }));
    const ms = await resolveDuration(video);
    return ms == null ? null : ms / 1000;
  }

  row.on('play', async () => {
    armVideo(video);
    const dur = await assemble();
    if (dur == null) { log('could not resolve a duration, so there is no range to scrub', 'bad'); return; }
    lastDur = dur;
    set('length', Math.round(dur * 100) / 100);
    video.hidden = false;
    source.canvas.hidden = true;
    if (!deck) {
      deck = createDeck({ items: [], adapters: {}, range: [0, Math.round(dur * 1000)] });
      // The picture is the master: every seek goes through `deck.seek()`, so wrapping
      // it once applies the seek to the picture before the vector snaps back.
      // See lessons/page-capture.md#capture-34
      mediaMaster(deck, video, {});
      const seek = deck.seek.bind(deck);
      deck.seek = (p, opts) => {
        const q = seek(p, opts);
        if (Number.isFinite(q)) video.currentTime = q / 1000;
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
    } else deck.setRange([0, Math.round(dur * 1000)]);
    await playOrPrompt(video, { log });
    deck.play?.();
    log(`playing back ${dur.toFixed(2)}s on the deck, scrub it`, 'hi');
  });

  const ingestAsks = () => requests((u) => u.startsWith(INGEST), pressedAt);

  return {
    get bars() { return bar ? [{ name: 'segments', bar }] : []; },
    hide() { if (!video.paused) video.pause(); },
    /**
     * Presses Record, then Play it back, and grades the result. `?r2=1` makes it a
     * real upload and five ingest requests per run, so the suite never sets it.
     * See lessons/page-capture.md#capture-35
     */
    async check({ A }) {
      A('building this tab opened nothing: no ingest request, no camera, no recording',
        ingestAsks() === 0 && !source.cameraOn() && closed === 0,
        `${ingestAsks()} ingest request(s) before a press, camera ${source.cameraOn() ? 'ON' : 'off'}`);
      A('MediaRecorder available', typeof MediaRecorder !== 'undefined');
      await row.press('rec');
      A('segments closed', closed >= 3, `${closed} segment(s), ${Math.round(recordedBytes / 1024)} KiB`);
      A('never holds more than two segments', peak <= 2,
        `${peak} at once, ${Math.round(peakBytes / 1024)} KiB`);
      A('handing one off frees what it took', held === 0 && heldBytes === 0,
        `${held} still held, ${heldBytes} bytes`);
      A('what is held does not grow with the show', closed >= 3 && peakBytes < recordedBytes,
        `${closed} segments, ${Math.round(recordedBytes / 1024)} KiB recorded, never more than ${Math.round(peakBytes / 1024)} KiB held`);
      A('every byte recorded was handed off', sentBytes === recordedBytes && recordedBytes > 0,
        `${sentBytes} sent of ${recordedBytes}`);
      // TWO SLOTS, ALWAYS, whatever the mode, so the count does not move with it.
      A('the upload leg did what the mode asked',
        useR2 ? !!session && !!manifestUrl && segs.every((s) => s.shipped) : !session && !manifestUrl,
        useR2 ? `R2: session ${session}, ${segs.filter((s) => s.shipped).length}/${closed} uploaded, manifest ${manifestUrl ? 'public' : 'MISSING'}`
          : 'off (add ?r2=1)');
      await row.press('play');
      A('the recording resolves a duration', lastDur != null && lastDur > 0,
        lastDur == null ? 'Infinity' : `${lastDur.toFixed(2)}s`);
      // the archive is a FILE assembled from what was handed off, never the
      // canvas's live stream and never what was held
      A('playback is off what was handed off, not the live source',
        video.srcObject == null && String(video.src).startsWith('blob:') && segs.every((s) => s.blob === null),
        `${String(video.src).slice(0, 24)}, ${segs.filter((s) => s.blob).length} segment(s) still held`);
      // The seek moves the PICTURE: a deck that seeks alone reads green while
      // the video plays on. Under the harness only, because it drags the
      // playback to the middle in front of whoever pressed Play.
      if (SELFCHECK && deck && lastDur) {
        const mid = Math.round(lastDur * 500);
        deck.seek(mid);
        for (let i = 0; i < 10 && Math.abs(video.currentTime * 1000 - mid) > 400; i++) await wait(50);
        A('the deck seeks inside the recording', Math.abs(deck.position() - mid) < 400
          && Math.abs(video.currentTime * 1000 - mid) < 400,
          `deck ${Math.round(deck.position())} ms, picture ${Math.round(video.currentTime * 1000)} ms, asked ${mid}`);
      }
      // Back to the start, so the bar drill's `5` key has to move the playhead to land.
      // See lessons/page-capture.md#capture-36
      deck?.pause?.();
      deck?.seek(0);
      video.pause();
    },
  };
}
