/* rig/pico/firmware/weak.c: see weak.h. Plain C99, no library calls.
 * why: lessons/rig-pico-weak.md */
#include "weak.h"

#define NO_SIGNAL_BELOW 60

static uint32_t rnd(weak_state *s) {
  uint32_t x = s->rng;
  x ^= x << 13; x ^= x >> 17; x ^= x << 5;
  return s->rng = x;
}
static int pm(weak_state *s) { return (int)(rnd(s) % 1000u); }

void weak_init(weak_state *s, int w, int h, int ch, int block, int gop,
               uint32_t seed, uint8_t *shown, uint8_t *prev, uint8_t *dirty) {
  int i, n = w * h * ch, nb;
  s->w = w; s->h = h; s->ch = ch;
  s->block = block > 0 ? block : 16;
  s->gop = gop > 0 ? gop : 50;
  s->frame = -1;
  s->rng = seed ? seed : 1;
  s->shown = shown; s->prev = prev; s->dirty = dirty;
  nb = ((w + s->block - 1) / s->block) * ((h + s->block - 1) / s->block);
  for (i = 0; i < n; i++) shown[i] = prev[i] = 0;
  for (i = 0; i < nb; i++) { dirty[i] = 1; dirty[nb + i] = 0; }  /* nothing seen yet */
}

static uint8_t clamp8(int v) { return (uint8_t)(v < 0 ? 0 : v > 255 ? 255 : v); }
static int colour(int ch, int c) { return ch >= 3 ? c < 3 : 1; }  /* skip alpha */

/* block (bx, by) clipped to the picture */
static void span(weak_state *s, int bx, int by, int *x0, int *y0, int *x1, int *y1) {
  *x0 = bx * s->block; *y0 = by * s->block;
  *x1 = *x0 + s->block; if (*x1 > s->w) *x1 = s->w;
  *y1 = *y0 + s->block; if (*y1 > s->h) *y1 = s->h;
}

static void copy_clean(weak_state *s, const uint8_t *f, int bx, int by) {
  int x0, y0, x1, y1, x, y, c;
  span(s, bx, by, &x0, &y0, &x1, &y1);
  for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) {
    int i = (y * s->w + x) * s->ch;
    for (c = 0; c < s->ch; c++) s->shown[i + c] = f[i + c];
  }
}

/* only the change since the last clean frame, onto a damaged base */
static void residual(weak_state *s, const uint8_t *f, int bx, int by) {
  int x0, y0, x1, y1, x, y, c;
  span(s, bx, by, &x0, &y0, &x1, &y1);
  for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) {
    int i = (y * s->w + x) * s->ch;
    for (c = 0; c < s->ch; c++) if (colour(s->ch, c))
      s->shown[i + c] = clamp8(s->shown[i + c] + f[i + c] - s->prev[i + c]);
  }
}

static void smear(weak_state *s, int bx, int by, int dx, int dy) {
  int x0, y0, x1, y1, x, y, c;
  span(s, bx, by, &x0, &y0, &x1, &y1);
  for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) {
    int sx = x + dx, sy = y + dy, i, j;
    if (sx < 0) sx = 0;
    if (sx >= s->w) sx = s->w - 1;
    if (sy < 0) sy = 0;
    if (sy >= s->h) sy = s->h - 1;
    i = (y * s->w + x) * s->ch; j = (sy * s->w + sx) * s->ch;
    for (c = 0; c < s->ch; c++) if (colour(s->ch, c)) s->shown[i + c] = s->shown[j + c];
  }
}

/* the block's average of the NEW picture: the coarse part arrived, detail did not;
 * with a chroma error, the colour channels are pushed toward magenta or green */
static void flatten(weak_state *s, const uint8_t *f, int bx, int by, int chroma, int push, int amount) {
  int x0, y0, x1, y1, x, y, c, n;
  long sum[4] = { 0, 0, 0, 0 };
  span(s, bx, by, &x0, &y0, &x1, &y1);
  n = (x1 - x0) * (y1 - y0);
  for (y = y0; y < y1; y++) for (x = x0; x < x1; x++)
    for (c = 0; c < s->ch && c < 4; c++) sum[c] += f[(y * s->w + x) * s->ch + c];
  for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) {
    int i = (y * s->w + x) * s->ch;
    for (c = 0; c < s->ch && c < 4; c++) if (colour(s->ch, c)) {
      int v = (int)(sum[c] / n);
      if (chroma && s->ch >= 3) v += (c == 1 ? -push : push) * amount;  /* G against R,B */
      s->shown[i + c] = clamp8(v);
    }
  }
}

/* chroma error: the stale block keeps its detail but its colour is pushed toward
 * magenta or green, by an amount that differs block to block */
static void tint(weak_state *s, int bx, int by, int push) {
  int x0, y0, x1, y1, x, y, c, amount = 40 + (int)(rnd(s) % 90u);
  span(s, bx, by, &x0, &y0, &x1, &y1);
  if (s->ch < 3) return;
  for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) {
    int i = (y * s->w + x) * s->ch;
    for (c = 0; c < 3; c++) s->shown[i + c] = clamp8(s->shown[i + c] + (c == 1 ? -push : push) * amount);
  }
}

/* this frame's losses: modes 1 stale, 2 smear, 3 flatten, 4 chroma; 0 received */
enum { M_OK, M_STALE, M_SMEAR, M_FLAT, M_CHROMA };

int weak_step(weak_state *s, uint8_t *frame, int signal) {
  int bw = (s->w + s->block - 1) / s->block, bh = (s->h + s->block - 1) / s->block;
  int nb = bw * bh, bx, by, i, k, e, n = s->w * s->h * s->ch, flags = 0, iframe, chance;
  uint8_t *dirty = s->dirty, *lost = s->dirty + nb;
  int edx[6], edy[6], epush[6];

  if (signal < 0) signal = 0;
  if (signal > 1000) signal = 1000;
  s->frame++;
  iframe = s->frame % s->gop == 0;
  if (iframe) flags |= WEAK_IFRAME;

  if (signal < NO_SIGNAL_BELOW) {
    flags |= WEAK_NO_SIGNAL;                    /* frozen: show the last picture */
  } else {
    /* up to six bursts a frame; each likelier as the signal falls */
    chance = (1000 - signal) * (1000 - signal) / 1000;
    for (k = 0; k < nb; k++) lost[k] = M_OK;
    for (e = 0; e < 6; e++) {
      int start, rows, len, mode, r;
      if (pm(s) >= chance) continue;
      start = (int)(rnd(s) % (uint32_t)nb);      /* one call per statement: C leaves */
      rows = 1 + (int)(rnd(s) % 4u);              /* operand order open, JS does not */
      len = 1 + (int)(rnd(s) % (uint32_t)(bw * rows));
      r = pm(s);
      mode = r < 550 ? M_STALE : r < 850 ? M_SMEAR : r < 980 ? M_FLAT : M_CHROMA;
      edx[e] = ((int)(rnd(s) % 5u) - 2) * (s->block / 2);
      edy[e] = ((int)(rnd(s) % 3u) - 1) * (s->block / 2);
      epush[e] = (int)(rnd(s) & 1u) ? 1 : -1;
      (void)rnd(s);   /* drawn but unused: keeps the sequence as the JS twin has it */
      for (k = start; k < start + len && k < nb; k++) lost[k] = (uint8_t)(mode | (e << 4));
    }
    for (by = 0; by < bh; by++) for (bx = 0; bx < bw; bx++) {
      k = by * bw + bx;
      if (lost[k] == M_OK) {
        if (iframe || !dirty[k]) { copy_clean(s, frame, bx, by); dirty[k] = 0; }
        else residual(s, frame, bx, by);        /* change onto a damaged base */
      } else {
        int mode = lost[k] & 15, ev = lost[k] >> 4;
        dirty[k] = 1;
        if (mode == M_SMEAR) smear(s, bx, by, edx[ev], edy[ev]);
        else if (mode == M_FLAT) flatten(s, frame, bx, by, 0, 0, 0);
        else if (mode == M_CHROMA) tint(s, bx, by, epush[ev]);
        /* M_STALE: leave it */
      }
    }
  }
  for (i = 0; i < n; i++) {
    s->prev[i] = frame[i];
    if (s->ch == 4 && i % 4 == 3) continue;     /* alpha passes through */
    frame[i] = s->shown[i];
  }
  return flags;
}
