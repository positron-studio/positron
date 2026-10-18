# plan-cast-reinterpret: when the source is the weak part

Written 2026-10-18 for the Väin cast's `live` mode (https://positron.studio/radio/cast/, `local` station).
Asked: *"in general: source material is not great not our effect. what can be done? more reintrpretation /
rtyhmoc stuff? what fx could we use? more parallel granulators? harmonizers / sound clusters? plan"*, then
*"also what about low drone stuff?"*, after *"want to listen more blending in from next/prev sound, someimes
like 'ghosts vistiing'"* and *"kalle is still racket"*.

Tags: **MEASURED** (number and where it was taken), **READ** (from code or a document here, file named),
**INFERRED** (reasoned, not run). Nothing in this file is built and nothing has been heard.

## 0. Verdict

Stop presenting the archive and start **deriving** from it. A weak recording still carries three things worth
keeping: its pitch content (key), its rhythm (onsets, sometimes a tempo), and its timbre in short pieces
(grains). Each layer below takes one of those and makes something new from it, so the file's flaws (hot
masters, clicks, room noise, bad balance) stop being what the listener hears in front.

Build order, each step small enough to vote on before the next:

1. **Fix the inputs**: per-file loudness and file votes (S). Kalle is about 10 dB hotter than the rest.
2. **A drone bed** under everything, made of the source and of its key (S to M).
3. **Teach the compiler five SuperCollider blocks** it does not know yet: resonators, comb, reverb, pitch shift, band-pass (M, one-off).
4. **A resonator bank tuned to the key**: speech and noise start to sing in tune (M).
5. **Harmonizer and clusters**: several transposed grain voices in the one ring (M).
6. **Ghosts**: the next and previous file visiting inside a scene, through the resonators (S once 4 exists).
7. **Pulse**: a tempo per scene and grain gates on it (M).
8. **Parallel rings** only if 2 to 7 leave the CPU room (L, costs money on air).

Every layer becomes a **feature of the scene def** (`demo/radio/cast/life.mjs`), so the votes learn which
layers work, exactly as they learn patches and interludes today.

## 1. What there is to build on

| thing | where | tag |
| --- | --- | --- |
| one grain ring: 8 s buffer, one `GrainBuf` stream, freeze, speed, scatter, pitch, detune, echo, tone, drop, lock to a beat | `demo/granulator/grain-ring.mjs` PROGRAM | READ |
| the compiler's UGen subset: SinOsc Saw Pulse LFSaw LFTri LFNoise1 WhiteNoise LPF HPF RLPF Pan2 EnvGen Impulse Dust TRand Phasor BufFrames BufDur In BufWr GrainBuf SendReply DelayC LocalIn LocalOut | `UGENS` in `demo/shell/sclang-lite.mjs` | READ (listed today) |
| no reverb, no Klank or Ringz, no CombC, no PitchShift, no FFT or PV_ blocks, no BPF in that subset | same | READ |
| a key detector (chroma, 35 dB floor, 30 s decay) | KEY CORE block, `demo/radio/key/index.html`, `plans/plan-key-detection.md` | READ |
| a tempo detector, 60 to 200 bpm | `demo/radio/tempo.mjs`, `plans/plan-beat-detection.md` (works on music with a kick; the archive is mostly not) | READ |
| chords and voicings | `demo/shell/chords.mjs` | READ |
| a chord out of a station: eight grain voices transposed `[0,-12,7,12,-5]`, built on the Pappus engine | `plans/plan-radio-sound.md` ①, in `/archive/radio/` | READ |
| CPU: one grain ring 23 to 25 % of a core locally with everything on; on air grains 17 %, mix 5 % | `lessons/workers-cast.md` (CAST_INSTANCE), HANDOFF session 82 | MEASURED there |
| the on-air container: 0.5 vCPU, 1.5 GiB | `workers/cast/worker.mjs` CAST_INSTANCE | READ |
| source levels: Kalle -14.2, Kalle 2 -13.0, Driving along -19.5, Evening rituals -24.0, Audio test -26.3 dB rms | the crackle agent, `lessons/workers-cast.md#drive` | MEASURED 2026-10-18 |
| Driving along carries its own 1.5 ms clicks at 2 to 6 kHz on a 645 ms beat | same | MEASURED |

## 2. The layers

### 2.1 Fix the inputs (S)

- **Loudness per file.** Measure each archive file once (EBU R128 integrated) and serve the gain with the feed
  (`/feed` items get `gain`), so both engines scale each slot to one target (say -23 LUFS) before the tuner.
  Kalle comes down about 10 dB, the quiet files come up, and the drive stage stops seeing hot input at all.
  13 files today; a new upload is measured when it first appears. INFERRED: removes most of what is left of
  Kalle's racket, because what remains is level, not processing.
- **Files are a feature the votes learn.** Add the file to what a vote teaches, and let the program pick files
  by it: Driving along can be voted out of the picks rather than deleted. Plus an explicit "never" on an
  archive row for a file that should not play at all.

### 2.2 A drone bed (S to M), asked as *"low drone stuff"*

Two drones, both quiet, both under the scene, both slow:

- **Freeze drone: the source held.** A second, cheap use of the ring: freeze on, size 2 to 4 s, pitch 0.5
  (an octave down) or 0.25, density 4 to 8, a low-pass at 300 to 600 Hz. It is the file, slowed into a pad.
  Every block exists today (`freeze`, `size`, `pitch`, `tone`), so this is a patch, not new code. INFERRED cost:
  a second ring instance, about the same CPU as the first (see 2.8), or one extra `GrainBuf` in the same ring.
- **Key drone: the source's centre.** Two or three detuned saws or sines on the root and fifth of the detected
  key, an octave or two down, through RLPF with a slow LFNoise1 on the cutoff, breathing over 20 to 60 s.
  Retuned only between scenes (a key change mid-scene sounds like a mistake). All blocks exist today.
- **Why it helps a weak source**: a drone gives the ear a floor, so a thin or noisy recording reads as a
  colour on top of something rather than the whole picture. It also covers the seams between files.
- **Life features**: drone kind (none, freeze, key, both), level, register. Votes learn whether drones are wanted.

### 2.3 Teach the compiler five blocks (M, one-off)

`sclang-lite` rejects anything outside `UGENS`. scsynth 3.13 (container) and the wasm scsynth (browser) both
ship the core plugins (INFERRED for the wasm build: check by compiling one SynthDef with each and reading
`/fail` back, before planning on it). Add, with their rates and inputs:

| block | for | note |
| --- | --- | --- |
| `Klank` or `Ringz` | the resonator bank (2.4) | `Ringz` in a `Mix` over 8 to 16 frequencies is the simplest; `DynKlank` lets the life retune |
| `CombC` | resonators on a pitch, flanging ghosts, Karplus-like plucks | |
| `FreeVerb` or `GVerb` | a room, and the long tail a drone sits in | FreeVerb is cheap; GVerb is lusher and heavier |
| `PitchShift` | a harmonizer on the dry signal, shimmer feedback | grain-based, so it suits this material |
| `BPF` | ghosts and formant colour | |

Each addition gets a compile test against the real scsynth in `workers/cast/grains-test.mjs` (the container
already compiles `gring` with sclang-lite in node, READ in HANDOFF session 82).

### 2.4 A resonator bank tuned to the key (M): the strongest single move for bad sources

- **What you would hear**: speech, applause, room noise and clicks start to ring at the notes of the key, as if
  the file were played through a piano with the sustain pedal down. Weak material becomes pitched material.
- **How**: the scene's sound (or the ghost, 2.6) into a bank of 8 to 16 `Ringz` at chord tones of the detected
  key over three octaves, decay 0.5 to 4 s, mixed in by the life like the granulator's wet.
- **Cost**: INFERRED small: 16 two-pole resonators are cheaper than one `GrainBuf` stream.
- **Risks**: a loud transient through a high-Q bank can spike; a limiter goes after it. A wrong key makes the
  whole thing sound out of tune, so the key only changes between scenes and falls back to the drone's last key.
- **Life features**: on or off, chord kind (fifths, minor seventh, cluster), decay, wet.

### 2.5 Harmonizer and clusters (M)

- **Inside the ring**: today one `GrainBuf` reads the ring. Read it with three or four, each with its own
  `pitch` offset, pan and density, into one `Mix`. Same 8 s buffer, no second write head. That is the "chord out
  of the station" from `plan-radio-sound.md` ①, rebuilt on the cast's own program.
- **Voicings** from `chords.mjs`: octave plus fifth (open, safe), triad on the key, quartal stacks, and
  **clusters**: three to five voices a few semitones or a few tens of cents apart, which smear a voice into a
  chord-like haze and hide a bad recording well.
- **Cost**: INFERRED close to linear per stream: one ring at 23 to 25 % of a core means four streams near a
  full core in the browser, and too much for the 0.5 vCPU container. So on air, two or three streams at lower
  density, or the larger instance (2.8).
- **Life features**: voicing, number of voices, spread.

### 2.6 Ghosts: the other file visiting (S once 2.4 exists), asked as *"ghosts visiting"*

- Inside a scene, every 20 to 60 s, the next or previous file rises for 3 to 10 s: not by moving the dial (that
  is the interlude) but as a separate thin layer: band-passed, through the resonator bank or a comb, panned
  wide, at -15 to -20 dB, then gone. The scene keeps playing under it.
- In the engine it is the other slot's signal (both slots are already open near the blend) sent to a ghost
  bus instead of the tuner. For the previous file, keep its slot open a little longer after a landing.
- **Life features**: how often, how long, which side (next, previous), through what (band-pass, comb, resonators).

### 2.7 Pulse: rhythm without trusting the source's tempo (M)

The archive is mostly concerts, talk and field recordings; `tempo.mjs` needs a kick and will rarely find one
(READ, `plans/plan-beat-detection.md`). So the **life imposes** a tempo per scene (60 to 120 bpm) and rhythm comes
from what is done to the sound, not what is in it:

- grain triggers locked to the scene's beat (the ring's `lock` and `beat` exist today; the beat source becomes
  an `Impulse` at the scene tempo inside the synth),
- a euclidean gate on the grains or on the resonators (5 of 8, 3 of 8, 7 of 16), so the texture pulses,
- the tape `drop` on the downbeat for a stutter.

Where `tempo.mjs` does find a confident tempo, the life may take it instead. **Life features**: tempo, pattern,
which layer pulses.

### 2.8 Parallel rings (L)

Two or three independent rings with different roles (low and long, mid texture, high sparkle), each with its
own write head and buffer. Richer than 2.5 because each ring can freeze or slow independently. CPU is the
limit: at 23 to 25 % of a core per ring (MEASURED, one ring), three rings need about 0.75 of a core, so the
container goes from 0.5 to 1 vCPU, which doubles what a station costs per hour on air. Do 2.2 to 2.7 first;
they get most of the effect from one ring.

### 2.9 Room and tail (S once 2.3 exists)

A reverb at the end (FreeVerb, mostly long, mostly low in the mix) and optionally a shimmer (PitchShift an
octave up in the reverb's feedback). It glues layers and hides the dryness of close, bad recordings. Easy to
overdo, so it is a life feature with a cap.

## 3. What it means for the life and the votes

A scene def grows from patch, control, window, length, granulator peak, interlude to also: drone kind and
level, resonator chord and decay, harmonizer voicing, ghosts rate and route, pulse tempo and pattern, reverb.
`prefer()` already scores any feature listed in `FEATURES`, so each layer is one line there plus its range in
`complete()`. More features dilute each one's signal (seen today: adding the interlude kind weakened the
granulator feature until it was given more weight and the lean rose to 10). So add layers a few at a time and
re-run `life-test.mjs`'s learning checks after each.

## 4. Where it runs

Local first, always: the browser's wasm scsynth is free, and `local` is where the votes come from. The container
follows a layer only once it has a vote history worth putting on air, and only within its CPU budget (0.5 vCPU
today). Each container change goes through `mixer-test.mjs`, `grains-test.mjs` and `local-test.mjs` so the
two engines stay the same, as now.

## 5. Not settled

- Whether the wasm scsynth build carries `Ringz`, `CombC`, `FreeVerb`, `PitchShift`, `BPF`: compile one of each
  and read `/fail` (2.3) before step 4.
- How well the key detector does on this archive: it was tuned on radio music (`plan-key-detection.md`); speech
  and field recordings may give no key at all. Fallback: a fixed key per scene chosen by the life.
- The CPU of each new layer, in the browser and in the container: measure each before it goes on air.
- Whether any of it sounds good: nobody has heard it. The votes are how that is answered.
