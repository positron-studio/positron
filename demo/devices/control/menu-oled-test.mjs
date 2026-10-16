// node demo/devices/control/menu-oled-test.mjs: the patchbay manager's menu model and its frames, no browser.
import { createPiModel, PATCHES, MENU, HOLD_MS, LOAD_MS, W, H } from './menu-oled.mjs';
import { pixel, strays, lit } from '../split/split-oled.mjs';

let ok = 0, bad = 0;
const check = (label, pass, detail = '') => { if (pass) ok++; else bad++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); };
const SCREEN = [{ x: 0, y: 0, w: W, h: H }];

let changes = 0;
const m = createPiModel({ onChange: () => { changes++; } });
let f = m.frame(0);
check('a fresh board shows the menu with nothing playing', f.view === 'menu' && m.s.playing === null && f.length === 1024);
check('the menu draws ink and none outside 128x64', lit(f) > 0 && strays(f, SCREEN).length === 0, `${lit(f)} lit`);
check('the selected row is a filled box: its left edge is lit', pixel(f, 0, MENU.rowY(0) + 1) === 1 && pixel(f, 0, MENU.rowY(1) + 1) === 0);

m.key(2, true, 10); m.key(2, false, 20);
check('v moves the selection down one row', m.s.sel === 1);
m.key(1, true, 30); m.key(1, false, 40);
check('^ moves it back', m.s.sel === 0);
m.key(1, true, 50); m.key(1, false, 60);
check('^ on the first row wraps to the last, and the list scrolls to show it', m.s.sel === PATCHES.length - 1 && m.s.top === PATCHES.length - MENU.rows);
m.key(2, true, 70); m.key(2, false, 80);

m.key(3, true, 100); m.key(3, false, 110);
check('# loads the selected row: loading first', m.s.loading === 'drums' && m.frame(120).view === 'loading');
m.tick(100 + LOAD_MS);
check('after the load the patch plays on its steps screen', m.s.playing === 'drums' && m.s.seq.running && m.frame(100 + LOAD_MS).view === 'steps');
check('the drums patch holds its two links', m.links().length === 2 && m.links()[0].includes('drummap gm'));
const f2 = m.frame(600);
check('the steps screen draws inside the panel', lit(f2) > 0 && strays(f2, SCREEN).length === 0);

const t0 = 1000;
m.key(4, true, t0);
m.tick(t0 + HOLD_MS - 1);
const half = m.frame(t0 + 500);
check('while * is held the bar fills along the bottom', pixel(half, 10, MENU.barY) === 1 && pixel(half, W - 10, MENU.barY) === 0);
m.key(4, false, t0 + HOLD_MS - 1);
check('NEGATIVE CONTROL: * held 999 ms does not stop all', m.s.playing === 'drums' && m.s.stops === 0);
check('it was a tap, which stopped the sequencer and nothing else', !m.s.seq.running);

const t1 = 3000;
m.key(4, true, t1);
m.tick(t1 + HOLD_MS);
check('* held 1000 ms stops all, while still held', m.s.playing === null && m.s.stops === 1 && m.links().length === 0);
m.key(4, false, t1 + 1500);
check('releasing it afterwards does nothing more', m.s.stops === 1 && m.frame(t1 + 1600).view === 'menu');

m.load('keys', 5000); m.tick(5000 + LOAD_MS);
m.key(2, true, 6000); m.key(2, false, 6010);
check('in keys, v moves the keyboard to channel 2 and the link line follows', m.links()[0].endsWith('{ channel 2 }'));
m.key(1, true, 6100); m.key(2, true, 6110);
check('^ and v together open the menu', m.frame(6120).view === 'menu' && m.s.playing === 'keys');
m.key(1, false, 6200); m.key(2, false, 6200);
m.stop(7000);
check('stop from the remote clears the record', m.s.playing === null && m.s.stops === 2);
check('onChange was called', changes > 10, `${changes}`);

console.log(`\n${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
