// node rig/board/test.mjs: everything the board does before touching a rig, against fixtures; real
// ports, real sound and boot are named in the README rather than faked.
// why: lessons/rig-board-tests.md#t-header
import { parseAconnect, addressable, resolve, plan, apply, listPorts, CARRY, sourcesOf } from './alsa.mjs';
import { parseJackLsp, jackChain, jackRebuild , setBayRows, jackdArgs, cardPortNames, jackdOwns, countXruns, JACKD_ENV, strayMidiSources } from './jacksynth.mjs';
import * as jack from './jack.mjs';
import { parseInputs, takeChannel, createByteOrder, leaseExpired, createInputs, midiVerdict, SYNTH_CC, padLightBytes } from './inputs.mjs';
import { CIRCUIT_CC } from '../../demo/shell/circuit-cc.mjs';
import { fresher, midiKey, MAX_PEERS, noteKey, fresherNote, createMainDirect } from './rtc.mjs';
import { helloMsg, aliveMsg, graphOf } from './beat.mjs';
import { graphProblem, createRegistry } from '../../demo/shell/graph-registry.mjs';
import { EventEmitter } from 'node:events';
import { constants as FS_C } from 'node:fs';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { keyRanges, pianoSfz, ensurePiano, PIANO_NOTES, RHODES_NOTES, RHODES_FILES, ensureRhodes,
         ensureSalamander, SALAMANDER_FILES } from './sampler.mjs';
import { createSamplerCore, startPlan, stopPlan, isForSampler, nearestIn, layerFor, rhodesLayerAt, velGain, SETS,
         PIANO_PEAK, RHODES_PEAK, scsynthArgs, SC_ENV, bandFor, pianoGain, releaseGain, PIANO_BANDS } from './scsampler.mjs';
import { setStandingRows, getStandingRows, pappusScsynthPids, SAMPLER_SC_PORT } from './jacksynth.mjs';
import { JACK_ENDS } from '../../demo/shell/graph-registry.mjs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const is = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${g}\n         want ${w}`); }
};
const ok = (name, cond, detail = '') => is(name, !!cond, true) || (detail && !cond && console.log(`         ${detail}`));

const text = readFileSync(new URL('./fixtures/aconnect-l.txt', import.meta.url), 'utf8');
const clients = parseAconnect(text);
const ports = addressable(clients);

console.log('parse');
is('client count', clients.length, 7);
is('System has two ports', clients[0].ports.length, 2);
is('Circuit is client 20', clients.find((c) => c.name === 'Circuit')?.id, 20);
is('card attribute read', clients.find((c) => c.name === 'Circuit')?.card, '1');
is('existing subscription read', clients.find((c) => c.name === 'Circuit').ports[0].to, ['24:0']);
is('reverse side read', clients.find((c) => c.name === 'MicroFreak').ports[0].from, ['20:0']);

console.log('addressable');
is('plumbing hidden', ports.some((p) => p.client === 'System' || p.client === 'Midi Through'), false);
is('five real ports', ports.length, 5);
is('virtual ports flagged', ports.filter((p) => p.virtual).length, 2);

console.log('naming');
is('by client name', resolve('circuit', ports).port?.addr, '20:0');
is('case does not matter', resolve('MICROFREAK', ports).port?.addr, '24:0');
is('by explicit address', resolve('28:0', ports).port?.addr, '28:0');
is('address that does not exist', resolve('99:0', ports).ok, false);
// Two VirMIDI clients match "virtual": reported, never picked.
// why: lessons/rig-board-tests.md#t-ambiguity
is('ambiguity is refused', resolve('virtual', ports).ok, false);
ok('ambiguity lists the candidates', (resolve('virtual', ports).candidates ?? []).length === 2);
is('unknown name', resolve('juno', ports).ok, false);
ok('unknown name suggests what IS here', (resolve('juno', ports).candidates ?? []).includes('Circuit'));

console.log('plan');
const full = (from, to, carry) => ({ v: 1, links: [{ from, to, ...(carry ? { carry } : {}) }] });
is('a new link plans a connect', plan(full('digitakt', 'microfreak'), ports).steps[0].action, 'connect');
is('planning changes nothing', resolve('digitakt', ports).port.to, []);
is('an existing link is noticed', plan(full('circuit', 'microfreak'), ports).steps[0].action, 'already connected');
is('missing name is a problem', plan(full('juno', 'microfreak'), ports).ok, false);
is('self-connection is a problem', plan(full('circuit', 'circuit'), ports).ok, false);
is('bad version is a problem', plan({ v: 9, links: [] }, ports).ok, false);
is('not an object', plan(null, ports).ok, false);

console.log('carry');
is('carry all is fine', plan(full('digitakt', 'microfreak', ['all']), ports).ok, true);
is('omitted carry means all', plan(full('digitakt', 'microfreak'), ports).steps[0].carry, ['all']);
is('a missing port list is said, not thrown', plan(full('a', 'b'), undefined).problems[0], 'no port list to resolve names against');
// The finding this file exists to pin down: an ALSA subscription cannot filter
// by message class, so a subset is REFUSED. If this ever starts passing as
// 'connect', something learned to filter and the comment in alsa.mjs is stale.
is('a subset is refused, not approximated', plan(full('circuit', 'digitakt', ['note']), ports).ok, false);
ok('and it says why', /cannot filter/.test(plan(full('circuit', 'digitakt', ['note']), ports).problems[0] ?? ''));
is('unknown carry name is a problem', plan(full('circuit', 'digitakt', ['notes']), ports).ok, false);
is('every carry name is known', CARRY.filter((c) => typeof c !== 'string').length, 0);
// One kind list with bay.mjs; old spellings must still be understood.
// why: lessons/rig-board-tests.md#t-carry
is('carry is the bay vocabulary', CARRY.join(','), 'note,cc,bend,touch,program,clock,transport,sysex');
ok('an old spelling is still a known kind, refused only for needing a filter',
  /cannot filter/.test(plan(full('circuit', 'digitakt', ['pitchbend']), ports).problems[0] ?? ''));
is('and the step reports the new name', plan(full('circuit', 'digitakt', ['aftertouch']), ports).steps[0].carry, ['touch']);
is('a misspelling of an alias is still unknown', /unknown carry/.test(plan(full('circuit', 'digitakt', ['pitch-bend']), ports).problems[0] ?? ''), true);

console.log('apply');
is('a broken plan applies nothing', apply(plan(full('juno', 'microfreak'), ports)).ran, []);
is('a clean plan is dry-runnable', apply(plan(full('digitakt', 'microfreak'), ports), { dry: true }).ran[0].result, 'dry');

console.log('backend');
// Explicitly the fixture: the live backend crashed this suite where aconnect exists without a
// sequencer.
// why: lessons/rig-board-tests.md#t-fixture
const fixed = listPorts({ fixture: true });
is('fixture backend', fixed.backend, 'fake');
is('fixture has no error', fixed.error, null);
ok('and it lists ports', fixed.clients.length > 0);

// The distinction the board exists to keep: a broken sequencer and an empty rig
// are BOTH zero ports, and they are not the same thing.
const live = listPorts();
ok(`live backend is ${live.backend}`, ['alsa', 'fake'].includes(live.backend));
if (live.backend === 'alsa' && live.error) {
  ok('a broken sequencer is reported, not thrown', typeof live.error === 'string', live.error);
  ok('and it says what to do', !!live.hint, live.hint ?? '');
} else {
  ok('live backend did not throw', true, live.error ? live.error : `${live.clients.length} clients`);
}

// The JACK audio graph (the Yoshimi section is in archive/yoshimi/test-half.mjs).
// why: lessons/rig-board-tests.md#t-jack-banner

// The parser and the chain, graded here: a dropped line reads as a healthy graph.
// why: lessons/rig-board-tests.md#t-jack
console.log('jack: the connection list');
const jackText = readFileSync(new URL('./fixtures/jack-lsp-c.txt', import.meta.url), 'utf8');
const jackRows = parseJackLsp(jackText);
is('every port is a row', jackRows.length, 7);
is('a port with no connections has none', jackRows.find((r) => r.port === 'system:capture_1').connected, []);
is('the capture names both sources', jackRows.find((r) => r.port === 'posboard:input_1').connected,
   ['yoshimi:left', 'yoshimi:right']);
is('an indented line is never a port', jackRows.some((r) => /^\s/.test(r.port)), false);

console.log('jack: what the chain should be');
const yosh = { instrumentPort: 'yoshimi:left', instrumentPortR: 'yoshimi:right' };
const graph = { graph: jackRows };
const dry = jackChain({ ...yosh, graph });
is('a healthy graph is intact', dry.intact, true);
is('and wants exactly two links', dry.want.length, 2);
is('with nothing missing', dry.missing, []);
is('and nothing extra', dry.extra, []);
is('the capture is on the graph', dry.capture.present, true);

// The NEGATIVE CONTROLS. Each one is a real failure this board has had, and
// without them `intact` could be hard-coded true and still read green.
const halfRows = parseJackLsp(jackText.replace(/^yoshimi:right\n   posboard:input_1\n/m, 'yoshimi:right\n')
                                      .replace('   yoshimi:right\n', ''));
const half = jackChain({ ...yosh, graph: { graph: halfRows } });
is('a missing right channel is not intact', half.intact, false);
is('and it is named', half.missing, [['yoshimi:right', 'posboard:input_1']]);
const strayRows = parseJackLsp(jackText.replace('posboard:input_1\n   yoshimi:left',
                                                'posboard:input_1\n   ghost:out_1\n   yoshimi:left'));
const stray = jackChain({ ...yosh, graph: { graph: strayRows } });
is('a stray source summed into the capture is not intact', stray.intact, false);
is('and it is named', stray.extra, [['ghost:out_1', 'posboard:input_1']]);
is('while nothing reads as missing', stray.missing, []);
const goneRows = parseJackLsp(jackText.replace(/^posboard:input_1\n(   .*\n)*/m, ''));
is('a capture that has gone is reported', jackChain({ ...yosh, graph: { graph: goneRows } }).capture.present, false);
is('nothing playing is not intact either', jackChain({ graph }).intact, false);

console.log('jack: a bay link is part of what the board believes (2026-10-11)');
// A bay link through setBayRows is wanted rather than cut; four asserts, two negative controls.
// why: lessons/rig-board-tests.md#t-ghost
const ghostRows = parseJackLsp(`ghost:out_1\n   posboard:input_1\n${jackText.replace('posboard:input_1\n   yoshimi:left',
                                                'posboard:input_1\n   ghost:out_1\n   yoshimi:left')}`);
setBayRows([{ from: 'ghost:out_1', to: 'posboard:input_1' }]);
const kept = jackChain({ ...yosh, graph: { graph: ghostRows } });
is('a source a bay link put into the capture is wanted, so the chain is intact', [kept.intact, kept.extra], [true, []]);
is('and it is one of the links a rebuild would make', kept.want.some(([f]) => f === 'ghost:out_1'), true);
setBayRows([{ from: 'SuperCollider:out_1', to: 'posboard:input_1' }]);
is('NEGATIVE CONTROL: a bay row whose port is not on the graph is skipped, not planned against nothing',
  jackChain({ ...yosh, graph }).want.length, 2);
setBayRows([]);
is('NEGATIVE CONTROL: with the bay link gone the same source is a stray again', jackChain({ ...yosh, graph: { graph: ghostRows } }).extra,
  [['ghost:out_1', 'posboard:input_1']]);

console.log('jack: the insert, and the material');
// With the granulator in, the instrument feeds IT and it feeds the capture,
// so the same healthy-looking graph above is wrong, which is the whole reason
// the chain is computed from the board's state rather than from the ports.
const ins = jackChain({ ...yosh, insert: true, graph });
is('the insert wants four links', ins.want.length, 4);
is('and the direct pair now reads as extra', ins.extra,
   [['yoshimi:left', 'posboard:input_1'], ['yoshimi:right', 'posboard:input_1']]);
// A rebuild must not plug the instrument back in under generated material.
// why: lessons/rig-board-tests.md#t-made
const made = jackChain({ ...yosh, insert: true, source: true, graph });
is('generated material leaves the instrument unplugged', made.want.length, 2);
ok('and never asks for it back',
   !made.want.some(([f]) => f.startsWith('yoshimi:')) && !made.missing.some(([f]) => f.startsWith('yoshimi:')));

console.log('jack: the repair, planned only');
// The granulator's four ports, added to the fixture: a plan against ports that
// are not on the graph is now refused rather than planned (jack.mjs).
const scText = jackText + 'SuperCollider:in_1\nSuperCollider:in_2\nSuperCollider:out_1\nSuperCollider:out_2\n';
const scGraph = { graph: parseJackLsp(scText) };
const planned = jackRebuild({ ...yosh, insert: true, plan: true, graph: scGraph });
is('with the granulator absent, an insert rebuild is refused and names the port',
   [jackRebuild({ ...yosh, insert: true, plan: true, graph }).ok,
    /SuperCollider:in_1 is not on the graph/.test(jackRebuild({ ...yosh, insert: true, plan: true, graph }).reason ?? '')], [false, true]);
is('a plan runs nothing', planned.changed, 0);
is('it disconnects before it connects', planned.steps.map((s) => s.act),
   ['disconnect', 'disconnect', 'connect', 'connect', 'connect', 'connect']);
ok('and every step is a patch, never a kill',
   planned.steps.every((s) => /^jack_(dis)?connect /.test(s.cmd)));
is('a healthy graph plans nothing at all', jackRebuild({ ...yosh, plan: true, graph }).steps.length, 0);
is('with no instrument there is nothing to rebuild', jackRebuild({ plan: true, graph }).ok, false);
is('a missing capture says which verbs raise it',
   /audio\.stop then audio\.start/.test(jackRebuild({ ...yosh, plan: true, graph: { graph: goneRows } }).reason ?? ''), true);

// jack.mjs against jack_lsp text read off the Pi; negative controls marked.
// why: lessons/rig-board-tests.md#t-jack-mjs
console.log('jack.mjs: the real board, parsed');
const piC = readFileSync(new URL('./fixtures/jack-lsp-c-pi.txt', import.meta.url), 'utf8');
const piCPT = readFileSync(new URL('./fixtures/jack-lsp-cpt-pi.txt', import.meta.url), 'utf8');
const piRows = jack.parseJackLsp(piC);
const piFull = jack.parseJackLsp(piCPT);
is('the board has eight ports', piRows.map((r) => r.port),
   ['system:capture_1', 'system:capture_2', 'system:playback_1', 'system:playback_2',
    'yoshimi:left', 'yoshimi:right', 'posboard:input_1', 'posboard:input_2']);
is('the capture is fed by both yoshimi channels, and only them', piRows.find((r) => r.port === 'posboard:input_1').connected,
   ['yoshimi:left', 'yoshimi:right']);
is('posboard:input_2 exists and nothing feeds it', piRows.find((r) => r.port === 'posboard:input_2').connected, []);
is('yoshimi also feeds the dummy playback', piRows.find((r) => r.port === 'yoshimi:left').connected,
   ['system:playback_1', 'posboard:input_1']);
is('-p -t gives the same ports and the same connections',
   piFull.map((r) => [r.port, r.connected]), piRows.map((r) => [r.port, r.connected]));
is('and a direction on every row', piFull.map((r) => r.dir), ['out', 'out', 'in', 'in', 'out', 'out', 'in', 'in']);
is('and a medium on every row', [...new Set(piFull.map((r) => r.medium))], ['audio']);
is('physical and terminal are read', [piFull[0].physical, piFull[0].terminal, piFull[4].physical], [true, true, false]);
// NEGATIVE CONTROL: jackd's complaint merged into stdout must not become a port.
const noisy = jack.parseJackLsp('Cannot lock down 107350048 byte memory area (Cannot allocate memory)\n' + piC);
is('NEGATIVE CONTROL: a merged stderr line is noise, not a port', [noisy.length, noisy.noise.length], [8, 1]);
// NEGATIVE CONTROL: a property line must not be read as a connection.
ok('NEGATIVE CONTROL: no property line is ever a connection',
   !piFull.some((r) => r.connected.some((c) => /properties|audio$/.test(c))));

console.log('jack.mjs: plan, against the real board');
const capDoc = { v: 1, links: [{ from: 'yoshimi:left', to: 'posboard:input_1' }, { from: 'yoshimi:right', to: 'posboard:input_1' }],
                 own: ['posboard:input_1'] };
const p0 = jack.plan(capDoc, piFull);
is('the board as it is plans zero steps', [p0.ok, p0.steps.length, p0.already], [true, 0, 2]);
is('and both checks were possible', p0.checked, { direction: true, type: true });
// NEGATIVE CONTROL: a plan that always answered "nothing to do" passes p0.
const monoDoc = { v: 1, links: [{ from: 'yoshimi:left', to: 'posboard:input_1' }], own: ['posboard:input_1'] };
is('NEGATIVE CONTROL: owning the capture with one channel cuts the other',
   jack.plan(monoDoc, piFull).steps.map((s) => [s.act, s.from, s.to]), [['disconnect', 'yoshimi:right', 'posboard:input_1']]);
is('without own, the same link only adds, and adds nothing here', jack.plan({ v: 1, links: monoDoc.links }, piFull).steps, []);
const toTwo = jack.plan({ v: 1, links: [{ from: 'yoshimi:left', to: 'posboard:input_2' }] }, piFull);
is('a missing link is one connect, with its command', toTwo.steps, [{ act: 'connect', from: 'yoshimi:left', to: 'posboard:input_2',
   cmd: 'jack_connect "yoshimi:left" "posboard:input_2"' }]);
is('disconnects come before connects', jack.plan({ v: 1, links: [{ from: 'yoshimi:left', to: 'posboard:input_2' }],
   own: ['posboard:input_1'] }, piFull).steps.map((s) => s.act), ['disconnect', 'disconnect', 'connect']);
// The refusals. Each is a REASON, asserted, because a plan that refuses
// everything is the same bug from the other side.
const why = (doc, rows = piFull) => jack.plan(doc, rows);
const refused = (name, doc, re, rows) => {
  const r = why(doc, rows);
  is(`refused: ${name}`, [r.ok, r.steps.length, r.problems.some((x) => re.test(x))], [false, 0, true]);
};
refused('an unknown version', { ...capDoc, v: 2 }, /unknown patch version 2/);
refused('no links array', { v: 1 }, /no links array/);
refused('a port not on the graph', { v: 1, links: [{ from: 'yoshimi:left', to: 'SuperCollider:in_1' }] }, /SuperCollider:in_1 is not on the graph/);
refused('a client named as if it were a port, with candidates', { v: 1, links: [{ from: 'yoshimi', to: 'posboard:input_1' }] },
  /yoshimi is a client, not a port.*yoshimi:left, yoshimi:right/);
refused('an input as a source', { v: 1, links: [{ from: 'posboard:input_1', to: 'system:playback_1' }] }, /posboard:input_1 is an input/);
refused('an output as a destination', { v: 1, links: [{ from: 'yoshimi:left', to: 'yoshimi:right' }] }, /yoshimi:right is an output/);
refused('a port to itself', { v: 1, links: [{ from: 'yoshimi:left', to: 'yoshimi:left' }] }, /to itself/);
refused('any carry, which is an ALSA word', { v: 1, links: [{ from: 'yoshimi:left', to: 'posboard:input_1', carry: ['all'] }] }, /carry is an ALSA word/);
refused('owning an output', { v: 1, links: [], own: ['yoshimi:left'] }, /only an input has a feed to own/);
const midiRows = jack.parseJackLsp(piCPT + 'a2j:Circuit (capture): Circuit MIDI 1\n\tproperties: output,physical,terminal,\n\t8 bit raw midi\n');
refused('MIDI into audio', { v: 1, links: [{ from: 'a2j:Circuit (capture): Circuit MIDI 1', to: 'posboard:input_1' }] }, /is midi and posboard:input_1 is audio/, midiRows);
// One bad link refuses the whole document: no half plan.
is('one bad link and nothing is planned for the good one',
   why({ v: 1, links: [{ from: 'yoshimi:left', to: 'posboard:input_2' }, { from: 'nope:x', to: 'posboard:input_1' }] }).steps, []);
// Bare `-c` text cannot check direction, and says so rather than claiming it.
is('from bare -c, direction and type are reported unchecked', jack.plan(capDoc, piRows).checked, { direction: false, type: false });
is('an owned input that is not on the graph is skipped, not refused',
   jack.plan({ ...capDoc, own: ['posboard:input_1', 'SuperCollider:in_1'] }, piFull).ok, true);
is('canonical: sorted, deduplicated, own sorted', jack.canonical({ v: 1,
   links: [{ from: 'b:1', to: 'c:1' }, { from: 'a:1', to: 'c:1' }, { from: 'b:1', to: 'c:1' }], own: ['z:1', 'c:1'] }),
   { v: 1, links: [{ from: 'a:1', to: 'c:1' }, { from: 'b:1', to: 'c:1' }], own: ['c:1', 'z:1'] });

console.log('jack.mjs: apply, read back, against a fake graph');
// A tiny JACK in memory: steps change it, `read` lists it. This grades the
// apply logic, not JACK; the real round trip is in the README's board notes.
const fakeJack = (text) => {
  const rows = jack.parseJackLsp(text).map((r) => ({ ...r, connected: [...r.connected] }));
  const at = (p) => rows.find((r) => r.port === p);
  return {
    read: () => rows.map((r) => ({ ...r, connected: [...r.connected] })),
    run: (s) => {
      const a = at(s.from), b = at(s.to);
      if (!a || !b) return `ERROR ${!a ? s.from : s.to} not a valid port`;
      if (s.act === 'connect') { if (b.connected.includes(s.from)) return 'cannot connect client, already connected?'; a.connected.push(s.to); b.connected.push(s.from); }
      else { a.connected = a.connected.filter((x) => x !== s.to); b.connected = b.connected.filter((x) => x !== s.from); }
      return null;
    },
  };
};
{
  const fj = fakeJack(piCPT);
  const r = jack.apply(jack.plan(monoDoc, fj.read()), fj);
  is('apply runs the step and the read back agrees', [r.ok, r.ran.length, r.after], [true, 1, { missing: [], extra: [], intact: true }]);
  is('and the graph really changed', fj.read().find((x) => x.port === 'posboard:input_1').connected, ['yoshimi:left']);
  const back = jack.apply(jack.plan(capDoc, fj.read()), fj);
  is('the stereo document puts it back', [back.ok, back.ran.map((s) => s.act)], [true, ['connect']]);
  // NEGATIVE CONTROL: a run that reports nothing and does nothing. An apply
  // that trusted the commands would answer ok here.
  const deaf = { read: fj.read, run: () => null };
  const lie = jack.apply(jack.plan(monoDoc, fj.read()), deaf);
  is('NEGATIVE CONTROL: commands that changed nothing are not ok', [lie.ok, lie.after.extra], [false, [['yoshimi:right', 'posboard:input_1']]]);
  // NEGATIVE CONTROL: a refused plan applies nothing at all.
  let calls = 0;
  const none = jack.apply(jack.plan({ v: 2, links: [] }, fj.read()), { run: () => { calls++; return null; }, read: fj.read });
  is('NEGATIVE CONTROL: a refused plan runs nothing', [none.ok, none.ran.length, calls], [false, 0, 0]);
  is('dry runs nothing and says so', jack.apply(jack.plan(monoDoc, fj.read()), { dry: true, run: () => { calls++; } }).ran.map((s) => s.result), ['dry']);
  is('and really ran nothing', calls, 0);
  // A step whose command printed something is kept with its text, and the
  // read back still decides. Here the link is there, so it is ok.
  const racy = fakeJack(piCPT);
  const pl = jack.plan({ v: 1, links: [{ from: 'yoshimi:left', to: 'posboard:input_2' }] }, racy.read());
  racy.run({ act: 'connect', from: 'yoshimi:left', to: 'posboard:input_2' });   // somebody else got there first
  const rr = jack.apply(pl, racy);
  is('"already connected" text is kept and is not a failure', [rr.ok, rr.ran[0].said], [true, 'cannot connect client, already connected?']);
}

console.log('jack: the board\'s own chain, through jack.mjs');
{
  const c = jackChain({ ...yosh, graph: { graph: piFull } });
  is('the real board, playing yoshimi with no insert, is intact', [c.intact, c.missing, c.extra], [true, [], []]);
  ok('and the chain carries the document it was read through', c.doc?.v === 1 && c.doc.own.includes('posboard:input_1'));
  is('the dummy playback is not the chain\'s business', c.extra.some(([, t]) => t.startsWith('system:')), false);
}

console.log('inputs: a name, a room and a lease');
{
  const good = parseInputs('{"circuit":{"device":"hw:CARD=Pro,DEV=0","channels":2,"take":1}}');
  is('a good entry is read whole', good.inputs.get('circuit'), { name: 'circuit', device: 'hw:CARD=Pro,DEV=0', channels: 2, take: 1, midi: null, via: 'arecord' });
  const bad = parseInputs('{"circuit":{"device":"hw:CARD=Pro,DEV=0","channels":2,"take":3},"Bad Name":{"device":"x"},"ok":{"device":"default"}}');
  is('a take past the channel count is refused', bad.inputs.has('circuit'), false);
  is('a name with spaces is refused', bad.inputs.has('Bad Name'), false);
  is('and a bad entry does not take the good one down', bad.inputs.has('ok'), true);
  is('each refusal says why', bad.problems.length, 2);
  is('nothing configured is no inputs, not an error', parseInputs('').problems.length, 0);
  is('not JSON is one reason, not a throw', parseInputs('circuit=hw:0').problems.length, 1);

  // Channel 1 is the Circuit and channel 2 is an open input with its gain up.
  const inter = Int16Array.from([100, 7, 200, 7, 300, 7]);
  is('it keeps the channel asked for', [...takeChannel(inter, 2, 1, 3)], [100, 200, 300]);
  // negative control: a downmix would read [53, 103, 153]
  ok('and never sums the open input in', takeChannel(inter, 2, 1, 3)[0] === 100);
  is('the other channel is reachable too', [...takeChannel(inter, 2, 2, 3)], [7, 7, 7]);

  // Stereo tones at the levels the Fast Track Pro sent big endian under S16_LE.
  // why: lessons/rig-board-tests.md#t-tone
  const tone = (amp, secs = 0.5) => {
    const n = 48000 * secs, a = new Int16Array(n * 2);
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 6;
    for (let i = 0; i < n; i++) {
      a[i * 2] = Math.round(amp * Math.sin(2 * Math.PI * 220 * i / 48000) + noise());
      a[i * 2 + 1] = Math.round(noise());
    }
    return a;
  };
  const swapped = (a) => new Int16Array(a.map((v) => ((v & 0xFF) << 8) | ((v >> 8) & 0xFF)));
  const feed = (a) => {
    const o = createByteOrder({ channels: 2 }), out = [];
    for (let i = 0; i < a.length; i += 960) out.push(...o.fix(a.slice(i, i + 960)));
    return { o, out };
  };
  for (const [name, amp] of [['a quiet Circuit', 18], ['a loud Circuit', 12000]]) {
    const good = tone(amp);
    // negative control: audio the right way round is never touched
    const le = feed(good);
    is(`${name} sent little endian is left alone`, le.o.swapped, false);
    const be = feed(swapped(good));
    is(`${name} sent big endian is found`, be.o.swapped, true);
    // once decided, the tail comes out as it went in
    const tail = good.length - 960;
    is(`${name} sent big endian plays as it went in`, be.out.slice(tail).join(), [...good.slice(tail)].join());
  }
  ok('digital silence decides nothing', !feed(new Int16Array(48000)).o.swapped);
  const q = tone(18, 0.3), said = [];
  const flipLog = createByteOrder({ channels: 2, onChange: (s) => said.push(s) });
  for (let i = 0; i < q.length; i += 960) flipLog.fix(swapped(q.slice(i, i + 960)));
  for (let i = 0; i < q.length; i += 960) flipLog.fix(q.slice(i, i + 960));
  is('a device that turns back is followed back, and each change is said once', said, [true, false]);

  is('a lease in the future holds', leaseExpired(10_000, 9_999), false);
  is('a lease at its end has run out', leaseExpired(10_000, 10_000), true);
  is('no lease at all is run out, not forever', leaseExpired(0, 1), true);
  is('an unset lease is run out, not NaN-true', leaseExpired(undefined, 1), true);

  // The live half against fakes: no relay, no ALSA.
  let t = 1_000;
  const spawned = [];
  const fakeSpawn = (cmd, args) => {
    const p = new EventEmitter();
    p.stdout = new EventEmitter(); p.stderr = new EventEmitter();
    p.kill = () => { p.killed = true; p.emit('exit', null); };
    spawned.push({ cmd, args, p });
    return p;
  };
  const sockets = [];
  class FakeWS { constructor(url) { this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); }
    send(x) { this.sent.push(x); } close() { this.readyState = 3; } }
  const fmt = (m, env) => JSON.stringify({ ...m, ...env });
  const prs = (x) => ({ kind: 'json', msg: JSON.parse(x) });
  const hw = createInputs({
    inputs: good.inputs, room: 'studio-1', relay: 'wss://relay', frame: 3, rate: 48000, name: 'pi', id: 'pi-1',
    spawn: fakeSpawn, WebSocket: FakeWS, format: fmt, parse: prs, randomId: () => 'abc', now: () => t,
    leaseMs: 60_000, beatMs: 5_000,
  });
  const c = hw.get('circuit');
  c.connect();
  is('an input joins a room of its own', sockets[0].url, 'wss://relay/room/studio-1-circuit/ws');
  is('and nothing is captured until somebody asks', spawned.length, 0);
  c.handle({ type: 'input.want', id: 'w1', device: 'hw:0' });
  is('asking starts arecord', spawned.length, 1);
  is('on the configured device, whatever the page sent', spawned[0].args[spawned[0].args.indexOf('-D') + 1], 'hw:CARD=Pro,DEV=0');
  is('at the configured channel count', spawned[0].args[spawned[0].args.indexOf('-c') + 1], '2');
  // negative control: ALSA's default was 6000 frames, 125 ms lumps
  // why: lessons/rig-board-tests.md#t-period
  is('with a 10 ms period, never the 125 ms default', spawned[0].args.includes('--period-size=480'), true);
  c.handle({ type: 'input.want', id: 'w2' });
  is('asking again renews rather than starting a second', spawned.length, 1);
  spawned[0].p.stdout.emit('data', Buffer.from(new Int16Array([100, 7, 200, 7, 300, 7]).buffer));
  const bin = sockets[0].sent.find((x) => Buffer.isBuffer(x));
  is('a frame goes out with one channel in it', bin && [...new Int16Array(bin.buffer.slice(bin.byteOffset + 12, bin.byteOffset + bin.length))], [100, 200, 300]);
  // The relay echoes every message to its sender; the watchdog lives on that.
  t += 59_000; c.s.lastHeard = t; c.beat();
  is('inside the lease it keeps running', !!c.s.proc, true);
  t += 2_000; c.s.lastHeard = t; c.beat();
  is('past the lease it stops by itself', !!c.s.proc, false);
  is('and the process was really killed', spawned[0].p.killed, true);
  c.handle({ type: 'audio.status', id: 's1' });
  const st = JSON.parse(sockets[0].sent.filter((x) => typeof x === 'string').at(-1));
  is('status in the input room says what is playing', [st.type, st.ok, st.source], ['audio.started', false, 'circuit']);
  hw.close();

  // An input on JACK: 14 asserts, 5 negative controls, on order and arguments; levels are measured
  // on the Pi.
  // why: lessons/rig-board-tests.md#t-input-jack
  const jc = parseInputs(JSON.stringify({ circuit: { device: 'hw:CARD=Pro,DEV=0', channels: 2, take: 1, via: 'jack' } }));
  is('via jack is read', jc.inputs.get('circuit')?.via, 'jack');
  is('NEGATIVE CONTROL: any other via is refused by name',
    /via is arecord or jack/.test(parseInputs(JSON.stringify({ c: { device: 'hw:0', via: 'pulse' } })).problems[0] ?? ''), true);
  spawned.length = 0; sockets.length = 0;
  const wired = [], timers = [];
  let ensured = 0;
  const jhw = createInputs({
    inputs: jc.inputs, room: 'studio-1', relay: 'wss://relay', frame: 4, rate: 48000, name: 'pi', id: 'pi-1',
    spawn: fakeSpawn, WebSocket: FakeWS, format: fmt, parse: prs, randomId: () => 'abc', now: () => t,
    leaseMs: 60_000, beatMs: 5_000, setTimer: (fn) => timers.push(fn),
    jack: { ensure: () => { ensured++; return { ok: true }; }, wire: (doc) => { wired.push(doc); return { ok: true }; } },
  });
  const jcirc = jhw.get('circuit');
  jcirc.connect(); jcirc.startBridge();
  await new Promise((r) => setImmediate(r));
  is('the bridge starts with nobody asking, after JACK was made sure of', [ensured, spawned.map((x) => x.cmd)], [1, ['alsa_in']]);
  const ai = spawned[0].args;
  is('alsa_in names the input as its JACK client, at the configured channel count',
    [ai[ai.indexOf('-j') + 1], ai[ai.indexOf('-c') + 1]], ['circuit', '2']);
  is('NEGATIVE CONTROL: through plughw, never the bare hw device that read 48 dB hot', ai[ai.indexOf('-d') + 1], 'plughw:CARD=Pro,DEV=0');
  is('NEGATIVE CONTROL: and no arecord, which would fight alsa_in for the card', spawned.some((x) => x.cmd === 'arecord'), false);
  jcirc.handle({ type: 'input.want', id: 'j1' });
  is('asking starts a JACK reader, not a second bridge', spawned.map((x) => x.cmd), ['alsa_in', 'ffmpeg']);
  const rd = spawned[1].args;
  is('the reader is a JACK client of its own, one channel', [rd[rd.indexOf('-i') + 1], rd[rd.indexOf('-channels') + 1]], ['poscircuit', '1']);
  timers.shift()();
  is('and it is fed the taken channel, owning its input so nothing else sums in',
    wired.at(-1), { v: 1, links: [{ from: 'circuit:capture_1', to: 'poscircuit:input_1' }], own: ['poscircuit:input_1'] });
  spawned[1].p.stdout.emit('data', Buffer.from(new Int16Array([1, 2, 3, 4]).buffer));
  const jbin = sockets[0].sent.find((x) => Buffer.isBuffer(x));
  is('a mono frame off JACK goes out untouched, no channel taken twice', jbin && [...new Int16Array(jbin.buffer.slice(jbin.byteOffset + 12, jbin.byteOffset + jbin.length))], [1, 2, 3, 4]);
  t += 61_000; jcirc.s.lastHeard = t; jcirc.beat();
  is('past the lease the reader stops', spawned[1].p.killed, true);
  is('NEGATIVE CONTROL: and the bridge does not, so a bay link through it keeps sounding', !!spawned[0].p.killed, false);
  spawned[0].p.emit('exit', 1);
  timers.at(-1)();
  await new Promise((r) => setImmediate(r));
  const second = spawned.filter((x) => x.cmd === 'alsa_in')[1];
  is('a bridge that dies is started again, not left gone', !!second && !second.p.killed, true);
  jhw.close();
  is('NEGATIVE CONTROL: closing the board does take the bridge down', !!second?.p.killed, true);

console.log('jackd on the card: the Circuit IS the clock, nothing resamples');
{
  // jackd on the card: config, server arguments, port names, bridge; cleanliness is measured on the
  // Pi.
  // why: lessons/rig-board-tests.md#t-jackd-card
  const one = parseInputs(JSON.stringify({ circuit: { device: 'hw:CARD=Pro,DEV=0', channels: 2, take: 1, via: 'jack', jackd: true } }));
  is('jackd: true is read with its defaults, the period measured clean under load', one.inputs.get('circuit')?.jackd, { period: 512, periods: 3 });
  is('jackd with a period is read as given',
    parseInputs(JSON.stringify({ c: { device: 'hw:0', via: 'jack', jackd: { period: 512, periods: 2 } } })).inputs.get('c')?.jackd, { period: 512, periods: 2 });
  is('NEGATIVE CONTROL: an input with no jackd key keeps the shape it always had',
    Object.keys(parseInputs(JSON.stringify({ c: { device: 'hw:0', via: 'jack' } })).inputs.get('c')), ['name', 'device', 'channels', 'take', 'midi', 'via']);
  is('NEGATIVE CONTROL: jackd on an arecord input is refused, the card cannot be both',
    /jackd needs via jack/.test(parseInputs(JSON.stringify({ c: { device: 'hw:0', jackd: true } })).problems[0] ?? ''), true);
  const two = parseInputs(JSON.stringify({ a: { device: 'hw:0', via: 'jack', jackd: true }, b: { device: 'hw:1', via: 'jack', jackd: true } }));
  is('NEGATIVE CONTROL: two inputs cannot both be the clock, there is one jackd', [two.inputs.has('a'), two.inputs.has('b'), /one jackd/.test(two.problems[0] ?? '')], [true, false, true]);
  is('NEGATIVE CONTROL: a period that is not a power of two is refused',
    /period/.test(parseInputs(JSON.stringify({ c: { device: 'hw:0', via: 'jack', jackd: { period: 300 } } })).problems[0] ?? ''), true);

  const card = { name: 'circuit', device: 'hw:CARD=Pro,DEV=0', channels: 2, period: 256, periods: 3 };
  is('jackd on the card is ALSA, capture only, at the card device, rate and period',
    jackdArgs(card), ['-r', '-d', 'alsa', '-C', 'hw:CARD=Pro,DEV=0', '-r', '48000', '-p', '256', '-n', '3']);
  const a = jackdArgs(card);
  is('NEGATIVE CONTROL: no playback device, so nothing new can come out of the Fast Track Pro',
    [a.includes('-P'), a.includes('-D'), a.includes('-d') && a[a.indexOf('-d') + 1] === 'alsa' && !a.includes('-o')], [false, false, true]);
  const duplex = { ...card, playback: true };
  is('with playback the same card is opened for its outputs too',
    jackdArgs(duplex), ['-r', '-d', 'alsa', '-C', 'hw:CARD=Pro,DEV=0', '-P', 'hw:CARD=Pro,DEV=0', '-r', '48000', '-p', '256', '-n', '3']);
  is('a capture only server is not the one a playback card asks for, so it is raised again',
    [jackdOwns('1234 jackd -r -d alsa -C hw:CARD=Pro,DEV=0 -r 48000 -p 512 -n 3', duplex),
     jackdOwns('1234 jackd -r -d alsa -C hw:CARD=Pro,DEV=0 -P hw:CARD=Pro,DEV=0 -r 48000 -p 512 -n 3', duplex)], [false, true]);
  is('playback is parsed from BOARD_INPUTS, and a wrong type is refused',
    [parseInputs('{"c":{"device":"hw:0","via":"jack","jackd":{"playback":true}}}').inputs.get('c').jackd.playback,
     /playback/.test(parseInputs('{"c":{"device":"hw:0","via":"jack","jackd":{"playback":"yes"}}}').problems[0] ?? '')], [true, true]);
  is('jackd skips the D-Bus card reservation a service has no session bus for', JACKD_ENV.JACK_NO_AUDIO_RESERVATION, '1');
  is('with no card it is the dummy clock it always was', jackdArgs(null), ['-r', '-d', 'dummy', '-r', '48000', '-p', '1024']);
  is('the card ports are shown by the input name', cardPortNames(card),
    { 'system:capture_1': 'circuit:capture_1', 'system:capture_2': 'circuit:capture_2' });
  is('NEGATIVE CONTROL: the dummy clock renames nothing', cardPortNames(null), {});
  is('a running jackd on the card is recognised from its command line',
    jackdOwns('1234 jackd -r -d alsa -C hw:CARD=Pro,DEV=0 -r 48000 -p 256 -n 3', card), true);
  is('NEGATIVE CONTROL: a dummy jackd does not own the card',
    jackdOwns('1234 jackd -r -d dummy -r 48000 -p 1024', card), false);
  is('NEGATIVE CONTROL: and ALSA on another card does not either',
    jackdOwns('1234 jackd -r -d alsa -C hw:CARD=Other,DEV=0 -r 48000', card), false);
  is('xruns are counted off jackd\'s own lines',
    countXruns('JackEngine::XRun: client = yoshimi was not finished, state = Triggered\nJack: **** alsa_pcm: xrun of at least 2.1 msecs\nCannot lock down 1 byte memory area'), 2);
  is('NEGATIVE CONTROL: ordinary chatter is not an xrun', countXruns('JackAlsaDriver::Open\nconfiguring for 48000Hz, period = 256 frames'), 0);

  // Yoshimi's instance edits are in archive/yoshimi/test-half.mjs.
  // why: lessons/rig-board-tests.md#t-yoshimi

  // Who feeds a client, off `aconnect -l`; the second listing is a Search subscription to the
  // Circuit.
  // why: lessons/rig-board-tests.md#t-seq
  const seqHead = "client 0: 'System' [type=kernel]\n    0 'Timer           '\n    1 'Announce        '\nclient 14: 'Midi Through' [type=kernel]\n    0 'Midi Through Port-0'\n"
    + "client 16: 'Virtual Raw MIDI 0-0' [type=kernel,card=0]\n    0 'VirMIDI 0-0     '\n\tConnecting To: 128:0\n"
    + "client 40: 'FastTrack Pro' [type=kernel,card=6]\n    0 'FastTrack Pro MIDI 1'\n"
    + "client 44: 'Circuit' [type=kernel,card=7]\n    0 'Circuit MIDI 1  '\n";
  const seqGood = seqHead + "client 128: 'yoshimi' [type=user,pid=4321]\n    0 'input           '\n\tConnected From: 16:0\n";
  const seqBad = seqHead + "client 128: 'yoshimi' [type=user,pid=4321]\n    0 'input           '\n\tConnected From: 14:0, 16:0, 40:0, 44:0[real:0]\n";
  is('the board\'s virmidi port is read as Yoshimi\'s source', sourcesOf(seqGood, /yoshimi/).map((s) => s.name), ['Virtual Raw MIDI 0-0']);
  is('with the board\'s port as its only source, there are no strays', strayMidiSources(seqGood, 128, 16), []);
  is('NEGATIVE CONTROL: the Circuit is never left in Yoshimi\'s subscriptions, it is named as a stray',
    strayMidiSources(seqBad, 128, 16).map((s) => s.name), ['Midi Through', 'FastTrack Pro', 'Circuit']);
  is('NEGATIVE CONTROL: and the stray carries the id aconnect -d needs, without the [real:0] suffix',
    strayMidiSources(seqBad, 128, 16).find((s) => s.name === 'Circuit')?.id, '44:0');
  is('NEGATIVE CONTROL: a client of another number is not Yoshimi, even fed by the Circuit',
    strayMidiSources(seqBad.replace("client 128: 'yoshimi'", "client 129: 'yoshimi'"), 128, 16), []);
  is('NEGATIVE CONTROL: with no virmidi, every source is a stray', strayMidiSources(seqGood, 128, null).map((s) => s.id), ['16:0']);

  // The rename, at jack.mjs's one boundary, against the real Pi listing.
  jack.setPortNames(cardPortNames(card));
  const renamed = jack.listJack({ text: piCPT }).rows;
  is('the listing shows the card capture by the input name', renamed.slice(0, 2).map((r) => r.port), ['circuit:capture_1', 'circuit:capture_2']);
  is('NEGATIVE CONTROL: playback is not renamed, it is not the input', renamed.some((r) => r.port === 'system:playback_1'), true);
  is('a connect turns the shown name back into the real one', [jack.realPort('circuit:capture_1'), jack.realPort('poscircuit:input_1')], ['system:capture_1', 'poscircuit:input_1']);
  is('NEGATIVE CONTROL: an exact map, so capture_10 is not capture_1', jack.shownPort('system:capture_10'), 'system:capture_10');
  jack.setPortNames({});
  is('NEGATIVE CONTROL: with no card the listing is untouched', jack.listJack({ text: piCPT }).rows[0].port, 'system:capture_1');

  // The input: no alsa_in when jackd owns its card, and the same reader.
  const sp = [], wd = [], tm = [];
  let t2 = 1000;
  const chw = createInputs({
    inputs: one.inputs, room: 'studio-1', relay: 'wss://relay', frame: 4, rate: 48000, name: 'pi', id: 'pi-1',
    spawn: (cmd, args) => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => { p.killed = true; }; sp.push({ cmd, args, p }); return p; },
    WebSocket: FakeWS, format: fmt, parse: prs, randomId: () => 'abc', now: () => t2,
    setTimer: (fn) => tm.push(fn),
    jack: { ensure: () => ({ ok: true, card: 'circuit' }), wire: (doc) => { wd.push(doc); return { ok: true }; } },
  });
  const cc = chw.get('circuit');
  cc.connect(); cc.startBridge();
  await new Promise((r) => setImmediate(r));
  is('NEGATIVE CONTROL: jackd owns the card, so no alsa_in and no arecord', sp.map((x) => x.cmd), []);
  cc.handle({ type: 'input.want', id: 'c1' });
  await new Promise((r) => setImmediate(r));
  is('asking still starts the one JACK reader', sp.map((x) => x.cmd), ['ffmpeg']);
  tm.shift()();
  is('and it is fed by the same name, which jack.mjs turns into system:capture_1',
    wd.at(-1), { v: 1, links: [{ from: 'circuit:capture_1', to: 'poscircuit:input_1' }], own: ['poscircuit:input_1'] });
  is('the status says the card is the clock', cc.status().jack && [cc.status().jack.bridge, cc.status().jack.by], [true, 'jackd']);
  chw.close();
}
}

console.log('inputs: what a page may send the Circuit');
{
  const CH = [1, 2, 10];
  is('a note on for synth 1 passes', midiVerdict([0x90, 60, 100], CH).ok, true);
  is('a note off for drums passes', midiVerdict([0x89, 60, 0], CH).ok, true);
  is('all notes off passes', midiVerdict([0xB1, 123, 0], CH).ok, true);
  // negative controls, each the shape that could hurt the instrument
  is('SysEx is refused, a Replace Patch writes flash', midiVerdict([0xF0, 0x00, 0x20], CH).ok, false);
  is('a program change padded to three bytes is refused', midiVerdict([0xC0, 5, 0], CH).ok, false);
  is('an ordinary controller is refused', midiVerdict([0xB0, 7, 100], CH).ok, false);
  is('CC 123 with a value is not all notes off', midiVerdict([0xB0, 123, 5], CH).ok, false);
  is('a note on channel 16, the session channel, is refused', midiVerdict([0x9F, 60, 100], CH).ok, false);
  is('a data byte past 127 is refused', midiVerdict([0x90, 200, 100], CH).ok, false);
  is('four bytes is refused', midiVerdict([0x90, 60, 100, 0], CH).ok, false);
  is('and the refusal says why', /channel 16/.test(midiVerdict([0x9F, 60, 100], CH).why), true);

  // Graded row by row against /shape/'s table, so a lost controller goes red here.
  // why: lessons/rig-board-tests.md#t-synth-cc
  const synthRows = CIRCUIT_CC.filter((p) => p.ch === '1/2');
  is('the synth allowlist is the 52 synth rows of the reference, no more', SYNTH_CC.size, 52);
  is('every synth control change /shape/ can send passes on channel 1 and on channel 2',
    synthRows.filter((p) => midiVerdict([0xB0, p.cc, 64], CH).ok && midiVerdict([0xB1, p.cc, 64], CH).ok).length, 52);
  is('the filter at both ends of its travel passes', [midiVerdict([0xB0, 74, 0], CH).ok, midiVerdict([0xB1, 74, 127], CH).ok], [true, true]);
  // negative controls, each one a class a gate that let every CC through would pass
  const notSynth = [...Array(128).keys()].filter((n) => !SYNTH_CC.has(n) && n !== 123);
  is('every other controller number is refused on a synth channel', notSynth.filter((n) => midiVerdict([0xB0, n, 0], CH).ok), []);
  is('bank select, CC 0 and 32, is refused', [midiVerdict([0xB0, 0, 1], CH).ok, midiVerdict([0xB0, 32, 1], CH).ok], [false, false]);
  is('NRPN and RPN, CC 98 to 101, and data entry, 6 and 38, are refused',
    [98, 99, 100, 101, 6, 38].map((n) => midiVerdict([0xB0, n, 1], CH).ok), [false, false, false, false, false, false]);
  is('all sound off, reset controllers, local off and omni, CC 120 to 127 but 123, are refused',
    [120, 121, 122, 124, 125, 126, 127].map((n) => midiVerdict([0xB0, n, 0], CH).ok), [false, false, false, false, false, false, false]);
  is('drum patch select, CC 8 on channel 10, is refused', midiVerdict([0xB9, 8, 3], CH).ok, false);
  is('a synth controller on the drum channel is refused', midiVerdict([0xB9, 74, 64], CH).ok, false);
  is('and on the session channel even if a config named it', midiVerdict([0xBF, 74, 64], [1, 2, 10, 16]).ok, false);
  is('a padded program change is refused on every channel', [0xC0, 0xC1, 0xC9, 0xCF].map((s) => midiVerdict([s, 5, 0], [1, 2, 10, 16]).ok), [false, false, false, false]);
  // A synth patch, 0 to 63 on channels 1 and 2 (plan-circuit-model12 §3.7).
  is('a synth patch change passes on 1 and 2, both ends of the bank',
    [[0xC0, 0], [0xC0, 63], [0xC1, 0], [0xC1, 63]].map((b) => midiVerdict(b, CH).ok), [true, true, true, true]);
  // negative controls: channel 16 selects a SESSION, instantly at 0 to 31
  is('a program change on the session channel is refused even if a config named it',
    [0, 5, 31, 64, 95].map((n) => midiVerdict([0xCF, n], [1, 2, 10, 16]).ok), [false, false, false, false, false]);
  is('a program change on the drum channel is refused', midiVerdict([0xC9, 5], CH).ok, false);
  is('64 and up is not a synth patch', [64, 95, 127].map((n) => midiVerdict([0xC0, n], CH).ok), [false, false, false]);
  is('a program change on a channel this input does not play is refused', midiVerdict([0xC1, 5], [1, 10]).ok, false);
  is('a data byte past 127 in a program change is refused', midiVerdict([0xC0, 200], CH).ok, false);
  is('and two bytes of anything else is refused', [[0x90, 60], [0xB0, 74], [0xD0, 64]].map((b) => midiVerdict(b, CH).ok), [false, false, false]);
  is('pitch bend and aftertouch are refused', [0xE0, 0xD0, 0xA0].map((s) => midiVerdict([s, 0, 64], CH).ok), [false, false, false]);
  is('and each refusal names its kind in the bay vocabulary', [[0xE0, 0, 64], [0xD0, 0, 64], [0xF0, 0, 0x20], [0xFA]].map((b) => midiVerdict(b, CH).kind), ['bend', 'touch', 'sysex', 'transport']);
  is('a pass carries no kind field, so nothing reads one as a refusal', midiVerdict([0x90, 60, 100], CH).kind, undefined);
  is('and a synth controller refusal on the drums says why', /not a synth/.test(midiVerdict([0xB9, 74, 64], CH).why), true);

  // The Current Patch Dump Request, matched byte for byte; each negative control differs in one
  // place.
  // why: lessons/rig-board-tests.md#t-dump-request
  const REQ = (loc) => [0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x40, loc, 0xF7];
  is('the dump request for synth 1 passes, and says which synth', midiVerdict(REQ(0), CH), { ok: true, dump: 0 });
  is('the dump request for synth 2 passes', midiVerdict(REQ(1), CH), { ok: true, dump: 1 });
  is('byte 6 of the request is 0x40, read before it is trusted', REQ(0)[6], 0x40);
  is('NEGATIVE: the same nine bytes with command 00, Replace Current Patch, are refused', midiVerdict([...REQ(0).slice(0, 6), 0x00, 0, 0xF7], CH).ok, false);
  is('NEGATIVE: the same nine bytes with command 01, Replace Patch, are refused', midiVerdict([...REQ(0).slice(0, 6), 0x01, 0, 0xF7], CH).ok, false);
  is('NEGATIVE: every command byte but 40 is refused in the request shape',
    [...Array(256).keys()].filter((c) => c !== 0x40 && midiVerdict([...REQ(0).slice(0, 6), c, 0, 0xF7], CH).ok), []);
  {
    // A whole 350 byte Replace Current Patch and Replace Patch, as a page could send them.
    const big = (cmd) => [0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, cmd, 0, 0, ...Array(340).fill(0x20), 0xF7];
    is('NEGATIVE: a 350 byte Replace Current Patch is refused', midiVerdict(big(0x00), CH).ok, false);
    is('NEGATIVE: a 350 byte Replace Patch, the one that writes flash, is refused', midiVerdict(big(0x01), CH).ok, false);
    is('NEGATIVE: a 350 byte message wearing command 40 is refused', midiVerdict(big(0x40), CH).ok, false);
  }
  is('NEGATIVE: eight bytes, the location missing, is refused', midiVerdict([0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x40, 0xF7], CH).ok, false);
  is('NEGATIVE: ten bytes, a trailing 00 as one editor sends it, is refused', midiVerdict([0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x40, 0, 0, 0xF7], CH).ok, false);
  is('NEGATIVE: the request with anything after F7 is refused', midiVerdict([...REQ(0), 0x90], CH).ok, false);
  is('NEGATIVE: a wrong byte anywhere in the header is refused, manufacturer, product type and product number',
    [1, 2, 3, 4, 5].filter((i) => { const b = REQ(0); b[i] = (b[i] + 1) & 0x7F; return midiVerdict(b, CH).ok; }), []);
  is('NEGATIVE: a Circuit Mono Station or another Novation product number is refused', [0x61, 0x62, 0x63, 0x64].map((p) => { const b = REQ(0); b[5] = p; return midiVerdict(b, CH).ok; }), [false, false, false, false]);
  is('NEGATIVE: a location that is not synth 1 or 2 is refused', [2, 0x0F, 0x7F, 0x80].map((l) => midiVerdict(REQ(l), CH).ok), [false, false, false, false]);
  is('NEGATIVE: no end of sysex is refused', midiVerdict([...REQ(0).slice(0, 8), 0x00], CH).ok, false);
  is('NEGATIVE: a request whose synth channel this input does not play is refused', midiVerdict(REQ(1), [1, 10]).ok, false);
  is('NEGATIVE: another universal SysEx, GM System On, is still refused', midiVerdict([0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7], CH).ok, false);
  // The Device Inquiry, all call (7F) only.
  // why: lessons/rig-board-tests.md#t-inquiry
  const INQ = [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7];
  is('the Device Inquiry passes, and says so', midiVerdict(INQ, CH), { ok: true, identity: true });
  is('NEGATIVE: five bytes of it, the F7 missing, is refused', midiVerdict(INQ.slice(0, 5), CH).ok, false);
  is('NEGATIVE: seven bytes of it, anything after F7, is refused', midiVerdict([...INQ, 0x00], CH).ok, false);
  is('NEGATIVE: seven bytes with a byte inside, is refused', midiVerdict([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0x00, 0xF7], CH).ok, false);
  is('NEGATIVE: sub id 06 02, the REPLY, never goes out', midiVerdict([0xF0, 0x7E, 0x7F, 0x06, 0x02, 0xF7], CH).ok, false);
  is('NEGATIVE: every other sub id 2 under 06 is refused', [...Array(128).keys()].filter((n) => n !== 0x01 && midiVerdict([0xF0, 0x7E, 0x7F, 0x06, n, 0xF7], CH).ok), []);
  is('NEGATIVE: every other sub id 1 is refused', [...Array(128).keys()].filter((n) => n !== 0x06 && midiVerdict([0xF0, 0x7E, 0x7F, n, 0x01, 0xF7], CH).ok), []);
  is('NEGATIVE: a device id other than 7F is refused, 00 included', [0x00, 0x01, 0x10, 0x7E].map((n) => midiVerdict([0xF0, 0x7E, n, 0x06, 0x01, 0xF7], CH).ok), [false, false, false, false]);
  is('NEGATIVE: real time universal 7F in place of 7E is refused', midiVerdict([0xF0, 0x7F, 0x7F, 0x06, 0x01, 0xF7], CH).ok, false);
  is('NEGATIVE: and the dump request is not mistaken for it, nor it for the dump request', [midiVerdict(REQ(0), CH).identity, midiVerdict(INQ, CH).dump], [undefined, undefined]);
  // The one LED write stock 3592 answers; the Circuit does not bound the LED, so the gate does.
  // why: lessons/rig-board.md#pad-light
  is('a pad light passes, and says so', midiVerdict(padLightBytes(0, 63, 0, 0), CH), { ok: true, light: true });
  is('the last LED, 68, and black pass', [midiVerdict(padLightBytes(68, 0, 0, 0), CH).ok, midiVerdict(padLightBytes(12, 63, 63, 63), CH).ok], [true, true]);
  is('NEGATIVE: LED 69 and up are refused, the Circuit would write past its array', [69, 70, 100, 127].map((l) => midiVerdict(padLightBytes(l, 1, 1, 1), CH).ok), [false, false, false, false]);
  is('NEGATIVE: a colour over 63 is refused, in each of r, g and b', [[64, 0, 0], [0, 64, 0], [0, 0, 127]].map(([r, g, b]) => midiVerdict(padLightBytes(1, r, g, b), CH).ok), [false, false, false]);
  is('NEGATIVE: the commands beside it, 70 to 73 and 75, are refused', [0x70, 0x71, 0x72, 0x73, 0x75].map((c) => { const m = padLightBytes(1, 1, 1, 1); m[6] = c; return midiVerdict(m, CH).ok; }), [false, false, false, false, false]);
  is('NEGATIVE: one byte short or one long is refused', [midiVerdict(padLightBytes(1, 1, 1, 1).filter((_, i) => i !== 10), CH).ok, midiVerdict([...padLightBytes(1, 1, 1, 1).slice(0, 11), 0, 0xF7], CH).ok], [false, false]);
  is('NEGATIVE: a 350 byte Replace Patch with its command byte turned into 74 is refused', midiVerdict([0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x74, ...Array(342).fill(0), 0xF7], CH).ok, false);
  is('and a refusal of the request shape names it sysex', midiVerdict([...REQ(0).slice(0, 6), 0x01, 0, 0xF7], CH).kind, 'sysex');

  const cfg = parseInputs('{"circuit":{"device":"hw:CARD=Pro,DEV=0","channels":2,"take":1,"midi":{"port":"Circuit","channels":[1,2,10]}}}');
  is('a midi port is read from config', cfg.inputs.get('circuit').midi, { port: 'Circuit', channels: [1, 2, 10] });
  is('a midi port that is a path is refused', parseInputs('{"c":{"device":"x","midi":{"port":"/dev/snd/midiC0D0","channels":[1]}}}').inputs.has('c'), false);

  let t = 0; const writes = []; const opened = [];
  const flags = [];
  const fakeFs = { readlinkSync: () => 'card7', openSync: (pth, fl) => { opened.push(pth); flags.push(fl); return 42; },
    writeSync: (fd, buf) => writes.push([...buf]), closeSync: () => {} };
  const sock = [];
  class WS { constructor() { this.readyState = 1; this.sent = []; sock.push(this); } send(x) { this.sent.push(x); } close() { this.readyState = 3; } }
  const hw = createInputs({ inputs: cfg.inputs, room: 'r', relay: 'wss://x', frame: 3, rate: 48000, name: 'pi', id: 'pi',
    spawn: () => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => p.emit('exit'); return p; },
    WebSocket: WS, format: (m, e) => JSON.stringify({ ...m, ...e }), parse: (x) => ({ kind: 'json', msg: JSON.parse(x) }),
    randomId: () => 'x', now: () => t, fs: fakeFs, leaseMs: 60_000, beatMs: 5_000 });
  const c = hw.get('circuit'); c.connect();
  c.handle({ type: 'midi.send', id: 'a', bytes: [0x90, 60, 100] });
  is('a note reaches the port the card name resolves to', opened, ['/dev/snd/midiC7D0']);
  is('with exactly the bytes sent', writes, [[0x90, 60, 100]]);
  // Asserted on the open flags, so a revert to a blocking 'w' goes red.
  // why: lessons/rig-board-tests.md#t-nonblock
  is('the raw device is opened write only and non-blocking', flags[0], FS_C.O_WRONLY | FS_C.O_NONBLOCK);
  c.handle({ type: 'midi.send', id: 'b', bytes: [0xF0, 0x7E, 0x7F] });
  is('SysEx never reaches the port', writes.length, 1);
  const refusedMsg = JSON.parse(sock[0].sent.filter((x) => typeof x === 'string').at(-1));
  is('and the page is told it was refused', refusedMsg.type, 'midi.refused');
  c.handle({ type: 'input.want', id: 'w' });
  t += 61_000; c.s.lastHeard = t; c.beat();
  is('when the lease runs out, a note left held is released', writes.at(-1), [0x80, 60, 0]);
  is('and nothing is left held', c.s.held.size, 0);
  {
    // Negative control: a busy device is a logged failure, never a throw or a hang.
    // why: lessons/rig-board-tests.md#t-busy
    const lines = [];
    const busyFs = { readlinkSync: () => 'card7', openSync: () => { const e = new Error('EBUSY: resource busy or locked'); e.code = 'EBUSY'; throw e; },
      writeSync: () => { throw new Error('never reached'); }, closeSync: () => {} };
    const hw2 = createInputs({ inputs: cfg.inputs, room: 'r', relay: 'wss://x', frame: 3, rate: 48000, name: 'pi', id: 'pi',
      spawn: () => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => p.emit('exit'); return p; },
      WebSocket: WS, format: (m, e) => JSON.stringify({ ...m, ...e }), parse: (x) => ({ kind: 'json', msg: JSON.parse(x) }),
      randomId: () => 'x', now: () => t, fs: busyFs, leaseMs: 60_000, beatMs: 5_000, log: (l) => lines.push(l) });
    const c2 = hw2.get('circuit'); c2.connect();
    let threw = false;
    try { c2.handle({ type: 'midi.send', id: 'z', bytes: [0x90, 60, 100] }); } catch { threw = true; }
    is('a busy device does not throw out of the handler', threw, false);
    ok('and the log names it', lines.some((l) => /midi write failed, EBUSY/.test(l)));
  }
  // A control change under a held note must not forget the note, or the lease's
  // panic leaves it sounding. Only CC 123 lets go.
  c.handle({ type: 'input.want', id: 'w2' });
  c.handle({ type: 'midi.send', id: 'n', bytes: [0x90, 64, 100] });
  c.handle({ type: 'midi.send', id: 'f', bytes: [0xB0, 74, 20] });
  is('a filter move reaches the port', writes.at(-1), [0xB0, 74, 20]);
  is('and the note under it is still known to be held', c.s.held.size, 1);
  c.handle({ type: 'midi.send', id: 'p', bytes: [0xC0, 3, 0] });
  is('a program change never reaches the port', writes.at(-1), [0xB0, 74, 20]);
  t += 61_000; c.s.lastHeard = t; c.beat();
  is('so the lease still releases it', writes.at(-1), [0x80, 64, 0]);
  hw.close();

  // ── the dump request out, the patch back, against a fake raw MIDI input ────
  {
    let t2 = 0;
    const out = [], order = [], inbox = [], timers = [];
    let readFd = null, readClosed = 0;
    const EAGAIN = () => { const e = new Error('EAGAIN: resource temporarily unavailable'); e.code = 'EAGAIN'; return e; };
    const dumpFs = {
      readlinkSync: () => 'card7',
      openSync: (pth, fl) => { order.push(fl === (FS_C.O_RDONLY | FS_C.O_NONBLOCK) ? 'open read' : 'open write'); if (fl === (FS_C.O_RDONLY | FS_C.O_NONBLOCK)) { readFd = 77; return 77; } return 42; },
      writeSync: (fd, buf) => { order.push('write'); out.push([...buf]); },
      readSync: (fd, buf) => { if (fd !== 77) throw new Error('read on the wrong fd'); if (order.at(-1) === 'open read') order.push('read'); const c = inbox.shift(); if (!c) throw EAGAIN(); buf.set(c); return c.length; },
      closeSync: (fd) => { if (fd === 77) readClosed++; },
    };
    const sock2 = [];
    class WS2 { constructor() { this.readyState = 1; this.sent = []; sock2.push(this); } send(x) { this.sent.push(x); } close() { this.readyState = 3; } }
    const hw3 = createInputs({ inputs: cfg.inputs, room: 'r', relay: 'wss://x', frame: 3, rate: 48000, name: 'pi', id: 'pi',
      spawn: () => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => p.emit('exit'); return p; },
      WebSocket: WS2, format: (m, e) => JSON.stringify({ ...m, ...e }), parse: (x) => ({ kind: 'json', msg: JSON.parse(x) }),
      randomId: () => 'x', now: () => t2, fs: dumpFs, leaseMs: 60_000, beatMs: 5_000, setTimer: (fn, ms) => timers.push([t2 + ms, fn]) });
    const run = (ms) => { const until = t2 + ms; while (timers.length) { timers.sort((a, b) => a[0] - b[0]); if (timers[0][0] > until) break; const [at, fn] = timers.shift(); t2 = at; fn(); } t2 = until; };
    const last = () => JSON.parse(sock2[0].sent.filter((x) => typeof x === 'string').at(-1));
    const sentOf = (type) => sock2[0].sent.filter((x) => typeof x === 'string').map((x) => JSON.parse(x)).filter((m) => m.type === type);
    // A reply as the Circuit sends it. This is a FIXTURE fed to the fake input
    // only; the asserts below check it is never written to the instrument port.
    const reply = (loc, name = 'Soft pad') => [0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x00, loc, 0x00,
      ...[...name.padEnd(16, ' ')].map((ch) => ch.charCodeAt(0)), ...Array(324).fill(0x10), 0xF7];
    const c3 = hw3.get('circuit'); c3.connect();

    c3.handle({ type: 'midi.send', id: 'd1', bytes: REQ(0) });
    is('the input is opened AND read once BEFORE the request is written, so the answer cannot arrive first', order, ['open read', 'read', 'open write', 'write']);
    is('the request reaches the port, exactly nine bytes', out, [REQ(0)]);
    // The answer arrives in pieces with MIDI clock inside it, as USB MIDI does.
    const r1 = reply(0);
    inbox.push(Uint8Array.from([0xF8, ...r1.slice(0, 100)]), Uint8Array.from([0xF8, 0xFE, ...r1.slice(100)]));
    run(50);
    const got = sentOf('midi.patch');
    is('one midi.patch goes back to the room', got.length, 1);
    is('carrying the 350 bytes the Circuit sent, clock bytes taken out', got[0]?.bytes, r1);
    is('answering the request by its id, for synth 1', [got[0]?.re, got[0]?.synth, got[0]?.ok], ['d1', 1, true]);
    is('and the reader is closed once it has its answer', readClosed, 1);
    is('NEGATIVE: the reply is never written to the instrument', out.filter((b) => b.length > 9), []);

    // A second ask while one is open is refused, and nothing is written for it.
    t2 += 100;
    c3.handle({ type: 'midi.send', id: 'd2', bytes: REQ(0) });
    c3.handle({ type: 'midi.send', id: 'd3', bytes: REQ(0) });
    is('NEGATIVE: a second request while one is being read is not written', out.length, 2);
    is('and is answered that it was not', [last().type, last().ok, last().re], ['midi.patch', false, 'd3']);
    // The wrong synth, and a SysEx that is not a patch, are not passed back.
    inbox.push(Uint8Array.from(reply(1)), Uint8Array.from([0xF0, 0x7E, 0x00, 0x06, 0x02, 0xF7]));
    run(1100);
    const after = sentOf('midi.patch').filter((m) => m.re === 'd2');
    is('NEGATIVE: a patch for synth 2 does not answer a request for synth 1', after.map((m) => m.ok), [false]);
    ok('and the timeout says why', /no patch came back/.test(after[0]?.why ?? ''), JSON.stringify(after[0]));
    is('NEGATIVE: and nothing that was not asked for reaches the room', after[0]?.bytes ?? null, null);
    is('the reader is closed after the timeout too', readClosed, 2);

    // A program change then a request, the page's order, for synth 2.
    t2 += 100;
    c3.handle({ type: 'midi.send', id: 'p2', bytes: [0xC1, 5] });
    c3.handle({ type: 'midi.send', id: 'd4', bytes: REQ(1) });
    inbox.push(Uint8Array.from(reply(1, 'Bass two')));
    run(50);
    is('synth 2 is answered for synth 2', sentOf('midi.patch').filter((m) => m.re === 'd4').map((m) => [m.ok, m.synth, m.bytes?.length]), [[true, 2, 350]]);
    is('NEGATIVE: across the whole run only the three requests and one program change were written', out.map((b) => b[0]), [0xF0, 0xF0, 0xC1, 0xF0]);

    // The Device Inquiry, out and back, under the same one at a time rule.
    t2 += 100;
    const ID_REPLY = [0xF0, 0x7E, 0x00, 0x06, 0x02, 0x00, 0x20, 0x29, 0x01, 0x00, 0x60, 0x00, 0x00, 0x01, 0x08, 0x00, 0xF7];
    c3.handle({ type: 'midi.send', id: 'i1', bytes: INQ });
    is('the inquiry reaches the port, exactly six bytes', out.at(-1), INQ);
    c3.handle({ type: 'midi.send', id: 'd5', bytes: REQ(0) });
    is('NEGATIVE: a dump request while the inquiry is open is not written', out.at(-1), INQ);
    inbox.push(Uint8Array.from([0xF8, 0xF0, 0x7E, 0x00, 0x06, 0x02, 0x41, 0x00, 0x00, 0xF7]), Uint8Array.from([0xF8, ...ID_REPLY]));
    run(50);
    const ids = sentOf('midi.identity');
    is('one midi.identity goes back, answering the inquiry', ids.map((m) => [m.re, m.ok]), [['i1', true]]);
    is('carrying the Novation reply, not the Roland one before it', ids[0]?.bytes, ID_REPLY);
    is('NEGATIVE: the identity reply is never written to the instrument', out.filter((b) => b.length > 9), []);
    // And silence is said in words.
    t2 += 100;
    c3.handle({ type: 'midi.send', id: 'i2', bytes: INQ });
    run(1100);
    const none = sentOf('midi.identity').filter((m) => m.re === 'i2');
    is('NEGATIVE: an inquiry nobody answers is reported as not answered', none.map((m) => [m.ok, m.bytes ?? null]), [[false, null]]);
    ok('and says why', /no identity came back/.test(none[0]?.why ?? ''), JSON.stringify(none[0]));
    hw3.close();
  }

  // A fake that drops input until it is read, as snd-usb-audio does; without the pre-read these go
  // red.
  // why: lessons/rig-board-tests.md#t-trigger
  {
    let t4 = 0, triggered = false;
    const inbox = [], timers = [], out = [];
    const ID_REPLY = [0xF0, 0x7E, 0x00, 0x06, 0x02, 0x00, 0x20, 0x29, 0x79, 0x00, 0x00, 0x00, 0x03, 0x05, 0x09, 0x02, 0xF7];
    const EAGAIN = () => { const e = new Error('EAGAIN: resource temporarily unavailable'); e.code = 'EAGAIN'; return e; };
    const kFs = {
      readlinkSync: () => 'card7',
      openSync: (pth, fl) => { if (fl === (FS_C.O_RDONLY | FS_C.O_NONBLOCK)) { triggered = false; inbox.length = 0; return 77; } return 42; },
      writeSync: (fd, buf) => {
        out.push([...buf]);
        const b = [...buf];
        // the instrument answers the inquiry at once, and only the inquiry
        if (b.length === 6 && b[0] === 0xF0 && b[3] === 0x06 && b[4] === 0x01 && triggered) inbox.push(Uint8Array.from([0xF8, ...ID_REPLY]));
      },
      readSync: (fd, buf) => { if (fd !== 77) throw new Error('read on the wrong fd'); triggered = true; const c = inbox.shift(); if (!c) throw EAGAIN(); buf.set(c); return c.length; },
      closeSync: () => {},
    };
    const sock4 = [];
    class WS4 { constructor() { this.readyState = 1; this.sent = []; sock4.push(this); } send(x) { this.sent.push(x); } close() { this.readyState = 3; } }
    const hw4 = createInputs({ inputs: cfg.inputs, room: 'r', relay: 'wss://x', frame: 3, rate: 48000, name: 'pi', id: 'pi',
      spawn: () => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => p.emit('exit'); return p; },
      WebSocket: WS4, format: (m, e) => JSON.stringify({ ...m, ...e }), parse: (x) => ({ kind: 'json', msg: JSON.parse(x) }),
      randomId: () => 'x', now: () => t4, fs: kFs, leaseMs: 60_000, beatMs: 5_000, setTimer: (fn, ms) => timers.push([t4 + ms, fn]) });
    const run = (ms) => { const until = t4 + ms; while (timers.length) { timers.sort((a, b) => a[0] - b[0]); if (timers[0][0] > until) break; const [at, fn] = timers.shift(); t4 = at; fn(); } t4 = until; };
    const sentOf = (type) => sock4[0].sent.filter((x) => typeof x === 'string').map((x) => JSON.parse(x)).filter((m) => m.type === type);
    const c4 = hw4.get('circuit'); c4.connect();
    c4.handle({ type: 'midi.send', id: 'k1', bytes: INQ });
    is('the input was triggered before the inquiry went out, so a fast answer is kept', triggered, true);
    run(50);
    const ids = sentOf('midi.identity');
    is('an identity that comes back AT the write is read back', ids.map((m) => [m.re, m.ok]), [['k1', true]]);
    is('carrying the 17 bytes the Circuit sent on 2026-10-11', ids[0]?.bytes, ID_REPLY);
    // Bytes waiting in the input before the question are not its answer: a
    // whole patch for synth 1 sits there (a FIXTURE fed to the fake input only).
    t4 += 1100; run(0);
    const stale = kFs.openSync; kFs.openSync = (pth, fl) => { const fd = stale(pth, fl); if (fd === 77) inbox.push(Uint8Array.from([0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x00, 0x00, 0x00, ...[...'Old pad'.padEnd(16, ' ')].map((ch) => ch.charCodeAt(0)), ...Array(324).fill(0x10), 0xF7])); return fd; };
    c4.handle({ type: 'midi.send', id: 'k2', bytes: REQ(0) });
    run(1100);
    const p = sentOf('midi.patch').filter((m) => m.re === 'k2');
    is('NEGATIVE: what was waiting before the request is drained, not taken as the answer', p.map((m) => [m.ok, m.bytes ?? null]), [[false, null]]);
    is('NEGATIVE: only the inquiry and the dump request were written', out.map((b) => b.length), [6, 9]);
    hw4.close();
  }
}

console.log('\nrtc: the direct path, against a fake peer');
{
  // ── the reorder guard, pure ────────────────────────────────────────────────
  const last = new Map();
  is('a note on is keyed by channel and note', midiKey([0x90, 60, 100]), '0:n:60');
  is('and its note off shares the key', midiKey([0x80, 60, 0]), '0:n:60');
  is('a numbered note on applies', fresher(last, [0x90, 60, 100], 1), true);
  is('its note off, numbered after, applies', fresher(last, [0x80, 60, 0], 2), true);
  // negative control: the reorder an unordered channel can deliver
  const r = new Map();
  is('a note off that overtook its note on applies', fresher(r, [0x80, 64, 0], 2), true);
  is('and the late note on is refused, so nothing sticks', fresher(r, [0x90, 64, 100], 1), false);
  is('another note is not held back by it', fresher(r, [0x90, 65, 100], 1), true);
  is('an unnumbered message from an older page applies', fresher(r, [0x90, 64, 100], undefined), true);
  is('a stale filter value is refused too', [fresher(r, [0xB0, 74, 90], 9), fresher(r, [0xB0, 74, 10], 8)], [true, false]);

  // ── the live half ──────────────────────────────────────────────────────────
  const pcs = [];
  class FakeDC {
    constructor(label) { this.label = label; this.out = []; this.open = true; this.backlog = 0; }
    getLabel() { return this.label; } isOpen() { return this.open; } bufferedAmount() { return this.backlog; }
    sendMessage(x) { this.out.push(JSON.parse(x)); } sendMessageBinary(b) { this.out.push(b); }
    onMessage(f) { this.recv = f; } close() { this.open = false; } onClosed(f) { this.closedCb = f; }
  }
  class FakePC {
    constructor(name, cfg) { this.name = name; this.cfg = cfg; this.cands = []; this.closed = false; pcs.push(this); }
    onLocalDescription(f) { this.ld = f; } onLocalCandidate(f) { this.lc = f; }
    onStateChange(f) { this.sc = f; } onDataChannel(f) { this.dcf = f; }
    setRemoteDescription(sdp, kind) { this.remote = [sdp, kind]; this.ld('v=0 answer', 'answer'); this.lc('candidate:1 1 UDP 1 192.168.0.20 5000 typ host', '0'); }
    addRemoteCandidate(c, mid) { this.cands.push([c, mid]); }
    close() { this.closed = true; }
    // what the page's two createDataChannel calls look like from here
    channels() { const pcm = new FakeDC('pcm'), ctl = new FakeDC('ctl'); this.dcf(pcm); this.dcf(ctl); return { pcm, ctl }; }
  }
  let t = 0; const writes = [];
  const fakeFs = { readlinkSync: () => 'card7', openSync: () => 42, writeSync: (fd, b) => writes.push([...b]), closeSync: () => {} };
  const spawned = [];
  const sock = [];
  class WS { constructor() { this.readyState = 1; this.sent = []; sock.push(this); } send(x) { this.sent.push(x); } close() { this.readyState = 3; } }
  const cfg = parseInputs('{"circuit":{"device":"hw:CARD=Pro,DEV=0","channels":2,"take":1,"midi":{"port":"Circuit","channels":[1,2,10]}}}');
  // A camera room that records what it is asked, for the cam channel below.
  const camAsked = [], camGone = [];
  const fakeCamera = { attachDirect: (a) => { camAsked.push(a); return a.key === 'K' ? { ok: true } : { ok: false, why: 'no' }; },
    detachDirect: (id, why) => { camGone.push([id, why]); return true; } };
  const mk = (PeerConnection) => createInputs({ camera: fakeCamera, inputs: cfg.inputs, room: 'r', relay: 'wss://x', frame: 4, rate: 200, name: 'pi', id: 'pi',
    spawn: () => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => p.emit('exit'); spawned.push(p); return p; },
    WebSocket: WS, format: (m, e) => JSON.stringify({ ...m, ...e }), parse: (x) => ({ kind: 'json', msg: JSON.parse(x) }),
    randomId: () => 'x', now: () => t, fs: fakeFs, leaseMs: 60_000, beatMs: 5_000, PeerConnection });
  const relayOut = (w) => w.sent.filter((x) => typeof x === 'string').map((x) => JSON.parse(x));

  // a board with no library answers, rather than leaving a page waiting
  const bare = mk(null); const b = bare.get('circuit'); b.connect(); sock[0].onopen();
  is('a board with no library says so in its hello', relayOut(sock[0]).find((m) => m.type === 'board.hello').direct, false);
  sock[0].onmessage({ data: JSON.stringify({ type: 'rtc.offer', peer: 'page1', sdp: 'v=0', from: 'p' }) });
  is('and refuses an offer out loud', relayOut(sock[0]).at(-1).type, 'rtc.refused');
  bare.close();

  const hw = mk(FakePC); const c = hw.get('circuit'); c.connect();
  const ws = sock[1]; ws.onopen();
  is('a board with the library says so in its hello', relayOut(ws).find((m) => m.type === 'board.hello').direct, true);
  ws.onmessage({ data: JSON.stringify({ type: 'rtc.offer', peer: 'page1', sdp: 'v=0 offer', from: 'p' }) });
  is('an offer makes a peer', pcs.length, 1);
  is('with a STUN server, so a board off the LAN has a public candidate', pcs[0].cfg.iceServers.some((x) => x.startsWith('stun:')), true);
  const ans = relayOut(ws).find((m) => m.type === 'rtc.answer');
  is('the answer goes back into the room, addressed to that peer', [ans?.peer, ans?.sdp], ['page1', 'v=0 answer']);
  is('and so does the board\'s candidate', relayOut(ws).some((m) => m.type === 'rtc.candidate' && m.peer === 'page1'), true);
  ws.onmessage({ data: JSON.stringify({ type: 'rtc.candidate', peer: 'page1', cand: 'candidate:9 1 udp 1 x.local 1 typ host', mid: '0', from: 'p' }) });
  is('the page\'s candidate reaches its peer', pcs[0].cands.length, 1);
  ws.onmessage({ data: JSON.stringify({ type: 'rtc.candidate', peer: 'other', cand: 'candidate:9', mid: '0', from: 'q' }) });
  is('a candidate for nobody here is ignored', pcs[0].cands.length, 1);

  const { pcm, ctl } = pcs[0].channels();
  is('ctl opens with the frame length on this path', [ctl.out[0].type, ctl.out[0].frameMs], ['rtc.hello', 10]);
  const before = relayOut(ws).length;
  ctl.recv(JSON.stringify({ type: 'midi.send', id: 'a', n: 1, bytes: [0x90, 60, 100] }));
  is('a note over ctl reaches the instrument', writes.at(-1), [0x90, 60, 100]);
  ctl.recv(JSON.stringify({ type: 'midi.send', id: 'b', n: 2, bytes: [0xF0, 0x7E, 0x7F] }));
  // negative control for the gate: the same message over the relay is refused too, above
  is('SysEx over ctl never reaches the instrument', writes.length, 1);
  is('and the refusal comes back on ctl', ctl.out.at(-1).type, 'midi.refused');
  is('not into the relay room', relayOut(ws).length, before);
  ctl.recv(JSON.stringify({ type: 'midi.send', id: 'c', n: 4, bytes: [0x80, 62, 0] }));
  ctl.recv(JSON.stringify({ type: 'midi.send', id: 'd', n: 3, bytes: [0x90, 62, 100] }));
  is('a note on that arrives after its own note off is dropped', writes.some((w) => w[0] === 0x90 && w[1] === 62), false);
  ctl.recv(JSON.stringify({ type: 'rtc.offer', peer: 'sneaky', sdp: 'v=0' }));
  is('ctl cannot open another peer', pcs.length, 1);
  ctl.recv(JSON.stringify({ type: 'input.want', id: 'w' }));
  is('input.want over ctl starts the capture', spawned.length, 1);
  is('and answers on ctl', ctl.out.at(-1).type, 'input.wanted');

  // The Pi camera on the same link.
  // why: lessons/rig-board-tests.md#t-camera
  ctl.recv(JSON.stringify({ type: 'rtc.ping', id: 'pp', t: 5 }));
  is('a pong carries the board\'s wall clock, for the page\'s clock offset', [ctl.out.at(-1).type, typeof ctl.out.at(-1).at], ['rtc.pong', 'number']);
  const relayBefore = relayOut(ws).length;
  ws.onmessage({ data: JSON.stringify({ type: 'cam.direct', id: 'cr', key: 'K', viewer: 'v1', from: 'p' }) });
  is('NEGATIVE CONTROL: cam.direct through the relay room is refused without asking the camera', [camAsked.length, relayOut(ws).at(-1)?.type, relayOut(ws).at(-1)?.ok], [0, 'cam.direct', false]);
  ctl.recv(JSON.stringify({ type: 'cam.direct', id: 'c0', key: 'K', viewer: 'v1' }));
  is('cam.direct with no cam channel is not refused at once (the ask can overtake its channel)', ctl.out.at(-1).type === 'cam.direct', false);
  await new Promise((r) => setTimeout(r, 650));
  is('but after half a second with none it says so, and to try again', [camAsked.length, ctl.out.at(-1).type, ctl.out.at(-1).ok, ctl.out.at(-1).retry], [0, 'cam.direct', false, true]);
  const cam = new FakeDC('cam');
  pcs[0].dcf(cam);
  is('a cam channel is held, not closed', cam.open, true);
  const stray = new FakeDC('junk'); pcs[0].dcf(stray);
  is('NEGATIVE CONTROL: a channel nobody listed is still closed', stray.open, false);
  ctl.recv(JSON.stringify({ type: 'cam.direct', id: 'c1', key: 'K', viewer: 'v1' }));
  is('cam.direct over ctl asks the camera, with the key, the viewer and this peer', [camAsked[0]?.id, camAsked[0]?.viewer, camAsked[0]?.key], ['circuit:page1', 'v1', 'K']);
  is('and its answer goes back on ctl', [ctl.out.at(-1).type, ctl.out.at(-1).ok, ctl.out.at(-1).re], ['cam.direct', true, 'c1']);
  camAsked[0].sink.send(Buffer.from([1, 2]));
  is('the sink the camera gets writes on the cam channel', cam.out.length, 1);
  cam.closedCb();
  is('the cam channel closing detaches it', camGone.at(-1)?.[0], 'circuit:page1');
  // The ask arrived before the channel did, on the Pi.
  // why: lessons/rig-board-tests.md#t-overtake
  ctl.recv(JSON.stringify({ type: 'cam.direct', id: 'c2', key: 'K', viewer: 'v1' }));
  const cam2 = new FakeDC('cam');
  setTimeout(() => pcs[0].dcf(cam2), 60);
  await new Promise((r) => setTimeout(r, 150));
  is('an ask that overtook its channel waits for it and attaches', [camAsked.length, ctl.out.at(-1).re, ctl.out.at(-1).ok], [2, 'c2', true]);
  cam2.closedCb();
  is('nothing about the camera reached the relay room but the one refusal', relayOut(ws).length, relayBefore + 1);

  // frame 4 at 200 Hz: 20 ms a frame and a 10 ms unit, as on the board
  const frame = (a) => spawned[0].stdout.emit('data', Buffer.from(new Int16Array(a.flatMap((x) => [x, 7])).buffer));
  frame([1, 2]);
  const bins = () => pcm.out.filter((x) => Buffer.isBuffer(x));
  const relayBins = () => ws.sent.filter((x) => Buffer.isBuffer(x));
  is('half a frame goes direct as soon as it exists', bins().length, 1);
  is('and the relay waits for the whole frame', relayBins().length, 0);
  frame([3, 4]);
  is('the relay gets its whole frame from two halves', [...new Int16Array(relayBins()[0].buffer.slice(relayBins()[0].byteOffset + 12, relayBins()[0].byteOffset + relayBins()[0].length))], [1, 2, 3, 4]);
  const d = bins()[1];
  is('a direct frame carries one channel, the same 12 byte header', [d.readUInt32LE(0), ...new Int16Array(d.buffer.slice(d.byteOffset + 12, d.byteOffset + d.length))], [1, 3, 4]);
  pcm.backlog = 1 << 20; frame([5, 6]);
  is('a peer that is not draining loses the frame rather than queueing it', bins().length, 2);
  pcm.backlog = 0;

  // a second peer asking for 20 ms frames gets whole frames
  ws.onmessage({ data: JSON.stringify({ type: 'rtc.offer', peer: 'page2', sdp: 'v=0', frameMs: 20, from: 'q' }) });
  const two = pcs[1].channels();
  is('a page may ask for the longer frame', two.ctl.out[0].frameMs, 20);

  // the cap
  for (const k of [3, 4]) ws.onmessage({ data: JSON.stringify({ type: 'rtc.offer', peer: `page${k}`, sdp: 'v=0', from: 'q' }) });
  ws.onmessage({ data: JSON.stringify({ type: 'rtc.offer', peer: 'page5', sdp: 'v=0', from: 'q' }) });
  is(`a peer past ${MAX_PEERS} is refused and told to use the relay`, [pcs.length, relayOut(ws).at(-1).type], [MAX_PEERS, 'rtc.refused']);

  // a held note from a peer that goes quiet
  ctl.recv(JSON.stringify({ type: 'midi.send', id: 'e', n: 5, bytes: [0x91, 67, 100] }));
  c.handle({ type: 'midi.send', id: 'r', bytes: [0x92, 70, 100] });   // somebody on the relay
  c.handle({ type: 'input.want', id: 'w' });
  t += 61_000; c.s.lastHeard = t; two.ctl.recv(JSON.stringify({ type: 'rtc.ping', id: 'k', t: 1 }));
  c.handle({ type: 'input.want', id: 'w2' });
  c.beat();
  is('a peer silent for a minute is closed', pcs[0].closed, true);
  is('and its camera link, if any, is detached', camGone.some(([id, why]) => id === 'circuit:page1' && /direct link/.test(why)), true);
  is('the peer that kept talking stays', pcs[1].closed, false);
  is('the quiet peer\'s held note is released', writes.some((w) => w[0] === 0x81 && w[1] === 67), true);
  is('and nobody else\'s is', writes.some((w) => w[0] === 0x82 && w[1] === 70), false);
  hw.close();
  is('closing the board closes every peer', pcs.every((p) => p.closed), true);
}

console.log('\nrtc: the MAIN socket\'s direct path (studio-1, the synth capture)');
{
  // The main socket's direct path, which once had no handler.
  // why: lessons/rig-board-tests.md#t-main
  is('a main socket note is keyed by node, channel and note', noteKey({ type: 'note.on', node: 'sampler', note: 60 }), 'sampler:0:60');
  is('a Yoshimi note has no node', noteKey({ type: 'note.off', channel: 2, note: 61 }), ':2:61');
  is('anything else has no key', noteKey({ type: 'voice.select', program: 1 }), null);
  const nl = new Map();
  is('a note off that overtook its note on applies', fresherNote(nl, { type: 'note.off', node: 'sampler', note: 64, n: 2 }), true);
  is('NEGATIVE CONTROL: and the late note on is refused', fresherNote(nl, { type: 'note.on', node: 'sampler', note: 64, n: 1 }), false);
  is('the same note on another node is not held back', fresherNote(nl, { type: 'note.on', note: 64, n: 1 }), true);
  is('an unnumbered note from an older page applies', fresherNote(nl, { type: 'note.on', node: 'sampler', note: 64 }), true);

  const pcs = [];
  class FakeDC {
    constructor(label) { this.label = label; this.out = []; this.open = true; this.backlog = 0; }
    getLabel() { return this.label; } isOpen() { return this.open; } bufferedAmount() { return this.backlog; }
    sendMessage(x) { this.out.push(JSON.parse(x)); } sendMessageBinary(b) { this.out.push(b); }
    onMessage(f) { this.recv = f; } close() { this.open = false; }
  }
  class FakePC {
    constructor(name, cfg) { this.name = name; this.cfg = cfg; this.cands = []; this.closed = false; pcs.push(this); }
    onLocalDescription(f) { this.ld = f; } onLocalCandidate(f) { this.lc = f; }
    onStateChange(f) { this.sc = f; } onDataChannel(f) { this.dcf = f; }
    setRemoteDescription(sdp, kind) { this.remote = [sdp, kind]; this.ld('v=0 answer', 'answer'); this.lc('candidate:1 1 UDP 1 192.168.0.20 5000 typ host', '0'); }
    addRemoteCandidate(c, mid) { this.cands.push([c, mid]); }
    close() { this.closed = true; }
    channels() { const pcm = new FakeDC('pcm'), ctl = new FakeDC('ctl'); this.dcf(pcm); this.dcf(ctl); return { pcm, ctl }; }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  let t = 0;
  // The board's handler as far as these verbs go: what it was asked, and its
  // answer through whichever reply it was handed.
  const asked = [];
  const handle = async (m, reply) => {
    asked.push(m);
    if (m.type === 'boom') throw new Error('kaboom');
    if (m.type === 'note.on' || m.type === 'note.off') return reply('note.ack', { note: m.note, ...(m.node ? { node: m.node } : {}) });
    if (m.type === 'voice.select') return reply('voice.selected', { ok: true, node: m.node, program: m.program });
  };

  // a board with no library answers out loud, rather than leaving a page waiting
  const bareOut = [];
  const bare = createMainDirect({ PeerConnection: null, signal: (m) => bareOut.push(m), handle, frame: 960, rate: 48000 });
  is('a main socket with no library says direct false', bare.direct, false);
  is('an offer to it is the direct path\'s business', bare.signalling({ type: 'rtc.offer', peer: 'page1', sdp: 'v=0' }), true);
  is('and is refused out loud, addressed to that peer', [bareOut.at(-1)?.type, bareOut.at(-1)?.peer], ['rtc.refused', 'page1']);
  is('anything else is left to the handler', bare.signalling({ type: 'note.on', note: 60 }), false);

  const out = [];
  const md = createMainDirect({ PeerConnection: FakePC, signal: (m) => out.push(m), handle, frame: 960, rate: 48000, now: () => t });
  is('a main socket with the library says direct true', md.direct, true);
  md.signalling({ type: 'rtc.offer', peer: 'page1', sdp: 'v=0 offer', frameMs: 10 });
  is('an offer in studio-1 makes a peer', pcs.length, 1);
  const ans = out.find((m) => m.type === 'rtc.answer');
  is('the answer goes back into the room, addressed to that peer', [ans?.peer, ans?.sdp], ['page1', 'v=0 answer']);
  md.signalling({ type: 'rtc.candidate', peer: 'page1', cand: 'candidate:9 1 udp 1 x.local 1 typ host', mid: '0' });
  is('the page\'s candidate reaches its peer', pcs[0].cands.length, 1);

  const { pcm, ctl } = pcs[0].channels();
  is('ctl opens with 10 ms, one channel, 48 kHz', [ctl.out[0].type, ctl.out[0].frameMs, ctl.out[0].audioChannels, ctl.out[0].rate], ['rtc.hello', 10, 1, 48000]);
  ctl.recv(JSON.stringify({ type: 'note.on', id: 'a', n: 1, node: 'sampler', note: 60, vel: 90 }));
  await tick();
  is('a sampler note over ctl reaches the main handler unchanged', [asked.at(-1)?.type, asked.at(-1)?.node, asked.at(-1)?.note], ['note.on', 'sampler', 60]);
  is('and is answered on ctl, with the question\'s id', [ctl.out.at(-1).type, ctl.out.at(-1).re, ctl.out.at(-1).node], ['note.ack', 'a', 'sampler']);
  is('not into the relay room', out.some((m) => m.type === 'note.ack'), false);
  ctl.recv(JSON.stringify({ type: 'voice.select', id: 'v', node: 'sampler', program: 1 }));
  await tick();
  is('voice.select over ctl is answered on ctl', [ctl.out.at(-1).type, ctl.out.at(-1).re], ['voice.selected', 'v']);
  ctl.recv(JSON.stringify({ type: 'note.off', id: 'b', n: 3, channel: 0, note: 62 }));
  ctl.recv(JSON.stringify({ type: 'note.on', id: 'c', n: 2, channel: 0, note: 62, vel: 100 }));
  await tick();
  is('a Yoshimi note on that arrives after its own note off is dropped', asked.some((m) => m.type === 'note.on' && m.note === 62), false);
  ctl.recv(JSON.stringify({ type: 'boom', id: 'x' }));
  await tick(); await tick();
  is('a handler that throws is answered on ctl, never left unhandled', [ctl.out.at(-1).type, ctl.out.at(-1).re, ctl.out.at(-1).error], ['board.error', 'x', 'kaboom']);
  ctl.recv(JSON.stringify({ type: 'rtc.offer', peer: 'sneaky', sdp: 'v=0' }));
  is('ctl cannot open another peer', pcs.length, 1);

  // 48 kHz, 960 a relay frame, so 480 a unit
  const unit = (v) => new Int16Array(480).fill(v);
  md.unit(unit(5));
  const bins = () => pcm.out.filter((x) => Buffer.isBuffer(x));
  is('a 10 ms unit off the JACK capture reaches the peer at once', bins().length, 1);
  const b0 = bins()[0];
  is('with the same 12 byte header and 480 mono samples', [b0.length, b0.readUInt32LE(0), b0.readInt16LE(12)], [12 + 960, 0, 5]);
  const whole = new Int16Array(960); whole.fill(1, 0, 480); whole.fill(2, 480);
  md.frame(whole);
  is('a whole 20 ms frame from a pipe source goes as two units', [bins().length, bins()[1].readInt16LE(12), bins()[2].readInt16LE(12), bins()[2].readUInt32LE(0)], [3, 1, 2, 2]);
  pcm.backlog = 1 << 20; md.unit(unit(6));
  is('a peer that is not draining loses the unit rather than queueing it', bins().length, 3);
  pcm.backlog = 0;
  is('the status names the peer and what it was sent', [md.status()[0].peer, md.status()[0].sent, md.status()[0].dropped, md.status()[0].open], ['page1', 3, 1, true]);

  // a peer that goes quiet lets go of ITS notes, through the same handler
  ctl.recv(JSON.stringify({ type: 'note.on', id: 'h1', n: 4, node: 'sampler', note: 67, vel: 100 }));
  ctl.recv(JSON.stringify({ type: 'note.on', id: 'h2', n: 5, channel: 1, note: 48, vel: 100 }));
  ctl.recv(JSON.stringify({ type: 'note.on', id: 'h3', n: 6, node: 'sampler', note: 69, vel: 100 }));
  ctl.recv(JSON.stringify({ type: 'note.off', id: 'h4', n: 7, node: 'sampler', note: 69 }));
  await tick();
  const n0 = asked.length;
  t += 61_000; md.sweep();
  await tick();
  is('a peer silent on ctl for a minute is closed', pcs[0].closed, true);
  const offs = asked.slice(n0).map((m) => [m.type, m.node ?? null, m.channel, m.note]);
  is('its held notes get a note off each, on the node they were played on',
    offs.sort(), [['note.off', null, 1, 48], ['note.off', 'sampler', 0, 60], ['note.off', 'sampler', 0, 67]].sort());
  is('a note it already let go of is not sent again', offs.some((o) => o[3] === 69), false);
  md.signalling({ type: 'rtc.offer', peer: 'page2', sdp: 'v=0' });
  md.close();
  is('closing the board closes every peer', pcs.every((p) => p.closed), true);
}

// board.hello and board.alive carry `graph`, built from the board's own facts.
// why: lessons/rig-board-tests.md#t-beat
console.log('\nbeat: the graph on the hello and on every beat');
{
  const cfg = parseInputs('{"circuit":{"device":"hw:CARD=Pro,DEV=0","channels":2,"take":1,"midi":{"port":"Circuit","channels":[1,2,10]}}}');
  const graphFacts = { room: 'studio-1', net: null, ports,
    instruments: { synth: true, pappusFx: true, yoshimi: true }, inputs: cfg.inputs, frameMs: 20, gpu: true };
  const hello = helloMsg({ name: 'positron-board', id: 'b-7f3a', backend: 'alsa', ports, dry: false, since: 1,
    frameMs: 20, instruments: graphFacts.instruments, error: null, hint: null, graphFacts });
  const alive = aliveMsg({ name: 'positron-board', id: 'b-7f3a', upSec: 3600, audio: 'synth', voices: 2, frames: 180000,
    insert: { fx: null, fxBy: null, fxAgoSec: null, fxHeld: false }, graphFacts });
  is('a hello given no direct flag carries none, as before', 'direct' in hello, false);
  is('the main hello and beat say direct when the socket answers an offer',
    [helloMsg({ name: 'p', id: 'b', backend: 'alsa', ports, dry: false, since: 1, frameMs: 20, instruments: {}, graphFacts, direct: true }).direct,
     aliveMsg({ name: 'p', id: 'b', upSec: 1, audio: null, voices: 0, frames: 0, insert: {}, graphFacts, direct: false }).direct],
    [true, false]);
  is('the hello is still a board.hello with its old fields', [hello.type, hello.ports, hello.audioChannels, hello.instruments.yoshimi],
    ['board.hello', 5, 1, true]);
  is('the hello carries a graph graphProblem accepts', graphProblem(hello.graph), '');
  is('the beat is still a board.alive with the insert at top level', [alive.type, alive.upSec, alive.fx, alive.fxHeld],
    ['board.alive', 3600, null, false]);
  is('the beat carries a graph graphProblem accepts', graphProblem(alive.graph), '');
  is('and it is the same graph the hello sent', JSON.stringify(alive.graph), JSON.stringify(hello.graph));
  is('the input from BOARD_INPUTS is a node, and its ALSA client is not a second one',
    hello.graph.nodes.filter((n) => /circuit/.test(n.id)).map((n) => n.id), ['pi-1:circuit']);
  ok('the ALSA name of an input does not ride on the beat', !JSON.stringify(alive).includes('hw:CARD'));
  is('the virtual clients are not in it', hello.graph.nodes.some((n) => /Virtual/.test(n.label)), false);
  is('no BOARD_NET means no net', 'net' in hello.graph, false);
  is('BOARD_NET set is carried', graphOf({ ...graphFacts, net: 'studio-lan' }).net, 'studio-lan');
  // An unplugged Circuit keeps its sound input and loses its MIDI in.
  // why: lessons/rig-board-tests.md#t-unplugged
  const gone = graphOf({ ...graphFacts, midiPresent: () => false });
  const there = graphOf({ ...graphFacts, midiPresent: () => true });
  is('an input whose MIDI device is unplugged announces no MIDI in', gone.ports.some((p) => p.id === 'pi-1:circuit:midi-in'), false);
  is('and still announces its sound', gone.ports.some((p) => p.id === 'pi-1:circuit:audio-out'), true);
  is('NEGATIVE CONTROL: plugged in, the MIDI in is back', there.ports.some((p) => p.id === 'pi-1:circuit:midi-in'), true);
  // The GPU's node is `shader`; positive control beside it.
  // why: lessons/rig-board-tests.md#t-shader
  is('no video path means no shader node', graphOf({ ...graphFacts, gpu: false }).nodes.some((n) => n.id === 'pi-1:shader'), false);
  is('NEGATIVE CONTROL: with a video path the shader is there, and never under its old id gpu',
    [graphOf({ ...graphFacts, gpu: true }).nodes.some((n) => n.id === 'pi-1:shader'), graphOf({ ...graphFacts, gpu: true }).nodes.some((n) => n.id === 'pi-1:gpu')],
    [true, false]);
  // A camera is announced only when board.mjs found one AND holds the key (`camera: true`).
  is('no camera fact means no camera node', graphOf(graphFacts).nodes.some((n) => n.id === 'pi-1:camera'), false);
  is('NEGATIVE CONTROL: camera: true is carried through to a camera node at <room>-cam',
    graphOf({ ...graphFacts, camera: true }).ports.find((p) => p.id === 'pi-1:camera:video-out')?.address, `${graphFacts.room}-cam`);
  is('the collide engine is two nodes, collide and drums, only when the board says it has it',
    [graphOf({ ...graphFacts, instruments: { ...graphFacts.instruments, collide: true } }).nodes.filter((n) => /^pi-1:(collide|drums)$/.test(n.id)).length,
     graphOf({ ...graphFacts, instruments: { ...graphFacts.instruments, collide: false } }).nodes.filter((n) => /^pi-1:(collide|drums)$/.test(n.id)).length],
    [2, 0]);
  is('a beat before the first hello carries no graph rather than an empty one',
    'graph' in aliveMsg({ insert: {}, graphFacts: null }), false);
  const errHello = helloMsg({ backend: 'alsa', ports: [], error: 'cannot open sequencer', hint: 'modprobe snd-seq',
    instruments: {}, graphFacts: { ...graphFacts, ports: [] } });
  is('an ALSA error still rides on the hello, next to a graph', [errHello.error, graphProblem(errHello.graph)],
    ['cannot open sequencer', '']);
  // What a page does with it. The registry is the page's half, and a hello
  // it refuses would be a board nobody ever sees on /graph/.
  const reg = createRegistry({ now: () => 0 });
  is('a page registry takes the hello, and the beat after it changes nothing',
    [reg.ingest({ ...hello, from: 'board-sock' }), reg.ingest({ ...alive, from: 'board-sock' })], [true, false]);
  // The relay carries this every five seconds, so its size is printed.
  // why: lessons/rig-board-tests.md#t-size
  const bytes = Buffer.byteLength(JSON.stringify(alive));
  console.log(`         board.alive is ${bytes} bytes with the graph, ${Buffer.byteLength(JSON.stringify({ ...alive, graph: undefined }))} without`);
  ok('the beat stays under 4 KB', bytes < 4096, `${bytes} bytes`);
  // The JACK ends add the granulator, the capture and `jack` lists.
  // why: lessons/rig-board-tests.md#t-jack-facts
  const jackFacts = { ...graphFacts, jack: true,
    inputs: [...(graphFacts.inputs instanceof Map ? graphFacts.inputs.values() : graphFacts.inputs)].map((i) => ({ ...i, via: 'jack' })) };
  const jackAlive = aliveMsg({ ...alive, graphFacts: jackFacts });
  const jbytes = Buffer.byteLength(JSON.stringify(jackAlive));
  ok('with the JACK ends announced the beat still stays under 4 KB, and carries them',
    jbytes < 4096 && jackAlive.graph.ports.some((p) => p.id === 'pi-1:circuit:audio-out' && p.jack?.[0] === 'circuit:capture_1'), `${jbytes} bytes`);
}

// The sfz writer and fetch; nearest-recording graded by brute force against a key-by-key search.
// why: lessons/rig-board-tests.md#t-sampler
{
  const nearest = (notes, k) => notes.reduce((b, n) => (Math.abs(n - k) < Math.abs(b - k) ? n : b), notes[0]);
  const owner = (ranges, k) => ranges.filter((r) => k >= r.lo && k <= r.hi).map((r) => r.note);
  const ranges = keyRanges();
  is('thirty regions, A0 to C8', [ranges.length, ranges[0].note, ranges.at(-1).note], [30, 21, 108]);
  let wrong = [];
  for (let k = 21; k <= 108; k++) { const o = owner(ranges, k); if (o.length !== 1 || o[0] !== nearest(PIANO_NOTES, k)) wrong.push(k); }
  is('every key 21..108 belongs to exactly one region, the nearest recording', wrong, []);
  is('each recording owns itself and one key either side', ranges.slice(1, -1).every((r) => r.lo === r.note - 1 && r.hi === r.note + 1), true);
  // NEGATIVE CONTROL: uneven spacing makes ties, and a tie goes to the LOWER one.
  const tie = keyRanges([60, 62, 66]);
  is('NEGATIVE CONTROL: a tie goes to the lower recording (61 to 60, 64 to 62)',
    [owner(tie, 61), owner(tie, 64)], [[60], [62]]);
  wrong = [];
  for (let k = 59; k <= 67; k++) { const o = owner(tie, k); if (o.length !== 1 || o[0] !== nearest([60, 62, 66], k)) wrong.push(k); }
  is('NEGATIVE CONTROL: uneven ranges still tile with no gap and no overlap', wrong, []);
  const sfz = pianoSfz({ dir: '/x/piano' });
  const regions = sfz.split('\n').filter((l) => l.startsWith('<region>'));
  is('the sfz has one region per recording, each naming its file and pitch centre',
    [regions.length, regions[0], regions.at(-1)],
    [30, '<region> sample=21.flac lokey=20 hikey=22 pitch_keycenter=21', '<region> sample=108.flac lokey=107 hikey=109 pitch_keycenter=108']);
  ok('default_path ends in a slash, or every sample resolves next to the wrong directory', /default_path=\/x\/piano\/\n/.test(sfz), sfz.slice(0, 200));
  ok('a release, a volume and the velocity curve are in the global header',
    /<global>\nvolume=6 ampeg_release=0\.3 amp_veltrack=100 amp_velcurve_1=0\.0007 .*amp_velcurve_64=0\.3577 .*amp_velcurve_127=1\.0000/.test(sfz));
  // NEGATIVE CONTROL: the curve is /nola/'s 1.5 power, not SFZ's own square, so a
  // writer that left the curve out (square) would read 0.2540 at 64.
  is('NEGATIVE CONTROL: the velocity curve at 64 is the 1.5 power, not the square',
    sfz.match(/amp_velcurve_64=([\d.]+)/)?.[1], ((64 / 127) ** 1.5).toFixed(4));
  // The fetch, against a fake network and a fake converter: it fetches what is
  // missing, only that, and a second run fetches nothing.
  const dir = mkdtempSync(join(tmpdir(), 'piano-'));
  writeFileSync(join(dir, '60.flac'), 'x');
  const asked = [];
  const fetchImpl = async (u) => { asked.push(u); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; };
  const convert = (src, dst) => writeFileSync(dst, readFileSync(src));
  const one = await ensurePiano({ dir, fetchImpl, convert });
  is('a first run fetches the 29 missing, not the one already there', [one.fetched, asked.some((u) => u.endsWith('/60.mp3')), one.missing], [29, false, []]);
  ok('and it writes the sfz', one.wroteSfz && readFileSync(join(dir, 'piano.sfz'), 'utf8') === pianoSfz());
  const two = await ensurePiano({ dir, fetchImpl, convert });
  is('NEGATIVE CONTROL: a second run fetches nothing and rewrites nothing', [two.fetched, two.wroteSfz, asked.length], [0, false, 29]);
  is('no temporary file is left on the card', readdirSync(dir).filter((f) => f.startsWith('.')), []);
  const bad = await ensurePiano({ dir: mkdtempSync(join(tmpdir(), 'piano-')), fetchImpl: async () => ({ ok: false, status: 404 }), convert })
    .then(() => 'resolved', (e) => e.message);
  ok('a refused file is an error naming it, never an empty sample', /21\.mp3 answered 404/.test(bad), bad);
  rmSync(dir, { recursive: true, force: true });
}

// The SuperCollider sampler with a fake scsynth: 27 asserts, 11 negative controls.
// why: lessons/rig-board-tests.md#t-scsampler
{
  console.log('sampler: the one-source rule, with the sampler beside it');
  is('starting the sampler beside Yoshimi stops nothing',
    startPlan('sampler', { running: 'yoshimi', sampler: false }), { act: 'start-sampler', stopInst: false, stopSampler: false });
  is('starting Yoshimi beside the sampler leaves the sampler running',
    startPlan('yoshimi', { running: null, sampler: true }).stopSampler, false);
  is('NEGATIVE CONTROL: between the others it is still one at a time, a new one replaces the old',
    startPlan('yoshimi', { running: 'synth', sampler: true }), { act: 'start', stopInst: true, stopSampler: false });
  is('a second sampler start is already', startPlan('sampler', { sampler: true }).act, 'already');
  is('audio.stop with no source stops the instrument and never the sampler',
    stopPlan(null, { running: 'yoshimi', sampler: true }), { stopInst: true, stopSampler: false });
  is('NEGATIVE CONTROL: audio.stop {source: sampler} leaves Yoshimi',
    stopPlan('sampler', { running: 'yoshimi', sampler: true }), { stopInst: false, stopSampler: true });
  is('only node: sampler is the sampler\'s', [isForSampler({ node: 'sampler' }), isForSampler({}), isForSampler({ node: 'yoshimi' })], [true, false, false]);

  console.log('sampler: the server is its own and connects nowhere by itself');
  const a = scsynthArgs();
  ok('a JACK client of its own name and its own port, no inputs, two outputs',
    a.join(' ').includes('-H default:possampler') && a.join(' ').includes(`-u ${SAMPLER_SC_PORT}`) && a.join(' ').includes('-i 0 -o 2'), a.join(' '));
  ok('NEGATIVE CONTROL: its JACK name is never the granulator\'s SuperCollider', !/SuperCollider/.test(a.join(' ')) && JACK_ENDS.sampler.every((p) => p.startsWith('possampler:')));
  is('and it auto connects to a port that does not exist', [SC_ENV.SC_JACK_DEFAULT_INPUTS, SC_ENV.SC_JACK_DEFAULT_OUTPUTS], ['posnothing:none', 'posnothing:none']);
  const ps = '101 scsynth -u 57110 -a 1024 -i 2 -o 2\n202 scsynth -u 57130 -i 0 -o 2 -H default:possampler\n303 scsynth -u 571300\n';
  is('stopPappus kills every scsynth but the sampler\'s', pappusScsynthPids(ps), [101, 303]);
  is('NEGATIVE CONTROL: with no sampler running it still kills the granulator\'s', pappusScsynthPids('101 scsynth -u 57110'), [101]);

  console.log('sampler: the capture keeps it, whoever re-patches');
  const capRows = parseJackLsp(jackText.replace('posboard:input_1\n   yoshimi:left',
    'posboard:input_1\n   possampler:out_1\n   possampler:out_2\n   yoshimi:left') + 'possampler:out_1\n   posboard:input_1\npossampler:out_2\n   posboard:input_1\n');
  setStandingRows('sampler', JACK_ENDS.sampler.map((f) => ({ from: f, to: 'posboard:input_1' })));
  const withS = jackChain({ ...yosh, graph: { graph: capRows } });
  is('with the sampler standing, its two links into the capture are wanted, not stray', [withS.intact, withS.extra], [true, []]);
  setStandingRows('sampler', []);
  const without = jackChain({ ...yosh, graph: { graph: capRows } });
  is('NEGATIVE CONTROL: once it stops, the same two links are strays a rebuild would cut', without.extra.length, 2);
  is('and it leaves no standing row behind', getStandingRows(), []);

  console.log('sampler: the rules a key is played by');
  const sent = [];
  const bufs = new Map();
  // The notes are faked stereo, so the halving is graded; the releases are not loaded yet.
  SETS[0].files.filter((f) => f.key.startsWith('p')).forEach((f) => bufs.set(`piano:${f.key}`, { bufnum: f.bufnum, channels: 2 }));
  let clock = 100;
  const core = createSamplerCore({ send: (addr, args) => sent.push([addr, ...args]), buffers: bufs, voices: 3, now: () => clock });
  const n60 = core.noteOn(60, 127);
  is('60 plays its own recording at rate 1, through the stereo def', [n60.near, n60.rate, sent[0][1]], [60, 1, 'posSampler2']);
  ok('a stereo voice is halved, so the summed capture lands where one browser channel does',
    Math.abs(n60.amp - pianoGain(127) / 2) < 1e-4, String(n60.amp));
  {
    const c2 = createSamplerCore({ send: () => {}, buffers: bufs });
    is('the piano is the Salamander: 127 plays the v16 file, 100 the v11, 64 the v6, 20 the v1',
      [n60.file, c2.noteOn(61, 100).file, c2.noteOn(59, 64).file, c2.noteOn(58, 20).file],
      ['p060-v16', 'p060-v11', 'p060-v6', 'p057-v1']);
  }
  const n62 = core.noteOn(62, 64);
  is('62 is nearer 63 and plays it a semitone down', [n62.near, n62.rate], [63, +Math.pow(2, -1 / 12).toFixed(4)]);
  sent.length = 0;
  core.noteOn(60, 90);
  is('a key struck again damps the voice it replaces, over 40 ms', sent[0], ['/n_set', n60.id, 'rel', 0.04, 'gate', 0]);
  core.panic();
  const first = core.noteOn(40, 90); core.noteOn(44, 90); core.noteOn(47, 90);
  sent.length = 0;
  core.noteOn(52, 90);
  is('past the cap the OLDEST voice is taken, over 20 ms', [sent[0][0], sent[0][1], sent[0][3], core.sounding()], ['/n_set', first.id, 0.02, 3]);
  core.panic();
  sent.length = 0;
  core.control(64, 127);
  const held = core.noteOn(48, 100);
  core.noteOff(48);
  is('NEGATIVE CONTROL: with the pedal down a key up releases nothing', sent.filter((m) => m[0] === '/n_set'), []);
  core.control(64, 0);
  is('the pedal up lets it go over the damper\'s 0.12 s', sent.filter((m) => m[0] === '/n_set'), [['/n_set', held.id, 'rel', 0.12, 'gate', 0]]);
  core.ended(held.id);
  is('scsynth saying a node ended takes it off the count', core.sounding(), 0);

  // The key-off samples: with them loaded, a damper landing plays one, mono,
  // at rate 1 from the KEY's own file, at hammer.txt's level.
  SETS[0].files.filter((f) => f.key.startsWith('rel')).forEach((f) => bufs.set(`piano:${f.key}`, { bufnum: f.bufnum, channels: 1 }));
  sent.length = 0;
  clock = 200;
  const k = core.noteOn(62, 100);
  clock = 203;
  core.noteOff(62);
  const rel = sent.filter((m) => m[0] === '/s_new' && m[1] === 'posSampler1');
  is('a key up plays rel062 once, at rate 1, after the damper', [rel.length, rel[0]?.[6], rel[0]?.[8], sent.findIndex((m) => m[0] === '/n_set') < sent.indexOf(rel[0])],
    [1, SETS[0].files.find((f) => f.key === 'rel062').bufnum, 1, true]);
  ok('at volume -37 dB with velocity and the 3 s held taken off by rt_decay', Math.abs(rel[0]?.[10] - releaseGain(100, 3)) < 1e-9
    && releaseGain(100, 3) < releaseGain(100, 0) && releaseGain(30, 0) < releaseGain(100, 0), String(rel[0]?.[10]));
  core.ended(k.id);
  sent.length = 0;
  core.control(64, 127);
  const p2 = core.noteOn(64, 90);
  core.noteOff(64);
  is('NEGATIVE CONTROL: a key up under the pedal plays no key-off sound', sent.filter((m) => m[0] === '/s_new').length, 1);
  core.noteOn(64, 90);
  is('NEGATIVE CONTROL: a key struck again damps but plays no key-off sound', sent.filter((m) => m[0] === '/s_new').length, 2);
  core.noteOff(64);
  core.control(64, 0);
  is('the pedal lifting is the damper landing, so it plays one', sent.filter((m) => m[0] === '/s_new' && m[1] === 'posSampler1').length, 1);
  core.panic();
  is('NEGATIVE CONTROL: a panic plays no key-off sound', sent.filter((m) => m[0] === '/s_new' && m[1] === 'posSampler1').length, 1);
  core.ended(p2.id);
  core.noteOn(50, 100);
  sent.length = 0;
  is('program 1 is the Rhodes and damps what was sounding', [core.program(1).set, sent[0]?.[0], sent[0]?.[3]], ['rhodes', '/n_set', 0.06]);
  const cold = core.noteOn(60, 100);
  is('NEGATIVE CONTROL: a note on a set not loaded yet is dropped and says so', [cold.ok, cold.dropped, /Rhodes is not loaded/.test(cold.reason)], [false, true, true]);
  is('NEGATIVE CONTROL: program 7 is not a set', core.program(7).ok, false);
  is('the Rhodes picks the hardest layer at 127 and falls back over a hole', [layerFor(127), rhodesLayerAt(81, 1), rhodesLayerAt(96, 3)], [1, 2, 4]);
  is('a Rhodes key between two recordings goes to the lower on a tie', nearestIn(RHODES_NOTES, 32), 29);
  is('65 Rhodes files with buffer numbers of their own', [SETS[1].files.length, RHODES_FILES.length, SETS[1].files[0].bufnum], [65, 65, 100]);
  {
    const nums = Object.values(SETS).flatMap((x) => x.files.map((f) => f.bufnum));
    is('208 Salamander files, and no buffer number is used twice across the three sets, all under 1024',
      [SETS[0].files.length, new Set(nums).size === nums.length, Math.max(...nums) < 1024], [208, true, true]);
    is('program 2 is still the FluidR3 piano', [core.program(2).set, SETS[2].files.length, SETS[2].files[0].file], ['piano-fluid', 30, '21.flac']);
  }

  console.log('sampler: the board\'s copy against the browser\'s module');
  // The browser module imports `/shell/pedal.mjs` by an absolute URL; that one
  // import is pointed at the real file and everything else is the page's code.
  const src = readFileSync(new URL('../../demo/code/sampler.mjs', import.meta.url), 'utf8')
    .replace("'/shell/pedal.mjs'", `'${new URL('../../demo/shell/pedal.mjs', import.meta.url).href}'`);
  const web = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
  const diffs = [];
  for (let n = 0; n < 128; n++) {
    if (web.nearestIn(web.PIANO_NOTES, n) !== nearestIn(PIANO_NOTES, n)) diffs.push(`piano ${n}`);
    if (web.nearestIn(web.RHODES_NOTES, n) !== nearestIn(RHODES_NOTES, n)) diffs.push(`rhodes ${n}`);
  }
  for (let v = 1; v < 128; v++) {
    if (web.layerFor(v) !== layerFor(v)) diffs.push(`layer ${v}`);
    if (Math.abs(web.velGain(web.PIANO, v) - pianoGain(v)) > 1e-9) diffs.push(`piano gain ${v}`);
    if (Math.abs(web.velGain(web.PIANO_FLUID, v) - velGain(PIANO_PEAK, v)) > 1e-9) diffs.push(`fluid gain ${v}`);
    if (web.bandFor(v) !== bandFor(v)) diffs.push(`band ${v}`);
    if (Math.abs(web.releaseGain(v, 1.5) - releaseGain(v, 1.5)) > 1e-9) diffs.push(`release gain ${v}`);
    if (Math.abs(web.velGain(web.RHODES, v) - velGain(RHODES_PEAK, v)) > 1e-9) diffs.push(`rhodes gain ${v}`);
  }
  for (const n of RHODES_NOTES) for (const l of [1, 2, 3, 4, 5]) if (web.rhodesLayerAt(n, l) !== rhodesLayerAt(n, l)) diffs.push(`hole ${n}-${l}`);
  if (JSON.stringify(web.RHODES_NOTES) !== JSON.stringify(RHODES_NOTES)) diffs.push('rhodes notes');
  is('the board plays every note, velocity and layer exactly as the browser module does', diffs, []);
  is('and fetches the same file names the browser does',
    RHODES_FILES.every((f) => web.RHODES.file(+f.slice(7, 10), +f.slice(-1)).endsWith(`/${f}.m4a`)), true);
  is('the Salamander: the same bands, and the same 120 note and 88 release names as the browser',
    [JSON.stringify(web.PIANO_BANDS) === JSON.stringify(PIANO_BANDS),
     SALAMANDER_FILES.filter((f) => f.startsWith('p')).every((f) => web.PIANO.file(+f.slice(1, 4), +f.slice(6)).endsWith(`/salamander/web/${f}.m4a`)),
     SALAMANDER_FILES.filter((f) => f.startsWith('rel')).every((f) => web.PIANO.release(+f.slice(3)).endsWith(`/salamander/web/${f}.m4a`))],
    [true, true, true]);
  is('NEGATIVE CONTROL: no key outside A0 to C8 has a release, and no name carries a #',
    [web.PIANO.release(20), web.PIANO.release(109), SALAMANDER_FILES.some((f) => f.includes('#'))], [null, null, false]);
  {
    const p = web.PIANO.plan(60, 11), b = web.PIANO.behind(60, 11, 61);
    is('a press waits on ONE file, and the rest of its octave follows behind it',
      [p.urls.length, p.urls[0].split('/').pop(), b[0].split('/').pop(), b.slice(1, 5).map((u) => u.split('/').pop()), b.length, new Set(b).size],
      [1, 'p060-v11.m4a', 'rel061.m4a', ['p060-v11.m4a', 'p063-v11.m4a', 'p066-v11.m4a', 'p069-v11.m4a'], 28, 28]);
  }

  // The Rhodes fetch, against a fake network: the 65, once.
  const rdir = mkdtempSync(join(tmpdir(), 'rhodes-'));
  const asked = [];
  const r1 = await ensureRhodes({ dir: rdir, fetchImpl: async (u) => { asked.push(u); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; },
    convert: (a, b) => writeFileSync(b, readFileSync(a)) });
  const r2 = await ensureRhodes({ dir: rdir, fetchImpl: async () => { throw new Error('asked twice'); }, convert: () => {} });
  is('the Rhodes comes down once, 65 files, and a second run asks nobody', [r1.fetched, r1.missing.length, r2.fetched, asked.length], [65, 0, 0, 65]);
  rmSync(rdir, { recursive: true, force: true });

  // The Salamander fetch: the 208, once, already FLAC, from salamander/pi/.
  const sdir = mkdtempSync(join(tmpdir(), 'salamander-'));
  const sasked = [];
  const s1 = await ensureSalamander({ dir: sdir, fetchImpl: async (u) => { sasked.push(u); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; } });
  const s2 = await ensureSalamander({ dir: sdir, fetchImpl: async () => { throw new Error('asked twice'); } });
  is('the Salamander comes down once, 208 FLACs from salamander/pi/, and a second run asks nobody',
    [s1.fetched, s1.missing.length, s2.fetched, sasked.length, sasked.every((u) => /\/sampler\/salamander\/pi\/(p\d{3}-v\d+|rel\d{3})\.flac$/.test(u))],
    [208, 0, 0, 208, true]);
  is('no temporary file is left, and the licence is beside them', [readdirSync(sdir).filter((f) => f.startsWith('.')), readdirSync(sdir).includes('LICENSE-salamander')], [[], true]);
  const sbad = await ensureSalamander({ dir: mkdtempSync(join(tmpdir(), 'salamander-')), fetchImpl: async () => ({ ok: false, status: 404 }) })
    .then(() => 'resolved', (e) => e.message);
  ok('NEGATIVE CONTROL: a refused file is an error naming it', /p021-v1\.flac answered 404/.test(sbad), sbad);
  rmSync(sdir, { recursive: true, force: true });
}

// The collide engine, pure. Sabotaged one guard at a time on a scratch tree, every guard went red.
// why: lessons/rig-board-tests.md#t-collide
{
  const C = await import('./scollide.mjs');
  const { compile: scCompile, UGENS: SC_UGENS } = await import('../../demo/shell/sclang-lite.mjs');
  const { voices: drumVoices } = await import('../../demo/drums/voices.mjs');
  const J = await import('./jacksynth.mjs');
  // The collide program, read out of the page's own module (it imports by
  // absolute URL, so node cannot import it; the text is the template literal).
  const cvSrc = readFileSync(new URL('../../demo/code/collide-voice.mjs', import.meta.url), 'utf8');
  const PROGRAM = new Function(`return ${cvSrc.match(/export const PROGRAM = (`[\s\S]*?`);/)[1]}`)();
  const programs = [['collide', PROGRAM],
    ...drumVoices().map((v) => [v.name, v.program]),
    ...drumVoices({ knobs: true }).map((v) => [`${v.name}_k`, v.program])];

  let clock = 1_760_000_000_000;
  const now = () => clock;
  const sent = [];
  const mk = (o = {}) => C.createCollideCore({ send: (p) => sent.push(p), now, ...o });
  const tab = (name, text) => C.sha256(scCompile(text, { name }).bytes);

  console.log('collide: every program the two pages play, compiled on the board side');
  const core = mk();
  const loads = programs.map(([name, text]) => core.load({ name, text, sha: tab(name, text) }));
  ok(`all ${programs.length} load, and each is byte for byte the tab's (same: true)`,
    loads.every((r) => r.ok && r.same === true), JSON.stringify(loads.filter((r) => !r.ok || !r.same).map((r) => r.reason ?? r.name)));
  ok('the bytes played are pg_<name>, on the page bus, and read back block by block',
    loads.every((r) => r.def === `pg_${r.name}` && C.checkDef(r.recv, { name: r.def, bus: C.PAGE_BUS }).ok));
  ok('NEGATIVE CONTROL: a page hash that is not the board\'s says same: false',
    core.load({ name: 'collide', text: PROGRAM, sha: tab('other', PROGRAM) }).same === false);
  ok('NEGATIVE CONTROL: the same program checked against bus 0 is refused, so the Out check reads the bus',
    !C.checkDef(loads[0].recv, { name: 'pg_collide', bus: 0 }).ok);
  // A class the compiler cannot emit can only reach the check through bytes
  // built some other way, which is exactly the future this check is for.
  const { graph: sdGraph, RATE: SD_RATE } = await import('../../demo/shell/synthdef.mjs');
  const foreign = (cls) => {
    const g = sdGraph('pg_x');
    const src = g.block(cls, SD_RATE.sample, [g.value(440), g.value(0)], 1);
    g.block('Out', SD_RATE.sample, [g.value(C.PAGE_BUS), src, src], 0, 0);
    return g.bytes();
  };
  const refusedIn = C.checkDef(foreign('PlayBuf'), { name: 'pg_x', bus: C.PAGE_BUS });
  ok('a definition with a class the compiler never emits is refused, by name', !refusedIn.ok && /PlayBuf/.test(refusedIn.reason), JSON.stringify(refusedIn));
  ok('NEGATIVE CONTROL: the same graph built with SinOsc passes', C.checkDef(foreign('SinOsc'), { name: 'pg_x', bus: C.PAGE_BUS }).ok);
  ok('the largest is under the block cap', Math.max(...loads.map((r) => r.ugens)) <= C.BLOCK_CAP, `${Math.max(...loads.map((r) => r.ugens))}`);
  for (const r of loads) core.commit(r);
  is('every class the compiler can emit is on the hand list, and nothing else is',
    [...C.ALLOWED_CLASSES].sort(), [...new Set([...C.STRUCTURAL, ...Object.keys(SC_UGENS)])].sort());
  // BufWr on the sampler's server could write over its recordings (scollide.mjs `SHARED_REFUSED`).
  const bufwrShared = C.checkDef(foreign('BufWr'), { name: 'pg_x', bus: C.PAGE_BUS, allowed: C.ALLOWED_SHARED });
  ok('on the shared engine a BufWr is refused, by name', !bufwrShared.ok && /BufWr/.test(bufwrShared.reason), JSON.stringify(bufwrShared));
  ok('NEGATIVE CONTROL: the same BufWr passes on the board\'s own engine, where no buffer is allocated',
    C.checkDef(foreign('BufWr'), { name: 'pg_x', bus: C.PAGE_BUS }).ok);

  console.log('collide: refusals, each with a reason');
  const bad = mk();
  for (const n of ['Kick', '1kick', 'kick-1', 'k'.repeat(25), '', null]) {
    ok(`a name that is not a name is refused: ${JSON.stringify(n)}`, bad.load({ name: n, text: PROGRAM }).ok === false);
  }
  ok('a 24 character name is a name', bad.load({ name: 'k'.repeat(24), text: PROGRAM }).ok);
  const long = bad.load({ name: 'big', text: PROGRAM + ' '.repeat(C.TEXT_CAP) });
  ok('text over 4000 characters is refused', !long.ok && /4000/.test(long.reason), long.reason);
  const err = bad.load({ name: 'broken', text: '{ SinOsc.ar(440 }' });
  ok('a compile error answers the compiler\'s own line and column', !err.ok && err.line === 1 && Number.isInteger(err.col), JSON.stringify(err));
  const full = mk();
  for (let i = 0; i < C.MAX_DEFS; i++) full.commit(full.load({ name: `p${i}`, text: PROGRAM }));
  const seventeenth = full.load({ name: 'p16', text: PROGRAM });
  ok('a 17th name is refused, and the refusal lists the 16', !seventeenth.ok && /p0, p1/.test(seventeenth.reason), seventeenth.reason);
  ok('NEGATIVE CONTROL: loading one of the 16 again is a replace, not a 17th', full.load({ name: 'p3', text: PROGRAM }).ok);

  const held = mk();
  held.commit(held.load({ name: 'drone', text: '{ |freq = 220, amp = 0.1| SinOsc.ar(freq, mul: amp) }' }));
  held.commit(held.load({ name: 'kick', text: drumVoices()[0].program }));
  const r0 = held.hit({ hits: [{ name: 'drone', at: clock + 100 }] });
  ok('a hit on a program that never frees itself is refused', r0.played === 0 && /never frees/.test(r0.refused[0]?.reason), JSON.stringify(r0));
  const r3 = held.hit({ hits: [{ name: 'kick', at: clock + 3000 }] });
  ok('an at 3 s ahead is refused', r3.played === 0 && /ahead/.test(r3.refused[0]?.reason), JSON.stringify(r3));
  const before = held.stats().droppedLate;
  held.hit({ hits: [{ name: 'kick', at: clock - 100 }] });
  is('an at 100 ms behind is dropped and counted', held.stats().droppedLate - before, 1);
  sent.length = 0;
  held.hit({ hits: [{ name: 'kick', at: clock - 10 }] });
  ok('an at 10 ms behind plays at once and counts late', held.stats().late === 1 && sent.at(-1)?.tt === null);
  sent.length = 0;
  held.hit({ hits: [{ name: 'kick', at: clock + 250 }] });
  is('NEGATIVE CONTROL: an at 250 ms ahead is timetagged, not late', [held.stats().late, sent.at(-1)?.tt], [1, J.ntpTimetag(clock + 250)]);
  ok('an arg the program does not declare is refused', /not a control/.test(held.hit({ hits: [{ name: 'kick', at: clock + 50, args: { cutoff: 3 } }] }).refused[0]?.reason));
  ok('a value that is not finite is refused', /finite/.test(held.hit({ hits: [{ name: 'kick', at: clock + 50, args: { amp: NaN } }] }).refused[0]?.reason));
  sent.length = 0;
  held.hit({ hits: [{ name: 'kick', at: clock + 50, args: { amp: 7 } }] });
  ok('amp is clamped to 1', sent.at(-1).msgs[0].includes(1) && !sent.at(-1).msgs[0].includes(7), JSON.stringify(sent.at(-1).msgs[0]));
  ok('a hit on a name nobody loaded is refused', /not loaded/.test(held.hit({ hits: [{ name: 'snare', at: clock + 50 }] }).refused[0]?.reason));

  console.log('collide: the choke, in the hit\'s own bundle');
  const ch = mk();
  for (const v of drumVoices()) ch.commit(ch.load({ name: v.name, text: v.program }));
  sent.length = 0;
  ch.hit({ hits: [{ name: 'hho', at: clock + 100 }] });
  const hhoId = sent.at(-1).msgs[0][2];
  ch.hit({ hits: [{ name: 'hhc', at: clock + 200, choke: 'hho' }] });
  const chb = sent.at(-1);
  ok('the closed hat closes the open hat in the same bundle, at the same timetag',
    JSON.stringify(chb.msgs[0]) === JSON.stringify(['/n_set', hhoId, 'gate', 0]) && chb.msgs[1][0] === '/s_new' && chb.msgs[1][1] === 'pg_hhc'
      && JSON.stringify(chb.tt) === JSON.stringify(J.ntpTimetag(clock + 200)), JSON.stringify(chb));
  ch.hit({ hits: [{ name: 'hhc', at: clock + 50, choke: 'hho' }] });
  ok('NEGATIVE CONTROL: a closed hat BEFORE the open hat starts chokes nothing', sent.at(-1).msgs.length === 1 && sent.at(-1).msgs[0][0] === '/s_new');

  console.log('collide: node and time caps');
  const cap = mk();
  cap.commit(cap.load({ name: 'kick', text: drumVoices()[0].program }));
  for (let i = 0; i < 60; i++) cap.hit({ hits: [{ name: 'kick', at: clock + 10 + i }] });
  is('60 hits leave 48 counted live and 12 stolen', [cap.stats().live, cap.stats().stolen], [C.MAX_NODES, 12]);
  clock += 100; cap.sweep();
  ok('a stolen node is freed 50 ms after its gate closes', sent.at(-1).msgs.every((m) => m[0] === '/n_free') && sent.at(-1).msgs.length === 12);
  clock += C.HIT_LIFE_MS; cap.sweep();
  is('every hit is freed 4 s after its at if scsynth never said /n_end', [cap.stats().live, cap.stats().expired], [0, 48]);

  console.log('collide: notes and knobs');
  const nt = mk();
  nt.commit(nt.load({ name: 'collide', text: PROGRAM }));
  sent.length = 0;
  const on = nt.noteOn({ name: 'collide', note: 69, vel: 127 }, { from: 'tab-a' });
  const sn = sent.at(-1).msgs[0];
  ok('a note is /s_new of pg_collide in the page group with freq, gate 1 and the program\'s amp',
    on.ok && sn[0] === '/s_new' && sn[1] === 'pg_collide' && sn[4] === C.PAGE_GROUP && sn.includes('freq') && sn[sn.indexOf('freq') + 1] === 440
      && sn[sn.indexOf('gate') + 1] === 1 && Math.abs(sn[sn.indexOf('amp') + 1] - 0.2) < 1e-9, JSON.stringify(sn));
  const st = nt.set({ name: 'collide', param: 'bright', value: 0.9 });
  is('a knob reaches the held note', [st.ok, st.nodes, sent.at(-1).msgs[0]], [true, 1, ['/n_set', on.id, 'bright', 0.9]]);
  ok('NEGATIVE CONTROL: a knob may not set the gate', !nt.set({ name: 'collide', param: 'gate', value: 0 }).ok);
  nt.noteOff({ name: 'collide', note: 69 });
  is('letting go closes the gate, because the program reads it', sent.at(-1).msgs[0], ['/n_set', on.id, 'gate', 0]);
  nt.noteOn({ name: 'collide', note: 60 }, { from: 'tab-b' });
  clock += C.QUIET_MS + 1; nt.sweep();
  is('a page that has said nothing for 15 s has its held note released', nt.stats().quietReleased, 1);

  console.log('collide: the timetag and the bundle, against bytes worked by hand');
  // 1760000000.25 s: seconds + 2208988800, and a quarter of 2^32.
  is('the timetag of a known at', J.ntpTimetag(1760000000250), [3968988800, 1073741824]);
  is('null is OSC\'s immediately', J.ntpTimetag(null), [0, 1]);
  const bun = J.oscBundle(1760000000250, [['/n_free', 7]]);
  is('the bundle, byte for byte',
    bun.toString('hex'),
    '2362756e646c6500' + 'ec91f680' + '40000000' + '00000010' + '2f6e5f6672656500' + '2c690000' + '00000007');
  is('a blob is a length, the bytes and padding', J.oscMessage('/d_recv', [new Uint8Array([1, 2, 3])]).toString('hex'),
    '2f645f7265637600' + '2c620000' + '00000003' + '01020300');
  is('NEGATIVE CONTROL: a message with no bytes in it is what it always was', J.oscMessage('/x', [1, 'a']).toString('hex'),
    '2f780000' + '2c697300' + '00000001' + '61000000');

  console.log('collide: the keep list, and the engine switch');
  const ps3 = '101 scsynth -u 57110\n202 scsynth -u 57130 -H default:possampler\n404 scsynth -u 57131 -H default:poscollide\n303 scsynth -u 571310\n';
  is('stopPappus leaves both the sampler\'s and the collide server', J.pappusScsynthPids(ps3), [101, 303]);
  is('NEGATIVE CONTROL: a keep list of one port would kill the collide server', J.pappusScsynthPids(ps3, J.SAMPLER_SC_PORT), [101, 404, 303]);
  is('the default engine is its own server on 57131', [C.ENGINE.mode, C.ENGINE.port, C.ENGINE.client], ['own', 57131, 'poscollide']);
  is('and the switch names the sampler\'s on 57130', [C.ENGINES.shared.mode, C.ENGINES.shared.port], ['shared', 57130]);
  const sh0 = await C.startScCollide({ engine: C.ENGINES.shared, sampler: null });
  ok('shared mode with no sampler running refuses in words', !sh0.ok && /sampler/.test(sh0.reason), sh0.reason);
  is('the collide JACK ends are a client of their own', JACK_ENDS.collide, ['poscollide:out_1', 'poscollide:out_2']);

  console.log('collide: the verbs over a server, as fake-board.mjs and board.mjs run them');
  const fsent = [];
  let replyFn = null;
  const fake = { ok: true, mode: 'own', port: 57131, bus: C.PAGE_BUS, send: (b) => fsent.push(b), recv: async () => ({ ok: true }),
    onReply: (fn) => { replyFn = fn; return () => { replyFn = null; }; }, cpu: async () => ({ avg: 3, peak: 5 }), stop: () => true, status: () => ({}) };
  const svc = C.createCollideService({ start: async () => fake, now, sweepMs: 1e6, cpuMs: 1e6 });
  const said = [];
  const rep = (type, body) => said.push({ type, ...body });
  ok('only collide\'s messages are collide\'s', svc.handles({ type: 'sc.hit' }) && svc.handles({ type: 'note.on', node: 'collide' })
    && !svc.handles({ type: 'note.on' }) && !svc.handles({ type: 'note.on', node: 'sampler' }) && !svc.handles({ type: 'audio.start' }));
  await svc.handle({ type: 'clock.ping', t0: 5 }, rep);
  is('clock.ping answers t0 and the board\'s own clock', said.at(-1), { type: 'clock.pong', t0: 5, t1: clock });
  await svc.handle({ type: 'sc.load', name: 'kick', text: drumVoices()[0].program }, rep);
  ok('NEGATIVE CONTROL: a load before audio.start is refused in words', !said.at(-1).ok && /audio\.start/.test(said.at(-1).reason));
  await svc.handle({ type: 'audio.start', source: 'collide' }, rep);
  await svc.handle({ type: 'sc.load', name: 'kick', text: drumVoices()[0].program, sha: tab('kick', drumVoices()[0].program) }, rep);
  ok('sc.loaded answers the def, its size and same: true, and no bytes', said.at(-1).ok && said.at(-1).def === 'pg_kick' && said.at(-1).same === true && !('recv' in said.at(-1)));
  await svc.handle({ type: 'sc.hit', hits: [{ name: 'kick', at: clock + 200 }] }, rep);
  ok('a hit leaves as one encoded bundle with the right timetag', fsent.at(-1).subarray(0, 8).toString() === '#bundle\0'
    && fsent.at(-1).readUInt32BE(8) === J.ntpTimetag(clock + 200)[0] && fsent.at(-1).readUInt32BE(12) === J.ntpTimetag(clock + 200)[1]);
  const id0 = svc.core().live()[0].id;
  replyFn({ addr: '/n_end', args: [id0] });
  await svc.handle({ type: 'sc.stats' }, rep);
  is('/n_end from scsynth is counted, and sc.stats says so', [said.at(-1).started, said.at(-1).ended, said.at(-1).live, said.at(-1).engine], [1, 1, 0, 'own']);
}

console.log(`\n${pass}/${pass + fail} green`);
process.exit(fail ? 1 : 0);
