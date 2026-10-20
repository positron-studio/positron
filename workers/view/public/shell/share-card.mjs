// demo/shell/share-card.mjs: the share images as DOM-free SVG strings, the front page's hero type alone
// (HERO in hero.mjs): 1200 by 630 og:image, 1080 by 1350 Instagram portrait. Rasterised by resvg at build.
// The name hashes the SVG plus TEMPLATE_V: bump TEMPLATE_V when the TTFs or resvg change.
// why: lessons/kit-share-card.md#header
import { HERO } from './hero.mjs';
import { textWidth, xml, INK, FAMILY } from './bay-svg.mjs';
import M from './font-metrics.mjs';
import { ground } from './share-bg.mjs';

// Bump on a change the SVG cannot show (a face, resvg): it is in every hash.
// why: lessons/kit-share-card.md#template-v
export const TEMPLATE_V = 6;
export const W = 1200, H = 630;
export const IG_W = 1080, IG_H = 1350;
export const SITE = 'https://positron.studio';
export const SITE_NAME = 'positron.studio';

// The hero's type at the front page's desk sizes (shell.css .pos-hero*: 13, 56, 22, 16 px, gaps 18, 24, 18),
// scaled up as one block until it fills the frame.
// why: lessons/kit-share-card.md#type
const TYPE = {
  eye: { face: 'mono', weight: 400, size: 13, track: 0.14, lh: 1.2, fill: INK.dim },
  head: { face: 'mono', weight: 600, size: 56, track: -0.04, lh: 1.08, fill: INK.fg },
  line: { face: 'sans', weight: 400, size: 22, track: -0.01, lh: 1.45, fill: INK.fg },
  small: { face: 'sans', weight: 400, size: 16, track: 0, lh: 1.5, fill: INK.dim2 },
};
const GAPS = { head: 18, line: 24, small: 18 };
// .pos-hero-l carries max-width: 32em, which is what wraps the line onto two
// at the desk; the headline wraps in the column (Connect anything / to
// everything.), and on a card it is always those two lines.
const LINE_MAX = 32 * TYPE.line.size;

const width = (s, t) => textWidth(s, t.face, t.size, { weight: t.weight, tracking: t.track * t.size });
function wrap(text, t, maxW) {
  const words = text.split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) { const next = cur ? `${cur} ${w}` : w; if (cur && width(next, t) > maxW) { lines.push(cur); cur = w; } else cur = next; }
  if (cur) lines.push(cur);
  return lines;
}
// the narrowest measure that keeps the line count: text-wrap: balance by hand,
// eccm's balance() (the hero sets `text-wrap: balance` on every line of it)
function balance(text, t, maxW) {
  const n = wrap(text, t, maxW).length;
  if (n < 2) return wrap(text, t, maxW);
  let lo = 0, hi = maxW;
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (wrap(text, t, mid).length > n) lo = mid; else hi = mid; }
  return wrap(text, t, hi);
}
const blockW = (lines, t) => Math.max(...lines.map((l) => width(l, t)));
// A text block's box at scale k, padded by a fifth of its size, with the inks it is drawn in:
// what share-bg.mjs measures a background picture under.
const region = (name, r, x, y, k, inks) => {
  const size = r.t.size * k, padR = 0.2 * size;
  return { name, x: x - padR, y: y - padR, width: blockW(r.lines, r.t) * k + 2 * padR,
    height: r.lines.length * r.t.lh * size + 2 * padR, inks };
};

// The hero block laid out at the front page's sizes in a column `measure` wide:
// its lines, and its width and height in those units.
// Every way to break the headline at its spaces into `n` lines, never inside a
// word and never with a hyphen.
function breaks(text, n) {
  const words = text.split(/\s+/), out = [];
  const go = (i, left, acc) => {
    if (left === 1) { out.push([...acc, words.slice(i).join(' ')]); return; }
    for (let j = i + 1; j <= words.length - left + 1; j++) go(j, left - 1, [...acc, words.slice(i, j).join(' ')]);
  };
  if (n <= words.length) go(0, n, []);
  return out;
}

// The wordmark at the foot, 1.5 times the hero's 13 px eye, tracking 0.08 em.
// why: lessons/kit-share-card.md#mark
const MARK = { ...TYPE.eye, size: TYPE.eye.size * 1.5, track: 0.08 };
// No small line on a card; HERO and the front page keep it.
// why: lessons/kit-share-card.md#no-small-line

// The hero block laid out at the front page's sizes in a column `measure`
// wide, with the headline broken as `head` says: its rows (the headline, the
// line, the small line), the wordmark, and the size of each in those units.
function layout(measure, head) {
  const rows = [
    { t: TYPE.head, lines: head, accent: true, gap: 0 },
    { t: TYPE.line, lines: balance(HERO.line, TYPE.line, Math.min(measure, LINE_MAX)), gap: GAPS.line },
  ];
  // Lowercase, `positron` gray and `.studio` yellow.
  // why: lessons/kit-share-card.md#mark-colours
  const mark = { t: MARK, lines: [SITE_NAME], studio: true, gap: 0 };
  const w = Math.max(...[...rows, mark].map((r) => blockW(r.lines, r.t)));
  const h = rows.reduce((a, r) => a + r.gap + r.lines.length * r.t.lh * r.t.size, 0);
  return { rows, mark, w, h, markH: MARK.lh * MARK.size };
}

// One block of text at scale k. `accent` puts a closing full stop in --hi,
// `dot` replaces a space with an accent dot (the wordmark).
function block(r, x, y0, k) {
  const { t } = r, size = t.size * k, fam = FAMILY[t.face];
  const cap = M[`${t.face}${t.weight}`].cap;
  let y = y0 + cap * size + (t.lh - 1) * size / 2;
  const out = [];
  r.lines.forEach((l, i) => {
    let inner = xml(l);
    if (r.dot) inner = l.split(' ').map(xml).join(`<tspan fill="${INK.hi}">.</tspan>`);
    if (r.studio) { const i = l.indexOf('.'); inner = `${xml(l.slice(0, i))}<tspan fill="${INK.hi}">${xml(l.slice(i))}</tspan>`; }
    if (r.hello && /\.$/.test(l)) inner = `${xml(l.slice(0, -1))}<tspan fill="${INK.dim}">.</tspan>`;
    else if (r.accent && i === r.lines.length - 1 && /\.$/.test(l)) inner = `${xml(l.slice(0, -1))}<tspan fill="${INK.hi}">.</tspan>`;
    out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${xml(fam)}" font-weight="${t.weight}" font-size="${+size.toFixed(2)}"${t.track ? ` letter-spacing="${+(t.track * size).toFixed(2)}"` : ''} fill="${t.fill}">${inner}</text>`);
    y += t.lh * size;
  });
  return out.join('');
}

/**
 * The hero in a w by h frame with `pad`, wordmark on the bottom margin, MARK_AIR between. `lines` is how
 * many lines the headline may take; the measure and break that grow the block largest win.
 * why: lessons/kit-share-card.md#hero-card
 */
const MARK_AIR = 40;
function heroCard(w, h, pad, kind, lines = [2], bg = null) {
  let best = null;
  for (const n of lines) for (const head of breaks(HERO.head, n)) for (let m = 360; m <= 1000; m += 8) {
    const L = layout(m, head);
    const k = Math.min((w - 2 * pad) / L.w, (h - 2 * pad) / (L.h + MARK_AIR + L.markH));
    if (!best || k > best.k + 1e-6) best = { L, k };
  }
  const { L, k } = best;
  const x = pad, parts = [];
  let y = pad;
  const regions = [];
  L.rows.forEach((r, i) => {
    y += r.gap * k; parts.push(block(r, x, y, k));
    regions.push(region(i ? 'line' : 'headline', r, x, y, k, i ? [r.t.fill] : [r.t.fill, INK.hi]));
    y += r.lines.length * r.t.lh * r.t.size * k;
  });
  parts.push(block(L.mark, x, h - pad - L.markH * k, k));
  regions.push(region('wordmark', L.mark, x, h - pad - L.markH * k, k, [INK.dim, INK.hi]));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `${ground(w, h, bg)}${parts.join('')}</svg>`;
  const version = fnv(`${svg}|${TEMPLATE_V}`);
  return { svg, alt: ALT, version, path: `/og/${kind}-${version}.png`, width: w, height: h, scale: k,
    headSize: TYPE.head.size * k, markSize: MARK.size * k, head: L.rows[0].lines, regions };
}
const ALT = `${SITE_NAME}: ${HERO.head} ${HERO.line}`;

/** The site card, the og:image of every page: `{ svg, alt, version, path, width, height, regions }`.
 *  `bg` (share-bg.mjs) puts a picture behind it; the hash then covers the picture too. */
export const siteCard = (bg) => heroCard(W, H, 72, 'site', [2], bg);
/** The Instagram portrait, 1080 by 1350, tagged on no page: posted by hand. */
export const igCard = (bg) => heroCard(IG_W, IG_H, 96, 'ig', [2, 3, 4], bg);

// A second Instagram post: these four lines as given, as large as fits, wordmark at the foot.
// why: lessons/kit-share-card.md#hello
export const HELLO = ['Hello,', 'is this', 'thing', 'on?'];   // as given, 2026-10-13
// The question mark's own dot is green (brighter than the status dot's #8fd6a8, with a blurred glow):
// the ? is drawn white, then again in green clipped to its dot's band.
// why: lessons/kit-share-card.md#ok-green
const OK = '#3dffa0';
// Each dot redrawn in its own colour clipped to its band: the ?'s dot green (below 0.2 em over the
// baseline), every i's tittle gray (above JetBrains Mono's 0.55 em x-height).
// why: lessons/kit-share-card.md#dots
let clips = 0;
function dots(r, x, y0, k) {
  const { t } = r, size = t.size * k, cap = M[`${t.face}${t.weight}`].cap, fam = FAMILY[t.face];
  const out = [];
  const again = (ch, gx, base, top, hgt, fill) => {
    const id = `dot${++clips}`;
    const glyph = `<text x="${gx.toFixed(1)}" y="${base.toFixed(1)}" font-family="${xml(fam)}" font-weight="${t.weight}" font-size="${+size.toFixed(2)}" fill="${fill}" clip-path="url(#${id})">${xml(ch)}</text>`;
    out.push(`<clipPath id="${id}"><rect x="${(gx - size).toFixed(1)}" y="${top.toFixed(1)}" width="${(3 * size).toFixed(1)}" height="${hgt.toFixed(1)}"/></clipPath>`
      + (fill === OK ? `<filter id="glow${id}" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="${(0.14 * size).toFixed(1)}"/></filter><g filter="url(#glow${id})">${glyph}${glyph}${glyph}</g>` : '')
      + glyph);
  };
  r.lines.forEach((l, i) => {
    const base = y0 + cap * size + (t.lh - 1) * size / 2 + i * t.lh * size;
    [...l].forEach((ch, c) => {
      if (ch !== '?' && ch !== 'i') return;
      const gx = x + (c ? width(l.slice(0, c), { ...t, size }) : 0);
      if (ch === '?') again(ch, gx, base, base - 0.2 * size, 0.5 * size, OK);
      else again(ch, gx, base, base - 1.2 * size, 0.6 * size, INK.dim);
    });
  });
  return out.join('');
}
export function helloCard(bg = null) {
  const w = IG_W, h = IG_H, pad = 96;
  const r = { t: TYPE.head, lines: HELLO, hello: true, gap: 0 };
  const mark = { t: MARK, lines: [SITE_NAME], studio: true, gap: 0 };
  const tw = blockW(r.lines, r.t), th = r.lines.length * r.t.lh * r.t.size;
  // the wordmark keeps the size it has on the hero portrait, so the two posts match
  const km = igCard().markSize / MARK.size;
  const markH = MARK.lh * MARK.size * km;
  // three quarters of the largest that fits
  // why: lessons/kit-share-card.md#hello-size
  const k = 0.75 * Math.min((w - 2 * pad) / tw, (h - 2 * pad - markH - MARK_AIR * km) / th);
  clips = 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `${ground(w, h, bg)}${block(r, pad, pad, k)}${dots(r, pad, pad, k)}${block(mark, pad, h - pad - markH, km)}</svg>`;
  const version = fnv(`${svg}|${TEMPLATE_V}`);
  const regions = [region('headline', r, pad, pad, k, [r.t.fill, INK.dim]), region('wordmark', mark, pad, h - pad - markH, km, [INK.dim, INK.hi])];
  return { svg, alt: `${SITE_NAME}: ${HELLO.join(' ')}`, version, path: `/og/hello-${version}.png`, width: w, height: h, scale: k,
    headSize: TYPE.head.size * k, markSize: MARK.size * km, head: HELLO, regions };
}

/** FNV-1a, 8 hex, eccm's and trip's cardVersion. */
export function fnv(str) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(str)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * The share tags for one page, as HTML lines: og:site_name, og:type, og:title,
 * og:description, og:url, og:image with its width, height, type and alt, and
 * twitter:card. `url` is the page's path on the site; `card` is siteCard()'s
 * answer (one card for every page, for now).
 */
export function shareTags({ title, description, url, card }) {
  const abs = (p) => new URL(p, SITE).href;
  const tags = [
    ['og:site_name', SITE_NAME], ['og:type', 'website'], ['og:title', title],
    description ? ['og:description', description] : null,
    ['og:url', abs(url)], ['og:image', abs(card.path)],
    ['og:image:width', card.width], ['og:image:height', card.height],
    ['og:image:type', 'image/png'], ['og:image:alt', card.alt],
  ].filter(Boolean).map(([p, c]) => `<meta property="${p}" content="${xml(c)}">`);
  tags.push('<meta name="twitter:card" content="summary_large_image">');
  return tags;
}
