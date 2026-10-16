# demo/devices/

## text

`/devices/text/` (2026-10-15; `/devices/screen/` for an hour, then text when the dots page joined it; `/remote/oled/` until the devices group was made that evening, asked *"oled is not a good name. i need a group for it"*): the Pi's OLED and keys as `pi-1:screen:value-in` and `pi-1:keys:value-out` in the page's own bay, the way `/remote/circuit/` draws the Circuit. Delivery into `oled:value-in` is a `board.ask({ type: 'oled.text' })`; a key on the Pi is a `panel.key` sent to the whole room, which the page puts on `keys:value-out`. Not in `boardGraph` yet, so another page does not see the panel; that and `bay.event` on the board are steps 5 and 6 of `plans/plan-pi-oled.md`.

## dots

`/devices/dots/` (2026-10-15), asked *"next is dot piano renderer but jsut have a sample score with piano roll. based on devices/screen"* and *"lets generalize from pico"*. The renderer is `demo/shell/rings.mjs`, the Pico firmware's rings (`rig/pico/rings/main.c`) with its constants kept: C3 to G4 on radii 4 to 28, 0.7 rad/s, a 3 s fade as thinning. The score is the Ode to Joy theme over C3 and G3, played by a deck through `web:score:midi-out`, linked to `pi-1:screen:midi-in` (the board's `screen.note`) and `web:screen:midi-in` (the same rings in the tab). The piano roll is a `spans` lane with `slots` set to the twenty pitches and `slotOf` by pitch, so it is the kit's strip with no new component; it is fitted after the strip has a width, or it opened on 25 s for a 9 s score.

## patches

`/devices/patches/` (2026-10-15), asked *"a bunch of ... simpler ones, kind of Pi centric ... a list of them in the next demo under devices ... and on each a button just to send it to the Pi screen for verification"*. Ten patches, each a card with the 128x64 picture `bay-oled.mjs` makes and a send button; the list is `web:list:value-out -> pi-1:screen:value-in`, delivered as `screen.patch`, which the board answers `screen.patched`. Names are short on purpose (`takes`, not `recordings`): two columns hold nine letters.

## drums

`/devices/drums/` (2026-10-15), asked *"make a new screen demo or device demo when you have a drum sequencer similar to what we already have. On a small screen."* The drum machine is `/drums/machine/`'s (`createDrumMachine`, four SuperCollider voices, sound in the tab); its bay gains `web:sequencer:value-out`, linked to `pi-1:screen:value-in` (the board's `screen.steps`, sent and not asked) and `web:screen:value-in` (the same frame here). What travels is `{ voices, pattern, step, voice, playing }`, sent whenever it changes, so about eight times a second at 120 bpm; the Pi's playhead lags the tab's by the relay trip plus a 35 ms frame. The keys, the Pi's (`panel.key` on `pi-1:keys:value-out`) and the simulated column, go into `web:sequencer:value-in`, which the drum machine hands to the page through its `onValue` option: ^ and v choose a row, # toggles a step (under the playhead while playing; at the cursor while stopped, and the cursor moves one step on), * plays and stops. A Pi key that starts play before anybody pressed anything in the tab may meet a suspended AudioContext, since the browser has had no gesture.

## camera

`/devices/camera/` (2026-10-15), asked *"work with the demo when you take P's camera and output it into P's screen. It likely needs some new node types, etc."* Three nodes on the Pi and one here: `pi-1:camera` (`video-out`), `pi-1:dither` (`video-in`, `video-out`, label `one bit 128x64`, the processing `dither-oled.mjs` does on the board) and `pi-1:screen:video-in`, and the tab's mirror `web:screen:video-in`. The board does the work (`rig/board/screen-camera.mjs`, `lessons/rig-board-panel.md#screen-camera`); the page asks for it and shows what came back.

It needs the camera key in its address, `?cam=<key>`, as `/remote/circuit/` does, because the board starts the camera only for a viewer in the keyed `<room>-cam`. Play checks the key with the relay (`POST /room/<room>-cam/key`, 204 or 403), joins that room, and says `screen.camera { on: true }` every 5 s while the tab is visible; stop, or leaving the page, says `on: false`. A hidden tab stops renewing, so the board stops within its 15 s lease. Without a key play logs that and opens nothing. The readout is `fps here` (frames that arrived in the last second) and `fps on Pi` (the rate the board measured), so a gap between them is the relay.

## camera-relay

How the patch says what a 1 KB frame stream is. It is a moving picture, so the medium is `video`, heavy, and the bay never carries it: the link is a session. None of the table's video cells is what really happens (`whep` or `relay-h264` at `internet-one`), so `pi-1:dither:video-out` declares `transports: ['page', 'relay']` and `address: '<room>-cam'`, `web:screen:video-in` declares `['relay']`, and the link out to the tab is made with `via: 'relay'`. Its session then reads `relay, <room>-cam` with *"asked for on this link, no number measured"*, which is true, and the page opens the room named by the session's address. Not `state`: a state link is a room as a bus for values, and calling a picture a value would hide that it is 17 KB/s. The two links inside the Pi are `machine` and read `page` from the table, though nothing there is a page; it is one process (`board.mjs`), and the word is the table's, not a claim.

A frame that arrives is put on `pi-1:dither:video-out` with `bay.send`, so the simulated screen paints only while the patch holds `dither -> web:screen`; the same send reaches `pi-1:screen:video-in`, whose port in the tab has no `deliver`, because the Pi drew that frame itself before it sent it. The shape `{ w: 128, h: 64, bits: 1, layout: 'ssd1306-pages' }` is declared on the dither's out and both screens' ins, so a screen of another size is refused at link time.

## drums-circuit

`/devices/drums/` gains a target, 2026-10-15 (`plans/plan-pi-sequencer.md` step 3 and 5): *plays on* this tab or the Circuit on the Pi (`?target=circuit` opens on the second). On the Circuit, Play joins the room and sends `seq.start` with the grid as a pattern (`drum-pattern.mjs`); a changed pattern or tempo is sent as `seq.pattern` along `web:sequencer:value-out -> pi-1:sequencer:value-in` and lands on the board's next bar; Stop sends `seq.stop`. The tab boots no SuperCollider (`createDrumMachine`'s `local` option) and plays nothing; its grid's clock only mirrors the board's, and its notes go along the drawn `pi-1:sequencer:midi-out -> pi-1:circuit:midi-in { drummap circuit }`, whose in-port here delivers nothing, so the picture pulses and counts what the map drops. The Pi's screen is linked from `pi-1:sequencer:value-out`, not from the tab, because the board draws it from its own clock. Closing the tab does NOT stop the board (`pagehide` sets `leaving`, so the drum machine's own stop on pagehide sends nothing).

The rows the Circuit has no drum for (clap, low tom, high tom, cowbell) stay grey on the grid (`silent`) and are listed in the drum map table as silent. The tab's own drums and speaker leave the picture on the Circuit, and the Pi's two nodes leave it on this tab (`hide`).

The looks gallery (every EMPTIES x HEADS card) was removed the same day on *"keep Dotted steps / The running step framed"*; both screens draw `{ empty: 'dot', head: 'frame' }`. `steps-oled.mjs` keeps the options.

MEASURED against `demo/fake-board.mjs`, 2026-10-15, eight rows with the four extras lit on step 1, about two bars: written to the stand-in Circuit only notes 60, 62, 64, 65 on channel 10 (`99 3C`, `99 3E`, `99 40`, `99 41` and their `89` offs), 24 extras dropped by the board's map, last byte `B9 7B 00`; board timer late p50 0.61, p99 1.23 ms on the Mac; kick to kick 498.96 to 500.65 ms. Self check 7 asserts before, 14 after.

## keys

`/devices/keys/`, 2026-10-15: the MK-425C on the Pi plays the Circuit (rig/board/keyboard.mjs, `lessons/rig-board-keyboard.md`). The page draws `pi-1:mk-425c` and `pi-1:circuit` from `boardGraph` and the link the BOARD says it holds (`kbd.state`, or `kbd` on `board.alive`), so a second tab, or this one reopened, shows what the Pi is doing once it has asked. The choice off, synth 1, synth 2 is the press: it sends `kbd.link { channel }` or `kbd.unlink`, and on a link sends the patch `mk-425c -> circuit` along `web:patch:value-out -> pi-1:screen:value-in` as `screen.patch`. Nothing reaches the Pi on load. The readout is the board's: notes it wrote, messages the link dropped or the gate refused, and its read to write time (p50 and worst).

The self check drives a board only on a relay on this machine (`relayOverride`), so `?selfcheck=1&board=1` without one cannot make the link on the real Pi. Against `demo/fake-board.mjs` it plays the stand-in keyboard with `fake.kbd.play` and reads back exactly what the stand-in Circuit was written: `90 3c 64 | 80 3c 00` on synth 1, `91 3e 5a | 81 3e 00` on synth 2, nothing for SysEx, clock and start, nothing after off. MEASURED 2026-10-15: 8 asserts alone, 12 against the stand-in, all green.

## hdmi

`/devices/hdmi/`, 2026-10-16: the Pi's HDMI0 screen (rig/board/hdmi.mjs, `lessons/rig-board-hdmi.md`). Play asks `hdmi.status` first, so a tab opened while the board already shows something turns play into stop; then `hdmi.show { source }` or `hdmi.stop`, each answered `hdmi.state`. The choice camera or pattern changes the source only while something shows. The picture draws `pi-1:camera` or `pi-1:pattern` into `pi-1:hdmi0` by `fbdev`, from what the board answers, never from the press. While a show runs the page asks `hdmi.status` every 3 s for the CPU cell; nothing is asked while the screen is off, and nothing on load.

The self check never drives the Pi (only `board=1` on a relay on this machine may, and `demo/fake-board.mjs` does not know the hdmi verbs): it draws locally and grades the links. MEASURED 2026-10-16: 10/10 under `?selfcheck=1`, 8 of them the page's, and a visit contacted only the dev server.

## circuit

`/devices/circuit/`, 2026-10-15: the Circuit's drums play the Pi's SuperCollider drums, heard in the tab over the relay (rig/board/circuit-drums.mjs, `lessons/rig-board-circuit-drums.md`). A new devices page rather than a mode on /drums/remote/: that page is a crossfade between a drum machine in the tab and the Pi with a simulated Pi behind it, and its sequencer link, scope and asserts would all have to learn a second source; this page is the /devices/keys/ pattern (a link the board holds, asked for on a press) plus the Pi's screen.

Listen is the one press a browser needs: it starts the board's collide engine, has the board compile the four voices from /drums/voices.mjs, plays the board's sound here (lifted by 1.8 as /drums/remote/ does), and asks for the link if the board does not hold it. The choice off and on is `cdrums.link` and `cdrums.unlink`. Stop listening leaves the link; the Pi keeps playing its drums with no tab. While the link is held and the tab is visible the page asks `cdrums.status` every 250 ms and puts the grid on `pi-1:screen:value-out -> web:screen:value-in`, so the simulated screen is a 4 frames a second mirror of the Pi's, which redraws per step.

Latency, KNOWN not measured on this path: a Pi sound to this tab's speakers over the relay was 176 to 317 ms for the first hit on /drums/remote/ (MEASURED 2026-10-12, which includes about 36 ms of tab to Pi), so expect roughly 140 to 280 ms from a pad to the tab here, plus at most 5 ms of polling and the Circuit's own USB time. Not measured: anything with the real Circuit, which was not plugged into the Pi when this was pushed.

Self check: alone, 8 asserts (the read back link in the page's bay, a synth 1 note 60 kept out). Against the stand-in, 15 asserts: Listen holds the link, a drum 1 pad starts one drum and lights row 1, a synth note and a drum CC start nothing, Start and seven ticks put the frame on step 1, Start cleared the last bar, the mirror follows, the board's sound arrives, nothing is written to the Circuit, off lets go. MEASURED 2026-10-15, all green.
