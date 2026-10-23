// demo/shell/bar.mjs: a bar is a layout. A strip with three slots, start (what you do), middle (what is so) and end
// (what you choose), one padding and one height, as a panel's header or footer or on its own. It knows nothing about
// time: a transport is demo/shell/transport-control.mjs, its buttons are demo/shell/transport-views.mjs.
// why: lessons/kit-bar.md#header

import { el } from './shell.mjs';
import { setIcon } from './icon-button.mjs';

/**
 * @param {object} [o]
 * @param {Element[]} [o.start]   what you do: play, record, Start OBS, ‹ ›
 * @param {Element[]} [o.middle]  what is so: a clock, a scrub, a status, a live badge
 * @param {Element[]} [o.end]     what you choose: rate, loop, scene, patch; pushed to the far end
 * @param {string} [o.cls]        a page's own class beside `tbar`
 * @returns {{ el: HTMLElement, set(slot: 'start'|'middle'|'end', items: Element[]): void }}
 * why: lessons/kit-bar.md#slots
 */
export function createBar({ start = [], middle = [], end = [], cls = '' } = {}) {
  const bar = el('div', `tbar${cls ? ` ${cls}` : ''}`);
  const slots = { start: [...start], middle: [...middle], end: [...end] };
  function draw() {
    for (const x of [...slots.start, ...slots.middle, ...slots.end]) delete x.dataset.end;
    // The first end item takes the gap in the middle of the row, so a bar with no scrub still spreads.
    const first = slots.end.find(Boolean);
    if (first) first.dataset.end = '1';
    bar.replaceChildren(...slots.start, ...slots.middle, ...slots.end);
  }
  draw();
  return {
    el: bar,
    set(slot, items) {
      if (!(slot in slots)) throw new Error(`createBar: no slot called ${slot} (start, middle, end)`);
      slots[slot] = [...items];
      draw();
    },
  };
}

/**
 * The one button on a bar. A word, a glyph or a kit icon by name; `onPress` only.
 * `.tbar-x` is pressed by demo/verify.mjs; `press: false` gives `.tbar-slot`, which it never presses
 * (a full screen button would spoil every check after it).
 * @param {object} o
 * @param {string} [o.label]    the word, or a glyph
 * @param {string} [o.icon]     a kit icon (icon-button.mjs) instead of a label
 * @param {string} [o.aria]     what a screen reader and a check read; required with an icon or a glyph
 * @param {string} [o.title]
 * @param {boolean} [o.word]    a word, sized by its text rather than the square
 * @param {boolean} [o.primary]
 * @param {boolean} [o.press]   false: the harness must not press it
 * @param {(btn: HTMLButtonElement) => void} [o.onPress]
 * why: lessons/kit-bar.md#bar-button
 */
export function barButton({ label = '', icon = '', aria, title, word = false, primary = false, press = true, onPress, ...rest } = {}) {
  if ('onClick' in rest) throw new Error('barButton: onPress, not onClick (a misspelled handler is a silent dead button)');
  const b = el('button', `${press ? 'tbar-x' : 'tbar-slot'}${primary ? ' pos-pri' : ''}${word ? ' tbar-word' : ''}`,
    icon ? '' : label, { type: 'button' });
  const name = aria ?? label;
  if (!name) throw new Error('barButton: a button needs a label or an aria name');
  if (icon) setIcon(b, icon, name);
  else b.setAttribute('aria-label', name);
  if (title) b.title = title;
  if (onPress) b.addEventListener('click', () => onPress(b));
  return b;
}
