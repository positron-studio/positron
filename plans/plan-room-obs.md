# plan-room-obs: OBS on a Mac streams into a room's stage over WHIP, and the film container goes

Status (2026-10-22 evening): a plan, nothing built. Asked: *"how m1 could stream to sfu via obs?"*, then
*"yes. if this works remove the r2->sfu part. it needs new patchbay nodes, remove obs etc? plan first"*.

Tags: **READ** (code or a document), **MEASURED** (where the number lives), **INFERRED** (reasoned, not checked).

## 0. The answer

OBS (30 or newer) sends WHIP: one HTTP POST of an SDP offer, then WebRTC media, and a DELETE when it stops.
positron-sfu gets one public WHIP route per room. It publishes OBS's picture and sound into the Cloudflare SFU as
one more session and remembers that session in a small Durable Object per room. The stage page asks that object
every 5 s and puts the live input on every stage with its sound, the same way it pulls the film today. Once a
real OBS on the M1 has played through it, the film container, its R2 copy and its patchbay nodes are removed,
and **Start stream** goes with them: the stage shows what OBS sends.

## 1. What exists (READ, 2026-10-22)

- positron-sfu: five room-scoped routes, an HMAC proof per room and session (`proofOf`), the `Film` container class,
  `SfuAdmin`. Tabs pull a track by `{ sessionId, proof, trackName }`.
- `demo/room/sfu.mjs`: a tab can announce tracks that live in another session (`film(pub)`, the `ext` flag), and
  every tab pulls them, the announcing tab too.
- The stage picks one presenter from claims on a light link (`pickPresenter`, earliest press wins).
- The catalogue (`demo/shell/nodes.mjs`) has `stream` (a tab's captureStream, now stale) and `stream-live`
  (`cf-stream:live`, the Stream WebRTC input with a `whip` port). `whip` is a transport a port may declare and the
  table never chooses (`bay.mjs`).

## 2. The WHIP route (positron-sfu)

- `POST /whip/<room>/<key>` with `content-type: application/sdp`. `<key>` is `HMAC(SFU_PROOF_KEY, "whip\n" + room)`,
  cut to 24 characters, so only a URL handed out by the room page can stream into that room. One URL to paste,
  no Bearer token field needed (OBS leaves it empty).
- The worker: `sessions/new`, then `tracks/new` with the offer and one `local` track per `m=` line (`a=mid`), names
  `live-<tag>-video` and `live-<tag>-sound`. Answer `201`, `content-type: application/sdp`, `Location:
  /whip/<room>/<key>/<sessionId>`. A second POST while one is live replaces it (the old session is forgotten).
- `DELETE` on the Location: forget the session (the SFU ends it by itself once media stops).
- Checks: room as `ROOM_RE`, body at most 64 KB, an offer with exactly one audio and one video `m=` line, H.264 or
  VP8 offered (the stage plays both).
- INFERRED: OBS's WHIP uses libdatachannel, whose DTLS is a different stack from ffmpeg's. werift's DTLS client
  worked with this SFU on 2026-10-22 and ffmpeg's did not (lessons/workers-sfu.md#film). Only a run with OBS proves
  libdatachannel.

## 3. Who is live: a Durable Object per room

- New class `Live` (SQLite, no container), `idFromName(room)`, holding `{ sessionId, proof, tracks, since, agent }`.
- `GET /room/<room>/live` answers that record or `{ live: false }`. CORS as the other routes.
- A session OBS never DELETEd (a crash, a pulled cable) must not stay live: on a read older than 15 s since the last
  check, the object asks the SFU `GET sessions/<id>` and drops the record when the tracks are not `active`.
  INFERRED that a dead publisher's tracks leave `active`; to be measured by killing OBS.
- `agent` is the request's `user-agent` (OBS sends `OBS-Studio/<version>`, INFERRED), shown as the node's label.

## 4. The stage page

- While joined, `/room/stage/` reads `/room/<room>/live` every 5 s. A live record is a claim every tab makes the
  same way (`t` = `since`), so all tabs agree on the presenter without anybody pressing anything.
- The tracks are pulled like the film's: `sfu.mjs` already takes tracks from another session; the announcing tab
  becomes "nobody" (each tab adds the live tracks itself, no `sfu.pub` needed). Small change: `film(pub)` becomes
  `live(pub)`, called by every tab.
- The foot gets one control instead of Start stream: **Stream from OBS**, which opens a small panel with the WHIP URL
  and a copy button, and the four OBS settings (§6). The URL is visible to everyone in the room, which is the
  room code's rule already: whoever has the link is in.
- The stage label reads `live from <agent>`; the patchbay draws the links below.

## 5. Patchbay nodes

Answering *"remove obs etc?"*: **no `obs` in any id.** A node is named for what it does, as the camera is `camera`
and not `FaceTime HD`; the software shows only in the label, read off the request.

- The machine that sends is a **site**, like `pi-1`: `?site=` on the WHIP URL names it (the owner writes `m1`),
  default `encoder`. Its node is `<site>:encoder`, kind `engine`, label `OBS 31.1` from the agent (or `encoder`),
  ports `video-out` and `audio-out` with transport `whip`.
- The SFU side stays the `cf-sfu:<room>` box the patchbay already draws for `sfu` links. Links: `<site>:encoder:
  video-out -> <tab>:stage:video-in` and `audio-out -> <tab>:stage:audio-in`, transport `sfu`, drawn through the box.
  INFERRED that `whip` on the out-port and `sfu` on the in-port need one shared transport for `bay.link` to accept
  the link; the encoder ports will declare `['whip', 'sfu']` if the bay refuses.
- Catalogue: a new `encoder` entry in `nodes.mjs` (pages `room/stage`); `stream` (captureStream) is removed, and
  `room/stage` leaves the `camera` row only if the page stops using the call camera (it does not).

## 6. OBS on the M1

- OBS 30 or newer. Settings, Stream: Service **WHIP**, Server the room page's URL, Bearer Token empty.
- Settings, Output (Advanced): encoder **Apple VT H264 Hardware Encoder**, rate control CBR 2500 to 4000 kbit/s,
  keyframe interval **2 s**, profile baseline or main, **B-frames off** (WebRTC has no B-frames; INFERRED that OBS
  does not drop them by itself for WHIP). Audio 48 kHz (OBS sends Opus over WHIP).
- Settings, Video: 1280x720 at 30 fps to start.
- One layer: every viewer gets the same size. Whether OBS sends simulcast over WHIP was not checked.
- The M1's network: if it sits behind a VPN that drops UDP, the handshake passes and no media arrives (CLAUDE.md).
  The room page can say so: live record present, stage tracks with no frames after 10 s.

## 7. Removing the film container (only after §8 step 3 passes)

- positron-sfu: `Film` class, the `film/` folder, `containers` in wrangler.jsonc, migration `v2` with
  `deleted_classes: ["Film"]` and `new_sqlite_classes: ["Live"]` (one migration does both), then
  `wrangler containers delete positron-sfu-film` for the application.
- R2: `mimproject/party-container-vabaduse-valjak-2010-webrtc.mp4` (23 MB) deleted.
- Page: `startFilm`, `FILM_API`, the `cf-r2:film` and `cf-sfu:film` nodes, `leadFilm`, Start stream.
- Lessons: `kit-participant.md#film` and `workers-sfu.md#film` get a superseded line; the DTLS finding stays,
  because it is why a WHIP route is not tested with ffmpeg.

## 8. Steps, in order

1. WHIP route, `Live` object, `/live` (worker only; the film stays). Test with a werift WHIP client in the
   scratchpad, the same calls OBS makes: POST, media, DELETE. Deploy positron-sfu.
2. The stage page reads `/live`, pulls, draws the nodes, the Stream from OBS panel. Harness: the werift client
   streams a fake picture into a room, 4 tabs see it with sound, a late joiner, the client killed without DELETE
   clears the stage within 20 s. Deploy the site.
3. **The owner streams from OBS on the M1** into a room and watches it on a phone. This is the gate.
4. Remove the film container (§7). Deploy positron-sfu and the site.

Time box: steps 1 and 2 in one sitting, about two hours; stop and report if OBS's offer is refused in step 3.

## 9. Open

- Is it one live input per room (this plan), or may several machines send at once (a stage with two sources)?
- Should the tab's own screen share (/room/present/) stay as it is? This plan does not touch it.
- Nothing records (the brief's rule): the SFU forwards and keeps nothing.
- Cost: the SFU bills what it sends out, past a free allowance (prices in plan-video-room.md, not re-read here).
  One 3 Mbit/s input to 10 viewers is 30 Mbit/s out, about 13.5 GB an hour (COMPUTED).
