// node render-all.mjs <outdir>: every passing answer of every model, rendered: patch as a 4 frame strip
// (0, 2, 4, 6 s of an 8 s made-up signal track), scene from above and at eye height, lsystem as a turtle
// drawing, sdf ray marched from two angles. Writes <kind>-<model>-wishNN.png and sheet-<kind>-<model>.png.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { openGpu } from './gpu.mjs';
import { instances, expand } from './kinds.mjs';

const dir = process.argv[2] || 'out/renders2';
const only = process.argv[3] ? process.argv[3].split(',') : null;
mkdirSync(dir, { recursive: true });
const NAMES = {
  '_cf_qwen_qwen2.5_coder_32b_instruct': 'hosted-coder32b', '_cf_qwen_qwen3.8_27b': 'hosted-qwen38-27b',
  'qwen3.5_4b': 'local-qwen35-4b', 'qwen3.5_9b': 'local-qwen35-9b', 'qwen2.5_coder_7b': 'local-coder7b',
};
const LAYOUT = { patch: [660, 196, 1], scene: [400, 150, 3], lsystem: [200, 200, 5], sdf: [320, 160, 4] };
const png = (u) => Buffer.from(u.split(',')[1], 'base64');
const gpu = await openGpu();
const motion = [];
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { gpu.close(); process.exit(1); });
try {
  await gpu.evalJs(readFileSync(new URL('./views.page.js', import.meta.url), 'utf8'));
  for (const f of readdirSync('out').filter((x) => x.endsWith('.jsonl') && NAMES[x.replace('.jsonl', '')])) {
    const model = NAMES[f.replace('.jsonl', '')];
    const rows = readFileSync(`out/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    for (const kind of ['patch', 'scene', 'lsystem', 'sdf']) {
      if (only && !only.includes(kind)) continue;
      const cells = [];
      for (const r of rows.filter((x) => x.kind === kind && x.passed).sort((a, b) => a.i - b.i)) {
        let url;
        try {
          if (kind === 'patch') {
            const out = await gpu.evalJs(`playPatch(${JSON.stringify(r.value)})`); url = out.url;
            const SPAN = { hue: 1, feedback: 0.98, mirrorCount: 11, speed: 2, displacement: 2 };
            const bound = [...new Set((r.value.bindings || []).map((b) => b.param))];
            const moved = bound.filter((k) => { const xs = out.frames.map((f) => f[k]); return Math.max(...xs) - Math.min(...xs) > 0.02 * SPAN[k]; });
            motion.push({ model, i: r.i, wish: r.wish, bound, moved, still: bound.filter((k) => !moved.includes(k)), speed: r.value.params.speed, diffs: out.diffs });
          }
          if (kind === 'scene') url = await gpu.evalJs(`drawScene(${JSON.stringify(r.value)}, ${JSON.stringify(r.value.shapes.map(instances))})`);
          if (kind === 'lsystem') url = 'data:image/png;base64,' + (await gpu.renderL(expand(r.value).s, r.value.angle)).png.toString('base64');
          if (kind === 'sdf') {
            const a = await gpu.renderSdf(r.value, 240, 0.7), b = await gpu.renderSdf(r.value, 240, 2.9);
            url = await gpu.evalJs(`(async () => { const c = document.createElement('canvas'); c.width = 480; c.height = 240; const x = c.getContext('2d');
              for (const [k, s] of [${JSON.stringify('data:image/png;base64,' + a.toString('base64'))}, ${JSON.stringify('data:image/png;base64,' + b.toString('base64'))}].entries()) { const im = new Image(); im.src = s; await im.decode(); x.drawImage(im, k * 240, 0); }
              return c.toDataURL('image/png'); })()`);
          }
        } catch (e) { console.log(`render failed ${kind} ${model} ${r.i}: ${e.message.slice(0, 200)}`); continue; }
        const nn = String(r.i).padStart(2, '0');
        writeFileSync(`${dir}/${kind}-${model}-${nn}.png`, png(url));
        cells.push({ url, label: `${nn} (try ${r.passed}) ${r.wish}` });
      }
      if (!cells.length) continue;
      const [cw, ch, cols] = LAYOUT[kind];
      const total = rows.filter((x) => x.kind === kind).length;
      await gpu.evalJs('window._cells = []; 0');
      for (const c of cells) await gpu.evalJs(`window._cells.push(${JSON.stringify(c)}); 0`);
      const len = await gpu.evalJs(`sheet(window._cells, ${cw}, ${ch}, ${cols}, ${JSON.stringify(`${kind}, ${model}: ${cells.length} passing of ${total} run`)}).then((u) => { window._out = u; return u.length; })`);
      let s = ''; for (let o = 0; o < len; o += 1000000) s += await gpu.evalJs(`window._out.slice(${o}, ${o + 1000000})`);
      writeFileSync(`${dir}/sheet-${kind}-${model}.png`, png(s));
      console.log(`${kind} ${model}: ${cells.length} rendered`);
    }
  }
  if (motion.length) writeFileSync(`${dir}/../patch-motion.json`, JSON.stringify(motion, null, 1));
} finally { gpu.close(); }
