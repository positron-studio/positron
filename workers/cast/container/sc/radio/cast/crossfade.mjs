// demo/radio/cast/crossfade.mjs: hand-overs between the tuner's two slots that never sweep the dial, so
// no hiss, no whistle and no off-tune echo. Same shape as createMix(...)(t); pure, and the container runs
// this file too (workers/cast/sc-files.mjs). why: plans/plan-cast-patches-scenes.md section 3.3
export const PATHS = ['dial', 'dissolve', 'filter', 'gap'];
const ON = 3500, LOW = 300, FLOOR = 0.04;
const u = (x) => Math.min(1, Math.max(0, x));
const logTo = (a, b, x) => a * (b / a) ** u(x);
const slot = (clear, bright = ON) => ({ dist: 0, clear, echo: 0, bright });

/** The mix `k` (0 to 1) into a blend from slot `from` to the other, on path 1 dissolve, 2 filter or 3 gap. */
export function crossfade(path, from, k) {
  const to = 1 - from, x = u(k), st = [null, null];
  if (path === 3) {
    st[from] = slot(Math.cos((Math.PI / 2) * u(x / 0.35)));
    st[to] = slot(Math.sin((Math.PI / 2) * u((x - 0.65) / 0.35)));
  } else {
    st[from] = slot(Math.cos((Math.PI / 2) * x), path === 2 ? logTo(ON, LOW, x / 0.6) : ON);
    st[to] = slot(Math.sin((Math.PI / 2) * x), path === 2 ? logTo(LOW, ON, (x - 0.4) / 0.6) : ON);
  }
  return { st, near: x < 0.5 ? from : to, noise: path === 3 ? 0 : FLOOR, whistle: 0, pitch: 160 };
}

/** The dwell before a blend on a path that is not the dial: the waiting slot is silent, not an echo. */
export function dwellMix(m, from) {
  const st = m.st.map((s, j) => (j === from ? s : { ...s, clear: 0, echo: 0 }));
  return { ...m, st };
}
