// Reads an original Novation Circuit firmware .syx into its flat image, and writes it back.
// INIT (0x71), WRITE (0x72) per 32 byte block, FINISH (0x73) carrying block 0 last.
// Each block is 256 bits cut into 37 seven-bit bytes, MSB first, 3 trailing pad bits.
// why: research/circuit-firmware-2026-11-25.md

const HEAD = [0xF0, 0x00, 0x20, 0x29, 0x00];
export const INIT = 0x71, WRITE = 0x72, FINISH = 0x73;
const BLOCK = 32, PACKED = 37;

export function splitMessages(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length;) {
    if (bytes[i] !== 0xF0) throw new Error(`expected F0 at ${i}`);
    const end = bytes.indexOf(0xF7, i);
    if (end < 0) throw new Error(`unterminated SysEx at ${i}`);
    const raw = bytes.subarray(i, end + 1);
    if (!HEAD.every((b, k) => raw[k] === b)) throw new Error(`not a Novation update message at ${i}`);
    out.push({ command: raw[5], payload: raw.subarray(6, raw.length - 1), offset: i });
    i = end + 1;
  }
  return out;
}

export function decodeBlock(p) {
  if (p.length !== PACKED) throw new Error(`block is ${p.length} bytes, not ${PACKED}`);
  const out = new Uint8Array(BLOCK);
  let acc = 0, n = 0, o = 0;
  for (const v of p) {
    if (v & 0x80) throw new Error('high bit set in a packed block');
    acc = (acc << 7) | v; n += 7;
    while (n >= 8 && o < BLOCK) { n -= 8; out[o++] = (acc >> n) & 0xFF; }
    acc &= (1 << n) - 1;
  }
  return { block: out, pad: acc };
}

export function encodeBlock(block, pad = 0) {
  const out = new Uint8Array(PACKED);
  let acc = 0, n = 0, o = 0;
  for (const b of [...block]) {
    acc = (acc << 8) | b; n += 8;
    while (n >= 7) { n -= 7; out[o++] = (acc >> n) & 0x7F; }
    acc &= (1 << n) - 1;
  }
  out[o] = ((acc << 3) | pad) & 0x7F;   // 256 bits leave 4 over, plus 3 pad bits
  return out;
}

export function readFirmware(bytes) {
  const msgs = splitMessages(bytes);
  const init = msgs.filter(m => m.command === INIT);
  const fin = msgs.filter(m => m.command === FINISH);
  const writes = msgs.filter(m => m.command === WRITE);
  if (init.length !== 1 || fin.length !== 1 || !writes.length) throw new Error(`want 1 INIT, 1 FINISH, some WRITEs; got ${init.length}/${fin.length}/${writes.length}`);
  const blocks = [fin[0], ...writes].map(m => decodeBlock(m.payload));
  const image = new Uint8Array(blocks.length * BLOCK);
  blocks.forEach((b, i) => image.set(b.block, i * BLOCK));
  return { init: init[0].payload, image, pads: blocks.map(b => b.pad), messages: msgs };
}

export function writeFirmware(image, template) {
  const { messages } = template;
  const order = [messages.findIndex(m => m.command === FINISH),
    ...messages.flatMap((m, i) => (m.command === WRITE ? [i] : []))];
  if (order.length * BLOCK !== image.length) throw new Error('image size differs from the template');
  const payloads = new Map(order.map((mi, bi) => [mi, encodeBlock(image.subarray(bi * BLOCK, bi * BLOCK + BLOCK), template.pads[bi])]));
  const parts = messages.map((m, i) => Uint8Array.of(...HEAD, m.command, ...(payloads.get(i) ?? m.payload), 0xF7));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
