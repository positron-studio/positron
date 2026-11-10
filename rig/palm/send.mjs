#!/usr/bin/env node
// Pi side of the frame app: writes 160x160 1 bit test frames to the Palm's
// USB serial port and prints the stylus lines that come back. UNTESTED on the
// device: which tty the app's port appears on is the open question.
//
//   sudo modprobe visor                       # pilot-xfer needs it removed, this needs it loaded
//   node send.mjs /dev/ttyUSB1                # one frame, then print pen lines
//   node send.mjs /dev/ttyUSB1 --fps 5        # a moving pattern, 5 frames a second
//   node send.mjs out.bin --once              # write one framed packet to a file, no device
//
// Packet: 'P' 'F' len_hi len_lo, then 3200 bytes, rows of 20, MSB leftmost, 1 = ink.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const W = 160, H = 160, ROW = W / 8, BYTES = ROW * H;
const args = process.argv.slice(2);
const dev = args.find(a => !a.startsWith('--')) || '/dev/ttyUSB1';
const fps = Number(args[args.indexOf('--fps') + 1]) || 0;
const once = args.includes('--once');

function frame(t) {
  const buf = Buffer.alloc(BYTES);
  const cx = 80 + Math.round(50 * Math.cos(t)), cy = 80 + Math.round(50 * Math.sin(t));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const border = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      const checker = ((x >> 4) + (y >> 4)) % 2 === 0 && y > 120;
      const dot = (x - cx) ** 2 + (y - cy) ** 2 < 15 ** 2;
      if (border || checker || dot) buf[y * ROW + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const head = Buffer.from([0x50, 0x46, BYTES >> 8, BYTES & 0xff]);
  return Buffer.concat([head, buf]);
}

if (once) {
  fs.writeFileSync(dev, frame(0));
  console.log(`wrote ${BYTES + 4} bytes to ${dev}`);
  process.exit(0);
}

if (dev.startsWith('/dev/')) {
  try { execFileSync('stty', ['-F', dev, '115200', 'raw', '-echo']); }
  catch (e) { console.error(`stty on ${dev} failed: ${e.message.split('\n')[0]}`); }
}

const fd = fs.openSync(dev, 'r+');
const t0 = Date.now();
let sent = 0;
function send() {
  fs.writeSync(fd, frame((Date.now() - t0) / 1000));
  sent++;
}
send();
console.log(`frame 1 sent to ${dev}`);
if (fps > 0) {
  setInterval(() => {
    send();
    if (sent % (fps * 5) === 0) console.log(`${sent} frames, ${(sent / ((Date.now() - t0) / 1000)).toFixed(1)} per second`);
  }, 1000 / fps);
}

const rd = fs.createReadStream(null, { fd, autoClose: false });
let pending = '';
rd.on('data', chunk => {
  pending += chunk.toString('latin1');
  let i;
  while ((i = pending.indexOf('\n')) >= 0) {
    console.log('pen', pending.slice(0, i));
    pending = pending.slice(i + 1);
  }
});
rd.on('error', e => { console.error(`read: ${e.message}`); process.exit(1); });
process.on('SIGINT', () => { fs.closeSync(fd); process.exit(0); });
