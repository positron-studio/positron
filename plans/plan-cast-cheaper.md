# plan-cast-cheaper: a week or more of the Väin cast on radio1965, for less

Asked 2026-10-19: *"in bg calculate cheaper way to do this, does our worker-based-hls solution would work cheaper
we did for eccm? would all our processing work on top of this?"*. "This" is the live cast (`workers/cast/`,
`demo/radio/cast/`) on Väin's `radio1965` Icecast mount for a week or more. Research only: nothing was built,
deployed, started or connected to. No station, mount or Väin server was touched.

Every number is marked **MEASURED** (where), **FROM DOCS** (URL, read 2026-10-19) or **INFERRED**.

## 1. Verdict

- **The eccm HLS station cannot do this job.** It is a delivery layer: a Worker that writes a live playlist of
  byte ranges into MP3 files already in R2. It renders nothing, processes nothing and does not feed an Icecast.
  Väin's listeners connect to Väin's Icecast, which takes exactly one source over a raw HTTP/1.0 PUT, and only a
  process that holds that socket can be on air there. Our processing does not run "on top of" it; it would have
  to run before it, and write audio into R2.
- **Today costs about $1.33 a day, $9.34 a week**, and half of it is memory that the 3 GiB per vCPU floor forces
  on a chain that uses a few hundred MiB. Tuning the container saves at most 10 to 15 per cent.
- **The real lever is pre-rendering.** The whole processing chain is deterministic from its seed and its own
  mix (the key and the onsets are heard from node's tuner output, not from anything outside), so a container can
  render hours of it to MP3 in R2 and a tiny `lite` container (or a Durable Object) can pace those frames into
  Väin's mount. Rendering a unique week on Cloudflare costs about **$7.2 a week** (23 per cent less), because CPU
  is billed on use and a render uses the same CPU as live; only the memory time shrinks. It gets cheap only if
  less unique audio is rendered: **a 24 hour render looped for a week is about $1.5 to $1.8**, and a render on the
  owner's own machine leaves only the playout, **about $0.6 to $0.8 a week**.
- **What a pre-render loses**: the owner's live `step` (next or previous scene) and START/STOP of a new life
  without re-rendering. **Votes are not lost**: today a running station never reads a vote cast after it started
  (only the next start, or a twin, gets them), so a render that is re-made daily follows the votes more often
  than a station left on air for days.
- **Recommendation**: keep today's container for the Üle Heli days (23 to 25 October) where the owner steps and
  listens; for an unattended run of a week or more, build the pre-render plus a `lite` playout (about 3 days of
  work) and decide the loop length (unique hours) with the owner, because that, not the platform, sets the bill.

## 2. The eccm shape, exactly

It is no longer in eccm's tree. It was removed on 2026-10-07 and kept under the git tag **`radio-last`** in
`~/personal/eccm` (`archive/radio.md` says so, and how to restore it). Read from
`git show radio-last:src/station/station.mjs` (1736 lines) and `tools/live.mjs`. It was positron's
`workers/station/worker.mjs`, moved to eccm on 2026-10-02 (`0ada490f` here).

- **Who renders the audio: nobody.** The audio is whole MP3 files uploaded to R2 (`eccm-files-staging`, 17
  programmes) through the `eccm-files` upload Worker in 16 MiB pieces. At ingest the station walks each file in
  ranges and stores a frame index (`index/`), so every segment starts on an MPEG frame boundary. Nothing is ever
  decoded or re-encoded.
- **What the Worker does per request:** `GET` of a channel's playlist asks that channel's `Schedule` Durable
  Object for the running order and its clock, and writes about 600 bytes of HLS media playlist every 11 s: the
  last 60 s (`WINDOW_S`) of `#EXT-X-BYTERANGE:<len>@<off>` entries pointing at `/media/<key>`, always LIVE, never
  VOD, never `#EXT-X-ENDLIST`. A segment request is `env.STATION_MEDIA.get(key, { range })` answered 206 with
  `cache-control: public, max-age=31536000, immutable`, so the edge cache absorbs repeats. No audio is held in the
  Worker; no JavaScript runs in the page while it plays, which is why it survived a locked iPhone.
- **Ahead of time versus live:** a running order has three slot kinds. **file** slots: byte ranges of uploaded
  files (all ahead of time). **relay** slots: one upstream Icecast connection per channel, opened by the
  `Schedule` object only while somebody's playlist reaches the slot, cut into whole-frame pieces held in memory
  (`RELAY_KEEP` 64) and answered as silence when a piece is missing. **live** slots: `tools/live.mjs`, run
  wherever the sound is, cuts an MP3 stream into about 10 s whole-frame chunks and POSTs each to
  `/live/<key>/append`, which puts it in R2 and on the slot's list; a cron sweep deletes heard chunks
  (`KEEP_SEGS` 24, `ORPHAN_MIN_AGE` 60 s).
- **Two Durable Objects**: `Schedule` (one per channel, the running order and its clock) and `Library`
  (programme records). Writes need `STATION_TOKEN`. A `Radio` DO recorded live shows into one MP3 by multipart.
- The rules it paid for are in `.claude/skills/positron-streaming/SKILL.md`, "An HLS station assembled from R2
  byte ranges" (retired section): live playlist only, frame-aligned ranges, media sequence never backwards.

**What follows for the cast:** the eccm station is a way to serve MP3 that already exists to OUR OWN listeners
over HTTPS. To carry the cast it needs the cast's audio in R2 first (a pre-render, or a live producer posting
chunks, which is the container again), and even then it does not reach anybody listening through the Väin app.

## 3. The options, priced

### Rates used (FROM DOCS, read 2026-10-19)

| what | rate | source |
| --- | --- | --- |
| Container memory | $0.0000025 per GiB-s on PROVISIONED; 25 GiB-h a month included | https://developers.cloudflare.com/containers/platform/pricing/ |
| Container CPU | $0.000020 per vCPU-s on ACTIVE use only; 375 vCPU-min a month included | same |
| Container disk | $0.00000007 per GB-s provisioned; 200 GB-h a month included | same |
| Container egress | NA and EU $0.025/GB, 1 TB a month included | same |
| Instance types | lite 1/16 vCPU 256 MiB 2 GB; basic 1/4 1 GiB 4 GB; standard-1 1/2 4 GiB 8 GB; standard-2 1 6 GiB 12 GB; standard-3 2 8 GiB 16 GB; standard-4 4 12 GiB 20 GB | https://developers.cloudflare.com/containers/platform/limits/ (updated 2026-10-12) |
| Custom instance | minimum 1 vCPU, minimum 3 GiB per vCPU, max 4 vCPU, 12 GiB, 20 GB | same, and changelog 2026-09-29-remove-disk-to-memory-ratio |
| `ctx.container.start({ instance })` | accepts `lite`, `standard-1..4` or a custom object; **does not accept `basic`** | https://developers.cloudflare.com/containers/configuration/scheduling-policy/ |
| Durable Object duration | $12.50 per million GB-s at 128 MB, 400,000 GB-s a month included; requests $0.15 per million, 1 M included | https://developers.cloudflare.com/durable-objects/platform/pricing/ |
| R2 | $0.015/GB-month, 10 GB-month free; class A $4.50/M (1 M free), class B $0.36/M (10 M free); egress free | https://developers.cloudflare.com/r2/pricing/ |
| Workers | 10 M requests and 30 M CPU-ms a month included, then $0.30/M and $0.02/M CPU-ms; $5 a month minimum | https://developers.cloudflare.com/workers/platform/pricing/ |

The monthly inclusions are worth about **$0.73 once a month** (25 GiB-h is $0.225, 375 vCPU-min $0.45, 200 GB-h
$0.05) and are shared with every other container on the account (`pub`). The tables below are before them.

### What the cast uses today

- `CAST_INSTANCE = { vcpu: 1, memoryMib: 3072, diskMb: 2048 }` (`workers/cast/worker.mjs:33`).
- CPU: **39 % of one core** on radio1965 on the full vCPU, lag -1.2 s, 0 xruns in 65 s. On half a vCPU it sat at
  43 to 47 % of its 50 %, fell 10 to 34 s behind real time, 11 xruns (MEASURED 2026-10-18, HANDOFF session 83).
- Locally (OrbStack arm64, `--cpus 0.5`, period 8192): container 24.7 to 25.2 % of a core, node 10.8 to 11.0,
  scsynth 4.1, jack-stdout 3.2, jack-stdin 3.1, LAME 2.7, decoders 0.2 (MEASURED 2026-10-18,
  `lessons/workers-cast.md#live-container`). Cloudflare reads about 1.5x higher; why is not settled (a slower
  vCPU, grammar 2's six layer programs, or both).
- Memory: **318 MiB** for the grains chain with the ring wet, 218 dry (jackd and scsynth each about 128 MiB RSS,
  mostly the shared JACK segment) (MEASURED 2026-10-17, `lessons/workers-cast.md#grains`). Live mode's memory has
  not been read on its own; it adds six layer synths and a ghost decoder, so **INFERRED 400 to 700 MiB**. Either
  way 3 GiB is four to ten times what is used.
- The preview Icecast does not run on radio1965: `ICECAST_PW` is passed only for a `local` target
  (`worker.mjs:497`), so there is nothing to strip there.

### a. Today's container, tuned

- **Smaller instance is not on offer.** Below 1 vCPU the runtime takes only `lite` (1/16 vCPU) or `standard-1`
  (1/2 vCPU, 4 GiB: more memory than today and the half vCPU that fell behind). Custom sizes start at 1 vCPU with
  3 GiB. So **1 vCPU / 3 GiB is already the cheapest size that keeps up.**
- **A custom 0.75 vCPU / 2.25 GiB** would save the memory difference if Cloudflare accepted it. The docs say it
  will not (minimum 1 vCPU), yet the cast ran `{ vcpu: 0.5, memoryMib: 1536 }` on Cloudflare on 2026-10-18 and
  `{ vcpu: 0.25, memoryMib: 1024 }` on 2026-10-16 (MEASURED, HANDOFF sessions 81 and 83). So either the runtime
  does not enforce the documented floor or it changed. Headroom: 0.75 against a demand that saturated 0.5 in a
  Smear scene. INFERRED risky; a one hour run would settle it.
- **Less CPU** is the other knob, since CPU is half the bill and billed on use. Where it goes (local split
  above): node's JS DSP about 44 %, the two jack-stdio bridges about 25 %, scsynth 16 %, LAME 11 %. A day of
  profiling (fewer `/proc` reads in `status()`, the mixer's per-sample loops, one jack bridge) might cut 10 to
  20 % of CPU. INFERRED.
- Disk 2 GB is $0.08 a week; leave it.

### b. Pre-render to R2, then play out

How: a render mode of the same container. The audio path is already clocked by JACK, not by node (grains.mjs),
and the scene clock is the mix clock (`engine.seconds`). What still reads the wall clock and would move to the
engine clock: the 3 s ahead-of-wall throttle (grains.mjs), the pulse's `setTimeout` and the onset spacing
`Date.now()` (live.mjs), the 50 ms `setInterval` driver, the buffering wait in mixer.mjs:256. JACK itself runs
faster than real time either through its freewheel mode or the dummy driver's cycle wait (`jackd -d dummy -w`);
INFERRED, check `jackd -d dummy --help` in the image. Output: hour chunks of 128 kbit/s MP3 plus a sidecar of
scenes and times (what `status.life` shows today), written to R2. The life state crosses chunk boundaries (scene
index and the heard keys, the same `hist` the handover already passes), so chunks render in order.

**Render speed.** 39 % of a core at real time is 1/0.39 = **about 2.5x real time on one vCPU**, less the fixed
cost of timers and polling. INFERRED **2 to 2.5x**. Not cheaper per hour on a bigger instance: `standard-4` has
the same 3 GiB per vCPU, and one chain is a pipeline whose slowest stage (node) caps it, so a bigger box mostly
makes it faster, not cheaper. A ten minute render would MEASURE it.

**The catch: CPU is billed on use, and a render uses the same CPU seconds as live.** Only the memory and disk
time shrink by the render factor. So per day of audio rendered on Cloudflare at 2.5x:
CPU 0.39 x 86,400 x $0.00002 = **$0.674**; memory 3 x 34,560 s x $0.0000025 = **$0.259**; disk **$0.005**;
total **$0.94 per audio day** (against $1.33 live).

**Playout, `lite` container** (1/16 vCPU, 256 MiB, 2 GB), running the copy path that already exists in
`container/server.mjs` (`run()`: fetch, `createFramer`, pace 2 s ahead of the wall, reconnect with backoff) on the
alpine `container/Dockerfile` image. Copy mode measured **about 80 MB** used (MEASURED 2026-10-16 on basic,
HANDOFF session 81), so it fits 256 MiB. Its CPU was never measured on its own; mix mode's node, which does more,
read 3.0 % of a core with the decoders and LAME as separate processes (MEASURED, `lessons/workers-cast.md`
mix-pacing). INFERRED copy at 1 to 3 % of a core, inside the 6.25 % that `lite` gives.
Per week: memory 0.25 x 604,800 x $0.0000025 = $0.378; disk $0.085; CPU at 1 to 3 % $0.12 to $0.36:
**$0.58 to $0.83 a week**.

**R2:** a week at 128 kbit/s is 9.7 GB; kept for the week it is inside the 10 GB-month free tier, kept a month it
is about $0.15. Requests: a few hundred writes and reads, inside the free tier.

### c. A Durable Object as the Icecast source

- **It was tried and it died**, but not in the shape that matters: the first cast (`3102c20c`, 2026-10-16) paced
  frames from a `Caster` DO and kept pace for 10 minutes (595 s sent in 593 s), then was dead by 21:45 with no
  dated cause, because both objects kept state in memory only (MEASURED, HANDOFF session 80, commit `b414acb2`).
  That run fed our own `Rx` DO through a streamed DO-to-DO PUT, not a `connect()` socket, and `Rx` itself later
  restarted twice in 30 minutes. So **a DO holding a TCP `connect()` socket to an Icecast for days has never been
  measured here.**
- **What the docs say:** an outbound `connect()` socket keeps a DO alive for at most 15 minutes per connection,
  after which standard eviction resumes (70 to 140 s with no incoming event), though the connection itself goes on
  (https://developers.cloudflare.com/changelog/post/2026-06-19-outbound-connections-keep-dos-alive/). An alarm
  every 30 s is an incoming event and would keep it. **Every deploy of the Worker restarts every Durable Object,
  and so do Cloudflare runtime updates** (https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/),
  which drops the source and with it every Väin listener (MEASURED on the stand-in Icecast: the listener's
  connection ends when the source goes, `lessons/workers-cast.md#handover`). A playout DO would have to live in a
  Worker of its own that nobody deploys during the run. CPU: a DO pays duration, not CPU, but a long loop needs
  incoming events to reset its 30 s CPU allowance; copying MP3 frames is small (INFERRED well under 1 ms per
  second of audio).
- **Price:** 0.125 GB x 604,800 s = 75,600 GB-s a week: **$0 inside the 400,000 GB-s a month**, **$0.95 a week**
  beyond it. So a DO is not cheaper than the `lite` container unless the monthly inclusion is free, and it is the
  less proven of the two. It only plays what is already rendered: no decode, no processing.

### d. HLS from R2 served by a Worker (the eccm shape)

**It does not feed Väin's Icecast.** Nobody in the Väin app hears it. It is good for our own listen page: HTTPS
(Väin's mount is plain HTTP on 8001, a mixed-content refusal on an https page, which is why we relay it through
`shout.positron.studio`), keeps playing on a locked iPhone, needs no relay connection to Väin's server, and puts
no listener of ours into Väin's statistics. It plays only audio that exists: the pre-rendered chunks of b, or 10 s
chunks posted live by the container. Cost at our scale: a listener asks a playlist about every 10 s and a segment
about every 10 s, about 17,000 requests a day; ten listeners for a week is about 1.2 M requests, inside the
10 M included, CPU a few ms each, inside 30 M CPU-ms. **About $0 on top of the $5 plan** (INFERRED from the
rates). Restoring it is `archive/radio.md` in eccm, or a smaller copy of `station.mjs` here.

### e. Not Cloudflare (from the brief, not re-checked)

A Hetzner CPX22 at €19.99 a month (CX plans unavailable), INFERRED about €4.65 a week if billed by the hour. It
runs the container image unchanged, but the Caster's slot, handover, program, alarm and status logic talks to
`ctx.container`, so it would need a remote-container adapter. Rejected earlier for a short run; for a month or
longer it is the cheapest way to keep the LIVE chain (step and all).

### Cost table

Per station on air, before the monthly inclusions. The Caster DO's own duration (about 10,800 GB-s a day,
INFERRED awake all the time while its container runs) is the same in every container option and sits inside the
400,000 GB-s a month for one station.

| option | per day | per week | source of the numbers |
| --- | --- | --- | --- |
| today: 1 vCPU / 3 GiB live (memory $0.648, CPU $0.674, disk $0.012) | **$1.33** | **$9.34** | MEASURED 39 %, FROM DOCS rates |
| a1. today, CPU cut 15 % by profiling | $1.23 | $8.61 | INFERRED cut |
| a2. custom 0.75 vCPU / 2.25 GiB, if accepted | $1.17 | $8.20 | docs say refused; INFERRED fit |
| a3. standard-1 (0.5 vCPU / 4 GiB) | worse ($0.86 memory alone) and fell behind | | MEASURED behind at 0.5 |
| b1. pre-render a unique week on CF at 2.5x + `lite` playout | $1.02 to $1.06 | $7.15 to $7.40 | INFERRED render factor, FROM DOCS rates |
| b2. pre-render 24 h on CF, loop it for the week + `lite` playout | $0.22 to $0.25 | $1.52 to $1.77 | as b1 |
| b3. pre-render on the owner's machine, `lite` playout only | $0.08 to $0.12 | $0.58 to $0.83 | INFERRED playout CPU |
| c. pre-render + DO playout instead of `lite` | render + $0 to $0.135 | render + $0 to $0.95 | FROM DOCS; DO path unmeasured |
| d. HLS from R2 for our own page | about $0 extra | about $0 extra | does not reach Väin |
| e. Hetzner CPX22, live chain | about €0.67 | about €4.65 | from the brief |

Egress in every case is 57.6 MB an hour, 9.7 GB a week, inside the free terabyte.

## 4. What processing survives each option

The chain today (live only since 2026-10-18), all inside the container: archive files decoded by ffmpeg
(`decode.mjs`) each levelled to -23 LUFS and softened where flagged (`soften.mjs`); the tuner mix of two slots
with crossfades, noise and the AM band (`mixer.mjs`, `tuner-mix.mjs`, `crossfade.mjs`, short-file prefetch); the
grain ring in native scsynth through jackd dummy and jack-stdio (`grains.mjs`, the page's own PROGRAM); the life
(`life.mjs`, grammar 2, seeded, built from the owner's votes at start) choosing scenes, patches, dwell, blend,
bridges; six layer programs (`layers.mjs`: drone, freeze, resonators, harmonizer, the room) with ghosts from the
next or previous file; the tempo pulse; onsets from the tuner's last 1024 samples; the key heard by a chroma of the
tuner's last 8192 samples from 1 to 5 s into each scene; LAME; the source socket; the gapless handover on deploy.

| part | a. container tuned | b. pre-render + playout | c. DO playout | d. HLS from R2 |
| --- | --- | --- | --- | --- |
| decode, level, soften, tuner mix, crossfades, bridges | unchanged | unchanged, in the render | only what b rendered | only what b rendered |
| grain ring, six layers, ghosts | unchanged | unchanged | as b | as b |
| life, grammar 2, seeded scenes | unchanged | unchanged | as b | as b |
| the key heard from the file, onsets | unchanged | **survive**: both are heard from node's own mix, which a render makes identically | as b | as b |
| tempo pulse | unchanged | changes: moves from the wall's `setTimeout` to the engine clock | as b | as b |
| owner's votes | read at start only, as today | **survive and improve**: read at each render; a daily render follows them daily, a station left on air never does | as b | as b |
| owner's `step` next / previous | unchanged | **lost** (only a re-render from now, minutes later) | lost | lost |
| new files in their archive | picked up on the next start | picked up on the next render | as b | as b |
| `status.life` on the page | unchanged | from the render's sidecar, by wall time | as b | as b |
| gapless handover on a cast deploy | unchanged | not needed in the render; the playout restarts only when its own image changes | dies on every deploy of its Worker and on runtime updates | n/a |
| reaches Väin's listeners | yes | yes | yes | **no** |

What every option shares: Väin's mount takes one source, so any restart of whatever holds it ends their
listeners' connections, and Väin's own `livestream` check still has to refuse a start while they are on air.

## 5. Does the LOCAL mode matter

`demo/radio/cast/local.mjs` runs the whole chain in a browser, free, nothing on air (the tuner graph, wasm
scsynth with the page's ring, the crossfade, the life). Three consequences:
- It proves the chain is portable, but **it is not a render engine as it stands**: its sources are media elements
  and its clock is the AudioContext's, so a faster-than-real-time OfflineAudioContext render would need whole
  files decoded into memory (an hour at 44.1 kHz stereo float is 1.3 GB, `lessons/workers-cast.md#local`) and
  the analyser reads rewritten around `suspend()`. Not recommended.
- **It is the answer to the lost `step`** under b: the owner auditions and votes in LOCAL for free, and the next
  render carries those votes.
- It is the free stand-in for checking a render's sound before it goes on air.

## 6. What could not be settled, and what would settle it

- **The render factor.** 2 to 2.5x is from one CPU reading. Settle: render ten minutes in the grains image at
  `--cpus 1` with JACK sped up, and time it; then once on Cloudflare.
- **Whether jackd's dummy driver or freewheel runs the chain faster than real time without xruns or a changed
  sound.** Settle: the same run, compared sample for sample with a real-time run of the same seed (the handover
  tests already compare two recordings of seed 16).
- **Live mode's memory on Cloudflare.** Never read on its own. Settle: `procs` RSS in `/status` during a live run.
- **Whether Cloudflare accepts a custom size under 1 vCPU.** The docs say no; the cast ran 0.5 and 0.25. Settle: one
  start at 0.75 / 2304 on `preview`.
- **Copy-mode CPU on `lite`.** Unmeasured. Settle: a one hour playout into `preview` on `lite`.
- **A DO holding a `connect()` socket for days.** Never measured here; the 10 minute death was a different path.
  Settle: a 24 hour DO playout into the preview Icecast, with the DO's own restarts dated in storage.
- **Whether the owner accepts a loop.** A week of unique audio and a looped day cost five times apart; the archive
  itself is about 13 to 17 files (about 216 min, `plans/plan-vain-videoradio.md`), so every option replays it.
- **Cloudflare's 39 % against OrbStack's 25 %.** Not explained; it moves every CPU line above.
- **The fetch load on Väin's web host.** The container fetches each file from `eccm.ee`/`uuu.ee` every time it
  plays it, ghosts included (`decode.mjs` takes `item.url`). A render fetches at 2.5x that rate. Pointing the
  decoder at our own `GET /file/<id>` (edge cached a year) fixes it in every option; the external-sources rule
  says it should be done before any long run.

## 7. Recommendation

1. **Üle Heli (23 to 25 October): keep the live container as it is**, 1 vCPU / 3 GiB. It is the only option with
   the owner's `step`, and three days of it is about $4. Do not spend those days on a new path.
2. **Before any run of a week or more, point the decoder at `/file/<id>`** (small change, every option benefits,
   stops hammering their host).
3. **For an unattended week or more, build b**: a render mode of the same container (engine clock in place of the
   wall's, JACK sped up, hour chunks and a scene sidecar to R2, `hist` carried across chunks), and a `lite` playout
   on the existing copy path and alpine image, in a Caster class that skips refresh-on-deploy. About **3 days**
   (INFERRED): a day for the clock and the render, a day for R2 and the playout, a day for the measurements in 6.
   The `lite` container rather than a DO, because its copy path has run 30 minutes and past here and the DO has not.
4. **Ask the owner for the loop length.** It is the number that sets the bill: unique week about $7.2, a 24 hour
   loop about $1.6, a render on his own machine (the M1) with only the playout about $0.7.
5. **d is optional and separate**: the eccm station brought back for our own listen page, fed from the same R2
   chunks, at about $0. It does not replace the Väin mount.
6. **Not recommended**: a2 (saves under 13 % against the documented floor), c (no cheaper than `lite` once the
   monthly DO inclusion is used, restarted by every deploy and runtime update, unmeasured), Hetzner for anything
   shorter than a month.
