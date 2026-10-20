# plan-cast-lightweight: why the cast is heavy, and lighter ways to make live sound

Asked 2026-10-20, in the background: *"we were perfectly able to get the signal out of P using PCM and WebSocket
messages. And also even thinking about Pico doing it. But now we are wielding those heavy permanent containers. We
are getting close to a CPU maximum. What is going on? What we're doing so heavy that we need to do static renders?
... maybe there is a better way to do it in a cloud-run infrastructure system ... Maybe just the shoutcast is just
too old school and too heavy for machines. Or maybe it's all reasonable. It's just the nature of medium ... So
what's going on? Any ideas?"*

Research only. Nothing was deployed, started, stopped or committed. No connection to live.uuu.ee, eccm.ee or any
Icecast mount. Three small benchmarks ran locally (the grains-local image and node on this laptop, synthetic noise,
no network), and they are marked MEASURED 2026-10-20. Everything else is MEASURED (where), READ (file) or INFERRED.
It builds on `plans/plan-cast-cheaper.md` (the prices) and does not repeat its tables.

## 1. Verdict

- **The sound is cheap. The way it is moved is not.** Measured offline, the cast's DSP adds up to about 5 per cent
  of one core: the tuner 0.53 %, the six layer programs 0.73 %, the grain ring about 3 %, LAME 0.59 %. The same
  work as a live chain reads 25 % of a core locally and 39 % on Cloudflare. So roughly four fifths of the CPU is
  the real-time plumbing between seven processes, not the sound. INFERRED from the gap; nobody has profiled it.
- **We are not near the CPU maximum of the box we run on.** 39 % of one vCPU leaves about 2.5 times headroom on
  average. We WERE at the maximum on half a vCPU (43 to 47 % of its 50 %, 10 to 34 s behind, 11 xruns), which is
  why the size went to 1 vCPU on 2026-10-18. Peaks on 1 vCPU have not been read.
- **On Cloudflare the bill is set by the instance floor more than by the work.** A custom instance starts at 1 vCPU
  and 3 GiB; the chain uses 318 to about 700 MiB. Memory is $0.648 of the $1.33 a day and does not shrink if the
  CPU does. Only a chain that fits `lite` (1/16 vCPU, 256 MiB) gets cheap on Cloudflare: about $0.14 a day.
- **Icecast and MP3 are not the heavy part.** LAME at 128 kbit/s is 0.59 % of a core offline (2.7 % inside the
  live chain, the rest is its pipe). The source is one HTTP PUT. Opus would cost the same and AAC twice, and Väin's
  app plays MP3, so there is nothing to win by changing the codec.
- **Renders take real time only because of how the chain is clocked, not because the sound needs it.** JACK's dummy
  driver sleeps one period per period, and node holds itself 3 s ahead of the wall. Nothing in the control path
  reads scsynth's output, so the whole piece is a function of the seed, the files, the votes and the code. Offline,
  through scsynth's own NRT mode, 15 minutes would render in about 30 to 60 s on one core (INFERRED from the
  offline costs above). That is the change worth making first, because it helps the gate today and is the engine
  of every cheaper option.
- **The Pi comparison is fair but it is a different job.** The Pi sends raw 48 kHz mono s16 in 20 ms frames to one
  page: no decode, no mix, no granulator, no encode, one process. The cast decodes the archive, runs a tuner, a
  granulator, six effect programs and a master, encodes MP3, and has to feed somebody else's Icecast that only
  takes a source over TCP. The eccm HLS station did no processing at all: it wrote playlists over byte ranges of
  MP3s already in R2. The Pico cannot do the cast (section 5d).

## 2. Where the CPU goes

### What is measured, process by process

Live chain, OrbStack arm64, the grains image, `--cpus 0.5 --memory 1536m`, period 8192, 100 s, with the test reading
`/status` four times a second (MEASURED 2026-10-18, `lessons/workers-cast.md#live-container`):

| process | per cent of one core |
| --- | --- |
| node (tuner, decoders' PCM, life, layers driver, chroma, onsets, pipes, status) | 10.8 to 11.0 |
| scsynth (ring, six layers, room, master) | 4.1 |
| jack-stdout | 3.2 |
| jack-stdin | 3.1 |
| ffmpeg libmp3lame | 2.7 |
| ffmpeg decoders | 0.2 |
| jackd | about 0.1 (grains run) |
| container cgroup | 24.7 to 25.2 |

At period 4096 the container read 28 to 31 %. Grains mode alone (ring, no layers, period 2048, `--cpus 1`): node 9.0,
LAME 4.6, jack-stdout 4.3, jack-stdin 2.6, scsynth 1.7 (its own `/status` average 2.9), container 22.8
(`lessons/workers-cast.md#grains`).

On Cloudflare (container cgroup, `usage()` in `mixcast.mjs`, MEASURED, HANDOFF sessions 82 and 83, BACKLOG):

| mode | instance | CPU |
| --- | --- | --- |
| mix (tuner and LAME only, no JACK) | 0.25 vCPU | median 5 % over 16 min |
| grains (the ring through JACK) | 0.5 vCPU | 17 % over 16.6 min |
| live (ring, layers, ghosts, life) | 0.5 vCPU | 43 to 47 % of its 50 %, fell 10 to 34 s behind, 11 xruns |
| live | 1 vCPU | 39 %, lag -1.2 s, 0 xruns, first 65 s, in a Smear scene |

No per-process breakdown has ever been read on Cloudflare. Cloudflare's 39 % against OrbStack's 25 % for live is not
explained; grains read lower on Cloudflare (17) than locally (22.8), so it is not a flat 1.5 times either. The 39 %
was read in the first 65 s, which holds the boot (two compiles, the decoders starting, files fetched over the
internet), so it may be high. INFERRED.

### What the same work costs offline

| part | offline cost, per cent of one core | source |
| --- | --- | --- |
| the tuner (`createTuner().render`, two slots, noise, whistle) | 0.53 | MEASURED 2026-10-20, node on this laptop's host, 300 s of noise |
| `widen` (s16 stereo to four channels for jack-stdin) | 0.13 | MEASURED 2026-10-20, same |
| all five layer kinds at once in scsynth | 0.73 | MEASURED, NRT in grains-local, commit `38d7053c` |
| the grain ring at Cloud's density | about 3 | scsynth's own `/status` average 2.9 in the grains run (real time, so an upper bound) |
| LAME 128 kbit/s stereo | 0.59 | MEASURED 2026-10-20, grains-local `--cpus 1`, `ffmpeg -benchmark`, 300 s of noise: 1.77 s CPU |
| libopus 96 kbit/s | 0.67 | same: 2.00 s |
| ffmpeg native AAC 128 kbit/s | 1.35 | same: 4.03 s |
| libshine 128 kbit/s | 0.49 | same: 1.46 s |
| ffmpeg s16 passthrough | 0.01 | same |
| the chroma (8192 point FFT, 20 a second for 4 s of each 60 to 150 s scene) | under 0.1 on average | INFERRED from the code (`live.mjs`) |

Sum: about 5 % of a core. Caveat: the tuner was timed on the host, not in the container, and every offline number is
an M-series core; a Cloudflare vCPU is likely slower (INFERRED).

### What the rest is, INFERRED from the code

The difference between 5 and 25 is work that exists because seven processes pass audio to each other in real time:

- **Format changes at every hop.** Decoders write f32 to node, node writes s16 to jack-stdin, jack-stdin converts to
  float for JACK, jack-stdout converts back to s16, node meters it sample by sample (`tapOut`, `readInt16LE`) and
  pipes it on to LAME, which converts again. Five copies and four conversions of the same 44.1 kHz stream.
- **Wakeups.** node's main loop runs per 20 ms block (`BLOCK` 882) and sleeps 50 ms whenever it is 3 s ahead, the
  driver ticks every 50 ms (`TICK_MS`), and each block calls `sampleClock()`, which reads `/proc/<pid>/io` with
  `readFileSync`: about 50 file reads a second for the handover's clock. jack-stdio's reader and writer threads wake
  per period. Each wakeup costs a context switch, and on a CFS quota a burst can be throttled for the rest of the
  100 ms window.
- **Status.** One `/status` read stalled node's loop 350 ms (positron-cast section 7), and the local numbers above
  were taken while reading it four times a second.
- **Why half a vCPU failed, INFERRED.** A CFS quota of 50 ms per 100 ms. When a file arrives a decoder starts, and
  the chain's demand briefly exceeds the quota; every process stops until the next window, JACK misses its cycle,
  and node's 3 s lead drains. Larger periods (2048 to 8192) cut the xruns because they give each throttle more
  slack, not because the sound got cheaper.

What would turn this into a fact: `node --cpu-prof` of the container's node for 60 s, `pidstat -t` for jack-stdio's
threads, and one `/status` sample with `procs` on Cloudflare after the first two minutes.

## 3. Why it runs in real time, and whether it must

### Deterministic, given the seed, the files, the votes and the code

- **The life** (`life.mjs`): seeded; `life-test.mjs` keeps grammar 1 bit for bit, and live-test found the planner run
  apart matches `status.life` on 425 to 428 reads, to the bit (MEASURED 2026-10-18).
- **The files and the tuner**: ffmpeg decodes deterministically; the tuner's noise uses `Math.random` today but
  `createTuner({ rand })` takes the seeded mulberry32 already in `mixer.mjs` (`seeded()`).
- **Scene times**: on the mix clock (`engine.seconds`), not the wall.
- **The moments** (`moments.mjs`): read per file, offline, before it plays.
- **The key heard** and **the onsets** and **the freeze gate** (`last(1024)` over 0.02 RMS, in `refs/renders/morning-events3`):
  all three read the TUNER's output, before scsynth. Nothing in the control path reads scsynth's output. So they are
  deterministic in what they read, but today they read it at wall instants: the 50 ms `setInterval`, `Date.now()`
  for the onset spacing, `setTimeout` for the pulse and the onset strike. Moved onto the mix clock (tick every N
  frames of `engine.seconds`), they become deterministic too. `plan-cast-cheaper.md` section 3b lists the same
  wall reads.

### Not deterministic

- **scsynth's random UGens** (Dust, TRand, LFNoise1 and 2, GrainBuf positions): each synth seeds itself; no two runs
  are sample-equal (`lessons/workers-cast.md#local`). A `RandSeed` per node would fix it if wanted. It does not
  matter for a render: the gate grades loudness and timing, not samples.
- **The owner's `step`** and new feed files arriving: events from outside, by nature live.

### Could the chain run faster than real time

Two ways, both available in the image today (MEASURED 2026-10-20, `docker run grains-local`):

1. **JACK's dummy driver faster.** `jackd -d dummy` has `-w, --wait  Number of usecs to wait between engine
   processes (default: 21333)`. A small `-w` runs cycles back to back. Every wall read in node (above) and the 3 s
   ahead throttle would have to move to the mix clock first, and nobody knows whether jack-stdin and jack-stdout keep
   up without dropping when JACK is not waiting. Least code, most unknowns. INFERRED.
2. **scsynth NRT** (`scsynth -N <score> <input.wav> <output.wav> 44100 WAV float`). The repo already runs it:
   `sclang-layers-test.mjs --native` and `--cpu-native` render scores in grains-local, and the 0.73 % above came from
   it. The render would be three passes, no JACK:
   - node runs the engine and the life on the mix clock, writes the tuner mix and the ghost as a 4 channel WAV, and
     writes every `/s_new`, `/n_set` and `/d_recv` the driver would have sent into an OSC score at its mix second;
   - `scsynth -N` renders the score with that WAV on its inputs (busses 2 to 5, as `-i 4` today);
   - ffmpeg encodes MP3 (and measures, as the gate does).
   INFERRED time for 15 minutes on one core: tuner about 5 s, scsynth about 20 to 45 s, LAME about 5 s, so **30 to
   60 s instead of 15 minutes**, and three versions in parallel cost three cores for a minute rather than three
   containers for a quarter of an hour. What the score cannot carry: the hand-over (not needed in a render) and the
   owner's live `step`.

One question this raises and does not settle: whether an NRT render sounds like the live chain. It should, since the
SynthDef bytes are the same and only the clock differs, but the 0.43 to 0.72 s lead between node and scsynth on air
(positron-cast 2.3) would be 0 in a score, so the hand's moves land that much later than on air. A render and a live
run of one seed, compared by the gate's own checks, would settle it.

## 4. The alternatives

Costs per station per day on air. Cloudflare rates are `plan-cast-cheaper.md` section 3. "Survives" is how much of
today's code is used unchanged.

### a. Render ahead, play out

The chain renders hours (or a day) into MP3 chunks in R2 with a scene sidecar; a playout holds the source. Two
playouts: a `lite` container on the existing copy path (`server.mjs` `run()`, about 80 MB used, MEASURED session 81)
into Väin's Icecast, and optionally the eccm shape (a Worker writing HLS playlists over R2 byte ranges) for our own
page.

- **Cost:** `lite` playout $0.08 to $0.12 a day (plan-cast-cheaper b3). The render on Cloudflare: with the JACK
  chain at about 2.5 times real time, $0.94 per audio day; with NRT at about 5 % of a core, CPU about $0.09 per
  audio day and memory for minutes, so **about $0.10 per audio day** (INFERRED). On the owner's machine, $0.
- **CPU:** playout 1 to 3 % of a core (INFERRED); render minutes per day of audio.
- **Latency:** none to the listener beyond Icecast's; a change of sound reaches air at the next render.
- **Keeps:** everything that makes the sound (life, layers, master, ring, tuner, moments, votes per render); the
  gate becomes the release step, which is what the owner asked for on 2026-10-19 (*no live sound patching*).
- **Loses:** the owner's live `step`, and new feed files within 30 s (they wait for the next render; a render every
  hour of the next hour would take them within the hour).
- **Survives:** all of `demo/radio/cast/`, `mixer.mjs`, `decode.mjs`, `encode.mjs`, `mp3.mjs`, the Caster's control
  and the copy path. `grains.mjs`'s JACK half and the handover's clock work (`clockHeard`, `align`, `settle`) are
  not needed in a render; `live.mjs`'s driver becomes a score writer.

### b. Render in the listener's browser (LOCAL as the product)

- **Cost:** $0 on the server beyond `/file/` (edge cached a year).
- **CPU on the listener:** all five layers about 5 % of the render budget in desktop Chrome (MEASURED `38d7053c`);
  16 Ringz 0.2 to 0.9 % over idle (`lessons/kit-sclang-lite.md`). The ring in a tab has not been timed, nor has
  anything on a phone. INFERRED fine on a recent phone at 44.1 kHz, unknown on an old Android.
- **Loses, and these decide it:**
  - **Väin's listeners.** Their app plays an Icecast MP3 mount. LOCAL cannot feed it. For radio1965 and user1 to 4
    this option does not exist.
  - **A locked iPhone.** A Web Audio graph stops when the tab is backgrounded or the phone locks; the eccm HLS
    station survived a locked iPhone exactly because no JavaScript runs while it plays (plan-cast-cheaper section 2).
    The owner's own judging rule is a phone on a commute.
  - **One shared broadcast.** Each tab is its own performance unless the seed and the start time are shared; even
    then scsynth's random UGens differ (section 3).
- **Keeps:** it already exists and holds the container's numbers (`local-test.mjs` 26/26). It is the right tool for
  auditioning, and the right product for a page that is not a radio station.

### c. A lighter server chain

What to drop, in order of what it buys:

- **c1. NRT in chunks, near live.** The NRT render of section 3, in chunks of 10 to 30 s, a minute ahead, into the
  same pacing and source code the playout uses. One node process plus a short scsynth and ffmpeg per chunk, or
  scsynth kept running and fed a score per chunk over OSC with `/b_read` of the chunk's input (INFERRED; a long-lived
  NRT server is not a thing, so per chunk processes or a real-time server are the two shapes). State that crosses a
  chunk (the ring's 8 s buffer, reverb tails, the drone's phase) is the hard part: per chunk processes start cold, so
  a chunk needs an overlap of at least the ring's 8 s, rendered and thrown away. **CPU:** about 5 % of a core plus
  the overlap (INFERRED 6 to 10 %). **Step latency:** 30 to 60 s. **Survives:** as a, plus the live `step` (late).
- **c2. One process.** The wasm scsynth (`scsynth-nrt.wasm`, 1.7 MB, already vendored) driven block by block from
  node, beside the tuner, with LAME as the only child. No JACK, no pipes into scsynth, no conversions between. Never
  tried: the build is made for an AudioWorklet host, and driving its `process` from node needs a small host shim
  (INFERRED, a day to find out). It keeps LOCAL and the container on literally the same engine, which today they are
  not (native against wasm).
- **c3. A rewrite in Rust or C** (fundsp, or hand-written DSP as `rig/board/` does for its synths). The smallest
  footprint, the only path that might fit `lite` with headroom, and the one that throws away sclang-lite, the shared
  layer programs and LOCAL's parity. Weeks, not days. Not recommended.
- **c4. Opus or AAC instead of MP3.** No: 0.67 and 1.35 % against LAME's 0.59 % (MEASURED 2026-10-20), and Väin's
  mount is MP3.
- **c5. Lighter instance.** What any c buys on Cloudflare depends on whether it fits `lite` (6.25 % of a vCPU, 256
  MiB). At 6 to 10 % of an M-series core, and a Cloudflare vCPU probably slower, it does not fit with margin
  (INFERRED). Anything that does not fit `lite` lands back on 1 vCPU / 3 GiB: memory $0.648 a day stays, CPU falls
  from $0.674 to about $0.10 to $0.17, so **about $0.75 to $0.82 a day**, 40 % off rather than 90 %.

### d. The Pi, or a small box at a site, does the processing

- **What it is:** the same Debian packages (jackd2, scsynth 3.13, ffmpeg, node 22) on the Pi 4 at the second site,
  which already runs jackd on a real card (512 x 3 on the Fast Track Pro) and scsynth natively. The Pi becomes the
  source: it PUTs to Väin's Icecast itself, or to our own Icecast relay, and the cloud keeps only control.
- **Cost:** $0 a day on Cloudflare (or about $0 for a relay).
- **CPU:** the A72 is slower than an M2 Pro core; INFERRED 3 to 4 times, so about 15 to 25 % of one of its four cores
  for the DSP, more for the JACK plumbing. The Pi already shows load: Yoshimi xruns 9 to 17 a minute with the video
  renderer on, and the input floor rises 2 to 3 dB under a busy loop (BACKLOG 2026-10-11 and 12). A cast on it
  would share the board with the studio.
- **Latency:** the same as today.
- **Keeps:** the whole live chain unchanged, step included; a real sound card as the clock instead of a dummy.
- **Loses:** Cloudflare's uptime and the gapless hand-over on deploy; a home connection, a power cut or a reboot ends
  every Väin listener's connection (their mount takes one source). Deploys become `rig/board/push.sh`.
- **The Pico:** no. RP2040 has 264 KB of RAM and no FPU; the ring alone holds 8 s of mono float, 1.4 MB. Decoding the
  archive's MP3s, granulating, six effect programs and an MP3 encode do not fit 3,125 cycles a sample a core
  (`plans/plan-pico.md`). A Pico can play a stream or be a control surface for the cast.
- **A small rented box** (Hetzner CPX22, about €4.65 a week, plan-cast-cheaper e) is the same as d with a datacentre's
  uptime; the Caster would need a remote container adapter.

### e. Other technology named in the question

- **Workers with WASM DSP per segment.** A Worker could run wasm scsynth for a 10 s segment per request, but every
  request starts cold: the ring's 8 s buffer, the reverb tails and the life's state would have to be saved and
  restored per segment, and a Worker has no long CPU budget per request on a stream. A Durable Object could hold the
  state but is one thread with its own CPU limits. INFERRED impractical for a granulator, workable for stateless
  steps. Not recommended.
- **Media over QUIC.** Delivery, not processing; the repo prices it in `positron-streaming`. It would carry the cast
  to our own page and not to Väin's app.
- **WebCodecs.** An encoder and decoder in the browser. It matters only for b (an Opus or AAC encode in a tab), and
  the tab is not the source Väin needs.
- **HLS for our own page.** Already priced at about $0 (plan-cast-cheaper d). It needs audio in R2 first, so it
  follows a or c1.

### Summary table

| option | $ a day on air | CPU | step | Väin's app | locked phone | code kept |
| --- | --- | --- | --- | --- | --- | --- |
| today, live JACK chain | 1.33 | 39 % of 1 vCPU (MEASURED) | instant | yes | yes (Icecast) | all |
| a. NRT render + `lite` playout | 0.18 to 0.22 (render on CF), 0.08 to 0.12 (render at home) | playout 1 to 3 % (INFERRED) | next render | yes | yes | sound all; JACK half dropped |
| a. JACK render + `lite` playout | 1.02 to 1.06 (unique), 0.22 to 0.25 (24 h loop) | as today while rendering | next render | yes | yes | all |
| b. LOCAL in every tab | 0 | 5 % of a tab's budget for layers (MEASURED), ring untimed | instant | **no** | **no** | all |
| c1. NRT chunks near live, 1 vCPU | 0.75 to 0.82 | 6 to 10 % (INFERRED) | 30 to 60 s | yes | yes | sound all |
| c2. one process, wasm scsynth in node, 1 vCPU | 0.75 to 0.85 | unknown, likely under 15 % | instant | yes | yes | sound all, same engine as LOCAL |
| c3. Rust or C on `lite` | about 0.14 | must be under 6 % | instant | yes | yes | little |
| d. the Pi as source | 0 | 15 to 25 % of an A72 core (INFERRED) | instant | yes | yes | all |

## 5. Answers to the questions as asked

- **What is going on?** The cast is a small amount of DSP carried by a heavy real-time arrangement: seven processes,
  a dummy audio clock, five copies of the stream, fifty `/proc` reads a second, on a platform whose smallest custom
  instance is 1 vCPU and 3 GiB. The CPU we see is mostly the arrangement; the bill is mostly the floor.
- **What is so heavy that we need static renders?** Nothing in the sound. Renders take 15 minutes because the chain
  is clocked by the wall. Section 3's NRT path would make them a minute.
- **Is Shoutcast/Icecast too old school and heavy?** No. One TCP connection and one PUT, and LAME is under 1 % of a
  core. It is also the only thing Väin's app plays. Its real cost is elsewhere: a mount takes one source, so whatever
  holds it must not restart, which is why the hand-over machinery exists.
- **Is it the nature of the medium?** Partly. A broadcast to somebody else's Icecast needs one always-on process
  holding a socket, and that is the permanent container. The processing does not have to live in that process, and
  that is the separation every cheap option makes: render anywhere, at any speed; hold the socket with something tiny.
- **The Pi and PCM over WebSocket.** That path works because it does almost nothing: raw 48 kHz mono s16, 768 kbit/s,
  to one page, no encode. It would carry the cast's sound to our own page fine. It cannot reach Väin's app.

## 6. Recommendation, for after Üle Heli (23 to 25 October)

1. **Leave the live chain alone until then.** It works at 1 vCPU, three days cost about $4, and the owner steps it.
2. **First build: the NRT render for the gate** (section 3, option 2). It is the cheapest change with the largest
   effect: a version renders in about a minute instead of 15, versions render side by side without a container each,
   and it is the render engine for a. About two days (INFERRED): one to move the driver's wall reads onto the mix
   clock and write a score, one to grade an NRT render against a live render of the same seed by the gate's checks.
3. **Then a: render ahead, `lite` playout,** as `plan-cast-cheaper.md` section 7 already recommends for an unattended
   week, now with NRT as the renderer. A render every hour (or on each new feed file) keeps new arrivals within the
   hour; the owner's `step` becomes "render from here", a minute away.
4. **Keep d (the Pi) as the fallback for a live, steppable week**, if the owner wants step and the Pi can be spared;
   measure it first, because the board is busy.
5. **Do not build** b as the radio (it cannot reach Väin's listeners, and a locked phone stops it), c3 (weeks, and it
   breaks LOCAL's parity), Workers per segment, or a codec change.
6. **Point the decoder at `/file/<id>`** before any long run, in every option (plan-cast-cheaper section 6): today a
   station fetches each archive file from their host each time it plays, ghosts included.

## 7. What to measure first, to turn the estimates into facts

| question | how | cost |
| --- | --- | --- |
| where node's 11 % goes | `node --cpu-prof` in grains-local for 60 s of `live-test.mjs --live`, read the top frames | an hour, local |
| what jack-stdio costs per thread | `pidstat -t 1` in the same run | minutes, local |
| how fast an NRT render runs and whether it sounds the same | a 15 min score render of seed 7, `time` it, gate it beside a live render of seed 7 | the two days of step 2 |
| whether the 3 s throttle and the 50 ms tick explain the gap | the live chain with `sampleClock` off and the throttle at 1 s, CPU before and after | an hour, local |
| Cloudflare's 39 % | one `/status` with `procs` after minute two of a capped preview start, when the owner asks for one | a few cents |
| whether jackd `-d dummy -w 0` keeps jack-stdio whole | a 5 min run, count the bytes in and out | an hour, local |
| the ring's CPU in a tab and on a phone | the `--cpu-browser` row for `ring` (it exists) on desktop, then the page's selfcheck on a phone | an hour |
| the Pi's headroom | the live chain on the Pi with nothing else running, then with the studio's usual load, CPU and xruns | needs the Pi's LAN |

## 7. Decided 2026-10-20: no pre-render, the cast stays live

The owner, after reading this plan: *"no prerender, we need to deal with live sources"*. A station has to take a live
input (a Väin livestream, a file arriving while it plays), so option a and the chunked c1 are out, and b was already out.
What stays open is making the live chain lighter:

1. Profile before changing anything (section 6): node's 11 %, jack-stdio's threads, `sampleClock` and the status polling.
2. Cut the plumbing inside the chain as it is: fewer copies and conversions, the clock read less often.
3. c2, one process (the wasm scsynth driven from node, LAME the only child): no JACK, the same engine as LOCAL. About a
   day to find out whether it runs.
4. d, the Pi at a site, for live inputs that start there.

An offline (NRT) render is still worth having as a test tool for the gate only, never as what goes on air: it would
let a sound change be checked in a minute rather than fifteen. Answered the same day: *"no offline. experiemnt with ligth chain"*. No offline render anywhere; the next step is an experiment with a light live chain.

## 8. The Cloudflare route for live compute: SFU, WebSocket adapter, Durable Object (2026-10-20)

Asked: *"what is the cf solution for this realtime compute"*, then *"yes, show data-backed plan and arealdy start experiments"*.
This section corrects section 4e: a Worker per request cannot hold a granulator, but a Durable Object can, because it
keeps its memory between messages and has no wall-time limit while a WebSocket or socket is open.

### What Cloudflare documents (read 2026-10-20)

| fact | value | source |
| --- | --- | --- |
| WebSocket adapter, GA | 2026-09-30 | changelog 2026-09-30 |
| WebRTC track out to our service | Opus decoded to 48 kHz stereo PCM over a WebSocket | adapter docs |
| our service back into WebRTC | 48 kHz stereo PCM in, published as Opus | adapter docs |
| message size | at most 32 KB each, about 170 ms of 48 kHz stereo 16-bit | adapter docs |
| reconnect | egress retries 15 s with a short buffer; no gapless or exactly-once promise | adapter docs |
| Durable Object wall time | unlimited while a WebSocket, stream, TCP socket or pending I/O is open | Workers limits |
| Durable Object memory | 128 MB per isolate | Workers limits |
| duration price | $12.50 per million GB-s, billed at 128 MB while active | DO pricing |
| WebSocket messages | 20 messages billed as one request, $0.15 per million | DO pricing |
| Cloudflare's own example | speech to text and text to speech on call audio in a Durable Object | AI audio example |

### What we measured (section 1)

| part | % of a core |
| --- | --- |
| tuner | 0.53 |
| five layer kinds | 0.73 |
| grain ring | about 3 (upper bound) |
| LAME 128k | 0.59 |
| sum | about 5, so about 1 ms of work per 20 ms frame |

### The estimate (arithmetic, not a bill)

- One object on air for a day: 86,400 s at 0.125 GB = 10,800 GB-s, about **$0.14 a day**.
- 50 frames a second: 4.32 million messages, 216,000 billed requests, about **$0.03 a day**.
- About **$0.17 a day** against $1.33 for today's container; the SFU's own egress price comes on top for WebRTC listeners.

### What has to be measured before believing it

1. Whether the vendored wasm scsynth (SuperSonic, `demo/shell/vendor/scsynth-nrt.wasm`) runs in workerd at all: no
   threads, no `SharedArrayBuffer`; and if not, what the smallest replacement for the ring and layers is.
2. CPU per 20 ms frame inside a Durable Object, and its spread (the worst frame decides glitches), against the 1 ms
   estimate; and that each WebSocket message gets its own CPU allowance.
3. The clock: a live input clocks itself; the file program needs steady pacing from something (a feeding WebSocket, or
   an alarm and a buffer) because timers in an isolate are not an audio clock.
4. For Väin: MP3 decode and encode as wasm in the same object, and the source PUT over an outbound TCP socket.
5. A restart (a deploy, an eviction): how long the gap is, and what state has to come back (the life's seed and scene,
   the file and second; the ring and reverb tails are lost).

### Rust

Not needed for portability: scsynth is C++ and SuperSonic already compiles it to wasm, which is what LOCAL runs. A Rust
port of our subset (the 36 UGens sclang-lite knows, the ring, FreeVerb, the limiter) would be lighter and would also run
native on the Pi and as wasm everywhere, but it is weeks of work and gives up the SynthDef programs the layers and the
master are written in. It comes back only if item 1 or 2 above fails.
