---
name: positron-xr
description: "WebXR on a Quest, immersive sessions, passthrough, the way out of a headset page, and filling a screen on a phone (fullscreen.mjs, used by concept pages). Load before any gl: true or headset page, before a full screen button on any page, before verify-gl.mjs or verify-quest.mjs, and before any claim about what a headset can do."
metadata:
  internal: true
---

# Headsets, immersive sessions and full screen

Every number here was read off a real Quest 3 or a real phone. Nothing in this
file was reasoned about from an API surface.

## Where this applies today, checked 2026-10-14

**Every headset page is an archived demo, still served.** `grep -rl gl: true
demo` outside the harnesses finds `demo/videoradio/` and `/kit/status/`; the
pages that import `xr-quit.mjs` are `weight` and `floor`; `mirror` hangs in a
headset too. All four were archived 2026-10-12/13 and still answer at
`/<slug>/` (`positron-history`). No concept page enters an immersive session.
So the WebXR half of this file is the record of how those pages were built and
the rules a new headset page must meet; it is not retired, because the pages
run and `xr-quit-test.mjs` still guards them.

**The full screen half is live on concept pages.** `demo/shell/fullscreen.mjs`
(element fullscreen or a faux `position: fixed` cover on an iPhone, which has
no element fullscreen) is used by https://positron.studio/history/newsreels/,
and https://positron.studio/video/camera/ and
https://positron.studio/drums/camera/ carry a full screen button (both pages say
so in their comments). The rule below that the exit is mounted inside the
element that went full, and fades without eating pointer events, applies to
every one of them.

**In patchbay terms**, a headset or a phone held up as a screen is a site whose
`screen` node takes `video` (and `program`, a shader that arrives whole) on its
in-ports, and whose controllers and tilt are `value-out` ports
(`demo/shell/hero.mjs`'s phone patch draws tilt as the Circuit's filter and the
shader's angle). None of the archived XR pages was rebuilt on a bay; when one
is, the measurements below (90 fps held with audio, the `AudioContext`
surviving, the dimmer as alpha) are what its links can count on.

Pages named below that are gone: `scene` (no `demo/scene/`), `/blocks/`
(archived 2026-09-24, a 404), `/earshot/` (`archive/demos/earshot-index.html`).

- **WebXR, MEASURED on a Quest 3 (Browser 150.1 / Chromium 150, Adreno 740),
  2026-09-12.** The framebuffer is **3360x1760, two views, 1680x1760 per eye**,
  and `scene` holds **89.8 fps** in it — full rate. The 2D window really is
  **1280x670 CSS at dpr 1**. `session.frameRate` is **not reported**. The user
  agent says **"Quest 3" on a 3S**, which is the empirical form of the claim
  that the two cannot be told apart. **Passthrough works and is real**:
  `immersive-ar` reports `environmentBlendMode: alpha-blend` and holds
  **90.0 fps** — the same as VR's 89.8, so compositing over the room costs
  nothing measurable here.
- 🔴 **AUDIO SURVIVES AN IMMERSIVE SESSION ON A QUEST, AND COSTS NOTHING.
  MEASURED 2026-09-16 by `/earshot/`, 68 s, 3322 frames, and every number here
  is off the device log rather than reasoned about.** The four questions
  `plans/plan-videoradio-xr.md` §11 refused to answer without a headset are answered:
  - **The `AudioContext` survives.** `running` before `requestSession`, through
    the whole session, and after it ends. It is never suspended by entering.
  - **The latencies do not move.** Window **48000 Hz, base 4.00 ms, out
    24.00 ms**; in session **48000 Hz, base 4.00 ms, out 24.00 ms**, identical
    to the digit. ⚠️ AND THE HEADSET IS NOT THE LAPTOP: the same page on an M2
    Mac reads base 5.33 / out 16.00, so the Quest has the lower processing
    latency and the higher output latency, about 28 ms of total against 21.
  - **`AudioDecoder` configures and decodes in there.** `mpeg` -> mp3, 470
    frames in, 120 out, 44100 Hz, 2 ch, **0 errors**, in 140 ms against 998 ms
    for the same work in the window (the window's number includes a cold fetch;
    the range read was 155 ms there and 4 ms in session).
  - **A main-thread `ScriptProcessorNode` keeps up at 90 Hz.** 11.87 to 12.01
    callbacks a second against 11.72 nominal, for the whole session, never once
    starved. The window on the same device read 11.65.
  - **And 90.0 fps held throughout** with the audio graph, the decoder and a
    panel upload all running. Worst frame gap 70.6 ms, once.
  ⚠️ **The level meter was proved to be a meter INSIDE the session**, not just
  in the window: shutting the gate took the far side `0.0354 -> 0.0000 ->
  0.0355` while the near side held at 0.7050. Without that, a zero in there
  would have been indistinguishable from a page that had stopped measuring.
  ⚠️ **A doff is reported about ten seconds late.** `visibilitychange` fired
  9.5 s after the session ended, which is the lag the page warns about in its
  own log and is now measured rather than assumed.
  🔴 So an immersive page on this device may decode, granulate and play exactly
  as the window does. **Nothing about audio is a reason not to build `/videoradio/`
  into a headset.**
- 🔴 **A PAGE CAN DIM THE REAL ROOM AND CANNOT TINT IT, AND THE PROOF IS
  ARITHMETIC RATHER THAN AN API.** Worked out 2026-09-19 against the Held in
  Human score, whose two channels are exactly these.
  In an `alpha-blend` session the visitor sees `c*a + room*(1-a)`. **The room
  only ever appears multiplied by `(1-a)`, ONE SCALAR SHARED BY ALL THREE
  COLOUR CHANNELS.** So dimming is free and per channel gain is unreachable,
  and a colour lookup table on the camera image is the smallest thing that
  needs per channel gain.
  ✅ **THE DIMMER IS ALREADY IN THIS REPO AND NOBODY NOTICED.**
  `xr-room.mjs:1739` and `xr-panel.mjs:1410` both do `if (ar) gl.clearColor(0,
  0, 0, 0)`. **That zero IS the opacity control**, and both ends of it are
  already measured on a Quest here: `a = 0` is how four pages work, and `a = 1`
  is the black room bug the rule below records.
  ⚠️ **A COLOURED QUAD IS NOT A TINT, IT IS A LIFT**, and it spends the
  dimmer's own budget. At 15% room with a green table, a green wash pins the
  green channel above 0.85 everywhere and you get a green card with a ghost in
  it.
  ⚠️ **`XRRenderState` HAS NO KNOB FOR ANY OF THIS.** Read off Chromium 153 on
  a `127.0.0.1` origin: `baseLayer`, `constructor`, `depthFar`, `depthNear`,
  `inlineVerticalFieldOfView`, `layers`, and not one is about the environment.
  The session REPORTS `environmentBlendMode` and does not take one.
  ⚠️ **AND `navigator.xr` IS SECURE CONTEXT GATED**, so a probe on
  `about:blank` answers "no WebXR here" for the wrong reason. That cost the
  first attempt at this measurement.
  ⚠️ `getCameraImage` exists in Chromium 153 and Quest Browser 40.1 shipped
  passthrough camera, so the route is real and the price is the whole thing:
  you obscure the compositor's passthrough, redraw the camera image yourself,
  reproject it per eye without the compositor's scan out reprojection, and end
  with a video backdrop rather than a room.
- 🔴 **`alpha: false` on the WebGL context makes passthrough impossible.** The
  compositor puts the real room behind the page and can only do that through
  transparent pixels; with no alpha there is nothing to clear to zero and the
  room is replaced by black instead of composited under. And **assert on
  `environmentBlendMode`, never on the session name** — a session can be called
  `immersive-ar` and still composite `opaque`, which presents as a drawing bug
  rather than a session one.
- 🔴 **`session.renderState.baseLayer` is NULL until the next animation frame.**
  `updateRenderState()` queues; it does not apply. Reading
  `baseLayer.framebufferWidth` one line after creating a session throws a
  TypeError — which cost three headset runs, because the throw escaped the
  handler and so the render loop, the exit-on-any-button and the bail-out timer
  were ALL never registered. Session live, nothing drawing, no way out, no log
  line. Read the layer inside `requestAnimationFrame`, where it exists.
- **Instrument the entry path BEFORE guessing at it.** Those three runs were
  indistinguishable from outside; what separated them was a line shipped before
  and after every await, with a deadline turning a hang into a named failure.
  ⚠️ And the lines that say where something hung **cannot be on a batched
  shipper** — `createShipper` holds for 2 s, and entering an immersive session
  is exactly when timers stop being generous. `navigator.sendBeacon` survives
  it. The uncaught-error handler has to use it too, or the net meant to catch a
  silent failure is itself waiting on the timer that stopped.
- 🔴 **AND SO DOES ANYTHING THAT FILLS A SCREEN, WHICH IS THE SAME RULE WITH NO
  HEADSET IN IT.** Reported 2026-09-19 from an iPhone: *"I can not leave
  fullscreen on mobile"*. `/weight/` and `/floor/` each drew a badge reading
  `Esc to leave`, on a device with no Escape key, and then faded it out after a
  few seconds; the faux cover is `position: fixed; inset: 0; z-index: 60`, so it
  is over the control row holding the button that got you in. A phone was
  therefore in a page it could not leave. "Press Escape" on a phone is "press
  the Meta button" in a different accent, and both are answers a page does not
  get to give about its own bug.
  ⚠️ **THE EXIT IS A COMPONENT AND IT IS MOUNTED INSIDE THE ELEMENT THAT WENT
  FULL.** In real element fullscreen nothing outside that subtree is on screen,
  so a button anywhere else is invisible on exactly the path where it is the
  fallback. It fades on inactivity and comes back on any pointer, touch or key,
  and while it is faded it is `pointer-events: none`, or the corner of the
  picture silently exits for somebody reaching for the picture.
- 🔴 **ANYTHING IMMERSIVE NEEDS A WAY OUT THAT THE PAGE OWNS, AND THERE IS ONE
  OF THEM: `demo/shell/xr-quit.mjs`.** Hold ANY controller button for 3 s and a
  white arc fills at your hand; let go and it cancels to zero. Plus a dead-man's
  switch that ends a session where NOTHING has been drawn after 4 s, which is a
  different failure and not a user-facing exit. "Press the Meta button" is not an
  answer a page gets to give about its own bug.
  🔴 **NO LABELS ON IT, 2026-09-19:** *"hold any controller button down long
  enough it shows circular coundown (no labels) and quites"*. Nothing is drawn
  until something is held: the arc IS the badge, and the gesture is the
  documentation. It used to carry the word `Hold to quit`, which is furniture you
  read once and look past for the rest of a session.
  🔴 **AND A PAGE MUST `update()` IT, NOT ONLY `draw()` IT. THIS FAILED IN THE
  WILD:** *"i was not able to get out"*, 2026-09-19. `/blocks/` built the badge,
  compiled its shader and drew it at both hands every frame, and never once
  called `update`, so the hold could not advance and **there was no way out of
  that page at all**. Every other page had the line, so no shared code was wrong
  and nothing could disagree with anything.
  ⚠️ **`node demo/shell/xr-quit-test.mjs` REFUSES THAT SHAPE NOW**, because the
  defect is a line that is NOT there and no browser check can see one: a harness
  cannot enter a session, and in one, `update` not being called is
  indistinguishable from nobody pressing a button.
  ⚠️ **ITS FIRST BUILD WAS WORTHLESS AND ONLY SABOTAGE SAID SO.** It matched
  `/\.update\s*\(/`, and `/blocks/` updates its room, its hands and its
  document, so deleting the quit's own call left it fully green. It matches the
  ARGUMENT now (`inputSources`, which nothing else is handed). That is the
  substring rule below, met while writing a check that quoted it.
- **`gl.clear` ignores the viewport.** Both eyes share one framebuffer, so a
  clear on the second view wipes what the first drew — black. Only the first
  eye clears; the rest clear DEPTH inside a `gl.scissor`, or the second eye
  tests against the first eye's depths. A viewport is not a clip region.
- **`bindAttribLocation` only takes effect at the NEXT link.** Called after
  `linkProgram` it is a no-op that reads like a fix; the Quest reported
  `GL_INVALID_OPERATION` (1282) on its first frame and **drew correctly
  anyway**, because the linker happened to choose the same slots. A page will
  render a right-looking picture with an error pending, so assert on
  `gl.getError()`.

## From the handoffs (extracted 2026-10-19)

- **A focusable control hidden by full screen drops the focus to the body**, so keys heard only on a panel go nowhere. (`HANDOFF.md, session 65 (2026-10-06)`)
- **Decide a full screen layout on the player's width AND the window's, plus `data-full`**: keyed on the player alone, a half width desk card (336 px) went tall like a phone (343). iPhone Safari's full screen is the cover, which also sets `data-full`. (`HANDOFF.md, session 66 (2026-10-06)`)
- **Real browser full screen cannot be triggered by the extension or headless**; only the cover path is tested. (`HANDOFF.md, session 65 (2026-10-06)`)
- **Headless shots run `--disable-gpu`**, so a GL page reads "no WebGL2"; a copy of `demo/shot.mjs` with `--use-angle=metal` renders it. (`HANDOFF.md, session 71 (2026-10-09)`)
- **`adb` is the only way to drive the Quest**, and it is not on this managed laptop. (`HANDOFF.md, session 62 (2026-10-04)`)
