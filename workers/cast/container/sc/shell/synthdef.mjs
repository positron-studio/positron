// demo/shell/synthdef.mjs: a SuperCollider synth definition as bytes, written, read back,
// and upgraded from version 1 to 2. Real scsynth (wasm) grades it, not the round trip.
// Version 2 always: v1 and v2 differ in the width of every COUNT, INDEX and SOURCE.
//
//   "SCgf"                     4 bytes
//   version                    int32   (1 or 2)
//   number of definitions      int16
//   per definition:
//     name                     pstring (one length byte, then that many chars)
//     constants                COUNT, then that many float32
//     parameter values         COUNT, then that many float32
//     parameter names          COUNT, then (pstring, INDEX) pairs
//     building blocks          COUNT, then that many:
//       class name             pstring
//       rate                   int8    0 once, 1 slow, 2 per sample, 3 on demand
//       inputs                 COUNT
//       outputs                COUNT
//       special index          int16   ALWAYS 16 bits, in both versions
//       inputs                 (SOURCE, INDEX) pairs; source -1 means a constant
//       outputs                one int8 rate each
//     variants                 int16 count, then (pstring, one float32 per parameter)
//
// COUNT, INDEX and SOURCE are int16 in version 1 and int32 in version 2.
// why: lessons/kit-synthdef.md#header

export const MAGIC = 'SCgf';

// The largest definition that arrives over a socket: native scsynth over UDP, 65,488 bytes
// (browser 65,520). Over it /d_recv answers nothing at all. The limit is on the 65,536 byte
// message; the board loads larger ones from disk with /d_load.
// why: lessons/kit-synthdef.md#size-ceiling
export const SIZE_CEILING = 65488;

/** Does this definition fit the ceiling both ends honour? Reports the margin,
 *  because "how close" is the question anybody asks next. */
export const fitsCeiling = (bytes) => {
  const n = bytes.byteLength ?? bytes.length ?? 0;
  return { fits: n <= SIZE_CEILING, bytes: n, margin: SIZE_CEILING - n };
};

/** The four rates a building block can run at, named the way a page can print them. */
export const RATE = { once: 0, slow: 1, sample: 2, demand: 3 };

/**
 * BinaryOpUGen special indices. A wrong number still writes a well-formed file, so the
 * patch check grades it audibly: the loudness knob must scale the output.
 * why: lessons/kit-synthdef.md#op
 */
export const OP = { add: 0, sub: 1, mul: 2, div: 4 };

// ── writing ─────────────────────────────────────────────────────────────────

/**
 * A growable byte writer. Big-endian throughout, which is what the format is.
 */
class Bytes {
  constructor() { this.buf = new Uint8Array(1024); this.n = 0; }
  #room(k) {
    if (this.n + k <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.n + k));
    next.set(this.buf.subarray(0, this.n));
    this.buf = next;
  }
  u8(v) { this.#room(1); this.buf[this.n++] = v & 0xff; return this; }
  i8(v) { return this.u8(v < 0 ? v + 256 : v); }
  i16(v) { this.#room(2); new DataView(this.buf.buffer).setInt16(this.n, v); this.n += 2; return this; }
  i32(v) { this.#room(4); new DataView(this.buf.buffer).setInt32(this.n, v); this.n += 4; return this; }
  f32(v) { this.#room(4); new DataView(this.buf.buffer).setFloat32(this.n, v); this.n += 4; return this; }
  str(s) {
    // A pstring is a length BYTE, so 255 characters is the roof. Nothing here
    // comes close, but a silent truncation would produce a file that loads
    // under a different name than the one asked for, which is the worst kind
    // of not-quite-working.
    const a = new TextEncoder().encode(s);
    if (a.length > 255) throw new Error(`synthdef: "${s}" is ${a.length} bytes and a name may be 255`);
    this.u8(a.length);
    this.#room(a.length);
    this.buf.set(a, this.n);
    this.n += a.length;
    return this;
  }
  done() { return this.buf.slice(0, this.n); }
}

/**
 * Build one definition, then `.bytes()`.
 *
 * The graph is built in order and every input must already exist, which is the
 * format's own rule: a block's inputs name blocks BEFORE it. Nothing here
 * sorts, so a mis-ordered graph is a thrown error rather than a file that
 * loads and misbehaves.
 *
 *   const g = graph('bell');
 *   const [freq, amp] = g.params([['freq', 440], ['amp', 0.15]]);
 *   const tone = g.block('SinOsc', RATE.sample, [freq, g.value(0)], 1);
 *   g.out(g.block('BinaryOpUGen', RATE.sample, [tone, amp], 1, OP.mul));
 */
export function graph(name) {
  const constants = [];
  const paramNames = [];
  const paramValues = [];
  const blocks = [];
  let controlAt = -1;

  /** A constant, deduplicated — the format stores each distinct number once. */
  const value = (v) => {
    let i = constants.indexOf(v);
    if (i < 0) { i = constants.length; constants.push(v); }
    return { from: -1, out: i };
  };

  /**
   * Declare every parameter at once: one Control block, special index 0, as sclang emits.
   * why: lessons/kit-synthdef.md#params
   */
  function params(pairs) {
    if (controlAt >= 0) throw new Error('synthdef: params() is called once, with every parameter');
    // The special index is where this block's first value sits in the value
    // array, which is 0 whenever params() comes first, as it always has.
    const first = paramValues.length;
    for (const [k, v] of pairs) { claim(k); paramNames.push(k); paramValues.push(v); }
    controlAt = blocks.length;
    blocks.push({
      name: 'Control', rate: RATE.slow, inputs: [],
      outputs: pairs.map(() => RATE.slow), special: first,
    });
    return pairs.map((_, i) => ({ from: controlAt, out: i }));
  }

  /** One name, one control. A second control under a name scsynth already has is refused. */
  function claim(k) {
    if (paramNames.includes(k)) throw new Error(`synthdef: a control called ${k} already exists`);
  }

  /**
   * One more control, as sclang's NamedControl makes: a Control block at its slot in the
   * value array, or a LagControl with the lag times as constant inputs.
   * why: lessons/kit-synthdef.md#control
   */
  function control(k, v, lag = 0) {
    claim(k);
    const slot = paramValues.length;
    paramNames.push(k);
    paramValues.push(v);
    const at = blocks.length;
    blocks.push({
      name: lag ? 'LagControl' : 'Control', rate: RATE.slow,
      inputs: lag ? [value(lag)] : [], outputs: [RATE.slow], special: slot,
    });
    return { from: at, out: 0 };
  }

  /** One building block. Returns a reference to its first output. */
  function block(cls, rate, inputs, outCount = 1, special = 0) {
    for (const i of inputs) {
      if (i.from >= blocks.length) throw new Error(`synthdef: ${cls} reads a block that does not exist yet`);
    }
    const at = blocks.length;
    blocks.push({
      name: cls, rate, inputs: inputs.slice(),
      outputs: Array.from({ length: outCount }, () => rate), special,
    });
    return { from: at, out: 0 };
  }

  /**
   * The last block, to hardware channel 0. Out has no outputs, the one place a writer forgets.
   * why: lessons/kit-synthdef.md#out
   */
  function out(...channels) {
    return block('Out', RATE.sample, [value(0), ...channels], 0, 0);
  }
  /**
   * The same, to another output bus. A bus past the engine's output channels is an input bus,
   * so the caller boots the engine with enough outputs.
   * why: lessons/kit-synthdef.md#out-at
   */
  function outAt(bus, ...channels) {
    return block('Out', RATE.sample, [value(bus), ...channels], 0, 0);
  }

  function bytes() {
    // The magic is four raw bytes, not a pstring.
    // why: lessons/kit-synthdef.md#magic
    const w = new Bytes();
    for (const c of MAGIC) w.u8(c.charCodeAt(0));
    w.i32(2);                                  // version
    w.i16(1);                                  // one definition in this file
    w.str(name);
    w.i32(constants.length);
    for (const c of constants) w.f32(c);
    w.i32(paramValues.length);
    for (const v of paramValues) w.f32(v);
    w.i32(paramNames.length);
    paramNames.forEach((k, i) => { w.str(k); w.i32(i); });
    w.i32(blocks.length);
    for (const u of blocks) {
      w.str(u.name);
      w.i8(u.rate);
      w.i32(u.inputs.length);
      w.i32(u.outputs.length);
      w.i16(u.special);
      for (const i of u.inputs) { w.i32(i.from); w.i32(i.out); }
      for (const r of u.outputs) w.i8(r);
    }
    w.i16(0);                                  // no variants
    return w.done();
  }

  return { name, value, params, control, block, out, outAt, bytes, count: () => blocks.length };
}

// ── reading ─────────────────────────────────────────────────────────────────

/**
 * A separate pass over the bytes, so the page reports what the file says rather than
 * the writer's variables. Reads both versions, so real v1 files can be checked.
 * why: lessons/kit-synthdef.md#read-synthdef
 */
export function readSynthDef(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const need = (k) => { if (p + k > bytes.length) throw new Error(`synthdef: the file ends inside a field at byte ${p}`); };
  const u8 = () => { need(1); return bytes[p++]; };
  const i8 = () => { const v = u8(); return v > 127 ? v - 256 : v; };
  const i16 = () => { need(2); const v = dv.getInt16(p); p += 2; return v; };
  const i32 = () => { need(4); const v = dv.getInt32(p); p += 4; return v; };
  const f32 = () => { need(4); const v = dv.getFloat32(p); p += 4; return v; };
  const str = () => { const n = u8(); need(n); const s = new TextDecoder().decode(bytes.subarray(p, p + n)); p += n; return s; };

  const head = String.fromCharCode(u8(), u8(), u8(), u8());
  if (head !== MAGIC) throw new Error(`synthdef: this does not start with ${MAGIC}; it starts with ${JSON.stringify(head)}`);
  const version = i32();
  if (version !== 1 && version !== 2) throw new Error(`synthdef: version ${version} is not one this reads`);
  // The one line that is the whole version difference.
  const N = version === 2 ? i32 : i16;
  const count = i16();

  const defs = [];
  for (let d = 0; d < count; d++) {
    const name = str();
    const constants = []; for (let i = N(); i > 0; i--) constants.push(f32());
    const paramValues = []; for (let i = N(); i > 0; i--) paramValues.push(f32());
    const paramNames = [];
    for (let i = N(); i > 0; i--) { const k = str(); paramNames.push({ name: k, at: N() }); }
    const blocks = [];
    for (let i = N(); i > 0; i--) {
      const cls = str();
      const rate = i8();
      const nIn = N(), nOut = N();
      const special = i16();
      const inputs = [];
      for (let k = 0; k < nIn; k++) { const from = N(); inputs.push({ from, out: N() }); }
      const outputs = [];
      for (let k = 0; k < nOut; k++) outputs.push(i8());
      blocks.push({ name: cls, rate, inputs, outputs, special });
    }
    const variants = [];
    for (let i = i16(); i > 0; i--) {
      const vname = str();
      const values = paramValues.map(() => f32());
      variants.push({ name: vname, values });
    }
    defs.push({ name, constants, paramValues, paramNames, blocks, variants });
  }

  // Consumed to the exact byte, or it is not understood.
  // why: lessons/kit-synthdef.md#exact-byte
  if (p !== bytes.length) {
    throw new Error(`synthdef: read ${p} of ${bytes.length} bytes; the rest is not accounted for`);
  }
  return { head, version, defs, bytes: bytes.length };
}

/**
 * The old layout widened to the current one: counts and indices 16 to 32 bits, specialIndex
 * and the definition count stay 16. A re-encoding, not a translation.
 * why: lessons/kit-synthdef.md#to-version2
 */
export function toVersion2(input) {
  const parsed = readSynthDef(input);
  if (parsed.version === 2) return { bytes: input instanceof Uint8Array ? input : new Uint8Array(input), converted: false, parsed };
  const w = new Bytes();
  for (const c of MAGIC) w.u8(c.charCodeAt(0));
  w.i32(2);
  w.i16(parsed.defs.length);
  for (const def of parsed.defs) {
    w.str(def.name);
    w.i32(def.constants.length);
    for (const c of def.constants) w.f32(c);
    w.i32(def.paramValues.length);
    for (const v of def.paramValues) w.f32(v);
    w.i32(def.paramNames.length);
    for (const { name, at } of def.paramNames) { w.str(name); w.i32(at); }
    w.i32(def.blocks.length);
    for (const u of def.blocks) {
      w.str(u.name);
      w.i8(u.rate);
      w.i32(u.inputs.length);
      w.i32(u.outputs.length);
      w.i16(u.special);
      for (const i of u.inputs) { w.i32(i.from); w.i32(i.out); }
      for (const r of u.outputs) w.i8(r);
    }
    w.i16(def.variants.length);
    for (const v of def.variants) { w.str(v.name); for (const x of v.values) w.f32(x); }
  }
  const bytes = w.done();
  return { bytes, converted: true, parsed: readSynthDef(bytes) };
}

/** Every distinct kind of building block in a definition, in the order met. */
export function kindsOf(def) {
  const seen = [];
  for (const b of def.blocks) if (!seen.includes(b.name)) seen.push(b.name);
  return seen;
}

/** The first bytes of a file, as hex, so a page can show the header itself. */
export function hexHead(bytes, n = 16) {
  return Array.from(bytes.slice(0, n), (b) => b.toString(16).padStart(2, '0')).join(' ');
}

export const sameBytes = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
