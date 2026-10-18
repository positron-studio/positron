# archive/demos: retired demo pages

One file per page, kept verbatim and named `<slug>-index.html`. Nothing in here
is loaded, imported or deployed. `workers/view/build.mjs` walks the rows of
`demo/manifest.mjs` and skips anything without `built: true`, so a page with no
row is never copied, and these files sit outside `demo/` as well. A slug
archived here 404s on positron.studio and any link anybody kept is dead.
⚠️ **THAT SENTENCE READ "ENUMERATES `demo/`" UNTIL 2026-09-25 AND THE BUILD
DOES NOT.** `build.mjs:531` is `for (const d of DEMO_MANIFEST)` with a
`if (!d.built) continue` under it, which is why taking a row out is the half
that actually removes a page and why moving the directory alone would not.

A page is archived rather than deleted when the code still answers a question
somebody may ask again. It is not a fallback and must not be wired back in: a
page here has no row in `demo/manifest.mjs`, so no harness opens it and nothing
grades it any more.

## `bay-index.html`, `able-index.html`, retired 2026-09-25

Two instructions, one shape: *"arhive bay demo and rm from index. use the
connecting code in wish"* and *"arhcive able demo and rm from index"*. No fault
was reported on either and none was found. The owner was asked which reading of
*archive* was meant and confirmed BOTH halves each time, so `built: false` alone
was refused: the rows are out of `demo/manifest.mjs` and the files are out of
`demo/`. `/bay/` and `/able/` 404 on positron.studio, no harness opens them and
nothing grades them any more. MEASURED across the move: **`DEMOS` went from 59
rows to 57.**

### `bay`, the first page here that sent to an instrument

`/bay/`, act 4, instruments group, created 2026-09-21, `built: true`, no
`settleMs`, no controls row. Its line read *"route one instrument to another,
with the connections it refuses explained in words"*, and its four cells were
`instruments`, `links`, `sent` and `heard`. **`heard` sat beside `sent` on
purpose**: they are counted at opposite ends of the link, and a counter on the
sending side is not evidence the far end did anything.

Asked for as *"Can you do patchbay deno called bay"*, straight after
`plans/plan-patchbay.md`. The three hardware panels before it all listen. This
one routed one instrument into another and could therefore do damage, which is
why every port carried an `accepts` list and why nothing on the page turned a
SysEx, a program change or a clock byte into bytes. The line that mattered:
**the Circuit's input does not accept SysEx**, because that device has no
factory reset and one byte inside a SysEx message overwrites a patch. It made
**37 asserts** of its own.

🔴 **THE MODULE IS NOT RETIRED, IT IS REHOMED, AND THAT WAS THE OTHER HALF OF
THE SAME SENTENCE.** *"use the connecting code in wish"*. `demo/shell/bay.mjs`
is pure and was never in the page: it holds the model, the validator and the
text form, and `node demo/shell/bay-test.mjs` grades it with no browser at all.
MEASURED on the day of the move: **69/69 green**, most of them negative
controls, because a validator is the one kind of code that passes a naive suite
by returning `{ok: true}` to everything. ⚠️ **AND THE PAGE AND THE MANIFEST BOTH
UNDERSTATED IT**: the page's own header says 36 asserts and the manifest row
said 30. The page is archived with its number as it was written, which is what
an archive is for.

⚠️ **NEITHER KIT MODULE IS ORPHANED BY THIS, WHICH WAS MEASURED RATHER THAN
ASSUMED.** After the move `demo/shell/bay.mjs` still has three live importers
(`demo/wish/index.html`, `workers/wish/src/wish.mjs`,
`workers/wish/src/wish-test.mjs`) and `demo/shell/instruments.mjs` still has one
(`demo/wish/index.html`). ⚠️ `research/name-lookups-2026-09-21.md` says
`demo/bay/index.html` was *"the only live importer"* of `describe()`; that was
already wrong before this move, because `/wish/` imports it too.

⚠️ **EVERY OTHER LIVE FILE NAMING `bay` NAMES THE MODULE OR THE LESSON, NOT THE
PAGE.** `demo/shape/index.html`, `demo/evo/index.html`, `demo/wish/index.html`,
`demo/kit/index.html`, `demo/shell/presence.mjs`, `demo/shell/instruments.mjs`,
`demo/shell/instruments-test.mjs` and `workers/wish/src/wish.mjs` all write
`/bay/` in prose, in a comment, recording which page paid for a lesson. **Not
one of them is a link and not one is a live string.** They are left exactly as
they are, the same way `xr-quit.mjs` still names `/blocks/`.

### `able`, Ableton Live played from a browser with no virtual audio cable

`/able/`, act 4, instruments group, created 2026-09-12, `settleMs: 12000`,
`room: 'fixed'`. Its line read *"play Ableton Live on a studio Mac from here,
with no virtual audio cable"*. **Six readout cells** counted off the file on the
day it moved, `sound`, `round trip`, `bitrate`, `buffer`, `dropouts` and `midi`.
⚠️ The comment above them says SEVEN and explains that eight do not fit, since
the row is `repeat(auto-fit, minmax(96px, 1fr))` and a nine-cell row wrapped at
this page's width. **The prose and the object disagree by one and the object is
the fact.** It is archived as written, which is what an archive is for.
One control, `Start and connect`, **hidden rather than removed**, because
pressing a key already started the sound and the socket dialled on load, while
all **11 of the page's asserts** hung off that handler and `verify.mjs` presses
`.pos-controls button`. `?checks=1` brought it back.

`buffer` and `dropouts` are the cells worth keeping in mind: *"it sounds noisy"*
and *"the stream is fine"* were both true at once for an hour, because the
samples arriving over the relay measured bit-clean against the source while the
page still sounded wrong. A cushion being trimmed or starved was the only part
of the path that could do that, and it was the one part with no number on it.

🔴 **THE SLUG WAS HELD BY A DIFFERENT PAGE FIRST, SO THERE ARE TWO FILES IN THIS
DIRECTORY THAT WERE BOTH `/able/`.** `rack-index.html`, further down, is the
CHECKUP that had the slug until 2026-09-20; this file is the PLAYER that
replaced it. Neither is a fallback for the other.

🔴 **ARCHIVING THE PAGE DID NOT ARCHIVE THE AGENT, AND `rig/` WAS NOT TOUCHED.**
`room: 'fixed'` meant `m1-1` is **the address of the studio Mac's agent** rather
than a rendezvous the page invented. `rig/m1/live-agent.mjs`,
`rig/m1/pace-agent.mjs`, `rig/m1/README.md`, `rig/m1/studio.positron.rack-agent.plist`
and `rig/board/board.mjs` all still name it and all still run. Nothing in either
instruction said to touch them.
⚠️ **BUT NO LIVE PAGE ADDRESSES `m1-1` ANY MORE**, measured after the move:
`room: 'fixed'` is down to `mirror`, `wire`, `grains` and `knobs`, and all of
those except `wire` are `studio-1`, the Raspberry Pi. So the agent on that Mac
has nothing in the browser to answer, and `rig/m1/README.md` still prints
`https://positron.studio/able/` and `http://127.0.0.1:8890/able/?relay=...` as
the way in. **Those are the dangling links this retirement leaves**, and they
are named here rather than silently repaired, because `rig/` was out of scope.

⚠️ **THE OTHER FILES NAMING `able` NAME THE LESSON.** `demo/shell/board.mjs`,
`demo/shell/presence.mjs`, `demo/knobs/index.html` and `demo/grains/index.html`
write `/able/` in comments recording what it measured; `demo/kit/index.html`
does too, and also carries it in a LIVE list of cards, which is the one live
reference either retirement leaves behind.

## `blocks-index.html`, `memento-index.html`, `num-index.html`, retired 2026-09-24

All three on one instruction: *"arvhice memento blocks and num demo"*. No fault
was reported on any of them and none was found. Their rows are out of
`demo/manifest.mjs`, so `/blocks/`, `/memento/` and `/num/` 404 on
positron.studio and no harness opens them any more.

### `blocks`, the first WebXR page here

`/blocks/`, act 0, headset group, created 2026-09-11, `gl: true`, `xr: true`,
`settleMs: 6000`, tags `WebXR` `WebGL2` `relay` `seeded`. Its line read *"square
bricks on a dotted floor you drag to look around, and in a headset a ray from
your hand picks one up and snaps it to the grid where you let it go"*.

A room built from ONE 32-bit number, so two people who agree on the seed are
standing in the same room with nothing sent between them. `readout: null` and an
empty control row, both asked for: *"blocks: rm readout"*. Four cells went and
nothing they said was dropped, because frame timing, the view state and the
count of what your hands had done all still reached `__demo` and the log.

🔴 **WHAT IT WROTE IS STILL IN THE KIT, WHICH IS WHY THE PAGE CAN GO.**
`demo/shell/xr-quit.mjs` says *"`/blocks/` wrote two of the three"* and carries
the way out of a headset page that this page got WRONG first: it built the
badge, drew it every frame and never advanced it, so there was no way out of it
at all. `xr-panel.mjs`, `xr-hands.mjs` and `seed.mjs`'s `PLATE` all came through
it as well. Those comments still name the page because they are recording who
paid for the lesson, not telling anybody where to look.

⚠️ **AND IT TOOK ONE CLAIM WITH IT**, repaired in the same commit:
`demo/weight/index.html` said `/blocks/` already graded the quit badge the same
way on load, which made weight's own check a second opinion. `/floor/` mounts
the module only INSIDE a session, so weight is the only one left and now says
so. `demo/tom/index.html` named it as the other `readout: null` page; twenty
pages do that, so it names a live one.

⚠️ Two of its asserts could not be reached by any desktop browser: that an
immersive session started, and that a floor-relative space resolved. They are
the reason `demo/verify-quest.mjs` exists, and its usage example named this slug
until today.

### `memento`, the 2025 automation-lane experiment finished

`/memento/`, act 3, capture group, created 2026-09-13, `settleMs: 13000`, tags
`MediaRecorder` `timeline` `canvas` `local only`. Its line read *"move a knob
while a clip plays; it lands on the same line and comes back in the right
place"*.

The 2025 experiment was an automation lane bound to a media clip, and it died at
one missing mapping: an absolute stamp had to reach a foreign media element's
own position and then a pixel, and nothing converted. This page finished it by
generating the clip IN THE PAGE. It was 1280x720, 25 fps, 3500 ms of the
project's test picture with the moment burned into it, so the clock in the
picture could be read back out and compared against the playhead. That is the check the
prototype could not make: it had proved its four mappings against its own
arithmetic.

Its four cells were `kept`, `thinned`, `off by` and `worst`, the last two in
milliseconds and both read out of the pixels. It had NO controls on purpose:
the page's one input is a drag, reached through `[data-gesture]`, and a button
that made a pass for you would be the page answering its own question.

🔴 **ITS ONE HARD MEASUREMENT IS IN THE KIT AND IS STILL LOAD-BEARING.**
`timeline/media-master.mjs` records it: `playbackRate` reads 1 on a PAUSED
element, so carrying a frame sample forward by it extrapolates a stationary
picture. MEASURED here 2026-09-13, after a seek with the element paused the
playhead crept +180 ms over 250 ms while `currentTime` sat still, reading
`2437 ~ 2225` on the shared `keyboard seek lands` check. Paused, ended or seeking, the carry
rate is 0. `demo/shell/cc-adapter.mjs` still names this page as the one that
exercised it.

### `num`, a bench that was asked for as a temporary one

`/num/`, act 4, instruments group, created 2026-09-23, tags `transport`. Its
line read *"ten numbers, each one a loop you record, play, stop and throw away
with the same key"*.

Asked for in those words on 2026-09-23: *"can make a separate tmp demo too get
it right 'num'"*, about a looper driven from `/evo/`'s numpad meant to land on
`/nola/` as a third mode. Deliberately not an instrument: no audio, no roll, no
chords. What was being got right is a four-state machine with ten instances and
a double-press window, on `/evo/`'s own keypad layout (`1 2 3` on top, `0` at
the bottom), with the window on `?double=` and 250 ms by default. Its four cells
were `live`, `empty`, `waiting` and `window`. `waiting` is the thing the page
existed to make visible, and it started blank rather than printing `0` before
any press had been judged.

✅ **IT WENT BECAUSE IT SUCCEEDED, AND ITS OWN ROW SAID THIS WOULD HAPPEN**:
*"it was asked for as a temporary one, so when the mode lands this row is a
candidate for `built: false` or for going altogether, and the module it proved
is the part that stays"*. The mode landed. `demo/shell/keyboard.mjs` carries the
machine *"press for press"*, `demo/shell/numloop.mjs` holds it and
`demo/shell/numloop-test.mjs` grades it in no browser at all, which is a harder
check than the page was.

## `seek-index.html`, removed 2026-09-16

Removed on instruction: *"rm seek demo"*. No fault was reported and none was
found. It was `/seek/`, act 3, created 2026-09-04, and its line on the front
page read *"seek inside that recording; the fold at any position must be
exact"*.

### What it was

The page about going back. It played the same 190 s show `/replay/` plays,
off R2 over HLS (`ARCHIVE.hls` in `demo/shell/archive.mjs`), with the eight
operator cues that show was recorded with, and it asked the timeline one
question over and over: **which cues have happened by the position the playhead
is standing at?** Every answer was compared against counting the cues by hand.

Two controls asked it two ways.

- **`Ask "which cues by now?" at 24 points`** called `deck.reduceAt('cue', t)`
  one millisecond before, exactly on, and one millisecond after each of the
  eight cues, without playing anything. Twenty-four asks, and a single wrong
  count failed the run.
- **`Jump to 5 places and re-ask`** seeked to 100, 20, 165, 5 and 130 seconds,
  waited 700 ms for the picture to land, and asked again at each stop. The
  order is deliberately not monotonic: two of the five jumps go backwards.

The failure it existed to catch was a **retroactive burst**: a cue actuating
long after its own position, because a seek replayed the backlog instead of
folding it. Its adapter measured how late each fire was against the element's
own `currentTime` and counted anything over 1.5 s.

Eleven asserts. Its `readout` was `jumps / asked / by now / wrong`, and
`by now` was the one figure on it that moved while you watched, stepping as the
picture passed a cue and jumping when you seeked.

### What went with it, and what did not

It also graded the transport bar's **loop button**, driven through the button's
own handler rather than by setting state: two presses mark a loop, the playhead
comes back when it passes the end, a third press takes it off. A comment in it
said *"exactly one page has to prove it works"*, and that stopped being true
before it left. `replay`, `radio` and `tapes` all press `pressLoop()` through
`bar.api` and assert on what happens, so the shared loop is still graded in
three places.

The `ManagedMediaSource` gate is the other thing it carried. CLAUDE.md names
`replay`, `seek` and `flipper` as the three pages that got it on 2026-09-06
after all three ran `video.src = <m3u8>` on a Chrome that cannot play it, dead
picture and green suite. Two of the three are still standing and still gated.

## `earshot-index.html`, retired 2026-09-16

Four questions about sound in a headset that nobody here had measured: whether
the audio keeps running once you are inside, what the sample rate and the
output delay read in there, whether the browser still turns compressed audio
into samples, and whether the main thread keeps servicing audio while it draws
ninety times a second. The window readings were the control.

It got four answers on a real Quest, 68 s and 3322 frames, and that is why it
is gone rather than in spite of it: an instrument built to settle one thing is
furniture once the thing is settled. The numbers are in CLAUDE.md under WebXR
and the long note is in `demo/manifest.mjs`. It touched no third-party mount,
so "the headset went silent" and "somebody else's station was down" could never
be the same observation.

## `rack-index.html`, retired 2026-09-11

⚠️ **This is not what `/able/` is now.** The slug is live again with a
different page, created 2026-09-12, which PLAYS Ableton Live from the browser.
The file here is the page that held the slug before it.
🔴 **AND THE PARAGRAPH ABOVE STOPPED BEING TRUE ON 2026-09-25**, kept as it was
written because it records what was there. The slug is not live: that player is
archived too, at `able-index.html` in this directory, so `/able/` is a 404 and
both pages that ever answered it are here. **Two files, one slug, and neither is
a fallback for the other.**

It asked a Mac in a studio whether it was actually set up: not whether it was
switched on, but whether every link held. Live up, answering remote control, an
instrument on the track, armed and unmuted, and a note sent to it coming back
as real sound. The last check crossed the whole chain by holding a chord while
recording the machine's own output and comparing it against silence recorded
seconds earlier. If nobody answered, it said so rather than showing an empty
list that looks like a pass.

Pulled before the M1 and Live side was rearchitected, rather than left pointing
at a design that was about to change. What it proved is worth keeping: the
chain ran end to end, from `midisend` through IAC to Live to an Arturia
Stage-73 V2 to BlackHole, with a held chord reading -29.1 dB peak against a
-91.0 dB silence baseline, 61.9 dB of separation. Its checkup also found the
output clipping at full scale, which nothing else had noticed. `rig/m1/` and
`plan-rack.md` hold the rest.

## `crate-index.html`, and `archive/vain/` beside it, retired 2026-10-02

Asked in eccm (https://github.com/kristjanjansen/eccm): *"what about creating a
eccm-files worker and admin/files paeg and mimick crate/vain ... when
implenented discard crate/vain"*. crate put one long recording into R2 in
pieces of 16 MiB through `positron-vain` and played it back with byte ranges.
That protocol now runs eccm's uploads, `workers/files` there and its page
/admin/files, measured on eccm's staging the same day with a 43 MB file in
three pieces read back byte for byte. So the row is out of `demo/manifest.mjs`,
the page is here, and the Worker's two files are in `archive/vain/`. The
deployed `positron-vain` Worker and its bucket `vain-archive` were deleted the
same day; the bucket held one kept file, a generated 90-minute 440 Hz tone
(*"90 minutes of 440 Hz, generated"*, by *"the repo"*), which was not carried
over. `/crate/` 404s on positron.studio from the next build. `demo/verify.mjs`
still names `positron-vain` in its list of expected console errors, which is
now a line that matches nothing.

## `station-index.html`, retired 2026-10-08

`/station/` played a running order as one stream: byte ranges into whole
programmes in R2, no encoder. On 2026-10-02 the station moved to eccm
(https://github.com/kristjanjansen/eccm) and the row stayed `built: false` with
its link pointed at eccm's /radio. eccm removed its radio on 2026-10-07 (tag
`radio-last` there, `archive/radio.md` to restore), so the row linked to a 404.
Asked in eccm as *"fix these"*: the row is out of `demo/manifest.mjs` and the
page, still pointed at eccm's `/stream`, is here.

## `knobs-index.html`, `grains-index.html` and `grains-engine.mjs`, retired 2026-10-13

Retired with Yoshimi itself. Asked: *"discard yoshimi. with possiblity to do
dual setup in future (pi and browers, interlink). arhive demos using it"*, then
answered: archive every demo that needs Yoshimi, and `/grains/` too, because its
insert is hard wired to it. `plans/plan-retire-yoshimi.md` is the plan and
`archive/yoshimi/README.md` says how to bring Yoshimi back, on the Pi and as a
browser twin, and which of these files to start from. Both rows are out of
`demo/manifest.mjs`, so `/knobs/` and `/grains/` 404 with no redirect.

- **`knobs`** (2,578 lines): the keys and a row of controller knobs played
  Yoshimi on the Raspberry Pi in `studio-1` through `demo/shell/board.mjs`, its
  sound back down the same socket. The knobs were the measured non General MIDI
  set (74 cutoff, 71 resonance, 75 bandwidth, 76 FM amplitude), sent as
  `ctl.set` batches at most one value per knob per 20 ms; a patch stepper walked
  the 878 reachable patches from `voices.list`. It started Yoshimi with
  `audio.start {source: 'yoshimi'}` and was graded against
  `demo/fake-board.mjs` (`BOARD_PAGES` in `demo/verify.mjs`, now `away` only).
- **`grains`** (2,238 lines plus the 393 line `engine.mjs`, renamed
  `grains-engine.mjs` here, so the page's `import './engine.mjs'` has to be
  pointed back at it if the pair is ever served again): one granulator, the
  Pappus SynthDef, in wasm scsynth in the tab and on the Pi at once, with a
  blend. The Pi half was the `fx.pappus` insert, which wraps only a JACK
  instrument (`inst.jack`), and Yoshimi was the only one, so with it gone the
  insert answers *"nothing is playing for an insert to wrap"*.
  ⚠️ **`demo/grains/defs/` STAYS IN `demo/`**: the two compiled SynthDefs and
  their `PROVENANCE.json` are loaded by `/radio/` (`DEFS = '/grains/defs/'`),
  `/videoradio/` and `/concepts/sampler/050/`, and `workers/view/build.mjs` copies them by name, so
  `/grains/defs/*` is still deployed while `/grains/` is a 404.

## `flipper-index.html`, retired 2026-10-12

Asked: *"archive flipper"*, in the same breath as archiving `/cam/`. `/flipper/`
put ERR's ETV and ETV2 live in two pictures, each over its own line of clock
time whose right end was the present moment, to go back along, loop, or
return to live. `/now/` was folded into it on 2026-10-05 and is
`now-index.html` here. The row is out of `demo/manifest.mjs`, its card is out
of `DEMO_CARDS` in `demo/concepts/list.mjs`, and `/flipper/` 404s from the
next build. No redirect, the house default.

What did not move, on purpose. `demo/shell/err-live.mjs` stays: `/archive/tv/`
(the old concepts video/040) imports it. `demo/fake-err.mjs` stays: it is how
`/archive/tv/` is tested by hand through `?base=`, and `demo/verify.mjs` keeps
its wiring with `ERR_PAGES` now empty, so no run starts it. `/slides/`'s
refusals slide linked `flipper` and links `/archive/tv/` now. Prose naming
`/flipper/` in comments, skills and dated measurements (the stand-ins slide's
`flipper, now 52/52` among them) records which page paid for a lesson and was
left as written. `proto/flipper/`, deployed at `/proto/flipper/`, is an older
prototype of the same name, a different file, and was not touched.

## `graph-index.html`, `rout-index.html` and `looper-index.html`, retired 2026-10-04

Decided by the owner with *"names ok, looper retires, no redrect, capture is
fine"*, answering `plans/plan-demo-structure.md`. `/graph/` and `/rout/` were
folded into `/patchbay/` the same day and had been unlisted since: the live
desk, the openers and the routing contract (all 26 vectors, still graded by
`node demo/shell/route-core-test.mjs`) all run there. `/looper/` was a keyboard
into a WebAudio synth with a loop pedal; the pedal is on every keyboard now (the
Evolution Loop, 2026-09-30) and the kit module `demo/shell/looper.mjs`, which
`/radio/` and `/tapes/` use, did not move. **No redirects, on the owner's
word**: all three slugs 404 from the next build, the house default since
`/seek/` and `/able/`.

## `instrument-index.html`, retired 2026-10-04

Became the NOTES tab of `/wire/` (`demo/wire/notes.mjs`), on the owner's
*"names ok, looper retires, no redrect, capture is fine"*. The tab gained a
second peer inside it, so *hear the other machine* is graded at last, and fixed
a defect the old page carried: its "Hear the other machine" answered `offline`
to every press because it read `ws.readyState`, which `openWire`'s handle does
not have. No redirect; `/instrument/` 404s.

## `transport`, `lanes`, `loops`, `score` and `strip`, retired 2026-10-04

The five became the tabs of `/time/` (SCHEDULE, BEAT, LOOPS, SCORE, DATES,
`demo/time/`), which grades 42 of their own checks against their 37 and drills
the four bars the harness cannot reach as 24 page asserts. Two defects stayed
behind with the old files: LOOPS' direction check worked the source position
out through the same `mirror()` that builds the backwards copy, so an unmirrored
copy still passed (the tab reads the event's own identity now); and DATES' checks
ran on every press of Fit, for visitors too. No redirect; all five slugs 404.

## `take`, `record`, `keep`, `show`, `cues`, `jam` and `replay`, retired 2026-10-04

`take`, `record`, `keep` and `show` became `/capture/`'s TAKES, SEGMENTS (with
the old `/capture/`), ROUND TRIP and FAR END; `cues`, `jam` and `replay` became
`/sync/`'s ARRIVAL, AHEAD and AFTER. Both pages grade more than the old ones did
together: `/capture/` 59 own checks against 27 (72 on a deep run, keep's 14
included), `/sync/` 50 against 29. Left behind in these files, found on the way:
`jam`'s loop was 1750 ms rather than 2000 (it sought to 0 from beat 8) and its
"shared clock" assert could not fail; `replay`'s headline "cues land within
250 ms" never ran in the suite; `take` ran 6 of its 14 checks; `cues` and `jam`
joined the relay on every visit. No redirects; all seven slugs 404.

## radio-cast-modes-index.html

`/radio/cast/` as it was on 2026-10-18 before *"rm copy mix and grains, arvhice. keep live only"*: the
station page with the three older modes (copy plays files whole, mix tunes an AM dial between two
files, grains puts the mix through the grain ring) and their controls (the clock toggle, tune, dwell,
blend, the patch picker and four grain sliders) beside `live`. The engines keep copy, mix and grains
internally; only the page and the stations stopped offering them. The page is still served at
https://positron.studio/radio/cast/ in its live-only form.
