// node workers/cast/load-test.mjs: a load (container/load.mjs) checked in node, against the container's own sc/ tree.
// Every refusal has a case that must be refused (NEGATIVE CONTROL), and the pass cases must pass.
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLoad, LOADABLE } from './container/load.mjs';
import * as LIFE from './container/sc/radio/cast/life.mjs';
import * as LAYERS from './container/sc/radio/cast/layers.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const dir = mkdtempSync(join(tmpdir(), 'cast-load-'));
try {
  const read = (f) => readFileSync(new URL(`./container/sc/${f}`, import.meta.url), 'utf8');
  const life0 = read('radio/cast/life.mjs'), layers0 = read('radio/cast/layers.mjs');
  const now = { life: LIFE, layers: LAYERS, sha: 'image' };
  // a station 12 scenes in, as handoff() writes its past
  const seed = 4242, kinds = ['speech', 'field', 'music', 'speech'], live = LIFE.createLife({ seed });
  const made = Array.from({ length: 12 }, (_, k) => { const s = live.scene(k, { kind: kinds[k % 4] }); return { kind: s.kind, soft: !!s.soft, test: !!s.test, key: s.key }; });
  const ctx = { now, seed, made, next: [{ kind: 'music', seconds: 300 }], dir };
  let n = 0; const sha = () => (++n).toString(16).padStart(12, '0');

  const same = await prepareLoad({ files: { 'radio/cast/life.mjs': life0, 'radio/cast/layers.mjs': layers0 }, sha: sha() }, ctx);
  ok('the image\'s own files load', same.ok, same.why);
  ok('the loaded life rebuilds the station\'s past scene for scene', same.ok && made.every((_, k) => same.life.scene(k).patch === live.scene(k).patch && same.life.scene(k).dwell === live.scene(k).dwell));
  ok('the loaded modules are new copies, not the image\'s', same.ok && same.mods.life !== LIFE && same.mods.layers !== LAYERS);

  const longer = life0.replace('MIN_BLEND = 10, MIN_DWELL = 60', 'MIN_BLEND = 10, MIN_DWELL = 75');
  ok('the test edit exists in life.mjs', longer !== life0);
  const changed = await prepareLoad({ files: { 'radio/cast/life.mjs': longer }, sha: sha() }, ctx);
  const s12 = changed.ok && changed.life.scene(12, { kind: 'music', seconds: 600 });
  ok('a changed number loads and the next scene plans by it', changed.ok && s12.dwell >= 75 && changed.mods.life.MIN_DWELL === 75, changed.why || `${s12.dwell}`);
  ok('and the image\'s module is untouched by it', LIFE.MIN_DWELL === 60);

  const r1 = await prepareLoad({ files: { 'radio/cast/life.mjs': life0 + '\nexport const = ;' }, sha: sha() }, ctx);
  ok('NEGATIVE CONTROL: a file that does not parse is refused', !r1.ok && /did not import/.test(r1.why), r1.why);
  const r2 = await prepareLoad({ files: { 'radio/cast/life.mjs': life0.replace('export const TEST_DWELL = 25, isTest', 'export const TEST_DWELL = 25, isTestX') }, sha: sha() }, ctx);
  ok('NEGATIVE CONTROL: a life without a name live.mjs calls is refused', !r2.ok && /isTest/.test(r2.why), r2.why);
  const r3 = await prepareLoad({ files: { 'radio/cast/layers.mjs': layers0.replace('LPF.ar(Mix(In.ar(2, 2)) * 0.5, 600', 'LPF.ar(Mix(In.ar(2, 2)) * 0.5, 700') }, sha: sha() }, ctx);
  ok('NEGATIVE CONTROL: a change to a running SuperCollider program is refused, it needs a deploy', !r3.ok && /needs a deploy/.test(r3.why), r3.why);
  const r4 = await prepareLoad({ files: { 'radio/cast/master.mjs': 'export const x = 1;' }, sha: sha() }, ctx);
  ok('NEGATIVE CONTROL: a file outside LOADABLE is refused', !r4.ok && /need a deploy/.test(r4.why) && !LOADABLE.includes('radio/cast/master.mjs'), r4.why);
  const r5 = await prepareLoad({ files: { 'radio/cast/life.mjs': life0 }, sha: '../../etc' }, ctx);
  ok('NEGATIVE CONTROL: a sha that is not hex is refused (it names a directory)', !r5.ok && /sha/.test(r5.why), r5.why);
  const r6 = await prepareLoad({ files: { 'radio/cast/life.mjs': life0.replace('if (ctx.test) d.dwell = TEST_DWELL; else d.dwell = Math.max(MIN_DWELL, d.dwell);', 'd.dwell = NaN;') }, sha: sha() }, ctx);
  ok('NEGATIVE CONTROL: a life that plans a scene with no dwell is refused', !r6.ok && /did not plan/.test(r6.why), r6.why);
  const r7 = await prepareLoad({ files: { 'radio/cast/life.mjs': life0.replace('export function createLife(', 'export function createLife(o) { throw new Error("boom"); }\nfunction createLife0(') }, sha: sha() }, ctx);
  ok('NEGATIVE CONTROL: a life that throws is refused', !r7.ok && /boom/.test(r7.why), r7.why);
  // the hand-over trigger: a new container only for a new image
  const { newCode } = await import('./worker.mjs');
  ok('a Worker deploy with the same image hands nothing over', newCode({ image: 'a', version: '1' }, { CAST_IMAGE: 'a', CF_VERSION_METADATA: { id: '2' } }) === false);
  ok('NEGATIVE CONTROL: a new image hands over', newCode({ image: 'a', version: '1' }, { CAST_IMAGE: 'b', CF_VERSION_METADATA: { id: '2' } }) === true);
  ok('a container booted before the image hash existed falls back to the Worker version', newCode({ version: '1' }, { CAST_IMAGE: 'b', CF_VERSION_METADATA: { id: '2' } }) === true && newCode({ version: '1' }, { CAST_IMAGE: 'b', CF_VERSION_METADATA: { id: '1' } }) === false);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log(`\nload-test: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
