// Evaluated inside the headless page (after gpu.mjs's own page). Plays a patch for 8 s on a made-up signal
// track and keeps 4 frames; draws a scene in 3D from above and at eye height. Both return PNG data URLs.
(() => {
const vc = document.createElement('canvas');
const g = vc.getContext('webgl2', { preserveDrawingBuffer: true, antialias: true });

function compile(type, src) {
  const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s);
  if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) + '\n' + src.slice(0, 200));
  return s;
}
function prog(vs, fs) {
  const p = g.createProgram(); g.attachShader(p, compile(g.VERTEX_SHADER, vs)); g.attachShader(p, compile(g.FRAGMENT_SHADER, fs));
  g.bindAttribLocation(p, 0, 'a'); g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p));
  const u = {}; const n = g.getProgramParameter(p, g.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const k = g.getActiveUniform(p, i).name; u[k] = g.getUniformLocation(p, k); }
  return { p, u };
}

// ---------------- patch ----------------
const QVS = '#version 300 es\nin vec2 a; out vec2 uv; void main(){ uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }';
const LIB = [
  'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }',
  'float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }',
  'vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }',
].join('\n');
const HEAD = '#version 300 es\nprecision highp float;\nin vec2 uv; out vec4 o;\n' + LIB + '\n';
const GEN = prog(QVS, HEAD + [
  'uniform float T, H, D, S; uniform int G;',
  'void main(){',
  '  vec2 p = uv * 2.0 - 1.0; vec3 c = vec3(0);',
  '  if (G == 0) {',
  '    vec2 w = vec2(fbm(p * 2.0 + T * 0.1 + S), fbm(p * 2.0 - T * 0.1 + 3.0 + S));',
  '    float v = fbm(p * 3.0 + vec2(T * 0.2, T * 0.13) + w * D * 1.5);',
  '    c = hsv(H + v * 0.15, 0.75, smoothstep(0.25, 0.85, v) * 1.2);',
  '  } else if (G == 2) {',
  '    float r = length(p), a = atan(p.y, p.x); float z = 0.35 / max(r, 0.02) + T;',
  '    a += D * 0.4 * sin(z * 2.0);',
  '    float v = (0.5 + 0.5 * sin(z * 12.566)) * (0.6 + 0.4 * sin(a * 6.0 + T));',
  '    c = hsv(H + 0.05 * sin(z), 0.8, v * smoothstep(0.0, 0.4, r));',
  '  } else {',
  '    if (p.y < -0.02) { float z = 1.0 / (-p.y); float x = p.x * z; float h = D * 0.3 * sin(x * 0.7 + z * 0.5 + T * 2.0);',
  '      vec2 q = fract(vec2(x, z + T * 2.0 + h)); vec2 l = smoothstep(0.06 * z * 0.3 + 0.02, 0.0, min(q, 1.0 - q));',
  '      c = hsv(H, 0.7, max(l.x, l.y) * exp(-z * 0.12)); }',
  '    else c = hsv(H + 0.5, 0.4, 0.05 * (1.0 - p.y));',
  '  }',
  '  o = vec4(c, 1.0);',
  '}'].join('\n'));
const PVS = ['#version 300 es', 'precision highp float;', 'uniform float T, H, D, S, N; out vec3 col;',
  'float h1(float n){ return fract(sin(n * 12.9898 + S) * 43758.5453); }',
  'vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }',
  'void main(){ float i = float(gl_VertexID); float a = h1(i) * 6.2831 + T * (0.2 + h1(i + 7.0) * 0.6); float r = sqrt(h1(i + 3.0)) * 0.85;',
  '  r *= 1.0 + D * 0.35 * sin(T * 1.7 + h1(i + 5.0) * 6.2831);',
  '  gl_Position = vec4(cos(a) * r, sin(a) * r, 0.0, 1.0); gl_PointSize = 1.5 + 1.5 * h1(i + 9.0);',
  '  col = hsv(H + h1(i + 11.0) * 0.12, 0.7, min(1.0, 900.0 / N + 0.15)); }'].join('\n');
const PART = (() => {
  const p = g.createProgram(); g.attachShader(p, compile(g.VERTEX_SHADER, PVS));
  g.attachShader(p, compile(g.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; in vec3 col; out vec4 o; void main(){ vec2 d = gl_PointCoord - 0.5; o = vec4(col * smoothstep(0.5, 0.1, length(d)), 1.0); }'));
  g.linkProgram(p); const u = {}; for (const k of ['T', 'H', 'D', 'S', 'N']) u[k] = g.getUniformLocation(p, k); return { p, u };
})();
const COMP = prog(QVS, HEAD + [
  'uniform sampler2D scn, prev; uniform float T, FB, MIR, DISP, onMir, onDisp, onFb, onBloom, onTrails, onNoise;',
  'void main(){',
  '  vec2 p = uv * 2.0 - 1.0;',
  '  if (onMir > 0.5) { float a = atan(p.y, p.x), r = length(p); float seg = 6.2831853 / MIR; a = mod(a, seg); a = min(a, seg - a); p = r * vec2(cos(a), sin(a)); }',
  '  if (onDisp > 0.5) p += DISP * 0.06 * (vec2(vn(p * 4.0 + T), vn(p * 4.0 - T + 7.0)) - 0.5) * 2.0;',
  '  vec2 q = p * 0.5 + 0.5; vec3 c = texture(scn, q).rgb;',
  '  if (onBloom > 0.5) { vec3 b = vec3(0); for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; b += texture(scn, q + vec2(cos(a), sin(a)) * 0.025).rgb; } c += max(b / 8.0 - 0.25, 0.0) * 1.5; }',
  '  if (onFb > 0.5) c = max(c, texture(prev, (uv - 0.5) * 0.97 + 0.5).rgb * FB);',
  '  if (onTrails > 0.5) c = max(c, texture(prev, uv).rgb * 0.9);',
  '  if (onNoise > 0.5) c += (h21(uv * 500.0 + T) - 0.5) * 0.18;',
  '  o = vec4(c, 1.0);',
  '}'].join('\n'));
const COPY = prog(QVS, '#version 300 es\nprecision highp float; in vec2 uv; out vec4 o; uniform sampler2D t; void main(){ o = texture(t, uv); }');
const quad = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, quad); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
const vaoQ = g.createVertexArray(); g.bindVertexArray(vaoQ); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
const vaoE = g.createVertexArray();
function target(W) {
  const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, W, W, 0, g.RGBA, g.UNSIGNED_BYTE, null);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.MIRRORED_REPEAT); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.MIRRORED_REPEAT);
  const f = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, f); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t, 0);
  return { t, f };
}
const fr = (x) => x - Math.floor(x);
// The made-up track: envelope rises and falls once over 8 s; an onset every 2 s at 1.8, 3.8, 5.8, 7.8 s
// (so the frames at 2, 4, 6 s show 0.2 s after a hit); 60 BPM, a bar of 4 beats = 4 s.
function signals(t) {
  const env = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / 8);
  const since = fr((t - 1.8) / 2) * 2; const on = t < 1.8 ? 0 : Math.exp(-since * 4);
  const beat = Math.exp(-fr(t) * 6);
  return { 'audio.envelope': env, 'audio.low': Math.min(1, 0.7 * env + 0.3 * on), 'audio.mid': env * (0.5 + 0.5 * Math.sin(t * 2.1)),
    'audio.high': Math.min(1, 0.7 * on + 0.15 * fr(Math.sin(t * 91.3) * 43758)), 'audio.onset': on, 'clock.phase': fr(t / 4), 'clock.beat': beat,
    'hand.left.x': 0.5 + 0.5 * Math.sin(t * 0.8), 'hand.right.y': 0.5 + 0.5 * Math.cos(t * 0.6) };
}
window.playPatch = (j, label) => {
  const W = 160, FPS = 30;
  vc.width = W; vc.height = W;
  const A = target(W), B = target(W), S = target(W);
  let cur = A, prev = B;
  const fx = new Set(j.effects || []);
  const p = { ...j.params }; const follow = (j.bindings || []).map(() => null);
  const strip = document.createElement('canvas'); strip.width = W * 4; strip.height = W + 34; const c2 = strip.getContext('2d');
  c2.fillStyle = '#000'; c2.fillRect(0, 0, strip.width, strip.height);
  const frames = []; let T = 0; const seed = ((j.seed || 0) % 1000) * 0.137;
  const gen = { field: 0, particles: 1, tunnel: 2, grid: 3 }[j.generator] ?? 0;
  for (let f = 0; f <= 180; f++) {
    const t = f / FPS, dt = 1 / FPS, s = signals(t);
    (j.bindings || []).forEach((b, k) => {
      const x = b.range[0] + (b.range[1] - b.range[0]) * (s[b.signal] ?? 0);
      if (follow[k] === null) follow[k] = x;
      const tau = Math.max(1, x > follow[k] ? b.attack : b.release) / 1000;
      follow[k] += (x - follow[k]) * (1 - Math.exp(-dt / tau));
      p[b.param] = follow[k];
    });
    T += dt * (p.speed ?? 0.5);
    g.bindFramebuffer(g.FRAMEBUFFER, S.f); g.viewport(0, 0, W, W); g.clearColor(0, 0, 0, 1); g.clear(g.COLOR_BUFFER_BIT);
    if (gen === 1) {
      const n = Math.max(1, Math.min(60000, j.particles || 5000));
      g.useProgram(PART.p); g.uniform1f(PART.u.T, T); g.uniform1f(PART.u.H, p.hue); g.uniform1f(PART.u.D, p.displacement); g.uniform1f(PART.u.S, seed); g.uniform1f(PART.u.N, n);
      g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE); g.bindVertexArray(vaoE); g.drawArrays(g.POINTS, 0, n); g.disable(g.BLEND);
    } else {
      g.useProgram(GEN.p); g.uniform1f(GEN.u.T, T); g.uniform1f(GEN.u.H, p.hue); g.uniform1f(GEN.u.D, p.displacement); g.uniform1f(GEN.u.S, seed); g.uniform1i(GEN.u.G, gen);
      g.bindVertexArray(vaoQ); g.drawArrays(g.TRIANGLES, 0, 3);
    }
    g.bindFramebuffer(g.FRAMEBUFFER, cur.f); g.useProgram(COMP.p);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, S.t); g.uniform1i(COMP.u.scn, 0);
    g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, prev.t); g.uniform1i(COMP.u.prev, 1);
    const set = (k, v) => g.uniform1f(COMP.u[k], v);
    set('T', t); set('FB', p.feedback ?? 0); set('MIR', Math.max(2, Math.round(p.mirrorCount ?? 2))); set('DISP', p.displacement ?? 0);
    set('onMir', fx.has('mirror') ? 1 : 0); set('onDisp', fx.has('displacement') ? 1 : 0); set('onFb', fx.has('feedback') ? 1 : 0);
    set('onBloom', fx.has('bloom') ? 1 : 0); set('onTrails', fx.has('trails') ? 1 : 0); set('onNoise', fx.has('noise') ? 1 : 0);
    g.bindVertexArray(vaoQ); g.drawArrays(g.TRIANGLES, 0, 3);
    if (f % 60 === 0) {
      g.bindFramebuffer(g.FRAMEBUFFER, null); g.useProgram(COPY.p); g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, cur.t); g.uniform1i(COPY.u.t, 0);
      g.drawArrays(g.TRIANGLES, 0, 3);
      const k = f / 60; c2.drawImage(vc, k * W, 0); frames.push({ ...p });
      c2.fillStyle = '#ddd'; c2.font = '10px sans-serif';
      c2.fillText(`t=${t}s hue ${p.hue.toFixed(2)} spd ${p.speed.toFixed(2)}`, k * W + 3, W + 12);
      c2.fillText(`disp ${p.displacement.toFixed(2)} fb ${p.feedback.toFixed(2)} mir ${Math.round(p.mirrorCount)}`, k * W + 3, W + 26);
    }
    [cur, prev] = [prev, cur];
  }
  for (const x of [A, B, S]) { g.deleteTexture(x.t); g.deleteFramebuffer(x.f); }
  const px = (k) => c2.getImageData(k * W, 0, W, W).data; const diffs = [];
  for (let k = 1; k < 4; k++) { const a = px(k - 1), b = px(k); let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); diffs.push(+(s / (a.length / 4) / 3).toFixed(1)); }
  return { url: strip.toDataURL('image/png'), frames, diffs };
};

// ---------------- scene ----------------
function meshes() {
  const out = {};
  const box = []; const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const n of F) {
    const u = n[0] ? [0, 1, 0] : [1, 0, 0]; const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const c = (a, b) => [0, 1, 2].map((i) => n[i] * 0.5 + u[i] * a * 0.5 + v[i] * b * 0.5);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) box.push(...c(a, b), ...n);
  }
  out.box = box;
  const sph = []; const SL = 20, ST = 12;
  const sp = (i, k) => { const th = (k / ST) * Math.PI, ph = (i / SL) * Math.PI * 2; const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; return [...n.map((x) => x * 0.5), ...n]; };
  for (let k = 0; k < ST; k++) for (let i = 0; i < SL; i++) sph.push(...sp(i, k), ...sp(i + 1, k), ...sp(i + 1, k + 1), ...sp(i, k), ...sp(i + 1, k + 1), ...sp(i, k + 1));
  out.sphere = sph;
  const cyl = (top) => { const m = []; const N = 24;
    for (let i = 0; i < N; i++) { const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const r0 = 0.5, rt = top; const P = (a, y, r) => [Math.cos(a) * r, y, Math.sin(a) * r];
      const sl = (r0 - rt); const nn = (a) => { const l = Math.hypot(1, sl); return [Math.cos(a) / l, sl / l, Math.sin(a) / l]; };
      m.push(...P(a0, -0.5, r0), ...nn(a0), ...P(a1, -0.5, r0), ...nn(a1), ...P(a1, 0.5, rt), ...nn(a1));
      m.push(...P(a0, -0.5, r0), ...nn(a0), ...P(a1, 0.5, rt), ...nn(a1), ...P(a0, 0.5, rt), ...nn(a0));
      m.push(0, -0.5, 0, 0, -1, 0, ...P(a1, -0.5, r0), 0, -1, 0, ...P(a0, -0.5, r0), 0, -1, 0);
      if (rt > 0) m.push(0, 0.5, 0, 0, 1, 0, ...P(a0, 0.5, rt), 0, 1, 0, ...P(a1, 0.5, rt), 0, 1, 0);
    } return m; };
  out.cylinder = cyl(0.5); out.disc = out.cylinder; out.cone = cyl(0);
  return out;
}
function torusMesh(tr) {
  const m = []; const R = (1 - tr) / 2, r = tr / 2; const N = 32, M = 12;
  const P = (i, k) => { const a = (i / N) * Math.PI * 2, b = (k / M) * Math.PI * 2; const n = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)];
    return [Math.cos(a) * (R + r * Math.cos(b)), r * Math.sin(b), Math.sin(a) * (R + r * Math.cos(b)), ...n]; };
  for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) m.push(...P(i, k), ...P(i + 1, k), ...P(i + 1, k + 1), ...P(i, k), ...P(i + 1, k + 1), ...P(i, k + 1));
  return m;
}
const MESH = meshes();
const SVS = ['#version 300 es', 'precision highp float;', 'layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm; layout(location=2) in vec3 off;',
  'uniform mat4 VP; uniform mat3 M; out vec3 n; out vec3 w;', 'void main(){ w = M * pos + off; n = normalize(transpose(inverse(M)) * nrm); gl_Position = VP * vec4(w, 1.0); }'].join('\n');
const SFS = ['#version 300 es', 'precision highp float;', 'in vec3 n; in vec3 w; out vec4 o; uniform vec3 C; uniform float E, A;',
  'void main(){ vec3 l = normalize(vec3(0.4, 0.9, 0.3)); float d = max(dot(normalize(n), l), 0.0); float h = 0.5 + 0.5 * normalize(n).y;',
  '  vec3 c = C * (0.3 + 0.25 * h + 0.6 * d) + C * E; float fog = exp(-length(w) * 0.01); o = vec4(pow(c * fog, vec3(0.4545)), A); }'].join('\n');
const SP = (() => { const p = g.createProgram(); g.attachShader(p, compile(g.VERTEX_SHADER, SVS)); g.attachShader(p, compile(g.FRAGMENT_SHADER, SFS)); g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p)); const u = {}; for (const k of ['VP', 'M', 'C', 'E', 'A']) u[k] = g.getUniformLocation(p, k); return { p, u }; })();
const MAT = { stone: [0.55, 0.53, 0.5], metal: [0.7, 0.74, 0.78], wood: [0.55, 0.36, 0.18], glass: [0.6, 0.85, 0.95], water: [0.12, 0.35, 0.7], matte: [0.82, 0.8, 0.76], emissive: [1.0, 0.8, 0.3], mirror: [0.9, 0.93, 0.96] };
function persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; }
function look(e, c) { const sub = (a, b) => a.map((x, i) => x - b[i]); const nor = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = nor(sub(e, c)), x = nor(cr([0, 1, 0], z)), y = cr(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]; }
function mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; }
function rotm(r) { const [x, y, z] = (r || [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  const Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]], Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  const m3 = (a, b) => a.map((r, i) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
  return m3(Rz, m3(Ry, Rx)); }
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
window.drawScene = (j, inst) => {
  const W = 400, H = 300; vc.width = W * 2; vc.height = H;
  g.bindFramebuffer(g.FRAMEBUFFER, null); g.enable(g.DEPTH_TEST); g.clearColor(0.07, 0.08, 0.1, 1); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
  const shapes = [{ shape: 'box', size: [20, 0.02, 20], position: [0, -0.01, 0], material: 'matte', color: '#2a2c30' }, ...j.shapes];
  const pos = [[[0, -0.01, 0]], ...inst];
  const cams = [[[0, 19, 15], [0, 0, 0]], [[0, 1.7, 11.5], [0, 1.7, 0]]];
  const vao = g.createVertexArray(); g.bindVertexArray(vao);
  const vb = g.createBuffer(), ob = g.createBuffer();
  g.useProgram(SP.p);
  cams.forEach(([e, c], v) => {
    g.viewport(v * W, 0, W, H);
    g.uniformMatrix4fv(SP.u.VP, false, new Float32Array(mul(persp(v ? 1.25 : 0.95, W / H, 0.1, 100), look(e, c))));
    shapes.forEach((s, k) => {
      const mesh = s.shape === 'torus' ? torusMesh(Math.min(0.9, Math.max(0.05, s.size[1] / s.size[0]))) : MESH[s.shape] || MESH.box;
      const sc = s.shape === 'torus' ? [s.size[0], s.size[0], s.size[2]] : s.size;
      const R = rotm(s.rotation); const M = [0, 1, 2].flatMap((col) => [0, 1, 2].map((row) => R[row][col] * sc[col]));
      g.uniformMatrix3fv(SP.u.M, false, new Float32Array(M));
      g.uniform3fv(SP.u.C, s.color && /^#[0-9a-f]{6}$/i.test(s.color) ? hex(s.color) : MAT[s.material] || [0.8, 0.8, 0.8]);
      g.uniform1f(SP.u.E, s.material === 'emissive' ? 0.6 : 0); g.uniform1f(SP.u.A, 1);
      g.bindBuffer(g.ARRAY_BUFFER, vb); g.bufferData(g.ARRAY_BUFFER, new Float32Array(mesh), g.STREAM_DRAW);
      g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, 24, 0); g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 3, g.FLOAT, false, 24, 12);
      g.bindBuffer(g.ARRAY_BUFFER, ob); g.bufferData(g.ARRAY_BUFFER, new Float32Array(pos[k].flat()), g.STREAM_DRAW);
      g.enableVertexAttribArray(2); g.vertexAttribPointer(2, 3, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(2, 1);
      g.drawArraysInstanced(g.TRIANGLES, 0, mesh.length / 6, pos[k].length);
    });
  });
  g.vertexAttribDivisor(2, 0); g.deleteBuffer(vb); g.deleteBuffer(ob); g.deleteVertexArray(vao); g.disable(g.DEPTH_TEST);
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H; const x = c.getContext('2d'); x.drawImage(vc, 0, 0);
  x.fillStyle = '#aaa'; x.font = '11px sans-serif'; x.fillText('from above', 6, 14); x.fillText('eye height 1.7 m, from the +z wall', W + 6, 14);
  return c.toDataURL('image/png');
};

// ---------------- sheet ----------------
window.sheet = async (cells, cw, ch, cols, title) => {
  const cap = 30, top = 24;
  const c = document.createElement('canvas'); c.width = cw * cols; c.height = top + Math.ceil(cells.length / cols) * (ch + cap);
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.font = 'bold 14px sans-serif'; x.fillText(title, 6, 17);
  for (let k = 0; k < cells.length; k++) {
    const X = (k % cols) * cw, Y = top + Math.floor(k / cols) * (ch + cap);
    const im = new Image(); im.src = cells[k].url; await im.decode();
    const s = Math.min((cw - 4) / im.width, ch / im.height); x.drawImage(im, X + 2, Y, im.width * s, im.height * s);
    x.fillStyle = '#ccc'; x.font = '10px sans-serif'; const t = cells[k].label; const n = Math.floor(cw / 5.4);
    x.fillText(t.slice(0, n), X + 3, Y + ch + 11); x.fillText(t.slice(n, 2 * n), X + 3, Y + ch + 24);
  }
  return c.toDataURL('image/png');
};
return 'views ready';
})();
