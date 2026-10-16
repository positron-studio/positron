# plan-vain-videoradio: Väin's archive through positron's radio granulator

Status (2026-10-16, Friday): proposal. Nothing built, nothing rendered, nothing
sent to anybody. Written from reading both repositories and from one HEAD request
per archive mp3. No browser was opened and no media was downloaded.

Asked (from ECCM, Tarmo's circle, received 2026-10-16, Estonian, translated):
*"Hi, are you very busy right now? Tarmo goes to Italy on Monday; could you run
those archive files of ours through positron's videoradio before that and send
them back, so the system can be tested at Ülehelil on the 25th."*

The owner: *"i do not know what they want exactly. its Väin radio. they like my
videoradio mixing. ideas: get their qt thing working and do the archive feed
videoradio-fication in app. get their archive via api somehow and i stream them
back to them somehow."* Then, as scope: base the positron side on
`/radio/scenery/` rather than `/videoradio/`, offer audio AND video and a matrix
of delivery methods, and *"Väin has minimum time to adjust anything from their
side"*, so every option is ranked by how much Väin must change.

Hard dates: Tarmo away from **Monday 2026-10-19**. Test at Üle Heli (the
festival; their own feed carries a `webcontent` event "Üle Heli",
https://ule-heli.ee/) on **Sunday 2026-10-25**.

Marks used below: **READ** means read from code or a file today, with the path.
**MEASURED** means a request was made today and the answer is quoted.
**INFERENCE** means reasoned and not checked.

## 0. Verdict

1. **What they most likely want is files**: their archive recordings run through
   the granulator and handed back as media Väin can publish as ordinary `audio`
   or `video` events. *"send them back"* and *"so the system can be tested"* read
   as a batch job, not a standing stream (INFERENCE from the message; the code
   below makes files the zero-change path, which supports it).
2. **Before Monday, files are deliverable and nothing else is honest.** The four
   positron changes it needs are small (section 3) and the short recordings
   render in about 15 minutes of wall time. The 145 minute Warsaw concert is the
   long pole: real time only, so one concert is one evening.
3. **By the 25th, add one live option**, and the cheapest live option that needs
   nothing from Väin but a published event is **our own stream URL published as
   a `video` or `audio` event** (section 5, row Z3). Pushing into their Icecast
   or nginx-rtmp is also zero code but has side effects on their server that
   Tarmo must agree to before he leaves (section 5, rows Z4 to Z6).
4. **The page itself as a `webcontent` event is already a proven path**: their
   feed holds a shelved event *"Positron Radio Demo"* pointing at
   `https://positron.studio/radio/` (published 2026-10-01, *"Testing performance
   in Väin"*). That URL answers **404 today** (MEASURED), because `/radio/` became
   a group on 2026-10-13. Tell Tarmo either way.
5. **Do not build their Qt app on this laptop.** For listening to Väin, install
   it from TestFlight or the Play Store. Building it needs Qt 6.5+, and
   ThreatLocker kills binaries built under `$HOME` (section 7).
6. **Rank by Väin's work** (section 5): files back, page as event, our stream as
   event, all zero code and only a publish in their existing editor. Their
   Icecast and RTMP take only a password or key, so they also count as zero
   code, but they fire push notifications and recordings unless handled. A
   granulator on their own server, a WebView change in the app, or a Csound port
   all go last.

## 1. What Väin is, read from its code

Repository `~/personal/radio1965` ([tarmoj/radio1965](https://github.com/tarmoj/radio1965)),
pulled today, head `112b2ed` (2026-10-16, "Tryout4"). READ throughout.

- **App** `app/`: Qt 6 QML, desktop, Android, iOS. `find_package(Qt6 REQUIRED
  COMPONENTS Quick Network Multimedia WebView)`, `qt_standard_project_setup(REQUIRES
  6.5)` (`app/CMakeLists.txt`).
- **Channels** (`app/PlaybackController.qml:27`): `radio1965, live, user1..user4,
  video`. Audio is `http://live.uuu.ee:8001/<channel>` (plain HTTP Icecast,
  line 169). `video` is `https://live.uuu.ee:4443/hls/stream.m3u8` (line 21).
- **Event types the app plays** (`app/EventDelegate.qml:90-95`): `audio`,
  `video`, `livestream`, `streamrecording` go to the player; `webcontent` and
  `article` open `WebViewPage.qml` (QtWebView, so WKWebView on iOS and the
  system WebView on Android); `text` opens a popup.
  ⚠️ `audiostream` and `videostream` exist in the DB enum (`server/db.py:34`)
  and as Collection shelves, but **the app does not play them** (they fall to
  the `default` branch) and **the editor does not offer them**
  (`editor/index.html:94-97` lists only `text, audio, video, webcontent`). So
  "publish our stream as an audiostream event" has to be a `video` or `audio`
  event carrying a stream URL.
- **Player**: one global `MediaPlayer` (`PlaybackController.qml:283`). On iOS
  the build calls `qt_add_ios_ffmpeg_libraries`, so Qt Multimedia's FFmpeg
  backend plays what FFmpeg plays. Their feed already holds a `.mov` and an
  `.avi` video and mp3 audio. **MP4 with H.264 and AAC, and MP3, are the safe
  formats** (INFERENCE from the backend, not tested on their phones).
- **Server** `server/main.py` (FastAPI). `GET /events` is public, and their
  events API answers `access-control-allow-origin: *`
  (`workers/shout/NOTES.md`, measured 2026-09-15). `POST /events/publish` creates
  an event and sends the FCM push. There is **no upload route**: an event is a
  URL to media hosted somewhere else.
- **Recording**: `server/icecast_on_connect.sh`, when a source connects to a
  mount, publishes a `livestream` event and, if `save_stream`, runs
  `ffmpeg -c copy` on the mount into `/var/recordings/audio/<slug>-<date>.mp3`.
  `icecast_on_disconnect.sh` rsyncs it to `eccm.ee:/home/eccmee1/www/radio1965/streams/`
  and retypes the event to `streamrecording` with the https URL.
  ⚠️ **Both flags fail open**: a source that does not send the
  `ice-audio-info: send_notification=0;save_stream=0` header (the app sends it,
  `app/icecastbroadcaster.cpp:183-202`) **notifies every Väin user and is
  recorded**. `radio1965` is the exception: the hook forces both off there.
- **radio1965 channel**: *"continuous playlist/generated stream, no recording,
  no notification"*, fed by `ffmpeg -re -stream_loop -1 -i raba.mp3 ... -f mp3
  icecast://source:<Password>@...:8001/radio1965` (`project-description.md`
  around line 362-372). One source per mount, so anything else there replaces
  their playlist.
- **Video**: nginx-rtmp, ingest `rtmp://live.uuu.ee/live/<key>`, any key, out as
  `https://live.uuu.ee:4443/hls/<key>.m3u8` with `Access-Control-Allow-Origin *`.
  The `live` application has `record all` into `/var/recordings` as `.flv`.
  READ from the config pasted in `project-description.md:240-330`, which may be
  older than the server.
- **TODOs.md** says *"Store video stream as mp4 on eccm.ee"*, *"? Csound based
  demo from stream recordings?"* and *"MacOS build (QML only)"*.

## 2. Their archive, counted today

`GET /events?status=new&status=shelved&status=archived` returned 119 events
(saved this morning, not refetched): 87 `livestream`, 13 `streamrecording`, 7
`article`, 5 `webcontent`, 3 `text`, 2 `audio`, 2 `video`. Statuses: 88
archived, 31 shelved.

One HEAD per mp3, with an `Origin: https://positron.studio` header so the CORS
answer is visible (MEASURED 2026-10-16). Every one answered `HTTP/2 200`,
`audio/mpeg`, `accept-ranges: bytes`, **no `access-control-allow-origin`**.
The Cage/Feldman mp3 is on ubuweb, which is not theirs, so it was not asked.

Durations are bytes divided by 128 kbit/s, because the app encodes at
`MP3_BITRATE_KBPS = 128` (`icecastbroadcaster.cpp:51`). The four EMA files have
a different naming and `save_stream: false`, so they were uploaded by hand and
their bitrate is **unknown**. The 192k and 320k columns bound them.

| file | bytes | min @128k | @192k | @320k |
| --- | ---: | ---: | ---: | ---: |
| clip-test-20261015-194440 | 235,810 | 0.2 | | |
| clip-test-20261015-193943 | 235,810 | 0.2 | | |
| driving-along-20261013-095048 | 1,630,223 | 1.7 | | |
| v-in-20261012-213556 | **0** | empty | | |
| evening-rituals-20261012-212952 | 2,111,825 | 2.2 | | |
| poorisvool-20261012-212519 | 618,019 | 0.6 | | |
| oriental-analog-20261009-135309 | 1,182,229 | 1.2 | | |
| kalle-2-20261008-224657 | 2,890,218 | 3.0 | | |
| kalle-20261008-223643 | 5,103,616 | 5.3 | | |
| ema_salvestab_2026-09-22_13-16-01 | 14,357,996 | 15.0 | 10.0 | 6.0 |
| ema_salvesta_2026-09-22_12-28-48 | 16,211,564 | 16.9 | 11.3 | 6.8 |
| ema__kontsert_varssavi_2026-09-21_17-04-17 | 138,983,660 | **144.8** | 96.5 | 57.9 |
| ema_proov-2026-09-21_14-42-40 | 15,405,164 | 16.0 | 10.7 | 6.4 |
| uuu.ee/audio/exotica/B2.mp3 (`audio`) | 8,424,594 | 8.8 | 5.9 | 3.5 |

- **App recordings: about 14.6 minutes in total**, 11 files, one of them empty
  and two identical-sized 15 second clip tests from last night.
- **EMA set: about 193 minutes at 128k**, 145 of them in one concert.
- **All of it: 207 MB, about 216 minutes at 128k.**
- ⚠️ The `last-modified` of each app recording minus the time in its name is
  about 1.4 times the duration above (kalle: 7.6 min against 5.3). Either the
  real bitrate is near 90 kbit/s or the broadcast had gaps (their recent
  commits are about crackling on iPhone). Reading one frame header with a 4 byte
  Range request per file would settle it; it was not done, by the one HEAD rule.

## 3. The positron side: `/radio/scenery/`, and what it lacks

`demo/radio/scenery/index.html` (553 lines, *"Radio landscape"*), READ:

- Seven station nodes, **all ERR and Ida** (`STATIONS`, lines 45-53), each
  carried by our relay `shout` (`${BASE}/${st.mount}`, `?base=` overrides).
- A drift clock tunes an AM tuner graph between two slots: 40 s dwell, 16 s
  blend through noise and whistle (`?dwell=`, `?blend=` override). At most two
  streams open, and only after a press on the picture.
- Tuner out into the grain ring (`/granulator/grain-ring.mjs`: scsynth in wasm,
  `BufWr` round an 8 s mono ring, `GrainBuf`), then speakers.
- Picture: the scan-field landscape, WebGL2 on a 960x540 canvas.

Four gaps between it and Väin's archive. Each is a positron change only.

**G1. Their files have no CORS, and the relay route for them is stale.**
`workers/shout/worker.mjs` already has `/rec/<name>` for exactly these
recordings (built 2026-09-15: forwards Range, caches immutable, name matched
against a pattern, never a URL parameter). But `REC_BASE` is
`https://eccm.ee/radio/streams/`, and they write to `/radio1965/streams/` now.
The pattern `^[a-z0-9-]{1,20}-\d{8}-\d{6}\.mp3$` also refuses all four EMA
names, which have underscores and dashed dates. Two fixes, pick one:
- *Minimal*: correct `REC_BASE` and widen the pattern to the two shapes seen.
  About 30 minutes with a deploy.
- *Better*: `/vain/<event id>`. The worker reads their public `GET /events`
  (cached for minutes, so one request per window to their server), accepts an
  id only if its type is `audio` or `streamrecording` and its host is `eccm.ee`
  or `uuu.ee`, and streams that URL. Their own feed becomes the allowlist, a new
  recording works with no deploy, and it is still no open proxy. About 2 hours.
- A direct fetch with no relay needs `Access-Control-Allow-Origin` on eccm.ee
  (one line of LiteSpeed config). That is a change on their side, so it ranks
  below both.

**G2. `mp3-stream.mjs` throws most of a file away.** READ,
`demo/shell/mp3-stream.mjs:116-136`: anything scheduled more than 2.5 s ahead in
the first 4 s, or 30 s (`MAX_AHEAD`) after, is dropped until the queue drains to
0.6 s. That is right for a live mount's burst. A file arrives at network speed,
so it would play a few seconds and then scattered blocks (INFERENCE from the
code, not run). Needed: a `paced` option that stops reading while more than a
few seconds are queued and never trims, an `ended` promise, and a start byte so
a station that leaves and comes back resumes where it was (`/rec/` already
forwards Range). About 2 hours. `demo/fake-station.mjs` already paces a file
against the clock and is the stand-in to test it with, at zero bytes from
anybody.

**G3. The station list is ERR's.** An archive mode must open **no ERR mount at
all**: not first in the list, not anywhere in it. Rendering their files must not
count as ERR listeners, and a `webcontent` event in Väin pointing at a page that
opens ERR would turn every Väin user into an ERR listener. So a separate set,
for example `?set=vain` (their archive, fetched from their CORS-open events
API) or `?src=<event id>[,<id>]`, replaces `STATIONS` entirely. With one file
the two tuner slots need a decision: the file against itself at an offset, or
the file against noise. That is the owner's call. About 3 hours with the bay
nodes (site `vain`, one station node per event).

**G4. Nothing records the page.** `demo/shell/reel.mjs` `createRecorder({canvas,
audio})` already records a canvas and one audio track with MediaRecorder,
preferring `video/mp4;codecs=avc1.640028,mp4a.40.2` (READ, line 85). Wiring it:
a `MediaStreamDestination` off the grain ring's `eng.out`, `?capture=1`, stop on
the file's `ended`, and a driver script that opens one tab per file and saves
the blob. `ffmpeg` on this Mac (`/opt/homebrew/bin/ffmpeg`, with `libx264`,
`h264_videotoolbox`, `aac`, `libmp3lame`, READ today) turns a WebM into MP4 if
Chrome's MP4 is refused, and pulls an MP3 out for the audio-only version. About
3 hours.

`/videoradio/` would need the same four things plus taking its own tour clock
off; scenery is the newer patchbay page and the owner chose it.

## 4. Way A, files: how long it takes

- **Real time only.** scsynth wasm runs in an AudioWorklet at the audio
  context's rate, the drift clock reads `performance.now()`, and MediaRecorder
  captures in real time. An OfflineAudioContext could run the sound faster, but
  not the clock or the picture. Rewriting both for an offline render is not a
  weekend job (INFERENCE).
- **Parallel tabs.** Each tab has its own context and scsynth. This Mac has 12
  cores and 32 GB (READ, `sysctl`). Three or four renders at once is a guess,
  not a measurement. Measure one first and watch the grain ring for underruns.
  Background tabs throttle `requestAnimationFrame`, so each render gets its own
  visible window, or Chrome runs with the background-throttling switches off
  (INFERENCE).
- **Wall time.** App recordings: about 15 minutes for all of them, in parallel
  under 6 minutes (the longest is kalle, 5.3 min). The EMA set: the concert is
  58 to 145 minutes depending on its bitrate, and the other three run beside it.
  B2: 9 minutes.
- **One render is one performance.** The drift order is shuffled and the grain
  patches move, so a re-render of the same file is a different piece. Say so to
  Tarmo, and keep the files.
- **Outputs.** Audio: MP3, 128 kbit/s, stereo (the ring is mono, the AM graph
  is not). Video: MP4, H.264 960x540 at 30 fps plus AAC. 145 minutes of video at
  8 Mbit/s, reel.mjs's default, is about 8.7 GB. Re-encoding to about 2 Mbit/s
  with x264 makes about 2.2 GB, which is still heavy for phones. Offer the
  concert as audio, or as a 10 minute excerpt in video.
- **Where they go back.** There is no upload route in their API. Either we host
  them (R2, the `positron-station` bucket already serves the MIMproject corpus)
  and Tarmo or any contributor publishes each as an `audio` or `video` event
  with the URL in their existing editor, or we send Tarmo a link to the files
  and he puts them on eccm.ee. Both are zero code for Väin. Publishing them
  ourselves would need a contributor login from them, and we use it only if
  they give it.

## 5. The delivery matrix, ranked by what Väin must change

Zero code first. Giving us a password or publishing an event in their editor
counts as zero code.

| # | option | audio | video | Väin gives | Väin does | runs where | cost to us | ready |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Z1 | **files back** as `audio` / `video` events | MP3 | MP4 | which files; OK on rights | publishes N events in the editor, or a contributor login | this Mac, once; R2 serves | R2 storage; delivery is bytes, about 58 MB per listener-hour at 128k | **before Monday** (short set) |
| Z2 | **the page as a `webcontent` event**, rendered on each listener's phone | yes | yes, in the WebView | nothing | publishes one `webcontent` event | the listener's phone | relay delivery per listener; their files at our edge cache | page by Monday possible; test on phones by the 25th |
| Z3 | **our stream as a `video` / `audio` event** (WHIP from our tab into Cloudflare Stream, HLS out, as `/stage/` does) | yes | yes | nothing | publishes one `video` event with the HLS URL | a machine of ours with a tab open for the whole test | Stream: $1 per 1,000 minutes delivered (positron-streaming skill), so 20 listeners for 2 h is about $2.40 | by the 25th |
| Z4 | **push into their Icecast `user1..user4`** | MP3 | no | source password and channel | nothing, if we send the `ice-audio-info` header; otherwise their hook notifies everyone and records it | a machine of ours: tab, then local ffmpeg or a small Node source client | nothing on Stream; one connection to their server | by the 25th |
| Z5 | **push into `radio1965`** | MP3 | no | source password | **stops their playlist ffmpeg** for the test and restarts it after (an operator action, not code) | as Z4 | as Z4 | by the 25th, needs somebody at their server |
| Z6 | **push to their nginx-rtmp** | AAC | H.264 | a stream key, OK to fill `/var/recordings` | publishes a `video` event with `https://live.uuu.ee:4443/hls/<key>.m3u8`. Key `stream` would take over their `video` channel instead | tab, then local ffmpeg to `rtmp://` | nothing on Stream | by the 25th |
| C1 | **direct fetch, no relay** | | | | adds one CORS header on eccm.ee (a config line, **not zero**) | | saves our relay hop | any time |
| L1 | **Väin-only: their server granulates** into `radio1965` with ffmpeg or Csound | yes | no | | **a new process on their box**, written by Tarmo (ffmpeg has no granulator; Csound's `partikkel` does) | their server | nothing to us | **last**; not before he is back |
| L2 | **a granulator inside the Qt app** (Csound or a port) | yes | maybe | | **a Qt app change**, store review on iOS | phones | nothing | **last**; weeks |
| L3 | **a dedicated in-app WebView screen** for the positron page | yes | yes | | **a Qt app change** | phones | as Z2 | **last**; Z2 does the same with no change |

Notes on the rows:

- **Z1** is the request as written. It also leaves the 25th with no dependence
  on any machine of ours being awake.
- **Z2** works today in principle: the Positron Radio Demo event proves a
  positron page loads in Väin's WebView. What is not known is whether scsynth
  wasm plus WebGL2 keeps up on a phone inside a WebView, and whether QtWebView
  lets audio start from a press (INFERENCE; ask Tarmo what the 2026-10-01 test
  showed). WebViewPage hides the WebView while the drawer or a player dropdown
  is open (`WebViewPage.qml`, `overlayOpen`), and what that does to sound is
  untested.
- **Z3** needs nothing of theirs, and their server sees no load at all. WHIP
  records nothing on Stream (positron-streaming skill), so the files from Z1
  are still the archive.
- **Z4**: ffmpeg's `icecast://` output has no option for an arbitrary header
  (`ffmpeg -h protocol=icecast`, READ today: genre, name, description, url,
  public, user agent, password, content type, legacy, tls). So unless we send
  the header ourselves, the hook **fails open and push-notifies every Väin user
  and records the take to eccm.ee**. A small Node source client that does the
  same PUT as `icecastbroadcaster.cpp` with that header is about 2 hours. A
  notification may be exactly what they want on the 25th. That is a question
  for Tarmo, not a default.
- **Z6**: nginx-rtmp `record all` writes an `.flv` of everything we send into
  their disk.

## 6. Ways B and C, in short

**Way B, live from a machine of ours.** Any live row (Z3 to Z6) needs a
browser tab rendering for the whole test, on a machine that stays awake. That
means this Mac, or the M1, with Chrome, ffmpeg, and for Z4 to Z6 their
credentials. **The Pi is not that machine for this page** (INFERENCE): scsynth
wasm plus WebGL2 in Chromium on a Pi 4 is far heavier than the board's own
native work. The board does run native scsynth with pappus, JACK and ffmpeg
(`rig/board/README.md`: *"Pi 4's A72: 8 voices at 6.8x realtime, 15% of one
core"*), so an audio-only native chain is plausible. But scenery's drift, tuner
and grain ring live in the page's JavaScript, so it would be a port, not a
deploy. Not for the 25th.

**Way C, inside their app.** The cheapest real integration is **Z2, with no
app change**: a `webcontent` event whose URL is the scenery page in archive
mode. A dedicated WebView screen (L3) adds nothing that Z2 lacks. Porting the
granulator into the app in Csound (Tarmo's tool, and his own TODO) is days of
his work plus store review on iOS. Last.

## 7. "Get their Qt thing working" on this Mac

- **To listen and test, do not build.** Väin is on TestFlight (the repository
  root carries `Väin 0.5.6 testflight downloa qr.png`) and on Android (version
  0.6.2, 6020). Ask Tarmo for a TestFlight invite.
- **To build anyway**, it needs: Qt 6.5 or newer with Quick, Network,
  Multimedia and WebView; CMake (present, `/opt/homebrew/bin/cmake`); Xcode
  (present); and for the full desktop build `libmp3lame` through pkg-config.
  Homebrew's `lame` is installed, but it ships `lame.pc`, and the build asks
  for `libmp3lame`. `pkg-config` itself is not installed. So the full build
  fails at configure on this Mac (READ, not run).
- **The QML-only build exists**: `-DRADIO65_LAYOUT_PREVIEW=ON` (commit
  `7bb058a`, *"Initial QML only build for design"*, 2026-10-12). It drops
  broadcast, mp3lame, push and Firebase, and **seeds dummy events instead of the
  live server** (`Main.qml:79-87`). Fine for looking at the layout, useless for
  testing their archive.
- ⚠️ **This laptop is managed.** ThreatLocker SIGKILLs binaries that live under
  `$HOME` (measured 2026-09-28, memory note). The Qt online installer puts Qt in
  `~/Qt`, and a build directory under `~/personal/radio1965` would make the app
  binary itself a candidate for exit 137. Homebrew's `qt` lands under
  `/opt/homebrew`, but Homebrew refused a tap install on 2026-09-28 because of
  the Xcode version. **Ask first. Nothing was installed.** The M1 is the place
  for any from-source build.

## 8. Dated steps

**Friday 2026-10-16 (today, evening)**
- Owner sends Tarmo the questions below and says Z1 is coming.
- G1 (relay route) and G2 (paced file mode), tested against a local paced file
  server shaped like `demo/fake-station.mjs`, with zero external bytes.

**Saturday 2026-10-17**
- G3 (archive set in scenery, no ERR in it) and G4 (capture plus driver).
- One real render of one 15 second clip test through the relay. Measure CPU and
  underruns for one tab, then two, then three, and pick the parallel count.
- Deploy the scenery archive mode. Quote the build stamp and the URL, for
  example `https://positron.studio/radio/scenery/?set=vain`, and check it
  opens no ERR mount.

**Sunday 2026-10-18**
- Render the agreed set. The 11 app recordings take under 10 minutes in
  parallel. The EMA concert starts first, because it is the long pole.
- Convert, put on R2, and send Tarmo one list: title, URL, duration, format,
  plus the `webcontent` URL for Z2.
- Tarmo publishes (or sends a login) before he leaves. Anything that needs his
  server, such as a password, stopping the playlist or an RTMP key, is granted
  by Sunday night or handed to somebody else at ECCM.

**Monday 2026-10-19 to Friday 2026-10-23** (Tarmo away)
- If a live row was chosen: build it (Z3 is the default; Z4 with the header
  client if they want their own channel). Dry-run once on a user channel with
  notification and recording off.
- Re-render anything they asked to change.

**Saturday 2026-10-24**: one dry run at the test's real length, on the machine
that will run it.

**Sunday 2026-10-25**: the test at Üle Heli. With Z1 or Z2, nothing of ours
needs to be running. With Z3 to Z6, the machine and the tab must be up, and
somebody must be watching it.

### What to ask Tarmo before Monday

1. **What should come back: audio files, video files, a stream, or a page in
   the app?** And what plays it at Üle Heli: phones in the audience, speakers,
   a projection?
2. **Which files.** All 13 recordings? `v-in` is empty (0 bytes) and the two
   clip tests look like tests. The four EMA Warsaw files? B2? The Cage and
   Feldman mp3 is ubuweb's and is better left out.
3. **Rights** to publish an altered version of the EMA concert.
4. **Formats.** MP3 128k and MP4 H.264/AAC, OK? Is a 145 minute video wanted, or
   audio plus an excerpt?
5. **Who publishes**: Tarmo before Monday, another manager, or a contributor
   login for the owner? Files on our R2, or on eccm.ee?
6. **If live**: which channel; the source password for it (the one in the app
   may not be the server's, per its own TODO); should their hook send the push
   and record the take; for video, which RTMP key, and is recording on their
   disk OK; is stopping the `radio1965` playlist acceptable.
7. **What did the 2026-10-01 "Positron Radio Demo" test show** on iOS and
   Android, and should its 404 link be repointed?
8. **Who answers while he is in Italy.**

## 9. Open questions and uncertainty

READ from code today: everything in section 1, the relay's `/rec/` route and
its stale base, the mp3-stream trim logic, reel.mjs's recorder and formats,
scenery's station list and clocks, the Qt build options, ffmpeg's encoders and
icecast options on this Mac.

MEASURED today: 14 HEADs (sizes, no CORS anywhere, one empty file);
`https://positron.studio/radio/` answers 404; `https://positron.studio/videoradio/`
answers 200.

INFERENCE, to be settled by measuring:
- That they want files rather than a stream. Question 1 settles it.
- Real durations: the app files may be near 90 kbit/s, and the EMA bitrate is
  unknown. One 4 byte Range read per file settles it.
- That a file through unpaced mp3-stream plays only fragments (read from the
  trim code, never run).
- How many renders run in parallel without underruns: measure one tab first.
- That Chrome's MediaRecorder writes MP4 here. If not, ffmpeg remuxes.
- That Qt's FFmpeg backend on their phones plays our MP4 and a Cloudflare
  Stream HLS URL. One test file published as an unlisted or test event settles
  it.
- That scenery in a phone's WebView keeps up. Only their test or the earlier
  one can say.
- That their nginx-rtmp and Icecast configs still match the 2026 spec text.
- That the Pi cannot carry scenery in Chromium (not tried, and not worth trying
  for the 25th).

Two security observations from their code are for Tarmo privately and are not
written here, because this repository is public.

What this plan refused: any request to ERR (scenery's default list is ERR, and
the archive mode must contain none of it); any download of their media while
planning; any change in either repository; any toolchain install on this
laptop; publishing anything into their feed ourselves without their login and
their say.
