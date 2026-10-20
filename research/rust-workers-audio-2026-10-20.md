# Rust Workers, the Rust audio landscape, and edgecast (2026-10-20)

Asked: *"Explore https://blog.cloudflare.com/rust-workers-emscripten-target/. Could rust worker be fit our edgecast or
any cloud audio processing? Rust audio landscape? Sc / faust in rust land?"*

Every fact carries a tag. **READ** means it was read today in the source linked beside it (a page, a README, a
repository's code, a crates.io record). **MEASURED** means a number this repository measured earlier and cites from
`plans/plan-cast-lightweight.md`. **INFERRED** means reasoning from those, not tried. Nothing was compiled or run for
this note: there is no Rust toolchain and no emsdk on this machine (`which cargo rustc emcc` finds none, checked
today), and the managed laptop kills locally compiled binaries, so any build belongs on the M1 after asking.

## 0. The answer in five lines

1. The post makes Rust on Workers able to link C and C++ in one module through Emscripten. It does not change any
   limit edgecast hits: still one thread, no runtime wasm compile, 128 MB per isolate. It is an experimental preview.
2. Edgecast does not need it. The engine already runs, LAME already exists as a wasm file that accepts a precompiled
   module, and the expensive part of a Rust move would be the engine, not the codecs.
3. The news that matters is a different one: **plyphon** (nannou-org, 0.2.0, 2026-09-26), a pure Rust rewrite of
   scsynth's core that reads SCgf SynthDef bytes, builds for `wasm32-unknown-unknown`, and registers all 36 UGens
   sclang-lite knows. It turns "a Rust engine" from weeks of writing DSP into days of wiring plus a parity test.
4. It would buy little CPU (estimate 0 to 25 % of 0.97 ms a frame) and nothing on the bill, because a Durable Object is
   billed at 128 MB of duration whatever it uses. The 73 MB of wasm memory is our own configuration and can be cut
   without Rust.
5. Recommendation: stay on the Emscripten scsynth for the station mode and Üle Heli. Do the station's MP3 with
   `wasm-media-encoders` (LAME) and a decoder that takes a precompiled module. Keep plyphon as a dated experiment for
   after, run as a side by side against the same SynthDefs, and decide on a measured null test, not on this note.

## 1. What the post announces, and what it means for us

### What it says (READ, [blog post](https://blog.cloudflare.com/rust-workers-emscripten-target/), dated 2026-09-28)

- First class support for the `wasm32-unknown-emscripten` Rust target in wasm-bindgen and in Workers. Emscripten
  drives the build and supplies its libc, file system and companion JS, and wasm-bindgen emits a smaller form of its
  bindings that Emscripten's library system includes. Quoted: *"C++ Emscripten code driven by Emscripten's compiler
  can be built against static wasm-bindgen Rust code"*.
- What it enables: Rust crates that assume a Unix libc (`target_family = unix`), Tokio, through JSPI
  (JavaScript Promise Integration) and a new `LocalEventLoop`; TCP, UDP and Unix sockets through `-sNODERAWSOCKETS`
  over the Node compatibility APIs; file system calls through `-sNODERAWFS`; timers.
- Maturity: *"experimental preview"*, *"While still in pre-release"*. No version numbers, no size, memory, CPU or
  startup numbers, and nothing about threads, SharedArrayBuffer, SIMD or audio.
- Demonstration: a Rust Minecraft server ([Pumpkin](https://pumpkinmc.org/)) in a Durable Object with TCP ingress,
  built *"over a single weekend"* ([rust-workers-minecraft](https://github.com/danlapid/rust-workers-minecraft)). No
  CPU or memory numbers given.

### The tooling behind it (READ)

- [workers-rs PR 1061 "worker-build --emscripten"](https://github.com/cloudflare/workers-rs/pull/1061), opened
  2026-09-11, merged 2026-09-25, released in workers-rs v0.8.7 the same day (GitHub API, read today). Its caveats:
  *single thread per invocation*, blocking calls need JSPI, a pinned and patched emsdk 6.0.10 that worker-build
  installs itself.
- The examples ([emscripten](https://github.com/cloudflare/workers-rs/tree/main/examples/emscripten),
  [emscripten-tokio](https://github.com/cloudflare/workers-rs/tree/main/examples/emscripten-tokio),
  [emscripten-tcp](https://github.com/cloudflare/workers-rs/tree/main/examples/emscripten-tcp), plus
  `emscripten-incoming-tcp`) pin the Rust **beta** channel, set `compatibility_flags = ["new_module_registry"]`
  (so the glue gets `import.meta.url`), and build a `bin` crate, not a `cdylib`: rustc calls `emcc` as the linker and
  `emcc` runs wasm-bindgen after the link.
- The flags worker-build passes (READ in `worker-build/src/emscripten.rs`): `-sWASM_BINDGEN`,
  `-sMODULARIZE=instance`, `-sEXPORT_ES6`, `-sSOURCE_PHASE_IMPORTS`, `-sENVIRONMENT=node`, `-sNODERAWSOCKETS`,
  `-sALLOW_MEMORY_GROWTH=1`, `-sASSERTIONS=0`, and `EMCC_CFLAGS = -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0`. The
  last one is the C and C++ side: C sources a crate compiles (through the `cc` crate) are built by `emcc` with these
  flags and land in the same module. `-sSOURCE_PHASE_IMPORTS` is the wasm imported as a module, which is how it obeys
  the no runtime compile rule.
- [wasm-bindgen's Emscripten page](https://wasm-bindgen.github.io/wasm-bindgen/reference/emscripten.html): *"Emscripten
  support is newer than the rest of wasm-bindgen and is still being smoothed out; flags and output shape may still
  change."* The reverse route is documented too: *"build a staticlib with cargo, then let emcc drive the link together
  with C/C++ sources"*. Panic unwinding across the boundary is not supported yet.

### The platform limits, unchanged (READ)

| limit | value | source |
| --- | --- | --- |
| threads | *"Threading is not possible in Workers. Each Worker runs in a single thread"* | [Workers WebAssembly](https://developers.cloudflare.com/workers/runtime-apis/webassembly/), updated 2026-04-23 |
| runtime compile | *"WebAssembly.instantiate() only supports pre-compiled modules"* | same |
| SIMD | *"SIMD is supported on Workers"* | same |
| memory | 128 MB per isolate, JS heap and wasm together | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), updated 2026-10-12 |
| bundle | 64 MiB uncompressed, no compressed limit (this page said 10 MB paid not long ago; it reads 64 MiB today) | same |
| startup | 1 s for the global scope | same |

### What it means for edgecast, item by item

- **The engine as Rust.** Possible, but the post is not what makes it possible. A pure Rust engine (plyphon,
  section 3) builds for the ordinary `wasm32-unknown-unknown` target that workers-rs has supported for years; it needs
  no Emscripten. INFERRED.
- **scsynth linked into a Rust worker.** The post makes this the supported route: build scsynth's C++ with `emcc`,
  link a Rust `staticlib` beside it. But we already have scsynth in wasm (SuperSonic) driven from JS, so a Rust shell
  around the same C++ would replace roughly 300 lines of JS (`engine.mjs`, `chain.mjs`, `worker.mjs`) with Rust and
  change nothing about the DSP. INFERRED: no gain worth a week.
- **MP3 codecs.** LAME is C. With the Emscripten target, `mp3lame-encoder` (Rust bindings to LAME, 0.2.5,
  2026-08-20, LGPL-3.0) or `minimp3` (bindings to the C minimp3) could be linked into a Rust worker. That is the one
  concrete thing the post unlocks for us. It is not needed: the encoder already exists as a wasm module Workers
  accept, and the decoder has three routes that need no preview toolchain (section 4, option B). READ for the crates, INFERRED for the fit.
- **Runtime compile.** Not lifted. Everything still has to be precompiled at build time. This is why the Faust
  compiler cannot run live in a Worker (section 3) and why scsynth's interpreted graphs can.
- **Memory.** Not lifted. Same 128 MB. Emscripten's `-sALLOW_MEMORY_GROWTH=1` is the default in worker-build, so a
  Rust build grows its memory rather than reserving it, which is the opposite of how our SuperSonic engine is set up
  (a fixed 73.4 MB at boot, MEASURED).
- **CPU.** Not lifted, and the post quotes no performance. A Rust or C++ DSP loop goes through the same LLVM wasm
  backend either way, so the compiled code should be close (INFERRED). Published Rust against C++ wasm comparisons
  are small programs and disagree in sign; one [2024 thesis](https://www.diva-portal.org/smash/get/diva2:1879948/FULLTEXT01.pdf)
  compares quicksort and matrix multiplication, and blog benchmarks claim a few per cent either way. None is audio.
- **Threads and SharedArrayBuffer.** Not lifted. Single thread per invocation is stated in the PR. Our engine already
  runs with a shared `WebAssembly.Memory` and no threads (MEASURED, plan section 10), so this was never a blocker.
- **Tokio, sockets.** The emscripten-tcp example is the one thing that is closer to us than it looks: the station mode
  needs an outbound TCP source to Väin's Icecast. In JS that is `cloudflare:sockets` and works today. In Rust, workers-rs
  has had a socket API on the plain target too. INFERRED: no reason to move for this.

**For cloud audio processing in general** (INFERRED): a Rust worker on either target is a good fit for work that is
stateless or batch shaped and needs a C library that has no JS form: transcoding a file with a native codec, loudness
measurement (`ebur128` 0.1.10), resampling (`rubato` 5.0.1, 2026-10-01), FFT analysis (`rustfft` 6.4.1, `realfft`).
The Emscripten target is what lets the C ones (LAME, libopus, libsndfile, ffmpeg's decoders) come along. It is not a
better fit than JS plus a vendored wasm for the always on, stateful, one engine per object shape edgecast is.

## 2. The Rust audio landscape, October 2026

Versions, dates and download counts READ from crates.io and GitHub today. "wasm" means the crate is pure Rust and so
builds for `wasm32-unknown-unknown`, unless the row says it needs C. Real time safety is what the project says about
itself.

### Engines, graphs and DSP

| crate | version, date | what it is | wasm | real time | maturity |
| --- | --- | --- | --- | --- | --- |
| [plyphon](https://github.com/nannou-org/plyphon) | 0.2.0, 2026-09-26 | pure Rust scsynth core, SCgf in, OSC optional | yes, `no_std`, web demo runs every example | *"no locks, blocking, heap allocation or I/O on the audio thread"*, lock free rings | 3 stars, created 2026-06-22, *"an early-stage research engine"*, GPL-3.0 |
| [fundsp](https://github.com/SamiPerttu/fundsp) | 0.23.0, 2026-01-07 | graph notation (`>>`, `\|`, `&`, `^`), `Net` for runtime graphs | yes, `no_std` with `alloc` | `allocate()` preallocates before going real time | 1,226 stars, the most used Rust synthesis library, MIT or Apache |
| [knaster](https://github.com/ErikNatanael/knaster) | pushed 2026-10-12 | rewrite of knyst, *"Dynamic graph that can be changed while it's running, similar to SuperCollider"* | `no_std` with `alloc` | sample accurate changes, buffers reused | 11 stars, unpublished churn |
| [knyst](https://github.com/ErikNatanael/knyst) | 0.5.1, 2024-11-25 | the predecessor | | *"must not allocate or wait"* | *"not stable"*, superseded by knaster |
| [glicol](https://github.com/chaosprint/glicol) | 0.13.5, 2024-04-23 | live coding language and `glicol_synth` graph | yes, runs in browsers with AudioWorklet and SharedArrayBuffer, also Bela and VST | GC free | 3,012 stars, *"still highly experimental"*, last push 2025-04-06 |
| [firewheel](https://github.com/BillyDM/Firewheel) | 0.14.0, 2026-09-05 | game audio graph engine | | yes | 316 stars, Apache-2.0 |
| [web-audio-api](https://github.com/orottier/web-audio-api-rs) | 1.7.0, 2026-08-08 | the Web Audio API in Rust, outside a browser | | | 388 stars, MIT |
| [dasp](https://github.com/rustaudio/dasp) | 0.11.0, 2020-05-29 | sample and frame types, conversions | yes, `no_std` | primitives only | stable and old, 1.08 M recent downloads |
| [nih-plug](https://github.com/robbert-vdh/nih-plug) | git only, pushed 2026-09-03 | VST3 and CLAP plugin framework | not a target | yes | 3,001 stars, the standard for Rust plugins; irrelevant to a server |
| [mimium](https://github.com/mimium-org/mimium-rs/) | 4.1.1, 2026-05-07 | a music language with a wasm binding | yes (`mimium-web`) | | research language |

### I/O, decode, encode, resample

| crate | version, date | what it is | wasm | note |
| --- | --- | --- | --- | --- |
| [cpal](https://github.com/RustAudio/cpal) | 0.18.2, 2026-08-16 | audio device I/O, has an AudioWorklet backend on the web | web needs wasm threads | no devices in a Worker, so not used there |
| [rodio](https://github.com/RustAudio/rodio) | 0.23.0, 2026-10-11 | playback on top of cpal | | not for a server |
| [symphonia](https://github.com/pdeljanov/Symphonia) | 0.6.1, 2026-08-13 | pure Rust demuxers and decoders; MP3 *"Excellent"* with gapless, AAC-LC *"Great"*, FLAC, Opus not started | pure Rust, but its README lists WebAssembly as planned, not supported | *"generally +/-15% the performance of FFMpeg"*, 100 % safe Rust, MPL-2.0 |
| [nanomp3](https://github.com/robbie01/nanomp3) | 0.2.0, 2026-09-30 | pure Rust `no_std` MP3 decoder from minimp3, sample accurate seeking, gapless | yes | Apache-2.0, small |
| [minimp3](https://github.com/germangb/minimp3-rs) | 0.6.1, 2025-08-15 | bindings to the C minimp3 | needs C, so the Emscripten target or a wasm clang | |
| [mp3lame-encoder](https://github.com/DoumanAsh/mp3lame-encoder) | 0.2.5, 2026-08-20 | bindings to LAME | needs C | LGPL-3.0 |
| [shine-rs](https://github.com/wshon/shine-rs) | 0.1.5, 2026-09-23 | pure Rust port of the shine MP3 encoder, fixed point, CBR 32 to 320 kbit/s | pure Rust | claims 114 times real time, 14 % behind shine C; shine is known to sound worse than LAME at 128k (INFERRED from shine's design, not listened) |
| [opus](https://github.com/SpaceManiac/opus-rs) | 0.4.0, 2026-08-23 | bindings to libopus | needs C | |
| [opus-rs (restsend)](https://github.com/restsend/opus-rs) | 0.1.39, 2026-10-20 | pure Rust Opus | pure Rust | created 2026-02-28, very young |
| [rubato](https://github.com/HEnquist/rubato) | 5.0.1, 2026-10-01 | resampling, sinc and FFT | yes | mature, 5.4 M recent downloads |
| [hound](https://github.com/ruuda/hound) | 3.5.1, 2023-09-25 | WAV read and write | yes | mature |
| [ebur128](https://crates.io/crates/ebur128) | 0.1.10, 2024-10-26 | EBU R128 loudness | yes | matches the cast's LU measurements in kind |

What stands out (INFERRED from the tables): the **I/O, decode and resample** layer is mature (cpal, symphonia,
rubato, hound). The **synthesis engine** layer is young everywhere: the two projects with stars (glicol, fundsp) are
a live coding toy that stopped in 2025 and a typed graph library with no granular or SuperCollider style UGen set. The
one project shaped exactly like our engine (plyphon) is three months old with three stars.

## 3. SuperCollider and Faust in Rust

### SuperCollider

- **[plyphon](https://github.com/nannou-org/plyphon)** (READ: README, issue 4, code at `9b6aba2`, 2026-09-26). By
  mitchmindtree of nannou. A pure Rust, `#![no_std]`, `#![forbid(unsafe_code)]` rewrite of scsynth's synthesis
  core: `Controller` (control side), `World` (real time side, `World::fill` per block), `Nrt` (frees and events off the
  audio thread), lock free rings between them. The crates: `scgf` (parses SCgf version 1, 2 and 3 and writes them),
  `plyphon-osc` (*"SuperCollider-compatible OSC command front-end"*, the server command set: `/d_recv`, `/s_new`,
  `/g_new`, `/n_set`, `/b_alloc`, `/b_setn`, `/c_set` all appear in its tests), `plyphon-buffers` (async buffer
  sources, so no file system is assumed), `plyphon-cli` (an scsynth compatible server and offline renderer), and
  `rt-alloc` (a port of scsynth's `AllocPool`). About 108,000 lines of Rust.
  - UGens: issue 4 (*"Remaining unimplemented UGens vs. scsynth"*, updated 2026-09-26) says 278 of 403 when written,
    then *"every UGen in section A is now implemented"*; the 19 left out are shared memory, mouse, Ableton Link, Bela
    and test units. The README still says *"~1/3 UGens are yet to be ported"*, so the README is behind the issue.
  - **All 36 UGens sclang-lite knows are registered** (READ: a grep for each name as a quoted string in the plyphon
    sources finds every one: SinOsc, Saw, Pulse, LFSaw, LFTri, LFNoise1, LFNoise2, WhiteNoise, LPF, HPF, RLPF, BPF,
    Pan2, EnvGen, Impulse, Dust, TRand, Phasor, BufFrames, BufDur, In, BufWr, GrainBuf, SendReply, DelayC, LocalIn,
    LocalOut, Ringz, Lag, LeakDC, CombC, CombL, FreeVerb, FreeVerb2, PitchShift, Limiter, VarSaw; plus BinaryOpUGen,
    UnaryOpUGen, MulAdd, Out, Control). Registered is not the same as identical in sound: that is the null test in
    section 4.
  - Parity method: some units are tested bit for bit against scsynth's own C++ compiled from source (READ:
    `crates/plyphon/tests/beq_scsynth.rs` checks the BEQSuite filters' output bit patterns at chosen samples). Whether
    GrainBuf, FreeVerb, PitchShift and Limiter have such tests was not checked.
  - Performance: criterion benches exist (`benches/synth.rs`: steady, spawn, free, churn), **no published numbers
    against scsynth**. `forbid(unsafe_code)` means bounds checks stay in the hot loops unless the compiler removes
    them, which can cost against scsynth's raw pointer loops and nova-simd (INFERRED).
  - Web: every example runs in the browser at [nannou-org.github.io/plyphon](https://nannou-org.github.io/plyphon/)
    through cpal's AudioWorklet backend, which uses wasm threads and SharedArrayBuffer. In a Durable Object there are
    no threads, so we would call `World::fill` ourselves per message, the way `engine.mjs` calls SuperSonic's
    `process` per 128 frames (INFERRED; the rings are single producer single consumer and should work on one thread).
  - License GPL-3.0. Our vendored SuperSonic is AGPL (READ, `demo/shell/vendor/LICENSE-supersonic-scsynth`), so the
    copyleft situation does not get worse.
  - Its sibling [gantz](https://github.com/nannou-org/gantz) (pushed today) already compiles graphs into plyphon
    SynthDefs (`gantz_plyphon` 0.6.0, 2026-10-17), so it has at least one serious user: its own author.
- **[scsynth-rs](https://github.com/mitchmindtree/scsynth-rs)** (READ README, created 2026-06-22, last push
  2026-06-25). The real scsynth C++ statically linked into Rust, built for `wasm32-unknown-unknown` with its own musl
  and libc++, *"no Emscripten and no WASI"*. Single threaded on the web, SynthDefs load at setup only. *"This project
  will likely be parked in favour of plyphon"*. Its reason is worth quoting because it is the post's problem from the
  other side: *"C++ bindings are typically hard to wrangle for Rust's most common web target"*. The Emscripten target
  is Cloudflare's answer to that; plyphon is nannou's.
- **[hadron_sclang](https://solitarybees.us/hadron/hadron)** 0.1.0-alpha.3, 2024-05-18: an experimental sclang
  interpreter. Language, not server. Not relevant to edgecast.
- **[vibelang-dsp](https://github.com/trusch/vibelang)** 0.4.0, 2026-03-12: a Rust DSL that writes SynthDefs for a real
  scsynth. **[sorceress](https://github.com/ooesili/sorceress)** 0.2.0, 2021: the same idea, older.
  **[rosc](https://github.com/klingtnet/rosc)** 0.11.4: OSC encoding, the standard.
- knyst and knaster call themselves *"similar to SuperCollider"* in having a graph that changes while running. They do
  not read SynthDefs (READ, README).

**Could a SynthDef run in a Rust engine?** Yes, today, in plyphon: it parses SCgf and accepts `/d_recv`. sclang-lite
writes SCgf bytes, so sclang-lite and every layer, master and insert program it compiles could feed plyphon unchanged
(INFERRED; the one test that settles it is sending `chain.mjs`'s defs and comparing, section 4). In any other Rust
engine (fundsp, knaster, glicol) a SynthDef is not an input: sclang-lite's back half would have to be rewritten to
emit their graphs, and the 36 UGens would be reimplemented by us to sound like scsynth's. That is the "weeks" of plan
section 4 c3, and it is still weeks for those engines.

### Faust

- **Faust's Rust backend** (READ, [Faust compiler options](https://faustdoc.grame.fr/manual/options/)): `-lang rust`
  is one of the listed backends (with `c`, `cpp`, `wasm`, `wast`, `cmajor`, `interp`, `jsfx`, `julia` and others), with
  two Rust options, `-rnt` (no `FaustDsp` trait) and `-rnlm` (no FFI calls to libm). The generated code is plain Rust
  with no allocation in `compute`, so it builds for `wasm32-unknown-unknown` (INFERRED from the shape of Faust
  output; not compiled here). The crate glue is [rust-faust](https://github.com/Frando/rust-faust) (`faust-build`,
  `faust-types` 0.2.1, 2024-11-20, `faust-macro`, *"WIP"*). There is a 2024 IFC talk,
  [Experiences with Faust + Rust](https://faust.grame.fr/community/ifc/2024/Experiences_with_Rust_Faust.pdf), and
  plugins built with Faust and nih-plug exist. `faust2portaudiorust` and the Web IDE's Rust exports exist.
- **faust2wasm against Faust to Rust.** Both are ahead of time. faust2wasm emits a wasm module directly from Faust's
  own backend; Faust to Rust goes through rustc and LLVM, which usually optimises better (INFERRED; no benchmark read
  today). For a Worker the difference that matters is when compilation happens, not which path.
- **Faust live in a Worker: no.** Our `demo/shell/faust.mjs` loads libfaust (6.2 MB compiler) in the browser and
  compiles a program to wasm at runtime. A Worker refuses to compile wasm at runtime (READ, section 1). So a Faust
  program can only reach edgecast as a precompiled module chosen at deploy time, or through Faust's `interp` backend
  (an interpreter of Faust bytecode, which could itself be compiled to wasm once). The interpreter route was not
  checked and would be several times slower than compiled code (INFERRED).
- **Why that matters for the choice of engine.** scsynth, SuperSonic and plyphon all *interpret* a SynthDef: a new
  program is data, not code, so it can arrive over a WebSocket and play within one quantum (MEASURED in plan section
  11: compile 0.12 to 1.2 ms, first changed frame 50 ms after the send). Faust, and any Rust code generated from it,
  is compiled code, so a live program needs a compiler at runtime, which Workers forbid. The SuperCollider shape is
  the one that fits edgecast's live changes. Faust fits fixed blocks built at deploy time (a reverb, a limiter).

### What would happen to sclang-lite and the layers' programs

| engine in the object | sclang-lite | layer, master, insert programs | LOCAL parity |
| --- | --- | --- | --- |
| SuperSonic scsynth (today) | unchanged | unchanged | same engine as the browser (MEASURED within 0.3 LU) |
| plyphon | unchanged, its SCgf bytes go to `/d_recv` (INFERRED) | unchanged if each UGen matches; differences found only by a null test | lost unless LOCAL moves to plyphon too, which plyphon's own web demo shows is possible |
| fundsp, knaster, glicol, hand written | back half rewritten to a new graph format | rewritten or re-voiced | lost |
| Faust (compiled) | not used | rewritten in Faust, and no live programs | lost |

## 4. Recommendation for edgecast

### Where the CPU and memory go today (MEASURED, plan section 10)

- 0.97 ms of CPU per 20 ms frame on Cloudflare for the full chain, 4.84 % of a core. The echo path, which does the
  WebSocket, the s16 and float conversion and nothing else, is 0.23 ms. So about 0.74 ms is the engine and the chain.
- 73.4 MB of wasm memory. That is our own `MEM` in `workers/edgecast/engine.mjs`: 24 MiB heap, 32 MiB arena, and
  2 + 4 + 4 + 4 MiB of rings and boxes, about 70 MiB. It is a reservation, not a need. The ring's 8 s buffer is about
  1.5 MB mono float (plan section 4 d).
- The bill: a Durable Object is billed for duration at 128 MB while active (READ in plan section 8), about $0.14 a day
  plus $0.03 of messages. **Neither less CPU nor less memory moves that number.** CPU and memory only buy headroom.

### What a Rust move would gain (estimates, marked as such)

- **CPU.** The DSP is the same algorithms through the same LLVM wasm backend. SuperSonic's repository tests a nova
  simd wasm128 backend (READ, `docs/BUILDING.md`, `npm run test:simd`); whether our vendored build of 2026-10-14 has it
  switched on was not checked. Estimate for plyphon on the DSP: 0.8 to 1.2 times scsynth's 0.74 ms (INFERRED; no
  published plyphon against scsynth throughput exists, and `forbid(unsafe_code)` leaves bounds checks). The glue could
  shrink if the conversions and the per quantum loop moved into wasm: perhaps 0.1 of the 0.23 ms. **Overall estimate:
  0.97 ms becomes 0.7 to 1.1 ms a frame.** Somewhere between a quarter faster and slightly slower.
- **Memory.** plyphon's pool is configured per engine (its benches use 64 MB, which is a bench setting). Estimate 10 to
  30 MB for our chain (INFERRED). But the same cut is available today by sizing SuperSonic's `memArenaSize` and
  `wasmHeapSize` down and measuring, which costs an afternoon and no rewrite.
- **Size and boot.** Upload 1,841 KiB today (MEASURED) against a 64 MiB limit. Nothing to gain.
- **Station mode headroom.** The real pressure is the 128 MB once MP3 decode, MP3 encode, the file buffers and the
  engine share one isolate. That is answered by shrinking `MEM` first.

### What it would lose

- **LOCAL parity.** Today the browser and the object run the same wasm. Moving the object alone to plyphon makes two
  engines again, which the light chain work removed (plan section 9 made "same engine" a goal). Keeping parity means
  moving `/radio/cast/` LOCAL to plyphon as well, in an AudioWorklet with wasm threads, and dropping SuperSonic.
- **SynthDef compatibility, in the sense of sound.** The bytes are compatible. Whether GrainBuf's windowing, FreeVerb,
  PitchShift and Limiter sound the same is unknown until measured. Random UGens will differ anyway (plan section 3).
- **Maturity.** SuperSonic is Sam Aaron's, 239 stars, pushed today (READ, GitHub API). plyphon is three months old,
  three stars, 0.2.0, one main author, and writes *"early-stage research engine"* about itself.

### The options, with effort

| option | what | effort (INFERRED) | gain | loss |
| --- | --- | --- | --- | --- |
| A. stay | SuperSonic scsynth in the object, JS around it | 0 | none needed | none |
| A+. stay, size it | cut `MEM` to what the chain uses, measure | an afternoon | 20 to 40 MB of headroom for the station mode (INFERRED) | none |
| B. codecs | MP3 encode with [wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders) (LAME, 0.7.0, MIT): `createEncoder("audio/mpeg", wasm)` takes a compiled `WebAssembly.Module` (READ, README), so the bundled module works in workerd. Decode: `mpg123-decoder` compiles its embedded wasm at runtime (READ, `WebAssembly.compile` in `@wasm-audio-decoders/common`), so it needs a patch to take a module, or use nanomp3 or symphonia's MP3 built from Rust as a 50 line wasm module, or minimp3 with `emcc` | hours for the encoder; a day for the decoder by any route | the station mode | none |
| C. plyphon side by side | a second object class driving plyphon (`wasm32-unknown-unknown`, `World::fill` per 128 frames, `/d_recv` the bytes `chain.mjs` already sends); same client, same file, null test against SuperSonic | 2 to 4 days to a sound; a week to a verdict, built on the M1 | a measured answer on CPU, memory and sound | nothing, it is beside the engine |
| D. switch to plyphon | object and LOCAL both on plyphon | 1 to 2 weeks after C passes | perhaps a quarter of the CPU, a lighter LOCAL, a Rust core that also runs native on the Pi | maturity risk; SuperSonic's tested behaviour |
| E. whole object in Rust | workers-rs Durable Object, Emscripten target for LAME | weeks | little beyond D | sclang-lite would have to run in JS beside it anyway, or be ported |
| F. Rust engine of our own (fundsp, knaster) | the plan's c3 | weeks | smallest footprint | sclang-lite's back half, the programs, LOCAL parity |

### The recommendation and its reasons

1. **Stay on the Emscripten scsynth (A) for the station mode and for Üle Heli (23 to 25 October).** It is measured
   on Cloudflare, it is the same engine as LOCAL, and nothing in the post lifts a limit it hits.
2. **Do A+ and B now, in JS.** The station mode's risk is the 128 MB, not CPU. LAME as a precompiled wasm module
   already exists. The Rust Emscripten target would be the third way to get LAME into the object, after
   wasm-media-encoders and compiling LAME with emcc ourselves, and the only one that is a preview.
3. **After Üle Heli, run C as a dated experiment.** plyphon is the first thing that makes plan section 4's "a Rust
   rewrite is weeks" untrue for us, because it keeps SynthDefs and so keeps sclang-lite and every program. Its answer
   must be measured: CPU per frame on Cloudflare from `wrangler tail` against 0.97 ms, wasm memory against 73.4 MB,
   and a null test of the full chain against SuperSonic on the same seed and file (dry first, then wet, as plan section
   9 did between native and wasm). Switch (D) only if it is clearly lighter and sounds the same, and only with LOCAL in
   the same move.
4. **Do not write our own Rust engine (F)**, and do not port the object to Rust for its own sake (E). Neither gains
   anything the bill can see.
5. **Faust stays a browser tool.** Live Faust in a Worker is blocked by the runtime compile rule. A fixed Faust effect
   compiled to Rust or to wasm at build time could sit in the chain, but scsynth already has the effects the cast uses.

### What could not be settled here

- plyphon's speed against scsynth: no published numbers; needs option C.
- Whether our SuperSonic build uses wasm SIMD: needs a disassembly (no `wasm-objdump` on this machine) or a look at
  the vendored build's flags.
- Whether plyphon's GrainBuf, FreeVerb, PitchShift and Limiter match scsynth's sound: needs the null test.
- Whether the Emscripten target's output (JSPI, `new_module_registry`, memory growth) behaves in a Durable Object under
  load: the post and the examples show HTTP and TCP, not a 50 message a second audio loop.
- Whether `mpg123-decoder` can be handed a precompiled module without a fork: its loader was read, its options were
  not.
