<!-- named after rig/board/scollide.mjs sc.load: a program loaded into a running scsynth -->
# Plan: loading for the cast (new SuperCollider and composer code on a running station)

Asked 2026-10-19: *"if we already have a pipeline for live super collider recompilation with Raspberry Pi,
etc., in browser, why are we doing all this craziness with switching containers if we just can push a new
super collider code and basically keep on running the station? Plan, can we do it? In which cases we have
to really work on the server code and when it's a super collider tuning and recompilation."* and *"while
doing it, do not break any existing workflow, because we want something which works."*

Written from the code and `git log`, not from a running station. Nothing here is measured on air yet;
section 5 says what to measure.

## Verdict

Yes. 13 of the 34 station code commits since 2026-10-18 could have been pushed into a running container
as written, 31 of 34 after two small one-time changes, and only 3 needed a new image. The load path is
additive (a new keyed command), and the twin handover stays as it is for everything else.

## 1. What already exists

| where | what it does | file |
| --- | --- | --- |
| the tab | boots wasm scsynth; a load is done only on the engine's own `/done /d_recv` (the library's return value lies) | `demo/shell/scsynth.mjs` (`bootScsynth`, `sendAndWait`, lines 152 to 162) |
| the tab | an edit is compiled in the tab, `/d_recv` in one queue so loads land in order, the next `/s_new` names the new def; a `/fail` comes back with line and column | `demo/code/collide-voice.mjs` (`load`) |
| the Pi | page text compiled on the board: validate, then commit; compiled twice (canonical name, played name and bus); sha compare; `readSynthDef` re-reads the bytes and checks every block against an allowlist of classes; caps `TEXT_CAP` 4000, `MAX_DEFS` 16, `MAX_NODES` 48; a stolen node gets `gate 0` then `/n_free`; a restart re-sends every loaded program | `rig/board/scollide.mjs` (`sc.load`, `commit`) |
| the compiler | one sclang-lite function literal to SynthDef bytes, the same in node and in the tab | `demo/shell/sclang-lite.mjs` (`compile`) |
| the container | already compiles in node and `/d_recv`s at boot: the ring (4000) and the master (4100) in `startGrains`, the layers (5101 to 5106, room 5199) in `createLayerEngine`; every move after that is `/n_set` | `workers/cast/container/grains.mjs`, `demo/radio/cast/layers.mjs` |

**Why the cast cannot simply re-send a def.** Those pipelines swap a voice between notes: a note is short,
so the next `/s_new` plays the new def. The cast holds long-lived nodes (layers, room, master, ring), and
`/d_recv` under the same name never changes a node already running. Its composer is also JS state
(`life.mjs`, `layers.mjs`) imported statically by `live.mjs`. So loading needs two things the other
pipelines never needed: node replacement with a fade, and an ES module swap at a scene boundary.

## 2. What today's changes needed

`git log --since=2026-10-18 -- demo/radio/cast workers/cast`: **37 commits.**

| class | count | commits |
| --- | --- | --- |
| not station code (LOCAL page only, container copies only, comments only) | 3 | c67f7a6f, 28dd3962, 6195f1e6 |
| (a) synthdef only (`layers.mjs` PROGRAMS/ROOM, `master.mjs`) | 2 | 415429b3 (master GMAX 16), 6a3c9cae (layer pitches glide) |
| (a) plus (b), no server file | 3 | 9420391e, f1d51104, cbb5acfd |
| (b) composer only (`life.mjs`, numbers in `layers.mjs`) | 8 | 826a687f, a2d23132, 4beb8e67, 4f905dc9, f624e274, 3f431f89, ae245289, 174da23e |
| **loaded as written** | **13** | |
| (c) `live.mjs` glue only (2 to 10 lines: pass a new argument, call a new helper by name, one constant) | 9 | c9150388, 5158d788, 3cbe32eb, 82acbddf, fa2efca5, ed66c7d5, 4b7e21c1, 03209246, ba3b0d17 |
| (c) `worker.mjs` only (the Caster: cap, feed tick, vCPU) | 6 | b14471e8, e2040db4, ce5ffc19, 6717df25, 765a7e50, 86d57f0a |
| (c) `worker.mjs` plus loaded files | 3 | b298544a (`MIN_FILE_S`), 63e48807 (`TEST_FILE`), a6e7b577 (`freshTick`) |
| (c) real container change | 3 | 339be179 (new master node in the chain), cd87d468 (ffprobe in `server.mjs`), 3af1f54a (the handover itself) |

Findings:
- **Every one of the 21 (c) commits triggered a twin handover**, because the trigger is the Worker
  version (`CF_VERSION_METADATA.id`, `worker.mjs` line 702), not the image. The 6 Caster only commits
  changed no container file at all.
- **The 9 glue commits are a seam problem.** `live.mjs` builds each scene's context and level formula
  itself, so each new composer field needed a container edit. Moving that glue into `life.mjs` and
  `layers.mjs` makes the next one loaded.
- With the seam moved and the trigger on the image: 13 + 9 + 6 + 3 = **31 of 34 with no twin**.

## 3. Design

### Where the code comes from

- **Pushed on the keyed control socket**: `{"cmd":"load","files":{...},"sha":"...","apply":"boundary"|"step"}`.
  Reason: the same key and path as `play` and `stop`, and the Caster can store it.
- Sent by a new script, `workers/cast/load.mjs <station|all>`: reads the loaded files from `demo/` (the working
  tree, what LOCAL plays), runs the node tests, compiles every program locally, then sends.
- **Fetching from https://positron.studio/radio/cast/life.mjs: rejected.** Reason: it ties a station to
  the site deploy, which ships for other reasons, through an edge cache.
- **Loaded files**: `radio/cast/life.mjs`, `layers.mjs`, `master.mjs`, `soften.mjs`, `crossfade.mjs`,
  `shell/hand.mjs` (96 KB together, under one storage value).
- **Never loaded**: `granulator/grain-ring.mjs`, `shell/sclang-lite.mjs`, `synthdef.mjs`, `scsynth.mjs`.
  Reason: the ring is shared by five pages and holds the grain buffer; the rest is the compiler and engine.

### Loading a new module version

- The container writes the bundle to `/tmp/load/<sha>/` as the full `sc/` tree (the never loaded files
  copied from the image) and imports `file:///tmp/load/<sha>/radio/cast/life.mjs`.
- A `?v=<sha>` query is not enough. Reason: `layers.mjs` imports `../../shell/sclang-lite.mjs` and
  relative imports resolve without the query, so they would share the old module.
- `live.mjs` calls through one module record `M` (`M.createLife`, `M.sceneLevel`, ...) instead of static
  bindings; at boot `M` is the image's own modules, so with no `code` command nothing changes.
- Node never unloads a module: about 100 KB of source per version, negligible against 3 GiB.

### Validation, before anything changes (all or nothing)

1. Every name `live.mjs` takes from `M` exists with the same `typeof`. Missing: refused.
2. `createLife({seed, votes})` replays `hist` (the same loop as `live.mjs` line 71 on a resume) and plans
   scenes `si` to `si + 5` without throwing.
3. `compileLayers()` and the master compile with `bad` empty.
4. Every new def is sent `/d_recv` under a new name (`<name>_h<n>`) before any node moves. A UGen this
   scsynth lacks answers `/fail /d_recv UGen '<Name>' not installed.`: refused, old code keeps playing,
   the new defs are `/d_free`d.
5. Answered as a status line: `loaded <sha> ready, applies at scene <n>` or `refused: <why>`.

### The swap, at a scene boundary

- **When**: at the next landing (`apply: boundary`; scenes are 60 to 600 s, `MIN_DWELL`, line 579), or at
  once through the existing `step` move (`apply: step`, heard after one blend, at least 10 s, `MIN_BLEND`).
- **Composer**: from the next scene `L.si + 1` the new life plans. The scenes already played are rebuilt
  from `hist`, as a handover twin does. `sameScene` may read false, as after any `life.mjs` deploy.
- **Layers**: a second engine from the new module, created alongside on a second node bank
  (5201 to 5206, room 5299; both free today) with the suffixed def names. `createLayerEngine` gains
  `{ bank, suffix }` options; their defaults are today's ids and names, so LOCAL is unchanged.
  - A layer at amp 0 at the boundary: freed and replaced at once, nothing to hear.
  - A layer sounding (a drone held across a bridge): new at amp 0, then both `/n_set` (the amps already
    glide over 2 s), old `/n_free` 3 s later.
  - The room: same, on its existing `gain` (a 2 s Lag), the new one added before the master (`2, 4100`).
  - Order stays as the skill's table: layers at the head, ring 4000, room before the master, master last.
  - Old defs `/d_free`d after their nodes go. The next swap goes back to the first bank.
- **Master**: two masters side by side would sum on 0 to 1, so `master.mjs`'s program gains one control,
  `\xf.kr(1, 3)` on both outputs (a one-time change, shipped by the normal deploy). New master added after
  the old (`3, 4100`) at `xf 0`, then a crossfade of at least `SLOW` (6 s). Reason: its leveller starts cold.
- **Ring**: refused loaded. Reason: a new ring node starts with an empty grain buffer.

### Versioning and rollback

- The Caster stores `loaded = { sha, files, at, image }` and the last 3 shas. Its status shows `loaded <sha>`
  or `image`.
- Every boot and every twin handoff passes `loaded` in the `/play` body, so a death, a refresh or a
  handover resumes on the pushed code, not on the image's.
- **An image deploy clears `loaded`.** Reason: the image is built from the same working tree, later.
- Rollback: `{"cmd":"load","sha":"<earlier>"}` or `"sha":"image"`, the same boundary swap.
- **Crash guard**: an exception in the driver within 120 s of a swap reverts to the previous version in
  place and reports `refused: reverted`. A container death within 120 s of a swap makes the Caster drop
  `loaded` before it restarts. Reason: without it, a bad bundle restores itself into a crash loop.

### What stays on the twin handover

- Everything in (c) that touches the container: `live.mjs`, `grains.mjs`, `server.mjs`, `mixer.mjs`,
  `decode.mjs`, `encode.mjs`, the Dockerfile, a new UGen (a new scsynth or plugin), the ring's
  `PROGRAM`, the compiler, a new bus or a node outside the two banks, a change to the chain.
- **The trigger moves from the Worker version to an image hash**: `deploy.mjs` hashes
  `workers/cast/container/` after its copies and passes it as a var (`IMAGE`); the container reports the
  same hash at boot; the alarm compares the two. A boot with no hash keeps today's version compare.
  Then a Caster only deploy is a Worker deploy with no handover.

## 4. The rule of thumb

| change | ships by | heard after | listeners dropped |
| --- | --- | --- | --- |
| a SuperCollider program: `layers.mjs` PROGRAMS or ROOM, `master.mjs` | load (`load.mjs`) | the rest of the scene, or about 15 s with `step` | no |
| the composer: `life.mjs`, `layers.mjs` numbers, `soften.mjs`, `crossfade.mjs`, `hand.mjs` | load | the next scene, or about 15 s with `step` | no |
| the Caster: `worker.mjs` only | cast deploy (no handover after step 5) | 4 to 6 min (the object takes new code late) | Väin no (the source is the container); preview to be measured (its ears live in the object) |
| the container: driver, chain, server, image, a new UGen, the ring, the compiler | cast deploy, twin handover | 5 to 7 min | Väin yes: their mount takes one source and players do not reconnect; preview spliced |
| the page: `index.html`, `local.mjs` | site deploy | about a minute | no |

A cast deploy while a Väin mount is on air is still asked for first. A load is not a deploy and
needs no ask beyond the owner's go for that change.

## 5. Risks, measurements, step order

### Risks

- **The key now runs code in the container**, which holds `VAIN_SOURCE_PW`. Same trust as today's
  deploy credentials, but `CAST_KEY` was only a play and stop key.
- A swap is a joint in the sound: two engines for 3 s, a master crossfade of 6 s.
- A loaded bundle and the image drift apart (a bundle pushed to a container whose `live.mjs` predates a
  helper). Validation step 1 catches a missing name, not a changed meaning.
- LOCAL and the stations can now differ for hours without a deploy. `status` shows the sha; `load.mjs`
  prints whether the working tree matches it.

### What to measure, on preview, in a capped start the owner makes

| what | how | pass |
| --- | --- | --- |
| a click at the swap | record across 5 swaps, `ebur128=peak=true` and momentary loudness at each swap second | peak under -1 dBFS, momentary step under 3 LU |
| the master's cold start | the same recording, a master only bundle | no step over 3 LU |
| CPU while two engines run | `status` xruns and core share over 5 swaps (39 % today) | 0 xruns |
| push to heard | `load.mjs` timestamp to the status line `applied` | under 20 s with `step` |
| leaks | scsynth `/status` synth and def counts after 20 swaps | equal to before |
| rollback | push, roll back, push the same sha | three swaps, the same checks |
| a Caster only deploy (step 5) | an ear on `/listen/preview` across a Worker deploy | stays connected (unknown today) |

### Step order (each step leaves the current deploy path working)

1. **Seam, no behaviour change**: `live.mjs` through `M`; the per scene glue (scene context, level, ghost
   pick) into `life.mjs` and `layers.mjs`; `createLayerEngine` `{ bank, suffix }` with today's defaults;
   `master.mjs` `xf` control at 1. Node tests as section 10 of the skill; `local-test.mjs` must stay green.
2. **Container `/code` route**: write, import, validate, swap at the boundary, crash guard. A new
   `workers/cast/load-test.mjs` on a fake scsynth, with negative controls (a missing export, an unknown
   UGen, a throwing `life.scene`, a bad bundle after a swap). `handover-test.mjs` still green.
3. **Caster `code` command**: storage, the 3 shas, `loaded` in boot and handoff, cleared by an image deploy.
4. Steps 1 to 3 ship together by the normal `node workers/cast/deploy.mjs`, one twin handover, asked
   for when no Väin mount is on air. With no `code` command sent, the station plays as before.
5. **`workers/cast/load.mjs`**, then the measurements above on preview. Väin mounts only after they pass.
6. **The image hash trigger**, a separate deploy, after 5 has passed.
7. The skill's section 6 and this table into `positron-cast`; the story into `lessons/workers-cast.md`.

### Not settled

- Whether a Worker deploy cuts a preview ear (the ears are in the Caster). Measure in step 6.
- Whether two masters for 6 s are inaudible on a phone. Measure in step 5; if not, swap the master
  only on `step` during a blend.
- The cost is engineering time only: no extra container, no extra minutes on air.
