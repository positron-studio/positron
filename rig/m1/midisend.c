// midisend.c — notes in on stdin, CoreMIDI out. The missing half of playing
// Ableton Live from a socket.
//
//   clang -O2 -o midisend midisend.c -framework CoreMIDI -framework CoreFoundation
//   ./midisend "IAC Driver Bus 1"        then type:  on 60 100   /  off 60  /  cc 74 40
//
// ⚠️ WHY NOT `sendmidi`. It is the obvious tool and it does not build here:
// brew's `gbevin/tools/sendmidi` refuses with "A full installation of Xcode.app
// is required — installing just the Command Line Tools is not sufficient", and
// this machine has only the Command Line Tools. This is eighty lines against a
// framework that is already on every Mac, so it is the smaller dependency.
//
// ⚠️ ONE PROCESS, HELD OPEN, READING STDIN. A tool that sends one note and exits
// pays CoreMIDI client setup per note — measured elsewhere in this repo as the
// difference between an instrument and a demonstration. It also means note-off
// can never be lost to a process that has already gone.
#include <mach/mach_time.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <CoreMIDI/CoreMIDI.h>
#include <CoreFoundation/CoreFoundation.h>

static MIDIClientRef client;
static MIDIPortRef port;
static MIDIEndpointRef dest;

/** Every destination CoreMIDI can see, so a wrong name is a list rather than a
 *  silence. A MIDI name that does not exist is the failure that looks exactly
 *  like a synth that is not making sound. */
static void list_destinations(void) {
  ItemCount n = MIDIGetNumberOfDestinations();
  fprintf(stderr, "%lu MIDI destinations:\n", (unsigned long)n);
  for (ItemCount i = 0; i < n; i++) {
    MIDIEndpointRef e = MIDIGetDestination(i);
    CFStringRef nm = NULL;
    MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &nm);
    char buf[256] = "?";
    if (nm) { CFStringGetCString(nm, buf, sizeof buf, kCFStringEncodingUTF8); CFRelease(nm); }
    fprintf(stderr, "  [%lu] %s\n", (unsigned long)i, buf);
  }
}

static MIDIEndpointRef find_destination(const char *want) {
  ItemCount n = MIDIGetNumberOfDestinations();
  for (ItemCount i = 0; i < n; i++) {
    MIDIEndpointRef e = MIDIGetDestination(i);
    CFStringRef nm = NULL;
    MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &nm);
    char buf[256] = "";
    if (nm) { CFStringGetCString(nm, buf, sizeof buf, kCFStringEncodingUTF8); CFRelease(nm); }
    // Substring, case-insensitive: the IAC port is variously "IAC Driver Bus 1"
    // and "IAC Driver (Bus 1)" depending on where you read it, and a caller
    // should not have to know which spelling this machine uses.
    if (strcasestr(buf, want)) { fprintf(stderr, "using [%lu] %s\n", (unsigned long)i, buf); return e; }
  }
  return 0;
}

static void send3(unsigned char a, unsigned char b, unsigned char c) {
  MIDIPacketList list;
  MIDIPacket *p = MIDIPacketListInit(&list);
  unsigned char data[3] = { a, b, c };
  // Timestamp 0 = "now". This tool exists to be played, not sequenced; a
  // schedule belongs to whatever is upstream of it.
  MIDIPacketListAdd(&list, sizeof list, p, mach_absolute_time(), 3, data);
  MIDISend(port, dest, &list);
}

int main(int argc, char **argv) {
  const char *want = argc > 1 ? argv[1] : "IAC";
  MIDIClientCreate(CFSTR("positron-midisend"), NULL, NULL, &client);
  MIDIOutputPortCreate(client, CFSTR("out"), &port);
  dest = find_destination(want);
  if (!dest) {
    fprintf(stderr, "no MIDI destination matching \"%s\"\n", want);
    list_destinations();
    return 1;
  }
  // ⚠️ SAY READY ON STDOUT, so a caller can WAIT for it rather than sleeping a
  // guessed amount. A note sent before the port exists goes nowhere and reports
  // nothing, which is the same silence as every other failure here.
  printf("ready\n");
  fflush(stdout);

  char line[256];
  while (fgets(line, sizeof line, stdin)) {
    char verb[16]; int a = 0, b = 0, ch = 0;
    int got = sscanf(line, "%15s %d %d %d", verb, &a, &b, &ch);
    if (got < 2) continue;
    unsigned char c = (unsigned char)(ch & 15);
    if (!strcmp(verb, "on"))        send3(0x90 | c, a & 127, (got >= 3 ? b : 100) & 127);
    else if (!strcmp(verb, "off"))  send3(0x80 | c, a & 127, 0);
    else if (!strcmp(verb, "cc"))   send3(0xb0 | c, a & 127, b & 127);
    else if (!strcmp(verb, "prog")) send3(0xc0 | c, a & 127, 0);
    else if (!strcmp(verb, "panic")) {
      // All notes off on every channel. A hung note on somebody else's DAW is
      // the rudest thing this program can leave behind.
      for (int k = 0; k < 16; k++) send3(0xb0 | k, 123, 0);
    }
  }
  // stdin closed: leave nothing sounding.
  for (int k = 0; k < 16; k++) send3(0xb0 | k, 123, 0);
  return 0;
}
