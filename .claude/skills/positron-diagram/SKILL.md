---
name: positron-diagram
description: How a hand-written diagram (demo/shell/diagram.mjs) is written, and how it differs from the patchbay picture a concept page draws from its own bay. What goes in a box, a label, a sub, a note and an arrow, and where the picture sits. Load before drawing or editing any diagram with diagram.mjs, a slide's diagram in demo/slides/deck.mjs, or before choosing between a diagram and a patchbay picture for a page.
metadata:
  internal: true
---

# A diagram is written to a different rule from prose

`demo/shell/diagram.mjs` draws it. What follows decides what goes in it.

## Status: not part of a new page, since 2026-10-14

The owner, 2026-10-14: *"diagram is not part of new page templates any ore, it
lives in a kit and archived pages. it might come back maybe."* So a new page
does not get a `diagram.mjs` picture. The module stays, at `/kit/diagram/` and
in the archived pages that carry one, and the rules below hold for those and
for the day it comes back.

## First: on a concept page the patchbay IS the diagram

Checked 2026-10-14: **no concept page calls `createDiagram`** (`grep -rl
createDiagram demo/<every CONCEPT_DIRS folder>` finds nothing). A concept page
draws its machinery with `createPatchbay` (`demo/shell/patchbay.mjs`), which
draws `createBayView` (`bay-view.mjs`) from the page's own bay: a box is a node
(`bay.nodes()`), its inlets and outlets are its ports (in on the left, out on
the right; on a phone, in on the top edge and out on the bottom), a wire is a
link coloured by the out port's medium, with no arrowhead. In that file's own
words: *"No typed labels, no notes: rename a port and the picture follows."*

So the choice is made by what the picture is OF:

- **A patch that runs** (what reaches what on this page, now): the patchbay.
  Nobody writes its boxes. A wrong picture is a wrong link, fixed in the bay,
  never in a label. Its own rules are in `positron-concepts` (port names,
  medium colours, `MEDIUM_COLOURS`) and `positron-compose` (where the block sits).
- **An explanation drawn by hand** (machines and services nobody announces, a
  slide, a kit specimen): `diagram.mjs`, and every rule below. Today that is
  `/kit/diagram/`, the slide decks (`demo/slides/deck.mjs`) and the archived
  demos that still carry their `How it works` picture (`weight`, `patchbay`,
  `archive/radio`, `llhls`, `wish`, `pack`, `collide`, `cam`, `nola`, `stage`,
  `floor`, `fau`, `webrtc`, `draw`, `moq`, `mirror`, and the tab modules of
  `wire`, `time`, `sync`, `csound`).

⚠️ **THE TWO VOCABULARIES MEET AT THE NAMES.** The rules below about what a
box is CALLED (`Browser`, `Cloudflare`, name the thing that runs, no article in
a label) are the same instinct as the bay's site and node names: in a bay the
visitor's tab is site `web`, a Cloudflare service is a site of its own
(`cf-relay:<room>`, `cf-stream:live`, `cf-store:history`), and the Pi is `pi-1`.
A slide that draws a patch by hand should use the bay's names, not invent a
third set.

## The rules for a hand-written diagram

- 🔴 **A DIAGRAM IS WRITTEN TO A DIFFERENT RULE FROM PROSE, AND HERE IT IS.**
  - 🔴 **THE VISITOR'S MACHINE IS CALLED `Browser`. ALWAYS THAT WORD.** Not
    `your device`, not `this page`, not `here`. It is the name of the thing, a
    reader meets it on more than one diagram, and a name learned once should
    not be re-learned per page. The same goes for the other machines: `Cloudflare`,
    `Icecast`, `ffmpeg` are what those things are CALLED.
  - 🔴 **A CONTAINER IS NEVER EMPTY. IT HOLDS AT LEAST ONE BOX.** Instructed
    2026-09-20: *"General: do not do empty cludflare boxes, have inner boc with
    worker or smth"*, after two were reported in one afternoon: `/floor/`'s
    `Cloudflare` (`sub: image proxy`, no children) and `/blocks/`'s `Relay
    object` and `controllers`. An empty container takes a machine's worth of
    space and says a caption's worth of thing, so it reads as a gap in the
    picture rather than as a part of it, and on a phone, where containers are
    stacked full width, it is a screen of nothing.
    ⚠️ **IT IS THE SAME RULE AS `a container takes no note`, FROM THE OTHER
    END.** That one says the children already say what the machine is. This one
    says there have to BE children for that to be true. With none, the `sub` is
    doing a child's job and doing it worse, because a `sub` is three or four
    words and a box has a name, a kind and a note.
    ⚠️ **NAME THE THING THAT RUNS, NOT THE SERVICE IT RUNS ON.** `Cloudflare`
    is a machine; what goes inside it is the worker (`workers/img`,
    `workers/relay`, `workers/station`), a Durable Object, a bucket. (⚠️ 2026-10-14: `workers/img`
    is no longer in `workers/`; `relay` and `station` are.) The same
    goes for `Browser`, which holds the elements, and for `Raspberry Pi`, which
    holds the programs.
    ⚠️ **AND IF THERE IS HONESTLY NOTHING INSIDE, IT IS NOT A CONTAINER**: draw
    it as an ordinary box with a name, a `sub` and a `note`, which is what a
    single thing has always been.

  - 🔴 **A CONTAINER TAKES NO `note`.** A box holding other boxes is a machine,
    and its name and the boxes inside it already say what it is. A paragraph on
    it repeats the children underneath it and is read before them, which is the
    wrong order. Notes belong on the boxes that do something and on the arrows
    between them. Reported as noise on three containers at once.
  - 🔴 **A DIAGRAM OPENS A SECTION AND SITS 44 px BELOW WHAT PRECEDES IT.**
    Not the body's ordinary 40 px rhythm: a picture of the machinery is a new
    part of the page, the way `.pos-how` already is. The number is declared once
    in `shell.css` on `.pos-body > .pos-dg`, so a page that brings its own
    `title` and a page that uses the standing heading cannot end up at two
    distances, which is exactly what happened and was spotted by comparing two
    pages side by side.
  - 🔴 **IT GOES LAST ON THE PAGE, AND IT PASSES `how: true` AND NO `title`.**
    A diagram is REFERENCE: it is read once, on purpose, by somebody who has
    already pressed the thing and wants to know what is behind it. Put between
    the page's sentence and its controls it delays the only thing a first
    visitor came for, and it makes the page look like documentation with a demo
    attached. Under the controls and the readout it is exactly where somebody
    who now has a question will look for one.
    🔴 **EVERY DIAGRAM PASSES `{ how: true, atEnd: true }` AND NO `title`, AND
    THE HEADING IS `How it works`, WHICH LIVES IN `diagram.mjs` AS `HOW`.**
    Never typed on a page. A page that passes a `title` alongside `how` gets it
    REFUSED and reported on `cuts`, because `/station/` once shipped two
    headings stacked.
    ⚠️ **THE WORDING WAS `How this works` AND WAS CHANGED ON A DIRECT ASK,
    2026-09-16.** `it` is the settled English phrase, a reader recognises it
    without parsing, and on these pages `it` ALREADY means the demo because
    every `what` paragraph uses it that way. `this` pointed at something
    position already makes unambiguous: the picture is last on the page it
    belongs to.
    🔴 **ONE EXCEPTION EXISTS AND IT IS `atEnd: false`, NOT A SECOND TREATMENT.
    ADDED 2026-09-21 ON INSTRUCTION**: *"patches: patched table 1/2 less high,
    diagram under it, reserver space when no active one"*. `/pack/`'s picture is
    the DETAIL PANEL for the pressed table row, not reference: it repaints with
    that patch's own waves, filter, envelope and matrix. **A detail panel two
    screens below the row it describes is not a detail panel.** So it sits inside
    the tab under the table.
    ⚠️ **AND THE AMENDMENT IS THE SMALLEST ONE THAT HONOURS THE ASK.** Same
    component, same standing `How it works` heading, still no `title`, still one
    per page. **Only `atEnd` changes**, and the host is the element the selection
    lives in. Everything the original rule was protecting survives: the picture
    is still below the controls, there is still exactly one treatment, and a page
    still cannot type its own heading.
    ⚠️ **THE TEST FOR THIS EXCEPTION IS WHETHER THE PICTURE CHANGES WHEN THE
    READER PRESSES SOMETHING.** A picture that is the same on every visit is
    reference and goes last. A picture that is a reading of the thing under the
    pointer belongs beside it. If you are moving one for any other reason, you
    are moving it for the reason this rule already refused.
    🔴 **AND A LIVE PICTURE MUST RESERVE ITS ROOM BEFORE ANYTHING IS SELECTED**,
    or it grows into the page the first time somebody presses a row. `/pack/`
    draws the reference's own DEFAULT patch at load, built out of the address
    table rather than typed, so every box carries a sub and the figure has
    exactly the height it will keep. **An empty box is shorter than one with a
    sub**, so blank subs reserve the wrong height, which is the `min-height` that
    never applied wearing different clothes. MEASURED: 444.1 px at rest and
    444.0 px with 64 patches loaded, asserted on the page.

    ⚠️ **AND THE DRIFT THIS PREVENTS WAS REAL AND MEASURED, NOT HYPOTHETICAL.**
    On the day the rule was written there were THREE treatments across six
    pages: four passed `how: true`, `/crate/` typed its own lowercase title, and
    `/grains/` drew into `d.head` with no heading at all, so its picture came
    first. All six are uniform now. This line itself said `title: 'how it
    works'` for weeks while the code said otherwise, and an agent working from
    this file is what caught it.
  - 🔴 **A PAGE WITH A DIAGRAM HAS A ONE LINE `what`, AND IT IS THE INDEX'S OWN
    LINE.** A paragraph and a picture of the machinery are two explanations of
    one thing and the paragraph is the weaker of them: it describes what a
    reader can point at an inch below. Use the `one` line from `manifest.mjs`
    verbatim, so a visitor arriving from the index is not told the same thing
    twice in two wordings that can drift apart.
  `demo/shell/diagram.mjs` draws it; these decide what goes in it.
  - **A box label is a NAME.** `Icecast`, `scsynth`, `speakers`.
    ⚠️ **AND A DIRECTION IS NOT A NAME.** `/keys/` split one relay into two boxes
    by role and labelled them `notes out` and `sound back`, which are captions
    saying which way the traffic goes. Reported as *"not good names"*. Where one
    machine is drawn twice by role, the LABEL is what that half carries
    (`notes`, `audio`) and the `sub` is what the thing IS (`Relay object`, the
    Durable Object's own class name). The direction is already in the arrows. It has to fit
    the box at the width the layout gives it, which is about fourteen
    characters, and a label that gets cut is reported on `cuts` for the author
    to fix rather than ellipsised at the reader.
  - 🔴 **NO ARTICLE IN A LABEL. NOT `a`, NOT `an`, NOT `the`.** A label is a
    NAME and names do not take articles: `a granulator` and `an item` read as
    the start of a sentence somebody did not finish, and on an arrow they are
    worse, because `a banner` and `the same` are the two halves of a caption
    that is not there. Drop the article and what is left is either a good label
    or a bad one that was hiding behind it: `a granulator` becomes `granulator`,
    `an item` becomes what actually travels (`POST /items`), and `the same` was
    never a label at all. ⚠️ THE `sub` AND THE NOTE ARE DIFFERENT: those are
    prose and take articles normally.
  - **The `sub` is what KIND of thing it is**, in three or four words:
    `port 8001`, `SuperCollider`, `25 Hz, OSC`. Never a second sentence.
  - 🔴 **A QUANTITY IN A `sub` OR A LABEL IS WRITTEN SHORT: `10s`, NOT `ten
    seconds`.** Reported 2026-09-16 on `/station/`, which read `R2, ten
    seconds`. A sub has about fourteen characters of room and a number spelled
    out spends nine of them on a value a digit carries: it is the one place on
    a page where a figure has to be read at a glance, in a box, next to another
    box. `10s`, `2h`, `128k`, `16ms`, `500KB`, `90fps`. ⚠️ THE `note` IS
    DIFFERENT and takes ordinary prose, because it is a sentence read on hover
    with room for one. And this is about DIAGRAMS: a readout cell already has
    its own rule, and a `what` paragraph is prose.
  - 🔴 **THE `note` IS TWO SENTENCES. NOT THREE, AND NEVER SIX.** It is read
    once, on hover, under the picture, and it should say what a reader CANNOT
    see: why this box is here, what it does that the name does not imply, the
    number that matters. It must never repeat the label, which is on screen an
    inch away. `createDiagram` reports anything over about forty words on
    `cuts`, the same way it reports a label that did not fit.
  - 🔴 **AND NOTHING ABOUT HOW THE PICTURE WAS MADE.** The note that bought this
    rule ended *"What feeds the server is not visible from outside it. The
    titles that arrive look like filenames, so something is playing files into
    it, but that is a guess and no box is drawn for a guess."* Every word true,
    and it is the author talking to himself about his own drawing in front of
    somebody who asked what a radio station is. Reported as **"awful slop with
    no audience"**. There is no audience for what you considered, what you could
    not determine, what it used to say, or why you stopped. If a thing is not
    known, leave it out; the absence of a box already says so.
  - 🔴 **A NOTE NAMES THE TECHNOLOGY. THE NO-JARGON RULE WAS DIALLED TOO FAR
    BACK AND THIS IS THE CORRECTION.** A note saying a box "rides the station's
    loudness and changes the synth twenty-five times a second" describes an
    effect and names nothing a reader could look up, search for, or recognise.
    `setInterval`, `AudioContext`, `Lag.kr`, `MediaRecorder`, `allow-origin`,
    `Icecast` are what those things ARE CALLED, and a note is exactly where they
    belong: it is read once, on purpose, by somebody who pointed at the box
    because they wanted to know what is in it. The banned words were always the
    PRIVATE vocabulary of this project (a fold, a lane, an evidence gate, a
    horizon), never the public names of real technology. When a note could be
    describing any of four implementations, it is not yet a note.
  - **An arrow's label is WHAT TRAVELS**, not what the step is called:
    `128 kbit/s`, `OSC /n_set`, `grains`. Its note says what that actually is.
  - 🔴 **NO FILE PATHS AND NO WARNING EMOJI IN ANYTHING A VISITOR READS.**
    `shell/icy.mjs` in a note tells a visitor nothing and tells a reader of the
    code something they could have grepped; ⚠️ in a sentence under a picture is
    an alarm about a fact that is not alarming. Both belong in comments.
    ⚠️ **AND THE LOG BOX IS SOMETHING A VISITOR READS.** `items` shipped a
    ⚠️ at the head of a log line about Focus modes. The line was worth saying and
    the emoji made an ordinary fact look like a fault on a page whose log is
    where real faults are reported, which is the one place a false alarm costs
    something. A path, a warning emoji and a file name are all the same mistake
    in a log line as in a note. This applies to prose in a code comment too when
    it is quoted into a page.
  - 🔴 **BOXES INSIDE ONE MACHINE ARE JOINED WITH AN ARROWHEAD, LIKE EVERY
    OTHER LINE IN THE PICTURE. THIS REVERSED ON 2026-09-16 AND THE OLD RULE IS
    BELOW SO IT IS NOT RE-ARGUED.** Instructed with a screenshot of `video`,
    `cue log` and `timeline` joined by bare lines: *"need arrowheads between
    inner boxes (make it a rule)"*.
    ⚠️ **WHAT THE OLD RULE GOT RIGHT AND WHY IT STILL LOST.** It said a head
    claims an ORDER between the parts of one program that the drawing does not
    know, and a tie is a bracket meaning only "these are parts of one thing".
    That is true and it is not what a reader sees. A headed line, then a
    headless one, then a headed one down a single column reads as **a head that
    fell off**, which was REPORTED on `/station/` and then again on `/replay/`.
    A convention only works if it is legible, and this one was being read as a
    bug every time it appeared.
    🔴 **THERE ARE THREE ANSWERS, NOT TWO, AND A CONTAINER PICKS ONE.** An
    ARROW is the default and says these boxes feed each other. `set: true` draws
    a BRACKET and says they are parts of one machine. `join: false` draws
    NOTHING, and is right where the container's own box already carries the
    whole relationship: `/keys/`'s `Browser` holds a keyboard and a playout, and
    a line between them adds no fact, it just gives the eye something to follow
    that leads nowhere. Asked for on sight: *"no connections between
    keyboard/playout and and notesout/soundback"*.
    🔴 **A RETURN PATH NEEDS `back: true` AND IT IS AN AUTHOR FLAG.** Nothing
    infers it. A link without it is laid out as a forward step, so a right to
    left link is drawn through whatever stands in the way: on `/keys/` it ran
    straight through `playout` and put its head on the far left of the Browser,
    reported as *"what is this thing on left of playout?"*.
    ⚠️ **AND A RETURN PATH LANDS ON THE BOX, NOT ON THE MACHINE AROUND IT.**
    Fixed 2026-09-16 after *"capture should conntect to sound back and that
    should connet to playout"*: back links attached to containers while forward
    links attached to boxes, so the two halves of one picture disagreed about
    what a link connects and only the return half was wrong.
    🔴 **`set: true` IS THE ESCAPE HATCH FROM THE HEAD, AND IT IS THE ONLY
    CASE THE OLD RULE SHOULD EVER HAVE COVERED.** A machine whose children
    really are a SET rather than a chain declares it and gets brackets back.
    `/station/`'s `studio` holds a live mount and recordings that already exist,
    and neither produces the other; its `Cloudflare` holds two buckets side by
    side. Both say `set: true` and the page asserts `dg.ties === 2`.
    ⚠️ **A DECLARED LINK IS UNAFFECTED EITHER WAY**: it replaces the connector
    in that gap and has always had a head. `set` decides only what an
    UNDECLARED gap between two neighbours looks like.
    ⚠️ **AND IF YOU ADD A FLAG LIKE THIS, CARRY IT TO THE RENDER NODE.** `box()`
    builds a fresh object rather than spreading the spec, so `set` was invisible
    to the painter and read as an option that did nothing. It cost two runs.
    🔴 **A DECLARED LINK BETWEEN TWO OF THEM IS DIFFERENT, AND IT REPLACES THE
    TIE RATHER THAN BEING DRAWN OVER IT.** The reasoning above is about what the
    DRAWING knows; where the author writes `{ from, to }` between two children,
    the direction has been stated, so the tie has nothing left to add and the
    arrow takes its place. Never both: two lines down one gap is exactly the
    confusion a return path runs under the row to avoid.
    🔴 **AND IT TAKES NO LABEL. THE DIRECTION IS THE WHOLE MESSAGE.** The gap
    two stacked children share is sixteen pixels tall and half a box wide, so a
    name in it either runs under both boxes or shrinks below the point of being
    read. **What travels goes in the link's `note`**, which is read on hover in
    the line under the picture, where there is room for a sentence. A `label`
    written on one anyway is reported on `cuts` and not drawn, because an author
    who cannot see their own label has no way to know where it went. ⚠️ The rule used to
    end "if two children really do feed each other in a way worth drawing, they
    are two machines, not one", and that was wrong in the one case it was
    tested on. `/station/` groups seven boxes into three machines, and four of
    its seven arrows are between boxes on ONE of them: R2 to R2, a schedule to
    the Worker that reads it. Ungrouping them to get the arrows back loses the
    fact the picture exists to carry, which is who runs what. `createDiagram`
    routes them now: in the gap two neighbours share, or in a lane inside the
    container for one that reaches past the box between them.
    🔴 **AND A LINK IT STILL CANNOT ROUTE IS REPORTED ON `cuts`, NEVER DROPPED.**
    This is how three real arrows went missing from that page for two sessions:
    they were refused with a `console.warn` nobody was reading, the ties stood
    where they should have been, and the picture looked complete while claiming
    a chain that does not exist. A link from a container to a box inside ITSELF
    is the one case left, and it says so in writing.
  - **Labels sit top-left** (`BOX_ALIGN` in `diagram.mjs`, one switch, so the
    whole project reverts together). Centred puts two boxes' names at two
    heights for a reason nobody can see.

## The pages named above, where they are today (checked 2026-10-14)

The rules were bought on these pages; the pages moved, the rules did not.

| named above | today |
| --- | --- |
| `/floor/`, `/pack/`, `/weight/` | archived 2026-10-12/13, still served at their URL |
| `/station/` | retired 2026-10-07, `archive/demos/station-index.html` (eccm removed its radio) |
| `/crate/` | retired 2026-10-02, `archive/demos/crate-index.html` |
| `/replay/` | retired, `archive/demos/replay-index.html` |
| `/keys/` | retired 2026-09-17, `archive/keys/` (`positron-history`) |
| `/blocks/` | archived 2026-09-24, a 404, `archive/demos/blocks-index.html` |
| `/grains/` | a 404 since 2026-10-13, `archive/demos/grains-index.html` |
| `items` | archived 2026-10-01, `archive/items/` |

## From the handoffs (extracted 2026-10-19)

- **Grade a how it works diagram against the page**: laid out at its real width, nothing cut, every box something the page really uses (`/flipper/`'s was checked against the requests it made; `/stage/`'s stopped claiming Stream writes to R2). (`HANDOFF.md, session 64 (2026-10-05)`, `session 63 (2026-10-05)`)
- **At 375 px `diagram.mjs` draws a cross-container label over another** in the gap between stacked containers, and `cuts` does not report it. (`HANDOFF.md, session 56 (2026-09-30)`)
- **Only top-level box names take a hue**, and a return path into a box that is not the bottom one is drawn behind the box under it. (`HANDOFF.md, session 64 (2026-10-05)`)

## Retired

Nothing in this skill was retired: every rule is about `diagram.mjs`, which
still draws on `/kit/diagram/`, in the slide decks and on the archived pages.
What changed is how often it applies, which the first section says.

