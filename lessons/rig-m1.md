# rig-m1

Comments cut from the code on 2026-10-14 and kept here verbatim, so the code can say in one to three lines what it cannot say itself. Each `why:` pointer in the code names one heading below.

## `rig/m1/abletonosc-ext/browser.py`

### abletonosc-browser

Above `from typing import Optional, Tuple`, lines 1 to 20 before the cut.

~~~python
# AbletonOSC handler for Live's BROWSER — the one thing AbletonOSC does not
# expose and the one thing a remote instrument needs: a track with no device on
# it makes no sound however well the MIDI arrives.
#
# Live's LOM does have it (Live 10+): application.browser.instruments is a tree
# of BrowserItem, and browser.load_item(item) loads onto the SELECTED track. So
# "load an instrument onto track N" is: select N, find a loadable item, load it.
#
#   /live/browser/roots                       -> every browser root and its size
#   /live/browser/instruments                 -> top-level instrument names
#   /live/browser/find <substring> [limit]    -> loadable items matching
#   /live/browser/load <track_index> <name>   -> select track, load first match
#
# Installed to Live's Remote Scripts and picked up by /live/api/reload.
# REGISTERED FROM view.py, NOT FROM manager.py. /live/api/reload does rebuild the
# handler list -- it calls clear_api() then init_api() -- but it reloads only the
# abletonosc/* modules, and NOT manager.py. So a handler added to manager's list
# needs a Live restart, while one registered from inside an already-reloaded
# module does not. Live refuses AppleScript quit, so "no restart" is the whole
# point.
~~~

### abletonosc-roots

Above `ROOTS = ("instruments", "plugins", "sounds", "drums", "user_library",`, lines 46 to 52 before the cut.

~~~python
# ⚠️ A VST IS NOT UNDER `instruments`, AND SEARCHING ONLY THERE FINDS
# NOTHING WITH NO ERROR. Live's browser has separate roots and third
# party plugins live under `plugins`; `instruments` holds Live's own
# devices. Asking this for "Arturia", "Analog Lab" and "Rhodes" all
# returned empty, which reads as "not installed" and meant "not looked
# for". Every root is searched now and each hit says which one it came
# from, because loading needs to look in the same place.
~~~

### abletonosc-hit

Above `return tuple("%s/%s" % (r, it.name) for r, it in _hits(needle, limit))`, lines 96 to 98 before the cut.

~~~python
# "root/name", so the caller can see WHERE it was found — an Arturia
# patch under `plugins` and a Live preset under `sounds` are
# different things and a bare name hides that.
~~~

## `rig/m1/edge-rtt.mjs`

### edge-rtt

Above `const URL_ = 'wss://ws.positron.studio/room/rttprobe/ws';`, lines 1 to 6 before the cut.

~~~js
// Separate the relay's two costs.
//   ping -> pong  is answered by the WORKER RUNTIME's hibernation autoresponse.
//                 It never wakes the Durable Object, so it is pure network:
//                 this machine to Cloudflare's edge and back.
//   echo          goes through the room's Durable Object and back.
// The difference is the DO. Everything else is geography.
~~~

## `rig/m1/lan-relay.sh`

### lan-relay-header

Above `set -euo pipefail`, lines 2 to 21 before the cut.

~~~sh
# A MoQ relay on the LAN, so the sound stops going to Cloudflare and back.
#
# WHY: measured, the trip to a Cloudflare edge and back is 34.19 ms. On a LAN
# that is the whole cost of the MoQ return path -- transit landed at 37-40 ms
# against a WebRTC cushion of 38-60. A relay in the same room drops transit to
# ~1 ms while KEEPING the thing that makes MoQ worth using: the playout floor is
# ours, so latency is a number we choose rather than one NetEQ imposes.
#
# THE CERTIFICATE IS THE FIDDLY PART, and it is already paid for once
# (rig/moq/RUNBOOK.md §12): a browser will accept a self-signed cert for
# WebTransport via serverCertificateHashes, but Chrome requires
#   * ECDSA P-256, and
#   * validity <= 14 DAYS.
# The repo's old auto.crt is ECDSA and TEN YEARS, which is why it failed. This
# mints a 10-day one and prints the SHA-256 of the DER, which is what the page
# pins.
#
#   ./lan-relay.sh cert     mint a 10-day cert + print the fingerprint
#   ./lan-relay.sh run      run the relay on :4443
#   ./lan-relay.sh print    print the fingerprint of the current cert
~~~

## `rig/m1/launch-synth.mjs`

### launch-synth-header

Above `import { spawn } from 'node:child_process';`, lines 1 to 20 before the cut.

~~~js
// Launch the synth page on the instrument machine with the permissions it needs.
//
// WHY A LAUNCHER, and two traps inside it:
//
//  1. `--use-fake-ui-for-media-devices` DOES NOT WORK -- not headless, and
//     measured here, not headful either. It left Chrome's own bubble sitting on
//     screen as a window ("wants to: Use your microphones") while getUserMedia
//     hung forever. `--auto-accept-camera-and-microphone-capture` is the flag
//     that actually answers it.
//  2. Browser.grantPermissions MUST go to the BROWSER target, from
//     /json/version. Sent to a page target it returns "ok" and does nothing:
//     permission stayed "prompt", and enumerateDevices returned ONE anonymous
//     input where CoreAudio had five. On the browser target the same call gives
//     "granted" and BlackHole appears by name.
//
// The flag alone is not enough either: it auto-accepts each REQUEST without
// persisting a GRANT, and enumerateDevices needs the grant to reveal labels --
// so a device chosen BY NAME is unfindable while audio still records.
//
//   node launch-synth.mjs [--ableton] [--relay <url>] [--relay-for <url>] [--cert <sha256>]
~~~

### launch-synth-open

Above `spawn('open', ['-na', 'Google Chrome', '--args',`, lines 38 to 51 before the cut.

~~~js
// HEADFUL, AND LAUNCHED WITH `open`. Neither is a preference; both were
// measured, and each one alone still gives digital silence.
//
//  · Headless Chrome on macOS has NO working audio input. The track comes back
//    live/unmuted/enabled and reads EXACTLY 0.00000 -- including from the
//    built-in microphone, which cannot be silent in a room.
//  · A GUI app SPAWNED from an ssh session is a child of sshd and runs outside
//    the user's GUI session, so it gets no audio devices either -- the same
//    0.00000, from a headful browser. `open -na` hands the launch to launchd,
//    which puts it in the GUI session where the audio devices live.
//
// Measured on one machine, same page, same flags: mic 0.16897 with sound in the
// room when opened with `open`, 0.00000 when spawned. Every "BlackHole is
// silent" reading before this was the instrument rather than the signal.
~~~

### launch-synth-target

Above `const ver = await (await fetch('http://127.0.0.1:${PORT}/json/version')).json();`, lines 60 to 60 before the cut.

~~~js
// The BROWSER target — /json/version, not a page from /json/list.
~~~

### launch-synth-hold

Above `console.log('\nholding the permission grant open — Ctrl-C to stop the bridge');`, lines 88 to 94 before the cut.

~~~js
// STAY ALIVE. A Browser.grantPermissions grant lives only as long as the CDP
// client holds the connection: exit here and permission drops back to "prompt",
// device labels hide again, and -- the part that cost hours -- the capture the
// page opened during the grant keeps reporting a live, unmuted, enabled track
// that carries DIGITAL SILENCE. A freshly granted capture of the same device
// reads 0.38763 in the same second. So the grant is not a setup step, it is a
// thing to hold.
~~~

## `rig/m1/live-agent.mjs`

### live-agent-header

Above `import { spawn } from 'node:child_process';`, lines 1 to 19 before the cut.

~~~js
// live-agent.mjs — play Ableton Live from a browser.
//
//   node rig/m1/live-agent.mjs --room m1-1
//
// The same shape as `rig/board/board.mjs`, on a different machine: notes arrive over
// the relay, an instrument somewhere else makes the sound, and the samples come
// back down the same socket. The page does not know or care which machine is at
// the far end — `demo/able` and `/keys/` are the same page with a different room.
//
// Two native tools do the actual work, both in ~/positron-rack/bin:
//   midisend  — notes out over CoreMIDI to IAC Driver Bus 1, which Live listens on
//   audiotap  — a copy of what Live is rendering, WITHOUT a loopback device
//
// 🔴 NO BlackHole AND NO Multi-Output DEVICE. A Core Audio process tap takes a
// copy of one process's output while that audio carries on to the speakers, so
// none of the old routing exists: not the virtual cable, not the stacked output
// device, not Live's own output setting — which is the one thing in this rig the
// Live Object Model cannot script. MEASURED: Live holding a chord reads
// -5.2 dBFS through the tap, the same figure the old BlackHole chain reads.
~~~

### live-agent-mono

Above `const CH = Math.min(2, Math.max(1, Number(arg('channels', '1')) || 1));`, lines 30 to 44 before the cut.

~~~js
// 🔴 MONO BY DEFAULT, ON A MEASUREMENT. The argument for stereo was real —
// Live's instruments ARE stereo and the Stage-73's chorus is a width effect
// that summing destroys. It is also not what this rig is currently sending:
// MEASURED 2026-09-12 over two captures off the relay, two different notes,
// **557,760 of 557,760 frames had L and R BIT-IDENTICAL** (max|L-R| = 0). The
// patch in Live is dual mono, so stereo was paying 1.54 Mbit/s to send the same
// samples twice — double the bytes through a relay whose jitter is the thing
// the listener's cushion has to absorb.
//
// `--channels 2` when the patch genuinely has width, and the page will believe
// it because the count is ANNOUNCED and checked against `frameMs`. The default
// is the honest one for what is actually playing.
//
// ⚠️ The box stays mono (`arecord -c 1`) either way, so both counts are on the
// wire at once and NEITHER end may assume. See `audioChannels` below.
~~~

### live-agent-frame

Above `const FRAME = RATE / 50;`, lines 46 to 53 before the cut.

~~~js
// 20 ms of audio. 50 frames a second against the relay's MEASURED ceiling of
// 60 msg/s for EVERYTHING on it — which is why notes are cheap and nothing else
// chats. The box runs the same cadence for the same reason.
//
// ⚠️ STEREO DOUBLES THE BYTES, NOT THE MESSAGES. 3852 bytes a frame against
// 1932, so 1.54 Mbit/s against 771 kbit/s — and the relay's cap is a MESSAGE
// rate, not a byte rate, so the thing that could actually throttle this is
// untouched. MEASURED at CH=2: 50/s, 1541 kbit/s, 0 dropped.
~~~

### live-agent-midi

Above `const note = (line) => { try { startMidi().stdin.write(line + '\n'); return true`..., lines 73 to 78 before the cut.

~~~js
/**
 * ⚠️ ONE PROCESS, HELD OPEN. A tool that sends one note and exits pays CoreMIDI
 * client setup per note — and worse, a note-off can be lost to a process that
 * has already gone, leaving a note sounding on an instrument in another
 * building. midisend.c's own header makes the same argument.
 */
~~~

### live-agent-left

Above `let v = block.readFloatLE((CH === 1 ? i * 2 : i) * 4);`, lines 95 to 99 before the cut.

~~~js
// At CH=1 the tap still hands us interleaved stereo, so take the LEFT
// of each pair rather than every other float — reading straight through
// would play the two channels alternately, which is a half-rate stream
// an octave down. (They are bit-identical today, so left IS the sum;
// when they are not, this is a downmix decision and it is stated here.)
~~~

### live-agent-clip

Above `v = v > 1 ? 1 : v < -1 ? -1 : v;`, lines 101 to 105 before the cut.

~~~js
// 🔴 CLIP, DO NOT LET IT WRAP. `(v * 32767) | 0` on a float above 1.0
// wraps through the sign bit, so the loudest moment of a track — the
// one place headroom runs out — comes back as full-scale noise rather
// than as slight distortion. A tap reads Live's master AFTER its own
// limiter, so this is rare and it is not impossible.
~~~

### live-agent-refused

Above `if (/refus|denied|not permitted/i.test(t)) log('🔴 tap refused — run it once in `..., lines 115 to 117 before the cut.

~~~js
// 🔴 REFUSED IS NOT A HICCUP. Without the audio-capture grant the tap emits
// correctly-clocked SILENCE and every layer above reports success, so this
// is the one line that must reach a human.
~~~

### live-agent-describe

Above `const describe = () => ({ instrument: 'Ableton Live', rate: RATE, audioChannels:`..., lines 123 to 135 before the cut.

~~~js
/**
 * 🔴 THE CHANNEL COUNT IS ANNOUNCED, NEVER INFERRED. 960 int16s is a valid
 * 20 ms mono frame and an equally valid 10 ms stereo one, so nothing in the
 * payload can tell them apart — and guessing wrong plays an octave down, which
 * sounds like a broken instrument rather than a broken header. `frameMs` is
 * sent alongside so the receiver can CHECK the announcement instead of trusting
 * it: samples / channels / rate must come out at frameMs, and a mono stream
 * mislabelled stereo lands at half of it.
 *
 * ⚠️ NOT `channels` — board.mjs already has that field and it means MIDI
 * channels (16, multitimbral). Two different quantities under one name in one
 * protocol is a bug waiting for someone in a hurry.
 */
~~~

## `rig/m1/live-check.mjs`

### live-check-header

Above `import { execFile } from 'node:child_process';`, lines 1 to 17 before the cut.

~~~js
// live-check.mjs — is the Ableton Live rig actually set up, or does it only
// look like it?
//
//   node rig/m1/live-check.mjs                 # against mbp
//   LIVE_HOST=… M1_SSH=… node rig/m1/live-check.mjs
//   node rig/m1/live-check.mjs --json          # for the relay agent
//
// Every link in the chain gets its own line, with the value it read. A chain
// where eight of nine links report "fine" and the ninth is never tested is the
// shape of failure this rig has already produced twice: a deaf capture read as
// "Live is silent", and a missing plugin folder read as "Arturia is
// unlicensed". Both were wrong, both were confident, and both were retracted.
//
// 🔴 THE LAST CHECK IS THE ONLY ONE THAT MATTERS, and it is the only one that
// crosses the whole chain: hold a chord, capture the audio device, and compare
// it against a silence baseline taken the same way seconds earlier. Everything
// above it is diagnosis for when that one fails.
~~~

### live-check-local

Above `const SSH = process.env.M1_SSH || 'mbp';`, lines 24 to 28 before the cut.

~~~js
// `M1_SSH=local` means "you are already ON the studio machine" — which is how
// rack-agent.mjs runs, and it must not ssh to itself. That is not a tidiness
// point: `ssh localhost` needs Remote Login to accept a key for this user, and
// when it does not the check reports "the studio machine answers: no ssh" about
// the machine it is running on. MEASURED, first run of the agent.
~~~

### live-check-session

Above `const inSession = async (cmd) => {`, lines 47 to 55 before the cut.

~~~js
/**
 * Run something in the user's LOGIN session rather than in this ssh session.
 *
 * ⚠️ A CAPTURE STARTED OVER SSH IS DEAF — measured, the same device and the
 * same ffmpeg reading -91.0 dB over ssh and a real room in the session. The
 * trick is not to START something in the session but to ASK SOMETHING ALREADY
 * IN IT: an AppleEvent to the terminal the user already has open. That is why
 * iTerm2 is a dependency of this check and says so when it is missing.
 */
~~~

### live-check-local-run

Above `if (LOCAL) { await sh(cmd, 30000); return; }`, lines 57 to 60 before the cut.

~~~js
// Already in the session: run it, and do not go round by AppleEvent. That
// also drops the iTerm2 dependency entirely for the agent, which is the
// difference between "needs a terminal window open" and "needs to be started
// once from one".
~~~

### live-check-live

Above `const livePid = await sh('pgrep -f 'Ableton Live.*MacOS/Live' | head -1');`, lines 78 to 82 before the cut.

~~~js
// ── 2. Live itself ────────────────────────────────────────────────────────
// -x would miss it: the binary is "Live" inside an .app, so the pattern has to
// be the path. -f is right HERE and wrong for ffmpeg, where it matches its own
// ssh command line — the two rules are not in conflict, they are about
// different patterns.
~~~

### live-check-input

Above `const inType = await one('/live/track/get/input_routing_type');`, lines 102 to 104 before the cut.

~~~js
// "All Ins" is a superset of IAC and is what a fresh track has, so it PASSES
// — refusing it would fail a rig that works. Named explicitly is better only
// because it cannot be stolen by another device plugging in.
~~~

### live-check-devices

Above `await sh('rm -f /tmp/pc-dev.txt');`, lines 124 to 129 before the cut.

~~~js
// ── 8. the audio devices, BY NAME ─────────────────────────────────────────
// 🔴 NEVER BY INDEX. This check exists because `-i ":0"` meant the microphone
// when the README was written and means BlackHole today — the same reading,
// -91.0 dB, once proved "the capture is deaf" and once proved "nothing is
// playing", which are opposite conclusions from an identical number. A device
// index is a shared mutable global exactly like a fixed port.
~~~

### live-check-mic

Above `if (mic !== null) {`, lines 160 to 163 before the cut.

~~~js
// ── 9. the deafness control, on the RIGHT device ──────────────────────────
// ⚠️ THE MICROPHONE, BECAUSE IT CANNOT BE DIGITALLY SILENT IN A ROOM. If this
// reads -91.0 the capture is deaf and every level below it is meaningless —
// which is the one thing a silent BlackHole reading cannot tell you on its own.
~~~

### live-check-baseline

Above `await sh('rm -f /tmp/pc-silence.txt /tmp/pc-note.txt /tmp/pc-done');`, lines 188 to 189 before the cut.

~~~js
// Baseline first, same device, same ffmpeg, seconds apart — the only way a
// level means anything. A number with no control is not a measurement.
~~~

## `rig/m1/live-osc.mjs`

### live-osc-header

Above `import dgram from 'node:dgram';`, lines 1 to 9 before the cut.

~~~js
// Talk to Ableton Live over AbletonOSC. Runs ON the machine Live is on.
//
//   node live-osc.mjs status              what Live has, and whether it can hear us
//   node live-osc.mjs get <addr> [args]   one query
//
// OSC IS UDP AND A REPLY CAN SIMPLY NOT ARRIVE -- measured once in session 15,
// one unanswered `current_song_time` killed a run while a second run lost 0 of
// 111. So every ask retries rather than failing on a single packet. Never put
// this in the timing path: it arms and reads, and the numbers come from audio.
~~~

### live-osc-main

Above `const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split`..., lines 64 to 67 before the cut.

~~~js
// ONLY act as a CLI when RUN, not when IMPORTED. live-setup.mjs imports ask()
// from here, and this block used to execute on import -- status report, then
// process.exit(0), so the importer's own code never ran at all and its output
// looked like this file's.
~~~

## `rig/m1/live-setup.mjs`

### live-setup

Above `import { ask } from './live-osc.mjs';`, lines 1 to 9 before the cut.

~~~js
// Put Live into a state where it can be played remotely — no clicking.
//
//   LIVE_HOST=<mbp> node live-setup.mjs [instrument] [track]
//
// Everything here is reachable over OSC, including loading the instrument, which
// AbletonOSC alone cannot do (abletonosc-ext/browser.py adds it). The ONE thing
// that is not reachable is Live's audio OUTPUT device: the Live Object Model has
// no audio-device API, so BlackHole has to be selected by hand in
// Preferences > Audio. See the README.
~~~

## `rig/m1/pace-agent.mjs`

### pace-agent-header

Above `import { createServer } from 'node:http';`, lines 1 to 38 before the cut.

~~~js
// pace-agent.mjs — a rack agent with no network in it, so "the sound is bad"
// can be told from "the PATH to the sound is bad".
//
//   node rig/m1/pace-agent.mjs                    perfect 20 ms pacing
//   node rig/m1/pace-agent.mjs --jitter 25        the relay's jitter, reproduced
//   node rig/m1/pace-agent.mjs --channels 2       dual-mono stereo, like Live's
//
// then open  http://127.0.0.1:8890/able/?relay=ws://127.0.0.1:8899
//
// 🔴 WHY THIS EXISTS. `rack` sounded noisy, six measurements said the stream was
// perfect, and the defect turned out to be a cushion downstream of every one of
// them (LESSONS #52). The cushion was resized from a measurement of the real
// path — p50 20.4 / p95 32.6 / p99 45.0 ms apart, worst gap 108.6 ms — and the
// report came back noisy again. At that point there are two live hypotheses
// with opposite fixes:
//
//   the ARRIVAL TRAIN is still too rough  -> a bigger cushion, or a better path
//   something AFTER the socket is wrong   -> a bigger cushion changes nothing
//
// and they are indistinguishable from inside the page. This is the instrument
// that separates them. It sends a tone this file generates, at exactly one
// frame every 20 ms, over a socket on loopback: no relay, no edge, no Wi-Fi, no
// Core Audio tap, no Ableton. If the page still sounds wrong here, nothing left
// in the chain is the network.
//
// ⚠️ AND IT HAS A NEGATIVE CONTROL, which is the half that makes it evidence.
// `--jitter N` delays each send by a random 0..N ms, reproducing what the relay
// does. Run it at 0 and at 40: if 0 is clean and 40 is not, jitter is
// sufficient to explain the complaint. If 0 is ALSO bad, it is not the network
// and the cushion was never the whole story. A test that can only pass tells
// you nothing — see LESSONS #27 and the `--self-test` in verify-quest.mjs.
//
// ⚠️ NO DEPENDENCIES. Node has no WebSocket *server*, and this repo has no
// package.json — the handshake and a text/binary frame writer are about sixty
// lines and are house style already (demo/verify.mjs speaks raw CDP the same
// way). Only what a browser client actually needs is implemented: server ->
// client frames are never masked, and the one client frame this cares about is
// a small masked text frame.
~~~

### pace-agent-tone

Above `let hz = 0, phase = 0, held = new Set();`, lines 53 to 56 before the cut.

~~~js
// ── the tone ──────────────────────────────────────────────────────────────
// A steady sine at the note being held, because a STEADY source is the one that
// makes a discontinuity audible. A pad or a noise source hides exactly the
// defect this is looking for.
~~~

### pace-agent-fade

Above `const target = hz ? 0.25 : 0;`, lines 65 to 66 before the cut.

~~~js
// A gentle fade to and from silence, so switching notes is not a step —
// a step is a click, and a click is the thing being hunted.
~~~

### pace-agent-pacing

Above `let due = performance.now();`, lines 153 to 157 before the cut.

~~~js
// ── the pacing ────────────────────────────────────────────────────────────
// 🔴 A DRIFT-FREE SCHEDULER, NOT `setInterval(fn, 20)`. setInterval accumulates
// its own lateness, so a "20 ms" tick drifts against the sample clock and the
// listener's cushion slowly empties or fills — which would be this instrument
// producing the very defect it is meant to rule out.
~~~

## `rig/m1/rack-agent.mjs`

### rack-agent-header

Above `// Node's own WebSocket — no 'ws' dependency, the same choice rig/board/board.mj`..., lines 1 to 18 before the cut.

~~~js
// rack-agent.mjs — answer "is the studio instrument set up?" over the relay, so
// a browser anywhere can ask without ssh, without OSC and without being on the
// LAN.
//
//   node rig/m1/rack-agent.mjs --room pro-1
//
// ⚠️ RUN IT FROM A TERMINAL ON THE STUDIO MAC, not over ssh. live-check.mjs's
// last two arms capture audio, and a capture started over ssh is deaf — the
// same device and the same ffmpeg read -91.0 dB over ssh and a real room in the
// login session. The agent reaches the session by AppleEvent to iTerm2, which
// only works when there is a session to reach.
//
// ⚠️ AND IT DOES NOT RE-RUN THE CHECK ON EVERY ASK. The full check takes ~25 s
// because two of its arms are real 2-3 second recordings, and a page that asked
// for it would sit there looking broken. `rack.status` answers instantly from
// the last run and SAYS HOW OLD IT IS; `rack.check` starts a fresh one. A
// cached answer presented as a live one is the defect this repo keeps naming —
// so the age is part of the payload, never omitted.
~~~

### rack-agent-ws

Above `import { execFile } from 'node:child_process';`, lines 20 to 22 before the cut.

~~~js
// Node's own WebSocket — no `ws` dependency, the same choice rig/board/board.mjs
// made. This repo has no build step and adding one module to run one socket is
// not the way to start having one.
~~~

### rack-agent-exit

Above `let parsed = null;`, lines 53 to 55 before the cut.

~~~js
// ⚠️ A NON-ZERO EXIT IS A RESULT, NOT AN ERROR. live-check exits 1 when
// any link fails, which is the most interesting case there is — reading
// that as "the check crashed" would throw away every useful answer.
~~~

## `rig/m1/rhodes-render.mjs`

### rhodes-render

Above `import { writeFileSync } from 'node:fs';`, lines 1 to 10 before the cut.

~~~js
// Render the FM Rhodes to a WAV and measure what it costs per sample.
//
//   node rhodes-render.mjs [out.wav]
//
// The cost number is the point: it decides whether a SINGLE-core board can carry
// the synth and the network at once, which is the difference between an ESP32-C6
// in a Tallinn shop today and an S3 ordered from abroad. Measured here as a
// realtime factor on this machine, then scaled to the microcontroller — and the
// scaling is an ESTIMATE, labelled as one, because a 240 MHz Xtensa is not a
// slower M-series and no benchmark here has ever run on that chip.
~~~

## `rig/m1/skew.mjs`

### skew-header

Above `import { createPeer, wsTransport } from '../../proto/looper/peer.mjs';`, lines 1 to 22 before the cut.

~~~js
// HANDOFF item 0: min-RTT clock skew over a REAL LINK, between two machines.
//
//   node skew.mjs <id> [seconds] [room]
//
// Run it on BOTH machines at once with different ids. Everything the project's
// multi-device timing rests on is this number, and it has only ever been
// measured on loopback (peer-to-peer ±0.15 ms, drift 7 µs / 25 min) or against a
// Worker `/time` endpoint (±50 ms, and that was BIAS -- edge path asymmetry, not
// jitter).
//
// It stopped being theoretical today: MoQ transit between these two machines
// read −14.2 ms. A negative latency is the skew showing up, because the send
// stamp is one machine's clock and the read is the other's.
//
// WHY MIN-RTT AND NOT AN AVERAGE: an average is dragged by every queued packet;
// the minimum is the one sample that got through cleanly. The claim under test
// is that min-RTT estimation is SCALE-FREE -- a 311 ms link estimated as well as
// a 1.3 ms one -- but that evidence was still loopback-shaped. If a real link's
// offset spread is materially worse than ±0.15 ms, peer-to-peer estimation alone
// does not carry a multi-device click track, and that is the useful outcome.
//
// This runs in node: peer.mjs uses only WebSocket and performance, both global.
~~~

### skew-tail

Above `const tail = sk.slice(Math.floor(sk.length * 2 / 3)).map((l) => l.offset);`, lines 58 to 63 before the cut.

~~~js
// The KEPT set is the running minimum's TRAJECTORY, not a stability measure:
// every early sample counts as kept while the minimum is still falling, so its
// spread conflates converging with wandering. What stability actually looks
// like is the offset over the LAST THIRD of the run, once the minimum has
// settled -- and the real check is the other machine, which estimates the same
// quantity independently and should come back equal and opposite.
~~~

## `rig/m1/sweep.mjs`

### sweep-header

Above `import { spawn, execFileSync } from 'node:child_process';`, lines 1 to 13 before the cut.

~~~js
// Sweep the MoQ publisher's knobs across both relays and report loss and latency.
//
//   node sweep.mjs [repeats]        default 2
//
// WHY IT EXISTS: a single run once showed 31% loss over Cloudflare and two later
// runs at the IDENTICAL config showed 2.4% and 3.9%. One run is an anecdote, and
// an anecdote with a percentage sign on it reads like a finding. So every config
// is run more than once and the SPREAD is printed beside the median -- if the
// spread is wider than the difference between configs, the sweep has not
// separated anything and says so.
//
// The LAN relay is the control on every row: a change that helps on both is
// about the ENCODING, one that helps only over distance is about the PATH.
~~~

## `rig/m1/ws-audio-probe.mjs`

### ws-audio-probe

Above `const ROOM = process.env.WS_ROOM || 'audio-probe';`, lines 1 to 19 before the cut.

~~~js
// Can our own WebSocket relay carry AUDIO, at the shape a microcontroller would
// send it? Run before buying an ESP32, not after.
//
//   node ws-audio-probe.mjs [seconds]
//
// THE POINT: Opus exists to save bandwidth, and on this relay bandwidth is the
// abundant thing — 512 KiB/s per socket against raw 48 kHz 16-bit mono PCM at
// 96 KB/s. Opus at 48 kHz is ~85% of one ESP32-S3 core (third-party benchmark),
// so encoding trades the SCARCE resource for the plentiful one. Sending raw PCM
// costs no CPU and no encoder frame delay.
//
// What could still kill it is the relay's own cap: 60 msg/s, enforced by a token
// bucket that drops SILENTLY — no error, no close, no backpressure. Measured off
// the wire: MSG_BURST 120 plus 60/s, 298 delivered in three seconds. So this
// probe counts what comes back, per configuration, and the counter is the only
// thing that can see a drop.
//
// The relay echoes to the sender, so round trip and loss are both measured on
// ONE clock and carry no clock offset.
~~~

<a id="studio-agent"></a>

## `studio-agent.mjs`: what it took to make Live sound again, 2026-10-22

Every link was "configured" and Live was silent for an hour. Four separate causes, each found by splitting, none by
reading settings:

1. **A GUI app opened from an ssh-started process is outside the login session.** Live opened by the agent started
   over `nohup` from ssh rendered nothing. The agent runs as a LaunchAgent (`gui/<uid>`), and opens Live from there.
2. **Killing Live leaves a crash-recovery dialog at the next launch** ("Live unexpectedly quit... recover?"), which
   nothing over ssh can click (no UI scripting). Moving `CrashDetection.cfg` and `CrashRecoveryInfo.cfg` out of
   `~/Library/Preferences/Ableton/Live 11.3.43/` before relaunching starts it clean.
3. **Output on the Multi-Output Device**: the metronome (cue out) sounded, the tracks (master) did not. Live's output
   is the MacBook Pro Speakers now; the tap does not need a loopback device.
4. **Live's IAC subscription had gone stale**: IAC carried the notes (`midilisten` printed `90 3C 64`), Live listed
   the port with Track on, and Live's MIDI-in light stayed dark. Unticking and reticking Track on `In: IAC Driver
   (Bus 1)` in Preferences fixed it. And the owner's Mosaiik control surface ate notes 57 60 62 65 67 69
   (plans/plan-studio-mac.md §9), which made the earlier tests contradict each other.

The control that split it was the owner's ears plus the computer keyboard with the track's input on All Ins: the
keyboard sounded, IAC did not, so the instrument and output were fine and the port was not.

MEASURED after, through the relay: a held chord -4.6 dBFS, silence before. `midisend` now stamps notes with
`mach_absolute_time()` instead of 0 (no effect on this fault, kept because 0 relies on CoreMIDI rewriting it), and
a bare `panic` line was ignored by its parser (`got < 2`), so the agent sends `panic 0`.
