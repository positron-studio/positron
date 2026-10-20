// node /app/render.mjs --queue /files/queue.json --seconds 900 --seed 7 --out /out/x [--dry]: a station's live run (startLive,
// the code on air) into <out>.mp3 with its timeline in <out>.run.json: every scene, blend, ghost and patch on the mix
// clock and on the MP3's own clock. --dry: the same files through the tuner and the master only (no granulator, no
// layers), the reference to hear the processing against. Run in the grains image by gate.mjs, which measures the result. why: lessons/workers-cast.md#gate
import { readFileSync, writeFileSync, createWriteStream } from 'node:fs';

const argv = process.argv.slice(2), flag = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const S = Number(flag('--seconds', 900)), seed = Number(flag('--seed', 7)), out = flag('--out', '/out/render');
const { queue, votes = [] } = JSON.parse(readFileSync(flag('--queue', '/files/queue.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DRY = argv.includes('--dry');
const { startLive } = await import('./container/live.mjs');
const { startGrains, PATCHES } = await import('./container/grains.mjs');

const file = createWriteStream(`${out}.mp3`), t0 = Date.now(), lines = [];
let bytes = 0;
const say = (l) => lines.push({ wall: +((Date.now() - t0) / 1000).toFixed(2), line: String(l) });
const openSink = async () => ({ closed: false, write: (b) => { bytes += b.length; return new Promise((r) => file.write(b, r)); }, close() {} });
const target = { kind: 'file', mount: 'render' }, cb = { openSink, say, fail: (e) => say(`FAIL ${e.message || e}`) };
// dry: a file every 100 s with a 15 s cross-fade, about a live scene's length, the ring at mix 0
const L = DRY ? startGrains({ queue, target, set: { drift: 1, dwell: 100, blend: 15, noise: 0 }, patch: { name: PATCHES[0].name, set: { mix: 0 } } }, { ...cb, inputs: 4 })
  : startLive({ queue, target, life: { seed, votes } }, cb);

// one row a quarter second; a scene, a blend, a ghost or a patch change is an event on both clocks
const rows = [], scenes = [], blends = [], ghosts = [], patches = [], offsets = [];
let last = { land: -1, phase: '', ghost: null, patch: '' }, xruns = 0, maxBacklog = 0, maxLag = 0;
while ((Date.now() - t0) / 1000 < S) {
  await sleep(250);
  const s = L.status(), l = s.life, ch = s.grains?.chain;
  if (ch) xruns = ch.xruns;
  const mix = s.seconds, mp3 = s.mp3Seconds;
  if (DRY) {
    if (mp3 > 1) offsets.push(mix - mp3);
    if (s.landings !== last.land) { last.land = s.landings; scenes.push({ si: scenes.length, mixAt: +(s.cycleFrom ?? mix).toFixed(2), file: s.slots?.[s.from]?.title ?? '', patch: 'dry', dwell: 100, blend: 15 }); }
    if (s.phase === 'blend' && last.phase !== 'blend') blends.push({ si: scenes.length - 1, mixAt: +mix.toFixed(2), from: s.slots?.[s.from]?.title ?? '' });
    last.phase = s.phase; continue;
  }
  if (!l) continue;
  if (mp3 > 1) offsets.push(mix - mp3);
  if ((Date.now() - t0) / 1000 > 10) { maxBacklog = Math.max(maxBacklog, s.backlog); maxLag = Math.max(maxLag, s.lag); }
  rows.push({ mix: +mix.toFixed(2), si: l.si, phase: l.phase, patch: l.patch, wet: +(+l.wet).toFixed(3), level: l.level });
  if (s.landings !== last.land) {
    last.land = s.landings;
    scenes.push({ si: l.si, mixAt: +l.sceneAt.toFixed(2), file: l.file, patch: l.patch, param: l.param, len: l.len,
      dwell: +(+l.dwell).toFixed(1), blend: +(+l.blend).toFixed(1), kind: l.def?.kind ?? null, type: l.def?.type ?? null, section: l.def?.section ?? null, bridge: l.def?.iKind ?? null, fx: l.def?.fx ?? null,
      drone: l.layers?.drone, harm: l.layers?.harm, ghost: l.layers?.ghost, key: l.key ? `${l.key.root}${l.key.minor ? 'm' : ''}` : null });
  }
  if (l.phase === 'blend' && last.phase !== 'blend') blends.push({ si: l.si, mixAt: +(mix - Math.max(0, l.at)).toFixed(2), from: l.file });
  last.phase = l.phase;
  if (l.ghost !== last.ghost) { if (l.ghost) ghosts.push({ si: l.si, mixAt: +mix.toFixed(2), title: l.ghost }); else if (ghosts.length) ghosts.at(-1).mixEnd = +mix.toFixed(2); last.ghost = l.ghost; }
  if (l.patch !== last.patch) { patches.push({ si: l.si, mixAt: +mix.toFixed(2), patch: l.patch }); last.patch = l.patch; }
}
const end = L.status();
L.stop(); await sleep(1500); file.end(); await sleep(300);

// the mix runs ahead of the MP3 by the pipes and the encoder: the median gap moves every event onto the MP3's clock
const off = offsets.length ? offsets.sort((a, b) => a - b)[offsets.length >> 1] : 0;
const onMp3 = (x) => ({ ...x, at: +Math.max(0, x.mixAt - off).toFixed(2), ...(x.mixEnd != null ? { end: +Math.max(0, x.mixEnd - off).toFixed(2) } : {}) });
writeFileSync(`${out}.run.json`, JSON.stringify({
  dry: DRY, seed, seconds: S, mp3Seconds: end.mp3Seconds, bytes, offset: +off.toFixed(3), offsetSpread: offsets.length ? +(offsets.at(-1) - offsets[0]).toFixed(3) : null,
  xruns, maxBacklog: +maxBacklog.toFixed(2), maxLag: +maxLag.toFixed(2), queue: queue.map(({ id, title, kind, seconds, gain }) => ({ id, title, kind, seconds, gain })),
  scenes: scenes.map(onMp3), blends: blends.map(onMp3), ghosts: ghosts.map(onMp3), patches: patches.map(onMp3),
  fails: lines.filter((x) => x.line.startsWith('FAIL')), lines: lines.slice(-400), rows,
}));
console.log(`render: ${scenes.length} scenes, ${blends.length} blends, ${ghosts.length} ghosts, ${xruns} xruns, offset ${off.toFixed(2)} s, ${bytes} bytes`);
process.exit(0);
