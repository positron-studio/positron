# plan-palm-sound: the Palm Z22 as a sound source, from beeps to a player, and a feedback loop through the room

Status (2026-11-10): a plan and two Pi side scripts (`rig/palm/tones.mjs`,
`rig/palm/listen.mjs`), neither run on hardware. Asked 2026-11-10: *"plan and do
sound tests for palm from beeps to actual players. plan ahead also a feedback
loop. ftrack has mic in ch 2"*.

Related: `plan-screens-odd.md` (plan-palm-z22, sections 10 and 11),
`plan-feedback-demo.md` (L1, the bay consents to a loop), `rig/palm/`.

Marks: **READ** from the Palm OS SDK headers in the `positron-palm-dev` image
(`/opt/palmdev/sdk-5r4/include/Core/System/SoundMgr.h`, the same API as sdk-5r3;
the palmOne SDK samples in `/opt/palmdev/PalmOne/Samples`) or from this
repository's code. **MEASURED** on hardware. **INFERRED** for everything else.
Nothing in this plan is MEASURED yet except what it quotes from section 11 of
`plan-screens-odd.md`.

## 1. What the Z22 can play

### 1.1 The hardware (INFERRED)

- One small internal speaker, no headphone jack (the jack is READ in
  plan-palm-z22 1). Expect little below about 500 Hz and a resonance somewhere
  between 2 and 4 kHz. T1 measures it.
- No microphone that an app can use (the Z22 has no voice recorder). So
  `sndInput` streams are not expected to work. The Pi's mic is the ear.
- Palm OS Garnet 5.4 on ARM. Our app is 68k code run by PACE.

### 1.2 Beeps: `SndDoCmd` (READ)

`SndDoCmd(NULL, &cmd, noWait)` on the shared channel. `SndCommandType` is
`cmd` (UInt8), `param1` (Int32), `param2` (UInt16), `param3` (UInt16). So a
duration is at most 65,535 ms. Amplitude is 0 to `sndMaxAmp`, which is **64**.

| command | param1 | param2 | param3 | waits? (header comment) |
| --- | --- | --- | --- | --- |
| `sndCmdFreqDurationAmp` (1) | Hz | ms | amp 0 to 64 | **blocks for the whole duration**, except amp 0, which returns at once |
| `sndCmdNoteOn` (2) | MIDI key 0 to 127 | max ms | velocity 0 to 127, interpolated to amplitude | returns at once; any later sound interrupts it |
| `sndCmdFrqOn` (3) | Hz | max ms | amp 0 to 64 | returns at once; any later sound interrupts it |
| `sndCmdQuiet` (4) | 0 | 0 | 0 | stops the current sound |

Also `SndPlaySystemSound(sndInfo .. sndClick)` (seven system beeps) and
`SndGetDefaultVolume` / `SndSetDefaultVolume` (alarm, system, master).

**A finding about frame.c, for the agent that owns it.** Its `tone()` sends
`sndCmdFreqDurationAmp` with `noWait = true`, and its header comment says the
tone plays without waiting and a new tone cuts the one playing. The SDK header
says that command blocks for the whole duration. If `noWait` does not override
that on OS 5 (INFERRED: it may not), the event loop stops for every tone: no
pen lines, no frames, no status line until the tone ends, and a "cut" tone
only starts after the first one has finished. T1 tells which (section 2).
Either way the cure is cheap: `sndCmdFrqOn` for a tone, `sndCmdNoteOn` for a
note, `sndCmdQuiet` for off. Those three are READ as non-blocking.

The waveform is not documented. On the 68k Palms it was a square wave from the
Dragonball's PWM; on OS 5 ARM devices it is synthesised (INFERRED). T1's
recording shows the harmonics.

### 1.3 MIDI files: `SndPlaySmf` (READ)

- `SndPlaySmf(chan, sndSmfCmdPlay, smfP, &opts, &chanRange, &callbacks, bNoWait)`.
  `sndSmfCmdDuration` returns the length in ms instead of playing.
- **Standard MIDI File format 0 only.**
- `SndSmfOptionsType`: start and end in ms, `amplitude` 0 to 64, and
  `interruptible`, **true by default**: a tap on the screen or a button press
  stops the music. `SndPlaySmfIrregardless` (OS 4) plays regardless of that
  flag. `SndSmfChanRangeType` picks MIDI channels.
- Callbacks: a completion function, and a **blocking hook**
  `Boolean f(chan, userData, sysTicksAvailable)` called while a synchronous
  play runs; return false to abort. That hook is where a synchronous player
  keeps reading the serial link and honours a stop.
- The MIDI database: records start with signature `'PMrc'`, a byte offset to
  the SMF data and a name of up to 32 bytes. `SndCreateMidiList(0, true, ...)`
  lists every MIDI record on the device (creator 0 is a wildcard). The Z22's
  System MIDI Sounds database was MEASURED present (plan-screens-odd 10).
- Polyphony is not stated. INFERRED: one voice, the Sound Manager's tone
  generator, so a chord plays as one note. T4 measures it.

### 1.4 PCM streams: `SndStreamCreate` (READ)

- New in OS 5. Present when `FtrGet(sysFileCSoundMgr, sndFtrIDVersion, &v)`
  succeeds (the palmOne sample `Common.c:118` checks exactly this);
  `sndMgrVersionNum` is 100.
- `SndStreamCreate(&ref, sndOutput, rate, type, sndMono, callback, userdata,
  buffsize, armNative)`. `rate` is frames per second. `buffsize` is a
  preferred size in frames, "not guaranteed", 0 for the default.
- Sample types: `sndInt8` 0x01, `sndUInt8` 0x11, `sndInt16Big` 0x02,
  `sndInt16Little` 0x12, 32 bit and float in both byte orders. In a 68k build
  `sndInt16` means big endian, so the app names the order explicitly.
- The callback is `Err cb(userdata, ref, buffer, numberOfFrames)`: **pull**.
  The Sound Manager asks for a buffer and the app fills it.
- `SndStreamCreateExtended` adds `sndFormatIMA_ADPCM`, `sndFormatDVI_ADPCM`,
  `sndFormatMP3`, `sndFormatAAC`, `sndFormatOGG`, with a callback that sets
  how many bytes it filled. Whether the Z22 ships those decoders is unknown
  (INFERRED: probably not MP3, it shipped no music player).
- Volume per stream (0 to 1024 is the usual scale, INFERRED; the cookies
  `sndSystemVolume` -1, `sndGameVolume` -2, `sndAlarmVolume` -3 are READ), pan
  -1024 to 1024, pause, stop, delete.
- **Can a 68k app under PACE use it? READ: yes, on palmOne devices.** The
  palmOne sample `MyPlayer` (`PlayForm.c:326`, `RecordForm.c:215`) is a 68k
  app that calls `SndStreamCreateExtended` with `armNative = false` and a 68k
  callback, at 8,000, 11,025, 16,000, 22,050, 32,000 or 44,100 Hz, `sndUInt8`
  or `sndInt16Little`. It reads its file inside the callback and stops the
  stream from inside it at the end.
- INFERRED and to be designed around: the callback runs on the sound thread,
  through PACE, so it is short and touches no UI. It copies from a ring buffer
  that the event loop fills from the serial link, writes silence and counts an
  underrun when the ring is empty, and finds the ring through `userdata`, not
  through globals.

### 1.5 What it costs on the link (INFERRED until T6)

| stream | bytes a second |
| --- | --- |
| 8,000 Hz, 8 bit, mono | 8,000 |
| 11,025 Hz, 8 bit, mono | 11,025 |
| 22,050 Hz, 8 bit, mono | 22,050 |
| 11,025 Hz, 16 bit, mono | 22,050 |
| 4 bit IMA ADPCM at 22,050 Hz, if the codec is there | about 11,000 |
| a tone packet | 7 bytes a note |
| a 1 bit frame | 3,205 bytes |

The link's speed is **not measured yet**: pframe's status line prints KB/s and
`send.mjs --cycle` prints frames a second per depth (plan-screens-odd 11 says
not yet measured). If the visor port really runs at the 115,200 baud the app
asks for, the ceiling is about 11.5 KB/s and only 8 kHz 8 bit PCM fits. Over
USB the baud is usually ignored and the link is faster (INFERRED). That one
number decides T5's format.

## 2. The test ladder

Common to every step:

- Pi side: `sudo modprobe visor`, pframe running on the Palm, one writer on the
  tty at a time (`tones.mjs` and `send.mjs` writing together interleave bytes
  inside a packet).
- Listening: `node rig/palm/listen.mjs <secs> [--sends sends.jsonl] [--wav f.wav]`
  on the Pi. Under jackd it adds one JACK client (ffmpeg's) fed from
  `system:capture_2`; with jackd down it opens the card with `arecord` and
  keeps channel 2. It prints RMS and peak in dBFS, the strongest frequency,
  every onset with its pitch, inter-onset statistics, and, given a send log,
  latency from send to sound. Tested on this Mac against a fake `arecord`
  producing three 440 Hz beeps a second apart: it found three onsets at 500,
  1,500 and 2,500 ms, 440 Hz each, sd 0.0. Not run on the Pi.
- Latency: start `listen.mjs N --sends s.jsonl` first, then
  `tones.mjs /dev/ttyUSB1 <test> --log s.jsonl`. Both are on the Pi, so one
  clock. The capture's start time is known to about a JACK period plus
  buffering, 10 to 30 ms (INFERRED), so a latency is an upper bound until the
  capture is calibrated (a click from the Fast Track's output looped into input
  2 would calibrate it; its outputs are not cabled, HANDOFF 2026-10-15).
- First, the floor: `listen.mjs 10` with the Palm silent. JACK on this card
  read about -80 dBFS with nothing plugged in (positron-hardware); a mic in a
  room will read higher. Set `--floor` about 15 dB above what it reads.

| step | from the Pi | listen for | measure |
| --- | --- | --- | --- |
| **T1** a beep | `tones.mjs dev t1`: five `'P' 'T'` packets, 440 Hz, 300 ms, amp 32, 1.5 s apart | five beeps of the same pitch and length | level in dBFS at a fixed mic distance; strongest frequency against 440; latency median and spread over 5; **whether pframe's status line and pen lines keep moving during a 2 s tone** (`--hz 440` with a longer tone via `send.mjs --tone 440:2000`): that is the blocking question of 1.2. Repeat at 220, 880, 1760, 3520 Hz for the speaker's response |
| **T2** a scale and a chord | `tones.mjs dev t2 --step 125`: C major up and down, one packet per note, then C E G as 30 ms notes for a second | even steps; a buzzing arpeggio that reads as a chord | inter-onset mean and sd against 125 ms (jitter from the Pi's timer, the USB link and the Palm's event loop together); pitch per onset; repeat at `--step 60` and `30` to find where notes merge or drop |
| **T3** velocity and note off | `tones.mjs dev t3`: A4 at eight velocities mapped onto amp, then a 2 s note cut by a zero amp tone after 300 ms | eight steps of loudness; the long note stopping at 300 ms | dBFS per step (is amp linear in dB or in amplitude?); the cut: if the note runs 2 s, the blocking of 1.2 is confirmed. After the `'P' 'N'` and `'P' 'Q'` packets exist (section 5, S3), the same test with real note on and quiet |
| **T4** a MIDI file | new packet `'P' 'M' len_hi len_lo` then an SMF format 0 file of up to about 4 KB; the app copies it into a chunk and plays it with `SndPlaySmf`, amplitude capped, `interruptible = false`, the blocking hook pumping the link. And `'P' 'S' n`: play record n of `SndCreateMidiList`, no transfer at all | the tune; whether a two note chord in the file sounds as two notes | duration against `sndSmfCmdDuration`; onset timing of a known file against its own note times; polyphony from the spectrum of a held chord (two fundamentals or one) |
| **T5** a PCM stream | new packet `'P' 'A' len_hi len_lo` then that many raw samples (8,000 or 11,025 Hz, 8 bit unsigned first, 16 bit little endian if the link allows), into a ring of about 0.5 s; the stream starts when the ring is half full; a sine, then a voice, from a new `rig/palm/pcm.mjs` | clean sine; clicks or gaps are underruns | the app counts underruns on the status line (`u<n>`); the Pi sends at 100, 101 and 103 % of the rate to see drift; THD of the 1 kHz sine from the recording; latency from the first sample sent to sound (the ring dominates) |
| **T6** the ceiling | frames and sound together: `send.mjs --fmt 1 --fps 0` with T2 notes; then frames with T5 PCM | does sound break when frames flow, do frames slow when sound plays | frames a second and KB/s from pframe's status line with and without sound; T2's jitter with frames flowing; T5's underruns with frames flowing; the most PCM bytes a second with no underrun in 60 s |

## 3. The feedback loop, planned ahead

```
Palm speaker -> air -> mic -> Fast Track input 2 -> JACK capture_2 -> Pi (follow) -> USB serial -> Palm
                                                                     \-> Palm screen (a picture)
```

### 3.1 Three loops, smallest first

- **F1, a pitch follower that answers itself (notes).** The Pi hears a pitch
  f and answers with a tone at f times a ratio (3/2, a fifth), folded back into
  the speaker's good range. The Palm hears nothing; the room carries it. The
  answer is heard, analysed and answered again, so the loop walks a chain of
  fifths and wraps. A ratio of 1 holds one note for ever; 2^(1/12) climbs
  chromatically. Level decides amplitude with a gain under 1 each trip, so
  without a new impulse (a tap on the Palm, a clap in the room) it fades. It
  sounds like a stepped arpeggio with a tempo set by the loop delay.
- **F2, level to picture.** The level as a bar and the pitch as a dot, sent as
  1 bit frames (3,205 bytes each). Runs beside F1 at a few frames a second.
- **F3, Larsen through the Pi (PCM).** Mic to Pi to a PCM stream to the Palm
  speaker. The loop delay is the PCM ring plus the capture, 100 to 500 ms
  (INFERRED), so it is a delay line, not an instant howl: echoes that pile up,
  then a tone at whichever frequency the speaker, the room and the mic favour.
  It needs T5 working.

### 3.2 Delay budget (INFERRED, MEASURED by T1 and T5)

| leg | estimate |
| --- | --- |
| Pi write to the Palm's receive buffer | 1 to 5 ms |
| Palm event loop until `pump()` runs (`EvtGetEvent` with a 1 tick timeout) | up to 10 ms |
| Sound Manager start | unknown, T1 |
| air, 30 cm | 1 ms |
| JACK capture, `-p 512 -n 3` at 48 kHz | 11 to 32 ms |
| analysis window: level 10 ms; pitch 4,096 samples | 10 / 85 ms |
| **F1 round trip** | **about 110 to 150 ms**, so about 7 to 9 answers a second |
| F3: add the PCM ring | plus 250 ms at a 0.5 s ring started half full |

### 3.3 Gain staging and howl safety

- **A hard cap on the Palm.** frame.c clamps amp to `sndMaxAmp` (64). Add a
  compile time `AMP_CAP` (start at 40) applied to every tone, note velocity,
  MIDI amplitude and stream volume. The Pi cannot exceed it.
- **A cap on the Pi.** `tones.mjs --max` (default 32) and the same in the
  follower. The follower's gain per trip is under 1 (start at 0.8) and is
  clamped, never auto-raised.
- **A limiter on the PCM path (F3).** On the Pi, before samples leave: a peak
  limiter at -6 dBFS with a 10 ms release, and a DC blocker. The board's drone
  already uses `Limiter.ar(w, 0.8, 0.01)` (plan-feedback-demo 4.1), the same
  idea.
- **Stop keys, both ends.** On the Palm: any hard button sends `sndCmdQuiet`,
  stops the stream and sends `stop\n` to the Pi, which the follower obeys. On
  the Pi: Ctrl-C sends a quiet packet before exit (`tones.mjs` already does).
- **A watchdog on the Palm.** No packet for 2 s while sound plays: quiet.
- **Never route capture_2 to the Fast Track's outputs.** jackd has run duplex
  since 2026-10-15 and `pi-1:ftpro` playback exists, uncabled (HANDOFF). A link
  from the mic to those outputs, plus speakers, is an analogue Larsen loop with
  no limiter. And keep the Fast Track's direct monitor knob turned to the
  computer side, for the same reason (INFERRED from the device's front panel).
- The Z22's speaker cannot get loud, so the risk to ears is small. The real
  risk is the Pi's own outputs, covered above.

### 3.4 On the patchbay

| node | port | medium | what |
| --- | --- | --- | --- |
| `pi-1:palm` | `midi-in` | midi | tones and notes (T1 to T3) |
| `pi-1:palm` | `audio-in` | audio | the PCM stream (T5) |
| `pi-1:palm` | `audio-out` | audio | the speaker, into the room |
| `pi-1:palm` | frame in, stylus out | frame, pointer | as plan-palm-z22 5 |
| `pi-1:mic` | `audio-out` | audio | Fast Track input 2, `capture_2` |
| `pi-1:follow` | `audio-in`, `midi-out`, `frame-out` | | the follower, F1 and F2 |

The loop is `palm:audio-out -> mic -> follow -> palm:midi-in`. The air leg is
drawn as a link the bay cannot drive (a physical link). **The bay refuses it
today**: `demo/shell/bay.mjs:1024` answers *"that closes a loop"*, and only a
path through a store is let through (READ). A delay is not a store, so it must
not be passed off as one. The loop waits for **L1 of plan-feedback-demo**: an
in-port declares that it takes feedback (`loops: { gain: 0.9 }`) and a guard is
required on the link. Here the guard is the amp cap plus the follower's gain
under 1 (F1), and the limiter (F3). `palm:midi-in` and `palm:audio-in` are the
ports that declare it.

## 4. What the Pi needs: input 2 beside the Circuit on input 1

READ from this repository:

- jackd runs on the card itself, `-d alsa -C hw:CARD=Pro,DEV=0 -r 48000 -p 512
  -n 3` (`rig/board/test.mjs:512`), duplex since 2026-10-15, with the Circuit as
  the clock. The card captures **stereo only** (positron-hardware), so both
  `system:capture_1` and `system:capture_2` already exist under jackd. Nothing
  has to be started for input 2.
- The Circuit input is `{"device":"hw:CARD=Pro,DEV=0","channels":2,"take":1,...}`
  (HANDOFF, `/etc/default/positron-board`), and the board feeds the stream from
  `<name>:capture_<take>` only (`rig/board/inputs.mjs:277`). So **the mic on
  capture_2 does not reach the Circuit stream**. Verify this on the Pi before
  the first test: the file may have changed since that handoff.
- `jackChain` only owns edges into the capture and the granulator
  (`rig/board/jacksynth.mjs:443`), so a connection from capture_2 to another
  client is not cut by a rebuild (READ from its comment). The board's
  `jack.graph` may list it as extra; that is a report, not a repair.
- The board renames `system:capture_N` to `circuit:capture_N` in what it shows
  (`rig/board/jack.mjs:56`). So today the mic appears as the Circuit's right
  channel in the board's listing. A later fix: a name map so capture_2 shows as
  `mic`. Small, but it touches the board's naming, so it is its own change.
- `arecord` cannot open the card while jackd holds it (INFERRED, the usual
  ALSA exclusivity), which is why `listen.mjs` prefers JACK. It records through
  `ffmpeg -f jack` (ffmpeg is on the board, `packages.txt`) and one
  `jack_connect system:capture_2 palmlisten:input_1`. It touches no other
  connection.

Owner checks on the Fast Track: the mic in input 2's socket, its gain knob up,
phantom power on if the mic is a condenser, the input switch on mic rather than
line or instrument (INFERRED from the front panel; name the mic and this gets
exact).

## 5. Order of work and sizes

| step | what | who | size |
| --- | --- | --- | --- |
| S0 | place the mic 20 to 30 cm from the Palm's speaker (find which face it is on), gain set, Fast Track outputs left uncabled | **owner** | 10 min |
| S1 | on the Pi: `jack_lsp -c` shows capture_2 and what it feeds; BOARD_INPUTS still says `take: 1`; `listen.mjs 10` for the floor | agent over ssh | 10 min |
| S2 | **T1** with today's frame.c and `tones.mjs` | agent; **owner** launches pframe | 15 min |
| S3 | frame.c: `'P' 'O'` (FrqOn), `'P' 'N'` (NoteOn), `'P' 'Q'` (Quiet), `AMP_CAP`, hard key stop, watchdog; `tones.mjs` learns them | the agent that owns frame.c; **owner** HotSyncs the build | 1 to 1.5 hours plus one tap |
| S4 | **T2, T3** | agent | 20 min |
| S5 | **T4**: `'P' 'S' n` first (system MIDI, nothing transferred), then `'P' 'M'` with a blocking hook; a Pi script that turns a short MIDI file into a format 0 packet | agent; **owner** taps | 2 hours |
| S6 | **T5**: the feature check on the status line, a ring buffer, `SndStreamCreate` with a 68k callback, `'P' 'A'`, underrun counter; `rig/palm/pcm.mjs`. Needs the link speed from `send.mjs --cycle` first | agent; **owner** taps, soft resets if it freezes | half a day |
| S7 | **T6** | agent | 1 hour |
| S8 | **F1** `rig/palm/follow.mjs` (listen, pitch, answer, caps), then **F2** pictures | agent; **owner** listens and claps | half a day |
| S9 | **F3** PCM loop with the Pi limiter | agent; **owner** listens | half a day after S6 |
| S10 | the `pi-1:palm`, `pi-1:mic`, `pi-1:follow` nodes, and the loop as a consented link once L1 exists | agent | 2 hours after L1 |

**Only the owner can:** tap HotSync for every new build (nothing on the Pi can
start a sync, plan-screens-odd 10), launch pframe, soft reset the Palm when a
build freezes it (the first frame build did, plan-screens-odd 11), place the
mic and set its gain, and judge what the loop sounds like.

## 6. Open

- Whether `noWait = true` makes `sndCmdFreqDurationAmp` return at once on OS 5.
  T1 answers it.
- The link's real bytes a second. `send.mjs --cycle` answers it.
- Whether the Z22 has the stream API at all (`FtrGet(sysFileCSoundMgr,
  sndFtrIDVersion)`) and which codecs `SndStreamCreateExtended` accepts. S6's
  first build prints both.
- Whether SMF playback has more than one voice. T4.
- The capture's clock offset, so latencies are upper bounds until it is
  calibrated.
- Which mic is on input 2, and whether it needs phantom power.

## Measured 2026-11-10 night (owner listening, pframe 7 KB build on the Z22, port /dev/ttyUSB0)

- **Ping:** `palm: st v0 ...`: the port is live. `v0`: FtrGet(sysFileCSoundMgr) reported no stream API version.
- **Beeps and notes work:** sndCmdFrqOn and sndCmdNoteOn played (t11, n17); the owner heard them faint, quieter than the system HotSync tones, at AMP_CAP 40. AMP_CAP is now sndMaxAmp (64), built, on the Pi, not yet installed.
- **MIDI records work:** `smf list` returned 1 Alert, 2 Bird, 3 Concerto, 4 Phone, 5 Sci-fi, 6 Wake up; `smf 3` played Concerto through SndPlaySmf, heard by the owner (m1).
- **PCM fails:** a 6 s 1 kHz sine at 11,025 Hz, 8 bit: `A00000C02` (SndStreamCreate error 0x0C02), `o57958` (the ring overflowed, nothing played), `u0`. With v0, the 68k path to the stream API is not working as written. Next: other stream parameters, SndStreamCreateExtended, or an ARM native callback. Not before the talk.
- **The mic:** the SM57 on input 2 is `circuit:capture_2` (jackd runs `-d dummy`; the board's alsa_in holds the card), not `system:capture_2` as section 4 said. Floor -91 dBFS RMS; beeps at amp 32 were not detected, so the gain was low or the mic far.
- **PCM probe, 2026-11-10 19:32:** with the version gate removed (0x0C02 was ftrErrNoSuchFeature from FtrGet, not the stream), the traps exist (`S1 X1`) but all 42 SndStreamCreate and SndStreamCreateExtended setups (u8, s16le, s16be; 8 to 44.1 kHz; frames 0 to 4096; mono and stereo; volume before and after) answered **0x080A, not implemented**. The owner heard only clicks. PCM from a 68k app is not available on this ROM; the route left is an ARM native callback (a PNOlet), after the talk.
