# workers-cast

Why `workers/cast` is shaped the way it is. Each `why:` pointer in the code names one heading below.

## `workers/cast/worker.mjs`

### rx-websocket

`Rx.ingestSocket()`: the test receiver takes its source over a WebSocket as well as a PUT.

MEASURED 2026-10-16 from this laptop: a chunked `PUT https://cast.positron.studio/ingest/test` with 8 MB
written over about 6 s reached the Rx object as **0 bytes** at every read during the upload, and as
8,000,000 bytes only after the request ended (the same with 40 kB over 3 s). The edge holds a streamed
request body until it ends, so a live source can never be a PUT through the zone. Inside a Worker the
old Caster could PUT to the Rx stub directly; a container cannot reach a binding, so it comes in over
the internet and needs a WebSocket. The first text message carries the PUT's header lines, so the
receiver checks the same `Authorization` and sees the same `ice-*` fields. Binary frames on that
socket are handled whether they arrive as an ArrayBuffer or a Blob, through one promise chain so a
Blob's await cannot reorder them: the first deploy fed `new Uint8Array(e.data)` and counted 0 bytes.

### live-rx-keeps-code

A redeploy did not reach the Rx object while the container held its socket: the object kept the
previous deploy's code (the Blob bug above) until the source was stopped and the object was let go.
The container itself rode through two worker redeploys without dropping its source.

### boot-retry

`Caster.up()`: each start gets 20 s to listen, then destroy, 2 s, and another start, three tries.

MEASURED 2026-10-16: the first deliberate kill (`destroy()`) was followed by a `start()` about a
second later that reported `running` and never listened for the whole 60 s window; the next start
listened in 1,731 ms. Gap on air: **123.4 s**. With the retry in place the second kill came back in
721 ms, on air **2.3 s** after the death (the receiver saw its mount without a source for 1.83 s).
Why the first start hung is not settled: research/cf-containers-next-2026-10-07.md saw a similar
release wait after a destroy on the legacy runtime.

### rx-resets

The test receiver is a Durable Object and it drops like one. MEASURED 2026-10-16 during the long run:
the Rx object restarted at 19:15:36Z and 19:32:06Z (its byte counter went back to 0 and `last` went
null), each time closing the source socket with 1006. The container reconnected in 0.1 s the first
time and 9.1 s the second (the first retry got no answer in 8 s), and its clock moved by the gap, so
the lag came back to about minus the 2 s lead with no burst. The container itself stayed up the whole
time (uptime 1,595 s at the 30 minute mark). A listener on `/listen/test` loses its stream at each
reset. That is a property of the stand-in receiver, not of the source: a real Icecast is a process.

### preview-icecast

`container/Dockerfile`, `container/server.mjs` (`iceStart`), `container/icecast.xml`: the `preview` target is a
real Icecast inside its own cast container, so a sound can be checked in the cloud before it goes to Väin.
Asked 2026-10-16: *"i need to work on sounds and etc and not ready to prevew them on uuu icecast. do i need a
reliable way to continious test before real streaming"*, then *"do 2"*. It replaces the `test` Rx on the page,
which restarted twice by itself (rx-resets above).

- The base is `node:22-alpine3.21` because its `apk add icecast` is **Icecast 2.4.4**, the version Väin runs
  (`/status-json.xsl` reports `server_id: Icecast 2.4.4`). Alpine 3.24 (`node:22-alpine`) ships 2.5.0. MEASURED
  2026-10-16 with `docker run ... icecast -v` on 3.24, 3.21 and 3.20.
- Icecast refuses to run as root, so node (root in the image) spawns it with the `icecast` user's uid and gid,
  read from `/etc/passwd`. The config is written to `/tmp/icecast` at boot with the source password from
  `ICECAST_PW` (the Caster passes `TEST_PW` through `start({ env })` only for a `local` target) and random
  relay and admin passwords nobody is told. If it exits, it is started again 1 s later and the exit is dated in
  `/status`.
- `<hidden>1</hidden>` on the mount also hid it from `status-json.xsl`, so `/status` read `mounts: []` while a
  source was on air. MEASURED locally; the mount is `public 0` and not hidden.
- The source is the same `icecastSink` that went on air on their radio1965, pointed at 127.0.0.1:8000.
- MEASURED 2026-10-16 after an image push: container up in 6,073 ms, on air at lag -1.8 s, Icecast reporting
  `/preview` since 20:08:46Z. The image grew from 165 to 171 MB.

### preview-listen

`Caster.listen()`: `GET /listen/preview` is answered by the `preview` Caster, which fetches
`getTcpPort(8000).fetch('http://c/preview')` and hands the body back. A container that is not running is a
503 JSON and is never started for a listener.

The worry was rx-websocket above: the edge held a streamed REQUEST body until it ended. A streamed RESPONSE
body from the container is not held. MEASURED 2026-10-16 with two listeners at once for 20 s each: first byte
at 395 and 397 ms, 72,800 and 75,600 bytes in the first second (Icecast's 65,536 byte burst), then 12,600 to
19,600 bytes every second after it (128 kbit/s is 16,000), 378,000 bytes each; mp3 44.1 kHz 128 kbit/s,
23.6 s of audio, mean -18.6 dB against -91.0 dB for a silence control. Icecast counted `listeners: 2`.

### queue

`Caster.command()` `queue`, `container/server.mjs` `queue()`: replaces what plays after the current file without
cutting it (plan-vain-cast-processing §2). The container sets `s.queue` to the new list and `s.index` to -1, so the
file on air keeps playing and the next one is `queue[0]`; `/status` carries `next` and `ids`. `play` still cuts.
Until 2026-10-17 a queue on a caster that was off air was refused (`not on air: start the cast first`). Since the
stored program (below) a queue is the program command: off air it is kept for START, on air it goes to the container.
Progress saved while `index` is -1 resumes at the top of the new queue.

MEASURED 2026-10-17 on `preview`: with *Driving along* at 18 s, `queue` [Kalle, Oriental analog] changed `next`
from *Evening rituals* to *Kalle* within one status tick while the current file kept counting 18, 19, ... 26 s;
`next` then put *Kalle* on at 1 s with *Oriental analog* as next.

A deploy did not reach the running `preview`: the Caster object and its container kept the previous code for
about four minutes after `wrangler deploy` (a container rollout reaches each object in turn; `user3`, idle, had
the new code at once). A container started by the old object kept the old image too, so `preview` was stopped and
started twice to carry the new `/queue` route. A new container takes the image of the object that starts it.

### program

`Caster.program()`, `status().program`: each station keeps its own program in DO storage (`program`, a list of
`{ id, title, url }` resolved from the feed), whether or not it is on air. Asked 2026-10-17: *"Why tuner controls are
only on preview? Can not program be related to each station? How to make ui more logical"*, then "Ok" to a station
list with the open station's cast, sound and program beside it. Before it a program existed only as the running
session's queue, so a station that was off had none and the page kept one shared list with a FOR picker.

- `{ cmd: 'program', ids }` stores it (an empty list clears it). Off air nothing else happens: no container, no
  `live()` read, nothing sent to their Icecast. `play` with no `ids` plays the stored program; `play` with `ids`
  stores them as the program and cuts to the top.
- On air the same edit goes to the container as `/queue`, ROTATED to start after the file now playing when that file
  is in the program, so the next file is the one after it in the list and the current file comes round last. A
  program that does not hold the current file is queued as it is.
- `queue` is the same command, so a page can send `queue` on air and `program` off air, as /radio/cast/ does.
- mode and set were already kept per Caster while off (`mix` in storage), used on the next start.

MEASURED 2026-10-17 on cast version 4f51dc8b: `program` [Kalle 2, Oriental analog] on radio1965 while off read back
from `/status/radio1965` with `running: false` and the line `program 2 files, plays on start`, then cleared. On
`preview`, a program of three stored while off, then `play` with no ids: on air in mix mode 8 s later with *Kalle 2*
now and *Oriental analog* next. A `queue` [Kalle 2, Driving along, Oriental analog] on air changed `next` to
*Driving along* within 2 s while *Kalle 2* stayed `now` and on air through six reads over 8 s.

## `workers/cast/container/mixer.mjs`, `decode.mjs`, `encode.mjs`, `mixcast.mjs`: mix mode

Stage 1 of plans/plan-vain-cast-processing.md, asked 2026-10-17 as *"Do also stage 1, verify"*: crossfades and
tuning noise between archive files, in the cast container. `mode: 'copy'` (the frame copier) is untouched and
stays the fallback; `mode: 'mix'` runs the engine below.

### mixer

The maths is `/radio/scenery/`'s, not a new design. `createMix` is imported from a byte for byte copy of
`demo/shell/tuner-mix.mjs` (`deploy.mjs` refreshes it before every deploy, because the image's build context is
`workers/cast`; `mixer-test.mjs` goes red if the two differ). `createTunerGraph` is a Web Audio graph and cannot
run in node, so it is ported sample by sample, and the port is graded against the real function: the test runs
`createTunerGraph` on a fake AudioContext that records every value handed to it (200 Hz highpass Q 0.7, 3500 Hz
lowpass Q 0.7, each leg's lowpass at the default Q 1, the 900 Hz bandpass at Q 0.9, delays 0.09 and 0.13 s,
feedback 0.35, output 0.8, the shaper curve point for point) and compares. The pink noise is `pinkNoise`'s loop,
compared sample for sample on one seeded `Math.random`. The slots are the scenery page's, 0.46 and 0.54.

What is not ported: the WaveShaper's `oversample: '2x'` (the curve is read with the same linear interpolation,
without the upsampling), and the per-sample `bright` frequency (coefficients move every 128 samples, Web Audio's
render quantum). The graph is mono after the highpass, as on the page (`channelCount: 1`, speakers downmix,
0.5 (L + R)), so the mix is mono, written to both channels of the encoder.

A dying echo tail is flushed to zero below 1e-20: the feedback loop decays forever otherwise, and the meter read
-866 dB for the last of it.

### biquad

`biquad()` is the Web Audio spec's own coefficient table, which is the Audio EQ Cookbook with one twist that is
easy to get wrong: a lowpass or highpass reads Q in DECIBELS (alpha = sin(w0) / (2 * 10^(Q/20))) and a bandpass
reads it linear. So Q 0.7 on the master lowpass is a 0.7 dB peak, |H(3500)| = 1.084, not a 0.7 linear Q;
the test asserts 1.0839 and, as a negative control, that it is not 0.7. Measured through both lowpasses in
series: -1.5 dB at 4 kHz, -9.7 at 5k, -17.5 at 6k, -30.5 at 8k, -51.9 at 12k.

### drift

`createEngine` keeps the drift's clock in AUDIO seconds (frames rendered), not wall seconds, so a stall in the
event loop never shortens a blend. The cycle is the page's: dwell on slot `from`, the next file opens into the
other slot `min(dwell / 2, 4)` s before the dwell ends (and its decoder is started 6 s earlier still), the dial
moves with smoothstep over the blend, and on landing the left slot closes. A file that runs out in its dwell
starts the blend at once. With the dial held (`drift 0`, which any `set tune` implies) an empty slot or one whose
file ended takes the next file, so both stations stay on the dial. Only about a minute of each file is heard per
cycle, so a file is decoded straight from its URL by ffmpeg with stdout paused past 8 s of PCM, rather than
downloaded whole: their host is asked for what is played.

MEASURED 2026-10-17 locally, two real archive files (*Driving along*, 102 s, and *Oriental analog*, 74 s, mono
128k, fetched once), dwell 20 blend 10, 90 s paced on the wall clock: landings at audio 30, 60 and 90 s; the
leaving slot's part fell from -21 to -50 dB across each blend while the arriving one rose from -37 to -21; the
noise meter sat at -41.5 to -42 dB on a slot and peaked at -27.3 to -28.1 halfway; in the output the 1.5 to
3.5 kHz band (where the noise lives after the band) went from about -40 to -26 dB in each blend. out.mp3: valid
mp3, 92.0 s (90 s plus the 2 s lead), mean -18.9 dB against -91.0 dB for a silence control, max -2.7 dB. The
first second was empty until `engine.ready()` was added: the clock now starts when the first slot holds a second
of sound (53 ms locally, 405 ms in the container from their host).

### mix-pacing

`mixcast.mjs` paces the ENGINE against `Date.now()` (`createClock`: blocks owed are wall time plus a 2 s lead,
the copy caster's lead), and the encoder output is written to the source as it comes. ffmpeg's output rate is
never the clock (plan Risk 3). A sink that drops moves the clock by the time it was down, so a reconnect never
bursts. The encoder runs with `-flush_packets 1`, or ffmpeg's 32 KiB output buffer holds two seconds of MP3.

MEASURED 2026-10-17, `node workers/cast/mixer-test.mjs --live 60`: 61.960 s made in 60.002 s, so made minus wall
minus lead was -42 ms (the whole-block floor plus one 20 ms tick), ahead of the wall between 1.963 and 2.000 s
throughout, first MP3 frame 37 ms after the start, node at 3.0 % of a core (the two decoders and LAME are
separate processes). The 90 s real-file run: -43 ms, 3.6 %, 95 MiB RSS.

## `workers/cast/worker.mjs`: their streams

### live

`GET /live` and the Caster's refusal: whether Väin's own stream is on a channel, from the `livestream` events their
Icecast on-connect hook publishes (status `new`, url `http://live.uuu.ee:8001/<channel>`) and on-disconnect
unpublishes. Asked 2026-10-17: *"All channels are equal ... some of them can be on air because of us, and others
are just the Vain team is streaming it. So differentiate that somehow."*, then *"Maybe we should check more
often."* One `events()` read serves both `/feed` (kept 60 s) and `/live` (15 s), cached in `caches.default` and
collapsed per isolate by one in-flight promise, asked only when a page or a command asks, never by an alarm.
Their Icecast is never asked. Our own cast also publishes such an event, so on the page our caster's `onAir` wins
(`positron`) and an event otherwise means `Väin`. A play on a channel with their event is refused by the Caster
(`Väin is streaming here: <title>`) before a container starts; their Icecast would answer 403 anyway. A stale event
(an on-disconnect hook that failed) reads as their stream until they unpublish it; that is not detectable without
asking their server.
