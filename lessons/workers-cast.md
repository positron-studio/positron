# workers-cast

Why `workers/cast` is shaped the way it is. Each `why:` pointer in the code names one heading below.

## `workers/cast/worker.mjs`

### rx-websocket

`Rx.ingestSocket()`: the test receiver takes its source over a WebSocket as well as a PUT.

MEASURED 2026-10-16 from this laptop: a chunked `PUT https://cast.positron.studio/ingest/test` with 8 MB
written over about 6 s reached the Rx object as **0 bytes** at every read during the upload, and as
8,000,000 bytes only after the request ended (the same with 40 kB over 3 s). The edge holds a streamed
request body until it ends, so a live source can never be a PUT through the zone. Inside a Worker the
old Caster could PUT to the Rx stub directly; a container cannot reach a binding, so it comes in over
the internet and needs a WebSocket. The first text message carries the PUT's header lines, so the
receiver checks the same `Authorization` and sees the same `ice-*` fields. Binary frames on that
socket are handled whether they arrive as an ArrayBuffer or a Blob, through one promise chain so a
Blob's await cannot reorder them: the first deploy fed `new Uint8Array(e.data)` and counted 0 bytes.

### live-rx-keeps-code

A redeploy did not reach the Rx object while the container held its socket: the object kept the
previous deploy's code (the Blob bug above) until the source was stopped and the object was let go.
The container itself rode through two worker redeploys without dropping its source.

### boot-retry

`Caster.up()`: each start gets 20 s to listen, then destroy, 2 s, and another start, three tries.

MEASURED 2026-10-16: the first deliberate kill (`destroy()`) was followed by a `start()` about a
second later that reported `running` and never listened for the whole 60 s window; the next start
listened in 1,731 ms. Gap on air: **123.4 s**. With the retry in place the second kill came back in
721 ms, on air **2.3 s** after the death (the receiver saw its mount without a source for 1.83 s).
Why the first start hung is not settled: research/cf-containers-next-2026-10-07.md saw a similar
release wait after a destroy on the legacy runtime.

### rx-resets

The test receiver is a Durable Object and it drops like one. MEASURED 2026-10-16 during the long run:
the Rx object restarted at 19:15:36Z and 19:32:06Z (its byte counter went back to 0 and `last` went
null), each time closing the source socket with 1006. The container reconnected in 0.1 s the first
time and 9.1 s the second (the first retry got no answer in 8 s), and its clock moved by the gap, so
the lag came back to about minus the 2 s lead with no burst. The container itself stayed up the whole
time (uptime 1,595 s at the 30 minute mark). A listener on `/listen/test` loses its stream at each
reset. That is a property of the stand-in receiver, not of the source: a real Icecast is a process.

### preview-icecast

`container/Dockerfile`, `container/server.mjs` (`iceStart`), `container/icecast.xml`: the `preview` target is a
real Icecast inside its own cast container, so a sound can be checked in the cloud before it goes to Väin.
Asked 2026-10-16: *"i need to work on sounds and etc and not ready to prevew them on uuu icecast. do i need a
reliable way to continious test before real streaming"*, then *"do 2"*. It replaces the `test` Rx on the page,
which restarted twice by itself (rx-resets above).

- The base is `node:22-alpine3.21` because its `apk add icecast` is **Icecast 2.4.4**, the version Väin runs
  (`/status-json.xsl` reports `server_id: Icecast 2.4.4`). Alpine 3.24 (`node:22-alpine`) ships 2.5.0. MEASURED
  2026-10-16 with `docker run ... icecast -v` on 3.24, 3.21 and 3.20.
- Icecast refuses to run as root, so node (root in the image) spawns it with the `icecast` user's uid and gid,
  read from `/etc/passwd`. The config is written to `/tmp/icecast` at boot with the source password from
  `ICECAST_PW` (the Caster passes `TEST_PW` through `start({ env })` only for a `local` target) and random
  relay and admin passwords nobody is told. If it exits, it is started again 1 s later and the exit is dated in
  `/status`.
- `<hidden>1</hidden>` on the mount also hid it from `status-json.xsl`, so `/status` read `mounts: []` while a
  source was on air. MEASURED locally; the mount is `public 0` and not hidden.
- The source is the same `icecastSink` that went on air on their radio1965, pointed at 127.0.0.1:8000.
- MEASURED 2026-10-16 after an image push: container up in 6,073 ms, on air at lag -1.8 s, Icecast reporting
  `/preview` since 20:08:46Z. The image grew from 165 to 171 MB.

### preview-listen

`Caster.listen()`: `GET /listen/preview` is answered by the `preview` Caster, which fetches
`getTcpPort(8000).fetch('http://c/preview')` and hands the body back. A container that is not running is a
503 JSON and is never started for a listener.

The worry was rx-websocket above: the edge held a streamed REQUEST body until it ended. A streamed RESPONSE
body from the container is not held. MEASURED 2026-10-16 with two listeners at once for 20 s each: first byte
at 395 and 397 ms, 72,800 and 75,600 bytes in the first second (Icecast's 65,536 byte burst), then 12,600 to
19,600 bytes every second after it (128 kbit/s is 16,000), 378,000 bytes each; mp3 44.1 kHz 128 kbit/s,
23.6 s of audio, mean -18.6 dB against -91.0 dB for a silence control. Icecast counted `listeners: 2`.

### queue

`Caster.command()` `queue`, `container/server.mjs` `queue()`: replaces what plays after the current file without
cutting it (plan-vain-cast-processing §2). The container sets `s.queue` to the new list and `s.index` to -1, so the
file on air keeps playing and the next one is `queue[0]`; `/status` carries `next` and `ids`. `play` still cuts.
A queue on a caster that is off air is refused (`not on air: start the cast first`), because a queue is a claim
about what follows something. Progress saved while `index` is -1 resumes at the top of the new queue.

MEASURED 2026-10-17 on `preview`: with *Driving along* at 18 s, `queue` [Kalle, Oriental analog] changed `next`
from *Evening rituals* to *Kalle* within one status tick while the current file kept counting 18, 19, ... 26 s;
`next` then put *Kalle* on at 1 s with *Oriental analog* as next.

A deploy did not reach the running `preview`: the Caster object and its container kept the previous code for
about four minutes after `wrangler deploy` (a container rollout reaches each object in turn; `user3`, idle, had
the new code at once). A container started by the old object kept the old image too, so `preview` was stopped and
started twice to carry the new `/queue` route. A new container takes the image of the object that starts it.
