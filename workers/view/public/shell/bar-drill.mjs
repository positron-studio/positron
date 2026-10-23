// demo/shell/bar-drill.mjs: the harness's transport drill, run by a page against a bar it did not publish.
// Every number in `DRILL` must match demo/verify.mjs; bar-drill-test.mjs fails if they drift.
// The key goes to the bar's own element, not window; a bar in a closed tab cannot be drilled.
// why: lessons/kit-bar-drill.md#header

/** Every number the harness's drill uses, in the harness's own units (ms). */
export const DRILL = Object.freeze({
  playMs: 500,        // play, then wait this long before reading the position
  pauseMs: 300,       // pause, then wait before the first reading
  holdMs: 300,        // and this long between the two readings
  holdTol: 1,         // the two readings may differ by less than this
  seekKey: '5',       // the keyboard table's "half way"
  seekFrac: 0.5,
  seekTol: 0.02,      // of the range
  keyMs: 250,         // wait after the key before reading
  inkStride: 53,      // sample every 53rd pixel
  inkFloor: 90,       // r + g + b above this is ink
  inkTries: 3,        // a fresh frame each time; see `inkOf`
});

// ── the verdicts, pure, so they are graded without a browser ───────────────

/** `transport published` in the harness: the bar has a numeric position. */
export const judgePosition = (pos) => ({
  pass: typeof pos === 'number', detail: `pos ${pos}`,
});

/** `rate lattice from caps`: null, or an array the caps intersected. */
export const judgeLattice = (lattice) => ({
  pass: lattice === null || Array.isArray(lattice), detail: JSON.stringify(lattice),
});

/** `play advances position`: playing, and further on than before. */
export const judgePlay = (t0, t1) => ({
  pass: !!(t1.playing && t1.pos > t0.pos),
  detail: `${Number(t0.pos).toFixed(0)} -> ${Number(t1.pos).toFixed(0)}`,
});

/** `pause holds position`: not playing, and two readings 300 ms apart agree. */
export const judgePause = (a, b, playing) => ({
  pass: !playing && Math.abs(b - a) < DRILL.holdTol,
  detail: `${Number(a).toFixed(1)} == ${Number(b).toFixed(1)}`,
});

/** `keyboard seek lands`: within 2 per cent of the range of half way. */
export const judgeSeek = (mid, range) => {
  const target = range[0] + (range[1] - range[0]) * DRILL.seekFrac;
  return {
    pass: Math.abs(mid - target) < (range[1] - range[0]) * DRILL.seekTol,
    detail: `${Number(mid).toFixed(0)} ~ ${target.toFixed(0)}`,
  };
};

/** `strip has ink`: at least one sampled pixel brighter than the floor. */
export const judgeInk = (lit, tries) => ({
  pass: lit > 0, detail: `${lit} lit samples${tries > 1 ? ` (${tries} tries)` : ''}`,
});

/** The harness's sampler over a pixel array, every 53rd pixel. */
export function countInk(data) {
  let lit = 0;
  for (let i = 0; i < data.length; i += 4 * DRILL.inkStride) {
    if (data[i] + data[i + 1] + data[i + 2] > DRILL.inkFloor) lit++;
  }
  return lit;
}

// ── the drill ──────────────────────────────────────────────────────────────

const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const twoFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * Sample after a frame, and retry: `resize()` in strip.mjs clears the canvas before it redraws.
 * why: lessons/kit-bar-drill.md#inkof
 */
async function inkOf(canvas) {
  let lit = 0, tries = 0;
  for (; tries < DRILL.inkTries && !lit; tries++) {
    await twoFrames();
    if (!canvas.width || !canvas.height) continue;
    lit = countInk(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
  }
  return { lit, tries };
}

/**
 * Run the drill against one bar and return the rows, asserting nothing.
 *
 * @param {object} bar  a transportApi object (transport-control.mjs), or anything with `.api` holding one
 * @param {object} [o]
 * @param {HTMLCanvasElement} [o.strip]  the strip this bar drives; without it
 *   there is no ink row, as on a page with no strip
 * @returns {Promise<Array<{label:string, pass?:boolean, detail:string, skipped?:boolean}>>}
 *   Skipped rows carry `skipped: true` and the reason, exactly where the
 *   harness prints a line and asserts nothing (a bar with no toggle, a bar that
 *   is not seekable).
 */
export async function drillBar(bar, { strip = null } = {}) {
  const api = bar && bar.api ? bar.api : bar;
  if (!api || !api.el) throw new Error('drillBar: pass a transportApi object (it needs .el)');
  const rows = [];
  const row = (label, v) => { rows.push({ label, ...v }); return v.pass; };

  const t0 = { pos: api.position, playing: api.playing };
  row('has a position', judgePosition(t0.pos));
  row('rate lattice from caps', judgeLattice(api.lattice));

  if (api.toggles === false) {
    rows.push({ label: 'play and pause', skipped: true, detail: 'this bar has no play button, so the play/pause drill is skipped' });
  } else {
    // The toggle of THIS bar, never the first one in the document: the
    // harness learned that on `/stage/`.
    const toggle = api.el.querySelector('.tbar-toggle');
    toggle.click();
    await nap(DRILL.playMs);
    const t1 = { pos: api.position, playing: api.playing };
    row('play advances position', judgePlay(t0, t1));
    toggle.click();
    await nap(DRILL.pauseMs);
    const a = api.position;
    await nap(DRILL.holdMs);
    const b = api.position;
    row('pause holds position', judgePause(a, b, api.playing));
  }

  if (api.seekable) {
    const closed = api.el.closest('[data-own-keys][hidden]');
    api.el.dispatchEvent(new KeyboardEvent('keydown', { key: DRILL.seekKey, bubbles: true }));
    await nap(DRILL.keyMs);
    const v = judgeSeek(api.position, api.range);
    if (closed) v.detail += ', and the bar is in a closed tab, so no key reaches it';
    row('keyboard seek lands', v);
  } else {
    rows.push({ label: 'keyboard seek', skipped: true, detail: 'this bar is not seekable' });
  }

  if (strip) {
    const { lit, tries } = await inkOf(strip);
    row('strip has ink', judgeInk(lit, tries));
  }
  return rows;
}

/**
 * Run the drill and assert every row that was not skipped.
 *
 * @param {(label:string, pass:boolean, detail?:string)=>void} assert  `d.assert`,
 *   or a tab's prefixed one from `createTabPage`
 * @param {object} bar
 * @param {{name?:string, strip?:HTMLCanvasElement}} [o]  `name` goes in front
 *   of every label, so five bars on one page read as five bars
 */
export async function assertBar(assert, bar, { name = '', strip = null } = {}) {
  const api = bar && bar.api ? bar.api : bar;
  const pre = name ? `bar ${name}: ` : 'bar: ';
  if (typeof window !== 'undefined' && window.__demo && window.__demo.transport === api) {
    assert(`${pre}is not the published bar, which the harness drills itself`, false,
      'pass publish: false on every bar but one, and drill only those');
    return [];
  }
  const rows = await drillBar(api, { strip });
  for (const r of rows) if (!r.skipped) assert(`${pre}${r.label}`, r.pass, r.detail);
  return rows;
}
