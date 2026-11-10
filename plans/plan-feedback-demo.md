# plan-feedback-demo: one table, one patch, built up one link at a time

Status (2026-11-10): a plan. Nothing built for it, nothing run on the Pi or any device, no
browser opened. Written from the tree at `9f945dc4` for TechTrack Lab II, Wed 11 Nov 2026
15:30 (about 5 minutes of talk in a 10 minute slot, then a 20 minute 1:1).

Asked 2026-11-10 (BACKLOG.md line 3): *"create a plan for the actual node patchbay and
feedback based demo, giving the keyboard controller, Raspberry Pi, Raspberry camera, maybe
the LCD screen, etc. ... Visual and sonic feedback stuff. ... come up with one setup, one
sketch demo. Maybe I can gradually open it, build it on the demo, expose."*

Labels: **MEASURED** (run, by this repo, with the date; one run today, in node, no
browser), **READ** (a file in this repo, path given), **INFERRED** (reasoning, checked by
nobody).

Read for it: `plan-techtrack-lab-2.md` (sections 10 and 11), the essay
`demo/lonely-software/index.html`, `plan-screens-odd.md` (plan-camera-feedback),
`plan-camera`, `plan-pi-hdmi`, `plan-pi-oled`, `plan-pi-tft`, `plan-frames`, `plan-bends`,
`plan-crossmodal`, `plan-ambient-piece`, `plan-pi-patches`, `plan-portable-board`,
`plan-loop-ui`, `plan-looper`, `plan-remote-looper`, `plan-stage-patchbay`
(`plan-board-modulation` is archived), HANDOFF.md sessions 80 to 92, and the code named
below.

## 1. Verdict

**The one setup:** the laptop on the projector showing the patch, the Pi on the table with
its USB camera and a small HDMI monitor, the MK-425C on the laptop. **The one sketch:** two
loops and a hand. The Pi's camera filmed onto the Pi's own monitor and then turned to face
it (picture feedback, the return path is light through the air). The laptop's drone with
its microphone open, so the speakers come back through the room into two echoes of 4.3 s
and 6.7 s (sound feedback, the return path is the room). Then the keyboard, played by the
owner and then handed to a mentor, which is the other end.

**Tomorrow it runs on two pages that are already deployed and need no new code:**
https://positron.studio/devices/hdmi/ (camera to the Pi's monitor, measured 24 to 29.5
fps) and https://positron.studio/ambient/drone/ (mic into echoes and a limiter). One
small, optional, safe thing can be built tonight: a picture-only page that draws the patch
growing step by step (section 4.3). The real single page, where each step is a real link
in one bay, comes later and needs one change to the bay first, because **the bay refuses
every loop that has no store in it, including a node's output into its own input**
(MEASURED today, section 5.1).

## 2. The physical setup at the venue

Music Estonia office, Telliskivi 60a, A1, 2nd floor (from `plan-techtrack-lab-2.md`).

### 2.1 On the table

| thing | plugged into | what it does |
| --- | --- | --- |
| laptop (Chrome, not Safari: the drone needs WebMIDI) | projector by HDMI; the MK-425C by USB | shows the patch; runs the drone; its speakers and its mic are the sound loop |
| Raspberry Pi 4 (`pi-1`) | USB-C power; Ethernet to the travel router | the board: camera to screen |
| Logitech C925e USB camera | a Pi USB port, **plugged in before the Pi boots** | the camera. It is the "Pi camera" on this board: no CSI camera is in any file (READ, `rig/board/camera.mjs` asks CSI first and the measured one is the C925e, `rig/hdmi/README.md`) |
| a small HDMI monitor | Pi HDMI0 (the micro-HDMI next to USB-C power; only `card1-HDMI-A-1` is read, `rig/board/hdmi.mjs:13`) and its own power | the Pi's screen, the thing the camera films |
| the OLED (128x64, 1 bit) on the Pi's header | already wired (`rig/board/panel.mjs`) | optional step 3: the camera dithered to 1 bit, mirrored to HDMI at 15x |
| Evolution MK-425C | the laptop's USB | the human hand: keys latch the drone's root, knobs C1 to C8 move it |
| travel router | uplink: venue Wi-Fi or a phone hotspot | one network for the Pi (cable) and the laptop (Wi-Fi) |

Cables to pack: micro-HDMI to HDMI (Oomipood had one at 9.50 EUR, `plan-pi-hdmi.md` 1), a
short Ethernet cable, USB-C 3 A supply for the Pi, the monitor's supply, USB-A to USB-B for
the keyboard (and a USB-C adapter if the laptop needs one), HDMI (or USB-C to HDMI) for the
projector, a power strip.

### 2.2 Network

- **The page reaches the Pi only through the Cloudflare relay, room `studio-1`.** The board
  dials out (`rig/board/board.mjs:71`, `--relay` defaults to `RELAY_BASE`); the service
  passes only `--room` (`rig/board/positron-board.service:17`). So both machines need the
  internet at the start of each step that sends something (READ).
- **Once `hdmi.show camera` has run, the loop runs on the Pi alone.** `hdmi-scan` is given a
  year of duration and ends only on a stop (`rig/board/hdmi.mjs:25`). A dropped network
  after that costs nothing visible (INFERRED from the code, not tried).
- **Ethernet for the Pi, not Wi-Fi.** Whether the Pi has any Wi-Fi network configured is in
  no file. A cable to the travel router needs no setup on a stock Raspberry Pi OS (INFERRED).
  A venue Wi-Fi with a sign-in page would strand a headless Pi; the travel router in front
  of it (or a phone hotspot as its uplink) avoids that.
- **No offline path exists today.** `demo/fake-relay.mjs` listens on `127.0.0.1` only (line
  192), and the board takes `--relay` as a flag the service does not pass. A laptop relay on
  the LAN is about 2 to 3 hours of work and a test at home (section 4.4, L10). Not for
  tomorrow.
- **The VPN off.** Check Point routes the LAN into its tunnel, so ssh to the Pi fails with it
  up (HANDOFF session 58). The relay itself is HTTPS and works either way. Check with
  `route -n get 8.8.8.8 | grep interface` before the slot.
- **The drone is fully offline-able**: its SuperCollider is vendored
  (`demo/shell/scsynth.mjs:6`, `/shell/vendor/`), so `node demo/server.mjs` on the laptop
  serves it at http://127.0.0.1:8890/ambient/drone/ with no internet (READ).

### 2.3 What the audience sees and hears

- The projector: the laptop's page, so the patchbay, the knobs and the readouts.
- The table: the small monitor with the camera's picture, which becomes a tunnel when the
  camera faces it. ⚠️ A small monitor is small for a room. If the venue has a TV or a second
  projector input, the Pi's HDMI on the big screen is the stronger picture (open question 2).
- Sound: the laptop's own speakers. Not the venue PA (section 6.2).

## 3. The patch and the build-up

The node and port names are the bay's own. The `pi-1` ones are what `boardGraph()`
announces (`demo/shell/graph-registry.mjs` 243 to 260) and what `/devices/hdmi/` draws. The
`web` ones are `/ambient/drone/`'s (`demo/ambient/drone/index.html` 99 to 120).

```
pi-1:camera:video-out -> pi-1:hdmi0:video-in            (via fbdev, on the Pi)
pi-1:hdmi0  ~~ light ~~>  pi-1:camera                   (the air; not a bay link, see 5.1)
web:radio:audio-out -> web:noise:audio-in               (the laptop mic)
web:drone:audio-out -> web:space:audio-in
web:noise:audio-out -> web:space:audio-in               (two echoes, 4.3 s and 6.7 s, limiter)
web:space:audio-out -> web:speaker:audio-in
web:speaker  ~~ room ~~>  web:radio                     (the room; not a bay link)
web:keys:midi-out -> web:drone:midi-in                  (the MK-425C on the laptop)
web:cc:midi-in, web:knob-<name>:value-out -> web:<engine>:value-in
```

Each step adds one node or one link. Times assume about 5 minutes in all.

| step | adds | the audience sees | hears | the essay line |
| --- | --- | --- | --- | --- |
| 0 | `pi-1:camera` alone: a `video-out`, nothing linked | the Pi, a dark monitor; on the projector one node | nothing | *"Imagine a node in a network. It has inputs and outputs, countless possibilities, but no connections."* |
| 1 | the link `pi-1:camera:video-out -> pi-1:hdmi0:video-in` (Play on `/devices/hdmi/`) | the monitor lights up with the room, the mentors in it; the projector draws the link; fps and cpu in the readout | nothing | *"It can send signals, but there's nobody on the other end."* |
| 2 | the return: the owner turns the camera to face its own monitor | the picture inside the picture inside the picture; moving the camera closer zooms, turning it rotates the tunnel (`plan-screens-odd.md`, plan-camera-feedback 2) | nothing | *"Connect its output back to its own input."* then *"Point a camera at its own monitor. The image appears inside the image, inside the image."* |
| 3 (optional) | the node `pi-1:oled` into the loop: `camera -> oled:video-in`, `oled:video-out -> hdmi0` (pick `oled` on the page) | the tunnel in square 1-bit pixels at 15x; the grain grows as dither is filmed and dithered again | nothing | *"A feedback loop doesn't necessarily repeat itself. It can produce something that wasn't there before."* |
| 4 | `web:drone` sounding: Start on `/ambient/drone/` | the drone's patch on the projector (switch tabs) | a low drone, root, fifth, octave | *"Feed a sound back into its own input..."* |
| 5 | the return: Radio on, so `web:radio:audio-out -> web:noise:audio-in` carries the room | the `radio` dB readout moving with the room's own noise and voices | the room, and the drone, coming back 4.3 s and 6.7 s later, decaying, never quite in step | *"...and you get resonance, distortion, oscillation. Add delay and the sound returns with a memory of itself."* |
| 6 | the hand: `web:keys:midi-out -> web:drone:midi-in` and the knobs, the MK-425C | the on-screen keys and knobs follow the real ones | a key moves the drone's root; C5 echo, C6 length (the tape bends as it glides), C7 decay | *"His ears, hands on the keyboard and ears created that world."* |
| 7 | the other end: the keyboard handed to a mentor; and the Pi is node2 to the laptop's node (the page's `hdmi.show` goes out over `studio-1`, `hdmi.state` with the fps comes back) | somebody else's hand on the patch | what they play, coming back through the room | *"But who is listening?"* and *"A link needs two ends"* (plan-techtrack-lab-2 section 11) |

Notes on the steps:

- Steps 0 to 3 are one page, `/devices/hdmi/`. It draws the three `pi-1` nodes and the
  chain the board says is showing (READ, `demo/devices/hdmi/index.html` 35 to 55). Step 0
  is the page before Play.
- Steps 4 to 6 are the other page, `/ambient/drone/`, whose links are all drawn at load
  (it `hold`s them, line 114 onwards). So on the projector the drone's patch appears whole,
  not one link at a time. Only the picture-only page (4.3) shows it growing.
- Step 2 and step 5 are the essay's loopback twice: one in light, one in air. Neither
  return path is a link in any bay, because the bay would refuse it (5.1). The honest line
  for the room: *"the patchbay refuses this link, so I made it with my hands"*. It is also
  true.
- Picture to sound (the camera's brightness moving the drone's tone, `plan-crossmodal.md`)
  would join the two loops into one. It does not exist (section 4.4, L6).

## 4. What exists, what is untested, what must be built

### 4.1 Exists and works (measured)

| part | where | measured |
| --- | --- | --- |
| camera full screen on the Pi's HDMI by the GPU | `rig/hdmi/hdmi-scan.c`, `rig/board/hdmi.mjs`, page `demo/devices/hdmi/` | 23.6 fps at the camera's default, 29.2 fps with `exposure_dynamic_framerate=0`, 33.7 % of one core, decode 9.3 ms a frame (`rig/hdmi/README.md`); 24 to 29.5 fps, hdmi-test 81/81 (HANDOFF session 80, 2026-10-16) |
| the OLED source: camera dithered to 1 bit, mirrored to HDMI at 15x | same, `rig/board/screen-camera.mjs` | 23.8 fps, `hdmi-scan oled` 1.6 % of a core (session 80) |
| the screen is found while plugged, every beat; the camera found at each show | `rig/board/hdmi.mjs:120, 204, 263` | READ |
| the drone: three sclang-lite programs on wasm scsynth, two CombC echoes 4.3 s and 6.7 s, FreeVerb2, `Limiter.ar(w, 0.8, 0.01)`, the mic raw (no echo cancelling, no noise suppression, no gain control) | `demo/ambient/drone/index.html` 40 to 62, 193 to 200 | headless: boots in 0.6 s, checks 6/6, out -26 dB RMS (HANDOFF session 90). Deployed, BUILD `28d44045-163807-e678` |
| the board's stop all from the OLED panel keys (hold `*` 1 s) | `rig/board/stop.mjs` (`HOLD_MS = 1000`), `board.mjs:360` | READ; `stop-test.mjs` exists, its count not read today |
| the essay's three pictures, the loopback drawn as a return wire | `demo/lonely-software/index.html`, `demo/shell/bay-layout.mjs` | deployed, https://positron.studio/lonely-software/ |
| the bay's loop rule | `demo/shell/bay.mjs:1018 to 1026`, `reachesNode` at 1250 | MEASURED today in node, 5.1 |

### 4.2 Exists but untested in this shape

- **The camera filming its own monitor.** Nobody has pointed it. It needs nothing but
  pointing. Loop delay per trip is unmeasured: camera exposure 33 to 42 ms, decode 9.3 ms,
  draw 2 ms, plus the monitor's own lag, so roughly 60 to 100 ms a trip (INFERRED). Auto
  exposure will chase the loop and pump the brightness (`plan-screens-odd.md` 4). That is
  material, but it is unseen.
- **The drone with the real MK-425C.** *"the keyboard is plugged in nowhere today"*; the CC
  order C1 to C8 = 74 71 91 93 73 72 5 84 is inferred from the GM preset, *"not yet turned
  one by one"* (HANDOFF session 90, page lines 64 to 66).
- **The drone's acoustic loop.** Headless it had no room. With laptop speakers and mic in a
  room, where it howls and how loud is unknown.
- **The Pi today.** Last pushed 2026-10-16 (session 80). Whether it still boots into the
  same board, at its second site, is not checked (no ssh, no relay ask, by the brief).
- **The Pi away from its LAN.** Everything above was measured on the second site's network.
  Off it nothing was measured (HANDOFF 1713, 1754).
- **`/video/camera/` as a fallback loop** with the C925e on the laptop: the page has a
  camera picker (`demo/shell/camera.mjs` 82 to 94), and was never pointed at a projection.

### 4.3 Must be built: realistic by tomorrow 15:30

| item | what | size | risk |
| --- | --- | --- | --- |
| T0 | **the owner's rehearsal at home tonight**, no code: Pi plus C925e plus monitor, Play on `/devices/hdmi/`, point the camera; try `oled`; MK-425C into the laptop, `/ambient/drone/` in Chrome, Start, Radio, turn each knob and note which one moves; raise the laptop volume until it howls and remember that point; once with a phone hotspot as the router's uplink | 45 minutes | none; it is what turns 4.2 into facts |
| T1 (optional) | **a picture-only steps page**, `demo/ambient/loop/` (https://positron.studio/ambient/loop/): the eight pictures of section 3 as plain patch data drawn by `createPatchbay`, the way `/lonely-software/` does (nothing sends, joins or plays), the return wires drawn as the essay's loopback, one step per press of the right arrow or a button, the essay line under each picture | 1 to 1.5 hours by one agent, one shot at 1280 and 375, deploy | low: it touches no hardware and no shared kit |
| T2 (optional) | the drone's CC order fixed if T0 finds it wrong | 10 minutes | low |

Everything else is later. Building a hardware page overnight before a talk is the wrong
trade: the two pages that drive the hardware are deployed and have numbers.

### 4.4 Must be built: later, so the sketch can be opened gradually

| item | what | size (INFERRED) |
| --- | --- | --- |
| L1 | **the bay consents to a loop.** An in-port declares it takes feedback, the way `accepts` declares consent (for example `loops: { gain: 0.9 }`), and the cycle walk lets a loop close only through such a port, with a guard (a limiter on audio, a decay on video) required on the link. Fix the self-link wording while there (5.1). bay-test cases, a lesson in `lessons/kit-bay.md` | 2 hours |
| L2 | **the one sketch page** at `/ambient/loop/`: one bay holding the `pi-1` and `web` nodes, each step a real link that does the real thing (`hdmi.show`, the drone's programs, the mic), the return paths as consented loops (L1), a stop that ends both loops | 1 day |
| L3 | **software feedback on the Pi**: `fx_feedback_grey` (`rig/pico/firmware/fx.c:108`, move, zoom, turn) in `hdmi-scan`'s camera path, its numbers as `value-in` ports, so the knobs can turn the tunnel. Built on the Pi with `rig/hdmi/build.sh` (nothing compiles on this Mac) | 1 to 2 days |
| L4 | camera controls as a board verb: exposure lock and gain (`v4l2-ctl`), so the loop is repeatable or left to drift on purpose | 2 hours |
| L5 | the loop's delay measured: a flash test, one white frame, count frames until the camera sees it (`plan-screens-odd.md` 4) | half a day |
| L6 | **picture to sound**: the camera's mean brightness as `pi-1:camera:value-out` into the drone's `tone` (`plan-camera.md` 0: the camera as a numbers source; `plan-crossmodal.md` 1). Joins the two loops into one | half a day to a day |
| L7 | the drone on the Pi's scsynth: the board's `ALLOWED_CLASSES` (`rig/board/scollide.mjs:84`) has `DelayC`, `LocalIn`, `LocalOut` but not `VarSaw`, `LFNoise2`, `Lag`, `BPF`, `LeakDC`, `CombC`, `FreeVerb2` or `Limiter`; plus the Fast Track Pro as the mic input and a JACK link to its outputs | 1 day |
| L8 | the other end from outside: a mentor's phone scans a code and turns one knob over the relay; and the Pi at its second site with its loop seen from the venue, which needs the camera shared between `hdmi-scan` and the encoder (today each is one process's at a time, `hdmi.mjs` 5, 86 to 90) | half a day, then 1 to 2 days |
| L9 | the TFT, 2.4" ILI9341, 28 EUR, not bought (`plan-pi-tft.md`): a colour loop near camera rate | 1 to 2 days after it arrives |
| L10 | an offline relay: `fake-relay.mjs` on the LAN address and `--relay` from `/etc/default/positron-board` | 2 to 3 hours and a test at home |

## 5. Risks at a venue, and the fallback

### 5.1 The bay's loop rule (MEASURED 2026-11-10, node, `createBay()` from `demo/shell/bay.mjs`)

| link tried | answer |
| --- | --- |
| `web:echo:audio-out -> web:echo:audio-in` (a node into itself) | refused: *"that closes a loop: web:echo:audio-in already reaches web:echo:audio-out."* |
| the same in `value` (the essay's loopback) | refused, same words |
| `web:cam:video-out -> web:screen:video-in` | ok, transport `page` |
| then `web:screen:video-out -> web:cam:video-in` | refused: closes a loop |
| `web:mic -> web:tape` (kind `store`) and back | both ok, transport `indexeddb` |

The rule (READ, `bay.mjs:1018`): a link is refused when its target node already reaches its
source node in the same medium, unless a node of kind `store` is at either end or on the
path, because *"a loop through a store is a replay, not feedback"* (`lessons/kit-bay.md`
`#store-loop`). So **the essay's loopback picture cannot be made in a live bay**; the essay
draws it from plain data (`demo/lonely-software/index.html` 39 to 52). Calling an echo a
`store` would pass the check and lie about it. L1 is the right fix. Until then the return
paths stay physical and are drawn as pictures. ⚠️ The refusal for a self-link says
*"X:audio-in already reaches X:audio-out"*, which reads oddly for a node with no links. A
wording defect, not fixed here (the brief was one file).

### 5.2 Volume and brightness

- **Sound.** The drone's last stage is `Limiter.ar(w, 0.8, 0.01)`, so the digital output
  stays near -2 dBFS (READ). That caps the file, not the room. An acoustic loop through a
  PA can still howl loud. Laptop speakers only; the `radio` knob (C3) is the loop's gain,
  start it at 0 and raise it; know the howl point from T0; Stop on the page ends it. The mic
  is opened raw on purpose, so nothing in the browser damps the loop.
- **Picture.** A camera and screen loop runs to white or to black, which is harmless, and
  can **flicker**. Bands from rolling shutter against refresh are expected (`plan-screens-odd.md`
  4). Keep the monitor's brightness down and turn the camera away if it starts strobing. Say
  nothing about flashes unless it flashes. A photosensitive viewer is the one real harm here.
- **The Pi.** Hold `*` on the OLED panel for 1 s: the board's stop all (READ, `stop.mjs`).
  Or Stop on `/devices/hdmi/`. Pulling power is safe on this board: no Circuit is in this
  patch, so nothing writes flash.

### 5.3 Network, cold starts, devices

- No internet at the venue: steps 1 and 7 cannot be sent. Fallback below. The drone still
  runs from a local server.
- The Pi not on the router: Ethernet first. If the page says *"the Pi did not answer"*
  (`devices/hdmi` waits 6 s), wait one boot (the board reconnects), then use the fallback.
  Do not debug in the slot.
- The camera announced to the relay only if plugged at boot (BACKLOG line 501). The HDMI
  show asks for it again at each show, so the loop does not depend on it (READ, `hdmi.mjs:204`).
- `the camera is held by ...`: only one process may hold the camera (`hdmi.mjs` 86 to 90).
  Close `/remote/circuit/` and `/devices/camera/` tabs.
- Chrome asks for the mic and for MIDI on the first visit. Grant both at home on
  positron.studio, and on 127.0.0.1:8890 if the local server is the plan.
- The VPN: off, and check (2.2).

### 5.4 The fallback that still tells the story

1. **No Pi:** the C925e into the laptop, https://positron.studio/video/camera/ full screen
   on the projector, the camera pointed at the projection. The big room version of step 2
   (untested, 4.2). Plus the drone. The story loses the second machine and keeps both loops.
2. **No camera at all:** https://positron.studio/shader/mirror/, whose shader feeds its own
   last frame back in at 0.78 (`demo/shell/mirror-shader.mjs:14`, `uPrev`). Feedback inside
   one node.
3. **No sound:** the drone without Radio is still a drone; without the laptop speakers,
   skip steps 4 and 5.
4. **Nothing works:** https://positron.studio/lonely-software/, the three pictures, and the
   essay's own sentences.

## 6. Open questions only the owner can answer

1. Can the Pi travel tomorrow, and from where? It sits on the second site's LAN
   (192.168.1.213, HANDOFF session 80). If it stays there, the visual loop is the laptop
   fallback (5.4.1).
2. Which screen does the Pi get: a small monitor you own (which one, and its supply), or a
   TV at the venue? Is there a second projector input or an HDMI switch?
3. Is there a travel router, and does it uplink to a venue network or to your phone?
4. Is "the Raspberry camera" the C925e, or is there a CSI camera module too? Nothing in the
   repo mentions one. A CSI camera is not taken by the HDMI path today (`hdmi.mjs:44, 50`:
   *"the screen takes a USB camera"*).
5. "Maybe the LCD": the OLED that is already wired (step 3), or the TFT that is not bought
   (L9)?
6. One keyboard: on the laptop for the drone (this plan), or on the Pi for Plaits
   (`/devices/synth/`)? It cannot be both without a second keyboard.
7. Steps 4 to 6 on the laptop's speakers, or is there a small speaker you prefer?
8. Do you want T1 (the picture-only steps page) built tonight, and is `/ambient/loop/` the
   name?
9. Step 7: hand the keyboard to a mentor, yes or no? It is the essay's last section done
   instead of said.

## 7. Uncertainty

- No part of the sketch has been seen working as a loop. The parts were measured
  separately: the camera on the monitor in October, the drone headless in November.
- The two return paths (light, room) are physical and the bay cannot hold them today. The
  projected patch shows them only on the picture-only page.
- Venue facts (screen, network, projector inputs) are unknown and decide which half of the
  table is visible to the room.
- The step timings are guesses. Eight steps in five minutes is about 40 s a step;
  dropping step 3 is the easy cut.
