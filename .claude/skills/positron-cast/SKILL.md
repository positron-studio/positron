---
name: positron-cast
description: The Väin radio cast, both engines (the cast worker's Caster and container at cast.positron.studio, and LOCAL in the browser on /radio/cast/), the shared planner life.mjs and layers.mjs, the six stations, the owner's sound rules in their own words, cast deploys while a Väin mount is on air, the cast's node tests, and measuring loudness. Load before changing anything under demo/radio/cast/ or workers/cast/, before judging or describing how the cast sounds, and before a cast deploy.
metadata:
  internal: true
---

# The cast

Rules, facts and steps, one or two lines each. The stories are in
`lessons/workers-cast.md` (a heading per decision) and `lessons/kit-sclang-lite.md`.
Constants move daily: **grep the code before quoting one.** The code wins over
this file and over the lessons.

## 1. Where things are

**One sound, two engines, one planner.**

- **Container engine (on air):** `workers/cast/worker.mjs`, one `Caster` Durable
  Object per station, one container each, `CAST_INSTANCE = { vcpu: 1, memoryMib:
  3072, diskMb: 2048 }`. Inside: `container/server.mjs` (routes), `live.mjs`
  (the live driver), `grains.mjs` (the JACK chain), `mixer.mjs` (the tuner, a
  sample by sample port of `createTunerGraph`), `decode.mjs`, `encode.mjs`.
  Debian image: node 22, ffmpeg 5.1.9, scsynth 3.13.0, jackd2, jack-stdio, icecast2 2.4.4.
- **LOCAL (browser, free, nothing on air):** `demo/radio/cast/local.mjs` plus the
  page `demo/radio/cast/index.html`: `createTunerGraph`, the container's drift
  clock line for line, the ring on wasm scsynth.
- **Shared, run unchanged by both:** `life.mjs` (planner), `layers.mjs`,
  `master.mjs`, `soften.mjs`, `crossfade.mjs` in `demo/radio/cast/`, plus
  `grain-ring.mjs`, `sclang-lite.mjs`, `synthdef.mjs`, `scsynth.mjs`, `hand.mjs`.
  The list is `workers/cast/sc-files.mjs` (`SC_FILES`); the container reads copies
  under `workers/cast/container/sc/<same path>`. `deploy.mjs` copies them (and
  `demo/shell/tuner-mix.mjs` to `container/tuner-mix.mjs`); `grains-test.mjs`
  goes red when a copy differs. So a `demo/` change reaches LOCAL at once and
  the stations only after a cast deploy.
- **Page:** https://positron.studio/radio/cast/ (`?key=<CAST_KEY>` once; no
  start or stop without the key). Local: http://127.0.0.1:8890/radio/cast/ from
  `node demo/server.mjs`, the working tree, where the owner listens to LOCAL.
- **Stations:** `preview` (our Icecast 2.4.4 inside its own container, heard at
  https://cast.positron.studio/listen/preview while on air, 503 otherwise) and
  Väin's `radio1965` (ours by Raul's permission, never records) and `user1` to
  `user4`, on `live.uuu.ee:8001`. Status: `curl https://cast.positron.studio/status/<station>`.
- **Cost:** about $1.33 a day per station on air, $9.34 a week
  (`plans/plan-cast-cheaper.md`). Cheaper paths (pre-render plus a `lite`
  playout) are planned, not built.
- **Cap:** every start stops 7 days on (`CAP_MS`, all stations).
  `node workers/cast/extend.mjs <station> <hours>` moves an on-air stop (15 min
  to 14 days, `CAP_MAX`; reads `CAST_KEY` from `.env`). The page has no extend.
- **Plans:** `plan-cast-patches-scenes.md` (grammar 2), `plan-cast-variety.md`
  (repeats, effect ideas, bass), `plan-cast-cheaper.md`,
  `plan-cast-reinterpret.md` (the layers), `plan-cast-listenable.md` (the master).

## 2. The container engine, end to end

### The chain (`grains.mjs`, `#grains`, `#live-container`)

```
ffmpeg decoder per slot, plus one for the ghost (f32le 44.1 kHz, UPMIX)
  -> node: tuner mix (mixer.mjs), file level, soften
  -> s16le, 4 channels: mix on 1-2, ghost on 3-4
  -> jack-stdin -b 16 -S RING_SAMPLES -> SuperCollider:in_1..4
  -> scsynth -u 57110 -i 4 -o 2
  -> SuperCollider:out_1,2 -> jack-stdout -b 16 -> node (meter, key, onsets)
  -> ffmpeg libmp3lame 128 kbit/s, -flush_packets 1 -> MP3 framer -> Icecast source
```

- Every process is a client of `jackd --no-realtime -d dummy -r 44100 -p PERIOD`
  (`PERIOD` 8192, 186 ms). JACK is the clock: node writes as fast as the pipe
  drains, at most 3 s ahead of the wall. A scene's time is the mix clock
  (`engine.seconds`), not the wall.
- The decoder reads f32 because a hot master at unity passes full scale. Both
  pipe ends are **s16**: anything past full scale is cut flat, and a clip inside
  scsynth cannot be undone in node. Limits belong in the SuperCollider programs.
- `UPMIX = 'pan=stereo|FL=FL+FC|FR=FR+FC'`: ffmpeg's own `-ac 2` puts a mono
  file 3 dB down per channel (`#level`).

### Nodes and busses in scsynth (`layers.mjs`, `master.mjs`, `grains.mjs`)

Busses: 0-1 output, 2-5 inputs (`-i 4`), 6 up private.

| node | def | added | reads | writes |
| --- | --- | --- | --- | --- |
| 5101 to 5105 | `ldrone`, `lfreeze`, `lres`, `lharm`, `lghost` | head of group 0, amp 0 | tuner 2-3, ghost 4-5 | drones `DRONE_BUS` 10-11, `lres` and `lharm` `LAYER_BUS` 8-9, `lghost` `MASTER_BUS` 12-13 |
| 4000 | `gring` (the ring) | tail of group 0 | `inbus` 2: `Mix(In.ar(2, 2)) * 0.5` | 12-13 |
| 5199 | `lroom` (FreeVerb2, Limiter at `ceil` 0.4, 0.25 while a ghost visits) | before 4100 | 8-11 | 12-13 |
| 4100 | `lmaster` (leveller, squeeze, Limiter at 0.85) | after 4000 | 12-13 | 0-1 |

- Order: 5105 5104 5103 5102 5101, 4000, 5199, 4100.
- A ring patch is `/n_set 4000`; a patch by name also sends `land()` (`sync` 1
  then 0). Layer moves are `/n_set` on their node.
- The ring's `PROGRAM` is shared by five pages: the container compiles it with
  `bus: MASTER_BUS` and never edits the text.
- **LOCAL is wired differently:** the page creates the layers with no `to` and
  no `before`, so the ring, room and ghost write bus 0, the room sits at the
  tail, and the master is the `cast-master` AudioWorklet (`createMaster`, the
  same arithmetic) before a DynamicsCompressor as the limiter. LOCAL boots
  wasm scsynth with `inputChannels: 4` too.
- LOCAL's `inputPairs` splits with a `discrete` ChannelSplitter: both feeds are
  forced to 2 channels `explicit` `speakers`, or a mono file lands left only and
  the ring drops 6 dB (`#ghost-input`).

### The lead between node and scsynth (`#live-container`, `#handover`)

- node is ahead of what scsynth hears by the pipes plus jack-stdin's ring:
  0.43 to 0.72 s (2026-10-18). A ring patch applies when sent, so the hand's
  moves land that much early (left as it is); onsets wait it out.
- jack-stdin's `-S` is **frames per channel**: `RING_SAMPLES` = max(8192,
  4 x PERIOD) = 32768 frames, 0.743 s, kept full while node leads. What it has
  read leads the wall by 0.70 to 0.74 s (`grains.mjs`; the lesson says 0.67 to 0.72).
- `heard()` = jack-stdin's `rchar` in `/proc/<pid>/io` less its ring.
  `clockHeard()` = the best of the last 6 s (heard is often low, never high).

## 3. sclang-lite, the language of the layers and the master

`demo/shell/sclang-lite.mjs` compiles one function literal to SynthDef bytes,
in node in the container and in the tab for LOCAL. It is not sclang (`kit-sclang-lite.md#header`).

- `{ |args| var ...; ...; lastLine }`. The **last line is the output**:
  `compile(src, { name, bus })` wraps it in `Out.ar(bus, ...)`. Writing `Out` is
  refused. One channel plays both sides, two are left and right, three refused.
- **Operators are left to right with no precedence**, as in sclang: `1 + 2 * 3`
  is 9. Parenthesise every mixed expression.
- Controls are `\name.kr(value, lag)`; that is what `/n_set` moves. No array
  controls (a chord is `f0` to `f11`), no Lag3 (`glide()` is three Lags).
- Refused: `if`, strings, `~env`, nested functions, `Out`, `SynthDef`, `#[...]`,
  Klank (`Mix(Ringz.ar(in, [f...], decay))` is the same bank), FFT and `PV_`, an
  unknown keyword. Over 64 audio wires alive at once is refused (`WIRE_CEILING`).
- UGens today (`Object.keys(UGENS)`, 36): SinOsc Saw Pulse LFSaw LFTri LFNoise1
  LFNoise2 WhiteNoise VarSaw LPF HPF RLPF BPF Ringz Lag LeakDC Pan2 EnvGen
  Impulse Dust TRand Phasor BufFrames BufDur In BufWr GrainBuf SendReply DelayC
  CombC CombL LocalIn LocalOut FreeVerb FreeVerb2 PitchShift Limiter. Plus
  `Mix`, `Env`, `.range`, `.exprange`.

### Adding a UGen (`kit-sclang-lite.md#ugens-layers`)

1. Read its class file at SuperCollider tag **`Version-3.13.0`** (the
   container's scsynth), not develop: argument names, defaults, rates, `madd`,
   the first-input rate check. Files move between tags (`Delays.sc`, not `Delay.sc`).
2. Check the server's input order in the plugin source at the same tag (for
   example `PitchShift_Ctor` reads windowSize at 1, pitchRatio at 2), and
   `grep CantAlias` for `noAlias`.
3. Add the row to `UGENS` (fields `rates`, `chans`, `inline`, `order`, `argsKr`,
   `first`, as the neighbours use them).
4. Check the wasm build has it: `strings scsynth-nrt.wasm | grep <Name>`. A
   missing class answers `/fail /d_recv UGen '<Name>' not installed.`
5. Grade it by sound in both engines: `node demo/shell/sclang-layers-test.mjs`
   (Chrome and the grains image), with negative controls (swapped arguments,
   wrong rate, the program without the block).

## 4. A station on Cloudflare

### The Caster (`worker.mjs`)

- Storage holds `want` (seed, `until`, `votesAt`), `progress`, `deaths`, `boot`,
  the stored `program`. The alarm runs every 30 s. A Durable Object cannot hold
  a broadcast; the container does.
- Boot: 20 s to listen, else destroy, 2 s, retry, 3 tries (`#boot-retry`).
- A death resumes from `progress` with the same seed (the life restarts from
  scene 0). Progress is saved every 30 s.
- An empty program starts as the whole archive shuffled by the votes
  (`PICK = Infinity`). The container gets the newest 2000 votes.
- `/control/<station>?key=` commands: `play` (cuts; with `ids` also stores them
  as the program; `capMs` 60 s to 14 days, only here), `queue` / `program`,
  `next`, `stop`, `extend {ms}`, `step {by: 1 | -1}`. `mode`, `set`, `patch` are
  refused. A refusal comes back as a `refused:` status line.
- During a handover, `step`, `next`, `kill`, `program`, `play`, `queue` answer
  `handing over to the new code: try again in a few seconds`.

### The source and Väin's mounts

- The source speaks what Väin's app sends: `PUT /<mount> HTTP/1.0`, Basic
  `source:<pw>` (`VAIN_SOURCE_PW` secret), `ice-audio-info:
  send_notification=0;save_stream=0`, on air at ` 200`.
- **Their mount takes one source.** When ours changes, their listeners'
  connections end and no player reconnects.
- A play on a channel carrying their own `livestream` event is refused (`Väin is
  streaming here: <title>`) before a container starts (`#live`, `/live`
  cached 15 s). A stale event reads as theirs until they unpublish it.

### preview and /listen

- preview's Icecast runs in its own container on `:8000/preview`, as the
  `icecast` user, restarted 1 s after an exit. It must be 2.4.4, Väin's version.
- `/listen/preview` is answered by the preview Caster: each listener is an ear
  (`createEar`, `splice.mjs`) forwarding whole MP3 frames. Not running is a 503,
  and a listener never starts a container.
- The edge holds a streamed **request** body until it ends (a live PUT through
  the zone arrives as 0 bytes); a streamed **response** is not held (`#rx-websocket`).
- On WebKit the page opens a second fetch of our stream for the wave
  (`#ios-scope`): one listener counts twice. Never for somebody else's mount.

### The file pass, `GET /file/<id>` (`#file`)

- One archive file with CORS, for LOCAL and `measure-gains.mjs`. The id is
  resolved through the feed (an allowlist); unknown ids 404; a feed URL with a
  port is refused, so it never reaches their Icecast on 8001.
- Edge cached a year (`caches.default` answers `Range` with 206); a miss
  fetches once and answers 200 even to a Range. Never fetch from Väin's host.

### The feed and `Caster.freshTick` (`#fresh`)

- Feed: `https://live.uuu.ee/radio1965/api/events?status=new&status=shelved`,
  types `audio` and `streamrecording`, hosts eccm.ee and uuu.ee, edge cached
  30 s (`FEED_S`). Read only when a page or command asks, or by `freshTick` on air.
- On air every 30 s (`FRESH_EVERY_MS`). The first look of a session is the
  baseline. New ids play next, newest first by `at`; gone ids leave the queue
  and the program; the file playing is never cut.
- After `QUIET_MS` (1 h) with nothing new, the newest arrival of `RECENT_MS`
  (12 h) comes round, then every `REVISIT_MS` (30 min). Tests are not filtered.
- LOCAL does not read the feed while it plays (asked, not built).

### The handover (`#handover`, `#refresh-on-deploy`)

- A Durable Object has one container, so a station has two slots: its own (`a`)
  and the twin Caster `<station>~b` (`b`), which only hosts one. `~` is not in
  NAME, so the twin is not routable from outside. `active` names the slot on air.
- Trigger: the alarm sees the boot's worker version (`CF_VERSION_METADATA.id`)
  differ from the running one. Nothing that was off is started.
- Dwell: start only with 25 s of the scene's dwell left (`HANDOVER_SAFE_S`; a
  twin cannot rebuild a blend), go on only with 10 s left once the twin is up
  (`HANDOVER_MIN_S`), look again every 3 s. Three failures fall back to a
  refresh (restart from the last sweep: the stream ends, about 7.5 s of nothing,
  up to 30 s replayed).
- The twin gets `handoff` (file, second, dwell seconds, scene index, `hist` of
  each scene's kind and heard key, `inst`), the seed, and the votes before
  `votesAt`. **`sameScene: false`** means the twin's scene def differs from the
  station's: expected after a deploy that changed `life.mjs`.
- preview: every ear splices to the twin on a frame boundary, dropping the twin's
  burst. Väin: the twin is held (`hold`), the old source stops, `/go` connects
  retrying every 100 ms for 5 s.
- Measured on Cloudflare (session 83): aligned 1 to 5 ms, twin boots 14 to 84 s,
  Väin's mount taken in 106 to 300 ms. Budget 5 to 7 minutes from a deploy to a
  change being heard. Nobody has listened to a handover.

## 5. The owner's sound rules

Later rules replace earlier ones; the replaced numbers are kept so nobody re-adds them.

- **No naked speech** (2026-10-18): *"I am sating i do jot want naked speech"*.
  Grammar 2 plays no naked scene.
- **Speech as an instrument** (2026-10-18): *"i asked to use speech as instrument"*.
- **Dynamic, wet** (2026-10-18 and 19): dry briefly to identify the original,
  then deep; *"use full wet dry range for composition but minimal time in dry"*,
  *"prefer more wetter"*.
- **No transposed voices, either way** (2026-10-19): *"duck or Darth Vader
  voices, which are insulting for the audience and the participants"*. A
  person's recording plays at pitch 1: `MAX_PITCH` 1, patches pitched under 1
  play at 1, `MAX_DROP` 0.06, `GHOST_SHIFTS [1]`, `lfreeze` unshifted, the
  harmonizer on `music` files only and voiced under the voice, no `tapestop`.
- **No high pitch** (2026-10-18): *"annoying hipitch"*.
- **No stutter** (2026-10-19): *"stuttering is not nice"*. No rhythmic or glitch
  families, no rhythm scenes, no pulse.
- **Not metallic** (2026-10-19): *"very mettallic"*. No resonators in grammar 2;
  harmonizer smeared and low-passed.
- **Not muddy** (2026-10-19): *"sounds are now muddy"*. Grains under pitch 0.74
  (`LOW_PITCH`) only in deep, breath and coda scenes; elsewhere tone at least
  1.8 kHz, dark at least 1.2 kHz.
- **Wet amount** (2026-10-19): *"on 0.4 its more toreable"* gave `WET_CAP` 0.8
  and `LAYER_SCALE` 0.8; the listenable plan raised `WET_CAP` to 0.95. At the wet
  end a push lifts the layers toward 0.75, no boost.
- **Drones are a trick** (2026-10-18 and 19): *"drones are fine but should be
  only trcik"*, *"tiring drone"*. 30 % of sections (`DRONE_SHARE`), `DRONE_TRIM`
  0.7, half following the scene level; pitch moves glide.
- **Effects carry, then breathe out** (2026-10-19): floor `CARRY` 0.2 (0.45 tired).
- **No silence, no volume fades** (2026-10-18): *"fade out and in volume: better
  not"*, *"sound cuts off when files change"*. Every bridge cross-fades; no `pause`.
- **No clipping** (2026-10-19): *"too loud, clips"*. Room ceiling 0.4 (0.25 during
  a ghost), ghost 0.3, the master's limit 0.85.
- **Ghosts** (2026-10-18 and 19): *"can not hear ghost"*, *"they come and go too
  harsly"*. Own path past the room (the room ducks), band-pass colour only, start
  in the middle half of the visiting file, stay 16 to 30 s, S-curve fades of
  about 7 s, more visits on longer files.
- **Transitions** (2026-10-18): *"channel changig still too winds noise,
  cartoonish"*. Dial hiss rare; dissolve, filter and bridges instead.
- **No siren** (2026-10-18 and 19): *"annoying policecar like siren (transition). hate that"*, *"nervous siren not good"*. No pitch sweep in a transition or a drone; the likely source was the drone's wandering saw.
- **The page: fewer controls** (2026-10-17 and 18): *"so many controls. i am actually lost"*, *"box hidden: just rm box"*. Lost means cut a control, never add a switch; hidden means removed. Plain badges (`positron`, `Väin`, `off`), every station the same controls (*"All channels are equal"*).
- **Clicky files** (2026-10-18): Kalle, Kalle 2, Driving along play only drone,
  choir and spectral patches (`soft`).
- **Tests downplayed** (2026-10-19): *"downplay tests"*: `TEST_DWELL` 25 s.
- **Judge it where it is heard** (2026-10-19, the commute listen in
  `plans/plan-cast-listenable.md`): a phone, ambient noise, 20 minutes, not a
  desk A/B. Before tuning one more complaint down, ask what it does to the whole:
  one-complaint fixes at the desk made the mix timid and quiet.

### What the listenable plan set (2026-10-19)

- **Master on the sum**, both engines (`master.mjs`): 6 s leveller toward
  `TARGET` 0.16 RMS, gain up to `GMAX` 16, soft knee over 0.15 s (`KNEE` 0.28),
  peak limit 0.85. Target -16 LUFS integrated, LRA under 8 LU. Files are still
  levelled to -23 LUFS before the tuner, for headroom.
- **No echo repeats:** `ECHOEY` patches out, `ECHO_CAP` 0.35, the hand never
  moves echo, no `echowash`; `FRESH2` 3.
- **Contrast:** each scene opens dry for `DRY_S` 8 to 20 s, then at most one of
  drone, harmonizer, ghost over the granulator.
- **Visits by kind:** `KIND_DWELL` music 1.6x, field and speech 0.7x.

## 6. Deploying the cast

- `node workers/cast/deploy.mjs`: unsets the API tokens, uses wrangler 4.148
  from `rig/containers-next`, copies `SC_FILES` and `tuner-mix.mjs` in. A change
  to `index.html` or `local.mjs` needs the site deploy (`workers/view`) instead.
- **A cast deploy while a Väin mount (radio1965, user1..4) is on air stops every
  listener. Ask first**, and batch fixes.
- **The owner starts casts.** *"Stop defaul casting let me do it"*. An agent
  stops anything it started and reads all six before handing over:

```sh
for s in preview radio1965 user1 user2 user3 user4; do curl -s https://cast.positron.studio/status/$s | head -c 200; echo; done
```

  Each reads `playing:false` unless the owner started it.
- A deploy is asked for in words. The owner listens on LOCAL first.

## 7. Traps, measured

- **Half a vCPU is too little** (session 83): radio1965 fell 10 to 34 s behind
  with 11 xruns; at 1 vCPU lag -1.2 s, 0 xruns, 39 % of a core. OrbStack reads 25 %
  for the same work, unexplained. (The comment above `CAST_INSTANCE` still says
  half a vCPU; the constant is 1.)
- **`PERIOD` 8192** (2026-10-18, `--cpus 0.5`): 2048 gave 12 to 16 xruns in 3 s,
  4096 gave 2 to 10 at each file arrival, 8192 gave 0.
- **Durable Objects take new code 4 to 6 minutes late** (`#queue`, `#cap`): a
  start 22 s and 56 s after a deploy ran the old code, one at 6 min the new. A
  container started by an old object keeps the old image. Check minutes later.
- **A stopped command may already have run** (session 84): a commit or an edit
  landed before the stop. Read `git log` and grep the file before redoing it.
- **jack-stdin's `-S` is frames, not samples**: taking it as 0.186 s put the
  twin 230 to 300 ms early. jack-stdin also reads nothing for about 0.9 s after
  the first write.
- **One `/status` call stalled node's write loop 350 ms.** Poll lightly.
- **`performance` is undeclared in an AudioWorklet** and `?.` does not cover an
  undeclared name: a tap died silently on its first quantum (`#local`). Check
  that a check can fail.
- **A diagnosis needs a check before it ships** (session 84): the siren was
  blamed on the hand loop; life-test's one-movement check disproved it.
- **The whistle:** `WHISTLE = true` with `WHISTLE_SOFT` (level 0.02, max 600 Hz)
  in `mixer.mjs` and `local.mjs`. `lessons/workers-cast.md#whistle` still says
  `false`; the code wins.
- **A feed file can be empty**: *Väin on user1* came back from `/file/` as 200
  with 0 bytes (2026-10-18).

## 8. Tests

All node, no network, from the repo root. Last counts and the session:

| file | covers | last |
| --- | --- | --- |
| `demo/radio/cast/life-test.mjs` | the planner, grammar 2 rules, votes; `life-g1.json` keeps grammar 1 bit for bit | 101/101 (84) |
| `demo/radio/cast/layers-test.mjs` | chords, drone, harmonizer, ghost gaps; `--browser` needs Chrome | 16/16 (84), `--browser` 20/20 (83) |
| `workers/cast/live-test.mjs` | the live driver; `--browser`, `--live` need Chrome or the grains image | 27/27 (84) |
| `workers/cast/local-test.mjs` | LOCAL holds the container's numbers | 26/26 (84) |
| `workers/cast/fresh-test.mjs` | `Caster.freshTick` on a fake feed and clock | 10/10 (84) |
| `workers/cast/listeners-test.mjs` | listener count, Analytics Engine points, GET /listens on a stand-in SQL binding, no read off air | 49/49 (2026-10-22) |
| `workers/cast/mixer-test.mjs` | the tuner port against `createTunerGraph` | 54/54 (83) |
| `workers/cast/grains-test.mjs` | stage 2's pure parts, `container/sc/` copies match `demo/`; `--live` in the image | 25/25 (83) |
| `workers/cast/handover-test.mjs` | the handover against fake containers | 29/29 (83) |
| `workers/cast/mp3-test.mjs` | the MP3 framer against ffprobe | 10/10 (80) |
| `workers/cast/handover-docker.mjs` | the real Caster on real containers (Docker or OrbStack) | not counted |
| `demo/shell/sclang-lite-test.mjs`, `sclang-layers-test.mjs` | the compiler; UGens by sound (Chrome) | not counted here |
| page selfcheck | `/radio/cast/?selfcheck=1` through `demo/verify.mjs` (Chrome) | 36/36 (84) |

## 9. Measuring loudness

- **Per file:** `node workers/cast/measure-gains.mjs [--all]` measures each new
  feed file once through `/file/<id>` (mono `0.5*FL+0.5*FR`, ebur128), tags its
  kind (`kind.mjs`) and rewrites `workers/cast/gains.mjs` (`TARGET` -23, clamp
  `GAIN_DB` [-14, 12]). Hand edit only `soften`.
- **The output:** on preview only, never by connecting to a Väin mount (a
  listener in somebody else's statistics). Start preview only when the owner
  asked for the measurement, with a capped start that ends itself.

A command on the keyed socket (`castcmd.mjs` in the scratchpad, run from the repo root):

```js
// node castcmd.mjs <station> '<json command>': sends one command on the keyed control socket, prints the last lines
import { readFileSync } from 'node:fs';
const [target, cmd] = process.argv.slice(2);
const key = readFileSync('.env', 'utf8').match(/^CAST_KEY=(.*)$/m)[1].trim();
const ws = new WebSocket(`wss://cast.positron.studio/control/${target}?key=${key}`);
let sent = false;
setTimeout(() => process.exit(0), 8000);
ws.onopen = () => { ws.send(cmd); sent = true; };
ws.onmessage = (e) => { const m = JSON.parse(e.data); console.log(JSON.stringify({ playing: m.playing, until: m.until, lines: (m.lines || []).slice(-3) })); };
```

```sh
node castcmd.mjs preview '{"cmd":"play","capMs":1080000}'   # on air, stops itself after 18 min
ffmpeg -hide_banner -loglevel error -y -t 600 -i https://cast.positron.studio/listen/preview -c copy x.mp3
ffmpeg -hide_banner -nostats -i x.mp3 -af ebur128=peak=true -f null - 2>&1 | tail -14
# short-term loudness every 20 s, finds the quiet stretches an integrated number hides
ffmpeg -hide_banner -nostats -i x.mp3 -af ebur128 -f null - 2>&1 | grep -o "t: *[0-9.]* .*S: *-*[0-9.inf]*" | awk '{t=$2; s=$NF; if (int(t)%20==0 && int(t)!=last){last=int(t); printf "%d:%s ", t, s}}'; echo
node castcmd.mjs preview '{"cmd":"stop"}'
```

Read `I:` (target -16 LUFS), `LRA:` (under 8 LU), `Peak:` (under -1 dBFS).
Measured 2026-10-19 on preview, 10 min each:

| master | I (LUFS) | LRA (LU) | peak (dBFS) |
| --- | --- | --- | --- |
| none | -28.6 | 16.1 | -9.1 |
| `GMAX` 5 | -20.5 | 16.1 | -1.6 |
| `GMAX` 16 | -15.1 | 5.2 | -1.8 |

`GMAX` 5 left quiet stretches at -30 to -42 LUFS short-term; quote LRA, not only I.

## 10. Recipe: change the sound safely

1. Read section 5 and grep `plans/` and `BACKLOG.md` for the subject.
2. Pick the file. Planner, patches, wet, dwell: `demo/radio/cast/life.mjs`.
   Layer programs and levels: `layers.mjs`. Loudness: `master.mjs`. Never the
   ring's `PROGRAM` in `grain-ring.mjs` (five pages share it): add a cast patch.
   Container only (`workers/cast/container/`): give it its LOCAL twin in
   `local.mjs` or `index.html`, or `local-test.mjs` goes red.
3. Copy the shared files into the container before testing:
   ```sh
   node -e "import('./workers/cast/sc-files.mjs').then(({SC_FILES})=>{const fs=require('fs'),p=require('path');for(const f of SC_FILES){const t='workers/cast/container/sc/'+f;fs.mkdirSync(p.dirname(t),{recursive:true});fs.copyFileSync('demo/'+f,t)}})"
   ```
4. Run the node tests that touch it:
   ```sh
   node demo/radio/cast/life-test.mjs && node demo/radio/cast/layers-test.mjs && node workers/cast/local-test.mjs && node workers/cast/live-test.mjs && node workers/cast/grains-test.mjs
   ```
   Add `mixer-test.mjs` for the tuner, `fresh-test.mjs` and `handover-test.mjs`
   for `worker.mjs`, `demo/shell/sclang-lite-test.mjs` for the compiler.
5. The owner listens on LOCAL (http://127.0.0.1:8890/radio/cast/). Deploy only when asked.
6. Read all six `/status` (section 6). A Väin mount on air: ask before deploying.
7. `node workers/cast/deploy.mjs`; note the cast version it prints.
8. Wait about 6 minutes before judging or starting anything.
9. Measure if asked (section 9), on preview, capped.
10. Stop what you started; read all six again; report the cast version and the numbers.
