// The story order and what each demo is, once; the front page, the build and verify.mjs read it.
// Order is the array; identity is the slug. Fields: built, page, src (a page outside demo/), one,
// tags (caps.mjs reads requirements), why, room ('fixed' = an address, not a rendezvous), created.
// why: lessons/manifest.md#fields

// The requirement table lives in demo/shell/caps.mjs beside its probes, read here at render time.
// why: lessons/manifest.md#caps
import { needsOf } from './shell/caps.mjs';
import { cardHTML } from './shell/card.mjs';

// No article in an act title: a title is a name.
// why: lessons/manifest.md#acts
export const ACTS = new Map([
  [0, 'substrate'],
  [1, 'one stream'],
  [2, 'many people'],
  [3, 'capture and return'],
  [4, 'instruments'],
  [5, 'archives'],
  [6, 'composition'],
]);

export const DEMOS = [
  // why: lessons/manifest.md#csound
  { name: 'csound', group: 'technologies', act: 0, created: '2026-09-07', built: true, unlisted: true,
    one: 'Csound scores turned into timelines you can start anywhere, whether typed here or written for U:\u2019s vClick click track.',
    tags: ['timeline', 'Csound', 'WebAudio'] },
  // why: lessons/manifest.md#click

  // why: lessons/manifest.md#llhls
  { name: 'llhls', group: 'streaming', act: 1, created: '2026-09-04', built: true, unlisted: true,
    one: 'the tuned low-latency player, whose live input was retired on 2026-10-13',
    tags: ['LL-HLS', 'Stream', 'container'],
    // A press answers at once in every tier, so no long settle.
    // why: lessons/manifest.md#llhls-settle
    lightSettleMs: 1000 },
  // why: lessons/manifest.md#webrtc
  { name: 'webrtc', group: 'streaming', act: 1, created: '2026-09-04', built: true, unlisted: true,
    one: 'the test picture over WHEP, a leg retired on 2026-10-13',
    tags: ['WebRTC', 'WHEP', 'Stream'],
    // A press answers at once in every tier.
    // why: lessons/manifest.md#webrtc-settle
    lightSettleMs: 1000 },
  // why: lessons/manifest.md#moq
  { name: 'moq', group: 'streaming', act: 1, created: '2026-09-05', built: true, unlisted: true, settleMs: 30000, lightSettleMs: 1000,
    one: 'the same test picture the other streaming pages play, sent from this browser over MoQ and back',
    tags: ['MoQ', 'WebTransport', 'WebCodecs'] },
  // One press starts getUserMedia, a WHIP publish, a WHEP play back and a MoQ loopback, and the
  // checks
  // wait for 30 timed frames per leg, so the first asserts land late.
  // why: lessons/manifest.md#cam
  { name: 'cam', group: 'streaming', act: 1, created: '2026-09-30', built: true, unlisted: true, settleMs: 45000, lightSettleMs: 3000,
    // Its LL-HLS leg is retired; the panel stays and says so.
    // why: lessons/manifest.md#cam-llhls
    one: 'one webcam next to what comes back over WebRTC and MoQ',
    tags: ['getUserMedia', 'WebRTC', 'WHIP', 'MoQ'] },

  // why: lessons/manifest.md#room-items

  // `gl: true` puts it in verify-gl.mjs: verify.mjs runs --disable-gpu, where WebGL2 is null.
  // why: lessons/manifest.md#mirror
  { name: 'mirror', group: 'th', act: 0, created: '2026-09-11', built: true, unlisted: true, gl: true, xr: true, settleMs: 5000, room: 'fixed',
    one: 'the same shader drawn by your browser and by a Raspberry Pi, side by side',
    tags: ['WebGL2', 'WebCodecs', 'H.264', 'WS'] },


  // `gl: true` as for mirror. settleMs covers a distance transform per word (about 25 ms each) and
  // checks that draw every word off-screen twice.
  // why: lessons/manifest.md#weight
  { name: 'weight', group: 'th', act: 0, created: '2026-09-15', built: true, unlisted: true, gl: true, xr: true, settleMs: 8000,
    one: 'one sentence broken across four walls, each word as big as it is short and none of them turning to face you, and any word retyped where it stands',
    tags: ['WebXR', 'WebGL2', 'fonts'] },

  // The XR row with no `gl: true`: its subject is sound, and xr-panel.mjs builds no context until
  // Enter VR. It reads our own R2 worker, never a third-party mount. settleMs covers two watch
  // windows and a gate.
  // why: lessons/manifest.md#sound-xr

  // Its checks run before ready, so the boot wait is the check pass (3.8 s measured).
  // why: lessons/manifest.md#wire
  { name: 'wire', group: 'technologies', act: 2, created: '2026-09-10', built: true, unlisted: true, bootMs: 20000, room: 'fixed',
    one: 'A message as the exact bytes that travel, and a note as how late it lands on another machine.',
    tags: ['WS', 'DO', 'SQLite'] },

  // settleMs sizes the wait for the first assert, which sits behind a recording to a 10 s cap or
  // two laps of a real picture; the page has no control row.
  // why: lessons/manifest.md#replay


  // A deck positioned in 1965, a negative epoch. Catalogue metadata is committed; media streams
  // from ERR.
  // why: lessons/manifest.md#reel
  { name: 'reel', group: 'err', act: 5, created: '2026-09-08', built: true, unlisted: true,
    one: 'every 1965 newsreel in ERR\'s archive is a mark on one line at the day it was broadcast',
    tags: ['archive', 'timeline'] },
  // `gl: true` as for mirror; verify-gl.mjs is the grader.
  // why: lessons/manifest.md#floor
  { name: 'floor', group: 'err', act: 5, created: '2026-09-14', built: true, unlisted: true, gl: true, xr: true,
    one: 'every 1965 newsreel face up on a floor you walk over, and any of them plays where it lies',
    tags: ['WebGL2', 'WebXR', 'archive', 'HLS'],
    // 298 thumbnails arrive as you look at them; a cold floor is a few seconds
    // of fetching before there is much to see
    settleMs: 4000 },
  // 122 references from fourteen archives, nothing copied; demo/resources/build-corpus.mjs gathers
  // it.
  // why: lessons/manifest.md#resources
  { name: 'resources', group: 'kurenniemi', act: 5, created: '2026-09-14', built: true, unlisted: true,
    one: 'every reachable source for Erkki Kurenniemi\'s work, one row each',
    tags: ['archive', 'provenance'] },
  // The same corpus on an axis: one mark per record, the openable ones pressable.
  // why: lessons/manifest.md#tapes
  { name: 'tapes', group: 'kurenniemi', act: 5, created: '2026-09-15', built: true, unlisted: true,
    one: 'every Erkki Kurenniemi recording that plays, laid end to end as one long tape',
    tags: ['timeline', 'uncertainty', 'archive'] },
  // Files we hold (mimproject.org is down); its corpus is separate, see build-mimproject.mjs.
  // why: lessons/manifest.md#making
  { name: 'making', group: 'th', act: 5, created: '2026-09-19', built: true, unlisted: true,
    one: 'the recordings and the pictures that outlived MIMproject\'s own website, shown from the table under whichever one you are looking at',
    tags: ['archive', 'provenance', 'R2'] },
  // A score drawn on a line; the piece is Liis Vares and Taavet Jansen's (elektron.art).
  // why: lessons/manifest.md#held
  { name: 'held', group: 'th', act: 6, created: '2026-09-19', built: true, unlisted: true,
    // sizes the wait for the page's first assert, which sits behind one local
    // read of a 99 KB file. Nothing here has a control to press.
    settleMs: 4000,
    // why: lessons/manifest.md#held-one
    one: 'Held in Human, played back from its own score',
    tags: ['timeline', 'uncertainty', 'canvas'] },
  // why: lessons/manifest.md#deck
  { name: 'deck', group: 'kurenniemi', act: 5, created: '2026-08-28', built: false, unlisted: true, page: '/proto/deck/',
    one: "Erkki Kurenniemi's corpus on one deck, media from archive.org",
    tags: ['timeline', 'not shelled'] },
  // megatimeline and remixer are archived; proto/remixer/hls.min.js stays because pages load it.
  // why: lessons/manifest.md#megatimeline

  // Its checks run before ready (about 20 s ordinary, 33 s deep); bootMs is a ceiling. A deep run
  // reads ROUND TRIP's retired leg red, as expected.
  // why: lessons/manifest.md#capture
  { name: 'capture', group: 'capture', act: 4, created: '2026-09-05', built: true, unlisted: true, bootMs: 70000, lightSettleMs: 2000,
    one: 'Recording what came over a link, from a take on this machine to the far end of a live connection.',
    tags: ['getUserMedia', 'MediaRecorder', 'R2', 'WHIP', 'WHEP', 'WebRTC', 'timeline'] },
  // the first page where all three legs meet: live over a real WebRTC hop, the
  // FAR END of that hop recorded, and the recording scrubbed on the deck

  // The `shout` page is archived; workers/shout stays, it carries the plain-HTTP mount to https
  // pages.
  // why: lessons/manifest.md#shout

  // A station on plain HTTP port 8001 that an https page cannot load without the relay. settleMs is
  // for the first assert, behind a wasm scsynth boot, 31 buffers, a ring fill and level checks.
  // why: lessons/manifest.md#archive-radio
  { name: 'archive/radio', rank: 0, group: 'vain', act: 5, created: '2026-09-14', built: true, unlisted: true, settleMs: 60000, lightSettleMs: 15000,
    one: 'six live radio stations from Tallinn and Helsinki, granulated in the tab by hand, or by sliders that sweep themselves back and forth',
    tags: ['Icecast', 'Workers', 'WebAudio', 'live'] },
  // `gl: true` as for mirror. Imports radio-gran.mjs; settleMs covers a whole boot (relay health,
  // decoder, scsynth, 31 buffers, ring fill) before the first check.
  // why: lessons/manifest.md#videoradio
  { name: 'videoradio', group: 'vain', act: 5, created: '2026-09-15', built: true, unlisted: true,
    gl: true, settleMs: 45000, lightSettleMs: 2000,
    one: 'a radio station fed through a granulator, playing itself',
    tags: ['WebGL2', 'Icecast', 'WebAudio', 'live'] },
  // why: lessons/manifest.md#crate-station


  // Library machinery with a picture on it; touches nothing outside the page. Panels drawn from
  // Novation's artwork and measured MIDI; unbound buttons are marked, not guessed.
  // why: lessons/manifest.md#circuit
  { name: 'circuit', group: 'instruments', act: 4, created: '2026-09-21', built: true, unlisted: true,
    one: 'a Novation Circuit on screen, moving when the real one moves',
    tags: ['WebMIDI', 'CoreMIDI'] },

  // Say what you want and the desk proposes a patch; a row that exists is connected, `x` removes
  // it.
  // An answer lands only out of a press. Needs `node demo/wish-local.mjs` running.
  // why: lessons/manifest.md#wish
  { name: 'wish', group: 'instruments', act: 4, created: '2026-09-21', built: true, unlisted: true,
    one: 'say which instrument should play which, and a language model makes the connection on the desk',
    tags: ['WebMIDI', 'Workers AI', 'getUserMedia'] },
  // why: lessons/manifest.md#patchbay
  { name: 'patchbay', group: 'instruments', act: 4, created: '2026-10-04', built: true, unlisted: true,
    one: 'A universal patchbay that links notes, sound, video and code between this browser and the studio\u2019s Raspberry Pi, checking every link before it opens.',
    tags: ['WebCodecs'] },
  // why: lessons/manifest.md#partitur
  { name: 'partitur', group: 'bauhaus', act: 4, created: '2026-10-04', built: true, unlisted: true,
    one: 'Moholy-Nagy\u2019s 1924 score for a mechanical variety act, played as a timeline whose light any other screen can show as a projection wall.',
    tags: [] },
  // The timeline pages as tabs; checks and four bar drills run before ready (6.3 to 6.6 s), so it
  // declares its own wait.
  // why: lessons/manifest.md#time
  { name: 'time', group: 'technologies', act: 0, created: '2026-10-04', built: true, unlisted: true, bootMs: 12000,
    one: 'The clock every page here runs on, and what is built on it, from beats and loops to scores and dates two thousand years long.',
    tags: ['timeline', 'WebAudio', 'canvas'] },
  // The check pass runs before ready, 8.3 to 9.0 s.
  // why: lessons/manifest.md#sync
  { name: 'sync', group: 'technologies', act: 4, created: '2026-10-04', built: true, unlisted: true, bootMs: 14000,
    one: 'Four ways two places agree on when something happens, from firing on arrival to lining up on a recording.',
    tags: ['DO', 'WS', 'relay', 'HLS', 'R2', 'timeline'] },

  // The patch model and validator live in demo/shell/bay.mjs, graded by bay-test.mjs.
  // why: lessons/manifest.md#bay

  // Control changes only, never SysEx (one byte separates a RAM patch from a flash write). It
  // cannot
  // read the instrument, hence `put back`. settleMs is for the 7000 ms hand sweep.
  // why: lessons/manifest.md#shape
  { name: 'shape', group: 'instruments', act: 4, created: '2026-09-21', built: true, unlisted: true, settleMs: 4000,
    one: "edit a Novation Circuit's sound while it is playing, plugged in here or on a Raspberry Pi in another building, with sliders that can move themselves",
    tags: ['WebMIDI', 'CoreMIDI', 'WS', 'relay', 'PCM', 'live board'] },

  // Reads and never sends (a send path beside the only backup is refused); asserted over a
  // requestMIDIAccess counter. The session pack is not published. settleMs is for the reading.
  // why: lessons/manifest.md#pack
  { name: 'pack', group: 'instruments', act: 4, created: '2026-09-21', built: true, unlisted: true, settleMs: 3000,
    one: 'open a Circuit pack or any zip of WAVs and look inside its patches, sessions and samples',
    tags: ['zip', 'sysex', 'DecompressionStream'] },
  // 8x64 read as rows by steps (said on the page). No settleMs: ready at 770 ms with every check
  // run.
  // why: lessons/manifest.md#tom
  { name: 'tom', group: 'instruments', act: 4, created: '2026-09-21', built: true, unlisted: true,
    one: 'tap a grid of 16 steps whose rows become the samples out of a Circuit pack or sample set you open here',
    tags: ['WebAudio', 'timeline', 'zip', 'sysex'] },

  // Evolution MK-425C: counts documented, arrangement this page's own arithmetic; what it sends is
  // measured.
  // why: lessons/manifest.md#evo-panel

  // why: lessons/manifest.md#evo
  { name: 'evo', group: 'instruments', act: 4, created: '2026-09-21', built: true, unlisted: true,
    one: 'an Evolution MK-425C you can work on screen, moving when the real one moves',
    tags: ['WebMIDI', 'CoreMIDI'] },

  // why: lessons/manifest.md#twelve
  { name: 'twelve', group: 'instruments', act: 4, created: '2026-09-20', built: true, unlisted: true,
    one: 'a TASCAM Model 12 on screen, moving when the real one moves',
    tags: ['WebMIDI', 'CoreMIDI', 'Mackie Control'] },

  // Plain Web Audio, one buffer source per note, midi.mjs and pedal.mjs. The Rhodes is CC BY-NC-SA
  // 4.0
  // with attribution on the page. No settleMs: no control row, checks run at load.
  // why: lessons/manifest.md#nola
  { name: 'nola', group: 'instruments', act: 4, created: '2026-09-22', built: true, unlisted: true,
    one: 'a piano and a 1977 Rhodes you play from one MIDI keyboard, over a roll '
       + 'of chords you type in or teach it by playing',
    tags: ['WebMIDI', 'WebAudio', 'sampler', 'chords'] },

  // The visitor writes the instrument: libfaust in the tab (no C++ backend, so no board half).
  // No settleMs: controls are async and verify.mjs waits on `data-busy`.
  // why: lessons/manifest.md#fau
  { name: 'fau', group: 'instruments', act: 4, created: '2026-09-23', built: true, unlisted: true,
    one: 'a synthesiser you type in, compiled to machine code in this tab '
       + 'whenever you stop typing',
    tags: ['Faust', 'WebAssembly', 'AudioWorklet', 'WebMIDI'] },
  // why: lessons/manifest.md#collide
  { name: 'collide', group: 'instruments', act: 4, created: '2026-09-30', built: true, unlisted: true,
    one: 'a synth typed in a small subset of SuperCollider, compiled in this tab '
       + 'whenever you stop typing',
    tags: ['SuperCollider', 'WebAssembly', 'AudioWorklet', 'WebMIDI'] },

  // why: lessons/manifest.md#able


  // why: lessons/manifest.md#draw
  { name: 'draw', group: 'technologies', act: 0, created: '2026-09-13', built: true, unlisted: true,
    one: 'press record, then draw a line with a finger or a mouse',
    tags: ['pointer', 'timeline', 'canvas'] },
  // settleMs sizes the first assert behind the whole live pipeline, and at 75 s it also keeps the
  // harness's second `.tbar-x` press (a STOP) out of the page's own drill.
  // why: lessons/manifest.md#stage
  { name: 'stage', group: 'th', act: 4, created: '2026-09-17', built: true, unlisted: true, settleMs: 75000, lightSettleMs: 2000,
    // why: lessons/manifest.md#stage-one
    one: 'a church scene from a 2011 MIMproject performance, broadcast live from the control room tab',
    tags: ['WebRTC', 'canvas', 'tabs', 'R2'] },

  // Listens only: the Circuit's left output into a Fast Track Pro on the Pi.
  // why: lessons/manifest.md#away
  { name: 'away', group: 'instruments', act: 4, created: '2026-09-30', built: true, unlisted: true, room: 'fixed',
    one: 'play and listen to a Novation Circuit in another building, through a Raspberry Pi that captures its sound and draws it as it arrives',
    tags: ['WS', 'relay', 'PCM', 'MIDI', 'canvas', 'live board'] },

  // Plaits compiled unchanged from a pinned commit; the wasm carries its own source digest. The
  // polyphony is the host's (eight voices). Opens no socket. warp.wasm is on disk and unfetched.
  // why: lessons/manifest.md#muta
  { name: 'muta', group: 'instruments', act: 4, created: '2026-09-22', built: true, unlisted: true, settleMs: 8000,
    one: 'eight voices of Emilie Gillet’s Plaits firmware, compiled unmodified from its own C++ to WebAssembly on the audio thread',
    // `WebMIDI` is a soft capability, so a browser with no MIDI keeps the row linked.
    // why: lessons/manifest.md#webmidi-soft
    tags: ['WebAssembly', 'AudioWorklet', 'WebAudio', 'WebMIDI'] },

  // `WebMIDI` is soft here too: a known stream is built in and every check runs off it.
  // why: lessons/manifest.md#dump
  { name: 'dump', group: 'instruments', act: 4, created: '2026-09-20', built: true, unlisted: true,
    one: 'every message a plugged-in instrument sends, as raw bytes beside a reading of them',
    tags: ['WebMIDI', 'CoreMIDI', 'SysEx'] },

  // demo/patch/vendor/ holds the vendored engine other pages use; the row went, the files stay.
  // why: lessons/manifest.md#patch

  // /kit/ is a forwarder to the part pages; a card at the foot of the front page.
  // why: lessons/manifest.md#kit
  { name: 'kit', group: 'kit', act: 0, created: '2026-09-12', // why: lessons/manifest.md#kit-built
    // Built so verify.mjs grades it like any other page.
    // why: lessons/manifest.md#kit-built-why
    built: true, page: '/kit/',
    src: 'demo/kit/index.html',
    one: 'where every part of the kit lives now, and a way on from an old link to one of its blocks',
    tags: ['shell', 'no network'] },

  // /connect/: every part the site builds, linked by a visitor; a card beside the kit.
  { name: 'connect', group: 'kit', act: 0, created: '2026-10-14', built: true, bootMs: 120000,
    one: 'every part the site builds, linked port to port by you, and the linked parts that can run here run',
    tags: ['shell', 'Workers AI', 'WebMIDI', 'getUserMedia'] },

  // /social/: pictures and reels the site makes of itself, a card beside the kit.
  // why: lessons/manifest.md#social
  { name: 'social', group: 'kit', act: 0, created: '2026-10-14', built: true,
    one: 'pictures and reels the site makes of itself, to download and post',
    tags: ['shell', 'no network'] },
  { name: 'social/typist', title: 'typist', group: 'kit', act: 0, created: '2026-10-14', built: true, unlisted: true,
    one: 'a line types itself onto a story frame with a real typewriter, recorded to a file',
    tags: ['shell', 'MediaRecorder'] },
  { name: 'social/patchbay', title: 'patchbay', group: 'kit', act: 0, created: '2026-10-15', built: true, unlisted: true,
    one: 'every concept page’s patch as a 4:5 post, or a carousel when it is too big to read in one',
    tags: ['shell', 'no network'] },
  { name: 'social/scroll', title: 'scroll', group: 'kit', act: 0, created: '2026-10-15', built: true, unlisted: true,
    one: 'a concept page’s patch scrolling up a story frame at a size a phone can read, recorded to a file',
    tags: ['shell', 'MediaRecorder'] },
  { name: 'social/radio', title: 'radio', group: 'kit', act: 0, created: '2026-10-14', built: true, unlisted: true,
    one: 'a dial sweeps through three of our radio recordings and the noise between them, recorded to a file',
    tags: ['shell', 'MediaRecorder', 'WebAudio'] },

  // One page per kit part, `demo/kit/<part>/` at `/kit/<part>/`, unlisted and drawn as cards on
  // /kit/.
  // `title` is the part; `name` stays `kit/<part>`, the address. No bootMs.
  // why: lessons/manifest.md#kit-parts
  { name: 'kit/input', title: 'input', group: 'kit', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'buttons, sliders, knobs, keys and fields that a visitor presses, drags or types into',
    tags: ['shell', 'no network'] },
  { name: 'kit/status', title: 'status', group: 'kit', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'readout cells, logs, tables and badges that say how a page is doing',
    tags: ['shell', 'no network'] },
  { name: 'kit/timeline', title: 'timeline', group: 'kit', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'transport bars, strips and video panels for watching something play out over time',
    tags: ['shell', 'no network'] },
  { name: 'kit/layout', title: 'layout', group: 'kit', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'how blocks stack, sit in tabs and fall into cards from a wide screen down to a phone',
    tags: ['shell', 'no network'] },
  { name: 'kit/devices', title: 'devices', group: 'kit', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'instrument panels and the knobs, pads, faders and displays they are built from',
    tags: ['shell', 'no network'] },
  { name: 'kit/hardware', title: 'hardware', group: 'kit', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'the Pico router’s small screen and four keys, drawn by its real firmware running in the browser',
    tags: ['shell', 'no network'] },
  { name: 'kit/diagram', title: 'diagram', group: 'kit', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'boxes and arrows drawn from plain data, down to a label that will not fit',
    tags: ['shell', 'no network'] },
  { name: 'kit/slides', title: 'slides', group: 'kit', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'slides made from plain data at six type sizes, with live parts of this site running on them',
    tags: ['shell', 'no network'] },
  // why: lessons/manifest.md#kit-logo
  { name: 'kit/patchbay', title: 'patchbay', group: 'kit', act: 0, created: '2026-10-10', built: true, unlisted: true,
    one: 'patchbay pictures drawn from a bay’s own nodes, ports and links, with stand-in traffic on every wire',
    tags: ['shell', 'no network'] },
  { name: 'kit/logo', title: 'logo', group: 'kit', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'the positron mark and wordmarks drawn as slides, with the favicon and the app icon at the sizes they ship',
    tags: ['shell', 'no network'] },
  // why: lessons/manifest.md#kit-icons
  { name: 'kit/icons', title: 'icons', group: 'kit', act: 0, created: '2026-10-10', built: true, unlisted: true,
    one: 'every icon the kit can draw, from the Feather set in the colour of the text around it',
    tags: ['shell', 'no network'] },
  // why: lessons/manifest.md#kit-chat
  { name: 'kit/chat', title: 'chat', group: 'kit', act: 0, created: '2026-10-11', built: true, unlisted: true,
    one: 'the pieces a chat page is drawn with, a window, columns, a log, a sign and a compose box',
    tags: ['shell', 'no network'] },
  // why: lessons/manifest.md#kit-frontpage
  { name: 'kit/frontpage', title: 'frontpage', group: 'kit', act: 0, created: '2026-10-12', built: true, unlisted: true,
    one: 'the two faces this site is set in, JetBrains Mono for what names and Geist for what is read through',
    tags: ['shell', 'no network'] },
  // why: lessons/manifest.md#kit-share
  { name: 'kit/share', title: 'share', group: 'kit', act: 0, created: '2026-10-13', built: true, unlisted: true,
    one: 'the card every page is shared with and its Instagram posts, as the PNGs the build makes, the SVG they are made from, and redrawn over a picture of your own',
    tags: ['shell', 'no network'] },
  { name: 'kit/naming', title: 'naming', group: 'kit', act: 0, created: '2026-10-21', built: true, unlisted: true,
    one: 'the cast and edgecast patches with the edge as the site cf-edgecast and every part a node on it',
    tags: ['shell', 'no network'] },

  // A page per deck, `demo/slides/<deck>/` at `/slides/<deck>/`, unlisted; the deck's card links
  // here.
  // The frames are drawn in this order, so `DECKS` alone would not move them.
  // why: lessons/manifest.md#slides-pages
  { name: 'slides/synths', title: 'synths', group: 'slides', act: 0, created: '2026-10-06', built: true, unlisted: true,
    one: 'A slide deck that turns a few lines of Faust into a sound in this page.',
    tags: ['shell', 'no network'] },

  // `unlisted`: deployed and graded, not advertised; byGroup() drops it. Unlisted is not secret.
  // why: lessons/manifest.md#unlisted
  { name: 'slides', group: 'kit', act: 0, created: '2026-10-05', built: true, unlisted: true,
    one: 'A talk made of slides that hold running parts of this site, stepped inside a panel that fills the screen when you present.',
    tags: [] },
  { name: 'parts', group: 'kit', act: 0, created: '2026-10-16', built: true, unlisted: true,
    one: 'Parts to buy for the Pi and the Pico, read from Oomipood.',
    tags: [] },
  // The Pico router's build sheet, archived 2026-10-16 (*"add these to parts page, archive the old ones"*).
  { name: 'archive/parts', group: 'kit', act: 0, created: '2026-10-05', built: true, unlisted: true,
    one: 'The parts, the breadboard and the power for the Pico router with its screen and four keys.',
    tags: [] },
  { name: 'feedback', group: 'kit', act: 0, created: '2026-09-15', built: true, unlisted: true,
    // The first assert sits behind an arm, a socket, an echo and a read back.
    // why: lessons/manifest.md#settle-9000
    settleMs: 9000,
    one: 'what visitors wrote into the box beside every demo title',
    tags: ['DO', 'WS', 'relay'] },

  // Pages outside demo/: `built` stays false and `page` makes the row clickable.
  // why: lessons/manifest.md#not-shelled

  // why: lessons/manifest.md#keys


  // why: lessons/manifest.md#rack
];

// Written notes for /notes/. Empty on purpose; noteHTML still handles a populated list.
// why: lessons/manifest.md#notes
export const NOTES = [];

export const bySlug = (name) => DEMOS.find((d) => d.name === name);

// Pages that live outside demo/ and are copied in: [source, destination]. Built demos are
// enumerated.
// why: lessons/manifest.md#extra-pages
export const extraPages = () =>
  DEMOS.filter((d) => !d.built && d.src && d.page)
       .map((d) => [d.src, `${d.page.replace(/^\/|\/$/g, '')}/index.html`]);

// The link target for a row, or null. Headset rows get `?xr=1` (it focuses the Run-in-VR control;
// a link cannot start a session), merged with a row's own `query`.
// why: lessons/manifest.md#target-of
export const targetOf = (d) => {
  if (!d.built) return d.page || null;
  const q = [d.xr ? 'xr=1' : '', d.query || ''].filter(Boolean).join('&');
  return `/${d.name}/${q ? `?${q}` : ''}`;
};

// Newest first on a copy; DEMOS stays the story order. Ties keep array order, so the sort is
// stable.
// why: lessons/manifest.md#by-newest
export function byNewest(list = DEMOS) {
  return list
    .map((d, i) => [d, i])
    // Headset pages first. `xr` is a flag, not a tag: a tag would become a requirement in caps.mjs.
    // why: lessons/manifest.md#xr-first
    .sort((a, b) => (b[0].xr ? 1 : 0) - (a[0].xr ? 1 : 0)
      || (b[0].created || '').localeCompare(a[0].created || '') || a[1] - b[1])
    .map(([d]) => d);
}

/** `2026-09-11` -> `11 Sep`. Fixed width in the mono column either side of the month. */
export function shortDate(iso) {
  if (!iso) return '';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${M[Number(m) - 1]}`;
}

// The front page's sections in reading order, a second axis beside ACTS (story). One renderer for a
// row; a row this browser cannot run is drawn unlinked with its reason, never dropped. No articles.
// why: lessons/manifest.md#groups
export const GROUPS = new Map([
  // Decks: a holder shell/decks.mjs fills with one player per deck.
  // why: lessons/manifest.md#slides
  ['slides', 'slides'],
  // `th` (the title as quoted); the `xr: true` row flag is a different thing.
  // why: lessons/manifest.md#th
  ['streaming', 'streaming'],
  ['th', 'TH'],
  ['err', 'err'],
  // Every page that plays a real thing.
  // why: lessons/manifest.md#instruments
  ['instruments', 'instruments'],
  // The id stays `vain`; only the title is `u:`.
  // why: lessons/manifest.md#vain
  ['vain', 'u:'],
  ['kurenniemi', 'kurenniemi'],
  // why: lessons/manifest.md#bauhaus
  ['bauhaus', 'bauhaus'],
  // why: lessons/manifest.md#mim
  ['capture', 'capture'],
  // why: lessons/manifest.md#technologies
  ['technologies', 'technologies'],
  // why: lessons/manifest.md#kit-last
  ['kit', 'kit'],
]);

// The demos in sections, newest first inside each. Refuses an ungrouped row rather than dropping
// it.
// why: lessons/manifest.md#by-group
export function byGroup(list = DEMOS) {
  // Dropped here, once, so both index renderers agree.
  // why: lessons/manifest.md#unlisted-here
  list = list.filter((d) => !d.unlisted);
  const lost = list.filter((d) => !GROUPS.has(d.group));
  if (lost.length) {
    throw new Error(`these rows have no group, so the front page would not show them: `
      + lost.map((d) => `${d.name}${d.group ? ` (group "${d.group}" is not in GROUPS)` : ''}`).join(', '));
  }
  // `rank` puts one row at the front of its group: an editorial fact, not a date.
  // why: lessons/manifest.md#rank
  return [...GROUPS].map(([id, title]) => ({
    id, title,
    rows: byNewest(list.filter((d) => d.group === id))
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
  // A group with nothing listed is dropped.
  // why: lessons/manifest.md#empty-group
  })).filter((g) => g.rows.length);
}
// Groups that are not demo cards: the front page fills their holder with the
// players from shell/decks.mjs, so they are drawn with no rows.
export const DECK_GROUPS = new Set(['slides']);


// One demo as a card; the markup is card.mjs's. `data-needs` passes through for caps.mjs.
// why: lessons/manifest.md#demo-card
export function demoCardHTML(d) {
  const href = targetOf(d);
  const needs = needsOf(d);
  return cardHTML({
    // `title` overrides the shown name; `name` stays the identity (the kit parts use it).
    // why: lessons/manifest.md#title
    title: d.title || d.name,
    desc: d.one || '',
    tags: d.tags || [],
    href: href || '',
    why: href ? '' : d.why || '',
    attrs: (d.xr ? ' data-xr="1"' : '') + (needs.length ? ` data-needs="${needs.join(' ')}"` : ''),
  });
}

/** One deck's player box before the deck is built: the player's own classes, nothing in them. */
export const deckFrameHTML = (name) => `<div class="pos-vp pos-deck-frame" data-deck-frame="${name}" aria-hidden="true">`
  + '<div class="pos-vp-stage"></div><div class="pos-vp-foot"><span class="pos-deck-ph"></span></div></div>';

/** A whole section: its name and its cards. */
export function groupHTML(g) {
  // a deck is drawn as its empty frame first, one per `slides/<name>` row,
  // which `mountDecks` replaces with the player (see `.pos-deck-ph`)
  if (DECK_GROUPS.has(g.id)) {
    const frames = DEMOS.filter((d) => d.group === g.id && d.built && d.name.startsWith('slides/'))
      .map((d) => deckFrameHTML(d.name.slice('slides/'.length))).join('');
    return `<h2 class="pos-act-h">${g.title}</h2><div class="pos-decks" data-decks><div class="pos-decks-in">${frames}</div></div>`;
  }
  return `<h2 class="pos-act-h">${g.title}</h2>`
    + `<div class="pos-cards" style="--card-min:210px">`
    + g.rows.map(demoCardHTML).join('') + '</div>';
}

export function rowHTML(d, i, opt = {}) {
  const href = opt.blocked ? null : targetOf(d);
  const bits = [];
  // No act pill on a card; the act groups the sequence page only.
  // why: lessons/manifest.md#no-act
  for (const t of d.tags || []) bits.push(`<span class="pos-tag">${t}</span>`);
  const why = opt.blocked ? opt.says : d.why;
  if (why) bits.push(`<span class="pos-why">${why}</span>`);
  const open = href ? `<a href="${href}">` : '<a>';
  const needs = needsOf(d);
  return `<li class="pos-row${href ? '' : ' todo'}"${d.xr ? ' data-xr="1"' : ''}${needs.length ? ` data-needs="${needs.join(' ')}"` : ''}>${open}`
    + `<span class="n">${shortDate(d.created)}</span>`
    + `<span class="nm">${d.name}</span>`
    + `<span class="pos-one">${d.one || ''}</span>`
    + `<span class="pos-meta">${bits.join('')}</span>`
    + '</a></li>';
}

/** and the note row, for the same reason */
export function noteHTML(n) {
  return '<li class="pos-row"><a href="/notes/' + n.doc + '">'
    + '<span class="n">·</span>'
    + '<span class="nm">' + n.title + '</span>'
    + '<span class="pos-one">' + n.one + '</span>'
    + '</a></li>';
}
