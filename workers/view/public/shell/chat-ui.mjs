// demo/shell/chat-ui.mjs: the chat's pieces for every page that draws one: createChatLog, createChatSign,
// createChatCompose, createChatColumn, createChatWindow and createChatGrid (one to six cells).
// Nothing here opens anything: a page wires the send and the arrivals.
// why: lessons/kit-chat-ui.md#header

import { el } from './shell.mjs';
import { createVideoPanel } from './video-panel.mjs';
import { createField } from './field.mjs';
import { createIconButton } from './icon-button.mjs';

const CSS = `
  .pos-chat { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr);
              gap: 1px; background: var(--line); }
  .pos-chat.two { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  .pos-chat > * { min-width: 0; min-height: 0; background: var(--card); display: flex; flex-direction: column; }
  .pos-chat-h { margin: 0; padding: 12px 16px 0; }

  .pos-chat-log { flex: 1 1 auto; min-height: 0; overflow-y: auto;
                  display: flex; flex-direction: column; gap: 12px; padding: 12px 16px 14px; }
  .pos-chat-log > :first-child { margin-top: auto; }
  .pos-chat-msg { display: flex; flex-direction: column; gap: 3px; }
  .pos-chat-msg-h { display: flex; gap: 10px; align-items: baseline; }
  .pos-chat-who { font: 500 12px/1.3 var(--mono); color: var(--fg); }
  .pos-chat-when { font: 400 11px/1.3 var(--mono); color: var(--dim2); }
  .pos-chat-text { margin: 0; font-size: 14px; line-height: 1.45; color: var(--dim);
                   overflow-wrap: anywhere; white-space: pre-wrap; }
  /* Your own name, in the column's ink: the site yellow unless a column says otherwise. */
  .pos-chat-msg.me .pos-chat-who { color: var(--chat-ink, var(--hi)); }

  /* One line on show: centred both ways in what is left of the column,
     balanced, at most 32 characters and 70 per cent of the area a line,
     newlines kept, long words broken, scrolling only past the area. */
  .pos-chat-sign { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column;
                   align-items: center; justify-content: safe center; padding: 16px 24px; text-align: center;
                   container-type: inline-size; }
  /* The type is the window's 18 to 28 px, capped by the sign's own box (9cqi,
     floor 12 px), so a sign in a sixth of a phone grid does not break words
     in half or spill. In a window the box is the wider one and nothing changes.
     Safe centring, so a sign longer than its box scrolls from its first line
     rather than being cut at the top. */
  .pos-chat-sign-t { margin: 0; max-width: min(32ch, 70%); font: 600 max(12px, min(max(18px, 3vw), 28px, 9cqi))/1.3 var(--brand);
                     color: var(--fg); text-wrap: balance; overflow-wrap: anywhere; white-space: pre-line; }

  /* The send button sits INSIDE the field with one inset on its three sides
     and a radius concentric with the field's (asked 2026-10-11 with a crop,
     *"adjust botton-in-field paddings and radius to fi in"*). Before, the one
     line field was 35.6 px for a 26 px button at 6 px from the right and the
     bottom, which left 3.6 px above it, and both carried the same 4 px radius.
     Now: one line is 26 + 2 x --send-in tall, the button is --send-in in from
     the field's outer edge, and the field's radius is the button's plus the
     inset, so the two corners share a centre. */
  .pos-chat-compose { --send-in: 4px; position: relative; padding: 10px 12px 12px; }
  .pos-chat-compose[hidden] { display: none; }
  .pos-chat-compose .pos-field { display: block; margin: 0; }
  /* .pos-field.tall textarea is (0,2,1); this matches it and wins on order. */
  .pos-chat-compose .pos-field textarea { display: block; width: 100%; resize: none; overflow-y: hidden;
                         max-height: calc(6 * 1.45em + 16px); padding-right: 44px; line-height: 1.45;
                         box-sizing: border-box; min-height: calc(var(--ctl-sm) + 2 * var(--send-in));
                         padding-top: 6px; padding-bottom: 6px; border-radius: calc(var(--r) + var(--send-in)); }
  .pos-chat-compose .pos-field textarea:focus-visible { border-color: var(--chat-ink, var(--hi)); }
  .pos-chat-send { position: absolute; right: calc(12px + var(--send-in)); bottom: calc(12px + var(--send-in));
                   border-radius: var(--r); }

  /* A column paints its own ground, wherever it sits (a window or a grid). */
  .pos-chat-col { min-width: 0; min-height: 0; background: var(--card); display: flex; flex-direction: column; }

  /* ── the grid of one to six cells, lifted from /typist/score/ ─────
     ONE GRID OF SIX TRACKS, so every count is a span and nothing is typed
     per layout: 1 spans all six, 2 span three, 3 span two, 4 span three
     (two by two), 6 span two (three by two). 5 IS THREE OVER TWO, THE TWO
     WIDER, not a three by two with a hole: an empty cell over the seam ground
     reads as a cell that failed to load. Rows share the height. NO SEAM: the
     cells meet edge to edge, always (asked on /typist/score/: *"no
     borders between typists papers"*, then *"seam aleays false, no
     setting"*). The line coloured ground stays under them, and every cell
     paints its own. */
  .pos-chat-grid { position: absolute; inset: 0; container: pos-chat-grid / size; }
  .pos-chat-cells { width: 100%; height: 100%; display: grid; gap: 0; background: var(--line);
                    grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); }
  .pos-chat-cells > * { min-width: 0; min-height: 0; grid-column: span 2; }
  .pos-chat-cells[data-n="1"] > * { grid-column: span 6; }
  .pos-chat-cells[data-n="2"] > *, .pos-chat-cells[data-n="4"] > * { grid-column: span 3; }
  .pos-chat-cells[data-n="5"] > :nth-child(n + 4) { grid-column: span 3; }
  /* A narrow FRAME, which is a phone (it asks its own box, so a full screen
     phone in landscape gets the desk layout): one, two and three stack in one
     column, four and six go two by two and two by three, and five is two, two
     and one across. Never three columns on a phone. */
  @container pos-chat-grid (max-width: 560px) {
    .pos-chat-cells > *, .pos-chat-cells[data-n] > * { grid-column: span 3; }
    .pos-chat-cells[data-n="1"] > *, .pos-chat-cells[data-n="2"] > *, .pos-chat-cells[data-n="3"] > *,
    .pos-chat-cells[data-n="5"] > :nth-child(5) { grid-column: span 6; }
  }
  /* The frame's shape: 16:9 while the cells sit in one row (1 to 3), 4:3 once
     there are two (4 to 6), so a cell is still wider than tall. A phone gets a
     tall frame, 4:5 for one and 3:4 for more, because it stacks rather than
     squeezing columns. Through the panel's own custom property, so its full
     screen rule still wins. The frame cannot ask its own width for its own
     height, so this one is the window's. */
  .pos-chat-gwin[data-n="4"] .pos-vp-stage, .pos-chat-gwin[data-n="5"] .pos-vp-stage,
  .pos-chat-gwin[data-n="6"] .pos-vp-stage { --vp-aspect: 4 / 3; }

  /* A phone stacks two columns, each half a taller stage. After the base rules. */
  @media (max-width: 560px) {
    .pos-chat-win.two .pos-vp-stage { --vp-aspect: 3 / 5; }
    .pos-chat-win.one .pos-vp-stage { --vp-aspect: 4 / 5; }
    .pos-chat.two { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
    .pos-chat-gwin[data-n] .pos-vp-stage { --vp-aspect: 3 / 4; }
    .pos-chat-gwin[data-n="1"] .pos-vp-stage { --vp-aspect: 4 / 5; }
  }
  /* \`fixed: true\`: one shape at every count, so the frame keeps its height as
     cells come and go (asked on /typist/score/: *"keep aspect ratio / h
     on all typist couts"*). 16:9 at the desk, 3:4 on a phone. (0,4,0) and
     after everything above, so it wins over every per-count rule. */
  .pos-chat-gwin.pos-chat-fixed[data-n] .pos-vp-stage { --vp-aspect: 16 / 9; }
  @media (max-width: 560px) { .pos-chat-gwin.pos-chat-fixed[data-n] .pos-vp-stage { --vp-aspect: 3 / 4; } }
`;
let styled = false;
const style = () => {
  if (styled) return;
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
  styled = true;
};
const clock = (at = Date.now()) => new Date(at).toTimeString().slice(0, 5);

/** Lines, newest at the bottom. `add({ who, at, text, me })`. */
export function createChatLog() {
  style();
  const box = el('div', 'pos-chat-log');
  return {
    el: box,
    add({ who, at, text, me = false }) {
      const m = el('div', `pos-chat-msg${me ? ' me' : ''}`);
      const h = el('div', 'pos-chat-msg-h');
      h.append(el('span', 'pos-chat-who', who), el('span', 'pos-chat-when', clock(at)));
      m.append(h, el('p', 'pos-chat-text', text));
      box.append(m);
      box.scrollTop = box.scrollHeight;
    },
    clear() { box.replaceChildren(); },
  };
}

/** One line on show, a new one replaces it. `add({ text })`. */
export function createChatSign() {
  style();
  const box = el('div', 'pos-chat-sign');
  const t = el('p', 'pos-chat-sign-t', '');
  box.append(t);
  return {
    el: box,
    add({ text }) { t.textContent = text; },
    clear() { t.textContent = ''; },
    text: () => t.textContent,
  };
}

/**
 * The compose box. Hidden and off until `enable(true)`.
 * @param {object} o
 * @param {string} o.placeholder  what the box says when on
 * @param {(text: string) => void} o.onSend
 * @param {string} [o.label]      the accessible name, the placeholder by default
 */
export function createChatCompose({ placeholder, onSend, label = placeholder } = {}) {
  style();
  const wrap = el('div', 'pos-chat-compose');
  const field = createField({ rows: 2, placeholder });
  const ta = field.input;
  ta.rows = 1;
  ta.setAttribute('aria-label', label);
  const grow = () => {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
    ta.style.overflowY = ta.scrollHeight > ta.clientHeight + 2 ? 'auto' : 'hidden';
  };
  const b = createIconButton({ icon: 'send', label: 'Send', small: true, onPress: () => send() });
  b.el.classList.add('pos-chat-send');
  const send = () => {
    const text = ta.value.trim();
    if (!text || ta.disabled) return;
    onSend(text);
    field.set('');
    grow();
    ta.focus();
  };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  let on = null;
  const enable = (v) => {
    if (v === on) return;
    on = v;
    field.disabled(!v);
    b.el.disabled = !v;
    wrap.hidden = !v;
    // a box that was hidden measured 0 tall, so it measures again once it shows
    requestAnimationFrame(grow);
    if (v) ta.focus();
  };
  enable(false);
  wrap.append(field.el, b.el);
  return { el: wrap, input: ta, enable, enabled: () => !!on };
}

/**
 * A heading, a body and an optional compose box.
 * @param {object} o
 * @param {string} [o.title]
 * @param {{ el: Element }} o.body       a chat log or a chat sign
 * @param {{ el: Element }} [o.compose]
 * @param {string} [o.ink]               colour of your own name and the focus edge
 */
export function createChatColumn({ title = '', body, compose = null, ink = '' } = {}) {
  style();
  const col = el('div', 'pos-chat-col');
  if (ink) col.style.setProperty('--chat-ink', ink);
  const head = el('h3', 'pos-sec-h pos-chat-h', title);
  head.hidden = !title;
  col.append(head, body.el, ...(compose ? [compose.el] : []));
  return {
    el: col,
    title(t) { head.textContent = t; head.hidden = !t; },
  };
}

/**
 * The frame: the kit's video panel with the chat as its picture.
 * @param {object} o
 * @param {Array<{ el: Element }>} o.columns  one or two
 * @param {Element|false} [o.footer]          the footer's left slot
 */
export function createChatWindow({ columns = [], footer = false } = {}) {
  style();
  const two = columns.length > 1;
  const grid = el('div', `pos-chat${two ? ' two' : ''}`);
  grid.append(...columns.map((c) => c.el));
  const panel = createVideoPanel({ left: footer, fullMode: 'footer' });
  panel.el.classList.add('pos-chat-win', two ? 'two' : 'one');
  panel.stage.append(grid);
  return { el: panel.el, panel, grid };
}

export const CHAT_GRID_MAX = 6;

/**
 * One to six equal cells in the kit's video panel, the multi typer's layout
 * (/typist/score/). A separate piece from the window rather than a
 * window with N columns, because the window's two columns are a CLAIM that one
 * is the main thing and the other a third wide beside it, and N equal cells
 * are the opposite claim.
 * @param {object} o
 * @param {Array<{ el: Element, draw?: () => void }>} o.cells  up to six; `draw`
 *        is called after a cell is placed, for a cell that measures itself
 * @param {number} [o.count]   how many to show at the start, all by default
 * @param {Element|false} [o.left]    the footer's left slot
 * @param {Element|null} [o.centre]   the footer's centre slot
 * @returns {{ el: Element, panel: object, grid: Element, set: (n: number) => number, count: () => number }}
 */
export function createChatGrid({ cells = [], count = cells.length, left = false, centre = null, fixed = false } = {}) {
  style();
  if (cells.length > CHAT_GRID_MAX) throw new Error(`createChatGrid: at most ${CHAT_GRID_MAX} cells, got ${cells.length}`);
  const grid = el('div', 'pos-chat-cells');
  const frame = el('div', 'pos-chat-grid');
  frame.append(grid);
  const panel = createVideoPanel({ left, centre, fullMode: 'footer' });
  panel.el.classList.add('pos-chat-gwin');
  if (fixed) panel.el.classList.add('pos-chat-fixed');
  panel.stage.append(frame);
  let n = 0;
  const set = (want) => {
    n = Math.min(cells.length, Math.max(1, Math.floor(want) || 1));
    grid.dataset.n = String(n);
    panel.el.dataset.n = String(n);
    const shown = cells.slice(0, n);
    grid.replaceChildren(...shown.map((c) => c.el));
    for (const c of shown) c.draw?.();
    return n;
  };
  set(count);
  return { el: panel.el, panel, grid, set, count: () => n };
}
