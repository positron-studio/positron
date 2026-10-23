# The bar kit: a bar is a layout, a transport is a controller, a button is a view

Asked 2026-10-23: *"it seems we force transpoprt bar to be both aciton controller and ui element. split the two"*,
then *"no wrapper, clean it all"*. The analysis and the decisions are plans/plan-bars.md. The rules the old
transport-bar.mjs carried still hold and stay in lessons/kit-transport-bar.md, cited by anchor from the new modules.

## header

Five modules replace demo/shell/transport-bar.mjs:

| module | job |
| --- | --- |
| bar.mjs | `createBar` (layout) and `barButton` (the one button) |
| transport-control.mjs | `createTransportControl` (no DOM), `transportApi`, `publishTransport`, `transportOnBay` |
| transport-views.mjs | `playToggle`, `clockView`, `scrubView`, `ratesView`, `loopView`, `liveBadge`, `noteView` |
| transport-keys.mjs | `bindTransportKeys` |

A page composes them; there is no wrapper that builds all of them at once.

## slots

`createBar({ start, middle, end })`. Start holds what you do (play, record, Start OBS, ‹ ›), middle holds what is so
(a clock, a scrub, a status, a live badge), end holds what you choose (rate, loop, scene, patch). The first end item
takes `data-end`, which is `margin-left: auto` in shell.css, so a bar with no scrub still spreads. The element is
`.tbar`, so the bar's card, edge, radius and 8 px padding come from the stylesheet as before.

## bar-button

`barButton({ label | icon, aria, title, word, primary, press, onPress })`. `.tbar-x` is what demo/verify.mjs presses
(`press: false` gives `.tbar-slot`, never pressed). An icon is a kit icon by name, so no page sets one after the fact.
`onClick` throws: six pages passed it to the old extras, the silent dead-button spelling.

## control

`createTransportControl(deck, { command, endStop, live, liveWindowMs, loopWays, onRate, settling, onLoop, onWay,
onLoopPos })` holds every decision the old bar's button handlers made: play, pause and replay from the end, seek, the
end-stop and the live window on committed timers, rates and their lattice, the three-press loop and its laps.
`run(what, arg)` takes `toggle | play | pause | seek | seekFrac | step | rate | loop | way | loopOff`.
`subscribe(fn)` calls `fn(why)` on every change and every 60 Hz tick. Two changes from the old bar: the end-stop no
longer depends on whether a play button was drawn, and the loop's wrap and outrun run in the control's own tick.

## views

Each view is `(control, { send }) -> { el, destroy }`, paints from `subscribe` and sends a command. The classes are
the old bar's, so shell.css and the harness keep working. `send` defaults to `control.run`.

## keys

`bindTransportKeys(control, { scope, space, send })` marks `scope` with `data-transport`. A key aimed inside another
transport's scope is that one's; a scope inside a hidden `data-own-keys` panel hears nothing; a key from the body
reaches every transport (the old `#own-keys` rule, scoped by attribute instead of by `.tbar`).

## bay

`transportOnBay(bay, { site, control })` adds `<site>:transport` (engine, `value-in` `{ of: 'transport', do, arg }`,
`value-out`) and `<site>:transport-buttons` (person, `value-out`), links them and returns the `send` the views and
the keys use, so every press is `bay.send` along a drawn link. A page also links `<site>:transport:value-out` to what
the transport drives (a player's `value-in`) when that port exists. A page with no bay passes no `send`.

## harness

`publishTransport(transportApi(control, { el: bar.el, toggles }))` is `__demo.transport`: the control's state plus
`el`, the element holding the play button. verify.mjs presses `el`'s `.tbar-toggle` and sends keys at `el` or the
body; bar-drill.mjs takes the same object. `toggles: false` for a transport with no play button.

MEASURED 2026-10-23 on /video/recorder/, the first page moved: 2 of 2 self-checks before and after, the same
published transport (position, toggles, seekable, a `.tbar-toggle` in `el`), the bar drawn the same at 1280, and the
patchbay now shows `web:transport-buttons -> web:transport`.
