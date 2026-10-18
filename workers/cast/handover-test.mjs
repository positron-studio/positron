// node workers/cast/handover-test.mjs: the Caster's handover to a twin on a deploy, against fake containers that
// speak server.mjs's routes and an Icecast's burst, with the listener's stream read frame by frame. No network.
// The asserts marked NEGATIVE CONTROL can fail. why: lessons/workers-cast.md#handover
import { Caster, continueFrom } from './worker.mjs';
import { createEar, BURST_BYTES } from './splice.mjs';
import { createFramer } from './mp3.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── an mp3 frame carrying the station's content time in ms, so a listener's stream says what it played ──
const FRAME_S = 1152 / 44100, FRAME_B = 417;
function frame(ms) { const b = new Uint8Array(FRAME_B); b.set([0xff, 0xfb, 0x90, 0x00]); new DataView(b.buffer).setUint32(4, Math.max(0, Math.round(ms))); return b; }
const stampOf = (f) => new DataView(f.buffer, f.byteOffset).getUint32(4);

/** A fake Icecast mount: `content()` says what the source plays now; a listener gets BURST_BYTES of the past, then live. */
function icecastStream(content, { period = 186 } = {}) {
  let timer = null, sent = 0;
  return new ReadableStream({
    start(c) {
      const burst = Math.ceil((BURST_BYTES + 4096) / FRAME_B), now = content();
      for (let i = burst; i > 0; i--) c.enqueue(frame(now - i * FRAME_S * 1000));
      sent = now;
      timer = setInterval(() => {
        const to = content();
        if (to == null) { clearInterval(timer); try { c.close(); } catch { /* gone */ } return; }
        const chunk = [];
        while (sent + FRAME_S * 1000 <= to) { sent += FRAME_S * 1000; chunk.push(...frame(sent)); }
        if (chunk.length) c.enqueue(Uint8Array.from(chunk));
      }, period);
    },
    cancel() { clearInterval(timer); },
  });
}

// ── the world: one shared mount for Väin's target, the containers, the Casters ──
const world = { mount: null, log: [], posts: [], errMs: 0, safeS: 60, handoff: true, si: 7 };
function fakeServer(ct) {
  const sv = { playing: null, onAir: false, held: false, aligned: false, content: null, stopped: false };
  sv.handle = async (port, url, init = {}) => {
    const path = new URL(url).pathname, body = init.body ? JSON.parse(await new Response(init.body).text()) : null;
    if (!ct.running) throw new Error('not running');
    if (port === 8000) {
      if (path !== '/preview' || !sv.onAir || !sv.local) return new Response('no source', { status: 404 });
      return new Response(icecastStream(() => (sv.stopped || !ct.running ? null : sv.content())), { headers: { 'content-type': 'audio/mpeg' } });
    }
    if (path === '/status') {
      const h = sv.playing && world.handoff ? { id: sv.playing.queue[0].id, title: sv.playing.queue[0].title, pos: sv.content() / 1000, cycleT: 12, wall: Date.now(),
        si: sv.si, inst: 'x-7', hist: Array.from({ length: sv.si + 1 }, () => ({ kind: 'speech', key: { root: 2, heard: true } })), def: { patch: 'p', si: sv.si }, phase: 'dwell', safeS: world.safeS, seed: 5 } : null;
      return Response.json({ playing: !!sv.playing && !sv.stopped, onAir: sv.onAir, bootedAt: ct.bootedAt, seconds: 1, handoff: h,
        mix: sv.playing ? { slots: [], aligned: sv.aligned, held: sv.held, align: { errMs: world.errMs }, goMs: sv.goMs ?? null } : null });
    }
    world.posts.push({ ct: ct.name, path, body });
    if (path === '/play') {
      sv.playing = body; sv.stopped = false; sv.local = !!body.target.local; sv.si = body.resume?.si ?? world.si;
      const r = body.resume, t0 = Date.now();
      // the station's content clock: a twin's continues the old one's at the wall, give or take errMs
      sv.content = r?.wall ? () => r.pos * 1000 + (Date.now() - r.wall) + world.errMs : () => (r?.pos || 0) * 1000 + (Date.now() - t0);
      setTimeout(() => { sv.aligned = true; if (body.hold) sv.held = true; else connect(); }, 300);
      return Response.json({ ok: true });
    }
    if (path === '/go') { sv.held = false; sv.goAt = Date.now(); connect(); return Response.json({ ok: true }); }
    if (path === '/stop') { sv.stopped = true; sv.onAir = false; if (world.mount === ct) world.mount = null; return Response.json({ ok: true }); }
    if (path === '/step' || path === '/next' || path === '/queue') return Response.json({ ok: true });
    return Response.json({ error: 'no route' }, { status: 404 });
  };
  // one source on a mount of theirs: a second is refused until the first lets go, retried every 100 ms
  async function connect() {
    if (sv.local) { sv.onAir = true; return; }
    for (let i = 0; i < 100 && !sv.stopped; i++) {
      if (!world.mount || world.mount === ct) { world.mount = ct; sv.onAir = true; if (sv.goAt) sv.goMs = Date.now() - sv.goAt; world.log.push(`${ct.name} took the mount`); return; }
      world.log.push(`${ct.name} refused: mount in use`);
      await sleep(100);
    }
  }
  return sv;
}
function fakeContainer(name) {
  let exit = null;
  const ct = { name, running: false, images: { cast: 'img' }, starts: 0, sv: null, bootedAt: 0,
    start(o) { ct.running = true; ct.starts++; ct.bootedAt = Date.now(); ct.env = o.env; ct.sv = fakeServer(ct); ct.exited = new Promise((r) => { exit = r; }); world.log.push(`${name} started`); },
    async destroy() { if (!ct.running) return; ct.running = false; ct.sv.stopped = true; if (world.mount === ct) world.mount = null; world.log.push(`${name} destroyed`); exit?.(); },
    monitor() { return ct.exited; },
    async setInactivityTimeout() {},
    getTcpPort(port) { return { fetch: (url, init) => ct.sv.handle(port, url, init) }; } };
  return ct;
}
function fakeStorage() {
  const m = new Map();
  return { m, async get(k) { return Array.isArray(k) ? new Map(k.map((x) => [x, m.get(x)])) : structuredClone(m.get(k)); },
    async put(k, v) { m.set(k, structuredClone(v)); }, async delete(k) { for (const x of [].concat(k)) m.delete(x); },
    async setAlarm(t) { m.set('__alarm', t); }, async deleteAlarm() { m.delete('__alarm'); } };
}
const objs = new Map();
const env = { TEST_PW: 'pw', VAIN_SOURCE_PW: 'vpw', CF_VERSION_METADATA: { id: 'v1' },
  VOTES: { idFromName: (n) => n, get: () => ({ fetch: async () => Response.json({ votes: [{ def: { patch: 'p' }, vote: 3, at: 1 }, { def: { patch: 'q' }, vote: 4, at: Date.now() + 1e9 }] }) }) },
  CASTER: { idFromName: (n) => n, get: (id) => ({ fetch: (u, init) => obj(id).fetch(new Request(u, init)) }) } };
function obj(name) {
  if (!objs.has(name)) objs.set(name, new Caster({ container: fakeContainer(name), storage: fakeStorage() }, env));
  return objs.get(name);
}
const Q = [{ id: 1, title: 'one', url: 'u1' }, { id: 2, title: 'two', url: 'u2' }, { id: 3, title: 'three', url: 'u3' }];
async function onAir(name) {
  const c = obj(name);
  c.name = name;
  await c.st.put('want', { queue: Q, target: name, startedAt: Date.now(), until: Date.now() + 3600e3, seed: 5 });
  await c.bring('asked to play');
  return c;
}
/** Reads a response's frames: each stamp and when it arrived, until `ms` or the stream ends. */
function listen(res) {
  const got = { stamps: [], ended: false, skipped: 0 }, fr = createFramer(), rd = res.body.getReader();
  (async () => { for (;;) { const { value, done } = await rd.read(); if (done) { got.ended = true; return; } for (const f of fr.push(value)) got.stamps.push(stampOf(f.data)); got.skipped = fr.skipped; } })();
  got.stop = () => rd.cancel().catch(() => {});
  return got;
}
/** The worst jump forward (a gap) and back (a repeat) in content between consecutive frames, past the first burst. */
function jumps(stamps, from = 0) {
  let gap = 0, rep = 0;
  for (let i = from + 1; i < stamps.length; i++) { const d = stamps[i] - stamps[i - 1] - FRAME_S * 1000; if (d > gap) gap = d; if (-d > rep) rep = -d; }
  return { gapMs: Math.round(gap), repeatMs: Math.round(rep) };
}
const running = () => [...objs.values()].filter((o) => o.c.running).map((o) => o.c.name);

// ── continueFrom ──
{
  const c = continueFrom(Q, { id: 2, title: 'two', pos: 30, cycleT: 12, wall: 9, si: 3, hist: [], inst: 'i', def: {}, phase: 'dwell', safeS: 40, seed: 1 });
  ok('continueFrom starts the queue at the file on air and keeps the rest in order', c.queue.map((x) => x.id).join() === '2,3,1');
  ok('continueFrom hands over the position, the scene and the wall, not the planner\'s own fields', c.resume.pos === 30 && c.resume.si === 3 && c.resume.wall === 9 && !('def' in c.resume) && !('safeS' in c.resume));
  const d = continueFrom(Q, { id: 99, si: 4, hist: [1], inst: 'j', pos: 50, wall: 1 });
  ok('a file no longer queued: the scene carries over, the position does not', d.queue === Q && d.resume.si === 4 && d.resume.pos === undefined && d.resume.wall === undefined);
}

// ── preview: a deploy hands the station to slot b and the listener stays on ──
{
  const c = await onAir('preview');
  ok('a play boots slot a and plays there', running().join() === 'preview' && (await c.status()).container.slot === 'a');
  const L = listen(await c.fetch(new Request('https://cast/listen/preview')));
  await sleep(1200);
  const before = L.stamps.length;
  world.errMs = 0; env.CF_VERSION_METADATA.id = 'v2';
  const t0 = Date.now();
  await c.alarm();
  const took = Date.now() - t0;
  await sleep(1500);
  const st = await c.status(), h = st.handovers.at(-1);
  ok('after a deploy the station is on slot b, the twin\'s container', st.container.slot === 'b' && st.container.running, JSON.stringify(st.container));
  ok('only one container runs afterwards', running().join() === 'preview~b', running().join());
  ok('the twin got the station\'s scene, its history, its file and the wall', (() => { const p = world.posts.findLast((x) => x.ct === 'preview~b' && x.path === '/play'); return p?.body.resume?.si === 7 && p.body.resume.hist.length === 8 && p.body.resume.wall > 0 && p.body.queue[0].id === 1 && p.body.life.seed === 5; })());
  ok('the twin\'s life takes only the votes the station had when its life began', (() => { const p = world.posts.findLast((x) => x.ct === 'preview~b' && x.path === '/play'); return p.body.life.votes.length === 1; })());
  ok('a preview twin is not held: its own Icecast, no mount to share', world.posts.findLast((x) => x.ct === 'preview~b' && x.path === '/play').body.hold === false);
  ok('the handover is recorded with its overlap and its listeners', h && !h.failed && h.listeners === 1 && h.spliced === 1 && h.overlapS > 0, JSON.stringify(h));
  ok('the stored boot is the twin\'s, on the new version', (await c.st.get('boot')).version === 'v2' && (await c.st.get('boot')).slot === 'b');
  const j = jumps(L.stamps, Math.ceil(BURST_BYTES / FRAME_B) + 2);
  ok('the listener\'s stream never ended and kept coming after the old container went', !L.ended && L.stamps.length > before + 40, `${L.stamps.length} frames, alarm ${took} ms`);
  ok('the listener hears no gap and no repeat over two frames (52 ms) across the splice', j.gapMs <= 53 && j.repeatMs <= 53, JSON.stringify(j));
  ok('every byte the listener got is whole frames', L.skipped === 0, `${L.skipped} bytes between frames`);

  // a second deploy hands it back to a: the remote slot is the one going away this time
  env.CF_VERSION_METADATA.id = 'v3';
  await c.alarm();
  await sleep(1200);
  const j2 = jumps(L.stamps, Math.ceil(BURST_BYTES / FRAME_B) + 2);
  ok('a second deploy hands it back to slot a, the twin stopped', (await c.status()).container.slot === 'a' && running().join() === 'preview', running().join());
  ok('the listener is still on, with no gap or repeat over two frames in either handover', !L.ended && j2.gapMs <= 53 && j2.repeatMs <= 53, JSON.stringify(j2));

  // NEGATIVE CONTROL: the same splice taking the new stream's burst as live repeats the burst
  const e2 = createEar(icecastStream(() => Date.now() % 1e9), { liveGapMs: 0, burstBytes: 0 });
  const L2 = listen(new Response(e2.readable));
  await sleep(500);
  const T = Date.now() % 1e9;
  await e2.splice(icecastStream(() => Date.now() % 1e9 - 0));
  await sleep(500); e2.readable.cancel?.().catch?.(() => {}); L2.stop();
  ok('NEGATIVE CONTROL: a splice that keeps the burst repeats seconds of sound', jumps(L2.stamps, Math.ceil(BURST_BYTES / FRAME_B) + 2).repeatMs > 2000, JSON.stringify(jumps(L2.stamps, Math.ceil(BURST_BYTES / FRAME_B) + 2)) + ` at ${T}`);

  // a twin that is off by 300 ms is heard as 300 ms: the stamps measure the alignment, they do not assume it
  world.errMs = 300; env.CF_VERSION_METADATA.id = 'v4';
  await c.alarm(); await sleep(1200);
  const j3 = jumps(L.stamps, L.stamps.length - 120);
  ok('NEGATIVE CONTROL: a twin 300 ms ahead is a 300 ms gap in what the listener hears', j3.gapMs >= 250, JSON.stringify(j3));
  world.errMs = 0;

  // waiting: too close to the blend, no twin is started and the alarm comes back in seconds
  world.safeS = 10; env.CF_VERSION_METADATA.id = 'v5';
  const n0 = running().length;
  await c.alarm();
  ok('with 10 s before the blend no twin starts, and the alarm looks again in 3 s', running().length === n0 && (await c.st.get('__alarm')) - Date.now() < 3500, `${running().join()}`);
  world.safeS = 60;
  await c.alarm(); await sleep(800);

  // NEGATIVE CONTROL: today's path, a station with no handoff, destroys and boots again: the listener's stream ends
  world.handoff = false; env.CF_VERSION_METADATA.id = 'v6';
  const L3 = listen(await c.fetch(new Request('https://cast/listen/preview')));
  await sleep(800);
  await c.alarm();
  await sleep(800);
  ok('NEGATIVE CONTROL: the destroy and restart refresh ends every listener\'s stream', L3.ended, `${L3.stamps.length} frames`);
  world.handoff = true;
  L.stop(); L3.stop();
  await c.stop('test over');
  ok('stop takes every container of the station down', running().length === 0, running().join());
}

// ── Väin's mount: one source at a time, so the old lets go and the held twin takes it ──
{
  world.log.length = 0;
  const c = await onAir('radio1965');
  await sleep(500);
  ok('the station holds their mount', world.mount?.name === 'radio1965');
  env.CF_VERSION_METADATA.id = 'v7';
  await c.alarm();
  const posts = world.posts.filter((x) => x.ct.startsWith('radio1965'));
  const play = posts.findLast((x) => x.ct === 'radio1965~b' && x.path === '/play'), iStop = posts.findIndex((x) => x.ct === 'radio1965' && x.path === '/stop'), iGo = posts.findIndex((x) => x.ct === 'radio1965~b' && x.path === '/go');
  ok('the twin was held: no second source while the old one is on', play?.body.hold === true && !world.log.some((l) => l.includes('refused')), world.log.join(' | '));
  ok('the old source let go before the twin was told to go', iStop >= 0 && iGo > iStop);
  const h = (await c.status()).handovers.at(-1);
  ok('the twin took their mount, and the gap is measured', world.mount?.name === 'radio1965~b' && h.goMs != null && h.goMs < 500, JSON.stringify(h));
  ok('one container on air afterwards', running().join() === 'radio1965~b', running().join());
  await c.alarm();   // a sweep on the new version: progress, with the handoff, from the twin

  // a death of the twin's container reaches the station and is dated
  obj('radio1965~b').c.destroy();
  await sleep(50);
  const d = (await c.st.get('deaths')) || [];
  ok('the twin\'s container dying is a death of the station', d.at(-1)?.why === 'the twin container exited', JSON.stringify(d.at(-1)));
  await c.alarm();
  ok('and the station comes back on the twin\'s slot, from the scene it was in', running().join() === 'radio1965~b' && world.posts.findLast((x) => x.ct === 'radio1965~b' && x.path === '/play').body.resume?.si === 7);
  await c.stop('test over');
  ok('stop takes the twin down', running().length === 0);
}

console.log(`\nhandover-test: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
