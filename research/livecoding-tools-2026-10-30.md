# Live-coding tools, deeper: ten systems against Positron

Research note, 2026-10-30, for `plans/plan-livecoding.md`. Licences and last
commits MEASURED today by `git clone --depth 1` of each public repository;
descriptions READ from each project's README or paper unless marked INFERRED.
Code samples marked *(README)* are copied from the project's own documentation;
others show the style and should be checked before an agent relies on them.

Positron terms used below (READ, `plan-patchbay.md`, `plan-universal-routing.md`,
`plan-synth-patch.md`): an engine takes `program` in and `value` in, gives
`audio` or `video` out; value messages are `{ of: 'param', name, v }`.

---

## 1. Kabelsalat

| | |
|---|---|
| By | Felix Roos, Raphaël Maurice Forment (Strudel's co-author and Sardine's author) |
| Paper | ICLC 2025, doi:10.5281/zenodo.15527772 |
| Licence | not checked: moved to codeberg.org/froos/kabelsalat (unreachable from here) |
| Last commit | 2025-08-23 on the GitHub mirror |

**What it is (READ, ICLC 2025 abstract).** A JavaScript-based language
translated into a signal-flow graph, compiled into instructions optimised for
real-time processing. The compiler outputs JavaScript for browsers or optimised
C for native machines, and other targets are part of the design. The browser
version has a REPL and DSP nodes reminiscent of modular synths. Single-sample
feedback; multichannel expansion after SuperCollider. Its core also implements a
stripped-down Hydra, showing the same principle works for audio and video. It
may become an alternative audio engine for Strudel.

**Why it is interesting.** Three of Positron's own plans in one system:
the patch as code (plan-bay-code), one graph for sound and picture
(plan-ambient-piece), and several compile targets from one source (browser,
native, potentially a microcontroller).

**Model.** Declarative: the code describes the whole graph; re-running it
rebuilds the graph. Single-sample feedback means loops inside the graph are
allowed and computed per sample, which echoes, Karplus-Strong strings and
physical models need.

**Into Positron.** As an engine on a browser site first: `program` in (the
code), its graph inputs as `value` names, page audio out. Later its C output on
the Pi.

**For an agent.** Small vocabulary, JavaScript syntax an agent writes well;
needs a reference card because the node set is project-specific.

**Risks.** Licence unknown; mostly one or two authors; young.

**Borrow.** The compile-to-several-targets design for Positron's own graph, and
how it allows feedback safely.

---

## 2. Glicol

| | |
|---|---|
| By | Qichao Lan |
| Licence | MIT |
| Last commit | 2025-01-23 |
| Runs | browser (WebAssembly, AudioWorklet), desktop, VST (experimental), Bela |

**What it is (READ, README).** "Graph-oriented live coding language"; language
and audio engine both in Rust. Features listed: near-native, garbage-collection
free, memory-safe real-time audio in browsers; errors reported while the
previous music keeps playing; declarative updates where the engine diffs old and
new code (an LCS algorithm) and changes only what differs; decentralised
collaboration with `yjs`; Hydra can be mixed in for visuals; an NPM library for
web apps and a Rust audio library.

**Style.** Each line is a named chain; `>>` passes a signal along; `~name` lines
are reusable sub-chains; `o:` is an output. INFERRED example in its style:

```
~lfo: sin 0.2 >> mul 300 >> add 600
o: saw 55 >> lpf ~lfo 1.0 >> mul 0.2
```

**Why it is interesting.** The diff-based update is exactly the property an
agent-written or live-edited patch needs: change one line, only that node
changes, sound continues. MIT and Rust: it could live inside Positron.

**Into Positron.** As a browser engine through its NPM library; later the Rust
crate natively on the Pi. Its named chains map to node names; numeric arguments
to `value` names.

**For an agent.** Tiny syntax, few rules, but unusual: a reference card with
working examples is essential.

**Risks.** README: highly experimental, API may change; last commit January
2025; SharedArrayBuffer in browsers needs cross-origin isolation headers.

**Borrow.** Diff-based updates (only changed nodes rebuilt) for Positron's proxy
layer.

---

## 3. Gibber

| | |
|---|---|
| By | Charlie Roberts |
| Licence | MIT |
| Last commit | 2024-09-17 |
| Runs | browser |

**What it is (READ, README).** A browser live-coding environment combining music
synthesis and sequencing with ray-marching 3D graphics. It wraps an audio
library (`gibber.audio.lib`) and graphics components.

**Model.** JavaScript with sequencing attached to parameters: almost any
property can be given a sequence, so patterns live on the thing they change
(INFERRED from its documentation style, check). Graphics are signed-distance
ray-marched 3D scenes driven by the same signals.

**Why it is interesting.** Long history in teaching (Roberts' research on live
coding pedagogy), sound and 3D picture in one language, and annotations that
show patterns playing inside the code.

**Into Positron.** A separate page; MIDI out or a shared clock. As a reference
for inline visual feedback in plan-bay-code.

**Risks.** Quiet since 2024.

**Borrow.** Sequences attached to parameters, and code annotations that animate
with what plays.

---

## 4. Hydra

| | |
|---|---|
| By | Olivia Jack |
| Licence | AGPL-3.0 |
| Last commit | 2026-04-25 |
| Runs | browser (WebGL) |

**What it is.** Live-coded video synthesis: chained functions compiled to
fragment shaders, modelled on analogue video synthesisers; four outputs,
feedback by reading an output back in (`src(o0)`); camera, screen and other
pages as sources; a stream-sharing mechanism between users.

```
osc(10, 0.1, 1.2).rotate(0.1).modulate(noise(3)).out()
```

**Why it is interesting.** The clearest vocabulary for image chains; widely
taught; Glicol and Kabelsalat both reuse its ideas.

**Into Positron.** Its own page, video into the patchbay (SFU or a capture).
Its vocabulary already shapes plan-fx-chain; no code is copied.

**For an agent.** Very well known, many public examples: agents write Hydra
fluently (INFERRED).

**Risks.** AGPL: keep it beside Positron, not inside.

**Borrow.** Function vocabulary, outputs as named buffers, feedback by name.

---

## 5. Punctual

| | |
|---|---|
| By | David Ogborn (McMaster University) |
| Licence | GPL-3.0+ |
| Last commit | 2026-05-21 |
| Runs | browser (Web Audio, WebGL); bundled inside Estuary |

**What it is (READ, README).** A language for live coding audio and visuals:
build and change networks of signal processors on the fly; when definitions
change, *when and how they change* can be specified. A solo art project:
discussion welcome, code contributions not accepted.

```
osc 440 >> audio;            -- a 440 Hz sine wave, centre   (README)
osc [440,550] >> audio;      -- two sines, left and right    (README)
[osc 0.2,0,0] >> add;        -- a pulsating red screen       (README)
lpf 1000 1 (saw 110);        -- low-pass on a sawtooth       (README)
```

**Why it is interesting.** The same expression can go `>> audio` or `>> add`
(a video layer): one signal language for sound and image, with transitions as
part of the language. Video output is layered like image-editing layers.

**Into Positron.** A separate page; or study only. For the ambient piece, its
idea that a change has a specified *transition* (how long, how) maps onto the
proxy layer's crossfades.

**Risks.** GPL, closed to contributions: not something to build on, but a model
to learn from.

**Borrow.** One expression, two outputs (sound, picture); transitions declared
in the language.

---

## 6. Flok

| | |
|---|---|
| By | Damián Silvani (munshkr) |
| Licence | GPL-3.0+ |
| Last commit | 2025-06-18 on GitHub; development moved to codeberg.org/munshkr/flok |
| Runs | browser |

**What it is (READ, README).** A web-based peer-to-peer collaborative editor for
live coding music and graphics. Several panes, several languages, one shared
session; everyone types and everyone hears and sees.

**Why it is interesting.** The social form of live coding: a room of players
sharing code, like Positron's relay rooms share instruments.

**Into Positron.** Used as is for sessions and teaching; or a reference for a
Positron room where several people send `program` messages to shared engines,
with the same consent and logs.

**Risks.** GPL; moved hosting.

**Borrow.** The room model for code: who is typing where, everyone's changes
visible.

---

## 7. Estuary

| | |
|---|---|
| By | David Ogborn's group, McMaster University, with funding from Canada's SSHRC |
| Licence | GPL-3.0 |
| Last commit | 2026-07-07 |
| Runs | browser; existing public deployments |

**What it is (READ, README).** A platform for collaboration and learning through
live coding: built-in tutorials and reference, a growing set of interfaces and
languages (Punctual is bundled), networked ensembles in one room or around the
world, interface text in several natural languages, themes in CSS.

**Why it is interesting.** Prior art for multi-site ensemble performance and for
teaching inside the tool, with localisation, which matters for Estonian,
Ukrainian and English users.

**Into Positron.** Not an engine; a reference for ensemble rooms, tutorials in
the tool, and localisation.

**Borrow.** Ensemble features, built-in tutorials, interface translations.

---

## 8. Orca

| | |
|---|---|
| By | Hundred Rabbits (Devine Lu Linvega, Rek Bell) |
| Licence | MIT |
| Last commit | 2025-11-16 |
| Runs | desktop, browser; output MIDI, OSC, UDP |

**What it is (READ, README).** A two-dimensional grid where every letter is an
operator acting on its neighbours, one step per frame. Examples from its
operator list *(README)*: `C` clock, `D` delay (bangs on a modulo of the
frame), `R` random, `U` Euclidean rhythm, `Z` lerp (glides toward a target),
`E N S W` move east, north, south, west, `*` bang; `:` sends a MIDI note, `!` a
MIDI CC, `?` pitch bend, `=` OSC, `;` UDP.

**Why it is interesting.** A program is a small visible machine: values travel
across the grid and things fire when they collide. It produces no sound itself;
it plays other instruments. It belongs to the permacomputing world (small,
offline, low power).

**Into Positron.** Its own app sending MIDI or OSC into the patchbay. `Z` (lerp)
and slow `C`/`D` rates make non-rhythmic, drifting control possible for the
ambient piece. The grid itself is a natural picture for the OLED (a 1-bit grid of
glyphs).

**For an agent.** Unusual for an agent: spatial, not textual flow. Expect poor
first attempts (INFERRED); a person will do better here.

**Borrow.** Control as a visible machine; the grid as both program and picture.

---

## 9. ChucK

| | |
|---|---|
| By | Ge Wang and Perry R. Cook (Princeton, then Stanford CCRMA) |
| Licence | dual: MIT and GPL-2.0 (READ, README) |
| Last commit | 2026-10-15 |
| Runs | macOS, Windows, Linux; WebChucK in browsers |

**What it is (READ, README).** A "strongly-timed" language for real-time
synthesis: precise, concurrent time with dynamic control rates, code added and
modified on the fly, MIDI, OSC, HID and multichannel audio.

**Model.** Time is a value you advance: `250::ms => now;` pauses this
"shred" exactly 250 ms; many shreds run concurrently and stay sample-accurate.
`=>` connects signals and assigns values.

```
SinOsc s => dac;
while (true) { Math.random2f(200, 800) => s.freq; 250::ms => now; }
```

**Why it is interesting.** The clearest model of time in any of these: no
scheduler to fight, timing is the program. Laptop orchestra history (PLOrk,
SLOrk) for ensemble teaching. Actively maintained; permissive MIT option.

**Into Positron.** On the Pi natively, or WebChucK in a page; MIDI or OSC into
the patchbay, or audio. For teaching time.

**Borrow.** Explicit time as a language concept, if Positron's code layer ever
needs scheduled events beyond patterns and signals.

---

## 10. Strudel (for completeness)

Covered in `plan-strudel-source.md`: TidalCycles patterns in the browser,
AGPL-3.0; READ (ICLC 2023): outputs WebAudio, MIDI, OSC, WebSerial, Csound.

---

## Comparison

| | Licence | Active (last commit) | Sound / picture | Runs on the Pi | Inside Positron? | Agent-friendly (INFERRED) |
|---|---|---|---|---|---|---|
| Kabelsalat | unknown | 2025-08 | both | C target | maybe, after licence | good with a card |
| Glicol | MIT | 2025-01 | sound (+Hydra) | Rust crate | yes | good with a card |
| Gibber | MIT | 2024-09 | both (3D) | browser only | could, quiet | good |
| Hydra | AGPL | 2026-04 | picture | browser | beside only | very good |
| Punctual | GPL | 2026-05 | both | browser | beside only | fair |
| Flok | GPL | 2025-06 | editor | browser | beside only | n/a |
| Estuary | GPL | 2026-07 | platform | browser | beside only | n/a |
| Orca | MIT | 2025-11 | control | yes (desktop) | beside, via MIDI | poor |
| ChucK | MIT/GPL | 2026-10 | sound | yes | beside, via MIDI/OSC | good |
| Strudel | AGPL | — | sound (+viz) | browser | beside only | very good |

## What to take, in one list

1. Kabelsalat: one graph, many compile targets; feedback handled in the graph.
2. Glicol: diff-based updates, only changed nodes rebuilt.
3. Gibber: sequences on parameters; code that shows what plays.
4. Hydra: the image vocabulary.
5. Punctual: one expression to sound or picture; transitions in the language.
6. Flok and Estuary: rooms of players, tutorials and translations inside the tool.
7. Orca: control as a visible machine; the grid as picture.
8. ChucK: explicit time.
