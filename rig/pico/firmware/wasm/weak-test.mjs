// node rig/pico/firmware/wasm/weak-test.mjs [weak.wasm] [weak.mjs]: weak.c, through the
// wasm and through its JS twin. Identities, determinism, the two must agree byte for byte,
// and a negative control proving the comparison can fail.
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
const RES = fileURLToPath(new URL('../../../../demo/resources/weak/', import.meta.url));
const [wasmPath = RES + 'weak.wasm', jsPath = RES + 'weak.mjs'] = process.argv.slice(2);
let fails = 0;
const check = (name, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? `  (${d})` : ''}`); if (!ok) fails++; };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const mod = await WebAssembly.compile(readFileSync(wasmPath));
check('the module imports nothing', WebAssembly.Module.imports(mod).length === 0);
const { createWeak } = await import(pathToFileURL(jsPath).href);
const W = 160, H = 96, CH = 4;

// a moving scene with a cut halfway, so residuals onto a damaged base show
function scene(t, out) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, cut = t >= 30;
    out[i] = cut ? (x * 2 + t * 3) & 255 : (y * 3) & 255;
    out[i + 1] = cut ? 40 : (x + t * 5) & 255;
    out[i + 2] = ((x ^ y) + t) & 255;
    out[i + 3] = 255;
  }
  return out;
}
async function wasmRun(signal, seed, frames, block = 16, gop = 25) {
  const { exports: E } = await WebAssembly.instantiate(mod, {});
  E.init(W, H, CH, block, gop, seed);
  const res = [];
  for (let t = 0; t < frames; t++) {
    const f = new Uint8Array(E.memory.buffer, E.frame_ptr(), W * H * CH);
    scene(t, f); const flags = E.step(typeof signal === 'function' ? signal(t) : signal);
    res.push({ flags, px: Uint8Array.from(new Uint8Array(E.memory.buffer, E.frame_ptr(), W * H * CH)) });
  }
  return res;
}
function jsRun(signal, seed, frames, block = 16, gop = 25) {
  const k = createWeak({ w: W, h: H, ch: CH, block, gop, seed }), res = [];
  for (let t = 0; t < frames; t++) {
    const f = scene(t, new Uint8Array(W * H * CH));
    const flags = k.step(f, typeof signal === 'function' ? signal(t) : signal);
    res.push({ flags, px: f });
  }
  return res;
}

// negative control first
const a = scene(3, new Uint8Array(W * H * CH)), b = Uint8Array.from(a); b[777] ^= 1;
check('negative control: one changed byte makes frames differ', !same(a, b));

const perfect = await wasmRun(1000, 7, 60);
check('perfect signal: every frame is the clean picture', perfect.every((r, t) => same(r.px, scene(t, new Uint8Array(W * H * CH)))));

const dead = await wasmRun(0, 7, 10);
check('no signal: the flag is set every frame', dead.every((r) => r.flags & 1));
check('no signal from the start: the screen stays black', dead.every((r) => r.px.every((v, i) => (i % 4 === 3 ? true : v === 0))));

const weakA = await wasmRun(700, 42, 60), weakB = await wasmRun(700, 42, 60), weakC = await wasmRun(700, 43, 60);
check('same seed, same frames', weakA.every((r, i) => same(r.px, weakB[i].px)));
check('another seed, some frame differs', weakA.some((r, i) => !same(r.px, weakC[i].px)));
check('weak signal damages some frame', weakA.some((r, t) => !same(r.px, scene(t, new Uint8Array(W * H * CH)))));
check('alpha never touched', weakA.every((r) => r.px.every((v, i) => i % 4 !== 3 || v === 255)));
check('I-frame flag every 25 frames', weakA.every((r, t) => !!(r.flags & 2) === (t % 25 === 0)));

const ramp = (t) => 1000 - t * 15;   // signal falling through every regime
for (const [block, label] of [[16, '16 px'], [8, '8 px']]) {
  const wr = await wasmRun(ramp, 99, 70, block), jr = jsRun(ramp, 99, 70, block);
  check(`wasm and JS agree byte for byte, falling signal, ${label} blocks`,
    wr.every((r, i) => r.flags === jr[i].flags && same(r.px, jr[i].px)));
}
// time per frame at 640x360 RGBA, wasm
{
  const { exports: E } = await WebAssembly.instantiate(mod, {});
  E.init(640, 360, 4, 16, 50, 1);
  const f = new Uint8Array(E.memory.buffer, E.frame_ptr(), 640 * 360 * 4);
  const t0 = performance.now();
  for (let t = 0; t < 100; t++) { f.fill(t & 255); E.step(600); }
  console.log(`time: ${((performance.now() - t0) / 100).toFixed(2)} ms a frame at 640x360 RGBA, signal 600 (this machine, one core)`);
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
