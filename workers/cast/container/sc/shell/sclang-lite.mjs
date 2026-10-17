// demo/shell/sclang-lite.mjs: a small subset of the SuperCollider language compiled to a SynthDef
// in the tab. Not sclang. Anything unknown is an error with a line and column; real scsynth on
// /collide/ grades the sound. Operators are left to right with no precedence (1 + 2 * 3 is 9).
// why: lessons/kit-sclang-lite.md#header

import { graph, RATE, fitsCeiling, SIZE_CEILING } from './synthdef.mjs';

/** Where the defaults below were read, so a reader can go and check them. */
export const SOURCE = 'SCClassLibrary/Common/Audio, supercollider develop 1995490, read 2026-09-30';

const REQUIRED = Symbol('required');

/**
 * The UGens this subset knows, with their arguments IN sclang's ORDER and with
 * sclang's defaults. `madd` means the class ends in `.madd(mul, add)`, so
 * `mul` and `add` follow its own arguments. `first` is the rate rule the class
 * enforces on its first input: `same` is `Filter`'s
 * `checkSameRateAsFirstInput`, `audio` is `Pan2`'s `checkNInputs(1)`.
 */
export const UGENS = {
  SinOsc:     { file: 'Osc.sc',     args: [['freq', 440], ['phase', 0]], madd: true },
  Saw:        { file: 'FSinOsc.sc', args: [['freq', 440]], madd: true },
  Pulse:      { file: 'FSinOsc.sc', args: [['freq', 440], ['width', 0.5]], madd: true },
  LFSaw:      { file: 'Osc.sc',     args: [['freq', 440], ['iphase', 0]], madd: true },
  LFTri:      { file: 'Osc.sc',     args: [['freq', 440], ['iphase', 0]], madd: true },
  LFNoise1:   { file: 'Noise.sc',   args: [['freq', 500]], madd: true },
  WhiteNoise: { file: 'Noise.sc',   args: [], madd: true },
  LPF:        { file: 'Filter.sc',  args: [['in', 0], ['freq', 440]], madd: true, first: 'same' },
  HPF:        { file: 'Filter.sc',  args: [['in', 0], ['freq', 440]], madd: true, first: 'same' },
  RLPF:       { file: 'Filter.sc',  args: [['in', 0], ['freq', 440], ['rq', 1]], madd: true, first: 'same' },
  Pan2:       { file: 'Pan.sc',     args: [['in', REQUIRED], ['pos', 0], ['level', 1]], outputs: 2, first: 'audio' },
  EnvGen:     { file: 'EnvGen.sc',  args: [['envelope', REQUIRED], ['gate', 1], ['levelScale', 1],
                                             ['levelBias', 0], ['timeScale', 1], ['doneAction', 0]] },
  // Grain ring UGens. `rates` the methods the class has, `chans` the output count argument,
  // `inline` an array spliced into the inputs, `order` the server's input order where it differs.
  // `outputs: 0` answers 0.0 as sclang does; `noAlias` changes the wire count (wirePeak).
  // why: lessons/kit-sclang-lite.md#ugens-grain-ring
  Impulse:    { file: 'Osc.sc',     args: [['freq', 440], ['phase', 0]], madd: true, unipolar: true },
  Dust:       { file: 'Noise.sc',   args: [['density', 0]], madd: true, unipolar: true },
  TRand:      { file: 'Noise.sc',   args: [['lo', 0], ['hi', 1], ['trig', 0]] },
  Phasor:     { file: 'Trig.sc',    args: [['trig', 0], ['rate', 1], ['start', 0], ['end', 1], ['resetPos', 0]] },
  BufFrames:  { file: 'InfoUGens.sc', args: [['bufnum', REQUIRED]], rates: ['kr'] },
  BufDur:     { file: 'InfoUGens.sc', args: [['bufnum', REQUIRED]], rates: ['kr'] },
  In:         { file: 'InOut.sc',   args: [['bus', 0], ['numChannels', 1]], chans: 'numChannels' },
  BufWr:      { file: 'BufIO.sc',   args: [['inputArray', REQUIRED], ['bufnum', 0], ['phase', 0], ['loop', 1]],
                inline: 'inputArray', order: ['bufnum', 'phase', 'loop', 'inputArray'] },
  GrainBuf:   { file: 'GrainUGens.sc', args: [['numChannels', 1], ['trigger', 0], ['dur', 1], ['sndbuf', REQUIRED],
                ['rate', 1], ['pos', 0], ['interp', 2], ['pan', 0], ['envbufnum', -1], ['maxGrains', 512]],
                madd: true, chans: 'numChannels', rates: ['ar'], noAlias: true },
  SendReply:  { file: 'Trig.sc',    args: [['trig', 0], ['cmdName', '/reply'], ['values', REQUIRED], ['replyID', -1]],
                inline: 'values', order: ['trig', 'replyID', '#cmdName', 'values'], outputs: 0, first: 'same' },
  // The ring's echo: DelayC (Delay.sc), LocalIn (`wrap`, one default per channel) and LocalOut
  // (`allAudio`, every channel audio rate; a number into it is refused), from InOut.sc.
  // why: lessons/kit-sclang-lite.md#ugens-echo
  DelayC:     { file: 'Delay.sc',   args: [['in', 0], ['maxdelaytime', 0.2], ['delaytime', 0.2]], madd: true, first: 'same' },
  LocalIn:    { file: 'InOut.sc',   args: [['numChannels', 1], ['default', 0]], chans: 'numChannels', inline: 'default', wrap: true },
  LocalOut:   { file: 'InOut.sc',   args: [['channelsArray', REQUIRED]], inline: 'channelsArray', order: ['channelsArray'],
                outputs: 0, allAudio: true },
};

/** `Env`'s class methods, from `Env.sc`, arguments and defaults verbatim. */
export const ENVS = {
  adsr: [['attackTime', 0.01], ['decayTime', 0.3], ['sustainLevel', 0.5], ['releaseTime', 1],
         ['peakLevel', 1], ['curve', -4], ['bias', 0]],
  perc: [['attackTime', 0.01], ['releaseTime', 1], ['level', 1], ['curve', -4]],
  new:  [['levels', [0, 1, 0]], ['times', [1, 1]], ['curve', 'lin'], ['releaseNode', null], ['loopNode', null]],
};

/** `Env.shapeNames`, from `Env.sc`'s `initClass`. A number is shape 5. */
export const SHAPES = { step: 0, lin: 1, linear: 1, exp: 2, exponential: 2, sin: 3, sine: 3,
  wel: 4, welch: 4, sqr: 6, squared: 6, cub: 7, cubed: 7, hold: 8 };

/**
 * `Spec.specs` as `Spec.sc`'s `initClass` fills it, the entries a knob can be
 * drawn from, verbatim: `[min, max, warp, step, default]`. Left out:
 * `audiobus` and `controlbus`, which read a running server's options, and
 * `db` and `amp`, whose warps are the fader curves this subset refuses.
 */
export const SPECS = {
  unipolar: [0, 1, 'lin', 0, 0], bipolar: [-1, 1, 'lin', 0, 0],
  freq: [20, 20000, 'exp', 0, 440], lofreq: [0.1, 100, 'exp', 0, 6],
  midfreq: [25, 4200, 'exp', 0, 440], widefreq: [0.1, 20000, 'exp', 0, 440],
  phase: [0, 2 * Math.PI, 'lin', 0, 0], rq: [0.001, 2, 'exp', 0, 0.707],
  midi: [0, 127, 'lin', 0, 64], midinote: [0, 127, 'lin', 0, 60], midivelocity: [1, 127, 'lin', 0, 64],
  boostcut: [-20, 20, 'lin', 0, 0], pan: [-1, 1, 'lin', 0, 0], detune: [-20, 20, 'lin', 0, 0],
  rate: [0.125, 8, 'exp', 0, 1], beats: [0, 20, 'lin', 0, 0], delay: [0.0001, 1, 'exp', 0, 0.3],
};
/** Warp names `Warp.warps` knows, and what this subset calls each. `amp` and `db` are refused. */
const WARPS = { lin: 'lin', linear: 'lin', exp: 'exp', exponential: 'exp', sin: 'sin', cos: 'cos' };

/**
 * The controls a KEY sets, so no knob is drawn for them: the page sends
 * `freq` and `gate` in `/s_new`, and `amp` is the patch's own level.
 */
export const KEYED = ['freq', 'amp', 'gate'];

/**
 * A spec for a control given none: `Spec.specs` by name, then 0 to 1 when the value fits.
 * Past that, this file's own guess (0 to twice the value), flagged `guessed` to the page.
 * why: lessons/kit-sclang-lite.md#spec-for
 */
export function specFor(name, value) {
  const named = SPECS[name];
  if (named) {
    const [min, max, warp, step] = named;
    if (value >= Math.min(min, max) && value <= Math.max(min, max)) return { min, max, warp, step, guessed: false };
  }
  if (value >= 0 && value <= 1) return { min: 0, max: 1, warp: 'lin', step: 0, guessed: false };
  const m = Math.abs(value) * 2;
  return value > 0 ? { min: 0, max: m, warp: 'lin', step: 0, guessed: true }
    : { min: -m, max: m, warp: 'lin', step: 0, guessed: true };
}

/** `BinaryOpUGens.cpp`: opAdd 0, opSub 1, opMul 2, opIDiv 3, opFDiv 4, opMod 5. */
export const BINARY = { '+': 0, '-': 1, '*': 2, '/': 4, '%': 5 };
/** `UnaryOpUGens.cpp`: opNeg 0, opAbs 5, opSquared 12, opSqrt 14, opMIDICPS 17, opSin 28, opCos 29, opTanH 36. */
export const UNARY = { neg: 0, abs: 5, squared: 12, sqrt: 14, midicps: 17, sin: 28, cos: 29, tanh: 36 };
const FOLD1 = {
  neg: (x) => -x, abs: Math.abs, squared: (x) => x * x,
  // `sc_sqrt` in `SC_InlineUnaryOp.h`: the root of a negative number is the
  // negative of the root of its size, not NaN.
  sqrt: (x) => (x < 0 ? -Math.sqrt(-x) : Math.sqrt(x)),
  midicps: (x) => 440 * 2 ** ((x - 69) / 12), sin: Math.sin, cos: Math.cos, tanh: Math.tanh,
};
/** UGen.sc's `range` and `exprange`, arguments and defaults verbatim. */
export const RANGES = { range: [['lo', 0], ['hi', 1]], exprange: [['lo', 0.01], ['hi', 1]] };
/** Every method this subset takes on a value, in the order a refusal names them. */
export const METHODS = [...Object.keys(UNARY), 'dup', ...Object.keys(RANGES)];
/** `sc_mod` in `SC_InlineBinaryOp.h`: the result is always on the divisor's side of zero, so -0.25 % 1 is 0.75. */
const scMod = (a, b) => (b === 0 ? 0 : a - b * Math.floor(a / b));

/**
 * 64 audio wires alive at once (scsynth's default maxWireBufs). Over it the engine may stop
 * answering or reply /fail, so it is counted with `wirePeak` and refused before sending.
 * why: lessons/kit-sclang-lite.md#wire-ceiling
 */
export const WIRE_CEILING = 64;

/** Most channels the last line may have. See the header. */
export const MAX_CHANNELS = 2;
/** The most copies `!` or `.dup` will make, which is a guard and not a claim about sclang. */
export const MAX_DUP = 16;

export class SclError extends Error {
  constructor(message, at) {
    super(message);
    this.line = at?.line ?? 0;
    this.col = at?.col ?? 0;
  }
}

// ── reading the text ──────────────────────────────────────────────────────────

const PUNCT = new Set(['{', '}', '(', ')', '[', ']', '|', ',', ';', '.', '=', ':']);
const OPCHARS = '+-*/<>=!%&@?^~|';

/**
 * Tokens with a line and a column each, 1 based, which is what a person
 * counts in an editor. A `-` straight after something that ends a value is
 * subtraction; anywhere else it is unary minus, which is how sclang reads it.
 */
export function lex(src) {
  const out = [];
  let i = 0, line = 1, col = 1;
  const at = () => ({ line, col });
  const step = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; } else col++;
      i++;
    }
  };
  const push = (t, v, pos) => out.push({ t, v, line: pos.line, col: pos.col });
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { step(); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') step(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      // sclang nests block comments, so `/* a /* b */ c */` is one comment.
      const start = at();
      let depth = 0;
      do {
        if (src[i] === '/' && src[i + 1] === '*') { depth++; step(2); continue; }
        if (src[i] === '*' && src[i + 1] === '/') { depth--; step(2); continue; }
        if (i >= src.length) throw new SclError('a /* comment is never closed', start);
        step();
      } while (depth > 0);
      continue;
    }
    const pos = at();
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?/.exec(src.slice(i));
      let v = Number(m[0]);
      step(m[0].length);
      if (src.startsWith('pi', i) && !/[A-Za-z0-9_]/.test(src[i + 2] ?? '')) { v *= Math.PI; step(2); }
      else if (/[A-Za-z_]/.test(src[i] ?? '')) throw new SclError(`${m[0]}${src[i]} is not a number this reads`, pos);
      push('num', v, pos);
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
      step(m.length);
      if (src[i] === ':' && /[a-z]/.test(m[0])) { step(); push('key', m, pos); continue; }
      push(/[A-Z]/.test(m[0]) ? 'cls' : 'id', m, pos);
      continue;
    }
    if (c === '\\') {
      const m = /^\\([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i));
      if (!m) throw new SclError('a \\ has to start a symbol like \\lin', pos);
      step(m[0].length);
      push('sym', m[1], pos);
      continue;
    }
    if (c === '"') throw new SclError('strings are not in this subset', pos);
    if (c === "'") {
      // A quoted symbol, which sclang reads as a Symbol exactly like `\name`
      // and which is the only way to write one with a `/` in it: SendReply's
      // cmdName is `'/reply'` in its own class file.
      const m = /^'((?:[^'\\\n])*)'/.exec(src.slice(i));
      if (!m) throw new SclError("a 'quoted symbol' has to close on the same line", pos);
      step(m[0].length);
      push('sym', m[1], pos);
      continue;
    }
    if (c === '~') throw new SclError('~environment variables are not in this subset, use var', pos);
    if (c === '#') throw new SclError('#[literal arrays] are not in this subset, use [ ]', pos);
    if (c === '|' ) { step(); push('punc', '|', pos); continue; }
    if (c === '=' && src[i + 1] !== '=') { step(); push('punc', '=', pos); continue; }
    if (c === '-' || c === '+' || c === '*' || c === '/' || c === '!' || c === '%') {
      // A run of operator characters is one operator in sclang, so `**` and
      // `!=` are read whole and refused whole rather than as two things.
      let j = i;
      while (j < src.length && OPCHARS.includes(src[j]) && !(src[j] === '/' && (src[j + 1] === '/' || src[j + 1] === '*'))) j++;
      const op = src.slice(i, j);
      step(op.length);
      if (!['+', '-', '*', '/', '%', '!'].includes(op)) throw new SclError(`the operator ${op} is not in this subset, only + - * / % and !`, pos);
      push('op', op, pos);
      continue;
    }
    if (OPCHARS.includes(c)) {
      let j = i;
      while (j < src.length && OPCHARS.includes(src[j])) j++;
      throw new SclError(`the operator ${src.slice(i, j)} is not in this subset, only + - * / % and !`, pos);
    }
    if (PUNCT.has(c)) { step(); push('punc', c, pos); continue; }
    throw new SclError(`${JSON.stringify(c)} is not something this reads`, pos);
  }
  out.push({ t: 'eof', v: null, line, col });
  return out;
}

// ── values while compiling ────────────────────────────────────────────────────
//
// A value is a number (known now, so arithmetic on it is done here, the way
// sclang does it in the language), a signal (a block's output, with a rate),
// an array of those, an envelope, or a symbol that is only ever an Env curve.

const num = (v) => ({ k: 'num', v });
const isNum = (x) => x.k === 'num';
const RATE_WORD = ['scalar', 'control', 'audio'];

/**
 * Compile one function literal to a SynthDef.
 *
 * @param {string} src
 * @param {{name?: string, bus?: number}} [o]  `bus` is the output bus the last line goes to,
 *   0 by default; the engine must be booted with that many output channels, or the bus is an input.
 * @returns {{ok: true, bytes: Uint8Array, name: string, params: {name: string, value: number}[],
 *   channels: number, blocks: number, wires: number, gate: boolean, gateUsed: boolean,
 *   freesItself: boolean, kinds: string[], warnings: string[]}
 *   | {ok: false, error: string, line: number, col: number, message: string}}
 * why: lessons/kit-sclang-lite.md#compile
 */
export function compile(src, { name = 'collide', bus = 0 } = {}) {
  try {
    return compileOrThrow(String(src ?? ''), name, Math.max(0, Math.floor(Number(bus) || 0)));
  } catch (e) {
    if (!(e instanceof SclError)) throw e;
    return { ok: false, error: e.message, line: e.line, col: e.col,
             message: `line ${e.line}, column ${e.col}: ${e.message}` };
  }
}

function compileOrThrow(src, name, bus = 0) {
  const toks = lex(src);
  let p = 0;
  const peek = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
  const next = () => toks[p++];
  const is = (t, v) => peek().t === t && (v === undefined || peek().v === v);
  const expect = (t, v, what) => {
    if (is(t, v)) return next();
    const got = peek();
    throw new SclError(`expected ${what ?? v ?? t} here, found ${got.t === 'eof' ? 'the end' : JSON.stringify(got.v)}`, got);
  };

  const g = graph(name);
  /** What the graph has in it, for the wire count and the report. */
  const blocks = [];
  const warnings = [];

  /** One block into the graph, and the same block into this file's own list. `meta` is what a report needs. */
  function add(cls, rate, inputs, outCount = 1, special = 0, meta = {}) {
    const ref = g.block(cls, rate, inputs, outCount, special);
    blocks.push({ cls, rate, inputs: inputs.map((x) => ({ ...x })), outs: outCount, special, ...meta });
    return ref;
  }
  const input = (x, at) => {
    if (x.k === 'num') return g.value(x.v);
    if (x.k === 'sig') return x.ref;
    throw new SclError(`${describe(x)} cannot go into a UGen input here`, at);
  };
  const rateOf = (x) => (x.k === 'sig' ? x.rate : 0);

  // ── arithmetic, with sclang's folding ──────────────────────────────────────

  function binop(op, a, b, at) {
    if (op === '!') return dup(a, b, at);
    if (a.k === 'arr' || b.k === 'arr') {
      const A = a.k === 'arr' ? a.items : [a], B = b.k === 'arr' ? b.items : [b];
      const n = Math.max(A.length, B.length);
      return { k: 'arr', items: Array.from({ length: n }, (_, i) => binop(op, A[i % A.length], B[i % B.length], at)) };
    }
    for (const x of [a, b]) {
      if (x.k !== 'num' && x.k !== 'sig') throw new SclError(`${describe(x)} cannot take part in ${op}`, at);
    }
    if (isNum(a) && isNum(b)) {
      if (op === '+') return num(a.v + b.v);
      if (op === '-') return num(a.v - b.v);
      if (op === '*') return num(a.v * b.v);
      if (op === '%') return num(scMod(a.v, b.v));
      return num(a.v / b.v);
    }
    // `BinaryOpUGen.new1`'s degenerate cases, in its order.
    const eq = (x, v) => isNum(x) && x.v === v;
    if (op === '*') {
      if (eq(a, 0) || eq(b, 0)) return num(0);
      if (eq(a, 1)) return b;
      if (eq(a, -1)) return unop('neg', b, at);
      if (eq(b, 1)) return a;
      if (eq(b, -1)) return unop('neg', a, at);
    } else if (op === '+') {
      if (eq(a, 0)) return b;
      if (eq(b, 0)) return a;
    } else if (op === '-') {
      if (eq(a, 0)) return unop('neg', b, at);
      if (eq(b, 0)) return a;
    } else if (op === '/') {
      if (eq(b, 1)) return a;
      if (eq(b, -1)) return unop('neg', a, at);
    }
    const rate = Math.max(rateOf(a), rateOf(b));
    return { k: 'sig', rate, ref: add('BinaryOpUGen', rate, [input(a, at), input(b, at)], 1, BINARY[op]) };
  }

  function unop(op, a, at) {
    if (a.k === 'arr') return { k: 'arr', items: a.items.map((x) => unop(op, x, at)) };
    if (isNum(a)) return num(FOLD1[op](a.v));
    if (a.k !== 'sig') throw new SclError(`${describe(a)} has no .${op}`, at);
    return { k: 'sig', rate: a.rate, ref: add('UnaryOpUGen', a.rate, [a.ref], 1, UNARY[op]) };
  }

  function dup(a, b, at) {
    if (!isNum(b) || !Number.isInteger(b.v) || b.v < 1 || b.v > MAX_DUP) {
      throw new SclError(`! and .dup take a whole number from 1 to ${MAX_DUP}`, at);
    }
    if (a.k === 'arr') throw new SclError('an array of arrays is not in this subset', at);
    return { k: 'arr', items: Array.from({ length: b.v }, () => a) };
  }

  function madd(x, mul, add_, at) {
    // `MulAdd.new1`'s degenerate cases, then two ordinary blocks. See the header.
    let y = binop('*', x, mul, at);
    y = binop('+', y, add_, at);
    return y;
  }

  // ── arguments to a call ─────────────────────────────────────────────────────

  /**
   * Bind what was written to the names a class declares. Positional first,
   * then keywords, and every keyword has to be a name the class knows.
   */
  function bind(spec, got, who, at) {
    const names = spec.map(([k]) => k);
    const out = new Map();
    let seenKey = false;
    got.forEach((a, i) => {
      if (a.key) {
        seenKey = true;
        if (!names.includes(a.key)) {
          throw new SclError(`${who} has no argument called ${a.key}; it takes ${names.join(', ') || 'none'}`, a.at);
        }
        if (out.has(a.key)) throw new SclError(`${a.key} is given twice to ${who}`, a.at);
        out.set(a.key, a.val);
        return;
      }
      if (seenKey) throw new SclError(`a positional argument after a keyword one, in ${who}`, a.at);
      if (i >= names.length) throw new SclError(`${who} takes ${names.length} arguments and this is argument ${i + 1}`, a.at);
      out.set(names[i], a.val);
    });
    return spec.map(([k, dflt]) => {
      if (out.has(k)) return out.get(k);
      if (dflt === REQUIRED) throw new SclError(`${who} needs its ${k} argument`, at);
      return fromDefault(dflt);
    });
  }
  const fromDefault = (d) => (d === null ? { k: 'nil' }
    : typeof d === 'string' ? { k: 'sym', v: d }
      : Array.isArray(d) ? { k: 'arr', items: d.map(num) } : num(d));

  // ── UGens ───────────────────────────────────────────────────────────────────

  function ugen(cls, method, got, at) {
    const spec = UGENS[cls];
    if (method !== 'ar' && method !== 'kr') {
      throw new SclError(`${cls}.${method} is not in this subset, only ${cls}.ar and ${cls}.kr`, at);
    }
    const argSpec = spec.madd ? [...spec.args, ['mul', 1], ['add', 0]] : spec.args;
    const vals = bind(argSpec, got, `${cls}.${method}`, at);
    const rate = method === 'ar' ? RATE.sample : RATE.slow;
    const own = vals.slice(0, spec.args.length);
    const [mul, addv] = spec.madd ? vals.slice(spec.args.length) : [num(1), num(0)];
    // The arguments that are not inputs to expand over: the output count, a
    // spliced array and a symbol. Each is checked here and passed through whole.
    const names = spec.args.map(([k]) => k);
    const fixed = new Map();
    if (spec.chans) {
      const c = own[names.indexOf(spec.chans)];
      if (!isNum(c) || !Number.isInteger(c.v) || c.v < 1 || c.v > MAX_CHANNELS) {
        throw new SclError(`${cls}'s ${spec.chans} is how many outputs it has, a whole number from 1 to ${MAX_CHANNELS} here, not ${describe(c)}`, at);
      }
      fixed.set(spec.chans, c);
    }
    if (spec.inline) {
      const v = own[names.indexOf(spec.inline)];
      const items = v.k === 'arr' ? v.items : [v];
      for (const x of items) {
        if (x.k === 'arr') throw new SclError(`${cls}'s ${spec.inline} is one array, and an array of arrays is not in this subset`, at);
        if (x.k !== 'num' && x.k !== 'sig') throw new SclError(`${describe(x)} cannot go into ${cls}'s ${spec.inline}`, at);
      }
      // LocalIn's `argDefault.wrapExtend(numChannels)`: one default per channel.
      const n = spec.wrap ? fixed.get(spec.chans).v : items.length;
      fixed.set(spec.inline, { k: 'arr', items: Array.from({ length: n }, (_, i) => items[i % items.length]) });
    }
    for (const k of ['cmdName']) {
      if (!names.includes(k)) continue;
      const v = own[names.indexOf(k)];
      if (v.k !== 'sym') throw new SclError(`${cls}'s ${k} is a symbol like '/reply', not ${describe(v)}`, at);
      if (!/^[\x20-\x7e]+$/.test(v.v)) throw new SclError(`${cls}'s ${k} is written in plain ASCII here, and '${v.v}' is not`, at);
      fixed.set(k, v);
    }
    const plain = names.map((k, i) => (fixed.has(k) ? num(0) : own[i]));
    const made = expand(plain, (items) => one(cls, spec, rate,
      items.map((x, i) => (fixed.has(names[i]) ? fixed.get(names[i]) : x)), at), at, cls === 'EnvGen');
    return spec.madd ? madd(made, mul, addv, at) : made;
  }

  /** sclang's multichannel expansion: an array anywhere makes one block per item. */
  function expand(vals, make, at, refuse) {
    const width = Math.max(1, ...vals.map((v) => (v.k === 'arr' ? v.items.length : 1)));
    if (width === 1) return make(vals);
    if (refuse) throw new SclError('an array into EnvGen is not in this subset', at);
    const items = Array.from({ length: width }, (_, i) => make(vals.map((v) => (v.k === 'arr' ? v.items[i % v.items.length] : v))));
    if (items.some((x) => x.k === 'arr')) throw new SclError('that makes an array of arrays, which is not in this subset; Mix it first', at);
    return { k: 'arr', items };
  }

  function one(cls, spec, rate, vals, at) {
    let ins, meta = {};
    if (cls === 'EnvGen') {
      const [env, ...rest] = vals;
      if (env.k !== 'env') throw new SclError('EnvGen needs an Env as its first argument', at);
      ins = [...rest, ...envArray(env, at)];
      // doneAction is the fifth input: gate, levelScale, levelBias, timeScale, doneAction.
      meta = { doneAction: isNum(rest[4]) ? rest[4].v : null };
    } else if (spec.order || spec.chans) {
      const by = new Map(spec.args.map(([k], i) => [k, vals[i]]));
      ins = [];
      for (const k of spec.order ?? spec.args.map(([n]) => n)) {
        if (k === spec.chans) continue;
        if (k === '#cmdName') {
          const codes = [...by.get('cmdName').v].map((ch) => num(ch.charCodeAt(0)));
          ins.push(num(codes.length), ...codes);
        } else if (k === spec.inline) ins.push(...by.get(k).items);
        else ins.push(by.get(k));
      }
      // BufWr's own `checkInputs`: at audio rate its phase and everything it
      // writes have to be audio rate too.
      if (cls === 'BufWr' && rate === RATE.sample) {
        if (rateOf(by.get('phase')) !== RATE.sample) throw new SclError(`BufWr.ar: its phase is ${RATE_WORD[rateOf(by.get('phase'))]} rate and has to be audio rate`, at);
        if (by.get('inputArray').items.some((x) => rateOf(x) !== RATE.sample)) throw new SclError('BufWr.ar: what it writes has to be audio rate', at);
      }
      // LocalOut's `AbstractOut.checkInputs`: at audio rate every channel is audio rate.
      if (spec.allAudio && rate === RATE.sample && ins.some((x) => rateOf(x) !== RATE.sample)) {
        throw new SclError(`${cls}.ar: every channel it writes has to be audio rate`, at);
      }
    } else {
      ins = vals;
    }
    if (spec.first && ins.length) {
      const r0 = rateOf(ins[0]);
      if (spec.first === 'same' && r0 !== rate) {
        throw new SclError(`${cls}.${rate === RATE.sample ? 'ar' : 'kr'}: its first input is ${RATE_WORD[r0]} rate and has to be ${RATE_WORD[rate]} rate`, at);
      }
      if (spec.first === 'audio' && rate === RATE.sample && r0 !== RATE.sample) {
        throw new SclError(`${cls}.ar: its first input is ${RATE_WORD[r0]} rate and has to be audio rate`, at);
      }
    }
    const refs = ins.map((x) => input(x, at));
    const outs = spec.chans ? vals[spec.args.findIndex(([k]) => k === spec.chans)].v : (spec.outputs ?? 1);
    const ref = add(cls, rate, refs, outs, 0, meta);
    // SendReply answers 0.0, sclang's own `^0.0`: it has no output to read.
    if (outs === 0) return num(0);
    // `signalRange { ^\unipolar }` in the class file; .range reads it (UGen.sc). Arithmetic makes it bipolar again.
    if (outs === 1) return { k: 'sig', rate, ref, ...(spec.unipolar ? { uni: true } : {}) };
    return { k: 'arr', items: Array.from({ length: outs }, (_, i) => ({ k: 'sig', rate, ref: { from: ref.from, out: i } })) };
  }

  // ── Env ─────────────────────────────────────────────────────────────────────

  function envCall(method, got, at) {
    if (!ENVS[method]) throw new SclError(`Env.${method} is not in this subset, only Env.adsr, Env.perc and Env.new`, at);
    const v = bind(ENVS[method], got, `Env.${method}`, at);
    if (method === 'adsr') {
      const [a, d, s, r, peak, curve, bias] = v;
      const levels = [num(0), peak, binop('*', peak, s, at), num(0)].map((x) => binop('+', x, bias, at));
      return makeEnv(levels, [a, d, r], curve, num(2), { k: 'nil' }, at);
    }
    if (method === 'perc') {
      const [a, r, level, curve] = v;
      return makeEnv([num(0), level, num(0)], [a, r], curve, { k: 'nil' }, { k: 'nil' }, at);
    }
    const [levels, times, curve, rel, loop] = v;
    if (levels.k !== 'arr' || levels.items.length < 2) throw new SclError('Env.new needs an array of at least two levels', at);
    const T = times.k === 'arr' ? times.items : [times];
    // `times.asArray.wrapExtend(levels.size - 1)`, from `Env.new`.
    const wrapped = Array.from({ length: levels.items.length - 1 }, (_, i) => T[i % T.length]);
    return makeEnv(levels.items, wrapped, curve, rel, loop, at);
  }

  function makeEnv(levels, times, curve, rel, loop, at) {
    for (const x of [...levels, ...times]) {
      if (x.k !== 'num' && x.k !== 'sig') throw new SclError(`${describe(x)} cannot be an Env level or time`, at);
    }
    const curves = curve.k === 'arr' ? curve.items : [curve];
    for (const c of curves) {
      if (c.k === 'sym' && !(c.v in SHAPES)) throw new SclError(`\\${c.v} is not one of Env's shapes: ${Object.keys(SHAPES).join(', ')}`, c.at ?? at);
      if (c.k !== 'sym' && c.k !== 'num' && c.k !== 'sig') throw new SclError(`${describe(c)} cannot be an Env curve`, at);
    }
    for (const [n, x] of [['releaseNode', rel], ['loopNode', loop]]) {
      if (x.k !== 'nil' && !(isNum(x) && Number.isInteger(x.v))) throw new SclError(`${n} has to be a whole number or left out`, at);
    }
    return { k: 'env', levels, times, curves, rel, loop };
  }

  /** `Env.sc`'s `prAsArray`, field for field. */
  function envArray(env, at) {
    const out = [env.levels[0], num(env.times.length),
      env.rel.k === 'nil' ? num(-99) : env.rel, env.loop.k === 'nil' ? num(-99) : env.loop];
    env.times.forEach((t, i) => {
      const c = env.curves[i % env.curves.length];
      out.push(env.levels[i + 1], t,
        c.k === 'sym' ? num(SHAPES[c.v]) : num(5),
        c.k === 'sym' ? num(0) : c);
    });
    for (const x of out) if (x.k === 'arr') throw new SclError('an array inside an Env is not in this subset', at);
    return out;
  }

  // ── Mix ─────────────────────────────────────────────────────────────────────

  function mix(method, got, at) {
    if (method !== 'new' && method !== 'ar') throw new SclError(`Mix.${method} is not in this subset, only Mix(...), Mix.new and Mix.ar`, at);
    if (got.length !== 1 || got[0].key) throw new SclError(`Mix.${method} takes one array`, at);
    const x = got[0].val;
    let sum = x.k === 'arr' ? x.items.reduce((s, y) => binop('+', s, y, at)) : x;
    if (method === 'ar') {
      if (isNum(sum)) throw new SclError('Mix.ar of numbers is not in this subset', at);
      // `Mix.ar`: a control rate result goes through `K2A.ar`, from `Mix.sc`.
      if (sum.k === 'sig' && sum.rate === RATE.slow) sum = { k: 'sig', rate: RATE.sample, ref: add('K2A', RATE.sample, [sum.ref]) };
    }
    return sum;
  }

  // ── named controls ──────────────────────────────────────────────────────────

  /** name -> { value, lag, spec, ref, at }, one per name, as `NamedControl`'s dictionary is. */
  const named = new Map();
  /** Every control in the order the value array holds them: arguments, then named ones. */
  const controls = [];

  /** A spec written in the program: `\freq`, or `[min, max, warp, step, default]`. */
  function readSpec(x, at) {
    if (x.k === 'sym') {
      if (!SPECS[x.v]) throw new SclError(`\\${x.v} is not a spec this subset knows; it knows ${Object.keys(SPECS).map((k) => `\\${k}`).join(' ')}`, x.at ?? at);
      const [min, max, warp, step, dflt] = SPECS[x.v];
      return { min, max, warp, step, default: dflt };
    }
    if (x.k !== 'arr') throw new SclError(`spec: is an array like [0.05, 6, \\exp] or a name like \\freq, not ${describe(x)}`, at);
    const it = x.items;
    if (it.length < 2 || it.length > 5) throw new SclError(`spec: [min, max, warp, step, default] has two to five things in it, not ${it.length}`, at);
    for (const i of [0, 1, 3, 4]) {
      if (it[i] && !isNum(it[i])) throw new SclError(`spec: its ${['min', 'max', '', 'step', 'default'][i]} has to be a number`, at);
    }
    let warp = 'lin';
    const w = it[2];
    if (w) {
      if (w.k === 'sym') {
        if (w.v === 'amp' || w.v === 'db') throw new SclError(`\\${w.v} is one of sclang's fader warps, which this subset cannot draw a knob for; use \\lin, \\exp or a curve number`, w.at ?? at);
        if (!WARPS[w.v]) throw new SclError(`\\${w.v} is not a warp; sclang knows \\lin \\exp \\sin \\cos \\amp \\db or a curve number`, w.at ?? at);
        warp = WARPS[w.v];
      } else if (isNum(w)) {
        // `CurveWarp.new` hands back a LinearWarp under 0.001, "to prevent math blow up".
        warp = Math.abs(w.v) < 0.001 ? 'lin' : w.v;
      } else throw new SclError(`spec: its warp is a symbol like \\exp or a curve number, not ${describe(w)}`, at);
    }
    const min = it[0].v, max = it[1].v;
    const step = it[3] ? it[3].v : 0;
    if (min === max) throw new SclError(`spec: a range from ${min} to ${max} is no range, so there is nothing for a knob to turn`, at);
    if (warp === 'exp' && !(min * max > 0)) throw new SclError(`spec: \\exp needs both ends on one side of zero, and ${min} to ${max} is not`, at);
    if (step < 0) throw new SclError('spec: a step below zero is not a step', at);
    // `ControlSpec.new`'s `default ? minval`.
    return { min, max, warp, step, default: it[4] ? it[4].v : min };
  }

  /**
   * `\name.kr(val, lag, fixedLag, spec)`, which is `NamedControl.kr`. See the
   * header for what sclang builds and what this refuses.
   */
  function namedControl(sym, m, got, at = sym.at ?? m) {
    const nm = sym.v;
    if (m.v !== 'kr') {
      const why = { ar: 'an audio rate control', ir: 'a control read once when the note starts', tr: 'a trigger control' }[m.v];
      throw new SclError(`\\${nm}.${m.v} is ${why}, which is not in this subset; \\${nm}.kr is`, m);
    }
    const names = ['val', 'lag', 'fixedLag', 'spec'];
    const by = new Map();
    let seenKey = false;
    got.forEach((a, i) => {
      if (a.key) {
        seenKey = true;
        if (!names.includes(a.key)) throw new SclError(`\\${nm}.kr has no argument called ${a.key}; it takes ${names.join(', ')}`, a.at);
        if (by.has(a.key)) throw new SclError(`${a.key} is given twice to \\${nm}.kr`, a.at);
        by.set(a.key, a);
        return;
      }
      if (seenKey) throw new SclError(`a positional argument after a keyword one, in \\${nm}.kr`, a.at);
      if (i >= names.length) throw new SclError(`\\${nm}.kr takes ${names.length} arguments and this is argument ${i + 1}`, a.at);
      by.set(names[i], a);
    });
    if (by.has('fixedLag')) {
      throw new SclError('fixedLag is not in this subset, and a lag that is a number is already fixed in sclang', by.get('fixedLag').at);
    }
    if (params.some((x) => x.name === nm)) throw new SclError(`${nm} is already an argument, and one name for two controls is refused here`, at);
    const spec = by.has('spec') ? readSpec(by.get('spec').val, by.get('spec').at) : null;
    let value;
    if (by.has('val')) {
      const v = by.get('val').val;
      if (v.k === 'arr') throw new SclError(`an array as the value of \\${nm} makes several controls at once, which is not in this subset`, by.get('val').at);
      if (!isNum(v)) throw new SclError(`the value of \\${nm} has to be a number, not ${describe(v)}`, by.get('val').at);
      value = v.v;
    } else value = named.has(nm) ? named.get(nm).value : spec ? spec.default : 0;
    let lag = 0;
    if (by.has('lag')) {
      const l = by.get('lag').val;
      if (!isNum(l)) throw new SclError(`the lag of \\${nm} has to be a number of seconds, not ${describe(l)}`, by.get('lag').at);
      if (l.v < 0) throw new SclError(`a lag of ${l.v} seconds is less than none`, by.get('lag').at);
      lag = l.v;
    }
    if (spec && !(value >= Math.min(spec.min, spec.max) && value <= Math.max(spec.min, spec.max))) {
      throw new SclError(`\\${nm} starts at ${value}, outside its spec's ${spec.min} to ${spec.max}`, by.get('val')?.at ?? at);
    }
    const had = named.get(nm);
    if (had) {
      // `NamedControl.new`: one name is one control, and two values for it is its own error.
      if (had.value !== value) throw new SclError(`NamedControl: cannot have more than one set of default values in the same control, and \\${nm} was ${had.value}`, at);
      if (by.has('lag') && had.lag !== lag) throw new SclError(`NamedControl: cannot have more than one set of fixed lag values in the same control, and \\${nm} was ${had.lag}`, at);
      // A later spec replaces the earlier one, which is `res.spec = spec` there.
      if (spec) { had.spec = spec; controls.find((c) => c.name === nm).spec = { ...spec, guessed: false }; }
      return { k: 'sig', rate: RATE.slow, ref: had.ref };
    }
    const ref = g.control(nm, value, lag);
    blocks.push({ cls: lag ? 'LagControl' : 'Control', rate: RATE.slow, inputs: lag ? [g.value(lag)] : [], outs: 1, special: 0 });
    named.set(nm, { value, lag, spec, ref });
    controls.push({ name: nm, value, lag, from: 'named',
      spec: spec ? { min: spec.min, max: spec.max, warp: spec.warp, step: spec.step, guessed: false } : specFor(nm, value) });
    return { k: 'sig', rate: RATE.slow, ref };
  }

  // ── the grammar ─────────────────────────────────────────────────────────────

  const scope = new Map();       // name -> value, or null while declared and unset

  function literal() {
    const at = peek();
    let sign = 1;
    if (is('op', '-')) { next(); sign = -1; }
    if (is('num')) return sign * next().v;
    if (is('id', 'pi')) { next(); return sign * Math.PI; }
    throw new SclError('a default here has to be a number', at);
  }

  function argList(close) {
    const params = [];
    for (;;) {
      const t = expect('id', undefined, 'an argument name');
      if (scope.has(t.v)) throw new SclError(`${t.v} is declared twice`, t);
      let v = 0;
      if (is('punc', '=')) { next(); v = literal(); }
      params.push({ name: t.v, value: v, at: t });
      scope.set(t.v, null);
      if (is('punc', ',')) { next(); continue; }
      expect('punc', close);
      return params;
    }
  }

  function callArgs() {
    const got = [];
    if (!is('punc', '(')) return got;
    next();
    if (is('punc', ')')) { next(); return got; }
    for (;;) {
      if (is('key')) { const k = next(); got.push({ key: k.v, val: expr(), at: k }); }
      else { const at = peek(); got.push({ val: expr(), at }); }
      if (is('punc', ',')) { next(); continue; }
      expect('punc', ')');
      return got;
    }
  }

  function classCall() {
    const t = next();
    let method = 'new';
    if (is('punc', '.')) { next(); method = expect('id', undefined, `a method on ${t.v}`).v; }
    else if (!is('punc', '(')) throw new SclError(`${t.v} on its own is not something this can play; write ${t.v}.ar(...)`, t);
    // The class and method are judged before the arguments, so `Mix.fill(3, { ... })` names the cause.
    // why: lessons/kit-sclang-lite.md#class-before-args
    if (t.v === 'Out') throw new SclError('leave Out out: the last line is what reaches the speakers', t);
    if (t.v === 'SynthDef') throw new SclError('write the function itself, this page makes the SynthDef', t);
    if (t.v === 'Env' && !ENVS[method]) throw new SclError(`Env.${method} is not in this subset, only Env.adsr, Env.perc and Env.new`, t);
    if (t.v === 'Mix' && method !== 'new' && method !== 'ar') throw new SclError(`Mix.${method} is not in this subset, only Mix(...), Mix.new and Mix.ar`, t);
    if (t.v !== 'Env' && t.v !== 'Mix') {
      if (!UGENS[t.v]) throw new SclError(`${t.v} is not in this subset, which knows ${Object.keys(UGENS).join(', ')}, Env and Mix`, t);
      if (method === 'new') throw new SclError(`${t.v}(...) needs a rate: ${t.v}.ar(...) or ${t.v}.kr(...)`, t);
      if (method !== 'ar' && method !== 'kr') throw new SclError(`${t.v}.${method} is not in this subset, only ${t.v}.ar and ${t.v}.kr`, t);
      const rates = UGENS[t.v].rates;
      if (rates && !rates.includes(method)) throw new SclError(`${t.v}.${method} does not exist in SuperCollider either; ${t.v} has ${rates.map((r) => `.${r}`).join(' and ')}`, t);
    }
    const got = callArgs();
    if (t.v === 'Env') return envCall(method, got, t);
    if (t.v === 'Mix') return mix(method, got, t);
    return ugen(t.v, method, got, t);
  }

  function primary() {
    const t = peek();
    if (t.t === 'num') { next(); return num(t.v); }
    if (t.t === 'sym') { next(); return { k: 'sym', v: t.v, at: t }; }
    if (t.t === 'cls') return classCall();
    if (t.t === 'id') {
      next();
      if (t.v === 'pi') return num(Math.PI);
      if (['var', 'arg'].includes(t.v)) throw new SclError(`${t.v} lines come first, before anything else in the function`, t);
      // A boolean is a value only so a named control can name `fixedLag` in its
      // refusal; anywhere else `describe` makes it an ordinary refusal.
      if (t.v === 'true' || t.v === 'false') return { k: 'bool', v: t.v === 'true' };
      if (t.v === 'nil') throw new SclError('nil is not in this subset', t);
      if (is('punc', '(')) throw new SclError(`${t.v}(...) is not in this subset`, t);
      if (!scope.has(t.v)) throw new SclError(`${t.v} is not declared; add it to the arguments or a var line`, t);
      const v = scope.get(t.v);
      if (v === null) throw new SclError(`${t.v} has no value here yet`, t);
      return v;
    }
    if (t.t === 'punc' && t.v === '(') { next(); const v = expr(); expect('punc', ')'); return v; }
    if (t.t === 'punc' && t.v === '[') {
      next();
      const items = [];
      if (!is('punc', ']')) {
        for (;;) {
          const at = peek();
          const v = expr();
          if (v.k === 'arr') throw new SclError('an array of arrays is not in this subset', at);
          items.push(v);
          if (is('punc', ',')) { next(); continue; }
          break;
        }
      }
      expect('punc', ']');
      if (!items.length) throw new SclError('an empty array has nothing to play', t);
      return { k: 'arr', items };
    }
    if (t.t === 'punc' && t.v === '{') throw new SclError('a function inside the function is not in this subset', t);
    throw new SclError(t.t === 'eof' ? 'the text ends in the middle of something' : `${JSON.stringify(t.v)} was not expected here`, t);
  }

  /**
   * UGen.sc's `range` (a MulAdd onto lo..hi) and `exprange` (LinExp with no clip), read off the
   * source's own `signalRange`: -1..1 unless the class says unipolar. An array does each item.
   * why: lessons/kit-sclang-lite.md#range
   */
  function ranged(kind, v, got, at) {
    const [lo, hi] = bind(RANGES[kind], got, `.${kind}`, at);
    for (const x of [lo, hi]) {
      if (x.k !== 'num' && x.k !== 'sig') throw new SclError(`.${kind} takes a number or a signal for lo and hi, not ${describe(x)}`, at);
    }
    if (v.k === 'arr') return { k: 'arr', items: v.items.map((x) => ranged1(kind, x, lo, hi, at)) };
    return ranged1(kind, v, lo, hi, at);
  }
  function ranged1(kind, v, lo, hi, at) {
    if (v.k !== 'sig') throw new SclError(`.${kind} maps a signal, and ${describe(v)} is not one`, at);
    if (kind === 'range') {
      const mul = v.uni ? binop('-', hi, lo, at) : binop('*', binop('-', hi, lo, at), num(0.5), at);
      return madd(v, mul, v.uni ? lo : binop('+', mul, lo, at), at);
    }
    const [inMin, inMax] = v.uni ? [0, 1] : [-1, 1];
    return { k: 'sig', rate: v.rate, ref: add('LinExp', v.rate, [v.ref, g.value(inMin), g.value(inMax), input(lo, at), input(hi, at)]) };
  }

  function postfix() {
    let v = primary();
    while (is('punc', '.')) {
      next();
      const m = expect('id', undefined, 'a method name');
      if (v.k === 'sym' && ['kr', 'ar', 'ir', 'tr'].includes(m.v)) { v = namedControl(v, m, callArgs()); continue; }
      if (m.v in UNARY) { v = unop(m.v, v, m); continue; }
      if (m.v === 'dup') {
        const got = callArgs();
        if (got.length > 1 || got[0]?.key) throw new SclError('.dup takes one number', m);
        v = dup(v, got[0]?.val ?? num(2), m);
        continue;
      }
      if (m.v in RANGES) { v = ranged(m.v, v, callArgs(), m); continue; }
      if (m.v === 'play') throw new SclError('leave off .play, this page plays the function itself', m);
      throw new SclError(`.${m.v} is not in this subset; it knows .${METHODS.join(' .')}`, m);
    }
    return v;
  }

  function unary() {
    if (is('op', '-')) {
      const at = next();
      return unop('neg', unary(), at);
    }
    return postfix();
  }

  /** Left to right, no precedence. See the header. */
  function expr() {
    let v = unary();
    while (is('op')) {
      const op = next();
      v = binop(op.v, v, unary(), op);
    }
    return v;
  }

  function statement() {
    if (is('id') && peek(1).t === 'punc' && peek(1).v === '=') {
      const t = next(); next();
      if (!scope.has(t.v)) throw new SclError(`${t.v} is not declared; add it to a var line`, t);
      const v = expr();
      scope.set(t.v, v);
      return v;
    }
    return expr();
  }

  // ── the function ────────────────────────────────────────────────────────────

  const open = expect('punc', '{', 'the { that opens the function');
  let params = [];
  if (is('punc', '|')) { next(); params = argList('|'); }
  else if (is('id', 'arg')) { next(); params = argList(';'); }
  // One `Control` block, first in the graph, which is what `graph().params()`
  // writes and what sclang emits for plain arguments. None at all without any.
  if (params.length) {
    const controls_ = g.params(params.map((x) => [x.name, x.value]));
    blocks.push({ cls: 'Control', rate: RATE.slow, inputs: [], outs: params.length, special: 0 });
    params.forEach((x, i) => scope.set(x.name, { k: 'sig', rate: RATE.slow, ref: controls_[i] }));
    for (const x of params) controls.push({ name: x.name, value: x.value, lag: 0, from: 'arg', spec: specFor(x.name, x.value) });
  }

  while (is('id', 'var')) {
    next();
    for (;;) {
      const t = expect('id', undefined, 'a variable name');
      if (scope.has(t.v)) throw new SclError(`${t.v} is declared twice`, t);
      scope.set(t.v, null);
      if (is('punc', '=')) { next(); scope.set(t.v, expr()); }
      if (is('punc', ',')) { next(); continue; }
      expect('punc', ';');
      break;
    }
  }

  let last = null, lastAt = peek();
  while (!is('punc', '}')) {
    if (is('eof')) throw new SclError('the function is never closed with }', open);
    lastAt = peek();
    last = statement();
    if (is('punc', ';')) { next(); continue; }
    if (is('eof')) throw new SclError('the function is never closed with }', open);
    if (!is('punc', '}')) throw new SclError(`expected ; or } here, found ${JSON.stringify(peek().v)}`, peek());
  }
  const close = next();
  if (is('punc', '.')) {
    const m = peek(1);
    throw new SclError(m.v === 'play' ? 'leave off .play, this page plays the function itself' : 'nothing may follow the function', m);
  }
  if (is('punc', ';')) next();
  if (!is('eof')) throw new SclError('nothing may follow the function', peek());
  if (!last) throw new SclError('the function is empty, so there is nothing to play', close);

  // ── the last line, into Out.ar(0, ...) ─────────────────────────────────────

  let chans = last.k === 'arr' ? last.items : [last];
  if (chans.length > MAX_CHANNELS) {
    throw new SclError(`the last line has ${chans.length} channels and this plays ${MAX_CHANNELS}; Mix or Pan2 it down`, lastAt);
  }
  for (const c of chans) {
    if (c.k === 'num') throw new SclError('the last line is a number, which is not a sound; it has to be .ar', lastAt);
    if (c.k !== 'sig') throw new SclError(`the last line is ${describe(c)}, which is not a sound`, lastAt);
    if (c.rate !== RATE.sample) throw new SclError(`the last line is ${RATE_WORD[c.rate]} rate and Out.ar needs audio rate, so make it .ar`, lastAt);
  }
  if (chans.length === 1) chans = [chans[0], chans[0]];
  if (bus) g.outAt(bus, ...chans.map((c) => c.ref)); else g.out(...chans.map((c) => c.ref));
  blocks.push({ cls: 'Out', rate: RATE.sample, inputs: chans.map((c) => c.ref), outs: 0, special: 0 });

  const bytes = g.bytes();
  const fit = fitsCeiling(bytes);
  if (!fit.fits) throw new SclError(`that is ${fit.bytes} bytes and the engine takes ${SIZE_CEILING}`, lastAt);
  const wires = wirePeak(blocks);
  if (wires > WIRE_CEILING) {
    throw new SclError(`that keeps ${wires} audio signals alive at once and the engine has ${WIRE_CEILING}`, lastAt);
  }

  const gateAt = params.findIndex((x) => x.name === 'gate');
  const gateUsed = gateAt >= 0 && blocks.some((b) => b.inputs.some((i) => i.from === 0 && i.out === gateAt));
  // doneAction 2 is `Done.freeSelf`, from `EnvGen.sc`'s `Done` class.
  const freesItself = blocks.some((b) => b.cls === 'EnvGen' && b.doneAction === 2);
  if (!params.some((x) => x.name === 'freq')) warnings.push('there is no freq argument, so every key plays the same pitch');
  if (gateAt >= 0 && !gateUsed) warnings.push('gate is an argument and nothing reads it, so letting a key go changes nothing');
  if (!freesItself) warnings.push('no EnvGen has doneAction: 2, so a note has to be cut off when its key comes up');

  return {
    ok: true, bytes, name,
    params: params.map(({ name: n, value }) => ({ name: n, value })),
    /**
     * Every control, arguments first and then named ones in the order they
     * were met, which is the order of the definition's value array. Each has
     * its `spec` for a knob (min, max, warp, step, and `guessed` where
     * neither the program nor `Spec.specs` gave one). `knobs` is the same list
     * without the ones a key sets, see `KEYED`.
     */
    controls: controls.map((c) => ({ ...c, spec: { ...c.spec } })),
    knobs: controls.filter((c) => !KEYED.includes(c.name)).map((c) => ({ ...c, spec: { ...c.spec } })),
    channels: last.k === 'arr' ? last.items.length : 1,
    blocks: g.count(), wires,
    gate: gateAt >= 0, gateUsed, freesItself,
    kinds: [...new Set(blocks.map((b) => b.cls))],
    warnings,
  };
}

/**
 * Peak audio rate signals alive at once, as scsynth's DoBufferColoring counts: release a block's
 * last-read inputs, then take its outputs. An output nobody reads keeps its buffer to the end
 * (measured: 63 unread oscillators plus one heard loads, 64 is refused with /fail).
 * why: lessons/kit-sclang-lite.md#wire-peak
 */
export function wirePeak(blocks) {
  const readers = new Map();
  for (const b of blocks) {
    for (const i of b.inputs) {
      if (i.from < 0) continue;
      const key = `${i.from}:${i.out}`;
      readers.set(key, (readers.get(key) ?? 0) + 1);
    }
  }
  let live = 0, peak = 0;
  const left = new Map(readers);
  blocks.forEach((b, j) => {
    // A block that cannot alias its inputs to its outputs takes its outputs
    // FIRST (`DoBufferColoring`, the `kUnitDef_CantAliasInputsToOutputs`
    // branch), so for a moment its inputs and outputs are all alive.
    const first = UGENS[b.cls]?.noAlias;
    const take = () => {
      if (b.rate !== RATE.sample) return;
      for (let o = 0; o < b.outs; o++) { live++; peak = Math.max(peak, live); }
    };
    if (first) take();
    for (const i of b.inputs) {
      if (i.from < 0 || blocks[i.from].rate !== RATE.sample) continue;
      const key = `${i.from}:${i.out}`;
      const n = left.get(key) - 1;
      left.set(key, n);
      if (n === 0) live--;
    }
    if (!first) take();
  });
  return peak;
}

function describe(x) {
  return { num: `the number ${x.v}`, sig: 'a signal', arr: 'an array', env: 'an Env',
           sym: `the symbol \\${x.v}`, nil: 'nothing', bool: `${x.v}` }[x.k] ?? 'that';
}
