# plan-ambient-piece: one piece, its tosser, and its recipe

Status (2026-11-02): open. A plan only, nothing built except `weak.c` (`demo/resources/weak/`, 12 of 12 in `weak-test.mjs`, built with emcc 2026-11-02).

Related: `plan-frames.md`, `plan-livecoding.md`, `plan-crossmodal.md`. Code: `demo/resources/weak/`, `lessons/rig-pico-weak.md`.

Joined on 2026-11-02 from `plan-ambient-piece`, `plan-tosser`, `plan-recipes`, written in a claude.ai chat between 2026-10-24 and 2026-11-02 against the repository as it was on 2026-10-22, and kept word for word below, one section each. A reference to one of those names means the section of that name here.

## plan-ambient-piece: one ambient piece, sound and image from one idea

Status (2026-10-30, updated 2026-11-01): a plan, nothing built except `weak.c` (§4). Material: the owner's nature photos
and panoramas (little video, and none needed). Tools: the Pi's scsynth, edgecast,
fx, the patchbay, the Evo keyboard and knobs. Tags: READ, MEASURED, INFERRED.

**Goal.** One piece, not music with visuals. Sound and picture come from the
same model and the same slow signals, so they change together without either
illustrating the other. Not about rhythm: slow change, layers, memory, decay.

### 1. The one idea: tape and read heads

Both media are a **buffer with read heads**:

| | Sound | Picture |
|---|---|---|
| the tape | a recorded or played-in buffer (the `bentEcho` loop) | a panorama, or a row of photos laid end to end |
| a read head | reads the buffer `time` behind the write head | a window moving along the panorama |
| speed | pitch shifts as the head runs faster or slower | the landscape drifts faster or slower |
| a jump | a stutter or skip back | a cut to another place on the tape |
| reverse | a chunk played backwards | the drift runs backwards |
| freeze | the loop holds, slowly eroding | the window stops; the image keeps decaying |
| feedback | each repeat processed again | each frame echoed into the next, fading |
| two heads, unrelated lengths | Discreet Music: never quite repeats | two windows blended: the landscape re-layers |

**One `tape` model, two renderers.** A jump in one is a jump in the other when
they share a head; or each has its own heads driven by the same signals. Same
seed, same accidents, in both.

### 2. Shared slow signals

All `value` ports on the patchbay (plan-bay-code):

- `lfo({ period: 90 })` and longer: minutes per cycle
- `walk({ seed, step })`: a seeded random walk
- `hold({ every: 20 })`: sample and hold
- knobs through `slew(8)`: a turn becomes a drift
- the Evo keyboard: a held note **latches** the drone's pitch and the picture's
  scene; velocity sets brightness in both

Each signal can go to a sound parameter and a picture parameter at once. A walk
on `bits` and on grain size, a long LFO on echo `time` and on head speed.

### 3. Sound

- **Voice:** a sustained drone (SuperCollider on the Pi's scsynth, READ: the
  board runs scsynth; or Faust where portable code matters).
- **Space:** `bentEcho` (two instances, unrelated times such as 4.3 s and
  6.7 s), then a long reverb, then a limiter.
- **Bends in the loop:** bits, sample rate, jumps, reverse, speed, freeze
  (plan-bends, audio).
- **Optional sources:** the Circuit as long held notes only; field recordings
  if any.

### 4. Picture

Colour first, in the browser and on HDMI; a 1-bit version for the OLED later
(plan-screens §7, the colour question).

| Technique | Material | Role in the piece |
|---|---|---|
| panorama tape | panoramas | the main layer: the slow drift |
| image granular | close-ups, any photo | texture; density and grain size from shared signals |
| slit-scan | photo series from a tripod, panoramas | stretched time, for slower sections |
| averaging | many photos of one place | ghost images, for transitions |
| frequency-domain texture | any photo | scenes dissolved into their "grain of detail" |
| depth point cloud | photos with clear depth | dissolve and re-form; for climaxes that are not loud |
| texture NCA | one close-up (moss, ice, bark, water) | a living surface; plan-small-data |
| mirror / kaleidoscope | any landscape, panoramas | symmetry from horizons and reflections (seen in phrz, 2026-10-31); `fx_mirror` exists for 1-bit |
| weak signal | any layer | `weak.c` (built 2026-10-31): blocks stale, smeared, old and new scenes mixed; driven by a `signal` port |

Depth: a single-image depth model as ONNX, run once per photo offline or on the
Pi (the tract work, `hand-models-2026-10-29.md`, applies). Not every frame.

### 5. Couplings, both ways

- **Sound to picture:** loudness to feedback keep, spectrum to grain colour,
  echo jumps to tape jumps.
- **Picture to sound:** a frame's brightness to the echo's `tone`, its detail to
  `bits`, rows as wavetables (plan-crossmodal).
- **Closed loop:** both at once, slowly. The piece plays itself; the player
  nudges. Guards: limiter, feedback caps, panic.

### 6. Form: scenes, not songs

A scene is a set of materials, couplings and signal ranges: "shore", "forest",
"ice". Moving between scenes is slow: crossfades of minutes, an averaging ghost
between two places.

Two modes:

- **Performance:** the Evo and knobs choose and steer scenes.
- **Installation:** scenes follow a seeded schedule; the piece runs for hours.

### 7. Recipes

Photos, scene definitions, couplings and seeds: a recipe (plan-recipes). The
same recipe replays the same piece; a different seed is a new performance of it.

### 8. Material to gather

- panoramas with generous overlap (the tapes)
- tripod series of one framing over minutes or hours (slit-scan, averaging)
- close-ups of textures (grains, NCA)
- photos with foreground, middle and far (depth)
- optional: field recordings from the same places, so sound and picture share a
  place too

### 9. Where it runs

| Part | Where |
|---|---|
| drone, bentEcho, reverb | the Pi's scsynth (READ: `board.mjs` answers `sc.*` from pages) |
| tape, grains, slit-scan, clouds | a browser page, on HDMI or a projector |
| shared signals and couplings | the patchbay; the page and the board both subscribe |
| depth maps, NCA training | offline, once per photo or texture |
| the OLED version | fx.c, 1-bit, a reduced layer |

### 10. Order

1. Three sketches on own photos, each alone: panorama tape, image granular,
   depth cloud. Decide which carry the piece.
2. Drone + one `bentEcho` on the Pi, one knob, ten minutes of listening.
3. The shared `tape` model: one head driving both the sound loop and the
   panorama window.
4. Shared signals: one LFO and one walk into both.
5. The Evo latch for pitch and scene.
6. Couplings, one direction at a time, then the closed loop.
7. Scenes and slow transitions; installation mode.
8. Recipe format; a first full run of an hour.

### 11. Open

- One head shared, or separate heads driven by the same signals? Try both in
  step 3.
- Colour on the OLED: drop it, or a separate 1-bit layer.
- Projector or screen; the room.
- Whether field recordings join, so the sound has the photos' places too.

### 12. Added 2026-11-01

- **Field recordings are in.** phrz (nokbeats, "experiment 04: 24 field
  recordings") shows the same material choice: recordings cut, shaped and
  paired with mirrored nature footage. Record sound wherever photos are taken.
- **Form and material re-rolled separately.** phrz has `new phrase` and
  `new sounds` as two buttons. Here: re-seed the scene's structure (signal
  ranges, couplings, transitions) without changing its material, and the other
  way round.
- **Generate, listen, keep.** Undo, redo, history and keep over seeded
  variations: plan-recipes' "keep this accident" as the interface.
- **Jumping back in time, live** (plan-tosser): the tape's read head sent N
  seconds back by a key, in sound and picture together.
- **A CRT as one of the screens** (plan-tv): the piece's 1-bit or weak-signal
  layer on an old television.

## plan-tosser: jumping back in a live buffer

Status (2026-11-01): a plan, nothing built. Prompted by alter.audio's
Timetosser (hardware, EUR 359 at Howler Audio, read 2026-11-01): it continuously
buffers its input; buttons move the playback position backwards in that buffer;
a circle button returns to live; tempo detection keeps jumps on the beat.

**Goal.** The same instrument inside Positron, beat-free for the ambient piece,
beat-locked when wanted, in sound and picture.

### 1. The model

- A buffer that always records (the `bentEcho` buffer, plan-ambient-piece §3).
- A read head normally `0` behind live.
- A jump: the head moves to `N` seconds (or beats) behind, keeps playing from
  there; a short crossfade so it blurs instead of clicking.
- Return: the head goes back to live.

### 2. Keys

- The Evo keyboard: each key a distance back; one key "live".
- Or notes from Strudel, Orca, the patchbay.
- Beat mode: distances in beats from the patchbay clock (or detected tempo).
- Ambient mode: distances in seconds or phrase lengths, no grid.

### 3. Sound and picture

The same jump moves the panorama tape's read head (plan-ambient-piece §1), so
both leap back together. Same seed, same accidents.

### 4. Where

- Sound: a SynthDef on the Pi's scsynth (buffer write, read with a jumping
  position, crossfade), through the proxy layer (plan-livecoding §2.1).
- Patchbay: a `tosser` node, `audio` in and out, a `midi` or `value` port for
  the jump.

### 5. Order

1. SynthDef with keyboard jumps on the Pi; crossfade length tuned by ear.
2. Beat mode from the patchbay clock.
3. Linked to the panorama tape.

## plan-recipes: the code and the seed are the work

Status (2026-10-30): a plan, nothing built. Prompted by tachyonbeats'
"a security radio nobody is on the radio" (Instagram, October 2026): a seeded
Python script, "there is no recording of this". INFERRED unless READ.

**Goal.** A piece can be published as its recipe (code, parameters, seed)
rather than as a recording, and anyone can render the identical result.

### 1. A recipe

```
recipe.md       title, author, what it is, licence
render.*        the code (a cast scene, an fx chain, a bay patch)
params.json     values, including the seed
hash            of the expected output, so a render can prove it matches
```

### 2. Why it fits Positron

- READ: fx and the planned bends already take seeds and test frames by hash.
- The cast renders scenes from settings; a recipe is that, written down.
- It matches "forgets on purpose" (poetronics): nothing stored that can be
  remade.

### 3. Rendering

- In the browser where possible (fx wasm, small synths), on the station
  otherwise.
- A render compares its hash with the recipe's. A mismatch says the engine
  changed, which is worth knowing too: version the engine in `params.json`.

### 4. Order

1. The recipe format, and one fx piece published as a recipe with its hash.
2. A cast scene as a recipe.
3. A page that lists recipes and renders on request.

### 5. Open

- Audio from scsynth: is it bit-identical across machines? MEASURE; if not, the
  hash is over a stated tolerance, not exact bytes.
