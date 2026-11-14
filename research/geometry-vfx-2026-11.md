# Geometry and VFX for the headset, written by a model (2026-11-14)

The question, the owner's: *"Do you have plan on vr geometry gen, in visualia or positron, can it be extended to vfx?"*
Short answer: no plan exists in either repository. The nearest is one row in
[plans/plan-visuals.md](../plans/plan-visuals.md) §1.1: *"geometry generated from a rule (L-system, voxel field,
mesh from noise): browser; the rule is the document; the mesh is its output and need never cross"*. Visualia has
nothing 3D: its board was dropped on 2026-10-23 ([board.md](../../visualia/plans/board.md)), and its model work is
images and SVG ([local-images.md](../../visualia/plans/local-images.md),
[svg-generation.md](../../visualia/research/svg-generation.md)). Yes, it extends to VFX, and VFX fits positron's
rule better than meshes do. Nothing was built, run or measured for this note. **READ** means read at the link,
**INFERRED** means reasoned from it.

## 1. Ways to make geometry for WebXR on a Quest, ranked for positron

### Rank 1: a model writes a rule, the headset builds the mesh

This is [/shader/wish/](https://positron.studio/shader/wish/) one dimension up. Today a sentence becomes a GLSL
fragment shader: `demo/shell/glsl-wish.mjs` adapts the text, compiles it in a sandbox GL, refuses a flat picture,
keeps a still one as a last resort, with 3 tries and a 15 s budget (READ, `glsl-wish.mjs`, `wish-loop.mjs`).
For geometry the model would write one of these:

- **A small JSON scene document** (primitives, an L-system grammar, a seeded noise field). Data, not code, so safe
  by construction, and it fits *"send parameters and seeds, not pixels"* ([plan-visuals.md](../plans/plan-visuals.md)
  §1). INFERRED: the best first seam.
- **A signed distance function in GLSL**, meshed once by marching cubes in the page, reusing the GLSL wish loop.
  INFERRED: ray marching it per pixel in stereo at 72 to 90 Hz would cost far more than drawing the mesh.
- **three.js JavaScript.** Refused: plan-visuals §1.2 says generated shaders are a defensible seam and generated
  JavaScript is not (READ).

Models can do this but not cleanly. [3DCodeBench](https://arxiv.org/abs/2606.01057) (12 vision language models
writing Blender code) finds failures "mostly arise from API mismatches" and successful renders "still suffer from
disconnected or floating 3D geometric components"; more thinking and multi-turn refinement help (READ, abstract).
INFERRED: a narrow JSON grammar with a validator that the page
owns avoids the API mismatch class entirely, and a check for disconnected parts is the geometry version of
`checkPicture`'s flat and still test.

### Rank 2: Gaussian splats

- [Spark](https://sparkjs.dev/docs/) (World Labs, three.js) has level of detail, `.spz`, "Procedural Splats" and a
  "Dyno" shader library (READ, docs index; the pages were not opened). A Quest 3 browser shows "1 million or less"
  splats with LoD defaulting to 500,000 (READ, [ar-go.co summary](https://ar-go.co/blog/gaussian-splatting-platforms/),
  citing Spark). three.js added native splats in r186, August 2026, without streaming (READ, same page).
- INFERRED: a scanned splat is a captured file, pixels by another name; seeded procedural splats would be rank 1.

### Rank 3: local text or image to 3D models

| model | size | memory | time per mesh | licence | source |
| --- | --- | --- | --- | --- | --- |
| TRELLIS.2 | 4B | 24 GB NVIDIA, Linux only tested | 3 s at 512³, 17 s at 1024³, 60 s at 1536³, H100 | MIT | [GitHub](https://github.com/microsoft/TRELLIS.2) |
| Hunyuan3D 2.1 | 3.3B shape + 2B paint | 10 GB shape, 21 GB texture, 29 GB both | 5.7 min shape + 8.5 min texture on an M4 Pro 24 GB (community port) | Tencent community licence, excludes EU, UK, South Korea | [GitHub](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1), [Mac port](https://github.com/VladimirTalyzin/hunyuan3d-2.1-mac-rocm), [licence note](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026) |
| Hunyuan3D 2mini | 0.6B shape | about 4 GB (Mac guide) | 2 to 5 min on Apple Silicon | as above | [Mac guide](https://github.com/Brainkeys/Hunyuan3D-2.1-mac/blob/main/README_macOS.md) |
| TripoSG | 1.5B | 8 GB | not stated | MIT | [cinevva timeline](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026) |
| SPAR3D | not stated | 10.5 GB (7 GB low mode) | not stated; MPS experimental | gated Stability licence | [GitHub](https://github.com/Stability-AI/stable-point-aware-3d) |
| Stable Fast 3D | not stated | about 6 GB; MPS wants 32 GB or use CPU | not stated in README | gated Stability licence | [GitHub](https://github.com/Stability-AI/stable-fast-3d) |
| TripoSR | not stated | about 6 GB | under 0.5 s on an A100 | MIT | [GitHub](https://github.com/VAST-AI-Research/TripoSR) |

Hunyuan3D 3.0 is not open weights; 2.1 (2025-06-13) is still the newest open Hunyuan shape model (READ,
[cinevva](https://app.cinevva.com/guides/ai-3d-model-generation-timeline-2026)). Shap-E (2023) was not checked. Neither repository has a GPU that fits TRELLIS.2; Visualia's M1
Pro has about 12 GB usable by the GPU ([local-images.md](../../visualia/plans/local-images.md)). These produce an
asset that crosses the wire as a file, which is the opposite of positron's rule. INFERRED: worth it for Visualia
students (an object from a sketch), not for positron.

### Budgets on a Quest 3

- Meta's numbers for native apps on Quest 3 and 3S: **1.3 to 1.8 million triangles**, and draw calls of
  **200 to 300** busy, **400 to 600** medium, **700 to 1,000** light (READ,
  [Meta, Unity perf](https://developers.meta.com/vr/documentation/unity/unity-perf/)).
- For the web, Meta gives frame budgets of 13.7 ms at 72 fps and 11.1 ms at 90 fps, says 1,000 triangles as 1,000
  draw calls would drop below 72 fps on CPU cost, and recommends multiview, instancing, fixed foveation and a
  framebuffer scale of 0.8 to 0.9 ([Meta, WebXR workflow](https://developers.meta.com/horizon/documentation/web/webxr-perf-workflow/)).
  It advises one light with PBR, KTX2 textures, and to stop drawing fully transparent objects
  ([best practices](https://developers.meta.com/vr/documentation/web/webxr-perf-bp/)).
- positron's own: `scene` holds 89.8 fps and one video panel 90.0 fps on the Quest
  ([positron-xr skill](../.claude/skills/positron-xr/SKILL.md), [plan-xr-room.md](../plans/plan-xr-room.md)).
  The triangle ramp in [quest-xr-2026-09.md](quest-xr-2026-09.md) ("the complexity at which `Stale` starts
  climbing") was never run. So positron has no triangle number of its own.

## 2. Extending it to VFX

**GPU compute on the Quest.** WebGPU as a page API is on by default since Browser 32.0, but WebGPU inside an
immersive session is behind a `chrome://flags` toggle since Browser 146.0 (READ,
[quest-xr-2026-09.md](quest-xr-2026-09.md) §1.3). Since then Meta added WebGPU space warp layers (149.1),
experimental foveation (150.1) and experimental composition layers (152.1); the latest is 154.1, 2026-10-30, and no
entry moves WebGPU in a session off the flag (READ, [release notes](https://developers.meta.com/horizon/documentation/web/browser-release-notes/)).
three.js shipped WebXR on `WebGPURenderer` in r185, and its issue says it "is not implemented on Meta Quest"
(READ, [three.js #32858 WebGPU on WebXR](https://github.com/mrdoob/three.js/issues/32858)). So **VFX in a Quest headset is WebGL2
today**: particles in float textures (ping-pong) or transform feedback, instanced quads. three.js's WebGPU compute
example runs 200,000 particles on a desktop ([utsubo](https://www.utsubo.com/blog/webgpu-threejs-migration-guide));
there is no Quest figure. INFERRED: start at 50,000 instanced points and measure.

**Cost order** (INFERRED from Meta's advice): instanced particles and ribbon trails are cheap if overdraw stays
small; full screen post (bloom, blur) is a pass per eye; ray marched volumetrics cost most. On the Pi, three blur
passes halved one shader from 54.6 to 28.2 fps ([plan-visuals.md](../plans/plan-visuals.md)).

**Audio control.** The ambient station's loudness moves slowly: **78.1% of envelope power sits in 0.02 to 0.1 Hz**
on 98.5 s measured ([vr-sound-visual-2026-09.md](vr-sound-visual-2026-09.md)), a file whose provenance
[plan-audio-shader.md](../plans/plan-audio-shader.md) marks unknown. INFERRED: drive emission rate, colour and
fog from the slow envelope, bursts from onsets, structure (an L-system's depth, a palette) from key and tempo.
plan-audio-shader §0: *"Draw the instrument, not the sound."*

**What a model writes.** An emitter document: shape, rate, lifetime, velocity, forces from a fixed list, colour
and size over life as curves, a seed, parameter names. Optionally one GLSL function for a custom force, through
the `glsl-wish.mjs` loop. A node graph is the same document with links, and the bay already is one.

**Checks that keep it safe to run.** (1) Schema validation with hard caps (particle count, emitters, passes,
texture size). (2) For any GLSL: the guard plan-visuals §1.2 asks for, which is *"no `while`, bounded `for` counts,
a compile timeout, and a first-run frame-budget check before the shader is promoted"*. INFERRED from reading
`glsl-wish.mjs`: it checks compile, flat and still, and has no loop or frame-time check yet, so this would be new.
(3) Promote after N frames under budget, fall back to the previous effect on a miss. (4) The way out of every headset page stays `xr-quit.mjs`
(hold any button 3 s; [positron-xr skill](../.claude/skills/positron-xr/SKILL.md)).

**How it is played.** Each emitter parameter is a value-in port on the bay (`demo/shell/bay.mjs`), so a knob,
the Circuit or an analysis signal is a link to it. vrch's binding is the missing piece: signal to parameter with
`operator`, `depth`, input range, `curve`, `attack_ms`, `release_ms`, for example `audio.v2.low` to `height` at
depth 0.45, attack 45 ms, release 320 ms (READ,
[vrch audio-mapping-v2.json](https://github.com/VrchStudio/vrch-visuals/blob/main/catalog/audio-mapping-v2.json),
via [vrch-synth-2026-11.md](vrch-synth-2026-11.md)). INFERRED: putting depth, curve, attack and release on a
positron value link lets one patch say how the slow envelope moves fog, the same for every page. Over the wire a
change is about 200 bytes, under 0.1% of a relay socket ([plan-visuals.md](../plans/plan-visuals.md) §1.3).

## 3. Where it would live, and next steps

- **positron:** a VFX wish concept page in the `wish` group beside [/shader/wish/](https://positron.studio/shader/wish/),
  later in a headset via `xr-room.mjs`; a `plans/plan-vfx-wish.md` first. Binding fields go in `bay.mjs`, next to
  [plan-board-modulation.md](../plans/plan-board-modulation.md).
- **Visualia:** a scene document as one more work type on the new board and the class space wall
  ([class-space.md](../../visualia/plans/class-space.md)); image to 3D only with a 24 GB NVIDIA box.

| step | cost | settles |
| --- | --- | --- |
| 1. Run the Quest triangle and particle ramp from quest-xr-2026-09.md, reading `VrApi` | 1 hour with the headset | positron's own budget, instead of Meta's native one |
| 2. Emitter JSON schema plus a WebGL2 instanced renderer on a desktop concept page, no model | 1 to 2 days | the document and its caps |
| 3. The wish loop writing that JSON, with a schema check and a frame-time check | 1 day, reusing wish-loop.mjs | whether models write good emitters |
| 4. Binding fields on a value link, one slow envelope to one parameter | 1 day plus bay-test.mjs | the vrch idea in the bay's data |
| 5. Same page in an immersive session | 1 day plus a headset session | VFX at 72 to 90 Hz in stereo |
| 6. A JSON L-system and SDF to mesh, same loop | 2 days | geometry, rank 1 |

## Not settled

- No triangle, draw call or particle number for the Quest browser from this repository; Meta's are for native apps.
- Whether three.js WebGPU in WebXR works on a Quest with the flag on; the three.js issue says not implemented.
- Seconds per mesh for SPAR3D, Stable Fast 3D and TripoSG were not found in their READMEs.
- The 78.1% figure comes from a file with unknown provenance and needs re-taking.
- Spark's procedural splats and Dyno pages were listed in its docs index but not read.
