# Local models writing patches, scenes, L-systems and SDFs (2026-11-14)

The owner: "Test it". The question: how well do local models on the M1 write four kinds of short
description that a device builds itself, against the hosted model positron uses now
(wish.positron.studio /wish/code)?

Everything here is MEASURED on 2026-11-14 unless it says INFERRED. Scripts, raw results (one JSON line per
wish per model, every try with its text and error) and the renders (344 PNGs) are in
`research/local-patch-geometry/`.

## Verdict

- **Validity is not the problem; meaning is.** Every model, local or hosted, gets 20 of 20 patches valid
  within three tries, and 19 or 20 of 20 L-systems. A validator plus a retry turns any of these models into
  one that writes valid JSON. What separates them is whether the valid answer looks like the wish, and there
  the local models are far behind: the 4B passed L-system validation 20 of 20 and drew 0 of 8 sampled
  wishes recognisably.
- **The hosted `@cf/qwen/qwen3.8-27b` is the best model in the test on every kind**, including the
  hardest one (SDF: 19 of 20 valid, 8 of 12 sampled look like the wish, a gear with teeth, a cube with a
  ball cut from each face, a branching coral). It beat the worker's default `qwen2.5-coder-32b` on scene,
  SDF and L-system validity and on SDF by eye; the coder-32b drew L-systems slightly better by eye.
- **On the M1, the 9B is the only local model worth offering for scene and SDF, and it is slow** (SDF
  p90 97 s a wish, memory 11 GB wired, 13 percent of RAM left free). The 4B and the coder 7B are fine for
  `patch` and nothing else.

## Setup

| what | value |
| --- | --- |
| machine | M1, 16 GB, macOS 26.6.2, Ollama 0.40.5 (Homebrew, already installed) |
| local models | `qwen3.5:4b` (4.0 GB on disk, pulled today), `qwen3.5:9b` (7.6 GB, was there), `qwen2.5-coder:7b` (4.7 GB, pulled today). `qwen3:4b` was not pulled: `qwen3.5:4b` is the nearest newer one and the 9B is the same family |
| engine | Ollama ran both qwen3.5 models on its **MLX** runner (`ollama ps` RUNNER column) and the coder on the default one |
| thinking | off with `"think": false` in `/api/chat`. Answers carried no `thinking` text (checked per try, field length 0) |
| JSON mode | **qwen3.5 on MLX refuses it**: `format: "json"` and `format: <schema>` both answer HTTP 501 `structured output is unavailable` for `qwen3.5:4b` and `qwen3.5:9b`. So the qwen3.5 models ran with no schema, and `qwen2.5-coder:7b` ran WITH the JSON schema as `format` (grammar constrained). That makes the coder's JSON numbers not like for like with the 3.5s |
| local options | temperature 0.3, `num_predict` 1500, `num_ctx` 8192, one request at a time, called from the laptop over an SSH tunnel |
| hosted | `POST https://wish.positron.studio/wish/code` with `Origin: https://positron.studio`, `lang: "glsl"`, our system prompt sent as `contract`, retries as `previous` plus `error` (the worker turns these into an assistant turn and a "refused, write it again" turn, the same shape as the local loop). No key needed. Two models: the default `@cf/qwen/qwen2.5-coder-32b-instruct` and `@cf/qwen/qwen3.8-27b` (in the worker's `CODE` allowlist, thinking off by the worker's `CODE_EXTRA`). 221 calls in all, no 429 seen; client spaced calls at least 2.2 s apart |
| hosted quirks | the worker always wraps the answer as `{"code": "<string>"}` with `json_schema` mode, so a JSON kind arrives as JSON inside a string (more tokens, escaping). It caps answers at 1000 tokens: 10 hosted answers were cut there (6 coder-32b, 4 qwen3.8), mostly long scenes. On a retry it also appends the GLSL shader examples meant for /shader/wish/ to the system prompt, which is noise for these kinds |
| checker | JSON kinds: hand-written validators in `kinds.mjs` (patch, scene, lsystem), errors fed back verbatim. SDF: static checks (no `while`, every `for` with literal bounds and at most 64 runs, no uniforms or textures, `float sdf(vec3 p)` present), then compile and evaluate on a 48^3 grid in WebGL2 in headless Chrome (render to an RGBA32F texture, read back), require 0.5 to 60 percent inside, largest 6-connected piece at least 90 percent, no NaN, under 2 s |
| SDF helpers given | sdSphere, sdBox, sdRoundBox, sdTorus, sdCylinder, sdCapsule, sdCone, opUnion, opSubtract, opIntersect, opSmoothUnion, rot (prepended; the model must not redefine them) |
| wishes | 20 per kind, the same for every model, easy first and hard last (`wishes.mjs`) |
| loop | up to 3 tries per wish; time per wish is wall clock over all its tries |

## Results

`n` is wishes run. Seconds are per wish over all tries. Tokens out are summed over the tries of a wish.

| model | kind | n | pass try 1 | pass within 3 | failed | commonest final error | median s | p90 s | tokens out per wish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hosted qwen2.5-coder-32b (default) | patch | 20 | 18 | 20 | 0 | | 4.3 | 7.0 | 138 |
| hosted qwen2.5-coder-32b | scene | 20 | 9 | 13 | 7 | instance outside the room (5) | 7.2 | 33.2 | 536 |
| hosted qwen2.5-coder-32b | lsystem | 20 | 15 | 19 | 1 | not JSON, cut at 1000 tokens (1) | 2.2 | 4.7 | 202 |
| hosted qwen2.5-coder-32b | sdf | 20 | 14 | 17 | 3 | too small or empty (2) | 5.7 | 18.9 | 247 |
| hosted qwen3.8-27b | patch | 20 | 20 | 20 | 0 | | 3.2 | 12.0 | 148 |
| hosted qwen3.8-27b | scene | 20 | 11 | 16 | 4 | instance outside the room (4) | 11.8 | 44.6 | 602 |
| hosted qwen3.8-27b | lsystem | 20 | 19 | 20 | 0 | | 2.1 | 9.1 | 52 |
| hosted qwen3.8-27b | sdf | 20 | 16 | 19 | 1 | too big or sign inverted (1) | 6.8 | 37.3 | 379 |
| local qwen3.5:4b (no schema) | patch | 20 | 12 | 20 | 0 | | 6.0 | 13.3 | 290 |
| local qwen3.5:4b | scene | 20 | 6 | 10 | 10 | instance outside the room (9) | 7.2 | 15.5 | 320 |
| local qwen3.5:4b | lsystem | 20 | 15 | 20 | 0 | | 1.7 | 2.4 | 60 |
| local qwen3.5:4b | sdf | 20 | 10 | 11 | 9 | redefined a given helper (3) | 6.1 | 70.5 | 927 |
| local qwen3.5:9b (no schema) | patch | 20 | 16 | 20 | 0 | | 6.0 | 16.0 | 249 |
| local qwen3.5:9b | scene | 20 | 12 | 16 | 4 | instance outside the room (3) | 12.9 | 49.4 | 795 |
| local qwen3.5:9b | lsystem | 20 | 18 | 19 | 1 | expands to no F or G (1) | 3.5 | 4.2 | 74 |
| local qwen3.5:9b | sdf | **11 of 20** | 6 | 9 | 2 | too small or empty (1) | 8.5 | 97.1 | 824 |
| local qwen2.5-coder:7b (schema) | patch | 20 | 12 | 20 | 0 | | 8.2 | 17.0 | 243 |
| local qwen2.5-coder:7b | scene | **8 of 20** (the easy ones) | 8 | 8 | 0 | | 8.1 | 47.0 | 348 |
| local qwen2.5-coder:7b | lsystem | 20 | 17 | 20 | 0 | | 2.4 | 5.0 | 66 |
| local qwen2.5-coder:7b | sdf | **10 of 20** | 7 | 7 | 3 | int/float type error (2) | 3.6 | 30.6 | 252 |

The partial rows are the time box: the 9B's SDF took up to 237 s a wish and was stopped after wish 10; the
coder's scene run was stopped after wish 7 to get its L-system and SDF numbers, and its SDF run was stopped
after wish 9 at the 2 hour mark. Partial rows are the easier wishes, so they flatter the model.

Decode speed on the M1 (median per try): 4B 40.6 tokens/s, 9B 31.1, coder 7B 25.4.
SDF grid evaluation (48^3 in WebGL2, laptop GPU, passing answers): median 41 to 47 ms, worst 118 ms. The
2 s limit never bit.

### By eye (does the valid answer look like the wish?)

Rendered with the scripts below and judged by me from contact sheets. yes / partly / no; a failed wish has no
picture.

| kind (sample) | coder-32b hosted | qwen3.8-27b hosted | 9B | coder 7B | 4B |
| --- | --- | --- | --- | --- | --- |
| scene (6 wishes: 0 4 8 14 16 19) | 5 yes, 1 failed | 3 yes, 1 partly, 2 failed | 2 yes, 3 partly, 1 not judged | not judged | 0 yes, 1 partly, 3 no, 2 failed |
| lsystem (8 wishes: 0 1 2 4 5 9 13 19) | 5 yes, 1 partly, 2 no | 4 yes, 4 no | 1 yes, 1 partly, 5 no, 1 failed | 1 yes, 1 partly, 6 no | 0 yes, 2 partly, 6 no |
| sdf (12 wishes: 0 1 2 6 8 9 10 13 14 15 17 19) | 3 yes, 2 partly, 5 no, 2 failed | **8 yes, 1 partly, 3 no** | of 7 run: 2 yes, 3 partly, 2 failed | of 6 run: 3 yes, 1 no, 2 failed | 2 yes, 1 partly, 5 no, 4 failed |

What the pictures show:
- **L-systems: the small models copy the example.** The prompt's example rule `F[+F]F[-F]F` comes back as
  the answer to "a coral", "a simple tree", "a snowflake with six arms" and "lungs" from the coder 7B and
  the 9B, and the 4B drew a wiggly line for "a Koch snowflake". The coder 7B drew a correct Sierpinski
  triangle for "a Koch snowflake". Only the hosted models knew the classic grammars (Koch, Sierpinski,
  Hilbert from coder-32b; Koch and a three-way coral from qwen3.8). Nobody drew a dragon curve.
- **Scenes: the 4B builds one object where the wish asks for many** (one box for "a stone table with four
  legs", one cylinder for "a forest", one figure for "a crowd of 1500"). The 9B gets the structure (a
  ring of 24 pillars, Stonehenge with lintels) but sizes are off (a pool as a dot).
- **SDF: everyone does the primitives** (sphere, rounded cube, donut). Only qwen3.8-27b does composition
  (gear teeth, a cube with six spherical cuts, a mushroom, a coral of capsules, a skull-ish block with eye
  holes). Nobody wrote a trefoil knot or a wine glass that looks like one; "a twisted torus with holes" came
  back as a plain torus from four of five models.

## The renders, and which sheets to look at first

Every passing answer of every model is rendered from the results above, with no new model calls:
`renders/<kind>-<model>-<NN>.png` per wish (NN is the wish number in `wishes.mjs`), and one contact sheet
`renders/sheet-<kind>-<model>.png` per kind and model, with the wish captioned under each picture.
Models are named `hosted-coder32b`, `hosted-qwen38-27b`, `local-qwen35-4b`, `local-qwen35-9b` and `local-coder7b`.

- **patch**: a WebGL2 player (`views.page.js`) runs each patch for 6 s of an 8 s made-up signal track at
  30 fps and keeps the frames at 0, 2, 4 and 6 s as one strip. The current value of every parameter is
  printed under each frame.
  - Signal track: the envelope rises and falls once over 8 s. An onset arrives every 2 s, at 1.8, 3.8 and
    5.8 s, so the frames at 2, 4 and 6 s fall 0.2 s after a hit. The clock runs at 60 BPM with a 4 s bar.
    The hands follow slow sines.
  - Bindings: each binding follows its signal through its attack and release times.
  - Generators: particles are points; field, tunnel and grid are simple shaders.
  - Effects: mirror, displacement, feedback, trails, bloom and noise are each one cheap pass.
- **scene**: rasterised in 3D with instancing, from above and at eye height (1.7 m, looking in from
  the +z wall).
- **lsystem**: the 2D turtle drawing.
- **sdf**: ray marched from two angles.

**Do the bindings move? MEASURED from the per-frame parameter values (`results/patch-motion.json`):**
- Every bound parameter changed by more than 2 percent of its range across the four frames in 83 of the 84
  patches that have bindings. The one exception is the 4B's wish 10, which binds feedback to the range
  [0.97, 0.98]. The binding is there, but nobody would see it.
- Patches with no bindings at all:

  | model | patches with no bindings |
  | --- | --- |
  | coder 7B | 6 |
  | 9B | 6 |
  | coder-32b | 2 |
  | qwen3.8 | 2 |
  | 4B | 0 |

- Three strips are still, meaning the largest mean pixel change between frames is under 2 of 255:
  - coder-32b wish 02, "a calm blue field that barely moves", and coder 7B wish 02, the same wish. Both
    are right to be still.
  - coder-32b wish 11, the "minimal white grid". It has speed 0, no bindings and hue 0, which is red. The
    vocabulary has no saturation, so "white" cannot be said at all.

**Sheets to look at first:**
1. `sheet-patch-local-qwen35-4b.png`: the 4B's patches move, and visibly more than anyone's (median frame
   change 65, against 47 to 56 for the others). It binds something in every patch, and the beat hits are
   visible in the 2, 4 and 6 s frames. What the strips show is that it moves but does not listen to the
   wish's colour: "slow dark water" comes out yellow-green, and "a calm blue field" comes out purple and
   moving. Compare it with `sheet-patch-hosted-qwen38-27b.png`, where the colours match the wishes.
2. `sheet-scene-hosted-qwen38-27b.png`: most hosted scenes read as the wish. There is the ring of pillars
   around a pool, a line of lamps, three stacked rings, the pyramid of spheres, a forest of thin cylinders,
   a field of 400 cubes and Stonehenge with lintels.
   - Where it misses, the eye height view shows how:
     - "a city seen from above" is one flat slab.
     - The upright torus portal is huge and right in front of the camera.
     - The hedge maze is a block of boxes.
   - Then look at `sheet-scene-local-qwen35-4b.png` to see one object where the wish asks for many.
3. `sheet-sdf-hosted-qwen38-27b.png` beside `sheet-sdf-local-qwen35-4b.png`: composition (a gear, cuts, a
   coral, a mushroom) against primitives.

The L-system sheets (`sheet-lsystem-*`) show the copied example plant in every local model.

Size: 344 PNGs, 51 MB, of which the 20 sheets are 25 MB. If that is too much for the repository, the
sheets alone carry everything.

## Failure patterns

Across all refused tries (`results/summary.md` has the census per model):
- **scene: "outside the room" dominates every model** (4B 29 refused tries, coder-32b 18, 9B 14, qwen3.8
  11). The models place a 6 m tall thing at y = 4, or a ring of radius 9.5 with 1 m wide stones. The error
  message names the first offending instance and the fix usually lands on the next try, but not always.
- **patch: ranges in bindings** (`[0.5, 2.5]` for a 0..2 param). Fixed on try 2 every time, by every model.
- **lsystem: symbols outside the alphabet** (`X`, `Y` from the textbook grammars) and, from coder-32b,
  answers cut at the worker's 1000 token cap when it wrote the expanded string instead of the rules.
- **sdf, small models: GLSL type errors** (int where float is needed, `opRotate` that does not exist) and
  **redefining the helpers they were given** ("function already has a body"), even though the prompt says
  not to. The 4B also rambles: 6 of its SDF tries ran into the 1500 token cap mid comment.
- **sdf, big models: geometry, not syntax**: inverted sign, a solid too small for the grid, or two
  separate pieces. These are exactly what the grid check is for and what a compile-only check would miss.

## Cost on the M1

| model | disk | `ollama ps` size | wired memory (whole machine) | lowest free memory seen | decode tokens/s |
| --- | --- | --- | --- | --- | --- |
| nothing loaded | | | 1.5 GB | | |
| qwen3.5:4b (MLX) | 4.0 GB | 4.8 GB at load, **grew to 12 GB** over the run | not sampled (sampler added later) | 22 percent | 40.6 |
| qwen3.5:9b (MLX) | 7.6 GB | 7.6 GB at load, **grew to 16 GB** over the run | 11.0 GB | **13 percent** | 31.1 |
| qwen2.5-coder:7b | 4.7 GB | 4.9 GB, steady | 6.9 GB | 56 percent | 25.4 |

The growth of the MLX models' reported size is MEASURED (`ollama ps` sampled every 20 s); whether it is a
KV or buffer cache that would be given back under pressure is INFERRED, not tested. The 9B pushed the
16 GB machine to 13 percent free with nothing else heavy running, so the M1 cannot hold the 9B and anything
else large at the same time.

Per wish, the local models are 1.5 to 3 times slower than hosted at the median and much worse at p90
(9B SDF p90 97 s, against 37 s hosted). Hosted spent 221 calls, 205,064 tokens in and 46,095 out for
160 wish runs.

## Recommendation for the visualia pool

| kind | offer | why |
| --- | --- | --- |
| patch | **local qwen3.5:4b** (or coder 7B), hosted as an option | 20 of 20 valid within 3 tries for every model; a patch is a small closed vocabulary where the binding choice is reasonable from any of them; 4B median 6 s and the smallest memory |
| lsystem | **hosted qwen3.8-27b** (or coder-32b); local only as an offline fallback | locally everything validates and almost nothing looks like the wish: the small models repeat the prompt's example. Worth trying before ruling local out: a few named grammars (Koch, Sierpinski, Hilbert, plant) as presets the model picks and tweaks, INFERRED to suit small models better |
| scene | **hosted qwen3.8-27b**; local qwen3.5:9b if offline is a must | 9B is as valid as qwen3.8 (16 of 20) and gets structure right, but at 13 s median and 11 GB wired; the 4B is not good enough (10 of 20, one object per wish) |
| sdf | **hosted qwen3.8-27b only** | 19 of 20 valid and the only model that composes shapes; local models do primitives and little else, and the 9B is too slow (p90 97 s) |

And for the hosted side: **switch the default for these kinds from coder-32b to qwen3.8-27b**, and raise
the worker's 1000 token cap (or send the JSON kinds without the `{"code": ...}` string wrapper), because
10 hosted failures were truncation, not the model.

## What I could not do

- Finish the 9B on SDF wishes 11 to 19 and the coder 7B on scene wishes 8 to 19 and SDF 10 to 19 (time box).
- Run the coder 7B without the schema, to separate the grammar from the model (planned, cut for time).
- Sample the 4B's wired memory (the sampler gained the wired line after the 4B run).
- Judge every answer by eye: the by-eye rows are samples (6, 8 and 12 wishes), judged by one reader.
- `qwen3:4b` itself was not tested; `qwen3.5:4b` stood in for it.

## Files

- `research/local-patch-geometry/wishes.mjs`: the 80 wishes.
- `research/local-patch-geometry/kinds.mjs`: system prompts, JSON schemas, validators for patch, scene and lsystem, the SDF static check and helpers.
- `research/local-patch-geometry/gpu.mjs`: headless Chrome over raw CDP: the 48^3 SDF grid check, the ray marcher, the scene and turtle renderers. Kills Chrome and removes its profile on every exit.
- `research/local-patch-geometry/run.mjs`: the loop (`--via ollama|hosted --model <id> --kinds ... --schema on|off`), resumable.
- `research/local-patch-geometry/summary.mjs`, `render.mjs`: the table, and per wish PNGs plus contact sheets.
- `research/local-patch-geometry/run-local.sh`, `run-hosted.sh`, `mem.sh`: the runs as made (local reached the M1 through `ssh -L 11435:localhost:11434 mbp`).
- `research/local-patch-geometry/results/`: the raw JSONL per model, `summary.md`, `mem.txt`.
- `research/local-patch-geometry/render-all.mjs`, `views.page.js`: the patch player, the 3D scene view and the contact sheets.
- `research/local-patch-geometry/renders/`: 324 per-wish pictures and 20 contact sheets (see the renders section).
