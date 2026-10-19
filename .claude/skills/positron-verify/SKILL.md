---
name: positron-verify
description: Harnesses, asserts, self-checks, stand-ins and the traps that make a working page read as broken. Load before running or changing any verify harness, before adding or removing a control, before believing a red run, and before reporting a measurement or an absence.
metadata:
  internal: true
---

# Grading this project, and the instruments that lie

The rule under most of this section is that a green suite can mean zero
coverage, and that the only thing separating a check from a decoration is
having broken it on purpose once.

## What gets graded today, and where (checked 2026-10-14)

The project is a patchbay now: every page is a patch of nodes on sites, joined
by links that carry a medium (`MEDIA` in `demo/shell/bay.mjs`: midi, audio,
clock, value, video, program, file, state). So most grading is about three
questions, in this order, from cheapest to dearest: does the model refuse what
it must, did something actually travel along a link, and does the page that
draws it still parse and run.

**1. The model, with no browser at all.** These are pure files and each one runs
in a second with `node`:

| test | grades |
| --- | --- |
| `node demo/shell/bay-test.mjs` | the bay's arithmetic: ports, `shape` and `accepts`, transforms, a link refused with its REASON |
| `node demo/shell/bay-node-test.mjs` | a page as a node against a relay in the file: which room, nothing opened before a press, which site, who answers a `link.request` |
| `node demo/shell/graph-registry-test.mjs` | the board's `boardGraph` and the page's `createRegistry`, the round trip from the Pi's state to a bay that refuses a bad link (20 of 46 asserts are named NEGATIVE CONTROL in its header) |
| `node demo/shell/link-options-test.mjs` | a video link's size and rate, refused in words per medium (13 negative controls) |
| `node demo/shell/midi-graph-test.mjs` | this browser's MIDI ports as nodes whose ids survive a replug, against a fake MIDIAccess |
| `node demo/shell/concept-list-test.mjs` | every card `say` against the card rule, and every concept id as `<group>/<slug>`, one plain word |

Every one of those headers says MOST OF THESE ARE NEGATIVE CONTROLS, for the
reason in the last section of this file: a validator is the shape of code that
passes a naive suite by accident.

**2. What arrived along a link, not what a control was told.** A page grades
the wire, because the wire is what the picture claims. MEASURED example,
`demo/granulator/beat/index.html`: its tempo assert sums the `sent` count on
the links into `web:grains:tempo-in` and requires it to be at least what the
grains took (`sent >= readingsIn`), so a tempo set directly on the engine,
behind the bay's back, fails. HANDOFF session 75 has the defect this guards
against: *"A patchbay is only as true as the code that goes through it"*,
when `/radio/key/` (then `radio/040`) lit its keys by calling the keyboard
directly and the looper (then `sampler/020`, merged into `/code/piano/` on
2026-10-12) folded the MIDI keyboard into the on-screen keys, so the picture
showed neither. This is "a count is only evidence on the
far side of the boundary" (below) in its patchbay form.

**3. The room a run joins is never the owner's.** `roomFor()` in
`demo/shell/bay-node.mjs` decides it for every page that joins as a node:
`?room=` when given, else under `?selfcheck=1` a private `<slug>-test-<6
chars>`, and only a person gets `studio-1`, the room the Raspberry Pi is in. A
harness that forgets to pass a room still cannot reach the owner's desk.
`bay-node-test.mjs` grades that as a negative control. `demo/verify.mjs` gives
manifest pages the same `<demo>-test-<hash>` shape (see "A fixed room name"
below).

**4. The Pi side is a stand-in.** `demo/fake-board.mjs` answers in the board's
place, in the board's rooms (`studio-1` and `studio-1-circuit`), built from the
board's own `rig/board/beat.mjs` and `rig/board/inputs.mjs`, on
`demo/fake-relay.mjs`, a relay room server on 127.0.0.1 that copies the real
relay's limits so it is not more generous. `demo/verify.mjs` starts both for
`BOARD_PAGES`, which is `['away']` today (`knobs` left 2026-10-13, archived
with Yoshimi). By hand: `node demo/fake-board.mjs`, then
`http://127.0.0.1:8890/away/?relay=ws://127.0.0.1:8897&board=1`.

**5. The pages, and which harness reaches which.**
- **`demo/verify.mjs` grades manifest rows only** (`DEMOS.filter((d) =>
  d.built ...)`, line 54). COUNTED 2026-10-14: 56 rows, 55 built, and every
  one but `kit` unlisted, so it grades the kit parts and the archived pages
  that are still served (`archive/radio`, `tapes`, `stage`, `muta`, `away` and
  the rest).
- **The 42 concept pages at `/<group>/<slug>/` are NOT in the manifest, so no
  harness grades them.** Their check is `node demo/check-html.mjs
  demo/<group>/<slug>/index.html` and one look (positron-concepts: *"cut your
  checks"*). Some carry their own `d.assert` checks behind `SELFCHECK`
  (`demo/granulator/grain-rig.mjs`, `demo/radio/key/`, `demo/radio/live/`, the
  remote pages), which run when the page is opened by hand with `?selfcheck=1`
  and read off `window.__demo`.
- `demo/verify-gl.mjs` for `gl: true` rows, `demo/verify-quest.mjs` for a
  headset. `demo/verify-native.mjs` and `demo/verify-safari.mjs` refuse with
  exit 2 since 2026-10-13 (see Retired).

## External sources, and the stand-ins that replace them

🔴 **DO NOT RE-VERIFY `/archive/radio/` OR PROBE STATION HEALTH. ASKED TWICE.**
*"stop messing around with live stream assertions, you're wasting everybody's
time"*, then *"can we please stop assessing the radio, its killing me and my
budget"*. A run of that page costs minutes and a lot of tokens, it needs a
relay and eight mounts nobody here controls, and what it returns is a fact
about somebody else's server rather than about our code. Four of eight were
down the last time it was run, which is the normal state of it.
**Change the page, syntax-check it, ship it** (`node demo/check-html.mjs
demo/<slug>/index.html` parses every module block without opening a browser).
A red run on that page is not information until somebody asks for it.

✅ **AND SINCE 2026-09-16 IT CAN BE GRADED WITHOUT COSTING ANYBODY ANYTHING.**
`node demo/verify.mjs archive/radio` (the slug was `radio` until 2026-10-13, when the archived page moved to /archive/radio/ and the measurements below were made under the old one) starts `demo/fake-station.mjs` itself and points
the page at it with its own `?base=`: real MP3 frames, real ICY headers, a real
`icy-metaint` text channel and a `/health` route in the relay's shape, paced at
128 kbit/s. **MEASURED: 48/48 green with zero bytes from anybody's radio.** So
the rule above is now about the RELAY and the mounts, not about the page: run
the page freely, and never `curl` a mount, a health route or a live segment to
find out whether somebody else's server is up.
⚠️ It grades OUR code. A stand-in cannot tell you a mount is 403ing, and a page
green here can still meet one out there.
⚠️ `DEMO_QUERY=base=…` overrides it, which is the escape hatch for somebody who
has been ASKED to check the real relay.
🔴 **AND A STAND-IN CANNOT BE USED AGAINST THE DEPLOY. MEASURED 2026-09-20.**
`DEMO_BASE=https://positron.studio node demo/verify.mjs radio` starts
`fake-station.mjs` on `127.0.0.1` and points the page at it, and Chrome refuses:
*"Permission was denied for this request to access the `loopback` address
space"*. A secure public origin may not fetch a loopback address. It reads as
**4 red on a page where nothing is wrong**, two of them `no console errors` and
`no failed requests`, which is the worst possible face for a harness artifact.
⚠️ So `radio`, `tapes`, `now` and `flipper` are verified LOCALLY, and
`DEMO_BASE` is for pages whose sources are already public. MEASURED both ways:
`DEMO_BASE=… node demo/verify.mjs making items` is **61/61**, the same command
with `radio` appended is **72/76**, and `node demo/verify.mjs radio` on its own
is **14/14**.
⚠️ **TODAY, 2026-10-14, THE LOCAL-ONLY LIST IS `archive/radio`, `tapes` AND
`away`**: `radio` is the slug `archive/radio` since 2026-10-13, `now` and
`flipper` are retired (`archive/demos/now-index.html`,
`archive/demos/flipper-index.html`, `/flipper/` 404s), `items` was archived
2026-10-01, and `away` is graded against `fake-board.mjs` on a loopback relay,
which a deployed page should be refused for the same reason (INFERRED from the
loopback rule above, not measured). The measurements above are dated and keep
their old slugs.

🔴 **AND IT IS NOT ONLY ERR. EVERY EXTERNAL SOURCE, 2026-09-16:** *"stil: super
careful with external sources, better avoid"*, said in reply to
*"it uses archive.org, not ERR, so it is safe to run"*. That reasoning was the
mistake: the ERR rule is written about a broadcaster's listener statistics, and
it was read as though the SPECIFIC harm were the whole rule, so a harness that
pulls twenty-four recordings off archive.org on every run was called safe.
**The rule is about whose server it is, not about which harm has been named
yet.**

✅ **AND `/tapes/` HAS ITS STAND-IN SINCE 2026-09-18, SO THIS RULE NO LONGER
COSTS ANYBODY A PAGE.** (`/tapes/` was archived 2026-10-13, *"archive tapes
and deck"*, and is still built, served at /tapes/ and graded.) `demo/fake-tapes.mjs` is an archive that is nobody's
archive: it reads its paths off `corpus.json` rather than a list, so it cannot
drift from the page, and it tiles one 8 s MP3 BY THE BYTE to any length (48 kHz
at 64 kbit/s makes `144*bitrate/rate` whole, 24.000 ms and 192 bytes a frame, so
every wrap lands on a frame boundary and a Range reply needs no frame table).
The 23 rows are 2 h 15 m and 65 MB, never allocated. ⚠️ THIS READ
**24 rows, 2 h 22 m and 68 MB** UNTIL 2026-09-25, when `Saharan uni I` was
removed on *"rm 6/24 Saharan uni I 1967 line"*. MEASURED after: 8,096 s
against 8,541 s. `node demo/verify.mjs
tapes` starts it and points the page at it with its own `?base=`:
**MEASURED 39/39 with the only hosts contacted being the dev server and the
stand-in**, 38/38 until 2026-09-25 when the varispeed arc gained an assert.
⚠️ **THE TWO SABOTAGE FINDINGS BELOW KEEP THEIR 38/38**, because they
are dated measurements of the holes and nobody has re-run them. The instrument is not blind, which is the half that makes the claim
worth anything: pointed at a dead port the same run names that port and takes 5
asserts red.
⚠️ It grades OUR code, exactly as `fake-station.mjs` does. A stand-in cannot
tell you a recording is 403ing out there.
⚠️ **AND TWO HOLES IN `/tapes/`'S OWN CHECKS WERE FOUND BY SABOTAGING IT**: a
stand-in serving every recording at HALF its corpus length still reads 38/38,
and one serving SILENCE reads 38/38 too. Both are in `BACKLOG.md`.

✅ **`demo/fake-err.mjs` IS AN HLS LIVE EDGE THAT IS NOBODY'S BROADCASTER, AND
SINCE 2026-10-12 NO HARNESS RUN STARTS IT.** Its pages, `/now/` and
`/flipper/`, are retired (see Retired at the end, with the whole record).
`demo/verify.mjs` keeps the wiring with `ERR_PAGES = []`, so the next ERR page
needs one slug there and nothing else, and `archive/demos/README.md` says it
is how `/archive/tv/` (the old concepts video/040) is tested by hand through
`?base=`.

✅ **AND THE NEWSREELS HAVE ONE: `demo/fake-arhiiv.mjs`**, an ERR archive that
is nobody's archive: the content API shape `/history/newsreels/` and `/reel/`
read, and two small HLS streams made once with ffmpeg. By hand only, nothing
in `demo/verify.mjs` starts it: `node demo/fake-arhiiv.mjs` (:8903), then
`http://127.0.0.1:8890/history/newsreels/?base=http://127.0.0.1:8903`. Its
header says what it cannot grade: every slug gets the same twelve seconds, and
its URLs are absolute http, so the page's `//` pinning is never exercised.

🔴 **AND THE COST IS NOT OURS TO PAY.** ERR told us on 2026-09-16 that our
connections were distorting their listener statistics: their LISTENER
STATISTICS were being corrupted by us. That is a different and
worse kind of damage from load: a broadcaster's audience figures are what it
reports to its board and its funders, and a few dozen headless Chromes holding
mounts open for hours are counted as listeners who never leave. It cannot be
undone by stopping, only by not adding to it. So the rule is not *"a red run is
a fact about somebody else's server"* any more, which was an argument about the
VALUE of the check. It is: **every connection this repo opens to an ERR mount
appears in a public broadcaster's audience measurement, so open one only when a
person is going to listen to it.** `/archive/radio/` and `/videoradio/` both rotate
four ERR mounts; that covers every harness run, every `verify-gl.mjs videoradio`,
every reload in a development loop, and every tab left open on a second monitor.
⚠️ **2026-10-14: BOTH OF THOSE ARE ARCHIVED (2026-10-13) AND STILL SERVED, AND
THE PAGES THAT REACH ERR NOW ARE CONCEPT PAGES.** `grep -rl 'err\.ee\|icecast'
demo/radio demo/history` lists `/radio/blend/`, `/radio/tuner/`,
`/radio/live/`, `/radio/key/` and `/history/newsreels/`. No harness runs them
(they are not manifest rows), so the exposure is a person's tab and a dev
loop's reloads. `/radio/live/` and `/radio/key/` open no live stream under
`?selfcheck=1` (`if (SELFCHECK) { ... no live stream is opened ...; return; }`),
and `/history/newsreels/` has `fake-arhiiv.mjs` (above).
⚠️ Two stations were REMOVED over this and ERR was not: `idaidaida.net` and
`live.uuu.ee` are gone from the code and the relay 404s them. ERR is still in the
rotation, which means the exposure is still live and the only thing holding it
down is nobody running the page.
⚠️ The same goes for `curl .../health`, for re-running a demo to attribute a
flake, and for A/B'ing a failure that the rules already say is external. The
answer to "is it red because of me or because of them" is: SAY BOTH ARE
POSSIBLE AND MOVE ON.

🔴 **AND THE WORST SHAPE IS NOT A HARNESS, IT IS A PAGE THAT OPENS SOMETHING ON
LOAD. FOUND 2026-09-19 ON `/reel/`.** That page called `play(openOn, true)` on
its load path, so **every visit** asked arhiiv.err.ee for a newsreel and that
day's radio and then held a stream, for a first frame nobody had asked to see.
The `armed` flag beside it suppressed `.play()` and never suppressed the FETCH,
which is why it read as harmless. A harness run costs that too, and `/reel/` is
`built: true`, so it was in every full suite.
✅ **REPAIRED BY SPLITTING THE VERB.** `select()` moves the playhead, frames the
view and fills the caption and opens NOTHING; `play()` is the only half that
reaches ERR, and its callers are a press on a mark, a press of play on a day
already picked, and a step or a scrub that lands while something is already
playing. A visit, a step and a scrub across a stopped year are all somebody
reading the line, and none of them is a listener.
⚠️ **THE RULE IS NOT GATED ON THE HARNESS AND MUST NOT BE.** A page that behaves
one way for `?selfcheck=1` and another way for a person is a page nothing
grades. "Stepping while stopped opens nothing" is true for everybody.
⚠️ **AND THE AUDIT IS ONE WRAPPER, NOT A READING.** Every URL that can leave for
ERR goes through one counted function, so "a visit opens nothing" is an ASSERT
over a counter rather than a claim about a file. Six of the nine were media
source assignments rather than `fetch`, which a grep for `fetch` would have
missed entirely.


✅ **AND THE HOLE A STAND-IN LEAVES IS CLOSED BY SABOTAGING IT, NOT BY READING
IT.** (The two pages below are retired since 2026-10-12; the lessons in this
paragraph and the two after it are about every stand-in, `fake-board.mjs`
included, and stay live.) 2026-09-18, on `/now/` and `/flipper/`: both were FULLY GREEN against
`demo/fake-err.mjs` with its `serves()` forced to `return true`, because no
assert in either page named a refusal, a 403 or a served segment. `/flipper/`
had the blocked minutes in a READOUT CELL, and a cell is not an assert. Four
instances of one pattern now, counting the two on `fake-tapes.mjs`: **a stand-in
makes a page runnable without making it graded.** The fix is the same every
time: break the stand-in on purpose, and whatever stays green was never being
measured. Both pages assert it now, and the same sabotage takes 4 red.
⚠️ **AND A NEGATIVE CONTROL IS THE HALF THAT PROVES THE INSTRUMENT.** A page
that reported a boundary whatever it was shown would pass "a boundary was
found". `fake-err.mjs` wears three measured shapes at once, so both pages survey
all three channels and assert BOTH that a walled channel is found AND that a
channel refusing nothing is reported as refusing nothing. The first goes red
under the sabotage; the second stays green, which is correct.
🔴 **A SEGMENT THAT EXPIRED LOOKS LIKE A SEGMENT THAT WAS REFUSED, AND
MEMBERSHIP HAS TO BE CHECKED AT PROBE TIME.** `err-live.mjs` fact 2 says only
ever probe segments from the playlist just read. That is necessary and NOT
sufficient: a thirteen point sweep takes seconds, the window slides while it
runs, and the OLDEST point comes back 403 for the other reason. MEASURED:
`#.......#####`, two boundaries drawn where there is one. Drop points no longer
in the freshest playlist, and say how many were dropped.

🔴 **A COUNTER BEATS A STATE WHEN A CHECK RUNS NEXT TO AN EVENT.** `/flipper/`
read 8/8 against a closed port because `the selected channel is open or loading`
was satisfied by `!!c.hls`, true the instant `new Hls()` returns. The repair is
not a better instant: `readyState` is an instant too, and a WORKING page read
`readyState=1` because the check runs one line after a seek, which empties the
buffer. **`totalVideoFrames` counts what the element has EVER decoded and a seek
does not reset it.** Ask what has happened, not what is happening.

## A self-check never runs for a visitor

🔴 **TWO TIERS SINCE 2026-10-04, AND THE LONG-RUNNING CHECKS ARE THE SECOND.**
Asked as *"make checks way ligher (2 tiers?)"*, then *"i mean these long-running
ones"*. `selfcheck=1` is the ordinary run; `selfcheck=2` is the DEEP run, which
`DEMO_DEEP=1 node demo/verify.mjs <slug>` (or `--deep`) asks for. A check that
holds a Cloudflare leg, records a take, waits on a live stream's frames, or
needs another machine is a deep check: gate it on `DEEP` (or `ifDeep`) from
`demo/shell/selfcheck.mjs`, and give the page a `lightSettleMs` in the manifest
so the ordinary run does not wait the deep run's `settleMs`. MEASURED on
`/keep/`: ordinary 10 s and 15/15, deep 37 s and 28/28.
⚠️ **AN ORDINARY RUN SAYS WHAT IT LEFT OUT**, in the log, `left for the deep
run: ...`, never as a pass. Its count is smaller and honest about why.
⚠️ **IT IS A HARNESS TIER, NOT A VISIT.** A person's press runs the real thing
whatever the tier; only `SELFCHECK && !DEEP` stops early.

🔴 **A SELF-CHECK NEVER RUNS FOR A VISITOR. NOT ONE, NOT EVER, ON ANY PAGE.**
Instructed 2026-09-16: *"rip those selfchecks out of user experience and make
rule about it"*. It is gated on `?selfcheck=1`, which `demo/verify.mjs` appends
to every demo it opens, and the DEFAULT IS OFF. There is no page that is an
exception, and the two arguments that were used to make exceptions are both
answered below.

✅ **THE GATE IS A KIT MODULE SINCE 2026-09-18: `demo/shell/selfcheck.mjs`, AND
ALL FORTY PAGES ARE SWEPT.** Import `SELFCHECK`, or `ifSelfcheck(fn, { log,
say })` where a visitor would otherwise be left with empty cells and no account
of why. It was one line copied per page for four pages and the other forty-one
never grew it; one import is greppable, which is the half that makes a sweep
finishable. ⚠️ Sixteen pages needed NO change, because everything costly in them
already sat behind the press a visitor makes, so they carry no `selfcheck`
string and `grep -L selfcheck demo/*/index.html` still lists them. That grep is
not a ledger of unswept pages.
🔴 **AND `verify-gl.mjs` AND `verify-quest.mjs` DID NOT APPEND THE FLAG UNTIL
THAT SWEEP.** Only `verify.mjs` did, so gating any `gl: true` page switched its
checks off in every harness able to reach it, silently. `/videoradio/` had
carried its own gate for two sessions with its checks running NOWHERE, and its
comment named that file as *"a harness to fix rather than a reason to work a
visitor's controls"*. Both append it now, after `DEMO_QUERY` so an override
still wins. ⚠️ **`node demo/verify-gl.mjs videoradio` THEREFORE COSTS ERR NOW
AND DID NOT BEFORE**: that page rotates four ERR mounts.

⚠️ **"NOBODY IS HOLDING THIS ONE" IS NOT AN EXCEPTION.** `/videoradio/` ran its
checks by default on exactly that reasoning: the page moves its own blend,
changes station and runs a loop unattended, so a check that does those things
was said to be indistinguishable from the page working. Everything in that
sentence is true and the conclusion was still wrong, because the check does
things the PAGE never does. It pressed full screen, which took a visitor out of
their own full screen about twenty seconds after they pressed play. That was
reported twice as a mystery timer (*"drops out of full screen after 22 to 25
seconds"*, then *"chrome drops out of fullscreen when radio source changes"*)
and was open for two sessions, because 22 s is also the tour's dwell and 71 s is
the station clock, so the real cause looked like two innocent ones.

⚠️ **"IT IS CHEAP HERE" IS NOT AN EXCEPTION EITHER.** `/tapes/` loaded a tape,
played it and looped it four ways inside three seconds of every visit, because
its checks were never gated at all. Reported as *"tapes still does some loading
and playback on page load"*, and *"omg you still do not get it"* on the third
report.

⚠️ **AND THE GATE HAS TO COVER THE WHOLE COST, NOT THE AUDIBLE PART.** Both
earlier repairs on `/tapes/` were real and neither was this: one shut the sound
gate, the other stopped the page asking archive.org for durations. A page can be
silent, ask nobody for a duration, and still spend a visitor's bandwidth on a
12 MB recording and run its transport in front of them. **A VISIT ASSERTS A
STRICT SUBSET** and that is the intended shape: everything gradable from data
already in hand still runs, anything that opens a file, makes a sound, presses a
control or moves the picture does not.

⚠️ **A CHECK THAT MUTATES IS THE TEST, NOT A CHECK THAT IS SLOW.** `/tapes/`'s
zoom check called `openFinish()` one frame into the opening animation, so the
self-moving zoom somebody had asked for was being destroyed by the thing
grading it. It waits for the move now. Ask of every check: if a person were
watching this page, would they see it happen?

## Measuring the right quantity

🔴 **A STATISTIC MEASURED OVER A WHOLE ARTEFACT MEASURES ITS PADDING.
2026-09-21, AND IT WAS PUBLISHED BEFORE IT WAS CAUGHT.** A Circuit session file
was written up as *"not seven bit, so it is not SysEx payload"* on the evidence
that **44,071 of its 53,248 bytes are above 0x7F**. The number is correct. The
bytes are **0xFF erasure**: the file's entropy is **0.91 bits a byte**, its real
payload is **9,180 bytes**, and **two** of those are above 0x7F. Counting high
bytes in a file that is four fifths erased flash measures the erasure.
⚠️ **THE TELL WAS AVAILABLE AND FREE**: entropy, a byte histogram and a run
length map all say *this is mostly one value* in one command each. **Ask what
the denominator is before dividing by it.**

🔴 **A JSON SCHEMA CONSTRAINS SHAPE AND CANNOT CONSTRAIN MEANING. MEASURED
2026-09-21 AGAINST WORKERS AI.** Asked for a patch, `llama-3.3-70b` returned
`{"op": "transpose", "to": 1}` on every run. **`transpose` takes `by`.** The
object was valid against the schema it was generated under, because that schema
listed every argument any transform could take and required only `op`, and the
code would have computed `note + undefined`, which is `NaN`: not a throw, not a
drop, a note number that does not exist arriving at an instrument from a link
the page called connected. **Validate the MEANING in ordinary code
(`checkTransforms`), never in the schema.**
⚠️ **AND A TIGHTER SCHEMA WAS MUCH WORSE, WHICH IS THE OPPOSITE OF THE OBVIOUS
FIX.** An `anyOf` with one branch per operation took the same model from
**1.6 s to 10.2 s** and made it repeat one transform until the tokens ran out,
three runs of three. **The loose schema plus an ordinary validator wins.**
✅ What a schema CAN do is identity: the list of real ports as an `enum` meant a
Moog and a Prophet, neither on the desk, came back as **no links at all in
496 ms** rather than as an invention.

🔴 **A MODEL PROPOSES AND A PERSON PRESSES, AND THE REASON IS MEASURED RATHER
THAN CAUTIOUS.** Asked to put the mod wheel on the master filter, and separately
to play the drums from the keyboard, that model produced **well formed patches
aimed at the wrong instrument**. Nothing in a validator can catch that, because
there is nothing invalid about them. A person reading one line can. **Anything
that turns words into actions here shows the action as text first.**

🔴 **`UNSUPPORTED` AND `FORBIDDEN` ARE TWO LISTS AND MERGING THEM BREAKS
EVERYTHING OR PROTECTS NOTHING.** `bay.mjs` had one `accepts` list, so a MIDI
source emitting six classes could never reach a synth that takes three: **every
real link on the desk was refused**. Split: a class a destination does not
handle is **dropped at the boundary and reported**, a class on `never` **refuses
the link outright**. The difference is between *I do not use that* and *that
damages me*, and only the second is worth an error.

## Close every Chrome you start

🔴 **A HEADLESS CHROME OUTLIVES THE SCRIPT THAT STARTED IT UNLESS THE SCRIPT
KILLS IT.** 2026-10-11: sixteen were found running after a day of parallel
agents driving pages over CDP, and the owner had to ask for them to be closed
(*"i need to close all chromes"*, then *"write to claude.md / skills to clean up
properly"*).
- Spawn, then guard every exit: `try { ... } finally { chrome.kill(); rmSync(profile, { recursive: true, force: true }) }`
  and `process.on('exit', () => chrome.kill())`. An early `process.exit()`, a
  thrown error, a timeout and a Ctrl-C all count. `demo/shot.mjs` is the model.
- Never start a second run while the first one's Chrome is still up.
- Before reporting: `pgrep -fl "Google Chrome.*--headless"` prints nothing of
  yours. The session runs the same check after every agent, and
  `pkill -f "Google Chrome.*--headless"` clears leftovers without touching the
  owner's own Chrome.

## The traps, each one paid for

**Measure the quantity in question, not one adjacent to it.** An A/B where both
arms share the bug returns "identical", which reads as "fine". Before running a
comparison, ask what defect it could NOT detect.
🔴 **AND THE SHARPEST FORM OF IT IS TWO NUMBERS DERIVED FROM ONE FIELD.
MEASURED 2026-09-19 ON THE MIM CORPUS.** A build's lookup table was keyed by
FILE NAME, a re-encode changed one name, one of two tables was updated and the
other was not, so `NOT_OURS[file]` read `undefined` and **Kanuti Gildi SAAL's
recording was silently re-credited to MIMproject**, with a `holder` field saying
the file was ours. The build printed nothing and every file was present and
correct.
⚠️ **THE CHECK THAT SHOULD HAVE CAUGHT IT AGREED PERFECTLY WHILE BEING WRONG.**
It compared `theirs.length` against `counts.theirs`, and BOTH ARE DERIVED FROM
THE SAME FIELD, so the two halves moved together and the check passed. What
actually found it was a human reading the harness's DETAIL line, where `2 of 28`
had become `1 of 26`.
✅ **THE REPAIR IS TWO INDEPENDENT SOURCES, WHICH IS THE WHOLE RULE**: the page
now compares the NOTE, prose written by hand, against `source`, which comes from
the lookup table, so the two can disagree. And the build THROWS on a key
matching no measured file, proved by putting the old name back.
⚠️ **KEY BY `id`, NEVER BY FILE NAME.** A name is a thing a re-encode changes.

🔴 **A PAGE THAT GAINS ITS FIRST CONTROL MOVES EVERY OTHER CONTROL'S HARNESS
PRESS, AND `settleMs` ONLY EVER LANDS ON CONTROL 0.** MEASURED 2026-09-16 on
`/archive/radio/`: adding one button made the looper's `→` control 1 instead of control
0, so the single press the harness gives it moved from t+1 s to **t+31 s**,
landing in the middle of the page's own loop check and taking it red
intermittently with a face that read `≠`. Nothing about either control changed.
⚠️ The symptom is an intermittent failure in a check that has nothing to do with
the control you added, which is the worst place to start looking. **After adding
or removing a control, re-run the page and diff the per-demo assert count**, and
if a check depends on WHEN a press lands, have it confirm where it landed rather
than assuming.

🔴 **AND A CONTROL YOU DISABLE IS A CHECK THE HARNESS CAN NO LONGER REACH.
MEASURED TWICE IN ONE DAY, 2026-09-19, ON TWO PAGES INDEPENDENTLY.** Both
harnesses drive a page by clicking every button in `.pos-controls`, so a page
whose checks sit behind a press loses them the moment that press stops
happening. `disabled` is not a style, it is a `return` in front of the handler.
- `/mirror/`: switching the VR and AR buttons off when the browser reports no
  headset meant `enterHeadset` was never called, and **ten** asserts about both
  session branches would have gone silent while the page read 41/41 green.
  Caught before shipping; the page now drives whichever mode nobody reached,
  behind `SELFCHECK`, with a map so a real press on a headset is never doubled.
- `/blocks/`: the same change took **six**, and those were reported and replaced
  rather than caught in advance. On a real headset all six come back.
⚠️ **IT IS NOT A REASON TO LEAVE A LYING CONTROL ENABLED.** A button that cannot
do the thing it names is the defect; this is the bill for fixing it. What it
costs is that the checks behind it have to be reachable another way, which they
always could have been, because a check that only a control can reach was
already a check that nobody runs on a machine without that capability.
⚠️ **AND A DISABLED CONTROL IS EXACTLY WHERE THE COUNT LIES QUIETEST.** The suite
stays green either way: those asserts do not FAIL, they simply never run. Diff
the per-page assert count after any change to what a control does, which is the
rule above, and account for every one that moved.

**A green suite can mean zero coverage.** `verify.mjs` reported 261/261 while a
demo was fatally broken on iPhone, because desktop Chrome never enters that
branch. After any change to `src/low-latency-player.js`, run
`demo/verify-native.mjs` too. ⚠️ **RETIRED 2026-10-13 FOR NOW:** it and
`demo/verify-safari.mjs` drive /llhls/, whose input was deleted that day, so
both refuse with exit 2 rather than read PASS about a player that never starts.
Until one is re-pointed at /video/llhls/ (in `BACKLOG.md`), the native
branch has no harness, and that is the gap to say out loud after a player change.

**Attribute a run to a build before iterating on it.** Every 06 log opens with
`BUILD <sha>-<hhmmss>`, substituted into the deployed `shell.mjs` by
`build.mjs`. Without it, "still broken" and "the fix never loaded" are the same
observation. **Confirm the stamp changed before asking anyone to retest** — the
edge serves the previous build for a few seconds after deploy.

**Being right about a mechanism says nothing about whether it dominates.** State
what you expect to see if your cause is the real one, then check that you see it,
before shipping a fix.

**When two hypotheses have opposite fixes, build the measurement that separates
them first.** Do not pick between them on plausibility.

**Never guard a patch on `s.includes(<substring>)`.** Three bugs in one day from
this — `BUILD` matched inside `REBUILD`; `LOG_KEEP` and `#log` were satisfied by
the code just inserted. Guard on the exact declaration, or assert the effect
afterwards. Printing "ok" is not evidence.

**`verify.mjs` stops collecting 400 ms after the last assert.** Its stabiliser
waits only while the count is still GROWING, so a check whose FIRST assert sits
behind a wait reports "asserted nothing" (a page that is working reads as
broken), and one that pauses mid-way silently loses every assert after the
pause. Slow work — going live, a recording, resolving a WebM duration — belongs
behind control 0, which is the only control that gets `settleMs`.

**`grep` returns nothing on `timeline/transport.mjs`.** It held two literal NUL
bytes (a cache-key separator typed raw instead of `\u0000`), so BSD grep called
the file binary and printed nothing — not "binary file matches", nothing. Every
search of the timeline core answered "not there", including for `createDeck`,
which is exported ~40 lines from where the search claimed nothing was. The NULs
are now escaped. If a search for a symbol you are sure exists comes back empty,
suspect the file before the symbol: `node -e "…indexOf(…)"` is the second
opinion.

**An engine switch invalidates the harness's HTTP cache.** A media element
loading `video.src = <m3u8>` stores a no-cors (opaque) entry for that URL; the
moment a page switches to hls.js, its XHR for the SAME url is served from that
entry and rejected as a CORS failure — on a URL that answers 200 with
`access-control-allow-origin: *`, and while the page's own `fetch` of it
succeeds in the same run. Two demos read red for exactly this and nothing in
either page was wrong. `verify.mjs` now deletes its profile's Cache before
every run.

**Never let sound gate the work.** `audio.play()` and `AudioContext.resume()`
both wait on a user gesture in a real browser, and neither REJECTS — awaiting
one before doing the real work is a hang, not an error. It cost two demos in one
session: shout spent five seconds buffering an element before its measurement
opened, pushing the whole run past the harness's settle, and sound awaited a
suspended context and never compiled, never built its deck, never raised its
transport bar — while looking fine, because the readout had been filled at load.
Headless hides it: `--autoplay-policy=no-user-gesture-required` resolves both.
Fire them and move on; sound is allowed to be late, the timeline is not.

**"Is the XR object real" is not "is there a headset", and desktop Chrome is
the proof.** MEASURED while building `verify-quest.mjs`: desktop Chrome has a
genuinely **native `navigator.xr`** — an `XRSystem`, an accessor on
`Navigator.prototype`, every method `[native code]` — and answers
`immersive-vr: false`. So a nativeness test alone passes every laptop, and an
`isSessionSupported` test alone passes a polyfill that claims everything. They
catch disjoint things and BOTH are needed, plus `adb shell getprop` from
outside the browser entirely. The Immersive Web Emulator installs a JavaScript
`XRSystem`, and Meta markets its coverage as "on par with the Meta Quest
Browser" — which is the iPhone mistake in a new accent. `--self-test` runs all
three cases against headless Chrome and needs no device; sabotage
`nativeVerdict` and it goes 3/3 -> 0/3, which is how you know it is not
decoration.

**A second browser of your own is a harness that reads broken.** A full run
went 429/429, then 420/429 with nine failures, then 429/429 again with no code
between them — and all nine were in the three demos that depend on something
outside the machine (`carry`'s relay socket opened 0 times, `shout` read
`peak rms 0.0000`, `now` showed no frames). The cause was two probe Chromes of
mine still holding relay sockets and bandwidth while the suite ran. Re-running
just those three gave 57/57. So **before calling a red run a regression, run the
failing demos ALONE** — it costs a minute and it separates "my change broke it"
from "I was competing with myself", which look identical in the output.

🔴 **`claimProfile()` RETURNS AN OBJECT, AND FOUR SEPARATE THROWAWAY PROBES PUT
IT STRAIGHT INTO A TEMPLATE STRING ON ONE DAY.** `--user-data-dir=${claimProfile('probe')}`
stringifies to `[object Object]`, **which is a valid relative path**, so nothing
throws, nothing warns, Chrome starts perfectly, and a **156 MB profile appears in
the repository root in a directory literally called `[object Object]`**. MEASURED
2026-09-21: three background agents and the session all did it, two reported it
as a mystery, and one deleted it and it came back within the hour.
🔴 **AND `sweepStale()` IS STRUCTURALLY BLIND TO IT**, which is what makes it a
leak rather than a mess: the sweep decides a directory is stale by reading a PID
out of its NAME, and that name has no pid in it. In a project that has already
had a volume run out at 229 leftover profiles and about 20 GB.
✅ **THE OBJECT STRINGIFIES TO ITS OWN PATH NOW**, via `toString` and
`Symbol.toPrimitive`, so `${profile}` and `const { dir } =` both do the right
thing. **The lesson is the shape rather than the patch: a helper that returns an
object where every caller wants a string will be interpolated, and a wrong value
that happens to be a legal path is worse than one that throws.**

🔴 **A HARNESS THAT DOES NOT DELETE ITS OWN PROFILE FILLS THE DISK, AND THE
DISK FAILING LOOKS LIKE EVERYTHING FAILING.** Every harness here launches Chrome
with a per-run `--user-data-dir`, for reasons that are correct and written down
(a shared profile is a shared HTTP cache, and Chrome writes its real CDP port
inside it). None of them ever removed one. MEASURED 2026-09-14: **229 leftover
profiles, ~20 GB, and the volume down to 119 MB free** — at which point `find`
itself died with ENOSPC and no shell command would run. A profile is ~250 MB and
the suite gets run dozens of times a day, so this leaks about a gigabyte an
hour of ordinary use. ⚠️ **Cleaning up on the way out is not enough**: a run
that is Ctrl-C'd or killed executes no handler, and those are exactly the runs
that happen when something is already wrong. `demo/harness-profile.mjs` does
both halves — `claimProfile()` removes this run's directory on `exit` and on a
signal, and **sweeps directories whose pid is dead**, which is the half that
actually recovers a machine. It is safe because the pid is in the name, so a run
in another terminal keeps its own. ⚠️ And `kill()` ASKS; it does not stop —
with a plain `kill()` the handler deleted the directory and a still-shutting-down
Chrome recreated it, which is a cleanup that runs, reports nothing and does
nothing. SIGKILL and await the child's `exit` before removing. **Say how many
were swept**: a cleanup nobody is told about cannot be told apart from a leak.

**A harness and a dev server that share a port is a harness that reads broken.**
`node demo/verify.mjs` died with an unhandled `EADDRINUSE` three separate times
in one session because `node demo/server.mjs` was still holding 8890 — each
time looking like a broken suite rather than a busy port. `serve()` now takes
the next free port and says so, and the harnesses read `server.address().port`
rather than the one they asked for. The general form: **a fixed port is a
shared mutable global.** The same bug in a second costume is a fixed CDP port —
`verify-gl.mjs` attached to a Chrome left over from the previous run and
reported that run's flags, which is how a SwiftShader test reported ANGLE
Metal. Let the OS choose and read back what you got.

**A wedged hardware encoder cannot be killed, and looks like broken code.**
`/dev/video11` is a single exclusive V4L2 device, and when it wedges, ffmpeg
sits in uninterruptible sleep: `SIGTERM` does nothing, `SIGKILL` does nothing,
`timeout` does nothing, and `modprobe -r bcm2835_codec` answers "Module is in
use". Three ffmpegs stacked up behind it, each one reading from the outside as
"the encoder produces no bytes". Recovery is a reboot. **Check `pgrep -cx
ffmpeg` before concluding anything about an encode** — and `-x`, never `-f`,
because `pgrep -f h264_v4l2m2m` matches its own ssh command line and answers
"still held" about itself. That is LESSONS #39 in a new costume and it cost
twenty minutes twice.

**Ask the picture the right question.** `mirror`'s "there is a picture in it,
not a flat field" assert failed twice on a vivid kaleidoscope. First it sampled
four points — on an EIGHT-FOLD SYMMETRIC radial image, where any two samples at
similar radius are similar by construction, so it was measuring the symmetry of
the thing it was checking. Then it summed R+G+B over the whole frame and read
`9 of 765`, because the shader's colour is three cosines 120° apart and **three
cosines 120° apart sum to a constant**: the image varies almost entirely in HUE
at near-constant luminance. Per channel, red alone spans 26..254. A statistic
that is constant by construction over your subject is not a weak measurement,
it is a blind one.

**Prove a guard fires.** Break the thing on purpose once. And note `cmd | tail`
reports `tail`'s exit status, not `cmd`'s.

**When you implement somebody else's format, only their implementation can
grade you.** `timeline/csound.mjs` was 22/22 green for months with two real
defects, because the test compared it against a number derived from the SAME
formula the compiler implements — which catches a typo and can never catch a
misreading. Real Csound found both in an hour: the tempo ramp was 239 ms out at
beat 30 (Csound interpolates seconds-per-beat linearly in beat, not tempo), and
`^+x` resolved against the wrong note. The warning comment in that file was
worse than useless — its confident "118 ms early" was the distance between two
WRONG answers. `timeline/lab/csound-oracle.mjs`; it skips cleanly where the
reference is not installed, because a check nobody can run is a check nobody
runs.

🔴 **CHECK THE INSTRUMENT BEFORE REPORTING AN ABSENCE, AND THREE DIFFERENT
REFUSALS IN A ROW ARE THE INSTRUMENT.** MEASURED 2026-09-19 on two works
addressed on IPFS: one `curl -I` each at three gateways gave **429, 406 and
301**, and that was written up and REPORTED as *addressed, not retrieved*, with
the open question being whether anybody still pinned them. Every one was rate
limiting or a redirect. With a real user-agent, a **ranged GET rather than
HEAD** (HEAD is what those gateways throttle hardest) and six seconds between
calls, five gateways answer 206 and both 77.9 MB files came down in **under four
seconds**.
⚠️ Three hosts refusing in three different ways is not three facts about the
content, it is one fact about how you are asking. **An absence reported as fact
is the expensive kind, because nobody re-runs it.**

🔴 **AND A DOMAIN OUTLIVES THE PEOPLE WHO HAD IT.** A Wayback survey of
mimproject.org returned 67 pictures and four were adverts for a Thai online
casino: everything under `/uploads/2025/01/`, after the domain lapsed and was
picked up for gambling SEO. Nothing in a CDX row says who owned the host that
day, and **`a 2025 revival` was written into four files before anybody opened a
picture**. A site coming back and a site being taken are the same shape in an
index of URLs. Open the pictures; key any provenance claim on something other
than the URL.

**A partial result that is too tidy is a broken collector, not a finding.**
Exactly 4 of 5 events, exactly 0 across every case, exactly nothing on the
network scan. In one session: csound writes ANSI escapes so `grep '^EVT'` lost
most lines; `execFileSync` returns only stdout while csound's `prints` go to
stderr; and `.local` names do not resolve at all from this sandbox because mDNS
is multicast UDP. Check the instrument before believing the pattern.

**Long measurements: no pipes, no dangling promises.** `node x.mjs | tail` buffers
until exit and looks hung — write to a file. An un-awaited `fetch` keeps the
event loop alive forever.

**Read the comments already in the file.** `src/publish.sh` pins `ffmpeg@7`
("needs libfreetype for the clock overlay") and the publisher says "the key must
never be echoed". Both were correct and both were ignored, each costing a run.

**A recovery action is not free.** Rate-limit it, require it to have somewhere to
land, and make it yield rather than retry forever — see `low-latency-player.js`,
where a drift-seek every 2–3 s aborted the in-flight fragment loads it was trying
to recover.

## Assert both modes, and watch the assert COUNT

A demo that branches must assert every branch on every run. Adding a uniform
mode to grid silently dropped it from 11 asserts to 10 while still reading
green — and worse, because `verify.mjs` presses every control the toggle was ON
at check time, so only 6 of that page's 8 asserts ever ran in the suite.
(grid no longer branches: one grid, one quality, 8/8 run.) Diff per-demo
counts against the last known total after any change.

## A count is only evidence on the far side of the boundary

- **A count is only evidence on the far side of the boundary.**
  `createMidiLane`'s `scheduled()` counted what the page QUEUED and read
  identically to delivery — while every note was being scheduled fifty-six
  years out. Ask which side of the wire a counter is counted on before quoting
  it.
- **On a patchbay page the far side is the link.** Count what a link
  delivered (its `sent`, read from `bay.links()`) or what the receiving node
  took, never what the sending control was told. Example at the top of this
  file (`/granulator/beat/`).

## Before the harness opens a page at all: `demo/verify.mjs`

🔴 **COUNT THE OTHER BROWSERS BEFORE BLAMING THE CODE, AND MAKE THE HARNESS SAY
IT RATHER THAN A DOCUMENT.** Three runs in one session read broken because of
processes of the session's own: a full suite went 429/429, then 420/429 with
nine failures, then 429/429 again with no code in between, and all nine were in
the demos that need something off this machine. The same thing later took the
suite out entirely with a `cdp timeout` on `replay`, which is 16/16 when run
alone. This was carried as a rule to remember since session 18, and **a rule to
remember is the weakest kind of guard: it only fires if the person reading the
red output happens to recall it.** `verify.mjs` now prints the count at the
start, and AGAIN AT THE END when something failed, because a browser that
appeared halfway through is the one most likely to have caused the failure being
read and would not have been in the opening count.
⚠️ **`-f` IS REQUIRED FOR THAT COUNT AND IT IS THE TRAP.** The flags being
looked for are on the command line, so an exact-name match cannot see them, and
a `-f` pattern also matches the process doing the asking. That is LESSONS #39's
shape (`pgrep -f h264_v4l2m2m` answering "still held" about itself), so the
harness's own pid is excluded explicitly and its own debugging port after
launch.
⚠️ **ONE BROWSER IS ABOUT TEN PROCESSES.** Chrome's renderer, GPU and utility
helpers inherit the whole command line, `--user-data-dir` and
`--remote-debugging-port` included, so a naive count of matching processes
reported **19 other headless Chromes for two**. A warning that overstates by 10x
is worse than no warning, because the next reader learns to ignore it. The
browser process is the one with no `--type=`; every helper has one, and a
browser is its PORT, so a relaunch on the same port is still one.
⚠️ **INFORMATIONAL, NEVER FATAL.** A harness that refuses to run because
something else is open is worse than the problem it is guarding against. `ps` is
not the subject either: the counter returns an empty list rather than failing on
it.

🔴 **TWO HARNESSES STARTED AT ONCE DID NOT COLLIDE LOUDLY, THEY DROVE EACH
OTHER'S TABS.** `verify.mjs` still held two fixed ports after the
shared-mutable-global rule had been applied to its HTTP port. The second run
found 9333 already answering, attached to the FIRST run's browser, and **drove
someone else's tabs while reporting its own slugs**. With agents running in
parallel that is not a rare race, it is the normal case, and it is the likeliest
explanation for the `cdp timeout` above.
⚠️ **THE PROFILE HAS TO BECOME PER-RUN IN THE SAME CHANGE, NOT AS TIDINESS.**
Chrome writes the port it actually got into `DevToolsActivePort` INSIDE the
profile, so reading it back from a SHARED directory finds whichever browser
wrote there last: **a per-run port with a shared profile still lands on somebody
else's browser.**

⚠️ **A `gl: true` DEMO IS NOT THIS HARNESS'S SUBJECT, AND FAILING IT HERE WOULD
BE A LIE.** `verify.mjs` launches Chrome with `--disable-gpu`, where
`getContext('webgl2')` returns null, so a visual demo reports `__demo.ready`
false and the suite goes red for a page that is perfectly fine. Those pages are
handed to `demo/verify-gl.mjs` and the handoff is PRINTED, rather than counting
a subject this harness cannot reach as a failure.

🔴 **THE STAND-INS ARE WIRED UP BY THE HARNESS BECAUSE THE ALTERNATIVE IS A RULE
SOMEBODY HAS TO REMEMBER**, and a rule that is only in a document is a rule that
gets broken on the day somebody is in a hurry. ⚠️ `DEMO_QUERY` still wins, and
the mechanism is worth knowing: **`URLSearchParams.get` returns the FIRST
occurrence**, and `DEMO_QUERY` is put first in the query string.

🔴 **A FIXED ROOM NAME IS A SHARED MUTABLE GLOBAL, AND THIS REPO LEARNED THAT
ABOUT PORTS AND NEVER APPLIED IT TO ROOMS.** Every demo defaults to a NAMED room
(`cues-demo`, `jam-demo`, `scene-demo`, `room-demo`), so two runs of the suite,
or a run and a visitor, land in the same one and see each other's traffic. That
is the same bug in the WebSocket layer, and this project has paid for it twice:
nine orphaned Chromes filled `studio-1` and took a live demo down (LESSONS #56),
and a full run went 429 to 420 to 429 with no code between. A harness run now
gets a room of its own, per demo, per run.
⚠️ **`<demo>-test-<hash>`, NOT `v-<demo>-<hash>`.** The `v` stood for verify and
was obvious to nobody, asked in those words: *"What is v- prefix?"*. A room name
is read by somebody looking at a store wondering what all these rows are, and
`items-test-4f2a` answers that where `v-items-4f2a` needs a footnote. It also
cannot be mistaken for the real room by a rule that has to tell them apart:
`workers/items` only announced from the room named `items` (archived
2026-10-01, `archive/items/README.md`), and **a harness
room that reached real phones is exactly how that came up.**
⚠️ **TWO ROOMS ARE NOT LIKE THAT AND MUST NOT BE OVERRIDDEN.** `room: 'fixed'`
in the manifest means the name is not a rendezvous the page invented, it is the
ADDRESS OF A MACHINE: `studio-1` is where the Raspberry Pi is and `m1-1` is
where the studio Mac's agent is. Renaming those does not isolate a run, it
points it at nothing.
⚠️ **AND A DEVICE IS STILL EXCLUSIVE.** A private room does not give a second
client its own Raspberry Pi. There is one JACK graph and one instrument, so
board-bound demos still have to take turns. Rooms were never that problem.
✅ **THE PATCHBAY PAGES GET THE SAME RULE FROM ONE PLACE, SINCE 2026-10-06.**
`roomFor()` in `demo/shell/bay-node.mjs` makes the same `<slug>-test-<6
chars>` under `?selfcheck=1` with no `?room=`, because `/patchbay/` had joined
`studio-1` ON LOAD and ignored `?room=`, so *"every visit AND EVERY SUITE RUN
put a `web` site on the owner's desk and asked the Pi `graph.ask`"* (that
file's header). A rule in three hand copies held in two of them. The rows
marked `room: 'fixed'` in the manifest today are `mirror` and `wire`, both
archived and still served (COUNTED 2026-10-14).

🔴 **`DEMO_HOSTS=1` IS THE INSTRUMENT FOR THE STANDING EXTERNAL-SOURCE RULE, AND
UNTIL IT EXISTED THERE WAS NO WAY TO CHECK IT: a page pointed at a stand-in and
a page pointed at the real thing produce identical output.** It counts
`Network.requestWillBeSent`, **which fires for every request the renderer makes
rather than for the ones a page remembered to log**.

    DEMO_HOSTS=1 node demo/verify.mjs tapes

⚠️ Off by default and printed per demo, because most demos here legitimately
talk to the relay, to Cloudflare or to ERR, so a line on every run would be
noise around the one run where it is the answer. `data:` and `blob:` have no
host and are this machine's own memory.

## What counts as an error and what is merely expected: `demo/verify.mjs`

🔴 **A RIGHTS REFUSAL IS RECOGNISED BY WHERE IT CAME FROM, AND THE DAY THE
HARNESS STOPPED POINTING THOSE PAGES AT ERR, TWO WORKING PAGES READ RED.** Both
classifiers tested the URL for `live.err.ee`, which was the whole address of the
only thing that sent one. `fake-err.mjs` sends the same 403 with the same
missing `access-control-allow-origin` from `127.0.0.1`, so every deliberate
refusal became an unexplained console error.
⚠️ **IT IS THE STAND-IN'S OWN ADDRESS PLUS THE SEGMENT PATH, NOT A LOOPBACK
TEST.** Anything looser would swallow a real failure from the dev server, and
the whole value of this bucket is that it is narrow enough to be trusted.
⚠️ **AND THE CLASSIFIER IS GIVEN THE WHOLE LOG LINE, NOT ONLY `entry.url`.**
Chrome files a CORS violation with an EMPTY url and the address inside the
message text, so a version that only read the url classified the
`loadingFailed` events correctly and left the console entries for the same
segments sitting in `errors`. **MEASURED: 22 refusals recognised and `no console
errors` still red, which reads as one bug and was two.**

🔴 **EVERY ALLOWANCE IS RECORDED AND CAPPED, NEVER IGNORED, AND THE LINE HAS TO
NAME WHICH KIND IT IS** or the next reader believes a refusal was a radio
station. Past the ceiling each one stops being the small explained thing and
becomes the opposite diagnosis, which is the one a reader of the suite most
needs told apart. The buckets, with what each was measured to be:
- **LL-HLS live-edge part 404s.** Normal at the live edge: players request parts
  as they are born and hls.js retries. `EDGE_CEILING = 25`.
- **409 on a WHEP play URL** means nothing is publishing to that input, which is
  a fact about the rig being off rather than about the page. MEASURED
  2026-09-15 against Cloudflare directly, outside any browser: a bare POST to
  that play URL answered 409 while `keep` read 13/14 run after run on an
  otherwise clear machine. Silence here would turn "the studio rig is not
  running" into a green run.
- **400 on a WHEP play URL.** Cloudflare refuses a single-track offer with a
  400, both ways. `tracks` used to assert on that refusal and is gone, so
  nothing sends one today; the allowance stays correct for whatever asks next.
- **502 or 500 from `shout`** is the relay saying an origin is down. MEASURED
  repeatedly in one day: **four of eight mounts 502 while the other four
  answered 200 through the identical worker**, and this laptop reached every one
  of them directly at `icecast.err.ee`. Past the ceiling this stops being one
  flapping mount and becomes OUR relay being down.
- **404, 413 and 415 from `vain`.** That page asks its own archive to refuse
  three times on purpose: a file over the cap (413), a JPEG named `.mp3` (415),
  and the sidecar before it exists (404). ⚠️ **NO PAGE-SIDE CHANGE CAN REMOVE
  THESE.** Chrome logs a resource error for any 4xx and does it identically for
  `fetch` and `XMLHttpRequest`, MEASURED both ways rather than reasoned about.
  **A check that cannot be made without a console error is exactly what an
  allowance is for.**
- **archive.org 5xx on a metadata probe is their server, not this page.**
  `/tapes/` asks all 24 recordings how long they are, four at a time, straight
  at whichever node archive.org hands out. MEASURED across ten runs: **two of
  them drew a 500 from `dn720304.ca.archive.org` on one probe, and the other
  eight drew none, with no code between them.**
- **ERR's 403 with no ACAO**, which the browser reports as CORS.
  `PROBE_CEILING = 60`, and the number is derived rather than picked: `flipper`
  sweeps 8 points per probe twice, `now` sweeps 13 points across the window once
  and is capped at 30 in-page, plus hls.js's own retries on whatever comes back
  refused. ⚠️ **IT IS 90 IN `demo/verify.mjs` TODAY (`grep -n PROBE_CEILING`,
  2026-10-14)**: `now` merged into `flipper` on 2026-10-05 and the merged page
  paid both pages' asking, MEASURED against the stand-in that day at 45
  ordinary and 72 deep. No page reaches this bucket since `flipper` was
  retired 2026-10-12.
- ⚠️ **THE BUCKETS OUTLIVED SOME OF THEIR PAGES, 2026-10-14.** The code still
  carries every one of them, and the pages that taught them are gone: `keep`
  (retired 2026-10-04, `archive/demos/keep-index.html`), `tracks` (removed
  2026-09-08), the `vain` demo (retired 2026-10-02 with `crate`,
  `archive/vain/`), the `shout` demo (`archive/shout-demo/`, by 2026-09-15). The allowances stay correct for whatever asks next.
- **`net::ERR_ABORTED` is what a media element's in-flight segment requests do
  when the page unloads.** It means WE navigated, not that the page failed.
  Every page that plays media produces these on teardown, so counting them made
  a working demo look broken. Recorded separately rather than ignored.

⚠️ **THE CEILINGS ARE FOLDED INTO THE EXISTING `no console errors` ASSERT RATHER
THAN ADDED AS NEW ONES**, because a conditional assert would make the suite
total vary run to run, **and a shrinking total is exactly how four asserts went
missing unnoticed earlier.**

## Driving a page: presses, drags and typing, in `demo/verify.mjs`

**`.pos-controls button, .tbar-x`, in order.** A multi-step demo (arm, then
measure) does not put its asserts behind the first button, and a page may put a
control INSIDE the transport bar when it is a transport verb rather than a side
action (`take` puts Record there). **A control the harness cannot press is a
subject the suite cannot reach, which is how three pages stayed green while
never playing a frame.**

🔴 **`element.click()` FIRES NO POINTER EVENTS, so a page that is drawn on
rather than pressed was a subject this harness could not reach at all.** `draw`
carried a `Draw one for me` button purely so that something here had something
to press: a page answering its own question, and the line it graded was not the
line the page is about. Any element marked `data-gesture` gets a real CDP drag
instead, which Chrome turns into genuine pointerdown/move/up with
`getCoalescedEvents` and all.
⚠️ **THE PATH IS A LISSAJOUS, NOT A STRAIGHT LINE, AND THE REASON IS
MEASUREMENT.** A straight drag is reconstructed exactly by every interpolator,
so a page comparing hold against linear against a spline would grade all three
as perfect **and its whole subject would vanish into a tie.** A curve separates
them.
⚠️ **TIMESTAMPS ARE SUPPLIED**, 200 samples 16 ms apart.
`Input.dispatchMouseEvent` takes one, and without it every sample would be
stamped when the round trip happened, so **the gesture's input rate would be a
measurement of this harness's latency rather than of anything on the page.**
`ev.timeStamp` in the page is what a capture gate reads, so it has to be the
honest one.
⚠️ **SCROLL IT INTO VIEW FIRST, AND RE-READ THE RECTANGLE AFTER.** Headless
Chrome's default viewport is **800x600** and these pages are taller than that,
so a canvas half way down the page has a bounding rectangle whose lower half is
BELOW THE VIEWPORT, **and an input event dispatched at a y past the viewport
lands on nothing at all, silently.** The first run of that helper read
`page asserted something` with a count of 0 for exactly that, while the
identical drag in a 900px window produced 200 moves and 5 asserts.

**A page whose subject is TYPING was a subject this harness could not reach
either**, because a click produces no `input` event and a drag produces no text.
`typist` found two real bugs the first time it was driven with real key events:
a fold at position 0 emptying the box the first letter had just gone into, and a
strip that fits itself once and so drew six of seventy-one edits.
⚠️ **THE SEQUENCE IS NOT A WORD, IT IS THE THREE THINGS FIVE PREVIOUS TEXT
ADAPTERS GOT WRONG**: characters, a BACKSPACE (which never says what it
removed), and an ARROW KEY (which moves the caret with no input event at all). A
page that only ever sees appended characters is a page whose whole argument goes
untested. A named key needs `windowsVirtualKeyCode`, which is what makes
Backspace and the arrows act rather than merely arrive.
⚠️ **UNLIKE THE DRAG, THE TIMING THERE IS REAL.** `Input.insertText` takes no
timestamp, so the recorded intervals are the harness's round trips. That is
acceptable because no claim on that page is about input RATE. It would not be on
a page that measured one, and the difference is worth knowing before reusing it.
🔴 **AND THE COUNT REPORTED IS THE NUMBER ACTUALLY TYPED INTO, NOT THE NUMBER
FOUND.** The first version returned the number of elements and printed "typed
into 1 field" about a read-only box it had skipped: **a harness reporting work it
did not do, which is worse than reporting none.**
⚠️ **A PAGE MAY HAVE TO BE ARMED BEFORE IT CAN BE TYPED INTO**, so if every
field refuses focus the harness presses the PRIMARY control once and asks again.

🔴 **INPUT COMES AFTER THE CONTROLS, BOTH KINDS.** A page that has to be ARMED
before it will record has to be armed before it is drawn on. `draw` grew a
record button and immediately reported `page asserted something` with a count of
0, because the drag was still running first and the page dutifully recorded
nothing.

🔴 **A PAGE WHOSE CONTROL IS STILL RUNNING HAS NOT FINISHED, AND THE HARNESS
USED TO WALK OFF ANYWAY.** The press loop sleeps a fixed 650 ms after each button
and does not await the handler. The case that found it was the retired `seek`
page, whose sweep was five jumps at 700 ms apiece. **It did not show up before
because every such page carried a "Run the checks" BUTTON, which gave the checks
a slot of their own; taking those buttons off the pages took the slot with them
and eleven pages quietly lost their asserts.** The answer was on the page the
whole time: `shell.mjs` already marks a running control `data-busy="1"`, which is
what draws the sweep across the button. ⚠️ CAPPED: a handler that never settles
must cost one demo a wait, not the run.

## Deciding that a page has finished, and every wrong answer so far: `demo/verify.mjs`

🔴 **THE WAIT IS ARMED BY THE PAGE'S OWN `ready`, NOT BY THE COUNT BEING ZERO,
AND THAT DISTINCTION BLINDED THE SUITE.** The first-assert loop ran
`while (n === 0)`, on the reasoning that once anything has landed the cheap
growth loop can take over. **The moment the SHELL gained two asserts of its own,
every page in the suite had a non-zero count at t+0**, that phase fell through on
its first test, and a page was left with 12 tries at 400 ms to produce everything
it had. **MEASURED the day it landed: `/archive/radio/` makes 34 asserts and the suite
collected 2, then reported 13/13 green.** That is this project's worst failure
shape, a green suite with no coverage, **and it hit 28 demos at once because 28
declare `settleMs`.**
⚠️ **"THE PAGE HAS NOT ASSERTED YET" IS NOT "THE COUNT IS ZERO".**
`__demo.shellAsserts` is the shell saying how many of the rows are its, which is
the only thing that separates a page that has barely started from one that is
finished.

🔴 **`isReady` WAS DECLARED AND NEVER CALLED, FOR AS LONG AS IT HAD EXISTED,
WHICH MADE THE COMMENT ABOVE IT A DESCRIPTION OF CODE NOBODY WROTE.** It said in
capitals that a page is done when it says it is ready AND its count has stopped
moving, `Both conditions`, and only one of them was ever tested. **A dead guard
reads as finished work, which is this project's most expensive kind of defect.**

🔴 **AND THE HALF THAT ACTUALLY COST SOMETHING IS THE PATIENCE, NOT THE READY.** A
check block that waited longer than ONE 400 ms poll without asserting was cut off,
and everything after it was lost in silence. **MEASURED 2026-09-22 on `/muta/`,
which grew a sustain check holding a note for 700 ms and its release for 900 ms:
the count stood still across one poll, the loop exited, and two asserts stopped
running, one of them a voice stealing check that had been there for a day. The
suite read 40/40 green before and after, because an assert that never runs cannot
fail. Raising `settleMs` from 8 s to 14 s changed nothing, which is what said the
settle window was not the cause.**
⚠️ **FIVE QUIET POLLS AND NOT ONE, WHICH IS 2.0 s OF SILENCE TOLERATED AND COSTS
1.6 s A PAGE.** A DSP page that holds a note, lets it go and measures the
difference is quiet for over a second BY DESIGN, and that is the check rather
than a delay in it. **`/muta/` lost four asserts to a patience of one and two
more to a patience of three, every time silently and every time still green.**
⚠️ **60 TRIES IS A 24 s CEILING AND COSTS A FAST PAGE NOTHING**, because the loop
leaves the moment a page is quiet and ready. **30 was reached by `/muta/`**,
whose DSP checks hold notes, release them and wait for envelopes for about twelve
seconds in total, and reaching the ceiling drops whatever has not asserted yet
without a word: the same silent truncation as a patience of one, arriving from
the other end of the same loop.
⚠️ **`ready` ALONE WOULD NOT HAVE SAVED IT, WHICH IS WHY BOTH ARE HERE.**
`/muta/` calls `ifSelfcheck(...)` WITHOUT awaiting it and then `d.ready()` on the
next line, so `ready` is true a few milliseconds in and stays true through every
check the page makes. `/archive/radio/` does the same from inside the granulator's boot.
**A page's own claim to be finished is worth reading and is not worth trusting
alone.** ⚠️ And moving `d.ready()` to the END of a page's checks was TRIED: it
made that page fail the 7.4 s boot wait and be graded not at all, because the
same flag answers two questions, *is this page up* and *has it finished*.
Splitting them is a change to the shell contract and to four harnesses, and is in
`BACKLOG.md`.
⚠️ **`__demo.ready` IS A REAL BOOLEAN, WHICH WAS CHECKED AFTER GETTING IT
WRONG.** It was read as *the method a page calls*, on the strength of `ready:`
appearing twice in `shell.mjs`, and `shell.mjs` was changed to publish a separate
flag. **The two `ready` keys are on two different objects**: `api`, which is what
`window.__demo` is, carries the boolean, and the page-facing object returned by
`mount()` carries the method that sets it. The change was reverted. **A key name
appearing twice in a file is not two declarations of one thing.**
⚠️ **THE FIRST-ASSERT CEILING IS ITS OWN NUMBER AND NOT `settleMs`.**
`FIRST_ASSERT_CEIL = 30000`. `settleMs` sizes a COLD CONTAINER (`tracks` declares
125 s) and is a control-0 concern that has already been waited out; reusing it
here makes a page that will never assert, because its live leg is down, burn the
whole budget a SECOND time, turning one demo into four minutes of a run.

🔴 **SAY WHETHER `__demo` IS THERE AT ALL, BECAUSE THE TWO CAUSES LOOK IDENTICAL
FROM THE HARNESS.** `__demo` missing means the module never finished; `__demo`
present with `ready` falsy means the shell mounted and the page did not get to
the end. Both printed `failed: null` and `console: nothing`, **and 2026-09-22 was
spent bisecting the difference by hand.**
🔴 **AND PRINT WHAT THE CONSOLE SAID, BECAUSE THIS IS EXACTLY WHEN IT MATTERS.**
The `no console errors` check runs much later and the `continue` skips it, so a
page that dies before `ready` reported ONE line, `failed: null`, and threw its
actual reason away. **MEASURED 2026-09-17: two separate dangling references on
`/stage/`, each an ordinary ReferenceError sitting in the console, each taking a
round of manual bisecting to find, because the harness knew and did not say.** A
page that never becomes ready is the one case where the console is the whole
story. With no errors at all the harness says `console: nothing, so it is hanging
rather than throwing`.

## The contract asserts, and the options that must announce themselves: `demo/verify.mjs`, `demo/verify-quest.mjs`

⚠️ **A PAGE MAY DECLARE THAT IT HAS NOTHING TO PUT IN A READOUT, BUT IT HAS TO
SAY SO**: `readout: null` rather than an omitted field, so "this page's subject
is visible rather than numeric" cannot be confused with "somebody forgot".
`typist` is the case: the document IS the readout, and a row of cells repeating
the letters and the cursor position was the same facts twice. **An absent field
is still a failure.**
🔴 **AND THE SECOND HARNESS DID NOT GROW THAT FLAG, WHICH IS THE DEFECT.**
`verify.mjs` has read `readoutOptOut` since `/typist/` shipped;
`demo/verify-quest.mjs` went on asserting a readout, **so `/floor/` dropping its
four cells on 2026-09-19 would have taken that file red on a page where nothing
is wrong. Two harnesses grading one rule two ways is the defect, not the page.**

🔴 **A BAR MAY HAVE NO PLAY BUTTON, AND THAT OPTION HAD TO ANNOUNCE ITSELF.**
`transport-bar.mjs` takes `toggle: false` for a page whose sound has no position
to start or resume: `/keys/` holds a note while a key is down and has nothing to
play. Clicking a `.tbar-toggle` that was never appended throws on `null`, and
asserting that the position advanced would fail on a page where nothing is wrong.
⚠️ **`!== false` RATHER THAN A TRUTH TEST**, so a bar built before the option
existed, where the getter is `undefined`, still gets the drill. **A new property
must not silently switch checks off on every page that predates it, which is the
shape of loss this suite has already had once: 27 asserts became 17, every one of
them green.**
🔴 **AND THE DRILL PRESSES THE TOGGLE OF THE BAR IT IS GRADING, NOT THE FIRST ONE
IN THE DOCUMENT.** It read `document.querySelector(".tbar-toggle")` while every
assert around it reads `__demo.transport`, which is the same element only while a
page has exactly ONE bar. **`/stage/` grew a second on 2026-09-18, and the two
disagree by construction**: the DOM query takes whichever comes first in document
order, and `__demo.transport` is whichever was BUILT last. The drill would have
pressed one control and asserted about another, **which fails while nothing is
wrong and passes for the wrong reason just as easily.**

**SAMPLE A CANVAS AFTER A FRAME, AND MORE THAN ONCE.** `resize()` in `strip.mjs`
assigns `canvas.width`, which CLEARS the canvas, and only then schedules a
redraw, **so there is a real window in which a working strip is blank**, and a
ResizeObserver can open it at any time (a readout value getting wider, a log line
wrapping). Sampling one instant caught that window **about one run in ten and
reported `0 lit samples`, which reads as a dead page.** ⚠️ **It is a retry, not a
tolerance**: a strip that never draws still fails, because every try lands after a
fresh frame, and the try count is printed in the detail so a strip that needs
several is visible rather than silently passing.

🔴 **THE HARNESS SAYS `selfcheck=1` SO A PAGE CAN KEEP ITS DESTRUCTIVE CHECKS OUT
OF A VISIT.** `radio` proves a station button works by pressing another station
and pressing back, and proves the transport stops by stopping it. **On the
decoded path both are a decoder teardown and rebuild, so both are a hole in the
sound. They ran for every listener, three times, in the first seconds of a visit,
and were REPORTED as such twice.** A page that can only check itself by breaking
itself needs to know whether anybody is collecting the answer. ⚠️ Every demo gets
the flag and almost none read it, which is the point: **the flag is a fact about
the run, not a per-demo setting to keep in step.**

⚠️ **THE MIDDOT IN A SUITE'S OWN OUTPUT COMES FROM THE HARNESS PRINTER, WHICH IS
WHY A SWEEP OF THE PAGES CANNOT REACH IT.** A sweep of 418 strings across 62 files
missed it because the separator is not in any page: it is added in `ok()`, to
every line, as it is printed. The rule is about anything a reader looks at, **and
a suite run is read more often than most pages.**

⚠️ **THE STAND-INS GO WITH THE RUN.** A server left listening on a port is the
small version of the thing the harness exists to avoid.

## Refusing to grade, rather than failing: `demo/verify-gl.mjs` and `demo/verify-quest.mjs`

🔴 **THE OBVIOUS FIX FOR "NO GPU IN HEADLESS" IS WORSE THAN THE BUG, AND THE
NUMBERS ARE THE ARGUMENT.** Adding `--enable-unsafe-swiftshader` turns the suite
green against a CPU rasteriser. Measured, same shader, same page:

    --disable-gpu                      no context at all
    --enable-unsafe-swiftshader        SwiftShader   170.7 Mpix/s
    GPU allowed                        ANGLE Metal  1392.1 Mpix/s
    (and the real Raspberry Pi GPU)                   50.3 Mpix/s

**The CPU rasteriser on a laptop is 3.4x faster than the real Pi GPU and 8.2x
slower than the real laptop GPU.** A harness "fixed" that way prints plausible
numbers about a machine that does not exist: **it would pass a page that crawls
on a phone and fail one that flies on a laptop.** So `verify-gl.mjs` REFUSES to
grade a run on a software rasteriser, and that refusal is its FIRST assert, the
same rule as the BUILD stamp and for the same reason. Without it every number
below it is unattributable.
⚠️ **REFUSE, DO NOT CARRY ON.** Reporting a software rasteriser as a pass is the
failure the file exists to prevent, **and reporting it as "1 failure among 40
passes" buries it.** `verify-quest.mjs` refuses the same way on four separate
grounds: not Quest hardware, no `com.oculus.browser`, no devtools socket, and no
genuine headset behind a genuine `navigator.xr`.
⚠️ **A GOLDEN IMAGE CANNOT BE THE ANSWER EITHER.** The same shader with identical
fixed inputs **summed 48,147,330 of red on ANGLE Metal and 68,001,881 on
SwiftShader, a 41% difference**, because `fract(sin(dot(p,k)) * 43758.5453)`, the
standard GLSL hash, amplifies last-bit float differences into unrelated noise. So
"the picture is right" is asserted STRUCTURALLY by the page (it drew, it moved,
it is not a flat field), **never by comparing pixels across machines.**

⚠️ **THE TARGET LIST IS CHECKED AFTER THE INSTRUMENT, NOT BEFORE IT.** Exiting
early on "no visual demos yet" meant the file could not answer the question it
exists for, CAN this machine grade a picture, **and it read `0 green` on a box
with no GPU at all, which is the same thing it reads on a box with one.**
`verify-quest.mjs` orders itself the same way for the same reason.

**THE PAGE MUST REPORT ITS OWN RENDERER, ALWAYS, AND IT MUST AGREE WITH THE
HARNESS**, or one of them is describing a different context. A visitor on a
software rasteriser is a real visitor and the page should say so rather than
quietly being slow.
⚠️ **AND WHERE THERE IS NO GPU TIMER, A PAGE MUST SAY "CANNOT MEASURE" RATHER
THAN PRINT A ZERO.** `verify-gl.mjs` prints which timing extension this run has,
because a zero and an absence are different findings.

⚠️ **A PAGE WITH NO CONTROLS MUST STILL BE WAITED FOR.** `mirror` starts itself
and runs its own checks, so there is nothing to press, **and pressing zero buttons
and reading immediately would report "asserted nothing" about a page that was
mid-check.**

🔴 **A GUARD TESTED BY A PARAPHRASE OF ITSELF IS NOT TESTED.**
`verify-quest.mjs`'s `NATIVE_PROBE` is defined ONCE and parameterised over the
property name, so `--self-test` runs the very same source against a property
whose nativeness is already known, and against the same `nativeVerdict` and
`headsetVerdict` the real run uses.
⚠️ **IT READS DESCRIPTORS RATHER THAN VALUES.** Touching an accessor on a
prototype with the prototype as receiver throws "Illegal invocation" in Chromium,
**and a probe that throws reports "absent" about something that is present.**
⚠️ **A1 IS A POSITIVE CONTROL ON THE PROPERTY ACTUALLY IN QUESTION**, not a
stand-in: **a guard that refuses everything would pass A2 and B and be
worthless.**
⚠️ **TWO ASSERTS, NEVER ONE, WHEN TWO CAUSES HAVE DIFFERENT FIXES.** "The XR
object is fake" and "the XR object is real and there is no headset behind it" are
different findings, and `headsetVerdict` names WHICH gate refused, because **a
single boolean collapses them into one message that is wrong half the time.**

⚠️ **ONE `getprop` WITH NO ARGUMENT RETURNS THE ENTIRE TABLE, SO THERE IS NO
GUESSING WHICH PROPERTY NAME THIS BUILD HAPPENS TO CARRY.** A guessed name that is
absent reads as "not a Quest", **which is a broken instrument reported as a
finding.**
⚠️ **MORE THAN ONE DEVICE ATTACHED IS A REFUSAL, NOT A SKIP.** There IS hardware
here, and grading the wrong one silently is the same class of mistake as
attaching to a leftover browser on a fixed port. Name the ambiguity and stop.
⚠️ **THE MODEL IS PRINTED AND NEVER ASSERTED ON.** A Quest 3S reports the
user-agent device token `Quest 3`, the same as a Quest 3 and the same as the Xbox
Edition, so nothing may say which one this is on the strength of a string.
⚠️ **THE DEVTOOLS SOCKET NAME IS NOT STABLE: three are in the wild**
(`com.oculus.browser_devtools_remote`, `chrome_devtools_remote`,
`weblayer_devtools_remote_<pid>`). Discover it from `/proc/net/unix`, prefer the
Browser's, and SAY which one was used. ⚠️ The matching is done on this machine
rather than on the device, because **BusyBox's `grep -o` is not the same tool
everywhere and shell quoting through `adb shell` is one more thing that can
silently return nothing**, which is "a partial result that is too tidy is a
broken collector".
⚠️ **A LANE WITH NOTHING TO SAY MUST SAY SO IN WORDS.** A page that does not
publish `__demo.xr` gets a sentence, not a zero: **a blank cell collapses "we did
not look" and "we looked and it was fine", and a zero here would look like a
dropped-frame finding.** Where both numbers exist, the page's frame count and the
compositor's are printed side by side to be **compared, not averaged.**
⚠️ **AND THE FILE ENDS WITH A LIST OF WHAT IS UNCONFIRMED IN IT**, written when
no headset was attached (2026-09-11): nine specific claims that are reasoned or
read out of research rather than run against hardware, each with the sentence
that says what would flip it. A harness written from documentation says so.

## Harness plumbing that has read as broken code: `demo/verify-gl.mjs`, `demo/verify-native.mjs`, `demo/harness-profile.mjs`, `demo/verify-quest.mjs`

(`demo/verify-native.mjs` refuses with exit 2 since 2026-10-13; the lessons
learned on it below are about every harness and stay.)

⚠️ **CLEAR `DevToolsActivePort` BEFORE THE SPAWN, NEVER AFTER IT.** Chrome writes
that file as it starts, so removing it afterwards **deletes the very thing being
waited for.** (`demo/verify-gl.mjs`, `demo/verify-quest.mjs`.)

⚠️ **THERE USED TO BE A `pkill` IN `verify-gl.mjs` AND IT IS GONE ON PURPOSE.**
Chrome refuses to start on a LOCKED profile and simply exits, so a leftover
browser from the previous run made the harness sit out its whole poll and report
"chrome did not come up": **a Chrome problem in appearance, a stale process in
fact.** The kill fixed that and introduced a worse one: matched on a path that was
the same for everybody, **it reached the OTHER AGENT'S run as readily as the
previous one.** A per-process profile cannot be locked by anything but this
process, so the problem the kill solved no longer exists. A recovery action is not
free.

⚠️ **THE BROWSER ENDPOINT HAS NO `Page` DOMAIN.** `/json/version`'s socket talks
to the BROWSER; `Page.navigate` and `Runtime.evaluate` live on a page target, so
one has to be created and attached to first. Without it the very first call comes
back `'Page.enable' wasn't found`, **which reads like a Chrome version problem and
is not one.** (`demo/verify-gl.mjs`.)

🔴 **CHROME CREATES WHATEVER PATH IT IS HANDED, SO A WRONG PROFILE PATH NEVER
ANNOUNCES ITSELF.** `demo/verify-native.mjs` pointed its `--user-data-dir` at a
dead session's scratchpad **under the repo's PRE-RENAME name** for long enough to
become "the third surviving artifact of elektron to positron, on the one harness
that reaches the iPhone code path". Two agents running it at once shared one
profile and one lock.

⚠️ **`rmSync`, NOT THE PROMISE API, IN AN `exit` HANDLER.** `process.on('exit')`
runs synchronously and an async unlink scheduled there never completes: **the
handler would look correct and delete nothing**, which is the shape of leak
`demo/harness-profile.mjs` exists to close. ⚠️ **`exit` COVERS AN UNCAUGHT
THROW** (node emits it after printing the stack), so only a signal needs its own
listener. ⚠️ And in the sweep, **`EPERM` from `process.kill(pid, 0)` means alive
and not ours, so leave it.**

⚠️ **LET THE FAR END CHOOSE A PORT TOO, AND PARSE WHAT IT ANSWERS.**
`adb forward tcp:0` prints the port it took; for `adb reverse` that is
UNCONFIRMED, so `verify-quest.mjs` parses the answer and falls back to picking a
free port. ⚠️ The `freePort()` helper both it and `verify-safari.mjs` use is
honest about itself: **there is a race between the close and the other process's
bind, and it is still better than a constant.**

## The second browser is not always Chrome: `demo/verify-safari.mjs`

⚠️ **RETIRED 2026-10-13: it drives /llhls/, whose input was deleted, and now
refuses (exit 2) unless run with `--anyway`.** The whole section moved to
Retired at the end of this file, 2026-10-14. What stays true here: CDP is not
WebKit, so with this harness down **nothing on this desk grades Safari or the
iPhone code path**, and that is the gap to say out loud after a player change.

## Parsing is not running, and it is the cheap check: `demo/check-html.mjs`

🔴 **IT EXISTS BECAUSE A BACKTICK INSIDE A GLSL COMMENT CLOSES THE TEMPLATE
LITERAL AROUND IT.** That happened **seven times in one session on
`/videoradio/`**, whose shaders are template literals with prose in them, and
every time **the page died at parse: no log line, no assert, no picture, and an
error in devtools pointing at a line hundreds below the one that broke it.**
`node --check` finds it in about forty milliseconds and says where.
✅ **AND IT IS THE CHECK FOR A CONCEPT PAGE**, since no harness grades those
(top of this file): `node demo/check-html.mjs demo/<group>/<slug>/index.html`.
⚠️ **IT IS NOT A HARNESS AND IT OPENS NOTHING.** No Chrome, no profile, no relay,
no stream off anybody else's server, **which is what makes it the right check to
run after editing a page this repo has asked not to be re-verified.** It answers
one question, "will this parse", and says nothing at all about whether the page
works.
⚠️ **THE REPORTED LINE IS A LINE IN THE PAGE.** Each block is written to a
temporary `.mjs` and the block's start line is added back, because **a number that
is right about a temporary file and wrong about the file being edited is worse
than no number.** Piping into `--check` reports `[stdin]` and page-relative
numbers are lost.
⚠️ **SAY THE BLOCK COUNT.** A page whose script tag was renamed would check zero
blocks and pass, **which is the shape of green this repo minds most.** Only
`type="module"` blocks are parsed; a classic `<script>` is not parsed as one and
this repo has none in a page.

## What a stand-in has to get right, or it grades itself: `demo/fake-station.mjs`, `demo/fake-tapes.mjs`, `demo/fake-err.mjs`, `demo/fake-board.mjs`, `demo/fake-relay.mjs`, `demo/fake-arhiiv.mjs`

Six stand-ins on 2026-10-14 (`ls demo/fake-*.mjs`, plus `fake-board-test.mjs`).
The three below were the first; `fake-board.mjs` and `fake-relay.mjs` are the
Pi and the relay (top of this file) and say in their own headers that they
follow the same rules: the board's tone is 220 Hz and 330 Hz a fifth apart
with the 330 pulsing, *"THE SAME RULE AS THE OTHER THREE STAND-INS"*, and
the relay copies the real one's roof and token buckets *"so a stand-in is not
more generous than the relay"*.

🔴 **NOT SILENCE AND NOT WHITE NOISE.** All three stand-ins generate two tones a
fifth apart with one of them pulsing at 2 Hz. **A loop over silence passes every
check that counts frames and none that measure a level, which is the vacuous pass
this repo has already shipped twice.** A tone has a peak a meter can read, **and a
PULSE means a check can tell a loop playing backwards from one playing forwards by
looking at where the loud part landed.** (`demo/fake-station.mjs`, repeated in
`demo/fake-tapes.mjs` and `demo/fake-err.mjs`.)

🔴 **PACE AGAINST THE CLOCK, NOT AGAINST THE TIMER, AND THE DIFFERENCE WAS
MEASURABLE FROM INSIDE THE PAGE.** Sending a fixed chunk per `setInterval` tick
sends at the rate the timer actually fires, and node's timers run a millisecond or
two late: **MEASURED through `/archive/radio/`'s own settled-rate readout, 125 kbit/s
against the 128 declared, which is 2.3% slow. A listener then loses about 23 ms of
cushion every second, so the page's 600 ms floor drained to 32 ms over half a
minute and its `the cushion outlasts the worst gap in it` check went red about a
page that was working perfectly.** A real Icecast paces against its own audio
clock, so the stand-in sends however many bytes are OWED since the connection
opened. (`demo/fake-station.mjs`, and `demo/fake-err.mjs`'s radio mounts do the
same.)

🔴 **IT BURSTS AT CONNECT, BECAUSE ICECAST DOES, AND A PAGE THAT MEASURES ITS OWN
CUSHION CAN TELL.** `burst-size` defaults to 65536 bytes on a real mount: four
seconds of 128 kbit/s audio arrive at once. **MEASURED without it: the page's
cushion sat at 199 ms against a 104 ms worst gap, which is 95 ms of headroom and a
red `the cushion outlasts the worst gap in it` at a threshold of 100. That assert
was reading a property of this file rather than of the page, which is the whole
failure mode a stand-in has.**

🔴 **IT STARTS ON A RANDOM FRAME BOUNDARY, WHICH IS THE WHOLE POINT OF A STAND-IN
THAT IS HONEST.** A real mount joins a listener mid-frame and the splitter has to
resynchronise; **starting at byte 0 of the file would let a scanner that can only
find frames at the head pass.** `sinceMeta` carries across the loop for the same
reason: the text channel does not restart when the audio does.

🔴 **THE HEALTH ROUTE ANSWERS THE SAME SHAPE `shout` DOES, because the page asks
it BEFORE it plays anything and disables its play button when nothing is up.** A
stand-in that answered a different shape would take the page down the "neither
station is answering" path, **where it makes one assert and none of the thirty-four
that matter.**

⚠️ **ANSWER THE PREFLIGHT.** A browser asking for `Icy-MetaData` sends a
non-simple header, so it preflights first, and **refusing OPTIONS looks exactly
like a CORS bug in the page.**

⚠️ **A STAND-IN THAT CANNOT BE BUILT SAYS WHY AND RETURNS `null`, RATHER THAN
EXITING OR SERVING SILENCE.** A harness importing it has to be able to report
"the stand-in could not be built" as the reason a page was not graded, **which is
a different sentence from a page that failed.**

🔴 **THE LENGTHS ARE THE WHOLE POINT, NOT A DETAIL.** `/tapes/` lays every
recording end to end as one long tape and its checks grade that geometry, **so a
stand-in whose lengths were invented would leave every one of those asserts
grading the stand-in instead of the page.** MEASURED off the wire with ffprobe
against what the corpus says: **the MP4 rows land EXACTLY (626335 asked, 626.335000
read), and the MP3 rows land inside one frame, which is 24 ms and is the smallest
thing a stream of whole frames can be cut to (829832 asked, 829824 read; 73169
asked, 73176 read).**

🔴 **NO Xing HEADER AND NO ID3, WHICH IS THE TRAP IN TILING AN MP3.** libmp3lame
writes a Xing/LAME frame at the head declaring the frame COUNT of the file it
encoded. **Tile that and the browser reports the tile's eight seconds for a
thirteen minute recording: a stand-in that lies about exactly the quantity it
exists to get right.**
🔴 **AND IT REFUSES A TILE THAT IS NOT WHOLE FRAMES RATHER THAN SERVING IT.** An
ID3 or Xing block at the head shifts every frame off the 192-byte grid, so the
wrap in the middle of a long recording lands inside a frame and the decoder hears
a click every eight seconds. **It would still play, and the page would still be
green, which is why this is a throw and not a log.**

🔴 **EVERY `.mp4` ROW IS A REAL MP4.** MP3 bytes under an `.mp4` name would be a
stand-in answering a different shape from the thing it stands in for, **so
whatever a browser then did with it would be a fact about Chrome's container
sniffing rather than about this page.**

⚠️ **A STAND-IN SAYS WHAT IT DOES NOT HAVE.** A bare 404 reads as the recording
being gone or the channel being off air, **which is a claim a stand-in is not
entitled to make about anybody's archive or broadcaster.** In `fake-err.mjs` the
404 body matters twice over: **a refusal there is a 403 with no CORS, and
answering a typo the same way would make a wrong URL indistinguishable from
rights.**

⚠️ **INDEX BOTH SPELLINGS OF A PERCENT-ENCODED PATH.** The corpus names carry
spaces, brackets and Finnish vowels, and the encoding that comes back on the wire
is the browser's rather than the corpus's, **so a difference of one escape is a
recording that plays rather than a 404 that reads as a file having been taken
down.**

🔴 **403 AND NOT ONE CORS HEADER, WHICH IS THE WHOLE POINT OF THE REFUSAL.** In a
browser it is not a status code at all: the fetch rejects and hls.js reports a
fragment load error with nothing in it that names a 403. **A 403 that DID carry
`access-control-allow-origin` would be readable, `r.ok` would be false, and the
page would take the other of its two paths.** ⚠️ No ACAO means no preflight answer
either: **answering OPTIONS for a segment that is then refused would let a page
learn something about the refusal that ERR does not tell it.**

⚠️ **THE BOUNDARY SLIDES IN THE STAND-IN AND JUMPS AT ERR, AND THAT IS
DELIBERATE.** Theirs is a programme edge, so it sits still for half an hour and
then moves by however long that programme was. The stand-in's is a fixed distance
from the live edge, which is deterministic and therefore gradeable. It is the one
behaviour in the file deliberately unlike the thing it stands in for, **and the
trade is the usual one: a harness cannot assert against a quantity that moves for
reasons it cannot see.**

🔴 **REFUSE A SHORT POOL RATHER THAN SERVING IT.** ffmpeg exiting 0 having written
fewer segments than asked **would give a window with a hole in it that answers
exactly like a rights refusal, which is the one thing that file exists to be able
to tell apart.**
🔴 **AND IT IS BUILT INTO A TEMPORARY DIRECTORY AND RENAMED INTO PLACE.** A run
that is Ctrl-C'd halfway leaves a partial pool, **and a partial pool is a stand-in
that 403s a random stretch of the window for a reason nobody wrote down. The
rename is the commit.**

⚠️ **A STAND-IN MUST NOT BE MORE GENEROUS THAN THE THING IT STANDS IN FOR.** One
`#EXT-X-PROGRAM-DATE-TIME`, on the first segment, which is what ERR sends: **a PDT
on every segment would let a page be sloppy about accumulating `EXTINF` and still
look correct here.** The schedule is contiguous across midnight for the same
reason: **a grid that stopped at 23:30 and started again at 00:30 would fail
`/now/`'s "every programme starts where the previous one ended" on a page that is
working.** And the segment duration is read off ERR rather than chosen: **1.92 s
and 3750 segments, MEASURED twice; a stand-in at 6 s would hand the page a
playlist a third the length and quietly remove two thirds of the parsing work it
is supposed to be grading.**
🔴 **AND FOR A MONTH IT WAS NOT READ OFF ERR, WHILE A COMMENT SAID IT WAS.**
Until 2026-10-05 the television half was 2 s, 3600 segments, MPEG-TS and no
session, against a record that measured 1.92 s, 3750, fMP4 and a `?id=` the
variant 400s without. The missing session is the one that cost something: `/now/`
re-read the master once a second, opening a new session at ERR every second, and
a stand-in with no sessions could not tell that from opening one. **Check a
stand-in against the measurement it claims, not against its own comment.**

⚠️ **THE BUILD NOTICE IGNORES `quiet`, AND THAT IS NOT AN OVERSIGHT.** Making the
pool blocks for about a minute the first time on a machine, **and a harness that
goes silent for a minute before Chrome even starts is indistinguishable from a
harness that has hung.**

⚠️ **NAME WHAT WAS NOT CHECKED, AND WHY NOT.** `fake-err.mjs` exposes the `date`
response header because `readPlaylist` uses it as the server's own clock, and says
in the same comment: **whether ERR exposes it is NOT KNOWN here and was not
checked, because checking means asking them. Nothing on either page asserts
against `serverDate`, so the difference cannot make a check pass here that would
fail there; if one is ever written, that is the first thing to confirm.**

⚠️ **BUILDING FIXTURES BESIDE A HEADLESS CHROME IS "A SECOND BROWSER OF YOUR OWN"
IN A NEW COSTUME.** `fake-tapes.mjs` builds its video rows on demand under a
harness and in the background when run standalone, because **eleven seconds of
ffmpeg alongside a headless Chrome is the same contention**, and the harness never
opens a video row: it walks the first two recordings and both are MP3.

## The pure-module tests in `demo/shell/*-test.mjs`, and the shapes that pass a naive suite

🔴 **A VALIDATOR, A LOOKUP TABLE, A SEGMENT MAP AND A PARSER ARE THE SHAPES OF
CODE THAT PASS A NAIVE TEST SUITE BY ACCIDENT.** Write only valid patches and a
function that returns `{ok: true}` unconditionally scores full marks
(`bay-test.mjs`); a `describe()` that returned the raw name for everything
satisfies any check that only asks whether something came back
(`instruments-test.mjs`); a table returning "every bar on" for every character
draws a field full of `8`s and satisfies any check that only asks whether
something lit up (`segment-test.mjs`); a reader that returned an empty array for
everything passes a suite that only counts entries (`unzip-test.mjs`). **So the
convention in this directory is that a named proportion of every file is NEGATIVE
CONTROLS: written so that the bug they name would fail them, rather than so that
today's code passes.** The counts are stated in each header (20 in
`chords-test.mjs`, 19 in `pedal-test.mjs`, 13 in `diagram-test.mjs`, 10 in
`name-test.mjs`, 6 in `presence-test.mjs` and `suggest-test.mjs`, 5 in
`xr-glb-test.mjs`, 4 in several), and **a validator that refuses everything is the
same bug from the other side, so `bay-test.mjs` asserts the REASON as well as the
refusal.**

🔴 **AND THE SABOTAGE COUNTS ARE MEASURED RATHER THAN CLAIMED, WHICH IS THE ONLY
REASON TO BELIEVE ANY OF IT GRADES ANYTHING.**
- `pedal-test.mjs`: **seven deliberate sabotages take between 1 and 4 of them red,
  MEASURED 2026-09-22.** A threshold of `=== 127` costs 2, a `keyDown` that does
  not take a note off the foot costs 3, no change filter costs 1, a panic that
  keeps the foot costs 2, a `keyUp` reading only `was` costs 2, a constant damper
  time costs 4, and a `forgetKeys` that leaves the keys alone costs 1.
- `worklet-test.mjs`: **five sabotages, MEASURED 2026-09-23**, dropping the value
  guard 9 red, dropping the name check 4 red, dropping the `[native code]` guard
  2 red, `let` instead of `const` 2 red, **emitting the values in REVERSE 0 red**.
- `presence-test.mjs`: the `coming` check moved above the `online` check
  **MEASURED 28/28 to 27/28, and the one that went red is the one written for
  it**; the "never heard, nobody listening" case answering `offline` instead of
  `unknown` **MEASURED 28/28 to 25/28, and the third failure is the good one: the
  walk at the bottom stops reaching all four states at all.**
- `circuit-sample-test.mjs`: a real sample is broken five ways **and one of them
  takes only 2 of 12 red, and all ten survivors are RIGHT to survive, which is
  reported rather than tuned away.**
- `circuit-session-test.mjs`: the round trip is sabotaged four ways and **one of
  those sabotages leaves the round trip GREEN, which is the honest answer to what
  it can and cannot prove, and it is reported rather than hidden.**

⚠️ **A ZERO IN THAT TABLE IS KEPT RATHER THAN ENGINEERED AWAY.** Reversing the
order `worklet.mjs` emits its values changes nothing, because a name inside a
function body is read when the function runs and every `const` has landed by then.
**The first version of that file asserted the opposite and went red on working
code**, so the order is explicitly NOT a rule and the module says so.

🔴 **A SABOTAGE THAT COMES BACK GREEN CAN BE A REAL DEFECT RATHER THAN A WEAK
TEST.** `if (!keysDown.has(n))` at the pedal lift, copied over from `/muta/`, was
**UNREACHABLE: the two sets are disjoint by construction, so the test could never
be false. Removing it changed nothing, which is this project's own signal for a
dead guard.** The hunt for a reachable path then turned up a duplicate note off
releasing a note twice, **which was a live bug in `/muta/` and is fixed in both.**

🔴 **AN ABSENCE ASSERTED OVER A FILE'S RAW SOURCE GRADES THE PROSE, AND TWO
ASSERTS WERE GREEN WHILE MATCHING COMMENT TEXT. MEASURED 2026-09-22 in
`instrument-test.mjs`.** `it calls the two components that already exist` tested
`/createNameplate\(/` against the raw source, **and `createNameplate` was IMPORTED
AND NEVER CALLED: the only occurrence was the worked example in that module's own
header.** `the plate is prepended to the case` tested
`/panel\.el\.prepend\(plate\.el\)/`, **and that line had not existed in the code
since `createPanelLayout` took a `plate` option; the only occurrence was inside the
comment explaining why it had been removed.** Both matched, both passed, **and one
of them was grading a prohibition against the sentence describing it.**
✅ **THE REPAIR IS TO STRIP THE COMMENTS FIRST**: an absence is asserted over
`code` and a presence over `code` too, **and only a claim about the PROSE may read
the raw source.** `knob-test.mjs` went red on its first run for the best possible
reason, on its own module's sentence *"Writing `num.style.minWidth` from here
would be a rule nothing can override"*; `check-test.mjs` and `step-grid-test.mjs`
carry the same stripper for the same reason. This is the substring rule in its
cheapest form.

🔴 **AND THE SUBSTRING RULE BIT INSIDE A FILE WRITTEN TO CATCH IT.**
`midi-decode-test.mjs` asserted `.includes('velocity 0')` for a note on at
velocity 0, **and it passed vacuously under the sabotage, because a decoder that
wrongly calls it a note ON also writes `velocity 0` in its reading. Assert the
word that only the CORRECT branch produces.**

🔴 **GRADE AGAINST A DIFFERENT SOURCE FROM THE ONE THE CODE CAME FROM.** This is
the `timeline/csound.mjs` lesson applied in advance, and three files here do it
deliberately: `circuit-cc-test.mjs` compares a table parsed out of Novation's
Programmer's Reference Guide **against what this desk measured through `/dump/`
and wrote into `research/measured-devices-2026-09-20.md`**; `circuit-patch-test.mjs` and
`circuit-session-test.mjs` reproduce **figures published before those modules
existed, computed by a decoder that lived in a scratchpad and is gone**, so
reproducing one is **two independent implementations agreeing about one real
artefact.** ⚠️ **Where they DISAGREE the disagreement is kept and named rather
than tuned away**, and there is one: the 49 block map is true of the first session and
of 21 of the 32 sessions, not of all of them.

🔴 **A FLOOR PROVES AN INSTRUMENT DOES NOT INVENT MOVEMENT. ONLY A KNOWN SIGNAL
PROVES IT CAN SEE ANY.** `circuit-syx-test.mjs` decodes a synthetic group whose
answer is written out by hand BEFORE it is pointed at a real file, because **two
builds of `wobble-test.mjs` measured the wrong quantity and passed their floor
perfectly.** The same argument runs the other way in `midi-decode-test.mjs`: four
real devices are plugged into this machine and **not one of them can test that
file, because what a device happens to send today is not a known answer.**
🔴 **AND THE REAL CORPUS CANNOT ALWAYS GRADE THE WALKER.** In
`circuit-sample-test.mjs`, **all 64 samples are `fmt ` then `data` and nothing
else, so the audio starts at offset 44 in 64 of 64 and a reader that skipped 44
bytes and called it a header would be green on every one of them.** The synthetic
fixtures with a `LIST` chunk of odd length are **the only thing in this repository
that can tell the two readers apart.**

⚠️ **SAY WHAT IS NOT GRADED HERE, AT THE TOP, BECAUSE A GREEN SUITE CAN MEAN ZERO
COVERAGE.** `knob-test.mjs`, `range-slider-test.mjs`, `step-grid-test.mjs`,
`synth-view-test.mjs`, `wave-view-test.mjs`, `note-grid-test.mjs`,
`instrument-test.mjs`, `control-grid-test.mjs` and `check-test.mjs` each open with
a list of the claims that need a document and are asserted on `/kit/`, `/tom/` or
`/pack/` instead, **and each names the constructor it never calls.**
⚠️ **A SKIP NAMES WHAT GOES UNMEASURED RATHER THAN PASSING QUIETLY**, the way
`timeline/lab/csound-oracle.mjs` skips where Csound is not installed, because **a
check nobody can run is a check nobody runs.** `mp3-frames-test.mjs`'s live arm
against the relay, and every section that reads the owner's Circuit pack out of
gitignored `tmp/`, skip that way.
⚠️ **AND THE MADE-UP RULER IS THE POINT, NOT A COMPROMISE.** `diagram-test.mjs`
uses a fixed width per character because `getComputedTextLength` needs a live
document, **which makes every expected number in the file exact rather than
approximate.** What it cannot check is the real font, and it says so.

🔴 **A CHECK ABOUT A LINE THAT CANNOT BE FORGOTTEN IS A CHECK THAT CANNOT FAIL.**
`xr-quit-test.mjs` exists because of a report, 2026-09-19: *"i was not able to get
out"*. `/blocks/` called `createXRQuit` and `draw` every frame and **never once
called `update`, so the hold could not advance, the ring could not fill and the
session could not end.** ⚠️ **IT LOOKED CORRECT FROM EVERY ANGLE THAT CAN BE
LOOKED FROM**: the object was built, its shader compiled, the badge was drawn at
both hands every frame, and the page reported a way out as present. `/weight/`,
`/floor/` and `xr-panel.mjs` all had the missing line, **so no shared code was
wrong and nothing in the repo could disagree with anything.** The old check was a
grep matched on the ARGUMENT (`inputSources`) rather than the method name, because
a name match stayed green with the quit's own call deleted. When the design
changed so that the line cannot be forgotten, **the grep became a check that
cannot fail and was replaced**: the shared path is now RUN, by a fake session
driving the real `mountXRQuit` on a laptop with no browser, no GL and no headset.
⚠️ **A STATIC CHECK IS A WEAK CHECK AND IT IS SAID THERE RATHER THAN DISCOVERED
LATER**: the source half proves the call exists, not that the page reached it.

⚠️ **THE CORNER CASE EARNS ITS PLACE AND THE CENTRE DOES NOT.** `xr-pick-test.mjs`
tests the top-left of the quad because **the centre hits at 0.5, 0.5 under EVERY
mirror, transpose and axis swap you could make**, which is a statistic that is
constant by construction over the defects it is meant to catch. The top-left is
what distinguishes `0,0` from `1,1`, `1,0` and `0,1`.
⚠️ **AND WHERE A MODULE DERIVES ITS LAYOUT AT LOAD, THE ONLY HONEST WAY TO ASK IT
ABOUT A DIFFERENT LIST IS TO REWRITE THE SOURCE AND IMPORT IT.** Pushing onto
`DEFAULT_CONTROLS` afterwards changes the list and not the canvas, **so the rows
would be laid out for a shorter tablet and the hit test would answer about a row
that is off the bottom.**

⚠️ **WRITING THE EXPECTED STATE OUT BY HAND IS DOING THE MACHINE'S ARITHMETIC A
SECOND TIME AND GETTING IT WRONG.** `numloop-test.mjs`'s first version asserted
`looping` at nine presses and went red: the walk is recording, looping, stopped
and then an alternation, **so an odd press after the first two is a STOP. What is
actually promised is that it never falls out of the pair**, and that is what the
check asserts.

⚠️ **AND A PICTURE IS THE EASIEST THING IN THE WORLD TO WRITE GREEN.** Any curve
that goes down looks like a low pass, any line with a peak in it looks like an
envelope, and a sine looks like a sine whatever produced it, so
`synth-view-test.mjs` asserts COMPARISONS rather than shapes: a low pass and a
high pass have to disagree at both ends, four poles have to fall faster than two,
raising the resonance has to lift the corner and nothing else.
`wave-view-test.mjs` proves its picture is a min/max envelope and not a
decimation **by building four broken drawers and measuring which named claims each
one takes red, because a sine drawn either way looks like a sine and the
difference only shows on a transient one sample wide, which is exactly what a drum
sample is made of.**

## From the handoffs (extracted 2026-10-19)

- **A red beside another headless Chrome is not a red.** `/sync/` CLOCKS went red twice beside another Chrome and read 81/81 alone. (`HANDOFF.md, session 64 (2026-10-05)`)
- **A check that reads a value across a move breaks silently.** `code-lang-test.mjs` read a constant out of a page after it moved to `score.mjs`, and was broken for days. (`HANDOFF.md, session 64 (2026-10-05)`)
- **A count floor goes stale when blocks are removed**; three asserts went red for that alone. (`HANDOFF.md, session 64 (2026-10-05)`)
- **A stand-in only catches a bug it can represent.** `fake-err.mjs` had no sessions, so `/now/` opening an ERR session every second read green for a month. (`HANDOFF.md, session 64 (2026-10-05)`)
- **Assert the drawn width, not the declared one**: Chrome draws a 1.54 px border as 1 px on a 1x screen. (`HANDOFF.md, session 64 (2026-10-05)`)
- **Cap a check's waits under the harness's 2 s of silence.** Past it the harness stops collecting, so two reds silently dropped six asserts. (`HANDOFF.md, session 65 (2026-10-06)`)
- **Keep tolerances consistent across checks**: half a pixel moved by a new block above flipped a strict visibility test. (`HANDOFF.md, session 65 (2026-10-06)`)
- **Slow checks run after `d.ready()`**, which is the harness's boot wait; the synths deck's 24 sound checks take about 20 s. (`HANDOFF.md, session 66 (2026-10-06)`)
- **A page that misses the ready wait reads 0/1 whatever it holds** (`/kit/` 0/1 with 207 asserts). A slow page declares `bootMs` (`/kit/` 12000) instead of the fixed 7.4 s. (`HANDOFF.md, session 50 (2026-09-26)`, `session 51 (2026-09-26)`)
- **Prove a measurement can run before trusting what it gates.** The typewriter had no room settings, its loudness measure crashed, and no trim was ever applied. (`HANDOFF.md, session 74 (2026-10-11)`)
- **Run `node demo/check-html.mjs` after every scripted edit.** Python slice edits left a duplicated tail and a clashing name; it caught all three. (`HANDOFF.md, session 71 (2026-10-09)`)
- **Read the tier from `selfcheck.mjs`, never `selfcheck === '1'`**: seven files did, so a deep run switched their checks off. (`HANDOFF.md, session 62 (2026-10-05)`)
- **An assert on a detached element passes while nobody sees it.** `textContent = ''` on `panel.stage` took the caption slot with it, and the assert read the same detached slot. (`HANDOFF.md, session 57 (2026-09-30)`)
- **Sample pixels for anything painted.** `getComputedStyle(canvas).borderTopWidth === 0` stayed green while a ring was stroked into the canvas; a corner pixel sample sees it. (`HANDOFF.md, session 55 (2026-09-29)`)
- **Shapes of an assert that cannot fail**: an array compared to a string; a box compared to the container it sizes; paddings compared to a token while the letters sit apart; a note struck and released in the same millisecond, which is one onset either way. (`HANDOFF.md, session 50 (2026-09-26)`)
- **An assert must not encode a page-local decision**: one required the opposite of what the owner had asked and defended it. (`HANDOFF.md, session 50 (2026-09-26)`)
- **Use the harness's press selector verbatim** (`.pos-controls button, .tbar-x`). An assert reading `!e.closest('.pos-controls')` would have passed a control the suite presses. (`HANDOFF.md, session 54 (2026-09-28)`)
- **`grep -c "d.assert("` against the run's count shows dead branches**: `/pack/` grep went 65 to 62 while its run read 31 both times. (`HANDOFF.md, session 55 (2026-09-29)`)
- **A reset can launder an underrun assert**: `{ cmd: 'reset' }` zeroes the worklet's `starved` counter along with its ring. (`HANDOFF.md, session 55 (2026-09-29)`)
- **A new first tab part changes which part `createTabs` opens**, and rect checks on the shut part go red. (`HANDOFF.md, session 51 (2026-09-26)`)
- **An existence check on a hand-copied file proves only that a copy once happened** (`rig/audit.mjs`, `test -e`). (`HANDOFF.md, session 50 (2026-09-25)`)
- **A green on a warm container is not a green**: cold, `/stage/` read 37/49. (`HANDOFF.md, session 49 (2026-09-25)`)
- **Check the certificate issuer before believing a 000.** positron.studio once answered with a `Fortiguard SDNS Blocked Page` certificate from the network; the `workers.dev` address confirmed the deploy. (`HANDOFF.md, session 65 (2026-10-06)`)
- **A full-page capture of a very tall page hangs Chrome** (`captureBeyondViewport` at 23,800 px never answered). Clip it in pieces. (`HANDOFF.md, session 52 (2026-09-27)`)
- **Local green says nothing about hand-listed build copies.** `DEMO_BASE=https://positron.studio node demo/verify.mjs slides/synths` caught two artefacts 404 on the edge, and costs no external source. (`HANDOFF.md, session 67 (2026-10-06)`)

## Retired

Moved here 2026-10-14, verbatim, when the skill was rewritten around the
patchbay. Each rule below was true and paid for; what retired is the page or
the tool it was about. Read it for the lesson, not for a command to run.

### `/now/` and `/flipper/` against `demo/fake-err.mjs`

Retired 2026-10-12: `/flipper/` was archived on *"archive flipper"*
(`archive/demos/flipper-index.html`, the URL 404s), and `/now/` had been folded
into it on 2026-10-05 (`archive/demos/now-index.html`). `demo/verify.mjs` keeps
the stand-in wiring with `ERR_PAGES = []`. The general lessons this taught (a
stand-in makes a page runnable without making it graded; a negative control;
a counter beats a state) stay live in the stand-ins section above.

✅ **AND `/now/` AND `/flipper/` HAVE THEIRS SINCE 2026-09-18, WHICH WAS THE
LAST PAIR STILL POINTED AT A BROADCASTER.** `demo/fake-err.mjs` is an HLS live
edge that is nobody's broadcaster: a master, a media playlist sliding with wall
clock at 1.92 s a segment over a 2 h window (3750 of them), one
`PROGRAM-DATE-TIME`, fMP4 behind one `#EXT-X-MAP` that really decodes, a
`?id=` session the master mints and the variant insists on, Range, `#EXT-X-DISCONTINUITY` at the pool's one seam, the
schedule endpoint and the five radio mounts. `demo/shell/err-live.mjs` gained
`errUrl()` and a `?base=`, and `/flipper/` now imports `CHANNELS` from it rather
than holding a fourth copy. **MEASURED, AND RE-RUN INDEPENDENTLY: `now` and
`flipper` together 52/52 with the only hosts contacted being the dev server and
the stand-in.** Cold build 55.4 s and 105 MB, cached in the system temporary
directory. ⚠️ **IT REPRODUCES THE REFUSALS, NOT JUST THE STREAM**: 403 with no
`access-control-allow-origin`, in the three shapes measured on 2026-09-06,
verified by a 13-point sweep.
🔴 **AND BOTH PAGES ARE BLIND TO THEM.** Switching the refusal off entirely
leaves both fully green and changes only the harness's own summary line, `+33
upstream refusals` becoming `+3`. Corroborated separately: **no assert in either
page names a refusal, a 403 or a served segment.** So the boundary neither page
can work without is graded by nothing, which is the same hole already recorded
twice for `fake-tapes.mjs`. In `BACKLOG.md`.
⚠️ **NO BURNED CLOCK IN THAT PICTURE, AND THE REASON IS ALREADY IN THIS FILE.**
`ffmpegFilters()` needs `drawtext`, which needs libfreetype, and the ffmpeg on
PATH here reports zero `drawtext` filters. `src/publish.sh` pins `ffmpeg@7` for
exactly this and says so in a comment.

### `demo/verify-safari.mjs`: why the second browser existed

Retired 2026-10-13: it drove `/llhls/`, whose Stream input (`positron-demo`)
was deleted that day, and it refuses (exit 2) unless run with `--anyway`
(`demo/verify-safari.mjs` line 30). Re-pointing it and `verify-native.mjs` at a
page with a stream is in `BACKLOG.md` (the live caller is `/video/llhls/`,
which needs a camera and makes a Stream recording per run, so it is a deep
tier change, not a URL swap).

**WHY IT EXISTS.** `verify.mjs` speaks CDP, which Safari does not, so the whole
WebKit family was untested. **macOS Safari is the ONE platform with both a plain
MediaSource AND native HLS, which makes it the only place the choice between the
two engines is a real judgement rather than forced**, and it shares an engine
family with the iPhone, so it catches WebKit-specific breakage without a phone in
hand. WebDriver is plain HTTP and JSON, so there are no dependencies; Safari needs
"Develop > Allow Remote Automation" once, and `safaridriver` answers `/status`
with `{ready:true}` when it is on.

🔴 **THE PORT WAS NEVER THE REAL LIMIT HERE, AND FIXING IT DOES NOT MAKE THIS
CONCURRENT.** `safaridriver` drives the one Safari on this machine, and Remote
Automation is a single global switch, **so two of these at once is still two
harnesses fighting over one browser. It will just now fail somewhere honest
instead of on a port collision that looked like a code fault.**

🔴 **UNDER NATIVE HLS, `currentTime` DOES NOT SHARE A TIMELINE WITH `buffered`.**
MEASURED in Safari: **currentTime 58.44 against buffered [[20,30]] while playing
at 0.961x.** So the buffer report deliberately answers null, which is **"cannot
tell", not "empty"**, and the harness skips that assert on the native engine:
**demanding a number there would fail a healthy player.**

⚠️ **ASK THE ELEMENT DIRECTLY, AND DUMP THE WHOLE PAGE LOG.** The first run
reported an empty readout with no explanation, **because the native telemetry
loop gated EVERYTHING behind `getStartDate()` being available**, and only the
`bad` log lines were being printed, which hid WHY. It now prints `paused`,
`readyState`, `networkState`, `currentTime`, `duration`, `buffered`,
`seekableEnd`, `videoWidth`, `getStartDate` and any media error, plus the last 18
log lines, before it asserts anything.
