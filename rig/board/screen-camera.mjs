// rig/board/screen-camera.mjs: the USB camera on the Pi's own 128x64 OLED, for /devices/camera/.
// ffmpeg reads the camera small and grey, dither-oled.mjs makes the one bit frame, panel.mjs draws it,
// and each frame goes to `<room>-cam` as `screen.frame` so the page shows what the panel shows.
// Keyed like camera.mjs: started only by a viewer the relay let into `<room>-cam`, never from the open room.
// why: lessons/rig-board-panel.md#screen-camera
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { findCamera } from './camera.mjs';
import { ditherFrame, W, H } from '../../demo/shell/dither-oled.mjs';

/** No `screen.camera` renewal from anybody for this long, and the camera stops. */
export const LEASE_MS = 15_000;
/** Frames a second asked of ffmpeg: a native C925e rate (no 25), and 41.7 ms against the panel's 35 ms a frame. */
export const SCREEN_FPS = 24;
const GRAY_BYTES = W * H;

/** ffmpeg arguments: the camera at 320x240, a centred 2:1 crop, area scaled to 128x64, grey bytes on stdout. */
export function screenCameraCommand(cam, { fps = SCREEN_FPS } = {}) {
  const out = ['-vf', `crop=iw:iw/2,scale=${W}:${H}:flags=area,format=gray`, '-r', String(fps),
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-'];
  if (cam.kind === 'usb') {
    return ['ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'v4l2', '-video_size', '320x240',
      '-framerate', String(Math.max(fps, 15)), '-i', cam.device, ...out]];
  }
  if (cam.kind === 'test') {
    return ['ffmpeg', ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi',
      '-i', `testsrc2=size=320x240:rate=${fps}`, ...out]];
  }
  // A CSI camera (rpicam) is not wired here: none is on this board, so nothing was measured.
  throw new Error(`the screen takes a USB camera, and this one is ${cam.kind}`);
}

/** Cuts a byte stream into whole frames of `size` bytes. */
export function createFrameCutter(size, onFrame) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= size) { onFrame(buf.subarray(0, size)); buf = buf.subarray(size); }
  };
}

/**
 * The board's side: joins `<room>-cam` with the key, runs the capture while some keyed viewer
 * renews `screen.camera { on: true }`, and draws every frame on the panel.
 * `panel()` the open panel or null; `cameraBusy()` true while camera.mjs streams the H.264 picture.
 */
export function createScreenCamera({ relay, room, key, log = () => {}, panel = () => null, cameraBusy = () => false, held = () => '',
  find = findCamera, spawnImpl = spawn, WS = globalThis.WebSocket, leaseMs = LEASE_MS, now = () => Date.now() } = {}) {
  if (!key) return { enabled: false, running: () => false, status: () => ({ enabled: false }), stop() {} };
  const FROM = `board-screen-${randomBytes(3).toString('hex')}`;
  const viewers = new Map();     // from -> last renewal
  let ws = null, authed = false, closed = false, backoff = 1000;
  let proc = null, stopping = false, frames = 0, sent = 0, startedAt = 0, source = '';
  const recent = [];             // frame times in the last two seconds, for the measured rate

  const say = (m) => { if (ws?.readyState === 1 && authed) ws.send(JSON.stringify({ ...m, from: FROM })); };
  // Frames over the time they span, not a count in a window: a count reads 25 or 26 at a steady 24.
  const fps = () => {
    const cut = now() - 2000; while (recent.length && recent[0] < cut) recent.shift();
    if (recent.length < 2) return recent.length;
    return Math.round((recent.length - 1) * 10000 / (recent.at(-1) - recent[0])) / 10;
  };

  function onGray(gray) {
    const fb = ditherFrame(gray);
    frames++; recent.push(now());
    const p = panel();
    if (p?.frame) p.frame(fb);
    // The same 1024 bytes the panel was handed, so the page's screen is the Pi's.
    if (ws?.readyState === 1 && authed && ws.bufferedAmount < 256 * 1024) {
      say({ type: 'screen.frame', n: frames, fps: fps(), b64: Buffer.from(fb).toString('base64') });
      sent++;
    }
  }

  function end(why) {
    if (!proc) return;
    stopping = true;
    const p = proc; proc = null;
    try { p.kill('SIGTERM'); } catch { /* gone */ }
    setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, 800).unref?.();
    log(`screen camera: stopped, ${why}, after ${frames} frames`);
    say({ type: 'screen.camera.stopped', why, frames });
    const pn = panel();
    if (pn?.status?.().mode === 'raw') pn.text('camera off');
  }

  function begin() {
    if (proc) return;
    const h = held();
    if (h) { say({ type: 'screen.camera.refused', why: h }); return; }
    if (cameraBusy()) { say({ type: 'screen.camera.refused', why: 'the camera is streaming its picture to /remote/circuit/, so the screen waits' }); return; }
    const cam = find();
    if (!cam.ok) { log(`screen camera: ${cam.reason} (${cam.detail})`); say({ type: 'screen.camera.refused', why: cam.reason, detail: cam.detail }); return; }
    let cmd, args;
    try { [cmd, args] = screenCameraCommand(cam); } catch (e) { say({ type: 'screen.camera.refused', why: e.message }); return; }
    const cut = createFrameCutter(GRAY_BYTES, onGray);
    let p;
    try { p = spawnImpl(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { say({ type: 'screen.camera.refused', why: `${cmd} would not start: ${e.message}` }); return; }
    proc = p; stopping = false; frames = 0; sent = 0; startedAt = now(); source = `${cam.kind} ${cam.name}`;
    const tail = [];
    p.stdout.on('data', cut);
    p.stderr?.on('data', (d) => { for (const l of String(d).split('\n')) if (l.trim()) { tail.push(l.trim()); if (tail.length > 4) tail.shift(); } });
    p.on('error', (e) => { if (proc === p) { proc = null; say({ type: 'screen.camera.stopped', why: `${cmd}: ${e.message}`, frames }); } });
    p.on('exit', (code, sig) => {
      if (proc !== p || stopping) return;
      proc = null;
      // camera.mjs sweeps every `-f v4l2` reader before it starts, so a SIGKILL here is usually that.
      const why = sig === 'SIGKILL' ? 'the camera was taken for the picture on /remote/circuit/'
        : `${cmd} exited (${sig ?? code})${tail.length ? `: ${tail.slice(-1)[0].slice(0, 160)}` : ''}`;
      log(`screen camera: ${why}`);
      say({ type: 'screen.camera.stopped', why, frames });
    });
    log(`screen camera: up, ${source}, ${W}x${H} one bit at ${SCREEN_FPS} fps`);
    say({ type: 'screen.camera.started', ok: true, source, w: W, h: H, fps: SCREEN_FPS, screen: !!panel() });
  }

  function heard(m) {
    if (!m || typeof m.from !== 'string' || m.from === FROM || m.type !== 'screen.camera') return;
    if (m.on === false) {
      viewers.delete(m.from);
      if (!viewers.size) end('the last viewer stopped');
      return;
    }
    const isNew = !viewers.has(m.from);
    viewers.set(m.from, now());
    if (!proc) begin();
    else if (isNew) say({ type: 'screen.camera.started', ok: true, source, w: W, h: H, fps: SCREEN_FPS, screen: !!panel() });
  }

  const prune = setInterval(() => {
    const cut = now() - leaseMs;
    for (const [k, t] of viewers) if (t < cut) viewers.delete(k);
    if (proc && !viewers.size) end(`nobody renewed for ${Math.round(leaseMs / 1000)} s`);
  }, 2000);
  prune.unref?.();

  function connect() {
    if (closed) return;
    authed = false;
    ws = new WS(`${relay}/room/${room}/ws`);
    ws.onopen = () => { backoff = 1000; ws.send(JSON.stringify({ type: 'cam.key', key, from: FROM })); };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'cam.key.ok') { authed = true; return; }
      if (authed) heard(m);
    };
    ws.onclose = (e) => {
      authed = false; ws = null; viewers.clear();
      end('the board lost the camera room');
      if (closed) return;
      // 4003 is a refused key, which retrying every second would only repeat.
      setTimeout(connect, e?.code === 4003 ? 5 * 60_000 : backoff).unref?.();
      backoff = Math.min(backoff * 2, 5 * 60_000);
    };
    ws.onerror = () => { /* close follows */ };
  }
  connect();

  return {
    enabled: true,
    running: () => !!proc,
    status: () => ({ enabled: true, joined: authed, running: !!proc, viewers: viewers.size, frames, sent, fps: fps(),
      upMs: proc ? now() - startedAt : 0, source }),
    stop() { closed = true; clearInterval(prune); end('the board is stopping'); try { ws?.close(); } catch { /* gone */ } },
  };
}
