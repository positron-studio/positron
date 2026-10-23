# Kit lessons: transport-bar.mjs

Transport-bar.mjs was split and deleted on 2026-10-23 (plans/plan-bars.md, lessons/kit-bar.md). Its rules live on in
transport-control.mjs (play, end-stop, loop, rates), transport-views.mjs (faces, clock, scrub, loop button) and
transport-keys.mjs (keys), which cite the anchors below. Where an entry names an option of `createTransportBar`, read
the new piece that took that job.

The long comments cut from `demo/shell/transport-bar.mjs`, moved here verbatim. Each heading names the file and the block, and the code points at it with `// why: lessons/kit-transport-bar.md#<anchor>`.

<a id="header"></a>

## transport-bar.mjs, file header

demo/shell/transport-bar.mjs — the ONE transport control.

Factory is the primitive; <positron-transport> is a thin wrapper over it that
exists only for disconnectedCallback. No shadow DOM: shell.css cascades in,
and document.querySelector keeps working for CDP.

Rules it enforces so no page has to remember them:
  · playhead from observePosition() — never a page-local rAF loop
  · scrub holds deck.range and re-derives when deck.rangeGen() moves
  · rates rendered FROM caps.rates, intersected across kinds; no lattice
    declared -> a static 1x label, never a slider
  · seek always via deck.seek() (two-phase: reduce + assertState)
  · any {degraded, reason} lands in the badge, never swallowed
  · a LIVE deck loops over a window that fills at the live edge — the bar
    owns the two numbers and the page owns the sound (see `liveWindowMs`)

<a id="toggle-icons"></a>

## transport-bar.mjs, icons import

🔴 THE TOGGLE'S FACE IS AN ICON FROM THE KIT'S SET, NOT A FONT GLYPH IN
`::before`. Asked 2026-10-12: *"global: change transport buttons to proper
icon buttons"*. See `FACES` below.

<a id="live-chip-import"></a>

## transport-bar.mjs, presence import

🔴 THE `LIVE` CHIP IS A PRESENCE BADGE NOW, AND IT IS THE PROJECT'S ONE
ONLINE INDICATOR. See `ON_AIR` below for why a hand-rolled span was the
defect rather than the style.

<a id="loop-ways-import"></a>

## transport-bar.mjs, looper import

🔴 ONE TABLE FOR WHICH WAY A LOOP RUNS, AND IT ALREADY EXISTS. `looper.mjs`
owns the vocabulary because it owns the audio version of this control; a
second copy of the three glyphs here is how two pages end up disagreeing
about what the middle one means. `looper.mjs` imports nothing, so this is a
leaf dependency and not a cycle.

<a id="on-air"></a>

## transport-bar.mjs, ON_AIR

🔴 WHAT A LIVE SOURCE'S BADGE SAYS, AND IT IS THE STANDARD INDICATOR WEARING
THIS PAGE'S WORDS. `presence.mjs` takes a `says` override precisely so that
`on air` costs a word rather than a component.

⚠️ THE FIVE WORDS ARE ABOUT THE SOURCE, NOT ABOUT THE PLAYER. `off air` is a
claim that nothing is arriving any more, which is what a listener wants to
know and what `LIVE` could never say. A page that has stopped listening on
purpose has no measurement to report and goes back to `unknown` rather than
accusing the station of dying.
⚠️ AND THE SET DECIDES THE WIDTH. `presence.mjs` reserves the widest phrase
the badge can ever say, in characters, so `tuning in` at nine is what this
badge is as wide as. `checking` is kept as a WORD because the component
requires one for every state, and left out of `ON_AIR_CAN` because a
transport bar asks nobody a question: it hears sound or it does not.

<a id="scrub-false"></a>

## transport-bar.mjs, scrub: false

`scrub: false` — ONE POSITION SURFACE PER PAGE.

A page that also mounts a strip has two horizontal time axes stacked on each
other, at different scales, with different left origins, and no way for a
reader to know they are the same axis. The strip is strictly the better of
the two: it carries the content as well as the position, and it has always
seeked on press AND on drag, which this bar did not. So where there is a
strip, the bar keeps what only it has — play/pause, the clock, the rates, the
degraded badge — and gives up the slider.

<a id="bar-button"></a>

## transport-bar.mjs, barButton

🔴 A BUTTON FOR THE BAR, BUILT BY THE BAR, BECAUSE `right` AND `left` TAKE
ELEMENTS AND A PAGE WAS THEREFORE TYPING THE CLASSES ITSELF.

Asked for 2026-09-25 against `/stage/`: *"when I look at the transport uh,
play recording is has this huge font size and it's kind of off to the right
so please make it as a standard button"*.
🔴 THE CAUSE, MEASURED RATHER THAN GUESSED: that page builds its button as
`el('button', 'tbar-x', 'PLAY RECORDING')` and hands it to `right`. `.tbar-x`
on its own is a GLYPH box in `shell.css`: `--tbar-btn` square, `display:
grid`, `place-items: center`, `font-size: 15px`. That is right for ▶ and ●
and wrong for a word. 15 px is the huge font, and a two-word label in a
fixed square is what pushed it about. The word treatment has existed the
whole time and is `tbar-x tbar-word`: width from the text, `--pad-bar` of
air, 11 px sans, `--dim`. It is the same class `extras: [{ word: true }]`
already applies, so nothing here is new styling.
⚠️ `.tbar-x` IS NOT REPURPOSED AND MUST NOT BE. The glyph box is what the
loop's ways, `/take/`'s record and `/pack/`'s ‹ › all want, and it is the
selector `demo/verify.mjs` presses on every page. This only stops a caller
having to know the second class name.
⚠️ AND IT IS `.tbar-x`, SO THE HARNESS PRESSES IT. That is deliberate and is
the difference from `loopSlot`, which uses `.tbar-slot` precisely so the
suite leaves it alone. A page whose bar button must not be pressed by the
suite should be in `loopSlot`, not here.

@param {object} o
@param {string} o.label      the word, or the glyph when `word` is false.
@param {boolean} [o.word]    true for a word, which is the standard button.
@param {string} [o.aria]     what a screen reader and a check read.
@param {string} [o.title]    the hover line.
@param {boolean} [o.primary] the record treatment. Rarely what you want.
@param {(btn: HTMLButtonElement) => void} [o.onPress]
@returns {HTMLButtonElement} ready for `right: [...]` or `left: [...]`.

<a id="loop-false"></a>

## transport-bar.mjs, loop option

🔴 `false` LEAVES THE LOOP BUTTON OFF, the way `scrub: false` already
leaves the slider off. A loop is a claim that hearing a passage twice is
worth a control, and that is true of a tape and of a live window and false
of a page whose subject is whether a file arrived intact. `/crate/` plays
an upload once to prove it came back whole, and LOOP there was a button
nobody had a reason to press.

<a id="toggle-false"></a>

## transport-bar.mjs, toggle option

🔴 `false` LEAVES THE PLAY BUTTON OFF, AND IT IS THE THIRD OF THIS FAMILY
AFTER `scrub: false` AND `loop: false`. Asked for 2026-09-16: *"bring
transport bar to keys but no play button, just online badge"*.

WHY A BAR MAY HAVE NO TOGGLE. Play, pause and seek are all claims about a
POSITION inside a sound: somewhere it has got to, somewhere it could be
put instead. `/keys/` has none. A note sounds while a key is held, there is
nothing to start, nothing to resume, and stopping is not a state the page
can be in. A toggle there would be a control whose only honest behaviour is
to do nothing, which is the shape of control this project calls a lie. What
the bar still carries is the thing that IS true of the source: whether the
instrument in the other building is answering. That is the chip.

⚠️ IT DISARMS EVERY OTHER CLAIM THAT DEPENDED ON PLAYING, rather than
leaving them to read false by luck. `api.toggles` says so in one boolean so
a check can ask; `api.playing` is FORCED false rather than derived, because
a deck nobody starts can still be playing if a page started it another way
and the bar has no business reporting that as its own state; the space bar
stops being a play/pause key, because a key that toggles an absent button
is worse than a missing shortcut; and the end-stop never arms, since there
is no end to arrive at.
⚠️ AND `demo/verify.mjs` READS `api.toggles` BEFORE ITS PLAY DRILL. That
drill clicks `.tbar-toggle` and asserts the position advanced, so without
the flag a bar with no toggle would take the harness red on a page where
nothing is wrong. There is no such page in the suite today, since `/keys/`
is `built: false`, and the guard is here because the next one will be.

🔴 THE GUARD WAS PROVED BY BREAKING IT, AND THE BREAK FOUND A SECOND THING.
MEASURED 2026-09-16: forcing this getter false took `/knobs/` from 34/34 to
**11/11, still green** — the skip line printed, the two drill asserts went,
and TWENTY-ONE MORE went with them. That drill's click is what starts the
page: `/knobs/` declares `controls: []`, so the toggle is the only control
a harness presses, and every check it has sits behind `startNote()`.
⚠️ SO A PAGE THAT PASSES `toggle: false` MUST NOT PUT ITS CHECKS BEHIND A
PRESS. There is no press. Nothing is wrong on `/keys/`, which declares no
asserts at all, and this is written down because the next page to take this
option will not be so lucky, and 23 asserts vanishing while the run stays
green is the worst shape a loss takes.

<a id="time-false"></a>

## transport-bar.mjs, time option

🔴 THE CLOCK IS OPTIONAL, AND A PAGE WITH A STRIP IS WHY. Asked 2026-09-18:
*"rm times from transport bar"*, on a page whose strip already carries the
position — the second half of the same report that took the slider off it
(*"no need for slider / times in transport lane"*).

This is the standing "one position surface per page" rule reaching the one
control it had not reached. `scrub: false` already takes off the bar's
SLIDER where a strip is present, on the reasoning that two horizontal time
axes at different scales, stacked, is a contradiction rather than a
redundancy. The clock is the same quantity a third time, in digits: the
strip has a playhead, a ruler with numbers on it, and a gutter, so
`0:04.120 / 3:00.000` beside it is a number nobody reads off the bar.

⚠️ IT DEFAULTS ON, because a bar with NO strip is the common case and there
the clock is the only thing that can say where you are.
⚠️ AND IT DOES NOT TOUCH THE LIVE CHIP OR A PAGE'S OWN `chip`, which sit in
the same slot and carry a different fact. Those are already exclusive of
each other and of the clock; this only says the clock's own case is off.

<a id="loop-slot"></a>

## transport-bar.mjs, loopSlot option

🔴 WHAT TAKES THE LOOP BUTTON'S PLACE ON A BAR THAT HAS NO LOOP. Asked for
in those words, 2026-09-16: *"just replace looper with fullscreen button
(make component slot-able)"*, for `/videoradio/`, whose bar wants a ⛶ where
`/archive/radio/` has LOOP.

⚠️ IT IS A SEPARATE OPTION FROM `loopExtras` BECAUSE THOSE TWO MEAN
DIFFERENT THINGS, and reusing one for the other would be a name that lies.
A `loopExtras` button acts ON a loop and is hidden until there is one; a
`loopSlot` button has nothing to do with looping and is simply what this bar
keeps in that position. `/videoradio/`'s ⛶ is not a loop control that
happens to be visible, it is the only thing in that slot.

Same declaration shape as `extras`: `{ id, label, aria, title, word, onPress }`.
`word: true` for a label rather than a glyph, exactly as `extras` takes it.
Reachable afterwards as `bar.slot(id)`, so a check can press the real
control and a page can relabel one.

<a id="loop-extras"></a>

## transport-bar.mjs, loopExtras option

🔴 BUTTONS THAT BELONG TO THE LOOP, SHOWN ONLY WHILE ONE IS RUNNING.
`extras` sit by the play toggle and are always there, which is right for a
transport verb like record and wrong for a thing that can only act on a
loop: a control that is visible and inert is this project's named failure.
These sit immediately RIGHT of the LOOP button, because that is the thing
they modify, and they appear and vanish with it. ⚠️ THEY WERE ON THE LEFT
AND WERE MOVED, ASKED FOR IN THOSE WORDS: *"move loop mode to right not
left"*. LOOP is the verb and the extra is what it does; reading `[LOOP|→]`
left to right gives the action and then its adverb, where `[→|LOOP]` gave
a glyph with nothing yet to modify.
`[{ id, label, aria, title, always, onPress(btn) }]`. `onPress` gets the
button, so a page can read and set `aria-pressed` and keep the state where
the DOM already holds it rather than in a second variable beside it.

🔴 `always: true` KEEPS ONE ON THE BAR WITH NO LOOP RUNNING, AND IT IS NOT
AN EXCEPTION TO THE RULE ABOVE. That rule is about a control that can do
nothing until there is a loop. A button that says WHICH WAY the next loop
will play can be pressed before there is one and changes what the next
press of LOOP does, so it is neither inert nor hidden: it is the same
distinction `caps.mjs` draws between a thing you cannot do and a thing you
have not done yet. `/archive/radio/` uses it for the direction button glued to
LOOP, which is why the group below exists.

<a id="loop-ways"></a>

## transport-bar.mjs, loopWays option

🔴 THE THREE DIRECTIONS, FOR A LOOP THE DECK ITSELF PLAYS. Asked for
2026-09-16: *"in draw allow < > <> loop mode"*.

A page with an `AudioContext` gets this from `looper.mjs`, which mirrors a
kept buffer and plays the copy. A page whose loop is a DECK has no buffer
to mirror, and the deck cannot help: `transport.setRate` throws on a
negative rate in as many words, `negative rate unsupported in v0`. So the
bar drives a reversed lap itself, from its own clock, seeking the deck
frame by frame while it is paused. See `startLap` below.

⚠️ NOT FOR A MEDIA-BACKED PAGE. `/replay/` refused these on the argument
that a picture only runs forwards, and that argument still holds wherever
the deck is a FOLLOWER of an element: seeking it backwards fights whatever
is mastering it. This is for a deck that IS the thing being played, which
on this site means a drawn record rather than a recording.

<a id="chip"></a>

## transport-bar.mjs, chip option

🔴 AN ELEMENT IN THE LIVE CHIP'S PLACE. `/knobs/` asked for it in those
words: *"on knobs: replace live"*. That position holds the one fact about
the source that is not a number, and on a page playing an instrument in
another building the fact worth having there is whether the instrument is
answering at all. A `LIVE` chip and a presence badge are two claims about
one source in one slot, so the bar takes either and refuses both.

<a id="end-stop"></a>

## transport-bar.mjs, endStop option

A LIVE DECK HAS NO END. The bar arms a one-shot at range[1] and, when it
fires, pauses the deck and parks the playhead there — right for a
recording, wrong for a window whose right-hand end is the present moment,
where that instant arrives a few seconds after play. Default unchanged.

<a id="command"></a>

## transport-bar.mjs, command option

WHO OWNS POSITION. On a deck driven by a media element the deck is a
FOLLOWER: a control that writes to the follower is undone by the master's
next tick, silently and within a few hundred milliseconds. Such a page
passes { play, pause, seek } that drive the element instead, and the deck
follows as it always does. Defaults to the deck's own methods, so every
existing caller behaves exactly as before.

<a id="on-rate"></a>

## transport-bar.mjs, onRate option

Called with the new rate the instant a rate button is pressed.

🔴 IT REPLACES A POLL, AND THE POLL WAS A THIRD OF A REPORTED DELAY.
`/archive/radio/` owns the thing the rate actually acts on (an Icecast playout,
not this deck's playhead), and the only way it could learn about a press
was to read `deck.targetRate()` on a timer. That timer was 1 Hz — *"why
rate change is so slooooooooow"* — then 120 ms, which is better and is
still up to 120 ms of a control doing nothing before anything is even TOLD.
`applyRate` is the single funnel for every rate change in this bar (the
keyboard table has no rate keys), so a callback here is complete.

<a id="settling"></a>

## transport-bar.mjs, settling option

`() => boolean` — is the armed rate not yet audible?

⚠️ THE BAR CANNOT KNOW THIS AND MUST NOT GUESS. Whether a speed has
arrived is a fact about whatever is making the sound: a media element is
there the same frame, and a stream with 600 ms of audio already scheduled
is not. A deck that says nothing gets no pulse, which is the honest
default — a bar that animated on a timer would be inventing a wait.

<a id="on-loop"></a>

## transport-bar.mjs, onLoop option

Called when the loop changes or comes round:
`('fill'|'set'|'wrap'|'off', a, b)`.
⚠️ A WRAP IS AN EVENT AND THE BAR IS THE ONLY THING THAT KNOWS IT HAPPENED —
the deck is told to seek and has no idea why. A page that draws the audio
can put the moment on its own picture; `/tapes/` marks it on the wave.

`fill` is the live case and it is the one a page must act on: the window
has opened at `a` and will close at `b`, so whatever is holding the sound
starts keeping it NOW. The bar holds no audio of its own.

<a id="live-window"></a>

## transport-bar.mjs, liveWindowMs option

How much live sound one loop may hold, in milliseconds.

🔴 A LIVE LOOP NEEDS A CEILING OR IT IS A RECORDING WITH NO END. The first
press opens the window and the live edge fills it at one second per second;
without a limit the only way it ever closes is a second press, which is a
control you can leave running.

20 s is long enough for a phrase of music or a spoken sentence and short
enough to sit through while it fills, and it is far inside the three minute
window the one live deck in this repo declares. ⚠️ IT IS A DEFAULT, NOT A
MEASUREMENT: the bar cannot know how many seconds a page can really keep.
A page that holds a ring of its own passes that ring's length here, and
then the button promises exactly what the page can deliver.

<a id="on-loop-pos"></a>

## transport-bar.mjs, onLoopPos option

Where the playhead is INSIDE a running loop, 0..1, and `null` once when
there is no loop. A page that draws the sound can run its own playhead
across a frozen picture from this; `grain-scope.mjs` takes exactly that.

⚠️ PUSHED FROM THIS BAR'S PAINT, NOT POLLED BY THE PAGE. `observePosition`
is already running at 60 Hz here, and a second rAF loop in a page is the
thing this file exists to stop.

<a id="verb"></a>

## transport-bar.mjs, verb option

🔴 `verb: 'record'` MAKES THE TOGGLE A RECORD BUTTON. Asked 2026-09-18 for
`/stage/`: *"replace play with record button in controlroom"*. A control
room's one press does not start playback of anything, it puts a show on air
and writes it down, and a ▶ on it was describing the wrong verb.
⚠️ IT IS A CLASS AND A LABEL, NOT A SECOND BUTTON. The element, its
`.tbar-toggle` class, its `data-state` and everything that presses it are
untouched, so `demo/verify.mjs`'s play drill and every page holding the bar
keep working. Only the face and what a screen reader hears change.
🔴 `verb: ['start', 'stop']` MAKES THE TOGGLE TWO WORDS INSTEAD OF A GLYPH.
Asked 2026-09-19 for `/stage/`: *"replace timeline-glued transport record
button with start | stop text labels (same w)"*. A red dot says WRITING,
and that bar's press also puts a show on air, so the dot described half of
it. A word can say the whole thing.

🔴 BOTH WORDS ARE IN THE BUTTON AT ONCE AND THE HIDDEN ONE STILL TAKES ITS
SPACE, which is what makes the two states the same width without anybody
measuring anything. `shell.css` puts them in one grid cell and hides the
inactive one with `visibility`, so the button is always as wide as the
longer word, in any font. The alternative, swapping `textContent`, is a
control that changes size under the pointer that just pressed it.
⚠️ REFUSED AT CONSTRUCTION, WHERE THE STACK STILL SAYS WHO ASKED. One word,
three words, or a number would each fail in a different quiet way: one word
gives a toggle that never changes, and three render on top of each other.

<a id="verb-stop"></a>

## transport-bar.mjs, verb: 'stop'

🔴 `verb: 'stop'` IS THE THIRD FACE AND IT SAYS WHAT THE SECOND PRESS DOES.
Asked for on `/tom/` 2026-09-21: *"replace pause icon with stop icon"*,
after that page's second press was made to STOP and rewind rather than
pause. A `❚❚` over a control that returns the playhead to the top is the
shape this project calls a lie: a face describing a verb the button does
not perform.
⚠️ IT IS A CLASS AND AN ARIA LABEL, NOTHING ELSE. The element, its
`.tbar-toggle` class, its `data-state` and everything that presses it are
untouched, so `verify.mjs`'s play drill and every page holding a bar keep
working. That is the same argument `verb: 'record'` already makes above.
⚠️ AND THE FACE IS THE KIT'S `stop` ICON, a drawn square, since
2026-10-12. It was `■` U+25A0 in `::before`, chosen because `⏹` defaults to
emoji presentation; an icon has no presentation to get wrong.

<a id="two-spans"></a>

## transport-bar.mjs, toggle words

⚠️ TWO SPANS, NOT ONE THAT GETS REWRITTEN. The stylesheet decides which one
is visible from `data-state`, which the bar already maintains, so there is
no second place that has to remember which word is showing.

<a id="faces"></a>

## transport-bar.mjs, FACES

🔴 THE GLYPH TOGGLE WEARS ICONS FROM `icons.mjs`, ONE PER STATE, AND THE
STYLESHEET PICKS THE ONE ON SHOW FROM `data-state`. Asked 2026-10-12:
*"global: change transport buttons to proper icon buttons"*. It was ▶, ❚❚,
■, ●, ◌ and ↺ typed into `::before`, each a font glyph with its own
advance, baseline and size override; an icon is a drawn picture on a 24
unit grid in `currentColor`, so the square's `place-items: center` centres
its ink with nothing measured.
⚠️ ALL THE FACES ARE IN THE BUTTON AT ONCE, NOT ONE SWAPPED BY `setIcon`.
That is the two-span arrangement `tbar-word` already uses one rule up: the
bar writes `data-state` and nothing else, so there is no second place that
has to remember which face is showing, and a check that sets `data-state`
by hand (`/tom/` does) sees the face it set. `pos-icobtn` and `data-glyph`
are what `setIcon` stamps, so the toggle is the kit's icon button in every
rule that matters, at the bar's own `--tbar-btn` square.
⚠️ `buffering` IS NOT WRITTEN BY THIS BAR TODAY; the face exists because
`shell.css` drew one for it, and a state with no face is an empty square.

<a id="extras"></a>

## transport-bar.mjs, extras option

`extras` — page buttons that belong to the TRANSPORT rather than beside it.
Recording is the case that earned this: on `take` it is a transport verb,
not a side control, and putting it in `.pos-controls` would have said it was
something you do to the page rather than to the playhead. They sit next to
the toggle and are returned by id so a page can relabel or disable one.

<a id="loop-slot-refused"></a>

## transport-bar.mjs, loopSlot with loop

🔴 A BAR MAY NOT DECLARE BOTH A LOOP AND SOMETHING IN THE LOOP'S PLACE.
They render into one position, so the two together are an author asking for
a layout that does not exist, and the failure without this would be silent:
whichever came last in the append would win and the other would simply not
be on screen. Refuse at construction, where the stack still says who asked.

<a id="tbar-slot"></a>

## transport-bar.mjs, loopSlot buttons

🔴 `tbar-slot`, NOT `tbar-x`, AND THE REASON IS THE HARNESS. `verify.mjs`
presses `.pos-controls button, .tbar-x` on every page, because `.tbar-x`
means "a button the PAGE put in the transport" and those are worth
exercising. This slot is not that: `/videoradio/` keeps a ⛶ in it, and a
suite that presses it leaves the page full screen for every check after
it, including the page's own full screen check, which would then find
somebody already full screen and decline to grade. The loop button is
kept out of that selector for exactly the same reason and says so in
`shell.css`.
⚠️ IT LOOKS IDENTICAL. `shell.css` gives `.tbar-slot` the same rule as
`.tbar-x`; what differs is who presses it, not what it is.
🔴 `word: true` MAKES IT A LABEL RATHER THAN A GLYPH, AND IT WAS MISSING
WHILE `extras` HAD IT. MEASURED 2026-09-21 on `/pack/`: a slot button
carrying the word `loop` drew a 30 px square with the text spilling out
of it and over the bar's own right edge. `.tbar-slot` is a GLYPH box,
`--tbar-btn` wide, and the only thing that has ever gone in one is
`/videoradio/`'s ⛶, which is why nobody met this.
⚠️ AND THE SLOT'S WHOLE PURPOSE IS TO TAKE THE LOOP BUTTON'S PLACE, which
is `tbar-loop tbar-word` reading `Loop`. A slot that could not wear a
word could not replace the thing it is named after.

<a id="slot-never-hidden"></a>

## transport-bar.mjs, loopSlot never hidden

⚠️ NEVER HIDDEN. That is the whole difference from `loopExtras`, which
wait for a loop to act on.

<a id="end-extras"></a>

## transport-bar.mjs, extras with end: true

🔴 `end: true` PUTS AN EXTRA AT THE START OF THE RIGHT GROUP, JUST LEFT OF
LOOP. Asked 2026-10-05 on `/flipper/`: *"we have unmute buttons, look them
up. left from loop"*. Sound is a state of the playing thing, like the loop
and the rate beside it, not a verb by the play toggle. Same declaration,
same `extra(id)`, only the position differs, and it takes the `data-end`
marker so the gap in the middle of the bar opens to its left.

<a id="extra-word"></a>

## transport-bar.mjs, extras word

`word: true` says the label is a WORD, not a glyph — it gets width from
its text instead of the 38px square, and the uppercase treatment the
rest of the furniture uses. A square sized for one glyph either clips a
word or is padded around it, and both read as a mistake.

<a id="on-press-on-click"></a>

## transport-bar.mjs, extras onPress and onClick

🔴 BOTH SPELLINGS, AND `onPress` FIRST, BECAUSE THIS ONE LINE COST A DAY.
`barButton`, `loopSlot` and `loopExtras` all bind `onPress`, this module's
own docs say `onPress` twice (one of them reading "Same declaration shape
as `extras`", which was simply false), and ONLY `extras` bound `onClick`.
MEASURED 2026-09-25: `/stage/` passed `onPress` and its two main controls
were DEAD. `START HLS` and `START WEBRTC` did nothing for a visitor and
nothing for the harness, so its check pressed a button that could not
start anything and then polled 45 s for a show nobody had asked for.
Fourteen asserts followed it red and were read as a timing problem for a
day: the wait was widened to 28 s, 45 s and 80 s, `settleMs` was tripled,
and the page was rewritten five times. Nothing was wrong with the timing.
⚠️ A SILENT NO-OP IS THE WORST SHAPE A DEFECT TAKES, and `?.` is what made
it silent: a misspelled handler is indistinguishable from a button with
nothing wired to it, so nothing threw, nothing logged, and the page
looked finished. Seven of the eight pages that declare `extras` happened
to pass `onClick` and worked, which is why it survived: the majority were
accidentally right and the documentation was wrong about all of them.
⚠️ AND ACCEPTING BOTH IS THE FIX RATHER THAN PICKING ONE. Renaming to
`onPress` alone would break those seven pages at once, and renaming the
docs to `onClick` would leave this module disagreeing with its three
siblings. Both names work here now and `onPress` is the one to write.

<a id="two-line-clock"></a>

## transport-bar.mjs, clock on two lines

⚠️ TWO LINES, NOT ONE. `0:00.902 / 3:55.076` is thirteen mono characters of
which one is a slash, and it was the widest fixed thing on the bar —
enough, with a LOOP button beside it, to push the rate group onto a second
row. Stacked it is half the width and the two numbers stop being one long
number with punctuation in the middle: where you are, and how long it is.

<a id="live-chip"></a>

## transport-bar.mjs, liveChip

🔴 A LIVE SOURCE HAS NO CLOCK WORTH PRINTING. On an Icecast mount the left
half of `19:33:46.098 / 3:00.000` is the wall clock, which the machine
already shows, and the right half is a duration a live stream does not
have. REPORTED as *"transport timers are pointless here. what about LIVE
label"*, and they were: two numbers, neither of which anybody can act on.

⚠️ IT CARRIES ONE FACT. It briefly read `SLOWED` at any armed rate other
than 1, and that is a second channel saying what the rate radio group
already says an inch to its right — the armed button IS the statement that
you are not at 1x. How far behind is a number and belongs in a readout
cell, which is the page's BEHIND.

🔴 AND THAT ONE FACT IS NOW MEASURED RATHER THAN DECLARED. Asked
2026-09-20: *"For videoradio use std online insicator with 'on air'. In
other 'live' labesl too tim other demos"*. It was
`el('span', 'tbar-live', 'LIVE')` — a word drawn because the page passed
`live: true` at BUILD TIME, so it said LIVE whether or not a byte was
arriving. That is two of this project's named hazards in one span: every
readout cell must be able to change, and a control that looks live and is
inert. A station that went off the air left the word standing.
⚠️ SO THE SWAP IS NOT A RENAME, AND A PAGE HAS TO FEED IT. `api.live` is
the badge; a page calls `follow()` once and `seen()` whenever sound
actually arrives. A page that feeds it nothing shows `unknown`, which is
the honest state and never blocks anything. A badge wired to a constant
would be the same lie in a better font.

<a id="loop-button"></a>

## transport-bar.mjs, loopBtn

🔴 LOOP IS ON EVERY BAR, AND IT IS THREE PRESSES OF ONE BUTTON.

Set the start, set the end, and the third press takes the loop off again.
One control rather than two, because two controls for the two ends of one
interval is a pair you can leave half-set — a start with no end is a
button that looks armed and does nothing, and there is no state in this
shape that isn't visible on the button's own face.

⚠️ IT IS NOT HIDDEN ON A DECK THAT CANNOT LOOP. A source with no end has
nothing to come back to, and the honest answer there is the button SAYING
so when it is pressed — the same rule `caps.mjs` follows for a demo a
browser cannot run. A control that vanishes says the feature does not
exist, which is a different and false statement.

⚠️ AND A LIVE SOURCE IS NO LONGER ONE OF THOSE. It used to answer *a live
station has no past to come back to*, which is true of the station and
false of the page: what a live loop plays is a window this bar opens and
the page fills. See the live-window block further down.
🔴 `Loop`, NOT `LOOP`, ASKED 2026-09-23: *"rename LOOP in transport to
    Loop"*. Every other word on this bar is a name rather than a shout, and the
    keyboard's own `Loop` toggle landed the same day, so two controls doing
    related things would otherwise have been spelled two ways on one page.

<a id="loop-group"></a>

## transport-bar.mjs, loopPair

🔴 THE EXTRAS AND LOOP ARE ONE SEGMENTED CONTROL, NOT TWO BUTTONS WITH A
GAP. ASKED FOR IN THOSE WORDS: *"[→|LOOP] - two different buttons visually
together"*. They are two buttons and they stay two buttons — separate hit
areas, separate labels, separate aria — and what joins them is one shared
edge, because what the left one sets is a property OF the right one. At the
bar's ordinary 8 px gap the direction glyph read as another piece of
furniture that happened to be next to LOOP.
⚠️ NO GROUP WHEN THERE IS NOTHING TO GROUP: a lone LOOP button goes
straight on the bar, so every page that declares no extras is untouched.

<a id="data-end"></a>

## transport-bar.mjs, right group and data-end

🔴 THE ROW HAS ONE BOUNDARY AND THE FREE SPACE OPENS AT IT: EVERYTHING FROM
THE LOOP RIGHTWARDS SITS AT THE RIGHT END OF THE BAR. Asked 2026-09-19 as
*"reel: move loop to the right of transport"*, and it is a rule about this
row rather than a nudge on that page.

The bar is two groups with a gap in the middle: the transport on the left
(play, a page's own verbs, the slider) and the loop, the rates and the
badge on the right. That was already true and was carried by whichever
member happened to be in the middle: the scrub grows (`flex: 1 1 56px`),
and `shell.css` gives the clock and the LIVE chip a `margin-right: auto`
with no slider present. Three members, three copies of one intention, and
a bar with NONE of them left had nobody holding the boundary: `/reel/`
passes `scrub: false` (it has a strip) and `time: false` (its position is a
date), so LOOP packed left against the ‹ › it used to sit a clock away
from. MEASURED at 1280: LOOP's left edge at 57 px with 375 px of empty bar
to the right of the rates.

⚠️ IT IS THE PROJECT'S EXISTING SPELLING FOR THIS, NOT A SECOND MECHANISM:
`data-end="1"` is what `.pos-controls` stamps for `end: true` in
`shell.mjs`, and it means the same thing here. `shell.css` says why the bar
needs its own selector for it.
⚠️ AND IT IS UNCONDITIONAL, WHICH IS THE WHOLE POINT. Where something to the
left is already flexible the margin gets nothing and nothing moves: a
growing scrub eats the free space before auto margins are resolved, and the
clock's `margin-right: auto` shares the SAME gap, so half each lands the
group in exactly the same place. MEASURED both ways, unchanged to the
tenth of a pixel at 1280 and at 390.
🔴 `right` IS A CALLER'S OWN CONTROL IN THE RIGHT GROUP, WHERE THE RATES
SIT. Asked for on `/tom/` 2026-09-21: *"bpm in on the transport, right
slot"*, after that page dropped the rate lattice for a `- bpm +` stepper.
⚠️ IT IS AN OPTION RATHER THAN A PAGE REACHING INTO `.tbar-rates`, which is
what this project calls hand-rolling a control that exists: a page that
queries a component's insides is a page that breaks the day the component
renames a class, silently, with the source still reading as correct.
⚠️ AND `extras` IS NOT THE SAME SLOT. Those are a page's VERBS and sit by
the play toggle on the left, because they are things you press to make
something happen. The right group is what the transport IS doing: its loop,
its rate, its badge. A tempo belongs with the rate it replaces.
⚠️ THE `data-end` MARKER FALLS THROUGH TO WHICHEVER MEMBER IS FIRST. It is
what holds the gap in the middle of the bar, and a bar with no loop and no
lattice would otherwise have nobody holding it and pack everything left,
which is the `/reel/` measurement recorded above: LOOP at 57 px with 375 px
of empty bar to its right.

<a id="rates"></a>

## transport-bar.mjs, rates lattice

── rates: intersect every declared caps.rates lattice ──────────────────
Rebuilt whenever the adapter registry moves. A nest registers its adapter
on the parent AFTER this bar is constructed, and a page that swaps one
arrangement for another changes the answer again — so a lattice computed
once describes a deck that has not been assembled yet.

<a id="rate-choice"></a>

## transport-bar.mjs, rateChoice

🔴 THE RATES ARE A RADIO GROUP, FROM `choice.mjs`, LIKE EVERY OTHER SET OF
MUTUALLY EXCLUSIVE OPTIONS IN THIS REPO. This built its own loose buttons
with its own `aria-pressed` bookkeeping and its own CSS block, which is the
fourth hand-rolled copy of a control that has been a component since
`choice.mjs` landed — and CLAUDE.md says to build from the kit and to stop
and ask rather than make another one. REPORTED as *"rate controls should be
radiobuttons everywhere. you keep breaking the rule"*, which is fair: this
page's own speed picker WAS a `createChoice` before it moved in here, and
moving it into the bar is where it lost its component.

⚠️ SEGMENTED, NOT SPACED, is part of what the component carries — gaps make
four options look like four unrelated controls. The old `.tbar-rates` block
set `gap: 4px` and did exactly that.

<a id="was-settling"></a>

## transport-bar.mjs, wasSettling

⚠️ DECLARED UP HERE BECAUSE `buildRates()` RUNS AT CONSTRUCTION. It calls
`syncRates()`, which clears this — and a `let` further down the file is in
its temporal dead zone at that moment, so the constructor would throw
`Cannot access 'wasSettling' before initialization` and take the whole page
with it. That is exactly the failure HANDOFF records for the first attempt
at a rate lattice here: `__demo.ready — failed` and nothing else to go on.

<a id="lattice-of-one"></a>

## transport-bar.mjs, lattice length > 1

🔴 `> 1`, NOT `length`. A LATTICE OF ONE IS NOT A CHOICE AND MUST DRAW
NOTHING. Found on `/replay/` 2026-09-16 and reported as *"what this
disconnected 1 does here?"* with a screenshot: its cue lane declared
`caps: { rates: [1] }`, the intersection came out as `[1]`, and
`createChoice` rendered a radio group with a single member, which is one
armed yellow button beside LOOP with nothing to choose it against.

⚠️ THE RULE WAS ALREADY WRITTEN AND WAS HONOURED FOR THE WRONG CASE. The
note on `latticeFor` says a deck with no rate lattice shows nothing
rather than a lone 1, and this guard enforced it only for an ABSENT
lattice. A lattice that exists and holds one value reaches the reader as
exactly the thing that note forbids.
⚠️ CHECKED BEFORE CHANGING IT: `demo/jam/` and `demo/kit/` are the only
other places declaring a single rate, and neither asserts on the row, so
both simply stop drawing a button nobody could press meaningfully.

<a id="no-x"></a>

## transport-bar.mjs, rate labels

🔴 NO `x`. Five buttons reading `0.25x 0.5x 1x 1.5x 2x` spend a fifth
of their width on a letter that is the same on every one of them —
and a row of numbers under a transport is already unambiguously a
speed. The suffix was also what pushed the group onto a second line
at ordinary widths, which is a bar that changes height for a unit
nobody was reading. The armed one is marked by colour and fill; the
page's own words say what it is.

<a id="no-lone-one"></a>

## transport-bar.mjs, no lattice

🔴 A DECK WITH NO RATE LATTICE SHOWS NOTHING, NOT A LONE "1".
This printed a grey 1 to be honest that there was no choice, and honesty
was not the problem: a control that can only ever read 1 is a structural
constant wearing a measurement's clothes, which is the thing CLAUDE.md
throws a readout out for. It taught a reader to look at a spot where
nothing will ever happen. The absence of a rate group already says there
is no choice, and says it without occupying anything.

<a id="on-rate-order"></a>

## transport-bar.mjs, onRate before syncRates

⚠️ BEFORE `syncRates`, so the page has already armed whatever it owns by
the time the pulse is decided. The other order asks `settling()` about a
rate the page has not been told about yet, which reads as "arrived" for
one frame and then starts pulsing — a flicker on every press.

<a id="target-rate"></a>

## transport-bar.mjs, syncRates

`targetRate`, which is the library's own answer and was here all along:
"the rate play() would resume at — WHAT A PAUSED UI DISPLAYS"
(transport.mjs, beside setRate). `deck.rate()` is 0 while paused, because a
paused transport genuinely advances at zero, so comparing buttons against
it selected none of them exactly when someone is reading the row deciding
what to press — and worse, pressing one changed nothing visible, since
setRate on a paused deck arms the rate and stays paused. An earlier fix
here tracked its own "last real rate", which reinvented targetRate and got
it wrong: it only ever updated while rolling.

<a id="fmt"></a>

## transport-bar.mjs, fmt

`fmt` — a page may say how a position READS. `0:03.910` is the right
answer for a deck of seconds and a meaningless one for a deck of 1965,
where the position is a date. Default unchanged; a page that needs
calendar time supplies a formatter rather than the bar guessing.
⚠️ `fmt` STILL GETS THE WHOLE LINE. A page that supplies a formatter is
saying how a position READS — `/tapes/` prints a date — and splitting its
answer on a slash it did not put there would be this bar editing a page's
own words.

<a id="wrap"></a>

## transport-bar.mjs, loop wrap

🔴 THE WRAP, RATE-LIMITED, AND THE LIMIT IS NOT A SAFETY MARGIN — IT IS
THE FIX. A seek is not instant on every kind of deck, so the frame after
one is asked for can still report a position past the end, which asks
for another, which is a seek storm that reads as a stuck playhead. This
repo has the general form already written down: *a recovery action is
not free — rate-limit it.*
⚠️ AND ONLY WHILE ROLLING. Wrapping a paused deck would drag the playhead
back under somebody who is scrubbing inside their own loop.
⚠️ NOT WHILE THE LAP DRIVER HAS IT. That loop owns both edges and wraps
on its own clock; this one would wrap it a second time at the far end.

<a id="outrun"></a>

## transport-bar.mjs, loop outrun by range

A loop is a claim about a range, so it cannot outlive one. A live deck's
range walks forward and will eventually leave the marks behind it; saying
so is better than looping over ground that is no longer there.

🔴 ONLY THE LEFT EDGE ON A LIVE DECK, AND THIS WOULD HAVE THROWN EVERY
LIVE LOOP AWAY THE INSTANT IT WAS MADE. A live range's right edge is the
present moment as the PAGE last published it, and the station page
publishes it once a second — while the deck's own position runs
continuously. So a window that ends exactly at the live edge reads as up
to a second PAST `range[1]`, and the test below would have cleared it,
with a badge blaming a range nobody can see. A live range can only be
outrun at the back.

<a id="warn-blink"></a>

## transport-bar.mjs, warning blink

THE WARNING, WHICH IS A BLINK AND NOT A NUMBER — see setBlink. The last
quarter of the window is when the button starts saying it is about to
close itself, measured against the window that was actually opened rather
than against the option, so the two can never disagree.

<a id="sync-pending"></a>

## transport-bar.mjs, syncPending

The armed rate button pulses until the speed is actually audible.

⚠️ ON THE PAINT LOOP, AND THE DOM IS TOUCHED ONLY WHEN THE ANSWER CHANGES.
`observePosition` already runs this at 60 Hz; writing a dataset attribute
sixty times a second would restart the CSS animation on every frame, which
is an animation that renders as a still.

<a id="end-one-shot"></a>

## transport-bar.mjs, end of a bounded piece

── the end of a bounded piece ──────────────────────────────────────────
A BOUNDARY IS A COMMITTED ONE-SHOT, NEVER A POLL. This used to live inside
paint(), which observePosition drives off requestAnimationFrame — so in a
hidden tab it never ran: measured, a 20 s deck reached 91,001 ms and was
still reporting `playing: true`, while the bar's clock sat frozen at
0:00.000. The deck's own scheduler was keeping perfect time throughout;
the only broken thing was asking the renderer to enforce a rule.

CAVEAT, because it should not be discovered later: this timer is a plain
setTimeout on the main thread, so a hidden tab clamps it to ~1 Hz and the
stop can be up to a second late. That is a bounded error instead of an
unbounded one. The exact fix is to arm it on the scheduler's own worker
host, which createDeck does not currently expose.

<a id="close-at-end"></a>

## transport-bar.mjs, closeAtEnd

🔴 ONE PRESS IS ENOUGH: THE END IS THE SECOND MARK. ASKED FOR 2026-09-16:
*"if not pressing loop again and playback reaches the end, mark loop right
mark as end and consider the state 'loop engaged'"*.

So a start with no end is not a half-set control waiting for a hand any
more. Press once and let it run, and what you get is a loop from there to
the end of the source, running, with the button on. Press a second time on
the way and you get the shorter loop you marked, which is what it always
did. ⚠️ A ZERO LENGTH ONE IS STILL REFUSED: a mark on the last frame has no
room in front of it, and the end behaves normally there.
⚠️ AND NOT ON A LIVE DECK, where a start with no end is a window being
FILLED and already has its own way of closing. `filling` says which.

<a id="replay-at-end"></a>

## transport-bar.mjs, interaction, pressToggle

── interaction ─────────────────────────────────────────────────────────
Parked at the end, the play button REPLAYS. This is what a sequencer does:
stop at the end and leave the playhead there — the final state is worth
looking at, and here it is literally the fold of every event — then send
the transport back to the start when you ask for play again. Restarting is
well defined in this library in a way it is not for a media element: a
backward seek replays each event exactly once.
Space goes through this too, so a key never skips `stopLap()` or `leaveEnd()`.

<a id="scrub-live"></a>

## transport-bar.mjs, liveSeek

SCRUB LIVE, NOT ON RELEASE. seekFromEvent() only repaints this bar's own
fill; until pointerup the deck never moved, so the strip's playhead, the
readout and every lane sat still while the handle slid — the bar looked
like the only thing on the page connected to anything.

Coalesced to one seek per frame: a pointermove stream can arrive faster
than a frame, and deck.seek() is two-phase (reduce + assertState), so
seeking per event asks a lane to re-fold work nobody will ever see.

<a id="live-loop"></a>

## transport-bar.mjs, live loop window

🔴 A LIVE SOURCE GETS A LOOP TOO, AND WHAT IT LOOPS OVER IS A WINDOW THAT
FILLS IN REAL TIME.

This used to refuse at the press: *a live station has no past to come back
to*. That is true of the station and false of the page, which can keep the
last few seconds of what arrived. So the first press marks the start and
OPENS a window, the live edge fills it at one second per second, and when
it is full the loop is finished and starts playing. A second press before
that ends it early; a press after it takes it off.

⚠️ THE BAR HOLDS NO AUDIO, AND CANNOT. It owns the window in the deck's own
time and says when it opened, closed and came round; the page owns the
sound and hears those through `onLoop`. A page that does not listen gets a
playhead that loops over silence, which is why `fill` is an event and not
an internal state change.

<a id="set-blink"></a>

## transport-bar.mjs, setBlink

🔴 A WARNING, NOT A COUNTDOWN. A number ticking down is a readout: it asks
to be read, and there is nothing a reader can do with the digits. The blink
says the one thing there is to say, which is that the window is about to
close itself.

⚠️ IT ANIMATES OPACITY AND NOTHING ELSE. The word on the face never
changes, the padding never changes, and neither does the border — so the
rate picker and the clock beside it stay exactly where they are. That is
the rule this button already carries for its three states, and a blink that
grew a glow or a letter would break it in a new way.

⚠️ REDUCED MOTION GETS A STEADY DIM RATHER THAN NOTHING. Somebody who asked
for less movement still has to be told the window is closing. `shell.css`
already does exactly this for a busy button. It is built here rather than
in the stylesheet because the animation belongs to this control and to no
other, and because the global reduced-motion rule in `shell.css` switches
CSS animations off outright — which for a warning would be silence.

<a id="arm-fill"></a>

## transport-bar.mjs, armFill

⚠️ A COMMITTED ONE-SHOT, NOT A CHECK ON THE PAINT LOOP, for the same reason
`armEnd` is one: `observePosition` runs off requestAnimationFrame, so in a
hidden tab the window would go on filling forever and the loop would never
close. Re-armed from `onState` beside `armEnd`, because a play, a pause, a
rate or a seek each move the instant at which the window is full.

A paused deck gets no timer at all, and that is right: nothing is arriving,
so nothing is filling.

<a id="lap"></a>

## transport-bar.mjs, lap driver

🔴 A LAP THE BAR DRIVES ITSELF, BECAUSE THE DECK WILL NOT RUN BACKWARDS.
`transport.setRate` throws `negative rate unsupported in v0`, so `←` and
`⇆` cannot be a rate. What they are instead: the deck is PAUSED and this
seeks it once a frame from the bar's own clock, which is the same
arithmetic `looper.mjs` does to a buffer and is the only place in this file
that owns a frame loop.

⚠️ `observePosition` KEEPS TICKING WHILE THE DECK IS PAUSED (it is a plain
rAF, checked rather than assumed), so the clock, the fill and the head in
this bar follow a reversed lap without a second painter.
⚠️ AND THE TOGGLE HAS TO KNOW. `deck.playing()` is false for the whole of a
reversed lap, so `rolling()` below is what everything in this file asks
instead: a bar showing PAUSE over a moving playhead is a control lying
about the state it is in.

<a id="loop-word"></a>

## transport-bar.mjs, loop button state

🔴 THE WORD NEVER CHANGES, BECAUSE A CONTROL THAT RESIZES ITSELF MOVES
EVERY CONTROL BESIDE IT. It said LOOP, then END, then LOOP again, and
three characters against four is enough to shove the rate picker and the
clock sideways every time somebody pressed it. That is the same defect as
a live sentence reflowing under a picture: nothing that changes while you
are looking at it may change how much room it takes. State is carried by
`data-loop`, which paints, and by the label a screen reader is given,
which has no width.

⚠️ A FILLING WINDOW IS THE `armed` STATE AND KEEPS ITS PAINT. It is a
start with no end yet, which is what `armed` already means, so the live
case needs no fourth colour and no stylesheet of its own. What the live
case adds is the blink, which is opacity and takes no room.

<a id="set-loop-view"></a>

## transport-bar.mjs, setLoopView

🔴 AND THE PICTURE IS TOLD. The bar owns the loop and keeps two numbers;
a strip drawing the same deck had no way to learn about them, so every
page with both drew a picture of time with the loop missing from it.
`deck.setLoopView` is the one object the two share. The state published
is the same word this button is wearing.

<a id="live-loop-off"></a>

## transport-bar.mjs, live loop off

A LIVE SOURCE HAS ONE POSITION THAT MEANS ANYTHING ONCE THE LOOP IS OFF,
and it is now. Leaving the playhead where the loop was would park it in a
past the station has stopped sending, with a LIVE chip above it saying
otherwise.

<a id="no-loop-note"></a>

## transport-bar.mjs, clearLoop badge

🔴 THE BADGE SAYS NOTHING ABOUT A LOOP ENDING. ASKED FOR, MORE THAN ONCE.

`why` is still passed and is still the reason, because a caller reading
this code needs to know which of four paths cleared the loop. What it no
longer does is put that reason on screen. Every one of those sentences is
longer than the 60 characters the badge shows, so what a person actually
saw was `THE LOOP RAN OFF THE BACK OF WHAT IS ST…` sitting in the
transport, and CLAUDE.md is explicit that anything truncating with an
ellipsis is in the wrong place rather than in need of a wider box.

It is also not news. The loop ending is visible: the LOOP button goes
dark, the band leaves the slider, the sound changes. A line of prose
saying so is a third channel repeating what two already carried.
⚠️ THE BADGE ITSELF STAYS for the things it is right for, which are
states a page cannot see any other way: a degraded source, a refused
rate. Those are reported by their own callers and are not this.

<a id="no-loop-words"></a>

## transport-bar.mjs, loop has no messages

🔴 THE LOOP SAYS NOTHING IN WORDS. ASKED FOR IN THOSE WORDS, 2026-09-16,
WITH A PHOTOGRAPH OF THE BADGE: *"rm all loop messages."*.

Two sentences used to appear in the transport when a press was refused:
`this source has no end to come back to` and `the two marks are in the same
place`. Both were true and neither was worth a line of prose in a bar six
controls wide. A deck with no end gets a DISABLED button instead, which
says the same thing before you press rather than after; two marks in one
place is now almost unreachable, because a press on a stopped transport
starts it rather than leaving the playhead where the next press will land.
⚠️ THE BADGE ITSELF STAYS for what it is right for, which is a degraded
source and a refused rate. Neither of those is about a loop.

<a id="seekable"></a>

## transport-bar.mjs, loop press seekable

⚠️ ASKED OF THE DECK, NOT OF THE BAR. `seekable` is the one fact that
decides whether a loop can exist at all, and it is the same flag the
scrub and the harness read, so the three cannot disagree.

<a id="press-starts"></a>

## transport-bar.mjs, loop press starts the transport

🔴 A PRESS ON A STOPPED TRANSPORT STARTS IT. ASKED FOR 2026-09-16:
*"when not playing and prssing loop, playback should start"*.

The old shape needed the transport to be rolling already, and pressing
LOOP twice on a stopped deck put both marks in the same place, because
nothing moved between them. That is the state the badge was reporting.
⚠️ PARKED AT THE END, A PRESS MEANS FROM THE TOP. Marking the start of
a loop at the last frame is a loop of nothing, and the play button
already treats a press at the end as a restart, so the two agree.

<a id="live-window-ahead"></a>

## transport-bar.mjs, live window opens

🔴 A LIVE DECK HAS NOTHING BEHIND THIS PRESS, SO THE WINDOW IS AHEAD OF
IT. On a recording both marks are behind you and the second press picks
the end; on a station the sound the loop will play has not arrived yet,
so the press opens a window instead and the live edge fills it. The
page is told at once, because it is the thing that has to start keeping
the audio — the bar keeps only the two numbers.

<a id="backwards-loop"></a>

## transport-bar.mjs, loop marked backwards

🔴 A LOOP MARKED BACKWARDS IS STILL A LOOP SOMEBODY MEANT. Pressing
the second time after seeking BACK gives an end before the start, and
refusing it is a control punishing somebody for the order they worked
in. Swapped; only a zero-length one is refused, because that is the
press that landed on the same frame as the first and means nothing.

<a id="zero-length"></a>

## transport-bar.mjs, zero-length loop

Silently, and it stays armed. The press landed on the same frame as the
first one and means nothing; a sentence in the transport saying so was
removed on instruction, and with a press now starting the transport
this is a hand that pressed twice rather than a state anybody is in.

<a id="own-keys"></a>

## transport-bar.mjs, keyboard ownership

🔴 A KEY AIMED AT ANOTHER BAR IS THAT BAR'S, AND A BAR IN A CLOSED TAB
HEARS NOTHING. 2026-10-04, for the tabbed pages (`/time/` will carry five
bars, `plans/plan-demo-structure.md` §3.2). This table listens on
`window`, so before this every bar on a page took every key: a space
with the focus on one bar's toggle started all of them, and on a tabbed
page that is decks running and sounding in tabs nobody is looking at.
⚠️ BOTH HALVES ARE NARROW ON PURPOSE. A key from the body still reaches
every bar, which is what the harness sends and what every page before
this was built against. The closed-tab half only applies inside a panel
marked `data-own-keys`, which `tab-page.mjs` sets; `/kit/`, `/stage/`,
`/making/` and `/pack/` hold bars in plain tabs and keep their behaviour,
because `/kit/`'s published bar sits in a closed tab and the harness's
seek would otherwise land on nothing. `bar-drill.mjs` sends its key at
the bar's own element so it moves one bar and no other.

<a id="no-space"></a>

## transport-bar.mjs, space without toggle

⚠️ NOT ON A BAR WITH NO TOGGLE. The space bar is the keyboard's name for
the play button, so on a page that has none it would be a shortcut to a
control nobody can see, and on `/keys/` the space bar is over a piano.

<a id="api"></a>

## transport-bar.mjs, api

── published for CDP; the plan's whole point ───────────────────────────
🔴 THIS OBJECT IS WHAT `window.__demo.transport` HOLDS. THE RETURN VALUE OF
`createTransportBar` IS A DIFFERENT AND LARGER OBJECT, AND THE TWO ARE NOT
INTERCHANGEABLE. The line at the bottom of this file publishes `api`
itself; the thing handed back to the page is `{ el, api, extra, loopExtra,
slot, note, destroy, … }`, which CARRIES `api` as a property rather than
being it.
⚠️ SO A PAGE MUST NEVER ASSIGN THE RETURN VALUE TO `__demo.transport`. It
cost another session real time today: doing that replaces a published
object that has `position` with a wrapper that has none, and
`demo/verify.mjs` dies on `t0.pos.toFixed` while the page itself looks
perfectly well. The bar publishes itself and needs no help; a page with two
bars says which one with `publish: false` on the other, and that option is
the ONLY supported way to decide this.
⚠️ AND THE TWO DRIFT SILENTLY, because nothing type-checks either of them.
`extra(id)` is on the return value and not here, which by the rule written
on `loopExtra` below is a control a CDP check cannot reach on a page with
more than one bar. Left as it is and written down rather than fixed
quietly: adding a member changes what every harness can see, and that is a
change somebody should ask for.

<a id="api-el"></a>

## transport-bar.mjs, api.el

🔴 THE BAR'S OWN ELEMENT, SO A CHECK CAN PRESS THIS BAR RATHER THAN THE
FIRST ONE IN THE DOCUMENT. It was on the RETURN VALUE only, and the note
further down this object states the principle it broke: a control
reachable from one and not the other is a control the harness cannot
press. With one bar per page `document.querySelector` happened to agree;
`/stage/` has two and they are different elements.

<a id="api-live"></a>

## transport-bar.mjs, api.live

🔴 THE `on air` BADGE, OR null ON A BAR THAT IS NOT LIVE. This is the
whole of the page's side of the swap: `bar.api.live.follow({ everyMs })`
once, and `.seen()` whenever sound ACTUALLY ARRIVES: a block decoded, a
segment fetched, an ICY title. Never on a press, never on a timer, never
on `deck.playing()`: all three are the page declaring the thing it was
supposed to measure.
⚠️ IT IS ON THIS OBJECT AS WELL AS ON THE RETURN VALUE, by the rule
written on `loopExtra` below: what `__demo.transport` cannot reach, a CDP
check cannot grade, and the state of this badge is exactly the kind of
claim a check should be reading rather than a class name.

<a id="api-playing"></a>

## transport-bar.mjs, api.playing

⚠️ FORCED FALSE ON A BAR WITH NO TOGGLE rather than derived. Nothing on
such a bar can start the deck, so "is the transport playing" is a
question about this bar with one answer; reporting a deck a page happened
to start elsewhere would be the bar claiming a state it does not own.

<a id="api-loop-blinking"></a>

## transport-bar.mjs, api.loopBlinking

The warning is running.

⚠️ GRADED FROM HERE AND NOT FROM A CLASS OR A COMPUTED STYLE. The blink
is built in JavaScript (see setBlink), so there is no class to look for,
and sampling opacity would be sampling whichever half of the cycle the
check happened to land in — a measurement that is right half the time.

<a id="api-loop-extra"></a>

## transport-bar.mjs, api.loopExtra

A `loopExtras` button by id, so a check can press the real control and
read the real face.

⚠️ IT IS ON THIS OBJECT AS WELL AS ON THE RETURN VALUE, and that is not a
duplicate. This is what `window.__demo.transport` points at, which is the
only handle a CDP check has; the return value is what the PAGE holds. A
control reachable from one and not the other is a control the harness
cannot press, which is how `/archive/radio/`'s ways went ungraded.

<a id="publish"></a>

## transport-bar.mjs, publish

🔴 A PAGE WITH TWO BARS HAS TO SAY WHICH ONE IS ITS TRANSPORT, AND UNTIL
2026-09-18 IT COULD NOT. This line ran unconditionally, so `__demo.transport`
was simply whichever bar was BUILT LAST, which is an ordering fact about
the source rather than a statement about the page. `/stage/` gained a
second bar (a live show in the control room beside a recording in the
archive) and the wrong one won by being further down the file.
⚠️ IT IS THE ONLY HANDLE A CDP CHECK HAS, so getting it wrong does not show
up as a missing feature: the suite presses one bar and asserts about
another, which fails where nothing is wrong and can pass for the wrong
reason just as easily.
⚠️ `publish: false` IS OPT-OUT RATHER THAN OPT-IN, because every page that
predates this has exactly one bar and must keep publishing it without being
edited. A new option that silently switched a check off on forty pages is a
loss this suite has already taken once.

<a id="return-value"></a>

## transport-bar.mjs, return value

⚠️ WHAT THE PAGE HOLDS, AND IT IS NOT WHAT THE HARNESS READS. See the note
over `api` above: `__demo.transport` is `api`, this is a wrapper around it,
and assigning this object there takes `position` away from every check.

<a id="lattice-for"></a>

## transport-bar.mjs, latticeFor

Intersection of every declared caps.rates lattice. null = none declared.

READ THE LIVE REGISTRY, not `deck.adapters`. That property is the object
handed to `createDeck` and it never holds an adapter registered afterwards —
which is every adapter a NEST installs on its parent. So a nest parent's
lattice read as "none declared" and the bar showed its honest static 1x for
a deck that could in fact be played at four rates. `transport.mjs` says as
much beside `deck.adapter()`; the bar was the one client not listening.

`deck.caps()` with no kind returns `{kind: caps}` over everything currently
registered, which is the question actually being asked.
