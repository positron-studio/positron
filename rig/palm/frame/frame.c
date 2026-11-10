/* frame: 160x160 1 bit frames in over the USB serial link, stylus out.
 * In:  'P' 'F' len_hi len_lo, then len bytes; len 3200 is one 160x160 frame,
 *      rows of 20 bytes, most significant bit leftmost, 1 = ink.
 * Out: "p x y d\n" per pen event, d is 1 while the pen is down.
 * UNTESTED on the device. */
#include <PalmOS.h>
#include "frame.h"

#define W 160
#define H 160
#define FRAME_BYTES (W / 8 * H)

static UInt16 port;
static Boolean portOpen;
static Err openErr;
static UInt8 rxbuf[4096];
static BitmapType *bmp;
static UInt8 *bits;
static UInt16 state, need, got;
static UInt8 hdr[4];
static UInt32 frames;

static void status(const char *s) {
  RectangleType r;
  RctSetRectangle(&r, 0, 148, W, 12);
  WinEraseRectangle(&r, 0);
  WinDrawChars(s, StrLen(s), 2, 148);
}

static void openLink(void) {
  SrmOpenConfigType cfg;
  char msg[40];
  MemSet(&cfg, sizeof(cfg), 0);
  cfg.baud = 115200;
  openErr = SrmExtOpen(serPortCradleUSBPort, &cfg, sizeof(cfg), &port);
  if (openErr) openErr = SrmOpen(serPortCradlePort, 115200, &port);
  if (openErr) {
    StrPrintF(msg, "open failed 0x%x", openErr);
    status(msg);
    return;
  }
  portOpen = true;
  SrmSetReceiveBuffer(port, rxbuf, sizeof(rxbuf));
  status("link open, waiting for PF");
}

static void closeLink(void) {
  if (!portOpen) return;
  SrmSetReceiveBuffer(port, NULL, 0);
  SrmClose(port);
  portOpen = false;
}

static void sendPen(Int16 x, Int16 y, int down) {
  char line[24];
  Err err;
  if (!portOpen) return;
  StrPrintF(line, "p %d %d %d\n", x, y, down);
  SrmSend(port, line, StrLen(line), &err);
  if (err) SrmClearErr(port);
}

/* Header 'P' 'F' len; a frame of any other length is read and dropped. */
static void pump(void) {
  UInt32 avail, n;
  Err err;
  UInt8 b;
  if (!portOpen) return;
  for (;;) {
    if (SrmReceiveCheck(port, &avail) || avail == 0) {
      SrmClearErr(port);
      return;
    }
    if (state < 4) {
      SrmReceive(port, &b, 1, 0, &err);
      if (err) { SrmClearErr(port); state = 0; return; }
      if ((state == 0 && b != 'P') || (state == 1 && b != 'F')) { state = 0; continue; }
      hdr[state++] = b;
      if (state == 4) { need = ((UInt16)hdr[2] << 8) | hdr[3]; got = 0; }
      continue;
    }
    n = need - got;
    if (n > avail) n = avail;
    if (need == FRAME_BYTES) {
      n = SrmReceive(port, bits + got, n, 0, &err);
    } else {
      UInt8 junk[64];
      if (n > sizeof(junk)) n = sizeof(junk);
      n = SrmReceive(port, junk, n, 0, &err);
    }
    if (err) { SrmClearErr(port); state = 0; return; }
    got += n;
    if (got >= need) {
      state = 0;
      if (need == FRAME_BYTES) {
        char msg[48];
        WinDrawBitmap(bmp, 0, 0); frames++;
        StrPrintF(msg, "f%lu %x %x %x %x", frames, bits[0], bits[1], bits[20], bits[3199]);
        status(msg);
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
  Err err;
  UInt32 rom;

  if (cmd != sysAppLaunchCmdNormalLaunch) return 0;
  FtrGet(sysFtrCreator, sysFtrNumROMVersion, &rom);
  if (rom < sysMakeROMVersion(4, 0, 0, sysROMStageRelease, 0))
    return sysErrRomIncompatible;

  bmp = BmpCreate(W, H, 1, NULL, &err);
  if (!bmp) return err;
  bits = (UInt8 *)BmpGetBits(bmp);
  MemSet(bits, FRAME_BYTES, 0);

  FrmGotoForm(MainForm);
  do {
    EvtGetEvent(&e, 1);
    pump();
    if (e.eType == nilEvent) { EvtResetAutoOffTimer(); continue; }
    if (SysHandleEvent(&e)) continue;
    if (MenuHandleEvent(NULL, &e, &err)) continue;
    if (appHandler(&e)) continue;
    FrmDispatchEvent(&e);
  } while (e.eType != appStopEvent);

  closeLink();
  FrmCloseAllForms();
  BmpDelete(bmp);
  return 0;
}
