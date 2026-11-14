
/**
 * One highlight for `the ray is on this`, shared by scene's things and every XR panel.
 * Size as well as brightness: in a headset brightness alone reads as a pale panel.
 * Never a colour change: colour here says how something landed.
 * why: lessons/kit-xr-panel.md#touch
 */
export const TOUCH = {
  none:  { lit: 1.00, scale: 1.000 },
  aimed: { lit: 1.35, scale: 1.035 },
  held:  { lit: 1.80, scale: 1.075 },
};
export const touchOf = (isHeld, isAimed) => (isHeld ? TOUCH.held : isAimed ? TOUCH.aimed : TOUCH.none);

// demo/shell/xr-panel.mjs: panel.mjs canvases hung in a headset, with the frame rate measured.
// The one XR session entry path: baseLayer is read inside the frame callback, `alpha: true`,
// first view clears colour, attribs bound before link, and a way out comes with the session.
// why: lessons/kit-xr-panel.md#header

import { createXRRoom, roomOf, ROOM_OPTIONAL_FEATURES, GRID, mul } from './xr-room.mjs';
import { createXRHands, BUTTON, AXIS } from './xr-hands.mjs';
import { mountXRQuit } from './xr-quit.mjs';
import { createXRTablet } from './xr-tablet.mjs';
// xr-pick.mjs is the one ray-to-rectangle answer; a second copy would be two truths about one pointer.
// why: lessons/kit-xr-panel.md#pick-quad
import { pickQuad } from './xr-pick.mjs';

const REPORT = new URLSearchParams(location.search).get('report');

/**
 * A line that must arrive even if the event loop is about to be throttled.
 * Only from a browser about to enter a session; `?report=0` turns it off anywhere.
 * why: lessons/kit-xr-panel.md#beacon
 */
export function beacon(line) {
  if (REPORT === '0') return;
  try {
    navigator.sendBeacon?.('https://pub.positron.studio/log',
      new Blob([`${(performance.now() / 1000).toFixed(2)} ${line}`], { type: 'text/plain' }));
  } catch { /* diagnostics are never load-bearing */ }
}

// Taken once at load: `requestSession` needs transient activation and an await can spend it.
// `null` means not looked yet, a third answer and not a polite false.
// why: lessons/kit-xr-panel.md#supported
let supported = null;
navigator.xr?.isSessionSupported?.('immersive-vr').then(
  (v) => { supported = v; }, () => { supported = false; });
if (!navigator.xr?.isSessionSupported) supported = false;
// Passthrough is probed separately; VR support says nothing about AR. `null` is not `no`.
// why: lessons/kit-xr-panel.md#supported-ar
let supportedAr = null;
navigator.xr?.isSessionSupported?.('immersive-ar').then(
  (v) => { supportedAr = v; }, () => { supportedAr = false; });
if (!navigator.xr?.isSessionSupported) supportedAr = false;

/** true, false, or null while the browser has not answered yet. */
export const headsetSupported = () => supported;

const PANEL_VS = `#version 300 es
  in vec3 aPos;
  uniform mat4 uProj, uView, uModel; out vec2 vUv;
  void main(){ vUv = vec2(aPos.x + 0.5, 0.5 - aPos.y);
    gl_Position = uProj * uView * uModel * vec4(aPos, 1.0); }`;
// Two samplers: a live render cannot carry text, so the footer of numbers is a second canvas
// sampled below `uFoot`. `uFoot` is 0 when the canvas already has its footer drawn in.
// why: lessons/kit-xr-panel.md#panel-fs
const PANEL_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTex; uniform sampler2D uFootTex;
  uniform float uFoot; uniform float uRound; uniform float uAspect;
  out vec4 o;
  void main(){
    // 🔴 ROUNDED ONLY WHERE THE PICTURE IS NOT ROUNDED ALREADY. panel.mjs
    // clips its canvas to a radius, and two roundings over one another show a
    // seam at every corner — xr-room.mjs pays for that rule with its tablet. A
    // framebuffer has no corners, so a LIVE panel gets its radius here and an
    // uploaded one passes a radius of zero and is left alone.
    // ⚠️ DISCARD, NOT AN ALPHA OF ZERO. Blending is off for panels, so a
    // transparent fragment would still WRITE — black in an opaque session, and
    // a hole punched in whatever the room had put there. Discarding leaves the
    // background exactly as the room drew it, which in passthrough is your room.
    if (uRound > 0.0) {
      vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
      vec2 q = abs(p) - vec2(0.5 * uAspect - uRound, 0.5 - uRound);
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRound;
      if (d > 0.0) discard;
    }
    if (uFoot > 0.0 && vUv.y > 1.0 - uFoot) {
      o = texture(uFootTex, vec2(vUv.x, (vUv.y - (1.0 - uFoot)) / uFoot));
    } else {
      float k = uFoot > 0.0 ? 1.0 / (1.0 - uFoot) : 1.0;
      o = texture(uTex, vec2(vUv.x, vUv.y * k));
    } }`;

/**
 * The grab bar is the handle so the picture stays a surface, and the right ray already drives
 * the tablet slider. Drawn as a signed-distance capsule, exact at any distance.
 * why: lessons/kit-xr-panel.md#bar-fs
 */
const BAR_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; uniform vec3 uCol; uniform float uAlpha; uniform float uAspect;
  out vec4 o;
  void main(){
    // A capsule: the distance to a horizontal segment, radius half the bar's
    // height. Exact, so the ends are round at any size and any distance.
    vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
    float ax = max(abs(p.x) - (0.5 * uAspect - 0.5), 0.0);
    float d = length(vec2(ax, p.y)) - 0.5;
    float w = fwidth(d);
    float a = 1.0 - smoothstep(-w, w, d);
    if (a <= 0.004) discard;
    o = vec4(uCol, a * uAlpha); }`;

/**
 * Where a panel hangs: `dist` metres ahead of the start gaze, at eye height, facing you.
 * Placed once in the room, never head-locked, so it can be looked away from.
 * why: lessons/kit-xr-panel.md#place-facing
 */
function placeFacing(headMat, headPos, wM, hM, dist, yaw) {
  // -Z of the head's own frame is forward. Flattened onto the floor plane, so a
  // panel does not end up over your head because you entered looking up.
  let fx = -headMat[8], fz = -headMat[10];
  const l = Math.hypot(fx, fz);
  if (l < 1e-4) { fx = 0; fz = -1; } else { fx /= l; fz /= l; }
  if (yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const nx = fx * c - fz * s, nz = fx * s + fz * c;
    fx = nx; fz = nz;
  }
  return facing([headPos.x + fx * dist, headPos.y, headPos.z + fz * dist], headPos, wM, hM);
}

/**
 * Turns a quad at centre `c` to face the head on both axes, as a rotation and never a skew,
 * so `pickQuad` reads the drawn shape. Roll pinned to world up; aimed at the head, not the hand.
 * why: lessons/kit-xr-panel.md#facing
 */
export function facing(c, headPos, wM, hM) {
  // The panel's own +Z: from its centre back to the head, which is the
  // direction the quad's face has to point.
  let nx = headPos.x - c[0], ny = headPos.y - c[1], nz = headPos.z - c[2];
  let l = Math.hypot(nx, ny, nz);
  if (l < 1e-4) { nx = 0; ny = 0; nz = 1; l = 1; }
  nx /= l; ny /= l; nz /= l;
  // right = worldUp x normal. Degenerate only when the head is directly above
  // or below the centre, where there is no horizon to line up with and any
  // perpendicular will do for the frame it lasts.
  let rx = nz, ry = 0, rz = -nx;
  const rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-4) { rx = 1; ry = 0; rz = 0; } else { rx /= rl; ry /= rl; rz /= rl; }
  // up = normal x right, which is a unit vector because the two are orthonormal
  const ux = ny * rz - nz * ry;
  const uy = nz * rx - nx * rz;
  const uz = nx * ry - ny * rx;
  return new Float32Array([
    rx * wM, ry * wM, rz * wM, 0,
    ux * hM, uy * hM, uz * hM, 0,
    nx, ny, nz, 0,
    c[0], c[1], c[2], 1,
  ]);
}

/**
 * The grab bar's quad under a panel, in the panel's plane, with the columns `pickQuad` reads.
 * why: lessons/kit-xr-panel.md#bar-of
 */
export function barOf(M, hM, barW, barH, gap) {
  // Column 0 is right*width and column 1 is up*height, so unit right is
  // column 0 over the panel's width — and the width is the length of it.
  const w = Math.hypot(M[0], M[1], M[2]) || 1;
  const rx = M[0] / w, ry = M[1] / w, rz = M[2] / w;
  // The panel's own up (column 1), not world up, so the bar stays in the plane when a panel pitches.
  // why: lessons/kit-xr-panel.md#bar-of-up
  const h = Math.hypot(M[4], M[5], M[6]) || 1;
  const ux = M[4] / h, uy = M[5] / h, uz = M[6] / h;
  const drop = hM / 2 + gap + barH / 2;
  return new Float32Array([
    rx * barW, ry * barW, rz * barW, 0,
    ux * barH, uy * barH, uz * barH, 0,
    M[8], M[9], M[10], 0,
    M[12] - ux * drop, M[13] - uy * drop, M[14] - uz * drop, 1,
  ]);
}

/**
 * How a panel is picked up, in metres. The centre is clamped so a panel can never be pushed
 * out of reach, out of focus, into the floor or far above your head.
 * why: lessons/kit-xr-panel.md#place
 */
export const PLACE = {
  near: 0.55, far: 6.0,
  lowest: 0.45,            // the CENTRE's lowest y above the floor
  highest: 3.0,
  // Bar: 0.14 of the width, 16 mm tall, 30 mm clear (179 mm x 16 mm on a 1.28 m panel).
  // A handle should be findable and unremarkable.
  // why: lessons/kit-xr-panel.md#place-bar
  barH: 0.016,             // the grab bar's height
  barGap: 0.030,           // air between the panel's lower edge and the bar
  barShare: 0.14,          // how much of the panel's width the bar spans
  pushPerSec: 1.6,         // metres a second, on a fully pushed thumbstick
  stickDead: 0.25,         // below this the stick is at rest
};

/**
 * Where a panel's centre sits in the controller's axes at the grab, so it stays where the ray hit
 * rather than snapping to the pointer. The pose rotation is orthonormal: inverse is transpose.
 * @param {Float32Array} M the panel's model matrix; m the target-ray pose; o the ray's origin
 * why: lessons/kit-xr-panel.md#grab-offset
 */
export function grabOffset(M, m, o) {
  const dx = M[12] - o.x, dy = M[13] - o.y, dz = M[14] - o.z;
  return [
    dx * m[0] + dy * m[1] + dz * m[2],
    dx * m[4] + dy * m[5] + dz * m[6],
    dx * m[8] + dy * m[9] + dz * m[10],
  ];
}

/**
 * Where a held panel's centre goes this frame, bounded by `PLACE` measured from your head.
 * Exported so a laptop can grade the drag; the session calls this function, not a copy.
 * why: lessons/kit-xr-panel.md#held-at
 */
export function heldAt(m, o, L, hp, floorY = 0) {
  let cx = o.x + m[0] * L[0] + m[4] * L[1] + m[8] * L[2];
  let cy = o.y + m[1] * L[0] + m[5] * L[1] + m[9] * L[2];
  let cz = o.z + m[2] * L[0] + m[6] * L[1] + m[10] * L[2];
  const vx = cx - hp.x, vz = cz - hp.z;
  const flat = Math.hypot(vx, vz);
  if (flat > 1e-4) {
    const want = Math.max(PLACE.near, Math.min(PLACE.far, flat));
    cx = hp.x + vx / flat * want; cz = hp.z + vz / flat * want;
  }
  cy = Math.max(floorY + PLACE.lowest, Math.min(floorY + PLACE.highest, cy));
  return [cx, cy, cz];
}

/**
 * @param {object} o
 * @param {Array<object>} o.panels  each panel's picture and its size in metres: `{ canvas }`
 *        uploaded every frame, or `{ live }` drawn into this session's context with an optional
 *        `{ foot }` canvas of numbers under it. `setLive()` decides which is on the quad.
 * @param {(ctx:{frame:XRFrame, pose:XRViewerPose, session:XRSession}) => void} [o.onFrame]
 *        called once per animation frame, before the upload, never per eye.
 * @param {() => void} [o.onEnd]
 * @param {(msg:string, kind?:string) => void} [o.log]
 * @param {number} [o.dist]  metres in front of you
 * @param {boolean|{seed?:number, sky?:boolean, things?:boolean, bg?:number[]}} [o.room]
 *        hang the panels inside xr-room.mjs's room; `true` takes the default seed.
 * @param {() => ({col:number[], amp:number}|null)} [o.glow]  the fake light on the floor
 * @param {boolean} [o.live]  start with the live renderers on the quads
 * @returns {object}
 * why: lessons/kit-xr-panel.md#create-xr-panels
 */
export function createXRPanels({
  panels = [], onFrame = null, onEnd = null, log = () => {},
  dist = 1.6, clear = [0.02, 0.03, 0.045, 1], deadManMs = 4000, room = null,
  glow = null, live = true, fan = 0.7,
  /**
   * `{ attach(gl), draw({ proj, view, eye, tSec, bg }), detach?() }`: a page's ground, drawn per eye
   * after the room and before the panels, so no page needs a session path of its own.
   * `bg` is the clear colour, so a fade fades into it. It may fail without costing the session.
   * why: lessons/kit-xr-panel.md#surface
   */
  surface = null,
  /**
   * The layer's framebufferScaleFactor, a number or a function read at entry; null asks for none.
   * `setScale()` swaps the layer mid-session. A render scale control for a benchmark (/kit/points/).
   */
  scale = null,
} = {}) {
  // What `surface` started as, and what is left of it. A surface that threw is
  // set to null here and SAID SO in `state`, because a page whose floor quietly
  // did not draw looks exactly like a page whose floor drew black.
  let theSurface = surface;
  let gl = null, prog = null, quad = null, U = null;
  let barProg = null, barU = null;
  let session = null, space = null, arMode = false;
  // The way out is any button held, with a head-locked ring; xr-quit.mjs advances the hold.
  // why: lessons/kit-xr-panel.md#the-quit
  let theQuit = null;

  /**
   * Built on first draw, so a laptop compiles the badge; must never throw into the caller.
   * Called without a session to compile, then with the session for the exit that drives itself.
   * why: lessons/kit-xr-panel.md#ensure-quit
   */
  function ensureQuit(forSession = null) {
    if (quitFailed || !gl) return theQuit;
    // The one we have is right unless we now have a session and it is not on
    // one. `driven` also goes false when a session ends, so re-entering builds
    // a fresh mount rather than keeping a badge tied to a session that is gone.
    if (theQuit && (!forSession || theQuit.driven)) return theQuit;
    try {
      theQuit?.dispose();
      theQuit = mountXRQuit(gl, forSession, {
        // The hold's arming guard lives in xr-quit.mjs for every page, and the module ends the session.
        // why: lessons/kit-xr-panel.md#ensure-quit-armed
        onQuit: () => beacon('held a controller button, leaving'),
        log,
        say: beacon,
      });
      // Compiled here, not on first draw: a lazy object proves nothing about its shader.
      // why: lessons/kit-xr-panel.md#ensure-quit-prepare
      quitReady = theQuit.prepare();
      if (!quitReady) beacon(`FAIL quit badge would not compile: ${theQuit.why}`);
    } catch (e) {
      quitFailed = true;
      beacon(`FAIL quit badge would not build: ${e.message}`);
    }
    return theQuit;
  }
  let quitFailed = false, quitReady = false;
  let placed = null, armed = false, armAt = 0;
  // Whether the live renderers are on the quads; only true where a panel has one.
  // why: lessons/kit-xr-panel.md#live-on
  let liveOn = !!live && panels.some((p) => p.live);

  // ── the room the panels hang in ──
  // The same room `scene` rolls. The document is built at load; the GL context only on entry.
  // why: lessons/kit-xr-panel.md#room
  const roomSeed = (room && typeof room === 'object' && Number.isFinite(room.seed)) ? room.seed >>> 0 : 424242;
  const roomOpt = (room && typeof room === 'object') ? room : {};
  const wantSky = roomOpt.sky !== false;
  const wantThings = roomOpt.things !== false;
  /**
   * `grid: false` hides the dotted floor and keeps the room, for a page that draws its own ground.
   * why: lessons/kit-xr-panel.md#want-grid
   */
  const wantGrid = roomOpt.grid !== false;
  // `hands: true` draws the controller models; off by default. Input and poses arrive either way.
  // why: lessons/kit-xr-panel.md#want-hands
  const wantHands = roomOpt.hands === true;
  // `tablet: true` hangs the slab on the left hand; off by default and never in passthrough.
  // The test is `arMode` from the blend mode, not the session name.
  // why: lessons/kit-xr-panel.md#want-tablet
  const wantTablet = roomOpt.tablet === true;
  const roomBg = Array.isArray(roomOpt.bg) ? roomOpt.bg : null;
  const roomDoc = room ? roomOf(roomSeed) : null;
  // The document is still rolled from the seed when nothing is drawn: `hue` comes out of it.
  // why: lessons/kit-xr-panel.md#drawn-doc
  const drawnDoc = room ? (wantThings ? roomDoc : { ...roomDoc, things: [] }) : null;
  const theRoom = room ? createXRRoom(null, { log, say: beacon }) : null;
  // The dots go to nothing when the page draws its own ground. See `wantGrid`.
  if (theRoom && !wantGrid) theRoom.setGrid({ alpha: 0 });

  // ── the controllers, the pointer and the tablet ──
  // The same modules `scene` uses, built only where there is a room.
  // why: lessons/kit-xr-panel.md#controllers
  const theTablet = theRoom ? createXRTablet({ ctx: { room: theRoom } }) : null;
  // The room gets the tablet even when hidden: `applyAll()` sets the floor dots' strength.
  // why: lessons/kit-xr-panel.md#set-tablet
  if (theTablet) { theRoom.setTablet(theTablet); theTablet.applyAll(); }
  const theHands = theRoom
    ? createXRHands({
      tablet: theTablet,
      // The same answer the room is given below: the page asked for it, and
      // this is not a passthrough session. A slab nobody can see must not eat
      // the trigger — see `tabletShown` in xr-hands.mjs.
      tabletShown: () => wantTablet && !arMode,
      log,
      say: beacon,
    }) : null;

  // `getError` returns the first error since the last call, so this checks after each phase and
  // keeps the first dirty one. Setup and first frame only: it is a synchronous stall.
  // why: lessons/kit-xr-panel.md#gl-check
  const glErrors = [];
  function glCheck(phase) {
    if (!gl) return;
    const e = gl.getError();
    if (e && glErrors.length < 8) glErrors.push(`${phase}:${e}`);
    return e;
  }

  const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);

  /**
   * Time one pass on the card. Nothing here may throw inside a frame callback.
   * why: lessons/kit-xr-panel.md#gpu-begin
   */
  function gpuBegin(what) {
    if (!gpuTimerExt || gpuQ) return false;
    try {
      gpuQ = gl.createQuery(); gpuQFor = what;
      gl.beginQuery(gpuTimerExt.TIME_ELAPSED_EXT, gpuQ);
      return true;
    } catch { gpuQ = null; gpuQFor = null; return false; }
  }
  function gpuEnd() {
    if (!gpuQ) return;
    try { gl.endQuery(gpuTimerExt.TIME_ELAPSED_EXT); } catch { /* nothing to end */ }
  }
  function gpuPoll() {
    if (!gpuQ) return;
    try {
      if (!gl.getQueryParameter(gpuQ, gl.QUERY_RESULT_AVAILABLE)) return;
      // A disjoint result is meaningless, not slow, so it is dropped rather than averaged in.
      // why: lessons/kit-xr-panel.md#gpu-disjoint
      const bad = gl.getParameter(gpuTimerExt.GPU_DISJOINT_EXT);
      const ns = bad ? null : gl.getQueryParameter(gpuQ, gl.QUERY_RESULT);
      if (ns != null) {
        const arr = gpuQFor === 'half' ? gpuHalf : gpuFull;
        arr.push(ns / 1e6);
        if (arr.length > 32) arr.shift();
        if (gpuQFor !== 'half') state.liveGpuMs = median(gpuFull);
        else state.liveHalfGpuMs = median(gpuHalf);
      }
      gl.deleteQuery(gpuQ);
    } catch { /* the query is the diagnostic, never the product */ }
    gpuQ = null; gpuQFor = null;
  }

  /**
   * Where the cost lands, from two measurements: half the pixels at about half the time is
   * fragment-bound; at about the same time the cost is per draw.
   * why: lessons/kit-xr-panel.md#verdict-on-cost
   */
  function verdictOnCost() {
    if (state.liveGpuMs == null) { state.liveWhereCost = state.gpuTimer; return; }
    const mp = state.livePixels ? (state.livePixels.w * state.livePixels.h) / 1e6 : null;
    const rate = mp && state.liveGpuMs > 0 ? (mp / (state.liveGpuMs / 1000)) : null;
    const head = `${state.liveGpuMs.toFixed(3)} ms on the card`
      + (mp ? ` for ${mp.toFixed(2)} Mpix` : '')
      + (rate ? ` · ${rate.toFixed(0)} Mpix/s` : '');
    if (state.liveHalfGpuMs == null) { state.liveWhereCost = `${head} · half-size not measured yet`; return; }
    const k = state.liveHalfGpuMs / state.liveGpuMs;
    // The sample count is printed: three runs of one preview gave 0.69, 0.84 and 0.86.
    // why: lessons/kit-xr-panel.md#verdict-n
    const n = ` (n=${gpuFull.length}/${gpuHalf.length})`;
    // When the timer's own samples disagree (0.24x to 0.82x on one laptop), the verdict is
    // that this device cannot answer.
    // why: lessons/kit-xr-panel.md#verdict-spread
    const spread = (a) => (a.length >= 3 ? Math.max(...a) / Math.max(1e-9, Math.min(...a)) : Infinity);
    const sf = spread(gpuFull), sh = spread(gpuHalf);
    if (!(sf < 2.5 && sh < 2.5)) {
      state.liveWhereCost = `${head} · where that time goes cannot be said here${n}:`
        + ` the card's own clock disagrees with itself by ${Number.isFinite(sf) ? `${sf.toFixed(1)}x` : '—'}`
        + ` across full-size samples and ${Number.isFinite(sh) ? `${sh.toFixed(1)}x` : '—'} across quarter-size ones`;
      return;
    }
    // Half in each direction is a QUARTER of the pixels, so pure fragment cost
    // predicts 0.25 and a pass whose cost is all in issuing it predicts 1.
    state.liveWhereCost = `${head} · a quarter of the pixels costs ${k.toFixed(2)}x${n}, so it is `
      + (k < 0.45 ? 'FRAGMENT-bound: resolution is the lever'
        : k > 0.80 ? 'NOT fragment-bound: the pass costs what it costs whatever size it is, so resolution will not help'
        : 'partly fragment-bound: resolution helps, but not in proportion');
  }
  /**
   * What the trigger has hold of. `local` is the ray-origin-to-centre vector in the ray's axes
   * at the grab, so the centre returns to `origin + R_now . local` and nothing jumps.
   * why: lessons/kit-xr-panel.md#grabbing
   */
  let grabbing = null;            // { i, local:[x,y,z], src }
  let grabDist = 0;               // for the beam's length, and the readout
  let aimedBar = null;            // { i, t } — which grab bar the ray is on
  let tick = 0, tickAt = 0, lastFrame = 0;
  const tex = new Map();                      // canvas -> WebGLTexture
  const uploads = [];                         // CPU ms per frame, for a median
  const liveMs = [];                          // CPU ms per frame for the live pass
  // ── the card's own stopwatch ──
  // One TIME_ELAPSED query in flight at a time: a busy slot skips a sample, never stalls.
  // why: lessons/kit-xr-panel.md#stopwatch
  let gpuTimerExt = null, gpuQ = null, gpuQFor = null;
  const gpuFull = [], gpuHalf = [];
  let probeFrames = 0;
  let stickWasDown = false;

  /**
   * Swap the panels between the live renderers and the uploaded canvases, beaconed every time.
   * why: lessons/kit-xr-panel.md#set-live
   */
  function setLive(v, why = 'the page') {
    const next = !!v && panels.some((p) => p.live);
    if (next === liveOn) return liveOn;
    liveOn = next;
    liveMs.length = 0; gpuFull.length = 0; state.liveGpuMs = null; state.liveWorstMs = 0;
    uploads.length = 0; state.uploadWorstMs = 0;
    beacon(`${why} · the picture is now ${liveOn
      ? 'RENDERED LIVE by this session, in its own context'
      : 'UPLOADED from a 2-D canvas, the way it was'}`
      + ` · last second ${state.fps == null ? 'no rate yet' : `${state.fps.toFixed(1)} fps`}`);
    log(liveOn
      ? 'the headset is drawing that picture itself now'
      : 'the picture is being copied in from this page again');
    return liveOn;
  }

  /**
   * Everything a harness can read. `frames` and `fps` are counted by this page and printed beside,
   * never averaged with, what the compositor says.
   * why: lessons/kit-xr-panel.md#state
   */
  const state = {
    presenting: false,
    mode: 'window',
    frames: 0,                 // drawn inside the session
    fps: null,                 // measured inside the session
    worstGapMs: null,
    fb: null,                  // { w, h } — the headset's own framebuffer
    eye: null,                 // { w, h } — one eye's viewport in it
    views: null,
    blendMode: null,
    glError: null,
    // What the headset promises. A Quest 3 reports no `frameRate`, so the list is published too.
    // why: lessons/kit-xr-panel.md#state-frame-rate
    frameRate: null,
    supportedFrameRates: null,
    // The page's floor. `null` means none was offered, which is not one that refused.
    // why: lessons/kit-xr-panel.md#state-surface
    surface: surface ? { attached: false, why: 'not built yet', draws: 0 } : null,
    // CPU time: `drawCpuMs` draws the picture, `uploadCpuMs` is `texImage2D` on the processor.
    // The card's own copy time is not visible from here; `fps` is the evidence.
    // why: lessons/kit-xr-panel.md#state-cpu
    drawCpuMs: null,
    uploadCpuMs: null,
    uploadWorstMs: null,
    panelPixels: null,         // the texture actually being uploaded
    // ── what the live renderers cost ──
    // `liveCpuMs` issues the pass, `liveGpuMs` is the card's time (null where unmeasurable),
    // `liveHalfGpuMs` the same pass at half the pixels: half means fragment-bound.
    // why: lessons/kit-xr-panel.md#state-live
    live: null,                // is the live path on the quads right now
    livePixels: null,          // { w, h } of the texture it renders
    liveCpuMs: null,
    liveWorstMs: null,
    liveGpuMs: null,
    liveHalfGpuMs: null,
    liveWhereCost: 'not measured yet',
    gpuTimer: null,            // the extension's name, or why there is none
    // The colour and strength handed to the glow shader this frame.
    // why: lessons/kit-xr-panel.md#state-glow
    glow: null,
    // Where the panels are, in metres, so a run can say the drag moved something.
    // why: lessons/kit-xr-panel.md#state-grabbed
    grabbed: 0,                // completed press → move → release cycles
    grabMovedM: null,          // how far the last one moved a panel
    // Where the panel hangs and where the floor came from. `surfaces` is one of six words
    // (see `planes` in xr-room.mjs), because the findings differ and a boolean would merge them.
    // why: lessons/kit-xr-panel.md#state-room
    room: room
      ? { on: true, seed: roomSeed,
          // What the seed made and what was drawn, so `things > 0` cannot pass vacuously.
          // why: lessons/kit-xr-panel.md#state-made
          made: roomDoc.things.length,
          things: drawnDoc.things.length,
          // Three facts as a list, since it reaches a visitor's log box.
          // why: lessons/kit-xr-panel.md#state-scenery
          scenery: `${wantSky ? 'walls' : 'no walls'}, ${wantThings ? 'objects' : 'no objects'} and a dotted floor`,
          // The floor's own numbers, so the one property that has broken here
          // before — dots still at strength where the quad stops — is gradeable
          // from a laptop.
          dots: { span: GRID.span, cell: GRID.cell, fadeNear: GRID.fadeNear, fadeFar: GRID.fadeFar },
          surfaces: 'not asked', floor: 'the page', note: '' }
      : { on: false, seed: null, made: 0, things: 0, scenery: 'no room', dots: null,
          surfaces: 'no room', floor: 'nothing', note: 'this page hangs its panels in an empty session' },
    // The controller interface's fingerprint, the same string `scene` publishes.
    // why: lessons/kit-xr-panel.md#state-ui
    ui: theHands ? theHands.fingerprint() : 'no controller interface built',
  };
  if (theRoom) {
    // A getter each, because the room writes its own verdict in place as the
    // frames go by and a field copied once would answer about page load.
    Object.defineProperty(state.room, 'surfaces', { get: () => theRoom.planes.state, enumerable: true });
    Object.defineProperty(state.room, 'floor', { get: () => theRoom.planes.from, enumerable: true });
    Object.defineProperty(state.room, 'note', { get: () => theRoom.planes.note, enumerable: true });
    Object.defineProperty(state.room, 'grid', { get: () => theRoom.hasGrid, enumerable: true });
  }
  // A getter, not a copy: the probe resolves after this object is built.
  // why: lessons/kit-xr-panel.md#state-supported
  Object.defineProperty(state, 'supported', { get: () => supported, enumerable: true });
  Object.defineProperty(state, 'supportedAr', { get: () => supportedAr, enumerable: true });
  Object.defineProperty(state, 'live', { get: () => liveOn, enumerable: true });
  // The way out, on the machine surface, so a run can assert it. A getter: built at session start.
  // why: lessons/kit-xr-panel.md#state-quit
  Object.defineProperty(state, 'quit', {
    enumerable: true,
    get: () => (theQuit && quitReady
      // `button` is `'any'`; `holdMs` is the only thing between a resting thumb and leaving.
      // `driven` and `frames` say a session is advancing the hold, not only that it exists.
      // why: lessons/kit-xr-panel.md#state-quit-fields
      ? { built: true, button: theQuit.button, holdMs: theQuit.holdMs,
          label: theQuit.label, pressed: theQuit.pressed,
          driven: theQuit.driven, frames: theQuit.frames, armed: theQuit.armed,
          holding: theQuit.holding, progress: theQuit.progress }
      : { built: false, button: null, holdMs: null, label: null, pressed: null,
          driven: false, frames: 0, armed: false,
          holding: false, progress: 0,
          why: theQuit?.why || (quitFailed ? 'it threw on construction' : 'never built') }),
  });
  if (panels[0]?.canvas) state.panelPixels = { w: panels[0].canvas.width, h: panels[0].canvas.height };
  const liveOne = panels.find((p) => p.live);
  if (liveOne?.live?.pixels) state.livePixels = { ...liveOne.live.pixels };

  /** Compile, with the attribute slot bound BEFORE the link — see defect 4. */
  function build() {
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;             // never presented; the layer owns the pixels
    // `alpha: true`, always. See the header.
    // why: lessons/kit-xr-panel.md#alpha-true
    gl = cv.getContext('webgl2', { alpha: true, antialias: true, xrCompatible: true });
    if (!gl) return false;
    const sh = (t, src) => {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, PANEL_VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, PANEL_FS));
    gl.bindAttribLocation(prog, 0, 'aPos');    // BEFORE linkProgram, never after
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    U = { proj: gl.getUniformLocation(prog, 'uProj'), view: gl.getUniformLocation(prog, 'uView'),
          model: gl.getUniformLocation(prog, 'uModel'), tex: gl.getUniformLocation(prog, 'uTex'),
          footTex: gl.getUniformLocation(prog, 'uFootTex'), foot: gl.getUniformLocation(prog, 'uFoot'),
          round: gl.getUniformLocation(prog, 'uRound'), aspect: gl.getUniformLocation(prog, 'uAspect') };
    glCheck('program');
    // The grab bar's own program, allowed to fail alone: it costs the handle, never the picture.
    // why: lessons/kit-xr-panel.md#bar-prog
    try {
      barProg = gl.createProgram();
      gl.attachShader(barProg, sh(gl.VERTEX_SHADER, PANEL_VS));
      gl.attachShader(barProg, sh(gl.FRAGMENT_SHADER, BAR_FS));
      gl.bindAttribLocation(barProg, 0, 'aPos');
      gl.linkProgram(barProg);
      if (!gl.getProgramParameter(barProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(barProg));
      barU = { proj: gl.getUniformLocation(barProg, 'uProj'), view: gl.getUniformLocation(barProg, 'uView'),
               model: gl.getUniformLocation(barProg, 'uModel'), col: gl.getUniformLocation(barProg, 'uCol'),
               alpha: gl.getUniformLocation(barProg, 'uAlpha'), aspect: gl.getUniformLocation(barProg, 'uAspect') };
    } catch (e) {
      barProg = null; barU = null;
      log(`the panels' grab bars would not compile: ${e.message}`, 'warn');
      beacon(`FAIL grab bars · ${e.message} · the panels cannot be moved in this session`);
    }
    glCheck('bar');
    /**
     * The page's floor gets the context once. It may fail and the session goes on, with the reason
     * said; `attach` returning `false` is treated as a throw.
     * why: lessons/kit-xr-panel.md#build-surface
     */
    if (theSurface) {
      try {
        if (theSurface.attach?.(gl) === false) throw new Error('it refused this context');
        state.surface = { attached: true, why: '', draws: 0 };
      } catch (e) {
        state.surface = { attached: false, why: e.message, draws: 0 };
        theSurface = null;
        log(`the floor would not build: ${e.message}`, 'warn');
        beacon(`FAIL surface · ${e.message} · the session runs with nothing on the ground`);
      }
      glCheck('surface');
    }
    const P = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    glCheck('quad');
    quad = { vao, count: 6 };
    // Context-wide, set once: a canvas is already the way up a texture wants
    // it, and flipping it here would put the footer above the picture.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const p of panels) {
      for (const cv of [p.canvas, p.foot]) {
        if (!cv || tex.has(cv)) continue;
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        tex.set(cv, t);
      }
    }
    glCheck('textures');
    // ── the card's own stopwatch ──
    // CPU time cannot see GL work. Without the extension `liveGpuMs` stays null and `gpuTimer`
    // says why, because a zero would read as free.
    // why: lessons/kit-xr-panel.md#build-gpu-timer
    gpuTimerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    state.gpuTimer = gpuTimerExt
      ? 'EXT_disjoint_timer_query_webgl2'
      : 'this driver has no GPU timer, so the card’s own time cannot be read from in here';
    // The live renderers compile into this session's context; a page's own canvas is a different
    // context, which could only arrive as a copied bitmap.
    // why: lessons/kit-xr-panel.md#build-live
    for (const p of panels) {
      if (!p.live) continue;
      try {
        const ok = p.live.attach(gl);
        if (!ok) throw new Error('the renderer refused this context');
      } catch (e) {
        p.live = null;
        log(`the live picture would not compile in the headset's context: ${e.message}`, 'warn');
        beacon(`FAIL live panel · ${e.message} · falling back to the uploaded canvas`);
      }
    }
    glCheck('live');
    // The room compiles into the SAME context as the panels — one framebuffer,
    // one set of attribute slots, one clear rule. A second context here would
    // be a second thing to get `alpha: true` wrong on.
    if (theRoom) {
      theRoom.attach(gl);
      glCheck('room');
    }
    // The badge compiles here, the earliest moment `gl` exists, so a laptop can grade it.
    // why: lessons/kit-xr-panel.md#build-quit
    ensureQuit();
    glCheck('quit');
    return true;
  }

  /**
   * @param {'immersive-vr'|'immersive-ar'} [mode]
   * One entry path for both modes. AR differs downstream: a transparent clear, no wall cube, and
   * planes arrive only in AR (11 surfaces against none on a Quest 3).
   * why: lessons/kit-xr-panel.md#enter
   */
  async function enter(mode = 'immersive-vr') {
    if (session) return true;
    if (!navigator.xr) { log('this browser has no WebXR at all', 'warn'); return false; }
    // No await before `requestSession`: the support answer is the one taken at load.
    // why: lessons/kit-xr-panel.md#enter-no-await
    const wantAr = mode === 'immersive-ar';
    const can = wantAr ? supportedAr : supported;
    if (can === false) {
      log(wantAr
        ? 'this browser cannot show passthrough · nothing changes on this page'
        : 'no headset here · nothing changes on this page', 'warn');
      return false;
    }
    if (!gl) {
      try {
        if (!build()) { log('this browser gave no 3-D context, so there is nothing to draw with', 'bad'); return false; }
      } catch (e) { log(`the panel would not compile: ${e.message}`, 'bad'); return false; }
    }
    // A deadline on every step, since a promise that never settles reports nothing. 6 s for
    // machinery; a step that can show a permission prompt gets a human's worth of time.
    // why: lessons/kit-xr-panel.md#enter-step
    const step = async (what, p, ms = 6000) => {
      beacon(`… ${what}`);
      const out = await Promise.race([p,
        new Promise((_, no) => setTimeout(() => no(new Error(
          `${what} did not answer in ${ms / 1000} s`
          + (ms > 6000 ? '. Is there a permission prompt waiting for you?' : ''))), ms))]);
      beacon(`ok  ${what}`);
      return out;
    };
    try {
      // `local-floor` is required: the panel hangs at eye height from the floor.
      // `plane-detection` must stay optional, or an unmapped room refuses to start.
      // A session that arrives after the deadline is caught and ended.
      // why: lessons/kit-xr-panel.md#enter-features
      const ask = navigator.xr.requestSession(mode, {
        requiredFeatures: ['local-floor'],
        ...(theRoom ? { optionalFeatures: [...ROOM_OPTIONAL_FEATURES] } : {}),
      });
      let gaveUp = false;
      ask.then((late) => {
        if (!gaveUp) return;
        beacon('the session arrived after this page gave up waiting. Ending it rather than leaving you in a room nothing is drawing');
        try { late.end(); } catch { /* already gone */ }
      }, () => { /* a rejection is reported by the step below */ });
      // 90 s, because this one can ask you a question. See `step`.
      // why: lessons/kit-xr-panel.md#enter-90s
      try {
        session = await step(`requestSession ${mode}`, ask, 90000);
      } catch (e) { gaveUp = true; throw e; }
      // The blend mode decides what `no surfaces` may blame; a VR session returns none.
      // why: lessons/kit-xr-panel.md#enter-mark-asked
      theRoom?.markAsked(session.environmentBlendMode === 'opaque');
      // Everything after the session is inside the same try, or a throw leaves a session with no line.
      // `makeXRCompatible()` only when the context is not already compatible: it can never settle.
      // why: lessons/kit-xr-panel.md#enter-try
      if (gl.getContextAttributes?.()?.xrCompatible !== true) {
        await step('makeXRCompatible', gl.makeXRCompatible());
      } else {
        beacon('ok  the context was already made for a headset · makeXRCompatible not needed');
      }
      beacon('… XRWebGLLayer');
      session.updateRenderState({ baseLayer: makeLayer(session) });
      beacon('ok  XRWebGLLayer');
      space = await step('requestReferenceSpace local-floor', session.requestReferenceSpace('local-floor'));
    } catch (e) {
      log(`the headset refused · ${e.name}: ${e.message}`, 'bad');
      beacon(`FAIL session · ${e.name}: ${e.message}`);
      try { await session?.end(); } catch { /* it may never have started */ }
      session = null;
      return false;
    }
    // Nothing reads `session.renderState.baseLayer` here: it is null until the next frame.
    // why: lessons/kit-xr-panel.md#enter-base-layer
    state.presenting = true; state.mode = mode;
    state.frames = 0; state.fps = null; state.worstGapMs = 0;
    state.blendMode = session.environmentBlendMode || null;
    // The blend mode decides whether to composite, never the session's name: an `immersive-ar`
    // session can come back `opaque`. Everything downstream reads `arMode`.
    // why: lessons/kit-xr-panel.md#enter-ar-mode
    arMode = state.blendMode === 'alpha-blend' || state.blendMode === 'additive';
    if (wantAr && !arMode) {
      log(`this session was asked for passthrough and composites ${state.blendMode || 'something it will not name'} · drawing it as an opaque room instead`, 'warn');
      beacon(`asked for ${mode} and got blend ${state.blendMode || 'not reported'} · NOT compositing over your room`);
    }
    state.frameRate = session.frameRate ?? null;
    try { state.supportedFrameRates = session.supportedFrameRates ? Array.from(session.supportedFrameRates) : null; }
    catch { state.supportedFrameRates = null; }
    placed = null; armed = false; armAt = performance.now();
    tick = 0; tickAt = performance.now(); lastFrame = 0;
    uploads.length = 0; state.uploadWorstMs = 0; state.drawCpuMs = null;
    liveMs.length = 0; gpuFull.length = 0; gpuHalf.length = 0;
    state.liveWorstMs = 0; state.liveGpuMs = null; state.liveHalfGpuMs = null;
    probeFrames = 0; state.liveWhereCost = 'not measured yet';
    state.grabbed = 0; state.grabMovedM = null;
    beacon(`session created · ${mode} · blend ${session.environmentBlendMode || 'not reported'} · refresh ${session.frameRate || 'not reported'}`
      + ` · picture ${liveOn && panels.some((p) => p.live) ? 'RENDERED LIVE in this session' : 'uploaded from a canvas'}`
      + ` · walls ${wantSky ? 'on' : 'off'} · objects ${wantThings ? 'on' : 'off'}`);
    log('you are in it · hold any controller button for three seconds to come back out', 'ok');

    session.addEventListener('end', () => {
      state.presenting = false; state.mode = 'window';
      session = null; space = null; placed = null; arMode = false;
      grabbing = null; aimedBar = null;
      log(`came back out · ${state.frames} frames drawn${state.fps ? ` at ${state.fps.toFixed(1)} a second` : ''}`);
      beacon(`session ended · ${state.frames} frames · ${state.fps ? state.fps.toFixed(1) : '—'} fps`
        + ` · picture ${liveOn ? 'live' : 'uploaded'} · ${state.liveWhereCost}`
        + ` · ${state.grabbed} panel move(s)`);
      try { onEnd?.(); } catch { /* the page's business */ }
    });
    // The trigger grabs and never leaves. A press on the tablet belongs to the tablet, and only
    // the bar is a handle; a press anywhere else passes through.
    // why: lessons/kit-xr-panel.md#selectstart
    session.addEventListener('selectstart', (e) => {
      if (!armed) return;
      if (theHands?.over) { beacon('trigger on the tablet · the slider has it, the panel was not grabbed'); return; }
      if (!placed || !aimedBar) return;
      const src = e.inputSource?.targetRaySpace ? e.inputSource : null;
      if (!src) return;
      // The hand that is pointing is the hand that grabs, since `aimedBar` came from its ray.
      // why: lessons/kit-xr-panel.md#selectstart-hand
      const pointerSrc = theHands?.state?.pointerSrc;
      if (pointerSrc && src !== pointerSrc) {
        beacon('trigger on the hand that is not pointing · nothing grabbed');
        return;
      }
      grabbing = { i: aimedBar.i, src, local: null, from: null };
      beacon(`grabbed panel ${aimedBar.i} by its bar at ${aimedBar.t.toFixed(2)} m`);
    });
    session.addEventListener('selectend', () => {
      if (grabbing && grabbing.from && placed) {
        const M = placed[grabbing.i];
        const moved = Math.hypot(M[12] - grabbing.from[0], M[13] - grabbing.from[1], M[14] - grabbing.from[2]);
        state.grabbed++;
        state.grabMovedM = moved;
        // One beacon line per completed press, move and release; `grabbed` and `grabMovedM` copy it.
        // why: lessons/kit-xr-panel.md#selectend
        beacon(`released panel ${grabbing.i} after moving it ${moved.toFixed(2)} m`
          + ` · it is now ${state.panelsAt?.[grabbing.i]?.dist?.toFixed?.(2) ?? '—'} m from you, facing you`);
      }
      grabbing = null;
    });
    // The only exit is the long hold on any button. If nothing is drawn 4 s after the session
    // started, it is ended and said so.
    // why: lessons/kit-xr-panel.md#dead-man
    setTimeout(() => {
      if (session && state.frames === 0) {
        beacon('FAIL no frame drawn 4 s after the session started · leaving on my own');
        log('the headset session drew nothing. Ended it rather than leave you in the dark', 'bad');
        session.end().catch(() => {});
      }
    }, deadManMs);
    // The way out joins the session's frame loop before `onXR`, so a throwing first frame cannot
    // stop it.
    // why: lessons/kit-xr-panel.md#mount-quit
    ensureQuit(session);
    session.requestAnimationFrame(onXR);
    beacon('session running · requestAnimationFrame registered');
    return true;
  }

  /**
   * One view of everything this module draws, extracted so `preview` can run it on a laptop.
   * The caller owns the viewport and the scissor.
   * why: lessons/kit-xr-panel.md#draw-eye
   */
  function drawEye(proj, viewM, eye, tSec, hp, theGlow) {
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    // Only the first view clears colour: `gl.clear` ignores the viewport. Handed to the room.
    // why: lessons/kit-xr-panel.md#draw-eye-clear
    if (theRoom?.ok) {
      theRoom.draw({
        proj, view: viewM, tSec, doc: drawnDoc, clear: eye === 0, ar: arMode,
        eye: [hp.x, hp.y, hp.z],
        // No walls in passthrough or with `sky: false`; both arrive as one flag.
        // why: lessons/kit-xr-panel.md#draw-eye-sky
        sky: wantSky, bg: roomBg, glow: theGlow,
        // The beam ends on the bar it is on or the panel held, the same rule as xr-room.mjs.
        // why: lessons/kit-xr-panel.md#draw-eye-beam
        aimedDist: aimedBar ? aimedBar.t : 0,
        held: grabbing ? { i: -1, dist: grabDist } : null,
      });
      // Panels in front of the room on purpose: depth is cleared inside this eye's scissor so
      // nothing in the room hides the numbers.
      // why: lessons/kit-xr-panel.md#draw-eye-depth
      gl.enable(gl.SCISSOR_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
    } else if (eye === 0) {
      // Transparent in passthrough here too, or the compositor cannot show your room.
      // why: lessons/kit-xr-panel.md#draw-eye-transparent
      if (arMode) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    } else {
      // Each eye still needs its OWN depth, or it tests against the first
      // eye's depths and drops the picture. A scissor is what makes a clear
      // respect a region; a viewport is not a clip.
      gl.enable(gl.SCISSOR_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
    }
    // ── the page's floor ──
    // After the room and before the panels; depth is already cleared so no wall hides it.
    // why: lessons/kit-xr-panel.md#draw-eye-surface
    if (theSurface) {
      // A page's own chain leaves its framebuffer bound, a feedback loop when sampled. Put back the
      // layer's framebuffer by name: it is opaque, so `getParameter` gave 1282 on a Quest.
      // `?? null` is the window case, where `preview()` runs with no session.
      // why: lessons/kit-xr-panel.md#draw-eye-fb
      const fbWas = session?.renderState?.baseLayer?.framebuffer ?? null;
      try {
        theSurface.draw({ proj, view: viewM, eye: [hp.x, hp.y, hp.z], tSec,
          // ONE triple: what this frame was actually cleared to. See `surface`.
          bg: roomBg || [clear[0], clear[1], clear[2]] });
        state.surface.draws++;
      } catch (e) {
        theSurface = null;
        state.surface = { attached: false, why: `it threw while drawing: ${e.message}`,
          draws: state.surface.draws };
        log(`the floor threw and was taken down: ${e.message}`, 'bad');
        beacon(`FAIL surface draw · ${e.message}`);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbWas);
      // Panels assume no blend and depth writes, so a surface's leftovers are put back.
      // why: lessons/kit-xr-panel.md#draw-eye-state
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
    // A screen has no back: the room turns culling on, so it is turned off for panels every frame.
    // why: lessons/kit-xr-panel.md#draw-eye-cull
    gl.disable(gl.CULL_FACE);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.proj, false, proj);
    gl.uniformMatrix4fv(U.view, false, viewM);
    gl.bindVertexArray(quad.vao);
    panels.forEach((p, i) => {
      const useLive = liveOn && p.live && p.liveTex;
      const t = useLive ? p.liveTex : tex.get(p.canvas);
      if (!t) return;
      gl.uniformMatrix4fv(U.model, false, placed[i]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(U.tex, 0);
      // The footer strip is only a second texture on a live panel — an
      // uploaded canvas already has its numbers drawn into it by panel.mjs.
      const footTex = useLive && p.foot ? tex.get(p.foot) : null;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, footTex || t);
      gl.uniform1i(U.footTex, 1);
      gl.uniform1f(U.foot, footTex ? (p.footFrac ?? 0.11) : 0);
      // The same radius panel.mjs clips its own canvas to — 18 of its 400 css
      // units of height — so the two kinds of panel are the same shape.
      gl.uniform1f(U.round, useLive ? 0.045 : 0);
      gl.uniform1f(U.aspect, (p.w ?? 1.2) / (p.h ?? 0.75));
      gl.drawArrays(gl.TRIANGLES, 0, quad.count);
    });
    gl.activeTexture(gl.TEXTURE0);
    // ── the grab bars ──
    // After the panels and blended; no depth write, or the rim punches a hole.
    // why: lessons/kit-xr-panel.md#draw-eye-bars
    if (barProg && placed) {
      gl.useProgram(barProg);
      gl.uniformMatrix4fv(barU.proj, false, proj);
      gl.uniformMatrix4fv(barU.view, false, viewM);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      panels.forEach((p, i) => {
        const bw = (p.w ?? 1.2) * PLACE.barShare;
        const held = grabbing?.i === i;
        // `TOUCH` at the top of this file: brighter and bigger.
        // why: lessons/kit-xr-panel.md#draw-eye-touch
        const tch = touchOf(held, aimedBar?.i === i);
        gl.uniformMatrix4fv(barU.model, false,
          barOf(placed[i], p.h ?? 0.75, bw * tch.scale, PLACE.barH * tch.scale, PLACE.barGap));
        gl.uniform1f(barU.aspect, bw / PLACE.barH);
        // Monochrome: three greys say nothing, aimed, held. `tch.lit` of 1.00, 1.35 and 1.80 on a
        // 0.50 base gives 0.50, 0.68 and 0.90, leaving room above aimed.
        // why: lessons/kit-xr-panel.md#draw-eye-grey
        const g = Math.min(1, 0.50 * tch.lit);
        gl.uniform3fv(barU.col, [g, g, g]);
        gl.uniform1f(barU.alpha, held ? 1 : 0.85);
        gl.drawArrays(gl.TRIANGLES, 0, quad.count);
      });
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    // Last in the eye, so the way out is never behind a panel; placed from the view matrix,
    // so no hand has to report a pose.
    // why: lessons/kit-xr-panel.md#draw-eye-quit
    ensureQuit(session)?.draw(mul(proj, viewM), viewM);
    gl.bindVertexArray(null);
  }

  function scaleNow() {
    const f = typeof scale === 'function' ? scale() : scale;
    return Number.isFinite(f) && f > 0 ? f : null;
  }
  function makeLayer(s) {
    const f = scaleNow();
    return f ? new XRWebGLLayer(s, gl, { framebufferScaleFactor: f }) : new XRWebGLLayer(s, gl);
  }
  // A new layer arrives on the next frame, so its size is read there, as the first frame's is.
  let reread = false;
  function setScale(f) {
    scale = f;
    if (!session || !gl) return false;
    try { session.updateRenderState({ baseLayer: makeLayer(session) }); reread = true; return true; }
    catch (e) { log(`the headset refused a render scale of ${f}: ${e.message}`, 'warn'); return false; }
  }

  function onXR(now, frame) {
    if (!session) return;
    session.requestAnimationFrame(onXR);
    const pose = frame.getViewerPose(space);
    if (!pose) return;
    // Each consumer measures its own frame length. The layer is read here, where it exists.
    // why: lessons/kit-xr-panel.md#on-xr-layer
    const layer = session.renderState.baseLayer;
    if (!layer) return;
    state.frames++;

    // Arm the trigger and the thumbstick once every button is up, or after 3 s regardless.
    // The way out has its own arming in xr-quit.mjs (ARM_MS).
    // why: lessons/kit-xr-panel.md#on-xr-armed
    if (!armed) {
      let anyDown = false;
      for (const src of session.inputSources) {
        for (const b of src.gamepad?.buttons || []) if (b.pressed) anyDown = true;
      }
      if (!anyDown || performance.now() - armAt > 3000) armed = true;
    } else {
      // The hold runs inside `mountXRQuit`, so nothing here advances it.
      // Clicking the stick swaps live and uploaded panels, only while nothing is held: pushing it
      // moves a held panel.
      // why: lessons/kit-xr-panel.md#on-xr-stick
      for (const src of session.inputSources) {
        const bs = src.gamepad?.buttons || [];
        const stick = !!bs[BUTTON.thumbstick]?.pressed;
        if (stick && !stickWasDown && !grabbing) setLive(!liveOn, 'the thumbstick');
        stickWasDown = stickWasDown || stick;
      }
      // One rising edge per press: cleared only when every stick is up.
      if (![...session.inputSources].some((s) => s.gamepad?.buttons?.[BUTTON.thumbstick]?.pressed)) {
        stickWasDown = false;
      }
    }

    // ── the page redraws its canvases, once per frame ──
    // Not per eye: double the cost, and the two eyes would see two instants.
    // why: lessons/kit-xr-panel.md#on-xr-onframe
    const t0 = performance.now();
    try { onFrame?.({ frame, pose, session }); } catch (e) { log(`the picture threw: ${e.message}`, 'bad'); }
    const t1 = performance.now();
    state.drawCpuMs = t1 - t0;

    // ── and the panels go to the card ──
    // `texImage2D` every frame on purpose, the cost being measured; try `texSubImage2D` against it.
    // A live panel skips this and uploads only its footer strip.
    // why: lessons/kit-xr-panel.md#on-xr-upload
    gpuPoll();
    for (const p of panels) {
      if (liveOn && p.live) continue;
      const t = tex.get(p.canvas);
      if (!t) continue;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, p.canvas);
      if (state.frames === 1) glCheck('upload');
    }
    for (const p of panels) {
      // The footer strip belongs to the live path and is uploaded only when its
      // own version counter moved — it is numbers, and numbers change at human
      // pace, so a copy a frame would be measuring an instrument nobody reads.
      if (!p.foot || !(liveOn && p.live)) continue;
      const v = p.footVersion?.() ?? 0;
      if (v === p.__footAt) continue;
      const t = tex.get(p.foot);
      if (!t) continue;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, p.foot);
      p.__footAt = v;
      if (state.frames === 1) glCheck('footer');
    }
    const cost = performance.now() - t1;
    uploads.push(cost);
    if (uploads.length > 120) uploads.shift();
    state.uploadCpuMs = median(uploads);
    state.uploadWorstMs = Math.max(state.uploadWorstMs ?? 0, cost);

    // ── the picture, drawn here, in this session's own context ──
    // Once per frame, before the framebuffer is bound, since the renderer binds its own.
    // why: lessons/kit-xr-panel.md#on-xr-live
    const t2 = performance.now();
    if (liveOn) {
      const timed = gpuBegin('live');
      for (const p of panels) {
        if (!p.live) continue;
        try { p.liveTex = p.live.draw({ tSec: now / 1000 }); }
        catch (e) {
          p.live = null; p.liveTex = null;
          log(`the live picture stopped drawing: ${e.message}`, 'bad');
          beacon(`FAIL live panel while drawing: ${e.message} · back to the uploaded canvas`);
        }
      }
      if (timed) gpuEnd();
      // ── the one-shot size probe ──
      // A quarter of the pixels into a scratch target, a few frames once settled, then never again.
      // why: lessons/kit-xr-panel.md#on-xr-probe
      if (state.frames > 120 && probeFrames < 10 && gpuHalf.length < 6 && !gpuQ) {
        const one = panels.find((p) => p.live?.probe);
        if (one) {
          probeFrames++;
          if (gpuBegin('half')) {
            try { one.live.probe({ scale: 0.5, tSec: now / 1000 }); } catch { /* the probe is never the product */ }
            gpuEnd();
          }
        } else { probeFrames = 10; }
      }
    }
    const liveCost = performance.now() - t2;
    if (liveOn) {
      liveMs.push(liveCost);
      if (liveMs.length > 120) liveMs.shift();
      state.liveCpuMs = median(liveMs);
      state.liveWorstMs = Math.max(state.liveWorstMs ?? 0, liveCost);
    }
    // The verdict is built once a second, not per frame, to stay out of the measurement.
    // why: lessons/kit-xr-panel.md#on-xr-verdict

    // ── your real floor and walls, if this headset will say ──
    // Once per frame; `frame.detectedPlanes` throws without the grant, so the module swallows it.
    // why: lessons/kit-xr-panel.md#on-xr-planes
    theRoom?.observePlanes(frame, space);

    // The same input path `scene` uses, once per frame; every read is guarded so it cannot throw.
    // why: lessons/kit-xr-panel.md#on-xr-hands
    if (theHands && theRoom) {
      const seen = theHands.observe(frame, space, session);
      // The room draws what is in `hands`; everything else in here is input.
      theRoom.setInput({
        ...seen,
        ...(wantHands ? {} : { hands: [] }),
        ...(wantTablet && !arMode ? {} : { tabletM: null, hit: null }),
      });
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    if (state.frames === 1) glCheck('bindFramebuffer');
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const hp = pose.transform.position;
    if (!placed) {
      const hm = pose.transform.matrix;
      const n = panels.length;
      placed = panels.map((p, i) => placeFacing(
        hm, hp, p.w ?? 1.2, p.h ?? 0.75, p.dist ?? dist,
        // One panel is straight ahead; several fan out around you, which is
        // where `plans/plan-xr-room.md` §2 is going.
        n === 1 ? 0 : (i - (n - 1) / 2) * fan));
      grabDist = panels[0]?.dist ?? dist;
    }

    // ── dragging ──
    // Like the Quest lobby: the panel rides the ray at the grab offset and faces you only while
    // held, so panels never swim. Axes as in `facing`.
    // why: lessons/kit-xr-panel.md#on-xr-drag
    if (grabbing && placed && grabbing.src) {
      const rp = frame.getPose(grabbing.src.targetRaySpace, space);
      if (rp) {
        const m = rp.transform.matrix, o = rp.transform.position;
        const M = placed[grabbing.i];
        const p = panels[grabbing.i];
        const wM = p.w ?? 1.2, hM = p.h ?? 0.75;
        if (!grabbing.local) {
          grabbing.local = grabOffset(M, m, o);
          grabbing.from = [M[12], M[13], M[14]];
        }
        // Push and pull along the ray with the same stick whose CLICK swaps the
        // picture's path — they cannot collide, because the click is ignored
        // while something is held.
        const ay = grabbing.src.gamepad?.axes?.[AXIS.stickY] ?? 0;
        if (Math.abs(ay) > PLACE.stickDead && lastFrame) {
          const dt = Math.min(0.1, (now - lastFrame) / 1000);
          // -Z is forward, so pushing the stick FORWARD (a negative axis on the
          // xr-standard mapping) must make the local z MORE negative.
          grabbing.local[2] += ay * PLACE.pushPerSec * dt;
        }
        // `heldAt` and `facing` are exported and tested; this calls them, not a copy.
        // why: lessons/kit-xr-panel.md#on-xr-held-at
        const c = heldAt(m, o, grabbing.local, hp, theRoom?.planes?.floorY ?? 0);
        placed[grabbing.i] = facing(c, hp, wM, hM);
        grabDist = Math.hypot(c[0] - o.x, c[1] - o.y, c[2] - o.z);
      }
    }

    // ── where each panel is, and which bar the ray is on ──
    // One answer per frame, read by the beam, the highlight and the press.
    // why: lessons/kit-xr-panel.md#on-xr-aimed
    aimedBar = null;
    const ray = theHands?.pointer || null;
    if (placed && barProg && ray?.o && ray?.dir && !grabbing && !theHands?.over) {
      const o = ray.o, d = ray.dir;
      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        const bw = (p.w ?? 1.2) * PLACE.barShare;
        const hit = pickQuad(barOf(placed[i], p.h ?? 0.75, bw, PLACE.barH, PLACE.barGap), o, d);
        if (hit && (!aimedBar || hit.t < aimedBar.t)) aimedBar = { i, t: hit.t };
      }
    }
    state.panelsAt = placed
      ? placed.map((M) => ({
        x: M[12], y: M[13], z: M[14],
        dist: Math.hypot(M[12] - hp.x, M[13] - hp.y, M[14] - hp.z),
      }))
      : null;

    // ── the fake light the pictures throw on the floor ──
    // The page's colour, at the middle of the panels. See GRID_FS in xr-room.mjs.
    // why: lessons/kit-xr-panel.md#on-xr-glow
    let theGlow = null;
    if (glow && placed?.length) {
      let g = null;
      try { g = glow(); } catch { g = null; }
      if (g && g.amp > 0) {
        let sx = 0, sy = 0, sz = 0;
        for (const M of placed) { sx += M[12]; sy += M[13]; sz += M[14]; }
        theGlow = { col: g.col, at: [sx / placed.length, sy / placed.length, sz / placed.length],
                    radius: g.radius ?? 2.2, amp: g.amp };
      }
    }
    state.glow = theGlow
      ? { col: [...theGlow.col], amp: theGlow.amp, at: [...theGlow.at] }
      : null;

    let eye = 0;
    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.scissor(vp.x, vp.y, vp.width, vp.height);
      drawEye(view.projectionMatrix, view.transform.inverse.matrix, eye, now / 1000, hp, theGlow);
      eye++;
    }

    if (reread) {
      reread = false;
      const v0 = layer.getViewport(pose.views[0]);
      state.fb = { w: layer.framebufferWidth, h: layer.framebufferHeight };
      state.eye = { w: v0.width, h: v0.height };
    }
    if (state.frames === 1) {
      const vp0 = layer.getViewport(pose.views[0]);
      state.fb = { w: layer.framebufferWidth, h: layer.framebufferHeight };
      state.eye = { w: vp0.width, h: vp0.height };
      state.views = pose.views.length;
      // Assert on the error flag: a Quest drew a right-looking picture with one pending.
      // why: lessons/kit-xr-panel.md#on-xr-first-draw
      glCheck('firstDraw');
      // The first phase that was dirty, not merely that one was.
      state.glError = glErrors.length ? Number(glErrors[0].split(':')[1]) : 0;
      state.glWhere = glErrors.join(' ') || 'clean';
      beacon(`first headset frame · fb ${state.fb.w}x${state.fb.h} · ${state.views} views · eye0 ${state.eye.w}x${state.eye.h} · gl ${state.glWhere}`
        + ` · ${panels.length} panel(s)`
        + ` · picture ${liveOn && panels.some((p) => p.live)
          ? `RENDERED HERE at ${state.livePixels?.w}x${state.livePixels?.h}`
          : `uploaded at ${panels[0]?.canvas?.width ?? '?'}x${panels[0]?.canvas?.height ?? '?'}`}`
        + ` · grab bars ${barProg ? 'drawing' : 'WOULD NOT COMPILE'}`
        + ` · ${state.gpuTimer}`
        + (theRoom ? ` · room seed ${roomSeed}, ${drawnDoc.things.length} of ${roomDoc.things.length} things drawn · walls ${wantSky ? 'on' : 'OFF'} · grid ${theRoom.hasGrid ? 'drawing' : 'NOT drawing'} on ${theRoom.planes.from}` : ' · no room, the panel hangs in nothing'));
      // The line to hold beside the other page's, and beside the other mode's.
      beacon(`controller interface · ${theHands ? theHands.fingerprint() : 'NONE BUILT'}`
        + ` · its face ${theRoom?.hasTablet ? 'compiled' : 'WOULD NOT COMPILE, so there is no tablet in here'}`
        + ' · nothing before this dot depends on which kind of session this is');
      log(`drawing ${state.fb.w}x${state.fb.h}, ${state.eye.w}x${state.eye.h} an eye`, 'hi');
    }

    // Frame rate, counted over a one-second window — the same way the flat
    // panes on this page count theirs, so the two numbers are comparable.
    tick++;
    if (now - tickAt >= 1000) {
      verdictOnCost();
      state.fps = tick * 1000 / (now - tickAt);
      tick = 0; tickAt = now;
      // The rate, the path, the card's time and the glow on one line.
      // why: lessons/kit-xr-panel.md#on-xr-beacon
      beacon(`${state.frames} frames · ${state.fps.toFixed(1)} fps · worst gap ${state.worstGapMs.toFixed(1)} ms`
        + ` · picture ${liveOn ? 'live' : 'uploaded'}`
        + ` · upload ${state.uploadCpuMs == null ? '—' : state.uploadCpuMs.toFixed(2)} ms cpu`
        + ` · live ${state.liveCpuMs == null ? '—' : state.liveCpuMs.toFixed(2)} ms cpu`
        + ` / ${state.liveGpuMs == null ? 'no gpu timer' : `${state.liveGpuMs.toFixed(3)} ms gpu`}`
        + ` · glow ${state.glow ? `${state.glow.amp.toFixed(3)} at rgb ${state.glow.col.map((v) => v.toFixed(2)).join(',')}` : 'none'}`);
    }
    if (lastFrame) state.worstGapMs = Math.max(state.worstGapMs, now - lastFrame);
    lastFrame = now;
  }

  /**
   * The same picture drawn on a laptop: same context, room and renderers, `drawEye` twice per
   * frame into an off-screen canvas. Answers `does it draw and is it clean`, never a frame rate.
   * @returns {Promise<object>} what it found, including a pixel spread
   * why: lessons/kit-xr-panel.md#preview
   */
  async function preview({ frames = 8, width = 512, height = 320, eyeAt = [0, 1.6, 0],
                           snapshot = false } = {}) {
    // Never while a session runs: it resizes the canvas and moves the panels.
    // why: lessons/kit-xr-panel.md#preview-no-session
    if (session) return { ok: false, why: 'a session is running; the preview is for a window' };
    if (!gl) {
      try { if (!build()) return { ok: false, why: 'this browser gave no 3-D context' }; }
      catch (e) { return { ok: false, why: e.message }; }
    }
    const cv = gl.canvas;
    cv.width = width; cv.height = height;
    const hp = { x: eyeAt[0], y: eyeAt[1], z: eyeAt[2] };
    // A 70-degree field down a 16:10 window, and a head looking along -Z — the
    // same convention `placeFacing` reads out of a real pose matrix.
    const f = 1 / Math.tan((70 * Math.PI / 180) / 2);
    const asp = width / height;
    const proj = new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.0002, -1, 0, 0, -0.02, 0]);
    const viewM = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -hp.x, -hp.y, -hp.z, 1]);
    const headM = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, hp.x, hp.y, hp.z, 1]);
    placed = panels.map((p, i) => placeFacing(
      headM, hp, p.w ?? 1.2, p.h ?? 0.75, p.dist ?? dist,
      panels.length === 1 ? 0 : (i - (panels.length - 1) / 2) * fan));
    for (let n = 0; n < frames; n++) {
      // Wait first: without `preserveDrawingBuffer` a presented frame reads back cleared.
      // why: lessons/kit-xr-panel.md#preview-wait
      if (n) await new Promise((r) => requestAnimationFrame(r));
      gpuPoll();
      const tSec = performance.now() / 1000;
      try { onFrame?.({ frame: null, pose: null, session: null }); } catch { /* the page's business */ }
      if (liveOn) {
        // The headset's stopwatch, proving the instrument here. The size probe alternates with the
        // full pass: one TIME_ELAPSED query at a time.
        // why: lessons/kit-xr-panel.md#preview-stopwatch
        const half = n >= 4 && gpuHalf.length < 6 && panels.some((p) => p.live?.probe);
        const timed = gpuBegin(half ? 'half' : 'live');
        if (half) {
          for (const p of panels) {
            if (!p.live?.probe) continue;
            try { p.live.probe({ scale: 0.5, tSec }); } catch { /* the probe is never the product */ }
          }
          if (timed) gpuEnd();
        }
        for (const p of panels) {
          if (!p.live) continue;
          try { p.liveTex = p.live.draw({ tSec }); } catch (e) { p.live = null; p.liveTex = null; glErrors.push(`livePreview:${e.message}`); }
        }
        if (timed && !half) gpuEnd();
      }
      for (const p of panels) {
        const c = (liveOn && p.live) ? p.foot : p.canvas;
        const t = c && tex.get(c);
        if (!t) continue;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      }
      // Back to the screen first: a live renderer leaves its framebuffer bound, and sampling its
      // attachment is a feedback loop (GL_INVALID_OPERATION, 1282).
      // why: lessons/kit-xr-panel.md#preview-fb
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      let g = null;
      if (glow) { try { g = glow(); } catch { g = null; } }
      const theGlow = g && g.amp > 0
        ? { col: g.col, at: [placed[0][12], placed[0][13], placed[0][14]], radius: g.radius ?? 2.2, amp: g.amp }
        : null;
      state.glow = theGlow ? { col: [...theGlow.col], amp: theGlow.amp, at: [...theGlow.at] } : null;
      // Both eyes side by side, because one eye cannot break `only the first view clears colour`.
      // why: lessons/kit-xr-panel.md#preview-eyes
      for (let eye = 0; eye < 2; eye++) {
        const x = eye * (width >> 1);
        gl.viewport(x, 0, width >> 1, height);
        gl.scissor(x, 0, width >> 1, height);
        drawEye(proj, viewM, eye, tSec, hp, theGlow);
      }
    }
    // Give the card's own answers time to come back — they are asynchronous by
    // construction, and a result read before it exists is no result at all.
    for (let i = 0; i < 20 && gpuQ; i++) { await new Promise((r) => setTimeout(r, 16)); gpuPoll(); }
    verdictOnCost();
    glCheck('preview');
    // Read the whole frame per channel; an R+G+B sum is constant on cosines 120 degrees apart.
    // why: lessons/kit-xr-panel.md#preview-read
    const px = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const lo = [255, 255, 255], hi = [0, 0, 0];
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const v = px[i + k];
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
      if (px[i] > 24 || px[i + 1] > 24 || px[i + 2] > 24) lit++;
    }
    /**
     * 32 samples across the left eye a quarter up, so a check can tell a ramp from a flat disc.
     * `readPixels` counts rows from the bottom; left eye only, to avoid the seam.
     * why: lessons/kit-xr-panel.md#preview-profile
     */
    const PROFILE_N = 32;
    const profile = [];
    {
      const eyeW = width >> 1;
      // The brightest pixel in a vertical band, since one row misses hairline geometry.
      // why: lessons/kit-xr-panel.md#preview-band
      const y0 = Math.round(height * 0.12), y1 = Math.round(height * 0.46);
      for (let i = 0; i < PROFILE_N; i++) {
        const x = Math.min(eyeW - 1, Math.round(((i + 0.5) / PROFILE_N) * eyeW));
        let best = 0;
        for (let y = y0; y < y1; y++) {
          const o = (y * width + x) * 4;
          const v = Math.max(px[o], px[o + 1], px[o + 2]);
          if (v > best) best = v;
        }
        profile.push(best);
      }
    }
    // The clear colour, read off the top row of the same eye: what the fade has
    // to reach. A ramp that never gets there is a rim, which is the defect
    // `/floor/` paid for.
    const groundAt = ((height - 2) * width + (width >> 2)) * 4;
    const ground = Math.max(px[groundAt], px[groundAt + 1], px[groundAt + 2]);
    // The drawing buffer shrinks back, so no 512x320 buffer stays on a phone.
    // why: lessons/kit-xr-panel.md#preview-shrink
    cv.width = 16; cv.height = 16;
    // A picture of the headset's picture, flipped from `readPixels` rows; off by default.
    // `Page.captureScreenshot` cannot see an immersive view.
    // why: lessons/kit-xr-panel.md#preview-png
    let png = null;
    if (snapshot) {
      try {
        const flip = new Uint8ClampedArray(px.length);
        const row = width * 4;
        for (let y = 0; y < height; y++) flip.set(px.subarray((height - 1 - y) * row, (height - y) * row), y * row);
        const out = document.createElement('canvas');
        out.width = width; out.height = height;
        out.getContext('2d').putImageData(new ImageData(flip, width, height), 0, 0);
        png = out.toDataURL('image/png');
      } catch { png = null; }
    }
    const err = glErrors.length ? Number(glErrors[0].split(':')[1]) : 0;
    return {
      png,
      ok: true,
      canvas: cv,
      glError: Number.isFinite(err) ? err : 0,
      glWhere: glErrors.join(' ') || 'clean',
      spread: Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]),
      litShare: lit / (width * height),
      bars: !!barProg,
      // `draws` is the load-bearing half; `attached` only says the programs compiled.
      // why: lessons/kit-xr-panel.md#preview-draws
      surface: state.surface ? { ...state.surface } : null,
      /** 32 brightnesses across the left eye, a quarter up. See the note. */
      profile,
      /** the brightest channel at the top of that eye: the ground colour */
      ground,
      live: liveOn && panels.some((p) => p.live),
      // This machine's numbers, not a headset's.
      // why: lessons/kit-xr-panel.md#preview-gpu
      liveGpuMs: state.liveGpuMs,
      liveHalfGpuMs: state.liveHalfGpuMs,
      whereCost: state.liveWhereCost,
      gpuTimer: state.gpuTimer,
      pixels: state.livePixels,
    };
  }

  return {
    supported: () => supported,
    supportedAr: () => supportedAr,
    enter,
    /** Passthrough, which is the same entry path with one word changed. */
    enterAR: () => enter('immersive-ar'),
    setLive,
    isLive: () => liveOn,
    preview,
    end: async () => { try { await session?.end(); } catch { /* already gone */ } },
    setScale,
    state,
  };
}
