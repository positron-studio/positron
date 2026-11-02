/* rig/pico/firmware/fx.h: feedback and software circuit bending over the
 * 128x64 1-bit frame buffer that ui.c draws and ssd1306.c sends.
 *
 * The buffer is page major, as in ui.h: byte (page * 128 + x) holds the 8
 * vertical pixels x, page*8 .. page*8+7, bit 0 at the top.
 *
 * Every call takes the frame and changes it in place. Nothing is allocated:
 * the module keeps static buffers (the previous frame for feedback, a grey
 * accumulator, the last frame shown for the stale-page bends, and scratch),
 * about 20 KB in all, which fits the RP2040 (264 KB) and RP2350 (520 KB).
 *
 * Randomness is one xorshift32 with a seed the caller sets, so the same seed
 * and the same calls give the same frames on the Pico, the Pi and in a page.
 * Order is the caller's: draw with ui.c, then fx_ calls, then fx_shown().
 *
 * Fixed point: angles are 1/256 of a turn, zoom is q8 (256 is 1.0).
 */
#ifndef POSITRON_FX_H
#define POSITRON_FX_H

#include <stdint.h>

#define FX_W 128
#define FX_H 64
#define FX_BYTES (FX_W * FX_H / 8)

enum { FX_REPLACE = 0, FX_OR = 1, FX_XOR = 2, FX_AND = 3 };
enum { FX_DITHER_THRESHOLD = 0, FX_DITHER_BAYER4 = 1, FX_DITHER_BAYER8 = 2 };

/* Seed the generator. 0 is replaced by 1 (xorshift cannot leave 0). Also
 * clears the feedback, accumulator and shown buffers, so a seed is a start. */
void fx_seed(uint32_t s);
uint32_t fx_rand(void);

int fx_get(const uint8_t *fb, int x, int y);
void fx_set(uint8_t *fb, int x, int y, int on);

/* --- feedback ----------------------------------------------------------- */

/* 1-bit feedback: the previous result, moved (dx, dy), zoomed about the
 * centre and turned, is thinned so each lit pixel survives with probability
 * keep/1000, then combined with the new drawing in fb by `mode`. The result
 * is written to fb and kept as the next previous frame. keep 1000 never
 * forgets; 900 leaves speckled trails; 0 is no feedback. */
void fx_feedback(uint8_t *fb, int dx, int dy, int zoom_q8, int turn,
                 int keep, int mode);

/* Grey feedback: the same transform, on an 8-bit accumulator that decays by
 * decay_q8/256 a frame and takes every lit pixel of fb at full brightness,
 * then dithered back into fb. Trails fade like phosphor instead of speckle.
 * Ordered dither is stable from frame to frame; error diffusion would shimmer,
 * which is why it is not offered here. */
void fx_feedback_grey(uint8_t *fb, int dx, int dy, int zoom_q8, int turn,
                      int decay_q8, int dither);

/* Life-like cellular automaton on fb itself, wrapping at the edges. birth and
 * survive are bit masks of neighbour counts: Conway is B3/S23, so
 * birth = 1<<3, survive = (1<<2)|(1<<3). */
void fx_life(uint8_t *fb, unsigned birth, unsigned survive);

void fx_mirror(uint8_t *fb, int horizontal, int vertical);

/* --- bends: faults of the pipeline, on purpose -------------------------- */

/* Flip random bits, on average per_million of the 8192 pixels a frame. */
void fx_bitrot(uint8_t *fb, int per_million);

/* Slip one page (8 rows) sideways by `cols`, wrapping. In a page-major buffer
 * this is a move of 128 bytes, the cheapest glitch there is. */
void fx_slip(uint8_t *fb, int page, int cols);
/* Each page slips with probability chance/1000 by up to max_cols either way. */
void fx_slip_random(uint8_t *fb, int chance, int max_cols);

/* The whole frame sent `bytes` late, as if the column pointer were off: the
 * image wraps sideways and each page drags the next one in. */
void fx_wrap(uint8_t *fb, int bytes);

/* Roll the picture up by `lines`, wrapping: what the SSD1306's display start
 * line (command 0x40 | n) does in hardware. */
void fx_roll(uint8_t *fb, int lines);

/* Pages whose bit is set in `mask` are not updated: they keep what was shown
 * last, as if their bytes never arrived. An honest datamosh for this screen:
 * there are no P-frames, only pages that went stale. */
void fx_stale(uint8_t *fb, unsigned mask);
/* Each page goes stale with probability chance/1000. */
void fx_stale_random(uint8_t *fb, int chance);

/* Show the frame that was shown last, for this frame: sample and hold. */
void fx_hold(uint8_t *fb);

/* A 16-bit LFSR with the caller's taps, XORed over the frame at density
 * per 1000 bytes. Ordinary taps give noise; bent taps give short cycles,
 * which read as stripes and lattices. */
void fx_lfsr(uint8_t *fb, unsigned taps, unsigned start, int density);

/* Databend: copy `len` bytes of any memory into the frame from byte `at`,
 * wrapping. Point it at a font table or at the program itself. */
void fx_memview(uint8_t *fb, const uint8_t *src, int len, int at);

/* Remember fb as what the panel now shows. Call once a frame, last. */
void fx_shown(const uint8_t *fb);

#endif
