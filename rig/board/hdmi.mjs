// The Pi's HDMI0 screen as `pi-1:hdmi0`: one show at a time, no browser and no desktop. With
// rig/hdmi's `hdmi-scan` on the board the GPU draws it full screen through KMS (`camera`, `bars`);
// without it ffmpeg draws into /dev/fb0, the camera at 1:1 centred and testsrc2 for the pattern.
// The screen and the camera are each one process's at a time, so a show refuses in words while
// another program holds either. Every service is injected, so hdmi-test.mjs runs it on fakes.
// why: lessons/rig-board-hdmi.md#header
import { spawn as nodeSpawn, execFileSync } from 'node:child_process';
import * as nodeFs from 'node:fs';

export const SOURCES = Object.freeze(['camera', 'pattern']);
export const FB = '/dev/fb0';
export const CONNECTOR = '/sys/class/drm/card1-HDMI-A-1/status';
/** The KMS device hdmi-scan takes; nothing else on the board opens it. */
export const CARD = '/dev/dri/card1';
export const FB_SIZE = '/sys/class/graphics/fb0/virtual_size';
export const FB_BITS = '/sys/class/graphics/fb0/bits_per_pixel';
/** Camera sizes asked of the C925e, largest first; the first that fits the screen at 1:1 is used. */
export const CAMERA_SIZES = Object.freeze([[1280, 720], [640, 480]]);
export const CAMERA_FPS = 30;
// 10 fps keeps the check cheap: 30 fps at 1920x1080 cost 82.7 % of one core (plan-pi-hdmi §5b).
export const PATTERN_FPS = 10;
/** Where `hdmi-scan` is looked for: BOARD_HDMI_SCAN, else where rig/hdmi/README.md builds it. */
export const SCAN_PATHS = Object.freeze([process.env.BOARD_HDMI_SCAN, `${process.env.HOME || '/home/positron'}/hdmi/hdmi-scan`].filter(Boolean));
/** hdmi-scan takes a duration; a year, and SIGTERM ends it (it puts the console's CRTC back). */
export const SCAN_SECONDS = 365 * 24 * 3600;
/** fbdev depth to ffmpeg's pixel format. */
const PIX = { 16: 'rgb565le', 32: 'bgra' };

/** `1920,1080` to `{ w, h }`, or null. */
export function parseSize(text) {
  const m = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(String(text ?? ''));
  return m && +m[1] > 0 && +m[2] > 0 ? { w: +m[1], h: +m[2] } : null;
}

/** Where a picture of `src` sits centred on `fb`, or null when it does not fit at 1:1. */
export function centre(fb, src) {
  if (!fb || !src || src.w > fb.w || src.h > fb.h) return null;
  return { x: Math.floor((fb.w - src.w) / 2), y: Math.floor((fb.h - src.h) / 2) };
}

/** The command for one show, or `{ why }`. `fb` is `{ w, h, bits }`, `cam` a findCamera() answer, `scan` hdmi-scan's path or null. */
export function showCommand(source, { fb, cam = null, fbPath = FB, scan = null } = {}) {
  const noCam = (c) => (c?.ok ? `the camera here is ${c.kind}, and the screen takes a USB camera` : `no camera on this board${c?.detail ? ` (${c.detail})` : ''}`);
  // hdmi-scan decodes MJPEG only, so a camera without it falls back to ffmpeg.
  if (scan && source === 'pattern') return { cmd: scan, args: ['bars', String(SCAN_SECONDS)], w: fb?.w, h: fb?.h, fps: 60, by: 'gpu' };
  if (scan && source === 'camera' && cam?.ok && cam.kind === 'usb' && cam.inputFormat === 'mjpeg') {
    return { cmd: scan, args: ['camera', String(SCAN_SECONDS), cam.device], w: fb?.w, h: fb?.h, fps: 30, by: 'gpu', from: { w: 1280, h: 720 } };
  }
  const pix = PIX[fb?.bits];
  if (!pix) return { why: `the screen's framebuffer is ${fb?.bits ?? 'an unknown number of'} bits a pixel, and this draws 16 or 32` };
  const out = ['-pix_fmt', pix, '-f', 'fbdev'];
  if (source === 'pattern') {
    return { cmd: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi',
      '-i', `testsrc2=size=${fb.w}x${fb.h}:rate=${PATTERN_FPS}`, ...out, fbPath], w: fb.w, h: fb.h, fps: PATTERN_FPS, by: 'ffmpeg' };
  }
  if (source === 'camera') {
    if (!cam?.ok || cam.kind !== 'usb') return { why: noCam(cam) };
    const fit = CAMERA_SIZES.map(([w, h]) => ({ w, h })).find((s) => centre(fb, s));
    if (!fit) return { why: `the screen is ${fb.w}x${fb.h}, smaller than the smallest camera picture asked for at 1:1` };
    const at = centre(fb, fit);
    return { cmd: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-f', 'v4l2',
      ...(cam.inputFormat ? ['-input_format', cam.inputFormat] : []),
      '-video_size', `${fit.w}x${fit.h}`, '-framerate', String(CAMERA_FPS), '-i', cam.device,
      ...out, '-xoffset', String(at.x), '-yoffset', String(at.y), fbPath], w: fit.w, h: fit.h, fps: CAMERA_FPS, at, by: 'ffmpeg' };
  }
  return { why: `source is ${SOURCES.join(' or ')}` };
}

// `ps -eo pid,args` rows. Kernel threads are bracketed (`[irq/45-vc4 hdmi hpd connected]`) and never a holder.
const rows = (ps) => String(ps).split('\n').map((l) => l.trim()).filter((l) => l && !/^\d+\s+\[/.test(l))
  .map((l) => { const i = l.search(/\s/); const args = l.slice(i + 1).trim(); return { pid: +l.slice(0, i), args, exe: args.split(/\s+/)[0].split('/').pop() }; })
  .filter((r) => r.pid);

/** Programs drawing on the screen: `hdmi-scan` (rig/hdmi/), or an ffmpeg or mpv writing the framebuffer or DRM. */
export function displayHolders(ps, mine = []) {
  return rows(ps).filter((r) => !mine.includes(r.pid) && (
    r.exe === 'hdmi-scan'
    || (r.exe === 'ffmpeg' && /(\s-f fbdev\s|\/dev\/fb\d)/.test(r.args))
    || (r.exe === 'mpv' && /--vo=(drm|gpu)/.test(r.args))));
}

/** Programs reading a camera: an ffmpeg `-f v4l2`, rpicam-vid or `hdmi-scan camera` that is not this show's own. */
export function cameraHolders(ps, mine = []) {
  return rows(ps).filter((r) => !mine.includes(r.pid)
    && ((r.exe === 'ffmpeg' && /\s-f v4l2\s/.test(r.args)) || /^(rpicam|libcamera)-vid$/.test(r.exe)
      || (r.exe === 'hdmi-scan' && /^\S+\s+camera\b/.test(r.args))));
}
// The program is the first word, so `timeout 8 ./hdmi-scan` is the hdmi-scan it runs, not a second holder.
const named = (r) => `${r.exe} (pid ${r.pid})`;

/** Share of one core a process used since it started: utime plus stime over its age, from /proc. */
export function cpuShare(statText, uptimeText, hz = 100) {
  const s = String(statText ?? ''); const close = s.lastIndexOf(')');
  if (close < 0) return null;
  const f = s.slice(close + 2).split(' ');
  // After the name: field 3 is index 0, so utime (14) is 11, stime (15) 12, starttime (22) 19.
  const used = (+f[11] + +f[12]) / hz, start = +f[19] / hz, up = parseFloat(uptimeText);
  const age = up - start;
  return Number.isFinite(used) && age > 0 ? Math.round((1000 * used) / age) / 10 : null;
}

/**
 * @param {object} o
 * @param {() => string} [o.cameraBusy]  why the board's own camera users hold the camera now, or ''
 * @param {() => object} [o.findCamera]  camera.mjs `findCamera`
 */
export function createHdmi({ spawn = nodeSpawn, fs = nodeFs, ps = () => execFileSync('ps', ['-eo', 'pid,args', '--no-headers'], { encoding: 'utf8' }),
  findCamera = () => ({ ok: false, reason: 'no camera finder given' }), cameraBusy = () => '',
  log = () => {}, now = () => Date.now(), setTimer = setTimeout, scanPaths = SCAN_PATHS,
  paths = { fb: FB, card: CARD, connector: CONNECTOR, size: FB_SIZE, bits: FB_BITS } } = {}) {
  let show = null;            // { source, proc, pid, since, w, h, fps, stopping, exited }
  let last = null;            // why the previous show ended
  let clears = 0;

  const read = (p) => { try { return String(fs.readFileSync(p, 'utf8')).trim(); } catch { return null; } };
  const connected = () => read(paths.connector) === 'connected';
  function fbInfo() {
    const size = parseSize(read(paths.size)), bits = Number(read(paths.bits));
    return size && bits ? { ...size, bits } : null;
  }
  const psText = () => { try { return ps(); } catch { return ''; } };
  const mine = () => (show?.pid ? [show.pid] : []);
  /** hdmi-scan's path when it is on this board, asked at each show so a fresh build is used at once. */
  const scan = () => scanPaths.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) ?? null;

  /** Zeros over the whole framebuffer, so the last frame does not stay up. */
  function clear() {
    const fb = fbInfo();
    if (!fb) return false;
    try { fs.writeFileSync(paths.fb, Buffer.alloc((fb.w * fb.h * fb.bits) / 8)); clears++; return true; }
    catch (e) { log(`hdmi: could not clear the screen, ${e.code || e.message}`); return false; }
  }

  // Every process with `dev` open, from /proc: a holder ps cannot name by its arguments (v4l2-ctl,
  // a player) is still found. Processes of other users cannot be read and are not counted.
  function openers(dev) {
    const out = [];
    let pids = [];
    try { pids = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number); } catch { return out; }
    for (const pid of pids) {
      if (mine().includes(pid)) continue;
      let fds = [];
      try { fds = fs.readdirSync(`/proc/${pid}/fd`); } catch { continue; }
      if (fds.some((fd) => { try { return fs.readlinkSync(`/proc/${pid}/fd/${fd}`) === dev; } catch { return false; } })) {
        out.push({ pid, exe: read(`/proc/${pid}/comm`) || '?' });
      }
    }
    return out;
  }

  function refusal(source, cam = null) {
    if (!SOURCES.includes(source)) return `source is ${SOURCES.join(' or ')}`;
    if (!connected()) return `no screen on HDMI0: ${paths.connector.split('/').slice(-2, -1)[0]} reads ${read(paths.connector) ?? 'nothing'}`;
    if (!fbInfo()) return `${paths.fb} has no size to read at ${paths.size}`;
    const text = psText();
    const d = displayHolders(text, mine());
    if (d.length) return `the screen is held by ${d.map(named).join(', ')}; stop that first`;
    const o = [paths.fb, paths.card].filter(Boolean).flatMap(openers);
    if (o.length) return `the screen is held by ${o.map(named).join(', ')}; stop that first`;
    if (source === 'camera') {
      const busy = cameraBusy();
      if (busy) return busy;
      const c = cameraHolders(text, mine());
      if (c.length) return `the camera is held by ${c.map(named).join(', ')}`;
      const co = cam?.device ? openers(cam.device) : [];
      if (co.length) return `the camera is held by ${co.map(named).join(', ')}`;
    }
    return '';
  }

  function stop(why = 'asked to stop') {
    const s = show;
    if (!s) return Promise.resolve({ ok: true, was: null });
    s.stopping = true;
    return new Promise((done) => {
      let finished = false;
      const finish = () => {
        if (finished) return; finished = true;
        if (show === s) show = null;
        last = { source: s.source, why, at: now(), said: s.tail.slice(-2) };
        const cleared = clear();
        log(`hdmi: the ${s.source} is off the screen, ${why}${cleared ? ', cleared to black' : ''}`);
        done({ ok: true, was: s.source, cleared });
      };
      if (s.exited) { finish(); return; }
      s.onExit = finish;
      try { s.proc.kill('SIGTERM'); } catch { /* gone */ }
      // SIGTERM is a request; hdmi-scan puts the console's CRTC back on it, which a SIGKILL would skip,
      // so the kill waits 2 s and the clear waits for the exit or 2.5 s.
      setTimer(() => { if (!s.exited) { try { s.proc.kill('SIGKILL'); } catch { /* gone */ } } }, 2000);
      setTimer(finish, 2500);
    });
  }

  async function start(source) {
    if (show?.source === source && SOURCES.includes(source)) return { ok: true, ...status() };
    const cam = source === 'camera' && connected() ? findCamera() : null;
    const why = refusal(source, cam);
    if (why) return { ok: false, why };
    if (show) await stop(`replaced by the ${source}`);
    const fb = fbInfo();
    const c = showCommand(source, { fb, cam, fbPath: paths.fb, scan: scan() });
    if (c.why) return { ok: false, why: c.why };
    let proc;
    try { proc = spawn(c.cmd, c.args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return { ok: false, why: `${c.cmd} would not start: ${e.message}` }; }
    const s = { source, proc, pid: proc.pid ?? null, since: now(), w: c.w, h: c.h, fps: c.fps, at: c.at ?? { x: 0, y: 0 }, by: c.by,
      cmd: c.cmd.split('/').pop(), stopping: false, exited: false, onExit: null, tail: [] };
    show = s;
    // hdmi-scan says its connector, mode and GL_RENDERER at start, and frames, fps and CPU at exit.
    const keep = (d) => { for (const l of String(d).split('\n')) if (l.trim()) { s.tail.push(l.trim()); if (s.tail.length > 6) s.tail.shift(); } };
    proc.stdout?.on('data', keep);
    proc.stderr?.on('data', keep);
    const ended = (what) => {
      if (s.exited) return; s.exited = true;
      if (s.onExit) { s.onExit(); return; }
      if (s.stopping) return;
      const tail = s.tail.filter((l) => !/dts|Past duration/i.test(l)).slice(-1)[0];
      if (show === s) show = null;
      last = { source, why: `${c.cmd} ${what}${tail ? `: ${tail.slice(0, 160)}` : ''}`, at: now() };
      clear();
      log(`hdmi: the ${source} stopped on its own, ${last.why}`);
    };
    proc.on('exit', (code, sig) => ended(`exited (${sig ?? code})`));
    proc.on('error', (e) => ended(`could not run, ${e.code || e.message}`));
    log(`hdmi: the ${source} on HDMI0 by ${s.cmd}, ${c.by === 'gpu' ? 'full screen, scaled by the GPU' : `${c.w}x${c.h} at ${c.fps} fps${c.at ? ` at ${c.at.x},${c.at.y}` : ''}`} on a ${fb.w}x${fb.h} screen`);
    return { ok: true, ...status() };
  }

  function status() {
    const fb = fbInfo();
    const cpu = show?.pid ? cpuShare(read(`/proc/${show.pid}/stat`), read('/proc/uptime')) : null;
    return { screen: connected(), fb, showing: show?.source ?? null, pid: show?.pid ?? null,
      since: show?.since ?? null, drawnBy: show ? show.cmd : null, scan: scan(),
      picture: show ? { w: show.w, h: show.h, fps: show.fps, at: show.at, scaled: show.by === 'gpu' } : null,
      said: show ? show.tail.slice(-3) : [], cpu, last, clears, sources: [...SOURCES] };
  }

  return {
    start, stop, status, refusal, clear,
    showing: () => show?.source ?? null,
    /** The graph's facts: HDMI0 while a screen is connected, asked every beat. */
    screens: () => (connected() ? [{ name: 'hdmi0', label: 'HDMI screen' }] : []),
    /** The board's verbs, `reply(type, body)`; answered `hdmi.state` every time. */
    handles: (m) => m?.type === 'hdmi.show' || m?.type === 'hdmi.stop' || m?.type === 'hdmi.status',
    async handle(m, reply) {
      if (m.type === 'hdmi.show') { const r = await start(m.source); return reply('hdmi.state', r.ok ? r : { ok: false, why: r.why, ...status() }); }
      if (m.type === 'hdmi.stop') { const r = await stop(`asked by ${m.from ?? 'nobody named'}`); return reply('hdmi.state', { ok: true, stopped: r.was, cleared: r.cleared ?? false, ...status() }); }
      return reply('hdmi.state', { ok: true, ...status() });
    },
  };
}
