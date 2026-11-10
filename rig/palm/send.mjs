#!/usr/bin/env node
// Pi side of the frame app (pframe): writes 160x160 test frames at 1, 2, 4, 8
// or 16 bit to the Palm's USB serial port and prints the stylus lines that
// come back.
//
//   sudo modprobe visor                         # pilot-xfer needs it removed, this needs it loaded
//   node send.mjs /dev/ttyUSB1                  # one 1 bit frame, then print pen lines
//   node send.mjs /dev/ttyUSB1 --fmt 8 --fps 5  # 8 bit, 5 frames a second
//   node send.mjs /dev/ttyUSB1 --fmt 16 --fps 0 # 16 bit as fast as the link takes
//   node send.mjs /dev/ttyUSB1 --cycle          # every format flat out, 10 s each (--secs N)
//   node send.mjs out.bin --fmt 4 --once        # one framed packet to a file, no device
//   node send.mjs /dev/ttyUSB1 --tone 440:300    # one tone, Hz:ms[:amp], amp 0 to 64 (sndMaxAmp)
//   node send.mjs /dev/ttyUSB1 --notes           # a short tune, one tone packet per note
//   --le                                        # 16 bit little endian, if colours come out scrambled
//
// Packet: 'P' 'F' fmt len_hi len_lo, then len bytes. fmt is the bit depth.
// Rows top to bottom, leftmost pixel in the most significant bits; below 8 bit
// 0 is white and the top value black. 8 bit indexes the Palm system palette,
// 16 bit is RGB565 big endian.
// Tone: 'P' 'T' freq_hi freq_lo dur_hi dur_lo amp. The Palm plays it without
// waiting, and a new tone cuts the one playing.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const W = 160, H = 160, TOP = 148;   // the Palm draws its status line over rows 148 to 159
const FMTS = [1, 2, 4, 8, 16];
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const dev = args.find((a, i) => !a.startsWith('--') && !['--fps', '--fmt', '--secs', '--tone'].includes(args[i - 1])) || '/dev/ttyUSB1';
const fpsArg = opt('--fps', null);
const fps = fpsArg === null ? null : Number(fpsArg);
let fmt = Number(opt('--fmt', 1));
const secs = Number(opt('--secs', 10));
const once = args.includes('--once');
const cycle = args.includes('--cycle');
const le = args.includes('--le');
if (!FMTS.includes(fmt)) { console.error(`--fmt must be one of ${FMTS.join(' ')}`); process.exit(2); }

// The Palm OS 8 bit system palette, as recalled (INFERENCE): 216 web safe
// colours with green fastest and every channel descending from ff, ten greys,
// five extras, black to the end. Replaced by the table the Palm sends back
// ("pal ..." after its first frame), which is saved to palette.hex.
const palFile = path.join(path.dirname(new URL(import.meta.url).pathname), 'palette.hex');
let palette = builtinPalette();
let paletteFrom = 'built in (inferred)';
try {
  const hex = fs.readFileSync(palFile, 'utf8').trim();
  if (/^[0-9a-f]{1536}$/.test(hex)) { palette = parsePalette(hex); paletteFrom = palFile; }
} catch {}

function builtinPalette() {
  const lv = [0xff, 0xcc, 0x99, 0x66, 0x33, 0x00], p = [];
  for (let r = 0; r < 6; r++) for (let b = 0; b < 6; b++) for (let g = 0; g < 6; g++) p.push([lv[r], lv[g], lv[b]]);
  for (const v of [0x11, 0x22, 0x44, 0x55, 0x77, 0x88, 0xaa, 0xbb, 0xdd, 0xee]) p.push([v, v, v]);
  p.push([0xc0, 0xc0, 0xc0], [0x80, 0, 0], [0x80, 0, 0x80], [0, 0x80, 0], [0, 0x80, 0x80]);
  while (p.length < 256) p.push([0, 0, 0]);
  return p;
}
function parsePalette(hex) {
  const p = [];
  for (let i = 0; i < 256; i++) p.push([0, 2, 4].map(k => parseInt(hex.slice(i * 6 + k, i * 6 + k + 2), 16)));
  return p;
}
// Nearest palette entry for each 5 bit per channel colour, made once per palette.
let cube = null;
function nearest(r, g, b) {
  if (!cube) {
    cube = new Uint8Array(32768);
    for (let i = 0; i < 32768; i++) {
      const R = (i >> 10) * 255 / 31, G = ((i >> 5) & 31) * 255 / 31, B = (i & 31) * 255 / 31;
      let best = 0, bd = Infinity;
      for (let k = 0; k < 256; k++) {
        const [pr, pg, pb] = palette[k];
        const d = (R - pr) ** 2 + (G - pg) ** 2 + (B - pb) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      cube[i] = best;
    }
  }
  return cube[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
}

function hsv(h, s, v) {
  const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// The still part of each test picture, as RGB per pixel.
function background(d) {
  const px = new Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const border = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
    let c;
    if (d === 1) {
      const checker = ((x >> 4) + (y >> 4)) % 2 === 0 && y > 120;
      c = checker ? [0, 0, 0] : [255, 255, 255];
    } else if (d <= 4) {
      // Three grey ramps: left to right across the top, top to bottom on the
      // left half below it, and a two pixel stripe test of every level.
      const lv = (1 << d) - 1;
      let g;
      if (y < 50) g = 1 - x / (W - 1);
      else if (x < 80 && y < 120) g = 1 - (y - 50) / 69;
      else if (y < 120) g = ((x >> 1) & 1) ? 1 - Math.floor((y - 50) / (70 / (lv + 1))) / lv : 1;
      else g = 1 - Math.floor(x / (W / (lv + 1))) / lv;
      c = [g * 255, g * 255, g * 255];
    } else {
      // A colour wheel (hue round, saturation out) and four ramps: R, G, B, grey.
      const dx = x - 80, dy = y - 62, r = Math.hypot(dx, dy);
      if (r <= 58) c = hsv((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1, r / 58, 1);
      else if (y >= 124 && y < TOP) {
        const v = Math.round(x / (W - 1) * 255), band = Math.floor((y - 124) / 6);
        c = [[v, 0, 0], [0, v, 0], [0, 0, v], [v, v, v]][band];
      } else c = [255, 255, 255];
    }
    px[y * W + x] = border ? [0, 0, 0] : c;
  }
  return px;
}

const bgCache = new Map();
function frame(d, t) {
  if (!bgCache.has(d)) bgCache.set(d, background(d));
  const bg = bgCache.get(d);
  const cx = 80 + Math.round(50 * Math.cos(t)), cy = 66 + Math.round(50 * Math.sin(t));
  const len = W * H * d / 8;
  const buf = Buffer.alloc(5 + len);
  buf[0] = 0x50; buf[1] = 0x46; buf[2] = d; buf[3] = len >> 8; buf[4] = len & 0xff;
  const lv = (1 << Math.min(d, 8)) - 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r2 = (x - cx) ** 2 + (y - cy) ** 2;
    let [r, g, b] = bg[y * W + x];
    if (r2 < 13 ** 2) {
      if (d === 1) [r, g, b] = [0, 0, 0];
      else if (r2 < 9 ** 2) [r, g, b] = d <= 4 ? [255, 255, 255] : [255, 255, 0];
      else [r, g, b] = [0, 0, 0];
    }
    const i = y * W + x;
    if (d < 8) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const v = Math.round((255 - lum) / 255 * lv);
      const per = 8 / d, at = 5 + (i / per | 0), shift = 8 - d * (i % per + 1);
      buf[at] |= v << shift;
    } else if (d === 8) {
      buf[5 + i] = nearest(r, g, b);
    } else {
      const v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
      if (le) buf.writeUInt16LE(v, 5 + i * 2); else buf.writeUInt16BE(v, 5 + i * 2);
    }
  }
  return buf;
}

const toneArg = opt('--tone', null);
const notes = args.includes('--notes');
const tonePacket = (hz, ms, amp = 32) => Buffer.from([0x50, 0x54, hz >> 8, hz & 0xff, ms >> 8, ms & 0xff, Math.min(64, amp)]);
if (toneArg || notes) {
  let list;
  if (toneArg) {
    const [hz, ms, amp] = toneArg.split(':').map(Number);
    if (!(hz > 0 && hz < 65536 && ms > 0 && ms < 65536)) { console.error('--tone FREQ:MS[:AMP], Hz and ms'); process.exit(2); }
    list = [[hz, ms, amp ?? 32]];
  } else {
    // C major up and down, then the octave held.
    const mid = n => Math.round(440 * 2 ** ((n - 69) / 12));
    list = [60, 64, 67, 72, 67, 64, 60].map(n => [mid(n), 180, 40]).concat([[mid(72), 500, 40]]);
  }
  if (dev.startsWith('/dev/')) { try { execFileSync('stty', ['-F', dev, '115200', 'raw', '-echo']); } catch {} }
  const fd = fs.openSync(dev, dev.startsWith('/dev/') ? 'r+' : 'w');
  for (const [hz, ms, amp] of list) {
    fs.writeSync(fd, tonePacket(hz, ms, amp));
    console.log(`tone ${hz} Hz ${ms} ms amp ${Math.min(64, amp)}`);
    if (list.length > 1) await new Promise(r => setTimeout(r, ms + 20));
  }
  fs.closeSync(fd);
  process.exit(0);
}

if (once) {
  const pkt = frame(fmt, 0);
  fs.writeFileSync(dev, pkt);
  console.log(`wrote ${pkt.length} bytes (fmt ${fmt}) to ${dev}`);
  process.exit(0);
}

if (dev.startsWith('/dev/')) {
  try { execFileSync('stty', ['-F', dev, '115200', 'raw', '-echo']); }
  catch (e) { console.error(`stty on ${dev} failed: ${e.message.split('\n')[0]}`); }
}
console.log(`palette for fmt 8: ${paletteFrom}`);

const fd = fs.openSync(dev, 'r+');
const t0 = Date.now();
let sent = 0, writing = false, skipped = 0;
let win = { t: Date.now(), frames: 0, bytes: 0 };

// fs.write runs on the thread pool, so the pen lines keep arriving while a
// write waits for the link. A write completing means the tty took it.
function send(next) {
  const pkt = frame(fmt, (Date.now() - t0) / 1000);
  writing = true;
  fs.write(fd, pkt, 0, pkt.length, null, e => {
    writing = false;
    if (e) { console.error(`write: ${e.message}`); process.exit(1); }
    sent++; win.frames++; win.bytes += pkt.length;
    if (next) next();
  });
}
function rate() {
  const now = Date.now(), dt = (now - win.t) / 1000;
  const r = { fps: win.frames / dt, kbs: win.bytes / dt / 1024 };
  win = { t: now, frames: 0, bytes: 0 };
  return r;
}
const fmtRate = r => `${r.fps.toFixed(1)} frames/s, ${r.kbs.toFixed(1)} KB/s`;

function flatOut() { send(flatOut); }

if (cycle) {
  const results = [];
  let k = 0, stepT = Date.now(), stepFrames = 0, stepBytes = 0;
  fmt = FMTS[0];
  console.log(`cycle: ${FMTS.join(', ')} bit, ${secs} s each, flat out`);
  const pump = () => {
    if (Date.now() - stepT >= secs * 1000) {
      const dt = (Date.now() - stepT) / 1000;
      results.push({ fmt, frames: stepFrames, fps: stepFrames / dt, kbs: stepBytes / dt / 1024 });
      console.log(`fmt ${fmt}: ${stepFrames} frames in ${dt.toFixed(1)} s, ${(stepFrames / dt).toFixed(1)} frames/s, ${(stepBytes / dt / 1024).toFixed(1)} KB/s`);
      if (++k === FMTS.length) {
        console.log('\nfmt  bytes/frame  frames/s  KB/s');
        for (const r of results) console.log(`${String(r.fmt).padStart(3)}  ${String(W * H * r.fmt / 8 + 5).padStart(11)}  ${r.fps.toFixed(1).padStart(8)}  ${r.kbs.toFixed(1).padStart(5)}`);
        fs.closeSync(fd); process.exit(0);
      }
      fmt = FMTS[k]; stepT = Date.now(); stepFrames = 0; stepBytes = 0;
    }
    const len = W * H * fmt / 8 + 5;
    send(() => { stepFrames++; stepBytes += len; pump(); });
  };
  pump();
  setInterval(() => console.log(`fmt ${fmt}: ${fmtRate(rate())}`), 2000);
} else if (fps === 0) {
  console.log(`fmt ${fmt}, as fast as the link takes`);
  flatOut();
  setInterval(() => console.log(`${sent} frames, ${fmtRate(rate())}`), 2000);
} else if (fps > 0) {
  console.log(`fmt ${fmt}, ${fps} frames a second`);
  send();
  setInterval(() => { if (writing) skipped++; else send(); }, 1000 / fps);
  setInterval(() => console.log(`${sent} frames, ${fmtRate(rate())}${skipped ? `, ${skipped} skipped (link busy)` : ''}`), 2000);
} else {
  send(() => console.log(`frame 1 (fmt ${fmt}) sent to ${dev}`));
}

const rd = fs.createReadStream(null, { fd, autoClose: false });
let pending = '';
rd.on('data', chunk => {
  pending += chunk.toString('latin1');
  let i;
  while ((i = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, i).trim();
    pending = pending.slice(i + 1);
    const m = /^pal ([0-9a-f]{1536})$/.exec(line);
    if (m) {
      try { fs.writeFileSync(palFile, m[1] + '\n'); } catch (e) { console.error(`palette not saved: ${e.message}`); }
      palette = parsePalette(m[1]); cube = null; bgCache.clear(); paletteFrom = 'the Palm';
      const same = palette.every((c, k) => c.join() === builtinPalette()[k].join());
      console.log(`palette from the Palm saved to ${palFile}; ${same ? 'matches' : 'DIFFERS from'} the built in table`);
    } else if (line.startsWith('pal')) console.log(`palette: ${line}`);
    else console.log('pen', line);
  }
});
rd.on('error', e => { console.error(`read: ${e.message}`); process.exit(1); });
process.on('SIGINT', () => { fs.closeSync(fd); process.exit(0); });
