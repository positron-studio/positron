# Page comments: remote

The full comments cut from the code under demo/ for remote, verbatim. Each heading is the id a pointer in the code names, then the file, the block and the line it stood on before the cut.

<a id="remote-1"></a>
## remote-1: demo/remote/circuit/index.html, style, line 12

````css
  /* Play alone at the top left. No status label: what the board says goes to
     the log (060's rule, asked 2026-10-11). */
````

<a id="remote-2"></a>
## remote-2: demo/remote/circuit/index.html, inline script, line 38

````js
  // The keyboard and a patch selector playing the Novation Circuit
  // that is plugged into the Raspberry Pi, the way /away/ reaches it: the Pi
  // carries the Circuit as an input in a room of its own (`studio-1-circuit`),
  // takes MIDI bytes there through its gate (rig/board/inputs.mjs `midiVerdict`)
  // and sends the Circuit's sound back down the same socket while a lease is
  // held.
  //
  // 🔴 NOTHING HERE CAN WRITE THE CIRCUIT'S FLASH. Notes, the eight macro
  // control changes (CC 80 to 87) and a program change on channel 1, patches 0 to 63, which selects
  // a synth patch into RAM. One SysEx, the nine byte Current Patch Dump Request,
  // which asks the Circuit for the patch it is holding and changes nothing. No
  // session change on 16. The board's gate refuses everything else whatever
  // this page sends.
  //
  // NOTHING OPENS ON A VISIT. The board is made on the play press, never at
  // load. A check run sends nothing to the Circuit unless ?board=1 is added.
  // The camera's three cells exist only when the URL carries the camera key, so
  // a page without it shows nothing of the camera, not even an empty cell.
````

<a id="remote-3"></a>
## remote-3: demo/remote/circuit/index.html, inline script, line 58

````js
    // ⚠️ AN EVEN NUMBER OF CELLS (shell.mjs `createReport` throws on odd).
    // `path` came in 2026-10-13 with the direct link, so `key to sound` became
    // the MEDIAN of the last twenty presses and the separate `median` cell went
    // (the last press alone is `__demo.probe().lags`). The camera's path is a
    // word in `path` (`direct, camera relay`) rather than a third camera cell.
    // 🔴 `round trip` IS `network` SINCE 2026-10-13. The owner read `KEY TO SOUND
    // 141` beside `ROUND TRIP 3` and asked *"i dnot not undestand difference on
    // there readings"*: two cells in ms side by side read as two answers to one
    // question. `network` is a message there and back with no sound in it; `key to
    // sound` is the whole trip, and its hover adds up the parts (`partsLine`).
````

<a id="remote-4"></a>
## remote-4: demo/remote/circuit/index.html, inline script, line 77

````js
  // ── relay or direct ─────────────────────────────────────────────────────
  // Asked 2026-10-13: *"can https://positron.studio/concepts/remote/010/?cam= go
  // direct too?"*, then *"can we go direct with circuit?"*. As on
  // /remote/piano/: the relay unless `?path=direct`, and the choice at
  // the top. Direct is two WebRTC data channels to the Circuit's input on the
  // Pi (rig/board/rtc.mjs, inputs.mjs), signalled in `studio-1-circuit`:
  // notes, CC, the patch questions and the lease on `ctl`, the Circuit's
  // sound on `pcm`, the macros turned by hand back on `ctl`, and with the
  // camera key the camera's frames on a third channel `cam` (below). No
  // channel within 3 s, or one that drops, and the relay carries everything.
````

<a id="remote-5"></a>
## remote-5: demo/remote/circuit/index.html, inline script, line 93

````js
  // Only the patch a synth is HOLDING can be read (a dump request answers for
  // the current patch, never for a slot), so the cell shows the name the
  // Circuit sends back, as it stores it, once a patch has been picked.
  // The names the Circuit sent back for each slot, READ OFF THIS DESK'S CIRCUIT
  // 2026-10-13 with `__demo.scanNames()` (slot 1 answered with no name). A label
  // until the patch is picked; the name read back then replaces it, so a slot
  // renamed on the Circuit shows its new name the first time it is played.
````

<a id="remote-6"></a>
## remote-6: demo/remote/circuit/index.html, inline script, line 109

````js
  // 🔴 THE STARTING PATCH IS GASTON, BY NUMBER. Asked 2026-10-13: *"gaston as
  // std patch"*. A name can only be read back for the patch Synth 1 is
  // holding, so the page does not look it up at play time: the slot is written
  // here and the name is its label, and on play Synth 1 is sent there.
  // Slot 14 (0 based, "Patch 15" on the Circuit), READ 2026-10-13 by the
  // session with `await __demo.scanNames()` against this desk's Circuit, which
  // steps Synth 1 through program changes 0 to 63 (RAM only) and returns every
  // slot's name. If the owner moves Gaston, scan again and change the number.
````

<a id="remote-7"></a>
## remote-7: demo/remote/circuit/index.html, inline script, line 132

````js
  // ── the eight macro knobs, each a node of its own ──────────────────────
  // Asked 2026-10-13: *"can https://positron.studio/concepts/remote/010/ ahve
  // separate control knobs in patchbay to alter chricuit c1-c8 ? allow cc ?"*.
  // The Circuit's macro knobs 1 to 8 are CC 80 to 87 on the synth's own
  // channel, Synth 1 on 1 and Synth 2 on 2 (demo/shell/circuit-cc.mjs, rows
  // `macro knob N position`; MEASURED off the Circuit's own knobs, a full 0 to
  // 127 sweep each, research/measured-devices-2026-09-20.md "Circuit macro 7
  // is CC 86"). This page plays Synth 1, so the knobs move Synth 1's macros.
  // The board's gate already lets these through (rig/board/inputs.mjs
  // `SYNTH_CC`, the `1/2` rows of the same table).
````

<a id="remote-8"></a>
## remote-8: demo/remote/circuit/index.html, inline script, line 151

````js
  // ── control changes: three bytes, Bn cc vv, and nothing else ─────────────
  // The board's gate decides what reaches the Circuit whatever a page sends;
  // this page refuses on its own side too, so a bug here is a log line and
  // never a byte on the wire. A CC is exactly three bytes, a status of 0xB0 on
  // this page's channel, and two data bytes of 0 to 127.
````

<a id="remote-9"></a>
## remote-9: demo/remote/circuit/index.html, inline script, line 223

````js
  // ── the scope: an analyser on the board's playout, full width ────────────
  // The picture scales to the sound. It was a fixed 0.25 of full scale, set
  // for Yoshimi's quiet output, and the Circuit's line out runs well past it,
  // so the scope drew every note flattened at its edges while the sound was
  // whole. The span widens at once to the loudest sample of the frame (held
  // at 90% of the height) and narrows back slowly, about a 2 s fall, so a
  // note does not pump the picture. Real clipping is a separate fact: a
  // sample at full scale is counted and logged once per stretch.
````

<a id="remote-10"></a>
## remote-10: demo/remote/circuit/index.html, inline script, line 253

````js
  // ── the lags: what came back, against when the key went down ────────────
  // The four cells /remote/piano/ carries, measured the same way,
  // asked 2026-10-11: *"add readouts to all pi-driven synths. 4"*. Key to sound is measured
  // per press: the first 1 ms block after the press that is over ONSET and
  // three times what the 30 ms before it held, on the speaker's clock
  // (`getOutputTimestamp`, so the browser's own output latency is inside it).
  // The other cells are the parts this page can name: the network round trip
  // to the Pi, the playout cushion, and the path; the browser's output latency
  // is read off the context and shown in the hover. What is left
  // over is the Pi's capture block and frame (JACK 512 x 3 at 48 kHz, 20 ms
  // frames), which the page cannot see on its own.
````

<a id="remote-11"></a>
## remote-11: demo/remote/circuit/index.html, inline script, line 316

````js
  // What each cell measures, on hover: two or three short lines (positron-ui).
  // `key to sound` adds up its parts from the other cells. The Pi's part is what
  // is left over: one way out and back is about `network`, the cushion and the
  // speaker are this browser's own, so the rest is the Pi hearing the note (MIDI
  // to the Circuit, its sound, the card, JACK's period, a 10 ms frame).
````

<a id="remote-12"></a>
## remote-12: demo/remote/circuit/index.html, inline script, line 341

````js
  // ── the patch selector, its own node ─────────────────────────────────────
  // It opens empty. On play, and after each patch change, the page asks the
  // Circuit for the patch Synth 1 is holding (Current Patch Dump Request,
  // plans/plan-circuit-patches.md §5) and shows its name.
````

<a id="remote-13"></a>
## remote-13: demo/remote/circuit/index.html, inline script, line 369

````js
    // The Circuit can answer before the program change has landed, with the
    // patch it held before. An answer byte for byte the last one, right after
    // a change, is asked again, up to three times 60 ms apart. Two slots can
    // hold the same patch (an initial patch copied about), so after that it is
    // believed.
````

<a id="remote-14"></a>
## remote-14: demo/remote/circuit/index.html, inline script, line 413

````js
  // ── the macro knobs ─────────────────────────────────────────────────────
  // 🔴 A KNOB TURNS ON SCREEN WHEREVER ITS VALUE CAME FROM, AND ONLY A DRAG
  // SENDS. Asked 2026-10-13: *"make all concept knobs \"invisible-handed\"
  // start from remote 010"*. Three sources reach these knobs with
  // `knob.receive()`, which glides the dial, marks it, and never calls
  // `onInput`, so none of them is ever sent back to the Circuit:
  //   device  a macro turned BY HAND on the Circuit on the desk. The Circuit
  //           sends it as CC 80 to 87 on channel 1 (MEASURED,
  //           research/measured-devices-2026-09-20.md), and the board reads its
  //           MIDI out while this page holds the lease and tells the room
  //           `midi.cc` (rig/board/midi-back.mjs), at most 30 a second a knob.
  //   patch   the patch dump this page asks for after play and after every
  //           patch change carries each macro's Position (circuit-patch.mjs
  //           `MacroKnobN_Position`, addresses 204 + 17 per knob).
  //   midi    a controller plugged into this machine sending CC 80 to 87; its
  //           own wire sends it to the Circuit, once.
  // ⚠️ Whether the dump's Position follows a macro turned on the Circuit by
  // hand, or only the stored patch, has not been measured.
  // ⚠️ Whether the Pi's raw MIDI input carries those hand turns as the Mac's
  // USB did is not measured either; `__demo.probe().fromCircuit` counts them.
  // And every knob has the kit's invisible hand (`hand: true`, the button on
  // the ring, as every other concept knob has), which turns it from HERE and
  // sends, through the same 30 a second queue a drag uses.
````

<a id="remote-15"></a>
## remote-15: demo/remote/circuit/index.html, inline script, line 459

````js
  // ── MIDI in: keyboards and controllers plugged into this machine ────────
  // Asked 2026-10-13: *"add midi in to https://positron.studio/concepts/remote/010"*.
  // The kit's createMidiDevices, as /code/plaits/ uses it: every input is a
  // node, `web:midi`, `web:midi-2`, ..., with a midi wire into
  // `pi-1:circuit:midi-in`, the path the on-screen keys take,
  // so its notes land on Synth 1's channel like theirs.
  // 🔴 ASKED FOR ON THE PLAY PRESS, NEVER ON LOAD, AND WITH `sysex: false`.
  // 🔴 WHAT PASSES: note on, note off, and a control change whose number is
  // one of the Circuit's synth controls (circuit-cc.mjs, the `1/2` rows, the
  // same table the Pi's gate allows). Everything else a device sends is
  // dropped here and counted: SysEx (which `sysex: false` never delivers
  // anyway), program change, pitch bend, aftertouch, clock, and any CC the
  // Circuit's synth does not take. A CC that is a macro (80 to 87) turns that
  // macro's knob on screen (`receive`, which sends nothing), so it is sent
  // once, by the device's wire.
````

<a id="remote-16"></a>
## remote-16: demo/remote/circuit/index.html, inline script, line 539

````js
  // Asked for the patch number of a name (see START_PATCH). Steps Synth 1
  // through every patch, reading each name, and returns them. Program change
  // only: it changes the patch Synth 1 holds in RAM and writes nothing. Run by
  // a person from the console, never by a check.
````

<a id="remote-17"></a>
## remote-17: demo/remote/circuit/index.html, inline script, line 677

````js
  // 🔴 THE LINKS SAY WHICH WIRE CARRIES THEM, as on 030: every link between
  // this page and the Pi is made again with `via` when the path changes,
  // `datachannel` while direct (or through TURN), `relay` otherwise. The
  // camera's link follows the camera's own path (`cam path`), which can stay
  // on the relay while the sound is direct.
````

<a id="remote-18"></a>
## remote-18: demo/remote/circuit/index.html, inline script, line 704

````js
  // ── the Pi's camera, for holders of the key only ────────────────────────
  // Asked 2026-10-13: *"add pi camera to https://positron.studio/concepts/remote/010/.
  // url secret parameter to enable (key in cf secrets)"*.
  // 🔴 WITHOUT `?cam=` NOTHING BELOW EXISTS: no panel, no module loaded, no
  // request, no cell. With it, nothing opens on a visit either; the press of
  // play opens it, as it opens the Circuit.
  // 🔴 THE KEY IS NEVER COMPARED HERE. The page hands it to the relay, which
  // compares it with the Cloudflare secret PI_CAM_KEY (workers/relay/src/index.js
  // `CAM_ROOM`): `POST /room/<room>-cam/key` answers 204 or 403, and only after
  // a 204 is the keyed room opened, with the key as its first message (in the
  // message and not the URL, so it is not in the relay's request log). The Pi
  // joins the same room with its own copy and starts its camera only for a
  // viewer there (rig/board/camera.mjs), so only a holder of the key can turn
  // it on. It stops on this page's `cam.bye`, or 25 s after the last
  // `cam.watching`, which this page sends every 10 s while it is visible.
````

<a id="remote-19"></a>
## remote-19: demo/remote/circuit/index.html, inline script, line 740

````js
    // The lag: the board stamps its clock once a second with the counter of the
    // next frame it will send (`cam.tick`), and this page notes when that frame
    // arrives. Pi to this screen through the relay, against two NTP set clocks,
    // so it is worth what their agreement is worth; the camera's own exposure
    // and encode time is not in it.
    // ⚠️ THE TICK AND ITS FRAME CAN ARRIVE IN EITHER ORDER. On the relay they
    // share one socket and the tick comes first; on the direct link a frame can
    // beat a tick that went through the relay, so both sides are kept and the
    // lag is taken when the second of the two arrives. Since 2026-10-13 the
    // board also sends the tick on the `cam` channel.
    // The board's clock is corrected by the offset `rtc.pong` measures on a
    // direct link (board.mjs `clockOffsetMs`), once there has been one; before
    // that the lag is against two NTP set clocks, as it always was.
````

<a id="remote-20"></a>
## remote-20: demo/remote/circuit/index.html, inline script, line 832

````js
    // ── the camera on the direct link ─────────────────────────────────────
    // 🔴 THE SAME TWO GATES AS THE RELAY, AND ONE MORE. The relay's key check
    // first (`POST .../key` answered 204 and the keyed room said `cam.key.ok`),
    // then the board's: `cam.direct` carries the key and this page's viewer
    // name over `ctl` ONLY (board.askDirect, never the tokenless relay room),
    // and the board attaches the `cam` channel only when the key is its own
    // AND that viewer is one the relay let into the keyed room
    // (rig/board/camera.mjs `attachDirect`). A direct link alone opens nothing.
    // WHY A THIRD CHANNEL ON THE CIRCUIT'S LINK, NOT A LINK OF ITS OWN: the
    // link is already open, so the camera costs no second ICE and DTLS
    // handshake and falls back with the sound; and not on `ctl` or `pcm`,
    // because a picture wants ORDERED and RELIABLE delivery (a decoder fed a
    // frame with a hole is broken to the next keyframe), which `pcm` (no
    // retransmits) and `ctl` (unordered) are not. The board cuts a frame into
    // 16 KB pieces, so a keyframe cannot hold a note on `ctl` behind it for
    // longer than one piece.
````

<a id="remote-21"></a>
## remote-21: demo/remote/collide/index.html, inline script, line 35

````js
  // /code/collide/ plus the same voice rendered on the Raspberry Pi as
  // well. Asked 2026-10-12 (BACKLOG, "synth/090 Collide synth and synth/100"):
  // *"100 is same but with local and rasperry pi rendering. 1/2 videpanel with
  // wave on left, pi wave on right. readings on top, 2 local 2 pi ones. pi is
  // not on lan, backlog its execution, simulate locally until then"*.
  //
  // 🔴 THE PI SIDE IS THE REAL BOARD WHEN ONE ANSWERS, AND SIMULATED IN THIS TAB
  // WHEN NONE DOES, and the page says which on the Pi node's label and in the
  // `path` cell (`relay`, `direct`, `turn` or `simulated`).
  // `createPiSide` below is the one place the board goes in (2026-10-12,
  // plans/plan-pi-supercollider-defs.md steps 3 and 5).
  //
  // THE READOUT, every cell measured here and none typed:
  //   local lag / Pi lag     from the key going down (`performance.now()` in
  //                          the key's own handler) to the first window of
  //                          that side's sound above -50 dBFS at its analyser,
  //                          plus the context's own `baseLatency` and
  //                          `outputLatency`, which is what is still between
  //                          the analyser and the speakers. Measured only on a
  //                          note that starts from silence on that side, so a
  //                          tail still ringing cannot pass for the new note,
  //                          and only once that side's engine is up, so the
  //                          first key's boot is not a lag.
  //   local spread / Pi spread  the worst minus the best of those lags over
  //                          every note so far, empty until there are two.
  //                          Replaced the two level cells 2026-10-12: *"local
  //                          pi levels have no value"* (both sides play one
  //                          program, so they read the same number).
  //
  // THE CROSSFADER, asked the same day: *"add crossfader to collide on pi"*.
  // Its own node, `web:xfade`, with the local sound on `audio-in` and the Pi's
  // on `audio-in-2`, its `audio-out` to the speakers, and the slider a node of
  // its own, `web:fader:value-out`, cabled into `web:xfade:value-in`. Equal
  // power, as /radio/blend/. The scopes and the cells read each side
  // BEFORE the crossfade, so a side faded out still shows its wave.
  //
  // NOTHING OPENS ON A VISIT. The text is compiled in JavaScript as the page
  // opens. A pointer over the keys fetches the engine (our origin); the first
  // key makes the AudioContext and boots both engines.
````

<a id="remote-22"></a>
## remote-22: demo/remote/collide/index.html, inline script, line 76

````js
    // The four cells under the title, the log alone at the foot (*"readings on
    // top"*), as /remote/piano/ does.
````

<a id="remote-23"></a>
## remote-23: demo/remote/collide/index.html, inline script, line 79

````js
    // `network` and `path` came 2026-10-13 with the direct option, the two
    // cells remote/010 shows for its link (an even count, as the shell asks).
````

<a id="remote-24"></a>
## remote-24: demo/remote/collide/index.html, inline script, line 87

````js
  // ── the Pi side: THE ONE PLACE THE REAL BOARD GOES IN ────────────────────
  //
  // The page talks to the Pi through five calls and nothing else: `wake(ctx)`,
  // `noteOn(note, vel)`, `noteOff(note)`, `param(name, v)` and `out()` (its
  // sound, as an AudioNode in `ctx`).
  //
  // THE BOARD, since 2026-10-12. On the first key, `createBoard` with this
  // page's own 48 kHz context and `toDestination: false`, so the board's sound
  // is a node HERE that the router puts through the Pi scope and the
  // crossfader. Then `audio.status` (does a board answer at all, in
  // `ASK_MS`), `audio.start {source: 'collide'}`, and `sc.load` of PROGRAM
  // through `/shell/board-collide.mjs`; a key is `note.on {node: 'collide'}`
  // and a knob `sc.set`. The board compiles the TEXT with the same compiler
  // and says `same: true` when its bytes are this tab's. `?path=direct`
  // offers the direct path, as /remote/piano/ does.
  // ⚠️ THE BOARD ON THIS PAGE TODAY IS THE STAND-IN: `?relay=ws://127.0.0.1:8897`
  // with `node demo/fake-board.mjs` running. It answers every verb through the
  // board's own `rig/board/scollide.mjs`, and its sound is a fixed tone, not
  // the program. The real Pi has not run `scollide.mjs` yet (plan step 4).
  //
  // SIMULATED, when nothing answers: a second scsynth in this tab running the
  // same program, with the trip modelled around it:
  //
  //   up     UP_MS before a note or a knob reaches the engine: half the Mac to
  //          Pi relay round trip, 64 to 69 ms measured 2026-09-14 (PROGRESS.md,
  //          quoted in research/pi-drum-machines-2026-09-21.md section 2.3).
  //   back   DOWN_MS of delay on the sound: the board's JACK period (1024 at
  //          48 kHz on the dummy backend, `rig/board/jacksynth.mjs`, 21.3 ms),
  //          one board frame (`BOARD_FRAME_MS`, read from board.mjs), the
  //          relay back (the same 34 ms), and the playout cushion board.mjs
  //          opens with (`cushionMs = 100`). The sound is folded to
  //          `BOARD_CHANNELS` (one) on the way, because the board sends mono.
  //   ⚠️ A MODEL, NOT A MEASUREMENT OF THE BOARD. Its total, about 210 ms,
  //   sits inside the 160 to 220 ms that research file estimates for press to
  //   sound through this rig, and that number has never been measured either
  //   (same file, section 2.3). The `Pi lag` cell measures the MODEL.
  //
````

<a id="remote-25"></a>
## remote-25: demo/remote/collide/index.html, inline script, line 154

````js
  // RELAY OR DIRECT, asked 2026-10-13: *"add direct option to all remote
  // instruments."* The same choice, cell and fall back as remote/010 and 030
  // (`/remote/path.mjs`): the relay unless `?path=direct`; direct is a
  // WebRTC link to the board offered once it answers, the relay kept for
  // presence and as the fall back when no channel opens in 3 s or it drops.
  // A change of choice makes a new board on the new path (`switchPath`).
````

<a id="remote-26"></a>
## remote-26: demo/remote/collide/index.html, inline script, line 161

````js
  /**
   * The board if one answers, the simulation if none does. `mode()` is
   * `checking` until it is decided, then `relay`, `direct`, `turn` or
   * `simulated`; `onMode` hears every change.
   */
````

<a id="remote-27"></a>
## remote-27: demo/remote/collide/index.html, inline script, line 300

````js
  // ⚠️ VIA RELAY, BECAUSE THAT IS THE WIRE IT RIDES. Both Pi legs read one
  // `board.playout()` node fed by the relay socket; without this the bay took
  // the crossfader for a second internet receiver and gave it a MoQ session
  // the board never opens, and the picture drew it as a wire of its own, a
  // column wider than the box (884 px in 688 at 1280, 2026-10-12).
````

<a id="remote-28"></a>
## remote-28: demo/remote/collide/index.html, inline script, line 440

````js
  // ── one scope, both waves on it, each held from its own note's onset ────
  // Asked 2026-10-13: *"overlay 2 waves on top of each other, full w"*. The
  // scope, what was measured before it and how each side's onset is found are
  // in /remote/overlay-scope.mjs, shared with remote/040 since the
  // same day. Here a key is the trigger, the window is 1024 samples (21 ms at
  // 48 kHz, about four cycles of A3) and the Pi's window may slide 20 ms (960
  // samples, a period of the lowest key) to its best match.
````

<a id="remote-29"></a>
## remote-29: demo/remote/collide/index.html, inline script, line 466

````js
    // No longer than the real label: the bay's column is as wide as its widest
    // box, and `SuperCollider on the Pi, simulated` widened the Pi's column
    // enough to push the patchbay 11 px past its box at 1280 (2026-10-12).
````

<a id="remote-30"></a>
## remote-30: demo/remote/collide/index.html, inline script, line 506

````js
  // Knobs above the code (*"when there are code and knobs on concepts, move knobs on top of code"*).
````

<a id="remote-31"></a>
## remote-31: demo/remote/overlay-scope.mjs, module, line 1

````js
// ONE SCOPE, BOTH WAVES ON IT, EACH HELD FROM ITS OWN ONSET.
// Lifted 2026-10-13 out of /remote/collide/ (Collide on Pi) so
// /drums/remote/ (Drums on the Pi) draws the same picture; asked that
// day on 040 as *"can not see viz improvements"*.
//
// What it was built for, on 020: asked on a shot of two half panels (here a
// clean slow wave, the Pi a dense jittering band): *"how to make less
// nervous?"*, then *"overlay 2 waves on top of each other, full w"*.
// MEASURED first, the real board on the relay, held keys on three notes:
// both panels drew with the SAME code (512 samples from the first rising zero
// crossing, redrawn every frame), so the drawing was not the difference. The
// Pi's copy is clean (exact digital zero between notes, no dither); what it
// carries more of is energy above 4 kHz, 10 to 20 dB more relative to its
// note, which is int16 quantisation (about -101 dBFS) under a note at -35 to
// -50 dBFS. And on the relay its playout trimmed or ran dry 3 to 9 times in a
// few seconds, each one a splice in the wave. A free running scope redraws
// whatever 11 ms the last frame held, so every splice and every frame boundary
// moved the Pi's picture.
//
// So the scope is HELD, the kit's triggered idea (/kit/devices/, TRIGGERED
// SCOPE): on each trigger (a key on 020, a bar's first hit on 040), each
// side's window is taken from THAT SIDE'S OWN onset and kept until the next
// trigger. The onsets are found separately because the Pi's arrives 100 to
// 300 ms after this tab's. One scale for both, the larger peak, so a level
// difference still shows. A trigger whose onset cannot be found keeps the
// previous picture.
//
// TWO WAYS TO FIND THE PI'S ONSET, because the two pages differ:
//   'onset'  (020, the default) from the trigger, the first 1 ms block over
//            three times the 30 ms before it (as remote/030 finds a note),
//            then the first rising zero crossing after it. A resonant saw
//            crosses zero more than once a cycle, so the Pi's window is then
//            slid up to `slide` further to where it matches this tab's best
//            (the largest correlation). A keyboard note starts from a quiet
//            side, so the first onset after the key is the note.
//   'match'  (040) a drum pattern is never quiet: between a hit and the Pi's
//            copy of it, 90 to 300 ms later, the Pi plays its copies of the
//            hits before it, so the first onset after the hit is the wrong
//            hit. The Pi's copy is found instead by matching the loudness
//            shape of this tab's `refMs` after its onset (1 ms blocks, the
//            best normalised correlation) inside `minLagMs` to `maxLagMs`,
//            then slid by up to `back` either way, `2 * back` in all, to the
//            best sample by sample match, as 'onset' does.
````

<a id="remote-32"></a>
## remote-32: demo/remote/overlay-scope.mjs, module, line 135

````js
  /**
   * A trigger: take each side's window from its own onset, once it has one.
   * `at` is the trigger's time on `ctx`'s clock (a key: now; a hit: when it is
   * due). `sides.local()` and `sides.pi()` answer that side's AnalyserNode, or
   * null while it has no sound or no link to the scope.
   */
````

<a id="remote-33"></a>
## remote-33: demo/remote/path.mjs, module, line 1

````js
// demo/remote/path.mjs: the relay or direct choice of a remote
// instrument page, written once for remote/020, 040 and 050.
//
// Asked 2026-10-13: *"add direct option to all remote instruments."* (BACKLOG).
// remote/010 Circuit on Pi and remote/030 Pi piano carry this inline; these
// three pages take it from here so they cannot drift from each other, and it is
// the same control, the same URL and the same fall back as those two:
//
//   - `createChoice` labelled `path`, `relay` and `direct`, relay the default.
//   - `?path=direct` opens on direct, and the URL follows the choice.
//   - `connecting()` sweeps the `direct` segment while the link is being made
//     (board.mjs `goDirect`, which gives up after 3 s).
//   - `fellBack()` lights `relay` and drops `?path=direct` when direct did not
//     open or dropped, so the choice shows the path in use, not the one asked.
//   - `rewire(bay, path, isPi)` re-lays every link between the page and the Pi
//     with `via: 'datachannel'` while direct (or through TURN) and `via: 'relay'`
//     otherwise, so the patchbay draws the wire that carries it.
//
// A change of choice calls `onPick(mode)`; the page tears its board down and,
// if it was playing, plays again on the new path, as 030 does.
````

<a id="remote-34"></a>
## remote-34: demo/remote/path.mjs, module, line 60

````js
    /**
     * Lay every link that touches the Pi again with the wire that carries it.
     * `isPi(link)` says which links are the board's; a file link to R2 is not.
     * Answers whether anything changed.
     */
````

<a id="remote-35"></a>
## remote-35: demo/remote/piano/index.html, inline script, line 17

````js
  // concepts remote/030 (sampler/030 until 2026-10-13), THE PIANO ON THE PI, 2026-10-11. /concepts/sampler/010/'s
  // piano and Rhodes, played by the Raspberry Pi in studio-1 instead of the tab:
  // `pi-1:sampler` is a SuperCollider server of its own on the board
  // (rig/board/scsampler.mjs), the samples come from R2 onto the SD card once,
  // and its sound comes back down the relay as remote/000's Yoshimi does.
  // Asked: *"do supercollider. rm fluidsynth"*, option b) of
  // plans/plan-sampler-pi-pico.md §2.2: the sampler and Yoshimi sum into the one
  // capture, so this page starting the sampler never stops Yoshimi for somebody
  // else, and remote/000 starting Yoshimi never stops this.
  //
  // RELAY OR DIRECT, ONE PAGE SINCE 2026-10-11 (asked: *"can we combiine 030
  // and 035 with radiobutton of direct/notdirect mode?"*). 035 was this page
  // with `createBoard({ direct: true })` and `goDirect()` on play: two WebRTC
  // data channels to the Pi, signalled through the relay room, `pcm` carrying
  // the sound back and `ctl` the keys out, the relay kept for presence and as
  // the fallback (plans/plan-away-webrtc.md, rig/board/rtc.mjs). MEASURED on
  // /away/, laptop and Pi on one network: round trip 4 ms against ~72 over the
  // relay, key to speakers ~48 ms against ~175. `?path=direct` opens on direct;
  // /concepts/sampler/035/ redirects here with it. A change of mode while
  // playing stops, makes a new board for the new mode and plays again.
  //
  // NOTHING OPENS ON A VISIT. The board (and so the relay socket) is made on the
  // play press, never at load. A check run sends nothing to the shared board
  // unless ?board=1 is added, the same gate remote/000 and /knobs/ use.
````

<a id="remote-36"></a>
## remote-36: demo/remote/piano/index.html, inline script, line 58

````js
    // The lag cells under the title and the log alone at the foot, asked
    // 2026-10-11: *"move readout to top of page below title in 030 and 035"*.
````

<a id="remote-37"></a>
## remote-37: demo/remote/piano/index.html, inline script, line 137

````js
  // ── the lags: what came back, against when the key went down ────────────
  // Asked 2026-10-11: *"add scrope to 030 samper with lags etc"*, and the scope
  // taken out again the same day (*"rm lag scope"*), so the readout cells are
  // what is left. Key to sound is measured
  // per press: the first 1 ms block after the press that is over ONSET and
  // three times what the 30 ms before it held, on the speaker's clock
  // (`getOutputTimestamp`, so the browser's own output latency is inside it).
  // The other cells are the parts this page can name: the Pi's round trip, the
  // playout cushion, the browser's output latency, and the path. What is left
  // over is the Pi's capture block and frame (JACK 512 x 3 at 48 kHz, 20 ms
  // frames), which the page cannot see on its own.
````

<a id="remote-38"></a>
## remote-38: demo/remote/piano/index.html, inline script, line 191

````js
  // Four cells, asked 2026-10-11: *"reduce readouts 30 35 to 4 items. keep
  // relevant ones"*.
````

<a id="remote-39"></a>
## remote-39: demo/remote/piano/index.html, inline script, line 258

````js
  // 🔴 THE LINKS SAY WHICH WIRE CARRIES THEM, and the patchbay draws that
  // (asked on 035: *"webrtc shuld be link"*). When the board's path changes,
  // every link between this page and the Pi is made again with `via`:
  // `datachannel` while direct (or through TURN), `relay` otherwise. The R2
  // file links are not the board's wire.
````

<a id="remote-40"></a>
## remote-40: demo/remote/piano/index.html, inline script, line 323

````js
        // `direct` sweeps while it is connecting, and the choice moves to
        // `relay` when it falls back. Asked 2026-10-12, on a screenshot with
        // direct lit and the path reading relay: show direct as connecting
        // until it is up, light relay if it falls back.
````


<a id="live"></a>

## /remote/live/: Ableton Live on the studio Mac (2026-10-22)

The `/remote/piano/` pattern pointed at the Mac: `createBoard({ room: 'm1-1' })`, the agent in
`rig/m1/studio-agent.mjs` answering the board's wire, Live's ports from `macGraph`. Tempo and Live's own play are a
`web:transport:value-out` linked to `m1:live:value-in` (`{ of: 'param' }`, so a knob can link to it). Opening Live and
loading an instrument are signed with the studio key, taken from `?key=` once into localStorage and stripped from the
address. Relay or direct (`?path=direct`), as `/remote/piano/`; the agent answers `rtc.offer` since the same evening (`lessons/rig-m1.md#studio-direct`): key to sound 174 ms direct through TURN.

MEASURED 2026-10-22 headless against the Mac, notes sent along the bay: key to sound 353 to 455 ms (relay round trip
84 ms, cushion 160 ms, Live's own 13.7 ms output latency), 720 frames, 0 lost; tempo 97 set from the port and read
back from Live.

Tempo was a knob for one evening and came out (*"tempo not affecting much"*): nothing on the page plays clips and
Drift's LFO runs free in Hz, so tempo moved nothing audible. The knobs are the loaded instrument's own parameters
now (`live.params` lists them, `live.param` sets one by index in Live's own range), four chosen by name per
instrument: Drift filter, resonance, release, detune; Grand Piano bright, tone, reverb, release. MEASURED: a held
note at level 0.343 with the filter open, 0.094 closed from the knob's port.

Every knob has an invisible hand (`createKnob({ hand: true })`, no `step`: 127 steps is too few for a hand). Its moves
go through the kit's send gate, `makeCcSend` (`demo/shell/cc-adapter.mjs`), keyed by the knob's slot, not by Live's
parameter index (the gate treats controllers 64 to 69 as switches, and Drift's Volume is index 64). The page maps slot
to index; the Mac maps 0 to 127 onto the parameter's range as `live.params` read it. MEASURED 2026-10-22 in the room:
idle 0 messages, one hand 165 in 5 s, four hands 163 in 5 s carrying 642 values. More hands, same message rate.
