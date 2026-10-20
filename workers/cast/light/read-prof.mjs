// node workers/cast/light/read-prof.mjs <x.cpuprofile> [top]: self time by function and by file, from node --cpu-prof.
import { readFileSync } from 'node:fs';

const [file, topN = 25] = process.argv.slice(2);
const p = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = p.timeDeltas, total = dt.reduce((a, b) => a + b, 0);
for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) || 0) + (dt[i] || 0));
const fn = new Map(), url = new Map();
for (const [id, us] of self) {
  const cf = byId.get(id).callFrame, f = cf.url.split('/').slice(-2).join('/') || '(native)';
  const k = `${cf.functionName || '(anonymous)'}  ${f}:${cf.lineNumber + 1}`;
  fn.set(k, (fn.get(k) || 0) + us); url.set(f, (url.get(f) || 0) + us);
}
const pc = (us) => `${((us / total) * 100).toFixed(1).padStart(5)} %`;
console.log(`profile ${(total / 1e6).toFixed(1)} s wall, ${p.samples.length} samples`);
console.log('\nby file (self time, per cent of the profile\'s wall):');
for (const [k, v] of [...url].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${pc(v)}  ${k}`);
console.log('\nby function:');
for (const [k, v] of [...fn].sort((a, b) => b[1] - a[1]).slice(0, +topN)) console.log(`${pc(v)}  ${k}`);
