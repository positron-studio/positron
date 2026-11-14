// node render.mjs <kind> <i,j,k> [files...]: renders the passing answers of those wishes, every model,
// into out/renders/<kind>-<i>-<model>.png, and one labelled contact sheet out/sheets/<kind>-<list>.png.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { openGpu } from './gpu.mjs';
import { instances, expand } from './kinds.mjs';

const [kind, list, ...files] = process.argv.slice(2);
const want = list.split(',').map(Number);
const fs = files.length ? files : readdirSync('out').filter((f) => f.endsWith('.jsonl') && !f.startsWith('smoke'));
mkdirSync('out/renders', { recursive: true }); mkdirSync('out/sheets', { recursive: true });
const gpu = await openGpu();
const cells = [];
try {
  for (const f of fs) for (const l of readFileSync(`out/${f}`, 'utf8').trim().split('\n').filter(Boolean)) {
    const r = JSON.parse(l);
    if (r.kind !== kind || !want.includes(r.i)) continue;
    const tag = f.replace('.jsonl', '');
    let png = null;
    if (r.passed) {
      if (kind === 'scene') png = await gpu.renderScene(r.value, r.value.shapes.map(instances));
      if (kind === 'lsystem') png = (await gpu.renderL(expand(r.value).s, r.value.angle)).png;
      if (kind === 'sdf') png = await gpu.renderSdf(r.value, 320);
    }
    if (png) writeFileSync(`out/renders/${kind}-${r.i}-${tag}.png`, png);
    cells.push({ label: `${r.i} ${tag} ${r.passed ? `pass@${r.passed}` : 'FAILED'}: ${r.wish}`, url: png ? `data:image/png;base64,${png.toString('base64')}` : null });
  }
  cells.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const sheet = await gpu.evalJs(`(async () => {
    const cells = ${JSON.stringify(cells)};
    const cw = ${kind === 'scene' ? 380 : 260}, ch = ${kind === 'scene' ? 190 : 260}, cols = ${kind === 'scene' ? 3 : 4}, lh = 30;
    const c = document.createElement('canvas'); c.width = cw * cols; c.height = Math.ceil(cells.length / cols) * (ch + lh);
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    for (let k = 0; k < cells.length; k++) {
      const x = (k % cols) * cw, y = Math.floor(k / cols) * (ch + lh);
      g.fillStyle = '#fff'; g.font = '10px sans-serif';
      const t = cells[k].label; const n = Math.floor(cw / 5.6); g.fillText(t.slice(0, n), x + 3, y + 12); g.fillText(t.slice(n, 2 * n), x + 3, y + 25);
      if (cells[k].url) { const im = new Image(); im.src = cells[k].url; await im.decode(); g.drawImage(im, x, y + lh, cw - 4, ch - 4); }
    }
    return c.toDataURL('image/png');
  })()`);
  writeFileSync(`out/sheets/${kind}-${list.replace(/,/g, '_')}.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  console.log(`${cells.length} cells`);
} finally { gpu.close(); }
