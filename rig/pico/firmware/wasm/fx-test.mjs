// node rig/pico/firmware/wasm/fx-test.mjs [path/to/oled-ui.wasm]: fx.c through oled-ui.wasm.
// Identities that must hold exactly, determinism by seed, and a negative control
// proving the comparison can fail.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WASM = process.argv[2] || join(here, '../../../../demo/resources/pico/oled-ui.wasm');
let fails = 0;
const check = (step, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  (${detail})` : ''}`); if (!ok) fails++; };

const mod = await WebAssembly.compile(readFileSync(WASM));
check('the module imports nothing', WebAssembly.Module.imports(mod).length === 0);
const { exports: U } = await WebAssembly.instantiate(mod, {});
const frame = () => new Uint8Array(U.memory.buffer, U.fb(), 1024);
const snap = () => Uint8Array.from(frame());
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const lit = (f) => f.reduce((n, b) => { for (; b; b &= b - 1) n++; return n; }, 0);
const set = (x, y) => { frame()[(y >> 3) * 128 + x] |= 1 << (y & 7); };
const put = (s) => { const a = U.str(0), b = new TextEncoder().encode(s); new Uint8Array(U.memory.buffer).set(b, a); new Uint8Array(U.memory.buffer)[a + b.length] = 0; };
const scene = () => { U.begin(-1); put('POSITRON'); U.text_big(8, 20); U.rect(2, 2, 124, 60); };

// negative control first: the comparison must notice one bit
scene(); const a0 = snap(); frame()[500] ^= 4; const a1 = snap();
check('negative control: one flipped bit makes two frames differ', !same(a0, a1));

// determinism
const run = (seed) => { U.fx_seed_(seed); const out = []; for (let i = 0; i < 12; i++) { scene(); U.fx_feedback_(1, 0, 264, 3, 930, 1); U.fx_bitrot_(2000); U.fx_slip_(300, 9); U.fx_stale_(200); U.fx_shown_(); out.push(snap()); } return out; };
const r1 = run(42), r2 = run(42), r3 = run(43);
check('same seed, same calls: the same twelve frames', r1.every((f, i) => same(f, r2[i])));
check('another seed: some frame differs', r1.some((f, i) => !same(f, r3[i])));

// identities
scene(); let s = snap(); U.fx_wrap_(1024); check('wrap by 1024 bytes is no change', same(s, snap()));
U.fx_wrap_(1); check('wrap by 1 byte is a change', !same(s, snap()));
scene(); s = snap(); U.fx_roll_(64); check('roll by 64 lines is no change', same(s, snap()));
scene(); s = snap(); U.fx_mirror_(1, 1); check('mirroring changes the frame', !same(s, snap()));
U.fx_mirror_(1, 1); check('mirroring twice is no change', same(s, snap()));
scene(); s = snap(); U.fx_bitrot_(0); check('bitrot 0 is no change', same(s, snap()));
U.fx_bitrot_(50000); check('bitrot 5% changes the frame', !same(s, snap()));

// feedback
U.fx_seed_(1); scene(); U.fx_feedback_(0, 0, 256, 0, 1000, 0); const fb1 = snap();
U.begin(-1); U.fx_feedback_(0, 0, 256, 0, 1000, 0);
check('feedback that keeps everything and moves nothing returns the last result', same(fb1, snap()));
U.begin(-1); U.fx_feedback_(0, 0, 256, 0, 0, 0); check('feedback that keeps nothing is dark', lit(snap()) === 0);
U.fx_seed_(1); scene(); U.fx_grey_(0, 0, 256, 0, 0, 0); const g = snap(); scene();
check('grey feedback with decay 0 and threshold dither is the drawing itself', same(g, snap()));

// stale pages and hold
U.fx_seed_(5); scene(); U.fx_shown_(); const shown = snap(); U.begin(-1); U.fx_stale_mask_(0xff);
check('every page stale shows the last frame', same(shown, snap()));
U.begin(-1); U.fx_hold_(); check('hold shows the last frame', same(shown, snap()));
U.begin(-1); U.fx_stale_mask_(0x01); const st = snap();
check('one stale page restores 128 bytes and no more', same(st.subarray(0, 128), shown.subarray(0, 128)) && lit(st.subarray(128)) === 0);

// cellular automaton: a blinker has period 2, a block is still
U.begin(-1); set(10, 10); set(11, 10); set(12, 10); const b0 = snap();
const conway = [1 << 3, (1 << 2) | (1 << 3)];
U.fx_life_(...conway); const b1 = snap(); U.fx_life_(...conway);
check('a blinker changes, then returns after two steps', !same(b0, b1) && same(b0, snap()));
U.begin(-1); set(40, 40); set(41, 40); set(40, 41); set(41, 41); const k0 = snap(); U.fx_life_(...conway);
check('a block is still', same(k0, snap()));

// lfsr and databend
U.begin(-1); U.fx_lfsr_(0xb400, 1, 1000); check('lfsr at full density lights pixels', lit(snap()) > 0);
U.begin(-1); U.fx_lfsr_(0, 1, 1000); check('lfsr with no taps does nothing', lit(snap()) === 0);
U.begin(-1); U.fx_memview_(0, 0); check('a font table drawn as the frame lights pixels', lit(snap()) > 0);

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
