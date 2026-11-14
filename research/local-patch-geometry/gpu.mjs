// A headless Chrome over raw CDP (no dependency) that checks an SDF on a 48^3 grid in WebGL2,
// ray marches a passing one, and draws scenes and L-systems with Canvas 2D. Every picture leaves as PNG.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SDF_HELPERS } from './kinds.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const PAGE = String.raw`
const N = 48;
const cv = document.createElement('canvas');
const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
const fext = gl && gl.getExtension('EXT_color_buffer_float');
const VS = '#version 300 es\nin vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
function program(fs, preludeLines) {
  const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, fs);
  if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) {
    const log = (gl.getShaderInfoLog(f) || 'compile failed').replace(/(ERROR: \d+:)(\d+)/g, (m, a, n) => a + Math.max(1, n - preludeLines));
    gl.deleteShader(f); gl.deleteShader(v);
    return { error: 'GLSL compile error (line numbers are in your code): ' + log.trim().split('\n').slice(0, 6).join(' | ') };
  }
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return { error: 'GLSL link error: ' + (gl.getProgramInfoLog(p) || '').trim() };
  return { p };
}
function draw(p, w, h) {
  gl.useProgram(p); gl.viewport(0, 0, w, h);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
const HELPERS = ${JSON.stringify(SDF_HELPERS)};
const head = '#version 300 es\nprecision highp float;\nout vec4 o;\n' + HELPERS + '\n';
const headLines = head.split('\n').length - 1;
const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, N * N, N, 0, gl.RGBA, gl.FLOAT, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
const fbOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

window.info = () => ({ webgl2: !!gl, floatTarget: !!fext && fbOk, renderer: gl.getParameter(gl.RENDERER) });

window.checkSdf = (code) => {
  const t0 = performance.now();
  const fs = head + code + '\nvoid main(){ ivec2 c = ivec2(gl_FragCoord.xy); int x = c.x % ' + N + '; int z = c.x / ' + N + '; int y = c.y;'
    + ' vec3 p = (vec3(float(x), float(y), float(z)) + 0.5) / ' + N + '.0 * 2.0 - 1.0; o = vec4(sdf(p), 0.0, 0.0, 1.0); }';
  const r = program(fs, headLines);
  if (r.error) return { ok: false, error: r.error };
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  draw(r.p, N * N, N);
  const px = new Float32Array(N * N * N * 4);
  gl.readPixels(0, 0, N * N, N, gl.RGBA, gl.FLOAT, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteProgram(r.p);
  const ms = performance.now() - t0;
  const total = N * N * N;
  const inside = new Uint8Array(total); let nIn = 0, nNaN = 0, edgeIn = 0;
  // index = x + z*N + y*N*N (row y, column x + z*N)
  for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const v = px[(y * N * N + z * N + x) * 4];
    const i = x + z * N + y * N * N;
    if (Number.isNaN(v)) nNaN++;
    else if (v < 0) { inside[i] = 1; nIn++; if (x === 0 || y === 0 || z === 0 || x === N - 1 || y === N - 1 || z === N - 1) edgeIn++; }
  }
  // largest 6-connected piece
  const seen = new Uint8Array(total); let best = 0, pieces = 0; const st = new Int32Array(total);
  for (let s = 0; s < total; s++) {
    if (!inside[s] || seen[s]) continue;
    pieces++; let n = 0, top = 0; st[top++] = s; seen[s] = 1;
    while (top) {
      const i = st[--top]; n++;
      const x = i % N, z = ((i / N) | 0) % N, y = (i / (N * N)) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, z > 0 ? i - N : -1, z < N - 1 ? i + N : -1, y > 0 ? i - N * N : -1, y < N - 1 ? i + N * N : -1];
      for (const j of nb) if (j >= 0 && inside[j] && !seen[j]) { seen[j] = 1; st[top++] = j; }
    }
    if (n > best) best = n;
  }
  const frac = nIn / total, main = nIn ? best / nIn : 0;
  const stats = { ms: Math.round(ms), inside: +(frac * 100).toFixed(2), main: +(main * 100).toFixed(1), pieces, nan: nNaN, edgeIn };
  let error = '';
  if (nNaN) error = 'sdf returned NaN at ' + nNaN + ' grid points (check divisions, sqrt and pow of negatives)';
  else if (frac < 0.005) error = 'only ' + stats.inside + ' percent of the 48^3 grid inside -1..1 is inside the solid (sdf < 0); at least 0.5 percent is needed, so the solid is too small, missing, or the sign is wrong';
  else if (frac > 0.6) error = stats.inside + ' percent of the grid is inside the solid; at most 60 percent, so the solid is too big or the sign is inverted (negative must be inside)';
  else if (main < 0.9) error = 'the inside is ' + pieces + ' separate pieces and the largest holds only ' + stats.main + ' percent; it must be one connected solid (largest piece at least 90 percent)';
  else if (ms > 2000) error = 'evaluating the grid took ' + Math.round(ms) + ' ms; at most 2000 ms, so make it cheaper (fewer loop iterations)';
  return { ok: !error, error, stats };
};

window.renderSdf = (code, W, A) => {
  const fs = head + code + ['',
  'vec3 nrm(vec3 p){ vec2 e = vec2(0.002, 0.0); return normalize(vec3(sdf(p+e.xyy)-sdf(p-e.xyy), sdf(p+e.yxy)-sdf(p-e.yxy), sdf(p+e.yyx)-sdf(p-e.yyx))); }',
  'uniform vec2 R; uniform float A;',
  'void main(){',
  '  vec2 uv = (gl_FragCoord.xy * 2.0 - R) / R.y;',
  '  vec3 ro = vec3(2.3 * sin(A), 1.2, 2.3 * cos(A));',
  '  vec3 fw = normalize(-ro), rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))), up = cross(rt, fw);',
  '  vec3 rd = normalize(fw * 1.6 + uv.x * rt + uv.y * up);',
  '  float t = 0.0; bool hit = false;',
  '  for (int i = 0; i < 160; i++) { vec3 p = ro + rd * t; float d = sdf(p); if (d < 0.0008) { hit = true; break; } t += max(d * 0.7, 0.002); if (t > 6.0) break; }',
  '  vec3 col = vec3(0.10, 0.11, 0.13) + 0.05 * uv.y;',
  '  if (hit) { vec3 p = ro + rd * t; vec3 n = nrm(p); vec3 l = normalize(vec3(0.6, 0.9, 0.4)); float dif = max(dot(n, l), 0.0); float amb = 0.5 + 0.5 * n.y;',
  '    col = vec3(0.85, 0.72, 0.55) * (0.25 * amb + 0.85 * dif) + 0.25 * pow(max(dot(reflect(rd, n), l), 0.0), 24.0); }',
  '  o = vec4(pow(col, vec3(0.4545)), 1.0);',
  '}'].join('\n');

  const r = program(fs, headLines);
  if (r.error) return { error: r.error };
  cv.width = W; cv.height = W;
  gl.useProgram(r.p); gl.uniform2f(gl.getUniformLocation(r.p, 'R'), W, W); gl.uniform1f(gl.getUniformLocation(r.p, 'A'), A === undefined ? 0.7 : A);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  draw(r.p, W, W);
  return { png: cv.toDataURL('image/png') };
};

const MAT = { stone: '#9a958c', metal: '#b8c0c8', wood: '#a0703f', glass: '#9fd3e6', water: '#2f6fb0', matte: '#d8d4cc', emissive: '#ffd34d', mirror: '#e8eef4' };
window.renderScene = (j, inst) => {
  const W = 760, H = 380; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#111317'; g.fillRect(0, 0, W, H);
  const S = 17, ox1 = 190, oy1 = 190, ox2 = 570, oy2 = 290; // top view centred left, front view right
  g.strokeStyle = '#555'; g.strokeRect(ox1 - 10 * S, oy1 - 10 * S, 20 * S, 20 * S); g.strokeRect(ox2 - 10 * S, oy2 - 6 * S, 20 * S, 6 * S);
  g.fillStyle = '#888'; g.font = '12px sans-serif'; g.fillText('top (x right, z down)', 10, 14); g.fillText('front (x right, y up)', 390, 14);
  const items = [];
  j.shapes.forEach((s, k) => inst[k].forEach((p) => items.push({ s, p })));
  const col = (s) => s.color || MAT[s.material] || '#ccc';
  const ext = (s) => { let [sx, sy, sz] = s.size; const r = s.rotation || [0, 0, 0];
    if (Math.abs(Math.abs(r[0] % 180) - 90) < 20) [sy, sz] = [sz, sy];
    if (Math.abs(Math.abs(r[2] % 180) - 90) < 20) [sx, sy] = [sy, sx];
    return [sx, sy, sz]; };
  const shapeAt = (s, x, y, w, h, view) => {
    g.fillStyle = col(s); g.strokeStyle = col(s); g.globalAlpha = s.material === 'glass' ? 0.5 : 0.9;
    const round = s.shape === 'sphere' || (view === 'top' && ['cylinder', 'disc', 'torus', 'cone'].includes(s.shape));
    if (s.shape === 'torus' && (view === 'top') === !(s.rotation && Math.abs(s.rotation[0]) > 45)) { g.lineWidth = Math.max(1, Math.min(w, h) * 0.15); g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, 7); g.stroke(); }
    else if (round) { g.beginPath(); g.ellipse(x, y, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, 7); g.fill(); }
    else if (view === 'front' && s.shape === 'cone') { g.beginPath(); g.moveTo(x - w / 2, y + h / 2); g.lineTo(x + w / 2, y + h / 2); g.lineTo(x, y - h / 2); g.fill(); }
    else g.fillRect(x - w / 2, y - h / 2, Math.max(1, w), Math.max(1, h));
    g.globalAlpha = 1;
  };
  items.slice().sort((a, b) => a.p[1] - b.p[1]).forEach(({ s, p }) => { const [sx, , sz] = ext(s); shapeAt(s, ox1 + p[0] * S, oy1 + p[2] * S, sx * S, sz * S, 'top'); });
  items.slice().sort((a, b) => a.p[2] - b.p[2]).forEach(({ s, p }) => { const [sx, sy] = ext(s); shapeAt(s, ox2 + p[0] * S, oy2 - p[1] * S, sx * S, sy * S, 'front'); });
  return c.toDataURL('image/png');
};

window.renderL = (s, angle, taper) => {
  const tp = taper || 1; let len = 1;
  const W = 512; const c = document.createElement('canvas'); c.width = W; c.height = W; const g = c.getContext('2d');
  let x = 0, y = 0, a = Math.PI / 2; const st = []; const seg = []; const da = angle * Math.PI / 180;
  for (const ch of s) {
    if (ch === 'F' || ch === 'G') { const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len; seg.push(x, y, nx, ny); x = nx; y = ny; }
    else if (ch === '+') a += da; else if (ch === '-') a -= da;
    else if (ch === '[') { st.push([x, y, a, len]); len *= tp; } else if (ch === ']') [x, y, a, len] = st.pop();
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < seg.length; i += 2) { x0 = Math.min(x0, seg[i]); x1 = Math.max(x1, seg[i]); y0 = Math.min(y0, seg[i + 1]); y1 = Math.max(y1, seg[i + 1]); }
  const sc = (W - 24) / Math.max(x1 - x0, y1 - y0, 1e-6);
  g.fillStyle = '#111317'; g.fillRect(0, 0, W, W); g.strokeStyle = '#9fe0a0'; g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < seg.length; i += 4) {
    const mx = (W - (x1 - x0) * sc) / 2, my = (W - (y1 - y0) * sc) / 2;
    g.moveTo(mx + (seg[i] - x0) * sc, W - (my + (seg[i + 1] - y0) * sc)); g.lineTo(mx + (seg[i + 2] - x0) * sc, W - (my + (seg[i + 3] - y0) * sc));
  }
  g.stroke();
  return { png: c.toDataURL('image/png'), segments: seg.length / 4 };
};
'ready';
`;

export async function openGpu() {
  const dir = mkdtempSync(join(tmpdir(), 'plg-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--enable-webgl', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
  const kill = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(dir, { recursive: true, force: true }); } catch {} };
  process.on('exit', kill);
  const portFile = join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  let targets = [];
  for (let i = 0; i < 50; i++) { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; await new Promise((r) => setTimeout(r, 100)); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  let chain = Promise.resolve();
  const evalJs = (expr) => (chain = chain.then(async () => {
    const d = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 20000 });
    if (d.result?.exceptionDetails) throw new Error(d.result.exceptionDetails.exception?.description || d.result.exceptionDetails.text);
    return d.result?.result?.value;
  }));
  await evalJs(PAGE);
  const png = (url) => Buffer.from(url.split(',')[1], 'base64');
  return {
    info: () => evalJs('info()'),
    checkSdf: (code) => evalJs(`checkSdf(${JSON.stringify(code)})`),
    renderSdf: async (code, w = 320, a = 0.7) => { const r = await evalJs(`renderSdf(${JSON.stringify(code)}, ${w}, ${a})`); return r.png ? png(r.png) : null; },
    renderScene: async (j, inst) => png(await evalJs(`renderScene(${JSON.stringify(j)}, ${JSON.stringify(inst)})`)),
    renderL: async (s, angle, taper = 1) => { const r = await evalJs(`renderL(${JSON.stringify(s)}, ${angle}, ${taper})`); return { png: png(r.png), segments: r.segments }; },
    evalJs,
    close: () => { try { ws.close(); } catch {} kill(); },
  };
}
