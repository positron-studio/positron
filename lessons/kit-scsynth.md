# Kit lessons: scsynth.mjs

The long comments cut from `demo/shell/scsynth.mjs`, moved here verbatim. Each heading names the file and the block, and the code points at it with `// why: lessons/kit-scsynth.md#<anchor>`.

<a id="header"></a>

## scsynth.mjs, file header

demo/shell/scsynth.mjs — real SuperCollider in a tab, for any page that wants it.

🔴 THIS WAS `demo/grains/engine.mjs`'s BOOT AND IS NOW SHARED. `/grains/`
was the only page running scsynth, so its boot lived inside it. `/archive/radio/`
needs the same engine to granulate a live radio stream, and this repo has
paid twice for two copies of one function (`rowHTML` printing `undefined`
over every demo name; `moq.mjs` importing a URL that had been renamed away).
One copy, in the kit, per CLAUDE.md's rule.

What is HERE is what any page needs: bring the engine up, get its graph to
the speakers, load a compiled definition, talk OSC and be answered. What
stays in a page is what only that page means: which definitions, which
buffers, which parameters.

⚠️ EVERY HARD-WON DETAIL BELOW IS LOAD-BEARING AND WAS MEASURED. They are
kept verbatim from the engine that proved them; do not tidy one away without
re-running `node demo/verify.mjs grains` against the live board.

LICENCE: SuperSonic (wasm scsynth) is vendored under `demo/shell/vendor/`
with its licence files beside it. See LAYOUT.md rule 6.

<a id="prefetch"></a>

## scsynth.mjs, prefetchScsynth

A download hint for the engine, and nothing else: two `<link rel=prefetch>`
for the wasm and the module, both on our origin. Nothing is compiled, no
context is made and nothing runs. Asked 2026-10-12 (BACKLOG, *"sampler/040:
warm SuperCollider before the first key"*), when every sampler page went to
scsynth and the first note on each of them paid the boot.
⚠️ IT IS A HINT. The local server answers `no-store`, which a browser will
not keep, so on `node demo/server.mjs` this saves nothing and only the
deploy can show what it is worth. `loadScsynth` is the half that does not
depend on a cache.

<a id="boot"></a>

## scsynth.mjs, bootScsynth

Bring scsynth up in this tab.

@param {{audioContext?: AudioContext, input?: AudioNode,
        log?: (s: string) => void, onReply?: (m: any[]) => boolean}} opts
 `input` is an AudioNode to feed scsynth's HARDWARE INPUT BUSSES — see the
 note on it below, it is the whole reason this file is shared.
 `onReply` sees every OSC message first; return true to consume it (that is
 how `/grains/` takes `/pgrain` without it filling the reply ring).

<a id="urls-and-inputs"></a>

## scsynth.mjs, bootScsynth, URLs and input busses

⚠️ `coreBaseURL` ALONE DOES NOT WORK (research §7): the engine fetches
`baseURL + 'wasm/scsynth-nrt.wasm'` and 404s. Every URL explicitly.
⚠️ THE INPUT BUS COUNT IS NOT OURS TO SET, AND A COMMENT HERE ONCE CLAIMED
IT WAS. The base class defaults `audio.inputChannels` to 0, which looks
like the thing to override — but the SuperSonic subclass you actually
construct OVERWRITES it: `audio: { outputChannels: t.numOutputBusChannels,
inputChannels: t.numInputBusChannels }`, derived from the scsynth options,
whose defaults are **2 and 2**. So input busses exist already, at 2 and 3
(outputs first, then inputs) — which is exactly the `inbusl 2 inbusr 3` the
board uses. Passing `audio: {...}` here is a no-op and was removed rather
than left in looking load-bearing.

<a id="meter-chain"></a>

## scsynth.mjs, bootScsynth, meter and chain

The meter is IN the path, not a tap off a branch that might be muted — a
deafness control has to measure what the speakers would get.

🔴 AND THE WHOLE CHAIN REACHES THE DESTINATION BEFORE ANYTHING ELSE
HAPPENS, WHICH COST A RUN. Web Audio PULLS: a node with no path to the
destination is never asked to process, and this engine's worklet is where
`/b_alloc` is serviced — so with the output left dangling for the caller to
connect later, the first buffer answered `allocation timeout (5000ms)` and
every allocation after it. It reads exactly like a wedged engine and it is
a disconnected graph. The caller gets `out`'s GAIN to blend with, never the
connection.

<a id="input-bus"></a>

## scsynth.mjs, bootScsynth, the input bus

🔴 THE INPUT BUS — THE BROWSER'S VERSION OF PLUGGING THE INSTRUMENT IN.
`Engine_Pappus.sc:518` is `In.ar(inbusl, 1), In.ar(inbusr, 1)`: Pappus
does not generate, it granulates whatever is ON A BUS. On the Raspberry Pi
that bus is filled by JACK. In a browser nothing filled it, so a Pappus
loaded alone granulated silence — which is why `/grains/` also loads
`PosSource`, a SECOND definition that manufactures material, and why
LESSONS #81 ships that caveat beside its "same instrument at both ends"
claim.

A live audio node fills it. VERIFIED IN THE VENDORED WORKLET rather than
assumed from the node's shape: `clockwork_audio_worklet.js`'s
`process(s,t,e)` does `let c = s[0]?.length || 0;` and, when `c > 0`,
copies those channels into `get_audio_input_bus()`. Busses 2 and 3 are the
first hardware inputs (two output channels come first), which is exactly
the `inbusl 2 inbusr 3` the board itself uses.

⚠️ ANYTHING ROUTED IN HERE SUMS WITH WHAT A `PosSource` WRITES to the same
bus — two materials in one buffer, a third thing neither end can describe.
A page feeding live input must NOT also run a source onto that bus.

<a id="sonic-node-input"></a>

## scsynth.mjs, bootScsynth, sonic.node.input

🔴 `sonic.node` IS A FROZEN FAÇADE, NOT AN AudioNode — AND `.input` IS THE
REAL ONE. SuperSonic returns `Object.freeze({ connect, disconnect, get
context, get numberOfInputs, …, get input(){ return e } })`, where `e` is
the AudioWorkletNode. Its `connect` FORWARDS, so `sonic.node.connect(x)`
works and reads like an AudioNode — but `x.connect(sonic.node)` throws
`Overload resolution failed`, because Web IDL wants an AudioNode and this
object is not one. It passes every duck-type check you would think to
write: it has `connect`, it reports `numberOfInputs: 1`, its `context` is
the right context. MEASURED: four such checks passed and the next line
threw anyway.

⚠️ `demo/grains/engine.mjs` NAMED THIS PROPERTY ALL ALONG — its comment
read *"nothing is connected to `sonic.node.input`"*, which is the API and
not a metaphor. Read the comments already in the file (CLAUDE.md).

<a id="wait-for"></a>

## scsynth.mjs, waitFor

⚠️ MARK THE REPLY LIST BEFORE THE SEND. research §8's own trap: a matcher
that searches the whole history answers with an EARLIER send's `/done`, and
a boot has thirty-odd `/done`-shaped replies in flight.

<a id="recv-def"></a>

## scsynth.mjs, recvDef

🔴 THE ANSWER IS `/done /d_recv` IN THE ENGINE'S OWN VOICE. Not
`loadSynthDef()`'s return value — research §8 measured it returning
`{name, size}` for a definition the server never received — and not
`loadedSynthDefs`, measured going 1→2→3 across three sends of which one
loaded. Over the engine's ceiling the server says NOTHING AT ALL, so the
timeout is the answer rather than an error.

<a id="notify"></a>

## scsynth.mjs, bootScsynth, /notify

🔴 THE ENGINE'S OWN `/done /notify`, NOT A FIXED SLEEP. This was
`await sleep(250)` after the send, a quarter of every boot measured on
/concepts/sampler/040/ (research/scsynth-sampler-in-browser-2026-10-11.md
section 3). scsynth answers `/notify` with `/done /notify <client>`, and
that answer is the fact the sleep was standing in for. If no answer comes
in a second the boot goes on, as it always did, and says so.

<a id="input-channels"></a>

## scsynth.mjs, bootScsynth, inputChannels (a second input)

Added 2026-10-18 for the cast's ghosts (`plans/plan-cast-reinterpret.md` §2.6): the other file
on its own busses while the grain ring keeps reading 2 and 3. The earlier note that the input bus
count "is not ours to set" is about `audio: {...}`, which SuperSonic overwrites. The scsynth option
itself is honoured: SuperSonic derives `audio.inputChannels` from `scsynthOptions.numInputBusChannels`,
and the vendored worklet copies `min(channels arriving, inputChannels)` into the input busses.

Two things have to be true at once. The engine has to be booted with 4 inputs, and the
AudioWorkletNode has to take 4 channels without mixing them: its default is `channelCount` 2,
mode `max`, `speakers`. `inputChannels: 4` sets both (`explicit`, `discrete`). `inputPairs(ctx,
[a, b])` builds the 4 channel input from two stereo nodes (a splitter each into one merger).

MEASURED in headless Chrome: 300 Hz on the first pair and 700 Hz on the second, booted with
`inputChannels: 4`, metrics `audioInputChannels` 4, worklet `channelCount` 4. `In.ar(2, 2)` heard
300 Hz 157 dB over 700, `In.ar(4, 2)` heard 700 Hz 159 dB over 300. NEGATIVE CONTROL: the same
4 channel input into a default boot leaves `In.ar(4, 2)` at rms 0.
