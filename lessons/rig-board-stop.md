# rig/board/stop.mjs

## header

Asked 2026-10-16: *"we need to work on 'pi os' or smth. currently running desktop demoms, getting hangin notes etc is a mess. pi should be selfsutainable switching patches. stoppin all etc."*, then renamed the same day: *"does not need to be pi os as name. more of that we need somthing for patchbau management"*. This file is step 1 of `plans/plan-pi-patches.md`: stop all and the check that proves it, and `*` held on the Pi's keys as stop all. No patches, no menu yet.

The module owns no service. Every service it stops is injected (`createStop({ sequencer, keyboard, circuitDrums, circuit, engines, jack, output, screen })`), so `stop-test.mjs` runs the board's real sequencer, keyboard and Circuit drums services and the Circuit input's real gate with fake engines and a fake JACK graph, and `board.mjs` passes the real ones. The board's steps go through its own verbs where one exists (`seq.stop`, `kbd.unlink`, `cdrums.unlink`, `jack.unlink`, `midi.panic`), so a stop leaves the same log lines and the same screen as a page asking.

## order

The plan's section 2.1: a note source stops before its target is silenced, and a target is silenced before its audio link is cut. In the other order a sequencer step lands after the panic and hangs, or a cut link leaves a voice sounding into nothing that comes back the moment anything relinks.

1. the board's sequencer (`seq.stop`: every pending note off, then CC 123 on channel 10)
2. the keyboard and Circuit drums links (`kbd.unlink` releases every note it started, `cdrums.unlink` lets go of the read)
3. every target silenced: each engine's own panic (the JACK instrument, the insert and its grain voices, collide, Plaits, the sampler), the Circuit input's ledger (`midi.panic`), then CC 123 on 1, 2 and 10 through its gate
4. every `jack.link` the board holds cut by `jack.unlink`, then anything still feeding `pwm:playback_1` or `_2` (a `jack.apply`, say) cut by owning both inputs with no links
5. `full` only: every engine down, in the SIGTERM handler's order
6. `full` only: the screen says stopped

Two levels, as the plan recommends: `silence` (1 to 4) is a panic mid performance with the engines warm, `full` (1 to 6) ends the capture and so the stream to the relay. A step that throws is reported by name and the next one still runs; a stop is never refused, and a second one waits for the first and runs again.

Step 4 goes past the plan's wording (*"jack.unlink for every entry of bayLinks"*) on purpose: the plan's guarantee for that step is *"nothing reaches pi-1:pwm"*, and a connection made by `jack.apply` is not in `bayLinks`. `stop-test.mjs` has a stray feed on the output that only that sweep removes.

## unseen

What `board.check` cannot see is in its answer every time, as `unseen`, rather than read as green:

- notes the Circuit plays from its own pads or sequencer never pass the board's writer, so no ledger holds them. CC 123 is the only answer, and whether the Circuit honours it on its drum channel and its synth channels is unmeasured (plan section 8).
- the level at the output. The plan's *"the board is silent"* row wants the capture's peak, and the engines' own capture has no measured floor (the Fast Track Pro input reads about -80 dBFS, MEASURED 2026-10-11; that is a different input).

A row the board cannot read (no Circuit input, no PWM output, jackd not running, the sampler's held notes) is `ok: null` with the reason in words, and does not turn the check green or red. The JACK instrument and the sampler keep no held note count, so while either runs its row is unread.

After a `silence` the engines row is green and names the warm engines; asked as `full` the same board is red on that row and that row only. That is asserted as a negative control.

## hold

`*` (K4) held `HOLD_MS` (1000 ms) runs a `silence`, from `createHold` in `stop.mjs`: `down(t)`, `tick(t)` while held, `up(t)`. It fires once at 1000 ms, never again while held, and a release resets it, so two short holds never add up. `up` ticks first, so a release at exactly 1000 ms with no tick between still fires, once. The board ticks it every 66 ms (the panel's own frame interval).

Every edge still reaches the room as `panel.key`, so a short `*` reaches pages as before. The release after a hold that fired carries `stopAll: true`. The board then sends `board.stopped` to the room with `via: 'keys'` and the check.

⚠️ The drum pages still act on `*` down (play or stop, `demo/devices/pi-seq.mjs` `onKey`), so with one open, holding `*` also toggles the page's play before the stop lands one second later. Either way it ends stopped. Moving the keys into the board and out of the pages is the plan's step 4, in one change.

The screen after a stop from the keys: `stopped` and one line from `checkLines`, `check 11 green` (with the unread count on a second line) or `2 red:` and the short names of the red rows.

## bar

While `*` is held, `panel.mjs` `withBar` ORs a bar over the bottom two pixel rows (page 7, bits 6 and 7) of whatever mode is showing, `share` of the 128 columns, on a copy so the mode's own frame is untouched. `panel.bar(share)` sets it, `panel.bar(null)` takes it away; the mode does not change, so a drum grid or a patch picture stays under it. The bar is drawn on the Pi only: it is not in `demo/shell/panel-screen.mjs`, so the simulated screen on `/devices/text/` does not show it.

## verbs

`board.stop { level }` (`silence` or `full`, `full` by default) answered `board.stopped` with the steps and the check after; an unknown level is refused in words and runs nothing. `board.check { level }` answered `board.checked`, read only. The caller is named `asked` in the answer because `by` is an envelope field (`demo/shell/wire.mjs`).

## board

In `board.mjs` the stop is made at the bottom of the file, once `hwInputs`, `outs` and `HAS_PWM` exist, and is `null` until then (a key or a verb before that is told the board is still starting). The engines are `instrument` (the JACK instrument, the legacy synth or the capture, with the insert's panic), `collide`, `plaits` and `sampler`. Each engine's panic and down are the calls `note.panic` and the SIGTERM handler already make.

## test

`node rig/board/stop-test.mjs`. The playing board is the real sequencer running into the Circuit, a key held on the MK-425C, the Circuit drums link, a note a page started on synth 2 through the Circuit's room, Plaits and collide holding notes, two links to the PWM output and a stray feed on it. Before a stop, all nine rows are red, which proves the check can see each thing; after a full stop, all nine are green.

Each stop step is then skipped in turn and the rows it answers must be exactly the red ones: step 1 the sequencer, step 2 the keyboard and Circuit drums links, step 3 the Circuit notes and both engines' notes on a silence (and the Circuit notes alone on a full stop, where step 5 empties the engines), step 4 the links and the output, step 5 the engines. Step 6 has no row: the screen is feedback, not a claim about sound.

MEASURED 2026-10-16 by sabotaging `stop.mjs` itself: swapping steps 3 and 4 took 3 asserts red; a check that always says `ok` was caught only once an assert required `ok === false` on a red board (it was 0 red before that assert was added); an unlink loop that stopped after the first link was caught only once the playing board held two links. Both fixes are in the test.
