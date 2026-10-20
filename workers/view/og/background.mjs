// The build's share cards, with the committed background picture behind them when there is one.
// demo/resources/share-bg.jpg (or .jpeg, .png) is the picture; demo/resources/share-bg.json may say
// { "focus": [x, y] }, each 0..1, which part of it a crop keeps (centre by default). With no picture
// the cards are the plain ones, byte for byte, under the names they always had.
// why: lessons/kit-share-card.md#background
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPixels } from './render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { siteCard, igCard, helloCard } = await import(join(ROOT, 'demo/shell/share-card.mjs'));
const { backed, imageSize, base64 } = await import(join(ROOT, 'demo/shell/share-bg.mjs'));

export const BG_NAMES = ['share-bg.jpg', 'share-bg.jpeg', 'share-bg.png'];

/** The committed picture as share-bg.mjs takes it, `{ href, width, height, fx, fy, file }`, or null. */
export async function shareBackground(dir = join(ROOT, 'demo/resources')) {
  const found = [];
  for (const name of BG_NAMES) {
    try { found.push([name, new Uint8Array(await readFile(join(dir, name)))]); } catch {}
  }
  if (!found.length) return null;
  if (found.length > 1) throw new Error(`more than one share background in ${dir}: ${found.map(([n]) => n).join(', ')}; keep one`);
  const [file, bytes] = found[0];
  const size = imageSize(bytes);
  if (!size) throw new Error(`${file} is not a PNG or JPEG this build can read the size of`);
  let fx = 0.5, fy = 0.5;
  try {
    const j = JSON.parse(await readFile(join(dir, 'share-bg.json'), 'utf8'));
    if (Array.isArray(j.focus)) [fx, fy] = j.focus.map((v) => Math.min(1, Math.max(0, Number(v))));
  } catch (e) { if (e.code !== 'ENOENT') throw new Error(`share-bg.json: ${e.message}`); }
  return { href: `data:${size.type};base64,${base64(bytes)}`, width: size.width, height: size.height, fx, fy, file, bytes: bytes.length };
}

/** The three cards for this build: `{ site, ig, hello, bg }`, each card plain or backed. */
export async function shareCards(bg) {
  if (!bg) return { site: siteCard(), ig: igCard(), hello: helloCard(), bg: null };
  const sample = (svg, w) => renderPixels(svg, w);
  return {
    site: await backed(siteCard, bg, sample),
    ig: await backed(igCard, bg, sample),
    hello: await backed(helloCard, bg, sample),
    bg,
  };
}
