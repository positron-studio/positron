# plan-pi-hdmi: the Pi's two HDMI outputs as screens, with no browser

Status (2026-10-16): proposal. Nothing built, nothing measured on the board; no
screen and no cable on the desk yet. Asked: *"my pi: how i get hdmi out?"*, *"it
supports two screens? in our out?"*, *"how can we output to screen with no
browser?"*, then *"yes. can we output same video as we to to pi's oled with no
overhead?"*.

## 1. What the board is today

- **Pi 4, two micro-HDMI outputs, no HDMI input.** Two screens at once, each up
  to 4K at 30 Hz, or one at 4K at 60 Hz (READ, Raspberry Pi product page). HDMI0
  is the socket next to USB-C power.
- **Headless.** `rig/vis/README.md`: both HDMI ports disconnected, no X server,
  `glmark2-es2-drm` finds no connector. The shader renders through EGL
  surfaceless on `/dev/dri/renderD128` into an FBO that is read back and encoded.
  `research/pi-screens-estonia-2026-10-04.md` says the same.
- **The OLED** (`rig/board/panel.mjs`): `oled-ui.wasm` in the board's node
  process makes one 1,024 byte frame (128x64, 1 bit) about every 66 ms, written
  to the SSD1306 as nine `i2ctransfer` calls.
- **Cables** (Oomipood, in stock 2026-10-16): the official Raspberry Pi micro-HDMI
  to HDMI 1 m, EUR 9.50; HDMI 2.0 micro-HDMI cables 1/2/3 m at EUR 8/11/14; a
  20 cm micro-HDMI plug to HDMI socket adapter, EUR 6.

## 2. Three ways to a screen with no browser

All three use the kernel's DRM/KMS directly. One process owns a connector at a
time; the text console must give that output up, or it draws over the picture.

| way | for | cost | work |
| --- | --- | --- | --- |
| **A. KMS scan-out from `rig/vis/`** | the shader, full rate | GPU, zero copy: render into a GBM surface on the connector and page flip | extend `v3dpipe`, native C on the Pi |
| **B. A KMS helper fed frames by node** | the OLED picture, patches, the step grid | see §3 | a small native helper, node writes frames to its stdin |
| **C. `mpv --vo=drm`** | video: the camera, a file, a stream | the player's decode | an install and a command |

## 3. The OLED's picture on HDMI, with almost no overhead (way B)

- The board already has each frame as 1,024 bytes. `panel.mjs` hands the same
  buffer to a helper process as well as to the OLED: one 1 KB pipe write a frame,
  less than the nine `i2ctransfer` spawns it already pays.
- The helper keeps a 128x64 XRGB dumb buffer (32 KB) on a KMS plane and asks the
  display controller (the Pi 4's HVS) to scale it to the screen. Plane scaling is
  done in hardware. Per frame the CPU expands 1,024 bytes to 8,192 pixels and
  page flips: microseconds.
- 128x64 is 2:1, so a 1920x1080 screen fits it at 15x (1920x960) with bars.
- ⚖️ INFERRED, to measure first: whether this kernel's vc4 driver offers the
  plane property `SCALING_FILTER` with `Nearest Neighbor`, so the pixels stay
  square. Without it, the choices are the HVS's smooth scaling (soft edges) or
  expanding to 1920x960 on the CPU (about 7.4 MB a frame, about 110 MB/s at 15
  fps: fine on a Pi 4, not zero).
- Two screens: the OLED's picture on one output and the shader (way A) on the
  other, each with its own owner.

## 3b. Sound over HDMI

HDMI carries sound too. The board already lists both as ALSA cards (`aplay -l`,
2026-10-16): `card 4: vc4hdmi0` and `card 5: vc4hdmi1`. So each output can also be
an audio node, `pi-1:hdmi0:audio-in`, bridged onto JACK by `alsa_out` exactly as
`pi-1:pwm` is (rig/board/outputs.mjs), and digital, so cleaner than the PWM socket.
⚖️ INFERRED, to measure: it plays only while a screen or TV with speakers (or an
HDMI audio extractor) is connected, and vc4 HDMI audio wants IEC958 frames, so the
device is `hdmi:CARD=vc4hdmi0` (the plugin converts), not `hw:`.

## 4. In the patchbay

Each output is a node with a video input, `pi-1:hdmi0:video-in` and
`pi-1:hdmi1:video-in`, announced only while KMS sees a connected screen. A page
links `pi-1:screen:value-out` (the OLED's frames), `pi-1:shader:video-out` or
`pi-1:camera:video-out` to it; on the board a link is the helper or player
started on that connector, as a JACK link is a connection.

## 5. Steps

1. Plug a screen into HDMI0 with the VPN off; `kmsprint` (or `modetest -c`) on
   the Pi: is the connector seen, which modes, which plane properties
   (`SCALING_FILTER`).
2. Way C once, `mpv --vo=drm` on a file: the quickest proof a picture appears.
3. Way B: the helper, then `panel.mjs` feeding it; measure CPU per frame.
4. Way A for the shader.
5. The `hdmi0` and `hdmi1` nodes in `boardGraph`, and a `/devices/` page.

## 5b. Measured 2026-10-16

A 4K screen on HDMI0: `card1-HDMI-A-1 connected`, HDMI-A-2 disconnected; KMS runs it at 3840x2160@30 (kmsprint),
and `/dev/fb0` is 3840x2160 at 16 bit (RGB565), writable by the board's user (group video). The console takes it
at boot (`console=tty1` on the command line), so the screen shows the login prompt. **First picture**:
`ffmpeg -re -f lavfi -i testsrc2=size=1280x720:rate=25 -pix_fmt rgb565le -f fbdev -xoffset 1280 -yoffset 720 /dev/fb0`
drew the moving test pattern centred on the screen, photographed by the owner at 00:00:14, the login text still
top left. No install, no desktop, no browser. CPU not read. Then, asked *"yes"*: `video=HDMI-A-1:1920x1080@60 vt.global_cursor_default=0`
appended to /boot/firmware/cmdline.txt (backup cmdline.txt.bak-2026-10-16), `getty@tty1` disabled and stopped,
reboot: KMS 1920x1080@60.00, fb0 1920x1080, the board service back. Full screen testsrc2 1920x1080 at 30 fps into
fb0 as rgb565le: **82.7 % of one core, 130 MB rss, SoC 52.1 C, throttled=0x0**, 20 s, exit 0. Undo: the backup
over cmdline.txt and `systemctl enable --now getty@tty1`. **The camera**, asked *"pi camera"*: the Logitech C925e on USB
(`/dev/video0`, YUYV and MJPG; `rpicam-hello` lists no CSI camera), `ffmpeg -f v4l2 -input_format mjpeg -video_size
1280x720 -framerate 30 -i /dev/video0 -vf scale=1920:1080 -pix_fmt rgb565le -f fbdev /dev/fb0`, 20 s, exit 0:
**187 % of one core**, 133 MB rss, SoC 56.0 C. Software MJPEG decode, scale and 565 conversion; cheaper next: 1:1
at 720p centred, the V4L2 hardware decoder, or the GPU path (way A). ffmpeg warns of repeated dts from the camera's
timestamps, harmless to the picture. Then, 15 s each, CPU read at 8 s:

| camera 1280x720 MJPEG at 30 fps into fb0 | one core |
| --- | --- |
| scaled to 1920x1080, default (bicubic) | 187 % |
| scaled, `flags=fast_bilinear` | 97.6 % |
| scaled, `flags=neighbor` | 103 % |
| **1:1, 1280x720 centred** (`-xoffset 320 -yoffset 180`), no scale | **48.4 %** |

The owner saw the 1:1 picture work. The scale is most of the cost; this ffmpeg has no `mjpeg_v4l2m2m` decoder, so
hardware decode is not a route here. Full screen cheaply is the GPU path (way A): the GPU scales, the CPU only
decodes. Next: the console aside (getty@tty1 stopped, cursor
off), a 1920x1080@60 mode (`video=HDMI-A-1:1920x1080@60` on the kernel command line) so full screen is a quarter
of the pixels, then real content.

## 6. What could not be settled here

Everything on the board: whether the screen is detected after boot or needs
`video=HDMI-A-1:...` on the kernel command line, the plane properties, the real
CPU cost, and whether the console gives the output up cleanly.
