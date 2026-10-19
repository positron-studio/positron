---
name: positron-compose
description: "How anything on a page is laid out so that it looks right without a number being nudged: air, alignment, size, grouping, glued surfaces, corners, the phone, and the CSS that carries each of them without cascade side effects. Load BEFORE deciding where anything goes, before writing any padding, margin, gap, width, border or radius, and before saying a layout is done."
metadata:
  internal: true
---

# Layout is a system, not arithmetic

🔴 **THIS SKILL EXISTS BECAUSE THE SAME FOUR CORRECTIONS WERE GIVEN FOR WEEKS,
AND ON 2026-09-26 THE OWNER SAID WHY IN ONE SENTENCE:** *"the numbers mean
nothing. it just has to look right. pushing everything to pixel level maybe is
not the approach at all."* The corrections were about alignment, about a
component's inner padding, about corners, and about the concept this project
calls gluing. **A survey of this repository's own record found 118 distinct UI
corrections carrying about 175 correction events**, every one quoted, and every
one of them is a case of a number being typed where a relationship should have
been named. `research/ui-corrections-taxonomy-2026-09-26.md` is that survey in
full; the three research strands behind the rest of this file are beside it.

🔴 **THE ONE TEST, WHICH GOVERNS EVERYTHING BELOW.** Of 47 typed pixel numbers
in `shell.css`, 20 could have been removed by a layout primitive and 15 were
correctly kept. **Every number that survived is a fact about a body or about an
object: a finger target, a glyph, a key's real proportions. Every number a
primitive removed was a number describing a relationship between two elements.**
So: **if the number says how two things relate, it is a bug waiting, and a
container, a token or a `calc` should carry it. If the number says how big a
thing is for a person, type it, measure it, and assert it against ink.**

⚠️ **AND THE REPORT NAMES WHERE THE COST WAS.** By repeat depth, the family is
*air and insets*: `/tom/` four rounds, `/muta/` three, the feedback panel three,
the piano roll four, `/fau/` two after three insets were zeroed, the nameplate
on three different pages. By distinct recurrence, it is *a number typed twice*,
which `shell.css` itself calls *"this project's most repeated defect in its
cheapest form"*. **Alignment is where both get reported.** Nobody ever reported
*"the padding is on the wrong element"*; they reported *"these do not line up"*,
*"there is a double border"*, *"its a mess"*.

## P. A page is a patch, and the layout is the patch's parts in a column

Checked against the files on 2026-10-14. The front page is THE HERO, LARGE
(`demo/shell/hero.mjs`, `.pos-hero*` in `shell.css`) over the concept cards of
`demo/shell/concept-list.mjs`, and every concept page is `/<group>/<slug>/`.
Each of those pages is a small patch: nodes with ports, links between them, a
medium on every wire. So the first composition question on any page is not
"what padding" but "which part of the patch is this block".

- 🔴 **THE COLUMN IS THE PATCH, IN ONE ORDER.** On a synth or shader concept page
  the blocks stack as picture, knob row, code box, keys, and the patchbay at the
  foot (`positron-concepts`, *"when there are code and knobs on concepts, move
  knobs on top of code"*, 2026-10-12). Every part is full width where it sits;
  only the knobs leave the line, in one boxed row that scrolls sideways and never
  wraps (*"linear execpt knobs that are are independet in the knobs area, horiz
  scrollable. no half col scope, scope is always full w"*, 2026-10-10). A
  readout, where a page has one, goes on top (`joined: false`). The air between
  these blocks is §1's rule: the parent's, never a block's own margin.
- 🔴 **THE PATCHBAY BLOCK IS ONE KIT PART AND A PAGE DOES NOT LAY IT OUT.**
  `createPatchbay` (`demo/shell/patchbay.mjs`) draws the `patchbay` heading as the
  kit's `.pos-sec-h` with its `See details` link button beside it on one baseline
  row (`.pb-head`), then the picture `createBayView` draws, then the links and
  ports tables behind the button (`.pb-more`, 24 px gap). 50 page files call it
  (`grep -ln createPatchbay demo/*/*/index.html`, 2026-10-14). A page that wants
  the block to look different changes `patchbay.mjs`, by §9.
- 🔴 **THE BAY PICTURE HAS ITS OWN GEOMETRY, AND IT IS ONE SET OF NUMBERS.**
  `BAY_GEOMETRY` in `demo/shell/bay-view.mjs` (FONT 11, TITLE 13, ROW 20, PAD 10,
  GAP 48, MIN_GAP 28, STACK_BELOW 480 and the rest) is read by `bay-svg.mjs` too,
  which draws the same picture as an SVG string for the share cards. That is §1's
  "one number, one place" applied to a drawing: do not type a box width or a wire
  gap anywhere else. Box widths are per COLUMN, from the longest title or port
  name in it. Wires are coloured by the out port's medium from `MEDIUM_COLOURS`
  (`patchbay.mjs`), out on the right or bottom edge, in on the left or top, no
  arrowheads.
- 🔴 **ON A DESK THE CHAIN STAYS A ROW AND SCROLLS. ONLY A PHONE STACKS.** A host
  of 480 px or more (`STACK_BELOW`) keeps boxes left to right. When the row does
  not fit, the grey note beside each title folds under it first, and then the
  row scrolls inside its own box (`overflowX = 'auto'`). Below 480 the boxes
  stack top to bottom with inlets on the top edge and outlets on the bottom.
  The owner, 2026-10-10, minutes after the view was switched to stack at every
  width: *"do not do vert layouts on desktop. overflow"*. So a cut off box on a
  desk is fixed inside the row (narrower boxes, a scroll affordance per §4's
  closure rule), never by stacking.
- ⚠️ **THE HERO'S BAY IS A DIFFERENT PATCH ON A PHONE, NOT THE DESK PATCH
  SQUEEZED.** `hero.mjs` holds `DESK` (three columns) and a separate phone patch
  (two columns), asked as *"Make mibile and dsrsktip patchbays different"*. When a
  picture does not fit a phone, a smaller honest patch beats a scaled one.
- ⚠️ `bay-svg.mjs` has no stacked layout and throws below `STACK_BELOW`; HANDOFF
  2026-10-14 records it sat 3 px off the live view. It is not a phone renderer.

## 0. Before touching anything: look, then read the report for its verb

🔴 **LOOK AT IT ON AN IPHONE MINI BEFORE SAYING IT IS DONE. THEN AT 1280.**
`node demo/shot.mjs <slug> 375 1280` exists since 2026-09-26 and prints
sideways overflow with every shot. For a concept page the slug is the path,
`node demo/shot.mjs synth/keyboard 375 1280`, as CLAUDE.md does with
`kit/devices`; with no widths it takes 375, 768 and 1280 (its header,
2026-10-14). **The phone is 375 by 812 at 3x**, instructed
the same day as *"use iphone mini size for mob testing"*: the narrowest current
iPhone, so what fits it fits every iPhone. The measurements below that say 390
were taken before that instruction, at the 12 through 16's width, and are kept
as what they measured. It exists because this project could not see
its own phone layouts and had written that down in three places as a fact about
the harness rather than as a thing to fix. The first six phone shots ever taken
of this site found five kinds of defect that had been there for weeks, all
invisible at 756 px, which is the only width the harness had ever run at.
⚠️ **AND RESIZING THE BROWSER WINDOW IS NOT LOOKING.** MEASURED: the extension
reported `Successfully resized window to 400x860` and the page rendered at
**1429 px**. Only `Emulation.setDeviceMetricsOverride` sets the viewport a page
lays out in, and only `mobile: true` makes it honour `<meta name=viewport>`.

🔴 **A CROP IS EVIDENCE OF WHAT IS ON SCREEN, NEVER OF WHAT CAUSED IT.** Three
readings of one `/fau/` crop produced three different culprits, and one of them
deleted a real affordance on a guess. **Print the rect pair of the element and
its parent, and the ink inside each.** The field wrapper's bottom was **557.5**
and the textarea's was **556.0**, and that one line ended a five-report
argument. It is one loop and it costs one throwaway assert.

🔴 **READ THE REPORT FOR ITS VERB AND ITS DIRECTION.** *"no top padding on
titles"* meant the title HAD none and needed some, and it was read backwards for
**four rounds**, each one removing more, until it arrived as `STILL NO TITLE
PADDING` in capitals. *"no continous vertical bars on pianoroll!"* meant *they
are still not continuous* and was read as *remove them*, so they were deleted.
**If a repeat arrives in plainer words, the previous reading was wrong, not
insufficient. And the reading that DESTROYS work is the one to check first.**

⚠️ **THE CAUSE IS USUALLY ONE LAYER UNDER WHAT WAS REPORTED.** *"less h padding
on strip"*: the padding was already equal at 14 both ways and the HEADING was
146 px, leaving 50.2 px of air each side of the knob. Changing the padding would
have moved 4 px of a 50 px gap and been reported again. *"bottom pading same as
top"*: the padding was already 14/14 on all 39 boxes; the last child carried its
own `margin-bottom: 14px`. **Measure before changing anything, because there
are four reasons a gap can be wrong and they have four different fixes.**

## 1. Air belongs to the relationship, never to the element

🔴 **MARGIN IS A PROPERTY OF THE RELATIONSHIP BETWEEN TWO NEIGHBOURS, NOT OF
EITHER OF THEM.** Heydon Pickering, 2014: *"Simply giving an element a top
margin makes no sense... It's like applying glue to one side of an object before
you've determined whether you actually want to stick it to something."* Two
independent lineages arrive here: the plain-CSS one (Every Layout's Stack, CUBE's
`.flow`) and the component-API one (Braid's `<Stack>`, Tailwind's `space-y`,
Stoiber's *"Margin considered harmful"*). **A component does not own its outer
margin. Either the parent injects it or it does not exist.** `demo/shell/
stack.mjs` is this project's Stack and its header records the three ways a
page fell out of the rhythm when margins lived on children: a wrapper, an
insert onto `document.body`, and a component's own shorthand beating the rhythm
on source order and computing to **0.0 px** between a transport bar and the
keys.

🔴 **A CONTAINER THAT PAINTS A GROUND MAY NOT ALSO CARRY THE AIR.** Asked for
*"padding on top"*, the padding went on a wrapper that had a background, and the
page drew the case, a seam, **a second band of the same dark**, then the well.
Reported as *"its a mess"*. **Padding inside a box with a background is a
STRIPE, not air.** Put it on the thing the reader is looking at.

🔴 **A CHILD NEVER ESCAPES A PARENT'S INSET. IT CHANGES PARENT.** *"edge to
edge"* was answered by zeroing three insets and asked again the next day because
there were **four**: `.panel-case`'s own `padding: 0 var(--panel-pad)`, which
no page rule touched. *"When you are writing a third override to escape a
parent, you are in the wrong container."* The fix was a different slot, `parts:
[el]`, a sibling of the case. **And it is impossible, not merely hard, from
inside a scroller**: `scrollLeft` clamps at 0, so inline-start overflow inside
`overflow-x: auto` is clipped for good. `/knobs/` measured a seam at **992 px
against a 686 px case** trying. (`/knobs/` is a 404 since 2026-10-13, archived
with Yoshimi to `archive/demos/knobs-index.html`; the measurement stands.)
✅ **WHEN A COMPONENT GENUINELY MUST REACH ITS OWN BOX'S EDGE**, the escape is
owned by the component and derived from the token it is escaping:
`margin-inline: calc(-1 * var(--panel-pad))`. Never a typed `-20px`, which is
the next paragraph's defect wearing a minus sign.

🔴 **ONE NUMBER, ONE PLACE, AND THE AGREEMENT IS ASSERTED.** `--sld-col` was a
`12` in `shell.css` and a `0` in a page, **reported three times**, and the third
report was a different bug wearing the first one's clothes. `--pad-btn`,
`--pad-seg` and `--pad-bar` replaced **six typed figures of which one followed
the rule**. `--ctl-w` replaced knob 62, pad 40 and fader 34, each with its own
row gap, so *"four rows of the same eight channels drew four different column
pitches"*. **A measurement two elements must agree about is one declaration at
`:root`, read by both.** Prefer `calc` off an existing token to a new number.
When two names for one number are unavoidable, write the assert that requires
them equal, which `/kit/` does for `--rows-pad` against `.panel-case` (since the kit
split into parts on 2026-10-06 that assert is on `/kit/devices/`,
`demo/kit/devices/index.html`, checked 2026-10-14).
⚠️ **DECLARE IT WHERE IT CAN BE READ.** A custom property inherits DOWNWARD,
never sideways and never from a class nothing above you wears: `--fdr-foot` on
`.pos-fdr` was invisible to the column beside it; `--panel-pad` on `.panel-head`
resolved to nothing the moment the header became a SIBLING of the case (*"where
is padding. good god.."*); `--rows-gap`'s first draft read `var(--panel-gap)`,
declared on `.panel`, and **an unresolved `var()` makes the WHOLE `padding`
shorthand invalid** rather than dropping one side, so every row measured 0 px on
all four edges.

🔴 **ONE BASE, ONE RATIO, NAMED STEPS, AND NOTHING TYPED THAT IS NOT ON THE
LIST.** Every Layout: *"it is in the strict adherence to whichever ratio you
choose that harmony is created."* Which ratio does not matter; having one does.
⚠️ **BUT NOT ONE OF ELEVEN SURVEYED DESIGN SYSTEMS SHIPS A RAW RATIO FOR
SPACING.** Carbon, Tailwind, Radix, Primer, Atlassian, Polaris, Spectrum,
Material and the rest all use small linear steps at the bottom (2, 4, 8, 12, 16)
widening into roughly geometric growth at the top (24, 32, 48, 64, 96), always
landing on a multiple of 4 or 8. Strict ratios are for typography. Refactoring
UI's floor: **no two adjacent steps closer than about 25 per cent**, because
*"12px vs 16px is a big difference, but 500px vs 520px won't."* Nathan Curtis's
test for how many steps: **once two adjacent steps are close enough that nobody
can say when to use one over the other, the scale has stopped making decisions
and started causing arguments.**
⚠️ **THIS PROJECT HAS 48 TOKENS AT `:root` AND NO SPACING SCALE AMONG THEM.**
(52 custom properties in the first `:root` block on 2026-10-14, counted with
awk; still no spacing scale.)
`--pos-gap: 40px`, `--ctl-gap: 8px`, `--panel-gap: 16px`, `--panel-pad: 20px`,
`--rows-pad: 20px`, `--rows-gap: 16px`, `--kbd-pad: 9px` are seven names for
five numbers with no stated relationship between them. That is the next thing.

🔴 **`gap` FOR UNIFORM GUTTERS IN A NESTABLE CONTAINER. THE OWL FOR VERTICAL
FLOW THAT NEEDS EXCEPTIONS.** Every Layout's second edition moved Cluster,
Sidebar, Switcher and Grid onto `gap` because *"margins are applied to child
elements and child elements become parent elements when nesting... there are no
longer competing values for the same elements."* **The Stack did not move**, and
the reasons are exact: a per-child exception (`.stack-exception + *` gets more
space above it) needs the value to live on a child where the cascade can reach
it; an auto margin pushing one child to the far edge needs a margin; and
recursive spacing at any depth needs `* + *` with no child combinator. `gap`
does none of those. So the rule is not *owl beats gap*. **It is: uniform and
nestable, `gap`; individual and arguable, owl.**
⚠️ **OVERRIDE SPACE WITH A CUSTOM PROPERTY ON THE CHILD, NEVER WITH A MORE
SPECIFIC SELECTOR.** `.stack > * + * { margin-block-start: var(--space, 1.5rem) }`
and then `.stack-exception { --space: 3rem }`: same rule wins, different value.
A variable override is not a specificity battle.

🔴 **THE GAP WITHIN A GROUP IS VISIBLY SMALLER THAN THE GAP AROUND IT, AND THE
RATIO IS THE GROUPING.** Refactoring UI: *"always make sure there's more space
around the group than there is within it."* No source codifies a multiplier;
every illustrative example lands near **3x**, which on an 8 px grid is 8 inside
and 24 between, and on a 1.5 ratio is two to three steps. **House rule: a
between-group gap is at least two scale steps above the within-group gap.**

✅ **START WITH TOO MUCH AND REMOVE.** Refactoring UI's one free chapter, in
full: *"elements are only given the minimum amount of breathing room necessary to
not look actively bad... It's a lot more obvious when you need to remove white
space than it is when you need to add it."* Adding has no stopping signal, so
you tune forever. Removing has one, so you stop. And they carve out the
dashboard case explicitly: dense is fine **as a decision rather than as the
default.**

## 2. Things line up because they share a coordinate system

🔴 **TWENTY-TWO ALIGNMENT INCIDENTS, ABOUT FORTY-FIVE CORRECTIONS, AND EVERY
ONE WAS A PAGE DOING ARITHMETIC ABOUT A COMPONENT'S INSIDES.** `/twelve/` was
corrected by screenshot **twelve times in one evening**: buttons a label too
low, then two labels ending on different lines, then a lane starting 30 px below
the button beside it. **A per-element margin correction is correct on the day
it is typed and wrong the next time a component grows a label**, which is
exactly what happened when a button column was lifted by a foot's height and the
pads then grew one.
✅ **ONE GRID ON THE CONTAINER, OR ONE PUBLISHED CONTRACT ON THE COMPONENTS,
AND THEN THE BROWSER DOES IT.** `--ctl-head`, `--ctl-foot` and `--ctl-step` at
`:root` are that contract, and `.pos-crow` is plain `flex-end`. `/grains/`'s
four sliders (that page is a 404 since 2026-10-13, archived to
`archive/demos/grains-index.html`; the granulator today is `/granulator/grains/`): *"Four rows line up only if they share one set of COLUMNS, which
nothing but a grid on the container can give them. Per-element spacing cannot
fix an alignment problem."* After: label lefts all 16, lane lefts all 61, lane
widths all 250 where one had been 96.
⚠️ **AND SUBGRID IS THE PRIMITIVE THIS PROJECT REACHED PAST.** A grid over the
whole control row with three tracks (head, working surface, foot) and
`grid-template-rows: subgrid` on each control would align every lane, button and
dial with no published numbers at all. The tokens work; they also require every
component author to opt in, and callers still counted two of the three
contributors and came up 30 px short.

🔴 **LABEL-AND-CONTROL ROWS SHARE ONE COLUMN PAIR, AND THAT IS A COMPONENT
OPTION, NOT A LAYOUT A PAGE WRITES.** Photographed 2026-09-26 on a three-row
settings list: `REVERB` and `OCTAVE` are six letters and `BOARD` is five, and
BOARD's badge sat **10 px left** of the other two controls, because each flex
row put its control where its own label's width left it. Asked as *"does not
comply with the label / control grid. make it a general rule and component
(subgrid?)"*. `createGlueRows({ grid: true })`: the surface is a two-column
grid, `max-content minmax(0, 1fr)`, and every row is a subgrid on those lines,
so the label column is as wide as the widest label across ALL rows and every
control starts on one x. A row with one child spans both columns, so a picture
row still runs edge to edge. **Any surface holding two or more `[label,
control]` rows is a `grid` surface**; three flex rows that happen to line up
today are three rows that will not tomorrow.

🔴 **A RESERVED SLOT OUTLIVES ITS LABEL, AND A CONSTANT OFFSET HIDES WHILE A
PER-ROW ONE ANNOUNCES ITSELF.** `/circuit/`'s round buttons drifted **75 px
down a five row column** from 15 px of reserved top-label slot per cell after
the legends came off. *"Three separate times in one session a reserved slot
outlived its label."*

🔴 **MEASURE THE INK, NOT THE BOX, AND THREE ALIGNMENTS THAT LOOK LIKE ONE ARE
THREE ASSERTS.** Two of three lined up while the third was 30 px out. Later the
boxes matched perfectly while the faders inside them were 17 px apart. A pad
returns its wrapper as `el` and its button separately; an assert reading the
wrapper reported a button 17 px low while the button was exactly right. *"add
space on left of nola to be same as top and bottob paddings"*, asked twice: the
two BOXES agreed to the pixel and the two LETTERS were 10 px apart. **A reader
sees ink, not boxes.**

🔴 **THERE ARE TWO CENTRES AND WHICH ONE IS MEASURED MATTERS.** *"center patch
selector (optically center to the instrument)"* means centred on the CASE, not
balanced between two unequal neighbours, and a flex `space-between` row puts its
middle child wherever the difference between those two leaves it. `grid-
template-columns: minmax(0, 1fr) auto minmax(0, 1fr)` is the whole answer.
⚠️ **`1fr auto 1fr` IS A TRAP, NOT A TYPO.** An `auto` track's growth limit is
its max-content, so a full centre slot takes the row and **both `1fr` tracks
resolve to zero**: MEASURED on `/mirror/`, a left slot 0 px wide with its dot
drawn over the first label. `minmax(0, 1fr)`.

🔴 **OPTICAL: THE MATHS IS THE DEFAULT AND THE EYE OVERRIDES AT FOUR KNOWN
PLACES.** Round shapes against square ones (a circle must be **112.84 per cent**
of a square's width to read as equal, which is the one rigorously derived number
in the area), a triangle's point, punctuation at a flush margin, and caps
against mixed case. `place-items: center` centres the wrong rectangle: a glyph
gets an advance width and a baseline, and U+26F6 is drawn small and high.
`symbol.mjs` computes the offset from the font's own metrics rather than typing
`translate(1px, 1px)`, which is *"a number with no source, right for one glyph
in one font at one size."*
⚠️ **EVERY SPECIFIC OPTICAL-CENTRE NUMBER IN CIRCULATION IS UNSOURCED.** 45 per
cent, 46 per cent, 3.5 per cent, one eighth of the height: none traces to a
measurement. The direction is agreed by everyone; treat the magnitude as an eye
judgement per asset.
✅ **`text-box-trim` IS THE PROPERTY THAT REPLACES HAND-TUNED LABEL MARGINS.**
`text-box: trim-both cap alphabetic` makes a label's box its ink rather than its
line-height. Baseline 2026, Chrome 133, Safari 18.2, Firefox outstanding. A dark
panel with tight rows lives or dies on this and until now it was margins.
⚠️ **TRACKING: POSITIVE ON SMALL UPPERCASE LABELS, ZERO AT BODY SIZE, NEVER ON A
NUMERIC READOUT.** Carbon: no letter-spacing above 14 px. A `ch` reserve on a
tracked word overflows by one space per character.

## 3. A thing is its own size

🔴 **A COMPONENT'S SIZE IS A PROPERTY OF THE COMPONENT, STATED IN THE TWO
DIMENSIONS IT IS ABOUT.** *"awful. bring back that original pad button size
square"*: the columns were `minmax(0, 1fr)`, so **the pad's size was a function
of how many of them there were and how wide the page was**. Sixteen looked right
and eight were enormous. A pad is a thing a finger hits. And `aspect-ratio: 2 /
1` on a half pad was *"the same thing only while the width is fixed, and the
width was not."* **Say the two dimensions, and the pad cannot be reshaped by how
many of it there are.**

🔴 **AN INSTRUMENT IS AS WIDE AS THE INSTRUMENT, NOT AS WIDE AS THE PAGE.**
`.kbd` has carried `width: fit-content; max-width: 100%` with its reason beside
it since it was written: *"a full width panel holding a 496 px keyboard is
800 px of empty surface, which reads as a layout that failed rather than as an
instrument at its own size."* On 2026-09-26 the first glued panel ignored that
and stretched, and four knobs on a pedal floated in a 660 px band with 250 px of
bare surface each side. The verdict was *"plainly awful"* and it was earned.
**The controls were right and the box around them was making a claim about the
object's size that nothing had measured.** `.pos-rows` takes the same pair now.
⚠️ **`max-width: 100%` IS THE OTHER HALF**, so an object wider than the page is
held inside it and scrolls its own rows rather than dragging the document.

🔴 **TWO THINGS SIDE BY SIDE ARE CLEARLY THE SAME SIZE OR CLEARLY DIFFERENT,
NEVER ALMOST THE SAME.** Reported 2026-09-26 on `/eccm/` (which lives outside this repository since
2026-09-27, `~/personal/eccm`, served at eccm.positron.studio) with a crop: a 146 px
picture beside a text block of 170 to 200 px, in the owner's words *"image
should be bigger to avoid awkard a-bit-longer text. gestat 101,
just-a-bit-different sizes are nervous"*. A small difference reads as an
error in one of them; a large one reads as a decision. The picture went to
its own 300 px, clearly the taller of the two. **When a row pairs a picture
with text, size the picture so it is the taller by a margin the eye cannot
mistake, or make the text the taller by the same margin; the band in between
is where the layout looks unfinished.**

🔴 **A SUGGESTION, NOT A PRESCRIPTION.** Every Layout: *"A declaration of
`width: 20rem` means just that: make it 20rem wide, regardless of circumstance.
But `flex-basis: 20rem` tells the browser to consider 20rem as an ideal."*
`flex-basis`, `min-block-size`, `max-inline-size` over `width` and `height`.
**Declare the cell, let the browser derive the count:** `repeat(auto-fill,
minmax(min(<cell>, 100%), 1fr))`. The `min()` is what stops a floor wider than
the screen from making **a column wider than the page**: 390 px of screen, a
500 px row, 141 px of overflow, which is what `tabs.mjs` shipped. And
`auto-fill`, not `auto-fit`, when cells must keep their size however many there
are.

🔴 **A CONTAINER THAT DOES NOT FIT SCROLLS AGAINST ITS OWN `min-content`. IT
NEVER WRAPS AND IT NEVER SHRINKS.** `flex-wrap` wraps BETWEEN items and a single
item wider than its box cannot wrap: 424 px in a 358 px box dragged the page
**65 px sideways**. `repeat(var(--pad-cols), …)` is a fixed track count and a
grid too wide *"neither wraps nor shrinks, it spills"*, 27 px past its own box.
Both comments claimed an intention the rule could not implement. `.pos-tbl-row`
is `min-width: min-content` rather than a typed 560 because the columns grew
three in a day and *"560 stopped being a floor that held anything"*.
⚠️ **`min-width: 0` AND `min-height: 0` ARE NOT OPTIONAL AND ARE THE HALF THAT
GETS LEFT OUT.** A flex item's automatic minimum is its content, so a scroller
without them drags the page instead. Written down four times in `shell.css`.

## 4. Grouping: the ladder, and why the strongest rung is the last one

🔴 **COUNT THE GROUPING RELATIONSHIPS THIS REGION HAS TO EXPRESS.** One
relationship plus two scale steps of available space: **use space**. Two
relationships at once (row groups AND column groups), or no space to spend:
**draw the region**. And **if a region is already drawn around the parent, the
child gets space, never a second region.** This is synthesis from NN/g,
Refactoring UI and Palmer, flagged as such, and it is the operational form of
what follows.

🔴 **COMMON REGION OVERRIDES PROXIMITY. THAT IS A LAB FINDING, NOT A
PREFERENCE.** Palmer 1992: dots inside a drawn boundary group together **even
when they sit closer to dots outside it**. NN/g's Food Network case: ratings sat
closer to the wrong recipe, and wrapping each recipe in a card fixed the
misreading **with no change to any spacing**. **So a border is the strongest
grouping cue there is, which is exactly why it is reached for last**: its
strength is what makes it spread. Dave Rupert names the mechanism the
*"hierarchy arms race"*: *"Once something is a card, it has a border, now
everything else craves a border."*
✅ **THE LADDER, WEAKEST AND CHEAPEST FIRST:** space, then a background tint,
then a shadow, then a border. Refactoring UI's *"Use fewer borders"* orders the
alternatives identically. Reach down a rung only when the one above has failed.
⚠️ **MATERIAL 3 STATES THE USABLE VERSION:** *"List items with repetitive
formats may not require an inset divider, in which using only the margin between
items is acceptable."* Full-width dividers between unrelated sections, sparingly;
inset dividers within a section; and none at all between like rows. Apple draws
the same line from the other side: gluing is for lists and forms, and *"adding
nested boxes to define subgroups can make your interface feel busy and
constrained."* **Rows in a list are a set. Arbitrary boxes are not.**
⚠️ **AND `/circuit/`, THIS PROJECT'S BEST INSTRUMENT, DRAWS ZERO SEAMS.** One
case, one radius, and every group inside it is proximity and a lattice. The
glued panel built on 2026-09-26 drew five lines on one object because the
sketch drew dashes between rows. Look at `/circuit/` before deciding a row needs
a line.

🔴 **SIMILARITY IS A PROMISE.** Two things that look the same must behave the
same. Synchrony styled Cancel, Submit and Add Attachment as three identical
green buttons; Tribute put a decorative red icon beside a red button and users
read them as one control. **Emphasise by de-emphasising**: emphasis is unbounded
and starts the arms race, de-emphasis is bounded by the background.
⚠️ **NO GREY TEXT ON A COLOURED BACKGROUND.** Grey on white works because it is
reduced contrast; on a dark panel grey is a different hue fighting the ground and
reads as disabled. Same hue as the background, walked in saturation and
lightness, which is only writable in HSL. **For this project's palette that is
the single highest-value rule in Refactoring UI.**

🔴 **CLOSURE IS WHAT TELLS A READER THERE IS MORE TO THE RIGHT.** Target's
carousel crops the next card at about 40 per cent and it reads as *swipe*;
HelloFresh's peek is so small it is *"very easy to miss"*. MEASURED 2026-09-26 at
390 px: `/twelve/` shows 3 of 8 strips, `/circuit/` cuts at knob 5, `/evo/` at
D♯3, `/knobs/` at G3, **every one scrolling correctly and every one looking cut
off**, because a scroller with no visible edge, no fade and no partial next item
is indistinguishable from a clipped box. The Reel's answer is an intentional
overhang; a `mask-image` fade composes with the rounded clip on the same
element.

## 5. Gluing: one surface out of stacked sections

🔴 **THE PATTERN HAS NINE NAMES AND NO ONE NAME, WHICH IS WHY IT KEEPS BEING
REINVENTED.** Apple's inset grouped list, libadwaita's boxed list, Primer's
BorderBox, Bootstrap's list-group and card, Carbon's structured list, WinUI's
settings card, and a segmented control is the same thing turned ninety degrees.
`research/glued-containers-2026-09-26.md` has every one's real CSS. What follows
is the rule set, each traceable.

🔴 **ONE EDGE PER OBJECT, DRAWN BY THE OUTERMOST THING THAT OWNS IT.** Inside a
joined surface the children give up border, radius and margin. Twenty border and
corner incidents in this repository, and the worst was six reports on one
`/fau/` panel ending in *"you ui skills are pathetic"*. Two 1 px lines touching
is a 2 px line, *"which is why it reads as THICK rather than as double"*: a
canvas computing 1 px `--line` inside a glue computing the same 1 px with nothing
between them. **A ring on a control that already has an edge colours that edge.
It does not grow a second one.**

🔴 **A CONTAINER THAT STRIPS A COMPONENT'S BORDER STRIPS ITS PADDING IN THE
SAME RULE, THROUGH THE COMPONENT'S OWN TOKEN.** Padding on a box that no longer
has a border is a margin the component invented, and a component does not own
its outer margin: the row it is in supplies the inset. Photographed 2026-09-26:
the keys sat **29 px** from a glued surface's edge while the nameplate under
them and every knob row sat at **20**, because `.pos-glue > .kbd` had zeroed
border, radius and margin and left `padding: var(--kbd-pad)` standing. Asked as
*"rm its padding/margin (component without border but with padding is
essentially component with margin and we do not do it, it's ui side-effect)"*.
The fix is `--kbd-pad: 0px` in that rule and never `padding: 0`, because the
keyboard's footer bleeds by `calc(-1 * var(--kbd-pad))` and pads by the same
token; zero the padding alone and the footer overshoots by 9 px each side.
✅ **THE BIG STEP, DONE THE SAME DAY, AND IT IS THREE TOKENS AND NO PATCHES.**
Nineteen surfaces declared `1px solid var(--line)` and `4px` literally, so a
glue had to strip each one it met by name: seven per-component patches, each
with a paragraph, all doing one job. The owner's verdict: *"what is all this
bloat, those 1px rules and the whole life story, all the baggage of
nonsystematic let's-measure-pixels what I tried to discard and you wrote a
composing skill for."* Correct, and the patches are gone. **`--edge` and `--r`
are declared once at `:root` and read by every surface**, the synth view's own
injected stylesheet included; **`.pos-glue > *` sets both to 0** and every
surface inside a glue goes flat by inheritance, the next one written included.
**`--inset` is the third and is deliberately undeclared**: a surface reads
`var(--inset, <its own default>)` and keeps it until a row sets `--inset: 0px`,
and then every surface in the row loses it at once. Controls whose border is
their shape (a toggle, a pad, a knob's hand, a tag) do not read these.
🔴 **SO THE RULE IS NOW A PROHIBITION.** A new surface reads the three tokens
or it is not a surface of this kit. **A `.pos-glue > X` patch that strips a
border may not be written**; if one seems needed, the component is not reading
`--edge`, and that is what to fix. `/kit/` (today `/kit/devices/`, checked 2026-10-14) measures every child of every glued
row for its own left margin, its padding where it has no border, and its border
where it is not a control, and requires zero; that assert found the keyboard,
then the synth view, then the display, in one afternoon.

⚠️ **`between` SPREADS ONLY ACROSS A ROW WITH AN INTRINSIC WIDTH, WHICH ON A
SHRINK-TO-FIT SURFACE IS RARE.** MEASURED three times on `/kit/`: on a settings
list, on a meter and on a station strip, two children under `space-between`
came out **8 px apart against an 8 px gap**, because the surface is as wide as
its widest row and a picture that fills a row has no width of its own to give
it. Only the keyboard has one, so the panel's plate row is where `between` is
real, and the glued rows block claims it nowhere. A shrink-to-fit surface plus
`between` is `start` with a longer name.

🔴 **THE RADIUS IS DECLARED ONCE ON THE CONTAINER, AND THE FIRST AND LAST
SECTIONS READ IT BACK.** `border-radius: inherit` on the four longhands of
`:first-child` and `:last-child`, which is Bootstrap's list-group verbatim and
the single best idea in the whole survey. **Children round their own corners
wherever a row has focus, hover or drag chrome, because `overflow` clips all
three and a clipped focus ring is a WCAG 2.4.7 failure.** Outer clipping is
safe only where the children are inert, which is where Tailwind and Polaris use
it. **A knob row is not inert.**
⚠️ **`.pos-glue` CLIPS WITH `overflow: hidden` TODAY, AND `hidden` IS A
SCROLLABLE VALUE.** It makes the surface a scroll container, so `position:
sticky` inside it sticks to the wrong thing and edge focus rings are cut.
`overflow: clip` is not scrollable and Polaris ships exactly that on its Card.
Open in `BACKLOG.md`.
✅ **DONE, CHECKED 2026-10-14:** `.pos-glue` in `shell.css` reads `overflow: clip`
today. The paragraph above is kept as why.

🔴 **THE NESTED RADIUS FORMULA IS NORMATIVE CSS, AND IT DOES NOT APPLY TO A
GLUED STACK.** CSS Backgrounds 3, corner shaping: *"The padding edge radius is
the outer border radius minus the corresponding border thickness... Likewise the
content edge radius is the padding edge radius minus the corresponding
padding."* So `inner = outer - (border + padding + gap)`, clamped at 0 with
`max(0px, calc(...))` because a negative radius is invalid and throws the whole
declaration away. Violate it and the gap between the two curves is wider through
the arc than along the edges, *"the space between elements increase awkwardly
in the corners"*, a defect nobody can name and everybody sees. **But a glued
section is flush with the frame, so the gap is zero and `inner = outer`.** The
most likely hand-rolled mistake is subtracting where nothing lies between the
curves and getting corners visibly too tight. `.pos-fdr-cap`'s radius drops to
3 inside a 4 px corner because there IS a 1 px lane between them.
⚠️ **AND CORNER CURVES MUST NOT OVERLAP.** If a section is shorter than twice
the radius the browser proportionally reduces **all four** of its radii, silently,
and it will not match the section below. Guarantee `2 * radius` of height or
accept it. `corner-shape: squircle` breaks the formula entirely; gate it and
judge by eye.

🔴 **THE SEAM, AND WHICH OF FIVE WAYS TO DRAW IT.** A real `border` snaps to
whole device pixels and is what every surveyed system uses, but it participates
in layout and needs a de-doubling rule. `box-shadow: inset 0 -1px 0` is layout-
neutral and follows the radius for free, and it is exempt from the snapping
algorithm, so at fractional DPR it anti-aliases rather than landing crisp. A
`gap: 1px` over a coloured ground, which is what `.pos-glue` does, survives a
hidden section structurally because `display: none` takes no gap; its costs,
from the Chrome team's own critique, are that the line's length cannot be set,
an empty part leaks the ground, and the seam colour is welded to the background
architecture. **Which is why every glued part must paint its own ground**,
recorded four times in five weeks before the container owned it.
✅ **THE CLEANEST DE-DOUBLING IS BOOTSTRAP'S: every row carries a full border
and `.row + .row { border-top-width: 0 }`.** One join, one line, no negative
margin, nothing painted outside the parent. The negative-margin form is needed
only when a segment must raise its own complete border for a state, and its
failure mode is documented: the first item's edge lands one pixel outside the
group and an `overflow` ancestor clips it.
⚠️ **IF SECTIONS CAN BE HIDDEN, THE SELECTOR IS `> :not([hidden]) ~
:not([hidden])`.** That is Tailwind v3's `divide-y`. Tailwind v4 replaced it
with `:not(:last-child)` for a 2000x match speedup and knowingly broke the
hidden-last-child case; two bug reports followed. **v3 was correct and a kit
with a handful of sections does not need the speed.**
⚠️ **THE INTERIOR SEAM IS WEAKER THAN THE OUTER FRAME.** Primer uses
`--borderColor-muted` inside and `--borderColor-default` outside; libadwaita
names the seam `--card-shade-color` after the surface it divides; Apple ships
`separator` (translucent, composites over tinted rows) and `opaqueSeparator`
and documents when each is right. **And the seam is inset when the rows carry a
leading glyph column**: a full-bleed separator in a settings-shaped list is the
non-native tell. Gap decorations (`row-rule`, `rule-inset`) are the first
mechanism to own a seam at the layout layer, Chrome 149, Chromium-only, a
progressive enhancement today.

🔴 **HORIZONTAL GLUE: DROP ONE SIDE, DO NOT OVERLAP.** shadcn's ToggleGroup is
`border-l-0` on every item and `first:border-l`, with `focus:z-10` so the ring
is not covered by the neighbour. Primer and Carbon draw segmented-control seams
as a pseudo-element **shorter than the segment** (16 px in a 32 to 40 px
button), because a full-height seam reads as a table, and **both delete the seam
next to the active segment** because its own fill already separates. That is
why a hand-rolled control looks subtly wrong beside a native one. `.pos-seg` is
this project's segment utility and four components had each written its six
declarations out before it existed.

🔴 **INSIDE A GLUE, EVERY STRAY PIXEL OF LAYOUT BECOMES A VISIBLE LINE.** A
replaced element (`textarea`, `canvas`, `img`, `video`, `iframe`, `select`) is
inline by default and sits on a text baseline, so a BLOCK parent reserves
descender space under it, and that 1.5 px strip is painted in the seam colour.
A flex container blockifies its children, which is why `.pos-rows-r` is flex,
and it reaches one level only. **Every `.pos-glue > X` patch is also written
`.pos-glue > * > X`**, because `/archive/radio/` glues a scope straight in and `/pack/`
wraps it, and a direct-child selector fixed one page and left the other exactly
as reported.

✅ **SHIP THE SEPARATE VARIANT BESIDE THE GLUED ONE, OVER THE SAME MARKUP.**
libadwaita's `.boxed-list` and `.boxed-list-separate`. `createGlue`'s own
header says separate is still the default and gluing is a CLAIM that two things
are one object.

## 6. The phone, which is where a desk layout goes to be found out

🔴 **WHEN A ROW JUSTIFIES AND WHEN IT GOES LINEAR: DECIDED BY THE ROW'S OWN
WIDTH, NEVER BY THE VIEWPORT, AND THE RULE HAS THREE HALVES.** Asked 2026-09-26
as *"make composition rules on when to justify layout in mobile when to make it
linear (avail space?)"*, and the answer to the parenthesis is yes, available
space, meaning the container's.
- **A start row wraps as a cluster.** `flex-wrap: wrap` and one `gap`:
  left-aligned, every item its own width, the gap between items and between
  lines, nothing squished and nothing past the inset. Eight octave buttons in a
  320 px frame are two lines, MEASURED on `/kit/`.
- **A justified row has exactly two children, each end one element.**
  `space-between` justifies each wrapped line on its own: MEASURED on `/nola/`
  at 375, `N D − + 0` on one line and `Loop Sustain Panic` right-aligned on the
  next, which is the shape that reads as broken, and it happens only when a
  wrapped line holds two or more items. With one item per line it parks each at
  the start. So a between row of two ends wraps into two left-aligned lines at
  their own sizes with no extra rule, no threshold and no media query, and
  `createGlueRows` refuses any other count. *"if you have a justified layout in
  desktop, you need to go to left alignment in mobile and have gaps between
  elements, not just squished."* ⚠️ **THE FIRST DRAFT OF THIS RULE FORCED EACH
  CHILD TO A FULL LINE WITH A `min-width` TRICK AND THE KIT'S 320 px FRAME
  SHOWED A BUTTON STRETCHED ACROSS THE ROW WITH ITS WORD PUSHED RIGHT**: linear
  answered by stretching, which is the header's own phone defect
  (`.panel-head-mid > * { width: 100% }`) rebuilt one component along. A control
  in a linear row is at its own size or it is not linear.
- **`between` needs a width to spread across, and a shrink-to-fit surface has
  none.** MEASURED three times at 8 px apart against an 8 px gap. A justified
  row lives on a `full: true` surface or on one whose width some other row sets
  (a keyboard); anywhere else it is `start` with a longer name.
⚠️ **A FOOTER WITH FIVE CONTROLS IN IT IS NOT A JUSTIFIED ROW, IT IS TWO GROUPS**, one element each, and then it is one. That is the shape `.kbd-foot` needs and does not have.

🔴 **A COMPONENT ASKS ITS OWN BOX, NEVER THE WINDOW.** *"a component in a half
page column on a 1280 px screen is 600 px wide, and a viewport query would tell
it it has room it does not have."* `local-remote.mjs` decides its arrangement in
JavaScript for this reason. **`@container` is the CSS-native form of THAT
half**, Baseline widely since 2025, and this stylesheet has 20 media queries and
zero container queries. (2026-10-14: 21 `@media` blocks, still zero
`@container`. `bay-view.mjs` decides across or stacked in JavaScript from its own
`clientWidth` for the same reason `local-remote.mjs` does.)
⚠️ **AND IT IS NOT THE FORM OF THE OTHER HALF, WHICH THE FIRST DRAFT OF THIS
FILE CLAIMED.** A `@container` block adds no specificity and is resolved by
source order exactly like `@media`, so one placed above a plain rule of equal
weight loses in precisely the same way `.pos-pick`'s phone layout lost. The cure
for the ordering bug is `@layer`, §8, or removing the second rule with an
intrinsic expression so there is nothing to lose a tie.
⚠️ **THREE THINGS `container-type` DOES THAT THE SYNTAX DOES NOT SAY.** An
element cannot query itself, so every responding component needs a wrapper.
`inline-size` establishes an independent formatting context, so **margin
collapsing stops inside it**. And Chrome 129 removed the containing-block and
stacking-context side effects the original spec had, calling them a design
mistake; if a positioned descendant moves when a container is added, that is
why, and `contain: layout` restores the old behaviour deliberately.

🔴 **A COUNT IS NOT A WIDTH.** The readout computes its columns from `ceil(n /
6)`, so four cells are one row at any width and the flex wrap then breaks that
row wherever it runs out: MEASURED at 390 px on `/knobs/`, `CC OUT SOUND OUT
ROUND TRIP` and then `BUFFER` alone. The balanced-rows rule needs the available
width as an input.

🔴 **AN EMPTY SURFACE AT PHONE SCALE IS A SCREEN OF VOID.** Three pages showed a
bordered box of about 200 px with nothing in it under the instrument. On a desk
it sits beside things. Undiagnosed, in `BACKLOG.md`, and the standing rule about
an empty box being a line applies at this scale too.

⚠️ **A LABEL THAT TRUNCATES IS IN THE WRONG PLACE, AND A KNOB LABEL HAS
NOWHERE ELSE TO BE.** `RESONA…` on `/knobs/`, `FEEDBA…` on the kit before it was
renamed. A shorter word, or a control that knows its label's width.

## 7. Empty paints nothing, and nothing moves while somebody is looking

🔴 **A CONTAINER WITH NOTHING IN IT MUST NOT PAINT ITS EDGES AND MUST NOT TAKE
UP ROOM, AND THAT CANNOT BE THE PAGE'S JOB TO REMEMBER.** Twelve incidents. A
`.pos-readout` with 0 children and a height of 2.0 px was a full-width rule
nobody wrote, reported as *"old UI creeping in"*. **`min-height: 0` is not
enough: an empty block in a flex column still takes a line box AND still
collects the column's gap**, which is why the feedback panel was reported three
times as unfixed. `display: none`, from the component, and assert on
`getComputedStyle(el).display`, never on `el.hidden`, which is a fact about an
attribute and passed every run while three headings were on screen.

🔴 **ANYTHING THAT REDRAWS ON A CLOCK LIVES IN A FIXED BOX WHOSE RESERVE IS
COMPUTED FROM THE WIDEST THING IT CAN EVER SAY.** Nineteen incidents. A caption
rewriting itself sixty times a second reflowed between three and four lines and
everything below it jumped. *"The fix is never to shorten the sentence."* A
knob's number needed a fixed WIDTH as well as height, because `align-items:
center` re-centres a content-sized box on every frame and `9` becoming `10`
slides the whole string. Only `opacity`, `color`, `background-image` and
`transform` may animate. And a reserve exists only for the moments a jump is
possible: not before the first word, not after the last.

## 8. The cascade: read the computed value, and let the structure do the rest

🔴 **NEVER READ THE RULE. READ THE COMPUTED VALUE OF THE PROPERTY YOU SET.**
Thirty cascade incidents and six measured dead rules. `.pos-pick`'s **entire
phone layout** sat in a media block 460 lines above a plain rule of equal weight
and *"had NEVER collapsed on a phone in its life."* A component's `padding`
shorthand at (0,2,1) beat a page's `padding-top` at (0,1,1) while the source
read as correct. `.pos-pg-labs`'s label column computed to **0.00 px** for
three days under an unchanged assert count. **Cascade failures are cheap to find
and expensive to leave**: one `getComputedStyle` call ends the argument, and a
dead rule reads as correct for weeks.

🔴 **MATCH A COMPONENT'S WEIGHT, NEVER OUTRUN IT. ORDER IS THE FIX AND WEIGHT IS
AN ESCALATION.** A media block moves AFTER what it overrides. `.pos-glue.pos-
glue > *` is double-classed so it cannot lose to a component's own single-class
border on source order. Raising specificity to win a fight with your own
stylesheet is how `.pos-faux` ended up needing (0,2,0), and the next fight
starts one step higher.

🔴 **A COMPONENT THAT VARIES A PROPERTY PER INSTANCE SETS A CUSTOM PROPERTY,
NEVER THE PROPERTY.** `stage.style.aspectRatio` was an inline style no selector
could beat, so a panel given a shape could never give it up and *"the way out of
full screen rode up there with it."* Reported as two faults. `setProperty('--vp-
aspect', aspect)` and `aspect-ratio: var(--vp-aspect, 16 / 9)`.

🔴 **CLEAR AN ATTRIBUTE BY DELETING IT, AND SAY WHAT `[hidden]` MEANS EVERY
TIME YOU SET `display`.** `[data-full]` matches an EMPTY attribute, so
`dataset.full = ''` kept every full-screen rule applying for the rest of the
page's life. Any author `display` beats the browser's `[hidden]`; six
components here have needed the identical `.x[hidden] { display: none }` patch.
⚠️ **AND A FLEX PROPERTY ON A NON-FLEX BOX IS NOT AN ERROR, IT IS SILENCE.**
`/keys/`'s phone layout (the page was retired 2026-09-17, `archive/keys/`) was written three times before it did anything; one
version set `flex-direction`, `align-items` and `gap` but not `display`.

🔴 **`@layer` IS THE SINGLE HIGHEST-VALUE CHANGE FOR THIS STYLESHEET, AND IT
IS ONE LINE.** *"Once the layer order has been established, specificity and
order of appearance are ignored."* `@layer reset, base, layout, components,
page, responsive;` at the top of the file, once, and then a page's `padding-top`
at (0,1,0) in `page` beats a component's `padding` shorthand at (0,2,1) in
`components`, and every media query lives in `responsive` where its position in
the file stops mattering. **That is incidents B and C cured structurally**, the
shorthand that beat the longhand and the phone layout that never ran. Baseline
widely since 2022. `research/cascade-cures-2026-09-26.md` measured the support
table on the day and this file's own numbers: **841 selectors, 766 rules, max
specificity (0,5,1), zero id selectors, 4 `!important`, 0 `@layer`, 0
`@supports`**. By those numbers it is a healthy sheet with no ordering
discipline. (2026-10-14: still 0 `@layer`; 2 `!important`, both inside
reduced-motion rules; the file is 8080 lines.)
⚠️ **THREE TRAPS BEFORE ADOPTING IT.** Layer order is fixed by the FIRST
declaration and a later statement does nothing. Unlayered styles beat every
layer, which is the trap and also the gift: leave `[hidden] { display: none }`
unlayered and put every component `display` inside a layer, and **incident F
is cured with no `!important` anywhere**. And `!important` INVERTS layer order,
so the four in this file have to go before the layers arrive or a second,
opposite ordering runs underneath the first.

🔴 **`:where()` IS ZERO SPECIFICITY, AND NESTING IS NOT WHAT IT LOOKS LIKE.**
`:where(button, input, select) { font: inherit }` is a base rule anything can
beat without a fight. `:is()`, `:not()`, `:has()` and the nesting `&` all take
the HIGHEST specificity of their arguments, so `#a, b { & i { } }` is (1,0,1)
even on the `b` match. Nesting is fine for organising and a specificity risk
exactly when the parent list is heterogeneous; wrap it in `:where()`.

🔴 **A CHILD NEVER REACHES AN ANCESTOR'S PADDING, SO CHANGE WHO IS ASKED.**
The structural cures for incident A, in order: the ancestor opts out with
`:has()`, `.frame:has(> .bleed) { padding-inline: 0 }`; the layout owner
provides the escape hatch, `grid-template-columns: 1fr min(60ch, 100%) 1fr` and
`.bleed { grid-column: 1 / -1 }`; the padding is a custom property the child
can read and negate; or `@scope (.panel) to (.nested)` so the component's chrome
cannot reach nested content in the first place. `@scope` is in all three
engines and adds a cascade step, proximity, where the nearer root wins;
**use bare selectors or `:scope` inside it, not `&`**, whose specificity
differs by engine and version.

🔴 **LOGICAL PROPERTIES REDUCE OVERRIDES FOR A REASON THAT IS NOT WRITING
MODE.** `padding-block` and `padding-inline` are two longhands where `padding`
is one shorthand, so a page can change one axis without a shorthand fight. And
they cascade WITH the physical ones as one property: `margin-inline-start: 1px;
margin-left: 2px` in one block gives 2 px in LTR by declaration order.

🔴 **A MODE IS DATA, NOT A CLASS, AND A REGISTERED PROPERTY CANNOT BE EMPTY.**
`@property --ar { syntax: "<number>"; inherits: false; initial-value: 1.7778 }`
makes a bad JavaScript value fall back to the initial value instead of being
invalid at computed-value time and inheriting something unrelated. `@container
style(--mode: on)` compares a computed value and has no presence-versus-value
ambiguity, which is incident E cured structurally; Baseline since 2026-05-19,
custom properties only. `@property` is newly Baseline and not widely until about
January 2027.

🔴 **SUBGRID IS WIDELY AVAILABLE SINCE MARCH 2026 AND IS NO LONGER THE NEW
THING.** A nested component adopts the parent's tracks instead of guessing at
them: `grid-template-columns: subgrid`. It is the primitive §2 says this project
reached past when it published `--ctl-head` and `--ctl-foot` instead.

🔴 **`gap` IS NEVER COMING TO BLOCK LAYOUT.** The CSSWG declined it in 2018 on
the record: *"Margin collapsing and floats and similar complexities of block
layout make this much more complicated."* What shipped instead is
`margin-trim`, which is **Safari-only in stable today**, Chrome 155 on
2026-10-06, no Firefox. So in flow layout the owl or a container-owned rule is
still how it is done, and a plan resting on `gap` reaching prose rests on a no.

🔴 **MARGIN COLLAPSING, EXACTLY, BECAUSE THE FOUR PAIRS ARE THE WHOLE RULE.**
Two margins collapse only if both are in-flow block boxes in the same formatting
context with nothing between them, and they are one of: a box's top and its
first child's top; a box's bottom and its next sibling's top; a last child's
bottom and its parent's bottom when the parent's height is `auto`; a box's own
top and bottom when it is empty. **A 0 px margin is still a collapsible
margin**, which is how a paragraph's 32 px escapes its coloured section. What
stops it is a wall (padding, border, a line box) between the two, OR a new
formatting context: `display: flow-root` does exactly that and nothing else;
`overflow: hidden` does it and also makes a scroll container; **a container
query does it silently**; and **`overflow: clip` does NOT**. Only block-axis
margins collapse, and flex and grid containers never collapse with their
contents. The negative algorithm: largest positive plus most negative.

🔴 **`overflow: clip` KEEPS THE FLEX AUTOMATIC MINIMUM SIZE.** Every article
older than `clip` says *"any value other than visible resets it"* and is now
wrong: the spec keys on *non-scrollable*, and `clip` is non-scrollable. So a
flex child given `clip` to avoid becoming a scroll container keeps the
`min-width: auto` bug. Spec-derived rather than measured; verify in the targets
before leaning on it. And the minimum applies in the MAIN axis only, which is
why a row bug is a width bug and a column bug is a height bug, and why nested
flex compounds it: `min-width: 0` on the inner item does nothing while an
ancestor flex item still has `auto`. Every level from the flex root down.

🔴 **WHICH RULE WON IS A QUESTION WITH ONE COMPLETE ANSWER, AND IT IS NOT
`getComputedStyle`.** That returns resolved values with no provenance, and
`padding: 0.3125rem` reads back as `5px`. `getMatchedCSSRules` is gone from
Chrome and never existed in Firefox. **`CSS.getMatchedStylesForNode` over CDP is
the only complete source**, its array is already in cascade order except that it
ignores `!important`, and its `longhandProperties` field is what prints `<- via
shorthand padding: 5px` next to the winner, which is incident B made visible.
The fourth research strand wrote and ran that script and an ancestor walker
that prints every ancestor's padding and which one establishes a containing
block, a stacking context and a BFC. Both are in the session scratchpad and are
worth adopting into `demo/`, read first. ✅ **ADOPTED, CHECKED 2026-10-14:**
`node demo/which-rule-won.mjs <slug> '<selector>' <property>` and
`node demo/ancestry.mjs <slug> '<selector>' <property> --width 375`, both in
CLAUDE.md's run list. Reach for them before writing a third override. In DevTools the **Computed** pane is
the adjudication tool, not the Styles pane: winner first, losers under it.

⚠️ **WHAT NO LINTER CATCHES, STATED PLAINLY.** A shorthand in one rule beating a
longhand in another is silent to every stylelint rule; only the CDP script sees
it. `no-descending-specificity` never compares a rule inside `@media` against a
plain one, so it cannot see incident C. Nothing lints layer order. A CDP rule-
coverage pass marks `button:hover` dead unless something hovered it and marks a
JavaScript-added class used; a static pass fails in the mirror image; **a
selector is safely dead only when both say so.** And two packages a search will
offer, `@csstools/stylelint-plugin-cascade-layers` and `css-layer-lint`, do not
exist.
⚠️ **STYLELINT ON THIS FILE TODAY: 95 problems**, 54 of them descending
specificity in the deliberate base-then-hover pattern, 25 duplicate selectors,
6 over (0,5,1), 4 `!important`. The specificity ceiling is set at today's
worst so it catches the next regression rather than failing six legitimate
selectors forever. **12 custom properties are declared and never read, 32 are
read and never declared**, and the 32 are very likely the ones JavaScript sets
with `setProperty()`, which decides whether `no-unknown-custom-properties` goes
in as an error or those names get `@property` declarations first.

## 9. If the defect is in the component, the fix is in the component

🔴 **A PAGE-LOCAL REPAIR TO A SHARED COMPONENT IS HOW A DEFECT GETS PAID FOR
TWICE.** `/tom/` fixed the nameplate's top padding privately, *"every page after
it inherited the defect and not the fix"*, and it came back on `/plai/` (no page or git path of that name exists on 2026-10-14) as *"you
failed afain on nameplate padding. after hrs work yesterday"* and on `/fau/` as
*"add padding under nameplate"*. **Three pages, one line in one page.** And the
sharpest words in the whole record are about this: *"in the life of me i don ot
understand why you do not see it and build a soliutiojn that stays (glued
panels) not invent custom css with measurements each time"*.
✅ **A CONDITION IS WHAT MAKES A COMPONENT RULE PROVABLY NARROW.** `:has(>
.panel-strip:empty)` matched exactly one case in the repository and changed
exactly one page, MEASURED across all three that build one. **Then re-run the
other pages and diff their assert counts**, which is the only thing that makes
*provably narrow* a fact rather than an argument.
⚠️ **CENTRALISING AN ASSEMBLY THAT DOES NOT OWN ITS OWN LAYOUT MOVES THE
DUPLICATION RATHER THAN REMOVING IT.** `instrument.mjs` centralised a `prepend`
and left the spacing exactly where it was.

## 10. Where each rule lives, so nothing here is a second copy

| this skill says | the code that carries it |
| --- | --- |
| air belongs to the relationship | `demo/shell/stack.mjs`, `--pos-gap` |
| one number, one place | `:root` in `shell.css`, and `/kit/`'s agreement asserts |
| controls line up by contract | `--ctl-head`, `--ctl-foot`, `--ctl-step`, `.pos-crow` |
| a thing is its own size | `.kbd`, `.pos-rows`, `--ctl-w`, `.pos-tbl-row` |
| one edge per object | `.pos-glue`, `.pos-seg`, `createGlue`, `createGlueRows` |
| every glued part paints its ground | `.pos-rows-r`, `.pos-glue > .pos-scope` |
| empty paints nothing | `[hidden]` rules on six components, `blank()` in `table.mjs` |
| look at the phone | `demo/shot.mjs` |
| which rule won, and whose inset | `demo/which-rule-won.mjs`, `demo/ancestry.mjs` |
| a concept page's column | `positron-concepts`, `demo/shell/concept-nav.mjs` (`CODE_ROWS`) |
| the patchbay block | `createPatchbay` in `demo/shell/patchbay.mjs`, `.pb-head`, `.pb-more` |
| the bay picture's geometry | `BAY_GEOMETRY` and `BAY_VIEW_CSS` in `demo/shell/bay-view.mjs`, shared with `bay-svg.mjs` |
| desk row, phone stack | `STACK_BELOW` in `bay-view.mjs` |
| the hero | `demo/shell/hero.mjs`, `.pos-hero*` in `shell.css` |

⚠️ **THIS TABLE GOES STALE THE WAY EVERY TABLE HERE DOES.** A rule that gains a
second home is a rule that is about to disagree with itself, and the check is
one `grep`.

## 11. The pages this file names, and where they are today

Checked 2026-10-14 against `demo/manifest.mjs`, `ls demo` and `ls archive/demos`.
The measurements above were taken on these pages and stay true as measurements;
only the address to go and look has changed. Many demos were archived on
2026-10-12 and 2026-10-13: an archived manifest row (`unlisted: true`) is still
served at its URL and listed on `/archive/`, and a page moved to
`archive/demos/` is a 404.

| page | today |
| --- | --- |
| `/circuit/`, `/twelve/`, `/evo/`, `/pack/`, `/tom/`, `/muta/`, `/fau/`, `/nola/`, `/mirror/` | archived, still served at the same URL, listed on `/archive/` |
| `/archive/radio/` | the archived radio demo, moved there from `/radio/` 2026-10-13 |
| `/knobs/` | 404 since 2026-10-13, `archive/demos/knobs-index.html` (retired with Yoshimi) |
| `/grains/` | 404, `archive/demos/grains-index.html`; the live granulator is `/granulator/grains/` |
| `/keys/` | 404 since 2026-09-17, `archive/keys/` |
| `/eccm/` | outside this repository since 2026-09-27 |
| `/plai/` | not found in the tree or in git history under that name; left as quoted |
| `/kit/` | split into parts at `/kit/<part>/` since 2026-10-06; the glue asserts are on `/kit/devices/` |

## From the handoffs (extracted 2026-10-19)

- **Fix a lost hierarchy with a scale, not one more number.** "Same size as title" and "3x space" each moved one value and the page lost its hierarchy; the front page is now 24, 15, 12.5 and 10.5 type, 12 inside a group and 48 between. (`HANDOFF.md, session 68 (2026-10-07)`)
- **Find the box that owns the air before editing**: a reported left gutter was all `.panel-case`'s 20 px, not the label's padding. (`HANDOFF.md, session 54 (2026-09-28)`)
- **A box that spans its row makes `justify-content: center` a no-op**; a nameplate centres once the plate gives up `flex: 1 1 auto`. (`HANDOFF.md, session 54 (2026-09-28)`)
- **A flex item cannot widen its parent**: a full width button in a cluster needs the cluster widened too. (`HANDOFF.md, session 54 (2026-09-28)`)
- **Centring a `fit-content` row is a no-op where there is room and a clip where there is not**, and `container-type: inline-size` collapses a `width: fit-content` surface. (`HANDOFF.md, session 54 (2026-09-28)`)
- **Remove a border with `border: 0`, never by deleting the line**: the base `button, .pos-btn` rule sets a `--line2` border as a shorthand, so deleting leaves a brighter ring. (`HANDOFF.md, session 54 (2026-09-28)`)
- **An empty named grid area still collects a row gap**: auto place the item instead (`grid-area: auto / 1`). (`HANDOFF.md, session 66 (2026-10-06)`)
- **Size paired panels off their row, not their own cell loop**: two OLED canvases settled a scale apart and dragged the page 154 px sideways at 756 px. (`HANDOFF.md, session 62 (2026-10-04)`)
- **A glued part's inset depends on how deep it sits**, because that rule is direct child only. (`HANDOFF.md, session 55 (2026-09-29)`)
- **`.pos-rows-r > :only-child` takes the row**, inset or not. A `.pos-glue` with every part hidden hides itself. (`HANDOFF.md, session 53 (2026-09-28)`, `session 63 (2026-10-05)`)
- **`order` moves the paint, not the tab stop.** (`HANDOFF.md, session 55 (2026-09-29)`)
- **A scrolling tab bar clips its focus ring**: `overflow-x: auto` forces `overflow-y` to `auto`, so the ring loses its top and bottom and two verticals stay. (`HANDOFF.md, session 50 (2026-09-25)`)
- **A ring on a canvas is paint, not CSS**: `grain-scope.mjs` stroked a 1 px rectangle into its backing store while three reports went to the stylesheet. (`HANDOFF.md, session 55 (2026-09-29)`)
- **Align an SVG to its ink**: a viewBox holding the source picture's empty margins floated an aligned neighbour 24 px off. (`HANDOFF.md, session 52 (2026-09-26)`)
- **Measure phone overflow against `clientWidth`**: mobile Chrome widens the layout viewport to the content, so `scrollWidth - innerWidth` read 0 on a page 29 px too wide. (`HANDOFF.md, session 52 (2026-09-26)`)
- **A real WebKit phone**: `xcrun simctl` has an `iPhone 13 mini`, whose shots wrap like Chrome's emulation. The owner's phone wraps more, from Safari's text size setting. (`HANDOFF.md, session 51 (2026-09-26)`)


## The owner's corrections (from sessions 2026-09-29 to 10-19)

- Keyboard and panel content may reach the panel edge (*"general rule of keyb and panels"*).

## Retired

Nothing in this file was retired on 2026-10-14. Every rule here is about CSS and
composition, and none depended on a page, worker or input that was taken away:
where an example page is gone, the rule and its measurement stay and §11 says
where the page went. One open item was found finished rather than retired
(`.pos-glue` clips with `overflow: clip`, §5) and is marked in place.
