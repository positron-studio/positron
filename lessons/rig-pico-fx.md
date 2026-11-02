# rig-pico-fx: fx.c, feedback and bends for the OLED frame

## In the repo, 2026-11-02

Built with the repo's emcc (`./rig/pico/firmware/wasm/build.sh`, emsdk image, OrbStack): `oled-ui.wasm` 7,865 to 11,154 bytes, no warnings. `node rig/pico/firmware/wasm/test.mjs` all PASS, `fx-test.mjs` 22 of 22. `extras/fx-preview.html` was not taken: the kit's own OLED pages are the preview. Still not run: a real browser page, the Pico, the Pi panel.

## The handoff note, 2026-10-28, kept as written


Files, at their repo paths:

- `rig/pico/firmware/fx.h`, `fx.c`: new. Plain C99, no library calls, about
  20 KB of static buffers. Builds for the Pico SDK, gcc on the Pi, and the
  standalone wasm.
- `rig/pico/firmware/wasm/ui_wasm.c`: the repo's file with an fx block
  appended (exports ending in `_`, all working on the same `frame`).
- `rig/pico/firmware/wasm/build.sh`: the repo's file with `fx.c` added to the
  `emcc` line and the fx exports added to `EXPORTED_FUNCTIONS`.
- `rig/pico/firmware/wasm/fx-test.mjs`: new. 22 checks plus a negative control.
- `fx-preview.html`: a standalone preview with the module inlined as base64.
  Not a repo page yet; a `/group/slug/` home is yours to pick.

To build and test in the repo:

```sh
./rig/pico/firmware/wasm/build.sh
node rig/pico/firmware/wasm/test.mjs
node rig/pico/firmware/wasm/fx-test.mjs
```

What was run here, 2026-10-28: `fx.c` compiled clean with
`gcc -std=c99 -Wall -Wextra -pedantic`; `ui.c` + `fx.c` + the patched
`ui_wasm.c` compiled to wasm with `zig cc` (not emcc, which this sandbox
lacks; zig is not needed in the repo); `fx-test.mjs` passed 22 of 22 against
that build; the preview's script ran 61 frames in each mode under a stub DOM.
Not run: emcc, the existing `test.mjs`, a real browser, the Pico, the Pi panel.

Not built yet: the SSD1306 register bends (start line, offset, remap, scroll,
clock divide), which belong in `ssd1306.c` on the device, not in the frame.
