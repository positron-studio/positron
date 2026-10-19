---
name: positron-cast
description: The Väin radio cast, both engines (the cast worker's Caster and container at cast.positron.studio, and LOCAL in the browser on /radio/cast/), the shared planner life.mjs and layers.mjs, the six stations, the owner's sound rules in their own words, cast deploys while a Väin mount is on air, the cast's node tests, and measuring loudness. Load before changing anything under demo/radio/cast/ or workers/cast/, before judging or describing how the cast sounds, and before a cast deploy.
metadata:
  internal: true
---

# The cast

Written 2026-10-19 from `HANDOFF.md` sessions 82 to 84, the `cast:` and
`/radio/cast/` lines in `BACKLOG.md`, `lessons/workers-cast.md` and
`plans/plan-cast-*.md`. Every number below carries the session it was read
from. Constants move daily on this piece: **grep the code before quoting one.**

## 1. Where things are

**One sound, two engines, one planner.**

- **The container engine (on air).** `workers/cast/worker.mjs` holds one
  `Caster` Durable Object per station, each with one container
  (`CAST_INSTANCE = { vcpu: 1, memoryMib: 3072, diskMb: 2048 }` since session
  83; it was 0.5 / 1.5 and the half CPU fell 10 to 34 s behind on radio1965).
  Inside: `container/server.mjs` (routes), `container/live.mjs` (the live
  driver: life and layers on the mix clock, ghosts on a second jack pair,
  `handoff`, `resume`), `container/grains.mjs` (the JACK chain: jackd dummy,
  jack-stdin, scsynth `gring`, jack-stdout, LAME), `container/mixer.mjs` (the
  tuner mix, ported sample by sample from `createTunerGraph`), `decode.mjs`,
  `encode.mjs`. Debian image: node 22, ffmpeg, scsynth 3.13, jackd2, icecast2.
- **The browser engine, LOCAL.** `demo/radio/cast/local.mjs`:
  `createTunerGraph`, the container's drift clock line for line, the ring on
  wasm scsynth. Free, nothing on air. Files come through `GET /file/<id>` on
  the cast worker (allowlist is the feed, edge cached a year), never from
  Väin's host. `workers/cast/local-test.mjs` goes red when LOCAL's numbers
  differ from the container's.
- **Shared by both:** `demo/radio/cast/life.mjs` (the planner: scenes,
  patches, interludes, grammar 2, ghosts as events, seeded) and
  `demo/radio/cast/layers.mjs` (drone, resonators, harmonizer, ghost, freeze,
  pulse: pure numbers above the line, SuperCollider programs below it), plus
  `soften.mjs` and `crossfade.mjs`. The container runs them unchanged from
  `workers/cast/container/sc/` at their `demo/` paths: the list is
  `workers/cast/sc-files.mjs` (`SC_FILES`), `node workers/cast/deploy.mjs`
  copies them in, and `grains-test.mjs` goes red when a copy differs. So a
  change to `life.mjs` changes LOCAL at once and the stations only after a
  cast deploy.
- **The page:** `demo/radio/cast/index.html`. Deployed at
  https://positron.studio/radio/cast/ (`?key=<CAST_KEY>` once, then plain; no
  start or stop buttons without the key). Local at
  http://127.0.0.1:8890/radio/cast/ from `node demo/server.mjs`, which is the
  working tree and is where the owner listens to LOCAL.
- **Stations:** `preview` (our own Icecast 2.4.4 inside its container, heard at
  https://cast.positron.studio/listen/preview while on air, 503 otherwise),
  and the Väin mounts `radio1965` (ours by Raul's permission, never records)
  and `user1` to `user4`, all on `live.uuu.ee:8001`. Status of any:
  `curl https://cast.positron.studio/status/<station>`.
- **Cost:** about **$1.33 a day per station on air**, about $0.055 an hour,
  $9.34 a week, half of it memory forced by the 3 GiB per vCPU floor
  (`plans/plan-cast-cheaper.md`, session 84). The cheaper paths (pre-render
  plus a `lite` playout, $0.6 to $7 a week) are planned, not built.
- **The cap:** every start stops **7 days** on, one constant `CAP_MS` on every
  station (was 2 h until 2026-10-19). `node workers/cast/extend.mjs <station>
  <hours>` moves an on-air stop (15 min to 14 days, `CAP_MAX`); it reads
  `CAST_KEY` from `.env`. The page has no extend.
- **Playlist on air** (`Caster.freshTick`, `lessons/workers-cast.md#fresh`):
  the feed every 30 s, new files play next newest first, gone files leave the
  queue and the program, a quiet hour brings a recent arrival round. LOCAL
  does not read the feed while it plays (asked, not built).
- **Stories:** `lessons/workers-cast.md` has a heading per decision (`#cap`,
  `#level`, `#local`, `#live-container`, `#refresh-on-deploy`, `#handover`,
  `#grammar-2`, `#soft-files`, `#fresh`, ...). The plans:
  `plan-cast-patches-scenes.md` (grammar 2), `plan-cast-variety.md` (what
  repeats, effect ideas, bass), `plan-cast-cheaper.md`,
  `plan-cast-reinterpret.md` (the layers), `plan-cast-listenable.md` (the
  commute listen, below).

## 2. The owner's sound rules

Each in the owner's words and the date. Some later rules replace earlier ones; the
replaced ones are kept so nobody re-adds what was taken out.

- **No naked speech** (2026-10-18): *"I am sating i do jot want naked speech"*,
  *"Too much of it in prev versions"*. A tuner bypass was built and removed
  unshipped. ⚠️ The listenable plan proposes short dry references (below),
  which is the owner's call.
- **Speech as an instrument** (2026-10-18): *"faint drone and som much speeach.
  i asked to use speech as instrument"*.
- **A dynamic piece** (2026-10-18): *"it's okay to listen by try signal for a
  while to identify original, but then I really want to go to into with Strony
  stuff and granular stuff"*. Then *"use full wet dry range for composition but
  minimal time in dry"* and *"prefer more wetter"* (2026-10-19).
- **No duck voices** (2026-10-19): *"duck voices...not good, not respectful for
  authors"*. `MAX_PITCH` 1 (was 1.5), every harmonizer voicing under the voice.
  Earlier: *"choir like..then stupid bunch of ducks"* (votes, 2026-10-18).
- **No Darth Vader voices either** (2026-10-19, the commute listen): *"duck or
  Darth Vader voices, which are insulting for the audience and the
  participants"*. The rule is about transposing people, not about up.
- **No high pitch** (2026-10-18): *"this high drone was annonying"*, *"annoying
  hipitch"*.
- **No stutter** (2026-10-19): *"stuttering is not nice"*, *"no stutter"*, *"esp
  with ekkes drony stuff"*. No rhythmic or glitch families, no rhythm scenes,
  no pulse. Closed: *"not hearitng , stuter is fine"*.
- **Not metallic** (2026-10-19, three complaints): *"very mettallic"*,
  *"metallicness"*. No resonators at all in grammar 2; harmonizer smeared and
  low-passed.
- **Not muddy** (2026-10-19): *"sounds are now muddy (drone?)"*. Grains under
  pitch 0.75 only in deep, breath and coda scenes; elsewhere tone at least
  1.8 kHz, dark at least 1.2 kHz.
- **The mix as the slider at 0.4** (2026-10-19): *"on 0.4 its more toreable"*.
  `WET_CAP` 0.8, `LAYER_SCALE` 0.8. And at the wet end *"biit overwhelming
  here"*, *"again too much"*: a push lifts the layers toward 0.75 with no boost.
- **Drones are a trick** (2026-10-18 and 19): *"drones are fine but should be
  only trcik"*, *"rising and falling is cool but getting repeating"*, *"drone too
  lound, overwhelms a bit"*, *"tiring drone"*. Drones in 30 % of sections,
  3 dB down (`DRONE_TRIM`), half following the scene level. Pitch moves glide
  (*"want so head changing tone/frequ on drone over time"*).
- **Effects carry, then breathe out** (2026-10-19): *"when i push next scene and
  it staets shimmering do you drop fx?"*. Floor `CARRY` 0.2; 0.45 was tiring.
- **No silence, no fading volume** (2026-10-18): *"fade out and in volume:
  better not"*, *"audio sopped again"*, and *"sound cuts off when files
  change"*. Every bridge cross-fades; `pause` is out of grammar 2.
- **No clipping** (2026-10-19): *"too loud, clips"*. Room limited at 0.4 (0.25
  while a ghost visits), the ghost at 0.3, LOCAL has a limiter last. Limits
  belong in SuperCollider: the jack-stdout tap is s16, a clip cannot be undone
  in node.
- **Ghosts** (2026-10-18 and 19): *"ghsot voices a bit lame"*, *"can not hear
  ghost"*, *"key conflict"*, *"does ghosts tart from beginning. maybe in
  middle?"*, *"ghost can stay bit longer. they seems too sudden"*, *"they come
  and go too harsly"*. Own path past the room (the room ducks), no fourth,
  band-pass colour only, start in the middle half of the visiting file, stay
  16 to 30 s, S curve fades of about 7 s; longer files get more visits.
- **Transitions** (2026-10-18): *"channel changig still too winds noise,
  cartoonish"*. The dial's hiss is rare; dissolve, filter and bridges instead.
- **Clicky files** (2026-10-18): *"current kalle is uninspiring and glitchy"*.
  Kalle, Kalle 2, Driving along play only drone, choir and spectral patches
  (`soft`).
- **Test recordings** (2026-10-19): *"test recordings are fine, let the team
  handle it"*, then the same day *"downplay tests"* (short visits). The second
  stands.

### The commute listen, 2026-10-19, verbatim from BACKLOG

> **cast: boring and unengaging on a real listen; quiet next to any podcast;
> Darth Vader voices** (2026-10-19). Owner listened to preview for about 20 min
> while commuting, no noise cancelling: *"really, really boring and
> unengaging"*; mostly *"home recordings, milieu recordings, test
> recordings"*; *"I almost couldn't hear of a effect part, just some echoes,
> repetitions, which got repetitive very fast"*; tape loops and concerts
> interesting *"because of original material"* with effects hard to spot; *"I
> couldn't distinguish what the dry signal really was"*; *"duck or Darth Vader
> voices, which are insulting for the audience and the participants"*;
> *"compared it to any podcast in the same environment ... really easy to
> listen in. So maybe a volume thing or compression thing"*; *"in this kind of
> everyday environment, it was really pointless to listen to"*. Asked: *"what
> we're gonna do about it?"*.

🔴 **THE LESSON: TWO DAYS OF ONE-COMPLAINT FIXES ON LOCAL AT A DESK MADE THE
MIX TIMID AND QUIET.** Every fix above made something quieter or rarer
(`WET_CAP`, `LAYER_SCALE`, `CARRY`, `DRONE_TRIM`, no resonators, no rhythm,
ghosts under the bed), each right for the complaint in front of it and judged
with good monitoring in a quiet room. The sum was a mix where nothing is ever
clearly on, files levelled to -23 LUFS (`workers/cast/gains.mjs` `TARGET`)
with no leveller on the sum, so on a train only the echoes survived.

- **Judge in the condition it is for**: a phone, ambient noise, 20 minutes,
  not a headphone A/B at the desk.
- **Loudness at podcast level**: -16 LUFS integrated, measured (section 5),
  not inferred from constants.
- Before tuning one more complaint down, ask what it does to the whole.

**WHAT `plans/plan-cast-listenable.md` LANDED (2026-10-19)**, asked *"do all
and measure. downplay tests for how. new upcoming files shoul be preferred"*:
- **A master on the sum, both engines** (`demo/radio/cast/master.mjs`): a slow
  leveller (6 s mean square, gain up to 16x towards `TARGET` 0.16 RMS of the mono
  sum), a soft-knee squeeze over 0.15 s (`KNEE` 0.28), a peak limit at 0.85.
  MEASURED on preview, 10 min each: before -28.6 LUFS, LRA 16.1 LU, peak -9.1
  dBFS; with GMAX 5 -20.5 LUFS and LRA unchanged; with 16x **-15.1 LUFS, LRA
  5.2 LU, peak -1.8 dBFS**. The
  container's ring, the room and the ghost write `MASTER_BUS` 12 and `lmaster`
  (node 4100, after the ring; the room is added before it) writes the output.
  LOCAL runs the same arithmetic as the `cast-master` worklet before its
  compressor limiter. Files are still levelled to -23 LUFS before the tuner, for
  headroom inside the graph; the master brings the sum up.
- **No person's recording at any pitch but its own**: grammar 2 plays a patch
  pitched under 1 at 1 (`d.set.pitch`), never one over `MAX_PITCH` 1 or with a
  tape drop over `MAX_DROP` 0.06; `GHOST_SHIFTS [1]`; `lfreeze` no longer shifts;
  the harmonizer only on `music` files; no `tapestop` interlude (`NOT_OUTS`).
- **No echo repeats**: `ECHOEY` patches out, echo capped at `ECHO_CAP` 0.35 and
  never moved by the hand, no `echowash`. So the hand's controls are fewer and
  grammar 2 holds them `FRESH2` 3 movements apart.
- **Contrast**: every scene opens dry for `DRY_S` 8 to 20 s (at most 40 %), then
  at most ONE of drone, harmonizer and ghost over the granulator (the section's
  drone wins); `WET_CAP` 0.95.
- **Visits by kind**: `KIND_DWELL` music 1.6x, field and speech 0.7x; a test
  recording (`isTest`, the title says test) `TEST_DWELL` 25 s. New arrivals
  still play first (`Caster.freshTick`).

## 3. Deploying the cast

- **Deploy:** `node workers/cast/deploy.mjs` (unsets the API tokens itself,
  needs wrangler 4.148 from `rig/containers-next`, copies `SC_FILES` into the
  image). The site is a separate deploy (`workers/view`), and a page change
  in `index.html` or `local.mjs` needs that one, not this one.
- 🔴 **A CAST DEPLOY WHILE A VÄIN MOUNT (radio1965, user1..4) IS ON AIR STOPS
  EVERY LISTENER. ASK FIRST.** Their Icecast takes one source; at the handover
  the old one leaves, connections end and no player reconnects. Session 83:
  *"not good, v2in team is lisening. stoppen again"*. Batch fixes; deploy when
  nothing is on Väin's mounts or when the owner says so.
- **A Caster takes new code 4 to 7 minutes later.** The Durable Object keeps
  old code for about 4 to 6 minutes, then the handover waits about 25 s of
  dwell. Two starts 22 s and 56 s after the 7 day deploy still got 2 h; one at
  6 min got 7.000 days. Check a change minutes after, not at once.
- **Refresh on deploy:** a station on air restarts onto the new code by itself
  (`lessons/workers-cast.md#refresh-on-deploy`), through a gapless handover to
  a twin Caster `<station>~b` (aligned 1 to 5 ms on Cloudflare, Väin's mount
  taken in 106 to 300 ms, `#handover`). Nothing that was off is started.
  `sameScene: false` after a deploy that changed `life.mjs` is expected.
  Whether `/listen/preview` survives a handover was not checked (cracks heard).
- 🔴 **THE OWNER STARTS CASTS.** *"Stop defaul casting let me do it"*, *"You
  were wasting my money with ghost stations"* (session 82). An agent stops
  anything it started; before handing over, read all six:

```sh
for s in preview radio1965 user1 user2 user3 user4; do curl -s https://cast.positron.studio/status/$s | head -c 200; echo; done
```

  Each should read `playing:false` unless the owner started it.
- **A stopped command may have run.** Twice a commit or an edit landed before
  the stop (session 84). Read `git log` and grep the file before redoing it.
- **A deploy is asked for in words.** The owner listens on LOCAL first; the
  stations take a deploy (memory: deploy at coherent points, not per change).

## 4. Tests

All node, no browser, no network, run from the repo root. Last counts and the
session they were read in:

| file | covers | last |
| --- | --- | --- |
| `demo/radio/cast/life-test.mjs` | the planner: no repeats, no control reused, one movement per scene, votes, grammar 2 rules, mostly negative controls; `life-g1.json` keeps grammar 1 bit for bit | 101/101 (84) |
| `demo/radio/cast/layers-test.mjs` | chords, drone, harmonizer ratios, pulse, ghost gaps; `--browser` runs Chrome (browser rule applies) | 16/16 (84), `--browser` 20/20 (83) |
| `workers/cast/live-test.mjs` | the live driver's pure parts; `--browser` and `--live` need Chrome or the grains image | 27/27 (84) |
| `workers/cast/local-test.mjs` | LOCAL holds the container's numbers, 8 negative controls | 26/26 (84) |
| `workers/cast/fresh-test.mjs` | `Caster.freshTick` on a fake feed and clock; oldest first turns three red | 10/10 (84) |
| `workers/cast/mixer-test.mjs` | the mix mode against the page's `createTunerGraph` on a fake AudioContext, 16 negative controls | 54/54 (83) |
| `workers/cast/grains-test.mjs` | stage 2's pure parts and that `container/sc/` copies match `demo/`; `--live` in the grains image | 25/25 (83) |
| `workers/cast/handover-test.mjs` | the handover to a twin against fake containers, read frame by frame | 29/29 (83) |
| `workers/cast/mp3-test.mjs` | the MP3 framer against ffprobe | 10/10 (80) |
| `workers/cast/handover-docker.mjs` | the real Caster on real containers (Docker or OrbStack), graded against a destroy and restart | not counted |
| page selfcheck | `/radio/cast/` with `?selfcheck=1`, through `demo/verify.mjs` (Chrome) | 36/36 (84) |

## 5. Measuring loudness

- **Per file, the archive:** `node workers/cast/measure-gains.mjs [--all]`
  fetches each new feed file ONCE through our edge (`/file/<id>`, never their
  host), measures it with ffmpeg `ebur128` as the tuner hears it (mono,
  `0.5*FL+0.5*FR`), tags it speech, field or music (`kind.mjs`) and rewrites
  `workers/cast/gains.mjs`. Do not hand edit `gains.mjs` except `soften`.
  The gain is clamped to `GAIN_DB` [-14, 12], so the 15 s clip tests stay at
  -26 and -32 LUFS.
- **The output, what a listener hears:** only while `preview` is on air (the
  owner starts it), record https://cast.positron.studio/listen/preview and run
  ebur128 on the recording:

```sh
ffmpeg -nostdin -t 600 -i https://cast.positron.studio/listen/preview -c copy rec.mp3
ffmpeg -nostdin -hide_banner -nostats -i rec.mp3 -af ebur128=peak=true -f null - 2>&1 | sed -n '/Summary:/,$p'
```

  Read `I:` (integrated LUFS, target -16), `LRA:` (under 8 LU in the
  listenable plan) and `True peak:` (under -1 dBFS). Ten minutes before and
  after a change is the measurement the plan asks for.
- Measure on preview, never by connecting to a Väin mount: a connection there
  is a listener in somebody else's statistics (CLAUDE.md, external sources).
- The quiet stretches measured on 2026-10-18 read -51 to -57 dB; a loudness
  number without the low end of its range hides them, so quote LRA too.
