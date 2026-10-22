# workers-cast

Why `workers/cast` is shaped the way it is. Each `why:` pointer in the code names one heading below.

## `workers/cast/worker.mjs`

### cap

`Caster.command()` `play`, `extend`, `alarm()`; `/radio/cast/` STOPS and EXTEND. Every start stores
`until = now + 2 h` in the wanted session, and the alarm stops the station through `stop()` (the same path as
`stop`, which destroys the container) once `Date.now() >= until`, dated in `stopped` as `stopped at the cap`.
Asked 2026-10-17: *"Stop defaul casting let me do it"*, *"You were wasting my money with ghost stations"*: a
`test` station nobody could see on the page had been casting for hours, and agents had left `preview` on air.
Then "Yed" to a 2 h self-stop per station shown on the page with a way to extend, and to removing `test`.

- `until` lives in storage, so a restarted object and a restarted container keep it: a death goes through
  `died()` and `bring()`, which never touch `want.until`. A session from before the cap has none and is
  measured from `startedAt + 2 h`. The alarm is set at `min(now + 30 s, until)`, never in the past.
- `{cmd:'extend', ms}` sets `until = now + ms`, clamped to 15 min .. 14 days; off air it is refused. 14 days since
  2026-10-19, asked for a 3 to 4 day run on radio1965 (*"i need to run for 3-4 days"*, *"it can be more days"*), was 12 h; the page has no
  extend, `node workers/cast/extend.mjs <station> <hours>` sends it. A start stops 7 days on since 2026-10-19 on every station, one constant (`CAP_MS`, was 2 h), asked as *"i can not do it at
  that time. i need it fixed now"*, then *"and user1..4 ?"*, *"preview ... 2 hours -> 7"*, *"jsut keep same constant on all"*. MEASURED on preview: two starts 22 s and 56 s after the
  deploy still stopped 2 h on (the object was on the old code), one 6 min after stopped 7.000 days on. Durable
  Objects take a deploy in an eventually consistent way, so a change to a start is checked minutes later, not at once.
- `play` takes `capMs` (60 s .. 14 days) through the keyed socket only, so a check can start a station that ends
  itself in a minute without a lower floor on `extend`.
- An alarm that finds a wanted session for a target that no longer exists stops it, so removing a target
  cannot leave a container restarting itself.

MEASURED 2026-10-17 on `preview`, cast version 26460d1c: `play` with `capMs: 60000` at 13:05:26, `until`
13:06:26, on air from the first read; `stopped at the cap` dated 13:06:26Z and the next read (13:06:27) had
`playing: false` and `container.running: false`. A default start read `until` 120.0 min after `since`;
`extend` 15 min moved it to 13:21:36, 4 h to 17:06:38, and 60 s was clamped to 15.0 min from now. A `kill`
brought the source back in 2.7 s on a new boot with the same `until`.

`test` and its receiver went the same day: `/status/test` and `/control/test` answer 404 `no target test`, and
the Rx class was deleted with a `deleted_classes` migration (v2) because it kept nothing in storage. The
container's `wsSink` for a `kind: 'ws'` target is still in `container/server.mjs`; nothing names it.

### rx-websocket

Retired 2026-10-17 with the Rx class (see cap above); kept as the record.

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

### drive

`DRIVE = 0.5` and `SAT_K = 1.2` in `demo/shell/tuner-mix.mjs` (and its copy), used by `createTunerGraph` and by
`createTuner` alike. Asked 2026-10-18 on `/radio/cast/`, the local station in mix: *"mix has this annoying
clipping sound on kalle 1 2 and driving "prõgisemine" in estonian. what to do? granulator washes it away"*.

Until then the band went straight into tanh(2.2x) / tanh(2.2): a small-signal gain of 2.25 (+7 dB, then 0.8 out,
+5.1 dB overall) with the curve's flat top at 1. MEASURED 2026-10-18 on the five archive files, fetched once each
through `/file/<id>` and decoded to float (no clipping in the decode), in node through an instrumented copy of
`createTuner` that matched the real one to 6e-11:

| file | source rms | source peak | 1 s rms into the shaper, median | distorted moments / min | THD | out rms |
| --- | --- | --- | --- | --- | --- | --- |
| Kalle | -14.2 dB | +0.1 dBFS | -15.4 dB | 242 | -17.7 dB | -12.1 dBFS |
| Kalle 2 | -13.0 dB | +0.6 dBFS | -14.9 dB | 258 | -19.1 dB | -10.7 dBFS |
| Driving along | -19.5 dB | -5.9 dBFS | -27.9 dB | 96 | -28.1 dB | -23.0 dBFS |
| Evening rituals (control) | -24.0 dB | -0.3 dBFS | -30.3 dB | 40 | -19.6 dB | -19.8 dBFS |
| Audio test (control) | -26.3 dB | +0.4 dBFS | -28.9 dB | 46 | -28.5 dB | -23.5 dBFS |

A distorted moment is a 2 ms window where the output departs from the small-signal line by more than 10 per cent
of the signal (residual over linear above -20 dB), counted once per 20 ms; THD is the residual against a best
fit gain per 2048 samples. The three files reported are the three highest, and only those. Two causes:

- Kalle and Kalle 2 are hot, limited masters (12,240 and 11,416 samples at or over 0.9, 57 and 56 flat topped
  runs in the file itself), and the highpass's phase rotation lifts their band to +6.1 dBFS at the shaper, so
  7,635 samples in 108 s sat on the curve's flat top in the real engine and every transient was squashed.
- Driving along is not hot but is 82 per cent energy under 200 Hz and very peaky in the band (rms -27.9, peak
  -3.3, a 25 dB crest): the highpass takes the bass away and its percussive clicks (1.5 ms bursts in 2 to 6 kHz,
  rhythmic at 645 ms, the same in all three files) reach the knee alone. The band also lifts the 2 to 3.5 kHz
  share of its energy from -24.4 dB in the file to -13.7 dB in the mix (Kalle +4.6, the controls +1.9 to +2.9).

What it is NOT: the output never passed full scale (peak 0.8, -1.9 dBFS, so the int16 cast, LAME and the
browser's destination never clip); the sum of two slots plus noise never passed 1 before the shaper in a blend;
the chain added no impulsiveness of its own (kurtosis of 2 to 6 kHz per 50 ms frame, median: Kalle 9.2 in the
file, 6.8 out; Driving 55.2 in, 29.5 out). A slow cut-only leveller before the shaper (target mean |x| 0.06,
0.5 Hz detector) was tried in the model and refused: Kalle only went from 242 to 154 moments a minute, Driving
not at all (its rms is low, its peaks are not), and it pumped 3.7 dB a second.

After, same files: Kalle 22 a minute (-91 per cent), Kalle 2 22, Driving 0, Evening 0, Audio test 0; THD -33.7,
-35.8, -48.0, -36.1, -48.9 dB; 0 samples on the flat top in the real engine over 10 minutes; at most 2 samples per
file reach the curve's end. The cost is level: the small-signal gain is now -4.8 dB, so a quiet file comes out
about 10 dB quieter than before (Audio test -33.1 dBFS rms) and a hot one about 8 dB (Kalle -20.4). Fixed
headroom cannot keep the old loudness: with the output at 0.8 any gain that keeps quiet files as loud squashes
hot ones. A makeup gain after the shaper with a limiter is the next step if the mix reads too quiet. Grid of
(drive, k): (0.5, 1.5) 71 a minute on Kalle at -3.6 dB; (0.6, 1.2) 60 at -3.2 dB; (0.45, 1.0) 2 at -6.5 dB.
NOT HEARD: nobody listened to the after; the proxies above are all there is.

`mixer-test.mjs` holds it: the master lowpass reaches the shaper only through one gain of DRIVE, a full scale
1 kHz tone comes out under -26 dB THD+N (-29.4 measured), and two negative controls (drive 1 and k 2.2 give
-13.3 dB; a -26 dBFS tone gives -80.5 dB).

### whistle

`WHISTLE = false` in `mixer.mjs` and in `demo/radio/cast/local.mjs`, compared by `local-test.mjs`. Asked
2026-10-18: *"this annoying policecar like siren (transition). hate that"*. It is the off-tune carrier's beat
that `createMix` puts between stations (pitch 150 + 40000 * distance Hz, up to 3200), which is what an AM dial
does and what `/radio/tuner/` and `/radio/scenery/` keep. The cast's engine renders with `{ whistle: false }` and
the local engine applies the graph with it. MEASURED across one 16 s blend with silent files and noise 0, so the
output is the whistle alone: -27.6 dBFS rms before, the tap at -30 dB through the middle 10 s; after, digital
silence and no tap in any second.

### level

`gains.mjs`, `measure-gains.mjs`, `levelOf` in `mixer.mjs` and `demo/radio/cast/local.mjs`, the decoder's `UPMIX`. Plan step 1
of plans/plan-cast-reinterpret.md section 2.1, after `### drive` found Kalle and Kalle 2 about 10 dB hotter than the rest:
every file is brought to one loudness BEFORE the tuner, by a gain per feed id, the same number in the same place in both
engines (the container scales the slot's decoded samples, the page puts a GainNode right after the media element source).
Copy mode is not levelled in either: the container's copy is the MP3 frame copier, so the page's copy taps the slot before
its level too.

The target is -23 LUFS (EBU R128), measured as the tuner hears a file: a mono file at unity, a stereo one 0.5 (L + R), with
ffmpeg's ebur128 on that mono signal. -23 is about the median of the archive measured this way (-23.9), so
the hot files come down 8 to 9 dB and most quiet ones go up under 4 dB; a louder target (-18, Oriental analog) would
have pushed the quiet files 5 dB into the knee that `### drive` just took the hot ones out of. The gain is clamped to
-14 / +12 dB so a near silent file (the two 15 s clip tests at -44 and -38 LUFS) is not blown up past +12. A feed id with no
row plays at 0 dB and has `UNMEASURED` to say why. `node workers/cast/measure-gains.mjs` measures every feed id with no row
(each fetched once through `/file/<id>`, never their host) and writes `gains.mjs`; `--all` measures again, `--dir` reads
`<id>.mp3` files already on disk. `/feed` serves `gain`, `kind` and `kindConf` per item, and every queue the Caster posts to
the container carries `gain` from the table, a queue stored before the table too.

MEASURED 2026-10-18, 13 of the 14 feed files (the 14th, *Väin on user1*, came back from `/file/` as 200 with 0 bytes):

| file | LUFS | true peak dBFS | gain dB |
| --- | --- | --- | --- |
| Kalle 2 | -14.1 | +1.2 | -8.9 |
| Kalle | -14.8 | +1.0 | -8.2 |
| Oriental analog | -18.2 | -0.4 | -4.8 |
| Evening rituals | -21.6 | +0.1 | -1.4 |
| Driving along | -21.7 | -5.6 | -1.3 |
| EMA kontsert Varssavis | -23.7 | -0.9 | +0.7 |
| EMA salvestab Varssavis (13-16) | -23.9 | -1.6 | +0.9 |
| EMA Varssavis | -24.2 | -3.2 | +1.2 |
| Poorisvool | -24.6 | +0.2 | +1.6 |
| Audio test | -26.8 | -2.6 | +3.8 |
| EMA salvestab Varssavis (12-28) | -29.2 | -6.3 | +6.2 |
| Clip test (19:44) | -37.8 | -15.3 | +12 (cap) |
| Clip test (19:39) | -44.1 | -24.4 | +12 (cap) |

Through the real `createTuner` (drive 0.5, k 1.2), dead on slot a, up to 300 s of each file, before and after: distorted
moments a minute (a 2 ms window more than 10 per cent off the same chain run linear, once per 20 ms) Kalle 18 to 0, Kalle 2
30 to 0, Driving along 0 to 0; THD against the linear chain Kalle -29.0 to -44.6 dB, Kalle 2 -30.3 to -47.3. The quiet files
that go up: Audio test 0 to 1 a minute and THD -42.2 to -35.0 dB (+3.8 dB of gain); Poorisvool, EMA (12-28) and a clip test 0
to 0, THD at -39 dB or lower. No file put a sample on the curve's flat top after (Kalle had 2, Kalle 2 had 1 before). Output
rms before -19.2 to -50.1 dBFS, after -27.6 to -39.3 (the clip test -38.2): the hot files are now about 8 dB quieter on air.
NOT HEARD: nobody listened to the before or the after.

The decoder was not giving the tuner what the browser gives it, found while measuring: ffmpeg's `-ac 2` puts a mono file at
-3 dB in each channel (MEASURED: Kalle -15.14 dB rms decoded that way against -12.13 dB as mono), where the browser's mono
media element reaches the graph at unity, so every mono file (9 of the 13) was 3 dB quieter on air than in LOCAL. The decoder
now upmixes with `pan=stereo|FL=FL+FC|FR=FR+FC` (a mono file to both channels at unity, stereo untouched; checked on the cast
image's ffmpeg 5.1.9 as well as 9.0) and reads f32le, because a hot master at unity passes full scale and s16 would clip it.
`mixer-test.mjs` holds both, with ffmpeg's own upmix as the negative control.

### kind

`kind.mjs`, run by `measure-gains.mjs` on every file it measures. Asked 2026-10-18: the owner says most of the archive is
people talking or field recordings, not music; tag each file speech, field or music with a confidence, from measured
features, and say ambiguous rather than force it. Features of the tuner's mono signal at 16 kHz (the whole file up to 10
minutes, else twenty 30 s pieces spread over it): `tonal`, the share of active frames holding a spectral peak 300 Hz to 4 kHz
on one bin for 200 ms (held notes, drones; speech glides off a bin); `gaps`, short silences (50 to 500 ms, 15 dB under the
median) a minute; `flat`, the flatness of the pink-whitened spectrum (formants make it low); `depth`, `syll` and `beat` are
kept in the row but decide nothing. Music is T = ramp(tonal, 0.08, 0.18), speech S = ramp(gaps, 25, 55) times
(1 - ramp(flat, 0.06, 0.14)), and the split is music T, speech S (1 - T), field (1 - T)(1 - S); under 0.65 it reads ambiguous.

`syll` (the 3 to 6 Hz envelope modulation) was tried first and does not separate anything here: macOS `say` speech read 1.23,
pink noise 1.17, the archive 0.22 to 0.79. Spectral flatness on the raw spectrum gave pink noise 0.34 and every real field
recording under 0.07, because a real room or car is all low end. The first classifier, built on those two plus a pitch
detector's voiced share, called the EMA concert speech. Controls on the final one: `say` speech 1.0 speech, pink noise 1.0
field, a tone melody 1.0 music; `say` speech with pink noise about 15 dB under it reads ambiguous (0.54 field), and about
6 dB under it 1.0 field. So speech in a noisy field recording reads as field, and a voice over a held drone would read as music.

MEASURED 2026-10-18: music Kalle, Kalle 2, Oriental analog, the four EMA files (tonal 0.19 to 0.64) and Audio test (0.75,
tonal 0.155); field Driving along (gaps 2.4 a minute, tonal 0) and Poorisvool (gaps 15.6, flat 0.148); speech the two clip
tests (gaps 65 and 57 a minute, conf 1.0 and 0.7); Evening rituals ambiguous (0.6 speech, gaps 61, flat 0.092). This does
not agree with "most of it is talking or field recordings": by these numbers 8 of 13 files hold notes. The ramps were set
after looking at these 13 files and at 20 s spectrograms of each, so they fit this archive and are not validated on any
other; nobody listened.

### soften

`demo/radio/cast/soften.mjs`, copied to `container/sc/radio/cast/`, run by `mixer.mjs` on a slot whose item has `soften` and by
`local.mjs` as the `cast-soften` AudioWorklet. Asked 2026-10-18, after the levelling: *"nothing to do with the noise on drviign
and kalle?"*, with Driving along's 1.5 ms clicks at 2 to 6 kHz on a 645 ms beat (`### drive`) and Kalle and Kalle 2 hot limited
masters. `gains.mjs` carries `soften: true` on those three ids by hand (`measure-gains.mjs` keeps it across a measure), `/feed`
serves it, and every queue the Caster posts carries it.

The stage sits after the file's level and before the tuner in both engines: a de-clicker, then a one-pole low-pass at 3 kHz.
The de-clicker hears a 2 kHz highpass; when its fast envelope (instant attack, 0.5 ms release) passes 4 times its slow one
(30 ms) plus 0.003, a duck closes for 2 ms past the last trigger (0.2 ms attack, 3 ms release) and the sound crossfades to its own
1 kHz low-pass. The sound leaves 1 ms (44 samples) late so the duck is closed when the tick arrives. It is per sample with no
block size in it, so the page's worklet (128 frame quanta) and the container (882 frame blocks) are the same function, and
the page's file is mono in and out (`channelCount 1, speakers`, the 0.5 (L + R) the container's decoder makes).

The first two designs did little and are why it crossfades: subtracting the 2 kHz highpass during a duck left most of a 4 kHz
tick, because the highpass's phase at 4 kHz makes x minus HP(x) far from zero (7.6 dB on a synthetic tick); a 4th order 1 kHz
highpass the same (short clicks 645 to 585 a minute on Driving along). The crossfade to a low-pass has no such cancellation.

MEASURED 2026-10-18 through the real container engine (`createEngine`, slot a held, noise 0, the files' own gain), first 100 s
of each, scratchpad `soften/final.mjs`. Short clicks: the 2 to 6 kHz band's 0.5 ms rms over 10 times its 200 ms median, back
under 3 times within 3.5 ms. Transients: the band over 6 times its 200 ms median (the `### drive` burst rule).

| file | short clicks / min | their energy dB | 2 to 6 kHz transients / min | transient energy dB | 2 to 6 kHz band dB | output rms dB |
| --- | --- | --- | --- | --- | --- | --- |
| Driving along | 604 to 64 | -51.2 to -73.1 | 1198 to 298 | -48.8 to -63.0 | -47.4 to -55.6 | -33.9 to -34.0 |
| Kalle | 433 to 141 | -53.1 to -69.9 | 802 to 352 | -44.5 to -53.0 | -43.2 to -49.8 | -28.9 to -29.0 |
| Kalle 2 | 400 to 68 | -52.8 to -72.6 | 1076 to 417 | -48.7 to -55.1 | -44.8 to -49.2 | -27.8 to -27.8 |
| Evening rituals (not marked, what it would do) | 73 to 6 | -56.8 to -70.1 | 1071 to 611 | -41.8 to -48.8 | -39.4 to -44.8 | -28.5 to -28.7 |

NEGATIVE CONTROL, same script: each of the four files without `soften`, through the engine before this change (`git show
HEAD:workers/cast/container/mixer.mjs`) and the engine now, 0 of 8,820,000 samples differ; with `soften` 8.76 to 8.81 million
differ. `mixer-test.mjs` holds it (soften false and absent are the same samples, a synthetic tick 26.9 dB down in 2 to 6 kHz),
`local-test.mjs` the page's wiring (a plain file never meets a worklet), `live-test.mjs` the two functions (the worklet source
run in a fake scope against the container's, every sample equal) and `live-test.mjs --browser` the real thing: Chrome's
AudioWorklet in an OfflineAudioContext, 132,300 samples, 0 differ. NOT HEARD: nobody listened to the after.

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

## `workers/cast/container/grains.mjs`, `grain-patch.mjs`, `Dockerfile.grains`: grains mode

Stage 2 of plans/plan-vain-cast-processing.md, asked 2026-10-17 as *"Also do stage 2"*: the stage 1 mix through
`/radio/scenery/`'s grain ring, in the cast container. `mode: 'grains'` beside copy and mix; copy stays the fallback.

### grains

The program is the page's, not a port: `container/sc/` holds byte for byte copies of `demo/granulator/grain-ring.mjs`,
`demo/shell/sclang-lite.mjs`, `synthdef.mjs` and `scsynth.mjs` (the last only because grain-ring imports it; nothing in
it runs at import). `deploy.mjs` refreshes them, `grains-test.mjs` goes red when they differ. `compile(PROGRAM)` runs in
node with no DOM and no shim (4925 B, the same bytes the page sends to its wasm scsynth).

The chain, every process a JACK client of one `jackd --no-realtime -d dummy -r 44100 -p 2048`:
node (the stage 1 engine, s16le stereo) -> `jack-stdin` -> `SuperCollider:in_1,2` -> scsynth (`/b_alloc` 8 s mono,
`/d_recv`, `/s_new gring` with `inbus 2`) -> `SuperCollider:out_1,2` -> `jack-stdout` -> node (meter) -> LAME as in
stage 1. `ffmpeg -f jack` exists in Debian's ffmpeg but is an INPUT device only, so it cannot feed scsynth; Debian's
`jack-stdio` package has both directions, and using `jack-stdout` for the tap keeps `encode.mjs` unchanged. JACK is the
clock here, not `Date.now()`: node writes as fast as `jack-stdin`'s pipe drains (bounded at 3 s ahead of the wall),
and the MP3 leaves as LAME makes it. A patch is `/n_set` on node 4000; a patch by name also sends the page's `land()`
(`sync` 1 then 0). OSC replies are parsed with `d` (float64) as well, because `/status.reply`'s rates are doubles.

MEASURED 2026-10-17 locally (OrbStack, arm64, `--cpus 1 --memory 3g`), two real archive files (*Driving along*,
*Oriental analog*), dwell 25 blend 10, 90 s each, run twice at once: patch Cloud wet (`mix 1`) and dry (`mix 0`).
- xruns by JACK period over 20 to 40 s: 512 frames 13, 1024 frames 5, **2048 frames 0** (and 0 over both 90 s runs).
  A period is latency nobody hears on a broadcast, so 2048 (46 ms).
- drift: lag (wall since the first MP3 frame minus MP3 seconds) -1.02 s at 10 s and -1.02 s at 90 s, 0.00 s over
  80 s; the dry run -1.00 to -1.01. The -1 s is the pipes filling at start, then flat.
- CPU over 80 s, per cent of one core: node 9.0, LAME 4.6, jack-stdout 4.3, jack-stdin 2.6, scsynth 1.7 (its own
  `/status` said avg 2.9), jackd 0.1, the decoders 0.1; container (cgroup) 22.8. Dry 20.4. Memory: container 318 MiB
  wet, 218 dry (jackd and scsynth each show about 128 MiB RSS, most of it the shared JACK segment, counted in each).
- out.mp3 valid, 88.6 s, mean -23.0 dB, max 0.0 dB with 81 samples at full scale (Cloud's `amp 1.5`; the page's
  output clips the same way); dry -18.8 / -3.2; a silence control -91.0.
- grains on against off, same files, same windows inside the dwells: spectral flux 0.39 against 0.20 to 0.24, and the
  50 ms envelope correlates with the dry one at 0.11, 0.45 and -0.10.
- `/n_set tone 600` at 60 s (Cloud's tone is 9000), read back 600 by `/s_get`: centroid 1293 Hz before, 382 after;
  the dry run over the same windows 1615 to 1581 (the files did not do it).
- 41 grains a second reported by `SendReply` (Cloud's density is 40).

### grains-image

`Dockerfile.grains` is node 22 on Debian bookworm slim: ffmpeg 5.1.9 (libmp3lame), supercollider-server 3.13.0,
jackd2 1.9.21, jack-stdio 1.4, icecast2 2.4.4 (the version Väin runs, as alpine 3.21's was). Three links give
`server.mjs` the alpine names it reads (`icecast`, `/usr/share/icecast`, a user `icecast`), so the preview Icecast
starts unchanged. It is the cast image for every mode since 2026-10-17: one image keeps a mode switch one POST to the
running container with the preview Icecast and its listeners untouched, where a second image would mean a container
restart on every switch between grains and the rest. MEASURED before switching, in the Debian image, through
`server.mjs` into its own preview Icecast: copy, mix, grains, a patch, grains with a new patch, copy again, each heard
on `:8000/preview`, and after the last switch no jackd or scsynth left running.

### grains-size

`CAST_INSTANCE` went from 0.25 vCPU / 1 GiB to 0.5 vCPU / 1.5 GiB (the 3 GiB per vCPU floor), for every mode, because
the size is fixed at start and grains measured 23 to 25 per cent of a core with everything on.

### caster-keeps-code

A deploy did not reach the `preview` Caster for about four minutes after its container was stopped: `{cmd:'mode',
mode:'grains'}` was answered by the previous code's `mode is copy or mix` every 15 s until the object was let go.
A status poll every 15 s did not keep it from going in the end.

## `demo/radio/cast/local.mjs` and `GET /file/<id>`: LOCAL, a station's sound tried in the browser

Asked 2026-10-17: *"How can I preview my grain and stuff if the station is off? ... Only I have an archive file."*,
then yes to a local preview with the same tuner and grain ring on the archive files, driven by the same SOUND
controls, free, nothing on air, and *"I wand rapid iterations on sound"*.

### local

`createLocal` is the container's mix mode rebuilt out of the page's own parts, not a third design: the tuner is
`createTunerGraph` itself (the graph the container's `createTuner` was ported from and graded against), the drift
clock is `mixer.mjs`'s `createEngine` clock line for line in the AudioContext's audio seconds (dwell, preroll
`min(dwell / 2, 4)`, the 6 s prefetch, smoothstep over the blend, landing; the held dial; a file that ends in its
dwell starts the blend), `noise` scales the mix's noise as the container does, and the grains are `createRingEngine`
on wasm scsynth with the same PROGRAM and compiler the container hands its native scsynth. The context runs at
44100 Hz, the container's rate, so the biquads and the ring's 8 s buffer are the same numbers. Its constants
(SLOTS, DEFAULTS, LIMITS, PATCH_LIMITS, the two clamps) are copies, and `workers/cast/local-test.mjs` compares them
with the container's on 27 inputs (sabotaged: a moved slot and a wider dwell take 3 red). Copy mode plays the slot
on air straight to the output, file after file; the container's copy is the MP3 frame copier, so locally it is the
decoded file, the same sound.

Where the two are not the same sound, by construction:
- grains: wasm scsynth in an AudioWorklet against native scsynth under JACK; same synthdef bytes, different random
  streams (Dust, TRand), so no two runs are sample-equal either way;
- the tuner: the browser has the WaveShaper's `oversample: '2x'` and per-sample filter automation, the container
  neither (mixer.mjs, `### mixer`);
- the files: the browser decodes them stereo and the graph's highpass downmixes 0.5 (L + R); the container decodes
  to mono with ffmpeg first. The echo leg's delay runs stereo until that point, which is linear, so the same;
- one patch edge: a patch by name keeps the previous wet (`mix`) in both, while the page's wet slider shows 1.

Each file is an `<audio crossOrigin="anonymous">` through `createMediaElementSource`, so a long file streams
rather than being decoded whole into memory (an hour at 44.1 kHz stereo float is 1.3 GB), and it needs CORS, which
their host does not send: hence `/file/<id>`. Nothing is made until START; a press on LOCAL, LISTEN or a prelisten
stops the other two, and choosing another station stops LOCAL.

MEASURED 2026-10-17, headless Chrome, `scratchpad/loc/inpage.js`, files from a CORS stand-in, a worklet tap on the
output computing 1000 Hz Goertzel energy and the mean square every render quantum (128 frames, 2.9 ms):
- a `set tune` (0.46 to 0.54 and back, slot a silent, slot b a 1000 Hz tone, noise 0), six moves: the band leaves
  its baseline 2 quanta (5.8 ms) after the call going up, 4 to 5 quanta (11.6 to 14.5 ms) going down; half the
  change at 14.5 to 26.1 ms, which is the 0.04 s time constant both the page and the container use. Wall clock
  from the call to the quantum that showed it: 6.4 to 16.2 ms. Output latency on top: base 5.4 ms, output 16 ms.
- a grain `tone` move (300 and 20000 on a steady patch): the band steps within 0 to 1 quantum, by 20 dB.
- grains up 573 to 631 ms after the first switch to grains (once per page); `mode` switches after that are gain
  gates with a 5 ms constant.
- the tuner's output against the page output, correlation over 2048 samples, ten reads: mix 1.0; grains (Cloud,
  wet 1) -0.15 to 0.09; mix again 1.0 in nine of ten.
- a patch switch (Cloud to Dub) in grains: 30 windows of 50 ms after it, -27.9 to -33.8 dB against -32.3 at worst
  before: no gap.
- the clock on the two archive files, dwell 5 blend 3: one landing in 12 s, phases dwell and blend, both files
  advancing; level -13 dB.

The first check measured nothing: `performance?.now?.()` inside the AudioWorklet throws, because `performance` is
not declared in that scope at all and optional chaining does not cover an undeclared name, so the tap died on its
first quantum and every onset read null. And the first latency numbers (8 to 14 quanta) were the threshold sitting
in noise: a 128-sample Goertzel at 1000 Hz picks up a 440 Hz tone in the other slot and the tuning noise. With slot
a silent and noise 0 the onset is the 2 quanta above.

### file

`GET https://cast.positron.studio/file/<id>`: one archive file with `access-control-allow-origin: *`, for LOCAL. The
id is resolved through `feed()` (their audio on eccm.ee and uuu.ee, cached 60 s), so the route is an allowlist and
never fetches a URL a caller names; an id not in the feed is a 404, and a feed URL with a port is refused, so it can
never reach their Icecast on 8001. A hit is `caches.default`, which answers a `Range` itself (206 from the whole
file it holds). A miss fetches the file once with `cf: { cacheEverything, cacheTtl: a year }` and tees it: one half
into `caches.default` with `cache-control: public, max-age=31536000, immutable`, the other to the caller as a 200
even to a Range, which a media element takes. Archive files do not change, so one upstream fetch per file per colo,
about ever. `content-type` is forwarded, never invented.

MEASURED 2026-10-17 on the deploy, *Driving along* (`evt_1791874248959`): first request 200, `x-cast-cache: miss`,
1,630,223 bytes, `audio/mpeg`; second 200, `hit`, the same bytes (cmp); `range: bytes=1000-1999` 206,
`content-range: bytes 1000-1999/1630223`, `hit`; an unknown id and `..%2Fx` 404.

### ghost-input

`demo/radio/cast/local.mjs`, the ghost player. The layers hear a second file on scsynth busses 4 and 5
(`bootScsynth({ inputChannels: 4, input: inputPairs(ctx, [toGrains, ghostOut]) })`, lessons/kit-scsynth.md
#input-channels). `inputPairs` splits each feed with a ChannelSplitter, which is `discrete`: a mono feed
would land on the left channel only and the ring, which reads `Mix(In.ar(2, 2)) * 0.5`, would drop 6 dB.
So both feeds are set to 2 channels, `explicit`, `speakers`, and a mono file is upmixed before the split.

## `workers/cast/container/live.mjs` and the worker's live only stations

Asked 2026-10-18: *"do server version"*, then *"rm copy mix and grains, arvhice. keep live only"*. The page's live mode
(`demo/radio/cast/index.html`: `lifeTick`, `layersFor`, `layerTick`, `ghostTick`, `pulse`, `onsetTick`, `step`) runs in
the cast container, on air, and it is the only mode a station plays.

### live-container

What runs where. The container runs `life.mjs`, `layers.mjs`, `soften.mjs` and `hand.mjs` unchanged (`sc-files.mjs` lists
them, `deploy.mjs` copies them under `container/sc/`, `live-test.mjs` and `grains-test.mjs` go red when a copy differs).
`startLive` is `startGrains` with four scsynth inputs and a driver on a 50 ms timer, the page's driver line for line with
two clocks swapped: a scene's time is the mix clock (`engine.seconds`, the landing read off the engine's `cycleFrom`, the
blend's start `cycleFrom + dwell`), and the pulse stays on the wall's `setTimeout` as on the page. The six layer programs
load into the same native scsynth as the ring through an adapter (`chain.ask` as `sendAndWait`), the layers at the head
of the group, the room at the tail. The key is a chroma of the tuner's own last 8192 samples read once a tick from 1 to 5 s
into a scene, built as the page's AnalyserNode is (Blackman, smoothing 0.8, |X| / N, 60 to 1000 Hz). Onsets are the page's
rule on the tuner's last 1024 samples, struck `backlog` seconds later, when that sound reaches scsynth. The ghost is a
second decoder (`openDecoder` with `-ss`, levelled and softened as a slot is) written on channels 3 and 4 of one four channel
`jack-stdin`, so scsynth runs `-i 4` and the ghost sits on busses 4 and 5 while the ring keeps `inbus 2`.

The worker: `MODES` is `['live']`; `mode` copy, mix or grains is refused by name, `set` and `patch` are refused (the life
moves them), `{cmd: 'step', by}` posts `/step`. Each start stores a random `seed` in `want` (a restart after a death keeps
it, so the same life starts again from scene 0) and hands the container the owner's votes (newest 2000 of the Votes DO).
An empty program starts as five files picked by `pickFiles`, the page's `startIds` (fileWeight of each file's votes, never at
-6). The container still answers copy, mix and grains for its tests; nothing in the worker sends them.

The backlog: node writes the mix ahead of what scsynth has had by the pipes (a 64 KiB pipe, the stream's buffer, the
`jack-stdin` ring), MEASURED 0.43 to 0.72 s. A ring patch is applied when it is sent, so the hand's moves reach the ring
that much early. Nothing in a scene is shorter than a second, so this was left; the onsets, which are 120 ms apart, wait it out.

MEASURED 2026-10-18, OrbStack arm64, the grains image with this tree mounted, `--cpus 0.5 --memory 1536m` (the Cloudflare
instance), `live-test.mjs --live`:
- the ring with only the ghost playing: -180 dB (digital silence); pointed at bus 4 (NEGATIVE CONTROL) -23.5 dB.
- each layer alone against the browser test's voice source at -23.3 to -23.8 dB rms, in dB under it, over seven runs:
  drone -11.8 to -12.9, freeze -10.8 to -13.3, resonators -11.7 to -12.2, harmonizer -8.9 to -9.9 (the one layer up to
  1 dB louder than the browser's 10 to 13); ghosts bpf -13.1 to -18.0, comb -13.9 to -16.1, resonators -15.0 to -16.5.
  The ghosts wander (LFNoise2 band and pan), so they are read over 6 s; the gate is 8.5 to 14 and 12 to 19 dB under.
- the planner run apart, with the station's heard keys copied in, matches `status.life` on every read (425 to 428 reads):
  def, control, value and wet to the bit. A step at 29.88 s with a 14 s blend landed the next scene at 43.88 s on the mix clock.
- the MP3: 106.5 s, peak -6.5 dBFS, nothing at full scale.
- JACK: at period 2048, 12 to 16 xruns in the first 3 s and more on CFS throttles, grains alone as much as live; at 4096,
  0 in 75 s with no step, but 2 to 10 in a run with steps, each at a file arriving (33 s, 53 s: a decoder starting);
  at 8192 (186 ms, `PERIOD` since this change) 0 in each of 2 full runs, and the stdio rings hold four periods. A period
  is latency nobody hears on a broadcast. Not measured: whether an xrun is audible in the dummy driver's output.
- CPU, per cent of one core over 100 s at period 8192: container 24.7 to 25.2 (node 10.8 to 11.0, scsynth 4.1, jack-stdout
  3.2, jack-stdin 3.1, LAME 2.7, decoders 0.2), with the test reading status four times a second. At 4096: 28 to 31.
- `server.mjs` in the image with its own preview Icecast as the target: `/play` live answers `mode: 'live'`, on air, a
  listener got 128,800 bytes of `audio/mpeg` in 4 s, `/step` 200 then 409 (`a step is already on its way`), `by: 2` 400,
  `/patch` 409, `/stop` leaves no jackd, scsynth or ffmpeg.

Not tested here: Cloudflare's own scheduler (whether its half vCPU throttles as `--cpus 0.5` does), and their Icecast.
NOT HEARD: nobody listened to the live run.

### short-files

`demo/radio/cast/local.mjs` and `workers/cast/container/mixer.mjs`, the clock. Reported 2026-10-18:
*"sound cuts off when files change"*. A scene's dwell (45 to 150 s) is often longer than its file (the
clip tests are 15 s, Driving along 102 s). The clock used to notice only once the file had ENDED: it then
jumped to the blend and opened the next file at that moment, so the blend started from silence toward a
file still loading. Now each engine knows how long the file on air has left (the media element's duration
in the browser; the feed's `seconds` against the samples read in the container) and, when the blend would
otherwise outlast the file, prefetches and opens the next file early and starts the blend so it ends one
second before the file does. The old ended-file jump stays as the fallback for a file with no known length.

### refresh-on-deploy

`workers/cast/worker.mjs`, the Caster's alarm. Asked 2026-10-18: *"when you update server mixing code can
you refresh live station (i am runnin preview atm)"*. A deploy does not touch a container already running:
it keeps the old image until it restarts, and the Durable Object keeps the old worker code for about four
minutes. So every boot records the worker version (`CF_VERSION_METADATA.id`, the `version_metadata` binding),
and the alarm, which sweeps every 30 s, restarts a container whose boot version differs from the version now
running, then resumes from the saved progress (the file and second). A boot with no version recorded counts
as old, so the first deploy of this refreshes whatever was already on air. Nothing is started that was off.
Since the handover below this restart is only the fallback (`Caster.refresh()`): a station that gives no handoff,
or three failed handovers in a row.

### handover

`workers/cast/worker.mjs` (`Caster.handover`, `slot`, `host`, `spliceAll`, `continueFrom`), `workers/cast/splice.mjs`,
`container/grains.mjs` (`align`, `settle`, `heard`, `clockHeard`, `go`), `container/live.mjs` (`handoff`, `resume`),
`container/mixer.mjs` (`resume`, `skip`). Asked 2026-10-18: *"11swc seems long"* about the refresh above, then option 4:
*"hand over to a second container: start the new container alongside, switch the stream to it, then stop the old one.
No gap at all."*

Why a second Caster. A Durable Object has one container (`ctx.container`, singular, in the Durable Object Container
API docs and in wrangler's config schema). So a station has two slots: `a` is its own container, `b` the container of
a Caster named `<station>~b` that only hosts one (`/host/<station>/start|destroy|running|idle|port/<port><path>`, never
routed from outside: `~` is not in NAME). The station's Caster keeps everything else (want, progress, the alarm) and
`active` says which slot is on air. Every handover flips it. The host's `monitor()` posts `/hostexit/<station>` when its
container exits unasked, which is a death of the station when `b` is on air.

What a twin is told. `handoff` (in every live `/status`): the file on air and its second, the seconds into the dwell and
the scene index, each as scsynth hears them now, at the container's `Date.now()`, plus `hist` (each scene's file kind and
heard key so far: scene i+1 is made from scene i's key, so the twin rebuilds the same life) and `inst` (so a vote
taken across the handover is still one row). The twin gets the station's seed and only the votes cast before its life
began (`want.votesAt`); `sameScene` in the record checks the twin's def against the station's. The queue is rotated to
start at the file on air. A handover starts only with 25 s of dwell left (a blend has two files in two slots, which a
twin does not rebuild) and goes on only if 10 s are left once the twin is up; waiting, the alarm looks every 3 s.

Lining up. The twin seeks 4 s past the station (about its chain's start), then before its first block drops sound or
waits until the file on air is where the station's is at the wall (`align`). That is not enough, because what the
station says it hears was wrong twice:
- `heard()` used to be the wall since the first write. MEASURED with a capture of both containers' input and output:
  a container started the ordinary way has jack-stdin read nothing for about 0.9 s after the first write (it is still
  connecting), so its heard ran 0.9 s ahead of scsynth. A twin, which waits about 1 s before writing, did not.
  Jumps across a handover then read +798, -74, -196 ms. Now heard is what jack-stdin has read (`rchar` in
  `/proc/<pid>/io`) less its ring.
- jack-stdin's `-S` is frames per channel, not samples: its ring is 32768 frames, 0.743 s, and it keeps it full while
  node is ahead. MEASURED: what it had read led the wall by 0.67 to 0.72 s in steady state. With the ring taken as
  0.186 s the twin played the station 230 to 300 ms early; with no ring, the same.
- Even so, heard is low whenever the ring is not full (node stalls: one status call stalled the write loop 350 ms), and
  never high. `clockHeard()` is the best of the last 6 s of (heard minus wall), since scsynth runs on JACK's clock.
- And a twin's first sample waits for the next JACK cycle (up to 186 ms). So once it plays, the twin reads its own
  clock against the station's and drops or holds the difference (`settle`, every 2 s, at most 3 reads, done within
  10 ms). MEASURED settles: -106.7 then 5.5; -280.2 then -0.2; -10.2 then 0.5; -90.7 then -0.6; -115 then 1.6;
  -278.5 then -1.4; -387 then -0.5 ms. Reads taken before jack-stdin had read a whole ring are skipped: they made the
  first read wrong by the cycle wait.
A side effect: live.mjs's onsets wait `seconds - heard()`, which is now about 0.74 s more than before, and is now
when that sound reaches scsynth.

The listeners (preview). `/listen/preview` is no longer a passthrough: each listener is an ear (`createEar`) that
forwards whole MP3 frames. On a handover every ear opens the twin's Icecast, drops its burst (the first pause of 50 ms
after 4 KiB: a mount on air for under 4 s bursts less than 64 KiB), and at its live edge stops the old stream on a
frame boundary and goes on with the twin's, dropping what of the twin's first chunk is older than the old stream's
last. Only then is the old container told to stop and destroyed.

Väin's mounts. One source per mount: the twin is held (`hold`: aligned and encoding, no source opened), the old one is
stopped, and `/go` makes the twin connect, retrying every 100 ms for 5 s. Their listeners' connections end when the old
source goes (see below). A source spliced by the worker instead would need the Durable Object to hold their TCP
connection, and a deploy reloads the object too, so it was not built.

MEASURED 2026-10-18, OrbStack, the grains image with this tree mounted, two containers at `--cpus 0.5 --memory 1536m`,
the real Caster through `handover-docker.mjs` (an adapter with ctx.container's shape over `docker run`), seed 16 (a naked
first scene, so the recordings match sample for sample), files driving, evening, kalle:
- What a preview listener hears across a handover, found sample exact by locating the sound just before and just after
  the splice in the old container's own recording (it was kept playing 6 s past the splice for this): 9 handovers over
  3 runs, +33.4, -59.6, -3.5, -12.6, -72.7, -60.3, -123.5, -41.7, -63 ms (minus is heard twice, plus skipped);
  median -59.6. Silence at the splice 0.2 to 0.5 ms; the biggest step between samples there 0.037 to 0.074 against
  0.027 to 0.030 for the 99.9th percentile elsewhere. The listener's stream never ended; every byte was whole frames
  and decoded to as much sound as the frames say.
- NEGATIVE CONTROL, the refresh: the listener's stream ends, and one that reconnects at once has no byte for 7,295 to
  7,702 ms (11 runs), then the station from the last sweep's second (up to 30 s back) and scene.
- Their mount, on a stand-in Icecast 2.4.4 container with our icecast.xml (no fallback mount): the twin took the mount
  10 to 30 ms after `/go`, never refused. The stand-in's listener connection ENDED when the old source went; a
  listener that reconnected at once had bytes again after 465 and 467 ms, an 8,400 byte burst.
- Two containers ran 9.4 to 10 s per handover here: boot 0.3 s, chain about 3 s, align about 1 s, two settles 4 s,
  the splice 0.4 to 1.2 s. On Cloudflare the twin's boot was 0.5 to 9 s (an image fetch), so expect 10 to 20 s.
- `handover-test.mjs` (fake containers, 29 asserts, 3 NEGATIVE CONTROLS): a twin 300 ms off is heard as a 303 ms gap,
  a splice that keeps the burst repeats 4.2 s.

Not tested: Cloudflare's own timing (boot, the DO hop, NTP between the station's container and the twin's, which the
alignment assumes agree to a few ms), and Väin's Icecast: whether it has a fallback mount, and how their listeners'
players react to the connection ending. NOT HEARD: nobody listened to a handover.

### ios-scope

`demo/radio/cast/index.html`, `startTap`. Reported 2026-10-18: *"No scope on ios??"*. MEASURED by an agent in
Playwright WebKit (Safari 26.4's engine): `createMediaElementSource` on an `<audio>` playing a source with no
byte ranges reads exact zeros, 0 of 15 analyser reads, same origin or cross origin, while the same file with
ranges reads 14 of 15; ManagedMediaSource fed by fetch() reads zeros too. WebKit 180696, open since 2017.
A live stream has no ranges, so on WebKit the page notices zeros while the audio advances (2 s) and opens a
second fetch of our own stream, cuts it at MP3 frame headers and decodes ~0.5 s chunks for the wave. Sound
still comes from the `<audio>`. Costs: a second connection per WebKit listener (counted twice in our preview
Icecast's stats); the wave is not sample aligned with what is heard. Never for somebody else's mount.
`?tap=1` forces the path in Chrome.

## grammar-2

`demo/radio/cast/life.mjs` `createLife({ grammar })`, 2026-10-18. Grammar 2 is plans/plan-cast-patches-scenes.md
steps 4 to 8: 54 patches in seven families, nine scene types in six sections, an hour-long tide, and the
bridges (echo wash, tape stop, frozen bridge, drone bridge, chord hand-over). Grammar 1 is the life before it,
kept bit for bit by `life-g1.json` (40 scenes, two seeds).

MEASURED 2026-10-18 in the browser ring, each patch fully wet on a voice-like source at -23.2 dB rms: the 38 new
patches sit 3.0 to 8.5 dB under the dry source, inside the 16 old ones' 2.1 to 9.9, and no peak passes -7.4
dBFS. Breath bed read -7.3 and its amp went from 1.4 to 1.7.

No naked speech in grammar 2. Asked: *"I am sating i do jot want naked speech"*, *"Too much of it in prev
versions"*. A bypass of the tuner for naked scenes was built and measured (within 0.2 dB of the tuner at
`BARE_GAIN` 0.5 on a voice-like source) and removed the same minute, unshipped.

## soft-files

`life.mjs` make2, `ctx.soft`, 2026-10-18. The files the soften stage marks (Kalle, Kalle 2, Driving along: 1.5 ms
clicks at 2 to 6 kHz, see #drive) play only drone, choir and spectral patches, and a storm or rhythmic scene on
one becomes a deep drone or a choir. Asked: *"current kalle is uninspiring and glitchy"*: it was Long dub, an
echo of 0.8 on half-second grains, which repeats every click. Both drivers pass `soft` from the feed's `soften`,
and the container's history carries it so a twin rebuilds the same scenes.

### fresh

`Caster.freshTick`, from the alarm while a station plays. Asked 2026-10-19: *"re playlist: how ofthen you check new
files? druing radop65 run there are lot of new files coming in. we want to prefer them and be addet to the 'next
playing'. figure out when many arrive and when incoming files not compoing for a while"*, then *"test recordings are
fine, let the team handle it"*, *"if files go, rm also from playlist"*, *"what if file plays and its gone in the same
time?"*. Before it, a running station never read the feed again: a file published during a run played only after a
restart or a program edit.

- Every 30 s (FRESH_EVERY_MS, was 2 min, asked *"30 sec"* 2026-10-19) on air: the feed, edge-cached 30 s (FEED_S, was
  60), so at most two requests a minute per colo to their events API whatever the stations do. The first look of a session is the baseline: what was there at the start is
  not new.
- New ids play next through `/queue`, newest first by `at` (their publish time), a burst all of them; then the queue
  after the playing file, the playing one last.
- Ids gone from the feed leave the queue and the stored program. The file playing is never cut: it finishes and is not
  queued again. If their host stops serving it mid-play, the decoder ends and the station moves on as on any file
  that fails.
- After an hour with nothing new (QUIET_MS), the newest arrival of the last 12 h (RECENT_MS), not the one playing and
  not brought round in the last hour, plays next, then again every 30 min (REVISIT_MS) while it stays quiet.
- Test recordings are not filtered any more, here or in pickFiles: Väin's team handles them.
- `node workers/cast/fresh-test.mjs`: 10 checks against a fake feed and clock, one a negative control. MEASURED: sorting
  oldest first turns three red (7/10).
- Since 2026-10-20 the rules are one pure module, `workers/cast/program.mjs` (pickBy, longOnly, resolveIds, rotateAfter,
  freshLook, freshQueue, goneFrom, programLess), asked *"should we extract the playlist logic ... make sure yu do not
  break old casting"*. The Caster calls it and so does edgecast's station (`workers/edgecast/station-core.mjs`), which
  plays radio1965's stored program and checks the feed every 30 s with the same rules. `node workers/cast/program-test.mjs`
  grades the pick seed by seed against the old pickFiles, and runs its checks against three broken copies of the
  module (each caught).


### listeners

`workers/cast/listeners.mjs` and `Caster.countListeners`, 2026-10-22. Asked whether Väin's server counts listeners,
then *"build it yes"*. Read in tarmoj/radio1965 at dce3411: their app fetches `http://live.uuu.ee:8001/status-json.xsl`
(app/icecastbroadcaster.cpp:409) for channel occupancy and reads only `listenurl`; project-description.md:394 lists
`listeners (current count)`. Their database stores no plays and no listeners, so Icecast's own count is the only one.

- Somebody else's server: the owner approved reading it ONLY while one of our stations is on air on a uuu mount, at most
  once every 30 to 60 s, from the cast worker, never from a page or a harness. So the read sits in the alarm's on-air
  branch (`s.playing` and `s.onAir`), `listenTick` returns before calling anything when either is false, and a
  station reads at most every LISTEN_EVERY_MS (55 s, so every second 30 s sweep). The answer covers every mount on
  their server, so it is kept STATUS_KEEP_S (50 s) per isolate and per colo (`caches.default`) and a second station on
  air reads the same answer.
- `icestats.source` is one object with one source and an array with several. The mount is matched on the END of
  `listenurl`'s path, so `user1` never reads `user12`. A mount with no source, or a source with no `listeners`, is no
  count rather than 0. Icecast 2.4.x can write a title with an unescaped quote, which is not JSON: the mount's own
  object is then scanned for its `listeners` (marked `how: scanned`).
- The shout relay (`workers/shout/worker.mjs`) holds ONE connection to `radio1965` however many listen through it, so
  Väin counts it as one. People = Väin's count, less the relay's `upstreamConnections` (`GET /tee/radio1965`, over the
  `SHOUT` service binding), plus its `listeners`. Its 20 s linger holds the mount for nobody, which reads as 1 at
  Väin and 0 people. Only `radio1965` and `preview` are on the relay (its STATIONS, read that day); `user1..4` are
  counted as Väin reports them. A relay that does not answer in 4 s leaves Väin's count as it is.
- preview's count is the cast's own listeners (`ears`, no request anywhere) with the same relay correction.
- Per broadcast (keyed by `want.startedAt`, so a restart after a death is the same broadcast): now, peak, listener
  minutes, started and ended, the last KEEP (20) in storage. Minutes are the count held between readings; a failed
  read holds the last count, never for more than GAP_MAX_MS (3 min), so an outage cannot inflate them. A stop holds
  the count to the stop.
- Public, on `/status/<station>` as `listeners` and `listens`: their status-json is public already, and the page polls
  that status without a key.
- `node workers/cast/listeners-test.mjs`: 30 checks, 12 named negative controls, against a stand-in Icecast on
  127.0.0.1 and a stand-in relay. MEASURED: taking `!onAir` out of the guard takes 2 red, dropping the relay's
  connection from the sum 4 red, dropping the gap ceiling 2 red.
- NOT measured against their server: nobody probed it to build this. The first broadcast on a uuu mount is the first
  real reading; until then the shape is the app's and the project description's, not ours.

### listen-points

Asked 2026-10-22: *"i will broadcast 2 days. i want charts out of it later"*, *"cf analytics events, no?"*, *"do it"*.

- Every successful listener reading writes one Workers Analytics Engine point (binding `LISTENS`, dataset
  `cast_listeners`), not awaited; a broadcast's close writes one more with blob3 `closed`. Nothing off air, nothing
  on a failed read, at most one a minute per station (the reading's own bound). The field order is fixed in
  `listenPoint` and the read back depends on it: index1 station; blob1 mount, blob2 kind (`vain` or `preview`),
  blob3 event, blob4 the broadcast's start; double1 Väin's own count, double2 the relay's connections there,
  double3 who listens through the relay, double4 people, double5 peak so far, double6 listener minutes so far.
- Retention, READ in Cloudflare's limits page that day: *"Data written to Workers Analytics Engine is stored for
  three months"*. The last 20 broadcasts' summaries stay in the Caster's storage as before.
- `GET /listens/<station>?from=&to=&step=&format=csv` reads it back through the Analytics SQL binding
  (`"analytics": { "binding": "ANALYTICS_SQL" }`, needs wrangler 4.145 or later; `deploy.mjs` runs 4.148 from
  `rig/containers-next`). No API token anywhere: the binding takes the Worker's own account. The table is
  `events.analyticsEngine.cast_listeners`, with no `accountTag` in the SQL (the binding refuses one).
- Buckets of 1, 5, 15 or 60 minutes, `toStartOfInterval`; a step too fine for the range is raised to the first that
  keeps it under 2000 rows, a step not on the list is refused (a non-number once passed as `auto`, caught by the
  test's negative control), and more than 14 days is refused. `APPROX_MAX` per bucket, because exact `MAX` is
  refused on adaptively sampled datasets; at a point a minute nothing is sampled, so it is the exact most.
- Answers are cached 30 s per colo, so a page refreshing it once a minute costs the SQL service nothing more.

## gate

`workers/cast/gate.mjs` and `workers/cast/render.mjs`, 2026-10-20. Asked after an evening of about 15 live sound
deploys, each on one complaint and none listened to first (HANDOFF session 85): *"Maybe 15min is ok?"*, then
*"Note inneed ui to prelisten / scrib etc"*, then *"can you render i nparallel?"* and *"also make one dry render"*.

- The render is the code on air, not a model of it: `startLive` from `container/live.mjs` in the grains-local
  image, the station's stored program, the files as `/file/<id>` serves them (cached in
  `~/.cache/positron-cast-files`), at the station's size (`--cpus 1 --memory 3072m`). JACK's dummy driver is the
  clock, so 15 min takes 15 min. Renders run side by side instead (`--each`), one container and one git worktree each.
- Events are logged on the mix clock and moved onto the MP3's clock by the median of `seconds - mp3Seconds`
  (the pipes and the encoder), so a scene mark on the page lands where it is heard.
- `--dry` is the same files through the tuner and the master only (ring at mix 0, no layers), a file every
  100 s with a 15 s cross-fade: the reference the processing is heard against.
- The checks are what the owner complained about, measured on the MP3 with ffmpeg: integrated -18 to -14 LUFS,
  LRA under 8, true peak under -1 dBFS, no silence over 0.7 s at -50 dB, no short-term stretch under -30 LUFS, no
  rise of 10 LU in 3 s, each hand-over within 6 LU before against after and no dip of 8 LU inside it, every
  finished scene at least 40 s, no xruns, no driver failure.
- The MP3 goes to R2 (`positron-station/cast-renders/<name>.mp3`, served immutable by the station worker's
  `/media/`, so a new render is a new name), the report into `demo/radio/cast/renders/renders.json`, shown at
  `/radio/cast/renders/` after a site deploy.

<a id="description"></a>

### `sourceHead`: the description

The source header had no `ice-description` (asked *"rm heliorje"*, when it carried another text), and Icecast 2.4.4
then reported "Unspecified description". Asked 2026-10-22: *"add 'Mixed by positron.studio' as descripiton"*. Both
sources to Väin send `ice-description: Mixed by positron.studio`: the cast container (`container/server.mjs`
`sourceHead`) and edgecast's relay (`workers/edgecast-relay/icecast.mjs`), whose test holds the two to the same lines.
It is plain ASCII, so the Latin-1 encoding the relay uses for `Väin` does not touch it.
