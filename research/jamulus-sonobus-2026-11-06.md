# Jamulus and SonoBus, for positron (2026-11-06)

Status (2026-11-06): open. Nothing tried, installed or deployed; a reading and a recommendation.

Asked: *"do reasearch on Jamulus or SonoBus for ../positron"*, the same day v2in's `plans/plan-mixer.md` found that
people cannot play in time over its Icecast path (seconds of delay) and named Jamulus and SonoBus as the real-time
alternatives.

Every fact carries a mark. **READ** means read today in the source linked beside it (a page, a README, a release, a
repository's code or its GitHub API record). **MEASURED** means a number measured today on this laptop, or one this
repository or v2in measured earlier, with the file it is in. **INFERRED** means reasoned from those and not tried.
**MEMORY** means known from before and not read today. Nothing was installed: the repositories were read through the
GitHub API or a shallow clone into a scratch folder, and the only network test was `ping`.

Companion to `research/music-jamming-2026-08.md`, which has the latency science (one-way under about 25 ms is the
ensemble band, 25 to 50 ms playable with a leader, over 50 to 60 ms barely tolerable) and a first table of these
systems. This note does not repeat the science; it answers what positron could run.

---

## 0. The answer in six lines

1. **Jamulus** is one server that mixes everyone and sends each player their own mix, over UDP with a custom Opus
   mode. Typical overall delay 30 to 70 ms; it is active (3.12.5 and 4.0.0 beta 3, both 2026-08-31), AGPL 3.0, and a
   headless server runs in Docker on any small Linux VPS. It needs one open UDP port, so it cannot run on Cloudflare.
2. **SonoBus** is a peer to peer mesh: every player sends to every other, and its connection server only introduces
   them. Opus or uncompressed PCM, per peer jitter buffers, GPL 3.0, desktop, iOS, Android and plugins. Its last
   tagged release is 1.7.2 (2023-12-11); work since then is on side branches.
3. **Neither runs in a browser.** Jamulus has two small third party bridges (a listen only MP3 lounge, and a
   WebSocket bridge created on 2026-10-06 with one day of commits); SonoBus has none.
4. **Getting the sound to listeners is easy with Jamulus and awkward with SonoBus.** Jamulus records every channel to
   WAV on the server (`-R`), and a headless listener client (gojam) can hand the mix to ffmpeg and on to v2in's Icecast
   or RTMP input. SonoBus audio never passes a server, so a stream has to leave one player's machine.
5. **A browser cannot reach Jamulus figures today.** Positron's own measurements put browser audio at 32.6 ms glass
   to glass over MoQ and 73.6 ms over the Cloudflare SFU, and the best published browser jamming system reached 40 ms
   on a LAN. That is the leader and follower band, not the ensemble band.
6. **Try first:** a Jamulus server on the v2in VPS in Tallinn (or a second small VPS beside it), recording on, with a
   gojam listener feeding one v2in channel; half a day, no new cost. Positron gets a page that tells players how to
   join and plays the mix for listeners. A browser jam page is a separate, measured experiment, and positron's own
   instruments are better joined by sending notes than sound (section 6).

---

## 1. Jamulus

| | |
| --- | --- |
| Repository | [jamulussoftware/jamulus](https://github.com/jamulussoftware/jamulus), 1,143 stars, last push 2026-11-06 (READ, GitHub API) |
| Releases | `r3_12_5` 2026-08-31, `r4_0_0beta3` 2026-08-31 (prerelease), `r3_12_4` 2026-08-09 (READ, GitHub API) |
| Licence | AGPL 3.0 or later for code from 3.12.1dev on; earlier code GPL 3.0 or later (READ, [COPYING](https://github.com/jamulussoftware/jamulus/blob/main/COPYING)) |
| Site | moved from jamulus.io to [jamulus.app](https://jamulus.app/); every jamulus.io page answered 301 today (MEASURED), and the 4.0 notes say *"Move internal domains from jamulus.io to jamulus.app as .io domains have an unclear future"* (READ) |
| Platforms | release assets for Windows (ASIO and JACK builds), macOS, Linux deb (GUI and headless, amd64, arm64, armhf), an Android APK and an **unsigned** iOS IPA (READ, release `r3_12_5` assets). No App Store build was found; INFERRED that iOS players need to sideload |
| Browser | no official client (READ, the comparison on [Wikipedia](https://en.wikipedia.org/wiki/Comparison_of_remote_music_performance_software) lists none); third party bridges in section 4 |

### Architecture (READ, Volker Fischer's case study, [PDF](https://jamulus.app/PerformingBandRehearsalsontheInternetWithJamulus.pdf), Linux Audio Conference, about 2015)

- Each client compresses its sound card blocks with Opus and sends them over UDP. *"At the server a set of jitter
  buffers collect the asynchronous network packets from all connected clients. In the server processing loop, the
  data packets from each client are taken from the jitter buffer, decompressed and mixed together. This mix is again
  compressed with OPUS and transmited to all connected clients."*
- Why a server and not a mesh: a mesh *"theoretically"* gives lower latency (one jitter buffer, shorter path), but
  *"the network load is high at each client"*, and a server needs no synchronisation between path delays. The cost:
  *"a server must be located close to all the musicians"*.
- The paper says *"each client receives the same mix"*; today the mix is personal: *"The faders allow you to adjust
  the level of what you hear without affecting what others hear."* (READ, [Software
  Manual](https://jamulus.app/wiki/Software-Manual)). So the server mixes and encodes once **per client**, which is
  where its CPU goes (section 2).
- No packet reordering and no clock drift correction, on purpose: *"Frequent audio dropouts are very likely"*, so
  reassembly would not help (READ, case study).

### Codec and bitrate

- Opus at 48 kHz in a custom low latency mode: gojam's build notes need *"custom modes build of Opus from Jamulus
  source tree"* (READ, [gojam README](https://github.com/dtinth/gojam)), and the jamulus-web bridge calls it *"custom,
  non-standard Opus"* (READ, its README). So a browser's own Opus decoder cannot read Jamulus packets (INFERRED from
  both).
- Audio payload per client, mono: about 72 kbit/s low, 132 normal, 216 high; with headers and small network buffers
  the meter shows about 900 kbit/s, because frames of about 1.5 ms carry *"28 + 26 + 23"* bytes of headers each.
  *"Low latency is seen by the Jamulus developers as being more important to being able to play together well than
  very good audio quality."* (READ, [discussion 1787 "Why such high
  bitrate?"](https://github.com/orgs/jamulussoftware/discussions/1787))
- New in 3.12.5 and 4.0: *"Added uncompressed audio transmission"* (READ, release notes, PR 3653). At 48 kHz and 16
  bit that is 768 kbit/s a mono channel before headers (INFERRED, arithmetic).

### Latency, and what it depends on

- *"In Jamulus typical overall delays are in the range of 30 to 70 ms. It is also typical that audio dropouts occur
  frequently (usually every 2 to 10 seconds per audible pop/interrupt sound)."* The author's band rehearsed weekly for
  three years at an average distance of about 300 km (READ, case study).
- The client's "overall delay" is *"the current ping time and the delay introduced by the current audio buffer
  settings"*. Buffer choices 64, 128 or 256 samples (1.3, 2.7, 5.3 ms at 48 kHz, INFERRED arithmetic): *"The lower the
  buffer size, the higher the probability of ... dropouts ... and the higher the upload rate and the lower the overall
  delay."* Small network buffers apply only below 128 samples. The jitter buffer is *"a trade-off between audio
  quality and overall delay"*, with an Auto setting (READ, Software Manual).
- What decides it, in order (READ, case study, and INFERRED from the manual): the ping to the server, so where the
  server is relative to every player; wired Ethernet over Wi-Fi (*"A major issue for the stability of the connection
  are other devices sharing the same internet connection, especially if Jamulus is used over a wireless computer
  network"*); the sound card driver and its buffer; and players monitoring only the server's mix, never their own
  direct sound.
- Distance: light in fibre covers about 200 km a millisecond one way (MEMORY), so Tallinn to Tartu adds about 1 ms and
  Tallinn to Berlin at least 5 ms before routing (INFERRED).
- MEASURED today from this laptop (its network is not a player's home line): `ping` to the v2in VPS 185.169.69.58,
  min 14.5, avg 23.1, max 37.9 ms over 5 packets; to jamulus.app min 22.3, avg 28.8 ms.

### How many players

- *"Usually fine to have less than 5 players on a slower-speed home connection (eg 10 Mbit/s down and 1 Mbit/s up)"*,
  and `-T` / `--multithreading` *"may help the Server support more Clients"* (READ, [Running a
  Server](https://jamulus.app/wiki/Running-a-Server)).
- Measured by users in [discussion 1052](https://github.com/orgs/jamulussoftware/discussions/1052) (READ): 53 members
  of a youth orchestra on a 4 vCPU AWS server at about 55 % (2020-12-07); a maintainer could not fit more than about 20
  clients on a 2 vCPU Linode (2020-12-06); `MixEncodeTransmitData` was 60 to 70 % of CPU before the multithreading
  work.
- AWS's own post: 1 GB RAM and 0.5 vCPU for 5 to 10 musicians, 2 GB and 1 vCPU for most groups; about 50 ms heard on a
  copper line (READ, [AWS open source blog, 2021-07-16](https://aws.amazon.com/blogs/opensource/running-your-own-server-for-jamulus-an-open-source-solution-to-jam-with-other-musicians-online/)).
- Musically the limit is the room, not the server: a band of 4 to 8 is the case the software is built for (INFERRED).

### State in 2026 (READ, GitHub API and release notes)

Two releases on 2026-08-31, regular contributors (softins, pljones, ann0see, dingodoppelt, mcfnord), and a JSON-RPC
interface on server and client that 4.0 extends (`jamulusserver/privateChatMessage`, `jamulusclient/setInstrumentCode`
and *"new RPC methods and notifications (mostly for scripting interaction)"*). IPv6 is on by default in 4.0. The
server's HTML status file and `-m` are removed in 4.0.

---

## 2. Self-hosting a Jamulus server

- **Ports:** one UDP port, default 22124 (READ, Running a Server). Optional JSON-RPC on another port, 22222 in the
  Docker image below (READ).
- **Machine:** *"at least 1.6GHz CPU frequency and 1GB RAM"* (READ, Running a Server). A headless server is a Debian
  package of its own, `jamulus-headless_3.12.5_ubuntu_amd64.deb`, 1.2 MB (READ, release assets), run under systemd as
  the wiki describes.
- **Docker:** [dtinth/jamulus-docker](https://github.com/dtinth/jamulus-docker) (Docker Hub `dtinth/jamulus` and
  GHCR), with `JAMULUS_PORT`, `JAMULUS_MAX_USERS` (default 10), `MULTITHREADING`, `FASTUPDATE`, `JSON_RPC_SECRET`,
  `SERVER_DIRECTORY` (READ). Also [grundic/jamulus-docker](https://github.com/grundic/jamulus-docker), MIT, last push
  2026-05-13 (READ, GitHub API), and `jpreardon/jamulus`, used for 6 players on a Vultr CPU optimised 4 GB VPS
  (READ, [jpreardon.com, 2025-09-15](https://jpreardon.com/2025/09/15/running-your-own-jamulus-server/)).
- **Private or listed:** unregistered (private, players type the address), registered in a public directory, or a
  directory of its own (READ, Running a Server).
- **Bandwidth:** about 0.6 to 0.9 Mbit/s each way per player at low buffers (READ, discussion 1787). Eight players for
  two hours is about 7 Mbit/s each way and about 6.5 GB out (INFERRED, arithmetic).
- **On the v2in VPS** (READ, v2in `plans/plan-vps.md`: Virtuaal C-S in Tallinn, 2 vCPU, 4 GB, 5 TB a month at 250
  Mbit/s, Debian 13): the traffic is under 0.2 % of the monthly allowance per session and the port has room
  (INFERRED). The CPU is shared with Liquidsoap and Icecast; 2 vCPU held about 20 clients on Linode (READ above), so 8
  players is comfortable on CPU. The risk is scheduling jitter from Liquidsoap's encoders on the same cores, which
  would show up as dropouts, not as a number (INFERRED). A second small VPS in the same Tallinn data centre takes that
  risk away for a few euros a month (INFERRED; Virtuaal's price list not read).
- **Licence on a server:** AGPL means a modified Jamulus offered over the network must offer its source; running it
  unmodified asks nothing (INFERRED from the licence text).

### Cloudflare, and why it is a VPS

| Cloudflare path | can it host Jamulus or SonoBus? |
| --- | --- |
| Workers, Durable Objects | no inbound UDP; Workers take HTTP and WebSocket (MEMORY, and the task's own premise) |
| Containers | no: *"Because all Container requests are passed through a Worker, end-users cannot make non-HTTP TCP or UDP requests to a Container instance."* (READ, [Containers architecture](https://developers.cloudflare.com/containers/concepts/architecture/)) |
| Spectrum | arbitrary UDP is Enterprise only, as a paid add-on; Pro and Business get only Minecraft, SSH, RDP (READ, [Protocols per plan](https://developers.cloudflare.com/spectrum/protocols-per-plan/)). Even then it only proxies to an origin, which is still a VPS (READ, [Configuration options](https://developers.cloudflare.com/spectrum/reference/configuration-options/)) |
| Realtime SFU | WebRTC only, audio codecs Opus and G.711 (READ, [SFU limits](https://developers.cloudflare.com/realtime/sfu/platform/limits/)). It cannot carry Jamulus or AOO packets, but it is the Cloudflare path for a browser jam (section 4). $0.05 a GB of egress after 1,000 GB free a month, shared with TURN (READ, [pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)) |
| Realtime SFU WebSocket adapter | sends a track's audio to a WebSocket endpoint as PCM and takes PCM back in (READ, [WebSocket adapter](https://developers.cloudflare.com/realtime/sfu/features/media-transport-adapters/websocket-adapter/)). A Worker or Durable Object could mix browser players' tracks there; nobody has measured what it adds (INFERRED) |

So Jamulus needs a VPS. The v2in VPS already exists, is in Tallinn, and is near the players who matter first.

---

## 3. SonoBus

| | |
| --- | --- |
| Repository | [sonosaurus/sonobus](https://github.com/sonosaurus/sonobus), 2,230 stars, GPL 3.0 (READ, GitHub API) |
| Releases | 1.7.2 on 2023-12-11 is the last tag; `main` has not moved since (READ, GitHub API) |
| Activity since | `develop`: JUCE 8, Android 1.7.3 build work (2026-03-30), *"updated version number for android release"* 2026-07-21. Branch `aoofreshest`: *"added server source subdir"* 2026-09-04, 1,015 lines (READ, GitHub API). One maintainer (essej) (INFERRED from the commit log) |
| Platforms | standalone on macOS, Windows, iOS, Linux; plugins AU, VST, AAX on desktop, AUv3 and IAA on iOS, VST3 and LV2 on Linux (READ, [sonobus.net](https://sonobus.net/)); Android builds in `develop` (READ) |
| Browser | none found (READ, the comparison on Wikipedia; nothing in the repository) |

### Architecture (READ, [README](https://github.com/sonosaurus/sonobus) and [user guide](https://sonobus.net/sonobus_userguide.html))

- *"All audio is sent directly between users peer-to-peer, the connection server is only used so that the users in a
  group can find each other."* Transport is AOO, Audio over OSC, from IEM Graz (READ, [AOO
  overview](https://aoo.iem.sh/overview/)).
- **Codecs:** *"full uncompressed PCM (16, 24, or 32 bit) or with various compressed bitrates (16-256 kbps per
  channel) using the low-latency Opus codec"*, chosen **per peer** (READ, README). Opus adds *"2.5 ms extra on each
  end"* with a minimum frame of 120 samples (READ, user guide).
- **Jitter buffer:** Auto, Manual, or Initial Auto (finds a value, then locks it), remembered per user name (READ,
  user guide). The guide shows *"one-way estimates ... along with round trip ping time"*.
- **Latency guidance:** about 40 ms is *"the upper limit for music"* and 25 ms *"good enough"* (READ, user guide). With
  no server in the path, two players near each other get only their own path and two jitter buffers (INFERRED from
  the architecture).
- **How many:** *"With today's (2020) technologies, the practical limit is perhaps a dozen participants."* Each player
  uploads one stream per other player, so the uplink limits a mesh first (READ, user guide; the mesh arithmetic is in
  `music-jamming-2026-08.md`, about N = 10 on a consumer uplink).
- **No encryption:** *"SonoBus does NOT currently use any encryption for the data communication"* (READ, README).
- **No echo cancellation:** headphones are required with a live microphone (READ, README).
- **Recording:** each player can record the whole session to disk, multitrack (READ, user guide).

### Self-hosting its connection server

- [essej/aooserver](https://github.com/essej/aooserver), 119 stars, last push 2024-02-08, no licence on its GitHub
  record (READ, GitHub API). `aooserver -p <port>` (default 10998, TCP and UDP), a log directory and an IP blocklist
  (READ, its README).
- Or the SonoBus standalone app is itself a connection server *"on port 10999"* (READ, SonoBus README).
- AOO 2.0 can relay through the server when a player is behind symmetric NAT (READ, search result summary of the [AOO
  documentation](https://aoo.iem.sh/overview/)); whether SonoBus 1.7.2 uses that relay was not found, and the user
  guide only advises port forwarding (READ).
- It is tiny and could run on the v2in VPS beside anything (INFERRED), but there is little reason: the public
  `aoo.sonobus.net` sees no audio.

---

## 4. Browsers, and what a positron page could do

### Bridges into Jamulus

| project | what | state (READ, GitHub API) |
| --- | --- | --- |
| [dtinth/jamulus-lounge](https://github.com/dtinth/jamulus-lounge) | listen only: gojam joins the server as a client named `lobby` with `-mp3 -vad`, a Fastify server serves `/mp3` to the browser; optional Clipper keeps the last 10 minutes for players to export (READ, its `docker-compose.yml` and `server/index.mjs`, shallow clone) | 5 stars, last push 2025-11-20, no licence on record |
| [dtinth/gojam](https://github.com/dtinth/gojam) | a Jamulus client in Go *"intended for headless streaming use-cases"*; sends the mix as raw PCM, 16 bit, 48 kHz, stereo, to a TCP address, with *"an extra large network jitter buffer"*, and a REST API (READ, README) | 3 stars, last push 2025-03-27 |
| [perrydunnit/jamulus-web](https://github.com/perrydunnit/jamulus-web) | two way: Angular page, WebSocket to a Node bridge, bridge to the server over UDP using Jamulus's **raw audio** mode to avoid the custom Opus; push to talk; `MAX_SESSIONS` 8, `FRAME_SAMPLES` 128 (READ, README) | created and last pushed 2026-10-06, 0 stars |
| [dtinth/webjam](https://github.com/dtinth/webjam) | *"[Proof-of-concept] Web-based Jamulus client (listen only, not functional)"* (READ) | 2021, abandoned |

The jamulus-web path puts TCP (the WebSocket) between the browser and the bridge, so a lost packet holds up the ones
behind it, and the bridge must sit near the Jamulus server (INFERRED). It is a way for a browser to be heard, not a
way to play tight with others.

### Browser jamming systems (READ unless marked)

| system | browser? | notes |
| --- | --- | --- |
| [JackTrip Virtual Studio](https://www.jacktrip.com/) | yes, as a second class seat | studios mix *"all the audio together"*; *"some people can connect using JackTrip's Desktop App, others using Jamulus, and others using their web browser (WebRTC)"* ([support page](https://support.jacktrip.com/support-for-jamulus)). The desktop app gives *"the best audio quality and latency"* ([FAQ](https://support.jacktrip.com/virtual-studio-frequently-asked-questions-faqs)). Broadcast to jacktrip.radio, YouTube and Facebook, stem recordings up to 30 people (premium) ([broadcast page](https://support.jacktrip.com/broadcast-and-record-with-jacktrip-virtual-studio)). JackTrip itself: MIT (GPL for the classic GUI), v3.0.1 2026-08-30 ([LICENSE.md](https://github.com/jacktrip/jacktrip/blob/main/LICENSE.md), GitHub API) |
| [JackTrip WebRTC](https://github.com/jacktrip-webrtc/jacktrip-webrtc) | yes | uncompressed PCM through an `RTCDataChannel` to *"bypass processing (i.e., encoding) and buffering delay of the RTCPeerConnection media channel"* (README). GPL 3.0, last push 2022-12-13. The paper (Sacchetto, Gastaldi, Chafe, Rottondi, Servetti, JAES 2022): *"latencies as low as 40 ms on Firefox on macOS"* and 10 to 50 % below a conventional WebRTC setup (READ in a search result summary; the AES page answered 403) |
| SoundJack ([soundjack.eu](https://www.soundjack.eu/)) | browser interface over a native helper (MEMORY; the page read today does not say) | Alexander Carôt, since 2002, *"p2p and/or server streaming mode"*, free of charge |
| [FarPlay](https://farplay.io/) | no | native, peer to peer, *"uncompressed, full-duplex 48kHz/16bit PCM"*, claims *"below 10 ms"* (for nearby peers, INFERRED), proprietary freemium |
| JamKazam | browser for finding sessions; playing is the native app (READ in search result summaries of [jamkazam.com](https://jamkazam.com/)) | proprietary, a patented jitter buffer |
| Elk LIVE | gone | *"ceased operations at the end of June 2024"* ([Music Ally, 2024-06-11](https://musically.com/2024/06/11/music-livestreaming-platform-elk-live-shuts-down-this-month/)) |

### What a browser can reach

- **Positron's own numbers, one way (MEASURED earlier, `research/music-jamming-2026-08.md` section 3 and
  `plans/plan-looper.md`):** MoQ browser audio 32.6 ms glass to glass; SFU media 73.6 ms glass to glass, two way jam
  pairs 74 to 97 ms at N = 3 to 5; data only (no audio): 1.0 ms p50 on a direct DataChannel, 16.2 ms through the
  Cloudflare SFU, 34.5 ms through a Durable Object relay.
- **Published:** 40 ms best case on a LAN for PCM over DataChannel and AudioWorklet (JackTrip WebRTC, above).
- **What sets the floor (INFERRED, from those and MEMORY of the APIs):** the browser's input and output buffers
  (`AudioContext.baseLatency` and `outputLatency`, a few to tens of ms depending on the OS and device); WebRTC's Opus
  frame (20 ms by default, 10 ms possible); and NetEq's jitter buffer, which a page can now ask to shrink with
  `RTCRtpReceiver.jitterBufferTarget` (0 to 4000 ms, *"Baseline 2026"*, working across current browsers since
  September 2026, READ, [MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpReceiver/jitterBufferTarget)).
  The PCM over unreliable DataChannel trick skips the codec and NetEq entirely and brings its own jitter buffer in an
  AudioWorklet.
- **So:** a browser jam page lands in 30 to 80 ms one way, the leader and follower band, with Jamulus and SonoBus at
  20 to 50 ms beside it (INFERRED). Good for slow material, pads, drones and call and response; not for a drummer at
  120 BPM (the thresholds are in `music-jamming-2026-08.md`).

### Can positron's instruments join a session?

- **Into Jamulus or SonoBus as sound (INFERRED):** a positron page's output on a Mac reaches a desktop client only
  through a virtual audio device (BlackHole or Loopback, MEMORY), and that is an install on the player's machine; or
  through the jamulus-web bridge, if its AudioWorklet took the page's own audio node in place of the microphone (not
  in its code as read; a change to it). SonoBus as an AU or VST inside a DAW is the other door, for instruments that
  live in a DAW, not in a page.
- **Better for positron's own instruments: send notes, not sound (INFERRED, from `plans/plan-looper.md` and the
  "shared clock, local sound" row in `music-jamming-2026-08.md`).** Every positron instrument is a patch that already
  takes value messages. Sent over the existing relays, a note arrives in 16 to 35 ms (MEASURED above), each end plays
  it on its own engine, and the player hears their own sound at once. That is Jamulus class latency in a browser with
  no audio path, but it only works for instruments both ends have, and a microphone or a guitar cannot join it.

---

## 5. Getting the sound to listeners

| path | how | delay listeners get |
| --- | --- | --- |
| Jamulus recorder | `-R <dir>`: *"Recording starts once the first person connects to the Server, and stops when the last person leaves."* (READ, Running a Server). One WAV per player plus an Audacity `.lof` and a Reaper `.rpp` that line them up (READ, search result summaries; [pljones/jamulus-jamexporter](https://github.com/pljones/jamulus-jamexporter) rebuilds lost project files) | not live; a multitrack to mix after |
| gojam into v2in | gojam's PCM out (TCP) into `ffmpeg -f s16le -ar 48000 -ac 2 -i tcp://...`, encoded and sent as an Icecast source to v2in's port 8005 or as RTMP to 1935 (INFERRED; gojam's output READ, v2in's ports READ in v2in `plans/plan-vps.md`) | gojam's large jitter buffer (not stated, INFERRED some hundreds of ms) plus v2in's Icecast, *"a few seconds, its own buffer"* (READ, v2in `plans/plan-video.md`) |
| jamulus-lounge | gojam with `-mp3`, served at `/mp3` to a page (READ) | INFERRED about a second or two: HTTP MP3 and the browser's own buffer |
| headless Icecast script | JACK, then `ffmpeg -f jack ... -acodec libmp3lame -ab 128k -f mp3` to Icecast; streams only while a listener and a participant are present (READ, [headless-jamulus-to-icecast-linux-streamer](https://github.com/dtinth/headless-jamulus-to-icecast-linux-streamer)); the author marks it unmaintained and points to jamulus-lounge (READ in a search result summary) | Icecast's few seconds |
| one player's machine | a desktop Jamulus or SonoBus client routed into OBS or BUTT and sent on (READ, a forum report of Jamulus into Reaper with JACK and ShoutVST, [SourceForge thread](https://sourceforge.net/p/llcon/discussion/533517/thread/6d4e212df1/)) | the player's uplink carries jam and stream at once (INFERRED: the jam suffers first) |
| LL-HLS or WebRTC via MediaMTX | the same ffmpeg into v2in's planned MediaMTX (READ, v2in `plans/plan-video.md`, MEASURED there for video: LL-HLS about 1 s, WebRTC about 0.3 s glass to glass) | about 1 s, or under 0.5 s on WebRTC |

The listener client is also a channel on the server: other players see it in their mixer, and its own faders set the
listeners' mix (READ: the personal mix in section 1; INFERRED for gojam, which sets nothing by default). Delay for
listeners does not matter: they only listen, and seconds behind is fine, as v2in's mix plan already says.

SonoBus has no server side recorder or listener client: the stream has to come from a player's SonoBus, one more
upload on their line (READ: no audio through the server; INFERRED: the rest).

---

## 6. Recommendation for positron

### First: a Jamulus server in Tallinn, its mix as one v2in channel

1. A private (unregistered) Jamulus 3.12.5 headless server in Docker (`dtinth/jamulus`) or from the headless deb, on
   the v2in VPS or a second small Virtuaal VPS beside it, UDP 22124 open, `-T`, `-R /srv/jamulus/rec`, max users 8.
2. gojam as a listener client, its PCM into ffmpeg, into v2in as an ordinary source (an Icecast source on 8005, or
   RTMP on 1935), so it is a channel there like any other. That is the shape `plan-mixer.md` named.
3. A positron page (one concept card) that says what it is in a line, gives the server address and how to join with
   the Jamulus app, and plays the v2in channel for listeners, labelled as a few seconds behind.
4. The first session with two or three players on wired Ethernet in Estonia, reading the client's overall delay and
   counting dropouts; then a recording through `-R`, mixed after.

- **Effort:** half a day for the server and the relay, an hour for the page (INFERRED). Players install the Jamulus
  app and need headphones and, ideally, an audio interface.
- **Cost:** nothing new on the v2in VPS; a few euros a month for a separate one (INFERRED). Bandwidth is about 6.5 GB a
  two hour session for 8 players (section 2).
- **What it cannot do:** play in a browser; keep in time beyond roughly 1,000 to 2,000 km of path or over Wi-Fi;
  avoid occasional dropouts (the author calls them normal); serve a drummer at fast tempos unless everyone is close;
  run on Cloudflare.

### Second, only if the first is used: a browser jam page, measured

On positron's own stack: Cloudflare Realtime SFU with Opus at 10 ms and `jitterBufferTarget` 0, against PCM over an
unreliable DataChannel (the JackTrip WebRTC method), measured with positron's own glass to glass harness against the
MoQ audio figure of 32.6 ms. It is a positron shaped experiment (a page, a patch, numbers), costs nothing inside the
SFU's free 1,000 GB, and its honest result will be 30 to 80 ms one way (INFERRED): enough for slow music and talk,
and a way to let a positron instrument's page join a Jamulus room through a bridge later.

### Third, for positron's own instruments: notes over the relays

Already measured at 16 to 35 ms one way and already in positron's plans (`plan-looper.md`): each end plays the shared
notes on its own engine. It needs no server beyond what exists, and it is the only way here to get ensemble band
latency inside a browser.

### Where SonoBus fits

For a duo or trio who want no server at all, or who already work in a DAW (it is a plugin), SonoBus is the better
tool, and nothing has to be hosted. It is the wrong base for a positron or v2in feature: there is no central mix to
stream, no server recorder, no encryption, and no release since 2023.

---

## Sources read today

- Jamulus: [repository](https://github.com/jamulussoftware/jamulus), [COPYING](https://github.com/jamulussoftware/jamulus/blob/main/COPYING), releases `r3_12_5` and `r4_0_0beta3` (GitHub API), [Running a Server](https://jamulus.app/wiki/Running-a-Server), [Software Manual](https://jamulus.app/wiki/Software-Manual), [case study PDF](https://jamulus.app/PerformingBandRehearsalsontheInternetWithJamulus.pdf), [discussion 1787](https://github.com/orgs/jamulussoftware/discussions/1787), [discussion 1052](https://github.com/orgs/jamulussoftware/discussions/1052), [AWS blog](https://aws.amazon.com/blogs/opensource/running-your-own-server-for-jamulus-an-open-source-solution-to-jam-with-other-musicians-online/), [jpreardon.com](https://jpreardon.com/2025/09/15/running-your-own-jamulus-server/)
- Jamulus add-ons: [dtinth/jamulus-docker](https://github.com/dtinth/jamulus-docker), [grundic/jamulus-docker](https://github.com/grundic/jamulus-docker), [dtinth/jamulus-lounge](https://github.com/dtinth/jamulus-lounge) (shallow clone), [dtinth/gojam](https://github.com/dtinth/gojam), [perrydunnit/jamulus-web](https://github.com/perrydunnit/jamulus-web), [dtinth/webjam](https://github.com/dtinth/webjam), [headless-jamulus-to-icecast-linux-streamer](https://github.com/dtinth/headless-jamulus-to-icecast-linux-streamer), [jamulus-jamexporter](https://github.com/pljones/jamulus-jamexporter)
- SonoBus: [sonobus.net](https://sonobus.net/), [user guide](https://sonobus.net/sonobus_userguide.html), [repository](https://github.com/sonosaurus/sonobus) and its branches (GitHub API), [essej/aooserver](https://github.com/essej/aooserver), [AOO overview](https://aoo.iem.sh/overview/)
- Others: [JackTrip Jamulus support](https://support.jacktrip.com/support-for-jamulus), [JackTrip FAQ](https://support.jacktrip.com/virtual-studio-frequently-asked-questions-faqs), [JackTrip broadcast](https://support.jacktrip.com/broadcast-and-record-with-jacktrip-virtual-studio), [JackTrip LICENSE.md](https://github.com/jacktrip/jacktrip/blob/main/LICENSE.md), [jacktrip-webrtc](https://github.com/jacktrip-webrtc/jacktrip-webrtc), [soundjack.eu](https://www.soundjack.eu/), [farplay.io](https://farplay.io/), [Music Ally on Elk LIVE](https://musically.com/2024/06/11/music-livestreaming-platform-elk-live-shuts-down-this-month/), [Wikipedia comparison](https://en.wikipedia.org/wiki/Comparison_of_remote_music_performance_software), [MDN jitterBufferTarget](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpReceiver/jitterBufferTarget)
- Cloudflare: [Containers architecture](https://developers.cloudflare.com/containers/concepts/architecture/), [Spectrum protocols per plan](https://developers.cloudflare.com/spectrum/protocols-per-plan/), [Spectrum configuration](https://developers.cloudflare.com/spectrum/reference/configuration-options/), [Realtime SFU pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/), [SFU limits](https://developers.cloudflare.com/realtime/sfu/platform/limits/), [WebSocket adapter](https://developers.cloudflare.com/realtime/sfu/features/media-transport-adapters/websocket-adapter/)
- Local: v2in `plans/plan-mixer.md`, `plans/plan-vps.md`, `plans/plan-video.md`; positron `research/music-jamming-2026-08.md`, `plans/plan-looper.md`
