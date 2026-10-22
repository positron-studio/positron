# Workers lessons: sfu

The reasons behind `workers/sfu/worker.mjs` (positron-sfu, sfu.positron.studio).

<a id="header"></a>

## `worker.mjs` header

Built 2026-10-22 for `/room/video/` (split 2026-10-22 into `/room/present/` and `/room/stage/`; `/room/video/` is gone) (`plans/plan-video-room.md`). Cloudflare Realtime SFU, app
`8c2a974b...`, the same app the retired `elektron-rtc` used.

- **Not a proxy.** The old worker forwarded `/cf/*` to the SFU behind one shared token, which a public page
  cannot keep. Cloudflare's own advice: *"Avoid an unrestricted SFU proxy that lets a browser select arbitrary
  sessions, publications, or destructive operations."* So five calls, each under `/room/<room>/`.
- **The proof.** A session is created for a room and returned with `HMAC(SFU_PROOF_KEY, room + session)`. Every
  later call on it must carry that proof, and a pull must carry the publisher's proof for the same room. So a
  tab can only touch its own sessions and only pull what was published in its own room. The room code is the
  gate, as on the relay: anybody with the link is in. `SFU_PROOF_KEY` was generated into the worker and is kept
  nowhere else; rotating it only makes the proofs already handed out stop working.
- **Close is forced**, so a tab that is leaving does not have to finish an SDP exchange.
- **Origin** is the site or a local dev server; a script with no Origin is let through, as edgecast does, which is
  not security (a script sends what it likes).
- **No rate limit yet.** A caller can make sessions; they cost nothing until media flows, and an unconnected
  session expires. A per-room cap belongs in a Durable Object if it is ever needed.
- MEASURED 2026-10-22 on the deploy: `GET /` 200; a session 201; publish with no proof 403, with another room's
  proof 403; a pull naming a forged publisher proof refused in words; a request from another origin 403. Four
  Playwright tabs with fake cameras through it: every tile playing in 5.0 s, routes `srflx`.
