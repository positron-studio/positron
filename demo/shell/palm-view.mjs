// demo/shell/palm-view.mjs: the Palm Z22's 160x160 colour screen and its stylus, drawn on a page.
// Frames are quantised to the Z22's 12 bit colour (4 bits a channel) so the browser shows what the
// device would. The stylus answers { x, y, down } in panel pixels, the shape plan-screens-odd gives it.

import { el } from './shell.mjs';

export const PALM_W = 160, PALM_H = 160;

const q4 = (v) => ((v >> 4) * 17);          // 8 bit channel to the nearest of 16 levels

/** Quantise an RGBA frame (160x160x4) to 12 bit colour in place, and return it. */
export function to12bit(rgba) {
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = q4(rgba[i]); rgba[i + 1] = q4(rgba[i + 1]); rgba[i + 2] = q4(rgba[i + 2]); rgba[i + 3] = 255; }
  return rgba;
}

/**
 * A Palm body with its screen in `host`. `onPen({ x, y, down })` fires for every stylus move while
 * pressed and once on lift. Answers the canvas, its 2d context, `show(rgba)` for a whole frame and
 * `paint(fn)` to draw with the 2d context then quantise.
 */
export function createPalm(host, { onPen = () => {} } = {}) {
  const body = el('div', 'palm-body');
  const screen = el('div', 'palm-screen');
  const cv = document.createElement('canvas');
  cv.width = PALM_W; cv.height = PALM_H;
  cv.className = 'palm-cv';
  screen.append(cv);
  const silk = el('div', 'palm-silk');
  for (const t of ['home', 'menu', 'find']) silk.append(el('span', 'palm-key', t));
  body.append(screen, silk);
  host.append(body);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PALM_W, PALM_H);

  // Whole scales only, so every panel pixel is the same size (the OLED view's rule).
  const fit = () => {
    const w = host.clientWidth;
    if (!(w > 0)) return;
    const k = Math.max(1, Math.min(4, Math.floor((w - 40) / PALM_W)));
    cv.style.width = `${k * PALM_W}px`; cv.style.height = `${k * PALM_H}px`;
  };
  new ResizeObserver(fit).observe(host);
  fit();

  const at = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: Math.max(0, Math.min(PALM_W - 1, Math.floor((e.clientX - r.left) * PALM_W / r.width))),
      y: Math.max(0, Math.min(PALM_H - 1, Math.floor((e.clientY - r.top) * PALM_H / r.height))) };
  };
  let down = false;
  cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); onPen({ ...at(e), down: true }); });
  cv.addEventListener('pointermove', (e) => { if (down) onPen({ ...at(e), down: true }); });
  const up = (e) => { if (!down) return; down = false; onPen({ ...at(e), down: false }); };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  function show(rgba) {
    const img = ctx.createImageData(PALM_W, PALM_H);
    img.data.set(to12bit(rgba));
    ctx.putImageData(img, 0, 0);
  }
  function paint(fn) {
    fn(ctx);
    const img = ctx.getImageData(0, 0, PALM_W, PALM_H);
    to12bit(img.data);
    ctx.putImageData(img, 0, 0);
  }
  return { el: body, canvas: cv, ctx, show, paint };
}

export const PALM_CSS = `
  .palm-body { display: inline-flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 18px 14px;
    background: #2a2d33; border: 1px solid #3a3f47; border-radius: 22px 22px 34px 34px; }
  .palm-screen { padding: 6px; background: #14161a; border-radius: 6px; line-height: 0; }
  .palm-cv { image-rendering: pixelated; touch-action: none; cursor: crosshair; display: block; }
  .palm-silk { display: flex; gap: 18px; font: 10px var(--mono); letter-spacing: .08em; text-transform: uppercase; color: #8b93a1; }
`;
