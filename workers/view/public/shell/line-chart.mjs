// demo/shell/line-chart.mjs: one or two series over time as plain SVG, sized by its own box. No library, no canvas.
// `chartLayout` is pure (scales, ticks, paths, the peak) and graded in node; `createLineChart` draws it.
// why: lessons/kit-line-chart.md#header

const NS = 'http://www.w3.org/2000/svg';
const MIN = 60_000, H = 60 * MIN, DAY = 24 * H;
/** Tick spacings on the time axis, smallest first; the first that keeps ticks about TICK_PX apart wins. */
export const TIME_STEPS = [MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, H, 2 * H, 3 * H, 6 * H, 12 * H, DAY, 2 * DAY, 7 * DAY];
export const TICK_PX = 84;
// the mono face's advance at the axis size, for the left gutter; a measured width needs a document
const CHAR_PX = 6.6, AXIS_PX = 11;

/** 1, 2 or 5 times a power of ten, at least range / target; whole numbers when `whole`. */
export function niceStep(range, target, whole = true) {
  const raw = Math.max(range, 1e-9) / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw - 1e-12);
  return whole ? Math.max(1, Math.round(step)) : step;
}

const two = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A tick's words: the hour and minute, or the day where a day starts or the step is a day or more. */
function tickLabel(t, step, offMs) {
  const d = new Date(t + offMs);
  const dayStart = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  return step >= DAY || dayStart ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/**
 * Everything the picture needs, from data and a size. `series` is `[{ name, points: [[t, v | null], ...], tone }]`,
 * `t` in ms; a null value breaks the line, and so does a gap longer than `maxGap` ms between two readings. `offsetMin` is minutes east of UTC for the tick labels (local by default).
 * The peak is series 0's largest value, the earliest if it repeats. `empty` when no series has a value in range.
 */
export function chartLayout({ series = [], from, to, width, height, offsetMin = null, unit = '', maxGap = Infinity }) {
  const all = series.flatMap((s) => (s.points || []).filter(([t, v]) => Number.isFinite(v) && t >= from && t <= to));
  const empty = !all.length || !(to > from) || !(width > 0) || !(height > 0);
  if (empty) return { empty: true, width, height, lines: [], xTicks: [], yTicks: [], peak: null };
  const top0 = Math.max(1, ...all.map(([, v]) => v));
  const yStep = niceStep(top0, 4), yTop = Math.ceil(top0 / yStep) * yStep;
  const yTicks = [];
  for (let v = 0; v <= yTop + 1e-9; v += yStep) yTicks.push(v);
  const gutter = Math.ceil(Math.max(...yTicks.map((v) => String(v).length)) * CHAR_PX) + 8;
  const plot = { l: gutter, t: AXIS_PX + 10, r: width - 8, b: height - AXIS_PX - 10 };
  const x = (t) => plot.l + ((t - from) / (to - from)) * (plot.r - plot.l);
  const y = (v) => plot.b - (v / yTop) * (plot.b - plot.t);
  // ticks on whole steps of local time, never closer than TICK_PX
  const off = (offsetMin ?? -new Date(from).getTimezoneOffset()) * MIN;
  const want = Math.max(1, Math.floor((plot.r - plot.l) / TICK_PX));
  const step = TIME_STEPS.find((s) => (to - from) / s <= want) ?? TIME_STEPS.at(-1);
  const xTicks = [];
  for (let t = Math.ceil((from + off) / step) * step - off; t <= to; t += step) xTicks.push({ t, x: x(t), label: tickLabel(t, step, off) });
  const lines = series.map((s, i) => {
    // Two readings further apart than maxGap are not joined: the time between is missing, not a slope.
    // why: lessons/kit-line-chart.md#max-gap
    let d = '', pen = false, last = -Infinity;
    for (const [t, v] of s.points || []) {
      if (t < from || t > to) continue;
      if (!Number.isFinite(v)) { pen = false; continue; }
      if (t - last > maxGap) pen = false;
      d += `${pen ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; last = t;
    }
    return { d, name: s.name || `series ${i + 1}`, tone: s.tone || (i ? 'faint' : 'main'), i };
  });
  let peak = null;
  for (const [t, v] of series[0]?.points || []) if (Number.isFinite(v) && t >= from && t <= to && (!peak || v > peak.v)) peak = { t, v };
  if (peak) Object.assign(peak, { x: x(peak.t), y: y(peak.v), label: `peak ${peak.v}${unit ? ` ${unit}` : ''}`, anchor: x(peak.t) > (plot.l + plot.r) / 2 ? 'end' : 'start' });
  return { empty: false, width, height, plot, x, y, xTicks, yTicks: yTicks.map((v) => ({ v, y: y(v), label: String(v) })), lines, peak, yTop, step };
}

const svg = (name, attrs = {}, text) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
};

/**
 * `{ el, set({ series, from, to, maxGap }), layout(), destroy() }`. Height is `--lc-h` (CSS); width is the box's own. Nothing
 * is drawn and the box is hidden while there is nothing to show. A pointer over it marks the nearest reading of series 0.
 */
export function createLineChart({ label = 'line chart', unit = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'pos-lc';
  const fig = svg('svg', { role: 'img', 'aria-label': label });
  const key = document.createElement('div');
  key.className = 'pos-lc-key';
  el.append(fig, key);
  let data = { series: [], from: 0, to: 0 }, last = null;
  el.hidden = true;

  function draw() {
    const w = Math.round(fig.clientWidth || el.clientWidth), h = Math.round(fig.clientHeight || 0);
    const L = chartLayout({ ...data, width: w, height: h, unit });
    last = L;
    fig.replaceChildren();
    if (L.empty) return;
    fig.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const g = svg('g', { class: 'pos-lc-axis' });
    for (const t of L.yTicks) {
      g.append(svg('line', { x1: L.plot.l, x2: L.plot.r, y1: t.y, y2: t.y, class: t.v ? 'pos-lc-grid' : 'pos-lc-base' }));
      g.append(svg('text', { x: L.plot.l - 6, y: t.y, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, t.label));
    }
    for (const t of L.xTicks) g.append(svg('text', { x: t.x, y: L.plot.b + 6, 'text-anchor': 'middle', 'dominant-baseline': 'hanging' }, t.label));
    fig.append(g);
    // the faint series under the main one
    for (const l of [...L.lines].reverse()) if (l.d) fig.append(svg('path', { d: l.d, class: `pos-lc-line pos-lc-${l.tone}` }));
    if (L.peak) {
      fig.append(svg('circle', { cx: L.peak.x, cy: L.peak.y, r: 4, class: 'pos-lc-peak' }));
      fig.append(svg('text', { x: L.peak.x + (L.peak.anchor === 'end' ? -8 : 8), y: Math.max(L.plot.t - 2, L.peak.y - 8), 'text-anchor': L.peak.anchor, class: 'pos-lc-peakt' }, L.peak.label));
    }
    const guide = svg('line', { y1: L.plot.t, y2: L.plot.b, class: 'pos-lc-guide', visibility: 'hidden' });
    const dot = svg('circle', { r: 4, class: 'pos-lc-dot', visibility: 'hidden' });
    const tip = svg('text', { y: L.plot.t - 4, class: 'pos-lc-tip', 'text-anchor': 'end', x: L.plot.r });
    fig.append(guide, dot, tip);
    fig.onpointermove = (e) => {
      const r = fig.getBoundingClientRect(), px = e.clientX - r.left;
      let best = null;
      for (const [t, v] of data.series[0]?.points || []) if (Number.isFinite(v) && t >= data.from && t <= data.to && (!best || Math.abs(L.x(t) - px) < Math.abs(L.x(best[0]) - px))) best = [t, v];
      if (!best) return;
      const bx = L.x(best[0]), by = L.y(best[1]), d = new Date(best[0]);
      guide.setAttribute('x1', bx); guide.setAttribute('x2', bx); guide.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', bx); dot.setAttribute('cy', by); dot.setAttribute('visibility', 'visible');
      tip.textContent = `${two(d.getHours())}:${two(d.getMinutes())}  ${best[1]}${unit ? ` ${unit}` : ''}`;
    };
    fig.onpointerleave = () => { guide.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.textContent = ''; };
  }

  function paintKey() {
    key.replaceChildren();
    // one series needs no key: the heading names it
    if (data.series.length < 2) { key.hidden = true; return; }
    key.hidden = false;
    data.series.forEach((s, i) => {
      const item = document.createElement('span');
      const sw = document.createElement('i');
      sw.className = `pos-lc-sw pos-lc-${s.tone || (i ? 'faint' : 'main')}`;
      item.append(sw, document.createTextNode(s.name || `series ${i + 1}`));
      key.append(item);
    });
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!el.hidden) draw(); }) : null;
  ro?.observe(el);

  return {
    el,
    set(next) {
      data = { series: next.series || [], from: next.from, to: next.to, ...(next.maxGap ? { maxGap: next.maxGap } : {}) };
      const any = data.series.some((s) => (s.points || []).some(([t, v]) => Number.isFinite(v) && t >= data.from && t <= data.to));
      el.hidden = !any;
      paintKey();
      if (any) draw(); else { fig.replaceChildren(); last = null; }
    },
    /** The last layout drawn, for a page's own checks. */
    layout: () => last,
    destroy() { ro?.disconnect(); el.remove(); },
  };
}
