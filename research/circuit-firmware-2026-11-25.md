# The original Circuit's firmware, unpacked and diffed against a working mod

Status (2026-11-25): done, read only. The container reader is demo/shell/circuit-firmware.mjs (test:
`node demo/shell/circuit-firmware-test.mjs`, 9/9). The Device Inquiry to our unit is NOT done: the board was not in
room `studio-1` that day.

> **The ask**, 2026-11-25: *"custom firmware to original circuit: possible?"* about
> github.com/Ghillermo/CIRCUIT-HACKS-RC, then *"decompole firmware?"*, then *"do it"*.
>
> **NOTHING WAS SENT TO THE CIRCUIT.** No firmware, no SysEx. The one message attempted was the universal Device
> Inquiry through the board's gate, and it never left the relay because no board answered.
>
> **NOTHING OF NOVATION'S IS COMMITTED.** The stock image and the patched builds are in `purchased/circuit-firmware/`,
> which git ignores. This document gives offsets, sizes and counts, not code.

| mark | means |
| --- | --- |
| MEASURED | run here on the files, 2026-11-25 |
| READ | someone else's repository or page, opened and read |
| INFERRED | reasoned from the above, and said so |

## 1. The answer

**Yes, custom firmware on the original 2015 Circuit is possible, and it is already being done.**
[Circuit Extended](https://github.com/tracelistener/tracelistener-circuit-extended) (MIT, from July 2026) patches stock
1.8.1 build 3592 and was tested on hardware on 2026-07-31 and 2026-10-09 (READ).
[CIRCUIT-HACKS-RC](https://github.com/Ghillermo/CIRCUIT-HACKS-RC) is for the **Circuit Tracks** only; its own FAQ says
no to the original Circuit (READ).

Decompiling it ourselves is also practical. The file is the plain image, 7-bit packed, with no encryption found and
no image checksum found (section 3).

## 2. The files

| file | bytes | SHA-256 (first 16) | source |
| --- | --- | --- | --- |
| `circuit-firmware-3592.syx` | 263,135 | `260a72ebd10208aa` | Novation, `s3-eu-west-1.amazonaws.com/circuit-content/da39a3ee5e6b4b0d3255bfef95601890afd80709/` beside `release-notes-1.8.1.txt` |
| `ext-...filter-lfo-shift-automation.syx` (Extended v0.5.0) | 263,135 | `7ea9affe4c5310a8` | Circuit Extended `docs/firmware/` |
| `ext-...perf-v2-feature.syx` (Performance v2) | 263,135 | `085f4decb43efb3c` | same |
| `ext-...perf-v2-selectors.syx` | 263,135 | `54aa4e9ac25f87d1` | same |

MEASURED: the three Extended hashes equal the ones their README publishes. Their builds are whole patched images
(Novation's code included), unlike CIRCUIT-HACKS-RC, which patches in the browser and ships only its own bytes (READ).

## 3. The container, MEASURED

- **5,981 SysEx messages**, all `F0 00 20 29 00 <cmd> ... F7`: one INIT (`0x71`), 5,979 WRITE (`0x72`), one FINISH (`0x73`).
- **INIT payload `00 79 00 00 03 05 09 02`**: the last four bytes are the build number's digits, 3 5 9 2.
- **Each block is 32 image bytes as 37 seven-bit bytes**, MSB first, with 3 pad bits at the end. FINISH carries
  **block 0, the vector table, sent last**. INFERRED: an interrupted update then leaves no valid vector table, so the
  bootloader keeps control.
- **Image: 191,360 bytes** (5,980 blocks).
- **Our reader rebuilds the file byte for byte** from the decoded image (`circuit-firmware-test.mjs`).
- **The pad bits are not zero in 3,663 of 5,980 blocks.** They are not a popcount or a byte sum mod 8 (831 and 854
  matches, chance level). The three patched builds change 2,360 to 2,456 image bytes and keep **every pad bit
  identical**, so the pad bits do not depend on the content and are not a per-block check. INFERRED: leftovers of
  Novation's encoder. Rebuilds should keep them, as both our writer and Circuit Extended's do.
- **No image checksum.** Every region that differs between stock and the patched builds is code or new data. No 2 or
  4 byte field changes the way a CRC would. Those builds boot on hardware (READ), so the bootloader accepts an image
  with no checksum, or checks one that is not in the image.

## 4. What is inside, MEASURED unless marked

- **ARM Cortex-M, Thumb code, loaded at `0x08008000`.** Of 1,341 words in the image that look like flash pointers, at
  base `0x08008000` 1,249 fall inside the image and **259 odd (Thumb) pointers land on a `push`**. That is 46 at
  `0x08000000` and at most 8 at every other base tried. So **the bootloader owns the first 32 KB of flash** and is
  never in the update file.
- **Initial stack pointer `0x20017FD8`, reset handler `0x080244A1`.** The vector table has about 64 entries.
- **Peripheral addresses:** `0x40020000` (91 references) and `0x40026000`/`0x40026400`. INFERRED: those are GPIOA
  and DMA1/DMA2 on an **STM32F2 or F4**. Not checked on the board itself: the chip's top marking would settle it.
- **A DSP56300 program is embedded.** The DSP56300 absolute `jmp` opcode `0A F0 80` appears only between `0x1D000` and
  `0x25FFF` (3 to 21 per 4 KB there, none elsewhere). Circuit Extended's Filter LFO change is DSP code (`0A F0 80 00
  00 xx` rewrites at `0x250D4` to `0x251D2`), and they check it with the
  [dsp56300](https://github.com/dsp56300/dsp56300) emulator (READ). Rough map: ARM code `0x00000` to `0x1CFFF`; the
  DSP program and tables `0x1D000` to `0x25FFF`; data after that.
- **Readable strings are few.** The interesting ones are `USERINIT`, `Initial Patch`, `User Session`,
  `Initial Session`, factory patch names (`Bass-ic Square`, `Simpleton`), and the USB strings `Focusrite A.E`,
  `Circuit Audio`, `AUDIO Interface`, `AUDIO Config` and `Circuit Debug`. INFERRED: the AUDIO strings are the
  AudioControl interface that every class-compliant USB MIDI device must have. They are not a hidden audio
  interface. `Circuit Debug` is unexplained.

## 5. How Circuit Extended patches it, MEASURED by diff

| build | changed regions | changed bytes |
| --- | --- | --- |
| Extended v0.5.0 | 49 | 2,360 |
| Performance v2 | 51 | 2,456 |
| v2 + selectors | 51 | 2,448 |

- **About 34 hooks are single 4-byte rewrites of existing Thumb `BL` calls** (`0x07B02` to `0x15F6E`). The new
  target is their code, and the original call is replayed from there. Decoded targets all land in the new regions,
  for example `0x07B02 BL -> 0x1DE08`, `0x10B00 BL -> 0x1D594`, `0x14924 BL -> 0x25408`, `0x15F6E B.W -> 0x254C0`.
- **New code goes into runs of zeros inside the stock image** (`0x1D594`, 244 B; `0x1DC82`, 484 B; `0x25408`, 168 B;
  `0x254C0`, 556 B; `0x2E7E4` to `0x2EB53`), plus two `0xFF` runs (`0x2D94C`, `0x2DB4C`, about 170 B each). The
  zeros sit in the DSP and data zone, so whether they are really unused was their judgement, confirmed only by the
  device running.
- **Performance v2 adds a hook at `0x18508`** (`B.W -> 0x001E4`) and rewrites 92 bytes at `0x001E4`, early in the
  image. INFERRED: the MIDI input path, where pitch bend and CC 1 are now taken in. That matters to us because
  `positron-hardware` records that **the Circuit's MIDI port drops pitch bend and mod wheel**.
- **The free space is small.** INFERRED from the above: there is a few KB of zero and `0xFF` runs, not a big empty
  tail, because the image ends in data with no `0xFF` padding. Large features would need the free-space hunting
  CIRCUIT-HACKS-RC did on the Tracks (it compresses its DSP programs to make room, READ).

## 6. What was not done, and what would do it

- **Our unit's firmware build.** Send the Device Inquiry once the board is back in `studio-1`:
  `node rig/board/ask.mjs --room studio-1 midi.send '{"source":"circuit","bytes":[240,126,127,6,1,247]}'`. The gate
  allows exactly this message (`rig/board/inputs.mjs`). Circuit Extended requires 3592. Untried: whether
  `midi.send` with `source` is the right envelope; the input's handler is what answers `midi.identity`.
- **A real disassembly.** Ghidra (ARM Cortex, Thumb, little endian, base `0x08008000`) for the ARM part, and dsptool
  or dsp56300's disassembler for `0x1D000` to `0x25FFF`. Ghidra is a Java app: an install that needs asking first on
  this managed Mac. The M1 is the place.
- **Flashing anything.** Not proposed here. Before any flash: a fresh pack backup (the stored one is from
  2026-09-20), Components closed, bootloader mode (Scales + Note + Velocity at power on, READ), the Record button
  off. The bootloader is never written, and Components reinstalls stock (READ).

## 7. Similar work (READ, 2026-11-25)

| project | device |
| --- | --- |
| [Circuit Extended](https://github.com/tracelistener/tracelistener-circuit-extended) | original Circuit, 1.8.1/3592: Scale Follow, sample start, distortion type, Filter LFO, pitch bend, CC remap |
| [CIRCUIT-HACKS-RC](https://github.com/Ghillermo/CIRCUIT-HACKS-RC) | Circuit Tracks 1.2.1/4486 |
| [CircuitTracksReverseEngineering](https://github.com/userx14/CircuitTracksReverseEngineering) | Circuit Tracks teardown, debug header |
| [CIRCUIT-REMIX](https://github.com/Ghillermo/CIRCUIT-REMIX), [rhythm-plus](https://github.com/mefisme/rhythm-plus), [cr_stereo](https://github.com/jsmith13/cr_stereo) | Circuit Rhythm |
| [monostation-hacks](https://github.com/matozoid/monostation-hacks) | Circuit Mono Station 1.2 |
| [awesome-music-gear-firmware](https://github.com/Lapin/awesome-music-gear-firmware) | the curated list |

All of them date from July to November 2026, and two say they were built with an AI coding assistant.

## 8. The MIDI input path and the CC tables, disassembled (MEASURED, 2026-11-25, second pass)

Disassembled with `arm-none-eabi-objdump -D -b binary -marm -Mforce-thumb --adjust-vma=0x08008000` in a
`debian:trixie-slim` container (nothing installed on this Mac). Circuit Extended's CC tool states the same base and
size we measured on our own (`BASE = 0x08008000`, `IMAGE_SIZE = 0x2EB80`, READ).

- **Why our Circuit drops pitch bend.** The channel-message dispatcher at `0x08020500` masks the status byte
  (`and #0xF0`) and compares with `0x90`, `0xB0` and `0x80` only. Anything else, `0xE0` pitch bend and `0xD0`
  aftertouch included, branches to the exit at `0x08020582`. That is the code behind `positron-hardware`'s measured
  "the Circuit's MIDI port drops pitch bend and mod wheel". CC 1 does arrive as a CC but has no row in the receive table.
- **`0x0801633C` writes one 24-bit parameter to the DSP**: value in the top 24 bits of `r0`, DSP address in `r1`,
  sent as three bytes through `0x080158A4`. It is called from 216 places.
- **What Performance v2 adds is only the front end.** Its stub at `0x080081E4` (reached from a `B.W` at `0x08020508`)
  takes `0xE0`, `0xD0` and CC 1 on Synth 1's or Synth 2's channel and writes them through that same function:
  bend to DSP address 727, CC 1 to 728, aftertouch to 729, plus 370 for Synth 2. Bend is the 14-bit value minus
  `0x2000`, shifted into the top bits. No stock code writes those addresses with an immediate. INFERRED: the DSP
  already has bend, mod wheel and aftertouch inputs (the patch's mod matrix lists them as sources), and only the
  ARM side never feeds them. That makes a bend-only mod small: one hook and about 90 bytes.
- **`demo/shell/circuit-cc.mjs` checked against the firmware's own tables.** The receive tables (128 int16 per part,
  `0x8000` = unmapped; synth `0x08035340`, drums `0x08035240`, session `0x08035480`, READ from Circuit Extended)
  map **52 synth, 28 drum and 18 session CCs, the same sets as our 52, 28 and 18, with none missing either way.** Every
  range agrees once the firmware's signed storage is read: centred parameters are kept as an offset from 64
  (`192..63` is −64..+63, so 0..127; `244..12` is 52..76; `250..5` is 58..69; `244..18` is 52..82). The map we wrote
  from the Programmer's Reference is right for build 3592. NRPN rows (`b6 == 0xFF`) were not compared.
