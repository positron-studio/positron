/* frame: 160x160 frames in over the USB serial link at 1, 2, 4, 8 or 16 bit,
 * stylus out.
 * In:  'P' 'F' fmt len_hi len_lo, then len bytes. fmt is the bit depth:
 *      1 (3200 B), 2 grey (6400), 4 grey (12800), 8 system palette (25600),
 *      16 RGB565 big endian (51200). Rows top to bottom, leftmost pixel in the
 *      most significant bits; below 8 bit, 0 is white. A packet whose len is
 *      not the frame size for its fmt is read and dropped.
 * In:  'P' 'F' 0x0c 0x80, then 3200 bytes: the first build's 1 bit header
 *      (cam.mjs --old), told apart because 12 is not a format.
 * In:  'P' 'T' freq_hi freq_lo dur_hi dur_lo amp: a tone of freq Hz for dur ms
 *      at amp (0 to sndMaxAmp, clamped), played without waiting.
 * Out: "p x y d\n" per pen event (d is 1 while down); once, after the first
 *      8 bit frame, "pal " and 256 rrggbb hex entries, or "pal err 0x..".
 * Line 1: d<fmt> f<frames> <fps> <KB/s> t<tones> <err>.
 * Line 2: b<bytes read> h<header bytes> x<drops> e<last serial err> a<avail> s<seconds alive>
 *         r<reopens>. The port is closed and opened again after 3 s of errors
 *         in a row, or on a tap on the top 14 rows.
 * The 1 bit path is the first build's: same buffer, same loop, same draw. */
#include <PalmOS.h>
#include "frame.h"

#define W 160
#define H 160
#define ONE_BIT (W / 8 * H)
#define ROUNDS 4096

static UInt16 port;
static Boolean portOpen;
static UInt8 rxbuf[4096];
static BitmapType *bmp;
static UInt8 *bits;
static UInt8 depth;
static UInt32 frameBytes;
static UInt16 state, hdrLen;
static UInt32 need, got;
static UInt8 hdr[7];
static UInt16 tones;
static UInt32 frames, bytesIn, hdrBytes, alive;
static UInt16 drops;
static Err lastErr, bufErr;
static UInt32 lastAvail;
static UInt16 errSecs, reopens;
static Boolean palSent, screen16;
static RGBColorType pal[256];
static Err palErr;
static UInt32 lastTick, lastFrames, lastBytes;
static UInt32 fps10, kbps;
static char err[24];

/* Every number goes through %lu or %lx as a UInt32, so the 16 or 32 bit int
 * question never reaches StrPrintF. */
static void status(void) {
  RectangleType r;
  char s[96];
  StrPrintF(s, "d%lu f%lu %lu.%lu/s %luKB/s", (UInt32)depth, frames, fps10 / 10, fps10 % 10, kbps);
  if (tones) StrPrintF(s + StrLen(s), " t%lu", (UInt32)tones);
  if (err[0]) StrPrintF(s + StrLen(s), " %s", err);
  RctSetRectangle(&r, 0, 136, W, 24);
  WinEraseRectangle(&r, 0);
  WinDrawChars(s, StrLen(s), 2, 136);
  StrPrintF(s, "b%lu h%lu x%lu e%lx a%lu s%lu", bytesIn, hdrBytes, (UInt32)drops,
            (UInt32)(UInt16)lastErr, lastAvail, alive);
  if (reopens) StrPrintF(s + StrLen(s), " r%lu", (UInt32)reopens);
  if (bufErr) StrPrintF(s + StrLen(s), " B%lx", (UInt32)(UInt16)bufErr);
  WinDrawChars(s, StrLen(s), 2, 148);
}

static void reopen(void);

/* Once a second: rates over the last interval, avail as the port has it now. */
static void tick(void) {
  UInt32 now = TimGetTicks(), dt = now - lastTick, tps = SysTicksPerSecond(), avail = 0;
  if (dt < tps) return;
  fps10 = (frames - lastFrames) * 10 * tps / dt;
  kbps = (bytesIn - lastBytes) * tps / dt / 1024;
  lastTick = now; lastFrames = frames; lastBytes = bytesIn;
  alive++;
  if (portOpen) {
    Err e = SrmReceiveCheck(port, &avail);
    if (e) { lastErr = e; SrmClearErr(port); errSecs++; } else errSecs = 0;
    lastAvail = avail;
  }
  if (errSecs >= 3 || (!portOpen && alive % 3 == 0)) reopen();
  status();
}

static void openLink(void) {
  SrmOpenConfigType cfg;
  Err e;
  MemSet(&cfg, sizeof(cfg), 0);
  cfg.baud = 115200;
  e = SrmExtOpen(serPortCradleUSBPort, &cfg, sizeof(cfg), &port);
  if (e) e = SrmOpen(serPortCradlePort, 115200, &port);
  if (e) {
    StrPrintF(err, "open 0x%lx", (UInt32)(UInt16)e);
    status();
    return;
  }
  portOpen = true;
  bufErr = SrmSetReceiveBuffer(port, rxbuf, sizeof(rxbuf));
  StrCopy(err, "waiting");
  status();
}

static void closeLink(void) {
  if (!portOpen) return;
  SrmSetReceiveBuffer(port, NULL, 0);
  SrmClose(port);
  portOpen = false;
}

/* A USB drop can leave the handle stale while the link comes back. */
static void reopen(void) {
  closeLink();
  state = 0; hdrLen = 0; errSecs = 0;
  reopens++;
  openLink();
}

static void send(const char *s, UInt16 n) {
  Err e;
  if (!portOpen) return;
  SrmSend(port, s, n, &e);
  if (e) SrmClearErr(port);
}

static void sendPen(Int16 x, Int16 y, int down) {
  char line[32];
  StrPrintF(line, "p %ld %ld %ld\n", (Int32)x, (Int32)y, (Int32)down);
  send(line, StrLen(line));
}

static void sendPalette(void) {
  static char line[4 + 256 * 6 + 1];
  static const char hex[] = "0123456789abcdef";
  UInt16 i, n = 4;
  palSent = true;
  if (palErr) {
    StrPrintF(line, "pal err 0x%lx\n", (UInt32)(UInt16)palErr);
    send(line, StrLen(line));
    return;
  }
  StrCopy(line, "pal ");
  for (i = 0; i < 256; i++) {
    line[n++] = hex[pal[i].r >> 4]; line[n++] = hex[pal[i].r & 15];
    line[n++] = hex[pal[i].g >> 4]; line[n++] = hex[pal[i].g & 15];
    line[n++] = hex[pal[i].b >> 4]; line[n++] = hex[pal[i].b & 15];
  }
  line[n++] = '\n';
  send(line, n);
}

static void tone(UInt16 freq, UInt16 ms, UInt8 amp) {
  SndCommandType c;
  MemSet(&c, sizeof(c), 0);
  c.cmd = sndCmdFrqOn;           // returns at once; FreqDurationAmp blocks the whole tone (SoundMgr.h)
  c.param1 = freq;
  c.param2 = ms;
  c.param3 = amp > sndMaxAmp ? sndMaxAmp : amp;
  SndDoCmd(NULL, &c, true);
  tones++;
  status();
}

/* A bitmap of the asked depth, made when the format changes. On failure there
 * is no bitmap and frameBytes is 0, so the packet is read into junk. */
static Boolean useDepth(UInt8 d) {
  Err e = 0;
  Coord w, h;
  UInt16 rowBytes;
  if (d != 1 && d != 2 && d != 4 && d != 8 && d != 16) { StrPrintF(err, "fmt %lu", (UInt32)d); return false; }
  if (bmp && depth == d) return true;
  if (bmp) BmpDelete(bmp);
  bmp = NULL; bits = NULL; frameBytes = 0;
  depth = d;
  if (d == 16 && !screen16) {
    UInt32 d16 = 16;
    screen16 = true;
    WinScreenMode(winScreenModeSet, NULL, NULL, &d16, NULL);
  }
  bmp = BmpCreate(W, H, d, NULL, &e);
  if (!bmp) { StrPrintF(err, "bmp%lu 0x%lx", (UInt32)d, (UInt32)(UInt16)e); return false; }
  BmpGetDimensions(bmp, &w, &h, &rowBytes);
  if (rowBytes != (UInt16)W * d / 8) {
    StrPrintF(err, "row %lu", (UInt32)rowBytes);
    BmpDelete(bmp); bmp = NULL;
    return false;
  }
  bits = (UInt8 *)BmpGetBits(bmp);
  frameBytes = (UInt32)rowBytes * H;
  err[0] = 0;
  return true;
}

/* The header is done: size the payload and pick where it goes. */
static void frameHeader(UInt8 fmt, UInt32 len) {
  need = len;
  got = 0;
  if (!useDepth(fmt) || need != frameBytes) {
    drops++;
    status();
  }
}

/* The first build's loop with a longer header. Reads until the port is empty,
 * and hands back to the event loop after a drawn frame or ROUNDS reads so a
 * link that never goes quiet cannot starve the events. */
static void pump(void) {
  UInt32 avail, n;
  Err e;
  UInt8 b;
  UInt16 rounds = 0;
  if (!portOpen) return;
  while (rounds++ < ROUNDS) {
    e = SrmReceiveCheck(port, &avail);
    if (e || avail == 0) {
      if (e) lastErr = e;
      SrmClearErr(port);
      return;
    }
    if (state < hdrLen || state < 2) {
      SrmReceive(port, &b, 1, 0, &e);
      if (e) { lastErr = e; SrmClearErr(port); state = 0; return; }
      bytesIn++;
      if (state == 0 && b != 'P') continue;
      if (state == 1) {
        if (b == 'F') hdrLen = 5;
        else if (b == 'T') hdrLen = 7;
        else { state = 0; continue; }
      }
      if (state == 2 && hdr[1] == 'F' && b == 0x0c) hdrLen = 4;   // the first build's header: len_hi of 3200
      hdr[state++] = b;
      hdrBytes++;
      if (state < 2 || state < hdrLen) continue;
      if (hdrLen == 7) {
        tone(((UInt16)hdr[2] << 8) | hdr[3], ((UInt16)hdr[4] << 8) | hdr[5], hdr[6]);
        state = 0; hdrLen = 0;
      } else if (hdrLen == 4) {
        frameHeader(1, ((UInt32)hdr[2] << 8) | hdr[3]);
      } else {
        frameHeader(hdr[2], ((UInt32)hdr[3] << 8) | hdr[4]);
      }
      if (state && need == 0) { state = 0; hdrLen = 0; }
      continue;
    }
    n = need - got;
    if (n > avail) n = avail;
    if (bits && need == frameBytes) {
      n = SrmReceive(port, bits + got, n, 0, &e);
    } else {
      UInt8 junk[64];
      if (n > sizeof(junk)) n = sizeof(junk);
      n = SrmReceive(port, junk, n, 0, &e);
    }
    got += n;
    bytesIn += n;
    if (e) { lastErr = e; SrmClearErr(port); state = 0; hdrLen = 0; return; }
    if (got >= need) {
      state = 0; hdrLen = 0;
      if (bits && need == frameBytes) {
        WinDrawBitmap(bmp, 0, 0);
        if (!frames) err[0] = 0;
        frames++;
        status();
        if (depth == 8 && !palSent) sendPalette();
        return;
      }
    }
  }
}

static Boolean mainHandler(EventType *e) {
  switch (e->eType) {
  case frmOpenEvent:
    FrmDrawForm(FrmGetActiveForm());
    WinEraseWindow();
    WinDrawChars("pframe", 6, 2, 2);
    openLink();
    return true;
  case penDownEvent:
    if (e->screenY < 14) { reopen(); return true; }
    sendPen(e->screenX, e->screenY, 1);
    return true;
  case penMoveEvent:
    sendPen(e->screenX, e->screenY, 1);
    return true;
  case penUpEvent:
    sendPen(e->screenX, e->screenY, 0);
    return true;
  default:
    return false;
  }
}

static Boolean appHandler(EventType *e) {
  if (e->eType == frmLoadEvent) {
    FormType *f = FrmInitForm(e->data.frmLoad.formID);
    FrmSetActiveForm(f);
    FrmSetEventHandler(f, mainHandler);
    return true;
  }
  return false;
}

UInt32 PilotMain(UInt16 cmd, MemPtr pbp, UInt16 flags) {
  EventType e;
  Err er;
  UInt32 rom;

  if (cmd != sysAppLaunchCmdNormalLaunch) return 0;
  FtrGet(sysFtrCreator, sysFtrNumROMVersion, &rom);
  if (rom < sysMakeROMVersion(4, 0, 0, sysROMStageRelease, 0))
    return sysErrRomIncompatible;

  palErr = WinPalette(winPaletteGet, 0, 256, pal);
  if (!useDepth(1)) return memErrNotEnoughSpace;
  MemSet(bits, ONE_BIT, 0);
  lastTick = TimGetTicks();

  FrmGotoForm(MainForm);
  do {
    EvtGetEvent(&e, 1);
    pump();
    tick();
    if (e.eType == nilEvent) { EvtResetAutoOffTimer(); continue; }
    if (SysHandleEvent(&e)) continue;
    if (MenuHandleEvent(NULL, &e, &er)) continue;
    if (appHandler(&e)) continue;
    FrmDispatchEvent(&e);
  } while (e.eType != appStopEvent);

  closeLink();
  FrmCloseAllForms();
  if (bmp) BmpDelete(bmp);
  if (screen16) WinScreenMode(winScreenModeSetToDefaults, NULL, NULL, NULL, NULL);
  return 0;
}
