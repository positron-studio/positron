# plan-studio-mac: the M1 as a site in the patchbay, its apps as nodes: OBS and a new Ableton Live control

Status (2026-10-22 night): step 1 and step 3 built and running on the Mac (site `m1`, room `m1-1`); the old agent removed. The owner's decisions on §7: Start m1 streams the current OBS scene; a new studio key; Live 11; the agent opens Live; a new `/remote/live/` page. Room `m1-1`, not `studio-1`: the Pi's and the Mac's sound frames must not share a socket. Asked: *"can the room trigger obs"*, *"assuming its running"*, then
*"actually plan that remote app control together with new version of ableton live control"*.

Tags: **READ** (code or a document), **MEASURED** (where the number lives), **INFERRED** (reasoned, not checked).

## 0. The answer

One agent on the studio Mac (`ssh mbp`, an M1 Pro), `rig/m1/studio-agent.mjs`, replaces today's `live-agent.mjs`. It
joins the relay as **site `m1`** the way the Pi joins as `pi-1`, and announces a graph built by one shared function
(`m1Graph()` beside `boardGraph()` in `demo/shell/graph-registry.mjs`), so the agent and every page agree on port
names. Its apps are nodes:

- **`m1:encoder`** (OBS): a page in a video room asks it to stream into that room; it drives OBS over obs-websocket on
  `localhost:4455` and streams to the room's WHIP URL. The picture reaches the stage as it does today.
- **`m1:live`** (Ableton Live): notes in, Live's sound out, transport and tempo in and out, instrument load, through
  the pieces that already work (`midisend`, the Core Audio tap `audiotap`, AbletonOSC).
- **`m1:apps`**: which of the two is running, and opening one that is not.

Anything that starts something on the Mac (open an app, stream, load an instrument) needs the owner's key, checked by
the agent. Playing notes into Live does not, as today on `/able/` and on the Pi.

## 1. What exists (MEASURED over ssh 2026-10-22 unless marked)

- The Mac: Apple M1 Pro, macOS 26.6.2, `/opt/homebrew/bin/node` v24.20.0, reachable as `ssh mbp` from this laptop.
- **OBS 32.2.2**, obs-websocket enabled on 4455 with a password in its own config. Driven today from here over ssh:
  WHIP into a room, own profile and scene collection, the owner's put back (`plans/plan-room-obs.md`,
  `lessons/kit-participant.md#live-input`). A Homebrew update put it behind macOS's first-launch prompt once; the
  owner clicked Open.
- **Ableton Live 11 Standard**, AbletonOSC installed as a control surface (READ `plans/plan-rack.md` §0: stored in
  Live's Preferences, survives a reboot).
- **`rack-agent` still runs** (launchd `studio.positron.rack-agent`, pid 778): `live-agent.mjs --room m1-1`, the
  pre-patchbay protocol. No page addresses `m1-1` since `/able/` was archived on 2026-09-25 (positron-hardware).
- What the rack measured (2026-09-12, `rig/m1/README.md`): Live played from a browser, 15/15; Live's sound back
  through the tap at -5.3 dBFS, 0 of 801 frames dropped, 50 frames a second, agent 4.2 % of a core; key to ear 58 ms
  on the parked WebRTC rig. No BlackHole, no Multi-Output Device: the tap copies Live's output.
- What never had an API (READ `plans/plan-rack.md` §0): Live's audio output device. The tap makes it irrelevant.

## 2. The agent

- `rig/m1/studio-agent.mjs`, a LaunchAgent (`studio.positron.studio-agent.plist`), because the tap and OBS need the
  owner's GUI session, and `node` by full path (launchd's PATH has none). It replaces `rack-agent`, which is
  unloaded, not deleted, until the new one has played Live once.
- **Room: `studio-1`**, where `pi-1` already is (`STUDIO_ROOM` in `bay-node.mjs`), so a page that plays the Pi sees the
  Mac too. A video room is a different relay room: the stage page opens a second socket to `studio-1` only to reach
  `m1` (§4).
- **The key.** The owner's key lives in a file on the Mac (`~/.positron/studio-key`, mode 600) and in the owner's
  browser (`?key=` once, then localStorage), never in page source. A command that starts something carries
  `HMAC(key, command + room + time)`; the agent refuses one older than 30 s or not signed. INFERRED that a 30 s window
  covers a slow relay; a replayed command inside it can only repeat itself.
- It reports in the graph: OBS running or not, streaming where; Live running or not, tempo, playing.

## 3. `m1:encoder`, OBS from a room

- Ports: `value-in` (start, stop, with the room and the signature), `value-out` (state: idle, starting, live in
  <room>, failed with why), `video-out` and `audio-out` (`whip`, `sfu`), as the catalogue's `encoder` already has.
- Start: the agent reads `GET sfu.positron.studio/room/<room>/live` for the WHIP URL (the URL is the room's key, §2 of
  plan-room-obs), switches OBS to its profile `positron-whip` (2 s keyframes, hardware H.264, 3000 kbit/s), sets WHIP
  with `?site=m1`, Start Streaming. Stop: Stop Streaming, the owner's profile back.
- **What it streams is the owner's choice and the open question (§7)**: the current OBS scene (a camera, a screen, Live
  through OBS's application audio capture), or the `positron-test` scene with the film.
- One room at a time (*"one live"*): a start into another room stops the first.
- If OBS is not running: `m1:apps` opens it (`open -a OBS`) when the command is signed; a first-launch prompt after a
  Homebrew update stops it there and the state says so (the agent sees OBS running with no port 4455 after 20 s).

## 4. The stage page

- With the owner's key in localStorage, `/room/stage/` also joins `studio-1` (read only, plus the one command) and
  shows **Start m1** beside the WHIP URL while `m1` is online and OBS is idle; **Stop m1** while it streams there.
- Without the key nothing changes: the WHIP URL is still there for any OBS anywhere.
- The patchbay draws the control link `<tab>:stage:value-out -> m1:encoder:value-in` (relay) beside the picture links
  that are drawn today.

## 5. `m1:live`, the new Ableton Live control

What is new against `/able/`: Live becomes a set of ports on a site, so any concept page links to it the way the remote
pages link to `pi-1`, and the page grows transport and instrument choice, which `/able/` never had.

- `midi-in`: notes, CC and pitch bend to IAC Bus 1 through `midisend` (held open, as now). `accepts: ['note', 'cc']`.
- `audio-out`: the tap's PCM, 48 kHz, `shape { rate, channels, frameMs }` declared on the port (the channel count is
  never inferred, `rig/m1/README.md`), over the relay or the direct `datachannel` path that the remote pages offer
  (`demo/remote/path.mjs`).
- `value-in`: play, stop, tempo, metronome, arm a track, load an instrument by name (AbletonOSC plus
  `abletonosc-ext/browser.py`). Loading needs the key (it changes the owner's set).
- `value-out`: tempo, playing, beat (AbletonOSC listeners), so a page shows Live's transport.
- `clock-out`: INFERRED from AbletonOSC's beat listener; its jitter is to be measured before a page syncs to it.
- **A page: https://positron.studio/remote/live/** (slug `live`, one word), the `/remote/` group's layout: keys,
  transport row (play, stop, tempo knob), instrument picker, the readout (round trip, frames dropped), the patchbay.
  Nothing is opened on load; Play asks for the sound.

## 6. Steps, in order (each one deployed and reported before the next)

1. `m1Graph()` and the agent skeleton on the Mac: joins `studio-1` as `m1`, announces the graph, the key check, the
   LaunchAgent. Test: `node rig/board/ask.mjs --room studio-1`-style question answered; a bad signature refused.
2. `m1:encoder` and the stage page's Start m1 / Stop m1. Test: the 3-tab harness in a fresh room, started from a page,
   not over ssh; then the owner presses it from a phone.
3. `m1:live` notes and sound (the rack's two pieces, moved), `rack-agent` unloaded. Test: a note in, the tap's level
   out, frames dropped counted, key to ear measured over relay and datachannel.
4. `m1:live` transport, tempo, instrument load, beat out; the page `/remote/live/`. Test: tempo set from the page reads
   back from Live; an instrument loads; a 10 minute run with 0 dropped frames.
5. Optional: Live's sound into the stage through OBS (application audio capture of Live in the OBS scene), so a
   performance in Live reaches a video room; or Live 12.4's Link Audio if the owner upgrades (READ plan-rack §3.5).

Time box: steps 1 and 2 one sitting (about three hours), 3 and 4 another. Stop and report if the tap or AbletonOSC
answers differently from 2026-09-12.

## 7. Open questions for the owner

- What does Start m1 stream: the current OBS scene (whatever the owner set up) or the fixed test scene?
- The key: a new one for the studio, or the cast's `CAST_KEY`? (A new one keeps the cast's key off the Mac.)
- Ableton: stay on Live 11 Standard, or upgrade to 12 (Link Audio, newer Python for AbletonOSC)? The plan works on 11.
- Should the agent open Live as well as OBS, or only report it?
- `/remote/live/` as the page, or Live controls on an existing page (`/remote/piano/` already plays the Pi)?

## 8. Not in this plan

Recording (the brief's rule: nothing records), screen sharing of the Mac (that is OBS's scene), and any control of
the owner's other apps.

## 9. The owner's Mosaiik remote script (removed 2026-10-22, kept here as the record)

Asked: *"Rm mosaiik script"*, *"Archive mosaiik script knowledge to plan"*. The script was the owner's own Python, a
Live control surface installed INSIDE the app bundle (`Ableton Live 11 Standard.app/Contents/App-Resources/MIDI Remote
Scripts/Mosaiik/__init__.py`, 287 lines, dated 2025-11-24), selected in slot 1 with input MK-425C. Moved out to
`~/.positron/removed/Mosaiik-remote-script/` on the Mac, not deleted.

What it did: a looper-style grid driven from keys. It forwarded six notes on all 16 channels to itself
(`Live.MidiMap.forward_midi_note`), so those notes never reached a track:

| note | did |
| --- | --- |
| C4 60 | previous track: unarm the current one, select and arm the new one, highlight the slot in the current scene |
| D4 62 | next track, the same |
| F4 65 | scene up, highlight the slot |
| G4 67 | scene down, highlight the slot |
| A4 69 | on the highlighted slot: empty, stop every other row and record a new clip named `<column letter> <row>` (A 1, B 3); recording, finish and play; playing, stop; stopped, stop every other row and play |
| A3 57 | delete the clip in the highlighted slot |

Why it mattered here: the agent's test chord was C E G (60 64 67), so two of three notes were Mosaiik commands and
moved the arm off the Drift track. Remote-script grids like this are what `m1:live`'s `value-in` could offer as
patchbay controls (track, scene, record cell) instead of reserved notes.
