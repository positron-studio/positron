// board.hello and board.alive as pure functions, so test.mjs can read the graph they carry. Facts
// are passed in, never looked up. It imports graph-registry.mjs directly so push.sh ships it;
// push.sh's grep reads comments too, so never write an import-from pattern in a comment here.
// why: lessons/rig-board-io.md#beat-header

import { boardGraph } from '../../demo/shell/graph-registry.mjs';

// The board as a graph from what it knows: room, site, net, instruments, inputs, ports, frameMs,
// gpu
// (the `shader` node), camera, midiPresent(port), jack.
// why: lessons/rig-board-io.md#graph-of
const present = (f, port) => (typeof f.midiPresent === 'function'
  ? f.midiPresent(port)
  : (f.ports || []).some((p) => String(p.client).toLowerCase() === String(port).toLowerCase()));

export function graphOf(f) {
  const inputs = f.inputs instanceof Map ? [...f.inputs.values()] : (f.inputs || []);
  return boardGraph({
    room: f.room, ...(f.site ? { site: f.site } : {}), net: f.net || null, instruments: f.instruments || {},
    // Only what the graph reads (no ALSA device). An input's MIDI is announced only while its
    // device is
    // present, asked every beat, so a replug shows within five seconds.
    // why: lessons/rig-board-io.md#inputs
    inputs: inputs.map((i) => ({ name: i.name, channels: i.channels,
      midi: i.midi && present(f, i.midi.port) ? i.midi : null,
      // An input on JACK announces its JACK port (graph-registry `inputJack`).
      ...(i.via === 'jack' ? { jack: true, take: i.take ?? 1 } : {}) })),
    // The jackd card's outputs, when its jackd opens playback (inputs.mjs `playback`).
    outputs: inputs.filter((i) => i.via === 'jack' && i.jackd?.playback).map((i) => ({ device: i.device }))
      .concat(f.outputs || []),
    alsa: f.ports || [], frameMs: f.frameMs, gpu: f.gpu !== false, camera: f.camera === true, jack: f.jack === true,
    ...(Array.isArray(f.plaitsParams) ? { plaitsParams: f.plaitsParams } : {}),
    ...(f.patches && typeof f.patches === 'object' ? { patches: f.patches } : {}),
    ...(f.drums && typeof f.drums === 'object' ? { drums: f.drums } : {}),
    sequencer: f.sequencer === true,
    // A connected HDMI screen, asked every beat like an input's MIDI (hdmi.mjs `screens`).
    screens: typeof f.screens === 'function' ? f.screens() : (Array.isArray(f.screens) ? f.screens : []),
  });
}

// The hello gathers `graphFacts`, which ride on every beat. `audioChannels` is the capture's
// channel
// count (1), not MIDI channels.
// why: lessons/rig-board-io.md#hello
export function helloMsg(f) {
  return { type: 'board.hello', name: f.name, id: f.id, backend: f.backend, ports: f.ports.length, dry: f.dry,
           since: f.since, audioChannels: 1, frameMs: f.frameMs, instruments: f.instruments,
           // Whether this socket answers `rtc.offer`, as an input's hello says
           // (inputs.mjs). Left out when not given, so an older caller is unchanged.
           ...(typeof f.direct === 'boolean' ? { direct: f.direct } : {}),
           // The keyboard link (keyboard.mjs `beat()`), so a page sees whether the board holds it.
           ...(f.kbd ? { kbd: f.kbd } : {}),
           // The Circuit drums link (circuit-drums.mjs `beat()`).
           ...(f.cdrums ? { cdrums: f.cdrums } : {}),
           ...(f.error ? { error: f.error, hint: f.hint } : {}),
           graph: graphOf(f.graphFacts) };
}

// One shape in one place (heartbeat and sweepInsert); `insert` spread top level. No `graph` before
// the first hello.
// why: lessons/rig-board-io.md#alive
export function aliveMsg(f) {
  return { type: 'board.alive', name: f.name, id: f.id, upSec: f.upSec,
           audio: f.audio, voices: f.voices, frames: f.frames, ...f.insert,
           ...(typeof f.direct === 'boolean' ? { direct: f.direct } : {}),
           ...(f.kbd ? { kbd: f.kbd } : {}),
           ...(f.cdrums ? { cdrums: f.cdrums } : {}),
           ...(f.graphFacts ? { graph: graphOf(f.graphFacts) } : {}) };
}
