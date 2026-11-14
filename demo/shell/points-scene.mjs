// demo/shell/points-scene.mjs: the point scene document (points-json), its validator, six examples and
// the signals that drive its bindings. No DOM and no GL, so node can grade it.
// The format is the one research/local-patch-geometry/points.mjs hands a model; this copy is the page's.
// Units are metres and seconds; the room is x and z in -10..10, y in 0..6, +z toward the viewer.

export const MAX_POINTS = 200000;
export const SIGNALS = ['audio.envelope', 'audio.low', 'audio.mid', 'audio.high', 'audio.onset',
  'clock.phase', 'clock.beat', 'hand.left.x', 'hand.right.y'];
export const BASES = { plane: ['size', 'spacing'], grid3d: ['n', 'spacing'], sphere: ['radius', 'count'],
  torus: ['R', 'r', 'count'], spiral: ['turns', 'count', 'radius', 'height', 'arms'], cloud: ['count', 'spread'],
  lissajous: ['a', 'b', 'c', 'count', 'size'] };
export const DISPLACE = { noise: ['freq', 'amp', 'speed'], wave: ['dir', 'freq', 'amp', 'speed'],
  ripple: ['center', 'freq', 'amp', 'speed'], twist: ['amount', 'speed'], pulse: ['amp', 'speed'] };
export const PALETTES = ['fire', 'ice', 'ocean', 'forest', 'neon', 'sunset', 'mono', 'rainbow'];
export const PALETTE_RGB = {
  fire: [[0.1, 0, 0], [1, 0.3, 0], [1, 0.9, 0.3]], ice: [[0.1, 0.2, 0.5], [0.4, 0.8, 1], [1, 1, 1]],
  ocean: [[0, 0.1, 0.3], [0, 0.5, 0.7], [0.5, 1, 0.9]], forest: [[0.05, 0.2, 0.05], [0.2, 0.6, 0.2], [0.8, 0.9, 0.4]],
  neon: [[1, 0, 0.8], [0, 1, 1], [1, 1, 0]], sunset: [[0.3, 0, 0.4], [1, 0.3, 0.3], [1, 0.8, 0.3]],
  mono: [[0.3, 0.3, 0.3], [0.7, 0.7, 0.7], [1, 1, 1]],
};
const FIELD_RANGE = { amp: [0, 5], freq: [0, 20], speed: [-20, 20], amount: [-360, 360], saturation: [0, 1],
  value: [0, 1], pointSize: [1, 8], spin: [-360, 360], radius: [0.05, 10], R: [0.05, 10], r: [0.01, 5], size: [0.05, 10] };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const inR = (v, lo, hi) => isNum(v) && v >= lo && v <= hi;
const list = (a) => a.join(', ');
const fr = (x) => x - Math.floor(x);

/** The made-up track: an 8 s swell, an onset every 2 s, a 60 BPM clock, hands drifting. */
export function trackAt(t) {
  const env = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / 8);
  const since = fr((t - 1.8) / 2) * 2; const on = t < 1.8 ? 0 : Math.exp(-since * 4);
  const beat = Math.exp(-fr(t) * 6);
  return { 'audio.envelope': env, 'audio.low': Math.min(1, 0.7 * env + 0.3 * on),
    'audio.mid': env * (0.5 + 0.5 * Math.sin(t * 2.1)),
    'audio.high': Math.min(1, 0.7 * on + 0.15 * fr(Math.sin(t * 91.3) * 43758)), 'audio.onset': on,
    'clock.phase': fr(t / 4), 'clock.beat': beat,
    'hand.left.x': 0.5 + 0.5 * Math.sin(t * 0.8), 'hand.right.y': 0.5 + 0.5 * Math.cos(t * 0.6) };
}

/** How many points the base makes. */
export function pointCount(b) {
  if (b.type === 'plane') return (Math.floor(b.size[0] / b.spacing) + 1) * (Math.floor(b.size[1] / b.spacing) + 1);
  if (b.type === 'grid3d') return b.n[0] * b.n[1] * b.n[2];
  return b.count;
}

const setPath = (o, path, x) => {
  const ks = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let c = o;
  for (const k of ks.slice(0, -1)) c = c[k];
  c[ks.at(-1)] = x;
};

/**
 * Bindings followed with attack and release: `step(signals, dt)` moves every follower one frame and
 * writes the bound fields into `values` (path -> number). One pole each, the time constant in ms.
 */
export function createFollowers(bindings = []) {
  const follow = bindings.map(() => null);
  const values = {};
  return {
    values,
    step(sig, dt) {
      bindings.forEach((b, k) => {
        const x = b.range[0] + (b.range[1] - b.range[0]) * Math.min(1, Math.max(0, sig[b.signal] ?? 0));
        if (follow[k] === null) follow[k] = x;
        const tau = Math.max(1, x > follow[k] ? b.attack : b.release) / 1000;
        follow[k] += (x - follow[k]) * (1 - Math.exp(-Math.max(0, dt) / tau));
        values[b.field] = follow[k];
      });
      return values;
    },
  };
}

/** The scene with every bound field followed from 0 to t on a track, at 30 fps. For the validator. */
export function boundAt(j, t, track = trackAt) {
  const v = JSON.parse(JSON.stringify(j));
  const f = createFollowers(j.bindings || []);
  const steps = Math.round(t * 30);
  for (let i = 0; i <= steps; i++) f.step(track(i / 30), i ? 1 / 30 : 0);
  for (const [p, x] of Object.entries(f.values)) setPath(v, p, x);
  return v;
}

/**
 * Every `every`-th point at time t, on the CPU. The validator's reference only: the page draws in the
 * vertex shader (points-gl.mjs), which follows the same formulas.
 */
export function pointsAt(v, t, every = 1) {
  const b = v.base; const n = pointCount(b); const c = v.center || [0, 2, 0];
  const m = Math.ceil(n / every);
  const P = new Float32Array(m * 3);
  const h = (x) => fr(Math.sin(x * 12.9898) * 43758.5453);
  const nz = (x, y, z) => (Math.sin(x * 1.7 + Math.cos(y * 1.3)) * Math.cos(z * 1.1 + Math.sin(x * 0.9))
    + Math.sin(y * 2.1 + z * 0.7)) * 0.5;
  const spin = ((v.spin || 0) * Math.PI / 180) * t;
  for (let q = 0, i = 0; i < n; i += every, q++) {
    let x = 0, y = 0, z = 0;
    if (b.type === 'plane') {
      const nx = Math.floor(b.size[0] / b.spacing) + 1; const a = i % nx, k = Math.floor(i / nx);
      x = -b.size[0] / 2 + a * b.spacing; z = -b.size[1] / 2 + k * b.spacing;
    } else if (b.type === 'grid3d') {
      const [nx, ny] = b.n; const a = i % nx, e = Math.floor(i / nx) % ny, k = Math.floor(i / (nx * ny));
      x = (a - (nx - 1) / 2) * b.spacing; y = (e - (ny - 1) / 2) * b.spacing; z = (k - (b.n[2] - 1) / 2) * b.spacing;
    } else if (b.type === 'sphere') {
      const yy = 1 - (2 * (i + 0.5)) / n; const r = Math.sqrt(1 - yy * yy); const a = i * 2.39996;
      x = Math.cos(a) * r * b.radius; y = yy * b.radius; z = Math.sin(a) * r * b.radius;
    } else if (b.type === 'torus') {
      const u = 2 * Math.PI * (i / n), w = 2 * Math.PI * fr(i * 0.618034); const rr = b.R + b.r * Math.cos(w);
      x = Math.cos(u) * rr; y = b.r * Math.sin(w); z = Math.sin(u) * rr;
    } else if (b.type === 'spiral') {
      const s = i / n; const arms = b.arms || 1; const a = 2 * Math.PI * (b.turns * s + (i % arms) / arms);
      const r = (b.radius ?? 3) * s; x = Math.cos(a) * r; z = Math.sin(a) * r; y = (b.height || 0) * (s - 0.5);
    } else if (b.type === 'cloud') {
      x = (h(i + 0.1) - 0.5) * b.spread[0]; y = (h(i + 0.2) - 0.5) * b.spread[1]; z = (h(i + 0.3) - 0.5) * b.spread[2];
    } else if (b.type === 'lissajous') {
      const s = 2 * Math.PI * (i / n); const sz = b.size ?? 2;
      x = sz * Math.sin(b.a * s + Math.PI / 2); y = sz * Math.sin(b.b * s); z = sz * Math.sin(b.c * s);
    }
    for (const d of v.displace || []) {
      const T = (d.speed || 0) * t;
      if (d.type === 'noise') {
        // Sequential, as the model test's copy: y reads the moved x, z the moved x and y.
        const f = d.freq;
        x += d.amp * nz(x * f + T, y * f, z * f); y += d.amp * nz(y * f + 3.1, z * f + T, x * f);
        z += d.amp * nz(z * f + 7.3, x * f, y * f + T);
      } else if (d.type === 'wave') {
        const ax = d.dir || 'x'; const u = ax.endsWith('x') ? x : z; const sg = ax.startsWith('-') ? -1 : 1;
        y += d.amp * Math.sin(d.freq * u * sg - T);
      } else if (d.type === 'ripple') {
        const [cx, cz] = d.center || [0, 0]; y += d.amp * Math.sin(d.freq * Math.hypot(x - cx, z - cz) - T);
      } else if (d.type === 'twist') {
        const a = ((d.amount * y + (d.speed || 0) * t) * Math.PI) / 180; const cs = Math.cos(a), sn = Math.sin(a);
        [x, z] = [x * cs - z * sn, x * sn + z * cs];
      } else if (d.type === 'pulse') {
        const k = 1 + d.amp * Math.sin(2 * Math.PI * (d.speed ?? 1) * t); x *= k; y *= k; z *= k;
      }
    }
    if (spin) { const cs = Math.cos(spin), sn = Math.sin(spin); [x, z] = [x * cs - z * sn, x * sn + z * cs]; }
    P[q * 3] = c[0] + x; P[q * 3 + 1] = c[1] + y; P[q * 3 + 2] = c[2] + z;
  }
  return { P, n, m };
}

function fieldRange(path) {
  const m = /^(displace\[(\d+)\]\.(amp|freq|speed|amount)|color\.(saturation|value)|pointSize|spin|base\.(radius|R|r|size))$/.exec(path || '');
  if (!m) return null;
  const leaf = m[3] || m[4] || m[5] || path;
  return { idx: m[2] !== undefined ? Number(m[2]) : null, range: FIELD_RANGE[leaf] };
}

/** Every reason a scene is refused, in words a person can act on; [] when it plays. */
export function validateScene(j) {
  const e = [];
  if (!j || typeof j !== 'object' || Array.isArray(j)) return ['the scene is not a JSON object'];
  const top = ['base', 'center', 'displace', 'spin', 'color', 'pointSize', 'bindings'];
  for (const k of Object.keys(j)) if (!top.includes(k)) e.push(`unknown key "${k}" (allowed: ${list(top)})`);
  const b = j.base;
  if (!b || typeof b !== 'object' || !BASES[b.type]) return [...e, `base must be an object with "type" one of ${list(Object.keys(BASES))}, got ${JSON.stringify(b?.type ?? b)}`];
  for (const k of Object.keys(b)) if (k !== 'type' && !BASES[b.type].includes(k)) e.push(`base (${b.type}) has unknown key "${k}" (allowed: ${list(BASES[b.type])})`);
  const need = (k, lo, hi, int) => {
    if (!(int ? isInt(b[k]) : isNum(b[k])) || b[k] < lo || b[k] > hi) e.push(`base.${k} must be ${int ? 'an integer' : 'a number'} ${lo}..${hi}, got ${JSON.stringify(b[k])}`);
  };
  // The count is refused before anything is sampled, so an over-cap scene costs nothing to refuse.
  if (['sphere', 'torus', 'spiral', 'cloud', 'lissajous'].includes(b.type)) {
    if (isInt(b.count) && b.count > MAX_POINTS) return [`base.count is ${b.count.toLocaleString('en')} points; at most ${MAX_POINTS.toLocaleString('en')}`];
    need('count', 1, MAX_POINTS, true);
  }
  if (b.type === 'plane') {
    if (!(Array.isArray(b.size) && b.size.length === 2 && b.size.every((x) => inR(x, 0.1, 20)))) e.push(`base.size must be [sx, sz] each 0.1..20, got ${JSON.stringify(b.size)}`);
    need('spacing', 0.01, 5);
  }
  if (b.type === 'grid3d') {
    if (!(Array.isArray(b.n) && b.n.length === 3 && b.n.every((x) => isInt(x) && x >= 1 && x <= 200))) e.push(`base.n must be [nx, ny, nz] integers 1..200, got ${JSON.stringify(b.n)}`);
    need('spacing', 0.01, 5);
  }
  if (b.type === 'sphere') need('radius', 0.05, 10);
  if (b.type === 'torus') { need('R', 0.05, 10); need('r', 0.01, 5); }
  if (b.type === 'spiral') {
    need('turns', 0.1, 50);
    if (b.radius !== undefined) need('radius', 0.05, 10);
    if (b.height !== undefined) need('height', -6, 6);
    if (b.arms !== undefined) need('arms', 1, 8, true);
  }
  if (b.type === 'cloud' && !(Array.isArray(b.spread) && b.spread.length === 3 && b.spread.every((x) => inR(x, 0, 20)))) e.push(`base.spread must be [sx, sy, sz] each 0..20, got ${JSON.stringify(b.spread)}`);
  if (b.type === 'lissajous') { for (const k of ['a', 'b', 'c']) need(k, 0, 12, true); if (b.size !== undefined) need('size', 0.05, 10); }
  if (!e.length) {
    const n = pointCount(b);
    if (n > MAX_POINTS) return [`the base makes ${n.toLocaleString('en')} points; at most ${MAX_POINTS.toLocaleString('en')}`];
  }
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
        if (d[k] === undefined && k === 'speed') continue;
        const r = FIELD_RANGE[k];
        if (!inR(d[k], r[0], r[1])) e.push(`${at}.${k} must be a number ${r[0]}..${r[1]}, got ${JSON.stringify(d[k])}`);
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
  // Played on the CPU at 0, 2, 4 and 6 s, about 4000 points a frame: inside the room, spread, moving.
  const n = pointCount(b);
  const every = Math.max(1, Math.floor(n / 4000));
  const frames = [0, 2, 4, 6].map((t) => pointsAt(boundAt(j, t), t, every).P);
  let out = 0, first = '';
  frames.forEach((P, k) => {
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (!(Math.abs(x) <= 10.001 && Math.abs(z) <= 10.001 && y >= -0.001 && y <= 6.001)) {
        out++;
        if (!first) first = `at ${k * 2} s a point is at [${[x, y, z].map((q) => +q.toFixed(2)).join(', ')}]`;
      }
    }
  });
  if (out) return [`points leave the room (|x| and |z| at most 10, y from 0 to 6): ${first}; move the center or make it smaller`];
  const P0 = frames[0];
  const ext = [0, 1, 2].map((a) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = a; i < P0.length; i += 3) { lo = Math.min(lo, P0[i]); hi = Math.max(hi, P0[i]); }
    return hi - lo;
  });
  if (Math.max(...ext) < 0.5) return [`the cloud is only ${Math.max(...ext).toFixed(2)} m across; it must spread over at least 0.5 m`];
  let moved = 0;
  for (let k = 1; k < 4; k++) {
    let s = 0;
    for (let i = 0; i < P0.length; i++) s += Math.abs(frames[k][i] - frames[k - 1][i]);
    moved = Math.max(moved, s / (P0.length / 3));
  }
  if (moved < 0.01) return ['nothing moves between 0, 2, 4 and 6 s; add a displacement with speed, a spin, a pulse or a binding'];
  return [];
}

/** Text in, a scene or the reasons out. */
export function parseScene(text) {
  let j;
  try { j = JSON.parse(text); } catch (err) { return { scene: null, errors: [`not JSON: ${err.message}`] }; }
  const errors = validateScene(j);
  return { scene: errors.length ? null : j, errors };
}

/**
 * The same shape at a different density, for the benchmark ramp: a count base takes `n` as its count;
 * a plane or a grid keeps its extent and gets a spacing that holds about `n`, and the page draws exactly `n`.
 */
export function withCount(scene, n) {
  const s = JSON.parse(JSON.stringify(scene));
  const b = s.base;
  if (b.type === 'plane') b.spacing = Math.sqrt((b.size[0] * b.size[1]) / n);
  else if (b.type === 'grid3d') {
    const k = Math.cbrt(n / (b.n[0] * b.n[1] * b.n[2]));
    b.spacing /= k;
    b.n = b.n.map((x) => Math.max(1, Math.round(x * k)));
  } else b.count = n;
  return s;
}

/** The six built in scenes, each one validated by the page's own checks. */
export const EXAMPLES = [
  { name: 'Rippling floor', scene: {
    base: { type: 'plane', size: [16, 16], spacing: 0.06 }, center: [0, 0.35, 0],
    displace: [{ type: 'ripple', center: [0, 0], freq: 2.2, amp: 0.2, speed: 3 }],
    color: { by: 'distance', palette: 'ocean', saturation: 0.85, value: 1 }, pointSize: 2,
    bindings: [{ signal: 'audio.low', field: 'displace[0].amp', range: [0.08, 0.3], attack: 30, release: 500 }] } },
  { name: 'Galaxy', scene: {
    base: { type: 'spiral', turns: 2.5, count: 60000, radius: 6, height: 0.5, arms: 4 }, center: [0, 2.4, 0],
    displace: [{ type: 'noise', freq: 1.4, amp: 0.18, speed: 0.4 }], spin: 10,
    color: { by: 'distance', palette: 'sunset', saturation: 0.9, value: 1 }, pointSize: 2,
    bindings: [{ signal: 'clock.beat', field: 'pointSize', range: [1.5, 3], attack: 10, release: 300 }] } },
  { name: 'Breathing sphere', scene: {
    base: { type: 'sphere', radius: 1.8, count: 40000 }, center: [0, 2.8, 0],
    displace: [{ type: 'pulse', amp: 0.12, speed: 0.25 }, { type: 'noise', freq: 1.2, amp: 0.12, speed: 0.6 }],
    color: { by: 'index', palette: 'ice', saturation: 0.7, value: 1 }, pointSize: 2,
    bindings: [{ signal: 'audio.envelope', field: 'displace[0].amp', range: [0.04, 0.24], attack: 400, release: 1200 }] } },
  { name: 'Rain', scene: {
    base: { type: 'cloud', count: 80000, spread: [16, 5, 16] }, center: [0, 3, 0],
    displace: [{ type: 'wave', dir: 'z', freq: 0.5, amp: 0.3, speed: 5 }, { type: 'noise', freq: 3, amp: 0.05, speed: 4 }],
    color: { by: 'height', palette: 'ice', saturation: 0.4, value: 0.8 }, pointSize: 1.5,
    bindings: [{ signal: 'audio.onset', field: 'color.value', range: [0.5, 1], attack: 5, release: 600 }] } },
  { name: 'Rolling wave', scene: {
    base: { type: 'plane', size: [18, 10], spacing: 0.08 }, center: [0, 1, 0],
    displace: [{ type: 'wave', dir: 'x', freq: 0.8, amp: 0.5, speed: 2 }, { type: 'wave', dir: 'z', freq: 1.7, amp: 0.15, speed: 1.3 }],
    color: { by: 'height', palette: 'ocean', saturation: 0.9, value: 1 }, pointSize: 2,
    bindings: [{ signal: 'audio.envelope', field: 'displace[0].amp', range: [0.3, 0.8], attack: 300, release: 900 }] } },
  { name: 'Twisting torus', scene: {
    base: { type: 'torus', R: 2.2, r: 0.7, count: 50000 }, center: [0, 2.5, 0],
    displace: [{ type: 'twist', amount: 40, speed: 18 }, { type: 'noise', freq: 1.5, amp: 0.08, speed: 0.8 }], spin: 15,
    color: { by: 'index', palette: 'rainbow', saturation: 0.8, value: 1 }, pointSize: 2,
    bindings: [{ signal: 'clock.phase', field: 'displace[0].amount', range: [-60, 60], attack: 200, release: 200 }] } },
];
