// node workers/cast/handover-docker.mjs <folder with driving.mp3 evening.mp3 kalle.mp3>: the real Caster (worker.mjs)
// on real containers (the grains-local image with this tree mounted, OrbStack or Docker), through an adapter with
// ctx.container's shape. Records what a listener gets across a handover, decodes it, and grades it against a
// destroy and restart (NEGATIVE CONTROL). Väin's target is a stand-in Icecast 2.4.4 container: every target on
// their hosts is rewritten to it and their host names resolve to 127.0.0.1 inside. Removes every container it starts.
// why: lessons/workers-cast.md#handover
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Caster } from './worker.mjs';
import { createFramer } from './mp3.mjs';
import { MIN_BYTES, LIVE_GAP_MS } from './splice.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)), FILES = process.argv[2], OUT = process.argv[3] || '/tmp';
if (!FILES) { console.error('usage: node handover-docker.mjs <folder with the mp3s> [out dir]'); process.exit(2); }
const NET = 'cast-ho-net', IMAGE = 'grains-local', TAG = `cast-ho-${process.pid}`;
const THEIRS = ['live.uuu.ee', 'uuu.ee', 'www.uuu.ee', 'eccm.ee'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (...a) => execFileSync('docker', a, { encoding: 'utf8' }).trim();
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const started = new Set();
const cleanup = () => { for (const n of started) spawnSync('docker', ['rm', '-f', n], { stdio: 'ignore' }); spawnSync('docker', ['network', 'rm', NET], { stdio: 'ignore' }); };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

/** ctx.container's shape over `docker run`: start(), running, destroy(), monitor(), getTcpPort(p).fetch(). */
function dockerContainer(name, alias = null) {
  const ct = { name, running: false, images: { cast: IMAGE }, ports: null, ready: null, exited: null, holdStopMs: 0 };
  ct.start = (o) => {
    ct.running = true;
    const cname = `${TAG}-${name.replace('~', '-')}-${Date.now() % 1e6}`;
    ct.cname = cname; started.add(cname);
    ct.ready = (async () => {
      sh('run', '-d', '--rm', '--name', cname, '--network', NET, ...(alias ? ['--network-alias', alias] : []), '--cpus', '0.5', '--memory', '1536m',
        ...THEIRS.flatMap((h) => ['--add-host', `${h}:127.0.0.1`]), '-v', `${HERE}:/app`, '-v', `${FILES}:/files:ro`,
        '-p', '127.0.0.1::8080', '-p', '127.0.0.1::8000', ...Object.entries(o.env || {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
        IMAGE, 'node', '/app/container/server.mjs');
      ct.ports = Object.fromEntries([8080, 8000].map((p) => [p, Number(sh('port', cname, String(p)).split('\n')[0].split(':').at(-1))]));
    })();
    ct.exited = ct.ready.then(() => new Promise((r) => spawn('docker', ['wait', cname], { stdio: 'ignore' }).on('exit', () => { ct.running = false; r(); })));
  };
  ct.destroy = async () => { if (!ct.cname) return; await ct.ready.catch(() => {}); spawnSync('docker', ['rm', '-f', ct.cname], { stdio: 'ignore' }); ct.running = false; };
  ct.monitor = () => ct.exited;
  ct.setInactivityTimeout = async () => {};
  ct.getTcpPort = (port) => ({ fetch: async (url, init = {}) => {
    await ct.ready;
    const u = new URL(url);
    let body = init.body;
    if (body && typeof body !== 'string') body = await new Response(body).text();
    // never their server: a target on their hosts goes to the stand-in Icecast
    if (port === 8080 && u.pathname === '/play' && body) {
      const b = JSON.parse(body);
      if (THEIRS.includes(b.target?.host)) b.target = { ...b.target, host: 'cast-ho-ice', port: 8000, mount: 'preview', pw: 'vpw' };
      if (THEIRS.includes(b.target?.host)) throw new Error('a target on their host');
      if (ct.leadS != null && b.resume?.wall) b.resume.leadS = ct.leadS;
      body = JSON.stringify(b);
    }
    // for the reference recording only: the old container plays on this long after it is told to stop
    if (port === 8080 && u.pathname === '/stop' && ct.holdStopMs) await sleep(ct.holdStopMs);
    return fetch(`http://127.0.0.1:${ct.ports[port]}${u.pathname}${u.search}`, { method: init.method || 'GET', headers: init.headers, body });
  } });
  return ct;
}
function memStorage() {
  const m = new Map();
  return { async get(k) { return structuredClone(m.get(k)); }, async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { for (const x of [].concat(k)) m.delete(x); }, async setAlarm(t) { m.set('__alarm', t); }, async deleteAlarm() { m.delete('__alarm'); } };
}
const objs = new Map();
const env = { TEST_PW: 'pw', VAIN_SOURCE_PW: 'not-theirs', CF_VERSION_METADATA: { id: 'v1' },
  VOTES: { idFromName: (n) => n, get: () => ({ fetch: async () => Response.json({ votes: [] }) }) },
  CASTER: { idFromName: (n) => n, get: (id) => ({ fetch: (u, init) => obj(id).fetch(new Request(u, init)) }) } };
const obj = (name) => { if (!objs.has(name)) objs.set(name, new Caster({ container: dockerContainer(name), storage: memStorage() }, env)); return objs.get(name); };
const ours = () => sh('ps', '-q', '--filter', `name=${TAG}`).split('\n').filter(Boolean).length;

/** A byte stream recorded with each chunk's arrival. */
function record(res, label) {
  const rec = { label, chunks: [], ended: false, t0: Date.now() }, rd = res.body.getReader();
  rec.done = (async () => { try { for (;;) { const { value, done } = await rd.read(); if (done) break; rec.chunks.push({ t: Date.now(), b: value }); } } catch { /* cancelled */ } rec.ended = true; rec.endAt = Date.now(); })();
  rec.stop = () => rd.cancel().catch(() => {});
  return rec;
}
/** Frames of a recording, each with the wall time it was emitted at (a chunk's last frame at its arrival), past the burst. */
function framesOf(rec) {
  const fr = createFramer(), out = [];
  let bytes = 0, last = null, live = false;
  for (const { t, b } of rec.chunks) {
    const gap = last == null ? 0 : t - last; last = t; bytes += b.length;
    if (!live && bytes - b.length >= MIN_BYTES && gap >= LIVE_GAP_MS) live = true;
    const fs_ = fr.push(b);
    fs_.forEach((f, i) => out.push({ ...f, at: t - (fs_.length - 1 - i) * f.seconds * 1000, live }));
  }
  // the burst's frames, back from the first live one
  const k = out.findIndex((f) => f.live);
  if (k > 0) for (let i = k - 1; i >= 0; i--) out[i].at = out[i + 1].at - out[i].seconds * 1000;
  return out;
}
/** Decodes frames to mono floats with ffmpeg; `errors` are its complaints. */
function decode(frames, name) {
  const p = `${OUT}/${name}.mp3`;
  fs.writeFileSync(p, Buffer.concat(frames.map((f) => Buffer.from(f.data))));
  fs.writeFileSync(`${OUT}/${name}.at.json`, JSON.stringify(frames.map((f) => Math.round(f.at))));
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'warning', '-i', p, '-ac', '1', '-ar', '44100', '-f', 'f32le', 'pipe:1'], { maxBuffer: 1 << 30 });
  const n = r.stdout.length >> 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r.stdout.readFloatLE(i * 4);
  return { x, errors: String(r.stderr).split('\n').filter(Boolean), path: p };
}
/** The longest run of samples under -60 dBFS within `ms` of sample `s`, in ms, and the biggest step between samples there against the rest. */
function seam(x, s, ms = 500) {
  const w = Math.round(ms * 44.1), lo = Math.max(1, s - w), hi = Math.min(x.length, s + w);
  let run = 0, best = 0, step = 0;
  for (let i = lo; i < hi; i++) { if (Math.abs(x[i]) < 1e-3) { run++; if (run > best) best = run; } else run = 0; step = Math.max(step, Math.abs(x[i] - x[i - 1])); }
  const steps = []; for (let i = 1; i < x.length; i += 7) steps.push(Math.abs(x[i] - x[i - 1]));
  steps.sort((a, b) => a - b);
  return { silentMs: +(best / 44.1).toFixed(1), step: +step.toFixed(4), step999: +steps[Math.floor(steps.length * 0.999)].toFixed(4) };
}
/** The listener's sound just before and just after sample `sp`, each found in `ref` (the old container's own recording,
 * which goes on past the splice): `jumpMs` > 0 is that much of the station skipped, < 0 heard twice. */
function jumpAt(x, sp, ref, n = 44100, pad = 2205) {
  const find = (w) => {
    let ew = 0; for (let i = 0; i < w.length; i += 4) ew += w[i] ** 2;
    let best = { o: -1, r: -2 };
    for (let o = 0; o + w.length <= ref.length; o += 8) { let a = 0, e = 0; for (let i = 0; i < w.length; i += 4) { a += w[i] * ref[o + i]; e += ref[o + i] ** 2; } const r = a / Math.sqrt(ew * e || 1); if (r > best.r) best = { o, r }; }
    let ew2 = 0; for (let i = 0; i < w.length; i++) ew2 += w[i] ** 2;
    let fine = { o: best.o, r: -2 };
    for (let o = Math.max(0, best.o - 16); o <= best.o + 16 && o + w.length <= ref.length; o++) { let a = 0, e = 0; for (let i = 0; i < w.length; i++) { a += w[i] * ref[o + i]; e += ref[o + i] ** 2; } const r = a / Math.sqrt(ew2 * e || 1); if (r > fine.r) fine = { o, r }; }
    return fine;
  };
  const before = find(x.subarray(sp - n - pad, sp - pad)), after = find(x.subarray(sp + pad, sp + pad + n));
  return { jumpMs: +(((after.o - before.o) - (n + 2 * pad)) / 44.1).toFixed(1), r: +Math.min(before.r, after.r).toFixed(3), atS: +(sp / 44100).toFixed(2) };
}
async function waitFor(f, ms, every = 250) { const t0 = Date.now(); for (;;) { const v = await f(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } }

// ── setup ──
spawnSync('docker', ['network', 'create', NET], { stdio: 'ignore' });
const Q = ['driving', 'evening', 'kalle'].map((n, i) => ({ id: `local-${n}`, title: n, url: `/files/${n}.mp3`, i }));
const results = {};
async function onAir(name) {
  const c = obj(name); c.name = name;
  await c.st.put('want', { queue: Q, target: name, startedAt: Date.now(), until: Date.now() + 3600e3, seed: 16 });   // a naked first scene: the file dry, so the recordings line up by their envelopes
  await c.bring('asked to play');
  // a scene running, a sweep stored, and enough dwell left for a handover
  const s = await waitFor(async () => { const s = await c.cstatus(); return s?.handoff && s.handoff.cycleT > 6 && s.handoff.safeS > 40 ? s : null; }, 90_000, 500);
  if (!s) throw new Error(`${name}: no scene with room for a handover in 90 s`);
  await c.alarm();
  return c;
}
const other = (k) => (k === 'b' ? 'a' : 'b');

try {
  // ── 1. preview: three handovers, the listener through the Caster, each old container recorded straight off its
  //       Icecast and kept playing 6 s past the splice, so what the listener heard is found in what the old one played ──
  {
    const c = await onAir('preview');
    const L = record(await c.fetch(new Request('https://cast/listen/preview')), 'listener');
    const runs = [];
    for (const [i, how] of [[1, { waitS: 0 }], [2, { waitS: 15, leadS: 0.5 }], [3, { waitS: 30 }]].entries()) {
      await sleep(how.waitS * 1000);
      const s0 = await waitFor(async () => { const s = await c.cstatus(); return s?.handoff?.safeS > 40 ? s : null; }, 120_000, 500);
      const fromK = await c.key(), old = obj(fromK === 'b' ? 'preview~b' : 'preview');
      const R = record(await fetch(`http://127.0.0.1:${old.c.ports[8000]}/preview`), `old-${i}`);
      await sleep(4000);
      old.c.holdStopMs = 6000;
      // the twin's seek lead, for the run that makes it drop sound rather than wait
      const twin = obj(fromK === 'b' ? 'preview' : 'preview~b');
      twin.c.leadS = how.leadS ?? null;
      env.CF_VERSION_METADATA.id = `v${i + 2}`;
      const ear = [...c.ears][0], n0 = ear.stats.splices.length;
      await c.alarm();
      old.c.holdStopMs = 0;
      await R.done;
      const h = (await c.status()).handovers.at(-1), sp = ear.stats.splices[n0], tw = await c.cstatus();
      runs.push({ i, how, h, sp, align: tw?.mix?.align, R, scene: s0.handoff.si, twinScene: tw?.handoff?.si });
      ok(`handover ${i + 1} (${fromK} to ${other(fromK)}): done, one container left, the twin in the station's scene`, !h.failed && ours() === 1 && h.sameScene && tw?.handoff?.si === s0.handoff.si, JSON.stringify({ ...h, align: tw?.mix?.align }));
    }
    await sleep(3000);
    const lEnded = L.ended;
    L.stop(); await L.done;
    ok('preview: the listener\'s stream never ended across three handovers', !lEnded);
    const lf = framesOf(L), dl = decode(lf, 'listener');
    ok('preview: the frames the listener got decode to as much sound as they say (no frame lost)', Math.abs(dl.x.length / 44100 - lf.length * 1152 / 44100) < 0.2, `${(dl.x.length / 44100).toFixed(1)} s`);
    results.preview = [];
    for (const r of runs) {
      let byte = 0, fi = -1; for (let k = 0; k < lf.length; k++) { if (byte >= r.sp.byte) { fi = k; break; } byte += lf[k].data.length; }
      const ro = decode(framesOf(r.R), `old-${r.i}`), j = jumpAt(dl.x, fi * 1152, ro.x), sm = seam(dl.x, fi * 1152);
      results.preview.push({ handover: r.h, splice: r.sp, twinAlign: r.align, lead: r.how.leadS ?? 'default', jump: j, seam: sm });
      console.log(JSON.stringify(results.preview.at(-1)));
      ok(`handover ${r.i + 1}: the listener skips or repeats under 150 ms of the station\'s sound`, j.r > 0.9 && Math.abs(j.jumpMs) < 150, JSON.stringify(j));
      ok(`handover ${r.i + 1}: no silence over 30 ms at the splice`, sm.silentMs < 30, JSON.stringify(sm));
    }

    // ── 2. NEGATIVE CONTROL: today's refresh, destroy and boot again, with a listener that reconnects at once ──
    await c.alarm();
    const L2 = record(await c.fetch(new Request('https://cast/listen/preview')), 'before refresh');
    await sleep(3000);
    env.CF_VERSION_METADATA.id = 'v10';
    const pr = c.refresh();
    await L2.done;
    const lastOld = L2.chunks.at(-1)?.t;
    const L3res = await waitFor(async () => { const r = await c.fetch(new Request('https://cast/listen/preview')); if (r.status === 200) return r; await r.body?.cancel(); return null; }, 60_000, 100);
    const L3 = record(L3res, 'after refresh');
    await pr; await sleep(6000); L3.stop(); await L3.done;
    const f3 = framesOf(L3), firstLive = f3.find((f) => f.live);
    // no byte at all between the old stream's last chunk and the new connection's first: what the listener's own buffer must cover
    const gapMs = L3.chunks[0] && lastOld ? L3.chunks[0].t - lastOld : null;
    results.refresh = { streamEnded: L2.ended, noBytesMs: gapMs, firstLiveAfterMs: firstLive && lastOld ? Math.round(firstLive.at - lastOld) : null, sceneAfter: (await c.cstatus())?.handoff?.si };
    console.log(JSON.stringify(results.refresh));
    ok('NEGATIVE CONTROL: the refresh ends the listener\'s stream and a reconnecting listener waits seconds for sound', L2.ended && gapMs > 1000, `${Math.round(gapMs)} ms`);
    await c.stop('measured');
    ok('preview: stop leaves none of our containers', ours() === 0, String(ours()));
  }

  // ── 3. Väin's shape: their Icecast is a stand-in; one source per mount, the held twin takes it after the old lets go ──
  {
    const ice = dockerContainer('ice', 'cast-ho-ice');
    ice.start({ env: { ICECAST_PW: 'vpw' } });
    await ice.ready;
    await waitFor(async () => { try { return (await (await fetch(`http://127.0.0.1:${ice.ports[8080]}/status`)).json()).icecast?.answering; } catch { return false; } }, 20_000);
    const c = await onAir('radio1965');
    const V = record(await fetch(`http://127.0.0.1:${ice.ports[8000]}/preview`), 'their listener');
    await sleep(5000);
    env.CF_VERSION_METADATA.id = 'v20';
    // a listener of theirs whose connection ends reconnects at once, as a player that retries would
    let V2 = null;
    const again = V.done.then(async () => { const r = await waitFor(async () => { try { const r = await fetch(`http://127.0.0.1:${ice.ports[8000]}/preview`); if (r.status === 200) return r; await r.body?.cancel(); } catch { /* not yet */ } return null; }, 20_000, 20); if (r) V2 = record(r, 'their listener, again'); });
    await c.alarm();
    const h = (await c.status()).handovers.at(-1);
    await sleep(6000);
    await again;
    const ended = V.ended;
    const reconnect = V2 ? { noBytesMs: V2.chunks[0] ? V2.chunks[0].t - V.chunks.at(-1).t : null, firstBurstBytes: V2.chunks.slice(0, 3).reduce((a, c) => a + c.b.length, 0) } : null;
    V2?.stop(); await V2?.done;
    V.stop(); await V.done;
    const vf = framesOf(V);
    // the longest wait between chunks on the listener's connection, past its burst
    let worst = 0, at = null; for (let i = 1; i < V.chunks.length; i++) { const d = V.chunks[i].t - V.chunks[i - 1].t; if (d > worst && V.chunks[i - 1].t - V.t0 > 1000) { worst = d; at = V.chunks[i - 1].t; } }
    const dv = decode(vf, 'their-listener');
    results.vain = { handover: h, reconnect, listenerEnded: ended, endedAfterMs: ended ? V.endAt - V.t0 : null, worstChunkGapMs: worst, chunks: V.chunks.length, decodeErrors: dv.errors.length, file: dv.path };
    console.log(JSON.stringify(results.vain));
    ok('stand-in: the twin took the mount after the old let go, never two sources at once', !h.failed && h.goMs != null, JSON.stringify(h));
    await c.stop('measured');
    await ice.destroy();
    ok('stand-in: none of our containers left', ours() === 0, String(ours()));
  }
} catch (e) { fail++; console.log(`FAIL ${e.stack}`); }
finally {
  for (const o of objs.values()) await o.c.destroy?.().catch(() => {});
  cleanup();
  fs.writeFileSync(`${OUT}/handover-results.json`, JSON.stringify(results, null, 1));
  console.log(`\nhandover-docker: ${pass}/${pass + fail}, containers of ours left: ${ours()}`);
  process.exit(fail ? 1 : 0);
}
