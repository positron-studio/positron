// demo/shell/bay-test.mjs: the patch bay's arithmetic, with no browser, socket or instrument.
//   node demo/shell/bay-test.mjs
// Most are negative controls asserting the reason too; the sabotage table is in the lesson.
// why: lessons/kit-bay.md#test-header

import { createBay, apply, delivers, printLink, parseLink, printPatch, parsePatch,
  classOf, eventOf, isNoteOff, checkTransforms, CLASSES, MEDIA, STALE_MS, OP_NAMES, OP_HELP,
  OP_SAYS, HEAVY, NODE_KINDS, WHERE, TRANSPORTS, chooseTransport,
  RELAY, READS, TRANSPORT_NAMES, MACHINE_ONLY, patchOf } from './bay.mjs';
import { STALE_MS as REGISTRY_STALE_MS } from './graph-registry.mjs';
import { decode } from './midi-decode.mjs';

/**
 * A refusal is `''` or `{ why, fix }`; checks below match `why`.
 * why: lessons/kit-bay.md#test-why
 */
const why = (t) => checkTransforms(t).why || '';
const fix = (t) => checkTransforms(t).fix || '';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${detail ? ' · ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' · ' + detail : ''}`); }
};

// A desk that matches the real one, with the measured facts in it.
function desk({ accepts = ['note', 'cc', 'bend'] } = {}) {
  const b = createBay();
  b.addPort({ id: 'here:mk425c:out', label: 'MK-425C', dir: 'out', medium: 'midi',
    shape: { protocol: '1.0' }, emits: ['note', 'cc', 'bend'] });
  b.addPort({ id: 'here:circuit:in', label: 'Circuit', dir: 'in', medium: 'midi',
    shape: { protocol: '1.0' }, accepts, never: ['sysex'], deliver: (e) => heard.push(e) });
  b.addPort({ id: 'here:circuit:out', label: 'Circuit out', dir: 'out', medium: 'midi',
    shape: { protocol: '1.0' }, emits: ['note', 'cc', 'clock'] });
  b.addPort({ id: 'here:mk425c:in', label: 'MK-425C in', dir: 'in', medium: 'midi',
    shape: { protocol: '1.0' }, accepts: ['note', 'cc', 'bend', 'clock'] });
  b.addPort({ id: 'here:board:in', label: 'board', dir: 'in', medium: 'midi',
    shape: { protocol: '1.0' }, accepts: ['note', 'cc', 'bend'] });
  b.addPort({ id: 'here:ftpro:in', label: 'Fast Track Pro', dir: 'in', medium: 'audio',
    shape: { rate: 48000, channels: 2, frameMs: 20 }, accepts: [] });
  b.addPort({ id: 'here:circuit:audio', label: 'Circuit audio', dir: 'out', medium: 'audio',
    shape: { rate: 48000, channels: 2, frameMs: 20 }, emits: [] });
  return b;
}
let heard = [];
const ev = (bytes) => { const m = decode(bytes); return { cls: classOf(m), ch: m.ch, d1: m.d1, d2: m.d2 }; };

console.log('\n== the patch bay ==');

// ── what it allows ─────────────────────────────────────────────────────────

{
  const b = desk();
  const r = b.link('here:mk425c:out', 'here:circuit:in', [{ op: 'channel', to: 1 }]);
  ok('a keyboard may reach a synth', r.ok, r.why || r.id);
}

{
  // 1. The smallest useful patch on this desk, and every number in it is
  //    measured: the MK-425C's global channel is 2, the Circuit's first synth
  //    listens on 1, and the keyboard is a semitone flat.
  heard = [];
  const b = desk();
  b.link('here:mk425c:out', 'here:circuit:in', [{ op: 'channel', to: 1 }, { op: 'transpose', by: 1 }]);
  b.send('here:mk425c:out', ev([0x91, 47, 100]));      // lowest key, channel 2
  ok('a note arrives on channel 1, a semitone up',
    heard.length === 1 && heard[0].ch === 1 && heard[0].d1 === 48,
    heard.length ? `ch ${heard[0].ch}, note ${heard[0].d1}` : 'nothing arrived');
}

{
  // 2. NEGATIVE CONTROL for the one above. With no transforms the event must
  //    arrive UNCHANGED, or the test above would pass on a bay that rewrote
  //    every event to something plausible.
  heard = [];
  const b = desk();
  b.link('here:mk425c:out', 'here:circuit:in', []);
  b.send('here:mk425c:out', ev([0x91, 47, 100]));
  ok('and with no transforms nothing about it changes',
    heard.length === 1 && heard[0].ch === 2 && heard[0].d1 === 47,
    heard.length ? `ch ${heard[0].ch}, note ${heard[0].d1}` : 'nothing arrived');
}

{
  // 3. Fan out is free and needs no graph walk.
  heard = [];
  const b = desk();
  b.link('here:mk425c:out', 'here:circuit:in', []);
  b.link('here:mk425c:out', 'here:board:in', []);
  const n = b.send('here:mk425c:out', ev([0x91, 60, 100]));
  ok('one source reaches two destinations', n === 2, `${n} deliveries`);
}

// ── what it refuses, which is the point ────────────────────────────────────

{
  // 4. The one that matters on this desk: one byte inside SysEx overwrites a Circuit patch.
  // why: lessons/kit-bay.md#test-sysex
  const b = desk();
  b.addPort({ id: 'here:dump:out', label: 'dumper', dir: 'out', medium: 'midi',
    shape: { protocol: '1.0' }, emits: ['note', 'sysex'] });
  const r = b.link('here:dump:out', 'here:circuit:in', []);
  ok('a link that could carry SysEx to the Circuit is refused',
    !r.ok && /sysex/i.test(r.why), r.why);
}

{
  // 5. NEGATIVE CONTROL for 4. The same source is allowed once SysEx is dropped,
  //    or the refusal above would be a bay that simply refuses that port.
  const b = desk();
  b.addPort({ id: 'here:dump:out', label: 'dumper', dir: 'out', medium: 'midi',
    shape: { protocol: '1.0' }, emits: ['note', 'sysex'] });
  const r = b.link('here:dump:out', 'here:circuit:in', [{ op: 'drop', cls: 'sysex' }]);
  ok('and the same link is allowed once SysEx is dropped', r.ok, r.why);
}

{
  // 6. The guard is at the DESTINATION and is not only a connect time check: an
  //    event of a class the port never consented to must not be delivered even
  //    if a link somehow exists.
  heard = [];
  const b = desk({ accepts: ['note'] });
  b.link('here:mk425c:out', 'here:circuit:in', [{ op: 'only', cls: 'note' }]);
  b.send('here:mk425c:out', ev([0xb1, 74, 64]));       // a control change
  ok('a class the destination never accepted is not delivered',
    heard.length === 0, `${heard.length} arrived`);
}

{
  // 7. A cycle. Easy to build by accident the moment two boxes are involved,
  //    and it echoes forever at wire speed.
  const b = desk();
  b.addPort({ id: 'here:mk425c:thru', label: 'MK-425C thru', dir: 'out', medium: 'midi',
    shape: { protocol: '1.0' }, emits: ['note'] });
  b.link('here:mk425c:out', 'here:circuit:in', []);
  const r = b.link('here:circuit:out', 'here:mk425c:in', []);
  ok('a link that closes a loop is refused and says which way round',
    !r.ok && /loop/i.test(r.why), r.why);
}

{
  // 8. Mediums.
  const b = desk();
  const r = b.link('here:mk425c:out', 'here:ftpro:in', []);
  ok('a MIDI port cannot feed an audio port', !r.ok && /midi|audio/.test(r.why), r.why);
}

{
  // 9. A shape mismatch names the field and both numbers.
  // why: lessons/kit-bay.md#test-shape
  const b = desk();
  b.addPort({ id: 'here:board:out', label: 'board', dir: 'out', medium: 'audio',
    shape: { rate: 44100, channels: 2, frameMs: 20 }, emits: [] });
  const r = b.link('here:board:out', 'here:ftpro:in', []);
  ok('a shape mismatch names the field and both values',
    !r.ok && r.why.includes('rate') && r.why.includes('44100') && r.why.includes('48000'), r.why);
}

{
  // 10. NEGATIVE CONTROL for 9: the same two ports connect once the rate agrees.
  const b = desk();
  b.addPort({ id: 'here:board:out', label: 'board', dir: 'out', medium: 'audio',
    shape: { rate: 48000, channels: 2, frameMs: 20 }, emits: [] });
  const r = b.link('here:board:out', 'here:ftpro:in', []);
  ok('and the same pair connects once the rate agrees', r.ok, r.why);
}

{
  const b = desk();
  ok('a port that does not exist is named in the refusal',
    !b.link('here:nothing:out', 'here:circuit:in', []).ok
    && b.link('here:nothing:out', 'here:circuit:in', []).why.includes('here:nothing:out'),
    b.link('here:nothing:out', 'here:circuit:in', []).why);
}

{
  const b = desk();
  const r = b.link('here:circuit:in', 'here:circuit:in', []);
  ok('an input cannot be a source', !r.ok, r.why);
}

{
  // 11. Transforms leaving the source no class are refused; different from 11c, where the
  //     destination takes none of what arrives.
  // why: lessons/kit-bay.md#test-nothing-left
  const b = desk();
  const r = b.link('here:mk425c:out', 'here:circuit:in', [{ op: 'only', cls: 'sysex' }]);
  ok('a link whose transforms leave no class at all is refused',
    !r.ok && /nothing/.test(r.why), r.why);
}

// ── transforms ─────────────────────────────────────────────────────────────

{
  // 12. Out of range is a DROP, not a clamp. A clamp turns the top of a
  //     keyboard into a pile of one note, which sounds like a stuck key.
  ok('a transpose off the end of the keyboard drops the note',
    apply([{ op: 'transpose', by: 12 }], { cls: 'note', ch: 1, d1: 120, d2: 64 }) === null,
    '120 + 12');
  ok('and one that fits does not',
    apply([{ op: 'transpose', by: 12 }], { cls: 'note', ch: 1, d1: 60, d2: 64 })?.d1 === 72, '60 + 12');
}

{
  // 13. A note off is a release and scaling its velocity makes a release that
  //     never reaches zero.
  const off = apply([{ op: 'velocity', scale: 0.5 }], { cls: 'note', ch: 1, d1: 60, d2: 0 });
  ok('a velocity curve leaves a note off alone', off.d2 === 0, `velocity ${off.d2}`);
}

{
  // 14. The `(channel, controller)` key, which the Circuit proves: CC 80 is
  //     macro knob 1 on channel 1 AND drum 4 pan on channel 10.
  const out = apply([{ op: 'cc', from: 1, to: 74, ch: 16 }], { cls: 'cc', ch: 2, d1: 1, d2: 64 });
  ok('a CC remap moves the controller and the channel together',
    out.d1 === 74 && out.ch === 16, `CC ${out.d1} on channel ${out.ch}`);
  const other = apply([{ op: 'cc', from: 1, to: 74, ch: 16 }], { cls: 'cc', ch: 2, d1: 7, d2: 64 });
  ok('and it leaves a different controller entirely alone',
    other.d1 === 7 && other.ch === 2, `CC ${other.d1} on channel ${other.ch}`);
}

// -- a transform that is not well formed --
// Measured: a model returned `{ op: 'transpose', to: 1 }`, schema valid and NaN in use.
// why: lessons/kit-bay.md#test-malformed

{
  const b = desk();
  const r = b.link('here:mk425c:out', 'here:circuit:in', [{ op: 'transpose', to: 1 }]);
  // The refusal names what is missing in words, and the fix carries the 1 over.
  // why: lessons/kit-bay.md#test-wrong-key
  ok('a transform with its argument under the wrong key is refused, by name',
    !r.ok && r.why.includes('transpose')
    && r.why.includes('the number of semitones')
    && r.fix.includes('{"op":"transpose","by":1}'),
    `${r.why} / ${r.fix}`);
}

{
  // NEGATIVE CONTROL: the same transform, spelled right, connects.
  const b = desk();
  const r = b.link('here:mk425c:out', 'here:circuit:in', [{ op: 'transpose', by: 1 }]);
  ok('and the same transform spelled correctly is allowed', r.ok, r.why);
}

{
  ok('a class nobody has heard of is named in the refusal',
    why([{ op: 'only', cls: 'banana' }]).includes('banana'),
    why([{ op: 'only', cls: 'banana' }]));
  // `to` is a field name and is not matched on; the refusal must name the missing half.
  // why: lessons/kit-bay.md#test-half-cc
  ok('a half given cc remap says which half is missing',
    why([{ op: 'cc', from: 1 }]).includes('the controller it goes to'),
    why([{ op: 'cc', from: 1 }]));
  ok('a number given as a string is refused rather than coerced',
    why([{ op: 'channel', to: '1' }]).includes('number'),
    why([{ op: 'channel', to: '1' }]));
  ok('and a well formed list says nothing at all',
    checkTransforms([{ op: 'channel', to: 1 }, { op: 'drop', cls: 'sysex' }]) === '',
    'empty string');
}

// ── the text form ──────────────────────────────────────────────────────────

{
  // 15. The text is a PROJECTION. If it can say something the graph cannot,
  //     there are two models and they will disagree.
  const line = 'here:mk425c:out -> here:circuit:in { channel 1, transpose +1, velocity 0.8 }';
  const back = printLink(parseLink(line));
  ok('a link round trips through its own text unchanged', back === line, back);
}

{
  const text = '# a comment\nhere:mk425c:out -> here:circuit:in { channel 1 }\n\nhere:circuit:out -> here:mk425c:in\n';
  const p = parsePatch(text);
  ok('a patch reads back as two links, comments and blanks ignored', p.length === 2, `${p.length} links`);
}

{
  let threw = '';
  try { parseLink('here:a:out ~~> here:b:in'); } catch (e) { threw = e.message; }
  ok('an unreadable line throws with the line in the message', threw.includes('~~>'), threw);
  threw = '';
  try { parseLink('a:b:out -> c:d:in { warp 3 }'); } catch (e) { threw = e.message; }
  ok('and an unknown transform lists the ones there are',
    threw.includes('warp') && threw.includes('transpose'), threw);
}

{
  const b = desk();
  const bad = b.load('here:mk425c:out -> here:circuit:in { channel 1 }\nhere:nope:out -> here:circuit:in');
  ok('loading a patch reports the line it refused and keeps the rest',
    bad.length === 1 && b.links().length === 1, `${bad.length} refused, ${b.links().length} made`);
}

// ── counters ───────────────────────────────────────────────────────────────

{
  // 16. Two counters at two ends: `link.sent` queued here, `port.heard` taken there.
  // why: lessons/kit-bay.md#test-counters
  heard = [];
  const b = desk();
  b.link('here:mk425c:out', 'here:circuit:in', [{ op: 'only', cls: 'note' }]);
  b.send('here:mk425c:out', ev([0x91, 60, 100]));
  b.send('here:mk425c:out', ev([0xb1, 74, 10]));         // dropped by `only`
  const l = b.links()[0];
  ok('the link counts what it sent and what it dropped, separately',
    l.sent === 1 && l.dropped === 1, `sent ${l.sent}, dropped ${l.dropped}`);
  ok('and the destination counts what it actually took',
    b.port('here:circuit:in').heard === 1, `heard ${b.port('here:circuit:in').heard}`);
}

{
  // 17. Stale is a third state and is a warning, never a refusal. "I cannot ssh
  //     to it" is never the same as "it is down".
  let t = 0;
  const b = createBay({ now: () => t });
  b.addPort({ id: 'far:k:out', label: 'far keys', dir: 'out', medium: 'midi', emits: ['note'] });
  b.addPort({ id: 'here:c:in', label: 'Circuit', dir: 'in', medium: 'midi', accepts: ['note'] });
  t = STALE_MS + 1;
  const r = b.link('far:k:out', 'here:c:in', []);
  ok('a stale port warns and still connects', r.ok && !!r.warn, r.warn || 'no warning');
}

// ── classes ────────────────────────────────────────────────────────────────

{
  ok('a note off is a note, not a class of its own',
    classOf(decode([0x80, 60, 0])) === 'note' && classOf(decode([0x90, 60, 0])) === 'note');
  ok('every class a port can name is in CLASSES',
    ['note', 'cc', 'bend', 'touch', 'program', 'clock', 'transport', 'sysex'].every((c) => CLASSES.includes(c)));
  // Negative control: start was once `clock`, so a port taking tempo got started.
  // why: lessons/kit-bay.md#test-transport
  ok('start, stop and continue are transport and the clock tick is clock',
    [0xFA, 0xFB, 0xFC].every((s) => classOf(decode([s])) === 'transport') && classOf(decode([0xF8])) === 'clock');
  ok('a drop of transport keeps the clock running',
    !checkTransforms([{ op: 'drop', cls: 'transport' }]) && !!checkTransforms([{ op: 'drop', cls: 'tempo' }]));
  // Eight media, the first three asserted in order because pages index them by position.
  // why: lessons/kit-bay.md#test-media
  ok('the media are the eight the plan names, the first three where they were',
    MEDIA.join(',') === 'midi,audio,clock,value,video,program,file,state', MEDIA.join(','));
}

// -- range, vrange and fixed, and the two traps in them --
// why: lessons/kit-bay.md#test-ranges
{
  const lower = [{ op: 'range', lo: 0, hi: 59 }, { op: 'channel', to: 1 }];
  const upper = [{ op: 'range', lo: 60, hi: 127 }, { op: 'channel', to: 2 }];
  const note = (d1, d2 = 100) => ({ cls: 'note', ch: 2, d1, d2 });
  ok('a split sends a low note to one channel and not the other',
    apply(lower, note(48))?.ch === 1 && apply(upper, note(48)) === null,
    JSON.stringify(apply(lower, note(48))));
  ok('and a high note the other way, which is the half that makes it a split',
    apply(upper, note(72))?.ch === 2 && apply(lower, note(72)) === null,
    JSON.stringify(apply(upper, note(72))));

  // A note off has the same note number, so the split lets through exactly the offs it needs.
  // why: lessons/kit-bay.md#test-split-off
  ok('a note off follows its own note through the split, so nothing can hang',
    apply(lower, note(48, 0))?.d1 === 48 && apply(upper, note(48, 0)) === null,
    'the off goes where the on went');

  ok('a non-note passes a note range untouched, because a range is about pitch',
    apply(lower, { cls: 'cc', ch: 2, d1: 74, d2: 10 })?.d1 === 74,
    'cc survives');
}
{
  const hard = [{ op: 'vrange', lo: 64, hi: 127 }];
  const n = (d2) => ({ cls: 'note', ch: 1, d1: 60, d2 });
  ok('a velocity layer keeps a hard hit and drops a soft one',
    apply(hard, n(100))?.d2 === 100 && apply(hard, n(20)) === null,
    'layered');
  // A note off carries velocity 0; a naive window would drop every release.
  // why: lessons/kit-bay.md#test-vrange-off
  ok('NEGATIVE CONTROL: a note off passes a velocity window it could never enter',
    apply(hard, n(0))?.d2 === 0,
    'velocity 0 is a release and always passes');
}
{
  const fixed = [{ op: 'fixed', to: 96 }];
  const n = (d2) => ({ cls: 'note', ch: 1, d1: 60, d2 });
  ok('fixed gives every note one velocity, which is what this desk\'s drums do at 96',
    apply(fixed, n(12))?.d2 === 96 && apply(fixed, n(127))?.d2 === 96,
    'both 96');
  ok('NEGATIVE CONTROL: and it leaves a note off alone, or a release becomes a second note on',
    apply(fixed, n(0))?.d2 === 0,
    'the release stays 0');
}
{
  // A note off sent as `0x80 nn 64` keeps its release velocity, so it has to be
  // known by its status, not by `d2 === 0`. Each of these went wrong without it.
  const off = eventOf(decode([0x80, 60, 64]));
  ok('NEGATIVE CONTROL: 0x80 with a release velocity is a note off', isNoteOff(off) && off.d2 === 64,
    JSON.stringify(off));
  ok('NEGATIVE CONTROL: 0x90 with a velocity is not a note off',
    !isNoteOff(eventOf(decode([0x90, 60, 64]))), 'note on');
  ok('NEGATIVE CONTROL: a release passes a soft layer it could never enter',
    isNoteOff(apply([{ op: 'vrange', lo: 70 }], off) ?? {}), 'the hard layer still hears its off');
  ok('NEGATIVE CONTROL: velocity and fixed leave a release velocity alone',
    apply([{ op: 'velocity', scale: 0.5 }], off)?.d2 === 64 && apply([{ op: 'fixed', to: 96 }], off)?.d2 === 64,
    'a 64 release stays 64');
  ok('a transform keeps the note off flag', apply([{ op: 'transpose', by: 1 }], off)?.off === true,
    'transpose spreads the event');
}
{
  // The refusal names the thing (loudness, channel), never its key.
  // why: lessons/kit-bay.md#test-missing
  ok('a missing argument is refused by name',
    /fixed gives every note the same loudness/.test(why([{ op: 'fixed' }]))
    && /channel puts every message on one MIDI channel/.test(why([{ op: 'channel' }]))
    && fix([{ op: 'fixed' }]).includes('96')
    && fix([{ op: 'channel' }]).includes('1 to 16'),
    `${why([{ op: 'fixed' }])} / ${fix([{ op: 'fixed' }])}`);

  /**
   * One bound is a whole instruction; neither is required on its own.
   * why: lessons/kit-bay.md#test-open-range
   */
  ok('a range may be open at either end',
    checkTransforms([{ op: 'range', lo: 60 }]) === ''
    && checkTransforms([{ op: 'range', hi: 7 }]) === ''
    && checkTransforms([{ op: 'vrange', lo: 64 }]) === '',
    'nothing said about any of the three');

  const noteAt = (n) => ({ cls: 'note', ch: 1, d1: n, d2: 64 });
  ok('an open top keeps everything above the bound and an open bottom everything below',
    apply([{ op: 'range', lo: 60 }], noteAt(127)) !== null
    && apply([{ op: 'range', lo: 60 }], noteAt(59)) === null
    && apply([{ op: 'range', hi: 7 }], noteAt(0)) !== null
    && apply([{ op: 'range', hi: 7 }], noteAt(8)) === null);

  // Negative control: a range with no bound passes everything, so it is refused.
  // why: lessons/kit-bay.md#test-no-bound
  ok('NEGATIVE CONTROL: a range with neither bound is refused rather than passing everything',
    /neither the lowest note nor the highest note was given/.test(why([{ op: 'range' }]))
    && /neither the softest hit nor the hardest hit was given/.test(why([{ op: 'vrange' }])),
    why([{ op: 'range' }]));

  // Being given the wrong thing (`to: 7`, measured from a model) is not being given nothing.
  // why: lessons/kit-bay.md#test-non-bound
  ok('NEGATIVE CONTROL: a range given something that is not a bound says so, not "nothing"',
    /nothing it was given is the lowest note or the highest note/.test(why([{ op: 'range', to: 7 }]))
    && why([{ op: 'range', to: 7 }]) !== why([{ op: 'range' }]),
    why([{ op: 'range', to: 7 }]));

  // The text form survives an absent bound: `{ range, hi: 7 }` must not read back as `lo: 7`.
  // why: lessons/kit-bay.md#test-open-roundtrip
  for (const t of [{ op: 'range', hi: 7 }, { op: 'range', lo: 60 },
                   { op: 'range', lo: 0, hi: 7 }, { op: 'vrange', hi: 63 }]) {
    const line = printLink({ from: 'a', to: 'b', transforms: [t] });
    const back = parseLink(line).transforms[0];
    ok(`a one-sided ${t.op} round trips through the text form`,
      JSON.stringify(back) === JSON.stringify(t), `${line} came back as ${JSON.stringify(back)}`);
  }

  /**
   * Two ranges open at the same end are one range written wrong: one note of eight passes.
   * The refusal carries the correction as JSON.
   * why: lessons/kit-bay.md#test-two-ranges
   */
  const two = checkTransforms([{ op: 'range', hi: 0 }, { op: 'range', hi: 7 }]);
  ok('two ranges open at the same end are refused, and the solution carries the right patch',
    /each name only the highest note/.test(two.why)
    && two.fix.includes('{"op":"range","lo":0,"hi":7}'),
    `${two.why} / ${two.fix}`);

  /**
   * Negative control: opposite open ends are a window, and a split's two links are never one list.
   * why: lessons/kit-bay.md#test-window
   */
  ok('NEGATIVE CONTROL: two ranges closing opposite ends are a window and are allowed',
    checkTransforms([{ op: 'range', lo: 60 }, { op: 'range', hi: 72 }]) === ''
    && checkTransforms([{ op: 'range', lo: 0, hi: 59 }]) === ''
    && checkTransforms([{ op: 'range', lo: 60, hi: 127 }]) === '',
    'nothing said about a window, or about either closed range');

  ok('a window written as two one-sided ranges keeps only what is inside it',
    apply([{ op: 'range', lo: 60 }, { op: 'range', hi: 72 }], noteAt(64)) !== null
    && apply([{ op: 'range', lo: 60 }, { op: 'range', hi: 72 }], noteAt(59)) === null
    && apply([{ op: 'range', lo: 60 }, { op: 'range', hi: 72 }], noteAt(73)) === null);

  /* A range that can never pass anything is a silent link, not a tight filter. */
  ok('a low bound above the high one is refused rather than passing nothing',
    /nothing can ever pass/.test(why([{ op: 'range', lo: 60, hi: 7 }]))
    // The swapped object is offered, never applied.
    // why: lessons/kit-bay.md#test-lohi-offer
    && fix([{ op: 'range', lo: 60, hi: 7 }]).includes('{"op":"range","lo":7,"hi":60}'),
    `${why([{ op: 'range', lo: 60, hi: 7 }])} / ${fix([{ op: 'range', lo: 60, hi: 7 }])}`);

  /* An optional argument that is present is still typed, which it was not while
     the type check ran over the REQUIRED list only. */
  ok('an optional bound that is present is still checked for being a number',
    /the highest note came as "47" rather than as a number/
      .test(why([{ op: 'range', lo: 36, hi: '47' }])),
    why([{ op: 'range', lo: 36, hi: '47' }]));
}
{
  /**
   * Every op needs a `help` sentence; wish-test.mjs generates the model's table from `OP_HELP`.
   * why: lessons/kit-bay.md#test-help
   */
  const mute = OP_HELP.filter((o) => typeof o.help !== 'string' || o.help.trim().length < 12);
  ok('every transform carries a sentence a reader outside this file can use',
    mute.length === 0 && OP_HELP.length === OP_NAMES.length,
    `${mute.map((o) => o.op).join(', ') || 'none'} silent, ${OP_HELP.length} of ${OP_NAMES.length}`);

  /* The signature is DERIVED from the argument list `checkTransforms` enforces,
     so the two cannot part company. `cls` is the one argument that is not a
     number and `scale` is the one that is not an integer. */
  const sig = Object.fromEntries(OP_HELP.map((o) => [o.op, o.sig]));
  ok('a signature names the arguments its own validator requires',
    sig.only === 'only cls=C' && sig.range === 'range lo=N hi=N'
    && sig.velocity === 'velocity scale=F' && sig.cc === 'cc from=N to=N ch=N',
    JSON.stringify(sig));

  /**
   * Every op's example must pass the validator: a model copies examples.
   * why: lessons/kit-bay.md#test-examples
   */
  const refused = OP_HELP
    .map((o) => [o.op, checkTransforms([{ op: o.op, ...o.eg }])])
    .filter(([, bad]) => bad !== '');
  ok('every transform example passes the validator it demonstrates',
    refused.length === 0, refused.map(([op, bad]) => `${op}: ${bad.why}`).join(' | '));

  /* And an example has to USE the op it names: `{"op":"range"}` with no
     arguments passes nothing and would still be a line in the table. */
  const thin = OP_HELP.filter((o) => o.need.some((a) => o.eg[a] === undefined));
  ok('NEGATIVE CONTROL: no example leaves out an argument its op requires',
    thin.length === 0, thin.map((o) => o.op).join(', '));

  /**
   * Negative control: the refusal names what is missing without naming a key.
   * why: lessons/kit-bay.md#test-only-channel
   */
  ok('NEGATIVE CONTROL: `only` given a channel number names what is missing without naming a key',
    /nothing it was given is a kind of message/.test(why([{ op: 'only', to: 1 }]))
    && fix([{ op: 'only', to: 1 }]) === `Name one of ${CLASSES.join(', ')}.`
    && sig.only.includes('cls='),
    `${why([{ op: 'only', to: 1 }])} / ${fix([{ op: 'only', to: 1 }])}`);
}

/**
 * Refusals are read by a person; these four checks run over every refusal the module makes.
 * why: lessons/kit-bay.md#test-readable
 */
{
  /* Every shape of bad patch there is, so the sweeps below are about the
     module rather than about whichever case somebody remembered. */
  const BAD = [
    [{ op: 'only', to: 1 }], [{ op: 'only' }], [{ op: 'only', cls: 'banana' }],
    [{ op: 'transpose', to: 1 }], [{ op: 'cc', to: 80 }], [{ op: 'cc', from: 1 }],
    [{ op: 'fixed' }], [{ op: 'channel', to: '1' }], [{ op: 'channel' }],
    [{ op: 'range' }], [{ op: 'range', to: 7 }], [{ op: 'range', lo: 60, hi: 7 }],
    [{ op: 'range', lo: 36, hi: '47' }], [{ op: 'vrange' }],
    [{ op: 'range', hi: 0 }, { op: 'range', hi: 7 }],
    [{ op: 'banana' }], [null], [{ op: 'velocity' }], [{ op: 'drop', to: 'sysex' }],
    [{ op: 'patch' }], [{ op: 'patch', name: 7 }], [{ op: 'patch', to: 'Rhodes' }],
    [{ op: 'patch', name: 'Piano' }, { op: 'patch', name: 'Rhodes' }],
  ];
  const said = BAD.map((t) => ({ t, ...checkTransforms(t) }));

  ok('every refusal answers in two sentences, a problem and something to do about it',
    said.every((s) => s.why && s.fix && /\.$/.test(s.why.trim()) && /\.$/.test(s.fix.trim())),
    `${said.filter((s) => s.why && s.fix).length} of ${said.length} carry both`);

  /**
   * No quoted field name in either sentence. JSON a fix offers is cut out first, and only the
   * quoted form is hunted, since `from` and `to` are also English.
   * why: lessons/kit-bay.md#test-no-keys
   */
  const KEYS = [...new Set(OP_HELP.flatMap((o) => o.args))];
  const prose = (s) => `${s.why} ${s.fix}`.replace(/\{[^}]*\}/g, ' ');
  const leaks = said.filter((s) => KEYS.some((k) => prose(s).includes(`"${k}"`)));
  ok('NEGATIVE CONTROL: no refusal prints a field name as if it were a word',
    leaks.length === 0,
    leaks.length ? leaks.map((s) => prose(s)).join(' | ') : `${said.length} swept, ${KEYS.length} keys`);

  // The sweep is proved by breaking it: the reported sentence must be caught.
  // why: lessons/kit-bay.md#test-sweep-control
  const OLD = { why: 'only takes "cls" and was given "to".', fix: 'Name one of note.' };
  ok('NEGATIVE CONTROL: and the sweep catches the sentence that was reported',
    KEYS.some((k) => prose(OLD).includes(`"${k}"`)), prose(OLD));

  // `why` and `fix` may not restate each other.
  // why: lessons/kit-bay.md#test-echo
  const echo = said.filter((s) => s.why.toLowerCase().includes(s.fix.toLowerCase())
    || s.fix.toLowerCase().includes(s.why.toLowerCase()));
  ok('NEGATIVE CONTROL: no solution is its own problem said again',
    echo.length === 0, echo.map((s) => s.why).join(' | ') || `${said.length} pairs, none an echo`);

  /**
   * Swap, omission and empty object stay tellable apart.
   * why: lessons/kit-bay.md#test-three
   */
  const swap = why([{ op: 'cc', by: 1 }]);
  const gap = why([{ op: 'cc', to: 80 }]);
  const bare = why([{ op: 'cc' }]);
  ok('a swapped argument, an omission and an empty object are three different sentences',
    swap !== gap && gap !== bare && swap !== bare
    && /nothing it was given is/.test(swap)
    && /is missing/.test(gap)
    && /given nothing at all/.test(bare),
    [swap, gap, bare].join(' | '));

  /**
   * The vocabulary is graded whole: no op falls back to the placeholder.
   * why: lessons/kit-bay.md#test-vocab
   */
  const thin = OP_NAMES.filter((op) => {
    const s = OP_SAYS[op];
    if (!s || !s.does) return true;
    return OP_HELP.find((o) => o.op === op).args
      .some((a) => !s.part?.[a] || !s.ask?.[a]);
  });
  ok('every operator and every argument of it has words a visitor can read',
    thin.length === 0 && Object.keys(OP_SAYS).length === OP_NAMES.length,
    `${thin.join(', ') || 'none'} silent, ${Object.keys(OP_SAYS).length} of ${OP_NAMES.length}`);
}

// -- the universal media --
// Arithmetic about a description: green says the bay names the right session, not that it works.
// why: lessons/kit-bay.md#test-universal

const SHAPE = { rate: 48000, channels: 2, frameMs: 20 };
/** A small world with every distance in it, and the facts that decide them. */
function world() {
  const b = createBay();
  b.addNode({ id: 'pi-1:circuit', kind: 'device', label: 'Circuit', place: 'studio-1', net: 'studio-lan' });
  b.addNode({ id: 'pi-1:pi', kind: 'engine', label: 'board', place: 'studio-1', net: 'studio-lan' });
  b.addNode({ id: 'm1:page', kind: 'screen', label: 'the M1', place: 'm1', net: 'studio-lan' });
  b.addNode({ id: 'home:page', kind: 'screen', label: 'a page at home', place: 'home', net: 'home-lan' });
  b.addNode({ id: 'away:page', kind: 'screen', label: 'a page away', place: 'away', net: 'cafe' });
  b.addNode({ id: 'err:vikerraadio', kind: 'external', label: 'Vikerraadio', place: 'err' });
  b.addPort({ id: 'pi-1:circuit:audio-out', label: 'Circuit audio', dir: 'out', medium: 'audio', shape: SHAPE });
  b.addPort({ id: 'err:vikerraadio:audio', label: 'Vikerraadio audio', dir: 'out', medium: 'audio', shape: SHAPE });
  for (const [id, label] of [['pi-1:pi:audio-out', 'board in'], ['m1:page:audio', 'M1 audio'],
                             ['home:page:audio', 'home audio'], ['away:page:audio', 'away audio']]) {
    b.addPort({ id, label, dir: 'in', medium: 'audio', shape: SHAPE });
  }
  return b;
}

{
  // A. Every medium a port can declare, and one it cannot.
  const b = createBay();
  const took = MEDIA.filter((m, i) => {
    try { b.addPort({ id: `here:m${i}:out`, label: m, dir: 'out', medium: m }); return true; }
    catch { return false; }
  });
  ok('every one of the eight media is accepted by addPort', took.length === 8, took.join(', '));
  /* NEGATIVE CONTROL: or `accepted` would be true of a bay that checks nothing. */
  let threw = '';
  try { b.addPort({ id: 'here:smell:out', label: 'smell', dir: 'out', medium: 'smell' }); }
  catch (e) { threw = e.message; }
  ok('NEGATIVE CONTROL: a medium nobody declared is refused and the refusal lists the real ones',
    threw.includes('smell') && threw.includes('program') && threw.includes('state'), threw);
  ok('the heavy media are audio, video, file and state, and program is light',
    HEAVY.join(',') === 'audio,video,file,state' && !HEAVY.includes('program'), HEAVY.join(','));
}

{
  // B. The chooser is plan §5's table, cell by cell.
  const cells = [];
  for (const m of HEAVY) for (const w of WHERE) {
    const c = chooseTransport(m, w);
    cells.push(c && c.where === w && c.transport === TRANSPORTS[m][w].transport
      && typeof c.says === 'string' && c.says.length > 0);
  }
  ok('every heavy medium has a transport at every distance, from the table',
    cells.length === 16 && cells.every(Boolean), `${cells.filter(Boolean).length} of ${cells.length}`);
  ok('the cells that carry a number carry the plan\'s number',
    chooseTransport('audio', 'network').says === 'board round trip 4 ms'
    && chooseTransport('audio', 'internet-one').says.includes('p50 36 ms')
    && chooseTransport('audio', 'internet-one').says.includes('cap 1000 msg/s, 2000 burst')
    && chooseTransport('audio', 'internet-one').transport === 'relay',
    `${chooseTransport('audio', 'network').says} | ${chooseTransport('audio', 'internet-one').says}`);
  ok('and the cell the plan says is not measured says exactly "to measure"',
    chooseTransport('video', 'network').says === 'to measure', chooseTransport('video', 'network').says);
  ok('a second receiver over the internet is the many column',
    chooseTransport('audio', 'internet-one', 2).where === 'internet-many'
    && chooseTransport('video', 'internet-one', 2).transport === 'llhls');
  /* NEGATIVE CONTROL: or `null for light` would pass on a chooser that always
     answers null. Every light medium, by name. */
  const light = MEDIA.filter((m) => !HEAVY.includes(m));
  ok('NEGATIVE CONTROL: a light medium has no transport, because its link carries the bytes',
    light.join(',') === 'midi,clock,value,program'
    && light.every((m) => chooseTransport(m, 'internet-one') === null),
    light.map((m) => `${m}: ${JSON.stringify(chooseTransport(m, 'internet-one'))}`).join(', '));
  let t1 = '', t2 = '';
  try { chooseTransport('smell', 'machine'); } catch (e) { t1 = e.message; }
  try { chooseTransport('audio', 'moon'); } catch (e) { t2 = e.message; }
  ok('NEGATIVE CONTROL: an unknown medium or distance throws rather than reading as light',
    t1.includes('smell') && t2.includes('moon'), `${t1} | ${t2}`);

  /**
   * No cell says a number the plan does not: every number is looked for with its unit
   * (bare digits missed `12 ms` against `12 byte header`).
   * why: lessons/kit-bay.md#test-says
   */
  const { readFileSync } = await import('node:fs');
  const plan = readFileSync(new URL('../../plans/plan-universal-routing.md', import.meta.url), 'utf8')
    .replace(/\*\*/g, '');
  const NUM = /\d+(?:\.\d+)?(?: ?(?:ms|msg\/s|s|kbit\/s|KB\/s|%))?\b/g;
  const invented = [...Object.values(TRANSPORTS), READS].flatMap((row) => Object.values(row))
    .flatMap((c) => (c.says.match(NUM) || []).filter((n) => !plan.includes(n)).map((n) => `${n} in "${c.says}"`));
  ok('NEGATIVE CONTROL: no cell quotes a number the plan does not',
    invented.length === 0, invented.join(' | ') || 'every number found in the plan');
}

{
  // C. Where the two ends are, which picks the column.
  const b = world();
  const mach = b.link('pi-1:circuit:audio-out', 'pi-1:pi:audio-out');
  const net = b.link('pi-1:circuit:audio-out', 'm1:page:audio');
  const one = b.link('pi-1:circuit:audio-out', 'home:page:audio');
  const many = b.link('pi-1:circuit:audio-out', 'away:page:audio');
  ok('one machine is machine, and the transport is the machine\'s',
    mach.session?.where === 'machine' && mach.session.transport === 'webaudio', JSON.stringify(mach.session));
  ok('two machines on one network is network, a data channel at 4 ms',
    net.session?.where === 'network' && net.session.transport === 'datachannel', JSON.stringify(net.session));
  ok('the first receiver across the internet is internet-one, on the relay',
    one.session?.where === 'internet-one' && one.session.transport === 'relay', JSON.stringify(one.session));
  ok('and the second receiver of the same port is internet-many',
    many.session?.where === 'internet-many' && many.session.transport === 'moq', JSON.stringify(many.session));
  /* NEGATIVE CONTROL: the two local links before `one` did not make it many,
     because the column counts receivers across the internet. */
  ok('NEGATIVE CONTROL: links on the same machine and network do not count towards many',
    one.session.where === 'internet-one', `${b.links().length - 1} links existed before the fourth`);

  /* With no nodes at all, the place is the id's first segment and the network
     is unknown, and unknown is never read as the same network. */
  const bare = createBay();
  bare.addPort({ id: 'x:a:video', label: 'a', dir: 'out', medium: 'video', shape: { fps: 30 } });
  bare.addPort({ id: 'x:b:video', label: 'b', dir: 'in', medium: 'video', shape: { fps: 30 } });
  bare.addPort({ id: 'y:c:video', label: 'c', dir: 'in', medium: 'video', shape: { fps: 30 } });
  const near = bare.link('x:a:video', 'x:b:video');
  const far = bare.link('x:a:video', 'y:c:video');
  ok('NEGATIVE CONTROL: a port with no node takes its place from its id, and an unknown network is the internet',
    near.session?.where === 'machine' && far.session?.where === 'internet-one',
    `${near.session?.where}, ${far.session?.where}`);
}

{
  // D. The address is derived from the link, the way the Pi derives rooms.
  const b = world();
  const r = b.link('pi-1:circuit:audio-out', 'home:page:audio');
  ok('a session\'s address is the source\'s place, node and port',
    r.session?.address === 'studio-1-pi-1-circuit-audio-out', r.session?.address);
  ok('and its shape is the source port\'s shape',
    JSON.stringify(r.session.shape) === JSON.stringify(SHAPE), JSON.stringify(r.session.shape));
  b.addNode({ id: 'rig:gpu', kind: 'engine', label: 'GPU', place: 'studio-1', net: 'studio-lan' });
  b.addPort({ id: 'rig:gpu:video', label: 'GPU video', dir: 'out', medium: 'video', shape: { w: 1280, h: 720 } });
  b.addPort({ id: 'home:page:video', label: 'home video', dir: 'in', medium: 'video', shape: { w: 1280, h: 720 } });
  const g = b.link('rig:gpu:video', 'home:page:video');
  /* NEGATIVE CONTROL: the PLACE is the node's, not the id's first segment, or
     the address above would pass on a bay that only splits strings. */
  ok('NEGATIVE CONTROL: the place in an address is the node\'s place, and the site follows it when the two differ',
    g.session?.address === 'studio-1-rig-gpu-video', g.session?.address);
  const again = b.link('pi-1:circuit:audio-out', 'away:page:audio');
  ok('two links out of one port share one address, so the second joins the first',
    again.session?.address === r.session.address, `${again.session?.address}`);
}

{
  // E. Consent on the source, plan §6, and the reason is ERR's listener statistics.
  const b = world();
  const no = b.link('err:vikerraadio:audio', 'home:page:audio');
  ok('a link out of an external node with no consent is refused, naming whose server it is',
    !no.ok && no.why.includes('Vikerraadio') && /somebody else's server/.test(no.why)
    && /person who is going to listen/.test(no.fix), `${no.why} / ${no.fix}`);
  const loose = b.link('err:vikerraadio:audio', 'home:page:audio', [], { consent: 'yes' });
  ok('NEGATIVE CONTROL: a truthy string is not consent, only true is',
    !loose.ok, loose.why);
  const v = b.validate('err:vikerraadio:audio', 'home:page:audio', [], { consent: true });
  const yes = b.link('err:vikerraadio:audio', 'home:page:audio', [], { consent: true });
  ok('NEGATIVE CONTROL: with a person\'s consent the same link is made, with its session',
    yes.ok && yes.session?.address === 'err-vikerraadio-audio' && v.ok && v.session?.address === yes.session.address,
    yes.why || JSON.stringify(yes.session));
  ok('and the consent is not stored on the link',
    !('consent' in b.links().find((l) => l.id === yes.id)), 'no consent field');
  ok('a node of another kind needs no consent',
    b.link('pi-1:circuit:audio-out', 'home:page:audio').ok);
  ok('NEGATIVE CONTROL: an external node cannot be declared out of needing consent',
    b.addNode({ id: 'icecast:mount', kind: 'external', consent: false }).consent === true);

  /* A text patch never carries consent, so a load of the same line is refused
     unless the person loading it says so. */
  const fresh = world();
  const bad = fresh.load('err:vikerraadio:audio -> home:page:audio');
  const fresh2 = world();
  const good = fresh2.load('err:vikerraadio:audio -> home:page:audio', { consent: true });
  ok('a text patch out of an external node is refused on load, and allowed when a person loads it',
    bad.length === 1 && /somebody else's server/.test(bad[0].why) && good.length === 0,
    `${bad.length} refused, then ${good.length}`);
}

{
  // F. Transforms are MIDI operations.
  const b = world();
  const r = b.link('pi-1:circuit:audio-out', 'home:page:audio', [{ op: 'transpose', by: 1 }]);
  ok('transforms on an audio link are refused, naming the medium and the transform',
    !r.ok && r.why.includes('audio') && r.why.includes('transpose') && /MIDI/.test(r.why), `${r.why} / ${r.fix}`);
  b.addPort({ id: 'home:page:tilt', label: 'tilt', dir: 'out', medium: 'value', shape: { range: [0, 1] } });
  b.addPort({ id: 'pi-1:pi:cutoff', label: 'cutoff', dir: 'in', medium: 'value', shape: { range: [0, 1] } });
  const v = b.link('home:page:tilt', 'pi-1:pi:cutoff', [{ op: 'channel', to: 1 }]);
  ok('and on a value link too', !v.ok && v.why.includes('value'), v.why);
  /* NEGATIVE CONTROL: the same two links with no transforms are made, or the
     refusals above would be a bay that refuses those ports. The value link also
     proves a range is compared by value, since `[0, 1] !== [0, 1]`. */
  ok('NEGATIVE CONTROL: the same audio and value links with no transforms are made',
    b.link('pi-1:circuit:audio-out', 'home:page:audio').ok && b.link('home:page:tilt', 'pi-1:pi:cutoff').ok);
}

{
  // G. A light link carries its bytes, so it has no session.
  const b = world();
  b.addPort({ id: 'home:keys:out', label: 'keys', dir: 'out', medium: 'midi', emits: ['note'] });
  b.addPort({ id: 'pi-1:circuit:midi-in', label: 'Circuit', dir: 'in', medium: 'midi', accepts: ['note'] });
  b.addPort({ id: 'm1:mirror:program', label: 'mirror', dir: 'out', medium: 'program', shape: { language: 'glsl' } });
  b.addPort({ id: 'pi-1:pi:program-in', label: 'GPU', dir: 'in', medium: 'program', shape: { language: 'glsl' } });
  const m = b.link('home:keys:out', 'pi-1:circuit:midi-in');
  const p = b.link('m1:mirror:program', 'pi-1:pi:program-in');
  ok('a MIDI link across the internet has no session, on the answer or the stored link',
    m.ok && m.session === null && b.links().find((l) => l.id === m.id).session === null);
  ok('and neither does a program, which is one message',
    p.ok && p.session === null, JSON.stringify(p.session));
}

{
  // H. The text form of a heavy link is the same line, and the session comes back.
  const b = world();
  const r = b.link('pi-1:circuit:audio-out', 'home:page:audio');
  const line = b.text();
  const back = world();
  const refused = back.load(line);
  ok('a heavy link prints as a plain from -> to line with nothing about its session in it',
    line === 'pi-1:circuit:audio-out -> home:page:audio', line);
  ok('and read back into the same world it derives the same session',
    refused.length === 0 && JSON.stringify(back.links()[0].session) === JSON.stringify(r.session),
    JSON.stringify(back.links()[0]?.session));
  ok('and prints the same line again', back.text() === line, back.text());
}

{
  // I. A loop is an echo of ONE medium. Value out and audio back is a patch.
  const b = world();
  b.addPort({ id: 'home:page:tilt', label: 'tilt', dir: 'out', medium: 'value', shape: {} });
  b.addPort({ id: 'pi-1:pi:cutoff', label: 'cutoff', dir: 'in', medium: 'value', shape: {} });
  b.addPort({ id: 'pi-1:pi:audio-out', label: 'board out', dir: 'out', medium: 'audio', shape: SHAPE });
  b.link('home:page:tilt', 'pi-1:pi:cutoff');
  const r = b.link('pi-1:pi:audio-out', 'home:page:audio');
  ok('a phone that sends a value to an engine may hear its audio back', r.ok, r.why);
  /* NEGATIVE CONTROL: a loop in one medium is still a loop. */
  b.addPort({ id: 'pi-1:pi:level', label: 'level', dir: 'out', medium: 'value', shape: {} });
  b.addPort({ id: 'home:page:knob', label: 'knob', dir: 'in', medium: 'value', shape: {} });
  const loop = b.link('pi-1:pi:level', 'home:page:knob');
  ok('NEGATIVE CONTROL: a value loop between the same two nodes is still refused',
    !loop.ok && /loop/.test(loop.why), loop.why);
}

{
  // J. Nodes are optional, listed, and refuse what they cannot be.
  const b = world();
  ok('nodes are listed and found by id',
    b.nodes().length === 6 && b.node('pi-1:circuit')?.kind === 'device' && b.node('nope:x') === undefined,
    `${b.nodes().length} nodes`);
  ok('every kind in the plan is a kind here',
    NODE_KINDS.join(',') === 'device,engine,endpoint,store,external,screen,person');
  let k = '', i = '';
  try { b.addNode({ id: 'here:toaster', kind: 'toaster' }); } catch (e) { k = e.message; }
  try { b.addNode({ id: 'here:toaster:port', kind: 'device' }); } catch (e) { i = e.message; }
  ok('NEGATIVE CONTROL: an unknown kind and a three part id are both refused',
    k.includes('toaster') && k.includes('external') && i.includes('site:node'), `${k} | ${i}`);
}

{
  /* K. The new refusals are held to the old standard: two sentences, each
     ending, neither an echo of the other. */
  const b = world();
  b.addPort({ id: 'here:k:out', label: 'keys', dir: 'out', medium: 'midi', emits: ['note'] });
  const said = [
    b.link('err:vikerraadio:audio', 'home:page:audio'),
    b.link('pi-1:circuit:audio-out', 'home:page:audio', [{ op: 'channel', to: 1 }]),
  ];
  ok('NEGATIVE CONTROL: the consent and transform refusals are a problem and something to do, not one said twice',
    said.every((s) => !s.ok && /\.$/.test(s.why) && /\.$/.test(s.fix)
      && !s.why.toLowerCase().includes(s.fix.toLowerCase()) && !s.fix.toLowerCase().includes(s.why.toLowerCase())),
    said.map((s) => `${s.why} / ${s.fix}`).join(' | '));
}

{
  /* L. A store at either end rides the `file` row, plan §10 item 5. A sound
     into a store is a recording uploaded through ingest, at the store's
     address, and it stays one writer however many already listen. */
  const b = world();
  b.addNode({ id: 'r2:recordings', kind: 'store', label: 'recordings', place: 'cloudflare', net: 'cloudflare' });
  b.addPort({ id: 'r2:recordings:in', label: 'recordings', dir: 'in', medium: 'audio', address: 'ingest.positron.studio' });
  b.addPort({ id: 'r2:recordings:out', label: 'recordings', dir: 'out', medium: 'audio', address: 'archive.positron.studio' });
  b.link('pi-1:circuit:audio-out', 'home:page:audio');
  b.link('pi-1:circuit:audio-out', 'away:page:audio');
  const rec = b.link('pi-1:circuit:audio-out', 'r2:recordings:in');
  ok('a sound into a store is a recording through ingest, one writer, at the store’s address',
    rec.ok && rec.session?.transport === 'ingest' && rec.session.where === 'internet-one'
      && rec.session.address === 'ingest.positron.studio', JSON.stringify(rec.session || rec.why));
  const play = b.link('r2:recordings:out', 'home:page:audio');
  // One reader of one stored object is one https read, not ingest.
  // why: lessons/kit-bay.md#test-store-read
  ok('and a sound out of a store to one reader is one https read of the object', play.ok && play.session?.transport === 'https'
    && play.session.address === 'archive.positron.studio', JSON.stringify(play.session || play.why));
  /* NEGATIVE CONTROL: the same sound to a page that is not a store keeps the
     audio row, or the store rule would be true of every link. */
  const page = b.link('pi-1:circuit:audio-out', 'm1:page:audio');
  ok('NEGATIVE CONTROL: a sound to a page that is not a store keeps the audio row',
    page.ok && page.session?.transport === 'datachannel', JSON.stringify(page.session || page.why));
}

// -- relay cap, stale window, read row, port transports, `via`, held inputs --
// Each refusal sits beside the same case allowed, which proves the refusal is the rule.
// why: lessons/kit-bay.md#test-step0

{
  /* M. The relay figure is the worker's, read from the worker's source, so
     the two cannot drift apart again without this going red. */
  const { readFileSync } = await import('node:fs');
  const relay = readFileSync(new URL('../../workers/relay/src/index.js', import.meta.url), 'utf8');
  const num = (k) => Number((new RegExp(`const ${k} = (\\d+)`).exec(relay) || [])[1]);
  ok('the relay figure in the table is the worker\'s own MSG_PER_SEC and MSG_BURST',
    RELAY.msgPerSec === num('MSG_PER_SEC') && RELAY.burst === num('MSG_BURST'),
    `bay ${RELAY.msgPerSec}/${RELAY.burst}, worker ${num('MSG_PER_SEC')}/${num('MSG_BURST')}`);
  /* NEGATIVE CONTROL: the old figure is nowhere in either table. */
  const stale = [...Object.values(TRANSPORTS), READS].flatMap((r) => Object.values(r)).filter((c) => /\b60 msg\/s|stay at 50/.test(c.says));
  ok('NEGATIVE CONTROL: no cell still says the old 60 msg/s', stale.length === 0, stale.map((c) => c.says).join(' | ') || 'none');
  ok('the bay and the registry go stale at the same moment', STALE_MS === REGISTRY_STALE_MS && STALE_MS === 15_000,
    `bay ${STALE_MS}, registry ${REGISTRY_STALE_MS}`);
}

{
  /* N. Reading a store: one reader is https, two over the internet are r2-hls,
     and a recording into the store is still ingest. */
  const b = world();
  b.addNode({ id: 'r2:recordings', kind: 'store', label: 'recordings', place: 'cloudflare', net: 'cloudflare' });
  b.addPort({ id: 'r2:recordings:out', label: 'recordings', dir: 'out', medium: 'audio', address: 'archive.positron.studio' });
  b.addPort({ id: 'r2:recordings:in', label: 'recordings', dir: 'in', medium: 'audio', address: 'ingest.positron.studio' });
  const one = b.link('r2:recordings:out', 'home:page:audio');
  const two = b.link('r2:recordings:out', 'away:page:audio');
  ok('one reader of a stored object over the internet is an https read', one.session?.transport === 'https'
    && one.session.where === 'internet-one', JSON.stringify(one.session || one.why));
  ok('and a second reader of the same object is R2 plus HLS', two.session?.transport === 'r2-hls'
    && two.session.where === 'internet-many', JSON.stringify(two.session || two.why));
  /* NEGATIVE CONTROL: the write path did not move with the read. */
  const rec = b.link('pi-1:circuit:audio-out', 'r2:recordings:in');
  ok('NEGATIVE CONTROL: a sound into the store is still an upload through ingest', rec.session?.transport === 'ingest',
    JSON.stringify(rec.session || rec.why));
  /* A recording is not a receiver: a listener after it is the first one. */
  const after = b.link('pi-1:circuit:audio-out', 'home:page:audio');
  ok('a link into a store does not count as a receiver of the sound', after.session?.where === 'internet-one'
    && after.session.transport === 'relay', JSON.stringify(after.session || after.why));
  ok('every transport the tables name is one via may ask for, https included',
    ['https', 'moq', 'relay-h264', 'whep'].every((x) => TRANSPORT_NAMES.includes(x))
    && MACHINE_ONLY.every((x) => TRANSPORT_NAMES.includes(x)), TRANSPORT_NAMES.join(', '));
}

/** The board's GPU and a WHIP-only input, the two shapes plan-stage-patchbay F1 named. */
function restricted() {
  const b = world();
  b.addNode({ id: 'pi-1:gpu', kind: 'engine', label: 'GPU', place: 'studio-1', net: 'studio-lan' });
  b.addNode({ id: 'cf:stage', kind: 'endpoint', label: 'stage input', place: 'cloudflare', net: 'cloudflare' });
  const V = { codec: 'h264' };
  b.addPort({ id: 'pi-1:gpu:video-out', label: 'GPU', dir: 'out', medium: 'video', shape: V, transports: ['relay-h264'] });
  b.addPort({ id: 'cf:stage:video', label: 'stage input', dir: 'out', medium: 'video', shape: V, transports: ['whep'] });
  b.addPort({ id: 'cf:open:video', label: 'open input', dir: 'out', medium: 'video', shape: V });
  for (const [id, label] of [['home:page:video', 'home screen'], ['away:page:video', 'away screen'], ['m1:page:video', 'M1 screen']]) {
    b.addPort({ id, label, dir: 'in', medium: 'video', shape: V });
  }
  return b;
}

{
  /* O. A port's own transports. */
  const b = restricted();
  const gpu = b.link('pi-1:gpu:video-out', 'home:page:video');
  ok('a port that only travels by relay-h264 gets the cell\'s second choice, not WHEP', gpu.ok
    && gpu.session?.transport === 'relay-h264' && gpu.session.where === 'internet-one', JSON.stringify(gpu.session || gpu.why));
  const first = b.link('cf:stage:video', 'home:page:video');
  const second = b.validate('cf:stage:video', 'away:page:video');
  ok('a WHIP-only input takes its first receiver over WHEP', first.ok && first.session?.transport === 'whep',
    JSON.stringify(first.session || first.why));
  ok('and its second is refused in words naming both lists, not handed LL-HLS', !second.ok
    && /only travels by whep/.test(second.why) && /llhls/.test(second.why) && /via/.test(second.fix || ''),
    `${second.why} / ${second.fix}`);
  /* NEGATIVE CONTROL: the same second receiver of a port with no restriction is LL-HLS. */
  b.link('cf:open:video', 'home:page:video');
  const open2 = b.link('cf:open:video', 'away:page:video');
  ok('NEGATIVE CONTROL: the same second receiver without a restriction is told LL-HLS',
    open2.ok && open2.session?.transport === 'llhls', JSON.stringify(open2.session || open2.why));
  /* A restriction on the source does not refuse the store's own leg. */
  const s = restricted();
  s.addNode({ id: 'r2:clips', kind: 'store', label: 'clips', place: 'cloudflare', net: 'cloudflare' });
  s.addPort({ id: 'r2:clips:in', label: 'clips', dir: 'in', medium: 'video', shape: V0(), address: 'ingest.positron.studio' });
  const rec = s.link('pi-1:gpu:video-out', 'r2:clips:in');
  ok('a recording of a restricted source is the store\'s leg and is not refused by the source\'s list',
    rec.ok && rec.session?.transport === 'ingest', JSON.stringify(rec.session || rec.why));
  let threw = '';
  try { createBay().addPort({ id: 'x:y:video', label: 'y', dir: 'out', medium: 'video', transports: ['carrier-pigeon'] }); }
  catch (e) { threw = e.message; }
  ok('NEGATIVE CONTROL: a port naming a transport nobody has throws where it is declared, listing the real ones',
    threw.includes('carrier-pigeon') && threw.includes('relay-h264'), threw);
}
function V0() { return { codec: 'h264' }; }

{
  /* P. A link's own via. */
  const b = restricted();
  const moq = b.link('cf:open:video', 'home:page:video', [], { via: 'moq' });
  ok('a link may ask for moq by name, and its session says it was asked for, quoting no number',
    moq.ok && moq.session?.transport === 'moq' && moq.session.via === 'moq'
      && /asked for on this link/.test(moq.session.says) && !/\d/.test(moq.session.says), JSON.stringify(moq.session || moq.why));
  const line = printLink(b.links().find((l) => l.id === moq.id));
  const back = parseLink(line);
  ok('and the line carries via, and reads back with it', line.endsWith(' via moq') && back.via === 'moq'
    && back.from === 'cf:open:video' && back.transforms.length === 0, line);
  const re = restricted();
  ok('and loading that line into a fresh bay makes the same session', re.load(line).length === 0
    && re.links()[0]?.session?.transport === 'moq', JSON.stringify(re.links()[0]?.session));
  const relay = b.link('pi-1:gpu:video-out', 'm1:page:video', [], { via: 'relay-h264' });
  ok('a via the port allows, at a distance whose cell lists it, keeps the cell\'s words', relay.ok
    && relay.session?.transport === 'relay-h264', JSON.stringify(relay.session || relay.why));
  const bad = b.validate('cf:open:video', 'away:page:video', [], { via: 'carrier-pigeon' });
  ok('NEGATIVE CONTROL: a via nobody has is refused and the refusal lists the real ones', !bad.ok
    && /carrier-pigeon/.test(bad.why) && /moq/.test(bad.fix), `${bad.why} / ${bad.fix}`);
  const local = b.validate('cf:open:video', 'away:page:video', [], { via: 'page' });
  ok('NEGATIVE CONTROL: a one machine transport across a wire is refused', !local.ok && /never leaves one machine/.test(local.why),
    local.why);
  const barred = b.validate('cf:stage:video', 'm1:page:video', [], { via: 'moq' });
  ok('NEGATIVE CONTROL: a via the port does not allow is refused, naming what it does allow', !barred.ok
    && /only travels by whep/.test(barred.why) && /whep/.test(barred.fix), `${barred.why} / ${barred.fix}`);
  const d = desk();
  const midi = d.validate('here:mk425c:out', 'here:circuit:in', [], { via: 'relay' });
  ok('NEGATIVE CONTROL: via on a MIDI link is refused, because the link carries its own bytes', !midi.ok
    && /travels inside the link itself/.test(midi.why), midi.why);
  let lineErr = '';
  try { parseLink('a:b:c -> d:e:f via'); } catch (e) { lineErr = e.message; }
  ok('NEGATIVE CONTROL: a line ending in a bare via is not read as a link', /cannot read/.test(lineErr), lineErr);
}

{
  /* Q. An input somebody holds, plan-routing-migration §3.6 and §5.2. */
  const b = createBay();
  b.addPort({ id: 'web-ab12:keys:out', label: 'keys at ab12', dir: 'out', medium: 'midi', emits: ['note'] });
  b.addPort({ id: 'web-cd34:keys:out', label: 'keys at cd34', dir: 'out', medium: 'midi', emits: ['note'] });
  b.addPort({ id: 'pi-1:synth:midi-in', label: 'synth', dir: 'in', medium: 'midi', accepts: ['note'], heldBy: 'web-ab12' });
  b.addPort({ id: 'pi-1:free:midi-in', label: 'free synth', dir: 'in', medium: 'midi', accepts: ['note'] });
  const other = b.validate('web-cd34:keys:out', 'pi-1:synth:midi-in');
  ok('a link into an input held by another site is refused, naming the holder', !other.ok
    && /held by web-ab12/.test(other.why) && /web-ab12/.test(other.fix || '') && !other.fix.includes(other.why),
    `${other.why} / ${other.fix}`);
  const own = b.validate('web-ab12:keys:out', 'pi-1:synth:midi-in');
  ok('and the holder\'s own site may link into it', own.ok, own.why);
  const asked = b.validate('web-cd34:keys:out', 'pi-1:synth:midi-in', [], { site: 'web-ab12' });
  const notAsked = b.validate('web-ab12:keys:out', 'pi-1:synth:midi-in', [], { site: 'web-cd34' });
  ok('the asker is the page that says who it is, not the source', asked.ok && !notAsked.ok,
    `${asked.why || 'allowed'} | ${notAsked.why}`);
  /* NEGATIVE CONTROL: an input nobody holds takes links from anybody. */
  const free = b.validate('web-cd34:keys:out', 'pi-1:free:midi-in');
  ok('NEGATIVE CONTROL: an input nobody holds takes a link from any site', free.ok, free.why);
  const made = b.link('web-cd34:keys:out', 'pi-1:synth:midi-in');
  ok('and link refuses what validate refused, with the same words', !made.ok && made.why === other.why, made.why);
}

{
  // R. A wire transport inside one site is refused.
  // why: lessons/kit-bay.md#test-r
  const b = createBay();
  for (const n of [['web-ab12:webgl', 'engine', 'WebGL2'], ['web-ab12:left', 'screen', 'left picture'],
    ['web-cd34:left', 'screen', 'their left picture']]) b.addNode({ id: n[0], kind: n[1], label: n[2], place: 'browser' });
  b.addNode({ id: 'pi-1:gpu', kind: 'engine', label: 'GPU', place: 'studio-1' });
  b.addPort({ id: 'web-ab12:webgl:video', label: 'WebGL2', dir: 'out', medium: 'video' });
  b.addPort({ id: 'web-ab12:left:video', label: 'left picture', dir: 'in', medium: 'video' });
  b.addPort({ id: 'web-cd34:left:video', label: 'their left picture', dir: 'in', medium: 'video' });
  b.addPort({ id: 'pi-1:gpu:video-out', label: 'GPU', dir: 'out', medium: 'video' });
  const tab = b.validate('web-ab12:webgl:video', 'web-ab12:left:video', [], { site: 'web-ab12', via: 'whep' });
  ok('whep asked for between two ports of one tab is refused, naming the site and the way out', !tab.ok
    && /both on web-ab12/.test(tab.why) && /whep/.test(tab.why) && /rides page/.test(tab.fix || ''),
    `${tab.why} / ${tab.fix}`);
  const relay = b.link('web-ab12:webgl:video', 'web-ab12:left:video', [], { via: 'relay-h264' });
  ok('and so is any other wire transport, through link as well as validate', !relay.ok && /both on web-ab12/.test(relay.why), relay.why);
  const plain = b.link('web-ab12:webgl:video', 'web-ab12:left:video');
  ok('NEGATIVE CONTROL: the same pair with no via is made, and rides page', plain.ok
    && plain.session?.transport === 'page' && plain.session.where === 'machine', JSON.stringify(plain.session || plain.why));
  const page = b.validate('web-ab12:webgl:video', 'web-ab12:left:video', [], { via: 'page' });
  ok('NEGATIVE CONTROL: and asking for page by name inside one tab is allowed', page.ok && page.session?.transport === 'page',
    page.why || page.session?.transport);
  const across = b.validate('pi-1:gpu:video-out', 'web-ab12:left:video', [], { site: 'web-ab12', via: 'whep' });
  ok('NEGATIVE CONTROL: a real cross-site whep is still accepted', across.ok
    && across.session?.transport === 'whep' && across.session.where !== 'machine', JSON.stringify(across.session || across.why));
  const tabs = b.validate('web-ab12:webgl:video', 'web-cd34:left:video', [], { via: 'whep' });
  ok('NEGATIVE CONTROL: two tabs both placed browser are two sites, so whep between them is accepted',
    tabs.ok && tabs.session?.transport === 'whep', tabs.why || tabs.session?.transport);
}

{
  // S. A derived address is per site.
  // why: lessons/kit-bay.md#test-s
  const b = createBay();
  for (const s of ['web-ab12', 'web-cd34']) {
    b.addNode({ id: `${s}:webgl`, kind: 'engine', label: 'WebGL2', place: 'browser' });
    b.addPort({ id: `${s}:webgl:video`, label: `WebGL2 ${s}`, dir: 'out', medium: 'video' });
  }
  b.addPort({ id: 'far:screen:video', label: 'far screen', dir: 'in', medium: 'video' });
  const one = b.link('web-ab12:webgl:video', 'far:screen:video').session?.address;
  const two = b.link('web-cd34:webgl:video', 'far:screen:video').session?.address;
  ok('two tabs placed browser derive two addresses, each carrying its site', one === 'browser-web-ab12-webgl-video'
    && two === 'browser-web-cd34-webgl-video', `${one}, ${two}`);
  b.addNode({ id: 'pi-1:circuit', kind: 'device', label: 'Circuit', place: 'pi-1' });
  b.addPort({ id: 'pi-1:circuit:audio-out', label: 'Circuit audio', dir: 'out', medium: 'audio' });
  b.addPort({ id: 'far:screen:audio', label: 'far audio', dir: 'in', medium: 'audio' });
  const pi = b.link('pi-1:circuit:audio-out', 'far:screen:audio').session?.address;
  ok('NEGATIVE CONTROL: a site that is its own place keeps the address it had', pi === 'pi-1-circuit-audio-out', pi);
  b.addPort({ id: 'pi-1:box:audio-out', label: 'box', dir: 'out', medium: 'audio', address: 'studio-1-box' });
  const told = b.link('pi-1:box:audio-out', 'far:screen:audio').session?.address;
  ok('NEGATIVE CONTROL: a declared address still wins over any derivation', told === 'studio-1-box', told);
}

{
  /* T. A `*` link and a light link across the network, plans/plan-site-names.md §4h. */
  const TEXT = { of: 'text' };
  const chat = (b, site, deliver) => {
    b.addPort({ id: `${site}:chat:value-out`, label: `chat ${site}`, dir: 'out', medium: 'value', shape: TEXT });
    b.addPort({ id: `${site}:chat:value-in`, label: `chat ${site}`, dir: 'in', medium: 'value', shape: TEXT, ...(deliver ? { deliver } : {}) });
  };
  const line = 'web-ab12:chat:value-out -> *:chat:value-in';
  const back = parseLink(line);
  ok('a * link reads and prints as an ordinary line', back.from === 'web-ab12:chat:value-out' && back.to === '*:chat:value-in'
    && printLink(back) === line, printLink(back));
  let bad1 = '', bad2 = '';
  try { parseLink('web-ab12:chat:value-out -> we*:chat:value-in'); } catch (e) { bad1 = e.message; }
  try { parseLink('web-ab12:chat:value-out -> *:*:in'); } catch (e) { bad2 = e.message; }
  ok('NEGATIVE CONTROL: a * that is not a whole site segment is not read', /whole site/.test(bad1) && /whole site/.test(bad2), `${bad1} | ${bad2}`);

  const got = [];
  const me = createBay();
  chat(me, 'web-ab12', (e, l, m) => got.push({ e, link: l, ...m }));
  chat(me, 'web-cd34'); chat(me, 'web-ef56');
  me.addPort({ id: 'web-gh78:chat:value-in', label: 'a fader called chat', dir: 'in', medium: 'value', shape: { of: 'number' } });
  const speak = me.link('web-ab12:chat:value-out', '*:chat:value-in');
  const to = (speak.matches || []).map((x) => `${x.to}:${x.ok ? 'ok' : 'no'}`).sort().join(' ');
  ok('a speaker * link is made and lists every concrete pair it stands for, its own site left out', speak.ok
    && to === 'web-cd34:chat:value-in:ok web-ef56:chat:value-in:ok web-gh78:chat:value-in:no', to);
  ok('and a pair the ordinary validate refuses is listed with the shape that refused it',
    /of does not match/.test(speak.matches.find((x) => x.to === 'web-gh78:chat:value-in')?.why || ''),
    speak.matches.find((x) => x.to === 'web-gh78:chat:value-in')?.why);
  const tg = me.targets('web-ab12:chat:value-out').map((t) => t.to).sort().join(' ');
  ok('targets are the pairs that validate now, so the fader is not one', tg === 'web-cd34:chat:value-in web-ef56:chat:value-in', tg);
  ok('NEGATIVE CONTROL: the speaker does not deliver to itself', me.send('web-ab12:chat:value-out', { text: 'hi' }) === 2 && got.length === 0,
    `${got.length} delivered here`);

  ok('NEGATIVE CONTROL: without a listener link a line from another site is not delivered',
    me.send('web-cd34:chat:value-out', { text: 'nobody asked' }) === 0 && got.length === 0, `${got.length}`);
  const listen = me.link('*:chat:value-out', 'web-ab12:chat:value-in');
  ok('a listener * link is made', listen.ok && listen.matches.length === 2, JSON.stringify(listen.matches));
  me.send('web-cd34:chat:value-out', { text: 'hello' }, { sent: 123 });
  ok('with it, a line from another site is delivered once, with who sent it and when', got.length === 1
    && got[0].e.text === 'hello' && got[0].from === 'web-cd34:chat:value-out' && got[0].to === 'web-ab12:chat:value-in' && got[0].sent === 123
    && got[0].link.id === listen.id, JSON.stringify(got));
  ok('NEGATIVE CONTROL: a source this bay has never heard of is not delivered', me.send('web-zz99:chat:value-out', { text: 'who' }) === 0 && got.length === 1);
  me.send('web-ab12:chat:value-out', { text: 'echo?' });
  ok('NEGATIVE CONTROL: the listener does not deliver this site\'s own line back to it', got.length === 1, `${got.length}`);

  const none = createBay(); chat(none, 'web-ab12');
  const alone = none.link('web-ab12:chat:value-out', '*:chat:value-in');
  ok('a * link with nobody to match is made, and says so', alone.ok && alone.matches.length === 0 && /nobody matches/.test(alone.warn || ''), alone.warn);
  const both = none.validate('*:chat:value-out', '*:chat:value-in');
  ok('NEGATIVE CONTROL: both ends * is refused', !both.ok && /names nobody/.test(both.why), both.why);
  const turned = none.validate('web-ab12:chat:value-in', '*:chat:value-in');
  ok('NEGATIVE CONTROL: a * speaker from an input is refused', !turned.ok && /input/.test(turned.why), turned.why);
  const h = createBay();
  h.addPort({ id: 'web-ab12:cam:out', label: 'camera', dir: 'out', medium: 'video' });
  h.addPort({ id: 'web-ab12:keys:out', label: 'keys', dir: 'out', medium: 'midi', emits: ['note'] });
  const hv = h.validate('web-ab12:cam:out', '*:screen:in'), md = h.validate('web-ab12:keys:out', '*:synth:in');
  ok('NEGATIVE CONTROL: a * link on a heavy medium or on MIDI is refused, saying why', !hv.ok && !md.ok
    && /light media other than MIDI/.test(hv.why) && /loop/.test(md.fix), `${hv.why} | ${md.fix}`);
  const tx = none.validate('web-ab12:chat:value-out', '*:chat:value-in', [{ op: 'transpose', by: 1 }]);
  ok('NEGATIVE CONTROL: a * link with a transform is refused', !tx.ok && /transforms/.test(tx.why), tx.why);
  const lb = createBay(); chat(lb, 'web-ab12');
  ok('load reads a * line and makes the link', lb.load(line).length === 0 && lb.text() === line, lb.text());

  /* The guard that used to drop every light event. */
  const v = createBay(); const seenV = [];
  v.addPort({ id: 'p:fader:out', label: 'fader', dir: 'out', medium: 'value' });
  v.addPort({ id: 'q:gpu:in', label: 'gpu', dir: 'in', medium: 'value', deliver: (e) => seenV.push(e) });
  v.link('p:fader:out', 'q:gpu:in');
  ok('a value event is delivered along a concrete link', v.send('p:fader:out', { v: 0.5 }) === 1 && seenV[0]?.v === 0.5, JSON.stringify(seenV));
}

{
  // A loop through a store is a replay, not feedback.
  // why: lessons/kit-bay.md#test-store-loop
  const b = createBay();
  b.addNode({ id: 'web-ab12:chat', kind: 'person', label: 'chat', place: 'browser' });
  b.addNode({ id: 'cf-store:history', kind: 'store', label: 'history', place: 'cloudflare', net: 'cloudflare' });
  b.addPort({ id: 'web-ab12:chat:value-out', label: 'chat', dir: 'out', medium: 'value', transports: ['relay'] });
  b.addPort({ id: 'web-ab12:chat:value-in', label: 'chat', dir: 'in', medium: 'value', transports: ['relay'] });
  b.addPort({ id: 'cf-store:history:value-in', label: 'history', dir: 'in', medium: 'value', transports: ['relay'] });
  b.addPort({ id: 'cf-store:history:value-out', label: 'history', dir: 'out', medium: 'value', transports: ['https'] });
  const keep = b.link('web-ab12:chat:value-out', 'cf-store:history:value-in');
  const back = b.link('cf-store:history:value-out', 'web-ab12:chat:value-in');
  ok('a chat may keep its lines in a store and hear the history back', keep.ok && back.ok, back.why);
  const r = createBay();
  for (const n of ['web-ab12:chat', 'cf-store:history']) r.addNode({ id: n, kind: n.startsWith('cf') ? 'store' : 'person', label: n, place: 'browser' });
  for (const p of b.ports()) r.addPort({ id: p.id, label: p.label, dir: p.dir, medium: p.medium });
  const first = r.link('cf-store:history:value-out', 'web-ab12:chat:value-in');
  const then = r.link('web-ab12:chat:value-out', 'cf-store:history:value-in');
  ok('the other way round too: history back first, then the keeping link', first.ok && then.ok, then.why);
  // A store in the MIDDLE of the path back also breaks the cycle.
  const m = createBay();
  m.addNode({ id: 'p:a', kind: 'engine', label: 'a', place: 'p' });
  m.addNode({ id: 'p:rec', kind: 'store', label: 'rec', place: 'p' });
  m.addNode({ id: 'p:b', kind: 'engine', label: 'b', place: 'p' });
  for (const [id, dir] of [['p:a:out', 'out'], ['p:a:in', 'in'], ['p:rec:in', 'in'], ['p:rec:out', 'out'], ['p:b:in', 'in'], ['p:b:out', 'out']]) {
    m.addPort({ id, label: id, dir, medium: 'value' });
  }
  m.link('p:b:out', 'p:rec:in'); m.link('p:rec:out', 'p:a:in');
  const mid = m.link('p:a:out', 'p:b:in');
  ok('a path back that passes through a store is not a loop', mid.ok, mid.why);
  /* NEGATIVE CONTROL: the same two shapes with no store in them are still loops. */
  const n = createBay();
  n.addNode({ id: 'web-ab12:chat', kind: 'person', label: 'chat', place: 'browser' });
  n.addNode({ id: 'cf-store:history', kind: 'endpoint', label: 'history', place: 'cloudflare' });
  for (const p of b.ports()) n.addPort({ id: p.id, label: p.label, dir: p.dir, medium: p.medium });
  n.link('web-ab12:chat:value-out', 'cf-store:history:value-in');
  const nl = n.link('cf-store:history:value-out', 'web-ab12:chat:value-in');
  ok('NEGATIVE CONTROL: an ordinary two-node loop is still refused', !nl.ok && /loop/.test(nl.why), nl.why);
  const q = createBay();
  for (const id of ['p:a', 'p:mid', 'p:b']) q.addNode({ id, kind: 'engine', label: id, place: 'p' });
  for (const [id, dir] of [['p:a:out', 'out'], ['p:a:in', 'in'], ['p:mid:in', 'in'], ['p:mid:out', 'out'], ['p:b:in', 'in'], ['p:b:out', 'out']]) {
    q.addPort({ id, label: id, dir, medium: 'value' });
  }
  q.link('p:b:out', 'p:mid:in'); q.link('p:mid:out', 'p:a:in');
  const ql = q.link('p:a:out', 'p:b:in');
  ok('NEGATIVE CONTROL: a three-node loop with no store on it is still refused', !ql.ok && /loop/.test(ql.why), ql.why);
  /* And a replay really delivers: history out reaches the chat in-port. */
  const got = [];
  b.addPort({ ...b.port('web-ab12:chat:value-in'), deliver: (e) => got.push(e.text) });
  ok('a line played back by the store is delivered along the history link',
    b.send('cf-store:history:value-out', { text: 'kept' }) === 1 && got[0] === 'kept', JSON.stringify(got));
}

// -- a light link between two sites names its wire --
// why: lessons/kit-bay.md#test-light-via
{
  const b = createBay();
  b.addNode({ id: 'web:keys', kind: 'person', label: 'keys', place: 'browser' });
  b.addNode({ id: 'web:synth', kind: 'engine', label: 'synth', place: 'browser' });
  b.addNode({ id: 'pi-1:sampler', kind: 'engine', label: 'sampler', place: 'studio-1' });
  b.addPort({ id: 'web:keys:midi-out', dir: 'out', medium: 'midi', emits: ['note'] });
  b.addPort({ id: 'web:synth:midi-in', dir: 'in', medium: 'midi', accepts: ['note'] });
  b.addPort({ id: 'pi-1:sampler:midi-in', dir: 'in', medium: 'midi', accepts: ['note'] });
  const dc = b.link('web:keys:midi-out', 'pi-1:sampler:midi-in', [], { via: 'datachannel' });
  ok('a MIDI link to another site may say it rides the data channel, and keeps it',
    dc.ok && b.links().find((l) => l.id === dc.id)?.via === 'datachannel', JSON.stringify(dc));
  const rl = b.link('web:keys:midi-out', 'pi-1:sampler:midi-in', [], { via: 'relay' });
  ok('and may say the relay', rl.ok && b.links().find((l) => l.id === rl.id)?.via === 'relay', JSON.stringify(rl));
  const same = b.link('web:keys:midi-out', 'web:synth:midi-in', [], { via: 'datachannel' });
  ok('NEGATIVE CONTROL: inside one site there is no wire to name', !same.ok, same.why);
  const whep = b.link('web:keys:midi-out', 'pi-1:sampler:midi-in', [], { via: 'whep' });
  ok('NEGATIVE CONTROL: a light link cannot ask for a media transport', !whep.ok, whep.why);
}

// -- timed links: `ahead` and `follow` --
// why: lessons/kit-bay.md#test-timed
// Sabotages against 196 here and 47 in bay-node-test.mjs are tabled in the lesson.
// why: lessons/kit-bay.md#test-timed-sabotage
/* A fake document clock and a fake timer, so every time below is exact and was
   worked by hand. `timebase.mjs` is the real one: the bay's job is to ask it and
   do what it says, and what it says is graded in `timebase-test.mjs`. */
{
  const { createTimebase } = await import('./timebase.mjs');
  let clk = 1000;
  let timers = [];
  const later = (fn, ms) => { timers.push({ due: clk + ms, fn }); };
  const advance = (ms) => {
    const end = clk + ms;
    for (;;) {
      timers.sort((a, b) => a.due - b.due);
      const t = timers[0];
      if (!t || t.due > end) break;
      timers.shift(); clk = t.due; t.fn();
    }
    clk = end;
  };
  const place = (offsetMs, extra = {}) => {
    const tb = createTimebase({ offsetMs });
    const got = [];
    const b = createBay({ timing: { timebase: tb, local: () => clk, later, ...extra } });
    b.addNode({ id: 'web-1:keys', kind: 'person' });
    b.addNode({ id: 'web-2:synth', kind: 'engine' });
    b.addPort({ id: 'web-1:keys:midi-out', label: 'keys', dir: 'out', medium: 'midi', emits: ['note'] });
    b.addPort({ id: 'web-2:synth:midi-in', label: 'synth', dir: 'in', medium: 'midi', accepts: ['note'],
      deliver: (e, l, m) => got.push({ clk, e, m }) });
    b.addPort({ id: 'web-1:cam:video-out', label: 'camera', dir: 'out', medium: 'video' });
    b.addPort({ id: 'web-2:screen:video-in', label: 'screen', dir: 'in', medium: 'video' });
    return { tb, b, got };
  };
  const NOTE = { cls: 'note', ch: 1, d1: 60, d2: 100 };
  const K = 'web-1:keys:midi-out', S = 'web-2:synth:midi-in';

  // 1. Absent is today: no option, delivered inside send, no timing in meta.
  {
    const P = place(0);
    P.b.link(K, S);
    P.b.send(K, NOTE, { at: clk + 150 });
    ok('a link with no timing option delivers inside send, as before, even with a timebase and an at given',
      P.got.length === 1 && P.got[0].clk === 1000 && !('timing' in P.got[0].m) && timers.length === 0,
      JSON.stringify(P.got.map((g) => g.clk)));
  }
  // 2. ahead 150 on one clock: due at 1150, not a millisecond before.
  {
    timers = []; clk = 1000;
    const P = place(0);
    const r = P.b.link(K, S, [], { options: { ahead: 150 } });
    P.b.send(K, NOTE, { at: 1150 });
    const before = P.got.length, heardBefore = P.b.port(S).heard;
    advance(149);
    const at149 = P.got.length;
    advance(1);
    ok('ahead 150: the event is held until the shared clock reads at, then handed over once',
      r.ok && before === 0 && heardBefore === 0 && at149 === 0 && P.got.length === 1 && P.got[0].clk === 1150
      && P.got[0]?.m.timing?.local === 1150 && P.got[0]?.m.timing?.lateMs === 0 && P.got[0]?.m.timing?.option === 'ahead 150'
      && P.b.port(S).heard === 1,
      `at 149 ${at149}, delivered at ${P.got[0]?.clk}, ${JSON.stringify(P.got[0]?.m.timing)}`);
  }
  // 3. Two places, one at, their clocks 200 ms apart and both corrected: each
  // fires when ITS shared clock reads at, which is local at - offset.
  {
    timers = []; clk = 1000;
    const A = place(0), B = place(200);
    A.b.link(K, S, [], { options: { ahead: 150 } }); B.b.link(K, S, [], { options: { ahead: 150 } });
    A.b.send(K, NOTE, { at: 1400 }); B.b.send(K, NOTE, { at: 1400 });
    advance(500);
    ok('ahead: two places whose local clocks disagree by 200 ms fire on one shared moment, each at its own local at - offset',
      A.got[0]?.clk === 1400 && B.got[0]?.clk === 1200
      && A.got[0].clk + A.tb.offsetMs === B.got[0].clk + B.tb.offsetMs,
      `A local ${A.got[0]?.clk}, B local ${B.got[0]?.clk}`);
  }
  // 4. horizonMs: handed over early with the exact time to play it at.
  {
    timers = []; clk = 1000;
    const P = place(0, { horizonMs: 100 });
    P.b.link(K, S, [], { options: { ahead: 150 } });
    P.b.send(K, NOTE, { at: 1150 });
    advance(200);
    ok('horizonMs 100: handed over 100 ms early, with the local time it is due',
      P.got[0]?.clk === 1050 && P.got[0]?.m.timing?.local === 1150, `${P.got[0]?.clk} ${JSON.stringify(P.got[0]?.m.timing)}`);
  }
  // 5. NEGATIVE CONTROLS: cannot tell holds, it never fires.
  {
    timers = []; clk = 1000;
    const P = place(0);
    const id = P.b.link(K, S, [], { options: { ahead: 150 } }).id;
    P.b.send(K, NOTE, {});
    advance(5000);
    const l = P.b.links().find((x) => x.id === id);
    ok('NEGATIVE CONTROL: an event with no at on an ahead link is never delivered, and is counted missed with the reason',
      P.got.length === 0 && l?.missed === 1 && /stamped no at/.test(l?.lastWhy), `${P.got.length} ${l?.missed} ${l?.lastWhy}`);
  }
  {
    timers = []; clk = 1000;
    const P = place(null);
    const id = P.b.link(K, S, [], { options: { ahead: 150 } }).id;
    P.b.send(K, NOTE, { at: 1150 });
    advance(2900);
    const mid = P.got.length;
    advance(200);
    const l = P.b.links().find((x) => x.id === id);
    ok('NEGATIVE CONTROL: with no peer clock agreed the event holds, asked again, then missed after holdMs, never fired',
      mid === 0 && P.got.length === 0 && l?.held === 1 && l?.missed === 1 && /no peer clock/.test(l?.lastWhy),
      `held ${l?.held}, missed ${l?.missed}, ${l?.lastWhy}`);
  }
  {
    timers = []; clk = 1000;
    const b = createBay();
    b.addPort({ id: 'web-1:keys:midi-out', label: 'keys', dir: 'out', medium: 'midi', emits: ['note'] });
    const got = [];
    b.addPort({ id: 'web-2:synth:midi-in', label: 'synth', dir: 'in', medium: 'midi', accepts: ['note'], deliver: (e) => got.push(e) });
    const id = b.link(K, S, [], { options: { ahead: 150 } }).id;
    b.send(K, NOTE, { at: Date.now() });
    await new Promise((r) => setTimeout(r, 60));
    const l = b.links().find((x) => x.id === id);
    ok('NEGATIVE CONTROL: a bay given no timebase holds a timed event rather than firing it on arrival',
      got.length === 0 && l?.held === 1, `${got.length} delivered, held ${l?.held}`);
  }
  // 6. follow: the receiver waits out the heavy link's observed lag here.
  {
    timers = []; clk = 1000;
    const P = place(0);
    const v = P.b.link('web-1:cam:video-out', 'web-2:screen:video-in');
    P.tb.link('web-1:cam:video-out', { stampOffsetMs: 0 });
    for (let t = 0; t <= 1000; t += 100) P.tb.observe('web-1:cam:video-out', { local: t, stamp: t - 2000 });
    const r = P.b.link(K, S, [], { options: { follow: 'web-1:cam:video-out' } });
    P.b.send(K, NOTE, { at: 1000 });
    advance(1999);
    const early = P.got.length;
    advance(1);
    ok('follow: an event stamped at 1000 on a link whose picture is 2 s behind here lands at 3000, when the picture shows it',
      v.ok && r.ok && early === 0 && P.got[0]?.clk === 3000 && /following/.test(P.got[0]?.m.timing?.why),
      `${P.got[0]?.clk} ${P.got[0]?.m.timing?.why}`);
  }
  {
    timers = []; clk = 1000;
    const P = place(0);
    P.tb.link('web-1:cam:video-out', { stampOffsetMs: 0 });
    const id = P.b.link(K, S, [], { options: { follow: 'web-1:cam:video-out' } }).id;
    P.b.send(K, NOTE, { at: 1000 });
    advance(4000);
    const l = P.b.links().find((x) => x.id === id);
    ok('NEGATIVE CONTROL: following a heavy link nothing has observed yet holds, and is missed rather than fired',
      P.got.length === 0 && l?.missed === 1 && /cannot be told/.test(l?.lastWhy), l?.lastWhy);
  }
  // 6b. A wait is asked again, so a line that steps EARLIER while a cue waits
  // brings the cue with it. Before RECHECK_MS a cue slept to the old due and
  // fired 2 s after its picture (MEASURED on /concepts/clock/040/, +2004 ms).
  {
    timers = []; clk = 1000;
    const P = place(0);
    P.tb.link('web-1:cam:video-out', { stampOffsetMs: 0 });
    for (let t = 0; t <= 1000; t += 100) P.tb.observe('web-1:cam:video-out', { local: t, stamp: t - 2000 });
    P.b.link(K, S, [], { options: { follow: 'web-1:cam:video-out' } });
    P.b.send(K, NOTE, { at: 1000 });
    advance(500);
    for (const t of [1500, 1510, 1520]) P.tb.observe('web-1:cam:video-out', { local: t, stamp: t });   // a drift-seek: lag 0 now
    advance(3000);
    ok('follow: when the picture jumps 2 s ahead while a cue waits, the cue lands within one recheck of the jump, not at the old due',
      P.got.length === 1 && P.got[0].clk >= 1520 && P.got[0].clk <= 1570, `delivered at ${P.got[0]?.clk}`);
  }
  // 7. What the bay refuses, with the reason.
  {
    const P = place(0);
    const light = P.b.validate(K, S, [], { options: { follow: K } });
    ok('NEGATIVE CONTROL: follow naming the link\'s own end is refused', !light.ok && /cannot wait for itself/.test(light.why), light.why);
    P.b.addPort({ id: 'web-1:fader:value-out', label: 'fader', dir: 'out', medium: 'value' });
    const fl = P.b.validate(K, S, [], { options: { follow: 'web-1:fader:value-out' } });
    ok('NEGATIVE CONTROL: follow naming a light port is refused, and says only a heavy link is worth waiting for',
      !fl.ok && /value link/.test(fl.why) && /heavy/.test(fl.why), fl.why);
    const unknown = P.b.validate(K, S, [], { options: { follow: 'stage-1:cam:video-out' } });
    ok('a follow naming a link this bay has not heard of yet is allowed, and the timebase holds until it is observed', unknown.ok, unknown.why);
    const aud = P.b.validate('web-1:cam:video-out', 'web-2:screen:video-in', [], { options: { ahead: 150 } });
    ok('NEGATIVE CONTROL: ahead on a video link is refused, because a heavy link is not scheduled, it is followed',
      !aud.ok && /no option called ahead/.test(aud.why), aud.why);
    const zero = P.b.validate(K, S, [], { options: { ahead: 0 } });
    const word = P.b.validate(K, S, [], { options: { ahead: 'soon' } });
    ok('NEGATIVE CONTROL: ahead 0 and ahead soon are refused, each naming the range',
      !zero.ok && /outside 1 to 10000/.test(zero.why) && !word.ok && /whole number from 1 to 10000/.test(word.why), `${zero.why} | ${word.why}`);
  }
  // 8. The text form round trips, and a loaded line carries its options.
  {
    const lines = ['web-1:keys:midi-out -> web-2:synth:midi-in { ahead 150 }',
      'web-1:keys:midi-out -> web-2:synth:midi-in { transpose +12, follow web-1:cam:video-out }'];
    let back = [], bad = ['not loaded'];
    const P = place(0);
    try { back = lines.map((x) => printLink(parseLink(x))); bad = P.b.load(lines.join('\n')); } catch (e) { back = [String(e.message)]; }
    ok('ahead and follow round trip through the text form and load as options',
      back.join('\n') === lines.join('\n') && bad.length === 0
      && P.b.links()[0]?.options?.ahead === 150 && P.b.links()[1]?.options?.follow === 'web-1:cam:video-out',
      back.join(' | '));
  }
  timers = [];
}

// -- the patch transform --
// A patch is a word an in-port lists; most of these are negative controls on the refusal.
// why: lessons/kit-bay.md#patch
console.log('\n== choosing a patch ==');
{
  const sampled = [];
  const P = () => {
    const b = createBay();
    b.addPort({ id: 'web:keys:midi-out', label: 'keyboard', dir: 'out', medium: 'midi', emits: ['note'] });
    b.addPort({ id: 'web:sampler:midi-in', label: 'sampler midi-in', dir: 'in', medium: 'midi', accepts: ['note'],
      patches: ['Piano', 'Rhodes'], deliver: (e) => sampled.push(e) });
    b.addPort({ id: 'web:synth:midi-in', label: 'synth midi-in', dir: 'in', medium: 'midi', accepts: ['note'] });
    b.addPort({ id: 'web:synth:audio-out', label: 'synth audio-out', dir: 'out', medium: 'audio', shape: { rate: 48000 } });
    b.addPort({ id: 'web:speaker:audio-in', label: 'speaker', dir: 'in', medium: 'audio', shape: { rate: 48000 } });
    return b;
  };
  const b = P();
  const r = b.link('web:keys:midi-out', 'web:sampler:midi-in', [{ op: 'patch', name: 'Rhodes' }]);
  ok('a patch the instrument lists is chosen on a MIDI link into it', r.ok && patchOf(b.links()[0].transforms) === 'Rhodes', r.why || r.id);
  b.send('web:keys:midi-out', { cls: 'note', ch: 1, d1: 60, d2: 90 });
  ok('the patch changes no event: the note arrives as it was played', sampled.length === 1 && sampled[0].d1 === 60 && sampled[0].d2 === 90,
    JSON.stringify(sampled));
  const lower = P().link('web:keys:midi-out', 'web:sampler:midi-in', [{ op: 'patch', name: 'rhodes' }]);
  const b2 = P(); b2.link('web:keys:midi-out', 'web:sampler:midi-in', [{ op: 'patch', name: 'rhodes' }]);
  ok('a name in other letters chooses the instrument\'s own spelling', lower.ok && patchOf(b2.links()[0].transforms) === 'Rhodes',
    patchOf(b2.links()[0]?.transforms));

  const unknown = P().link('web:keys:midi-out', 'web:sampler:midi-in', [{ op: 'patch', name: 'Harpsichord' }]);
  ok('NEGATIVE CONTROL: a patch the instrument does not list is refused, naming the ones it has',
    !unknown.ok && /no patch called "Harpsichord"/.test(unknown.why) && unknown.fix === 'Name one of Piano, Rhodes.',
    `${unknown.why} / ${unknown.fix}`);
  const none = P().link('web:keys:midi-out', 'web:synth:midi-in', [{ op: 'patch', name: 'Rhodes' }]);
  ok('NEGATIVE CONTROL: a patch into an instrument that lists none is refused in words',
    !none.ok && /lists no patches/.test(none.why), none.why);
  const audio = P().link('web:synth:audio-out', 'web:speaker:audio-in', [{ op: 'patch', name: 'Rhodes' }]);
  ok('NEGATIVE CONTROL: a patch on an audio link is refused, as every transform there is',
    !audio.ok && /only works on MIDI/.test(audio.why), audio.why);
  const empty = P().link('web:keys:midi-out', 'web:sampler:midi-in', [{ op: 'patch' }]);
  const number = P().link('web:keys:midi-out', 'web:sampler:midi-in', [{ op: 'patch', name: 1 }]);
  const two = P().link('web:keys:midi-out', 'web:sampler:midi-in', [{ op: 'patch', name: 'Piano' }, { op: 'patch', name: 'Rhodes' }]);
  ok('NEGATIVE CONTROL: no name, a number for a name and two patches on one link are three refusals',
    !empty.ok && !number.ok && !two.ok && /given nothing at all/.test(empty.why) && /rather than as a word/.test(number.why)
    && /chooses 2 patches/.test(two.why), [empty.why, number.why, two.why].join(' | '));
  const swap = checkTransforms([{ op: 'patch', to: 'Rhodes' }]);
  ok('a name under the wrong key is offered back under the right one', swap.fix === 'Write it as {"op":"patch","name":"Rhodes"}.', swap.fix);

  const b3 = P();
  b3.link('web:keys:midi-out', 'web:sampler:midi-in', [{ op: 'range', hi: 59 }, { op: 'patch', name: 'Rhodes' }]);
  const second = b3.link('web:keys:midi-out', 'web:sampler:midi-in', [{ op: 'range', lo: 60 }, { op: 'patch', name: 'Piano' }]);
  ok('a second link choosing another patch into the same instrument is made, with a warning that it switches it',
    second.ok && /plays Rhodes for another link, and this one switches it to Piano/.test(second.warn || ''), second.warn);

  const line = printLink({ from: 'web:keys:midi-out', to: 'web:plaits:midi-in', transforms: [{ op: 'patch', name: 'Soft FM' }] });
  const back = parseLink(line);
  ok('a patch name with a space round trips through the text form', line.includes('patch "Soft FM"') && back.transforms[0].name === 'Soft FM',
    `${line} | ${JSON.stringify(back.transforms)}`);
  const sig = OP_HELP.find((o) => o.op === 'patch')?.sig;
  ok('the patch signature names a word, not a number', sig === 'patch name=NAME', sig);
}


// ── drummap: General MIDI drums on the Circuit's own notes (plans/plan-pi-sequencer.md §3) ──
// The Circuit's notes are written here from the Drum Notes Table, not read from drum-maps.mjs, so
// a wrong map (46 to 66) goes red here. Most are NEGATIVE CONTROLS.
console.log('\n== drummap ==');
{
  const { DRUM_MAPS, drumRows } = await import('./drum-maps.mjs');
  const TABLE = { 36: 60, 38: 62, 42: 64, 46: 65 };   // GM kick, snare, closed hat, open hat; Drum Notes Table 60, 62, 64, 65
  const got = [];
  const D = () => {
    const b = createBay();
    b.addPort({ id: 'pi-1:sequencer:midi-out', label: 'sequencer', dir: 'out', medium: 'midi', emits: ['note', 'cc'], shape: { channels: [10] } });
    b.addPort({ id: 'pi-1:circuit:midi-in', label: 'Circuit', dir: 'in', medium: 'midi', accepts: ['note', 'cc', 'program'],
      never: ['sysex'], shape: { channels: [1, 2, 10] }, drums: DRUM_MAPS.circuit, deliver: (e) => got.push(e) });
    b.addPort({ id: 'pi-1:plain:midi-in', label: 'plain synth', dir: 'in', medium: 'midi', accepts: ['note', 'cc'] });
    b.addPort({ id: 'pi-1:drums:midi-in', label: 'drums', dir: 'in', medium: 'midi', accepts: ['note'], drums: DRUM_MAPS.gm, deliver: (e) => got.push(e) });
    b.addPort({ id: 'web:other:midi-out', label: 'channel 3 keys', dir: 'out', medium: 'midi', emits: ['note'], shape: { channels: [3] } });
    b.addPort({ id: 'web:dump:midi-out', label: 'editor', dir: 'out', medium: 'midi', emits: ['note', 'sysex'] });
    return b;
  };
  const b = D();
  const r = b.link('pi-1:sequencer:midi-out', 'pi-1:circuit:midi-in', [{ op: 'drummap', name: 'circuit' }]);
  ok('a sequencer on channel 10 links into the Circuit, which plays 1, 2 and 10, with the circuit drum map', r.ok, r.why || r.warn);
  const L = b.links()[0];
  for (const [gm, want] of Object.entries(TABLE)) {
    got.length = 0;
    b.send('pi-1:sequencer:midi-out', { cls: 'note', ch: 10, d1: Number(gm), d2: 100 });
    ok(`GM ${gm} arrives at the Circuit as note ${want} on channel 10`, got.length === 1 && got[0].d1 === want && got[0].ch === 10,
      JSON.stringify(got));
  }
  got.length = 0;
  const dropped0 = L.dropped;
  b.send('pi-1:sequencer:midi-out', { cls: 'note', ch: 10, d1: 39, d2: 100 });
  ok('NEGATIVE CONTROL: a clap (39), which the map lacks, never reaches the Circuit and is counted dropped',
    got.length === 0 && L.dropped === dropped0 + 1, `${got.length} arrived, dropped ${L.dropped}`);
  got.length = 0;
  b.send('pi-1:sequencer:midi-out', { cls: 'note', ch: 10, d1: 36, d2: 0, off: true });
  ok('NEGATIVE CONTROL: the note off finds the same note, 60, or the drum would hang', got.length === 1 && got[0].d1 === 60 && got[0].off === true,
    JSON.stringify(got));
  got.length = 0;
  b.send('pi-1:sequencer:midi-out', { cls: 'cc', ch: 10, d1: 123, d2: 0 });
  ok('NEGATIVE CONTROL: all notes off (CC 123) passes the map unchanged', got.length === 1 && got[0].cls === 'cc' && got[0].d1 === 123 && got[0].ch === 10,
    JSON.stringify(got));
  ok('the link stores the resolved map, so apply() never needs the port', L.transforms[0].map?.[46] === 65 && L.transforms[0].channel === 10,
    JSON.stringify(L.transforms[0]));
  const line = printLink(L);
  ok('the text form prints only the name, never the numbers', line === 'pi-1:sequencer:midi-out -> pi-1:circuit:midi-in { drummap circuit }', line);
  const back = parseLink(line);
  ok('and reads back as the bare op, resolved again when it is linked', back.transforms.length === 1 && back.transforms[0].op === 'drummap'
    && back.transforms[0].name === 'circuit' && !('map' in back.transforms[0]), JSON.stringify(back.transforms));
  const b2 = D();
  const bad = b2.load(line);
  ok('a loaded text patch resolves the map against the port', bad.length === 0 && b2.links()[0].transforms[0].map?.[38] === 62, JSON.stringify(bad));
  ok('NEGATIVE CONTROL: an unresolved drummap drops every note rather than send General MIDI to the instrument',
    apply([{ op: 'drummap', name: 'circuit' }], { cls: 'note', ch: 10, d1: 36, d2: 100 }) === null);
  ok('NEGATIVE CONTROL: identity (gm) passes a note through and puts it on the map\'s channel',
    apply([{ op: 'drummap', name: 'gm', map: null, channel: 10 }], { cls: 'note', ch: 1, d1: 39, d2: 90 })?.d1 === 39
    && apply([{ op: 'drummap', name: 'gm', map: null, channel: 10 }], { cls: 'note', ch: 1, d1: 39, d2: 90 })?.ch === 10);

  const wrong = D().link('pi-1:sequencer:midi-out', 'pi-1:circuit:midi-in', [{ op: 'drummap', name: 'gm' }]);
  ok('NEGATIVE CONTROL: the gm map named into the Circuit is refused, and the fix names the map it lists',
    !wrong.ok && /plays its drums by the circuit map/.test(wrong.why) && wrong.fix === 'Write it as {"op":"drummap","name":"circuit"}.', `${wrong.why} | ${wrong.fix}`);
  const none = D().link('pi-1:sequencer:midi-out', 'pi-1:plain:midi-in', [{ op: 'drummap', name: 'circuit' }]);
  ok('NEGATIVE CONTROL: a drummap into a port with no drums is refused, naming the port', !none.ok && /plain synth lists no drum map/.test(none.why), none.why);
  const plain = D().link('pi-1:sequencer:midi-out', 'pi-1:circuit:midi-in');
  ok('NEGATIVE CONTROL: a plain link into the Circuit is made, with a warning that a kick will not sound',
    plain.ok && /a kick \(36\) will not sound/.test(plain.warn || '') && /"drummap"/.test(plain.warn || ''), plain.warn);
  ok('the drummap link warns what the map drops', /plays General MIDI 36, 38, 42, 46 and drops every other drum note/.test(r.warn || ''), r.warn);
  const gmLink = D().link('pi-1:sequencer:midi-out', 'pi-1:drums:midi-in');
  ok('NEGATIVE CONTROL: a plain link into a General MIDI port carries no drum warning', gmLink.ok && !/drum note|drummap/.test(gmLink.warn || ''), gmLink.warn || 'none');
  const two = checkTransforms([{ op: 'drummap', name: 'circuit' }, { op: 'drummap', name: 'gm' }]);
  ok('NEGATIVE CONTROL: two drummaps on one link are refused', /names 2 drum maps/.test(two.why || ''), two.why);
  const blank = checkTransforms([{ op: 'drummap', name: ' ' }]);
  ok('NEGATIVE CONTROL: a drummap with an empty name is refused in words', /the name of a drum map came as/.test(blank.why || ''), blank.why);
  const ch3 = D().link('web:other:midi-out', 'pi-1:circuit:midi-in', [{ op: 'drummap', name: 'circuit' }]);
  ok('NEGATIVE CONTROL: a source on channel 3 is refused by the channel set, and the fix moves it onto one the Circuit plays',
    !ch3.ok && /sends on channel 3 and Circuit plays only 1, 2, 10/.test(ch3.why) && /"op":"channel","to":1/.test(ch3.fix), `${ch3.why} | ${ch3.fix}`);
  const sys = D().link('web:dump:midi-out', 'pi-1:circuit:midi-in', [{ op: 'drummap', name: 'circuit' }]);
  ok('NEGATIVE CONTROL: a drummap does not make SysEx into the Circuit acceptable', !sys.ok && /does not accept sysex/.test(sys.why), sys.why);
  const rows = drumRows(L.transforms[0]).map((x) => x.line);
  ok('the details rows read GM note, voice, the Circuit\'s note and its slot', rows[0] === '36 kick -> 60 drum 1' && rows.length === 4
    && rows[3] === '46 open hat -> 65 drum 4', rows.join(' | '));
  const sig = OP_HELP.find((o) => o.op === 'drummap')?.sig;
  ok('the drummap signature names a word', sig === 'drummap name=NAME', sig);
}

// ── drummap read back: the Circuit's drum notes out onto General MIDI drums (lessons/kit-bay.md#drummap-back) ──
// The table is written here, not read from drum-maps.mjs, so an inverse that slips a note goes red.
console.log('\n== drummap read back ==');
{
  const { DRUM_MAPS, drumRows } = await import('./drum-maps.mjs');
  const BACK = { 60: 36, 62: 38, 64: 42, 65: 46 };   // drum 1 to 4 onto kick, snare, closed hat, open hat
  const got = [];
  const D = () => {
    const b = createBay();
    b.addPort({ id: 'pi-1:circuit:midi-out', label: 'circuit', dir: 'out', medium: 'midi', emits: ['note', 'cc', 'program', 'clock'],
      shape: { channels: [1, 2, 10] }, drums: DRUM_MAPS.circuit });
    b.addPort({ id: 'pi-1:circuit:midi-in', label: 'circuit in', dir: 'in', medium: 'midi', accepts: ['note', 'cc', 'program'],
      never: ['sysex'], shape: { channels: [1, 2, 10] }, drums: DRUM_MAPS.circuit, deliver: () => {} });
    b.addPort({ id: 'pi-1:drums:midi-in', label: 'drums', dir: 'in', medium: 'midi', accepts: ['note'], drums: DRUM_MAPS.gm, deliver: (e) => got.push(e) });
    b.addPort({ id: 'pi-1:plain:midi-in', label: 'plain synth', dir: 'in', medium: 'midi', accepts: ['note'], deliver: (e) => got.push(e) });
    b.addPort({ id: 'web:keys:midi-out', label: 'keys', dir: 'out', medium: 'midi', emits: ['note'] });
    return b;
  };
  const b = D();
  const r = b.link('pi-1:circuit:midi-out', 'pi-1:drums:midi-in', [{ op: 'drummap', name: 'circuit' }]);
  ok('the Circuit\'s out links into the GM drums by its own map, read back', r.ok, r.why || r.warn || '');
  const L = b.links()[0];
  for (const [own, gm] of Object.entries(BACK)) {
    got.length = 0;
    b.send('pi-1:circuit:midi-out', { cls: 'note', ch: 10, d1: Number(own), d2: 96 });
    ok(`Circuit ${own} on channel 10 arrives at the drums as GM ${gm}`, got.length === 1 && got[0].d1 === gm && got[0].ch === 10, JSON.stringify(got));
  }
  got.length = 0;
  const d0 = L.dropped;
  b.send('pi-1:circuit:midi-out', { cls: 'note', ch: 1, d1: 60, d2: 100 });
  b.send('pi-1:circuit:midi-out', { cls: 'note', ch: 2, d1: 64, d2: 100 });
  ok('NEGATIVE CONTROL: synth 1 and synth 2 playing 60 and 64 never reach the drums', got.length === 0 && L.dropped === d0 + 2, `${got.length} arrived, dropped ${L.dropped - d0}`);
  b.send('pi-1:circuit:midi-out', { cls: 'note', ch: 10, d1: 66, d2: 96 });
  ok('NEGATIVE CONTROL: a channel 10 note the map lacks (66) is dropped', got.length === 0, JSON.stringify(got));
  b.send('pi-1:circuit:midi-out', { cls: 'cc', ch: 10, d1: 8, d2: 64 });
  b.send('pi-1:circuit:midi-out', { cls: 'program', ch: 10, d1: 3 });
  ok('NEGATIVE CONTROL: a CC and a program change on channel 10 are refused by the drums\' midi in', got.length === 0, JSON.stringify(got));
  ok('the link stores the inverse and the channel it reads', L.transforms[0].map?.[65] === 46 && L.transforms[0].only === 10 && L.transforms[0].back === true,
    JSON.stringify(L.transforms[0]));
  const line = printLink(L);
  ok('the text form is the same one word', line === 'pi-1:circuit:midi-out -> pi-1:drums:midi-in { drummap circuit }', line);
  const b2 = D();
  ok('a loaded text patch resolves the read back again', b2.load(line).length === 0 && b2.links()[0].transforms[0].map?.[62] === 38);
  const rows = drumRows(L.transforms[0]).map((x) => x.line);
  ok('the details rows read the Circuit\'s slot and the GM voice', rows[0] === '60 drum 1 -> 36 kick' && rows[3] === '65 drum 4 -> 46 open hat', rows.join(' | '));
  const { drummapFor } = await import('./bay.mjs');
  const fwd = drummapFor([{ op: 'drummap', name: 'circuit' }], { label: 'circuit in', drums: DRUM_MAPS.circuit }, { label: 'circuit', drums: DRUM_MAPS.circuit });
  ok('NEGATIVE CONTROL: when both ends list the map, the receiving port wins and it resolves FORWARD, never as a read back',
    fwd.drums && !fwd.drums.back && fwd.drums.map[36] === 60, JSON.stringify(fwd.drums));
  const plain = D().link('pi-1:circuit:midi-out', 'pi-1:plain:midi-in', [{ op: 'drummap', name: 'circuit' }]);
  ok('a read back into a port that lists no map plays GM there too', plain.ok, plain.why || '');
  const keys = D().link('web:keys:midi-out', 'pi-1:drums:midi-in', [{ op: 'drummap', name: 'circuit' }]);
  ok('NEGATIVE CONTROL: a source with no drums naming circuit into the GM drums is refused', !keys.ok && /plays its drums by the gm map/.test(keys.why), keys.why);
  ok('NEGATIVE CONTROL: a read back transform drops another channel in apply() too',
    apply([L.transforms[0]], { cls: 'note', ch: 1, d1: 60, d2: 90 }) === null && apply([L.transforms[0]], { cls: 'note', ch: 10, d1: 60, d2: 90 })?.d1 === 36);
}

{
  // V. A meeting between tabs: p2p browser to browser, sfu through a media server.
  // why: lessons/kit-bay.md#p2p-sfu
  const meet = (transports, n, place) => {
    const b = createBay();
    const sites = ['web-ab12', 'web-cd34', 'web-ef56', 'web-gh78'].slice(0, n);
    for (const s of sites) {
      b.addNode({ id: `${s}:camera`, kind: 'device', label: 'camera', ...(place ? { place } : {}) });
      b.addNode({ id: `${s}:grid`, kind: 'screen', label: 'grid', ...(place ? { place } : {}) });
      b.addPort({ id: `${s}:camera:video-out`, label: 'camera', dir: 'out', medium: 'video', ...(transports ? { transports } : {}) });
      b.addPort({ id: `${s}:grid:video-in`, label: 'grid', dir: 'in', medium: 'video', ...(transports ? { transports } : {}) });
    }
    return sites.slice(1).map((s) => b.link(`${sites[0]}:camera:video-out`, `${s}:grid:video-in`)).at(-1);
  };
  const two = meet(['p2p'], 2);
  ok('two tabs whose cameras travel by p2p are offered p2p with no via, over the internet', two.ok
    && two.session?.transport === 'p2p' && two.session.where === 'internet-one' && /browser to browser/.test(two.session.says),
    JSON.stringify(two.session || two.why));
  const mesh = meet(['p2p'], 4);
  ok('three receivers make it internet-many, and a p2p-only camera is still offered p2p: a mesh', mesh.ok
    && mesh.session?.transport === 'p2p' && mesh.session.where === 'internet-many', JSON.stringify(mesh.session || mesh.why));
  const sfu = meet(['p2p', 'sfu'], 4);
  ok('a camera that can go either way to many receivers is offered sfu first', sfu.ok
    && sfu.session?.transport === 'sfu' && /SFU/.test(sfu.session.says), JSON.stringify(sfu.session || sfu.why));
  const one = meet(['p2p', 'sfu'], 2);
  ok('and to one receiver, p2p, since the internet-one cell offers p2p before sfu', one.ok && one.session?.transport === 'p2p',
    JSON.stringify(one.session || one.why));
  const sfuOne = meet(['page', 'sfu'], 2);
  ok('a camera that goes only through the SFU is offered sfu to one receiver too', sfuOne.ok && sfuOne.session?.transport === 'sfu'
    && sfuOne.session.where === 'internet-one', JSON.stringify(sfuOne.session || sfuOne.why));
  const plain = meet(null, 2);
  ok('NEGATIVE CONTROL: ports that name no transport still get the cell\'s own whep, never p2p', plain.ok
    && plain.session?.transport === 'whep', JSON.stringify(plain.session || plain.why));
  const shared = meet(['p2p'], 2, 'browser');
  ok('NEGATIVE CONTROL: two tabs that both say place browser are one machine to the bay, so p2p is refused there',
    !shared.ok && /p2p/.test(shared.why), shared.why || JSON.stringify(shared.session));
  ok('p2p and sfu are transport names that leave the machine, and datachannel is still one',
    ['p2p', 'sfu', 'datachannel'].every((x) => TRANSPORT_NAMES.includes(x)) && !MACHINE_ONLY.includes('p2p') && !MACHINE_ONLY.includes('sfu'),
    TRANSPORT_NAMES.join(', '));
  ok('NEGATIVE CONTROL: the board\'s network audio is still datachannel first',
    chooseTransport('audio', 'network').transport === 'datachannel', JSON.stringify(chooseTransport('audio', 'network')));
}

console.log(`\n${pass}/${pass + fail} green${fail ? `  (${fail} FAILED)` : ''}\n`);
process.exit(fail ? 1 : 0);
