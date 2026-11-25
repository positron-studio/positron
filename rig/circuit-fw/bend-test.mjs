// node rig/circuit-fw/bend-test.mjs: patch A in emulation, against stock as the control.
// Runs the dispatcher from 0x08020508 with the state the stock code leaves there.
// why: plans/plan-circuit-firmware.md section 5 step 3
import { readFileSync } from 'node:fs';
import { readFirmware } from '../../demo/shell/circuit-firmware.mjs';
import { build } from './build.mjs';
import { createCpu } from './emu.mjs';

const BASE = 0x08008000, HOOK = 0x08020508, DSP_WRITE = 0x0801633C;
const NOTE_ON = 0x08020516, NOTE_OFF = 0x0802052A, EXIT = 0x08020582;
const STOPS = [NOTE_ON, NOTE_OFF, EXIT];   // the stock paths, entered and not followed

const stock = readFirmware(new Uint8Array(readFileSync(new URL('../../purchased/circuit-firmware/circuit-firmware-3592.syx', import.meta.url)))).image;
const patched = readFirmware((await build(['bend'])).out).image;

let pass = 0, fail = 0;
const ok = (name, cond, got) => { cond ? pass++ : fail++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : `  (got ${got})`}`); };

// The part object: byte 4 = Synth 1's channel (0), byte 5 = Synth 2's (1). The message sits after it.
function send(image, bytes) {
  const cpu = createCpu({ image, base: BASE, stubs: { [DSP_WRITE]: () => {} } });
  cpu.ram.set([0, 0, 0, 0, 0, 1], 0x100);
  cpu.ram.set(bytes, 0x200);
  const status = bytes[0];
  Object.assign(cpu.r, { 3: status & 0xF0, 4: 0x20000100, 5: 0x20000200, 6: status & 0x0F });
  const end = cpu.run(HOOK, STOPS);
  const w = cpu.calls.filter((c) => c.at === DSP_WRITE).map((c) => ({ value: c.args[0] >>> 0, addr: c.args[1] }));
  return { end, w };
}
const hx = (n) => `0x${(n >>> 0).toString(16)}`;

let s = send(stock, [0xE0, 0x00, 0x40]);
ok('CONTROL stock: bend on Synth 1 reaches the exit with no DSP write', s.end === EXIT && s.w.length === 0, `${hx(s.end)} ${s.w.length}`);
s = send(stock, [0x90, 60, 100]);
ok('CONTROL stock: note on goes to the note on path', s.end === NOTE_ON, hx(s.end));

let p = send(patched, [0xE0, 0x00, 0x40]);
ok('bend centre on Synth 1 writes DSP 727 with 0', p.end === EXIT && p.w.length === 1 && p.w[0].addr === 727 && p.w[0].value === 0, JSON.stringify(p.w));
p = send(patched, [0xE0, 0x7F, 0x7F]);
ok('bend top writes 0x1FFF << 18', p.w[0]?.value === 0x7FFC0000, hx(p.w[0]?.value));
p = send(patched, [0xE0, 0x00, 0x00]);
ok('bend bottom writes -0x2000 << 18', p.w[0]?.value === 0x80000000, hx(p.w[0]?.value));
p = send(patched, [0xE1, 0x00, 0x60]);
ok('bend on Synth 2 writes DSP 1097 (370 + 727)', p.w.length === 1 && p.w[0].addr === 1097, JSON.stringify(p.w));
p = send(patched, [0xE9, 0x00, 0x60]);
ok('bend on the drum channel writes nothing and falls through to stock', p.end === EXIT && p.w.length === 0, `${hx(p.end)} ${p.w.length}`);
p = send(patched, [0x90, 60, 100]);
ok('note on still goes to the note on path', p.end === NOTE_ON && p.w.length === 0, hx(p.end));
p = send(patched, [0x80, 60, 0]);
ok('note off still goes to the note off path', p.end === NOTE_OFF && p.w.length === 0, hx(p.end));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
