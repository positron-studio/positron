# archive/v2in-cloudflare: v2in's two Cloudflare builds, kept for what they taught

Archived 2026-11-04 from the private repository `kristjanjansen/v2in` at `eac3a84`, when the owner chose one server:
*"there is no a b needed. stop b and archive the valuable stuff to positron"*. v2in runs on one Hetzner VPS (Icecast,
Liquidsoap, nginx, a node conductor); these were the alternatives it was measured against on 2026-11-03 and 04.
Secrets and node_modules left out. Imports point at v2in's `core/` (gate.mjs, layers.mjs, shows.mjs), which is not
copied here: read it in v2in.

## What is here

- **`b/`, option B, three Workers on positron's account** (deployed at `b.v2in.positron.studio`, stopped the same day):
  - `workers/v2in-gate`: the raid gate (core/gate.mjs) on a 1 s alarm in a Durable Object, the layers file stored and
    editable (`PUT /admin/layers`), switches, show keys as hashes with the log of attempts (core/shows.mjs), and a
    private `Live` entrypoint the cast reaches only by service binding.
  - `workers/v2in-cast`: one Durable Object per channel, pacing MP3 frames from R2 in real time, silent frames during a
    raid, one ALL CLEAR piece after it, live input by **WHIP** (OBS) through the Realtime SFU's WebSocket adapter as PCM,
    encoded by LAME in wasm (`whip.mjs`, `lame.mjs`, `packet.mjs`, `vendor/`, copied from positron `a742863e`), ICY
    titles, recordings to R2 by multipart.
  - `workers/v2in-web`: static assets and a service binding to the gate; the cast owned `/stream/*` by its own route,
    so a web deploy never touched a listener.
  - `tools/deploy-cast.mjs`: a deploy through the API as a **deferred update with max_delay 86400**, which wrangler 4.107
    cannot set; `tools/whip-send.mjs`: a WHIP test client with werift (ffmpeg's WHIP sender cannot finish with this SFU).
- **`a-cloudflare/`, option A's image on Cloudflare Containers** (`a.v2in.positron.studio`, stopped the same day): a
  Station Durable Object keeping one `standard-1` container awake, media fetched from R2 at start through a host only
  the container reaches (`boot.mjs`, `http://v2in.boot`), the gate's SQLite snapshotted to R2 every minute.

## What was learned (measured, 2026-11-03 and 04)

- **A busy Durable Object keeps its old code for 300 s after a deploy, then resets.** A listener stayed connected but
  got only digital silence from then on; byte counts cannot see it, a recording run through silencedetect can. A
  deferred update with `max_delay` 86400 (set through the API) held a live show past the deploy with no silence.
- **Idle objects kept in memory by polls also keep old code**; they reset themselves when the worker reports a newer
  version.
- **A route wins over a custom domain** on the same host: the listener-facing worker can own `/stream/*` while another
  serves the pages.
- **Cloudflare Containers take only HTTP:** no RTMP, and an Icecast source PUT arrives only after its upload ends
  (Cloudflare holds the body). WebSockets pass. Image changes replace the container (listeners drop about 30 s).
- **Costs, all three channels 24/7 with listeners:** Workers about 19 USD a month (Durable Object time is billed in
  whole million GB-s steps, so one to three channels cost the same); the container about 37 to 42 USD (memory of a
  `standard-1` is most of it). Realtime SFU: 0.05 USD per GB out after 1,000 GB a month, a WHIP show passed to a
  Worker as PCM is about 0.7 GB an hour, so about two inputs live around the clock are free.
- **Workers custom domains on two-level names** (`b.v2in.positron.studio`) get their own certificate in about 2 to 5
  minutes; the zone's universal wildcard does not cover them.
