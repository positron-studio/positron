// demo/shell/transport-views.mjs: the buttons and readouts of a transport, each a picture of a control
// (transport-control.mjs) that sends it a command and decides nothing. `send(what, arg)` defaults to the control
// itself; a page with a bay passes the `send` from transportOnBay, so every press travels a drawn link.
// Classes are the old bar's (`.tbar-toggle`, `.tbar-time`, `.tbar-scrub`, `.tbar-rates`, `.tbar-loop`), so
// shell.css and the harness keep working. Moved out of transport-bar.mjs 2026-10-23 (plans/plan-bars.md).
// why: lessons/kit-bar.md#views

import { el } from './shell.mjs';
import { createChoice } from './choice.mjs';
import { icon } from './icons.mjs';
import { createPresence } from './presence.mjs';
import { WAY_GLYPH, WAY_SAYS } from './looper.mjs';
import { clock } from './transport-control.mjs';

const sender = (control, send) => send || ((what, arg) => control.run(what, arg));

/**
 * The play button. `verb`: 'play' (play/pause), 'stop' (play/stop and rewind), 'record' (record/stop), or two
 * words. Every face is in the button and shell.css shows one from `data-state` (#faces, #verb).
 */
export function playToggle(control, { verb = 'play', send } = {}) {
  const go = sender(control, send);
  const WORDS = Array.isArray(verb) ? verb : null;
  if (WORDS && (WORDS.length !== 2 || WORDS.some((w) => typeof w !== 'string' || !w.trim()))) {
    throw new Error(`playToggle: verb as words is exactly two non-empty strings (got ${JSON.stringify(verb)})`);
  }
  const RECORD = verb === 'record', STOPS = verb === 'stop';
  const b = el('button', `tbar-toggle${RECORD ? ' tbar-rec' : ''}${STOPS ? ' tbar-stop' : ''}${WORDS ? ' tbar-word' : ''}`, '',
    { type: 'button', 'aria-label': WORDS ? `${WORDS[0]}/${WORDS[1]}` : RECORD ? 'record/stop' : STOPS ? 'play/stop' : 'play/pause' });
  if (WORDS) b.append(el('span', 'tbar-w0', WORDS[0]), el('span', 'tbar-w1', WORDS[1]));
  else {
    const FACES = RECORD ? { rest: 'record', playing: 'stop', ended: 'record', buffering: 'clock' }
      : { rest: 'play', playing: STOPS ? 'stop' : 'pause', ended: 'refresh', buffering: 'clock' };
    b.classList.add('pos-icobtn');
    b.dataset.glyph = '1';
    for (const [face, name] of Object.entries(FACES)) { const svg = icon(name, { size: 16 }); svg.dataset.face = face; b.append(svg); }
  }
  b.addEventListener('click', () => go('toggle'));
  const paint = () => { b.dataset.state = control.rolling ? 'playing' : control.atEnd ? 'ended' : 'paused'; };
  const off = control.subscribe(paint);
  paint();
  return { el: b, destroy: off };
}

/** The clock, two lines (#two-line-clock); `fmt(pos, range)` gets the whole line (#fmt). */
export function clockView(control, { fmt = null, absolute = false } = {}) {
  const out = el('output', 'tbar-time');
  const now = el('span', 'tbar-now', '0:00.000'), all = el('span', 'tbar-all', '');
  out.append(now, all);
  const paint = () => {
    const p = control.pos, r = control.range;
    if (fmt) { now.textContent = fmt(p, r); all.textContent = ''; return; }
    now.textContent = clock(p, absolute);
    all.textContent = control.seekable ? clock(r[1] - r[0], false) : '';
  };
  const off = control.subscribe(paint);
  paint();
  return { el: out, destroy: off };
}

/** The position slider: seeks while dragging, one seek per frame (#scrub-live). Not drawn for an endless deck. */
export function scrubView(control, { send } = {}) {
  const go = sender(control, send);
  const scrub = el('div', 'tbar-scrub', '', { role: 'slider', tabindex: '0', 'aria-label': 'position' });
  const fill = el('div', 'tbar-fill'), head = el('div', 'tbar-head'), span = el('div', 'tbar-loopspan');
  span.hidden = true;
  scrub.append(span, fill, head);
  let dragging = false, pending = null, raf = 0;
  const frac = (p) => { const [a, b] = control.range; return b > a ? Math.min(1, Math.max(0, (p - a) / (b - a))) : 0; };
  const toPos = (f) => { const [a, b] = control.range; return a + f * (b - a); };
  const at = (e) => { const r = scrub.getBoundingClientRect(); const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); fill.style.width = head.style.left = `${f * 100}%`; return toPos(f); };
  const live = (p) => { pending = p; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (pending !== null) go('seek', pending); pending = null; }); };
  const end = () => { dragging = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } pending = null; };
  scrub.addEventListener('pointerdown', (e) => { dragging = true; try { scrub.setPointerCapture(e.pointerId); } catch { /* synthetic */ } live(at(e)); });
  scrub.addEventListener('pointermove', (e) => { if (dragging) live(at(e)); });
  scrub.addEventListener('pointerup', (e) => { if (!dragging) return; const p = at(e); end(); go('seek', p); });
  scrub.addEventListener('pointercancel', end);
  const paint = () => {
    if (!dragging) { const f = frac(control.pos); fill.style.width = head.style.left = `${f * 100}%`; }
    const l = control.loop;
    span.hidden = !l;
    if (l) { const fa = frac(l[0]), fb = frac(l[1]); span.style.left = `${Math.min(fa, fb) * 100}%`; span.style.width = `${Math.abs(fb - fa) * 100}%`; }
  };
  const off = control.subscribe(paint);
  paint();
  return { el: scrub, destroy: off };
}

/** The rates the deck can play at, a segmented choice; nothing for a lattice of one (#lattice-of-one). */
export function ratesView(control, { send } = {}) {
  const go = sender(control, send);
  const box = el('div', 'tbar-rates');
  let choice = null, lattice = null, wasSettling = null;
  const build = () => {
    lattice = control.lattice;
    box.replaceChildren(); choice = null; wasSettling = null;
    if (lattice && lattice.length > 1) {
      choice = createChoice({ options: lattice.map((r) => [String(r), r]), at: Math.max(0, lattice.indexOf(control.targetRate ?? 1)), onPick: (r) => go('rate', r) });
      choice.buttons.forEach((b, i) => { b.dataset.rate = String(lattice[i]); });
      box.append(choice.el);
    }
  };
  const sync = () => {
    if (!choice || !lattice) return;
    const i = lattice.indexOf(control.targetRate);
    if (i >= 0) choice.set(i, true); else choice.buttons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
  };
  const off = control.subscribe((why) => {
    if (why === 'lattice') { build(); sync(); return; }
    if (why === 'rate' || why === 'state') sync();
    if (choice) { const s = control.settling; if (s !== wasSettling) { wasSettling = s; choice.pending(s ? choice.get() : null); } }
  });
  build(); sync();
  return { el: box, destroy: off };
}

/**
 * Loop: one button pressed three times, start, end, off (#loop-button), with the direction button glued to it when
 * the control does loop ways, and a page's own loop extras beside it, shown while a loop runs unless `always`.
 */
export function loopView(control, { send, extras = [] } = {}) {
  const go = sender(control, send);
  const btn = el('button', 'tbar-loop tbar-word', 'Loop', { type: 'button', 'aria-label': 'loop' });
  btn.addEventListener('click', () => go('loop'));
  btn.disabled = !control.seekable;
  btn.title = !control.seekable ? 'this source has no end to come back to'
    : control.live ? 'press to hold the live sound from here. it closes and plays when the window is full, or press again to end it sooner'
    : 'press to mark where a loop starts, again to mark the end, again to take it off';
  const extraEls = new Map();
  const mk = (x) => {
    const b = el('button', 'tbar-x', x.label, { type: 'button', 'aria-label': x.aria || x.id, 'aria-pressed': 'false' });
    b.dataset.id = x.id;
    if (x.title) b.title = x.title;
    if (x.always) b.dataset.always = '1';
    b.hidden = !x.always;
    b.addEventListener('click', () => x.onPress?.(b));
    extraEls.set(x.id, b);
  };
  if (control.loopWays) mk({ id: 'way', label: WAY_GLYPH[control.way], always: true, aria: WAY_SAYS[control.way], title: WAY_SAYS[control.way], onPress: () => go('way') });
  for (const x of extras) mk(x);
  const root = extraEls.size ? el('div', 'tbar-loopgrp pos-seg') : btn;
  if (extraEls.size) root.append(btn, ...extraEls.values());
  let blinking = false, anim = null;
  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const blink = (on) => {
    if (on === blinking) return;
    blinking = on; anim?.cancel(); anim = null; btn.style.opacity = '';
    if (!on) return;
    if (!reduce?.matches) anim = btn.animate?.([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.49 }, { opacity: 0.24, offset: 0.5 }, { opacity: 0.24, offset: 1 }], { duration: 640, iterations: Infinity }) ?? null;
    if (!anim) btn.style.opacity = '0.62';
  };
  const paint = (why) => {
    blink(control.loopWarn);
    if (why === 'tick') return;
    const on = !!control.loop;
    btn.dataset.loop = on ? 'on' : control.loopA != null ? 'armed' : 'off';
    btn.setAttribute('aria-label', on ? 'looping. press to take the loop off'
      : control.loopFilling ? 'holding the live sound. press to end the loop here'
      : control.loopA != null ? 'press to mark where the loop ends' : 'loop');
    for (const b of extraEls.values()) if (!b.dataset.always) b.hidden = !on;
    // Only the control's own direction button; a page's extra may share the id.
    const w = control.loopWays ? extraEls.get('way') : null;
    if (w) { w.textContent = WAY_GLYPH[control.way]; w.title = WAY_SAYS[control.way]; w.setAttribute('aria-label', WAY_SAYS[control.way]); }
  };
  const off = control.subscribe(paint);
  paint('loop');
  return { el: root, button: btn, extra: (id) => extraEls.get(id) || null, destroy: () => { off(); blink(false); } };
}

/** What a live source's badge says: about the source, not the player (#on-air). */
export const ON_AIR = { online: 'on air', offline: 'off air', coming: 'tuning in', checking: 'checking', unknown: 'unknown' };
export const ON_AIR_CAN = ['online', 'coming', 'offline', 'unknown'];
/** The `on air` badge. Measured: the page calls `follow()` once and `seen()` when sound arrives (#live-chip). */
export function liveBadge() {
  return createPresence({ mode: 'badge', says: ON_AIR, can: ON_AIR_CAN, state: 'unknown' });
}

/** A degraded seek or rate says why, briefly, in the bar (#note). */
export function noteView(control) {
  const s = el('span', 'tbar-badge');
  const off = control.subscribe((why) => { if (why === 'note' || why === 'rate') s.textContent = control.note; });
  return { el: s, destroy: off };
}
