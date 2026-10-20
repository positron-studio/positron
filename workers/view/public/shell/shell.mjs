// Which build is this? workers/view/build.mjs replaces it in the deployed copy only,
// so a fix that did not work can be told from a fix that was never loaded.
// why: lessons/kit-shell.md#build-stamp
export const BUILD = 'bbd48118-152059-5e0c';
// demo/shell/shell.mjs: the page frame and the __demo contract. mount() builds the chrome
// and publishes on window.__demo everything it shows a human, for a CDP script.
//   const d = mount({ name:'transport', what:'...', readout:{drift:'ms'} }); d.set('drift', 0.4);
// why: lessons/kit-shell.md#header

// Every import in this file is a leaf: a dependency of the frame is a dependency of every page.
// why: lessons/kit-shell.md#leaf-imports
import { centreSymbol } from './symbol.mjs';
// stack.mjs makes its own element rather than importing el() from here, so no cycle.
// why: lessons/kit-shell.md#leaf-stack
import { createStack } from './stack.mjs';
// glue.mjs makes its own element too, so a report and a page share one glued surface.
// why: lessons/kit-shell.md#leaf-glue
import { createGlue } from './glue.mjs';

const LOG_CAP = 400;

export function mount({
  name = 'demo',
  what = '',
  // key -> unit string. `null` declares no readout on purpose (the subject is visible),
  // which the harness checks for; it is not the same as `{}`.
  // why: lessons/kit-shell.md#readout-null
  readout = {},
  showReadout = true,    // false: published on __demo, not drawn — see below
  // false: the log box is not appended at all and lines still reach __demo.logs.
  // An empty .pos-log would still paint its border.
  // why: lessons/kit-shell.md#show-log
  showLog = true,
  // The readout sits on top of the log as one glued surface at the foot by default.
  // `joined: false` is the opt-out, used only by /kit/ to show both arrangements.
  // why: lessons/kit-shell.md#joined
  joined = true,
  controls = [],         // [{id, label, primary?}]
  // the default is for the archived demos, which every page that is not passes its own
  index = '/archive/',
  indexLabel = 'archive',  // the word after the arrow; a concept page passes `positron`, the front page
  feedback = null,       // { context: () => string, onSent: (text) => void }: what a note carries from this page
} = {}) {
  document.title = `POSITRON ${name}`;
  favicon();
  markHeadset();

  const head = el('div', 'pos-head');
  if (index) head.append(el('a', 'pos-back', `← ${indexLabel}`, { href: index }));
  const title = el('div', 'pos-title');
  title.append(el('h1', 'pos-name', name));
  // Every shelled page gets the feedback button beside its title. It is not in
  // .pos-controls, because verify.mjs presses every control there on every run.
  // why: lessons/kit-shell.md#feedback-button
  const fbBtn = el('button', 'pos-fb-btn', 'Feedback', {
    type: 'button',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    title: 'say something about this page',
  });
  fbBtn.dataset.slug = name;
  // A scripted click has isTrusted false and does nothing, so only a person can send feedback.
  // aria-expanded flips past the gate, which is what the check below reads.
  // why: lessons/kit-shell.md#feedback-trusted
  fbBtn.addEventListener('click', async (e) => {
    if (!e.isTrusted) return;
    fbBtn.setAttribute('aria-expanded', 'true');
    try {
      // Imported on the press, so a panel nobody opens costs no page anything on load.
      // why: lessons/kit-shell.md#feedback-lazy
      const fb = await import('./feedback.mjs');
      fb.openFeedback({ log }, { slug: name, ...(feedback || {}) });
    } catch (err) {
      fbBtn.setAttribute('aria-expanded', 'false');
      log(`the feedback box did not load (${err?.message || err})`, 'bad');
    }
  });
  title.append(fbBtn);
  head.append(title);
  if (what) head.append(el('p', 'pos-what', what));


  // createReport() owns both arrangements; mount() owns the declaration and __demo.
  // showReadout: false publishes the numbers on __demo without drawing the row.
  // why: lessons/kit-shell.md#report
  const readoutOptOut = readout === null;
  if (readoutOptOut) readout = {};
  const report = createReport({ readout, showReadout, showLog, joined });
  const cells = report.cells;
  const logEl = report.logEl;

  const cbar = el('div', 'pos-controls');
  // An empty control row is hidden: .pos-controls still carries its 14 px margin.
  // why: lessons/kit-shell.md#empty-controls
  if (!controls.length) cbar.hidden = true;
  const handlers = new Map();
  // every control this shell made, by id, so `button(id)` survives a page
  // moving one somewhere else. See the note on `button` below.
  const made = new Map();
  for (const c of controls) {
    const b = el('button', c.primary ? 'pos-pri' : '', c.label);
    b.type = 'button';
    b.dataset.id = c.id;
    made.set(c.id, b);
    // A one-character non-letter label is a glyph and gets a square button.
    // The test is on the label, so a page cannot forget a flag.
    // why: lessons/kit-shell.md#glyph-button
    if ([...String(c.label)].length === 1 && !/[\p{L}\p{N}]/u.test(c.label)) {
      b.dataset.glyph = '1';
      // Centred on its ink, not its box: symbol.mjs measures the glyph in its face and moves it.
      // why: lessons/kit-shell.md#glyph-centre
      centreSymbol(b);
      // The label is a picture, so it is not a name. Without this the control
      // reads as "⛶" to a screen reader and to anything looking for it.
      b.setAttribute('aria-label', c.aria || 'full screen');
      if (!b.title) b.title = c.aria || 'full screen';
    }
    // `end: true` pushes a destructive control to the far right, away from the one that makes.
    // why: lessons/kit-shell.md#control-end
    if (c.end) b.dataset.end = '1';
    // A handler returning a promise makes the button busy (disabled, swept) until it settles.
    // No spinner or label change: both resize the button and move the row under the pointer.
    // why: lessons/kit-shell.md#control-busy
    b.addEventListener('click', async () => {
      const fn = handlers.get(c.id);
      if (!fn || b.disabled) return;
      let out;
      try { out = fn(b); } catch (e) { log(String(e?.message || e), 'bad'); return; }
      if (!out || typeof out.then !== 'function') return;
      b.dataset.busy = '1';
      b.disabled = true;
      b.setAttribute('aria-busy', 'true');
      try { await out; } catch (e) { log(String(e?.message || e), 'bad'); }
      finally {
        delete b.dataset.busy;
        b.disabled = false;
        b.removeAttribute('aria-busy');
      }
    });
    cbar.append(b);
  }

  const body = el('div', 'pos-body');

  /**
   * Two stacks: column is document.body, page is .pos-body. d.el.append(x) gets the rhythm,
   * and d.stack.add(...) states a page's order in one line. See stack.mjs.
   * why: lessons/kit-shell.md#two-stacks
   */
  const column = createStack(document.body);
  const page = createStack(body);

  // The order is the arrangement; createStack().add skips a null, so a joined page
  // is head, controls, page, report.
  // why: lessons/kit-shell.md#column-order
  column.add(head, report.top, cbar, body, report.foot);

  // ── the machine contract ────────────────────────────────────────────────
  const api = {
    name,
    ready: false,
    failed: null,
    /**
     * How many benign browser notices guard() swallowed (BENIGN_NOTICES).
     * The count is the only way to prove the filter fires.
     * why: lessons/kit-shell.md#muted
     */
    muted: 0,
    readout: Object.fromEntries(Object.keys(readout).map((k) => [k, null])),
    // the DECLARATION, so a harness can tell "no cells on purpose" from "none yet"
    readoutOptOut,
    // the DECLARATION again, so a check can tell "no log on purpose" from
    // "a log that never got a line"
    logOptOut: !showLog,
    how: null,
    logs: [],
    asserts: [],
    transport: null,           // filled by transport-bar when one is attached
  };
  window.__demo = api;

  // The second assert proves the isTrusted guard by pressing the button as a script
  // and asserting nothing opened.
  // why: lessons/kit-shell.md#feedback-check
  assert('every page carries a feedback button, beside its title',
    head.contains(fbBtn) && fbBtn.dataset.slug === name, `.pos-head · ${name}`);
  fbBtn.click();
  assert('only a person can open it, so a harness press does nothing',
    fbBtn.getAttribute('aria-expanded') === 'false' && !document.querySelector('.pos-fb'),
    `a scripted press left it aria-expanded=${fbBtn.getAttribute('aria-expanded')}`);
  /**
   * How many asserts the shell made, so verify.mjs can wait for the page's own first one.
   * Without it a page making 34 asserts was collected as 2 and read green.
   * why: lessons/kit-shell.md#shell-asserts
   */
  api.shellAsserts = api.asserts.length;

  // setCell() and addLine() write the surface (shared with /kit/); these keep the
  // declaration check, the published value and the capped record.
  // why: lessons/kit-shell.md#set-and-log
  function set(k, value, state) {
    setCell(cells, k, value, state);      // throws if the page never declared it
    api.readout[k] = value;
    return value;
  }

  function log(msg, kind) {
    const line = { t: performance.now(), msg: String(msg), kind: kind || 'info' };
    api.logs.push(line);
    if (api.logs.length > LOG_CAP) api.logs.shift();
    addLine(logEl, line.msg, line.kind, line.t);
  }

  // A passing check writes no log line: the log is for things that happened.
  // A failure keeps its line; the tally goes out once, from ready().
  // why: lessons/kit-shell.md#assert-quiet
  function assert(label, pass, detail) {
    api.asserts.push({ label, pass: !!pass, detail: detail ?? null });
    // The detail is evidence for the label, so it goes on its own indented line, not a middot.
    // .pos-m is pre-wrap, so the newline shows.
    // why: lessons/kit-shell.md#assert-detail
    if (!pass) log(`FAIL ${label}${detail !== undefined ? `\n  ${detail}` : ''}`, 'bad');
    return !!pass;
  }

  const pageApi = {
    el: body,
    /**
     * The page's own blocks, as a stack: `d.stack.add(bar.el, picks, keys.el)`
     * states the order of a page in one line and gets the project's one gap
     * between every pair of them. `d.el` is the same element, so nothing that
     * appends to it has to change.
     */
    stack: page,
    /** The whole page column, for a block that has to sit OUTSIDE the page —
     *  above the control row, or under the log. Same rhythm, same number. */
    column,
    head,
    // The control row itself, so a page moves it rather than building a second one.
    // why: lessons/kit-shell.md#controls-row
    controls: cbar,
    /**
     * The two surfaces and the joined box (null when split), handed over because
     * d.el.querySelector('.pos-readout') cannot find a sibling of .pos-body.
     * why: lessons/kit-shell.md#report-surfaces
     */
    readoutEl: report.readoutEl,
    logEl: report.logEl,
    report: report.report,
    set, log, assert,
    // `how()` is gone. A demo's intro is now ONE paragraph of three or four
    // sentences in `what`, not a lead line plus a second paragraph of mechanism:
    // two blocks meant the mechanism went unread and the lead said too little.
    on: (id, fn) => handlers.set(id, fn),
    /**
     * Run a registered handler without a button, so running the checks need not be a control.
     * why: lessons/kit-shell.md#run
     */
    run: (id) => handlers.get(id)?.(),
    /**
     * A control this shell built, by id, wherever the page has moved it.
     * A map built at mount, because [data-id] is not unique to the control row.
     * why: lessons/kit-shell.md#button
     */
    button: (id) => made.get(id) || cbar.querySelector(`[data-id="${id}"]`),
    /** Empty the log and the `logs` array together. A control that clears what
     *  a page HOLDS should clear what the page SAID about it too, or the lines
     *  left behind describe a state that no longer exists. */
    clearLog: () => { api.logs.length = 0; logEl.textContent = ''; },
    ready: () => {
      api.ready = true;
      const n = api.asserts.length;
      const bad = api.asserts.filter((a) => !a.pass).length;
      // one line, and it is a real message: how many checks this page ran on
      // itself and whether any of them are worth scrolling up for
      log(n ? `ready, ${n - bad}/${n} checks` : 'ready', bad ? 'bad' : 'hi');
    },
    fail: (e) => { api.failed = String(e?.stack || e); log(String(e?.message || e), 'bad'); },
    api,
  };
  hear(pageApi);
  return pageApi;
}

/**
 * The readout and the log as one component. Joined (default): one glued surface at the foot.
 * Split: readout on top, log under the page. A surface with nothing in it is never appended.
 * It lives here because a module of its own would import shell.mjs back.
 * why: lessons/kit-shell.md#create-report
 */
export function createReport({
  readout = {}, showReadout = true, showLog = true, joined = true,
  rows = 0, size = '',
} = {}) {
  // A readout must have an even number of cells: cut the weakest, never pad with a blank.
  // It throws so the suite catches it before a visitor does.
  // why: lessons/kit-shell.md#even-cells
  const keys = Object.keys(readout);
  if (keys.length % 2) {
    throw new Error(
      `readout has ${keys.length} cells and wants an even number — ` +
      `drop the weakest one (${keys.join(', ')}), do not add a filler`);
  }

  const cells = new Map();
  const readoutEl = el('div', 'pos-readout');
  /**
   * `rows` names the shape and the columns fall out of the count. Above six cells rows are
   * automatic, ceil(n / 6), so eight is 4 and 4. A caller's own `rows` wins.
   * Set as a custom property so a stylesheet can still take it back.
   * why: lessons/kit-shell.md#rows
   */
  const MAX_PER_ROW = 6;
  const autoRows = keys.length > MAX_PER_ROW
    ? Math.ceil(keys.length / MAX_PER_ROW) : 0;
  const shapeRows = rows > 0 ? rows : autoRows;
  if (shapeRows > 0) {
    readoutEl.dataset.rows = String(shapeRows);
    readoutEl.style.setProperty('--ro-cols', String(Math.ceil(keys.length / shapeRows)));
  }
  // `sm` is a quieter value, not a smaller panel; the key stays 9.5 px.
  // why: lessons/kit-shell.md#readout-sm
  if (size === 'sm') readoutEl.classList.add('pos-readout-sm');
  // hidden, not absent: `/crate/` and `/videoradio/` both reach for this
  // element, and shell.css gives `.pos-readout[hidden]` an explicit
  // `display: none` because `display: flex` beats the UA's own `[hidden]` rule.
  if (!showReadout || !keys.length) readoutEl.hidden = true;
  for (const [k, unit] of Object.entries(readout)) {
    const cell = el('div', 'pos-cell');
    const v = el('span', 'pos-v', '');
    v.dataset.state = 'pending';
    cell.append(el('span', 'pos-k', k), v);
    // The unit is hidden by CSS while the cell is pending; it stays in the DOM for set().
    // why: lessons/kit-shell.md#pending-unit
    if (unit) v.append(el('span', 'pos-u', unit));
    cells.set(k, v);
    readoutEl.append(cell);
  }

  const logEl = el('pre', 'pos-log');

  const r = {
    joined, readoutEl, logEl, cells,
    report: null, top: null, foot: null,
    set: (k, value, state) => setCell(cells, k, value, state),
    line: (msg, kind, t) => addLine(logEl, msg, kind, t),
  };

  if (!joined) {
    // The readout goes on even when it is hidden: pages reach for it, and this
    // is exactly the DOM every page has had, element for element.
    r.top = readoutEl;
    r.foot = showLog ? logEl : null;
    return r;
  }

  // pos-glue is the shared look, pos-report this box's place. A hidden readout is still
  // handed over: three pages assert .pos-readout is present and paints nothing.
  // why: lessons/kit-shell.md#glue-report
  const rep = createGlue(readoutEl, showLog ? logEl : null);
  // With neither half to draw nothing is appended: an empty bordered box measured 2.0 px tall.
  // why: lessons/kit-shell.md#empty-report
  if (!readoutEl.hidden || showLog) {
    rep.classList.add('pos-report');
    r.report = rep; r.foot = rep;
  }
  return r;
}

/**
 * Write one readout cell. null, '' and NaN all print as an empty pending cell
 * with the unit hidden, never a dash and never a confident zero.
 * why: lessons/kit-shell.md#set-cell
 */
export function setCell(cells, k, value, state) {
  const v = cells.get(k);
  if (!v) throw new Error(`readout '${k}' was not declared in mount()`);
  const unit = v.querySelector('.pos-u');
  const blank = value === null || value === undefined || value === ''
    || (typeof value === 'number' && !Number.isFinite(value));
  v.textContent = blank ? ''
    : typeof value === 'number' ? fmtNum(value) : String(value);
  if (unit) v.append(unit);
  v.dataset.state = state || (blank ? 'pending' : '');
  return value;
}

/**
 * Write one log line as three grid cells, so a long message wraps in its own column.
 * why: lessons/kit-shell.md#add-line
 */
export function addLine(logEl, msg, kind, t) {
  const row = el('span', `pos-line${kind && kind !== 'info' ? ' ' + kind : ''}`);
  const at = (t ?? performance.now()) / 1000;
  row.append(el('span', 'pos-t', at.toFixed(2)));
  row.append(el('span', 'pos-m', String(msg)));
  logEl.append(row);
  // The same cap as `__demo.logs`, so the screen and the record agree.
  while (logEl.childElementCount > LOG_CAP) logEl.firstElementChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
  tapLine(at, msg, kind);
  return row;
}

/**
 * Every log line goes to the dev server's /_log on 127.0.0.1, and to the pub Worker
 * only with ?logs=1. Batched, keepalive, and silent when nothing listens.
 * why: lessons/kit-shell.md#tap
 */
const TAP_LOCAL = typeof location !== 'undefined'
  && /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname);
const TAP_FAR = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('logs') === '1';
let tapQueue = [];
let tapTimer = null;
let tapShip = null;

function tapFlush() {
  tapTimer = null;
  if (!tapQueue.length) return;
  const body = JSON.stringify({
    page: (typeof document !== 'undefined' && document.title) || '',
    url: location.pathname + location.search,
    build: BUILD,
    rows: tapQueue,
  });
  tapQueue = [];
  try {
    fetch('/_log', { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch { /* nothing is listening, and that is not this page's problem */ }
}

function tapLine(at, msg, kind) {
  // The Worker first, built on the first line so an unwatched page never constructs it.
  // why: lessons/kit-shell.md#tap-worker
  if (TAP_FAR) {
    tapShip = tapShip || createShipper();
    tapShip(`${kind && kind !== 'info' ? `[${kind}] ` : ''}${msg}`);
  }
  if (!TAP_LOCAL) return;
  tapQueue.push({ at: +at.toFixed(3), msg: String(msg), kind: kind || 'info' });
  if (tapQueue.length > 200) { tapFlush(); return; }
  if (tapTimer === null) tapTimer = setTimeout(tapFlush, 250);
}

if ((TAP_LOCAL || TAP_FAR) && typeof addEventListener === 'function') {
  // pagehide, not unload: unload may not fire and blocks the back/forward cache.
  // why: lessons/kit-shell.md#pagehide
  addEventListener('pagehide', tapFlush);
}

/**
 * The favicon (p.s), drawn by psIcons() in workers/view/build.mjs; declared here
 * so a page that declares nothing logs no 404 for it.
 * why: lessons/kit-shell.md#favicon
 */
function favicon() {
  if (document.querySelector('link[rel="icon"]')) return;
  document.head.append(el('link', '', null, { rel: 'icon', href: '/favicon.ico' }));
}

// ── helpers ───────────────────────────────────────────────────────────────
export function el(tag, cls, text, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  return e;
}

export function fmtNum(x) {
  if (!Number.isFinite(x)) return String(x);
  // a count is a count: 32, not 32.0
  if (Number.isInteger(x)) return Math.abs(x) >= 10000 ? x.toLocaleString('en-US') : String(x);
  const a = Math.abs(x);
  if (a >= 1000) return Math.round(x).toLocaleString('en-US');
  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);
  if (a >= 1) return x.toFixed(2);
  return x.toFixed(3);
}

/**
 * Arm a video inside the gesture: iOS grants autoplay only while the activation is live,
 * so play() is called before any await and keeps playing when a source arrives.
 * why: lessons/kit-shell.md#arm-video
 */
export function armVideo(v) {
  v.muted = true;                 // property, not just the attribute
  v.playsInline = true;
  v.autoplay = true;
  // rejects on an element with no source yet, which is fine and expected —
  // the point is to consume the activation, not to start anything
  try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch { /* no source */ }
}

/**
 * Play, and offer a tap only when the browser refused for policy (NotAllowedError).
 * Any other failure is the player's job.
 * why: lessons/kit-shell.md#play-or-prompt
 */
export async function playOrPrompt(v, d) {
  try { await v.play(); return true; } catch (e) {
    if (e.name !== "NotAllowedError") {
      d?.log(`play failed (${e.name}) — not a permission problem, leaving it to the player`, "bad");
      return false;
    }
    d?.log("autoplay refused — tap to start", "bad");
    const tap = el("button", "pos-tap", "tap to play");
    tap.type = "button";
    const go = async () => {
      try { await v.play(); tap.remove(); d?.log("playing"); }
      catch (err) { d?.log(`still refused: ${err.name}`, "bad"); }
    };
    tap.addEventListener("click", go);
    v.addEventListener("click", go);
    v.parentNode?.insertBefore(tap, v.nextSibling);
    return false;
  }
}

/**
 * Keep a <video> the shape of what is inside it: a stated ratio up front,
 * replaced by the real one on metadata and again on resize.
 * why: lessons/kit-shell.md#match-aspect
 */
export function matchAspect(v, fallback = '16 / 9') {
  const apply = () => {
    const w = v.videoWidth, h = v.videoHeight;
    v.style.aspectRatio = w && h ? `${w} / ${h}` : fallback;
  };
  apply();
  v.addEventListener('loadedmetadata', apply);
  v.addEventListener('resize', apply);          // the sender changed resolution
  return v;
}

export function recorderMime(d, kinds = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8',
  'video/webm', 'video/mp4;codecs=avc1.42E01E', 'video/mp4']) {
  const MR = window.MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== 'function') {
    d?.log('MediaRecorder is not available in this browser', 'bad');
    return null;
  }
  const mime = kinds.find((m) => MR.isTypeSupported(m)) || null;
  // report the CAPABILITY, never an error string — the lesson @moq/net taught
  if (mime) d?.log(`recording as ${mime}`);
  else d?.log(`no recordable format here — tried ${kinds.join(', ')}`, 'bad');
  return mime;
}

/**
 * Window error events that are not faults: exactly two spellings of the ResizeObserver
 * loop notice, matched whole. Anything else still lands in the log in red.
 * why: lessons/kit-shell.md#benign-notices
 */
export const BENIGN_NOTICES = new Set([
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
]);

/**
 * Is this window error one of the notices above? It also requires e.error to be absent.
 * why: lessons/kit-shell.md#benign-notice
 */
export function benignNotice(e) {
  return !e?.error && BENIGN_NOTICES.has(String(e?.message ?? ''));
}

// An uncaught error anywhere on a page marks it failed, from module load.
// One before mount() is kept and handed over then.
// why: lessons/kit-shell.md#uncaught
let heard = null, muted = 0;
const early = [];
function onError(err) {
  if (heard) { heard.fail(err); return; }
  early.push(err);
  if (!window.__demo) window.__demo = { ready: false, failed: String(err?.stack || err), asserts: [], logs: [], muted };
}
function hear(d) {
  heard = d;
  d.api.muted += muted; muted = 0;
  for (const err of early.splice(0)) d.fail(err);
}
if (typeof addEventListener === 'function' && typeof window !== 'undefined') {
  addEventListener('error', (e) => {
    // Counted rather than logged, so the filter can be proved to fire. See the
    // note on `muted` in the machine contract above.
    if (benignNotice(e)) { if (heard) heard.api.muted++; else muted++; return; }
    onError(e.error || e.message);
  });
  addEventListener('unhandledrejection', (e) => onError(e.reason));
}

/** Surface a thrown error instead of a silently dead page. mount() does this for every page now. */
export function guard(d) { if (heard !== d) hear(d); }

/**
 * Batched, fire-and-forget device reporting: POST /log, read back with GET /logs?format=text.
 * Failures swallowed, a 2 s batch and repeat collapsing, so diagnostics never hurt the page.
 * why: lessons/kit-shell.md#shipper
 */
export function createShipper(url = 'https://pub.positron.studio/log', { delayMs = 2000, post = null, beacon = null } = {}) {
  const pending = [];
  let timer = null, last = null, repeat = 0;
  const viaFetch = (body) => fetch(url, {
    method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' },
  }).catch(() => { /* diagnostics are never load-bearing */ });
  // A fetch started in pagehide can be cancelled with the page; a beacon is not.
  const viaBeacon = (body) => {
    try { if (navigator.sendBeacon?.(url, body)) return; } catch { /* fall back */ }
    viaFetch(body);
  };
  const send = post || viaFetch, sendLast = beacon || viaBeacon;
  function take() {
    clearTimeout(timer); timer = null;
    if (repeat) { pending.push(`  (previous line x${repeat + 1})`); repeat = 0; last = null; }
    return pending.splice(0, pending.length).join('\n');
  }
  const flush = () => { const b = take(); if (b) send(b); };
  const flushLast = () => { const b = take(); if (b) sendLast(b); };
  if (typeof addEventListener === 'function') {
    addEventListener('pagehide', flushLast);
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushLast(); });
  }
  return function ship(line) {
    // Only an identical line is a repeat: two lines sharing a prefix are two lines.
    line = String(line);
    if (line === last) repeat++;
    else {
      if (repeat) { pending.push(`  (previous line x${repeat + 1})`); repeat = 0; }
      last = line;
      pending.push(`${(performance.now() / 1000).toFixed(2)} ${line}`);
    }
    timer ??= setTimeout(flush, delayMs);
  };
}


/**
 * Give a demo the headset layout: the Quest Browser opens in desktop mode, ignores
 * <meta viewport> and is 1280 x 670 CSS px. Decided by capability, never user agent.
 * why: lessons/kit-shell.md#mark-headset
 */
async function markHeadset() {
  try {
    if (!navigator.xr?.isSessionSupported) return;
    if (await navigator.xr.isSessionSupported('immersive-vr')) {
      document.documentElement.classList.add('xr');
    }
  } catch { /* a browser that will not answer is not a headset we can style for */ }
}
