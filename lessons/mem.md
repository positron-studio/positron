# MEM, the looping engine (demo/shell/mem.mjs)

Copied from v2in `server/engines/mem/mem.mjs` at `eaadb58` on 2026-11-09, when positron became the master copy (asked: *"In positron stack. Ee move engine later to v2in"*). The plan behind it is v2in `plans/plan-huddersfield.md`, "MEM"; positron's side is `plans/plan-v2in-for-positron.md` sections 8 and 9.

## header

The file's header as it stood in v2in, verbatim:

```
// server/engines/mem/mem.mjs: MEM's engine, without its input and output (run.mjs has those). plans/plan-huddersfield.md, "MEM".
//
// node holds what is too big for scsynth's 32 MB arena and decides everything:
//   the live ring    the last RING_S seconds of the feed, 16-bit stereo, with the energy of every 10 ms cell beside it
//   the takes        snippets copied out of the ring (or out of an earlier recording), mono 16-bit, only when the feed
//                    has sound (the level gate) and starting at an onset where there is one
//   the players      N small speakers, each looping one take (two while a new one crossfades in); the position is
//                    computed from the clock every sample, never accumulated (positron proto/loops/NOTES.md); loop
//                    lengths on a 10 ms grid, pairwise without a common factor, so live loops share no short common
//                    multiple (Eno's unrelated lengths); further processing per voice: varispeed (an analytic glide),
//                    reverse, freeze, disintegration over passes (darker, quieter, holes)
//   the performer    a seeded schedule of takes, replacements, glides, freezes and arrangement moves, on engine time;
//                    at most one change every `spacing` seconds and a cap on glides and freezes at once, so changes
//                    come one at a time; loop lengths drawn from tiers (short, mid, long) so short and long loops play
//                    together; a preset's `moods` (thin, building, dense, thinning, one loop...) each some minutes,
//                    move how many play (the rest rest), the tiers' mix, the pace and how much processing
//   the walks        each speaker drifts slowly in angle and distance around its place (some stand still)
//   a new preset     setPreset(name) while it plays, softly: the loops go on and follow the new rules from their next
//                    replacement; players over the new count finish their loop and fade out, new ones enter with the
//                    new `enter` spacing; the speakers' places, colour and the reverb glide over GLIDE_S seconds
// scsynth (the Waves chain's wasm scsynth, imported from ../waves/cast) gets one input per player and does the speaker's
// colour (high pass, low pass, a little saturation), its place in the room (equal power pan, the time difference between
// the ears, the head's shadow, distance as level, air and reverb send), the reverb, and Waves's master (leveller, limiter).
//
// Time is the engine's frame counter `t`, the same in a live run and an offline render, so a render with a seed repeats.
```
