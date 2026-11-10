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
 *      at amp (capped at AMP_CAP), sndCmdFrqOn, returns at once.
 * In:  'P' 'N' key vel dur_hi dur_lo: sndCmdNoteOn, MIDI key, velocity scaled
 *      by AMP_CAP / sndMaxAmp, dur 0 holds until Q or the watchdog; vel 0 is off.
 * In:  'P' 'Q': quiet, stops a tone, a MIDI file and the PCM stream.
 * In:  'P' 'S' n: plays record n of the System MIDI Sounds database with
 *      SndPlaySmf, the blocking hook pumping the link (a Q or a hard key
 *      stops it). n = 255 lists the records instead: "smf <i> <name>\n" each.
 * In:  'P' 'A' len_hi len_lo, then len bytes of 8 bit unsigned PCM at PCM_RATE
 *      into a ring; the stream starts when the ring is half full.
 * In:  'P' '?': answers one "st ..." line with every counter.
 * Out: "stop\n" when a hard button stopped the sound.
 * Watchdog: no packet for 2 s while a sound is meant to be playing: quiet.
 * Line 0 (y 124, once any sound packet came): v<sound mgr version or err>
 *      t<tones> n<notes> m<smf plays> a<ring fill> u<underrun frames> o<overflow bytes> w<watchdog fires> k<key stops>.
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
#define AMP_CAP sndMaxAmp   // full volume: 40 was faint next to the system HotSync tones
#define PCM_RATE 11025
#define RING 8192              /* a power of two: 0.74 s at 11025 Hz */
#define RING_START (RING / 2)
#define vchrNavChangeP1 0x0503 /* palmOneChars.h vchrNavChange */

/* The stream callback runs on the sound thread through PACE, so it finds
 * everything through this struct and touches no global. */
typedef struct {
  UInt8 *buf;
  volatile UInt32 w, r;
  volatile UInt32 under, pulls;
} Ring;

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
static UInt16 tones, notes, smfPlays, wdFires, keyStops;
static UInt32 sndVer;
static Err sndVerErr, streamErr, smfErr;
static Boolean soundShown, inSmf, smfStop;
static UInt32 lastPkt, soundUntil;
static Ring *ring;
static SndStreamRef stream;
static Boolean streamMade, streamOn;
static UInt32 overflow;
static UInt8 payKind;           /* 0 junk, 1 frame, 2 pcm */
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
  if (err[0]) StrPrintF(s + StrLen(s), " %s", err);
  if (soundShown) {
    if (sndVerErr) StrPrintF(s, "v!%lx", (UInt32)(UInt16)sndVerErr); else StrPrintF(s, "v%lu", sndVer);
    StrPrintF(s + StrLen(s), " t%lu n%lu m%lu", (UInt32)tones, (UInt32)notes, (UInt32)smfPlays);
    if (ring) StrPrintF(s + StrLen(s), " a%lu u%lu o%lu", ring->w - ring->r, ring->under, overflow);
    StrPrintF(s + StrLen(s), " w%lu k%lu", (UInt32)wdFires, (UInt32)keyStops);
    if (streamErr) StrPrintF(s + StrLen(s), " A%lx", (UInt32)(UInt16)streamErr);
    if (smfErr) StrPrintF(s + StrLen(s), " M%lx", (UInt32)(UInt16)smfErr);
    RctSetRectangle(&r, 0, 124, W, 12);
    WinEraseRectangle(&r, 0);
    WinDrawChars(s, StrLen(s), 2, 124);
  }
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

static void silence(void);

/* No packet for 2 s while a sound is meant to play: quiet. */
static void watchdog(void) {
  UInt32 now = TimGetTicks();
  if (!soundUntil || inSmf) return;
  if (soundUntil != 0xFFFFFFFFUL && (Int32)(now - soundUntil) >= 0) { soundUntil = 0; return; }
  if (now - lastPkt < 2 * SysTicksPerSecond()) return;
  silence();
  wdFires++;
  status();
}

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

static void sndCmd(UInt8 cmd, Int32 p1, UInt16 p2, UInt16 p3) {
  SndCommandType c;
  MemSet(&c, sizeof(c), 0);
  c.cmd = cmd;
  c.param1 = p1;
  c.param2 = p2;
  c.param3 = p3;
  SndDoCmd(NULL, &c, true);
}

/* Ticks from now for ms, for the watchdog. */
static UInt32 until(UInt16 ms) {
  return TimGetTicks() + (UInt32)ms * SysTicksPerSecond() / 1000 + 1;
}

/* FrqOn and NoteOn return at once; FreqDurationAmp blocks the whole tone (SoundMgr.h). */
static void tone(UInt16 freq, UInt16 ms, UInt8 amp) {
  if (amp > AMP_CAP) amp = AMP_CAP;
  sndCmd(sndCmdFrqOn, freq, ms, amp);
  soundUntil = amp ? until(ms) : 0;
  tones++;
  soundShown = true;
  status();
}

static void note(UInt8 key, UInt8 vel, UInt16 ms) {
  if (key > 127) key = 127;
  if (vel > 127) vel = 127;
  if (vel == 0) { sndCmd(sndCmdQuiet, 0, 0, 0); soundUntil = 0; }
  else {
    if (ms == 0) ms = 65535;
    sndCmd(sndCmdNoteOn, key, ms, (UInt16)vel * AMP_CAP / sndMaxAmp);
    soundUntil = until(ms);
  }
  notes++;
  soundShown = true;
  status();
}

static void streamStop(void) {
  if (streamOn) { SndStreamStop(stream); streamOn = false; }
  if (ring) ring->w = ring->r;
}

static void silence(void) {
  sndCmd(sndCmdQuiet, 0, 0, 0);
  streamStop();
  if (inSmf) smfStop = true;
  soundUntil = 0;
}

static void hardStop(void) {
  silence();
  keyStops++;
  soundShown = true;
  send("stop\n", 5);
  status();
}

/* Pull: the Sound Manager asks for frames and gets what the ring has, silence
 * (0x80) for the rest. No globals here, see Ring. */
static Err pcmPull(void *user, SndStreamRef ch, void *buffer, UInt32 frames) {
  Ring *g = (Ring *)user;
  UInt8 *out = (UInt8 *)buffer;
  UInt32 r = g->r, have = g->w - r, i;
  (void)ch;
  for (i = 0; i < frames && i < have; i++) out[i] = g->buf[(r + i) & (RING - 1)];
  g->r = r + i;
  if (i < frames) { g->under += frames - i; for (; i < frames; i++) out[i] = 0x80; }
  g->pulls++;
  return errNone;
}

static void streamMake(void) {
  if (streamMade || streamErr) return;
  if (!ring) {
    ring = (Ring *)MemPtrNew(sizeof(Ring));
    if (ring) { MemSet(ring, sizeof(Ring), 0); ring->buf = (UInt8 *)MemPtrNew(RING); }
    if (!ring || !ring->buf) { streamErr = memErrNotEnoughSpace; return; }
  }
  if (sndVerErr) { streamErr = sndVerErr; return; }
  streamErr = SndStreamCreate(&stream, sndOutput, PCM_RATE, sndUInt8, sndMono, pcmPull, ring, 512, false);
  if (streamErr) return;
  SndStreamSetVolume(stream, 1024L * AMP_CAP / sndMaxAmp);
  streamMade = true;
}

static void pump(void);
static void tick(void);

/* Called while SndPlaySmf plays: keep the link read (a Q sets smfStop) and
 * stop on a hard key. False aborts the play. */
static Boolean smfHook(void *chanP, UInt32 user, Int32 ticksAvail) {
  (void)chanP; (void)user; (void)ticksAvail;
  pump();
  tick();
  if (KeyCurrentState() & (keyBitHard1 | keyBitHard2 | keyBitHard3 | keyBitHard4 | keyBitPageUp | keyBitPageDown)) {
    keyStops++;
    send("stop\n", 5);
    smfStop = true;
  }
  return !smfStop;
}

static void smfList(void) {
  UInt16 n = 0, i;
  MemHandle h = NULL;
  char line[48];
  if (!SndCreateMidiList(0, true, &n, &h) || !h) { send("smf none\n", 9); return; }
  {
    SndMidiListItemType *it = (SndMidiListItemType *)MemHandleLock(h);
    for (i = 0; i < n; i++) {
      StrPrintF(line, "smf %lu %s\n", (UInt32)i, it[i].name);
      send(line, StrLen(line));
    }
    MemHandleUnlock(h);
  }
  MemHandleFree(h);
}

/* Record n of SndCreateMidiList, played synchronously with the hook above. */
static void smfPlay(UInt8 n) {
  UInt16 count = 0;
  MemHandle lh = NULL, rh;
  SndMidiListItemType item;
  DmOpenRef db;
  UInt16 idx;
  UInt8 *p;
  SndSmfOptionsType o;
  SndSmfCallbacksType cb;
  soundShown = true;
  if (inSmf) return;
  if (n == 255) { smfList(); return; }
  if (!SndCreateMidiList(0, true, &count, &lh) || !lh || n >= count) {
    smfErr = 0x51; if (lh) MemHandleFree(lh); status(); return;
  }
  item = ((SndMidiListItemType *)MemHandleLock(lh))[n];
  MemHandleUnlock(lh);
  MemHandleFree(lh);
  db = DmOpenDatabase(item.cardNo, item.dbID, dmModeReadOnly);
  if (!db) { smfErr = DmGetLastErr(); status(); return; }
  smfErr = DmFindRecordByID(db, item.uniqueRecID, &idx);
  rh = smfErr ? NULL : DmQueryRecord(db, idx);
  if (rh) {
    p = (UInt8 *)MemHandleLock(rh);
    MemSet(&o, sizeof(o), 0);
    MemSet(&cb, sizeof(cb), 0);
    o.dwEndMilliSec = 60000;     /* at most a minute */
    o.amplitude = AMP_CAP;
    o.interruptible = true;      /* a tap or a button also stops it */
    cb.blocking.funcP = (MemPtr)smfHook;
    sndCmd(sndCmdQuiet, 0, 0, 0);
    streamStop();
    inSmf = true; smfStop = false;
    smfPlays++;
    status();
    smfErr = SndPlaySmf(NULL, sndSmfCmdPlay, p + ((SndMidiRecHdrType *)p)->bDataOffset, &o, NULL, &cb, false);
    inSmf = false;
    MemHandleUnlock(rh);
  } else if (!smfErr) smfErr = DmGetLastErr();
  DmCloseDatabase(db);
  lastPkt = TimGetTicks();
  status();
}

static void ping(void) {
  char line[128];
  StrPrintF(line, "st v%lu t%lu n%lu m%lu M%lx f%lu b%lu x%lu w%lu k%lu", sndVerErr ? 0 : sndVer, (UInt32)tones, (UInt32)notes,
            (UInt32)smfPlays, (UInt32)(UInt16)smfErr, frames, bytesIn, (UInt32)drops, (UInt32)wdFires, (UInt32)keyStops);
  if (ring) StrPrintF(line + StrLen(line), " a%lu u%lu o%lu p%lu", ring->w - ring->r, ring->under, overflow, ring->pulls);
  StrPrintF(line + StrLen(line), " A%lx on%lu\n", (UInt32)(UInt16)streamErr, (UInt32)streamOn);
  send(line, StrLen(line));
}

/* A no payload packet, or the head of a payload one. */
static void packet(void) {
  lastPkt = TimGetTicks();
  switch (hdr[1]) {
  case 'T': tone(((UInt16)hdr[2] << 8) | hdr[3], ((UInt16)hdr[4] << 8) | hdr[5], hdr[6]); break;
  case 'N': note(hdr[2], hdr[3], ((UInt16)hdr[4] << 8) | hdr[5]); break;
  case 'Q': silence(); soundShown = true; status(); break;
  case 'S': smfPlay(hdr[2]); break;
  case '?': ping(); break;
  case 'A':
    need = ((UInt32)hdr[2] << 8) | hdr[3]; got = 0;
    streamMake();
    payKind = ring ? 2 : 0;
    soundShown = true;
    break;
  }
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
        else if (b == 'N') hdrLen = 6;
        else if (b == 'Q' || b == '?') hdrLen = 2;
        else if (b == 'S') hdrLen = 3;
        else if (b == 'A') hdrLen = 4;
        else { state = 0; continue; }
      }
      if (state == 2 && hdr[1] == 'F' && b == 0x0c) hdrLen = 4;   // the first build's header: len_hi of 3200
      hdr[state++] = b;
      hdrBytes++;
      if (state < 2 || state < hdrLen) continue;
      need = 0;
      if (hdr[1] == 'F') {
        if (hdrLen == 4) frameHeader(1, ((UInt32)hdr[2] << 8) | hdr[3]);
        else frameHeader(hdr[2], ((UInt32)hdr[3] << 8) | hdr[4]);
        payKind = (bits && need == frameBytes) ? 1 : 0;
      } else {
        UInt8 kind = hdr[1];
        state = 0; hdrLen = 0;   /* a hook inside smfPlay pumps too */
        packet();
        if (kind == 'A' && need) { state = 4; hdrLen = 4; hdr[1] = 'A'; }
        if (kind == 'S') return;
      }
      if (state && need == 0) { state = 0; hdrLen = 0; }
      continue;
    }
    n = need - got;
    if (n > avail) n = avail;
    if (payKind == 1) {
      n = SrmReceive(port, bits + got, n, 0, &e);
    } else if (payKind == 2 && ring->w - ring->r < RING) {
      UInt32 w = ring->w, room = RING - (w - ring->r), run = RING - (w & (RING - 1));
      if (n > room) n = room;
      if (n > run) n = run;
      n = SrmReceive(port, ring->buf + (w & (RING - 1)), n, 0, &e);
      ring->w = w + n;
      lastPkt = TimGetTicks();
      soundUntil = 0xFFFFFFFFUL;
      if (!streamOn && streamMade && ring->w - ring->r >= RING_START) {
        streamErr = SndStreamStart(stream);
        streamOn = !streamErr;
      }
    } else {
      UInt8 junk[64];
      if (n > sizeof(junk)) n = sizeof(junk);
      n = SrmReceive(port, junk, n, 0, &e);
      if (payKind == 2) overflow += n;
    }
    got += n;
    bytesIn += n;
    if (e) { lastErr = e; SrmClearErr(port); state = 0; hdrLen = 0; return; }
    if (got >= need) {
      state = 0; hdrLen = 0;
      if (payKind == 1) {
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
  case keyDownEvent: {
    WChar c = e->data.keyDown.chr;
    if (!(e->data.keyDown.modifiers & commandKeyMask)) return false;
    if ((c >= vchrHard1 && c <= vchrHard4) || c == vchrPageUp || c == vchrPageDown ||
        (c >= vchrRockerUp && c <= vchrRockerCenter) || c == vchrNavChangeP1) {
      hardStop();
      return true;
    }
    return false;
  }
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
  sndVerErr = FtrGet(sysFileCSoundMgr, sndFtrIDVersion, &sndVer);
  if (!useDepth(1)) return memErrNotEnoughSpace;
  MemSet(bits, ONE_BIT, 0);
  lastTick = TimGetTicks();

  FrmGotoForm(MainForm);
  do {
    EvtGetEvent(&e, 1);
    pump();
    tick();
    watchdog();
    if (e.eType == nilEvent) { EvtResetAutoOffTimer(); continue; }
    if (e.eType == keyDownEvent && mainHandler(&e)) continue;   /* hard keys stop sound, before the system launches an app */
    if (SysHandleEvent(&e)) continue;
    if (MenuHandleEvent(NULL, &e, &er)) continue;
    if (appHandler(&e)) continue;
    FrmDispatchEvent(&e);
  } while (e.eType != appStopEvent);

  silence();
  if (streamMade) SndStreamDelete(stream);
  if (ring) { if (ring->buf) MemPtrFree(ring->buf); MemPtrFree(ring); }
  closeLink();
  FrmCloseAllForms();
  if (bmp) BmpDelete(bmp);
  if (screen16) WinScreenMode(winScreenModeSetToDefaults, NULL, NULL, NULL, NULL);
  return 0;
}
