# Workers lessons: edgecast and the SFU WebSocket adapter

The reasons behind `workers/edgecast/adapter.mjs`, `workers/edgecast/packet.mjs` and `SfuAdmin` in
`workers/sfu/worker.mjs`. Built 2026-10-22 for BACKLOG "edge: the SFU adapter both ways (step 8)",
`plans/plan-edgecast-modular.md` §8 and §10.

<a id="flow"></a>

## `adapter.mjs`: the pair

A publication in an SFU room goes out of the SFU as PCM on an **egress** adapter, into edgecast's Durable Object
(the object named `adapter`), through the mode's chain (`echo`, `ring` or `full`, the same `startChain` the `/ws`
experiment boots), and back into the SFU on an **ingest** adapter, which the SFU publishes as a new session. A page
pulls that session with the ordinary public `pull` route on positron-sfu, because `SfuAdmin` signs a room proof for it.

```
browser mic -> SFU (publish "mic") -> egress adapter -> wss://edgecast.positron.studio/adapter/ws/egress?t=
  -> Edgecast DO 'adapter' (decode Packet, chain, 20 ms out) -> /adapter/ws/ingest?t= -> ingest adapter
  -> SFU (new session, track "edgecast") -> browser pull
```

- **The SFU dials us.** Both adapters are WebSockets the SFU opens TO edgecast; no custom headers, no redirects,
  so the gate is a random 24-byte token in the URL, one per pair, held only in the object's memory and never handed
  back to any caller. Cloudflare: *"Its credential must remain valid for the reconnect attempts; consuming it
  permanently at the first handshake prevents that recovery."* So the token lives until the pair stops.
- **The handshake happens during `adapters/websocket/new`** (errors such as `websocket_handshake_failed` come back
  in the create answer), so the object must answer the upgrade while it is still awaiting the RPC inside `start`.
  A Durable Object lets other requests in across a non-storage await, so this works without anything special.
- **Ingest first, then egress**, so the first egress packet has somewhere to go.
- **Egress retries for 15 s, ingest never reconnects** (READ, Cloudflare docs 2026-10-22). The pair stops itself
  20 s after the egress socket goes and does not come back, and after `ADAPTER_MS` (10 minutes) in any case; stop
  closes both adapters through `SfuAdmin.adapterClose`.
- **Start, stop and status need CAST_KEY**; the key lives in a script, never in a page. Status carries the ingest
  session's proof, which lets anybody pull edgecast's output (our egress bill), so it is keyed too.
- **The token can reach Workers Logs.** Observability logs the request URL of the upgrade. The token dies with
  the pair (any socket after stop is a 403), so a log line is worth nothing an hour later. Not fixed.
- **No CPU number from the object.** `performance.now()` and `Date.now()` do not move during synchronous work in a
  Worker, so `workMs` reads 0 and `boot.ms` reads 0 for a ring boot that is pure CPU. The CPU of the chain is the
  `/ws` experiment's measurement (plan §10: 0.97 ms per 20 ms full chain, 0.23 ms echo).

MEASURED 2026-10-22, headless Chromium (playwright-core 1.58.2) publishing a 1 kHz 40 ms burst every 2 s as track
`mic`, pulling both `mic` directly and `edgecast`, onset lag on one AudioContext clock, VPN process running and
default route `en0`, STUN to `stun.cloudflare.com:3478` answered:

| run | mode | direct SFU loop, onset lag median (min to max) | through edgecast | added by the pair |
| --- | --- | --- | --- | --- |
| 1 | echo, 25 s | 245 ms (176 to 298) | 472 ms (374 to 524) | about 226 ms |
| 2 | echo, 40 s | 134 ms (72 to 164) | 395 ms (294 to 395) | about 261 ms |
| 3 | echo, 40 s | 155 ms (65 to 175) | 489 ms (320 to 492) | about 334 ms |

- Egress: every packet a 3840-byte payload (20 ms of 48 kHz stereo s16), sequence numbers without a gap, timestamp
  step 960, arrival gap median 19 to 21 ms, p99 27 to 77 ms, worst 109 to 170 ms. 0 bad packets in 5 runs.
- Ingest: one packet out per packet in, 0 dropped once the ingest socket was up.
- The pulled `edgecast` track arrives at about 25 packets a second against 50 for `mic`, so the ingest side
  INFERRED encodes 40 ms Opus frames.
- The lag through edgecast **grows within a run in steps** (294 to 395 ms, 320 to 492 ms over 40 s) while the
  direct track's does not grow the same way. Not separated: the SFU's ingest buffer ("buffer mode"), the
  receiver's jitter buffer (73 to 82 ms on that track) or a clock rate difference between egress and ingest.
- Echo keeps the level (output RMS 0.068 to 0.071 against the source's 0.071); ring and full make a continuous
  louder signal (RMS 0.094 to 0.098) out of 40 ms bursts, which is the chain running.
- Creating both adapters took 1.18 to 1.76 s; the whole `start` call 1.34 to 2.03 s.
- The close answer's `bytesProcessed` (42,068 for an egress that delivered 5.26 MB) is not a byte count of the
  traffic; Cloudflare says it is not the billed number either.
- 1 run in 6 failed before edgecast was involved: the publishing peer connection sat in `connecting` past 10 s;
  STUN answered a minute later and the next two runs were clean.
- Cost (READ): adapter egress is Realtime egress, $0.05 per GB after the shared 1,000 GB a month; PCM is 192 kB/s,
  0.69 GB an hour, about $0.035 an hour. Ingest into the SFU is free.

<a id="sfu-admin"></a>

## `SfuAdmin` in `workers/sfu/worker.mjs`

An adapter makes Cloudflare open a WebSocket to whatever `endpoint` says, on this account's bill. So adapters are
never offered on the public fetch handler: `SfuAdmin` is a named `WorkerEntrypoint`, and a named entrypoint is
reachable only through a service binding (`"entrypoint": "SfuAdmin"` in edgecast's `wrangler.jsonc`). It also
refuses any endpoint that is not `wss://edgecast.positron.studio/adapter/ws/(egress|ingest)?t=...` or the same on
`positron-edgecast.kristjan-jansen.workers.dev`, and an egress whose publisher's proof is not for the room asked.
It never returns the endpoint (with its token) to the caller. The public routes did not change: after the deploy
`GET /` 200, a session 201, publish with no proof 403, another origin 403 (MEASURED on both the custom domain and
workers.dev).

<a id="packet"></a>

## `packet.mjs`

`Packet { uint32 sequenceNumber = 1; uint32 timestamp = 2; bytes payload = 5; }` by hand, because three fields do
not justify a protobuf library in a Worker. The decoder skips unknown fields of every wire type rather than
failing, so a field Cloudflare adds later does not take the stream down; it throws on anything truncated. Varints
are read with multiplication, not shifts, because a shift turns a uint32 above 2^31 negative. The payload is a
view; `adapter.mjs` copies it before reading it as `Int16Array`, because the view can start at an odd offset.
`packet-test.mjs` is 19 checks, 12 of them negative controls; three sabotages (payload from any bytes field,
no length check, signed varints) each take a check red, and the first one needed a check with the unknown field
AFTER the payload, since before it the real payload overwrites it.

## Where positron.studio does not resolve

On 2026-10-22 this desk's network answered every `*.positron.studio` name with a Fortiguard block page
(208.91.112.55, self-signed certificate), even through `@1.1.1.1`. The workers.dev names answer, and so does the
custom domain pinned with `curl --resolve sfu.positron.studio:443:104.18.0.1`. The SFU reaches
`edgecast.positron.studio` from Cloudflare's side, so the adapter endpoints use the custom domain.

<a id="page"></a>

## `/radio/return/`: the page that drives the pair

Asked 2026-10-22: *"Not done: no page uses this yet. -- do in bg"*. A concept page of its own rather than a block on
`/radio/edgecast/`, which is the station's page and is already long: one idea per page.

- **The key is in the page after all.** The section above said start, stop and status live in a script. The owner
  asked for a page that drives them, so it takes the cast's key the way `/radio/cast/` does (`?key=` once, kept in
  `localStorage` as `vain-cast-key`); without one Start is switched off. The proof that status hands out still costs
  only our egress bill, and the pair still stops itself after 10 minutes.
- **The worker had no CORS on `/adapter/*`**, so no page could read an answer: the preflight hit the key check and got
  a 403, and the replies carried no `access-control-allow-origin`. `worker.mjs` now answers OPTIONS there and adds
  the header to start, stop and status (and to the key refusal). The page sends its JSON as a text body, a simple
  request, so it needs no preflight anyway. Until that worker change is deployed, the page's harness adds the header
  with Playwright's `page.route` on the way back; that is the only thing it fakes.
- **The publisher's session id and proof come from `createSfu`'s own `send`**: the `sfu.pub` it announces carries them,
  so the page reads them there. `demo/room/sfu.mjs` gained only a read only `connections()` for the stats.
- **The delay is the lag of the best correlation between two envelopes** (the microphone as sent and what came back,
  128 frame blocks, the last 8 s, lags 0 to 1.5 s, empty below r 0.5). It is measured only in echo: ring and full
  change the sound, so the cell stays empty there, which is the honest answer. Chromium's own fake microphone beeps
  every ~0.5 s and gave 267 or 792 ms on alternate readings (aliasing), so the harness feeds a WAV of bursts at
  uneven spacing (`--use-file-for-fake-audio-capture`).

MEASURED 2026-10-22, headless Chromium, workers.dev names, a 60 ms 1 kHz burst at 1.7 to 2.6 s spacing as the
microphone, microphone to what came back on one AudioContext clock (so including the SFU both ways and the receive
jitter buffer):

| run | mode | delay median (min to max) | readings | to the SFU (candidate pair) |
| --- | --- | --- | --- | --- |
| 1 | echo, 40 s | 411 ms (280 to 413) | 26 | 9 ms |
| 2 | echo then full at 12 s | 312 ms (285 to 312) | 12 | |
| 3 | echo, 22 s | 323 ms (301 to 435) | 16 | 9 ms |

Start to edgecast's sound arriving: 4.5 to 5.7 s (the microphone on the SFU at 1.0 s, the pair up at 2.5 to 2.7 s).
Ring kept the level continuous (-17.5 dB peak second against -23.5 for echo). After Stop `/adapter/status` read
`on: false`, closed `asked`, every run.
