---
name: positron-hardware
description: The Raspberry Pi board (site pi-1 in room studio-1, its graph and ports), the Ableton rig, Yoshimi (retired from the board 2026-10-13), the Novation Circuit and its consent (accepts and never on its midi-in), MIDI and audio capture on this desk. Load before touching anything under rig/, before a page that plays or records real hardware (the remote concepts), and before any claim about what an instrument does.
metadata:
  internal: true
---

# The machines on and off this desk

Every number here was measured on the hardware named, not read out of a
manual. Where a claim came from a document rather than from the desk, it says
so.

## The hardware as the patchbay sees it

Reread 2026-10-14. Every machine on this desk reaches a page the same way: it
is a SITE that announces a graph of nodes and ports into a relay room, and a
page links to its ports like to any other. Checked against the tree that day:

- **The Raspberry Pi is site `pi-1` in room `studio-1`.** `BOARD_SITE = 'pi-1'`
  in `demo/shell/graph-registry.mjs`, `STUDIO_ROOM = 'studio-1'` in
  `demo/shell/bay-node.mjs`. `boardGraph()` (graph-registry.mjs) is the one
  function that describes the board as nodes and ports, imported by the board
  itself (`rig/board/board.mjs`, `jack.mjs`) and by its stand-in
  `demo/fake-board.mjs`, so the Pi and what a page is tested against cannot
  disagree about a port's name. Ports are `<medium>-<dir>` (`pi-1:circuit:midi-in`), renamed from
  site `studio-1` on 2026-10-10/11 (`HANDOFF.md` session 74).
- 🔴 **THE CIRCUIT'S CONSENT IS A PORT FIELD, NOT A HABIT.** `boardGraph`
  gives a hardware instrument's `midi-in` `accepts: ['note', 'cc', 'program']`
  and `never: ['sysex']`, and the bay refuses a link that would carry a class
  the port does not accept. It is the bay's one load bearing idea
  (`demo/shell/bay.mjs` header, `plans/plan-patchbay.md` §2.1): a SHAPE says
  *I can parse this*, an `accepts` list says *I consent to this*. The board's
  own SysEx gate (below, and `HANDOFF.md` session 74) is the second lock: it
  allows exactly the Circuit Current Patch Dump Request and the Device Inquiry.
- **A link between two Pi audio ports is a JACK connection.** `rig/board/jack.mjs`
  plans and applies them from bay links (`jackRows()` in graph-registry.mjs).
- **Audio from the board is a HEAVY link** (`shape: { rate: 48000, channels: 1,
  frameMs }`, transports `relay` or `datachannel`): the bay negotiates it and
  the board streams it, which is why the channel count rule below is a SHAPE
  declared on the port and checked at connect time.
- **The pages that play the Pi today** are the remote concepts:
  https://positron.studio/remote/circuit/, https://positron.studio/remote/collide/,
  https://positron.studio/remote/piano/, https://positron.studio/drums/remote/ and
  https://positron.studio/shader/remote/ (`ls demo/remote demo/drums/remote
  demo/shader/remote`). `/knobs/`, `/grains/` and `/keys/` named below are gone
  (`positron-history`).

## Finding the box, and where its code actually lives

**Ask port 22, not ARP and not mDNS.** `positron-board.local` does not resolve
from this sandbox (mDNS is multicast UDP), a ping sweep answers nothing useful,
and guessing Raspberry Pi MAC prefixes in `arp -an` missed it outright — the
board was there the whole time. One line finds it in about a minute:

```sh
for i in $(seq 1 254); do (nc -z -G 1 -w 1 <lan-prefix>.$i 22 2>/dev/null && echo <lan-prefix>.$i) & done; wait
ssh <user>@<pi> hostname -s              # it answers the board's hostname
```

It also answers over the relay from any network — `node rig/board/ask.mjs --room
studio-1 audio.status` — so **"I cannot ssh to it" is never the same as "it is
down"**, and saying the second because of the first is wrong. Ask the relay
first; it needs no LAN.

⚠️ **The service runs from `/opt/positron-board/`, NOT from `~/positron/`.**
`provision.sh` unpacks into `~/positron` and `setup.sh` copies that to
`/opt/positron-board`, which is what `positron-board.service` executes. The copy in
`~/positron` on the board is stale — it has no `pappus.mjs` at all — so editing
or checking it tells you nothing about what is running. Compare `md5sum` against
`/opt/positron-board/rig/board/` before believing a deploy landed.

## The instruments

- 🔴 **THE CIRCUIT SHIPS WITH `Save` DISABLED, AND THAT IS A PROTECTION RATHER
  THAN A FAULT. 📄 DOCUMENTED, NOT MEASURED ON THIS DESK.** Circuit User Guide
  v1.6 page 18, verified verbatim 2026-09-21 against the copy at
  `~/Downloads/Files/2025-01/circuit-ug-en-03-v1-6.pdf`: *"The Save function is
  deliberately disabled before shipping from the factory to prevent accidental
  erasure of the demo Sessions. The Save button will initially be unlit, and
  before you can save any Sessions of your own, you will need to unlock the Save
  function. To do this, hold down the Shift and Save buttons together while
  powering Circuit on."*
  ⚠️ **WHETHER THIS DESK'S UNIT HAS IT LOCKED OR UNLOCKED IS UNKNOWN HERE.**
  Nobody has looked at whether that button is lit, and this entry is a fact about
  the model rather than about the instrument in the room. The check costs nothing
  and needs no computer: **is the Save button lit blue**.
  🔴 **SO THE SYMPTOM TO RECOGNISE IS A SAVE THAT SILENTLY SELECTS.** 📄 The
  guide says a working save *blinks green rapidly*; with Save inert a pad press
  in Sessions View is an ordinary session SELECT, which loads the stored session
  over whatever is being worked on. **It looks like the instrument throwing work
  away and it is the instrument refusing to write.**
  🔴 **AND UNLOCKING IT COSTS A POWER CYCLE, WHICH DISCARDS THE UNSAVED WORK
  THAT PROMPTED THE UNLOCKING.** 📄 The same page says `Clear Session` is
  disabled alongside it, so both come back together on a box holding **the
  owner's sessions of real work**, which a factory reset would not bring back (the
  Circuit HAS a factory reset; this line said *"no factory reset"* until
  2026-10-14, corrected per CLAUDE.md's 2026-10-03 note). ⚖️ **Whether Novation Components
  can export the LIVE session out of RAM or only what is in flash is UNMEASURED
  and worth knowing before anybody power cycles anything.** Take a fresh pack
  first either way: reading is free, the backup is dated 2026-09-20 (since
  2026-09-24 it is in the owner's private pack repository, not in this one,
  CLAUDE.md), and a diff against it says which sessions have moved since.


- 🔴 **`/able/` WAS RETIRED ON 2026-09-25 AND THE ENTRY BELOW IS KEPT
  RATHER THAN DELETED, BECAUSE THE RIG IT DESCRIBES STILL RUNS.** Instructed:
  *"arhcive able demo and rm from index"*. The page is at
  `archive/demos/able-index.html`, its manifest row is gone, and
  **<https://positron.studio/able/> is a 404**. Nothing under `rig/` was
  touched, so `rig/m1/live-agent.mjs`, `rig/m1/pace-agent.mjs` and the Core
  Audio tap all still work exactly as described. ⚠️ **AND NO LIVE PAGE
  ADDRESSES `m1-1` ANY MORE**, so the agent on that Mac has nothing in a browser
  left to answer. ⚠️ `rig/m1/README.md` and `rig/m1/pace-agent.mjs`
  still PRINT `/able/` URLs, one of them on every start, and that is recorded in
  `BACKLOG.md` rather than repaired.
- **`rack` played Ableton Live from a browser and it WAS live (2026-09-12).**
  <https://positron.studio/able/> (**a 404 since 2026-09-25, see above**), 15/15. A note number crosses the relay,
  `rig/m1/live-agent.mjs` hands it to Live over CoreMIDI, and a **Core Audio
  process tap** sends a copy of what Live renders back down the same socket —
  so Live keeps playing out of its own speakers while the page hears it too.
  `/keys/` is the SAME PAGE pointed at a Raspberry Pi. **No BlackHole, no
  Multi-Output Device, no Live Preferences click** — the tap removes the one
  requirement the Live Object Model could not script, which is what parked the
  old rig. It stays up by itself via `studio.positron.rack-agent.plist`
  (a LaunchAGENT — TCC grants need a GUI session, a daemon would get silence
  that reads as success). MEASURED: silence 0.00000, keys down **-5.3 dBFS**,
  0 dropped of 801, 50 frames/s at 1541 kbit/s stereo, agent 4.2% of one core.
  ⚠️ **The old "a capture started over ssh is deaf" rule does NOT apply here** —
  that was `ffmpeg -f avfoundation`, whose TCC subject is the terminal;
  `audiotap` disclaims responsibility and is its own subject, measured working
  from an ssh-started process.
- 🔴 **YOSHIMI IS NOT ON THE BOARD SINCE 2026-10-13.** Retired that day on
  *"discard yoshimi. with possiblity to do dual setup in future"*: packages
  purged on the Pi, `rig/board/yoshimi.mjs` and the four measuring tests
  (`yoshimi-test`, `cc-test`, `wobble-test`, `note-test`) moved to
  `archive/yoshimi/`, `/knobs/` and `/grains/` to `archive/demos/`.
  `archive/yoshimi/README.md` says what went where and how to bring it back,
  alone or as a Pi and browser pair. The board has NO JACK instrument now:
  `audio.start` needs a named source (`sampler`, `collide`, `synth`), and the
  granulator (`fx.pappus`) refuses because it wraps only the instrument slot,
  which the sampler and the Circuit are not. The entry below is the record of
  the instrument while it was here, and its controller map is what a returning
  Yoshimi (or the browser build in `research/yoshimi-wasm-2026-10-13.md`) still
  answers. The tests it names are in `archive/yoshimi/` and import
  `./measure.mjs`, so they run only once moved back to `rig/board/`.
- The controller map Yoshimi answered while it was here (and would answer
  again) is in `## Retired` at the end of this file, verbatim.
- 🔴 **A CHANNEL COUNT CANNOT BE INFERRED FROM A PAYLOAD.** 960 int16s is a
  valid 20 ms mono frame AND a valid 10 ms stereo one; guessing wrong plays an
  octave down, which sounds like a broken instrument rather than a broken
  header. The Mac sends stereo, the board sends mono, **both are on the relay at
  once**. Senders declare `audioChannels` AND `frameMs`; receivers CHECK one
  against the other (`samples / channels / rate` must equal `frameMs`).
  ⚠️ Not `channels` — `board.mjs` has that and it means MIDI channels.
  (2026-10-14: in the patchbay the same pair is the port's declared `shape`,
  `{ rate, channels, frameMs }` in `boardGraph`, checked by the bay when a link
  is made rather than when a frame plays.)
  And **a measurement outranks a repeated claim**: proved by shipping a liar,
  which exposed the page correcting itself and then being un-corrected by the
  next status reply repeating the same wrong number.
- 🔴 **A bit-clean stream can still sound broken, and the cushion is where.**
  `pcm-playout` (the worklet in `demo/shell/board.mjs`) trimmed 15 ms of audio mid-note on ordinary jitter — floor
  60 ms, slack 15 ms, frames arriving in 20 ms lumps, so ONE early frame tripped
  it. The samples measured identical to the source (same pitch, same peak, zero
  discontinuities) and the suite was green the whole time, because the defect is
  downstream of every quantity being measured. Slack now follows the frame size
  the worklet OBSERVES. **Every stage that can discard data needs a counter a
  page actually displays** — these counters existed, posted every 250 ms, and
  no page had ever read one.
- **The Ableton rig is PARKED (2026-09-11) and it is parked working — 11/11.**
  Not broken, too heavy: six things must be true before a note sounds and
  **four are Preferences clicks with no API**, including Live's audio output
  device, which the Live Object Model cannot set. A capture started over ssh is
  deaf, so its relay agent must live in a login session — the box is a service
  that dials out on boot, this is a performance instrument you wake on purpose.
  `rig/m1/README.md` has the measurements, the two traps and the
  revisit order. `/able/` reported silence AS silence, which is the behaviour to
  preserve if it ever comes back.
- **An avfoundation device INDEX is a shared mutable global, exactly like a
  fixed port.** `ffmpeg -f avfoundation -i ":0"` meant the microphone when
  `rig/m1/README.md` was written and means **BlackHole** today —
  and both read **-91.0 dB**, where one reading proves "this capture is deaf"
  and the other proves "nothing is playing", which are opposite conclusions
  from an identical number. The README's own deafness control had been
  measuring the wrong device. Resolve by NAME from
  `-list_devices true` every time; `rig/m1/live-check.mjs` does.

## From the handoffs (extracted 2026-10-19)

### The Pi's outputs, measured

- **Sound out**: PWM through `alsa_out` THD 0.18 %, 3 cents flat and drifting, 62 ms round trip; HDMI-A-2 through an audio extractor THD 0.07 %, steady pitch, 38 ms, but 25 dB more 50/150 Hz hum. Leave the extractor's switch on 2.1. (`HANDOFF.md, session 80 (2026-10-16)`)
- **HDMI (`hdmi-scan`)**: camera 24 to 29.5 fps, the OLED mirror 23.8 fps at 15x, 1.6 % of a core. (`HANDOFF.md, session 80 (2026-10-16)`)

### The Circuit, the Fast Track Pro and the keyboard

- **Record off on the Circuit before any page plays it**: notes into an armed Circuit get recorded. (`HANDOFF.md, session 79 (2026-10-15)`)
- **The Circuit's MIDI port drops pitch bend and mod wheel; program change passes.** Its MIDI is its own USB card, not through the Fast Track Pro. (`HANDOFF.md, session 79 (2026-10-15)`, `session 71 (2026-10-09)`)
- **The board reads before it writes SysEx**, or snd-usb-audio drops the reply. (`HANDOFF.md, session 74 (2026-10-11)`)
- **A raw MIDI fd and an ALSA sequencer subscription cannot share the Circuit**: raw first, `aconnect` is refused; subscription first, a blocking write open hangs (`O_NONBLOCK` gives `EBUSY` in 0 ms). A kernel ALSA route would also bypass the `inputs.mjs` gate, so routes into a gated device run in userspace. (`HANDOFF.md, session 61 (2026-10-03)`, `session 60 (2026-10-03)`)
- **Fast Track Pro**: Linux switches it to config #2 (card `Pro`, 16 bit stereo capture, no ALSA mixer controls). `arecord -c 1` fails with `Channels count non available`, so open stereo and keep one channel. A power cycle cured 8 bit samples once. (`HANDOFF.md, the Circuit on the Pi thread (2026-09-30)`, `session 74 (2026-10-11)`)
- **ALSA period 480 frames in a 1920 buffer**; the default 6000 in 24000 delivered 125 ms lumps. (`HANDOFF.md, the Circuit on the Pi thread (2026-09-30)`)
- **Noise floor**: JACK on the Fast Track Pro about -80 dBFS (the same as arecord); duplex -74 dBFS RMS, 0 xruns. (`HANDOFF.md, session 74 (2026-10-11)`, `session 79 (2026-10-15)`)
- **Find a USB device by name, never by card number**: the MK-425C moved from card 6 to 7. CoreMIDI names it `MK-425C USB MIDI Keyboard`, so match `/mk-?4\d\dc|evolution/i`. It reads a semitone flat (47 to 71). (`HANDOFF.md, session 79 (2026-10-15)`, `session 54 (2026-09-28)`)
- **The MK-425C scans its sustain pedal every 65.95 ms; its keys are timed to about 1 ms.** A 150 ms start lookback caught opening chords 13 to 139 ms early. (`HANDOFF.md, session 75 (2026-10-11)`)
- **A hold-to-clear on a sustain pedal fights how a pianist holds one**: 1 s cleared ten loops by accident; 3 s with no note during the hold cleared none. (`HANDOFF.md, session 75 (2026-10-11)`)
- **Circuit samples (`circuit-sample.mjs`)**: count frames from the derived block align, never the declared one (a smaller declared one overran the `DataView`); keep `SLOT_DEPTHS` at `[16]`, apart from the decoder's depths, or the slot walker finds tables in noise. (`HANDOFF.md, session 53 (2026-09-28)`)

### The board

- **The board has one audio slot shared by every page**; `audio.start` replaces it. Inputs (`inputs.mjs`) are separate. (`HANDOFF.md, the Circuit on the Pi thread (2026-09-30)`)
- **The harness cannot drive the board**: `createBoard` refuses every send under `?selfcheck=1`, so frame asserts fire only while somebody else holds the lease. (`HANDOFF.md, the Circuit on the Pi thread (2026-09-30)`)
- **Mute a board page by disconnecting the playout**; suspending the AudioContext makes `board.mjs` log "tap anywhere". (`HANDOFF.md, the Circuit on the Pi thread (2026-09-30)`)
- **Pi sequencer**: step times from a bar origin, a late step is skipped and never sent late; timer p50 0.67 ms, worst 1.31 ms. (`HANDOFF.md, session 79 (2026-10-15)`)
- **Pi piano**: direct round trip 3.3 ms. The same scsynth sampler in the tab costs 1.8 MB and about 1 s more to the first note, and the first key blocks the main thread about 158 ms. (`HANDOFF.md, session 75 (2026-10-11)`)
- **`rig/board/push.sh` ships only the `demo/shell` files a `rig/board/*.mjs` imports directly**, not imports of imports, and it needs the LAN. (`HANDOFF.md, session 60 (2026-10-03)`)
- **The VPN routes the LAN into its tunnel**: ping and ssh to the Pi fail even bound to `en0`, while pages still reach it over the relay. (`HANDOFF.md, session 58 (2026-09-30)`)
- **`pkill -f` over ssh matches its own command**; use `pgrep -x` and `/proc/<pid>/fd`. (`HANDOFF.md, session 61 (2026-10-03)`)

### Native code, routing and the rack Mac

- **Nothing native is compiled on this Mac (ThreatLocker)**: build C in a `gcc:14` container under OrbStack, as `rig/route-core/test.sh` does. (`HANDOFF.md, session 61 (2026-10-03)`)
- **Route-core velocity**: a float times `Math.round` rounds ties wrong (`45 * 0.7` gives 31); scale in exact thousandths. (`HANDOFF.md, session 61 (2026-10-03)`)
- **RaspiMIDIHub's 1 to 3 ms times only its own Python call**; nobody publishes wire latency for a Pi MIDI router. (`HANDOFF.md, session 60 (2026-10-03)`)
- **Do not rebuild `audiotap` for a comment-only change**: its TCC grant is keyed to the absolute path and the cdhash, and a refused tap emits clocked silence that every layer reports as success. (`HANDOFF.md, session 50 (2026-09-25)`)

### The Pico 2 W

- **Every Pico number so far is the RP2040 emulator, a Linux build of the same C, or a link map**; the real board had run nothing as of 2026-10-04. (`HANDOFF.md, session 62 (2026-10-04)`)
- **Power goes into VBUS (pin 40), not VSYS**, while its only USB socket is a host: 5 V on VBUS also reaches the hub, which many self-powered hubs need. Read from docs, untried. This supersedes session 61's "power on VSYS while the socket is a host". (`HANDOFF.md, session 63 (2026-10-05)`)
- **Pico to a hub's USB-B socket**: an OTG adapter (micro plug, USB-A socket), then a printer cable A to B. With an MB102 module, set an adjustable brick to 9 V, 5.5x2.1, centre positive, before plugging in. (`HANDOFF.md, session 63 (2026-10-05)`)


## The owner's corrections (from sessions 2026-09-29 to 10-19)

- No labels on a device screen (*"no labels on pi sceen"*), and square pixels on the 1-bit screen (*"do not round"*).
- A parts list holds only what blocks work, cheapest first, solderless (*"I can nit solder"*, *"tight budget"*).

## Retired

### Yoshimi's controller map, retired from the board 2026-10-13

Moved here verbatim on 2026-10-14. Reason: Yoshimi was purged from the Pi on
2026-10-13 (*"discard yoshimi. with possiblity to do dual setup in future"*,
`archive/yoshimi/README.md`), so no page reaches it and the tests named below
(`wobble-test.mjs`, `cc-test.mjs`) are in `archive/yoshimi/` and run only once
moved back to `rig/board/`. It is kept because it is what a returning Yoshimi,
or the browser build in `research/yoshimi-wasm-2026-10-13.md`, still answers,
and because the lesson about measuring the wrong quantity is general.
`/knobs/`, named in it, is a 404 since 2026-10-13
(`archive/demos/knobs-index.html`).

- 🔴 **YOSHIMI DOES NOT USE THE GENERAL MIDI CONTROLLER MAP, AND ASKING IT FOR A
  VIBRATO GETS A SLIDER THAT DOES NOTHING.** In General MIDI, 76 and 77 are
  vibrato rate and depth. In the ZynAddSubFX family they are **FM amplitude** and
  **resonance centre**, and the rest of the extended set is 71 filter Q, 74
  filter cutoff, 75 bandwidth, 78 resonance bandwidth. MEASURED 2026-09-16 with
  `node rig/board/wobble-test.mjs`, one note held throughout and every controller
  read twice at one value first: CC 76, CC 77 and the mod wheel move the pitch
  by **0.2 cents** at every value, which is the tracker's own noise.
  ⚠️ **THAT WAS FIRST WRITTEN AS "THERE IS NO VIBRATO ON THIS INSTRUMENT" AND
  THAT WAS WRONG, TWICE OVER.** Challenged 2026-09-17 with *"Sure there is no
  lfo?"*, which was the right question. It had been measured on ONE patch, so a
  patch with no LFO configured was being reported as a fact about Yoshimi; and it
  tracked PITCH only, so an amplitude LFO would have read as flat however obvious
  it was to a listener. MEASURED on `Trem Lead` (bank 110, program 8) with a
  level analyser graded on synthetic tremolo first: a real **21 to 25% deep**
  tremolo at about **1 Hz**, and 1.2 cents of pitch wobble against 0.2 on
  `AddSynth Morph`. **THE LFOs ARE THERE.** What is true is the narrower claim:
  no controller reaches one. CC 76, CC 77 and the mod wheel leave that patch's
  tremolo rate and depth inside their own floor, so a slider labelled LFO speed
  still has nothing to drive. What 75 and 76 DO move is large —
  bandwidth takes the beating between partials from 225 cents at 6 Hz to 114
  cents at 0.8 Hz, FM amplitude takes it from 149 cents to 0.2 — so `/knobs/`
  carries those two beside cutoff and resonance.
  ⚠️ **AND `AddSynth Morph` MOVES ON ITS OWN, WHICH BREAKS A HELD-NOTE FLOOR.**
  Two takes at one value, four seconds apart, differ by **0.58 octaves** of
  brightness. A timbre claim about a controller on that patch needs
  `cc-test.mjs`, which re-triggers the note and so resets the morph; a pitch
  claim is safe, because its floor is a fifth of a cent.
  ⚠️ **THE FIRST TWO BUILDS OF THAT TOOL MEASURED THE WRONG QUANTITY AND PASSED
  THEIR FLOOR PERFECTLY.** A vibrato is a pitch wobble and both early builds
  measured LEVEL: one saturated its crossing counter and reported 19.15 Hz to
  four figures about every controller at every value, the next read **0.85 Hz
  for a 2.0 Hz drive**. A floor proves an instrument does not invent movement.
  Only a KNOWN signal proves it can see any, which is why that file grades its
  analyser on synthetic tones before it says a word about the board.
