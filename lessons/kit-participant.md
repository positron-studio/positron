# Kit lessons: participant

The reasons behind `demo/shell/participant.mjs`, `demo/room/mesh.mjs` and `/room/video/`. Each code site keeps a
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
- Video goes out in three layers, `f`, `h` and `q`, at 1, 1/2 and 1/4 of a 720p capture (900, 300 and 100
  kbit/s caps). The mesh keeps 360p. Each pull asks for the layer its tile needs (`ridFor`: tile width times
  device pixel ratio, 640 and up `f`, 320 and up `h`, else `q`), re-asked every 2 s through `tracks/update`
  when it changes. MEASURED with a 640x360 fake camera first: a desk asking `q` got 640x360, because at that size
  the quarter layer was not flowing and the SFU's fallback went elsewhere. With 720p capture the desk got
  320x180 and a phone asking `h` got 640x360.
- Who publishes what is a `sfu.pub` message on the relay room, `{ site, sessionId, proof, tracks }`, said after
  each publish and whenever somebody new is in the room; it is accepted only from the socket that announced the
  site, as `rtc.sig` is. `sfu.bye` on Leave takes the tile down at once rather than when the graph goes stale
  (15 s), which a first run showed.
- A track published a moment ago may not carry media yet (`empty_track_error`); the pull is asked again 3 s later.
- A tile that arrives while the receiving connection is already up gets `connected` itself; without it the tiles
  played under a `connecting` label.
- Not done: pulling only the tiles on screen (every tile in this grid is on screen until it scrolls), and the
  fallback above, which can leave a tile on a bigger layer than asked.
