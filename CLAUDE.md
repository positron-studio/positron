# positron

Live at **https://positron.studio**. R&D, not a product. 56 demo rows of which
55 are built (counted 2026-10-14), a Raspberry Pi at a second site, a Novation Circuit on the
desk, and a pile of measurements about streaming.

⚠️ **COUNT THE DEMOS, NEVER REMEMBER THEM.** This line said `47 of 49` one
morning and `51 of 53` that afternoon and both were true when written, and both
times it was a background agent reading the stale number that caught it.

```sh
node -e "import('./demo/manifest.mjs').then(m => console.log(m.DEMOS.length))"
```

🔴 **THE FRONT PAGE IS THE CONCEPTS INDEX SINCE 2026-10-13**, asked as *"when
all is done, move concepts to frontpage. use http://127.0.0.1:8890/kit/frontpage/ on top THE HERO,
LARGE. rename all with group/slug, rm numbers"*. `demo/index.html` is THE HERO,
LARGE (`demo/shell/hero.mjs`, the same block /kit/frontpage/ shows) over the
cards of `demo/shell/concept-list.mjs`, and the build copies that file as it is.
Every concept page is at `/<group>/<slug>/` (https://positron.studio/synth/keyboard/),
no number anywhere; `/concepts/` answers 302 to `/` and every old
`/concepts/<group>/<number>/` is a 404. The old table is in `positron-history`.
The slug is ONE plain lowercase word, never its group's name (*"Resolve clashes.
Avoid dashes on names."*, 2026-10-13): `/remote/circuit/`, not
`/remote/circuit-on-pi/`, and a group name taken by an archived page is resolved
by moving that page (the radio demo is `/archive/radio/`), not by renaming the group.
The listed manifest rows (today only `kit`, counted 2026-10-14) draw as use case cards from
`DEMO_CARDS`, skipping `built: false` and `unlisted` rows. The paragraph below
describes the manifest-baked front page, which is in `archive/frontpage/`; what
it says about `built: false` and the deploy is still true.

The front page WAS ordered NEWEST FIRST, because the index answers *what is new
here?*; `DEMOS` is the story order and answers *where do I start?*, and
`byNewest()` copies it. 🔴 **`unlisted: true` HIDES A ROW FROM THE INDEX, AND
`built: false` DOES NOT.** This line said `built: false` until 2026-09-28 and it
was acted on and DEPLOYED before one `curl` measured it: `built: false` takes
the page out of the deploy entirely, because `workers/view/build.mjs:566` reads
`if (!d.built) continue` while enumerating directories, so `/grains/` answered
**404** while the front page went on drawing a `grains` card with no link behind
it. The front page never looks at `built`. `byGroup()` filters on `unlisted`,
once, so the two index renderers cannot disagree.

## The standing files, and what each one answers

| file | answers |
| --- | --- |
| `HANDOFF.md` | what state this is in right now |
| `BACKLOG.md` | what has been asked for and not yet done |
| `LESSONS.md` | why the rules exist, at length |
| `PROGRESS.md` | what was measured, when |
| `LAYOUT.md` | where a new file goes, and the two renames that were priced and rejected |
| `plans/` | every plan, 88 of them on 2026-10-05 evening (`ls plans/*.md \| wc -l`, counted and never remembered). A new one goes here and nowhere else |

## The skills, and when to load one

🔴 **THIS FILE USED TO BE 2245 LINES AND IT IS NOW ABOUT A FIFTH OF THAT.**
Everything that left is in `.claude/skills/`, verbatim, and nothing was
summarised away. What stayed here is what is true on every task: the workflow,
the things that cost real money, and the rules about what leaves this machine.

**Load the skill BEFORE the work, not after it.** A rule that is not loaded is
a rule that gets broken, and most of what follows was written down because
somebody broke it.

| load | before |
| --- | --- |
| `positron-compose` | deciding where anything goes, writing any padding, margin, gap, width, border or radius, or saying a layout is done. It is the composition and cascade half; `positron-ui` is the kit half, and a layout task loads both |
| `positron-ui` | building or changing any interface, control (a control is usually a node's port), readout, table, transport bar, the patchbay block on a page, or a stylesheet rule |
| `positron-diagram` | drawing or editing a hand-written diagram (`diagram.mjs`, a slide's picture). Not part of a new page since 2026-10-14: it lives in `/kit/diagram/` and archived pages, and may come back |
| `positron-verify` | running or changing a harness, adding or removing a control, believing a red run, reporting a measurement or an absence |
| `positron-streaming` | anything under `workers/` or `src/` (and `workers/cast/` loads `positron-cast` too), any page that plays a stream or adds an audio, video, file or state link that leaves the machine (a heavy link and its transport), quoting a latency or a bill |
| `positron-xr` | any `gl: true` or headset page, `verify-gl.mjs`, `verify-quest.mjs`, a full screen button on any page or full screen on a phone |
| `positron-cast` | changing anything under `demo/radio/cast/` or `workers/cast/` (the Väin cast, both engines), judging or describing how the cast sounds, and a cast deploy |
| `positron-git` | any commit, stage, rename or history rewrite, a scripted edit across files, or redoing a command that was stopped |
| `positron-hardware` | anything under `rig/`, a page that plays real hardware (the remote concepts, the Pi as site `pi-1`), any claim about an instrument |
| `positron-history` | following a link, slug or path out of an older file (a numbered or dashed concept address, `/rhythm/`, `/stations/`, an archived demo, a retired worker), or repeating a claim about a rename |
| `positron-slides` | writing or revising any slide text, deck outline, speaker notes or playable lesson, including a deck in `demo/shell/decks.mjs`. It is the words half; drawing a slide is `positron-ui` |
| `positron-concepts` | building or changing any concept page (`demo/<group>/<slug>/`, the folders in `CONCEPT_DIRS`, each a patch of nodes, ports and links) or a card on the front page, or explaining a patchbay idea as a small page |
| `positron-describe` | writing or changing any card description (`say`), manifest `one` line, page `what` text or readout key a visitor reads, or checking somebody's proposed copy against a page |
| `positron-studio-start` | somebody wanting to stand up a positron-shaped site of their own on Cloudflare, before the first command |

⚠️ **AND THE TRIGGER IS THE WORK, NOT THE FILE.** Adding one button to a page
is a `positron-ui` task AND a `positron-verify` task, because adding a control
moves every other control's harness press. When two apply, load both.

## Pushing needs the PERSONAL GitHub account, and it is not the active one

🔴 **`git push` ANSWERS `Repository not found`, AND THAT IS AN AUTH FAILURE
WEARING A 404.** Two accounts are logged in here: the work account, which is
ACTIVE, and `kristjanjansen`, which can push to
`github.com/positron-studio/positron` (the home since 2026-10-14: transferred
from `kristjanjansen/positron`, public, history scrubbed and force-pushed; the
pre-scrub checkout is `~/personal/positron-old-history`).
GitHub returns 404 rather than 403 for a private repo the caller
cannot see, so the message says the repository does not exist when what it means
is that this token may not look at it. It cost most of a session, spread over
three sittings, because "not found" reads as a wrong remote URL or a deleted
repo, and both were checked before the accounts were.

```sh
gh auth switch --user kristjanjansen     # the account that owns the repo
git push origin HEAD
gh auth switch --user <work account>     # put it back, ASKED FOR 2026-09-17
```

⚠️ **SWITCH BACK.** The active account is machine-wide and the work one is the
default for a reason; leaving it on the personal account changes what every
other repository on this laptop authenticates as.
⚠️ **THE KEYCHAIN SHORTCUT DOES NOT WORK HERE AND WAS TRIED.** Storing the
personal token against `username=kristjanjansen` so the URL could carry the user
and survive a switch: `git credential-osxkeychain get` reads the entry back, and
`git credential fill` finds nothing, because the helper on PATH and the one git
resolves out of Xcode's `gitconfig` are different binaries. `git credential
approve` does not fix it either. SSH is not a way round it as things stand —
`ssh -T git@github.com` answers `Permission denied (publickey)`, so there is no
key on the personal account yet. Adding one is the only thing that would remove
this dance.
⚠️ **AND THE COMMITS ARE AUTHORED WITH THE WORK ADDRESS.** `user.email` here is
the work address, on a personal repository. Nothing was changed about
that, because attribution is not a thing to alter without being asked.

## The Circuit pack lives in the owner's private pack repository, NOT in this one

🔴 **THE BACKUP OF THE CIRCUIT IS IN THE OWNER'S PRIVATE PACK REPOSITORY, AND
IT IS OUT OF THIS ONE ENTIRELY SINCE 2026-09-24.** Instructed: *"rm new pack, is
in separate repo"*. MEASURED through the GitHub API BEFORE anything was removed:
the pack in that repository is the same size, to the byte, as the copy that was
on this disk and the blob that was in this history. Three numbers, one value.
🔴 **BOTH OF THIS REPOSITORY'S COPIES ARE GONE, IN ONE PASS AND ON PURPOSE.**
The working copy was deleted and its blob was dropped from history with
`git filter-repo`, while preparing this repository to be made public.
⚠️ **SO NO COMMIT HERE HOLDS IT, AND ANY OLD HASH NAMED AS ITS RECOVERY PATH
NO LONGER EXISTS.** Every hash in the history moved when the rewrite ran.
**The recovery path is the owner's private pack repository.**
🔴 **WHY IT HAD TO LEAVE, AND IT IS NOT TIDINESS: A PUBLIC CLONE CANNOT BE
RECALLED.** History is what a clone gets, and the sessions in the pack are the
owner's own work. A private repository of its own is the right home for it;
this one was about to stop being private.
⚠️ **AND TWO PAGES WERE FETCHING IT, SO THEY MOVED IN THE SAME BREATH.**
`/pack/` and `/tom/` decided from the ORIGIN that a pack was present on a
checkout, which stopped being true the moment the file went. Both now fetch
NOTHING by default on any origin and take an explicit `?pack=<url>` instead, so
the reading checks stay reachable for anybody holding a pack of their own while
nothing is asked of anybody by default. MEASURED after: `pack` and `tom`
**59/59 green, 0 requests, 0 failed**.

⚠️ **EVERYTHING BELOW IS WHY THAT OTHER REPOSITORY MATTERS.**

🔴 **IT IS A COMPLETE BACKUP OF THE NOVATION CIRCUIT ON THIS DESK**, taken
2026-09-20 through Novation Components, and the only one.
⚠️ **THE CIRCUIT DOES HAVE A FACTORY RESET. THIS LINE SAID IT DID NOT UNTIL
2026-10-03**, when the owner said *"Don't be so protective about the circuit. It
does have a factory reset. Look it up."* Novation's *"Using Components to reset
a product to Factory Settings"* restores the factory content from Components
(Send to Circuit on the Circuit Factory Pack, and a firmware reinstall). What a
reset does NOT bring back is the owner's own sessions, and those live in the
owner's private pack repository. So the precaution stands at its real size: three things
replace the contents (`Send to Circuit`, the Factory Pack, a `Replace Patch`
SysEx), and before any of them the backup must exist. SysEx to the Circuit is
an ordinary operation with that precaution, not a forbidden one: *"be careful,
but don't be so afraid of sysacks. It's just any other device with some
precautions"*. 49 older lines across the repository still say "no factory
reset" and are corrected per page as each is touched (BACKLOG, 2026-10-03).
✅ **A BACKUP IS VERIFIED, NOT ASSUMED, AND VERIFYING ONE NEEDS NO DEVICE.** A
`.circuitpack` from Components is a zip: `unzip -l`, read `index.json` (it reads
`product: circuit, version: 2.0`), check the session count, and check one patch
is exactly **350 bytes** starting `F0 00 20 29 01 60`. Fewer WAVs than sample
rows is normal rather than damage. `plans/plan-circuit-patches.md` has the whole
procedure and the list of what destroys patches.
🔴 **WHETHER A SESSION IS SOMEBODY'S WORK IS DECIDED BY ITS CONTENT, AND THREE
SHORTCUTS WERE TRIED HERE AND FAILED.** A session's name is a label somebody did
not change. Its first four bytes (`USER`, `DEMO`, `INIT`) are not evidence
either: real work was found carrying the head once published here as the blank
signature. And a unique hash only says two files are not identical, because a
one byte delta makes a distinct fingerprint. **The measure that works is
distance from the stock `Initial Session` template**, and a pack of blank
sessions is told from a pack of work by entropy and the share of non-zero
bytes, which separated the two by two orders of magnitude when measured on
2026-09-21.

🔴 **SEVERAL PACKS CAN DISPLAY UNDER ONE NAME IN COMPONENTS, AND A PACK OF BLANK
SESSIONS WOULD ERASE THE REAL ONES.** A vendor's install note may say to press
`Send to Circuit`, which is one of the three operations listed above that
replace the instrument's contents (a factory reset restores Novation's content,
never the owner's sessions). So the safe pack and one that would wipe every
session can be identically labelled rows in Components.
⚠️ **READ THE `name` IN `index.json` BEFORE SENDING ANYTHING**, because the file
name and the displayed name can be the same across packs and neither tells them
apart.
⚠️ Whether that transfer really writes session slots is INFERENCE and is marked
as such in `research/circuit-soundbank-2026-09-21.md`. The only way to confirm
it costs the sessions if the answer is yes.
🔴 **AN EXTENSION IS NOT EVIDENCE EITHER.** Byte 6 of a 350 byte patch message
is the command: `00` is `Replace Current Patch` and lands in RAM, `01` is
`Replace Patch` and writes FLASH. MEASURED 2026-09-21 on a file called
`on_the_run.circuitpack` fetched from a public archive: **it is not a zip at
all**, it is a raw SysEx stream of 6,930 messages, and 64 of them are Circuit
patch messages carrying **command byte `01`**, aimed at **all 64 slots, 0
through 63**. One file, every synth patch on the instrument, and the extension
says `circuitpack`. A `.circuitpack` that is not a zip is the shape to be afraid
of: Components would not open it, so anybody handling it reaches for a SysEx
tool, which is the one route with no safety rail on it.
**Read byte 6 of every 350 byte message before touching any file that did not
come from this repository.**

## Run and check

```sh
node demo/server.mjs                     # :8890, serves the repo; / == deployed
node demo/verify.mjs                     # every built demo (CDP, asserts on window.__demo)
node demo/verify.mjs archive/radio tapes         # just these, by slug
DEMO_DEEP=1 node demo/verify.mjs stage    # the deep tier: round trips, recordings, live streams
node demo/verify-native.mjs              # THE IPHONE CODE PATH, RETIRED 2026-10-13: it drove /llhls/, whose input is deleted, and refuses (exit 2)
node demo/fake-station.mjs               # an Icecast mount that is nobody's radio
node demo/fake-tapes.mjs                 # an archive that is nobody's archive
node demo/fake-err.mjs                   # a live edge that is nobody's broadcaster
node demo/shell/looper-test.mjs          # the looper's arithmetic, no browser
node demo/shell/xr-quit-test.mjs         # is there really a way out of every headset page
node workers/mail/test.mjs               # what arrives at positron@ is spam or a person
node demo/resources/measure-durations.mjs   # how long each recording is, asked once
node demo/resources/build-mimproject-images.mjs --check   # the recovered pictures, prints only
node demo/verify-safari.mjs              # desktop Safari over WebDriver, RETIRED 2026-10-13 with /llhls/'s input, refuses (exit 2)
node demo/shot.mjs kit/devices 375 1280  # LOOK at a page on an iPhone mini and at the desk, before saying it is done (the kit is /kit/<part>/ since 2026-10-06)
node demo/which-rule-won.mjs fau '.fau-src textarea' padding-top   # every declaration for one property, and which won; sees a shorthand beating a longhand
node demo/ancestry.mjs nola '.panel-plate' padding-top --width 375  # every ancestor's inset and which one makes a containing block, before writing a fourth override
DEMO_BASE=https://positron.studio node demo/verify.mjs      # against the deploy

cd workers/view && node build.mjs && npx wrangler deploy    # ALWAYS build first
```

`.env` in the cwd shadows machine OAuth. Deploy from a directory without one, or
`env -u CF_API_TOKEN -u CLOUDFLARE_API_TOKEN npx wrangler deploy`.

Device logs from any phone or headset:
`https://pub.positron.studio/logs?format=text`. 🔴 **Those reports used to
evaporate in under a minute** — the ring buffer was an in-memory array on a
Durable Object, so an eviction took it with it. MEASURED 2026-09-12: posted at
02:07:46, read back fine, **gone by 02:08:32**. The failure mode is the worst
shape there is — the device ships correctly, the reader sees
`(nothing reported)`, and the obvious conclusion is that the device never sent
anything, so somebody debugs the device. Persisted to DO storage now and
re-checked at 120 s. **Any "the phone reported nothing" conclusion drawn before
2026-09-12 is worthless.**
Every 06 log opens with `BUILD <sha>-<hhmmss>`, so a report can be attributed.
Clear with `POST /logs/clear`. `GET /status` blocks on the container's cold start
— that is expected, not a hang.

## The VPN passes the handshake and drops the media

🔴 **THERE IS A VPN ON THIS MACHINE AND IT IS SWITCHED ON AND OFF. CORRECTED
2026-10-05**, the owner's words: *"vpn in on and off"*. It is Check Point
`Endpoint Security VPN`, and when it is up the default route is its tunnel,
`utun4`. Two sentences further down say there is no VPN here; they record
what was said on 2026-09-25 and are wrong about the machine, not about the
measurements beside them.
⚠️ **SO ASK THE MACHINE, NEVER THIS FILE, WHICH STATE IT IS IN TODAY:**

```sh
pgrep -fl Endpoint_Security_VPN; route -n get 8.8.8.8 | grep interface   # utun4 means the tunnel is up
```
⚠️ **`en0` does not prove the tunnel is down**: on 2026-09-30 the route read `en0` with five `utun` up and UDP dropped. A STUN probe to `stun.cloudflare.com:3478` is the test that cannot be fooled (`positron-streaming`).

🔴 **IT BREAKS A SECOND THING, AND THIS ONE IS INSIDE ONE PAGE.** MEASURED
2026-10-05: with no capture permission, headless Chrome offers a peer
connection exactly ONE host candidate, the interface that routes to the
internet, which with the tunnel up is `utun4`, and UDP sent to that address
never comes back to this machine. So two `RTCPeerConnection`s in the SAME tab
sit in `checking` for ever. That was `/capture/` RECEIVER (8 reds) and
`/wire/` KEYBOARD's sound back (1 red) for a day, read as page bugs. Granting
`audioCapture` makes Chrome list every interface and the loopback connects in
about 100 ms. `demo/verify.mjs` grants it to `wire` and `capture` only
(`PEER_IN_PAGE`), audio only, reset before every page. ⚠️ A visitor behind a
tunnel like this one with no microphone permission still meets the stall;
the page-side cures are asking for the microphone or a TURN relay, and
neither has been chosen.
⚠️ **AND IT EXPLAINS WHY WebRTC PAGES PASS ON SOME DAYS AND FAIL ON OTHERS.**
A red on any page with a peer connection is a question about the tunnel
before it is a question about the code.

🔴 **BEFORE DEBUGGING ANY WebRTC FAILURE, CHECK THE VPN. IT COST MOST OF A
SESSION ON 2026-09-25 AND IT LOOKED LIKE CODE EVERY SINGLE TIME.** `/stage/` was
rewritten five different ways, the harness was blamed, then headless Chrome was
blamed, then the page was declared broken for visitors. None of them were it.

⚠️ **RETIRED 2026-10-13: `demo/check-whep.mjs` AND THE `/watch` IT NEEDED ARE
GONE.** It played the input `whep-rig`, which Stream deleted that day with the
test pattern feeding it, and pub's `/watch`, `/status` and `/whip` answer 410.
The script is at `archive/check-whep.mjs` as the record of how the table below
was measured. **The WebRTC check today is
https://positron.studio/video/webrtc/ (WebRTC loopback):** press, allow
the camera, and the WebRTC panel shows the round trip in ms. ⚠️ It asks for a
TURN relay as well, so behind a tunnel that drops UDP it may connect through the
relay where `check-whep.mjs` (no relay) failed; it is not the same instrument
and a pass there does not clear the tunnel. `DEMO_DEEP=1 node demo/verify.mjs
stage` is the harness form (WHEP from `/stage/`'s own input, which asks for the
relay too). The tunnel itself is answered by the `route` line above.

**MEASURED the same minute, same machine, one toggle apart:**

| | status | connection | frames | bytes |
| --- | --- | --- | --- | --- |
| VPN ON | **201** | failed | **0** | **0** |
| VPN OFF | **201** | connected | 489 | 4,428,273 |

🔴 **THE STATUS IS 201 EITHER WAY, WHICH IS WHY THIS IS SO HARD TO SEE.** The
WHEP handshake is ordinary HTTPS and it succeeds, so Cloudflare answers the
offer, the page logs `pc connecting`, and every signalling line reads healthy
while **not one byte of media ever arrives**. What fails is UDP, fifteen seconds
later, as an ICE timeout that reads like a bug in whatever page you are looking
at.
🔴 **AND THE PARAGRAPH BELOW WAS WRONG ABOUT `/webrtc/`, CORRECTED 2026-09-25.
THE OWNER SAYS THERE IS NO VPN ON THIS MACHINE, AND WHEP WORKS HERE.** Three
measurements the same afternoon, each one undoing a conclusion above it:
- 🔴 **`demo/check-whep.mjs` WAS LYING, AND IT WAS THE TOOL THIS WHOLE RULE
  RESTED ON** (retired 2026-10-13, see above). Its early return answers a WHEP POST of status >= 300 with
  `nothing is publishing to that input`, and its verdict block then printed a
  confident **CHECK THE VPN FIRST** anyway, because it only tested
  `framesDecoded > 0`. So it blamed a VPN that does not exist for an input that
  had no publisher. It has three outcomes now and exits 2 on `INCONCLUSIVE`.
- ✅ **WITH A PUBLISHER AWAKE, WHEP MEDIA REACHES THIS MACHINE:** `status 201`,
  `connection connected`, **389 frames, 3,554,870 bytes**. No VPN, no code
  change. Holding a socket to `wss://pub.positron.studio/watch` was what woke
  the container then; `/watch` was retired on 2026-10-13 and answers 410.
- 🔴 **AND `/webrtc/`'s TWO ASSERTS WERE NOT THE CONNECTION'S FAULT. THE
  CHECKS WERE UNREACHABLE ON EVERY PATH.** `d.run('check')` sat after a `for`
  loop whose success branch `return`ed and whose failure branch `return`ed, so
  no route through that handler ever reached it. The comforting explanation
  written here was that the checks sat behind a connection that never happened.
  They sat behind a connection that DID happen and were skipped anyway. One
  character, `return` to `break`, plus an assert where a bare `d.log` used to
  swallow an unreachable subject. **MEASURED after, headless, publisher awake:
  `page asserted something` went from 2 to 10 and `/webrtc/` reads 16/16 with
  `peer connection connected`, `a VIDEO track arrived`, `frames are actually
  RENDERED 1280x720` and `element is playing` among them.**
⚠️ **WHAT SURVIVES.** The VPN table below was measured one toggle apart and
is kept: a VPN really does pass the handshake and drop the media. What does not
survive is **using it as the explanation for any red on this desk**, and the
sentence that WHEP does not connect in this headless Chrome for any page.
⚠️ **THE LESSON IS THE ONE THIS FILE ALREADY TEACHES, ONE LAYER UP.** A green
page with no coverage is the worst possible control, and this time the page with
no coverage was **the diagnostic tool itself**. Check that a check can fail.

⚠️ **AND `/stage/` WAS 49/49 THE MOMENT THE VPN WENT OFF**, with no code change
between the two runs.

✅ **MOST WORK IS UNAFFECTED AND DOES NOT NEED THE VPN OFF.** Everything that is
HTTPS still works: LL-HLS (`llhls` read 12/12 with the VPN on, before its input
was retired on 2026-10-13), the relay and
every Durable Object page, R2 uploads and downloads, Cloudflare deploys,
`wrangler`, the GitHub push dance, the stand-ins, and every page with no live
WebRTC leg in it. **Only the UDP media path is lost.** So this is a rule about
one class of failure, not a reason to work unprotected.

🔴 **AND THE REAL LESSON IS ABOUT THE CONTROL, NOT THE VPN.** `/webrtc/` (its
leg retired 2026-10-13, the lesson not) was
used for hours as proof that WHEP worked, on the strength of a run reading
**8/8 green**. It contains **two** page asserts and both are the shell's: that
page's own checks sit behind a connection that never happened, so they have
never run on this desk. **A green page with no coverage is the worst possible
control**, and this project already knows it in writing, because a green suite
can mean zero coverage and **only the assert COUNT says so**. The count was
printed on every one of those runs.

## What costs real money and somebody else's server

🔴 **EVERY CONNECTION THIS REPOSITORY OPENS TO AN ERR MOUNT APPEARS IN A PUBLIC
BROADCASTER'S AUDIENCE MEASUREMENT.** ERR told us on 2026-09-16 that our
connections were distorting their listener statistics. Their
LISTENER STATISTICS were being corrupted by us, which is worse than load: a
broadcaster's audience figures are what it reports to its board and its
funders, and a few dozen headless Chromes holding mounts open for hours are
counted as listeners who never leave. It cannot be undone by stopping, only by
not adding to it. **So open one only when a person is going to listen to it.**

🔴 **AND IT IS NOT ONLY ERR. EVERY EXTERNAL SOURCE.** Instructed the same day:
*"stil: super careful with external sources, better avoid"*, in reply to
*"it uses archive.org, not ERR, so it is safe to run"*. That reasoning was the
mistake. **The rule is about whose server it is, not about which harm has been
named yet.**

🔴 **DO NOT RE-VERIFY `/archive/radio/` OR PROBE STATION HEALTH. ASKED TWICE**, the
second time as *"can we please stop assessing the radio, its killing me and my
budget"*. Never `curl` a mount, a health route or a live segment to find out
whether somebody else's server is up. The answer to *is it red because of me or
because of them* is: **say both are possible and move on.**

✅ **FOUR PAGES HAVE STAND-INS AND COST NOBODY ANYTHING**: `demo/fake-station.mjs`,
`demo/fake-tapes.mjs` and `demo/fake-err.mjs` make `radio`, `tapes`, `now` and
`flipper` runnable with zero bytes from anybody's server. They grade OUR code
and nothing else, they are verified LOCALLY and never with `DEMO_BASE`, and a
page green against one can still meet a 403 out there. `positron-verify` has
all of it, including the holes each one leaves and how they were found.

🔴 **A SELF-CHECK NEVER RUNS FOR A VISITOR. NOT ONE, NOT EVER, ON ANY PAGE.**
Instructed 2026-09-16: *"rip those selfchecks out of user experience and make
rule about it"*. Import `SELFCHECK` from `demo/shell/selfcheck.mjs`; the gate is
`?selfcheck=1`, which the harnesses append and **the default is off**. There is
no page that is an exception, *"nobody is holding this one"* is not an
exception, and *"it is cheap here"* is not an exception either. Both arguments
were tried, both shipped a defect, and `positron-verify` has the two stories.

🔴 **AND THE WORST SHAPE IS A PAGE THAT OPENS SOMETHING ON LOAD.** `/reel/`
fetched a newsreel and a day's radio on **every visit** for a first frame nobody
had asked to see. A visit, a step and a scrub must open nothing.

## How a session is run

These four, the owner's, 2026-10-19 (from the session transcripts):
- **Answer every question in the next reply**, and keep open questions in `BACKLOG.md` like requests (*"4th time askong"*).
- **Never hand the owner a timed chore**; automate it (*"i can not do it at that time. i need it fixed now"*).
- **A defect you notice gets fixed, not listed** (*"Noticed, not changed: - fix"*).
- **Work and push on `main`**, no session branches (*"just go to main"*).

And from the handoffs:
- **A stopped command may already have run**: read `git log` and grep the file before redoing it. More in `positron-git`.
- **An agent brief has a time box** (the pages, the run count, a stop-and-report point), and each agent gets its own scratchpad directory and dev-server port.
- **Confirm a format or numbering change on one example** before touching many files.
- **Ask when a two-word reply could answer more than one open question.**

🔴 **EVERY HEADLESS CHROME A SCRIPT OR AN AGENT STARTS IS CLOSED BY IT, AND
THE SESSION SWEEPS WHAT IS LEFT. Asked 2026-10-11:** *"i need to close all
chromes"*, then *"write to claude.md / skills to clean up properly"*. Sixteen
headless Chromes were running from a day of parallel agents' CDP scripts, each
with its own temp profile, and the owner needed Chrome closed.
- A script that spawns Chrome kills it on every path out: `try { ... } finally
  { chrome.kill() }` plus `process.on('exit', () => chrome.kill())`, and the
  same on an error or a timeout. `demo/shot.mjs` already does this; a
  throwaway script in the scratchpad must too.
- An agent brief that allows browser runs says: close every Chrome you start
  before reporting, and do not leave one running between runs.
- The session checks after each agent reports and before handing over:
  `pgrep -fl "Google Chrome.*--headless"` should print nothing, and
  `pkill -f "Google Chrome.*--headless"` clears what is left. It never
  touches the owner's own Chrome (no `--headless` in its command line).
- ⚠️ **Playwright's `chrome-headless-shell` is a headless Chrome the pattern above
  misses** (2026-10-20: *"chrome isntances choking my machine"*, at 65 % of a core).
  Sweep it too: `pgrep -fl "chrome-headless-shell"` should print nothing, and
  `pkill -f "chrome-headless-shell"` clears it.
- Temp profiles (`mkdtemp` under the system temp dir) go with it: remove the
  directory in the same `finally`.

🔴 **A REQUEST THAT ARRIVES MID-TASK GOES IN `BACKLOG.md` BEFORE IT IS WORKED
ON.** Over one long run a stream of small requests was tracked in the session's
head instead, and two were quietly dropped: the report that followed was *"do
you have it in yr backlog or you keep losing them"*, which is the right question
and the answer was no. Working from memory is fine for one thing and fails
silently for twenty, because a lost request looks exactly like a request that
was never made. Write the line first, work from the file, strike it off when it
is done. ⚠️ And a line leaves that file by being FINISHED or by being refused in
writing. Never by going quiet.

🔴 **A STREAM OF REQUESTS IS COLLECTED FIRST AND WORKED SECOND. ASKED FOR
2026-09-19:** *"lets work demo by demo. i will give steam of request, you
collect theb to backlog in detail and when done, do a parallelized effort to fix
it all"*. So the rule above has a second half now, and it is about WHEN.
- **While the requests are arriving, write and do not fix.** Every one lands
  under `## Open` in `BACKLOG.md` as it is said: the words verbatim, the slug it
  is about, the file it will touch, and whatever is already known that makes it
  non-obvious. Fixing the first one while the fourth is being typed is how a
  request gets answered with a change nobody can find later, and it spends a
  page's verification budget before the page has stopped changing.
- **When the stream ends, fan out.** One agent per page, because the pages are
  independent. ⚠️ **ANYTHING SHARED IS DONE ONCE, BY ONE AGENT, BEFORE THE
  PAGE AGENTS START**: a kit module, `shell.css`, a diagram rule, `manifest.mjs`.
  Otherwise four agents write four versions of it in one checkout, which is the
  hand-rolled control rule arriving by a different road.
- 🔴 **AND THE AGENTS DO NOT COMMIT.** Already written below and it is worth
  repeating here, because this arrangement is exactly the shape that breaks it:
  agents report, the session commits, and a commit made while one is running
  stages paths by name.
- 🔴 **VERIFY ECONOMICALLY, WHICH IS AN INSTRUCTION AND NOT A PREFERENCE:**
  *"make sure you do verify steps economically and do not drain the whole system
  with rerunning suites"*. `node demo/check-html.mjs demo/<slug>/index.html`
  parses a page with no browser at all and is the first answer. `node
  demo/verify.mjs <slug> <slug>` runs ONLY the pages that were touched, and the
  thing to look at is the per-page assert count against what it was, which is
  the check this file already asks for after any control changes. A full suite
  is dozens of Chromes and is not how you find out whether one page still works.
  ⚠️ And a red run is not re-run to see if it goes green: the rules above
  already say what an external red means.

🔴 **A STANDING FILE GOES STALE IN HOURS ON A BUSY DAY, AND A BACKGROUND AGENT
READING IT INHERITS THE ERROR AS A FINDING.** Both of this session's stale lines
were caught by agents, not by anybody looking: `tabs.mjs` reported as used by no
page while two pages use it, and the demo count at the top of this file wrong
**twice in one day**, `47 of 49` in the morning and `51 of 53` by the afternoon,
both true when written. ⚠️ **SO A CLAIM AN AGENT IS GOING TO BUILD ON IS WORTH
ONE COMMAND OF CHECKING BEFORE IT IS HANDED OVER**, and a brief should say which
claims in it were verified today.

## One shared resource with everything around it partitioned

🔴 **ONE FCM TOPIC MEANS ONE ROOM MAY USE IT.** `workers/items` (archived
2026-10-01, `archive/items/README.md`) gave every room its own Durable Object
— `idFromName(room)` — and `verify.mjs` gives every run its own room, so runs cannot see each other's rows. The one thing that was NOT
partitioned was `env.FCM_TOPIC`, so **every run of the suite sent two real
notifications to every real subscriber**, for a day, before anyone outside said
so. Announcing became an allowlist of ONE room (`items`) — ⚠️ not a prefix test,
because refusing rooms that LOOK like test rooms lets the next non-real room
through by default and the default has to be silence. ⚠️ The object has to be
TOLD its own room and remember it: the alarm fires with no request, and
`idFromName` tells an object nothing about its own name. **When a resource is
shared and everything around it is partitioned, ask who owns the sharing** — the
bug was a fact true of every part and of no part's author.

## Conventions

- 🔴 **A COMMENT SAYS WHAT THE CODE CANNOT, IN ONE TO THREE LINES. THE STORY
  OF HOW IT GOT THAT WAY LIVES IN `lessons/`.** Instructed 2026-10-14: *"cut
  comments, perhaps to separare lessons md or smth. updaet claude.md for
  cutting down comments to essnece"*. MEASURED that day by the code review:
  `shell.css` was 70.6 per cent comment (5,702 of 8,080 lines), and the kit's
  modules carried 39,543 comment lines against 32,934 lines of code. A reader
  looking for the rule had to read the whole history to find it.
  - **What stays in the code:** the constraint or the reason a reader would
    otherwise undo it (*"`display: block`, or the textarea's baseline leaves a
    1.5 px seam inside a glue"*), a measured number with its unit, a pointer
    to the lesson. No dates, no quoted conversations, no account of what it
    used to be, no capital letter alarms, no rule repeated from another file.
  - **What moves:** everything else, VERBATIM, to `lessons/<area>.md` (for
    example `lessons/shell-css.md`, `lessons/kit-transport.md`), under a
    heading naming the file and the selector or function. Never summarised:
    the measurements and the quoted reports are why a rule survives, which is
    the same rule as moving a skill.
  - **The pointer** is one line: `// why: lessons/shell-css.md#pos-glue`.
  - **New code is written this way from the start.** A new lesson goes to
    `lessons/`, and the comment gets the one line.

- 🔴 **A FINISHED PLAN IS REPORTED IN FULL, NOT HANDED OVER AS A FILENAME.**
  Instructed 2026-09-20: *"when plans done show them here in full details.
  write it into claude.md when plans getting ready"*. It is the same rule as
  the URL one below, one document along: `plans/plan-midi2.md` is the answer to
  *"which file did you write"* and not to *"what did you find out"*.
  ⚠️ **AND A SUMMARY IS NOT THE REPORT EITHER.** What a plan is FOR is the
  findings, the numbers, the trade-offs and the recommendation with its reasons.
  A reader who has to open the file to learn what was decided was handed a
  filename with extra steps. Say what it concluded, what it measured, what it
  refused and why, and what it could not settle.
  🔴 **AND WHEN A PLAN LANDS FROM A BACKGROUND AGENT MID-TASK, THE NEXT REPLY IS
  THAT PLAN, IN DETAIL, BEFORE ANY OTHER WORK IS REPORTED.** Instructed
  2026-09-26: *"Give me plans in detail when arriving. Write rule on it"*, after
  an 816 line plan on eccm.ee landed and the reply that followed it was about a
  boot budget, with the plan deferred to *"reading it in full before relaying
  it"* and then not relayed. A plan the owner asked for is the most expensive
  thing a session produces and the cheapest to lose: it arrives once, and a
  reply that mentions it in passing teaches the reader it was not important.
  The report carries the verdict, every numbered section's finding with its
  numbers, what was refused and why, what could not be settled, and the cost.
  Other work waits one reply.
  ⚠️ **THE UNCERTAINTY IS PART OF THE REPORT, NOT A FOOTNOTE.** This project
  keeps paying for confident sentences that outlived their facts. A plan written
  from documentation rather than from a running thing says so, and names what
  would have to be plugged in, switched on or measured to turn a reading into a
  fact.
  🔴 **AND THEY LIVE IN `plans/` SINCE 2026-09-20, NOT IN THE REPOSITORY
  ROOT.** Instructed: *"move plans to plans dir"*. **58 documents**, several over
  1000 lines, moved with `git mv` so the history follows them. A new plan goes
  in `plans/` and nowhere else.
  ⚠️ **129 FILES REFERENCED ONE BY NAME AND EVERY ONE WAS REWRITTEN**, because a
  path in a comment that no longer resolves is this project's most repeated
  defect in its cheapest form. `archive/` was deliberately LEFT ALONE: an
  archive records what was there, the same rule that keeps `box` and
  `radio1965` spelled the old way inside it.
  ⚠️ A plan nobody reads is a plan that gets rewritten by the next person who
  needs it. Reporting it in full when it is fresh is the only moment it is
  cheap.

- 🔴 **FINISHED MEANS DEPLOYED, AND THE REPORT SAYS WHAT TO WATCH AND WHERE.**
  Instructed 2026-09-25: *"deploy. write to claude.md keep doung it and have
  clear status what to waach when somehing is finished with link"*. So the end
  of a piece of work is three things, every time, in this order:

  1. **DEPLOY IT.** `cd workers/view && node build.mjs` then
     `env -u CF_API_TOKEN -u CLOUDFLARE_API_TOKEN node workers/view/deploy.mjs`.
     Do not wait to be asked, do not hold a finished change for a tidier moment,
     and do not report a fix that is only in the working tree as done.
  2. **QUOTE THE BUILD STAMP THE DEPLOY CONFIRMED**, the
     `<sha>-<hhmmss>-<hash>` line it prints, because it is the only way to tell
     a page that shipped from a page that built.
  3. **SAY WHAT TO LOOK AT, AS A URL THAT CAN BE CLICKED**, and say what should
     be different about it. Not *"the stage UI is fixed"*. **`Reload
     https://positron.studio/stage/ and OFF AIR should read STARTING when you
     press Start HLS`**, which is a thing somebody can check in five seconds and
     tell you you are wrong about.

  🔴 **WHY IT IS A RULE: THE BUILD ARTEFACT IS COMMITTED AND THE EDGE IS NOT THE
  WORKING TREE.** `workers/view/public/` is 393 generated files, so a fix in
  `demo/` changes nothing anybody can see until `build.mjs` copies it and
  `deploy.mjs` uploads it. MEASURED 2026-09-25: `/stage/`'s shared room was
  fixed in the tree while `workers/view/public/stage/index.html` still carried
  `stage-demo`, and the owner was looking at the old page while being told the
  bug was gone.
  ⚠️ **AND A STATUS IS NOT A SUMMARY OF WHAT YOU DID.** It is a list of things
  that are now true, each one checkable, with the one URL to check them on. The
  session this was asked in produced *"i do not see ui fixes"* and *"how you
  spent 40min again?"* about work that was real, finished and sitting unbuilt:
  the shared kit had the new footer, overlay and button, and the page had never
  been wired to any of it. **Nothing is done until somebody else can see it.**
  ⚠️ **WHAT WENT WRONG IS WORTH KEEPING: A CAPABILITY IS NOT A CHANGE.** An
  agent that adds `soloFooter` to `video-panel.mjs` has finished ITS job and the
  page still looks identical. If a report hands over an API, the next thing on
  the list is calling it, and it is not finished until the screenshot changes.

- 🔴 **A FINISHED PAGE IS HANDED OVER AS A URL, NOT AS A PATH.**
  `demo/archive/radio/index.html` is not an answer to *"where is it"* — it is the
  answer to *"which file did you edit"*, and the reply to a working demo that
  gives one was **"useless to me"**. Say where to OPEN it:
  **a deployed `https://positron.studio/<slug>/` if it is deployed, otherwise a
  live local URL with every query parameter it needs to work** — and the server
  behind it still RUNNING, not one killed three commands ago. ⚠️ A page that
  needs a local worker as well needs BOTH up and both named, in one line that
  can be clicked: `http://127.0.0.1:8890/archive/radio/?base=http://localhost:8899`.
  If it cannot be reached at all yet, say that in those words and say what is
  missing — an unreachable page reported as done is worse than one reported as
  blocked, because only one of them gets fixed.

  🔴 **AND THE RULE HAS TO SURVIVE BEING RELAYED — THIS IS HOW IT BROKE, TWO
  HOURS AFTER IT WAS WRITTEN, BY ITS OWN AUTHOR.** Neither agent was careless
  about its OWN page: both handed over full URLs for those. Both wrote a bare
  `/radio/` for the OTHER one's, because between two agents a slug is
  unambiguous and it never occurred to either that the message would be read by
  a person who then has nothing to click. The user's reply was *"what it WENT
  OUT? urls! how many times i am asking"*.
  **Resolve every slug to a URL before it leaves, including one you are quoting
  from somebody else.** A relayed path is still a path, and the reader at the
  end of the chain is the one who cannot use it.

- Demos are `demo/<slug>/index.html`, deployed at `/<slug>/`. **A demo's identity
  is its slug and its ORDER is its position in `DEMOS`** — there is no number in
  the directory, the URL, or the page. There used to be, in five places at once,
  and keeping them in step is what made reordering expensive enough to get
  wrong: the 05/28 swap left one page still declaring its old number inside its
  own `mount()`, which only the full sweep caught. Moving a demo is now moving a
  line in the array. **`unlisted: true` hides one from the index and leaves the
  page deployed at its URL; `built: false` takes it out of the deploy.** The
  old front page left a dead card for it; the concepts front page (2026-10-13)
  skips such a row. See the measurement at the top of this file.
- Every demo mounts the shell (`demo/shell/shell.mjs`) and publishes
  `window.__demo` — human-openable and CDP-drivable from the same page. Assert on
  `__demo`, never on DOM ids.

- **A background agent must not commit.** `git add -A` in a shared checkout
  sweeps another agent's in-flight work into an unrelated commit. It happened
  twice in one session: `timeline/score.mjs` and `csound.mjs` — the whole score
  container — landed inside a commit about `loops`, and `04-score/index.html`
  inside one about a plan document. The code was right and the history lied
  about it, which is worse than either being wrong on its own, because a reader
  doing archaeology trusts the message. Repaired with `git notes` rather than a
  rewrite, since one agent still held uncommitted work in a file the rewrite
  would have touched. **Agents report; the session commits.** And when a commit
  must be made while an agent is running, stage the paths by name — never

  🔴 **AND STAGING BY NAME IS NOT ENOUGH WHILE A `git mv` IS STAGED. MEASURED
  TWICE IN TEN MINUTES, 2026-09-19.** `git mv` STAGES the rename as it makes it,
  so the index already holds somebody else's work before you touch it. A peer
  session ran a plain `git commit` of its own file and swept all five paths of
  an in-flight `/held/` to `/weight/` rename into a commit whose message was
  about something else entirely, which is the exact failure this rule exists to
  prevent, arriving from a direction the rule did not cover.
  **The form that is safe is PATH LIMITED, not staged by name:**

```sh
git commit -F msg.txt -- demo/making/index.html      # only these paths, whatever else is in the index
```

  The repair, if it has already happened, is `git reset --soft HEAD~1` and then
  the path-limited commit. ⚠️ **AND CHECK RATHER THAN ASSUME**: `git status`
  showing your own file staged says nothing about what else is in there, and a
  `git mv` leaves renames looking like `R078` rather than like edits.  `git add -A`.
- Secrets never reach a log. The publisher redacts at the point of capture, so a
  secret split across two stderr chunks is still caught.

- 🔴 **NO EM DASHES. ANYWHERE A READER LOOKS.** Not in `what`, not in a
  readout key, not in a diagram note, not in a log line, not in a commit
  message, not in a reply. They are a tic: an em dash lets a sentence bolt a
  second clause on instead of ending, and the bolted clause is almost always
  the vague one. The sentence that prompted this rule was *"It answers HTTP/1.0
  on port 8001 and never over TLS — which is the fact everything to the right of
  it exists to work around"*, and the half after the dash says nothing a reader
  can use. Use a full stop and write the second sentence properly, or a colon
  when the second half really is the first half named. ⚠️ THE TEST IS NOT
  PUNCTUATION, IT IS WHAT THE CLAUSE DOES: if it qualifies, gestures, or
  re-states, cut it; if it carries a fact, it deserves its own sentence.
- 🔴 **AND NO MIDDOTS EITHER, WHICH IS THE SAME RULE ABOUT THE CHARACTER THAT
  REPLACED THE DASH.** Instructed 2026-09-19: *"avoid using middots in ui (can
  be fixed per demo as we go)"*, and pointed at again a minute later on a panel
  footer reading `Apple GPU · locked 59.9 fps`. The em dash sweep moved 418
  joins onto `·` and `shell.mjs`'s own comment called it *"already this
  project's separator"*. That is how a tic survives a rule: it changes costume.
  A middot lets a line bolt a third and a fourth fact on exactly the way a dash
  bolts a second.
  ⚠️ **A ROW OF FACTS IS CELLS, NOT ONE STRING WITH GLUE IN IT.** That is the
  repair almost every time. A footer joining `picture`, `fps` and `locked` with
  `' · '` had three cells and threw them away to make a sentence; the readout
  already knows this and so does `table.mjs`. Stop gluing rather than choosing a
  different glue.
  ⚠️ **AND IT IS PER DEMO, NOT A SWEEP.** MEASURED on the day the rule was
  written: **971** middots across `demo/*/index.html` and `demo/shell/*.mjs`, in
  **45 of 46** pages. A page loses them when that page is being worked on, which
  is what was asked for. The shared ones are different and are decided once:
  the assert formatter, the tally line and `document.title` are all in
  `shell.mjs` and reach every page.

- 🔴 **A CHANGE IN WHAT A PAGE DOES IS A CHANGE TO WHAT IT SAYS — IN THE SAME
  COMMIT.** `what`, the `one` line in `manifest.mjs` and every readout key are
  part of the page, not documentation about it, and they go stale silently:
  nothing type-checks a sentence, no harness reads it, and a description that
  has drifted is worse than a missing one because a visitor believes it. The
  trigger is not "did I rewrite the page" — it is **did a control appear or
  disappear, did a readout cell change, did the thing it is pointed at move, did
  the way you work it change**. Radio1965's paragraph described a Synthesize
  button for two sessions after the button was deleted. ⚠️ AND A CHANGE IS AN
  OCCASION TO CUT: the same paragraph doubled in length over four rounds of
  additions, because each one appended and none subtracted. Re-read the whole
  thing against the rule below, do not staple a clause on the end.
- 🔴 **CARD DESCRIPTIONS MAY BE TWO SHORT SENTENCES SINCE 2026-10-12.** The
  owner's editorial brief that day (before and after rewrites for every group)
  uses two, and supersedes the one sentence rule below for card `say` lines:
  two short sentences within 100 characters, see `positron-describe`. How to
  decide, and how to verify every claim against the page first, is the
  `positron-describe` skill. The rest of the rule below (no colon, semicolon or
  dash buying a clause, no history, no justification) still holds.
- 🔴 **ONE SENTENCE. A DESCRIPTION IS NOT AN ESSAY, AND IT IS NOT A PARAGRAPH
  EITHER.** Instructed 2026-09-19: *"descs are single sentences (do not stretch
  them with : ; -- etc)"*, and asked again in the same stream for page after
  page. **`descs` is the text under the title**: the `what` that
  `demo/shell/shell.mjs` appends as `<p class="pos-what">` directly under the
  `h1`, and the `one` line in `demo/manifest.mjs` that the index shows under a
  demo's name. They are the same string on any page with a diagram, by the rule
  below, so they move together.
  ⚠️ **AND THE SENTENCE MAY NOT BE STRETCHED.** No colon, no semicolon, no dash
  buying a second clause, no *"and"* bolted on to carry a second fact. A
  description that needs punctuation to fit is two descriptions, and the second
  one is the one nobody asked for.
  ⚠️ **THIS RULE SAID THREE SENTENCES UNTIL 2026-09-19, AND BEFORE THAT FOUR.**
  Each cut was asked for, each was broken within a few pages, and the reason is
  the same every time: a description is written while the page is fresh in the
  author's head, when everything about it feels worth saying. `grains` shipped
  FIVE long sentences that explained the granulator, defended why it has its own
  page, described the dice, and finished with what the board does unattended.
  Nobody read it, and the page it described was called *"mambo jumbo"* by the
  person it was written for. A visitor wants to know what this is. What to press
  is the control's own label, and what a number means is the readout key.
  **No history, no justification for a design decision, no account of what it
  used to be.** That belongs in a comment, in LESSONS.md, or in a commit
  message, all of which are read by somebody who asked.

## Writing a skill, or moving a rule into one

A rule earns a place in THIS file only if it is true on every task. Everything
else belongs in a skill, and the skill is named for the WORK rather than for the
code: somebody about to change a control has to recognise `positron-ui` from
what they are about to do.

- 🔴 **MOVE A RULE VERBATIM. DO NOT SUMMARISE IT.** The measurements, the dates,
  the quoted reports and the wrong first answers are the reason a rule survives
  being argued with. A condensed rule reads as an opinion.
- ⚠️ **AND WHEN A RULE MOVES, LEAVE ITS TRIGGER BEHIND**, which is the row in the
  table above. A rule nobody knows to load is a rule that is gone.
