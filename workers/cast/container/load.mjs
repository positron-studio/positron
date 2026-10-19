// A new composer loaded into a running station, the way the Pi's sc.load puts a program into a running scsynth:
// checked before anything changes, taken at the next scene, refused whole when any check fails.
// Only life.mjs and the numbers in layers.mjs load; a SuperCollider program or the driver needs a deploy.
// why: plans/plan-cast-load.md
import { mkdirSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SC = join(dirname(fileURLToPath(import.meta.url)), 'sc');
/** The files a load may carry, and the most it may weigh. */
export const LOADABLE = ['radio/cast/life.mjs', 'radio/cast/layers.mjs'], MAX_BYTES = 400_000;
/** What live.mjs calls in each module, and its type: a load missing one, or with another type, is refused. */
export const NEEDS = {
  life: { createLife: 'function', fromT: 'function', DWELL_NOISE: 'number', patchFor: 'function', freezesAfterDry: 'function', isTest: 'function' },
  layers: { createLayerEngine: 'function', euclid: 'function', stepSeconds: 'function', layerLevel: 'function', sceneLevel: 'function', blendLevel: 'function',
    ghostFrom: 'function', pitchClass: 'function', KEY_FROM: 'object', KEY_HZ: 'object', ghostGap: 'function' },
};
/** The parts of layers.mjs that are already running in scsynth: a load that changes them is refused. */
const running = (L) => JSON.stringify({ p: L.PROGRAMS, r: L.ROOM, e: String(L.createLayerEngine) });

/**
 * `{ files: { path: text }, sha }` into modules, checked against the station: `made` is the past scenes as handoff()
 * writes them, `next` the files coming. Resolves `{ ok, why, mods, life }`; nothing is applied here.
 */
export async function prepareLoad({ files, sha }, { now, seed, votes = [], made = [], next = [], dir = '/tmp/load' }) {
  const no = (why) => ({ ok: false, why });
  if (!files || typeof files !== 'object' || !Object.keys(files).length) return no('no files');
  if (!/^[0-9a-f]{8,64}$/.test(String(sha || ''))) return no('a sha of 8 to 64 hex digits');
  const paths = Object.keys(files);
  if (paths.some((p) => !LOADABLE.includes(p))) return no(`only ${LOADABLE.join(' and ')} load; ${paths.filter((p) => !LOADABLE.includes(p)).join(', ')} need a deploy`);
  if (paths.reduce((a, p) => a + String(files[p]).length, 0) > MAX_BYTES) return no(`over ${MAX_BYTES} bytes`);
  // the whole tree beside the new files, so their relative imports resolve to what the image runs
  const root = join(dir, sha);
  try {
    if (!existsSync(root)) { mkdirSync(root, { recursive: true }); cpSync(SC, root, { recursive: true }); }
    for (const p of paths) writeFileSync(join(root, p), String(files[p]));
  } catch (e) { return no(`could not write the files: ${e.message}`); }
  let life, layers;
  try {
    life = await import(`${pathToFileURL(join(root, 'radio/cast/life.mjs')).href}?v=${sha}`);
    layers = await import(`${pathToFileURL(join(root, 'radio/cast/layers.mjs')).href}?v=${sha}`);
  } catch (e) { return no(`did not import: ${e.message}`); }
  for (const [m, mod] of [['life', life], ['layers', layers]]) {
    for (const [k, t] of Object.entries(NEEDS[m])) if (typeof mod[k] !== t) return no(`${m} has no ${t} ${k}`);
  }
  if (now?.layers && running(layers) !== running(now.layers)) return no('layers.mjs changes a SuperCollider program or the layer engine: that needs a deploy');
  // the past as the station made it; a second copy plans five scenes ahead, so the one kept has no future fixed by a guess
  const rebuild = () => { const x = life.createLife({ seed, votes });
    for (let k = 0; k < made.length; k++) { const s = x.scene(k, { kind: made[k]?.kind || undefined, soft: !!made[k]?.soft, test: !!made[k]?.test }); if (made[k]?.key?.heard) s.key = { ...made[k].key }; }
    return x; };
  let L;
  try {
    L = rebuild();
    const P = rebuild();
    for (let k = 0; k < 5; k++) {
      const c = next[k] || {}, s = P.scene(made.length + k, { kind: c.kind || undefined, soft: !!c.soft, test: !!c.test, seconds: c.seconds });
      if (!(s.dwell > 0 && s.blend > 0 && s.patch)) throw new Error(`scene ${made.length + k} has no dwell, blend or patch`);
      P.inScene(made.length + k, s.dwell / 2); P.inInterlude(made.length + k, s.blend / 2); layers.sceneLevel(0.5, s);
    }
  } catch (e) { return no(`the new life did not plan: ${e.message}`); }
  return { ok: true, mods: { life, layers }, life: L, sha };
}
