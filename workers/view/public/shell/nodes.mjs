// demo/shell/nodes.mjs: the one catalogue of node types a browser tab builds. Pure; imports only the
// synth's parameter names. Key = catalogue name; `node`/`site` are the id's segments when they differ.
// A port's dir and medium come from its name unless it says otherwise. `optional`, `variants`, `pages`,
// `labels`, `match` and `instance` are described in the lesson; `also` is what people call a type, which
// /connect/ matches a sentence against and shows the model. Order: a node's ports come with it, in
// entry order; addPorts lands after every port added before.
// why: lessons/kit-nodes.md#header

import { PARAM_NAMES as SYNTH_PARAMS } from './synth-params.mjs';

const P = (o = {}) => o;
const NOTE = { emits: ['note'] }, TAKES_NOTE = { accepts: ['note'] };
const PARAM = { shape: { of: 'param' } }, TEXT = { shape: { of: 'text' } }, INDEX = { shape: { of: 'index' } };
const PAGE = { transports: ['page'] }, HTTPS = { transports: ['https'] };

export const NODES = {
  // ── people and the controls they hold ───────────────────────────────────
  keys: {
    kind: 'person', label: 'keyboard',
    // radio/key draws its lights last, after the two value-ins.
    ports: {
      'midi-out': P({ ...NOTE }),
      'value-in': P({ optional: true }),
      'value-in-2': P({ optional: true }),
      'midi-in': P({ ...TAKES_NOTE, optional: true }),
    },
    variants: { cc: { 'midi-out': { emits: ['note', 'cc'] } } },
    variantPages: { cc: ['code/piano', 'remote/piano'] },
    pages: ['synth/keyboard', 'synth/recorder', 'synth/timeline', 'synth/dots', 'synth/sound', 'code/faust',
      'code/collide', 'code/plaits', 'code/piano', 'remote/circuit', 'remote/collide', 'remote/piano',
      'remote/plaits', 'radio/key', 'room/words', 'code/wish'],
  },
  typing: {
    node: 'keys', kind: 'person', label: 'keyboard',
    instance: 'keys, or keys-<k> for typist k on typist/score, labelled typist <k>',
    ports: { 'value-out': P({ ...TEXT }) },
    pages: ['typist/paper', 'typist/typewriter', 'typist/machines', 'typist/playback', 'typist/score'],
    labels: { 'typist/score': 'typist <k>' },
  },
  midi: {
    kind: 'device', label: 'MIDI keyboard', match: ['midi', 'midi-<n>'],
    instance: 'one per plugged-in MIDI input: midi, midi-2, midi-3 in plug order (createMidiDevices), labelled with the input\'s own name',
    ports: { 'midi-out': P({ ...NOTE }) },
    pages: ['synth/keyboard', 'code/plaits', 'code/piano', 'remote/circuit', 'remote/plaits'],
  },
  knob: {
    kind: 'person', label: '<name>', match: ['knob-<name>'],
    instance: 'knob-<name>, one per parameter, labelled with the parameter; knob-<name>-<n> is a second knob for the same parameter of the n-th instance (/connect/)',
    ports: { 'value-out': P({ ...PARAM }), 'value-in': P({ optional: true }) },
    // An empty shape: landscape's knobs are where any value can land later.
    variants: { unshaped: { 'value-out': { shape: {} } } },
    variantPages: { unshaped: ['shader/landscape'] },
    pages: ['synth/sound', 'code/faust', 'code/collide', 'code/plaits', 'granulator/grains', 'granulator/beat',
      'remote/circuit', 'remote/collide', 'remote/plaits', 'video/shader', 'shader/mirror', 'shader/landscape',
      'shader/remote', 'typist/machines', 'drums/knobs', 'shader/wish'],
    labels: { 'remote/circuit': 'macro <n>', 'drums/knobs': '<drum> <param>', 'granulator/grains': 'wet/dry (knob-mix)',
      'granulator/beat': 'wet/dry (knob-mix)' },
  },
  'volume-knob': {
    node: 'knob-volume', kind: 'person', label: 'knob',
    ports: { 'midi-out': P({ emits: ['cc'] }) },
    pages: ['synth/dots'],
  },
  // A control, as every knob is; its value-out carries no shape, so it is not a knob instance.
  'mix-knob': {
    node: 'knob-mix', kind: 'person', label: 'mix knob',
    ports: { 'value-out': P() },
    pages: ['radio/live', 'radio/tempo', 'radio/key'],
  },
  fader: {
    kind: 'person', label: 'fader',
    ports: { 'value-out': P({ ...PARAM }) },
    pages: ['remote/collide', 'drums/remote'],
  },
  dial: {
    kind: 'person', label: 'dial',
    ports: { 'value-out': P({ ...PARAM }) },
    pages: ['radio/tuner'],
  },
  patch: {
    kind: 'person', label: 'patch',
    ports: { 'midi-out': P({ emits: ['program'] }) },
    pages: ['code/piano', 'remote/circuit', 'remote/piano'],
  },
  pick: {
    kind: 'person', label: 'machine',
    ports: { 'value-out': P({ ...INDEX }) },
    pages: ['typist/machines'],
  },
  machines: {
    kind: 'person', label: 'machines',
    instance: 'one value-out per typist: value-out, value-out-2 .. value-out-<n>',
    ports: { 'value-out': P({ ...INDEX, repeat: true }) },
    pages: ['typist/score'],
  },
  code: {
    kind: 'person', label: 'code box',
    ports: { 'program-out': P({ shape: { of: 'glsl' } }) },
    pages: ['shader/remote'],
  },
  // A wish: a sentence a model writes into a program; what leaves is the code box's event.
  wish: {
    kind: 'person', label: 'wish',
    ports: { 'program-out': P({ shape: { of: 'glsl' } }) },
    variants: { sclang: { 'program-out': { shape: { of: 'sclang' } } } },
    variantPages: { sclang: ['code/wish'] },
    pages: ['shader/wish', 'code/wish'],
  },
  invert: {
    kind: 'person', label: 'invert',
    ports: { 'value-out': P({ ...PARAM }) },
    pages: ['drums/camera'],
  },
  scale: {
    kind: 'person', label: '1x or 2x',
    ports: { 'value-out': P({ ...PARAM }) },
    pages: ['drums/camera'],
  },
  chat: {
    kind: 'person', label: 'chat',
    instance: 'on the tab\'s own random site, web-<4 letters>',
    ports: { 'value-out': P(), 'value-in': P() },
    pages: ['room/chat', 'room/broadcast', 'room/history'],
  },
  admin: {
    kind: 'person', label: 'admin',
    ports: { 'value-out': P() },
    pages: ['room/broadcast', 'room/history'],
  },
  // A video room's tab. `place: 'site'`: two tabs may be two machines, so neither says `browser`.
  // why: lessons/kit-nodes.md#video-room
  controls: {
    kind: 'person', label: 'mic and camera buttons', place: 'site',
    instance: 'one per tab: whether this tab\'s microphone and camera are on, said to every other tab',
    ports: { 'value-out': P() },
    pages: ['room/present', 'room/stage', 'room/mesh'],
  },

  // ── engines: what makes or changes a sound, a picture or an event ───────
  synth: {
    // The kit voice (synth-voice.mjs) is a sine, so that is what an unlabelled synth says.
    kind: 'engine', label: 'sine', also: ['synth', 'synthesizer'],
    // value-in takes the voice's parameters, only on /connect/ today.
    ports: { 'midi-in': P({ ...TAKES_NOTE }), 'audio-out': P(),
      'value-in': P({ shape: { of: 'param', names: [...SYNTH_PARAMS] }, optional: true }) },
    pages: ['synth/keyboard', 'synth/recorder', 'synth/timeline', 'synth/dots', 'room/words'],
    labels: { 'synth/recorder': 'saw', 'synth/timeline': 'saw', 'synth/dots': 'saw', 'room/words': 'saw' },
  },
  osc: {
    kind: 'engine', label: 'oscillator',
    ports: { 'midi-in': P({ ...TAKES_NOTE }), 'value-in': P({ shape: { of: 'param', names: ['freq', 'detune', 'wave'] } }), 'audio-out': P() },
    pages: ['synth/sound'],
  },
  filter: {
    kind: 'engine', label: 'lowpass filter',
    ports: {
      'audio-in': P(),
      // Named for the parameter it moves, plans/plan-synth-patch.md §3 option A.
      'cutoff-in': P({ dir: 'in', medium: 'audio' }),
      'value-in': P({ shape: { of: 'param', names: ['cutoff', 'q'] } }),
      'audio-out': P(),
    },
    pages: ['synth/sound'],
  },
  amp: {
    kind: 'engine', label: 'amp and envelope',
    ports: { 'audio-in': P(), 'midi-in': P({ ...TAKES_NOTE }),
      'value-in': P({ shape: { of: 'param', names: ['attack', 'decay', 'sustain', 'release'] } }), 'audio-out': P() },
    pages: ['synth/sound'],
  },
  lfo: {
    kind: 'engine', label: 'lfo',
    ports: { 'value-in': P({ shape: { of: 'param', names: ['rate', 'depth'] } }), 'audio-out': P() },
    pages: ['synth/sound'],
  },
  fau: {
    kind: 'engine', label: 'Faust',
    ports: { 'midi-in': P({ ...TAKES_NOTE }), 'value-in': P({ ...PARAM }), 'audio-out': P() },
    pages: ['code/faust'],
  },
  collide: {
    kind: 'engine', label: 'SuperCollider',
    ports: { 'midi-in': P({ ...TAKES_NOTE }), 'value-in': P({ ...PARAM }),
      'program-in': P({ shape: { of: 'sclang' }, optional: true }), 'audio-out': P() },
    pages: ['code/collide', 'remote/collide', 'code/wish'],
    labels: { 'remote/collide': 'SuperCollider here' },
  },
  plaits: {
    // "plates" is how Plaits is said, and what speech recognition writes for it.
    kind: 'engine', label: 'Plaits', also: ['plates'],
    ports: { 'midi-in': P({ ...TAKES_NOTE }), 'value-in': P({ ...PARAM }), 'audio-out': P() },
    pages: ['code/plaits'],
  },
  sampler: {
    kind: 'engine', label: 'SuperCollider sampler',
    ports: { 'midi-in': P({ accepts: ['note', 'program'] }), 'file-in': P(), 'audio-out': P() },
    pages: ['code/piano'],
  },
  'midi-state': {
    node: 'midi', kind: 'engine', label: 'midi state',
    ports: { 'midi-in': P({ accepts: ['note', 'cc'] }), 'value-out': P() },
    pages: ['synth/dots'],
  },
  pico: {
    kind: 'device', label: 'Pico (emulated)',
    ports: { 'midi-in': P({ accepts: ['note', 'cc'] }), 'video-out': P() },
    pages: ['synth/dots'],
  },
  shader: {
    kind: 'engine', label: 'mirror shader',
    ports: {
      'value-in': P({ shape: { of: 'param', names: ['segments'] } }),
      'program-in': P({ shape: { of: 'glsl' }, optional: true }),
      'video-out': P({ ...PAGE }),
    },
    pages: ['shader/mirror', 'shader/remote', 'shader/wish'],
    labels: { 'shader/remote': 'mirror shader here' },
  },
  'shader-dots': {
    node: 'shader', kind: 'engine', label: 'shader',
    ports: { 'value-in': P(), 'video-out': P() },
    pages: ['synth/dots'],
  },
  'shader-dither': {
    node: 'shader', kind: 'engine', label: 'dither shader',
    ports: { 'video-in': P(), 'video-out': P({ ...PAGE }), 'value-in': P({ shape: { of: 'param', names: ['size'] } }) },
    pages: ['video/shader'],
  },
  'shader-landscape': {
    node: 'shader', kind: 'engine', label: 'scan landscape',
    ports: { 'audio-in': P(), 'value-in': P(), 'video-out': P({ ...PAGE }) },
    pages: ['shader/landscape', 'radio/scenery'],
  },
  pixelate: {
    kind: 'engine', label: 'squares, dithered',
    ports: { 'video-in': P(), 'video-out': P({ ...PAGE }), 'value-out': P({ shape: { of: 'pattern' } }),
      'value-in': P({ shape: { of: 'param', names: ['invert', 'scale'] } }) },
    pages: ['drums/camera'],
  },
  // Formerly `radio`: the grain pages and landscape ask `{ name: 'player', as: 'radio' }`.
  // why: lessons/kit-nodes.md#player-was-radio
  player: {
    kind: 'engine', label: 'player',
    ports: { 'file-in': P(), 'audio-out': P() },
    pages: ['radio/tempo', 'granulator/grains', 'granulator/beat', 'shader/landscape'],
    labels: { 'granulator/grains': 'radio', 'granulator/beat': 'radio', 'shader/landscape': 'radio' },
  },
  'player-video': {
    node: 'player', kind: 'engine', label: 'player',
    ports: { 'file-in': P(), 'video-out': P({ ...PAGE }), 'value-in': P({ optional: true }) },
    pages: ['video/recorder'],
  },
  level: {
    kind: 'engine', label: 'level',
    ports: { 'audio-in': P(), 'audio-out': P(), 'value-out': P({ optional: true }) },
    pages: ['radio/live', 'radio/key'],
  },
  // Formerly `granulator`: landscape asks `{ name: 'grains', as: 'granulator' }`.
  // why: lessons/kit-nodes.md#grains-was-granulator
  grains: {
    kind: 'engine', label: 'grain ring', also: ['granulator', 'granulate', 'grains'],
    ports: { 'audio-in': P(), 'audio-out': P(), 'value-in': P({ optional: true }), 'value-out': P(),
      'tempo-in': P({ dir: 'in', medium: 'value', optional: true }) },
    pages: ['granulator/grains', 'granulator/beat', 'shader/landscape', 'radio/scenery'],
    labels: { 'shader/landscape': 'granulator', 'radio/scenery': 'granulator' },
  },
  'patch-values': {
    node: 'patch', kind: 'engine', label: 'patch',
    // value-out-2 (the fixed values) is the grain rig's; /radio/scenery/ sends a whole patch on value-out.
    ports: { 'value-out': P(), 'value-out-2': P({ optional: true }) },
    pages: ['granulator/grains', 'granulator/beat', 'radio/scenery'],
  },
  // Formerly `bpm`: radio/rig.mjs asks `{ name: 'tempo', as: 'bpm' }`.
  // why: lessons/kit-nodes.md#tempo-was-bpm
  tempo: {
    kind: 'engine', label: 'tempo detector',
    ports: { 'audio-in': P(), 'value-out': P() },
    pages: ['granulator/beat', 'radio/live', 'radio/tempo'],
  },
  key: {
    kind: 'engine', label: 'key detector',
    ports: { 'audio-in': P(), 'value-out': P() },
    pages: ['radio/key'],
  },
  fx: {
    kind: 'engine', label: 'low-pass filter',
    ports: { 'audio-in': P(), 'audio-out': P() },
    pages: ['room/words'],
  },
  'fx-click': {
    node: 'fx', kind: 'engine', label: 'low cut and click',
    ports: { 'audio-in': P(), 'value-in': P(), 'value-in-2': P(), 'audio-out': P() },
    pages: ['radio/live', 'radio/tempo'],
  },
  'fx-typewriter': {
    node: 'fx', kind: 'engine', label: 'fx',
    instance: 'fx, or fx-<k> for typist k on typist/score, labelled fx <k>',
    ports: { 'value-in-2': P({ ...PARAM, optional: true }), 'audio-in': P(), 'value-in': P({ ...INDEX }), 'audio-out': P() },
    pages: ['typist/machines', 'typist/score'],
    labels: { 'typist/score': 'fx <k>' },
  },
  typewriter: {
    kind: 'engine', label: 'typewriter',
    instance: 'typewriter, or typewriter-<k> for typist k on typist/score, labelled typewriter <k>',
    ports: { 'value-in-3': P({ ...PARAM, optional: true }), 'value-in': P({ ...TEXT }), 'value-in-2': P({ ...INDEX, optional: true }),
      'file-in': P({ optional: true }), 'audio-out': P() },
    pages: ['typist/typewriter', 'typist/machines', 'typist/playback', 'typist/score'],
    labels: { 'typist/score': 'typewriter <k>' },
  },
  autoplay: {
    kind: 'engine', label: 'autoplay',
    ports: { 'value-in': P(), 'midi-out': P({ emits: ['note', 'cc'] }), 'value-out': P(), 'midi-out-2': P({ emits: ['note', 'cc'] }) },
    pages: ['radio/key'],
  },
  bass: {
    kind: 'engine', label: 'bass',
    ports: { 'midi-in': P({ accepts: ['note', 'cc'] }), 'audio-out': P() },
    pages: ['radio/key'],
  },
  pad: {
    kind: 'engine', label: 'pad synth',
    ports: { 'midi-in': P({ accepts: ['note', 'cc'] }), 'midi-out': P({ ...NOTE }), 'audio-out': P(), 'value-in': P() },
    pages: ['radio/key'],
  },
  mixer: {
    kind: 'engine', label: 'wet / dry',
    ports: { 'audio-in': P(), 'audio-in-2': P(), 'value-in': P(), 'audio-out': P() },
    pages: ['radio/key'],
  },
  xfade: {
    kind: 'engine', label: 'crossfader',
    ports: { 'value-in': P({ shape: { of: 'param', names: ['x'] } }), 'audio-in': P(), 'audio-in-2': P(), 'audio-out': P() },
    pages: ['remote/collide', 'drums/remote'],
  },
  'blend-fader': {
    node: 'fader', kind: 'engine', label: 'crossfader',
    ports: { 'audio-in': P(), 'audio-out': P() },
    pages: ['radio/blend'],
  },
  noise: {
    kind: 'engine', label: 'noise',
    ports: { 'audio-out': P() },
    pages: ['radio/tuner', 'radio/scenery'],
  },
  tuner: {
    kind: 'engine', label: 'tuner',
    // value-out says which station the dial has, so a picture can tear when one comes in.
    ports: { 'audio-in': P(), 'audio-out': P(), 'value-in': P({ shape: { of: 'param', names: ['tune'] } }),
      'value-out': P({ shape: { of: 'tuned' }, optional: true }) },
    pages: ['radio/tuner', 'radio/scenery'],
  },
  // A clock in place of a dial: value-out tunes the tuner, value-out-2 says how far between stations.
  drift: {
    kind: 'engine', label: 'drift', also: ['auto tuner', 'clock'],
    ports: { 'value-out': P({ ...PARAM }), 'value-out-2': P({ shape: { of: 'storm' } }) },
    pages: ['radio/scenery'],
  },
  sequencer: {
    kind: 'engine', label: 'sequencer', also: ['drum machine', 'drums'],
    ports: { 'midi-out': P({ ...NOTE }), 'value-in': P({ shape: { of: 'pattern' }, optional: true }) },
    pages: ['drums/machine', 'drums/knobs', 'drums/samples', 'drums/camera', 'drums/remote'],
  },
  drum: {
    kind: 'engine', label: '<drum>, SuperCollider',
    instance: 'one per voice, named by the voice key (kick, snare, hho, hhc, clap ...; s0 .. s63 on drums/samples), labelled "<voice label>, SuperCollider"',
    ports: { 'midi-in': P({ ...TAKES_NOTE }), 'audio-out': P(), 'value-in': P({ ...PARAM, optional: true }) },
    pages: ['drums/machine', 'drums/knobs', 'drums/samples', 'drums/camera', 'drums/remote'],
  },
  mix: {
    kind: 'engine', label: 'drums mixed',
    ports: { 'audio-in': P(), 'audio-out': P() },
    pages: ['drums/remote'],
  },
  timeline: {
    kind: 'engine', label: 'timeline',
    ports: { 'value-out': P(), 'clock-in': P() },
    pages: ['history/newsreels'],
  },

  // ── stores in the tab ───────────────────────────────────────────────────
  rec: {
    kind: 'store', label: 'recorder',
    ports: { 'midi-in': P({ ...TAKES_NOTE }), 'midi-out': P({ ...NOTE }) },
    pages: ['synth/recorder', 'synth/timeline', 'synth/dots', 'room/words'],
  },
  'rec-text': {
    node: 'rec', kind: 'store', label: 'recorder',
    ports: { 'value-in': P({ ...TEXT }), 'value-out': P({ ...TEXT }) },
    pages: ['typist/playback'],
  },
  'rec-video': {
    node: 'rec', kind: 'store', label: 'recorder',
    ports: { 'video-in': P(), 'file-out': P() },
    pages: ['video/recorder'],
  },
  looper: {
    kind: 'store', label: 'looper',
    ports: { 'midi-in': P({ accepts: ['note', 'cc'] }), 'midi-out': P({ ...NOTE }) },
    pages: ['code/piano'],
  },
  store: {
    kind: 'store', label: 'this browser',
    ports: { 'file-in': P(), 'file-out': P() },
    pages: ['video/recorder'],
  },

  // ── screens, speakers and cameras ───────────────────────────────────────
  speaker: {
    kind: 'screen', label: 'speakers',
    ports: { 'audio-in': P(), 'value-in': P({ optional: true }), 'clock-in': P({ optional: true }) },
    pages: ['synth/keyboard', 'synth/recorder', 'synth/timeline', 'synth/dots', 'synth/sound', 'code/faust',
      'code/collide', 'code/plaits', 'code/piano', 'granulator/grains', 'granulator/beat', 'remote/circuit',
      'remote/collide', 'remote/piano', 'remote/plaits', 'radio/blend', 'radio/tuner', 'radio/tempo', 'radio/live', 'radio/key',
      'shader/landscape', 'radio/scenery', 'room/words', 'typist/typewriter', 'typist/machines', 'typist/playback', 'typist/score',
      'drums/machine', 'drums/knobs', 'drums/samples', 'drums/camera', 'drums/remote', 'history/newsreels', 'code/wish'],
  },
  scope: {
    kind: 'screen', label: 'waveform', match: ['scope-<name>'],
    instance: 'scope; scope-pi beside it on remote/collide (Pi waveform); scope-<drum> per voice on drums/knobs (scope)',
    ports: { 'audio-in': P(), 'audio-in-2': P({ optional: true }), 'midi-in': P({ ...TAKES_NOTE, optional: true }),
      'value-in': P({ optional: true }) },
    pages: ['synth/sound', 'code/faust', 'code/collide', 'code/plaits', 'remote/circuit', 'remote/collide',
      'remote/piano', 'remote/plaits', 'drums/knobs', 'drums/remote', 'room/words'],
    // "here" pairs it with the Pi's waveform beside it.
    labels: { 'remote/collide': 'waveform here' },
  },
  wave: {
    kind: 'screen', label: 'wave', match: ['wave-<name>'],
    instance: 'wave; wave-<station> per station on radio/blend (ERR wave, Ida wave)',
    ports: { 'audio-in': P(), 'value-in': P({ optional: true }), 'value-in-2': P({ optional: true }) },
    pages: ['radio/blend', 'radio/tuner', 'radio/tempo', 'radio/live', 'radio/key', 'granulator/grains', 'granulator/beat'],
    labels: { 'radio/blend': 'ERR wave, Ida wave' },
  },
  display: {
    kind: 'screen', label: 'tempo scope',
    ports: { 'value-in': P() },
    pages: ['radio/tempo', 'radio/live'],
  },
  screen: {
    kind: 'screen', label: 'picture', match: ['screen-<name>'],
    instance: 'screen; a second picture beside it is its own node: screen-pi (Pi picture), dither (dithered), playback, loopback (WebRTC), hls (LL-HLS), moq (MoQ), pixels',
    ports: { 'video-in': P(), 'value-in': P({ optional: true }), 'clock-out': P({ optional: true }) },
    pages: ['synth/dots', 'shader/mirror', 'shader/remote', 'shader/landscape', 'radio/scenery', 'shader/wish', 'video/camera', 'video/shader',
      'video/recorder', 'video/webrtc', 'video/llhls', 'video/moq', 'drums/camera', 'remote/circuit', 'history/newsreels'],
    // `original` where a second picture beside it needs telling apart; "here" pairs with the Pi's.
    labels: { 'video/shader': 'original', 'video/webrtc': 'original', 'video/llhls': 'original', 'video/moq': 'original',
      'drums/camera': 'original', 'shader/remote': 'picture here' },
  },
  grid: {
    kind: 'screen', label: 'grid', place: 'site',
    instance: 'one per tab: every other tab\'s camera and microphone as tiles, and who is muted',
    ports: { 'video-in': P({ transports: ['page', 'p2p', 'sfu'] }), 'audio-in': P({ transports: ['p2p', 'sfu'] }), 'value-in': P() },
    pages: ['room/present', 'room/stage', 'room/mesh'],
  },
  // The big picture while somebody presents (room/present) or streams (room/stage, with its sound), on every tab.
  // why: lessons/kit-nodes.md#video-room
  stage: {
    kind: 'screen', label: 'stage', place: 'site',
    instance: 'one per tab: the presenter\'s screen or the live stream; value-in hears who leads',
    ports: { 'video-in': P({ transports: ['page', 'p2p', 'sfu'] }), 'audio-in': P({ transports: ['sfu'], optional: true }), 'value-in': P() },
    pages: ['room/present', 'room/stage'],
  },
  oled: {
    kind: 'screen', label: 'OLED',
    ports: { 'video-in': P() },
    pages: ['synth/dots'],
  },
  paper: {
    kind: 'screen', label: 'paper',
    instance: 'paper, or paper-<k> for typist k on typist/score, labelled paper <k>',
    ports: { 'value-in': P({ ...TEXT }) },
    pages: ['typist/paper', 'typist/typewriter', 'typist/machines', 'typist/playback', 'typist/score'],
    labels: { 'typist/score': 'paper <k>' },
  },
  notice: {
    kind: 'screen', label: 'broadcast',
    ports: { 'value-in': P() },
    pages: ['room/broadcast', 'room/history'],
  },
  microphone: {
    kind: 'device', label: 'microphone', place: 'site',
    instance: 'one per tab, asked for on Join',
    ports: { 'audio-out': P({ transports: ['p2p', 'sfu'] }) },
    pages: ['room/present', 'room/stage', 'room/mesh'],
  },
  // A tab's screen, from getDisplayMedia: one presenter at a time in a video room.
  // why: lessons/kit-nodes.md#video-room
  share: {
    kind: 'device', label: 'screen share', place: 'site',
    instance: 'one per tab where the browser can capture a screen (not a phone); value-out says it presents',
    ports: { 'video-out': P({ transports: ['page', 'p2p', 'sfu'] }), 'value-out': P() },
    pages: ['room/present'],
  },
  // A live stream on room/stage: a film from the bucket played in one tab and sent with captureStream(), picture
  // and sound, one streamer at a time. why: lessons/kit-nodes.md#video-room
  stream: {
    kind: 'engine', label: 'stream', place: 'site',
    instance: 'one per tab where the browser can capture a <video> (not an iPhone); value-out says it streams',
    ports: { 'file-in': P({ ...HTTPS }), 'video-out': P({ transports: ['page', 'sfu'] }), 'audio-out': P({ transports: ['sfu'] }), 'value-out': P() },
    pages: ['room/stage'],
  },
  camera: {
    kind: 'device', label: 'camera',
    // relabel() gives it the device's name.
    instance: 'one per tab; the label becomes the camera\'s own name once it is on',
    ports: { 'video-out': P() },
    // Drawn in this tab; the three loopback pages send it away and leave transports to the link.
    variants: { page: { 'video-out': { ...PAGE } } },
    variantPages: { page: ['video/camera', 'video/shader', 'video/recorder', 'drums/camera'] },
    pages: ['video/camera', 'video/shader', 'video/recorder', 'video/webrtc', 'video/llhls', 'video/moq', 'drums/camera', 'room/present', 'room/stage', 'room/mesh'],
  },

  // ── somewhere else: a bucket, a store, a broadcaster ────────────────────
  recording: {
    site: 'cf-r2', place: 'cloudflare', net: 'cloudflare', kind: 'store', label: '<station> recording',
    instance: 'one per recording in the bucket: raadio2, raadio4, ida (Raadio 2 recording ...); the file-out carries its URL as address',
    ports: { 'file-out': P({ ...HTTPS }) },
    pages: ['granulator/grains', 'granulator/beat', 'shader/landscape', 'radio/tempo'],
  },
  'piano-samples': {
    node: 'piano', site: 'cf-r2', place: 'cloudflare', net: 'cloudflare', kind: 'store', label: 'piano samples',
    ports: { 'file-out': P({ ...HTTPS }) },
    pages: ['code/piano', 'remote/piano'],
  },
  'rhodes-samples': {
    node: 'rhodes', site: 'cf-r2', place: 'cloudflare', net: 'cloudflare', kind: 'store', label: 'Rhodes samples',
    ports: { 'file-out': P({ ...HTTPS }) },
    pages: ['code/piano', 'remote/piano'],
  },
  'typewriter-samples': {
    node: 'typewriter', site: 'cf-r2', place: 'cloudflare', net: 'cloudflare', kind: 'store', label: 'samples',
    ports: { 'file-out': P({ ...HTTPS }) },
    pages: ['typist/typewriter', 'typist/machines', 'typist/score'],
  },
  'history-store': {
    node: 'history', site: 'cf-store', place: 'cloudflare', net: 'cloudflare', kind: 'store', label: 'history',
    ports: { 'value-in': P({ transports: ['relay'] }), 'value-out': P({ ...HTTPS }) },
    pages: ['room/history'],
  },
  station: {
    place: 'site', net: 'site', kind: 'external', label: '<station>',
    instance: 'a live station on its broadcaster\'s site: err:vikerraadio, err:klassikaraadio, err:raadio2, err:raadio4, err:raadiotallinn, ida:tallinn, ida:helsinki',
    ports: { 'audio-out': P({ ...HTTPS }) },
    pages: ['radio/blend', 'radio/tuner', 'radio/live', 'radio/key', 'radio/scenery'],
    labels: { 'radio/live': 'ERR Raadio 2 (with the broadcaster)', 'radio/key': 'ERR Raadio 2 (with the broadcaster)' },
  },
  newsreel: {
    site: 'err', place: 'err', net: 'err', kind: 'external', label: 'newsreel',
    ports: { 'video-out': P({ ...HTTPS }) },
    pages: ['history/newsreels'],
  },
  'err-radio': {
    node: 'radio', site: 'err', place: 'err', net: 'err', kind: 'external', label: 'radio',
    ports: { 'audio-out': P({ ...HTTPS }) },
    pages: ['history/newsreels'],
  },

  // ── the hops in between: our relay for a station, Stream, MoQ ────────────
  shout: {
    site: 'cf-shout', place: 'site', kind: 'endpoint', label: 'relay',
    // A page asks `{ name: 'shout', as: st.mount }` and passes the mount URL as the audio-out's address.
    instance: 'one per station mount, cf-shout:<mount>',
    ports: { 'audio-in': P({ ...HTTPS }), 'audio-out': P({ ...HTTPS }) },
    pages: ['radio/blend', 'radio/tuner', 'radio/live', 'radio/key', 'radio/scenery'],
  },
  'stream-live': {
    node: 'live', site: 'cf-stream', place: 'cloudflare', net: 'cloudflare', kind: 'endpoint', label: 'Stream WebRTC input',
    ports: { 'video-in': P({ transports: ['whip'] }), 'video-out': P({ transports: ['whep'] }) },
    pages: ['video/webrtc'],
  },
  'stream-hls': {
    node: 'hls', site: 'cf-stream', place: 'cloudflare', net: 'cloudflare', kind: 'endpoint', label: 'Stream LL-HLS input',
    ports: { 'video-in': P(), 'video-out': P({ transports: ['llhls'] }) },
    pages: ['video/llhls'],
  },
  'moq-relay': {
    node: 'relay', site: 'cf-moq', place: 'cloudflare', net: 'cloudflare', kind: 'endpoint', label: 'MoQ relay',
    ports: { 'video-in': P({ transports: ['moq'] }), 'video-out': P({ transports: ['moq'] }) },
    pages: ['video/moq'],
  },
};

/** `value-in-2` is value, in; a port named otherwise says its own. */
export function portOf(name, p = {}) {
  const [medium, dir] = name.split('-');
  return { medium: p.medium ?? medium, dir: p.dir ?? dir };
}

const CATALOGUE = 'demo/shell/nodes.mjs NODES';
// `<n>` is a number (midi-2), any other `<word>` a name (knob-cutoff).
const patternRe = (pat) => new RegExp(`^${pat.replace(/<n>/g, '\\d+').replace(/<[^>]+>/g, '[A-Za-z0-9_.]+(?:-[A-Za-z0-9_.]+)*')}$`);

/** The catalogue name a plain string means: a name, or an instance one entry matches. */
export function typeOf(name) {
  const hits = Object.keys(NODES).filter((k) => (NODES[k].match || []).some((m) => patternRe(m).test(name)));
  if (Object.hasOwn(NODES, name)) {
    // A name that also reads as somebody's instance means two things; refuse to pick.
    const others = hits.filter((k) => k !== name);
    if (others.length) throw new Error(`nodes: ${JSON.stringify(name)} is a name in ${CATALOGUE} and an instance of ${others.join(', ')}`);
    return name;
  }
  return hits.length === 1 ? hits[0] : null;
}

// The catalogue type of every node addNodes built, per bay, so addPorts can
// find the entry without the page saying it again (`shader` is three types).
const BUILT = new WeakMap();
const PORT_LABELS = new Set(['node:port']);

/** One port of entry `e` on node `id` (segment `seg`), with a page's fields over the catalogue's. */
function addPort(bay, e, id, seg, pname, { deliver, fields, variant, portLabel }) {
  const base = e.ports[pname] ?? e.ports[pname.replace(/-\d+$/, '')];
  const { optional, repeat, ...cat } = base;
  const v = variant ? e.variants[variant][pname] : undefined;
  return bay.addPort({ id: `${id}:${pname}`, ...portOf(pname.replace(/-\d+$/, ''), base), ...cat, ...(v || {}),
    ...(portLabel ? { label: `${seg}:${pname}` } : {}), ...(fields || {}), ...(deliver ? { deliver } : {}) }).id;
}

function checkPortLabel(portLabel) {
  if (portLabel !== undefined && !PORT_LABELS.has(portLabel)) {
    throw new Error(`nodes: portLabel is one of ${[...PORT_LABELS].join(', ')}, not ${JSON.stringify(portLabel)}`);
  }
}

/**
 * Add catalogue nodes and their ports to a bay.
 * @param {object} bay        a createBay()
 * @param {string} site       the page's site, `web`
 * @param {Array<string|{name, as?, site?, label?, variant?}>} names  a catalogue
 *   name, an instance it matches (`knob-cutoff`), or `{ name: 'drum', as: 'kick' }`
 * @param {object} [o.deliver]  `{ '<node>:<port>': fn }`, attached to that port
 * @param {object} [o.label]    `{ '<node>': 'sine' }`, this page's label
 * @param {object} [o.ports]    `{ '<node>:<port>': { ...fields } }` merged onto
 *   that port; it also asks for an optional port or a repeat (`value-out-3`)
 * @param {string} [o.portLabel] `'node:port'` labels every port added here with
 *   its own `<node>:<port>`, which is what a refusal names; `ports` still wins
 * @returns {{ nodes: string[], ports: string[] }} the ids added
 */
export function addNodes(bay, site, names, { deliver = {}, label = {}, ports = {}, portLabel } = {}) {
  checkPortLabel(portLabel);
  const added = { nodes: [], ports: [] };
  const used = new Set();
  const pick = (map, node, id) => {
    for (const k of [id, node]) if (Object.hasOwn(map, k)) { used.add(`${map === deliver ? 'd' : map === label ? 'l' : 'p'} ${k}`); return map[k]; }
    return undefined;
  };
  if (!BUILT.has(bay)) BUILT.set(bay, new Map());
  for (const n of names) {
    const o = typeof n === 'string' ? { name: n } : n;
    const type = typeof n === 'string' ? typeOf(o.name) : (Object.hasOwn(NODES, o.name) ? o.name : null);
    if (!type) throw new Error(`nodes: no node type called ${JSON.stringify(o.name)} in ${CATALOGUE}`);
    const e = NODES[type];
    if (o.variant !== undefined && !Object.hasOwn(e.variants || {}, o.variant)) {
      throw new Error(`nodes: ${type} has no variant ${JSON.stringify(o.variant)} in ${CATALOGUE}`);
    }
    const seg = o.as ?? (type === o.name ? e.node ?? o.name : o.name);
    const s = o.site ?? e.site ?? site;
    const id = `${s}:${seg}`;
    const where = (v) => (v === 'site' ? s : v);
    const own = e.label.includes('<') ? seg.replace(/^knob-/, '') : e.label;
    bay.addNode({ id, kind: e.kind, label: pick(label, seg, id) ?? o.label ?? own, place: where(e.place ?? 'browser'),
      ...(e.net ? { net: where(e.net) } : {}) });
    BUILT.get(bay).set(id, type);
    added.nodes.push(id);
    const want = (pname) => {
      const key = `${seg}:${pname}`, pid = `${id}:${pname}`;
      return { deliver: pick(deliver, key, pid), fields: pick(ports, key, pid), variant: o.variant, portLabel };
    };
    for (const [pname, p] of Object.entries(e.ports)) {
      const w = want(pname);
      if (!p.optional || w.deliver || w.fields) added.ports.push(addPort(bay, e, id, seg, pname, w));
      if (!p.repeat) continue;
      for (const k of [...Object.keys(ports), ...Object.keys(deliver)]) {
        const m = k.match(new RegExp(`^(?:${id}|${seg}):(${pname}-(\\d+))$`));
        if (m && !added.ports.includes(`${id}:${m[1]}`)) added.ports.push(addPort(bay, e, id, seg, m[1], want(m[1])));
      }
    }
  }
  // A deliver, label or override naming nothing here is a typo that would
  // otherwise leave a port silently unwired.
  for (const [tag, map, what] of [['d', deliver, 'deliver'], ['l', label, 'label'], ['p', ports, 'ports']]) {
    for (const k of Object.keys(map)) {
      if (used.has(`${tag} ${k}`)) continue;
      throw new Error(`nodes: ${what} names ${JSON.stringify(k)}, which none of ${names.length} nodes from ${CATALOGUE} has`);
    }
  }
  return added;
}

/**
 * Add catalogue ports to nodes addNodes already built, for a port a page adds
 * after the node (`grains:tempo-in` once the tempo detector is on the page).
 * @param {object} bay   the bay addNodes built the node in
 * @param {string} site  the page's site, as given to addNodes
 * @param {object} ports `{ '<node>:<port>': { deliver?, label?, ...fields } }`
 * @param {string} [o.portLabel] as addNodes
 * @returns {{ ports: string[] }} the ids added, in the order given
 */
export function addPorts(bay, site, ports, { portLabel } = {}) {
  checkPortLabel(portLabel);
  const added = { ports: [] };
  for (const [key, spec] of Object.entries(ports)) {
    const parts = key.split(':');
    const [id, pname] = parts.length === 3 ? [`${parts[0]}:${parts[1]}`, parts[2]] : [`${site}:${parts[0]}`, parts[1]];
    const type = BUILT.get(bay)?.get(id);
    if (!type) throw new Error(`nodes: addPorts names ${JSON.stringify(key)}, and ${id} was not built by addNodes in this bay`);
    const e = NODES[type];
    if (!Object.hasOwn(e.ports, pname) && !(e.ports[pname.replace(/-\d+$/, '')]?.repeat)) {
      throw new Error(`nodes: ${type} has no port ${JSON.stringify(pname)} in ${CATALOGUE}`);
    }
    if (bay.port(`${id}:${pname}`)) throw new Error(`nodes: ${id}:${pname} is already in this bay`);
    const { deliver, ...fields } = spec || {};
    added.ports.push(addPort(bay, e, id, id.split(':')[1], pname, { deliver, fields, portLabel }));
  }
  return added;
}

/** Give a node a new label at run time (a camera takes its device's name once it is on). */
export function relabel(bay, id, label) {
  const n = bay.node(id);
  if (!n) throw new Error(`nodes: relabel names ${JSON.stringify(id)}, which is not in this bay`);
  n.label = label;
  return n;
}
