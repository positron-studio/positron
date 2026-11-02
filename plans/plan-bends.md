# plan-bends: circuit bending as a link transform

Status: plan, 2026-10-28. Nothing built beyond `fx.c` (frame bends). Tags: READ
(seen in the repo or a source), INFERRED (reasoning, untested).

**Goal.** Faults on purpose, anywhere in the patchbay, without breaking a device,
a broadcast or a person's trust. One general mechanism; `fx.c` is its first
implementation, for frames.

## 1. Where bends live

READ: every `Link` in `plans/plan-patchbay.md` already carries `transforms: [...]`.
A bend is a transform that misbehaves on purpose:

```js
{ bend: 'pitch-rot', amount: 0.2, seed: 42, since: 1730100000000 }
```

Bends stay inside one medium. Changing medium (audio to frame) is a converter
node, never a bend (see plan-crossmodal).

## 2. Three rules

1. **Typed, never raw bytes.** Bends act on parsed messages (note, cc, clock
   tick, audio buffer, frame) and rebuild valid ones. READ: the patchbay plan
   notes one SysEx byte can overwrite a device patch with no factory reset; a
   raw bit flip can make one.
2. **Consent is checked after the bend.** The bent message must pass the target
   port's `accepts` and `shape`, exactly like an unbent one. A bend cannot
   produce a type the port did not consent to.
3. **Seeded and recallable.** Same seed, same accident. "Keep this" writes the
   seed and settings into the patch.

## 3. Bends per medium (INFERRED)

| Medium | Bends |
|---|---|
| midi note | pitch rot within a scale, velocity rot, drop, double, timing jitter, wrong wire to an accepted channel |
| midi cc | stale (hold), staircase, crosstalk to an accepted cc, value rot within 0..127 |
| clock | tempo wobble, missed ticks, doubled ticks |
| audio | bitcrush, sample and hold, stutter, dropout, reversed chunk, drift; never the declared shape |
| frame | `fx.c` and each screen driver's own bends (plan-screens) |

## 4. Guards

- Off by default. One panic action clears every bend in the room.
- Removing a bend that can drop note-offs sends all-notes-off on its target.
- A limiter ends every bent audio path; bent message streams have rate caps.
- No bends on links that reach air unless confirmed, as the Circuit consent rules.
- Each bend counts what it did (`dropped 14, flipped 3`) on the link, so
  accidents are visible: MEASURED, not mysterious.

## 5. The feel

Bends shown on cables as bend points, like jumpers. Momentary bends from body
contact: ESP32 touch pads over the relay (plan-esp32-controllers), the bend
alive only while a finger is on it.

## 6. Order

1. MIDI note and cc bends as a JS module beside the patchbay transforms, with
   tests: every bent output passes `accepts`; a negative control sends a
   forbidden type and must be refused.
2. Clock bends.
3. Audio bends in the worklet, limiter first.
4. Frame bends wired to `fx.c` through the panel's `value-in`.
5. Touch-pad momentary bends.

## 7. Open questions

- Do bends run where the link starts or where it ends? Ends is safer for consent.
- Recording: does a recorded take store the bent result, the seed, or both?
