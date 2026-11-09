# plan-v2in-cf-cost: how cheaply v2in can run on Cloudflare alone, and where the floor is

Status (2026-11-09): a cost plan, nothing built, deployed or changed. Written in positron because what it leans on
(edgecast, the SFU route, MEM's port, the two archived v2in builds) is positron's. Nothing was run against
v2in.stream, live.uuu.ee or any radio mount; no browser was started; the only code run was a local arithmetic script.

Asked 2026-11-09, relayed: the owner was *"bummed v2in is expensive to run in cf"* and asked for the cost worked out
now. The figure that bummed is v2in `plans/plan-cloudflare.md` section 9: **36 to 54 USD a month before listeners,
plus 3 to 11 USD for a MEM Container**, against Virtuaal's **15.29 EUR** and a Hetzner CX23 at **5.99 EUR before VAT**.

Marks: **READ** a fact from a file (path given), **QUOTED** copied from a Cloudflare page (URL and read date),
**MEASURED** measured before (where), **INFERRED** reasoned and not tried. USD and EUR are kept apart; where a
comparison needs one currency, 15.29 EUR is about 17 to 18 USD at 1.10 to 1.17 (INFERRED, the rate not read today).

## In short

1. **The old 36 to 54 USD was eight Durable Objects awake all month.** Duration bills in whole steps of a million
   GB-s at 12.50 USD each, past a free 400,000 GB-s (QUOTED). One object awake all month is 336,384 GB-s, so **one is
   free, two to four cost 12.50 USD, five to seven 25 USD, eight 37.50 USD** (INFERRED from the quoted rule). The bill
   is a count of awake object-months, not of work done.
2. **Most of v2in's channels need no object most of the time.** kcmd, live and radio1965's playlist are files, and a
   stateless Worker can play them per listener from R2 on the wall clock, with the raid's silence, one ALL CLEAR and
   ICY titles computed from the same clock and a cached gate state. An object exists only while a show is live, while
   a mix runs, or while an engine is being listened to (INFERRED, the design is section 1).
3. **The floor is 5 USD a month: Workers Paid.** The free plan cannot carry a listener (10 ms of CPU per request,
   QUOTED), and Containers need Paid. Everything else in the quiet month fits the free allowances.
4. **Today's quiet audience: about 5 to 6 USD a month** with engines only while listened and MEM's object only for
   the festival; **about 18 USD** if Waves and MEM are kept awake all month as objects (one 12.50 step). Against
   15.29 EUR (Virtuaal) and 5.99 EUR before VAT (CX23) (INFERRED).
5. **100 listeners around the clock: about 5 to 20 USD.** **1,000 listeners and a busy video month: about 156 to 182 USD,
   of which about 133 USD is WebRTC video egress**, not radio. Audio for 1,000 listeners is about 5 to 26 USD of
   Worker CPU (INFERRED, the per-listener CPU is the biggest unknown).
6. **A new cost the old plan missed: the player polls `/api/now` every 2 s** (READ, v2in `web/index.html` line 396).
   On a Worker that is 1.31 M requests per open page a month: **36 USD at 100 open pages, 391 USD at 1,000**
   (INFERRED). It must become a cached R2 object or a push over a hibernated WebSocket before anything moves.
7. **MEM fits a Durable Object on paper:** ring and takes 11.2 MB (MEASURED), LAME 16.8 MB (MEASURED), scsynth cut
   from its 73.4 MB reservation to 30 to 40 MB and a JS heap of 10 to 20 MB (both INFERRED): **68 to 88 MB** with PCM
   input, **85 to 105 MB** with mpg123. With scsynth uncut it is 128 to 138 MB and does not fit. CPU about 2 to 5 % of
   a core (INFERRED), which a Durable Object does not bill. A `lite` Container (1/16 vCPU, 256 MiB, new to v2in's
   plans) is the fallback at about **0.63 USD for the festival's ten days, 2.86 to 3.91 USD always** (INFERRED).
8. **Live input costs SFU egress only by WHIP:** 0.69 GB of PCM per live hour to the adapter, 0.035 USD an hour past
   the free 1,000 GB (about 1,450 live hours a month free). MP3 over a WebSocket from the VÄIN app costs no SFU at all,
   only the live object's 460.8 GB-s an hour (INFERRED from QUOTED rates).
9. **Recommendation:** build the stateless shape (gate object, file channels on Workers, objects only while live or
   listened), fix `/api/now` first, port MEM to an object at the worker host and keep the `lite` Container as its
   fallback, cap the SFU below 1,000 GB. It lands at **5 to 6 USD in a quiet month**, cheaper than either server,
   and does not grow with listeners until the hundreds.
10. **What could not be settled:** per-listener Worker CPU of a paced MP3 stream, whether a stateless streaming
    response survives a deploy, scsynth's real size with a cut arena, whether a Container's own Durable Object bills
    duration, the real listened-hours of today's audience, and whether alarm-only objects bill between alarms. Each is
    in section 7 with the measurement that settles it.
11. **Video as HLS from R2 (section 9, added 2026-11-09):** the bridge cuts the show into 2 s segments in R2 and the
    stateless Worker serves them, egress free. At 100 live hours: 0 USD for 1 or 10 viewers; 108 to 119 USD for 1,000
    (Worker requests, 3,600 a viewer-hour), against 6,750 by the SFU and 6,000 by Stream. About 6 s behind the show.
    Whether a CX23 can encode one 720p rendition is NOT MEASURED (INFERRED).

## 1. The channels, one by one: object, stateless Worker, or object only while live

READ: v2in `server/config/channels.json`, `CLAUDE.md`, `HANDOFF.md` 2026-11-07 (switches `supercollider`, now
`waves`, on). The fallback order is fixed: raid, live or the mix, engine, from, playlist (READ, v2in `CLAUDE.md`).

| channel | settings (READ) | most of the time it plays | needs |
| --- | --- | --- | --- |
| `radio1965` | live 1, engine waves, playlist radio1965, mix | Waves (its switch is on) | **Waves object only while someone listens**; with the switch off, its playlist on a stateless Worker; a live object while a show is on |
| `kcmd` | live 1, playlist kcmd by name, record with copyTo | its playlist | **stateless Worker**; a live object while live, which also records |
| `kcmd-test` | live 1, raid false, hidden | nothing | **an object only while live**; nothing otherwise |
| `live` | live 1, playlist huddersfield, record, video, hidden | its playlist | **stateless Worker**; a live object while live; video through the SFU |
| `mem` | from live, engine mem | MEM over `live`'s sound | **MEM object** (section 3): during hcmf// (20 to 29 November) always, otherwise only while listened |
| `community` | live 4, mix, record ask, 3 min sessions, video | nothing until someone is live | **a mix object only while one or more of its four slots is live** |
| raids, gate | alerts.in.ua every 10 s (READ, v2in `server/conductor/gate.mjs` line 300) | | **one `Gate` object on a 10 s alarm**, keys, switches, channels.json and listener counts in its SQLite |
| recordings | kept by `record`, 90 days (READ) | | written by the live object to R2, served by a Worker with range requests (R2 egress free) |
| notifications | Web Push and FCM HTTP v1 with WebCrypto (READ, v2in `HANDOFF.md` 2026-11-09) | | a Worker request per send; nothing always on |
| player, admin, /live | static pages | | Workers static assets (INFERRED free; the static assets price was not read today) |
| video | WHIP in, WHEP out, page blends (READ, v2in `plans/plan-video.md` "In short") | | SFU egress per viewer; no object |

**How a stateless Worker plays a file channel (INFERRED, built from positron's station and v2in build B).**

- **Position from the clock.** The running order is a list of files with frame indexes (positron's station built
  `index/<key>.json` per file at upload, READ v2in `research/cloudflare-media-2026-11-08.md` section 5.6). Position is
  `(now + offset) mod length`, so every listener hears the same moment with no process keeping it, as build B did
  (READ, positron `archive/v2in-cloudflare/README.md`). kcmd's order by name is a fixed list; radio1965's random order
  is a shuffle seeded by the loop number, so it is still a pure function of the clock.
- **Bytes.** The Worker reads about 1 MB (64 s at 128 kbit/s) at a time from R2 by range and writes it out paced:
  a 2 s burst first, then a write about once a second. Through the Cache API on a zone hostname, R2 sees about one
  read per chunk per colo, not per listener. This needs `v2in.stream` as a Cloudflare zone (it is at Virtuaal today,
  READ v2in research section 5.1 item 7).
- **One format.** MP3 frames from different files are joined without decoding, so every playout copy must be the same
  MP3 (44.1 kHz, stereo, 128 kbit/s CBR), made once with ffmpeg into a playout bucket; the originals in `v2in-media`
  stay untouched (INFERRED).
- **The raid.** The Worker reads the gate state (`raid`, `since`, `ended`, the ALL CLEAR file, which channel is live)
  through the Cache API with a 2 s life, so the `Gate` object sees one request per colo every 2 s however many
  listeners there are. During a raid it writes a precomputed silent frame; at the end it plays the ALL CLEAR piece at
  `now - ended`, the same file for every channel and every listener because the gate chose it; then the playlist at
  the clock's position. **One difference from Liquidsoap:** the cut is at a frame boundary with no fade, since a fade
  needs a decode and an encode. Build B did exactly this cut (READ). Silence reaches a listener within the 2 s cache
  life plus the 2 s lead plus the player's buffer, like Icecast's few seconds today (INFERRED). `raid: false` on
  `kcmd-test` is a flag the Worker reads from channels.json.
- **ICY titles.** When a client sends `Icy-MetaData: 1`, the Worker inserts a `StreamTitle` every `icy-metaint` bytes
  from the current file's sidecar JSON (`{ title, by }`, READ v2in `CLAUDE.md` "file metadata"). Build B sent ICY
  titles (READ). The clock knows the file, so this is CPU only.
- **Going live.** The same gate state says a channel is live; the listener's Worker switches at the next chunk from
  the playlist to the live object's chunks (below). A live object writes 2 s MP3 chunks to R2 named by the clock,
  which is what the listeners read, so the live object never holds a listener and its restart never drops one.

## 2. Durable Object duration: what bills, and what each awake object costs

**What bills (QUOTED, https://developers.cloudflare.com/durable-objects/platform/pricing/, last updated 2026-10-18,
read 2026-11-09):**

- Requests: 1 M a month included, then 0.15 USD a million; HTTP requests, RPC sessions, WebSocket messages and alarm
  invocations count. Incoming WebSocket messages at 20 to 1; *"There is no charge for outgoing WebSocket messages, nor
  for incoming WebSocket protocol pings."*
- Duration: 400,000 GB-s a month included, then 12.50 USD a million GB-s. *"Duration billing charges for the 128 MB of
  memory your Durable Object is allocated, regardless of actual usage."*
- Duration bills while an object *"actively executes JavaScript or remains idle without meeting hibernation
  conditions"*. `accept()` on a WebSocket bills the whole time it is connected; the Hibernation API does not once
  handlers complete; outgoing fetches and streaming responses bill; alarms bill while they run. *"Pending I/O
  operations keep an object in memory for up to 15 minutes each."* *"Each setAlarm() is billed as a single row
  written."*
- **The steps.** The page's four worked examples round both requests and GB-s up to whole millions (for example
  552.96 K GB-s billed as 1 M, 12.50 USD), and the examples count 128 MB as 0.128 GB. positron's archive says the same
  from the bill side: *"Durable Object time is billed in whole million GB-s steps, so one to three channels cost the
  same"* (READ, `archive/v2in-cloudflare/README.md`).
- SQLite storage (since January 2026): 25 billion rows read, 50 million rows written and 5 GB-month included (QUOTED).

**What an awake object costs a month (INFERRED from the quoted rules; a month is 2,628,000 s):**
2,628,000 x 0.128 = **336,384 GB-s per object-month**.

| objects awake all month | GB-s | past 400,000, rounded up | USD |
| --- | --- | --- | --- |
| 1 | 336,384 | 0 | **0** |
| 2 | 672,768 | 1 M | 12.50 |
| 3 | 1,009,152 | 1 M | 12.50 |
| 4 | 1,345,536 | 1 M | 12.50 |
| 5 to 7 | 1.68 to 2.35 M | 2 M | 25.00 |
| 8 (v2in's old plan) | 2,691,072 | 3 M | 37.50 |

So the free allowance is about **1.19 object-months**, and each 12.50 USD step buys about **2.97 more**. One live hour
of an object is **460.8 GB-s**, so the free 400,000 GB-s is about 868 object-hours (INFERRED).

**What this means for each kind of object (INFERRED):**

- **An object that serves listeners by a streaming response** bills every second a listener is connected. This is
  why listeners belong on stateless Workers, which bill *"No charge or limit for duration"* (QUOTED, Workers pricing,
  below).
- **An object fed by the SFU's WebSocket adapter** gets 50 messages a second, so it never goes idle and bills wall
  time whether `accept()` or the Hibernation API is used. It is billed only while the show is live, which is the
  point: it exists only then.
- **The `Gate` on a 10 s alarm** bills only while each alarm runs (the poll of alerts.in.ua) if an object with nothing
  pending is not billed between alarms, which is how the pricing page reads and is TO MEASURE. At about 0.3 s a poll
  that is 262,800 alarms and about 10,000 GB-s a month. Even if it were billed all month, it is one object-month and
  still inside the free 400,000 when it is the only one. Its alarm row writes (262,800) are far inside 50 M.
- **A hibernated-WebSocket object for pushing `/api/now`** to open pages bills no duration while idle and nothing for
  outgoing messages, so a change pushed to 1,000 pages costs one wake (INFERRED from the quotes).

**Engines only while someone listens.** Yes, for Waves. The edgecast station boots to sound in 264 to 542 ms and
stopped itself at a cap (MEASURED, positron `plans/plan-cast-lightweight.md` section 12). The listener's Worker asks
the Waves object for `/listen`; the object runs while one or more responses are open and stops when the last closes.
Cost: 460.8 GB-s per listened hour, whatever the number of listeners up to one object's reach (100 to 300, INFERRED,
v2in `plans/plan-cloudflare.md` section 4); past that, it writes 4 s chunks to R2 for the stateless Workers (657,000
Class A writes a month if always on, inside R2's free million when nothing else writes much). The price is musical:
each first listener starts the life at scene 0 on a new shuffle, unless the life, file and second are saved to storage
(not built, READ same section). MEM is section 3.

**The deploy reset** applies only to objects that are awake: a busy object keeps its old code 300 s after a deploy,
then resets, and a listener hears silence from then on (MEASURED 2026-11-04, positron `archive/v2in-cloudflare/README.md`).
In this shape listeners are never on a processing object, so a reset costs a live input a few seconds (the adapter
retries for 5 s, READ v2in research section 1) and a Waves listener a restart. Whether a stateless Worker's long
streaming response survives a deploy is not documented in what was read (runtime updates allow 20 minutes, QUOTED
below) and is TO MEASURE.

## 3. MEM in a Durable Object at the worker host

**Memory, against the 128 MB isolate** (*"Each isolate has a 128 MB limit, covering JavaScript heap and WebAssembly
allocations"*, QUOTED https://developers.cloudflare.com/workers/platform/limits/, last updated 2026-10-29, read
2026-11-09):

| part | MB | mark |
| --- | --- | --- |
| ring and takes at the `worker` host (12 kHz, 30 s of `dense`) | 11.2 | MEASURED, positron `node demo/shell/mem-test.mjs` (`plans/plan-v2in-for-positron.md` section 10) |
| scsynth as edgecast reserves it today | 73.4 | MEASURED, `plans/plan-cast-lightweight.md` section 10 |
| scsynth with its reservation cut (wasmHeapSize 24 MiB, memArenaSize 32 MiB and 14 MiB of rings, against about 1.5 MB the 8 s ring needs) | 30 to 40 | INFERRED, positron `BACKLOG.md` "edgecast: memory headroom" and `plans/plan-v2in-for-positron.md` 9.3. MEM keeps its takes in JS, so its scsynth needs little arena |
| LAME for the output | 16.8 | MEASURED, `plans/plan-cast-lightweight.md` section 12 |
| mpg123, only if the input arrives as MP3 | 17.0 or 0 | MEASURED size; 0 if the input is PCM |
| JS heap | 10 to 20 | INFERRED, never measured in edgecast |
| **total, PCM input, scsynth cut** | **68 to 88** | INFERRED |
| **total, MP3 input, scsynth cut** | **85 to 105** | INFERRED |
| total, MP3 input, scsynth as today | 128 to 138 | INFERRED: does not fit |

**PCM input is reachable without mpg123** (INFERRED): MEM's input is `live`. While a show is live, the live object
posts MEM 12 kHz mono 16-bit PCM (24 KB a second, object to object, no egress). While `live` plays its playlist,
the huddersfield files get a one-time 12 kHz mono WAV copy in R2 that MEM reads by the same clock as the listeners.
Earlier recordings for takes are read the same way after a one-time transcode. That keeps the object at 68 to 88 MB.

**CPU (INFERRED, scaled from MEASURED numbers).** MEM rendered 900 s of `dense` in 28.4 s of laptop CPU, all
processes including ffmpeg and LAME at 44.1 kHz stereo: **3.2 % of a laptop core** (MEASURED, v2in
`plans/plan-huddersfield.md` "MEM after the first listening"). edgecast's station ran at 7.8 % of a core on Cloudflare
against 4.9 to 5.5 % in node on the M1, a factor of 1.4 to 1.6 (MEASURED, `plan-cast-lightweight.md` section 12). So
MEM is about 4.5 to 5 % of a core on Cloudflare at 44.1 kHz, and about **2 to 5 %** at the worker host where only
LAME stays at full rate: **20 to 50 ms of CPU per second of audio**, 10 to 25 ms per 0.5 s pump, far inside the 30 s
per invocation. A Durable Object bills no CPU, only duration (QUOTED: its compute lines are requests and duration).

**Cost.** Always awake: 336,384 GB-s, **0 USD if it is the only all-month object, else part of a 12.50 step**. The
festival only (10 days): 110,592 GB-s. Only while listened: 460.8 GB-s an hour, with a cold ring at each start
filled from earlier recordings (an artistic question for the owner).

**Against a Container (QUOTED, https://developers.cloudflare.com/containers/pricing/, last updated 2026-10-05, read
2026-11-09):** memory 0.0000025 USD per GiB-s past 25 GiB-h, CPU 0.000020 USD per vCPU-s of active use past 375
vCPU-min, disk 0.00000007 USD per GB-s past 200 GB-h; `lite` is 1/16 vCPU, 256 MiB, 2 GB; `basic` 1/4 vCPU, 1 GiB,
4 GB. Billing stops when the instance sleeps. Network egress 0.025 to 0.05 USD per GB past 500 GB to 1 TB a month.

| MEM in | memory | CPU at 3 to 5 % of a vCPU | disk | a month always | the festival's 10 days |
| --- | --- | --- | --- | --- | --- |
| `lite` | 1.42 | 1.13 to 2.18 | 0.32 | **2.86 to 3.91 USD** | **0.63 USD** |
| `basic` | 6.35 | 1.13 to 2.18 | 0.69 | 8.16 to 9.21 USD | 2.37 USD |
| a Durable Object | | not billed | | 0 or a share of 12.50 | 0 (inside the free GB-s) |

(INFERRED from the quoted rates.) `lite` is new to v2in's plans, which priced only `basic`. MEM's node peaked at 207
to 213 MiB at the server host (MEASURED, plan-huddersfield); at the worker host its ring and takes shrink from 51 to
11.2 MB (MEASURED, mem-test), so INFERRED about 165 to 175 MiB, inside 256 MiB with little margin, and 1/16 vCPU
against a 3 to 5 % need is tight. **Not settled:** a Container runs behind a Durable Object of its own class, and
whether that object bills duration while the Container runs is not on the pricing page read today. If it does, a
Container costs one more awake object as well.

## 4. Listeners

**Workers (QUOTED, https://developers.cloudflare.com/workers/platform/pricing/, last updated 2026-10-02, read
2026-11-09):** 5 USD a month; 10 M requests included, then 0.30 USD a million; 30 M CPU ms included, then 0.02 USD a
million; *"No charge or limit for duration"*; *"There are no additional charges for data transfer (egress) or
throughput (bandwidth)"*; subrequests are not billed. Limits (QUOTED, Workers limits, last updated 2026-10-29): *"no
hard limit on duration for HTTP-triggered Workers"* while the client stays connected; CPU 30 s per request by default,
up to 5 minutes; on runtime updates old processes give connections *"up to 20 minutes to finish"*.

**Per listener on a stateless Worker (INFERRED, TO MEASURE):** one request per session, CPU for about one paced write
a second and a chunk read a minute, estimated at **0.1 to 0.5 ms of CPU per second of audio**. That is 0.26 to 1.31 M
CPU ms per listener-month. At 0.5 ms a second a session's 30 s CPU limit lasts about 16 hours, so the listener Worker
is set to 5 minutes (about 7 days).

**Per listener on a Durable Object:** no extra duration (the object bills its own wall time once), one request per
session, but one thread: about 100 to 300 listeners per object (INFERRED, v2in `plan-cloudflare.md` section 4; the
limits page now says *"a soft limit of 1,000 requests per second"*, QUOTED
https://developers.cloudflare.com/durable-objects/platform/limits/, last updated 2026-11-07). Past that, fan-out
objects, each awake while it has listeners.

| around the clock | stateless Worker CPU | Worker requests | objects instead (fan-out) |
| --- | --- | --- | --- |
| 10 listeners | 2.6 to 13.1 M ms: **0** | about 7,300 sessions: 0 | one object: 0 or part of a step |
| 100 listeners | 26 to 131 M ms: **0 to 2.03 USD** | about 73,000: 0 | one object, near its reach |
| 1,000 listeners | 263 to 1,314 M ms: **4.66 to 25.68 USD** | about 730,000: 0 | 4 to 10 fan-out objects: 12.50 to 37.50 USD |

(INFERRED; sessions at one reconnect an hour.) R2 reads with the Cache API: per file channel per colo one read a
minute, about 44,000 a month; three channels in five colos is about 0.66 M, inside the free 10 M (QUOTED R2 page,
below). Without a zone (on `workers.dev`) every chunk reaches R2: 1,000 listeners would read about 44 M times, about
12.24 USD (INFERRED at 0.36 USD a million past 10 M).

**And the one that is not a listener stream, but scales like one: `/api/now`.** The player fetches it every 2 s with
`cache: 'no-store'` (READ, v2in `web/index.html` lines 256 and 396). On a Worker each open page is 1,314,000 requests
a month:

| open pages around the clock | requests | USD past the free 10 M |
| --- | --- | --- |
| 10 | 13.1 M | 0.94 |
| 100 | 131.4 M | **36.42** |
| 1,000 | 1,314 M | **391.20** |

(INFERRED.) Three cures, any of them: the gate writes `now.json` to R2 on each change and pages read it through the
cache with a 2 s life (R2 reads per colo, near 0 USD); the gate pushes changes over hibernated WebSockets (one request
a page a session, outgoing free); or the page polls every 15 to 30 s. The VÄIN app's own poll interval was not read.
This item is larger than everything else in the audio bill at 100 listeners and up.

## 5. Live input without RTMP or Icecast

**Realtime SFU (QUOTED, https://developers.cloudflare.com/realtime/sfu/pricing/, last updated 2026-09-22, read
2026-11-09):** *"The SFU and TURN services cost $0.05 per GB of egress."* *"The first 1,000 GB each month is free."*
SFU and TURN share it. Publishing into Cloudflare is free. Data to a WebSocket endpoint through the adapter is egress
at the same rate; audio coming back in from a WebSocket is free.

| way in | Cloudflare cost per live hour | notes |
| --- | --- | --- |
| **WHIP into the SFU, out through the WebSocket adapter as 48 kHz stereo s16 PCM** (OBS, the browser's /live) | 0.69 GB of SFU egress: 0 inside the free 1,000 GB, **0.035 USD** past it; plus the live object's 460.8 GB-s | 1,000 GB is about 1,450 live hours a month. MEASURED rate of the PCM, positron `plan-cast-lightweight.md` section 8 |
| **MP3 over a WebSocket** from the VÄIN app into the live object (v2in `plan-cloudflare.md` section 3, option 1) | **0 SFU**; the live object's 460.8 GB-s; incoming messages at 20 to 1, about 1,800 billed requests an hour at 10 messages a second | INFERRED. The smallest change to Tarmo's app; the object decodes with mpg123 only if it must mix or re-encode, otherwise it can pass the frames straight to R2 chunks |
| a Container pulling the WHIP track as Opus (werift) | about 14 times fewer billed bytes than PCM, plus the Container | READ v2in `plan-cloudflare.md` section 6; not worth it below 1,450 live hours a month |
| community, four WHIP senders mixed | four times the PCM: 2.76 GB an hour, one mix object | INFERRED |

Video goes through the SFU as WHEP: a 720p viewer at 3 Mbit/s is 1.36 GB an hour, a community blend viewer 2.2 GB an
hour (READ v2in `plan-cloudflare.md` section 8). That, not audio, is what can leave the free 1,000 GB.

## 6. Totals a month, three scenarios

**Common rates.** Workers Paid 5 USD (QUOTED). R2 (QUOTED, https://developers.cloudflare.com/r2/pricing/, last updated
2026-10-30, read 2026-11-09): 0.015 USD per GB-month past 10 GB, Class A 4.50 USD a million past 1 M, Class B 0.36 USD
a million past 10 M, egress free, deletes free, usage rounded up to the next billing unit. Stream (QUOTED,
https://developers.cloudflare.com/stream/pricing/, last updated 2026-10-27): 1 USD per 1,000 minutes delivered, not
used for audio (100 listeners around the clock would be about 4,380 USD, READ v2in research "In short" 4).

**Assumptions (INFERRED, none measured):** 100 live hours a month across channels; recordings about 86 MB an hour
(READ, plan-huddersfield) kept 90 days, under 10 GB; live chunks 1,800 R2 writes per live hour; MEM as an object
during the festival only; the `/api/now` cure in place (its cost without it is in section 4).

### A. Today's quiet audience, no video to speak of

| item | the cheapest shape | engines kept awake |
| --- | --- | --- |
| Workers Paid | 5.00 | 5.00 |
| object duration: Gate (about 10,000 GB-s), live objects (46,080), Waves while listened (assume 200 h, 92,160), MEM for the festival (110,592) | about 259,000 GB-s: **0** | Gate, Waves and MEM all month plus live: about 1.06 M: **12.50** |
| object requests: gate alarms 0.26 M, cached gate reads about 0.4 M, adapter messages about 0.5 M | about 1.2 M: **0.15** | 0.15 to 0.30 |
| Workers CPU and requests, a handful of listeners | 0 | 0 |
| R2: storage, about 0.2 M writes, reads | 0 to 0.15 | 0 to 0.15 |
| SFU: 69 GB of live PCM | 0 | 0 |
| **total** | **about 5.15 to 5.30 USD** | **about 17.65 to 17.95 USD** |

### B. 100 listeners around the clock, a middle video month

| item | USD |
| --- | --- |
| Workers Paid | 5.00 |
| duration: Waves awake all month (someone is always listening), Gate, live, MEM for the festival: about 0.50 M GB-s; 0.39 M without MEM's festival | **0 to 12.50** (this sits on the first step's edge) |
| listener CPU, 26 to 131 M ms | 0 to 2.03 |
| object and Worker requests | 0.15 to 0.45 |
| R2 | 0 to 0.15 |
| SFU: video 408 GB, community 331 GB, live PCM 69 GB: 808 GB | 0 |
| **total** | **about 5.15 to 20.13 USD** |

### C. 1,000 listeners around the clock, a busy video month

| item | USD |
| --- | --- |
| Workers Paid | 5.00 |
| duration: Waves awake, Gate, live, MEM; Waves writes 4 s chunks to R2 for the listeners | 12.50 |
| listener CPU, 263 to 1,314 M ms | 4.66 to 25.68 |
| R2: about 0.66 M Waves chunk writes plus live chunks, about 1 M Class A past the free million at most | 0 to 4.50 |
| object and Worker requests | 0.30 to 1.00 |
| SFU: video 3,264 GB, community 331 GB, live PCM 69 GB: 3,664 GB less 1,000 at 0.05 | **133.20** |
| **total** | **about 155.65 to 181.88 USD** |

With a hard SFU cap at 950 GB (count WHEP viewer-hours in the Worker, refuse new pulls past it, READ v2in research
"What v2in could take" item 3), C falls to about **22 to 49 USD**, and video viewers past the cap are refused.

### Against the servers

| a month | Virtuaal C-S | Hetzner CX23, Helsinki | Cloudflare, cheapest shape |
| --- | --- | --- | --- |
| A, today | 15.29 EUR | 5.99 EUR before VAT, about 7.43 with it | **about 5.15 to 5.30 USD** (17.65 to 17.95 with engines awake) |
| B, 100 listeners, middle video | 15.29 EUR, at its 5 TB edge | 5.99 EUR | about 5.15 to 20.13 USD |
| C, 1,000 listeners, busy video | not possible (READ v2in `plan-cloudflare.md` section 9) | about 31 EUR before VAT if the port carries it (READ, same) | about 156 to 182 USD; 22 to 49 with the SFU capped |

Server figures READ from v2in `plans/plan-cloudflare.md` sections 8 and 9 (Virtuaal read 2026-11-07, Hetzner
2026-11-08), not re-read today.

**The floor.** **5.00 USD a month, Workers Paid**, the one cost no design removes: the free plan gives 10 ms of CPU
per request (QUOTED, Workers limits), which ends a listener's stream within seconds, and Containers need Paid. Past
the floor, the first thing that costs money is a second object awake all month (12.50 USD), then `/api/now` polling,
then video egress past 1,000 GB. If v2in stayed in positron's account the 5 USD is already paid, but the free
allowances (400,000 GB-s, 1 M R2 writes, 1,000 GB of SFU) would be shared with positron's own use; a handover wants
v2in's own account and its own 5 USD (INFERRED).

**Why the old plan said 36 to 54 USD:** eight objects awake (37.50 USD at whole-million steps), listeners served by
objects with fan-out objects behind them, and 20 to 60 M requests from 500 ms pumps (READ v2in `plan-cloudflare.md`
section 9). Each of those goes away in this shape: objects only while live or listened, listeners on stateless
Workers, and no pumps when nothing is on.

## 7. Recommendation, and what turns each INFERRED figure into a fact

**Recommendation (INFERRED).** Cloudflare can be the cheapest home for v2in at today's audience, at **about 5 USD a
month**, if it is built differently from `plan-cloudflare.md`:

1. **Fix `/api/now` first**, on the VPS as well: an R2 object behind the cache or a push, not a 2 s Worker poll. It
   is the only item that could cost hundreds by accident.
2. **One `Gate` object on a 10 s alarm**, the only object awake all month.
3. **File channels on a stateless Worker** owning `/stream/*` and deployed rarely: clock position, R2 by range
   through the Cache API, raid silence and ALL CLEAR from the cached gate state, ICY titles. Needs `v2in.stream` as a
   Cloudflare zone and playout copies in one MP3 format.
4. **Objects only while live**: a live object per show (WHIP through the adapter, or MP3 over a WebSocket from the
   app) writing 2 s chunks to R2, recording by keeping them; a community mix object while one of its slots is live.
5. **Waves only while listened**, streaming to its listeners up to about 100, then through R2 chunks. The owner
   decides whether a cold start at scene 0 is acceptable, or the life is saved to storage.
6. **MEM as an object at the worker host**, PCM in, scsynth's reservation cut; awake for the festival, otherwise
   while listened. The `lite` Container (0.63 USD for the festival, 2.86 to 3.91 always) is the fallback if the object
   does not fit; `basic` only if `lite` cannot keep up.
7. **A hard SFU cap at 950 GB**, shown on /admin.

**Refused, and why:**

- **Listeners on Durable Objects as the main path** (the old plan): every listener-hour then keeps an object awake,
  and past about 100 to 300 listeners each fan-out object is another awake object-month.
- **Stream for radio**: per-minute delivery prices a radio at thousands of USD a month (READ, v2in research).
- **A Worker relaying a VPS's Icecast**: a grey area under Cloudflare's 2026-09-28 terms and an upstream connection
  per listener (READ, v2in research P2).
- **Waves and MEM awake all month as the default**: together with the Gate they are three objects and the first 12.50
  USD step, for an engine nobody may be hearing.
- **The `basic` Container as MEM's first choice**: 8 to 9 USD always for a process whose memory now fits in a quarter
  of it.

**What could not be settled, and what would settle it (none of it touches v2in.stream or a radio mount):**

| INFERRED figure | measurement |
| --- | --- |
| a stateless listener Worker uses 0.1 to 0.5 ms of CPU per second of audio | one Worker on `workers.dev` streaming a test MP3 from R2 to 1, 10 and 50 node clients (bytes only) for an hour; `cpuTime` from `wrangler tail` |
| a stateless streaming response survives a deploy | the same, with a `wrangler deploy` at minute 10; count bytes and gaps; a recording through `silencedetect` |
| the raid's silence reaches a listener within about 4 s plus the player buffer, ALL CLEAR in step | a test gate state flipped by hand, two clients recorded, timestamps of silence onset compared |
| the Gate bills only while its alarm runs | one alarm-only object for a week on positron's account, duration from the GraphQL analytics `durableObjectsPeriodicGroups` |
| MEM fits at 68 to 88 MB | MEM in workerd with scsynth's memArenaSize and wasmHeapSize stepped down, as BACKLOG "edgecast: memory headroom" asks, with `exceededMemory` read from `wrangler tail` |
| MEM uses 2 to 5 % of a core on Cloudflare | MEM in a Durable Object for 30 minutes on a test file, `cpuTime` from `wrangler tail`, as edgecast's station was measured |
| MEM in a `lite` Container keeps up in 256 MiB at 1/16 vCPU | 24 hours of MEM in a `lite` Container on a test input: RSS, CPU, restarts, gaps in its output |
| a Container's own Durable Object bills duration | one `lite` Container for a day, then the account's Durable Object duration for its class |
| a Waves object carries 100 listeners | 50, 100 and 200 synthetic clients on edgecast's `/listen`, bytes only (v2in `plan-cloudflare.md` measure 2) |
| today's audience listens N hours a month | the gate's own `listeners(channel, minute, count)` table, read from a backup copy on the laptop, not from the server |
| R2 chunk reads stay per colo with the Cache API | a zone hostname in front of the test Worker, R2 operation counts from the dashboard before and after |
| 100 live hours a month | the gate's log of live sessions, from the same backup |

**Cost of this plan:** about 40 minutes, six Cloudflare pages read through a summarising fetch tool, one local
arithmetic script. Prices changed since v2in's research of 2026-11-08: none of the rates moved; the Durable Object
limits page was updated 2026-11-07 and now states a soft limit of 1,000 requests a second per object and no memory
figure (the 128 MB per isolate is on the Workers limits page); the Containers page lists a `lite` instance (1/16 vCPU,
256 MiB, 2 GB) and container egress (0.025 to 0.05 USD per GB past 500 GB to 1 TB), neither in v2in's plans; SQLite
storage billing for Durable Objects is in force since January 2026.

## 8. Push, crons, the server's remaining job (added 2026-11-09)

Asked: *"push it over a hibernated WebSocket, - polling is pointless, why not use oush models. also consider crons etc
what cf offers. 100 liserners is realistic"*, *"we still need herzner, right?"*, *"smaller rmtp uploader?"*.

- **Push, no poll.** Every page and the VÄIN app hold one WebSocket to a `now` object (the gate object can be it),
  accepted with the hibernation API. The object sends only when something changes: a raid starts or ends, a show goes
  live or stops, a title changes (a file channel's next title is known from the clock, so the object sets one alarm
  for it). Between changes the object is evicted and bills no duration; outgoing messages are free (QUOTED, section
  2); a connect is one request. At 100 listeners this is about 0 USD against 36 USD for the 2 s poll (INFERRED).
- **Cloudflare's schedulers, each for its job.** Durable Object alarms where seconds matter (the raid poll of
  alerts.in.ua, a title change, a recording's end). Cron Triggers (a minute at the finest, INFERRED) for chores:
  sweep old recordings in R2, roll up listener counts, nightly backups of the gate's SQLite to R2, rebuild playlists
  after an upload. Queues or Workflows only if a chore must retry (renders of uploaded files, notifications).
- **100 listeners is the realistic case**: scenario B with push in place and engines only while listened is about
  5 to 8 USD a month (INFERRED from sections 4 and 6 without the poll).
- **The server's one remaining job is the senders Cloudflare cannot take**: RTMP (OBS on its default setting) and
  Icecast source (Mixxx, today's VÄIN app builds). OBS 30+ can send WHIP, a browser sends WHIP, and the app can move
  to MP3 over a WebSocket; if every sender moves, no server is needed. If they must keep working, a small bridge does
  only that: RTMP and Icecast in, MP3 over a WebSocket (or PCM) to the channel's object out, no listeners, no files, no
  Liquidsoap. The smallest Hetzner (or any few-euro VPS) carries it; positron measured ffmpeg's WHIP sender failing
  with the SFU, so the bridge speaks WebSocket, not WHIP. Cloudflare Containers cannot be it: they take HTTP only
  (MEASURED 2026-11-04).

## 9. Video as HLS from R2 (added 2026-11-09)

Asked: the WHIP moment's row *"A 720p viewer at 3 Mbit/s is 1.36 GB an hour"* prices at 1.63 USD a day and 49.64
USD a month on positron's `/radio/v2in/`, called *"horrible pricing"*; the owner said yes to writing a cheaper video
route into this plan and the page. Nothing was built or run for this section except one local arithmetic script
(`hls-cost.mjs` in the session scratchpad, its output quoted below).

**The route (INFERRED, not built).** The bridge on the Hetzner CX23 (section 8) already takes OBS on RTMP. It also
cuts the incoming show into HLS segments with ffmpeg and writes each segment and the rewritten playlist to R2. Viewers
fetch the playlist and the segments from the same stateless Worker that serves the audio (`/stream/*`, section 1),
which reads R2 through the Cache API. No SFU, no WHEP, no Stream. Audio for the radio still goes the bridge's way:
MP3 over a WebSocket to the live object, 2 s chunks into R2.

- **Egress is free.** Workers: *"There are no additional charges for data transfer (egress) or throughput
  (bandwidth)"* (QUOTED, section 4). R2: egress free (QUOTED, section 6). The 1.36 GB a viewer-hour (READ) that
  costs 0.068 USD on the SFU costs 0 here.
- **What it pays for instead** (INFERRED, segment and playlist counts not measured):
  - **R2 writes**, fixed per live hour whatever the audience: with 2 s segments, 1,800 segments plus 1,800 playlist
    rewrites, **3,600 Class A writes a live hour**, 0.0162 USD past the free million. 100 live hours are 360,000
    writes; with the audio's 180,000 live chunks that is 540,000, inside the free 1 M. With 4 s segments, 1,800 a
    live hour and 360,000 a month with the audio.
  - **Worker requests, one per segment and one per playlist poll per viewer**: 3,600 a viewer-hour at 2 s, 1,800 at
    4 s. This is the per-viewer cost that is not 0: 0.30 USD a million past the free 10 M (QUOTED, section 4). It is
    0 at 1 and 10 viewers and **105 USD a month at 1,000 viewers** with 2 s segments (51 USD at 4 s).
  - **Worker CPU** at an assumed 0.5 to 2 ms a request (INFERRED, a cache hit returned as it is): 0 at 1 and 10
    viewers, 3.00 to 13.80 USD a month at 1,000 (1.20 to 6.60 at 4 s).
  - **R2 reads** through the cache: one miss per segment per colo, the playlist at a 1 s cache life; five colos read
    27,000 times a live hour, 2.7 M a month, inside the free 10 M. Without a zone (`workers.dev`) every viewer request
    reaches R2: 126 USD more a month at 1,000 viewers (61.20 at 4 s).
  - **R2 storage**: 136 GB if a month's 100 hours are kept, 1.89 USD a month at 0.015 past 10 GB; 0 if a lifecycle
    rule deletes segments after a day (deletes are free, QUOTED section 6).
  - **The bridge**: the same 5.99 EUR a month before VAT (READ, section 6) that section 8 already pays; its upload to
    R2 is 1.36 GB a live hour, 136 GB a month, against Hetzner's included traffic (not read today).
- **The trade: a few seconds of delay.** HLS players start about three segments behind the live edge, so about 6 s at
  2 s segments and 12 s at 4 s (INFERRED, not measured), against WHEP's under a second. For a radio show with a
  picture that is a fair price; for a performer watching their own return it is not, and that case stays on WHEP.

**Side by side, 100 live hours a month, one 720p rendition at 3 Mbit/s (INFERRED from READ and QUOTED rates; the
free allowances applied to video alone, though in practice they are shared with the audio and positron):**

| viewers | viewer-hours | SFU (WHEP): GB, USD a month | Stream: minutes, USD a month | HLS from R2, 2 s segments: USD a month | HLS from R2, 4 s |
| --- | --- | --- | --- | --- | --- |
| 1 | 100 | 136 GB: **0** (inside 1,000 GB) | 6,000: **6.00** | **0** | **0** |
| 10 | 1,000 | 1,360 GB: **18.00** | 60,000: **60.00** | **0** | **0** |
| 1,000 | 100,000 | 136,000 GB: **6,750.00** | 6,000,000: **6,000.00** | **108.00 to 118.80** (requests 105, CPU 3.00 to 13.80) | **52.20 to 57.60** |

**Per live hour, past every free allowance:**

| | 1 viewer | 10 viewers | 1,000 viewers |
| --- | --- | --- | --- |
| SFU at 0.05 USD a GB | 0.068 | 0.68 | 68.00 |
| Stream at 1 USD per 1,000 minutes | 0.06 | 0.60 | 60.00 |
| HLS from R2, 2 s: 0.0162 of writes plus Worker requests | 0.0173 | 0.0270 | 1.0962 |

(Stream counts delivery only: its storage and any live input charge were not read for this section. The Hetzner
bridge is not in any column, because section 8 keeps it for RTMP and Icecast either way.)

**Findings.**

1. **At 1 and 10 viewers, HLS from R2 costs nothing past what is already paid**: Workers Paid and the bridge. The
   SFU is 0 or 18 USD and Stream 6 or 60 USD for the same month.
2. **At 1,000 viewers it is about 108 to 119 USD a month, not 0**, and almost all of that is Worker requests, not
   bytes. It is still about 60 times cheaper than the SFU (6,750) or Stream (6,000). 4 s segments halve it to 52 to 58.
3. **The per-viewer remainder goes if the segments do not pass through a Worker at all**: R2 on a custom domain on
   the zone, served from Cloudflare's cache, bills no Worker request for a cache hit and an R2 read only on a miss
   (INFERRED, the R2 custom domain and cache pages were not read today). The Worker would then answer the playlist
   only, or nothing. Asked for was the same stateless Worker, so that is the route above, and this is its next step.
4. **The fixed cost is the writes**, 3,600 a live hour at 2 s, and it is inside the free million at 100 live hours
   together with the audio's chunks. It leaves the free million at about 185 live hours a month at 2 s (1 M over
   5,400 writes a live hour with the audio), about 278 at 4 s.

**What could not be settled, and what would settle it:**

| figure | mark | measurement |
| --- | --- | --- |
| a CX23 can encode one 720p rendition live | **NOT MEASURED** | ffmpeg on the CX23 with `libx264 -preset veryfast` at 720p30, 3 Mbit/s, from a test RTMP input for an hour: CPU, dropped frames, speed above 1.0x. If OBS already sends H.264 at 720p with a 2 s keyframe interval, ffmpeg can copy the video (`-c:v copy`) and only cut it, which needs almost no CPU (INFERRED) |
| segment length, and so the writes and requests | INFERRED, 2 s or 4 s | the length the encoder can hold with a keyframe on every boundary; count R2 Class A operations for one test hour in the dashboard |
| a few seconds of delay | INFERRED, about 6 s at 2 s | a clock burnt into a test picture, read off a phone running hls.js against the Worker, against the sender's clock |
| 0.5 to 2 ms of Worker CPU a request | INFERRED | `cpuTime` from `wrangler tail` while 10 node clients fetch a test playlist and its segments for 10 minutes |
| the cache keeps R2 reads per colo | INFERRED | R2 Class B counts before and after an hour of test clients through a zone hostname |
| hls.js polls the playlist once per target duration | INFERRED | the request log of the same test |

**Cost of this section:** about 25 minutes, no page read on the web, one local arithmetic script. All rates are the
ones quoted in sections 4, 5 and 6.
