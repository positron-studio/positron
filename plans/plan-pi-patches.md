# plan-pi-patches: the Pi keeps its own patches, switches and stops them, and a page is a remote

Written 2026-10-16 from the tree at `425f02e3`, without ssh, without the relay
and without the board (the VPN was on). Every claim is marked:

- **MEASURED**: seen on this desk, with the day it was seen (all quoted from
  `BACKLOG.md`, none taken for this plan).
- **READ**: read in the code or a file, cited `file:line`.
- **INFERRED**: worked out from what was read. Not seen running.

## The ask, verbatim

> "we need to work on 'board stop' or smth. currently running desktop demoms, getting
> hangin notes etc is a mess. pi should be selfsutainable switching patches.
> stoppin all etc. we could have "remote control" page that shows mirror of its
> ui and send button signals."

`BACKLOG.md:3` holds it, with the instruction that a plan comes first.

---

## 0. Verdict

**Build it, and most of it is already on the board in pieces.** Every service
that makes sound already holds its own link in the bay's own vocabulary
(`printLink` lines, `sequencer.mjs:168`, `keyboard.mjs:80`,
`circuit-drums.mjs:105`, `board.mjs:1162` for JACK). What is missing is one
owner above them. The plan adds one module on the board, `rig/board/stop.mjs`,
that owns **"what is playing"** as a single record, and four things around it:

1. **A patch is a JSON file of bay link lines** plus the few settings a link
   cannot say (the drum pattern, the Plaits sound, what the screen draws). The
   engines a patch needs are read off its link ends, never listed twice.
   Built-in patches live in the repo (`rig/board/patches/`), shipped by
   `push.sh` with nothing added to it; the edited state lives on the Pi in a
   state directory a push cannot overwrite.
2. **One `board.load` and one `board.stop`**, both applied by the board through its
   own existing verbs (it calls its own `handle()`), in a fixed order: note
   sources off first, then every target silenced, then audio links cut, then
   engines down. `board.check` proves it by reading JACK, the sequencer, every
   held note ledger and the capture's level.
3. **The screen and the four keys are the menu**, run inside the board, so the
   Pi is usable with no page and with no relay at all. Hold `*` for 1 s is stop
   all, in every state.
4. **One remote control page, `/devices/control/`**, that shows the board's
   own frames (the 1024 bytes `panel.mjs` already makes) and sends the four
   keys. Frames go in a room of their own, `studio-1-screen`, only while a page
   holds a 15 s lease, at about 15.5 KB/s worst case and close to nothing while
   the menu sits still.

**The ownership rule that makes it hold together: the board owns sound; a tab
owns only its view.** Anything that makes sound is in the board's record, on
the board's screen, and stoppable from the board's keys. A tab may hold only
things that cost something while nobody looks (the screen mirror, the audio
stream to the relay, notes from its on-screen keys), and each of those ends by
itself when the tab stops renewing.

**Three findings the plan rests on, each a defect today, not a design wish:**

- 🔴 **THE BOARD CANNOT START A PATCH WITHOUT THE RELAY.** `graphFacts` is
  built only inside `ws.onopen` (READ, `board.mjs:1255-1275`), and the
  sequencer and the keyboard both refuse to wire a link without it (READ,
  `sequencer.mjs:158-159` *"the board has not said what it is yet"*,
  `keyboard.mjs:68-69`). So on a boot during the ~90 s the relay refused the
  board this morning (`BACKLOG.md:19`), no key could have started anything.
- 🔴 **WHEN SUPERCOLLIDER OR PLAITS RUNS, THE BOARD STREAMS ITS SOUND TO THE
  RELAY ALL DAY, LISTENER OR NOT.** `ensureCapture` hands every 20 ms frame to
  `sendPcm` (READ, `jacksynth.mjs:705-729`, `board.mjs:399-407`): 960 samples,
  1,932 bytes with the header (READ, `synth.mjs:8`), 50 messages a second, so
  about **96.6 KB/s, about 8.3 GB a day** into `studio-1` and out to every
  socket in it (INFERRED, arithmetic). A closed `/devices/drums/` tab leaves
  that running, because it leaves the drums engine running.
- 🔴 **THE PI'S KEYS ARE INTERPRETED BY WHICHEVER PAGES ARE OPEN, NOT BY THE
  PI.** The board only broadcasts `panel.key` (READ, `board.mjs:355`); the
  drum pages turn it into an edit (READ, `pi-seq.mjs:46-60`). Two open tabs
  each toggle the same step, so a `#` press is a toggle and a toggle back, and
  with no tab open the keys do nothing. Moving the keys into the board and
  taking them out of the pages has to happen in ONE step (section 7, step 4),
  or for a while both act on every press.

**Cost: seven steps, the first one useful alone** (hold `*` is stop all, with a
check that proves it). Steps 1 to 4 are board only and testable against the
stand-in `demo/fake-board.mjs`, which already runs the real sequencer, keyboard
and Circuit drums services (READ, `fake-board.mjs:16-18`). Every board step
ends with a `push.sh`, which restarts the service; the owner's OK is needed for
that, as before.

---

> Named 2026-10-16. From plan-pi-os.md on *"does not need to be pi os as name. more of that we need somthing for patchbau management"*, then *"i am not sold on manager labelling"*, *"its just part of patchbaying"*: the stop is `rig/board/stop.mjs` and the verbs `board.stop`, `board.check`, later `board.load` and `board.state`. The screen's part is `screen.*` (*"screen is ok"*): a VIEW is one picture (text, rings, patch, steps, camera, scope, knobs, knobs16, as /devices/control/ simulates them), a LAYOUT is full or half (top and bottom); `screen.show { view }` or `screen.show { top, bottom }`, `screen.state`, in rig/board/screen.mjs. Not built.

## 1. What a patch is

### 1.1 What "the board's state" is today, in pieces (READ)

Nothing on the board holds the whole. The state is spread over six owners:

| piece | where it lives | what holds it | its link, as the bay prints it |
| --- | --- | --- | --- |
| the sequencer | `drumSeq`, `board.mjs:114` | one private bay, one link | `pi-1:sequencer:midi-out -> pi-1:drums:midi-in { drummap gm }` or `-> pi-1:circuit:midi-in { drummap circuit }` (`sequencer.mjs:166-168`) |
| the MK-425C | `kbd`, `board.mjs:126` | one private bay, one link | `pi-1:mk-425c:midi-out -> pi-1:circuit:midi-in { channel 1 }` or `-> pi-1:plaits:midi-in` (`keyboard.mjs:80`) |
| the Circuit's drums | `cdrums`, `board.mjs:150` | one private bay, one link | `pi-1:circuit:midi-out -> pi-1:drums:midi-in { drummap circuit }` (`circuit-drums.mjs:105`) |
| JACK audio links | `bayLinks`, `board.mjs:162` | a Map of `"<from> -> <to>"` | `pi-1:drums:audio-out -> pi-1:pwm:audio-in`, `pi-1:plaits:audio-out -> pi-1:pwm:audio-in` (`board.mjs:1179`) |
| engines | `collide` (`:91`), `plaits` (`:94`), `samp` (`:87`), `inst` (`:80`) | each its own service | none: an engine is a node, not a link |
| the screen | `panel` (`:354`) | whoever drew last; `screenTaken()` (`:158`) lets the Circuit's drums keep it | none |

And there is no list of all six: `jack.links` lists only the JACK ones (READ,
`board.mjs:1226-1233`), `board.alive` carries `kbd` and `cdrums` but not the
sequencer (READ, `beat.mjs:58-66`).

### 1.2 Recommendation: a patch is link lines plus three settings

The bay already has the save format. `plans/plan-patchbay.md:79` says *"A
"patch" is a save file"*, `Patch { id, label, links }`, and `bay.mjs` already
reads and writes the text form with comments (READ, `printLink` `:668`,
`parseLink` `:687`, `printPatch` and `parsePatch` `:737-742`, `#` comments
stripped). So a patch is:

```json
{
  "v": 1,
  "name": "drums",
  "label": "Pi drums",
  "links": [
    "pi-1:sequencer:midi-out -> pi-1:drums:midi-in { drummap gm }",
    "pi-1:drums:audio-out -> pi-1:pwm:audio-in"
  ],
  "sequencer": { "play": true, "pattern": { "bpm": 120, "rows": [] } },
  "plaits": null,
  "screen": "steps"
}
```

- **`links` is the bay's text form, parsed with `parseLink`.** No new
  vocabulary. A patch that a page prints with `printPatch` can be pasted into a
  file and loaded.
- **The engines are read off the link ends, not listed.** An end on
  `pi-1:drums` needs the drums engine up with its eight voices loaded; an end
  on `pi-1:plaits` needs Plaits; an end on `pi-1:circuit` needs the Circuit's
  input present; an end on `pi-1:pwm` needs `alsa_out` (always up, READ
  `board.mjs:1479`). One fact in one place, so a patch cannot list an engine it
  does not link.
- **Three settings a link cannot carry:** the sequencer's pattern and whether
  it plays on load; the Plaits sound (`plaits.patch`, READ `plaits.mjs:231`);
  and what the screen shows while it plays: `steps` (the sequencer's or the
  Circuit's grid), `patch` (the patch's own links drawn by `bay-oled.mjs`,
  with a bead on each note, which `board.mjs:139-144` already does for the
  keyboard) or `split` (the parallel split screen experiment, `BACKLOG.md:4`,
  when it lands; this plan does not design its pixels).
- **The drum voices are the board's own, not the page's.** Today the drums
  exist only after a page sends eight `sc.load` texts (READ, `pi-seq.mjs:176-183`,
  `circuit/index.html:174-177`). `demo/drums/voices.mjs` has no imports (READ),
  so the board can import it, and `push.sh` ships whatever `rig/board` imports
  from two levels up (READ, `push.sh:45`). `plans/plan-drums-tiny-screen.md`
  rung 4 asked for the same thing.

### 1.3 Where patches are stored

| what | where | why |
| --- | --- | --- |
| built-in patches | `rig/board/patches/<name>.json`, in the repo | shipped by `push.sh`, which tars all of `rig/board` (READ, `push.sh:41-42`); reviewed and diffed like code |
| the board's current state | `/var/lib/positron-board/now.json` on the Pi | survives a service restart and a push (a push only untars over `/opt/positron-board`, READ `push.sh:46`); written tmp and rename, as `sampler.mjs:79` writes its files |
| patches saved on the Pi (later, step 7) | `/var/lib/positron-board/patches/<name>.json` | a user copy shadows a built-in of the same name; a push never touches it |

`StateDirectory=positron-board` in the unit makes that directory owned by the
service's user with no `mkdir` in `setup.sh` (INFERRED from systemd's
documentation, not tried on this board; the fallback is
`/opt/positron-board/state/`, which follows the samples' precedent of data
living beside the code, READ `sampler.mjs:12`).

### 1.4 Today's pages as patches

| patch | today's page | links | settings | verbs it replaces (READ) |
| --- | --- | --- | --- | --- |
| `drums` | https://positron.studio/devices/drums/ | `pi-1:sequencer:midi-out -> pi-1:drums:midi-in { drummap gm }`, `pi-1:drums:audio-out -> pi-1:pwm:audio-in` | pattern, play, screen `steps` | `audio.start collide`, eight `sc.load`, `jack.link`, `seq.start {target: 'drums'}` (`pi-seq.mjs:176-198`) |
| `beat` | https://positron.studio/devices/beat/ | `pi-1:sequencer:midi-out -> pi-1:circuit:midi-in { drummap circuit }` | pattern, play, screen `steps` | `seq.start {target: 'circuit'}` |
| `synth` | https://positron.studio/devices/synth/ | `pi-1:mk-425c:midi-out -> pi-1:plaits:midi-in`, `pi-1:plaits:audio-out -> pi-1:pwm:audio-in` | Plaits sound, screen `patch` | `audio.start plaits`, `jack.link`, `kbd.link {target: 'plaits'}` (`synth/index.html:145-156`) |
| `keys` | https://positron.studio/devices/keys/ | `pi-1:mk-425c:midi-out -> pi-1:circuit:midi-in { channel 1 }` | screen `patch` | `kbd.link {channel: 1}` (`keys/index.html:141`) |
| `circuit` | https://positron.studio/devices/circuit/ | `pi-1:circuit:midi-out -> pi-1:drums:midi-in { drummap circuit }`, `pi-1:drums:audio-out -> pi-1:pwm:audio-in` | screen `steps` | `audio.start collide`, eight `sc.load`, `cdrums.link` (`circuit/index.html:159-177`) |

⚠️ The `circuit` patch gains `drums -> pwm`: today that page hears the drums
over the relay only (READ, no `jack.link` in `demo/devices/circuit/index.html`).
A self-sustaining board plays out of its own socket.

⚠️ **A patch may combine them, within what each service can hold.** `beat`
plus `keys` is legal (the sequencer and the keyboard share the Circuit's one
writer and interleave whole messages, READ `board.mjs:98-105`). `keys` plus
`synth` is not: the keyboard service holds one link at a time (READ,
`keyboard.mjs:197`, it unlinks before moving). The loader refuses such a patch
before touching anything, with the reason in words, as every verb here does.

---

## 2. One switch and one stop all

### 2.1 What "stop all" must end, and in which order

**The rule: a note source stops before its target is silenced, and a target is
silenced before its audio link is cut.** In the other order a sequencer step
lands after the panic and hangs, or a cut link leaves a voice sounding into
nothing, which comes back the moment anything relinks.

| # | what | how, with existing code | what it guarantees |
| --- | --- | --- | --- |
| 1 | the sequencer | `drumSeq.stop()`: every pending note off, then CC 123 on channel 10 (READ, `sequencer.mjs:106-117`) | no new notes from the board's clock |
| 2 | the keyboard and the Circuit's drums | `kbd.stop()` releases every note it started (READ, `keyboard.mjs:113-122`, `:177-184`); `cdrums.stop()` (READ, `circuit-drums.mjs:172`) | no new notes from the MK-425C or the Circuit |
| 3 | every target silenced | Plaits `core.panic()` (READ, `plaits.mjs:101`), collide `core.panic()` (READ, `scollide.mjs:351`), the sampler's `panic()`, the insert's `pap.notes.panic()` (READ, `board.mjs:694-705`); the Circuit: `midi.panic` on its input, which writes a note off for every note in its ledger (READ, `inputs.mjs:645-654`, `:710`), then CC 123 on channels 1, 2 and 10, which its gate lets through (READ, `inputs.mjs:119-124`) | silence, including notes a page played through the Circuit's own room |
| 4 | audio links cut | `jack.unlink` for every entry of `bayLinks` (READ, `board.mjs:1201-1222`) | nothing reaches `pi-1:pwm` |
| 5 | engines down | `plaits.stop()`, `collide.stop()`, `stopSampler()`, `stopAudio()` (READ, the same calls the SIGTERM handler makes, `board.mjs:1481`) | the capture ends, so the relay stream ends |
| 6 | the screen | to the menu, nothing playing | a person at the Pi sees it stopped |

`board.load` of another patch runs the same steps as a **diff**: links the new
patch keeps are left alone, engines it still needs stay up (the drums' eight
voices stay compiled from `drums` to `circuit`), and the new patch is brought
up in the reverse order: engines, then audio links, then note sources, then the
sequencer starts. Sources last on the way up, first on the way down.

⚠️ **Two stops, not one, and the plan recommends both:** `board.stop` is steps 1
to 6. A **silence** without step 5 is what a panic key wants mid-performance
(engines warm, the next press is instant). The menu's stop all is the full
one, because step 5 is what ends the relay stream (section 0).

### 2.2 How it is proved

`board.check` is a verb that reads, never writes, and answers one row per claim:

| claim | read from |
| --- | --- |
| the sequencer is stopped | `drumSeq.core.running()` (READ, `sequencer.mjs:121`) |
| no board link is held | `kbd.beat().held`, `cdrums.held()`, `bayLinks.size` (READ) |
| nothing is connected to the PWM output | `listJack()` rows for `pwm:playback_1` and `_2` (READ, `PWM_PORTS`, `graph-registry.mjs:72`), the same read `jack_lsp -c` gave this morning (`BACKLOG.md:7`) |
| no note is held on the Circuit | the input's ledger, `held: s.held.size` (READ, `inputs.mjs:291`, `:463-466`) |
| no note is held on Plaits or collide | `plaits.stats` `held` (READ, `plaits.mjs:150`), `sc.stats` `live` |
| the board is silent | the capture's peak over 500 ms, read between steps 4 and 5 (INFERRED that it reads at the floor, about -80 dBFS on this board, MEASURED 2026-10-11 for the Fast Track Pro input; for the engines' own capture the floor is unmeasured) |
| no engine runs | `plaits.status()`, `collide.status()`, `samp` |

⚠️ **WHAT THE CHECK CANNOT SEE:** a note the Circuit plays from its own
sequencer or pads never passed the board's writer, so no ledger holds it, and
CC 123 is the only answer. Whether the Circuit honours CC 123 on its drum
channel is not established here (INFERRED, unmeasured). The check says so in
its output rather than reading green.

⚠️ **The check must be able to fail.** Its test (step 1) starts the sequencer
on the stand-in, holds a keyboard note, makes a JACK link, then breaks each
stop step in turn and expects the matching row red, the CLAUDE.md lesson about
a diagnostic that could not fail.

---

## 3. The Pi's own menu, on 128x64 and four keys

### 3.1 What fits

- The text mode draws a 14 px key column on the right and 5 lines of text
  (READ, `panel-screen.mjs:31-46`: `step = cap + 4`, `(64 - 2) / step`). With
  the firmware's 5x7 font that is 5 rows of about 18 characters (INFERRED from
  `ui.adv`, not read off the wasm).
- So the menu is **one header line and four patch rows**, scrolling. Patches are
  named in one short word (`drums`, `beat`, `synth`, `keys`, `circuit`), which
  the bay picture already uses for nodes.

```
 o drums             ^      header: relay dot, the patch playing
 > drums  *          v      selected row inverted, * marks the one playing
   beat              #
   synth             *
   keys
```

- **A new `menu` mode in `drawPanel`** (`demo/shell/panel-screen.mjs`), beside
  `text`, `rings`, `patch` and `steps` (READ, `:22-28`), so the Pi, the
  remote page and `/devices/text/`'s simulated screen draw the same bytes by
  construction (READ, the module's header, `:1-5`).

### 3.2 What the keys do in each state

Keys are `^` K1, `v` K2, `#` K3, `*` K4 (MEASURED 2026-10-15, READ
`panel.mjs:12-13`).

| state | `^` | `v` | `#` | `*` tap | `*` held 1 s | `^` and `v` together |
| --- | --- | --- | --- | --- | --- | --- |
| **menu** | row up | row down | load the row and play it; on the playing row, go to its screen | back to the playing patch's screen, if one plays | **stop all** | nothing |
| **playing, `steps`** (`drums`, `beat`) | row up | row down | toggle the step (as `pi-seq.mjs:49-55` does today) | play or stop the sequencer | **stop all** | menu |
| **playing, `patch`** (`synth`, `keys`) | previous sound (Plaits) or channel 1 (Circuit) | next sound or channel 2 | a test note, so a person can hear the path with no keyboard | nothing | **stop all** | menu |
| **playing, `circuit`** | nothing (the Circuit draws itself) | nothing | nothing | nothing | **stop all** | menu |
| **loading** | ignored | ignored | ignored | ignored | **stop all**, which aborts the load | ignored |

- **Stop all is the same gesture everywhere**, and it is the one thing that
  must never depend on what the screen shows. `plans/plan-pi-oled.md:341-343`
  wanted a local panic key "whatever is linked"; this is it.
- A 1 s bar fills along the bottom row while `*` is held (INFERRED value, to be
  tried), so it is never pressed by accident and is seen to be coming.
- ⚠️ **This supersedes rung 5 of `plans/plan-drums-tiny-screen.md`**, which
  proposed `*` held 600 ms to open a menu (READ, `:451-461`, not built). One
  long press cannot be both.
- ⚠️ **The chord is a guess.** `^` acts on its press, so `^` then `v` moves the
  row once before the menu opens. The cheaper alternative is to act on
  release. Neither has been tried with a thumb; the simulated screen is where
  to try it first.

---

## 4. Ownership

### 4.1 Who owns what is playing

**The board, in one record:** `{ patch, edited, playing, links, by, at }`,
kept by `os.mjs`, written to `now.json` on every change, sent to the room as
`board.state` on every change and on `board.ask`, and drawn on the screen's header.

Everything that changes it goes through the one record, in arrival order:

| source | arrives as | today |
| --- | --- | --- |
| the Pi's keys | a GPIO edge, `panel.mjs:89-111` | broadcast only |
| the remote page's keys | `panel.press { k, down }` in `studio-1` | does not exist |
| a Pico button | `bay.event` from `pico-a629d5:button:value-out` (READ, `node.c:88-100`, sent to the whole room) | heard by pages only; the board has no handler for `bay.event` (READ, grep) |
| a page | `board.load`, `board.stop`, and the old verbs | the old verbs only |

- **Last writer wins, and every write is announced with who made it**, as the
  insert already does (READ, `fxAsked`, `board.mjs:164-167`). No locks on
  sound: a lock held by a closed tab is exactly the orphan this plan removes.
- **The old verbs keep working** (`seq.*`, `kbd.*`, `cdrums.*`, `jack.link`,
  `audio.start`), so the demo pages and `rig/board/test.mjs` keep running. Each
  one, after it succeeds, folds its change into the record and marks it
  `edited`; the screen shows the patch name with a `*`.
- **A load in progress refuses another**, in words, as `startAudio` refuses a
  second start (READ, `board.mjs:424`). A stop is never refused.
- **A Pico button reaches the board only through a link the board holds**,
  as every light link is consented by its receiver (READ, the bay's rule,
  `bay-node.mjs:146`). The board holds one, configured in
  `/etc/default/positron-board`, naming the Pico's site exactly
  (`pico-a629d5:button:value-out -> pi-1:os:value-in`), not `*:button`,
  because a `*` end matches any site with a `button` node, any tab included
  (READ, `bay.mjs:731-735`). Recommended meaning of the one button: stop all.
  It works only while the relay does.

### 4.2 What a page does when it opens

1. Nothing on load, as every concept page (the skill's rule: join on a press).
2. On the press, join `studio-1` and send `board.ask`. Draw from the answer.
   **Never assume from its own last action.**
3. Follow `board.state`. When `by` is somebody else, say so in the log, as the
   insert's `fxBy` lets a page say it today.

### 4.3 What happens when a tab closes

**Nothing the board owns changes.** That is the self-sustaining half of the
ask, and `/devices/keys/`'s card already promises it: *"The Pi keeps the link
when the tab closes"* (READ, `concept-list.mjs:39`). What a tab may hold, each
ending by itself:

| a tab's thing | ends when | precedent (READ) |
| --- | --- | --- |
| the screen mirror | no `screen.watch` for 15 s | `LEASE_MS` 15,000 in `screen-camera.mjs:12`, viewers pruned every 2 s `:127-132` |
| the audio stream to the relay (new) | no `audio.listen` for 15 s | `video.watching` and its idle stop, `board.mjs:321-344` |
| notes from on-screen keys into Plaits or collide | the page quiet for 15 s | `QUIET_MS` 15,000, `plaits.mjs:20`, `:144`; `scollide.mjs:74`, `:380` |
| the granulator insert | quiet for 15 s | `INSERT_HELD_MS`, `board.mjs:171-175`, swept `:192-215` |

⚠️ **THE AUDIO STREAM IS THE NEW ONE, AND THE EXPENSIVE ONE.** Gating `sendPcm`
on a listener lease ends the ~96.6 KB/s that a running engine sends today with
nobody listening (section 0). The direct path is untouched: a peer on it is a
listener by having opened it.

⚠️ **AND THE RELAY DROPPING MUST NOT STOP THE SOUND.** `ws.onclose` calls
`stopAudio()` and `stopSampler()` (READ, `board.mjs:1315-1316`). A patch using
the sampler would go silent on every relay blip. On a board that runs itself,
a lost relay ends the stream to the relay and nothing else.

### 4.4 The screen

The screen is the OS's. A page may still draw on it (`oled.text`,
`screen.patch`, `screen.note`, READ `board.mjs:1048-1077`), and its drawing
stays until the next key press, which returns the screen to the OS: **a person
at the device wins**. `screenTaken()` (READ, `:158`) becomes the OS's question,
not the Circuit drums' alone.

---

## 5. The remote control page

### 5.1 How the frames reach a page

- `panel.mjs` already makes each frame as 1,024 bytes (READ, `:56-61`) and
  throws it away after the write. It needs one `onFrame(fb)` hook. The same
  hook is what `plans/plan-pi-hdmi.md:38-41` needs for the HDMI mirror, so it
  is built once.
- **A room of its own, `studio-1-screen`, opened by the board only while a
  lease is held**, the pattern of the picture's `-video` room (READ,
  `board.mjs:226-256`). Three reasons, each READ:
  - a binary frame in `studio-1` is read as PCM by every page (READ,
    `board.mjs:226-228`), so in the main room the frame would have to be
    base64 JSON, 1.4 KB instead of 1 KB;
  - every socket in a room gets every message (READ, `positron-streaming`'s
    fan-out rule, relay `index.js:267-276`), and the Pico is a socket in
    `studio-1` with 64 KB of heap (MEASURED 2026-10-16, 30 of 64 KB used);
  - frames nobody asked for would be the PCM mistake again.
- **Binary, 8 byte header plus 1,024 bytes**, as `sendFrame` does for video
  (READ, `board.mjs:261-274`): a counter and a flag word.
- **Only changed frames are sent, plus one every 5 s** for a page that joins
  late. The panel redraws only on a change, except while it animates (READ,
  `panel.mjs:73-81`: rings while alive, a patch picture always).

### 5.2 At what rate, and at what cost

| what the screen does | frames a second | bytes a second into the relay | messages a second |
| --- | --- | --- | --- |
| the menu, still | 0.2 (the 5 s refresh) | about 0.2 KB | 0.2 |
| a sequencer at 120 bpm, sixteenths | 8 (one frame a step, READ `sequencer.mjs:197`) | about 8.3 KB | 8 |
| a patch picture or the rings, animated | 15 (`FRAME_MS` 66, READ `panel.mjs:17`) | about 15.5 KB | 15 |
| for comparison: one engine's audio, today, always | 50 | about 96.6 KB | 50 |
| for comparison: the screen camera's mirror | 12 | about 17 KB (READ, `lessons/rig-board-panel.md:30`) | 12 |

Each viewer multiplies the outgoing bytes (fan-out). Against the relay's
budget of 8 MiB/s and 1,000 messages a second (READ, `wire.mjs:36-41`) the
worst row is under 0.2 per cent of the bytes and 1.5 per cent of the messages
(INFERRED, arithmetic). In the relay's terms the mirror costs less than a third
of what one running engine sends today with nobody listening. A bill in money
is not worked out here: the Durable Object's message pricing was not looked up
for this plan.

⚠️ **THE CAMERA MUST NOT LEAK INTO THE MIRROR.** While the screen shows the
camera (`raw` mode from `screen-camera.mjs`, READ `panel.mjs:143-148`), the
mirror sends a blank frame flagged `camera`, because `studio-1-screen` is
tokenless and the camera's frames are keyed for a reason (READ,
`lessons/rig-board-panel.md:30`, *"A 128x64 one bit picture is still a picture
of the room"*). A page with the key already sees them in `studio-1-cam`.

### 5.3 The keys from the page

`panel.press { k, down }` in `studio-1`, handled by the board exactly as a GPIO
edge, and broadcast back as `panel.key` with `via: 'remote'` so every page sees
which hand pressed it. The page's four buttons are the ones `pi-seq.mjs`
already builds (READ, `:209-219`, pointer down and up, held keys tracked), so a
hold of `*` is a real hold.

### 5.4 The page

**`/devices/control/`**, one plain word, unique in `devices`, not a group name
(`remote` is a group, so `/devices/remote/` would read as a link to it). Order
on the page, top to bottom: the mirrored screen with its four keys beside it
(the `ol-media` block `pi-seq.mjs:220-225` already lays out), the patch list
as a table with the playing one marked and a load per row, a stop all button,
then the patchbay of the current patch drawn from `board.state`'s link lines
(`parseLink`, `createPatchbay`). Join on a press, never on load.

### 5.5 And the existing `/devices/` pages

**Keep them as demos; do not fold them in.** Each teaches one idea, and the
concepts skill's rule is one idea per page; the owner also asked that UI is not
removed without asking. What changes in each, in one step (section 7, step 5):

- on connect, `board.ask` and draw from it;
- Play is `board.load <its patch>` and Stop is `board.stop`, so the page and the Pi's
  menu cannot disagree about what is playing;
- the drum pages stop acting on `panel.key` (READ, `pi-seq.mjs:46-60`), because
  the board does it now; they show the edit instead, from `seq.state`;
- the `leaving` guard (READ, `pi-seq.mjs:35-37`) stays: closing still stops
  nothing.

Whether `/devices/control/` should later replace them on the front page is the
owner's call, not this plan's.

---

## 6. Boot

### 6.1 What happens today (READ)

`systemd` restarts the service forever, 2 s apart (READ,
`positron-board.service`, `Restart=always`, `RestartSec=2`,
`StartLimitIntervalSec=0`). At start the board kills stray audio processes
(READ, `board.mjs:1385-1394`), opens the panel asynchronously (`:355`), starts
the PWM output (`:1479`) and dials the relay (`:1482`). Everything else waits
for a page. The graph that every link needs waits for the relay (section 0).

### 6.2 Recommendation

- **Gather `graphFacts` at start, not in `ws.onopen`**, and refresh the port
  list on open. Without it nothing below works offline.
- **A power-on boot goes to the menu with nothing playing, the last patch
  selected**, so one `#` press resumes it. A board in another building that
  makes sound by itself after a power cut at night is a surprise, and nobody at
  the desk can be asked.
- **A service restart resumes what was playing** (`now.json` says `playing`),
  because a restart is a push or a crash, and both should be invisible to a
  listener. Told apart by `/proc/uptime` under two minutes (INFERRED; the
  threshold is a guess).
- **`BOARD_BOOT_PATCH=<name>` in `/etc/default/positron-board`** for an
  installation that must play on power. Off by default.
- **The menu works before the relay answers, and keeps working without it.**
  The header's relay dot is the only thing that waits for it.

### 6.3 The ~90 s the relay refused the board

`BACKLOG.md:19`: after the 06:08 push, `studio-1` and `studio-1-circuit` closed
1006 within 0.5 s on every retry until 06:10:33, while `studio-1-cam` joined.
Cause not found, and this plan does not find it. Two things it adds:

- **The backoff stretches any refusal toward 90 s by itself.** It starts at
  500 ms and doubles to a 30 s cap (READ, `board.mjs:1240`, `:1317-1318`), so
  the first eight waits are 0.5, 1, 2, 4, 8, 16, 30 and 30 s, 91.5 s in all
  (INFERRED, arithmetic). A refusal of any length between about 31 and 61 s
  ends at the next retry, which lands at 61.5 or 91.5 s. Recommendation: cap
  the backoff at 5 s until the socket has opened once since start.
- **Node's `WebSocket` reports only 1006, never the HTTP status of the refused
  upgrade.** So on a close within 1 s of dialling, the board should `GET
  /room/<room>/stats` and log the status and socket count; the relay refuses a
  full room with 503 (READ, relay `index.js:122-126`). That turns the next
  occurrence into a measurement.

---

## 7. Steps, smallest useful first

Every step: `node rig/board/test.mjs` on the laptop against the stand-in, then
`push.sh` (restarts the service, owner's OK), then the check on the Pi through
the relay with `node rig/board/ask.mjs --room studio-1 <verb>`, which needs no
LAN.

| # | step | what it proves | how to check |
| --- | --- | --- | --- |
| 1 | **`board.stop` and `board.check`, and `*` held 1 s on the Pi's keys runs `board.stop`.** Section 2's order, the check's rows. No menu, no patches | everything a page can start, the board can end, with no page; and the check sees it | stand-in: start the sequencer, hold a keyboard note, `jack.link` drums to pwm, then `board.stop`; every row green. Sabotage each stop step in turn, the matching row red. On the Pi: start `/devices/drums/`, close the tab, hold `*`; `ask.mjs board.check` all green and `jack_lsp -c` on `pwm:playback_1` empty |
| 2 | **The board runs without the relay**: `graphFacts` at start; `ws.onclose` no longer stops sound; the backoff capped at 5 s before the first open; the stats probe on a fast 1006 | a patch can be brought up while the relay refuses | board started with `--relay ws://127.0.0.1:9` (nothing listens): `seq.start` through a local call wires its link; the log shows the probe's status line |
| 3 | **Patches as files and `board.load` / `board.ask` / `board.state`**, the five built-ins of 1.4, the drum voices loaded by the board, the diff between patches, `now.json` | one verb switches the whole board, and the switch leaves nothing of the old patch | stand-in: `board.load drums`, `board.load synth`, `board.check` shows only synth's two links and no sequencer. On the Pi: the same, heard at the PWM socket; `jack.links` lists only the new links |
| 4 | **The menu and the keys in the board**, the `menu` mode in `panel-screen.mjs`, section 3's key table; in the SAME change, `pi-seq.mjs` stops acting on `panel.key` | the Pi is usable with no page; no key acts twice | the simulated screen on `/devices/text/` draws the menu; on the Pi with the relay URL pointed at nothing, choose `drums`, play, edit a step, hold `*`. With two drum tabs open, one `#` toggles a step once |
| 5 | **The mirror and `/devices/control/`**: `onFrame` in `panel.mjs`, `studio-1-screen` with the lease, `panel.press`, the camera guard; the `/devices/` pages read `board.state` and play by `board.load` | the page shows the Pi's own bytes, its keys act as the Pi's keys, and the page owns nothing | the page's frame equal byte for byte to the panel's (an assert against the stand-in, which already draws frames, READ `lessons/harness.md:4196`); close the tab, `studio-1-screen`'s socket closes within 15 s (`/room/studio-1-screen/stats`) |
| 6 | **The audio stream behind a listener lease** (`audio.listen`), every page that plays the board's sound renewing it | an engine running with nobody listening sends nothing to the relay | `sentFrames` in `board.alive` stops rising 15 s after the last listener; a page that listens hears it again within one renewal |
| 7 | **Boot and the Pico**: power boot to the menu, service restart resumes, `BOARD_BOOT_PATCH`, the Pico's button linked to stop all; save a patch from the menu into the state directory | the board comes back by itself into a known state | `sudo systemctl restart` while `drums` plays: drums again within seconds; a reboot: the menu with `drums` selected; BOOTSEL stops all |

The split screen (`BACKLOG.md:4`) slots in as the `split` screen setting after
step 4, whenever the parallel experiment is ready. Nothing above waits for it.

---

## 8. What could not be settled, and what must be measured on the board

- **How long a switch takes.** Plaits' start, collide's start and eight voice
  compiles (one compile MEASURED 53.5 ms on 2026-10-12, `BACKLOG.md:664`) are
  not timed end to end. The loading screen needs the number; step 3 records it.
- **Whether the Circuit honours CC 123 on its drum channel and its synth
  channels.** The ledger covers the board's own notes; the CC covers the rest
  only if the Circuit obeys it. Measure by holding a pad note from a page and
  sending CC 123 alone.
- **The silence floor of the engines' own capture.** The Fast Track Pro input
  reads about -80 dBFS (MEASURED 2026-10-11); `posboard`'s capture with the
  engines idle has no recorded floor, and `board.check`'s silence row needs one.
- **Whether `StateDirectory` works with this unit as written** (user
  `positron`, `NoNewPrivileges`). READ in systemd's documentation, not tried.
- **The chord `^` and `v` for the menu, and the 1 s hold for stop all**, are
  untried with a thumb.
- **What `board.check` cannot see:** notes the Circuit plays from its own pads or
  sequencer never pass the board. The check says so; it does not read green
  for them.
- **The 90 s refusal's cause.** Section 6.3 adds a measurement and shortens the
  wait; it does not explain the refusal.
- **The relay's bill in money for the mirror and for today's audio stream.**
  Worked out here in bytes and messages only.
- **Whether a board that resumes on a service restart is wanted.** It is the
  plan's recommendation, and it is the owner's decision.

## What this plan refused, and why

- **A lock or lease on sound held by a tab.** A tab that closes cannot release
  it, which is the orphan problem in another shape. Tabs lease only views.
- **A new link language for patches.** `parseLink` already reads one, with
  transforms and comments.
- **Listing engines in a patch.** They follow from the link ends; a second list
  could disagree with the first.
- **Folding the `/devices/` pages into the remote page.** They are one idea
  each, and removing UI is the owner's call.
- **Sending the mirror in `studio-1`.** Binary there is read as PCM, and every
  socket in it, the Pico included, would receive every frame.
- **Booting straight into sound by default.** A surprise at night in another
  building; it is a setting instead.
