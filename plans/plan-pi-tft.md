# plan-pi-tft: a 2.4" ILI9341 colour screen on the Pi, as a board node

Status (2026-11-02): open. A plan only. Nothing is bought, wired or run; no Pi was reached for it.

Related: `plan-pi-oled.md` (the 1-bit panel on the same board, whose pins this keeps clear), `plan-frames.md` (the
grey surface and fx chains this screen is the first colour target of, its section on ILI9341), `plan-pi-hdmi.md`
(the Pi's other screens, the `hdmi-scan` path).

> Asked 2026-11-02: *"can pi drive https://www.oomipood.ee/product/tft_display_24_320x240_rgb_33v_spi_ttl"*, then
> *"write to plan"*, and *"how many colors?"*.
>
> Labels: **MEASURED** (on named hardware, by this repo), **READ** (a file here, or the shop page read 2026-11-02
> through a summarising fetch), **INFERRED** (general knowledge of the part, or arithmetic, checked by nobody).
> Nothing in this plan is MEASURED.

## 0. Verdict

**Yes.** The module is an ILI9341 on 4-wire SPI (READ, shop page), the most common small colour TFT on a Raspberry Pi.
The board (Pi 4 Model B, Debian 13 trixie with Raspberry Pi OS packages, MEASURED 2026-10-11, `plan-pi-oled.md` 1.1)
has SPI0 free and the pins this needs do not touch the OLED panel's I2C or its four keys. Two ways to drive it, the
second recommended for the board (section 2). 28.00 EUR, 39 in stock at Oomipood Tallinn, Peterburi tee (READ,
2026-11-02).

## 1. The part (READ, shop page, 2026-11-02)

| | |
| --- | --- |
| name | TFT display 2.4'' 320x240 RGB 3.3V SPI TTL |
| controller | ILI9341 |
| interface | 4-wire SPI |
| supply | 3.3 to 5 V, about 90 mA |
| resolution | 320 x 240 |
| colours | 65K, that is RGB565, 16 bits a pixel. The ILI9341 also takes 18-bit RGB666 over SPI (262K colours) at 3 bytes a pixel, 50 % more to send (INFERRED, ILI9341 datasheet knowledge) |
| touch | 4-wire resistive; the controller chip is not named on the page. Boards of this kind usually carry an XPT2046 on the same SPI bus (INFERRED: read the chip on the back) |
| other | microSD slot (on the same SPI bus, not needed), 4 white LED backlight, active area 36.72 x 48.96 mm, board 77.18 x 42.72 mm, -20 to 70 C |
| datasheet, pin list | none on the page |

## 2. Software

### 2.1 Route A: the kernel draws it

Raspberry Pi OS carries DRM drivers for SPI panels: the ILI9341 overlay, or `panel-mipi-dbi` with a small init file
(INFERRED: overlay names and parameters to be read from `/boot/firmware/overlays/README` on the board before
writing `config.txt`). The panel then is a second display, `/dev/dri/cardN` and a framebuffer.

- For: no code of ours, any program can draw on it.
- Against: a second KMS display on a board whose HDMI path (`rig/hdmi/hdmi-scan.c`) already page-flips a GBM
  surface; the console may grab it; rotation and backlight are overlay parameters, set at boot, so a change needs a
  reboot of a board in another building.

### 2.2 Route B: the board pushes frames (recommended)

The board process owns the panel the way `plan-pi-oled.md` has it own the OLED: open `/dev/spidev0.0`, drive DC,
RESET and the backlight on three GPIOs, send the ILI9341 init sequence once, then each frame as a window write
(CASET, PASET, RAMWR) of RGB565 bytes.

- For: the picture comes from the same code as the pages (`fx.c` frames, `demo/shell/day-grid.mjs` grids,
  `weak.c`), a frame can be partial (only the rows that changed), the backlight is a value, nothing needs a reboot.
- Against: an SPI writer in the board (node has no SPI binding in `packages.txt`, READ in spirit from
  `plan-pi-oled.md` 2.5 which found the same for I2C), so either a small C helper like the planned `oledpush`, or a
  native module. ThreatLocker on this Mac means C is built in a `gcc:14` container under OrbStack, as
  `rig/route-core/test.sh` does (`positron-hardware`).

### 2.3 Speed (INFERRED, arithmetic)

A full frame is 320 x 240 x 2 = 153,600 bytes. At an SPI clock of 32 MHz that is 38 ms, about 26 frames a second;
at 48 MHz about 39. The ILI9341's write clock is rated well below that, and real modules commonly run 32 to 62.5 MHz
on a Pi with shorter wires (INFERRED). Expect 20 to 30 full frames a second; partial windows go faster. Enough for
the Kyiv grid, `fx` and slides; not smooth full-screen video. 18-bit colour costs 50 % of that.

### 2.4 Touch

If the chip is an XPT2046: the stock `ads7846` overlay makes it a kernel input device on CE1 with an IRQ GPIO, read
by node from `/dev/input/eventN` like the OLED's keys (INFERRED). Calibration is per panel, measured once.

## 3. Wiring (INFERRED from the Pi pinout; check against the module's silkscreen)

| module pin | Pi | header pin |
| --- | --- | --- |
| VCC | 3.3 V | 17 (pin 1 is the OLED's) |
| GND | GND | 20 |
| SCK | GPIO 11 (SPI0 SCLK) | 23 |
| SDI / MOSI | GPIO 10 (SPI0 MOSI) | 19 |
| SDO / MISO | GPIO 9 (SPI0 MISO) | 21 |
| CS | GPIO 8 (CE0) | 24 |
| DC (RS) | GPIO 24 | 18 |
| RESET | GPIO 25 | 22 |
| LED (backlight) | GPIO 18 (PWM capable) | 12 |
| T_CS (touch) | GPIO 7 (CE1) | 26 |
| T_IRQ | GPIO 17 | 11 |
| T_CLK, T_DIN, T_DO | shared with SCK, MOSI, MISO | |

Kept clear: the OLED's I2C on GPIO 2 and 3 (pins 3, 5) and its keys on GPIO 5, 6, 13, 26 (`plan-pi-oled.md` 1.2,
MEASURED 2026-10-15 by press, `BACKLOG.md`). Solderless: the module has a header, so female to female jumpers as
for the OLED. Logic is 3.3 V, which the Pi's GPIO is. Whether the module's LED pin may be driven straight from a GPIO
or wants a transistor is not on the page: look at the board for a backlight transistor before wiring LED to GPIO 18;
without one, tie LED to 3.3 V first.

## 4. On the patchbay

A node `pi-1:tft` with a `video-in` port (frames, RGB565, `shape: { w: 320, h: 240, format: 'rgb565' }`), a `value-in`
for the backlight, and, with touch, a `pointer` source as `plan-hand.md` proposes for a finger: `pi-1:tft:value-out`
of `{ x, y, pressure, at }` until a `pointer` medium exists.

## 5. Order

1. Buy one (28 EUR). Read the chips on its back: the ILI9341, the touch controller, a backlight transistor.
2. Wire the display pins only (section 3, no touch). `dtparam=spi=on` in `/boot/firmware/config.txt`, reboot,
   `ls /dev/spidev0.*`.
3. A one-off test from the board: init, fill red, green, blue, then a 320 x 240 test card; time a full frame. That
   number replaces 2.3.
4. Route B in the board: the panel as `pi-1:tft`, a frame pushed from a page over the relay (the Kyiv picture at 320 x
   240 is the first content), partial windows.
5. Touch, if the chip is an XPT2046.
6. Only if route B is too slow or too much code: route A, with the console kept off the panel.

## 6. Bending and glitching it

Asked 2026-11-02: *"circuit bending / glitching etc?"*. The ILI9341 is a good subject because most of its glitches are
**commands**, not solder: the panel does exactly what it is told, so a wrong instruction makes a picture nobody drew
and nothing breaks. `plan-frames.md` lists these bends for this chip; `plan-bends.md` sets the rules (bends work on
parsed messages, consent is checked again after the bend, everything random takes a seed). All INFERRED from the
ILI9341 command set; none tried.

### 6.1 Command bends (software, reversible, no risk)

| bend | what it does on screen | how |
| --- | --- | --- |
| window off by n | the picture shears diagonally, rows wrap into the next | CASET or PASET a few pixels wider or narrower than the frame sent |
| byte swap | colours turn to garbage while the shapes stay | send RGB565 with the two bytes of each pixel swapped |
| pixel format swap | 16-bit data read as 18-bit, or back: colour and stride both wrong | COLMOD 0x66 while sending 2 bytes a pixel |
| MADCTL flips | mirror, rotate, swap rows and columns, BGR for RGB, mid-frame | MADCTL between bands of one frame |
| vertical scroll | the whole picture slides and wraps in hardware, for free | VSCRDEF and VSCRSADD, moved every frame |
| gamma tables | contrast and colour curves bend, solarise, posterise | write odd values to the positive and negative gamma tables |
| tearing | half old frame, half new, the seam travelling | write without waiting for TE, at a rate near the refresh |
| stale RAM | parts of an old frame survive | update only some windows (route B's partial writes, used wrongly on purpose) |
| sleep, invert, idle | the panel's own modes: inverted colours, 8-colour idle mode | INVON, IDMON |

Each is a transform on the `pi-1:tft:video-in` link or a `value-in` on the node, seeded, and **reset by sending the
init sequence again**, which is the undo for all of them.

### 6.2 Signal bends (still software, a little risk to the picture only)

- SPI clock past what the wires hold: bit errors become coloured noise along the rows. Find the clock where it starts
  (section 5 step 3 finds the clean ceiling anyway) and sit just above it.
- Dropping or repeating bytes in the stream: everything after the fault shifts by a pixel, the same tear as a weak
  signal, close to what `weak.c` draws on purpose.
- Data-command (DC) toggled at the wrong moment: pixel bytes read as commands, which can change any of 6.1 at random.
  Bounded by the reset in 6.1, but it can also put the panel to sleep; a RESET pulse brings it back.

### 6.3 Physical bends (solderless only, owner's rule)

- The backlight on PWM: flicker, strobe, a beat against the camera on `plan-screens-odd.md`'s camera feedback.
- Long or loose jumper wires on SCK and MOSI: real noise instead of simulated. Cheap and reversible.
- Not here: shorting pins, touching the board with fingers, 5 V on a GPIO. The Pi is the expensive half, and 3.3 V
  logic does not survive a mistake.

### 6.4 Order

After section 5 step 4: MADCTL and vertical scroll first (two bytes each, very visible), then window shear and byte
swap, then gamma; signal bends once the clean clock is measured.

## 7. Open

- Which touch chip, and whether the backlight pin is switched.
- The real SPI clock this module holds on jumper wires.
- Whether a second screen on the board is worth its CPU next to `hdmi-scan` (1.6 % of a core for the OLED mirror on
  HDMI, MEASURED, `positron-hardware`).
