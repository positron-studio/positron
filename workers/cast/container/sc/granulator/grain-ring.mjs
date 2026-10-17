// The grain ring's program and its patches. BufWr writes the input round an 8 s mono buffer,
// GrainBuf reads grains, SendReply reports each. Every number a patch moves is a named control,
// so a patch is `/n_set` values, never a new graph. The program's details are in the lessons.
// See lessons/page-granulator.md#granulator-13
import { bootScsynth } from '../shell/scsynth.mjs';
import { compile } from '../shell/sclang-lite.mjs';

export const PROGRAM = `// grains read out of an eight second ring of what comes in
{
  var buf = \\buf.kr(0);
  var frames = BufFrames.kr(buf);
  var secs = BufDur.kr(buf);
  // what comes in, one channel
  var input = Mix(In.ar(\\inbus.kr(2), 2)) * 0.5;
  // write what comes in round the ring, until freeze holds it
  var freeze = \\freeze.kr(0);
  var write = Phasor.ar(0, 1 - freeze, 0, frames);
  // a tape slowing down: over every 1 / ramp seconds both heads fall by drop, then spring back
  var slow = 1 - (\\drop.kr(0) * ((LFSaw.kr(\\ramp.kr(0.5)) + 1) * 0.5));
  // the read head: speed 1 follows the input, below 1 stretches it
  var read = Phasor.ar(\\sync.kr(0), \\speed.kr(1) * slow, 0, frames, write);
  // grains a second, evenly or at random
  var density = \\density.kr(20, spec: [0.5, 64, \\exp]);
  var scatter = \\scatter.kr(0);
  // lock 1 puts the even grains on the beat: a ramp round density times a
  // second, set back to its start on every beat (beat 0 to 1)
  var lock = \\lock.kr(0);
  var grid = Phasor.ar(\\beat.kr(0), density * secs / frames, 0, 1);
  var trig = Impulse.ar(density * (1 - scatter) * (1 - lock)) + Dust.ar(density * scatter) + ((((grid + 0.5) % 1) - 0.5) * lock * (1 - scatter));
  // each grain's length, place, pitch and side; dir -1 plays every grain backwards
  var size = \\size.kr(0.1, spec: [0.02, 4, \\exp]);
  var jitter = \\jitter.kr(0);
  // how long sound has been coming in, since the start or since fresh; a grain reaches
  // back at most half of it, so the first grains are heard at once and not read from silence
  var have = Phasor.ar(\\fresh.kr(0), secs / frames, 0, 1000000) * 0.5;
  var want = \\back.kr(0.5);
  var back = (want + have - (want - have).abs) * 0.5;
  var pos = read / frames - (back / secs) + (TRand.ar(jitter.neg, jitter, trig) / secs) % 1;
  var pitch = \\pitch.kr(1) * slow;
  var detune = \\detune.kr(0);
  var rate = TRand.ar(pitch * (1 - detune), pitch * (1 + detune), trig) * \\dir.kr(1);
  var pan = \\pan.kr(0.5);
  // tone is a low pass on the grains, open at 20 kHz
  var grains = LPF.ar(GrainBuf.ar(2, trig, size, buf, rate, pos, 2, TRand.ar(pan.neg, pan, trig)), \\tone.kr(20000));
  // the echo: what went in comes back after time seconds, echo as loud each
  // time round, and darker each time through a low pass at dark
  var echo = \\echo.kr(0);
  var tail = DelayC.ar((grains + LocalIn.ar(2)) * echo, 1.5, \\time.kr(0.375, 0.3));
  var mix = \\mix.kr(1);
  LocalOut.ar(HPF.ar(LPF.ar(tail, \\dark.kr(20000)), 60));
  BufWr.ar(input * (1 - freeze), buf, write);
  // tell the page about every grain
  SendReply.ar(trig, '/grain', [pos, size, write / frames, rate]);
  // quieter as more grains overlap, then mix: 0 is only the input, 1 only grains and their echo
  ((grains + tail) * \\amp.kr(1.5) / (density * size + 1).sqrt * (mix * 0.5pi).sin) + (input * (mix * 0.5pi).cos)
}`;

/** The ring's length, which the page allocates and the program reads back with BufDur. */
export const RING_SECONDS = 8;

/**
 * What a control sits at when a patch does not name it. Every control after the first five
 * patches is neutral here (`tone` 20 kHz, `echo` 0, `drop` 0, `dir` 1), so old patches sound as before.
 * See lessons/page-granulator.md#granulator-14
 */
export const DEFAULTS = { freeze: 0, speed: 1, back: 0.5, density: 20, scatter: 0, size: 0.1, jitter: 0,
  pitch: 1, detune: 0, pan: 0.5, amp: 1.5, tone: 20000, echo: 0, time: 0.375, dark: 20000, drop: 0, ramp: 0.5, dir: 1, lock: 0 };

/**
 * Ten sounds, each a set of control values on the one program. Every patch names `size` and
 * `density`, the two knobs every check leans on; `amp` levels them, measured on Ida.
 * See lessons/page-granulator.md#granulator-15
 */
export const PATCHES = [
  // Tape stop first, the default.
  // See lessons/page-granulator.md#granulator-16
  { name: 'Tape stop', says: 'the tape winds down to a stop every two and a half seconds and springs back',
    set: { size: 0.15, density: 30, pitch: 1, back: 0.1, speed: 1, scatter: 0, freeze: 0,
      jitter: 0, detune: 0, pan: 0.2, drop: 0.9, ramp: 0.4, tone: 10000, amp: 0.95 } },
  // A moment half a second back, repeating every 0.43 s and darker each time
  // round, the tape sagging a little over ten seconds.
  { name: 'Dub', says: 'half a second back, low and dark, echoing a long tail',
    set: { size: 0.35, density: 10, pitch: 1, back: 0.5, speed: 1, scatter: 0.15, freeze: 0,
      jitter: 0.03, detune: 0.004, pan: 0.9, tone: 2200, echo: 0.72, time: 0.43, dark: 1400, drop: 0.06, ramp: 0.1, amp: 1.35 } },
  { name: 'Cloud', says: 'grains at random from the last two seconds, spread wide in a short room',
    set: { size: 0.25, density: 40, pitch: 1, back: 2, speed: 1, scatter: 1, freeze: 0,
      jitter: 1.5, detune: 0.02, pan: 0.9, tone: 9000, echo: 0.3, time: 0.19, dark: 5000, amp: 1.5 } },
  { name: 'Frozen choir', says: 'one held moment, long grains pulled apart in pitch like a chord',
    set: { size: 1.2, density: 20, pitch: 1, back: 1, speed: 0, scatter: 0.5, freeze: 1,
      jitter: 0.06, detune: 0.03, pan: 1, tone: 6000, echo: 0.4, time: 0.61, dark: 3000, amp: 1.4 } },
  { name: 'Gate', says: 'short chops of the live sound eight times a second, the echo on the off beat',
    set: { size: 0.06, density: 8, pitch: 1, back: 0.03, speed: 1, scatter: 0, freeze: 0,
      jitter: 0, detune: 0, pan: 0, echo: 0.45, time: 0.1875, dark: 7000, amp: 2.0 } },
  { name: 'Slow motion', says: 'the read head at an eighth of the speed, so the sound crawls and keeps its pitch',
    set: { size: 0.5, density: 16, pitch: 1, back: 0.2, speed: 0.125, scatter: 0.3, freeze: 0,
      jitter: 0.02, detune: 0.004, pan: 0.6, tone: 12000, echo: 0.25, time: 0.7, dark: 4000, amp: 1.6 } },
  { name: 'Shimmer', says: 'every grain an octave up, scattered wide, with a bright echo',
    set: { size: 0.35, density: 24, pitch: 2, back: 1.5, speed: 1, scatter: 0.6, freeze: 0,
      jitter: 0.5, detune: 0.01, pan: 0.8, echo: 0.55, time: 0.5, dark: 9000, amp: 1.35 } },
  { name: 'Backwards', says: 'long grains played in reverse, so every sound swells in and stops',
    set: { size: 0.6, density: 6, pitch: 1, back: 1.2, speed: 1, scatter: 0.4, freeze: 0,
      jitter: 0.3, detune: 0.003, pan: 0.7, dir: -1, tone: 9000, echo: 0.35, time: 0.5, dark: 4000, amp: 1.4 } },
  { name: 'Undertow', says: 'an octave down, slow and smeared, a dark drone under the sound',
    set: { size: 1.5, density: 10, pitch: 0.5, back: 2, speed: 0.5, scatter: 0.8, freeze: 0,
      jitter: 1, detune: 0.006, pan: 0.8, tone: 1200, echo: 0.5, time: 0.9, dark: 800, amp: 1.4 } },
  { name: 'Sparks', says: 'tiny grains two octaves up, at random from the last three seconds',
    set: { size: 0.025, density: 48, pitch: 4, back: 3, speed: 1, scatter: 1, freeze: 0,
      jitter: 3, detune: 0.06, pan: 1, echo: 0.3, time: 0.21, dark: 12000, amp: 1.8 } },
];

/** Every control value of a patch, defaults filled in. */
export const valuesOf = (p) => ({ ...DEFAULTS, ...p.set });

// The engine behind grain-rig.mjs's contract, shared with /connect/; /granulator/beat/ keeps
// its own copy with the tempo. Compiled when made (no fetch); `boot` brings scsynth up.
// See lessons/page-granulator.md#granulator-17
export function createRingEngine({ log = () => {} } = {}) {
  const NODE = 4000, BUF = 0, DEF = 'gring';
  // ── the program: compiled as the page opens, pure JavaScript, no fetch ───
  const t0 = performance.now();
  const good = compile(PROGRAM, { name: DEF });
  const compileMs = performance.now() - t0;
  if (!good.ok) log(`the granulator's program did not compile: ${good.message}`, 'bad');

  // ── the engine, behind the rig's contract ────────────────────────────────
  let eng = null, ctx = null, values = valuesOf(PATCHES[0]), mixNow = 1;
  const T = { bufferBytes: RING_SECONDS * 48000 * 4, compileMs: +compileMs.toFixed(1) };
  const engine = {
    label: 'grain ring',
    // The wet/dry is `\mix` in the program's last line, so the blend happens
    // in the engine and the dry source never leaves it.
    mixes: true,
    async boot({ ctx: ac, input, grain, log }) {
      ctx = ac;
      const t1 = performance.now();
      if (!good.ok) throw new Error('the program did not compile');
      eng = await bootScsynth({
        audioContext: ctx, input, log,
        // `SendReply.ar(trig, '/grain', [pos, size, write / frames, rate])` arrives with nodeID and
        // replyID in front. Both positions are fractions of the same 8 s, so how long ago the grain's
        // audio came in is their difference round the ring.
        // See lessons/page-granulator.md#granulator-18
        onReply: (m) => {
          if (m[0] !== '/grain') return false;
          const pos = m[3], head = m[5];
          grain({ pos, ago: ((((head - pos) % 1) + 1) % 1) * RING_SECONDS, dur: m[4], voice: 0, rate: m[6] });
          return true;
        },
      });
      eng.out.gain.value = 0;
      T.moduleMs = Math.round(eng.moduleMs); T.bootMs = Math.round(eng.bootMs);
      const ta = performance.now();
      const alloc = await eng.sendAndWait((m) => (m[0] === '/done' || m[0] === '/fail') && (m[1] === '/b_alloc' || m[1] === '/b_allocPtr'),
        5000, '/b_alloc', BUF, RING_SECONDS * ctx.sampleRate, 1);
      if (!alloc || alloc[0] !== '/done') throw new Error('the ring buffer was not allocated');
      T.allocMs = Math.round(performance.now() - ta);
      const td = performance.now();
      const done = await eng.sendAndWait((m) => m[0] === '/done' && m[1] === '/d_recv', 5000, '/d_recv', good.bytes);
      if (!done) throw new Error('the engine never said it had the definition');
      T.defMs = Math.round(performance.now() - td); T.defBytes = good.bytes.length;
      const go = await eng.sendAndWait((m) => m[0] === '/n_go' || (m[0] === '/fail' && m[1] === '/s_new'), 5000,
        '/s_new', DEF, NODE, 1, 0, 'buf', BUF, 'inbus', 2, 'mix', mixNow, ...Object.entries(values).flat());
      if (!go || go[0] !== '/n_go') throw new Error('the granulator did not start');
      T.startMs = Math.round(performance.now() - t1);
      log(`the granulator up ${T.startMs} ms after Play: one ${RING_SECONDS} s buffer of ${(T.bufferBytes / 1e6).toFixed(1)} MB, `
        + `the ${good.bytes.length} B definition compiled in ${T.compileMs} ms and taken in ${T.defMs} ms`);
      return { meter: eng.meter, out: eng.out, timing: T, scsynth: eng };
    },
    // What a patch does beyond its values: the read head starts again at the
    // write head, so `back` means what it says after a stretch has left it
    // anywhere.
    land() {
      eng.send('/n_set', NODE, 'sync', 1);
      setTimeout(() => eng.send('/n_set', NODE, 'sync', 0), 40);
    },
    // Sound has just come in: grains reach back only as far as it goes, then to the patch's `back`.
    fresh() {
      eng.send('/n_set', NODE, 'fresh', 1);
      setTimeout(() => eng.send('/n_set', NODE, 'fresh', 0), 40);
    },
    knob(name, v) { if (name === 'mix') mixNow = v; else values[name] = v; eng.send('/n_set', NODE, name, v); },
    fixed(set) { Object.assign(values, set); eng.send('/n_set', NODE, ...Object.entries(set).flat()); },
    run(on) { eng.send('/n_run', NODE, on ? 1 : 0); },
    async read(name) {
      const r = await eng.sendAndWait((m) => m[0] === '/n_set' && m[2] === name, 3000, '/s_get', NODE, name);
      return r ? Number(r[3]) : null;
    },
    glitches: () => { try { return eng?.sonic.getMetrics?.()?.glitchCount ?? null; } catch { return null; } },
  };

  engine.good = good;
  engine.T = T;
  return engine;
}
