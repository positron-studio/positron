// node summary.mjs: the results table out of out/*.jsonl, in markdown, and the error census.
import { readdirSync, readFileSync } from 'node:fs';

const CATS = [
  [/no answer/, 'no answer (timeout or refusal)'],
  [/not valid JSON|no JSON object|not a JSON object/, 'not JSON'],
  [/outside the room/, 'instance outside the room'],
  [/instances in total/, 'over 2000 instances'],
  [/GLSL compile error.*(redefinition|already)/i, 'GLSL: redefined a given helper'],
  [/GLSL compile error.*no matching overloaded|GLSL compile error.*(cannot convert|wrong operand|assign)/i, 'GLSL: type error (int/float, overload)'],
  [/GLSL compile error/, 'GLSL: other compile error'],
  [/GLSL link/, 'GLSL: link error'],
  [/separate pieces/, 'SDF: not one connected piece'],
  [/only .* percent .* is inside/, 'SDF: too small or empty'],
  [/percent of the grid is inside the solid/, 'SDF: too big or sign inverted'],
  [/NaN/, 'SDF: NaN'],
  [/took .* ms/, 'SDF: over 2 s'],
  [/for loop|`while`/, 'SDF: loop rule'],
  [/must be a function|no uniforms|float sdf\(vec3 p\)/, 'SDF: missing sdf() or forbidden word'],
  [/passes 50000/, 'L: expands past 50000'],
  [/symbols that are not allowed/, 'L: symbol not allowed'],
  [/unbalanced/, 'L: unbalanced brackets'],
  [/rule key/, 'L: bad rule key'],
  [/unknown (top level )?key|has unknown key/, 'unknown key'],
  [/range must be|must be a number|must be ms|must be an integer|must be one of|must be \[|missing|must be an array|at most 4 effects|needs|must be/, 'value out of range or wrong type'],
];
export const cat = (e) => (CATS.find(([r]) => r.test(e)) || [null, 'other'])[1];

const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const rows = readdirSync('out').filter((f) => f.endsWith('.jsonl') && !f.startsWith('smoke')).flatMap((f) =>
  readFileSync(`out/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => ({ ...JSON.parse(l), file: f })));
const groups = new Map();
for (const r of rows) { const k = `${r.file}|${r.kind}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
console.log('| model (file) | kind | n | pass try 1 | pass within 3 | failed | commonest final error | median s | p90 s | mean tokens out per wish |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const census = new Map();
for (const [k, rs] of [...groups].sort()) {
  const [file, kind] = k.split('|');
  const fails = rs.filter((r) => !r.passed);
  const fc = {}; for (const r of fails) { const c = cat(r.tries.at(-1)?.error || ''); fc[c] = (fc[c] || 0) + 1; }
  const top = Object.entries(fc).sort((a, b) => b[1] - a[1])[0];
  const secs = rs.map((r) => r.ms / 1000);
  const tok = rs.map((r) => r.tries.reduce((s, t) => s + (t.tokensOut || 0), 0));
  for (const r of rs) for (const t of r.tries) if (t.error) { const c = cat(t.error); const key = `${file}|${kind}`; if (!census.has(key)) census.set(key, {}); census.get(key)[c] = (census.get(key)[c] || 0) + 1; }
  console.log(`| ${file.replace('.jsonl', '')} | ${kind} | ${rs.length} | ${rs.filter((r) => r.passed === 1).length} | ${rs.filter((r) => r.passed).length} | ${fails.length} | ${top ? `${top[0]} (${top[1]})` : ''} | ${q(secs, 0.5).toFixed(1)} | ${q(secs, 0.9).toFixed(1)} | ${Math.round(tok.reduce((a, b) => a + b, 0) / rs.length)} |`);
}
console.log('\nEvery refused try, by category:');
for (const [k, c] of [...census].sort()) console.log(k, JSON.stringify(Object.entries(c).sort((a, b) => b[1] - a[1])));
const tps = {}; for (const r of rows) for (const t of r.tries) if (t.evalTps) (tps[r.file] ||= []).push(t.evalTps);
console.log('\nmedian decode tokens/s:', JSON.stringify(Object.fromEntries(Object.entries(tps).map(([f, a]) => [f, q(a, 0.5)]))));
