# plan-sc-integration: the new SuperCollider blocks and sound detection in the rest of the demos

Written 2026-10-18. Asked: *"make a plan how to integrate this new work on sc / sound detection to rest or our demos"*.

Tags: **MEASURED** (run, with where and when), **READ** (in a file here, named), **INFERRED** (reasoned, not run).
Nothing in this file is built. Nothing was heard. One test was run for it (`node rig/board/test.mjs`, node only, no
device) and one node script counted blocks in the cast's layer programs; no browser, no external server.

⚠️ **The cast's layer engine is being written right now by another agent and is not committed**: `PROGRAMS`,
`ROOM`, `compileLayers` and `createLayerEngine` in `demo/radio/cast/layers.mjs`, the ghost player in
`demo/radio/cast/local.mjs`, `inputChannels` in `demo/granulator/grain-ring.mjs` (READ, `git diff` at the time of
writing). Every extraction below starts from that file once it lands, never from a second copy written alongside it.

## 0. Verdict

Do these first, in this order:

1. **Fix `waitFor` in `demo/shell/scsynth.mjs` (S).** Every scsynth page inherits it. Once the reply list reaches
   400 entries it shifts, the mark stops moving, and every later `sendAndWait` times out (READ, lines 84 and
   135 to 143). `/n_go` is not consumed by `collide-voice.mjs`'s `heard` (READ), so INFERRED: after about 400
   notes on https://positron.studio/code/collide/ an edit no longer loads. The layers make it worse, because
   they are loaded after the ring is already running.
2. **Teach the Pi the twelve classes (S).** `rig/board/test.mjs` is **527/528 today, and the one red is exactly
   this** (MEASURED 2026-10-18, below in section 4). The tab will compile `Ringz` for
   https://positron.studio/remote/collide/ and the board refuses it by class. This is a one-line list change,
   and the test was written to go red until somebody makes it on purpose.
3. **One shared tail on every scsynth graph: a room and a `Limiter` (S to M).** It goes in the kit once, built
   from the cast's `ROOM`. Its first consumer is https://positron.studio/code/collide/, which plays whatever a
   visitor types and has no limiter at all today (READ). The board already works this way (`posCollideOut`,
   section 4), so the tab, the container and the Pi would all end the same way.
4. **Lift `KEY CORE` out of the HTML into `demo/shell/key.mjs` (S to M).** It is the only detector that is still
   inline in a page. Its research tools cut it out of the HTML by its markers (READ), so the extraction has a
   zero-difference test ready-made.
5. **One new concept page for the strongest move: grains through resonators tuned to the detected key (M).**
   `plan-cast-reinterpret.md` §2.4 calls it the strongest single move for weak sources. A page lets it be heard
   and judged away from the on-air cast.

Then the harmonizer, ghosts, kind tags and the voting kit, in the order of section 6. The voting kit
(`evolve.mjs`) is worth doing, but only after the cast's own votes show that the learning works, and only with the
votes store partitioned (section 3.4).

## 1. What landed, and what it costs

| piece | where | state | tag |
| --- | --- | --- | --- |
| Ringz BPF Lag LeakDC CombC CombL FreeVerb FreeVerb2 PitchShift Limiter LFNoise2 VarSaw | `UGENS` in `demo/shell/sclang-lite.mjs` | each one judged by its sound in the wasm scsynth and in native scsynth 3.13; the two engines agree within 2 dB | MEASURED, `lessons/kit-sclang-lite.md#test-layers` |
| Klank | | refused: its Ref-of-arrays argument does not fit the subset. `Mix` of `Ringz` is the same bank | READ, `#ugens-layers` |
| a second stereo input on busses 4 and 5 | `bootScsynth({ inputChannels: 4, input: inputPairs(ctx, [a, b]) })` | 700 Hz on the second pair heard 159 dB over the first pair. Negative control: a default boot leaves it at rms 0 | MEASURED, `lessons/kit-scsynth.md#input-channels` |
| the input pair trap | a mono feed into `inputPairs` lands on the left channel only, so the ring drops 6 dB | both feeds must be set to 2 channels, `explicit`, `speakers` | READ, in-flight `lessons/workers-cast.md#ghost-input` |
| `waitFor` bug | `scsynth.mjs` | open | READ |
| loudness per file | `workers/cast/measure-gains.mjs`, ffmpeg `ebur128` in node, gain to -23 LUFS capped -14 / +12 dB | 13 cast files | READ |
| kind per file | `workers/cast/kind.mjs`: pure JS, its own FFT, mono at 16 kHz | ramps set on 13 files nobody listened to; 8 of 13 read as music | MEASURED there, `lessons/workers-cast.md#kind` |
| key detector | `KEY CORE` block, `demo/radio/key/index.html` lines 503 to 603 | inline in one page | READ |
| tempo detector | `demo/radio/tempo.mjs` | already a module: /radio/tempo/, /radio/live/ (by way of `rig.mjs`), /granulator/beat/ and the research tools import it | READ |
| the life and votes | `demo/radio/cast/life.mjs`, `layers.mjs`, `Votes` in `workers/cast/worker.mjs` | layers are chosen and learned per scene. The engine that sounds them is in flight | READ |
| tuner chain | `demo/shell/tuner-mix.mjs` | shared by /radio/tuner/, /radio/scenery/, the cast (local and container) and /social/radio/ | READ |

**CPU:**

| what | cost | tag |
| --- | --- | --- |
| all five layer kinds at once, browser | about 5 % of the render budget | MEASURED, commit 38d7053c |
| the same, native scsynth on the M2 Pro | 0.73 % of a core | MEASURED, commit 38d7053c |
| 16 Ringz | 0.2 to 0.9 % of the render budget over idle | MEASURED, `lessons/kit-sclang-lite.md` |
| one grain ring, browser, everything on | 23 to 25 % of a core | MEASURED there, quoted in `plans/plan-cast-reinterpret.md` §1 |
| grains on air | 17 %, on a 0.5 vCPU container | MEASURED, `HANDOFF.md` |

**Size of the cast's layer programs** (MEASURED 2026-10-18 with `compileLayers()` and `readSynthDef`, node only):

| def | blocks | bytes | text chars |
| --- | --- | --- | --- |
| ldrone | 25 | 1036 | 298 |
| lfreeze | 13 | 597 | 213 |
| lres (12 Ringz) | 54 | 2235 | 646 |
| lharm | 25 | 1078 | 342 |
| lghost | 47 | 1901 | 524 |
| lroom | 12 | 510 | 137 |
| gring (the grain ring, for scale) | 121 | 4925 | |

## 2. Per page

Pages are at `https://positron.studio/<id>/`. Effort is S (hours), M (a day), L (more). A concept page holds one
idea (`.claude/skills/positron-concepts/SKILL.md`), so a new idea goes on a **new page** that copies its parent and
adds one thing. Only a safety fix or a module swap with no audible change goes into an existing page.

### 2.1 Granulator: /granulator/grains/, /granulator/beat/

| what | gain | effort | risk | measured by |
| --- | --- | --- | --- | --- |
| new page **/granulator/resonators/**: grains plus a Ringz bank at the chord of the key `key.mjs` detects, falling back to a fixed key | the ring stops being only texture and becomes pitched. This is `plan-cast-reinterpret` §2.4 on our own R2 recordings | M | a wrong key sounds out of tune, so the key changes only on a confident reading. A loud transient into a high-Q bank spikes, so a Limiter sits in the def (the cast's `lres` already has one, READ) | the sclang-layers-test judge on the page output (energy at the chord tones over the gaps between them, as the CombC check does); a key reading shown on the page; one listen |
| the shared tail (room and Limiter) on both pages | patch `amp` goes up to 2.0 (Gate) and echo feedback up to 0.75 (READ, `PATCHES`), so a ceiling is cheap insurance | S | the room colours the existing patches, so it starts with mix 0 and only the Limiter is active | peak at the output never above the ceiling, with a deliberately hot patch as the negative control |
| ghost: the second recording on busses 4 and 5, through BPF or comb | two of our recordings at once. Our own bucket, nobody else's server | S once the layer engine is shared | the 6 dB mono trap (section 1) | `In.ar(4, 2)` is non-silent only while the ghost plays |
| leave `PROGRAM` (gring) alone | | | changing it touches five pages and the container's copy; layers go in as separate nodes, as the cast does | |

### 2.2 Radio: /radio/key/, /radio/scenery/, /radio/tuner/, /radio/blend/, /radio/tempo/, /radio/live/, /radio/cast/

| page | what | effort | risk | measured by |
| --- | --- | --- | --- | --- |
| /radio/key/ | swap the inline block for `demo/shell/key.mjs` | S | none, if the readings are identical | `research/tools/tempo-key/our-key.mjs` on the 84 spectra files: zero differences, the method `plans/plan-key-detection.md` §2 already uses |
| new **/radio/harmony/** (copy of /radio/key/) | the live station through `lharm` (PitchShift) at ratios from `harmRatios` in the detected key: the station sings its own chord | M: the page has no scsynth today, so it adds the 1.8 MB engine on a press and about 1 s to the first sound (READ, `BACKLOG.md` sampler row) | PitchShift artefacts on speech; nobody has heard it | the 1.5 pitch ratio check from the layers test (440 Hz to 660.6 Hz, MEASURED there) on a test tone; one listen |
| /radio/scenery/ | `lharm` or `lres` beside the grain ring it already runs | S to M | ⚠️ ghosts may only use the slot the tuner has already opened. A third live mount is one more listener in ERR's audience figures (CLAUDE.md), so it is refused | slot count opened per visit stays what it is today |
| /radio/tuner/, /radio/blend/ | nothing. They are WebAudio with no scsynth, and their idea is the dial or the crossfader | | | |
| /radio/tempo/, /radio/live/ | a kind tag next to the bpm on recordings (section 2.6): no steady beat is expected on speech | S | `kind.mjs`'s ramps are unvalidated | the kind shown matches the 13-file table's behaviour on a `say` control |
| /radio/cast/ | (a) the detected key instead of the chosen one in local mode, with the chosen key as fallback; (b) a confident tempo replaces the imposed one (§2.7 of the cast plan) | M each | the detector was tuned on radio music; it may give no key on speech or field recordings (`plan-cast-reinterpret` §5) | share of scenes with a confident key per file kind; votes |

### 2.3 Code: /code/collide/, /code/wish/, /code/piano/

| page | what | effort | risk | measured by |
| --- | --- | --- | --- | --- |
| /code/collide/ | **the shared tail, now**: a typed program is compiled to the tail bus and the tail limits it | S | the bus moves, so `compile(text, { name, bus })` has to be called the same way here and on /remote/collide/ | a program at 8x full scale leaves at the ceiling. That is the assert /code/wish/ already makes for its WebAudio limiter (READ, `demo/code/wish/index.html` line 262) |
| /code/collide/ | after the `waitFor` fix, an edit loads after 500 notes | S | | 500 note presses, then an edit, then `/done /d_recv` arrives |
| /code/wish/ | the model may now write Ringz, CombC, FreeVerb and the rest (`sclang-wish.mjs` was touched in 38d7053c, READ). Keep its WebAudio limiter until the tail is proven | S | | the wish trial's loud and silent refusals still hold |
| /code/piano/ | a FreeVerb room after the sampler | M | the sampler plays the Pi's own defs (`rig/board/norns/possampler-defs.scd`, READ), so a bus change is a change on the Pi too. Better as a tail node reading the sampler's out pair in the tab only | a reverb tail on a released note; the piano level unchanged at mix 0 |

### 2.4 Drums: /drums/machine/, /drums/knobs/, /drums/samples/, /drums/camera/, /drums/remote/

| what | gain | effort | risk | measured by |
| --- | --- | --- | --- | --- |
| new voices: a Ringz tom tuned to a note, a CombL pluck, a LFNoise2 shaker | tuned drums and plucks from the same 16 steps | M (new page **/drums/tuned/**) | the board's block cap is 64; one Ringz voice is small | each voice's pitch in a spectrum, as the drum tests measure hits |
| a room send | | S | split mode puts each drum on its own output pair and the mix happens in WebAudio (READ, `drum-machine.mjs` lines 99 to 104), so an in-engine tail does not see the sum. The drums already bring the loudest bar down to 0.7 (READ) | |
| /drums/remote/ the same voices on the Pi | | S once section 4's list is in | Pi CPU unmeasured | `sc.stats` cpu avg and peak at 180 bpm, every pad on |

### 2.5 Remote and devices: /remote/collide/, /drums/remote/, /devices/circuit/

Everything a page sends to the board is recompiled there by the same `sclang-lite.mjs` and checked block by block
(`checkDef`, READ). So these pages gain the new blocks the moment section 4's list is in. They need nothing of
their own except the same tail bus as the tab, so the crossfade between tab and Pi compares like with like.

### 2.6 Pages that play archive files

| page | source | what | effort | tag |
| --- | --- | --- | --- | --- |
| /granulator/grains/, /granulator/beat/, /radio/tempo/, /shader/landscape/ | our own R2 recordings (`positron-station/media/`, READ `grain-rig.mjs`) | a `kind` tag per recording, measured once in node with `kind.mjs` and kept in a small table, as `gains.mjs` is | S | INFERRED useful for the tempo pages and for picking patch odds; READ: these pages already level dynamically (raise toward -16 dB RMS per second, at most 36 dB, `grain-rig.mjs`), so an integrated gain would add little and is not proposed |
| /history/newsreels/ | ERR's archive | **refused** offline: measuring means fetching somebody else's server. A kind read live from the tab's own analyser while a person is already listening would open nothing new, but nothing on the page needs it | | |

### 2.7 Shader, typist, synth, video

| page | what | verdict |
| --- | --- | --- |
| /shader/landscape/ | the ring already drives it (READ). The key or kind could choose a LOOK | later, L, needs a visual idea first |
| /typist/machines/ | numbered machines from a seed (`fx.mjs` `character(n)`, READ) are a natural first consumer for the voting kit: vote on machines, and the next machines lean toward the liked ones | after `evolve.mjs`, M |
| /typist/* in scsynth | | refused: WebAudio does the job, and moving it is L with nothing to hear for it |
| /synth/*, /code/plaits/, /code/faust/ | WebAudio, Plaits or Faust, not scsynth | nothing |
| /video/*, /shader/mirror/ | no sound | nothing |

## 3. What moves into the kit first

Each extraction is done **once, by one agent, before any page agent starts** (CLAUDE.md).

### 3.1 `scsynth.mjs`: the `waitFor` fix (S)

- **Touches**: `demo/shell/scsynth.mjs`, plus its container copy, which `workers/cast/deploy.mjs` refreshes (READ, line 16).
- **Fix**: keep an absolute count of replies pushed, and scan from `mark - shifted`, so a trim never strands the
  mark. Or keep only unconsumed replies per waiter.
- **Graded**: a node test with a stub `sonic` that pushes 1000 `/n_go` and then answers a `/d_recv`. It must
  resolve. NEGATIVE CONTROL: today's code times out on the same stub.

### 3.2 `demo/shell/sc-layers.mjs`: the layer defs and the tail (M)

- **From**: the cast's in-flight `PROGRAMS`, `ROOM`, `compileLayers`, `createLayerEngine`, after they are committed.
- **Split**: the defs and a generic engine (node ids, `apply(kv)` per def, `stop`) go to the kit. The cast keeps
  its own mapping from a scene's `layers` to `/n_set` values. `layers.mjs` keeps the pure numbers (CHORDS,
  VOICINGS, `chordHz`, `euclid`), which also move to the kit when a second page imports them.
- **The tail** (`ltail`): `In.ar(TAIL_BUS, 2)`, an optional FreeVerb2 room, `Limiter.ar(..., ceiling, 0.01)`,
  `Out.ar(0, ...)`. Programs compile with `{ bus: TAIL_BUS }`. `bootScsynth({ tail: true })` adds it at the tail of
  the root group.
- **Touches**: `demo/radio/cast/layers.mjs` and `local.mjs` (import the kit), `workers/cast/deploy.mjs`'s copy list
  (the container must carry the new file), and then each page that opts in.
- **Graded**: `demo/radio/cast/layers-test.mjs`, `demo/shell/sclang-layers-test.mjs` (27/27, and 104 with
  `--browser --native`, READ commit 38d7053c), `workers/cast/local-test.mjs` and `grains-test.mjs`, all at their
  counts before the move. A new check: the tail holds a program at 8x full scale under the ceiling. Then
  `node demo/check-html.mjs` and one browser look per page that opts in.
- ⚠️ **To check before choosing `TAIL_BUS`**: how many audio busses SuperSonic gives scsynth. The board uses 64
  (READ). With `inputChannels: 4`, the first private bus in the tab is 6 (READ, `#ugens-layers`).

### 3.3 `demo/shell/key.mjs`: the key detector (S to M)

- **Moves**: lines 503 to 603 verbatim (`KEY_PROFILES`, `keyCreate`, `keyFrame`, `keyRead` and helpers) and a
  `createKeyDetector(ctx, { pull, onReading })` built from the page's `keyBuild`, in the same shape as
  `createTempoDetector`.
- **Touches**: `demo/radio/key/index.html`, `research/tools/tempo-key/our-key.mjs` and `key2/run.mjs`, which both
  slice the HTML between the markers (READ). Keep the `// KEY CORE BEGIN` and `END` markers inside the new file and
  point both tools at it.
- **Graded**: `our-key.mjs` over the 84 spectra files, before against after: zero differences. That is the test
  `plan-key-detection.md` §2 used for every change to this block. Also `demo/radio/key/autoplay-test.mjs`.
- **Then usable in**: the cast's local mode, /granulator/resonators/, /radio/harmony/. In node (the container),
  it would also need an FFT feeding a dB spectrum. `kind.mjs` already has one (READ), so that is M, not L.

### 3.4 `demo/shell/evolve.mjs`: the voting core (M, plus M for the store)

- **Generic in `life.mjs`** (READ): the 1 to 4 vote scale, `tasteOf`'s scores, `kern`, `prefer` over a `FEATURES`
  list with a fixed norm, the weighted pick leaning at most e^`LEAN`, candidates plus variations, "a variation
  never follows a variation", the disliked core exclusion, `fileWeight`.
- **Cast specific, stays**: PATCHES, MOVABLE, IKINDS, LAYERS, ODDS, the hand's plans.
- **Graded**: `demo/radio/cast/life-test.mjs` (42/42, READ commit b0acc37c) unchanged. A new golden check: the
  first 200 scenes as JSON, for three seeds and a fixed vote set, byte-identical before and after.
- **The store**: `Votes` is one Durable Object named `owner`, its POST is behind `CAST_KEY`, and it refuses a def
  without `patch` and `param` strings (READ, `workers/cast/worker.mjs` lines 136 to 138 and 531 to 540). A second
  page needs its own partition: `idFromName('owner:' + topic)` from an **allowlist of topics**, never a prefix
  test. That is the FCM topic lesson in CLAUDE.md. The cast keeps `owner` untouched, so nothing migrates. Each
  topic gets its own def check and id function.
- **When**: after the cast has enough votes to show that a liked feature comes back more often on the real page
  (the life-test shows it on synthetic votes only). How many votes exist today was not read, because that needs
  a GET on the live store.

### 3.5 Not extracted

- `tempo.mjs` stays in `demo/radio/`. It is already a module with four importers, so moving it is a rename only.
- `tuner-mix.mjs` is already shared, and deploy keeps the container's copy in step (READ, `deploy.mjs` lines 13 and 14).

## 4. The Pi

| question | answer | tag |
| --- | --- | --- |
| what the board's scsynth is | `supercollider 1:3.13.0+repack-3` from apt | READ, `rig/board/packages.txt` line 38 |
| does the board compile the new blocks | yes. `scollide.mjs` imports `demo/shell/sclang-lite.mjs` directly, and `push.sh` follows the board's imports | READ, `rig/board/scollide.mjs` lines 11 to 14 |
| does the board play them | **no.** `checkDef` refuses any class not on `ALLOWED_CLASSES`, and the twelve are not on it | READ, lines 76 to 84 |
| does the test know | **yes: `node rig/board/test.mjs` is 527/528, and the red is "every class the compiler can emit is on the hand list"**, missing BPF CombC CombL FreeVerb FreeVerb2 Lag LeakDC Limiter LFNoise2 PitchShift Ringz VarSaw | MEASURED 2026-10-18 on this laptop, no device |
| what to add | all twelve to `ALLOWED_CLASSES`. None writes a buffer, so `SHARED_REFUSED` (BufWr) is unchanged | INFERRED from the class list |
| do they fit the board's caps | `BLOCK_CAP` 64: lres with 12 Ringz is 54 blocks and fits; a 16 Ringz bank would not (INFERRED, about 66). `TEXT_CAP` 4000: the longest layer is 646 chars. `MAX_DEFS` 16: six layer defs fit. The grain ring is 121 blocks and never fitted | MEASURED (counts) and READ (caps) |
| are the twelve in the Pi's scsynth | INFERRED yes: core plugins of 3.13, the same version the input orders were read from (`#ugens-layers`). Not proven on the Pi: the native proof ran in the container image on the laptop | INFERRED |
| CPU budget | the board refuses new hits and notes above `CPU_REFUSE` = 70 % average | READ, `scollide.mjs` |
| CPU of the layers on the Pi | **unmeasured.** 0.73 % of a core on the M2 Pro natively (MEASURED). The README's derived M2 Pro to Pi 4 ratio is about 10x (39.8x against 3 to 4x realtime, "not measured", READ `rig/board/README.md`), so INFERRED about 7 % of a core for all five. The Pi's model is Pi 4 from traces, never read from `/proc/device-tree/model` (READ, `plan-pi-supercollider-defs.md` §unsettled 4) | INFERRED |
| other Pi numbers on file | 8 voices of JS synthesis at 15 % of one core on the A72; a stale scsynth held 33 % of a core | MEASURED there, `rig/board/README.md`, `lessons/rig-board.md` |
| the board's limiter | `posCollideOut`: `Out.ar(0, Limiter.ar(In.ar(64, 2) * 0.5, 0.49, 0.01))`, written by `sclang` on first start, with a 120 s timeout | READ, `rig/board/norns/poscollide-defs.scd`, `scollide.mjs` lines 558 to 575 |
| what the new Limiter allows | the same def compiled by sclang-lite in node, which takes `sclang` out of the collide path. Graded in NRT against the sclang build (same peak held) | INFERRED, M |

**On the Pi, once the list is in** (needs the board on the LAN and the owner's word to push): `sc.load` each layer
def. Then `sc.stats` cpu avg and peak with all five live beside the sampler, xruns before and after, and one
resonated kick back through the capture.

## 5. Refused, and not settled

**Refused:**

| what | why |
| --- | --- |
| Klank | the compiler refuses it; `Mix` of `Ringz` is the same bank (READ) |
| changing `gring` to carry layers | five pages and the container share it, and at 121 blocks it is already over the board's cap. Layers are separate nodes |
| raising `BLOCK_CAP` to run the grain ring on the Pi | the Pi granulates with Pappus. Nothing measured asks for it |
| a third live mount for ghosts on /radio/scenery/ or /radio/blend/ | every connection is a listener in ERR's audience statistics (CLAUDE.md). Ghosts reuse the open slot or nothing |
| offline loudness or kind for /history/newsreels/ | the files are on ERR's server |
| parallel rings on air | doubles the station's CPU and bill (`plan-cast-reinterpret` §2.8) |
| typist in scsynth | WebAudio already does it, and the move is L |
| an integrated gain table for our R2 recordings | the pages already level per second; a static gain would add little |
| any detector or layer that starts on a visit | a visit opens nothing (CLAUDE.md). Everything boots on a press |

**Not settled:**

- **Whether any of it sounds good outside the cast.** Nobody has heard a layer on any page. One listen per new page is the test.
- **The Pi's CPU for the layers.** Section 4.
- **Whether the key detector reads speech and field recordings at all** (`plan-cast-reinterpret` §5). The fallback key is the answer until it is measured per file kind.
- **The `/n_go` claim.** INFERRED from `heard` not consuming it. Confirm with 450 notes and an edit on /code/collide/ before the fix, as its negative control.
- **SuperSonic's audio bus count**, which `TAIL_BUS` depends on.
- **`kind.mjs` on our R2 recordings.** Its ramps were set on 13 files nobody listened to, and it calls speech under a drone music (READ, `#kind`).
- **The vote count**, which decides when `evolve.mjs` is worth extracting.

## 6. Build list

| # | what | effort | graded by | needs |
| --- | --- | --- | --- | --- |
| 1 | `waitFor` fix in `scsynth.mjs` | S | stub test plus its negative control; `sclang-layers-test` 27/27 | nothing |
| 2 | twelve classes on the board's `ALLOWED_CLASSES` | S | `rig/board/test.mjs` 528/528 | nothing (the push and the Pi CPU run need the owner and the LAN) |
| 3 | wait for the cast agent's layer engine to land | | | that agent |
| 4 | `demo/shell/sc-layers.mjs` and the tail, the cast moved onto it, `deploy.mjs`'s list | M | layers-test, sclang-layers-test, local-test, grains-test at their counts; the 8x full scale check | 3 |
| 5 | the tail on /code/collide/ and /remote/collide/ (tab side) | S | the 8x full scale assert; check-html; one look | 4 |
| 6 | `demo/shell/key.mjs`, /radio/key/ and the two research tools re-pointed | S to M | `our-key.mjs` zero differences on 84 files; autoplay-test | nothing |
| 7 | **/granulator/resonators/** | M | chord-tone energy check; key shown; one listen | 4, 6 |
| 8 | the cast's local mode on the detected key, with the chosen key as fallback | M | confident-key share per kind; votes | 6, the cast's owner |
| 9 | **/radio/harmony/** (or `lharm` beside /radio/scenery/'s ring) | M | the 1.5 ratio check; one listen; slot count unchanged | 4, 6 |
| 10 | the Pi: push, `sc.load` every layer, CPU and xruns | S | `sc.stats`, capture | 2, the owner, the LAN |
| 11 | **/drums/tuned/**, then on /drums/remote/ | M | per-voice pitch; Pi CPU at 180 bpm | 2, 4 |
| 12 | kind tags for our R2 recordings, shown on the tempo and granulator pages | S | `say` speech and pink noise controls as in `#kind` | nothing |
| 13 | `demo/shell/evolve.mjs` and the `Votes` topic allowlist; first consumer /typist/machines/ | M + M | life-test 42/42; 200 golden scenes byte-identical | enough cast votes |
| 14 | `posCollideOut` compiled by sclang-lite on the board | M | NRT peak comparison against the sclang build; `rig/board/test.mjs` | 2 |
