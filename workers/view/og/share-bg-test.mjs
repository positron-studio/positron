// node workers/view/og/share-bg-test.mjs: the share cards with and without a background picture,
// through resvg, no browser. With no picture the cards must be the committed PNGs byte for byte;
// with one, the text must read at 4.5:1 measured off resvg's own raster of the ground, which is a
// second source beside share-bg.mjs's arithmetic. Five of the asserts are negative controls.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPng, renderPixels } from './render.mjs';
import { shareBackground, shareCards } from './background.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { siteCard, igCard, helloCard } = await import(join(ROOT, 'demo/shell/share-card.mjs'));
const { ground, imageSize, luminance, ratio, CONTRAST } = await import(join(ROOT, 'demo/shell/share-bg.mjs'));
const { INK } = await import(join(ROOT, 'demo/shell/bay-svg.mjs'));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

// 1. no picture: the ground is the one rect it always was, and the PNGs are the committed ones
ok('with no picture the ground is the plain rect, character for character',
  ground(1200, 630) === `<rect width="1200" height="630" fill="${INK.bg}"/>`);
for (const c of [siteCard(), igCard(), helloCard()]) {
  const png = Buffer.from(await renderPng(c.svg, c.width));
  let old = null;
  try { old = await readFile(join(ROOT, 'workers/view/public', c.path)); } catch {}
  ok(`no picture: ${c.path} is the committed PNG byte for byte`, !!old && Buffer.compare(png, old) === 0,
    old ? `${png.length} bytes against ${old.length}` : 'no committed file of that name');
}

// 2. the build finds no picture in a folder without one, and then makes the plain cards
const empty = await mkdtemp(join(tmpdir(), 'share-bg-empty-'));
const none = await shareBackground(empty);
const plainSet = await shareCards(none);
ok('a folder with no share-bg file gives no picture, and the build cards are the plain ones',
  none === null && plainSet.site.path === siteCard().path && plainSet.ig.path === igCard().path && plainSet.hello.path === helloCard().path);

// 3. a bright picture: a sky running to white with a white sun under the headline, made by resvg
const dir = await mkdtemp(join(tmpdir(), 'share-bg-'));
const sky = (sun) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb8ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><circle cx="${sun}" cy="300" r="200" fill="#ffffff"/></svg>`;
await writeFile(join(dir, 'share-bg.png'), await renderPng(sky(700), 1600));
const bg = await shareBackground(dir);
ok('the build reads the picture and its size with no decoder', bg?.width === 1600 && bg?.height === 1000 && bg.href.startsWith('data:image/png;base64,'),
  bg ? `${bg.file} ${bg.width}x${bg.height}` : 'none');
const set = await shareCards(bg);
const cards = [set.site, set.ig, set.hello];
ok('all three cards carry the picture and a scrim, under names that are not the plain ones',
  cards.every((c, i) => c.svg.includes('<image href="data:image/png;base64,') && /fill-opacity="0\.\d+"/.test(c.svg)
    && c.path !== [siteCard(), igCard(), helloCard()][i].path),
  cards.map((c) => `${c.path} scrim ${c.scrim}`).join(', '));

// the contrast, read off resvg's raster of the ground alone (picture plus scrim, no text)
const LIN = Float64Array.from({ length: 256 }, (_, v) => { const u = v / 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; });
async function measured(c, scrim) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}">${ground(c.width, c.height, { ...bg, scrim })}</svg>`;
  const px = await renderPixels(svg, c.width);
  let worst = Infinity;
  for (const r of c.regions) {
    const ink = Math.min(...r.inks.map(luminance));
    for (let y = Math.max(0, r.y | 0); y < Math.min(c.height, r.y + r.height); y++) for (let x = Math.max(0, r.x | 0); x < Math.min(c.width, r.x + r.width); x++) {
      const i = (y * c.width + x) * 4;
      worst = Math.min(worst, ratio(ink, 0.2126 * LIN[px[i]] + 0.7152 * LIN[px[i + 1]] + 0.0722 * LIN[px[i + 2]]));
    }
  }
  return worst;
}
for (const c of cards) {
  const at = await measured(c, c.scrim), lighter = await measured(c, c.scrim - 0.05), none0 = await measured(c, 0);
  ok(`${c.path}: every text block reads at ${CONTRAST}:1 or better off resvg's raster`, at >= CONTRAST - 0.05, `${at.toFixed(2)}:1 at scrim ${c.scrim}`);
  ok(`${c.path}: NEGATIVE CONTROL, a scrim 0.05 lighter falls under ${CONTRAST}:1, so the scrim is the least that passes`, lighter < CONTRAST, `${lighter.toFixed(2)}:1`);
  if (c === cards[0]) ok('NEGATIVE CONTROL: with no scrim the white sun under the headline fails outright', none0 < 2, `${none0.toFixed(2)}:1`);
}

// 4. the name follows the picture: another picture, or another focus, is another URL
await writeFile(join(dir, 'share-bg.png'), await renderPng(sky(1100), 1600));
const moved = await shareCards(await shareBackground(dir));
await writeFile(join(dir, 'share-bg.json'), JSON.stringify({ focus: [0, 1] }));
const refocused = await shareCards(await shareBackground(dir));
ok('another picture is another name, and so is another focus',
  moved.site.path !== set.site.path && refocused.site.path !== moved.site.path && refocused.ig.path !== moved.ig.path,
  `${set.site.path}, ${moved.site.path}, ${refocused.site.path}`);

// 5. two pictures is a refusal, not a choice
await writeFile(join(dir, 'share-bg.jpg'), Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
let threw = '';
try { await shareBackground(dir); } catch (e) { threw = e.message; }
ok('NEGATIVE CONTROL: two share-bg files stop the build rather than pick one', /more than one/.test(threw), threw);

// 6. imageSize reads a PNG's IHDR and a JPEG's SOF, and nothing else
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
const j = imageSize(jpeg);
ok('a JPEG\'s size comes from its SOF marker, after an APP0 it skips', j?.width === 800 && j?.height === 600 && j.type === 'image/jpeg', JSON.stringify(j));
ok('NEGATIVE CONTROL: bytes that are neither give no size', imageSize(new TextEncoder().encode('GIF89a not a picture here')) === null);

await rm(dir, { recursive: true, force: true });
await rm(empty, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
