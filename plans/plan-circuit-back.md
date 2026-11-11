# plan-circuit-back: the Circuit playing again, desk first, then the Pi

Asked 2026-11-11: *"do plan for bringing circuit back. first: m2 to circuit via usb first?"*

## Where it stands (read 2026-11-11, not re-measured)

- HANDOFF session 92 (2026-11-10 evening): **the Circuit is deaf to MIDI and the cause is NOT found.** Its pads play.
  The board writes notes without error to `/dev/snd/midiC5D0` (card 5, the Circuit; a valid fd). Notes sent through
  `studio-1-circuit` were not heard, before and after a board restart at 21:15. A restart had fixed it earlier that
  day. The owner says it used to work.
- The Pi was not reachable from home on the evening of 2026-11-11 (ssh timed out), so nothing on it can be checked
  until it is back on a network.
- Known traps (positron-hardware): a raw MIDI fd and an ALSA sequencer subscription cannot share the Circuit; after a
  replug the board can hold an fd on the deleted device node, so the first message fails with ENODEV; notes into a
  Circuit with Record armed get recorded; its MIDI is its own USB card, not the Fast Track.

## Step 1. The M2 to the Circuit over USB, no Pi (yes, first)

**Why first:** it splits the question in two with one cable. If the Circuit is deaf on the M2 too, the cause is on the
instrument (its MIDI settings, its state) and the Pi is innocent. If it plays from the M2, the instrument is fine and
the cause is on the Pi side (the board's fd, ALSA, the replug). Every later step depends on which half it is.

1. **Record off** on the Circuit (Record button unlit). Nothing below should ever write a session.
2. Circuit to the M2 by USB, Chrome, https://positron.studio/circuit/ (direct Web MIDI, no Pi, no relay; the page that
   measured the 17 byte Device Inquiry reply and the 350 byte patch on 2026-10-11 from this Mac).
3. Read, in this order, each with nothing written to the instrument:
   - does Chrome list a MIDI output named Circuit (USB link up);
   - Device Inquiry: a 17 byte Novation reply means the instrument answers on its USB MIDI at all;
   - a note on channel 1 (Synth 1), channel 2 (Synth 2), channel 10 note 60 (Drums 1): heard or not.
4. Outcome A, **heard from the M2**: the Circuit is fine; go to step 3.
   Outcome B, **not heard but the inquiry answers**: the instrument's MIDI receive settings; go to step 2.
   Outcome C, **no reply at all**: cable, port or a stuck instrument; another cable, then a power cycle (after the
   backup in step 2.1).

⚠️ Novation Components on the M2 is fine to open for reading. **Never press `Send to Circuit`, never send a Factory
Pack, never a `Replace Patch` SysEx** (CLAUDE.md, the pack rules): those replace the owner's sessions.

## Step 2. If it is the Circuit (outcome B or C)

1. **A fresh backup first**, read only: Components, Backup, save the `.circuitpack`, verify it as CLAUDE.md says
   (`unzip -l`, `index.json` reads `product: circuit`, a patch is 350 bytes starting `F0 00 20 29 01 60`). Compare its
   session count with the one in the owner's private pack repository (2026-09-20). Only then may anything be power cycled.
2. **Setup view** (Shift + Save): MIDI channels (Synth 1 ch 1, Synth 2 ch 2, Drums ch 10, the factory defaults) and
   **MIDI Rx Notes** on. A note filter switched off by a stray press would explain a deaf instrument whose pads work.
   📄 From the Circuit manual's Setup view, not measured on this unit; read the pads' colours against the manual.
3. Power cycle, then step 1 again.

## Step 3. Back on the Pi (outcome A, or after step 2)

Needs the Pi on a network (BACKLOG has its other follow ups for that moment: the hosts lines out, the board push).

1. Plug the Circuit into the Pi, then `systemctl restart positron-board` so the board opens the new device node rather
   than an fd on the deleted one (the ENODEV trap).
2. With the board stopped for a few seconds, `amidi -p hw:<Circuit card>,0,0 -S '90 3C 64'` then `'80 3C 00'`: heard
   means ALSA to the Circuit works and the fault is in the board's write path. Find the card by name
   (`amidi -l | grep -i circuit`), never by number.
3. Board running again: a test note through the relay (`studio-1-circuit`, the `note.mjs` from session 92, rewritten if
   the scratchpad is gone). Heard means the whole path is back.
4. If step 2 is heard and step 3 is not: the board's MIDI write (`rig/board/inputs.mjs`, the gate `midiVerdict`,
   channels 1, 2, 10, note on and off, CC 123) and the fd it holds; log what it writes and compare byte for byte with the
   `amidi` bytes that were heard.

## Step 4. The pages

https://positron.studio/remote/circuit/ (keys and the 8 macros) and https://positron.studio/devices/circuit/ (Circuit
drums to Pi drums), each with one press of each control, and the owner listening. Record stays off.

## What could not be settled from here

- Whether the Circuit's Save is locked on this unit (the button lit or not): nobody has looked.
- Whether the earlier "a restart fixed it" was the ENODEV replug trap or something else: it was not logged.
- Everything in step 3: the Pi is offline tonight.
