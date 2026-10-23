// demo/room/replay.mjs: record what is on the stage, keep it in this browser, play it back on the stage, and copy it
// to R2. /room/replay/ is /room/obs/ plus this. A recorder, this browser's store, a player and Cloudflare's R2 are
// nodes; the stream into the recorder, the take into the store, the store into the player and the upload are links.
// While a tab records, every tab in the room shows a red mark on its stage.
// why: lessons/kit-participant.md#replay

import { el, recorderMime } from '/shell/shell.mjs';
import { createButtonGroup } from '/shell/button-group.mjs';
import { putWhole, proveReadable, ARCHIVE_BASE } from '/shell/ingest.mjs';
import { resolveDuration } from '/shell/media.mjs';

const SLICE_MS = 2000;
const VIDEO_BPS = 700_000, AUDIO_BPS = 96_000;
// ingest keeps 24 MiB a session; at about 800 kbit/s that is four minutes.
const REC_MAX_MS = 240_000;
const MARK_EVERY_MS = 5000, MARK_STALE_MS = 12_000;
const DB = 'positron-replay';

const CSS = `
  .rp-mark { position: absolute; top: 8px; right: 8px; z-index: 2; padding: 2px 8px; border-radius: 4px;
    background: rgba(0, 0, 0, .65); color: var(--rec, #e5484d); font: 600 12px/1.6 var(--mono); }
  .rp-mark[hidden] { display: none; }
  .rp-row { display: flex; gap: var(--ctl-gap, 8px); align-items: center; flex-wrap: wrap; }
  .rp-row + .rp-row { margin-top: var(--ctl-gap, 8px); }
  .rp-say { font-size: 13px; color: var(--dim); }
  .rp-url { font: 400 12px/1.5 var(--mono); overflow-wrap: anywhere; }
`;

/** The browser's store for takes: one object per take, kept until replaced. Opened on the first press. */
function takeStore() {
  let db = null;
  const open = () => db || (db = new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('takes', { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await open();
    return new Promise((ok, no) => {
      const t = d.transaction('takes', mode), q = fn(t.objectStore('takes'));
      t.oncomplete = () => ok(q?.result);
      t.onerror = () => no(t.error);
    });
  };
  return {
    put: (take) => tx('readwrite', (s) => { s.clear(); return s.put(take); }),
    last: () => tx('readonly', (s) => s.getAll()).then((all) => (all || []).sort((a, b) => b.at - a.at)[0] || null),
  };
}

/**
 * @param {object} o
 * @param {string} o.site       this tab's site
 * @param {object} o.d          the page's mount
 * @param {object} o.stage      createStage()
 * @param {() => MediaStream|null} o.liveStream  the stage's live stream, picture and sound, or null
 * @param {(port: string, ev: object) => {sent: number}} o.emit  a light event into the room
 * @param {() => void} o.changed  the links changed: redraw the patchbay and the stage
 */
export function createReplay({ site, d, stage, liveStream, emit, changed }) {
  if (!document.getElementById('rp-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'rp-css', textContent: CSS }));
  const REC = `${site}:rec`, STORE = `${site}:store`, PLAYER = `${site}:player`, R2 = 'cf-r2:takes';
  const MARK_OUT = `${REC}:value-out`;
  const store = takeStore();
  let rec = null, recAt = 0, take = null, url = '', until = 0, playing = false, uploading = false, recTimer = null, markTimer = null;
  const marks = new Map();   // site -> last heard, for every tab recording now
  const refused = new Set();   // each refusal logged once, not on every redraw

  const mark = el('div', 'rp-mark', '');
  mark.hidden = true;
  stage.el.append(mark);
  function drawMark() {
    const now = Date.now();
    for (const [s, t] of marks) if (now - t > MARK_STALE_MS) marks.delete(s);
    const who = [...marks.keys()].map((s) => (s === site ? 'you' : s));
    mark.hidden = !who.length;
    mark.textContent = who.length ? `● REC ${who.join(', ')}` : '';
  }
  setInterval(drawMark, 2000);

  const btn = createButtonGroup({ buttons: [
    { id: 'rec', label: 'Record', onPress: () => (rec ? stopRec('you pressed Stop') : startRec()) },
    { id: 'play', label: 'Play take', onPress: () => (playing ? stopPlay() : play()) },
    { id: 'up', label: 'Upload', onPress: () => upload() },
  ] });
  const say = el('span', 'rp-say', '');
  const urlEl = el('code', 'rp-url', '');
  const rowA = el('div', 'rp-row'), rowB = el('div', 'rp-row');
  rowA.append(btn.el, say);
  rowB.append(urlEl);
  rowB.hidden = true;
  const sec = el('section', 'rp');
  sec.append(el('h2', 'pos-sec-h', 'replay'), rowA, rowB);
  sec.hidden = true;

  const fmtLen = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;
  function draw() {
    const live = !!liveStream();
    btn.button('rec').textContent = rec ? 'Stop' : 'Record';
    btn.enable('rec', !!rec || (live && !playing), playing ? 'a take is playing' : 'nothing is streaming to record');
    btn.button('play').textContent = playing ? 'Stop take' : 'Play take';
    btn.enable('play', !!take && !rec, rec ? 'recording' : 'no take yet');
    btn.enable('up', !!take && !rec && !uploading && !url, uploading ? 'uploading' : url ? 'uploaded' : 'no take yet');
    say.textContent = rec ? `recording ${fmtLen(Date.now() - recAt)} of at most ${fmtLen(REC_MAX_MS)}`
      : uploading ? 'uploading the take to R2'
      : take ? `take ${fmtLen(take.ms)}, ${(take.bytes / 1e6).toFixed(1)} MB, in this browser${url ? `, and in R2 until ${new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
      : live ? 'the stage can be recorded' : 'nothing to record until something streams';
    rowB.hidden = !url;
    urlEl.textContent = url;
  }
  // The stream reaches the stage seconds after the room says it is live, with no event here: look every second.
  setInterval(() => { if (!sec.hidden) draw(); }, 1000);

  function sayMark(on) {
    const r = emit(MARK_OUT, { of: 'rec', on });
    return r?.sent;
  }
  function startRec() {
    const src = liveStream();
    if (!src) return;
    const mime = recorderMime(d);
    if (!mime) return;
    const chunks = [];
    try {
      rec = new MediaRecorder(new MediaStream(src.getTracks()), { mimeType: mime, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS });
    } catch (e) { d.log(`the recorder refused: ${e.message}`, 'bad'); rec = null; return; }
    recAt = Date.now();
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const ms = Date.now() - recAt;
      const blob = new Blob(chunks, { type: mime });
      rec = null; clearTimeout(recTimer); clearInterval(markTimer);
      marks.delete(site); drawMark(); sayMark(false);
      take = { id: `take-${recAt}`, at: recAt, ms, bytes: blob.size, mime, blob, url: '' };
      url = '';
      try { await store.put(take); d.log(`kept a ${fmtLen(ms)} take, ${(blob.size / 1e6).toFixed(1)} MB, in this browser`); }
      catch (e) { d.log(`this browser would not keep the take (${e.message}); it stays until you leave`, 'warn'); }
      draw(); changed();
    };
    rec.start(SLICE_MS);
    recTimer = setTimeout(() => stopRec(`a take stops at ${fmtLen(REC_MAX_MS)}, which is what R2 takes in one go here`), REC_MAX_MS);
    marks.set(site, Date.now()); drawMark(); sayMark(true);
    markTimer = setInterval(() => { if (rec) { marks.set(site, Date.now()); sayMark(true); } }, MARK_EVERY_MS);
    d.log(`recording the stage as ${mime}`);
    draw(); changed();
  }
  function stopRec(why) {
    if (!rec) return;
    d.log(`recording stopped: ${why}`);
    try { rec.stop(); } catch { /* already stopped */ }
  }
  let blobUrl = '';
  async function play() {
    if (!take) return;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(take.blob);
    playing = true;
    stage.film(blobUrl, { title: 'take' });
    stage.video.onended = () => stopPlay();
    resolveDuration(stage.video).catch(() => {});
    d.log('playing the take on your stage');
    draw(); changed();
  }
  function stopPlay() {
    if (!playing) return;
    playing = false;
    stage.film(null);
    stage.video.onended = null;
    d.log('the take stopped');
    draw(); changed();
  }
  async function upload() {
    if (!take || uploading) return;
    uploading = true; draw(); changed();
    try {
      // The open tier keeps an object six hours; the take is its one piece, seg00000.
      const r = await putWhole(take.blob, { log: (m, k) => d.log(m, k) });
      const at = r ? `${ARCHIVE_BASE}/${r.session}/seg00000.webm` : '';
      if (at && (await proveReadable(at)).ok) {
        url = at; until = Date.parse(r.expiresAt) || Date.now() + 6 * 3600_000;
        take.url = url; take.until = until; store.put(take).catch(() => {});
        d.log(`the take is in R2 until ${new Date(until).toLocaleTimeString()}: ${url}`);
      } else d.log(r ? 'R2 took the take and does not hand it back yet' : 'R2 refused the take', 'bad');
    } catch (e) { d.log(`the upload failed: ${e.message}`, 'bad'); }
    uploading = false; draw(); changed();
  }

  return {
    el: sec,
    /** Joined: show the section and read the last take back. Left: stop what runs. */
    joined(on) {
      sec.hidden = !on;
      if (!on) { stopRec('you left'); stopPlay(); return; }
      store.last().then((t) => { if (t && !take) { take = t; until = t.until || 0; url = t.url && until > Date.now() ? t.url : ''; draw(); changed(); } }).catch(() => {});
      draw();
    },
    /** The live stream came or went. */
    live() { if (!liveStream() && rec) stopRec('the stream ended'); draw(); },
    /** A take holds this tab's stage while it plays. */
    playing: () => playing,
    recording: () => !!rec,
    /** Somebody's recording mark arrived. */
    heard(e, by) { if (e.on) marks.set(by, Date.now()); else marks.delete(by); drawMark(); },
    nodes: () => [
      { id: REC, kind: 'engine', label: 'recorder' },
      { id: STORE, kind: 'store', label: 'this browser' },
      { id: PLAYER, kind: 'engine', label: 'player' },
    ],
    ports: () => [
      { id: `${REC}:video-in`, label: 'picture', dir: 'in', medium: 'video', transports: ['page', 'sfu'] },
      { id: `${REC}:audio-in`, label: 'sound', dir: 'in', medium: 'audio', transports: ['page', 'sfu'] },
      { id: `${REC}:file-out`, label: 'take', dir: 'out', medium: 'file', transports: ['indexeddb'] },
      { id: MARK_OUT, label: 'recording', dir: 'out', medium: 'value', transports: ['relay'] },
      { id: `${STORE}:file-in`, label: 'take', dir: 'in', medium: 'file', transports: ['indexeddb'] },
      { id: `${STORE}:file-out`, label: 'take', dir: 'out', medium: 'file', transports: ['indexeddb', 'ingest'] },
      { id: `${PLAYER}:file-in`, label: 'take', dir: 'in', medium: 'file', transports: ['indexeddb'] },
      { id: `${PLAYER}:video-out`, label: 'picture', dir: 'out', medium: 'video', transports: ['page'] },
      { id: `${PLAYER}:audio-out`, label: 'sound', dir: 'out', medium: 'audio', transports: ['webaudio'] },
    ],
    /** The links this tab holds now. `enc` is the live encoder's node id, `stageIn` and `stageSound` this stage. */
    link(b, { enc, stageIn, stageSound, stageHear, log }) {
      const L = (a, z) => { const r = b.link(a, z); if (!r.ok && !refused.has(r.why)) { refused.add(r.why); log?.(`replay link ${a} -> ${z}: ${r.why}`); } };
      b.addNode({ id: R2, kind: 'store', label: 'R2', place: 'cloudflare', net: 'cloudflare' });
      b.addPort({ id: `${R2}:file-in`, label: 'take', dir: 'in', medium: 'file', transports: ['ingest'] });
      b.addPort({ id: `${R2}:file-out`, label: 'take', dir: 'out', medium: 'file', transports: ['https'] });
      L(`${site}:rec:value-out`, '*:stage:value-in');
      L('*:rec:value-out', stageHear);
      if (rec && enc) { L(`${enc}:video-out`, `${REC}:video-in`); L(`${enc}:audio-out`, `${REC}:audio-in`); }
      L(`${REC}:file-out`, `${STORE}:file-in`);
      if (take) L(`${STORE}:file-out`, `${PLAYER}:file-in`);
      if (playing) { L(`${PLAYER}:video-out`, stageIn); L(`${PLAYER}:audio-out`, stageSound); }
      if (uploading || url) L(`${STORE}:file-out`, `${R2}:file-in`);
    },
  };
}
