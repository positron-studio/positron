# Workers lessons: sfu

The reasons behind `workers/sfu/worker.mjs` (positron-sfu, sfu.positron.studio).

<a id="header"></a>

## `worker.mjs` header

Built 2026-10-22 for `/room/video/` (split 2026-10-22 into `/room/present/` and `/room/stage/`; `/room/video/` is gone) (`plans/plan-video-room.md`). Cloudflare Realtime SFU, app
`8c2a974b...`, the same app the retired `elektron-rtc` used.

- **Not a proxy.** The old worker forwarded `/cf/*` to the SFU behind one shared token, which a public page
  cannot keep. Cloudflare's own advice: *"Avoid an unrestricted SFU proxy that lets a browser select arbitrary
  sessions, publications, or destructive operations."* So five calls, each under `/room/<room>/`.
- **The proof.** A session is created for a room and returned with `HMAC(SFU_PROOF_KEY, room + session)`. Every
  later call on it must carry that proof, and a pull must carry the publisher's proof for the same room. So a
  tab can only touch its own sessions and only pull what was published in its own room. The room code is the
  gate, as on the relay: anybody with the link is in. `SFU_PROOF_KEY` was generated into the worker and is kept
  nowhere else; rotating it only makes the proofs already handed out stop working.
- **Close is forced**, so a tab that is leaving does not have to finish an SDP exchange.
- **Origin** is the site or a local dev server; a script with no Origin is let through, as edgecast does, which is
  not security (a script sends what it likes).
- **No rate limit yet.** A caller can make sessions; they cost nothing until media flows, and an unconnected
  session expires. A per-room cap belongs in a Durable Object if it is ever needed.
- MEASURED 2026-10-22 on the deploy: `GET /` 200; a session 201; publish with no proof 403, with another room's
  proof 403; a pull naming a forged publisher proof refused in words; a request from another origin 403. Four
  Playwright tabs with fake cameras through it: every tile playing in 5.0 s, routes `srflx`.

<a id="film"></a>

## `Film` and `film/server.mjs`: the room's film from a container

> Removed the same evening (class deleted in migration v3, container application deleted, R2 copy deleted) for the
> [WHIP input](#whip). The DTLS finding below stands: it is why the WHIP route is tested with OBS or werift, never ffmpeg.

One container per room (`getContainer(env.FILM, 'room-<room>')`, `max_instances` 3, instance `basic`, `sleepAfter`
90 s). It is a participant like a tab: it asks this worker's public `session` and `publish` routes, so it holds no
secret. ffmpeg copies the film to RTP on loopback (no encode) and werift 0.22.9 sends it.

Why not ffmpeg's own WHIP muxer, which pub uses into Stream. MEASURED 2026-10-22 on this desk, ffmpeg 9.0.1 and the
pub image's 8.1.2, through a shim to `tracks/new`:
- ffmpeg offers `a=setup:passive` and the SFU answers `a=setup:passive` too, which RFC 5763 does not allow: both
  sides wait.
- With `-whip_flags dtls_active` ffmpeg sends its ClientHello after `ICE STUN ok` and the SFU never answers it
  ("DTLS session failed" at the handshake timeout). An ECDSA P-256 certificate (`-cert_file`) changed nothing.
- werift's DTLS client to the same SFU from the same desk connects at once, so the network is not it.

The film is a WebRTC shaped copy made once, as pub's: `party-container-vabaduse-valjak-2010-webrtc.mp4` in
`positron-station`, H.264 constrained baseline 3.1, no B-frames, 2 s GOP at 25 fps, 1.1 Mbit/s, Opus 128 kbit/s 48 kHz,
23 MB. MEASURED in Docker: 13 % of a core, 145 MiB. A cold box answers "There is no container instance" until the
server listens, so `start` awaits `startAndWaitForPorts()`.

<a id="whip"></a>

## `POST /whip/<room>/<key>` and `Live`: one live input per room

The key is `HMAC(SFU_PROOF_KEY, "whip\n" + room)` cut to 24 characters, so only the URL the room page shows streams
into that room; a wrong key is 403. The worker makes a session, publishes the offer's one audio and one video `m=`
line as `live-<tag>-sound` and `live-<tag>-video`, answers 201 with the SDP and `Location: /whip/<room>/<key>/<sid>`,
and stores `{ sessionId, proof, tracks, since, site, agent }` in the room's `Live` object. A second POST replaces
the first. DELETE on the Location forgets it. A sender gone without a DELETE is dropped on the first read 15 s after
the last check, when `GET sessions/<id>` shows no `active` track.

MEASURED 2026-10-22: OBS 32.2.2 (macOS, `obs-webrtc`, libdatachannel) finishes DTLS with the SFU where ffmpeg could not
(`PeerConnection state is now: Connected`, connect 285 ms); werift's WHIP client too.
