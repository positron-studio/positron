# edgecast

Why `workers/edgecast` and `workers/edgecast-relay` are shaped the way they are. Each `why:` pointer in the code
names one heading below.

## relay

`workers/edgecast-relay/` (worker.mjs, relay-core.mjs, source.mjs, icecast.mjs) and
`workers/edgecast/relay-feed.mjs`. Asked 2026-10-20: *"when i can edgecast into v2ins 1965"*; BACKLOG steps 1, 2
and 4 (the source, the relay object, the rehearsal on a local Icecast).

- **Why a relay at all.** Väin's mount takes one source, and when the source changes their listeners' connections
  end and no player reconnects (positron-cast, "The source and Väin's mounts"). The edgecast station loses its
  engine on every eviction and every deploy of edgecast (station.mjs: "the next alarm boots it again"). If the
  station held the TCP source itself, each of those would be a dropped source, which on their mount is every
  listener gone. So the source lives in a second, small object that is deployed rarely, and a station restart
  becomes a stretch of silence on the mount instead of a dropped source.
- **Why a service binding and an HTTP POST per pump, not a WebSocket.** The station is alarm driven (one render
  every 500 ms, each its own invocation), so it has no long-lived handler to own an outbound socket, and a socket
  it held would die with it on every eviction anyway. One POST per alarm carries whatever frames that pump made
  (about 0.5 s, 8 KB). A post that fails is dropped and not retried: radio has no rewind, and the relay fills the
  hole with silence. A service binding cannot be reached from outside the account and survives either worker's
  deploy; the same route answers plain HTTP with the key, which is how the rehearsal could also drive it.
- **The headers are the cast's, byte for byte** (`workers/cast/container/server.mjs` `sourceHead`): `PUT /<mount>
  HTTP/1.0`, Basic `source:<VAIN_SOURCE_PW>`, `Content-Type: audio/mpeg`, `ice-name: Väin` in Latin-1,
  `ice-genre: archive`, `ice-url: <mount>`, `ice-audio-info: send_notification=0;save_stream=0`, no
  `ice-description`. On air only at a ` 200` status line. Measured on the rehearsal Icecast 2.4.4:
  `server_name` read `Väin` (not `VÃ¤in`), `server_description` `Unspecified description`, `audio_info`
  `send_notification=0;save_stream=0`.
- **Refusals.** 401 is not retried (a wrong password does not get better). 403 is "mount in use": Väin's own app,
  or a dead source of ours Icecast has not let go of yet, so it is retried every 5 s for 60 s and then reported.
  A timeout (8 s with no status line) or a refused connection backs off from 100 ms to 5 s, for as long as the
  run is wanted. Measured on the rehearsal Icecast: a second source got `HTTP/1.0 403 Forbidden` while the first
  held the mount, and the relay went on air on its next 5 s retry after the first let go.
- **The silent frame.** The header of the last station frame (same rate, bitrate, channel mode), no CRC, no
  padding, everything after the header zero. Zero side info is part2_3_length 0 in every granule and
  main_data_begin 0, so it needs nothing from the bit reservoir and decodes as digital silence (ffmpeg
  volumedetect -91.0 dB on a 4 s stretch between two sine passages, no decode error).
- **The pacer** keeps the mount 1 s ahead of the wall. When the station's queue is dry and the lead falls under
  0.25 s, silent frames go out at real time, so Icecast's source-timeout (10 s) never fires. A reconnect of the
  source starts the clock again and keeps only the last 1 s queued. The queue is capped at 8 s, oldest dropped.
- **Re-buffer after a gap (`resumeS`, 1 s).** Measured in the rehearsal 2026-10-20: a station whose posts stopped
  for 62 s and came back at real time was let straight back in at the 0.25 s floor, and every post that arrived
  late cut a hole of two silent frames (silencedetect: 51 ms at 1059.5 s and 50 ms at 1060.6 s in the recording).
  A station that restarts sends a 2 s burst and hid this; a station whose feed broke and recovered does not. So
  after a gap the station is let back only once 1 s is queued: one hole of the gap's length plus about 1 s, then
  none (relay-test.mjs has the jittered case and its negative control).
- **Pacing in a Durable Object** is a `setTimeout` chain every 100 ms, with an alarm every 2 s that keeps the
  object in memory and, after an eviction, takes the mount again (the source socket dies with the object, so an
  eviction of the relay is a dropped source: the reason it should do nothing else).
- **The cap** is `min` on `/start`, at most `RELAY_MAX_MIN`; the relay stops itself and lets go of the mount.
- **No default host.** `ICE_HOST`, `ICE_PORT`, `ICE_MOUNT` have no value in wrangler.jsonc, so a dev run without
  its env file answers 500 rather than reaching a real server.

## rehearsal

The step 4 rehearsal, 2026-10-20, all on this machine: Icecast 2.4.4 (the cast image's `icecast`, the cast's
icecast.xml with mount `/radio1965`, source-timeout 10 s) on 127.0.0.1:8920, the relay under `wrangler dev`
(4.75), and edgecast's `Station` subclassed in a scratch worker with exactly the two hook lines, bound to the relay
by a service binding through wrangler's dev registry.

- **`cloudflare:sockets` reaches 127.0.0.1 under `wrangler dev`**: the relay was on air 5 to 49 ms after `/start`.
- **A past alarm does not fire after `wrangler dev` restarts or hot-reloads.** The station's stored alarm stayed
  at a time already gone and nothing booted it; the relay lost its source on a hot reload (an edit to
  icecast.mjs) and its alarm never took the mount again. So "the next alarm boots it again" (station) and "taken
  again after an eviction" (relay) are not proven locally, and the restarts were finished by hand with
  `/stop` and `/start`. Cloudflare documents a stored alarm as firing after a restart; that is unmeasured here and is a question for step 5.
- **Two `wrangler dev` processes with one worker name fight over the dev registry.** A second relay started on
  another port (to see a 401) took the name, the station's binding followed it, and when it exited it deleted
  the entry: the station's posts answered 503 and then 500 until the entry was written back by hand, 62 s of silence on the mount. The mount
  held through it (silence), which is the case the relay exists for, but the cause was the rehearsal.
