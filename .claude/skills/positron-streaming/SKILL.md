---
name: positron-streaming
description: "A stream as a heavy patchbay link, and the transport it negotiates (TRANSPORTS and chooseTransport in demo/shell/bay.mjs): HLS, LL-HLS, MoQ, WHIP and WHEP, Cloudflare Stream and Workers, the relay room and its limits, ERR and somebody else's Icecast, Durable Objects, R2. Load before changing anything under workers/ or src/, before any page that plays a stream or adds an audio, video, file or state link that leaves the machine, and before quoting a latency or a bill."
metadata:
  internal: true
---

# Streaming, the relay, and what each provider actually does

## Start here: a stream is a HEAVY link, and the bay never carries it

Written 2026-10-14 from `demo/shell/bay.mjs`, `bay-node.mjs`,
`plans/plan-patchbay.md` and `plans/plan-site-names.md`, each read that day.
Everything below this section is older and was moved here verbatim; this
section says where each of those rules sits in the patchbay.

- **The design rule is plan-patchbay §0: *"Build a control plane, not a signal
  path."*** Its own words: *"THE SINGLE MOST IMPORTANT DECISION IS THAT THE
  PATCH BAY DOES NOT CARRY AUDIO."* It carries MIDI and other small messages
  and NEGOTIATES the rest, *"because audio is 1536 kbit/s a stereo pair and a
  router in the middle of it is a router that adds a buffer, a copy and a
  failure mode to every stream on the desk."*
- **The media are `MEDIA` in bay.mjs**: `midi`, `audio`, `clock`, `value`,
  `video`, `program`, `file`, `state`. **`HEAVY` is `audio`, `video`, `file`,
  `state`.** A heavy link resolves to a SESSION, `{ transport, address, shape,
  where, says }`, and the two ends open it with code they already have. A light
  link (`midi`, `value`, `clock`, `program`) rides the relay room as one
  `{ type: 'bay.event', source, ev }` per event (`node.emit` in
  `bay-node.mjs`, plan-site-names §4h), delivered by the receiving bay only
  along a link it holds. `program` is light on purpose: a shader arrives whole
  as one message.
- **How far apart the ends are is `WHERE`**: `machine`, `network`,
  `internet-one`, `internet-many`. An unknown network is the internet, never
  the same network. `internet-one` with more than one receiver over the
  internet is `internet-many`, and a link into a store is not a receiver.
- **`chooseTransport(medium, where, receivers)` reads `TRANSPORTS`**, which is
  plan §5 as data. A light medium answers `null`; an unknown one throws. The
  table today, copied from `bay.mjs` on 2026-10-14:

  | medium | machine | network | internet-one | internet-many |
  | --- | --- | --- | --- | --- |
  | audio | `webaudio` | `datachannel` (board round trip 4 ms) | `relay` (round trip p50 36 ms, cap 1000 msg/s, 2000 burst) | `moq`, or `llhls` (no number measured) |
  | video | `page` | `datachannel` (to measure) | `whep`, or `relay-h264` (a VPN passes the WHEP handshake and drops the media, so count frames) | `llhls` (no number measured) |
  | file | `indexeddb` | `ingest` | `ingest` | `r2-hls` |
  | state | `room` | `room` | `room` | `room` (a relay room as a bus, at the relay's cap) |

  Reading one stored object back is its own row, `READS`: `indexeddb` on the
  machine, one `https` GET across a wire, `r2-hls` for many readers. `whip` and
  `jack` are names a port may DECLARE and the table never chooses.
  `MACHINE_ONLY` is `webaudio`, `page`, `indexeddb`, `jack`. **`LIGHT_VIA` is
  `relay` and `datachannel`**: a light link between two sites rides the relay
  room or a board's direct WebRTC channel (the `path` choice on the remote
  pages, `demo/remote/path.mjs`, *"add direct option to all remote
  instruments."*, 2026-10-13).
- 🔴 **A `says` CELL IS ONLY A NUMBER THE PLAN QUOTES**, and `'to measure'`
  where nobody has. The relay cell said 60 msg/s until 2026-10-06 and
  `bay-test.mjs` now reads the worker's source and goes red when the two
  disagree. That is the relay limits rule further down, arriving in the bay.
- **The relay Durable Object IS the room.** It keeps nothing, so it is drawn as
  the `relay` transport or as a box `cf-relay:<room>` (`createPatchbay`'s
  `room` option), never as a store. **`studio-1` is the Pi's room**
  (`STUDIO_ROOM` in bay-node.mjs), and `roomFor()` gives a harness run a
  private room so a check never reaches the owner's desk.
- **Cloudflare services are SITES with ports**, drawn on the page, never
  announced (plan-site-names §4d, §4g). In the tree on 2026-10-14:
  `cf-stream:live` (WHIP in, WHEP out, `demo/video/webrtc/index.html`),
  `cf-stream:hls` (RTMPS in from the publisher, LL-HLS out,
  `demo/video/llhls/index.html`), `cf-moq:relay` (`demo/video/moq/index.html`),
  and the store as `cf-store:history:value-in/out`. A node with
  `place: 'cloudflare', net: 'cloudflare'` and `kind: 'endpoint'`.
- 🔴 **SOMEBODY ELSE'S SERVER IS AN `external` NODE, AND A LINK OUT OF IT NEEDS
  `{ consent: true }`, `=== true` AND NOTHING LOOSER.** `validate` refuses it
  otherwise, because *"a link out of an `external` node opens a connection to
  somebody else's server, and ERR said on 2026-09-16 that every one of ours
  lands in their listener statistics"*: never a page load, never a harness,
  never `?selfcheck=1`. It is the ERR and Icecast rules below, enforced in the
  data rather than remembered.
- **The address of a heavy link is DERIVED, never chosen**:
  `${place}-${node}-${port}`, so one port is one room. The Pi does not rely on
  it and DECLARES every stream address it announces (`studio-1`,
  `studio-1-video`, `studio-1-circuit`), which is why its site became `pi-1`
  on 2026-10-10 without one stream moving.

So, reading the rest of this file: **the player and Stream sections are what a
heavy video or audio link's two ends open; the relay sections are the room every
light link and the `relay` transport ride; the Durable Object, R2 and edge
sections are the services drawn as `cf-*` sites; the ERR and Icecast sections
are `external` nodes.**

## What runs on Stream today, and what was retired 2026-10-13

⚠️ **RETIRED 2026-10-13, AND THE LESSONS BELOW STAND.** The test pattern
(Stream inputs `positron-demo` and `whep-rig`, pub's `/watch`, `/status`,
`/start`, `/stop`, `/whip`) and /cam/'s RTMPS camera (input `positron-cam`,
pub's `wss /cam`) are gone and those routes answer 410. Six workers were
deleted from Cloudflare the same day: cues, instrument, moq-safari, osc, rtc
and selfrec, so `cues.`, `instrument.`, `moq.`, `osc.`, `rtc.` and
`selfrec.positron.studio` do not answer; their code stays in `workers/` as the
record the citations below point at (`workers/*/RETIRED.md`). What still runs
on Stream: `/stage/`'s `positron-stage`, video/030's `positron-cam-whip`
(`/cam/whip`) and video/060's `positron-hls-loopback` (`/loop`). The archived
/llhls/, /webrtc/, /cam/ (LL-HLS leg) and capture ROUND TRIP answer a press
with `this leg was retired 2026-10-13`. A measurement below that names one of
them is a dated record, not a page to re-run.
⚠️ **ADDRESSES CORRECTED 2026-10-14.** video/030 is
https://positron.studio/video/webrtc/ (WebRTC loopback, `cf-stream:live`) and
video/060 is https://positron.studio/video/llhls/ (LL-HLS loopback,
`cf-stream:hls`), both sharing `demo/video/loopback.mjs`; the MoQ loopback is
https://positron.studio/video/moq/ through Cloudflare's public relay. pub's
`RETIRED` set in `workers/pub/worker.mjs` is exactly `/watch`, `/status`,
`/start`, `/stop`, `/whip`, `/cam`, `/cam/status`, and its routes list reads
`/stage/watch`, `/stage/status`, `/cam/whip`, `/loop`, `/loop/status`,
`/loop/sweep`, `/ice`, `/log`, `/logs`. `stage`, `llhls`, `webrtc`, `moq`,
`cam` and `capture` are manifest rows with `unlisted: true`, still built and
served. `workers/jam/RETIRED.md` is older (2026-09-04) and is not one of the
six.

Measured on this account and these devices. Prices and limits move, so a claim
here is worth re-checking before a plan is built on it.

## Players: HLS, LL-HLS, MoQ and WHEP on WebKit and Chrome

These are what the two ends of a heavy `video` or `audio` link open once the
bay has named the transport.
- **iOS 17.1 added `ManagedMediaSource`**, so `Hls.isSupported()` is now TRUE on
  iPhone. Any fallback written `if (!Hls.isSupported() && canPlayType(...))`
  silently stopped firing.
- **Prefer native HLS on all WebKit, and gate it on `ManagedMediaSource`.**
  `canPlayType('application/vnd.apple.mpegurl')` returns `"maybe"` in BOTH Safari
  and Chrome, so it cannot tell them apart — gating on its truthiness put Chrome
  on a path it cannot play. MMS is WebKit-only, so it is a capability test rather
  than a brand check. Measured on desktop Safari, same page, same 40 s: native
  advance 0.961x / latency 5.25 s / 0 errors, against hls.js 0.344x / 7.71 s /
  2 errors. **HEADLESS Chrome answers `"maybe"` too**, so the suite cannot tell
  the two paths apart: `replay`, `seek` and `flipper` all ran
  `video.src = <m3u8>` on a Chrome that cannot play it: dead picture, green
  suite, because their asserts were about decks and cue folds, not about frames.
  ⚠️ `seek` IS RETIRED (2026-09-16) and is at `archive/demos/seek-index.html`.
  All three now gate on MMS (2026-09-06). Grep for `canPlayType` before trusting
  any HLS page.
  ⚠️ **2026-10-14: ALL THREE ARE ARCHIVED** (`archive/demos/replay-index.html`,
  `seek-index.html`, `flipper-index.html`, flipper on 2026-10-12), so none of
  them is served. The HLS player in use is `src/low-latency-player.js`, imported
  by https://positron.studio/video/llhls/.
- **Safari can close a ManagedMediaSource under you.** Every buffer is dumped.
  MMS also gates loading via `startstreaming`/`endstreaming`.
- **`video.buffered` on MSE is the INTERSECTION of the source buffers.** With
  demuxed audio+video it reads 0.05 s while video holds 5 s. Never diagnose a
  "starved" player without splitting the tracks.
- **Native HLS has no recovery hooks** — no `liveSyncDuration`, no level capping,
  no `hls.latency`. Reload is the only lever, so watchdogs must be hand-built.
- **Audio-only LL-HLS is not lower latency on Cloudflare Stream — it is only
  smaller.** The audio rendition and every video rendition carry the same
  `PART-TARGET=0.5`, the same `PART-HOLD-BACK=1.5`, the same `TARGETDURATION=3`,
  and — the giveaway — the same INDEPENDENT cadence: 11 of 41 parts on BOTH,
  though every AAC frame is independently decodable and audio could mark them
  all. Measured with that packaging: audio-only 3.88 s against video-only
  3.82 s, the same, while the bytes go 418 kbps against 11.8 Mbps. What
  actually costs latency is running BOTH renditions at once (8.8 s on raw
  hls.js) — the demuxed intersection problem `low-latency-player.js` exists to
  fight. `tracks` asserts the packaging from the playlists, so the claim
  needs no stopwatch.
  ⚠️ **`tracks` WAS REMOVED 2026-09-08** (`d0f76f66`, *"rm tracks"*), so
  nothing asserts that packaging today and the numbers above are its last
  record. Re-read the playlists before building on them.
- **Cloudflare WHEP refuses a single-track offer.** One recvonly transceiver —
  audio alone or video alone — is `HTTP 400`, both ways, while video+audio
  negotiates in the same second. So "is audio-only WHEP lower latency" has no
  answer to measure on this provider; you cannot subscribe to it.
- **A latency target inside one keyframe interval is unreachable.** Cloudflare
  advertises `PART-HOLD-BACK=1.5` with a 2.0 s GOP, and only one part per segment
  is `INDEPENDENT`.
- **LL-HLS deliberately does not specify how a client picks its live position.**
  Every player invents a policy; that is why this tier is fiddly.
- **A live-edge part 404 is normal.** Separate it with a ceiling; do not silence
  it.
- **Cloudflare mints a new video UID on every encoder reconnect.** Cached media
  URLs 404 afterwards.
- **`-re` is a per-input ffmpeg option.** `-re -i a -i b` paces only `a`.
- **MoQ:** a relay cannot live in a Container (no inbound QUIC — dial-out only);
  IETF `moq-pub` does not interoperate with hang at the catalog layer; but
  browser→relay→browser works today at p50 ~20 ms, with no container and no Rust
  build.
- **MoQ on Safari is blocked for a good reason.** WebTransport shipped in Safari
  26.4 (macOS and iOS) and connects to Cloudflare's relay in 140 ms — but
  `@moq/net` blocks Safari by user agent (`safari: '<0'`) because of
  [WebKit 319818](https://bugs.webkit.org/show_bug.cgi?id=319818): the QUIC
  flow-control window never refills, deadlocking after ~16 MiB or ~7,600
  streams. MoQ opens one stream per group, so that is about two minutes.
  Bypassing it (`08-moq/?transport=force`) is worse than the bug report implies.
  (Demo 08 is the archived `/moq/` since 2026-10-13, still served; the comment in
  `demo/shell/moq.mjs` still calls it *demo 08*. Today's MoQ page is
  https://positron.studio/video/moq/.)
  Measured twice, 150 s each on desktop Safari: **6-8 frames total**, first
  stall at 20 s, and **a full page reload with a fresh WebTransport does not
  help** (7 frames then 8). The window refills at roughly one frame per minute
  rather than never. So "reconnect every N seconds" is NOT a workaround — a
  question the published bug report leaves open. Not the encoder either: Safari
  does VP8 720p realtime at 370 fps. MoQ on Safari is unusable today; Safari
  gets WHEP (25 ms measured) instead.
- **Cloudflare's MoQ relay has no WebSocket listener**, so the qmux fallback
  cannot help. `moq-relay` (self-hosted) does, via `[web.http] listen`.
- **An error string cannot tell "API absent" from "API blocked".** `@moq/net`
  emits the same "WebTransport not supported" either way, which is how a claim
  that iOS lacks WebTransport got made without anyone checking `typeof
  WebTransport` on the device. Report the capability, not the error.
- **ManagedMediaSource needs `disableRemotePlayback = true`** (or an AirPlay
  source alternative) or `sourceopen` never fires. There is no published
  low-latency guidance for MMS — native HLS is the documented low-latency path
  on WebKit, which is why the player prefers it there.
- **A remote `MediaStream` carries the SENDER's msid.** After a hop,
  `remote.id === local.id` and the track ids match too, so "is this the received
  stream or the source?" cannot be answered by id — it is answered by object
  identity against `pc.getReceivers()[i].track`. An id comparison passes
  vacuously in both directions.
- **`candidate-pair` RTT is not media latency.** Quoting WHEP's 25 ms RTT
  beside MoQ's 20 ms glass-to-glass flattered WHEP by ~3x. Measured the same
  way: MoQ p50 26.2 ms, WHEP p50 67.0 ms, and WHEP wins p99.
- **MediaRecorder output reports `duration: Infinity`**, which leaves a
  transport bar with no range to scrub. Seek far past the end, let the browser
  resolve the duration, then come back.

## Cloudflare Stream: recording, billing and archiving

- **Stream recording cannot be turned off — ON THE RTMPS PATH.** `mode: off`
  also disables HLS playback of a live input, and `preferLowLatency` requires
  `automatic`, so 06 and 09 depend on it. (06 and 09 are the numbered era's
  names. On 2026-10-14 the page that depends on it is
  https://positron.studio/video/llhls/, whose `cf-stream:hls` box reads
  `RTMPS in from the publisher`; `workers/pub/loop.mjs` refuses a take above
  `LOOP_CEIL` 600 storage minutes, and HANDOFF session 76 says every take is
  deleted about 90 s after.) **WHIP ingest is the opposite and the
  unqualified rule has already misled a plan once: WHIP RECORDS NOTHING** —
  direct-tested, 183 s against a recording-ENABLED input, 26 polls, zero assets.
  Stream-WebRTC is delivery-only, so a WHIP source costs no storage minutes and
  cannot be archived server-side either; whatever records it must do so itself. Storage is bounded by DELETING recordings; the account
  cap is 1000 storage-minutes and testing adds ~225/day.
  `deleteRecordingAfterDays` minimum is 30 — too coarse to help.
- **Stream bills MINUTES, not bytes, and from 2026-10-15 WebRTC bills too.**
  $1 per 1,000 minutes delivered on both protocols — "regardless of protocol"
  (GA notice 2026-09-08; this account delivered 246 WebRTC minutes in 30 days,
  ≈$0.25). Three consequences that are not the price. **Buffering is billable**
  and HLS minutes round up to the segment, which is the GOP — 2.0 s here — so a
  visitor who leaves after two seconds is billed for the ~3 segments hls.js
  prefetched (`liveSyncDurationCount: 3`, read from the bundled build) and for
  ~2 s on WHEP. **An idle broadcast costs nothing on WHIP and storage on
  RTMPS**, because recording cannot be turned off there. And **the 1000-minute
  cap blocks new live streams when it fills** — at ~225 min/day that is 4.4
  days, so the RTMPS path's real cost is an outage, not a bill. Because the
  meter is duration, `tracks`' 28x byte saving (418 kbps against 11.8 Mbps) is
  worth exactly $0 on this provider: audio-only is an argument for the viewer's
  connection, never for the account. Recording and HLS interop for WHIP are
  announced "in the coming months" and are NOT shipped — re-test before
  planning either way.

- **ARCHIVING A LIVE RECORDING OFF STREAM, AND THE CAPS THAT DECIDE IT.**
  ⚠️ **READ OFF CLOUDFLARE'S DOCS 2026-09-24, NOT MEASURED HERE**, which is the
  opposite of every bullet above it. Re-check before building on any of it; the
  measured line about the 1000-minute account cap is the one that has actually
  been tested.
  - **A live video longer than SEVEN DAYS is truncated to seven days.** Only the
    first seven days are recorded. That is the hard archive cap, and it is a
    property of one continuous video rather than of the account.
  - **`timeoutSeconds` decides how many videos one show becomes.** It is how
    long the feed may be disconnected before a NEW video is created, default 0.
    So a flaky encoder turns one performance into a pile of assets, and anything
    archiving them has to stitch by time rather than assume one file.
  - **`deleteRecordingAfterDays` is minimum 30 and maximum 1096**, sets a
    `scheduledDeletion` when the stream ends, counts from when the recording is
    ready, and **applies only to FUTURE streams if it is set while one is
    live**. The minimum being 30 is already recorded above as too coarse to
    manage the storage cap with.
  - **The recording exists about 60 seconds after the stream ends**, and while
    it is generating the video reports `not-found` or `not-started`. **A cron
    that fetches the moment the input goes idle gets nothing** and will look
    like a broken job rather than an early one.
  - **`GET https://customer-<CODE>.cloudflarestream.com/<INPUT_ID>/lifecycle`
    is the cheap thing to poll**: it answers `live` and the current `videoUID`.
    That is the handle an archiver wants, rather than listing videos.
  - 🔴 **THE COPY ITSELF IS AN MP4 DOWNLOAD, AND IT IS BILLED AS DELIVERY.**
    Stream's own pricing says MP4 downloads are billed by percentage of the file
    delivered. So "archive it to R2" is not free even though R2 charges no
    egress: you pay Stream to hand you the bytes once, then R2 storage. Put the
    number on it from the pricing page before promising a nightly job.
  - ✅ **WHICH IS STILL THE RIGHT MOVE ON THE RTMPS PATH, FOR THE REASON
    MEASURED ABOVE**: recording cannot be turned off there, the account cap is
    1000 storage-minutes, and this account fills it in about 4.4 days of
    testing. **Copy to R2, then DELETE from Stream**, and the outage that cap
    causes stops being the failure mode. Deleting a recording releases its
    storage.
  - **Cron Triggers are per ACCOUNT, not per Worker**: 5 on Workers Free, 250 on
    Workers Paid (read 2026-09-24). Two other free-plan limits bite a copy job
    before the cron count does: **50 subrequests per request** against 10,000 on
    paid, and 100,000 requests a day.
  - ⚠️ **AND NONE OF THIS APPLIES TO WHIP, WHICH RECORDS NOTHING SO FAR.** Write
    the "so far" every time: Cloudflare has announced recording and HLS interop
    for WHIP and they are not shipped, so this is a fact with an expiry date on
    it and the bullet above already says to re-test rather than to plan either
    way. **A sentence that drops the qualifier outlives the thing it describes**,
    which is the failure this file exists to stop.
    Until it ships, an archiver for a WebRTC source has to record client-side and
    ship the pieces itself, which is what `record`, `capture` and `crate` do into
    R2. (2026-10-14: `record` is archived, `archive/demos/record-index.html`;
    `crate` was retired 2026-10-02, `fdc5677a`, with `vain`; `capture` is
    archived 2026-10-13 and still served, its ROUND TRIP leg retired. No page in
    the concepts records a WebRTC source into R2 today: /video/recorder/ keeps
    its takes in the browser.)

## The relay room: its limits, a full room, and what the sender is not told

The room every light link rides and the `relay` transport of the TRANSPORTS
table. `workers/relay/src/index.js` is the source of every number here.

- 🔴 **A full relay room is a silent outage, and a redeploy does NOT clear it.**
  `studio-1` sat at 16/16 and refused the board for hours — it logged
  `closed 1006`, which is what a browser reports for the relay's `503`, so it
  read as a network fault on the Pi while `/keys/` (retired 2026-09-17) was down for everyone. The
  room was full of **orphaned harness Chromes of mine** (four profile groups,
  118 processes); killing them took it 16 → 1 and the board rejoined unaided.
  Hibernated sockets are RESTORED across a restart, so deploying the worker
  changes nothing — only the object can close a socket. It now reclaims idle
  ones **when the room is full only**, dating each from
  `getWebSocketAutoResponseTimestamp` (survives hibernation; `wire.mjs` clients
  ping and the runtime answers for free), an in-memory message time for agents
  that never ping, and a DURABLE `serializeAttachment({at})` written once at
  accept — because dating from the object's wake makes a dead socket
  un-evictable forever. `GET /room/<name>/stats` now prints per-socket idle.
  **Check `curl .../stats` before diagnosing any "cannot connect" on this
  relay**, and kill stray `user-data-dir=/tmp/...` Chromes.
- 🔴 **THE RELAY'S LIMITS ARE 1000 msg/s, A 2000 BURST AND 128 SOCKETS, AND
  THIS ENTRY SAID 60, 120 AND 16 FOR MONTHS AFTER THEY WERE RAISED.** READ from
  `workers/relay/src/index.js`, whose own comments say *"was 60 — one knob turn
  is ~60/s on its own"* and *"was 16, which a handful of browser tabs could
  fill"*; `GET /room/<name>/stats` reports the same. `demo/shell/wire.mjs`
  carried the same four stale numbers under a comment claiming it could not
  disagree with the worker, and was corrected on 2026-09-17.
  ⚠️ **THE DIRECTION MATTERS.** Every stale number was too SMALL, so anything
  reading them refuses work the relay would accept and any capacity argument
  built on them understates a room by more than an order of magnitude. A design
  was nearly throttled on this: a keyboard glissando and a held retrigger were
  budgeted against 60/s and come to about 16 and 8 msg/s, which is under one per
  cent of the real budget.
  **What is still true and is the part worth keeping:** the token bucket is
  readable off the wire and exact, and the sender is told NOTHING when it bites.
  No error, no close, no backpressure, and only a per-connection counter in the
  payload can see it. ⚠️ A gap counter cannot: a flood measured on 2026-09-17
  delivered 2030 of 6000 and reported `lost 0`, because the loss was a tail
  rather than a hole. The Durable Object hop costs **1-2 ms at p50** over the
  runtime's `ping`/`pong` autoresponse, and a full room costs the sender about
  **8 ms at p50** over an empty one with zero loss (`demo/perf-wire.mjs`).
- **`ingest.positron.studio` is the only tokenless write path.** Server-minted
  session ids, per-segment/session/address caps enforced in a DO, 6-hour TTL
  with a cron sweep. `selfrec` was the token-gated one until its worker was
  deleted on 2026-10-13; if a gated write path returns, keep the two separate.

## Durable Objects: alarms, hibernation, and what an object does not know about itself

- **A Durable Object's OUTBOUND client WebSocket hands binary over as a
  `Blob`**, not an `ArrayBuffer` — measured `Blob`, `size` 9, `byteLength`
  undefined — and a `Uint8Array` binds to a SQLite `BLOB` column as an EMPTY
  one, silently. So a recorder can look like it stored a frame while the row
  reads back at 0 bytes with its hex head blank. `await data.arrayBuffer()`
  first, and bind the ArrayBuffer. A BLOB also comes back OUT as an
  ArrayBuffer, which has no useful `.slice()` and no iterator — wrap it before
  reading it. (`workers/backlog`, 2026-09-09. That worker left the repository
  on 2026-09-14, `b70aec99`, and is in git history only.)
- **A DO's input gate does NOT cover a non-storage await.** Events are held back
  across a `storage.get`, so handlers cannot interleave there — but
  `blob.arrayBuffer()` is not storage, and two frames a millisecond apart will
  race each other into a table in the wrong order. Where order IS the product,
  serialise the handler through one promise chain.
- **NOTHING SCHEDULES AN ALARM IN A DO CONSTRUCTOR.** The constructor runs
  BEFORE the handler on a cold wake, so a `setAlarm()` in it overwrites the
  alarm that is about to fire. Cloudflare documents the resulting livelock,
  where the handler never runs at all. Arming happens where a due time actually
  changes: on write, and at the end of a fire. (`archive/items/README.md`, from the removed `workers/items/src/index.js`.)
- **`getAlarm()` RETURNS NULL INSIDE A RUNNING HANDLER, and it means
  "running", not "unscheduled".** Reading it as the latter is how a schedule
  gets silently dropped, so `items` never consults it: it sets
  unconditionally, which is safe because one object has exactly one alarm and
  setting replaces. **Never schedule in the past** either: an alarm at a time
  already gone fires immediately and re-enters, which is a busy loop wearing a
  schedule. (`archive/items/README.md`, from the removed `workers/items/src/index.js`.)
- 🔴 **THE ALARM HANDLER CATCHES ITS OWN FAILURES RATHER THAN THROWING.**
  Cloudflare retries a throwing alarm about six times over roughly two minutes
  and then NEVER RE-RUNS IT until something calls `setAlarm()` again. Two
  minutes is nothing against an upstream outage, and the failure is silent: the
  schedule simply stops. So anything that can fail is caught, and the alarm is
  re-armed before returning either way. (`archive/items/README.md`, from the removed `workers/items/src/index.js`.)
- **An object that is first reached without its name stores the wrong one for
  ever, and the two diagnoses look identical from outside.** An `items` object
  first reached with no `?room=` stores `default` and then silently refuses to
  announce for ever, while every row it holds reads `announced_at: null` and
  looks like a failed send. Those are opposite diagnoses and they were
  indistinguishable until `/stats` reported the name the object remembers and
  whether it may announce. (`archive/items/README.md`, from the removed `workers/items/src/index.js`.)
- ⚠️ **A DO STORAGE VALUE CAPS AT 128 KiB.** `pub`'s ring of device reports is
  `LOG_KEEP` 400 by `LOG_MAX_BODY` 2000, which is 800 KB in the worst case, so
  a busy device could make every write throw, which would look exactly like the
  eviction bug the persisted ring replaced. Drop the OLDEST lines until it
  fits; the newest report is the one somebody is waiting to read.
  (`workers/pub/worker.mjs`.)
- ⚠️ **HYDRATE LAZILY, NOT IN THE CONSTRUCTOR.** A DO constructor cannot await,
  and doing it in `blockConcurrencyWhile` would make every OTHER route on the
  object (the WebSocket upgrade, `/status`, `/start`) wait on a storage read
  they do not use. (`workers/pub/worker.mjs`.)
- ⚠️ **A LIVE DURABLE OBJECT KEEPS ITS CODE.** Deploying does not change a room
  that has a socket in it, because the board holds it awake, so new constants
  arrive there when the object next restarts and in a fresh room immediately.
  `/room/<name>/stats` reports what the OBJECT thinks, which is how to tell the
  two apart. (`workers/relay/src/index.js`.)
- **A DO NAMESPACE CANNOT BE ENUMERATED.** `clear-all` needs a list of rooms,
  so `store` keeps one reserved instance, `__index`, holding the names as they
  start recording. ⚠️ It therefore knows only what was recorded SINCE it
  existed: rooms from before are unreachable by name and keep up to `cap` rows
  until something writes to them again, because the prune runs on write. The
  public room route refuses any name beginning `__`, so nothing outside that
  file can address it, and room names are constrained everywhere so the
  namespace cannot be sprayed with junk. (`workers/store/src/index.js`,
  `workers/relay/src/index.js`.)
- **Retention is a decision, not a default: a SELECT over a table nobody prunes
  is a demo that works for a week.** Pruned on write, in both
  `workers/store/src/index.js` and `workers/feedback/src/index.js`.
- **A Durable Object can be pinned to a jurisdiction, and the pin is provable.**
  `instrument`'s session log, the only personal data that platform keeps, uses
  `.jurisdiction('eu')`, and the code proves it rather than claiming it: the
  EU-pinned id DIFFERS from the unpinned one, so the object really lives in the
  jurisdiction-restricted namespace. The signaling Hub is a separate class and
  deliberately untouched. (`workers/instrument/src/index.js`; the worker was
  deleted from Cloudflare 2026-10-13 and the source is kept as the record.)
- ⚠️ **A DO RESPONSE HAS IMMUTABLE HEADERS**, and `.set()` on one throws a
  TypeError rather than failing quietly. So does a response out of the Cache API
  or the asset binding. And a body-less status must not be given a body:
  `new Response(<body>, { status: 204 })` is a TypeError. Rebuild the response
  rather than mutating it. (`workers/view/src/index.js`,
  `workers/feedback/src/index.js`, `workers/moq-safari/src/index.js`.)

## Broadcast first, persist second, and what a DO clock is worth

- 🔴 **BROADCAST BEFORE `storage.put`. Delivery latency must not be gated on
  persistence. MEASURED: awaiting the storage.put before send cost ~50 ms
  p50.** Storage writes then never take the room down: the broadcast has
  already gone out, so a failed put costs backlog durability, not the live
  show. (`workers/cues/src/index.js`; `workers/rtc/src/index.js` calls it "the
  50 ms lesson" and repeats it at every write.)
- 🔴 **A CLOSED SOCKET IS THE DEATH DETECTOR AND NOTHING ELSE IS.** Dead
  publishers emit NO track-level events: tiles freeze silently, and SFU
  sessions 410 only at +31 to 47 s (measured, plan-m2m §5.4). The DO's `left`
  broadcast is 38 to 54 ms against that, so an owner who closes the lid goes
  offline immediately and the far end can fire all-notes-off.
  (`workers/rtc/src/index.js`, `workers/instrument/src/index.js`.)
- 🔴 **A DO's `Date.now()` IS FROZEN DURING EXECUTION (~±70 ms apparent skew)
  and the pub to DO to sub transit is 27 to 38 ms**, so a relay's `serverAt`
  and `doRecvTs` are debugging breadcrumbs only. The sender's own stamps inside
  the payload are stored VERBATIM and are the only timing authority.
  (`workers/rtc/src/index.js`; `src/timed-messages.js` says the same of
  `serverClockOffset`: "Workers freeze Date.now() during execution; treat as
  ±70 ms".)
- **`setWebSocketAutoResponse('ping' -> 'pong')` measures pure network RTT with
  zero wake cost and zero duration billing, measured 32 to 38 ms** on the cues
  pattern. (`workers/rtc/src/index.js`, `workers/cues/src/index.js`.)
- **Rebuild, never patch.** A reconnect is a new join and a new publish, with no
  state repair. A rejoin REPLACES the old roster entry and DETACHES the old
  socket so its close emits no `left`, and a per-join generation tag makes the
  drop handler no-op on any socket that is not the participant's current one.
  That was the ghost-`left` rejoin bug. (`workers/rtc/src/index.js`.)
- ⚠️ **A WORKER'S OUTBOUND WEBSOCKET NEEDS `waitUntil` OR THE MESSAGE CAN BE
  CUT OFF** when the handler returns. (`workers/mail/src/index.js`.)
- 🔴 **A RECORDER THAT HAS TO BE ARMED LOSES EVERYTHING SPOKEN BEFORE IT IS.**
  MEASURED 2026-09-17 before the arm call existed: the note was sent, the relay
  carried it, the socket echoed it back, and `GET /feedback` never saw it,
  because the recorder holds its socket only while it has been woken and lets
  go after fifteen idle minutes. The relay's echo to the sender is what makes
  one round trip proof it was carried rather than merely written to a socket
  that was closing. (`workers/mail/src/index.js`.)
- **Open the recorder's socket and do not return until it is open**, so a caller
  that sends immediately afterwards cannot race its own message into a room the
  recorder has not reached yet. (`workers/store/src/index.js`,
  `workers/feedback/src/index.js`.)

## The relay's byte budget, which is the limit that actually binds

From `workers/relay/src/index.js`.

- **A 4 KiB message roof was inherited from elektron-jam, where it was right:
  jam relayed tiny latency probes. It is WRONG for a looper.** `peer.mjs`
  publishes a committed layer as ONE message carrying the material, every note
  row of every layer at ~98 bytes each. Measured: 2 layers x 16 notes is ~7 KB,
  8 x 32 is ~52 KB. A 4 KiB roof passes the tiny live-note plane and silently
  eats the loop plane, which is the one thing cross-device looping needs.
- 🔴 **THE REAL COST IS NOT MESSAGE SIZE, IT IS FAN-OUT AMPLIFICATION.** One
  message goes to every socket in the room, so N sockets multiply egress by N.
  So the budget is BYTES PER SECOND (`BYTES_PER_SEC` 8 MiB/s steady,
  `BYTE_BURST` 16 MiB) and the per-message cap only has to sit under the
  platform's 1 MiB WebSocket message limit with room to spare (`MAX_BYTES` is
  1000 KiB). Two buckets, both refilled by elapsed time: bytes, which matters
  because fan-out multiplies it, and msgs, so a flood of 10-byte messages still
  costs something.
- ⚠️ **A TRUE BYTE ROOF IS NEITHER `byteLength` NOR `String.length`.**
  `msg.byteLength` is undefined on a string, so the naive
  `msg.byteLength > MAX_BYTES` never fires for text at all; and `String.length`
  counts UTF-16 CODE UNITS, so 4000 units of emoji is 8000 UTF-8 bytes and
  slipped through a length check. Measured, not assumed. UTF-8 bytes are always
  at least the code units, so the length test is a safe fast reject before the
  encode.
- ⚠️ **MARK LIVENESS BEFORE ANY CAP OR BUCKET CHECK.** A socket that is being
  rate-limited is very much alive, and marking liveness only on ACCEPTED
  messages would make the busiest client look like the deadest one.

## Cloudflare Stream, WHIP and WHEP, and the ffmpeg publisher

- 🔴 **WHIP AND WHEP MUST BE USED TOGETHER.** Cloudflare's docs are explicit:
  "WHIP and WHEP must be used together: we do not yet support inputs using
  RTMP/SRT to be played using WHEP". One input cannot serve both an LL-HLS
  page off RTMPS and a WHEP page, so each leg published the SAME burned-in test
  pattern to its OWN input, which is exactly what made a cross-transport
  comparison possible. (`workers/pub/container/server.mjs`.) Both test pattern
  inputs were deleted 2026-10-13; the rule holds for any page that wants both.
- 🔴 **CLOUDFLARE HOLDS A WHIP INPUT AGAINST A STALE PUBLISHER.** A leg that
  died with "Error muxing a packet / Resource temporarily unavailable" (exit
  245) cannot be restarted immediately: measured, it needs roughly 45 s before
  the input accepts a new session (`LEG_RETRY_MS` is 45_000). Before that timer
  existed a dead leg stayed in the table for ever and the Worker's 30 s sweep
  believed the leg was running and NEVER restarted it: the WHIP leg died with
  exit 245 and stayed down until a human ran /stop, waited for
  `publishing:false`, waited another 45 s and ran /start.
  (`workers/pub/container/server.mjs`.)
- **ffmpeg exit 255 is what ffmpeg returns for a SIGTERM it handled, which is
  exactly what an intentional /stop looks like.** Reporting that as `lastError`
  made a clean shutdown read as a failure.
  (`workers/pub/container/server.mjs`.)
- 🔴 **A FAILED ffmpeg RUN LEAKS THE STREAM KEY VERBATIM.** ffmpeg echoes the
  FULL RTMPS URL in its error messages ("Error opening output files"), and
  `/status` serves that tail publicly. Measured on 2026-09-04: a failed run
  leaked the key verbatim into plain output. Truncating a tail is not
  redaction. Scrub at the point of capture so an unredacted secret is never
  held in memory. (`workers/pub/container/server.mjs`.)
- ⚠️ **TWO SIMULTANEOUS ENCODES ON A HALF-vCPU CONTAINER INSTANCE STALLED THE
  STREAM.** That is why the picture size stays tunable through `PUB_W`, `PUB_H`
  and `PUB_FPS`: being able to drop the budget without rebuilding the image is
  how it got diagnosed. A 56-block machine-readable clock row cost a measured
  +16 per cent encoder CPU on that box and was removed on 2026-09-08 because
  NOTHING EVER READ IT. (`workers/pub/container/server.mjs`.)
- ⚠️ **drawtext WITH NO `fontfile` RESOLVES TO NOTHING AND FAILS SILENTLY**, so
  a burned-in epoch never reaches the pixels, which is the one thing that makes
  glass-to-glass measurable. Use a MONOSPACE face: in a proportional face the
  digits shift sideways as they change, which is jitter in exactly the region a
  reader is watching. (`workers/pub/container/server.mjs`, `src/publish.sh`.)
- ⚠️ **drawtext CANNOT PRINT EPOCH MILLISECONDS.** `%{expr_int_format:…:d}`
  clamps at INT32_MAX, so epoch ms (1.79e12) prints as 2147483647 and ffmpeg
  says "Conversion of floating-point result to int failed", measured. The
  absolute clock is printed in SECONDS with the unit beside the number. And
  `%{pts:flt:OFFSET}` is what works: `basetime` does NOT (measured,
  `src/publish.sh`). (`workers/pub/container/server.mjs`.)
- ⚠️ **gmtime's strftime ARGUMENT NEEDS A TRIPLE BACKSLASH.** drawtext's
  expansion parser splits `%{name:args}` on a bare colon. Measured on ffmpeg@7:
  `\\\:` renders 15:31:25, `\:` errors with "%{gmtime} requires at most 1
  arguments". (`workers/pub/container/server.mjs`.)
- 🔴 **A CONTAINER SLEEPS ON REQUEST IDLENESS, AND ffmpeg PUBLISHING GENERATES
  NO INCOMING REQUESTS AT ALL**, so `sleepAfter` would happily kill a stream
  somebody is watching. The viewer count is the real signal: an alarm sweep
  renews activity while anyone is connected and stops the publish once nobody
  is, and touching the container both checks health and renews its activity
  timeout. (`workers/pub/worker.mjs`.)
- ⚠️ **DO NOT AWAIT THE PUBLISH INSIDE THE WEBSOCKET UPGRADE.** Awaiting it
  delayed the 101 by the container's cold start, so the viewer's own `onopen`
  did not fire until ffmpeg was already running, which is a connection blocking
  on a video encoder. Fire and forget; the alarm sweep retries if it fails.
  (`workers/pub/worker.mjs`.)
- 🔴 **A BROWSER CAN PUBLISH WHIP. WHAT IT CANNOT DO IS HOLD THE CREDENTIAL.**
  Cloudflare's WHIP publish URL carries the stream key in its path and a public
  page cannot keep a secret, which is the ONLY reason an ffmpeg container was
  in that path at all. WHIP to Cloudflare is single-shot SDP with no trickle
  (measured, `rig/whep/publish.html`), so the signalling proxy is one POST of
  an offer and one answer. Media then flows browser to Cloudflare directly over
  ICE/DTLS/SRTP and NEVER crosses the worker: a worker cannot carry media and
  does not have to, it carries thirty lines of signalling.
  (`workers/pub/worker.mjs`.)
- 🔴 **THE WHIP `Location` IS ITSELF A CREDENTIAL ON CLOUDFLARE**: it addresses
  that session under the same secret path, so handing it back would leak
  exactly what the proxy exists to hide. Keep it behind an opaque id and proxy
  the DELETE. **And two publishers on one input is one publisher and a fight**,
  so hand the input over rather than race for it. (`workers/pub/worker.mjs`.)
- **WHIP args as MEASURED in `rig/whep/WHIP-FFMPEG-NOTES.md`, not invented:**
  libopus rather than aac, because the whip muxer defaults h264+opus;
  baseline/3.1 offers `profile-level-id=42001f`, which Cloudflare ACCEPTS and
  echoes verbatim, so the `42e01f` in the docs is a documentation value and not
  a negotiation gate (run 1 of those notes proved it first try); `-bf 0` for
  the same reason as the RTMPS leg. (`workers/pub/container/server.mjs`.)
- **`recording.mode` MUST be `automatic` or the LL-HLS pipeline is not engaged
  and you silently get plain HLS.** `preferLowLatency` is the switch.
  (`src/provision.sh`.) Encoder settings Cloudflare LL-HLS requires: H.264,
  CBR, fixed GOP, and B-frames OFF, because they break LL-HLS. GOP equals
  segment length, and 2 s is the shortest Cloudflare recommends.
  (`src/publish.sh`, `workers/pub/container/server.mjs`.)

## hls.js and the native path: what each default costs

From `src/low-latency-player.js` (v14).

- **hls.js picks a live-edge position ONCE and, by default, has no recovery:**
  `maxLiveSyncPlaybackRate` is 1 and `maxLatency` is Infinity, so any startup
  hiccup parks the player at an arbitrary latency for ever. Measured on the
  same stream, same config: 7.6 s one run, 15.4 s the next.
- 🔴 **A DRIFT-SEEK IS NOT FREE.** Setting `currentTime` aborts every in-flight
  fragment load, and the abort is what stops the buffer from ever growing.
  Measured on an iPhone (iOS 18.7, Safari 26.6.1, ManagedMediaSource, Safari
  gating loads): RESYNC drift fired every 2 to 3 s for two solid minutes, each
  one immediately followed by "ERR aborted" on BOTH tracks. Latency oscillated
  across the trigger (8.25, seek, 6.90, 8.34, seek) and some seeks went out
  with buf=0.02, with no runway to land on, which guarantees the stall it was
  trying to cure. The jerkiness was this control loop, not the stream: the
  publisher A/B was clean and the page had segments 0.8 s after asking. So a
  drift-seek has to earn itself three ways: enough time since the last one,
  enough buffered runway to survive it, and a target the device has not already
  proved it cannot hold. **Smooth at 8 s beats jerky at 6 s.**
- 🔴 **`capLevelOnFPSDrop` IS INERT FOR THE FAILURE THAT ACTUALLY HAPPENS.** It
  keys on `droppedVideoFrames`, and the iPhone that stutters drops almost
  nothing, 3 frames out of 507, while advancing the media clock at 0.16 to
  0.41x with 5 to 10 s buffered and the edge moving at 1.0x. Frames are not
  discarded; time crawls. Cap on the symptom that is present, which is the
  ADVANCE ratio. Measured separately: with 5 to 7 s buffered and loading
  keeping up at ~0.9x, the playhead advanced 0.94 s in 4.04 s of wall time,
  0.23x realtime on the 1280x720 rendition. Loading was never the problem;
  presentation was.
- 🔴 **DO NOT PLAY UNTIL THE AUDIO/VIDEO INTERSECTION IS PLAYABLE.** Measured on
  desktop Chrome and on iOS alike, at startup Cloudflare lands the AUDIO track
  seconds behind the video: video [[2.83,4.83],[8.83,21.83]] against audio
  [[2.85,3.36],[8.84,16.84]], so the element had 0.05 s to play while video
  held 5 s. Playing there stalls at once, the starved watchdog seeks to the
  edge, and THAT seek leaves a 5.5 s hole (3.36 to 8.84) which was still
  visible as an orphan range 40 s later. The lag itself is transient: advance
  climbed 0.26 to 1.0 by t=36 s and stayed. The whole stutter is a startup
  cascade that begins with playing too early.
- ⚠️ **A STARVED WATCHDOG MUST NOT SEEK OVER AN AUDIO-ONLY SHORTFALL.** Video
  holding seconds past the playhead while the intersection holds nothing means
  the missing piece is an audio segment, and seeking forward cannot conjure
  one. It only opens a hole, which is exactly how the 5.5 s orphan range got
  made.
- **Three hls.js knobs all default AGAINST a low-latency live start**, read off
  the bundled 1.7.1 rather than recalled: `startFragPrefetch` false,
  `initialLiveManifestSize` 1, `startOnSegmentBoundary` false. All three push
  the same way, begin with more material, on a boundary. Measured at the
  origin, with the playlist carrying 3 segments the two tracks advance in exact
  lockstep (v minus a is 0.00 s over 12 samples), so waiting for depth in one
  waits for depth in both. A boundary is the only place both tracks are
  simultaneously decodable from scratch, given one INDEPENDENT part per 2 s
  segment (measured, 10 of 38). It costs up to one segment of latency and buys
  alignment.
- 🔴 **UNDER NATIVE HLS, `currentTime` DOES NOT SHARE A TIMELINE WITH
  `seekable`.** Measured in desktop Safari over WebDriver: a healthy stream
  showed currentTime 38.42 against seekableEnd 23.5, so an edge-only source
  watchdog declared the source dead and reloaded a stream playing at exactly
  1.000x, and the reload is what then produced the misaligned,
  apparently-stalled state. The watchdog was manufacturing the fault it was
  watching for. A source watchdog on the native path needs BOTH signals frozen:
  if the playhead is advancing, the source is alive by definition.
- ⚠️ **REPORT `null`, NEVER `0`, WHEN THE PLAYHEAD SITS OUTSIDE EVERY BUFFERED
  RANGE.** Safari reported currentTime 38.42 against buffered [[18,25]] on a
  stream playing at 1.000x. 0 there reads as "starved" and drives the wrong
  decisions: 0 means measured-and-empty, null means cannot tell. For the same
  reason the drift check writes `?? 0` explicitly rather than relying on
  `null > 2` being false, because "cannot tell" must not be read as "plenty
  buffered".
- ⚠️ **MEASURE ADVANCE AGAINST A LONG BASELINE, NOT AN EMA.** The EMA was seeded
  while currentTime was still 0, before play, and then crawled toward the
  truth: it read 0.624 on desktop Safari at t=35 s while a direct two-point
  measurement of the same player gave 1.000 sustained. An exponential average
  of a quantity with a long startup transient is mostly a report on the
  transient. Move the reference point only when the playhead jumps, because a
  seek is not a playback rate.
- 🔴 **`hls.latency` FREEZES STALE DURING SOCKET-OPEN INGEST PAUSES** (measured
  1.7 s reported against 8.4 s true), and PROGRAM-DATE-TIME wall latency is the
  only honest signal there. It is always reported and only acted on when there
  is somewhere ahead to seek to, because a wall lag with nothing buffered ahead
  is player-irreducible.
- **Cloudflare emits non-monotonic `EXT-X-PROGRAM-DATE-TIME` during startup**:
  56.935 then 56.604, which is 331 ms backwards. Observed and deliberately NOT
  acted on.
- ⚠️ **A REBUILD NONCE ON THE MANIFEST URL IS OFF BECAUSE CLOUDFLARE PROPAGATES
  MANIFEST QUERY PARAMETERS INTO CHILD PLAYLIST URLs**, with unknown effects.
- ⚠️ **STATE BOTH BRANCHES SHARE MUST BE DECLARED BEFORE EITHER BRANCH CAN
  RETURN.** The rate-measurement state used to sit beside `measureRates()`,
  which is AFTER the native-HLS branch returns, so on an iPhone the
  declarations never executed and the native path's own interval threw "Cannot
  access 'lastAdvT' before initialization" every tick. The page showed nothing,
  and local verify could not catch it because desktop Chrome never takes that
  branch.
- ⚠️ **AN EVENT EMITTED SYNCHRONOUSLY INSIDE THE CONSTRUCTOR REACHES NOBODY.**
  `boot()` runs inside `createLowLatencyPlayer`, before the caller has had a
  chance to chain `.on()`. The iOS report came back with no ENGINE line at all
  and that was this bug, not a device signal. It was reintroduced once on the
  native path and caught the same way.
- **Native HLS gives one lever and it is a reload, so rate limit it.** Measured
  on an iPhone at t=153 s: MEDIA-ERROR code 3 "Media failed to decode", then
  currentTime back to 0 and nothing further. `MEDIA_ERR_DECODE` (3) and
  `MEDIA_ERR_SRC_NOT_SUPPORTED` (4) are terminal for the element, and only a
  reload clears them. Four fresh video UIDs were observed in one day
  (5265d9d9, 8cce2ccd, d0390546, 11e6883c), which a bare `<video src>` cannot
  survive at all. Rebuild storms were the direct cause of the v4 tab crash, so
  there is a hard rate limit across ALL triggers.
- **The retry policy around a live-edge part 404 is a middle path, and both
  extremes were paid for.** v4's fail-fast (1 retry) turned normal edge churn
  into fatal-then-rebuild storms that crashed the tab; v3's slow default
  backoff took 3 to 5 minutes to surface a real UID swap. A few quick retries
  with a tight timeout cap, and native uncapped retry for manifest and level
  loads so "stream not up yet" is handled inside hls.js without instance
  surgery.
- **A page opened before the broadcast exists gets a fatal
  `manifestParsingError`** (a 204, empty manifest), and patching up a live Hls
  instance afterwards (stopLoad/loadSource/startLoad) leaves it wedged with no
  errors, no loads and no recovery. The only reliable reset is destroying the
  instance and building a new one.
- **Chrome pauses muted video in background tabs and nothing on the resume path
  calls `play()` again.** A muted live player has no legitimate long-lived
  paused state, so re-request it, or a tab that becomes visible again seeks and
  stays paused for ever.

### Can it be done with the right config and no wrapper? The measured split

Asked 2026-09-25, verbatim: *"can we not use it without wrapper just 'right
config'"*. The honest answer is **partly, and the part config buys is the
smaller one.**

MEASURED 2026-09-25 against `src/low-latency-player.js` at v14. The file is
**1,070 lines** by `wc -l`, **546 of them code** and 470 comment. The
`new Hls({...})` literal is lines **401 to 461**, and inside it there are
**17 key lines**: 15 unconditional, one conditional `liveSyncDuration`, one
`...(opts.hlsConfig)` spread for the caller. That is **1.6 per cent of the file
and 3.1 per cent of its code.** Both vendored copies of hls.js in this
repository are byte identical to the official 1.7.1 dist (618,156 bytes, sha256
`6cfad701a61fb8a99add5e84449e64661169b0652bf44ceb2a28465c8817b5f1`), so there
is no patch and no fork anywhere in the picture. **Everything that is not those
17 lines is control loops.**

#### (a) What IS pure config: paste this and get real benefit with no wrapper

Every default below was read off the bundled 1.7.1 with `grep` on the minified
dist on 2026-09-25. None of them is recalled.

```js
new Hls({
  lowLatencyMode: true,                   // default true ALREADY, this line changes nothing
  backBufferLength: 30,                   // default Infinity
  manifestLoadingMaxRetry: Infinity,      // default 1
  manifestLoadingRetryDelay: 3000,        // default 1000
  manifestLoadingMaxRetryTimeout: 8000,   // default 64000
  levelLoadingMaxRetry: 4,                // default 4, unchanged
  levelLoadingRetryDelay: 1000,           // default 1000, unchanged
  fragLoadingMaxRetry: 4,                 // default 6, LOWERED
  fragLoadingRetryDelay: 500,             // default 1000
  fragLoadingMaxRetryTimeout: 4000,       // default 64000
  maxLiveSyncPlaybackRate: 1.05,          // default 1, which means no catch-up at all
  capLevelOnFPSDrop: true,                // default false
  startFragPrefetch: true,                // default false
  initialLiveManifestSize: 3,             // default 1
  startOnSegmentBoundary: true,           // default false
  liveSyncDuration: 3.0,                  // default undefined (falls back to liveSyncDurationCount 3)
});
```

- 🔴 **THREE OF THOSE SIXTEEN LINES ARE NO-OPS, AND NOTHING SAID SO UNTIL
  2026-09-25.** `lowLatencyMode` already defaults to `true` in 1.7.1,
  `levelLoadingMaxRetry` already defaults to 4, and `levelLoadingRetryDelay`
  already defaults to 1000. Keeping them in the wrapper is fine as a statement
  of intent. A reader who pastes them expecting a change gets none.
  **Thirteen lines move something.**
- 🔴 **`maxLiveSyncPlaybackRate` IS THE HIGHEST-VALUE LINE IN THE OBJECT AND IT
  IS PURE CONFIG.** Read out of the bundle: hls.js's own
  `LatencyController.onTimeupdate` touches `media.playbackRate` only when
  `lowLatencyMode` is on AND `maxLiveSyncPlaybackRate !== 1` AND the level is
  live, and it then requires `forwardBufferLength > 1` and a drift above
  0.05 s. At the default of 1 that entire controller is dead code, which is
  what "hls.js has no recovery" means in practice. One line switches on a real
  catch-up loop that already carries its own runway rule.
- ⚠️ **AND THE TWO CATCH-UP LOOPS THEN COEXIST.** The wrapper writes
  `video.playbackRate` itself on its own 500 ms tick; hls.js writes it on
  timeupdate. READ FROM THE SOURCE, not measured on a stream: at 2 s of drift
  hls.js's curve saturates straight to the 1.05 cap while the wrapper's
  `1 + drift/100` gives 1.02, so the wrapper is the GENTLER of the two. Which
  one wins at a given instant is UNMEASURED here and would need a run with both
  rates logged to settle.
- ⚠️ **THE `xxxLoading*` KEYS ARE DEPRECATED SHIMS IN 1.7.1 AND THEY LOG A
  WARNING.** `Fd(Hls.DefaultConfig, userConfig, logger)` rewrites
  `manifestLoading{MaxRetry,RetryDelay,MaxRetryTimeout}` into
  `manifestLoadPolicy`, the level ones into `playlistLoadPolicy` and the frag
  ones into `fragLoadPolicy`, then warns `setting(s) are deprecated, use
  "<policy>"`. The rewrite only happens when the matching `LoadPolicy` was not
  also passed. They work today and they are the first thing that will break on
  an hls.js upgrade. **The wrapper has not been moved off them.**
- ⚠️ **DO NOT ADD `liveSyncDurationCount` BESIDE `liveSyncDuration`.** The same
  function throws `Illegal hls.js config: don't mix up
  liveSyncDurationCount/liveMaxLatencyDurationCount and
  liveSyncDuration/liveMaxLatencyDuration`. The test is on the USER config, so
  the built-in default of 3 does not trip it, only a second key you passed.
- ⚠️ **`liveSyncDuration` ONLY COUNTS IF IT IS PASSED AT CONSTRUCTION.**
  Confirmed in the bundle: the `targetLatency` getter prefers it only when
  `this.hls.userConfig.liveSyncDuration` is set, or when `_targetLatencyUpdated`
  is set, which only the `hls.targetLatency` setter does. Assigning
  `hls.config.liveSyncDuration` after the fact is silently ignored.
- ⚠️ **AND `maxLatency` IS NOT A CONFIG KEY.** It is a getter derived from
  `liveMaxLatencyDuration` (default undefined) or
  `liveMaxLatencyDurationCount` (default `Infinity`) times target duration,
  which is where the Infinity in the header of the player file comes from.
  There is no `maxLatency: 8` to paste.

#### (b) What config cannot buy, one entry per behaviour

Every item below is a control loop, a watchdog, an event handler or a decision.
**None of them has an hls.js option behind it.** Line ranges are from v14 and
the reason is the one already written in the file or in this skill.

- **Which player to run at all: native HLS on WebKit, gated on
  `ManagedMediaSource`** (lines 235 to 289 for the decision, 533 to 666 for the
  branch, about 189 lines). Without it, Safari gets hls.js. Measured on desktop
  Safari 26.6.2 over WebDriver, same page, same 40 s: native 0.961x advance and
  5.25 s latency and 0 errors, against hls.js 0.344x and 7.71 s and 2 errors
  and a buffer hole. hls.js cannot configure itself out of being hls.js.
- **Do not call `play()` until the audio/video INTERSECTION is playable**
  (`startWhenPlayable`, lines 808 to 823, 16 lines, `startBuffer` 1.0 s with an
  8 s timeout). Without it the element plays with the 0.05 s the intersection
  offers while video holds 5 s, stalls at once, and the starved watchdog's seek
  leaves the 5.5 s orphan hole that was still visible 40 s later.
  `initialLiveManifestSize` pushes the same way but does not gate `play()`.
- **The advance-ratio cap** (lines 950 to 973, 24 lines, `advanceFloor` 0.8 for
  `advanceTicksBeforeCap` 6 consecutive ticks, then `hls.autoLevelCapping` down
  one). Without it a phone that drops 3 frames of 507 never trips
  `capLevelOnFPSDrop` and just crawls at 0.16 to 0.41x for ever. `autoLevelCapping`
  is a property, not an option, and nothing in hls.js watches rate of advance.
- **The drift-seek governor and its three conditions** (lines 988 to 1021,
  34 lines, plus the `DEFAULTS` block at 103 to 128). A drift-seek must be
  `minDriftSeekMs` 10,000 ms since the last one, have `driftSeekMinBuffer` 1.5 s
  of runway, and after `driftHeldBeforeYield` 3 refusals the player RAISES its
  own target by 1 s up to `maxTargetBias` 6. Without it you get the measured
  iPhone loop: a seek every 2 to 3 s for two minutes, each followed by "ERR
  aborted" on both tracks, some of them issued with buf=0.02.
- **Escalating a silently failing drift-seek to a rebuild** (inside the same
  block, `failedDriftSeeks >= 6`). `syncToEdge` returns false when
  `liveSyncPosition` is null or behind the playhead, and without the escalation
  the player no-ops for ever with `playbackRate` parked at 1.
- **`syncToEdge` never seeks backwards** (lines 680 to 690, 11 lines). After a
  Cloudflare UID swap `liveSyncPosition` can point BEHIND the playhead on a
  stale level, and obeying it makes things worse.
- **The starved watchdog, which must not seek over an audio-only shortfall**
  (lines 882 to 932, 51 lines). When video holds more than 2 s past the
  playhead and the intersection holds under 0.5 s, the missing piece is an
  audio segment, and it waits `audioLagTicks` 12 ticks instead. Seeking forward
  cannot conjure an audio segment; it only opens the hole.
- **The hole-skip inside that branch** (lines 896 to 907, 12 lines). A playhead
  beached at a hole with a real range just ahead gets skipped after 3
  consecutive confirming ticks, once per target. hls.js's own gap controller
  takes about 20 s to do anything, and the measured parks were 18.5 s and
  20.0 s at `readyState` 1. The 3-tick confirmation filters ordinary in-flight
  seeks; the one-attempt-per-target rule stops the measured ct 0 to skip-target
  bounce every 3 s on a wedged mid-swap level.
- **Destroy and rebuild on a fatal `manifestParsingError`** (the ERROR handler
  at 508 to 526 plus `rebuild` at 355 to 378, about 43 lines). A page opened
  before the broadcast exists gets a 204 and an empty manifest, and patching a
  live instance (stopLoad/loadSource/startLoad) leaves it wedged with no
  errors, no loads and no recovery. The backoff rises with
  `consecutiveFailures` so the first retries are quick and stale manifests are
  not hammered.
- **Media-error quick fixes before the blunt instrument** (lines 512 to 517,
  6 lines). `recoverMediaError()` twice, with `swapAudioCodec()` on the second,
  reset to zero by `LEVEL_LOADED`. Without the counter a codec-mismatch stream
  loops on recovery for ever.
- **The hard rate limit across ALL reload triggers** (lines 362 to 378, the
  3,000 ms floor, plus `rebuildCooldown` 4,000 ms disarming the watchdogs after
  one, plus `scheduleRebuild` deferring rather than dropping). Fatal errors,
  watchdogs and visibility all funnel through it. **Rebuild storms were the
  direct cause of the v4 tab crash.**
- **The source watchdog on the hls.js path** (lines 863 to 872, 10 lines). The
  live edge frozen for `sourceStallTimeout` 12 s means the origin died, and it
  runs even while paused so a playhead advancing through the remaining buffer
  cannot mask it. Cloudflare mints a NEW video UID on every encoder reconnect,
  even a 2 second one, and seeking can never recover that.
- **The source watchdog on the native path, which needs BOTH signals frozen**
  (lines 592 to 614, 23 lines). Under native HLS `currentTime` does not share a
  timeline with `seekable`: a healthy stream showed currentTime 38.42 against
  seekableEnd 23.5, and the edge-only version reloaded a stream playing at
  exactly 1.000x. The watchdog was manufacturing the fault it was watching for.
- **The player watchdog** (lines 937 to 948, 12 lines). Playhead frozen for
  `stallTimeout` 6 s seeks, and after `seeksBeforeReload` 2 failures rebuilds.
- **PROGRAM-DATE-TIME wall latency, reported always and acted on carefully**
  (lines 974 to 986, 13 lines, via `hls.playingDate`). `hls.latency` freezes
  stale during a socket-open ingest pause, measured 1.7 s reported against
  8.4 s true, and PDT is the only honest signal there. The trigger is off by
  default and additionally requires `liveSyncPosition` to be usefully ahead,
  because a wall lag with nothing buffered ahead is player-irreducible.
- **Re-requesting `play()` when Chrome pauses muted video in a background tab**
  (lines 874 to 881, 8 lines, plus `onVisibility` at 1025 to 1034, 10 lines).
  `boot()` only plays on `MANIFEST_PARSED`, so without this a tab that becomes
  visible again seeks and then stays paused for ever.
- **Reporting `null` rather than `0` when the playhead sits outside every
  buffered range** (`bufferReport`, lines 692 to 734, 43 lines). Safari reported
  currentTime 38.42 against buffered [[18,25]] on a stream playing at 1.000x.
  0 there reads as starved and drives the wrong decision: 0 means
  measured-and-empty, null means cannot tell. The same function reports the
  per-type buffers separately out of `hls.bufferController.tracks`, because
  `video.buffered` being the INTERSECTION is what makes an audio lag look like
  an empty buffer.
- **Measuring advance and edge rate against a long baseline rather than an EMA**
  (`measureRates`, lines 736 to 806, 71 lines). The EMA read 0.624 on desktop
  Safari at t=35 s while a two-point measurement of the same player gave 1.000
  sustained, because an exponential average of a quantity with a long startup
  transient is mostly a report on the transient. The reference point moves only
  on a jump, because a seek is not a playback rate, and it refreshes every 30 s.
  **`advance` is the number that separates "the device cannot keep up" from
  "the edge is running away", which have opposite fixes.** hls.js has no such
  reading.
- **`nextBufferedAhead`: a range only counts if it starts a real gap past the
  playhead and is longer than 0.5 s** (lines 329 to 336, 8 lines). Without the
  width test the player skips into a scrap and starves again immediately.
- **Watching the MediaSource directly** (`watchMediaSource`, lines 825 to 854,
  30 lines). `mediaSourceRequiresReset` with every buffer dumped appeared in
  three separate iPhone runs, and `ManagedMediaSource` also GATES loading
  through `startstreaming` / `endstreaming`. None of it is observable from
  outside, and it re-grabs every second because a rebuild makes a new
  MediaSource.
- **Freezing the last decoded frame into the poster before teardown**
  (`freezeFrame`, lines 338 to 353, 16 lines). Without it every rebuild flashes
  black.
- **Reserving layout from the master manifest before the first frame** (the
  `MANIFEST_PARSED` handler, lines 479 to 491, 13 lines). RESOLUTION is
  available about 200 ms after `loadSource` and seconds before `videoWidth` is
  set, so the aspect ratio can be set with no jump.
- **Reporting level switches** (lines 495 to 504, 10 lines). Four renditions
  with tightly clustered BANDWIDTH and one INDEPENDENT part per 2.0 s segment
  make ABR churn a jank candidate, and it is UNMEASURED on the device that
  showed the problem, so the count is emitted for a phone to answer it.
- **A reload on terminal element errors and on `ended`, on the native path**
  (lines 632 to 640, 9 lines). `MEDIA_ERR_DECODE` (3) and
  `MEDIA_ERR_SRC_NOT_SUPPORTED` (4) are terminal for the element and only a
  reload clears them. Measured at t=153 s on an iPhone: code 3, then
  currentTime back to 0 and nothing further.
- **Native latency from `getStartDate()`, with nothing else hidden behind it**
  (lines 579 to 586 and 616 to 629). Native HLS exposes no `hls.latency`. The
  first Safari run reported an entirely empty readout for 45 s because every
  field sat behind `getStartDate()`, exactly when the numbers were most wanted.
- **Shared state declared above the point where the native branch returns**
  (lines 291 to 321, 31 lines). It used to sit beside `measureRates()`, which
  is AFTER that return, so on an iPhone the native interval threw "Cannot
  access 'lastAdvT' before initialization" every tick and the page showed
  nothing. Desktop Chrome never takes that branch, so local verify could not
  catch it.
- **Deferring the `engine` emit out of the constructor** (lines 473 to 477 and
  538 to 545). A synchronous emit inside `createLowLatencyPlayer` reaches
  nobody, because the caller has not chained `.on()` yet. The iOS report came
  back with no ENGINE line and that was this bug, not a device signal, twice.
- **The events and the surface itself** (`api`, lines 1048 to 1069, 22 lines):
  `latency`, `dimensions`, `rebuild`, `resync`, `stall`, `start`, `level`,
  `advance-capped`, `target-raised`, `audio-lag`, `ms`, `engine`,
  `media-error`, `waiting`. This is what makes a page gradable at all, and
  `demo/llhls/index.html` asserted on exactly these until its input was
  retired on 2026-10-13; /video/llhls/ is the live caller now.

#### The answer, in one paragraph

**Take the config. It is thirteen effective lines, it is free, and
`maxLiveSyncPlaybackRate` alone turns hls.js's own latency controller from dead
code into a working catch-up loop.** What it does not buy is any behaviour that
depends on deciding something: a stream whose UID changed mid-broadcast still
needs a destroy-and-rebuild, a page opened before the broadcast exists still
wedges, an iPhone still crawls at 0.2x with a full buffer while reporting no
dropped frames, and Safari still gets the worse of two players. **Config sets
the starting conditions. The other 98 per cent of the file is what happens
after something goes wrong**, and every rule in it was written after shipping
the version without it.

🔴 **ONE THING THE FILE AND THIS SKILL DISAGREED ABOUT, FOUND 2026-09-25.** The
line above reading "Native HLS gives one lever and it is a reload, so rate limit
it" and the file's own comment reading "rate limited, because a reload storm is
worse than a stall" are both describing a rate limit that **does not run**.
`nativeReload()` at line 564 tests `since < cfg.nativeReloadCooldownMs`, and
`nativeReloadCooldownMs` is **defined nowhere**: not in `DEFAULTS`, not in any
caller, `grep` across the repository returns only the two copies of that same
line in `src/` and in the deployed `workers/view/public/src/`. `since <
undefined` is `false`, so the guard never returns and the native path has no
cooldown of its own. What bounds it in practice is the surrounding code rather
than the named limit: the source watchdog resets `nativeEdgeMoved` before
calling, which re-arms a 12 s timer, and the other two triggers are element
events. ⚠️ **This is not fixed here** (documentation-only task, and `src/` is
deployed). Fixing it is one line in `DEFAULTS`, and the honest fix also needs a
number chosen rather than guessed.

## Timed messages beside a stream

From `src/timed-messages.js`.

- 🔴 **CLOUDFLARE STREAM'S TRANSCODE STRIPS ALL IN-BAND METADATA: ID3, SCTE-35,
  DATERANGE AND SEI, VERIFIED.** So messages travel on a side channel and are
  aligned to the video by the wall clock LL-HLS embeds per segment
  (`EXT-X-PROGRAM-DATE-TIME`), reached through `hls.playingDate` on the hls.js
  path and through `getStartDate()` on the Safari native path, where it is the
  PDT at `currentTime === 0`.
- **A cue is `{id, at, data}` where `at` is epoch ms of the STREAM moment it
  belongs to.** Each viewer's playhead lags live by their own amount, so a cue
  fires when THEIR playhead reaches `at` and every viewer sees it at the same
  point in the video regardless of their individual latency. That is what beats
  in-band ID3: cues can be scheduled ahead, revised, cancelled, and delivered
  to viewers who joined late.

## ERR's live HLS: somebody else's segments

An `external` node in the bay (see the first section). The do-not-probe
rules in CLAUDE.md, *"What costs real money and somebody else's server"*,
bind every line here.

- **ERR blocks live segments by PROGRAMME, not by age.** The playlists are open
  (200 + `access-control-allow-origin: *`), the segments under `/live/hls/` can
  be 403 with NO ACAO — which reaches a browser as a CORS failure, so hls.js
  holds an empty buffer and the cell just stays black. Swept at 13 points
  across each 2 h window on 2026-09-06: `etv` refused its newest ~45 min,
  `etv2` refused its OLDEST ~78 min and served the edge, `etvpluss` served
  everything. It moves with the schedule and it is not always at the edge, so
  there is no offset to hard-code. A served segment honours Range, so a 2-byte
  GET asks "will you serve this one?" — `flipper` sweeps back from the edge,
  starts where ERR will serve, and puts the refused minutes in its readout.
  ⚠️ `flipper` was archived 2026-10-12 (`archive/demos/flipper-index.html`,
  a 404), and that range GET is a probe of somebody else's server, which the
  2026-09-16 rule in CLAUDE.md forbids for finding out whether it is up.

## Relaying somebody else's Icecast

From `workers/shout/worker.mjs`.

- 🔴 **ONE UPSTREAM CONNECTION PER MOUNT, FANNED OUT TO EVERY LISTENER.** Until
  2026-09-16 this relay was a pass-through: every request did its own
  `fetch(upstream)` and handed the body straight back, so **N browsers were N
  listeners at the broadcaster**, plus one per harness tab and one per orphaned
  Chrome. On 2026-09-15 that reached about a hundred concurrent clients against
  one operator's limit, and on 2026-09-16 ERR said the same traffic was
  corrupting their public listener statistics, which is a fact about their
  funding rather than about their bandwidth. `idFromName(station)` gives every
  mount exactly one object in the world; that object opens the origin once and
  copies the bytes to everybody. `GET /tee/<id>` reports `upstreamConnections`
  and it must read 1. ⚠️ `?direct=1` IS DELIBERATELY NOT OFFERED: an escape
  hatch back to a connection per client is the defect with a flag on it.
- ⚠️ **THE ICY METADATA IS STRIPPED AND RE-INSERTED PER SUBSCRIBER, AND THAT IS
  NOT A FLOURISH.** Icecast interleaves a metadata block every `icy-metaint`
  bytes COUNTED FROM THE FIRST BYTE THE CLIENT RECEIVED. A tee hands a late
  joiner bytes from the middle of the origin's stream, so its byte 0 is not the
  origin's byte 0 and every block it expects lands in the wrong place: it would
  read audio as a length byte and then delete that many bytes of sound. Each
  subscriber counts its own bytes, which is why a listener who joined a minute
  late still gets a block exactly 16000 bytes in. ⚠️ A late joiner starting
  mid-frame is fine: an MP3 decoder scans for the next sync word.
- 🔴 **Icecast 2.4.4 ANSWERS HEAD WITH `400 Bad Request`, MEASURED AGAINST EVERY
  MOUNT.** Forwarding the method verbatim made the relay report a healthy
  station as a 502, and every uptime checker that HEADs a URL would have
  believed it. ALWAYS GET upstream, keep the headers, and cancel the body
  before a frame of audio is paid for.
- 🔴 **A HEALTH ROUTE THAT FANS OUT IS A LOAD GENERATOR.** One innocuous-looking
  request opened SIX upstream connections, the page polled it every 30 s per
  open tab, and every harness run called it, forty runs in an afternoon.
  MEASURED afterwards: three ERR mounts began answering this Worker **502 in
  9 ms** while the same mounts served a laptop 200, and nine milliseconds is
  too fast to have reached Estonia. That is a refusal at the first hop, and it
  was earned. So answers are CACHED for `HEALTH_TTL_MS` (20000 ms), a caller
  may ask about only the stations it needs, and a refusal is not answered with
  another request.
- ⚠️ **CANCEL EVERY BODY.** These are ENDLESS streams: a probe that reads the
  status line and walks away leaves one socket per station open on the origin
  for as long as the runtime keeps this invocation, which turns a health check
  into a load generator against a volunteer's Icecast. `?bytes=N` closes the
  connection after N bytes for the same reason: a radio stream never ends, so
  without a bound every probe has to decide when to hang up, and a harness that
  forgets leaves a socket holding the origin open for the length of the run.
- ⚠️ **IT SAID "NEVER CACHED" AND THAT WAS THE MISTAKE.** The reasoning, that a
  cached answer about a live stream is wrong in the confident direction, is
  true and was the wrong thing to optimise for. Twenty seconds of staleness
  about a station that has been up for hours costs nothing; six upstream
  connections per caller cost the broadcaster, and they stopped answering.
  Freshness is a preference; their bandwidth is not ours.
- 🔴 **A PAGE CANNOT ASK "IS THIS MOUNT UP" BY FETCHING THE MOUNT.** A dead
  mount answers 502 and **the browser logs that to the console**. There is no
  way to suppress it from script, so a page that probes before it plays trips
  its own "no console errors" check, and a visitor watching a phone sees a red
  line about a station being down rather than the page handling it. Answer the
  question with a 200 whatever the answer is, from the thing that knows.
- 🔴 **THE CONTENT-TYPE IS FORWARDED, NEVER INVENTED.** A fallback to
  `audio/mpeg` was harmless while every mount here was MP3 and is a trap now
  that two of them are AAC: the page reads its frame scanner off this header,
  and a scanner pointed at the wrong framing finds NOTHING rather than finding
  rubbish. A default would turn a missing header into a confident wrong answer,
  and the page handles an ABSENT one correctly by looking at the bytes.
- 🔴 **NOT `!up.ok`. A RANGE REQUEST ANSWERS 206**, which is not `ok` on some
  readings and is exactly what a working seek looks like. Guarding on `ok`
  would have made every scrub report the origin as broken.
  (`workers/vain/worker.mjs` carries the same line for the same reason.)
- ⚠️ **WITHOUT `access-control-expose-headers` A BROWSER SEES THE RESPONSE AND
  NOT ONE HEADER OF IT.** The ICY fields only exist on this protocol, and a
  recording needs `content-length` and `content-range` or a page cannot draw a
  scrub bar for it. A live mount has neither and never will.
- ⚠️ **`desiredSize` GOES NEGATIVE WHEN A SOCKET IS NOT DRAINING**, and it is
  the only backpressure signal there is here. Radio has no rewind, so a
  listener that far behind is dropped rather than buffered for.
- 🔴 **A MOUNT ON PLAIN HTTP IS NOT A CORS PROBLEM, IT IS A MIXED-CONTENT
  REFUSAL.** `radio1965` (the Radio 1965 mount, `icy-name: Radio 1965`; the demo
  of that name is /archive/radio/ since 2026-10-13) is Icecast 2.4.4 on port 8001 with no TLS and no
  `access-control-allow-origin`, so an HTTPS page cannot play it at all, not
  "cannot measure it", cannot play it: the browser refuses the mixed-content
  load before any CORS question is asked. MEASURED DIRECT 2026-09-14:
  `audio/mpeg`, 128 kbit/s 44.1 kHz stereo, `icy-name: Radio 1965`,
  `icy-metaint: 16000`, mean volume -20.4 dB against a synthesised-silence
  control at -91.0 dB.
- ⚠️ **THE MOUNT AT THE FRONT OF A PAGE'S LIST IS THE ONE EVERY VISITOR AND
  EVERY RUN OPENS.** That is the half that actually caused the damage: two
  mounts were moved to the FRONT an hour before the operator reported roughly
  100 concurrent clients, and at 320 kbit/s they are 2.5x the weight of any
  other mount there. Both restored stations sit at the BACK and nothing may
  move them forward. ⚠️ **THE OPERATORS HAVE NOT BEEN RE-ASKED**, and that is
  worth saying rather than implying consent from a mechanism: what changed is
  the SIZE of the claim, not their permission.
- **The body is passed through UNTOUCHED and UNBUFFERED.** `new Response(up.body)`
  hands Cloudflare the upstream ReadableStream, so bytes leave as they arrive.
  Anything that reads the stream here (a TransformStream that inspects ICY
  metadata, say) would add a hop of latency to every byte for no gain.
- **An allowlist, never a URL parameter.** An unbounded URL parameter would make
  the worker a bandwidth laundromat for whoever finds it, and the account's
  egress is the project's. The same argument makes `/rec/` a PATTERN rather
  than a path parameter: a slug of at most twenty characters and a datestamp,
  no slashes, no dots beyond the one, no traversal to reason about.

## R2: multipart, caps, and the TTL sweep that deletes everything

From `workers/vain/worker.mjs`, `workers/ingest/worker.mjs`,
`workers/selfrec/src/index.js`.
⚠️ **2026-10-14: TWO OF THE THREE ARE GONE AND THE RULES STAND.** vain was
retired 2026-10-02 (`fdc5677a`, *"eccm's uploads run their protocol now"*):
its worker is at `archive/vain/worker.mjs` and `workers/vain/` holds only a
`.wrangler` cache. selfrec was deleted from Cloudflare 2026-10-13 and its
source stays in `workers/selfrec/`. `workers/ingest/` is the live write path,
and the `ingest` cell of the TRANSPORTS table (`file` over a network or the
internet) names it. Every `workers/vain/worker.mjs` below means
`archive/vain/worker.mjs`.

- 🔴 **R2 REFUSES A MULTIPART UPLOAD WHOSE NON-TRAILING PARTS ARE NOT ALL THE
  SAME SIZE** (error 10048, `InvalidPart`), and the refusal arrives at
  `complete()`, after every byte has been sent. So a client that speeds up when
  the link looks good fails at the end of a twenty-minute upload. The piece size
  is fixed by the server at `/open` and never adapts, and a non-final piece that
  is not exactly `pieceBytes` is a 400 at the moment it arrives.
- **R2's part ceiling is 10,000, READ from
  developers.cloudflare.com/r2/platform/limits/ on 2026-09-15.** At 16 MiB that
  is 156 GiB. **R2 itself would take ~5 GiB in one PUT**
  (`workers/ingest/worker.mjs`), so a per-object cap in this repo is never a
  platform limit.
- 🔴 **A WORKER'S REQUEST BODY LIMIT IS A PROPERTY OF THE ZONE PLAN**, and
  positron.studio is on Free, where it is 100 MB. A two-hour broadcast at the
  bitrate that server records is 115.2 MB, so it does not fit in one request. A
  design that never sends more than 16 MiB is right on every plan and needs
  nobody to remember which one this is. It also makes an acknowledgement arrive
  every 16 MiB, from the far side of the wire, which is the only kind of
  progress that is evidence.
- 🔴 **`Date.now() > null` IS TRUE AND `now <= null` IS FALSE, AND BOTH TRAPS
  ARE ONE COERCION AWAY.** A tier with no expiry has to be written as an
  explicit null check in two places: a plain comparison would 410 every
  permanent upload on its first piece, and a sweep without the explicit skip
  falls straight through and DELETES EVERY KEPT SESSION on its first run. Both
  files call that the worst bug available in them.
- 🔴 **THE TIER IS THE DEFAULT VALUE, NEVER AN ELSE-BRANCH.** `tierOf` returns
  the untrusted tier unless a token VALIDATES: never "not open" by elimination,
  never a truthy check on a header that might be absent, because a mistake in
  the other direction is not an error, it is handing an anonymous caller the
  untimed path or the permanent archive. The constant-time-ish compare is a
  length check then a char-by-char XOR, so the answer does not leak the token's
  prefix through timing.
- **Read the body FIRST so the charge is against the real length rather than a
  client-declared `content-length`.** A declared size that was a lie is caught
  at piece 0, and checked a third time at `complete()` against the sum of what
  was actually read.
- **Check the magic number before anything exists in R2.** A refused first piece
  leaves the bucket untouched: no object, and not even a multipart upload
  waiting seven days to be abandoned. `File.type` is a CLIENT CLAIM derived
  from the extension and is never the check; a disagreement is a 415 that NAMES
  THE FIRST FOUR BYTES, so the person can see why rather than being told no.
- 🔴 **THE AUDIO IS WRITTEN FIRST AND THE SIDECAR LAST, AND THE ORDER IS THE
  WHOLE ANSWER TO THE TWO-WRITE PROBLEM.** A half-failure then leaves audio
  with no sidecar, which can be repaired by reading the audio again. The other
  order leaves a record pointing at nothing, which is a ghost that outlives
  everybody who remembers what it was.
- **`list({prefix, delimiter: '/'})` IS the index, and the honest ceiling is
  1,000 keys a page**, reported rather than discovered. A directory per
  recording returns the RECORDINGS rather than every file, ordered by upload
  time because the key begins with it. A cached `index.json` waits until a
  sweep is MEASURABLY slow: building the cache first means building a cache
  nobody can measure against the thing it caches. **The key encodes the UPLOAD
  time and never the recorded one**, because correcting a recorded date must
  never mean copying a 100 MB object.
- **R2 verifies a body against `X-Chunk-Sha256` SERVER-SIDE during put**, so a
  corrupt or truncated upload FAILS the put. That is stronger than the
  etag==md5 HEAD compare, which the client still does for availability proof.
  (`workers/selfrec/src/index.js`.)
- **A delete needs a TOMBSTONE, because uploads arrive after it.** A dead tab's
  elastic buffer drains late, so a consent delete writes `deleted.marker` and
  the reconcile mode checks it before re-deriving anything.
  (`workers/selfrec/src/index.js`; `workers/instrument/src/index.js` does the
  same at row level and REJECTS an append to a deleted session, so a late flush
  from a tab that did not hear about the delete cannot resurrect it.)
- **A caps DO is the only place two parallel uploads cannot both pass a check.**
  A per-request check against KV or isolate-local state lets both read "under
  the cap" and both write, which is how a cap becomes a suggestion.
- 🔴 **THE PRINCIPAL IS NOT THE ADDRESS, AND ASKING IT AS ONE QUESTION MEANT THE
  ARCHIVE TIER COULD NEVER UPLOAD A BYTE.** `/open` records the token for a
  trusted upload and a hash of the address for an anonymous one, so a trusted
  caller is not charged against whatever network it happens to be on. Every
  later route then compared the address hash against a session whose principal
  was the string `tier:keep`, which can never match: every piece of every kept
  upload answered 403. MEASURED before the fix: the sandbox path was green end
  to end while the archive path could not accept piece 0, and no check that
  used the sandbox could see it. (`workers/vain/worker.mjs`.)
- **A format-aware store only writes a playlist for the format that can be in
  one.** ffmpeg emits real MPEG-TS and a browser's MediaRecorder emits WebM; an
  HLS playlist listing WebM segments does not play.
  (`workers/ingest/worker.mjs`.)
- **A sandbox tier has to be big enough to run the loop it is a sandbox for.**
  The check tier was 8 MiB, one piece with room to spare, which made the page's
  own piece loop UNTESTABLE above one piece on a route whose whole subject is
  what happens after the first one. 48 MiB takes a 40 MB file through a
  non-final piece, a second non-final piece and a short trailing one, which is
  every case R2's uniform-part rule can refuse. (`workers/vain/worker.mjs`.)

## What the edge does before your Worker runs

- 🔴 **STATIC ASSETS ARE SERVED BY THE EDGE BEFORE THE WORKER RUNS.** A header
  the Worker adds covers only what the Worker itself returns: it covers none of
  the pages, none of the modules and none of the committed cache, because for
  those the Worker is never invoked at all. `public/_headers` is the other
  half, and the two must keep saying the same thing. ⚠️ `_headers` IS A CONFIG
  FILE, NOT AN ASSET: Cloudflare reads it at upload and does not serve it, and
  `/*` matches every path on every hostname the Worker answers, including the
  `workers.dev` name that `workers_dev: true` keeps alive.
  (`workers/view/src/index.js`, `workers/view/build.mjs`.)
- **Assets are tried BEFORE the Worker, so a file in `public/` silently shadows
  a route.** `robots.txt` is served from the Worker precisely so no build
  allowlist can drop it, and the comment notes that if one ever appears in
  `public/` it would win silently and the route would go dead.
- ⚠️ **HEAD AS WELL AS GET ON ANY ROUTE WITH NO ASSET BEHIND IT.** A GET-only
  guard sends a HEAD straight to the 404: `curl -sI` on the robots route read
  `404` while `curl -s` on the same URL read the file, which is the shape of a
  bug that survives being tested.
- 🔴 **THE EDGE DOES NOT COMPRESS AN EXTENSION IT HAS NEVER HEARD OF. MEASURED
  2026-09-23 AGAINST THE DEPLOY.** Shipped as `libfaust-wasm.data` the file
  came back with NO content-type and NO content-encoding, 2,407,445 bytes
  whole, while the `.wasm`, the `.js` and the `.mjs` beside it were all brotli.
  That is 2 MB of a visitor's bandwidth on the one file in the set that
  compresses best. It is served as `.txt` now and it honestly is one: 99.95 per
  cent of its bytes are printable. (`workers/view/build.mjs`.)
- ⚠️ **`caches.default` IS PER COLO.** A visitor in another region misses it and
  would go to the upstream. `cf.cacheEverything` on the upstream fetch makes
  the SUBREQUEST cacheable too, so a colo miss still lands in Cloudflare's own
  cache rather than on somebody else's server. Three layers, each covering the
  one before's miss: browser (cache-control) then colo (`caches.default`) then
  CF (`cf.cacheEverything`), and the upstream is asked roughly once per object,
  ever. (`workers/view/src/index.js`.)
- ⚠️ **A CACHE KEY THAT IS NOT THE REQUEST URL.** A browser may send the same
  request with any order of query parameters and any casing, so the edge entry
  is keyed on the three things that decide the bytes and two spellings of one
  picture are one entry rather than two upstream fetches.
  (`workers/view/src/index.js`.)
- 🔴 **"CORS-CLEAR" IS ABOUT DISPLAY, NOT ABOUT READ, AND THE DISTINCTION IS
  INVISIBLE UNTIL SOMETHING TRIES TO READ.** CORRECTED 2026-09-14: MEASURED
  with an Origin header, both `arhiiv-images.err.ee` and the
  `arhiiv-img.err.ee` resizer answer 200 with NO `access-control-allow-origin`
  at all. A page can DISPLAY such an image; it cannot read its pixels, and
  `texImage2D` on one throws a SecurityError. A WebGL grid of remote thumbnails
  needs them same-origin, which is the only reason that proxy route exists.
  (`workers/view/src/index.js`.)
- **A POST + JSON upstream forces an OPTIONS preflight**, and `arhiiv.err.ee`'s
  OPTIONS answers 204 WITHOUT `access-control-allow-origin` (measured,
  `research/err-archives-2026-08.md`), so that one endpoint must be proxied
  while every CORS-clear GET beside it goes direct from the browser, untouched.
  (`workers/view/src/index.js`.)
- **Cloudflare's edge 1010-blocks generic or default user agents** (measured,
  `proto/m2m`), so a server-to-server fetch out of a Worker has to send a real
  one. (`workers/rtc/src/index.js`, deleted from Cloudflare 2026-10-13, source kept.)
- ⚠️ **A CUSTOM REQUEST HEADER MUST BE LISTED IN
  `access-control-allow-headers` OR THE POST FAILS ITS PREFLIGHT AND THE
  BROWSER REPORTS A BARE "Failed to fetch"** (found the hard way with
  `X-Chunk-Sha256`). (`workers/instrument/src/index.js`.)
- 🔴 **ONE `User-agent` PER GROUP IN robots.txt. NEVER A SHARED ONE.** The
  shared form (N `User-agent` lines above one `Allow`) is legal under RFC 9309
  and Meta's parser does not honour it: `facebookexternalhit` binds directives
  to the NEAREST `User-agent` line only, so it fell through to `* Disallow` and
  the Sharing Debugger reported a 403 while the edge had served it 200 all
  afternoon. That is a synthetic code for "robots.txt refuses me", and it sent
  the sibling project on an evening's tour of Bot Fight Mode, Browser Integrity
  Check and AI Crawl Control before zone analytics said the requests had never
  been blocked at all. Write this file in the dumbest parser's dialect and the
  whole class of bug goes away. (`workers/view/src/index.js`.)
- **Of the three noindex channels, `X-Robots-Tag` is the one that works.** A
  meta tag covers only HTML whose head carries it; robots.txt stops a compliant
  crawler FETCHING and does not stop one LISTING a URL it heard about
  elsewhere; the header rides on EVERY response and is the only one of the
  three that removes a URL already in an index. ⚠️ **MARK THE WRAPPER, NOT THE
  HELPER**: most traffic on `feedback` returns a Durable Object's response
  verbatim without ever passing through `json()`, so marking the helper would
  have missed the majority of real requests while looking like a fix.
  (`workers/view/src/index.js`, `workers/feedback/src/index.js`.)
- **A global gate is a single Durable Object in front of every upstream call.**
  `idFromName('err')`: every Worker isolate in every colo routes through one
  object, a DO runs single-threaded, and the read-reserve-write happens with no
  interleaving because there is no `await` before the state is written. The
  slot is reserved SYNCHRONOUSLY and the caller is told how long to wait before
  using it, so the waiting happens in the Worker and a queue costs DO time
  nothing. Guarantees on this deployment: upstream calls spaced at least
  `MIN_SPACING_MS` (1000) apart globally, at most `DAY_CAP` (400) per UTC day
  across all visitors. (`workers/view/src/index.js`.)
- ⚠️ **AN ISOLATE-LOCAL RATE GUARD IS A CEILING, NEVER CORRECTNESS.** Workers
  isolates come and go, so a per-isolate window does not bound the rate
  globally. What it does is collapse a BURST, which is the shape the traffic
  actually had: a harness run and every open tab asking within the same few
  seconds. A hard global bound needs a Durable Object.
  (`workers/shout/worker.mjs`, `workers/selfrec/src/index.js`.)
- **NO SOFT 404s.** Serving a viewer for any slug-shaped path means the reader
  sees "could not load" while a crawler, a link checker and every automated
  caller see 200 and success. A page that says it is broken is not the same as
  a site that says so, and only one of them is true to anything but a human
  eye. (`workers/view/src/index.js`.)

## Deploying: the interlock, the artefact, and the auth trap

- 🔴 **`build` AND `wrangler deploy` ARE TWO COMMANDS ABOUT TWO DIFFERENT
  MOMENTS AND NOTHING JOINS THEM.** With two agents in one checkout it is: A
  builds, B builds, A deploys and ships B's tree under B's stamp. Every
  downstream rule then quietly stops working: "attribute a run to a build
  before iterating on it" reads a stamp that is somebody else's, and "confirm
  the stamp changed before asking anyone to retest" confirms it, because it did
  change, to the wrong thing. There is no output anywhere that looks wrong,
  which is the worst shape there is. So: build, fingerprint the output over
  CONTENT rather than mtimes, and refuse to upload if one byte of it moved in
  between. ⚠️ The check runs as LATE as it can, because between the build
  finishing and wrangler opening the first file is the entire window another
  build has to land in, and it is seconds wide in practice.
  (`workers/view/deploy.mjs`.)
- 🔴 **A FIXED OUTPUT DIRECTORY IS A SHARED MUTABLE GLOBAL.** `public/` is
  `rm -rf`'d and rewritten on every run, so two builds at once means one of
  them empties the directory the other is copying into, with nothing in either
  output saying so. MEASURED 2026-09-14: one ordinary build left **60 files
  dirty, none of them written by a person**, which is what every other agent's
  `git status` then has to be read through. `--out <dir>` (or `BUILD_OUT=<dir>`)
  builds somewhere else and is the answer whenever the question is "does the
  build still pass?". (`workers/view/build.mjs`.)
- 🔴 **AN ASSETS DIRECTORY IS UPLOADED VERBATIM AND PUBLICLY.** The repo root
  holds `.env` with 13 live secrets, which is why the build copies an explicit
  allowlist of files and never a directory glob. Enumeration is confined to one
  known subdirectory level and filtered to web extensions, so there is no path
  by which a secret enters `public/`. (`workers/view/build.mjs`.)
- 🔴 **AN ALLOWLIST FAILS SILENTLY BY DESIGN, AND THAT SHIPPED A 404 TO
  PRODUCTION MORE THAN ONCE.** `/items/` renamed `manifest.json` to
  `manifest.webmanifest`, the build silently declined to copy it, and the
  deploy went out with `<link rel="manifest">` pointing at nothing, which is
  the one file an iPhone reads to decide whether a page may be installed at
  all. `.mp4` failed the same way on `/stage/`: the build copied the film's
  provenance JSON beside it, declined the film, and would have said
  `copied 182 files` about it. So the build refuses over three separate checks:
  a listed file that is not on disk, a module importing something undeployed,
  and a literal `vendor/` or `defs/` URL in the source with nothing behind it.
  ⚠️ **A BINARY IS NOT IMPORTED, IT IS FETCHED BY URL, AND A URL IS JUST A
  STRING TO EVERY CHECK**, which is why the third one had to exist.
  (`workers/view/build.mjs`.)
- ⚠️ **THE IMPORT CHECK HAS TO SCAN MODULES, NOT JUST PAGES.** While it read
  HTML only, `demo/shell/moq.mjs` went on importing a path a slug rename had
  moved for the whole life of that rename: a 404 that killed the module, so two
  demos never reached `__demo.ready` and asserted NOTHING, and both read as red
  for a plausible wrong reason. (`workers/view/build.mjs`.)
- 🔴 **EVERY REFUSAL RUNS BEFORE ONE BYTE IS WRITTEN OR DELETED**, and that was
  not true until 2026-09-14 while the check's own comment said it was. All four
  calls sat BELOW the copy loop, so a listed file that was not on disk produced
  a raw `ENOENT` from `copyFile` in the middle of the run, on top of an `OUT`
  that had already been emptied: a half-built output directory and a stack
  trace, which is the exact failure the comment claimed was prevented. MEASURED
  by moving `scsynth-nrt.wasm` aside and watching it happen.
  (`workers/view/build.mjs`.)
- 🔴 **A BUILD STAMP NEEDS THE SHA, THE CLOCK AND A DIGEST OF THE BYTES.** The
  sha alone is not enough because an uncommitted edit deploys under the
  previous one. A time says WHEN and never WHOSE: two working trees at one sha,
  built seconds apart by two agents, differ by a number that looks like a clock
  and carries nothing about which tree shipped, so "attribute a run to a build
  before iterating on it" quietly stops working there, because the stamp DID
  change and it is the wrong build's. The digest is over the bytes themselves,
  so two identical trees stamp identically and two different ones cannot. ⚠️
  Read the stamp back OUT of the artefact rather than recomputing it: a stamp
  derived twice can disagree with itself, and then the number quoted to a phone
  is not the number on the edge. (`workers/view/build.mjs`,
  `workers/view/deploy.mjs`.)
- 🔴 **IT ALWAYS LISTS AND IT NEVER REFUSES.** The dirty-tree gate started as a
  refusal and was priced by the agent on the receiving end of it: they had
  deployed five times in ninety minutes, every one at the user's explicit
  instruction, every one with legitimate half-finished work in the tree. A gate
  would have fired on all five, so the override would have been typed five
  times and been muscle memory by the third. That is this repo's own rule
  arriving somewhere new: *"a colour scale whose normal reading is a warning
  has no warning left."* ⚠️ AND THE HARM WAS NEVER THE DEPLOYING. Every one of
  those deploys was the right call. The harm was that the OTHER agent did not
  know, and what fixed that was the announcements. So the part worth automating
  is the part a person cannot forget to do: enumerate, out of git rather than
  out of somebody's memory, exactly what is going out uncommitted. `--strict`
  is for when the tree SHOULD be clean, and there the refusal means something
  precisely because it is not the normal answer. (`workers/view/deploy.mjs`.)
- 🔴 **`npx wrangler deploy -c workers/<x>/wrangler.jsonc` FROM THE REPO ROOT
  FAILS, AND THE MESSAGE NAMES THE WRONG THING.** MEASURED 2026-09-16: it
  failed with `Authentication error [code: 10000]` while announcing that it was
  using `CF_API_TOKEN` from the environment, and the same deploy through
  `workers/view/deploy.mjs` had succeeded minutes earlier. The difference is the
  working directory and the cleaned environment. Unset `CF_API_TOKEN` and
  `CLOUDFLARE_API_TOKEN` rather than requiring a particular working directory,
  which is the documented fix and the one nobody has to remember.
  (`workers/shout/deploy.mjs`, `workers/view/deploy.mjs`.)
- ⚠️ **A WORKER WITH NO BUILD STEP HAS NO BUILD/UPLOAD INTERLOCK TO WORRY
  ABOUT.** `workers/shout/worker.mjs` is the deployed artefact: what is on disk
  is what ships, and the race two agents share over one `public/` has no
  equivalent there. (`workers/shout/deploy.mjs`.)
- **Stripping a path prefix on deploy makes two sources able to land on one
  destination.** Refuse rather than let the later copy win silently.
  (`workers/view/build.mjs`.)

## What a measurement off this zone is worth

From `workers/view/analytics.mjs` and `workers/wish/src/index.js`.

- 🔴 **A GRAPHQL FAILURE ARRIVES AS HTTP 200 WITH AN `errors` ARRAY AND A NULL
  `data`.** Nothing about the response status says anything went wrong, so a
  caller that only checks `r.ok` prints an empty table and calls it a quiet
  week. Check both halves and show the API's own words.
- 🔴 **ONE QUERY MAY SPAN AT MOST ONE DAY on this zone**, so a week is seven
  queries merged on the laptop rather than one query with a wider filter, and
  the refusal is an error inside a 200 response. MEASURED: a wider filter is
  refused by name, and `httpRequestsAdaptiveGroups` is refused entirely older
  than 4w3d. **CLAMP BEFORE ASKING, NOT AFTER**: a `--since 2026-01-01` typed
  by somebody who has not read the header is 260 round trips that all fail the
  same way.
- 🔴 **`count` IS ALREADY THE ESTIMATE. DO NOT MULTIPLY BY
  `avg.sampleInterval`.** PROVED WRONG on 2026-09-15, a whole UTC day: `count`
  with `requestSource: eyeball` read 22,672 where the unsampled
  `httpRequests1dGroups` read 22,732, which is 0.26% apart, while `count` times
  the 1.54 average interval would have read about 35,000. Multiplying would
  inflate every figure by half. `requestSource: "eyeball"` is what makes the
  two datasets agree: the zone also carries `edgeWorkerFetch`, the worker's own
  subrequests, which are real traffic and are not a visitor.
- 🔴 **A REQUEST COUNT IS NOT A PERSON, AND ON THIS ZONE MOST OF IT IS US.**
  MEASURED 2026-09-16 over 24 hours: the single busiest user agent was a
  desktop Chrome on one Estonian address, the second was a Quest 3, and the
  third was `HeadlessChrome`. Those are this repo's owner, this repo's headset
  and this repo's own `verify.mjs`. A "visitors" figure taken off the top of
  this data and quoted anywhere would be mostly a measurement of us working.
- 🔴 **THE BOT SHARE IS A FLOOR, NEVER A TOTAL.** `verifiedBotCategory` is
  Cloudflare's own verification and the only layer that cannot be faked: it
  caught 58 requests of 13,350 in that same day, which is not the bot share, it
  is the HONEST bot share. A headless crawler wearing an ordinary Chrome user
  agent is INVISIBLE here, because `botScore`, `botManagementDecision` and
  `jsDetectionPassed` are all refused on this plan by name, MEASURED, not
  assumed. Say "at least", never "only". ⚠️ **AND THERE IS NO REFERRER ON THIS
  PLAN**: `clientRefererHost` and `clientRequestReferer` are both refused, so
  "where did they come from" is answerable as a COUNTRY and not as a link. Do
  not quote an empty referrer table as evidence that nobody links here.
- ⚠️ **A PAGE OPEN IS COUNTED AS AN HTML RESPONSE, NOT AS A SESSION.** A reload
  is a second open, a page kept in a tab for an hour is one, and a page opened
  from the browser's back-forward cache is none. `clients` is distinct client
  addresses, which merges a household behind one address and splits one phone
  that changed network.
- 🔴 **THE MACHINE'S WRANGLER OAUTH TOKEN IS ENOUGH** for the Analytics API: no
  API token has to be minted, because `zone:read` and `account:read` in the
  OAuth grant carry the whole query, and it is read out of wrangler's own
  config file rather than from an environment variable. ⚠️ IT EXPIRES ABOUT
  HOURLY, and `npx wrangler whoami` refreshes it in place. **Resolve the zone id
  rather than pasting it**: a hard-coded id is a fact about one account that
  nothing corrects when it stops being true.
- ⚠️ **stderr, NOT stdout, FOR A PROGRESS LINE.** MEASURED: as a `console.log`
  the token-refresh line landed on top of `--json` output and made it
  unparseable, roughly once an hour and never twice in a row, which is the
  shape of a bug nobody can reproduce.
- 🔴 **CLOUDFLARE'S RATE LIMITING BINDING IS A BRAKE, NOT A GATE.** Cloudflare's
  own documentation calls it *"permissive, eventually consistent, and
  intentionally designed to not be used as an accurate accounting system"*, and
  the counter is **per location**: the real ceiling is the configured number
  times the number of data centres a caller can reach, not the number. ⚠️ The
  address must come from `cf-connecting-ip`, WHICH CLOUDFLARE SETS AND
  OVERWRITES, because a header a caller supplies is a rate limit a caller opts
  out of; an empty one falls back to a single shared bucket rather than to no
  limit, because the default has to be the safe side.
  (`workers/wish/src/index.js`.)
- 🔴 **AN `Origin` ALLOWLIST IS NOT SECURITY AND MUST NOT BE DESCRIBED AS
  SECURITY.** A browser sets that header and a page cannot forge it, so this
  stops a stray tab on another site and a crawler, which send the wrong origin
  or none at all. Anything that is not a browser sends whatever it likes, so
  `curl -H 'origin: https://positron.studio'` walks straight through. What it
  buys is that the accidents cannot happen. ⚠️ Echo the origin rather than
  answering `*`, and send `vary: origin` so a cache cannot hand one caller's
  permission to another. ⚠️ And the refusal says what is wrong and not what is
  allowed: a list of origins in an error body is a list of headers to try.
  (`workers/wish/src/index.js`, `workers/wish/src/wish.mjs`,
  `workers/vain/worker.mjs`, `workers/feedback/src/index.js`.)
- 🔴 **A PAID-MODEL ENDPOINT PRICES ITS OWN BODY CEILING.** Whisper is billed by
  the **audio minute**: `whisper-large-v3-turbo` is 46.63 neurons a minute and
  neurons are $0.011 a thousand. MEASURED on that page's own recordings, one
  spoken sentence is 12,863 bytes of webm/opus for 3.68 s, which is about
  28 kbit/s, so a megabyte of body is roughly **three and a half minutes** of
  speech, 163 neurons, about **$0.0018** for one call. ⚠️ **THE FIRST DRAFT
  SAID FOUR MEGABYTES AND THE ARITHMETIC IS WHY IT DOES NOT.** At four
  megabytes one call is fourteen minutes of audio, and the rate limit next door
  allows thirty of those a minute, which is about **fifteen dollars an hour**
  from one address in one Cloudflare location. At one megabyte the same worst
  case is about three. (`workers/wish/src/index.js`.)

## A Worker is not Node, and a handler that throws costs something

- ⚠️ **NOT `firebase-admin`: it is a Node library and a Worker is not Node.**
  What replaces it is `fetch` plus WebCrypto, which is why the prototype could
  move into the Worker unchanged instead of being written a second time. ⚠️
  **THE PEM'S NEWLINES**: a secret read from an env var keeps its literal `\n`
  escapes, and `importKey` then fails with an opaque DataError that never
  mentions newlines. (`archive/items/README.md`, from the removed `workers/items/src/index.js`.)
- ⚠️ **`results: [{}]` IS SUCCESS** from the FCM Instance ID API: an empty
  object per token is what it returns when it worked, and a failure carries an
  `error` key. Reading "empty" as "nothing happened" would report a working
  subscription as a broken one. ⚠️ **AND EVERY VALUE IN AN FCM DATA PAYLOAD
  MUST BE A STRING**: FCM refuses nested objects. (`archive/items/README.md`, from the removed `workers/items/src/index.js`.)
- ⚠️ **CLOUDFLARE RETRIES A FAILING `email` HANDLER THREE TIMES BEFORE BOUNCING
  THE SENDER**, so a grader that throws costs three invocations and a bounce.
  Wrap it, and report a failure to grade as a failure to grade.
  (`workers/mail/src/index.js`.)
- 🔴 **`new Response(raw).text()` LOSES BYTES ON AN 8-BIT BODY AND SAYS
  NOTHING**, and the check that used to stand against it was wrong in both
  directions: it compared `raw.length`, which counts UTF-16 units, against
  `rawSize`, which counts BYTES. MEASURED 2026-09-17, three messages through a
  real `Response`:

      pure ASCII, nothing lost      rawSize  22, .length 22, re-encoded 22
      valid UTF-8, nothing lost     rawSize  48, .length 44, re-encoded 48
      two invalid 8-bit bytes       rawSize  18, .length 18, re-encoded 22

  The middle row is a FALSE ALARM on every message containing an accented
  letter, which in this part of the world is most of them. The last row is a
  MISS on the exact case the check exists for: two invalid bytes each became
  one replacement character, so the unit count matched while four bytes of
  content changed. A guard that passes on the case it was written for is worse
  than no guard, because it is believed. Re-encoding answers both.
  (`workers/mail/src/index.js`.)
- 🔴 **A `Headers` JOINS TWO HEADERS OF ONE NAME INTO ONE COMMA SEPARATED
  VALUE.** A stranger's forged `Authentication-Results` and the receiving
  server's real one would arrive glued together under the STRANGER's
  authserv-id, which is precisely the one that must not be believed. Read them
  off the raw text and they stay two lines, and the real one is picked by its
  name. (`workers/mail/src/index.js`.)
- ⚠️ **AN UNKNOWN CHARSET LABEL THROWS.** `new TextDecoder('x-mac-roman')`
  throws a RangeError, and a throw inside a mail handler reaches the retry
  above. Fall back rather than throwing: a message in a charset nobody has
  heard of is worth showing imperfectly. (`workers/mail/src/body.mjs`.)

## From the handoffs (extracted 2026-10-19)

### Cloudflare auth, crons and what can read what

- **The wrangler OAuth login expires and does not refresh** (`wrangler whoami` fails). Deploys and analytics fail until the owner runs `! npx wrangler login`. (`HANDOFF.md, session 70 (2026-10-08)`)
- **`workersInvocationsScheduled` answers only the OAuth token** in `~/Library/Preferences/.wrangler/config/default.toml` and refuses `CF_API_TOKEN`; the observability telemetry API refuses both (code 10000). macOS has no `timeout`, so kill `wrangler tail` from the shell. (`HANDOFF.md, session 70 (2026-10-08)`)
- **A registered cron is not a firing cron.** The schedules API listed `41 * * * *` for two hours that never ran; a `*/5` deploy missed its first slot 1.5 min later; analytics lags about 5 min. The outcome is the evidence. (`HANDOFF.md, session 70 (2026-10-08)`)
- **The permission classifier refuses deploys and Stream mass deletes** ("Production Deploy", "Cloud Storage Mass Delete"); the owner runs those with `!` or adds a rule. (`HANDOFF.md, session 69 (2026-10-08)`)

### Containers

- **New runtime: 0.83 s median start to listening; the legacy class answers 503 for about 5 s after a destroy.** pub on `PubNext`: RTMPS publishing 0.95 s, WHIP 1.25 s, boot 0.67 s. (`HANDOFF.md, session 69 (2026-10-08)`, `session 70 (2026-10-08)`)
- **On the new runtime the WHIP leg needs `-ts_buffer_size 4194304`**, or ffmpeg dies with exit 245 within seconds. Deploy it with wrangler 4.148 from `rig/containers-next/` (the `npx` there is 4.75). (`HANDOFF.md, session 69 (2026-10-08)`)
- **A deployed image does not replace a running instance**; it switches on the next cold start. Grab a frame before saying the picture changed. (`HANDOFF.md, session 56 (2026-09-30)`)
- **A Worker var does not reach the container by itself**: set `envVars` in the constructor, and send a word (`testsrc2`), not `""`. (`HANDOFF.md, session 56 (2026-09-30)`)
- **A container image is built locally and needs Docker** (OrbStack here, `open -a OrbStack`). `--containers-rollout=none` deploys the Worker and leaves the image unchanged. (`HANDOFF.md, session 49 (2026-09-25)`, `session 56 (2026-09-30)`)
- **`wrangler deployments list` in a worker's directory says when it last shipped**; pub once went five days undeployed unnoticed. (`HANDOFF.md, session 56 (2026-09-30)`)
- **A deploy or a secret change restarts the Durable Object** and cuts its running session; nothing reconnects it. (`HANDOFF.md, session 57 (2026-09-30)`)
- **The legacy `Container` class freezes 2026-12-31; observability pricing starts 2026-12-01.** Read the monthly log volume before then. (`HANDOFF.md, session 65 (2026-10-06)`)

### Stream, WebRTC and the network

- **Stream's WebRTC answer is ICE-lite with one UDP candidate**, WHIP and WHEP alike; munged `tcptype passive` candidates do not help. A UDP-dropping network gets WebRTC only through TURN over TCP/TLS, and MoQ not at all. (`HANDOFF.md, session 56 (2026-09-30)`)
- **The VPN can be up while the default route still reads `en0`**: five `utun` were up and STUN to `stun.cloudflare.com:3478` went unanswered until the VPN went off. A STUN probe is the test that cannot be fooled. (`HANDOFF.md, session 56 (2026-09-30)`)
- **One input per publisher.** A camera borrowing `/llhls/`'s input by handover made Stream answer 404 on the new video's LL-HLS parts for about 70 s. (`HANDOFF.md, session 57 (2026-09-30)`)
- **`/lifecycle` on a WebRTC input reads `live: true` with nothing publishing**, and a tab that dies without its DELETE blocks the next WHIP publisher for up to 5 min. (`HANDOFF.md, session 57 (2026-09-30)`)
- **A cross-origin DELETE preflights**: `OPTIONS /whip/<id>` must answer 204, or WHIP teardown never works from a browser. (`HANDOFF.md, session 49 (2026-09-25)`)
- **A rotated stream key must be put into the Worker secret too.** The key is not in the repository, so no diff shows it is stale. (`HANDOFF.md, session 49 (2026-09-25)`)
- **A second `<video>` on one source is a second Stream meter**; move the one element. (`HANDOFF.md, session 50 (2026-09-25)`)
- **A first-frame timeout near the container's cold wake (about 20 s) races it**; keep looking, bounded, rather than raising the timeout. (`HANDOFF.md, session 50 (2026-09-25)`)
- **The relay is stateless fan-out and sends a joiner nothing.** A fixed room name is a room strangers share; make it private per load. (`HANDOFF.md, session 50 (2026-09-25)`)
- **Cloudflare "Always Use HTTPS" is off**, which is why plain `ws` still works. Nobody decided that on purpose. (`HANDOFF.md, session 62 (2026-10-04)`)

### Measured numbers

| what | measured |
| --- | --- |
| glass to glass, Chrome's fake camera on /cam/ | WebRTC 65 to 104 ms, MoQ p50 25 to 46 ms, LL-HLS 5.3 to 7.9 s (first frame 14 to 18 s after recording starts) |
| camera loopbacks | WebRTC 87 ms, LL-HLS 5.3 s settled, MoQ 29 to 32 ms through Cloudflare's public relay |
| clocks | peer clock agrees to about 3 ms across machines; device wall clocks 10 to 159 ms apart; Cloudflare strips in-band timing |
| laptop to Pi, one LAN | direct round trip 4 ms against 72 by relay; relay legs about 18 ms each way; 10 ms audio frames beat 20 (20 ratcheted to about 115 ms lag) |
| Workers AI patch from words | about $0.00045 a press |

(`HANDOFF.md, session 56 (2026-09-30)`, `session 57 (2026-09-30)`, `session 76 (2026-10-13)`, `session 62 (2026-10-04)`, `session 59 (2026-09-30)`, `session 73 (2026-10-10)`)

### Somebody else's server, and R2

- **One ERR session per open, never per poll.** `/now/` re-read ERR's 217 KB master at 1 Hz and opened a new session every second; the cure was one session per open and the playlist every 10 s on a reused variant. (`HANDOFF.md, session 64 (2026-10-05)`)
- **A hand upload nobody checks did not happen**: the Salamander samples were never uploaded to R2 and the page 404ed every file. (`HANDOFF.md, session 75 (2026-10-11)`)
- **ffmpeg prints `ABSOLUTE` with six decimals (19 characters).** Compare test frames in RGB: `drawbox` goes through YUV and turns 255 into 254. (`HANDOFF.md, session 56 (2026-09-30)`)

### Deploying the site while agents write

- **Deploy from a clean worktree**: `git worktree add --detach <scratch>/deploy-wt HEAD` once, then every time `git -C <scratch>/deploy-wt reset --hard $(git rev-parse HEAD)`, build and deploy there. `reset --hard`, not `checkout`: checkout aborts once the worktree holds build output, and the old commit ships again. After an interrupted deploy, `git worktree prune` before `add`. (`HANDOFF.md, session 53 (2026-09-28)`, `session 77 (2026-10-14)`)
- **The worktree's build output does not come back by itself**; commit `public/` there and fast forward, or the checkout's `workers/view/public` goes stale. (`HANDOFF.md, session 54 (2026-09-28)`)
- **`deploy.mjs` rebuilds before it ships**, so the edge stamp is seconds past `build.mjs`'s and names the commit before the one carrying it. (`HANDOFF.md, session 54 (2026-09-28)`)
- **Read the edge stamp twice, a minute apart, before calling a deploy failed**: a read seconds after served yesterday's stamp. (`HANDOFF.md, session 55 (2026-09-29)`)
- **wrangler uploads only changed bytes** (dedup by content hash), so a short upload list is not a failed deploy. (`HANDOFF.md, session 55 (2026-09-29)`)
- **The build refuses an import of an untracked shell file**: commit a new kit module before deploying a page that imports it. (`HANDOFF.md, session 78 (2026-10-14)`)
- **The build scans text for imports, comments and code examples included**: a quoted `import(` and an example `import * as arrival from './arrival.mjs'` each refused a deploy. (`HANDOFF.md, session 62 (2026-10-05)`, `session 64 (2026-10-05)`)
- **Hold one unfinished page out of a deploy**: after the build, `git show HEAD:demo/<path>/index.html > workers/view/public/<path>/index.html`. (`HANDOFF.md, session 73 (2026-10-10)`)


## The owner's corrections (from sessions 2026-09-29 to 10-19)

- No service runs on the owner's own machines (*"i can not donate my machines. i am offseite"*).

## Retired

Rules whose worker, page or route left this repository's live set. Moved here
verbatim on 2026-10-14 with the date and the reason; the measurements are true
records of their day, and a rule here still teaches anybody rebuilding the
same thing.

### Asking ERR one range request before believing a red `now` or `flipper`

Retired 2026-10-14 for two reasons. `now` and `flipper` are archived
(`archive/demos/now-index.html`, `archive/demos/flipper-index.html`; flipper on
2026-10-12), so there is no red of theirs to explain. And the advice itself
was overtaken on 2026-09-16 by the CLAUDE.md rule *"Never `curl` a mount, a
health route or a live segment to find out whether somebody else's server is
up"*, whose answer is: say both are possible and move on. Do not follow the
last two sentences below.

- **The same suite read 425/429 and then 429/429, forty minutes apart, with no
  code between them.** All four failures were `now`, all downstream of frames
  never arriving, and a single two-byte range GET on the live edge segment
  answered **403 with no ACAO** while the playlists beside it were fine. So
  before treating a red `now`/`flipper` as a regression, ASK ERR — one range
  request separates "our code broke" from "the schedule moved", and they look
  identical from the harness.

### An HLS station assembled from R2 byte ranges

Retired 2026-10-14 from this file because the code moved. On 2026-10-02
(`0ada490f`, *"station moved to eccm"*) the station went to eccm, at
`src/station/station.mjs` in the eccm repository, and
`workers/station/worker.mjs` here is 54 lines that only serve `GET /media/<key>`
out of the bucket (the MIM videos and pictures, under the owner's own prefix). Every
citation of `workers/station/worker.mjs` below means the code in this
repository's git history before `0ada490f`, or eccm's copy. The rules hold
for any byterange HLS station.

From `workers/station/worker.mjs`.

- 🔴 **THE PLAYLIST IS LIVE, NEVER VOD.** A `#EXT-X-PLAYLIST-TYPE:VOD`
  byterange playlist made Safari fetch 90 ranges, 14.4 MB, 900 seconds of audio
  in 463 ms before playing a note (MEASURED 2026-09-15 17:17Z). Same audio,
  same ranges, one tag. There is no `#EXT-X-ENDLIST` anywhere in that file and
  there must never be one: a starving playlist that ends is a station that is
  over.
- **A byterange segment has to start on a frame boundary.** A misaligned one
  still plays (MEASURED, 1.000x, no audible click), but it decodes to slightly
  less audio than its `#EXTINF` declares, and a wall-clock station turns
  declared durations into positions, so the shortfall accumulates for as long
  as the station is up.
- 🔴 **`#EXT-X-MEDIA-SEQUENCE` MAY NEVER GO BACKWARDS**, which is why an expired
  live chunk loses its BYTES and keeps its ENTRY: the flattened list's length
  is the playlist's modulus and every segment's start time is the running sum
  before it, so dropping a head entry would shorten `n` and move every start
  time. It may never go below zero either. A looping station's window genuinely
  reaches back into the previous loop, but before the first one has finished
  there is no previous loop, and a negative media sequence is not a decimal
  integer. A short window at startup is the honest shape.
- **A join between two segments of unlike encodes needs
  `#EXT-X-DISCONTINUITY`. A join between two of the same is free:** twelve
  segments out of three matching files gave one contiguous buffered range
  (MEASURED).
- 🔴 **A LIVE SLOT'S EDGE IS THE LAST SEGMENT THAT EXISTS, NOT THE WALL CLOCK.**
  A live show is a file that does not exist yet, and the recorder is by
  construction behind the sound: a ten-second piece can only be written ten
  seconds after it started. Locating the edge by clock would publish a segment
  before the recorder had cut it, which is a 404 on the live edge on every
  single reload.
- **A cached playlist is a station that is stuck in the past.** The window moves
  with the wall clock, so the playlist response is never cached.
- **An epoch in the future is a station that has not started.** Left unclamped
  it is a negative elapsed, a negative loop number, and a playlist whose window
  bound sits below its first index, which emits a header and no segments.
  MEASURED once, by typing a round epoch two minutes ahead.
- 🔴 **A DURABLE OBJECT RATHER THAN KV, BECAUSE "A SCHEDULE CHANGE TAKES
  EFFECT" HAS TO BE A NUMBER**, and KV's up-to-60-second propagation makes it
  one you cannot measure.
- 🔴 **A LIVE SHOW WRITES ONE R2 OBJECT EVERY TEN SECONDS AND NOTHING USED TO
  DELETE THEM.** 360 objects an hour, 160 KB each: 57.6 MB an hour of chunks
  that have already been heard and can never be in a playlist again, because
  the playlist only ever emits the last WINDOW segments. This is a leak
  measured in hours of uptime, not in bugs.
- ⚠️ **AN ORPHAN SWEEP NEEDS AN AGE GUARD AND IT IS NOT TIDINESS.**
  `/live/<key>/append` puts the object and THEN tells the Durable Object about
  it; a sweep landing between those two lines would delete the chunk a recorder
  had just uploaded, and the recorder would be told nothing. `ORPHAN_MIN_AGE`
  is 60_000 ms, wider than that gap by three orders of magnitude.
- ⚠️ **`wrangler r2 bucket info` REPORTS A COUNT THAT LAGS BY MINUTES.** It read
  `object_count: 0` against a bucket holding six objects, which is why the
  worker lists the bucket itself when the question is "prove it deletes": that
  needs a number before and a number after. And a cleanup nobody is told about
  cannot be told apart from a leak, so the sweep returns what it did in both
  directions.
- **A cron that can only be observed by waiting five minutes is one nobody
  measures**, so the same function the cron runs is exposed on a token-gated
  route.
