# CV over the network for "Play My Synth" (2026-11-15)

> For the "Play My Synth" offer (Estonia and Ukraine play ECCM's synths, end of
> January 2027 if funded): *"3 Ukrainian musicians need to send CV over the
> network as close to real time as possible"*, against *"MIDI-to-CV is too crude"*.
> Labels: **READ** (opened today, linked; fetched pages are summaries),
> **SECONDHAND** (a search summary), **MEASURED** (positron's own, path given),
> **INFERRED** (my reasoning). Nothing was bought, built or run.

## Verdict

"Too crude" is true of **7-bit MIDI 1.0 CC at a slow rate**, which is what
Asep's midiMESH sends today, not of control data as such. The answer is
**control data, not audio**: floats at about 1 kHz per channel, timestamped on
a shared clock, over UDP or an unreliable WebRTC data channel, played out after
a fixed delay by a DC-coupled interface at ECCM. Tallinn to Kyiv is
about 17 ms one way on the backbone, so the network fits the ensemble band; the
Ukrainian last mile in a winter of blackouts is the real risk. CV as audio
(an ES-8 at each end over JackTrip) is the fallback for anything at audio rate.

## 1. Asep's GitHub: what is relevant

[bepitulaz](https://github.com/bepitulaz) shows 96 public repositories
(READ, 2026-11-15), mostly web work; the music hardware is in [nanassound](https://github.com/nanassound):

| repo | what it does | language | licence | last push |
| --- | --- | --- | --- | --- |
| [midimesh_esp32](https://github.com/nanassound/midimesh_esp32) | ESP32-C3 controllers on AtomVM, MIDI CC over UDP broadcast, port 4000; **"Control Voltage (coming soon): Wireless MIDI to CV for Eurorack"** | Elixir, KiCad | firmware Apache 2.0, hardware CERN-OHL-W (READ, `firmware/LICENSE.md`, `hardware/LICENSE.md`) | 2025-12-23 |
| [midimesh_desktop_receiver](https://github.com/nanassound/midimesh_desktop_receiver) | UDP to MIDI bridge: raw bytes from port 4000 to a MIDI output via `midiex` | Elixir | MIT | 2025-11-22 |
| [eurorack-nanassound](https://github.com/nanassound/eurorack-nanassound) | power, mult, 4 channel audio input, and **EuroPlatvorm**: an ESP32-C6 Eurorack board with a stacking connector "for I/O daughter boards"; its 2026-09-18 review says fabrication BLOCKED | KiCad, Python | CC BY-SA 4.0 (README) | 2026-09-22 |
| [conductr](https://github.com/nanassound/conductr) | browser generative MIDI sequencer, C in WASM, an LLM "director", Web MIDI, clock sync | JavaScript, C | Apache 2.0 | 2026-02-14 |
| [midi_ctrl](https://github.com/nanassound/midi_ctrl) | MCP server driving a MicroFreak by CC | Elixir | MIT | 2025-11-20 |

His FOSDEM 2026 slides
([PDF](https://archive.fosdem.org/2026/events/attachments/QQRETA-midimesh_network_midi_with_elixir_on_esp32_via_atomvm/slides/267532/fosdem202_hvywy3u.pdf),
READ, all 20 pages) give the numbers that matter: **"Raw ADC (0-4095) to MIDI
(0-127)"**, **"150ms polling cycle"**, `Process.sleep(150)`, UDP broadcast to
`255.255.255.255:4000`, plain 3 byte CC messages, no timestamps, no sequence
numbers. No Play-a-Synth code is public in either account (READ).

**What he brings (INFERRED):** Elixir on ESP32, Eurorack boards, a LAN-only
UDP MIDI design, and an announced, unpublished CV module; EuroPlatvorm with a
CV daughter board is the likely ECCM end. **Where the owner meets it:** the
wide area half midiMESH lacks (internet transport, NAT, shared clock, jitter
buffer, measurement). A 12 bit ADC read every 150 ms and cut to 7 bits is the
crude case, in his own code.

## 2. Play-a-Synth in 2026

- Co-founders: **Jonna Laaksonen** (developing it since 2017) and **Asep Bagja
  Priandana** (READ, [press page](https://playasynth.com/press)). The August
  note named only Jonna.
- Catalogue today: **4 units, all in Finland**: SE-02, Pulse 2, Reface DX,
  DeepMind 12 (READ, [list](https://playasynth.com/public/list)). August had
  six; the OB-6 and Minilogue are gone.
- Still MIDI in, audio back over "WebRTC and other peer-to-peer techniques";
  **still no published latency**, no modular, no CV, nothing in Estonia or
  Ukraine, no ECCM (READ, [home](https://playasynth.com)).
- ECCM, Tallinn, Herne 11A, founded 2021 (SECONDHAND, a search summary of
  [eestimuusikapaevad.ee](https://www.eestimuusikapaevad.ee/en/venue/estonian-centre-for-contemporary-music-eccm/)).
  It also mentions **Buchla and Serge synthesizers**; the page did not say so
  when fetched, so this is unconfirmed (question 1).

## 3. Why MIDI-to-CV is called crude

- **7 bits.** A CC has 128 steps. Over 10 V that is 78 mV per step (INFERRED);
  at 1 V/oct that is about 94 cents, nearly a semitone, so a swept pitch or
  filter CV staircases audibly. Buchla uses 1.2 V/oct, 100 mV a semitone
  (SECONDHAND, [Buchla guides](https://buchla.com/guides/200e_Users_Guide_1.8.pdf)).
- **Events, not a signal.** Notes are semitones, gates on and off, the CV between
  events is held; slewing hides steps at the cost of lag (INFERRED).
- **Rate.** MIDI 1.0 DIN runs at 31,250 baud; *"A three-byte MIDI 1.0 message
  requires nearly 1 millisecond"* and a burst on all channels can delay the
  last by up to 16 ms (READ, [Wikipedia](https://en.wikipedia.org/wiki/MIDI)).
  Over UDP the wire is not the limit, the sender is: midiMESH sends at most
  6.7 updates per second per knob (150 ms poll, READ above).
- **Jitter.** No timestamps, so network jitter lands directly on the voltage.

**Alternatives:** 14-bit CC (MSB and LSB pair, 16,384 steps, about 0.6 mV over
10 V, INFERRED) or NRPN, both still MIDI 1.0 and twice the bytes; **MIDI 2.0
UMP**: 32-bit controllers, 16-bit velocity, per-note controllers (READ,
[midi.org, Feb 2026](https://midi.org/the-state-of-midi-2-0-high-resolution-performance-and-the-rise-of-profiles-update-feb-2026)),
ending at our own converter since no vintage synth speaks it (INFERRED); **OSC
floats** with timetags (prior art in `research/music-jamming-2026-08.md`);
**a custom packet** of samples at a fixed rate; **raw sample streams** (CV as audio).

## 4. Ways to send CV, compared

| | (a) control packets, DAC at far end | (b) CV as audio |
| --- | --- | --- |
| resolution | float32 or 16 bit in transit; the DAC decides: MCP4728 is 12 bit (2.4 mV over 10 V after gain, about 3 cents), an ES-8 is 24 bit (READ below) | 24 bit |
| rate | 500 Hz to 2 kHz, chosen per channel (INFERRED: enough for gestures, LFOs, envelopes; not audio-rate FM) | 48 kHz, audio-rate FM works |
| bandwidth | 8 ch x float32 x 1 kHz = 256 kbit/s, 100 packets/s if 10 samples each (INFERRED) | about 1.15 Mbit/s per channel uncompressed at 48 kHz/24 bit (INFERRED) |
| latency | network + playout buffer + about 1 ms DAC | network + playout + two interface buffers |
| jitter | absorbed by a timestamped fixed-delay buffer, values interpolated | absorbed by the audio jitter buffer; a gap is a voltage glitch |
| loss | interpolate or hold; a lost packet is a short ramp, not a click (INFERRED) | a dropout is a step in a pitch CV |
| hardware, sender | browser or a midiMESH-shaped box | DC-coupled interface: [ES-8](https://www.expert-sleepers.co.uk/es8.html) (4 in, 8 out, about ±10 V, 24 bit, SECONDHAND) or ES-9 |
| hardware, ECCM | ES-8 or ES-9, or a microcontroller, DAC and op-amp stage ([MCP4728](https://www.adafruit.com/product/4470): four 12 bit outs, I2C, $7.50, READ), scaled for 1 V or 1.2 V/oct | a second DC-coupled interface |
| transport | UDP, or WebRTC data channel `{ordered:false, maxRetransmits:0}` | JackTrip or SonoBus in PCM; **not Opus** (lossy, and WebRTC's voice processing would mangle DC, INFERRED); NINJAM is interval-delayed, not real time |

**(c) Hybrid:** slow CV and gates (as timestamped edges) in packets, and only
the channels that need audio rate as audio. One clock serves both (INFERRED).

**Real budget, Tallinn to Kyiv.** Backbone round trip **34.4 ms min, 34.8 ms
average**, spikes to 51 ms on 2 to 4 November (READ,
[WonderNetwork](https://wondernetwork.com/pings/Tallinn/Kyiv), 2026-11-15), so
**about 17 ms one way**. Lviv: no figure found; INFERRED similar or a few ms
less. Pings exclude the last mile (mobile, Starlink). Positron's own one-way numbers:
data only 1.0 ms p50 on a direct data channel, 16.2 ms through the Cloudflare
SFU, 34.5 ms through a Durable Object relay; MoQ audio 32.6 ms glass to glass;
MoQ native 17.9 ms (MEASURED, quoted in
`research/jamulus-sonobus-2026-11-06.md` and `research/music-jamming-2026-08.md`).
So a Kyiv knob reaches an ECCM jack in **about 25 to 40 ms** with a 5 to 15 ms
playout buffer, and the sound returns in about the same (INFERRED).

**What musicians tolerate** (`research/music-jamming-2026-08.md`): under 25 ms
one way is ensemble playing, 25 to 50 ms leader and follower, above 50 to 60 ms
"heavily impaired"; unbuffered ±10 to 15 ms jitter hurts more than equal fixed
delay. For a remote instrument the loop is the round trip, hand to ear.

**War-time networks are a robustness requirement.** Kyivstar, 2025-11-20:
*"more than 30% of the network is without power"*, blackouts "12 hours or more
daily", 15 to 20 % of home subscribers with router backup (READ,
[Kyiv Post](https://www.kyivpost.com/post/64620)); a global Starlink outage cut
the front line for hours (SECONDHAND,
[Kyiv Independent](https://kyivindependent.com/ukraine-affected-as-starlink-suffers-global-outage/)).
So a site may drop mid-piece: reconnect in seconds, fade each CV to a safe
value, stay playable from Estonia alone (INFERRED).

## 5. What positron already has

- **The patchbay** (`demo/shell/bay.mjs`): `value` and `clock` are light media
  that may ride `relay`, `datachannel` or `websocket` (`LIGHT_VIA`). A CV
  channel is a `value` link; ECCM is a `device` node.
- **The relay** (`workers/relay/src/index.js`): 1000 messages/s and 8 MiB/s
  per socket. Three musicians at 100 packets/s fit (INFERRED), but at 34.5 ms
  it is the slow arm; the data channel or SFU is the one to use.
- **A shared clock**: 0.69 ms on one Mac, 2.7 ms Mac to Pi, over a 64 to 74 ms
  relay path (MEASURED, `plans/plan-jam.md`), enough for fixed-delay playout.
- **The Pico CV research** (`research/pico-open-issues-and-modular-2026-10-04.md`):
  Workshop Computer, EuroPi on a Pico 2 W (six 0 to 10 V outs, wifi),
  Midi2euroPiW (UDP to a EuroPi), ES-9. Nothing bought. And a Pi at a second
  site already runs as a remote node.

**To build (INFERRED):** a CV packet (seq, timestamp, n x float32); a sender
page (later midiMESH firmware speaking it); the ECCM receiver with jitter
buffer, interpolation, calibration, 1 V or 1.2 V/oct scaling and safe values on
loss; the audio return; a knob to jack and jack to ear harness.

## 6. Recommendation for the reply

**Architecture, in five lines:**
1. Each Ukrainian musician: a browser page (or a midiMESH box) emits CV as
   timestamped float frames, 1 kHz, 10 samples per packet.
2. Transport: WebRTC data channel, unordered and no retransmits, through the
   Cloudflare SFU or direct; UDP for boxes.
3. ECCM: one receiver (Pi plus ES-8, or ESP32-C6 plus DAC on EuroPlatvorm)
   plays out at a fixed delay on the shared clock, interpolates, outputs ±10 V.
4. Audio back: the synths' output as PCM or high-bitrate Opus to the players
   and to the room.
5. Audio-rate CV only if the piece needs it: an ES-8 at the sender over JackTrip.

**Measure first, before the application promises a number:** a laptop at a
Ukrainian site sends a 1 kHz ramp and square to a Pi in Tallinn. Read one-way
latency from shared-clock timestamps (2.7 ms agreement, above), plus jitter,
loss and the cost of a 5, 10 and 20 ms playout buffer; then put a DAC on the Pi
and record its output. Repeat on the musician's real line, on mobile, and in
a blackout hour.

**Main risks:** the Ukrainian last mile in January; pitch accuracy
(calibration, 1.2 V/oct on a Buchla); the return audio, not the CV, setting
the felt latency; Asep's CV module unpublished; nothing measured end to end.

**Questions to ask the team:**
1. Which ECCM instruments exactly (Buchla, Serge, Eurorack), and their CV
   standard: 1 V or 1.2 V/oct, voltage ranges, banana or 3.5 mm?
2. How many CV and gate channels per musician, and does any need audio rate?
3. What does "real time" mean for the piece: playing in time with each other,
   or shaping a drone where 100 ms is fine?
4. What do the players use: browsers, controllers, their own modulars (then a
   DC-coupled interface each)?
5. Audio return: to players, room, an online audience, a recording?
6. What does Nanas Sound build, and when is the CV module due?
7. Where are the three, on what connections, with what backup power?

## Hardware for a high-resolution control signal to CV (added 2026-11-15)

Prices READ from shop pages through a web search on 2026-11-15, VAT included unless marked:

| device | what | price |
| --- | --- | --- |
| Expert Sleepers ES-8 | Eurorack module, USB audio, 8 DC-coupled outputs and 4 inputs, 24 bit | €505 to €528 ([SchneidersLaden €509](https://schneidersladen.de/en/expert-sleepers-es-8), [Sound of You €505](https://soundofyou.eu/eurorack-2/es-8), [Music Store €427.70 without VAT](https://www.musicstore.com/en_OT/EUR/Expert-Sleepers-ES-8/art-SYN0005856-000)) |
| Expert Sleepers ES-9 | 16 outputs, 14 inputs, 24 bit | €618 to €619 ([Thomann](https://www.thomann.de/ie/expert_sleepers_es_9.htm), [SchneidersLaden](https://schneidersladen.de/en/expert-sleepers-es-9)) |
| Expert Sleepers FH-2 | USB MIDI to CV, 8 outputs, takes 14 bit CC, NRPN and pitch bend | €318 ([Thomann, SchneidersLaden](https://www.perfectcircuit.com/expert-sleepers-fh-2.html)) |
| DAC8568 / DAC8564 (TI), AD5686 (ADI) | 16 bit DAC chips, 8 / 4 / 4 channels, 2.5 V internal reference | chips only; not found in Oomipood's own stock, so through Farnell via Oomipood as before (INFERRED) ([DAC8568](https://www.ti.com/product/DAC8568), [AD5686](https://www.analog.com/en/products/ad5686.html)) |

14 bit MIDI: a controller sent as two 7 bit halves (CC 0 to 31 the coarse part, CC 32 to 63 the fine part), or as NRPN
(CC 99 and 98 pick the parameter, CC 6 and 38 carry the value), or pitch bend, which is 14 bit on its own: 16,384 steps,
about 0.6 mV over 10 V. MIDI 2.0 controllers are 32 bit.
