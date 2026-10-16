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
