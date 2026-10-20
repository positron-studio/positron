// node workers/cast/light/table.mjs <out dir> [names...]: profile.mjs's results as one row each.
import { readFileSync, readdirSync } from 'node:fs';

const [dir, ...names] = process.argv.slice(2);
const list = names.length ? names : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const cols = ['node', 'scsynth', 'jack-stdout', 'jack-stdin', 'ffmpeg (LAME)', 'ffmpeg (decode)', 'jackd'];
console.log(['run', 'cpus', 'cgroup %', ...cols, 'kernel %', 'thr ms', 'mem MiB', 'lag', 'ahead', 'xruns', 'underruns', 'late'].join(' | '));
for (const n of list) {
  let r; try { r = JSON.parse(readFileSync(`${dir}/${n}.json`, 'utf8')); } catch { continue; }
  const p = r.perProcess || {}, kern = Object.entries(p).filter(([k]) => k.endsWith('(kernel)')).reduce((a, [, v]) => a + v, 0);
  console.log([n, r.cpus ?? '', r.cgroupPct, ...cols.map((c) => p[c] ?? '-'), kern ? kern.toFixed(2) : '-', r.throttled?.ms, r.memPeakMiB, r.lagEnd, (r.ahead || []).join('..'),
    (r.xruns || []).join('/'), r.underruns, r.glitches?.late ?? '-'].join(' | '));
}
