---
name: positron-history
description: What positron used to be called, where the retired and archived pages went, and which workers, inputs and routes were retired. Load before following a link, a slug or a path from an older file (a /concepts/<group>/<nnn>/ address, a dashed slug, /rhythm/, /stations/, a demo slug), before repeating a claim about a rename, or when a reference in a comment does not resolve.
metadata:
  internal: true
---

# What moved, what was renamed, and what is gone

Every entry here was an instruction, and each one cost a sweep across the
checkout. `archive/` is deliberately left spelling things the old way, because
an archive records what was there.

## The shape of the history in one paragraph

positron went through two eras, and an old reference belongs to one of them.
**The demo era** (to 2026-10-12): one page per slug at `/<slug>/`, each a row
in `DEMOS` in `demo/manifest.mjs`, graded by `demo/verify.mjs`, listed on a
front page baked from the manifest. **The patchbay era** (from 2026-10-13, and
built up in concept pages since 2026-10-09): every idea is a small page at
`/<group>/<slug>/` that draws itself as a patch of sites, nodes, ports and
links (`demo/shell/bay.mjs`, `patchbay.mjs`), listed as cards from
`demo/shell/concept-list.mjs` on the front page under THE HERO, LARGE
(`demo/shell/hero.mjs`). Most demos were archived on 2026-10-12 and 2026-10-13:
**an archived demo is still served at its old URL** (`unlisted: true`, a card
on https://positron.studio/archive/), so its address did not die, it just left
the index. A concept page that moved is the opposite: **its old address is a
404, never forwarded** (*"no old address forwarding"*, 2026-10-12).

## Resolving an old reference, checked 2026-10-14

1. A `/concepts/<group>/<nnn>/` address: the first table below, then the
   one word table, then the drums and remote table. The last table wins.
2. A `/<slug>/` demo address: `node -e "import('./demo/manifest.mjs').then(m =>
   console.log(m.DEMOS.map(d => d.name).join(' ')))"`. If the slug is there it
   is still served (archived or not); if not, `ls archive/demos/` (a page moved
   there is a 404) and the dated sections below.
3. A worker, a Stream input or a pub route: the 2026-10-13 retirement section
   at the end of this file, and `ls workers/*/RETIRED.md`.
4. Anything on the Raspberry Pi naming Yoshimi: retired 2026-10-13, see the end
   of this file.

MEASURED 2026-10-14, not remembered: **56 demo rows, 55 built, one listed**
(`kit`); **42 concept pages** in `CONCEPT_DIRS` (`synth`, `code`, `granulator`,
`remote`, `radio`, `video`, `shader`, `room`, `typist`, `drums`, `history`).
Count again before quoting either.

# positron, the demo era (a dated record, 2026-09)

⚠️ **THIS SECTION IS A RECORD OF ITS DAYS, NOT TODAY.** Its counts (`57 shelled
demos of 59 rows`) and its front page (*"ordered NEWEST FIRST"*, `byNewest()`)
are of the demo era; the front page has been the concepts index since
2026-10-13 and the count is the command above. Kept because the renames it
records still explain old links.

Live at **https://positron.studio**. 57 shelled demos of 59 rows
(2026-09-24, counted from `DEMOS` rather than remembered). 🔴 **AND THE COUNT
WENT DOWN FOR THE FIRST TIME**: `memento`, `blocks` and `num` were archived
2026-09-24 on *"arvhice memento blocks and num demo"*, so `/memento/`,
`/blocks/` and `/num/` are 404s and the files are at
`archive/demos/<slug>-index.html` with a section each in that directory's
README. ⚠️ `/blocks/` is the load-bearing one: `xr-quit.mjs`, `xr-panel.mjs`,
`xr-hands.mjs` and `seed.mjs` all still name it, because it wrote them, and
`demo/weight/index.html` had a live claim that `/blocks/` graded the quit badge
on load which had to be repaired when it went.
⚠️ **THIS READ `47 of 49` IN THE MORNING AND `51 of 53` BY THE AFTERNOON, AND
BOTH WERE TRUE WHEN WRITTEN.** The second one was corrected three demos before
this one, which is the point: on a day when pages are being added this line goes
stale in hours, and it was a background agent reading it that caught it the
second time. The count is one command and it is written out below. `making` is the MIMproject archive: the
recordings and the pictures that outlived the project's own website, on two
tabs. ⚠️ THE FIGURES HERE READ `43 of 46` AND `tapes is the newest` FOR FOUR
DAYS AND THREE DEMOS, which is the drift this file's own rule is about, and the
count takes one command: `node -e "import('./demo/manifest.mjs').then(m =>
console.log(m.DEMOS.length))"`. The lengths are measured and live in `corpus.json`. ⚠️ **`radio1965` IS NOW `radio`, RENAMED 2026-09-16 ON INSTRUCTION.**
The slug, the directory and every reference moved together; the deployed
`/radio1965/` is GONE, so any link anybody has kept 404s and a redirect has not
been written. The line that stood here before said the slug was fixed and not to
re-open it, and that was about an unasked-for rename to `vain` on 2026-09-15
which was reverted within the hour. An instruction supersedes it. ⚠️ Only
`archive/` still says `radio1965`, on purpose: an archive records what was there.
⚠️ **AND `box` IS NOW `keys`, RENAMED 2026-09-16 ON INSTRUCTION, THE SAME DAY
AND THE SAME WAY.** The deployed `/box/` is GONE and no redirect was written;
119 references in 30 files moved. ⚠️ **`rig/box/` DID NOT MOVE THEN AND HAS
MOVED NOW: IT IS `rig/board/`, RENAMED 2026-09-20 ON INSTRUCTION** (*"and in
general change the lingo from box to board"*). The line here used to say the
BOARD was still the box and that `rig/box/` must never move; an instruction
supersedes it, the same way `radio1965` and `box` superseded their own rules.
**777 occurrences moved in 110 files**: the directory, `board.mjs`, the wire
verbs `board.hello` / `board.alive` / `board.ping` / `board.pong` /
`board.error`, `positron-board.service`, `/opt/positron-board`,
`/etc/default/positron-board`, `BOARD_NAME` / `BOARD_USER` / `BOARD_AUDIO`,
the JACK capture client `posboard`, and the prose.
🔴 **WHAT DID NOT MOVE, AND THIS IS THE `held` LESSON AGAIN**: `diagram.mjs`'s
`BOX_PAD_X`, `BOX_FS`, `BOX_ALIGN`, `BOX_TINT`, `BOX_MIN_W`, `BOX_MAX_W`,
`BOX_MAX_W_COL`, `BOX_TARGET_W` are about **a box in a picture**; `box-shadow`
is CSS; and `archive/` keeps every `box` it ever had, because an archive
records what was there. **The sweep matched the machine's names, never the
word.**
⚠️ **`rig/board/listen.html` IS GONE AND THIS SENTENCE SAID IT WAS STILL THERE.**
It was the example named here of a page that belongs with its hardware, and it
was RETIRED with `/keys/` on 2026-09-17; it is at `archive/keys/listen.html` and
`LAYOUT.md` rule 2 no longer has a live example. **The rule it illustrated is
untouched**: a page that drives hardware does not go under `demo/`, because that
invites `built: true`, which puts a shared Raspberry Pi at another site into
every run of the suite. Found 2026-09-18 by auditing the backlog, which is the
second time in one day that a confident sentence in a file like this outlived
the thing it described.
🔴 **AND `vclick` IS NOW `sound`, RENAMED 2026-09-24 ON INSTRUCTION**
(*"rname cvlick demo do ound"*, the letters confirmed by asking rather than
guessed). The deployed `/vclick/` is GONE with no redirect, the same as
`/radio1965/` and `/box/`. ⚠️ **`tarmoj/vclick` IS SOMEBODY ELSE'S REPOSITORY
AND DID NOT MOVE**: it is U:'s own QML click track, named in `demo/click/`,
`timeline/csound.mjs`, `plans/plan-uuu-local.md` and
`research/uuu-integration-2026-09.md`, and renaming it would have made four
files point at a repository that does not exist. **The sweep matched our slug
and the URL form, never the word**, which is the `rig/board/` rule again.
⚠️ `PROGRESS.md` and `SUMMARY.md` keep `28 vclick` and `05 vclick`: those are
dated records from the numbered era, and rewriting them would date-stamp a name
onto a day it did not have.
🔴 **AND `sound` IS NOW `und`, RENAMED 2026-09-30 ON INSTRUCTION** (*"rename
sound demo to und"*, the letters confirmed by asking because the rename before
it arrived as *"do ound"*). The deployed `/sound/` is GONE with no redirect,
like `/vclick/` before it. The sweep matched `/sound/` and `demo/sound/`, never
the word: `torvalds/linux/.../sound/usb/` and `ubu.com/sound/` are not ours.
⚠️ **AND `und` IS NOW `csound`, 2026-10-05** (`git log -- demo/und`, commit
`592108ab`, no redirect), and `csound` was archived 2026-10-12: still served at
https://positron.studio/csound/, listed on /archive/. Likewise the `radio` this
section names moved to https://positron.studio/archive/radio/ on 2026-10-13.
🔴 **AND `held` IS NOW `weight`, RENAMED 2026-09-19 ON INSTRUCTION, AND THIS ONE
IS NOT LIKE THE OTHER TWO.** *"name the demo held, rename old held to weight"*,
because the NAME is being given to a different demo. So the old URL is not a
dead link: `/held/` will be a live page showing something else, and a reader
with a kept link arrives somewhere plausible and wrong with nothing to tell
them. A 404 at least says no. ⚠️ **THE SWEEP MATCHED THE URL FORM `/held/` AND
THE SLUG, NEVER THE WORD**, which is `rig/board/` again and was the whole risk:
**330 files hold the string `held`** because it is ordinary English, and a held
chord, a held note and a button already held are all untouched. About 136
occurrences moved. ⚠️ **VERBATIM QUOTATIONS WERE LEFT AS THEY WERE SAID**, and
`demo/weight/index.html` carries one line above its `mount()` saying so, because
rewording somebody's report to match a later decision stops it being a
quotation. ⚠️ **`/kit/`'s CARD WAS THE ONE STRAGGLER AND IS FIXED**: it carried a live
`href: '/held/'`, which after this rename does not 404, it opens a DIFFERENT
PAGE and says nothing about it. That is the one failure mode neither earlier
rename here produced, because `/radio1965/` and `/box/` both simply died. A
stale link is louder than a dead one.
⚠️ **AND THAT BOARD HAS ONE INSTRUMENT SINCE 2026-09-16.** FluidSynth and hexter
are at `archive/box-fluidsynth-hexter/`, out of `jacksynth.mjs` and out of
`rig/audit.mjs`; a board asked for either answers `unknown source`. There is ONE
jackd, ONE capture and ONE room on it, so an instrument picker was a control
that took the sound away from somebody at another site, and it did: `/knobs/`
was found refusing to start because somebody had pressed `sampled`.
⚠️ The suite total that
used to sit here was removed rather than updated: it was stale for two sessions, and a count nobody re-measures reads as
a fact. Run `node demo/verify.mjs` for the current one. ⚠️ A red run is not automatically a
regression here: `now`'s asserts go red when ERR refuses its own live edge (one
403 probe separates the two), and a demo that needs something off this machine
goes red when a leftover Chrome of mine is holding relay sockets — **run the
failing demos ALONE before believing the suite**. `scene` is the first WebXR page;
`node demo/verify-quest.mjs` drives it on a real Quest over adb, and
`--self-test` proves its headset guard discriminates with no device attached.
(⚠️ 2026-10-14: neither `demo/now/` nor `demo/scene/` exists any more, and the
sentence about the front page that follows is the demo era's.) The front page is
ordered NEWEST FIRST — `DEMOS` is still the story order and `byNewest()` copies
it, because the index answers "what is new here?" and the sequence answers
"where do I start?". Read
`HANDOFF.md` for current state, **`BACKLOG.md` for what has been asked for and
not yet done**, `LESSONS.md` for why the rules below exist,
`PROGRESS.md` for what was measured when, and **`LAYOUT.md` for where a new file
goes** — including the two renames that were priced and rejected, so they are
not re-litigated.

## The concepts became the front page, 2026-10-13: /concepts/<group>/<number>/ to /<group>/<slug>/

Instructed: *"when all is done, move concepts to frontpage. use http://127.0.0.1:8890/kit/frontpage/ on top THE HERO, LARGE. rename all with group/slug, rm numbers"*, then *"keep same boxes style"*. The concepts index (`demo/concepts/index.html`) is the front page, `demo/index.html`, under THE HERO, LARGE (`demo/shell/hero.mjs`). `/concepts/` answers 302 to `/`. **Every old page address below is a 404 and was not forwarded**, by the concepts rule (*"no old address forwarding"*). The old front page (the manifest groups baked into `workers/view/menu.html`, and its dev twin `demo/index.html`) is in `archive/frontpage/`. The sweep rewrote paths, never verbatim quotations, never `git show <sha>:demo/concepts/...` history paths, and nothing under `archive/` or `plans/`. Two folders differ from their old group on purpose: `radio` is `stations` because `/radio/` is the archived radio demo and still served, and `archives` is `history`, the heading it shows. ⚠️ The `stations` half of that sentence lasted one afternoon: the same night the demo moved to `/archive/radio/` and the concepts took `/radio/` (next section). The right column of this table is itself stale for every row the next two tables touch.

| old address | new address |
| --- | --- |
| `/concepts/synth/000/` | `/synth/keyboard/` |
| `/concepts/synth/010/` | `/synth/recorder/` |
| `/concepts/synth/020/` | `/synth/timeline/` |
| `/concepts/synth/050/` | `/synth/sound-design/` |
| `/concepts/synth/080/` | `/code/faust-synth/` |
| `/concepts/synth/090/` | `/code/collide-synth/` |
| `/concepts/synth/120/` | `/code/plaits-keys/` |
| `/concepts/sampler/000/` | `/code/piano-and-rhodes/` |
| `/concepts/synth/030/` | `/synth/dot-piano/` |
| `/concepts/sampler/060/` | `/granulator/granulator/` |
| `/concepts/sampler/070/` | `/granulator/beat-granulator/` |
| `/concepts/remote/010/` | `/remote/circuit-on-pi/` |
| `/concepts/remote/020/` | `/remote/collide-on-pi/` |
| `/concepts/remote/030/` | `/remote/piano-and-rhodes-on-pi/` |
| `/concepts/remote/040/` | `/remote/drums-on-the-pi/` |
| `/concepts/remote/050/` | `/remote/shader-on-pi/` |
| `/concepts/radio/000/` | `/stations/radio/` |
| `/concepts/radio/010/` | `/stations/tuner/` |
| `/concepts/radio/020/` | `/stations/tempo/` |
| `/concepts/radio/030/` | `/stations/live-tempo/` |
| `/concepts/radio/040/` | `/stations/live-key/` |
| `/concepts/video/000/` | `/video/camera/` |
| `/concepts/video/010/` | `/video/camera-shader/` |
| `/concepts/video/020/` | `/video/camera-recorder/` |
| `/concepts/video/030/` | `/video/webrtc-loopback/` |
| `/concepts/video/060/` | `/video/ll-hls-loopback/` |
| `/concepts/video/050/` | `/video/moq-loopback/` |
| `/concepts/shader/000/` | `/shader/mirror-shader/` |
| `/concepts/shader/020/` | `/shader/scan-landscape/` |
| `/concepts/room/000/` | `/room/chat/` |
| `/concepts/room/002/` | `/room/chat-ui-wired/` |
| `/concepts/room/003/` | `/room/broadcast-chat/` |
| `/concepts/room/004/` | `/room/chat-timeline/` |
| `/concepts/room/040/` | `/room/patch-from-words/` |
| `/concepts/typist/000/` | `/typist/paper/` |
| `/concepts/typist/010/` | `/typist/typewriter/` |
| `/concepts/typist/020/` | `/typist/typewriters/` |
| `/concepts/typist/030/` | `/typist/playback/` |
| `/concepts/typist/040/` | `/typist/multi-typer/` |
| `/concepts/rhythm/000/` | `/rhythm/drum-machine/` |
| `/concepts/rhythm/010/` | `/rhythm/drum-knobs/` |
| `/concepts/rhythm/020/` | `/rhythm/sample-drums/` |
| `/concepts/rhythm/050/` | `/rhythm/camera-drums/` |
| `/concepts/archives/000/` | `/history/newsreels/` |
| `/concepts/misc/020/` | `/archive/tutorial-slide/` |

| old module | new module |
| --- | --- |
| `demo/concepts/list.mjs` | `demo/shell/concept-list.mjs` |
| `demo/concepts/nav.mjs` | `demo/shell/concept-nav.mjs` |
| `demo/concepts/list-test.mjs` | `demo/shell/concept-list-test.mjs` |
| `demo/concepts/clock/clock-kit.mjs` | `demo/archive/clock-kit.mjs` |
| `demo/concepts/radio/tempo.mjs` | `demo/stations/tempo.mjs` |
| `demo/concepts/remote/overlay-scope.mjs` | `demo/remote/overlay-scope.mjs` |
| `demo/concepts/remote/path.mjs` | `demo/remote/path.mjs` |
| `demo/concepts/rhythm/drum-machine.mjs` | `demo/rhythm/drum-machine.mjs` |
| `demo/concepts/rhythm/sample-voices.mjs` | `demo/rhythm/sample-voices.mjs` |
| `demo/concepts/rhythm/voices.mjs` | `demo/rhythm/voices.mjs` |
| `demo/concepts/sampler/grain-rig.mjs` | `demo/granulator/grain-rig.mjs` |
| `demo/concepts/sampler/grain-ring.mjs` | `demo/granulator/grain-ring.mjs` |
| `demo/concepts/sampler/sampler.mjs` | `demo/code/sampler.mjs` |
| `demo/concepts/sampler/sc-sampler.mjs` | `demo/code/sc-sampler.mjs` |
| `demo/concepts/synth/collide-voice.mjs` | `demo/code/collide-voice.mjs` |
| `demo/concepts/synth/plaits-voice.mjs` | `demo/code/plaits-voice.mjs` |
| `demo/concepts/synth/module-page.mjs` | `demo/synth/module-page.mjs` |
| `demo/concepts/synth/patch-synth.mjs` | `demo/synth/patch-synth.mjs` |
| `demo/concepts/typist/paper.mjs` | `demo/typist/paper.mjs` |
| `demo/concepts/typist/sampler.mjs` | `demo/typist/sampler.mjs` |
| `demo/concepts/video/loopback.mjs` | `demo/video/loopback.mjs` |
| `demo/concepts/index.html` | `demo/index.html` (the front page) |

## One word slugs and the radio group, 2026-10-13 (night): /<group>/<dashed-slug>/ to /<group>/<word>/

Instructed: *"Resolve clashes. Avoid dashes on names."*, then *"Plaits keys (rm keys from name)"*. Every concept slug became one plain lowercase word, never its group's own name, chosen from the title (titles keep their words, except Plaits keys, retitled Plaits). The clash the afternoon had worked round was resolved instead: the archived radio demo moved from `/radio/` (`demo/radio/`, manifest `radio`) to **`/archive/radio/`** (`demo/archive/radio/`, manifest `archive/radio`, graded by `node demo/verify.mjs archive/radio`), and the radio concepts left `/stations/` for `/radio/`. **Every address in the left column is a 404, and `/radio/` itself no longer answers as the demo.** No forwarding, by the concepts rule. The sweep matched the URL forms and the path forms (`/radio/`, `demo/radio/`, `positron.studio/radio/`, the old ids) in `demo/`, `workers/`, `timeline/`, `research/tools/`, the skills, `CLAUDE.md`, `HANDOFF.md`, `LESSONS.md`; never the word radio, never a verbatim quotation, nothing under `archive/`, `plans/` or `research/*.md`, and not the table above, which records the afternoon as it was.

| old address | new address |
| --- | --- |
| `/radio/` (the archived radio demo) | `/archive/radio/` |
| `/synth/sound-design/` | `/synth/sound/` |
| `/synth/dot-piano/` | `/synth/dots/` |
| `/code/faust-synth/` | `/code/faust/` |
| `/code/collide-synth/` | `/code/collide/` |
| `/code/plaits-keys/` | `/code/plaits/` (title Plaits) |
| `/code/piano-and-rhodes/` | `/code/piano/` |
| `/granulator/granulator/` | `/granulator/grains/` |
| `/granulator/beat-granulator/` | `/granulator/beat/` |
| `/remote/circuit-on-pi/` | `/remote/circuit/` |
| `/remote/collide-on-pi/` | `/remote/collide/` |
| `/remote/piano-and-rhodes-on-pi/` | `/remote/piano/` |
| `/remote/drums-on-the-pi/` | `/remote/drums/` |
| `/remote/shader-on-pi/` | `/remote/shader/` |
| `/stations/radio/` | `/radio/blend/` |
| `/stations/tuner/` | `/radio/tuner/` |
| `/stations/tempo/` | `/radio/tempo/` |
| `/stations/live-tempo/` | `/radio/live/` |
| `/stations/live-key/` | `/radio/key/` |
| `/video/camera-shader/` | `/video/shader/` |
| `/video/camera-recorder/` | `/video/recorder/` |
| `/video/webrtc-loopback/` | `/video/webrtc/` |
| `/video/ll-hls-loopback/` | `/video/llhls/` |
| `/video/moq-loopback/` | `/video/moq/` |
| `/shader/mirror-shader/` | `/shader/mirror/` |
| `/shader/scan-landscape/` | `/shader/landscape/` |
| `/room/chat-ui-wired/` | `/room/window/` |
| `/room/broadcast-chat/` | `/room/broadcast/` |
| `/room/chat-timeline/` | `/room/history/` |
| `/room/patch-from-words/` | `/room/words/` (off the index) |
| `/typist/typewriters/` | `/typist/machines/` |
| `/typist/multi-typer/` | `/typist/score/` |
| `/rhythm/drum-machine/` | `/rhythm/drums/` |
| `/rhythm/drum-knobs/` | `/rhythm/knobs/` |
| `/rhythm/sample-drums/` | `/rhythm/samples/` |
| `/rhythm/camera-drums/` | `/rhythm/camera/` |

Unchanged: `/synth/keyboard/`, `/synth/recorder/`, `/synth/timeline/`, `/video/camera/`, `/room/chat/`, `/typist/paper/`, `/typist/typewriter/`, `/typist/playback/`, `/history/newsreels/`.

| old module | new module |
| --- | --- |
| `demo/stations/tempo.mjs` | `demo/radio/tempo.mjs` |
| `demo/typist/typewriters/fx.mjs` | `demo/typist/machines/fx.mjs` |
| `demo/radio/index.html` | `demo/archive/radio/index.html` |

## Drums, the remote pages and the chat, 2026-10-13 (late): the last moves of that night

Written 2026-10-14 from the commits that made them (`git show --stat d85c4b57`,
`f06642b1`, `ec764e8d`, `33595975`). Asked: *"Renamw rythm group into drums"*,
*"Move drums on pi into remote drums"*, *"Move pi shader to remote shaders
under shaders"*, *"Move chat ui wired to chat. Rm chat ui wired"*, *"move room
into last group"* and *"Move held to archive"*. **Every address in the left
column is a 404**, no forwarding. This table wins over the two above it.

| old address | new address |
| --- | --- |
| `/rhythm/drums/` | `/drums/machine/` |
| `/rhythm/knobs/` | `/drums/knobs/` |
| `/rhythm/samples/` | `/drums/samples/` |
| `/rhythm/camera/` | `/drums/camera/` |
| `/remote/drums/` | `/drums/remote/` |
| `/remote/shader/` | `/shader/remote/` |
| `/room/window/` (Chat UI wired) | `/room/chat/` (the chat window page; the patchbay only chat that was at `/room/chat/` is gone) |

| old module | new module |
| --- | --- |
| `demo/rhythm/voices.mjs` | `demo/drums/voices.mjs` |
| `demo/rhythm/drum-machine.mjs` | `demo/drums/drum-machine.mjs` |
| `demo/rhythm/sample-voices.mjs` | `demo/drums/sample-voices.mjs` |

⚠️ So `demo/rhythm/`, `demo/stations/` and `demo/room/window/` do not exist
(`ls` 2026-10-14). The concept back link reads `← positron` since `f06642b1`
(`indexLabel: 'positron'`), not `← concepts`.

## Wish, 2026-10-15: the written pages and the writer node

Asked: *"writer is no better. keep wish in naming."* *Wish* names what a person
does and the box carrying their words; what comes back keeps its own name
(shader, synth, patch). **Both old addresses are a 404**, no forwarding.
`/wish/` (the archived demo) is a different page and still served.

| old | new |
| --- | --- |
| `/shader/write/` (Written shader) | `/shader/wish/` (Picture wish) |
| `/code/write/` (Written synth) | `/code/wish/` (Sound wish) |
| node `writer`, `web:writer:program-out` | node `wish`, `web:wish:program-out` |
| `demo/shell/rt-writer.mjs` | `demo/shell/rt-wish.mjs` |
| `demo/shell/ask-bar.mjs` (`createAskBar`, `.pos-ask*`) | `demo/shell/wish-bar.mjs` (`createWishBar`, `.pos-wish*`) |
| `demo/shell/code-writer.mjs` | `demo/shell/wish-loop.mjs` |
| `demo/shell/glsl-writer.mjs`, `glsl-writer-test.mjs` | `glsl-wish.mjs`, `glsl-wish-test.mjs` |
| `demo/shell/sclang-writer.mjs`, `sclang-writer-test.mjs` | `sclang-wish.mjs`, `sclang-wish-test.mjs` |
| `demo/shell/sclang-trial.mjs` | `demo/shell/sclang-wish-trial.mjs` |
| worker route `/code` | `/wish/code` (`/code` kept answering for one deploy as an alias) |
| log tag `[code]` | `[wish]` |

## Archived 2026-10-12 and 2026-10-13: still served, off the index

🔴 **ARCHIVED IS NOT REMOVED.** Each of these keeps its manifest row with
`unlisted: true` and still answers at its URL, with a card on
https://positron.studio/archive/ (`demo/archive/index.html`). The reasons are
the owner's words in the `DEMO_CARDS` comments in `demo/shell/concept-list.mjs`.

- **Demos, still at `/<slug>/`:** partitur, reel, floor, videoradio, tapes,
  resources, weight, held, stage, making, wish, away, tom, nola, csound, wire,
  draw, patchbay, time, sync, fau, collide, muta, mirror, llhls, webrtc, moq,
  cam, capture, dump, circuit, evo, twelve, shape, pack. The radio demo is the
  one that MOVED as it was archived: `/archive/radio/`. `/proto/deck/` is the
  deck card. `/kit/frontpage/` is archived too, and `/frontpage` still answers
  302 to it (`workers/view/src/index.js`).
- **Concept pages moved under `/archive/<name>/`:** `tv`, `pico-router`,
  `clock-midi`, `clock-drift`, `draw-xy`, `clock-shared`, `clock-scheduling`,
  `clock-message-lag`, `clock-audio-cushion`, `plaits-patches`,
  `clock-play-together`, `clock-replay`, `clock-follow`, `pappus`,
  `tutorial-slide` (`ls demo/archive/`).
- **Concept pages kept only as a note** (`archive/concepts/*.md`, read on
  `/archive/note.html?f=...`): clock-040, effects, misc-000, misc-010,
  remote-000 (Yoshimi), sampler-015.
- **Gone, a 404:** `/knobs/` and `/grains/` (with Yoshimi,
  `archive/demos/knobs-index.html`, `grains-index.html`), `/flipper/`
  (`archive/demos/flipper-index.html`), and the typist front page demo
  (`archive/typist.md`).

## From the handoffs (extracted 2026-10-19)

- **A commit hash quoted before 2026-10-14 does not resolve**: the history was scrubbed with `git filter-repo`. The pre-scrub checkout is `~/personal/positron-old-history` and the mirror backup `~/personal/positron-backup-2026-10-14.git`; GitHub may still serve old commits by hash until Support purges them. (`HANDOFF.md, session 78 (2026-10-14)`)
- **`git filter-repo` in the background hangs** when `.git/filter-repo/already_ran` is over a day old, because it asks on stdin; give it `</dev/null`. (`HANDOFF.md, session 78 (2026-10-14)`)
- **A later commit date is not a later state**: a commit can carry an older session's working tree, so read its message before trusting the date. (`HANDOFF.md, session 55 (2026-09-29)`)
- **The working branch was `session-28-station-videoradio` for 184 commits**, until `main` on 2026-09-29. (`HANDOFF.md, session 55 (2026-09-29)`)

# Retired 2026-10-13: workers, inputs, routes and Yoshimi

Recorded here so an old reference resolves. The source is `HANDOFF.md`, *"Retired
2026-10-13: the test pattern, /cam/'s RTMPS camera, six workers"*, checked
against the tree 2026-10-14.

- **Six workers deleted:** cues, instrument, moq-safari, osc, rtc, selfrec, each
  with `workers/<name>/RETIRED.md` (and `workers/jam/RETIRED.md` from
  2026-09-04). `cues.`, `instrument.`, `moq.`, `osc.`, `rtc.` and
  `selfrec.positron.studio` no longer answer.
- **Stream inputs deleted:** `positron-demo` (/llhls/'s test pattern),
  `whep-rig` (/webrtc/ and capture ROUND TRIP), `positron-cam` (/cam/'s LL-HLS
  leg). **pub answers 410** on `/watch`, `/status`, `/start`, `/stop`, `/whip`,
  `wss /cam`, `/cam/status`; it keeps `/cam/whip` (https://positron.studio/video/webrtc/),
  `/loop*` (https://positron.studio/video/llhls/), `/stage/*`, `/ice`, `/log`, `/logs`.
- **Commands that refuse or moved:** `demo/check-whep.mjs` is
  `archive/check-whep.mjs`; `demo/verify-native.mjs` and
  `demo/verify-safari.mjs` refuse (exit 2); `src/provision-cam.sh` refuses.
- **Yoshimi is off the Pi** (`archive/yoshimi/README.md`,
  `plans/plan-retire-yoshimi.md`), asked *"discard yoshimi. with possiblity to
  do dual setup in future (pi and browers, interlink). arhive demos using it"*.
  The board has no JACK instrument by default: `audio.start` needs a named
  source (`sampler`, `collide`, `synth`), and `rig/board/insert-test.mjs` and
  `pappus-live.mjs` refuse (exit 2). The sentence above that says the board has
  *"ONE instrument since 2026-09-16"* named Yoshimi; it is a record of that day.
