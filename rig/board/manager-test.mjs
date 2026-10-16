// rig/board/manager-test.mjs: the patchbay manager's stop all and check, on the board's real sequencer,
// keyboard and Circuit drums services and the Circuit input's real gate, with fake engines and a fake
// JACK graph. No board, socket or instrument.  node rig/board/manager-test.mjs
// Most are NEGATIVE CONTROLS: each stop step is skipped in turn and the check row it answers must go red.
// why: lessons/rig-board-manager.md#test

import { createManager, createHold, checkLines, STEPS, HOLD_MS, CIRCUIT_ALL_OFF } from './manager.mjs';
import { createSequencerService } from './sequencer.mjs';
import { createKeyboardService } from './keyboard.mjs';
import { createCircuitDrumsService } from './circuit-drums.mjs';
import { createInputs, parseInputs } from './inputs.mjs';
import { withBar } from './panel.mjs';
import { graphOf } from './beat.mjs';
import { PWM_PORTS } from '../../demo/shell/graph-registry.mjs';
import { DRUM_MAPS } from '../../demo/shell/drum-maps.mjs';
import { format, parse, randomId } from '../../demo/shell/wire.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${detail ? ' | ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' | ' + detail : ''}`); }
};
const noop = () => {};

const INPUTS = parseInputs(JSON.stringify({ circuit: { device: 'hw:CARD=Fake,DEV=0', channels: 2, midi: { port: 'Circuit', channels: [1, 2, 10] } } }));
const FACTS = { room: 'studio-1', instruments: { collide: true, plaits: true }, inputs: INPUTS.inputs, gpu: false,
  ports: [{ client: 'MK-425C USB MIDI Keyboard' }], midiPresent: () => true,
  drums: { circuit: DRUM_MAPS.circuit, drums: DRUM_MAPS.gm }, sequencer: true };
const PATTERN = { v: 1, bpm: 120, steps: 16, rows: [{ voice: 'kick', steps: '1000100010001000' }, { voice: 'hhc', steps: '1010101010101010' }] };
const DRUMS_TO_PWM = 'pi-1:drums:audio-out -> pi-1:pwm:audio-in';
const PLAITS_TO_PWM = 'pi-1:plaits:audio-out -> pi-1:pwm:audio-in';

/** A clock that moves only when told. */
function fakeClock() {
  let t = 1000, id = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const k = ++id; timers.set(k, { at: t + ms, fn }); return k; },
    clearTimer: (k) => { timers.delete(k); },
    run(until) {
      for (;;) {
        let best = null;
        for (const [k, x] of timers) if (x.at <= until && (!best || x.at < best[1].at)) best = [k, x];
        if (!best) break;
        timers.delete(best[0]); t = Math.max(t, best[1].at); best[1].fn();
      }
      t = Math.max(t, until);
    },
  };
}

/** The JACK graph as the board's `jack.link` leaves it: each held link feeds both PWM inputs. */
function fakeJack(trace) {
  const feeds = new Map(PWM_PORTS.map((p) => [p, new Set()]));
  const held = new Map();
  const SRC = { [DRUMS_TO_PWM]: 'scsynth:out_1', [PLAITS_TO_PWM]: 'posplaits:out_1' };
  return {
    link(key) { held.set(key, SRC[key]); for (const s of feeds.values()) s.add(held.get(key)); },
    /** A connection made around the board's ledger (jack.apply), which only the output cut removes. */
    stray(from) { for (const s of feeds.values()) s.add(from); },
    api: {
      held: () => [...held.keys()],
      unlink(key) { trace.push(`jack.unlink ${key}`); const src = held.get(key); held.delete(key); for (const s of feeds.values()) s.delete(src); return { ok: true }; },
    },
    output: {
      ports: PWM_PORTS,
      read: () => ({ rows: [...feeds].map(([port, s]) => ({ port, dir: 'in', connected: [...s] })), error: null }),
      cut() { trace.push('output.cut'); for (const s of feeds.values()) s.clear(); },
    },
  };
}

/** An engine as plaits.mjs and scollide.mjs answer: notes held while up, none once down. */
function fakeEngine(name, notes, trace) {
  const e = { up: true, notes };
  return { e, api: { name, up: () => e.up, held: () => (e.up ? e.notes : 0),
    panic() { trace.push(`${name}.panic`); e.notes = 0; },
    down() { trace.push(`${name}.down`); e.up = false; e.notes = 0; } } };
}

/** The whole board, playing: the sequencer into the Circuit, a key held on the MK-425C, the Circuit drums link,
 * a note a page started on the Circuit, Plaits and collide holding notes, drums linked to the PWM output. */
async function playingBoard() {
  const trace = [];
  const clock = fakeClock();
  const written = [];
  const fs = {
    readlinkSync: () => 'card9', openSync: () => 9, closeSync: noop,
    writeSync: (fd, buf) => { written.push([...buf]); return buf.length; },
    readSync: () => { const e = new Error('EAGAIN'); e.code = 'EAGAIN'; throw e; },
  };
  const inputs = createInputs({ inputs: INPUTS.inputs, room: 'studio-1', relay: 'ws://127.0.0.1:1', frame: 960, rate: 48000, name: 't', id: 't',
    spawn: () => { throw new Error('no spawn here'); }, WebSocket: class {}, format, parse, randomId, fs });
  const circuitIn = inputs.get('circuit');
  const midiSend = (bytes, refused) => circuitIn.handle({ type: 'midi.send', bytes }, (type, body) => { if (type === 'midi.refused') refused(body?.why || 'refused'); });
  const graph = () => graphOf(FACTS);

  const seq = createSequencerService({ graph, midiSend, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  await seq.handle({ type: 'seq.start', target: 'circuit', pattern: PATTERN }, noop);
  clock.run(1300);

  let keyH = null;
  const kbd = createKeyboardService({ graph, midiSend, present: () => true,
    open: (card, h) => { keyH = h; return { close: () => { keyH = null; } }; },
    setTimer: () => 0, clearTimer: noop });
  await kbd.handle({ type: 'kbd.link', channel: 1 }, noop);
  keyH?.data(Uint8Array.from([0x90, 60, 100]));

  let tapFn = null;
  const cdrums = createCircuitDrumsService({ graph, tap: (fn) => { tapFn = fn; return () => { tapFn = null; }; }, hit: () => ({ ok: true }) });
  await cdrums.handle({ type: 'cdrums.link' }, noop);

  // A page's own note on synth 2, through the Circuit's room: only the input's ledger knows it.
  midiSend([0x91, 64, 100], noop);

  const plaits = fakeEngine('plaits', 2, trace), collide = fakeEngine('collide', 3, trace);
  const jack = fakeJack(trace);
  jack.link(DRUMS_TO_PWM);
  jack.link(PLAITS_TO_PWM);
  jack.stray('fast:capture_1');

  const screens = [];
  const deps = {
    sequencer: { stop: () => { trace.push('seq.stop'); return seq.handle({ type: 'seq.stop' }, noop); }, running: () => seq.core.running() },
    keyboard: { release: () => { trace.push('kbd.release'); return kbd.handle({ type: 'kbd.unlink' }, noop); }, held: () => kbd.beat().held },
    circuitDrums: { release: () => { trace.push('cdrums.release'); return cdrums.handle({ type: 'cdrums.unlink' }, noop); }, held: () => cdrums.held() },
    circuit: {
      panic: () => { trace.push('circuit.panic'); let n = 0; circuitIn.handle({ type: 'midi.panic' }, (t, b) => { n = b?.n ?? 0; }); return n; },
      allOff: (ch) => { trace.push(`circuit.allOff ${ch}`); let why = ''; midiSend([0xB0 | (ch - 1), 123, 0], (w) => { why = w; }); return why; },
      held: () => circuitIn.status().midi.held,
    },
    engines: [plaits.api, collide.api],
    jack: jack.api,
    output: jack.output,
    screen: { stopped: (level) => { trace.push('screen'); screens.push(level); } },
  };
  return { deps, trace, written, screens, jack, plaits, collide, keyH: () => keyH, tapFn: () => tapFn, inputs };
}

const rowOf = (c, key) => c.rows.find((r) => r.key === key);
const redKeys = (c) => c.rows.filter((r) => r.ok === false).map((r) => r.key).sort().join(',');

console.log('\n== the board playing, before any stop: the check sees every thing that sounds ==');
{
  const b = await playingBoard();
  const m = createManager(b.deps);
  const c = m.check();
  ok('the sequencer row is red while it runs', rowOf(c, 'sequencer').ok === false);
  ok('the keyboard and Circuit drums rows are red while their links are held', rowOf(c, 'keyboard').ok === false && rowOf(c, 'circuitDrums').ok === false);
  ok('the JACK links row names both held links', rowOf(c, 'jackLinks').ok === false && [DRUMS_TO_PWM, PLAITS_TO_PWM].every((l) => rowOf(c, 'jackLinks').said.includes(l)));
  ok('the output row reads the graph, both PWM inputs fed', rowOf(c, 'output').ok === false && /pwm:playback_1 fed by .*pwm:playback_2 fed by/.test(rowOf(c, 'output').said), rowOf(c, 'output').said);
  ok('the Circuit row counts the notes the board started there', rowOf(c, 'circuitNotes').ok === false && b.inputs.get('circuit').status().midi.held >= 2,
    rowOf(c, 'circuitNotes').said);
  ok('Plaits and collide rows are red with their held counts', rowOf(c, 'plaitsNotes').said === '2 held' && rowOf(c, 'collideNotes').said === '3 held');
  ok('the engines row is red on a full check while engines run', rowOf(c, 'engines').ok === false);
  ok('nine rows, every one red, none unread, and the check says not ok', c.ok === false && c.rows.length === 9 && c.red === 9 && c.unread === 0, redKeys(c));
  ok('what the check cannot see is said in words', c.unseen.some((s) => /own pads or sequencer/.test(s)));
  m.check();
  ok('the check writes nothing: no step ran', b.trace.length === 0);
  b.inputs.close();
}

console.log('\n== a full stop, in order ==');
{
  const b = await playingBoard();
  const m = createManager(b.deps);
  const r = await m.stop({ level: 'full', asked: 'test' });
  ok('six steps, numbered in order', r.ok && r.steps.map((s) => s.n).join('') === '123456', r.steps.map((s) => s.key).join(' '));
  const at = (x) => b.trace.indexOf(x);
  ok('the sequencer stops before any link is let go', at('seq.stop') === 0 && at('seq.stop') < at('kbd.release'));
  ok('note sources go before any target is silenced', at('kbd.release') < at('plaits.panic') && at('cdrums.release') < at('plaits.panic') && at('cdrums.release') < at('circuit.panic'));
  ok('targets are silenced before any audio link is cut', at('collide.panic') < at(`jack.unlink ${DRUMS_TO_PWM}`) && at(`circuit.allOff ${CIRCUIT_ALL_OFF.at(-1)}`) < at(`jack.unlink ${DRUMS_TO_PWM}`));
  ok('both of the board\'s links are cut, then the output is swept', at(`jack.unlink ${DRUMS_TO_PWM}`) < at('output.cut') && at(`jack.unlink ${PLAITS_TO_PWM}`) < at('output.cut'));
  ok('engines go down only after every link is cut', at('output.cut') < at('plaits.down') && at('output.cut') < at('collide.down'));
  ok('the screen is last', b.trace.at(-1) === 'screen' && b.screens.join() === 'full');
  ok('CC 123 reached the Circuit on 1, 2 and 10 through its gate', [0xB0, 0xB1, 0xB9].every((st) => b.written.some((w) => w[0] === st && w[1] === 123)),
    JSON.stringify(r.steps[2].did?.allOffRefused));
  ok('the page\'s note on synth 2 got its note off', b.written.some((w) => w[0] === 0x81 && w[1] === 64));
  const c = m.check();
  ok('after a full stop every row is green', c.ok && c.red === 0 && c.unread === 0 && c.green === 9, redKeys(c));
  ok('a key held through the stop reads nothing: the keyboard is closed', b.keyH() === null);
  b.inputs.close();
}

console.log('\n== a silence: steps 1 to 4, the engines left warm ==');
{
  const b = await playingBoard();
  const m = createManager(b.deps);
  const r = await m.stop({ level: 'silence' });
  ok('four steps and no engine went down', r.steps.map((s) => s.n).join('') === '1234' && !b.trace.some((x) => /\.down$/.test(x)) && b.screens.length === 0);
  const c = m.check({ level: 'silence' });
  ok('after a silence every row is green, the engines said warm', c.ok && /warm.*plaits, collide/.test(rowOf(c, 'engines').said), redKeys(c));
  ok('NEGATIVE CONTROL: a full check after a silence is red on the engines row only', redKeys(m.check({ level: 'full' })) === 'engines');
  b.inputs.close();
}

console.log('\n== sabotage: each stop step skipped, the row it answers goes red ==');
const SABOTAGE = [
  { n: 1, level: 'silence', red: 'sequencer', cut: (d) => { d.sequencer.stop = noop; } },
  { n: 2, level: 'silence', red: 'circuitDrums,keyboard', cut: (d) => { d.keyboard.release = noop; d.circuitDrums.release = noop; } },
  { n: 3, level: 'silence', red: 'circuitNotes,collideNotes,plaitsNotes', cut: (d) => { d.circuit.panic = () => 0; d.circuit.allOff = () => ''; for (const e of d.engines) e.panic = noop; } },
  { n: 3, level: 'full', red: 'circuitNotes', cut: (d) => { d.circuit.panic = () => 0; d.circuit.allOff = () => ''; for (const e of d.engines) e.panic = noop; } },
  { n: 4, level: 'silence', red: 'jackLinks,output', cut: (d) => { d.jack.unlink = noop; d.output.cut = noop; } },
  { n: 5, level: 'full', red: 'engines', cut: (d) => { for (const e of d.engines) e.down = noop; } },
];
for (const s of SABOTAGE) {
  const b = await playingBoard();
  s.cut(b.deps);
  const m = createManager(b.deps);
  await m.stop({ level: s.level });
  const c = m.check({ level: s.level });
  ok(`NEGATIVE CONTROL: step ${s.n} (${STEPS[s.n - 1].key}) skipped on a ${s.level} stop, exactly ${s.red} red`, redKeys(c) === s.red, redKeys(c) || 'all green');
  b.inputs.close();
}
{
  const b = await playingBoard();
  b.deps.output.cut = noop;
  const m = createManager(b.deps);
  await m.stop({ level: 'silence' });
  const c = m.check({ level: 'silence' });
  ok('NEGATIVE CONTROL: the output row reads the graph, not the ledger: a stray feed left on the PWM is red while the links row is green',
    redKeys(c) === 'output' && rowOf(c, 'output').said.includes('fast:capture_1'), rowOf(c, 'output').said);
  b.inputs.close();
}
{
  const b = await playingBoard();
  b.deps.screen.stopped = noop;
  const m = createManager(b.deps);
  await m.stop({ level: 'full' });
  ok('step 6 has no row of its own: the screen is feedback, and a skipped one leaves the check green', m.check().ok && b.screens.length === 0);
  b.inputs.close();
}

console.log('\n== a stop is never refused, and a step that throws does not stop the rest ==');
{
  const b = await playingBoard();
  const m = createManager(b.deps);
  const bad = await m.stop({ level: 'loud' });
  ok('NEGATIVE CONTROL: an unknown level is refused in words and runs nothing', bad.ok === false && /silence or full/.test(bad.why) && b.trace.length === 0);
  const [one, two] = await Promise.all([m.stop({ level: 'silence', asked: 'a' }), m.stop({ level: 'full', asked: 'b' })]);
  ok('two stops at once both run, the second after the first', one.ok && two.ok && b.trace.indexOf('seq.stop') < b.trace.lastIndexOf('seq.stop')
    && b.trace.indexOf('jack.unlink ' + DRUMS_TO_PWM) < b.trace.lastIndexOf('seq.stop'));
  b.inputs.close();
}
{
  const b = await playingBoard();
  b.deps.sequencer.stop = () => { throw new Error('wedged'); };
  const m = createManager(b.deps);
  const r = await m.stop({ level: 'full' });
  ok('a step that throws is reported by name and the later steps still run', r.ok === false && r.steps[0].error === 'wedged' && r.steps.length === 6 && m.check().red === 1 && m.check().ok === false,
    redKeys(m.check()));
  b.inputs.close();
}

console.log('\n== a board with no Circuit and no PWM says so rather than reading green ==');
{
  const b = await playingBoard();
  const m = createManager({ ...b.deps, circuit: null, output: null });
  await m.stop({ level: 'full' });
  const c = m.check();
  ok('two rows unread, in words, and the rest green', c.ok && c.unread === 2 && /no Circuit input/.test(rowOf(c, 'circuitNotes').said) && /no PWM output/.test(rowOf(c, 'output').said));
  const g = { ...b.deps.output, read: () => ({ rows: [], error: 'jackd is not running, so there is no graph' }) };
  ok('NEGATIVE CONTROL: an unreadable graph is unread, not green', rowOf(createManager({ ...b.deps, output: g }).check(), 'output').ok === null);
  ok('the screen line says how many were green, or which were red', checkLines(c) === 'check 7 green\n2 unread'
    && checkLines({ ok: false, red: 2, rows: [{ ok: false, short: 'seq' }, { ok: true, short: 'x' }, { ok: false, short: 'pwm' }] }) === '2 red:\nseq pwm');
  b.inputs.close();
}

console.log('\n== the hold on * ==');
{
  let fired = 0;
  const h = createHold({ onFire: () => fired++ });
  ok('the hold is one second', HOLD_MS === 1000);
  h.down(0);
  ok('half way is a half full bar and nothing fired', h.tick(500) === 0.5 && fired === 0);
  ok('NEGATIVE CONTROL: 999 ms held does nothing, and the release fires nothing either', h.tick(999) < 1 && h.up(999).fired === false && fired === 0);
  h.down(2000);
  ok('1000 ms held fires once', h.tick(3000) === 1 && fired === 1);
  h.tick(3500); h.tick(4000);
  ok('NEGATIVE CONTROL: holding on does not fire again', fired === 1);
  const u = h.up(4100);
  ok('the release says it fired and how long it was held', u.fired === true && u.heldMs === 2100);
  h.down(5000); h.up(5600); h.down(5700);
  ok('NEGATIVE CONTROL: a release resets, so two short holds never add up', h.tick(6100) < 1 && fired === 1);
  h.up(6100);
  h.down(7000);
  ok('a release at exactly 1000 ms with no tick between still fires, once', h.up(8000).fired === true && fired === 2);
  ok('NEGATIVE CONTROL: a tick with no key down is nothing', h.tick(9000) === 0 && fired === 2);
}

console.log('\n== the bar on the screen while * is held (panel.mjs withBar) ==');
{
  const fb = new Uint8Array(1024); fb[7 * 128 + 100] = 0x01; fb[0] = 0xFF;
  const half = withBar(fb, 0.5);
  const lit = (f) => [...Array(128).keys()].filter((x) => (f[7 * 128 + x] & 0xC0) === 0xC0).length;
  ok('half a hold lights the bottom two rows across half the width', lit(half) === 64 && (half[7 * 128 + 63] & 0xC0) === 0xC0 && !(half[7 * 128 + 64] & 0xC0));
  ok('the rest of the frame is kept: a pixel under the bar and the top row', half[7 * 128 + 100] === 0x01 && half[0] === 0xFF);
  ok('NEGATIVE CONTROL: the mode\'s own frame is not written into', lit(fb) === 0);
  ok('no bar is the frame itself, and a full bar is every column', withBar(fb, null) === fb && lit(withBar(fb, 1)) === 128 && lit(withBar(fb, 7)) === 128);
}

console.log(`\n${pass}/${pass + fail} ${fail ? 'RED' : 'green'}`);
process.exit(fail ? 1 : 0);
