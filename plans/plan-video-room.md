# plan-video-room: video rooms on the patch bay, then screen sharing, then watching together

Status (2026-10-22): a plan, with its first three steps built and not deployed (§8a). Built: the participant
tile and grid (`demo/shell/participant.mjs`, a block on /kit/chat/), a full mesh over the relay room
(`demo/room/mesh.mjs`), the page `/room/video/` (not on the front page), its phone layout, `p2p` and `sfu` in the
bay, short room codes and a lobby. Checked locally with Chromium's fake camera and microphone, two to
four tabs, a local relay and no TURN. Nothing was deployed and nothing was committed. Prices were read on
2026-10-22.

Asked 2026-10-22 by the owner, in this order:
1. *Video room demo.* Take the demo with the chat on the right and the admin area on the left, remove the admin
   part and its messages, and put a grid of the participants' cameras there: Zoom-like WebRTC video for many.
   Work out the grid for 1 to N people, phone and desk, and the active speaker. A kit component for one
   participant's video first. Basic controls: mute your own mic and camera.
2. *Next: anybody can present.* Screen sharing, with new patch bay nodes (a screen source, a presenter or stage),
   and how the layout switches to the presenter plus a strip of participants.
3. *Collective watching.* The admin broadcasts a feed everybody watches together, with the camera grid and the
   chat beside it.

How the dictation was read: **"batch pay" and "batch bay" are the patch bay**: the bay in `demo/shell/bay.mjs`
(nodes, ports, links), drawn by `demo/shell/patchbay.mjs`, joined to other tabs by `demo/shell/bay-node.mjs`.
**The demo with chat right and admin left is `/room/broadcast/`** (`demo/room/broadcast/index.html`, card
"Broadcast chat"): whoever joins first is admin and writes in a column of their own on the left, the rest chat in
the right third.

Tags: **READ** (taken off code or a document), **MEASURED** (with where the number lives), **COMPUTED** (arithmetic
on tagged numbers), **INFERRED** (reasoned, not checked).

## 0. The answer

1. **The bay already has the shape of a video room, but not its wire.** A room is a Durable Object on the relay
   (`workers/relay/src/index.js`), every tab is a site, chat is a `*` link, and a camera is a `video-out` port
   (READ). Video is a HEAVY medium: the bay negotiates a session for it and never carries it
   (`bay.mjs:26`). What is missing is a transport for browser-to-browser or browser-to-SFU media: the bay's
   table offers `whep` for one far receiver and `llhls` for many (`bay.mjs:53-58`), and neither is a meeting.
2. **Built today: the tile, the grid, the mute buttons and a mesh.** `/room/video/` is `/room/broadcast/` with the
   admin column replaced by a camera grid. MEASURED locally: three and four tabs all `connected`, every remote
   tile 640 x 360 and playing, a mute and a camera off seen by every other tab within 2.5 s, Leave removes the
   tile everywhere. The mesh is for small groups and for showing what a mesh costs, not for a big room.
3. **A mesh holds 4 people well and 6 at most.** Each person uploads one copy of their camera per other person
   and encodes it once per peer. At 15 people that is 14 uploads of about 0.5 Mbps each, 7.4 Mbps up from every
   participant (COMPUTED, §3.1). The page stops at 6 (`MESH_MAX`).
4. **For a room of 15 to 25, use Cloudflare Realtime's SFU, with TURN on 443 from Cloudflare, and keep rooms on
   our own relay.** It is the SFU this repository already measured to 20 people (`proto/m2m/`), the room
   Durable Object we already run, and TURN that is free when used with the SFU. A 45 minute session of 25 people
   is about 37 GB of egress, so the free 1,000 GB a month covers about 27 such sessions; past that it is about
   $1.85 a session (COMPUTED, §3.3). LiveKit Cloud is about 2.4 times the price per GB and its free tier is about one
   session; LiveKit or mediasoup self-hosted means running a server.
5. **Screen sharing is two new nodes and one rule.** A `share` node (the screen, `getDisplayMedia`), a `stage`
   node on every tab (the big picture), and the presenter's `share` link says who presents. When a
   stage link exists, the grid becomes stage plus a strip.
6. **Watching together is two different things.** A LIVE feed (a camera, a device, a screen) goes out over the
   SFU like a presenter. A FILE is better played in every tab from R2 and kept in step by the relay, with the
   play, pause and seek of whoever presses them as light events: better picture, no media server, almost no cost.
7. **The big gaps were not video, they were the room.** Room names were guessable (`video-1`), the relay is
   tokenless, a mesh shows every participant's IP address to every other one, and the TURN minting route allowed
   20 credentials per address per hour, so everybody behind one public address was refused at the 21st. Since
   2026-10-22 (§8a): a short random room code, the camera and microphone may be off at Join, TURN counted per
   room (not deployed). There is no admin: everybody in a room is a participant.

## 1. What the patch bay is today (READ)

| part | file | what it gives a video room |
| --- | --- | --- |
| the bay | `demo/shell/bay.mjs` | nodes, ports, links; media `midi audio clock value video program file state`; HEAVY media get a session, light media are delivered by the bay; a `*` link fans a light port to every other tab and is refused for heavy media |
| the transport table | `bay.mjs:44-70` | video: `page` on one machine, `datachannel` on a network, `whep` (or `relay-h264`) to one far receiver, `llhls` to many. No name for a meeting |
| the catalogue | `demo/shell/nodes.mjs` | `chat`, `admin`, `notice`, `camera` (video-out), `screen` (a picture, video-in), `player-video`. No microphone, grid, stage or screen share |
| the room | `workers/relay/src/index.js` (`positron-ws`) | one Durable Object per room name; every message to every socket, sender included; never stored; tokenless; 128 sockets, 1 MB a message, 1,000 messages a second. A good signalling bus |
| a page as a node | `demo/shell/bay-node.mjs` | join on a press, announce this tab's graph, `bay.event` for light links, `link.request`; refuses an event from a socket that did not announce its site |
| the registry | `demo/shell/graph-registry.mjs` | who is in the room, stale after 15 s |
| chat | `demo/shell/chat-ui.mjs` | window (two columns, a phone stacks them), grid of 1 to 6 cells, log, sign, compose |
| a picture | `demo/shell/video-panel.mjs` | a picture with a footer and full screen, iPhone fallback included |
| TURN | `workers/pub/worker.mjs:386`, `demo/shell/live.mjs:119` | `GET pub.positron.studio/ice` mints Cloudflare TURN credentials (4 h), 120 an hour overall, 20 an hour per address |
| one-to-many video | `live.mjs`, `/video/webrtc/` | WHIP into one Cloudflare Stream input, WHEP out. One input, 409 while held |
| an SFU | `proto/m2m/`, `plans/plan-m2m.md` | Cloudflare Realtime SFU measured to N = 20 in August (one machine, headless). Its worker `elektron-rtc` was deleted 2026-10-13. No SFU client in `demo/shell/` |

What `/room/broadcast/` does that this plan keeps: Join on a press, the chat as two `*` links, the patchbay at the
foot showing the links this tab holds. What it drops: the admin column, its `admin:value-out -> *:notice:value-in`
link and the violet broadcast sign.

⚠️ A gap found while building: two browser tabs with no `net` on their graphs are read by the bay as the same
`machine` (`whereOf`), so a video link between two tabs is offered `page`. The page asks for its transport by
name (`via`) to get past it.

## 2. Case 1: the video room

### 2.1 What is built (MEASURED where it says so)

- **`createParticipant({ name, self })`** in `demo/shell/participant.mjs`: one tile. The picture fills it
  (`object-fit: cover`), the name sits on the picture bottom left, a red crossed mic when muted, initials when the
  camera is off, a yellow inset ring while speaking (it never changes the tile's size), one state word top right
  (`connecting`, `relay`). Your own tile is mirrored and silent. It is its own small box, not `createVideoPanel`,
  because a footer per tile would eat a fifth of every picture in a grid of 16.
- **`createParticipantGrid()`**: every tile the same size, the biggest that fits the grid's own box, the last row
  centred, re-sized by a `ResizeObserver`. Under 120 px wide it stops shrinking and scrolls. Shown on /kit/chat/
  with a stepper from 1 to 6 people (desk asserts 11 of 11, MEASURED).
- **`demo/room/mesh.mjs`**: one `RTCPeerConnection` per other tab, signalled as `rtc.sig` messages on the room the
  page already joined. The site that sorts first offers. A signal is accepted only from the socket that announced
  its site. Camera off and on is `replaceTrack`, never a new offer.
- **`/room/video/`**: the camera grid where the admin column was, the chat in the right third. Controls in the
  footer: Join, then mic, camera and Leave. Mic off disables the track (silence, no delay to unmute). Camera off
  STOPS the track, so the light on the laptop goes out. The mute state is a light link
  `<me>:controls:value-out -> *:grid:value-in`, so every tile shows it. The camera and microphone are one named link per
  other tab (`<me>:camera:video-out -> <them>:grid:video-in`), so the patchbay draws the mesh as it is:
  2 x (N - 1) heavy links per tab.

### 2.2 The grid: how it adapts (MEASURED with `fit()`, `lessons/kit-participant.md#fit`)

Desk, an 800 x 450 box, 16:9 tiles:

| people | layout | tile |
| --- | --- | --- |
| 1 | 1 x 1 | 800 x 450 |
| 2 | 2 x 1 | 398 x 223 |
| 3 or 4 | 2 x 2 (3 leaves the last row centred) | 396 x 223 |
| 9 | 3 x 3 | 261 x 147 |
| 16 | 4 x 4 | 194 x 109 |
| 25 | 5 x 5 | 154 x 86 |

Phone, a tall 343 x 500 box: tiles turn 3:4, because a phone held upright sends an upright picture. 4 people are
2 x 2 at 169 x 226, 9 are 3 x 3 at 111 x 148. The box decides, not the device, so a phone on its side gets the
desk layout.

Rules still to build, in this order:
1. **Speaker view.** Past 9 people on a desk, or 4 on a phone, the active speaker takes the stage (case 2's
   layout) and the rest go to the strip. A button switches grid and speaker view, and the choice is per person.
2. **Pages, not a wall.** A phone shows at most 4 tiles (you, the speaker, two more) and swipes to the next 4.
   With an SFU it only pulls the tiles it shows, which is what keeps a phone cool (§8).
3. **Order.** You first, then by who spoke last, so the people talking stay on the first page. Today it is
   join order.
4. **The active speaker** is built locally: an `AnalyserNode` per stream, the loudest over a floor, held 1.2 s.
   With an SFU every tab still hears every audio track, so this keeps working.

### 2.3 What is missing

| missing | where | size |
| --- | --- | --- |
| ~~catalogue entries `microphone`, `grid`, `controls`~~ done 2026-10-22, §8a | `nodes.mjs` | small |
| ~~transport names `p2p` and `sfu` in the table~~ done 2026-10-22, §8a | `bay.mjs` | small |
| an SFU client: one peer connection, publish camera and mic with three simulcast layers, pull the tiles on screen at the layer their size needs | `demo/shell/sfu.mjs` | medium |
| an SFU worker: holds the app secret, checks the room code and the role, calls `sessions/new` and `tracks/new`, mints TURN per room | `workers/<name>/`, the name is the owner's | medium |
| a roster in the room: who publishes which track name | the relay room, as graph announcements | small |
| ~~room codes and a lobby~~ done 2026-10-22, §8a | the page | small |
| speaker view, pages, order (§2.2) | `participant.mjs`, the page | small to medium |
| ~~a phone layout with the chat in a tab instead of half the screen~~ done 2026-10-22, §8a | the page | small |

### 2.4 Topology for case 1

Mesh up to 4 (the built page, and a breakout room of a few). SFU from 5 up, and always for a big room. §3.

## 3. Topology and cost

### 3.1 Mesh: how many it holds (COMPUTED from INFERRED bitrates)

Assumed: a camera at 640 x 360, 24 fps, about 0.5 Mbps, plus Opus at 32 kbps, so about 0.53 Mbps a copy.

| people | each uploads | each downloads | encodes per laptop | verdict |
| --- | --- | --- | --- | --- |
| 3 | 1.1 Mbps | 1.1 Mbps | 2 | fine |
| 4 | 1.6 Mbps | 1.6 Mbps | 3 | fine |
| 6 | 2.7 Mbps | 2.7 Mbps | 5 | the limit, a phone gets hot |
| 10 | 4.8 Mbps | 4.8 Mbps | 9 | breaks on home upload |
| 15 | 7.4 Mbps | 7.4 Mbps | 14 | does not work |
| 25 | 12.7 Mbps | 12.7 Mbps | 24 | does not work |

And if everybody sits in one place on one Wi-Fi access point, a mesh of 25 moves about 25 x 24 x 0.53 = 318 Mbps
up and the same down through that one access point. Published guidance agrees: four to six is the practical ceiling
for a mesh (sources at the end). A mesh also shows each participant's IP address to every other one (§6).

### 3.2 The options (READ 2026-10-22, prices from the vendors' pages)

| option | what it is | price | fits positron |
| --- | --- | --- | --- |
| **Cloudflare Realtime SFU** | managed SFU on Cloudflare's network, sessions and tracks over an HTTPS API, simulcast, no rooms (we bring them) | $0.05 per GB of egress, first 1,000 GB a month free, shared with TURN; ingress free | yes: same account, same edge, measured here to N = 20, rooms already on our relay |
| **Cloudflare TURN** | `turn.cloudflare.com`, UDP 3478 or 443, TCP 3478 or 80, **TLS 5349 or 443** | free with the SFU; alone $0.05 per GB; traffic between TURN and the SFU is not billed twice | already minted by `pub /ice` |
| Cloudflare RealtimeKit | rooms, SDK and UI on top of the same SFU | $0.002 a minute per audio and video participant, recording $0.010 a minute, no free tier listed | less of our own patch bay; a fallback if building on the raw SFU stalls |
| LiveKit Cloud | managed SFU with SDKs | Build: free, 5,000 WebRTC minutes and 50 GB down a month. Ship: $50 a month, 150,000 minutes and 250 GB, then $0.0005 a minute and $0.12 per GB | good product, but a second vendor and about 2.4x Cloudflare's price per GB past the bundle |
| LiveKit self-hosted | open source SFU (Apache 2.0) with its own TURN | a server with a public address, UDP ports open on it, a domain and certificate for TURN on 443 | somebody runs a server: updates, certificates, monitoring |
| mediasoup | an SFU library for Node.js, not a product | a server, plus our own signalling, rooms and a TURN server (coturn) | the most work; worth it only for control we do not need |

### 3.3 What a session costs on the recommendation (COMPUTED)

Assumed (INFERRED): three simulcast layers at about 0.5, 0.15 and 0.05 Mbps; small tiles pull the 0.15 layer;
audio 32 kbps; 1 Mbps for an hour is 0.45 GB; a session is 45 minutes. A desk pulls every tile, which is the most
expensive case.

| room | each participant downloads | room egress | per session | free sessions a month | past the free tier |
| --- | --- | --- | --- | --- | --- |
| 15, grid | 14 x 0.18 = 2.5 Mbps | 38 Mbps | 13 GB | about 77 | $0.65 a session |
| 25, grid | 24 x 0.18 = 4.4 Mbps | 109 Mbps | 37 GB | about 27 | $1.85 a session |
| 25, no simulcast (worst) | 24 x 0.53 = 12.7 Mbps | 318 Mbps | 107 GB | about 9 | $5.35 a session |
| 25 on phones, 4 tiles each | 4 x 0.18 + 20 x 0.03 = 1.4 Mbps | 33 Mbps | 11 GB | about 90 | $0.55 a session |

The free 1,000 GB is per account and shared with anything else on it that uses the SFU or TURN. For comparison on
the 25 grid: RealtimeKit is 25 x 45 x $0.002 = $2.25 a session from the first session; LiveKit Cloud's free 50 GB is
about one session, and Ship's 250 GB is about six, then $4.44 a session.

**Recommendation for 15 to 25: Cloudflare Realtime SFU, Cloudflare TURN on 443, rooms on our relay.** Keep the
mesh for 2 to 4 and for teaching what a mesh is. Do not self-host for a big room: somebody would be running a
media server.

## 4. Case 2: anybody can present

### 4.1 What the bay supports today
The camera is already a `video-out`; `screen` is already a catalogue node for "a picture"; light links carry who has
the floor as easily as they carry a chat line. Nothing captures a screen and nothing decides who may present.

### 4.2 New nodes (names are proposals, the owner settles them)

| node | kind | ports | on which tab |
| --- | --- | --- | --- |
| `share` | device | `video-out` (the screen), `audio-out` optional (a tab's sound, Chrome on a desk only), `value-out` (`{ presenting }`) | anybody who presses Share |
| `stage` | screen | `video-in`, `audio-in` | every tab: the big picture |
| `hand` | person | `value-out` (`{ up: true }`) | every tab |

The links: `<presenter>:share:video-out -> <each>:stage:video-in` (heavy, `p2p` on the mesh, `sfu` later: one
publish and N pulls), `<presenter>:share:value-out -> *:stage:value-in` (light, who is on), `*:hand:value-out ->
*:grid:value-in` (light, a raised hand shows on the tile). Nobody is admin: one presenter at a time, Share is off
for everybody else while somebody presents, and the presenter stops it.

### 4.3 The layout switch
- No presenter: the grid (§2.2).
- A presenter: the camera column becomes **the stage plus a strip**. Desk: the stage fills the column at the
  share's own shape, and under it one row of tiles that scrolls sideways, the presenter's camera first, then the
  speaker, then you. Phone: the stage full width at the top, the strip under it, the chat behind a tab.
- The presenter sees "You are presenting" with a small preview, never their own screen full size, which would be
  a hall of mirrors.
- When the share ends, back to the grid. The presenting event is repeated for late joiners, as `/room/broadcast/`
  repeated its broadcast.

### 4.4 What is missing
`getDisplayMedia` in a `share` runtime with `contentHint = 'detail'` (text stays sharp at low frame rates); the
three catalogue entries; the stage and strip layout in `participant.mjs`; one presenter at a time in the room; a
Share button that is hidden where `getDisplayMedia` does not exist (phones, §8).

### 4.5 Topology and cost
SFU. One screen share at about 1.5 Mbps to 24 people is 36 Mbps, about 12 GB a session; a strip of 6 tiles and
everybody's audio adds about 13 GB. About 25 GB a 45 minute session for 25 people (COMPUTED). A mesh cannot carry it:
the presenter would upload the screen 24 times.

## 5. Case 3: watching together

### 5.1 Two kinds of feed
- **A live feed** (a camera on an experiment, a device, a screen with a live source): whoever has it publishes it
  once and every tab pulls it onto its `stage`. The same nodes as case 2. About 2.5 Mbps for 720p to 24 people:
  28 GB an hour, plus the strip and the chat (COMPUTED).
- **A file** (a film, a recording): do not send it through WebRTC. Every tab plays the same file from R2 (no egress
  fee), and play, pause and seek, pressed by anybody, go out as light events on the relay. The bay already has a
  shared clock and timed links (`bay-node.mjs` `shared`, and timed links `ahead` and `follow`, used by `/sync/` and
  the archived clock pages such as `/archive/clock-play-together/`), so "everybody at 12:04 of the film" is one
  timed event. Better picture than a re-encode, no media server, almost no cost.

### 5.2 Nodes
Live feed: a tab's `camera`, `share` or `player-video` -> `<each>:stage:video-in`, transport `p2p` now, `sfu` later.
File: `player-video` on every tab with `file-in` read by `https` from R2, and `*:transport:value-out ->
*:player-video:value-in` (play, pause, seek, with `at` on the shared clock). The catalogue has `player-video`
today with a `page` video-out; it needs a `value-in` for the transport.

### 5.3 The layout
The stage takes the column, the strip of cameras under it, the chat on the right as now. Microphones start
muted in watch mode, with push to talk. INFERRED: a film playing from a `<video>` element may not be in Chrome's
echo canceller's reference, so an open mic would send the film back to everybody.

### 5.4 What is missing
The transport event and its catalogue port, watch mode (mics muted by default), a stage that can show a file or a
WebRTC track, and an answer about the rights to show a given film to a group over the internet (§10).

## 6. Security and privacy

- **Consent.** No camera, microphone or connection before Join is pressed (built). The browser's prompt is the
  consent. Camera off stops the camera, so the light goes out (built). Anybody can join with the camera or the
  microphone off and stay that way, and what is off is not asked for (built, §8a).
- **Who may join.** A room is a six character random code (built, §8a): about 890 million codes, so not
  guessable, but not a password either. Anybody holding the link is in the room, the relay is tokenless, and in
  a mesh they connect. A gate needs the relay to check something: rooms ending `-cam` already take a key in the
  first message (`workers/relay/src/index.js`, `CAM_ROOM`), so that pattern is there if it is ever wanted.
- **Nobody is admin.** Asked 2026-10-22: *"its just rooms with users / participants"*. Everybody may share, one at
  a time; nobody can mute or remove anybody else. `/room/broadcast/`'s earliest clock admin is not carried over.
- **Recording: none, by default and by design.** The SFU records nothing, the relay stores nothing, the chat is not
  kept (do not use `/room/history/`'s store here). If recording is ever wanted, it is a separate decision with a
  visible red mark on every screen, everybody's consent, and a stated retention.
- **Where the media goes.** Through Cloudflare's SFU, which terminates the encryption, so Cloudflare could see the
  media as a processor. End-to-end encryption on top is possible later (insertable streams), not in the first
  versions. In a mesh the media is direct, but every participant's IP address is visible to every other one; forcing
  TURN (`iceTransportPolicy: 'relay'`) hides it, and TURN is only free alongside the SFU.
- **Secrets.** The SFU app secret and the TURN key stay in a worker, never in a page (as `pub /ice` does today).

## 7. Restricted networks

- **Nothing inbound.** Every connection starts on the participant's side and goes out: the page and the relay on
  HTTPS and WSS (443), TURN on 443, media to Cloudflare. No port has to be opened towards anybody.
- **UDP may be blocked.** Then media goes through `turn.cloudflare.com` over TLS on 443, which looks like HTTPS to a
  firewall. It works, with more delay and choppier video under loss (TCP). Allowing outbound UDP to Cloudflare is
  the better fix, and it is outbound only.
- **TLS inspection** (a proxy that opens HTTPS) can break TURN over TLS, because it is not HTTP. The fix is a
  bypass for `turn.cloudflare.com` (INFERRED, to test on such a network).
- **Filters** may block an uncategorised site. The list to allow: `positron.studio`, `ws.positron.studio`, the SFU
  worker's address, `turn.cloudflare.com`, `stun.cloudflare.com`.
- **One public address for many people** (an office, a café, a mobile carrier's NAT). `pub /ice` minted 20 TURN
  credentials per address per hour, so the 21st person got none. With `?room=` it counts per room (built, not
  deployed, §8a).
- **One Wi-Fi for everybody.** If everybody sits in one place, an SFU room of 25 is about 18 Mbps up and 109 Mbps
  down through one access point (COMPUTED). Possible, not comfortable. Pulling only the visible tiles is what keeps
  it sane.
- **This desk's VPN** drops UDP while passing the handshake (CLAUDE.md). Another VPN or proxy will look the same:
  "connected" signalling and no picture. TURN on 443 is the cure in both places.

## 8. Phones

- **Cameras and autoplay.** iOS Safari and Android Chrome both do `getUserMedia` on HTTPS. Video needs
  `playsinline` (set) and sound needs a press first (Join is that press).
- **Leaving the app.** iOS stops the camera when the tab goes to the background or the screen locks. The tile
  should show camera off, and the page should ask for the camera again on return.
- **Screen sharing.** INFERRED from the platforms as documented: iOS Safari has no `getDisplayMedia`, and Chrome on
  Android does not offer it either. Phones can watch a presentation and cannot present. The Share button is hidden
  where the API is missing. To check on real devices.
- **Heat and battery.** A phone decoding 24 tiles gets hot. With the SFU a phone pulls at most 4 tiles at the
  small layer, plus the stage.
- **Data.** A desk pulling 24 tiles uses about 1.5 GB in a 45 minute session; a phone pulling 4 about 0.5 GB
  (COMPUTED). Worth telling people on mobile data.
- **Layout.** Today the chat window stacks the grid and the chat in two halves on a phone, so the chat takes half
  the screen. A phone should get the grid (or stage and strip) with the controls at the bottom, and the chat
  behind a tab (§2.3).

## 8a. Built after the plan, 2026-10-22

### Step: the phone layout (done, local only)

What it does, on `/room/video/`:
- Below 560 px, Video and Chat are two tabs over the window (`createTabs`, no hash), one column shows at a
  time, and a chat line that arrives while Video is open shows as `Chat 1` on the tab.
- Joined, the window is one screen tall (`100dvh` less the safe area insets) and Join scrolls it into
  place. Before Join it is 4:5, so the Join button is on the first screen.
- Joined at any width, the picture is capped at the screen less the footer, so a phone on its side keeps
  its controls in reach.
- Tiles stretch within their shape family to fill the grid (`fill()` in `participant.mjs`): four people on
  a phone are 164 x 292 instead of 164 x 219.

Fixed on the way, in `chat-ui.mjs`: the phone rule meant to make a 4 to 6 cell chat grid 3:4 never applied,
because the desk rule `.pos-chat-gwin[data-n="4"] .pos-vp-stage` (0,3,0) beat it (0,2,0). The phone rule is
`[data-n]` now, same weight and later. `/typist/score/` passes `fixed: true`, whose (0,4,0) rule still wins,
so it does not change.

The two CHAT GRID checks on `/kit/chat/` were desk only, and they already failed at 375 px BEFORE this
work: run against HEAD's page at 375 they read `{"2":"1,1","3":"1,1,1",...}` and `0.75 at 3`, the same as
the working tree. They are phone aware now: the rows ask the frame's own width (the component's container
query), the shape asks the window's (its media query). Phone shape at 3 and 4 cells is 3:4.

How it was checked (MEASURED 2026-10-22, Playwright 1.58.2 from outside the repo, Chromium's fake camera
and microphone, `demo/fake-relay.mjs` on :8897, `?turn=0`, a fresh `video-test-<6>` room per run):
- 4 contexts, 2 desk (1280 x 860) and 2 phone (375 x 812, `isMobile`): every pair `connected`. Phone: the
  window 0 to 812, the grid 341 x 713, tiles 2 x 2 at 164 x 292 and 3:4, footer buttons at 767 to 801 px,
  no sideways overflow. Desk: unchanged two columns, tabs `display: none`, tiles 222 x 166.
- A line typed on a desk arrived on both phones as `Chat 1`; pressing Chat showed it with the compose box
  above the footer, and the count went back to 0.
- A phone on its side (812 x 375) after Join: the room at the top of the screen, both columns full width
  (457 and 228 px), footer in reach.
- `/kit/chat/?selfcheck=1`: 11/11 at 1280 and at 375.
- Screenshots looked at: before Join on a phone, the phone grid, the phone chat, the desk, the phone on
  its side (`shots/phone-*.png`, `shots/land-0.png` in the session scratchpad).

Not checked: a real iPhone (safe areas, the toolbar changing `dvh`, the on-screen keyboard over the
compose box), and Safari at all.

### Step: names in the bay (done, local only)

Three shared files, each change small (`lessons/kit-bay.md#p2p-sfu`, `lessons/kit-nodes.md#video-room`):
- `bay.mjs` TRANSPORTS: `p2p` (browser to browser, a mesh) and `sfu` (through a media server) added to the
  audio and video rows as later options in `or`, which may now be a list. A port that names neither gets
  exactly what it got before. `internet-many` prefers `sfu` over `p2p`. Each has its own `says` (`notes`).
  `datachannel` stays: the Pi pages carry PCM and frames on a real data channel; only this page misused it.
  A refusal names a port by id when it has no label (it printed `undefined`).
- `nodes.mjs`: `microphone` (audio out), `grid` (video, audio and value in), `controls` (value out, named `self` until 2026-10-22, labelled
  "mic and camera"), all `place: 'site'`; `room/video` added to `camera`'s pages.
- Two tabs read as one machine: the page said `place: 'browser'` on every node, and `place` is the machine.
  It says no place now, so each tab is its own site. `whereOf` was NOT changed, because one tab can hold
  several sites placed `browser` and there "one machine" is true.
- `/room/video/` links carry no `via`; the bay offers `p2p`.

Checked (MEASURED 2026-10-22): `bay-test` 253 to 261 green (block V, 2 of 8 negative controls),
`nodes-test` 70 to 73 ok (1 negative control), `graph-registry-test` 134/134, `bay-node-test` 47/47,
`link-options-test` 34/34, `midi-graph-test` 60/60, unchanged. Three desk tabs with fake media: all
connected, every camera and microphone link `p2p`, no refusal in the log; the patchbay draws the media
wires tab to tab and only chat and mute through the relay room.
Left as it is: the first link out of a port reads `internet-one` and the second `internet-many`, because
the bay counts receivers when each link is made.

### Step: room codes and the lobby (done, local only)

Asked as rooms that cannot be guessed, then corrected the same day: *"its just rooms with users / participants
etc. short random code if at all"*. So no admin and no key; a signed key built for one was removed.
- `/room/video/` with no `?room=` shows one button, New room: six characters from 31 (no `0 o 1 l i`), about
  890 million codes, from `crypto.getRandomValues`. Copy link copies the page's address. `video-1` is gone.
- The footer before Join is the lobby: Camera and Microphone checkboxes, then Join and Copy link. What is off is
  not asked for; both off asks for nothing. A microphone left off is asked for on the first unmute.
- TURN is asked for as `/ice?room=<code>`. `workers/pub/ice-limit.mjs` (`iceVerdict`, pure): with a room, 60 an
  hour for the room and 40 per address; without, 20 per address as before; 120 overall either way. Wired into
  `workers/pub/worker.mjs`, bundled with esbuild to check the import, NOT deployed: the live `/ice` ignores `room`.
- A short code is not a password: anybody with the link is in the room, and the relay is tokenless.

Checked (MEASURED 2026-10-22): `node workers/pub/ice-limit-test.mjs` 6/6 (4 negative controls: no room stops at
20, one address inventing rooms is held at 40, a bad name counts per address, 120 overall). Playwright, three
desk contexts, fake media, local relay, the TURN route answered by a stand-in that records the URL: New room
made `xrva9n`; a joined camera off and was asked for audio only; b joined with both off and was asked for
nothing, then on unmute for audio only, and a saw b's mic on; all three `connected` to each other; every tab
asked for `/ice?room=<code>`; a fourth tab in another room saw nobody. Phone 375: the lobby footer is two rows,
597 to 694 px, no sideways overflow. Step 1's four context phone run re-run after: unchanged.

### Asked on top, 2026-10-22 (done, local only)

- *"replace copy link with iconbutton and move to right"*: the `link` icon in the footer's right slot, before
  full screen.
- *"rm big YOU from video"*: your own tile shows no initials with the camera off.
- *"you = me + id"*: your tag and your chat lines read `me web-ab1`.
- *"crop videos and fill the left area, rm paddings/gaps"*: `createParticipantGrid` is a CSS grid with no gap and
  no padding; `fit()` picks the rows, the tiles are shared out evenly, longer rows first, and every row spans the
  full width, so the area has no hole (5 is 2, 2 and 1 on the desk column). `fill()` and the 16:9 tile tables in
  §2.2 describe the grid before this and are out of date.
- *"*:chat / grid. they are weird ... no in patchbay"*: `createPatchbay` stops a `*` link at the `cf-relay:<room>`
  box and draws no `*:` box. Every page that draws with `createPatchbay` gets it (`/room/chat/`, `/room/broadcast/`,
  `/room/history/`, `/room/video/`).
- *"rm inital cam and mic checkboxes, off by defualt"*: no checkboxes; Join asks for nothing, the camera and the
  microphone start off and each is asked for when first switched on.

Checked (MEASURED): five Playwright tabs, four desk and one phone, fake media, local relay: all connected; Join
asked for nothing in any tab; a camera switched on asked for video only and a microphone for audio only; tiles
cover 100.00% of the grid with 0 px padding and gap on desk and phone; own tag `me web-…` with an empty face; 0
`*:` boxes in the patchbay of `/room/video/`, `/room/chat/` and `/room/broadcast/`; the link button in the right
slot. `/kit/chat/` 11/11 at 1280 and 375; `bay-test` 261/261; `nodes-test` 73.

### Step: the SFU (done, deployed worker; page on the next site deploy)

Asked 2026-10-22: *"build that too"*. `/room/video/` now sends media through Cloudflare Realtime's SFU by default;
`?mesh=1` keeps the mesh.
- `workers/sfu/worker.mjs` (positron-sfu, https://sfu.positron.studio): holds the app secret; five room scoped
  calls (session, publish, pull, answer, update, close); a session comes with a proof, HMAC(room, session), and a
  pull must show the publisher's proof for the same room. `lessons/workers-sfu.md`.
- `demo/room/sfu.mjs`: two connections per tab, one queue each; publishes a kind when first switched on; video in
  three layers (720p, 360p, 180p, named c, b, a); each pull asks the layer its tile needs and changes it with `tracks/update`;
  `sfu.pub` and `sfu.bye` on the relay room. Same face as `mesh.mjs`.
- `bay.mjs`: `sfu` offered to one receiver too; `patchbay.mjs`: an `sfu` link drawn through `cf-sfu:<room>`.
- The page caps an SFU room at 25 tiles and a mesh at 6.

Checked (MEASURED 2026-10-22, the deployed worker, the page served locally, the local relay, fake media): four
tabs, three desk and one phone, three cameras and two mics on: every tile playing 5.0 s after the last camera
went on, every connection `srflx` through Cloudflare, each tab publishing only what it had switched on; desk
tiles asking the quarter layer got 320x180, the phone asking the half layer got 640x360; a tab leaving was gone
from the others at once. First runs had desk tiles at 640x360 and 1280x720: the SFU's fallback takes the next layer
name in alphabetical order and the layers were named f, h, q, so it jumped to full size; named a, b, c (quarter,
half, full) with `priorityOrdering: none`, two runs gave every desk tile 320x180 and every phone tile 640x360. `?mesh=1` re-run: three tabs connected, chat as
before. `bay-test` 262/262, `nodes-test` 73.
Not done: pulling only the visible tiles; a rate limit on the worker; TURN for the SFU when UDP is blocked (the
page asks `pub /ice`, which is the same Cloudflare TURN key; untested through the SFU).

## 9. Steps, in order

Sizes are effort, not time. Each says when it is done.

1. **Done: the tile, the grid, the mesh page.** `participant.mjs`, `mesh.mjs`, `/room/video/`, a block on
   /kit/chat/. Done when: 3 tabs connected with fake media (MEASURED), and the owner has looked at it.
2. **Done: names.** `microphone`, `grid`, `controls` in `nodes.mjs`; `p2p` and `sfu` in `bay.mjs`'s table (§8a).
   `share`, `stage`, `hand` come with step 7.
3. **Done: room codes and the lobby** (§8a). A six character random code, Camera and Microphone off before Join,
   TURN counted per room (not deployed).
4. **The SFU worker (medium).** App secret, `sessions/new`, `tracks/new`, TURN per room. Built from `proto/m2m/`
   and the deleted `elektron-rtc` in git history. Done when: two tabs exchange a camera through it.
5. **The SFU client and `/room/video/` on it (medium).** One peer connection, simulcast, pull only visible tiles.
   Done when: 6 headless tabs show 6 tiles, and a phone-sized tab pulls 4.
6. **Speaker view, pages and order (small).** Done when: a 12-tab run shows the speaker on the stage and pages of
   4 on the phone size.
7. **Screen sharing (medium).** `share`, `stage`, `hand`; the stage and strip layout; one presenter at a time.
   Done when: one tab shares, every other tab shows stage and strip, and the presenter stops it.
8. **Watching together (medium).** Live feed on the stage; a file played in sync from R2 with watch mode. Done
   when: 10 tabs stay within 100 ms of each other after a seek.
9. **A dress rehearsal (small).** 15 people on real networks, TURN on 443 forced once. Done when: the numbers in
   §3.3 are replaced by measured ones.

## 10. Open questions

1. Where are people: one place on one Wi-Fi, each at home, or some of each? It changes the network sums (§7).
2. How many at most: 4, 15, 25, more? And how many sessions a month? That decides mesh or SFU, and whether the
   free tier covers it.
3. What devices: laptops, phones, both? Phones can watch a share and cannot present (§8).
4. Are the networks restricted: outbound UDP blocked, TLS inspection, a site allowlist (§7)?
5. Watching together: is the material a live source or a file? May it be shown to the people in the room over the
   internet?
6. Should the camera be off by default at Join? (Today both start on and either can be switched off first.)
7. Small breakout rooms of 3 or 4 (the mesh is good for that)?
8. Is any recording ever wanted? This plan assumes never.

## Sources (read 2026-10-22)

- Cloudflare Realtime SFU pricing: https://developers.cloudflare.com/realtime/sfu/pricing/ (updated 2026-09-22)
- Cloudflare Realtime SFU limits: https://developers.cloudflare.com/realtime/sfu/limits/
- Cloudflare TURN: https://developers.cloudflare.com/realtime/turn/
- Cloudflare RealtimeKit pricing: https://developers.cloudflare.com/realtime/realtimekit/pricing/
- Cloudflare Realtime changelog: https://developers.cloudflare.com/changelog/product/realtime/
- LiveKit pricing: https://livekit.com/pricing
- LiveKit self-hosting: https://docs.livekit.io/transport/self-hosting/deployment/
- SFU comparison: https://www.forasoft.com/learn/video-streaming/articles-streaming/sfu-comparison-mediasoup-janus-livekit-jitsi-pion
- Mesh, SFU and MCU: https://www.forasoft.com/learn/video-streaming/articles-streaming/sfu-mcu-mesh-topologies
- This repository: `plans/plan-m2m.md` (§1, §4), `proto/m2m/README.md`, `workers/relay/src/index.js`,
  `workers/pub/worker.mjs`, `demo/shell/bay.mjs`, `demo/room/broadcast/index.html`.
