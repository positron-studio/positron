// node demo/shell/circuit-firmware-test.mjs: the firmware container, synthetic first, then the real file if it is on disk.
// The real file lives in purchased/circuit-firmware/ and is never committed.
import { existsSync, readFileSync } from 'node:fs';
import { decodeBlock, encodeBlock, readFirmware, writeFirmware } from './circuit-firmware.mjs';

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const block = Uint8Array.from({ length: 32 }, (_, i) => (i * 73 + 11) & 0xFF);
for (const pad of [0, 5, 7]) {
  const packed = encodeBlock(block, pad);
  const back = decodeBlock(packed);
  ok(`block round trip, pad ${pad}`, packed.length === 37 && packed.every((b) => b < 0x80) && same(back.block, block) && back.pad === pad);
}
const bad = encodeBlock(block); bad[3] |= 0x80;
let threw = false; try { decodeBlock(bad); } catch { threw = true; }
ok('NEGATIVE CONTROL: a high bit in a packed block throws', threw);
const flipped = encodeBlock(block); flipped[10] ^= 0x01;
ok('NEGATIVE CONTROL: one flipped packed bit changes the block', !same(decodeBlock(flipped).block, block));

const file = new URL('../../purchased/circuit-firmware/circuit-firmware-3592.syx', import.meta.url);
if (!existsSync(file)) console.log('skip the real file: purchased/circuit-firmware/circuit-firmware-3592.syx is not on this disk');
else {
  const raw = new Uint8Array(readFileSync(file));
  const fw = readFirmware(raw);
  ok('3592: 5981 messages, image 191,360 bytes', fw.messages.length === 5981 && fw.image.length === 191360);
  ok('3592: INIT carries build digits 3 5 9 2', same([...fw.init], [0x00, 0x79, 0x00, 0x00, 0x03, 0x05, 0x09, 0x02]));
  ok('3592: rebuilt byte for byte', same(writeFirmware(fw.image, fw), raw));
  const sp = new DataView(fw.image.buffer).getUint32(0, true);
  ok('3592: block 0 is a vector table (SP in SRAM)', sp >>> 24 === 0x20);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
