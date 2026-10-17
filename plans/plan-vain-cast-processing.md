# plan-vain-cast-processing: mixing, blending and granulation in the caster, with no machine of ours

Asked 2026-10-16: *"Plan how to do actual processing: we need mixing, blending
etc"*, *"Perhaps other sources in future?"*, and *"Possible way to affect result
by collective audience? X/Y pad in app? Quick alternative (page in positron)"*.

Constraints, as given: the owner is offsite and runs nothing on his own machines
(Mac, M1, Pi). Everything runs in Cloudflare. Väin can change almost nothing. The
live test is at Üle Heli on Sunday 2026-10-25.

How each claim is marked:

- **[code]** read from a file in this repository today, with the file named.
- **[docs]** read from a Cloudflare documentation page today, with its URL.
- **[repo-measured]** measured earlier and written down in this repository, file named.
- **[computed]** arithmetic on the numbers above it.
- **[inferred]** reasoning or general knowledge, not checked today. Treat as a guess.

Nothing was run, deployed or fetched for this plan except Cloudflare documentation.

## 0. Verdict

1. **The processing box is a Cloudflare Container, driven by the existing Caster
   Durable Object.** The Caster stays the control plane (control WebSocket, key,
   alarm, status, target passwords). A container named per target does the audio:
   it fetches the files itself, decodes, mixes, encodes and holds the Icecast
   source connection. This is the same shape `workers/pub` already runs in
   production [code: workers/pub/worker.mjs, wrangler.jsonc].
2. **By 2026-10-25, stage 1 is reachable: crossfades and tuning noise between
   archive files**, with the dial maths taken verbatim from
   `demo/shell/tuner-mix.mjs` (`createMix`, the pink noise formula and the AM
   graph's filter values) running in node inside the container, ffmpeg decoding
   each file and ffmpeg encoding the mix to MP3. About three working days.
3. **Granulation is stage 2, after the 25th**, and it is cheaper than it sounds:
   the granulator `/radio/scenery/` uses is the grain ring, a program of **core
   SuperCollider UGens only** (BufWr, GrainBuf, Phasor, LPF, DelayC, SendReply),
   compiled to a SynthDef **in pure JavaScript** by `demo/shell/sclang-lite.mjs`
   [code: demo/granulator/grain-ring.mjs, `PROGRAM` and `createRingEngine`]. So the
   container needs Debian's `scsynth`, not sclang and not sc3-plugins, and runs the
   Pi's documented chain `jackd -d dummy -> scsynth -> ffmpeg -f jack`
   [code: rig/board/README.md:218, rig/board/jacksynth.mjs:1]. Pappus proper
   (`Engine_Pappus.sc`) does need sc3-plugins [code: rig/board/packages.txt:39]
   and is a later step again.
4. **Inside the Durable Object (no container) is possible for blends only, and is
   the riskier home**: a 30 s CPU budget that resets on incoming requests, a loop
   that runs unattended, wasm that must be bundled, and a granulator that would be
   a JavaScript rewrite rather than the program the page plays. Not recommended.
5. **Browser Rendering running the real page is not a route** for a standing
   broadcast: 20 minute inactivity ceiling, no audio device, unmeasured.
6. **The collective X/Y pad (section 7) fits before the 25th in its copy-only
   form today** (the crowd votes which archive file plays next), and drives blend
   and tuning noise once stage 1 exists. A positron page published as a Väin
   `webcontent` event needs zero app code.
7. **The fallback for the 25th is what exists now**: the copy-only caster,
   verified end to end against our receiver. Every step below keeps it working.

## 1. Where the processing can run

### What exists today [code: workers/cast/worker.mjs, mp3.mjs]

- `Caster`, one Durable Object per target (`test`, `user1..user4`). `play` takes
  archive ids from their feed, opens one Icecast source connection (raw TCP
  `connect()` to `live.uuu.ee:8001`, `PUT /<mount> HTTP/1.0`, the
  `ice-audio-info: send_notification=0;save_stream=0` header their app sends),
  then `run()` fetches each file, cuts it into MPEG frames with `createFramer`, and
  writes frames paced against the wall clock 2 s ahead (`LEAD_S 2`,
  `READ_AHEAD_S 20`, `TICK_MS 200`). An alarm every 10 s keeps the object awake.
- No decode, no PCM. A file boundary is a hard cut. Mixed sample rates or bitrates
  between files pass straight through.
- `Rx` is our own Icecast receiver (`PUT /ingest/<mount>`, `GET /listen/<mount>`).

### (a) Inside the Durable Object, pure JS or wasm

What it would take: an MP3 decoder (wasm, for example minimp3 or mpg123 builds)
per slot, a mixer in JS (the `createMix` gains, pink noise, two biquads and a tanh
are a few hundred multiply-adds per sample), and an MP3 encoder (LAME in wasm, or
lamejs in pure JS) feeding the existing sink.

CPU, estimated **[inferred]**, nothing measured:

| stage | per second of 44.1 kHz stereo audio |
| --- | --- |
| decode one MP3 (wasm) | about 3 to 8 ms |
| two slots decoding during a blend | about 6 to 16 ms |
| mix, noise, filters in JS | about 2 to 5 ms |
| encode 128 kbit/s (LAME wasm or lamejs) | about 20 to 50 ms |
| **total** | **about 30 to 70 ms, so 3 to 7 per cent of one core** |

Limits **[docs]**:

- *"30 seconds (default) / configurable to 5 minutes of active CPU time"* for
  SQLite backed objects on Workers Paid, and *"Each incoming HTTP request or
  WebSocket message resets the remaining available CPU time to 30 seconds"*.
  *"if you consume more than 30 seconds of compute between incoming network
  requests, there is a heightened chance that the individual Durable Object is
  evicted and reset"*.
  https://developers.cloudflare.com/durable-objects/platform/limits/
- Alarm handlers have *"a maximum wall time of 15 minutes"*; DO HTTP and RPC wall
  time is unlimited while the caller is connected.
  https://developers.cloudflare.com/workers/platform/limits/
- Pending I/O keeps an object in memory *"for up to 15 minutes"* per operation,
  and *"Duration charges continue while an operation prevents eviction"*.
  https://developers.cloudflare.com/changelog/post/2026-10-01-pending-io-keep-alive/
- Billing is requests plus wall clock duration at 128 MB; no separate CPU line
  for Durable Objects. 400,000 GB-s included a month.
  https://developers.cloudflare.com/durable-objects/platform/pricing/

What that means **[computed + inferred]**:

- At 30 to 70 ms of CPU per audio second, the 30 s budget lasts **about 7 to 17
  minutes of audio if nothing resets it**. The caster's loop is started from one
  WebSocket message and then runs with no page attached. Whether an alarm
  invocation resets the CPU allowance of a loop started by an earlier event is
  **not stated in the docs read**. Raising `cpu_ms` to 300,000 buys about 70 to
  170 minutes under the same unknown. A self-request every 10 s (the Worker
  pinging the object) would reset it by the documented rule, but this is exactly
  the kind of keep-alive that has to be measured over hours, not assumed.
- Duration is already being paid: the copy-only loop keeps the object awake today,
  128 MB x 3600 s = 460.8 GB-s per hour, so the 400k included GB-s cover about 868
  hours a month **[computed]**. Processing adds no duration cost, only CPU risk.
- The object is single threaded: 30 to 70 ms of DSP per second, in 200 ms ticks,
  is 6 to 14 ms per tick, which delays control messages by that much
  **[inferred]**. Acceptable.
- Workers block compiling wasm from bytes at run time, so a decoder that ships its
  wasm inline as base64 will not load; the wasm has to be a bundled module import
  **[inferred]**, a packaging chore per library.
- **Granulation here means writing a grain engine in JavaScript.** It would not be
  the grain ring or Pappus, and it would not sound like the page. That is the
  deciding point against (a).

Grade: **possible for crossfades and noise, unmeasured on CPU reset, wrong home
for granulation.** Effort about two days for stage 1, plus a long survival run.

### (b) A Cloudflare Container (recommended)

How positron already runs one **[code: workers/pub/]**:

- `PubNext` on the `durable_object` scheduling policy, image
  `node:22-alpine` plus `apk add ffmpeg`, a node `server.mjs` on :8080.
- Custom size `{ vcpu: 1, memoryMib: 3072, diskMb: 2048 }`, because memory and
  vCPU are coupled at 3 GiB per vCPU and `standard` (standard-1) is half a vCPU,
  which starved two x264 encodes [code: workers/pub/wrangler.jsonc comments].
- Lifecycle owned in code, not left to `sleepAfter`: `ctx.container.start({ image,
  instance, enableInternet: true })`, `monitor()` for the exit,
  `setInactivityTimeout(10 min)` as a backstop set again on every wake, and an
  alarm sweep every 30 s that decides when to stop [code: workers/pub/worker.mjs
  lines 1 to 140, `SWEEP_MS`, `NEXT_IDLE_MS`].
- Talks to the container with `ctx.container.getTcpPort(8080).fetch(req)`.
  WebSocket through `getTcpPort` was **not tested** [repo-measured:
  research/cf-containers-next-2026-10-07.md:290], so control goes as plain HTTP.

Numbers:

| what | value | source |
| --- | --- | --- |
| cold start, new runtime, start() to listening | median 827 ms, p90 930 ms | [repo-measured] research/cf-containers-next-2026-10-07.md |
| first ever start after an image push | about 10 to 16 s | [repo-measured] research/cf-containers-2026-08.md:89, worker.mjs comment |
| outbound networking | arbitrary TCP ports open, UDP open | [repo-measured] research/cf-containers-2026-08.md:23,70 |
| R2 public URL from inside | works | [repo-measured] research/cf-containers-2026-08.md:74 |
| instance types | lite 1/16 vCPU 256 MiB, basic 1/4 vCPU 1 GiB, standard-1 1/2 vCPU 4 GiB, standard-2 1 vCPU 6 GiB, standard-3 2 vCPU 8 GiB, standard-4 4 vCPU 12 GiB | [docs] https://developers.cloudflare.com/containers/pricing/ |
| rates | memory $0.0000025 per GiB-s (25 GiB-h included), CPU $0.000020 per vCPU-s **on active usage only** (375 vCPU-min included), disk $0.00000007 per GB-s (200 GB-h included), egress EU $0.025/GB (1 TB included) | [docs] same URL |

Cost per hour, before allotments **[computed]**:

| instance | memory | CPU at the expected load | disk | **per hour** | always on, 744 h |
| --- | --- | --- | --- | --- | --- |
| basic (1/4 vCPU, 1 GiB, 4 GB) | $0.0090 | 8 % of a core: $0.0058 | $0.0010 | **about $0.016** | about $12 |
| pub's custom (1 vCPU, 3 GiB, 2 GB) | $0.0270 | 15 % of a core: $0.0108 | $0.0005 | **about $0.038** | about $28 |

Egress at 128 kbit/s is 57.6 MB an hour, inside the free terabyte. A four hour
test day on pub's size is about **$0.15**, and likely $0 after the monthly
allotments **[computed]**.

Expected load **[inferred]**: two ffmpeg MP3 decodes plus one LAME encode plus a
node mixer is well under 10 per cent of one EPYC core, so `basic` fits stage 1.
Stage 2 adds `jackd` dummy and `scsynth` with one grain ring; a stale scsynth on
the Pi was seen holding 33 per cent of a Pi core [code: lessons/rig-board.md:1606],
not the same workload, so size stage 2 at pub's 1 vCPU until measured.

What it does that (a) cannot: native ffmpeg, native scsynth, the page's own
SynthDef, no CPU budget per request, multi second buffers in memory. What it costs
in risk: **no uptime guarantee; a host restart drops the source socket**, and by
the socket close law that ends the broadcast [repo-measured:
research/cf-containers-2026-08.md:152 to 160]. The Caster must see the exit
(`monitor()`) and restart the container, which reopens the mount. Listeners hear
a gap and their player may or may not reconnect by itself **[inferred]**.

### (c) Browser Rendering running the actual page

[docs] https://developers.cloudflare.com/browser-rendering/platform/limits/ and
https://developers.cloudflare.com/browser-rendering/pricing/ : sessions close
after one minute of inactivity, `keep_alive` up to 20 minutes; 200 concurrent
browsers on Paid; 10 browser hours a month included then $0.09 an hour. The docs
say nothing about audio.

Why not **[inferred]**: there is no audio output to capture, so the page would
have to record its own `AudioContext` through a `MediaStreamAudioDestinationNode`
and `MediaRecorder` and ship the chunks somewhere that transcodes to MP3 and holds
the Icecast socket, which is the container of (b) anyway. Headless audio clocks,
AudioWorklet with SharedArrayBuffer in that browser, and the 20 minute inactivity
rule are all unmeasured. It would sound exactly like the page, which is its one
real merit.

### (d) Other credible routes

- **(d1) Pre-rendered transitions, spliced by the copy-only caster.** A tuning
  transition (the last 16 s of A through noise into the first 16 s of B, the
  scenery page's `BLEND_S` [code: demo/radio/scenery/index.html:67 to 70]) is
  rendered once to an MP3 in R2, and the existing frame copier plays A's body,
  the transition file, B's body. Zero CPU while on air. Rendering needs a
  container job anyway (batch, cents). It cannot react live, and splicing only
  works cleanly when the files share sample rate and bitrate **[inferred]**; their
  archive has not been checked for that. A good fallback, not the plan.
- **(d2) A container running headless Chrome with the real page**, as the old
  obs-cloud rig did at `standard-4`, about 190 per cent of a core and an 11.6 s
  cold wake [code: workers/pub/wrangler.jsonc comment]. Exact sound, heavy, and
  the browser audio capture questions of (c) remain. Keep for video (section 5).
- Cloudflare Stream and the Realtime SFU relay media; neither mixes audio
  **[inferred]**.

### Recommendation

(b), staged:

**Stage 1, by 2026-10-25: blends and tuning noise.** One container image under
`workers/cast/container/` (alpine node plus ffmpeg, as pub). Inside, node:

1. fetches each queued file from their host to local disk (`enableInternet`);
2. runs one `ffmpeg -i <file> -f s16le -ar 44100 -ac 2 pipe:1` per active slot;
3. clocks a mixer at real time in 20 ms blocks: `createMix(SLOTS)(t)` gives
   each slot's `clear` and `echo` gain and the `noise` level, the pink noise is
   `pinkNoise`'s loop with the same three coefficients, the AM band is the
   graph's 200 Hz highpass, 3500 Hz lowpass and `tanh(2.2x)` [code:
   demo/shell/tuner-mix.mjs]. `createMix` is pure maths and imports unchanged in
   node; the Web Audio graph is ported, not imported;
4. pipes the mix into one `ffmpeg -f s16le ... -c:a libmp3lame -b:a 128k -f mp3
   pipe:1`;
5. writes the MP3 bytes into the same source connection the Caster speaks today
   (`PUT /<mount> HTTP/1.0` and the same headers), lifted from `openSink` so the
   container and the DO cannot disagree about what Väin's server sees.

The drift (dwell 40 s, blend 16 s, the scenery page's defaults) runs in the
container; the page can also hold the dial by hand. Whether alpine's ffmpeg has
`libmp3lame` is **[inferred] yes** and is the first line of the Dockerfile check.

**Stage 2, November: the grain ring.** Switch the image to Debian slim for
`supercollider-server` and `jackd2`. node compiles `PROGRAM` with
`sclang-lite.mjs` (no DOM in it [code: grep finds no `document` or `window`]),
sends `/d_recv`, allocates the 8 s ring buffer, starts the synth, and sets
`PATCHES[n]` values with `/n_set`. The stage 1 mixer feeds JACK (a stdin to JACK
client such as `jack-stdin` **[inferred]**), scsynth's grain ring takes it on
`inbus`, `ffmpeg -f jack` reads its output into the encoder. The program's own
`\mix` does wet and dry [code: grain-ring.mjs `mixes: true`].

**Stage 3: Pappus**, needing sc3-plugins and the `Engine_Pappus.sc` path
[code: rig/board/norns/], and the per grain reports back to the page for the
picture.

## 2. The control model

### Wire

Today: page `demo/radio/cast/index.html` opens `/control/<target>?key=` and sends
`{cmd:'play', ids}`, `{cmd:'next'}`, `{cmd:'stop'}`; the Caster pushes `status`
once a second [code]. Proposed additions, same socket:

| message | meaning |
| --- | --- |
| `{cmd:'mode', mode:'copy'\|'mix'}` | copy is today's frame copier; mix starts the container |
| `{cmd:'set', name:'tune', v}` | the dial position 0 to 1, as `/radio/scenery/`'s tuner `value-in` |
| `{cmd:'set', name:'drift', v:0\|1}` | the clock drives the dial, or the page holds it |
| `{cmd:'set', name:'dwell', v}`, `{cmd:'set', name:'blend', v}` | seconds |
| `{cmd:'set', name:'noise', v}` | a trim on the tuner's noise floor |
| `{cmd:'patch', set:{size, density, ...}}` | stage 2: grain ring controls, `valuesOf(PATCHES[n])` shaped |
| `{cmd:'queue', ids}` | replace what comes after the current file **without** skipping it |

The last one is needed because today's `play` on a running session sets
`s.skip = true` and cuts the current file [code: worker.mjs `command`].

The Caster validates and clamps, keeps the last value of each in storage (so a
restarted container is handed its state), and forwards to the container as
`POST /set` through `getTcpPort(8080).fetch`, coalesced to at most 20 a second.
Status gains `tune`, the slot titles, per slot level, noise level, and
`container: up | starting | exited <how>`.

### Patchbay

Following `/radio/scenery/`'s own bay [code: demo/radio/scenery/index.html:95 to
130] and `bay.mjs`'s vocabulary (`NODE_KINDS` includes `engine` and `external`,
an `external` node always carries `consent`, `icecast` is in `TRANSPORT_NAMES`
[code: demo/shell/bay.mjs:33, 92, 789]):

```
vain-archive:file-<id>:audio-out   (external)  --https-->  cf-cast:slot-a:audio-in
vain-archive:file-<id>:audio-out   (external)  --https-->  cf-cast:slot-b:audio-in
cf-cast:noise:audio-out                         -------->  cf-cast:tuner:audio-in
cf-cast:slot-a:audio-out, slot-b:audio-out      -------->  cf-cast:tuner:audio-in
cf-cast:drift:value-out                         -------->  cf-cast:tuner:value-in
page:dial:value-out (person)  --room-->                    cf-cast:tuner:value-in
cf-cast:tuner:audio-out                         -------->  cf-cast:grains:audio-in      (stage 2)
page:patch:value-out          --room-->                    cf-cast:grains:value-in      (stage 2)
cf-cast:grains:audio-out                        -------->  cf-cast:encoder:audio-in
cf-cast:encoder:audio-out     --icecast-->                 vain-ice:user1:audio-in      (external)
```

`cf-cast` is one site (the container), so the links inside it are machine links
(`jack` in stage 2, which is in `MACHINE_ONLY`). The page draws the same picture
from this bay, and the tuner node's names match the scenery page's so the two read
as the same machine in two places.

## 3. Other sources

Every source enters the container the same way: something that produces PCM into
a slot. The container's outbound network is open [repo-measured], so it can read
anything the Worker can.

| source | transport into the box | effort | notes |
| --- | --- | --- | --- |
| **Väin live channels** `radio1965`, `live`, `user1..4` at `http://live.uuu.ee:8001/<ch>` | `ffmpeg -i http://...` in the container, plain HTTP is fine there | half a day | **Reading a mount makes us a listener on their server and in their statistics.** It is their own server and their own test, but each slot open is one connection, opened only while that slot is audible. Never read the channel we are pushing into: that is a feedback loop. `radio1965` was removed from the page stations list at the uuu.ee operator's request [code: demo/shell/radio-gran.mjs STATIONS comment]; ask before reading it |
| **a performer in a browser** | MediaRecorder Opus or WebM chunks over a WebSocket to the Caster, forwarded as a chunked HTTP POST into the container, `ffmpeg -i pipe:0` | two to three days | about 1 s of latency, fine for radio. WHIP into Cloudflare Stream then reading the HLS back is the alternative: more latency, Stream minutes on the bill, and the WHEP leg has a known VPN failure mode on the owner's side [CLAUDE.md]. WHEP from Stream into the container is possible because outbound UDP works [repo-measured], untested |
| **the Pi** | the board already sends its sound over the relay or a datachannel [code: bay.mjs TRANSPORTS audio rows]; the container would join as a relay room client | two days, needs the Pi on | not before the owner is back with the Pi |
| **uploaded files** (`workers/ingest`, R2 under `demo/ingest/<session>/`) | R2 public URL fetch from inside the container [repo-measured works] | half a day | caps and expiry are ingest's [code: workers/ingest/worker.mjs header] |
| **positron's relayed stations** (`workers/shout`: ERR, Ida, radio1965) | through shout's tee, one upstream per mount | half a day of code, **not to be done** without a decision | **every connection to an ERR mount lands in a public broadcaster's audience figures**, and ERR has already complained once; Ida is somebody else's server under the same rule [CLAUDE.md]. A cast runs unattended, so there is no person asking to listen at our end, which is what the consent flag on an `external` node stands for [code: scenery holds those links with `consent: true` and opens them only on a press]. Rebroadcasting a public broadcaster into another station also raises rights questions **[inferred]**. Keep out of the cast unless the owner decides otherwise in writing |

## 4. Video later

The same container class can produce the scan landscape picture and push it to
their nginx-rtmp at `rtmp://live.uuu.ee/live/<key>` (outbound TCP 1935 reachable
[repo-measured, to live.cloudflare.com]). The field is WebGL2 [code:
demo/radio/scenery/index.html:153, demo/shell/scan-field.mjs], so either headless
Chrome on llvmpipe in a `standard-4` sized container (the obs-cloud shape, about
190 per cent of a core, about $0.25 an hour **[computed]** from the rates above at
2 active vCPU and 12 GiB) or a CPU port of the field fed by the grain reports.
Their nginx-rtmp records everything it receives and the key `stream` takes over
their `video` channel [code: plans/plan-vain-videoradio.md section 5, Z6]. Effort:
three to five days after stage 2, plus their agreement on recording.

## 5. Dated steps to 2026-10-25

| date | step | done when |
| --- | --- | --- |
| Fri 10-16 | read the one hour copy-only survival run already in progress | it held for an hour, or the failure is named |
| Sat 10-17 | `{cmd:'queue'}` in the Caster; the crowd pad v0 (section 7) voting the next file | a vote changes the next file without cutting the current one, against `Rx` |
| Sun 10-18 | `workers/cast/container/`: Dockerfile, node server with slots, mixer, encoder, Icecast PUT; check `ffmpeg -encoders` has libmp3lame | the container alone puts a blended stream into `Rx` |
| Mon 10-19 | Caster `mode:'mix'`: start, `monitor()`, alarm, restart on exit, forward `set`; page controls for tune, drift, dwell, blend | the page moves the dial and `/listen/test` follows |
| Tue 10-20 | crowd pad drives `tune` | two phones drag, the stream follows the mean |
| Wed 10-21 | four hour run into `Rx`; read container CPU and memory from the dashboard; count gaps and drift | numbers written in PROGRESS.md |
| Thu 10-22 | with Väin's password, a short run into one `user` channel, headers checked by them (no notification, no recording) | Tarmo hears it in the app |
| Fri 10-23 | publish the pad page as a `webcontent` event (their editor, their hands) | opens inside the app on a phone |
| Sat 10-24 | freeze. Fallback rehearsed: `mode:'copy'` is one message away | both modes start from the page |
| Sun 10-25 | the test | |

### Risks

1. **The source password for a user channel is not given**, then nothing goes to
   Väin at all; `Rx` and `/listen/` still demonstrate. Ask now.
2. **A container host restart ends the broadcast.** Mitigated by restart on
   `monitor()` exit, not eliminated.
3. **Pacing drift** between node's clock and the listeners' players over hours.
   The copy caster paces against `Date.now()`; the mixer must do the same, not
   trust ffmpeg's output rate.
4. **Their files differ in sample rate or channels.** Decoding to one PCM format
   removes this for stage 1; it is what breaks (d1).
5. **Control latency is seconds, not milliseconds**: Icecast and the listener's
   player buffer several seconds **[inferred]**, so a dragged pad is heard late.
   Design the controls to move slowly.
6. **Runtime surprises on `PubNext`**: WebSocket through `getTcpPort` untested,
   hence HTTP for control.
7. **Somebody else's server**: reading their live mounts adds listeners; reading
   ERR is off the table.

## 6. Open questions

- Does an alarm reset a Durable Object's CPU allowance for a loop started earlier?
  The docs read name requests and WebSocket messages only. Matters only for (a).
- Does Väin's app keep playing the audio channel while a `webcontent` page is
  open in `WebViewPage.qml`? If not, the pad page has to play the stream itself
  (from our `/listen/` or a relay; their Icecast is plain HTTP and an https page
  cannot play it directly [code: workers/shout/worker.mjs comment]).
- Do their archive files share one sample rate and bitrate? Decides whether (d1)
  is usable as a zero CPU fallback.
- How does their Icecast treat a source that drops and returns within seconds,
  and do their listeners reconnect by themselves?
- Stage 2 CPU of scsynth plus one grain ring on a container vCPU: unmeasured. ANSWERED 2026-10-17 (lessons/workers-cast.md#grains):
  the whole container in grains mode is 23 per cent of a core locally and about 18 on Cloudflare, scsynth itself under 2;
  the cast runs at 0.5 vCPU / 1.5 GiB for every mode.

## 7. The collective audience: an X/Y pad every listener can drag

### What it is

A positron page, `/radio/crowd/` or similar, with one X/Y field. Every listener
who opens it can drag a point. Everyone sees all the points faintly and the
**collective point** strongly. The collective point drives the cast. It opens in
any browser, and inside Väin with zero app code as a `webcontent` event: their app
opens `webcontent` in `WebViewPage.qml` on QtWebView (WKWebView on iOS, system
WebView on Android) [code via plans/plan-vain-videoradio.md section 1, read from
their app]. Their feed already held a shelved `webcontent` event pointing at a
positron page [plans/plan-vain-videoradio.md section 0].

### How the pads reach the processing

- A new Durable Object `Crowd` per cast target, reached at a public
  `wss://cast.positron.studio/crowd/<target>`. No key: listeners are anonymous.
- It accepts sockets with the hibernation API (`acceptWebSocket`, as
  `workers/relay` does [code: workers/relay/src/index.js:129]), so idle sockets
  cost no duration.
- Each socket sends `{x, y}` at most 5 times a second (the page throttles; the
  object enforces 10 a second with a strike count and closes a socket that keeps
  overrunning, the relay's pattern [code: relay `STRIKES 50`, closes with 1008]).
- The object keeps one position per socket, ignores positions older than 10 s,
  and computes the **mean of the live pads**, then a **slow average** of that
  mean (an exponential with a time constant of about 3 s, so one fast finger
  cannot whip the stream around, and the seconds of Icecast latency feel
  intended). It broadcasts `{n, mean, slow}` to every socket 4 times a second
  while anything moves, and nothing while nothing does.
- It forwards `slow` to the Caster at most 4 times a second as an internal call
  carrying `{cmd:'set', name:'tune', v: slow.x}` and so on. The Caster treats it
  like any other control, so the owner's control page can override it
  (`crowd: on | off` in the Caster).

Cost **[computed from docs]**: 100 listeners each sending 5 messages a second for
an hour is 1.8 million messages, billed 20:1 as 90,000 requests, inside the
1 million included a month; above it, $0.15 a million.
https://developers.cloudflare.com/durable-objects/platform/pricing/

### What X and Y drive

| when | X | Y |
| --- | --- | --- |
| **today, copy only** | which file plays next: the field is a map of the archive (X by publish date, Y by length, each file a dot); the collective point's nearest dot is `queue`d when the current file ends | nothing else: a copy caster cannot blend |
| **stage 1** | the dial between the two loaded files, `tune` | the noise floor, how much static the crowd lets in |
| **stage 2** | grain `back` (how far into the ring) | grain `density` |

### Abuse limits

- One pad per socket, values clamped to 0..1, anything not two finite numbers is
  dropped.
- At most 10 messages a second per socket, then strikes, then closed.
- At most a few sockets per address (`cf-connecting-ip`), say 4, so one laptop
  with many tabs cannot outvote the room **[inferred]** as a sufficient bar for a
  festival test; no identity, no accounts, nothing stored past the session.
- A socket cap per object, say 500, refusing in words when full.
- The mean, not the sum, so the collective point never leaves the field.
- The control page's `crowd: off` takes the crowd off the dial at once.

### Patchbay

```
listener-<n>:pad:value-out (person)  --room-->  cf-crowd:mean:value-in   (engine, many links in)
cf-crowd:mean:value-out                          -->  cf-cast:tuner:value-in   (stage 1)
cf-crowd:mean:value-out-2                        -->  cf-cast:grains:value-in  (stage 2)
cf-crowd:mean:value-out (today)                  -->  cf-cast:queue:value-in
```

`value` is a light medium, so these are not heavy sessions; the wire is the
crowd object's own socket, a room shaped bus like the relay [code: bay.mjs
`state` rows say `room`]. The existing relay room could carry the pads instead,
but it caps at 128 sockets and never parses messages [code: relay `MAX_SOCKETS
128`, header], so the mean would have to be computed by a client. A dedicated
object is simpler and is where the limits belong.

### Effort and fit

- Copy-only version (pad page, `Crowd` object, `queue` command): **about one
  day**, fits before the 25th.
- Driving blend and noise: **half a day on top of stage 1**, fits if stage 1 does.
- The page and its card follow the concept page rules and the describe rules
  when built.
- The open question that decides how it feels in Väin: whether the app's audio
  keeps playing while the WebView is open (section 6).
