// demo/shell/kyiv-raid.mjs: /social/kyiv/'s hours of the war, light look, as a full page layer while v2in's raid gate
// is on. Raid hours black, the rest white, a week a row; the running raid is the newest cells, blinking.
//   const raid = createKyivRaid({ onChange }); document.body.append(raid.el); raid.set(j.raid);   // { on, since }
import { drawDays, layoutDays, cellAt } from '/shell/day-grid.mjs';

const TZ = 'Europe/Kyiv', COLS = 168;
const COLOURS = { 1: '#000000', 0: '#ffffff', 2: '#ffffff', 3: '#000000' };
const kyivParts = (t) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(t).map((p) => [p.type, p.value]));
// the data has 24 hours a day from `start`, Kyiv's clock, so an hour's index is whole days times 24 plus the clock hour
function hourIndex(start, t) {
  const p = kyivParts(t), [y, m, d] = start.split('-').map(Number);
  return Math.round((Date.UTC(+p.year, p.month - 1, +p.day) - Date.UTC(y, m - 1, d)) / 864e5) * 24 + +p.hour;
}
export const kyivClock = (t) => { const p = kyivParts(t); return `${p.hour}:${p.minute}`; };

export function createKyivRaid({ onChange } = {}) {
  const el = document.createElement('canvas');
  el.className = 'kyiv-raid';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, { position: 'fixed', inset: '0', width: '100vw', height: '100dvh', zIndex: '10', display: 'block',
    background: '#fff', opacity: '0', transition: 'opacity 1s', pointerEvents: 'none', visibility: 'hidden' });
  let data = null, loading = null, raid = { on: false, since: null }, g = null, hours = '', blinkT = 0, lit = true;
  const load = () => (loading ||= fetch('/resources/ua-alerts/kyiv-days.json').then((r) => r.json()).then((j) => { data = j; }).catch(() => {}));

  function draw() {
    if (!data || !raid.on) return;
    const now = Date.now(), ni = hourIndex(data.start, now);
    const si = raid.since ? Math.min(ni, hourIndex(data.start, Date.parse(raid.since))) : ni;
    // after the data ends the hours are unknown and white, and the running raid is 3
    let s = data.hours.slice(0, ni + 1).padEnd(ni + 1, '2').split('');
    for (let i = Math.max(0, si); i <= ni; i++) s[i] = '3';
    hours = s.join('');
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    el.width = w; el.height = h;
    g = drawDays(el.getContext('2d'), { days: hours, w, h, gap: 0, group: 24, edge: 'bottom', cols: COLS, colours: COLOURS, bg: '#ffffff' });
  }
  function blink() {
    clearTimeout(blinkT);
    if (!raid.on || !g) return;
    lit = !lit;
    const ctx = el.getContext('2d');
    ctx.fillStyle = lit ? COLOURS[3] : '#9a9a9a';
    for (let i = hours.indexOf('3'); i >= 0 && i < hours.length; i++) { const c = cellAt(g, 0, i); ctx.fillRect(c.x, c.y, c.w, c.h); }
    blinkT = setTimeout(blink, 800);
  }
  addEventListener('resize', () => { draw(); });

  async function set(r) {
    const on = !!r?.on, since = r?.since ?? null, was = raid.on;
    raid = { on, since };
    if (on) {
      await load();
      if (!raid.on) return;
      draw(); blink();
      el.style.visibility = 'visible'; el.style.transition = 'opacity 1s';
      requestAnimationFrame(() => { el.style.opacity = '1'; });
    } else {
      clearTimeout(blinkT);
      el.style.opacity = '0'; el.style.transition = 'opacity 1s, visibility 0s 1s'; el.style.visibility = 'hidden';
    }
    document.body.classList.toggle('raid', on);
    if (on !== was || on) onChange?.(raid);
  }
  return { el, set, raid: () => ({ ...raid }), layout: () => g, cells: () => hours };
}
