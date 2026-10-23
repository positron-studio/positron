// demo/shell/hero.mjs: THE HERO, LARGE: wordmark, headline, lines and an imaginary working patchbay,
// phone and desk versions. One copy for /kit/frontpage/ and the front page; styles `.pos-hero*`.
// Nothing here runs anything: a visit opens no socket, context or fetch.
// why: lessons/kit-hero.md#header
import { el } from './shell.mjs';
import { createBayView, BAY_VIEW_CSS } from './bay-view.mjs';
import { createBayTraffic } from './bay-traffic.mjs';
import { createPortInk } from './port-ink.mjs';
import { MEDIA } from './bay.mjs';
import { useMediumColours } from './patchbay.mjs';

// The owner's copy, word for word. /kit/frontpage/'s type specimens set the
// same four lines, so they read them from here.
export const HERO = {
  eye: 'POSITRON STUDIO',
  head: 'Connect anything to everything.',
  line: 'Create live, interactive experiences, from the web up to the cloud and down to microcontrollers.',
  small: 'Powered by Cloudflare services. Delivered as agentic skills.',
};

// The desk patch, three columns: what you hold, what Cloudflare does with it, where it ends up.
// why: lessons/kit-hero.md#desk
const DESK = [
  ['web:keys:midi-out', 'cf-relay:room:midi-in'],
  ['pico-1:knob:value-out', 'cf-relay:room:value-in'],
  ['cf-relay:room:midi-out', 'pi-1:circuit:midi-in'],
  ['cf-relay:room:value-out', 'pi-1:circuit:value-in'],
  ['web:camera:video-out', 'cf-stream:live:video-in'],
  ['cf-stream:live:video-out', 'web:screen:video-in'],
  ['cf-stream:live:video-out', 'phone:screen:video-in'],
];
// The phone patch: touch plays the Circuit, tilt is its filter and the shader's angle, the camera
// and microphone go out on Stream.
// why: lessons/kit-hero.md#phone
const PHONE = [
  ['phone:touch:midi-out', 'pi-1:circuit:midi-in'],
  ['phone:tilt:value-out', 'pi-1:circuit:value-in'],
  ['phone:tilt:value-out', 'pi-1:shader:value-in'],
  ['phone:camera:video-out', 'pi-1:shader:video-in'],
  ['phone:camera:video-out', 'cf-stream:live:video-in'],
  ['phone:mic:audio-out', 'cf-stream:live:audio-in'],
];
const LABELS = { 'web:keys': 'keyboard', 'web:rec': 'recorder', 'web:synth': 'sine synth', 'web:fx': 'octaver',
  'web:speaker': 'speakers', 'cf-relay:room': 'Cloudflare', 'pi-1:circuit': 'Novation Circuit', 'r2:recordings': 'R2',
  'web:pico': 'emulated Pico', 'web:oled': 'its screen', 'web:editor': 'shader code', 'pi-1:shader': 'Pi shader',
  'web:screen': 'screen', 'web:camera': 'camera', 'cf-stream:live': 'Stream',
  'pico-1:knob': 'a knob on a Pico', 'phone:screen': 'every phone watching',
  'phone:touch': 'touch', 'phone:tilt': 'tilt', 'phone:camera': 'camera', 'phone:mic': 'microphone' };
const nodeOf = (id) => id.split(':').slice(0, 2).join(':');
function bayOf(pairs) {
  const ports = new Map(), nodes = new Map();
  const links = pairs.map(([from, to], i) => {
    for (const [id, dir] of [[from, 'out'], [to, 'in']]) {
      if (!nodes.has(nodeOf(id))) nodes.set(nodeOf(id), { id: nodeOf(id), label: LABELS[nodeOf(id)] || '' });
      if (!ports.has(id)) ports.set(id, { id, dir, medium: id.split(':')[2].replace(/-(in|out)$/, '') });
    }
    return { id: `l${i}`, from, to };
  });
  return { nodes: () => [...nodes.values()], ports: () => [...ports.values()], links: () => links, portMap: ports };
}

// Stand-in traffic from one player: every midi wire carries the keys' notes, each hop later.
// Nothing leaves the page.
// why: lessons/kit-hero.md#feeds
function feeds() {
  const notes = [];
  let nextNote = 0;
  const playing = (t) => (t % 5000) < 3600;     // a phrase, then a breath
  const tick = (t) => {
    if (playing(t) && t >= nextNote) { notes.push(t); nextNote = t + 180 + Math.random() * 260; }
    while (notes.length && notes[0] < t - 6000) notes.shift();
  };
  const events = (ms) => { let seen = -1; return (t) => { tick(t); const due = notes.filter((x) => x + ms <= t).length; const n = seen < 0 ? 0 : Math.max(0, due - seen); seen = due; return { n, level: 0 }; }; };
  const sound = (ms, decay) => { let lvl = 0, prev = 0, heard = 0; return (t) => {
    tick(t); const due = notes.filter((x) => x + ms <= t).length;
    if (due > heard) lvl = 0.6 + Math.random() * 0.4;
    heard = due; lvl *= Math.exp(-(t - prev) / decay); prev = t;
    return { n: 0, level: lvl, flowing: lvl > 0.03 }; }; };
  const steady = (t) => ({ n: 0, level: 0.75 + 0.15 * Math.sin(t / 700), flowing: true });
  // the mod wheel moved for a second in every eight, 30 events a second
  const wheel = (ms) => { let next = 0; return (t) => { let n = 0; if (((t - ms) % 8000) < 1000 && t >= next) { n = 1; next = t + 33; } return { n, level: 0.5 }; }; };
  return {
    'web:keys:midi-out': events(0), 'cf-relay:room:midi-out': events(60),
    'web:camera:video-out': steady, 'cf-stream:live:video-out': steady,
    'cf-relay:room:value-out': wheel(60), 'pico-1:knob:value-out': wheel(0),
    'phone:touch:midi-out': events(0), 'phone:tilt:value-out': wheel(0), 'phone:camera:video-out': steady,
    'phone:mic:audio-out': sound(0, 600),
  };
}

/**
 * The imaginary patch as data, for the page and for a picture drawn with no
 * page (share-card.mjs draws the share card's bay from this with bay-svg.mjs).
 * `{ bay, width, detail, stretch, sizeAs }`: the width it is drawn at and the
 * options `createBayView` takes, so the two pictures cannot disagree.
 */
export function heroBay(phone = false) {
  return {
    bay: bayOf(phone ? PHONE : DESK),
    width: phone ? 520 : 900,   // 900 at the desk leaves the wires about twice the room
    detail: (n) => [{ text: n.label }],
    // Every column the same width: boxes at a row-of-n width, no stretch.
    stretch: false,
    // Column gaps about twice the bay's 48 px: boxes sized as if the row held more of them.
    // why: lessons/kit-hero.md#sizeas
    sizeAs: phone ? 2.2 : 4,
  };
}

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  // Without the medium colours every wire is one grey.
  useMediumColours();
  document.head.append(Object.assign(document.createElement('style'), { id: 'pos-hero-css', textContent: BAY_VIEW_CSS }));
}

/**
 * The hero as one block. `tag` is the headline's element: `h2` inside the kit,
 * `h1` on the front page, where it is the page's heading. It renders the same
 * either way. Returns `{ el, phone }`: `phone()` says which picture is up.
 */
export function createHero({ tag = 'h2' } = {}) {
  style();
  const big = el('div', 'pos-hero');
  const eye = el('p', 'pos-hero-eye');
  eye.append('POSITRON', el('b', '', '.'), 'STUDIO');
  // The headline's full stop in the accent too, as the wordmark's dot.
  // why: lessons/kit-hero.md#headline
  const head = el(tag, 'pos-hero-h');
  head.append(HERO.head.replace(/\.$/, ''), el('b', '', '.'));
  big.append(eye, head, el('p', 'pos-hero-l', HERO.line), el('p', 'pos-hero-s', HERO.small));

  const frame = el('div', 'pos-hero-bay'), inner = el('div', 'pos-hero-bay-in');
  frame.append(inner);
  big.append(frame);
  const life = createBayTraffic();
  // The traffic rows are added once per wire and keep this one view object,
  // which each draw points at the picture that is up. Adding per draw grew the
  // rows every time the width crossed 560 px.
  let current = null, idOf = new Map();
  const live = { wires: { get: (k) => current?.wires.get(idOf.get(k)) } };
  const added = new Set(), feed = feeds();
  const phoneQ = matchMedia('(max-width: 560px)');
  let drawW = 0;
  // Drawn at a fixed width (760 at the desk, 520 on a phone, each above the
  // bay's own stacking width) and scaled to the column with `zoom`, not a
  // transform: a zoomed box takes its scaled size in the layout, so the frame
  // is exactly as tall as the picture it shows.
  const fit = () => { if (drawW) inner.style.zoom = String(Math.min(1, frame.clientWidth / drawW)); };
  function draw() {
    const phone = phoneQ.matches, { bay, width, ...opts } = heroBay(phone);
    drawW = width;
    inner.style.width = `${drawW}px`;
    const view = createBayView(bay, opts);
    inner.replaceChildren(view.el);
    const wireKey = (l) => `${l.from} ${l.to}`;
    current = view;
    idOf = new Map(bay.links().map((l) => [wireKey(l), l.id]));
    for (const l of bay.links()) {
      const k = wireKey(l);
      if (added.has(k)) continue;
      added.add(k);
      life.add(live, k, bay.portMap.get(l.from).medium, feed[l.from]);
    }
    createPortInk({ ports: () => bay.ports() }, MEDIA).paint(frame);
    requestAnimationFrame(fit);
  }
  draw();
  phoneQ.addEventListener('change', draw);
  new ResizeObserver(fit).observe(frame);
  return { el: big, phone: () => phoneQ.matches };
}
