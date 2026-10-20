// node workers/edgecast/station-test.mjs [seconds] [out.mp3]: the station in node, as the object runs it, on a
// clock that moves half a second per pump (so it runs as fast as the CPU allows). The program and files come
// from cast.positron.studio (our edge). Prints the CPU per second of audio, the status, and writes the MP3.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createStation, loadProgram } from './station-core.mjs';

const here = (p) => new URL(p, import.meta.url);
if (!existsSync(here('./glue.gen.mjs'))) execFileSync(process.execPath, [here('./gen-glue.mjs').pathname]);
execFileSync(process.execPath, [here('./gen-live.mjs').pathname]);
const secs = Number(process.argv[2]) || 60, out = process.argv[3];
const glue = (await import('./glue.gen.mjs')).default;
const mod = (p) => WebAssembly.compile(readFileSync(here(p)));
const [wasmModule, lameModule, mpgModule] = await Promise.all([mod('../../demo/shell/vendor/scsynth-nrt.wasm'), mod('./vendor/lame.wasm'), mod('./vendor/mpg123.wasm')]);
let clock = Date.now();
const { queue, votes } = await loadProgram();
console.log(`program: ${queue.length} files, ${votes.length} votes; first ${queue[0]?.title}`);
const frames = [];
const s = await createStation({ wasmModule, glue, lameModule, mpgModule, seed: 7, queue, votes, now: () => clock, log: (l) => { if (process.env.V) console.log(l); }, onFrame: (f) => frames.push(f.data) });
const t0 = Date.now();
while (!s.ready) { if (Date.now() - t0 > 30000) throw new Error('not ready in 30 s'); await new Promise((r) => setTimeout(r, 50)); }
console.log(`ready in ${Date.now() - t0} ms`);
clock = Date.now();
const c0 = process.cpuUsage(), w0 = performance.now();
let made = 0, k = 0;
while (made < secs) {
  const r = await s.pump();
  made += r.made;
  clock += 500;
  // the fetches need real time to arrive: a pump with nothing to read waits a little
  await new Promise((r2) => setTimeout(r2, Number(process.env.PUMP_MS ?? 100)));
  if (++k % 120 === 0) { const st = s.status(); console.log(`${made.toFixed(0)} s: scene ${st.scene?.si} ${st.scene?.patch} on ${st.scene?.file}, out ${JSON.stringify(st.out)}, underrun samples ${st.underruns.decoderSamples}`); }
}
const cpu = process.cpuUsage(c0), cpuMs = (cpu.user + cpu.system) / 1000, wallMs = performance.now() - w0;
const st = s.status();
console.log(JSON.stringify({ audioS: +made.toFixed(1), cpuMs: Math.round(cpuMs), cpuMsPerAudioS: +(cpuMs / made).toFixed(2), percentOfCore: +(cpuMs / made / 10).toFixed(2), wallMs: Math.round(wallMs), status: st }, null, 1));
s.stop();
if (out) { const b = Buffer.concat(frames); writeFileSync(out, b); console.log(`wrote ${out}: ${b.length} B, ${frames.length} frames`); }
process.exit(0);
