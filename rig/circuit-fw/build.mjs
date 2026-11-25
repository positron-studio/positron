// node rig/circuit-fw/build.mjs <patch> [...]: stock Circuit 3592 .syx plus our patches, to purchased/circuit-firmware/out/.
// Assembles in a debian container (nothing installed here), refuses a wrong base, a hook whose bytes differ,
// and code that lands on anything but 0x00 or 0xFF or that any literal in the image points into.
// why: plans/plan-circuit-firmware.md section 4
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFirmware, writeFirmware } from '../../demo/shell/circuit-firmware.mjs';
import { decodeBranch, encodeBranch } from './thumb.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const DIR = join(ROOT, 'purchased/circuit-firmware');
const STOCK_SHA = '260a72ebd10208aae44f7c01ad18a79cf1d7ad32658ecd1dee0d5215c0e6b7c0';
const BASE = 0x08008000;
const hex = (a) => Buffer.from(a).toString('hex');
const sha = (b) => createHash('sha256').update(b).digest('hex');

function assemble(name, at, asm) {
  const work = mkdtempSync(join(tmpdir(), 'cfw-'));
  try {
    // One section based at the image start: stock targets are labels placed with .org, so the assembler resolves
    // every branch itself (ld refuses an absolute destination it cannot type as Thumb).
    const stock = new Map();
    const body = asm.replace(/\b(b\.w|bl|b)(\s+)0x([0-9a-fA-F]{8})\b/g, (_, op, sp, h) => { const n = `stock_${h.toLowerCase()}`; stock.set(n, parseInt(h, 16)); return op + sp + n; });
    const labels = [...stock].sort((a, b) => a[1] - b[1]);
    // labels before the code, the code, labels after it; .org refuses to move backwards if the code overruns one
    const lab = ([n, v]) => `.org 0x${(v - BASE).toString(16)}\n.thumb_func\n${n}:`;
    const before = labels.filter(([, v]) => v < at).map(lab).join("\n");
    const after = labels.filter(([, v]) => v >= at).map(lab).join("\n");
    writeFileSync(join(work, "p.s"), `.syntax unified\n.thumb\n.text\n${before}\n.org 0x${(at - BASE).toString(16)}\n.global entry\n.thumb_func\n${body}\ncode_end:\n${after}\n`);
    execFileSync('docker', ['run', '--rm', '-v', `${work}:/w`, 'debian:trixie-slim', 'sh', '-c',
      'apt-get update -qq >/dev/null && apt-get install -y -qq binutils-arm-none-eabi >/dev/null 2>&1 && cd /w && ' +
      `arm-none-eabi-as -mcpu=cortex-m3 -o p.o p.s && arm-none-eabi-ld -Ttext=0x${BASE.toString(16)} -e entry -o p.elf p.o && ` +
      'arm-none-eabi-objcopy -O binary p.elf p.bin && arm-none-eabi-nm p.elf > p.sym && arm-none-eabi-objdump -d p.elf > p.lst'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const syms = Object.fromEntries(readFileSync(join(work, 'p.sym'), 'utf8').trim().split('\n')
      .map((l) => l.split(' ')).map(([v, , n]) => [n, parseInt(v, 16)]));
    const all = new Uint8Array(readFileSync(join(work, 'p.bin')));
    const end = parseInt(readFileSync(join(work, 'p.sym'), 'utf8').match(/^([0-9a-f]+) \w code_end$/m)[1], 16);
    return { bin: all.subarray(at - BASE, end - BASE), syms, listing: readFileSync(join(work, 'p.lst'), 'utf8') };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

function literalsInto(image, lo, hi) {
  const dv = new DataView(image.buffer, image.byteOffset);
  const hits = [];
  for (let i = 0; i + 4 <= image.length; i += 4) { const v = dv.getUint32(i, true) & ~1; if (v >= lo && v < hi) hits.push(BASE + i); }
  return hits;
}

function branchesInto(image, lo, hi) {
  const hits = [];
  for (let i = 0; i + 4 <= image.length; i += 2) {
    const d = decodeBranch(image.subarray(i, i + 4), BASE + i);
    if (d && d.to >= lo && d.to < hi && !(BASE + i >= lo && BASE + i < hi)) hits.push(BASE + i);
  }
  return hits;
}

export async function build(names) {
  const raw = readFileSync(join(DIR, 'circuit-firmware-3592.syx'));
  if (sha(raw) !== STOCK_SHA) throw new Error('the base is not stock 3592');
  const fw = readFirmware(new Uint8Array(raw));
  const stock = fw.image, image = stock.slice();
  const report = [];
  for (const n of names) {
    const p = (await import(`./patches/${n}.mjs`)).default;
    const { bin, syms, listing } = assemble(p.name, p.code.at, p.code.asm);
    const lo = p.code.at - BASE, hi = lo + bin.length;
    if (lo < 0 || hi > image.length) throw new Error(`${p.name}: code outside the image`);
    const region = stock.subarray(lo, hi);
    // Either a free run (all 0x00 or 0xFF), or a declared dead region whose stock bytes match a pinned hash.
    // why: plans/plan-circuit-firmware.md section 4 (free space)
    const reuse = p.code.reuse;
    if (reuse) {
      if (bin.length > reuse.len) throw new Error(`${p.name}: ${bin.length} B does not fit the ${reuse.len} B dead region`);
      if (sha(stock.subarray(lo, lo + reuse.len)) !== reuse.sha) throw new Error(`${p.name}: the dead region is not the stock bytes it was judged on`);
      const into = branchesInto(stock, p.code.at, p.code.at + reuse.len);
      if (into.length) throw new Error(`${p.name}: stock branches into the dead region from ${into.map((a) => a.toString(16)).join(' ')}`);
    } else if (!region.every((b) => b === 0x00) && !region.every((b) => b === 0xFF)) throw new Error(`${p.name}: code region is not one free run in stock`);
    if (!image.subarray(lo, hi).every((b, i) => b === region[i])) throw new Error(`${p.name}: code region already used by another patch`);
    const lits = reuse ? literalsInto(stock, p.code.at, p.code.at + reuse.len) : literalsInto(stock, p.code.at - 0x40, p.code.at + bin.length + 0x40);
    if (lits.length) throw new Error(`${p.name}: literals point into or near the code region: ${lits.map((a) => a.toString(16)).join(' ')}`);
    image.set(bin, lo);
    for (const h of p.hooks) {
      const o = h.at - BASE;
      if (hex(stock.subarray(o, o + 4)) !== h.expect) throw new Error(`${p.name}: hook ${h.at.toString(16)} reads ${hex(stock.subarray(o, o + 4))}, want ${h.expect}`);
      const to = syms[h.branchTo];
      if (to == null) throw new Error(`${p.name}: no symbol ${h.branchTo}`);
      const br = encodeBranch(h.at, to, !!h.link);
      if (decodeBranch(br, h.at).to !== to) throw new Error('branch encoder disagrees with decoder');
      image.set(br, o);
    }
    report.push({ name: p.name, at: p.code.at, bytes: bin.length, hooks: p.hooks.length, listing });
  }
  const out = writeFirmware(image, fw);
  const back = readFirmware(out);
  if (!back.image.every((b, i) => b === image[i])) throw new Error('rebuilt file does not read back');
  const changed = [];
  for (let i = 0; i < image.length; i++) if (image[i] !== stock[i]) { const last = changed.at(-1); if (last && i - last[1] <= 4) last[1] = i + 1; else changed.push([i, i + 1]); }
  return { out, report, changed: changed.map(([a, b]) => [BASE + a, b - a]), sha: sha(out) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = process.argv.slice(2);
  if (!names.length) { console.error('usage: node rig/circuit-fw/build.mjs <patch> [...]'); process.exit(2); }
  const r = await build(names);
  mkdirSync(join(DIR, 'out'), { recursive: true });
  const file = join(DIR, 'out', `circuit-3592-${names.join('-')}.syx`);
  writeFileSync(file, r.out);
  for (const p of r.report) console.log(`${p.name}: ${p.bytes} B at 0x${p.at.toString(16)}, ${p.hooks} hook(s)\n${p.listing.split('\n').filter((l) => /^\s+[0-9a-f]+:/.test(l)).join('\n')}`);
  console.log('changed:', r.changed.map(([a, n]) => `0x${a.toString(16)}+${n}`).join(' '));
  console.log(`${file}\nsha256 ${r.sha}\nNOT FOR FLASHING until emulated and the owner says so.`);
}
