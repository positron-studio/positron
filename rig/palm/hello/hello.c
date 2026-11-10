/* hello: opens one form and draws "positron" and colour rectangles. */
#include <PalmOS.h>
#include "hello.h"

static void draw(void) {
  static const UInt8 rgb[6][3] = {
    {255, 0, 0}, {255, 160, 0}, {255, 255, 0},
    {0, 200, 0}, {0, 120, 255}, {160, 0, 255}
  };
  RGBColorType c, prev;
  RectangleType r;
  Int16 i;

  WinEraseWindow();
  FrmDrawForm(FrmGetActiveForm());
  for (i = 0; i < 6; i++) {
    c.index = 0; c.r = rgb[i][0]; c.g = rgb[i][1]; c.b = rgb[i][2];
    WinSetForeColorRGB(&c, &prev);
    RctSetRectangle(&r, 10 + i * 24, 40, 20, 60);
    WinDrawRectangle(&r, 0);
    WinSetForeColorRGB(&prev, NULL);
  }
  FntSetFont(largeBoldFont);
  WinDrawChars("positron", 8, 50, 115);
  FntSetFont(stdFont);
  WinDrawChars("press Home to leave", 19, 30, 140);
}

static Boolean mainHandler(EventType *e) {
  if (e->eType == frmOpenEvent) { draw(); return true; }
  return false;
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
  UInt32 depth = 16;
  UInt32 rom;

  if (cmd != sysAppLaunchCmdNormalLaunch) return 0;
  FtrGet(sysFtrCreator, sysFtrNumROMVersion, &rom);
  if (rom < sysMakeROMVersion(4, 0, 0, sysROMStageRelease, 0))
    return sysErrRomIncompatible;
  WinScreenMode(winScreenModeSet, NULL, NULL, &depth, NULL);

  FrmGotoForm(MainForm);
  do {
    EvtGetEvent(&e, evtWaitForever);
    if (SysHandleEvent(&e)) continue;
    if (MenuHandleEvent(NULL, &e, &err)) continue;
    if (appHandler(&e)) continue;
    FrmDispatchEvent(&e);
  } while (e.eType != appStopEvent);
  FrmCloseAllForms();
  return 0;
}
