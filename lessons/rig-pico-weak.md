# rig-pico-weak: weak.c, a weak digital TV signal

## In the repo, 2026-11-02

The module and its JS twin live in `demo/resources/weak/` (the handoff had them in `demo/weak/`). Built with emcc in the emsdk image: `weak.wasm` 3,570 bytes. `node rig/pico/firmware/wasm/weak-test.mjs` (paths default to `demo/resources/weak/`) 12 of 12, wasm and JS byte for byte; 1.31 to 1.38 ms a frame at 640x360 RGBA on this Mac, one core. The handoff's "13 of 13" counted the timing line. The preview page is `research/weak-preview/index.html`, standalone and off the kit; a `/video/weak/` page is in BACKLOG.

## The handoff note, 2026-10-31, kept as written


Files, at their repo paths:

- `rig/pico/firmware/weak.h`, `weak.c`: new. Plain C99, no library calls, no
  malloc, integer only, seeded. Grey, RGB or RGBA frames of any size.
- `rig/pico/firmware/wasm/weak_wasm.c`: the module for pages (up to 1280x720).
- `rig/pico/firmware/wasm/weak-test.mjs`: 13 checks, including a negative
  control and wasm against JS byte for byte.
- `demo/weak/weak.mjs`: the same model in JavaScript, the fallback where a page
  may not compile WebAssembly.
- `demo/weak/index.html`: the preview, wasm and JS twin inlined.
- `weak-frames.jpg`: four frames from a real photo pair through the wasm.

The model, per frame: up to six loss bursts (likelier as the signal falls), each
running on in raster order across up to four rows; lost blocks kept stale (55%),
smeared by one wrong motion vector per burst (30%), flattened to the new
picture's average (13%), or tinted toward magenta or green (2%); a received block
on a damaged base gets only the change since the last clean frame, so old and
new scenes mix; an I-frame every `gop` frames heals what arrives; below 6% the
picture freezes and the flag for "No Signal!" is set.

Build in the repo with the existing emsdk image, as `oled-ui.wasm` is built:

```sh
emcc -O2 -std=c99 -sSTANDALONE_WASM -sINITIAL_MEMORY=16777216 --no-entry \
  -sEXPORTED_FUNCTIONS=_frame_ptr,_init,_step \
  -I rig/pico/firmware rig/pico/firmware/wasm/weak_wasm.c rig/pico/firmware/weak.c \
  -o demo/weak/weak.wasm
node rig/pico/firmware/wasm/weak-test.mjs demo/weak/weak.wasm demo/weak/weak.mjs
```

Run here, 2026-10-31: `gcc -std=c99 -Wall -Wextra -pedantic` clean; wasm built
with `zig cc` (not emcc, which this sandbox lacks); 13 of 13 checks passed; 1.4
to 1.6 ms a frame at 640x360 RGBA, one x86 core. Not run: emcc, a real browser,
the Pi, the Pico.

Patchbay: `signal` is a `value` port (0..1000); the "no signal" and "I-frame"
flags are value outputs. The air-raid gate's `age` maps onto `signal`.
