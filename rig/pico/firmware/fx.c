/* rig/pico/firmware/fx.c: see fx.h. Plain C99, no library calls at all (not
 * even memcpy), so the same file builds for the Pico SDK, for the Pi with gcc
 * and for the standalone WebAssembly module with nothing imported.
 * why: lessons/rig-pico-fx.md */
#include "fx.h"

static uint8_t prev[FX_BYTES];        /* the last feedback result */
static uint8_t shown[FX_BYTES];       /* the last frame the panel showed */
static uint8_t tmp[FX_BYTES];
static uint8_t acc[FX_W * FX_H];      /* grey feedback, one byte a pixel */
static uint8_t acc_tmp[FX_W * FX_H];
static uint32_t rng = 1;

/* sin(i * 2pi / 256) * 4096 for i in 0..64; the rest by symmetry. */
static const int16_t QSIN[65] = {
  0, 101, 201, 301, 401, 501, 601, 700, 799, 897, 995, 1092, 1189, 1285, 1380,
  1474, 1567, 1660, 1751, 1842, 1931, 2019, 2106, 2191, 2276, 2359, 2440, 2520,
  2598, 2675, 2751, 2824, 2896, 2967, 3035, 3102, 3166, 3229, 3290, 3349, 3406,
  3461, 3513, 3564, 3612, 3659, 3703, 3745, 3784, 3822, 3857, 3889, 3920, 3948,
  3973, 3996, 4017, 4036, 4052, 4065, 4076, 4085, 4091, 4095, 4096
};

static int isin(int a) {
  a &= 255;
  if (a < 64) return QSIN[a];
  if (a < 128) return QSIN[128 - a];
  if (a < 192) return -QSIN[a - 128];
  return -QSIN[256 - a];
}
static int icos(int a) { return isin(a + 64); }

static const uint8_t BAYER4[4][4] = {
  { 0, 8, 2, 10 }, { 12, 4, 14, 6 }, { 3, 11, 1, 9 }, { 15, 7, 13, 5 }
};
static const uint8_t BAYER8[8][8] = {
  { 0, 32, 8, 40, 2, 34, 10, 42 }, { 48, 16, 56, 24, 50, 18, 58, 26 },
  { 12, 44, 4, 36, 14, 46, 6, 38 }, { 60, 28, 52, 20, 62, 30, 54, 22 },
  { 3, 35, 11, 43, 1, 33, 9, 41 }, { 51, 19, 59, 27, 49, 17, 57, 25 },
  { 15, 47, 7, 39, 13, 45, 5, 37 }, { 63, 31, 55, 23, 61, 29, 53, 21 }
};

static void copy(uint8_t *d, const uint8_t *s, int n) { int i; for (i = 0; i < n; i++) d[i] = s[i]; }
static void zero(uint8_t *d, int n) { int i; for (i = 0; i < n; i++) d[i] = 0; }

void fx_seed(uint32_t s) {
  rng = s ? s : 1;
  zero(prev, FX_BYTES);
  zero(shown, FX_BYTES);
  zero(acc, FX_W * FX_H);
}

uint32_t fx_rand(void) {
  rng ^= rng << 13;
  rng ^= rng >> 17;
  rng ^= rng << 5;
  return rng;
}

static int chance(int per_thousand) { return (int)(fx_rand() % 1000u) < per_thousand; }

int fx_get(const uint8_t *fb, int x, int y) {
  if (x < 0 || x >= FX_W || y < 0 || y >= FX_H) return 0;
  return (fb[(y >> 3) * FX_W + x] >> (y & 7)) & 1;
}

void fx_set(uint8_t *fb, int x, int y, int on) {
  uint8_t *b;
  if (x < 0 || x >= FX_W || y < 0 || y >= FX_H) return;
  b = &fb[(y >> 3) * FX_W + x];
  if (on) *b |= (uint8_t)(1u << (y & 7));
  else *b &= (uint8_t)~(1u << (y & 7));
}

/* Where (x, y) of the moved, zoomed, turned picture comes from. The inverse
 * of the transform, so every output pixel is filled exactly once. */
static void source(int x, int y, int dx, int dy, int zoom_q8, int turn,
                   int *sx, int *sy) {
  int u = x - FX_W / 2 - dx, v = y - FX_H / 2 - dy;
  int c = icos(turn), s = isin(turn);
  long ru = ((long)u * c + (long)v * s) >> 12;
  long rv = ((long)-u * s + (long)v * c) >> 12;
  if (zoom_q8 <= 0) zoom_q8 = 256;
  *sx = FX_W / 2 + (int)(ru * 256 / zoom_q8);
  *sy = FX_H / 2 + (int)(rv * 256 / zoom_q8);
}

void fx_feedback(uint8_t *fb, int dx, int dy, int zoom_q8, int turn,
                 int keep, int mode) {
  int x, y, i, sx, sy;
  zero(tmp, FX_BYTES);
  for (y = 0; y < FX_H; y++)
    for (x = 0; x < FX_W; x++) {
      source(x, y, dx, dy, zoom_q8, turn, &sx, &sy);
      if (fx_get(prev, sx, sy) && chance(keep)) fx_set(tmp, x, y, 1);
    }
  for (i = 0; i < FX_BYTES; i++) {
    uint8_t a = fb[i], b = tmp[i];
    switch (mode) {
      case FX_OR: fb[i] = a | b; break;
      case FX_XOR: fb[i] = a ^ b; break;
      case FX_AND: fb[i] = a & b; break;
      default: fb[i] = b; break;
    }
  }
  copy(prev, fb, FX_BYTES);
}

void fx_feedback_grey(uint8_t *fb, int dx, int dy, int zoom_q8, int turn,
                      int decay_q8, int dither) {
  int x, y, sx, sy;
  for (y = 0; y < FX_H; y++)
    for (x = 0; x < FX_W; x++) {
      int v = 0;
      source(x, y, dx, dy, zoom_q8, turn, &sx, &sy);
      if (sx >= 0 && sx < FX_W && sy >= 0 && sy < FX_H)
        v = (acc[sy * FX_W + sx] * decay_q8) >> 8;
      if (fx_get(fb, x, y)) v = 255;
      acc_tmp[y * FX_W + x] = (uint8_t)(v > 255 ? 255 : v);
    }
  copy(acc, acc_tmp, FX_W * FX_H);
  for (y = 0; y < FX_H; y++)
    for (x = 0; x < FX_W; x++) {
      int t;
      if (dither == FX_DITHER_BAYER4) t = BAYER4[y & 3][x & 3] * 16 + 8;
      else if (dither == FX_DITHER_BAYER8) t = BAYER8[y & 7][x & 7] * 4 + 2;
      else t = 128;
      fx_set(fb, x, y, acc[y * FX_W + x] > t);
    }
}

void fx_life(uint8_t *fb, unsigned birth, unsigned survive) {
  int x, y, dx, dy;
  zero(tmp, FX_BYTES);
  for (y = 0; y < FX_H; y++)
    for (x = 0; x < FX_W; x++) {
      int n = 0, alive = fx_get(fb, x, y);
      for (dy = -1; dy <= 1; dy++)
        for (dx = -1; dx <= 1; dx++)
          if (dx || dy)
            n += fx_get(fb, (x + dx + FX_W) % FX_W, (y + dy + FX_H) % FX_H);
      if (alive ? (survive >> n) & 1 : (birth >> n) & 1) fx_set(tmp, x, y, 1);
    }
  copy(fb, tmp, FX_BYTES);
}

static uint8_t reverse8(uint8_t b) {
  b = (uint8_t)((b & 0xF0) >> 4 | (b & 0x0F) << 4);
  b = (uint8_t)((b & 0xCC) >> 2 | (b & 0x33) << 2);
  b = (uint8_t)((b & 0xAA) >> 1 | (b & 0x55) << 1);
  return b;
}

void fx_mirror(uint8_t *fb, int horizontal, int vertical) {
  int p, x;
  if (horizontal)
    for (p = 0; p < FX_H / 8; p++)
      for (x = 0; x < FX_W / 2; x++) {
        uint8_t t = fb[p * FX_W + x];
        fb[p * FX_W + x] = fb[p * FX_W + FX_W - 1 - x];
        fb[p * FX_W + FX_W - 1 - x] = t;
      }
  if (vertical) {
    for (p = 0; p < FX_H / 8; p++)
      for (x = 0; x < FX_W; x++)
        tmp[(FX_H / 8 - 1 - p) * FX_W + x] = reverse8(fb[p * FX_W + x]);
    copy(fb, tmp, FX_BYTES);
  }
}

void fx_bitrot(uint8_t *fb, int per_million) {
  long total = (long)FX_W * FX_H * per_million;
  int n = (int)(total / 1000000), k;
  if ((long)(fx_rand() % 1000000u) < total % 1000000) n++;
  for (k = 0; k < n; k++) {
    uint32_t r = fx_rand();
    fb[(r >> 3) % FX_BYTES] ^= (uint8_t)(1u << (r & 7));
  }
}

void fx_slip(uint8_t *fb, int page, int cols) {
  uint8_t row[FX_W];
  int x;
  if (page < 0 || page >= FX_H / 8) return;
  cols %= FX_W;
  if (cols < 0) cols += FX_W;
  for (x = 0; x < FX_W; x++) row[(x + cols) % FX_W] = fb[page * FX_W + x];
  copy(fb + page * FX_W, row, FX_W);
}

void fx_slip_random(uint8_t *fb, int chance_pm, int max_cols) {
  int p;
  if (max_cols <= 0) return;
  for (p = 0; p < FX_H / 8; p++)
    if (chance(chance_pm))
      fx_slip(fb, p, (int)(fx_rand() % (uint32_t)(2 * max_cols + 1)) - max_cols);
}

void fx_wrap(uint8_t *fb, int bytes) {
  int i;
  bytes %= FX_BYTES;
  if (bytes < 0) bytes += FX_BYTES;
  for (i = 0; i < FX_BYTES; i++) tmp[(i + bytes) % FX_BYTES] = fb[i];
  copy(fb, tmp, FX_BYTES);
}

void fx_roll(uint8_t *fb, int lines) {
  int x, y;
  lines %= FX_H;
  if (lines < 0) lines += FX_H;
  zero(tmp, FX_BYTES);
  for (y = 0; y < FX_H; y++)
    for (x = 0; x < FX_W; x++)
      fx_set(tmp, x, y, fx_get(fb, x, (y + lines) % FX_H));
  copy(fb, tmp, FX_BYTES);
}

void fx_stale(uint8_t *fb, unsigned mask) {
  int p;
  for (p = 0; p < FX_H / 8; p++)
    if ((mask >> p) & 1) copy(fb + p * FX_W, shown + p * FX_W, FX_W);
}

void fx_stale_random(uint8_t *fb, int chance_pm) {
  unsigned mask = 0;
  int p;
  for (p = 0; p < FX_H / 8; p++)
    if (chance(chance_pm)) mask |= 1u << p;
  fx_stale(fb, mask);
}

void fx_hold(uint8_t *fb) { copy(fb, shown, FX_BYTES); }

void fx_lfsr(uint8_t *fb, unsigned taps, unsigned start, int density) {
  uint16_t s = (uint16_t)(start ? start : 1);
  int i;
  taps &= 0xFFFF;
  if (!taps) return;
  for (i = 0; i < FX_BYTES; i++) {
    unsigned lsb = s & 1u;
    s >>= 1;
    if (lsb) s ^= (uint16_t)taps;
    if (chance(density)) fb[i] ^= (uint8_t)s;
  }
}

void fx_memview(uint8_t *fb, const uint8_t *src, int len, int at) {
  int i;
  if (!src || len <= 0) return;
  at %= len;
  if (at < 0) at += len;
  for (i = 0; i < FX_BYTES; i++) fb[i] = src[(at + i) % len];
}

void fx_shown(const uint8_t *fb) { copy(shown, fb, FX_BYTES); }
