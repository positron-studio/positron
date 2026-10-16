// The Pi camera, for key holders only: the board joins `<room>-cam` with BOARD_CAM_KEY and
// starts on `cam.watching` there, stopping on the last `cam.bye` or after CAM_IDLE_MS.
// It shares /dev/video11 with the shader picture, so each refuses while the other runs.
// why: lessons/rig-board-io.md#camera-header
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';

/** No `cam.watching` from anybody for this long, and the camera stops. */
export const CAM_IDLE_MS = 25_000;
/** What the page is told to configure its decoder with. Baseline, as every source below is asked for. */
export const CAM_CODEC = 'avc1.42E01F';
/** Over this many bytes queued on the socket, delta frames are dropped until the next keyframe. */
const BACKLOG_BYTES = 2 << 20;

// Frames may ride a page's direct link on channel `cam`; control stays in the keyed room. Two
// gates: the key and a viewer this room heard. 16 KB ordered reliable pieces: uint32 counter,
// uint32 flags (bit 0 keyframe, bit 1 more pieces), bytes. Bytes of picture per piece below.
// why: lessons/rig-board-io.md#direct-piece
export const DIRECT_PIECE = 16 * 1024 - 8;
/** At most this many direct viewers; past it a page stays on the relay. */
export const MAX_DIRECT = 4;

/** One frame as the pieces the `cam` channel carries. Pure. */
export function framePieces(seq, key, unit, piece = DIRECT_PIECE) {
  const out = [];
  for (let o = 0; o < unit.byteLength || (o === 0 && !out.length); o += piece) {
    const n = Math.min(piece, unit.byteLength - o);
    const more = o + n < unit.byteLength;
    const b = Buffer.allocUnsafe(8 + n);
    b.writeUInt32LE(seq >>> 0, 0);
    b.writeUInt32LE((key ? 1 : 0) | (more ? 2 : 0), 4);
    Buffer.from(unit.buffer, unit.byteOffset + o, n).copy(b, 8);
    out.push(b);
    if (!more) break;
  }
  return out;
}

/** Key equality that does not leak where two keys first differ. */
export function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const h = (x) => createHash('sha256').update(x).digest();
  return timingSafeEqual(h(a), h(b));
}

const run = (cmd, args, timeout = 6000) => {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout });
    if (r.error) return { ok: false, out: '', why: r.error.code === 'ENOENT' ? `${cmd} is not installed` : String(r.error.message) };
    return { ok: r.status === 0, out: `${r.stdout || ''}\n${r.stderr || ''}`, status: r.status };
  } catch (e) { return { ok: false, out: '', why: String(e.message) }; }
};

// `rpicam-hello --list-cameras` read: one line per camera, or `No cameras available!`.
// why: lessons/rig-board-io.md#rpicam-list
export function parseRpicamList(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(\d+)\s*:\s*(\S+)\s*\[([^\]]*)\]\s*(\(.*\))?/);
    if (m) out.push({ index: +m[1], sensor: m[2], mode: m[3].trim(), path: (m[4] || '').replace(/^\(|\)$/g, '') });
  }
  return out;
}

// `v4l2-ctl --list-devices` read: a name line ending in a colon, device nodes indented under it.
// why: lessons/rig-board-io.md#v4l2-devices
export function parseV4l2Devices(text) {
  const blocks = [];
  let cur = null;
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    if (/^\S/.test(line)) { cur = { name: line.replace(/:\s*$/, '').trim(), devices: [] }; blocks.push(cur); }
    else if (cur) cur.devices.push(line.trim());
  }
  return blocks;
}

// The Pi's codec, ISP and CSI receiver nodes are video devices but not cameras.
// why: lessons/rig-board-io.md#not-a-camera
const NOT_A_CAMERA = /bcm2835-codec|bcm2835-isp|rpi-hevc|hevc-dec|pispbe|rp1-cfe|unicam|rpivid|platform:bcm2835/i;
export function pickCaptureDevice(blocks) {
  for (const b of blocks) {
    if (NOT_A_CAMERA.test(b.name)) continue;
    const dev = b.devices.find((d) => /^\/dev\/video\d+$/.test(d));
    if (dev) return { name: b.name, device: dev };
  }
  return null;
}

// Asked of the machine each time: CSI through libcamera, then USB through V4L2.
// BOARD_CAM_SOURCE=test is an ffmpeg stand-in picture.
// why: lessons/rig-board-io.md#find-camera
export function findCamera({ source = process.env.BOARD_CAM_SOURCE || '', runner = run } = {}) {
  if (source === 'test') return { ok: true, kind: 'test', name: 'a test picture (BOARD_CAM_SOURCE=test)' };
  const tried = [];
  for (const cmd of ['rpicam-hello', 'libcamera-hello']) {
    const r = runner(cmd, ['--list-cameras']);
    if (r.why) { tried.push(r.why); continue; }
    const cams = parseRpicamList(r.out);
    if (cams.length) return { ok: true, kind: 'csi', cmd: cmd.replace('-hello', '-vid'), name: cams[0].sensor, mode: cams[0].mode };
    tried.push(`${cmd} lists no camera`);
    break;
  }
  const v = runner('v4l2-ctl', ['--list-devices']);
  if (v.why) tried.push(v.why);
  else {
    const pick = pickCaptureDevice(parseV4l2Devices(v.out));
    if (pick) {
      const f = runner('v4l2-ctl', ['-d', pick.device, '--list-formats']);
      const mjpeg = /MJPG|Motion-JPEG/i.test(f.out || '');
      return { ok: true, kind: 'usb', name: pick.name, device: pick.device, inputFormat: mjpeg ? 'mjpeg' : null };
    }
    tried.push('v4l2-ctl lists no capture device beside the Pi\'s own codec nodes');
  }
  return { ok: false, reason: 'no camera on this board', detail: tried.join('; ') };
}

/** The command that makes Annex B H.264 on stdout, for each kind of source. */
export function cameraCommand(cam, { w, h, fps, bitrate, gop, hw = existsSync('/dev/video11') } = {}) {
  if (cam.kind === 'csi') {
    return [cam.cmd || 'rpicam-vid', ['-t', '0', '-n', '--codec', 'h264', '--inline', '--intra', String(gop),
      '--profile', 'baseline', '--width', String(w), '--height', String(h), '--framerate', String(fps),
      '--bitrate', String(bitrate), '--flush', '-o', '-']];
  }
  // libx264 writes its parameter sets once at the start; `dump_extra` puts them
  // before every keyframe, so a viewer who joins late can start at the next one.
  const x264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-profile:v', 'baseline', '-bf', '0',
    '-bsf:v', 'dump_extra=freq=keyframe'];
  const enc = hw ? ['-c:v', 'h264_v4l2m2m'] : x264;
  const tail = ['-pix_fmt', 'yuv420p', ...enc, '-b:v', String(bitrate), '-g', String(gop), '-f', 'h264', '-'];
  if (cam.kind === 'usb') {
    return ['ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'v4l2',
      ...(cam.inputFormat ? ['-input_format', cam.inputFormat] : []),
      '-video_size', `${w}x${h}`, '-framerate', String(fps), '-i', cam.device, ...tail]];
  }
  if (cam.kind === 'test') {
    return ['ffmpeg', ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi',
      '-i', `testsrc2=size=${w}x${h}:rate=${fps}`, '-pix_fmt', 'yuv420p', ...x264,
      '-b:v', String(bitrate), '-g', String(gop), '-f', 'h264', '-']];
  }
  throw new Error(`camera: no command for a source of kind ${cam.kind}`);
}

// Annex B to access units, for encoders sending SPS/PPS only at keyframes: a frame starts at
// an AUD, a header outside a frame header, or a picture's first slice (first_mb_in_slice 0).
// Cutting at every slice made 270 units of 90 frames.
// why: lessons/rig-board-io.md#au-splitter
export function createAccessUnitSplitter(onUnit) {
  let buf = Buffer.alloc(0);
  const HEAD = new Set([9, 7, 8, 6]);
  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
    const nals = [];
    for (let i = 0; i + 3 < buf.length; i++) {
      if (buf[i] === 0 && buf[i + 1] === 0) {
        if (buf[i + 2] === 1) { nals.push({ at: i, type: buf[i + 3] & 0x1f }); i += 2; }
        else if (buf[i + 2] === 0 && i + 4 < buf.length && buf[i + 3] === 1) { nals.push({ at: i, type: buf[i + 4] & 0x1f }); i += 3; }
      }
    }
    const cuts = [];
    let prev = null;
    for (const n of nals) {
      const t = n.type;
      const firstSlice = (buf[n.at + (buf[n.at + 2] === 1 ? 4 : 5)] & 0x80) !== 0;
      let begins;
      if (t === 9) begins = true;
      else if (t === 7) begins = prev !== 9;
      else if (t === 8 || t === 6) begins = !HEAD.has(prev);
      else if (t === 1 || t === 5) begins = firstSlice && !HEAD.has(prev);
      else begins = false;
      if (begins) cuts.push(n.at);
      prev = t;
    }
    for (let i = 0; i + 1 < cuts.length; i++) {
      const unit = buf.subarray(cuts[i], cuts[i + 1]);
      const key = nals.some((n) => n.at >= cuts[i] && n.at < cuts[i + 1] && n.type === 5);
      onUnit(Uint8Array.prototype.slice.call(unit), key);
    }
    if (cuts.length) buf = buf.subarray(cuts[cuts.length - 1]);
    else if (buf.length > 4 << 20) { onUnit(null, false); buf = Buffer.alloc(0); }
  };
}

/** PIDs of camera encoders: rpicam-vid or libcamera-vid, or an ffmpeg reading `-f v4l2`. Never the audio ffmpeg (`-f jack`) or the shader one (`-f rawvideo`). */
export function cameraPids() {
  try {
    const out = execFileSync('ps', ['-eo', 'pid,args', '--no-headers'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n')
      .filter((l) => /\b(rpicam|libcamera)-vid\b/.test(l) || (/ffmpeg/.test(l) && /\s-f v4l2\s/.test(l)))
      .map((l) => +l.trim().split(/\s+/)[0])
      .filter((pid) => pid && pid !== process.pid);
  } catch { return []; }
}
export function sweepStrayCameras(onLog) {
  const pids = cameraPids();
  for (const pid of pids) {
    try { process.kill(pid, 'SIGKILL'); onLog?.(`swept a stray camera encoder (pid ${pid})`); } catch { /* gone */ }
  }
  return pids.length;
}

/** Start the camera's encoder. `onFrame(unit, key)` per frame; `onExit(why)` if it stops on its own. */
export function startCamera(cam, { w = 1280, h = 720, fps = 30, bitrate = 1_500_000, gop = 30,
  onFrame, onLog, onExit, spawnImpl = spawn } = {}) {
  let cmd, args;
  try { [cmd, args] = cameraCommand(cam, { w, h, fps, bitrate, gop }); }
  catch (e) { return { ok: false, reason: e.message }; }
  let p;
  try { p = spawnImpl(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return { ok: false, reason: `${cmd} would not start: ${e.message}` }; }
  let frames = 0, bytes = 0, keys = 0, stopping = false;
  const split = createAccessUnitSplitter((unit, key) => {
    if (unit === null) { onLog?.('the camera encoder produced no frame boundary in 4 MB'); return; }
    frames++; bytes += unit.byteLength; if (key) keys++;
    onFrame?.(unit, key);
  });
  p.stdout.on('data', split);
  // rpicam-vid talks a lot on stderr at start; keep the last lines for a reason.
  const tail = [];
  p.stderr?.on('data', (d) => {
    for (const line of String(d).split('\n')) {
      const t = line.trim();
      if (!t) continue;
      tail.push(t); if (tail.length > 6) tail.shift();
    }
  });
  p.on('error', (e) => { if (!stopping) onExit?.(`${cmd}: ${e.message}`); });
  p.on('exit', (code, sig) => {
    if (stopping) return;
    onExit?.(`${cmd} exited (${sig ?? code})${tail.length ? `: ${tail.slice(-2).join(' / ').slice(0, 200)}` : ''}`);
  });
  return {
    ok: true, cmd, w, h, fps, bitrate, gop,
    stats: () => ({ frames, bytes, keys }),
    stop() {
      stopping = true;
      try { p.kill('SIGTERM'); } catch { /* gone */ }
      // SIGTERM is a request; video.mjs records an encoder that ignored it and
      // held the device for minutes.
      setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, 800).unref?.();
    },
  };
}

// The board's side of the keyed room: joins, proves the key, runs the camera while a keyed viewer
// watches. relay, room `<room>-cam`, key (empty: off), encoderBusy (the shader holds the encoder).
// why: lessons/rig-board-io.md#camera-room
// `held()` answers why another board user (the HDMI show, hdmi.mjs) holds the camera now, or ''.
export function createCameraRoom({ relay, room, key, log = () => {}, encoderBusy = () => false, held = () => '',
  find = findCamera, start = startCamera, WS = globalThis.WebSocket, idleMs = CAM_IDLE_MS,
  size = {}, now = () => Date.now() } = {}) {
  if (!key) {
    log('camera: BOARD_CAM_KEY is not set, so the camera room is not joined and the camera never starts');
    return { enabled: false, running: () => false, status: () => ({ enabled: false }), stop() {} };
  }
  const FROM = `board-cam-${randomBytes(3).toString('hex')}`;
  const viewers = new Map();       // from -> last cam.watching
  let ws = null, authed = false, cam = null, shape = null, seq = 0, sent = 0, skipping = false, relaySkipped = 0;
  const directs = new Map();       // id -> { viewer, sink, waitKey, sent, dropped }
  // The relay carries the frames only while some keyed viewer is not on a
  // direct link: a frame nobody reads through the relay is relay time for nothing.
  const relayNeeded = () => {
    if (!directs.size) return true;
    const direct = new Set([...directs.values()].map((x) => x.viewer));
    for (const v of viewers.keys()) if (!direct.has(v)) return true;
    return false;
  };
  let backoff = 1000, closed = false, refusedKey = false, tick = null;
  // A refusal is remembered for half a minute, so a viewer's heartbeat every
  // ten seconds does not ask the machine for its cameras every ten seconds.
  let refusal = null;

  const say = (m) => { if (ws?.readyState === 1 && authed) ws.send(JSON.stringify({ ...m, from: FROM })); };

  function sendDirect(at, unit, key) {
    for (const [id, x] of directs) {
      if (!x.sink.open()) { detachDirect(id, 'its channel is not open'); continue; }
      if (x.sink.backlog() > BACKLOG_BYTES) x.waitKey = true;
      if (x.waitKey) { if (!key) { x.dropped++; continue; } x.waitKey = false; }
      try { for (const b of framePieces(at, key, unit)) x.sink.send(b); x.sent++; }
      catch (e) { detachDirect(id, `a send failed, ${e.message}`); }
    }
  }

  function sendFrame(unit, key) {
    const at = seq;
    if (directs.size) sendDirect(at, unit, key);
    if (!relayNeeded()) { seq++; relaySkipped++; skipping = true; return; }
    if (ws?.readyState !== 1 || !authed) return;
    // A slow link backs up in the socket; dropping deltas until the next
    // keyframe keeps the picture current rather than ever later.
    if (ws.bufferedAmount > BACKLOG_BYTES) { skipping = true; }
    if (skipping) { if (!key) { seq++; return; } skipping = false; }
    const out = Buffer.allocUnsafe(8 + unit.byteLength);
    out.writeUInt32LE(seq++ >>> 0, 0);
    out.writeUInt32LE(key ? 1 : 0, 4);
    Buffer.from(unit.buffer, unit.byteOffset, unit.byteLength).copy(out, 8);
    ws.send(out);
    sent++;
  }

  function end(why) {
    if (!cam) return;
    const st = cam.stats();
    cam.stop(); cam = null; shape = null;
    clearInterval(tick); tick = null;
    log(`camera: stopped, ${why}, after ${st.frames} frames`);
    say({ type: 'cam.stopped', why, ...st });
    sayDirect({ type: 'cam.stopped', why, ...st });
  }

  function sayDirect(m) {
    for (const x of directs.values()) { try { x.sink.text({ ...m, from: FROM }); } catch { /* closing */ } }
  }

  function attachDirect({ id, viewer, key: k, sink } = {}) {
    if (!id || !sink) return { ok: false, why: 'no channel' };
    if (!sameKey(k, key)) { log(`camera: a direct link offered a key that is not this board's (${id})`); return { ok: false, why: 'the key does not match this board' }; }
    if (!authed) return { ok: false, why: 'the board is not in the camera room yet', retry: true };
    if (typeof viewer !== 'string' || !viewers.has(viewer)) return { ok: false, why: 'no keyed viewer of that name in the camera room yet', retry: true };
    if (!directs.has(id) && directs.size >= MAX_DIRECT) return { ok: false, why: `${MAX_DIRECT} direct viewers already, use the relay` };
    directs.set(id, { viewer, sink, waitKey: true, sent: 0, dropped: 0, at: now() });
    log(`camera: frames go direct to ${viewer} (${id}), ${directs.size} direct`);
    if (cam && shape) { try { sink.text({ type: 'cam.started', ok: true, ...shape, from: FROM }); } catch { /* */ } }
    return { ok: true, running: !!cam };
  }

  function detachDirect(id, why) {
    const x = directs.get(id);
    if (!x) return false;
    directs.delete(id);
    log(`camera: ${x.viewer} back on the relay, ${why}, after ${x.sent} direct frames`);
    return true;
  }

  function begin() {
    if (cam) return;
    if (refusal && now() - refusal.at < 30_000) { say(refusal.msg); return; }
    refusal = null;
    const h = held();
    if (h) { say({ type: 'cam.refused', why: h }); return; }
    if (encoderBusy()) { say({ type: 'cam.refused', why: 'the hardware encoder is drawing the shader picture (/remote/shader-on-pi/), so the camera waits' }); return; }
    sweepStrayCameras((l) => log(`camera: ${l}`));
    const found = find();
    if (!found.ok) {
      log(`camera: ${found.reason} (${found.detail})`);
      refusal = { at: now(), msg: { type: 'cam.refused', why: found.reason, detail: found.detail } };
      say(refusal.msg);
      return;
    }
    seq = 0; sent = 0; skipping = false;
    const r = start(found, { ...size, onFrame: sendFrame, onLog: (l) => log(`camera: ${l}`),
      onExit: (why) => { if (!cam) return; log(`camera: ${why}`); const st = cam.stats(); cam = null; shape = null; clearInterval(tick); tick = null; say({ type: 'cam.stopped', why, ...st }); } });
    if (!r.ok) { log(`camera: ${r.reason}`); say({ type: 'cam.refused', why: r.reason }); return; }
    cam = r;
    shape = { w: r.w, h: r.h, fps: r.fps, bitrate: r.bitrate, gop: r.gop, codec: CAM_CODEC, camera: found.name, kind: found.kind };
    log(`camera: up, ${found.kind} ${found.name}, ${r.w}x${r.h} at ${r.fps} fps, ${(r.bitrate / 1e6).toFixed(1)} Mbit/s`);
    say({ type: 'cam.started', ok: true, ...shape });
    // The counter and this clock once a second, so a viewer can estimate the
    // delay against its own clock. Both clocks are NTP set; the estimate is
    // worth what their agreement is worth, and the page says so.
    tick = setInterval(() => { const m = { type: 'cam.tick', seq, at: now() }; say(m); sayDirect(m); }, 1000);
    tick.unref?.();
  }

  function heard(m) {
    if (!m || typeof m.from !== 'string' || m.from === FROM) return;
    if (m.type === 'cam.watching') {
      const isNew = !viewers.has(m.from);
      viewers.set(m.from, now());
      if (!cam) begin();
      else if (isNew) say({ type: 'cam.started', ok: true, ...shape });
    } else if (m.type === 'cam.relay') {
      // A page that lost its direct link says so here, so the relay carries
      // its frames again at once rather than when the dead link is noticed.
      for (const [id, x] of directs) if (x.viewer === m.from) detachDirect(id, 'it asked for the relay');
    } else if (m.type === 'cam.bye') {
      viewers.delete(m.from);
      for (const [id, x] of directs) if (x.viewer === m.from) detachDirect(id, 'it left');
      if (!viewers.size) end('the last viewer left');
    } else if (m.type === 'cam.ping') {
      say({ type: 'cam.pong', t: m.t, to: m.from, at: now() });
    }
  }

  const prune = setInterval(() => {
    const cut = now() - idleMs;
    for (const [k, t] of viewers) if (t < cut) viewers.delete(k);
    for (const [id, x] of directs) if (!viewers.has(x.viewer)) detachDirect(id, 'it stopped saying it is watching');
    if (cam && !viewers.size) end(`no keyed viewer has said it is watching for ${Math.round(idleMs / 1000)} s`);
  }, 5000);
  prune.unref?.();

  function connect() {
    if (closed) return;
    authed = false;
    ws = new WS(`${relay}/room/${room}/ws`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      backoff = 1000;
      // The key goes in the first message, never in the URL or a header, so it
      // is not written into the relay's request logs.
      ws.send(JSON.stringify({ type: 'cam.key', key, from: FROM }));
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;          // frames, our own or nobody's
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'cam.key.ok') { authed = true; refusedKey = false; log(`camera: joined ${room}, the relay took this board's key`); return; }
      if (authed) heard(m);
    };
    ws.onclose = (e) => {
      const was = authed;
      authed = false; ws = null;
      viewers.clear();
      for (const id of [...directs.keys()]) detachDirect(id, 'the board lost the camera room');
      end('the board lost the camera room');
      if (closed) return;
      if (e?.code === 4003) {
        if (!refusedKey) log(`camera: the relay refused this board's key for ${room}; BOARD_CAM_KEY does not match the PI_CAM_KEY secret`);
        refusedKey = true;
        backoff = 5 * 60_000;
      } else if (was) log(`camera: left ${room} (${e?.code ?? '?'}), rejoining`);
      setTimeout(connect, backoff).unref?.();
      backoff = Math.min(backoff * 2, 5 * 60_000);
    };
    ws.onerror = () => { /* close follows */ };
  }
  sweepStrayCameras((l) => log(`camera: ${l}`));
  connect();

  return {
    enabled: true,
    running: () => !!cam,
    status: () => ({ enabled: true, joined: authed, running: !!cam, viewers: viewers.size, sent, relaySkipped, shape,
      direct: [...directs.values()].map((x) => ({ viewer: x.viewer, sent: x.sent, dropped: x.dropped })) }),
    attachDirect, detachDirect,
    stop() { closed = true; clearInterval(prune); end('the board is stopping'); try { ws?.close(); } catch { /* gone */ } },
  };
}
