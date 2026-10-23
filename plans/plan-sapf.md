# plan-sapf: James McCartney's SAPF (Sound As Pure Form), is it a match for positron?

Asked 2026-10-23: *"Investigate James McCartney's code (SAPF, Sound As Pure Form,
github.com/lfnoise/sapf). Is it a match for positron?"*

## Verdict

**A partial match, as a browser page and as an idea. Not as a cast engine.**

- **Yes, as a concept page under `/code/`** running the real interpreter in an AudioWorklet.
  The language core is portable C++17: with a three line stub header, **22 of 38 source files
  of the cross-platform fork compile under emscripten as they are** (MEASURED, syntax only),
  including the parser, the VM, the lazy lists, the math ops and every filter and delay UGen.
  What blocks is the edge: FFTW, libsndfile, RtAudio, RtMidi and the libedit REPL. Two to four
  days to a first sound, with real unknowns (wasm size, exceptions, speed).
- **Yes, as an offline renderer in a Linux container**, which is MEASURED working: the fork
  builds on `debian:bookworm` (the cast's base) after two fixes, and renders 60 s of stereo in
  0.20 to 2.67 s to a float WAV with no sound card. That fits the cast's planned pre-render
  path (`plans/plan-cast-cheaper.md`) if the owner wants SAPF textures on air. It does **not**
  fit the live cast, because SAPF has no server, no node tree and no `/n_set`: a playing sound
  is a lazy value, not a node a planner can move for a week.
- **Yes, as a design idea**, but not inside `sclang-lite.mjs`, whose job is to be a faithful
  subset of real sclang graded by real scsynth. The ideas worth borrowing (APL style
  auto-mapping with the `@` each operator, `+/` and `+\` reduce and scan, the `4k 4m 386c 5/3`
  number suffixes, forms with inheritance that expand into a stream of variations) belong on
  their own page.

Recommendation at the end.

## What SAPF is

- An interpreter (a REPL in a terminal) for a postfix, mostly functional, stack based language,
  inspired by APL, Joy, Haskell, Nyquist and SuperCollider (README.txt, "WHY").
- **Types**: Real (64 bit double), String, List, Form (a dictionary with inheritance), Function,
  Ref (the only mutable type). Lists are lazy and may be infinite. Two kinds: value lists
  ("streams", `[ ]`) and numeric lists ("signals", `#[ ]`). **Audio is a signal, a lazy list of
  samples.**
- **Stack model**: words execute left to right; a function value pops its named arguments.
  Unlike Forth, a function body runs on an empty stack and sees only its named arguments.
  Lexical bindings with `= x`, no mutable locals.
- **Auto-mapping**: most scalar operators map over lists, including infinite ones.
  `0 4 to` is `[0 1 2 3 4]`, `[0 2] 4 to` is `[[0 1 2 3 4][2 3 4]]`. The `@` "each" operator
  maps at depth and `@1 @2` give outer products. Math operators get `/` (reduce), `\` (scan) and
  `^` (pairwise) suffixes: `[1 2 3 4] +/` is 10, `+\` is `[1 3 6 10]`.
- **Multichannel expansion**: UGens auto-map over streams but not signals, so `[300 301] 0 saw`
  is two channels, as in SuperCollider (McCartney wrote SuperCollider).
- **How sound is produced**: its own engine, no server. `play` hands the lazy signal to the
  output, and the CoreAudio render callback **pulls the lazy list directly**:
  `in[i].fill(player->th, n, buf, 1)` in `src/Play.cpp:138`, inside `fillBufferList`, with
  `catch (std::bad_alloc&)` and `"exception in real time. stopping player."` around it. So list
  evaluation and allocation happen on the audio thread. Default rate 96 kHz
  (`kDefaultSampleRate`, `include/VM.hpp:64`), block 128 (`kDefaultControlBlockSize`), samples
  are doubles. `>sf` writes any finite signal to a file as fast as the CPU allows.
- **Time and events**: there is no clock or scheduler as sclang has. Time is a sample position
  in a lazy list. Events are made by `impulse` and `iseq` ("pulls one value from the input for
  each trigger"), `steps` ("values durs rate"), and `ola` ("overlap add. This is the basic
  operator for polyphony"), which plays a stream of sounds at given hops. `go` starts a
  function on a new pthread (`src/CoreOps.cpp:1009`), `sleep` is `usleep`.
- **UGens** (original): 616 built in words in total. Oscillators: `osc oscp sosc par tri
  square saw pulse vsaw ssaw blip dsf1 dsf3 lftri lfsaw lfpulse lfpulseb lfsquare impulse
  smoothsaw smoothsawpwm vosim sinosc tsinosc sinoscfb sinoscm klang`. Filters: `lag lag2 lag3
  lagud lpf1 hpf1 lpf hpf lpf2 hpf2 rlpf rhpf ... bpf bsf apf peq lsf hsf resonz ringz formlet
  klank leakdc leaky decay decay2 hilbert ampf`. Delays: `delayn delayl delayc flange flangep
  combn combl combc lpcombc alpasn alpasl alpasc fdn`. Plus noise and random families in
  `RandomOps.cpp`, FFT and spectrogram ops, MIDI in, mouse in.

### Five example programs, verbatim from `sapf-examples.txt`

```
;; play a sine wave at 800 Hz and initial phase of zero.  (README)
800 0 sinosc .3 * play
```

```
;;;; analog bubbles
((.4 0 lfsaw) 2 * ([8 7.23] 0 lfsaw) .25 * 9.667 + + exp2) 0 sinosc .04 * .2 0 4 combn play
```

```
;;;; rain
\[2 .2 dust2 .25 decay .05 lfnoise3 8h 13k biexp .18 bpf .08 lfnoise3 pan2 .08 .01 apverb6] 16 X +/ .01 2X pink + .005 2X brown + play
```

```
;;;; clapping music - steve reich
([1 1 1 0 1 1 0 1 0 1 1 0] 12 ncyc [(13 0s) (0 -12 to)] rot @ $/ @) (5.6 0 impulse) iseq .1m 8c decay2 2 * white [1k 8h] .2 bpf [-1 1] 1m itd +/ play
```

```
;; hell is busy, as a form: a base sound, then a texture made by overriding fields with streams
{ :freq 1k  :rate 4  :duty .3  :db -28  :dur 4
  :out \o[ (o.freq 0 sinosc) (o.rate 0 o.duty lfpulse) 4m lag (o.db dbamp) * * rpan2 (o.dur quadenv) * ]
} = busytone
busytone.out play
{ busytone  :freq 4h 2k rands @  :rate 1 11 rands @  :duty 0 .7 rands @ }.out .5 1 2 ola play
```

The last one is the idea closest to positron: a patch as a form, and a scene as the same form
with some fields replaced by streams, expanded by `@` into a stream of variations and played by
`ola`.

## The repository, licence and portability (MEASURED unless marked)

| fact | value | evidence |
| --- | --- | --- |
| licence | **GPL-3.0** | `COPYING`, `gh api repos/lfnoise/sapf` `license.spdx_id` |
| created, last push | 2025-01-29, 2025-10-15 | GitHub API; last commit `ab1b15e7` "Add CONTRIBUTING.md", version 0.1.22 |
| stars, forks, open issues | 973, 54, 12 | GitHub API, 2026-10-23 |
| size | 43,369 lines C++ (`src/` 37,704 including one `.mm`, `include/` 5,665), plus `libmanta` 3,592; prelude 1,125 lines of SAPF, examples 2,218 lines | `wc -l` |
| build | CMake (added by PR, merged 2025-10-15) and an Xcode project | `CMakeLists.txt`, `Makefile` |
| platform | **macOS only, upstream** | see below |

**Upstream is bound to Apple frameworks**, in its own `CMakeLists.txt`: `-framework Accelerate
AudioToolbox AudioUnit Carbon Cocoa CoreFoundation CoreMidi CoreServices`. Includes:
`<Accelerate/Accelerate.h>` in `dsp.hpp`, `DelayUGens.cpp`, `FilterUGens.cpp`, `MathOps.cpp`,
`OscilUGens.cpp`, `Spectrogram.cpp`, `UGen.cpp`; `<AudioToolbox/AudioToolbox.h>` in `Play.cpp`
(an `'auou' 'def ' 'appl'` output AudioUnit with a render callback);
`<AudioToolbox/ExtendedAudioFile.h>` in `SoundFiles.hpp`; `<dispatch/dispatch.h>` and
`CFRunLoopRun()` in `main.cpp`; `<mach/mach_time.h>` in `elapsedTime.cpp` and `Midi.cpp`;
`<Carbon/Carbon.h>` in `UGen.cpp` (mouse); `makeImage.mm` is Objective-C. vDSP calls: 20 lines in
`dsp.cpp`, 49 in `MathOps.cpp`. Open upstream issues say the same:
[#3 Find cross-platform alternative for Accelerate/vDSP framework](https://github.com/lfnoise/sapf/issues/3)
and [#1 Replace AudioUnit playback with RtAudio](https://github.com/lfnoise/sapf/issues/1).

**The port exists, and it is a fork, not upstream**:
[ahihi/sapf](https://github.com/ahihi/sapf), "Sound As Pure Form, cross-platform edition",
75 stars, last push 2026-05-15, Linux, macOS and Windows. It replaces Accelerate with xsimd
and Eigen plus FFTW, AudioToolbox with RtAudio and libsndfile, CoreMIDI with RtMidi, Cocoa
images with libjpeg-turbo, and adds OSC (oscpack). Meson build, doctest tests, Nix flake,
CI on Debian. 46,363 lines in `src/` and `include/`. Upstream
[#12 Support for Linux?](https://github.com/lfnoise/sapf/issues/12) was closed by pointing at it;
one user there reports it works on Ubuntu, one says *"as long as you're not using Jack on
linux"*, one could not get it working with PipeWire (READ, not measured). The fork's own
[#39 segfault on large FFTs](https://github.com/ahihi/sapf/issues/39) is open.

**No WebAssembly port was found.** Searched the 54 forks by name and description and GitHub
repositories for "sapf" and "sound as pure form wasm": the ecosystem is editor plugins
(`sapf.nvim`, `sapf.el`, `vscode-sapf`, `sapf-lsp`) and a Max external
(`shakfu/sapf-max`). Code search needs a login and was not run, so a wasm build in some
unrelated repository is not ruled out.

## What was measured, in containers (OrbStack, Docker 28.5.2, aarch64 host, nothing native)

### Linux build of ahihi/sapf `2a6aace7` on `debian:bookworm` (the cast's grains base)

1. **Failed**: `meson.build:1:0: ERROR: Meson version is 1.0.1 but project requires >=1.1`.
   Bookworm's meson is too old. Fixed with `pip install --break-system-packages "meson>=1.1"`.
2. **Failed**: bookworm's packaged `libxsimd-dev` is older than the fork's code:
   `../src/MathOps.cpp:878:49: error: no matching function for call to 'to_float(long int)'`,
   then `no match for 'operator==' (operand types are 'long int' and 'const xsimd::batch<long int>')`.
   Fixed with `meson setup --buildtype release --force-fallback-for=xsimd build`, which uses the
   fork's own `subprojects/xsimd.wrap` (xsimd 13.2.0).
3. **Built**: `meson compile` 10 s wall, 55 s CPU, g++ 12.2.0. `build/sapf` is **3,750,376
   bytes**, 42 shared libraries by `ldd` (libedit, fftw3, rtaudio 6, sndfile, jpeg, rtmidi, and
   through them jack, pulse, alsa, X11, mp3lame, opus).
4. **REPL answers as documented**: `2 3 *` gives `6`, `0 4 to` gives `[0 1 2 3 4]`,
   `[0 2] 4 to` gives `[[0 1 2 3 4] [2 3 4]]`. Version prints `0.1.21`.
5. **Offline renders**, `sapf -r 44100 -p sapf-prelude.txt`, each program ending
   `2646000 N "<name>" >sf` (60 s at 44.1 kHz), output 32 bit float WAV, checked in node:

| program | channels | render wall | user CPU | max RSS | peak dBFS | RMS dBFS | non finite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `800 0 sinosc .3 *` | 1 | 0.10 s | 0.04 s | 30 MB | -10.5 | -13.5 | 0 |
| analog bubbles | 2 | 0.20 s | 0.14 s | 30 MB | -21.0 | -31.0 | 0 |
| drone (second form) | 2 | 0.26 s | 0.20 s | 31 MB | -0.3 | -15.3 | 0 |
| rain (16 voices, reverb) | 2 | 2.67 s | 2.61 s | 35 MB | -30.1 | -49.3 | 0 |

   The sine's -10.5 dBFS peak is exactly 20 log10 0.3, so the numbers are real audio and not a
   header with silence. Rain, the heaviest, is **22x real time on one core of an Apple M2 Pro
   under arm64 Linux**. A Cloudflare `standard-2` vCPU (amd64) will be slower by an unmeasured
   factor; `plan-plaits-on-pi.md` measured M2 to A72 at 3.3x for another DSP wasm, which is the
   only nearby number.
6. **`play` in the container**: `ALSA lib ... Invalid CTL default`, then `No audio devices
   found!`. Expected with no device. RtAudio was compiled with `-D__UNIX_JACK__`, so it could
   in principle open the cast's `jackd`; **not tried**.

### wasm probe: each file of the fork through `em++ -fsyntax-only` (emsdk image, emcc 6.0.10)

Flags: `-std=c++17 -msimd128 -DSAMPLE_IS_DOUBLE=1`, xsimd 13.2.0 and Eigen 3.4.0 headers.

- **First pass, `USE_LIBEDIT=0`**: almost every file stops on one line,
  `'readline/history.h' file not found`, because `include/VM.hpp:29-32` includes the line
  editor and `VM.hpp` is included by everything. 7 files clean.
- **Second pass, with three stub lines** for `histedit.h` (`EditLine`, `History`, `HistEvent`
  typedefs): **22 of 38 files compile clean**, among them `Parser`, `VM`'s types, `Object`,
  `Opcode`, `CoreOps`, `MathOps`, `MathFuns`, `MultichannelExpansion`, `RandomOps`, `SetOps`,
  `UGen`, `FilterUGens`, `DelayUGens`, `RCObj`, `symbol`, `primes`, `ZArr`, `Types`.
  The other 16, each by its first error:

| blocker | files | what it would take in a browser |
| --- | --- | --- |
| `fftw3.h` | `dsp.cpp`, `OscilUGens.cpp`, `StreamOps.cpp`, `Spectrogram.cpp` | FFTW builds under emscripten (READ, common), or swap to a small FFT behind `dsp.hpp` |
| `sndfile.h` | `SoundFiles.cpp`, `SndfileSoundFile.cpp`, `AudioToolboxSoundFile.cpp` | stub; a page renders to memory, not to files |
| `RtAudio.h` | `Play.cpp`, `Buffers.cpp`, `AsyncAudioFileWriter.cpp` | replace with a `fill(n)` export the AudioWorklet calls |
| `RtMidi.h` | `Midi.cpp`, `PortableMidiClient.cpp` | stub, or feed Web MIDI in from JS |
| `jpeglib.h` | `makeImage.cpp` | drop (spectrogram pictures) |
| libedit calls | `VM.cpp` (20 errors: `EL_PROMPT`, `history_init`), `main.cpp` | drop the REPL; the page is the editor |

Nothing was linked and nothing ran as wasm. The probe says the **core is portable**; it does not
say how big or how fast the wasm is.

## Positron's side, for comparison (READ)

- `demo/shell/sclang-lite.mjs` (1,031 lines): one sclang function literal compiled to SynthDef
  bytes in the tab and in the cast container. Its header: *"Not sclang. Anything unknown is an
  error with a line and column; real scsynth on /collide/ grades the sound."* 36 UGens, each read
  from SuperCollider `Version-3.13.0`. Its value is fidelity to real sclang.
- `demo/shell/scsynth.mjs`: real scsynth as the vendored SuperSonic wasm
  (`demo/shell/vendor/scsynth-nrt.wasm`, 1,701,983 bytes, GPL licence beside it), in an
  AudioWorklet, OSC in. Single page shared engine.
- The cast (`positron-cast` skill sections 1 to 3): node + ffmpeg + scsynth 3.13 + jackd dummy
  on `node:22-bookworm-slim`, 1 vCPU. The planner `life.mjs` moves long lived scsynth nodes with
  `/n_set` for days; JACK is the clock. `plan-cast-cheaper.md` proposes pre-rendering hours to R2
  and a `lite` playout.
- `/code/` already holds `faust`, `collide`, `wish`, `plaits` and `piano`: the precedent for
  "a sound language compiled or interpreted in the tab" is set.

## The three options

### (a) The real interpreter in the browser, as wasm

- **What blocks**: not Apple any more (the fork removed it). The libedit include in `VM.hpp`,
  FFTW, libsndfile, RtAudio, RtMidi, libjpeg, and the threads: `go` is `pthread_create`
  (`CoreOps.cpp:1009`), playback has a watchdog thread and a mutex. In an AudioWorklet without
  cross-origin isolation there are no pthreads, so `go` and `sleep` become refused words.
- **Shape**: one wasm in an AudioWorklet. JS sends source text; the C++ evaluates it and keeps
  the resulting lazy signal; `process()` calls an exported `fill(128)` that pulls exactly as
  `Play.cpp:138` does, converting double to float. Single threaded, which is how SAPF already
  evaluates on the audio thread.
- **Effort**: 2 to 4 days to a first sound on a page (stubs and a build script: half a day;
  FFTW or a replacement: half a day to a day; the worklet glue and the page: a day; the
  harness: half a day). Built only inside the emsdk container.
- **Risks**: C++ exceptions are the error path in the real time pull (`catch (int err)`), and
  wasm exceptions cost size and speed. Doubles everywhere. A lazy list that grows without bound
  grows the wasm heap on the audio thread. Wasm size unknown (the native aarch64 binary is
  3.75 MB with libraries dynamic). The heaviest examples may not hold 48 kHz in a phone's
  worklet. GPL-3, the same family as the scsynth wasm already vendored, so it goes under
  `demo/<group>/<slug>/vendor/` with its licence and is listed by name in `build.mjs`
  (LAYOUT.md rule 6).

### (b) In the Linux cast container

- **Measured feasible** for offline rendering (above). Needs, in the image: the two fixes,
  an amd64 build (`--platform linux/amd64`, and drop the fork's `-march=native` from
  `meson.build:191`, or the binary will not run on whatever CPU Cloudflare gives), and about 40
  runtime libraries (or a static build, not tried).
- **What it can be**: a renderer of finite pieces to WAV, driven from node by piping text on
  stdin and reading the file back, which slots into the pre-render path of
  `plan-cast-cheaper.md`.
- **What it cannot be**: a replacement for scsynth in the live cast. The planner moves nodes;
  SAPF has no nodes. A live SAPF in the chain would be a third process on JACK with a REPL, and
  its JACK backend is reported broken on Linux by one user (READ).
- **Effort**: half a day to a Dockerfile stage and a node wrapper; a day with a test. **Risk**:
  low technically, but it is an engine nobody asked the cast to have, and the owner's sound
  rules (skill section 5) would have to be met by programs in a second language.

### (c) The ideas without the code

- Worth borrowing: auto-mapping over lists with `@` at depth and `@1 @2` outer products; the
  `/ \ ^` reduce, scan and pairwise suffixes; the number suffixes (`4k`, `4m`, `386c`, `5/3`,
  `2pi`); forms with inheritance where a scene is the patch with fields replaced by streams
  (the busytone example); `ola` as "polyphony is overlap add over a stream of sounds".
- **Not into `sclang-lite.mjs`**: it is valuable because it refuses anything real sclang would
  not accept, and real scsynth grades it. SAPF syntax there would make it neither.
- **As its own small page**: a postfix subset compiled to SynthDef bytes through
  `demo/shell/synthdef.mjs` and played on the existing wasm scsynth. That buys the stack syntax
  and multichannel expansion only. Lazy infinite lists, `ola` and `steps` do not map onto a
  fixed SynthDef graph, and those are what make SAPF itself. Effort 1 to 2 days, and the
  result is "SAPF flavoured sclang", which is less than (a).

## Measured versus read

- MEASURED today: the upstream file layout, includes, frameworks, line counts, licence and
  GitHub numbers; the fork's Linux build failures and fix; the binary size and libraries; the
  REPL answers; four 60 s renders with timings and levels; the emscripten probe per file.
- READ, not measured: that the fork runs on Windows and macOS; the PipeWire and JACK reports;
  that FFTW builds under emscripten; everything about wasm size, speed and exceptions; speed on
  Cloudflare amd64.

## What could not be settled, and what would settle it

| open question | what settles it |
| --- | --- |
| wasm size and speed | link a node target in the emsdk container with the stubs and FFTW, render the same four programs, time them and compare to the Linux WAVs (sine and bubbles have no randomness, so they should match closely) |
| exceptions in wasm | the same build with `-fwasm-exceptions`, then a program that throws mid pull (`1 0 /` style errors) |
| does it hold real time in a worklet on a phone | the page, `rain` on an iPhone mini |
| SAPF live on the cast's JACK | start `sapf` in the grains image beside `jackd -d dummy` and `play`; listen to `SuperCollider`-style ports with `jack_lsp` |
| amd64 speed | the same four renders in `--platform linux/amd64` on a Cloudflare `standard-2` |
| is upstream alive | upstream's last push is 2025-10-15; the fork's 2026-05-15. Watch both before vendoring either |

## Recommendation

1. **Do (a), in two steps, if the owner wants SAPF on the site.** First the cheapest proof:
   the wasm node build of the fork's core in the emsdk container, rendering the four programs
   above and compared sample by sample with the Linux WAVs from this plan (about a day). If
   size and speed are acceptable, a `/code/<slug>/` page with an editor, the examples as
   presets, and the interpreter in an AudioWorklet (one or two more days). It is the only
   option that keeps what makes SAPF itself: lazy infinite lists and auto-mapping, playing.
2. **Do not put SAPF in the live cast.** Keep (b) on the shelf as a texture renderer for the
   pre-render path, and only if a SAPF sound is asked for on air.
3. **Do not change `sclang-lite.mjs`.** The forms-as-scenes idea is worth a line in
   `plan-cast-patches-scenes.md` when that plan is next opened.

Cost of this investigation: about 40 minutes, four container builds (no native compile on the
Mac), no browser started, no connection to any station.
