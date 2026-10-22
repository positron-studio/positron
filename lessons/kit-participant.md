# Kit lessons: participant

The reasons behind `demo/shell/participant.mjs`, `demo/room/mesh.mjs` and the video rooms (`/room/present/`,
`/room/stage/`, `/room/mesh/`; `/room/video/` until it was split on 2026-10-22, see [#split](#split)). Each code site keeps a
one-line pointer, `// why: lessons/kit-participant.md#<anchor>`. The plan is `plans/plan-video-room.md`.

<a id="header"></a>

## `participant.mjs` module header

Asked 2026-10-22 by the owner: take the chat page with the admin column on the left
(`/room/broadcast/`), remove the admin part, and put a grid of the participants' cameras in its place, Zoom-like.
*"Make a kit component for one participant's video: a participant video panel. Start with that."*

Two pieces, one file, because the grid only ever holds tiles and a tile only ever sits in a grid:

    createParticipant(o)       one person: picture, name tag, muted mic, camera-off face, speaking ring
    createParticipantGrid(o)   one to N tiles of one size, sized from the grid's own box
    fit(W, H, n, ar, gap)      the arithmetic, pure, so it is tested without a browser

<a id="tile"></a>

## `createParticipant`: why it is not `createVideoPanel`

`createVideoPanel` always builds a footer row under the picture, with a full screen button in it. In a grid of
sixteen tiles a footer per tile is sixteen rows of furniture and eats a fifth of every picture. A participant tile
needs its name ON the picture, the way every meeting app does it, so the tile is its own small box: the picture
(`object-fit: cover`), a tag bottom left, a state word top right. The full screen button stays on the window
around the grid, which is a `createVideoPanel` through `createChatWindow`.

- Your own tile is mirrored and its `<video>` is muted: hearing yourself is the echo.
- Speaking is an inset `box-shadow`, never a border, so a tile does not change size while somebody talks.
- Camera off hides the picture and shows initials, except on your own tile, which stays empty: asked 2026-10-22,
  *"rm big YOU from video"*. The page also STOPS the camera track, so the light on the
  laptop goes out: somebody who turns the camera off should see that it is off.

<a id="fit"></a>

## `fit`: the biggest tile that fits

Try every column count from 1 to n, size the tile to the width, shrink it to the height if the rows do not fit,
keep the count with the largest tile. Measured with `node -e` on 2026-10-22 at an 800 x 450 box and 16:9 tiles:

| people | columns x rows | tile |
| --- | --- | --- |
| 1 | 1 x 1 | 800 x 450 |
| 2 | 2 x 1 | 398 x 223 |
| 4 | 2 x 2 | 396 x 223 |
| 9 | 3 x 3 | 261 x 147 |
| 16 | 4 x 4 | 194 x 109 |
| 25 | 5 x 5 | 154 x 86 |

On a 343 x 500 phone box with 3:4 tiles: 4 people are 2 x 2 at 169 x 226, 9 are 3 x 3 at 111 x 148.

<a id="aspect"></a>

## `tileAspect`: 16:9 in a wide box, 3:4 in a tall one

A phone held upright sends an upright picture, and a cover crop of an upright picture into a 16:9 tile throws
away most of the face. So a tall box gets 3:4 tiles and a wide box 16:9. The box decides, not the device, so a
phone on its side gets the desk layout.

<a id="grid"></a>

## `createParticipantGrid`: the tiles fill the box

Asked 2026-10-22: *"crop videos and fill the left area, rm paddings/gaps"*. A CSS grid with no gap and no
padding. `fit()` still picks the number of rows (the layout with the biggest tile at the box's shape); the tiles
are shared out over the rows as evenly as they go, longer rows first, and every row takes the full width: the
columns are a common multiple of the row lengths and each tile spans its share, so 5 is 3 over 2 and 3 is 2
over 1, with no hole. Every picture is `object-fit: cover`, so it is cropped to its cell. Tiles lose their
corners inside the grid, since they meet edge to edge. ⚠️ So does the `<video>` in a tile: shell.css gives
every bare `<video>` a border and a 4 px radius, and with the tile square the picture still showed a round
corner (*"do not round. fill"*, 2026-10-22, measured: tile radius 0 px, video 4 px). Below `minW` (120 px) a tile stops shrinking and the
grid scrolls down instead, because a face smaller than that is not a face.

Until that ask the tiles were one size, centred, with 4 px between them and a `fill()` stretching them within
a shape family; that left bands of empty panel and was removed.

<a id="mesh"></a>

## `mesh.mjs`: a full mesh over the relay room

- Signalling is JSON on the relay room the page already joined (`node.send`), one `rtc.sig` message per offer,
  answer, candidate or goodbye, addressed by `to`. The relay sends every message to every socket, so each tab
  ignores what is not to it.
- A message is accepted only from the socket that announced the site it names, the same check `bay-node.mjs`
  makes for a `bay.event`. Without it any tab could answer for another.
- The site that sorts first offers. Two tabs never offer to each other at once, so there is no glare to settle.
- The offerer adds an audio and a video transceiver at once, and the answerer turns both to `sendrecv`. So a
  camera switched off and on is `replaceTrack`, never a second offer.
- A peer whose offer arrives before its graph is kept for 10 s, or the reconcile it raced would drop it.
- One ICE restart on `failed`, then it says failed.
- Measured 2026-10-22, three and four headless Chromium contexts, fake camera and microphone, the local
  `demo/fake-relay.mjs`, no TURN: every pair `connected` (host or srflx), every remote tile 640 x 360 and
  playing, a mute and a camera off seen by every other tab within 2.5 s, a Leave removed the tile everywhere.

<a id="page"></a>

## `/room/video/`

`/room/video/` is gone since 2026-10-22: the same module is `/room/present/` and `/room/stage/` ([#split](#split)).
What follows is kept as it was written about it.

`/room/broadcast/` with the broadcast column replaced by the grid. The chat, its `*` links and its compose box are
unchanged. The camera and microphone are one named link per other tab (`<me>:camera:video-out ->
<them>:grid:video-in`), because the bay gives heavy media a session per receiver and refuses a `*` link for it.
So the patchbay shows the mesh honestly: 2 x (N - 1) heavy links per tab.

Your own camera is drawn into your own tile while it is on (`<me>:camera:video-out -> <me>:grid:video-in`, `page`),
asked as *"why cam / mic are not conneeted"* about a patchbay alone in a room: alone, every other link has no far
end. The microphone gets no such link, because it is never played back to you. The picture shows the links this
tab holds, so the cameras coming IN from other tabs are drawn on their tabs, not here. The box that says
whether your mic and camera are on is `controls` (it was `self`).

Since 2026-10-22 the media ports say `transports: ['p2p']` and the links carry no `via`: the bay offers
`p2p` by itself (`lessons/kit-bay.md#p2p-sfu`). The graph says no `place`, so each tab's place is its own
site; with `place: 'browser'` the bay read every tab as one machine and offered `page`. Until then the links
were `via: 'datachannel'`, the only name the bay had, and the wrong one for RTP media.

`MESH_MAX` is 6: past it the page links only the first five others and says so in the log.

<a id="speaker"></a>

## Who is speaking

An `AnalyserNode` per stream, RMS every 150 ms, the loudest over 0.02 wins and keeps the ring for 1.2 s after it
goes quiet, so the ring does not flicker between words. Muted people are skipped. Chrome's fake microphone beeps
once a second, which is enough to see the ring move in a test.

<a id="phone"></a>

## `/room/video/` on a phone

Asked 2026-10-22: the chat behind a tab, the grid filling the screen, the footer reachable.

- Below 560 px (the width `chat-ui.mjs` stacks its columns at) a `createTabs` row, Video and Chat, sits over
  the window, and the window shows one column at a time. A line that arrives while Video is open turns the
  tab into `Chat 1`. The column's own `CHAT` heading is hidden there, because the tab above already says it.
- Once joined, the window is one screen tall: `100dvh` minus both safe area insets, with a `100vh` line
  before it for a browser without `dvh`. Join scrolls it to the top of the screen.
- Before Join it is NOT screen tall, or the Join button sits below the fold (measured: the first build put
  it at 1,250 px on an 812 px screen). It is 4:5 until then.
- Joined at any width, the picture never runs past the screen (`max-height`, the footer's 56 px taken off),
  so a phone on its side (812 x 375, the desk layout) keeps the footer in reach. ⚠️ With only
  `aspect-ratio` and `max-height`, the cap is carried over to the WIDTH and the window narrowed to
  567 of 688 px, measured. `width: 100%` keeps the width definite.
- Join scrolls the room into view when it is not wholly on screen, top or bottom. A first version tested
  only the bottom and left the room 227 px above the screen after a landscape Join, because reaching the
  Join button had already scrolled the page.

<a id="room"></a>

## `/room/video/`: a room is a short code

Asked 2026-10-22: rooms that cannot be guessed, then *"its just rooms with users / participants etc. short
random code if at all"*. So there is no admin and no key: everybody in a room is a participant.

- With no `?room=` the only button is New room. It picks six characters from 31 (no `0`, `o`, `1`, `l` or
  `i`, which read alike), about 890 million codes, with `crypto.getRandomValues`, and goes to that room.
  Copy link puts the page's address on the clipboard. The old default room `video-1` is gone.
- Join asks for nothing. The camera and the microphone start off (asked 2026-10-22, *"rm inital cam and mic
  checkboxes, off by defualt"*, which replaced a pair of checkboxes before Join); each is asked for the first
  time it is switched on.
- Copy link is the `link` icon in the footer's right slot, beside full screen (*"replace copy link with
  iconbutton and move to right"*).
- Your own name is `me` and your id, `me web-ab1`, on your tile and your chat lines (*"you = me + id"*); your
  tile shows no initials with the camera off (*"rm big YOU from video"*).
- TURN credentials are asked for with `?room=`, so they are counted per room (`workers/pub/ice-limit.mjs`).
- What a short code does not do: it is not a password. Anybody holding the link is in the room, and the
  relay is tokenless.

<a id="sfu"></a>

## `demo/room/sfu.mjs`: the room through Cloudflare's SFU

Asked 2026-10-22, *"build that too"*, after the answer that a mesh holds 4 to 6. `/room/video/` uses the SFU by
default; `?mesh=1` keeps the browser to browser mesh.

- Two peer connections per tab, as Cloudflare's own video room example: one sends, one receives. Each has one
  queue, because the SFU refuses a call on a session while the last offer and answer are unfinished (its docs:
  *"Serialize mutations that target the same SFU session"*).
- A kind is published the first time it is switched on (Join asks for nothing); after that a camera off is
  `replaceTrack(null)` and a mute is `enabled = false`, so nothing is renegotiated.
- Video goes out in three layers, `c`, `b` and `a`, at 1, 1/2 and 1/4 of a 720p capture (900, 300 and 100
  kbit/s caps). The mesh keeps 360p. Each pull asks for the layer its tile needs (`ridFor`: tile width times
  device pixel ratio, 640 and up `c`, 320 and up `b`, else `a`), re-asked every 2 s through `tracks/update`
  when it changes. MEASURED with a 640x360 fake camera first: a desk asking `q` got 640x360, because at that size
  the quarter layer was not flowing and the SFU's fallback went elsewhere. With 720p capture the desk got
  320x180 and a phone asking `h` got 640x360, but on the deploy one tab got 1280x720 for 228 px tiles: with
  `ridNotAvailable: asciibetical` the SFU takes the next name in alphabetical order when the asked layer is not
  flowing yet, and `f` came first. The layers are named smallest first now (`a` quarter, `b` half, `c` full), and
  `priorityOrdering: none` keeps the asked layer under bandwidth pressure.
- Who publishes what is a `sfu.pub` message on the relay room, `{ site, sessionId, proof, tracks }`, said after
  each publish and whenever somebody new is in the room; it is accepted only from the socket that announced the
  site, as `rtc.sig` is. `sfu.bye` on Leave takes the tile down at once rather than when the graph goes stale
  (15 s), which a first run showed.
- A track published a moment ago may not carry media yet (`empty_track_error`); the pull is asked again 3 s later.
- A tile that arrives while the receiving connection is already up gets `connected` itself; without it the tiles
  played under a `connecting` label.
- Not done: pulling only the tiles on screen (every tile in this grid is on screen until it scrolls), and the
  fallback above, which can leave a tile on a bigger layer than asked.

<a id="stage"></a>

## `createStage` and the grid's stage mode: somebody presents

Asked 2026-10-22 (plan §4.3): while somebody presents, the camera column becomes the stage plus a strip.

- `grid.stage(stageEl, order)` moves every tile into one row under the stage (`.pos-ptg-strip`, scrolls
  sideways), `order` first; `grid.stage(null)` puts the same tiles back in the grid. Tiles move between parents;
  each is told to play again after a move, though Chrome kept them playing in every run.
- The stage takes the share's own shape: `aspect-ratio` from the picture's `videoWidth / videoHeight`, capped by
  the height left over the strip. A wide share fills the width; a tall one is centred.
- The strip takes what the stage leaves, between 72 px and two fifths of the box, so a desk column has no bare
  band under it. MEASURED at 1280 x 860, a 457 x 386 column: stage 457 x 257, strip 128 px, tiles 4:3 (171 px), so
  2.7 tiles show and the cut third says the row scrolls. A first version had a fixed 112 or 88 px strip and left
  41 px of bare panel on the desk.
- A tall box (a phone held upright) gets 3:4 strip tiles; MEASURED at 375 x 812: stage 341 x 192, strip 285 px.
  A tall box below a wide share stays partly empty, because the share cannot be taller than its shape allows.
- The presenter's stage shows "You are presenting" and a preview at most 240 px wide, never the screen full
  size, which would be a hall of mirrors.
- The `narrow` test is the box's shape (taller than wide), not a width: the desk camera column is 457 px, under
  the 560 px a width test used, and was laid out as a phone in the first run.
- `stage.film(url, { title })` plays a file in the stage's own `<video>`, with sound and the player's controls;
  the tag moves to the top so the controls along the foot do not cover it.

<a id="share"></a>

## Presenting: one at a time, nobody admin

- Share is `getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false })`, the track gets
  `contentHint = 'detail'` (text stays sharp, the frame rate gives way), and the browser's own Stop sharing bar
  ends it too (`ended`).
- Who presents is a light `*` link, `<me>:share:value-out -> *:stage:value-in`, `{ presenting, t }` with `t` the
  press time. The presenter repeats it every 10 s and when a new tab joins, as `/room/broadcast/` repeated its
  broadcast, so a late joiner learns it within one round (MEASURED: 3.5 to 5.6 s from Join to the stage playing,
  most of it the SFU pull). A claim nobody repeated for 25 s is dropped.
- Every tab picks the presenter from the same claims with `pickPresenter` (the earliest press, the site breaks a
  tie), so two presses at once settle with nobody deciding: the later one sees it lost and stops its own share.
  MEASURED: two tabs pressed in the same Playwright tick; every one of six tabs named the same presenter, and
  only that tab was still sharing.
- Share is off (disabled, with the reason) for everybody else while somebody presents, and off while a film is
  on. Where `getDisplayMedia` does not exist (iOS Safari, Android Chrome) there is no Share button and no `share`
  node on the tab. MEASURED by deleting it in a phone context: no button, no node, the stage still shown.
- The patchbay draws `<presenter>:share:video-out -> <each>:stage:video-in` on the presenter's tab (one per
  other tab, `sfu` or `p2p`) plus a `page` link into its own stage for the preview; a viewer holds the one link
  from the presenter to its own stage, because everything a tab shows arrives on a link.
- Headless Chromium captures a fake 1280 x 720 screen with only `--use-fake-ui-for-media-stream` (MEASURED
  2026-10-22 with Playwright's chromium 145; `--auto-select-desktop-capture-source` was not needed).

<a id="share-sfu"></a>

## The screen through the SFU: a third kind, one layer

`sfu.mjs` publishes `screen` as its own track, `<site>-screen`, the first time a share starts; a stop is
`replaceTrack(null)` and the next share reuses the transceiver. The screen is announced in `sfu.pub` only while
it is shared, or a late joiner would pull a track with nothing on it and retry forever on `empty_track_error`.
One layer at 2.5 Mbit/s and `degradationPreference: 'maintain-resolution'`, no simulcast: every viewer draws the
screen on its stage at the column's width, and a quarter size copy of a screen is text nobody can read. A phone
pulling the full layer is the price; simulcast would be worth it only if a phone ever needs a smaller copy.
MEASURED: a press to the share playing on every other stage in 1.8 to 2.3 s (three viewers, the deployed worker).

<a id="share-mesh"></a>

## The screen on the mesh: a third transceiver

The offerer adds audio, video and a second video at once, and both sides tell them apart by POSITION
(`ROLES[index]`), because two are video and the kind cannot. So a share is a `replaceTrack`, never a new offer.
The presenter uploads the screen once per other tab (5 copies at the mesh's limit of 6); that is the mesh's
lesson, drawn by the patchbay as N - 1 share links. MEASURED: 0.3 s from the press to every stage, three viewers.

<a id="together"></a>

## `demo/room/together.mjs`: the pure half

`pickPresenter`, `stripOrder`, `filmTarget`, `steer` and `newer`, graded by `node demo/room/together-test.mjs`,
24 checks of which 10 are negative controls. Sabotages MEASURED 2026-10-22: picking by when a claim was heard
instead of when it was pressed takes 3 red; dropping the dead band 1; letting a state run before its `at` 1;
reading an unheard claim as fresh 1; a never stamped state winning over a stamped one 1.

<a id="film"></a>

## Watching a file together

Plan §5: a film is not sent through WebRTC. Every tab plays the same file from our bucket
(`https://positron-station.kristjan-jansen.workers.dev/media/mimproject/party-container-vabaduse-valjak-2010.mp4`,
MIMproject's own, 2:37, 854 x 480, 16.5 MB). Watch, play, pause and seek,
pressed by anybody, go out as one event on a TIMED light link, `<me>:transport:value-out ->
*:player:value-in` with `ahead: 400`: `bay-node.mjs` stamps `at` on the shared clock and every tab's bay
delivers it when its clock reads `at`, this tab's own included. The shared clock is `proto/looper/peer.mjs`
over the relay room `<code>-ntp`, the lowest site the reference, as the archived clock pages do.

- The press is the player's own controls: a `play`, `pause` or `seeked` that the page did not cause is said to
  everybody. The page's own play, pause and seek are counted (`ours`), so they are not said back.
- Between events each tab steers its player to `filmTarget(state, sharedNow)`, every 250 ms.
- Mics: a film's sound would go back out through an open microphone, so the film switches yours off (it starts
  off at Join anyway).
- A late joiner gets the state repeated (`rep`, with the state's own `at`) when the room grows.

<a id="steer"></a>

## Steering a player to the shared film

- Near (20 to 250 ms) it plays 2, 5 or 10 per cent faster or slower, in STEPS. A smooth `1 - drift / 2` was
  re-set every 100 ms and never caught up: MEASURED, tabs sat 30 ms behind at rate 1.015 for 8 s, because every
  change of `playbackRate` costs the player a few ms. With steps the same moment read 6 ms spread.
- Far (over 250 ms) it seeks, aiming AHEAD by what a seek takes (0.12 s inside what is buffered, else the last
  measured cost, 0.4 s at least), then waits paused and plays on the dot. MEASURED: seeking to a spot not yet
  buffered from workers.dev took 0.3 to 0.6 s, so a seek to the target itself landed 170 to 410 ms behind and
  took 5 s of 10 per cent catching up.
- MEASURED 2026-10-22, 5 tabs (4 desk, 1 phone) on `/room/video/`, spread = the largest minus the smallest film
  position across tabs, read together and brought to one shared time: playing 7 to 15 ms; 2 s after a seek to
  an unbuffered 60 s, 69 ms; 5 s after, 19 ms; after a pause 0 ms; after play 46 ms at 0.5 s, 6 ms at 5 s; a late
  joiner 27 to 40 ms. `/room/mesh/` 4 tabs: 12 to 35 ms throughout. All inside the plan's 100 ms, except the
  first second after a seek, while the tabs wait paused for the film to reach the place they aimed at.
- Every tab here is one machine, one clock; across machines the peer clock adds its own error (measured
  elsewhere at about 3 ms, `positron-streaming`). Not measured across machines.

<a id="split"></a>

## Two demos become present and stage

Asked 2026-10-22: *"split video room into autio-video-sceen and audio-viddeo-stream"*, then the names *"present
stage"*, *"Replace /room/video/"*, *"steaem should be webrtc stream. separte btton"* and *"audio-video-stream ->
stage"*. `/room/video/` is removed with no forwarding; `demo/room/video-room.mjs` is still one module, called as
`videoRoom({ via: 'sfu', name: 'Present', present: true })`, `videoRoom({ via: 'sfu', name: 'Stage', stream: true })`
and `videoRoom({ via: 'p2p', name: 'Video mesh' })`. Present has Share, Stage has Stream, the mesh has neither.

The film watched together (Watch, the shared clock `<code>-ntp`, the timed `transport -> *:player:value-in`
links and the steering) is on no page now, so its wiring left `video-room.mjs`. `demo/room/together.mjs` and
`together-test.mjs` stay untouched: its `pickPresenter`, `stripOrder` and `CLAIM_STALE_MS` are what both Share
and Stream use for one leader at a time, and `filmTarget`, `steer` and `newer` are kept for when it comes back.
The `transport` node left `nodes.mjs` with it, and `player-video` lists only `video/recorder`. The sections
[#film](#film) and [#steer](#steer) are its record.

<a id="stream"></a>

## `/room/stage/`: a live stream on everybody's stage

Stream is its own button, beside the camera and the microphone. The streamer's tab plays one of MIMproject's own
films on its own stage from our bucket (`https://positron-station.kristjan-jansen.workers.dev/media/mimproject/
party-container-vabaduse-valjak-2010.mp4`, `crossorigin="anonymous"`, which the station answers with
`access-control-allow-origin: *`), loops it, and sends what the player shows with `captureStream()`: one picture
track and one sound track. Why a film and not a second camera: it carries picture AND sound with nothing plugged
in, so every desk (and a headless test with a fake camera) can stream; the call camera is already the camera.
A device picker for a capture card is not built. iPhone Safari has no `captureStream()` on a `<video>`, so there
is no Stream button there.

Through the SFU the stream is two more kinds in `sfu.mjs`, `stream` (the picture) and `sound`, each published once
whatever the room's size. The picture goes as ONE layer at 2.5 Mbit/s, not simulcast: everybody draws it at the
stage's size, and the stage is the biggest thing on every screen, so a smaller layer would only be a worse copy;
three layers would also triple the streamer's encoding for nobody. The sound goes at 128 kbit/s, music rather than
speech. Both are said in `sfu.pub` only while they carry something, so a late joiner pulls them only then. A
receiver's stage plays the stream with its sound (`createStage().show(s, { sound: true })`); the streamer watches
the player itself, with its controls, so pausing pauses the stream for everybody.

One streamer at a time, by the presenter rule ([#share](#share)): the claim rides `<me>:stream:value-out ->
*:stage:value-in`. Starting a stream switches your microphone off, because the film's sound would come back
through it. The patchbay draws `cf-r2:film:file-out -> <streamer>:stream:file-in` (https),
`<streamer>:stream:video-out` and `:audio-out` -> each other tab's `stage:video-in` and `stage:audio-in`
(transport `sfu`, through the `cf-sfu` box), and `<streamer>:stream:video-out -> <streamer>:stage:video-in` (page).

MEASURED 2026-10-22, one machine, fake camera, `?turn=0`, the SFU worker at positron-sfu.kristjan-jansen.workers.dev,
4 tabs (3 desk, 1 phone 375): press to every other stage playing a picture, 989 ms on all three (polled every
100 ms; includes loading the film from the bucket); the stage's sound RMS on the three receivers 0.30, 0.25 and
0.27 against the speaker floor of 0.02; a fifth tab joining late had the stream on its stage in 3.0 s, RMS 0.28.
Receivers got the picture at 639 x 360 from an 854 x 480 film: the encoder started below full size and had not
climbed back in the 2.5 s watched. Two Stream presses at once: one streamer on every tab.


<a id="strip-phone"></a>

## The strip on a phone fills the space under the stage

Seen 2026-10-22 on /room/stage/ at 375 px: the strip was one sideways row of 3:4 tiles, 285 px tall (two fifths of the
box), two tiles cut at the right and about 236 px of empty panel under them. In a tall box the strip now takes all the
height under the stage: `fit()` picks the columns and rows and the tiles split the space exactly, cropped, as the
plain grid does; a wide box keeps one row that
scrolls sideways under the stage.

<a id="stream-button"></a>

## Start stream is a word button of its own

Asked 2026-10-22 on /room/stage/: *"replace cast button with separste start stream"*. The cast icon sat inside the call's
joined row (microphone, camera, Leave), where a picture had to say "stream a film to everybody". It is its own button
group now, after the call's controls, reading "Start stream" and "Stop stream". Its `min-width` holds the wider word so
the row does not move when it changes (button-group.mjs warns that a label change resizes a button).
