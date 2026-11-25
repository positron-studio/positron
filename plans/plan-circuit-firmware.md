# plan-circuit-firmware: our own patches to the original Circuit, as a patchbay node

Status (2026-11-25): open. Steps 1 to 3 done for idea A: `node rig/circuit-fw/build.mjs bend` (62 B in the dead `_start` at `0x080081E4`, hook bytes identical to Circuit Extended's) and `node rig/circuit-fw/bend-test.mjs` (9/9, stock as the control). Step 2's findings are in `research/circuit-firmware-2026-11-25.md` section 9. Next: find space beyond 92 B, then B.

> **The ask**, 2026-11-25: *"what else we could do with custom firmware?"*, then *"plan and start working. more
> ideas / iteractions?"*. Background: `research/circuit-firmware-2026-11-25.md` (container, load address, the MIDI
> dispatcher that drops bend, the DSP parameter writer, the CC tables).
>
> **Nothing here is flashed without the owner saying so, per build.** Every step until section 5's step 6 is files on
> disk and emulation.

## 1. The rule that orders everything

**The owner's sessions are the risk, and only flash writes can touch them.** So ideas are ordered by whether the
patch ever writes flash, then by size. A patch that only reads RAM and sends MIDI can at worst crash the Circuit,
which a power cycle fixes, and the bootloader (Scales + Note + Velocity at power on) reinstalls stock.

## 2. The ideas

| # | idea | writes flash | size (INFERRED) | what positron gets |
| --- | --- | --- | --- | --- |
| A | **bend, mod wheel, aftertouch in** on Synth 1/2 (the hook at `0x08020508`, DSP 727 to 729) | no | ~90 B | expressive playing from https://positron.studio/remote/circuit/ |
| B | **state out**: one short SysEx per step (step, pattern, session, mutes, scale) | no | ~150 B + finding the state | `pi-1:circuit:value-out` ports; pages follow the Circuit; the Pi times its clock from inside |
| C | **pads as a display**: a SysEx that lights pads, held until released or a timeout | no | ~200 B + finding the LED buffer | the Circuit shows a distributed grid, remote players, a meter |
| D | **dump the live session from RAM** on a SysEx request | no | ~100 B + the session's RAM address | a backup with no power cycle, the Save-disabled trap defused |
| E | **guard in the instrument**: refuse patch command `01` (flash) and notes while Record is armed, unless a pad combo unlocks | no | ~60 B | the consent rule holds when a laptop replaces the Pi |
| F | **echo ping**: answer a timestamped SysEx at once, from the MIDI handler | no | ~40 B | USB MIDI round trip measured inside the device |
| G | samples into RAM over MIDI, until power off | no (RAM) | KBs, memory unmeasured | network-fed drum slots |
| H | write steps into the playing pattern, RAM until Save | no | needs the session format | a remote collaborator programs the sequencer |
| I | DSP changes (new LFO shapes, oscillators) | no | DSP program space, tight | sound design; needs the dsp56300 emulator |
| J | USB audio out | n/a | INFERRED infeasible: audio goes DSP to codec, not through the ARM | nothing |

## 3. Interactions these make possible

Each is a patch of existing bay nodes plus the new ports.

1. **Follow the Circuit.** A page draws the Circuit's grid and playhead live from B, anywhere, at the cost of one
   small SysEx per step (no audio needed to see what it does).
2. **Two Circuits in two rooms in lockstep.** B on one, H on the other: the second plays what the first sequences.
3. **The audience lights the pads.** Phones tap a grid on a page, C shows the taps on the pads, the player answers.
4. **Scale broadcast.** B carries scale and root, so the Pi's sampler, Plaits and the keyboard quantise to whatever
   the Circuit is set to.
5. **Remote lease on the instrument.** C lights one pad while a remote page holds the board lease, so the person at
   the desk sees that somebody else is playing.
6. **A performance as a timeline.** B's events recorded with the audio, replayed on the timeline library: the
   recording knows which pattern and step every second belongs to.
7. **Dice from elsewhere.** A remote page sends probability or mutation per step through H; the Circuit plays it.
8. **Latency map.** F plus the board's clock gives USB MIDI, relay and page legs separately, the measurement this
   project makes everywhere else.
9. **Backup on every session change.** D triggered by B's session-change event: the Pi keeps a dated copy of every
   session as it is played, not just what was saved.

## 4. Tooling, all on disk and in containers

- `demo/shell/circuit-firmware.mjs`: read and rebuild the `.syx` (done, 9/9).
- Thumb assembly with `arm-none-eabi-as` in a `debian:trixie-slim` container, as the disassembly was done. Nothing
  installed on this Mac.
- `rig/circuit-fw/build.mjs` (step 1): stock `.syx` plus a patch (hook address, original bytes, asm) to a patched
  `.syx`. Refuses any base whose SHA-256 is not stock 3592, refuses a hook whose original bytes differ, refuses code
  that lands outside its declared free region, and prints every changed byte range. Novation's image never leaves
  `purchased/`.
- Emulation (step 3): `rig/circuit-fw/emu.mjs`, a strict Thumb interpreter (no Unicorn exists for JS, and new
  scripts are .mjs) that throws on any instruction it does not know and stubs stock functions by address. Each patch
  test runs stock first as the control. Circuit Extended verifies with Unicorn (READ).

## 5. Order

1. The builder, with patch A as its first input, reproducing the hook shape Circuit Extended proved on hardware.
2. Locate the sequencer state, the MIDI out routine and free space (done, research section 9: SysEx out and the
   clock tick found; the playhead is on the heap; only 92 B of proven free space).
3. Emulate A: feed `E0 00 40` to the dispatcher, assert a write to DSP 727.
4. Device Inquiry once the board is back: our unit must report build 3592.
5. B, then F, then E, each emulated before anything else.
6. **First flash, owner's go only:** a fresh pack backup in Components, Record off, bootloader mode, our A build.
   Measure bend on https://positron.studio/remote/circuit/. Rollback: Components reinstalls stock.

## 6. What is unknown

- Whether our unit runs 3592 (step 4).
- Whether the zero runs Circuit Extended uses are truly free. Their device runs, which is evidence, not proof.
- Where the sequencer keeps its step, the pad LEDs and the live session in RAM (step 2).
- Whether SysEx can be sent from the sequencer tick without delaying it (B's cost; measure in emulation, then on the device).
