// Evaluated inside the headless page by points.mjs: checks a points-fn answer by sampling it on the GPU, and draws
// either points format as a 4 frame strip (0, 2, 4, 6 s of the made-up signal track) from eye height in the room.
(() => {
const trackAt = __TRACK__;
const boundAt = __BOUND__;
const pointCount = __COUNT__;
const pointsAt = __POINTS__;
window.pointsAtPage = pointsAt;
const cv = document.createElement('canvas');
const g = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: true });
g.getExtension('EXT_color_buffer_float');
function sh(type, src) { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); return s; }
function prog(vs, fs, lines) {
  const v = sh(g.VERTEX_SHADER, vs), f = sh(g.FRAGMENT_SHADER, fs);
  for (const [s, name] of [[v, 'vertex'], [f, 'fragment']]) if (!g.getShaderParameter(s, g.COMPILE_STATUS)) {
    const log = (g.getShaderInfoLog(s) || 'compile failed').replace(/(ERROR: \d+:)(\d+)/g, (m, a, n) => a + Math.max(1, n - (lines || 0)));
    return { error: 'GLSL compile error (line numbers are in your code): ' + log.trim().split('\n').slice(0, 6).join(' | ') };
  }
  const p = g.createProgram(); g.attachShader(p, v); g.attachShader(p, f); g.bindAttribLocation(p, 0, 'a'); g.bindAttribLocation(p, 1, 'col'); g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS)) return { error: 'GLSL link error: ' + (g.getProgramInfoLog(p) || '').trim() };
  const u = {}; const n = g.getProgramParameter(p, g.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const k = g.getActiveUniform(p, i).name; u[k] = g.getUniformLocation(p, k); }
  return { p, u };
}
const QV = '#version 300 es\nin vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
const quad = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, quad); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
const S = 4096;
const tex = g.createTexture(); g.bindTexture(g.TEXTURE_2D, tex); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA32F, S, 1, 0, g.RGBA, g.FLOAT, null);
g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
const fb = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, fb); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0); g.bindFramebuffer(g.FRAMEBUFFER, null);

window.checkPointsFn = (code, count, envs) => {
  const head = '#version 300 es\nprecision highp float;\nout vec4 o_;\nuniform float uT_, uE_;\n';
  const fs = head + code + '\nvoid main(){ float k = floor(gl_FragCoord.x); float n = float(COUNT); float i = floor(k * n / ' + S + '.0); o_ = vec4(pos(i, n, uT_, uE_), 1.0); }';
  const r = prog(QV, fs, head.split('\n').length - 1);
  if (r.error) return { ok: false, error: r.error };
  const t0 = performance.now(); const frames = [];
  g.bindFramebuffer(g.FRAMEBUFFER, fb); g.viewport(0, 0, S, 1); g.useProgram(r.p);
  g.bindBuffer(g.ARRAY_BUFFER, quad); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
  [0, 2, 4, 6].forEach((t, k) => {
    if (r.u.uT_) g.uniform1f(r.u.uT_, t); if (r.u.uE_) g.uniform1f(r.u.uE_, envs[k]); g.drawArrays(g.TRIANGLES, 0, 3);
    const px = new Float32Array(S * 4); g.readPixels(0, 0, S, 1, g.RGBA, g.FLOAT, px); frames.push(px);
  });
  g.bindFramebuffer(g.FRAMEBUFFER, null); g.deleteProgram(r.p);
  const ms = Math.round(performance.now() - t0);
  let nan = 0, out = 0, first = '';
  frames.forEach((px, k) => { for (let i = 0; i < S; i++) { const x = px[i * 4], y = px[i * 4 + 1], z = px[i * 4 + 2];
    if (![x, y, z].every(Number.isFinite)) { nan++; continue; }
    if (!(Math.abs(x) <= 10.001 && Math.abs(z) <= 10.001 && y >= -0.001 && y <= 6.001)) { out++; if (!first) first = `at ${k * 2} s point ${i} is at [${[x, y, z].map((q) => +q.toFixed(2)).join(', ')}]`; } } });
  const ext = [0, 1, 2].map((a) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < S; i++) { const v = frames[0][i * 4 + a]; if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } return hi - lo; });
  let moved = 0; for (let k = 1; k < 4; k++) { let s = 0; for (let i = 0; i < S; i++) for (let a = 0; a < 3; a++) s += Math.abs(frames[k][i * 4 + a] - frames[k - 1][i * 4 + a]); moved = Math.max(moved, s / S); }
  const stats = { ms, nan, out, spread: +Math.max(...ext).toFixed(2), moved: +moved.toFixed(3) };
  let error = '';
  if (nan) error = `pos() returned NaN or infinity for ${nan} of ${S * 4} samples (check divisions, sqrt and pow of negatives)`;
  else if (out) error = `${out} of ${S * 4} sampled points leave the room (|x|,|z| <= 10, 0 <= y <= 6); first: ${first}`;
  else if (stats.spread < 0.5) error = `the cloud is only ${stats.spread} m across at 0 s; it must spread over at least 0.5 m`;
  else if (moved < 0.01) error = 'nothing moves between 0, 2, 4 and 6 s; use t (or env) in pos()';
  return { ok: !error, error, stats };
};

// ---------- the eye height view ----------
function persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; }
function look(e, c) { const sub = (a, b) => a.map((x, i) => x - b[i]); const nor = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = nor(sub(c, e)), s = nor(cr(f, [0, 1, 0])), u = cr(s, f);
  return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, e), -dot(u, e), dot(f, e), 1]; }
function mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; }
const W = 240, H = 180;
const VP = mul(persp((75 * Math.PI) / 180, W / H, 0.1, 60), look([0, 1.7, 9.9], [0, 2.2, 0]));
const lines = []; for (let k = -10; k <= 10; k += 2) lines.push(k, 0, -10, k, 0, 10, -10, 0, k, 10, 0, k);
for (const [x, z] of [[-10, -10], [10, -10]]) lines.push(x, 0, z, x, 6, z);
lines.push(-10, 6, -10, 10, 6, -10);
const lineBuf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, lineBuf); g.bufferData(g.ARRAY_BUFFER, new Float32Array(lines), g.STATIC_DRAW);
const LINE = prog('#version 300 es\nin vec3 a; uniform mat4 VP; void main(){ gl_Position = VP * vec4(a, 1.0); }', '#version 300 es\nprecision highp float; out vec4 o; void main(){ o = vec4(0.22, 0.24, 0.28, 1.0); }');
const PJ = prog('#version 300 es\nin vec3 a; in vec3 col; uniform mat4 VP; uniform float PS, K; out vec3 c; void main(){ gl_Position = VP * vec4(a, 1.0); gl_PointSize = clamp(PS * 6.0 / max(gl_Position.w, 1.0), 1.0, 6.0); c = col * K; }',
  '#version 300 es\nprecision highp float; in vec3 c; out vec4 o; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; o = vec4(c, 1.0); }');
const pBuf = g.createBuffer(), cBuf = g.createBuffer();
function begin() { cv.width = W; cv.height = H; g.bindFramebuffer(g.FRAMEBUFFER, null); g.viewport(0, 0, W, H); g.clearColor(0.05, 0.055, 0.07, 1); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
  g.useProgram(LINE.p); g.uniformMatrix4fv(LINE.u.VP, false, VP); g.bindBuffer(g.ARRAY_BUFFER, lineBuf); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, 0, 0); g.disableVertexAttribArray(1); g.drawArrays(g.LINES, 0, lines.length / 3); }
function strip(draw, label) {
  const s = document.createElement('canvas'); s.width = W * 4; s.height = H + 16; const c = s.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, s.width, s.height);
  [0, 2, 4, 6].forEach((t, k) => { begin(); draw(t); c.drawImage(cv, k * W, 0); c.fillStyle = '#ddd'; c.font = '10px sans-serif'; c.fillText(`t=${t}s ${label ? label(t) : ''}`, k * W + 3, H + 12); });
  return s.toDataURL('image/png');
}
window.drawPointsJson = (j) => strip((t) => {
  const v = boundAt(j, t, trackAt); const { P, C, m } = pointsAt(v, t, 1, true);
  g.useProgram(PJ.p); g.uniformMatrix4fv(PJ.u.VP, false, VP); g.uniform1f(PJ.u.PS, v.pointSize ?? 2); g.uniform1f(PJ.u.K, 1);
  g.bindBuffer(g.ARRAY_BUFFER, pBuf); g.bufferData(g.ARRAY_BUFFER, P, g.DYNAMIC_DRAW); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, 0, 0);
  g.bindBuffer(g.ARRAY_BUFFER, cBuf); g.bufferData(g.ARRAY_BUFFER, C, g.DYNAMIC_DRAW); g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 3, g.FLOAT, false, 0, 0);
  g.drawArrays(g.POINTS, 0, m); g.disableVertexAttribArray(1);
}, (t) => `${pointCount(j.base)} points`);
window.drawPointsFn = (code, count) => {
  const head = '#version 300 es\nprecision highp float;\nuniform mat4 uVP_; uniform float uT_, uE_; out vec3 vC_;\n';
  const r = prog(head + code + '\nvoid main(){ float n = float(COUNT); vec3 q_ = pos(float(gl_VertexID), n, uT_, uE_); gl_Position = uVP_ * vec4(q_, 1.0); gl_PointSize = clamp(12.0 / max(gl_Position.w, 1.0), 1.0, 4.0);'
    + ' float h_ = clamp(q_.y / 6.0, 0.0, 1.0); vC_ = mix(vec3(0.2, 0.45, 1.0), vec3(1.0, 0.95, 0.8), h_) * (0.55 + 0.45 * fract(float(gl_VertexID) * 0.618)); }',
    '#version 300 es\nprecision highp float; in vec3 vC_; out vec4 o; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; o = vec4(vC_, 1.0); }', head.split('\n').length - 1);
  if (r.error) throw new Error(r.error);
  const url = strip((t) => { g.useProgram(r.p); g.uniformMatrix4fv(r.u.uVP_, false, VP); if (r.u.uT_) g.uniform1f(r.u.uT_, t); if (r.u.uE_) g.uniform1f(r.u.uE_, trackAt(t)['audio.envelope']);
    g.disableVertexAttribArray(0); g.drawArrays(g.POINTS, 0, Math.min(count, 200000)); }, () => `${count} points`);
  g.deleteProgram(r.p); return url;
};
return 'points ready';
})();
