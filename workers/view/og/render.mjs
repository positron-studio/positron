// SVG to PNG in Node through vendored @resvg/resvg-wasm 2.6.2, no browser, no system fonts.
// initWasm runs once per process (a second call throws). The SVG comes from share-card.mjs and
// bay-svg.mjs; faces are fonts/*.ttf from og-fonts.py. Vendored here so the build skips 2.48 MB.
// why: lessons/workers-view.md#og-render
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from './vendor/resvg-wasm/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FACES = ['jetbrains-mono-latin-400-normal', 'jetbrains-mono-latin-600-normal', 'geist-latin-400-normal', 'geist-latin-600-normal'];

let ready = null, fonts = null;

/** The ink box of what `svg` draws, `{ x, y, width, height }`, resvg's own
 *  `getBBox()`, so a mark can be centred on its glyphs rather than on its line. */
export async function inkBox(svg) {
  await (ready ??= readFile(join(HERE, 'vendor/resvg-wasm/index_bg.wasm')).then((b) => initWasm(b)));
  fonts ??= await Promise.all(FACES.map((f) => readFile(join(HERE, 'fonts', `${f}.ttf`)).then((b) => new Uint8Array(b))));
  const r = new Resvg(svg, { font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'JetBrains Mono' } });
  const b = r.getBBox();
  return b && { x: b.x, y: b.y, width: b.width, height: b.height };
}

/** `svg` rasterised to a PNG `width` px wide, as a Uint8Array. */
export async function renderPng(svg, width) {
  await (ready ??= readFile(join(HERE, 'vendor/resvg-wasm/index_bg.wasm')).then((b) => initWasm(b)));
  fonts ??= await Promise.all(FACES.map((f) => readFile(join(HERE, 'fonts', `${f}.ttf`)).then((b) => new Uint8Array(b))));
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'JetBrains Mono' },
  }).render().asPng();
}

/** `svg` rasterised `width` px wide as RGBA bytes, for measuring a picture (share-bg.mjs). */
export async function renderPixels(svg, width) {
  await (ready ??= readFile(join(HERE, 'vendor/resvg-wasm/index_bg.wasm')).then((b) => initWasm(b)));
  fonts ??= await Promise.all(FACES.map((f) => readFile(join(HERE, 'fonts', `${f}.ttf`)).then((b) => new Uint8Array(b))));
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'JetBrains Mono' },
  }).render().pixels;
}
