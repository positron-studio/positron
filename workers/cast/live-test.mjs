// node workers/cast/live-test.mjs: live mode's pure parts, anywhere (the asserts marked NEGATIVE CONTROL can fail).
// --browser: the soften worklet in headless Chrome's own AudioWorklet against the container's function.
// --live: in the grains image, the chain with four inputs graded (the layers' levels against the browser's, the
// ghost input kept off the ring) and then a station's live run into a file. Run from the repo root:
//   docker run --rm --name cast-live-test --cpus 0.5 --memory 1536m -v $PWD/workers/cast:/app \
//     -v <a folder with driving.mp3 evening.mp3 kalle.mp3>:/files:ro grains-local node /app/live-test.mjs --live
import { readFileSync, readdirSync, createWriteStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const argv = process.argv.slice(2), flag = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SR = 44100;

if (argv[0] === '--live') await live();
else if (argv[0] === '--browser') await browser();
else await pure();
console.log(`\nlive-test: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);

async function pure() {
  const { SC_FILES } = await import('./sc-files.mjs');
  for (const f of SC_FILES) {
    let same = false;
    try { same = readFileSync(`${HERE}container/sc/${f}`, 'utf8') === readFileSync(`${HERE}../../demo/${f}`, 'utf8'); } catch { /* absent */ }
    ok(`container/sc/${f} is demo/${f}`, same);
  }
  const { widen } = await import('./container/grains.mjs');
  const { createChroma, tweaksOf, lockOf } = await import('./container/live.mjs');
  const { layerLevel, KEY_FROM, KEY_HZ } = await import('./container/sc/radio/cast/layers.mjs');
  const { createLife, fromT } = await import('./container/sc/radio/cast/life.mjs');

  // ── the page's driver, read out of its source, against the container's ──
  const page = readFileSync(`${HERE}../../demo/radio/cast/index.html`, 'utf8');
  const pageLevel = (() => { const m = /const ease = \(u\) => u \* u \* \(3 - 2 \* u\), heard = [^;]*;\s*const layerLevel = ([^;]*);/.exec(page); return m && new Function('ease', `return ${m[1]}`)((u) => u * u * (3 - 2 * u)); })();
  ok('the layers\' fade is the page\'s, at 201 points of a scene', !!pageLevel && Array.from({ length: 201 }, (_, i) => i / 200).every((x) => Math.abs(layerLevel(x) - pageLevel(x)) < 1e-12));
  const early = (x) => (x < 0.1 ? 0 : layerLevel(Math.max(0.12, x)) || 0.01);
  ok('NEGATIVE CONTROL: a fade rising from 10 % would not compare equal', !!pageLevel && Array.from({ length: 201 }, (_, i) => i / 200).some((x) => Math.abs(early(x) - pageLevel(x)) > 1e-6));
  ok('the key is heard in the page\'s seconds and band', page.includes(`since >= ${KEY_FROM[0]} && since < ${KEY_FROM[1]}`) && page.includes(`Math.ceil(${KEY_HZ[0]} / hzPer)`) && page.includes(`${KEY_HZ[1]} / hzPer`), `${KEY_FROM} s, ${KEY_HZ} Hz`);
  ok('the analyser it copies is 8192 points on the tuner', /tunerAnalyser\.fftSize = 8192/.test(readFileSync(`${HERE}../../demo/radio/cast/local.mjs`, 'utf8')));
  const pageTweaks = /const tweaksOf = \(s\) => ([^;]*);/.exec(page)?.[1];
  const s0 = createLife({ seed: 3 }).scene(0);
  ok('a scene\'s tweaks are the page\'s', !!pageTweaks && JSON.stringify(new Function('fromT', `return (s) => ${pageTweaks}`)(fromT)(s0)) === JSON.stringify(tweaksOf(s0)));
  ok('the grains lock on the beat as on the page', page.includes("lock: s.layers.bpm && s.layers.pulseOn === 'grains' ? 1 : 0") && lockOf({ layers: { bpm: 90, pulseOn: 'grains' } }) === 1 && lockOf({ layers: { bpm: 90, pulseOn: 'res' } }) === 0);

  // ── four channels into scsynth: the mix on 1 and 2, the ghost on 3 and 4 ──
  const pcm = Buffer.alloc(8); pcm.writeInt16LE(1000, 0); pcm.writeInt16LE(-2000, 2); pcm.writeInt16LE(3, 4); pcm.writeInt16LE(4, 6);
  const wd = widen(pcm, Float32Array.of(0.5, -0.25));
  ok('widen keeps the mix on 1 and 2 and puts the ghost on 3 and 4', [0, 2, 4, 6, 8, 10, 12, 14].map((o) => wd.readInt16LE(o)).join() === [1000, -2000, 16384, 16384, 3, 4, -8192, -8192].join());
  ok('NEGATIVE CONTROL: no ghost is silence on 3 and 4, not a copy of the mix', [4, 6, 12, 14].every((o) => widen(pcm, null).readInt16LE(o) === 0));

  // ── the key: a chroma as the page's analyser reads it ──
  const tone = (f, n = 8192, sr = 44100) => Float32Array.from({ length: n }, (_, i) => [1, 0.5, 0.25].reduce((a, g, h) => a + 0.2 * g * Math.sin(2 * Math.PI * f * (h + 1) * i / sr), 0));
  const heard = (f) => { const c = createChroma(); for (let k = 0; k < 20; k++) c.add(tone(f)); return c.root(); };
  ok('an A with its harmonics is heard as A (9)', heard(220) === 9, String(heard(220)));
  ok('a D is heard as D (2), an F sharp as F sharp (6)', heard(146.83) === 2 && heard(369.99) === 6);
  ok('NEGATIVE CONTROL: silence has no key, so a key is never made up', (() => { const c = createChroma(); c.add(new Float32Array(8192)); return c.root() === null; })());

  // ── the soften stage: the page's worklet runs the container's function ──
  const { createSoften, WORKLET, SOFTEN } = await import('./container/sc/radio/cast/soften.mjs');
  const clicks = (() => { const sr = 44100, x = new Float32Array(sr * 3); let s = 1; for (let i = 0; i < x.length; i++) { s = (s * 16807) % 2147483647; x[i] = 0.1 * Math.sin(2 * Math.PI * 300 * i / sr) + 0.01 * ((s / 2147483647) * 2 - 1); }
    for (let t = 0.2; t < 2.9; t += 0.645) { const o = Math.round(t * sr); for (let i = 0; i < 66; i++) x[o + i] += 0.3 * Math.sin(2 * Math.PI * 4000 * i / sr) * Math.sin(Math.PI * i / 66); } return x; })();
  const inWorklet = (src, x, block = 128) => {
    let P = null; const scope = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', `${src}`);
    scope((name, C) => { P = C; }, class {}, 44100);
    const p = new P(), out = new Float32Array(x.length);
    for (let o = 0; o < x.length; o += block) { const i = x.subarray(o, o + block), y = new Float32Array(i.length); p.process([[i]], [[y]]); out.set(y, o); }
    return out;
  };
  const nodeOut = (() => { const s = createSoften(44100), y = Float32Array.from(clicks); for (let o = 0; o < y.length; o += 882) s.process(y.subarray(o, o + 882)); return y; })();
  const wk = inWorklet(WORKLET, clicks);
  ok('the page\'s worklet (128 frame quanta) and the container (882 frame blocks) give the same samples', wk.every((v, i) => v === nodeOut[i]), `${clicks.length} samples`);
  ok('NEGATIVE CONTROL: a worklet with another ratio does not', inWorklet(WORKLET.replace(`"ratio":${SOFTEN.ratio}`, '"ratio":40'), clicks).some((v, i) => v !== nodeOut[i]));
  // the tick alone: what soften leaves of (the clicks plus a tone) less what it leaves of the tone, against the raw ticks
  const clean = (() => { const sr = 44100, x = new Float32Array(sr * 3); let s = 1; for (let i = 0; i < x.length; i++) { s = (s * 16807) % 2147483647; x[i] = 0.1 * Math.sin(2 * Math.PI * 300 * i / sr) + 0.01 * ((s / 2147483647) * 2 - 1); } return x; })();
  const cleanOut = createSoften().process(Float32Array.from(clean));
  const { createBiquad } = await import('./container/mixer.mjs');
  const band = (x) => { const h = createBiquad('highpass', 2000, 0), l = createBiquad('lowpass', 6000, 0); return Float32Array.from(x, (v) => l.step(h.step(v))); };
  const [bc, bk, bo, bq] = [clicks, clean, nodeOut, cleanOut].map(band);
  let raw = 0, left = 0; for (let i = 0; i < clicks.length; i++) { raw += (bc[i] - bk[i]) ** 2; left += (bo[i] - bq[i]) ** 2; }
  ok('soften takes a 1.5 ms 4 kHz tick down by more than 15 dB in 2 to 6 kHz', 10 * Math.log10(raw / left) > 15, `${(10 * Math.log10(raw / left)).toFixed(1)} dB`);
  const sine = Float32Array.from({ length: 44100 }, (_, i) => 0.1 * Math.sin(2 * Math.PI * 300 * i / 44100)), sf = createSoften(), so = Float32Array.from(sine);
  sf.process(so.subarray(0, 441)); const startDucks = sf.ducks; sf.process(so.subarray(441));
  const rms = (x, a = 4410) => Math.sqrt(x.subarray(a).reduce((q, v) => q + v * v, 0) / (x.length - a));
  ok('a click free 300 Hz tone passes within 0.5 dB and is never ducked once it has started', Math.abs(db(rms(so)) - db(rms(sine))) < 0.5 && sf.ducks === startDucks, `${(db(rms(so)) - db(rms(sine))).toFixed(2)} dB, ${sf.ducks - startDucks} ducks after the first 10 ms`);

  // ── a station's program, picked as the page picks it ──
  const { pickFiles } = await import('./worker.mjs');
  const { seeded } = await import('./container/mixer.mjs');
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((t) => ({ id: t, title: t }));
  const votes = [1, 1, 1].map(() => ({ file: 'a', vote: 1, def: { patch: 'x', param: 'y' } }));
  const picks = Array.from({ length: 200 }, (_, i) => pickFiles(items, votes, 5, seeded(i + 1)));
  ok('a file voted bad three times (-6) is never picked', picks.every((p) => !p.includes('a') && p.length === 5));
  ok('NEGATIVE CONTROL: with no votes it is picked', Array.from({ length: 50 }, (_, i) => pickFiles(items, [], 5, seeded(i + 1))).some((p) => p.includes('a')));
  const liked = [3, 4, 4].map(() => ({ file: 'b', vote: 4, def: {} }));
  const firsts = Array.from({ length: 400 }, (_, i) => pickFiles(items, liked, 1, seeded(i + 7))[0]);
  ok('a liked file comes first more often than the rest (fileWeight)', firsts.filter((x) => x === 'b').length > 400 / 6 * 2, `${firsts.filter((x) => x === 'b').length} of 400`);
}

// ── in the grains image ──────────────────────────────────────────────────────────────────────────────
/** The browser test's voice: pink-ish noise opened four times a second, two formants, gain 0.12 (layers-test --browser). */
function voice(seed) {
  const peak = (f, Q, g) => { const A = 10 ** (g / 40), w0 = 2 * Math.PI * f / SR, al = Math.sin(w0) / (2 * Q), c = Math.cos(w0), a0 = 1 + al / A;
    const k = [(1 + al * A) / a0, -2 * c / a0, (1 - al * A) / a0, -2 * c / a0, (1 - al / A) / a0]; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => { const y = k[0] * x + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }; };
  const n = SR * 4, a = new Float32Array(n); let y = 0, s = seed;
  for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; y = 0.97 * y + ((s / 2147483647) * 2 - 1) * 0.3; a[i] = y * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * i / SR)) ** 2; }
  const f1 = peak(700, 2, 12), f2 = peak(1800, 3, 9), out = new Float32Array(n * 2);
  // twice round, so the filters' start is not in the loop
  for (let i = 0; i < n * 2; i++) out[i] = f2(f1(a[i % n])) * 0.12;
  return out.subarray(n);
}

async function live() {
  const { startChain, widen } = await import('./container/grains.mjs');
  const { createLayerEngine } = await import('./container/sc/radio/cast/layers.mjs');
  const { compile } = await import('./container/sc/shell/sclang-lite.mjs');
  const logs = [], log = (l) => logs.push(l);

  // ── 1. the chain with four inputs: levels and the ghost's own input ──
  const chain = await startChain({ inputs: 4, mix: 0, log });
  const main = voice(7), gh = voice(99), BLK = 882;
  const feed = { main: true, ghost: true, i: 0, stop: false };
  (async () => {
    while (!feed.stop && !chain.dead) {
      const pcm = Buffer.alloc(BLK * 4), x = new Float32Array(BLK);
      for (let k = 0; k < BLK; k++) {
        const j = (feed.i + k) % main.length, v = feed.main ? Math.round(main[j] * 32767) : 0;
        pcm.writeInt16LE(v, k * 4); pcm.writeInt16LE(v, k * 4 + 2); x[k] = feed.ghost ? gh[j] : 0;
      }
      feed.i += BLK;
      if (!chain.feed.write(widen(pcm, x))) await new Promise((r) => chain.feed.once('drain', r));
    }
  })();
  let ss = 0, n = 0;
  chain.out.on('data', (b) => { for (let i = 0; i + 3 < b.length; i += 4) { const m = 0.5 * (b.readInt16LE(i) + b.readInt16LE(i + 2)) / 32768; ss += m * m; n++; } });
  const measure = async (ms = 2500) => { await sleep(ms); ss = 0; n = 0; await sleep(1500); return Math.sqrt(ss / Math.max(1, n)); };
  await sleep(1500);
  const sc = { send: chain.send, sendAndWait: (t, ms, a, ...r) => chain.ask((m) => t([m.address, ...m.args]), ms, a, ...r).then((m) => m && [m.address, ...m.args]) };

  // the ring hears 2 and 3 only: with its own input silent it is silent, whatever is on 4 and 5
  feed.main = false; feed.ghost = true; const ringGhost = await measure();
  feed.main = true; feed.ghost = false; const ringMain = await measure();
  chain.send('/n_set', 4000, 'inbus', 4); feed.main = false; feed.ghost = true; const ringOn4 = await measure();
  chain.send('/n_free', 4000); feed.main = true; feed.ghost = true;
  ok('the ring hears its own input (busses 2 and 3)', db(ringMain) > -40, `${db(ringMain).toFixed(1)} dB`);
  ok('the ring does not hear the ghost (busses 4 and 5): silent with only the ghost playing', db(ringGhost) < -80, `${db(ringGhost).toFixed(1)} dB`);
  ok('NEGATIVE CONTROL: the same ring pointed at bus 4 hears the ghost', db(ringOn4) > -40, `${db(ringOn4).toFixed(1)} dB`);

  // each layer alone against the source, as layers-test --browser measures it
  const probe = compile('{ Mix(In.ar(2, 2)) * 0.5 }', { name: 'probe' });
  await sc.sendAndWait((m) => m[0] === '/done', 5000, '/d_recv', probe.bytes);
  chain.send('/s_new', 'probe', 4900, 0, 0); const src = await measure(); chain.send('/n_free', 4900); await sleep(300);
  const E = await createLayerEngine(sc), key = { root: 2, minor: true }, out = {};
  const base = { drone: 'none', droneLevel: 0.3, droneOct: -1, res: 'none', resWet: 0.3, resDecay: 1.5, harm: 'none', harmSpread: 0.6, ghost: 'none', ghostLevel: 0.17, bpm: 0, room: 0, roomSize: 0.7 };
  const cases = { drone: { drone: 'key' }, freeze: { drone: 'freeze' }, res: { res: 'minor7' }, harm: { harm: 'octfifth' }, ghostbpf: { ghost: 'bpf' }, ghostcomb: { ghost: 'comb' }, ghostres: { ghost: 'res' } };
  // a ghost's band-pass and pan wander (LFNoise2), so it is read over 6 s rather than 1.5
  const measureFor = async (ms) => { await sleep(2500); ss = 0; n = 0; await sleep(ms); return Math.sqrt(ss / Math.max(1, n)); };
  for (const [k, c] of Object.entries(cases)) { E.apply({ ...base, ...c }, key); if (k.startsWith('ghost')) E.ghost(true); out[k] = await measureFor(k.startsWith('ghost') ? 6000 : 1500); E.apply({ ...base }, key); E.ghost(false); await sleep(4500); }
  E.apply(base, key); const silent = await measure();
  const status = await chain.ask((m) => m.address === '/status.reply', 2000, '/status');
  E.stop(); feed.stop = true; await chain.close();
  const rel = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, +(db(v) - db(src)).toFixed(1)]));
  console.log(`  source ${db(src).toFixed(1)} dB rms; each layer alone, relative to it: ${JSON.stringify(rel)}`);
  ok('the source is at a levelled loudness (-30 to -15 dB rms), as in the browser test', db(src) > -30 && db(src) < -15, db(src).toFixed(1));
  const layersOnly = Object.entries(rel).filter(([k]) => !k.startsWith('ghost')), ghosts = Object.entries(rel).filter(([k]) => k.startsWith('ghost'));
  ok('each layer sits 8.5 to 14 dB under the file (the browser measured 10 to 13)', layersOnly.every(([, v]) => v <= -8.5 && v >= -14), JSON.stringify(Object.fromEntries(layersOnly)));
  ok('each ghost sits 12 to 19 dB under (the browser measured 15 to 17 once; they wander)', ghosts.every(([, v]) => v <= -12 && v >= -19), JSON.stringify(Object.fromEntries(ghosts)));
  ok('NEGATIVE CONTROL: every layer off is silent, so the level checks can fail', db(silent) < -80, db(silent).toFixed(1));
  ok('scsynth ran the six layer programs beside nothing else', status?.args?.[2] === 6, `synths ${status?.args?.[2]}`);

  // ── 2. a station's live run, into a file ──
  await liveRun();
}

async function liveRun() {
  const { startLive } = await import('./container/live.mjs');
  const { createLife } = await import('./container/sc/radio/cast/life.mjs');
  const S = Number(flag('--seconds', 110)), seed = Number(flag('--seed', 7)), STEP1 = Number(flag('--step', 32));
  const dir = flag('--files', '/files');
  const q = [['driving', 'evt_1791874248959', -1.3, 'field', true, 102], ['evening', 'evt_1791829792104', -1.4, 'music', false, 132], ['kalle', 'evt_1791488203609', -8.2, 'music', true, 319]]
    .map(([t, id, gain, kind, soften, seconds]) => ({ id, title: t, url: `${dir}/${t}.mp3`, gain, kind, soften, seconds }));
  const outFile = flag('--out', '/tmp/live.mp3'), file = createWriteStream(outFile), logs = [], t0 = Date.now();
  const say = (l) => logs.push(`${((Date.now() - t0) / 1000).toFixed(1)} ${l}`);
  const openSink = async () => ({ closed: false, write: (b) => new Promise((r) => file.write(b, r)), close() {} });
  const L = startLive({ queue: q, target: { kind: 'file', mount: 'test' }, life: { seed, votes: [] } }, { openSink, say, fail: (e) => say(`FAIL ${e.message || e}`) });
  const cgroup = () => { try { return Number(/usage_usec (\d+)/.exec(readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8'))[1]); } catch { return null; } };
  const byComm = () => { const o = {}; for (const d of readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { try {
    const raw = readFileSync(`/proc/${d}/stat`, 'utf8'), comm = raw.slice(raw.indexOf('(') + 1, raw.lastIndexOf(')')), f = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
    const k = comm === 'ffmpeg' ? (readFileSync(`/proc/${d}/cmdline`, 'utf8').includes('libmp3lame') ? 'ffmpeg (LAME)' : 'ffmpeg (decode)') : comm;
    o[k] = (o[k] || 0) + (Number(f[11]) + Number(f[12])) / 100; } catch { /* gone */ } } return o; };
  const rows = [], xrunAt = []; let lastX = 0, xruns10 = null, cpu0 = null, pc0 = null, tc0 = 0, step1 = null, step2 = null, maxSynths = 0, maxLevel = 0, maxBacklog = 0;
  while ((Date.now() - t0) / 1000 < S) {
    await sleep(250);
    const t = (Date.now() - t0) / 1000, s = L.status(), l = s.life, ch = s.grains.chain;
    if (!cpu0 && t >= 10 && ch) { cpu0 = cgroup(); pc0 = byComm(); tc0 = t; xruns10 = ch.xruns; }
    if (l) rows.push({ t, si: l.si, kind: l.kind, at: l.at, value: l.value, wet: l.wet, param: l.param, patch: l.patch, file: l.file, key: l.key, def: l.def, landings: s.landings, level: l.level, sceneAt: l.sceneAt });
    if (ch && ch.xruns !== lastX) { xrunAt.push(`${t.toFixed(1)} s: ${ch.xruns}`); lastX = ch.xruns; }
    if (ch?.scsynth) maxSynths = Math.max(maxSynths, ch.scsynth.synths);
    if (l) maxLevel = Math.max(maxLevel, l.level);
    if (t > 10) maxBacklog = Math.max(maxBacklog, s.backlog);
    if (!step1 && t >= STEP1) { step1 = { mix: L.engine.seconds, si: l.si, blend: l.blend, ok: L.step(1) }; say(`test: step +1 at ${step1.mix}`); }
    if (step1 && !step2 && s.landings === 1 && l.si === step1.si + 1 && l.at > 6) { step2 = { mix: L.engine.seconds, si: l.si, blend: l.blend, ok: L.step(-1), again: L.step(1) }; say(`test: step -1 at ${step2.mix}`); }
  }
  const s = L.status(), ch = s.grains.chain, cpu1 = cgroup(), pc1 = byComm(), span = (Date.now() - t0) / 1000 - tc0;
  const per = Object.fromEntries(Object.entries(pc1).map(([k, v]) => [k, +(((v - (pc0?.[k] ?? 0)) / span) * 100).toFixed(1)]));
  L.stop(); await sleep(1500); file.end(); await sleep(300);
  const cpuPct = cpu0 != null ? +(((cpu1 - cpu0) / 1e6 / span) * 100).toFixed(1) : null;

  // the planner, run apart: a scene is made when it first lands, on that file's kind, after the keys the station
  // heard in the scenes before it are copied in (a scene's key moves from the last one's)
  const plan = (sd) => {
    const P = createLife({ seed: sd, votes: [] }), heardKey = new Map();
    return { at(si, file, key) {
      if (!heardKey.has(si)) { for (const [i, k] of heardKey) P.scene(i).key = k; P.scene(si, { kind: q.find((x) => x.title === file)?.kind }); }
      heardKey.set(si, key); return P;
    } };
  };
  const P = plan(seed), N = plan(seed + 1);
  const scenes = [...new Map(rows.map((r) => [`${r.landings}`, r])).values()];
  let defsSame = true, valsSame = true, shifted = false, otherSeed = false, checked = 0;
  for (const r of rows) {
    const life = P.at(r.si, r.file, r.key), sc = life.scene(r.si);
    const { key: _a, ...want } = life.defOf(sc), { key: _b, ...got } = r.def;
    if (JSON.stringify(want) !== JSON.stringify(got)) defsSame = false;
    const v = r.kind === 'interlude' ? life.inInterlude(r.si, r.at) : life.inScene(r.si, r.at);
    if (v.value !== r.value || v.wet !== r.wet || v.param !== r.param || v.patch !== r.patch) valsSame = false;
    const w = r.kind === 'interlude' ? life.inInterlude(r.si, r.at + 1) : life.inScene(r.si, r.at + 1);
    if (w.wet !== r.wet || w.value !== r.value) shifted = true;
    const o = N.at(r.si, r.file, r.key), od = o.defOf(o.scene(r.si)); delete od.key;
    if (JSON.stringify(od) !== JSON.stringify(got)) otherSeed = true;
    checked++;
  }
  const first = rows[0], landing1 = rows.find((r) => r.landings === 1), landing2 = rows.find((r) => r.landings === 2);
  console.log(`  scenes: ${scenes.map((r) => `${r.si} ${r.patch} on ${r.file}`).join('; ')}`);
  ok('scene 0 plays first, on the first file', first?.si === 0 && first.file === 'driving');
  ok(`status.life matches the planner run apart: def, control, value and wet, ${checked} reads`, defsSame && valsSame && checked > 100);
  ok('NEGATIVE CONTROL: the same reads a second later would not match', shifted);
  ok('NEGATIVE CONTROL: another seed\'s life would not match', otherSeed);
  ok('a step starts the transition at once and the next scene lands one blend later on the mix clock', !!(step1?.ok && landing1 && landing1.si === step1.si + 1 && Math.abs(landing1.sceneAt - step1.mix - step1.blend) < 0.1),
    step1 && landing1 ? `step at ${step1.mix.toFixed(2)} s, blend ${step1.blend} s, landed at ${landing1.sceneAt.toFixed(2)} s` : 'no landing');
  ok('a step back lands the previous scene, and a second press on the way is refused', !!(step2?.ok && !step2.again && landing2 && landing2.si === step2.si - 1),
    step2 && landing2 ? `from ${step2.si} to ${landing2.si}` : 'no second landing');
  ok('the layers ran beside the ring (7 synths) and rose to full in a scene', maxSynths >= 7 && maxLevel === 1, `synths ${maxSynths}, level ${maxLevel}`);
  const lf = s.life?.counts || {};
  console.log(`  counts ${JSON.stringify(lf)}, backlog at most ${maxBacklog.toFixed(3)} s, xruns ${ch?.xruns}, late ${ch?.late}, grains ${ch?.grains}`);
  ok('a key was heard in each scene that ran 5 s', lf.keys >= scenes.length - 1, `${lf.keys} keys, ${scenes.length} scenes`);
  ok('JACK kept time once everything was up: no xrun after the first 10 s', ch?.xruns === xruns10, `${xruns10} in the first 10 s, ${ch?.xruns} at the end, period ${ch?.period}; ${xrunAt.join(', ')}`);
  const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', outFile, '-f', 'f32le', '-ac', '2', '-ar', '44100', 'pipe:1'], { maxBuffer: 1 << 30 }).stdout;
  const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
  let pk = 0, full = 0, s2 = 0; for (const v of x) { const a = Math.abs(v); if (a > pk) pk = a; if (a >= 0.999) full++; s2 += v * v; }
  ok('the MP3 is the run, and nothing in it reaches full scale', x.length / 2 / SR > S - 20 && full === 0, `${(x.length / 2 / SR).toFixed(1)} s, peak ${db(pk).toFixed(1)} dBFS, rms ${db(Math.sqrt(s2 / x.length)).toFixed(1)} dBFS, ${full} at full scale`);
  ok('the container stays inside half a vCPU', cpuPct != null && cpuPct < 50, `${cpuPct} % of a core over ${span.toFixed(0)} s; ${JSON.stringify(per)}`);
  console.log(logs.filter((l) => /scene|ghost|step|FAIL|chain/.test(l)).slice(-30).join('\n'));
}

// ── --browser: the page's soften stage in a real AudioWorklet, sample for sample against node ──
async function browser() {
  const { createSoften, WORKLET } = await import('./container/sc/radio/cast/soften.mjs');
  const { launchChrome, connectCdp } = await import('../../demo/chrome.mjs');
  const n = SR * 3, x = new Float32Array(n); let sd = 1;
  for (let i = 0; i < n; i++) { sd = (sd * 16807) % 2147483647; x[i] = 0.1 * Math.sin(2 * Math.PI * 300 * i / SR) + 0.01 * ((sd / 2147483647) * 2 - 1); }
  for (let t = 0.2; t < 2.9; t += 0.645) { const o = Math.round(t * SR); for (let i = 0; i < 66; i++) x[o + i] += 0.3 * Math.sin(2 * Math.PI * 4000 * i / SR) * Math.sin(Math.PI * i / 66); }
  const PAGE = `async (src, data) => {
    const x = Float32Array.from(data), ctx = new OfflineAudioContext(1, x.length, 44100);
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    const b = ctx.createBuffer(1, x.length, 44100); b.copyToChannel(x, 0);
    const s = new AudioBufferSourceNode(ctx, { buffer: b });
    const w = new AudioWorkletNode(ctx, 'cast-soften', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    s.connect(w); w.connect(ctx.destination); s.start();
    return Array.from((await ctx.startRendering()).getChannelData(0));
  }`;
  // an AudioWorklet needs a secure context: a blank page on 127.0.0.1 is one, about:blank is not
  const http = await import('node:http'), srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html>'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = await launchChrome({ prefix: 'soften-test', args: ['--disable-gpu', '--mute-audio'] });
  try {
    const c = await connectCdp(b.wsUrl, { timeout: 60000 }), p = await c.page();
    await p.S('Page.enable'); await p.S('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/` }); await sleep(800);
    const run = async (src) => { const r = await p.S('Runtime.evaluate', { expression: `(${PAGE})(${JSON.stringify(src)}, ${JSON.stringify(Array.from(x))})`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return Float32Array.from(r.result.value); };
    const got = await run(WORKLET), want = createSoften(SR).process(Float32Array.from(x));
    let diff = 0, worst = 0; for (let i = 0; i < n; i++) if (got[i] !== want[i]) { diff++; worst = Math.max(worst, Math.abs(got[i] - want[i])); }
    ok('Chrome\'s AudioWorklet runs soften to the same samples as the container', diff === 0, `${diff} of ${n} differ, at most ${worst}`);
    const off = await run(WORKLET.replace('this.s.step(i[n])', 'i[n]'));
    ok('NEGATIVE CONTROL: a pass-through worklet does not', off.some((v, i) => v !== want[i]));
    c.close();
  } finally { await b.close(); srv.close(); }
}
