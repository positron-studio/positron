// The Pi's camera as a slide's ground, in one of three modes a header button cycles:
// off, regular (the H.264 picture /remote/circuit/ shows) and dither (the OLED's one bit 128x64 frames, /devices/camera/'s).
// Nothing reaches the Pi on load: the key is checked on the first press, and pagehide stops whatever runs.
import { el } from './shell.mjs';
import { createButtonGroup } from './button-group.mjs';
import { RELAY_BASE, HTTP_BASE, randomId } from './wire.mjs';
import { createBoardVideo, WATCHING_MS } from './board-video.mjs';

const CSS = `
  /* the Pi's camera is the page's ground: one picture covering the viewport, dimmed under the words */
  .st-under { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; margin: 0; z-index: 10; display: block;
    background: #000; object-fit: cover; image-rendering: pixelated; filter: brightness(.35); transition: filter 1.2s; }
  .st-under.st-reg { image-rendering: auto; }
  .st-under[hidden] { display: none; }
  body.prl-open .st-under { filter: brightness(.12); }
  /* four buttons fill a phone's top row, so the overline takes its own row under them instead of being cut */
  @media (max-width: 480px) {
    body .prl { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto auto auto; grid-template-areas: "top" "eye" "head" "main" "foot"; }
    body .prl-eye { margin-top: var(--pr-m); }
  }
`;

const RENEW_MS = 5000;               // the board's lease is 15 s (screen-camera.mjs LEASE_MS)
// The arrows drop the query, so a key seen once in the address is kept in this browser.
const KEY_STORE = 'positron.present.cam';
const W = 128, H = 64;
const MODES = ['off', 'regular', 'dither'];
const FACE = {
  off: ['video-off', 'camera off, press for the Pi\'s camera'],
  regular: ['video', 'the Pi\'s camera, press for the dithered camera'],
  dither: ['grid', 'the dithered camera, press for camera off'],
};

/**
 * @param {{ room?: string, log: (line: string, kind?: string) => void, me?: string,
 *   page?: string, pageLabel?: string, relay?: string }} o  `page` is this page's node id in the patch;
 *   `relay` the camera room's, apart from a page's own relay box (createPatchbay's `cf-relay:<room>`)
 * @returns {{ el: HTMLElement, mode: () => string, nodes: object[], ports: object[], links: object[],
 *   flows: (id: string) => boolean | undefined, probe: () => object, frame: (bytes: ArrayLike<number>) => void }}
 */
export function createPresentCamera({ room = 'studio-1', log, me = `web-studio-${randomId(6)}`, page = 'web:studio', pageLabel = 'this page', relay = 'cf-relay:room' }) {
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
  const CAM_ROOM = `${room}-cam`;
  const ME = me;
  const q = new URLSearchParams(location.search);
  let CAM_KEY = q.get('cam') || '';
  try { if (CAM_KEY) localStorage.setItem(KEY_STORE, CAM_KEY); else CAM_KEY = localStorage.getItem(KEY_STORE) || ''; } catch { /* no storage */ }
  // the key leaves the address once kept, so it is not left in the bar, the history or a shared screen
  if (q.has('cam')) { const u = new URL(location.href); u.searchParams.delete('cam'); history.replaceState(null, '', u); }

  // ── the dither ground: one 1024 byte frame, page major as the SSD1306 takes it, white on black ──
  const cv = Object.assign(el('canvas', 'st-under pos-out'), { width: W, height: H, hidden: true });
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  let painted = 0;
  function paint(frame) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = (frame[(y >> 3) * W + x] >> (y & 7)) & 1 ? 255 : 0, i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    painted++;
  }
  const blank = () => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); };
  blank();
  // ── the regular ground: board-video.mjs decodes the H.264 frames into this canvas (WebCodecs) ──
  const reg = Object.assign(el('canvas', 'st-under st-reg pos-out'), { width: 1280, height: 720, hidden: true });
  document.body.append(cv, reg);

  // ── the mode: off, regular, dither; `gen` lets a slow key check notice it was switched away from ──
  let mode = 'off', gen = 0;
  const cam = createButtonGroup({ buttons: [{ id: 'cam', icon: 'video-off', label: FACE.off[1], onPress: () => cycle() }] });
  cam.button('cam').classList.add('pos-lg');
  function face() { cam.setIcon('cam', ...FACE[mode]); }
  function cycle() {
    if (!CAM_KEY) { log('This slide needs the camera key in its address, as ?cam=, so no camera is asked for', 'warn'); return; }
    setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  }
  // the previous mode is stopped before the next one asks the Pi for anything
  function setMode(next, quiet = false) {
    if (mode === 'dither') stopDither(!quiet);
    if (mode === 'regular') stopRegular(!quiet);
    mode = next; gen++;
    document.body.dataset.cam = mode;
    face();
    if (mode === 'dither') startDither(gen);
    else if (mode === 'regular') startRegular(gen);
    else if (!quiet) log('Camera off');
  }
  async function keyCheck(my) {
    let r = null;
    try { r = await fetch(`${HTTP_BASE}/room/${CAM_ROOM}/key`, { method: 'POST', body: CAM_KEY }); } catch { /* stays null */ }
    if (my !== gen) return false;
    if (r?.status === 204) return true;
    log(r?.status === 403 ? 'The relay refused the camera key' : 'The relay did not answer the key check', 'warn');
    setMode('off', true);
    return false;
  }
  const lost = (e) => { log(e?.code === 4003 ? 'The relay closed the camera room: it did not take the key' : `The camera room closed (${e?.code ?? '?'})`, 'warn'); setMode('off', true); };

  // ── dither: the keyed camera room as on /devices/camera/, `screen.camera {on}` every 5 s while visible ──
  let ws = null, keyed = false, beat = null, lastAt = 0, frames = 0;
  const say = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ ...m, from: ME })); };
  const renew = () => { if (keyed && !document.hidden) say({ type: 'screen.camera', on: true }); };
  async function startDither(my) {
    cv.hidden = false;
    if (!(await keyCheck(my))) return;
    const sock = ws = new WebSocket(`${RELAY_BASE}/room/${CAM_ROOM}/ws`);
    sock.onopen = () => sock.send(JSON.stringify({ type: 'cam.key', key: CAM_KEY, from: ME }));
    sock.onmessage = (e) => {
      if (ws !== sock || typeof e.data !== 'string') return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'cam.key.ok') { keyed = true; renew(); clearInterval(beat); beat = setInterval(renew, RENEW_MS); log(`Asking the Pi for its dithered camera in ${CAM_ROOM}`); }
      else if (m.type === 'screen.camera.started') log(`The Pi's dithered camera is on, ${m.source}, ${m.w}x${m.h} at ${m.fps} fps`, 'ok');
      else if (m.type === 'screen.camera.refused') log(`The Pi did not start the dithered camera: ${m.why}`, 'warn');
      else if (m.type === 'screen.camera.stopped') log(`The Pi's dithered camera stopped: ${m.why}`, 'warn');
      else if (m.type === 'screen.frame' && typeof m.b64 === 'string') {
        const bin = atob(m.b64);
        if (bin.length !== 1024) return;
        frames++; lastAt = performance.now();
        paint(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      }
    };
    sock.onclose = (e) => { if (ws === sock) lost(e); };
  }
  function stopDither(tell) {
    if (keyed) say({ type: 'screen.camera', on: false });
    clearInterval(beat); beat = null;
    const sock = ws; ws = null; keyed = false;
    try { sock?.close(); } catch { /* gone */ }
    blank(); cv.hidden = true;
    if (tell) log('The dithered camera is off');
  }

  // ── regular: the H.264 picture as on /remote/circuit/, `cam.watching` every 10 s, `cam.bye` on the way out ──
  let rkeyed = false, rbeat = null, rlastAt = 0;
  const video = createBoardVideo({
    canvas: reg,
    onSeq: () => { rlastAt = performance.now(); },
    onKey: () => log('A keyframe from the Pi camera arrived, the picture starts here', 'ok'),
    onLost: (n) => log(`The relay has dropped ${n} frame${n === 1 ? '' : 's'} of the camera picture`, 'warn'),
    onError: (line) => log(`Pi camera: ${line}`, 'bad'),
    onText: (m) => {
      if (m.type === 'cam.key.ok') { rkeyed = true; watching(); clearInterval(rbeat); rbeat = setInterval(watching, WATCHING_MS); log(`Asking the Pi for its camera in ${CAM_ROOM}`); }
      else if (m.type === 'cam.started') log(`The Pi camera is up, ${m.camera}, ${m.w}x${m.h} at ${m.fps} fps`, 'ok');
      else if (m.type === 'cam.refused') log(`The Pi did not start its camera: ${m.why}`, 'warn');
      else if (m.type === 'cam.stopped') log(`The Pi camera stopped: ${m.why}`, 'warn');
    },
    onClose: (e) => { if (mode === 'regular' && video.isOpen()) lost(e); },
  });
  function watching() { if (rkeyed && !document.hidden) video.say({ type: 'cam.watching', from: ME }); }
  async function startRegular(my) {
    if (!(await keyCheck(my))) return;
    const o = video.open(CAM_ROOM, { codec: 'avc1.42E01F', fps: 30 }, { hello: { type: 'cam.key', key: CAM_KEY, from: ME } });
    if (!o.ok) { log(o.reason, 'warn'); setMode('off', true); return; }
    reg.hidden = false;
  }
  function stopRegular(tell) {
    clearInterval(rbeat); rbeat = null;
    if (rkeyed) video.say({ type: 'cam.bye', from: ME });
    rkeyed = false;
    // the bye has to leave before the socket does
    setTimeout(() => { if (mode !== 'regular') video.close(); }, 50);
    reg.getContext('2d').clearRect(0, 0, reg.width, reg.height); reg.hidden = true;
    if (tell) log('The camera is off');
  }

  addEventListener('visibilitychange', () => { renew(); watching(); });
  addEventListener('pagehide', () => { if (mode !== 'off') setMode('off', true); });

  // ── the patch as the code runs it: two paths from the Pi's camera through the keyed room to `page` ──
  const port = (node, name, dir) => ({ id: `${node}:${name}-${dir}`, dir, medium: 'video' });
  const nodes = [{ id: 'pi-1:camera', kind: 'device', label: 'USB camera' },
    { id: 'pi-1:h264', kind: 'engine', label: 'H.264 1280x720' }, { id: 'pi-1:dither', kind: 'engine', label: 'one bit 128x64' },
    { id: 'pi-1:screen', kind: 'device', label: 'OLED 128x64' }, { id: relay, kind: 'endpoint', label: CAM_ROOM },
    { id: page, kind: 'screen', label: pageLabel }];
  const ports = [port('pi-1:camera', 'video', 'out'), port('pi-1:h264', 'video', 'in'), port('pi-1:h264', 'video', 'out'),
    port('pi-1:dither', 'video', 'in'), port('pi-1:dither', 'video', 'out'), port('pi-1:screen', 'video', 'in'),
    port(relay, 'h264', 'in'), port(relay, 'h264', 'out'), port(relay, 'frames', 'in'), port(relay, 'frames', 'out'),
    port(page, 'h264', 'in'), port(page, 'frames', 'in')];
  const links = [
    { id: 'r1', from: 'pi-1:camera:video-out', to: 'pi-1:h264:video-in' }, { id: 'r2', from: 'pi-1:h264:video-out', to: `${relay}:h264-in` },
    { id: 'r3', from: `${relay}:h264-out`, to: `${page}:h264-in` },
    { id: 'd1', from: 'pi-1:camera:video-out', to: 'pi-1:dither:video-in' }, { id: 'd2', from: 'pi-1:dither:video-out', to: 'pi-1:screen:video-in' },
    { id: 'd3', from: 'pi-1:dither:video-out', to: `${relay}:frames-in` }, { id: 'd4', from: `${relay}:frames-out`, to: `${page}:frames-in` }];
  const ids = new Set(links.map((l) => l.id));
  /** Whether a camera link carries frames now; undefined for a link that is not the camera's. */
  const flows = (id) => {
    if (!ids.has(id)) return undefined;
    const now = performance.now();
    return id[0] === 'r' ? mode === 'regular' && now - rlastAt < 500 : mode === 'dither' && now - lastAt < 500;
  };

  return {
    el: cam.el, room: CAM_ROOM, mode: () => mode, nodes, ports, links, flows,
    probe: () => ({ mode, keyed, rkeyed, frames, painted, decoded: video.decoded(), key: !!CAM_KEY, ws: !!ws, video: video.isOpen() }),
    // a test hook: paints a 1024 byte frame as if it came from the Pi, opening nothing
    frame: (bytes) => { cv.hidden = false; paint(Uint8Array.from(bytes)); },
  };
}
