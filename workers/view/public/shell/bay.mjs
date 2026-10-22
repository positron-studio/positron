// demo/shell/bay.mjs: a patch bay: what exists, what may reach what, and the arithmetic that
// refuses the rest. Pure (no socket, MIDI, DOM or clock) so bay-test.mjs grades it. A port's
// `shape` is what the data is, `accepts` what it consents to; a shape is declared, never inferred.
// why: lessons/kit-bay.md#header

import { KINDS, kindOfDecoded } from './midi-kinds.mjs';
// One stale window for the bay and the registry; the registry owns it and is import free.
// why: lessons/kit-bay.md#stale
import { STALE_MS, jackRows } from './graph-registry.mjs';
export { STALE_MS };
// Link options (`{ w 640, h 360, fps 15 }` on a video link) are not transforms; see link-options.mjs.
import { isOption, checkOptions, printOptions } from './link-options.mjs';
import { readBack } from './drum-maps.mjs';

/**
 * What a link can carry. New media go on the end: pages index the first three by position.
 * why: lessons/kit-bay.md#media
 */
export const MEDIA = ['midi', 'audio', 'clock', 'value', 'video', 'program', 'file', 'state'];

/**
 * The media a link carries a session for instead of bytes. `program` is light: a shader
 * arrives whole as one message.
 * why: lessons/kit-bay.md#heavy
 */
export const HEAVY = ['audio', 'video', 'file', 'state'];

/**
 * What a node is. Optional: a port with no node takes its place from its id.
 * `external` is the one kind the validator reads.
 * why: lessons/kit-bay.md#node-kinds
 */
export const NODE_KINDS = ['device', 'engine', 'endpoint', 'store', 'external', 'screen', 'person'];

/** How far apart the two ends of a link are, nearest first. */
export const WHERE = ['machine', 'network', 'internet-one', 'internet-many'];

/**
 * Measured transport choices by medium, then distance. `says` is only a number the plan quotes,
 * or `'to measure'`; `or` is the second choice. Relay cap read from workers/relay/src/index.js,
 * and bay-test.mjs goes red when they disagree.
 * why: lessons/kit-bay.md#transports
 */
export const RELAY = { msgPerSec: 1000, burst: 2000 };
// A meeting's media: `p2p` browser to browser (a mesh), `sfu` through a media server. They sit after the
// cell's own choice, so they are offered only to ports that name them; `notes` is what each says.
// why: lessons/kit-bay.md#p2p-sfu
const P2P = 'browser to browser WebRTC, one upload per receiver, no number measured';
const SFU = 'through an SFU, one upload whatever the receivers, no number measured';
const RELAY_CAP = `cap ${RELAY.msgPerSec} msg/s, ${RELAY.burst} burst`;
export const TRANSPORTS = {
  audio: {
    'machine':       { transport: 'webaudio', says: 'WebAudio or Core Audio, no number measured' },
    'network':       { transport: 'datachannel', or: ['p2p'], says: 'board round trip 4 ms', notes: { p2p: P2P } },
    'internet-one':  { transport: 'relay', or: ['p2p'], says: `relay round trip p50 36 ms, ${RELAY_CAP}`, notes: { p2p: P2P } },
    'internet-many': { transport: 'moq', or: ['llhls', 'sfu', 'p2p'], says: 'MoQ or LL-HLS, no number measured',
                       notes: { sfu: SFU, p2p: P2P } },
  },
  video: {
    'machine':       { transport: 'page', says: 'the page itself, nothing crosses a wire' },
    'network':       { transport: 'datachannel', or: ['p2p'], says: 'to measure', notes: { p2p: P2P } },
    'internet-one':  { transport: 'whep', or: ['relay-h264', 'p2p'],
                       says: 'a VPN passes the WHEP handshake and drops the media, so count frames', notes: { p2p: P2P } },
    'internet-many': { transport: 'llhls', or: ['sfu', 'p2p'], says: 'LL-HLS, no number measured', notes: { sfu: SFU, p2p: P2P } },
  },
  file: {
    'machine':       { transport: 'indexeddb', says: 'IndexedDB, no number measured' },
    'network':       { transport: 'ingest', says: 'R2 through ingest, no number measured' },
    'internet-one':  { transport: 'ingest', says: 'R2 through ingest, no number measured' },
    'internet-many': { transport: 'r2-hls', says: 'R2 plus HLS, no number measured' },
  },
  state: {
    'machine':       { transport: 'room', says: `a relay room as a bus, ${RELAY_CAP}` },
    'network':       { transport: 'room', says: `a relay room as a bus, ${RELAY_CAP}` },
    'internet-one':  { transport: 'room', says: `a relay room as a bus, ${RELAY_CAP}` },
    'internet-many': { transport: 'room', says: `a relay room as a bus, ${RELAY_CAP}` },
  },
};

/**
 * Reading one stored object back is one https GET, its own row; the `file` row is the write path.
 * why: lessons/kit-bay.md#reads
 */
export const READS = {
  'machine':       { transport: 'indexeddb', says: 'IndexedDB, no number measured' },
  'network':       { transport: 'https', says: 'one https read of the stored object, no number measured' },
  'internet-one':  { transport: 'https', says: 'one https read of the stored object, no number measured' },
  'internet-many': { transport: 'r2-hls', says: 'R2 plus HLS, no number measured' },
};

/** Every transport the two tables name, which is what `via` may ask for. */
// `whip` is declared by ports but never chosen by the table; without it `addPort` throws.
// why: lessons/kit-bay.md#transport-names
export const TRANSPORT_NAMES = [...new Set([...Object.values(TRANSPORTS), READS]
  .flatMap((row) => Object.values(row)).flatMap((c) => [c.transport, c.or].flat()).filter(Boolean).concat('whip', 'jack', 'fbdev', 'icecast', 'websocket'))];
// `websocket` is raw PCM to a Durable Object and back (/radio/edgecast/), asked for by name.
// `jack` is chosen by the ports in `sessionFor`, never by a table cell.
// why: lessons/kit-bay.md#machine-only
/** The transports that never leave one machine, so `via` cannot ask for them across a wire. */
// `fbdev` is a board's own video into its framebuffer (rig/board/hdmi.mjs), asked for by name.
export const MACHINE_ONLY = ['webaudio', 'page', 'indexeddb', 'jack', 'fbdev'];
/** What a light link between two sites may name as its wire: the relay room, a board's direct WebRTC channel, or edgecast's socket. */
export const LIGHT_VIA = ['relay', 'datachannel', 'websocket'];

/**
 * Which transport a heavy link rides. `internet-one` with more than one receiver is
 * `internet-many`. A light medium answers null and an unknown one throws, so a typo is not light.
 * @returns {null|{transport:string, where:string, says:string, or?:string}}
 * why: lessons/kit-bay.md#choosetransport
 */
export function chooseTransport(medium, where, receivers = 1) {
  if (!MEDIA.includes(medium)) throw new Error(`bay: medium is one of ${MEDIA.join(', ')}, not ${medium}`);
  if (!HEAVY.includes(medium)) return null;
  if (!WHERE.includes(where)) throw new Error(`bay: where is one of ${WHERE.join(', ')}, not ${where}`);
  const w = (where === 'internet-one' && receivers > 1) ? 'internet-many' : where;
  return { where: w, ...TRANSPORTS[medium][w] };
}

/**
 * The MIDI classes a port may consent to, `KINDS` from midi-kinds.mjs. `sysex` is listed
 * so it can be refused by name.
 * why: lessons/kit-bay.md#classes
 */
export const CLASSES = KINDS;

/**
 * A decoded message as one of the classes. A note off is a note, or keys would hang.
 * why: lessons/kit-bay.md#classof
 */
export function classOf(m) {
  return kindOfDecoded(m);
}

/**
 * A decoded message as a bay event. A note off keeps its release velocity and
 * says `off: true`, so `0x80 nn 64` is never read as a note on.
 */
export function eventOf(m) {
  const ev = { cls: classOf(m), ch: m.ch, d1: m.d1, d2: m.d2 };
  if (m?.kind === 'note off') ev.off = true;
  return ev;
}

/** A note off is `off: true` or a note on at velocity 0. */
export function isNoteOff(ev) {
  return ev?.cls === 'note' && (ev.off === true || ev.d2 === 0);
}

// -- transforms --
// A transform is a plain object, not a function, so it round trips to text, can be saved and
// diffed. Any may drop an event by returning null; a filter is one that drops.
// why: lessons/kit-bay.md#transforms

const OPS = {
  /** Put the event on one channel. The MK-425C's global channel is 2 and the
   *  Circuit's first synth listens on 1, so this is the transform the smallest
   *  useful patch in this repository needs. */
  channel: {
    args: ['to'], need: ['to'],
    help: 'put every message on MIDI channel N',
    eg: { op: 'channel', to: 1 },
    classes: (set) => set,
    run: (ev, a) => (ev.ch === null ? ev : { ...ev, ch: a.to }),
  },
  /** Move notes. `+1` is a real thing somebody wants on day one here: the
   *  MK-425C was measured a semitone flat. */
  transpose: {
    args: ['by'], need: ['by'],
    help: 'move notes by N semitones, N may be negative',
    eg: { op: 'transpose', by: -12 },
    classes: (set) => set,
    run: (ev, a) => {
      if (ev.cls !== 'note') return ev;
      const n = ev.d1 + a.by;
      // Out of range is a drop, not a clamp: a clamp piles keys onto one note.
      // why: lessons/kit-bay.md#transpose
      return (n < 0 || n > 127) ? null : { ...ev, d1: n };
    },
  },
  /** Scale note-on velocity. A note off is left alone: its velocity is a
   *  release and scaling it makes a release that never reaches zero. */
  velocity: {
    args: ['scale'], need: ['scale'],
    help: 'multiply note-on velocity',
    eg: { op: 'velocity', scale: 0.5 },
    classes: (set) => set,
    run: (ev, a) => {
      if (ev.cls !== 'note' || isNoteOff(ev)) return ev;
      return { ...ev, d2: Math.max(1, Math.min(127, Math.round(ev.d2 * a.scale))) };
    },
  },
  /** Keep one class and drop the rest. */
  only: {
    args: ['cls'], need: ['cls'],
    help: 'keep only that class of message and drop every other class',
    eg: { op: 'only', cls: 'note' },
    classes: (set, a) => new Set([...set].filter((c) => c === a.cls)),
    run: (ev, a) => (ev.cls === a.cls ? ev : null),
  },
  /** Drop one class and keep the rest. */
  drop: {
    args: ['cls'], need: ['cls'],
    help: 'drop that class of message and keep every other class',
    eg: { op: 'drop', cls: 'clock' },
    classes: (set, a) => new Set([...set].filter((c) => c !== a.cls)),
    run: (ev, a) => (ev.cls === a.cls ? null : ev),
  },
  /**
   * Move one controller number to another, optionally onto another channel. Keyed on
   * (channel, controller): CC 80 is a macro on channel 1 and drum pan on channel 10.
   * why: lessons/kit-bay.md#cc
   */
  /**
   * A keyboard split by note number. A split is two links. A note off outside the range is
   * dropped too, which is safe because on and off share the note number.
   * why: lessons/kit-bay.md#range
   */
  /**
   * One bound is enough (everything above middle C). `oneOf` replaces `need`; a range with
   * neither bound does nothing and is refused.
   * why: lessons/kit-bay.md#range-open
   */
  range: {
    args: ['lo', 'hi'], need: [], oneOf: ['lo', 'hi'],
    help: 'keep only notes whose NOTE NUMBER is between lo and hi, which is how a keyboard split is made and how one row of buttons is picked out of a control surface. Either bound may be left out and that end is then open',
    eg: { op: 'range', lo: 36, hi: 47 },
    classes: (set) => set,
    run: (ev, a) => {
      if (ev.cls !== 'note') return ev;
      const lo = a.lo === undefined ? 0 : a.lo;
      const hi = a.hi === undefined ? 127 : a.hi;
      return (ev.d1 < lo || ev.d1 > hi) ? null : ev;
    },
  },
  /**
   * A velocity layer. A note off passes always, whatever the window, or a note let through
   * is never stopped; the test asserts it.
   * why: lessons/kit-bay.md#vrange
   */
  vrange: {
    args: ['lo', 'hi'], need: [], oneOf: ['lo', 'hi'],
    help: 'keep only notes whose VELOCITY is between lo and hi, which is how a soft layer and a hard layer are made. Either bound may be left out and that end is then open',
    eg: { op: 'vrange', lo: 1, hi: 63 },
    classes: (set) => set,
    run: (ev, a) => {
      if (ev.cls !== 'note' || isNoteOff(ev)) return ev;
      const lo = a.lo === undefined ? 1 : a.lo;
      const hi = a.hi === undefined ? 127 : a.hi;
      return (ev.d2 < lo || ev.d2 > hi) ? null : ev;
    },
  },
  /**
   * One velocity for every note, as the Circuit's drum pads send (velocity 96, measured).
   * A note off is left alone, or every release becomes a note on.
   * why: lessons/kit-bay.md#fixed
   */
  fixed: {
    args: ['to'], need: ['to'],
    help: 'give every note the same velocity N, which is what this desk\'s drums already do at 96',
    eg: { op: 'fixed', to: 96 },
    classes: (set) => set,
    run: (ev, a) => {
      if (ev.cls !== 'note' || isNoteOff(ev)) return ev;
      return { ...ev, d2: Math.max(1, Math.min(127, Math.round(a.to))) };
    },
  },
  /**
   * Choose the patch the receiving instrument plays. It changes no event: the runtime switches
   * when the link is made. Only into an in-port that lists `patches`, checked in `validate`.
   * why: lessons/kit-bay.md#patch
   */
  patch: {
    args: ['name'], need: ['name'],
    help: 'switch the instrument this link reaches to the patch called NAME, one of the patches its midi in lists',
    eg: { op: 'patch', name: 'Rhodes' },
    classes: (set) => set,
    run: (ev) => ev,
  },
  /**
   * General MIDI drum notes onto an instrument's own, by the map its midi in publishes as `drums`.
   * `link` stores the resolved `map` and `channel` on the transform, so `run` never sees a port; an
   * unresolved one drops every note. A note the map lacks is dropped, on and off alike.
   * why: lessons/kit-bay.md#drummap
   */
  drummap: {
    args: ['name'], need: ['name'],
    help: 'play General MIDI drum notes on the drum notes of the instrument this link reaches, by the drum map called NAME that its midi in lists',
    eg: { op: 'drummap', name: 'circuit' },
    classes: (set) => set,
    run: (ev, a) => {
      // A map read back from a device's out takes only that device's drum channel, every class.
      if (Number.isInteger(a.only) && ev.ch !== a.only) return null;
      if (ev.cls !== 'note') return ev;
      if (!('map' in a)) return null;
      const ch = Number.isInteger(a.channel) ? a.channel : ev.ch;
      if (a.map === null) return { ...ev, ch };
      const n = a.map[ev.d1];
      return Number.isInteger(n) ? { ...ev, d1: n, ch } : null;
    },
  },
  cc: {
    args: ['from', 'to', 'ch'], need: ['from', 'to'],
    help: 'move the controller numbered from onto the controller numbered to, optionally onto channel ch',
    eg: { op: 'cc', from: 1, to: 74, ch: 10 },
    classes: (set) => set,
    run: (ev, a) => {
      if (ev.cls !== 'cc' || ev.d1 !== a.from) return ev;
      return { ...ev, d1: a.to, ...(a.ch === undefined ? {} : { ch: a.ch }) };
    },
  },
};

export const OP_NAMES = Object.keys(OPS);

/**
 * The words a person reads about each op, separate from `help` (which a model reads).
 * `does` finishes `<op> ...`, `part` names an argument as a thing, `ask` is one imperative
 * naming real values. bay-test.mjs asserts every op and argument has them.
 * why: lessons/kit-bay.md#says
 */
const SAYS = {
  channel: {
    does: 'puts every message on one MIDI channel',
    part: { to: 'the channel number' },
    ask: { to: 'Name a channel from 1 to 16, and the Circuit\'s first synth answers on 1.' },
  },
  transpose: {
    does: 'moves notes up or down the keyboard',
    part: { by: 'the number of semitones' },
    ask: { by: 'Name how many semitones to move, such as 1 up or -12 down.' },
  },
  velocity: {
    does: 'scales how hard every note was played',
    part: { scale: 'the amount to multiply by' },
    ask: { scale: 'Name what to multiply by, such as 0.5 for half as hard.' },
  },
  only: {
    does: 'keeps one kind of message and drops the rest',
    part: { cls: 'a kind of message' },
    ask: { cls: '' },                       // filled from CLASSES below
  },
  drop: {
    // Not `drops ...`: the op's name is the first word of its own problem line.
    // why: lessons/kit-bay.md#says-drop
    does: 'throws away one kind of message and keeps the rest',
    part: { cls: 'a kind of message' },
    ask: { cls: '' },
  },
  range: {
    does: 'keeps only the notes inside a stretch of the keyboard',
    part: { lo: 'the lowest note', hi: 'the highest note' },
    ask: {
      lo: 'Name the lowest note to keep, or the highest, or both, from 0 to 127.',
      hi: 'Name the lowest note to keep, or the highest, or both, from 0 to 127.',
    },
  },
  vrange: {
    does: 'keeps only the notes played inside a band of loudness',
    part: { lo: 'the softest hit', hi: 'the hardest hit' },
    ask: {
      lo: 'Name the softest hit to keep, or the hardest, or both, from 1 to 127.',
      hi: 'Name the softest hit to keep, or the hardest, or both, from 1 to 127.',
    },
  },
  fixed: {
    does: 'gives every note the same loudness',
    part: { to: 'the loudness to give them' },
    ask: { to: 'Name one loudness from 1 to 127, and this desk\'s drums send 96.' },
  },
  patch: {
    does: 'chooses the sound the instrument it reaches plays',
    part: { name: 'the name of a patch' },
    ask: { name: 'Name one of the patches the instrument lists, such as Piano or Rhodes.' },
  },
  drummap: {
    does: 'plays General MIDI drums on an instrument\'s own drum notes',
    part: { name: 'the name of a drum map' },
    ask: { name: 'Name the drum map the instrument lists, such as circuit, or gm for General MIDI.' },
  },
  cc: {
    does: 'moves one controller onto another',
    part: { from: 'the controller it comes from', to: 'the controller it goes to',
            ch: 'the channel to send it on' },
    ask: {
      from: 'Name the controller it comes from, from 0 to 127, which is the number that knob sends.',
      to: 'Name the controller it goes to, from 0 to 127.',
      ch: 'Name the channel to send it on, from 1 to 16.',
    },
  },
};
// Derived from `CLASSES`, never typed, so a new class arrives here by itself.
// why: lessons/kit-bay.md#says-only
SAYS.only.ask.cls = `Name one of ${CLASSES.join(', ')}.`;
SAYS.drop.ask.cls = SAYS.only.ask.cls;

/** `transpose moves notes up or down the keyboard`, with no field name in it. */
const head = (op) => `${op} ${SAYS[op].does}`;
/** What an argument IS, in words. Falls back to nothing rather than to its key:
 *  a key printed as English is the whole of the defect this exists for. */
const part = (op, k) => SAYS[op]?.part?.[k] || 'what it needs';
const ask = (op, k) => SAYS[op]?.ask?.[k] || '';
/** The operators, offered as a list somebody can choose from. */
const PICK_AN_OP = () => `Name one of ${OP_NAMES.join(', ')}.`;

/** The visitor's vocabulary, exported so a test can grade it whole. */
export const OP_SAYS = SAYS;

/**
 * The vocabulary, declared once. The signature is derived from `args`, never typed, so it
 * cannot disagree with `checkTransforms`. Every op needs `help`, asserted in bay-test.mjs.
 * why: lessons/kit-bay.md#vocabulary
 */
const PLACE = { cls: 'C', scale: 'F', name: 'NAME' };
/** The arguments that are words rather than numbers. */
export const TEXT_ARGS = ['cls', 'name'];

export const OP_HELP = OP_NAMES.map((op) => ({
  op,
  args: OPS[op].args.slice(),
  need: OPS[op].need.slice(),
  oneOf: (OPS[op].oneOf || []).slice(),
  help: OPS[op].help,
  eg: { ...OPS[op].eg },
  sig: `${op} ${OPS[op].args.map((a) => `${a}=${PLACE[a] || 'N'}`).join(' ')}`,
  /**
   * The line a model copies: a sentence is read and an example is copied. Every example
   * must pass `checkTransforms`, asserted in bay-test.mjs.
   * why: lessons/kit-bay.md#vocab-json
   */
  json: JSON.stringify({ op, ...OPS[op].eg }),
}));

/**
 * An argument under the wrong key (`transpose` with `to`) is schema valid and computes NaN,
 * so meaning is checked here. Answers `why` (the problem) and `fix` (what to do, or that
 * nothing can be done, in words).
 * @returns {''|{why: string, fix: string}} '' when every transform is well formed, or the problem and what to do about it.
 * why: lessons/kit-bay.md#checktransforms
 */
export function checkTransforms(transforms) {
  for (const t of transforms || []) {
    if (!t || typeof t !== 'object') {
      return { why: 'one of the transforms is not an object with a transform name in it.',
               fix: 'There is nothing here to repair, so the instruction has to be asked again.' };
    }
    const op = OPS[t.op];
    if (!op) return { why: `there is no transform called "${t.op}".`, fix: PICK_AN_OP() };
    for (const k of op.need) {
      if (t[k] === undefined || t[k] === null) {
        /**
         * A field name is quoted, or `needs by and was given to` reads as broken English.
         * The check itself must stay: without it a note becomes `note + undefined`.
         * why: lessons/kit-bay.md#ct-quote
         */
        /**
         * A key the op does not have is a swap and names both sides; all keys belonging with one
         * missing is an omission and names what is needed. One sentence for both blamed a correct key.
         * why: lessons/kit-bay.md#ct-swap
         */
        /**
         * A swap, a partial omission and an empty object stay three cases; bay-test.mjs grades it.
         * why: lessons/kit-bay.md#ct-three
         */
        const given = Object.keys(t).filter((x) => x !== 'op');
        const strange = given.filter((x) => !op.args.includes(x));
        // An empty object is a third case: nothing arrived, so there is nothing to point at.
        // why: lessons/kit-bay.md#ct-empty
        if (!given.length) {
          return { why: `${head(t.op)}, and it was given nothing at all.`, fix: ask(t.op, k) };
        }
        if (strange.length) {
          /**
           * The fix is the repaired object, carrying the value that arrived, and only offered when
           * that value fits; otherwise the list of real kinds, never an invented value.
           * why: lessons/kit-bay.md#ct-repair
           */
          const gaps = op.need.filter((n) => t[n] === undefined || t[n] === null);
          const spare = strange.map((x) => t[x]).find((v) => v !== undefined);
          const fits = gaps.length === 1 && (gaps[0] === 'cls' ? CLASSES.includes(spare)
            : gaps[0] === 'name' ? typeof spare === 'string' && spare.trim() !== ''
              : typeof spare === 'number' && !Number.isNaN(spare));
          const mend = { op: t.op };
          for (const a of op.args) if (t[a] !== undefined && t[a] !== null) mend[a] = t[a];
          if (fits) mend[gaps[0]] = spare;
          return { why: `${head(t.op)}, and nothing it was given is ${part(t.op, k)}.`,
                   fix: fits ? `Write it as ${JSON.stringify(mend)}.` : ask(t.op, k) };
        }
        return { why: `${head(t.op)}, and ${part(t.op, k)} is missing.`, fix: ask(t.op, k) };
      }
      if (k === 'cls') {
        if (!CLASSES.includes(t.cls)) {
          return { why: `${head(t.op)}, and ${JSON.stringify(t.cls)} is not a kind of message.`,
                   fix: ask(t.op, 'cls') };
        }
      }
    }
    /**
     * At least one of a pair, which `need` cannot say. A `range` with neither bound is refused.
     * why: lessons/kit-bay.md#ct-oneof
     */
    if (op.oneOf && op.oneOf.every((k) => t[k] === undefined || t[k] === null)) {
      // Given nothing and given a non-bound (`range` with `to: 7`) get different sentences.
      // why: lessons/kit-bay.md#ct-oneof-words
      const stray = Object.keys(t).some((x) => x !== 'op' && !op.args.includes(x));
      const [lo, hi] = op.oneOf;
      return {
        why: stray
          ? `${head(t.op)}, and nothing it was given is ${part(t.op, lo)} or ${part(t.op, hi)}.`
          : `${head(t.op)}, and neither ${part(t.op, lo)} nor ${part(t.op, hi)} was given.`,
        fix: ask(t.op, lo),
      };
    }
    /**
     * Every present argument is type checked, not only required ones, or a string bound
     * compares as a string.
     * why: lessons/kit-bay.md#ct-types
     */
    if ((t.op === 'patch' || t.op === 'drummap') && (typeof t.name !== 'string' || !t.name.trim())) {
      return { why: `${head(t.op)}, and ${part(t.op, 'name')} came as ${JSON.stringify(t.name)} rather than as a word.`,
               fix: ask(t.op, 'name') };
    }
    for (const k of op.args) {
      if (t[k] === undefined || t[k] === null || TEXT_ARGS.includes(k)) continue;
      if (typeof t[k] !== 'number' || Number.isNaN(t[k])) {
        return { why: `${head(t.op)}, and ${part(t.op, k)} came as ${JSON.stringify(t[k])} `
                      + 'rather than as a number.',
                 fix: ask(t.op, k) };
      }
    }
    /**
     * `lo` above `hi` drops every note while the page draws the link; refused.
     * why: lessons/kit-bay.md#ct-lohi
     */
    if (op.oneOf && t.lo !== undefined && t.hi !== undefined && t.lo > t.hi) {
      // The swapped object is offered to a person, never applied by the code.
      // why: lessons/kit-bay.md#ct-lohi-offer
      return { why: `${head(t.op)}, and ${part(t.op, 'lo')} ${t.lo} is above `
                    + `${part(t.op, 'hi')} ${t.hi}, so nothing can ever pass.`,
               fix: `Turn them round: ${JSON.stringify({ op: t.op, lo: t.hi, hi: t.lo })}.` };
    }
  }
  /**
   * Two ranges open at the same end are one range written wrong: the lower bound wins and
   * the second is dead. Refused, not merged, since the pair sometimes arrives descending.
   * why: lessons/kit-bay.md#ct-two-ranges
   */
  // Two patches on one link: one instrument plays one sound, so the second would silently win.
  const named = (transforms || []).filter((t) => t?.op === 'patch');
  if (named.length > 1) {
    return { why: `this link chooses ${named.length} patches, ${named.map((t) => t.name).join(' and ')}, and an instrument plays one at a time.`,
             fix: 'Keep one patch on the link, or send the other to a second instrument of the same kind.' };
  }
  const maps = (transforms || []).filter((t) => t?.op === 'drummap');
  if (maps.length > 1) {
    return { why: `this link names ${maps.length} drum maps, ${maps.map((t) => t.name).join(' and ')}, and the second would map notes the first already moved.`,
             fix: 'Keep one drummap on the link, the one the instrument lists.' };
  }
  for (const end of ['lo', 'hi']) {
    const same = (transforms || []).filter((t) => OPS[t?.op]?.oneOf
      && t[end] !== undefined && t[end === 'lo' ? 'hi' : 'lo'] === undefined);
    if (same.length > 1) {
      const op = same[0].op;
      const [a, b] = [same[0][end], same[1][end]];
      return {
        why: `two ${op}s each name only ${part(op, end)}, ${a} and ${b}, so the narrower `
             + 'one wins and the other does nothing.',
        fix: `One ${op} takes both ends: `
             + `${JSON.stringify({ op, lo: Math.min(a, b), hi: Math.max(a, b) })}.`,
      };
    }
  }
  return '';
}

/** The patch name a list of transforms chooses, or null. */
export function patchOf(transforms) {
  const t = (transforms || []).find((x) => x?.op === 'patch');
  return t && typeof t.name === 'string' ? t.name : null;
}

/**
 * A patch is a word the receiving port must list in `patches`. Answers the refusal, or the
 * port's own spelling of the name (matched without case, so "rhodes" chooses Rhodes).
 * why: lessons/kit-bay.md#patch
 */
export function patchFor(transforms, port) {
  const want = patchOf(transforms);
  if (want === null) return { name: null };
  const list = Array.isArray(port?.patches) ? port.patches : [];
  const label = port?.label || port?.id || 'that input';
  if (!list.length) {
    return { refuse: { why: `${label} lists no patches, so there is nothing called ${JSON.stringify(want)} to choose.`,
                       fix: 'Make the link without a patch, or link into an instrument whose midi in lists its patches.' } };
  }
  const name = list.find((n) => n.toLowerCase() === want.trim().toLowerCase());
  if (!name) {
    return { refuse: { why: `${label} has no patch called ${JSON.stringify(want)}.`,
                       fix: `Name one of ${list.join(', ')}.` } };
  }
  return { name };
}

/**
 * A drummap is resolved against the receiving port's `drums` (`{ name, label, channel, map, labels }`,
 * demo/shell/drum-maps.mjs). Answers the refusal, the resolved map, or `{ drums: null }` with no drummap.
 * why: lessons/kit-bay.md#drummap
 */
export function drummapFor(transforms, port, from = null) {
  const t = (transforms || []).find((x) => x?.op === 'drummap');
  if (!t) return { drums: null };
  const d = port?.drums;
  const label = port?.label || port?.id || 'that input';
  // The map named by the SENDING end and not the receiving one: the device's notes read back onto
  // General MIDI, into an instrument that plays General MIDI.
  // why: lessons/kit-bay.md#drummap-back
  const want = typeof t.name === 'string' ? t.name.trim().toLowerCase() : '';
  const s = from?.drums;
  if (s && typeof s.name === 'string' && s.name.toLowerCase() === want && s.map && !(d && d.name?.toLowerCase() === want)) {
    const fromLabel = from.label || from.id || 'that output';
    if (d && d.map) {
      return { refuse: { why: `${fromLabel} sends its own drum notes and ${label} plays its own, so one map cannot carry both.`,
                         fix: `Link into an instrument that plays General MIDI, or write ${JSON.stringify({ op: 'drummap', name: d.name })} from a General MIDI source.` } };
    }
    return { drums: readBack(s) };
  }
  if (!d || typeof d.name !== 'string') {
    return { refuse: { why: `${label} lists no drum map, so there is nothing called ${JSON.stringify(t.name)} to play by.`,
                       fix: 'Make the link without a drummap, or link into an instrument whose midi in lists its drums.' } };
  }
  if (String(t.name).trim().toLowerCase() !== d.name.toLowerCase()) {
    return { refuse: { why: `${label} plays its drums by the ${d.name} map, not ${JSON.stringify(t.name)}.`,
                       fix: `Write it as ${JSON.stringify({ op: 'drummap', name: d.name })}.` } };
  }
  return { drums: d };
}

/** The drummap transform with its map resolved from `drums`, as `link` stores it. */
const resolveDrummap = (t, d) => ({ op: 'drummap', name: d.name, map: d.map === null ? null : { ...d.map },
  ...(Number.isInteger(d.channel) ? { channel: d.channel } : {}), labels: { ...(d.labels || {}) },
  ...(d.back ? { back: true, fromLabels: { ...(d.fromLabels || {}) } } : {}), ...(Number.isInteger(d.only) ? { only: d.only } : {}) });

/** Run an ordered list. Returns the event, or null if something dropped it. */
export function apply(transforms, ev) {
  let out = ev;
  for (const t of transforms || []) {
    const op = OPS[t.op];
    if (!op) throw new Error(`bay: no transform called ${t.op}`);
    out = op.run(out, t);
    if (!out) return null;
  }
  return out;
}

/** What classes could still come out the far end of this list. */
export function delivers(emits, transforms) {
  let set = new Set(emits);
  for (const t of transforms || []) {
    const op = OPS[t.op];
    if (!op) throw new Error(`bay: no transform called ${t.op}`);
    set = op.classes(set, t);
  }
  return set;
}

// -- the text form --
// A projection of the graph, never a second source of truth; bay-test.mjs round trips it.
// `via` is a person's choice so it is printed; a heavy link's session and a consent are not.
// why: lessons/kit-bay.md#text-form

/** One link as one line: `from -> to { op arg, op arg }` */
/**
 * An absent optional argument prints as `*`, or `{ range, hi: 7 }` reads back as `lo: 7`.
 * A trailing absent argument is still dropped.
 * why: lessons/kit-bay.md#printlink
 */
export function printLink(link) {
  const t = (link.transforms || []).map((x) => {
    const args = OPS[x.op].args.map((k) => x[k]);
    while (args.length && args[args.length - 1] === undefined) args.pop();
    return [x.op, ...args]
      .map((v) => {
        if (v === undefined) return '*';
        // A word with a space in it (a patch called Soft FM) is quoted, so it reads back whole.
        if (typeof v === 'string' && /[\s"*]/.test(v)) return JSON.stringify(v);
        return (typeof v === 'number' && v > 0 && x.op === 'transpose') ? `+${v}` : `${v}`;
      })
      .join(' ');
  }).join(', ');
  const body = [t, printOptions(link.options)].filter(Boolean).join(', ');   // link options, link-options.mjs
  return `${link.from} -> ${link.to}${body ? ` { ${body} }` : ''}${link.via ? ` via ${link.via}` : ''}`;
}

/** The reverse. Throws with the offending text, because a parser that returns
 *  null makes every caller invent its own message for the same fault. */
export function parseLink(line) {
  const m = /^\s*([^\s>]+)\s*->\s*([^\s{]+)\s*(?:\{(.*)\})?\s*(?:via\s+([A-Za-z0-9-]+))?\s*$/.exec(line);
  if (!m) throw new Error(`bay: cannot read "${line.trim()}". A link is "from -> to { op arg } via transport", the last two optional`);
  const [, from, to, body, via] = m;
  // `*` is a whole site segment or nothing.
  // why: lessons/kit-bay.md#parse-star
  for (const end of [from, to]) {
    if (end.includes('*') && !(end.startsWith('*:') && !end.slice(2).includes('*') && end.split(':').length === 3)) {
      throw new Error(`bay: cannot read "${end}". A * stands for a whole site, as in *:chat:value-in`);
    }
  }
  const options = {};   // link options, link-options.mjs: `w 640` is read here and checked by validate
  const transforms = (body || '').split(',').map((s) => s.trim()).filter(Boolean).filter((chunk) => {
    const [k, v, ...rest] = chunk.split(/\s+/);
    if (!isOption(k)) return true;
    if (k in options) throw new Error(`bay: ${k} is given twice in "${line.trim()}"`);
    if (rest.length) throw new Error(`bay: ${k} takes one value, and "${chunk}" gives ${rest.length + 1}`);
    options[k] = v === undefined ? undefined : (Number.isNaN(Number(v)) ? v : Number(v));
    return false;
  }).map((chunk) => {
    const parts = chunk.match(/"(?:[^"\\]|\\.)*"|\S+/g).map((x) => (x.startsWith('"') ? { q: JSON.parse(x) } : x));
    const op = parts.shift();
    if (!OPS[op]) throw new Error(`bay: no transform called "${op}". There are ${OP_NAMES.join(', ')}`);
    const t = { op };
    OPS[op].args.forEach((k, i) => {
      if (parts[i] === undefined || parts[i] === '*') return;   // `*` is an open end
      if (typeof parts[i] === 'object') { t[k] = parts[i].q; return; }
      const n = Number(parts[i]);
      t[k] = Number.isNaN(n) ? parts[i] : n;
    });
    return t;
  });
  return { from, to, transforms, ...(Object.keys(options).length ? { options } : {}), ...(via ? { via } : {}) };
}

// ── a `*` link, one to many (plans/plan-site-names.md §4h) ──────────────────

/** True of `*:node:port`, a link end that stands for every site with that port. */
export const isAny = (id) => typeof id === 'string' && id.startsWith('*:');
/**
 * Does a link end match a concrete port id. A concrete end matches itself; a `*`
 * end matches any site's port with the same `node:port`, EXCEPT a port on the
 * other end's own site, so a speaker never hears itself through its own `*`.
 */
export function endMatches(end, id, other) {
  if (!isAny(end)) return end === id;
  const [site, ...rest] = String(id).split(':');
  return rest.join(':') === end.slice(2) && site !== String(other).split(':')[0];
}

export function printPatch(links) { return links.map(printLink).join('\n'); }
export function parsePatch(text) {
  return String(text).split('\n')
    .map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean).map(parseLink);
}

// ── the bay ───────────────────────────────────────────────────────────────

/* How long since a heartbeat before a port is STALE, which is a third state
   and is not the same as absent. "I cannot ssh to it" is never "it is down".
   `STALE_MS` is the registry's, imported at the top of this file. */

/**
 * A link with `ahead` or `follow` is timed: the sender stamps `at`, the receiving bay asks
 * a timebase (injected via `createBay({ timing })`) when to deliver. Cannot tell holds and is
 * retried every 25 ms, dropped as `missed` after `holdMs`. Untimed links stay synchronous.
 * why: lessons/kit-bay.md#timing
 */
const HOLD_RETRY_MS = 25;
const RECHECK_MS = 50;
const defaultLocal = () => (typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : Date.now());
const timedLink = (l) => l?.options && (l.options.ahead !== undefined || l.options.follow !== undefined);

export function createBay({ now = () => Date.now(), timing = null } = {}) {
  const T = { timebase: null, local: defaultLocal, later: (fn, ms) => setTimeout(fn, ms), horizonMs: 0, holdMs: 3000, ...(timing || {}) };
  const ports = new Map();          // id -> port
  const links = new Map();          // id -> link
  const nodes = new Map();          // id -> node
  let nextLink = 1;

  /**
   * A thing that owns ports: an instrument, an engine, a store, a page.
   * Optional: a port with no node takes its place from its id, network unknown.
   * @param {object} n
   * @param {string} n.id      `site:node`, the first two segments of its ports' ids, which is how a port finds its node.
   * @param {string} n.kind    one of NODE_KINDS
   * @param {string} [n.label] what a person reads
   * @param {string} [n.place] the MACHINE it runs on. Defaults to the site.
   * @param {string} [n.net]   the NETWORK that machine is on. Unknown when left out, and unknown is never read as the same network.
   * @param {boolean} [n.consent] links OUT of this node need a person to ask for them. Always true for `external`, see `validate`.
   * why: lessons/kit-bay.md#addnode
   */
  function addNode(n) {
    const parts = String(n?.id || '').split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`bay: a node id is "site:node", not ${JSON.stringify(n?.id)}`);
    }
    if (!NODE_KINDS.includes(n.kind)) {
      throw new Error(`bay: kind is one of ${NODE_KINDS.join(', ')}, not ${n.kind}`);
    }
    nodes.set(n.id, { label: n.id, place: parts[0], seenAt: now(), ...n,
      consent: n.kind === 'external' || n.consent === true });
    return nodes.get(n.id);
  }
  /* A port names its node with `node`, or by the first two segments of its id. */
  const nodeFor = (p) => nodes.get(p.node ?? nodeOf(p.id));
  const siteOf = (p) => p.id.split(':')[0];
  const placeOf = (p) => nodeFor(p)?.place ?? siteOf(p);
  const netOf = (p) => nodeFor(p)?.net;

  /**
   * How far apart two ports are, as one of WHERE. An unknown network is the internet.
   * `internet-many` counts only internet receivers, and a link into a store is not a receiver.
   * why: lessons/kit-bay.md#whereof
   */
  function whereOf(a, b) {
    if (placeOf(a) === placeOf(b)) return { where: 'machine', receivers: 1 };
    const na = netOf(a), nb = netOf(b);
    if (na && nb && na === nb) return { where: 'network', receivers: 1 };
    const far = [...links.values()].filter((l) => l.from === a.id
      && nodeFor(ports.get(l.to) || { id: l.to })?.kind !== 'store'
      && /^internet/.test(l.session?.where || '')).length;
    return { where: far ? 'internet-many' : 'internet-one', receivers: far + 1 };
  }

  /**
   * The address is derived, never chosen: `<place>-<node>-<port>`, with the site after the
   * place when they differ. Two links out of one port share it. The Pi declares its own.
   * why: lessons/kit-bay.md#addressof
   */
  function addressOf(a) {
    // A port that knows where its stream really lives says so, and that wins:
    // the board's input rooms are `<room>-<input>`, not a derivation of an id.
    if (typeof a.address === 'string' && a.address) return a.address;
    const [site, node = '', port = ''] = a.id.split(':');
    // The site is in it when it is not the place, or every browser tab derives the same room.
    // why: lessons/kit-bay.md#addressof-site
    const place = placeOf(a);
    return [place, site !== place ? site : '', node, port].filter(Boolean).join('-');
  }

  /**
   * @param {object} p
   * @param {string} p.id      `site:node:port`. An id, never a name: a name is what a replug changes, and CoreMIDI really does rename a port to `Circuit 2` when it is held.
   * @param {string} p.label   what a person reads. Allowed to change.
   * @param {'in'|'out'} p.dir
   * @param {string} p.medium  one of MEDIA
   * @param {object} p.shape   what the data IS
   * @param {string[]} [p.accepts] in-ports: the classes it consents to
   * @param {string[]} [p.patches] in-ports: the patch names the instrument behind it can play, which a `patch` transform chooses from
   * @param {string[]} [p.never]   in-ports: classes that make a link a HARD REFUSAL rather than a quiet drop. See below.
   * @param {string[]} [p.emits]   out-ports: the classes it can produce
   * @param {Function} [p.deliver] in-ports: where a delivered event goes
   * @param {string[]} [p.transports] the only transports this port's stream really travels by, from TRANSPORT_NAMES. A session the table would give it otherwise is refused in words. See `sessionFor`.
   * @param {string} [p.heldBy]    in-ports: the site that holds this input. A link into it from any other site is refused in words. See `validate`.
   * why: lessons/kit-bay.md#addport
   */
  function addPort(p) {
    if (!p.id) throw new Error('bay: a port needs an id');
    if (!MEDIA.includes(p.medium)) throw new Error(`bay: medium is one of ${MEDIA.join(', ')}, not ${p.medium}`);
    if (p.dir !== 'in' && p.dir !== 'out') throw new Error('bay: dir is "in" or "out"');
    // A restriction naming an unknown transport throws here, where the port is declared.
    // why: lessons/kit-bay.md#addport-transports
    if (p.transports !== undefined) {
      const bad = Array.isArray(p.transports) ? p.transports.filter((t) => !TRANSPORT_NAMES.includes(t)) : ['not a list'];
      if (bad.length || !p.transports.length) {
        throw new Error(`bay: ${p.id} transports are a list from ${TRANSPORT_NAMES.join(', ')}, not ${JSON.stringify(p.transports)}`);
      }
    }
    ports.set(p.id, { accepts: [], never: [], emits: [], shape: {}, seenAt: now(), heard: 0, ...p });
    return ports.get(p.id);
  }
  function seen(id) { const p = ports.get(id); if (p) p.seenAt = now(); }
  function stale(p) { return now() - (p.seenAt ?? 0) > STALE_MS; }

  /**
   * Every refusal carries `why` and `fix`; `fix` says so in words when there is no repair.
   * @returns {{ok:boolean, why:string, fix?:string, warn?:string}}
   * why: lessons/kit-bay.md#validate
   */
  /**
   * `opts` is the same as `link` takes (`{ consent: true }`), so a page can ask first. An
   * allowed heavy link answers with the session it would open.
   * why: lessons/kit-bay.md#validate-opts
   */
  function validate(fromId, toId, transforms = [], opts = {}) {
    if (isAny(fromId) || isAny(toId)) return validateAny(fromId, toId, transforms, opts);
    const a = ports.get(fromId), b = ports.get(toId);
    const NO_PORT = 'Nothing on this desk answers to that name, so this link cannot be made.';
    if (!a) return { ok: false, why: `there is no port called ${fromId}.`, fix: NO_PORT };
    if (!b) return { ok: false, why: `there is no port called ${toId}.`, fix: NO_PORT };
    if (a.dir !== 'out') {
      return { ok: false, why: `${a.label} is an input, so nothing leaves it.`,
               fix: `A link starts at something that sends, so name what should reach ${a.label} instead.` };
    }
    if (b.dir !== 'in') {
      return { ok: false, why: `${b.label} is an output, so nothing arrives at it.`,
               fix: `A link ends at something that receives, so name what ${b.label} should reach instead.` };
    }
    if (a.medium !== b.medium) {
      return { ok: false, why: `${a.label} carries ${a.medium} and ${b.label} takes ${b.medium}.`,
               fix: `Nothing here turns ${a.medium} into ${b.medium}, so this link cannot be made.` };
    }
    if (a.id === b.id) {
      return { ok: false, why: 'a port cannot feed itself.',
               fix: 'Name a different instrument at one end of the link.' };
    }

    /**
     * A link out of an `external` node opens somebody else's server and counts in their
     * listener statistics, so it needs `consent === true` (nothing looser), a node property.
     * why: lessons/kit-bay.md#consent-source
     */
    const src = nodeFor(a);
    if (src?.consent && opts?.consent !== true) {
      return { ok: false,
               why: `${src.label} is somebody else's server, and this link would open a connection to it that they count as a listener.`,
               fix: 'Only a person who is going to listen can make this link, by asking for it themselves.' };
    }

    /**
     * A port with `heldBy: <site>` refuses a link into it from any other site, holder named.
     * The asker is `opts.site` when given. Model level only: nothing on the Pi reads it yet.
     * why: lessons/kit-bay.md#heldby
     */
    if (b.heldBy) {
      const asker = typeof opts?.site === 'string' && opts.site ? opts.site : a.id.split(':')[0];
      if (String(b.heldBy) !== asker) {
        return { ok: false,
                 why: `${b.label} is held by ${b.heldBy}, and only that site may link into it.`,
                 fix: `Ask whoever is at ${b.heldBy} to let ${b.label} go, or link into another input.` };
      }
    }

    /**
     * Transforms are MIDI operations; on any other medium they are refused, not ignored.
     * why: lessons/kit-bay.md#transforms-medium
     */
    if (a.medium !== 'midi' && (transforms || []).length) {
      const names = transforms.map((t) => t?.op).filter(Boolean);
      return { ok: false,
               why: `${a.label} carries ${a.medium}, and ${names.length ? names.join(', ') : 'a transform'} only works on MIDI notes and controllers.`,
               fix: 'Make the link with no transforms, and put any change to the notes on the MIDI link that feeds it.' };
    }

    /* Before anything about the ports: is the list of transforms even well
       formed. See `checkTransforms`, which exists because a model produced a
       schema valid transform with its argument under the wrong key. */
    const badT = checkTransforms(transforms);
    if (badT) return { ok: false, ...badT };
    const chosen = patchFor(transforms, b);
    if (chosen.refuse) return { ok: false, ...chosen.refuse };
    const drum = drummapFor(transforms, b, a);
    if (drum.refuse) return { ok: false, ...drum.refuse };
    const badO = checkOptions(a.medium, opts?.options);   // link options, link-options.mjs
    if (badO) return { ok: false, ...badO };
    const badF = followRefusal(opts?.options?.follow, a, b);
    if (badF) return { ok: false, ...badF };

    // Shape. The field that disagrees is named: `48000 against 44100`.
    // why: lessons/kit-bay.md#shape
    // Compared by value: a range is a pair, and two arrays are never `===`.
    // why: lessons/kit-bay.md#shape-value
    const same = (x, y) => x === y
      || (typeof x === 'object' && x !== null && JSON.stringify(x) === JSON.stringify(y));
    // MIDI channels are a set: a source on 10 fits a port that plays 1, 2 and 10.
    // why: lessons/kit-bay.md#channels-subset
    const fits = (k, x, y) => (k === 'channels' && a.medium === 'midi' && Array.isArray(y)
      ? [].concat(x).every((c) => y.includes(c)) : same(x, y));
    for (const k of Object.keys(b.shape || {})) {
      if (a.shape?.[k] === undefined) continue;
      if (k === 'channels' && a.medium === 'midi' && Array.isArray(b.shape[k]) && !fits(k, a.shape[k], b.shape[k])) {
        const extra = [].concat(a.shape[k]).filter((c) => !b.shape[k].includes(c));
        return { ok: false,
                 why: `${a.label} sends on channel ${extra.join(', ')} and ${b.label} plays only ${b.shape[k].join(', ')}.`,
                 fix: `Put the link on one of ${b.shape[k].join(', ')}: ${JSON.stringify({ op: 'channel', to: b.shape[k][0] })}.` };
      }
      if (!fits(k, a.shape[k], b.shape[k])) {
        return { ok: false,
                 why: `${k} does not match: ${a.label} is ${a.shape[k]} and ${b.label} wants ${b.shape[k]}.`,
                 fix: 'Nothing here can change what either end speaks, so this link cannot be made.' };
      }
    }

    /**
     * Consent is two questions. A class the port does not handle is dropped and reported;
     * a class in its `never` list is a hard refusal (the Circuit's SysEx).
     * why: lessons/kit-bay.md#accepts-never
     */
    let could;
    try { could = delivers(a.emits, transforms); }
    catch (e) { return { ok: false, why: e.message, fix: PICK_AN_OP() }; }
    for (const c of could) {
      if (b.never.includes(c)) {
        /**
         * The fix offered is the transform that drops the class; `never` itself is not bendable.
         * why: lessons/kit-bay.md#never-fix
         */
        return { ok: false,
                 why: `${b.label} does not accept ${c}, and this link could deliver it.`,
                 fix: `Stop the link carrying ${c}: ${JSON.stringify({ op: 'drop', cls: c })}.` };
      }
    }
    // The source left with nothing is checked before the destination taking none, or the
    // second message misdescribes the first fault.
    // why: lessons/kit-bay.md#empty-source
    if (a.medium === 'midi' && could.size === 0) {
      const names = (transforms || []).map((t) => t.op);
      return { ok: false,
               why: 'these transforms drop everything, so the link would carry nothing.',
               fix: names.length
                 ? `The link runs ${names.join(', then ')}. Take one of them off.`
                 : `${a.label} sends nothing at all, so this link cannot be made.` };
    }
    const dropped = [...could].filter((c) => !b.accepts.includes(c));
    const carried = [...could].filter((c) => b.accepts.includes(c));
    if (a.medium === 'midi' && !carried.length) {
      return { ok: false, why: `${b.label} takes none of what this link carries.`,
               fix: b.accepts.length
                 ? `${b.label} takes ${b.accepts.join(', ')}, so send it one of those.`
                 : `${b.label} takes nothing at all, so nothing can ever reach it.` };
    }

    // Cycles, at node level, because hardware THRU can close one outside our view.
    // A loop through a store is a replay, not feedback; a store anywhere on the path breaks it.
    // why: lessons/kit-bay.md#store-loop
    const isStore = (id) => nodes.get(id)?.kind === 'store';
    if (!isStore(nodeOf(a.id)) && !isStore(nodeOf(b.id))
        && reachesNode(nodeOf(b.id), nodeOf(a.id), a.medium, isStore)) {
      return { ok: false, why: `that closes a loop: ${b.label} already reaches ${a.label}.`,
               fix: `Remove the link that already joins them, and then this one can be made.` };
    }
    const warns = [];
    if (stale(a) || stale(b)) {
      const p = stale(a) ? a : b;
      warns.push(`${p.label} has not been heard from for ${Math.round((now() - (p.seenAt ?? 0)) / 1000)}s`);
    }
    if (dropped.length) warns.push(`${b.label} will drop ${dropped.join(', ')}`);
    // One instrument plays one patch: a second link choosing another one switches it for both.
    if (chosen.name) {
      const other = [...links.values()].find((l) => l.to === b.id && patchOf(l.transforms)
        && patchOf(l.transforms).toLowerCase() !== chosen.name.toLowerCase());
      if (other) warns.push(`${b.label} plays ${patchOf(other.transforms)} for another link, and this one switches it to ${chosen.name}`);
    }
    // A port whose drums are not General MIDI: say what a plain link loses, or what the map drops.
    // why: lessons/kit-bay.md#drummap-warn
    const dm = b.drums;
    if (dm && dm.map && carried.includes('note')) {
      const notes = Object.values(dm.map).join(', ');
      if (!drum.drums) {
        warns.push(`${dm.label || b.label} takes its own drum notes (${notes}); this link sends General MIDI, so a kick (36) will not sound. Add ${JSON.stringify({ op: 'drummap', name: dm.name })}`);
      } else warns.push(`${dm.label || b.label} plays General MIDI ${Object.keys(dm.map).join(', ')} and drops every other drum note`);
    }
    const ses = sessionFor(a, b, opts);
    if (ses.refuse) return { ok: false, ...ses.refuse };
    return { ok: true, why: '', ...(warns.length ? { warn: warns.join('. ') } : {}),
             session: ses.session, ...(ses.via ? { via: ses.via } : {}),
             ...(chosen.name ? { patch: chosen.name } : {}), ...(drum.drums ? { drums: drum.drums } : {}) };
  }

  /**
   * A `*` link: the pattern is checked here, each concrete pair by `validate` on every send.
   * Zero matches answers ok with a warning. Light media other than MIDI only.
   * why: lessons/kit-bay.md#star
   */
  /**
   * `follow` names the HEAVY link to wait for. Unknown is allowed, because a
   * page may make the light link before the heavy one exists, and the timebase
   * holds until it has observed it. What is refused is a name the bay KNOWS to
   * be light, or the link's own ends: following yourself is no lag at all.
   */
  function followRefusal(f, a, b) {
    if (f === undefined) return '';
    if (f === a?.id || f === b?.id) {
      return { why: `follow ${f} names this link's own end, and a link cannot wait for itself.`,
               fix: 'Name the video or sound link whose picture or beat this one belongs to.' };
    }
    const p = ports.get(f) || ports.get(links.get(f)?.from);
    if (p && !HEAVY.includes(p.medium)) {
      return { why: `follow ${f} names a ${p.medium} link, and only a heavy link (${HEAVY.join(', ')}) arrives late enough to wait for.`,
               fix: 'Name the video or sound link this one belongs to, or leave follow out.' };
    }
    return '';
  }

  function validateAny(fromId, toId, transforms = [], opts = {}) {
    if (isAny(fromId) && isAny(toId)) {
      return { ok: false, why: 'both ends are *, so the link names nobody.',
               fix: 'Name one end: your own port, as in web-ab12:chat:value-out -> *:chat:value-in.' };
    }
    const anyEnd = isAny(fromId) ? fromId : toId, realId = isAny(fromId) ? toId : fromId;
    const real = ports.get(realId);
    if (!real) return { ok: false, why: `there is no port called ${realId}.`,
                        fix: 'Nothing on this desk answers to that name, so this link cannot be made.' };
    const want = isAny(fromId) ? 'in' : 'out';
    if (real.dir !== want) {
      return { ok: false, why: `${real.label} is an ${real.dir === 'in' ? 'input' : 'output'}, and a * at the other end needs an ${want === 'in' ? 'input' : 'output'} here.`,
               fix: 'A * speaker is your out -> *:node:in, and a * listener is *:node:out -> your in.' };
    }
    if (HEAVY.includes(real.medium) || real.medium === 'midi') {
      return { ok: false, why: `${real.label} carries ${real.medium}, and a * link is only for light media other than MIDI.`,
               fix: real.medium === 'midi' ? 'Link each instrument by name, so a thru cannot close a loop.'
                 : 'Link each receiver by name, so each gets a session of its own.' };
    }
    if ((transforms || []).length) {
      return { ok: false, why: `${real.label} carries ${real.medium}, and transforms only work on MIDI notes and controllers.`,
               fix: 'Make the link with no transforms.' };
    }
    if (typeof opts?.via === 'string' && opts.via) {
      return { ok: false, why: `${real.label} carries ${real.medium}, which travels inside the link itself, so there is no transport to ask for.`,
               fix: `Make the link without via ${opts.via}.` };
    }
    const badO = checkOptions(real.medium, opts?.options);   // link options, link-options.mjs
    if (badO) return { ok: false, ...badO };
    const badF = followRefusal(opts?.options?.follow, real, null);
    if (badF) return { ok: false, ...badF };
    const matches = expand({ from: fromId, to: toId }, opts);
    return { ok: true, why: '', matches, session: null,
             ...(matches.length ? {} : { warn: `nobody matches ${anyEnd} yet` }) };
  }

  /**
   * The concrete pairs a link stands for right now, each with the ordinary
   * `validate`'s answer. A concrete link is one pair.
   */
  function expand(l, opts = {}) {
    let pairs;
    if (isAny(l.from)) {
      pairs = [...ports.values()].filter((p) => p.dir === 'out' && endMatches(l.from, p.id, l.to)).map((p) => [p.id, l.to]);
    } else if (isAny(l.to)) {
      pairs = [...ports.values()].filter((p) => p.dir === 'in' && endMatches(l.to, p.id, l.from)).map((p) => [l.from, p.id]);
    } else pairs = [[l.from, l.to]];
    return pairs.map(([from, to]) => {
      const v = validate(from, to, l.transforms || [], opts);
      return { from, to, ok: v.ok, why: v.why || '' };
    });
  }

  /**
   * Every concrete port an event leaving `fromId` would reach, along every
   * enabled link, `*` links expanded and each pair validated now. This is what
   * `bay-node.mjs` reads to decide whether an event has to cross the network.
   */
  function targets(fromId) {
    const out = [];
    for (const l of links.values()) {
      if (!l.enabled) continue;
      if (isAny(l.from) || isAny(l.to)) {
        if (isAny(l.from) ? !endMatches(l.from, fromId, l.to) : l.from !== fromId) continue;
        for (const m of expand({ from: isAny(l.from) ? fromId : l.from, to: l.to })) {
          if (m.ok && m.from === fromId) out.push({ to: m.to, link: l });
        }
      } else if (l.from === fromId) out.push({ to: l.to, link: l });
    }
    return out;
  }

  /**
   * What a heavy link is instead of bytes: `{ transport, address, shape, where, says }`.
   * Null for light media. Derived every time, never written in the text form.
   * why: lessons/kit-bay.md#sessionfor
   */
  // A link with a store at either end rides the `file` row, whatever it carries. A recording
  // is one writer, never `internet-many`. The address is the store's.
  // why: lessons/kit-bay.md#sessionfor-store
  // A store to one reader is an https read. A port's `transports` and a link's `via` can
  // narrow the table, refused in words when nothing fits. The restriction applies to its own leg;
  // a `says` for a transport the cell did not choose quotes no number.
  // why: lessons/kit-bay.md#sessionfor-via
  function sessionFor(a, b, opts = {}) {
    const via = typeof opts?.via === 'string' && opts.via ? opts.via : null;
    if (!HEAVY.includes(a.medium)) {
      if (!via) return { session: null };
      // A light link between two sites may name its wire (relay or WebRTC), as the page opened it.
      // why: lessons/kit-bay.md#light-via
      if (LIGHT_VIA.includes(via) && siteOf(a) !== siteOf(b)) return { session: null, via };
      return { refuse: { why: `${a.label} carries ${a.medium}, which travels inside the link itself, so there is no transport to ask for.`,
                         fix: `Make the link without via ${via}.` } };
    }
    // Two audio ports on one site that both travel by `jack` are a link inside one board's
    // JACK graph; the session carries the `jackRows`. Same site, not same place.
    // why: lessons/kit-bay.md#jack
    const jackable = (p) => Array.isArray(p.jack) && p.jack.length && (p.transports ?? []).includes('jack');
    if (a.medium === 'audio' && (!via || via === 'jack') && (jackable(a) || jackable(b) || via === 'jack')) {
      if (siteOf(a) === siteOf(b) && jackable(a) && jackable(b)) {
        const r = jackRows(a.jack, b.jack);
        if (!r.ok) return { refuse: { why: `${a.label} into ${b.label}: ${r.why}.`, fix: 'Link a source and a destination whose channel counts pair.' } };
        return { session: { transport: 'jack', address: placeOf(a), shape: { ...(a.shape || {}) }, where: 'machine',
                 says: `JACK on ${siteOf(a)}, ${r.says}, no number measured`, rows: r.rows, ...(via ? { via } : {}) } };
      }
      const only = [a, b].find((p) => (p.transports ?? []).length && p.transports.every((t) => t === 'jack'));
      if (only || via === 'jack') {
        const other = only === a ? b : a;
        return { refuse: { why: siteOf(a) !== siteOf(b)
            ? `${(only ?? a).label} travels by JACK, which never leaves ${siteOf(only ?? a)}, and ${other.label} is on ${siteOf(other)}.`
            : `${other.label} is not on the board's JACK graph, so ${(only ?? a).label} cannot reach it there.`,
          fix: 'Link it to another JACK end on the same board, or listen to what the board captures instead.' } };
      }
    }
    const into = nodeFor(b)?.kind === 'store', outOf = !into && nodeFor(a)?.kind === 'store';
    const { where, receivers } = whereOf(a, b);
    let t;
    if (outOf) {
      const col = where === 'internet-one' && receivers > 1 ? 'internet-many' : where;
      t = { where: col, ...READS[col] };
    } else {
      const w = into && where === 'internet-many' ? 'internet-one' : where;
      t = chooseTransport(into ? 'file' : a.medium, w, into ? 1 : receivers);
    }
    const legs = (into ? [b] : outOf ? [a] : [a, b]).filter((p) => Array.isArray(p.transports));
    const allows = (x) => legs.every((p) => p.transports.includes(x));
    const only = (p) => p.transports.join(' or ');
    const firstBar = (x) => legs.find((p) => !p.transports.includes(x));
    const cell = [t.transport, t.or].flat().filter(Boolean);
    let chosen;
    if (via) {
      if (!TRANSPORT_NAMES.includes(via)) {
        return { refuse: { why: `no transport here is called ${via}.`,
                           fix: `Ask for one of ${TRANSPORT_NAMES.join(', ')}, or leave via off.` } };
      }
      if (MACHINE_ONLY.includes(via) && t.where !== 'machine') {
        return { refuse: { why: `${via} never leaves one machine, and ${a.label ?? a.id} and ${b.label ?? b.id} are on two.`,
                           fix: `Leave via off and the link rides ${cell.find(allows) || t.transport}.` } };
      }
      // A wire transport between two ports of one site is refused; same site, not same place.
      // why: lessons/kit-bay.md#same-site
      if (!MACHINE_ONLY.includes(via) && t.where === 'machine' && siteOf(a) === siteOf(b)) {
        return { refuse: { why: `${a.label ?? a.id} and ${b.label ?? b.id} are both on ${siteOf(a)}, so ${via} would send it out over a wire and back to where it started.`,
                           fix: `Leave via off and the link rides ${cell.find(allows) || t.transport}.` } };
      }
      const bar = firstBar(via);
      if (bar) {
        return { refuse: { why: `${bar.label ?? bar.id} only travels by ${only(bar)}, and this link asks for ${via}.`,
                           fix: `Ask for ${bar.transports[0]} instead.` } };
      }
      chosen = via;
    } else {
      chosen = cell.find(allows);
      if (!chosen) {
        const bar = firstBar(cell[0]);
        return { refuse: { why: `${bar.label ?? bar.id} only travels by ${only(bar)}, and at ${t.where} the table offers ${cell.join(' or ')}.`,
                           fix: `Ask for ${bar.transports[0]} by name with via, or link it to a receiver nearer to it.` } };
      }
    }
    const says = t.notes?.[chosen] || (cell.includes(chosen) ? t.says : `${chosen}, asked for on this link, no number measured`);
    return { session: { transport: chosen, address: addressOf(into ? b : a), shape: { ...(a.shape || {}) },
             where: t.where, says, ...(t.or && chosen === t.transport ? { or: t.or } : {}),
             ...(via ? { via } : {}) } };
  }

  /**
   * Can a signal standing at `startNode` reach `targetNode` through existing links.
   * It walks nodes, not ports: no link starts at an input.
   * why: lessons/kit-bay.md#reachesnode
   */
  // One medium at a time: only a link of the same medium can echo.
  // why: lessons/kit-bay.md#reaches-medium
  function reachesNode(startNode, targetNode, medium, through = () => false) {
    const seenNodes = new Set();
    const walk = (n) => {
      if (n === targetNode) return true;
      if (seenNodes.has(n)) return false;
      if (n !== startNode && through(n)) return false;   // a path through a store is not a loop
      seenNodes.add(n);
      for (const l of links.values()) {
        /* A `*` link is not walked: it is light and never MIDI (§4h), so it
           cannot echo, and walking `*:chat` as a node would invent paths. */
        if (isAny(l.from) || isAny(l.to)) continue;
        if (nodeOf(l.from) !== n) continue;
        if (medium && ports.get(l.from)?.medium !== medium) continue;
        if (walk(nodeOf(l.to))) return true;
      }
      return false;
    };
    return walk(startNode);
  }
  const nodeOf = (id) => id.split(':').slice(0, 2).join(':');

  /**
   * @param {object} [opts] `{ consent }`, see `validate`. Never stored: a consent is a person asking once, not a property of the link.
   * `session` is null on a light link and an object on a heavy one. An earlier link keeps
   * the session it was made with.
   * why: lessons/kit-bay.md#link
   */
  function link(fromId, toId, transforms = [], opts = {}) {
    const v = validate(fromId, toId, transforms, opts);
    if (!v.ok) return { ok: false, why: v.why, fix: v.fix || '' };
    const id = `L${nextLink++}`;
    // The patch is stored in the instrument's own spelling, so a runtime matches it exactly.
    if (v.patch) transforms = transforms.map((t) => (t?.op === 'patch' ? { ...t, name: v.patch } : t));
    if (v.drums) transforms = transforms.map((t) => (t?.op === 'drummap' ? resolveDrummap(t, v.drums) : t));
    links.set(id, { id, from: fromId, to: toId, transforms, enabled: true, sent: 0, dropped: 0,
                    session: v.session, ...(v.session?.via || v.via ? { via: v.session?.via || v.via } : {}),
                    ...(opts.options && Object.keys(opts.options).length ? { options: { ...opts.options } } : {}) });
    return { ok: true, id, why: '', warn: v.warn, session: v.session, ...(v.matches ? { matches: v.matches } : {}) };
  }
  function unlink(id) { return links.delete(id); }

  /**
   * One event leaving one port. `link.sent` is what this side queued, `port.heard` what the
   * far side took; only the second is evidence.
   * why: lessons/kit-bay.md#send
   */
  // `fromId` may be another site's port: delivered only along a link this bay holds into a port
  // with `deliver`. The class guard is MIDI only. `meta` reaches `deliver` as its third argument.
  // why: lessons/kit-bay.md#send-remote
  function send(fromId, ev, meta = {}) {
    seen(fromId);
    let out = 0;
    for (const { to, link: l } of targets(fromId)) {
      const e = apply(l.transforms, ev);
      if (!e) { l.dropped++; continue; }
      const dst = ports.get(to);
      if (!dst) continue;
      if (dst.medium === 'midi' && !dst.accepts.includes(e.cls)) { l.dropped++; continue; }   // the guard is at the destination
      l.sent++;
      if (timedLink(l)) { schedule(e, l, dst, { ...meta, from: fromId, to }); out++; continue; }
      dst.heard++;
      dst.deliver?.(e, l, { ...meta, from: fromId, to });
      out++;
    }
    return out;
  }

  /**
   * One event on a timed link: deliver now, set a timer, or hold and ask again.
   * `meta.timing` is `{ at, local, lateMs, why, option }`. `port.heard` counts on delivery;
   * `link.held` and `link.missed` count the rest.
   * why: lessons/kit-bay.md#schedule
   */
  function schedule(e, l, dst, meta) {
    const o = l.options;
    const at = Number.isFinite(meta.at) ? meta.at : null;
    const option = o.follow !== undefined ? `follow ${o.follow}` : `ahead ${o.ahead}`;
    const tev = at == null ? null : { at, ...(o.follow !== undefined ? { follow: o.follow } : {}) };
    const t0 = T.local();
    l.held ??= 0; l.missed ??= 0; l.late ??= [];
    const give = (v) => {
      dst.heard++;
      if (Number.isFinite(v.lateMs)) { l.late.push(v.lateMs); if (l.late.length > 64) l.late.shift(); }
      dst.deliver?.(e, l, { ...meta, timing: { at, local: v.local, lateMs: v.lateMs, why: v.why, option } });
    };
    const ask = (first) => {
      const nowL = T.local();
      const v = !tev ? { act: 'hold', why: 'the sender stamped no at, so it had no shared clock' }
        : !T.timebase ? { act: 'hold', why: 'this bay was given no timebase' }
        : T.timebase.decide(tev, nowL, { horizonMs: T.horizonMs, pastWindowMs: T.holdMs });
      if (v.act === 'fire') return give(v);
      // A wait is asked again every RECHECK_MS, because a followed line steps: sleeping fired
      // +2004 ms late on every cue across a 2 s step back (measured).
      // why: lessons/kit-bay.md#recheck
      if (v.act === 'wait') { T.later(() => ask(false), Math.min(RECHECK_MS, Math.max(0, v.local - T.horizonMs - nowL))); return; }
      if (v.act === 'hold' && nowL - t0 < T.holdMs && tev) {
        if (first) l.held++;
        T.later(() => ask(false), HOLD_RETRY_MS);
        return;
      }
      if (first && v.act === 'hold') l.held++;
      l.missed++;
      l.lastWhy = v.why;
    };
    ask(true);
  }

  return {
    addPort, addNode, validate, link, unlink, send, seen, expand, targets,
    port: (id) => ports.get(id),
    ports: () => [...ports.values()],
    node: (id) => nodes.get(id),
    nodes: () => [...nodes.values()],
    links: () => [...links.values()],
    stale,
    text: () => printPatch([...links.values()]),
    /**
     * Load a text patch. Returns every line that was refused, with its reason. A consent is
     * never in the text: pass `{ consent: true }` for a line out of an `external` node.
     * why: lessons/kit-bay.md#load
     */
    load(text, opts = {}) {
      const bad = [];
      for (const l of parsePatch(text)) {
        const r = link(l.from, l.to, l.transforms, { ...opts, ...(l.via ? { via: l.via } : {}), ...(l.options ? { options: l.options } : {}) });
        if (!r.ok) bad.push({ line: printLink(l), why: r.why, fix: r.fix || '' });
      }
      return bad;
    },
  };
}
