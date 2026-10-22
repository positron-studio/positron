# workers-pub

Comments cut from the code on 2026-10-14 and kept here verbatim, so the code can say in one to three lines what it cannot say itself. Each `why:` pointer in the code names one heading below.

## `workers/pub/container/server.mjs`

### container-header

Above `import { createServer } from 'node:http';`, lines 1 to 14 before the cut.

~~~js
// positron-pub container: ffmpeg for /stage/'s film and the LL-HLS loopback.
//
//   POST /start-whip {url, source: 'film-copy'} -> the film copied onto WHIP (idempotent)
//   POST /stop                            -> end the WHIP leg
//   GET  /status                          -> {publishing, containerUpS, whip, cam}
//   POST /cam/open  {key, fmt, sid}       -> a camera's WebM rewrapped to RTMPS
//   POST /cam/chunk?sid=                  -> one MediaRecorder chunk onto its stdin
//   POST /cam/stop  {sid?, why?}          -> end the camera leg
//
// The WHIP URL and the stream key arrive in the POST body from the Worker,
// which reads them from Worker secrets. They are never baked into the image
// and never logged.
// The test pattern's RTMPS leg and its burned clocks were removed 2026-10-14;
// why they were built that way: .claude/skills/positron-streaming/SKILL.md.
~~~

### whip-sndbuf

Above `const WHIP_SNDBUF = /^\d+$/.test(process.env.PUB_WHIP_SNDBUF || '') ? process.en`..., lines 24 to 36 before the cut.

~~~js
/**
 * 🔴 THE WHIP LEG'S UDP SEND BUFFER, SET ONLY WHERE IT IS ASKED FOR.
 * MEASURED 2026-10-07 on the new `durable_object` Containers runtime: the WHIP
 * leg died with exit 245, "Error muxing a packet / Task finished with error
 * code: -11 (Resource temporarily unavailable)", 2 to 15 s after every start,
 * eight times in a row over 150 s, while the RTMPS leg in the same container
 * held, and the legacy runtime's WHIP leg held on the same input minutes
 * apart. -11 is EAGAIN on a non-blocking UDP send, which the whip muxer treats
 * as fatal, and a full socket send buffer is what returns it. `-ts_buffer_size`
 * is the whip muxer's own pass-through to the UDP socket's buffer. Read from
 * the environment so the legacy class, which never sets it, sends exactly the
 * arguments it always did.
 */
~~~

### film

Above `const FILM_WHIP = 'https://positron-station.kristjan-jansen.workers.dev'`, lines 40 to 49 before the cut.

~~~js
/**
 * 🔴 THE FILM, ALREADY WHIP SHAPED, SENT WITHOUT ENCODING. MEASURED 2026-09-30:
 * the film re-encoded on the main box ran at about 0.6x realtime (`-re` lag
 * 9.8 s growing to 29.3 s over 90 s), because the original is H.264 Main with
 * B-frames, a 5.12 s GOP and AAC, none of which the whip muxer can pass
 * through. This copy is baseline 3.1, no B-frames, a 2 s GOP at 25 fps and
 * Opus 48 kHz, made once off the original, so the leg is a copy and costs a
 * demux and a packetiser rather than an x264.
 * ⚠️ NO BURN IS POSSIBLE HERE: a copied stream has no pixels to draw on.
 */
~~~

### secrets

Above `const secrets = new Set();`, lines 62 to 67 before the cut.

~~~js
// ── secret hygiene ────────────────────────────────────────────────────────
// The header above claims the key is "never logged". Truncating a tail is not
// redaction: ffmpeg echoes the FULL RTMPS URL in its error messages ("Error
// opening output files"), and /status serves that tail publicly. Measured on
// 2026-09-04: a failed run leaked the key verbatim into plain output. Scrub at
// the point of capture so an unredacted secret is never held in memory.
~~~

### leg-retry

Above `const LEG_RETRY_MS = 45_000;`, lines 80 to 87 before the cut.

~~~js
/**
 * How long to leave a failed leg alone before retrying it.
 *
 * Cloudflare holds a WHIP input against a stale publisher: a leg that died with
 * "Error muxing a packet / Resource temporarily unavailable" (exit 245) cannot
 * be restarted immediately — measured, it needs roughly 45 s before the input
 * accepts a new session.
 */
~~~

### dead-leg

Above `if (cur?.dead) {`, lines 93 to 97 before the cut.

~~~js
// A DEAD leg used to stay in `legs` forever, and `if (legs[name])` above then
// reported {already: true} — so the Worker's 30 s sweep believed the leg was
// running and NEVER restarted it. The WHIP leg died with exit 245 and stayed
// down until a human ran /stop, waited for publishing:false, waited another
// 45 s and ran /start. That ritual is now the code's job.
~~~

### cam-leg

Above `const CAM_IDLE_MS = 5_000;      // no chunk for this long and the leg stops itse`..., lines 150 to 155 before the cut.

~~~js
// ── the camera leg ───────────────────────────────────────────────────────
//
// /video/llhls/'s MediaRecorder chunks (H.264 in WebM, 2 s keyframes, no
// B-frames) arrive from the DO and ffmpeg only rewraps them to FLV for RTMPS:
// about 0.5 per cent of realtime, where an x264 would not fit on this vCPU
// (plans/plan-cam-llhls.md). Independent of `legs.whip`: /stop never ends it.
~~~

### cam-out

Above `const CAM_OUT = process.env.PUB_CAM_OUT || '';`, lines 159 to 161 before the cut.

~~~js
// ⚠️ TESTING ONLY. Points the camera leg's output somewhere other than Stream,
// so the whole leg can be graded on a laptop with zero bytes to anybody's
// server (plans/plan-cam-llhls.md section 6). Unset in the image.
~~~

### no-probe

Above `'-probesize', '32', '-analyzeduration', '0',`, lines 170 to 178 before the cut.

~~~js
// No probing: the first chunk carries the header and ffmpeg starts on it.
// No -re: the camera paces this input already.
// 🔴 AND NO `-fflags nobuffer`, WHICH THE PLAN'S RECIPE HAD. MEASURED
// 2026-09-30 on one MediaRecorder capture piped in three ways: with it the
// output began at 1.78 to 2.04 s and 115 of 171 frames came out, because
// the packets read while probing were thrown away, and they are the whole
// first GOP. Without it, frame 0 is a keyframe at 0.000 and all 171 arrive.
// The plan measured how SOON output appeared, which nobuffer does not hurt;
// it did not count what was missing.
~~~

### watchdog

Above `setInterval(() => {`, lines 259 to 261 before the cut.

~~~js
// THE CONTAINER'S OWN WATCHDOG, the third of three independent stops. A DO that
// lost its state, or a socket that went quiet without closing, cannot leave an
// encoder publishing into Stream with nobody at the other end.
~~~

### stale-stop

Above `if (o.sid && cam && cam.sid && o.sid !== cam.sid) return json(res, { already: tr`..., lines 320 to 320 before the cut.

~~~js
// A stop for a session that is no longer current must not end the new one.
~~~

## `workers/pub/loop.mjs`

### loop

Above `const API = 'https://api.cloudflare.com/client/v4/accounts';`, lines 1 to 20 before the cut.

~~~js
// The LL-HLS loopback's input, and everything that keeps it empty.
//
// /video/webrtc/ sends a camera through the `loop` instance onto ONE
// RTMPS live input that nothing else uses ("positron-hls-loopback",
// src/provision-loop.sh). Recording cannot be turned off on RTMPS
// (positron-streaming), so every take is a Stream video counted against the
// account's 1000 storage minutes, and a full cap blocks every new live stream.
// So three things delete, none of them waiting on the page:
//
//   1. per take: LOOP_CLEAN_MS after the take ends, the worker deletes it
//   2. a cron every 10 minutes: anything on the input older than LOOP_OLD_MS
//   3. before a take: refused when the account's storage is at or over the
//      ceiling, the LOOP_CEIL var (600 by default, loopCeil below)
//
// 🔴 THE INPUT IS DEDICATED, WHICH IS WHAT MAKES "DELETE EVERYTHING ON IT"
// SAFE. Nothing here lists the account's videos and filters; it asks for the
// videos of ONE input by uid, and deletes those. Any other input's recordings
// are not in the answer at all.
// ⚠️ NOTHING `live-inprogress` IS DELETED. That is the take still running; it
// is deleted on the next pass, once it has become a recording.
~~~

### loop-ceil

Above `export function loopCeil(env) {`, lines 28 to 33 before the cut.

~~~js
/**
 * The ceiling in force: the `LOOP_CEIL` var when it is a number (wrangler.jsonc
 * says 600), else LOOP_CEIL. A var so the guard can be PROVED: set to 0 in a
 * test run, every take must be refused with 507 (2026-10-12). An empty or
 * unparsable var falls back to 600, never to "no ceiling".
 */
~~~

### lifecycle

Above `export async function lifecycle(env) {`, lines 66 to 70 before the cut.

~~~js
/**
 * The input's current video, from the lifecycle URL Stream publishes for it.
 * `videoUID` is null whenever the input is not live, MEASURED 2026-10-12 on
 * positron-cam, so it is read DURING a take and remembered.
 */
~~~

### clean

Above `export async function clean(env, { olderThanMs = 0, uids = [], why = '' } = {}) `..., lines 83 to 91 before the cut.

~~~js
/**
 * Delete what is on the input. `olderThanMs` keeps anything younger (the
 * cron's floor; 0 for a per-take clean), `uids` are deleted whatever the list
 * says (the take's own video, read off the lifecycle while it ran).
 * ⚠️ A video whose `liveInput` is not this input is never touched, even if
 * the API ever answered with one: the check is here, not trusted to the URL.
 * Returns what it did in both directions, because a cleanup nobody is told
 * about cannot be told apart from a leak.
 */
~~~

## `workers/pub/worker.mjs`

### header

Above `import { Container, getContainer } from '@cloudflare/containers';`, lines 1 to 29 before the cut.

~~~js
// positron-pub: /stage/'s film publisher, the two loopbacks under
// the /video/ concept pages, TURN credentials and the device log.
//
//   GET  /ice                          short lived TURN servers, 503 with no key
//   POST /log                          a device reports what it saw
//   GET  /logs[?format=text]           read those reports back
//   POST /logs/clear                   drop them (x-pub-key)
//   POST /cam/whip, DELETE /cam/whip/<id>  /video/webrtc/'s WebRTC
//                                      loopback publish, onto its OWN WebRTC
//                                      input (CAM_WHIP_URL, "positron-cam-whip")
//   /stage/watch /stage/status         /stage/'s own instance: the MIM film on
//   /stage/start /stop (x-pub-key)     WHIP while a viewer holds /stage/watch
//   wss://pub.positron.studio/loop     /video/llhls/'s LL-HLS loopback: the
//                                      camera rewrap on its own instance and its
//                                      OWN input (LOOP_STREAM_KEY), every take deleted
//   GET  /loop/status                  recordings on that input, account storage
//   POST /loop/sweep                   the cron's clean, now (once a minute)
//
// RETIRED 2026-10-13, answering 410: /watch, /status, /start, /stop, /whip
// (the test pattern on the inputs positron-demo and whep-rig, which fed the
// archived /llhls/ and /webrtc/), and /cam, /cam/status (/cam/'s RTMPS camera
// on the input positron-cam). All three inputs were deleted from Stream the
// same day, with the secrets STREAM_KEY, WHIP_URL and CAM_STREAM_KEY.
//
// WHY REFERENCE COUNTING AND NOT sleepAfter ALONE: the Container base class
// sleeps on REQUEST idleness, and ffmpeg publishing generates no incoming
// requests at all — so sleepAfter would happily kill a stream somebody is
// watching. The viewer count is the real signal; the alarm sweep renews
// activity while anyone is connected and stops the publish once nobody is.
~~~

### main

Above `const NAME = 'p1';`, lines 42 to 43 before the cut.

~~~js
// The main instance. Since 2026-10-13 it publishes nothing: it holds the
// device log and the /ice rate limits, and keeps its name so the log survives.
~~~

### main-paths

Above `const MAIN_PATHS = new Set(['/ice', '/log', '/logs', '/logs/clear']);`, lines 50 to 50 before the cut.

~~~js
// The main instance's routes since 2026-10-13, and the ones retired that day.
~~~

### cam

Above `const CAM = 'cam';`, lines 56 to 58 before the cut.

~~~js
// THE CAMERA INSTANCE, which since 2026-10-13 only proxies the WebRTC publish
// (/cam/whip) onto "positron-cam-whip". Its RTMPS camera route, /cam, and that
// input (positron-cam) are gone; the rewrap path it used lives on in `loop`.
~~~

### cam-whip-loop

Above `const LOOP = 'loop';`, lines 77 to 96 before the cut.

~~~js
// /cam/'S WebRTC LEG HAS ITS OWN WebRTC INPUT TOO (CAM_WHIP_URL, "positron-cam-whip",
// provisioned by src/provision-cam-whip.sh, recording off). It borrowed the test
// pattern's WHIP input until 2026-09-30 and was refused with 409 whenever
// somebody watched that pattern. One camera at a time. ⚠️ A SESSION HELD BY A TAB THAT DIED WITHOUT ITS DELETE
// cannot be told apart from a live one: MEASURED 2026-09-30, `/lifecycle` on a
// WebRTC input answers `live: true` with nothing publishing to it, so it is no
// signal here. Such a session blocks the next camera for at most CAM_MAX_MS and
// is then replaced.
// /video/webrtc/'S LL-HLS LOOPBACK: the camera route above on an instance
// of its own (`loop`) and an input of its own ("positron-hls-loopback",
// LOOP_UID, src/provision-loop.sh), so a sweep can delete EVERYTHING on that
// input. The page's 30 s run from when Stream says the input is live, which is
// a few seconds after RTMPS opens (at most 15 s, the page's own wait), so
// LL-HLS has time to settle (2026-10-12, *"extend to 30s"*). LOOP_MAX_MS is
// the worker's own cap under a page that never stops, counted from when ffmpeg
// opened RTMPS, because that is when Stream starts recording: a take is at
// most 50 s of RTMPS whatever the page does, above the page's 30 + 15. LOOP_OPEN_MS bounds
// a session whose publisher never opened (nothing recorded, but it holds the
// input). Every take is deleted by this object LOOP_CLEAN_MS after it ends,
// whoever ended it (loop.mjs).
~~~

### two-runtimes

Above `const pubOn = (Base, NEXT) => class extends Base {`, lines 107 to 118 before the cut.

~~~js
/**
 * TWO RUNTIMES, ONE BODY. `Pub` is the legacy `@cloudflare/containers` class
 * on the `default` scheduling policy; `PubNext` is the same object on the
 * `durable_object` policy, a plain DurableObject driving `this.ctx.container`
 * (research/cf-containers-next-2026-10-07.md). Everything below is shared,
 * and the ONE place they differ is `#c()`, which is how either reaches the
 * container, plus the lifecycle lines marked NEXT.
 * ⚠️ A NEW CLASS AND NOT AN EDIT: Cloudflare's docs say `scheduling_policy`
 * "Cannot be changed after the application is created", so `Pub`'s container
 * application cannot be switched in place. `Pub` stays exported with its own
 * container entry so a rollback is redeploying the previous worker.mjs.
 */
~~~

### env

Above `constructor(ctx, env) {`, lines 125 to 128 before the cut.

~~~js
/**
 * A worker var reaches the container only through `envVars` (legacy) or
 * `ctx.container.start({ env })` (NEXT), both read when the container starts.
 */
~~~

### sndbuf

Above `this.#pass = { PUB_WHIP_SNDBUF: String(NEXT_WHIP_SNDBUF) };`, lines 132 to 134 before the cut.

~~~js
// NEXT ONLY: a bigger UDP send buffer for the WHIP leg, see WHIP_SNDBUF in
// container/server.mjs. 4 MiB is the runtime's wmem_max, MEASURED on the
// test bed (wmem_default 212992, wmem_max 4194304).
~~~

### inactivity

Above `if (ctx.container?.running) ctx.container.setInactivityTimeout(NEXT_IDLE_MS).cat`..., lines 136 to 140 before the cut.

~~~js
// ⚠️ A RESTARTED OBJECT HAS NO INACTIVITY TIMEOUT. The docs: "A Durable
// Object that restarts, for example after a deploy, starts without one",
// and without one "Cloudflare stops the container shortly after the
// Durable Object becomes inactive". So it is set again on every wake that
// finds the container up. Not awaited: no other route waits on it.
~~~

### c

Above `async #c(req) {`, lines 149 to 154 before the cut.

~~~js
/**
 * The one way to the container. Legacy: the base class starts it if needed
 * and forwards. NEXT: start it if needed, wait until server.mjs answers,
 * then forward on the TCP port. Either way a caller gets a Response or a
 * throw, and every caller already treats a throw as "still waking".
 */
~~~

### c-if-up

Above `async #cIfUp(req) {`, lines 161 to 165 before the cut.

~~~js
/**
 * NEXT: forward only to a container that is already up. A stop sent to a
 * container that is gone has nothing to stop, and #c would START one to
 * deliver it. Legacy: the same as #c, as before.
 */
~~~

### boot

Above `async #boot() {`, lines 186 to 193 before the cut.

~~~js
/**
 * NEXT: `start()` "returns before the Container is ready to accept requests",
 * so readiness is ours to poll. `/status` is the cheap route: it spawns
 * nothing. MEASURED on the test bed the same day: ready about 0.83 s after
 * start() on a warm host, about 10 s on the first start after an image push,
 * during which a forward throws "The container is not listening in the TCP
 * address 10.0.0.1:8080".
 */
~~~

### role

Above `#role = null;`, lines 219 to 223 before the cut.

~~~js
/**
 * 'stage', 'cam' or 'main'. ⚠️ TOLD, THEN REMEMBERED: the alarm fires with no
 * request, and an object is not told its own name, so the entry worker stamps
 * every request with x-pub-role and the object keeps the last one it saw.
 */
~~~

### hits

Above `#hits = null;`, lines 233 to 236 before the cut.

~~~js
/**
 * Rate-limit stamps for the past hour, kept in storage so an eviction does
 * not reset them: `whip` and `cam` are times, `ice` is { at, who }.
 */
~~~

### hydrate

Above `async #hydrate() {`, lines 255 to 262 before the cut.

~~~js
/**
 * Read the ring back after an eviction, once.
 *
 * ⚠️ LAZY, NOT IN THE CONSTRUCTOR. A DO constructor cannot await, and doing
 * this in `blockConcurrencyWhile` would make every OTHER route on this
 * object — the WebSocket upgrade, /status, /start — wait on a storage read
 * they do not use. The log routes are the only ones that need it.
 */
~~~

### adopt

Above `async #adoptLegacyLog() {`, lines 271 to 279 before the cut.

~~~js
/**
 * NEXT: THE RING LIVED IN THE LEGACY `Pub` OBJECT'S STORAGE, and a new class
 * is a new object with empty storage. So the first read of the ring on the
 * main instance asks the legacy `p1` object for its lines, merges them by
 * time with anything already here, and remembers that it did. No public
 * import route: the copy happens inside this worker, object to object.
 * ⚠️ The flag is written only after a copy that worked, so a failed one is
 * tried again on the next read rather than leaving the old lines behind.
 */
~~~

### persist

Above `async #persist() {`, lines 296 to 302 before the cut.

~~~js
/**
 * ⚠️ TRIMMED TO FIT, FROM THE FRONT. A DO storage value caps at 128 KiB and
 * LOG_KEEP x LOG_MAX_BODY is 800 KB in the worst case — so a busy device
 * could make every write throw, which would look exactly like the eviction
 * bug this replaced. Drop the OLDEST lines until it fits; the newest report
 * is the one somebody is waiting to read.
 */
~~~

### watch

Above `if (url.pathname === '/watch') {`, lines 319 to 319 before the cut.

~~~js
// ── a viewer (/stage/watch only since 2026-10-13) ───────────────────────
~~~

### fire-forget

Above `if (this.viewers() === 1) this.#startPublish().catch(() => { /* sweep retries */`..., lines 329 to 333 before the cut.

~~~js
// FIRE AND FORGET. Awaiting the publish here delayed the 101 by the
// container's cold start, so the viewer's own onopen did not fire until
// ffmpeg was already running — a connection blocking on a video encoder.
// The alarm sweep retries if this fails, so nothing is lost by not
// waiting for it.
~~~

### loop-cam

Above `const role = await this.#getRole();`, lines 341 to 354 before the cut.

~~~js
// ── the LL-HLS loopback's camera, onto its own input, on its own instance ─
//
// /video/llhls/ records its canvas with MediaRecorder and sends each
// chunk to /loop, which arrives here as /cam; this object POSTs them, in
// order, into its container's camera leg, which rewraps them to RTMPS on the
// loopback's OWN input (LOOP_STREAM_KEY). Only the `loop` instance answers
// this since 2026-10-13, when /cam/'s own RTMPS route was retired.
// plans/plan-cam-llhls.md is the design.
//
// 🔴 REFUSED IN BAND, NOT WITH A STATUS. A browser cannot read the HTTP
// status of a refused WebSocket upgrade, so a 409 there reaches the page as
// a bare close with no reason. The socket is accepted, told
// `{t:'busy', status: 409, error}` and closed with 4409, and the page can
// say why in words. A plain GET answers the same question with a real 409.
~~~

### status-idle

Above `if (NEXT && !this.ctx.container.running && !this.#booting) {`, lines 403 to 406 before the cut.

~~~js
// NEXT: a status read does not START a container nobody is watching.
// The legacy base class did (any forward starts it), so a polling page
// kept a 3 GiB box up for sleepAfter with nothing in it. The shape is
// the one server.mjs answers with when idle, so a reader cannot tell.
~~~

### log

Above `if (url.pathname === '/log' && request.method === 'POST') {`, lines 427 to 440 before the cut.

~~~js
// ── a device reporting what it actually saw ────────────────────────────
// A phone cannot be attached to a debugger from here, and the numbers that
// matter (buffer length, hole seeks) are only observable on the device. So
// the page posts them and this holds a ring buffer. Diagnostic only: no
// secrets, capped hard.
//
// 🔴 IT USED TO SAY "dropped when the DO goes away", AND THAT MADE THE
// WHOLE ENDPOINT A TRAP. MEASURED 2026-09-12: a line POSTed at 02:07:46
// read back immediately and was GONE by 02:08:32 — the DO had evicted and
// an in-memory array went with it. CLAUDE.md advertises this URL as the way
// to get a report off a phone or a headset, so the failure mode was: the
// device ships correctly, the reader sees "(nothing reported)", and the
// obvious conclusion is that the device never sent anything. Somebody then
// debugs the device. The ring is persisted now.
~~~

### ice

Above `if (url.pathname === '/ice' && (request.method === 'GET' || request.method === '`..., lines 491 to 512 before the cut.

~~~js
// ── relay addresses for a network that drops UDP ──────────────────────
//
// 🔴 WHY THIS EXISTS, MEASURED 2026-09-30 ON A PHONE HOTSPOT. Stream's
// WHIP and WHEP answers are `a=ice-lite` with ONE candidate, UDP, and
// nothing over TCP. A TCP candidate munged into a real answer at the same
// address, and at 443, was applied by Chrome and ICE still failed, so
// Stream does not speak ICE-TCP. On a network that drops outbound UDP the
// handshake answers 201 and not one packet of media arrives.
// Cloudflare Realtime TURN over TLS on 443 is the way round: the browser
// reaches the relay over TCP and the relay reaches Stream over UDP from
// inside Cloudflare, and that leg is not billed.
//
// The TURN KEY must never reach a page, because it mints credentials
// without limit. It stays in two worker secrets and this route hands out
// short lived ICE servers minted from it:
//   TURN_KEY_ID          the key's id
//   TURN_KEY_API_TOKEN   the key's bearer token
// Absent, it answers 503 in words and a page carries on without a relay.
//
// ⚠️ RATE LIMITED LIKE /whip, IN THIS OBJECT, because a DO is the only place
// two requests cannot both pass a check. Per address AND overall: a bare
// overall cap lets one caller spend everybody's hour.
~~~

### whip

Above `if (url.pathname === '/whip' && request.method === 'POST') {`, lines 556 to 571 before the cut.

~~~js
// ── a browser publishes, and never sees the key ───────────────────────
//
// WHY THIS EXISTS. A browser can publish WHIP perfectly well —
// `rig/whep/publish.html` has done it from a canvas for months. What it
// cannot do is HOLD THE CREDENTIAL: Cloudflare's WHIP publish URL carries
// the stream key in its path, and a public page cannot keep a secret. That
// is the ONLY reason the ffmpeg container was in this path at all.
//
// WHIP to Cloudflare is single-shot SDP with no trickle (measured, see
// rig/whep/publish.html), so this is one POST of an offer and one answer.
// Media then flows browser <-> Cloudflare directly over ICE/DTLS/SRTP and
// NEVER crosses this worker. A worker cannot carry media and does not have
// to; it carries thirty lines of signalling.
//
// ONLY THE CAMERA INSTANCE SINCE 2026-10-13. The test pattern's /whip (on
// WHIP_URL, the input whep-rig) is retired with that input.
~~~

### location

Above `const loc = up.headers.get('location');`, lines 610 to 613 before the cut.

~~~js
// THE `Location` IS ITSELF A CREDENTIAL on Cloudflare — it addresses this
// session under the same secret path. Handing it back would leak exactly
// what this endpoint exists to hide, so it is kept here behind an opaque
// id and DELETE is proxied.
~~~

### preflight

Above `if (url.pathname.startsWith('/whip') && request.method === 'OPTIONS') {`, lines 644 to 661 before the cut.

~~~js
/**
 * 🔴 THE PREFLIGHT HAS TO COVER `/whip/<id>` AND NOT ONLY `/whip`, AND IT
 * DID NOT, SO THE SESSION TEARDOWN HAS NEVER WORKED FROM A BROWSER ON
 * ANOTHER ORIGIN. MEASURED 2026-09-25 from `http://127.0.0.1:8890`:
 *
 *   Access to fetch at 'https://pub.positron.studio/whip/67b6344…' has been
 *   blocked by CORS policy: Response to preflight request doesn't pass
 *   access control check: It does not have HTTP ok status.
 *
 * `DELETE` is not a simple method, so a cross-origin one preflights, and
 * the OPTIONS for the SESSION path fell through to the 404 below. The POST
 * that opens a session was fine, because its path is exactly `/whip`.
 * ⚠️ **IT SURVIVED BECAUSE THE PATH WAS NEVER DRIVEN.** `/stage/` defaulted
 * to an in-page loopback, so the real publish and its teardown only ran
 * behind a query parameter nobody's harness passed. Removing that default
 * on 2026-09-25 ran this line for the first time and it failed immediately.
 * **A route with no caller is a route with no evidence.**
 */
~~~

### viewers

Above `#camKey() { return this.#role === LOOP ? this.env.LOOP_STREAM_KEY : null; }`, lines 674 to 682 before the cut.

~~~js
/**
 * 🔴 ONLY `watch` SOCKETS ARE VIEWERS. This was every socket the object
 * held, so a camera socket would have counted as somebody watching and
 * started both test pattern encodes (plans/plan-cam-llhls.md section 1).
 * ⚠️ WRITTEN AS "ALL BUT THE CAMERA ONES", not as `getWebSockets('watch')`,
 * because a viewer socket accepted before tags existed is restored untagged
 * after a deploy, and it is still somebody watching.
 */
/** A camera session's input: the loopback's, the only role that takes one. */
~~~

### loop-guard

Above `async #loopGuard() {`, lines 689 to 694 before the cut.

~~~js
/**
 * 🔴 A TAKE IS REFUSED WHEN THE ACCOUNT IS NEAR ITS CAP, so even a cleanup
 * that failed every time cannot fill the 1000 minutes during a demo. And
 * refused when the storage cannot be read, for the same reason: a take
 * nobody can account for is the one this guard exists to stop.
 */
~~~

### loop-ended

Above `async #loopEnded(sid) {`, lines 707 to 712 before the cut.

~~~js
/**
 * A take ended, however it ended (the page's stop, a closed tab, the idle
 * check, the cap). Its clean is queued in STORAGE with the uid read off the
 * lifecycle while it ran, and the alarm comes back LOOP_CLEAN_MS later. No
 * page is involved from here on.
 */
~~~

### end-cam

Above `async #endCam(t, why) {`, lines 841 to 844 before the cut.

~~~js
/**
 * End the camera session: tell the page why, close its socket, stop the
 * container's leg. Every one of the three stops arrives here.
 */
~~~

### stage-whip

Above `const url = this.env.STAGE_WHIP_URL;`, lines 869 to 869 before the cut.

~~~js
// ONE LEG AND NO ENCODE: the pre-transcoded film copied onto WHIP.
~~~

### cam-alarm

Above `if ((await this.#getRole()) === LOOP) return this.#loopAlarm();`, lines 894 to 897 before the cut.

~~~js
// The camera instance has one job here: the camera's two stops that need
// a clock, a socket that went quiet without closing and the length cap,
// checked every CAM_TICK_MS while a camera is live. It never runs the
// viewer sweep below, which is about the test pattern.
~~~

### renew

Above `if (NEXT && this.ctx.container.running) {`, lines 905 to 910 before the cut.

~~~js
// touching the container both checks health and renews its activity
// timeout, so sleepAfter cannot pull the stream out from under a viewer.
// NEXT: there is no request idleness to renew. What stops a container
// there is the object going inactive for NEXT_IDLE_MS, and this alarm
// wakes it every SWEEP_MS; the timeout is set again anyway, because a
// wake after an eviction starts without one.
~~~

### grace

Above `if (NEXT && this.#idleTicks > GRACE_TICKS) {`, lines 931 to 933 before the cut.

~~~js
// NEXT: ONE MORE TICK, THEN THE CONTAINER IS DESTROYED. The publish is
// stopped first and the box goes a sweep later, so ffmpeg has a whole
// SWEEP_MS to close RTMPS cleanly before its container is taken away.
~~~

### retire

Above `async #retire() {`, lines 949 to 967 before the cut.

~~~js
/**
 * NEXT: destroy the container once nothing needs it.
 *
 * 🔴 THE INACTIVITY TIMEOUT DOES NOT RUN WHILE monitor() IS PENDING, AND
 * monitor() IS PENDING FOR THE CONTAINER'S WHOLE LIFE. MEASURED on the test
 * bed 2026-10-07: with monitor() held, the object never left memory (one
 * constructor run in 5.5 minutes) and its container was STILL RUNNING 102 s
 * after the last alarm, against a 60 s timeout; without monitor() the object
 * hibernated between every sweep (13 constructor runs) and the container was
 * gone by the same check. The docs agree: a pending monitor() "prevents
 * eviction for up to 15 minutes", and the timeout counts from eviction. So
 * leaving it to the timeout would keep a 3 GiB box up for up to 25 minutes
 * after the last viewer, where the legacy class's sleepAfter took 10. The
 * sweep decides instead, as it always did; the timeout stays as the floor
 * for a sweep that stopped.
 * ⚠️ AND IT COSTS A VIEWER LITTLE: the publish was already stopped at the end
 * of the grace, so a returning viewer waits on Stream either way, and a fresh
 * start was MEASURED at about 0.83 s to listening on the test bed.
 */
~~~

### ws-message

Above `async webSocketMessage(ws, msg) {`, lines 998 to 1004 before the cut.

~~~js
/**
 * A camera's messages. Text is control, binary is one MediaRecorder chunk.
 * 🔴 THE CHUNKS GO THROUGH ONE PROMISE CHAIN. A DO's input gate does not
 * cover a non-storage await, so two chunks a few ms apart would otherwise
 * race each other into ffmpeg's stdin out of order, and a WebM stream with
 * two clusters swapped is a broken stream.
 */
~~~

### role-first

Above `await this.#getRole();`, lines 1008 to 1009 before the cut.

~~~js
// 🔴 THE ROLE DECIDES THE INPUT (#camKey), and a woken object has
// forgotten it: read it back before anything here can need it.
~~~

### retry-503

Above `let r = null;`, lines 1018 to 1028 before the cut.

~~~js
// ⚠️ A 503 HERE IS THE PLATFORM, NOT FFMPEG. MEASURED 2026-09-30 right
// after a deploy: `There is no Container instance available at this
// time`, and the same instance up 30 s later. So a 503 is asked again,
// four times 3 s apart, while the page is still there to want it.
// ⚠️ LEGACY ONLY IN PRACTICE. That 503 is written by the
// @cloudflare/containers forward, and server.mjs never answers 503 on
// /cam/open. On PubNext #c waits until the server answers before it
// forwards, and a container that is not listening THROWS ("The
// container is not listening in the TCP address 10.0.0.1:8080",
// MEASURED on the test bed) rather than answering 503, so there the
// loop runs once. Kept because Pub still runs this same body.
~~~

### ended-waking

Above `if (this.#cam !== c) {`, lines 1042 to 1046 before the cut.

~~~js
// 🔴 ENDED WHILE THE CONTAINER WOKE. The page closed during a cold start
// (3.7 to 16 s), its close POSTed /cam/stop to a container that had no
// session yet, and the open went ahead anyway: an ffmpeg on the input
// with nobody sending to it. Stop it by sid now rather than leave it to
// the container's 5 s watchdog.
~~~

### ns

Above `const ns = (env, url) => {`, lines 1098 to 1103 before the cut.

~~~js
/**
 * Which runtime answers. `PUB_RT` in wrangler.jsonc is the default, and
 * `?rt=next` or `?rt=legacy` on any request overrides it, so either class can
 * be driven live without moving anybody's viewers. The three instance names
 * are the same on both.
 */
~~~

### scheduled

Above `async scheduled(_event, env, ctx) {`, lines 1168 to 1175 before the cut.

~~~js
/**
 * THE LOOPBACK'S CRON, every 10 minutes (wrangler.jsonc): delete anything on
 * the loopback input older than five minutes, whatever happened to the
 * per-take clean. Run inside the loopback's object so the last sweep is
 * readable at /loop/status, and logged for the dashboard.
 * ⚠️ IT REACHES THE OBJECT ON THE NEW RUNTIME, as /loop does, and only the
 * loop role's /sweep, which starts no container.
 */
~~~

<a id="ice-room"></a>

## `/ice?room=`: credentials counted per room

Added 2026-10-22 for `/room/video/` (`plans/plan-video-room.md` §8a). Per address alone, the 21st person
behind one public address in an hour is refused, and many people share one (an office, a café, a mobile
carrier's NAT). With a room name the rule is 60 an hour for the room and 40 per address; without one it
is 20 per address as before; 120 an hour overall either way, which is what bounds somebody inventing room
names. The rule is `iceVerdict` in `workers/pub/ice-limit.mjs`, pure, tested by
`node workers/pub/ice-limit-test.mjs` (6 checks, 4 negative controls). Not deployed: the live `/ice` ignores
`room` until it is.
