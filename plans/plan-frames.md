# plan-frames: one picture stack, from the grey surface to strobe

Status (2026-11-02): open. A plan only, nothing built beyond `rig/pico/firmware/fx.c` (22 of 22 in `fx-test.mjs`, built with emcc 2026-11-02).

Related: `plan-bends.md`, `plan-crossmodal.md`, `plan-screens-odd.md`, `plan-pi-hdmi.md` section 7 (televisions), `plan-pi-oled.md`, `plan-pico.md`. Code: `rig/pico/firmware/fx.c`, `lessons/rig-pico-fx.md`.

Joined on 2026-11-02 from `plan-screens`, `plan-fx-chain`, `plan-strobe`, written in a claude.ai chat between 2026-10-24 and 2026-11-02 against the repository as it was on 2026-10-22, and kept word for word below, one section each. A reference to one of those names means the section of that name here.

## plan-screens: one fx, many screens

Status: plan, 2026-10-28. Nothing here is built. Today there is one screen, the
SSD1306 at 128x64, 1-bit, and `fx.c` is written for its page-major buffer.

**Goal.** Effects are written once. A new screen (e-ink, LED matrix, addressable
LEDs, a bigger OLED) costs one small driver, never a second copy of the effects.

---

### 1. The split

Three layers, and the line between them is the whole plan.

| Layer | Knows about | Does not know about |
|---|---|---|
| **Sources** (ui.c, generators, converters from audio) | the surface size | the screen |
| **Effects** (fx: feedback, life, mirror, bit rot, modulate) | an 8-bit grey surface, any `w` x `h` | pages, colours, refresh |
| **Drivers**, one per screen type | its own bytes, timing and faults | how the picture was made |

#### 1.1 The surface

```c
typedef struct {
  int w, h;
  uint8_t *px;       /* 8-bit grey, row major, w*h bytes */
  uint8_t *scratch;  /* caller-provided, w*h bytes, so fx never allocates */
} fx_surface;
```

Grey, not 1-bit, because every target can be reached from it: 1-bit panels
dither it, e-ink maps it to 2 or 4 levels, LEDs map it to brightness. Colour is
a palette in the driver, so effects stay colourless.

#### 1.2 The driver

```c
typedef struct {
  const char *name;
  int w, h, levels, colour, max_fps, partial;   /* capabilities */
  void (*pack)(const fx_surface *s, uint8_t *out, int dither);
  void (*bend)(uint8_t *out, int kind, int amount, uint32_t *rng);
} fx_sink;
```

- `pack` turns the surface into exactly the bytes the device receives.
- `bend` holds the faults that only make sense for that device. **Device bends
  live in drivers; generic effects live in fx.** Each screen keeps its own
  circuit to bend.

#### 1.3 What moves where, from today's fx.c

| Today in fx.c | Goes to |
|---|---|
| feedback, grey feedback, life, mirror, bit rot, roll, lfsr, hold | fx, rewritten on `fx_surface` |
| dithering (threshold, Bayer 4, Bayer 8) | a shared `pack` helper every 1-bit and 2-bit driver uses |
| page slip, stale pages, column offset | the SSD1306 driver's `bend` |
| font table as pixels | a source, not an effect |

---

### 2. Screens, and their native bends

| Screen | Size, levels | Native bends | Notes |
|---|---|---|---|
| SSD1306 OLED (today) | 128x64, 1-bit | page slip, stale pages, column offset, start line, hardware scroll | I2C or SPI |
| E-ink, small | 250x122 or 296x128, 2 levels | skip the full refresh (ghosting), partial windows, deliberately slow frames | seconds per full refresh |
| E-ink, 4.2" | 400x300, 4 grey levels | the same, plus wrong grey waveform | first real grey target |
| E-ink, 7.5" | 800x480, 4 grey levels | the same | 384 KB of grey: render in bands (§4) |
| CRT TV, composite | 720x576 interlaced (PAL), colour | real analogue faults (snow, ghosting, rolling, tearing) via an RF modulator; overscan crops the edges | Pi 4's AV jack or Pi 1's RCA; plan-tv |
| Palm Z22 | 160x160, 12-bit colour | slow frames, pen input back | over USB serial from the Pi; plan-palm-z22 |
| TFT, ILI9341 | 240x320, colour (RGB565) | window address off (shear), byte-order or pixel-format swap (colour garbage), MADCTL flips, hardware vertical scroll, gamma tables, tearing without TE sync | first fast colour target; SPI; often with resistive touch |
| LED matrix, HUB75 | e.g. 64x32, colour | scan-row addressing glitches, brightness and gamma | power budget matters |
| Addressable LEDs (WS2812) | any small grid | one-pixel data shift down the chain, serpentine order mistakes | gamma, current limit |

---

### 3. The patchbay

A screen is a node with a `frame` input port. Its `shape` is the driver's
capabilities: `{ w, h, levels, colour, fps, partial }`. Sources render at that
size, and the connect-time shape check works as it does for audio: a 30 fps
feedback chain linked to a 0.5 fps e-ink panel is refused or flagged, not
discovered on the wall.

`frame` becomes the fourth medium beside `midi`, `audio` and `clock`.

---

### 4. Memory

| Surface | Grey bytes | Fits RP2040 (264 KB)? |
|---|---|---|
| 128x64 | 8 KB | yes |
| 296x128 | 37 KB | yes |
| 240x320 (ILI9341) | 75 KB grey, 150 KB as RGB565 | grey yes; RGB565 frame better streamed in bands |
| 400x300 | 120 KB | tight with scratch |
| 800x480 | 384 KB | no |

Big panels render in horizontal bands: the surface is one band, effects run per
band, the driver packs and sends band by band. Feedback that moves pixels
between bands needs the whole frame, so on a Pico it is limited to small
panels; on the Pi and in the browser it is not.

---

### 5. The preview

The browser preview unpacks each driver's real output and draws it as that
device: OLED dots, e-ink grey with its slow refresh and ghosting, LEDs with
glow. What is tested is what would be sent, not a separate drawing.

---

### 6. Order

1. Refactor fx.c onto `fx_surface`; move the SSD1306 packing and page bends
   into `sink_ssd1306.c`. The 22 checks in `fx-test.mjs` must pass unchanged
   through the new path, plus one byte-for-byte check against today's output.
2. Preview with a driver picker.
3. First e-ink: a small black and white panel on the ESP32 or the Pi, with the
   skip-full-refresh bend.
4. A 4-grey e-ink, to exercise grey packing.
5. ILI9341, the first colour screen: palette packing to RGB565, fast enough for
   feedback.
6. An LED matrix, for colour at low resolution.

### 7. Open questions

- Does `pack` run on the device or upstream? On the Pico it must be local; for
  a Pi-driven panel it could arrive packed over the relay.
- Partial refresh and ghosting differ by panel revision. Treat every e-ink
  bend as MEASURED only after it has been seen on the actual panel.
- Colour effects later: a palette per driver, or a second surface channel?

### 8. Added 2026-11-01

- `weak.c` (built 2026-10-31, `positron-weak/`): a weak digital TV signal on
  grey, RGB or RGBA frames of any size. It already works on a generic surface,
  so it is the first operator written the way §1 asks.
- Composite CRTs and the Palm Z22 join the screen list (§2): plan-tv,
  plan-palm-z22.

## plan-fx-chain: Hydra-like chains for the frame

Status: plan, 2026-10-28. Builds on `fx.c` and plan-screens. INFERRED unless READ.

**Goal.** Describe a picture as a short chain, the way Hydra does, and run the
same chain byte-for-byte in the browser, on the Pi and on the Pico.

### 1. What is missing from fx.c

READ: fx has feedback (move, zoom, turn), or/xor/and, threshold, mirror, roll,
slip. Missing, in order of value:

1. **Modulate**: displace one buffer by another. Hydra's signature move.
2. **Generators**: `osc` (stripes), `noise`, `voronoi`, `shape`.
3. **Four buffers** `o0`..`o3`, so chains can mix.
4. `kaleid` (n-fold), `pixelate`, `repeat`, `mask`.
5. From Lumen: **scan-locked oscillators** (cycles per line, per frame).
6. From Lumen: **snapshots and morph**, parameter sets interpolated on an XY pad.

All on `fx_surface` (grey), so they work for every screen.

### 2. A chain as bytecode

```
osc(8).modulate(noise(3),4).kaleid(4).out(o0)
```

compiles, in the browser, to a few bytes of opcodes and arguments. The wasm and
the Pico firmware run an interpreter over them. Reasons:

- one chain is one patchbay message, small enough for the relay;
- the Pico never parses text;
- the same seed and bytes give the same frames everywhere, so tests compare
  hashes.

### 3. Parameters as ports

Every numeric argument can be a `value-in` port instead of a constant, so a
knob, a hand (plan-hand) or audio loudness (plan-crossmodal) drives it.

### 4. Snapshots

A snapshot is the chain plus its argument values. Morph interpolates arguments
of two snapshots with the same chain shape; chains of different shape cross-fade
the outputs instead.

### 5. Order

1. Modulate and three generators in C, with tests (identity: modulate by an
   all-zero buffer is no change; negative control).
2. Four buffers.
3. Bytecode and the interpreter, with a browser compiler and hash tests.
4. Snapshots and morph.
5. Scan-locked oscillators.

### 6. Open questions

- Text syntax: a Hydra subset, or a patchbay-native form?
- Pico RAM for four grey buffers at 128x64 is 32 KB, fine; at larger screens,
  four 1-bit buffers may be the limit.

## plan-strobe: stills, strobe and glitch as patchbay parts

Status (2026-10-30): a plan, nothing built. Prompted by STROBFY (an iPhone app,
Instagram post 2026-10-30): photos turned into a strobing animation with
frame-interval timing, random blinks, flashes and blanks, and black-and-white,
grain, scanline, pixelation and slice effects. INFERRED unless READ.

**Goal.** The same look, but taken apart into patchbay nodes, so any effect can
be triggered by anything (chance, the clock, music, a hand, an alert) and shown
on any screen. Positron has little for still images so far; this adds a source
for them.

### 1. Three kinds of node

1. **Sources** (frame out): `stills`, and anything else that makes frames (the
   Pi camera, fx generators).
2. **Operators** (frame in, frame out), each with value ports for amount or a
   trigger.
3. **Triggers and signals** (value out): `chance`, clocks, audio onsets, MIDI
   notes, knobs, a pinch, the air-raid state.

Any trigger into any operator; any chain into any screen. STROBFY's percentages
are one kind of trigger, not part of the effects.

### 2. The `stills` source

- A list of images, advanced by a clock (STROBFY: 70 ms a frame) or by any
  trigger.
- Decoded once to grey surfaces at the target screen's size
  (`plan-screens.md` §1.1): in the browser with `createImageBitmap`, on the Pi
  with an image decoder.
- For the Pico: converted on upload to the screen's size and stored ready to
  show; the Pico never decodes a JPEG.
- Order: in sequence, shuffle bag, or random; seeded.

### 3. Operators

| STROBFY setting | Operator, on the grey surface | Relation to fx today (READ: fx.c) |
|---|---|---|
| Kinetic jitter | small random move or turn | the feedback transform, used without feedback |
| B&W contrast | a contrast curve before dithering | new, small |
| Film grain | seeded noise added | near `fx_bitrot`, but grey |
| Scanlines / VHS | darken alternate rows, slight horizontal smear | new |
| Pixelation bursts | `pixelate(n)` | planned in plan-fx-chain |
| Slice glitch | horizontal bands shifted sideways | `fx_slip`, generalised from 8-row pages to any band height |
| Double blink | repeat the last frame | `fx_hold` |
| White flash | fill white | new, trivial |
| Blank shutter | fill black | new, trivial |

The frame-level three (blink, flash, blank) form one node, `strobe`, with three
trigger ports.

### 4. Order in the chain

1. move (jitter)
2. tone (contrast, grain, scanlines)
3. structure (pixelate, slice)
4. frame events (`strobe`), last before the screen

### 5. Triggers

- `chance(p, seed)`: a seeded random event per frame, STROBFY's percentages.
- `clock.ms(n)`, or MIDI clock so the strobe follows the music.
- Audio onsets: a kick fires the white flash (plan-crossmodal).
- Strudel notes (plan-strudel-source), knobs, a pinch (plan-hand), the alert
  state (plan-kcmd-channel).

### 6. As code (plan-bay-code)

```js
clk = clock.ms(70);
img = stills("dump/*.jpg").step(clk);
chain = img.to(fx.jitter).to(fx.contrast(0.95)).to(fx.grain(0.2))
           .to(fx.scanlines(0.35)).to(fx.pixelate).to(fx.slice).to(strobe);
chance(0.15).to(fx.jitter.amount);
chance(0.15).to(fx.pixelate.burst);
chance(0.15).to(fx.slice.burst);
chance(0.40).to(strobe.double);
chance(0.20).to(strobe.white);
chance(0.20).to(strobe.blank);
chain.to(screen("pi-1:panel"));

kick.to(strobe.white);   // one random trigger swapped for the music
```

### 7. Screens and recipes

- Every operator works on the grey surface, so the same chain drives the OLED,
  a TFT, HDMI or e-ink through their drivers (plan-screens).
- Every `chance` is seeded: photos, chain and seeds are a recipe that replays
  identically (plan-recipes).
- Recording in the browser: frames to video with MediaRecorder; elsewhere, the
  recipe instead of a file.

### 8. Safety

Strobing at these rates (70 ms frames, white flashes) can trigger seizures in
people with photosensitive epilepsy. A shown piece carries a warning; a
`strobe` node has a rate limit setting for public screens. MEASURE flash rates
against published flash-safety guidance before showing it publicly.

### 9. Order

1. `stills` source and the grey operators in C beside fx, with tests (identity
   at amount 0; negative control).
2. `strobe` node and `chance` triggers.
3. A browser page: drop photos, the STROBFY-style chain, a full-size view and an
   OLED 128x64 view.
4. Triggers from MIDI clock and audio onsets.
5. Recording and recipes.

### 10. Open

- Colour: STROBFY is black and white; colour would need the second surface
  channel or palette question from plan-screens §7.
- Pico storage for stills at larger screen sizes.
