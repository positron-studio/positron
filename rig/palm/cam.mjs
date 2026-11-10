#!/usr/bin/env node
// The Pi's USB camera on the Palm, through pframe: ffmpeg reads the camera small
// and grey, a square crop is scaled to 160x160, dithered to 1 bit (or kept as
// 2 or 4 bit grey), framed and written to the Palm's visor tty. Pen lines the
// Palm sends back are printed.
//
//   sudo modprobe visor                          # pilot-xfer needs it removed, this needs it loaded
//   node cam.mjs /dev/ttyUSB1 --old              # the installed 1 bit pframe: 'P' 'F' len_hi len_lo
//   node cam.mjs /dev/ttyUSB1                    # the five format pframe, fmt 1: 'P' 'F' 1 len_hi len_lo
//   node cam.mjs /dev/ttyUSB1 --fmt 4            # 4 bit grey, no dither (five format pframe only)
//   node cam.mjs /dev/ttyUSB1 --fps 5            # at most 5 frames a second (default: as fast as the Palm takes)
//   node cam.mjs out.bin --once                  # one frame to a file and as text here, no Palm needed
//   --dither bayer|fs|none   ordered 4x4 like the board's OLED (default), Floyd-Steinberg, or a plain threshold
//   --no-stretch             no 2 to 98 percentile level stretch
//   --video /dev/video0      the camera (default: the first USB camera v4l2-ctl lists)
//   --secs N                 stop after N seconds
//
// The camera has one holder at a time. If something already reads it (the board's
// screen camera or HDMI picture), this says so and exits without touching it.
import fs from 'node:fs';
import tty from 'node:tty';
import { spawn, execFileSync, spawnSync } from 'node:child_process';

const W = 160, H = 160;
const args = process.argv.slice(2);
const VALUED = ['--fps', '--fmt', '--secs', '--dither', '--video', '--cam-fps'];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const dev = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1])) || '/dev/ttyUSB1';
const old = args.includes('--old');
const fmt = Number(opt('--fmt', 1));
const fps = Number(opt('--fps', 0));
const secs = Number(opt('--secs', 0));
const camFps = Number(opt('--cam-fps', 15));
const dither = opt('--dither', 'bayer');
const stretch = !args.includes('--no-stretch');
const once = args.includes('--once');
if (![1, 2, 4].includes(fmt)) { console.error('--fmt must be 1, 2 or 4'); process.exit(2); }
if (old && fmt !== 1) { console.error('--old is the 1 bit build, so --fmt 1 only'); process.exit(2); }
if (!['bayer', 'fs', 'none'].includes(dither)) { console.error('--dither bayer, fs or none'); process.exit(2); }

// The first capture device v4l2-ctl lists outside the Pi's own codec and ISP nodes.
function findVideo() {
  const given = opt('--video', null);
  if (given) return given;
  const r = spawnSync('v4l2-ctl', ['--list-devices'], { encoding: 'utf8' });
  let name = '', platform = false;
  for (const line of (r.stdout || '').split('\n')) {
    if (line && !/^\s/.test(line)) { name = line; platform = /platform:|bcm2835|rpi-|pispbe|rp1-cfe/.test(line); continue; }
    const d = line.trim();
    if (!platform && /^\/dev\/video\d+$/.test(d)) return d;
  }
  return null;
}

const video = findVideo();
if (!video) { console.error('no USB camera: v4l2-ctl lists none beside the Pi\'s own codec nodes'); process.exit(3); }
const holders = spawnSync('fuser', [video], { encoding: 'utf8' });
const pids = `${holders.stdout || ''}`.trim();
if (pids) {
  const who = pids.split(/\s+/).map(p => { try { return `${p} ${fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').replace(/\0/g, ' ').trim().slice(0, 120)}`; } catch { return p; } });
  console.error(`${video} is held, and only one process may read it:\n  ${who.join('\n  ')}\nNothing was stopped. Free it on the board (its screen camera or HDMI picture) and run again.`);
  process.exit(3);
}

// ffmpeg arguments: the camera at 320x240, a centred square crop, area scaled to 160x160, grey bytes on stdout.
const ff = ['-hide_banner', '-loglevel', 'error', '-f', 'v4l2', '-video_size', '320x240', '-framerate', String(camFps),
  '-i', video, '-vf', `crop=ih:ih,scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'];

// The 2nd and 98th percentile, stretched to full scale, as the board does for its OLED.
function levels(g) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const a = g.length * 0.02, b = g.length * 0.98;
  let acc = 0, min = 0, max = 255, seen = false;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (!seen && acc > a) { min = v; seen = true; }
    if (acc >= b) { max = v; break; }
  }
  return max - min < 16 ? { min: Math.max(0, min - 8), max: Math.min(255, min + 8) } : { min, max };
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const err = new Float32Array(W * H);

// 160x160 grey (bright is high) to a packet. Below 8 bit pframe draws 0 as white, so ink is dark.
function packet(gray) {
  const len = W * H * fmt / 8;
  const head = old ? [0x50, 0x46, len >> 8, len & 0xff] : [0x50, 0x46, fmt, len >> 8, len & 0xff];
  const buf = Buffer.alloc(head.length + len);
  head.forEach((b, i) => { buf[i] = b; });
  const o = head.length;
  const { min, max } = stretch ? levels(gray) : { min: 0, max: 255 };
  const k = 255 / Math.max(1, max - min);
  if (fmt === 1 && dither === 'fs') {
    for (let i = 0; i < W * H; i++) err[i] = (gray[i] - min) * k;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, v = err[i], white = v >= 128, e = v - (white ? 255 : 0);
      if (!white) buf[o + (i >> 3)] |= 0x80 >> (x & 7);
      if (x + 1 < W) err[i + 1] += e * 7 / 16;
      if (y + 1 < H) {
        if (x > 0) err[i + W - 1] += e * 3 / 16;
        err[i + W] += e * 5 / 16;
        if (x + 1 < W) err[i + W + 1] += e / 16;
      }
    }
    return buf;
  }
  const lv = (1 << fmt) - 1, per = 8 / fmt;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = Math.max(0, Math.min(255, (gray[i] - min) * k));
    let ink;
    if (fmt === 1) ink = v > (dither === 'none' ? 127.5 : (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) * 16) ? 0 : 1;
    else ink = Math.round((255 - v) / 255 * lv);
    buf[o + (i / per | 0)] |= ink << (8 - fmt * (i % per + 1));
  }
  return buf;
}

// A frame as text, one character per 4x8 block, for --once.
function ascii(gray) {
  const INK = '@%#*+=-:. ', rows = [];
  for (let y = 0; y < H; y += 8) {
    let s = '';
    for (let x = 0; x < W; x += 4) {
      let n = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) n += gray[(y + j) * W + x + i];
      s += INK[Math.min(INK.length - 1, Math.floor(n / 32 / 256 * INK.length))];
    }
    rows.push(s);
  }
  return rows.join('\n');
}

const cam = spawn('ffmpeg', ff, { stdio: ['ignore', 'pipe', 'pipe'] });
let camDead = false;
const killCam = () => { if (!camDead) { camDead = true; try { cam.kill('SIGKILL'); } catch { /* gone */ } } };
process.on('exit', killCam);
// The kernel drains unsent bytes to the Palm on close, up to 30 s if it stopped reading;
// the camera is let go first, so only this process waits, never the camera.
function quit(code = 0) { killCam(); process.exit(code); }
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => quit(0));
process.on('uncaughtException', e => { console.error(e); process.exit(1); });
cam.stderr.on('data', d => { for (const l of String(d).split('\n')) if (l.trim()) console.error(`ffmpeg: ${l.trim()}`); });
cam.on('exit', (code, sig) => { if (!camDead) { camDead = true; console.error(`ffmpeg exited (${sig ?? code})`); process.exit(1); } });
console.log(`camera ${video}, 320x240 at ${camFps} fps, square crop to ${W}x${H}; ${old ? 'old 1 bit header' : `fmt ${fmt}`}${fmt === 1 ? `, dither ${dither}` : ''}${stretch ? ', levels stretched' : ''}`);

let latest = null, fresh = false, camFrames = 0;
let acc = Buffer.alloc(0);
cam.stdout.on('data', chunk => {
  acc = acc.length ? Buffer.concat([acc, chunk]) : chunk;
  while (acc.length >= W * H) {
    latest = Buffer.from(acc.subarray(0, W * H)); acc = acc.subarray(W * H);
    fresh = true; camFrames++;
    if (once) {
      const pkt = packet(latest);
      fs.writeFileSync(dev, pkt);
      console.log(ascii(latest));
      console.log(`wrote ${pkt.length} bytes to ${dev}`);
      process.exit(0);
    }
    pump();
  }
});
if (once) setTimeout(() => { console.error('no frame from the camera in 10 s'); process.exit(1); }, 10000).unref();

let fd = null;
if (!once) {
  if (dev.startsWith('/dev/')) {
    // Non blocking: a blocking open waits behind an earlier close still draining to a Palm that stopped reading.
    const { O_RDWR, O_NONBLOCK, O_NOCTTY } = fs.constants;
    fd = fs.openSync(dev, O_RDWR | O_NONBLOCK | O_NOCTTY);
    try { execFileSync('stty', ['raw', '-echo', 'clocal'], { stdio: [fd, 'ignore', 'ignore'], timeout: 2000 }); }
    // stty waits for queued bytes to drain first, which a Palm that stopped reading never does.
    catch { /* the visor tty also refuses some settings; raw and no echo is what matters */ }
  } else fd = fs.openSync(dev, 'w');
}
// A tty goes through libuv's tty handles, not the thread pool, whose blocked read keeps the
// process from exiting. tty.WriteStream sets itself blocking, so it is set back.
const isTty = fd !== null && tty.isatty(fd);
const out = isTty ? new tty.WriteStream(fd) : null;
out?._handle?.setBlocking?.(false);
out?.on('error', e => console.error(`tty: ${e.message}`));

// One write in flight; when it completes the tty took the frame, and the newest camera frame goes next.
let writing = false, sent = 0, lastSend = 0, win = { t: Date.now(), frames: 0, bytes: 0, cam: 0 };
const t0 = Date.now();
function pump() {
  if (once || writing || !fresh) return;
  const now = Date.now();
  if (fps > 0 && now - lastSend < 1000 / fps) { setTimeout(pump, 1000 / fps - (now - lastSend)); return; }
  fresh = false; lastSend = now; writing = true;
  const pkt = packet(latest);
  const done = e => {
    writing = false;
    if (e) { console.error(`write: ${e.message}`); process.exit(1); }
    sent++; win.frames++; win.bytes += pkt.length;
    pump();
  };
  if (out) out.write(pkt, done); else fs.write(fd, pkt, 0, pkt.length, null, done);
}

if (!once) {
  setInterval(() => {
    const now = Date.now(), dt = (now - win.t) / 1000;
    console.log(`${sent} frames to the Palm, ${(win.frames / dt).toFixed(1)} frames/s, ${(win.bytes / dt / 1024).toFixed(1)} KB/s; camera ${((camFrames - win.cam) / dt).toFixed(1)} frames/s${writing && win.frames === 0 ? ' (a write is waiting)' : ''}`);
    win = { t: now, frames: 0, bytes: 0, cam: camFrames };
    if (writing && now - lastSend > 3000) console.log(`the Palm has not taken a frame for ${((now - lastSend) / 1000).toFixed(0)} s: is pframe open and the Palm awake?`);
    if (secs && now - t0 >= secs * 1000) quit();
  }, 2000);
  if (isTty) {
    const rd = new tty.ReadStream(fd);
    let pending = '';
    rd.on('data', chunk => {
      pending += chunk.toString('latin1');
      let i;
      while ((i = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, i).trim();
        pending = pending.slice(i + 1);
        if (line) console.log(line.startsWith('pal') ? `palm: ${line.slice(0, 40)}...` : `palm: ${line}`);
      }
    });
    rd.on('error', e => console.error(`read: ${e.message}`));
  }
}
