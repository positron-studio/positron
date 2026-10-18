# Kit lessons: sclang-lite.mjs, sclang-lite-test.mjs

The long comments cut from `demo/shell/sclang-lite.mjs` and `demo/shell/sclang-lite-test.mjs`, moved here verbatim. Each heading names the file and the block, and the code points at it with `// why: lessons/kit-sclang-lite.md#<anchor>`.

<a id="header"></a>

## sclang-lite.mjs, file header: what is accepted, refused, and where the numbers come from

demo/shell/sclang-lite.mjs: a SMALL SUBSET of the SuperCollider language,
compiled to a SynthDef in JavaScript, in the tab.

🔴 THIS IS NOT sclang AND MUST NEVER BE DESCRIBED AS IF IT WERE. sclang does
not run in a browser: `research/supercollider-browser-2026-09.md` §1.3, PR
#7440 open since 2026-04-01 and still mid-design. Compiling on the Raspberry
Pi's sclang was refused, because sclang can shell out and a visitor's text
would be running on the board. So this file reads one function literal of
the kind a SynthDef is written as, and builds the bytes `synthdef.mjs`
already knows how to write. Anything it does not know is an ERROR with a
line and a column. It never guesses, and it never drops an argument it did
not understand.

🔴 WHAT GRADES IT IS REAL scsynth, NOT THIS FILE. The rule `synthdef.mjs`
carries in its header applies with more force here, because this file makes
up the graph as well as the bytes: a round trip through `readSynthDef` proves
the file is well formed and can never prove it computes the right thing. The
page `/collide/` loads every compile with `/d_recv`, waits for `/done` in the
engine's own voice and measures the output. `sclang-lite-test.mjs` grades the
structure and the refusals without a browser.

── WHAT IS ACCEPTED ──────────────────────────────────────────────────────────

  { |freq = 440, amp = 0.1, gate = 1|        arguments, number defaults only
    var env = EnvGen.kr(Env.adsr(0.01, 0.3, 0.5, 1), gate, doneAction: 2);
    var sig = Saw.ar(freq * [1, 1.01], mul: amp);
    sig = RLPF.ar(sig, 1200, 0.3);          reassignment
    sig * env                                 the last line is what is heard
  }

Arguments as `|a = 1, b|` or `arg a = 1, b;`. `var` lines before any
statement, which is sclang's own rule. UGen calls with `.ar` or `.kr`,
positional and keyword arguments (`mul:`), `mul` and `add` where the class
has them. `+ - * /` and `!` (dup). Unary minus. `.neg .abs .squared
.midicps .tanh .dup`. Number literals including `1e3`, `pi` and `2pi`.
Array literals, and multichannel expansion through a call or an operator,
wrapping the shorter side the way sclang does. `Mix(...)`, `Mix.new`,
`Mix.ar`. `Env.adsr`, `Env.perc`, `Env.new` and `Env(...)`, with a curve that
is a number or one of Env's own shape names written as a symbol (`\lin`).
`//` and `/* */` comments, nested the way sclang nests them.

SINCE 2026-10-13, FOR THE GRAIN RING, /granulator/grains/: `%` (opMod),
`.sqrt`, `.sin` and `.cos` (its equal power wet and dry), a 'quoted' symbol (sclang's other spelling of `\name`, and the only
one that can hold a `/`), and the UGens GrainBuf, BufWr, Phasor, SendReply,
Impulse, Dust, TRand, In, BufFrames and BufDur, each from its class file
(see `UGENS`). Then, the same day, DelayC, LocalIn and LocalOut for the
ring's echo: a delay whose output comes back into its own input. A line
that is only a call, like `BufWr.ar(...)`, `SendReply.ar(...)` or
`LocalOut.ar(...)`, stays in the graph, as it does in sclang.

🔴 NAMED CONTROLS, `\name.kr(value, lag, spec: ...)`, ADDED 2026-09-30 so a
program can say which of its numbers a knob under the text may turn. The
signature is sclang's own, `Symbol.kr { | val, lag, fixedLag = false, spec | }`
(`SCClassLibrary/Common/Core/Symbol.sc`), and what it builds is
`NamedControl.new` in `Common/Control/GraphBuilder.sc`, read at 19954900:
  `\rel.kr(1.5)`             a Control block of its own, one output, its
                              special index its slot in the value array
  `\rel.kr(1.5, 0.2)`        a LagControl whose one input is 0.2. A lag that
                              is a plain number is `\scalar` rate, and
                              `NamedControl.new` turns that into `fixedLag`,
                              so sclang builds a LagControl and NOT
                              `Control.kr(...).lag(0.2)`. A lag of 0 is nil
                              there, so no lag at all.
  `spec: [min, max, warp, step, default]`   `Array.asSpec` is
                              `ControlSpec(*this)`, so that is the order.
                              The warp is `\lin`, `\exp`, `\sin`, `\cos` or a
                              curve number. `spec: \freq` is one of
                              `Spec.specs`, copied from `Spec.sc`. With no
                              value, the spec's default is the value, which
                              is `ControlSpec`'s `default ? minval`.
The same name twice is one control, as in sclang, and two different values
for it is sclang's own error. The spec changes nothing in the sound; it is
what the knob under the text is drawn from, which is `controls` in the result.

🔴 THE OPERATORS ARE LEFT TO RIGHT WITH NO PRECEDENCE, BECAUSE sclang's ARE.
`1 + 2 * 3` is 9 in SuperCollider, not 7. A compiler that used ordinary
maths precedence would compile every preset here correctly and then play
something else for the first person who wrote `sig + noise * 0.1`, which is
exactly the kind of green that grades nothing. The test file asserts 9.

🔴 THE LAST LINE IS WRAPPED IN `Out.ar(0, ...)`. One channel goes to both
speakers; a two element array is left and right. More than two is refused,
because bus 2 on this engine is its first HARDWARE INPUT, not a third
speaker (`scsynth.mjs`, the input bus note). Writing `Out` yourself is
refused rather than doubled.

── WHAT IS REFUSED, EVERY ONE WITH A LINE AND A COLUMN ───────────────────────

Any class not in `UGENS`, `Env` or `Mix`. Any method not listed above. An
unknown keyword (sclang only WARNS about that one; here a misspelled `mull:`
is an error, because a warning nobody reads is how a sound silently loses
its level). A positional argument after a keyword one. Strings, symbols
anywhere but an Env curve or SendReply's cmdName, `~environment` variables, nested functions,
`if`, `.play`, `SynthDef`, `Out`, `#[...]`, every operator but the six, a
variable used before it has a value, a default that is not a number. A named
control that is `.ar`, `.ir` or `.tr`, whose value or lag is not a number,
that is given `fixedLag`, that shares a name with an argument, or whose spec
this subset cannot draw a knob for: `\amp` and `\db` warps (sclang's fader
warps), `\exp` across or touching zero, a range of nothing, a default
outside the range. The last three are TIGHTER than sclang, which builds such
a spec and only misbehaves when something maps through it. An
`.ar` filter or `Pan2` whose first input is not audio rate, which is
sclang's own `checkSameRateAsFirstInput` and `checkNInputs(1)`. A last line
that is a number or `.kr`, which `Out.ar` refuses in sclang too.

── WHERE THE NUMBERS COME FROM ───────────────────────────────────────────────

🔴 EVERY ARGUMENT NAME AND DEFAULT IN `UGENS` IS COPIED FROM SuperCollider's
OWN CLASS FILES, `SCClassLibrary/Common/Audio/*.sc` on the `develop` branch
at commit 1995490 (read 2026-09-30), and each row names its file. `Saw` and
`Pulse` live in `FSinOsc.sc`, which is not where anybody would look, and is
why the file is named rather than implied. The operator indices are the
`enum`s at the top of `server/plugins/BinaryOpUGens.cpp` and
`server/plugins/UnaryOpUGens.cpp`, and the Env array is `Env.sc`'s
`prAsArray`: initial level, segment count, release node or -99, loop node
or -99, then level, time, shape number and curve value per segment.

⚠️ TWO PLACES THIS DELIBERATELY BUILDS A DIFFERENT GRAPH FROM sclang, AND THE
SOUND IS THE SAME. `madd` with both a multiplier and an offset becomes a `*`
and a `+` rather than one `MulAdd`, and `Mix` sums with `+` rather than with
`Sum3` and `Sum4`. Both are one block cheaper in sclang and identical in
what they compute. sclang's degenerate-case folding (`x * 1` is `x`, `x * 0`
is `0`, `0 - x` is `x.neg`) IS copied, from `BinaryOpUGen.new1`, so a graph
here carries no block sclang would have removed.

<a id="ugens-grain-ring"></a>

## sclang-lite.mjs, UGENS, the grain ring fields

── added 2026-10-13 for the grain ring, /granulator/grains/. Read in
supercollider develop 1995490 on 2026-10-13, the same commit as the rows
above. Four shapes the rows above do not have, each a field:
  `rates`   the methods the class really has; GrainBuf is `*ar` only and
            the buffer info UGens `*kr` (and `*ir`, not in this subset).
  `chans`   the argument that is the NUMBER OF OUTPUTS and not an input:
            `In.init` and `GrainBuf.init` take it off the front and call
            `initOutputs`. A whole number from 1 to MAX_CHANNELS here.
  `inline`  the argument whose array is spliced into the inputs rather
            than expanded: BufWr's `inputArray` (`multiNewList([... loop]
            ++ inputArray.asArray)`) and SendReply's `values` (bubbled,
            then `addAll(values)`).
  `order`   the inputs in the order the server reads them, where it is
            not the argument order. SendReply's `new1` is `[trig, replyID,
            ascii.size] ++ ascii ++ values`, so `#cmdName` is the symbol
            written as its length and then its characters.
`outputs: 0` is `SendTrig`'s `numOutputs { ^0 }`; the call answers 0.0 as
sclang's does. `noAlias` is `DefineDtorCantAliasUnit(GrainBuf)` in
`server/plugins/GrainUGens.cpp`, which changes the wire count (`wirePeak`).

<a id="ugens-echo"></a>

## sclang-lite.mjs, UGENS, DelayC, LocalIn and LocalOut

── added 2026-10-13 for the grain ring's echo (its Dub patch), read in
supercollider develop 1995490 the same day. DelayC is `DelayN`'s
`*ar { arg in = 0.0, maxdelaytime = 0.2, delaytime = 0.2, mul, add }`
(Delay.sc; DelayC inherits it), whose `in.asAudioRateInput` is tighter
here: an `.ar` delay of a control rate signal is refused, as a filter's is.
LocalIn is `*ar { arg numChannels = 1, default = 0.0 }` whose `init` takes
the count off the front and `inputs = argDefault.wrapExtend(numChannels)`
(InOut.sc): `wrap` is that, one default per channel. LocalOut is
`*ar { arg channelsArray }`, `multiNewList(['audio'] ++ channelsArray)`
and `^0.0`, no output (InOut.sc); `AbstractOut.checkInputs` wants every
channel at audio rate on `.ar`, which is `allAudio`. Its
`replaceZeroesWithSilence` is not copied: a number into it is refused.

<a id="spec-for"></a>

## sclang-lite.mjs, specFor

A spec for a control that was given none, which is what an argument always
is. `name.asSpec` first, the way sclang's own GUIs find one (`Symbol.asSpec`
is `Spec.specs.at(this)`); then `ControlSpec.new`, 0 to 1, which is what
`nil.asSpec` answers, when the value fits in it.
⚠️ AND THEN A GUESS THAT IS THIS FILE'S AND NOT sclang's: 0 to twice the
value, or minus to plus twice it, because sclang has no answer past `nil`
and a knob has to have two ends. `guessed` says so to the page.

<a id="wire-ceiling"></a>

## sclang-lite.mjs, WIRE_CEILING

🔴 64 AUDIO WIRES ALIVE AT ONCE, AND OVER IT THE ENGINE SAYS NOTHING.
`research/scsynth-wasm-official-2026-09.md` §10 measured the default
`maxWireBufs` of 64: 64 oscillators alive at once loaded, 65 got no `/done`
and no `/fail`, and the engine stopped answering `/status`. A 2,886 byte
definition refused by an engine that takes 860,000. So it is counted here,
the way scsynth colours its buffers (release a block's inputs, then take
its outputs, and an output nobody reads is never released), and refused
before it is sent. See `wirePeak`.
⚠️ NOT ALWAYS SILENT. On 2026-09-30 the same engine answered `/fail` to a
definition one buffer over (64 unread oscillators and one heard) and kept
answering `/status`, so which of the two a refusal looks like depends on the
graph. Counting here makes both moot.

<a id="compile"></a>

## sclang-lite.mjs, compile

Compile one function literal to a SynthDef.

@param {string} src
@param {{name?: string, bus?: number}} [o]  `bus` is the output bus the last
 line goes to, 0 by default. Added 2026-10-12 so the `/drums/` concept pages can put
 each drum on a stereo pair of its own; the engine has to be booted with that
 many output channels, or the bus is an input.
@returns {{ok: true, bytes: Uint8Array, name: string, params: {name: string, value: number}[],
 channels: number, blocks: number, wires: number, gate: boolean, gateUsed: boolean,
 freesItself: boolean, kinds: string[], warnings: string[]}
 | {ok: false, error: string, line: number, col: number, message: string}}

<a id="class-before-args"></a>

## sclang-lite.mjs, compile, class and method judged first

⚠️ THE CLASS AND THE METHOD ARE JUDGED BEFORE THE ARGUMENTS ARE READ, so
`Mix.fill(3, { ... })` is refused as `Mix.fill` rather than as the brace
inside it, which would name the symptom instead of the cause.

<a id="wire-peak"></a>

## sclang-lite.mjs, wirePeak

How many audio rate signals are alive at once, counted the way scsynth
colours its wire buffers: each block first gives back the inputs it was the
last reader of, then takes one buffer per audio rate output. READ in
`server/scsynth/SC_GraphDef.cpp`, `DoBufferColoring`, at commit 19954900:
`ReleaseInputBuffers` then `AllocOutputBuffers` for every block whose
definition does not set `kUnitDef_CantAliasInputsToOutputs` (none of this
subset's do; `PanB2`, `Balance2`, `PlayBuf` and the grain UGens are the kind
that do), and the total is `BufColorAllocator::NumBufs()`, which is the peak.

🔴 AN OUTPUT NOBODY READS KEEPS ITS BUFFER TO THE END OF THE GRAPH. This
said it was "taken and given straight back" until 2026-09-30, and that was
wrong: `alloc(count)` with a count of 0 stores 0 and never pushes the index
back on the free stack, and `release` refuses a count that is already 0, so
that buffer is never handed to anybody again. MEASURED on the real engine the
same day: `{ var a = SinOsc.ar([...63 freqs]); SinOsc.ar(300, mul: 0.1) }`
loads and the same with 64 is refused with `/fail`, while the old count said
1 wire for both, so a program the old rule passed was one the engine
refused.

<a id="test-header"></a>

## sclang-lite-test.mjs, file header and the sabotage record

demo/shell/sclang-lite-test.mjs: the SuperCollider subset, with no browser.

  node demo/shell/sclang-lite-test.mjs

🔴 WHAT THIS CAN AND CANNOT GRADE. It reads every compile back through
`readSynthDef`, which is a SEPARATE pass over the bytes, and compares the
graph it finds against numbers written out by hand from SuperCollider's own
class files. That grades the structure: which block, which input, which
constant, which operator index. It CANNOT say the bytes play. There is no
scsynth on this machine and SuperSonic needs an AudioWorklet, so the engine
half is graded on `/collide/` under `?selfcheck=1`: `/d_recv` answered
`/done` and a non-silent output, beside a meter reading zero with nothing
playing. A green run here with a red page means the file is well formed and
wrong, which is exactly the case this file cannot see.

🔴 A NAMED PROPORTION OF THESE ARE NEGATIVE CONTROLS, per the convention in
this directory: each is written so the defect it names would fail it. They
are marked `NEGATIVE CONTROL` and they were PROVED by sabotaging the module,
not argued. `SCL_MODULE=<path>` runs this file against another copy of the
compiler, which is how the sabotaged copies were graded without touching the
real one. MEASURED 2026-09-30, 50 ok on the real module, then eight
sabotaged copies:

  operators read right to left (so 1 + 2 * 3 is 7)       49/50, precedence
  keywords bound by position                              42/50, eight red
  `*` written as opcode 0, which ADDS                     48/50, both mul checks
  Env.adsr without its release node                       49/50, the adsr array
  one channel sent to the left speaker only              49/50, the Out check
  the filter rate rule removed                            48/50, both filter refusals
  the wire ceiling not checked                            49/50, the 65 refusal
  an unknown keyword dropped instead of refused           49/50, `mull:`

⚠️ 2026-09-30, THE WIRE COUNT WAS WRONG AND FOUR CHECKS WERE ADDED FOR IT.
An output nobody reads was counted as given straight back; scsynth keeps it.
MEASURED, 63 ok on the real module, then three sabotaged copies:

  the old line back, an unread output given straight back  60/63, the unread
                                                           oscillator, Pan2
                                                           and the 63 and 64
  inputs never given back                                  59/63, and the
                                                           forty deep chain
  outputs taken BEFORE the inputs are given back           60/63, the chain
                                                           reads 2 and both
                                                           ceilings move

⚠️ 2026-09-30, NAMED CONTROLS (`\rel.kr(1.5, spec: [0.05, 6, \exp])`), AND
BELL, GLASS AND BREATH LEFT THE PRESETS (*"keep pad growl wah"*), which took
six preset checks with them. MEASURED, 84 ok on the real module, then six
sabotaged copies (both files copied, since `control()` is in synthdef.mjs):

  a lag written as a plain Control                        83/84, the LagControl
  every named control given special index 0               82/84, rel's wiring
                                                           and the slot check
  the spec's default ignored when no value is given        83/84, the defaults
  \exp across zero not refused                            83/84, that refusal
  freq, amp and gate not left out of the knobs             81/84, three
  a lag of 0 kept as a lag                                 83/84, the 0 is nil

⚠️ 2026-10-13, THE GRAIN RING'S UGENS (GrainBuf, BufWr, Phasor, SendReply,
Impulse, Dust, TRand, In, BufFrames, BufDur), `%`, `.sqrt` and 'quoted'
symbols, for the grain ring (/granulator/grains/). MEASURED, 105 ok on the real module
(84 before), then six sabotaged copies:

  SendReply's replyID written after its cmdName           103/105, its layout
                                                           and the probe bytes
  GrainBuf's noAlias dropped                               104/105, the wire count
  numChannels written as an input                          102/105, GrainBuf, In
                                                           and the probe bytes
  % folded as JavaScript's %, so -0.25 % 1 is -0.25        104/105, the fold
  BufWr's phase rule removed                               104/105, that refusal
  the per class rates ignored                              103/105, GrainBuf.kr
                                                           and BufFrames.ar

Then `.sin` and `.cos` for the ring's wet and dry, 106 ok, and two more:

  their opcodes swapped                                    105/106, that check
  their folds swapped                                      105/106, that check

Then DelayC, LocalIn and LocalOut for the ring's echo (its Dub patch),
114 ok, and four more sabotaged copies:

  LocalIn's default not wrapped to its channel count       112/114, both LocalIn
  LocalIn's default written as an ordinary input           112/114, both LocalIn
  LocalOut's audio rate rule removed                       112/114, both refusals
  DelayC's first input rate rule removed                   113/114, that refusal

⚠️ WHAT NONE OF THEM CAN SEE: whether scsynth agrees. Opcode 0 for `*` is a
well formed file that loads and plays, louder; only the page's own meter
under a changed `amp` can tell a multiply from an add
(`research/supercollider-browser-2026-09.md` §9.3b measured exactly that).

<a id="test-pan2"></a>

## sclang-lite-test.mjs, Pan2 on its own program

No preset pans since the Hat went (2026-09-30), so Pan2 is graded on a
program of its own rather than dropped with it.

<a id="test-unread-output"></a>

## sclang-lite-test.mjs, an unread output keeps its wire

🔴 READ IN SC_GraphDef.cpp's DoBufferColoring, THEN MEASURED ON THE ENGINE,
2026-09-30: an audio output nobody reads is allocated with a count of 0
and never goes back on the free stack, so it holds its buffer to the end.

<a id="test-named-controls"></a>

## sclang-lite-test.mjs, named controls

── named controls, the knobs under the text ──────────────────────────────────

🔴 WHAT sclang BUILDS, READ IN `NamedControl.new` (GraphBuilder.sc) AND
`Control.init` / `LagControl.kr` (InOut.sc) at 19954900: one Control block
per name whose special index is its slot in the value array, and a
LagControl, with the lag as its input, for any lag that is a plain number.

<a id="test-pad-knobs"></a>

## sclang-lite-test.mjs, the Pad's knobs

Every preset has a knob since 2026-09-30 (*"add knobs to all patches what
mak sense"*), so the Pad is read by name: rel first, then cutoff and detune.

<a id="test-knob-specs"></a>

## sclang-lite-test.mjs, every knob has a spec

⚠️ AND EVERY KNOB IN EVERY PRESET HAS A SPEC WRITTEN IN THE CODE, because
an argument's or a bare control's range is a guess.

<a id="test-grain-ugens"></a>

## sclang-lite-test.mjs, the grain ring's UGens

── the grain ring's UGens, added 2026-10-13 ─────────────────────────────────

For the grain ring, /granulator/grains/. Every expected number below is read off the
class files of supercollider develop 1995490 (GrainUGens.sc, BufIO.sc,
Trig.sc, Osc.sc, Noise.sc, InOut.sc, InfoUGens.sc), not off this compiler.

<a id="test-probe"></a>

## sclang-lite-test.mjs, the probe's graph

The probe's graph, built block by block with synthdef.mjs on 2026-10-13
and measured on the tab's scsynth (20.0 replies a second at dens 20),
against the same graph written as text. Byte for byte.

<a id="test-echo"></a>

## sclang-lite-test.mjs, the ring's echo

The ring's echo, 2026-10-13: Delay.sc and InOut.sc at develop 1995490.
LocalIn.ar(2) is one block, two outputs, and `argDefault.wrapExtend(2)`
as its inputs, so two zeros; LocalOut is one block with no output whose
inputs are the channels; DelayC is in, maxdelaytime, delaytime.

<a id="range"></a>

## sclang-lite.mjs, ranged (`.range` and `.exprange`)

Added 2026-10-15 for slice 2 of `plans/plan-text-to-code.md`, where `.range` and
`.exprange` were the commonest gap (3 of 8 ordinary programs). Read off
`SCClassLibrary/Common/Audio/UGen.sc` on supercollider develop `d877096`:

    range { arg lo = 0.0, hi = 1.0;
        if (this.signalRange == \bipolar) { mul = (hi - lo) * 0.5; add = mul + lo }
        { mul = (hi - lo); add = lo };
        ^MulAdd(this, mul, add) }
    exprange { arg lo = 0.01, hi = 1.0;
        ^if (this.signalRange == \bipolar) { this.linexp(-1, 1, lo, hi, nil) }
        { this.linexp(0, 1, lo, hi, nil) } }

`signalRange` is `\bipolar` on `UGen` and overridden to `\unipolar` by, among
the subset's classes, only `Impulse` (Osc.sc) and `Dust` (Noise.sc).
`BinaryOpUGen` and `MulAdd` do not override it, so `(Impulse.kr(2) * 2).range`
maps from -1..1 in real SuperCollider too, and so it does here. `Phasor` and
`EnvGen` run 0..1 and still say bipolar; that is sclang's answer and this file
keeps it. `linexp` with `clip: nil` is a bare `LinExp` UGen (`prune` returns the
receiver), which both the vendored wasm scsynth and the Pi's scsynth carry
(`strings scsynth-nrt.wasm | grep LinExp`). The MulAdd is written as two
BinaryOpUGens, as `madd` already is in this file, so `.range(200, 800)` on a
SinOsc is the same bytes as `mul: 300, add: 500`, which the test asserts.

<a id="ugens-layers"></a>

## sclang-lite.mjs, UGENS, the cast's layers

Added 2026-10-18 for `plans/plan-cast-reinterpret.md` §2.3. Read off the class files of
supercollider tag `Version-3.13.0` (the container's scsynth is 3.13.0), not develop:
`Filter.sc` (Ringz, BPF, Lag, LeakDC), `Delays.sc` (CombC, CombL; `Delay.sc` does not exist at
that tag), `FreeVerb.sc`, `PitchShift.sc`, `Compander.sc` (Limiter is `Normalizer`'s subclass),
`Noise.sc` (LFNoise2), `Osc.sc` (VarSaw). The server's input order was checked against the
plugins at the same tag: `Ringz_next` reads `ZIN(0)` in, `ZIN0(1)` freq, `ZIN0(2)` decayTime;
`PitchShift_Ctor` reads windowSize at 1 and pitchRatio at 2; `FreeVerb2_next` reads IN(0), IN(1),
then mix at 2; `Limiter_Ctor` reads dur at 2. None of them is `CantAlias`, so `wirePeak` needs
no `noAlias` for any (`grep CantAlias` over DelayUGens.cpp, FilterUGens.cpp, ReverbUGens.cpp).

What each row carries that is not obvious:
- `LeakDC.kr`'s coef defaults to 0.9 and `.ar`'s to 0.995, so the row has `argsKr`.
- `Lag.ar` and `.kr` return `in.madd(mul, add)` when `in.rate == \scalar` or `lagTime == 0`
  (`scalarPass`). Here it is applied per channel after expansion; sclang tests the whole
  argument, so an array mixing numbers and signals would differ. Nothing in the cast does that.
- FreeVerb, FreeVerb2, PitchShift and Limiter have only `*ar`. Limiter has no `mul` or `add`.
- FreeVerb2 is a `MultiOutUGen` with `checkNInputs(2)`: both its inputs audio rate at `.ar`
  (`audio2`). FreeVerb and PitchShift check the first input's rate (`same`).
- CombC and CombL `.ar` call `in.asAudioRateInput(this)`, which in sclang wraps a control rate
  input in K2A. This subset refuses it instead (`first: 'audio'`), as DelayC already does.

Refused: **Klank**. Its first argument is a `Ref` to a specification array
(`` `[freqs, amps, rings] ``), and this subset has no backquote and no arrays of arrays, so it
does not fit. `Mix(Ringz.ar(in, [f1, f2, ...], decay))` is the same bank as 16 blocks and
compiles today (16 Ringz measured at 0.2 to 0.9 % of the render budget over idle in the browser).

The output bus needed nothing: `compile(src, { bus })` already writes `Out.ar(bus, ...)`. With
`inputChannels: 4` the first private audio bus is 6 (2 outputs, then 4 inputs).

<a id="test-layers"></a>

## sclang-layers-test.mjs, the layers graded by sound

Measured 2026-10-18 on an M2 Pro. Each UGen is played in the vendored wasm scsynth (headless
Chrome, the boot's analyser at 32768 frames) and in the container image's native scsynth 3.13
(`grains-local`, NRT, a float WAV out), and judged on what it sounds like: Ringz rings at 439.5 Hz
after impulses, BPF's band stands 34 dB over the rest, Lag takes 18.6 dB more off 2 to 12 kHz than
the raw Pulse, LeakDC brings a mean of 0.5 to 0.0000, CombC and CombL put 41 dB more in the 500 Hz
harmonics than between them, FreeVerb and FreeVerb2 make 88 to 95 % of samples sound after a
1 Hz click, PitchShift 1.5 moves 440 Hz to 660.6 Hz, Limiter holds a peak of 4 at 0.500, LFNoise2
sits 30 dB under LFNoise1 above 1 kHz, VarSaw width 0.5 has no even harmonics (115 dB under the
3rd). The two engines agree to within 2 dB on every one.

Negative controls, each of which fails the same judge: two arguments swapped in `UGENS` (by
mutating the row for one compile), the control rate version, and the program without the block.
Two swaps (Lag's in and lagTime, LeakDC's in and coef) are refused by the compiler before they
reach an engine, which is counted as caught. The CombC and CombL control rate versions still put
14.9 dB in the harmonics, so the comb threshold is 25 dB, not 10: a 10 dB threshold let them pass
on the first run. A class the engine lacks (Ringz renamed Ringy) answers
`/fail /d_recv UGen 'Ringy' not installed.`, so the `/done` check can fail too.
