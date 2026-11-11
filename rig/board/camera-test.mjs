// node rig/board/camera-test.mjs: listings, the per-frame splitter and the room logic, no camera.
// Negative controls: an SPS-only splitter, acting before `cam.key.ok`, counting our own echo.
// Not graded: rpicam-vid on the real board, and the relay dropping unkeyed messages.
// why: lessons/rig-board-tests.md#camera-test-header
import { spawnSync } from 'node:child_process';
import { parseRpicamList, parseV4l2Devices, pickCaptureDevice, findCamera, cameraCommand,
  createAccessUnitSplitter, createCameraRoom, framePieces, sameKey, DIRECT_PIECE, startCamera } from './camera.mjs';
import { grayOutputArgs, createFrameCutter } from './screen-camera.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`${c ? 'ok  ' : 'BAD '} ${m}`); };

// ── listings ─────────────────────────────────────────────────────────────
const RPICAM = `Available cameras
-----------------
0 : imx708_wide [4608x2592 10-bit RGGB] (/base/soc/i2c0mux/i2c@1/imx708@1a)
    Modes: 'SRGGB10_CSI2P' : 1536x864 [120.13 fps - (768, 432)/3072x1728 crop]
`;
const cams = parseRpicamList(RPICAM);
ok(cams.length === 1 && cams[0].sensor === 'imx708_wide', 'rpicam: one camera, its sensor read');
ok(parseRpicamList('No cameras available!').length === 0, 'rpicam: "No cameras available!" is no camera');
ok(parseRpicamList(`    Modes: 'SRGGB10_CSI2P' : 1536x864 [120.13 fps]`).length === 0, 'rpicam: a mode line is not a camera');

const V4L2_PI_ONLY = `bcm2835-codec-decode (platform:bcm2835-codec):
\t/dev/video10
\t/dev/video11
\t/dev/video12
\t/dev/video18
\t/dev/video31
\t/dev/media2

bcm2835-isp (platform:bcm2835-isp):
\t/dev/video13
\t/dev/video14
\t/dev/media0

rpivid (platform:rpivid):
\t/dev/video19
\t/dev/media1
`;
ok(pickCaptureDevice(parseV4l2Devices(V4L2_PI_ONLY)) === null, 'v4l2: the Pi\'s own codec, ISP and HEVC nodes are not a camera');
const V4L2_USB = V4L2_PI_ONLY + `
HD Pro Webcam C920 (usb-0000:01:00.0-1.3):
\t/dev/video0
\t/dev/video1
\t/dev/media3
`;
const pick = pickCaptureDevice(parseV4l2Devices(V4L2_USB));
ok(pick?.device === '/dev/video0' && /C920/.test(pick.name), 'v4l2: a USB webcam is found at its first node');

const fake = (map) => (cmd, args) => map[`${cmd} ${args.join(' ')}`] ?? { ok: false, out: '', why: `${cmd} is not installed` };
let f = findCamera({ source: '', runner: fake({ 'rpicam-hello --list-cameras': { ok: true, out: RPICAM } }) });
ok(f.ok && f.kind === 'csi' && f.cmd === 'rpicam-vid', 'find: a CSI camera wins and is driven by rpicam-vid');
f = findCamera({ source: '', runner: fake({
  'rpicam-hello --list-cameras': { ok: false, out: 'No cameras available!' },
  'v4l2-ctl --list-devices': { ok: true, out: V4L2_USB },
  'v4l2-ctl -d /dev/video0 --list-formats': { ok: true, out: "[0]: 'YUYV'\n[1]: 'MJPG' (Motion-JPEG, compressed)" } }) });
ok(f.ok && f.kind === 'usb' && f.inputFormat === 'mjpeg', 'find: no CSI camera, a USB one with MJPEG');
f = findCamera({ source: '', runner: fake({
  'rpicam-hello --list-cameras': { ok: false, out: 'No cameras available!' },
  'v4l2-ctl --list-devices': { ok: true, out: V4L2_PI_ONLY } }) });
ok(!f.ok && /no camera/.test(f.reason) && /lists no camera/.test(f.detail), 'find: none at all says so, with what was asked');

const [c1, a1] = cameraCommand({ kind: 'csi', cmd: 'rpicam-vid' }, { w: 1280, h: 720, fps: 30, bitrate: 1500000, gop: 30 });
ok(c1 === 'rpicam-vid' && a1.includes('--inline') && a1.join(' ').includes('--intra 30') && a1.at(-1) === '-', 'csi: inline headers, a keyframe each GOP, to stdout');
const [, a2] = cameraCommand({ kind: 'usb', device: '/dev/video0', inputFormat: 'mjpeg' }, { w: 1280, h: 720, fps: 30, bitrate: 1500000, gop: 30, hw: true });
ok(a2.join(' ').includes('-f v4l2 -input_format mjpeg') && a2.includes('h264_v4l2m2m'), 'usb: v4l2 in, the hardware encoder out on a Pi 4');
const [, a3] = cameraCommand({ kind: 'usb', device: '/dev/video0' }, { w: 640, h: 480, fps: 30, bitrate: 1e6, gop: 30, hw: false });
ok(a3.includes('libx264') && a3.join(' ').includes('dump_extra=freq=keyframe'), 'usb: libx264 with headers before each keyframe where there is no hardware encoder');

// ── the splitter, on real encoder output ────────────────────────────────
function encode(extra) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30',
    '-frames:v', '90', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-profile:v', 'baseline', '-bf', '0', '-g', '30', ...extra, '-f', 'h264', '-'], { maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : null;
}
const stream = encode(['-bsf:v', 'dump_extra=freq=keyframe']);
if (!stream) console.log('skip the splitter on real output: no ffmpeg with libx264 on this machine');
else {
  const cut = (buf, step, mk = createAccessUnitSplitter) => {
    const units = [];
    const s = mk((u, k) => units.push({ u, k }));
    for (let i = 0; i < buf.length; i += step) s(buf.subarray(i, i + step));
    s(Buffer.from([0, 0, 0, 1, 9, 0xf0]));    // an AUD to flush the last frame
    return units;
  };
  for (const step of [188, 4096, 65536]) {
    const u = cut(stream, step);
    ok(u.length === 90, `splitter, ${step} byte chunks: 90 frames in, ${u.length} units out`);
    ok(u.filter((x) => x.k).length === 3, `splitter, ${step} byte chunks: 3 keyframes marked (${u.filter((x) => x.k).length})`);
  }
  const first = cut(stream, 4096)[0].u;
  ok((first[4] & 0x1f) === 7, 'splitter: the first unit opens on the SPS a decoder needs');
  // Every keyframe unit carries its own SPS, so a late joiner can start there.
  const keyed = cut(stream, 4096).filter((x) => x.k);
  ok(keyed.every((x) => (x.u[4] & 0x1f) === 7), 'splitter: every keyframe unit begins with an SPS (dump_extra)');
  const audStream = encode(['-bsf:v', 'h264_metadata=aud=insert']);
  if (audStream) ok(cut(audStream, 4096).length === 90, 'splitter: an encoder that writes access unit delimiters, still 90 units');
  // NEGATIVE CONTROL: cutting at SPS only, video.mjs's rule, is wrong for this stream.
  const spsOnly = (onUnit) => { let b = Buffer.alloc(0); return (c) => {
    b = Buffer.concat([b, c]); const at = [];
    for (let i = 0; i + 4 < b.length; i++) if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 0 && b[i + 3] === 1 && (b[i + 4] & 0x1f) === 7) at.push(i);
    for (let i = 0; i + 1 < at.length; i++) onUnit(b.subarray(at[i], at[i + 1]), true);
    if (at.length) b = b.subarray(at.at(-1)); }; };
  ok(cut(stream, 4096, spsOnly).length < 10, 'negative control: an SPS-only splitter makes one unit per GOP on this stream');
}

// ── the room ─────────────────────────────────────────────────────────────
class FakeWS {
  static last = null;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.bufferedAmount = 0; FakeWS.last = this;
    queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
  send(d) { this.sent.push(d); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  hear(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
  texts() { return this.sent.filter((d) => typeof d === 'string').map((d) => JSON.parse(d)); }
}
let clock = 1_000_000;
const started = [], stopped = [];
const fakeStart = (cam, opts) => {
  const h = { ok: true, w: 1280, h: 720, fps: 30, bitrate: 1500000, gop: 30, stats: () => ({ frames: 3, bytes: 30, keys: 1 }),
    stop: () => stopped.push(clock), frame: (k) => opts.onFrame(new Uint8Array([0, 0, 0, 1, k ? 0x65 : 0x41]), k) };
  started.push(h); return h;
};
const tick = (ms) => { clock += ms; };
const room = createCameraRoom({ relay: 'wss://x', room: 'studio-1-cam', key: 'k'.repeat(64), WS: FakeWS,
  find: () => ({ ok: true, kind: 'test', name: 'test' }), start: fakeStart, now: () => clock, log: () => {} });
await new Promise((r) => setTimeout(r, 0));
const ws = FakeWS.last;
ok(ws.url === 'wss://x/room/studio-1-cam/ws' && !ws.url.includes('k'.repeat(8)), 'room: joins <room>-cam, and the key is not in the URL');
ok(ws.texts()[0]?.type === 'cam.key' && ws.texts()[0].key === 'k'.repeat(64), 'room: the first message proves the key');
ws.hear({ type: 'cam.watching', from: 'page-1' });
ok(started.length === 0, 'negative control: a viewer heard before the relay took the key starts nothing');
ws.hear({ type: 'cam.key.ok' });
ws.hear({ type: 'cam.watching', from: room.status && FakeWS.last.texts()[0].from });
ok(started.length === 0, 'room: its own echo is not a viewer');
ws.hear({ type: 'cam.watching', from: 'page-1' });
ok(started.length === 1 && room.running(), 'room: a keyed viewer starts the camera');
ok(ws.texts().some((m) => m.type === 'cam.started' && m.codec && m.w === 1280), 'room: says cam.started with the shape a decoder needs');
started[0].frame(true); started[0].frame(false);
const bins = ws.sent.filter((d) => typeof d !== 'string');
ok(bins.length === 2 && bins[0].readUInt32LE(0) === 0 && bins[0].readUInt32LE(4) === 1 && bins[1].readUInt32LE(0) === 1 && bins[1].readUInt32LE(4) === 0,
  'room: frames go out with the counter and the keyframe bit, board-video.mjs\'s header');
ws.hear({ type: 'cam.watching', from: 'page-2' });
ws.hear({ type: 'cam.bye', from: 'page-1' });
ok(room.running(), 'room: one viewer leaving keeps it on for the other');
ws.hear({ type: 'cam.bye', from: 'page-2' });
ok(!room.running() && stopped.length === 1, 'room: the last bye stops it');
ws.hear({ type: 'cam.watching', from: 'page-3' });
ok(room.running() && started.length === 2, 'room: a new viewer starts it again');
tick(30_000);
await new Promise((r) => setTimeout(r, 5200));
ok(!room.running() && stopped.length === 2, 'room: silence past CAM_IDLE_MS stops it');
ws.hear({ type: 'cam.watching', from: 'page-4' });
ws.close();
ok(!room.running(), 'room: losing the room stops the camera');
room.stop();

// The direct path. Negative controls: a gate checking only the key or only the viewer, and a board
// still sending via the relay to a viewer it serves direct.
// why: lessons/rig-board-tests.md#camera-test-direct
{
  const big = new Uint8Array(DIRECT_PIECE * 2 + 5).map((_, i) => i & 255);
  const ps = framePieces(7, true, big);
  ok(ps.length === 3 && ps.every((b) => b.readUInt32LE(0) === 7) && ps.map((b) => b.readUInt32LE(4)).join() === '3,3,1',
    'direct: a frame over one piece is cut, every piece says more but the last, all say keyframe');
  ok(Buffer.concat(ps.map((b) => b.subarray(8))).equals(Buffer.from(big)), 'direct: and the pieces put back together are the frame');
  const one = framePieces(8, false, new Uint8Array([1, 2, 3]));
  ok(one.length === 1 && one[0].readUInt32LE(4) === 0 && one[0].length === 11, 'direct: a small delta frame is one piece with no flags');
  ok(sameKey('a'.repeat(64), 'a'.repeat(64)) && !sameKey('a'.repeat(64), 'b'.repeat(64)) && !sameKey('', '') && !sameKey(undefined, 'x'),
    'direct: keys compare, and an empty key never matches');

  const K = 'k'.repeat(64);
  const r2 = createCameraRoom({ relay: 'wss://x', room: 'studio-1-cam', key: K, WS: FakeWS,
    find: () => ({ ok: true, kind: 'test', name: 'test' }), start: fakeStart, now: () => clock, log: () => {} });
  await new Promise((r) => setTimeout(r, 0));
  const w2 = FakeWS.last;
  const sinkOf = () => { const s = { out: [], texts: [], isOpen: true, back: 0 };
    s.sink = { open: () => s.isOpen, backlog: () => s.back, send: (b) => s.out.push(b), text: (m) => s.texts.push(m) }; return s; };
  const a = sinkOf();
  ok(r2.attachDirect({ id: 'circuit:p1', viewer: 'page-1', key: K, sink: a.sink }).ok === false, 'direct: refused before the board is in the keyed room');
  w2.hear({ type: 'cam.key.ok' });
  const noViewer = r2.attachDirect({ id: 'circuit:p1', viewer: 'page-1', key: K, sink: a.sink });
  ok(noViewer.ok === false && noViewer.retry === true, 'NEGATIVE CONTROL direct: the right key with no keyed viewer of that name is refused');
  w2.hear({ type: 'cam.watching', from: 'page-1' });
  const n0 = started.length;
  ok(r2.attachDirect({ id: 'circuit:p1', viewer: 'page-1', key: 'x'.repeat(64), sink: a.sink }).ok === false, 'NEGATIVE CONTROL direct: a keyed viewer with the wrong key is refused');
  ok(r2.attachDirect({ id: 'circuit:p1', viewer: 'page-1', key: K, sink: a.sink }).ok === true, 'direct: the key and a keyed viewer, both, attach');
  ok(a.texts.some((m) => m.type === 'cam.started'), 'direct: a running camera says cam.started on the channel');
  const cam2 = started[n0 - 1 + 1] || started.at(-1);
  const relayBins = () => w2.sent.filter((d) => typeof d !== 'string').length;
  const rb0 = relayBins();
  cam2.frame(false);
  ok(a.out.length === 0, 'direct: a delta before the first keyframe is not sent on the channel');
  cam2.frame(true); cam2.frame(false);
  ok(a.out.length === 2 && a.out[0].readUInt32LE(4) === 1, 'direct: from the keyframe on, every frame goes direct');
  ok(relayBins() === rb0, 'NEGATIVE CONTROL direct: and none through the relay while the only viewer is direct');
  w2.hear({ type: 'cam.watching', from: 'page-2' });
  cam2.frame(true);
  ok(relayBins() === rb0 + 1 && a.out.length === 3, 'direct: a second viewer on the relay brings the relay frames back, and the direct one keeps its own');
  w2.hear({ type: 'cam.bye', from: 'page-2' });
  a.back = 4 << 20; cam2.frame(false);
  ok(a.out.length === 3, 'direct: a channel that is not draining drops deltas');
  a.back = 0; cam2.frame(false);
  ok(a.out.length === 3, 'direct: and waits for the next keyframe');
  cam2.frame(true);
  ok(a.out.length === 4, 'direct: which it then sends');
  w2.hear({ type: 'cam.relay', from: 'page-1' });
  const rb1 = relayBins();
  cam2.frame(true);
  ok(r2.status().direct.length === 0 && relayBins() === rb1 + 1 && a.out.length === 4, 'direct: cam.relay from the page puts it back on the relay at once');
  ok(r2.attachDirect({ id: 'circuit:p1', viewer: 'page-1', key: K, sink: a.sink }).ok, 'direct: and it can attach again');
  a.isOpen = false; cam2.frame(true);
  ok(r2.status().direct.length === 0, 'direct: a closed channel is detached on the next frame');
  r2.attachDirect({ id: 'circuit:p1', viewer: 'page-1', key: K, sink: (a.isOpen = true, a.sink) });
  w2.hear({ type: 'cam.bye', from: 'page-1' });
  ok(r2.status().direct.length === 0, 'direct: a bye detaches it');
  r2.stop();
}
// The OLED's grey output beside the H.264, from one real ffmpeg. Negative control: rpicam-vid gets no fd 3 output.
{
  const [, csi] = cameraCommand({ kind: 'csi', cmd: 'rpicam-vid' }, { w: 1280, h: 720, fps: 30, bitrate: 1e6, gop: 30, side: ['-f', 'rawvideo'] });
  ok(!csi.includes('pipe:3'), 'NEGATIVE CONTROL side: rpicam-vid has one output, no side');
  const [, usb] = cameraCommand({ kind: 'usb', device: '/dev/video0', inputFormat: 'mjpeg' }, { w: 1280, h: 720, fps: 30, bitrate: 1e6, gop: 30, hw: true, side: grayOutputArgs() });
  ok(usb.indexOf('pipe:3') > usb.indexOf('-') && usb.at(-1) === 'pipe:3' && usb.join(' ').includes('-f h264 - -vf fps=24,crop'), 'side: usb, the grey output follows the H.264 one, to fd 3');
  if (!stream) console.log('skip the side output on real ffmpeg: no ffmpeg with libx264 on this machine');
  else {
    let units = 0, gray = 0, starts = 0, ends = 0, rest = 0;
    const cut = createFrameCutter(8192, (g) => { gray++; if (g.length !== 8192) rest++; });
    const h = startCamera({ kind: 'test' }, { w: 320, h: 240, fps: 30, bitrate: 500_000, gop: 30, onFrame: () => units++,
      side: { args: grayOutputArgs(), onData: cut, start: () => starts++, end: () => ends++ } });
    await new Promise((r) => setTimeout(r, 1500));
    h.stop();
    await new Promise((r) => setTimeout(r, 300));
    ok(h.side && starts === 1 && ends === 1, `side: started once with the encoder and ended once with it (${starts}, ${ends})`);
    ok(units >= 20 && gray >= 15 && !rest, `side: one ffmpeg, ${units} H.264 frames and ${gray} grey 128x64 frames in 1.5 s`);
  }
}

const off = createCameraRoom({ relay: 'wss://x', room: 'r-cam', key: '', WS: FakeWS, log: () => {} });
ok(off.enabled === false && !off.running(), 'room: no key set, nothing joined and nothing started');

console.log(`\n${pass} ok, ${fail} bad`);
process.exit(fail ? 1 : 0);
