# Kit lessons: synth-view.mjs, synth-view-test.mjs

The long comments cut from `demo/shell/synth-view.mjs` and `demo/shell/synth-view-test.mjs`, moved here verbatim. Each heading names the file and the block, and the code points at it with `// why: lessons/kit-synth-view.md#<anchor>`.

<a id="header"></a>

## synth-view.mjs, file header

demo/shell/synth-view.mjs
Three pictures of one voice: an envelope, a filter response and a waveform.

🔴 ONE FILE FOR THREE FIGURES, AND THAT IS A DECISION RATHER THAN A PILE.
They share a frame (a bordered box painting its own ground, a canvas of fixed
height, a device pixel ratio, a resize observation and a paint counter), they
share three greys, and they share the one thing that makes them worth having
at all: a REFUSAL state, drawn, for the case where the shape cannot honestly
be derived. Three files would have been three copies of that frame, which is
the hand-rolled control defect arriving inside the kit itself.

🔴 WHAT EACH ONE MAY HONESTLY CLAIM IS NOT THE SAME, AND IT IS DECIDED BY THE
INSTRUMENT RATHER THAN BY TASTE. MEASURED 2026-09-22 out of `circuit-cc.mjs`
and `circuit-patch.mjs`:
  - The FILTER is reachable over control change: type is CC 68 over six
    values, frequency is CC 74 and resonance is CC 71. So a filter figure can
    be driven live and a control that moves it is not a lie.
  - ENVELOPE 1 is reachable, five parameters, CC 73, 75, 70, 72 and 108.
    Envelopes 2 and 3 are in the patch format and NOT on any controller
    number, so a control for those would name something it cannot do.
  - The oscillator WAVE is a number, 0 to 29, and the shapes behind those
    numbers are not published anywhere this project can read.
So: a picture is a picture and a control is the page's business, and nothing
in this file sends anything anywhere.

🔴 THE FILTER CURVE IS A SCHEMATIC AND SAYS SO ON ITS OWN FACE, WHICH IS THE
MOST IMPORTANT LINE IN THIS FILE. Novation publish no response curves for
this instrument and nothing here has measured one. What is drawn is a
textbook two or four pole prototype: the corner is where the cutoff
parameter says, the slope is what the type's name says, and the peak height
follows the resonance. Every one of those is a statement about a model, and a
real analogue ladder is not a cascade of identical biquads, does not keep its
passband flat as the resonance comes up, and does not have a frequency axis
anybody here has calibrated. The word `schematic` is painted into the canvas
rather than written in a caption beside it, so it travels with the picture
into whatever page puts it somewhere.
⚠️ AND NO NUMBER ON IT IS A MEASUREMENT EITHER. There is no Hz on the x axis
and no dB printed on the y, because the only scale this project honestly has
for a cutoff is `0 to 127`, which is a parameter and not a frequency.

🔴 THE WAVEFORM DRAWS FOUR OF THIRTY AND REFUSES THE OTHER TWENTY SIX IN
WORDS. A name is mapped to a shape only when the name IS the shape's name:
`sine`, `triangle`, `sawtooth` and `square`. The Circuit's other twenty six
are nine `saw 9:1 PW` blends and a `pulse width` whose duty nothing here
knows, and sixteen WAVETABLES, which have no single shape to draw by
definition. An invented squiggle under a real instrument's parameter name is
the failure this component exists not to be, so the refusal names the wave
and says why there is no picture. That is strictly more than the slider
reading `17` which is what those pages have today.
⚠️ SIXTEEN, AND THE BRIEF THIS WAS BUILT FROM SAID FOURTEEN. MEASURED
2026-09-22 against `OSC_WAVES`: `FIRST_WAVETABLE` is 14, so 14 is the number
of PLAIN waveforms and `slice(14)` is 16 rows long. The two numbers are the
two halves of one split and the count was written down the wrong way round.
It changes nothing about the conclusion, which is that 26 of the 30 have no
shape this file may honestly draw.

⚠️ THE ENVELOPE'S SHAPE IS EXACT AND ITS TIME AXIS IS NOT. Attack, decay and
release are `0 to 127` on this instrument with no published mapping to
seconds, so stage widths are proportional to the SETTINGS and the picture
carries no unit. A caller who really has milliseconds passes them with a
`unit`, and then the axis means what it says. The default draws
`proportions` on its own face for the same reason the filter draws
`schematic`.

⚠️ NOTHING IN HERE IS A LIVE SENTENCE. Every word any of these draws is
painted into the canvas, which is a fixed box, so none of it can change its
own height while somebody is looking at it. That is `grain-scope`'s caption
lesson, which reflowed between three and four lines sixty times a second and
made a whole page jump.

⚠️ AND NONE OF THEM RUNS A FRAME LOOP. A still picture that asked for an
animation frame would spend a phone's battery redrawing the same pixels with
nothing on screen saying so. They paint when they are set and when they are
resized, and `paints` counts so a check can read the counter rather than ask
a boolean.

STYLING is prepended to <head> so `shell.css` and a page's own <style>
override it on source order, the arrangement `wave-view.mjs` and `xy-pad.mjs`
already use and record.

<a id="by-name"></a>

## synth-view.mjs, BY_NAME

⚠️ EXACT NAMES ONLY, WHICH IS THE WHOLE HONESTY OF IT. `sawtooth` is a
sawtooth and `saw 9:1 PW` is not, however much of the word they share. A
substring test here would draw a plain ramp for nine blends whose ratios are
the only thing that tells them apart, under the instrument's own label for
them, which is exactly the confident wrong picture this component refuses.

<a id="shape-for"></a>

## synth-view.mjs, shapeFor

The shape behind a wave's name, or `null` when the name does not name a
shape this file can derive.

⚠️ `pulse` IS IN `WAVE_SHAPES` AND IS NEVER RETURNED FROM HERE, on purpose. A
pulse is not one shape, it is a family with a duty cycle, and no name carries
one. A caller that HAS a width asks for it by hand.

@param {string} name
@returns {'sine'|'triangle'|'saw'|'square'|null}

<a id="wave-sample"></a>

## synth-view.mjs, waveSample

One sample of a shape, at a phase from 0 to 1, between -1 and 1.

⚠️ THE PHASE AND THE POLARITY ARE DRAWING CONVENTIONS RATHER THAN
MEASUREMENTS. What makes a sawtooth a sawtooth is the linear ramp and the
jump; whether an instrument's ramp rises or falls, and where in the cycle it
starts, is not something this file knows about any particular oscillator. The
SHAPE is the claim.

@param {string} shape
@param {number} phase  0 to 1 over one cycle
@param {object} [o]
@param {number} [o.duty]  for `pulse` only, the share of the cycle that is high

<a id="wave-points"></a>

## synth-view.mjs, wavePoints

`count` samples of a shape over `cycles` cycles, for drawing.

⚠️ TWO CYCLES BY DEFAULT, NOT ONE. One cycle of a square and one cycle of a
pulse at 50 per cent are the same picture, and one cycle of anything leaves
the reader to guess whether what they are looking at repeats. Two says it.

@returns {Float64Array|null} `null` for a shape this file cannot derive

<a id="envelope-path"></a>

## synth-view.mjs, envelopePath

An envelope as six points, x from 0 to 1 across the picture and y from 0 at
the bottom to 1 at the top.

🔴 THE WIDTHS ARE PROPORTIONAL TO THE SETTINGS AND NOT TO TIME, unless a
caller has real times to give. `Envelope1_Attack` is `0 to 127` and the
seconds behind those numbers are not published, so an axis in milliseconds
would be a number this project made up. What IS exact is the shape: a rise to
full, a fall to the sustain level, a hold there, and a fall to nothing.

⚠️ A SUSTAIN IS A LEVEL AND HAS NO LENGTH, so it is given `hold` of the width
to stand in. With every timed stage at zero there is nothing to divide, and
the hold takes the whole width rather than leaving three quarters of the box
empty beside a picture that is correct.

@param {object} o
@param {number} [o.delay]    Env 3 on the Circuit has one, Env 1 and 2 do not
@param {number} [o.attack]
@param {number} [o.decay]
@param {number} [o.sustain]  a LEVEL, 0 to `max`
@param {number} [o.release]
@param {number} [o.max]      the top of every parameter, default 127
@param {number} [o.hold]     the sustain's share of the width
@returns {{points:Array<{x:number,y:number}>, sustain:number, hold:number,
 stages:{delay:number,attack:number,decay:number,hold:number,release:number},
 silent:boolean, end:number}}

<a id="filter-shape-for"></a>

## synth-view.mjs, filterShapeFor

The kind and the pole count behind a filter type's name, or `null` when the
name does not say.

🔴 THERE IS NO TABLE IN HERE AT ALL, AND THAT IS THE POINT. The six names
live once, in `FILTER_TYPES` in `circuit-patch.mjs`; a second list of them
here would agree with that one until somebody edited one of them, which is
this project's most repeated defect in its cheapest form. The names say the
slope out loud (`low pass 24dB`, `band pass 6/6 dB`) and six decibels an
octave is one pole, so this READS the name instead of holding a copy, and a
name it cannot read is refused rather than drawn as a low pass.

@param {string} name
@returns {{kind:'lp'|'hp'|'bp', poles:number}|null}

<a id="filter-curve"></a>

## synth-view.mjs, filterCurve

The filter figure's curve: `points` values from 0 at the bottom of the box to
1 at the top.

🔴 IT IS A SCHEMATIC. Nothing here has measured this or any other
instrument's filter. A four pole answer is one resonant stage times one flat
stage, which is not what a real ladder does either; what it gets right is the
corner position, the slope the type's name claims, and the direction the
resonance moves the peak. That is what a reader can use and it is all that is
being claimed.

@param {object} o
@param {'lp'|'hp'|'bp'} [o.kind]
@param {number} [o.poles]
@param {number} [o.freq]        the cutoff PARAMETER, 0 to `max`
@param {number} [o.resonance]   0 to `max`
@param {number} [o.max]
@param {number} [o.points]
@param {number} [o.octaves]     how wide the picture is, a drawing choice
@returns {{y:Float64Array, db:Float64Array, cornerAt:number, peakAt:number,
 peakDb:number, zeroY:number}}

<a id="one-resonant-stage"></a>

## synth-view.mjs, filterCurve, one resonant stage

⚠️ ONE RESONANT STAGE AND THE REST FLAT. Cascading two identical resonant
biquads squares the peak, which draws a four pole filter as twice as
resonant as a two pole at the same setting, and that is a claim about the
instrument rather than about the model.

<a id="figure"></a>

## synth-view.mjs, figure

The bordered box, the canvas, the device pixel ratio and the resize
observation, once.

🔴 THE BORDER IS ON THE WRAPPER AND NOT ON THE CANVAS, which is arithmetic
rather than taste. `box-sizing: border-box` is global here, so a canvas with
a 1 px border whose CSS width comes from its container renders 2 px of
content narrower than its backing store and stretches the picture. The
wrapper carries the border and `clientWidth` is a CONTENT width, so the two
agree by construction. This is `wave-view.mjs`'s own note, reused rather than
rediscovered.

<a id="custom-property"></a>

## synth-view.mjs, figure, the height custom property

⚠️ A CUSTOM PROPERTY, NEVER THE PROPERTY. Writing `canvas.style.height`
from a component is writing a rule nothing can override, including this
component's own stylesheet, which is the defect `video-panel.mjs` shipped
with its `aspect` option and is recorded in CLAUDE.md.

<a id="greys"></a>

## synth-view.mjs, figure, the palette

🔴 THREE GREYS, ONE HIGHLIGHT AND NO OTHER HUE, WHICH IS THIS PROJECT'S
SETTLED ANSWER REUSED RATHER THAN RE-ARGUED. Colour here says what a mark
IS rather than how it landed, because nothing in these three pictures has
landed well or badly. The field and the grid are the box, the line is the
thing being described, and `--hi` marks the one place a reader is meant to
look, which is the corner of a filter or the sustain level of an envelope.

<a id="ground"></a>

## synth-view.mjs, figure, the field colour token

🔴 A CALLER MAY SIT ON A LIGHTER GROUND, AND IT IS A TOKEN RATHER THAN A
HEX. Asked 2026-09-22 as *"put same bit lighter gray behind eq viz"*.
⚠️ **IT IS SAFE ONLY BECAUSE `field` IS READ BACK OUT OF THE CANVAS.**
`ink()` samples pixel 0,0 AFTER the fill and counts everything that is
not that colour, so changing the ground recalibrates the counter by
itself. Painting a lighter rectangle inside `draw()` instead would have
made every pixel of the plot read as ink, which is the exact defect that
had four envelope asserts green while none of them could see a picture.

<a id="field"></a>

## synth-view.mjs, figure, field read back

The field's own colour, read back OUT OF THE CANVAS rather than parsed out
of the token.

🔴 THE PARSED VERSION SHIPPED AND WAS BLIND, AND IT WAS CAUGHT BY THREE
DIFFERENT PICTURES REPORTING THE SAME NUMBER. `ink()` compared each pixel
against `C.field.match(/\d+/g)`, and `--card` is `#11151d`, so that regex
answers the single number 11151 and the green and blue comparisons were
both against `undefined`. Every painted pixel therefore counted as ink, and
`ink()` was measuring the AREA OF THE BOX. MEASURED on `/kit/` 2026-09-22:
three envelopes with three different shapes in them all read exactly
**10032**, which is 209 by 96 divided by the sampling stride, and the
fourth read 31488 only because it wrapped onto a row of its own and was
wider. Four asserts were green and none of them could see a picture.
⚠️ THE TELL WAS FREE AND WAS ALMOST MISSED: three separate subjects
agreeing to the digit is a broken collector, never a finding.
✅ READING IT BACK NEEDS NO PARSER AT ALL and is exact for any format a
token can hold, hex, `rgb()`, a named colour or a `color-mix`. The canvas
has already been filled with it on the line above, so this is what is
really on screen rather than what the stylesheet was asked for.

<a id="tok"></a>

## synth-view.mjs, figure, tok

A colour, from a token name or from a literal.

⚠️ IT EXISTS FOR THE SECOND TRACE AND FOR NOTHING ELSE. A figure drawing
one line needs no palette, and the three greys plus `--hi` above are this
project's settled answer to everything that is not an identity. Two
signals in one picture ARE an identity, which is the one case colour is
allowed to carry here, and a caller naming `--hi` rather than a hex is a
caller whose picture follows the theme.

<a id="ink"></a>

## synth-view.mjs, figure, ink

How many pixels are not the field colour, so a check can ask whether
anything was drawn rather than trust that it was.
⚠️ IT SAMPLES, because reading every pixel of a wide canvas costs more
than the answer is worth and the answer is the same: a picture has
thousands of marked pixels and an empty box has none.
🔴 AND IT IS ONLY HALF AN ANSWER WITHOUT `area()`. A count with no
denominator cannot tell a drawing from a filled box, which is exactly the
defect this shipped with: see the note on `field` above. A check that
wants to know a picture was drawn should compare the two.

<a id="create-envelope-view"></a>

## synth-view.mjs, createEnvelopeView options

@param {object} o
@param {HTMLElement} [o.host]
@param {string} [o.label]    drawn into the picture, bottom left
@param {number} [o.height]
@param {number} [o.max]
@param {string} [o.unit]     `''` for proportions, or a real unit when the
 caller has real times. With a unit the axis means what it says and the
 `proportions` mark is not drawn.
@param {number} [o.delay] @param {number} [o.attack] @param {number} [o.decay]
@param {number} [o.sustain] @param {number} [o.release]
@returns {{el:HTMLElement, canvas:HTMLCanvasElement, set:Function,
 get:()=>object, path:()=>object, ink:Function, paints:number, destroy:Function}}

<a id="foot-room"></a>

## synth-view.mjs, createEnvelopeView, FOOT_ROOM

🔴 THE FOOT SITS THE SAME DISTANCE OFF THE BOTTOM AS THE PICTURE SITS OFF
    THE SIDES, ASKED FOR 2026-09-22 AS *"more space under eq labels, same as
    left right"*. It was a bare 4 px against `PAD`'s 10, so the two words hung
    on the bottom edge while the curve above them was properly inset, and a
    box whose insets disagree with each other reads as a box that was cut.
    ⚠️ AND THE PLOT FLOOR MOVES WITH IT. The text baseline rising by 6 px
    takes the room the words need with it, so `yBot` gives up the same 6 or
    the curve lands on the label. The two numbers are one measurement and are
    written as one.

<a id="proportions-mark"></a>

## synth-view.mjs, createEnvelopeView, the proportions mark

🔴 THE HONESTY MARK, PAINTED INTO THE PICTURE. Stage widths follow the
settings, which are `0 to 127` with no published mapping to seconds, so
this axis is not time and must not be read as time. It travels with the
canvas into whatever page puts it somewhere, which a caption beside the
box would not.

<a id="redraw"></a>

## synth-view.mjs, createEnvelopeView, redraw

Measure the box again and paint, now, on this line.

🔴 IT EXISTS BECAUSE A RESIZE OBSERVATION IS A FRAME AWAY AND A CHECK IS
NOT. `/kit/` lays every closed tab panel out inside a measuring window
that holds no `await`, so a figure that was last painted at a width of
zero is still at zero when the check reads it, and `ink()` answers 0 on a
picture that is perfectly correct. A reader never meets this, because
opening a tab gives the observer its frame; only a synchronous reader of
the pixels does.
⚠️ AND IT IS NOT THE COMPONENT WORKING AROUND ITS OWN BUG. Nothing here
polls and nothing holds a frame loop. This is the one call that says
`look again right now`.

<a id="create-filter-view"></a>

## synth-view.mjs, createFilterView options

@param {object} o
@param {string} [o.type]  the type's own NAME, read by `filterShapeFor`. A
 name it cannot read is refused in words rather than drawn as a low pass.
@param {number} [o.freq]       the cutoff PARAMETER, 0 to `max`
@param {number} [o.resonance]  0 to `max`
@param {number} [o.max]

<a id="filter-refusal"></a>

## synth-view.mjs, createFilterView, the refusal

🔴 THE REFUSAL IS THE PICTURE. A name this file cannot read is a filter
whose slope and whose direction are both unknown, and drawing the
default low pass under that name would be the exact confident wrong
picture the header refuses.
🔴 AT THE FOOT, NOT FLOATING IN THE MIDDLE. Asked 2026-09-22 as
"align texts to bottom of the eq"* and then *"..betwen texts and
        align to bottom"*, so the pair sits on the bottom edge with room
        between them rather than centred over an empty box.
        ⚠️ THE NAME SITS ABOVE THE REASON, which is the same order every
        other refusal in this file uses, and the gap is 13 px against the
        11 px name so the two read as two lines rather than as a paragraph.

<a id="dotted"></a>

## synth-view.mjs, createFilterView, dotted corner line

🔴 DOTTED, NOT DASHED, ASKED FOR 2026-09-22 AS *"dashed to dotted in
      eq"*. A zero length dash with a round cap is a real dot; `[1, 3]` with
      the default butt cap draws one-pixel dashes, which at this alpha read as
      a broken line rather than as a series of marks. The envelope's sustain
      line keeps its dashes, because nobody asked about it and two marks that
      mean two different things are worth keeping apart.

<a id="schematic"></a>

## synth-view.mjs, createFilterView, the schematic word

🔴 THE WORD THAT MAKES THIS HONEST, AND IT IS IN THE PICTURE RATHER THAN
BESIDE IT. Nothing here has measured this instrument's filter, nobody
publishes its curves, and a response drawn from a textbook prototype that
LOOKS like a measurement is the failure this project keeps paying for.

<a id="filter-redraw"></a>

## synth-view.mjs, createFilterView, redraw

Measure the box again and paint, now, on this line.

🔴 IT EXISTS BECAUSE A RESIZE OBSERVATION IS A FRAME AWAY AND A CHECK IS
NOT. `/kit/` lays every closed tab panel out inside a measuring window
that holds no `await`, so a figure that was last painted at a width of
zero is still at zero when the check reads it, and `ink()` answers 0 on a
picture that is perfectly correct. A reader never meets this, because
opening a tab gives the observer its frame; only a synchronous reader of
the pixels does.
⚠️ AND IT IS NOT THE COMPONENT WORKING AROUND ITS OWN BUG. Nothing here
polls and nothing holds a frame loop. This is the one call that says
`look again right now`.

<a id="trace-of"></a>

## synth-view.mjs, traceOf

The samples a trace draws: what the caller MEASURED if it has any, and what
this file can DERIVE otherwise.

🔴 **`points` OUTRANKS `shape`, AND THAT IS NOT A HOLE IN THE REFUSAL, IT IS
WHAT THE REFUSAL IS ABOUT.** The whole argument of this component is that an
invented squiggle under a real instrument's parameter name is a lie: sixteen
of the Circuit's thirty waves are wavetables with no single shape and nine
are blends whose ratios nobody here has measured, so a name is refused rather
than guessed at. A caller handing over SAMPLES is not guessing. It read the
signal, and a reading is strictly better evidence than a textbook shape,
which is the same reason `wave-view.mjs` draws a min/max envelope of a real
file rather than a picture of what the file ought to look like.
⚠️ **NOTHING HERE TAKES A TAP, A CONTEXT OR A FRAME LOOP.** The page owns the
sound and calls `set({ points })` at its own rate, exactly as `wave-view.mjs`
takes a position rather than making one. This file still has no
`AudioContext`, no `requestAnimationFrame` and no poll of any kind.

<a id="onset-index"></a>

## synth-view.mjs, createWaveShape options and onsetIndex

@param {object} o
@param {string} [o.name]    the wave's own name, read by `shapeFor`
@param {string} [o.shape]   one of `WAVE_SHAPES`, when the caller knows it
 without a name to read. This is how a `pulse` gets drawn, because a duty
 cycle is not in any name.
@param {number} [o.duty]    for `pulse`
@param {string} [o.reason]  what to say when there is no shape. The caller
 knows more than this file does: a wavetable and a blend whose ratio nobody
 has measured are two different absences.
@param {ArrayLike<number>} [o.points]  samples between -1 and 1, when the
 caller MEASURED the signal instead of naming it. See `traceOf`.
@param {string} [o.colour]  a token name or a literal, default `--dim`
@param {object} [o.over]    A SECOND TRACE IN THE SAME PICTURE, described
 exactly as the first: `{ name, shape, points, duty, cycles, colour }`.

 🔴 **ASKED FOR 2026-09-22 AS A SCOPE SHOWING AN OSCILLATOR AND AN EFFECT AT
 ONCE**: *"can you have wave / osilocope visualizer to top of muta. plai and
 warp with different colors"*. Two signals in one picture is the only way to
 see what the second thing did to the first, and drawing them in two boxes
 side by side asks a reader to hold one in their head while looking at the
 other.
 ⚠️ **COLOUR IS ALLOWED HERE AND NOWHERE ELSE IN THIS FILE, AND THE RULE IS
 UNCHANGED.** The three greys and one highlight exist because colour here
 says what a mark IS rather than how it landed. Two traces are two different
 things, so which is which IS what a mark is, and it is the same argument
 that gives a lane its gutter swatch.
 ⚠️ **AND IT IS ONE EXTRA TRACE, NOT A LIST.** Three signals in one box with
 no legend is a picture nobody can read, and the moment a caller wants four
 it wants a strip with rows and labels, which this project already has.
🔴 A TRIGGERED SCOPE: ONE HIT, CAPTURED FROM ITS ONSET, HELD STILL UNTIL THE
NEXT. Asked 2026-10-12 on `/drums/knobs/`: *"scopes are very
"nervous". what to do on 010"*, then *"is ti a scope feature/prop?"*. A
free running scope redraws whatever the last 40 ms held, so a drum reads as
a flicker: a hit, then its tail, then silence, sixty times a second. A drum
machine knows when each hit SOUNDS, so the scope can wait for it, take a
fixed window from its onset and keep that picture until the next hit.

These two are the arithmetic, with no browser, and `synth-view-test.mjs`
grades them (with sabotages). `createWaveShape({ mode: 'triggered' })` below
is the drawing half.

Where the onset is inside an analyser's buffer. The buffer's last sample is
`end` (seconds, the context's clock) and the onset is `onset` (same clock),
so the onset sits `(end - onset) * rate` samples back from the end. Then
the first sample within `look` seconds after that whose magnitude reaches
`gate` of the window's peak is taken as the real onset, which absorbs a
render quantum or two of clock slop, so every trace of one drum starts on
the same edge and the picture does not jitter from hit to hit.
@returns {number} an index into `buf`, or -1 when the window does not fit

<a id="triggered-mode"></a>

## synth-view.mjs, createWaveShape, triggered mode

TRIGGERED MODE: `trigger(atMs)` takes the window from that hit's onset off
    `source` (an AnalyserNode, its fftSize long enough for the window) and
    holds it; `fade` earlier traces stay faint underneath (the phosphor
    below). FREE, the default, is every caller before 2026-10-12, unchanged.

<a id="wave-ground"></a>

## synth-view.mjs, createWaveShape, ground

🔴 THE SAME GROUND AS THE FILTER, ASKED FOR 2026-09-22 AS *"add same bg to
    waveform as to filter"*. Safe for the same reason it was safe there: `ink()`
    reads the field back OUT OF THE CANVAS after the fill, so the counter
    recalibrates itself and the refusal asserts that count ink keep working.
    ⚠️ THE ENVELOPE IS STILL `--card` AND THAT IS WHAT WAS ASKED, not an
    oversight. Two of the three figures sit on the lighter ground.

<a id="zero-line"></a>

## synth-view.mjs, createWaveShape, zero line

🔴 THE ZERO LINE IS DRAWN ONLY WHEN THERE IS A WAVE ON IT. Reported
      2026-09-22 with a screenshot of `saw 7:3 PW` and the word *"rm line"*: a
      refused wave was getting a rule straight through its own two lines of
      text, and an axis under no curve is furniture that reads as a picture
      which failed to load. It is the same rule as an empty table drawing no
      heading.

<a id="wave-refusal"></a>

## synth-view.mjs, createWaveShape, the refusal and reason: null

🔴 THE REFUSAL, AND IT IS THE REASON THIS COMPONENT IS WORTH HAVING.
        Sixteen of the Circuit's thirty oscillator waves are WAVETABLES, which
        have no single shape by definition, and nine more are blends whose
        ratios nothing here has measured. Drawing a plausible squiggle under
        one of those names would be an invention wearing an instrument's label.
        🔴 IT SITS AT THE BOTTOM SINCE 2026-09-22, ASKED FOR AS *"alitng title
        and desc to bottm (leave nice padding)"* after a screenshot of the two
        lines floating in the middle of an otherwise empty card.
        🔴 AND `not drawn` WENT WITH IT, ASKED AS *"no \"not drawn\""*. The card
        was carrying the refusal twice: the reason says why nothing is drawn and
        `not drawn` said that nothing is drawn, which the empty picture has
        already said. Two channels for one fact, and the one removed is the one
        with no information in it. ⚠️ THE `aria-label` STILL SAYS IT, because a
        reader with no picture has no empty canvas to infer from, and the assert
        on `/kit/` reads it there.
        ⚠️ **THE PADDING IS `PAD`, WHICH IS THE CARD'S ONE CONSTANT.** The
        drawn case's own name line sits on `foot`, and the two here sit on the
        same baseline and one line above it, so nothing in this file carries a
        second number meaning the gap at the bottom.
🔴 `reason: null` DRAWS NOTHING AT ALL, added 2026-09-22. It is
DISTINCT from `''` and from no reason, which both fall back to
`NO_SHAPE`, and the distinction is the point: this file refuses to
invent a shape and says so, which is right for a wavetable nobody has
measured and wrong for a scope whose instrument is simply switched off.
⚠️ **THE ABSENCE STILL HAS TO BE EXPLAINED SOMEWHERE**, and a caller
passing `null` is claiming it is explained elsewhere. On `/muta/` the
instrument's own lamp reads `PLAITS off` an inch below, so a second
sentence saying nothing is sounding would be the doubled channel this
project keeps removing.
⚠️ AND THE ROOM IS STILL RESERVED. The figure keeps its height whether
it draws words, a trace or nothing, so a picture arriving cannot move
the page under a reader.

<a id="idle-labels"></a>

## synth-view.mjs, createWaveShape, idle labels

the scale's labels stand with no trace too, when a caller gives them,
so an idle scope says what it will measure (2026-10-06, *"show labels
when no signal on waveform?"*); a caller with no `axes` draws none.
With `reason: null` and axes the name stands alone on the foot, no
sentence under it (*"rm 'no signal'"*, the same day)
🔴 IN THE SAME TYPE AS THE DRAWN NAME BELOW, since 2026-10-12. It was
11 px in ink here and 9 px faint once a trace arrived, so a scope's
name changed size every time its signal came and went, reported on
/drums/knobs/ as *"scope labels keep chaning size"*.

<a id="phosphor"></a>

## synth-view.mjs, createWaveShape, the trail

🔴 THE TRACES BEHIND THIS ONE, FADING, WHICH IS A PHOSPHOR AND NOT AN
ANIMATION. Asked 2026-09-22: *"can you do a bit of analog effect so
previous wave is still bit shown fading out when news is coming, vacuum
tube ... make it subtle"*.
⚠️ **IT IS DRAWN, NOT ANIMATED, WHICH IS WHY THIS FILE STILL HAS NO FRAME
LOOP.** The old windows are kept and painted on the next `set`, so the
decay happens at whatever rate the caller feeds it and this component
still never asks for a frame. A `requestAnimationFrame` here would be the
poll the whole file is written to avoid.
⚠️ AND THE OLDEST IS THE FAINTEST, CUBED, so the fall is quick and the
tail is short. It was squared at 0.45 and reported as *"fade faster"*: at
47 windows a second a long tail is six visible lines rather than a glow.
🔴 **AND IT IS FAINT BECAUSE THERE ARE TWO PHOSPHORS, NOT ONE.** Reported
2026-09-22: *"screenshot gives nice fading but at 120hz all waves are
extra yellow. photogreaph is somehing in beween. what gives"*, and the
three readings are all correct and are three different measurements. **A
screenshot is ONE frame** and shows what is drawn. **An eye at 120 Hz
integrates several**, so it adds the drawn decay to its own persistence.
A photograph sits between them because a shutter is open for some time
but not for long.
🔴 **AND THE COMPOUNDING ONLY STARTED WHEN THE TIME BASE WAS LOCKED.**
While the window still wandered the ghosts sat at different phases and
read as a smear; aligned, they stack exactly on the live trace, so what
they add is BRIGHTNESS rather than motion. MEASURED as a composite over
the ground: four ghosts peaking at 0.30 put **0.226** of extra ink under
a stationary line, which is the extra yellow. Three at 0.16 put
**0.089**.
⚠️ THE TRAIL IS STILL WORTH HAVING, and what it is worth is the moving
case: turn a knob and you see where the wave was. A stationary trace
should look like one line, and now does.

<a id="names-and-axes"></a>

## synth-view.mjs, createWaveShape, names and axes

🔴 THE NAME IS ON THE LEFT SINCE 2026-09-22, ASKED FOR AS *"align
      waveform names to left"*. A column of figures with their names on the
      right had every name at a different x, because the boxes are not all the
      same width, so the one thing a reader scans down was the one thing that
      did not line up. When a caller passes a `label` as well, the label keeps
      the left and the name follows it.
      ⚠️ AND WITH TWO TRACES EACH NAME IS WRITTEN IN ITS OWN TRACE'S INK, which
      is the legend. A separate key beside the picture would be the thing this
      project keeps taking off pages: a figure and its ink joined across two
      elements is what makes a legend necessary in the first place.
🔴 THE TWO SCALES, WHERE A SCOPE PUTS THEM. `axes: { x, y }`, added
2026-09-22 on *"perhaps x y units?"*. Without them a trace is a shape
with no size: the same picture is a 20 ms window or a 2 second one, and a
reader has no way to tell which.
⚠️ **THEY ARE THE CALLER'S STRINGS AND THIS FILE INVENTS NEITHER.** What
a window spans is a fact about the thing that captured it, and a
component that guessed at it would be drawing a number nobody measured,
which is the whole argument this file already makes about waveshapes.
⚠️ AND `y` SITS AT THE TOP because it labels the vertical extent, while
`x` sits under the trace's right edge because it labels the span. Neither
takes room from the picture: both are on lines the figure already has.

<a id="announce"></a>

## synth-view.mjs, createWaveShape, the announcement

🔴 `not drawn` STAYS IN THE ANNOUNCEMENT AFTER COMING OFF THE PICTURE.
      A reader who cannot see the canvas has no empty box to infer an absence
      from, so these words are the only channel they have, and `/kit/` asserts
      them here. The drawn string and the announced string are two different
      channels and only the drawn one was objected to.

<a id="keep-old"></a>

## synth-view.mjs, createWaveShape, set keeps the old window

⚠️ THE OLD WINDOW IS KEPT BEFORE THE NEW ONE REPLACES IT, and only when
        there is a real one to keep: a caller clearing the picture should not
        leave a ghost of the last signal hanging over an instrument that has
        been switched off.

<a id="wave-redraw"></a>

## synth-view.mjs, createWaveShape, redraw

Measure the box again and paint, now, on this line.

🔴 IT EXISTS BECAUSE A RESIZE OBSERVATION IS A FRAME AWAY AND A CHECK IS
NOT. `/kit/` lays every closed tab panel out inside a measuring window
that holds no `await`, so a figure that was last painted at a width of
zero is still at zero when the check reads it, and `ink()` answers 0 on a
picture that is perfectly correct. A reader never meets this, because
opening a tab gives the observer its frame; only a synchronous reader of
the pixels does.
⚠️ AND IT IS NOT THE COMPONENT WORKING AROUND ITS OWN BUG. Nothing here
polls and nothing holds a frame loop. This is the one call that says
`look again right now`.

<a id="test-header"></a>

## synth-view-test.mjs, file header

demo/shell/synth-view-test.mjs
The arithmetic behind the three synth figures, with no browser.

  node demo/shell/synth-view-test.mjs

🔴 THE CLAIM THIS FILE EXISTS FOR IS THAT EACH FIGURE DRAWS WHAT ITS INPUTS
SAY AND REFUSES WHAT THEY DO NOT. A picture is the easiest thing in the world
to write green: any curve that goes down looks like a low pass, any line with
a peak in it looks like an envelope, and a sine looks like a sine whatever
produced it. So the checks below are COMPARISONS rather than shapes: a low
pass and a high pass have to disagree at both ends, four poles have to fall
faster than two, raising the resonance has to lift the corner and nothing
else, and a wave name that is not a shape's name has to come back empty.

⚠️ WHAT IS NOT GRADED HERE, SAID PLAINLY BECAUSE A GREEN SUITE CAN MEAN ZERO
COVERAGE. Nothing below opens a canvas. None of the three constructors is
called. Every claim about PIXELS or about what is PAINTED is on `/kit/`:
  - that the word `schematic` really reaches the filter's canvas, and
    `proportions, not seconds` the envelope's
  - that a refused wave draws its name and its reason and no curve
  - that the ResizeObserver rebuilds at a new width
  - that the three figures paint once each and never ask for a frame
  - that `--sv-h` is a custom property a page can still override

🔴 AND THE HONESTY OF THE FILTER IS NOT A NUMBER, SO IT IS CHECKED AS TEXT.
The one thing that makes a drawn response curve acceptable in this project is
that it says out loud it is not a measurement, and the only cheap way to
grade a promise like that is to read the source for it. The page grades the
pixels.

<a id="test-substring"></a>

## synth-view-test.mjs, a name that contains a shape word

🔴 THE ONE THAT KEEPS THIS COMPONENT HONEST. `saw 9:1 PW` shares three
  letters with `sawtooth` and is not a sawtooth, and a substring test would
  draw a plain ramp for nine different blends under the instrument's own labels
  for them. Nine plausible wrong pictures from one careless comparison.

<a id="test-real-count"></a>

## synth-view-test.mjs, the real count

🔴 THE REAL COUNT, AGAINST THE REAL TABLE, so the number in the component's
  header and the number a page prints cannot drift apart. It is asserted as an
  exact figure rather than as *some*, so the day somebody works out what a
  blend looks like this goes red and a reader is told why.

<a id="test-sixteen"></a>

## synth-view-test.mjs, sixteen wavetables

🔴 SIXTEEN, AND THE BRIEF THIS WAS BUILT FROM SAID FOURTEEN. `FIRST_WAVETABLE`
    is 14, which is the count of PLAIN waveforms, and `slice(14)` is 16 rows
    long. Two halves of one split, written down the wrong way round, and the
    check is here in the form that would have caught it. The conclusion is
    unchanged: 26 of the 30 have no shape this file may honestly draw.

<a id="test-two-cycles"></a>

## synth-view-test.mjs, two cycles

🔴 TWO CYCLES, NOT ONE, AND IT IS GRADED BECAUSE ONE CYCLE OF A SQUARE AND
    ONE CYCLE OF A HALF DUTY PULSE ARE THE SAME PICTURE. The reader has to be
    able to see that the thing repeats.

<a id="test-samples"></a>

## synth-view-test.mjs, samples outrank a derived shape

🔴 SAMPLES OUTRANK A DERIVED SHAPE, AND THAT IS NOT A HOLE IN THE REFUSAL.
The refusal is about GUESSING: a wavetable has no single shape and a blend's
ratio is not published, so a name is refused rather than invented. A caller
handing over samples read the signal, and a reading beats a textbook shape.

<a id="test-no-samples"></a>

## synth-view-test.mjs, neither samples nor a name

🔴 THE NEGATIVE CONTROL: neither samples nor a derivable name is still a
    refusal. Without this, the two asserts above would pass on a version that
    drew a straight line for everything it did not understand.

<a id="test-stages"></a>

## synth-view-test.mjs, each envelope stage moved alone

🔴 THE COMPARISON THAT KILLS A DRAWER IGNORING ONE OF ITS INPUTS. Four
    stages read from one object is four chances to read the same field twice,
    and a picture drawn that way looks completely ordinary. Each one is moved
    alone and only its own stage may change.

<a id="test-all-zero"></a>

## synth-view-test.mjs, every stage at zero

🔴 EVERY STAGE AT ZERO IS A REAL SETTING AND IT STILL FILLS THE BOX.
    Dividing the width in proportion to four zeros is a divide by zero wearing
    a picture, and leaving three quarters of the box empty beside a correct
    drawing reads as a component that failed rather than as an envelope with no
    times in it.

<a id="test-type-read"></a>

## synth-view-test.mjs, low pass against high pass

🔴 THE CHECK A DRAWER THAT IGNORED THE TYPE COULD NOT PASS. Both of the two
    lines above are satisfied by any curve that slopes, as long as it slopes;
    this one needs the two to disagree at BOTH ends, which only happens if the
    kind is really being read.

<a id="test-scope"></a>

## synth-view-test.mjs, the triggered scope's arithmetic

── the triggered scope's arithmetic (2026-10-12, /drums/knobs/) ──
A buffer of 1000 samples at 1000 Hz ending at t = 10 s, with a hit (a burst
of 1s) starting at sample 700, so at t = 9.7 s. NEGATIVE CONTROLS: a clock
that is 3 ms off still lands on sample 700 (the gate finds the edge), an
onset whose window would run past the end is refused (-1), and the capture
keeps a one sample spike that a plain decimation would step over.

<a id="test-code-only"></a>

## synth-view-test.mjs, `code`, the file without comments

The same file with every comment taken out.

🔴 **AN ABSENCE ASSERTED OVER THE WHOLE FILE GRADES THE PROSE, AND THIS
FILE WAS THE THIRD TO BE CAUGHT BY IT IN ONE DAY**, after
`instrument-test.mjs`, where two asserts had been green for a day matching
comment text, and `knob-test.mjs`, where one went red on its first run for
finding the sentence that FORBIDS the thing it was looking for. Here both
`nothing here asks for an animation frame` and `nothing in here sends
anything anywhere` went red the moment a comment explained that the second
trace takes its samples from a caller and runs no frame loop and opens no
`AudioContext`. The claims were true and the instrument was reading the
wrong text.
⚠️ **A PRESENCE MAY BE ASSERTED OVER EITHER AND AN ABSENCE OVER `code`
ONLY.** The two checks below that read `src` on purpose are about what the
file SAYS, which is the one thing the comments are.

<a id="test-schematic"></a>

## synth-view-test.mjs, the schematic promise

🔴 THE PROMISE THAT MAKES A DRAWN RESPONSE CURVE ACCEPTABLE AT ALL, and the
    only cheap way to grade a promise is to read it. The pixels are graded on
    `/kit/`; this catches the edit that deletes the word.

<a id="test-not-drawn"></a>

## synth-view-test.mjs, the refusal announced, not painted

🔴 `not drawn` CAME OFF THE PICTURE 2026-09-22, ASKED AS *"no \"not
    drawn\""*, AND STAYED IN THE ANNOUNCEMENT. The card was carrying the
    refusal twice: the reason says why nothing is drawn and `not drawn` said
    that nothing is drawn, which the empty picture has already said. A reader
    with no picture has no empty canvas to infer from, so the words are the
    only channel they have, and `/kit/` reads them off the aria-label.

<a id="test-one-pad"></a>

## synth-view-test.mjs, one bottom gap

⚠️ ONE CONSTANT MEANING THE GAP AT THE BOTTOM, NOT TWO. `shell.css` has
    paid for this twice, as `--sld-col` and as `--ctl-gap`. Both the refusal's
    lines and the drawn case's name line are laid against `PAD` and `foot`.

<a id="spectrogram"></a>

## synth-view.mjs, createWaveShape, wave or spectrum

Asked 2026-11-10 on /remote/circuit/: *"replace waves with a component what shows either wave or
spectrometer (see latest radio work), toggleable on click, little label on right"*. The spectrum is
the radio's spectre from v2in `web/wave.mjs` (the /live page's level card), ported as it is: a
1024-point Hann FFT of the analyser's time-domain samples, one column scrolled in from the right per
`set()`, rows log-spaced 60 Hz to 12 kHz, ink is the trace's colour with alpha over the 60 dB under
the loudest bin of the last few seconds (up at once, down over 3 s, never above -20 dBFS). It arms
only on a free-running scope that has an analyser (`listen()`), so a static shape picture and a
triggered scope never grow a toggle. The view is kept per page in localStorage under
`pos-scope-view:<path>`; the default is the wave.
