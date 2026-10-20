// demo/shell/share-bg.mjs: a picture behind a share card, DOM-free so the page and the build share it.
// The picture covers the frame (centred, with a focus to nudge), and a flat scrim of the site's ground
// sits over it, as dark as the text needs and no darker: the lowest alpha at which every text block's
// dimmest ink reads at CONTRAST or better against every pixel under that block.
// why: lessons/kit-share-card.md#background
import { INK, xml } from './bay-svg.mjs';

/** WCAG's AA figure for ordinary text. */
export const CONTRAST = 4.5;
/** The lightest scrim a card is given even over a dark picture, so it still reads as this site's ground. */
export const SCRIM_FLOOR = 0.4;
/** What a picture may be, here and at build. */
export const BG_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** Relative luminance of `#rrggbb`. */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Where a `iw` by `ih` picture lands to cover a `w` by `h` frame; `fx`, `fy` 0..1 pick which part is kept. */
export function cover(iw, ih, w, h, fx = 0.5, fy = 0.5) {
  const s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
  return { x: (w - dw) * fx, y: (h - dh) * fy, width: dw, height: dh };
}

const imageTag = (bg, w, h) => {
  const g = cover(bg.width, bg.height, w, h, bg.fx, bg.fy);
  return `<image href="${xml(bg.href)}" x="${g.x.toFixed(2)}" y="${g.y.toFixed(2)}" width="${g.width.toFixed(2)}" height="${g.height.toFixed(2)}" preserveAspectRatio="none"/>`;
};

/**
 * The ground of a card: the plain rect when there is no `bg`, byte for byte what the cards always drew;
 * with one, the rect, the picture and the scrim. `bg` is `{ href, width, height, fx, fy, scrim }`,
 * `href` a data: URI (an SVG drawn as an image may fetch nothing else).
 */
export function ground(w, h, bg) {
  const rect = `<rect width="${w}" height="${h}" fill="${INK.bg}"/>`;
  if (!bg) return rect;
  const a = +(bg.scrim ?? 1).toFixed(3);
  return rect + imageTag(bg, w, h) + (a > 0 ? `<rect width="${w}" height="${h}" fill="${INK.bg}" fill-opacity="${a}"/>` : '');
}

/** The picture alone on the ground, no scrim and no text: what `sample` rasterises to measure. */
export const bareSvg = (bg, w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${INK.bg}"/>${imageTag(bg, w, h)}</svg>`;

// sRGB to linear for a composite value in quarter steps, so the scan below needs no pow.
const LUT = Float64Array.from({ length: 1021 }, (_, i) => lin(i / 4));

/**
 * The scrim for one card. `px` is the picture alone on the card (RGBA, `w` by `h`), `regions` the card's
 * text blocks `{ x, y, width, height, inks }`. For each alpha from `floor` up in steps of 0.01, every
 * pixel inside every block is composited under the scrim exactly as SVG does it (in sRGB, before the
 * luminance), and the first alpha at which each block's dimmest ink reaches `target` against every composited
 * pixel under it wins. Returns `{ scrim, contrast, bare, worst }`: the alpha, the worst
 * block's ratio at it, the worst ratio with no scrim at all, and which block that was.
 */
export function scrimFor(px, w, h, regions, { floor = SCRIM_FLOOR, target = CONTRAST } = {}) {
  const b = [INK.bg.slice(1, 3), INK.bg.slice(3, 5), INK.bg.slice(5, 7)].map((s) => parseInt(s, 16));
  const blocks = regions.map((r) => {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(w, Math.ceil(r.x + r.width)), y1 = Math.min(h, Math.ceil(r.y + r.height));
    // Each distinct colour once: a photo has far fewer colours under a block than pixels.
    const seen = new Set();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    }
    const keep = [...seen].map((k) => [k >> 16, (k >> 8) & 255, k & 255]);
    return { r, keep, ink: Math.min(...r.inks.map(luminance)) };
  });
  const worstAt = (a) => {
    let worst = Infinity, which = null;
    for (const { r, keep, ink } of blocks) {
      // The worst pixel is the one nearest the ink in luminance, from either side.
      let c = Infinity;
      for (const p of keep) {
        const L = 0.2126 * LUT[Math.round((a * b[0] + (1 - a) * p[0]) * 4)]
          + 0.7152 * LUT[Math.round((a * b[1] + (1 - a) * p[1]) * 4)]
          + 0.0722 * LUT[Math.round((a * b[2] + (1 - a) * p[2]) * 4)];
        const q = ratio(ink, L);
        if (q < c) c = q;
      }
      if (c < worst) { worst = c; which = r.name; }
    }
    return { c: worst, which };
  };
  const bare = worstAt(0);
  for (let s = Math.round(floor * 100); s <= 100; s++) {
    const at = worstAt(s / 100);
    if (at.c >= target) return { scrim: s / 100, contrast: at.c, bare: bare.c, worst: at.which };
  }
  const at = worstAt(1);
  return { scrim: 1, contrast: at.c, bare: bare.c, worst: at.which };
}

/**
 * A card with `bg` behind it: `make(bg?)` is siteCard, igCard or helloCard, `bg` is
 * `{ href, width, height, fx, fy }`, and `sample(svg, w, h)` rasterises an SVG to RGBA (resvg at build,
 * a canvas in the page). Returns the card with `scrim`, `contrast` and `bare` on it.
 */
export async function backed(make, bg, sample) {
  const plain = make();
  const px = await sample(bareSvg(bg, plain.width, plain.height), plain.width, plain.height);
  const s = scrimFor(px, plain.width, plain.height, plain.regions);
  return { ...make({ ...bg, scrim: s.scrim }), scrim: s.scrim, contrast: s.contrast, bare: s.bare, worst: s.worst };
}

/** Width and height from a PNG's IHDR or a JPEG's first SOF, or null; the build has no decoder. */
export function imageSize(u8) {
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
    const v = new DataView(u8.buffer, u8.byteOffset);
    return { width: v.getUint32(16), height: v.getUint32(20), type: 'image/png' };
  }
  if (u8[0] === 0xff && u8[1] === 0xd8) {
    let i = 2;
    while (i + 9 < u8.length) {
      if (u8[i] !== 0xff) { i++; continue; }
      const m = u8[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = (u8[i + 2] << 8) | u8[i + 3];
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { height: (u8[i + 5] << 8) | u8[i + 6], width: (u8[i + 7] << 8) | u8[i + 8], type: 'image/jpeg' };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Base64 of bytes, in both places (Buffer is node's, btoa the browser's). */
export function base64(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
