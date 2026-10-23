// The SCORE tab of /partitur/; the projection wall is the second tab (./wall.mjs).
// It joins the room on a press, never on load, in `?room=` when given, through
// bay-node.mjs. Checks run in the one SELFCHECK pass.
// See lessons/page-partitur.md#partitur-9

import { el } from '/shell/shell.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi, publishTransport } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createVideoPanel } from '/shell/video-panel.mjs';
import { createChoice } from '/shell/choice.mjs';
import { createButtonGroup } from '/shell/button-group.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { openWire } from '/shell/wire.mjs';
import { createRegistry } from '/shell/graph-registry.mjs';
import { createBay } from '/shell/bay.mjs';
import { createBayNode, randomSite } from '/shell/bay-node.mjs';
import { ROOM } from './wall.mjs';

/* Moholy-Nagy's Partiturskizze (1924) played as a timeline, from the transcription
   by build-moholy-partiturskizze.mjs. Positions are fractions of the plate; the
   length control is the only duration. Opens nothing: sirens start on play.
   See lessons/page-partitur.md#partitur-10 */
const SRC = '/resources/moholy-partiturskizze.json';
// A file in this repository, fetched when the page loads, as it always was.
const data = await (await fetch(SRC)).json();
const [c1, c2, light, music] = data.lanes;

/** Under the tab row, in the page's one fixed box. */
export const about = 'Moholy-Nagy\u2019s 1924 stage score as a timeline, with the picture showing its light at the playhead. Press play to run it, or Find walls to send the light to a screen in the WALL tab.';

// `links` says whether any lane is reaching anything, which is otherwise unseen.
// See lessons/page-partitur.md#partitur-11
export const readout = { light: '', sirens: '', cue: '', links: '' };

export function build({ panel, log, set }) {

  // See lessons/page-partitur.md#partitur-12


  // ── time ───────────────────────────────────────────────────────────────────
  const LENGTHS = [['5 min', 300], ['8 min', 480], ['10 min', 600]];
  let totalS = data.unit.suggested.totalSeconds;
  const ms = (f) => f * totalS * 1000;

  const deck = createDeck({ items: [], adapters: {}, range: [0, ms(1)] });

  const lightSpans = light.spans.filter((s) => !s.inside);
  const lightInside = light.spans.filter((s) => s.inside);
  const sirens = music.spans.filter((s) => !s.inside);
  const sirensInside = music.spans.filter((s) => s.inside);
  const spanAt = (list, f) => list.find((s) => f >= s.from && f < s.to) || null;
  const markText = (m) => m.folge ? `${m.folge.item} (${m.folge.how})` : m.label;

  // ── the picture: the light column at the playhead, on the projection wall ─
  // White paper as white light is an inference: colours are sampled means of a scan.
  // See lessons/page-partitur.md#partitur-13
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  const video = createVideoPanel({ media: canvas, left: false });
  let W = 0, H = 0, dpr = 1, lastKey = '';
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = video.stage.getBoundingClientRect();
    W = Math.max(240, Math.round(r.width));
    H = Math.max(140, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    lastKey = '';
  }
  /** Paint the wall at fraction `f` into any context. Answers what it drew. */
  function paint(ctx, w, h, f) {
    const s = spanAt(lightSpans, f) || lightSpans[lightSpans.length - 1];
    ctx.fillStyle = s.hex;
    ctx.fillRect(0, 0, w, h);
    // A narrow stripe inside a wide one is a partial light at the same moment,
    // by the key. It is drawn where it stands across the column, as a band.
    const parts = lightInside.filter((x) => f >= x.from && f < x.to);
    for (const x of parts) {
      const [a, b] = x.across || [0, 0.1];
      ctx.fillStyle = x.hex;
      ctx.fillRect(Math.round(a * w), 0, Math.max(2, Math.round((b - a) * w)), h);
    }
    return { colour: s.colour, hex: s.hex, parts: parts.length };
  }
  let drawn = null;
  function draw() {
    const f = deck.position() / ms(1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawn = { f, ...paint(g, W, H, f) };
  }

  // ── the scenes lane: marks that recall a `/patchbay/` scene ───────────────
  // A mark sends `scene.recall` when the playhead passes it playing forward; a seek
  // or scrub fires nothing. Marks live in localStorage, every access wrapped.
  // See lessons/page-partitur.md#partitur-14
  const MARKS_KEY = 'positron.partitur.sceneMarks';
  function loadMarks() {
    try {
      const got = JSON.parse(localStorage.getItem(MARKS_KEY) || '[]');
      return Array.isArray(got) ? got.filter((m) => m && Number.isFinite(m.at) && m.at >= 0 && m.at <= 1 && typeof m.name === 'string') : [];
    } catch { return []; }
  }
  const sceneMarks = loadMarks();
  function keepMarks() {
    try { localStorage.setItem(MARKS_KEY, JSON.stringify(sceneMarks)); } catch { /* full, off or private */ }
  }
  /**
   * Which marks the playhead passed. Pure: it holds only the last fraction it
   * was told. `seek(f)` moves the playhead without passing anything; `at(f,
   * playing)` answers the marks in (last, f], and only while playing forward.
   */
  function createCrosser(marksOf) {
    let last = null;
    return {
      seek(f) { last = f; },
      at(f, playing) {
        const from = last;
        last = f;
        if (!playing || from === null || !(f > from)) return [];
        return marksOf().filter((m) => m.at > from && m.at <= f);
      },
    };
  }
  const crosser = createCrosser(() => sceneMarks);
  const marksSub = () => (sceneMarks.length ? `${sceneMarks.length} mark${sceneMarks.length === 1 ? '' : 's'}` : 'no marks');

  // ── lanes ──────────────────────────────────────────────────────────────────
  const markRows = (lane, kind) => () => lane.marks.map((m, i) => ({
    at: ms(m.at ?? m.from), id: `${kind}-${m.id ?? i}`, kind, payload: m,
  }));
  const spanRows = (list, kind) => () => list.map((s, i) => ({
    at: ms(s.from), id: `${kind}-${i}`, kind, payload: { ...s, durMs: ms(s.to - s.from) },
  }));
  const bands = (list, inside) => (ctx, L, C) => {
    const top = L.y + 3, h = L.height - 6;
    for (const s of list) {
      const xa = C.x(ms(s.from)), xb = C.x(ms(s.to));
      if (xb < 0 || xa > C.width) continue;
      ctx.fillStyle = s.hex || '#888';
      ctx.fillRect(xa, top, Math.max(1, xb - xa), h);
    }
    for (const s of inside) {
      const xa = C.x(ms(s.from)), xb = C.x(ms(s.to));
      const [a, b] = s.across || [0, 0.15];
      ctx.fillStyle = s.hex || '#888';
      ctx.fillRect(xa, top + a * h, Math.max(1, xb - xa), Math.max(2, (b - a) * h));
    }
  };
  const lanes = [
    // The plate's own words (I. Bühne, II. Bühne, Licht, Ton) stay in the
    // transcription and in the hit text.
    // See lessons/page-partitur.md#partitur-15
    { id: 'c1', kind: 'c1', label: 'stage 1', subLabel: 'form, motion', height: 30, as: 'ticks',
      rows: markRows(c1, 'c1') },
    { id: 'c2', kind: 'c2', label: 'stage 2', subLabel: 'and film', height: 30, as: 'ticks',
      rows: markRows(c2, 'c2') },
    { id: 'light', kind: 'light', label: 'light', subLabel: `${lightSpans.length} stripes`, height: 34, as: 'spans',
      rows: spanRows(lightSpans, 'light'), render: bands(lightSpans, lightInside) },
    { id: 'sirens', kind: 'sirens', label: 'sirens', subLabel: 'intended only', height: 26, as: 'spans',
      rows: spanRows(sirens, 'sirens'), render: (ctx, L, C) => {
        bands(sirens, sirensInside)(ctx, L, C);
        ctx.fillStyle = C.theme.ink;
        for (const m of music.marks) {
          const x = C.x(ms(m.at));
          if (x >= 0 && x <= C.width) ctx.fillRect(x, L.y + L.height - 5, 1, 4);
        }
      } },
    { id: 'scenes', kind: 'scenes', label: 'scenes', subLabel: marksSub(), height: 26, as: 'ticks',
      rows: () => sceneMarks.map((m, i) => ({ at: ms(m.at), id: `scenes-${i}`, kind: 'scenes', payload: m })) },
  ];

  const host = el('div');
  // No scrub and no loop: the strip is the position surface and the score is heard whole.
  const control = createTransportControl(deck);
  const bar = createBar({ start: [playToggle(control).el], middle: [clockView(control).el, noteView(control).el],
    end: [ratesView(control).el] });
  host.append(bar.el);
  bindTransportKeys(control, { scope: bar.el });
  publishTransport(transportApi(control, { el: bar.el }));
  const view = createStripView(host, deck, {
    size: 'auto', follow: false, gutter: 110, lanes,
    footer: { lines: 1, empty: '' },
    describeHit: (hit) => {
      const p = hit?.row?.payload;
      if (!p) return '';
      if (hit.lane?.id === 'light') return `${p.colour}, ${p.reading?.text || ''} (${p.how})`.replace(', ()', '');
      if (hit.lane?.id === 'sirens') return `siren band, ${p.colour} (${p.how})`;
      if (hit.lane?.id === 'scenes') return `recalls ${p.name}`;
      return `${markText(p)}, ${p.how}`;
    },
  });

  const length = createChoice({
    label: 'length', options: LENGTHS, at: LENGTHS.findIndex(([, s]) => s === totalS),
    title: () => 'Moholy gave no length; this page chooses one',
    onPick: (s) => setLength(s),
  });

  // ── the light lane as a patchbay source ───────────────────────────────────
  // Announced as an out port; a pick of a wall is a link checked by bay.mjs, and
  // every stripe change at the playhead goes to that wall, playing or scrubbing.
  // See lessons/page-partitur.md#partitur-16
  const SITE = randomSite('partitur');
  const OUT = `${SITE}:light:out`;
  /* Three lanes, three out ports: light to a wall's light, the Ton sirens to any
     MIDI input in the room, stage cues to a wall's captions. Each answers
     `link.request` from /patchbay/.
     See lessons/page-partitur.md#partitur-17 */
  const SOURCES = {
    light: { port: OUT, label: 'light lane', dir: 'out', medium: 'value', shape: { channels: 3 }, choice: 'light to' },
    sirens: { port: `${SITE}:light:sirens`, label: 'siren lane', dir: 'out', medium: 'midi', emits: ['note'], choice: 'sirens to' },
    cues: { port: `${SITE}:light:cues`, label: 'stage cues', dir: 'out', medium: 'state', shape: { schema: 'cue' }, choice: 'cues to' },
  };
  const GRAPH = {
    v: 1, site: SITE, place: 'browser',
    nodes: [{ id: `${SITE}:light`, kind: 'person', label: 'Partiturskizze', place: 'browser' }],
    ports: Object.values(SOURCES).map(({ port, label, dir, medium, shape, emits }) =>
      ({ id: port, label, dir, medium, ...(shape ? { shape } : {}), ...(emits ? { emits } : {}) })),
  };

  /* The room. Building it opens nothing; `join()` below does, on a press. */
  const node = createBayNode({
    room: ROOM, graphs: [GRAPH],
    log: (line, kind) => log(line, kind),
    onJoin: () => { find.button('find').disabled = true; showJoined(); log(`in ${ROOM}, listening for walls and instruments`, 'ok'); },
    onGraph: () => drawChoices(),
    onMessage: (m) => {
      if (m.type === 'scene.list' && Array.isArray(m.scenes)) {
        heardScenes.set(m.from, m.scenes.filter((n) => typeof n === 'string'));
        drawMarkRow();
      }
    },
    // `/patchbay/` asking for one of this page's links. bay-node answers only
    // for this page's own ports, and sends the `link.state` itself.
    onLinkRequest: ({ source, target, open }) => {
      const k = kindOfPort(source);
      return k ? setLink(k, open ? target : '') : { ok: false, why: `${source} is not one of this score\u2019s lanes` };
    },
  });
  const registry = node.registry;
  const linked = { light: '', sirens: '', cues: '' };
  let lastSent = '', lastCueSent = '', sirenOut = null, sirenNote = null;
  const wallHost = el('div', 'pt-text pt-links');
  const kindOfPort = (id) => Object.keys(SOURCES).find((k) => SOURCES[k].port === id);
  const targets = (k) => registry.merged().ports.filter((p) => p.dir === 'in' && !p.stale && !p.id.startsWith(`${SITE}:`)
    && p.medium === SOURCES[k].medium && (k !== 'cues' || p.shape?.schema === 'cue'));
  function drawChoices() {
    wallHost.replaceChildren(...Object.keys(SOURCES).map((k) => {
      const options = [['none', ''], ...targets(k).map((p) => [p.label, p.id])];
      const at = Math.max(0, options.findIndex(([, v]) => v === linked[k]));
      return createChoice({ label: SOURCES[k].choice, options, at, onPick: (v) => setLink(k, v) }).el;
    }));
  }
  /** Make or break one lane's link. Answers bay's result, or `{ ok: true }` for a break. */
  function setLink(k, to) {
    const src = SOURCES[k];
    if (k === 'sirens') { sirenOff(); try { sirenOut?.wire.close(); } catch { /* */ } sirenOut = null; }
    if (!to) { linked[k] = ''; showLinks(); log(`${src.label} is linked to nothing`); drawChoices(); return { ok: true }; }
    const bay = registry.fill(createBay());
    const r = bay.link(src.port, to);
    if (!r.ok) { log(`refused ${src.port} -> ${to}: ${r.why}`, 'bad'); return r; }
    linked[k] = to;
    showLinks();
    if (k === 'light') { lastSent = ''; lastKey = ''; }
    if (k === 'cues') { lastCueSent = ''; lastKey = ''; }
    if (k === 'sirens') {
      // A board synth takes `note.on` in the board's main room; a hardware input
      // takes raw MIDI through the gate in its own room (`/patchbay/` does the same).
      const dest = bay.port(to), engine = bay.node(to.split(':').slice(0, 2).join(':'))?.kind === 'engine';
      const ch = (dest.shape?.channels || [1])[0];
      const w = openWire(dest.address || to.split(':')[0], {});
      sirenOut = { wire: w, engine, ch };
    }
    log(`${src.port} -> ${to}, linked through the patchbay`, 'ok');
    drawChoices();
    return r;
  }
  function showLinks() {
    const n = Object.values(linked).filter(Boolean).length;
    set('links', n ? `${n} of 3` : 'none');
  }
  function sendLight(f) {
    if (!linked.light || !node.joined()) return;
    const s1 = spanAt(lightSpans, f) || lightSpans[lightSpans.length - 1];
    const parts = lightInside.filter((x) => f >= x.from && f < x.to).map((x) => ({ hex: x.hex, across: x.across }));
    const key = `${s1.hex}|${parts.map((x) => x.hex).join(',')}`;
    if (key === lastSent) return;
    lastSent = key;
    node.send({ type: 'light.set', to: linked.light, hex: s1.hex, name: s1.colour, parts, sender: 'partitur' });
  }
  /* The siren bands as held notes, one at a time, only while playing. The pitch
     is per colour and is this page's reading: Moholy's sirens have no pitch. */
  const SIREN_NOTE = { blue: 48, yellow: 55, red: 60, grey: 43, 'dark red': 52 };
  function sirenMsg(on, note) {
    const { engine, ch } = sirenOut;
    return engine ? (on ? { type: 'note.on', note, vel: 90, channel: 0 } : { type: 'note.off', note, channel: 0 })
      : { type: 'midi.send', bytes: [(on ? 0x90 : 0x80) | (ch - 1), note, on ? 90 : 0] };
  }
  function sirenOff() { if (sirenOut && sirenNote !== null) sirenOut.wire.send(sirenMsg(false, sirenNote)); sirenNote = null; }
  function sendSiren(playing, sr) {
    if (!sirenOut) return;
    const want = playing && sr ? (SIREN_NOTE[sr.colour] ?? 50) : null;
    if (want === sirenNote) return;
    sirenOff();
    if (want !== null) { sirenOut.wire.send(sirenMsg(true, want)); sirenNote = want; }
  }
  function sendCue(text) {
    if (!linked.cues || !node.joined() || text === lastCueSent) return;
    lastCueSent = text;
    node.send({ type: 'cue.set', to: linked.cues, text, sender: 'partitur' });
  }
  /* The room is joined on a press: Find walls, the first transport press, or a
     scene mark that needs it.
     See lessons/page-partitur.md#partitur-18 */
  let joined = null;
  function join() {
    if (!joined) joined = node.join();
    return joined;
  }
  function leave() {
    for (const k of Object.keys(linked)) if (linked[k]) setLink(k, '');
    node.leave();
    joined = null;
    find.button('find').disabled = false;
    showJoined();
  }
  const find = createButtonGroup({ buttons: [
    { id: 'find', label: 'Find walls', onPress: () => join() },
  ] });
  drawChoices();
  setInterval(drawChoices, 15_000);

  // The scene names each patchbay in the room last listed, by sender.
  const heardScenes = new Map();
  const sceneNames = () => [...new Set([...heardScenes.values()].flat())];
  let markWith = '';
  const markHost = el('div', 'pt-text');
  function drawMarkRow() {
    const names = sceneNames();
    if (!names.includes(markWith)) markWith = names[0] || '';
    const options = names.length ? names.map((n) => [n, n]) : [['none heard', '']];
    const choice = createChoice({ label: 'scene', options, at: Math.max(0, names.indexOf(markWith)),
      title: (v) => (v ? `a scene saved in a patchbay in ${ROOM}` : `no patchbay in ${ROOM} has listed a scene`),
      onPick: (v) => { markWith = v; } });
    const here = el('button', '', 'Mark here', { type: 'button', title: 'a mark at the playhead that recalls this scene' });
    here.onclick = () => markHere();
    const clear = el('button', '', 'Clear marks', { type: 'button', title: 'remove every mark from the scenes lane' });
    clear.onclick = () => clearMarks();
    clear.disabled = !sceneMarks.length;
    const row = el('div', 'pt-mark');
    row.append(choice.el, here, clear);
    const say = el('p', 'pt-say', 'A mark on the scenes lane recalls a scene saved in ');
    say.append(el('a', '', '/patchbay/', { href: '/patchbay/' }), ' when playback passes it.');
    markHost.replaceChildren(say, row);
  }
  function marksChanged() {
    keepMarks();
    showJoined();
    const L = view.strip.lanes().find((x) => x.id === 'scenes');
    if (L) L.subLabel = marksSub();
    view.strip?.invalidate?.();
    drawMarkRow();
  }
  function markHere() {
    if (!markWith) { join(); log(`no scene heard yet, save one in a patchbay in ${ROOM} first`, 'warn'); return; }
    const f = deck.position() / ms(1);
    sceneMarks.push({ at: f, name: markWith });
    sceneMarks.sort((a, b) => a.at - b.at);
    // The mark is under the playhead now, so it is not passed until it is passed.
    crosser.seek(f);
    marksChanged();
    log(`a mark at ${(f * 100).toFixed(1)} per cent of the score recalls ${markWith}`, 'ok');
  }
  function clearMarks() {
    sceneMarks.length = 0;
    marksChanged();
    log('every scene mark removed');
  }
  function sendRecall(m) {
    if (!node.joined()) { log(`passed the mark for ${m.name}, and this page is not in ${ROOM} to ask for it`, 'warn'); return; }
    node.send({ type: 'scene.recall', name: m.name });
    log(`passed the mark for ${m.name}, the room was asked to recall it`);
  }
  drawMarkRow();
  window.addEventListener('pagehide', () => sirenOff());

  /* The picture and the timeline first, the linking under them: the picks and scene
     marks appear once the room is joined (or marks are already kept).
     See lessons/page-partitur.md#partitur-19 */
  const links = el('div', 'pt-text');
  links.append(find.el, wallHost, markHost);
  function showJoined() {
    wallHost.hidden = !joined;
    markHost.hidden = !joined && !sceneMarks.length;
  }
  showJoined();
  showLinks();
  panel.add(video.glue(bar.el, view.surface), length.el, links);

  /** Rescale everything from fractions. The playhead keeps its place on the plate. */
  function setLength(s, quiet = false) {
    const f = deck.position() / ms(1);
    totalS = s;
    deck.setRange([0, ms(1)]);
    deck.seek(ms(f));
    view.strip?.invalidate?.();
    if (!quiet) log(`length ${Math.round(s / 60)} min, chosen here, because the score gives none`);
  }

  // ── sirens, only while playing ─────────────────────────────────────────────
  // Sound never gates the work: the context's resume is not awaited.
  // See lessons/page-partitur.md#partitur-20
  let ac = null, voice = null;
  const SIREN_HZ = { blue: 330, yellow: 440, red: 550, grey: 262 };
  function siren(on, colour) {
    if (!on) { if (voice) { voice.g.gain.setTargetAtTime(0, ac.currentTime, 0.08); voice = null; } return; }
    if (!ac) return;
    if (voice?.colour === colour) return;
    if (voice) voice.g.gain.setTargetAtTime(0, ac.currentTime, 0.08);
    const o = ac.createOscillator(), lfo = ac.createOscillator(), depth = ac.createGain(), gn = ac.createGain();
    const base = SIREN_HZ[colour] || 392;
    o.type = 'sawtooth'; o.frequency.value = base;
    lfo.frequency.value = 0.4; depth.gain.value = base * 0.35;
    lfo.connect(depth).connect(o.frequency);
    gn.gain.value = 0; gn.gain.setTargetAtTime(0.05, ac.currentTime, 0.2);
    o.connect(gn).connect(ac.destination);
    o.start(); lfo.start();
    o.stop(ac.currentTime + 600); lfo.stop(ac.currentTime + 600);
    voice = { g: gn, colour };
  }
  bar.el.addEventListener('click', () => {
    join();
    if (!ac) { try { ac = new AudioContext(); ac.resume(); } catch { ac = null; } }
  }, true);

  // ── one loop for the wall, the readout and the sirens ─────────────────────
  let lastCue = '';
  const cueAt = (f) => {
    const cue = [...c1.marks, ...c2.marks].filter((m) => m.folge && (m.at ?? m.from) <= f)
      .sort((a, b) => (b.at ?? b.from) - (a.at ?? a.from))[0];
    return cue ? cue.folge.item : '';
  };
  /* Destinations are also driven from a timer: a hidden tab pauses rAF, but a timer
     still runs about once a second. Each send is a no-op unless its value changed.
     See lessons/page-partitur.md#partitur-21 */
  /* A seek or a scrub resets where the scenes lane last saw the playhead, so a
     mark it jumped over is not passed. A play starts just behind the playhead,
     so a mark exactly under it is passed on the way out. */
  deck.transport.onState((st) => {
    const f = deck.position() / ms(1);
    if (st.reason === 'seek' || st.reason === 'sync') crosser.seek(f);
    else if (st.reason === 'play') crosser.seek(f - 1e-9);
  });
  function drive() {
    const f = deck.position() / ms(1);
    for (const m of crosser.at(f, !!deck.playing?.())) sendRecall(m);
    sendLight(f);
    sendCue(cueAt(f));
    sendSiren(!!deck.playing?.(), spanAt(sirens, f));
  }
  setInterval(drive, 250);
  (function follow() {
    const f = deck.position() / ms(1);
    const key = `${Math.round(deck.position())}|${W}|${H}`;
    if (key !== lastKey) {
      lastKey = key;
      draw();
      set('light', drawn.colour);
      const sr = spanAt(sirens, f);
      set('sirens', sr ? sr.colour : '');
      const cueText = cueAt(f);
      if (cueText !== lastCue) { lastCue = cueText; set('cue', cueText); }
      siren(deck.playing?.() && !!sr, sr?.colour);
      drive();
    }
    requestAnimationFrame(follow);
  })();
  size();
  new ResizeObserver(size).observe(video.stage);

  return {
    deck, bar, join, leave, setLink, drive, linked, registry,
    /** the middle of the first stripe of a colour, as a fraction of the plate */
    middleOf: (colour) => { const s = lightSpans.find((x) => x.colour === colour); return s ? (s.from + s.to) / 2 : null; },
    seekTo: (f) => deck.seek(ms(f)),
    hexOf: (colour) => lightSpans.find((x) => x.colour === colour)?.hex || null,
    show() { size(); requestAnimationFrame(() => requestAnimationFrame(() => { view.strip.fit?.(); view.strip.invalidate?.(); })); },
    hide() { if (deck.playing?.()) deck.pause(); sirenOff(); siren(false); },
    async check({ A }) {
      A('building the tab joined nothing, the room waits for a press', !node.joining() && !joined, node.joining() ? 'a socket is open' : 'no socket');
      A('the light column covers the plate end to end with no gap',
        lightSpans[0].from === 0 && lightSpans.at(-1).to === 1
          && lightSpans.every((s, i) => i === 0 || Math.abs(s.from - lightSpans[i - 1].to) < 1e-9),
        `${lightSpans.length} stripes, ${lightInside.length} inside`);
      A('every row says whether it was seen or inferred',
        [...c1.marks, ...c2.marks, ...light.spans, ...music.spans, ...music.marks].every((r) => r.how === 'seen' || r.how === 'inferred'));
      A('the music lane is marked as intentions, as Moholy marked it', music.intent === true);
      A('the score gives no length and the page says it chose one',
        data.unit.given === false && LENGTHS.some(([, s]) => s === totalS), `${totalS} s`);
      {
        // Negative control: the wall at the start and at the longest darkness is black,
        // and at a yellow stripe is not.
        // See lessons/page-partitur.md#partitur-22
        const off = document.createElement('canvas').getContext('2d');
        const first = paint(off, 10, 10, 0);
        const yellow = lightSpans.find((s) => s.colour === 'yellow');
        const atYellow = paint(off, 10, 10, (yellow.from + yellow.to) / 2);
        A('the wall shows the light stripe at the playhead', first.hex === lightSpans[0].hex && atYellow.colour === 'yellow',
          `${first.colour} at 0, ${atYellow.colour} at a yellow stripe`);
      }
      {
        const before = deck.position();
        deck.seek(ms(0.5));
        const f0 = deck.position() / ms(1);
        setLength(300, true);
        const f1 = deck.position() / ms(1);
        setLength(data.unit.suggested.totalSeconds, true);
        deck.seek(before);
        A('changing the length keeps the playhead on the same place in the score', Math.abs(f0 - f1) < 0.001, `${f0.toFixed(3)} then ${f1.toFixed(3)}`);
      }
      {
        // A wall heard is a link the patchbay accepts, and a link from the lane to
        // something that is not a light input is refused. Fixtures, no socket.
        const reg = createRegistry();
        reg.ingest({ type: 'graph.announce', from: 'self', graph: GRAPH });
        reg.ingest({ type: 'graph.announce', from: 'w', graph: { v: 1, site: 'wall-test', place: 'browser',
          nodes: [{ id: 'wall-test:wall', kind: 'screen', label: 'wall', place: 'browser' }],
          ports: [{ id: 'wall-test:wall:light', label: 'wall', dir: 'in', medium: 'value', shape: { channels: 3 } },
                  { id: 'wall-test:wall:sound', label: 'wall', dir: 'in', medium: 'audio' }] } });
        const b = reg.fill(createBay());
        const ok = b.validate(OUT, 'wall-test:wall:light');
        const no = b.validate(OUT, 'wall-test:wall:sound');
        A('the light lane can be linked to a wall\u2019s light input', ok.ok, ok.why);
        A('and is refused into a sound input', !no.ok && /value/.test(no.why), no.why);
        const reg2 = createRegistry();
        reg2.ingest({ type: 'graph.announce', from: 'self', graph: GRAPH });
        reg2.ingest({ type: 'graph.announce', from: 'i', graph: { v: 1, site: 'desk', place: 'pi',
          nodes: [{ id: 'desk:synth', kind: 'engine', label: 'synth', place: 'pi' }, { id: 'desk:wall', kind: 'screen', label: 'wall', place: 'browser' }],
          ports: [{ id: 'desk:synth:in', label: 'synth', dir: 'in', medium: 'midi', accepts: ['note'], never: [] },
                  { id: 'desk:wall:cue', label: 'wall', dir: 'in', medium: 'state', shape: { schema: 'cue' } }] } });
        const b2 = reg2.fill(createBay());
        const toSynth = b2.validate(SOURCES.sirens.port, 'desk:synth:in');
        const toCaps = b2.validate(SOURCES.cues.port, 'desk:wall:cue');
        A('the siren lane can be linked to an instrument\u2019s MIDI input', toSynth.ok, toSynth.why);
        A('and the stage cues to a wall\u2019s captions', toCaps.ok, toCaps.why);
      }
      {
        // The scenes lane's crossing, as a pure helper on fixtures, no deck and no room.
        const marks = [{ at: 0.3, name: 'a' }];
        const play = createCrosser(() => marks);
        play.seek(0.29);
        const first = play.at(0.31, true), again = play.at(0.32, true);
        A('a scene mark passed while playing fires once', first.length === 1 && first[0].name === 'a' && again.length === 0,
          `${first.length} then ${again.length}`);
        // Negative controls: a seek over the mark, and a scrub over it while paused.
        // See lessons/page-partitur.md#partitur-23
        const jump = createCrosser(() => marks);
        jump.seek(0.1);
        jump.seek(0.5);
        const afterSeek = jump.at(0.51, true);
        const scrub = createCrosser(() => marks);
        scrub.seek(0.29);
        const paused = scrub.at(0.31, false);
        A('a seek or a paused scrub over the mark fires nothing', afterSeek.length === 0 && paused.length === 0,
          `${afterSeek.length} after a seek, ${paused.length} scrubbing`);
      }
    },
  };
}
