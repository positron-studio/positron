# rig/board/hdmi.mjs

## header

Built 2026-10-16 from `plans/plan-pi-hdmi.md` §4 and §5b. The Pi's HDMI0 screen is `pi-1:hdmi0`, a device with one `video-in` that travels by `fbdev`, announced only while `/sys/class/drm/card1-HDMI-A-1/status` reads `connected` (asked every beat, through `graphFacts.screens`). Beside it the board announces `pi-1:pattern:video-out`, and the camera's `video-out` gains `fbdev` only while a screen is there, so a page can draw `pi-1:camera:video-out -> pi-1:hdmi0:video-in { via fbdev }` and the bay refuses the same link without `via` (the machine cell offers `page`, which no board port carries).

Two ways to draw, chosen at each show. With rig/hdmi's `hdmi-scan` on the board (`BOARD_HDMI_SCAN`, else `~/hdmi/hdmi-scan`, where rig/hdmi/README.md builds it) the GPU draws full screen through KMS: `hdmi-scan camera <a year> /dev/video0` and `hdmi-scan bars <a year>`, ended by SIGTERM, on which it puts the console's CRTC back. Without it ffmpeg draws into `/dev/fb0`: the camera at 1:1 centred (offsets from `virtual_size`, 1280x720 or 640x480, whichever fits) and testsrc2 at the screen size at 10 fps. MEASURED in §5b: ffmpeg 1:1 48.4 % of one core, scaled 98 to 187 %; hdmi-scan camera 28 to 34 %, bars 2.6 to 4.4 %. hdmi-scan reads MJPEG only, so a camera without it falls back to ffmpeg.

The screen and the camera are each one process's at a time. A show refuses in words while: no screen is connected; `hdmi-scan`, an ffmpeg into fbdev or an mpv on DRM runs (matched on the PROGRAM, the first word, because the first refusal on the Pi named `timeout (pid 3573)` beside the `hdmi-scan` it wrapped); any process has `/dev/fb0` or `/dev/dri/card1` open (/proc fds, so a holder ps cannot name is still found); and, for the camera, camera.mjs or the OLED's camera holds it, another `-f v4l2` reader runs, or any process has the device open. camera.mjs and screen-camera.mjs refuse the other way through their `held()` option while the HDMI show has the camera.

Stop sends SIGTERM, SIGKILL after 2 s (a SIGKILL skips hdmi-scan's CRTC restore, hence the wait), and once it has exited writes zeros over the whole framebuffer, so the last frame does not stay up. A show that dies on its own is cleared the same way and its last line kept in `last.why`. The board's stop takes it down in its engines step (full only; a silence leaves a picture up) and `board.check` has an `hdmi` row.

MEASURED on the Pi 2026-10-16 over the relay: the first camera show exited at once with `S_FMT (Device or resource busy)` while no ps rule and no /proc fd scan run a minute later found any holder; the retry worked. The holder was not identified. The /proc check was added after it.

`by` is an envelope field (wire.mjs), so a status body carrying it was answered `board.error` on the first push; the field is `drawnBy`, and hdmi-test.mjs fails any answer that carries `from`, `sent`, `seq` or `by`.

## test

`node rig/board/hdmi-test.mjs`: fake spawn, fs and ps. Negative controls name a process that is not a holder (the kernel's vc4 threads, camera.mjs's encoder for the screen, the pattern for the camera, a `timeout` wrapper), a refusal that must not fire (a held camera does not stop the pattern), a link that must be refused (no `via`, the shader), and a stop that skips the screen and must leave `board.check` red. Sabotage MEASURED 2026-10-16: no clear on stop 47/53, own pid counted 52/53, cameraBusy ignored 52/53, `by` put back 60/62. Removing the kernel thread filter changes nothing, because the program match is already exact; kept as a second guard.
