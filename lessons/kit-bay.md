# Kit lessons: bay

The longer comments cut from `demo/shell/bay.mjs` and `demo/shell/bay-test.mjs`, moved here verbatim with only the comment markers stripped. Each code site keeps a one-line pointer, `// why: lessons/kit-bay.md#<anchor>`.

<a id="header"></a>

## `bay.mjs` module header

```text
demo/shell/bay.mjs — a patch bay: what exists, what may reach what, and the
arithmetic that refuses the rest.

🔴 WHY THIS IS A MODULE AND NOT A PAGE. Everything here is pure. No socket,
no Web MIDI, no DOM, no clock. So `node demo/shell/bay-test.mjs` can grade
the validator against patches whose answers are known in advance, which is
the one thing a validator living inside a page can never have: what a desk
happens to be plugged into today is not a known answer.

🔴 THE DESIGN IS `plans/plan-patchbay.md` AND ITS ONE LOAD BEARING IDEA IS
THAT A PORT DECLARES TWO DIFFERENT THINGS.
  - `shape` is what the data IS. For audio, a rate, a channel count and a
    frame size. For MIDI, a protocol.
  - `accepts` is what the port CONSENTS TO, as a list of message classes.
They are not the same question and conflating them is how a studio gets
damaged: the Circuit's input is shaped for perfectly ordinary MIDI and must
nevertheless never be sent SysEx, because one byte inside a SysEx message
overwrites a patch, and a factory reset never brings back the owner's own.

🔴 AND A SHAPE IS DECLARED, NEVER INFERRED. This repository has the scar
already: 960 int16s is a valid 20 ms mono frame AND a valid 10 ms stereo one,
and guessing wrong plays an octave down, which sounds like a broken
instrument rather than a broken header. `board.mjs` solved it by making
senders declare `audioChannels` and `frameMs` and receivers check one against
the other. This checks the pair at CONNECT time instead of at play time.
```

<a id="stale"></a>

## `bay.mjs` STALE_MS import

```text
🔴 ONE STALE WINDOW FOR THE BAY AND THE REGISTRY, SINCE 2026-10-06
   (plans/plan-routing-migration.md §3.3). This file said 30 s and the registry
   15 s, so a port could be stale to the registry and fresh to the bay for
   fifteen seconds. The registry's number wins because it is a fact about the
   board (three missed five second beats), and the registry is import free on
   purpose (the Pi ships it alone), so the bay imports it rather than the other
   way round.
```

<a id="media"></a>

## `bay.mjs` MEDIA

```text
What a link can carry. `clock` is its own medium: see plan-patchbay, §3.4.
🔴 EIGHT SINCE 2026-10-04, AND THE FIRST THREE KEEP THEIR PLACES IN ORDER.
The five that arrived are `plans/plan-universal-routing.md` §3: `value` is a
gesture, an envelope, a tilt or a fader; `video` is frames; `program` is code
that arrives whole (a shader, a Faust file, a Csound score); `file` is
something a store records or plays; `state` is a room used as a bus.
⚠️ A PAGE THAT INDEXES THIS LIST BY POSITION READS THE SAME THREE AS BEFORE,
which is why the new ones went on the end rather than into a tidier order.
```

<a id="heavy"></a>

## `bay.mjs` HEAVY

```text
🔴 THE MEDIA A LINK CARRIES A SESSION FOR INSTEAD OF BYTES, which is plan
§4's whole idea: the router never copies a frame. A heavy link resolves to
`{ transport, address, shape, where, says }` and the two ends open it with
code they already have.
⚠️ `program` IS LIGHT AND THAT IS NOT AN OVERSIGHT. A shader is one message
and arrives whole (`video.shader` on `/mirror/` is exactly that), so it rides
the router like a note does. A patch bay that opened a session for forty
lines of GLSL would be the mixer plan-patchbay §3.1 refuses to become.
```

<a id="node-kinds"></a>

## `bay.mjs` NODE_KINDS

```text
What a node IS, plan §3's table. A node is optional: a port with no node
still works exactly as it did, and takes its place from its own id.
⚠️ `external` IS THE ONE KIND THE VALIDATOR READS. A link out of it opens
somebody else's server, see `validate`.
```

<a id="transports"></a>

## `bay.mjs` RELAY and TRANSPORTS

```text
🔴 PLAN §5 AS DATA: positron's own measurements choosing a transport, and the
table is the part of that plan nobody else has. Keyed by medium, then by how
far apart the ends are.
🔴 `says` IS ONLY EVER A NUMBER THE PLAN QUOTES, AND NOTHING HERE WAS ROUNDED
TOWARDS A NICER ONE. Where the plan names a transport and gives no figure,
`says` says there is none, in those words. Where the plan says TO MEASURE,
`says` is exactly `'to measure'`, so a page can find every open question in
this table with one comparison. A plausible number typed into a cell nobody
measured is the confident sentence this project keeps paying for.
⚠️ `or` IS THE PLAN'S SECOND CHOICE IN THE SAME CELL (*MoQ, or LL-HLS*). The
chooser always returns the first; the second is kept so it is not lost.
⚠️ `state` IS NOT IN THE §5 TABLE. Plan §3 says a room carries it, as a bus,
so every distance gets the relay room, and the one number on it is the
relay's cap.
🔴 THE RELAY'S CAP IS 1000 msg/s WITH A 2000 BURST, AND THIS TABLE SAID 60
UNTIL 2026-10-06. READ from `workers/relay/src/index.js` (`MSG_PER_SEC`,
`MSG_BURST`), and reported three times before it was fixed (HANDOFF
2026-10-04, plan-xr-together §3, plan-routing-migration §3.2). The stale
figure was too SMALL, so every page that printed `says` told a visitor the
relay refuses what it accepts. `bay-test.mjs` reads the worker's source and
goes red when the two disagree.
```

<a id="reads"></a>

## `bay.mjs` READS

```text
🔴 READING ONE STORED OBJECT IS ITS OWN ROW, SINCE 2026-10-06
(plan-routing-migration §3.2). A link OUT of a store used to ride the `file`
row, whose `internet-one` cell is `ingest`, and ingest is the WRITE path: a
playback was described as an upload. Reading one recording back is one https
GET of the object (`/patchbay/`'s play opener fetches it from
`archive.positron.studio`); many readers of one object is the `r2-hls` cell,
which the `file` row already had.
```

<a id="transport-names"></a>

## `bay.mjs` TRANSPORT_NAMES

```text
`whip` is a name a port may DECLARE (a camera publishing into Cloudflare) and the
   table never chooses, so it is added here; without it `addPort` threw on any
   graph announcing it, and every page in that room broke on `registry.fill`.
   Found building /concepts/room/030/, 2026-10-09.
```

<a id="machine-only"></a>

## `bay.mjs` MACHINE_ONLY

```text
`jack` is the other name the table never chooses, since 2026-10-11: two audio
   ports on ONE board that both name their JACK ports ride the board's JACK
   graph, which is decided by the ports in `sessionFor` and not by a cell.
```

<a id="choosetransport"></a>

## `bay.mjs` chooseTransport

```text
Which transport a heavy link rides, from plan §5's table.
⚠️ `internet-one` WITH MORE THAN ONE RECEIVER IS `internet-many`. That is
the whole reason the column exists: a relay leg that suits one listener is
the wrong shape for twenty, and the count is what decides it.
🔴 A LIGHT MEDIUM ANSWERS NULL, AND AN UNKNOWN ONE THROWS. A typo answering
null would read as *that medium is light*, which is a wrong fact rather than
a missing one.
@returns {null|{transport:string, where:string, says:string, or?:string}}
```

<a id="classes"></a>

## `bay.mjs` CLASSES

```text
The classes of MIDI message a port may consent to.
⚠️ `sysex` IS IN THIS LIST SO THAT IT CAN BE REFUSED BY NAME. A class nobody
can name is a class nobody can exclude.
🔴 IT IS `KINDS` FROM `midi-kinds.mjs` SINCE 2026-10-03, the one list the
board's ALSA patches and its input gate use too. That added `transport`:
start, stop, continue, song position and song select, which this file used
to call `clock`, so a port can take tempo without being started.
```

<a id="classof"></a>

## `bay.mjs` classOf

```text
A decoded message from `midi-decode.mjs`, as one of the classes above.
⚠️ NOTE OFF IS A NOTE. A port that accepts notes and not note offs would hold
every key it was ever sent, which is this rig's measured MK-425C behaviour
wearing a different hat.
```

<a id="transforms"></a>

## `bay.mjs` OPS (transforms)

```text
── transforms ────────────────────────────────────────────────────────────

🔴 A TRANSFORM IS A PLAIN OBJECT, NOT A FUNCTION, and that is what makes the
text form in §4 of the plan possible: an object round trips to a line of text
and back, and a closure does not. It also means a patch can be saved, sent
over a wire and diffed.

⚠️ EVERY ONE OF THEM MAY DROP AN EVENT BY RETURNING NULL, and a filter is
simply a transform that drops rather than a separate concept.
```

<a id="transpose"></a>

## `bay.mjs` transpose

```text
⚠️ OUT OF RANGE IS A DROP, NOT A CLAMP. A clamp turns the top of a
keyboard into a pile of the same note, which sounds like a stuck key.
```

<a id="cc"></a>

## `bay.mjs` cc

```text
Move one controller number to another, optionally onto another channel.
🔴 THIS IS THE SMALLEST TRANSFORM THAT PROVES THE `(channel, controller)`
KEY, which `plans/plan-device-layouts.md` §5.3 argues and the Circuit proves:
CC 80 is macro knob 1 on channel 1 and drum 4 pan on channel 10, in one
instrument. A remap that only knew about controller numbers would send a
mod wheel to both.
```

<a id="range"></a>

## `bay.mjs` range

```text
🔴 A KEYBOARD SPLIT, WHICH COULD NOT BE SAID AT ALL UNTIL 2026-09-21. The
owner asked for one in words: *"Split the keyboard into half. Lower part
plays synth 1 in the circuit and upper part plays synth 2"*, and the model
produced `{"op":"only","to":1}` twice, because `only` filters by CLASS and
was the nearest thing in the whole vocabulary to a filter. **It was not
wrong about the intent. There was no word for it.**
⚠️ A SPLIT IS TWO LINKS, NOT ONE OP. `link()` already allows two links
between the same pair, so the lower half is one link with a range and a
channel and the upper half is another. That is how a real one is built.
🔴 AND A NOTE OFF OUTSIDE THE RANGE IS DROPPED TOO, WHICH IS THE WHOLE
SAFETY OF IT. The filter is on the NOTE NUMBER, which is the same for the
on and the off, so a note that was never let through can never be left
hanging. A filter keyed on anything that differs between them stops notes.
```

<a id="range-open"></a>

## `bay.mjs` range: open ends

```text
🔴 ONE BOUND IS ENOUGH, AND THAT IS NOT A CONCESSION TO A MODEL. *Everything
above middle C* is how a person says a split out loud, and it was
unsayable here: `range lo=60 hi=127` names a top that is not a decision,
and the half that matters is buried beside a constant. An open end is the
honest form, and the closed one is still available.
⚠️ **SO `need` IS EMPTY AND `oneOf` REPLACES IT.** A `range` with neither
bound passes every note and is a transform that does nothing, which reads
as a filter that is working. It is refused.
```

<a id="vrange"></a>

## `bay.mjs` vrange

```text
🔴 A VELOCITY LAYER: soft hits one instrument and hard hits another, which
is how a real split-by-touch is built.
🔴 A NOTE OFF (`isNoteOff`, a velocity 0 or `off: true`) passes ALWAYS,
whatever the window
is: dropping it would mean a note let through by a hard hit is never told
to stop, and a stuck note on a synth in another building is the worst thing
in this file. The test asserts the off passes a window it could not enter.
```

<a id="fixed"></a>

## `bay.mjs` fixed

```text
🔴 ONE VELOCITY FOR EVERY NOTE, WHICH THIS DESK'S OWN DRUMS ALREADY DO.
✅ MEASURED and written in `research/measured-devices-2026-09-20.md`: the Circuit's
drum pads send notes 60, 62 and 64 at **velocity 96, fixed**. So this is
not an effect, it is how one instrument here behaves, and a link that wants
to feed it from a touch sensitive keyboard needs to say so.
⚠️ AND IT LEAVES A NOTE OFF ALONE, for the reason above: rewriting a 0 to
96 turns every release into a second note on.
```

<a id="says"></a>

## `bay.mjs` SAYS

```text
🔴 THE WORDS A PERSON READS, AND UNTIL 2026-09-22 THERE WERE NONE, SO THE
REFUSALS WERE WRITTEN IN FIELD NAMES. REPORTED against a real reply:
*"MK-425C USB MIDI Keyboard to Circuit { only } / only takes "cls" and was
given "to" - its not for humans, i do not know what to do"*. `cls` and `to`
are keys in this file's own schema, and a sentence made of two of them tells
a reader which keys the validator compared and nothing about what to do.
⚠️ **AND THAT LINE HAD ALREADY BEEN REPAIRED ONCE THE SAME DAY**, for a
different fault: it read `cc takes "from" and was given "to"` and accused a
correct argument of being wrong. That repair made it TRUE. True and
unreadable are different problems and only the first one was fixed.
🔴 **`help` COULD NOT BE REUSED AND THAT IS THE REASON THIS TABLE EXISTS.**
`help` is what a language model reads in `workers/wish/src/wish.mjs`, and
`cc`'s reads *move the controller numbered from onto the controller numbered
to*, which carries two field names on purpose because the model is choosing
keys. A visitor is not.
🔴 **IT IS ONE TABLE RATHER THAN THREE FIELDS PER OP SO THAT IT CAN BE
GRADED WHOLE.** `bay-test.mjs` asserts that every operator has a `does` and
that every argument of every operator has both a `part` and an `ask`, which
is the same guard `help` already has and for the same reason: a new
transform with no words beside it is this defect arriving again with nobody
noticing.
  - `does` finishes the sentence `<op> ...`, so it is a verb phrase.
  - `part` names an argument as a thing rather than as a key. It is the
    half that replaces `"cls"` and `"to"`.
  - `ask` is the SOLUTION line: one imperative naming real values. It is
    never the problem with *do not* in front of it.
```

<a id="says-drop"></a>

## `bay.mjs` SAYS.drop

```text
⚠️ NOT `drops one kind of message`, or the sentence opens `drop drops`.
   An operator's name is the first word of its own problem line.
```

<a id="says-only"></a>

## `bay.mjs` SAYS.only.ask.cls

```text
⚠️ DERIVED, NEVER TYPED. The list of kinds a link can carry is `CLASSES` and
   it is the one place it is declared, so a class added there arrives in the
   sentence that offers it without anybody remembering to come here. The
   brief's own example of a readable solution is this string.
```

<a id="vocabulary"></a>

## `bay.mjs` VOCABULARY

```text
🔴 THE VOCABULARY, IN THE ONE PLACE THE VOCABULARY IS DECLARED, BECAUSE IT
HAS ALREADY BEEN WRITTEN DOWN IN FOUR PLACES AND THE ONE A MODEL READS WENT
STALE. 2026-09-21: `range`, `vrange` and `fixed` were added here and to
`schemaFor()`'s `enum` and to the page's prose, and NOT to the operator table
in `systemFor()`, which is the part of the prompt that defines the format. So
the model was choosing from six transforms while the code accepted nine, and
it reported `{"op":"only","to":N}` for the third time, which is what a model
says when it means *filter* and the only filter it has been shown is `only`.
⚠️ **THE SIGNATURE IS DERIVED FROM `args`, NEVER TYPED**, so it cannot
disagree with what `checkTransforms` enforces. `cls` is the one argument that
is not a number and `scale` is the one that is not an integer, which is the
whole of the mapping.
⚠️ AND `help` IS REQUIRED OF EVERY OP, asserted in `bay-test.mjs`, because a
new transform with no sentence beside it is exactly the defect above arriving
again with nobody noticing.
```

<a id="vocab-json"></a>

## `bay.mjs` VOCABULARY json example

```text
🔴 THE LINE A MODEL COPIES. MEASURED TWICE on 2026-09-21 against
`llama-3.3-70b`: shown `range lo=N hi=N` in a table and one worked example
carrying `"to"`, it wrote `{"op":"range","to":7}` on every run. It had the
argument names in front of it and copied the JSON instead, which is what
this file already records happening to `transpose`. **A sentence is read
and an example is copied**, so every transform now has one rather than the
two that happened to be spelled out.
⚠️ AND THE EXAMPLE IS GRADED BY OUR OWN VALIDATOR, asserted in
`bay-test.mjs`: an example `checkTransforms` would refuse is a defect being
taught to a model on every call, and it would read as documentation.
```

<a id="checktransforms"></a>

## `bay.mjs` checkTransforms

```text
🔴 A TRANSFORM WITH ITS ARGUMENT UNDER THE WRONG KEY IS THE DEFECT THIS
FUNCTION EXISTS FOR, AND IT WAS FOUND BY MEASUREMENT RATHER THAN BY READING.
2026-09-21, asking Workers AI to turn a spoken sentence into a patch, the
model returned `{ op: 'transpose', to: 1 }`. **`transpose` takes `by`.** The
object was perfectly valid against the JSON Schema it was generated under,
because that schema listed every argument any op could take and required only
`op`, so `to` was allowed on a transform that has no `to`.
⚠️ **AND `apply()` WOULD HAVE SAID NOTHING.** `ev.d1 + undefined` is `NaN`,
which is not a throw and not a drop: it is a note number that no longer exists
arriving at an instrument, from a page that reported the link as connected.
🔴 **SO THE CHECK LIVES HERE RATHER THAN IN THE SCHEMA.** A schema constrains
the SHAPE of what a model may say and it cannot constrain the MEANING. That is
the same rule this project already has about a shape being declared rather
than inferred, arriving from the direction of a language model.

🔴 IT ANSWERS IN TWO SENTENCES SINCE 2026-09-22, ASKED FOR AS *"can we have
cooncrete problem -> soluton texts?"*. `why` is what is wrong, in words;
`fix` is the thing a person can do, naming real values. Neither one is ever
the other with *do not* in front of it, which is the failure mode of every
problem-and-solution pair ever written.
⚠️ AND A REFUSAL'S SOLUTION IS SOMETIMES THAT THERE IS NONE, WHICH IS THE
TEXT RATHER THAN A MISSING ONE. A blank second line reads as a sentence that
failed to load, so *this link cannot be made* is written out.
@returns {''|{why: string, fix: string}} '' when every transform is well
         formed, or the problem and what to do about it.
```

<a id="ct-quote"></a>

## `bay.mjs` checkTransforms: quoting

```text
🔴 A FIELD NAME IS QUOTED, OR THE SENTENCE READS AS BROKEN GRAMMAR.
This said `${t.op} needs ${k} and was given ${keys}`, which on the one
failure it is written for came out as **`transpose needs by and was
given to`** and was reported 2026-09-21 with the words *"what is
it?"*. Both `by` and `to` are FIELD NAMES, and printed bare they are
read as English, so a reader looks for the noun that is missing.
⚠️ THE CHECK ITSELF IS UNCHANGED AND MUST STAY UNCHANGED. That object
is valid against the schema it was generated under, and without this
the code computes `note + undefined`, which is `NaN`: a note number
that does not exist arriving at an instrument down a link the page
called connected.
```

<a id="ct-swap"></a>

## `bay.mjs` checkTransforms: swap or omission

```text
🔴 TWO DIFFERENT FAULTS WORE ONE SENTENCE UNTIL 2026-09-22, AND ON
THE SECOND OF THEM IT NAMED SOMETHING THAT WAS NOT WRONG.
REPORTED against `{ op: 'cc', to: 80 }` with the words *"do not get
this error"*, which came out as **`cc takes "from" and was given
"to"`**. That reads as *cc takes from, NOT to*, and it is false:
`cc` needs BOTH, it moves the controller numbered `from` onto the
controller numbered `to`, and **`to: 80` was exactly right**, 80
being the Circuit's first macro knob. The only fault was that
`from` was absent.
✅ **SO THE SENTENCE SPLITS ON WHETHER THE GIVEN KEYS BELONG TO THIS
OP AT ALL.** A key the op does not have is a SWAP, and naming both
sides is the whole help: `transpose takes "by" and was given "to"`
is right and stays exactly as it was. Keys that all belong, with a
required one missing, is an OMISSION, and there the only useful
sentence says what is needed and which part did not arrive.
⚠️ IT IS THE SAME LESSON THIS PROJECT KEEPS PAYING FOR, ARRIVING IN
PROSE RATHER THAN IN AN ASSERT: a message that measures something
NEXT TO the quantity in question sends a reader to the wrong place.
Here it sent one to delete an argument that was correct.
```

<a id="ct-three"></a>

## `bay.mjs` checkTransforms: three cases

```text
🔴 AND THE THREE CASES SURVIVE THE REWRITE, BECAUSE THEY ARE THREE
DIFFERENT THINGS A READER HAS TO DO. What changed on 2026-09-22 is
the words, not the split: a swap, a partial omission and an empty
object stay tellable apart, which `bay-test.mjs` grades directly.
```

<a id="ct-empty"></a>

## `bay.mjs` checkTransforms: empty

```text
⚠️ THREE CASES, NOT TWO, AND THE THIRD WAS FOUND BY `bay-test.mjs`
   GOING RED IN ONE LINE. An empty object is neither a swap nor a
   partial omission: nothing arrived, so there is no other argument to
   point at and no half of the requirement to name.
```

<a id="ct-repair"></a>

## `bay.mjs` checkTransforms: repaired object

```text
🔴 THE SOLUTION IS THE REPAIRED OBJECT, WHICH IS THE ONE FORM THAT
NEEDS NO FIELD NAME IN PROSE. The JSON is already on the page
directly above this sentence, asked for as *"can it not be full
json(l) message?"*, so a corrected object beside it is read by
comparison rather than by parsing an English claim about two keys.
⚠️ THE VALUE THAT ARRIVED IS CARRIED OVER, AND THE OBJECT IS ONLY
OFFERED WHEN IT CAN BE. The measured case is
`{ op: 'transpose', to: 1 }`, where the **1 was never wrong** and
only its name was, so `{"op":"transpose","by":1}` is a repair a
reader can check against the JSON above it. `{ op: 'only', to: 1 }`
is not: `1` is not a kind of message, so any object written here
would carry a value this file INVENTED and print it as if somebody
had asked for it. That one gets the list of real kinds instead,
which is the offer the report itself suggested.
```

<a id="ct-oneof"></a>

## `bay.mjs` checkTransforms: oneOf

```text
🔴 AT LEAST ONE OF A PAIR, WHICH `need` CANNOT SAY. `range` takes a low
bound, a high bound or both, because *everything above middle C* is a
real instruction and naming 127 as its top is noise. A `range` with
NEITHER passes every note, which is a filter that silently does nothing,
so it is refused by name here rather than allowed as a no-op.
```

<a id="ct-oneof-words"></a>

## `bay.mjs` checkTransforms: oneOf wording

```text
⚠️ AND THE TWO WAYS IN ARE TOLD APART SINCE 2026-09-22. `{ op: 'range' }`
   was given nothing; `{ op: 'range', to: 7 }` was given something that is
   not a bound, and that second one is MEASURED rather than imagined: it
   is what `llama-3.3-70b` wrote eleven runs out of eleven. One sentence
   for both of them said `was given nothing` about an object that plainly
   had a number in it.
```

<a id="ct-types"></a>

## `bay.mjs` checkTransforms: types

```text
🔴 EVERY ARGUMENT THAT IS PRESENT IS TYPE CHECKED, NOT ONLY THE REQUIRED
ONES. This loop used to run over `need`, so the moment an argument became
optional it also became untyped: `{ op: 'range', lo: 36, hi: '47' }` would
have passed, and `ev.d1 > '47'` compares a number against a string, which
is not a throw and not a drop. That is the same `NaN` shape this whole
function exists for, one optional argument along.
```

<a id="ct-lohi"></a>

## `bay.mjs` checkTransforms: lo above hi

```text
🔴 A RANGE THAT CANNOT PASS ANYTHING IS A FILTER THAT READS AS WORKING.
`lo` above `hi` drops every note on the link, the page draws the arrow,
and the instrument is silent for a reason nothing on screen explains.
```

<a id="ct-lohi-offer"></a>

## `bay.mjs` checkTransforms: lo above hi offer

```text
⚠️ THE OFFER IS MADE TO A PERSON AND IS NEVER TAKEN BY THE CODE, which
   is the same line the two-bounds refusal below draws and for the same
   reason: the far end is an instrument in another building. Showing the
   swapped object is what lets somebody decide in one glance; swapping it
   here would be a guess nobody was told about.
```

<a id="ct-two-ranges"></a>

## `bay.mjs` checkTransforms: two open ranges

```text
🔴 TWO RANGES OPEN AT THE SAME END, WHICH IS ALWAYS ONE RANGE WRITTEN
WRONG. MEASURED 2026-09-21, eleven runs of `llama-3.3-70b`: asked to play a
row of buttons, it writes `{"op":"range","to":0}` then
`{"op":"range","to":7}`, spelling *range 0 to 7* as two transforms because
a link is `{"from": …, "to": …}` and that is the key in front of it.
🔴 **AND THE COMPOSED RESULT IS THE WORST KIND OF WRONG**: two high bounds
in a row means the LOWER one wins, so the link passes notes up to 0 and the
second range is dead. It is well formed, it is allowed, and one button of
eight works. A refusal that names the correction is worth more than a patch
that looks fine.
⚠️ **NOT MERGED, AND THAT IS DELIBERATE.** One run of the eleven produced
the pair DESCENDING, 23 then 7, so reading the first as a low bound and the
second as a high one is a guess that is sometimes backwards. A repair that
is right most of the time is worse here than a refusal, because the thing
on the far end is an instrument in another building.
```

<a id="text-form"></a>

## `bay.mjs` the text form

```text
── the text form ─────────────────────────────────────────────────────────

🔴 IT IS A PROJECTION OF THE GRAPH AND NEVER A SECOND SOURCE OF TRUTH. Every
line round trips to a link and back, and `bay-test.mjs` asserts that it does.
The moment the text can say something the graph cannot, there are two models
and they will disagree, which is this project's most expensive defect class.

⚠️ `via` IS IN IT, SINCE 2026-10-06, as a last word: `a -> b via moq`. It is
a person's choice and not the table's, so it is the one part of a session the
line must carry, or a scene recalled from text would come back on a
different transport from the one it was saved with.
⚠️ A HEAVY LINK PRINTS AS THE SAME `from -> to` LINE AND ITS SESSION IS NOT
IN IT. The session is derived from the two ends and the table, so writing it
down would be the second source of truth this paragraph forbids. Reading the
line back into a bay with the same nodes derives the same session, which
`bay-test.mjs` asserts. A consent is not in it either, on purpose.
```

<a id="printlink"></a>

## `bay.mjs` printLink

```text
🔴 AN ABSENT OPTIONAL ARGUMENT PRINTS AS `*`, AND WITHOUT IT THE ROUND TRIP
BREAKS SILENTLY. This used to drop every `undefined`, which was exact while
every argument was required. `range` gained an open end on 2026-09-21, and
`{ range, hi: 7 }` would have printed `range 7` and read back as
`{ range, lo: 7 }`: the same words meaning the opposite filter, with nothing
to catch it because both are well formed. `bay-test.mjs` round trips it.
⚠️ A TRAILING absent argument is still dropped, so `cc 1 74` is unchanged and
so is every line anybody has written by hand.
```

<a id="parse-star"></a>

## `bay.mjs` parseLink: wildcard

```text
`*` IS A WHOLE SITE SEGMENT OR NOTHING (plans/plan-site-names.md §4h).
   `we*:chat:value-in` or `*:*:in` would read as a pattern nobody defined.
```

<a id="timing"></a>

## `bay.mjs` HOLD_RETRY_MS and timing

```text
🔴 A LINK CARRYING `ahead` OR `follow` IS TIMED, SINCE 2026-10-12
(plans/plan-routing-time.md §4.3, link-options.mjs has the two options).
The sender stamps `at` beside the event (`bay-node.mjs` `emit`, on the
`bay.event` message, never inside the event), and the RECEIVING bay asks a
timebase when to hand it to the port: `ahead` fires when the shared clock
reads `at`, `follow` fires when the moment `at` reaches this glass on the
heavy link it names. Everything time related is injected, so the bay stays
pure and `bay-test.mjs` grades it with a fake clock and a fake timer.

  createBay({ timing: { timebase, local, later, horizonMs, holdMs } })
    timebase   a `createTimebase()`, holding this place's peer offset and
               any heavy link `follow` names. Absent, every timed event holds.
    local      () => this document's ms, the timebase's `local` clock
    later      (fn, ms) => void, a timer. `setTimeout` by default.
    horizonMs  hand an event over this early, with its exact local time in
               `meta.timing.local`, so a page that plays sound can give the
               sound card the time in advance (clock/010's lesson). 0 fires
               on the moment, which is right for a light.
    holdMs     how long a held event is asked about again before it is
               counted missed and dropped. 3000.

🔴 CANNOT TELL HOLDS, IT NEVER FIRES, which is the timebase's rule carried
through: no peer clock, an unstamped event on a timed link, a follow link
with no observations yet. A held event is asked again every 25 ms and
dropped as `missed` after `holdMs`, counted on the link, never delivered
late as if on time.
⚠️ A LINK WITH NEITHER OPTION NEVER READS ANY OF THIS: `send` takes the old
path, synchronous, unchanged, and `bay-test.mjs` asserts it stays so.
```

<a id="addnode"></a>

## `bay.mjs` addNode

```text
A thing that owns ports: an instrument, an engine, a store, a page.
@param {object} n
@param {string} n.id      `site:node`, the first two segments of its ports'
                          ids, which is how a port finds its node.
@param {string} n.kind    one of NODE_KINDS
@param {string} [n.label] what a person reads
@param {string} [n.place] the MACHINE it runs on. Defaults to the site.
@param {string} [n.net]   the NETWORK that machine is on. Unknown when left
                          out, and unknown is never read as the same network.
@param {boolean} [n.consent] links OUT of this node need a person to ask for
                          them. Always true for `external`, see `validate`.
🔴 OPTIONAL, AND A PORT WITH NO NODE BEHAVES EXACTLY AS IT DID BEFORE
2026-10-04. Its place is its id's first segment and its network is unknown.
```

<a id="whereof"></a>

## `bay.mjs` whereOf

```text
How far apart two ports are, as one of WHERE.
⚠️ AN UNKNOWN NETWORK IS THE INTERNET, because that is the case every
transport in the far columns survives. Guessing *same network* would pick a
data channel that two machines in different buildings cannot open.
🔴 `internet-many` COUNTS THE RECEIVERS THAT ARE ALSO OVER THE INTERNET,
NOT EVERY LINK OUT OF THE PORT. A page on the same machine listening as well
does not make a relay leg into a broadcast, and plan §5's column is about
how many receive across the internet.
⚠️ AND A LINK INTO A STORE IS NOT A RECEIVER, SINCE 2026-10-06. Its session
describes the upload, and the sound reaches the recorder on the leg a
listening link would use anyway: `/patchbay/` records and listens to one
board input through ONE held source. Counting it made the listen link that
follows a recording `internet-many`, a broadcast nobody was making.
```

<a id="addressof"></a>

## `bay.mjs` addressOf

```text
🔴 THE ADDRESS IS DERIVED FROM THE LINK, NEVER CHOSEN, the way the Pi
already derives `<room>-video` and `<room>-<input>` (plan §8): one port,
one room. It is `${place of the source}-${source node name}-${port name}`,
so `err:vikerraadio:audio` on a node placed at `err` is
`err-vikerraadio-audio`, and the site goes in after the place whenever
the two differ (see below). The Pi never relies on this: every stream port
it announces DECLARES its address (`studio-1`, `studio-1-video`,
`studio-1-circuit`), which is why its site could become `pi-1` on
2026-10-10 without one stream moving.
⚠️ IT IS AN ADDRESS AND NOT A RENDEZVOUS. Two links out of one port share
it, which is what lets the second receiver join the first one's session
rather than starting another. `stage-<rand6>` is the other kind and does
not belong here.
```

<a id="addressof-site"></a>

## `bay.mjs` addressOf: site

```text
🔴 THE SITE IS IN IT WHEN IT IS NOT THE PLACE, SINCE 2026-10-09. Every
   browser tab is placed `browser`, so `/mirror/`'s `webgl:video` derived
   `browser-webgl-video` in EVERY tab, and two tabs would meet in one room
   the moment such a port got a wire transport. Now it is
   `browser-web-ab12-webgl-video`.
   ⚠️ A SITE THAT IS ITS OWN PLACE IS UNCHANGED (`err-vikerraadio-audio`),
   and the Pi declares every address it streams on, so nothing it sends moves.
```

<a id="addport"></a>

## `bay.mjs` addPort

```text
@param {object} p
@param {string} p.id      `site:node:port`. An id, never a name: a name is
                          what a replug changes, and CoreMIDI really does
                          rename a port to `Circuit 2` when it is held.
@param {string} p.label   what a person reads. Allowed to change.
@param {'in'|'out'} p.dir
@param {string} p.medium  one of MEDIA
@param {object} p.shape   what the data IS
@param {string[]} [p.accepts] in-ports: the classes it consents to
@param {string[]} [p.never]   in-ports: classes that make a link a HARD
                              REFUSAL rather than a quiet drop. See below.
@param {string[]} [p.emits]   out-ports: the classes it can produce
@param {Function} [p.deliver] in-ports: where a delivered event goes
@param {string[]} [p.transports] the only transports this port's stream
                              really travels by, from TRANSPORT_NAMES. A
                              session the table would give it otherwise is
                              refused in words. See `sessionFor`.
@param {string} [p.heldBy]    in-ports: the site that holds this input.
                              A link into it from any other site is refused
                              in words. See `validate`.
```

<a id="addport-transports"></a>

## `bay.mjs` addPort: transports

```text
⚠️ A RESTRICTION NAMING A TRANSPORT NOBODY HAS IS A TYPO THAT WOULD REFUSE
   EVERY LINK, so it throws here, where the port is declared, rather than
   reading later as a port that will not link to anything.
```

<a id="validate"></a>

## `bay.mjs` validate

```text
🔴 THE VALIDATOR IS THE WHOLE POINT AND IT IS ORDINARY CODE. Every refusal
carries a sentence, because a patch bay that answers "no" is a patch bay
nobody can use. It is also the half that stays useful if every language
model in §5 of the plan were deleted.

🔴 AND EVERY REFUSAL CARRIES A SECOND SENTENCE SINCE 2026-09-22: `fix` is
the thing a person can do about it. Several of these have no repair, and
saying so in words is what tells a reader to stop trying. A blank line
would read as a sentence that failed to load.
@returns {{ok:boolean, why:string, fix?:string, warn?:string}}
```

<a id="validate-opts"></a>

## `bay.mjs` validate: opts

```text
⚠️ THE FOURTH ARGUMENT IS THE SAME `opts` THAT `link` TAKES, SINCE
2026-10-04, so a page can ask the question before making the link and get
the same answer. `{ consent: true }` is the only key it reads.
✅ AND AN ALLOWED HEAVY LINK ANSWERS WITH THE SESSION IT WOULD OPEN, before
the link exists, which is plan §6's *the validator prints it before the
link exists*.
```

<a id="consent-source"></a>

## `bay.mjs` validate: consent on the source

```text
🔴 CONSENT ON THE SOURCE, WHICH IS NEW AND IS PLAN §6. A link out of an
`external` node opens a connection to somebody else's server, and ERR said
on 2026-09-16 that every one of ours lands in their listener statistics,
which is what a broadcaster reports to its board. Stopping does not undo
it. So only a person who is going to listen may make one: never a page
load, never a harness, never `?selfcheck=1`.
⚠️ IT IS `=== true` AND NOTHING LOOSER. A truthy string from a query
parameter or a form is exactly the road a check would arrive by.
⚠️ AND IT IS A PROPERTY OF THE NODE, so no page can forget to ask it.
```

<a id="heldby"></a>

## `bay.mjs` validate: heldBy

```text
🔴 AN INPUT SOMEBODY HOLDS TAKES LINKS FROM THAT SOMEBODY ONLY, SINCE
2026-10-06 (plan-universal-routing §6, plan-routing-migration §3.6 and
§5.2). The Pi is one instrument with one JACK graph, and a second
person's link into its synth takes the sound from whoever had it. A port
carrying `heldBy: <site>` refuses a link INTO it from any other site, in
words, with the holder named.
⚠️ THE ASKER IS `opts.site` WHEN A PAGE SAYS WHO IT IS, and the source's
own site otherwise. A patchbay linking another page's lane into the board
is the patchbay asking, not the lane.
⚠️ MODEL LEVEL ONLY. Nothing on the Pi sets or reads `heldBy` yet, so this
refuses what a page describes and guards nothing a socket could send.
```

<a id="transforms-medium"></a>

## `bay.mjs` validate: transforms on other media

```text
🔴 TRANSFORMS ARE MIDI OPERATIONS, SO ON ANY OTHER MEDIUM THEY ARE
REFUSED RATHER THAN IGNORED. `transpose` on a video link would be stored,
printed in the text form and do nothing, which is a link that reads as
configured and is not.
```

<a id="shape"></a>

## `bay.mjs` validate: shape

```text
Shape. ⚠️ THE FIELD THAT DISAGREES IS NAMED. "incompatible" is a refusal
somebody has to debug; "48000 against 44100" is one they can fix.
```

<a id="shape-value"></a>

## `bay.mjs` validate: shape by value

```text
⚠️ COMPARED BY VALUE SINCE 2026-10-04, because `value` declares a range
   and a range is a pair: `[0, 1] !== [0, 1]` would refuse two identical
   faders for being two arrays.
```

<a id="accepts-never"></a>

## `bay.mjs` validate: accepts and never

```text
🔴 CONSENT, AND IT IS TWO DIFFERENT QUESTIONS THAT THE FIRST BUILD
ANSWERED AS ONE. It refused any link that could deliver a class the
destination did not accept, and **that refused every real link on this
desk**: a MIDI source emits six classes, the Circuit takes three, so a
keyboard could never reach a synth at all. Found by `/wish/`, which put a
real model's real proposal through it and got `Circuit does not accept
touch` for a patch that was otherwise perfect.
✅ **A CLASS A PORT SIMPLY DOES NOT HANDLE IS DROPPED AND REPORTED.** The
drop already happens at the destination in `send`, so nothing is sent
either way; what changes is that the link exists and the reader is told
what will not cross it.
🔴 **A CLASS A PORT `never` TAKES IS STILL A HARD REFUSAL**, and that is
the list the Circuit's SysEx line lives on. The difference is between *I
do not use that* and *that damages me*.
```

<a id="never-fix"></a>

## `bay.mjs` validate: never fix

```text
🔴 THIS ONE HAS A REPAIR AND IT IS THE PAGE'S OWN NEGATIVE CONTROL.
`/bay/` already asserts *and the same pair is allowed once SysEx is
dropped*, so the honest solution here is the transform that does it
rather than *there is no fix*: the Circuit's refusal is about what
reaches it, not about whether a keyboard may play it at all.
⚠️ WHAT HAS NO REPAIR IS THE RULE ITSELF, and nothing here offers to
bend it. `never` is the list that carries an instrument's safety, and
the only thing on offer is not sending it that class.
```

<a id="empty-source"></a>

## `bay.mjs` validate: empty source

```text
⚠️ THE SOURCE BEING LEFT WITH NOTHING IS CHECKED BEFORE THE DESTINATION
   TAKING NONE OF IT, because they are two different faults and the second
   message is wrong about the first. Order matters here and a test caught
   it reading `Circuit takes none of what this link carries` about a link
   that carried nothing in the first place.
```

<a id="store-loop"></a>

## `bay.mjs` validate: loops through a store

```text
⚠️ A LOOP THROUGH A STORE IS NOT FEEDBACK (2026-10-10). A node of kind
   `store` keeps what reaches it and plays it back only when somebody asks
   (positron-store's history, workers/store/src/graph.js), so chat ->
   history -> chat is a replay, not an echo. Until this, concept 4's
   `cf-store:history:value-out -> <me>:chat:value-in` was refused as a loop
   and its history never delivered. A store at either end, or anywhere on
   the path back, breaks the cycle; a loop with no store in it is still one.
```

<a id="star"></a>

## `bay.mjs` validateAny: `*` links

```text
🔴 A `*` LINK, plans/plan-site-names.md §4h. `a:chat:value-out -> *:chat:value-in` is a
speaker and `*:chat:value-out -> a:chat:value-in` a listener. The pattern is checked
here; every concrete pair it stands for is checked by the ordinary
`validate`, now and again on every send, because sites come and go.
⚠️ ZERO MATCHES IS NOT A REFUSAL. A chat has to work with one person in it,
so it answers ok with a warning.
⚠️ LIGHT MEDIA OTHER THAN MIDI ONLY. A heavy medium needs a session per
receiver, which is an opener's job, and a MIDI `*` into every site with a
thru is a loop at wire speed that the cycle walk cannot see.
```

<a id="sessionfor"></a>

## `bay.mjs` sessionFor

```text
🔴 WHAT A HEAVY LINK IS INSTEAD OF BYTES, plan §4: `{ transport, address,
shape, where, says }`, and each end opens it with code it already has.
Null for a light medium, whose link carries the bytes itself.
⚠️ DERIVED EVERY TIME AND NEVER WRITTEN DOWN IN THE TEXT FORM. A line that
carried its own transport could disagree with the table, and the table is
the measured half.
```

<a id="sessionfor-store"></a>

## `bay.mjs` sessionFor: stores

```text
🔴 A LINK WITH A STORE AT EITHER END RIDES THE `file` ROW, WHATEVER IT
   CARRIES, plan §10 item 5 (*"record is a link to R2 or the store object"*),
   2026-10-04. `circuit:audio -> r2:recordings:in` is a sound, and the audio
   row would have called it a relay leg, which is not how a recording reaches
   R2: the page that hears the sound records it and uploads it through ingest.
   ⚠️ AND A RECORDING IS ONE WRITER. A store's in port never turns a link into
   `internet-many`, because however many people listen to the same sound, the
   recording is one upload; `r2-hls` is the row for many READING a store.
   ⚠️ THE ADDRESS IS THE STORE'S, so the row says where the recording lives
   rather than the room the sound came from.
```

<a id="sessionfor-via"></a>

## `bay.mjs` sessionFor: transports and via

```text
🔴 A LINK OUT OF A STORE TO ONE READER IS AN HTTPS READ, SINCE 2026-10-06,
   from `READS` rather than from the `file` row, whose `internet-one` cell is
   the WRITE path. Many readers of one object are still `r2-hls`.

   🔴 TWO WAYS A SESSION CAN DIFFER FROM THE TABLE, BOTH SINCE 2026-10-06
   (plan-routing-migration §3.2, `plans/plan-stage-patchbay.md` F1), and both
   refuse in words rather than quietly picking something else:
     - a PORT may say `transports: [...]`, the only ways its stream really
       travels. The cell's first choice and its `or` are tried in order and
       the first the port allows wins, which is how the board's video, which
       is relay H.264 and never WHEP, gets the `or` of the WHEP cell. A cell
       with nothing the port allows is a refusal that names both lists. A
       WHIP-only input asked for by a second receiver is told no, not LL-HLS.
     - a LINK may say `{ via }`, a person asking for one transport by name,
       which is what `/cam/` needs to show one source three ways. It must be
       a transport the tables name, it must not be a one-machine transport
       across a wire, and it must be one the port allows. Whether an opener
       exists for it is the opener's question, not this file's.
   ⚠️ THE RESTRICTION THAT APPLIES IS THE ONE ON THE LEG THE TRANSPORT IS. A
   recording's `ingest` is the store's leg, so the source's `relay` list does
   not refuse it; a playback's `https` is the store's out port's leg.
   ⚠️ A `says` FOR A TRANSPORT THE CELL DID NOT CHOOSE QUOTES NO NUMBER. The
   cell's number is about the cell's transport, and borrowing it for another
   is the invented figure this table exists to refuse.
```

<a id="light-via"></a>

## `bay.mjs` sessionFor: light via

```text
🔴 A LIGHT LINK BETWEEN TWO SITES MAY SAY WHICH WIRE CARRIES IT, SINCE
   2026-10-11. Its bytes are inside the link, but between two machines
   they still ride something: the relay room, or a WebRTC data channel
   once a board's direct path is open (/concepts/sampler/035/). Asked:
   *"webrtc shuld be link"*, after the patchbay drew a relay box under a
   path the relay was not carrying. Only those two, only across sites,
   and the page that opened the path says so, so the drawing reads the
   wire rather than guessing it.
```

<a id="jack"></a>

## `bay.mjs` sessionFor: jack

```text
🔴 JACK, SINCE 2026-10-11 (plans/plan-nodes-revisited.md §3 item 3). Two
   audio ports on ONE site that both travel by `jack` and both name their
   JACK ports are a link inside one board's graph, and nothing about it
   crosses a wire. The session carries the JACK rows the one bay link
   stands for (`jackRows`: same count one to one, many into one summed, one
   into many spread), so a reader sees what one wire means before it is
   made, and the board applies exactly those rows and reads them back.
   ⚠️ THE SAME SITE, NOT THE SAME PLACE: a site is one board, and two boards
   in one room are two JACK servers that no row can join.
   ⚠️ A `via` OTHER THAN jack FALLS THROUGH to the ordinary rules, which
   already refuse a wire transport between two ports of one site.
```

<a id="same-site"></a>

## `bay.mjs` sessionFor: wire inside one site

```text
🔴 AND THE REVERSE, SINCE 2026-10-09 (BACKLOG: *the bay accepts a wire
   transport inside one tab*). `MACHINE_ONLY` stopped `page` crossing a
   wire and nothing stopped `whep` being asked for between two ports of
   ONE SITE: `/mirror/`'s own WebGL into its own left pane `via: 'whep'`
   answered `ok, whep, machine`, a picture sent out to Cloudflare and back
   into the tab that drew it. A site is one announcer (one tab, one
   board), so both ends of such a link are already in the same process
   or on the same machine.
   ⚠️ SAME SITE, NOT SAME PLACE. Two tabs both placed `browser` are two
   sites and may be two machines, so WHEP between them stays allowed.
```

<a id="reachesnode"></a>

## `bay.mjs` reachesNode

```text
Can a signal standing at `startNode` reach `targetNode` through the links
that already exist.
🔴 IT WALKS NODES, NOT PORTS, AND THE FIRST VERSION WALKED PORTS AND WAS
ALWAYS FALSE. It started from the proposed destination, which is an INPUT,
and then looked for links whose `from` was that port. No link ever starts
at an input, so the walk ended immediately and every cycle was allowed.
**The test caught it, which is what the test is for**: an arriving event is
at a NODE, and it leaves again through any output that node has.
```

<a id="reaches-medium"></a>

## `bay.mjs` reachesNode: one medium

```text
🔴 AND IT WALKS ONE MEDIUM SINCE 2026-10-04. A loop is an echo at wire
   speed, and only a link of the same medium can echo: a phone sending `value`
   to an engine and hearing its `audio` back is the most ordinary patch plan
   §3 describes, and walking every medium refused it as a loop. With MIDI
   alone on the desk the answer is unchanged.
```

<a id="link"></a>

## `bay.mjs` link

```text
@param {object} [opts] `{ consent }`, see `validate`. Never stored: a
       consent is a person asking once, not a property of the link.
⚠️ `session` IS NULL ON A LIGHT LINK AND AN OBJECT ON A HEAVY ONE, on the
stored link and on the answer alike, so a page can test it without knowing
which media are heavy.
⚠️ AN EARLIER LINK KEEPS THE SESSION IT WAS MADE WITH. A second internet
receiver makes the NEW link `internet-many`; the first one is already open
and moving it is a decision for the code that opens sessions, which this
file is not.
```

<a id="send"></a>

## `bay.mjs` send

```text
One event leaving one port.
🔴 THE COUNTERS ARE AT BOTH ENDS ON PURPOSE. `link.sent` is what this side
queued and `port.heard` is what the far side took, and only the second one
is evidence: `createMidiLane`'s `scheduled()` counted what a page QUEUED and
read identically to delivery while every note was being scheduled fifty six
years out.
```

<a id="send-remote"></a>

## `bay.mjs` send: remote sources

```text
🔴 SINCE 2026-10-09 (plans/plan-site-names.md §4h) `fromId` MAY BE ANOTHER
   SITE'S PORT. A `bay.event` heard from the room is handed here, and it is
   delivered only along a link this bay holds whose `from` matches it,
   concretely or by `*`, into a port with a `deliver`, which only a page's own
   in-ports have. Holding the link is the receiver's consent.
   ⚠️ THE CLASS GUARD IS MIDI ONLY. `accepts` is a list of MIDI classes, so a
   `value` event (a fader, a chat line) has no class and was dropped by this
   line on every link, which nothing noticed because nothing sent one.
   ⚠️ `meta` IS PASSED TO `deliver` AS ITS THIRD ARGUMENT with `from` and `to`,
   so a page can draw who said it and when without a second channel.
```

<a id="schedule"></a>

## `bay.mjs` schedule

```text
One event on a timed link: ask the timebase, then hand it over now, set a
timer for it, or hold and ask again. `meta.timing` tells the port what was
decided: `{ at, local, lateMs, why, option }`, `local` being the exact
local ms it was due (earlier than now by up to `horizonMs`).
⚠️ `port.heard` COUNTS ON DELIVERY, NOT ON QUEUEING, because it is the
far side's evidence (see `send`). `link.held` and `link.missed` count the
rest, so a link that holds everything says so in numbers.
```

<a id="recheck"></a>

## `bay.mjs` schedule: recheck

```text
⚠️ A WAIT IS ASKED AGAIN EVERY RECHECK_MS, NOT SLEPT THROUGH. A
   followed link's line STEPS (an LL-HLS drift-seek moves it 2 s
   earlier at once), and a cue that slept to the old due fired 2 s after
   its picture: MEASURED on /concepts/clock/040/ before this line, +2004
   ms on every cue waiting across a step back.
```

<a id="load"></a>

## `bay.mjs` load

```text
Load a text patch. Returns every line that was refused, with its reason.
 ⚠️ A CONSENT IS NEVER IN THE TEXT, so a line out of an `external` node is
 refused here unless the person loading it passes `{ consent: true }`.
```

<a id="test-header"></a>

## `bay-test.mjs` module header

```text
demo/shell/bay-test.mjs — the patch bay's arithmetic, with no browser, no
socket and no instrument.

  node demo/shell/bay-test.mjs

The bay's whole job is to REFUSE things, and a validator is the one kind of
code that passes a naive test suite by accident: write only valid patches and
a function that returns `{ok: true}` unconditionally scores full marks.

SO MOST OF THESE ARE NEGATIVE CONTROLS. Each one is a patch that must be
refused, and each asserts the REASON as well as the refusal, because a
validator that refuses everything for one reason is the same bug from the
other side.

🔴 THE UNIVERSAL MEDIA SECTIONS (A TO K, 2026-10-04) WERE PROVED BY BREAKING
`bay.mjs` ON A SCRATCH COPY, ONE FAULT AT A TIME, against 112 green:

  sabotage                                        red
  consent check removed (`if (false)`)            4 of 112
  where always 'machine'                          5 of 112
  transforms allowed on non-MIDI links            3 of 112
  video on one network says 'round trip 12 ms'    2 of 112
  audio on one network says 'board round trip 3 ms'  2 of 112

⚠️ THE FOURTH ROW WAS 1 OF 112 THE FIRST TIME, AND THAT IS WHY IT IS HERE.
The check that no cell invents a number looked for bare digits, and `12`
is in the plan as `12 byte header`. It compares number and unit now.
```

<a id="test-why"></a>

## `bay-test.mjs` test: why

```text
🔴 A REFUSAL IS TWO SENTENCES SINCE 2026-09-22, SO THE TWO HALVES ARE READ
SEPARATELY HERE. `checkTransforms` answers `''` or `{ why, fix }`: `why` is
the problem in words and `fix` is the thing a person can do. Every check
below that used to match one string matches `why`, and the claim behind it
did not move: a refusal still has to name the thing that is wrong.
```

<a id="test-sysex"></a>

## `bay-test.mjs` test 4: sysex

```text
4. THE ONE THAT MATTERS ON THIS DESK. The Circuit has no factory reset and
   one byte inside a SysEx message overwrites a patch.
```

<a id="test-shape"></a>

## `bay-test.mjs` test 9: shape

```text
9. A shape mismatch NAMES THE FIELD. "incompatible" is a refusal somebody
   has to debug; a number against a number is one they can fix.
```

<a id="test-nothing-left"></a>

## `bay-test.mjs` test 11: nothing left

```text
11. Transforms that leave NO class at all would make a link that looks
    connected and carries nothing, which is this project's definition of a
    lie. `mk425c:out` emits note, cc and bend, so keeping only sysex keeps
    nothing. ⚠️ A DIFFERENT REFUSAL FROM 11c BELOW: here the SOURCE is left
    with nothing, there the DESTINATION takes none of what arrives.
```

<a id="test-malformed"></a>

## `bay-test.mjs` section: malformed transforms

```text
── a transform that is not well formed ────────────────────────────────────

🔴 THESE ARE NOT HYPOTHETICAL. MEASURED 2026-09-21: asked to turn *"connect
the keyboard to the circuit and transpose it up one semitone"* into a patch,
Workers AI returned `{ op: 'transpose', to: 1 }`, which is valid against the
JSON Schema it was generated under and is meaningless. `transpose` takes
`by`, and `ev.d1 + undefined` is `NaN`, which is neither a throw nor a drop.
```

<a id="test-wrong-key"></a>

## `bay-test.mjs` test: wrong key

```text
🔴 `by` WAS THE WHOLE OF THIS CLAIM UNTIL 2026-09-22 AND IT IS A FIELD
   NAME. What a reader needs is the thing that is missing, said in words, and
   the object they could write instead. **The 1 was never wrong**, so the
   solution carries it over rather than inventing a number.
```

<a id="test-half-cc"></a>

## `bay-test.mjs` test: half given cc

```text
⚠️ `to` IS A FIELD NAME AND MAY NOT BE MATCHED ON ANY MORE, which is the
   whole of the 2026-09-22 report. The claim is unchanged and is stronger
   read this way: the refusal has to say WHICH HALF of the remap did not
   arrive, in the words a person uses for it.
```

<a id="test-counters"></a>

## `bay-test.mjs` test 16: counters

```text
16. TWO COUNTERS AT TWO ENDS. `link.sent` is what this side queued and
    `port.heard` is what the far side took. Reading one as the other is
    `createMidiLane`'s bug, which counted what a page QUEUED while every
    note was scheduled fifty six years out.
```

<a id="test-transport"></a>

## `bay-test.mjs` test: transport class

```text
⚠️ NEGATIVE CONTROL: a start used to be `clock`, so a port taking tempo was started too.
```

<a id="test-media"></a>

## `bay-test.mjs` test: media

```text
⚠️ EIGHT SINCE 2026-10-04 (plan-universal-routing §3), and the first three
   are asserted IN ORDER because a page may index them by position.
```

<a id="test-ranges"></a>

## `bay-test.mjs` section: range, vrange, fixed

```text
── the three transforms added 2026-09-21, and the two traps in them ────────

🔴 A KEYBOARD SPLIT COULD NOT BE SAID IN THIS VOCABULARY AT ALL until `range`
existed. The owner asked for one in words and the model reached for `only`,
which filters by CLASS, because that was the nearest thing to a filter.
```

<a id="test-split-off"></a>

## `bay-test.mjs` test: note off through split

```text
🔴 THE TRAP: A NOTE OFF IS THE SAME NOTE NUMBER, so a note the filter let
through is always told to stop, and one it refused never started. A filter
keyed on anything that DIFFERS between the on and the off stops notes.
```

<a id="test-vrange-off"></a>

## `bay-test.mjs` test: note off through vrange

```text
🔴 THE TRAP THAT WOULD HANG A SYNTH IN ANOTHER BUILDING: a note off carries
velocity 0, so a naive window drops every release and leaves the note that
a hard hit let through sounding forever.
```

<a id="test-missing"></a>

## `bay-test.mjs` test: missing argument

```text
🔴 THE NAME IS THE THING'S NAME AND NEVER ITS KEY SINCE 2026-09-22. This
   read `fixed takes "to"`, which names the key the validator compared. What
   a reader needs named is the loudness and the channel.
```

<a id="test-open-range"></a>

## `bay-test.mjs` test: open range

```text
🔴 ONE BOUND IS A WHOLE INSTRUCTION, AND THIS ASSERT SAID THE OPPOSITE
UNTIL 2026-09-21. It read *`range` refuses a missing `hi`*, which made
*everything above middle C* unsayable: the only legal way to write it named
127 as a decision when it is the end of the scale. Both bounds still work
and neither is required on its own.
```

<a id="test-no-bound"></a>

## `bay-test.mjs` test: range with no bound

```text
🔴 NEGATIVE CONTROL, and it is the reason `oneOf` exists rather than two
   optional arguments. A range with NO bound passes every note, which is a
   filter that reads as working and does nothing at all.
```

<a id="test-non-bound"></a>

## `bay-test.mjs` test: range given a non-bound

```text
🔴 AND BEING GIVEN THE WRONG THING IS NOT BEING GIVEN NOTHING. One
   sentence covered both until 2026-09-22 and said `was given nothing` about
   `{"op":"range","to":7}`, which plainly has a number in it. That object is
   MEASURED rather than imagined: eleven runs of `llama-3.3-70b` out of
   eleven.
```

<a id="test-open-roundtrip"></a>

## `bay-test.mjs` test: open range round trip

```text
🔴 AND THE TEXT FORM HAS TO SURVIVE THE ABSENT BOUND, which is the defect
   an open end would otherwise introduce quietly: `{ range, hi: 7 }` printed
   as `range 7` reads back as `{ range, lo: 7 }`, the same words meaning the
   opposite filter.
```

<a id="test-two-ranges"></a>

## `bay-test.mjs` test: two open ranges

```text
🔴 TWO RANGES OPEN AT THE SAME END IS ALWAYS ONE RANGE WRITTEN WRONG, and
it is what a language model produces every time it is asked for a row of
buttons: eleven runs on 2026-09-21, always `{"op":"range","to":A}` then
`{"op":"range","to":B}`. Composed, the narrower bound wins and the other
transform is dead, so the link is well formed, allowed, and passes one note
of eight. The refusal carries the correction as JSON the person can read.
```

<a id="test-window"></a>

## `bay-test.mjs` test: window allowed

```text
🔴 THE NEGATIVE CONTROL, AND IT IS THE HALF THAT STOPS THIS REFUSING REAL
WORK. Two ranges open at OPPOSITE ends are a perfectly ordinary way to
write a window, and a split is two ranges in two SEPARATE LINKS, which this
check must never see as one list.
```

<a id="test-lohi-offer"></a>

## `bay-test.mjs` test: lo above hi offer

```text
⚠️ AND THE OFFER IS MADE TO A PERSON RATHER THAN TAKEN BY THE CODE. The
   file refuses to merge two bounds because one run of eleven produced them
   descending; showing the swapped object costs nothing and decides
   nothing.
```

<a id="test-help"></a>

## `bay-test.mjs` test: help for every op

```text
🔴 A TRANSFORM WITH NOTHING TO SAY ABOUT ITSELF IS A TRANSFORM NOBODY WILL
BE TOLD ABOUT. 2026-09-21: `range`, `vrange` and `fixed` were added here and
the operator table a language model reads was left listing the other six,
so the code accepted nine words and the model was offered six. It asked for
a filter with the only filter it had been shown, `only`, eight times in one
patch, and the page refused all eight. `workers/wish/src/wish-test.mjs`
generates that table from `OP_HELP` and asserts it is complete; this is the
half that stops a new op being declared with no sentence to generate FROM.
```

<a id="test-examples"></a>

## `bay-test.mjs` test: examples validate

```text
🔴 THE EXAMPLE EVERY TRANSFORM CARRIES IS GRADED BY THE VALIDATOR IT IS AN
EXAMPLE OF. It is put in front of a language model on every call, and a
model copies an example rather than reading a sentence, which is measured
twice over in `workers/wish/src/wish.mjs`. So an example this code would
refuse is a defect being TAUGHT, and it would read as documentation.
```

<a id="test-only-channel"></a>

## `bay-test.mjs` test: only given a channel

```text
🔴 NEGATIVE CONTROL: THE THING THE OWNER ACTUALLY SAW, TWICE, AND THE
SECOND REPORT IS WHAT THIS LINE NOW GRADES. It read
`/only takes "cls"/` until 2026-09-22, which passed happily on the
sentence *only takes "cls" and was given "to"* that was reported as
*"its not for humans, i do not know what to do"*. The claim behind it is
unchanged: the refusal has to name the thing that is missing. What
changed is that a KEY is not a name. The signature still carries `cls=`
because a language model is choosing keys and a visitor is not.
```

<a id="test-readable"></a>

## `bay-test.mjs` section: refusals read by a person

```text
🔴 THE REFUSALS ARE READ BY A PERSON, AND UNTIL 2026-09-22 THEY WERE WRITTEN
IN FIELD NAMES. REPORTED against a real reply: *"only takes "cls" and was
given "to" - its not for humans, i do not know what to do"*, and in the next
breath *"can we have cooncrete problem -> soluton texts?"*. These four
checks are what stops that coming back, and they are graded over EVERY
refusal this module can produce rather than over the three that were
reported.
```

<a id="test-no-keys"></a>

## `bay-test.mjs` test: no field names

```text
🔴 NO FIELD NAME IN ANYTHING A VISITOR READS, WHICH IS THE REPORT ITSELF.
Every argument of every operator, hunted in both sentences. The JSON
objects a solution may offer are cut out first, because a key inside
`{"op":"transpose","by":1}` is DATA sitting beside the data it corrects,
and the defect was a key printed as English prose.
⚠️ IT IS THE QUOTED FORM THAT IS HUNTED, AND THE FIRST WRITING OF THIS
LINE WENT RED ON TWO SENTENCES THAT ARE PERFECTLY FINE. It also matched a
bare word before ` is`, which catches *the controller it comes from is
missing*: `from` and `to` are ordinary English as well as keys, and the
reported defect was never a word, it was `only takes "cls"`. A check that
refuses the English is a check that would push the words back towards the
jargon.
```

<a id="test-sweep-control"></a>

## `bay-test.mjs` test: sweep control

```text
⚠️ AND THE SWEEP IS PROVED BY BREAKING IT, or `no field name` is a claim
   about a regular expression. The sentence that was reported is put through
   the same test and has to be caught.
```

<a id="test-echo"></a>

## `bay-test.mjs` test: no echo

```text
⚠️ AND THE TWO LINES MAY NOT RESTATE EACH OTHER, which is the failure mode
   of every problem-and-solution pair ever written. A solution that is the
   problem with `do not` in front of it is one line, not two.
```

<a id="test-three"></a>

## `bay-test.mjs` test: three cases

```text
🔴 AND THE THREE CASES STAY TELLABLE APART, WHICH IS WHAT THE OLD WORDING
BOUGHT AND THE NEW WORDING HAD TO KEEP. A key the operator does not have
is a SWAP, a key it has with a required one absent is an OMISSION, and an
empty object is neither: nothing arrived. Naming them alike is how
`cc takes "from" and was given "to"` once accused a correct argument of
being wrong.
```

<a id="test-vocab"></a>

## `bay-test.mjs` test: vocabulary whole

```text
⚠️ AND THE VOCABULARY IS GRADED WHOLE, the same guard `help` already has.
A transform added with no words beside it would fall back to *what it
needs*, which is the placeholder, and a placeholder in a refusal is the
defect above arriving again with nobody noticing.
```

<a id="test-universal"></a>

## `bay-test.mjs` section: universal media

```text
── the universal media, plan-universal-routing §3 to §8, 2026-10-04 ───────

🔴 EVERYTHING BELOW IS ARITHMETIC ABOUT A DESCRIPTION. No session is opened,
nothing is fetched, no transport code exists in `bay.mjs` to call. So a green
here says the bay NAMES the right session, never that one would work.
```

<a id="test-says"></a>

## `bay-test.mjs` test: says numbers

```text
🔴 NO CELL SAYS A NUMBER THE PLAN DOES NOT. Every number in every `says` is
looked for in `plans/plan-universal-routing.md` WITH ITS UNIT, so a
plausible figure typed into a cell nobody measured goes red here.
⚠️ THE UNIT IS THE CHECK, AND THE FIRST WRITING OF THIS LOOKED FOR BARE
DIGITS AND MISSED THE SABOTAGE IT WAS WRITTEN FOR: `round trip 12 ms` passed
because the plan says `12 byte header`. The plan's bold is stripped first.
```

<a id="test-store-read"></a>

## `bay-test.mjs` test: store read

```text
⚠️ THIS SAID `read back through ingest` UNTIL 2026-10-06, and ingest is the
   WRITE path. One reader of one stored object is one https read (`READS`).
```

<a id="test-step0"></a>

## `bay-test.mjs` section: routing migration step 0

```text
── step 0 of plans/plan-routing-migration.md, 2026-10-06 ─────────────────

🔴 THE RELAY'S REAL CAP, ONE STALE WINDOW, A READ ROW, A PORT'S OWN
TRANSPORTS, A LINK'S `via`, AND AN INPUT SOMEBODY HOLDS. Every one of them
refuses something, so most of what follows is a refusal with its reason and
the same case allowed beside it, which is what proves the refusal is the rule
and not a link that never matched.
```

<a id="test-r"></a>

## `bay-test.mjs` test R: wire inside one site

```text
R. A wire transport inside one site, 2026-10-09. `MACHINE_ONLY` stopped
   `page` crossing a wire; nothing stopped `whep` being asked for inside one
   tab, which answered `ok, whep, machine`.
```

<a id="test-s"></a>

## `bay-test.mjs` test S: address per site

```text
S. A derived address is per site, 2026-10-09. Every tab is placed
   `browser`, so `webgl:video` derived `browser-webgl-video` in all of them.
```

<a id="test-store-loop"></a>

## `bay-test.mjs` test: store loop

```text
A loop through a store is a replay, not feedback (2026-10-10). The shapes
are concept 4's: a chat tab keeps each line in positron-store's history and
hears the history back, which the cycle walk used to refuse.
```

<a id="test-light-via"></a>

## `bay-test.mjs` section: light via

```text
── a light link between two sites names its wire (2026-10-11, sampler/035) ──
```

<a id="test-timed"></a>

## `bay-test.mjs` section: timed links

```text
── timed links: `ahead` and `follow` (2026-10-12, plan-routing-time §4.3) ──
```

<a id="test-timed-sabotage"></a>

## `bay-test.mjs` timed links: sabotages

```text
SABOTAGES, MEASURED 2026-10-12 on a scratch copy of demo/shell, against 196
   here and 47 in bay-node-test.mjs (whose section 8 grades the stamp):
     timing ignored, every timed link delivered on arrival        8 red here
     every verdict fired at once, wait or hold                    8 red here
     a hold fired as if it were due                               4 red here
     follow never checked against the ports it names              2 red here
     follow dropped, scheduled on the peer clock only             2 red here
     port.heard counted on queueing rather than delivery          1 red here
     a wait slept to its due, never asked again                   1 red here
     timing options taken off the light media (link-options)     13 red here, 3 there
     emit stamps nothing                                          3 red there
     emit stamps without adding ahead                             2 red there
     emit stamps even with no shared clock                        3 red there
```

<a id="patch"></a>

## `bay.mjs` OPS.patch, `patchFor`

Added 2026-10-15 for /connect/. MEASURED that day in the owner's test log: "Play piano with keyboard"
was built as keys to web:plaits, because nothing told the model web:sampler is a piano, and
"keyboard plays rhodes on bottom and piano on top" had no way to choose the Rhodes in the browser.
The owner: *"you should know patch names not special case rhodes"*.

- A patch is a word an in-port lists in `patches`, read off the instrument's own module
  (`demo/shell/patch-names.mjs`: the sampler's `SAMPLER_SET`, Plaits' `PATCHES`; the board passes
  its own lists to `boardGraph`). The transform changes no event; the runtime its link reaches is
  told the name when the link is made (`node-runtime.mjs` `choosePatches`).
- Refused in words: a patch into a port that lists none, a name the port does not list (the fix
  names the ones it has), no name, a number for a name, two patches on one link. Matched without
  case and stored in the port's own spelling, so "rhodes" chooses Rhodes.
- A second link choosing another patch into the same instrument is made with a warning: one
  instrument plays one patch, so two at once is two instruments (`web:sampler-2`).
- In the text form a name with a space is quoted (`patch "Soft FM"`) so it reads back whole.

<a id="drummap"></a>

## `bay.mjs` the `drummap` op and `drummapFor`

Built 2026-10-15 from `plans/plan-pi-sequencer.md` §3 (asked *"start pi seq -> circuit drums work"*). General MIDI on the wire, voice names in the pattern file, each drum instrument's own notes published once on its `midi-in` as `drums` (`demo/shell/drum-maps.mjs`), and the translation a named transform on the link, `{ op: 'drummap', name: 'circuit' }`. It is resolved against the destination port when the link is made, exactly as `patch` is resolved against `patches`, and `link()` stores the resolved `map`, `channel` and `labels` on the transform, so `apply()` stays pure and never sees a port. The text form prints only the name (`{ drummap circuit }`); a loaded text patch resolves again.

Why not raw device notes in the pattern: the Circuit's drum 3 is note 64, which in General MIDI is a low conga, and `demo/drums/voices.mjs` already plays a conga on 64. Why not a silent translation at the destination: the picture would show a plain wire while the notes changed underneath it.

An unresolved drummap (a bare `{ op, name }` handed to `apply()`) drops every note rather than pass General MIDI to an instrument that reads 36 as nothing. A note the map lacks is dropped on and off alike; anything that is not a note (CC 123 on stop) passes unchanged. Two drummaps on one link are refused, and so is a drummap into a port with no `drums` or naming a map the port does not publish, with the right map offered back.

MEASURED 2026-10-15, `bay-test.mjs`: 212 asserts before, 237 after (25 new, most negative controls). The four Circuit notes are written in the test from the Drum Notes Table, not read from `drum-maps.mjs`; sabotaging the map to `46: 66` takes 3 red (the open hat's note, the stored map, the details row).

<a id="channels-subset"></a>

## `bay.mjs` MIDI channels compared as a set

`pi-1:circuit:midi-in` declares `shape: { channels: [1, 2, 10] }` and shape fields were compared by JSON equality, so a sequencer declaring `channels: [10]` was refused for not being `[1, 2, 10]`. `plans/plan-pi-sequencer.md` §3.5 named it. For a MIDI link the `channels` field is now a subset test: a source on 10 fits a port that plays 1, 2 and 10, and a source on 3 is refused with `sends on channel 3 and Circuit plays only 1, 2, 10` and a `channel` transform offered. Audio `channels` (a count) is unchanged.

<a id="drummap-warn"></a>

## `bay.mjs` the drum warnings

A port whose `drums.map` is not null (not General MIDI) gets a warning on every link that carries notes into it: without a drummap, *"this link sends General MIDI, so a kick (36) will not sound"* with the transform to add; with one, which GM notes it plays and that every other drum note is dropped. The bay's existing `warn` channel, so a person sees it where they see every other one.

<a id="drummap-back"></a>

## `drummapFor` read back

2026-10-15. A drummap is resolved against the RECEIVING port first, as before. When that port does not list the named map and the SENDING port does (`pi-1:circuit:midi-out` publishes `drums: circuit`), the link resolves to that map read back (`readBack`, `lessons/kit-drum-maps.md#read-back`), and only into a port that plays General MIDI: into a port with its own non-GM map it is refused in words, since one map cannot carry both. The text form is unchanged, `{ drummap circuit }`. The resolved transform carries `only` (the source's drum channel) and `back: true`; `run` drops any event on another channel before anything else, so it stays pure and never sees a port. bay-test's read back block has 15 asserts, most negative controls; removing the `only` line took 4 of them red.

<a id="p2p-sfu"></a>

## `bay.mjs` TRANSPORTS: `p2p` and `sfu`

Added 2026-10-22 for the video room (`plans/plan-video-room.md` §2.3). `p2p` is browser to browser WebRTC
media, a mesh; `sfu` is through a media server, one upload whatever the number of receivers.

- They are NOT the cell's first choice anywhere. They sit after it in `or`, which may now be a list, so a
  port that names no transports is offered exactly what it was before (bay-test V, negative control), and
  only a port that lists `p2p` or `sfu` gets one. Order inside a cell is the preference: `internet-many`
  offers `sfu` before `p2p`, so a camera that can do both goes through the SFU once there are several
  receivers.
- `p2p` is in all three wire columns, `internet-many` included, because a mesh to five tabs is five
  one-receiver legs that the bay counts as five receivers from one port. Its note says what that costs:
  one upload per receiver.
- `datachannel` stays. The Pi pages really do carry PCM and frames on an `RTCDataChannel`
  (`graph-registry.mjs` `BOARD_TRANSPORTS`, `remote/path.mjs`), so it is the right word there. It was the
  wrong word only on `/room/video/`, whose media is RTP tracks.
- `notes` gives each alternative its own `says`, so a `p2p` link does not print the WHEP cell's warning
  about a VPN. The test that no cell quotes an unplanned number reads `says` only, so the notes carry none.
- A refusal names a port by its id when it has no label (a port added by `addNodes` has none), where it
  used to print `undefined only travels by p2p`.

Two tabs read as one machine was not a bay bug: `place` is the machine (`#addnode`), and the page told
the bay every tab was on the machine called `browser`. `whereOf` was left alone on purpose, because one tab
can hold several sites placed `browser` (MIDI devices, engines, `/patchbay/`), and for those "one machine"
is true and picks `webaudio`.
