# plan-bars: a bar is a layout, a transport is a controller, a button is a view

Asked 2026-10-23: *"do an analyzis of the bars in general. it seems we force transpoprt bar to be both aciton
controller and ui element. split the two, the "bar" (online header / footer) is just a layout element? are
transport buttons ui or action? popose a modular kit and cleanup on demos"*.

Status: PLAN. Nothing built. Read from the code on 2026-10-23 by two read-only surveys (every line of
demo/shell/transport-bar.mjs, every caller, every other strip); nothing here was measured in a browser.

## 0. Answers, short

- **Yes, a bar is a layout element.** A strip with three slots (start, middle, end), one padding, one height, a
  header or footer edge, gluable to the panel above or below it. It knows nothing about time.
- **Transport buttons are views, and the action is a controller's.** A play button shows `playing` and asks for
  `toggle()`; it does not decide anything. Today the deciding lives inside the button handlers of the bar.
- **This is the patchbay rule one level down**: a control is a port, the thing it changes is a node, the
  link carries the intent. A transport controller is a node with a value-in (play, stop, seek, rate, loop) and a
  value-out (position, state); its buttons are its ports drawn. Section 5 says whether to go that far now.

## 1. What the transport bar is today

`createTransportBar` is one closure of 1051 lines doing four jobs. Line ranges from the survey:

| job | where | what |
| --- | --- | --- |
| layout | 159, 323-339, 1038-1051 | the `.tbar` row, slot order, the `data-end` gap, the `<positron-transport>` element |
| view | 161-212, 284-301, 302-317, 341-381, 409-434, 436-485 (mostly), 773-795 | toggle faces, clock, scrub, live badge, loop button, rate choice, badge notes |
| controller | 154-158, 391-404, 500-568, 570-611, 614-771, 797-867, 869-894, 966-969, 1012-1026 | command funnel, rates, end-stop, play/pause/replay, scrub seeks, the loop state machine, the live window, the reverse lap driver, the keyboard table, the 60 Hz position poll |
| harness | 896-964, 973-1003 | `__demo.transport` (`api`), `publish`, `destroy` |

Where the button IS the action: the toggle's handler `pressToggle` decides play, pause, stop a lap, start a lap and
replay from the end (557-567); the loop button's click is the whole three-press loop machine (824-861); the way
button changes way state and repaints itself (221, 752); rate buttons call `deck.setRate` through `applyRate`
(370); `extras`, `loopExtras`, `loopSlot` and `barButton` bind the page's handlers inside the bar.

Where a controller rule depends on a view existing: `toggle: false` also switches off the end-stop, the space key
and `api.playing` (521, 536, 888, 918). A deck rule gated on whether a button was drawn.

Where control runs in the render loop: loop wrap, loop outrun and close-at-end run inside `paint()` on
requestAnimationFrame (464-478), which stops in a hidden tab; the end-stop was moved to a timer for exactly that
reason (lessons/kit-transport-bar.md#end-one-shot).

## 2. How the site uses it

49 live call sites: 12 on concept pages, 37 on unlisted and kit pages.

- **Real transports (40):** synth/timeline, synth/dots, typist/score, typist/playback, room/history,
  video/recorder, history/newsreels, drums, devices/dots, and the unlisted time, csound, sync, capture, tapes,
  reel, partitur, making, held, draw and kit pages.
- **A bar used as a strip (4), with every transport feature switched off:**
  - /room/obs/ and /room/replay/'s OBS header: a fake deck `range: [0, 1]`, `toggle/time/loop/scrub: false`,
    to get Start OBS left, a status in the middle and the scene picker right.
  - /pack/'s step bar: a fake deck `range: [0, STEPS]` for "step n of N" with ‹ ›.
  - /code/piano/: `toggle: false`, a clock over a strip whose position a page loop pushes with `deck.seek`.
  - /stage/: a whole second bar kept offstage so its play toggle can be borrowed as "Play recording".
- **Mixed (1):** /room/replay/'s take bar: a real play and record, on a deck that is a counter, not the take's
  clock.

The other strips, none of which is a transport and each with its own numbers:

| strip | where | padding | box |
| --- | --- | --- | --- |
| `.tbar` | transport-bar | 8 | card, edge, radius, 52 px |
| `.pos-vp-foot` | video panel footer | 10 / 12, a 3-column grid | inside the panel, a hairline above |
| `.pos-ngrid-foot`, `.kbd-foot` | grid and keyboard footers | 10 / 12 | a hairline above |
| `.pos-chat-compose` | chat | 10 / 12 / 12 | inside the chat column |
| `.pos-rows-r` | instrument panel rows | 16 / 20 | glued rows |
| `.panel-case` | panel layout | 0 / 20 | card, edge, radius |
| `.rv-obs-body` | the OBS header's body | 8 | the one hand copy of `.tbar`'s look |
| `.pos-controls`, `.pos-bgroup` | page control row, button group | gap 8, no box | none |

`.pos-vp-foot` is already a layout-only three-slot bar (video-panel.mjs:216-228). It is the half that exists.

## 3. Inconsistencies the split would fix

1. Four fake decks and one offstage bar, only to get a strip with slots.
2. Record sits on the left on six pages and on the right on `shell/reel.mjs` (with download); drums puts Clear on
   the right. The lesson (kit-transport-bar.md#data-end) says verbs left, state right.
3. Icons, glyphs and words mixed: record is a kit icon set after the fact with `setIcon` because extras take only a
   label; ‹ › and ⛶ are text glyphs (newsreels, reel, pack, videoradio, the video panel's own full screen);
   Start OBS and Start show are word buttons on a bar; the room footer mixes mic/camera/share icons with a Leave word.
4. `extras` accept `onPress` and `onClick`; six pages still pass `onClick` (newsreels, reel, pack, capture, draw,
   stage), the silent dead-button bug's survivors.
5. Two models for start and stop: radio/edgecast and radio/return use a word button group, room/replay and /stage/
   use a transport bar with a `command` facade.
6. Five paddings for one idea (8, 10/12, 16/20, 20).
7. Whether verify presses a button depends on where it sits: `.pos-controls button, .tbar-x` are pressed,
   `.tbar-slot` exists to dodge the press, a footer button or a panel's right slot is never pressed.

## 4. The kit, proposed

Five pieces, each one job, plus the old name kept as a wrapper.

1. **`bar.mjs`, `createBar({ start, middle, end, edge, pad })`. Layout only.** A strip with three slots and the
   `data-end` gap; `edge: 'header' | 'footer' | 'none'` draws the hairline on the side it meets a panel; one
   padding token `--bar-pad` and one height. Gluable (`glue.mjs`). No deck, no handlers, no publishing. The video
   panel footer, the OBS header, the step bar, the grid and keyboard footers become `createBar`.
2. **`transport-control.mjs`, `createTransportControl(deck, { command, endStop, live, liveWindowMs, loopWays })`.
   No DOM.** Owns play, pause, toggle, seek with the end-stop, rates and their lattice, the loop machine and the
   lap driver, `setLoopView`, its own position tick (a timer for the parts that must run in a hidden tab), and
   `subscribe(fn)` for state. The end-stop and `playing` no longer depend on whether a toggle was drawn.
3. **`transport-views.mjs`: `playToggle`, `clock`, `scrub`, `rates`, `loopButton`, `liveBadge`.** Each is
   `(control, options) -> element`: it reads the control's state and calls its methods. Nothing else.
4. **`transport-keys.mjs`, `bindTransportKeys(control, { scope, space })`.** The keyboard table, scoped by the
   element the caller hands it (a tab panel, a bar), instead of every bar listening on `window`.
5. **`button.mjs` (or `barButton` grown up), one button factory**: `{ label | icon, aria, title, primary,
   onPress }`, a kit icon by name, so no page sets an icon after the fact and no page passes `onClick`.

**`createTransportBar` stays**, as `createBar` + `createTransportControl` + the default views + the keys +
publishing, so the 49 callers do not change on day one, and the harness contract holds: `__demo.transport.el`
still contains a `.tbar-toggle`, the getters stay on `api`, `.tbar-x` stays the pressed class.

**Placement rule, one sentence a page can follow**: start holds what you do (play, record, Start OBS, ‹ ›), middle
holds what is so (clock, status, live badge), end holds what you choose (rate, loop, scene, patch).

## 5. A transport as a bay node (optional, later)

The control in section 4 can be announced as a node: `<site>:transport` with `value-in` (`{ of: 'transport',
play | stop | seek | rate | loop }`) and `value-out` (position, playing, rate), its views as a `person` node's
`value-out`, linked. Then a remote page could press play on another tab's deck along a drawn link, the way the
scene switcher reaches OBS today. Not needed for the cleanup; worth it only if a page wants remote transport.

## 6. Cleanup of the demos, in order

1. **Strips that are not transports move to `createBar`**, dropping their fake decks: the OBS header
   (video-room.mjs), /pack/'s step bar, /code/piano/'s clock header (a `clock` view over its deck, no bar
   controller), /stage/'s borrowed toggle.
2. **The video panel footer becomes `createBar({ edge: 'footer' })`**, and gluing a transport under it is gluing
   two bars, so `glue()` and `soloFooter` in video-panel.mjs shrink.
3. **One padding**: every strip takes `--bar-pad`. Which value is a decision (section 8).
4. **Placement**: record to start on `shell/reel.mjs`; drums' Clear to start; nothing else moves.
5. **Buttons**: the six `onClick` callers to `onPress`, then `onClick` refused; ‹ › and ⛶ to kit icons.
6. **Start and stop with no position** (OBS, edgecast, return, show) use the button factory on a `createBar`, never
   a transport bar with a `command` facade, as plans/plan-device-layouts.md already decided for devices.
7. **Archived and unlisted pages** only when touched, by the per-page rule the middot sweep used.

## 7. Cost and risk

- Pieces 1, 3 and 5 are small and new. Piece 2 is moving about 600 lines out of transport-bar.mjs, which is the
  risky part: the harness presses the toggle inside `__demo.transport.el` (verify.mjs:453-466,
  bar-drill.mjs:109-160), dispatches keys at the bar or the body, and bar-drill-test.mjs mirrors verify's numbers.
- Check per step with the assert counts of the pages that use a moved feature, never a full suite: the loop
  machine is used by /tapes/, /draw/ and the time pages; rates by the media pages; live by /videoradio/.
- Unverified on the way: the badge's "degraded" notes may never fire on a plain deck (`setRate` returns undefined
  and `seek` a number, timeline/transport.mjs:1989-1997). To be checked before that path is moved.
- `positron-ui`'s list of `toggle: false` users is stale (it misses the video room), and
  lessons/kit-participant.md#start-m1 does not record why the OBS header is a transport bar. Both go with step 1.

## 8. What the owner decides

1. The split as in section 4, with `createTransportBar` kept as a wrapper? Or a harder cut that changes callers.
2. The transport as a bay node (section 5): now, later, or never.
3. One strip padding: 8 (the bar's) or 10/12 (the footers'), or keep a footer and a bar size.
4. Cleanup scope: concept pages and the room only, or the unlisted demo pages too.
5. Still open from 2026-10-23: *"delete iconbutton on the right"*. Which one: the stage's mute button, the room
   footer's link icon, or another? Nothing was deleted.
