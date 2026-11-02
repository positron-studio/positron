/* rig/pico/firmware/weak.h: a weak digital TV signal, live, on any frame.
 *
 * Models what a DVB-T receiver shows when packets go missing, block by block:
 *  - the picture is a grid of blocks (16 px like MPEG macroblocks, or 8);
 *  - losses come in bursts: an event starts at some block and runs on in raster
 *    order, often across several rows (packets carry slices, not single blocks);
 *  - lost blocks are concealed: kept stale (most), smeared from one wrong motion
 *    vector for the whole burst, flattened to their average (detail lost), or,
 *    rarely, given a chroma error;
 *  - a block that arrives after a loss is only a CHANGE (residual) applied to a
 *    damaged base, so damage persists and old and new scenes mix;
 *  - every `gop` frames an I-frame arrives row by row and heals what it reaches;
 *  - below a threshold the receiver freezes and reports no signal.
 *
 * Buffers are the caller's (no malloc): `shown` and `prev` are w*h*ch bytes,
 * `dirty` is TWO bytes per block (damage so far, and this frame's losses). Integer only, seeded (xorshift32), so the Pico,
 * the Pi and a page give the same frames for the same seed and calls.
 * ch is 1 (grey), 3 (RGB) or 4 (RGBA, alpha untouched). */
#ifndef POSITRON_WEAK_H
#define POSITRON_WEAK_H
#include <stdint.h>

typedef struct {
  int w, h, ch, block, gop, frame;
  uint32_t rng;
  uint8_t *shown, *prev, *dirty;
} weak_state;

enum { WEAK_NO_SIGNAL = 1, WEAK_IFRAME = 2 };

void weak_init(weak_state *s, int w, int h, int ch, int block, int gop,
               uint32_t seed, uint8_t *shown, uint8_t *prev, uint8_t *dirty);

/* One frame. `frame` holds the clean picture on entry and what the receiver
 * shows on exit. signal is 0..1000 (1000: perfect). Returns WEAK_ flags. */
int weak_step(weak_state *s, uint8_t *frame, int signal);

#endif
