// demo/shell/participant.mjs: one person's camera in a video room, and the grid that holds one to N
// of them. createParticipant is a tile: the picture, a name tag, a muted mic and a camera-off face,
// and a ring while they speak. createParticipantGrid sizes every tile alike from its own box.
// Nothing here opens a camera or a connection: the page hands a tile a MediaStream.
// why: lessons/kit-participant.md#header

import { el } from './shell.mjs';
import { icon } from './icons.mjs';

const CSS = `
  .pos-pt { position: relative; overflow: hidden; background: var(--bg); border-radius: var(--r, 4px);
            box-sizing: border-box; min-width: 0; min-height: 0; }
  /* The tile is the surface and clips its own corners, so its picture drops the border and radius
     shell.css gives every bare <video>. */
  .pos-pt video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
                  background: var(--bg); border: 0; border-radius: 0; max-width: none; }
  .pos-pt.mirror video { transform: scaleX(-1); }
  .pos-pt.off video { visibility: hidden; }
  /* The camera-off face: initials centred, in the brand face, sized by the tile's own box. */
  .pos-pt-face { position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
                 container-type: size; }
  .pos-pt.off .pos-pt-face { display: flex; }
  .pos-pt-face span { font: 600 clamp(14px, 22cqmin, 64px)/1 var(--brand); color: var(--dim); }
  /* Name and mic, bottom left on the picture, so they stay when the tile is small. */
  .pos-pt-tag { position: absolute; left: 6px; bottom: 6px; max-width: calc(100% - 12px);
                display: flex; gap: 5px; align-items: center; padding: 3px 7px; border-radius: var(--r, 4px);
                background: rgb(0 0 0 / 0.55); font: 500 11px/1.3 var(--mono); color: var(--fg); }
  .pos-pt-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pos-pt-mic { display: none; color: var(--rec, #e5534b); flex: none; }
  .pos-pt-mic svg { display: block; }
  .pos-pt.muted .pos-pt-mic { display: inline-flex; }
  /* Speaking: an inset ring, so the tile never changes size while somebody talks. */
  .pos-pt::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
                   box-shadow: inset 0 0 0 2px transparent; transition: box-shadow 120ms linear; }
  .pos-pt.speaking::after { box-shadow: inset 0 0 0 2px var(--hi); }
  .pos-pt-state { position: absolute; right: 6px; top: 6px; padding: 2px 6px; border-radius: var(--r, 4px);
                  background: rgb(0 0 0 / 0.55); font: 400 10.5px/1.3 var(--mono); color: var(--dim); }
  .pos-pt-state:empty { display: none; }

  /* The grid fills its whole box: no gap, no padding, every picture cropped to its cell. The
     rows share the height and each row shares the width among its own tiles, so a short last
     row stretches rather than leaving a hole. Columns and rows come from fit(), the spans
     from layout(). why: lessons/kit-participant.md#grid */
  .pos-ptg { position: relative; flex: 1 1 auto; min-height: 0; min-width: 0; overflow: hidden;
             display: grid; grid-template-columns: var(--ptg-cols, 1fr); grid-template-rows: var(--ptg-rows, 1fr);
             gap: var(--ptg-gap, 0px); padding: var(--ptg-gap, 0px); box-sizing: border-box; }
  .pos-ptg.scroll { overflow-y: auto; }
  .pos-ptg > .pos-pt { grid-column: span var(--pt-span, 1); border-radius: 0; }
  .pos-ptg-empty { grid-column: 1 / -1; place-self: center; font: 400 12px/1.4 var(--mono); color: var(--dim2); }
`;
let styled = false;
const style = () => {
  if (styled || typeof document === 'undefined') return;
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
  styled = true;
};

const initials = (name) => String(name || '?').replace(/^web-/, '').slice(0, 3).toUpperCase();

/**
 * One participant's tile.
 * @param {object} o
 * @param {string} o.name          shown in the tag and, camera off, as the face
 * @param {boolean} [o.self]       your own tile: mirrored, and its sound never played back
 * @returns {{ el: HTMLElement, video: HTMLVideoElement, id: string,
 *   stream: (s?: MediaStream|null) => MediaStream|null, name: (t: string) => void,
 *   mic: (on: boolean) => void, cam: (on: boolean) => void, speaking: (on: boolean) => void,
 *   state: (t: string) => void, info: () => object }}
 * why: lessons/kit-participant.md#tile
 */
export function createParticipant({ name = '', self = false, id = name } = {}) {
  style();
  const root = el('div', `pos-pt${self ? ' mirror self' : ''}`);
  root.dataset.id = id;
  const video = document.createElement('video');
  video.playsInline = true;
  video.autoplay = true;
  // Your own sound is never played back to you: that is the echo.
  video.muted = self;
  const face = el('div', 'pos-pt-face');
  // Your own tile shows no initials with the camera off: a big YOU is you shouting at yourself.
  const faceT = el('span', '', self ? '' : initials(name));
  face.append(faceT);
  const tag = el('div', 'pos-pt-tag');
  const mic = el('span', 'pos-pt-mic');
  mic.append(icon('mic-off', { size: 12, title: 'microphone off' }));
  const nameEl = el('span', 'pos-pt-name', name);
  tag.append(mic, nameEl);
  const stateEl = el('div', 'pos-pt-state', '');
  root.append(video, face, tag, stateEl);

  let src = null, micOn = true, camOn = true, talking = false;
  const api = {
    el: root, video, id,
    /** Hand the tile a stream, or null to empty it. Answers the stream it holds. */
    stream(s) {
      if (s === undefined) return src;
      src = s || null;
      if (video.srcObject !== src) video.srcObject = src;
      if (src) video.play?.().catch(() => { /* autoplay refused: the next press plays it */ });
      return src;
    },
    name(t) { nameEl.textContent = t; if (!self) faceT.textContent = initials(t); },
    mic(on) { micOn = !!on; root.classList.toggle('muted', !micOn); },
    cam(on) { camOn = !!on; root.classList.toggle('off', !camOn); },
    speaking(on) { talking = !!on; root.classList.toggle('speaking', talking); },
    /** One short word about the connection, top right: 'connecting', 'relay'. Empty hides it. */
    state(t) { stateEl.textContent = t || ''; },
    info: () => ({ id, self, mic: micOn, cam: camOn, speaking: talking, playing: !!src && !video.paused,
      w: video.videoWidth, h: video.videoHeight }),
  };
  return api;
}

/**
 * The size every tile gets: try each column count, keep the one with the biggest tile.
 * Pure, so it is tested without a browser.
 * @param {number} W  @param {number} H  the grid's box, padding taken off
 * @param {number} n  tiles
 * @param {number} ar tile width over height
 * @param {number} gap
 * @returns {{ cols: number, rows: number, w: number, h: number }}
 * why: lessons/kit-participant.md#fit
 */
export function fit(W, H, n, ar = 16 / 9, gap = 4) {
  let best = { cols: 1, rows: 1, w: 0, h: 0 };
  if (n < 1 || W <= 0 || H <= 0) return best;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    let w = (W - gap * (cols - 1)) / cols;
    let h = w / ar;
    if (h * rows + gap * (rows - 1) > H) { h = (H - gap * (rows - 1)) / rows; w = h * ar; }
    if (w * h > best.w * best.h) best = { cols, rows, w: Math.floor(w), h: Math.floor(h) };
  }
  return best;
}

/**
 * The tile shape for a box: a wide box gets 16:9 tiles, a tall one (a phone held upright) 3:4,
 * because a phone's camera is upright too and a cover crop of it loses less.
 * why: lessons/kit-participant.md#aspect
 */
export const tileAspect = (W, H) => (W >= H ? 16 / 9 : 3 / 4);

/**
 * The grid of tiles. It measures itself, so it fits wherever it sits.
 * @param {object} [o]
 * @param {number} [o.gap]       px between tiles and around them, 0 by default: the tiles fill the box
 * @param {number} [o.minW]      below this tile width the grid scrolls instead of shrinking
 * @param {string} [o.empty]     what an empty grid says
 * @returns {{ el: HTMLElement, add: (t) => void, remove: (t) => void, tiles: () => object[],
 *   layout: () => object, last: () => object }}
 * why: lessons/kit-participant.md#grid
 */
export function createParticipantGrid({ gap = 0, minW = 120, empty = 'nobody yet' } = {}) {
  style();
  const root = el('div', 'pos-ptg');
  root.style.setProperty('--ptg-gap', `${gap}px`);
  const none = el('div', 'pos-ptg-empty', empty);
  root.append(none);
  const list = [];
  let last = { cols: 0, rows: 0, w: 0, h: 0, n: 0, scroll: false, perRow: [] };

  function layout() {
    const n = list.length;
    none.hidden = n > 0;
    if (!n) { root.style.removeProperty('--ptg-cols'); root.style.removeProperty('--ptg-rows'); last = { ...last, n: 0, perRow: [] }; return last; }
    const W = root.clientWidth - 2 * gap, H = root.clientHeight - 2 * gap;
    const ar = tileAspect(W, H);
    const f = fit(W, H, n, ar, gap);
    // Too small to tell faces apart: keep a floor and scroll down the rest.
    const scroll = f.w < minW && W >= minW;
    let rows, perRow;
    if (scroll) {
      const cols = Math.max(1, Math.floor((W + gap) / (minW + gap)));
      rows = Math.ceil(n / cols);
      perRow = Array.from({ length: rows }, (_, i) => Math.min(cols, n - i * cols));
    } else {
      // fit() picks how many rows; the tiles are shared out as evenly as they go, longer rows first.
      rows = f.rows;
      const base = Math.floor(n / rows), extra = n % rows;
      perRow = Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
    }
    // One track per slot of a common multiple, so a row of 2 and a row of 3 both fill the width.
    const lcm = perRow.reduce((m, k) => { let a = m, b = k; while (b) [a, b] = [b, a % b]; return (m * k) / a; }, 1);
    const rowH = scroll ? Math.floor((W - gap * (perRow[0] - 1)) / perRow[0] / ar) : (H - gap * (rows - 1)) / rows;
    root.classList.toggle('scroll', scroll);
    root.style.setProperty('--ptg-cols', `repeat(${lcm}, minmax(0, 1fr))`);
    root.style.setProperty('--ptg-rows', scroll ? `repeat(${rows}, ${rowH}px)` : `repeat(${rows}, minmax(0, 1fr))`);
    let k = 0;
    perRow.forEach((m) => { for (let i = 0; i < m; i++) list[k++].el.style.setProperty('--pt-span', String(lcm / m)); });
    const cols = Math.max(...perRow);
    last = { cols, rows, w: Math.floor((W - gap * (cols - 1)) / cols), h: Math.floor(rowH), n, scroll, perRow, ar: +ar.toFixed(3) };
    return last;
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => layout()).observe(root);

  return {
    el: root,
    add(t) { if (!list.includes(t)) { list.push(t); root.append(t.el); } layout(); },
    remove(t) { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); t.el.remove(); t.el.style.removeProperty('--pt-span'); layout(); },
    tiles: () => [...list],
    layout,
    last: () => last,
  };
}
