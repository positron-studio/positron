// demo/shell/present-keys.mjs: what every presentation page (/kit/present/, /present/<slug>/) does the same way
// as the radio slides (/radio1965/, /huddersfield/): the arrow keys step, Esc closes, and the Kyiv air raid
// view (kyiv-raid.mjs) covers the page with the hours of the war, only by hand: r shows a simulated raid or takes it away,
// Esc hides a raid until the next one, ?raid=1 shows one on load. During a raid every `.pres-ui` fades out.

import { createKyivRaid } from './kyiv-raid.mjs';
// Only by hand: a presentation page never asks v2in, so a real raid reaches the radio pages alone (the owner, 2026-11-11).

const CSS = `
  .pres-ui { transition: opacity 1s; }
  body.raid .pres-ui { opacity: 0; visibility: hidden; transition: opacity 1s, visibility 0s 1s; }
`;

/**
 * `createPresentKeys({ prev, next, escape })`: `prev()` and `next()` on the arrow keys, `escape()` on Esc when no
 * raid is showing. Answers `{ raid, setRaid, simulate }`. Mark the page's own UI roots with the class `pres-ui`.
 */
export function createPresentKeys({ prev = () => {}, next = () => {}, escape = () => {}, onRaid = () => {} } = {}) {
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
  // `onRaid(on)` whenever the raid shows or goes, by v2in or by hand: a radio page cuts its sound on it
  const kyiv = createKyivRaid({ onChange: (r) => onRaid(!!r?.on) });
  // over the page's own layers, which are hidden while it shows
  kyiv.el.style.zIndex = '100';
  kyiv.el.classList.add('pos-out');
  document.body.append(kyiv.el);
  let raidOff = false;
  const simulated = () => ({ on: true, since: new Date(Date.now() - 36e5).toISOString() });
  /** A raid from a source (`{ on, since }` or null): Esc keeps it hidden until it ends. */
  const setRaid = (r) => { if (!r?.on) raidOff = false; if (!raidOff) kyiv.set(r); };
  const simulate = () => { raidOff = false; kyiv.set(kyiv.raid().on ? null : simulated()); };
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'Escape') { if (kyiv.raid().on) { raidOff = true; kyiv.set(null); } else escape(); }
    else if (e.key === 'r' || e.key === 'R') simulate();
  });
  if (new URLSearchParams(location.search).get('raid') === '1') kyiv.set(simulated());
  return { raid: () => kyiv.raid(), setRaid, simulate };
}
