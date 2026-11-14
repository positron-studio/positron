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
