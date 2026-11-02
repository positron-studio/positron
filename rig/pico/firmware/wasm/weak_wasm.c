/* rig/pico/firmware/wasm/weak_wasm.c: weak.c as a standalone module for pages.
 * One picture up to 1280x720 RGBA; the page writes into frame_ptr() and calls step(). */
#include "../weak.h"
#define EXPORT __attribute__((visibility("default")))
#define MAXPX (1280 * 720)
static uint8_t frame[MAXPX * 4], shown[MAXPX * 4], prev[MAXPX * 4];
static uint8_t dirty[2 * (1280 / 8 + 1) * (720 / 8 + 1)];
static weak_state st;
EXPORT uint8_t *frame_ptr(void) { return frame; }
EXPORT int init(int w, int h, int ch, int block, int gop, unsigned seed) {
  if (w * h > MAXPX || block < 8) return 0;
  weak_init(&st, w, h, ch, block, gop, seed, shown, prev, dirty);
  return 1;
}
EXPORT int step(int signal) { return weak_step(&st, frame, signal); }
