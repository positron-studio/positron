// demo/shell/nodes-test.mjs (node demo/shell/nodes-test.mjs): the node catalogue against bay.mjs,
// no browser: legal kinds and ports, unique names, addNodes, merges, one default label per type,
// pages on disk. NEGATIVE CONTROL lines must refuse something.
// why: lessons/kit-nodes.md#test-header

import { readFileSync, existsSync } from 'node:fs';
import { createBay, MEDIA, NODE_KINDS, TRANSPORT_NAMES } from './bay.mjs';
import { NODES, addNodes, addPorts, relabel, portOf, typeOf } from './nodes.mjs';

let failed = 0, ok = 0;
const check = (name, pass, detail = '') => {
  if (pass) ok++; else failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const throws = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const names = Object.keys(NODES);

// ── every entry is legal for bay.mjs ──────────────────────────────────────
const badKind = names.filter((n) => !NODE_KINDS.includes(NODES[n].kind));
check('every kind is one of NODE_KINDS', !badKind.length, badKind.join(' ') || `${names.length} entries`);
const badPorts = [];
for (const n of names) for (const [p, spec] of Object.entries(NODES[n].ports)) {
  const { medium, dir } = portOf(p.replace(/-\d+$/, ''), spec);
  if (!MEDIA.includes(medium) || (dir !== 'in' && dir !== 'out')) badPorts.push(`${n}:${p}`);
  if (spec.transports && spec.transports.some((t) => !TRANSPORT_NAMES.includes(t))) badPorts.push(`${n}:${p} transports`);
  if (spec.emits && dir !== 'out') badPorts.push(`${n}:${p} emits on an in`);
  if (spec.accepts && dir !== 'in') badPorts.push(`${n}:${p} accepts on an out`);
}
check('every port is a MEDIA medium, in or out, with known transports', !badPorts.length, badPorts.join(' ') || 'all');
check('NEGATIVE CONTROL: portOf refuses a made-up medium', !MEDIA.includes(portOf('text-in').medium), portOf('text-in').medium);
const noPages = names.filter((n) => !NODES[n].pages?.length);
check('every entry names the pages that build it', !noPages.length, noPages.join(' '));

// ── names are unique ──────────────────────────────────────────────────────
// A duplicate key in an object literal silently keeps the last, so read the source.
const src = readFileSync(new URL('./nodes.mjs', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export const NODES'), src.indexOf('\n};\n', src.indexOf('export const NODES')));
const keys = [...body.matchAll(/^ {2}('?)([\w-]+)\1: \{/gm)].map((m) => m[2]);
const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
check('no name is written twice in the source', !dupes.length && keys.length === names.length, dupes.join(' ') || `${keys.length} names`);
// Two entries may share an id segment on different pages; within one site the
// pair (site, node) must still say which entry it is, so a page never needs both.
const ambiguous = names.filter((n) => typeOf(n) !== n);
check('a catalogue name always means its own entry, never an instance of another', !ambiguous.length, ambiguous.join(' '));
const instances = { 'knob-cutoff': 'knob', 'midi-2': 'midi', 'scope-pi': 'scope', 'wave-err': 'wave', 'screen-pi': 'screen',
  'knob-mix': 'knob', 'knob-volume': 'knob', 'midi-state': 'midi-state', midi: 'midi' };
const wrong = Object.entries(instances).filter(([s, t]) => typeOf(s) !== t);
check('an instance string resolves to its type: knob-mix and knob-volume are knobs called mix and volume', !wrong.length, wrong.map(([s]) => `${s} -> ${typeOf(s)}`).join(' ') || 'all');
// No catalogue name may read as another entry's instance, or a plain string means two things.
const shadowed = names.filter((n) => { try { typeOf(n); return false; } catch { return true; } });
check('no catalogue name is an instance another entry matches', !shadowed.length, shadowed.join(' ') || `${names.length} names`);
check('NEGATIVE CONTROL: midi-<n> is a number, so midi-x is nothing', typeOf('midi-x') === null, String(typeOf('midi-x')));
{
  // Put the old ambiguity back for a moment: a knob-shaped name must throw, not pick.
  NODES['knob-gain'] = { kind: 'engine', label: 'gain', ports: { 'value-out': {} }, pages: [] };
  const m = throws(() => typeOf('knob-gain'));
  delete NODES['knob-gain'];
  check('NEGATIVE CONTROL: a name that is also a knob instance throws rather than guessing', /knob-gain/.test(m) && /knob/.test(m), m);
}

// ── addNodes builds a bay bay.mjs accepts ─────────────────────────────────
// Every entry with every optional port, on one bay per entry.
const buildFail = [];
for (const n of names) {
  const e = NODES[n];
  const seg = e.node ?? n;
  const ports = Object.fromEntries(Object.keys(e.ports).map((p) => [`${seg}:${p}`, {}]));
  const site = e.place === 'site' ? 'err' : 'web';
  try {
    const bay = createBay();
    const r = addNodes(bay, site, [n], { ports });
    const id = `${e.site ?? site}:${seg}`;
    if (!bay.node(id) || bay.node(id).kind !== e.kind) buildFail.push(`${n} node`);
    if (r.ports.length !== Object.keys(e.ports).length) buildFail.push(`${n} ${r.ports.length} ports`);
    for (const pid of r.ports) if (!bay.port(pid)) buildFail.push(pid);
  } catch (err) { buildFail.push(`${n}: ${err.message}`); }
}
check('addNodes builds every entry with all its ports', !buildFail.length, buildFail.join('; ') || `${names.length} entries`);

// /synth/keyboard's patch, built from the catalogue, linked and played.
{
  const bay = createBay();
  const heard = [];
  addNodes(bay, 'web', ['keys', 'synth', 'speaker'], {
    deliver: { 'synth:midi-in': (e) => heard.push(e.d1), 'keys:midi-in': () => {} },
    label: { synth: 'saw' },
  });
  const a = bay.link('web:keys:midi-out', 'web:synth:midi-in');
  const b = bay.link('web:synth:audio-out', 'web:speaker:audio-in');
  check('the keyboard page links keys to synth to speakers', a.ok && b.ok, a.why || b.why || '');
  bay.send('web:keys:midi-out', { cls: 'note', ch: 1, d1: 60, d2: 100 });
  check('a note sent on keys:midi-out reaches the deliver the page passed', heard[0] === 60, JSON.stringify(heard));
  check('a page label overrides the default', bay.node('web:synth').label === 'saw' && NODES.synth.label !== 'saw', bay.node('web:synth').label);
  check('an optional port with a deliver is added', !!bay.port('web:keys:midi-in'));
  check('NEGATIVE CONTROL: an optional port nobody asked for is left out', !bay.port('web:keys:value-in'));
  const c = bay.link('web:synth:audio-out', 'web:keys:midi-out');
  check('NEGATIVE CONTROL: the bay still refuses a link the ports do not fit', !c.ok, c.why || 'linked');
}

// Per instance: knobs by string, drums by object, a station on its own site, a repeat.
{
  const bay = createBay();
  const r = addNodes(bay, 'web', ['knob-cutoff', { name: 'drum', as: 'kick', label: 'kick, SuperCollider' },
    { name: 'station', site: 'err', as: 'vikerraadio', label: 'Vikerraadio' }, 'machines', 'recording'],
  { ports: { 'machines:value-out-2': {}, 'machines:value-out-3': {} } });
  check('a knob instance takes its parameter as its label', bay.node('web:knob-cutoff')?.label === 'cutoff', bay.node('web:knob-cutoff')?.label);
  check('a drum instance is named by its voice', bay.node('web:kick')?.label === 'kick, SuperCollider');
  const st = bay.node('err:vikerraadio');
  check('a station sits on its broadcaster\'s site and asks for consent', st?.place === 'err' && st?.net === 'err' && st?.consent === true, JSON.stringify(st && { place: st.place, consent: st.consent }));
  check('a repeated port is added once per number asked', ['web:machines:value-out', 'web:machines:value-out-2', 'web:machines:value-out-3'].every((id) => bay.port(id)), r.ports.filter((p) => p.includes('machines')).join(' '));
  check('a fixed-site entry ignores the page site', !!bay.node('cf-r2:recording') && bay.node('cf-r2:recording').place === 'cloudflare');
  const l = bay.link('err:vikerraadio:audio-out', 'web:kick:midi-in');
  check('NEGATIVE CONTROL: audio into a midi-in is refused', !l.ok, l.why || 'linked');
}

// ── port order: a node's ports come with it, in the entry's order ─────────
{
  const bay = createBay();
  const all = (seg) => Object.fromEntries(Object.keys(NODES[seg === 'fx' ? 'fx-typewriter' : seg].ports).map((p) => [`${seg}:${p}`, {}]));
  addNodes(bay, 'web', ['keys', 'typewriter', 'fx-typewriter'], { ports: { ...all('keys'), ...all('typewriter'), ...all('fx') } });
  const order = (seg) => bay.ports().filter((p) => p.id.startsWith(`web:${seg}:`)).map((p) => p.id.split(':')[2]).join(' ');
  check('typewriter draws value-in-3, value-in, value-in-2, file-in, audio-out', order('typewriter') === 'value-in-3 value-in value-in-2 file-in audio-out', order('typewriter'));
  check('fx (typewriter) draws value-in-2, audio-in, value-in, audio-out', order('fx') === 'value-in-2 audio-in value-in audio-out', order('fx'));
  check('keys draws midi-out, value-in, value-in-2, midi-in', order('keys') === 'midi-out value-in value-in-2 midi-in', order('keys'));
  const nodesOf = bay.ports().map((p) => p.id.split(':').slice(0, 2).join(':'));
  const runs = nodesOf.filter((n, i) => n !== nodesOf[i - 1]);
  check('bay.ports() lists node by node, each node\'s ports together', runs.length === new Set(runs).size, runs.join(' '));
}

// ── portLabel: every port added is labelled with its own node:port ────────
{
  const bay = createBay();
  const r = addNodes(bay, 'web', ['keys', 'synth', { name: 'knob', as: 'knob-q' }], {
    portLabel: 'node:port', deliver: { 'keys:midi-in': () => {} }, ports: { 'synth:audio-out': { label: 'sound' } } });
  const lab = Object.fromEntries(r.ports.map((id) => [id.split(':').slice(1).join(':'), bay.port(id).label]));
  check('portLabel labels each added port <node>:<port>', lab['keys:midi-out'] === 'keys:midi-out' && lab['knob-q:value-out'] === 'knob-q:value-out' && lab['synth:midi-in'] === 'synth:midi-in', JSON.stringify(lab));
  check('a label in ports wins over portLabel', lab['synth:audio-out'] === 'sound', lab['synth:audio-out']);
  check('portLabel asks for no optional port', !bay.port('web:keys:value-in') && !bay.port('web:knob-q:value-in') && !!bay.port('web:keys:midi-in'));
  const plain = createBay();
  addNodes(plain, 'web', ['keys']);
  check('NEGATIVE CONTROL: without portLabel a port keeps no label of its own', plain.port('web:keys:midi-out').label === undefined, String(plain.port('web:keys:midi-out').label));
  const m = throws(() => addNodes(createBay(), 'web', ['keys'], { portLabel: 'port' }));
  check('NEGATIVE CONTROL: a portLabel other than node:port throws', /portLabel/.test(m), m);
}

// ── variants: port fields a page names rather than types ──────────────────
{
  const bay = createBay();
  addNodes(bay, 'web', [{ name: 'keys', variant: 'cc' }, { name: 'camera', variant: 'page' }, { name: 'knob', as: 'knob-x', variant: 'unshaped' }, 'synth']);
  check('keys, cc: midi-out emits note and cc', bay.port('web:keys:midi-out').emits.join() === 'note,cc', bay.port('web:keys:midi-out').emits.join());
  check('camera, page: video-out rides the page', bay.port('web:camera:video-out').transports?.join() === 'page', String(bay.port('web:camera:video-out').transports));
  check('knob, unshaped: value-out has an empty shape', JSON.stringify(bay.port('web:knob-x:value-out').shape) === '{}', JSON.stringify(bay.port('web:knob-x:value-out').shape));
  const plain = createBay();
  addNodes(plain, 'web', ['keys', 'camera', 'knob-x']);
  check('NEGATIVE CONTROL: without the variant the catalogue\'s own fields stand',
    plain.port('web:keys:midi-out').emits.join() === 'note' && !plain.port('web:camera:video-out').transports && plain.port('web:knob-x:value-out').shape.of === 'param');
  const m = throws(() => addNodes(createBay(), 'web', [{ name: 'keys', variant: 'pc' }]));
  check('NEGATIVE CONTROL: a variant the entry does not have throws', /variant/.test(m) && /pc/.test(m), m);
}

// ── addPorts: a port on a node addNodes built earlier ─────────────────────
{
  const bay = createBay();
  let got = null;
  addNodes(bay, 'web', ['grains', 'tempo', 'shader-dither']);
  const r = addPorts(bay, 'web', { 'web:grains:tempo-in': { label: 'tempo', deliver: (e) => { got = e; } } });
  const p = bay.port('web:grains:tempo-in');
  check('addPorts adds a catalogue port with its medium, label and deliver', p && p.medium === 'value' && p.dir === 'in' && p.label === 'tempo' && r.ports[0] === p.id, JSON.stringify(p && { medium: p.medium, label: p.label }));
  bay.link('web:tempo:value-out', 'web:grains:tempo-in');
  bay.send('web:tempo:value-out', { of: 'bpm', v: 120 });
  check('a value on the link reaches the deliver addPorts attached', got?.v === 120, JSON.stringify(got));
  // `shader` is three types; the one addNodes built is shader-dither, which has a video-in.
  const s = throws(() => addPorts(bay, 'web', { 'shader:video-in': {} }));
  check('addPorts finds the type addNodes built, not the entry the segment names', /already/.test(s), s);
  const m1 = throws(() => addPorts(bay, 'web', { 'wave:value-in-2': {} }));
  check('NEGATIVE CONTROL: a node addNodes did not build throws', /wave/.test(m1) && /addNodes/.test(m1), m1);
  const m2 = throws(() => addPorts(bay, 'web', { 'grains:clock-in': {} }));
  check('NEGATIVE CONTROL: a port the type does not have throws, naming the catalogue', /clock-in/.test(m2) && /nodes\.mjs/.test(m2), m2);
  const m3 = throws(() => addPorts(bay, 'web', { 'grains:tempo-in': {} }));
  check('NEGATIVE CONTROL: a port already in the bay throws', /already/.test(m3), m3);
}

// ── relabel ───────────────────────────────────────────────────────────────
{
  const bay = createBay();
  addNodes(bay, 'web', ['camera', 'screen']);
  const before = bay.nodes().map((n) => n.id).join();
  relabel(bay, 'web:camera', 'FaceTime HD Camera');
  check('relabel changes the label and keeps the node where it was', bay.node('web:camera').label === 'FaceTime HD Camera' && bay.nodes().map((n) => n.id).join() === before, bay.node('web:camera').label);
  check('relabel leaves every other field', bay.node('web:camera').kind === 'device' && bay.node('web:camera').place === 'browser');
  const m = throws(() => relabel(bay, 'web:cam', 'x'));
  check('NEGATIVE CONTROL: relabel of a node not in the bay throws', /web:cam/.test(m), m);
}

// ── the hops, each on its own site ────────────────────────────────────────
{
  const bay = createBay();
  addNodes(bay, 'web', [{ name: 'shout', as: 'vikerraadio' }, 'stream-live', 'stream-hls', 'moq-relay']);
  const n = (id) => bay.node(id);
  check('a shout hop is cf-shout:<mount> on its own place', n('cf-shout:vikerraadio')?.place === 'cf-shout' && n('cf-shout:vikerraadio')?.kind === 'endpoint' && !n('cf-shout:vikerraadio')?.net);
  check('Stream and MoQ sit on Cloudflare at their fixed ids', ['cf-stream:live', 'cf-stream:hls', 'cf-moq:relay'].every((id) => n(id)?.place === 'cloudflare' && n(id)?.net === 'cloudflare'));
  check('each hop carries its transports', bay.port('cf-stream:live:video-in').transports.join() === 'whip' && bay.port('cf-stream:hls:video-out').transports.join() === 'llhls'
    && !bay.port('cf-stream:hls:video-in').transports && bay.port('cf-shout:vikerraadio:audio-out').transports.join() === 'https');
}

// ── merges: one name per thing, and the pages keep their ids ──
// why: lessons/kit-nodes.md#test-merges
{
  // Each merged-away name is gone, and the page that used it builds the same node through `as`.
  const MERGED = { bpm: ['tempo', 'radio/live'], granulator: ['grains', 'shader/landscape'], radio: ['player', 'granulator/grains'] };
  for (const [old, [into, page]] of Object.entries(MERGED)) {
    const m = throws(() => addNodes(createBay(), 'web', [old]));
    check(`NEGATIVE CONTROL: ${old} is no catalogue name any more, it is ${into}`, !Object.hasOwn(NODES, old) && typeOf(old) === null
      && /nodes\.mjs/.test(m) && NODES[into].pages.includes(page), m);
  }
  const bay = createBay();
  addNodes(bay, 'web', [{ name: 'tempo', as: 'bpm' }, { name: 'grains', as: 'granulator', label: 'granulator' }, { name: 'player', as: 'radio', label: 'radio' }]);
  const ids = (seg) => bay.ports().filter((p) => p.id.startsWith(`web:${seg}:`)).map((p) => p.id.split(':')[2]).join(' ');
  check('bpm is a tempo detector at web:bpm, with the ports it had', bay.node('web:bpm')?.label === 'tempo detector' && ids('bpm') === 'audio-in value-out', ids('bpm'));
  check('landscape\'s granulator is grains at web:granulator with no value-in, as it had', bay.node('web:granulator')?.label === 'granulator'
    && ids('granulator') === 'audio-in audio-out value-out', ids('granulator'));
  check('the grain pages\' radio is a player at web:radio, file in and audio out', bay.node('web:radio')?.label === 'radio'
    && bay.node('web:radio').kind === 'engine' && ids('radio') === 'file-in audio-out', ids('radio'));
  const g = createBay();
  addNodes(g, 'web', ['grains'], { deliver: { 'grains:value-in': () => {} } });
  check('the grain pages still get grains:value-in, because they deliver to it', !!g.port('web:grains:value-in')
    && g.ports().map((p) => p.id.split(':')[2]).join(' ') === 'audio-in audio-out value-in value-out');
}

// ── kinds: a recorder is a store, a knob is a person ──────────────────────
{
  const segOf = (n) => NODES[n].node ?? n;
  const recorders = (cat) => Object.keys(cat).filter((n) => /^(rec|looper)$/.test(cat[n].node ?? n) && cat[n].kind !== 'store');
  const knobs = (cat) => Object.keys(cat).filter((n) => /^knob/.test(cat[n].node ?? n) && cat[n].kind !== 'person');
  check('every recorder is a store, rec-video among them', !recorders(NODES).length && NODES['rec-video'].kind === 'store', recorders(NODES).join(' '));
  check('every knob is a person, the mix knob among them', !knobs(NODES).length && NODES['mix-knob'].kind === 'person', knobs(NODES).join(' '));
  const old = { ...NODES, 'rec-video': { ...NODES['rec-video'], kind: 'engine' }, 'mix-knob': { ...NODES['mix-knob'], kind: 'engine' } };
  check('NEGATIVE CONTROL: the two checks find the kinds as they were', recorders(old).join() === 'rec-video' && knobs(old).join() === 'mix-knob',
    `${recorders(old)} ${knobs(old)}`);
  check('the rec and knob families are what the checks walk', ['rec', 'rec-text', 'rec-video', 'looper'].every((n) => /^(rec|looper)$/.test(segOf(n)))
    && ['knob', 'volume-knob', 'mix-knob'].every((n) => /^knob/.test(segOf(n))));
}

// ── one default label per type ────────────────────────────────────────────
{
  // A page label left in `labels` must be a word the owner kept: a pairing "here", a
  // second picture's "original", an instance's own name. The retired ones never.
  const RETIRED = { scope: ['scope', 'waveforms'], screen: ['screen', 'camera'], synth: ['saw synth'], knob: ['knob'], wave: ['source scope'] };
  const back = (cat) => Object.entries(RETIRED).flatMap(([n, words]) => Object.entries(cat[n].labels || {}).filter(([, l]) => words.includes(l)).map(([p, l]) => `${n} ${p} ${l}`));
  check('the scope says waveform, the screen picture, a knob its parameter', NODES.scope.label === 'waveform' && NODES.screen.label === 'picture'
    && NODES.knob.label === '<name>' && NODES.synth.label === 'sine' && !back(NODES).length, back(NODES).join('; '));
  const was = { ...NODES, scope: { ...NODES.scope, labels: { ...NODES.scope.labels, 'drums/remote': 'waveforms' } } };
  check('NEGATIVE CONTROL: a retired label put back is found', back(was).join() === 'scope drums/remote waveforms', back(was).join());
  // Every page that passes a label for these types in its source passes a kept one.
  const root = new URL('../', import.meta.url);
  const words = { scope: /\bscope: '([^']+)'/g, screen: /\bscreen: '([^']+)'/g, synth: /\bsynth: '([^']+)'/g };
  const found = [];
  for (const page of new Set(names.flatMap((n) => NODES[n].pages))) {
    const f = new URL(`${page}/index.html`, root);
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const [n, re] of Object.entries(words)) for (const m of text.matchAll(re)) if (RETIRED[n].includes(m[1])) found.push(`${page} ${n} ${m[1]}`);
  }
  check('no concept page passes a retired label for the scope, the screen or the synth', !found.length, found.join('; '));
}

// ── an unknown name throws, naming the catalogue ──────────────────────────
const m1 = throws(() => addNodes(createBay(), 'web', ['sinth']));
check('NEGATIVE CONTROL: an unknown name throws, naming the catalogue', /nodes\.mjs/.test(m1) && /sinth/.test(m1), m1);
const m2 = throws(() => addNodes(createBay(), 'web', ['keys'], { deliver: { 'keys:midi-inn': () => {} } }));
check('NEGATIVE CONTROL: a deliver for a port the type does not have throws', /nodes\.mjs/.test(m2) && /midi-inn/.test(m2), m2);
const m3 = throws(() => addNodes(createBay(), 'web', [{ name: 'knob-cutoff' }]));
check('NEGATIVE CONTROL: the object form takes only a catalogue name, not an instance', /nodes\.mjs/.test(m3), m3);

// ── a video room: two tabs are two machines, and media between them is p2p ──
{
  const b = createBay();
  for (const s of ['web-ab12', 'web-cd34']) addNodes(b, s, ['microphone', 'grid', 'controls']);
  const mic = b.link('web-ab12:microphone:audio-out', 'web-cd34:grid:audio-in');
  check('a microphone in one tab and a grid in another are linked p2p with no via', mic.ok && mic.session?.transport === 'p2p'
    && mic.session.where === 'internet-one', JSON.stringify(mic.session || mic.why));
  check('microphone, grid and controls take their tab\'s site as their place', ['microphone', 'grid', 'controls']
    .every((n) => b.node(`web-ab12:${n}`)?.place === 'web-ab12'), b.nodes().map((n) => `${n.id}@${n.place}`).join(' '));
  const one = createBay();
  addNodes(one, 'web-ab12', ['microphone', 'grid']);
  const self = one.validate('web-ab12:microphone:audio-out', 'web-ab12:grid:audio-in');
  check('NEGATIVE CONTROL: inside one tab the same pair is one machine, and p2p is refused there', !self.ok && /p2p/.test(self.why), self.why);
}

// ── every page listed exists on disk ──────────────────────────────────────
const root = new URL('../', import.meta.url);
const listed = new Set(names.flatMap((n) => [...NODES[n].pages, ...Object.keys(NODES[n].labels || {}), ...Object.values(NODES[n].variantPages || {}).flat()]));
const missing = [...listed].filter((p) => !existsSync(new URL(`${p}/index.html`, root)));
check('every page in pages and labels is demo/<page>/index.html', !missing.length, missing.join(' ') || `${listed.size} pages`);
const strays = Object.entries(NODES).flatMap(([n, e]) => Object.keys(e.labels || {}).filter((p) => !e.pages.includes(p)).map((p) => `${n} ${p}`));
check('a page with its own label also builds the type', !strays.length, strays.join(' '));
const vstrays = Object.entries(NODES).flatMap(([n, e]) => Object.entries(e.variantPages || {}).flatMap(([v, ps]) => [
  ...(Object.hasOwn(e.variants || {}, v) ? [] : [`${n} ${v} no such variant`]), ...ps.filter((p) => !e.pages.includes(p)).map((p) => `${n} ${v} ${p}`)]));
check('a variant\'s pages build the type, and the variant exists', !vstrays.length, vstrays.join(' '));
check('NEGATIVE CONTROL: a page that is not there is reported missing', !existsSync(new URL('synth/nothing/index.html', root)));

console.log(`\n${names.length} entries, ${listed.size} pages`);
console.log(`${ok} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
