// The four kinds: the system prompt each model gets, the JSON schema handed to a runtime that offers
// structured output (Ollama `format`), and the validator whose error text goes back to the model.

export const SIGNALS = ['audio.envelope', 'audio.low', 'audio.mid', 'audio.high', 'audio.onset',
  'clock.phase', 'clock.beat', 'hand.left.x', 'hand.right.y'];
export const GENERATORS = ['particles', 'field', 'tunnel', 'grid'];
export const EFFECTS = ['displacement', 'feedback', 'mirror', 'bloom', 'trails', 'noise'];
export const PARAMS = { hue: [0, 1], feedback: [0, 0.98], mirrorCount: [1, 12], speed: [0, 2], displacement: [0, 2] };
export const SHAPES = ['cylinder', 'box', 'sphere', 'disc', 'torus', 'cone'];
export const MATERIALS = ['stone', 'metal', 'wood', 'glass', 'water', 'matte', 'emissive', 'mirror'];
export const MOTION_PROPS = ['position.y', 'rotation.y', 'scale', 'glow'];
export const LSYM = 'FG+-[]ABCDE';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const list = (a) => a.join(', ');

// ---------- patch ----------
const PATCH_SYSTEM = `You write a visual patch for a device that builds it itself. Answer with ONE JSON object and nothing else.
Shape:
{
  "generator": one of ${list(GENERATORS)},
  "particles": integer 0..60000 (how many particles; required when generator is "particles", otherwise optional),
  "params": { "hue": 0..1, "feedback": 0..0.98, "mirrorCount": integer 1..12, "speed": 0..2, "displacement": 0..2 }  (all five, numbers),
  "effects": array of at most 4 distinct names from: ${list(EFFECTS)},
  "bindings": array of { "signal": one of ${list(SIGNALS)}, "param": one of the five param names, "range": [lo, hi] inside that param's range, "attack": ms 0..5000, "release": ms 0..10000 },
  "seed": integer,
  "quality": one of low, medium, high
}
No other keys. audio.onset is a drum hit, audio.low is bass, clock.phase goes 0..1 once per bar, clock.beat pulses each beat.
Example: {"generator":"field","params":{"hue":0.6,"feedback":0.8,"mirrorCount":1,"speed":0.3,"displacement":0.5},"effects":["displacement","feedback"],"bindings":[{"signal":"audio.low","param":"displacement","range":[0.2,1.5],"attack":40,"release":600}],"seed":7,"quality":"medium"}`;

const PATCH_SCHEMA = {
  type: 'object',
  properties: {
    generator: { type: 'string', enum: GENERATORS },
    particles: { type: 'integer' },
    params: { type: 'object', properties: Object.fromEntries(Object.keys(PARAMS).map((k) => [k, { type: 'number' }])), required: Object.keys(PARAMS) },
    effects: { type: 'array', items: { type: 'string', enum: EFFECTS } },
    bindings: { type: 'array', items: { type: 'object', properties: {
      signal: { type: 'string', enum: SIGNALS }, param: { type: 'string', enum: Object.keys(PARAMS) },
      range: { type: 'array', items: { type: 'number' } }, attack: { type: 'number' }, release: { type: 'number' } },
      required: ['signal', 'param', 'range', 'attack', 'release'] } },
    seed: { type: 'integer' },
    quality: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['generator', 'params', 'effects', 'bindings', 'seed', 'quality'],
};

function inRange(v, [lo, hi]) { return isNum(v) && v >= lo && v <= hi; }

export function validatePatch(j) {
  const e = [];
  if (!j || typeof j !== 'object' || Array.isArray(j)) return ['the answer is not a JSON object'];
  const allowed = ['generator', 'particles', 'params', 'effects', 'bindings', 'seed', 'quality'];
  for (const k of Object.keys(j)) if (!allowed.includes(k)) e.push(`unknown key "${k}" (allowed: ${list(allowed)})`);
  if (!GENERATORS.includes(j.generator)) e.push(`generator must be one of ${list(GENERATORS)}, got ${JSON.stringify(j.generator)}`);
  if (j.generator === 'particles' && j.particles === undefined) e.push('generator "particles" needs "particles": an integer 0..60000');
  if (j.particles !== undefined && !(isInt(j.particles) && j.particles >= 0 && j.particles <= 60000)) e.push(`particles must be an integer 0..60000, got ${JSON.stringify(j.particles)}`);
  if (!j.params || typeof j.params !== 'object') e.push('params is missing (an object with hue, feedback, mirrorCount, speed, displacement)');
  else {
    for (const k of Object.keys(j.params)) if (!PARAMS[k]) e.push(`params has unknown key "${k}"`);
    for (const [k, r] of Object.entries(PARAMS)) {
      if (!inRange(j.params[k], r)) e.push(`params.${k} must be a number ${r[0]}..${r[1]}, got ${JSON.stringify(j.params[k])}`);
    }
    if (j.params.mirrorCount !== undefined && !isInt(j.params.mirrorCount)) e.push('params.mirrorCount must be an integer');
  }
  if (!Array.isArray(j.effects)) e.push('effects must be an array');
  else {
    if (j.effects.length > 4) e.push(`at most 4 effects, got ${j.effects.length}`);
    for (const x of j.effects) if (!EFFECTS.includes(x)) e.push(`unknown effect ${JSON.stringify(x)} (allowed: ${list(EFFECTS)})`);
    if (new Set(j.effects).size !== j.effects.length) e.push('effects must not repeat');
  }
  if (!Array.isArray(j.bindings)) e.push('bindings must be an array');
  else j.bindings.forEach((b, i) => {
    const at = `bindings[${i}]`;
    if (!b || typeof b !== 'object') { e.push(`${at} is not an object`); return; }
    for (const k of Object.keys(b)) if (!['signal', 'param', 'range', 'attack', 'release'].includes(k)) e.push(`${at} has unknown key "${k}"`);
    if (!SIGNALS.includes(b.signal)) e.push(`${at}.signal must be one of ${list(SIGNALS)}, got ${JSON.stringify(b.signal)}`);
    if (!PARAMS[b.param]) e.push(`${at}.param must be one of ${list(Object.keys(PARAMS))}, got ${JSON.stringify(b.param)}`);
    else if (!(Array.isArray(b.range) && b.range.length === 2 && b.range.every((v) => inRange(v, PARAMS[b.param])))) e.push(`${at}.range must be [lo, hi] inside ${b.param}'s range ${PARAMS[b.param][0]}..${PARAMS[b.param][1]}, got ${JSON.stringify(b.range)}`);
    if (!inRange(b.attack, [0, 5000])) e.push(`${at}.attack must be ms 0..5000, got ${JSON.stringify(b.attack)}`);
    if (!inRange(b.release, [0, 10000])) e.push(`${at}.release must be ms 0..10000, got ${JSON.stringify(b.release)}`);
  });
  if (!isInt(j.seed)) e.push(`seed must be an integer, got ${JSON.stringify(j.seed)}`);
  if (!['low', 'medium', 'high'].includes(j.quality)) e.push(`quality must be low, medium or high, got ${JSON.stringify(j.quality)}`);
  return e;
}

// ---------- scene ----------
const SCENE_SYSTEM = `You write a 3D scene for a device that builds it itself. Answer with ONE JSON object and nothing else.
The room is 20 m by 20 m and 6 m high: x and z from -10 to 10, y from 0 (floor) to 6 (ceiling). y is up. Units are metres.
Shape:
{ "shapes": [ {
    "shape": one of ${list(SHAPES)},
    "size": [sx, sy, sz] full extents in metres, each 0.01..20 (a sphere of diameter 1 is [1,1,1]; a disc is a flat cylinder; a torus [outer diameter, tube thickness, outer diameter]),
    "position": [x, y, z] the centre of the shape, or with a repeat the centre of the ring, the centre of the grid, or the first item of the line,
    "repeat": optional, one of {"kind":"ring","count":n,"radius":r} | {"kind":"grid","nx":n,"nz":n,"spacing":s} | {"kind":"line","count":n,"step":[dx,dy,dz]},
    "rotation": optional [rx, ry, rz] degrees,
    "material": one of ${list(MATERIALS)},
    "color": optional "#rrggbb",
    "motions": optional array of { "signal": one of ${list(SIGNALS)}, "property": one of ${list(MOTION_PROPS)}, "range": [lo, hi] each -5..5, "attack": ms 0..5000, "release": ms 0..10000 }
} ] }
Caps: at most 2000 instances in total (a repeat counts every copy), at most 64 entries in "shapes", and every instance must fit inside the room (its centre plus or minus half its size). A shape standing on the floor has position y = half its height. No other keys.
Example: {"shapes":[{"shape":"disc","size":[6,0.1,6],"position":[0,0.05,0],"material":"water"},{"shape":"cylinder","size":[0.5,3,0.5],"position":[0,1.5,0],"repeat":{"kind":"ring","count":8,"radius":5},"material":"stone"}]}`;

const SCENE_SCHEMA = {
  type: 'object',
  properties: { shapes: { type: 'array', items: { type: 'object', properties: {
    shape: { type: 'string', enum: SHAPES },
    size: { type: 'array', items: { type: 'number' } },
    position: { type: 'array', items: { type: 'number' } },
    repeat: { type: 'object', properties: { kind: { type: 'string', enum: ['ring', 'grid', 'line'] },
      count: { type: 'integer' }, radius: { type: 'number' }, nx: { type: 'integer' }, nz: { type: 'integer' }, spacing: { type: 'number' },
      step: { type: 'array', items: { type: 'number' } } }, required: ['kind'] },
    rotation: { type: 'array', items: { type: 'number' } },
    material: { type: 'string', enum: MATERIALS },
    color: { type: 'string' },
    motions: { type: 'array', items: { type: 'object', properties: {
      signal: { type: 'string', enum: SIGNALS }, property: { type: 'string', enum: MOTION_PROPS },
      range: { type: 'array', items: { type: 'number' } }, attack: { type: 'number' }, release: { type: 'number' } },
      required: ['signal', 'property', 'range', 'attack', 'release'] } },
  }, required: ['shape', 'size', 'position', 'material'] } } },
  required: ['shapes'],
};

const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);

/** Every instance centre of one shape entry. */
export function instances(s) {
  const [x, y, z] = s.position;
  const r = s.repeat;
  if (!r) return [[x, y, z]];
  const out = [];
  if (r.kind === 'ring') for (let i = 0; i < r.count; i++) { const a = (i / r.count) * Math.PI * 2; out.push([x + Math.cos(a) * r.radius, y, z + Math.sin(a) * r.radius]); }
  if (r.kind === 'grid') for (let i = 0; i < r.nx; i++) for (let k = 0; k < r.nz; k++) out.push([x + (i - (r.nx - 1) / 2) * r.spacing, y, z + (k - (r.nz - 1) / 2) * r.spacing]);
  if (r.kind === 'line') for (let i = 0; i < r.count; i++) out.push([x + r.step[0] * i, y + r.step[1] * i, z + r.step[2] * i]);
  return out;
}

export function validateScene(j) {
  const e = [];
  if (!j || typeof j !== 'object' || Array.isArray(j)) return ['the answer is not a JSON object'];
  for (const k of Object.keys(j)) if (k !== 'shapes') e.push(`unknown top level key "${k}" (only "shapes")`);
  if (!Array.isArray(j.shapes) || !j.shapes.length) return [...e, 'shapes must be a non-empty array'];
  if (j.shapes.length > 64) e.push(`at most 64 entries in shapes, got ${j.shapes.length}`);
  let total = 0; let outside = 0; let firstOut = '';
  j.shapes.forEach((s, i) => {
    const at = `shapes[${i}]`;
    if (!s || typeof s !== 'object') { e.push(`${at} is not an object`); return; }
    const ok0 = e.length;
    for (const k of Object.keys(s)) if (!['shape', 'size', 'position', 'repeat', 'rotation', 'material', 'color', 'motions'].includes(k)) e.push(`${at} has unknown key "${k}"`);
    if (!SHAPES.includes(s.shape)) e.push(`${at}.shape must be one of ${list(SHAPES)}, got ${JSON.stringify(s.shape)}`);
    if (!vec3(s.size) || !s.size.every((v) => v >= 0.01 && v <= 20)) e.push(`${at}.size must be [sx,sy,sz] each 0.01..20, got ${JSON.stringify(s.size)}`);
    if (!vec3(s.position)) e.push(`${at}.position must be [x,y,z] numbers, got ${JSON.stringify(s.position)}`);
    if (s.rotation !== undefined && !vec3(s.rotation)) e.push(`${at}.rotation must be [rx,ry,rz] degrees`);
    if (!MATERIALS.includes(s.material)) e.push(`${at}.material must be one of ${list(MATERIALS)}, got ${JSON.stringify(s.material)}`);
    if (s.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(s.color))) e.push(`${at}.color must be "#rrggbb", got ${JSON.stringify(s.color)}`);
    const r = s.repeat;
    if (r !== undefined) {
      if (!r || typeof r !== 'object') e.push(`${at}.repeat must be an object`);
      else if (r.kind === 'ring') { if (!(isInt(r.count) && r.count >= 1) || !isNum(r.radius)) e.push(`${at}.repeat ring needs integer count >= 1 and number radius, got ${JSON.stringify(r)}`); }
      else if (r.kind === 'grid') { if (!(isInt(r.nx) && r.nx >= 1 && isInt(r.nz) && r.nz >= 1) || !isNum(r.spacing)) e.push(`${at}.repeat grid needs integers nx, nz >= 1 and number spacing, got ${JSON.stringify(r)}`); }
      else if (r.kind === 'line') { if (!(isInt(r.count) && r.count >= 1) || !vec3(r.step)) e.push(`${at}.repeat line needs integer count >= 1 and step [dx,dy,dz], got ${JSON.stringify(r)}`); }
      else e.push(`${at}.repeat.kind must be ring, grid or line, got ${JSON.stringify(r.kind)}`);
    }
    if (s.motions !== undefined) {
      if (!Array.isArray(s.motions)) e.push(`${at}.motions must be an array`);
      else s.motions.forEach((m, k) => {
        const mt = `${at}.motions[${k}]`;
        if (!SIGNALS.includes(m?.signal)) e.push(`${mt}.signal must be one of ${list(SIGNALS)}, got ${JSON.stringify(m?.signal)}`);
        if (!MOTION_PROPS.includes(m?.property)) e.push(`${mt}.property must be one of ${list(MOTION_PROPS)}, got ${JSON.stringify(m?.property)}`);
        if (!(Array.isArray(m?.range) && m.range.length === 2 && m.range.every((v) => isNum(v) && Math.abs(v) <= 5))) e.push(`${mt}.range must be [lo, hi] each -5..5, got ${JSON.stringify(m?.range)}`);
        if (!inRange(m?.attack, [0, 5000])) e.push(`${mt}.attack must be ms 0..5000`);
        if (!inRange(m?.release, [0, 10000])) e.push(`${mt}.release must be ms 0..10000`);
      });
    }
    if (e.length > ok0) return;
    const n = r ? (r.kind === 'grid' ? r.nx * r.nz : r.count) : 1;
    total += n;
    if (n > 5000) return;
    for (const [x, y, z] of instances(s)) {
      const [hx, hy, hz] = s.size.map((v) => v / 2);
      if (Math.abs(x) + hx > 10.0001 || Math.abs(z) + hz > 10.0001 || y - hy < -0.0001 || y + hy > 6.0001) {
        outside++;
        if (!firstOut) firstOut = `${at} has an instance centred at [${[x, y, z].map((v) => +v.toFixed(2)).join(', ')}] with size [${s.size.join(', ')}], which reaches outside the room (|x|,|z| <= 10, 0 <= y <= 6)`;
      }
    }
  });
  if (total > 2000) e.push(`${total} instances in total, the cap is 2000`);
  if (outside) e.push(`${outside} instance(s) outside the room; first: ${firstOut}`);
  return e;
}

// ---------- lsystem ----------
const LSYSTEM_SYSTEM = `You write an L-system for a device that grows it and draws it with a turtle. Answer with ONE JSON object and nothing else.
Shape: { "axiom": string, "rules": { "<one symbol>": "<replacement string>", ... }, "angle": degrees 0..180, "iterations": integer 1..6, "seed": integer }
Symbols allowed anywhere: F G + - [ ] A B C D E and nothing else (no spaces, no other letters). F and G move forward drawing a line; + turns left by angle, - turns right; [ saves the turtle and ] restores it (they must balance); A to E draw nothing and are used to steer growth.
Rule keys are single symbols from F G A B C D E. The fully expanded string after the iterations must be at most 50000 symbols, so pick fewer iterations for rules that grow fast.
Example: {"axiom":"F","rules":{"F":"F[+F]F[-F]F"},"angle":25.7,"iterations":4,"seed":1}`;

const LSYSTEM_SCHEMA = {
  type: 'object',
  properties: { axiom: { type: 'string' }, rules: { type: 'object', additionalProperties: { type: 'string' } },
    angle: { type: 'number' }, iterations: { type: 'integer' }, seed: { type: 'integer' } },
  required: ['axiom', 'rules', 'angle', 'iterations', 'seed'],
};

export function expand(j, cap = 50000) {
  let s = j.axiom;
  for (let i = 0; i < j.iterations; i++) {
    let o = '';
    for (const c of s) { o += Object.hasOwn(j.rules, c) ? j.rules[c] : c; if (o.length > cap) return { s: o, over: i + 1 }; }
    s = o;
  }
  return { s, over: 0 };
}

const balanced = (s) => { let d = 0; for (const c of s) { if (c === '[') d++; if (c === ']' && --d < 0) return false; } return d === 0; };

export function validateLsystem(j) {
  const e = [];
  if (!j || typeof j !== 'object' || Array.isArray(j)) return ['the answer is not a JSON object'];
  for (const k of Object.keys(j)) if (!['axiom', 'rules', 'angle', 'iterations', 'seed'].includes(k)) e.push(`unknown key "${k}"`);
  const bad = (s) => [...new Set([...s].filter((c) => !LSYM.includes(c)))];
  if (typeof j.axiom !== 'string' || !j.axiom) e.push('axiom must be a non-empty string');
  else { const b = bad(j.axiom); if (b.length) e.push(`axiom has symbols that are not allowed: ${b.map((c) => JSON.stringify(c)).join(' ')} (allowed: F G + - [ ] A B C D E)`); if (!balanced(j.axiom)) e.push('axiom has unbalanced [ ]'); }
  if (!j.rules || typeof j.rules !== 'object' || Array.isArray(j.rules)) e.push('rules must be an object mapping one symbol to a string');
  else for (const [k, v] of Object.entries(j.rules)) {
    if (!/^[FGA-E]$/.test(k)) e.push(`rule key ${JSON.stringify(k)} must be one symbol from F G A B C D E`);
    if (typeof v !== 'string') { e.push(`rule ${k} must be a string`); continue; }
    const b = bad(v); if (b.length) e.push(`rule ${k} has symbols that are not allowed: ${b.map((c) => JSON.stringify(c)).join(' ')} (allowed: F G + - [ ] A B C D E)`);
    if (!balanced(v)) e.push(`rule ${k} has unbalanced [ ]`);
  }
  if (!inRange(j.angle, [0, 180])) e.push(`angle must be degrees 0..180, got ${JSON.stringify(j.angle)}`);
  if (!(isInt(j.iterations) && j.iterations >= 1 && j.iterations <= 6)) e.push(`iterations must be an integer 1..6, got ${JSON.stringify(j.iterations)}`);
  if (!isInt(j.seed)) e.push(`seed must be an integer, got ${JSON.stringify(j.seed)}`);
  if (e.length) return e;
  const x = expand(j);
  if (x.over) return [`the expanded string passes 50000 symbols at iteration ${x.over} of ${j.iterations}; use fewer iterations or rules that grow slower`];
  if (!/[FG]/.test(x.s)) return ['the expanded string has no F or G, so nothing is drawn'];
  return [];
}

// ---------- sdf ----------
export const SDF_HELPERS = `float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRoundBox(vec3 p, vec3 b, float r) { return sdBox(p, b - vec3(r)) - r; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdCylinder(vec3 p, float r, float h) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdCone(vec3 p, float r, float h) { vec2 q = vec2(length(p.xz), p.y); vec2 k1 = vec2(0.0, h); vec2 k2 = vec2(-r, 2.0 * h); vec2 ca = vec2(q.x - min(q.x, q.y < 0.0 ? r : 0.0), abs(q.y) - h); vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0); float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0; return s * sqrt(min(dot(ca, ca), dot(cb, cb))); }
float opUnion(float a, float b) { return min(a, b); }
float opSubtract(float a, float b) { return max(a, -b); }
float opIntersect(float a, float b) { return max(a, b); }
float opSmoothUnion(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }`;

const SDF_SYSTEM = `You write a signed distance function in GLSL ES 3.00 for a device that meshes it and renders it itself.
Write the function \`float sdf(vec3 p)\`, negative inside the solid and positive outside, for ONE connected solid that fits inside the box -1 <= x, y, z <= 1 (y is up). You may write your own helper functions above it.
These helpers already exist; call them, do not redefine them:
${SDF_HELPERS}
Rules: no uniforms, no textures, no #version or precision lines, no main(). No while or do loops; a for loop must have literal integer bounds of at most 64, like for (int i = 0; i < 8; i++). Use float literals with a dot (1.0, not 1).
Answer with the GLSL code only, no explanation.
Example:
float sdf(vec3 p) {
  float body = sdRoundBox(p, vec3(0.6), 0.1);
  return opSubtract(body, sdSphere(p, 0.75));
}`;

/** Static checks before the GPU: the loop rule and the forbidden words. Empty list means go on. */
export function sdfStatic(code) {
  const e = [];
  const src = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\bwhile\b/.test(src)) e.push('`while` (and do-while) loops are not allowed; use a for loop with literal bounds <= 64');
  if (/\buniform\b|\btexture\w*\s*\(|#\s*version|\bvoid\s+main\b/.test(src)) e.push('no uniforms, textures, #version or main(); write only helpers and float sdf(vec3 p)');
  if (!/\bfloat\s+sdf\s*\(\s*(in\s+)?vec3\s+\w+\s*\)/.test(src)) e.push('there must be a function `float sdf(vec3 p)`');
  const fors = [...src.matchAll(/\bfor\s*\(([^;]*);([^;]*);([^)]*)\)/g)];
  for (const f of fors) {
    const init = /^\s*int\s+(\w+)\s*=\s*(-?\d+)\s*$/.exec(f[1]);
    const cond = /^\s*(\w+)\s*(<|<=|>|>=)\s*(-?\d+)\s*$/.exec(f[2]);
    if (!init || !cond || cond[1] !== init[1]) { e.push(`for loop "for (${f[1].trim()}; ${f[2].trim()}; ${f[3].trim()})" needs a literal bound, like for (int i = 0; i < 8; i++)`); continue; }
    const span = Math.abs(Number(cond[3]) - Number(init[2]));
    if (span > 64) e.push(`for loop runs ${span} times; at most 64`);
  }
  return e;
}

/** The code out of a model's answer: a fenced block if there is one, else the text. */
export function stripFences(t) {
  const s = String(t || '').trim();
  const f = /```[a-zA-Z0-9]*\s*\n([\s\S]*?)```/.exec(s);
  return (f ? f[1] : s).trim();
}

/** The JSON object out of a model's answer. */
export function parseJson(t) {
  const s = stripFences(t);
  try { return { j: JSON.parse(s) }; } catch {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return { j: JSON.parse(s.slice(a, b + 1)) }; } catch (err) { return { err: `the answer is not valid JSON: ${err.message}` }; } }
  return { err: 'the answer has no JSON object in it' };
}

export const KINDS = {
  patch: { system: PATCH_SYSTEM, schema: PATCH_SCHEMA, validate: validatePatch, json: true },
  scene: { system: SCENE_SYSTEM, schema: SCENE_SCHEMA, validate: validateScene, json: true },
  lsystem: { system: LSYSTEM_SYSTEM, schema: LSYSTEM_SCHEMA, validate: validateLsystem, json: true },
  sdf: { system: SDF_SYSTEM, json: false },
};

// ======================= easier formats (second run, 2026-11-14 evening) =======================

// ---------- patch-sv: the patch with saturation and value, so "white" and "dark" can be said ----------
export const PARAMS_SV = { ...PARAMS, saturation: [0, 1], value: [0, 1] };
const PATCH_SV_SYSTEM = PATCH_SYSTEM
  .replace('"params": { "hue": 0..1, "feedback": 0..0.98, "mirrorCount": integer 1..12, "speed": 0..2, "displacement": 0..2 }  (all five, numbers)',
    '"params": { "hue": 0..1, "saturation": 0..1, "value": 0..1, "feedback": 0..0.98, "mirrorCount": integer 1..12, "speed": 0..2, "displacement": 0..2 }  (all seven, numbers; saturation 0 is grey or white, value 0 is black, value 1 is full brightness)')
  .replace('"param": one of the five param names', '"param": one of the seven param names')
  .replace('"params":{"hue":0.6,', '"params":{"hue":0.6,"saturation":0.8,"value":0.7,');
const PATCH_SV_SCHEMA = JSON.parse(JSON.stringify(PATCH_SCHEMA));
PATCH_SV_SCHEMA.properties.params.properties.saturation = { type: 'number' };
PATCH_SV_SCHEMA.properties.params.properties.value = { type: 'number' };
PATCH_SV_SCHEMA.properties.params.required = Object.keys(PARAMS_SV);
PATCH_SV_SCHEMA.properties.bindings.items.properties.param.enum = Object.keys(PARAMS_SV);
export function validatePatchSv(j) {
  // the same checks as patch, over the seven params
  const save = { ...PARAMS };
  Object.assign(PARAMS, PARAMS_SV);
  try { return validatePatch(j).map((e) => e.replace('(an object with hue, feedback, mirrorCount, speed, displacement)', '(an object with hue, saturation, value, feedback, mirrorCount, speed, displacement)')); }
  finally { for (const k of Object.keys(PARAMS)) if (!(k in save)) delete PARAMS[k]; }
}

// ---------- sdf-tree: a JSON CSG tree the device compiles to GLSL ----------
export const SDF_LEAVES = { sphere: ['r'], box: ['size'], cylinder: ['r', 'h'], torus: ['R', 'r'], cone: ['r', 'h'], capsule: ['r', 'h'] };
export const SDF_OPS = ['union', 'subtract', 'intersect', 'smoothUnion'];
export const SDF_MODS = ['repeat', 'twist', 'round'];
const SDF_TREE_SYSTEM = `You describe ONE connected 3D solid as a JSON tree of shapes, for a device that builds it itself. Answer with ONE JSON object and nothing else.
The solid must fit inside the box -1 <= x, y, z <= 1. y is up. Sizes are full sizes in the same units.
Every node is an object with "type" and the keys for that type:
- leaves: {"type":"sphere","r":radius} | {"type":"box","size":[x,y,z]} | {"type":"cylinder","r":radius,"h":height} (upright along y) | {"type":"torus","R":ring radius,"r":tube radius} (lying flat, around y) | {"type":"cone","r":base radius,"h":height} (base down, tip up) | {"type":"capsule","r":radius,"h":length} (upright along y)
- combine: {"type":"union"|"subtract"|"intersect","children":[node, node, ...]} ("subtract" cuts every later child out of the first) | {"type":"smoothUnion","k":0.01..0.5,"children":[...]} (melts them together)
- change one child: {"type":"repeat","count":2..64,"radius":r,"axis":"x"|"y"|"z","child":node} (count copies of the child, the child moved out to radius and spun around the axis, like gear teeth or a ring of pillars) | {"type":"twist","amount":degrees per unit of height,"child":node} (twists around y) | {"type":"round","r":0.01..0.3,"child":node} (rounds and fattens it)
Any node may also have "at":[x,y,z] (move it) and "rotate":[x,y,z] degrees (turn it about its own centre, applied before the move).
Caps: at most 40 nodes and depth 8. No other keys.
Example (a rounded cube with a ball cut out): {"type":"subtract","children":[{"type":"round","r":0.1,"child":{"type":"box","size":[1.2,1.2,1.2]}},{"type":"sphere","r":0.75}]}`;

const vec3n = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
export function validateSdfTree(j) {
  const e = []; let nodes = 0, depth = 0;
  if (!j || typeof j !== 'object' || Array.isArray(j)) return ['the answer is not a JSON object'];
  const walk = (n, at, d) => {
    nodes++; depth = Math.max(depth, d);
    if (!n || typeof n !== 'object' || Array.isArray(n)) { e.push(`${at} is not an object`); return; }
    const t = n.type;
    const common = ['type', 'at', 'rotate'];
    let keys;
    if (SDF_LEAVES[t]) keys = SDF_LEAVES[t];
    else if (SDF_OPS.includes(t)) keys = t === 'smoothUnion' ? ['children', 'k', 'a', 'b'] : ['children', 'a', 'b'];
    else if (t === 'repeat') keys = ['count', 'radius', 'axis', 'child'];
    else if (t === 'twist') keys = ['amount', 'child'];
    else if (t === 'round') keys = ['r', 'child'];
    else { e.push(`${at}.type must be one of ${list([...Object.keys(SDF_LEAVES), ...SDF_OPS, ...SDF_MODS])}, got ${JSON.stringify(t)}`); return; }
    for (const k of Object.keys(n)) if (!common.includes(k) && !keys.includes(k)) e.push(`${at} (${t}) has unknown key "${k}" (allowed: ${list([...keys.filter((x) => x !== 'a' && x !== 'b'), 'at', 'rotate'])})`);
    if (n.at !== undefined && !(vec3n(n.at) && n.at.every((v) => Math.abs(v) <= 2))) e.push(`${at}.at must be [x,y,z] each -2..2, got ${JSON.stringify(n.at)}`);
    if (n.rotate !== undefined && !vec3n(n.rotate)) e.push(`${at}.rotate must be [x,y,z] degrees, got ${JSON.stringify(n.rotate)}`);
    const pos = (k, lo, hi) => { if (!inRange(n[k], [lo, hi])) e.push(`${at} (${t}).${k} must be a number ${lo}..${hi}, got ${JSON.stringify(n[k])}`); };
    if (t === 'sphere') pos('r', 0.01, 1.5);
    if (t === 'box') { if (!(vec3n(n.size) && n.size.every((v) => v > 0 && v <= 3))) e.push(`${at} (box).size must be [x,y,z] each 0..3, got ${JSON.stringify(n.size)}`); }
    if (t === 'cylinder' || t === 'cone' || t === 'capsule') { pos('r', 0.01, 1.5); pos('h', 0.01, 3); }
    if (t === 'torus') { pos('R', 0.01, 1.5); pos('r', 0.005, 1); }
    if (SDF_OPS.includes(t)) {
      const ch = Array.isArray(n.children) ? n.children : (n.a && n.b ? [n.a, n.b] : null);
      if (!ch || ch.length < 2) e.push(`${at} (${t}) needs "children": a list of at least 2 nodes`);
      else if (ch.length > 12) e.push(`${at} (${t}) has ${ch.length} children; at most 12`);
      else ch.forEach((c, i) => walk(c, `${at}.children[${i}]`, d + 1));
      if (t === 'smoothUnion') pos('k', 0.01, 0.5);
    }
    if (t === 'repeat') { if (!(isInt(n.count) && n.count >= 2 && n.count <= 64)) e.push(`${at} (repeat).count must be an integer 2..64, got ${JSON.stringify(n.count)}`); pos('radius', 0, 1.5); if (n.axis !== undefined && !['x', 'y', 'z'].includes(n.axis)) e.push(`${at} (repeat).axis must be "x", "y" or "z"`); }
    if (t === 'twist') pos('amount', -720, 720);
    if (t === 'round') pos('r', 0.005, 0.3);
    if (SDF_MODS.includes(t)) { if (!n.child) e.push(`${at} (${t}) needs "child": one node`); else walk(n.child, `${at}.child`, d + 1); }
  };
  walk(j, 'root', 1);
  if (nodes > 40) e.push(`the tree has ${nodes} nodes; at most 40`);
  if (depth > 8) e.push(`the tree is ${depth} levels deep; at most 8`);
  return e;
}

const f = (v) => { const s = Number(v).toFixed(4); return s.includes('.') ? s : s + '.0'; };
/** Compile a valid tree to GLSL that defines float sdf(vec3 p), using the SDF_HELPERS. */
export function compileSdfTree(tree) {
  const fns = []; let id = 0;
  const node = (n) => {
    const name = `n${id++}`;
    const body = [];
    if (n.at) body.push(`p -= vec3(${n.at.map(f).join(', ')});`);
    if (n.rotate) {
      const [rx, ry, rz] = n.rotate.map((d) => (d * Math.PI) / 180);
      // undo Z, then Y, then X (the object was turned X first)
      if (rz) body.push(`p.xy = mat2(${f(Math.cos(rz))}, ${f(-Math.sin(rz))}, ${f(Math.sin(rz))}, ${f(Math.cos(rz))}) * p.xy;`);
      if (ry) body.push(`p.zx = mat2(${f(Math.cos(ry))}, ${f(-Math.sin(ry))}, ${f(Math.sin(ry))}, ${f(Math.cos(ry))}) * p.zx;`);
      if (rx) body.push(`p.yz = mat2(${f(Math.cos(rx))}, ${f(-Math.sin(rx))}, ${f(Math.sin(rx))}, ${f(Math.cos(rx))}) * p.yz;`);
    }
    const t = n.type;
    if (t === 'sphere') body.push(`return sdSphere(p, ${f(n.r)});`);
    else if (t === 'box') body.push(`return sdBox(p, vec3(${n.size.map((v) => f(v / 2)).join(', ')}));`);
    else if (t === 'cylinder') body.push(`return sdCylinder(p, ${f(n.r)}, ${f(n.h / 2)});`);
    else if (t === 'torus') body.push(`return sdTorus(p, vec2(${f(n.R)}, ${f(n.r)}));`);
    else if (t === 'cone') body.push(`return sdCone(p, ${f(n.r)}, ${f(n.h / 2)});`);
    else if (t === 'capsule') body.push(`return sdCapsule(p, vec3(0.0, ${f(-n.h / 2)}, 0.0), vec3(0.0, ${f(n.h / 2)}, 0.0), ${f(n.r)});`);
    else if (SDF_OPS.includes(t)) {
      const ch = (Array.isArray(n.children) ? n.children : [n.a, n.b]).map(node);
      const fn = { union: 'opUnion', subtract: 'opSubtract', intersect: 'opIntersect', smoothUnion: 'opSmoothUnion' }[t];
      body.push(`float d = ${ch[0]}(p);`);
      for (const c of ch.slice(1)) body.push(t === 'smoothUnion' ? `d = opSmoothUnion(d, ${c}(p), ${f(n.k)});` : `d = ${fn}(d, ${c}(p));`);
      body.push('return d;');
    } else if (t === 'repeat') {
      const c = node(n.child); const ax = n.axis || 'y';
      const pl = { y: ['x', 'z'], x: ['y', 'z'], z: ['x', 'y'] }[ax];
      const sec = (2 * Math.PI) / n.count;
      body.push(`float a = atan(p.${pl[1]}, p.${pl[0]}); float r = length(vec2(p.${pl[0]}, p.${pl[1]}));`,
        `a = mod(a + ${f(sec / 2)}, ${f(sec)}) - ${f(sec / 2)};`,
        `p.${pl[0]} = r * cos(a) - ${f(n.radius)}; p.${pl[1]} = r * sin(a);`, `return ${c}(p);`);
    } else if (t === 'twist') {
      const c = node(n.child);
      body.push(`float a = ${f((n.amount * Math.PI) / 180)} * p.y; float cs = cos(a), sn = sin(a);`, 'p.xz = mat2(cs, -sn, sn, cs) * p.xz;', `return ${c}(p) * 0.7;`);
    } else if (t === 'round') {
      const c = node(n.child);
      body.push(`return ${c}(p) - ${f(n.r)};`);
    }
    fns.push(`float ${name}(vec3 p) {\n  ${body.join('\n  ')}\n}`);
    return name;
  };
  const root = node(tree);
  return `${fns.join('\n')}\nfloat sdf(vec3 p) { return ${root}(p); }`;
}

// ---------- lsystem-presets: pick a named grammar and tweak it ----------
// Each preset: variants (rules + angle + axiom), default and max iterations. Symbols outside F G + - [ ] draw nothing.
export const L_PRESETS = {
  fern: { it: 5, max: 6, variants: {
    classic: { axiom: 'A', rules: { A: 'F+[[A]-A]-F[-FA]+A', F: 'FF' }, angle: 25 },
    curly: { axiom: 'A', rules: { A: 'F-[[A]+A]+F[+FA]-A', F: 'FF' }, angle: 22 },
    sparse: { axiom: 'A', rules: { A: 'F[+A]F[-A]+A', F: 'FF' }, angle: 25 } } },
  tree: { it: 6, max: 7, variants: {
    binary: { axiom: 'A', rules: { A: 'F[+A][-A]', F: 'FF' }, angle: 30 },
    ternary: { axiom: 'A', rules: { A: 'F[+A][A][-A]', F: 'FF' }, angle: 28 },
    'long-trunk': { axiom: 'FFFA', rules: { A: 'F[+A][-A]', F: 'F' }, angle: 35 },
    asymmetric: { axiom: 'A', rules: { A: 'F[+A]F[-A]A', F: 'FF' }, angle: 25 } } },
  bush: { it: 4, max: 4, variants: {
    classic: { axiom: 'F', rules: { F: 'FF+[+F-F-F]-[-F+F+F]' }, angle: 22.5 },
    round: { axiom: 'F', rules: { F: 'F[+F]F[-F]F' }, angle: 25.7 },
    wild: { axiom: 'F', rules: { F: 'F[+F]F[-F][F]' }, angle: 20 } } },
  coral: { it: 5, max: 6, variants: {
    'three-way': { axiom: 'A', rules: { A: 'F[+A][A][-A]', F: 'F' }, angle: 32 },
    'two-way': { axiom: 'A', rules: { A: 'F[+A][-A]', F: 'F' }, angle: 40 },
    fan: { axiom: 'A', rules: { A: 'F[++A][+A][A][-A][--A]', F: 'F' }, angle: 22 } } },
  koch: { it: 4, max: 5, variants: {
    curve: { axiom: 'F', rules: { F: 'F+F--F+F' }, angle: 60 },
    snowflake: { axiom: 'F--F--F', rules: { F: 'F+F--F+F' }, angle: 60 },
    'anti-snowflake': { axiom: 'F++F++F', rules: { F: 'F+F--F+F' }, angle: 60 },
    square: { axiom: 'F', rules: { F: 'F+F-F-F+F' }, angle: 90 } } },
  snowflake: { it: 4, max: 4, variants: {
    branched: { axiom: '[A]+[A]+[A]+[A]+[A]+[A]', rules: { A: 'F[+A][-A]FA' }, angle: 60 },
    fishbone: { axiom: '[A]+[A]+[A]+[A]+[A]+[A]', rules: { A: 'F[+F][-F]A' }, angle: 60 },
    crystal: { axiom: '[A]+[A]+[A]+[A]+[A]+[A]', rules: { A: 'FF[+F][-F]A', F: 'F' }, angle: 60 } } },
  sierpinski: { it: 6, max: 7, variants: {
    arrowhead: { axiom: 'F', rules: { F: 'G-F-G', G: 'F+G+F' }, angle: 60 },
    triangle: { axiom: 'F-G-G', rules: { F: 'F-G+F+G-F', G: 'GG' }, angle: 120 },
    curve: { axiom: 'F--AF--F--AF', rules: { A: 'AF+F+AF--F--AF+F+A' }, angle: 45 } } },
  dragon: { it: 10, max: 12, variants: {
    dragon: { axiom: 'FA', rules: { A: 'A+BF+', B: '-FA-B' }, angle: 90 },
    twin: { axiom: 'FA+FA+', rules: { A: 'A+BF+', B: '-FA-B' }, angle: 90 },
    levy: { axiom: 'F', rules: { F: '+F--F+' }, angle: 45 } } },
  hilbert: { it: 5, max: 6, variants: {
    hilbert: { axiom: 'A', rules: { A: '+BF-AFA-FB+', B: '-AF+BFB+FA-' }, angle: 90 },
    moore: { axiom: 'AFA+F+AFA', rules: { A: '-BF+AFA+FB-', B: '+AF-BFB-FA+' }, angle: 90 },
    peano: { axiom: 'A', rules: { A: 'AFBFA+F+BFAFB-F-AFBFA', B: 'BFAFB-F-AFBFA+F+BFAFB' }, angle: 90 } } },
  lightning: { it: 4, max: 5, variants: {
    forked: { axiom: 'A', rules: { A: 'F-F+[+F-A]F+F-A' }, angle: 28 },
    single: { axiom: 'A', rules: { A: 'F-F++F-A' }, angle: 25 },
    heavy: { axiom: 'A', rules: { A: 'F-F+[+A][--F+A]F-A' }, angle: 30 } } },
  seaweed: { it: 5, max: 6, variants: {
    upright: { axiom: 'A', rules: { A: 'F[+A]F[-A]A', F: 'F' }, angle: 18 },
    'lean-left': { axiom: 'A', rules: { A: 'F+[+A]F[-A]+A', F: 'F' }, angle: 12 },
    'lean-right': { axiom: 'A', rules: { A: 'F-[+A]F[-A]-A', F: 'F' }, angle: 12 } } },
  'city-grid': { it: 6, max: 10, variants: {
    skyline: { axiom: 'A', rules: { A: 'FFFF-FF-FFFF+F+FF-F-FF+F+FFFFFF-FF-FFFFFF+F+FFF-F-FFF+F+A' }, angle: 90 },
    grid: { axiom: 'F+F+F+F', rules: { F: 'FF+F+F+F+FF' }, angle: 90 },
    blocks: { axiom: 'F+F+F+F', rules: { F: 'F+F-F-FF+F+F-F' }, angle: 90 } } },
};
const presetLines = Object.entries(L_PRESETS).map(([k, p]) => `- ${k}: variants ${Object.keys(p.variants).join(', ')}; iterations 1..${p.max} (default ${p.it})`).join('\n');
const LSYSTEM_PRESETS_SYSTEM = `You pick a drawing for a device that grows it as an L-system and draws it with a turtle. Answer with ONE JSON object and nothing else.
Shape: { "preset": name, "variant": one of that preset's variants, "iterations": integer within the preset's range, "angle": optional degrees 5..120 (leave it out for the preset's own angle), "length": optional 0.5..1 (how much shorter each branch level is drawn; 1 = same length, leave it out for 1) }
Presets:
${presetLines}
Pick the preset and variant closest to the wish; change the angle or iterations only when the wish asks for it (the device lowers the iterations if a variant would grow too big). No other keys.
Example: {"preset":"tree","variant":"binary","iterations":6,"angle":25,"length":0.8}`;

export function validateLsystemPreset(j) {
  const e = [];
  if (!j || typeof j !== 'object' || Array.isArray(j)) return ['the answer is not a JSON object'];
  for (const k of Object.keys(j)) if (!['preset', 'variant', 'iterations', 'angle', 'length'].includes(k)) e.push(`unknown key "${k}" (allowed: preset, variant, iterations, angle, length)`);
  const p = L_PRESETS[j.preset];
  if (!p) return [...e, `preset must be one of ${list(Object.keys(L_PRESETS))}, got ${JSON.stringify(j.preset)}`];
  if (!p.variants[j.variant]) e.push(`variant for ${j.preset} must be one of ${list(Object.keys(p.variants))}, got ${JSON.stringify(j.variant)}`);
  if (!(isInt(j.iterations) && j.iterations >= 1 && j.iterations <= p.max)) e.push(`iterations for ${j.preset} must be an integer 1..${p.max}, got ${JSON.stringify(j.iterations)}`);
  if (j.angle !== undefined && !inRange(j.angle, [5, 120])) e.push(`angle must be degrees 5..120, got ${JSON.stringify(j.angle)}`);
  if (j.length !== undefined && !inRange(j.length, [0.5, 1])) e.push(`length must be 0.5..1, got ${JSON.stringify(j.length)}`);
  return e;
}
/** A valid preset answer as a plain L-system ({axiom, rules, angle, iterations}) plus the taper. */
export function lsystemFromPreset(j) {
  const p = L_PRESETS[j.preset]; const v = p.variants[j.variant];
  // the device lowers the iterations if this variant would pass 50000 symbols
  let it = j.iterations;
  while (it > 1 && expand({ axiom: v.axiom, rules: v.rules, iterations: it }).over) it--;
  return { axiom: v.axiom, rules: v.rules, angle: j.angle ?? v.angle, iterations: it, taper: j.length ?? 1, asked: j.iterations };
}

// ---------- scene-blocks: named building blocks the device expands ----------
export const BLOCKS = {
  table: 'w d h legs', 'ring-of': 'shape count radius size', 'grid-of': 'shape nx nz spacing size', stack: 'shape count gap size',
  tower: 'floors', fence: 'length', tree: 'height', 'lamp-post': '', arch: 'width height', staircase: 'steps spiral',
  'pyramid-of': 'shape levels size', maze: 'nx nz',
};
const SCENE_BLOCKS_SYSTEM = `You build a 3D scene for a device out of named building blocks and plain shapes; the device expands the blocks itself. Answer with ONE JSON object and nothing else.
The room is 20 m by 20 m and 6 m high: x and z from -10 to 10, y from 0 (floor) to 6 (ceiling). y is up. Units are metres.
Shape: { "items": [ item, ... ] }, at most 64 items. Every item may have "at": [x, z] (where it stands on the floor; default [0, 0]), "y": lift above the floor (default 0), "turn": degrees around the vertical axis, "material": one of ${list(MATERIALS)}, "color": "#rrggbb", "motions": [ { "signal": one of ${list(SIGNALS)}, "property": one of ${list(MOTION_PROPS)}, "range": [lo, hi] each -5..5, "attack": ms 0..5000, "release": ms 0..10000 } ].
Blocks ("size" is always [sx, sy, sz] full extents in metres of ONE piece; "shape" is one of ${list(SHAPES)}):
- {"block":"table","w":width,"d":depth,"h":height,"legs":1..4}
- {"block":"ring-of","shape":..,"count":2..200,"radius":r,"size":[..]} pieces standing in a circle around "at"
- {"block":"grid-of","shape":..,"nx":1..60,"nz":1..60,"spacing":s,"size":[..]} pieces in a grid centred on "at"
- {"block":"stack","shape":..,"count":1..30,"gap":g,"size":[..]} pieces piled straight up, g metres apart
- {"block":"tower","floors":1..10} a building, 2 m wide, 0.55 m per floor
- {"block":"fence","length":1..20} posts and rails along x (turn 90 for z)
- {"block":"tree","height":1..6} a trunk and a crown
- {"block":"lamp-post"} a 3 m post with a glowing lamp
- {"block":"arch","width":1..10,"height":1..6} two columns and a beam
- {"block":"staircase","steps":2..40,"spiral":true|false} steps 0.15 m high each, straight along x or winding around "at"
- {"block":"pyramid-of","shape":..,"levels":1..12,"size":[..]} square layers, each one smaller, stacked
- {"block":"maze","nx":3..15,"nz":3..15} hedge walls on a grid of 1.2 m cells centred on "at"
Plain shape: {"shape":..,"size":[sx,sy,sz],"rotation":[rx,ry,rz] degrees} with "at" and "y" (y is the BOTTOM of the shape, so 0 stands on the floor).
Caps: at most 2000 pieces in total, and everything must fit inside the room. No other keys.
Example: {"items":[{"shape":"disc","size":[6,0.1,6],"at":[0,0],"material":"water"},{"block":"ring-of","shape":"cylinder","count":8,"radius":5,"size":[0.5,3,0.5],"material":"stone"}]}`;

const BLOCK_KEYS = {
  table: ['w', 'd', 'h', 'legs'], 'ring-of': ['shape', 'count', 'radius', 'size'], 'grid-of': ['shape', 'nx', 'nz', 'spacing', 'size'],
  stack: ['shape', 'count', 'gap', 'size'], tower: ['floors'], fence: ['length'], tree: ['height'], 'lamp-post': [], arch: ['width', 'height'],
  staircase: ['steps', 'spiral'], 'pyramid-of': ['shape', 'levels', 'size'], maze: ['nx', 'nz'],
};
const ITEM_COMMON = ['at', 'y', 'turn', 'material', 'color', 'motions'];

/** Expand one valid item into plain scene shapes (position = centre, the old scene format). */
export function expandItem(it) {
  const [ax, az] = it.at || [0, 0]; const y0 = it.y || 0; const turn = ((it.turn || 0) * Math.PI) / 180;
  const mat = it.material || 'matte';
  const extra = { ...(it.color ? { color: it.color } : {}), ...(it.motions ? { motions: it.motions } : {}) };
  const out = [];
  // local (x, z) offset turned by "turn" and moved to "at"
  const P = (x, y, z) => [ax + x * Math.cos(turn) - z * Math.sin(turn), y0 + y, az + x * Math.sin(turn) + z * Math.cos(turn)];
  const S = (shape, size, pos, more = {}) => out.push({ shape, size, position: pos, material: more.material || mat, ...extra, ...more, ...(turn && !more.rotation ? { rotation: [0, -(it.turn || 0), 0] } : {}) });
  const b = it.block;
  if (!b) { S(it.shape, it.size, P(0, it.size[1] / 2, 0), it.rotation ? { rotation: it.rotation } : {}); return out; }
  if (b === 'table') {
    S('box', [it.w, 0.08, it.d], P(0, it.h - 0.04, 0));
    const lh = it.h - 0.08, lw = Math.min(0.12, it.w / 6);
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].slice(0, it.legs);
    if (it.legs === 1) S('cylinder', [lw * 2, lh, lw * 2], P(0, lh / 2, 0));
    else for (const [sx, sz] of corners) S('cylinder', [lw, lh, lw], P(sx * (it.w / 2 - lw), lh / 2, sz * (it.d / 2 - lw)));
  }
  if (b === 'ring-of') out.push({ shape: it.shape, size: it.size, position: P(0, it.size[1] / 2, 0), repeat: { kind: 'ring', count: it.count, radius: it.radius }, material: mat, ...extra });
  if (b === 'grid-of') out.push({ shape: it.shape, size: it.size, position: P(0, it.size[1] / 2, 0), repeat: { kind: 'grid', nx: it.nx, nz: it.nz, spacing: it.spacing }, material: mat, ...extra });
  if (b === 'stack') out.push({ shape: it.shape, size: it.size, position: P(0, it.size[1] / 2, 0), repeat: { kind: 'line', count: it.count, step: [0, it.size[1] + it.gap, 0] }, material: mat, ...extra });
  if (b === 'tower') {
    out.push({ shape: 'box', size: [2, 0.5, 2], position: P(0, 0.25, 0), repeat: { kind: 'line', count: it.floors, step: [0, 0.55, 0] }, material: it.material || 'stone', ...extra });
    S('box', [2.2, 0.1, 2.2], P(0, it.floors * 0.55 + 0.05, 0));
  }
  if (b === 'fence') {
    const n = Math.max(2, Math.round(it.length) + 1); const step = it.length / (n - 1);
    for (let i = 0; i < n; i++) S('box', [0.1, 1, 0.1], P(-it.length / 2 + i * step, 0.5, 0), { material: it.material || 'wood' });
    for (const h of [0.35, 0.8]) S('box', [it.length, 0.06, 0.05], P(0, h, 0), { material: it.material || 'wood' });
  }
  if (b === 'tree') {
    const h = it.height; S('cylinder', [0.08 * h, h * 0.55, 0.08 * h], P(0, h * 0.275, 0), { material: 'wood' });
    S('sphere', [h * 0.5, h * 0.5, h * 0.5], P(0, h * 0.75, 0), { material: it.material || 'matte', color: it.color || '#3f8a3a' });
  }
  if (b === 'lamp-post') { S('cylinder', [0.1, 3, 0.1], P(0, 1.5, 0), { material: 'metal' }); S('sphere', [0.35, 0.35, 0.35], P(0, 3.15, 0), { material: 'emissive' }); }
  if (b === 'arch') {
    const cw = Math.min(0.6, it.width / 5);
    for (const sx of [-1, 1]) S('box', [cw, it.height - 0.4, cw], P(sx * (it.width / 2 - cw / 2), (it.height - 0.4) / 2, 0));
    S('box', [it.width, 0.4, cw], P(0, it.height - 0.2, 0));
  }
  if (b === 'staircase') {
    for (let i = 0; i < it.steps; i++) {
      if (it.spiral) { const a = turn + i * (Math.PI / 8); const r = 1.2; out.push({ shape: 'box', size: [1.4, 0.15, 0.5], position: [ax + Math.cos(a) * r, y0 + 0.075 + i * 0.15, az + Math.sin(a) * r], rotation: [0, -(a * 180) / Math.PI, 0], material: mat, ...extra }); }
      else S('box', [0.3, 0.15, 1.2], P(i * 0.3, 0.075 + i * 0.15, 0));
    }
    if (it.spiral) S('cylinder', [0.3, it.steps * 0.15, 0.3], P(0, (it.steps * 0.15) / 2, 0));
  }
  if (b === 'pyramid-of') {
    for (let l = 0; l < it.levels; l++) { const n = it.levels - l; out.push({ shape: it.shape, size: it.size, position: P(0, it.size[1] / 2 + l * it.size[1], 0), repeat: { kind: 'grid', nx: n, nz: n, spacing: Math.max(it.size[0], it.size[2]) }, material: mat, ...extra }); }
  }
  if (b === 'maze') {
    // a fixed binary tree maze: every cell opens north or east, the walls are what is left
    const c = 1.2, W = it.nx * c, D = it.nz * c; let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const hedge = { material: it.material || 'matte', color: it.color || '#2f6b2f' };
    S('box', [W, 1.4, 0.3], P(0, 0.7, -D / 2), hedge); S('box', [W, 1.4, 0.3], P(0, 0.7, D / 2), hedge);
    S('box', [0.3, 1.4, D], P(-W / 2, 0.7, 0), hedge); S('box', [0.3, 1.4, D], P(W / 2, 0.7, 0), hedge);
    for (let i = 0; i < it.nx; i++) for (let k = 0; k < it.nz; k++) {
      if (i === it.nx - 1 || k === 0) continue;
      const x = -W / 2 + (i + 0.5) * c, z = -D / 2 + (k + 0.5) * c;
      if (rnd() < 0.5) S('box', [0.3, 1.4, c], P(x + c / 2, 0.7, z), hedge); else S('box', [c, 1.4, 0.3], P(x, 0.7, z - c / 2), hedge);
    }
  }
  return out;
}

export function validateSceneBlocks(j) {
  const e = [];
  if (!j || typeof j !== 'object' || Array.isArray(j)) return ['the answer is not a JSON object'];
  for (const k of Object.keys(j)) if (k !== 'items') e.push(`unknown top level key "${k}" (only "items")`);
  if (!Array.isArray(j.items) || !j.items.length) return [...e, 'items must be a non-empty array'];
  if (j.items.length > 64) e.push(`at most 64 items, got ${j.items.length}`);
  let total = 0;
  j.items.forEach((it, i) => {
    const at = `items[${i}]`; const ok0 = e.length;
    if (!it || typeof it !== 'object') { e.push(`${at} is not an object`); return; }
    const name = it.block ? `${at} (${it.block})` : at;
    let keys;
    if (it.block !== undefined) {
      if (!BLOCK_KEYS[it.block]) { e.push(`${at}.block must be one of ${list(Object.keys(BLOCK_KEYS))}, got ${JSON.stringify(it.block)}`); return; }
      keys = ['block', ...BLOCK_KEYS[it.block]];
    } else keys = ['shape', 'size', 'rotation'];
    for (const k of Object.keys(it)) if (!keys.includes(k) && !ITEM_COMMON.includes(k)) e.push(`${name} has unknown key "${k}" (allowed: ${list([...keys, ...ITEM_COMMON])})`);
    if (it.at !== undefined && !(Array.isArray(it.at) && it.at.length === 2 && it.at.every(isNum))) e.push(`${name}.at must be [x, z], got ${JSON.stringify(it.at)}`);
    if (it.y !== undefined && !inRange(it.y, [0, 6])) e.push(`${name}.y must be 0..6, got ${JSON.stringify(it.y)}`);
    if (it.turn !== undefined && !isNum(it.turn)) e.push(`${name}.turn must be degrees`);
    if (it.material !== undefined && !MATERIALS.includes(it.material)) e.push(`${name}.material must be one of ${list(MATERIALS)}, got ${JSON.stringify(it.material)}`);
    if (it.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(it.color))) e.push(`${name}.color must be "#rrggbb", got ${JSON.stringify(it.color)}`);
    const num = (k, lo, hi, int) => { if (!(int ? isInt(it[k]) : isNum(it[k])) || it[k] < lo || it[k] > hi) e.push(`${name}.${k} must be ${int ? 'an integer' : 'a number'} ${lo}..${hi}, got ${JSON.stringify(it[k])}`); };
    const shape = () => { if (!SHAPES.includes(it.shape)) e.push(`${name}.shape must be one of ${list(SHAPES)}, got ${JSON.stringify(it.shape)}`); };
    const size = () => { if (!vec3(it.size) || !it.size.every((v) => v >= 0.01 && v <= 20)) e.push(`${name}.size must be [sx,sy,sz] each 0.01..20, got ${JSON.stringify(it.size)}`); };
    const b = it.block;
    if (!b) { shape(); size(); if (it.rotation !== undefined && !vec3(it.rotation)) e.push(`${name}.rotation must be [rx,ry,rz] degrees`); }
    if (b === 'table') { num('w', 0.3, 10); num('d', 0.3, 10); num('h', 0.3, 3); num('legs', 1, 4, true); }
    if (b === 'ring-of') { shape(); num('count', 2, 200, true); num('radius', 0.1, 10); size(); }
    if (b === 'grid-of') { shape(); num('nx', 1, 60, true); num('nz', 1, 60, true); num('spacing', 0.05, 20); size(); }
    if (b === 'stack') { shape(); num('count', 1, 30, true); num('gap', 0, 5); size(); }
    if (b === 'tower') num('floors', 1, 10, true);
    if (b === 'fence') num('length', 1, 20);
    if (b === 'tree') num('height', 1, 6);
    if (b === 'arch') { num('width', 1, 10); num('height', 1, 6); }
    if (b === 'staircase') { num('steps', 2, 40, true); if (it.spiral !== undefined && typeof it.spiral !== 'boolean') e.push(`${name}.spiral must be true or false`); }
    if (b === 'pyramid-of') { shape(); num('levels', 1, 12, true); size(); }
    if (b === 'maze') { num('nx', 3, 15, true); num('nz', 3, 15, true); }
    if (e.length > ok0) return;
    // expand and check the room and the instance count with the scene validator, renamed for this item
    const parts = expandItem(it);
    const sub = validateScene({ shapes: parts }).filter((x) => !/at most 64 entries/.test(x));
    for (const x of sub) {
      if (/instances in total/.test(x)) continue;
      e.push(`${name}: ${x.replace(/shapes\[\d+\]/g, 'one piece')}`);
    }
    total += parts.reduce((s, p) => s + (p.repeat ? (p.repeat.kind === 'grid' ? p.repeat.nx * p.repeat.nz : p.repeat.count) : 1), 0);
  });
  if (total > 2000) e.push(`${total} pieces in total, the cap is 2000`);
  return e;
}
/** A valid scene-blocks answer as the plain scene the old renderers draw. */
export function sceneFromBlocks(j) { return { shapes: j.items.flatMap(expandItem) }; }

Object.assign(KINDS, {
  'patch-sv': { system: PATCH_SV_SYSTEM, schema: PATCH_SV_SCHEMA, validate: validatePatchSv, json: true, wishes: 'patch' },
  'sdf-tree': { system: SDF_TREE_SYSTEM, validate: validateSdfTree, json: true, compile: compileSdfTree, wishes: 'sdf' },
  'lsystem-presets': { system: LSYSTEM_PRESETS_SYSTEM, validate: validateLsystemPreset, json: true, wishes: 'lsystem' },
  'scene-blocks': { system: SCENE_BLOCKS_SYSTEM, validate: validateSceneBlocks, json: true, wishes: 'scene' },
});
