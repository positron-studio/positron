---
name: positron-ui
description: "Page furniture on a patchbay page: the kit in demo/shell/ and /kit/<part>/, the bay picture (createPatchbay, bay-view, medium colours), controls as node ports (a knob is a value-out, keys are midi-out plus midi-in), readouts, tables, sliders, transport bars, CSS, spacing, phone layout and the prose a visitor reads. Load before building or changing any interface, any control, any port a control stands for, any readout cell, the patchbay block on a page, or any stylesheet rule."
metadata:
  internal: true
---

# The kit, the page and everything a visitor looks at

🔴 **BUILD FROM `/kit/`.** Almost everything below exists because somebody
hand-rolled a control that was already in `demo/shell/`, or wrote a rule that
lost to another rule and read as correct for weeks.

## A page is a patch: start from the bay

Added 2026-10-14 when this skill was re-read against the patchbay model. Every
claim here was checked against the files that day; check again before quoting.

- **A live page is a small patch.** It builds a bay with `createBay()`
  (`demo/shell/bay.mjs`), adds nodes with `bay.addNode({ id: '<site>:<node>',
  kind, label })`, adds ports with `bay.addPort({ id:
  '<site>:<node>:<medium>-<dir>', dir, medium, ... })`, and holds links with
  `bay.link(from, to, transforms, { site })`. `demo/synth/keyboard/index.html`
  is the smallest whole example. The vocabulary (site, room, node, port, link,
  medium, transport) is defined in `positron-concepts`, and `MEDIA` in
  `bay.mjs` is the list of media: `midi`, `audio`, `clock`, `value`, `video`,
  `program`, `file`, `state`.
- **The patch is drawn, never hand drawn.** `createPatchbay(bay, { flowing,
  detail, ... })` in `demo/shell/patchbay.mjs` is the block: the uppercase
  `patchbay` heading (`.pos-sec-h`), a `See details` link button, the picture
  from `createBayView` (`bay-view.mjs`) and, behind the button, the links and
  ports as tables. It reads `nodes()`, `ports()` and `links()` and nothing a
  page types, so renaming a port renames it in the picture. Traffic on the
  wires is `bay-traffic.mjs`: an event medium pulses once per event a link
  delivered, a stream medium (`STREAMY`: audio, video, clock, file, state) is
  lit while the page's `flowing(link, medium)` says so. 41 non archived files
  under `demo/` call `createPatchbay` (counted 2026-10-14 with `grep -rl
  createPatchbay demo | grep -v archive | wc -l`).
- **A control is usually a node's port.** A knob is a node of its own with a
  `value-out` port, linked to the `value-in` of the thing it changes:
  `/shader/mirror/` has `web:knob-segments:value-out` to `web:shader:value-in`,
  and the shader reads its uniform only off that in-port. An on-screen keyboard
  is `keys:midi-out` (what it plays) AND `keys:midi-in` (its lights). A plugged
  in MIDI keyboard is its own `device` node, not folded into the on-screen
  keys. So adding a control usually means adding a node, a port and a link,
  and the picture grows a box without anybody drawing it.
- 🔴 **EVERYTHING A PAGE SHOWS SHOULD ARRIVE ON A LINK.** The lesson from
  HANDOFF session 75 (2026-10-11), *"A patchbay is only as true as the code
  that goes through it"*: `/radio/key/` lit keys and drew rings by calling the
  keyboard directly, and the looper (`sampler/020`, merged into `/code/piano/` 2026-10-12)
  folded the MIDI keyboard into the on-screen keys, so the picture showed neither. A control that changes something behind
  the bay's back makes the patchbay block lie.
- **Medium colours live in one place**: `MEDIUM_COLOURS` in `patchbay.mjs`
  (midi `#6fb8e8`, audio `#ee9a4d`, clock `#c9ced6`, value `#9ad16b`, video
  `#e07a5f`, program `#c39af0`, file `#d68fc6`, state `#8a9fc4`), published as
  `--md-<medium>` and `.md-<medium>`. A page does not pick its own.
- **A concept page's order** (from `positron-concepts`): picture, knob row
  (`createKnobGrid`, one row that scrolls sideways, never wraps), code box,
  keys, patchbay. A readout, when there is one, goes on top (`joined: false`).
  Concept pages mount with `index: '/', indexLabel: 'positron'`, so the back
  link reads `← positron` (the shell default `demos` is for archived demo
  pages; `positron-concepts` still says `concepts` and is out of date on that
  one word).
- **The front page draws the same picture.** `demo/shell/hero.mjs` puts an
  imaginary patch through `createBayView` and `createBayTraffic` above the
  concept cards, and `demo/shell/bay-svg.mjs` draws it as an SVG string with no
  DOM for the share cards. One geometry (`BAY_GEOMETRY` in `bay-view.mjs`), two
  writers.

## Where the pages this file names are today

🔴 **MOST OF THE PAGES BELOW ARE ARCHIVED, AND ARCHIVED IS NOT GONE.** The rules
were learned on demos that were archived on 2026-10-12 and 2026-10-13, and an
archived demo stays served at its own URL with `unlisted: true` in
`demo/manifest.mjs`, listed on https://positron.studio/archive/. So `/fau/`,
`/tom/`, `/twelve/`, `/evo/`, `/circuit/`, `/pack/`, `/shape/`, `/muta/`,
`/mirror/`, `/wish/`, `/stage/`, `/weight/`, `/held/`, `/making/`, `/tapes/`,
`/floor/`, `/reel/`, `/videoradio/`, `/wire/`, `/time/`, `/sync/`, `/capture/`
still answer and still carry the code each rule names. Checked 2026-10-14:
`ls demo/<slug>` finds each folder, and the comments under `DEMO_CARDS` in
`demo/shell/concept-list.mjs` record each archive with its quoted instruction.
The rules stay because they are about the kit, which the live concept pages
use.

| named below | where it is, checked 2026-10-14 |
| --- | --- |
| `/radio/`, `/radio1965/` (the radio demo) | `/archive/radio/`, `demo/archive/radio/index.html` (radio1965 became radio 2026-09-16, radio moved 2026-10-13). `/radio/` is now the radio concept group |
| `/keys/` | retired 2026-09-17, `archive/keys/`; `demo/keys` does not exist |
| `/knobs/` | archived with Yoshimi 2026-10-13, `archive/demos/knobs-index.html`, `/knobs/` is a 404 |
| `/blocks/` | archived 2026-09-24, `archive/demos/blocks-index.html`, a 404 |
| `/items/` | archived 2026-10-01 with its worker, `archive/items/README.md` |
| `/typist/` (the demo) | archived 2026-10-12, `archive/typist.md`; `/typist/<slug>/` is the concept group, `demo/typist/index.html` does not exist |
| `/grains/` | `demo/grains/` still exists; the granulator concept pages are `/granulator/grains/` and `/granulator/beat/` |
| `/plai/` | no `demo/plai/` today; its fate was not traced |
| `/kit/` blocks | split into parts at `/kit/<part>/` on 2026-10-06: BUTTON GROUP and `.kit-out` are in `/kit/input/`, TAB PAGE and CARD GRID ON A PHONE in `/kit/layout/`, SLIDES in `/kit/slides/`, `.kit-pg` in `/kit/devices/`, the closed tab bar drill in `/kit/layout/` |
| `/kit/frontpage/` | moved to the archive listing 2026-10-13 (commit `b02c2d39`), still served at `/kit/frontpage/`; `/frontpage` answers 302 there |

## When somebody reports a line, a gap or a doubled edge

🔴 **THIS SECTION EXISTS BECAUSE OF ONE SESSION, 2026-09-24, IN WHICH THE SAME
`/fau/` PANEL WAS REPORTED FIVE TIMES AND FIXED WRONG THREE TIMES.** The verdict
was *"you ui skills are pathetic"*, and it was earned. Every wrong answer came
from READING the stylesheet and reasoning about it. Every right answer came from
measuring two rectangles. What follows is the order to do things in.

🔴 **1. A REPORTED LINE IS NOT NECESSARILY A BORDER, AND CHECKING THE BORDERS
FIRST IS THE TRAP.** Reported as *"double border, rm"* with a crop. Every element
in that subtree measured `0/0/0/0` or was a control's own legitimate box, so the
stylesheet had nothing to find and I removed a presence button's border on
suspicion. That came straight back as *"fau on off is missing border"*: a real
affordance, deleted, on a guess.
✅ **WHAT SAID IT, IN ONE LINE, WAS THE RECT PAIR OF THE ELEMENT AND ITS
PARENT.** The field wrapper's bottom was **557.5** and the textarea's was
**556.0**. **A `<textarea>` is `inline-block` and sits on a TEXT BASELINE**, so
its block parent reserves descender space under it. That 1.5 px strip belongs to
the wrapper, the wrapper was transparent, and **`.pos-glue` paints `--line`
behind its children on purpose, because that is how the seam is drawn**. So the
page rendered 1.5 px of seam colour, then the real 1 px seam, and a reader sees
two lines. `display: block` on the textarea. MEASURED after: both bottoms
**563.0**.
🔴 **SO THE RULE IS: INSIDE A GLUE, EVERY STRAY PIXEL OF LAYOUT BECOMES A VISIBLE
LINE.** Anywhere else the ground behind a child is the page's own background and
a 1.5 px gap is invisible. Inside a glue the ground is a line colour by design.
**A replaced element in a glue (`textarea`, `input`, `img`, `video`, `canvas`,
`iframe`, `select`) is the shape to check first**, because every one of them is
inline by default and every one of them will leave that strip.
⚠️ **AND A CROP IS EVIDENCE OF WHAT IS ON SCREEN, NEVER OF WHAT CAUSED IT.**
Three readings of the same crop produced three different culprits. Ask the DOM
for the rects; do not ask yourself what the picture looks like.

🔴 **2. COUNT THE BOXES BY WALKING THE ANCESTORS, NOT BY READING THE RULES YOU
WROTE.** *"edge to edge"* was asked on 2026-09-23, answered by zeroing three
insets, and asked again on 2026-09-24 because there were **four**. The fourth was
`.panel-case`'s own `padding: 0 var(--panel-pad)` at 20 px, on the case, which no
page rule touched. **A child cannot reach its way out of its parent's padding
however many of its own rules say 0**, so the text was 20 px short at both ends
for a day while every rule about it read as correct.
✅ **THE FIX WAS NOT A FOURTH OVERRIDE, IT WAS A DIFFERENT SLOT.** `add()` puts a
block INSIDE the case, within its inset; `parts: [el]` makes it a glue member,
a sibling of the case, with no padding left to fight. **When you are writing a
third override to escape a parent, you are in the wrong container.**
⚠️ Walk from the element to the surface and print every ancestor's padding,
border and rect. It is one loop and it ends the argument.

🔴 **3. A COMPONENT'S SHORTHAND BEATS YOUR LONGHAND, AND WEIGHT DECIDES BEFORE
ORDER DOES.** `.fau-src textarea` is `(0,1,1)`. `shell.css`'s `.pos-field.tall
textarea` is `(0,2,1)` and sets `padding: 7px 9px` as a SHORTHAND. The page sheet
loads later and still lost, so `padding-top` computed **7 px** while the source
read as correct. The `border-width` on the same element DID win, because the rule
it beats is `(0,1,1)` and a tie goes to the later sheet. **Two declarations in one
rule, one winning and one losing, is normal and is invisible in the source.**
✅ **MATCH THE COMPONENT'S WEIGHT, NEVER OUTRUN IT.** `.pos-field.fau-src
textarea` is a tie, which is the smallest thing that can win. This stylesheet
already records `.pos-faux` needing `(0,2,0)` to beat a page; outrunning your own
stylesheet is how the next fight starts one step higher.
⚠️ **ALWAYS READ BACK THE COMPUTED VALUE OF THE PROPERTY YOU SET.** Not the
element, not the rule. The property.

🔴 **4. AIR INSIDE A BOX BELONGS TO THE BOX.** Asked for *"padding on top"*, I
put it on the wrapper, which also carried a background. The page then drew the
case, a seam, **a second band of the same dark**, then the well: two bands of one
colour with a line between them, reported as *"its a mess"*. Padding on a
container with its own background is a STRIPE, not air. Put it on the thing the
reader is looking at, and let the container carry no background at all.

🔴 **5. A PAGE-LOCAL REPAIR TO A SHARED COMPONENT IS HOW A DEFECT GETS PAID FOR
TWICE.** `shell.css` already records this about the nameplate: `/tom/` fixed the
plate's top padding privately, *"every page after it inherited the defect and not
the fix"*, and it was re-reported on `/plai/` as *"you failed afain on nameplate
padding"*. On 2026-09-24 I wrote an empty-strip rule page-locally with a comment
arguing that a component rule would change every instrument page, and deleted it
an hour later. **The argument was wrong because a CONDITION can make a component
rule provably narrow**: `:has(> .panel-strip:empty)` matches only a case with
nothing in its strip, and MEASURED across the three pages that build one, `/kit/`
adds 62 blocks, `/fau/` 5 and `/muta/` 4, so exactly one case in the repository
was empty and exactly one page changed.
⚠️ **AND THEN RE-RUN THE OTHER PAGES.** `/muta/` came back 51/51 with 45 page
asserts, unchanged, which is the only thing that makes "provably narrow" a fact
rather than an argument.

⚠️ **AND A BOX SIZED TO THE CONTENT IT USED TO HOLD HIDES THE CONTENT IT HOLDS
NOW.** The Faust presets grew comments and `rows: 12` cut the longest one through
the middle of `process`, which is the one line a reader most needs. MEASURED: the
four are 14, 16, 6 and 13 lines, so `rows: 16` is the longest of them rather than
a number that looked about right.

## Full screen, CSS and touch

- **iPhone Safari has NO element Fullscreen API.** Not `requestFullscreen`,
  not `webkitRequestFullscreen` — the only thing that fills an iPhone screen is
  a `<video>`, via the non-standard `HTMLVideoElement.webkitEnterFullscreen()`.
  iPad is different (iPadOS carries the prefixed element API), so **"iOS" is the
  wrong unit** and the capability has to be asked, not branched on by platform.
  `mirror`'s ⛶ did nothing at all on an iPhone because `p.requestFullscreen?.()`
  **optional-chains straight past a missing method**: no throw, no `catch`, no
  log line, no picture — optional chaining is an excellent way to build a
  control that looks live and is inert. `demo/shell/fullscreen.mjs` tries the
  real API, falls back to a `position:fixed` cover that needs no API, and says
  which ran. ⚠️ **Style it with a CLASS, never `:fullscreen`** — a browser that
  does not know that pseudo-class discards the entire selector list it appears
  in, so `.pane:fullscreen, .pane.pos-full { … }` would delete the fallback on
  precisely the browsers that need it. And the utility needs (0,2,0): MEASURED,
  a bare `.pos-faux` lost to a page's own `.pane { position: relative }` on source
  order and the cover stayed 338px wide inside its grid.
- 🔴 **A MEDIA QUERY ADDS NO SPECIFICITY, SO A LATER PLAIN RULE BEATS IT AT
  EVERY WIDTH. MEASURED 2026-09-19, AND THE RULE IT KILLED HAD NEVER RUN.**
  `.pos-pick`'s entire phone layout sat in `@media (max-width: 560px)` at
  `shell.css:1589`, and the plain `.pos-pick { display: inline-flex; height:
  34px }` sat at line 2052. Same specificity, later in the file, so the plain
  one won at 390 px as well as at 1280, and the picker had NEVER collapsed on a
  phone in its life.
  ⚠️ **IT WAS FOUND BY PUTTING TWO CONTROLS SIDE BY SIDE AND MEASURING BOTH.**
  At 390 px the three choices went label on top at x=16 while `LOOK`'s segment
  started at x=53, after an inline label. One of them obeyed the stylesheet and
  one did not, which is visible in a screenshot and invisible in the source,
  because the source says exactly what the author meant.
  ⚠️ **THE FIX IS ORDER, NOT WEIGHT**: the media block moves after the section
  it overrides. Raising specificity to win a fight with your own stylesheet is
  how `.pos-faux` ended up needing `(0,2,0)`, and that one at least had a page's
  rule to beat.
  🔴 **AND A DEAD CSS RULE IS THE SECOND MOST EXPENSIVE KIND OF DEFECT HERE**,
  after a dead JavaScript guard, for the same reason: it reads as done. Three
  now, all measured rather than reviewed: this, `.pos-log { margin-top }` which
  was inert for as long as it existed, and `if (fullSupport() === 'none')` on
  `/weight/`, a branch comparing against a string that function never returns.
  **Point a browser at it and measure the COMPUTED value**, which is the only
  thing that knows which rule won.
  🔴 **FOURTH, 2026-09-19, AND IT IS THE ONE A SELECTOR CANNOT WIN: AN INLINE
  STYLE BEATS EVERY STYLESHEET.** `shell.css` has carried
  `.pos-vp[data-full] .pos-vp-stage { aspect-ratio: auto }` since full screen
  was built. `createVideoPanel` later gained an `aspect` option for `/stage/`'s
  film, written as `stage.style.aspectRatio = aspect`, so a panel given a shape
  could never give it up. `/making/`'s 1:1 picture box stayed square on a 16:9
  screen, its picture sat high, and `.pos-fsx` is `position: absolute` INSIDE
  that stage, so **the way out of full screen rode up there with it**. Reported
  as two separate faults because that is how it looks.
  ✅ **A COMPONENT THAT VARIES A PROPERTY PER INSTANCE SETS A CUSTOM PROPERTY,
  NEVER THE PROPERTY.** `stage.style.setProperty('--vp-aspect', aspect)` and
  `aspect-ratio: var(--vp-aspect, 16 / 9)`: per instance, and still reachable by
  a rule. Writing `el.style.x` from a component is writing a rule nothing can
  override, including the component's own stylesheet.

- 🔴 **`[data-thing]` MATCHES AN EMPTY ATTRIBUTE, SO CLEAR IT BY DELETING.**
  MEASURED 2026-09-19 in `video-panel.mjs`, which did `root.dataset.full = full
  ? fullMode : ''`. Every full screen rule is written `.pos-vp[data-full] …`,
  and an attribute selector matches on PRESENCE, so a panel that had been full
  **once** kept `border: 0`, `background: #000` and a stage with no aspect ratio
  for the rest of the page's life.
  ⚠️ **IT SURVIVED BECAUSE ENTERING IS WHAT GETS TESTED.** Every check anybody
  writes about a mode is about going INTO it; the state that is wrong is the one
  after coming back, and it reads as a design choice rather than a fault. Found
  by an assert that the panel took its own shape back, written for another
  reason. `delete el.dataset.x`, never `= ''`.
- **A long press on a control raises the iOS text LOUPE, and `user-select:
  none` does not stop it.** `-webkit-touch-callout: none` is the one that does.
  Photographed on `/keys/` and `/mirror/`: the magnifier over the piano keys and
  selection handles dragged across a readout. Controls and keys now carry it
  along with `touch-action: manipulation`, which also drops the 300 ms
  double-tap wait so a key sounds when it is pressed. Prose, readouts and the
  log stay selectable — copying a number out of those is a real thing to want.
  ⚠️ **AND A `<canvas>` IS NOT A CONTROL, WHICH IS HOW IT WAS MISSED FOR
  MONTHS.** The rule above was written on `button` and nothing covered the
  picture. PHOTOGRAPHED 2026-09-19 on `/blocks/`: the 3-D scene wearing a blue
  selection overlay with both iOS drag handles, one of them hanging below the
  canvas into the log. Instructed as *"3d scene nonselectable"*, and it is
  global rather than per page, because a canvas here is always a picture and
  nobody has ever wanted to select one. **The selection suppression is global,
  `touch-action` is NOT**: a canvas you drag to look around wants it off, and a
  canvas inside a page you scroll must not eat the scroll.

## The readout

- 🔴 **A READOUT HAS AN EVEN NUMBER OF CELLS, AND AN ODD ONE IS CUT, NEVER
  PADDED.** ⚠️ **THE REASON GIVEN HERE WAS WRONG AND THE RULE SURVIVES ANYWAY.**
  It used to say the row is `repeat(auto-fit, minmax(96px, 1fr))`, so a phone
  gets two columns and an odd count leaves a HOLE in the last row. MEASURED on a
  real page 2026-09-13: 96 px plus a 1 px gap gives **three** columns from about
  353 px of content upward, which is every phone anyone owns — so a **4-cell**
  readout holed from 353 to 426 px (iPhone SE 375, iPhone 12–15 **390**, Pixel
  412) and a **6-cell** one holed from 427 to 620, four slots wide at 560. An
  even count guaranteed nothing above two columns, and four-cell readouts had
  been holing on the commonest screen there is. The row is **flex** now, so the
  last row's cells GROW to fill it at every width and every count — verified at
  thirteen widths, both counts, all filling.
  So the even rule is now **editorial, not structural**: an odd readout always
  has a weakest cell, and being made to find it is the point. `mount()` still
  throws. The hole it used to describe is gone. A blank filler is the wrong repair: it adds a
  thing to look at that says nothing. Trimming is the right one, because an odd
  readout always has a weakest cell — usually a constant (`llhls`' `target`,
  `rack`'s 50/s `rate`, `moq`'s `version`) or something a neighbour already
  implies (`wire`'s `round trip` beside its `delivery`). Twelve pages were odd
  when this landed and every one got better. `mount()` THROWS on an odd count.
- **Nothing unmeasured prints as `0`, and never as a lone unit.** `''`, `null`
  and `NaN` all become an EMPTY cell with the unit hidden.
  ⚠️ **THIS SAID "ONE EM DASH" UNTIL 2026-09-18 AND THE CODE HAS SAID OTHERWISE
  SINCE 2026-09-13.** `setCell` renders `''`. The placeholder WAS an em dash and
  was removed on the reasoning written beside it: a cell does not have to show
  that it is a cell, because the key above it and the box around it already say
  so, and four dashes in a row read as four failed readings rather than four
  cells waiting. Two copies of the old wording survive in `/kit/`. An empty string used to
  empty the cell and leave the unit standing alone — a `%` with no number in
  front of it, which reads as a value that went missing — and a page that
  pre-sets a counter to 0 is worse, because a zero reads as a very confident
  measurement of nothing.

## A patch name is shown as it was written

🔴 **PATCHES ARE ALWAYS SENTENCE CASED.** Instructed 2026-09-26: *"patches are
always sentence cased"*. A patch is the name somebody gave a sound, and it is
printed the way they wrote it: `Organ`, `Rhodes Mk I`, `Spring reverb`. Never
`ORGAN`, never `organ`. That holds in a picker, in a log line, in a readout
cell and on a plate.
⚠️ **THE PLATE IS WHERE IT WAS BEING BROKEN, BY A RULE THAT WAS RIGHT ABOUT
SOMETHING ELSE.** `.panel-plate-l` is uppercase because *"replica names always
in uppercase"* was asked for, so a maker and a model read as one shelf across
`/tom/`, `/twelve/`, `/circuit/` and `/evo/`. A patch is not a maker. Until
2026-09-26 `createInstrumentPanel` handed its patch text to the same line
class, so the kit's own specimen typed `RHODES MK I` to look right. The panel
now marks its patch line `panel-plate-patch` and `shell.css` sets its transform
back to none, at the same weight as the uppercase rule and after it, so it
reaches every plate that has a patch line and nothing else. The kit asserts it
off `shown()`, which reads the rendered transform rather than the source.
⚠️ **AND IT IS WRITTEN SENTENCE CASE AT THE SOURCE TOO.** A rule that only
un-shouts a string somebody typed in capitals leaves the capitals in the data;
the kit's specimens and any page's preset list carry the name as it should
print.

🔴 **AND ON AN INSTRUMENT PANEL THE PATCH SELECTOR CARRIES NO LABEL AND SITS
AT THE RIGHT END OF THE PLATE ROW, BY DEFAULT.** Instructed 2026-09-26: *"make
rule for instumet panel that patch selector have no label and is in right. do
it in fau"*. MEASURED before: `/fau/` handed its picker to
`createInstrumentPanel` as `status`, so it sat beside the name at the START
wearing a `PATCH` caption while a Compile button held the far end, and nothing
refused it, because the option shape read as correct on the page that had it
backwards. The component does both halves now so no page has to remember:
`patch` is the only slot a selector goes in and it is the far end by
construction, a `.pos-pick` handed in as `status` THROWS, and a `.pos-pick-l`
caption on the patch control is REMOVED from the DOM rather than hidden, because
a plate reading `NAME   ‹ Organ ›` already says what the control is and a word
between them names what the reader is reading. The `<select>` keeps its own
`aria-label`, so the name a screen reader hears is untouched.
`instrument-panel-test.mjs` grades the order and the strip with no browser
(21 to 26 ok); `/kit/`'s foot specimen and `/fau/` grade the rendered offsets,
picker right edge on the row's inset and no caption under it, and `/fau/`
grades that Compile is not in the foot.
⚠️ **AND `pos-sm` IS THE SMALL BUTTON THE SAME ASK NAMED.** *"rm compile from
footer, put it absolutely to bottom right corner of textarea, small button
variant"*. The kit had none; `/wish/`'s remove button was waiting for one. It
is `--ctl-sm` tall, which is 26 and was typed in four places (`.kpad`, the
small toggle, a stacked checkbox row, the feedback button) with no name between
them until it was declared once at `:root`, and half a pill's `--pad-btn` of
air rather than a fourth padding figure. It is shown at the top of `/kit/`'s
BUTTON GROUP block (in `/kit/input/` since the 2026-10-06 split) as a word, a primary and a glyph square, and `/fau/`'s
Compile wears it, positioned by the field and inset by the rows' own tokens.

## /kit/ itself

🔴 **THE NEWEST COMPONENT GOES AT THE TOP OF `/kit/`, AND ITS HEADING IS
UPPERCASE.** Instructed 2026-09-16: *"in kit move online stuff to topmost item
(all new should land top, make rule)"* and *"always uppercase"*. That page is
read by somebody checking what the kit has, and what they do not know about is
what arrived since they last looked; appending put the newest thing at the
bottom of a long scroll, behind everything they already knew. The front page
settled the same question the same way. `.kit-h` renders a heading uppercase
whatever is typed, so type it uppercase and the source reads like the page.
⚠️ **A BLOCK THAT MOVES TAKES WHAT IT NEEDS WITH IT.** Moving one to the top
left its `const` behind, so the build read it in its dead zone, `section()`
swallowed the throw into `failed`, and the page died much later on an empty map
with a message about a different line. The page reported `this block did not
build` to a reader before the suite did.

✅ **`/kit/` IS MACHINE-GRADED NOW, AND THIS LINE SAID OTHERWISE FOR WEEKS.**
It used to say the page carried no `mount()` and no asserts, so the one page
whose whole job is to make component drift visible was the one page the suite
could not see, and anything demonstrated there had to be measured another way.
`node demo/verify.mjs kit` is **22/22** with 15 page asserts, and they are the
kind only that page can make: a badge measuring the same width in all four of
its states (spread 0.02 px), an animation that touches opacity and nothing that
could move a neighbour, two greys told apart by ink rather than hue, an
embedded dot laying out 8.0 px and still saying its state in words.
⚠️ **THAT COUNT IS FROM BEFORE THE KIT WAS SPLIT, NOTED 2026-10-14.** Since
2026-10-06 `/kit/` is an index of parts and each part is its own manifest row
(`kit/input`, `kit/layout`, `kit/slides` and so on, all `unlisted`), so the
asserts quoted here live in those parts now (the closed tab drill is in
`demo/kit/layout/index.html`). Not re-counted: this rewrite ran no browser.
Run `node demo/verify.mjs kit kit/layout` for today's numbers.
⚠️ **THE LESSON IS ABOUT THIS FILE RATHER THAN ABOUT THE PAGE.** A rule that
tells an author their work cannot be graded is a rule that stops them trying,
and this one outlived its own truth. A claim here about what a harness can do
is checkable in one command, so check it before repeating it.

## The shell, the build and what a demo requires

- Shared demo code goes in `demo/shell/`, which `build.mjs` **enumerates**. It
  also refuses the build when an import has no deployed file, and when two
  sources collide on one destination. **It scans modules, not just pages** — it
  read HTML only until 2026-09-07, and in that gap `demo/shell/moq.mjs` kept
  importing `/08-moq/moq-vendor.js` across the slug rename: a 404 that killed
  the module, so `moq` and `ladder` asserted NOTHING and read red for a reason
  that was true but not theirs (no relay on this network). **A rename moves
  URLs that live in modules, harnesses and comments, none of which are
  type-checked — grep the OLD form everywhere.** The same rename left
  `verify-native.mjs` pointed at a 404, which is the iPhone path. (That script
  drove `/llhls/`, whose input was deleted 2026-10-13, and now refuses with exit
  2; the lesson about renames stands.)
- **What a demo REQUIRES is read off its `tags`, never listed twice.**
  `demo/shell/caps.mjs` maps a tag to a capability (`WebGL2` -> `webgl2`,
  `getUserMedia` -> `camera`), probes this browser once, and un-links rows the
  browser cannot run **with the reason in words** — a vanished row says the
  demo does not exist, which is a different and false statement. Three rules
  the file exists to hold: it is a **capability test, never a user-agent
  check** (a headset browser is Chromium, and research/quest-xr §1.7 measured
  that a Quest 3 and a 3S are indistinguishable by UA); a probe that could not
  answer returns **`unknown`, which never blocks**, because "we did not look"
  must not read as "it is missing"; and `midi` is deliberately soft, since
  `instrument` keeps playing from its on-screen keys. Proved by breaking it:
  the same page under `--disable-gpu` un-links `mirror` with *"this browser
  draws no 3-D"* and links it with the GPU on.

## The test picture

- **The generated test picture is `demo/shell/pattern.mjs` and nothing else.**
  Six demos draw it and `src/publish.sh` generates its ffmpeg filter by calling
  it; `workers/pub/container/server.mjs` holds a marked copy because that image
  is one `COPY` with nothing to import — change one, change the other, and diff
  the y/size/colour table afterwards. **After ANY move of `ROW`, re-run burn →
  `readBurned`** (600/600 exact through three moves); it is the only thing
  between a layout tweak and a stream nothing can read. The field is NEVER
  tinted — a warm hue at low saturation and low lightness is mud at any alpha —
  so colour lives in the labels, the sweep square and the strip lane, inside a
  100° band on `--hi`. One `PAD` off every edge. A camera is CONTAINED, never
  covered or stretched: iOS ignores a resolution request and returns portrait,
  where stretching squashes a face and cover shows 32% of the frame.
  ⚠️ **NOTED 2026-10-14: THE PUBLISHED HALF IS RETIRED, THE DRAWN HALF IS NOT.**
  The Stream input `src/publish.sh` fed (`positron-demo`, /llhls/'s test
  pattern) was deleted 2026-10-13, and HANDOFF says pub's container still
  carries the copy as dead publish code, so "change the other" now only
  matters if that code is revived. The picture itself is live: checked with
  `grep -rl pattern.mjs demo | grep -v archive`, it is drawn by
  `/video/camera/`, `/video/shader/`, `/video/recorder/`, `/video/moq/`,
  `/drums/camera/` and `demo/video/loopback.mjs`, and `readBurned` is read back
  by the loopback pages, so the burn to `readBurned` check still guards a
  stream.
  ⚠️ **AND A FILM IS NOT A CAMERA: `drawCamera` TAKES `fit: 'cover'` SINCE
  2026-09-18**, asked for on `/stage/` as *"make 4:3 video win and crop"*. The
  rule above is unchanged and is still the DEFAULT; what it is about is a
  subject somebody framed and a shape the page does not control, and neither is
  true of a film composed to fill its own frame. The arithmetic said the same:
  a camera at 720x1280 into 1280x720 keeps 32%, the 4:3 film that bought this
  option kept **75%**, and contain was laying 160 px of flat field down each
  side of it. **`scrim` is a second option and defaults to the same 0.55**: it
  exists so a burned clock stays readable on top, so a caller that draws nothing
  on top passes 0 rather than dimming its own picture by more than half for
  furniture that is not there. `/stage/` is the only caller of either; the five
  camera pages take the defaults and read 82/82 unchanged.
  ⚠️ **THE 4:3 FILM IS GONE SINCE 2026-09-19 AND THE RULE IS NOT.** That page
  plays a 1280x720 MIMproject recording in a 1280x720 box now (*"video win to
  16:9"*), where `cover` and `contain` agree to the pixel, so the one live
  caller no longer demonstrates the option it asked for. It still passes
  `cover`, for the reason above and because `?bg=` can point it at a corpus row
  that is 4:3 or 480x272. **The numbers above are kept as the measurement that
  bought the option, not as a description of what is on screen.** This entry
  said `a 4:3 film keeps 75%` in the present tense for as long as that was
  true, which is how a confident sentence outlives the thing it describes.

## The transport bar

- 🔴 **AND A PAGE NEVER RE-PUBLISHES `__demo.transport`, BECAUSE THE BAR
  ALREADY DID AND THE RETURN VALUE IS NOT THE SAME OBJECT.**
  `transport-bar.mjs` publishes its internal `api`; `createTransportBar` returns
  a WRAPPER around that api. A page that assigns the return value over the top
  hands the harness an object with no `position`, and `demo/verify.mjs` dies on
  `t0.pos.toFixed` while the page itself looks perfect. Found 2026-09-19 on
  `/making/`. The two objects being different is deliberate and is not the
  defect; assuming they are the same is.
  **The exact shape, so nobody has to re-derive it**: `createTransportBar`
  returns `{ el, api, endStop, commanded, extra, loopExtra, slot, note, destroy
  }`, and `publish: true` writes `api` to `__demo.transport`. `verify.mjs` reads
  `__demo.transport.position` and `__demo.transport.el`, and both live on `api`.
  ⚠️ **THE SYMPTOM IS THE WORST KIND**: the harness THROWS inside its own drill
  rather than failing an assert, so the output names the harness and not the
  page, and nothing in the per-page count moves to point at what changed.
- 🔴 **A PAGE WITH TWO BARS MUST SAY WHICH ONE IS ITS TRANSPORT: `publish:
  false`.** `__demo.transport` is the only handle a CDP check has, and every bar
  claimed it unconditionally, so it was whichever bar was BUILT LAST, which is a
  fact about source order rather than a statement about the page. `/stage/` grew
  a second on 2026-09-18 (a live show in the control room, a recording in the
  archive) and the wrong one won by being further down the file.
  ⚠️ **AND THE DRILL PRESSED A DIFFERENT BAR FROM THE ONE IT GRADED.**
  `verify.mjs` clicked `document.querySelector(".tbar-toggle")` while every
  assert around it read `__demo.transport`: the same element only while a page
  has exactly one bar. DOM order and build order are routinely different on a
  tabbed page. It presses `__demo.transport.el`'s own toggle now, and `el` was
  added to the api object for it, which the file's own comment already demanded:
  a control reachable from the return value and not from `api` is a control the
  harness cannot press.
- Transport UI is `demo/shell/transport-bar.mjs` and nothing else. Playhead from
  `observePosition`, seek only via `deck.seek()`, rates from intersected
  `caps.rates`.
- **One meaning for colour across every demo.** A mark's colour says HOW IT
  LANDED, never which lane it is in — lane identity is the row, the label and
  the gutter swatch, three channels that already carry it. Grey = not played,
  slate = played and this lane cannot say how well, green = inside what its way
  of firing promises, amber/red = later. "Played, unmeasured" gets its own
  colour rather than borrowing green: colouring an unchecked thing as if it
  passed is an assertion nothing made.

## A slide is `slide.mjs`, and `/slides/` is an archive

✅ **ONE SLIDE FROM PLAIN DATA IS `createSlide(spec)` IN `demo/shell/slide.mjs`,
2026-10-05**, with `slide.css` beside it and a small `createSlidePlayer(specs)`
that puts several in a video panel. The six step type scale lives in `SCALE`
in that module and nowhere else; `/kit/`'s SLIDES tab (`/kit/slides/` since 2026-10-06) shows every step, every
combination, five layouts and the kit's controls at slide scale, and grades
them (`plans/plan-slides.md` section 13). Do not import `demo/slides/deck.mjs`
into anything new: it is the archive's.
⚠️ **THE PLAYER'S KEYS ARE ITS PANEL'S, NEVER `window`'S**, and a key it uses
is stopped there, because a page with a transport bar or a keyboard row would
otherwise step slides and seek a deck on one press.
⚠️ **A px CONTROL ON A SLIDE GOES IN `fitBox`**, a logical width scaled by
`--fit-k`; a component that already reads its size from CSS (a wave view's
`--wave-h`, a video panel's width) is sized in the slide's own `cqh` instead.

## A tabbed page: one old page per tab

🔴 **A PAGE MADE OF SEVERAL OLD PAGES IS `createTabPage`, AND EACH TAB IS A
MODULE.** Asked 2026-10-04 as *"Too many of thise demos, those old halfbroken
but useful… peopose a new structure"* and decided the same day as *"names ok,
looper retires, no redrect, capture is fine"*: twenty demos become tabs of
`/sync/`, `/time/`, `/wire/` and `/capture/` (`plans/plan-demo-structure.md`
§3, §5 step 1). The old page's body moves to
`demo/<page>/<tab>.mjs`, exporting `readout` and `build({ panel, report,
assert, log, set })`, which returns `{ show, hide, check({ A }), bars: [{
name, bar, strip }] }`. `demo/shell/tab-page.mjs` does the rest, and `/kit/`'s
TAB PAGE block (`/kit/layout/` since 2026-10-06) is the specimen.
⚠️ **ALL FOUR OF THOSE PAGES ARE ARCHIVED NOW, STILL SERVED.** `/sync/`,
`/time/`, `/wire/` and `/capture/` went to the archive listing on 2026-10-12
and 2026-10-13 (`DEMO_CARDS` comments in `demo/shell/concept-list.mjs`). The
component is live and the rules below hold for any page that uses it; checked
2026-10-14, `createTabPage` is called by `/kit/layout/`, `/stage/`,
`/partitur/` and those four, and by no concept page.
- **Nothing is built for a tab nobody opened.** `build` runs on the tab's first
  showing, and `build` itself opens nothing: a relay join, a fetch or a media
  element waits for the first press in its own tab. The check pass asserts that
  only the open tab was built before it ran.
- **Each tab has its own report** (`createReport`), under its own blocks. The
  page mounts with `readout: null, showLog: false`.
- **Checks run once, from `if (SELFCHECK) await page.check(); d.ready();`.**
  The pass OPENS each tab to check it, because a closed panel has no width and
  takes no key; nobody is watching under `?selfcheck=1`. Before `ready`, never
  after, or it races the harness's own drill.
- **A tab's controls never go in `.pos-controls`.** The harness presses that row
  by position across the document, blind to tabs.
- **The hash selects the tab** (`/sync/#arrival`); `hash: false` only inside a
  page that owns its own hash.

🔴 **EVERY BAR BUT THE PUBLISHED ONE GETS THE HARNESS'S DRILL AS PAGE ASSERTS.**
`verify.mjs` drills `__demo.transport` only, so a bar with `publish: false`
was a bar nobody pressed. A tab lists its bars in `bars` and the check pass
runs `assertBar` from `demo/shell/bar-drill.mjs` on each: has a position, rate
lattice, play advances, pause holds, keyboard seek, and strip has ink when a
`strip` canvas is given. ⚠️ **IT IS THE HARNESS'S OWN DRILL, NUMBER FOR
NUMBER**, and `node demo/shell/bar-drill-test.mjs` reads `verify.mjs` and goes
red when the two disagree. Change both. ⚠️ **AND IT CAN FAIL**: `/kit/` drills
a bar whose clock never moves and requires exactly `play advances position`
to go red.

🔴 **A KEY BELONGS TO ONE BAR NOW, SAME DAY.** `transport-bar.mjs` listens on
`window`, so every bar took every key and a space on one tab started decks on
the others. A key whose target is inside a bar goes to that bar only, and a bar
inside a hidden `[data-own-keys]` panel (every `createTabPage` panel) hears
nothing. A key from the body still reaches every other bar, which is what the
harness sends; `verify.mjs` presses the published bar's tab before its seek
when that bar sits in a closed `data-own-keys` panel. MEASURED: taking the
closed-tab line out turns `/kit/`'s *"a key from the page does not reach a bar
in a closed tab"* red (294/294 to 293/294, 30000 -> 0) and nothing else.

## Two faces: the mono names, Geist reads

🔴 **THE SITE IS SET IN TWO FAMILIES SINCE 2026-10-12, AND A PAGE ADDS NO
THIRD.** Decided as *"A is fine. Impelent font update everywhere"*, spec in
`plans/plan-fonts-minimal.md`, shown live on `/kit/frontpage/` (THE RULE, IN
USE; that part moved to the archive listing 2026-10-13 and is still served).

- **`var(--mono)` is JetBrains Mono, for everything that NAMES**: page and card
  titles, headings, eyebrows, buttons and every control, readout cells and
  keys, logs, tables, key labels, slide headlines. `--brand` is an alias of it.
- **`var(--sans)` is Geist, for everything READ THROUGH**: body text, the line
  under a title (`.pos-what`, `.pos-tabs-about-t`), card descriptions, kit notes
  (`.kit-n`), a slide's body.
- Both are self hosted under `demo/shell/vendor/`, 400 and 600, Latin subset,
  declared once in `shell.css`. **Write the token, never a stack**: a typed
  `ui-sans-serif, ...` or `ui-monospace, ...` is the system face and not the
  site's. A canvas cannot read `var()`, so it reads the token's computed value
  (see *Drawing* below). Weight 400 or 600 only; there is no variable file, and
  CSS font matching draws a 500 with the 400 file, so buttons read at 400.
- Arrow ligatures are off site wide (`html { font-variant-ligatures:
  no-contextual }`), so `->` in a log reads as the two characters typed.
- Titles, the line under them, section headings and card text take
  `text-wrap: balance`.
- The only other faces: the JetBrains Mono Greek 600 subset (the logo's β,
  fetched only when a β is laid out) and Gabarito on `/weight/`, which is that
  artwork's material. The archived `/slides/` deck has one face, the same mono.
- 🔴 **A SHARP ON A KEY IS `#`, NOT `♯`.** Neither vendored face carries
  U+266F, so `♯` falls back glyph by glyph to whatever system face has it and
  sits off the line differently on every platform. `#` in the mono sits on the
  line by construction and matches `chords.mjs`, which was always ASCII. The
  2026-09-23 choice of `♯` drawn in a Bravura subset was reversed on
  *"no bravura needed i hope. can we do without?"*; the reasoning is at
  `keyboard.mjs` `NOTE_NAMES`.

## Lanes and colour

- **A number belongs to the lane that can answer for it.** Report each lane's
  error against the score, not against another lane; every pairwise gap is a
  subtraction away. Give every lane a row even when it has nothing to say, and
  let it say so in words — a blank cell collapses "we did not look" and "we
  looked and it was fine". Never let a lane with no feedback count as 0 in an
  aggregate: it must not be able to improve the score.

## Components, layout and the words on the page

- 🔴 **A COMPONENT SWAP MOVES EVERY SELECTOR THAT NAMED THE OLD ONE.**
  `/archive/radio/`'s sound row went `createChoice` -> `createPicker` and one of the
  three rules keyed on the old class was updated. `shareLabelColumn()` went on
  setting `--lab` on exactly the right element and **nothing consumed it**, so
  the JavaScript and the comment beside it both read as correct while the row
  snapped back to the width of one word. REPORTED THREE TIMES, and the third
  report was a different bug wearing the first one's clothes. There is an assert
  on the left edges now and it fired at `12 px apart` before it passed.
  ⚠️ Its other half: a `12` typed in `shell.css` and a `0` typed in the page —
  **a shared measurement in two files is a measurement that will disagree**. It
  is `--sld-col` now.
- 🔴 **THE LOOPER IS A KIT MODULE, AND BOTH PAGES WITH A LOOP USE IT.**
  (Both pages, the radio demo now at `/archive/radio/` and `/tapes/`, were
  archived 2026-10-13 and are still served. The module is live: checked
  2026-10-14, `looper.mjs` is imported by `/tom/`, `/tapes/`, `/pack/` and kit
  modules. `/code/piano/`'s MIDI looper is a different thing that shares the
  word.)
  `demo/shell/looper.mjs`, 2026-09-16, asked for as *"make it use same looping
  ui as radio (make it global)"*. It owns what a loop IS: the ring that keeps
  the sound, the kept buffer, the mirrored copy, the one voice that reads a lap,
  where the sound has got to inside it, and the button glued to LOOP that
  cycles → ← ⇆. A page owns what else happens on its own graph, which node stops
  being heard, and what its log calls the thing it is looping.
  ⚠️ **THE TWO PAGES REACH IT AT DIFFERENT MOMENTS AND BOTH ARE RIGHT.** On a
  live station the sound has not arrived yet, so `keep()` is the bar's `fill`
  and `close()` is its `set`. On a tape both marks are behind you and the bar
  loops the file itself, so `keep()` is `set` and `close()` is the FIRST `wrap`:
  the first lap comes off the tape while the ring fills, and every lap after it
  comes off the ring. That is what makes a direction possible at all, because
  **no media element has a negative playback rate** and a kept lap is an
  `AudioBuffer` that can simply be mirrored.
  ⚠️ **ITS ARITHMETIC IS PURE AND IS GRADED WITHOUT A BROWSER.** `ringOrder`,
  `planVoice` and `headOf` are where every bug it has ever had lived (a ring
  copied from index 0 after it wrapped; a voice that always began at the top; a
  pingpong head that was a ramp and sat at the right edge for the whole return).
  `node demo/shell/looper-test.mjs` is 18 asserts, four of them negative
  controls, and three deliberate sabotages take 7 of them red.
- 🔴 **A DURATION IS A FACT ABOUT A FILE, MEASURED ONCE AND WRITTEN DOWN.**
  `corpus.json` carries `durationMs` on all 26 time-based rows since
  2026-09-16. `demo/resources/measure-durations.mjs` asks each file once with
  ffprobe, one at a time, two seconds apart, at `-probesize 65536` (a header,
  not half a recording), and writes `demo/resources/durations.json`;
  `build-corpus.mjs` merges it. `/tapes/` used to open twenty-four media
  elements on every visit and correct its picture over the following seconds,
  so every visitor paid archive.org for the same answers and saw a run of the
  wrong length first. ⚠️ **AMEND THE CORPUS WITH `--offline`**: it rebuilds from
  the cache, asks no source anything, and was MEASURED byte for byte identical
  to the committed file apart from its timestamp.
- 🔴 **A TABLE IS NAVIGABLE FROM THE KEYBOARD, AND AN ARROW MOVES RATHER THAN
  OPENS.** `table.mjs`, 2026-09-19, asked for as *"allow keyboard nav in
  tables"*: arrows, Page Up and Down, Home and End, Enter to open.
  🔴 **THE OBVIOUS SHAPE WOULD HAVE BEEN A DEFECT ON THE PAGE THAT ASKED FOR
  IT.** An arrow that moved the SELECTION, the way a file browser does, calls
  `onPick` per row, and `/making/`'s `onPick` fetches a picture off the bucket,
  so a held-down arrow pulls 63 files nobody asked to see. That is the
  load-on-a-visit defect, already paid for three times, arriving through the
  keyboard. Moving focus is free; opening is a decision and gets its own key.
  ⚠️ **AND A LIST IS ONE TAB STOP, NOT ONE PER ROW.** Every row was
  `tabIndex = 0`, so tabbing past a 63-row table took sixty-three presses. A
  roving tabindex fixes it, is invisible in a screenshot, and is free to read
  off the DOM, so assert it, including the negative half: one row at 0 AND
  every other at -1.

- 🔴 **NO EMPTY TABLE HEADERS. A COLUMN NAME OVER NO ROWS LABELS AIR.**
  Instructed 2026-09-21: *"no empty table headers (add rule)"*. A heading is a
  promise that there is something under it to scan, and a heading over nothing
  is furniture that reads as a table which failed to load.
  ✅ **`table.mjs` ALREADY DOES IT AND THE RULE IS ABOUT EVERYTHING ELSE.**
  `blank()` sets `head.hidden = true` and `add()` clears it on the first row, so
  no caller has to remember. **The rule exists for the two ways round it**: a
  page that hand-rolls a grid instead of using the component, and a page that
  passes a non-empty `empty:` string, which puts a message under a hidden
  heading rather than a heading over nothing. Both are fine; neither is the
  default you get for free.
  ⚠️ **AND IT IS THE SAME RULE AS `AN EMPTY BOX IS A LINE`, ONE ELEMENT ALONG.**
  `/typist/` drew a 2 px band nobody wrote out of a childless `.pos-readout`,
  `.pos-controls[hidden]` exists because an empty control row left a 14 px band,
  and `drop.mjs`'s footer is `hidden` rather than empty for exactly this. **A
  container with nothing in it must not paint its edges, and a label with
  nothing under it must not paint its name.**
  ⚠️ **ASSERT IT WHERE YOU BUILD IT.** `/pack/` carries
  `an empty table draws no heading, because a column name over nothing labels
  air`, reading `.pos-tbl-head?.hidden === true`, and that assert is free.
  🔴 **AND READ THE BODY, NOT THE ELEMENT, WHEN YOU CHECK A ROW.** The heading
  IS a `.pos-tbl-row` — it is `pos-tbl-row pos-tbl-head` — and it comes first,
  so `table.el.querySelector('.pos-tbl-row')` returns the HEADING. MEASURED
  2026-09-21 on `/pack/`: an assert reading a row's `title` that way came back
  `""` and went red on a page doing exactly what it promises. `scroller()` is
  the body and is the thing to query. That is the third assert on that one page
  measuring something next to the quantity in question.

- 🔴 **A TABLE HEADING IS ONE LINE AND IT IS SHORT. IT NEVER WRAPS.**
  Instructed 2026-09-20: *"Tablw headings aingle line, make rule to keep it
  short"*, photographed on `/making/` with the `FILE` header rendered **one
  letter per line** down four rows while its cell sat empty beside it.
  🔴 **A WRAPPING HEADING IS NOT A TYPOGRAPHY PROBLEM, IT IS THE TABLE
  REPORTING THAT ITS COLUMNS DO NOT FIT** — and reporting it in the one place a
  reader cannot act on. `/making/` went from two fixed columns to six in one
  change, 232 px of fixed width to 476, and the single growing column was handed
  what was left. Nothing in the suite could catch it: the page reads 38/38 and
  the harness runs at desktop width.
  ⚠️ **SO THE HEADING IS `nowrap` AND THE LABEL IS BUDGETED.** A name that does
  not fit is the AUTHOR's problem, reported to the author the way `createDiagram`
  reports a label it had to cut, and never solved by wrapping it at the reader.
  Four or five characters is a heading: `when`, `file`, `via`, `size`, `length`.
  ⚠️ **AND A HEADING IS NOT A SENTENCE.** It names the column; the unit belongs
  in the cell, the explanation belongs in the hover. `uploaded` over a date
  column is right, `uploaded to the site` is a caption that happens to sit in a
  heading row.
  🔴 **THE OTHER HALF IS THAT SIX FIXED COLUMNS MAY SIMPLY NOT FIT A PHONE.**
  `.pos-tbl-row` carries `min-width: 560px` so a row scrolls rather than
  squeezes, and a row that has to be dragged sideways is already recorded here
  as a thing nobody reads. **Fewer columns beats a wider minimum**, and the
  columns to drop first are the ones somebody checks AFTER finding the row
  rather than the ones they scan down.

- **Two more kit components, both 2026-09-15.** `table.mjs` — rows in columns
  the caller declares (`key`, `label`, `width | grow`, `align`, `link`, `hi`,
  `clip`, `hover`); it THROWS unless exactly one column grows. `tabs.mjs` —
  uppercase, x-scrollable, no borders, `#links` rather than subpages (a subpage
  is a navigation: the audio stops, the service worker hands over, an installed
  web app flashes white). ⚠️ **`tabs.mjs` WAS IN NO PAGE AND IS NOW IN TWO**: `/making/`, which says in
  its own comment that it is the first shipped use, and `/stage/`. The line here
  said *"in `/kit/` and in NO page"* long after that stopped being true, and a
  research agent repeated it back on 2026-09-21 because this file said so.
(Re-counted 2026-10-14 with `grep -rl createTabs demo | grep -v archive`:
`/making/`, `/stage/`, `/shape/`, `/pack/`, `tab-page.mjs` and `/kit/layout/`,
and no concept page.) What
  is still true is why it was removed from `/items/`: three names on a page
  holding one list and one form is furniture. 🔴 **`min-width: 0` or a scrolling row
  drags the PAGE sideways instead of scrolling**: `overflow-x` cannot shrink a
  flex item below its content, and 390 px measured 141 px of page overflow.
- 🔴 **A LAYOUT CLAIM IS A MEASUREMENT, AND `/twelve/` WAS CORRECTED BY
  SCREENSHOT TWELVE TIMES IN ONE EVENING.** Every one was plausible reasoning
  that a rect would have refused. The pattern is worth more than any of them:
  **when somebody reports what they SEE, the cause is usually one layer
  under it**, and measuring first costs one throwaway assert.
  - *"less h padding on strip"*: the padding was ALREADY equal at 14 px both
    ways. MEASURED: strip 174.4 px, controls 102.0, **50.2 px of air each side
    of the knob**, because the HEADING was 146 px. Changing the padding would
    have moved 4 px of a 50 px gap and it would have been reported again.
  - *"bottom uneven"*: `padding-bottom: 4px` sat on the scroller and nowhere
    on the lane beside it. **A reservation that only one of two equal things
    makes is a reservation that breaks them.**
  - *"align content to bottom"*: `margin-top: auto` pushed ONE element down
    and left everything above it where it was, which is what it says and not
    what a reader sees.

- 🔴 **THREE ALIGNMENTS THAT LOOK LIKE ONE ARE THREE ASSERTS.** Lane top
  against the first button's top, lane bottom against the last button's
  bottom, and the two labels under them against each other. **Two of the three
  lined up while the third was 30 px out**, and later the boxes matched
  perfectly while the faders inside them were 17 px apart. Arithmetic in a
  comment is not evidence.
  ⚠️ **AND MEASURE THE WORKING SURFACE, NOT THE WRAPPER.** A pad returns its
  wrapper as `el` and exposes `button` separately. An assert reading `el`
  reported a button 17 px low while the button was exactly right.

- 🔴 **A COMPONENT'S INVISIBLE RESERVATIONS MUST BE PUBLISHED OR A CALLER WILL
  GET THEM WRONG.** The distance between two stacked pads is THREE things:
  this one's foot, the gap, and the next one's head, which is reserved even
  when empty. Counting two of them made a lane 115 px against the 145 it
  needed, and the error was exactly one reserved slot.
  ⚠️ **AND A CUSTOM PROPERTY INHERITS DOWNWARD, NEVER SIDEWAYS.** `--fdr-foot`
  declared on `.pos-fdr` was invisible to the button column BESIDE it, `var()`
  fell back silently, the margin was never applied, and the source read as
  correct. It belongs at `:root`.

- 🔴 **A COMPONENT WHOSE VISIBLE EXTENT EXCEEDS ITS INTERACTIVE ELEMENT HAS TO
  SAY SO TWICE.** A pad's labels are siblings of its button, so `:disabled`
  dims the button and cannot reach them: two disabled pads read as live
  because their names were at full strength. The wrapper carries the state as
  well. **The same boundary caused three separate bugs in one evening**, which
  makes it a shape rather than three slips.

- 🔴 **A DEAD SELECTOR READS AS CORRECT, AND RENAMING A CLASS IS HOW ONE IS
  BORN.** `.strip-body .pos-fdr` kept the old class name for one run after the
  row became `.pos-crow`, so `--fdr-lane-h` fell back to its default and a lane
  was 29 px short. **Caught in seconds because the alignment was asserted**,
  which is the fifth dead rule this project has measured and the FIRST one
  found by its own check rather than by somebody looking.

- 🔴 **A `const` SHADOWS ITS WHOLE BLOCK FROM THE TOP, AND SEVEN ASSERTS WENT
  SILENT ON IT.** A new check read an outer `lane` above an inner `const lane`
  declared later in the same block: temporal dead zone, the check threw, and
  the page reported **22/22 green** having previously been 29. **Asserts do not
  fail when they stop running. Only the COUNT says so.**

- ⚠️ **GLYPHS: PICK CHARACTERS WITH NO EMOJI FORM RATHER THAN ASKING FOR TEXT
  PRESENTATION.** `⏪ ⏩ ⏹ ⏯ ⏺` default to emoji and render full colour at the
  wrong size and baseline. Appending U+FE0E is honoured inconsistently, so it
  looks right on one machine and wrong on another. `◄ ► ■ ●` have no emoji
  form at all. ⚠️ `▶` U+25B6 DOES, despite being geometric; `►` U+25BA does
  not.

- 🔴 **A PHONE LAYOUT THIS PROJECT CANNOT GRADE MUST SAY SO.** `demo/verify.mjs`
  runs at 756 px with no viewport override, so **every assert on a page passes
  without ever entering its media query**. Checking the block is last in the
  style element answers the failure this repo actually measured, where
  `.pos-pick`'s phone layout sat above the plain rule that beat it and had
  never run in its life. **Ordering is not behaviour.** Say which claims are
  measured and which are read, or three green alignment asserts imply coverage
  they do not have.

- 🔴 **A HARDWARE CONTROL HAS A WORKING SURFACE AND FURNITURE, AND ONLY THE
  FURNITURE VARIES. `--ctl-head` AND `--ctl-foot` ARE THE CONTRACT.** A fader's
  working surface is its lane, a pad's is its button, a knob's is its dial.
  Above and below each sits text that belongs to the control and is INVISIBLE
  FROM OUTSIDE IT: a value readout, a reserved top label slot, a name
  underneath.
  🔴 **SO A ROW OF DIFFERENT CONTROLS CANNOT BE ALIGNED BY A CALLER, AND THREE
  SCREENSHOTS IN ONE EVENING PROVED IT.** `/twelve/` was reported with buttons a
  label too low, then with two labels ending on different lines, then with a
  lane starting 30 px below the button beside it. Every one was the page doing
  arithmetic about a component's insides.
  ✅ **ONE HEAD AND ONE FOOT FOR EVERY CONTROL, PUBLISHED IN `shell.css`**, and
  then `.pos-crow` is plain `flex-end` and the browser does it. A page that
  writes its own margin correction here is a page that breaks the moment a
  component gains a label, which is exactly what happened: `/twelve/` lifted its
  button column by a foot's height, which was right until the pads grew one.
  ⚠️ **A SLOT IS RESERVED EVEN WHEN EMPTY.** A pad with no top label still
  takes `--ctl-head`, or a grid whose downbeats are named has those pads
  sitting higher than the rest, which reads as a rendering fault rather than a
  labelling choice.
  ⚠️ **AND THE DISTANCE BETWEEN TWO STACKED CONTROLS IS THREE THINGS, NOT
  ONE**: this one's foot, the gap, and the next one's head. `--ctl-step` is all
  three. Counting two of them made a lane 115 px against the 145 it needed, and
  the error was exactly one reserved slot.
  🔴 **ASSERT THE ALIGNMENT, BECAUSE ARITHMETIC IN A COMMENT IS NOT EVIDENCE.**
  `/twelve/` grades three separate claims against real rects: lane top against
  the first button's top, lane bottom against the last button's bottom, and the
  two labels against each other. **Two of the three lined up while the third
  was 30 px out**, and a fourth run caught a dead selector in seconds when a
  renamed class left `--fdr-lane-h` falling back to its default. That is the
  fifth dead rule this project has measured and the FIRST one caught by its own
  check rather than by somebody looking.
  ⚠️ And measure the BUTTON, not the wrapper. A pad returns its wrapper as
  `el` and exposes `button` separately; an assert reading the wrapper reported
  a button 17 px low while the button was exactly right.

- 🔴 **BUILD FROM `/kit/`, AND SAY SO WHEN YOU CANNOT.** Before writing any new
  interface, look at what `demo/shell/` already has — slider, slider group,
  stepper, choice, keyboard, MIDI, transport bar, logger — and use it. Hand-
  rolling a control that exists is how three pages ended up with three different
  radio rows and two different slider stacks, and the cost is not only the
  duplication: `choice.mjs` and the slider group BOTH shipped emitting class
  names no stylesheet matched, which is a bug that only happens to a control
  nobody else uses. **If the thing you need is not in the kit, stop and ask** —
  whether to add it as a component, or to lift something a page already has and
  has not been componentised yet. Do not quietly build a fourth copy. A control
  that exists in one page and nowhere else is a component that has not been
  noticed yet, not a special case.
- 🔴 **THE RASPBERRY PI IS A KIT MODULE, AND BOTH PAGES THAT PLAY IT USE IT.**
  `demo/shell/board.mjs`, 2026-09-16, asked for as *"share code with knobs"*. It
  owns the socket, the reconnect, the presence, the 12-byte frame header, the
  conversion to float, the `pcm-playout` worklet, the cushion and its counters,
  and the check that a frame is the SHAPE the board publishes. A page owns which
  verbs it sends, what it does with a frame after the playout has it, and what
  its log calls things.
  ⚠️ **"BOTH PAGES" IS NOW EVERY REMOTE INSTRUMENT, NOTED 2026-10-14.** The two
  pages it was written for are gone (`/keys/` retired 2026-09-17, `/knobs/`
  archived to a 404 with Yoshimi 2026-10-13). Checked with `grep -rl board.mjs
  demo | grep -v archive`: `/remote/circuit/`, `/remote/collide/`,
  `/remote/piano/`, `/drums/remote/` and `/shader/remote/` import it, plus the
  archived `/away/` and `/shape/`. On those pages the Pi is a site (`pi-1`) and
  its instrument a node on the bay, so what `board.mjs` carries is the far end
  of a link the picture draws. The rule is unchanged: one module, and a page
  owns only its verbs and its words.
  ⚠️ **IT IS THE BETTER OF THE TWO HALVES, NEVER THE AVERAGE, AND THAT IS THE
  GENERAL RULE FOR THIS KIND OF MERGE.** `/keys/` hand-rolled its WebSocket and
  so could not tell a FULL ROOM from a DEAD RELAY (a browser cannot read the
  HTTP status of a refused upgrade; `openWire` asks `/stats` and says which),
  never checked a frame's shape, and never worked out which socket in the room
  WAS the board. All three came from `/knobs/`, so the page that had less gained
  three things rather than the two of them meeting in the middle.
  ⚠️ **THE CUSHIONS STAY DIFFERENT AND THAT IS NOT DRIFT.** 100 ms on `/keys/`,
  which reports press to sound and pays for every millisecond of it; 160 on
  `/knobs/`, which holds one note under a filter sweep where a click is the
  thing a listener cannot ignore. Two trades, one component.
  (Both pages are gone; the principle still has subjects: checked 2026-10-14,
  `/remote/circuit/` passes `cushionMs: 80` and `/remote/piano/` passes 80 and
  160 on its two paths.)
- **Write for someone who does not work here.** The principle stands; the
  size this bullet used to give a page's prose (one paragraph of three or four
  sentences) was superseded by CLAUDE.md's one sentence rule on 2026-09-19 and
  by two short card sentences on 2026-10-12, and concept pages start with
  `what: ''`. The words a visitor reads are `positron-describe`'s now. The old
  bullet is kept verbatim under Retired at the end of this file.
- **No jargon in anything a visitor sees.** Not in `what`, not in `how`, not in
  a readout key, not in `manifest.mjs`'s `one` line. Banned unless the page
  defines it on the spot: lookahead, horizon, one-shot, tick, host, commit,
  actuate, lattice, deck, lane, fold, adapter, evidence gate. Say what it does,
  not what it is called internally. `drift` survives only because it is a
  readout key with a sentence under it explaining it is lateness in
  milliseconds, and that it is NOT stream latency — a reader assumed exactly
  that, which is what prompted this rule.
  ⚠️ **A THING'S NAME IS NOT JARGON — DECIDED 2026-09-13, do not re-litigate.**
  `Yoshimi`, `Pappus`, `Ableton Live`, `SuperCollider` are what those programs
  are CALLED, and the open question of renaming them to something friendlier is
  answered: leave them. A friendly label invented here would be a name nobody
  can search for, and it would hide which program is making the sound, which is
  the one fact those pages exist to report. The rule is about words that
  describe a MECHANISM in this project's private vocabulary (a fold, a lane, an
  evidence gate), not about proper nouns.
  ⚠️ **THE ROW THIS WAS DECIDED ABOUT NO LONGER EXISTS**, and the decision is
  kept because it is about names rather than about that control. `/keys/` had an
  instrument row offering `sampled`, `hexter` and `yoshimi`; two of the three
  left the board on 2026-09-16 and a choice of one is not a choice. See
  `archive/box-fluidsynth-hexter/`.
  ⚠️ **AND YOSHIMI ITSELF LEFT THE BOARD 2026-10-13** (`archive/yoshimi/`,
  `plans/plan-retire-yoshimi.md`). The decision still stands for the names on
  live pages: `Circuit`, `Collide`, `Plaits`, `SuperCollider`, `Faust`.
- **A constant belongs beside the thing it governs, not in a header.** `how()`
  took a spec line of real values (`looks 100 ms ahead · re-checks every 25 ms`)
  on the theory that constants beat prose. They do — when someone is looking for
  them. Above a paragraph they are one more thing to parse before reaching the
  sentence that says what is going on. The numbers now sit under the lane whose
  behaviour they describe, in the strip's gutter. Wherever a number IS printed,
  read it from the same constant the page hands the library, never typed twice:
  a description that can disagree with the config is worse than none.
- **Per-lane numbers go in that lane's gutter** (`subLabel`), never in a
  separate table or a readout row. Joining a figure to its ink across two
  elements is what makes a legend necessary; put them together and it is not.
- **A gutter carries what its lane MEASURED, never instructions.** `typical
  +1.20 ms` / `worst +2.90 ms`, or an honest `no way to check` — not "press
  Record", not "drag the line". Help text belongs in the one `how()` paragraph,
  and if a reader still cannot tell what to press, fix the control's LABEL.
  Instructions in a gutter crowd out the numbers, repeat the paragraph above,
  and do not fit. **Anything that truncates with an ellipsis is in the wrong
  place** — that is the signal, not a styling problem to widen your way out of.
  (`how()` was removed 2026-09-08, see the prose bullet above; read "the
  `how()` paragraph" here and in the tooltip rule below as the page's `what`.)
- **A tooltip is two or three short lines, never a sentence.** It is drawn ON
  TOP of the thing it describes and is read every time you point at one, so a
  paragraph there covers the picture and gets re-read twenty times. Budget
  ~40 characters a line: what it is, the number, the mechanism. Explanation
  goes in the `how` block, which is read once. `1.20 ms late · as expected` /
  `timer set ahead`, not `A timer was set for it in advance. Those land
  within a few ms.`
- **Every readout cell must be able to change.** A cell showing a structural
  constant reads as a measurement and teaches the reader to ignore the row.
  01's `missed` count was always 1 — the mark due at position 0 can never have
  a timer — so it became `worst`, which moves. Prefer median AND max over
  either alone: a median hides the one bad fire that is the reason to look.
- **A colour scale whose normal reading is a warning has no warning left.**
  Calibrate against what the mechanism promises, not against an absolute
  ideal. 01 first painted 18 of 20 marks amber on a loaded machine, against a
  5 ms threshold — while the lab measures the shipped worker host at p50
  5.0 ms, so the DOCUMENTED BASELINE was amber. Colour and words must come
  from one table, so a green bar can never be described in language that
  sounds like a failure.
- 🔴 **NOTHING THAT REDRAWS EVERY FRAME MAY CHANGE HOW MUCH ROOM IT TAKES.**
  A live picture is fine. A live SENTENCE under it is not: `grain-scope` carried
  a caption that rewrote itself sixty times a second and reflowed between three
  and four lines, so the picture, the pane and everything below them jumped
  continuously — reported as *"a horrible jump of content each time it
  updates"*. The words were accurate and it did not matter. ⚠️ The fix is never
  to shorten the sentence: any prose that updates live will eventually straddle
  a line break, and then it is back. **A changing number goes in a READOUT
  CELL**, which is a fixed box with a reserved width (`tabular-nums`, and the
  slider reserves its widest value for the same reason) — or in a lane's
  gutter, which is also fixed. Text that updates at human pace — a log line, a
  verdict after a check — is fine, because it moves when something happened
  rather than on a clock. The test is not "is it short", it is **can this change
  its own height while somebody is looking at it**.
- 🔴 **A PAGE DOES NOT NARRATE ITS OWN STATE IN SENTENCES.** `grains` generated
  two paragraphs a frame — *"both are chewing the same saw — 72 sine partials
  over 6 notes, made separately at each end from one description"* and *"moving
  on its own · 53 nudges in the 8 s this page has been watching, none of them
  asked for · the slow one is reading at 0.416 of the way through the sixty
  seconds"*. Every number in them was real. The reader's word for it was **slop
  prose**, and the failure is the FORM, not the wording: a sentence has to
  re-say the unchanging part beside the one figure that moved, so you re-read a
  paragraph to find a digit — and it rewraps while you do. A figure goes in a
  **readout cell** or a **lane gutter**, both fixed boxes. A claim goes in an
  **assert**. A state change goes in the **log**, when it changes. ⚠️ And when
  you delete such a block, REHOME WHAT IT SAID — deleting the display without
  the facts is how a page quietly stops reporting something, which is worse
  than saying it badly.
- 🔴 **SEPARATION IS SPACING, NOT LINES — AND AN EMPTY BOX IS A LINE.**
  `shell.css` sets one vertical rhythm on the gap between siblings, so a divider
  is a second channel saying what the spacing already says; `.pos-head` carries
  a note saying exactly that and has no rule under it. ⚠️ **The failure is not
  only an explicit divider.** MEASURED on `/typist/`: a page declaring
  `readout: null` still got a `.pos-readout` div with no children, and its own
  1 px border top and bottom rendered as a **2 px full-width band 24 px above
  the controls** — a horizontal rule nobody wrote, reported as "old UI creeping
  in", which it was, just not in the way it looked. **A page that opts out of a
  surface must opt out of its BOX too**, and that cannot be the page's job to
  remember — the shell hides an empty readout now, the same way
  `.pos-controls[hidden]` already handles an empty control row that was leaving
  a 14 px band behind. A container with nothing in it must not paint its edges.
- 🔴 **VERTICAL SPACING IS A RULE, NOT A PER-PAGE DECISION.** Elements on a demo
  page do not sit tight against each other. `shell.css` sets ONE rhythm and a
  page that needs a different gap somewhere is a page making a claim about that
  one relationship, which it says so in a comment.
  ⚠️ **THE SELECTOR AND THE NUMBER WRITTEN HERE WERE BOTH STALE AND WERE
  CORRECTED 2026-09-20 BY READING THE STYLESHEET.** This said the rhythm was
  `.pos-body > * + * { margin-top: 22px }`. It is **`--pos-gap: 40px`**,
  declared once at `shell.css:49` (line 141 on 2026-10-14), applied by `.pos-stack` as a `margin-bottom`
  on every child but the last, with `margin-top: 0` forced on every child but
  the first. `shell.css`'s own comment says why the old one went: `.pos-body >
  * + *` reached ONE element's direct children and nothing else, it LOST to
  `.kbd`'s (0,1,0) on source order, and a row spliced onto `document.body` got
  no rhythm at all.
  ⚠️ **IT IS OWNED ON BOTH SIDES BY A CONTAINER, WHICH IS THE PART THAT
  MATTERS.** A sibling rule can be beaten by a page; a container that sets both
  the bottom margin and the top one leaves nothing for a page to disagree with.
  🔴 **AND A PAGE WITH NO SIBLINGS GETS NO RHYTHM, WHICH IS HOW `/held/` SHIPPED
  GLUED.** MEASURED 2026-09-20: `.pos-body` had **exactly one child**, a single
  `.pos-glue` holding the picture, the transport bar and the strip, so the gap
  list came back EMPTY. The rule was working perfectly and had nothing to act
  on. **Before hunting for a rule that lost, count the siblings**: two elements
  touching usually means they are not siblings at all.
  ⚠️ **`createGlue` IS FOR THE ONE PAIR IT WAS WRITTEN FOR**, a strip sitting on
  the transport bar that drives it, and its own header says so. *"One deck
  drives both"* is true of the log as well and proves too much. Inside a glue
  the children give up their border and radius, so a picture in one has nothing
  to say where its box ends. ⚠️ The failure this
  fixes is not ugliness: a pad, a strip, a transport bar, a knob row and a log
  with nothing between them read as ONE dense block, and a reader cannot tell
  which control belongs to which picture.
- 🔴 **follow TRACKS THE NEWEST FACT ON THE STRIP, WHICH IS NOT ALWAYS THE
  PLAYHEAD.** Every page before `/stage/` followed the playhead because there
  was nothing else it could be, and the rule was written into `followTick` as
  `S.pos`. A tab watching a show being RECORDED has a newest fact and no
  playhead: nothing is playing, the deck sits at 0, and the strip stood still
  while its own rows arrived. `followTarget` (option, or `setFollowTarget(fn)`, both in
  `timeline/strip.mjs`) names it; `armWall(0)` at the recorder's start makes `wallPos()` the write
  head, and `() => wallPos()` is both cases written once, because `disarmWall()`
  hands back to the playhead by itself.
  ⚠️ **AND AN ARMED WALL MEANS THE PICTURE MOVES.** The strip repainted on
  `wallAnchor && deck.playing()`, so a real-time cursor was frozen whenever no
  deck was running and the whole feature was inert with every line of it
  correct. It repaints on `S.wallAnchor` alone now, and a page whose wall has
  stopped meaning anything puts it away rather than keeping a stale one.
  ⚠️ **A WINDOW IS A CEILING, NOT A WIDTH.** At 1280 px a three hour recording
  is 8.3 s per pixel, so the view in which the whole show fits is the view in
  which nothing in it reads. Open on `min(length, window)`, so a short piece
  still fits whole.
  ⚠️ **AND `followsPlayhead` REPORTS THE SETTING, NOT THE BEHAVIOUR.** A check
  built on it, on a finite `followPos` and on a window that MOVED read 32/32
  against a `followPos` sabotaged to ignore the target entirely: the harness had
  seeked the playhead to 90 s, so the number was large and real, and a window
  chasing it moved 17,119 px. Compare `followPos` against the WRITE HEAD and
  require the write head to be on screen.
- **One position surface per page.** A page with a strip passes
  `createTransportBar(…, { scrub: false })`: two horizontal time axes at
  different scales, stacked, is not a redundancy but a contradiction. The
  strip already seeks on press AND on drag, which the bar's slider did not.
  🔴 **AND A BAR MAY HAVE NO PLAY BUTTON AT ALL: `toggle: false`, 2026-09-16.**
  Play, pause and seek are all claims about a POSITION inside a sound, and
  `/keys/` has none: a note sounds while a key is held, there is nothing to
  start or resume, and a toggle whose only honest behaviour is to do nothing is
  the shape of control this project calls a lie. What such a bar still carries
  is the `chip`. On both board pages (`/keys/` and `/knobs/`, both gone by
2026-10-13; `toggle: false` is still used by `/code/piano/`, `/pack/`,
`/stage/` and `/kit/timeline/`, checked 2026-10-14) that is the presence badge, because the
  fact worth having about an instrument at another site is whether it is
  answering. ⚠️ **IT DISARMS EVERYTHING THAT DEPENDED ON PLAYING** rather than
  leaving it to read false by luck: `api.playing` is forced false, the space bar
  stops being a play key, the end-stop never arms, and `api.toggles` says so in
  one boolean. **`demo/verify.mjs` reads `api.toggles` before its play drill**,
  which clicks `.tbar-toggle` and asserts the position advanced; without that a
  bar with no toggle takes the harness red on a page where nothing is wrong.

## The numbers in `shell.css`, and the ones a component is not allowed to invent

**From `demo/shell/shell.css`, the `:root` block.**

🔴 **HOW MUCH AIR A WORD GETS INSIDE A CONTROL, AS A SCALE OF THREE RATHER
THAN AS SIX TYPED FIGURES. Asked twice, and the second ask was because the
first one did not take: 2026-09-17 put `padding: 0 18px` on the base
`button` with a comment saying a padding that belongs to one component is
a padding the next component gets wrong. Then every component
overrode it with a number of its own. MEASURED 2026-09-20, before this
block existed: `.pos-choice button` 11, the same button on a phone 8,
`.pos-bgroup-row button` 12, `.pos-pick-cell` 10, `.tbar-rates button` 7,
`.xr button` 18. Six values, one of which followed the rule.
A base declaration cannot win that argument, because a component that
wants a different number is not being careless: a segmented row really
does want less air than a button standing on its own, and a phone really
does want less than a desktop. What it must not do is INVENT one. Three
names, declared here, and a component picks the one it is:**

      --pad-btn   a button standing on its own, a word in a pill
      --pad-seg   one cell of a segmented row, sharing edges with its
                  neighbours, so its own padding is all the air a word has
      --pad-bar   a control on the transport bar, which is dense on purpose

⚠️ **THE PHONE VALUE OF `--pad-seg` IS SMALLER AND THAT IS NOT DRIFT. At
390 px a segmented row carries `flex: 1 0 auto` so it fits rather than
wrapping, and padding is what decides whether four station names fit at
all. It is overridden once, at the foot of this file, beside the other
phone rules.**

🔴 **HOW FAR A SWITCHED-OFF CONTROL'S FURNITURE DIMS, AND IT IS PUBLISHED
FOR THE SAME REASON THE HEAD AND FOOT ARE: a caller that has to guess a
component's own number is a caller that guesses it wrong.
MEASURED 2026-09-21 on `/evo/`, whose whole panel was switched off THEN and
is fully live SINCE 2026-09-25 (*"make all buttons interactive"*), so read
this as a dated measurement rather than a description of that page today.
The contrast ratios below are the finding and they still stand. Its
function button names are wider than the buttons, so the page draws them
itself rather than using the pad's own label slots, and it had no number to
match: they rendered at FULL strength, 5.91:1 against the card, over
buttons dimmed to .38 and beside the pad's own top labels at 1.96:1.
The label was the brightest thing in a dead control, which is what got
reported, and the cause was three times the intended value.**
⚠️ **IT IS AN OPACITY AND NOT A COLOUR, so it composites over whatever the
control is standing on. `--dim2` on `--card` and `--dim2` on `--card2` are
two different readings and a caller should not have to know which.**
⚠️ **AND IT IS NOT THE BUTTON'S OWN .38. Text at .38 of `--dim2` measures
1.56:1, which stops being a label; the working surface can go fainter than
the words naming it, because a reader who cannot make out a dimmed button
can still see its shape, and a name they cannot read tells them nothing.**
`--ctl-off: 0.55`.

🔴 **ONE SQUARE, EVERY PAGE.** `shell.mjs` stamps `data-glyph` on a control whose
whole label is one non-letter. **MEASURED rather than derived: the control
buttons are 34 px tall, so 34 is the square. Re-measure if the row's type or
padding changes. A size computed from four other values looks more rigorous
and is one edit from being quietly wrong.**

## Focus, and the ring a pointer must never get

**From `demo/shell/shell.css`, `:focus-visible`.**

🔴 **A RING ONLY WHEN SOMEBODY IS ON THE KEYBOARD, AND IT IS 1 px. Asked for
2026-09-23: *"make focus styles appear only on keyb nav not mouse and make it
1px. change everywhere"*. Every ring in this file was 2 px; fourteen rules
moved to 1 px in one pass, so a page cannot be half converted.**
🔴 **`:focus-visible`, NEVER `:focus`, AND THE BROWSER IS THE ONE THAT DECIDES.
It paints for Tab and for a key and stays away for a pointer press, with two
exceptions it makes on purpose and this file does not fight: a TEXT FIELD and
a `<select>` match it even when clicked, because a caret with nowhere visible
to be is unusable. MEASURED 2026-09-23 in the harness Chrome, one fresh press
per control: a mouse press on a button, a tab, a toggle, a lane, a pad or a
range handle computes `outline-style: none`, and a Tab onto the same control
computes `solid 1px`.**
⚠️ **AND THREE `:focus { outline: none }` RULES WENT WITH IT, BECAUSE THEY
WERE DEAD.** `.sld-knob`, `.pos-choice button` with `.pos-pick button`, and
`.pos-tabs-t` each carried one to suppress a pointer ring. Nothing in this
file has ever painted on plain `:focus`, and the browsers that use
`:focus-visible` for their own default ring are exactly the browsers that
parse those selectors at all. Two of the three were written
`:focus:not(:focus-visible)`, which an older engine drops whole. The proof
is a plain `button`, which never had a suppressor and shows no ring on a
press either.

🔴 **A CONTROL THAT ALREADY HAS A BORDER COLOURS IT. IT DOES NOT GROW A SECOND
ONE. The rule above is right for a bare button or a link, which have no edge
of their own and need one drawn. An input and a textarea already have a
1 px border, so the ring above landed 2 px outside it and the result was two
concentric yellow rectangles around one box. Photographed on the feedback
panel and reported as "do not intruduce double outline. globally".**
⚠️ **GLOBAL ON PURPOSE, matched on the ELEMENTS rather than on a class, so a
field added to any future page gets this without anybody remembering.**

## `[hidden]` and the component that sets `display`

**From `demo/shell/shell.css`, four separate blocks that are one rule.**

🔴 **AND `hidden` HAS TO BE SAID HERE OR IT DOES NOTHING. The rule above sets
`display: grid`, and ANY author rule beats the browser's own `[hidden]`, so a
page setting `logEl.hidden = true` would get a log that is still on screen and
a property that reads as set. `.pos-glue[hidden]` exists three hundred lines
up for exactly this reason. (0,2,0) so it cannot lose to `.pos-log`.**

🔴 **`display: grid` ABOVE BEATS THE UA'S `[hidden] { display: none }`, AND
WITHOUT THIS LINE `head.hidden = true` SET AN ATTRIBUTE AND CHANGED NOTHING.
MEASURED 2026-09-21 by screenshot: `/pack/` with no file open showed three
column headings over three empty tables, on the page that carries the assert
`an empty table draws no heading, because a column name over nothing labels
air`. That assert read `head.hidden === true`, which is the PROPERTY, so it
passed every run while the heading was on screen.**
⚠️ **SO EVERY EMPTY TABLE IN THIS PROJECT HAS BEEN DRAWING ITS HEADING FOR AS
LONG AS `table.mjs` HAS EXISTED. `blank()` has always set the attribute.**
⚠️ **AND IT IS THE FOURTH COMPONENT TO NEED THIS EXACT PATCH: the readout, the
control row, the log and the glue all carry it with a comment saying why, and
the one whose whole job is to disappear did not. A component that sets
`display` must say what `[hidden]` means, every time.**
🔴 **AND THE LESSON IS ABOUT THE ASSERT, NOT THE RULE: `el.hidden` is a fact
about an attribute and `getComputedStyle(el).display` is a fact about the
screen. Only the second one can tell you a thing is not being drawn.**

🔴 **AND THE RULE ABOVE BEAT `hidden`, WHICH IS THIS PROJECT'S DEAD RULE IN
REVERSE: NOT A RULE THAT NEVER RAN, A RULE THAT RAN WHERE IT MUST NOT.
MEASURED 2026-09-23 on `/kit/`: `wave-view.mjs` sets `wrap.hidden = true`
until it has samples and pairs it with `.pos-wave[hidden] { display: none }`
at (0,2,0), and the rule above is (0,3,0), so a wave view holding nothing
laid out a 327.5 px wide box across the well, holding a 328 by 150 canvas
with 0 of its 49,200 pixels painted. A box that says a picture failed to
arrive, drawn by the rule that makes a picture fill its well. `[hidden]` is
the element saying there is nothing to show, and no arrangement gets to
overrule that.**

## A phone that drags the page, and a grid that spills off it

**From `demo/shell/shell.css`.**

🔴 **NO SIDEWAYS RUBBER BAND ON A PHONE. iOS and Android bounce the whole
document horizontally the moment a drag has any x in it, and almost every
drag on these pages does: the strip pans, the transport scrubs, a headset
preview is dragged to look around. So a gesture aimed at a control pulled the
page out from under it and let it snap back, which reads as the page being
loose rather than as the control working.**
⚠️ **`overscroll-behavior-x`, NOT `overflow: hidden`. Hidden clips, and this
file already records what that cost: at 390 px the transport row overflowed
by 94 px and `body{overflow-x:hidden}` CUT the last rates off rather than
showing them, so half the lattice did not exist on a phone. This stops the
BOUNCE and the scroll chaining and clips nothing.**
⚠️ **AND IT DOES NOT TOUCH INNER SCROLLERS. The tabs row and the tables scroll
themselves on x by their own `overflow-x: auto`; what they lose is only the
ability to hand a leftover swipe up to the document, which is the behaviour
being removed.**

🔴 **`minmax(min(100%, …), 1fr)` NOT `minmax(190px, 1fr)`. A bare floor wider
than the screen does not fall back to one column, it makes a COLUMN WIDER
THAN THE PAGE and the whole document scrolls sideways. That is the defect
`tabs.mjs` shipped and `/kit/` caught: 390 px of screen, a 500 px row and
141 px of page overflow. `min(100%, …)` is the whole fix.**
⚠️ **AND `min-width: 0` ON THE CARD, for the other half of the same bug: a grid
item's automatic minimum size is its CONTENT, so one long unbroken word in a
title pushes its column past the track it was given, with the same result.
`overflow-wrap: anywhere` on the title is what lets it break rather than
push.**
⚠️ **EQUAL HEIGHTS COME FOR FREE and are not set anywhere. Grid items stretch
to their row by default, so every card in a row matches the tallest, which
is why nothing here clamps the description: a card that does not fit is
VISIBLY a description that is too long, where a clamp would have hidden it
behind an ellipsis. CLAUDE.md: anything that truncates with an ellipsis is in
the wrong place.**

🔴 **A FIXED SQUARE, NOT A GRID TRACK THAT STRETCHES. Reported 2026-09-20
with a screenshot of eight pads filling a wide box: *"awful. bring back that
original pad button size square"*. The columns were `minmax(0, 1fr)`, so the
pad's SIZE was a function of how many of them there were and how wide the
page was: sixteen looked right and eight were enormous. A pad is a thing a
finger hits, so its size is a property of the pad.**
🔴 **AND THE LINE THAT USED TO STAND HERE SAID `IT WRAPS RATHER THAN
SHRINKING`, WHICH THE RULE UNDERNEATH IT CANNOT DO. MEASURED 2026-09-22 on a
real phone and then at 390 px in a browser: `repeat(var(--pad-cols), …)` is a
FIXED track count, so a grid too wide for its box neither wraps nor shrinks,
it spills. `/kit/`'s eight column specimen ran 27 px past its own box and
dragged the whole page 65 px sideways. The comment described an intention
and the stylesheet had never implemented it.**
⚠️ **THE HALF THAT WAS RIGHT IS KEPT**: a pad narrow enough to fit a phone is
one nobody can hit, so it must not shrink.
⚠️ **AND WRAPPING IS THE WRONG REPAIR, WHICH IS WHY IT IS SCROLLING.** A pad
grid carries LANES: `/kit/`'s first specimen is two rows that mean two
different things, and `/circuit/` and `/evo/` both lay a keypad out in rows.
Wrapping folds the tail of a row underneath itself and the lanes stop being
lanes. A row that scrolls keeps every pad its own size and keeps the rows in
step, which is what `.pos-tbl-row` already does with its own minimum and what
`step-grid.mjs` does with its strip.

## Air above a component: a margin collapses, a padding does not

**From `demo/shell/shell.css`, the tab row.**

⚠️ **THE AIR GOES ON THE BAR RATHER THAN ON THE WRAPPER, AND MARGIN COLLAPSING
IS WHAT MAKES THAT WORK. `.pos-tabs` has no padding and no border, so the
bar's top margin collapses up through it and out through the body and lands
against whatever is really above the row. MEASURED on all three pages, from
the bottom of `.pos-head` to the top of the bar: 0 px before, 28 px after.**
⚠️ **AND A `padding-top` ON THE WRAPPER WOULD HAVE BEEN WRONG RATHER THAN
EQUIVALENT. Padding does not collapse, so on a page that one day does put a
block above its tabs it would ADD to the stack's 40 and that page would sit
at 68 for a reason nobody wrote down. A margin collapses with it instead and
the larger of the two wins.**
⚠️ **ONE NUMBER, BOTH SIDES. 28 px is more than the 18 it replaces and less than
the project's 40 px block gap, because a tab row and the panel under it are
closer kin than two blocks: the row is a label for what follows it.**

## Words on a control: wrapping, balancing, truncating

**From `demo/shell/shell.css`.**

🔴 **A LABEL NEVER WRAPS. `Radio 1965` broke into `Radio` over `1965`, and so
did every two-word station in the row: six buttons two lines tall, each one
naming a thing nobody calls by half its name. A wrapped label is also a
button that is twice as tall as its neighbours, so the row stops being a row.
The name is the control's whole content; if it does not fit, the row scrolls
or the names are too long, and neither is fixed by folding a word in half.**

🔴 **13 ch WAS A PHONE'S WIDTH IMPOSED ON A DESKTOP. `four seconds ago` came
out as `four seco…` on a 1490 px window with the rest of the row half empty,
and an ellipsis is this project's own signal that a thing is in the wrong
place rather than a styling problem to widen your way out of. Here the place
is right and the number was simply a phone's. The narrow value is kept as the
floor, because the one-column phone rule below sets its own width anyway and
a cell that is 22 ch on a 360 px screen would push the row off the side.**
⚠️ **`ch` ON A MONOSPACE FACE IS EXACTLY CHARACTERS, which is why the unit is
worth keeping: 22 ch fits `Vibraphone Soft 2` and `four seconds ago` whole,
and the longest name in `/keys/`'s Yoshimi library with one to spare.**
(Measured on a page and a library that are both gone, `/keys/` 2026-09-17 and
Yoshimi 2026-10-13; the 22 ch value is still what `shell.css` sets.)

🔴 **AND IT IS BALANCED, WHICH IS WHERE THIS PROJECT DRAWS THE LINE ON
`text-wrap: balance` AND THE ARGUMENT FOR EVERY OTHER PLACE IT IS USED.
Asked for 2026-09-23 in these words: *"the board has not answered since you
opened this page - add balanced text wrapping on all similar cenered h w
texts"*, which is the sentence THIS rule draws.**
🔴 **MEASURED ON THIS EXACT NOTE, at the width `demo/verify.mjs` runs: greedy
wrapping laid it out at 297.7 px and 62.3 px in a 327.5 px box, and the
phone specimen beside it at 332.3 px and 27.7 px, which is one word
hanging on its own under a full line. Centred, the short line is not a ragged
right edge you can ignore, it is a stub floating in the middle of the box.**
⚠️ **IT IS FOR SHORT CENTRED PROSE AND NOTHING ELSE, AND THAT IS THE WHOLE
SCOPE. Chromium stops balancing past a handful of lines and falls back to
greedy, so it is wasted on a paragraph; it does nothing at all on anything
carrying `white-space: nowrap`, which is most of the centred rules in this
file; and it does nothing on one word or one number. The test is: does this
element hold a SENTENCE that can wrap onto two or three lines, and is it
centred. Everything that fails that test was left alone on purpose.**
⚠️ **NO FALLBACK IS NEEDED AND NONE IS WRITTEN. A browser that does not know
the property wraps the old way, which is what it does today.**
⚠️ **AND IT IS SET ON THE FLEX CONTAINER, WHICH IS NOT OBVIOUSLY ENOUGH. The
text here is an anonymous block inside a flex box rather than a child this
rule can name. `text-wrap` inherits, an anonymous box inherits from the box
that generated it, and it was MEASURED rather than reasoned about.**

🔴 **THE TICK IS DRAWN, NOT TYPED. A `✓` is a font glyph, and a font glyph is a
different shape, weight and baseline on every machine, which is the same trap
this project already recorded for the transport's arrows. Two borders on a
rotated box is the same two strokes everywhere.**

## A control that is switched off, and a row that is merely quiet

**From `demo/shell/shell.css`.**

🔴 **A DISABLED CONTROL SAYS SO IN INK, NOT IN COLOUR ALONE, and it keeps its
shape. A control that shrinks or loses its border when switched off changes
the layout under whatever is beside it, and a row that reflows when one
button goes off reads as the page breaking.**
🔴 **AND IT SHOWS THE ORDINARY CURSOR, NOT `not-allowed`. Asked 2026-09-21:
*"rm disable cursor o ndisabled knobs/padbuttins, just use regular.
noniteractive cursor"*. `not-allowed` says *you tried to use this and were
refused*, and nothing in this kit's disabled controls is refusing anybody:
every one of them is a picture of a control that is bound to nothing.**
⚠️ **CHECKED BEFORE SWEEPING, because a rule on `:disabled` reaches every page
and one of them might have had a control that really was refusing a press.
MEASURED 2026-09-21, all four pages that disable a pad, knob or fader:
`/evo/` was a replica whose whole panel was switched off (20 pads of 20, 8
knobs of 8, 2 faders of 2), `/circuit/`'s master volume is *"a pot. Whether
it sends anything has not been measured"*, `/twelve/`'s SUB and MAIN are the
analogue outputs with *"nothing on MIDI"*, and `/kit/`'s are specimens of
this state. Not one is a refusal, so this is a change rather than an
option.
🔴 **AND `/evo/` LEFT THAT LIST ON 2026-09-25**, on *"make all buttons
interactive"*: **14 pads, 8 rotaries and 2 wheels, 0 switched off**, and the pad
count in the line above was wrong as well, because the six function buttons went
on 2026-09-23. **The rule is unchanged and `/circuit/`, `/twelve/` and `/kit/`
still give it subjects.** What is gone is its exemplar, and a rule whose only
named example has stopped being an example is how a reader concludes the rule
itself lapsed. If a control ever genuinely does refuse a press, it needs its own
class and its own cursor rather than this one back.**
⚠️ **`default`, NOT `auto`. Over a `<button>` the initial value already
resolves to the arrow, but `auto` on text-bearing furniture resolves to the
I-beam, and the pad's labels are text.**

🔴 **A PRINTED LABEL NAMING A CONTROL THAT IS SWITCHED OFF DIMS WITH IT, AND
THAT HAS TO BE SAID OUT LOUD BECAUSE THE LABEL IS NOT INSIDE THE CONTROL.
Reported 2026-09-21 from a screenshot of `/evo/`: *"on dislable pad buttons
make labels way lighter"*.**
🔴 **AND THE CAUSE WAS ONE LAYER UNDER WHAT WAS REPORTED, WHICH IS THE USUAL
PLACE.** The kit's own pad labels were never the problem: MEASURED at 1280 px,
a pad's `.pos-pad-top` reads 1.96:1 against its group, the faintest text
on the panel apart from a fader's slot number. The names a reader was actually
looking at are the ones a PAGE draws, absolutely positioned outside the pads
because they are wider than the buttons, and they were at full strength:
5.91:1 for a single press name and 3.77:1 for a dual press one, over
buttons dimmed to .38. So the label really was the brightest thing in a dead
control, and making the kit's labels lighter would have hidden the faintest
text on the page while leaving every bright one exactly where it was.
✅ **THE NUMBER IS `--ctl-off`**, for precisely this: a caller drawing its own
stand-in for a component's label slot has to be able to match the component,
and this one had nothing to match and was out by three times.
⚠️ **A PANEL'S TWO TIERS SURVIVE.** `.panel-sub` is `--dim2` and `.panel-cap`
is `--dim`, which is a real instrument's own silkscreen hierarchy, so this
dims BOTH rather than flattening them to one ink. An opacity keeps a
relationship that a replacement colour would throw away.

🔴 **DIMMED, NEVER DISABLED. Opacity only: every row still links, still takes
focus, still reads to a screen reader, still works if you press it. A
`pointer-events: none` here would turn "this one is less interesting right
now" into "this one is broken", which is a different and false statement,
the same reason `caps.mjs` un-links a row WITH THE REASON IN WORDS rather
than hiding it.**
⚠️ **And it comes back on hover and focus, so a row you have actually reached
for is never the faint one. A dimmed thing you cannot un-dim by looking at it
is a trap rather than a hint.**

🔴 **`cursor: ns-resize` IS NOT DECORATION, IT IS THE WHOLE ANSWER TO THIS
COMPONENT'S ONE KNOWN WEAKNESS. Vertical drag is what every professional
audio application uses, because angular drag breaks down near the centre
where two pixels swing the angle through most of its range. The cost is
discoverability: a control that LOOKS like a dial invites somebody to turn
it in a circle, and there is no signifier for "drag me up". This arrow is
the standard one and it is the cheapest honest signal there is.**

## Reserved room, and the empty box that is still a box

**From `demo/shell/shell.css`, the feedback panel.**

🔴 **A FIXED BOX FOR A LINE THAT CHANGES. The send path has five steps that can
each fail differently, so it has something to say after every press, and a
sentence that rewrites itself under the button reflows the panel, which is
the jump CLAUDE.md names. Two lines are reserved whether or not anything is
written in them, so the panel is the same height before and after.**
🔴 **TWO RESERVED LINES ARE RIGHT UNTIL THE LAST ONE IS WRITTEN. The reserve
above exists so the panel does not jump while the send path reports its five
steps, and it is correct for every one of them EXCEPT the final state, where
the work is over, nothing more will be written, and the reserve is just a
band of empty panel under a one-line answer. Photographed after a successful
send and reported as "poitless whitespace between lower text".**
⚠️ **`.ok` and `.bad` are the terminal states, so they are the ones that stop
reserving; a mid-flight line keeps the full two.**
🔴 **AND NOTHING RESERVED BEFORE ANYTHING HAS BEEN SAID. The reserve exists so
the panel does not jump while the send reports its five steps, and before the
first press there are no steps: an unopened panel was carrying 2.8em of empty
line under the Send button, photographed as a band of dead panel taller than
the name field. The reserve arrives with the first word, which is the first
moment a jump is possible.**
🔴 **`min-height: 0` IS NOT ENOUGH, THE ELEMENT HAS TO GO. An empty block in a
flex column still takes a line box AND still collects the column's 14 px gap
above it, so the panel kept about 20 px of nothing under the Send button
after the reserve was zeroed. Reported three times as the padding not being
fixed, and it was not: only half of it had been.**

## A look that exists in three places is a utility nobody has noticed

**From `demo/shell/shell.css`.**

🔴 **ONE LOOK THAT FOUR COMPONENTS WERE EACH WRITING OUT. Two or more controls
joined into one object: the border overlapped by exactly one pixel so a join
is a single line rather than two, corners rounded only on the outside, and
whichever segment you are pointing at raised above its neighbours so its own
edge is not painted over by the one overlapping it.**

`.tbar-loopgrp`, `.step` and `.pos-pick-cell` had all three written the same
six declarations separately, **which is this project's own rule one level down:
a LOOK that exists in three places and nowhere else is a utility nobody has
noticed yet.** The slider's hand button is the fourth and it gets the join with
no new CSS about joining at all.

⚠️ **SOURCE ORDER IS LOAD-BEARING AND THIS IS WHY IT IS HERE. `.step
button:hover` weighs more than `.pos-seg > :hover`, and `.tbar-loopgrp`'s own
`display: flex` has to beat the `inline-flex` below it, so this block goes
AFTER the base `button` rules and BEFORE every component that specialises it.**
⚠️ **AND A LANE HAS NO BORDER, IT HAS AN INSET SHADOW. `.sld-lane` paints its
edge with `box-shadow: inset 0 0 0 1px` because a real border insets the
padding box the handle travels in, so its travel comes up one pixel short at
each end.**

🔴 **IT IS NOT A NEW LOOK AND IT MUST NEVER BECOME ONE. Instructed 2026-09-20:
*"vertical fades is same as out horiz sldier just turned 90c"*. The first
build was a rounded capsule with a coloured fill and a wide cap across it,
which is a fader off a mixer photograph rather than this project's slider,
and it read as a fifth control nobody had agreed to.
Every value below is taken from `.sld-lane` and `.sld-knob` with the axes
swapped, so the two cannot drift: 34 px across, `--card2`, an inset 1 px
shadow rather than a border, 4 px corners, and a SOLID BLOCK handle in
`--hi` rather than a fill and a cap.**
⚠️ **THERE IS NO FILL. The slider has none: its handle is the reading. A fill
plus a handle says the value twice and the two can disagree by a pixel.**

🔴 **NO `color: inherit` HERE, AND IT WAS THERE FOR MONTHS KILLING EVERY STATE
COLOUR ON THE BADGE. MEASURED 2026-09-21 on `/circuit/`, reported as
*"chircuit checking should be gray"*: the badge's computed colour read
`rgb(230, 230, 230)`, which is `--fg`, in ALL FIVE states.
`.pos-presence-btn .pos-pres` is (0,2,0) and so is
`.pos-pres[data-state="checking"]`, and this rule sits 750 lines LATER in
this file, so it won on source order and the state rules never applied.**
⚠️ **THE DAMAGE WAS WIDER THAN THE REPORT. `.pos-pres-dot::after` is
`background: currentColor`, so the DOT was `--fg` white in every state
including `online`, where it should be `--ok` green.**

## Measure before you change it, and measure by switching it off

**From `demo/shell/shell.css`, the panel layout.**

🔴 **MEASURED BEFORE CHANGING ANYTHING, because there are four reasons a
border could stop short and they have different fixes.** At 1280 px the fixed
column measured top 339.30 and bottom 812.67 against a card INNER top of
339.30 and bottom of 812.67: **zero gap at both ends**. The border was
already the full height of the column, and the column was already the full
height of the card's CONTENT box. What stopped it was the card's own
`padding: 20px`, which put 20 px of card between the border's ends and the
card's visible edge at each end.
✅ **SO THE CONTAINER GIVES UP THE VERTICAL INSET AND ITS TWO CHILDREN TAKE
IT**, which is the container stretching its children rather than a column
growing a margin to correct for its parent. A page that writes its own
correction here breaks the moment the component changes, which is exactly
what `/twelve/` did when it lifted a button column by a foot's height and the
pads later grew one.
⚠️ **THE PANEL DOES NOT GET TALLER. The 40 px left the card and arrived on the
column, so the card's border box measures what it did before.**

🔴 **MEASURED BY SWITCHING IT OFF IN THE LIVE PAGE, WHICH IS THE ONLY WAY
THIS NUMBER EXISTS.** `/evo/`, 2026-09-21, `.evo-keys` from `flex: 1 1 auto`
to `flex: 0 0 auto`: the flow went **461.03 to 151** and the keyboard went
**334.03 to 24**. That is **310.03 px of absorbed slack, 67 per cent of the
flow's depth**, and the keyboard has NO INTRINSIC HEIGHT on that page at all,
because `.evo-keys .k { height: auto }` replaces the component's own key
height. So this is not a polish on top of a working keyboard: it is the only
thing giving the keyboard a size.
⚠️ **`min-height: 0` IS NOT OPTIONAL AND IS THE HALF THAT GETS LEFT OUT.**
Without it a flex child will not shrink below its content. It is the vertical
twin of the `min-width: 0` rule already written down three times in this file
for a scrolling flex row.
🔴 **AND THE FACTORY APPLIES IT FROM AN ARGUMENT, so nothing is typed on a
page.** `createPanelLayout({ grow })` or `panel.grow(el)`. The alternative
was a documented requirement the caller types itself, and that is exactly the
`/blocks/` shape: a required call that no browser check can see when it is
MISSING, because in the broken state nothing throws and nothing looks wrong
until somebody opens the page. That page had no way out of it at all, every
other page had the line, so no shared code was wrong and nothing could
disagree with anything.
🔴 **AND A FLOW WITH SLACK AND NO ABSORBER IS REPORTED, NOT REFUSED.**
`panel.check()` pushes onto `panel.cuts`, the same channel `createDiagram`
uses for a label it had to shorten. A REPORT and not a throw, because
`/twelve/`'s 25.00 px of trailing air is legitimate (`margin-top: auto` inside
a channel strip, which is a claim about where a fader block sits on a Model
12 panel) and a panel with no fixed column has no slack at all, so refusing
the build would break two of the three callers.

## A glyph is centred on its ink, not on its box

**From `demo/shell/symbol.mjs`.**

🔴 **`place-items: center` CENTRES THE WRONG RECTANGLE, AND THAT IS WHY ⛶ SAT
HIGH AND LEFT IN ITS SQUARE. A glyph in a button is laid out as text: it gets
an ADVANCE WIDTH, which usually has more air on one side than the other, and
a BASELINE, which sits wherever the font's ascent and descent put it. Centring
the element centres that box. The ink inside it is centred only by luck, and
U+26F6 SQUARE FOUR CORNERS is not lucky: it is drawn small and high in a box
sized for a capital, so a 34 px square button shows it a couple of pixels up
and to the left of where the eye expects. Reported by eye, on a zoom.**

⚠️ **THE FIX IS MEASURED, NOT TYPED. The obvious repair is `transform:
translate(1px, 1px)` on the one button somebody complained about: a number
with no source, right for one glyph in one font at one size, and silently
wrong for the next. The offset here is computed from the font's own metrics
through `measureText`, so it is correct for any glyph, any face and any size,
and it becomes correct again by itself when a stylesheet changes.**

⚠️ **AND IT WAITS FOR THE FONT. Measured against a fallback face the numbers
describe a glyph nobody will see, so every measurement re-runs on
`document.fonts.ready`, the same event `/radio1965/` uses to re-share its
label column.** (`/radio1965/` is `/archive/radio/` today; checked 2026-10-14,
`demo/archive/radio/index.html` still calls `document.fonts?.ready?.then(shareLabelColumn)`.)

🔴 **IT EXISTS BECAUSE `host.textContent = ch` SILENTLY UNDOES THIS FILE.**
`centreSymbol` puts the glyph in a `<span class="pos-sym">` and translates the
SPAN, so writing `textContent` on the button throws that span away: the new
glyph is laid out on its advance and its baseline again, which is the exact
misalignment this module was written to fix, and nothing anywhere reports it.
REPORTED as *"play button is always square"* on `/videoradio/`, whose play
control swaps `▶` for `❚❚` on every press.
⚠️ **AND THE TWO GLYPHS ARE NOT THE SAME SHAPE, which is why re-centring is not
cosmetic here. `▶` is one code point drawn wide and low; `❚❚` is TWO
characters whose ink is narrow and tall. Centring measured for one of them is
wrong for the other by several pixels, in a 34 px box, in the one control a
visitor presses.**

**From `demo/shell/stepper.mjs`.**

🔴 **NO EMOJI IN A CONTROL. The box page used 🎲 for its patch roll and the
mirror page was about to. An emoji is a COLOUR PICTURE at a size of its own:
it ignores the row's font, sits off the baseline, renders differently on
every platform and, reported from the page, is simply hard to see against a
dark control. Everything else in this project's UI is text in one mono face,
and a die is the one thing that was not.**
⚠️ **AND THE ROLL GOES IN THE MIDDLE, not on the end. Back and forward are one
axis; a roll is a jump along that same axis, so it belongs between its two
neighbours rather than tacked on after them. It also makes the three a single
target group for a thumb or a hand-ray instead of two things and a stray.**
`‹` and `›` are text, not pictures: they take the row's font, its colour and
its baseline, which is the whole complaint about the die.

## A form control is a form control, not a button wearing a role

**From `demo/shell/check.mjs`.**

🔴 **IT IS A REAL `<input type="checkbox">`, NOT A BUTTON WEARING
`aria-pressed`, AND THE FOUR REASONS ARE WORTH WRITING DOWN BECAUSE THE OTHER
ANSWER IS ALREADY IN THIS KIT AND IS CORRECT WHERE IT IS.**
  1. A screen reader announces a checkbox as `checkbox, checked` and a button
     as `button, pressed`. *Pressed* is the wrong verb for *this one is in
     the set*: it says something happened, when what is true is that
     something IS.
  2. The space key toggles a checkbox with no code at all, and a button has
     to implement it. A control whose keyboard behaviour is the page's job is
     a control whose keyboard behaviour will be missing on one page.
  3. There is a third state. `indeterminate` is a real property of a
     checkbox and it is what *some of the ones under this heading* looks
     like; `aria-pressed` can spell it `mixed` and nothing draws it.
  4. It is a form control, so `:checked`, `:disabled` and `required` are the
     browser's job rather than a set of classes this file would have to keep
     in step.

⚠️ **`choice.mjs` STAYS BUTTONS, and that is not an inconsistency. A segmented
row is one object with the chosen segment lit, the look is the whole reason
it is segmented, and `aria-pressed` is the right announcement for an option
somebody armed. The two components answer two questions and wear two shapes
on purpose.**

🔴 **THE INPUT IS REAL AND THE BOX IS DRAWN BESIDE IT, WHICH IS ONE ELEMENT
MORE THAN `appearance: none` WOULD COST. `appearance: none` on a checkbox
leaves a replaced element whose pseudo elements are rendered by some engines
and not by others, so the tick would be the kind of thing that looks right on
this machine and wrong on somebody's phone, with nothing on the page saying
which. A visually hidden input keeps every semantic above and hands the
drawing to an ordinary `<span>`, where `::after` is not in question.**
⚠️ **HIDDEN, NOT `display: none`. A `display: none` input is not focusable and
not submitted, so the keyboard path would be gone and nothing would say so.
It is clipped to a pixel and stays in the tab order, which is the standard
arrangement and is asserted on `/kit/`.**
⚠️ **THE WHOLE THING IS A `<label>`, so the word is part of the target. A 16 px
box is under the 24 px anybody recommends for a finger, and the label is what
makes the real target the height of a row rather than the size of the box.**
STYLING lives in `shell.css` beside `.pos-choice`, because a checkbox is a
control and every control in this project is declared there. **A component that
only looks right next to one page's stylesheet is the `choice.mjs` bug, which
shipped emitting two class names no stylesheet matched.**

## Moving focus, and the scroll that comes with it

**From `demo/shell/table.mjs`.**

🔴 **IT SCROLLS THE TABLE'S OWN BOX AND NOTHING ELSE. Reported 2026-09-20:
*"do not make keyboard focused item move away from viewport of table when
keep using keyboard"*. This was `row.focus()` followed by
`row.scrollIntoView({ block: 'nearest' })`, and both of those scroll
every scrollable ancestor, the document included. So stepping through a
list moved the page under the table as well as the row inside it, and the
two scrolls fight: `focus()` goes first on its own heuristic, then
`scrollIntoView` corrects from wherever that left things.**
⚠️ **`preventScroll: true` IS THE HALF THAT IS EASY TO MISS. Without it the
arithmetic below is correct and then the browser scrolls anyway, because
focusing an element is itself a scroll request.**
⚠️ **AND THE ROW IS KEPT OFF THE EDGE BY ONE ROW'S HEIGHT. `nearest` puts
each new row flush against the boundary, so somebody stepping down reads
the list from a row with nothing under it and no idea what is coming. A
row of margin is the cheapest thing that makes a list feel navigable, and
it costs nothing at the ends because the clamp below cannot scroll past
them.**

🔴 **RECTS, NOT `offsetTop`, AND THE FIRST BUILD OF THIS USED `offsetTop` AND
WAS WRONG BY 579 PIXELS. `offsetTop` is measured from the `offsetParent`,
and `.pos-tbl-body` is `position: static`, so the offset parent is whatever
positioned ancestor happens to be further up the page rather than the
scroller. The number looked like a position inside the scrolled content and
was a position inside something else entirely.**
⚠️ **A RECT IS MEASURED FROM THE VIEWPORT AND THAT DOES NOT MATTER HERE,
because both rects are read in the same frame and only their DIFFERENCE is
used. Where the page is cancels out.**
⚠️ **AND ONLY `scrollTop` IS WRITTEN, which is what keeps the document still.**

🔴 **WHAT DID NOT FIT, REPORTED TO THE AUTHOR. The same answer
`createDiagram` gives about a label too long for its box, and for the
same reason: a heading that does not fit is a fact about the column list
somebody declared, and the reader is the one person who can do nothing
about it. `shell.css` stops a heading wrapping and clips it instead; this
is the half that says which one was clipped.**
⚠️ **IT IS A METHOD, NOT A PROPERTY, BECAUSE A TABLE CANNOT MEASURE ITSELF
UNTIL IT IS ON SCREEN. `createDiagram` measures its own text with a
canvas and can answer while it is being built; a grid's track widths are
the browser's answer to a box it has not been put in yet. So this is read
after mount, from a page's own self-check.**
⚠️ **AND `measured` IS THE HALF THAT KEEPS IT HONEST. A table inside a tab
nobody has opened, or one with no rows in it yet, has no layout at all
and every cell reads zero wide, which would report every heading as cut,
or with the test the other way round, report a broken table as clean.
"We did not look" answers `measured: false` and no cuts, which is
CLAUDE.md's rule about a probe that could not answer.**

## Pointers, wheels and the browser's own defaults

**From `demo/shell/slider.mjs`.**

⚠️ **A POINTER THE BROWSER NEVER SAW CANNOT BE CAPTURED, AND THE THROW TOOK
THE WHOLE DRAG WITH IT. `setPointerCapture` raises `NotFoundError` for an
id that is not an active pointer, which is every synthetic `PointerEvent`
a page dispatches at itself, and the exception escapes before the value
is read or `onInput` fires. So a check that drives a real pointer path
measured a control that had done nothing, which is the shape of failure
this project keeps paying for. Capture is an improvement on a drag that
leaves the lane, not a requirement of one.**

**From `demo/shell/knob.mjs`.**

⚠️ **`passive: false` OR `preventDefault` DOES NOTHING AND THE PAGE SCROLLS
UNDER THE KNOB. Chrome makes wheel listeners passive by default.**

## A control whose effect has not arrived yet, and one that was handed a state

**From `demo/shell/choice.mjs`.**

🔴 **A CONTROL WHOSE EFFECT IS SECONDS AWAY LOOKS BROKEN WITHOUT THIS, and
`/archive/radio/` is where it was reported: a speed button lights the moment it
is pressed and the sound takes about a second to get there, 600 ms of
already-scheduled audio plus the glide, so the first thing a listener does
is press it again. REPORTED as *"can we track when 0.5 etc happens and
animate the radiobutton until then?"*, which is the right instinct: the
wait is real and cannot be removed, so show the end of it.**
⚠️ **IT IS A SEPARATE CHANNEL FROM `aria-pressed`, deliberately. Chosen and
arrived are two different facts, the button IS the armed one throughout,
and collapsing them would make a pressed button appear unpressed while the
sound catches up, which is a worse lie than the one being fixed.**
⚠️ **IT SETS `data-busy`, WHICH IS THE SHELL'S OWN ATTRIBUTE, on purpose. Every
other button in this project says "working on it" with one sweep across its
face; this had its own opacity pulse for about an hour and was REPORTED as a
flicker. One idea, one picture, and reusing it means the reduced-motion
fallback, the `cursor: progress` and the colours all come along without a
second copy to drift. `shell.mjs` only ever sets `data-busy` on
`.pos-controls` buttons, so nothing collides.**

**From `demo/shell/picker.mjs`.**

🔴 **AND IT DRAWS THE NAME IT JUST SELECTED. IT DID NOT, AND THE CONTROL
READ `—` FOREVER. PHOTOGRAPHED on `/mirror/`: a LOOK picker with ten
shaders in it, a shader running, and a long em dash where the name goes.
The list was handed over correctly, `selectedIndex` was set correctly, and
the VISIBLE half was never told, so the cell kept the placeholder it is
built with until somebody pressed an arrow.**
⚠️ **IT IS NOT THE CALLER'S JOB TO CALL `show()` AFTERWARDS. Two pages did
and one did not, which is the definition of a thing that belongs in the
component.**

## A component asks its own box, and zero is not narrow

**From `demo/shell/local-remote.mjs`.**

🔴 **A MEDIA QUERY ADDS NO SPECIFICITY, AND WORSE THAN THAT, NO HARNESS HERE
CAN ENTER ONE. `demo/verify.mjs` runs at 756 px with no viewport override,
so every assert on every page in this repository passes without ever
entering its phone layout, and `.pos-pick`'s entire phone arrangement sat
dead in `shell.css` for weeks with every line of it correct. Deciding the
arrangement HERE, in JavaScript, off an attribute, makes both arrangements
reachable at any width: `/kit/` grades the phone one at desktop size, and
it is a MEASUREMENT rather than a reading of source order.**

🔴 **AND IT WATCHES ITS OWN WIDTH RATHER THAN THE WINDOW'S, which is the
other half. A component in a half page column on a 1280 px screen is 600 px
wide, and a viewport query would tell it it has room it does not have.
`/kit/` shows the phone arrangement by putting one in a 375 px frame, which
is how `CARD GRID ON A PHONE` already works, and that only works at all
because the component asks its own box.**

⚠️ **A BOX WITH NO WIDTH YET IS NOT A NARROW BOX. A component built inside a
closed tab panel measures 0, and reading that as a phone would lay the
whole thing out for a screen nobody has. `/kit/` has already been bitten
by exactly this: seven diagrams built inside a closed panel came out laid
out for 320 px inside a 658 px panel.**

## A badge that must not move, and a word that changes inside it

**From `demo/shell/presence.mjs`.**

🔴 **ONE COMPONENT, TWO MODES, AND THE ONLY DIFFERENCE IS WHAT IS VISIBLE.**
`mode: 'badge'` shows a dot, an optional fixed name and the word.
`mode: 'dot'` shows the dot alone and CLIPS the words rather than removing
them, so the accessible name is still "the board coming online" and the live
region still announces a change. **A dot whose meaning exists only in colour is
a dot a screen reader cannot read at all, and `display: none` is exactly how
that happens by accident.**

🔴 **NOTHING HERE CHANGES SIZE WHILE IT REDRAWS. Two separate guards, because
there are two ways this could move: the animated part is the dot's FILL and
the only property that animates is `opacity`, which cannot affect layout; and
the word sits in a box whose `min-width` is reserved at build time from the
longest thing this instance can ever say, measured in `ch` of the mono face
it is set in. So the badge is the same width in all four states and the same
width at every moment of the animation. Graded in `/kit/`, by measuring four
badges rather than by pressing one through four states.**
⚠️ **NO LETTER-SPACING ON THE WORD. `ch` is the advance of `0`, and letter
spacing adds to every advance, so a tracked-out word would overflow a reserve
computed in `ch` by exactly one space per character.**

🔴 **THE WORD CHANGES BY FADING THROUGH, AND THE REASONS ARE ALL ABOUT WHEN
IT HAPPENS. Asked 2026-09-16: *"how to animate online status srtings when
they change?"*.**

A state change is an EVENT, not a clock: it happens when something actually
happened, so unlike a live number this is allowed to move at all. What it
may not do is any of the three things this repo has already been bitten by.
**It cannot change width, because the reserve holds the widest word this badge
can say and the swap happens inside it. It cannot slide, because a slide
needs room to slide through and this box has none. And it cannot be slow:
90 ms out, swap, 90 ms back is under a fifth of a second, which is enough to
catch an eye that was elsewhere and too short to sit and watch.**

⚠️ **THE TEXT IS SWAPPED AT THE TROUGH, not at either end, so a reader never
sees two words in the same place. It is one element rather than two crossing
over, because two would need absolute positioning inside a reserve that is
already doing that job.**
⚠️ **AND A SCREEN READER HEARS IT WITHOUT ANY OF THIS: the badge is a live
region, so the word is announced on change whether or not it faded.**

🔴 **TWO LINES, NOT A MIDDOT, AND A `title` REALLY DOES BREAK ON `\n`.
Instructed 2026-09-19: no middots in anything a visitor reads. This one
reached every presence badge in the project, and it was gluing three facts
into one string: what the thing is, what it is doing, and the detail. The
first two are one phrase and are joined the way the badge's own visible
word already joins them, with a space (see `phrase` above, which has always
done it that way, so the middot here disagreed with the badge an inch
below it). The detail is a second fact and gets its own line, which is also
what CLAUDE.md's tooltip rule asks for: two or three short lines, never a
sentence with joins in it.**

## Drawing, and the things a canvas cannot see

**From `demo/shell/xy-pad.mjs`.**

⚠️ **`ctx.font` IS NOT CSS-VARIABLE-AWARE. A canvas font string is parsed with
no element behind it, so `var(--sans)` is invalid, the assignment is
silently IGNORED and the label comes out in the 10 px default. That is a styling
bug that throws nothing and logs nothing. Resolve the token here instead.**

**From `demo/shell/wave-view.mjs`.**

🔴 **THE BORDER IS ON THE WRAPPER AND NOT ON THE CANVAS, WHICH IS ARITHMETIC
RATHER THAN TASTE. `box-sizing: border-box` is global here, so a canvas with
a 1 px border whose CSS width is set from its container's width renders 2 px
of content narrower than its backing store and stretches the picture by
0.3 per cent. On a 1.3 second sample that is 4 ms of head position, which is
small and is also free to not have. The wrapper carries the border and
`clientWidth` is a CONTENT width, so the two agree by construction.**

## Read only, and the keys a `<button>` already owns

**From `demo/shell/step-grid.mjs`.**

🔴 **READ ONLY IS A STATE AND NOT `disabled`. A grid nobody may edit must not
look pressable: its pads are not buttons, they take no tab stop, they do not
brighten under a pointer and they show no focus ring. Greying them out would
say *this is switched off*, which is a different and false claim about a
picture that is perfectly current. It is the same argument `/tom/` already
makes about a row with no sample being a `div` rather than a disabled button:
eight dimmed controls read as a page that failed.**

🔴 **SPACE PLAYS AND ENTER TURNS A PAD ON AND OFF. Asked for as *"space
should play and stop. enter turns pad on and off"*.**
⚠️ **SPACE IS PREVENTED AND NOT HANDLED. A pad is a `<button>`, so the
browser's own default for space is to PRESS it, which would toggle a
step; stopping the propagation alone left the default firing, so space
toggled a pad and did not play, which is the two keys the other way
round. `preventDefault` kills the button default and the event is left
to BUBBLE to the transport bar's own keyboard table, which already owns
space as the play key on every page here. One binding for play.**
⚠️ **AND ENTER GETS `preventDefault` TOO, or a button fires its click as
well and the pad toggles twice, landing back where it started.**

## A panel over the page, and the button that sends it

**From `demo/shell/feedback.mjs`.**

🔴 **IT IS A FIXED OVERLAY AND IT IS APPENDED TO `document.body`, not into the
page. Two rules meet here. CLAUDE.md: nothing that changes while somebody is
looking at it may change how much room it takes. A panel unfolding under the
title would push a canvas, a readout, a transport bar and a log down the page
every time it opened. And the shell's vertical rhythm lives on
`.pos-stack`, so anything dropped inside the page would take the project's
one gap, which it has no business taking. Fixed and outside, nothing moves.**

🔴 **THE ORDINARY BUTTON, NOT THE PRIMARY ONE. Asked 2026-09-16: *"fields:
have buttons heiht. use secondary button here"*, with a photograph of the
yellow Send standing taller than the name field beside it.**

Both halves of that report are one cause. **`.pos-field input` and `button`
are both 34 px and always were; what made Send bigger is `button.pos-pri`'s
`box-shadow: 0 0 0 1px`, which paints a ring OUTSIDE the border and reads
as two more pixels of height and width that no layout number accounts for.**
Dropping the primary treatment puts the two controls on the same edge.

⚠️ **AND IT IS THE RIGHT WEIGHT ANYWAY. The site's yellow is spent on the
thing that is running; this is a dialog where Send is the only action, so
nothing is competing with it and nothing needs to shout. Return fires it,
which is the other half of being the default.**

🔴 **SEND IS THE DEFAULT BUTTON. ASKED FOR: *"defaul button on feedback
modal"*. Escape closes and Return sends, which is the pair every dialog a
reader has ever used gives them, and this panel had only half of it.**
⚠️ **NOT A PLAIN RETURN IN THE MESSAGE BOX. That is a four row `<textarea>`
and Return there is a NEW LINE, the one keystroke somebody writing a
paragraph presses most. Taking it would send half a note on the first
sentence, which is worse than having no default at all. Cmd or Ctrl and
Return is the escape hatch there, and it is the same combination Slack,
GitHub and every other box like it uses.**
⚠️ **AND IT IS NOT A `<form>`. A form would give Return for free and would
also give a page navigation on submit: the panel lives inside a demo that
is playing sound, and a navigation stops it. `preventDefault` on a listener
is the version with no way for that to happen.**

## Six cells to a readout row, and the rows are balanced

**From `demo/shell/shell.mjs`.**

🔴 **AND ABOVE SIX CELLS IT IS NO LONGER OPT IN, SINCE 2026-09-22. Reported
against `/plai/`'s eight cell readout, which the flex row laid out as
SEVEN AND ONE: *"make rule of max 6 in a row or go full 2 x 4. no odd
nrs"*. A lone cell on its own line reads as a cell that failed to load,
and at eight cells there is no width where the flex row does the right
thing by accident.**
⚠️ **THE OPT IN WAS THE DEFECT.** `rows` was added on 2026-09-21 for a ten
cell readout that wrapped 7 and 3, and it fixed that page and left every
page written afterwards free to make the same shape again. **A rule nobody
has to remember is the only kind that holds.**
✅ **SIX IS THE CAP AND THE ROWS ARE BALANCED**, which is the two halves of
what was asked: `ceil(n / 6)` rows, then the columns fall out of that, so
eight is 4 and 4 rather than 6 and 2. Nothing changes at six or fewer,
which is every page that was measured filling at thirteen widths.
⚠️ **A CALLER'S OWN `rows` STILL WINS, because a page that has named its
shape has a reason the cell count cannot see: `/pack/`'s `written` and
`not erasure` are a PAIR and belong on one line.**

## Reading the report, before touching the stylesheet

**From `demo/tom/index.html`.**

🔴 **I READ `no top padding on titles` BACKWARDS AND SPENT FOUR ROUNDS
REMOVING PADDING THAT WAS NOT THERE. It meant the title HAS no padding and
needs some. Every repeat after it said so again, in plainer words each
time, and each time I took more off: the card's top padding, then the
plate's own, then ten pixels from both columns. The last report was
`STILL NO TITLE PADDING`, in capitals, which is the same sentence as the
first one.**
✅ **SO THERE IS NO OVERRIDE HERE AT ALL NOW. The plate sits at
`panel-layout.mjs`'s own inset, which is what `/evo/`, `/twelve/` and
`/circuit/` get, and it is the answer to *"you have several instroments
done by now. can you not reuse ui?"*: the component already had this right
and every line I wrote was moving away from it.**

**From `demo/kit/index.html`.**

🔴 **THE LAST CHILD GIVES UP ITS BOTTOM MARGIN, AND THE PADDING WAS NEVER THE
PROBLEM. Reported 2026-09-21 with a crop of the `BUTTON GROUP` box as
*"bottom pading same as top"*. MEASURED before changing anything: the
padding was already 14 px top and bottom on all 39 boxes, and the ink
sat 15 px from the top and 29 from the bottom, because the last child
was a `.pos-controls` carrying its own `margin-bottom: 14px` which stacks
on the padding. Moving the padding would have moved 14 px of a 29 px gap
and been reported again, which is exactly what `/twelve/` was corrected by
screenshot twelve times for: *"less h padding on strip"*, where the padding
was already equal and a 146 px heading was leaving 50.2 px of air.**
🔴 **AND IT IS `:not(.kit-out)` BECAUSE EIGHT BOXES DO THIS ON PURPOSE.
`.kit-out` carries `margin-bottom: -14px`, deliberately cancelling the
padding so a readout strip sits flush to the box's bottom edge, and it is
the last child in eight of these. A blanket `:last-child { margin-bottom:
0 }` would have read as a tidy-up and silently unstuck all eight. The
survey is the only reason that is known: 11 of 39 boxes measured uneven,
and only ONE of the eleven was the reported defect.**

🔴 **THE RIGHT MATCHES THE BOTTOM SINCE 2026-09-22, ASKED FOR AS *"make sure
right padding is same as bottom"* with a crop of the last pad nearly
touching the right edge while there was clear room under it.**
⚠️ **ONE NUMBER READ TWICE, NOT TWO THAT HAPPEN TO MATCH.** Right and bottom
being equal is a claim that they are the same measurement, and `shell.css`
has repaired exactly this twice, as `--sld-col` and as `--ctl-gap`.
⚠️ **AND IT IS ON `.kit-pg` RATHER THAN ON THE SCROLLER, WHICH IS THE TRAP
WORTH NAMING.** `.kit-pg-strip` is the scroll container, and **a scroll
container's END padding is not reliably honoured once its content overflows:
it can be declared, be correct in the computed style, and render as nothing
at the far end.** `.kit-pg` is the flex parent and is never the thing that
scrolls, so its padding is real at every width.

## The gap the eye measures is not the gap the stylesheet sets

**From `demo/twelve/index.html`.**

🔴 **A KNOB NEEDS MORE AIR ABOVE IT THAN A BUTTON DOES, because its top edge
is a NUMBER rather than a border. Reported 2026-09-21 with a screenshot:
*"more space on top of right knob"*, showing the jog's `64` sitting almost
against the F4 button above it.**
⚠️ **THE ROW GAP IS MEASURED BETWEEN BOXES AND THE EYE MEASURES BETWEEN
INK.** A button's box has 8 px of padding inside its border before its
glyph, so `--ctl-gap` between two buttons reads as far more than 8. Between
a button and a bare number it reads as exactly 8, which is too close.
Doubling it here restores what the eye was expecting.

**From `demo/muta/index.html`.** A recorded reversal of *separation is spacing,
not lines*, and the scope of the reversal is the whole point.

🔴 **THE TWO GRIDS SIT SIDE BY SIDE WITH A DIVIDER BETWEEN THEM, ASKED FOR
2026-09-22 AGAINST A SCREENSHOT OF THEM STACKED: *"no. keep 2 x 2 group,
then divider then 3 x 2 grouo"*. This was `flex-direction: column` from
when it held two knob ROWS, so two GRIDS inherited the stacking and the
panel came out four rows tall.**
🔴 **AND THE DIVIDER IS A RULE HERE, WHICH REVERSES WHAT THIS FILE SAID.**
The note below it still records the older decision, that separation is
spacing and a widened gap did the job, and that was right for two groups in
ONE row. **It is wrong for two blocks that are each two rows deep: a gap
between them reads as the gap between columns inside them, because at this
pitch it IS one.** `panel-layout.mjs` already draws exactly this line for a
fixed column, `border-right: 1px solid var(--line)` with `--panel-gap`
either side, so this is that treatment rather than a new one.
⚠️ **`align-items: start`, or the shorter grid stretches and its knobs move
off the lattice the taller one sets.**

## A page borrows a whole namespace, and a pseudo-class counts by tag

**From `demo/grains/index.html`.**

⚠️ **NOT `.k`. That is the shell's PIANO KEY: 74 px tall, bordered, with its
own background. A label wearing that class drew an empty key inside each
block, back when this page drew a keyboard. A page that borrows a shared
stylesheet borrows its whole namespace whether it draws keys or not.**

**From `demo/circuit/index.html`.**

⚠️ **CLASSES, NOT `:first-of-type`. That pseudo class counts by TAG, and the
first div in this grid is now a brand label, so neither column rule matched
and both columns fell into the auto flow. It reported as a 336 px drift and
as two different controls both sitting at x 608.**

**From `demo/grains/index.html`, the page half of the `text-wrap: balance` rule.**

⚠️ **THE HEADING IS BALANCED AND THE PARAGRAPH UNDER IT IS NOT, AND THAT IS
WHERE THE LINE GOES. `lessons/css-shell.md#pos-lr-say` carries the argument (the `.pos-lr-say` rule left shell.css with local-remote):
`text-wrap: balance` is for short centred prose, and Chromium stops
balancing past a handful of lines, so the span below, which holds four
sentences at 62 characters a line, is a paragraph and gets nothing.
MEASURED on the five headings this page can show, 2026-09-23: all five fit
one line down to 390 px, and at 360, which is an ordinary Android phone,
`Another page took the granulator out` lays out 289.0 px over 27.1 px
greedily and 153.5 over 162.6 balanced. One word alone under a full
line, centred, is exactly the shape this property exists for.**

## A reserved box, a waiting surface, and the ground under a glued part

**From `demo/wish/index.html`.**

🔴 **ONE RESERVED HEIGHT, FLOOR AND CEILING THE SAME NUMBER, ASKED FOR
2026-09-22 AS *"separate json dump to sepatate block, reserve its
hight"*. It was a 62 px floor and an 18 line ceiling while this box held
every link at once; it holds ONE now, the selected row's, and a box that
is 7 lines for one connection and 16 for the next would move the log and
the end of the page on every press of a row. That is the caption that
reflowed sixty times a second on `grain-scope`, arriving through a
click.**
⚠️ **IT SCROLLS INSIDE ITSELF RATHER THAN CLIPPING, because the one thing
this box exists to show is the argument a refusal names, and that can be
on any line of it. A clip would hide exactly the evidence a reader came
for, which is the defect `pre-wrap` was introduced to fix from the other
direction.**
⚠️ **AND THE NUMBER IS A LINE COUNT RATHER THAN A PIXEL GUESS, MEASURED
OVER WHAT ONE CONNECTION CAN BE: 7 lines with no transform on it, 12 with
one, 16 with two, which is the longest this desk's own examples produce.
14 holds the common case whole and lets the longest scroll by two lines,
against a reservation of 16 that would stand 60 px of air over every
ordinary answer and over an empty page.**

🔴 **A TEXT SURFACE THAT IS WAITING FOR SOMETHING SAYS SO, WITH THE SAME
SWEEP EVERY CONTROL IN THIS PROJECT USES. Asked 2026-09-21: *"make
textinputs / areas have same glimmer fade when processing, waiting for
input. bit moer subtle"*.**
⚠️ **SUBTLER IS ONE NUMBER AND NOT A SECOND ANIMATION. The button's sweep is
`var(--fg)` at 22 per cent; this is 9, because a button is a small bright
object and these two are the largest surfaces on the page. The PERIOD is
deliberately the same 1.1 s: two sweeps side by side at different rates
beat against each other, which is a second thing to look at rather than a
quieter version of the first.**
⚠️ **`@keyframes pos-sweep` IS `shell.css`'s OWN, reused rather than copied.
One idea, one picture, which is the argument `choice.mjs` already makes
about its own pending state.**
⚠️ **PAINT ONLY, WHICH IS THE STANDING RULE: `background-image` changes no
size, no border width and no shadow spread, so nothing under a reader's
hand moves while it runs. Asserted as a measured height rather than
believed.**

**From `demo/pack/index.html`.**

⚠️ **EVERY GLUED PART PAINTS ITS OWN GROUND. `.pos-glue` is `gap: 1px` over a
`--line` ground, so a child with no background lets that colour through its
whole area and the 1 px seam stops being a seam. MEASURED on `/wish/` the
same day; neither of the kit's existing glued pairs says it out loud.**

⚠️ **THE PICTURE'S HOST PAINTS A GROUND TOO, AND IT WENT RED WITHOUT ONE.**
The component styles its own `.pos-wave` and this is the wrapper the page
puts it in, so it had no background and the glue's line colour came
straight through its whole area. Third part, same trap, measured the same
day on `/wish/`.
🔴 **AND THE GROUND IS ALL IT CARRIES NOW. It was `background` plus
`padding: 10px 12px` until 2026-09-22, removed on a screenshot reading
*"rm padding and its border around waveform canvas"*: an inset picture
inside a glued part reads as a box drawn inside a box, and the seam is the
only edge this surface is meant to have. The GROUND stays, because taking
it would let the glue's line colour through the whole part, which is the
trap the paragraph above records.**

## The accent is a budget

**From `demo/floor/index.html`.**

🔴 **THE DATE IS NOT AN ACCENT. It was `--hi`, which is this project's one
accent and is spent on what is CHOSEN or LIVE. A date is neither: it is the
same fact for every tile on the floor, and painting it yellow made the one
constant in the caption the loudest thing in the picture. Asked for
2026-09-19: "move date field last and lose yellow".**


## From the handoffs (extracted 2026-10-19)

- **Secondary buttons are in capitals, the primary keeps its own case.** Asked 2026-09-30 as *"cap: all secondary buttons"*, committed 2026-10-03. (`HANDOFF.md, session 60 (2026-10-03)`)
- **Disable a kit button with `group.enable(id, false, reason)`**; setting `.disabled` is undone when a press finishes. (`HANDOFF.md, session 74 (2026-10-11)`)
- **A patchbay hop is one object**: rebuilt on every read it is a new wire each time, and MIDI never pulsed. (`HANDOFF.md, session 74 (2026-10-11)`)
- **Never decide on `AudioContext.state` while a resume is in flight**: Chrome reports `suspended` for 1.5 to 3 ms after `resume()`, and a `suspend()` in that window leaves it `running` with a frozen clock. `release()` in `audio.mjs` waits. (`HANDOFF.md, session 65 (2026-10-06)`)
- **Import a module with a top-level `await` after `mount()`**, or it delays mount and the inline favicon (a `/favicon.ico` 404 went red one run in three). (`HANDOFF.md, session 63 (2026-10-05)`)
- **A default taken one step too far looks broken**: HARDWARE behind Start hid the drawing as well as the CPU. (`HANDOFF.md, session 65 (2026-10-06)`)
- **`transport-bar.mjs` extras take `onPress ?? onClick`.** Before, `x.onClick?.(b)` made a misspelled handler a silent dead button. (`HANDOFF.md, session 50 (2026-09-25)`)
- **`presence.mjs` throws on any state but `online, checking, coming, offline, unknown`**; for "starting" use `coming` with a page `says` override. (`HANDOFF.md, session 50 (2026-09-25)`)
- **`soloFooter` makes a later `glue()` throw** rather than stack a second footer. (`HANDOFF.md, session 50 (2026-09-25)`)
- **`createTransportBar(parent, ...)` appends to `parent`**: the first argument is a mount point. Repointing a container is not merging its contents. (`HANDOFF.md, session 49 (2026-09-25)`)
- **`picker.mjs` wires `prev` and `next` to its arrows, and `onPick` belongs to the `<select>`**, so work put only in `onPick` makes an inert control. (`HANDOFF.md, session 51 (2026-09-26)`)
- **`video-panel.mjs` cannot replace its picture**: emptying `panel.stage` loses the caption slot and the full screen exit (as of 2026-09-30). (`HANDOFF.md, session 57 (2026-09-30)`)
- **`glue.mjs` must not import from `shell.mjs`** (a cycle in the frame every page mounts); it carries a local `div()`, as `stack.mjs` does. (`HANDOFF.md, session 53 (2026-09-28)`)
- **iPhone Safari audio**: `wakeAudioOnGesture()` (`audio.mjs`, installed by `createKeyboard`) sounds from the second touch; a second touchend within 350 ms is prevented so a repeated note never zooms; MP3s that start mid frame go through `fromFirstFrame()` (`mp3-frames.mjs`). Not tested on an iPhone. (`HANDOFF.md, session 77 (2026-10-14)`)
- **Share images use no browser**: `share-card.mjs` writes SVG from `font-metrics.mjs` and vendored resvg-wasm rasterises it at build. Names are hashed (`TEMPLATE_V`), so a change is a new URL. (`HANDOFF.md, session 77 (2026-10-14)`)
- **JetBrains Mono 600 draws the `?` dot wider than tall**, a pill. (`HANDOFF.md, session 77 (2026-10-14)`)


## The owner's corrections (from sessions 2026-09-29 to 10-19)

- One press gives sound at once, with a default that is easy to listen to; no second start, no "play with sound" button.
- Calm motion: nothing on a page jitters or changes shape while it plays (*"scopes are very nervous"*, *"moving cursor adds stress"*).
- A control or readout with no visible effect or meaning is removed (*"when no visual impact or absolutely mininak, remove"*).
- No annotations on a visual: labels go in the panel footer (*"no need for annotations"*).
- "Lost" means cut controls, never add a switch; something hidden is removed (*"box hidden: just rm box"*).

## Retired

Rules moved here verbatim, with the date and the reason. Do not apply them to
new work; they explain old pages and old commits.

### The size of a page's prose, superseded 2026-09-19 and 2026-10-12

Superseded by CLAUDE.md's one sentence rule for `what` and `one` (2026-09-19)
and by the two short sentence card rule (2026-10-12), both owned by
`positron-describe`. Concept pages start with `what: ''` and say their line on
the card. Moved here 2026-10-14; a pointer stays where it stood.

- **Write for someone who does not work here.** Terse, but understandable —
  those are not in tension, and the old rule ("no explanatory prose, one line
  and a readout") produced pages that only their author could read. A demo page
  carries two things: **ONE paragraph of three or four sentences** saying what
  happens, how it is done and what the numbers mean — and a readout of real
  numbers. It was a lead line plus a second `d.how()` paragraph until
  2026-09-08; two blocks meant the lead said too little and the mechanism went
  unread. `d.how()` is gone; put it all in `what`.
