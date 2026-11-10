/* frame: 160x160 frames in over the USB serial link at 1, 2, 4, 8 or 16 bit,
 * stylus out.
 * In:  'P' 'F' fmt len_hi len_lo, then len bytes. fmt is the bit depth:
 *      1 (3200 B), 2 grey (6400), 4 grey (12800), 8 system palette (25600),
 *      16 RGB565 big endian (51200). Rows top to bottom, leftmost pixel in the
 *      most significant bits; below 8 bit, 0 is white. A packet whose len is
 *      not the frame size for its fmt is read and dropped.
 * In:  'P' 'T' freq_hi freq_lo dur_hi dur_lo amp: a tone of freq Hz for dur ms
 *      at amp (0 to sndMaxAmp, clamped), played without waiting; a new tone
 *      cuts the one playing.
 * Out: "p x y d\n" per pen event (d is 1 while down); once, after the first
 *      frame, "pal " and 256 rrggbb hex entries of the system palette, or
 *      "pal err 0x..".
 * Status line: d<fmt> f<frames> <fps measured here> <KB/s>, t<tones> once one played. */
#include <PalmOS.h>
#include "frame.h"

#define W 160
#define H 160
#define SKIP_CAP 512

static UInt16 port;
static Boolean portOpen;
static UInt8 rxbuf[16384];
static BitmapType *bmp;
static UInt8 *bits;
static UInt8 depth;
static UInt32 frameBytes;
static UInt16 state;
static UInt32 need, got;
static UInt8 hdr[7];
static UInt8 hdrLen;            /* 5 for a frame, 7 for a tone, set by the second byte */
static UInt16 tones;
static UInt32 frames, bytesIn;
static Boolean palSent;
static RGBColorType pal[256];
static Err palErr;
static UInt32 lastTick, lastFrames, lastBytes;
static UInt16 fps10, kbps;
static char err[24];
static UInt16 drops;

static void status(void) {
  RectangleType r;
  char s[48];
  StrPrintF(s, "d%u f%lu %u.%u/s %uKB/s", (UInt16)depth, frames, fps10 / 10, fps10 % 10, kbps);
  if (tones) StrPrintF(s + StrLen(s), " t%u", tones);
  if (drops) StrPrintF(s + StrLen(s), " x%u", drops);
  if (err[0]) StrPrintF(s + StrLen(s), " %s", err);
  RctSetRectangle(&r, 0, 148, W, 12);
  WinEraseRectangle(&r, 0);
  WinDrawChars(s, StrLen(s), 2, 148);
}

/* Once a second: frames per second and KB per second over the last interval. */
static void tick(void) {
  UInt32 now = TimGetTicks(), dt = now - lastTick, tps = SysTicksPerSecond();
  if (dt < tps) return;
  fps10 = (UInt16)((frames - lastFrames) * 10 * tps / dt);
  kbps = (UInt16)((bytesIn - lastBytes) * tps / dt / 1024);
  lastTick = now; lastFrames = frames; lastBytes = bytesIn;
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
    StrPrintF(err, "open 0x%x", e);
    status();
    return;
  }
  portOpen = true;
  SrmSetReceiveBuffer(port, rxbuf, sizeof(rxbuf));
  StrCopy(err, "waiting");
  status();
}

static void closeLink(void) {
  if (!portOpen) return;
  SrmSetReceiveBuffer(port, NULL, 0);
  SrmClose(port);
  portOpen = false;
}

static void send(const char *s, UInt16 n) {
  Err e;
  if (!portOpen) return;
  SrmSend(port, s, n, &e);
  if (e) SrmClearErr(port);
}

static void sendPen(Int16 x, Int16 y, int down) {
  char line[24];
  StrPrintF(line, "p %d %d %d\n", x, y, down);
  send(line, StrLen(line));
}

static void sendPalette(void) {
  static char line[4 + 256 * 6 + 1];
  static const char hex[] = "0123456789abcdef";
  UInt16 i, n = 4;
  palSent = true;
  if (palErr) {
    StrPrintF(line, "pal err 0x%x\n", palErr);
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

/* A bitmap of the asked depth, made when the format changes. */
static Boolean useDepth(UInt8 d) {
  Err e;
  Coord w, h;
  UInt16 rowBytes;
  if (d != 1 && d != 2 && d != 4 && d != 8 && d != 16) return false;
  if (bmp && depth == d) return true;
  if (bmp) { BmpDelete(bmp); bmp = NULL; bits = NULL; }
  depth = d;
  frameBytes = 0;
  bmp = BmpCreate(W, H, d, NULL, &e);
  if (!bmp) { StrPrintF(err, "bmp%u 0x%x", (UInt16)d, e); return false; }
  BmpGetDimensions(bmp, &w, &h, &rowBytes);
  if (rowBytes != (UInt16)W * d / 8) {
    StrPrintF(err, "row %u", rowBytes);
    BmpDelete(bmp); bmp = NULL;
    return false;
  }
  bits = (UInt8 *)BmpGetBits(bmp);
  frameBytes = (UInt32)rowBytes * H;
  err[0] = 0;
  return true;
}

/* Returns true if anything arrived. Hands back to the event loop after each
 * drawn frame and after SKIP_CAP reads, so a link that never goes quiet
 * cannot starve the events (a Home press must still work). */
static Boolean pump(void) {
  UInt32 avail, n;
  Err e;
  UInt8 b;
  UInt16 rounds = 0;
  Boolean any = false;
  if (!portOpen) return false;
  while (rounds++ < SKIP_CAP) {
    if (SrmReceiveCheck(port, &avail) || avail == 0) {
      SrmClearErr(port);
      return any;
    }
    any = true;
    if (state < 2 || state < hdrLen) {
      SrmReceive(port, &b, 1, 0, &e);
      if (e) { SrmClearErr(port); state = 0; return any; }
      if (state == 0 && b != 'P') continue;
      if (state == 1) {
        if (b == 'F') hdrLen = 5;
        else if (b == 'T') hdrLen = 7;
        else { state = 0; continue; }
      }
      hdr[state++] = b;
      if (hdrLen == 7 && state == 7) {
        tone(((UInt16)hdr[2] << 8) | hdr[3], ((UInt16)hdr[4] << 8) | hdr[5], hdr[6]);
        state = 0;
        continue;
      }
      if (hdrLen == 5 && state == 5) {
        need = ((UInt32)hdr[3] << 8) | hdr[4];
        got = 0;
        if (!useDepth(hdr[2]) || need != frameBytes) {
          drops++;
          status();
        }
      }
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
    if (e) { SrmClearErr(port); state = 0; return any; }
    got += n;
    bytesIn += n;
    if (got >= need) {
      state = 0;
      if (bits && need == frameBytes) {
        WinDrawBitmap(bmp, 0, 0);
        if (!frames) err[0] = 0;
        frames++;
        status();
        if (!palSent) sendPalette();
        return any;
      }
    }
  }
  return any;
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
  UInt32 rom, d16 = 16;
  Boolean busy = false;

  if (cmd != sysAppLaunchCmdNormalLaunch) return 0;
  FtrGet(sysFtrCreator, sysFtrNumROMVersion, &rom);
  if (rom < sysMakeROMVersion(4, 0, 0, sysROMStageRelease, 0))
    return sysErrRomIncompatible;

  palErr = WinPalette(winPaletteGet, 0, 256, pal);
  WinScreenMode(winScreenModeSet, NULL, NULL, &d16, NULL);
  if (!useDepth(1)) return memErrNotEnoughSpace;
  MemSet(bits, frameBytes, 0);
  lastTick = TimGetTicks();

  FrmGotoForm(MainForm);
  do {
    EvtGetEvent(&e, busy ? 0 : 1);
    busy = pump();
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
  WinScreenMode(winScreenModeSetToDefaults, NULL, NULL, NULL, NULL);
  return 0;
}
