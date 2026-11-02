#!/bin/bash
# Writes demo/resources/pico/oled-ui.wasm from ../ui.c and ../fx.c, in the emsdk image.
# STANDALONE_WASM with no entry point: no imports, no emscripten glue.
# why: lessons/rig-pico.md#wasm-build
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FW="$(cd "$HERE/.." && pwd)"
OUT="$(cd "$FW/../../../demo/resources/pico" && pwd)"
docker run --rm -v "$FW":/fw:ro -v "$OUT":/out emscripten/emsdk:latest sh -c '
  set -e
  emcc -Os -std=c99 -Wall -Wextra -Wno-unused-parameter \
    -sSTANDALONE_WASM --no-entry -sINITIAL_MEMORY=131072 -sSTACK_SIZE=16384 \
    -sEXPORTED_FUNCTIONS=_fb,_str,_nfonts,_font_name,_font_cap,_font_adv,_begin,_area,_area_w,_text_w,_text,_text_big,_text_inv,_header,_box_w,_box_h,_box,_arrow,_meter,_dot,_banner,_banner_fit,_rect,_fill,_footer,_footer_h,_keys_right,_fx_seed_,_fx_feedback_,_fx_grey_,_fx_life_,_fx_mirror_,_fx_bitrot_,_fx_slip_,_fx_wrap_,_fx_roll_,_fx_stale_,_fx_stale_mask_,_fx_hold_,_fx_lfsr_,_fx_memview_,_fx_shown_ \
    -I/fw /fw/wasm/ui_wasm.c /fw/ui.c /fw/fx.c -o /out/oled-ui.wasm
'
echo "$OUT/oled-ui.wasm $(wc -c < "$OUT/oled-ui.wasm" | tr -d ' ') bytes"
