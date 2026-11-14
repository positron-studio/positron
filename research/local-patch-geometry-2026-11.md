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

## Big local models and easier formats (2026-11-14 evening)

Second run, same day. Two questions: do big local models on a 32 GB laptop close the gap to the hosted 27B,
and do easier formats let the small models on the M1 draw what the wish says? A third part, points, was added
mid-run. Everything is MEASURED on 2026-11-14 unless marked INFERRED. The by-eye columns are one reader's
judgement from the contact sheets, on the same fixed samples as above (scene 6, lsystem 8, sdf 12) and a new
points sample of 8.

### Verdict

- **Easier formats fix L-systems for small models completely, and help scenes a little.** With named presets
  the 4B draws 7 of 8 sampled L-system wishes recognisably (0 of 8 with raw grammars), and so does the 9B.
  Validation is 20 of 20 for every model, at under a second a wish. This is the clearest result of the day.
- **The CSG tree (sdf-tree) helps the 4B on primitives and does not help anyone on composition.** The 4B goes
  from 2 to 4 yes of 12; gemma4:26b goes DOWN from 8 to 4. A big model composes better in GLSL than in the
  tree, because the tree has no way to say "a spiral" or "a branch" and the model knows the GLSL idioms.
- **Local `qwen3.8:27b` on the M2 Pro is as good as the hosted one by eye** (sdf 8 yes of 12, scene 5 yes
  of 6), but it is not usable on this machine with OrbStack's Kubernetes up: it ran at 17 to 22 tokens/s for
  80 wishes, then swapped and fell to 1.5 to 2.4 tokens/s and was stopped.
- **`gemma4:26b` is the big local model to use**: 50 tokens/s throughout (a mixture of experts, so far fewer
  weights per token), as good as qwen3.8 on SDF in GLSL (8 yes of 12), worse on raw scenes, and the best of
  all models on scene-blocks (4 yes, 1 partly of 6).
- **Points: the GLSL function (points-fn) beats the JSON vocabulary for every model.** JSON points fail
  validation mostly because points leave the room (a 1 m ripple on a plane at y = 0.5), and the vocabulary
  cannot say rain, a fountain or a double helix. gemma4:26b wrote 20 of 20 valid points-fn answers, 17 on the
  first try, and drew rain, a rippling plane and a torus recognisably.
- **Saturation and value in the patch let the 4B say "white"**: wish 11 (minimal white grid) came back with
  saturation 0, value 0.9 and renders as a white grid. Hue is still guessed wrong ("calm blue" is hue 0.3,
  green).

### Setup, this run

| what | value |
| --- | --- |
| laptop | Apple M2 Pro, 32 GB, Ollama 0.40.8 (server started for this run and stopped after), OrbStack with a local Kubernetes stack running throughout |
| big local models | `gemma4:26b` (16 GB on disk, already pulled), `qwen3.8:27b` (pulled today: 16.8 GB model plus 0.9 GB projector; the same tag `qwen3.8:latest` and `qwen3.8:27b-q4_K_M` resolve to) |
| small local models | `qwen3.5:4b`, `qwen3.5:9b` on the M1 over `ssh -L 11435:localhost:11434 mbp`, as before |
| engine | Ollama's **MLX** runner for all four models (`ollama ps` RUNNER) |
| JSON mode | **refused**: `format: "json"` and `format: <schema>` both answer HTTP 501 `structured output is unavailable` for gemma4:26b, the same as for qwen3.5 in the first run (tested on gemma4:26b; qwen3.8:27b also runs on MLX and was run without a schema). Every model in this run ran with no schema |
| thinking | `"think": false`; every try's `thinking` field was empty (length 0) |
| options | as before: temperature 0.3, `num_predict` 1500, `num_ctx` 8192, up to 3 tries with the validator error fed back |

### Part 1: the 80 wishes on the big local models

| model | kind | n | pass try 1 | pass within 3 | failed | commonest final error | median s | p90 s | tokens out per wish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| local gemma4:26b | patch | 20 | 20 | 20 | 0 | | 4.9 | 6.0 | 241 |
| local gemma4:26b | scene | 20 | 6 | 11 | 9 | instance outside the room (9) | 28.5 | 47.4 | 1236 |
| local gemma4:26b | lsystem | 20 | 15 | 20 | 0 | | 2.0 | 5.0 | 86 |
| local gemma4:26b | sdf | 20 | 15 | 19 | 1 | GLSL compile error (1) | 8.7 | 38.2 | 683 |
| local qwen3.8:27b | patch | 20 | 20 | 20 | 0 | | 12.0 | 19.3 | 238 |
| local qwen3.8:27b | scene | 20 | 12 | 16 | 4 | instance outside the room (2) | 17.2 | 97.5 | 894 |
| local qwen3.8:27b | lsystem | 20 | 20 | 20 | 0 | | 4.8 | 7.2 | 65 |
| local qwen3.8:27b | sdf | 20 | 16 | 18 | 2 | not one connected piece (1) | 17.1 | 54.3 | 477 |
| (hosted qwen3.8-27b, first run) | sdf | 20 | 16 | 19 | 1 | | 6.8 | 37.3 | 379 |

The local qwen3.8 is the same model as the hosted one, and its validity matches the hosted row within one
wish on every kind (scene 16 against 16, sdf 18 against 19). gemma4 is as valid on SDF and much weaker on scenes
(11 of 20): it writes long scenes (1236 tokens a wish) and puts things outside the room.

### Part 2: the easier formats

What each format is (all in `kinds.mjs`, each with a validator whose errors go back to the model):
- **sdf-tree**: a JSON CSG tree. Leaves sphere, box, cylinder, torus, cone, capsule, each with optional `at`
  and `rotate`; union, subtract, intersect, smoothUnion over `children`; repeat (a polar ring of copies),
  twist and round over one `child`. At most 40 nodes and depth 8. The device compiles it to GLSL
  (`compileSdfTree`) and the same 48^3 grid check applies.
- **lsystem-presets**: 12 named presets (fern, tree, bush, coral, koch, snowflake, sierpinski, dragon,
  hilbert, lightning, seaweed, city-grid), 3 or 4 variants each, plus iterations (capped per preset; the
  device lowers them if a variant would pass 50,000 symbols), an optional angle and a `length` taper per
  branch level. Every preset and variant was drawn and checked by eye before any model saw the format.
- **scene-blocks**: table, ring-of, grid-of, stack, tower, fence, tree, lamp-post, arch, staircase (straight
  or spiral), pyramid-of, maze, plus plain shapes, each at `[x, z]` on the floor with optional lift and turn.
  The device expands them into the old scene format; the same room caps apply, and errors name the item.
- **patch-sv**: the patch with `saturation` and `value` (0..1) added to the params, bindable like the rest.

| model | format | n | pass try 1 | pass within 3 | failed | commonest final error | median s | p90 s | tokens out per wish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4B (M1) | sdf-tree | 20 | 11 | 15 | 5 | not JSON (3) | 3.0 | 19.6 | 307 |
| 4B (M1) | lsystem-presets | 20 | 19 | 20 | 0 | | 0.6 | 2.0 | 21 |
| 4B (M1) | scene-blocks | 20 | 7 | 14 | 6 | outside the room (6) | 7.0 | 22.4 | 406 |
| 4B (M1) | patch-sv | 20 | 11 | 20 | 0 | | 6.8 | 14.3 | 306 |
| 9B (M1) | sdf-tree | 20 | 14 | 17 | 3 | not one connected piece (2) | 6.2 | 20.2 | 388 |
| 9B (M1) | lsystem-presets | 20 | 19 | 20 | 0 | | 1.0 | 3.5 | 19 |
| 9B (M1) | scene-blocks | 20 | 7 | 10 | 10 | outside the room (6) | 23.4 | 149.8 | 1462 |
| gemma4:26b (laptop) | sdf-tree | 20 | 14 | 19 | 1 | not JSON (1) | 6.1 | 32.4 | 558 |
| gemma4:26b (laptop) | lsystem-presets | 20 | 20 | 20 | 0 | | 0.7 | 1.1 | 24 |
| gemma4:26b (laptop) | scene-blocks | 20 | 7 | 15 | 5 | outside the room (5) | 22.0 | 45.0 | 1100 |
| qwen3.8:27b (laptop) | sdf-tree | **16 of 20** | 8 | 15 | 1 | not JSON (1) | 16.7 | 220.2 | 131 |

The qwen3.8 sdf-tree row is partial and its times are the swapping machine, not the model (see the cost table).
The 4B's sdf-tree failures are mostly malformed JSON (10 refused tries), often the same broken answer three
times; the 9B's are geometry (two separate pieces).

### By eye, every model and format

yes / partly / no / failed (failed has no picture). Samples: scene 0 4 8 14 16 19; lsystem 0 1 2 4 5 9 13 19;
sdf 0 1 2 6 8 9 10 13 14 15 17 19; points 0 1 2 3 5 11 13 18.

| model | scene (raw) | scene-blocks | lsystem (raw) | lsystem-presets | sdf (GLSL) | sdf-tree |
| --- | --- | --- | --- | --- | --- | --- |
| 4B | 0 / 1 / 3 / 2 (first run) | **2 / 0 / 3 / 1** | 0 / 2 / 6 / 0 (first run) | **7 / 0 / 1 / 0** | 2 / 1 / 5 / 4 (first run) | **4 / 1 / 3 / 4** |
| 9B | 2 / 3 / 0 / 0, 1 not judged (first run) | **3 / 1 / 0 / 2** | 1 / 1 / 5 / 1 (first run) | **7 / 0 / 1 / 0** | of 7 run: 2 / 3 / 0 / 2 (first run) | **3 / 0 / 6 / 3** |
| gemma4:26b | 2 / 1 / 0 / 3 | **4 / 1 / 0 / 1** | 1 / 2 / 5 / 0 | **7 / 1 / 0 / 0** | **8 / 1 / 3 / 0** | 4 / 2 / 6 / 0 |
| qwen3.8:27b local | **5 / 1 / 0 / 0** | not run | 2 / 3 / 3 / 0 | not run | **8 / 1 / 2 / 1** | of 16 run, not judged |
| qwen3.8-27b hosted (first run) | 3 / 1 / 0 / 2 | | 4 / 0 / 4 / 0 | | 8 / 1 / 3 / 0 | |

What the pictures show:
- **Presets:** both small models pick the right preset almost every time (coral three-way, koch snowflake,
  dragon, sierpinski triangle, hilbert, snowflake for six arms, city-grid skyline for the skyline). The one
  miss in every model is "lungs", which no preset covers. Where no preset fits they choose sensibly
  (seaweed lean-left for a willow, coral fan for a river delta).
- **scene-blocks:** the blocks carry the structure the 4B could not build (a ring of 24 pillars around a pool,
  a table with legs, a spiral staircase, a maze with lamps at the corners) but the 4B still leaves the forest
  empty and builds Stonehenge as a grid. gemma4 with blocks builds the forest, Stonehenge with lintels and the
  crowd of figures; the solar system failed in every block run (the room check, rings of radius 9 and more).
- **sdf-tree:** the small models do primitives and a cube with cuts; the gear comes out as a pile of
  cylinders (4B) or not at all (9B), and "a capsule lying on its side" stays upright in the 4B (it never uses
  `rotate`). gemma4 in GLSL drew a trefoil knot, a wine glass and a gear; in the tree it drew a ball on a stick
  for the wine glass, a vase for the pawn and no knot.
- **local qwen3.8 SDF in GLSL** drew the knot, a branching coral, a wine glass and a mushroom: the same
  composition the hosted model showed in the first run.

### patch-sv on the 4B

20 of 20 valid (11 on try 1). MEASURED from the answers: "a minimal white grid" got saturation 0, value 0.9 and
renders as a white grid on black; "slow dark water" got value 0.3 with value bound to the bass, so it starts
dark and brightens on the low end; 4 patches bind value. The hue is still the 4B's weak point ("calm blue" at
hue 0.3 renders green, "warm orange" at 0.95 renders pink). The renderer applies saturation and value to the
generator's output before feedback, so the gain does not compound through the feedback loop (it did in a first
render and blew the white grid out to full white).

### Points (added mid-run)

Two formats, 20 new wishes (`wishes.mjs`, `WISHES.points`), rendered as 4 frames at 0, 2, 4 and 6 s of the
same made-up signal track, from eye height (1.7 m at the +z wall), with the room's floor grid drawn:
- **points-json**: a base (plane, grid3d, sphere, torus, spiral with arms, cloud, lissajous), displacements
  (noise, wave, ripple, twist, pulse), spin, colour (by height, distance, index or time; 8 palettes;
  saturation, value), point size and bindings to any numeric field. Validated by playing it in Node: at most
  200,000 points, every sampled point inside the room at all four times, at least 0.5 m across, and moving.
- **points-fn**: `const int COUNT = n;` plus `vec3 pos(float i, float n, float t, float env)` in GLSL ES 3.00,
  checked by compiling it and sampling 4096 points at the four times on the GPU (finite, inside the room,
  spread, moving), the same loop rules as SDF.

| model | format | n | pass try 1 | pass within 3 | failed | commonest final error | median s | p90 s | tokens out per wish | by eye (sample of 8) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4B | points-json | 20 | 3 | 7 | 13 | points leave the room (10) | 8.8 | 13.7 | 353 | 2 / 1 / 1 / 4 |
| 4B | points-fn | 20 | 3 | 10 | 10 | points leave the room (6) | 29.9 | 54.3 | 1290 | 0 / 1 / 3 / 4 |
| 9B | points-json | 20 | 3 | 9 | 11 | points leave the room (11) | 28.5 | 43.6 | 704 | 1 / 2 / 0 / 5 |
| 9B | points-fn | 20 | 11 | 15 | 5 | GLSL type error (3) | 49.4 | 112.5 | 1100 | 1 / 3 / 2 / 2 |
| gemma4:26b | points-json | 20 | 2 | 6 | 14 | points leave the room (13) | 22.2 | 27.5 | 966 | 2 / 1 / 1 / 4 |
| gemma4:26b | points-fn | 20 | 17 | **20** | 0 | | 10.9 | 25.4 | 612 | **3 / 3 / 2 / 0** |

- The 9B's points-fn wishes 15 to 19 first failed as "fetch failed" when the SSH tunnel dropped; they were
  rerun once the tunnel was back (the row above is after the rerun).
- **JSON points fail on the room, not on the vocabulary's syntax.** The models put a plane at y = 0 or 0.5 and
  then displace it by a metre, or a sphere of radius 5 at y = 2. The error names the first point that left,
  and the fix often moves the centre the wrong way.
- **What the vocabulary cannot say, the models cannot either**: rain, snow, a fountain and a double helix
  have no base or displacement in points-json, and nobody drew them in JSON. In GLSL gemma4 drew rain as
  falling streaks and a rippling plane; nobody drew a recognisable double helix (single helices and stacked
  rings).
- What did read well: a sphere that breathes (gemma4 and 9B JSON), a ring that pulses (gemma4 JSON), a
  tornado wider at the top (4B JSON, 9B GLSL as a spinning cone), a twisting torus cloud (gemma4 GLSL).
- INFERRED: points-json would pass far more often if the device kept the cloud inside the room itself (clamp
  or rescale) instead of refusing, and if the base list grew `rain` (points falling and wrapping) and `helix`.

### Cost

| model | machine | `ollama ps` size at load | largest `ollama ps` size | lowest free memory | largest wired | decode tokens/s (median) |
| --- | --- | --- | --- | --- | --- | --- |
| gemma4:26b | M2 Pro 32 GB | 16 GB | 25 GB | 13 percent | 22.3 GB | 50.2 (80 wishes), 50.7 (formats), 52 (points) |
| qwen3.8:27b | M2 Pro 32 GB | 18 GB | 27 GB | 13 percent | 22.6 GB | 17.7 for the 80 wishes, then **1.5 to 2.4** |
| qwen3.5:4b | M1 16 GB | 5 GB | 12 GB | 27 percent | 6.7 GB | 40.4 |
| qwen3.5:9b | M1 16 GB | 7.7 GB | 16 GB | 13 percent | 10.8 GB | 28.1 |

- Before Ollama started on the laptop: 74 percent free, 2.6 GB wired, with OrbStack's Kubernetes running.
- **qwen3.8:27b on the laptop, MEASURED:** 13 to 22 tokens/s on every one of its 80 wishes. In the formats run
  that followed, from sdf-tree wish 8, it fell to 1.2 to 4.5 tokens/s, with swap at 10.6 GB used and Ollama's
  reported size at 27 GB. An unload and reload (back to 18 GB) did not bring it back: a direct test after the
  reload decoded at 2.4 tokens/s with 5 GB of swap still in use and 22 GB wired. The kernel's memory pressure
  level read 2 (warning) at every check, never 4 (critical). It was stopped by hand and the points run went to
  gemma4:26b instead.
- INFERRED: the dense 27B reads all of its 17 GB of weights for every token, so once anything it needs is
  compressed or swapped it slows by an order of magnitude; gemma4:26b, a mixture of experts, reads a fraction
  per token and stayed at 50 tokens/s with the same swap in use. Whether qwen3.8 holds 17 tokens/s with
  OrbStack stopped was not tested.
- As in the first run, the MLX models' reported size grows over a run (gemma4 16 to 25 GB, 9B 7.7 to 16 GB).

### Recommendation, updated

| kind | on the pool | 16 GB machine (M1 class) | 32 GB machine (M2 Pro class) |
| --- | --- | --- | --- |
| patch | patch-sv (with saturation and value) | qwen3.5:4b | gemma4:26b (20 of 20 on try 1, 5 s) |
| lsystem | **lsystem-presets, always** | qwen3.5:4b (7 of 8 by eye, 0.6 s a wish) | qwen3.5:4b is enough; gemma4 is no better |
| scene | scene-blocks | qwen3.5:9b with blocks if offline is a must (3 yes 1 partly of 6, but 10 of 20 valid and p90 150 s); otherwise hosted | **gemma4:26b with scene-blocks** (4 yes 1 partly of 6, 15 of 20 valid) |
| sdf | raw GLSL for big models, sdf-tree for small ones | qwen3.5:4b with sdf-tree for primitives only; hosted qwen3.8-27b for anything composed | **gemma4:26b with GLSL** (8 of 12, 19 of 20 valid, 50 tokens/s) |
| points | points-fn | qwen3.5:9b points-fn (15 of 20 valid, slow: median 49 s) | **gemma4:26b points-fn** (20 of 20 valid, median 11 s) |

- **On a 32 GB machine, gemma4:26b replaces the hosted model for everything except raw scenes**, and with
  scene-blocks it is the best scene model measured. qwen3.8:27b draws as well but is three times slower when it
  is healthy and collapses when the machine is busy, so it is not the one to offer next to anything else.
- **On a 16 GB machine, the format matters more than the model.** The 4B with presets and blocks is a better
  offer than the 9B with raw grammars, at a third of the memory. SDF composition and points stay hosted (or a
  32 GB machine) for now.
- For the hosted side the first run's advice stands (qwen3.8-27b as default, raise the token cap). INFERRED:
  the hosted model should also get lsystem-presets and scene-blocks, since they cost nothing in quality for a
  big model and cut tokens (lsystem-presets: 19 to 24 tokens a wish against 52 to 86).

### Sheets most worth seeing (this run)

1. `renders/sheet-lsystem-presets-local-qwen35-4b.png` beside `renders/sheet-lsystem-local-qwen35-4b.png`: the
   same 4B, from the copied example plant to a dragon, a Hilbert curve, a Koch snowflake and a skyline.
2. `renders/sheet-scene-blocks-local-gemma4-26b.png`: Stonehenge with lintels, a pool in a ring of pillars, a
   forest, a maze garden with trees and lamps, a crowd of 1500 figures.
3. `renders/sheet-sdf-local-gemma4-26b.png`: a 16 GB download on a laptop drawing a gear, a cube with six cuts, a
   wine glass and a trefoil knot in raw GLSL. Compare `sheet-sdf-tree-local-gemma4-26b.png` for what the tree
   format costs a big model.

### What I could not do, this run

- qwen3.8:27b ran only sdf-tree wishes 0 to 15 of the formats, and no points (swapping, see Cost). Its
  partial sdf-tree answers are in results/ and were neither rendered nor judged.
- qwen3.8:27b was not tested with OrbStack stopped, so how much of the collapse is the Kubernetes VM is open.
- gemma4:26b scene-blocks and sdf-tree were run once each; the by-eye counts are one reader on one sample.
- Single renders are not in the repository (`renders/` holds sheets only); they are reproducible with
  `node render-all.mjs <dir> all renders <file.jsonl>`.

### Files, this run

- `kinds.mjs`: patch-sv, sdf-tree (validator and `compileSdfTree`), lsystem-presets (`L_PRESETS`), scene-blocks
  (`expandItem`, `validateSceneBlocks`).
- `points.mjs`, `points.page.js`: the points kinds, the Node evaluator shared with the page, the GPU check and
  the eye height renderer. `wishes.mjs`: `WISHES.points`.
- `run.mjs`: kinds that borrow another kind's wishes, compiled kinds and GPU checked kinds. `render-all.mjs`:
  the new kinds and models, singles and sheets to separate directories. `gpu.mjs`: the turtle's branch taper.
  `views.page.js`: saturation and value in the patch player.
- `run-big.sh` (gemma4 then qwen3.8), `run-big2.sh` (qwen3.8 resumed, stopped), `run-big3.sh` (gemma4 points), `run-formats.sh`, `run-points.sh`, `mem-local.sh`: the runs as made.
- `results/` (ignored by the repository's `.gitignore`, as for the first run): `gemma4_26b*.jsonl`, `qwen3.8_27b*.jsonl`, `qwen3.5_4b-formats.jsonl`, `qwen3.5_9b-formats.jsonl`,
  `qwen3.5_*-points.jsonl`, the logs, `mem-local.txt`, `mem-m1-formats.txt`, `mem-m1-points.txt`,
  `patch-motion-run2.json`.
