# plan-kcmd: KCMD's channel on Radio Tallinn 1965, through edgecast or on their own server

Status (2026-11-02): open. A plan only, nothing built, no connection to live.uuu.ee or to KCMD's server. Pick one route: edgecast (the first section, the owner's own proposal of 2026-10-29) or self-hosted (the second, the fallback).

Related: `plan-edgecast-modular.md`, the edgecast the first route builds on.

Joined on 2026-11-02 from `plan-kcmd-channel`, `plan-kcmd-selfhosted`, written in a claude.ai chat between 2026-10-24 and 2026-11-02 against the repository as it was on 2026-10-22, and kept word for word below, one section each. A reference to one of those names means the section of that name here.

## plan-kcmd-channel: KCMD's channel on Radio Tallinn 1965, through edgecast

Status (2026-10-29): a plan, nothing built. Written from KCMD's proposal ("Radio
VÄIN × KCMD: Technical aspects", with its four-box diagram), Positron's own docs,
and the public air-raid dataset. No connection to live.uuu.ee was opened.

Asked 2026-10-29: *"Here is ukrainian team proposal. They have not much
visibility to our hybrid vain/uuu and positron setup. My proposal is to use
edgecast for it"*, then *"Plan"*.

Tags: **READ** (code or a document), **MEASURED** (with where the number comes
from), **INFERRED** (reasoned, not checked).

### 0. The answer

1. **Edgecast is not just convenient here, it is required.** READ
   (`lessons/edgecast.md`, "Why a relay at all"; HANDOFF session 82): Väin's
   Icecast takes one source per mount, and when the source changes the
   listeners' connections end and no player reconnects. KCMD's design switches
   programme often (alert, silence, ALL CLEAR, live, archive, generative). If
   each of those were a new source on the mount, every listener would drop at
   every switch. All switching must happen behind one long-lived source: the
   relay.
2. **Silence is already built.** READ: the relay fills a dry queue with silent
   MP3 frames (ffmpeg volumedetect −91.0 dB, no decode error) and keeps the mount
   1 s ahead, so Icecast's 10 s source timeout never fires. Silence during an
   alert is a state of the station, not a disconnection.
3. **New work:** the alert gate, a priority switch, the ALL CLEAR library, live
   ingest, the schedule, texts in the app, recording, and the readiness items in
   §8 that edgecast needs before it can carry a channel all day.

### 1. The patch

On the site `cf-edgecast`, in the bay's text form, names per
plan-edgecast-modular (decided 2026-10-21: keep the scheme):

```
cf-edgecast:alert  ──state──▶  cf-edgecast:switch ──pcm──▶ cf-edgecast:encoder ──mp3──▶ cf-edgecast:relay ──▶ KCMD mount
cf-edgecast:allclear (player) ─pcm─▶ switch
cf-edgecast:live     (ingest) ─pcm─▶ switch
cf-edgecast:archive  (player) ─pcm─▶ switch
cf-edgecast:default  (player) ─pcm─▶ switch
```

New node names (`alert`, `switch`, `allclear`, `live`, `archive`, `default`)
are proposals for the owner; each says what the node does, none says what runs
it.

The switch's priority, from KCMD's proposal, highest first:

1. silence while an alert is on
2. the ALL CLEAR item, played once to its end when an alert ends
3. a live show
4. an archive show
5. the default playlist (the generative layer)

"A new alert during the ALL CLEAR item: silence after it" (KCMD) is a rule of
the switch: the item finishes, then silence.

### 2. The alert gate (`cf-edgecast:alert`)

A Durable Object on its own short alarm (cron triggers are 1 min, too coarse).

**Sources, both for Kyiv City:**

- official: `api.ukrainealarm.com` (behind the national Air Alert app; key by
  request form)
- volunteer: `alerts.in.ua` (token from devs.alerts.in.ua)

Either source reporting an alert counts as an alert. Only a fresh "clear" from a
source ends one.

**States:**

| State | Meaning | On air |
|---|---|---|
| clear | confirmed within the last minute | programme |
| raid | confirmed within the last minute | silence |
| raid, unconfirmed | last state raid, no fresh data for over 1 min | silence |
| unknown | no data, and the last state was clear or the hold ran out | owner's call (§9) |

Silence never ends because data stopped. Only a fresh clear ends it.

**Hold for "raid, unconfirmed",** MEASURED on
Vadimkin/ukrainian-air-raid-sirens-dataset `official_data_en.csv`, Kyiv City,
2025-01-01 to 2026-09-05, after removing 1,874 exact duplicate rows and merging
overlaps: 959 alerts; durations p50 32 min, p75 71, p90 197, p95 287, p99 486,
longest 673. A 5 h hold covers 95% of real alerts; then the state becomes
unknown.

**Polling and backoff:**

- every 10 to 15 s while healthy
- on errors 15, 30, 60, 120 s (cap), with jitter; honour `Retry-After`
- alternate sources; any good answer resets the backoff
- record which side failed: no answer (our network), an error (the API), an old
  answer (the source)

**Ports:** `state` (one of the four), `since` (alert start), `age` (seconds since
the last confirmation), as `value` ports, so anything on the bay can react.

**Log:** every alert start and end, every state change, every source failure,
stored in the object and readable as JSON.

### 3. The ALL CLEAR library (`cf-edgecast:allclear`)

**Format, as KCMD proposed:** an audio file plus a Markdown file of the same
name: artist, city, title, short description, links.

- **Storage:** an R2 bucket with a small upload page and a key per uploader,
  rather than a generic shared drive, so every file is checked on arrival.
- **On upload:** decode check, duration check (10 to 20 s, warn outside),
  Markdown fields check, **loudness measured** (the cast's quality gate already
  measures LUFS, LRA, peak), a gain stored beside the file. Their files are
  never altered.
- **Order:** a shuffle bag (each once, then repeat), random, and "pin next".
- **Log:** which item played, when, after which alert.

### 4. Texts in the app

READ (HANDOFF sessions 82 and 83; `research/radio1965-2026-09.md`): Väin's app
reads `server_name` and `server_description` once, when a source connects; the
ICY title is not shown. With one source that stays connected, those cannot
change per alert.

So texts go through Väin's events API as `text` events:

- "Kyiv: air raid alert since 01:12. All channels are silent." (the `since` port)
- on ALL CLEAR: artist, city, title, description, links, and "ALL CLEAR IN
  KYIV, air alert off, lasted XX minutes"

This needs Väin's agreement. **Before using it:** READ, the same research file:
`POST /events/publish` is unauthenticated on their public deployment. Tell Väin
privately and wait for a fix; the alert texts must not depend on an endpoint
anyone can write to.

Languages: English and Ukrainian; Estonian if the app's text space allows.
Ask Väin for the limit.

### 5. Live shows (`cf-edgecast:live`)

Artists never stream to the KCMD mount itself (§0.1). They stream to an ingest;
the switch takes the show when it is scheduled and the ingest is live.

READ (`workers/edgecast/codec.mjs`, `adapter.mjs`, `lessons/workers-edgecast-adapter.md`):
edgecast already has **both MP3 directions**, mpg123 (streaming decoder
handles, one shared instance) and LAME (CBR encoder), and since 2026-10-22 an
**SFU adapter** that brings a Realtime SFU publication into the object as PCM.
So the codecs are done; what is missing is getting a live show *in*.

READ (`workers/sfu/worker.mjs`, `lessons/workers-sfu.md#whip`): positron-sfu
already takes **WHIP**: `POST /whip/<room>/<key>`, one live input per room,
remembered by the room's `Live` object, key `HMAC(SFU_PROOF_KEY, "whip\n" +
room)`. MEASURED there 2026-10-22: OBS 32.2.2 (`obs-webrtc`) connects to the SFU
(connect 285 ms); ffmpeg could not.

So the live route is **OBS → WHIP → positron-sfu room → SfuAdmin egress adapter
→ edgecast, as PCM**, every piece built, none yet joined for this:

| Piece | State | To do for KCMD |
|---|---|---|
| OBS to WHIP | built, measured | a room for KCMD; its WHIP URL to the artist |
| room to edgecast | built (egress adapter, PCM in) | point the adapter at the room's live tracks |
| adapter lifetime | 10 min cap (`ADAPTER_MS`) | lift for scheduled shows |
| PCM to air | goes to the echo/ring/full chain | route to the switch instead |
| keys | one fixed key per room | per-show keys: put the slot into the HMAC, or one room per show |
| handover | a second POST replaces the first (READ) | fine between shows; with per-show keys nobody else can take a slot |

DAW artists route their DAW into OBS (a loopback device), so one tool covers
both. The Icecast-style route (BUTT, then the existing mpg123 decoder) stays a
fallback, not the plan.

Memory, READ (`codec.mjs`): each wasm instance starts at 16 MB and the isolate
has 128 MB with scsynth holding 73 of it. A live decoder handle shares the one
mpg123 instance; check headroom with a live show and the default playlist both
decoding (§8.5).

One test show with one artist before anything is scheduled.

- **Keys:** one per show, valid only around its slot.
- **Schedule:** show times and descriptions in the same Markdown format as the
  library, one file per show.
- **Recording:** per show, on our side, to R2. Väin's own recording is per
  source connection (READ: `save_stream`, `icecast_on_connect.sh`), and our
  source is one connection that does not end.
- **Public link:** the same pattern as `shout.positron.studio/radio1965`.
- **A show that drops:** the switch falls to archive or default after a grace
  period; the show's slot stays open for a reconnect.

### 6. Archive and generative

- **Now:** pre-rendered generative files in the default playlist, through the
  existing player. Archive shows as scheduled files, same Markdown format.
- **Later, live generative:** KCMD's Python or Pure Data runs on *their* server
  and streams into a permanent ingest (§5), like a show that never ends. Not on
  ours: Cloudflare does not run Pure Data, and a container for it is a cost and
  a maintenance burden for us. They have no server yet; say so early.

### 7. "All channels silent"

KCMD asks for "the channel (or all channels)". We can silence KCMD's. Väin's
other mounts are Väin's: their playout would have to follow the gate. Offer the
gate's state as public JSON so they can; it is their decision.

### 8. Readiness before launch

READ from HANDOFF, not yet true:

1. **Long runs.** edgecast's live time on radio1965 is one run of 118 s; runs
   over 18 min are not proven on Cloudflare. Needed: a 24 h run against a
   rehearsal Icecast, then a supervised run on the real mount.
2. **Resume after a restart** (BACKLOG step 3: seed, scene, file and second to
   storage). A channel that restarts from the top after every eviction is not a
   channel.
3. **Deploys drop listeners.** A relay deploy or reconnect ends every Icecast
   listener. Deploy windows outside programme hours, announced; the relay is
   deployed as rarely as possible (as its lesson already says).
4. **The relay's target vars** (`ICE_HOST`, `ICE_PORT`, `ICE_MOUNT`) are set by
   the owner on deploy and are not in wrangler.jsonc: a plain deploy loses them.
   Write the procedure down before anyone else deploys.
5. **Memory headroom** in edgecast is still open.

### 9. Open questions

- **For Väin:** which mount is KCMD's channel; the events API for texts and the
  publish fix; the app's text length; whether their other channels follow the
  gate.
- **For KCMD:** the loudness target (propose −16 LUFS integrated, INFERRED as a
  common streaming level), OBS version (32 or newer, as measured), and who keeps
  the library.
- **For the owner:** what goes on air in **unknown** (silence or programme with
  a notice); whether programme resumes after ALL CLEAR automatically (KCMD's
  diagram says yes) or by a person; the node names in §1.

### 10. Order

1. The gate alone, logging only, nothing on air: two sources, states, backoff,
   log. Run it for a week and compare its log with the dataset.
2. Readiness §8.1 and §8.2 (long run, resume).
3. The switch with silence and the default playlist, on a rehearsal Icecast.
4. The ALL CLEAR library with upload, checks and loudness.
5. Texts through the events API, after Väin's fix.
6. Live: join WHIP, adapter and switch; per-show keys; one test show.
7. Schedule, archive, recording, public link.
8. A supervised run on KCMD's real mount with KCMD and Väin listening.

## plan-kcmd-selfhosted: KCMD's channel on their own server, without Cloudflare

Status (2026-10-30): a plan, nothing built, no access yet. The alternative to
`plan-kcmd-channel.md` (edgecast): the same priority chain, on standard tools
the team can own. Tags: READ, MEASURED, INFERRED, as everywhere.

**Goal.** A channel they run and understand, built by you, reproducible from a
git repo, and reversible at every step without touching what already works.

### 1. What you need from them

| Need | Why | Ask for |
|---|---|---|
| SSH access | to build and test | a **personal user with your SSH public key**, no shared password; `sudo` only if they agree, ideally limited to the services below |
| a written OK | it is their production server | which mounts and ports you may touch, and which never (their `/radio1965` and other users' mounts) |
| a test mount | rehearse without listeners | e.g. `/kcmd-test`, same Icecast |
| KCMD's mount | the real channel | which one (`/user1`..`/user4` or new) |
| a snapshot | the fastest rollback | a VPS or VM snapshot before you start, if their host has one |
| a second person | not to be the only one who knows | someone on their side who watches the first steps |
| alert API keys | the gate | `api.ukrainealarm.com` (request form), `devs.alerts.in.ua` |

READ (`research/radio1965-2026-09.md`): their server is `live.uuu.ee`, Icecast
2.4.4, nginx-rtmp, a FastAPI + MySQL events server; the Icecast password was
committed to their repo once. Ask them to rotate it before you get access, not
after.

### 2. First visit: look, do not touch

A read-only inventory, written to `inventory.md` in the repo:

- OS and version, CPU, RAM, disk, upload bandwidth
- running services (`systemctl list-units --type=service`), Docker or not
- open ports and what listens (`ss -tlnp`)
- Icecast config (mounts, limits, `fallback-mount`, passwords: note that they
  exist, never copy them)
- nginx and nginx-rtmp config, TLS certificates and their renewal
- cron jobs, disk use, logs and their rotation
- backups: what, where, how often

No change on the first visit. The inventory is also the "before" state for
rollback.

### 3. Everything as code

One git repo, e.g. `kcmd-radio`, owned jointly with them:

```
kcmd-radio/
  README.md            what it is, in their words
  RUNBOOK.md           what to do when, whom to call
  inventory.md         the first-visit findings
  compose.yaml         liquidsoap, mediamtx, gate; images pinned by version
  liquidsoap/kcmd.liq  the priority chain
  mediamtx/mediamtx.yml
  gate/                the alert gate (Python, like their FastAPI)
  nginx/kcmd.conf      TLS + CORS for the web player (if they want it)
  .env.example         names of secrets, never values
  deploy.sh            idempotent: pull, check, compose up
  rollback.sh          compose down, restore the previous tag
```

**Containers (Docker Compose) are the reproducibility and the rollback.**
Liquidsoap and MediaMTX have official images (INFERRED: check current tags).
Pinned versions mean the same thing runs every time; a rollback is the previous
tag. Nothing is installed into their system packages, so removing it all is
`docker compose down` and deleting one folder.

Secrets live in `.env` on the server only, readable by the service user.

### 4. The pieces

| Piece | Tool | Notes |
|---|---|---|
| Priority chain, one permanent source on the mount | Liquidsoap | silence > ALL CLEAR > live > archive > default |
| Live input | MediaMTX (WHIP, SRT, RTMP from OBS); Liquidsoap's harbor for BUTT | OBS 32 does WHIP (MEASURED in positron-sfu); SRT also native in OBS |
| Alert gate | small Python service | the states, backoff and 5 h hold from `plan-kcmd-channel.md` §2; tells Liquidsoap over its local control interface |
| ALL CLEAR library | a folder; audio + Markdown | the gate queues one item on all-clear |
| Loudness | ffmpeg `loudnorm` on upload, or ReplayGain applied by Liquidsoap | measured once per file |
| Texts in the app | their events API | only after `POST /events/publish` has authentication |
| Web player | nginx in front of Icecast, Let's Encrypt, CORS | what positron's `shout` worker does today |
| Video, occasional | MediaMTX: HLS for the app's `videostream`, WebRTC for the web | recording in MediaMTX |
| Logs | Liquidsoap log, the gate's JSON log | rotated |

### 5. Safety while building

- Build and rehearse on the **test mount** only. Their existing mounts are not
  touched until §7.
- **`fallback-mount`** on KCMD's mount, pointing to something that already
  works (their playlist), so if Liquidsoap stops, listeners are moved, not
  dropped. INFERRED from Icecast's documentation; MEASURE on the test mount,
  including what their app does during the move.
- One change at a time, each a git commit, each with a line in
  `CHANGELOG.md`: what, when, why, how to undo.
- Before any change to a file outside the repo (Icecast, nginx): copy it into
  `backup/<date>/` and commit the diff.

### 6. Rollback, at three depths

1. **A setting:** `git revert` and `deploy.sh`.
2. **The whole new stack:** `rollback.sh` (stop the containers); the mount falls
   back to their playlist through `fallback-mount`.
3. **The server:** the snapshot from §1, if their host has one; otherwise the
   `backup/` copies of every file changed outside the repo.

Test depth 1 and 2 on purpose during rehearsal, with someone from their side
watching, so the first rollback is not in an emergency.

### 7. Order

1. Access, the written OK, password rotation.
2. Inventory (§2).
3. Repo, compose, Liquidsoap with the default playlist on the test mount.
4. Fallback-mount test.
5. The gate, logging only, for a week; compare with the alert dataset.
6. Silence and ALL CLEAR on the test mount.
7. Live input: one OBS test show (WHIP or SRT).
8. Web player behind nginx.
9. A supervised night on KCMD's real mount, rollback ready.
10. Handover: README, RUNBOOK, a session with their second person.

### 8. Open

- Their host: VPS with snapshots, or a physical machine.
- Docker allowed on their server, or plain systemd units instead (then the
  rollback is per-unit, and the repo holds the unit files).
- Upload bandwidth: 128 kbit/s per listener, about 13 Mbit/s for 100.
