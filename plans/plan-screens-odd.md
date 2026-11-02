# plan-screens-odd: a Palm Z22, and a Pi camera filming its own screen

Status (2026-11-02): open. A plan only, nothing built, no hardware touched.

Related: `plan-frames.md`, `plan-pi-hdmi.md`.

Joined on 2026-11-02 from `plan-palm-z22`, `plan-camera-feedback`, written in a claude.ai chat between 2026-10-24 and 2026-11-02 against the repository as it was on 2026-10-22, and kept word for word below, one section each. A reference to one of those names means the section of that name here.

## plan-palm-z22: a 2005 Palm as a small screen and stylus on the patchbay

Status (2026-10-31): a plan, nothing built. READ from reviews, the Linux USB
Visor HOWTO and Ubuntu's Palm Z22 page; INFERRED where marked.

**Goal.** The Palm Z22 driven by the Pi over USB: a 160x160 colour screen for
frames, a stylus as a pointer source, charged from the same cable. No custom
firmware: a small Palm OS app instead.

### 1. The device (READ)

- Palm OS Garnet 5.4, 200 MHz ARM, 32 MB, colour 160x160, 12-bit (4,096 colours)
- IrDA and mini-USB; no SD slot, Bluetooth, Wi-Fi or headphone jack
- 900 mAh lithium-ion battery, internal, not user-removable
- memory is non-volatile flash: a flat battery loses nothing

### 2. Charging

READ: the USB cable charges the battery; the included AC adapter, also with a
mini-USB plug, charges faster. So the Pi's USB port charges it while connected.

A twenty-year-old battery may no longer hold a charge (owners report it). Then:
run it powered from the cable, or replace the cell, which means opening it and
soldering (INFERRED from similar Palm repairs; check a Z22 teardown first).

### 3. Talking to it from the Pi (READ)

- Linux's `visor` USB serial driver supports all Palm USB devices: the Z22
  appears as `/dev/ttyUSB0` and `/dev/ttyUSB1`.
- `pilot-link` (`pilot-xfer`) lists and installs apps over that link. So the Pi
  can install our app; no Windows HotSync needed.

### 4. Custom firmware: not needed

The Palm OS ROM is closed, and I found no Linux or custom ROM for the Z22.
Instead, a small Palm OS app (a `.prc`), written in C:

- receives frames over the USB serial link and draws them
- sends stylus position and pen up/down back
- toolchain: the Palm OS SDK with a gcc-based Palm toolchain (prc-tools), which
  runs on Linux (INFERRED: check which builds still work today)
- open question: exactly how a Palm OS 5 app opens the USB link for its own
  serial traffic outside HotSync. Read the SDK's Serial Manager documentation
  before writing anything.

### 5. On the patchbay

| Node | Port | Medium | Shape |
|---|---|---|---|
| `pi-1:palm` | frame in | `frame` | `{ w: 160, h: 160, levels: 4096, colour, fps }` (plan-screens) |
| `pi-1:palm` | stylus out | `pointer` | `{ rate, points: ['pen'] }` (plan-hand) |

- A screen driver in plan-screens' sense: grey or palette surface to the Palm's
  colour format; 1-bit frames as a fast mode.
- The stylus is a pointer source like a finger: into `demo/draw`, MIDI, fx
  parameters.

### 6. Speed (INFERRED, MEASURE)

A 1-bit 160x160 frame is 3.2 KB; 8-bit is 25.6 KB. USB full speed is far more
than that, but the Palm's side will be the limit: expect a few frames a second
at 8-bit, more at 1-bit. Measure before designing pieces around it.

### 7. Order

1. Charge it on the Pi's USB; check the battery holds.
2. `visor` and `pilot-xfer -l` from the Pi: list its apps.
3. Toolchain: build and install a "hello" app with `pilot-xfer`.
4. The serial link from inside the app: echo bytes with the Pi.
5. Frames in, measured fps; then stylus out.
6. The `pi-1:palm` node.

### 8. Also

- **IR:** a Pi with an IR transceiver could talk IrDA to it too: slower, but
  cable-free.
- **Emulators:** Palm OS emulators exist for developing the app without risking
  the device (INFERRED: check which emulate OS 5 devices).

### 9. Added 2026-11-01

- **Its Connection preferences** offer PC, Modem and Local Network. For the Pi:
  "Connect to: PC", via the cable.
- **Two ways to talk:** raw serial (§4, simplest), or TCP/IP over PPP with
  `pppd` on the Pi. The Z22 ships without Palm's networking library; a
  "Palm Z22 Network Enabler" on palmdb.net adds it (install by HotSync, soft
  reset). Only worth it if the Palm should reach the relay as a network client.
- **A zero-code first test:** `agetty` on the Pi on the Palm's USB serial port,
  and a Palm OS 5 serial terminal app on the Palm. If text appears, cable,
  driver and link all work, before any app is written.
- **From the M1:** Palm's own Mac software does not run on Apple Silicon, and
  macOS has no `visor` driver. Develop on the M1 (toolchain in a Linux VM, an
  emulator); talk to the device from the Pi. If it must be the M1, a Linux VM
  with USB passthrough (UTM). Docker on macOS cannot pass USB through.

## plan-camera-feedback: a Pi camera looking at its own screen

Status (2026-10-30): a plan, nothing built. Builds on `fx.c`, `plan-screens.md`
and the Pi's `rig/board/camera.mjs`. INFERRED unless READ.

**Goal.** Real, physical video feedback, the Paik, Vasulka and Sandin kind: the
camera films the screen, the picture goes back onto the screen, and the camera's
position, angle and focus become the instrument.

### 1. The loop

```
Pi camera (rpicam-vid, raw YUV, small) → take the Y plane (grey)
  → warp: the screen's four corners in the camera image → the screen's pixels
  → fx_surface (grey) → optional fx (bends, threshold, mix with a source)
  → screen driver (dither, pack) → the screen → light → the camera
```

The **Y plane is already a grey surface** (`plan-screens.md` §1.1), so the
camera fits the fx design without conversion.

READ: `camera.mjs` spawns `rpicam-vid` and gates the camera behind a key with an
idle stop; `/dev/video11` is shared with the shader output. Keep both rules.

### 2. Physical controls

The digital feedback in `fx.c` has move, zoom and turn as numbers. Here they are
the camera:

- **zoom:** distance to the screen
- **turn:** rotating the camera
- **move:** shifting it off-centre
- **blur and decay:** focus, exposure, and the screen's own glow

The warp's calibration (the four corners) is the "neutral" position; moving the
camera away from it is playing.

### 3. Screens

| Screen | What it adds |
|---|---|
| SSD1306 OLED, 128x64 | high contrast, tiny: the camera needs a macro distance; 1-bit dither makes grain |
| ILI9341 TFT | colour and speed; the first screen where the loop can run near camera frame rate |
| HDMI monitor | the classic large loop; the Pi's own output |
| e-ink | the slowest loop possible: seconds per step, ghosting carries memory |

### 4. Things that will happen, and are material

- **Loop latency** (camera exposure, processing, the screen's transfer and
  refresh) is the feedback's delay. INFERRED for the OLED: at 400 kHz I2C a
  1024-byte frame takes about 25 ms to send. MEASURE the whole loop with a flash
  test: light one frame, count frames until the camera sees it.
- **Rolling shutter against the screen's refresh** gives bands and moiré.
- **The OLED's 1-bit dither** filmed and re-dithered gives grain that grows.
- **Automatic exposure** chases the loop. Lock exposure and gain on the camera
  for repeatable behaviour; leave them free for drift.

### 5. Order

1. Camera Y plane to the browser preview at 128x64, no screen: check the warp.
2. Corner calibration: click the four corners in a preview page; store them.
3. The OLED loop on the Pi, no fx; MEASURE loop latency and frame rate.
4. fx in the loop: threshold, bends, mixing a source in.
5. ILI9341 and HDMI loops.
6. The loop's parameters as patchbay ports: exposure, threshold, mix.

### 6. Open

- Which screen the Pi drives directly today, and which goes through the Pico.
- Camera module and lens: focus distance for a 0.96" or 1.3" OLED.

### 7. Added 2026-11-01

The CRT is the classic feedback screen: scanlines, phosphor glow and 50 Hz
interlace are built in. A Pi camera pointed at a composite TV driven by the Pi
(plan-tv) is the most traditional version of this loop.
