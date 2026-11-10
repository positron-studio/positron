#!/usr/bin/env node
// Sound tests T1 to T3 for the Palm (plans/plan-palm-sound.md 2): tone packets
// to pframe over the USB serial link, with every send time logged so listen.mjs
// can turn onsets into latency and jitter.
//
//   sudo modprobe visor
//   node tones.mjs /dev/ttyUSB1 t1                  # five beeps, 440 Hz, 300 ms, 1.5 s apart
//   node tones.mjs /dev/ttyUSB1 t2 --step 125       # C major up and down, then a C E G arpeggio
//   node tones.mjs /dev/ttyUSB1 t3                  # eight velocities, then a long note cut short
//   node tones.mjs /dev/ttyUSB1 quiet               # a zero amplitude tone, to stop whatever plays
//   node tones.mjs out.bin t1                       # packets to a file, no device
//   --log sends.jsonl   one line per packet: {"t": epoch ms, "hz", "ms", "amp", "test"}
//   --max N             the amplitude cap, 0 to 64 (sndMaxAmp), default 32
//   --hz F              T1's frequency
//
// Packet (frame.c): 'P' 'T' freq_hi freq_lo dur_hi dur_lo amp. Only one process
// may write the tty: send.mjs running at the same time interleaves bytes inside
// a packet and the Palm drops or misreads both.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const VALUED = ['--log', '--max', '--hz', '--step'];
const pos = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
const dev = pos[0] || '/dev/ttyUSB1';
const test = pos[1] || 't1';
const MAX = Math.max(0, Math.min(64, Number(opt('--max', 32))));
const step = Number(opt('--step', 125));
const logFile = opt('--log', null);
const t1hz = Number(opt('--hz', 440));

const midiHz = (n) => Math.round(440 * 2 ** ((n - 69) / 12));
const ampOf = (a) => Math.max(0, Math.min(MAX, Math.round(a)));
const packet = (hz, ms, amp) => Buffer.from([0x50, 0x54, hz >> 8, hz & 0xff, ms >> 8, ms & 0xff, amp]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each entry: [hz, ms, amp, wait after send in ms, label].
function plan(name) {
  const out = [];
  if (name === 't1') {
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
    console.error('test is t1, t2, t3 or quiet'); process.exit(2);
  }
  return out;
}

const list = plan(test);
const isDev = dev.startsWith('/dev/');
if (isDev) { try { execFileSync('stty', ['-F', dev, '115200', 'raw', '-echo']); } catch (e) { console.error(`stty: ${e.message.split('\n')[0]}`); } }
const fd = fs.openSync(dev, isDev ? 'r+' : 'w');
const log = logFile ? fs.openSync(logFile, 'a') : null;
let stopped = false;
process.on('SIGINT', () => { stopped = true; });

console.log(`${test}: ${list.length} packets to ${dev}, amp cap ${MAX}`);
const t0 = performance.now();
for (const [hz, ms, amp, wait, label] of list) {
  if (stopped) break;
  if (hz > 0) {
    fs.writeSync(fd, packet(hz, ms, amp));
    const t = Date.now();
    if (log) fs.writeSync(log, JSON.stringify({ t, hz, ms, amp, test, label }) + '\n');
    console.log(`${(performance.now() - t0).toFixed(1).padStart(8)} ms  ${label.padEnd(10)} ${hz} Hz ${ms} ms amp ${amp}`);
  }
  await sleep(wait);
}
// Always end quiet, also after Ctrl-C.
fs.writeSync(fd, packet(440, 1, 0));
fs.closeSync(fd);
if (log) fs.closeSync(log);
console.log(stopped ? 'stopped, quiet sent' : 'done, quiet sent');
