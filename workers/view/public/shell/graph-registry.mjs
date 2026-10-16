// demo/shell/graph-registry.mjs: who is in the graph right now, from what each machine says of itself,
// in bay.mjs's shapes. Pure and import free: rig/board/push.sh ships only files a board names.
// Wire: `graph` on board.hello and board.alive, `graph.announce`, `graph.ask`. "you" is never sent.
// why: lessons/kit-graph-registry.md#header

export const GRAPH_V = 1;
/**
 * The Pi's site is `pi-1`, not its room; the room is still `studio-1` and names every address.
 * A page names a Pi port through this constant, never by gluing the room onto a port name.
 * why: lessons/kit-graph-registry.md#board-site
 */
export const BOARD_SITE = 'pi-1';
/** A port on the Pi, `pi-1:<node>:<medium>-<dir>`. */
export const boardPort = (node, name, site = BOARD_SITE) => `${site}:${node}:${name}`;

/** What a site may say it is. Absent is allowed; anything else is refused. */
export const SITE_KINDS = ['board', 'browser', 'store', 'node', 'mac', 'service'];
/**
 * Three missed board beats; bay.mjs imports it, so a port goes stale to both together.
 * why: lessons/kit-graph-registry.md#stale-ms
 */
export const STALE_MS = 15_000;

/**
 * How the board's streams really travel: sound by relay PCM or data channel, picture by relay H.264,
 * never WHEP. The Pi announces its own copy; `withBoardTransports` fills in an older board's graph.
 * why: lessons/kit-graph-registry.md#board-transports
 */
export const BOARD_TRANSPORTS = { audio: ['relay', 'datachannel'], video: ['relay-h264'] };
export function withBoardTransports(g) {
  if (!g || !Array.isArray(g.ports)) return g;
  let changed = false;
  const ports = g.ports.map((p) => {
    if (p?.dir !== 'out' || p.transports || !BOARD_TRANSPORTS[p.medium]) return p;
    changed = true;
    return { ...p, transports: [...BOARD_TRANSPORTS[p.medium]] };
  });
  return changed ? { ...g, ports } : g;
}

/** MIDI devices on this desk by the name ALSA gives them, announced under the name the patches use. */
const KNOWN_MIDI = {
  'MK-425C USB MIDI Keyboard': { name: 'mk-425c', label: 'Evolution MK-425C' },
  'FastTrack Pro': { name: 'ftpro', label: 'Fast Track Pro' },
};
/** Audio interfaces by ALSA card id, announced under the name the patches use. */
const KNOWN_CARDS = { Pro: { name: 'ftpro', label: 'Fast Track Pro' }, Headphones: { name: 'pwm', label: 'PWM out' } };
const cardOf = (device) => KNOWN_CARDS[/CARD=([^,]+)/.exec(String(device))?.[1]] ?? { name: 'out', label: 'audio out' };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

/**
 * The JACK ports behind a board's audio ports, named once for the page and the board to agree.
 * An input on JACK is its one taken channel: `circuit` is `circuit:capture_1` only.
 * why: lessons/kit-graph-registry.md#jack-ends
 */
export const JACK_ENDS = {
  // The board's SuperCollider sampler (rig/board/scsampler.mjs), a JACK client named apart
  // from the granulator's `SuperCollider`.
  // why: lessons/kit-graph-registry.md#sampler
  sampler: ['possampler:out_1', 'possampler:out_2'],
  // The page programs' scsynth (`rig/board/scollide.mjs`, `ENGINES.own`), a
  // third server named so it is taken for neither of the two above.
  collide: ['poscollide:out_1', 'poscollide:out_2'],
  // Plaits as a native JACK client (rig/board/plaits/posplaits.cc): the shim's main output only,
  // since its aux output is a different signal and not a right channel.
  plaits: ['posplaits:out_1'],
  pappusIn: ['SuperCollider:in_1', 'SuperCollider:in_2'],
  pappusOut: ['SuperCollider:out_1', 'SuperCollider:out_2'],
  capture: ['posboard:input_1'],
};
/** The Pi 4's PWM output (the 3.5 mm socket) on the JACK graph, by `alsa_out -j pwm` (rig/board/outputs.mjs). */
export const PWM_PORTS = ['pwm:playback_1', 'pwm:playback_2'];
/** The JACK port a hardware input lands on: `alsa_in -j <name>` registers `<name>:capture_N`. */
export const inputJack = (name, take = 1) => [`${name}:capture_${take}`];

/**
 * One bay link between two JACK lists, as JACK rows. Pure. Same count: channel to channel;
 * one input: all sum into it; one output: it feeds every input; anything else is refused.
 * why: lessons/kit-graph-registry.md#jackrows
 */
export function jackRows(from, to) {
  const a = Array.isArray(from) ? from : [], b = Array.isArray(to) ? to : [];
  if (!a.length || !b.length) {
    return { ok: false, rows: [], why: `${!a.length ? 'the source' : 'the destination'} is not on the board's JACK graph` };
  }
  if (a.length === b.length) {
    return { ok: true, rows: a.map((f, i) => ({ from: f, to: b[i] })),
             says: a.length === 1 ? 'one channel' : `${a.length} channels, one to one` };
  }
  if (b.length === 1) return { ok: true, rows: a.map((f) => ({ from: f, to: b[0] })), says: `${a.length} channels summed into one` };
  if (a.length === 1) return { ok: true, rows: b.map((t) => ({ from: a[0], to: t })), says: `one channel into all ${b.length}` };
  return { ok: false, rows: [], why: `${a.length} channels into ${b.length} has no one way to pair them` };
}

/**
 * What a Raspberry Pi board is, as a graph; nothing is described that it cannot do.
 * @param {object} o
 * @param {string} o.room        the board's room: its place and the address of its streams, not its site
 * @param {string} [o.site]      the board's site, `BOARD_SITE` unless a second board says otherwise
 * @param {string} [o.net]       the network it is on, if known
 * @param {object} [o.instruments]  `board.hello`'s own map: name -> available
 * @param {Array}  [o.inputs]    `[{ name, channels, midi: { port, channels } | null }]`
 * @param {Array}  [o.outputs]   `[{ device, jack? }]`, the jackd card when its jackd opens playback, or a card bridged by `alsa_out` with its own JACK ports (rig/board/outputs.mjs)
 * @param {Array}  [o.alsa]      `alsa.mjs` `addressable()` rows
 * @param {number} [o.frameMs]
 * @param {boolean} [o.gpu]      whether the GPU video path exists; announces the `shader` node
 * @param {boolean} [o.camera]   a key set AND a camera found. Off by default.
 * @param {string} [o.label]     'Raspberry Pi', since every fresh Pi's hostname is `raspberrypi`
 * @param {boolean} [o.jack]     announce JACK ends and the granulator and capture nodes. Off by default.
 * @param {string[]} [o.plaitsParams]  the names `pi-1:plaits:value-in` takes; passed in, so this file stays import free
 * @param {object} [o.patches]  patch names by instrument (`{ sampler: [...], plaits: [...] }`), put on its midi-in for a `patch` transform; passed in for the same reason
 * @param {object} [o.drums]    drum maps by node (`{ circuit: DRUM_MAPS.circuit }`, demo/shell/drum-maps.mjs), put on its midi-in as `drums` for a `drummap` transform
 * @param {boolean} [o.sequencer]  announce `pi-1:sequencer`, the board's own step sequencer (rig/board/sequencer.mjs)
 * @param {Array}  [o.screens]  `[{ name, label }]`, a connected HDMI screen (rig/board/hdmi.mjs), with the board's test pattern
 * why: lessons/kit-graph-registry.md#boardgraph
 */
export function boardGraph({ room, site = BOARD_SITE, net = null, instruments = {}, inputs = [], outputs = [], alsa = [], frameMs = 20, gpu = true, camera = false, label = 'Raspberry Pi', jack = false, plaitsParams = null, patches = {}, drums = {}, sequencer = false, screens = [] }) {
  const place = room;
  // Port names are `<medium>-<dir>` (plans/plan-site-names.md §4c), so the id
  // says what a port carries and which way. `graphProblem` holds a board to it.
  const nodes = [], ports = [];
  const node = (n, kind, label) => { nodes.push({ id: `${site}:${n}`, kind, label, place, ...(net ? { net } : {}) }); };
  const port = (n, p, o) => { ports.push({ id: `${site}:${n}:${p}`, ...o }); };
  const named = (k) => (Array.isArray(patches?.[k]) && patches[k].length ? { patches: [...patches[k]] } : {});
  const mapped = (k) => (drums?.[k] && typeof drums[k].name === 'string' ? { drums: { ...drums[k],
    map: drums[k].map ? { ...drums[k].map } : null, labels: { ...(drums[k].labels || {}) } } } : {});

  // The synths the board can start. `pappusFx` is an insert on another sound,
  // not a sound of its own, so it is not a node here.
  for (const [k, ok] of Object.entries(instruments)) {
    if (!ok || k === 'pappusFx' || k === 'collide' || k === 'plaits') continue;
    const n = slug(k);
    node(n, 'engine', k);
    // A synth lives in the board's MAIN room: `audio.start` and `note.on` go
    // there, and its sound comes back down the same socket.
    port(n, 'midi-in', { label: k, dir: 'in', medium: 'midi', accepts: ['note', 'cc', 'bend', 'program'], never: [], address: room, ...named(k) });
    const j = jack && JACK_ENDS[k] ? JACK_ENDS[k] : null;
    port(n, 'audio-out', { label: k, dir: 'out', medium: 'audio', shape: { rate: 48000, channels: 1, frameMs }, address: room,
      transports: [...BOARD_TRANSPORTS.audio, ...(j ? ['jack'] : [])], ...(j ? { jack: [...j] } : {}) });
    // The sampler plays recordings the board fetches itself (from R2, kept on
    // the SD card), so it is the one engine with a `file` end. Drawn as a fact:
    // the board does the fetch, nothing flows over this port from a page.
    if (k === 'sampler') port(n, 'file-in', { label: k, dir: 'in', medium: 'file', address: room });
  }
  // The granulator and the capture, as JACK ends only, so a link to a page is refused in words.
  // The shape says the rate only: a JACK end's channel count is the length of its `jack` list.
  // why: lessons/kit-graph-registry.md#granulator
  if (jack && instruments.pappusFx) {
    node('pappus', 'engine', 'Granulator');
    port('pappus', 'audio-in', { label: 'Granulator', dir: 'in', medium: 'audio', shape: { rate: 48000 },
      transports: ['jack'], jack: [...JACK_ENDS.pappusIn] });
    port('pappus', 'audio-out', { label: 'Granulator', dir: 'out', medium: 'audio', shape: { rate: 48000 },
      transports: ['jack'], jack: [...JACK_ENDS.pappusOut] });
  }
  if (jack) {
    node('capture', 'endpoint', 'Pi capture');
    port('capture', 'audio-in', { label: 'Pi capture', dir: 'in', medium: 'audio', shape: { rate: 48000 },
      transports: ['jack'], jack: [...JACK_ENDS.capture] });
  }
  // A node keeps its catalogue name (nodes.mjs) on every site; only the site prefix changes.
  // SuperCollider is one engine with two nodes, `collide` (notes, sc.set) and `drums` (sc.hit).
  // why: lessons/kit-graph-registry.md#collide
  if (instruments.collide) {
    const j = jack ? JACK_ENDS.collide : null;
    const sound = (n, l) => port(n, 'audio-out', { label: l, dir: 'out', medium: 'audio', shape: { rate: 48000, channels: 1, frameMs },
      address: room, transports: [...BOARD_TRANSPORTS.audio, ...(j ? ['jack'] : [])], ...(j ? { jack: [...j] } : {}) });
    node('collide', 'engine', 'SuperCollider');
    port('collide', 'midi-in', { label: 'SuperCollider', dir: 'in', medium: 'midi', accepts: ['note'], never: [], address: room });
    port('collide', 'value-in', { label: 'SuperCollider', dir: 'in', medium: 'value', shape: { of: 'param' }, address: room });
    sound('collide', 'SuperCollider');
    node('drums', 'engine', 'drums');
    port('drums', 'midi-in', { label: 'drums', dir: 'in', medium: 'midi', accepts: ['note'], never: [], address: room, ...mapped('drums') });
    sound('drums', 'drums');
  }
  // Plaits, the same DSP as the browser's `web:plaits` compiled natively (rig/board/plaits.mjs).
  // It keeps its catalogue name, so the Pi's node is `pi-1:plaits`.
  if (instruments.plaits) {
    const j = jack ? JACK_ENDS.plaits : null;
    node('plaits', 'engine', 'Plaits');
    port('plaits', 'midi-in', { label: 'Plaits', dir: 'in', medium: 'midi', accepts: ['note'], never: [], address: room, ...named('plaits') });
    port('plaits', 'value-in', { label: 'Plaits', dir: 'in', medium: 'value',
      shape: { of: 'param', ...(Array.isArray(plaitsParams) && plaitsParams.length ? { names: [...plaitsParams] } : {}) }, address: room });
    port('plaits', 'audio-out', { label: 'Plaits', dir: 'out', medium: 'audio', shape: { rate: 48000, channels: 1, frameMs },
      address: room, transports: [...BOARD_TRANSPORTS.audio, ...(j ? ['jack'] : [])], ...(j ? { jack: [...j] } : {}) });
  }
  // The shader: rig/vis/v3dpipe on the VideoCore GPU, sent as H.264. `value-in` is video.params,
  // `program-in` is video.shader (310 es). Out on `<room>-video` or the direct `vid` channel.
  // why: lessons/kit-graph-registry.md#shader
  if (gpu) {
    node('shader', 'engine', 'mirror shader');
    port('shader', 'value-in', { label: 'mirror shader', dir: 'in', medium: 'value', shape: { of: 'param', names: ['segments'] }, address: room });
    port('shader', 'program-in', { label: 'mirror shader', dir: 'in', medium: 'program', shape: { of: 'glsl' }, address: room });
    port('shader', 'video-out', { label: 'mirror shader', dir: 'out', medium: 'video', shape: { codec: 'h264' }, address: `${room}-video`,
      transports: [...BOARD_TRANSPORTS.video, 'datachannel'] });
  }
  // The camera, sent only to a key holder, in `<room>-cam` or a direct `cam` channel; announced
  // only when the board holds a key and found a camera.
  // why: lessons/kit-graph-registry.md#camera
  if (camera) {
    node('camera', 'device', 'camera');
    port('camera', 'video-out', { label: 'camera', dir: 'out', medium: 'video', shape: { codec: 'h264' }, address: `${room}-cam`,
      transports: [...BOARD_TRANSPORTS.video, 'datachannel', ...(screens.length ? ['fbdev'] : [])] });
  }
  // A screen on the board's HDMI, while one is connected: a link to its video-in is ffmpeg drawing
  // into /dev/fb0 on the board (`hdmi.show`), so it travels by `fbdev` and never leaves the board.
  for (const s of screens) {
    node(s.name, 'device', s.label || s.name);
    port(s.name, 'video-in', { label: s.label || s.name, dir: 'in', medium: 'video', address: room, transports: ['fbdev'] });
  }
  if (screens.length) {
    node('pattern', 'engine', 'test pattern');
    port('pattern', 'video-out', { label: 'test pattern', dir: 'out', medium: 'video', address: room, transports: ['fbdev'] });
  }
  // A hardware input is an instrument on the desk: its sound comes in through
  // the board's audio interface, and its MIDI goes out through the gate.
  const inputPorts = new Set();
  for (const i of inputs) {
    const n = slug(i.name);
    node(n, 'device', i.name);
    // The address is `<room>-<input>`, as rig/board/inputs.mjs names it; a JACK input is also
    // its taken channel on the board's graph.
    // why: lessons/kit-graph-registry.md#inputs
    const j = jack && i.jack ? inputJack(i.name, i.take ?? 1) : null;
    port(n, 'audio-out', { label: i.name, dir: 'out', medium: 'audio',
      shape: { rate: 48000, channels: 1, frameMs }, address: `${room}-${i.name}`,
      transports: [...BOARD_TRANSPORTS.audio, ...(j ? ['jack'] : [])], ...(j ? { jack: j } : {}) });
    if (i.midi) {
      inputPorts.add(String(i.midi.port).toLowerCase());
      port(n, 'midi-in', { label: i.name, dir: 'in', medium: 'midi', accepts: ['note', 'cc', 'program'], never: ['sysex'],
        shape: { channels: i.midi.channels }, address: `${room}-${i.name}`, ...mapped(n) });
      // What the instrument plays, read by the board (inputs.mjs `tap`); its drum map read back by a drummap.
      // why: lessons/kit-graph-registry.md#input-midi-out
      port(n, 'midi-out', { label: i.name, dir: 'out', medium: 'midi', emits: ['note', 'cc', 'program', 'clock'],
        shape: { channels: i.midi.channels }, address: `${room}-${i.name}`, ...mapped(n) });
    }
  }
  // The board's own step sequencer: GM drum notes on channel 10 out, a pattern in, its steps out for
  // the screen. Notes only, plus CC 123 on stop; never SysEx or a program change.
  // why: lessons/kit-graph-registry.md#sequencer
  if (sequencer) {
    node('sequencer', 'engine', 'sequencer');
    port('sequencer', 'midi-out', { label: 'sequencer', dir: 'out', medium: 'midi', emits: ['note', 'cc'], shape: { channels: [10] }, address: room });
    port('sequencer', 'value-in', { label: 'sequencer', dir: 'in', medium: 'value', shape: { of: 'pattern' }, accepts: ['pattern'], address: room });
    port('sequencer', 'value-out', { label: 'sequencer', dir: 'out', medium: 'value', shape: { of: 'steps' }, emits: ['steps'], address: room });
  }
  // The jackd card's outputs: a link to its audio-in is a JACK connection to `system:playback_N`.
  for (const o of jack ? outputs : []) {
    const c = cardOf(o.device);
    node(c.name, 'device', c.label);
    // No channel count: the board pairs channels on a JACK link (`jackRows`), so mono fills both sides.
    port(c.name, 'audio-in', { label: c.label, dir: 'in', medium: 'audio', shape: { rate: 48000 },
      transports: ['jack'], jack: Array.isArray(o.jack) ? [...o.jack] : ['system:playback_1', 'system:playback_2'] });
  }
  // Every other MIDI device the board sees. A device already described as an
  // input above is not described twice.
  for (const a of alsa) {
    if (a.virtual) continue;
    if (inputPorts.has(String(a.client).toLowerCase())) continue;
    const known = KNOWN_MIDI[a.client];
    const n = known?.name ?? `midi-${slug(a.client)}`;
    const label = known?.label ?? a.client;
    const has = nodes.some((x) => x.id === `${site}:${n}`);
    // A known device's MIDI joins its audio node (the Fast Track Pro); any other repeat is skipped.
    if (has && !known) continue;
    if (has && ports.some((x) => x.id === `${site}:${n}:midi-in`)) continue;
    if (!has) node(n, 'device', label);
    port(n, 'midi-out', { label, dir: 'out', medium: 'midi', emits: ['note', 'cc', 'bend', 'clock'] });
    port(n, 'midi-in', { label, dir: 'in', medium: 'midi', accepts: ['note', 'cc', 'bend'], never: [] });
  }
  return { v: GRAPH_V, site, place, ...(net ? { net } : {}), kind: 'board', label, nodes, ports };
}

/**
 * One announced board node drawn on a page's own bay from `boardGraph()`, so the page draws what
 * the board announces. Pure; only calls the bay it is given.
 * @param {object} bay      the page's bay (`createBay`)
 * @param {object} g        a board graph, `boardGraph({...})` or one heard on the wire
 * @param {string} name     the node's name on the board, `collide`
 * @param {object} [o]
 * @param {string} [o.label]    the page's own label for the node, the board's when absent
 * @param {object} [o.deliver]  `{ '<port>': fn }`, what this page does with an event on that port
 * @param {object} [o.ports]    `{ '<port>': { ...fields } }` merged over the announced port
 * @param {string|null} [o.portLabel]  `'node:port'` (default) or null for the board's label
 * @param {boolean} [o.withPorts]  false adds the node alone (`addBoardPorts` adds them later)
 * @returns the bay's node, or null when the graph has no such node
 * why: lessons/kit-graph-registry.md#addboardnode
 */
export function addBoardNode(bay, g, name, { label, withPorts = true, ...o } = {}) {
  const n = g.nodes.find((x) => x.id === `${g.site}:${name}`);
  if (!n) return null;
  const node = bay.addNode({ ...n, ...(label ? { label } : {}) });
  if (withPorts) addBoardPorts(bay, g, name, o);
  return node;
}
/** The ports of one announced board node, as `addBoardNode` adds them. Answers the ids added. */
export function addBoardPorts(bay, g, name, { deliver = {}, ports = {}, portLabel = 'node:port' } = {}) {
  const id = `${g.site}:${name}`;
  return g.ports.filter((q) => q.id.split(':').slice(0, 2).join(':') === id).map((p) => {
    const pname = p.id.split(':')[2];
    return bay.addPort({ ...p, ...(portLabel ? { label: `${name}:${pname}` } : {}), ...(ports[pname] || {}),
      ...(deliver[pname] ? { deliver: deliver[pname] } : {}) }).id;
  });
}

/** Is this a graph this file can read. Answers a reason, or '' when it is. */
export function graphProblem(g) {
  if (!g || typeof g !== 'object') return 'not an object';
  if (g.v !== GRAPH_V) return `version ${g.v} is not ${GRAPH_V}`;
  if (typeof g.site !== 'string' || !g.site) return 'no site';
  if (g.kind !== undefined && !SITE_KINDS.includes(g.kind)) return `kind ${g.kind} is not one of ${SITE_KINDS.join(', ')}`;
  if (g.label !== undefined && typeof g.label !== 'string') return 'label is not a string';
  if (!Array.isArray(g.nodes) || !Array.isArray(g.ports)) return 'nodes and ports are lists';
  for (const n of g.nodes) if (typeof n?.id !== 'string' || n.id.split(':')[0] !== g.site) return `node ${n?.id} is not on site ${g.site}`;
  for (const p of g.ports) if (typeof p?.id !== 'string' || p.id.split(':').length !== 3 || p.id.split(':')[0] !== g.site) return `port ${p?.id} is not site:node:port on ${g.site}`;
  // A board's port name starts with its medium and direction. Boards only: pages still announce
  // `keys:out` and `history:in`.
  // why: lessons/kit-graph-registry.md#port-names
  if (g.kind === 'board') {
    for (const p of g.ports) {
      const want = `${p.medium}-${p.dir}`, name = p.id.split(':')[2];
      if (name !== want && !name.startsWith(`${want}-`)) return `port ${p.id} is named ${name}, and a ${p.medium} ${p.dir} on a board is named ${want}`;
    }
  }
  return '';
}

/**
 * What the pages hear: one announcement per socket and site, newest wins; quiet for `staleMs`
 * is listed but marked. `merged` keeps the freshest per site, so every page takes a random site.
 * why: lessons/kit-graph-registry.md#createregistry
 */
export function createRegistry({ now = () => Date.now(), staleMs = STALE_MS } = {}) {
  const by = new Map();            // `${from} ${site}` -> { from, graph, at }

  /** Read one wire message. Answers true when it changed what is known. */
  function ingest(msg) {
    if (!msg || !msg.from) return false;
    const board = msg.type === 'board.hello' || msg.type === 'board.alive';
    let g = (board || msg.type === 'graph.announce') ? msg.graph : null;
    if (!g) return false;
    if (graphProblem(g)) return false;
    if (board) g = withBoardTransports(g);
    const key = `${msg.from} ${g.site}`;
    const was = by.get(key);
    const same = was && JSON.stringify(was.graph) === JSON.stringify(g);
    by.set(key, { from: msg.from, graph: g, at: now() });
    return !same;
  }
  /** Forget a socket, every site it announced, or one site of it when `site` is given. */
  function forget(from, site = null) {
    let gone = false;
    for (const [k, e] of by) if (e.from === from && (site == null || e.graph.site === site)) { by.delete(k); gone = true; }
    return gone;
  }
  const stale = (e) => now() - e.at > staleMs;
  function graphs() {
    return [...by.values()].map((e) => ({ from: e.from, site: e.graph.site, at: e.at, stale: stale(e), graph: e.graph }));
  }
  /** Every node and port heard, the freshest announcement per site winning. */
  function merged() {
    const bySite = new Map();
    for (const g of graphs()) {
      const prev = bySite.get(g.site);
      if (!prev || g.at > prev.at) bySite.set(g.site, g);
    }
    const nodes = [], ports = [];
    for (const g of bySite.values()) {
      for (const n of g.graph.nodes) nodes.push({ place: g.graph.place, ...(g.graph.net ? { net: g.graph.net } : {}), ...n, stale: g.stale });
      for (const p of g.graph.ports) ports.push({ ...p, stale: g.stale });
    }
    // `kind` and `label` are passed through as the site said them, and are
    // undefined when it said nothing, so a reader can tell "no claim" apart.
    return { nodes, ports, sites: [...bySite.values()].map((g) => ({ site: g.site, stale: g.stale, from: g.from,
      kind: g.graph.kind, label: g.graph.label })) };
  }
  /** Put everything heard into a bay. A fresh bay per call is the caller's job. */
  function fill(bay) {
    const { nodes, ports } = merged();
    for (const n of nodes) bay.addNode({ id: n.id, kind: n.kind, label: n.label, place: n.place, net: n.net });
    for (const p of ports) bay.addPort({ ...p });
    return bay;
  }
  return { ingest, forget, graphs, merged, fill };
}
