# rig-board

Comments cut from the code on 2026-10-14 and kept here verbatim, so the code can say in one to three lines what it cannot say itself. Each `why:` pointer in the code names one heading below.

## `rig/board/board.mjs`

### header

Above `import { format, parse, randomId, RELAY_BASE, LIMITS } from '../../demo/shell/wi`..., lines 1 to 18 before the cut.

~~~js
// rig/board/board.mjs — the instrument in a board, as a SERVICE.
//
// plan-hardware §8.7: the board is not a peer. It dials OUT to the relay and does
// its job whether or not anyone is watching; a browser, `curl` and a phone are
// all equally clients of it. Nothing here opens a listening port, so there is no
// inbound firewall hole and it works from any network that allows outbound TLS.
//
// No browser on the board. Every permission failure this month — a grant that
// expired with its CDP client, a GUI app with no GUI session, a crash-recovery
// dialog nobody could click — came from running a browser unattended. This is a
// node process reading two ordinary Linux tools.
//
//   node board.mjs --room studio-1
//   node board.mjs --room studio-1 --dry        plan, never apply
//   node board.mjs --once                       join, say hello, report, leave
//
// The envelope is `demo/shell/wire.mjs`, imported rather than copied: the same
// file the pages use, so a change to the shape cannot reach only one end.
~~~

### board-id

Above `const BOARD_ID = arg('id', process.env.BOARD_ID || null);`, lines 49 to 65 before the cut.

~~~js
/**
 * 🔴 THE ONE NAME THAT IS THIS BOARD AND NO OTHER. `setup.sh` mints it once at
 * install and writes it to `/etc/default/positron-board`; it is not regenerated,
 * because an id that changes is not an id.
 *
 * ⚠️ IT EXISTS BECAUSE THE OTHER THREE NAMES CANNOT DO THIS JOB. `NAME` is
 * `hostname`, which is `raspberrypi` on every fresh Pi OS, so two boards
 * introduce themselves with the same word. `FROM` is per SOCKET and changes on
 * every reconnect. `ROOM` is a place, not a thing in it. The relay has no
 * authentication, no routing and no sender identity, so **the room name is the
 * only isolation this stack has** — and the moment two boards share one, they
 * flap `boardFrom` twice a beat and interleave two `aseq` counters into a single
 * playout ring. This is what a listener tells them apart by.
 *
 * ⚠️ `unset` RATHER THAN A MADE-UP DEFAULT, so a board provisioned before this
 * existed says so instead of claiming an identity it was never given.
 */
~~~

### net

Above `const NET = arg('net', process.env.BOARD_NET || null);`, lines 67 to 72 before the cut.

~~~js
/**
 * The network this board is on, as `bay.mjs` reads a node's `net`: two nodes
 * with the same one are on one LAN, and an unknown one is never read as the
 * same. Unset by default, because a guess here would let a page choose a
 * transport that two buildings cannot open. `/etc/default/positron-board`.
 */
~~~

### site

Above `const SITE = arg('site', process.env.BOARD_SITE || null);`, lines 74 to 79 before the cut.

~~~js
/**
 * This board's SITE in the patchbay, the first part of every port id it
 * announces. `pi-1` by default (graph-registry.mjs `BOARD_SITE`), a second
 * board is `pi-2`. Not the room: the room is where the socket lives, the site
 * is what a reader is told the thing is (plans/plan-site-names.md §0).
 */
~~~

### audio-ch

Above `const AUDIO_CH = Number(arg('audio-channels', process.env.BOARD_AUDIO_CHANNELS |`..., lines 84 to 89 before the cut.

~~~js
// ⚠️ A `hw:` DEVICE OPENS AT ITS OWN CHANNEL COUNT OR NOT AT ALL. MEASURED
// 2026-09-30 on the Fast Track Pro: `arecord -D hw:CARD=Pro,DEV=0 -c 1` answers
// `Channels count non available`, because its capture is stereo only. So the
// device is opened at BOARD_AUDIO_CHANNELS and ONE of them, BOARD_AUDIO_TAKE
// (1-based), is kept. Not a `plughw` downmix: input 2 has nothing patched and
// its own noise would be summed into the Circuit.
~~~

### inst

Above `let synth = null, stopSynth = null, midiIn = null, inst = null;`, lines 103 to 108 before the cut.

~~~js
// ONE variable for whatever is making sound. There used to be two — one for a
// pipe path and one for the JACK ones — and fourteen sites branched on which
// was set, so every new source meant remembering both halves and every reviewer
// had to check both. They are two implementations of one interface now;
// `inst.jack` is the only thing anyone downstream actually needs to know,
// because the granular insert can only wrap what is on the JACK graph.
~~~

### starting

Above `let starting = null;`, lines 110 to 114 before the cut.

~~~js
// ⚠️ Set BEFORE any await in startAudio. Raising a JACK chain takes ~13 s,
// and during that window `inst` is still null — so a note.on arriving mid-start
// saw 'nothing running' and started a SECOND instrument alongside it. Two
// instruments, interleaved samples, 100 msg/s into a 60 msg/s relay. Measured
// twice.
~~~

### sampler

Above `let samp = null, sampStarting = null;`, lines 116 to 122 before the cut.

~~~js
/**
 * 🔴 THE SAMPLER IS NOT `inst`, SINCE 2026-10-11 (option b of
 * plans/plan-sampler-pi-pico.md §2.2). It sounds BESIDE whatever `inst` is,
 * summed into the same capture, so `startAudio` for Yoshimi leaves it alone and
 * `audio.start {source: 'sampler'}` leaves Yoshimi alone. `scsampler.mjs`
 * `startPlan` is the rule, graded in `test.mjs`.
 */
~~~

### collide

Above `const collide = createCollideService({ onFrame: (f) => sendPcm(f), log: (l) => l`..., lines 124 to 129 before the cut.

~~~js
/**
 * Programs a page typed, on the board's scsynth (`scollide.mjs`,
 * plans/plan-pi-supercollider-defs.md). Which scsynth is `ENGINE` there, one
 * line. It answers `sc.*`, `clock.ping` and the `collide` node's notes and
 * nothing else, and starts nothing until `audio.start {source: 'collide'}`.
 */
~~~

### fx-asked

Above `let fxAsked = null;        // { by, at, on } — the last client to change it`, lines 136 to 160 before the cut.

~~~js
/**
 * 🔴 WHO ASKED FOR THE INSERT, AND WHEN — because two pages fight over one
 * Raspberry Pi and until 2026-09-14 neither of them could see it happening.
 *
 * `/grains/` switches the granulator ON, because the granulator is its entire
 * subject. `/keys/` used to switch it OFF on load, so whichever page you opened
 * last won, SILENTLY, and the other one went on drawing a picture that was no
 * longer true.
 *
 * ⚠️ `/keys/` SENDS NOTHING ABOUT THE INSERT SINCE 2026-09-16 and has no
 * granulator on it at all. What its message was protecting against is real. An
 * insert left in by a `grains` tab that was simply CLOSED goes on wrapping
 * whatever the next page plays and feeds its own delay, MEASURED 2026-09-12 at
 * a steady -6.1 dBFS subsonic drone while `board.alive` reported `voices: 0`.
 * `sweepInsert()` below is where that guarantee lives now. ⚠️ That is the worst shape there
 * is, and it is the reason the first half of this is REPORTING rather than
 * arbitration: arbitration that hides a conflict converts a visible problem
 * into an invisible one. The board knows the truth about its own insert; the
 * pages were guessing. Now it says so — in `fx.pappus`, in `audio.status` and
 * in the five-second `board.alive`, so a page learns about a change it did not
 * make without polling for it.
 *
 * ⚠️ A CLIENT ID IS PER CONNECTION (`openWire` mints a new `from` every time),
 * so this is never a claim that outlives the tab that made it.
 */
~~~

### fx-asked-shape

Trailing comment on line 161 before the cut.

~~~js
let fxAsked = null;        // { by, at, on } — the last client to change it
~~~

### client-seen

Above `const clientSeen = new Map();          // from -> ms`, lines 163 to 174 before the cut.

~~~js
/**
 * When each client was last heard from, so "is anybody still there" can be
 * answered without a lease.
 *
 * 🔴 NO TTL, NO RELEASE, NOTHING TO LEAK. A lease nobody can clear is how
 * `studio-1` sat full for hours (CLAUDE.md). The relay solves the same problem
 * by DATING each socket — `getWebSocketAutoResponseTimestamp` — and reclaiming
 * the idle ones; this is that idea in a smaller costume, on the only evidence
 * the board actually has: a client that is still there keeps talking. `/grains/`
 * asks `params.state` and re-asks `grain.report` every four seconds, so a live
 * tab is three messages inside this window and a closed one is zero.
 */
~~~

### insert-held

Above `const INSERT_HELD_MS = 15000;          // 3.75 of '/grains/''s 4 s polls`, lines 176 to 192 before the cut.

~~~js
/**
 * How long a client may be silent before the board stops counting it as there.
 *
 * 🔴 CHECKED AGAINST `/grains/` RATHER THAN CHOSEN. That page has ONE
 * `setInterval(…, 4000)` and the first thing in it is `hello()`, which sends
 * `params.state` unconditionally whenever the socket is open. So a tab that is
 * merely sitting there with nobody touching it is a message every 4 s. With
 * the insert in it also re-sends `grain.report {on:true}` on the same tick, and
 * `source.set` until the board has answered once. So a live tab is at least 3
 * and usually 7 messages inside this window and a CLOSED one is exactly zero,
 * which is the only difference this board can actually see.
 *
 * 15 s is 3.75 of those polls. One poll lost to the relay's own caps therefore
 * costs nothing, and two do not either. ⚠️ The margin is what the number is
 * FOR: a window of 4 or 5 s would be arithmetically enough and would drop the
 * insert out from under a live page the first time a poll went missing.
 */
~~~

### sweep

Above `let sweeping = false;`, lines 206 to 236 before the cut.

~~~js
/**
 * 🔴 THE BOARD CLEANS UP AFTER ITSELF, BECAUSE SINCE 2026-09-16 NOTHING ELSE
 * DOES.
 *
 * `/keys/` used to send `fx.pappus {on:false, onlyIfIdle:true}` on connect, and
 * that one message was the whole guarantee: an insert left behind by a
 * `/grains/` tab that was simply CLOSED goes on wrapping whatever the next page
 * plays and feeds its own delay. MEASURED 2026-09-12, a steady -6.1 dBFS
 * subsonic drone while `board.alive` reported `voices: 0`, true about notes and
 * false about sound. The page has no granulator on it at all now, so it no
 * longer sends that message, and a guarantee that depended on somebody opening
 * a second page was never a guarantee anyway: nobody had to open one.
 *
 * ⚠️ AND THERE IS NO "A PEER LEFT" SIGNAL TO PREFER TO A TIMER. Looked for
 * rather than assumed: `workers/relay/src/index.js` forwards every frame
 * VERBATIM and never parses one, so the Durable Object does not know any
 * client's `from`; its `webSocketClose()` is an empty method and emits nothing;
 * and `openWire` in `demo/shell/wire.mjs` sends no farewell on unload. The
 * relay's `/room/<name>/stats` does report a per-socket idle time, but the
 * array is anonymous and sorted, so it cannot say WHICH socket stopped. Making
 * the relay announce a departure means teaching it to read messages, which is
 * the one thing that file refuses to do.
 *
 * So it is an idle rule, on the only evidence the board has: a client that is
 * still there keeps talking. See `INSERT_HELD_MS` for where 15 s comes from.
 *
 * ⚠️ IT NEVER FIGHTS A LIVE PAGE. A granulator nobody is talking to is still
 * one somebody is listening to, and `/grains/` polls every 4 s whether or not
 * anyone touches it, so a page that is open and quiet is indistinguishable from
 * one being played, which is correct.
 */
~~~

### sweep-off

Above `fxOn = false;`, lines 248 to 251 before the cut.

~~~js
// ⚠️ THE SAME THREE ASSIGNMENTS AS THE `fx.pappus` HANDLER'S OFF PATH, and
// they have to stay the same three. A sweep that cleared the patching and
// left `fxOn` true would put the insert straight back on the next
// instrument change, which is the failure wearing a new hat.
~~~

### sweep-beat

Above `send(alive());`, lines 257 to 261 before the cut.

~~~js
// 🔴 SAID ON THE HEARTBEAT, NOT ON A VERB OF ITS OWN. Every page in this
// room already reads `board.alive` for exactly this, because it carries
// `insertState()`, and a new message type would be a second authority on
// one fact. Sending the beat NOW rather than waiting up to 5 s for the next
// one is the whole difference.
~~~

### made-source

Above `let madeSource = null;     // { spec, partials, top } while PosSource is feeding`..., lines 267 to 279 before the cut.

~~~js
/**
 * The generated material, when a page has asked for one.
 *
 * A sound BUILT on the board, right now, from the same description a browser is
 * building it from (plan-twins §4a). `/grains/` sends the spec and both ends
 * make the same sines, which is the whole comparison that page exists for.
 *
 * ⚠️ THERE USED TO BE A SECOND THING CALLED A SOURCE HERE, and it was a minute
 * of ERR's 1965 archive pulled to disk and written into the grain buffers. It
 * left on 2026-09-16 with the rest of the archive path; `archive/box-pappus/`
 * has it. Two things called "source" in one file is how a rename costs an
 * afternoon, so the one that is left says what it is.
 */
~~~

### pap

Above `let pap = null;`, lines 282 to 285 before the cut.

~~~js
// The granulator's own surface — the die, the drift and the grain buffers. Its
// OSC socket is opened once and kept, separately from `pappusFx`'s patching,
// because the engine keeps running while it is bypassed and a drift that
// stopped when the insert was switched off would be a drift you could hear stop.
~~~

### video

Above `let video = null, vws = null, vseq = 0, vsent = 0;`, lines 289 to 300 before the cut.

~~~js
// ── the picture, on its own socket ───────────────────────────────────────────
//
// ⚠️ A SECOND SOCKET, AND IT IS FORCED BY A MEASUREMENT RATHER THAN CHOSEN. The
// relay allows 60 messages a second PER SOCKET and the audio stream is already
// 50 of them. Thirty video frames on the same socket is 80 against a cap of 60,
// and the bucket drops the excess silently — no error, no close, no
// backpressure. A picture sharing the audio socket would quietly cost a quarter
// of both. It also keeps the binary framing unambiguous: every page here treats
// an incoming binary frame as PCM.
//
// Room `<room>-video`, so a page that wants the picture opens a second socket
// to a name it can derive, and a page that does not is unaffected.
~~~

### codec

Trailing comment on line 309 before the cut.

~~~js
codec: 'avc1.42E01E',        // baseline 3.0 — what h264_v4l2m2m emits here
~~~

### frames-sent

Above `framesSent: vsent, ...st,`, lines 313 to 317 before the cut.

~~~js
// ⚠️ SENT, not delivered. This is the near side of the wire and the relay
// drops silently, so a client MUST compare it against the counter in the
// payload. A number counted here is not evidence about the far end.
// `framesSent`, not `sent`: since 2026-10-04 `sent` is the wire envelope's
// send stamp and `format()` throws on a payload field of that name.
~~~

### send-frame

Above `function sendFrame(unit, key) {`, lines 331 to 341 before the cut.

~~~js
/**
 * One frame out.
 *
 * ⚠️ THE SEQUENCE NUMBER GOES IN THE PAYLOAD. A binary frame carries no
 * envelope, so `wire.mjs`'s `seq` cannot ride along — and the relay's caps drop
 * frames with no error at all, which is exactly what a counter exists to see.
 * MEASURED: at 8 Mbit/s the relay lost 101 of 361 frames and NOTHING else on
 * the path reported it. 8 bytes: a uint32 counter and a uint32 flag word whose
 * low bit says this frame is a keyframe, so a joiner knows what to wait for
 * without parsing NAL types.
 */
~~~

### video-direct

Above `const videoDirects = new Map();   // peer -> { sink, waitKey, sent, dropped }`, lines 357 to 368 before the cut.

~~~js
// ── the picture on a direct link, since 2026-10-13 ───────────────────────────
// Asked: *"add direct option to all remote instruments"*, which includes
// /remote/shader-on-pi/ Shader on Pi. The same arrangement as the Pi camera on
// remote/010 (camera.mjs `attachDirect`, inputs.mjs `camDirect`): a third data
// channel `vid` on the page's direct link to this main socket, ORDERED and
// RELIABLE (a decoder fed a frame with a hole is broken to the next keyframe),
// each frame cut into 16 KB pieces by `framePieces`. Nothing is sent on `vid`
// until the page asks `video.direct` over `ctl`; `video.relay` or a closed
// channel stops it. The relay room keeps its frames for every other viewer.
// ⚠️ NO KEY HERE, UNLIKE THE CAMERA: the shader picture is already open to
// anybody in `<room>-video`, so the direct link carries nothing the relay
// would not.
~~~

### video-idle

Above `const VIDEO_IDLE_MS = 2 * 60e3;`, lines 396 to 412 before the cut.

~~~js
/**
 * 🔴 THE ARCHIVE SOURCE THIS IDLE STOP WAS WRITTEN FOR IS GONE, 2026-09-16.
 *
 * It played ERR's 1965 radio archive into the JACK graph on `-stream_loop -1`,
 * so it never ended, and this stopped it once the room had been empty for five
 * minutes: about 28 MB an hour, continuously, out of a public broadcaster, for
 * nobody. The whole path went instead. `archive/box-pappus/` has it and says
 * why. The picture's idle stop below is the same idea and is still live.
 */
// ⚠️ THE PICTURE NEEDS THIS MORE THAN THE ARCHIVE DID, and it did not have it.
// The mirror page asks the board to draw AS SOON AS IT LOADS, so one visit leaves
// the renderer and the hardware encoder running for ever — measured: 25% of the
// machine and 2 Mbit/s into an empty room, hours after the last viewer closed
// the tab. The same reasoning was written out in full for ERR's archive this
// morning and not applied one file over. Shorter here because nobody is
// listening to a picture nobody is watching, where a broadcast might reasonably
// play on.
~~~

### watching

Above `let lastWatchAt = 0;`, lines 425 to 441 before the cut.

~~~js
/**
 * ⚠️ A SOCKET IS NOT A VIEWER, AND COUNTING SOCKETS DOES NOT WORK.
 *
 * The first version of this asked the relay how many sockets were in the video
 * room and treated anything above one as somebody watching. MEASURED: the room
 * reported SEVEN while nothing on earth was watching — stale connections left
 * by test runs that exited without a clean close. The guard could never fire,
 * and the renderer ran for 231,300 frames, about two and a quarter hours, for
 * nobody.
 *
 * That is this repo's own rule, ignored one more time: a count is only evidence
 * on the far side of the boundary. The relay's socket count is a PROXY for a
 * viewer. The quantity in question is whether anyone is watching, and the only
 * thing that knows is the page — so it says so, every ten seconds, and a viewer
 * that has stopped saying it has stopped watching. It also, for free, covers
 * the case a socket count never could: a tab that is open but hidden.
 */
~~~

### bank-cc

Above `const bankCC = () => 32;`, lines 464 to 469 before the cut.

~~~js
/**
 * Which controller selects a bank. 32 is the MIDI standard (bank select LSB).
 * Until 2026-10-13 Yoshimi's was read from its own bank map here (`yoshimiList`,
 * now in archive/yoshimi/board-half.mjs); no instrument left on the board
 * reads it from anywhere else.
 */
~~~

### grains-shipping

Above `const GRAIN_TTL = 30000;        // how long one 'grain.report' keeps it shipping`, lines 479 to 490 before the cut.

~~~js
// ── shipping the grains ──────────────────────────────────────────────────────
//
// FOUR A SECOND, WHATEVER THE GRAIN RATE. sclang already batches at 250 ms;
// this matches that cadence rather than inventing a second one, because two
// buffers at different rates is a queue with a delay nobody chose.
//
// ⚠️ THE RELAY DROPS EVERYTHING PAST 60 msg/s AND TELLS THE SENDER NOTHING —
// measured, twice, exactly 298 messages delivered in three seconds at both 120
// and 300 msg/s. One message per grain would arrive as a sparse cloud that
// reads as a quiet granulator rather than as a dropped message, so the count of
// grains in the window travels WITH the list and a reader can tell the two
// apart.
~~~

### heard-at

Above `send({ type: 'grain.marks', seen: g.seen, marks: g.list, heardAt: g.at });`, lines 499 to 505 before the cut.

~~~js
// ⚠️ `heardAt`, NOT `at`. `at` WAS an envelope field until 2026-10-04 (it is
// `sent` now, and a payload may carry `at` again) and `format()` THREW
// on the collision — which it did, here, and took the whole board down with
// it until systemd restarted it. That throw is LESSONS #45: `at` once ate
// a payload field silently and ffmpeg was asked to seek to second
// 1,789,103,743,118, so session 18 made the collision loud on purpose. It
// worked exactly as intended on the first person to hit it since.
~~~

### ports-error

Above `const { backend: be, clients, error, hint } = listPorts();`, lines 513 to 516 before the cut.

~~~js
// `error` and `hint` ride along rather than being logged and dropped: the board
// is in another room, so "ALSA is not working, and here is what to do" has to
// be sayable OVER THE RELAY. Zero ports on its own cannot distinguish a
// broken sequencer from an empty rig.
~~~

### audio-out

Above `const BYTES = FRAME * 2;`, lines 526 to 535 before the cut.

~~~js
// ---------------------------------------------------------------- audio out
//
// Two sources, and the difference is the whole hardware story.
//
//   synth    the board makes the sound itself, from demo/shell/rhodes.mjs. Needs
//            NOTHING plugged in: no instrument, no interface, no soundcard.
//   capture  `arecord` reads a real device. Needs the board and an input.
//
// Both leave by the same 12-byte header and the same 20 ms framing as
// demo/carry, so the browser that plays this already exists and is deployed.
~~~

### replace

Above `if (source === 'sampler') return startSampler();`, lines 557 to 562 before the cut.

~~~js
// ⚠️ REPLACE, do not refuse. This used to return {already:true} when
// anything was running, so picking a second instrument left the first one
// ALSO streaming: two sources into one socket at 50 msg/s each, interleaved
// samples, and 100 msg/s against the relay's 60 — measured 60 frames/s
// arriving and 5,495 dropped at the relay. It sounds like corruption and it
// is two instruments talking over each other.
~~~

### pipe-beside

Above `if (samp && !JACK_SYNTHS[source]) return { ok: false, reason: 'the sampler is so`..., lines 564 to 566 before the cut.

~~~js
// ⚠️ A PIPE SOURCE BESIDE THE SAMPLER WOULD BE TWO STREAMS INTERLEAVED INTO ONE
// SOCKET, the exact fault `REPLACE, do not refuse` above was written about.
// Only a JACK instrument can sum with it.
~~~

### new-instrument

Above `await sweepInsert('an instrument was asked for');`, lines 569 to 578 before the cut.

~~~js
// 🔴 A NEW INSTRUMENT DOES NOT INHERIT AN INSERT NOBODY IS HOLDING. The line
// further down re-patches a switched-on insert onto whatever comes up, which
// is right for the page that asked for it and wrong for everyone else: it is
// how a granulator left behind by a closed tab ends up wrapping the next
// person's yoshimi. The heartbeat's sweep would catch it within five seconds
// anyway; doing it HERE means those five seconds are not audible.
// ⚠️ IT DROPS A STALE INSERT, NEVER A LIVE ONE. A `/grains/` tab that is open
// and quiet keeps its insert across an instrument change somebody else
// started, which is the stomp `onlyIfIdle` exists to prevent. The board says
// so in this call's own reply, in `fx` and `fxBy`.
~~~

### already

Above `if (running === source) {`, lines 582 to 586 before the cut.

~~~js
// ⚠️ AND SAY WHAT IT IS PLAYING. This early return used to answer
// `{ok, already, source}` and nothing else, so a client that asked to start
// something already running got a reply with no port and no title — which
// reads as "started, and playing nothing". A reply about a running source
// must describe it as fully as the reply that started it.
~~~

### jack-synth

Above `if (JACK_SYNTHS[source]) {`, lines 596 to 599 before the cut.

~~~js
// The JACK-client instrument: yoshimi. It cannot write to a pipe, so
// jacksynth.mjs raises jackd, the synth and an ffmpeg capture, and plays it
// by writing raw MIDI bytes to a snd-virmidi device that aconnect routes to
// its sequencer port.
~~~

### source-feed

Above `if (fxOn && madeSource) sourceFeed(true, { instrumentPort: r.port, instrumentPor`..., lines 613 to 618 before the cut.

~~~js
// ⚠️ AND THE GENERATED MATERIAL, for the same reason and it is not
// automatic: `pappusFx(true)` patches the NEW instrument into the
// granulator's input, which is the one thing a generated source needs not
// to happen. Without this, choosing an instrument silently puts it back in
// the buffer beside the sines, and the two panes stop being comparable
// while every readout still says they are.
~~~

### one-instrument

Above `// ⚠️ 'synth' (the FM Rhodes) and 'moog' are NO LONGER OFFERED as instruments.`, lines 625 to 637 before the cut.

~~~js
// 🔴 THE SAMPLED INSTRUMENT AND THE DX7 LEFT ON 2026-09-16, and the board is
// one instrument now. `archive/box-fluidsynth-hexter/` has the code and the
// argument; the short form is that this board has ONE jackd, ONE capture and
// ONE room, so a second instrument is a way to take the sound away from
// somebody in another building who is listening to the first.
//
// ⚠️ THE ONE MEASUREMENT WORTH KEEPING OUT OF THAT PATH, because it is about
// the container rather than about FluidSynth: in a `debian:trixie` arm64
// container with no /dev/snd at all and `ulimit -r` 0, `jackd -r -d dummy`
// came up, a synth registered left and right, the ffmpeg capture attached,
// and three seconds of the graph came back as 144,021 samples at peak 0.1096.
// Real audio, not silence. jackd's dummy driver is pure software timing, so
// this whole module runs where there is no sound hardware in existence.
~~~

### moog

Above `if (source === 'moog') {`, lines 639 to 647 before the cut.

~~~js
// ⚠️ 'synth' (the FM Rhodes) and 'moog' are NO LONGER OFFERED as instruments.
// Both were written to find out what a board can do with plain arithmetic, and
// both were beaten by things already packaged: a real DX7 under a plugin
// host, and SuperCollider's MoogFF, which is a correct ladder where this
// one's resonance measurably does nothing (loop gain 0.001 at fc 900).
// The code stays in demo/shell for /carry/ and for the microcontroller path
// where no plugin can follow — see README, "the two we wrote and removed".
// Kept reachable with an explicit source name so the measurements can be
// reproduced; not listed, not the default, not on the page.
~~~

### aconnect

Above `if (backend() === 'alsa') {`, lines 659 to 661 before the cut.

~~~js
// On the board, a real keyboard patched in with `aconnect` plays it too —
// the synth is just another sequencer port, so the patchbay needs no
// special case for it.
~~~

### capture-by-name

Above `if (source !== 'capture') {`, lines 673 to 681 before the cut.

~~~js
// ⚠️ CAPTURE IS ASKED FOR BY NAME, NOT FALLEN INTO. Everything that did not
// match above used to arrive here and become a MICROPHONE — so a typo, or a
// source removed from the table, started `arecord` and answered
// `{ok: true, source: 'capture'}`. It even made sound, because a capture
// device usually has something on it. Measured after a source was deleted:
// asking for it still "worked", peak 0.0391, which is the deletion silently
// not taking effect. A name nobody recognises is an error, not a default.
// ⚠️ THIS IS WHAT A PAGE ASKING FOR `fluidsynth` OR `hexter` NOW GETS, and it
// is the right answer: `known` lists what this board actually has.
~~~

### aseq

Above `if (!captureHolders().filter((h) => h !== was).length) aseq = 0;`, lines 741 to 743 before the cut.

~~~js
// ⚠️ THE SEQUENCE RESTARTS ONLY WITH THE CAPTURE. With the sampler holding
// it, frames go on flowing after Yoshimi stops, and a counter jumping back to
// 0 mid stream reads as a reorder at every listener.
~~~

### coalesce

Above `const DRAIN_MS = 5;`, lines 752 to 763 before the cut.

~~~js
// ------------------------------------------------------------- control plane
//
// 🔴 COALESCE, DO NOT QUEUE. A backlog of note messages has to be played out,
// because every one of them is an event that happened. A backlog of CONTROLLER
// messages is a stack of statements about where one knob is, and all but the
// last are already wrong. Queueing them would walk the filter through positions
// the hand has left, late, which is worse than skipping them.
//
// The drain is a timer rather than a write per message so that a burst arriving
// in one tick costs ONE MIDI write per controller. `DRAIN_MS` is well under the
// 20 ms audio frame, so a value that matters is never held long enough to be
// heard as lateness.
~~~

### ctl

Above `const ctl = { pending: new Map(), last: new Map(), by: new Map(), timer: null, c`..., lines 765 to 784 before the cut.

~~~js
/**
 * 🔴 `last` IS WHAT THIS BOARD IS ACTUALLY SET TO, AND ITS ABSENCE COST THREE
 * SESSIONS. The output level collapsed to 0.0010-0.0035 of full scale on
 * 2026-09-17 and stayed unexplained until 2026-09-20, when driving CC 7 down
 * over the relay reproduced both ends of that range to two digits: 32 gives
 * 0.00330, 4 gives 0.00113. **A part volume left at 8 was invisible to every
 * client**, because `ctlMeter` counted messages and named no controller, no
 * value and no sender. Three counters that all read healthy while the one fact
 * that mattered was not on the wire at all.
 *
 * ⚠️ IT RECORDS WHAT WAS WRITTEN, NOT WHAT ARRIVED. A value that was folded
 * away was overtaken before it reached the instrument, so reporting it would be
 * reporting a knob position the hand had already left. `out` counts the writes
 * and `last` is where they left each controller.
 *
 * ⚠️ AND IT NAMES THE SENDER, because "who turned this down" is the other half
 * of the question and a shared board has more than one hand on it. `from` is
 * the relay's per-socket id, which changes on reconnect, so it answers "was
 * that me" rather than "who is that person".
 */
~~~

### no-inst

Above `if (!inst) { ctl.pending.clear(); return; }`, lines 793 to 795 before the cut.

~~~js
// ⚠️ NO INSTRUMENT IS NOT AN ERROR AND IS NOT A BACKLOG EITHER. Holding
// values for an instrument that may never start is how a knob turned before
// `audio.start` arrives at the synth ten minutes later.
~~~

### ctl-set

Above `const set = [...ctl.last.entries()]`, lines 813 to 821 before the cut.

~~~js
/**
 * 🔴 THE CONTROLLERS THIS BOARD IS SET TO, BY NUMBER, NEWEST FIRST. Sorted by
 * when rather than by controller, because the question being asked is almost
 * always "what did I just change" or "what did somebody else change".
 * ⚠️ `name` IS ONLY FILLED WHERE IT IS KNOWN TO BE TRUE ON THIS INSTRUMENT.
 * CLAUDE.md records that Yoshimi does NOT use the General MIDI map: 76 and 77
 * are FM amplitude and resonance centre here, not vibrato rate and depth, and
 * a confident wrong label is worse than none.
 */
~~~

### volume

Above `volume: ctl.last.has(7) ? ctl.last.get(7).v : null };`, lines 829 to 833 before the cut.

~~~js
// 🔴 THE ONE THAT IS ALWAYS WORTH LOOKING AT FIRST. Volume is the
// controller that makes an instrument sound broken rather than
// different, and it is the one nobody thinks to check. `null` means
// this board has not been told a volume since it started, which is
// NOT the same as 127 and must not read as it.
~~~

### ctl-names

Above `const CTL_NAMES = {`, lines 837 to 844 before the cut.

~~~js
/**
 * Controller numbers whose meaning is MEASURED on this instrument, not assumed.
 * 🔴 YOSHIMI DOES NOT USE THE GENERAL MIDI MAP and this table exists to stop
 * anybody writing one from memory: 76 and 77 are FM amplitude and resonance
 * centre in the ZynAddSubFX family, not vibrato rate and depth, and measuring
 * them showed 0.2 cents of movement at every value, which is the tracker's own
 * noise. Anything not listed here is reported by NUMBER, with no name.
 */
~~~

### handle

Above `async function handle(msg, replyVia = null) {`, lines 850 to 856 before the cut.

~~~js
// ---------------------------------------------------------------- requests
//
// Every verb that changes the rig has a PLAN twin that changes nothing, so a
// client can always ask "what would this do" first. A wrong MIDI patch is
// silent; a plan is not.
// `replyVia` is the direct path's `ctl` channel (rtc.mjs), so an answer goes
// back the way its question came. Absent, the answer goes into the room.
~~~

### no-default

Above `if (!msg.source) return reply('audio.started', { ok: false, reason: 'say which i`..., lines 889 to 891 before the cut.

~~~js
// 🔴 NO DEFAULT SINCE 2026-10-13. A bare `audio.start` meant Yoshimi, and
// Yoshimi left the board (archive/yoshimi/README.md), so it is refused in
// words rather than quietly turned into another instrument.
~~~

### sampler-node

Above `if (isForSampler(msg)) {`, lines 898 to 900 before the cut.

~~~js
// 🔴 `node: 'sampler'` IS THE SAMPLER'S, and it never starts anything:
// a note for an engine that is not running is dropped and said, not
// turned into Yoshimi.
~~~

### mid-start

Above `if (starting) return reply('note.ack', { note: msg.note, dropped: true, starting`..., lines 905 to 907 before the cut.

~~~js
// Whichever instrument is running takes the note.
// If something is mid-start, do NOT start a second instrument — drop the
// note. One missed note is nothing; two instruments is a broken stream.
~~~

### idle-note

Above `if (!synth && !inst) return reply('note.ack', { note: msg.note, dropped: true, r`..., lines 909 to 911 before the cut.

~~~js
// 🔴 A NOTE TO AN IDLE BOARD STARTS NOTHING, SINCE 2026-10-13. It used to
// raise Yoshimi, 300 MB for 13 to 40 s, on any stray note; now it is
// dropped and said, as the sampler branch above already did.
~~~

### note-ack

Above `return reply('note.ack', { note: msg.note, channel: msg.channel ?? 0,`, lines 915 to 919 before the cut.

~~~js
// ⚠️ A KEY NO LONGER PITCHES A GRAIN VOICE, AND THAT WENT WITH THE
// ARCHIVE. It did so only with material LOADED into the buffers, which
// was the ERR excerpt path and nothing else: with the granulator merely
// recording its input, a key press is one sound already. The voices are
// still there and `params.set gates` still opens them.
~~~

### panic

Above `if (fxOn) pappusPanic();`, lines 932 to 934 before the cut.

~~~js
// An insert keeps sounding after every note has stopped — a captured
// ring buffer, eight delay taps and a reverb tail. Silence it too, or
// "all notes off" is only true of the instrument.
~~~

### voices-list

Above `case 'voices.list': {`, lines 940 to 943 before the cut.

~~~js
// What patches this board HAS, read off the board rather than guessed in a
// browser. Which instruments exist is a property of the machine the synth
// runs on — a page cannot see /usr/share/yoshimi/banks and should not
// pretend to — so the board enumerates and the page renders what it is told.
~~~

### voices-fixed

Above `return reply('voices.listed', {`, lines 946 to 952 before the cut.

~~~js
// The Yoshimi branch (its bank map as `voices.listed`) left on 2026-10-13
// and is in archive/yoshimi/board-half.mjs.
// ⚠️ THIS BRANCH IS NOT DEAD, THOUGH YOSHIMI IS THE ONLY INSTRUMENT.
// `nothing is playing` is the ordinary answer on a cold board, and it has
// to be told apart from a library that failed to read. `fixed` is that
// difference: a client that cannot tell them apart has to log both, and
// then it logs a non-event every time an instrument starts.
~~~

### program

Above `if (inst) {`, lines 970 to 977 before the cut.

~~~js
// 🔴 A PROGRAM NUMBER, NEVER A NAME. `{voice:'rhodes'}` used to resolve
// through a General MIDI table in fluid.mjs, and General MIDI was
// FluidSynth's meaning for a program number and nobody else's: Yoshimi's
// index its current bank, which the board enumerates and sends as
// `voices.listed`. With FluidSynth gone the name had nothing left to
// resolve against, so a page that sent one would have been answered with
// a table for an instrument that is not there.
// `archive/box-fluidsynth-hexter/` has the table and the old branch.
~~~

### bank

Above `const bank = Number.isInteger(msg.bank) ? msg.bank : null;`, lines 984 to 991 before the cut.

~~~js
// ⚠️ BANK SELECT IS CC 32, AND THE NUMBER IS READ FROM YOSHIMI'S OWN
// CONFIG (`midi_bank_C`), never typed here. CC 0 is `midi_bank_root`:
// sending a bank on it moves Yoshimi's ROOT DIRECTORY instead, at which
// point every program change afterwards lands nowhere. One wrong guess
// about this cost an hour.
//
// Bank and program go out back to back on ONE byte stream, so they
// cannot arrive out of order and no delay is needed between them.
~~~

### ctl-set-verb

Above `case 'ctl.set': {`, lines 1000 to 1020 before the cut.

~~~js
/**
 * 🔴 THE CONTROL PLANE, WHICH IS A DIFFERENT KIND OF TRAFFIC FROM `cc`.
 *
 * `cc` below is EDGE-shaped in practice: one verb, one write, one ack, and
 * a page that sends fifty of them a second gets fifty acks back. A hand on
 * a slider is LEVEL-shaped: every message is a complete statement of where
 * the controller is, the last one is the only one that stays true, and an
 * ack per value is fifty messages a second spent telling a page something
 * it can see by listening.
 *
 * So this verb takes a BATCH, folds it, and writes at most one value per
 * controller per drain. `folded` is the number that was overtaken on the
 * way, and it is reported rather than hidden: a control plane that silently
 * drops is the shape every failure here takes.
 *
 * ⚠️ THE EXISTING `cc` VERB IS UNTOUCHED, so `/keys/` cannot regress. Two
 * verbs, two disciplines, one instrument.
 * ⚠️ AND THE LAST VALUE SENT IS THE LAST VALUE WRITTEN. A fold that kept
 * the FIRST of a burst would leave the filter behind the finger for as long
 * as the burst lasted, which is the bug that reads as latency.
 */
~~~

### no-ack

Above `return;`, lines 1033 to 1033 before the cut.

~~~js
// NO ACK PER VALUE. `ctl.meter` says what happened, once a second.
~~~

### fx-pappus

Above `case 'fx.pappus': {`, lines 1059 to 1075 before the cut.

~~~js
// ⚠️ `sf.list` STOOD HERE AND LEFT ON 2026-09-16 with the sampled
// instrument. It walked the board's soundfont directories so a page could
// offer a choice of them; with nothing on this board that can read one, a
// reply would have been a list of files nobody can play.
// `archive/box-fluidsynth-hexter/board-half.js` has it.
// ⚠️ A PAGE STILL SENDING IT FALLS THROUGH TO `default` BELOW, which returns
// false and says nothing. That is correct on a relay that broadcasts
// verbatim: an unknown verb is usually somebody else's traffic.
// What is sounding RIGHT NOW. A page that joins mid-session has clicked
// nothing, so without this it shows no selection while the board plays on —
// a readout that contradicts the thing it is describing.
// Roll the granular parameters. A program change means nothing to Pappus —
// it has no patches, it has 106 knobs — so "random" has to mean something
// different here, and this is it.
// Pappus is an INSERT, not an instrument: it wraps whatever is playing.
// It only reaches what is on the JACK graph, which is worth saying rather
// than failing quietly.
~~~

### jack-gate

Above `if (want && !inst?.jack) return reply('fx.pappus', {`, lines 1078 to 1082 before the cut.

~~~js
// ⚠️ THE GATE IS `inst.jack`, NOT AN INSTRUMENT NAME. It used to read
// `!jsyn`, which meant "is it one of the JACK ones" by which variable
// happened to be set — so adding a source meant remembering this line.
// The insert can wrap anything on the JACK graph, and that is a property
// the source reports about itself.
~~~

### only-if-idle

Above `if (!want && msg.onlyIfIdle === true && fxOn && fxAsked?.on`, lines 1089 to 1106 before the cut.

~~~js
// 🔴 `onlyIfIdle` — "take it out, UNLESS somebody is still using it".
//
// ⚠️ NOTHING IN THIS REPO SENDS IT ANY MORE. `/keys/` did, on load, and
// that page has no granulator on it since 2026-09-16; `sweepInsert()`
// applies the same liveness rule on the board's own clock, so the message
// is no longer how an orphaned insert gets cleared. It is kept because it
// is still a correct thing for a person or another program to ask, and
// because it reads the liveness verdict OUT LOUD, which the sweep cannot
// do for a caller that wants an answer now.
//
// ⚠️ IT REFUSES OUT LOUD. `ok: true, on: true, kept: true` with the
// holder and the ages in the reply, so the page can say "another tab
// asked for this 4 s ago" rather than quietly showing the wrong picture.
// An arbitration nobody can see is worse than none.
//
// ⚠️ AND IT IS OPT-IN. A caller that does not send it gets the old
// behaviour exactly, which is what keeps `fx.pappus {on:false}` a thing a
// person can type to fix a wedged board.
~~~

### on-true

Above `ok: true, on: true, kept: true, ...insertState(), instrument: inst?.source ?? nu`..., lines 1112 to 1116 before the cut.

~~~js
// ⚠️ `on: true` EXPLICITLY. Every page reads `m.on` off this reply to
// set its own idea of the insert, and `insertState()` reports `fx`
// rather than `on` — so a refusal without this would answer "ok" and
// then tell the page the granulator is off, which is the silent wrong
// picture this whole change exists to stop.
~~~

### recorded

Above `if (r.ok) { fxOn = want; fxAsked = { by: msg.from ?? null, at: Date.now(), on: w`..., lines 1122 to 1124 before the cut.

~~~js
// ⚠️ RECORDED ONLY WHEN IT ACTUALLY CHANGED. A request that failed leaves
// the previous holder in place, or the page that got a refusal would be
// recorded as the owner of an insert it never raised.
~~~

### re-patch

Above `if (r.ok && want) {`, lines 1126 to 1134 before the cut.

~~~js
// ⚠️ `pappusFx(true)` RE-PATCHES THE INSTRUMENT INTO THE GRANULATOR, which
// is right for every other caller and is exactly what a generated source
// had disconnected. Put it back the way the source wants it, in the one
// place that knows both.
// And when there is no source: ask sclang to drop any synth it is still
// holding. sclang OUTLIVES this process — `pappusFx` adopts a running one
// rather than compiling a 2,030-line class again — so a restarted board can
// inherit a source synth it never started, playing into a granulator that
// now has the instrument patched in as well.
~~~

### params-random

Above `case 'params.random': {`, lines 1147 to 1154 before the cut.

~~~js
// A SEEDED roll, in one of six named characters.
//
// The old roll drew nine parameters uniformly and independently, which
// lands in the middle of all nine nearly every time — one sound wearing
// different numbers — and threw the numbers away, so a roll that landed on
// something good could not be got back. Both are fixed in `pappus.mjs`:
// the character is drawn first and narrows the ranges, and the seed comes
// back with the roll so the same roll can be asked for again.
~~~

### drift-on

Above `pappus().startDrift();`, lines 1161 to 1174 before the cut.

~~~js
// Movement is on by default once there is something to move. It is not a
// control the page offers — see `params.drift` for why it exists at all.
//
// ⚠️ SO `params.drift {on:false}` FOLLOWED BY A ROLL IS A NO-OP, and that
// cost a whole measurement run. `pappus-live.mjs` switched the drift off,
// rolled ten seeds, and took every capture believing nothing was moving
// while `DRIFT` walked scan · spray · swarm · tilt · size · sos at 8 Hz
// underneath — which is why two DIFFERENT seeds measured ten times closer
// together than one seed measured to itself.
//
// It is deliberate and it stays: a page that rolls wants the movement.
// The reply below carries `drift: driftStats()` so a caller can SEE it
// came back on, and anything measuring must switch it off AFTER the roll,
// not before. The harness does that in one place now.
~~~

### params-drift

Above `case 'params.drift': {`, lines 1179 to 1184 before the cut.

~~~js
// The slow movement, which has no slider on purpose.
//
// It lives in the board rather than in the page because the board is an OBJECT
// and not a SESSION: the sound goes on moving with nobody connected, which
// is the whole of plan-hardware §8.7. The page can turn it off; it cannot
// steer it, because a steerable drift is just a slider with extra steps.
~~~

### source-set

Above `case 'source.set': {`, lines 1191 to 1224 before the cut.

~~~js
// ── the grains, as they fire ──────────────────────────────────────────
//
// 🔴 THE ONE THING AUDIO CANNOT CARRY. A page drawing this granulator
// beside one in a browser can mark every grain on the browser's side and
// none on this one, because a bump in an envelope might be a note, a delay
// tap or a reverb swell. The engine reports each grain as `GrainBuf` is
// triggered; this is the door it leaves by.
//
// ⚠️ ASKED FOR, AND IT STOPS ASKING ITSELF. Reporting costs the engine
// sixteen live SendReply UGens and this room four messages a second, and a
// page that is closed cannot tell anybody. So a request expires: the board
// keeps shipping for GRAIN_TTL after the last `grain.report`, and a page
// that wants the picture re-asks while it is open. A board still shouting
// at an empty room a week later is the shape of failure this avoids.
// ── the material, built here from the page's own description ─────────
//
// 🔴 THE POINT OF THE WHOLE PATH (plan-twins §4a). `grains` draws this
// granulator beside one in a browser and calls them comparable. They were
// not, and the biggest reason by a distance was not the granulator: the
// page chewed a table of sine partials and this board chewed whatever
// instrument happened to be running. One spec, expanded by ONE function
// (`partialsOf`, imported by both ends), rendered here by `PosSource.sc`.
//
// ⚠️ THIS ONE GENERATES. There used to be a second verb here that wrote a
// minute of ERR's 1965 archive into the grain buffer from disk; it left on
// 2026-09-16 and this is the only material path now.
//
// ⚠️ AND THE INSTRUMENT COMES OUT OF THE INPUT, RATHER THAN BEING STOPPED.
// scsynth fills its input bus from JACK before any synth runs, so an
// instrument still patched to `SuperCollider:in_1` is summed with the
// generated material and the granulator chews a third thing neither end can
// describe. Stopping it is not the fix: `posboard`, the capture whose frames
// are the audio a page HEARS, is raised as part of the instrument's own
// chain, so `audio.stop` would take the result away with the material.
~~~

### engine-has-it

Above `let st = pappus().sourceState();`, lines 1238 to 1243 before the cut.

~~~js
// 🔴 `ok` MEANS THE ENGINE HAS IT, not that this process sent it, and
// this handler failed that standard on its first run. scsynth answers `/s_get` only for a node that
// really exists, with the value it really holds, so the wait is for THAT
// and the reply carries it. Three seconds because a first `/s_new` after
// a def load is the slow case and a fixed one-beat sleep answered before
// the server had spoken.
~~~

### holds

Above `const holds = st.on && st.voices === r.spec.chord.length && Math.abs(st.hz - r.s`..., lines 1246 to 1249 before the cut.

~~~js
// ⚠️ AND THE VALUES ARE COMPARED, not merely present. A node that exists
// holding the def's DEFAULTS is a node that never received the spec, and
// it would sound almost right — `hz` within a tenth of a hertz and the
// voice count exact is what says the table arrived with it.
~~~

### made

Above `made: madeSource ? { ...madeSource, engine: pap?.sourceState() ?? null } : null,`, lines 1280 to 1284 before the cut.

~~~js
// 🔴 WHAT IT IS CHEWING, for a page that joined after somebody else set
// it. ⚠️ There used to be a second answer beside this one, `source`,
// which was the minute of ERR's archive loaded into the buffers. That
// path left on 2026-09-16, so `made` is now the only material the board
// can be given and the ambiguity is gone with it.
~~~

### notes-sent

Above `notes: pap?.notes.state() ?? null,`, lines 1286 to 1290 before the cut.

~~~js
// Which voice slots are open and at what interval. ⚠️ This is what the
// board SENT, not what the engine did with it — a count on this side of
// the wire is not evidence about the far side (CLAUDE.md). It is here
// so a sweep can tell "the board never sent it" apart from "the engine
// took it and made no sound", which are opposite bugs.
~~~

### params-set

Above `case 'params.set': {`, lines 1293 to 1305 before the cut.

~~~js
// One named engine command, forwarded. Pappus has 106 of them and the roll
// reaches a chosen subset, so without this the only way to ask the engine a
// question is to edit the board and redeploy it — which is how an afternoon
// went on a question that takes four seconds to answer.
//
// This is the MEASUREMENT surface, not a control surface: it is what lets a
// harness sweep one parameter and grade the sound, which is the only way to
// tell "the engine ignores this" from "the capture cannot see it".
//
// Same posture as every other verb here: the relay is tokenless, so anyone
// in the room can send it. The blast radius is one granulator's parameters
// on one board — strictly smaller than `patch.apply` or `audio.start`,
// which have been open all along.
~~~

### set-centre

Above `const centred = pappus().set(cmd, ...args);`, lines 1317 to 1321 before the cut.

~~~js
// ⚠️ `.set`, NOT `.send`. A parameter a person chose becomes the centre
// the slow movement circles, so a page that sets its sound directly —
// `grains` has six named patches and no die — has something for the
// drift to move around. `.send` is the raw door and stays raw, because
// the drift's own nudges go out through it.
~~~

### gates-mirror

Above `if (cmd === 'gates') pappus().notes.adopt(args);`, lines 1323 to 1328 before the cut.

~~~js
// 🔴 AND IF IT WAS THE VOICE GATES, THE KEYBOARD'S MIRROR FOLLOWS IT.
// `notes.gate` in `params.state` is what a page reads to find out whether
// this granulator can fire at all — and it was the KEYBOARD's model, so a
// page that opened the gates through this raw door left the board
// reporting every voice shut about a granulator making grains. One
// authority, and this is the line that keeps it one.
~~~

### no-drift

Above `return reply('params.set', { ok: true, cmd, args, centred: centred ? centred.joi`..., lines 1330 to 1333 before the cut.

~~~js
// It does NOT switch the movement on. `params.set` is the MEASUREMENT
// surface: a sweep that turned the drift on under itself would be
// grading a moving target, and `pappus-live.mjs` opens by turning it off
// for exactly that reason. Movement is asked for, by `params.drift`.
~~~

### picture

Above `// ── the picture ──────────────────────────────────────────────────────`, lines 1337 to 1344 before the cut.

~~~js
// 🔴 THE THREE VERBS THAT PUT ERR'S 1965 ARCHIVE IN THE GRAIN BUFFERS
// LEFT ON 2026-09-16: `source.search`, `source.load`, `source.clear`.
// No page in `demo/` sent any of them, and every connection this repo opens
// to ERR appears in a public broadcaster's audience measurement, so an
// unused path to their archive from a board nobody is watching was exposure
// with no benefit. `archive/box-pappus/` has the code and the reasoning.
// ⚠️ `source.set` BELOW IS NOT THAT and did not go: it is the sound BUILT
// on the board from a spec, which is what `/grains/` feeds the granulator.
~~~

### bitrate

Above `bitrate: Math.min(msg.bitrate ?? 2_000_000, 4_000_000),`, lines 1356 to 1358 before the cut.

~~~js
// ⚠️ CAPPED AT 4 Mbit/s, MEASURED. 2 and 4 arrive byte-identical
// through the relay; 8 loses 28% of frames silently. Letting a client
// ask for 8 would hand it a stream that looks like it is working.
~~~

### video-shader

Above `case 'video.shader': {`, lines 1371 to 1375 before the cut.

~~~js
// The two knobs the picture has. Named rather than numbered, because a
// client should not have to know that the mirror count is a uniform.
// The same shader body the page just compiled for itself, compiled here as
// 310 es. That is the whole of "the same shader on two GPUs" — one text,
// two compilers, rather than two copies kept in step by hand.
~~~

### uniform-map

Above `const MAP = { mirrors: ['seg', 2, 64], segments: ['seg', 2, 64], grain: ['scale'`..., lines 1384 to 1387 before the cut.

~~~js
// The page's names on the left, the renderer's uniforms on the right — a
// client should not have to know that `grain` is a noise frequency.
// `segments` is the same uniform as `mirrors`, under the name the board's
// graph announces on `pi-1:shader:value-in` (the catalogue's, since 2026-10-14).
~~~

### params-sent

Above `return reply('video.params', { ok: n > 0, paramsSent: n, mirrors: p.seg, grain: `..., lines 1396 to 1398 before the cut.

~~~js
// ⚠️ REPORTED AS SENT, NOT AS APPLIED. The control channel is one-way —
// the renderer has no way to answer — so this is what went down the pipe.
// `paramsSent`, not `sent`, which is an envelope field since 2026-10-04.
~~~

### video-watching

Above `case 'video.watching':`, lines 1401 to 1404 before the cut.

~~~js
// ⚠️ A VIEWER SAYING IT IS WATCHING. Cheap on purpose: no reply, so a room
// of viewers costs the relay one message each per ten seconds and nothing
// comes back. Without this the board cannot tell a watched picture from an
// abandoned one — see `watchVideoViewers`.
~~~

### audio-status

Above `case 'audio.status':`, lines 1423 to 1427 before the cut.

~~~js
// ⚠️ `insertState()` RATHER THAN `fx:` ALONE, AND IT WAS THE THIRD PLACE
// THIS LINE IS WRITTEN. Two pages share this board and neither could see
// the other change the insert; a page that asks what is playing is asking
// the question the answer belongs to, so it gets the holder and the ages
// here as well as in `fx.pappus` and the heartbeat.
~~~

### board-ping

Above `case 'board.ping':    return reply('board.pong', { pongAt: Date.now() });`, lines 1441 to 1454 before the cut.

~~~js
// 🔴 `pongAt`, NOT `at`, AND THIS VERB HAD REPLIED TO NOBODY SINCE IT WAS
// WRITTEN. `at` WAS an envelope field (`wire.mjs`, `sent` since 2026-10-04),
// `format()` throws on the collision by design, the throw was caught by the handler wrapper below and
// answered as `board.error`. So the obvious round trip verb on this board
// answered an error to every caller, and `/keys/` timed it into a variable
// no cell showed. Found 2026-09-16, fixed 2026-09-18. It is the same
// collision `grain.marks` names two hundred lines up, which is the one
// place in this file that got the rename right.
// ⚠️ NOTHING READS THE FIELD AND NOTHING SHOULD. `live-test.mjs`,
// `relay-compare.mjs` and `yoshimi-test.mjs` all time the round trip in
// THEIR OWN clock, which is the only clock that can measure it: this
// process's `Date.now()` and a caller's share no origin, so subtracting
// them is meaningless. It is sent because a reply carrying nothing but its
// own type is hard to tell from an echo.
~~~

### jack-graph

Above `case 'jack.graph': {`, lines 1457 to 1472 before the cut.

~~~js
// ── looking at the board, and putting its graph back ──────────────────
//
// 🔴 THE REPORT COMES FIRST, AND IT IS THE IMPORTANT ONE. A verb that
// CHANGES the board before anybody can SEE the board turns a diagnosis into
// a second fault, and on a board with one jackd, one capture and one room
// the second fault is heard by whoever is listening in another building.
// So `jack.graph` reads and writes nothing, and `jack.rebuild` carries the
// graph from before and after itself, so pressing it is a diff rather than
// a leap.
//
// 🔴 EACH ANSWERS IN ITS OWN NAME. `audio.status` answers `audio.started`,
// and that cost nine seconds and a wrong conclusion: a caller waiting on the
// obvious reply name waited out its timeout and reported that no board was
// in the room, about a board that had answered immediately. `ctl.meter`,
// `fx.pappus` and `video.params` already answer in their own names, and
// these two do the same.
~~~

### believes

Above `return reply('jack.graph', {`, lines 1477 to 1481 before the cut.

~~~js
// 🔴 WHAT THE BOARD BELIEVES, BESIDE WHAT THE GRAPH SAYS. The pairing is
// the diagnosis and neither half is one on its own: the level collapse of
// 2026-09-17 is a board reporting a healthy instrument while the audio a
// page hears is 40x down, which is two statements that disagree. Only one
// of them was ever visible from outside the building.
~~~

### rebuild

Above `const wantPlan = msg.plan === true || DRY;`, lines 1490 to 1515 before the cut.

~~~js
// 🔴 WHO ELSE IS ON THIS BOARD, AND WHAT THIS DOES ABOUT IT. WRITTEN
// DOWN BECAUSE IT IS A DECISION RATHER THAN AN IMPLEMENTATION DETAIL.
//
// The board cannot see a listener. `workers/relay` forwards every frame
// verbatim and never parses one, its `webSocketClose()` is empty, and a
// page holding a PCM stream says nothing. That is the same absence
// `sweepInsert()` is written around, looked for there rather than
// assumed. So asking permission is not available, and a verb that
// pretended to ask would be worse than one that does not.
//
// Three things instead, and the first two are what make the third rare.
// It is a DIFF: a graph that is already right runs zero commands, so the
// ordinary case of somebody pressing recover on a healthy board is
// inaudible. It KILLS NOTHING: no process is restarted under a listener,
// only links are patched. And when it does have to cut a link it says so
// out loud, with who asked and who else the board has heard from inside
// the same 15 s window the insert uses. An arbitration nobody
// can see is worse than none, which this board settled once already in
// `fx.pappus`.
//
// ⚠️ AND A SERVICE RESTART IS DELIBERATELY NOT A VERB HERE. A process
// that kills itself over the relay cannot report what happened, systemd
// restarts it anyway (`Restart=always`), and the recovery actually asked
// for is the graph. `audio.stop` then `audio.start` already rebuilds the
// whole chain including the capture, at the cost of about thirteen
// seconds of silence for everybody in the room.
~~~

### kept

Above `if (!wantPlan && msg.onlyIfIdle === true && others.length) {`, lines 1520 to 1523 before the cut.

~~~js
// ⚠️ `ok: true, kept: true`, THE SAME REFUSAL SHAPE AS `fx.pappus`, and
// a caller has to read `kept`. A refusal is not an error: the board is
// fine, it declined on the caller's own instruction, and answering
// `ok: false` would read as a board that could not do it.
~~~

### journal

Above `log('jack.rebuild${wantPlan ? ' (plan)' : ''} by ${msg.from ?? 'nobody'}: '`, lines 1536 to 1539 before the cut.

~~~js
// The journal is the one record that survives a board nobody can reach.
// Say what was asked, by whom, how many links moved and who else was in
// the room, in one line, so a person reading `journalctl` afterwards can
// attribute an interruption somebody reported by ear.
~~~

### jack-list

Above `case 'jack.list': {`, lines 1545 to 1561 before the cut.

~~~js
// ── the JACK arm of the patchbay, the twin of patch.plan / patch.apply ──
//
// `jack.list` is the graph with every port's direction and type and every
// connection (`jack_lsp -c -p -t`). `jack.plan` takes `{ patch }`, a
// `jack.mjs` document, and answers the steps and the refusals without
// touching anything. `jack.apply` applies it and answers the graph READ
// BACK, because `jack_connect` exits 1 for "already connected" and for a
// failure alike.
// ⚠️ THE BOARD'S OWN CHAIN STILL WINS. `jack.apply` patches what it is
// told; it does not change what the board believes is playing, so a
// document that cuts the capture shows up in `jack.graph` as `extra` or
// `missing`, and `jack.rebuild` puts the board's chain back. That is on
// purpose: one source of truth about the instrument, and this verb a way to
// patch around it in the open.
// ⚠️ TOKENLESS, LIKE EVERY VERB ON THE RELAY. Its blast radius is the one
// jackd on this board, the same as `jack.rebuild` and `audio.stop`, so it
// carries the same `onlyIfIdle` refusal and the same journal line.
~~~

### jack-link

Above `case 'jack.link':`, lines 1588 to 1607 before the cut.

~~~js
// ── the bay half of the JACK arm, 2026-10-11 ──────────────────────────
//
// 🔴 A BAY LINK BETWEEN TWO OF THIS BOARD'S AUDIO PORTS, BY ITS BAY IDS.
// `jack.link { link: "<from> -> <to>" }` with ids this board ANNOUNCES
// (`pi-1:circuit:audio-out -> pi-1:pappus:audio-in`). The board resolves
// them to JACK ports from its own announcement, never from the page's
// copy, turns the one link into its rows (`jackRows`: one to one, summed,
// or spread), plans them against the live graph, applies, and answers the
// graph READ BACK. `jack.unlink` takes the same line. `jack.links` lists
// what is held, each with whether its rows are on the graph now.
// 🔴 A BAY LINK IS KEPT, AND THE BOARD'S OWN RE-PATCHES KEEP IT (§5 item 6,
// decided here): `setBayRows` hands every held row to `jacksynth.mjs`, whose
// `wire()` adds them to every document and whose `jackChain` counts them as
// wanted, so `fx.pappus` and `jack.rebuild` no longer undo a page's link.
// ⚠️ AN UNLINK CUTS ONLY WHAT NOTHING ELSE WANTS. `yoshimi -> capture` as a
// bay link is the same two rows as the board's own chain, and unlinking it
// must not silence the room; a row the chain or another bay link still
// wants stays.
// ⚠️ TOKENLESS, LIKE `jack.apply` (the owner, §5 item 8: *"No owner"*).
// Every applied change is a journal line with who asked.
~~~

### link-field

Above `const [fromId, toId] = String(msg.link ?? '').split(/\s*->\s*/);`, lines 1611 to 1612 before the cut.

~~~js
// ⚠️ `link: "<from> -> <to>"`, NEVER `from` AND `to` AS FIELDS: `from` is
// the envelope's sender (wire.mjs), and `format()` throws on the collision.
~~~

### backoff

Above `let backoff = 500;`, lines 1682 to 1686 before the cut.

~~~js
// ---------------------------------------------------------------- the socket
//
// Reconnect forever. Nobody is in that room, so "it gave up after five tries"
// is the same as "it is dead" — but a tight retry loop against an edge that is
// down is a self-inflicted outage, so back off and cap.
~~~

### jack-announce

Above `const jack = samplerAvailable() || [...inputsCfg.inputs.values()].some((i) => i.`..., lines 1708 to 1711 before the cut.

~~~js
// `jack`: this board has a JACK graph, so its JACK ends are announced
// (graph-registry.mjs `boardGraph`). The sampler installed (it plays into the
// JACK capture) or an input on JACK; it read `jackSynthAvailable('yoshimi')`
// until Yoshimi left on 2026-10-13.
~~~

### every-message

Above `if (typeof msg.from === 'string') {`, lines 1726 to 1729 before the cut.

~~~js
// ⚠️ EVERY MESSAGE, NOT JUST THE ONES WITH A HANDLER. This is the only
// evidence the board has that a client is still at the other end, and a page
// that is merely LISTENING still polls. Dating it here rather than inside
// `handle()` means a verb nobody implements still proves somebody is there.
~~~

### rtc

Above `if (msg.type === 'rtc.offer' || msg.type === 'rtc.candidate') {`, lines 1739 to 1742 before the cut.

~~~js
// Signalling for the direct path arrives here and ONLY here, answered or
// refused out loud: a page waiting on an offer nobody reads waits three
// seconds in silence, which is what /concepts/sampler/035/ did until
// 2026-10-11. A `ctl` channel cannot open another peer (rtc.mjs).
~~~

### rejection

Above `Promise.resolve().then(() => handle(msg)).catch((err) => {`, lines 1748 to 1749 before the cut.

~~~js
// handle() is async now (raising a JACK chain takes seconds), so a throw
// arrives as a rejection — an unhandled one would take the service down.
~~~

### watchdog

Above `ws.__watchdog = setInterval(() => {`, lines 1767 to 1778 before the cut.

~~~js
/**
 * A DEAD SOCKET DOES NOT ALWAYS CLOSE. Measured 2026-09-10: the Durable
 * Object hibernated, the relay reported `sockets: 0`, and this process
 * carried on with `readyState === 1` sending into nothing. No error, no
 * close, no reconnect -- the board looked healthy and answered nobody, which
 * is the exact failure mode a service in another room cannot afford.
 *
 * The fix uses a property the relay documents: it echoes every message back
 * to the SENDER too. So the 5 s heartbeat is self-addressed proof of life --
 * if it has not come back for three beats the socket is gone whatever it
 * claims, and we reconnect rather than believe it.
 */
~~~

### alive

Above `function alive() {`, lines 1788 to 1799 before the cut.

~~~js
// Alive before you need it: a heartbeat means "the board is fine, the question is
// elsewhere" can be answered without going to the room.
// ⚠️ AND IT CARRIES THE INSERT NOW. Two pages share this board and neither
// could see the other change it; a heartbeat that already says what is playing
// is the cheapest place to say who the granulator belongs to, because a page
// learns about a change it did not make without asking for anything.
// ⚠️ ONE SHAPE, ONE PLACE. `sweepInsert()` sends this too, the moment it drops
// an insert, so a page does not wait up to five seconds to be told. Two copies
// of this object is how a field ends up on one of them.
// ✅ AND THE GRAPH SINCE 2026-10-04, so a page that joins between two hellos
// can draw this board within one beat (plans/plan-universal-routing.md §11).
// The shape itself is `beat.mjs`'s `aliveMsg`, where a test can read it.
~~~

### sweep-first

Above `sweepInsert('the page that asked for it stopped talking')`, lines 1807 to 1814 before the cut.

~~~js
// 🔴 SWEEP BEFORE THE BEAT, NOT AFTER IT. `sweepInsert` is async and sends
// its own beat when it drops something, so ordering it first means the room
// never gets a heartbeat announcing an insert the board has already decided
// is orphaned. It returns immediately when there is nothing to do, which is
// every beat but one.
// ⚠️ `.catch` IS NOT DECORATION HERE. This one is not awaited, so a throw out
// of `pappusFx` would be an UNHANDLED rejection on a timer, and an unhandled
// rejection takes the whole service down. Same reason `handle()` is wrapped.
~~~

### ctl-said

Above `let ctlSaid = { in: 0, out: 0 };`, lines 1821 to 1824 before the cut.

~~~js
// The control plane's own report, once a second and ONLY while something is
// moving. A page can hear the filter and cannot see what the board wrote, so
// `in` against `out` is the only place a fold is visible from the outside, and
// a report on a silent plane is a message a second spent saying nothing.
~~~

### sweep-orphans

Above `function sweepOrphans() {`, lines 1832 to 1842 before the cut.

~~~js
/**
 * ⚠️ Sweep orphans at startup. Audio children (jackd, a synth, an ffmpeg
 * capture) outlive a restarted service — systemd replaces the node process but
 * nothing reaps what it spawned. They then collide with the new chain: a stale
 * scsynth holding 33% of a core, two jack-dssi-hosts, and a capture whose jackd
 * somebody else killed, which presents as a board that answers pings and makes no
 * sound. Measured on the board twice.
 *
 * pkill -x, NEVER -f: the -f pattern would match this process's own command
 * line and kill the service being started.
 */
~~~

### orphan-names

Above `for (const name of ['fluidsynth', 'jack-dssi-host', 'yoshimi', 'sclang', 'scsynt`..., lines 1844 to 1859 before the cut.

~~~js
// ⚠️ `csound` STAYS IN THIS LIST THOUGH NOTHING HERE STARTS ONE ANY MORE. The
// reverb insert was a Csound process and was removed on 2026-09-17; a board
// that has not been rebooted since can still be holding one, and an orphan
// that survives a service restart keeps its JACK ports, so the next thing
// wanting those names patches into a process nobody is talking to. Audible,
// uncontrollable, and indistinguishable from the new one having failed. Same
// reasoning as `fluidsynth` below.
// ⚠️ `fluidsynth` AND `jack-dssi-host` STAY IN THIS LIST THOUGH NOTHING HERE
// SPAWNS THEM ANY MORE. The sweep runs at startup, and the run it has to
// survive is the one where the service restarts onto a NEW build while an old
// build's instrument is still holding the JACK graph. Removing them would
// strand exactly that board, and this list costs one `pkill` that finds
// nothing. See `archive/box-fluidsynth-hexter/`.
// `alsa_in` since 2026-10-11: an input on JACK (`inputs.mjs`) holds its
// device for as long as it runs, so one left by an old build would hold the
// Fast Track Pro and the new bridge would fail to open it.
~~~

### encoders

Above `sweepStrayEncoders((l) => log('video:', l));`, lines 1866 to 1871 before the cut.

~~~js
// ⚠️ AND THE VIDEO ENCODER, WHICH `sweepOrphans` CANNOT SAFELY REACH LATER.
// It runs `pkill -9 -x ffmpeg`, which at startup is fine because nothing is
// running — but the board's own audio capture is also an ffmpeg, so the same
// sweep during operation would silence the instrument. The video encoder is
// told apart by reading raw frames on stdin. An orphan here holds an exclusive
// device and makes the picture permanently unavailable.
~~~

### camera

Above `const camera = (DRY || ONCE) ? null : createCameraRoom({`, lines 1874 to 1877 before the cut.

~~~js
// ── the Pi camera, for holders of a key only ─────────────────────────────────
// camera.mjs has the why. It joins `<room>-cam` with BOARD_CAM_KEY and starts
// the camera only for a viewer the relay let into that room, never for a verb in
// this board's own tokenless room. With no key set it joins nothing.
~~~

### camera-found

Above `const cameraFound = !!camera?.enabled && findCamera().ok === true;`, lines 1889 to 1893 before the cut.

~~~js
// Whether the board announces `pi-1:camera` (graph-registry.mjs `boardGraph`):
// a key set AND a camera found. Asked ONCE here, because `findCamera` spawns
// `rpicam-hello` synchronously and the hello must not block on it; a camera
// plugged in later shows up at the next service restart. `camera.mjs` asks again
// on every start, so this decides only what is announced, never what runs.
~~~

### inputs

Above `const inputsCfg = parseInputs(process.env.BOARD_INPUTS || '');`, lines 1897 to 1900 before the cut.

~~~js
// ── hardware inputs, each in a room of its own ───────────────────────────────
// inputs.mjs has the why. Configured in /etc/default/positron-board as
// BOARD_INPUTS, and a bad entry is reported here and skipped rather than
// taking the board down.
~~~

### jackd-card

Above `{`, lines 1903 to 1905 before the cut.

~~~js
// 🔴 jackd ON AN INPUT'S CARD, SINCE 2026-10-11: set BEFORE anything can raise
// jackd, so the first server is already the right one (jacksynth.mjs
// `ensureJackd` has the measurement that asked for it).
~~~

### peer

Above `let PeerConnection = null;`, lines 1911 to 1916 before the cut.

~~~js
// 🔴 THE DIRECT PATH IS OPTIONAL, AND ITS ABSENCE IS NOT A FAULT. node-datachannel
// is this board's first npm dependency (rig/board/package.json, installed by
// push.sh and setup.sh), and a board without it runs exactly as before with the
// relay only. rtc.mjs has the why and the P0 measurement.
// ⚠️ ASKED FOR WHETHER OR NOT THERE ARE INPUTS, SINCE 2026-10-11: the main
// socket has the direct path too (below), and it was only loaded for inputs.
~~~

### main-direct

Above `mainDirect = createMainDirect({`, lines 1921 to 1927 before the cut.

~~~js
// 🔴 THE MAIN SOCKET'S DIRECT PATH, SINCE 2026-10-11. Until then only the input
// rooms (`<room>-<input>`, inputs.mjs) answered an offer, so a page in this room
// (`/concepts/sampler/035/`) offered into a socket that had no handler for it
// and waited three seconds in silence. The same handler as the relay, so a note
// over `ctl` for node `sampler` or for Yoshimi does what it does over the relay;
// the answer goes back on `ctl`. A ctl message has no `from`, so it is given
// one per peer and dated in `clientSeen` exactly as a relay message is.
~~~

### camera-direct

Above `camera,`, lines 1946 to 1947 before the cut.

~~~js
// The camera's frames may ride a page's direct link to an input, behind the
// camera's own two gates (camera.mjs `attachDirect`), since 2026-10-13.
~~~

## `rig/board/inputs.mjs`

### inputs-header

Above `import { CIRCUIT_CC } from '../../demo/shell/circuit-cc.mjs';`, lines 1 to 26 before the cut.

~~~js
// rig/board/inputs.mjs — hardware audio inputs, each streamed into a room of its own.
//
// Asked 2026-09-30: *"can we support both yoshimi and circuit? current setup
// does not scale"*. Until then the board had ONE audio slot and ONE room, so
// starting Yoshimi took the Circuit off the air and the other way round. The
// single slot was right about one thing and it stays right: two sources
// interleaved into ONE socket is corruption (board.mjs `startAudio` records
// the 5,495 dropped frames). What this file changes is the unit. An input is
// not a source in the instrument slot, it is a stream of its own, on a socket
// of its own, in a room of its own: `<room>-<name>`, the same shape the video
// already uses with `<room>-video`.
//
// 🔴 A PAGE ASKS FOR A NAME, NEVER A DEVICE. What `circuit` means on this
// board is configuration (`BOARD_INPUTS` in /etc/default/positron-board), so
// nothing that arrives over the relay can make this process open an arbitrary
// ALSA device.
//
// 🔴 AN INPUT RUNS ONLY WHILE SOMEBODY IS ASKING FOR IT. The board cannot see a
// listener: the relay forwards frames verbatim and never says who is there. So
// a listening page renews a lease with `input.want`, and the capture stops
// `LEASE_MS` after the last renewal. Streaming 50 frames a second into an empty
// room all day costs relay time for nothing.
//
// ⚠️ THE ROOM IS JOINED FOR GOOD, THE DEVICE IS NOT. The socket stays open and
// says `board.alive` every beat, so a page's presence badge reads `online`
// before anything is playing; only `arecord` comes and goes with the lease.
~~~

### synth-cc

Above `export const SYNTH_CC = new Set(CIRCUIT_CC.filter((p) => p.ch === '1/2').map((p)`..., lines 36 to 54 before the cut.

~~~js
/**
 * 🔴 THE SYNTH CONTROLLERS, READ FROM THE ONE TABLE `/shape/` SENDS FROM, AND
 * ONLY ITS `1/2` ROWS. Asked 2026-09-30: *"make it work with pi circuit"*, so
 * the gate below widened from note on, note off and CC 123 to those plus the
 * 52 control changes Novation's Programmer's Reference documents for Synth 1
 * and Synth 2. Imported rather than copied, because a second list is a second
 * list that disagrees; `setup.sh` already carries every `../../demo/shell`
 * import onto the board.
 * 📄 READ, NOT MEASURED, AND THE SOURCE IS `plans/plan-circuit-patches.md` §5
 * and its list of what destroys work: the Circuit's whole published SysEx
 * surface is three messages and only `Replace Patch` writes flash; a program
 * change and a `Replace Current Patch` replace the sound in RAM; a control
 * change is on neither list. What it changes is the patch a synth is holding,
 * which reloading the session puts back.
 * ⚠️ AND THE DRUM AND SESSION ROWS STAY OUT ON PURPOSE. CC 8, 18, 44 and 50 on
 * channel 10 are `drum N patch select`, and channel 16 holds the session's
 * levels; neither was asked for, and a gate that grows with the table's other
 * rows grows by accident.
 */
~~~

### dump-request

Above `export const DUMP_REQUEST_HEAD = Object.freeze([0xF0, 0x00, 0x20, 0x29, 0x01, 0x`..., lines 58 to 72 before the cut.

~~~js
/**
 * 🔴 THE ONE SysEx THE GATE LETS OUT, SINCE 2026-10-11, AND IT IS A READ.
 * Asked as *"show initial patch name on selector"* for `/concepts/synth/070/`,
 * option 1 chosen verbatim. 📄 Circuit Programmer's Reference Guide 1.3, p13,
 * read off the table rather than the plans (which disagree, 9 against 10):
 *   F0 00 20 29 01 60 40 <00|01> F7, "9 bytes in total"
 * The Circuit answers with a 350 byte Replace Current Patch on its USB port,
 * which is a message FROM the instrument and is never written back to it.
 * ⚠️ MATCHED BYTE FOR BYTE AND BY LENGTH, NEVER BY PREFIX. A Replace Current
 * Patch (command 00) and a Replace Patch (01, which writes flash) share this
 * header and differ from the request in byte 6 and in length, so a prefix test
 * on the header is exactly the gate that lets the dangerous ones through.
 * `test.mjs` sabotages this and counts the reds.
 * Returns the location, 0 for Synth 1 and 1 for Synth 2, or null.
 */
~~~

### device-inquiry

Above `export const DEVICE_INQUIRY = Object.freeze([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]`..., lines 82 to 90 before the cut.

~~~js
/**
 * 🔴 AND THE SECOND, THE UNIVERSAL DEVICE INQUIRY, SINCE 2026-10-11. Asked
 * *"Add it and test"*, after the dump request went unanswered on this desk,
 * to learn whether this Circuit answers SysEx at all. 📄 MIDI 1.0 General
 * Information, Identity Request: F0 7E <device> 06 01 F7. Device 7F is the
 * all call, and nothing documented says the Circuit needs 00, so 7F only. It
 * asks a device to say who it is and changes nothing. Exact bytes, exact length:
 * 06 02 is the REPLY and must never leave this board.
 */
~~~

### identity-reply

Above `export function isIdentityReply(msg) {`, lines 95 to 101 before the cut.

~~~js
/**
 * An Identity Reply from Novation: F0 7E <device> 06 02 00 20 29, then family,
 * model and version, then F7. 📄 That is 17 bytes for a three byte manufacturer
 * id; a little slack either way is allowed, because the point of asking is to
 * learn what this unit sends, and a reply refused for its length would read as
 * no reply at all.
 */
~~~

### patch-reply

Above `export function isPatchReply(msg, loc) {`, lines 109 to 114 before the cut.

~~~js
/**
 * The reply, recognised by its whole shape: 350 bytes, Novation's Circuit
 * header, command 00 (Replace Current Patch, which is what the Circuit sends
 * back), the location that was asked for, a reserved 00, 340 seven bit data
 * bytes and F7. Anything else the Circuit says is not passed on.
 */
~~~

### sysex-catcher

Above `export function createSysexCatcher(max = 400) {`, lines 123 to 128 before the cut.

~~~js
/**
 * SysEx messages out of a raw MIDI byte stream. Real time bytes (F8 to FF) may
 * sit anywhere, inside a SysEx too, and are dropped; any other status byte ends
 * a SysEx that never closed and it is thrown away. A message longer than `max`
 * is abandoned rather than grown, so the Circuit cannot fill this with clock.
 */
~~~

### midi-verdict

Above `export function midiVerdict(bytes, channels) {`, lines 151 to 174 before the cut.

~~~js
/**
 * 🔴 WHAT A PAGE MAY SEND AN INSTRUMENT, AND IT IS AN ALLOWLIST.
 * Note on, note off and CC 123 all notes off, on the channels the config
 * names, and since 2026-09-30 the synth control changes in `SYNTH_CC` on
 * channels 1 and 2 only. Everything else is REFUSED, and the reason is the
 * instrument on the desk: a factory reset brings back none of the owner's sessions, a SysEx `Replace
 * Patch` writes flash, and a program change on channel 16 selects a session
 * over whatever is being worked on (CLAUDE.md, `plans/plan-circuit-patches.md`).
 * No SysEx, no bank select, no NRPN or RPN (CC 98 to 101 and data entry 6
 * and 38 are not in the table), no channel mode message but 123. A relay room
 * is reachable by anybody who knows its name, so what arrives over it is
 * decided here and not by the page that sent it.
 * ⚠️ AND SINCE 2026-09-30 ONE PROGRAM CHANGE: patches 0 to 63 on channels 1
 * and 2, asked for as a patch selector on `/away/` (*"ok go"*). 📄 The
 * Circuit's own table (`plans/plan-circuit-model12.md` §3.7): on 1 and 2 it
 * selects a synth patch, into RAM; on 16 it selects a SESSION, instantly from
 * 0 to 31 and queued from 64 to 95, over whatever is being worked on. So it is
 * the synth channels only and never 16, and 64 to 127 are refused as well,
 * because they are not patches on 1 and 2 and ARE sessions on 16.
 * ⚠️ AND SINCE 2026-10-11 TWO SysEx, both reads: the nine byte Current Patch
 * Dump Request (`dumpRequestSynth` above, a pass carries `dump`, the location)
 * and the six byte Device Inquiry (`isDeviceInquiry`, a pass carries
 * `identity`). Nothing else. The handler listens for the answer to either.
 */
~~~

### refusal-kind

Above `return v.ok ? v : { ...v, kind: Array.isArray(bytes) ? kindOf(bytes) : 'other' }`..., lines 177 to 178 before the cut.

~~~js
// A refusal names its kind in the vocabulary `bay.mjs` and `alsa.mjs` use,
// so a log line and a patch talk about the same thing (2026-10-03).
~~~

### parse-inputs

Above `export function parseInputs(text) {`, lines 216 to 222 before the cut.

~~~js
/**
 * `BOARD_INPUTS` is JSON: `{"circuit":{"device":"hw:CARD=Pro,DEV=0","channels":2,"take":1}}`.
 * JSON rather than a delimited string because an ALSA device name already
 * contains `:` and `,`, which is where a hand-rolled format goes wrong.
 * Returns every valid input and a reason for every refused one; a bad entry
 * never takes the good ones down with it.
 */
~~~

### via

Above `const via = v.via ?? 'arecord';`, lines 250 to 253 before the cut.

~~~js
// 🔴 `via`, SINCE 2026-10-11: `arecord` (the default, and what every board
// provisioned before this does) or `jack`, which puts the input on the
// board's JACK graph as `<name>:capture_N` so a bay link can patch it
// inside the Pi. See `createInputs` for what changes and what does not.
~~~

### jackd

Above `let jackd = null;`, lines 256 to 264 before the cut.

~~~js
// 🔴 `jackd`, SINCE 2026-10-11: this input's card is jackd's own device,
// so it is the clock and `alsa_in` is not used (`jacksynth.mjs`
// `ensureJackd` has the measurement). `true` or `{ period, periods }`.
// Only on `via: "jack"`, and only one input: there is one jackd.
// ⚠️ 512 x 3 BY DEFAULT, MEASURED 2026-10-11 on the Pi 4 (jackd is not
// realtime here): at 256 x 3 about ten xruns while sclang compiles and a
// few a minute with Yoshimi and the granulator playing; at 512 x 3 one at
// the compile and none in 100 s of the same load. 512 is 10.7 ms, the same
// as arecord's 480 frame period, so the Circuit is no later for it.
~~~

### take-channel

Above `export function takeChannel(all, channels, take, frame) {`, lines 280 to 284 before the cut.

~~~js
/**
 * One channel out of an interleaved frame. `take` is 1-based.
 * ⚠️ Not a downmix: an input with nothing patched still has its gain up and
 * its own noise, and summing it in would put that under the instrument.
 */
~~~

### byte-order-steps

Above `export function byteOrderSteps(all, channels) {`, lines 292 to 305 before the cut.

~~~js
/**
 * How far the high byte moves from one sample to the next, read as the device
 * says (`le`) and byte swapped (`be`), summed over one interleaved block.
 *
 * 🔴 THE FAST TRACK PRO SENT BIG ENDIAN WHILE ALSA SAID S16_LE. MEASURED
 * 2026-09-30 on the Pi, with a bare `arecord` and no board code: every sample's
 * low byte was 0x00 or 0xFF, a quiet Circuit read -17 to -32 dBFS of hiss, and
 * the same bytes swapped read -65 to -80 dBFS with a peak of 18. It had been
 * little endian that morning, and a USB re-authorize did not bring it back.
 * ⚠️ WHY THE HIGH BYTE: in audio read the right way round it is the slow part
 * of a sample, so its steps are small at any level. Read the wrong way round it
 * is the fast part. Lag-1 correlation of the whole sample could not tell them
 * apart (0.986 both ways), because the sign byte dominates either reading.
 */
~~~

### byte-order

Above `export function createByteOrder({ channels, windowSamples = 12_000, onChange = (`..., lines 316 to 321 before the cut.

~~~js
/**
 * Decides, and keeps deciding, whether a capture needs its bytes swapped. A
 * verdict needs a quarter second of evidence and one reading at least twice as
 * steady as the other, so digital silence and a close call change nothing.
 * `fix(all)` swaps in place when it has decided so, and says when it changes.
 */
~~~

### create-inputs

Above `export function createInputs({`, lines 347 to 350 before the cut.

~~~js
/**
 * The live half. Everything that touches a socket or a process comes in as an
 * argument, so a test can run it against fakes.
 */
~~~

### input-camera

Above `camera = null,`, lines 363 to 366 before the cut.

~~~js
// The Pi camera's keyed room (camera.mjs `createCameraRoom`), or null. Since
// 2026-10-13 a page holding the camera key may have the camera's frames on
// its direct link to an input, on a third data channel `cam`, instead of
// through the relay. camera.mjs decides; this only hands it the channel.
~~~

### on-jack

Above `const onJack = cfg.via === 'jack' && !!jack;`, lines 382 to 406 before the cut.

~~~js
// 🔴 AN INPUT ON JACK, SINCE 2026-10-11 (plans/plan-nodes-revisited.md §5
// item 9; the owner: *"Ciruit is on now, do via jack"*). Two processes
// instead of one:
//   alsa_in -j <name>     the device onto the graph as `<name>:capture_N`.
//                         ALWAYS ON while the board runs, because a bay link
//                         into the granulator has to work with nobody
//                         listening to the input's room. It costs 3.4 per
//                         cent of one core steady (MEASURED with `top` on the
//                         Pi 4) and no relay time at all.
//   ffmpeg -f jack        the room's stream, read back OFF the graph from
//                         `pos<name>:input_1`, which is fed `<name>:capture_N`
//                         through `jack.mjs`. LEASED exactly as `arecord` was,
//                         so a room nobody is in still costs nothing.
// 🔴 `plughw:`, NOT `hw:`, AND IT IS A MEASUREMENT. `alsa_in -d hw:CARD=Pro`
// on the Fast Track Pro read the input 48.2 dB HOT, which is a factor of 256:
// a floor of -48 dBFS where `arecord` reads -93.1 on the same card the same
// minute, and a Circuit note clipped flat at 32512. Through `plughw:` the
// floor is -93.1 with a peak of 1, the same as `arecord`. alsa_in's own S16
// path is the suspect and was not chased further.
// ⚠️ AND THE BYTE ORDER FIX DOES NOT RUN ON THIS PATH. `createByteOrder`
// repairs a device that sends big endian S16 under an S16_LE label, which
// this card did on 2026-09-30 and 2026-10-01. alsa_in resamples before
// anything here sees a sample, and a resampled swap cannot be swapped back.
// Not seen since 2026-10-01 in the journal; if it comes back, `via:
// "arecord"` is the one line that restores the repaired path.
~~~

### on-card

Above `s.onCard = j?.card === cfg.name;`, lines 451 to 454 before the cut.

~~~js
// 🔴 jackd OWNS THIS CARD: the port is jackd's own `system:capture_N`,
// shown as `<name>:capture_N` by `jack.mjs`, so there is nothing to
// bridge and nothing to resample. An `alsa_in` here would only fail to
// open a card jackd holds.
~~~

### period

Above `const p = spawn('arecord', ['-D', cfg.device, '-f', 'S16_LE', '-r', String(rate)`..., lines 488 to 493 before the cut.

~~~js
// 🔴 A SHORT PERIOD, OR THE AUDIO LEAVES IN 125 ms LUMPS. MEASURED
// 2026-09-30 on the Fast Track Pro: with no period asked for, ALSA gave
// arecord 6000 frames a period in a 24000 frame buffer, so a note waited
// up to 125 ms before this process saw it, the frames reached a browser
// in bursts (p90 gap 117 ms), and the page needed a 160 ms cushion to
// ride them. Press to arrival read 151 to 180 ms.
~~~

### half-frames

Above `const IN = UNIT * 2 * cfg.channels;`, lines 497 to 499 before the cut.

~~~js
// ⚠️ READ IN HALF FRAMES WHEN A FRAME HALVES. The direct path sends 10 ms
// as soon as 10 ms exists, which is the point of it; the relay still gets
// its 20 ms frame, at the same moment it always did, out of two halves.
~~~

### midi-dev

Above `function midiDev() {`, lines 575 to 578 before the cut.

~~~js
// ── notes out, to the instrument's own raw MIDI port ────────────────────
// ⚠️ THE CARD IS RESOLVED BY NAME EVERY TIME IT IS OPENED. A card number is a
// position in a list that moves when anything is plugged in, which is the
// avfoundation-index lesson from rig/m1 in its ALSA costume.
~~~

### nonblock

Above `s.midiFd = fs.openSync('/dev/snd/midiC${n}D0', FS.O_WRONLY | FS.O_NONBLOCK);`, lines 588 to 595 before the cut.

~~~js
// 🔴 NON-BLOCKING, MEASURED 2026-10-03 ON THIS BOARD: while any ALSA
// sequencer subscription into the Circuit exists, a plain open of its raw
// device for write does not fail, it WAITS, and a synchronous open here
// would freeze the whole board on its first note. With O_NONBLOCK a busy
// device is EBUSY at once, which the catch in `midiWrite` logs by name.
// ⚠️ It makes writes non-blocking too, so a full output buffer is EAGAIN
// and that message is dropped and logged rather than waited for. The
// buffer is 4 KB, about 1,300 note offs, so a panic still fits.
~~~

### cc123

Above `else if (kind === 0xB0 && a === 123) for (const k of [...s.held]) if (k.startsWi`..., lines 609 to 612 before the cut.

~~~js
// ⚠️ ONLY CC 123 LETS GO OF A CHANNEL'S NOTES. Every control change used
// to, which was harmless while 123 was the only one allowed; with the
// synth controls through, a filter sweep under a held note would have
// emptied this set and the lease's panic would have left the note on.
~~~

### finish-dump

Above `function finishDump(d, body) {`, lines 617 to 628 before the cut.

~~~js
// ── the one thing read back: the patch a dump request asks for ──────────
// 🔴 THE INPUT IS OPENED ONLY WHILE AN ANSWER IS EXPECTED, AND BEFORE THE
// REQUEST IS WRITTEN, AND READ ONCE BEFORE IT TOO (see `askBack`). A raw
// MIDI input buffers nothing until it is open AND triggered by a read, so
// opening it after the write could miss an answer that came back fast; and
// holding it open between requests would keep a device somebody else may
// want. MEASURED 2026-10-11 on the board: `/proc/asound/Circuit/midi0`
// showed Input 0 with no owner and the Circuit sending (Rx 130,660 bytes,
// its clock), so the input is free and has to be filtered.
// ⚠️ NON-BLOCKING AND POLLED every 10 ms, for the same reason as the write
// side: a blocking read with nothing to read never returns, and a thread
// parked in one cannot be taken back.
~~~

### shared-input

Above `if (d.fd !== null) {`, lines 657 to 659 before the cut.

~~~js
// ⚠️ WHILE THE MACRO LISTENER HOLDS THE INPUT, IT READS AND HANDS EVERY
// CHUNK TO `feedDump`, because a raw MIDI input opens once: a second open
// for the question would be EBUSY. This only keeps the clock.
~~~

### macro-back

Above `const BACK_POLL_MS = 20;`, lines 681 to 689 before the cut.

~~~js
// ── the macro knobs, turned by hand on the instrument, told to the room ──
// 🔴 midi-back.mjs has the why and the allowlist. Open only while a page
// holds the lease, like the capture: nobody listening, nothing read.
// ⚠️ NON-BLOCKING AND POLLED, for the reason the dump's reader is: a
// blocking read with nothing to read never returns. Every 20 ms, which is
// under the 33 ms the limiter lets out per controller.
// ⚠️ A BUSY INPUT IS SAID ONCE AND RETRIED ON THE BEAT, never thrown: an
// ALSA sequencer subscription to the instrument holds it, and a page that
// cannot see hand turns still plays.
~~~

### cc-direct

Above `if (s.rtc?.broadcast({ type: 'midi.cc', input: cfg.name, ch, cc, v, path: 'direc`..., lines 705 to 706 before the cut.

~~~js
// And on every direct link, marked, so a page on one does not wait
// for the relay's copy and can drop it (remote/010, 2026-10-13).
~~~

### pre-read

Above `const pre = Buffer.alloc(1024);`, lines 773 to 783 before the cut.

~~~js
// 🔴 READ ONCE BEFORE THE REQUEST IS WRITTEN, BECAUSE OPENING THE INPUT IS
// NOT ENOUGH. MEASURED 2026-10-11 on this board: snd-usb-audio runs its
// input URBs from probe and DROPS what arrives for a substream that is open
// but not yet triggered, and the trigger is the first read or poll. The
// Circuit answers the Device Inquiry faster than the first poll 10 ms
// later, so the reply was thrown away in the kernel and never even counted
// in `/proc/asound/Circuit/midi0` Rx, while the clock after it was. Same
// script, same minute: read first, 17 byte identity 2 of 2; write first,
// nothing 2 of 2. amidi does this too ("trigger reading"). A zero length
// read does not do it from node, which returns before the syscall. What
// this read drains came before the question, so it cannot be its answer.
~~~

### cam-direct

Above `const camId = (peerId) => '${cfg.name}:${peerId}';`, lines 812 to 819 before the cut.

~~~js
// ── the Pi camera on a direct link ──────────────────────────────────────
// 🔴 ONLY OVER `ctl`, AND camera.mjs DECIDES. `cam.direct` carries the
// camera key and the page's viewer name in the keyed camera room. Over the
// relay it is refused without a look, because this room is tokenless and a
// key sent here would be a key told to everybody in it. Over `ctl` the
// camera checks the key against BOARD_CAM_KEY AND that the viewer is one
// the relay let into `<room>-cam` (so the relay's own key check passed
// first); only then are frames sent on the peer's `cam` channel.
~~~

### cam-wait

Above `function camDirect(msg, reply, peerId, waited = 0) {`, lines 821 to 826 before the cut.

~~~js
// ⚠️ THE ASK CAN OVERTAKE ITS CHANNEL. MEASURED 2026-10-13 against the Pi:
// the page's `cam` channel was open on its side and `cam.direct` on `ctl`
// still reached this handler before node-datachannel had told rtc.mjs
// about the new channel, so the first ask was refused and the camera went
// direct only on the retry 1.5 s later. So a missing channel is waited for,
// 25 ms at a time for half a second, before it is refused.
~~~

### pad-light

`isPadLight` in `rig/board/inputs.mjs`, added 2026-11-25 on *"i'd like screen functuoanlty"* (the Circuit's pads as a
display). Read out of stock firmware 3592 by disassembly, not yet sent to the instrument:
`research/circuit-firmware-2026-11-25.md` section 11. The SysEx handler at `0x0801E484` matches `F0 00 20 29 01 60`,
runs the patch callback (`0x08014104`, which acts only on command `00`, `01`, `40` and `43` and returns on anything
else), then switches on byte 6. Command `74` takes LED, R, G, B (0 to 63, scaled to 0 to 255) and calls the LED
setter `0x0800C868`, which writes the "target" layer the compositor adds to the UI's colours; the UI never clears
it, so a light holds. **The firmware does not bound the LED index**: 69 LEDs use 207 channels, and an index past 68
reads the channel map out of range and writes past the 207 byte array at `0x20001846`, toward the USB flag at
`0x20001948`. So the gate takes exactly 12 bytes, LED 0 to 68, colours 0 to 63, and nothing next to it: `70` writes a
raw channel, `71` to `73` are unknown routines and a reply, and none of them passes.
