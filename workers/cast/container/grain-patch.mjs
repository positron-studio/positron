// The ring's controls as the Caster and the container both clamp them: pure, so the Worker can import it.
import { PATCHES, RING_SECONDS, valuesOf } from './sc/granulator/grain-ring.mjs';

/** Every control of the ring, with the range a page may move it in. `dir` is -1 or 1. */
export const PATCH_LIMITS = { freeze: [0, 1], speed: [0, 4], back: [0, RING_SECONDS - 0.5], density: [0.5, 64], scatter: [0, 1],
  size: [0.02, 4], jitter: [0, 4], pitch: [0.25, 4], detune: [0, 0.1], pan: [0, 1], amp: [0, 3], tone: [200, 20000], echo: [0, 0.9],
  time: [0.01, 1.5], dark: [200, 20000], drop: [0, 1], ramp: [0.05, 4], dir: [-1, 1], lock: [0, 1], mix: [0, 1] };

/** `{cmd:'patch'}` as values: a patch by `name` (filled from DEFAULTS), then `set` on top, each clamped; unknown names are dropped and listed. */
export function clampPatch({ name, set = {} } = {}) {
  const out = {}, refused = [];
  let base = null;
  if (name != null) { base = PATCHES.find((p) => p.name === name); if (!base) refused.push(`patch ${name}`); else Object.assign(out, valuesOf(base)); }
  for (const [k, v] of Object.entries(set || {})) {
    const lim = PATCH_LIMITS[k], x = Number(v);
    if (!lim || !Number.isFinite(x)) { refused.push(k); continue; }
    out[k] = k === 'dir' ? (x < 0 ? -1 : 1) : Math.min(lim[1], Math.max(lim[0], x));
  }
  return { values: out, patch: base?.name ?? null, refused };
}
