# rig/hdmi: the Pi's HDMI screen through KMS, the GPU doing the scaling

Way A of `plans/plan-pi-hdmi.md`. One small C program, `hdmi-scan.c`, that
takes the connected HDMI connector on `/dev/dri/card1` at its current mode,
renders with EGL and GLES2 into a GBM surface, and shows each frame with one
`drmModeSetCrtc` and then vsynced `drmModePageFlip`s. On exit (time up, SIGINT
or SIGTERM) it puts the previous CRTC back, so the screen returns to whatever
it showed before (today the fbdev console's framebuffer, fb 721).

## Build, on the Pi

This Mac kills locally compiled binaries; the Pi builds them. In `~/hdmi`, never `/opt`:

    cd rig/hdmi && ssh positron@<pi> 'mkdir -p ~/hdmi' &&
      COPYFILE_DISABLE=1 tar c --no-xattrs hdmi-scan.c build.sh | ssh positron@<pi> 'tar x -C ~/hdmi && ~/hdmi/build.sh'

Needs `libdrm-dev libgbm-dev libegl-dev libgles-dev libturbojpeg0-dev`.
`libdrm-dev` and `libturbojpeg0-dev` were installed for this on 2026-10-16;
the rest were already there. The user must be in groups `video` and `render`.

## Run

The screen is shared. Before running, `pgrep -a ffmpeg` must show nothing
writing `/dev/fb0`, and nothing else may be DRM master on card1 (`SetCrtc`
fails with a message saying so). Always under a timeout:

    timeout 20 ./hdmi-scan bars 15          # sliding colour bars, 15 s
    timeout 25 ./hdmi-scan camera 20        # /dev/video0 MJPEG 1280x720 at 30, full screen
    HDMI_CARD=/dev/dri/card1 ...            # the default

It prints the connector, mode, `GL_RENDERER` (must read `V3D 4.2.14.0`, not
llvmpipe), and at the end frames, fps, its own CPU (getrusage over wall clock)
and, for the camera, decode and upload ms per frame.

The camera path: V4L2 mmap buffers (4), `tjDecompressToYUVPlanes` (no colour
conversion on the CPU, the JPEG is 4:2:2 so the planes are 1280x720 and two of
640x720), three `GL_LUMINANCE` textures, BT.601 full range to RGB in the
fragment shader, one full screen quad that the GPU scales to 1920x1080.

## Measured 2026-10-16, Pi 4, 1920x1080@60, governor `ondemand`

CPU from outside with `ps -o pcpu` at 8 to 10 s, and the program's own figure.

| what | fps | one core (ps) | one core (self) | rss |
| --- | --- | --- | --- | --- |
| `bars 15` | 58.9 (884 frames in 15.01 s) | 4.4 % | 2.6 % | 72 MB |
| `camera 20`, camera at its default | 23.6 (473 in 20.07 s) | 28.9 % | 28.2 % | 80 MB |
| `camera 20`, `exposure_dynamic_framerate=0` | **29.2** (586 in 20.11 s) | **34.0 %** | **33.7 %** | 78 MB |

Camera, per frame: decode 9.3 to 9.5 ms, upload and draw 1.9 to 2.0 ms. SoC
48.7 to 50.6 C, `throttled=0x0`, 0 dropped, CRTC back on fb 721 after every run.

Against ffmpeg into `/dev/fb0` (`plans/plan-pi-hdmi.md` §5b), same camera, same
1280x720 MJPEG:

| path | full screen | one core |
| --- | --- | --- |
| ffmpeg, scale bicubic | yes | 187 % |
| ffmpeg, `fast_bilinear` | yes | 97.6 % |
| ffmpeg, 1:1 centred, no scale | no | 48.4 % |
| **hdmi-scan, GPU scale** | **yes** | **33.7 %** at 29.2 fps |

So full screen costs less than ffmpeg's unscaled picture. What is left is the
JPEG decode, about 9.3 ms of a 33 ms frame.

⚠️ **The camera gives 24 fps, not 30, with its controls as they are.**
`exposure_dynamic_framerate` reads `1` on this C925e (the driver default is
`0`), so in the room's light it lengthens exposure and drops to 24.04 fps;
`v4l2-ctl --stream-mmap` measured that with no program of ours involved. The
30 fps row set it to `0` for the run and back to `1` after. The ffmpeg rows in
§5b were taken with it at `1`, so they were likely at 24 fps too, which makes
the comparison above conservative.

⚖️ Not measured: tearing. A vsynced page flip should show none; the owner
looking at the bars is the check.
