// rig/board/hdmi-test.mjs: the HDMI show (hdmi.mjs) on a fake spawn, fs and ps, its node in the
// board's graph, a link to it in a bay, and its row in the board's stop. No board, screen or camera.
//   node rig/board/hdmi-test.mjs
// Most are NEGATIVE CONTROLS: a refusal that should not fire, a process that is not a holder, a
// link that must be refused, a stop that skips the screen and must go red.
// why: lessons/rig-board-hdmi.md#test

import { EventEmitter } from 'node:events';
import { createHdmi, parseSize, centre, showCommand, displayHolders, cameraHolders, cpuShare, FB, CONNECTOR, FB_SIZE, FB_BITS, PATTERN_FPS, SCAN_SECONDS } from './hdmi.mjs';
import { createStop } from './stop.mjs';
import { graphOf } from './beat.mjs';
import { createBay } from '../../demo/shell/bay.mjs';
import { addBoardNode } from '../../demo/shell/graph-registry.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${detail ? ' | ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' | ' + detail : ''}`); }
};

const USB = { ok: true, kind: 'usb', name: 'C925e', device: '/dev/video0', inputFormat: 'mjpeg' };
const CAMERA_MJS = '2001 ffmpeg -hide_banner -loglevel error -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -i /dev/video0 -pix_fmt yuv420p -c:v h264_v4l2m2m -f h264 -';
const KERNEL = '528 [irq/45-vc4 hdmi hpd connected]\n530 [cec-vc4-hdmi-0]';
const SCAN = '1429 ./hdmi-scan bars 15';

/** A machine: files, a process table, and the processes spawned on it. */
const SCAN_AT = '/home/positron/hdmi/hdmi-scan';
function fakeMachine({ status = 'connected', size = '1920,1080', bits = '16', ps = KERNEL, scan = false } = {}) {
  const files = new Map([[CONNECTOR, status], [FB_SIZE, size], [FB_BITS, bits], ['/proc/uptime', '1000.00 3000.00']]);
  const writes = [], spawned = [];
  let pid = 5000;
  const m = {
    files, writes, spawned, ps,
    fs: {
      readFileSync: (p) => { if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return files.get(p); },
      writeFileSync: (p, buf) => { writes.push({ p, n: buf.length, zero: buf.every((b) => b === 0) }); },
      existsSync: (p) => scan && p === SCAN_AT,
    },
    spawn: (cmd, args) => {
      const p = new EventEmitter();
      p.pid = ++pid; p.stderr = new EventEmitter(); p.stdout = new EventEmitter(); p.killed = [];
      p.kill = (sig) => { p.killed.push(sig); if (sig === 'SIGTERM' && !p.ignoreTerm) queueMicrotask(() => p.emit('exit', null, sig)); };
      spawned.push({ cmd, args, p });
      // utime 30 s and stime 10 s of ticks, started at 900 s: 40 s over 100 s is 40 % of a core.
      files.set(`/proc/${p.pid}/stat`, `${p.pid} (ffmpeg) S 1 ${Array(9).fill(0).join(' ')} 3000 1000 0 0 0 0 0 0 90000 0`);
      return p;
    },
  };
  return m;
}
const make = (m, o = {}) => createHdmi({ spawn: m.spawn, fs: m.fs, ps: () => m.ps, findCamera: () => USB, setTimer: (fn) => setTimeout(fn, 0), scanPaths: [SCAN_AT], ...o });

console.log('\n== sizes and where the picture sits ==');
ok('the framebuffer size reads as the kernel writes it', JSON.stringify(parseSize('1920,1080\n')) === '{"w":1920,"h":1080}');
ok('NEGATIVE CONTROL: an empty or garbled size is no size', parseSize('') === null && parseSize('1920x1080') === null && parseSize('0,1080') === null);
ok('720p on a 1080p screen sits at 320,180, as measured on the Pi', JSON.stringify(centre({ w: 1920, h: 1080 }, { w: 1280, h: 720 })) === '{"x":320,"y":180}');
ok('and on a 4K screen at 1280,720', JSON.stringify(centre({ w: 3840, h: 2160 }, { w: 1280, h: 720 })) === '{"x":1280,"y":720}');
ok('NEGATIVE CONTROL: a picture wider than the screen has no place at 1:1', centre({ w: 1024, h: 768 }, { w: 1280, h: 720 }) === null);

console.log('\n== the commands ==');
{
  const fb = { w: 1920, h: 1080, bits: 16 };
  const c = showCommand('camera', { fb, cam: USB });
  const a = c.args.join(' ');
  ok('the camera is the measured command: MJPEG 1280x720 at 30, rgb565le into fbdev at 320,180',
    a === '-hide_banner -loglevel error -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -i /dev/video0 -pix_fmt rgb565le -f fbdev -xoffset 320 -yoffset 180 /dev/fb0', a);
  ok('NEGATIVE CONTROL: no scale filter, the scale is what cost 187 % of a core', !/scale/.test(a));
  const small = showCommand('camera', { fb: { w: 1024, h: 600, bits: 16 }, cam: USB });
  ok('a screen too small for 720p gets 640x480 centred', small.w === 640 && small.args.includes('192') && small.args.includes('60'), small.args.join(' '));
  ok('a 32 bit framebuffer is drawn as bgra', showCommand('pattern', { fb: { ...fb, bits: 32 } }).args.includes('bgra'));
  const p = showCommand('pattern', { fb });
  ok('the pattern is testsrc2 at the screen size and the cheap rate', p.args.includes(`testsrc2=size=1920x1080:rate=${PATTERN_FPS}`) && p.args.at(-1) === FB && !p.args.includes('-xoffset'));
  ok('NEGATIVE CONTROL: a 24 bit framebuffer is refused in words', /24 bits/.test(showCommand('pattern', { fb: { ...fb, bits: 24 } }).why || ''));
  ok('NEGATIVE CONTROL: no camera is refused in words, never a command', /no camera/.test(showCommand('camera', { fb, cam: { ok: false, detail: 'v4l2-ctl lists none' } }).why || ''));
  ok('NEGATIVE CONTROL: a source that is not one of the two is refused', !!showCommand('shader', { fb }).why);
}

console.log('\n== who holds the screen and the camera ==');
{
  const hold = displayHolders([KERNEL, SCAN, CAMERA_MJS].join('\n'));
  ok('hdmi-scan (rig/hdmi/) holds the screen', hold.length === 1 && hold[0].pid === 1429, JSON.stringify(hold));
  ok('NEGATIVE CONTROL: the kernel\'s vc4 hdmi threads are not holders', displayHolders(KERNEL).length === 0);
  // Measured on the Pi: the first refusal named `timeout (pid 3573)` beside the hdmi-scan it ran.
  const wrapped = displayHolders('3573 timeout 8 ./hdmi-scan bars 6\n3575 ./hdmi-scan bars 6');
  ok('NEGATIVE CONTROL: a timeout wrapping hdmi-scan is not a second holder', wrapped.length === 1 && wrapped[0].pid === 3575, JSON.stringify(wrapped));
  ok('NEGATIVE CONTROL: camera.mjs\'s encoder is not a screen holder', displayHolders(CAMERA_MJS).length === 0);
  const fbff = '3001 ffmpeg -re -f lavfi -i testsrc2 -pix_fmt rgb565le -f fbdev /dev/fb0';
  ok('another ffmpeg into fbdev holds the screen', displayHolders(fbff).length === 1);
  ok('NEGATIVE CONTROL: this show\'s own ffmpeg is not counted against it', displayHolders(fbff, [3001]).length === 0);
  ok('camera.mjs\'s encoder holds the camera', cameraHolders(CAMERA_MJS).length === 1);
  ok('NEGATIVE CONTROL: the pattern and the audio capture do not hold the camera',
    cameraHolders(`${fbff}\n4001 ffmpeg -f jack -i posboard -f s16le -`).length === 0);
}

console.log('\n== refusals, in words, and nothing spawned ==');
{
  let m = fakeMachine({ status: 'disconnected' });
  let r = await make(m).start('pattern');
  ok('no screen on HDMI0 is refused', !r.ok && /no screen on HDMI0: card1-HDMI-A-1 reads disconnected/.test(r.why) && !m.spawned.length, r.why);
  m = fakeMachine({ ps: `${KERNEL}\n${SCAN}` });
  r = await make(m).start('camera');
  ok('the screen held by another program is refused, naming it', !r.ok && /held by hdmi-scan \(pid 1429\)/.test(r.why) && !m.spawned.length, r.why);
  m = fakeMachine();
  r = await make(m, { cameraBusy: () => 'the camera is streaming its picture to /remote/circuit/, so the screen waits' }).start('camera');
  ok('the camera held by camera.mjs is refused in its words', !r.ok && /streaming its picture/.test(r.why) && !m.spawned.length, r.why);
  m = fakeMachine({ ps: `${KERNEL}\n${CAMERA_MJS}` });
  r = await make(m).start('camera');
  ok('a camera reader the board did not start is refused too', !r.ok && /camera is held by ffmpeg \(pid 2001\)/.test(r.why), r.why);
  m = fakeMachine({ ps: `${KERNEL}\n${CAMERA_MJS}` });
  r = await make(m, { cameraBusy: () => 'busy' }).start('pattern');
  ok('NEGATIVE CONTROL: a held camera does not stop the pattern', r.ok && m.spawned.length === 1, r.why || '');
  m = fakeMachine();
  m.fs.readdirSync = (p) => ({ '/proc': ['1', '1234', 'self'], '/proc/1/fd': ['0'], '/proc/1234/fd': ['0', '3'] })[p] ?? (() => { throw new Error('EACCES'); })();
  m.fs.readlinkSync = (p) => (p === '/proc/1234/fd/3' ? '/dev/video0' : '/dev/null');
  m.files.set('/proc/1234/comm', 'v4l2-ctl');
  r = await make(m).start('camera');
  ok('a camera held by a program ps cannot name is found in /proc and refused', !r.ok && r.why === 'the camera is held by v4l2-ctl (pid 1234)' && !m.spawned.length, r.why);
  r = await make(m).start('pattern');
  ok('NEGATIVE CONTROL: that holder does not stop the pattern', r.ok, r.why || '');
  m = fakeMachine();
  m.fs.readdirSync = (p) => ({ '/proc': ['77'], '/proc/77/fd': ['5'] })[p] ?? [];
  m.fs.readlinkSync = () => '/dev/dri/card1';
  m.files.set('/proc/77/comm', 'kmscube');
  r = await make(m).start('pattern');
  ok('a program holding the KMS card is found in /proc and refused', !r.ok && /held by kmscube \(pid 77\)/.test(r.why), r.why);
  m = fakeMachine();
  r = await make(m).start('tv');
  ok('NEGATIVE CONTROL: an unknown source is refused before anything is read', !r.ok && /camera or pattern/.test(r.why) && !m.spawned.length);
}

console.log('\n== a show, a stop, a black screen ==');
{
  const m = fakeMachine();
  const h = make(m);
  const r = await h.start('camera');
  const st = h.status();
  ok('the camera starts the measured command', r.ok && m.spawned.length === 1 && m.spawned[0].args.includes('-xoffset') && st.showing === 'camera', JSON.stringify(st.picture));
  ok('its CPU is read from /proc as a share of one core', st.cpu === 40, String(st.cpu));
  ok('NEGATIVE CONTROL: nothing is written to the screen while it shows', m.writes.length === 0);
  const s = await h.stop();
  const w = m.writes.at(-1);
  ok('stop ends ffmpeg and writes zeros over the whole framebuffer', s.was === 'camera' && m.spawned[0].p.killed[0] === 'SIGTERM'
    && w?.p === FB && w.n === 1920 * 1080 * 2 && w.zero && h.showing() === null, JSON.stringify(w));
  ok('a second stop is harmless and writes nothing more', (await h.stop()).was === null && m.writes.length === 1);
}
{
  const m = fakeMachine();
  const h = make(m);
  await h.start('pattern');
  const deaf = m.spawned[0].p; deaf.ignoreTerm = true;
  const s = await h.stop();
  ok('an ffmpeg that ignores SIGTERM is killed and the screen still cleared', deaf.killed.includes('SIGKILL') && s.cleared, deaf.killed.join(','));
}
{
  const m = fakeMachine();
  const h = make(m);
  await h.start('pattern');
  await h.start('camera');
  ok('a new source replaces the old: one killed, the screen cleared between, one running',
    m.spawned.length === 2 && m.spawned[0].p.killed.length > 0 && m.writes.length === 1 && h.showing() === 'camera');
  m.spawned[1].p.stderr.emit('data', 'Past duration 0.99 too large\n/dev/video0: No such device\n');
  m.spawned[1].p.emit('exit', 1, null);
  ok('an ffmpeg that dies on its own clears the screen and says why', h.showing() === null && m.writes.length === 2 && /No such device/.test(h.status().last.why), h.status().last.why);
}
{
  const m = fakeMachine();
  const h = make(m);
  const said = [];
  await h.handle({ type: 'hdmi.show', source: 'pattern' }, (t, b) => said.push([t, b]));
  await h.handle({ type: 'hdmi.status' }, (t, b) => said.push([t, b]));
  await h.handle({ type: 'hdmi.stop', from: 'test' }, (t, b) => said.push([t, b]));
  await h.handle({ type: 'hdmi.show', source: 'nope' }, (t, b) => said.push([t, b]));
  ok('every verb is answered hdmi.state', said.every(([t]) => t === 'hdmi.state') && said.length === 4);
  // wire.mjs refuses a body that carries an envelope field; the first push answered board.error for `by`.
  ok('NEGATIVE CONTROL: no answer carries an envelope field (from, sent, seq, by)',
    said.every(([, b]) => !['from', 'sent', 'seq', 'by'].some((k) => k in b)), said.map(([, b]) => Object.keys(b).join(',')).join(' | '));
  ok('show, status and stop say what is on the screen', said[0][1].showing === 'pattern' && said[1][1].showing === 'pattern' && said[2][1].stopped === 'pattern' && said[2][1].showing === null);
  ok('NEGATIVE CONTROL: a refused show says ok false and why', said[3][1].ok === false && !!said[3][1].why);
  ok('the verbs it takes are its three, no other', h.handles({ type: 'hdmi.show' }) && h.handles({ type: 'hdmi.stop' }) && !h.handles({ type: 'video.start' }));
}

console.log('\n== hdmi-scan first, ffmpeg when it is not there ==');
{
  const fb = { w: 1920, h: 1080, bits: 16 };
  const cam = showCommand('camera', { fb, cam: USB, scan: SCAN_AT });
  ok('with hdmi-scan the camera is full screen on the GPU, until SIGTERM', cam.cmd === SCAN_AT && cam.args.join(' ') === `camera ${SCAN_SECONDS} /dev/video0` && cam.by === 'gpu', cam.args.join(' '));
  ok('and the pattern is its bars', showCommand('pattern', { fb, scan: SCAN_AT }).args[0] === 'bars');
  ok('NEGATIVE CONTROL: a camera with no MJPEG falls back to ffmpeg, which hdmi-scan cannot decode for',
    showCommand('camera', { fb, cam: { ...USB, inputFormat: null }, scan: SCAN_AT }).cmd === 'ffmpeg');
  const m = fakeMachine({ scan: true });
  const h = make(m);
  await h.start('camera');
  ok('a show on a board with hdmi-scan spawns it', m.spawned[0]?.cmd === SCAN_AT && h.status().drawnBy === 'hdmi-scan' && h.status().picture.scaled);
  m.spawned[0].p.stderr.emit('data', 'frames 584 in 20.0 s = 29.2 fps, dropped 0, cpu 33.7 % of one core\n');
  await h.stop();
  ok('its last words are kept when it stops, and the screen is cleared', /29.2 fps/.test(h.status().last.said.join(' ')) && m.writes.at(-1)?.zero);
  const m2 = fakeMachine({ scan: false });
  await make(m2).start('camera');
  ok('NEGATIVE CONTROL: no hdmi-scan on the board, and ffmpeg draws 1:1', m2.spawned[0]?.cmd === 'ffmpeg' && m2.spawned[0].args.includes('-xoffset'));
  ok('hdmi-scan reading the camera holds it; its bars do not',
    cameraHolders('9001 ./hdmi-scan camera 20 /dev/video0').length === 1 && cameraHolders('9002 ./hdmi-scan bars 15').length === 0);
  const m3 = fakeMachine({ scan: true });
  const h3 = make(m3);
  await h3.start('pattern'); await h3.start('pattern');
  ok('NEGATIVE CONTROL: the same source twice is one process, not a restart', m3.spawned.length === 1 && !m3.spawned[0].p.killed.length);
  await h3.stop();
}

console.log('\n== cpu from /proc ==');
ok('utime plus stime over the age', cpuShare('7 (ff mpeg) S 1 0 0 0 0 0 0 0 0 0 500 500 0 0 0 0 0 0 0', '20.00 1') === 50);
ok('NEGATIVE CONTROL: an unreadable stat is null, never 0', cpuShare(null, '1') === null && cpuShare('garbled', '1') === null);

console.log('\n== the graph and a link ==');
{
  const facts = (status) => { const m = fakeMachine({ status }); const h = make(m); return { room: 'studio-1', gpu: true, camera: true, screens: () => h.screens() }; };
  const g = graphOf(facts('connected'));
  const n = g.nodes.find((x) => x.id === 'pi-1:hdmi0');
  const p = g.ports.find((x) => x.id === 'pi-1:hdmi0:video-in');
  ok('a connected screen is announced as pi-1:hdmi0, a device called HDMI screen', n?.kind === 'device' && n.label === 'HDMI screen', JSON.stringify(n));
  ok('with a video-in that travels by fbdev only', p?.dir === 'in' && p.medium === 'video' && p.transports.join() === 'fbdev');
  ok('and the board\'s test pattern beside it', !!g.ports.find((x) => x.id === 'pi-1:pattern:video-out'));
  const off = graphOf(facts('disconnected'));
  ok('NEGATIVE CONTROL: no screen, no hdmi0 and no pattern', !off.nodes.some((x) => /hdmi0|pattern/.test(x.id)));
  ok('NEGATIVE CONTROL: and the camera keeps its two wires and no fbdev', off.ports.find((x) => x.id === 'pi-1:camera:video-out').transports.join() === 'relay-h264,datachannel');
  const bay = createBay();
  for (const k of ['camera', 'pattern', 'hdmi0', 'shader']) addBoardNode(bay, g, k);
  const L = bay.link('pi-1:camera:video-out', 'pi-1:hdmi0:video-in', [], { via: 'fbdev' });
  ok('camera -> hdmi0 by fbdev is a link on one board', L.ok && L.session?.transport === 'fbdev' && L.session.where === 'machine', L.why);
  ok('pattern -> hdmi0 too', bay.link('pi-1:pattern:video-out', 'pi-1:hdmi0:video-in', [], { via: 'fbdev' }).ok);
  const shader = bay.link('pi-1:shader:video-out', 'pi-1:hdmi0:video-in', [], { via: 'fbdev' });
  ok('NEGATIVE CONTROL: the shader does not reach the screen, refused in words', !shader.ok && /only travels by/.test(shader.why), shader.why);
  const plain = createBay(); for (const k of ['camera', 'hdmi0']) addBoardNode(plain, g, k);
  ok('NEGATIVE CONTROL: without via fbdev the table offers page, and it is refused', !plain.link('pi-1:camera:video-out', 'pi-1:hdmi0:video-in').ok);
}

console.log('\n== the board\'s stop takes the picture down ==');
{
  const still = { stop: () => {}, running: () => false };
  const free = { release: () => {}, held: () => false };
  const base = { sequencer: still, keyboard: free, circuitDrums: free, jack: { held: () => [], unlink: () => ({ ok: true }) } };
  const m = fakeMachine();
  const h = make(m);
  await h.start('camera');
  const s = createStop({ ...base, displays: [{ name: 'hdmi', showing: () => h.showing(), stop: () => h.stop('stop all') }] });
  const silent = await s.stop({ level: 'silence' });
  ok('a silence leaves the picture up, and its row says so in green', h.showing() === 'camera' && s.check({ level: 'silence' }).rows.find((r) => r.key === 'hdmi')?.ok === true);
  ok('NEGATIVE CONTROL: before a full stop, the full check row is red', s.check().rows.find((r) => r.key === 'hdmi')?.ok === false && silent.ok);
  const full = await s.stop({ level: 'full' });
  const row = s.check().rows.find((r) => r.key === 'hdmi');
  ok('a full stop takes it down in the engines step and clears the screen',
    full.steps.find((x) => x.key === 'engines').did.down.includes('hdmi') && h.showing() === null && m.writes.at(-1)?.zero && row.ok === true, row.said);
  const h2 = make(fakeMachine()); await h2.start('pattern');
  const lazy = createStop({ ...base, displays: [{ name: 'hdmi', showing: () => h2.showing(), stop: () => {} }] });
  await lazy.stop({ level: 'full' });
  ok('NEGATIVE CONTROL: a stop that skips the screen leaves the check red', lazy.check().rows.find((r) => r.key === 'hdmi')?.ok === false);
  await h2.stop();
}

console.log(`\n${pass}/${pass + fail} ${fail ? 'RED' : 'green'}`);
process.exit(fail ? 1 : 0);
