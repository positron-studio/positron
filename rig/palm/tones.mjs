#!/usr/bin/env node
// Sound tests T1 to T3 for the Palm (plans/plan-palm-sound.md 2): tone packets
// to pframe over the USB serial link, with every send time logged so listen.mjs
// can turn onsets into latency and jitter.
//
//   sudo modprobe visor
//   node tones.mjs /dev/ttyUSB0 t1                  # five beeps, 440 Hz, 300 ms, 1.5 s apart
//   node tones.mjs /dev/ttyUSB0 t2 --step 125       # C major up and down, then a C E G arpeggio
//   node tones.mjs /dev/ttyUSB0 t3                  # eight velocities, then a long note cut short
//   node tones.mjs /dev/ttyUSB0 quiet               # a zero amplitude tone and a 'P' 'Q'
//   The sound build of pframe (Q, N, S and ? packets) adds:
//   node tones.mjs /dev/ttyUSB0 ping                # 'P' '?': prints the Palm's "st ..." line, proof the port is live
//   node tones.mjs /dev/ttyUSB0 notes               # NoteOn: a scale at velocity 100, 8 velocities, a held note cut by Q at 300 ms
//   node tones.mjs /dev/ttyUSB0 hold                # a held note and no more packets: the watchdog should cut it at about 2 s
//   node tones.mjs /dev/ttyUSB0 smf list            # the System MIDI Sounds records, by index
//   node tones.mjs /dev/ttyUSB0 smf 0               # plays record 0 (a Q or a hard button stops it)
//   node tones.mjs out.bin t1                       # packets to a file, no device
//   --log sends.jsonl   one line per packet: {"t": epoch ms, "hz", "ms", "amp", "test"}
//   --max N             the amplitude cap, 0 to 64 (sndMaxAmp), default 64
//   --hz F              T1's frequency
//
// Packet (frame.c): 'P' 'T' freq_hi freq_lo dur_hi dur_lo amp. Only one process
// may write the tty: send.mjs running at the same time interleaves bytes inside
// a packet and the Palm drops or misreads both.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const VALUED = ['--log', '--max', '--hz', '--step', '--vel'];
const pos = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
const dev = pos[0] || '/dev/ttyUSB0';
const test = pos[1] || 't1';
const MAX = Math.max(0, Math.min(64, Number(opt('--max', 64))));
const step = Number(opt('--step', 125));
const logFile = opt('--log', null);
const t1hz = Number(opt('--hz', 440));

const midiHz = (n) => Math.round(440 * 2 ** ((n - 69) / 12));
const ampOf = (a) => Math.max(0, Math.min(MAX, Math.round(a)));
const packet = (hz, ms, amp) => Buffer.from([0x50, 0x54, hz >> 8, hz & 0xff, ms >> 8, ms & 0xff, amp]);
const notePkt = (key, vel, ms) => Buffer.from([0x50, 0x4e, key, vel, ms >> 8, ms & 0xff]);
const QUIET = Buffer.from([0x50, 0x51]);
const VEL = Math.max(1, Math.min(127, Number(opt('--vel', 100))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each entry: [hz, ms, amp, wait after send in ms, label], or {buf, wait, label, hz, amp}
// for the newer packets. A note's hz and amp are logged so listen.mjs can match it.
function plan(name) {
  const out = [];
  const N = (key, vel, ms, wait, label) => out.push({ buf: notePkt(key, vel, ms), wait, label, hz: midiHz(key), amp: vel, ms });
  if (name === 'notes') {
    const scale = [60, 62, 64, 65, 67, 69, 71, 72];
    for (const n of scale) N(n, VEL, Math.max(20, step - 10), step, `note ${n}`);
    out.push({ buf: QUIET, wait: 600, label: 'Q' });
    for (const vel of [16, 32, 48, 64, 80, 96, 112, 127]) N(69, vel, 400, 700, `vel ${vel}`);
    N(69, VEL, 0, 300, 'held');
    out.push({ buf: QUIET, wait: 1200, label: 'Q at 300' });
  } else if (name === 'hold') {
    N(69, VEL, 0, 4000, 'held, then silence');
  } else if (name === 'smf') {
    const which = pos[2] ?? 'list';
    const n = which === 'list' ? 255 : Number(which);
    out.push({ buf: Buffer.from([0x50, 0x53, n]), wait: which === 'list' ? 1500 : Number(opt('--wait', 15000)), label: `smf ${which}`, hz: 1, amp: 1 });
  } else if (name === 'ping') {
    out.push({ buf: Buffer.from([0x50, 0x3f]), wait: 1000, label: 'ping' });
  } else if (name === 't1') {
    for (let i = 0; i < 5; i++) out.push([t1hz, 300, MAX, 1500, `beep ${i + 1}`]);
  } else if (name === 't2') {
    const scale = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60];
    for (const n of scale) out.push([midiHz(n), Math.max(20, step - 10), MAX, step, `scale ${n}`]);
    out.push([0, 0, 0, 600, 'gap']);
    // A chord as rapid notes: the Palm has one voice, so C E G cycles at 30 ms a note.
    for (let i = 0; i < 33; i++) out.push([midiHz([60, 64, 67][i % 3]), 30, MAX, 30, `arp ${i}`]);
  } else if (name === 't3') {
    // Velocity mapped to amplitude the way sndCmdNoteOn is documented to (0 to 127 onto 0 to sndMaxAmp).
    for (const vel of [16, 32, 48, 64, 80, 96, 112, 127]) out.push([midiHz(69), 400, ampOf(vel / 127 * 64), 800, `vel ${vel}`]);
    // Note off: a 2 s note, then after 300 ms a zero amplitude tone. If the first tone blocks
    // the Palm (sndCmdFreqDurationAmp, SoundMgr.h), the cut arrives late and the note runs the full 2 s.
    out.push([midiHz(69), 2000, MAX, 300, 'long note']);
    out.push([midiHz(69), 1, 0, 2000, 'off']);
  } else if (name === 'quiet') {
    out.push([440, 1, 0, 50, 'quiet']);
  } else {
    console.error('test is t1, t2, t3, quiet, ping, notes, hold or smf'); process.exit(2);
  }
  return out;
}

const list = plan(test);
const isDev = dev.startsWith('/dev/');
// The visor driver refuses some stty settings and says so; raw still takes.
if (isDev) { try { execFileSync('stty', ['-F', dev, '115200', 'raw', '-echo'], { stdio: 'ignore' }); } catch {} }
const fd = fs.openSync(dev, isDev ? 'r+' : 'w');
// What the Palm says back (pen lines, "st", "smf", "stop") is printed as it arrives.
let reader = null;
if (isDev) {
  reader = fs.createReadStream(dev, { flags: 'r' });
  let line = '';
  reader.on('data', (b) => {
    line += b.toString('latin1');
    let i;
    while ((i = line.indexOf('\n')) >= 0) { const l = line.slice(0, i); line = line.slice(i + 1); if (!l.startsWith('p ')) console.log(`  palm: ${l}`); }
  });
  reader.on('error', () => {});
}
const log = logFile ? fs.openSync(logFile, 'a') : null;
let stopped = false;
process.on('SIGINT', () => { stopped = true; });

console.log(`${test}: ${list.length} packets to ${dev}, amp cap ${MAX}`);
const t0 = performance.now();
for (const e of list) {
  if (stopped) break;
  if (!Array.isArray(e)) {
    fs.writeSync(fd, e.buf);
    const t = Date.now();
    if (log && e.hz) fs.writeSync(log, JSON.stringify({ t, hz: e.hz, ms: e.ms, amp: e.amp, test, label: e.label }) + '\n');
    console.log(`${(performance.now() - t0).toFixed(1).padStart(8)} ms  ${e.label}`);
    await sleep(e.wait);
    continue;
  }
  const [hz, ms, amp, wait, label] = e;
  if (hz > 0) {
    fs.writeSync(fd, packet(hz, ms, amp));
    const t = Date.now();
    if (log) fs.writeSync(log, JSON.stringify({ t, hz, ms, amp, test, label }) + '\n');
    console.log(`${(performance.now() - t0).toFixed(1).padStart(8)} ms  ${label.padEnd(10)} ${hz} Hz ${ms} ms amp ${amp}`);
  }
  await sleep(wait);
}
// Always end quiet, also after Ctrl-C: a zero amplitude tone for the older build, Q for the sound build.
// The hold test leaves the note to the watchdog on purpose.
if (test !== 'hold' || stopped) fs.writeSync(fd, Buffer.concat([packet(440, 1, 0), QUIET]));
fs.closeSync(fd);
if (log) fs.closeSync(log);
console.log(test === 'hold' && !stopped ? 'done, no quiet sent (the watchdog test)' : stopped ? 'stopped, quiet sent' : 'done, quiet sent');
process.exit(0);
