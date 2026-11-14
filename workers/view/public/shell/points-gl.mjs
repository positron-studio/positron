// demo/shell/points-gl.mjs: a point scene (points-scene.mjs) drawn in one WebGL2 draw call. Every point
// is computed in the vertex shader from gl_VertexID, time and uniforms, so nothing per frame is on the
// CPU but the uniforms. One renderer per context: a page's canvas, and the headset's in xr-panel.mjs.
//   const r = createPointsRenderer(gl); r.setScene(scene, count); r.draw({ proj, view, t, values, px });
import { pointCount, PALETTE_RGB } from './points-scene.mjs';

const BASE_ID = { plane: 0, grid3d: 1, sphere: 2, torus: 3, spiral: 4, cloud: 5, lissajous: 6 };
const DISP_ID = { noise: 0, wave: 1, ripple: 2, twist: 3, pulse: 4 };
const COLOR_ID = { height: 0, distance: 1, index: 2, time: 3 };
const MAX_DISP = 6;

const VS = `#version 300 es
precision highp float;
precision highp int;
uniform mat4 uProj, uView;
uniform vec3 uOffset, uCenter;
uniform float uT, uN, uSpin, uSat, uVal, uSize, uPx;
uniform int uBase, uDN, uColBy, uRainbow;
uniform vec4 uB;
uniform ivec3 uGrid;
uniform ivec2 uDT[${MAX_DISP}];
uniform vec4 uDA[${MAX_DISP}];
uniform vec2 uDC[${MAX_DISP}];
uniform vec3 uPal[3];
out vec3 vCol;
const float TAU = 6.2831853;
float nz(float x, float y, float z) {
  return (sin(x * 1.7 + cos(y * 1.3)) * cos(z * 1.1 + sin(x * 0.9)) + sin(y * 2.1 + z * 0.7)) * 0.5;
}
// Integer hashes: sin() of a six-figure index has no precision left in fp32.
float hashU(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return float(x) / 4294967296.0; }
// fract(i / golden ratio), exact for any index.
float gold(uint i) { return float(i * 2654435769u) / 4294967296.0; }
vec3 grad(float u) {
  u = clamp(u, 0.0, 1.0);
  if (uRainbow == 1) return clamp(abs(mod(u * 6.0 + vec3(5.0, 3.0, 1.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  float s = u * 2.0;
  return s < 1.0 ? mix(uPal[0], uPal[1], s) : mix(uPal[1], uPal[2], s - 1.0);
}
void main() {
  uint iu = uint(gl_VertexID);
  float i = float(gl_VertexID), n = uN, t = uT;
  vec3 p = vec3(0.0);
  if (uBase == 0) {
    float nx = float(uGrid.x); float a = mod(i, nx), k = floor(i / nx);
    p = vec3(-uB.x * 0.5 + a * uB.z, 0.0, -uB.y * 0.5 + k * uB.z);
  } else if (uBase == 1) {
    float nx = float(uGrid.x), ny = float(uGrid.y), nk = float(uGrid.z);
    float a = mod(i, nx), e = mod(floor(i / nx), ny), k = floor(i / (nx * ny));
    p = vec3(a - (nx - 1.0) * 0.5, e - (ny - 1.0) * 0.5, k - (nk - 1.0) * 0.5) * uB.x;
  } else if (uBase == 2) {
    float yy = 1.0 - 2.0 * (i + 0.5) / n; float r = sqrt(max(0.0, 1.0 - yy * yy)); float a = -TAU * gold(iu);
    p = vec3(cos(a) * r, yy, sin(a) * r) * uB.x;
  } else if (uBase == 3) {
    float u = TAU * i / n, w = TAU * gold(iu); float rr = uB.x + uB.y * cos(w);
    p = vec3(cos(u) * rr, uB.y * sin(w), sin(u) * rr);
  } else if (uBase == 4) {
    float s = i / n; float arms = uB.w; float a = TAU * (uB.x * s + mod(i, arms) / arms); float r = uB.y * s;
    p = vec3(cos(a) * r, uB.z * (s - 0.5), sin(a) * r);
  } else if (uBase == 5) {
    p = (vec3(hashU(iu * 3u), hashU(iu * 3u + 1u), hashU(iu * 3u + 2u)) - 0.5) * uB.xyz;
  } else {
    float s = TAU * i / n;
    p = uB.w * vec3(sin(uB.x * s + 1.5707963), sin(uB.y * s), sin(uB.z * s));
  }
  for (int k = 0; k < ${MAX_DISP}; k++) {
    if (k >= uDN) break;
    int ty = uDT[k].x; vec4 d = uDA[k]; float T = d.z * t;
    if (ty == 0) {
      float f = d.x;
      p.x += d.y * nz(p.x * f + T, p.y * f, p.z * f);
      p.y += d.y * nz(p.y * f + 3.1, p.z * f + T, p.x * f);
      p.z += d.y * nz(p.z * f + 7.3, p.x * f, p.y * f + T);
    } else if (ty == 1) {
      float u = uDT[k].y == 0 ? p.x : p.z; float sg = d.w;
      p.y += d.y * sin(d.x * u * sg - T);
    } else if (ty == 2) {
      p.y += d.y * sin(d.x * length(p.xz - uDC[k]) - T);
    } else if (ty == 3) {
      float a = (d.w * p.y + T) * 0.017453293; float c = cos(a), s = sin(a);
      p.xz = vec2(p.x * c - p.z * s, p.x * s + p.z * c);
    } else {
      p *= 1.0 + d.y * sin(TAU * d.z * t);
    }
  }
  if (uSpin != 0.0) { float a = uSpin * t; float c = cos(a), s = sin(a); p.xz = vec2(p.x * c - p.z * s, p.x * s + p.z * c); }
  float u = uColBy == 0 ? (uCenter.y + p.y) / 6.0 : uColBy == 1 ? length(p) / 6.0 : uColBy == 2 ? i / n : fract(t / 8.0 + i / n * 0.2);
  vec3 rgb = grad(u); float mx = max(rgb.r, max(rgb.g, rgb.b));
  vCol = (mx + (rgb - mx) * uSat) * uVal;
  gl_Position = uProj * uView * vec4(uCenter + p + uOffset, 1.0);
  gl_PointSize = clamp(uSize * uPx / max(gl_Position.w, 0.25), 1.0, 48.0);
}`;

const FS = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 o;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  o = vec4(vCol, 1.0);
}`;

/** The numbers a scene hands the shader, before bindings. Plain data, so a page can publish it. */
export function packScene(scene, count = null) {
  const b = scene.base;
  const natural = pointCount(b);
  const n = Math.max(1, Math.min(200000, Math.round(count ?? natural)));
  let B = [0, 0, 0, 0], grid = [1, 1, 1];
  if (b.type === 'plane') {
    // At an overridden count the row is as wide as the size asks and the page draws exactly n.
    const s = count ? Math.sqrt((b.size[0] * b.size[1]) / n) : b.spacing;
    const nx = count ? Math.max(2, Math.round(b.size[0] / s) + 1) : Math.floor(b.size[0] / b.spacing) + 1;
    const sp = count ? b.size[0] / (nx - 1) : b.spacing;
    const rows = Math.ceil(n / nx);
    B = [b.size[0], count ? (rows - 1) * sp : b.size[1], sp, 0]; grid = [nx, rows, 1];
  } else if (b.type === 'grid3d') {
    let nn = b.n, sp = b.spacing;
    if (count) { const k = Math.cbrt(n / (b.n[0] * b.n[1] * b.n[2])); nn = b.n.map((x) => Math.max(1, Math.round(x * k))); sp = b.spacing / k; }
    B = [sp, 0, 0, 0]; grid = nn;
  } else if (b.type === 'sphere') B = [b.radius, 0, 0, 0];
  else if (b.type === 'torus') B = [b.R, b.r, 0, 0];
  else if (b.type === 'spiral') B = [b.turns, b.radius ?? 3, b.height || 0, b.arms || 1];
  else if (b.type === 'cloud') B = [...b.spread, 0];
  else if (b.type === 'lissajous') B = [b.a, b.b, b.c, b.size ?? 2];
  const ds = (scene.displace || []).slice(0, MAX_DISP);
  const col = scene.color || {};
  const pal = col.palette || 'ice';
  return {
    base: BASE_ID[b.type], B, grid, n,
    center: scene.center || [0, 2, 0],
    disp: ds.map((d) => ({
      type: DISP_ID[d.type],
      axis: (d.dir || 'x').endsWith('z') ? 1 : 0,
      // freq, amp, speed, and a fourth slot: the wave's sign or the twist's amount
      a: [d.freq ?? 0, d.amp ?? 0, d.type === 'pulse' ? (d.speed ?? 1) : (d.speed ?? 0),
        d.type === 'twist' ? d.amount : ((d.dir || 'x').startsWith('-') ? -1 : 1)],
      c: d.center || [0, 0],
    })),
    spin: scene.spin || 0,
    colBy: COLOR_ID[col.by || 'height'],
    rainbow: pal === 'rainbow' ? 1 : 0,
    pal: PALETTE_RGB[pal] || PALETTE_RGB.mono,
    sat: col.saturation ?? 1, val: col.value ?? 1,
    size: scene.pointSize ?? 2,
  };
}

/** A bound field's value written over the packed numbers, for this frame only. */
function applyBound(P, values) {
  if (!values) return P;
  const Q = { ...P, B: [...P.B], disp: P.disp.map((d) => ({ ...d, a: [...d.a] })) };
  for (const [path, v] of Object.entries(values)) {
    let m;
    if ((m = /^displace\[(\d+)\]\.(freq|amp|speed|amount)$/.exec(path))) {
      const d = Q.disp[Number(m[1])];
      if (d) d.a[{ freq: 0, amp: 1, speed: 2, amount: 3 }[m[2]]] = v;
    } else if (path === 'color.saturation') Q.sat = v;
    else if (path === 'color.value') Q.val = v;
    else if (path === 'pointSize') Q.size = v;
    else if (path === 'spin') Q.spin = v;
    else if (path === 'base.radius') { if (P.base === 2) Q.B[0] = v; else if (P.base === 4) Q.B[1] = v; }
    else if (path === 'base.R') Q.B[0] = v;
    else if (path === 'base.r') Q.B[1] = v;
    else if (path === 'base.size') Q.B[3] = v;
  }
  return Q;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @returns {{ok:boolean, why:string, setScene:Function, draw:Function, count:number, dispose:Function}}
 */
export function createPointsRenderer(gl) {
  let prog = null, vao = null, U = null, why = '';
  let packed = null, drawn = 0;
  try {
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'compile failed');
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
    const names = ['uProj', 'uView', 'uOffset', 'uCenter', 'uT', 'uN', 'uSpin', 'uSat', 'uVal', 'uSize', 'uPx',
      'uBase', 'uDN', 'uColBy', 'uRainbow', 'uB', 'uGrid', 'uDT', 'uDA', 'uDC', 'uPal'];
    U = Object.fromEntries(names.map((k) => [k, gl.getUniformLocation(prog, k)]));
    // No attributes: every position comes from gl_VertexID.
    vao = gl.createVertexArray();
  } catch (e) {
    why = e?.message || String(e);
    prog = null;
  }

  const DT = new Int32Array(MAX_DISP * 2), DA = new Float32Array(MAX_DISP * 4), DC = new Float32Array(MAX_DISP * 2);
  const PAL = new Float32Array(9);

  return {
    get ok() { return !!prog; },
    get why() { return why; },
    /** Points drawn by the last draw call. */
    get count() { return drawn; },
    get packed() { return packed; },
    setScene(scene, count = null) { packed = packScene(scene, count); },
    /**
     * @param {object} o
     * @param {Float32Array} o.proj, o.view   column-major
     * @param {number} o.t        seconds
     * @param {object} [o.values] bound fields this frame (createFollowers().values)
     * @param {number} o.px       pixels per point-size unit at 1 m: viewport height / 1080 * 4
     * @param {number[]} [o.offset]  moves the whole room, metres
     */
    draw({ proj, view, t, values = null, px, offset = [0, 0, 0] }) {
      if (!prog || !packed) return 0;
      const P = applyBound(packed, values);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(U.uProj, false, proj);
      gl.uniformMatrix4fv(U.uView, false, view);
      gl.uniform3fv(U.uOffset, offset);
      gl.uniform3fv(U.uCenter, P.center);
      gl.uniform1f(U.uT, t);
      gl.uniform1f(U.uN, P.n);
      gl.uniform1f(U.uSpin, (P.spin * Math.PI) / 180);
      gl.uniform1f(U.uSat, P.sat);
      gl.uniform1f(U.uVal, P.val);
      gl.uniform1f(U.uSize, P.size);
      gl.uniform1f(U.uPx, px);
      gl.uniform1i(U.uBase, P.base);
      gl.uniform1i(U.uDN, P.disp.length);
      gl.uniform1i(U.uColBy, P.colBy);
      gl.uniform1i(U.uRainbow, P.rainbow);
      gl.uniform4fv(U.uB, P.B);
      gl.uniform3iv(U.uGrid, P.grid);
      DT.fill(0); DA.fill(0); DC.fill(0);
      P.disp.forEach((d, k) => { DT[k * 2] = d.type; DT[k * 2 + 1] = d.axis; DA.set(d.a, k * 4); DC.set(d.c, k * 2); });
      gl.uniform2iv(U.uDT, DT);
      gl.uniform4fv(U.uDA, DA);
      gl.uniform2fv(U.uDC, DC);
      PAL.set([...P.pal[0], ...P.pal[1], ...P.pal[2]]);
      gl.uniform3fv(U.uPal, PAL);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.POINTS, 0, P.n);
      gl.bindVertexArray(null);
      drawn = P.n;
      return P.n;
    },
    dispose() {
      try { if (prog) gl.deleteProgram(prog); if (vao) gl.deleteVertexArray(vao); } catch { /* a lost context takes it anyway */ }
      prog = null; vao = null;
    },
  };
}

/** Column-major perspective, for the flat view. */
export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

/** Column-major view matrix looking from `eye` at `at`, y up. */
export function lookAt(eye, at) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = norm(sub(eye, at)); const x = norm(cross([0, 1, 0], z)); const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}
