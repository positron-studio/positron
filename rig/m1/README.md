# m1 — play a machine in the next room

> **Two rigs live in this file and they are not the same thing.**
> **[The rack](#the-rack--play-ableton-live-from-a-browser-2026-09-12)** is
> current, running, and unattended. **[The parked
> rig](#-parked-2026-09-11--it-works-and-the-setup-is-too-heavy-to-keep-warm)**
> below it is the older peer-to-peer path — it works, and it is parked.
> Two agents with confusingly close names sit in this directory:
> `live-agent.mjs` is the rack (plays Live), `rack-agent.mjs` is the parked
> rig's *checkup* (answers "is it set up?"). Neither calls the other.

---

# The studio agent: the Mac as site `m1` (2026-10-22, replaces the rack)

`rig/m1/studio-agent.mjs` runs on the studio Mac (`ssh mbp`) as a LaunchAgent (`studio.positron.studio-agent.plist`),
in the owner's login session, in room `m1-1` as site `m1` (`macGraph` in `demo/shell/graph-registry.mjs`). It speaks
the board's wire, so a page opens it with `createBoard({ room: 'm1-1' })`: notes in to Ableton Live over IAC,
Live's sound back through the tap only while a page asks, transport and tempo over AbletonOSC, and `app.open` /
`live.instrument` signed with the studio key (`~/.positron/studio-key` on the Mac, `STUDIO_KEY` in `.env`).
`./rig/m1/push-studio.sh` copies it there. The old `live-agent.mjs` and `rack-agent` were removed the same day.

MEASURED 2026-10-22 through the relay: a held chord came back at -4.6 dBFS against silence before.
What it took is in `lessons/rig-m1.md#studio-agent`: Live's output on the speakers (not the Multi-Output Device),
the IAC port re-ticked in Live's Preferences, and the owner's Mosaiik remote script removed (it caught notes 57,
60, 62, 65, 67, 69).

The tap binary stays at `~/positron-rack/bin/audiotap`: its capture grant is keyed to that path.

---

# The rack — play Ableton Live from a browser (2026-09-12)

**Live at <https://positron.studio/able/>.** Press a key in a browser anywhere:
the note number crosses the relay, `live-agent.mjs` on the studio Mac hands it
to Live over CoreMIDI, and a copy of what Live renders comes back down the same
socket. `/keys/` is the SAME PAGE pointed at a Raspberry Pi — what crosses the
wire is a note number, so neither end knows what kind of machine the other is.

    rig/m1/live-agent.mjs   the agent: notes in over the relay, audio out
    rig/m1/audiotap.m       a Core Audio process tap — copies ONE app's output
    rig/m1/midisend.c       notes out over CoreMIDI, held open on stdin
    rig/m1/studio.positron.rack-agent.plist   keeps it running across reboots
    demo/able/index.html    the page

## 🔴 No BlackHole. No Multi-Output Device. No Live Preferences click.

This is the whole point of the rewrite. A Core Audio **process tap** takes a
copy of one process's output *while that audio carries on to the speakers*, so
the entire old routing chain is gone — and with it **the one requirement in
this rig that the Live Object Model could not script**: Live's own audio output
device. Live plays out of its own speakers and the page hears it at the same
time.

Of the [six things the parked rig needed](#-why-it-is-parked-the-setup-is-heavy-and-here-is-exactly-how-heavy),
the rack needs four, and the two that went are the two that hurt:

| the parked rig needed | the rack |
|---|---|
| Preferences → Audio → Output = BlackHole / Multi-Output | **gone** — the tap copies whatever Live is already playing |
| AbletonOSC selected as a Control Surface | **not in the play path** — the agent makes no OSC call at all (grep it). Still needed to *change* a set with `live-setup.mjs` |
| the agent in a login session, started by hand | **gone** — launchd, see below |
| Mac awake · Live open with an armed track · IAC Bus 1 enabled for Track input | unchanged — still true, still clicks |

⚠️ **And the old "a capture started over ssh is deaf" rule does NOT apply to the
tap.** MEASURED 2026-09-12: the agent started over plain ssh with `nohup`
reported `permission to record system audio: allowed` and delivered **-5.3
dBFS** through the relay. That rule was about `ffmpeg -f avfoundation`, whose
TCC subject is the terminal; `audiotap` disclaims responsibility and is its own
subject (`studio.positron.audiotap`), so its grant does not depend on who
started it. **Do not carry the ssh rule across to this rig** — it is the same
sentence about a different mechanism, which is how a working path gets called
broken.

## Measured over the relay, 2026-09-12

| | |
|---|---|
| nothing playing | **0.00000** peak |
| three keys held | **0.54572 peak = -5.3 dBFS** — the same figure the old BlackHole chain read |
| frames dropped | **0 of 801** |
| on the wire | 50 frames/s · **1541 kbit/s** stereo |
| the agent's cost | **4.2% of one core** (M1 Pro) for socket + framing + conversion; `audiotap` alone reads 0.0% |
| suite | **15/15 green**, against the deploy |

## The wire, and the one rule that matters on it

12 bytes then samples: `uint32 LE` sequence, `float64 LE` sender clock, then
interleaved `Int16`. Identical to the box, deliberately.

🔴 **THE CHANNEL COUNT IS ANNOUNCED, NEVER INFERRED.** 960 int16s is a valid
20 ms **mono** frame and an equally valid 10 ms **stereo** one — nothing in the
payload can tell them apart, and guessing wrong plays an octave down, which
sounds like a broken instrument rather than a broken header. The Mac is stereo
and the board is mono (`arecord -c 1`), so **both counts are on the relay at
once** and no page may assume. Each sender declares `audioChannels` *and*
`frameMs`; the page CHECKS one against the other — `samples / channels / rate`
must come out at `frameMs` — so a wrong announcement is visible rather than
merely audible.

⚠️ The field is `audioChannels`, **not** `channels` — `board.mjs` already has
`channels` and it means MIDI channels (16, multitimbral).

**Proved by breaking it.** An agent that announced 1 while sending 2 was run in
the real room against the real page and the real harness: the check fired, said
*"it said 1, the frames say 2 — playing 2"*, corrected itself, and the suite went
14/14 → 13/14. That run also exposed a bug worth keeping written down — the
correction was being undone by the NEXT status reply repeating the same wrong
claim, so the page flip-flopped and its own readout said "corrected to 1" about
a correction to 2. **A measurement outranks a repeated claim;** what re-opens
the question is the sender *changing* its claim, which is real news.

## 🔴 The stream was bit-clean and it still sounded broken

Shipped, and the report came back *noisy and distorted* — with every
measurement above still true. The tap's own capture at the source had **zero**
sample jumps over 0.25; what arrived over the relay measured the **same** pitch
to a tenth of a Hz, the same peak, zero jumps, 0 dropped. All correct, and none
of it could find the bug, because the defect was **downstream of every quantity
being measured**: `pcm-playout` trims its cushion back to the floor whenever
occupancy passes `floor + slack`, and the numbers did not fit each other —
**floor 60 ms, slack 15 ms, frames arriving in 20 ms lumps**, so one frame
landing early threw ~15 ms of audio away mid-note, over and over.

What found it was **giving the cushion a number**: `breaks` in the readout, and
it read `0 ran dry, 1 trimmed` inside 2.2 s. Slack now follows the frame size
the worklet OBSERVES, because every caller feeds a different one and none of
them declares it. ⚠️ `/keys/` and `grains` were doing the same thing, unreported,
for as long as they have existed.

**"The bytes are correct" and "the sound is correct" are different claims**, and
a buffer sits between them. Every stage that can discard data needs a counter a
page actually shows — these counters existed inside the worklet all along,
posted every 250 ms, and no page had ever read one.

## It stays up by itself

`studio.positron.rack-agent.plist`, a **LaunchAgent, not a LaunchDaemon** —
TCC grants belong to a logged-in GUI session and a daemon has none, so the tap
would come back refused and emit correctly-clocked **silence**, which every
layer above reports as success. Live is a GUI app anyway.

```sh
cp rig/m1/studio.positron.rack-agent.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/studio.positron.rack-agent.plist
launchctl print gui/$(id -u)/studio.positron.rack-agent | grep -E 'state|pid'
tail -f /tmp/rack-agent.log
```

**Proved by killing it:** `kill -9` the pid, and 12 s later it is back with a
new pid and `permission to record system audio: allowed` — the grant survives an
unattended restart with nobody at the keyboard.

⚠️ **The full path to `node` in the plist is not pedantry.** launchd starts with
a minimal PATH — the same one a non-interactive ssh gets — and `node` is not on
it, on a machine where `which node` answers instantly in a login shell. That
cost one start here.

⚠️ **`audiotap` must not be rebuilt casually.** It is codesigned
(`codesign --force --sign - --identifier studio.positron.audiotap`) and the TCC
grant is attached to that identity; a rebuild needs somebody to click Allow
again, in person.

---


`synth.html` runs on the instrument machine; `play.html` runs on yours. Notes go
up a direct peer-to-peer link, the sound is synthesised there and comes back on
the same connection. The Cloudflare relay carries ONLY the initial handshake.

    # on the instrument machine
    node demo/server.mjs
    open http://127.0.0.1:8890/rig/m1/synth.html?room=proinst

    # on yours
    node demo/server.mjs
    open http://127.0.0.1:8890/rig/m1/play.html?room=proinst

## Measured, 2026-09-10, two Macs on one LAN

Same payload, both paths, alternating note by note so neither arm gets the
better half of the link. Both are ROUND TRIPS timed on one machine, so no clock
agreement is involved and none of the number is skew — which is the only reason
the two are comparable.

| control path | typical | worst 1 in 20 | slowest | quickest | presses |
|---|---|---|---|---|---|
| direct peer-to-peer link | **6.00 ms** | 8.20 ms | 31.10 ms | 4.50 ms | 100 |
| via the Cloudflare relay | **68.90 ms** | 94.80 ms | 120.90 ms | 59.30 ms | 100 |

**The relay costs 11.5x at typical**, and the number that decides playability is
the last row of the run rather than the median: **presses over 100 ms — direct
0 of 100, relay 4 of 100.** Anything past ~100 ms reads as sluggish under the
fingers, so the relay crosses that line four times in a hundred and the direct
link never approaches it.

⚠️ **Discard a warm-up.** A first attempt read 1781 ms at worst-1-in-20 on BOTH
arms — a single ~2 s stall in the first seconds of the page, which at only 30
samples per arm made the 95th percentile almost the maximum. A page that has
just started is not the thing being measured. These figures follow 24 discarded
presses.

**Typical** is the middle press — half were quicker. **Worst 1 in 20** is the
level 19 presses out of 20 came in under, which is what says whether the slow
ones are rare or routine. A median alone hides the one bad press, and that press
is usually the reason to look.

**The relay costs 11.2x the direct link**, and the shape says why: a machine
three metres away is reached by going out to Cloudflare's edge and back down,
then the acknowledgement repeats the trip. Two edge round trips for one room.

So anything in the timing path takes the direct link. The relay is for the
handshake, which is not in the timing path, and for reaching machines that
cannot see each other directly.

## Key press to sound: 84 ms — and the control path is 7% of it

The two numbers on the page are DIFFERENT JOURNEYS and only one is what you hear.
The control figure times a *message* — press out, acknowledgement straight back —
and carries no audio and no buffer. Measured together, 40 notes:

| | typical | worst 1 in 20 | spread |
|---|---|---|---|
| **key press → sound** | **84 ms** | 86 ms | every sample 77–86 ms |
| message round trip (direct link) | 6.10 ms | — | — |
| the browser's audio cushion | 37.9 ms | — | 0 packets lost |

Roughly 3 ms of one-way control, ~38 ms of cushion, ~20 ms of Opus framing, and
the rest synthesis, encode and decode. **So making the control path faster buys
almost nothing** — it is already 7% of the total — and the sound path is the
whole game. That is the argument for MoQ audio return (35.8 ms key→ear measured
in `proto/jam`) over any amount of tuning here.

It lands in the same band as `proto/jam`'s 77.7 ms, which is a useful check: that
figure came from two headless Chromes on ONE machine, this one from two real
machines in a room.

**What this number does NOT include: your output device.** The onset is detected
on the DECODED audio, before it reaches a speaker; physical ears add the output
latency on top (`proto/jam` used +32 ms). State it as decoded-audio latency and
it is a floor worth having rather than a claim.

**How it is measured**: an AudioWorklet on the returned stream reports the first
sample over threshold, so the onset is sample-accurate. Polling an analyser in
rAF would quantise an 84 ms answer to a frame.

## Why the relay costs 71 ms — it is geography, not the Durable Object

The obvious suspicion is that the relay's compute is the cost. It is not, and
`edge-rtt.mjs` separates the two: `ping`→`pong` is answered by the Worker
RUNTIME's hibernation autoresponse and never wakes the Durable Object, so it is
pure network; an echo makes the identical trip THROUGH the object.

| | typical | worst 1 in 20 | n |
|---|---|---|---|
| this Mac → Cloudflare edge → back | **34.19 ms** | 37.93 ms | 60 |
| the same trip through the Durable Object | **34.37 ms** | 38.99 ms | 60 |
| **the Durable Object itself** | **0.18 ms** | | |

**0.18 ms of 71 is a quarter of one percent.** A note to the M1 is TWO of those
trips — out to the edge and down to the M1, then the receipt back up and down
to me — so the prediction is 2 x 34.37 = **68.7 ms** against **71.00 ms**
observed, the ~2 ms gap being the synth's own handling.

So a machine three metres away is 71 ms away because every message goes to a
Cloudflare edge and back, twice. The relay is not slow; the route is long. Which
is also why no amount of tuning the relay would help, and why the direct link
exists.

(Session 14 measured the same hop at 0.8–1.6 ms against a busier room; 0.18 ms
here is one warm object with one other socket in it. Either way it is noise
beside the trip.)

**The sound's own delay is not the network.** The browser holds a cushion of
audio so that unevenly-arriving packets still play smoothly; it read **30–44 ms**
across runs here with zero packets lost, and it adapts — a clean LAN gives it
little to absorb, so it shrinks. It cannot be switched off from JavaScript
(`jitterBufferTarget = 0` is a hint the browser clamps, and forcing it
destabilised an SFU run from 116 to 235 ms). This is why a machine in the same
room sounds much like one across the country: the cushion, not the distance,
owns the number.

## What makes the sound

A **triangle-wave oscillator with a 5 ms attack and a 450 ms decay**, built in
Web Audio inside a headless Chrome on the instrument machine — about fifteen
lines in `synth.html`. It feeds a `MediaStreamDestination`, and that stream is
the outgoing WebRTC audio track. A near-silent `ConstantSourceNode` sits on the
same bus on purpose: Chrome hands a bus it has decided is silent an EMPTY buffer,
and a sender treats a dead track as nothing to send.

**It is not Ableton.** Live 11 and BlackHole 2ch are installed on that machine
and untouched here. Capturing BlackHole instead of synthesising — so Live is the
instrument and this is only the transport — is the next step, and it needs a way
in for the notes: Live's transport is clocked by its audio engine, and
`is_playing` reports intent rather than delivery (a `current_song_time` that
does not move is the only proof the clock stopped).

## The result: 86 ms → 29 ms, measured

Same instrument, same notes, two ways back. 30 notes each, and these are ROUND
TRIPS ON ONE CLOCK — pressed here, heard here — so unlike the transit figures
there is no clock offset anywhere in them.

| sound comes back over | typical | worst 1 in 20 | notes |
|---|---|---|---|
| WebRTC | **86 ms** | 91 ms | 30 |
| **MoQ, relay on the LAN** | **29 ms** | 34 ms | 30 |

with the receipt (the message telling the M1 to play) at **6.10 ms**, and MoQ
decoding 3713 frames with **0 underruns**.

**Three times faster, and the reason is the cushion, not the wire.** WebRTC's
86 ms is mostly a buffer the browser owns and will not let you set; MoQ's 29 ms
is a floor we chose (10 ms) plus a relay in the same room. It also beats
`proto/jam`'s 35.8 ms, which was the same idea routed through Cloudflare.

## How the MoQ return is built

`moq-audio.mjs` publishes the synth bus as Opus over MoQ beside the WebRTC track
(same bus, so it is one instrument heard two ways) and subscribes with our own
playout ring. **What is measured:** the subscription goes live, decode is clean
(4417 of 4417, then 2156 of 2156), underruns 0, and **transit settled at
37–40 ms typical**.

**The notes leg was a duplicate-offer race**, now fixed: the player offered on
socket-open AND again on the synth's announcement, so the synth accepted twice
and its second accept closed the connection the first was still completing. A
fresh page survived it on timing; a restart did not. The handshake is now
hello → here → exactly one offer, and a NEW announced name is what triggers
re-offering, so either side can restart.

Two more defects were found and fixed on the way, both of which reported perfect
health while being wrong:

- **`latencyMax` defaults to 2000 ms** in the wrapper, which is the window the
  relay RETAINS. A subscriber joining mid-stream was served the whole two seconds
  and spent the run draining it: **transit started at 2030 ms and counted
  steadily down** while decode was 4417 of 4417 and underruns were 0. Every
  indicator healthy, every sound two seconds old. Now 100 ms. The consumer was
  already at `latency: 0`, so this was never the consumer.
- **A same-name rejoin bricks a draft-14 namespace** (RUNBOOK 13.4). Restarting
  the synth five times under one fixed name gave every subscriber
  `SUBSCRIBE code=4 Track not found` while the publisher sent 1851 frames with
  zero errors. The name is now minted per run and announced over the relay,
  because a player that guesses the name is a player that subscribes to a
  bricked one.

## A MoQ relay on the LAN — built, and it works

`moq-relay-ietf` from `rig/moq/moq-rs-draft14`, built with Rust 1.98 on the
instrument machine (90 seconds), listening on `[::]:4443`, with a 10-day ECDSA
P-256 certificate the page PINS via `serverCertificateHashes`. Chrome connected
first try: **2974 frames, 2974 decoded, 0 underruns**, and the relay logged
`serving announce: namespace=/proinst-…`.

`lan-relay.sh cert|run|print` does the setup. The synth publishes over loopback
and ANNOUNCES the address and fingerprint a player should use — neither is
derivable, and a guessed fingerprint is not a thing.

### The transit number, and why it is negative

| relay | transit as measured | |
|---|---|---|
| Cloudflare draft-14 | 39.6 ms | |
| **this LAN relay** | **−14.2 ms** | ← impossible |

**A negative latency is the measurement telling you what it really contains.**
The send stamp is written by the instrument machine's clock and read by the
player's, so this figure is *transit plus the offset between two clocks* — and
here the offset is larger than the transit, so the sum goes negative. It is the
same trap as comparing two peers' own timestamps, which cancels the skew under
test.

What IS valid is the **difference**, because both runs involve the same two
clocks and the offset subtracts out: **the LAN relay saves ~53.8 ms of transit**
against going to a Cloudflare edge and back. That is larger than the 34.19 ms
edge round trip alone, so some of it is the relay's own handling as well as the
distance.

**For an absolute number, measure a ROUND trip on one clock** — press here, hear
here — which is what the key→ear row does and why it needs no clock agreement.
That is HANDOFF item 0 showing up in practice: min-RTT skew between two machines
is still the unmeasured quantity everything multi-device rests on.

## What is NOT measured here

- **Off-LAN.** `iceServers` is empty on purpose — host candidates only, right for
  one room, and it will not cross a NAT. An internet arm needs STUN, and a
  symmetric NAT needs TURN.
- **A faster return.** MoQ audio return measured **35.8 ms key→ear** against
  WebRTC's 77.7 in `proto/jam` (session 6i), because the cushion is the cost and
  MoQ lets you choose the floor. That is the upgrade, and it is a real build.
- **A real instrument.** The synth here is a triangle wave with an envelope. The
  Pro has Ableton Live 11 and BlackHole 2ch, so the next step is to capture
  BlackHole instead of synthesising, and to drive Live over MIDI or OSC.

## Ableton Live as the instrument — wired, waiting on four clicks

`?instrument=ableton` turns the synth page into a BRIDGE: notes go out a MIDI
port into Live, and Live's audio comes back through a loopback device onto the
same bus the internal oscillator used — so the WebRTC track and the MoQ
publisher are fed by one source either way. The oscillator stays the default, so
nothing here breaks without Live.

### Done, and done without a GUI

**The IAC MIDI driver is enabled from the command line.** It was HANDOFF's
"Yours alone" item and it is a plist flag, not a click: `devices:0:offline` in
`~/Library/Audio/MIDI Configurations/Default.mcfg`, flipped with PlistBuddy and
followed by `killall MIDIServer`. Chrome went from **zero MIDI ports to
`IAC Driver Bus 1`, in and out**, with no Audio MIDI Setup involved.

Two traps on the way, both already in this repo's notes: `grep` printed nothing
for "IAC" in the config because it holds NUL bytes (`grep -a`), and `plutil`'s
XML has raw control characters that Python's expat refuses — PlistBuddy reads
the binary form directly and is the right tool.

`launch-synth.mjs` grants `midi` and `audioCapture` over CDP **before**
navigating. A flag will not do it: `--use-fake-ui-for-media-devices` is
insufficient under `headless=new`, and navigating first means
`requestMIDIAccess` has already been refused.

**`abletonosc-ext/browser.py`** adds what AbletonOSC lacks and a remote
instrument needs: Live's browser. `/live/browser/instruments`, `/live/browser/
find <text>`, `/live/browser/load <track> <name>`. A track with no device makes
no sound however well the MIDI arrives, and nothing else in the OSC surface can
load one.

## All four cases, with Ableton Live as the instrument

Press a key here, Drift sounds in Live on the other machine, hear it back.
14 of 14 notes in every case; receipt (the message telling Live to play) 6.6–8.8 ms
throughout, so the control leg is never the story.

| sound comes back over | typical | worst 1 in 20 | gaps | audible result |
|---|---|---|---|---|
| **MoQ, relay on the LAN** | **58 ms** | 69 ms | **31** | clean |
| WebRTC (peer to peer) | 111–128 ms | 114–236 ms | — | clean |
| MoQ, via Cloudflare | 136 ms | 271 ms | **1133** | **garbled** |

## The loss was the GROUP POLICY, and it costs nothing to fix

Swept both relays, five configs, twice each (`sweep.mjs`), varying one knob at a
time with the LAN relay as the control on every row:

| relay | config | loss median [spread] | key→ear median [spread] | runs |
|---|---|---|---|---|
| lan | baseline (group 50) | 0.8% [0.4–0.8] | 60 ms [60–60] | 2 |
| lan | retain 300 | 0.7% [0.5–0.7] | 63 ms [60–63] | 2 |
| lan | **group 200** | **0.0%** | **60 ms** | 1 |
| lan | frame 10 ms | 0.0% | 63 ms | 2 |
| lan | frame 20 ms | 0.0% | 64 ms | 1 |
| cf | baseline (group 50) | 2.2% [1.8–2.2] | 76 ms [73–76] | 2 |
| cf | retain 300 | **no valid run** | | 0 |
| cf | **group 200** | **0.0%** | **73 ms** [71–73] | 2 |
| cf | frame 10 ms | 3.8% [2.3–3.8] | 118 ms | 2 |
| cf | frame 20 ms | 1.5% [0.7–1.5] | 83 ms | 2 |

**`groupMs: 200` is zero-loss on BOTH relays and simultaneously the fastest
Cloudflare config.** There is no trade to weigh — it is now the default. One MoQ
group is one QUIC uni-stream, so 50 ms opened twenty streams a second where
200 ms opens five.

Two results worth keeping because they are counter-intuitive:

- **A longer Opus frame is not simply safer.** 10 ms frames were WORSE over
  Cloudflare than 5 ms (3.8% against 2.2%) and cost 42 ms of latency (118 ms
  against 76). Only on the LAN did bigger frames help. Frame size and group size
  are not the same lever.
- **`retain 300` produced no valid run over Cloudflare at all** — both attempts
  decoded too few frames to be a sample, while every other config on the same
  relay worked twice. Two consecutive failures at one setting is a signal, not a
  gap in the table; a longer retention window may be actively breaking the
  subscription. NOT explained.

⚠️ **CORRECTED — the 31% loss did NOT reproduce.** Two later runs at the
identical config gave **3.9%** (185 gaps of 4796) and **2.4%** (114 of 4808),
with key→ear 72 and 73 ms. So Cloudflare is **~14 ms slower than the LAN relay
and loses a few percent**, not a third. The single 1133-gap run stands as an
outlier nobody has explained, and the claim built on it — that the cadence is at
fault — was one run's worth of evidence dressed as a finding. Reproducing it was
the first thing to do about it, and it was not there.

(A 300 ms retention arm decoded only **29 frames** and is not a sample; it is
recorded so nobody reads its 51.7% as a result. The knobs are now exposed —
`--latencyMax --groupMs --frameUs` — so this can be swept properly when someone
wants the answer rather than an anecdote.)

**The Cloudflare relay is not just slower here, it is lossy** — 1133 gaps against
31 for the same publisher over the LAN, about a third of frames missing, and it
is audible as garbling rather than as delay. `seq` earns its place exactly here:
the receiver can see the counter skip, and nothing else on the path reports a
thing.

Worth being careful about what that does and does not say. The same Cloudflare
relay carried the built-in synth cleanly earlier, so this is not "Cloudflare is
broken" — it is this publisher, at 5 ms Opus frames grouped every 50 ms, over
that path, on this day. What changed with Live in the chain is the frame
cadence, not the bitrate. Not yet separated: whether the loss is the group
policy, the frame duration, or the wide-area path itself.

**Ableton costs about 29 ms over the built-in synth** on the best path
(29 → 58 ms), which is roughly what Live reports for itself: a 512-sample buffer
at 48 kHz is 10.7 ms, plus its stated 13.7 ms output latency, plus the loopback
hop.

## IT WORKS — Ableton Live played remotely, 58 ms key to ear

Press a key here, Drift sounds in Live on the other machine, and you hear it
back. 14 of 14 notes on both return paths.

| sound comes back over | typical | worst 1 in 20 | notes |
|---|---|---|---|
| WebRTC | 128 ms | 236 ms | 14 |
| **MoQ, relay on the LAN** | **58 ms** | 69 ms | 14 |

with the receipt at **7.50 ms** and MoQ decoding 4813 frames, **0 underruns**.

    key press -> 7.5 ms -> the M1 -> Web MIDI -> IAC Bus 1
      -> Live / Drift -> Multi-Output -> BlackHole
      -> MoQ (LAN relay) -> 58 ms total

**Ableton costs about 29 ms over the built-in synth** (29 -> 58 ms), which is
roughly what Live reports for itself: 512-sample buffer at 48 kHz is 10.7 ms,
plus its stated 13.7 ms output latency, plus the loopback hop.

### Two things that made this hard, both mine

**A permission grant is a thing to HOLD, not a step to perform.** A
`Browser.grantPermissions` grant lives only while the CDP client stays
connected. The launcher exited after printing the page log, so permission fell
back to "prompt", labels hid, and the capture the page had already opened went
on reporting a **live, unmuted, enabled** track carrying **digital silence**.
Measured in one second on one machine: the page's own capture 0.00010 (its
keep-alive only) against a freshly granted capture of the SAME device at
0.38763, with the microphone at 0.22437 as the control. BlackHole was never
broken, the Multi-Output was never misconfigured, Live was never misrouted.

**Verify the instrument before believing the signal.** Three separate tests said
"BlackHole is silent" and all three were the instrument: `afplay` over ssh has no
audio session, headless Chrome has no audio input, and a GUI app SPAWNED from
ssh runs outside the user's session and gets none either. The control that ends
it in one step is to capture something known to carry signal — the built-in
microphone cannot be digitally silent in a room, and when it reads 0.00000 the
browser is deaf, not the device.

### PARKED 2026-09-11: what is done, and the one piece left

**Done and verified:** the browser extension finds and loads plugins from every
root (`plugins/Stage-73 V2` loads and its meter reads 0.787); the capture
problem is solved (below); a jazz turnaround written over OSC plays and was
captured off BlackHole at -10.5 dB with the microphone at -8.9 as its control.

**`midisend.c` is the missing link and is HALF verified.** It builds on the M1
with the Command Line Tools, finds `IAC Driver Bus 1` and reports ready — but
nothing has yet confirmed a note reaching Live through it, because that needs
the track armed with monitoring In, which is `live-board.mjs`'s job. **Do not
record it as working until a note moves Live's meter.**

**Left to build — `live-board.mjs`:** join a relay room, turn `note.on`/`note.off`
into lines on `midisend`'s stdin, and stream BlackHole back as 20 ms frames. Then
`/keys/?room=pro-1` plays Live with no page changes, because the box page does not
know what a Raspberry Pi is.

⚠️ **It cannot dial out unattended the way the Pi does.** A capture started over
ssh is deaf, so this service has to live in the user's login session — a
LaunchAgent or a command in a terminal. That is a real difference from the box
and it belongs in the README rather than in somebody's surprise.

### ✅ RESOLVED 2026-09-11: how to capture in the user's session from ssh

The lesson above says a capture started over ssh is deaf. It does not say what
to do instead, so the rig sat paused on it. The answer is to stop trying to
START something in the session and instead ASK SOMETHING ALREADY IN IT:

    ssh mbp 'osascript -e '"'"'tell application "iTerm2" to tell current window \
      to tell current session to write text "ffmpeg -f avfoundation -i \":0\" ..."'"'"''

That is not a GUI app spawned from ssh — it is an AppleEvent to a process the
user already has running, so the work happens inside their audio session.

MEASURED, the same device, the same ffmpeg, the same minute, only the route
differing — and this A/B is the whole proof:

| route | built-in microphone |
|---|---|
| plain ssh | **-91.0 dB** (digital silence) |
| via iTerm2 in the live session | **-29.3 dB** (a real room) |

⚠️ **Always capture the microphone first.** It cannot be digitally silent in a
room, so it separates "the device is quiet" from "this process is deaf" in one
command — and a capture spawned over ssh reports exactly the same -91.0 dB for
both. On 2026-09-11 that mistake was made again, from inside this file, three
commands after reading the paragraph above it.

`launchctl asuser` is the documented way and needs root; there is no passwordless
sudo on this machine, so it is not the route here.

**End to end, through that route: Live -> Multi-Output -> BlackHole -> ffmpeg
reads -12.7 dB.** The capture problem is solved.

### ⚠️ RETRACTED: "Arturia is unlicensed and silent" — it is neither

An earlier version of this section said Stage-73 V2 loads, names itself and
produces no sound, and that Arturia was "almost certainly unactivated". **Both
claims are wrong and the reasoning behind them was worse than the conclusion.**
It is licensed, it is activated, and it sounds when played from the plugin's own
keyboard.

What actually happened, in the order the mistakes were made:

1. A clip was fired on the Stage-73 track and its output meter read 0 while
   Drift on the next track read 0.72. That was called an A/B. **It was not one**
   — nothing established that the two tracks differed only in their instrument.
2. The monitoring setting was blamed next (`In` does stop clips reaching the
   instrument, which is true and was not the cause here — both tracks were
   already on `Auto`).
3. Absence of `~/Library/Arturia` was read as "unactivated". Arturia does not
   have to keep a licence there, and **a missing file is not a negative
   result.**
4. Then the tracks were dumped in full and the real answer appeared: they were
   **EMPTY** — `devices: []`, named `1-MIDI`/`2-MIDI`, `output: "No Output"`,
   tempo 120 — while the screen showed Stage-73 and Drift at tempo 148. Live's
   pid had gone from 484 to 1414. **Live had restarted, and every reading after
   that point was taken from a document that no longer contained the thing being
   measured.**

⚠️ **ASK WHICH DOCUMENT YOU ARE TALKING TO BEFORE BELIEVING ANYTHING ABOUT IT.**
`/live/song/get/track_names` and `/live/song/get/tempo` cost one message each
and would have caught this at step 1. A silent meter on an empty track is not
evidence about a plugin, and this rig can restart underneath a session at any
time — a crash-recovery dialog, a reboot, a user opening another set.

⚠️ And: **do not diagnose a third party's product from an absence.** Three of
the four steps above were inferences from something missing — a zero meter, a
missing folder — and every one of them pointed away from the actual cause.

### Drift sustains, and the detector re-arms on silence

The onset detector fires above 0.02 and re-arms below 0.004. The built-in
triangle decays to 0.0001 in 450 ms, so it re-armed between notes; **Drift does
not**, so at 420 ms spacing only the FIRST note of thirty was ever counted. At
1300 ms spacing it is 14 of 14. A detector tuned to one instrument is not tuned
to instruments.

## STATE, PAUSED 2026-09-10

Everything below the MIDI line works. The audio return from Live does not yet.

| link in the chain | state |
|---|---|
| key press → the M1 (direct link) | ✅ 6.10 ms typical |
| Web MIDI → `IAC Driver Bus 1` | ✅ `midi out: IAC Driver Bus 1` |
| Live: Drift, input IAC, armed, monitoring In | ✅ set over OSC, one command |
| Live → Multi-Output → BlackHole | ✅ set by hand (Live's UI has no API) |
| **BlackHole → `getUserMedia` → the bus** | ❌ **unresolved — see below** |
| the bus → MoQ (LAN relay) → back | ✅ publishing, 2988 frames |

**The one open thread**: in `?instrument=ableton` the capture branch logged
**neither** `audio in:` **nor** `audio in denied:`. Both are `.then`/`.catch` on
one `getUserMedia`, so the promise is still PENDING rather than refused — which
is a different failure from a permission problem and should be diagnosed as
such. `audioCapture` IS granted for the origin (`launch-synth.mjs` does it over
CDP before navigating, and `midi` from the same grant worked). Suspect headless
Chrome's audio input enumeration rather than the grant.

Next step when picking this up: check whether headless Chrome resolves
`getUserMedia({audio:true})` at all on that machine, before touching the device
selection. A pending promise that never rejects is the same shape as
`audio.play()` and `AudioContext.resume()` — CLAUDE.md's "never let sound gate
the work" — so the capture should be armed and NOT awaited by anything else.

### How to bring it all back up

    # on the M1
    cd ~/positron && git pull
    node demo/server.mjs &
    MOQ_IP=<m1-lan-ip> ~/lan-relay.sh run &          # fingerprint is printed
    node rig/m1/launch-synth.mjs --ableton \
      --relay https://127.0.0.1:4443 \
      --relay-for https://<m1-lan-ip>:4443 \
      --cert <fingerprint>

    # from the dev Mac
    LIVE_HOST=<m1-lan-ip> node rig/m1/live-setup.mjs Drift 0
    node demo/server.mjs        # then open /rig/m1/play.html?room=proinst

`IAC` survives reboots (it is a plist flag). Live's audio output device survives
reboots. Live's SET does not — `live-setup.mjs` rebuilds it.

### Three of the four "clicks" were not clicks

**1. The Live restart is not needed.** `/live/api/reload` DOES rebuild the
handler list — it calls `clear_api()` then `init_api()`. What it reloads is
`abletonosc/*` and **not `manager.py`**, so a handler added to manager's list
needs a restart while one registered from inside an already-reloaded module does
not. `install-hook.py` appends the registration to `ViewHandler.init_api`, which
is re-run on every reload. Live never restarted, and it refuses AppleScript
`quit` anyway (AppleEvent timeout — a dialog it will not describe).

**2. IAC became visible to Live by itself** once the port existed and the API
reloaded. Its input routing list went from
`All Ins | Computer Keyboard | 2-MIDI | No Input` to including
`IAC Driver (Bus 1)`.

**3. The instrument loads over OSC.** `/live/browser/load 0 Drift` →
`[0,"Drift","loaded"]`, and the track renamed itself `1-Drift`. Live's browser
reports `Drift, Drum Rack, Drum Synth, External Instrument, Impulse, Instrument
Rack, Simpler`.

### What is genuinely left

- **Track routing**: input → `IAC Driver (Bus 1)`, arm, monitor In. All three are
  OSC-able (`/live/track/set/{input_routing_type,arm,current_monitoring_state}`)
  — the commands were in flight when the machine dropped off the network.
- **Live's audio output device → BlackHole 2ch.** This one looks genuinely
  manual: Live's Object Model has no audio-device API, so neither AbletonOSC nor
  an extension can reach it. Live's `Preferences.cfg` is an undocumented binary
  and not somewhere to guess.

### The four clicks, as originally written

1. **Restart Live.** `/live/api/reload` logs "Reloaded code" but does NOT rebuild
   the handler list, so the new browser handler is still `Unknown OSC address`.
   AppleScript `quit` timed out, which means a dialog is up.
2. **Preferences → Link/Tempo/MIDI → MIDI Ports → IAC Driver Bus 1 → Track: On.**
   Live enumerates MIDI ports at startup and its input routing list currently
   reads `All Ins | Computer Keyboard | 2-MIDI | No Input` — no IAC. A restart
   may fix this by itself.
3. **Preferences → Audio → Output Device: BlackHole 2ch**, so the page can
   capture what Live plays. macOS has no loopback without a virtual device.
4. **An instrument on a MIDI track** — which step 1 makes scriptable:
   `node live-osc.mjs get /live/browser/load 0 "Grand Piano"`.

### Why not ableton-mcp

`ahujasid/ableton-mcp` exists and does expose browser loading. It was not used
because AbletonOSC is already installed, enabled and MEASURED on this machine
(0.063% worst clock error across four tempos), so the missing capability is
forty lines rather than a second Remote Script plus an MCP server duplicating a
working control path. Worth revisiting if the browser handler proves fragile.

---

# ⏸ PARKED 2026-09-11 — it works, and the setup is too heavy to keep warm

Everything below was measured on the day it was parked. Nothing here is broken;
the reason to stop is cost, not failure, and that distinction is the whole point
of writing it down. **11/11 links pass.** `node rig/m1/live-check.mjs`
re-runs the lot in about 25 seconds.

## What is proven, so a revisit does not re-derive it

- **The chain is real, end to end.** `midisend` → IAC Driver Bus 1 → Ableton
  Live 11 → Arturia **Stage-73 V2** → Multi-Output → BlackHole 2ch → ffmpeg.
  MEASURED: a held C major 7th reads **−29.1 dB peak / −46.8 dB mean** against a
  **−91.0 dB** silence baseline recorded the same way seconds earlier — 61.9 dB
  of separation, so it is not ambient noise and not a stuck meter. Before this,
  `midisend.c` was half-verified: it built, it found the port, and **no note had
  ever been confirmed reaching Live.** It has now.
- **The clipping is fixed.** The track fader was at 0.85 (unity) and the same
  chord peaked at **0.0 dB — full scale**. At **0.52** it peaks at −29.1 dB.
  ⚠️ That is arguably too much headroom now: −6 to −12 dB is the usual target
  for something about to be streamed, and −29 will sound thin next to anything
  else. Somewhere around 0.65 is the thing to measure first on a revisit.
- **Live needs no clicking to be readied**, except its audio OUTPUT device.
  `live-setup.mjs` loads the instrument, routes the input, arms and sets
  monitoring over OSC. The Live Object Model has **no audio-device API**, so
  Preferences → Audio → Output stays manual. That is a permanent limit, not a
  gap in the script.
- **Playing it costs 6.00 ms over a direct peer link and 68.90 ms via the
  relay** (2026-09-10, 100 alternating presses). Presses over 100 ms: **0 of 100
  direct, 4 of 100 relayed.** Against `research/music-jamming`'s threshold —
  under 25 ms one-way is real ensemble playing — the direct link is inside and
  the relay is outside. **Relay for asking, direct link for playing.**

## 🔴 Two traps this cost, both already paid for

- **An avfoundation device index is a shared mutable global, exactly like a
  fixed port.** `-i ":0"` meant the microphone when the section above was
  written and means **BlackHole** today. Both read **−91.0 dB** — one reading
  proves *"this capture is deaf"*, the other proves *"nothing is playing"*, and
  they are opposite conclusions from an identical number. **This document's own
  deafness control had been measuring the wrong device.** Resolve by NAME from
  `-list_devices true`, every run; `live-check.mjs` does.
- **`ssh localhost` is not "local".** The first run of `rack-agent.mjs` reported
  *"the studio machine answers: no ssh to localhost"* — about the machine it was
  running on. `M1_SSH=local` runs commands directly, which also drops the
  iTerm2 AppleEvent dependency entirely: the difference between *needs a
  terminal window open* and *needs to be started once from one*.

## ⚠️ Why it is parked: the setup is heavy, and here is exactly how heavy

Six things must ALL be true before a single note sounds, and **four of them
cannot be restored from this repo**:

| what | restorable from the repo? |
|---|---|
| the Mac awake and not asleep | no — physical |
| Ableton Live 11 open, with this set loaded | no |
| AbletonOSC selected as a **Control Surface** (installed is not enough) | no — a Preferences click |
| **Preferences → Audio → Output = BlackHole / Multi-Output** | no — no OSC API exists |
| IAC Driver Bus 1 enabled for Track input | no — a Preferences click |
| the instrument, routing, arm, monitoring | **yes** — `live-setup.mjs` |
| `midisend` built | **yes** — `live-check.mjs` builds it |
| the relay agent running in a login session | yes, but must be STARTED by hand |

Compare the box: it is a service, it dials out on boot, and it survives a power
cut unattended. This rig cannot — **a capture started over ssh is deaf**, so the
agent has to live in somebody's login session. That is a real and permanent
difference between the two instruments and it is the reason to park rather than
to automate harder.

**The honest summary: it is a performance instrument, not an always-on one.**
Wake it deliberately for a session; do not expect `/able/` to be green on a
random Tuesday. The page is built for that — it reports silence AS silence.

## To wake it again

```sh
# on the studio Mac, in a terminal window (NOT over ssh)
cd ~/positron-rack && M1_SSH=local node rack-agent.mjs --room pro-1

# from anywhere
node rig/m1/live-check.mjs          # LIVE_HOST=<ip> if remote
open https://positron.studio/able/
```

To stop it: `pkill -f rack-agent.mjs` on the Mac, or close the terminal window.
`/able/` then shows *"Nobody is answering"*, which is correct and is asserted.

## If it is revisited, do these in this order

1. **Re-measure the fader.** −29.1 dB is over-corrected; try 0.65 and read the
   peak rather than computing it — Live's 0..1 volume is not linear in dB.
2. **Shell `play.html`.** It is the actual instrument and it is still ungraded:
   its own CSS, no `mount()`, and a dynamic `import('./moq-audio.mjs')` of a
   file that does not exist beside it — which `build.mjs`'s import check would
   refuse, correctly.
3. **Decide the audio path before writing any more of it.** Direct peer link,
   measured, not the relay. §"Playing it costs" above.
4. **Leave the Preferences items alone.** Three of the six blockers are clicks
   with no API. Automating around them is where this would get expensive.
