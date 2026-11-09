# plan-v2in-for-positron: what v2in built and decided, and what positron takes from it

Status (2026-11-09): a plan, nothing built or changed in either repository. Read from `~/personal/v2in` at `eaadb58`
(its `CLAUDE.md`, `HANDOFF.md`, 21 plans and 2 research files, about 6,500 lines) and positron at `feb0209a`. READ
marks a fact from a file, MEASURED a number v2in measured (where is named), INFERRED one reasoned here and not tried.
Nothing was run against v2in.stream, live.uuu.ee or any mount.

Asked 2026-11-09: *"read up on the plans and work i do in ../v2in and make summary plan for positron context"*.

## In short

1. **v2in is positron's radio work grown into a product somebody else runs.** Split off 2026-11-03, private
   (`kristjanjansen/v2in`), on air at https://v2in.stream/ since 2026-11-05 on one Virtuaal VPS in Tallinn: Icecast,
   Liquidsoap, nginx, MediaMTX and a node conductor in two containers. Channels radio1965, kcmd, kcmd-test, live,
   community (4 live slots, mixed), go silent in a Kyiv air raid and play one ALL CLEAR piece after. To be handed to
   people who do not code.
2. **It tried positron's Cloudflare stack first and chose a server** (2026-11-04), then on 2026-11-08 wrote a plan to
   go back to Cloudflare in stages around edgecast. Neither direction is settled: the VPS carries the radio, the
   Cloudflare plan is a plan, a Hetzner move is planned for the first week of December after hcmf//.
3. **v2in took from positron** edgecast-relay's Icecast source, silent frames, listeners.mjs, measure-gains, shout,
   the light cast engine (now called **Waves**, wasm scsynth in node) and the loop research (Eno, Reich, Basinski,
   computed position). **positron has taken nothing back yet** except the two archived Cloudflare builds and their
   lessons (`archive/v2in-cloudflare/README.md`).
4. **What positron should take back, in order of value:** the Icecast hold that keeps listeners through a source
   restart (it answers positron's own "a cast deploy stops every Väin listener"), the Durable Object deploy reset as a
   written lesson, MEM as a concept page, `from` (a channel made of channels) as a patchbay idea, the relay protocol's
   room-wide `seq` and resume, and a dozen smaller measured facts (section 4).
5. **Three positron BACKLOG items change meaning** because the VÄIN app is moving onto v2in: the edgecast into
   radio1965 on live.uuu.ee, the Väin listener count, and the cast deploy rule (section 5).

## 1. What v2in is today (READ, v2in `CLAUDE.md`, `HANDOFF.md`)

| part | state on 2026-11-09 |
| --- | --- |
| channels | `server/config/channels.json`, flat settings: `live` (0 to 8 slots), `mix`, `from`, `engine`, `preset`, `playlist`, `raid`, `record`, `session`, `cooldown`, `video`, `hidden`. Fixed order: raid, live or the mix, engine, from, playlist. Rules pure and tested in `core/` |
| raids | alerts.in.ua; yellow (drone) as well as red (missile) since 2026-11-06, KCMD's word; a raid survives a restart and is not notified twice |
| going live | OBS by RTMP or WHIP, BUTT and the VÄIN app by Icecast source, a browser on `/live` by WebSocket; stream keys, guest keys with 3 min sessions and 3 min cooldown on `community` |
| the mix | `community` sums whoever is live, 1/sqrt(n), a limiter at -3 dB; each broadcaster sets their own level, the server levels nothing |
| engines | **Waves** (positron's light cast chain over radio1965's files) and **MEM** (a looping engine for hcmf//, below), each on a switch |
| video | MediaMTX remuxes each show's video to HLS, always muted, the Icecast stream is the one sound; built and measured on the laptop, not deployed |
| notifications | Web Push (VAPID) and, since 2026-11-09, Firebase HTTP v1 to the VÄIN app's topic `v2in_notification` by fetch and WebCrypto, no firebase-admin. Validate-only send accepted, not yet seen on a phone |
| the VÄIN app | [#1 v2in: channels and now playing from v2in.stream, its notifications, and reconnecting](https://github.com/tarmoj/radio1965/pull/1) and [#3 v2in: broadcasting with the app's login, destinations and pools from v2in, recordings off eccm.ee](https://github.com/tarmoj/radio1965/pull/3) open; [#2](https://github.com/tarmoj/radio1965/pull/2) closed after Tarmo's review. A temporary adapter (`server/conductor/uuu.mjs`) lets VÄIN logins go live on v2in |
| deploys | every push to main tests and deploys (`.github/workflows/v2in.yml`), restarting only what changed; first automatic run failed in the organisation move, which was rolled back the same hour |

## 2. The two directions, and where each stands

**Server (what runs).** Chosen 2026-11-04 because the Workers build (B) rebuilt in JavaScript what Liquidsoap already
does. Virtuaal C-S, 15.29 EUR a month, 5 TB. `plan-hetzner.md`: a Hetzner CX23 in Helsinki, 5.99 EUR before VAT,
20 TB, blocked while the CX23 cannot be ordered, the week of 1 December.

**Cloudflare (`plan-cloudflare.md`, 2026-11-08, a plan).** One Durable Object per channel doing Liquidsoap's job with
edgecast's wasm pieces, WHIP only into positron-sfu, no RTMP and no BUTT, MP3 over HTTP to listeners (Workers egress is
free). Two Containers stay: MEM (does not fit 128 MB) and HLS for the app's video (Cloudflare makes no HLS of a WHIP
input). About 36 to 54 USD a month before listeners against 15.29 EUR. The VÄIN app cannot keep sending Icecast
(Cloudflare holds a PUT body until it ends, MEASURED 2026-11-04); the smallest change is MP3 over a WebSocket.

**For positron this matters because** the Cloudflare plan is edgecast carrying a real always-on station with
listeners, the thing edgecast has never done (25 minutes at 7.8 % of a core, 0 breaks, never a show). If v2in goes that
way, positron's `workers/edgecast` and `workers/sfu` become somebody's production, and every deploy of them a risk to a
broadcast (section 6).

The companion research (`research/cloudflare-media-2026-11-08.md`) found nobody running a live radio on Cloudflare in
public, and read Cloudflare's terms (2026-09-28) as forbidding Icecast behind a proxied record while allowing MP3 made
by a Worker or segments in R2.

## 3. What v2in took from positron (READ, v2in `plans/plan-v2in.md` "Reuse")

Copied flat with a header naming the source, as eccm did:

- `workers/edgecast-relay` `icecast.mjs`, `relay-core.mjs` (paced Icecast source, silence, reconnect)
- silent MP3 frames (the relay, or eccm's `station.mjs` at `radio-last`)
- `workers/cast/listeners.mjs` and `workers/stats` (Icecast 2.4.4's broken status JSON)
- `workers/cast/measure-gains.mjs` (ebur128), not `program.mjs` (its 40 s minimum drops a 15 s ALL CLEAR)
- `workers/shout` (https, CORS, ICY, one upstream per channel)
- the light cast chain at `c316c417`: `wasm-scsynth.mjs`, `sclang-lite.mjs`, `encode.mjs`, now `server/engines/waves/`
- for MEM: `plans/plan-ambient-piece.md` §1, `proto/loops/NOTES.md` (rate drift is `(rate - 1) x elapsed`; position
  computed, never accumulated, 0 ms over 600 wraps), the `repeat: 12` disintegration demo

So a fix in any of these in positron does not reach v2in, and the reverse. INFERRED: worth a line in each copied file's
positron original saying a copy lives in v2in, so a bug found here is checked there.

## 4. What positron takes back

### 4.1 Lessons, measured in v2in, not yet written anywhere in positron

None of these is in `.claude/skills/`, `lessons/` or `LESSONS.md` (grep, 2026-11-09). They go to
`lessons/v2in.md` verbatim with a pointer from `positron-streaming`, by the comment rule.

| lesson | where v2in measured it |
| --- | --- |
| A busy Durable Object keeps its old code 300 s after a deploy, then resets; the listener stays connected on digital silence, which byte counts cannot see and silencedetect can. A deferred update with `max_delay` 86400, set through the API (wrangler 4.107 cannot), held a show through a deploy | 2026-11-04, `archive/v2in-cloudflare/README.md` (in positron, never lifted into the skill) |
| **Icecast's `<fallback-mount>` with `<fallback-override>` to a per-mount hold of real-time silence keeps listeners connected while the source restarts, and moves them back when it returns.** `server/icecast/hold.mjs`, learned from Icecast's own status, needs no knowledge of channels | `plans/plan-deploys.md`, built and deployed 2026-11-08 |
| A mount on its hold still gives bytes, so a health check must also ask whether Icecast lists the source | `plans/plan-deploys.md` |
| Liquidsoap 2.4.5 `compress` with lookahead gave silence | `plans/plan-mixer.md` |
| Liquidsoap started two clocks racing for port 8005; the first deploy failed its health check and rolled back | `plans/plan-deploys.md` |
| OBS 32 on the M1: RTMP clean and reconnecting; WHIP faster to start but weak under loss and jitter | `plans/plan-video.md`, 2026-11-08 |
| iPhone Smart Punctuation turns a token's hyphens into look-alike dashes (mangled as Latin-1 in a header): compare letters and digits only | commits `8c8e81e`, `a5a7c71` |
| alerts.in.ua's v2 IoT answer gave Y for Kyiv's real alerts, never R | `HANDOFF.md` 2026-11-06 |
| Distinct listeners per minute as address plus User-Agent pairs, so a phone's two connections count once; never who | v2in `CLAUDE.md` "listeners" |
| Firebase HTTP v1 needs no SDK: a service account, a JWT signed with WebCrypto, one fetch | `server/conductor/push.mjs` `fcmSend` |
| positron's HLS station served every segment through the Worker with no Cache API, so the edge cached nothing; an R2 custom domain would have. As built about 21 USD a month at 100 listeners on one channel, almost all avoidable | `research/cloudflare-media-2026-11-08.md` §5.6 (INFERRED from code, never measured) |
| MEM's node process peaks at 207 to 213 MiB RSS, so a loop engine of that shape does not fit a 128 MB isolate | `plans/plan-huddersfield.md` |

### 4.2 Things worth building in positron

Proposals, ranked; the owner picks. Each is a concept page or a kit change, by `positron-concepts`.

1. **MEM as a concept page** (INFERRED one to two days). The engine is positron's own loop research turned into a
   piece: a live ring of the last 5 minutes, takes of 2 to 40 s at onsets, 4 to 8 mono players looping at lengths with
   no short common multiple, each a small speaker placed in a stereo room (equal power pan, up to 0.6 ms interaural
   delay, head shadow, distance as level, air and reverb), moods that change density, talk weighted down by a voiced
   band syllable measure. In a browser the 128 MB limit does not apply. Ports: audio-in (a stream, a file, the mic),
   audio-out, a preset value. A seed makes it reproducible, which `positron-verify` can assert on. Copy back with a
   header from v2in `server/engines/mem/` rather than rewrite.
2. **`from`: a channel made of other channels**, as a patchbay idea (INFERRED half a day as a page). It is exactly a
   link with several sources summed into one input, with no loops and inputs built first. A small page that shows two
   sources, one sum, one effect on the sum, and the separate listening of each, explains the patch better than prose.
3. **The Icecast hold for positron's own Icecast legs** (INFERRED half a day). `workers/edgecast-relay` already holds a
   mount across a station restart by sending silence; v2in's hold does it on the Icecast side, so any source may die.
   Where positron runs its own Icecast (the cast container's preview, `demo/fake-station.mjs`) the same
   `fallback-override` makes a deploy a moment of silence instead of a dropped listener. A stand-in to sabotage first.
4. **The relay protocol of `plan-relay.md`, back into `workers/relay` and `workers/store`** (INFERRED two days). It
   is positron's own `plan-ws.md` wish answered: a room-wide `seq` minted by the one writer, an `epoch` that changes
   when the log is lost, `store: "latest"` per `key`, and a join that sends latest, then history after `since`, then
   live, with no gap. positron's relay cannot mint a `seq` because it never parses; `workers/store` already parses and
   could. Decide whether the store becomes the writer of record or stays a recorder.
5. **A Jamulus room as a v2in channel, with a positron card** (already recommended in
   `research/jamulus-sonobus-2026-11-06.md` §6, not started). v2in now has the pieces it named: the mix and `from`.
6. **The recovered HLS station, cached properly** (only if a station comes back): segments from an R2 custom domain,
   the playlist alone through the Worker.

### 4.3 Things v2in decided that positron should not copy

- Liquidsoap and a VPS: right for a handed-over radio, wrong for positron, which is R&D on Cloudflare.
- Server-side video composing: measured and dropped by the owner on 2026-11-08 (480p30 ultrafast fit one vCPU for four).
- BUTT: v2in's Cloudflare plan drops it; positron never had it.

## 5. positron BACKLOG items this changes

- **edgecast into Väin's radio1965** (BACKLOG, 2026-10-20; steps 1, 2 and 4 done, 3, 5, 6 open). Its target is
  live.uuu.ee:8001. With [#3](https://github.com/tarmoj/radio1965/pull/3) the VÄIN app broadcasts to and plays from
  v2in.stream, so the mount to feed may become v2in's Icecast (port 8005, a stream key as the password), whose hold
  already covers a station restart. Question for the owner: retarget, or close.
- **Listener count for the Väin cast on the uuu server** (BACKLOG, 2026-10-22). v2in answers *"or v2in has it?"* for
  its own channels: `listeners(channel, minute, count)` in the gate's SQLite, `GET /api/stats`, `listeners` in
  `/api/now`. For uuu's server the question stands. Question: close in favour of v2in's, or keep for uuu.
- **No cast deploy while a Väin mount is on air** (HANDOFF and memory). Still true for live.uuu.ee. If the cast sends
  to v2in's Icecast instead, the hold turns a deploy into a moment of "One moment" silence, and the rule can relax.
  Not before it is measured there.

## 6. Boundaries

- **v2in's code stays in v2in.** Copy back with a header, as v2in copied from here; no shared module across the two
  repositories, since v2in deploys on every push and a positron change must not reach its listeners.
- **If v2in adopts edgecast on Cloudflare** (section 2), positron's `workers/edgecast`, `workers/sfu` and
  `workers/edgecast-relay` deploys need the same care as the cast deploy rule: a deferred update, a check of who is on
  air, and the owner's word. Better: v2in gets its own copies on its own account, which `plan-cloudflare.md` leaves
  open.
- **No harness, probe or `curl` against v2in.stream's mounts.** It has real listeners and counts them; the rule about
  somebody else's server applies to the owner's own radio once others listen to it.

## 7. What could not be settled from the files

- Whether the Firebase send reaches a phone, and whether the first automatic deploy succeeds: not read back.
- Whether v2in goes to Cloudflare at all: the owner leaned that way on 2026-11-08, the server is what runs.
- MEM on the server under the festival's real feed: rendered offline and 15 minutes on the laptop only.
- Whether `plan-relay.md` is built in v2in first (node) or here first (Durable Objects); it is a plan in both senses.

## 8. A live AM installation with MEM, in positron (added 2026-11-09)

Asked 2026-11-09: *"Look also out for am uk scanning. Can we do live am insllation / mem in positron?"*.

**Yes, and most of it already exists in one of the two repositories.** INFERRED three to four days for the first
two steps below; nothing tried.

### What is already there (READ)

- **The UK scan, done 2026-11-07 in v2in:** 36 recordings from two public KiwiSDRs, Manchester M7GMG
  (`radio.satelliteboy.com:8073`) and Southport. LW 198, MW by day (1053, 1107, 1368) and at night (981, 1035, 1080),
  MW late (558, 648, 882, 1044, 1368), LF time signals (DCF77 77.5, 129.1, 147.3), shortwave 41 m and 49 m, 5 and 10
  MHz. FLAC with a sidecar each (title, receiver, kHz, UTC, the Kiwi URL), spectrogram PNGs, 211 MB, in
  `~/personal/v2in/server/media/huddersfield` (git-ignored). Recorded with `kiwirecorder.py` and finished by
  `tmp/finish.sh` (FLAC, sidecar, spectrogram, loudness).
- **A live Kiwi as a source:** v2in `tools/huddersfield.mjs` `kiwi:<host>[:port]/<kHz>`, AM with a 9.4 kHz passband,
  redialled after 10 s when the Kiwi's time limit drops it, silence in between.
- **MEM:** `server/engines/mem/mem.mjs`, 50 KB, `Mem`, `Ring`, `PRESETS`, seeded `rng`, `speechOf`, tested by
  `mem-test.mjs`. Its only outside pieces are `sclang-lite.mjs` and the cast's `master.mjs`, both positron's
  own code copied into Waves, and one `readFileSync` for `presets.json`. The same seed gives the same MP3.
- **In positron:** `demo/shell/scsynth.mjs` (SuperSonic's wasm scsynth in a tab, shared by every page),
  `looper.mjs`, `rt-grains.mjs`; **/radio/tuner/** (one dial over four live stations as an AM set, noise and a
  whistle between); **/ambient/drone/** (a radio input by getUserMedia with a device picker, opened on a press,
  waiting for a real radio since 2026-11-02).

### The page: MEM in the browser

A concept page (`positron-concepts`), slug for example `/radio/mem/`, as a patch:

```
source (one of three, below) --audio--> MEM (ring 5 min, takes, 4 to 8 players, room) --audio--> speakers
                                         ^ preset (drift, dense, sparse, far)   ^ seed
```

- `mem.mjs` is copied with a header, presets imported as JSON, its scsynth half pointed at `scsynth.mjs` instead of
  node's wasm runner. The 128 MB isolate limit does not apply in a tab; the ring is 53 MB of 16-bit stereo, which a
  phone may refuse (TO MEASURE on the iPhone mini, a shorter ring there).
- Each visitor gets their own MEM, so each hears a different piece; with the seed taken from the wall clock's hour
  and the source fixed, everyone hears the same one. Either is an installation; the owner picks.
- The status line MEM already prints (takes held, players, their lengths, places) is the readout and `__demo`.
  `positron-verify` asserts on a fixed seed against a fixed file, no sound on this machine (`showspectrumpic` and
  `ebur128` as v2in does).

### Three sources, cheapest first

1. **The recordings, from R2** (no external server touched by a visit). The 36 FLACs as MP3 in
   `positron-station/am-uk/` with their sidecars; the page plays them as a scan: a needle moves across a dial, a
   station's recording comes in through the tuner's noise and whistle (/radio/tuner/'s graph), and that is MEM's
   input. INFERRED one day plus MEM's port. **Open question:** 5 Live and talkSPORT are BBC and commercial
   broadcasts; v2in kept them on a hidden channel. Public on positron, or an unlisted page, or only the time signals,
   shortwave noise and night band without clear programme?
2. **A live scanner, one shared connection** (INFERRED two days). One Durable Object holds ONE Kiwi socket while
   anybody listens, sweeps a list (MW 531 to 1602 kHz in 9 kHz steps, or the stations above) with a dwell per
   frequency by `SET mod=am freq=...` on the same socket, decodes the Kiwi's audio frames and fans them out to every
   listener, as `workers/shout`'s `Mount` tees an Icecast. `SET ident_user=positron.studio`, a time cap, closed when
   the last listener leaves.
   - **Every public Kiwi is a volunteer's receiver with a handful of slots** (often 4 to 8, a time limit per
     listener). This is the ERR rule exactly: whose server it is. One connection for all positron listeners, opened
     only when a person listens, never by a harness (a stand-in Kiwi first, as `fake-station.mjs`), and asking the
     operator before it is listed anywhere. The owner's *"super careful with external sources, better avoid"*
     stands until the owner says otherwise.
   - TO CHECK before building: the Kiwis answer on plain `http`/`ws` on port 8073, so a page on https cannot dial
     them (mixed content); the Worker must, and whether a Worker's fetch with `Upgrade: websocket` reaches port 8073
     on an outside host is not known here. Kiwi's audio frame format (ADPCM or raw 12 kHz) is read from
     kiwiclient, not from a document.
3. **A real radio of our own** (no external server at all). An AM receiver into an audio interface: on this desk
   into /ambient/drone/'s input today, or into the Pi at site `pi-1` as a remote node (`positron-hardware`), so the
   installation runs at the second site and the page listens to it. UK AM in Estonia is INFERRED weak even at night;
   what that radio hears is the Baltic and Nordic band, a different piece. An RTL-SDR with an upconverter would make
   the Pi a scanner of its own; not on hand as far as these files say.

### Live and continuous

A page runs MEM only while it is open. An installation that plays with nobody watching is a station: v2in's `mem`
channel already is that (the stand-in festival into MEM on the server), and edgecast cannot hold MEM (207 to 213 MiB,
section 4.1). So positron's part is the page and the patch; the always-on piece is v2in's channel or a cast container.

### Questions for the owner

1. Which source first: the recordings (1), the live scanner on a volunteer's Kiwi (2), or a real radio (3)?
2. May positron open a public KiwiSDR at all, given the rule on external sources?
3. May the BBC and talkSPORT recordings be public, or only unlisted?
4. One piece for everyone (seed by the hour) or a different piece per visitor?

## 9. Live from our own receiver, MEM's sound, MEM in a Worker (added 2026-11-09)

Asked 2026-11-09: *"Live. How to build my own, what hw needed and can i get it in tallinn? I need to work on mam sound
(not happy) and find way to fit it into wprker (different prsetsbon diffrenert hw)"*.

### 9.1 The receiver

The Pi at site `pi-1` already streams a mono 48 kHz audio port to pages over the relay (`positron-hardware`), and has
a Fast Track Pro for line in. So the receiver is a new board source, not a new system.

| part | what | price, where (searched 2026-11-09, not bought) |
| --- | --- | --- |
| **SDR dongle** | RTL-SDR Blog **V4L** (Lite): 500 kHz up with the HF upconverter built in, no soldering. The V4 is end of life (its R828D tuner ran out); the V4L replaces it | about 30 to 40 EUR: sdrstore.eu (EU shipping), wimo.com; a used V4 sold on osta.ee for 38 EUR. No Tallinn shop found stocking one; Oomipood (Tallinn) lists none |
| **antenna** | MLA-30+ active loop, 0.1 to 30 MHz, with its USB-powered bias box; outdoors or at a window, away from chargers and LED drivers, which are what make MW in a city flat a hiss | 35 to 50 EUR: astroradio.com, passion-radio.com, eBay; none found in Estonia |
| **already here** | the Pi, USB, the board's audio path, the relay | 0 |
| upgrade later | Airspy HF+ Discovery (much better with strong MW signals beside weak ones) or a KiwiSDR 2 of our own | INFERRED 170 to 350 EUR |
| the analog way | any portable with MW/LW and a headphone out into the Fast Track Pro; the real radio sound, but no scanning by software | INFERRED 30 to 120 EUR (Sangean, Tecsun); Tallinn shops sell mostly FM/DAB sets |

Total for the first live receiver: **about 70 to 90 EUR, two parcels from the EU, no soldering.**

**On the Pi:** the rtlsdrblog driver fork (the Debian package predates the V4/V4L), `rtl_tcp` for IQ, and the AM
demodulation and scanning in node (tune by `rtl_tcp`'s set-frequency command, a list of channels or MW 531 to 1602 kHz
in 9 kHz steps, a dwell per step, a level gate to skip empty ones), out as a board source `radio` on the existing
audio port. Written in node so it is graded like the rest (a known tone through the demodulator first).

**What it will hear from Tallinn** (INFERRED, to be listened to before anything else is built): by day very little,
since Estonia and Finland have no MW broadcasting left; at night the European skywave band (Spain, Romania, the UK's
remaining MW, religious and Arabic stations), long wave (Poland 225, Romania 153, Algeria 252), the time signals
(DCF77 77.5 kHz) and busy shortwave. Not the Moorside Edge sound of the UK recordings: a Baltic night band piece.
One evening on a public Finnish or Swedish KiwiSDR, by a person listening in a browser, answers this before money is
spent.

### 9.2 MEM's sound

The owner is not happy with it; what is wrong is not said yet. The working rule (memory "no live sound patching"):
batch the changes, render 20 minutes offline at a fixed seed, measure (spectrogram, loudness over time, the status
line), the owner listens, only then deploy. The 36 UK recordings and, once it exists, a night of our own receiver are
the test inputs.

**Where the work happens:** hcmf// is 20 to 29 November, so MEM's sound is v2in's deliverable first and is tuned in
v2in (`server/engines/mem/`); positron copies the result with a header after the festival. Two copies tuned at once
would split.

### 9.3 MEM in a Durable Object

As built it peaks at 207 to 213 MiB in node; a Durable Object has 128 MB. What makes it fit (INFERRED, each one TO
MEASURE with edgecast's `station-test.mjs` method):

| cut | from | to |
| --- | --- | --- |
| AM has about 5 kHz of audio, so the ring is **12 kHz mono 16-bit** | 53 MB (5 min, 44.1 kHz stereo) | 7.2 MB |
| no MP3 decoder: the input arrives as PCM (the Pi's socket straight into the object, or the SFU adapter) | mpg123 17.0 MB | 0 |
| scsynth's reservation sized to what MEM uses (BACKLOG "edgecast: memory headroom": 32 MiB arena against about 1.5 MB needed) | 73.4 MB | perhaps 30 to 40 MB |
| takes held at 12 kHz mono | up to 100 MB | under 10 MB |
| LAME for listeners | 16.8 MB | 16.8 MB |

That is roughly 70 to 85 MB with the JS heap, inside 128. CPU: MEM ran 51 times real time on the laptop and
edgecast's whole chain took 4.84 % of a core in an object, so CPU is not the risk; memory and the 300 s deploy reset
are (deferred update, section 4.1).

**Presets per hardware**, read as: the preset is the music (`drift`, `dense`, `sparse`, `far`), a **host tier** is
the capacity, and the engine plays the preset clipped to the tier.

| tier | players | ring | rate | reverb |
| --- | --- | --- | --- | --- |
| phone tab | 4 | 90 s | 12 kHz | short |
| desk tab | 8 | 5 min | 22 kHz | full |
| Durable Object | 6 | 3 to 5 min | 12 kHz | short |
| Pi (MEM at the receiver) | 6 | 5 min | 12 kHz | medium |
| v2in server | 8 | 5 min | 44.1 kHz | full |

The other reading, a preset per receiver (the SDR scanner one way, the analog radio another), is a line in
channels.json either way and costs nothing extra. To confirm which was meant.

## 10. Built 2026-11-09: MEM in positron, and the lab

Asked: *"Per server. Inmeed to analyze sound and change parameters"*, then *"In positron stack. Ee move engine later to
v2in"*.

- **The engine is positron's now**: `demo/shell/mem.mjs` (from v2in `eaadb58`, the long header moved to
  `lessons/mem.md`), presets and hosts in `demo/shell/mem-presets.mjs`, and `demo/shell/scsynth-sync.mjs`, one
  synchronous wasm scsynth for node and a Web Worker (edgecast's `engine.mjs` is its workerd twin). The host sets the
  rate, the ring and the player cap; `edit()` takes a changed preset while it plays without restarting its mood.
- **MEASURED** (`node demo/shell/mem-test.mjs`, 12 s): the ported test prints the same lines as v2in's original
  (moods 0 to 5 loops, closest change 5.7 s, talk 5 % and 58 %, the switch sparse 4, dense 8, far 6). Per host, 30 s of
  `dense`, same seed twice gives the same samples: server and tab 44.1 kHz, 51 MB of ring and takes; pi 24 kHz, 27.8 MB;
  **worker 12 kHz, 11.2 MB**; phone 24 kHz with a 90 s ring, 8.6 MB.
- **The lab is https://positron.studio/radio/mem/** (off the front page): open recordings (read in the tab, never
  sent), play live, every preset number a knob, the room and the loops drawn, a live spectrum, a readout; render 3,
  10 or 20 minutes offline with LUFS, loudness range, peak, mono fold, loops sounding, changes a minute, talk share and
  loop lengths, kept in a table to compare (switching rows keeps the playback position), a WAV of any render; save a
  preset in the browser or copy it as JSON for `mem-presets.mjs`.
- **MEASURED in headless Chrome** (muted) with two of the UK Kiwi recordings: 3 minutes of `drift` rendered in 3.3 s;
  live play ran with the readout updating; no page overflow at 375 or 1280 px.
- **Not done:** listened to by a person; the live input (a real receiver) as a source; the Durable Object; v2in taking
  the engine back.
