// The Pi's USB camera, shared by cam.mjs and bridge.mjs: find it, refuse it when held, read it with
// ffmpeg as 160x160 grey, and stretch its levels. One holder at a time, so nothing here stops anybody.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// The first capture device v4l2-ctl lists outside the Pi's own codec and ISP nodes.
export function findVideo(given = null) {
  if (given) return given;
  const r = spawnSync('v4l2-ctl', ['--list-devices'], { encoding: 'utf8' });
  let platform = false;
  for (const line of (r.stdout || '').split('\n')) {
    if (line && !/^\s/.test(line)) { platform = /platform:|bcm2835|rpi-|pispbe|rp1-cfe/.test(line); continue; }
    const d = line.trim();
    if (!platform && /^\/dev\/video\d+$/.test(d)) return d;
  }
  return null;
}

// Who holds the camera, as readable lines; empty when it is free.
export function holdersOf(video) {
  const r = spawnSync('fuser', [video], { encoding: 'utf8' });
  const pids = `${r.stdout || ''}`.trim();
  if (!pids) return [];
  return pids.split(/\s+/).map((p) => { try { return `${p} ${fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').replace(/\0/g, ' ').trim().slice(0, 120)}`; } catch { return p; } });
}

// ffmpeg arguments: the camera at 320x240, a centred square crop, area scaled to WxH, grey bytes on stdout.
export function ffArgs(video, fps = 15, W = 160, H = 160) {
  return ['-hide_banner', '-loglevel', 'error', '-f', 'v4l2', '-video_size', '320x240', '-framerate', String(fps),
    '-i', video, '-vf', `crop=ih:ih,scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'];
}

// The 2nd and 98th percentile, stretched to full scale, as the board does for its OLED.
export function levels(g) {
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

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
