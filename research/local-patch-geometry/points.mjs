// The points kind: animated dotted planes and point clouds, as JSON (points-json) or as one GLSL function
// (points-fn). The evaluator functions are self-contained so the page can run the same source (String(fn)).
import { SIGNALS } from './kinds.mjs';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const inR = (v, lo, hi) => isNum(v) && v >= lo && v <= hi;
const list = (a) => a.join(', ');

// The made-up signal track, the same as views.page.js's.
export function trackAt(t) {
  const fr = (x) => x - Math.floor(x);
  const env = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / 8);
  const since = fr((t - 1.8) / 2) * 2; const on = t < 1.8 ? 0 : Math.exp(-since * 4);
  const beat = Math.exp(-fr(t) * 6);
  return { 'audio.envelope': env, 'audio.low': Math.min(1, 0.7 * env + 0.3 * on), 'audio.mid': env * (0.5 + 0.5 * Math.sin(t * 2.1)),
    'audio.high': Math.min(1, 0.7 * on + 0.15 * fr(Math.sin(t * 91.3) * 43758)), 'audio.onset': on, 'clock.phase': fr(t / 4), 'clock.beat': beat,
    'hand.left.x': 0.5 + 0.5 * Math.sin(t * 0.8), 'hand.right.y': 0.5 + 0.5 * Math.cos(t * 0.6) };
}

/** The answer with every bound field followed (attack, release) from 0 to t on the track, at 30 fps. */
export function boundAt(j, t, track) {
  const v = JSON.parse(JSON.stringify(j));
  const bs = j.bindings || []; const follow = bs.map(() => null);
  const set = (o, path, x) => { const ks = path.replace(/\[(\d+)\]/g, '.$1').split('.'); let c = o; for (const k of ks.slice(0, -1)) c = c[k]; c[ks.at(-1)] = x; };
  const steps = Math.round(t * 30);
  for (let f = 0; f <= steps; f++) {
    const s = track(f / 30);
    bs.forEach((b, k) => {
      const x = b.range[0] + (b.range[1] - b.range[0]) * (s[b.signal] ?? 0);
      if (follow[k] === null) follow[k] = x;
      const tau = Math.max(1, x > follow[k] ? b.attack : b.release) / 1000;
      follow[k] += (x - follow[k]) * (1 - Math.exp(-(1 / 30) / tau));
    });
  }
  bs.forEach((b, k) => set(v, b.field, follow[k]));
  return v;
}

/** How many points the base makes. */
export function pointCount(b) {
  if (b.type === 'plane') return (Math.floor(b.size[0] / b.spacing) + 1) * (Math.floor(b.size[1] / b.spacing) + 1);
  if (b.type === 'grid3d') return b.n[0] * b.n[1] * b.n[2];
  return b.count;
}

/** Positions (and colours when withColor) of every point, or of `every`-th point, at time t. v is boundAt(j, t). */
export function pointsAt(v, t, every, withColor) {
  const b = v.base; const n = pointCount(b); const c = v.center || [0, 2, 0];
  const step = every || 1; const m = Math.ceil(n / step);
  const P = new Float32Array(m * 3); const C = withColor ? new Float32Array(m * 3) : null;
  const fr = (x) => x - Math.floor(x);
  const h = (x) => fr(Math.sin(x * 12.9898) * 43758.5453);
  const nz = (x, y, z) => (Math.sin(x * 1.7 + Math.cos(y * 1.3)) * Math.cos(z * 1.1 + Math.sin(x * 0.9)) + Math.sin(y * 2.1 + z * 0.7)) * 0.5;
  const pal = { fire: [[0.1, 0, 0], [1, 0.3, 0], [1, 0.9, 0.3]], ice: [[0.1, 0.2, 0.5], [0.4, 0.8, 1], [1, 1, 1]], ocean: [[0, 0.1, 0.3], [0, 0.5, 0.7], [0.5, 1, 0.9]],
    forest: [[0.05, 0.2, 0.05], [0.2, 0.6, 0.2], [0.8, 0.9, 0.4]], neon: [[1, 0, 0.8], [0, 1, 1], [1, 1, 0]], sunset: [[0.3, 0, 0.4], [1, 0.3, 0.3], [1, 0.8, 0.3]],
    mono: [[0.3, 0.3, 0.3], [0.7, 0.7, 0.7], [1, 1, 1]] };
  const grad = (name, x) => {
    x = Math.min(1, Math.max(0, x));
    if (name === 'rainbow') { const k = [5, 3, 1].map((o) => Math.max(0, Math.min(1, Math.abs(((x * 6 + o) % 6) - 3) - 1))); return k; }
    const g = pal[name] || pal.mono; const s = x * 2; const i = Math.min(1, Math.floor(s)); const f = s - i;
    return [0, 1, 2].map((k) => g[i][k] + (g[i + 1][k] - g[i][k]) * f);
  };
  const spin = ((v.spin || 0) * Math.PI / 180) * t;
  for (let q = 0, i = 0; i < n; i += step, q++) {
    let x = 0, y = 0, z = 0;
    if (b.type === 'plane') { const nx = Math.floor(b.size[0] / b.spacing) + 1; const a = i % nx, k = Math.floor(i / nx); x = -b.size[0] / 2 + a * b.spacing; z = -b.size[1] / 2 + k * b.spacing; }
    else if (b.type === 'grid3d') { const [nx, ny] = b.n; const a = i % nx, e = Math.floor(i / nx) % ny, k = Math.floor(i / (nx * ny)); x = (a - (nx - 1) / 2) * b.spacing; y = (e - (b.n[1] - 1) / 2) * b.spacing; z = (k - (b.n[2] - 1) / 2) * b.spacing; }
    else if (b.type === 'sphere') { const yy = 1 - (2 * (i + 0.5)) / n; const r = Math.sqrt(1 - yy * yy); const a = i * 2.39996; x = Math.cos(a) * r * b.radius; y = yy * b.radius; z = Math.sin(a) * r * b.radius; }
    else if (b.type === 'torus') { const u = 2 * Math.PI * (i / n), w = 2 * Math.PI * fr(i * 0.618034); const rr = b.R + b.r * Math.cos(w); x = Math.cos(u) * rr; y = b.r * Math.sin(w); z = Math.sin(u) * rr; }
    else if (b.type === 'spiral') { const s = i / n; const arms = b.arms || 1; const a = 2 * Math.PI * (b.turns * s + (i % arms) / arms); const r = (b.radius ?? 3) * s; x = Math.cos(a) * r; z = Math.sin(a) * r; y = (b.height || 0) * (s - 0.5); }
    else if (b.type === 'cloud') { x = (h(i + 0.1) - 0.5) * b.spread[0]; y = (h(i + 0.2) - 0.5) * b.spread[1]; z = (h(i + 0.3) - 0.5) * b.spread[2]; }
    else if (b.type === 'lissajous') { const s = 2 * Math.PI * (i / n); const sz = b.size ?? 2; x = sz * Math.sin(b.a * s + Math.PI / 2); y = sz * Math.sin(b.b * s); z = sz * Math.sin(b.c * s); }
    for (const d of v.displace || []) {
      const T = (d.speed || 0) * t;
      if (d.type === 'noise') { const f = d.freq; x += d.amp * nz(x * f + T, y * f, z * f); y += d.amp * nz(y * f + 3.1, z * f + T, x * f); z += d.amp * nz(z * f + 7.3, x * f, y * f + T); }
      else if (d.type === 'wave') { const ax = d.dir || 'x'; const u = ax.endsWith('x') ? x : z; const sg = ax.startsWith('-') ? -1 : 1; y += d.amp * Math.sin(d.freq * u * sg - T); }
      else if (d.type === 'ripple') { const [cx, cz] = d.center || [0, 0]; const r = Math.hypot(x - cx, z - cz); y += d.amp * Math.sin(d.freq * r - T); }
      else if (d.type === 'twist') { const a = ((d.amount * y + (d.speed || 0) * t) * Math.PI) / 180; const cs = Math.cos(a), sn = Math.sin(a); [x, z] = [x * cs - z * sn, x * sn + z * cs]; }
      else if (d.type === 'pulse') { const k = 1 + d.amp * Math.sin(2 * Math.PI * (d.speed ?? 1) * t); x *= k; y *= k; z *= k; }
    }
    if (spin) { const cs = Math.cos(spin), sn = Math.sin(spin); [x, z] = [x * cs - z * sn, x * sn + z * cs]; }
    P[q * 3] = c[0] + x; P[q * 3 + 1] = c[1] + y; P[q * 3 + 2] = c[2] + z;
    if (C) {
      const col = v.color || {}; const by = col.by || 'height';
      const u = by === 'height' ? (c[1] + y) / 6 : by === 'distance' ? Math.hypot(x, y, z) / 6 : by === 'index' ? i / n : fr(t / 8 + i / n * 0.2);
      let rgb = grad(col.palette || 'ice', u);
      const sat = col.saturation ?? 1, val = col.value ?? 1; const mx = Math.max(...rgb);
      rgb = rgb.map((k) => (mx + (k - mx) * sat) * val);
      C[q * 3] = rgb[0]; C[q * 3 + 1] = rgb[1]; C[q * 3 + 2] = rgb[2];
    }
  }
  return { P, C, n, m };
}

// ---------- points-json ----------
export const BASES = { plane: ['size', 'spacing'], grid3d: ['n', 'spacing'], sphere: ['radius', 'count'], torus: ['R', 'r', 'count'],
  spiral: ['turns', 'count', 'radius', 'height', 'arms'], cloud: ['count', 'spread'], lissajous: ['a', 'b', 'c', 'count', 'size'] };
export const DISPLACE = { noise: ['freq', 'amp', 'speed'], wave: ['dir', 'freq', 'amp', 'speed'], ripple: ['center', 'freq', 'amp', 'speed'], twist: ['amount', 'speed'], pulse: ['amp', 'speed'] };
export const PALETTES = ['fire', 'ice', 'ocean', 'forest', 'neon', 'sunset', 'mono', 'rainbow'];
const FIELD_RANGE = { amp: [0, 5], freq: [0, 20], speed: [-20, 20], amount: [-360, 360], saturation: [0, 1], value: [0, 1], pointSize: [1, 8], spin: [-360, 360], radius: [0.05, 10], R: [0.05, 10], r: [0.01, 5], size: [0.05, 10] };

export const POINTS_JSON_SYSTEM = `You write an animated point cloud for a device that builds it itself and plays it to music. Answer with ONE JSON object and nothing else.
The room is 20 m by 20 m and 6 m high: x and z from -10 to 10, y from 0 (floor) to 6 (ceiling). y is up, +z is toward the viewer. Units are metres, times seconds.
Shape:
{
  "base": one of
    {"type":"plane","size":[sx,sz],"spacing":s} (a flat sheet of dots) | {"type":"grid3d","n":[nx,ny,nz],"spacing":s} | {"type":"sphere","radius":r,"count":n} (on the surface) |
    {"type":"torus","R":ring radius,"r":tube radius,"count":n} (lying flat) | {"type":"spiral","turns":t,"count":n,"radius":r,"height":h,"arms":1..8} | {"type":"cloud","count":n,"spread":[sx,sy,sz]} (random in a box) |
    {"type":"lissajous","a":int,"b":int,"c":int,"count":n,"size":s} (a curve, a:b:c are its frequencies in x, y, z),
  "center": [x,y,z] where the base sits (default [0,2,0]),
  "displace": list, applied in order, each one of {"type":"noise","freq":f,"amp":metres,"speed":s} | {"type":"wave","dir":"x"|"z"|"-x"|"-z","freq":f,"amp":metres,"speed":s} (travels along dir) | {"type":"ripple","center":[x,z],"freq":f,"amp":metres,"speed":s} (rings moving out) | {"type":"twist","amount":degrees per metre of height,"speed":degrees per second} | {"type":"pulse","amp":0..1,"speed":times per second} (grows and shrinks),
  "spin": degrees per second around the vertical axis (optional),
  "color": {"by":"height"|"distance"|"index"|"time","palette":one of ${list(PALETTES)},"saturation":0..1,"value":0..1},
  "pointSize": pixels 1..8,
  "bindings": list of {"signal": one of ${list(SIGNALS)}, "field": a numeric field like "displace[0].amp", "color.value", "pointSize", "spin" or "base.radius", "range":[lo,hi], "attack": ms 0..5000, "release": ms 0..10000}
}
Caps: at most 200000 points; every point must stay inside the room; it must move (a displacement with speed, a spin, a pulse or a binding). No other keys.
audio.onset is a drum hit (a kick), audio.low is bass, audio.high is high hats, clock.beat pulses each beat.
Example: {"base":{"type":"plane","size":[12,12],"spacing":0.2},"center":[0,1,0],"displace":[{"type":"ripple","center":[0,0],"freq":2,"amp":0.3,"speed":3}],"color":{"by":"height","palette":"ocean","saturation":0.8,"value":0.9},"pointSize":2,"bindings":[{"signal":"audio.low","field":"displace[0].amp","range":[0.1,0.8],"attack":20,"release":400}]}`;

function fieldRange(path) {
  const m = /^(displace\[(\d+)\]\.(amp|freq|speed|amount)|color\.(saturation|value)|pointSize|spin|base\.(radius|R|r|size))$/.exec(path || '');
  if (!m) return null;
  const leaf = m[3] || m[4] || m[5] || path;
  return { idx: m[2] !== undefined ? Number(m[2]) : null, range: FIELD_RANGE[leaf] };
}

export function validatePointsJson(j) {
  const e = [];
  if (!j || typeof j !== 'object' || Array.isArray(j)) return ['the answer is not a JSON object'];
  const top = ['base', 'center', 'displace', 'spin', 'color', 'pointSize', 'bindings'];
  for (const k of Object.keys(j)) if (!top.includes(k)) e.push(`unknown key "${k}" (allowed: ${list(top)})`);
  const b = j.base;
  if (!b || typeof b !== 'object' || !BASES[b.type]) return [...e, `base must be an object with "type" one of ${list(Object.keys(BASES))}, got ${JSON.stringify(b?.type ?? b)}`];
  for (const k of Object.keys(b)) if (k !== 'type' && !BASES[b.type].includes(k)) e.push(`base (${b.type}) has unknown key "${k}" (allowed: ${list(BASES[b.type])})`);
  const need = (k, lo, hi, int) => { if (!(int ? isInt(b[k]) : isNum(b[k])) || b[k] < lo || b[k] > hi) e.push(`base.${k} must be ${int ? 'an integer' : 'a number'} ${lo}..${hi}, got ${JSON.stringify(b[k])}`); };
  if (b.type === 'plane') { if (!(Array.isArray(b.size) && b.size.length === 2 && b.size.every((x) => inR(x, 0.1, 20)))) e.push(`base.size must be [sx, sz] each 0.1..20, got ${JSON.stringify(b.size)}`); need('spacing', 0.01, 5); }
  if (b.type === 'grid3d') { if (!(Array.isArray(b.n) && b.n.length === 3 && b.n.every((x) => isInt(x) && x >= 1 && x <= 200))) e.push(`base.n must be [nx, ny, nz] integers 1..200, got ${JSON.stringify(b.n)}`); need('spacing', 0.01, 5); }
  if (['sphere', 'torus', 'spiral', 'cloud', 'lissajous'].includes(b.type)) need('count', 1, 200000, true);
  if (b.type === 'sphere') need('radius', 0.05, 10);
  if (b.type === 'torus') { need('R', 0.05, 10); need('r', 0.01, 5); }
  if (b.type === 'spiral') { need('turns', 0.1, 50); if (b.radius !== undefined) need('radius', 0.05, 10); if (b.height !== undefined) need('height', -6, 6); if (b.arms !== undefined) need('arms', 1, 8, true); }
  if (b.type === 'cloud') { if (!(Array.isArray(b.spread) && b.spread.length === 3 && b.spread.every((x) => inR(x, 0, 20)))) e.push(`base.spread must be [sx, sy, sz] each 0..20, got ${JSON.stringify(b.spread)}`); }
  if (b.type === 'lissajous') { for (const k of ['a', 'b', 'c']) need(k, 0, 12, true); if (b.size !== undefined) need('size', 0.05, 10); }
  if (j.center !== undefined && !(Array.isArray(j.center) && j.center.length === 3 && j.center.every(isNum))) e.push(`center must be [x, y, z], got ${JSON.stringify(j.center)}`);
  const ds = j.displace ?? [];
  if (!Array.isArray(ds)) e.push('displace must be a list');
  else {
    if (ds.length > 6) e.push(`at most 6 displacements, got ${ds.length}`);
    ds.forEach((d, i) => {
      const at = `displace[${i}]`;
      if (!d || !DISPLACE[d.type]) { e.push(`${at}.type must be one of ${list(Object.keys(DISPLACE))}, got ${JSON.stringify(d?.type)}`); return; }
      for (const k of Object.keys(d)) if (k !== 'type' && !DISPLACE[d.type].includes(k)) e.push(`${at} (${d.type}) has unknown key "${k}" (allowed: ${list(DISPLACE[d.type])})`);
      for (const k of DISPLACE[d.type]) {
        if (k === 'dir') { if (d.dir !== undefined && !['x', 'z', '-x', '-z'].includes(d.dir)) e.push(`${at}.dir must be "x", "z", "-x" or "-z"`); continue; }
        if (k === 'center') { if (d.center !== undefined && !(Array.isArray(d.center) && d.center.length === 2 && d.center.every(isNum))) e.push(`${at}.center must be [x, z]`); continue; }
        if (d[k] === undefined && (k === 'speed')) continue;
        const r = FIELD_RANGE[k]; if (!inR(d[k], r[0], r[1])) e.push(`${at}.${k} must be a number ${r[0]}..${r[1]}, got ${JSON.stringify(d[k])}`);
      }
    });
  }
  if (j.spin !== undefined && !inR(j.spin, -360, 360)) e.push(`spin must be degrees per second -360..360, got ${JSON.stringify(j.spin)}`);
  const c = j.color;
  if (c !== undefined) {
    if (!c || typeof c !== 'object') e.push('color must be an object');
    else {
      for (const k of Object.keys(c)) if (!['by', 'palette', 'saturation', 'value'].includes(k)) e.push(`color has unknown key "${k}"`);
      if (c.by !== undefined && !['height', 'distance', 'index', 'time'].includes(c.by)) e.push(`color.by must be height, distance, index or time, got ${JSON.stringify(c.by)}`);
      if (c.palette !== undefined && !PALETTES.includes(c.palette)) e.push(`color.palette must be one of ${list(PALETTES)}, got ${JSON.stringify(c.palette)}`);
      for (const k of ['saturation', 'value']) if (c[k] !== undefined && !inR(c[k], 0, 1)) e.push(`color.${k} must be 0..1, got ${JSON.stringify(c[k])}`);
    }
  }
  if (j.pointSize !== undefined && !inR(j.pointSize, 1, 8)) e.push(`pointSize must be 1..8, got ${JSON.stringify(j.pointSize)}`);
  const bs = j.bindings ?? [];
  if (!Array.isArray(bs)) e.push('bindings must be a list');
  else bs.forEach((x, i) => {
    const at = `bindings[${i}]`;
    if (!x || typeof x !== 'object') { e.push(`${at} is not an object`); return; }
    for (const k of Object.keys(x)) if (!['signal', 'field', 'range', 'attack', 'release'].includes(k)) e.push(`${at} has unknown key "${k}"`);
    if (!SIGNALS.includes(x.signal)) e.push(`${at}.signal must be one of ${list(SIGNALS)}, got ${JSON.stringify(x.signal)}`);
    const f = fieldRange(x.field);
    if (!f) e.push(`${at}.field must be one of displace[k].amp|freq|speed|amount, color.saturation, color.value, pointSize, spin, base.radius|R|r|size, got ${JSON.stringify(x.field)}`);
    else {
      if (f.idx !== null && !(Array.isArray(ds) && ds[f.idx])) e.push(`${at}.field ${x.field} points at a displacement that does not exist`);
      if (/^base\./.test(x.field) && b[x.field.slice(5)] === undefined) e.push(`${at}.field ${x.field}: the base has no ${x.field.slice(5)}`);
      if (!(Array.isArray(x.range) && x.range.length === 2 && x.range.every((v) => inR(v, f.range[0], f.range[1])))) e.push(`${at}.range must be [lo, hi] each ${f.range[0]}..${f.range[1]} for ${x.field}, got ${JSON.stringify(x.range)}`);
    }
    if (!inR(x.attack, 0, 5000)) e.push(`${at}.attack must be ms 0..5000`);
    if (!inR(x.release, 0, 10000)) e.push(`${at}.release must be ms 0..10000`);
  });
  if (e.length) return e;
  const n = pointCount(b);
  if (n > 200000) return [`the base makes ${n} points; at most 200000`];
  // play it: inside the room, not collapsed, and moving, at 0, 2, 4 and 6 s
  const every = Math.max(1, Math.floor(n / 4000));
  const frames = [0, 2, 4, 6].map((t) => pointsAt(boundAt(j, t, trackAt), t, every).P);
  let out = 0, first = '';
  frames.forEach((P, k) => { for (let i = 0; i < P.length; i += 3) { const [x, y, z] = [P[i], P[i + 1], P[i + 2]]; if (!(Math.abs(x) <= 10.001 && Math.abs(z) <= 10.001 && y >= -0.001 && y <= 6.001)) { out++; if (!first) first = `at ${k * 2} s a point is at [${[x, y, z].map((q) => +q.toFixed(2)).join(', ')}]`; } } });
  if (out) return [`points leave the room (|x|,|z| <= 10, 0 <= y <= 6): ${first}; move the center or make it smaller`];
  const P0 = frames[0]; const ext = [0, 1, 2].map((a) => { let lo = Infinity, hi = -Infinity; for (let i = a; i < P0.length; i += 3) { lo = Math.min(lo, P0[i]); hi = Math.max(hi, P0[i]); } return hi - lo; });
  if (Math.max(...ext) < 0.5) return [`the cloud is only ${Math.max(...ext).toFixed(2)} m across; it must spread over at least 0.5 m`];
  let moved = 0; for (let k = 1; k < 4; k++) { let s = 0; for (let i = 0; i < P0.length; i++) s += Math.abs(frames[k][i] - frames[k - 1][i]); moved = Math.max(moved, s / (P0.length / 3)); }
  if (moved < 0.01) return ['nothing moves between 0, 2, 4 and 6 s; add a displacement with speed, a spin, a pulse or a binding'];
  return [];
}

// ---------- points-fn ----------
export const POINTS_FN_SYSTEM = `You write the motion of an animated point cloud in GLSL ES 3.00, for a device that runs it in a vertex shader over every point and plays it to music.
Write two things:
1. \`const int COUNT = <number of points>;\` (1..200000)
2. the function \`vec3 pos(float i, float n, float t, float env)\`: i is the point's index 0..n-1, n is COUNT as a float, t is time in seconds, env is the music's loudness 0..1. It returns the point's position in metres.
The room is 20 m by 20 m and 6 m high: x and z from -10 to 10, y from 0 (floor) to 6 (ceiling). y is up, +z is toward the viewer. Every point must stay inside the room, the cloud must spread over at least 0.5 m, and it must move over time.
You may write helper functions above pos. Rules: no uniforms, no textures, no #version or precision lines, no main(). No while or do loops; a for loop must have literal integer bounds of at most 64. Use float literals with a dot (1.0, not 1). For a random number per point use fract(sin(i * 12.9898) * 43758.5453).
Answer with the GLSL code only, no explanation.
Example:
const int COUNT = 40000;
vec3 pos(float i, float n, float t, float env) {
  float side = 200.0;
  float x = mod(i, side) / side * 12.0 - 6.0;
  float z = floor(i / side) / side * 12.0 - 6.0;
  float y = 1.0 + 0.3 * sin(length(vec2(x, z)) * 2.0 - t * 3.0) * (0.3 + env);
  return vec3(x, y, z);
}`;

export function pointsFnStatic(code) {
  const e = [];
  const src = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\bwhile\b/.test(src)) e.push('`while` (and do-while) loops are not allowed; use a for loop with literal bounds <= 64');
  if (/\buniform\b|\btexture\w*\s*\(|#\s*version|\bvoid\s+main\b|\bprecision\b/.test(src)) e.push('no uniforms, textures, #version, precision or main(); write only COUNT, helpers and pos()');
  if (!/\bvec3\s+pos\s*\(\s*(in\s+)?float\s+\w+\s*,\s*(in\s+)?float\s+\w+\s*,\s*(in\s+)?float\s+\w+\s*,\s*(in\s+)?float\s+\w+\s*\)/.test(src)) e.push('there must be a function `vec3 pos(float i, float n, float t, float env)`');
  const m = /\bconst\s+int\s+COUNT\s*=\s*(\d+)\s*;/.exec(src);
  if (!m) e.push('there must be a line `const int COUNT = <number>;`');
  else if (Number(m[1]) < 1 || Number(m[1]) > 200000) e.push(`COUNT must be 1..200000, got ${m[1]}`);
  for (const f of src.matchAll(/\bfor\s*\(([^;]*);([^;]*);([^)]*)\)/g)) {
    const init = /^\s*int\s+(\w+)\s*=\s*(-?\d+)\s*$/.exec(f[1]); const cond = /^\s*(\w+)\s*(<|<=|>|>=)\s*(-?\d+)\s*$/.exec(f[2]);
    if (!init || !cond || cond[1] !== init[1]) { e.push(`for loop "for (${f[1].trim()}; ${f[2].trim()}; ${f[3].trim()})" needs a literal bound, like for (int i = 0; i < 8; i++)`); continue; }
    if (Math.abs(Number(cond[3]) - Number(init[2])) > 64) e.push('a for loop runs more than 64 times');
  }
  return { errors: e, count: m ? Number(m[1]) : 0 };
}

let pageLoaded = null;
export async function loadPointsPage(gpu) {
  if (!pageLoaded) {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./points.page.js', import.meta.url), 'utf8')
      .replace('__TRACK__', String(trackAt)).replace('__BOUND__', String(boundAt)).replace('__COUNT__', String(pointCount)).replace('__POINTS__', String(pointsAt));
    pageLoaded = gpu.evalJs(src);
  }
  return pageLoaded;
}

/** points-fn: static rules, then compile and sample 4096 points at 0, 2, 4, 6 s in WebGL2. */
export async function checkPointsFn(gpu, code) {
  const s = pointsFnStatic(code);
  if (s.errors.length) return { error: s.errors.join('; ') };
  await loadPointsPage(gpu);
  const env = [0, 2, 4, 6].map((t) => trackAt(t)['audio.envelope']);
  const r = await gpu.evalJs(`checkPointsFn(${JSON.stringify(code)}, ${s.count}, ${JSON.stringify(env)})`);
  return r.ok ? { ok: true, value: code, stats: r.stats } : { error: r.error, stats: r.stats };
}

import { KINDS } from './kinds.mjs';
Object.assign(KINDS, {
  'points-json': { system: POINTS_JSON_SYSTEM, validate: validatePointsJson, json: true, wishes: 'points' },
  'points-fn': { system: POINTS_FN_SYSTEM, json: false, check: checkPointsFn, wishes: 'points' },
});
