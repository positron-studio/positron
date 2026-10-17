// A mix session: the engine's blocks paced on the wall clock, LAME, and the same source connection
// the copy caster opens. The clock is Date.now(), never ffmpeg's output rate. why: lessons/workers-cast.md#mix-pacing
import fs from 'node:fs';
import { createEngine, createClock } from './mixer.mjs';
import { openDecoder } from './decode.mjs';
import { openEncoder } from './encode.mjs';

const LEAD_S = 2, TICK_MS = 20, BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Container-wide CPU (per cent of one core, since the last call) and memory, from cgroup v2 when it is there. */
let lastCpu = null;
export function usage() {
  const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
  const cpuStat = read('/sys/fs/cgroup/cpu.stat'), mem = read('/sys/fs/cgroup/memory.current');
  const now = Date.now(), usec = cpuStat ? Number(/usage_usec (\d+)/.exec(cpuStat)?.[1]) : null;
  let cpu = null;
  if (usec != null && lastCpu) cpu = +((usec - lastCpu.usec) / 1000 / (now - lastCpu.at) * 100).toFixed(1);
  if (usec != null && (!lastCpu || now - lastCpu.at > 5000)) lastCpu = { usec, at: now };
  return { cpuPct: cpu, memMiB: mem ? Math.round(Number(mem) / 1048576) : null, nodeRssMiB: Math.round(process.memoryUsage().rss / 1048576) };
}

/**
 * `{ queue, target, set }` on air in mix mode through `openSink(target, title)`. Returns a handle with
 * `status()`, `set(name, v)`, `queue(q)`, `next()`, `stop()`.
 */
export function startMix({ queue, target, set = {} }, { openSink, say = () => {}, fail = () => {} }) {
  const m = { stopped: false, sink: null, onAir: false, startedAt: Date.now(), sent: 0, frames: 0, bytes: 0, down: 0,
    sinkDeaths: 0, sinkFails: 0, encoderRestarts: 0, clock: null };
  const engine = createEngine({ open: (it) => openDecoder(it, { log: say }), queue, set, log: say });
  let writing = Promise.resolve(), enc = null;
  const newEncoder = () => openEncoder({ log: say, onFrame: (f) => {
    if (!m.sink || m.sink.closed) return;              // nobody to send to: dropped, the clock moves instead
    writing = writing.then(() => m.sink?.write(f.data)).then(() => { m.sent += f.seconds; m.frames++; m.bytes += f.data.length; }).catch(() => {});
  } });
  async function connect(why) {
    const t0 = Date.now();
    for (let i = 0; !m.stopped; i++) {
      try {
        m.sink = await openSink(target, engine.status().slots.find((x) => x.title)?.title);
        m.onAir = true;
        say(why ? `mix back on air after ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'mix on air');
        return (Date.now() - t0) / 1000;
      } catch (e) { fail(e); m.sinkFails++; await sleep(BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)]); }
    }
    return (Date.now() - t0) / 1000;
  }
  (async () => {
    engine.start();
    say(`mix: first file ready in ${await engine.ready()} ms`);
    await connect(null);
    enc = newEncoder();
    m.clock = createClock({ leadS: LEAD_S });
    while (!m.stopped) {
      if (!m.sink || m.sink.closed) {
        m.onAir = false; m.sinkDeaths++;
        fail(new Error(`source connection lost: ${m.sink?.why || 'closed'}`));
        const down = await connect('lost');
        m.clock.move(down); m.down += down;
        continue;
      }
      if (enc.exited) { m.encoderRestarts++; say(`encoder gone (${enc.error || 'exited'}), starting another`); enc = newEncoder(); }
      for (let n = m.clock.owed(); n > 0 && !m.stopped; n--) { await enc.write(engine.block()); m.clock.made(); }
      await sleep(TICK_MS);
    }
  })().catch((e) => fail(e)).finally(() => { engine.close(); enc?.kill(); m.sink?.close(); });
  return {
    set: (name, v) => engine.set(name, v),
    queue: (q) => engine.queue(q),
    next: () => engine.next(),
    stop() { m.stopped = true; m.sink?.close(); },
    status() {
      const e = engine.status(), now = Date.now();
      return { ...e, onAir: m.onAir, since: m.startedAt, seconds: +(m.clock?.seconds ?? 0).toFixed(2), mp3Seconds: +m.sent.toFixed(2),
        wall: +((now - m.startedAt) / 1000).toFixed(2), lag: m.clock ? +m.clock.lag().toFixed(2) : 0, lead: LEAD_S, down: +m.down.toFixed(1),
        frames: m.frames, bytes: m.bytes, sinkDeaths: m.sinkDeaths, sinkFails: m.sinkFails, encoderRestarts: m.encoderRestarts, usage: usage() };
    },
  };
}
