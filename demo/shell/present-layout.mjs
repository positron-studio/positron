// demo/shell/present-layout.mjs: the presentation layout every /present/<slug>/ page is a copy into. The concept
// page it copies stays as it is; the copy hands its own parts (the main picture, the line under it, the patch) to
// this and mounts with `chrome: false`. Keys and the raid view are present-keys.mjs.
// why: lessons/present-layout.md#header

import { el } from './shell.mjs';
import { createButtonGroup } from './button-group.mjs';
import { createPresentKeys } from './present-keys.mjs';

/** The presentation, in order: the arrows and the arrow keys walk it, round again at the ends. */
export const PAGES = ['/present/newsreels/', '/present/floor/', '/present/playback/', '/present/typists/', '/present/palmdrums/'];

const CSS = `
  :root { --pr-m: clamp(16px, 4vw, 48px); }
  html, body { background: #000; }
  /* the banner: a moving picture of the page again, blurred and dark, under everything (black until it moves) */
  .prl-banner { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; z-index: 10; display: block; background: #000;
    filter: blur(32px) brightness(.45) saturate(.7); transform: scale(1.1); transition: filter 1.2s; }
  body.prl-open .prl-banner { filter: blur(32px) brightness(.12) saturate(.7); }
  /* margin 0: the body is the shell's stack, whose rhythm would put a margin on top of a fixed layer and shorten it */
  .prl, .prl-banner { margin: 0; }
  .prl { position: fixed; inset: 0; z-index: 11; box-sizing: border-box; display: grid; gap: 0 var(--pr-m);
    padding: max(var(--pr-m), env(safe-area-inset-top)) max(var(--pr-m), env(safe-area-inset-right)) max(var(--pr-m), env(safe-area-inset-bottom)) max(var(--pr-m), env(safe-area-inset-left));
    grid-template-columns: minmax(16em, 1fr) minmax(0, 2.4fr); grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: "eye top" "head main" "foot foot"; }
  /* the overline shares the top row with the buttons, centred on them; the title and the main picture start one
     margin under that row, on one line, and the line is one margin under the picture */
  .prl-eye { grid-area: eye; align-self: center; }
  .prl-head, .prl-main { margin-top: var(--pr-m); }
  /* buttons under the words (a Play), one step under them */
  .prl-acts { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
  .prl-foot { margin-top: var(--pr-m); }
  .prl-head { grid-area: head; min-width: 0; }
  /* the box is the ink, so the capitals' tops meet the picture's top edge */
  .prl-head h1 { margin: 0; font: 600 clamp(34px, 4.4vw, 56px)/1.15 var(--mono); letter-spacing: 0; color: var(--fg); text-wrap: balance; text-box: trim-both cap alphabetic; }
  .prl-head p { margin: 1em 0 0; font: 400 clamp(16px, 1.5vw, 20px)/1.45 var(--sans); color: var(--dim); text-wrap: balance; }
  .prl-top { grid-area: top; justify-self: end; display: flex; gap: 12px; align-items: center; }
  .prl-top button { color: var(--fg); }
  .prl-top svg { width: 18px; height: 18px; flex: none; }
  .prl-top button.pos-lg { width: var(--ctl-lg); height: var(--ctl-lg); padding: 0; justify-content: center; }
  /* the main picture as large as its shape (--prl-aspect) and its footer (--prl-extra) allow, at the top right */
  .prl-main { grid-area: main; min-height: 0; container-type: size; display: grid; justify-items: end; align-items: start; }
  .prl-main.prl-main > * { width: min(100cqw, calc((100cqh - var(--prl-extra, 0px)) * var(--prl-aspect, 4 / 3))); }
  /* the line holds the bottom row; How it works stands on the same bottom edge and rises over the dimmed picture,
     out of flow so its height never takes the picture's room while it is closed */
  .prl-foot { grid-area: foot; position: relative; min-width: 0; }
  .prl-how { position: absolute; left: 0; right: 0; bottom: 0; }
  .prl-main { transition: filter 1.2s; }
  body.prl-open .prl-main { filter: brightness(.18); }
  .prl-line { transition: opacity .6s .6s, visibility 0s; }
  body.prl-open .prl-line { opacity: 0; visibility: hidden; transition: opacity .4s, visibility 0s .4s; }
  /* its height is all the room under the top bar (measured, fitHow), so the patch is never cut; the title gives way to it */
  .prl-how { opacity: 0; visibility: hidden; transition: opacity .4s, visibility 0s .4s; overflow-y: auto; }
  .prl-head { transition: opacity .6s .6s, visibility 0s; }
  body.prl-open .prl-head { opacity: 0; visibility: hidden; transition: opacity .4s, visibility 0s .4s; }
  body.prl-open .prl-how { opacity: 1; visibility: visible; transition: opacity .8s .8s, visibility 0s .8s; }
  /* no "patchbay" heading over the patch here (the owner, 2026-11-11), and no empty row where it was */
  .prl-how .pb-head > .pos-sec-h { display: none; }
  .prl-how .pb-head:not(:has(> :not(.pos-sec-h))) { display: none; }
  /* no picture of its own: the page draws under the whole layout (the floor), and presses on the empty parts reach it */
  .prl.prl-under, .prl-under .prl-head, .prl-under .prl-main { pointer-events: none; }
  .prl-under .prl-top, .prl-under .prl-foot, .prl-under .prl-acts, .prl-under .prl-how { pointer-events: auto; }
  /* a readable measure: about 60 characters a line, however wide the screen */
  /* the heading and the words start where the patch's boxes start (--prl-inset, measured), one margin above the patch */
  .prl-how .prl-how-h, .prl-how .prl-desc { margin-left: var(--prl-inset, 0px); }
  .prl-how .prl-how-h { margin-top: 0; margin-bottom: 12px; font: 600 clamp(22px, 2.4vw, 32px)/1.2 var(--mono); letter-spacing: 0; color: var(--fg); }
  .prl-how .prl-desc { margin-top: 0; margin-bottom: var(--pr-m); max-width: 32em; font: 400 clamp(18px, 1.9vw, 24px)/1.45 var(--sans); color: var(--fg); text-wrap: pretty; }
  @media (prefers-reduced-motion: reduce) { .prl-main, .prl-line, .prl-how, body.prl-open .prl-line, body.prl-open .prl-how { transition: none; } }
  /* a phone: one column that scrolls, the picture full width under the title */
  @media (max-width: 760px) {
    .prl { position: relative; inset: auto; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto auto auto;
      grid-template-areas: "eye top" "head head" "main main" "foot foot"; }
    .prl-main { margin-top: var(--pr-m); container-type: normal; justify-items: stretch; }
    .prl-main.prl-main > * { width: 100%; }
    /* the page scrolls, so How it works takes the line's place in the flow instead of rising over the picture */
    .prl-how { position: static; max-height: none; display: none; }
    body.prl-open .prl-head { opacity: 1; visibility: visible; }
    body.prl-open .prl-how { display: block; }
    body.prl-open .prl-line { display: none; }
  }
`;

/**
 * `createPresentLayout({ title, sub, desc, main, line, patch, aspect, extra, banner })`: `desc` is technical, how the patch
 * works: its nodes, which port links to which, the medium on each link and the transport where it leaves the machine.
 * `main` is the picture (a kit video panel, usually; null when the page draws under the whole layout itself), `aspect` its shape as a CSS ratio ('4 / 3') and `extra` the
 * height under the picture inside it (its footer, a CSS length). `line` goes across the bottom, `patch` is the
 * patchbay block How it works shows under `desc`. `banner`, a video or canvas, is redrawn blurred under everything
 * while `moving()` says it moves; it keeps its last frame until `blank()` says to clear it. Answers `{ root, setHow, how, keys, go }`.
 */
export function createPresentLayout({ title, sub = '', desc = '', main, line = null, patch = null, aspect = '4 / 3', extra = '0px',
  banner = null, moving = () => false, blank = () => false, onHow = () => {}, actions = [] }) {
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
  const eye = el('div', 'pos-hero-eye prl-eye');
  eye.append('POSITRON', el('b', '', '.'), 'STUDIO');
  const head = el('div', 'prl-head');
  head.append(el('h1', '', title), ...(sub ? [el('p', '', sub)] : []));
  if (actions.length) { const acts = el('div', 'prl-acts'); acts.append(...actions); head.append(acts); }

  let how = false;
  const howGroup = createButtonGroup({ buttons: [{ id: 'how', icon: 'info', label: 'How it works', onPress: () => setHow(!how) }] });
  howGroup.button('how').classList.add('pos-lg');
  howGroup.button('how').setAttribute('aria-expanded', 'false');
  function setHow(on) {
    how = !!on;
    document.body.classList.toggle('prl-open', how);
    howGroup.button('how').setAttribute('aria-expanded', String(how));
    howGroup.setIcon('how', how ? 'close' : 'info', how ? 'close How it works' : 'How it works');
    fitHow();
    onHow(how);
    requestAnimationFrame(alignHow);
  }
  // the patch picture insets its boxes from its own edge: the words take the same inset, so they line up with the boxes
  function alignHow() {
    const svg = howBox.querySelector('svg'), box = svg?.querySelector('rect');
    if (!box) return;
    const inset = box.getBoundingClientRect().left - howBox.getBoundingClientRect().left;
    howBox.style.setProperty('--prl-inset', `${Math.max(0, Math.round(inset))}px`);
  }
  // How it works rises from the bottom edge to one step under the top bar, measured on open and on resize
  function fitHow() {
    if (!how || getComputedStyle(howBox).position !== 'absolute') { howBox.style.maxHeight = ''; return; }
    const room = foot.getBoundingClientRect().bottom - top.getBoundingClientRect().bottom - 24;
    howBox.style.maxHeight = `${Math.max(160, Math.floor(room))}px`;
  }
  addEventListener('resize', () => { fitHow(); if (how) requestAnimationFrame(alignHow); });
  const here = PAGES.indexOf(location.pathname);
  const go = (by) => { const to = PAGES[((here < 0 ? 0 : here) + by + PAGES.length) % PAGES.length]; if (to !== location.pathname) location.href = to; };
  const arrows = createButtonGroup({ buttons: [
    { id: 'prev', icon: 'arrow-left', label: 'previous', onPress: () => go(-1) },
    { id: 'next', icon: 'arrow-right', label: 'next', onPress: () => go(1) },
  ] });
  for (const b of arrows.el.querySelectorAll('button')) b.classList.add('pos-lg');
  const top = el('div', 'prl-top');
  top.append(howGroup.el, arrows.el);

  const mainBox = el('div', 'prl-main');
  mainBox.style.setProperty('--prl-aspect', aspect);
  mainBox.style.setProperty('--prl-extra', extra);
  if (main) mainBox.append(main);
  const howBox = el('div', 'prl-how');
  howBox.append(el('h2', 'prl-how-h', 'How it works'), ...(desc ? [el('p', 'prl-desc', desc)] : []), ...(patch ? [patch] : []));
  const foot = el('div', 'prl-foot');
  if (line) { line.classList.add('prl-line'); foot.append(line); }
  foot.append(howBox);
  const root = el('div', `prl pres-ui${main ? '' : ' prl-under'}`);
  root.append(eye, top, head, mainBox, foot);

  const parts = [root];
  if (banner) parts.unshift(createBanner(banner, moving, blank));
  document.body.append(...parts);
  const keys = createPresentKeys({ prev: () => go(-1), next: () => go(1), escape: () => { if (how) setHow(false); } });
  if (new URLSearchParams(location.search).get('how') === '1') setHow(true);
  return { root, setHow, how: () => how, keys, go };
}

/** The banner: `src` redrawn at a tenth of the screen's size, ten times a second, only while `moving()`. */
function createBanner(src, moving, blank) {
  const cv = el('canvas', 'prl-banner');
  const g = cv.getContext('2d');
  let at = 0, on = false;
  const size = () => (src.videoWidth ? [src.videoWidth, src.videoHeight] : [src.width, src.height]);
  (function paint(t) {
    requestAnimationFrame(paint);
    const [sw, sh] = size();
    if (!moving() || !sw || !sh) { if (on && blank()) { g.clearRect(0, 0, cv.width, cv.height); on = false; } return; }
    if (document.hidden || t - at < 100) return;
    at = t;
    const w = Math.max(1, Math.round(innerWidth / 10)), h = Math.max(1, Math.round(innerHeight / 10));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const k = Math.max(w / sw, h / sh);
    try { g.drawImage(src, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k); on = true; } catch { /* not drawable yet */ }
  })(0);
  return cv;
}
