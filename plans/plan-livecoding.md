# plan-livecoding: live-coding languages as patchbay engines, Strudel beside them

Status (2026-11-02): open. A plan only, nothing built. The tool survey is `research/livecoding-tools-2026-10-30.md`.

Related: `plan-bay-code.md` (the `program` and `value` ports step 1 needs), `plan-sapf.md`, `plan-text-to-code.md`, `plan-code-editor.md`.

Joined on 2026-11-02 from `plan-livecoding`, `plan-strudel-source`, written in a claude.ai chat between 2026-10-24 and 2026-11-02 against the repository as it was on 2026-10-22, and kept word for word below, one section each. A reference to one of those names means the section of that name here.

## plan-livecoding: live-coding languages as patchbay engines, written by an agent

Status (2026-10-30): a plan, nothing built. Licences and last commits were
MEASURED today by cloning each public repository; everything else is READ from
the sources named or INFERRED.

Asked 2026-10-30: *"Expand to plan. More detail on promising ones. Note agent
will write the code"*, then *"Also see patchbay parameters etc"*.

### 0. The answer

1. **A live-coding language is an `engine` node, and its code is a message.**
   READ (`plans/plan-universal-routing.md`): engines (scsynth in `/collide/`,
   Faust in `/fau/`, a GPU shader) take `program` in, `value` in, and give
   `audio` or `video` out; a shader is a port whose medium is `program`
   (`plans/plan-patchbay.md`). So Strudel, Glicol, SuperCollider or Hydra join
   the patchbay the same way: code arrives on a `program` port, knobs on `value`
   ports, sound and picture leave as `audio` and `video`.
2. **The agent writes code by sending `program` messages**, through the same
   ports, checks and logs as a person typing. Nothing new in the routing.
3. **Promising, in order of fit:** SuperCollider with JITLib (already on the
   Pi), Kabelsalat (code as a modular graph, compiles to JavaScript or C),
   Glicol (Rust, WebAssembly, MIT), Strudel (patterns, MIDI out), Orca (grid,
   MIDI out, MIT); Hydra and Punctual for picture; Flok for playing together.

### 1. What the patchbay already defines (READ)

| Thing | Where | Shape |
|---|---|---|
| a port | `plan-patchbay.md` §2.1, built as `demo/shell/bay.mjs` | `{ id, node, dir, medium, shape, accepts }` |
| mediums | same; `plan-universal-routing.md` step 2 | `midi`, `audio`, `clock`; adding `value`, `video`, `program`, `file` |
| a value message | `plan-synth-patch.md` §2 | `{ of: 'param', name: 'cutoff', v: 1200 }` |
| a value port's shape | same | `{ of: 'param', names: [...] }` |
| consent | `plan-patchbay.md` | `accepts` checked at the destination, never moved |
| the registry | `demo/shell/graph-registry.mjs`, the board's beat | every node and port, published |
| prompting from the registry | `/wish/`, `plan-universal-routing.md` step 5 | not built |

#### 1.1 What a live-coding engine adds

```
node  { id: 'pi-1:sc', kind: 'engine', lang: 'supercollider' }
port  program-in  medium 'program'  shape { lang: 'supercollider', maxBytes: 16384 }
                                    accepts ['replace', 'append']
port  params-in   medium 'value'    shape { of: 'param', names: [...] }   // from the running code
port  audio-out   medium 'audio'    shape { rate, channels, frameMs }
```

- A `program` message: `{ of: 'program', lang, op: 'replace' | 'append', src,
  by, seed }`. `by` is a person or `agent:<name>`; `seed` for recipes.
- **The running code publishes its parameter names** into the registry
  (`names`), so knobs, the agent and `/wish/` all see the same list.
- `accepts` on a program port names the operations allowed and a size limit. A
  port on air can refuse `replace` from an agent unless a person confirms (§4).

### 2. Candidates

MEASURED 2026-10-30 by `git clone` unless noted.

| | What | Licence | Last commit | Runs | Fit |
|---|---|---|---|---|---|
| **SuperCollider + JITLib** | live coding inside SC: named proxies replaced while playing | GPL (READ, general knowledge) | — | the Pi's scsynth already (READ: `rig/board/board.mjs`) | ambient piece, bentEcho, the Pi |
| **Kabelsalat** (Felix Roos, Raphaël Forment) | JS-based language compiled to a signal graph; to JavaScript for browsers or C for native | not checked: moved to codeberg.org/froos/kabelsalat, unreachable here | 2025-08-23 (GitHub mirror) | browser; C target for Pi or microcontrollers | the model for plan-bay-code; a portable engine |
| **Glicol** (Qichao Lan) | graph-oriented language; nodes chained with `>>`, referenced with `~name` | MIT (READ) | last push 2025-04-06 (READ: gittrend) | browser (WebAssembly, AudioWorklet), desktop, VST, Bela | Rust and wasm, like Positron |
| **Strudel** | TidalCycles patterns in the browser | AGPL-3.0 | not cloned | browser; MIDI, OSC, WebSerial, Csound out (READ: ICLC 2023 paper) | pattern source over MIDI (plan-strudel-source) |
| **Orca** (Hundred Rabbits) | a 2D grid of single-letter operators | MIT | 2025-11-16 | desktop, browser; MIDI, OSC, UDP out | small screens, permacomputing |
| **Hydra** | live-coded video | AGPL-3.0 | 2026-04-25 | browser (WebGL) | picture layer (plan-fx-chain borrows its vocabulary) |
| **Punctual** (David Ogborn) | one notation for sound and image | GPL | 2026-05-21 | browser | sound and picture together |
| **Flok** | shared browser editor for several languages at once | GPL | 2025-06-18 | browser | playing together, teaching |

#### 2.1 SuperCollider: JITLib's idea on Positron's own SC layer

JITLib itself lives in sclang, which runs neither in a browser nor in edgecast.
But Positron already has the core of it (READ, 2026-10-30):

- `demo/shell/sclang-lite.mjs`: a subset of the SuperCollider language compiled
  to a SynthDef in JavaScript, in the tab; unknown input is an error with line
  and column. 37 UGens today.
- `workers/edgecast/chain.mjs`: named slots; a program replaces its slot's node
  with `/d_recv` carrying `/s_new` addAction 4 as its completion message, so the
  new node runs from the next quantum and the old one is gone in the same
  quantum; limits on source size, one program a second, and UGen count; values
  by `/n_set`.

That is a JITLib without its fades. **Build a proxy layer on it, in JS, once**,
used against all three scsynths: the browser's, edgecast's wasm, and the Pi's
native one over the board's OSC. Then sclang is not needed on the Pi either.

| JITLib gives | Positron today | To add |
|---|---|---|
| a proxy per name, any number | two fixed slots, fixed buses | `~name` to a slot with its own bus, created on first use |
| crossfade on replace (`fadeTime`) | swap within one quantum | wrap each program in a gated `EnvGen`; new node fades in, old gets `gate 0`, frees itself (doneAction 2) |
| proxies read each other by name | slots read fixed buses | `~drone.ar` compiles to `In.ar(<drone's bus>)` |
| a failed definition leaves the old playing | compile errors refused before sending | keep |
| controls by name | `/n_set` | publish them as the port's `names` |

UGens `bentEcho` needs that `sclang-lite` lacks (READ, its `UGENS` table):
`LocalBuf`, `BufRd`, `Latch`, `RandSeed`, `Select`, `PulseCount`, `K2A`,
`XFade2`, `DelayN`, and `Out` / `ReplaceOut` for proxies that sum. Each is a
table entry with sclang's argument order, defaults and rate rule, checked
against real scsynth as the file's header already requires.

#### 2.2 Kabelsalat

- READ (ICLC 2025 paper): the language becomes a signal-flow graph, compiled to
  instructions for real-time processing; output is JavaScript for the browser or
  optimised C for native; single-sample feedback; multichannel expansion after
  SuperCollider; its core also runs a reduced Hydra, so the same idea serves
  audio and video; it may become an audio engine for Strudel.
- **Why it matters:** it is plan-bay-code's idea already explored: cables as
  code, one graph, several targets. The C target could run on the Pi, possibly
  on an ESP32-S3 (INFERRED).
- **Catch:** licence unknown until codeberg is read; small project, one main
  author.

#### 2.3 Glicol

- READ (README): nodes connected with `>>` and `~reference`; written in Rust,
  parser and engine; runs in browsers through WebAssembly, AudioWorklet and
  SharedArrayBuffer; also desktop, VST and Bela; decentralised collaboration
  with yjs.
- **Why it matters:** MIT, Rust, wasm: it could become a Positron engine
  without licence trouble, in the browser and natively on the Pi.
- **Catch:** README says highly experimental, API may change before 1.0;
  SharedArrayBuffer needs cross-origin isolation headers on the page.

#### 2.4 Strudel

- READ (ICLC 2023): outputs include WebAudio, MIDI, OSC (SuperDirt), WebSerial
  and Csound.
- **Role:** a pattern source over MIDI into the patchbay, kept as a separate
  page (AGPL). Not for drones.

#### 2.5 Orca

- MIT; a grid of letters that move and trigger; MIDI and OSC out.
- **Role:** a sequencer for small screens; the grid itself could be drawn on
  the OLED as the picture. Fits the permacomputing thread.

#### 2.6 Hydra and Punctual (picture)

- Hydra is AGPL: borrow the vocabulary (plan-fx-chain), not the code; run
  Hydra itself only as a separate page.
- Punctual (GPL) does sound and image in one notation: study it for the
  ambient piece's coupling.

#### 2.7 Flok (together)

- GPL; one shared editor, several languages. For class and for sessions:
  several people, one room, like the relay rooms.

#### 2.8 Prior art

READ: the 20N02 Eurorack module (MIT Media Lab, NIME 2019) was controlled from a
browser REPL and came with an online patchbay connecting several modular synths
over the internet. Read it before designing remote patching.

### 3. Integration routes

| Engine | Code in | Params | Sound out |
|---|---|---|---|
| SC on the Pi | `program` to the board, SC proxies | proxy controls | the board's audio, the radio chain |
| Kabelsalat | `program` to a browser page; later C on the Pi | graph inputs | page audio; later native |
| Glicol | `program` to a page (wasm); later Rust natively | node parameters | page audio; later native |
| Strudel | its own page; not a Positron engine | — | MIDI into the patchbay |
| Orca | its own app; not a Positron engine | — | MIDI or OSC into the patchbay |
| Hydra | its own page | — | video into the patchbay |

### 4. The agent writes the code

**What the agent is given:**

- the registry: nodes, ports, `names` of every parameter
- a reference card per language: the subset Positron uses, with examples that
  are known to run
- the current program of each engine it may change

**What it sends:** `program` messages with `by: 'agent:<name>'`, and `value`
messages for parameters. Nothing else.

**Guardrails:**

1. **Same consent as people.** `accepts` on the destination decides. Ports on
   air refuse agent `replace` without a person's confirmation.
2. **Every program is logged and revertible**: the previous program is kept,
   one action restores it.
3. **Sound guards in the engine, not in the prompt:** a limiter at every
   engine's output, feedback caps, a panic that silences all engines.
4. **Tests before air:** an agent-written program runs first on an offline
   render (or a muted engine) and must produce non-silent, non-clipping audio
   within its time budget; a negative control (a deliberately broken program)
   must be refused.
5. **Licences:** the agent never copies AGPL or GPL code into Positron. It
   writes programs *for* those engines, which is using them, not vendoring them.
6. **Tags in what it reports:** MEASURED, READ, INFERRED, as everywhere.

**Agent-friendliness, part of choosing:** plain text, a small vocabulary, good
error messages, a headless or offline mode for tests, deterministic output by
seed. INFERRED ranking: SC and Strudel have the most public examples an agent
has seen; Glicol and Kabelsalat are smaller and need the reference card more.

### 5. Evaluation: one task, every candidate

The task: a drone, a two-tap bent echo (plan-ambient-piece §3), one knob with
slew, run for ten minutes.

| Measure | How |
|---|---|
| sound | listened to, written down |
| latency from code sent to sound changed | timestamped |
| Pi | runs natively, CPU from `/status` or `top` |
| agent | how often its first program runs without error, over 20 tries |
| licence | can it live inside Positron, or only beside it |

### 6. Order

1. `program` and `value` (with `names`) in `bay.mjs` and the registry.
2. The proxy layer on `sclang-lite`: named proxies, own buses, crossfades;
   the same layer against the browser's, edgecast's and the Pi's scsynth.
3. The agent loop on SC: registry in, `program` out, offline test, log, revert.
4. Glicol in a browser page as a second engine.
5. Read Kabelsalat on codeberg (licence, C target); try its C output on the Pi.
6. Strudel and Orca as MIDI sources.
7. The evaluation task across all of them.
8. Flok for a class session.

### 6a. Added 2026-11-01

- Details on each candidate: `livecoding-tools-2026-10-30.md`.
- SynthMaker's arrow syntax and units: plan-bay-code §7.
- A live buffer with read-head jumps as an engine: plan-tosser.

### 7. Open

- Kabelsalat's licence; whether its C target is usable today.
- Glicol's activity after April 2025.
- Whether the proxy layer lives in `demo/shell/` beside `sclang-lite`, and how
  edgecast's chain slots become proxies without breaking its limits.
- How the agent is invoked live: from `/wish/`, from a chat, from a knob that
  asks it for a variation.

## plan-strudel-source: Strudel patterns into the patchbay

Status (2026-10-30): a plan, nothing built. Prompted by colin.jpeg's Strudel
performance (Instagram, October 2026). INFERRED unless READ; check every
Strudel detail against its current documentation.

**Goal.** Let people play Strudel, the most widely known live-coding language
now (TidalCycles patterns in the browser), into Positron's instruments and
screens, instead of inventing another pattern language.

### 1. Interoperate, do not embed

Strudel is AGPL-3.0. Keep it a separate page that talks to Positron through
standard messages, so Positron's own code stays under its own licence:

- **MIDI:** Strudel can send MIDI; in a browser through WebMIDI, into the
  patchbay's MIDI ports like any controller.
- **OSC:** if a pattern needs more than MIDI carries, through a small bridge.

The patchbay sees a node `strudel` (a browser site) with MIDI output ports.
Consent and shape checks apply unchanged.

### 2. Text-mode visuals on small screens

colin.jpeg's step grids and piano roll are drawn in characters: monospaced,
coarse, readable small. Positron renders its own versions from the MIDI it
receives (not Strudel's code), on the OLED and other screens through
plan-screens:

- a step grid: rows are sounds, columns are steps, the current step marked
- a pitch roll: pitch by time, in characters or 1-bit cells

### 3. Order

1. A Strudel page sending MIDI to one Positron instrument through the
   patchbay; measure latency.
2. The step grid on the OLED from that MIDI.
3. The pitch roll.
4. OSC only if MIDI is not enough.

### 4. Open

- Clock: Strudel's own, or follow Positron's clock (MIDI clock in).
- Whether to host a Strudel instance or link to the public one.
