# plan-cv-app: a small app that sends a musician's control signals, and the same core at ECCM

Asked 2026-11-15: *"so we need a positron client app a la ../visualia app for osc / udp etc? noed is not portable for
musicians..."*, then *"yea"*. For "Play My Synth": three musicians in Ukraine send control signals (CV) to ECCM's
hardware in Tallinn. MEASURED marks a number taken today, READ a fact from code or a document, INFERRED a reasoned
claim nobody has tried.

## 0. The short answer

**Build it, as a Tauri app on the pattern of visualia's `apps/pool-app`: one Rust core, a small window around it, and
the same core as a terminal program on the Pi at ECCM.** The browser cannot open a UDP socket or listen for OSC, and
Node is not something to hand a musician. The wire format is settled by today's measurements: **batches of 10 samples,
over plain UDP, with the WebSocket as the fallback**. Before the app, a half-day step gives the musicians something with
nothing to install: **the relay accepts OSC straight from Max, Pure Data or SuperCollider**.

## 1. What the measurements settled (v2in `plans/plan-cv-relay-test.md`, 2026-11-15)

All on emulated lines (netem in OrbStack containers, one Mac), not on a real line from Ukraine.

| line | UDP, batch 10, p99 | data channel, batch 10, p99 | WebSocket, batch 10, p99 |
| --- | --- | --- | --- |
| 17 ms, 0.5 % loss | 30.9 ms | 31.6 ms | 55.5 ms |
| 25 ms, 2 % loss | 42.8 ms | 43.0 ms | 121.1 ms |
| 35 ms, 5 % loss, 2 s cuts | 61.5 ms | 437.3 ms | 322.3 ms |

MEASURED, per sample, including the 0 to 9 ms a sample waits for its batch.

- **UDP is the only transport that holds on a bad line.** A 2 s cut costs 2.2 s and the next sample is on time.
- **The browser's data channel is as good as UDP between cuts once batched** (unbatched it queued without bound, because
  SCTP congestion control throttles 1,000 messages a second, INFERRED from a packet capture through DTLS). After a cut it
  takes 4 to 10 s to recover.
- **The WebSocket is a fallback for a good line only.** TCP resends, so one loss delays everything behind it.
- **Batching 10 costs 4.5 ms on average** (up to 9 ms) at 1 kHz, and is what makes the data channel usable.

So the app's reason to exist is UDP: it is what the browser cannot do and what the numbers say to use.

## 2. The pieces

```
musician's laptop                                   relay (Tallinn)            ECCM
┌──────────────────────────────┐                   ┌──────────────┐          ┌──────────────────────────┐
│ Max / Pd / SC ── OSC ──┐     │                   │              │          │ positron-cv recv (Pi)    │
│ MIDI controller ─ MIDI ┼─> core ── UDP frames ──>│ cvrelay      │─ UDP ──> │ playout buffer, fixed    │
│ test signal ───────────┘     │   (WS fallback)   │ (v2in today) │          │ delay -> DAC -> CV jacks │
│ window: meters, line, key    │                   └──────────────┘          └──────────────────────────┘
└──────────────────────────────┘
```

1. **`cv-core`** (Rust, no I/O, like `pool-core`'s `core.rs`):
   - frames byte for byte as `web/cvtest/frame.mjs` in v2in: `DATA` (type 1) and `BATCH` (type 7, a 16 byte head, k,
     then per sample an i32 clock offset in microseconds and n float32; 380 bytes at k 10 and 8 channels, READ);
   - the batcher, the clock estimator (the median offset of the fastest third of the last 120 pings, READ), the playout
     buffer (a fixed delay, linear interpolation between samples, hold on a gap);
   - builds for wasm32 too, so a web page could share it later (`pool-core` already does, READ).
   - **Golden byte vectors** checked into both repositories, so the JavaScript and the Rust cannot drift.
2. **`native`**: a UDP socket (tokio), the WebSocket fallback (tokio-tungstenite), OSC in on a local UDP port (the
   `rosc` crate, INFERRED as the choice), MIDI in (`midir`, which covers CoreMIDI, Windows MIDI and ALSA, INFERRED), the
   sender key, reconnects.
3. **The app** (Tauri 2, one window, our HTML): 8 channel meters, the source of each channel (OSC address, MIDI CC,
   test signal), the room key pasted from the link we send (kept in the keychain), and the line: connected or not, round
   trip, loss, the buffer it needs. A **Line test** button runs the same test as the page.
4. **`positron-cv`**, the terminal program, both directions:
   - `send`: for a Pi or a Pico-less sender, and for tests;
   - `recv`: on the Pi at ECCM, the playout buffer and the DAC. Which DAC is open (section 6); with an audio interface
     such as an ES-8 it is the `cpal` crate at 48 kHz, with an MCP4728 it is I2C.

### The OSC addresses

`/cv/<1..8> f` sets one channel, `/cv ffffffff` sets all eight. Values 0 to 1, or -1 to 1 with `/cvb`. One sample a
millisecond goes out whatever the OSC rate is: the core holds the last value, so a patch sending at 200 Hz still
produces a 1 kHz stream, and one sending at 5 kHz is decimated. INFERRED: this is what a Max user expects, and it keeps
the wire rate fixed.

## 3. Option 0, first: OSC straight to the relay (half a day)

Nothing to install for anybody already in Max, Pure Data or SuperCollider: they send OSC to the relay over UDP, to a
port and an address we give them.
- The relay stamps each message with its own arrival time and a sequence number, then forwards it as frames like any
  sender's.
- **What it cannot do:** count loss on the way in (OSC has no sequence number), or remove the line's jitter (the time is
  the relay's, not the musician's), and it has no key except the source address and a shared secret in the OSC address.
  So the jitter of the line lands on the voltage.
- Worth it as the thing to rehearse with in January while the app is built, and as the comparison that shows what the
  app buys.

## 4. Where it lives

- **positron**, by the rule in CLAUDE.md: a device making the signal live from a description is positron.
- **`rig/cv/`**, beside `rig/route-core/` (native code built in a container, READ `LAYOUT.md` row `rig/`). The app is
  not hardware we own, but the receiver at ECCM is, and the core is shared; a top-level `apps/` would be a new kind of
  folder, which `LAYOUT.md` prices before anyone adds one.
- **The relay stays in v2in** until Tarmo's team decides; the frame format's golden vectors are the contract between
  the two.

## 5. Building and shipping

- **Not on this laptop.** ThreatLocker kills locally built binaries and unapproved app bundles (READ `plans/plan-studio.md`
  §0, memory). visualia builds its app on the M1. Here: GitHub Actions with a matrix (macOS arm64 and x64, Windows x64,
  Linux x64), via `tauri-action` (INFERRED), plus the Pi's arm64 `positron-cv` in an arm64 container.
- **Windows is new.** visualia's app is Apple Silicon only so far (READ). The musicians in Ukraine most likely use Windows
  laptops (INFERRED, ask them).
- **Signing:**
  - macOS: ad hoc works on a machine where the user right-clicks Open; a Developer ID (99 USD a year) and notarisation
    remove the warning. visualia hit the ad hoc bundle seal problem and fixed it (READ `worker-app.md`).
  - Windows: unsigned triggers SmartScreen ("More info", "Run anyway"). A code signing certificate or Azure Trusted
    Signing removes it (INFERRED, prices unchecked).
- **Updates:** Tauri's updater with our own key, as visualia does (READ), from R2.
- **Size:** about 4 MB (visualia's is 3.6 to 4.2 MB, READ); UDP, OSC and MIDI crates add little (INFERRED).

## 6. Steps and costs (INFERRED)

| step | what | cost |
| --- | --- | --- |
| 0 | OSC straight to the relay (section 3), tried from Pure Data on this Mac | half a day |
| 1 | `cv-core` with the golden vectors, `positron-cv send` and `recv`, run against the relay under netem | 1 to 2 days |
| 2 | OSC and MIDI in, the WebSocket fallback | 1 day |
| 3 | the Tauri window, the key, the line test | 1 to 2 days |
| 4 | CI builds for macOS, Windows, Linux, the Pi; signing decided | 1 day plus the certificates |
| 5 | `recv` on the Pi with the DAC at ECCM, measured end to end with a scope or an audio capture of the CV | 1 day, needs the DAC |
| 6 | the three musicians install it and run the line test from Ukraine | their half hour |

About a working week to step 5, before the certificates and the DAC.

## 7. Not settled

- **Which DAC at ECCM**: ES-8 or ES-9 through an audio interface (24 bit, DC coupled), or an MCP4728 on the Pi (12
  bit, about 3 cents), positron `research/cv-over-network-2026-11.md` has the prices. Decides how `recv` drives it.
- **What the musicians play from**: Max, Pure Data, a hardware controller, a modular with a CV to MIDI or CV to USB
  interface. Decides whether OSC or MIDI in matters more, and whether a CV input on their side (an ES-9's inputs) belongs
  in the app.
- **Windows or not**, and whether anybody pays for signing.
- **The relay's home**: v2in (Tarmo's team, not asked yet) or a small server of our own in Tallinn.
- **A cut on the data channel** still takes 4 to 10 s to recover; the app avoids it with UDP, the browser page does not.
  `maxPacketLifeTime` near the playout delay was the best of three single runs and is untried in Chrome.
- **No real line.** Every number above is emulated; run 3 from Ukraine is still the measurement that matters.
