// node demo/shot.mjs <slug> [widths] [--hash id] [--base url] [--clip px] [--query k=v] One picture
// per width via Emulation.setDeviceMetricsOverride (window resizing is not the viewport). A look,
// not a grade: no self-check, and never pointed at somebody else's server.
// why: lessons/harness.md#shot

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launchChrome, connectCdp } from './chrome.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// iPhone mini (375 x 812 at 3x, the narrowest iPhone), iPad portrait, the desk. Any width can be
// passed to reproduce a report, e.g. 360 for an ordinary Android.
// why: lessons/harness.md#widths
const WIDTHS = [375, 768, 1280];
/** The mini's own height and density, so a phone shot is a shot of a phone. */
const PHONE = { height: 812, dpr: 3 };

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
// A number after a flag is that flag's value, not a width.
// why: lessons/harness.md#flag-values
const bare = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
const slug = bare.find((a) => !/^\d+$/.test(a));
const widths = bare.filter((a) => /^\d+$/.test(a)).map(Number);
const BASE = flag('base', process.env.DEMO_BASE || 'http://127.0.0.1:8890');
const HASH = flag('hash', '');
// --eval: an expression run in the page after the wait, e.g. stepping a deck
const EVAL = flag('eval', '');
// The page's query string, without the `?`. Kept out of the file name, so a
// URL in it cannot turn into directories.
const QUERY = flag('query', '');
const CLIP = Number(flag('clip', 0)) || 0;
const WAIT = Number(flag('wait', 2500));
const OUT = flag('out', 'tmp/shots');

if (!slug) {
  console.error('usage: node demo/shot.mjs <slug> [width ...] [--base URL] [--query k=v] [--hash id] [--eval js] [--clip px] [--wait ms] [--out dir]');
  process.exit(2);
}

// Muted and with no autoplay gesture: a shot must not start a sound.
// why: lessons/harness.md#muted
const browser = await launchChrome({ prefix: 'positron-shot', args: ['--disable-gpu', '--mute-audio'] });
const cdp = await connectCdp(browser.wsUrl);
const { ws } = cdp;
const { S } = await cdp.page();
await S('Page.enable');
await S('Runtime.enable');

await mkdir(OUT, { recursive: true });
const shots = [];

for (const w of (widths.length ? widths : WIDTHS)) {
  // `mobile` follows the width, since a phone honours the viewport meta and reports touch.
  // deviceScaleFactor 3 on the phone, the mini's own, so hairlines are captured at their real
  // density.
  // why: lessons/harness.md#mobile
  const mobile = w <= 560;
  await S('Emulation.setDeviceMetricsOverride', {
    width: w, height: mobile ? PHONE.height : 900, deviceScaleFactor: mobile ? PHONE.dpr : 1, mobile,
  });
  // `maxTouchPoints` only when enabling: CDP refuses 0.
  // why: lessons/harness.md#touch-points
  await S('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });

  const url = `${BASE}/${slug}/${QUERY ? `?${QUERY}` : ''}${HASH ? `#${HASH}` : ''}`;
  await S('Page.navigate', { url });
  await sleep(WAIT);
  if (EVAL) {
    // and prints what it returns, so one shot can also be a measurement
    const r = await S('Runtime.evaluate', { expression: EVAL, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r?.result?.value !== undefined) console.log(`  eval at ${w} px: ${typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value)}`);
    await sleep(400);
  }
  if (HASH) {
    // Set the hash again after the wait: a tabbed page overwrites it on its first `go`.
    // why: lessons/harness.md#hash-again
    await S('Runtime.evaluate', {
      expression: `location.hash = ${JSON.stringify(`#${HASH}`)};
        document.getElementById(${JSON.stringify(HASH)})?.scrollIntoView({block:'start'});`,
    });
    await sleep(400);
  }

  const { result } = await S('Runtime.evaluate', {
    expression: `JSON.stringify({
      w: innerWidth, h: document.documentElement.scrollHeight,
      // 🔴 AGAINST clientWidth, NOT innerWidth. MEASURED 2026-09-26 on /eccm/ at
      // 375: a title with no break opportunity ran the page to 404 px, and
      // mobile Chrome widened the LAYOUT viewport to match, so innerWidth read
      // 404 as well and this line printed no overflow on a page that had 29 px
      // of it. clientWidth is the initial containing block and stays 375.
      dpr: devicePixelRatio, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      top: ${JSON.stringify(HASH)} ? Math.max(0, Math.floor((document.getElementById(${JSON.stringify(HASH)}) || document.body).getBoundingClientRect().top + scrollY) - 8) : 0,
    })`, returnByValue: true,
  });
  const page = JSON.parse(result.value);
  // With --hash the capture and its 6000 px ceiling start at the block, or a deep block's height
  // goes negative.
  // why: lessons/harness.md#clip-from-block
  const height = Math.min(CLIP || 6000, page.h - page.top);

  const { data } = await S('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: page.top, width: w, height, scale: 1 },
  });
  // A nested slug is one file name (`kit/input` -> `kit-input`).
  // why: lessons/harness.md#nested-slug
  const file = join(OUT, `${slug.replace(/\//g, '-')}-${w}${HASH ? `-${HASH}` : ''}.png`);
  await writeFile(file, Buffer.from(data, 'base64'));
  shots.push({ w, file, page, height });

  // Sideways overflow is printed with every shot: a clipped picture cannot show it.
  // why: lessons/harness.md#overflow
  console.log(`  ${String(w).padStart(4)} px  ${page.overflow ? `⚠ ${page.overflow} px OF SIDEWAYS OVERFLOW  ` : ''}${height} px tall  ${file}`);
}

await S('Emulation.clearDeviceMetricsOverride').catch(() => {});
ws.close();
await browser.close();

const bad = shots.filter((s) => s.page.overflow > 0);
console.log(`\n${shots.length} shot(s) of /${slug}/${bad.length ? `, ${bad.length} with sideways overflow` : ', none dragging the page sideways'}`);
process.exit(bad.length ? 1 : 0);
