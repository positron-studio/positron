// v2in-cast: option B's channels. One Durable Object per channel (Channel, by name) plays its stack from the layers
// file as v2in-gate answers it, sending MP3 frames as they are from R2, never decoding:
//   silence    silent frames (silence.mjs) while the gate lists the layer as on, titled as the gate says
//   allclear   the gate's oneshot piece, once, from its start, when its seq goes up (joined mid-piece if the channel
//              starts within the piece), titled "<artist> - All clear: <title>"
//   live       a show sent by WHIP (whip.mjs): OBS posts to /whip/<channel> with its show key as the Bearer token,
//              v2in-gate decides as A's gate does, the SFU hands the sound back as PCM, LAME makes it this channel's
//              MP3; titled "<artist> - <title>" of the show. Under silence and ALL CLEAR it rolls on unheard. A
//              `record` channel keeps each session in R2 v2in-media/recordings/<channel>-<UTC start>.mp3, raids included.
//              `stream` is skipped (no process runs on B)
//   when:      a layer with `when:` (a signal, a Tallinn time range, switch:<name>) plays only while the gate lists it
//              as on; the top playlist that is on is the one read from R2
//   playlist   cast/<folder>/index.json in R2 v2in-media, on a wall clock: the position is (now + an offset per
//              channel) modulo the playlist's length, so a restart, a deploy or a second channel on the same folder
//              lands where the clock says. Under silence and ALL CLEAR the playlist rolls on unheard.
// Every file is MPEG-1 Layer III 44.1 kHz 128 kbit/s stereo (b/tools/media.mjs makes the copies), so frames from any
// file and silent frames join without a decoder.
//   GET /<channel>.mp3        the stream; `Icy-MetaData: 1` adds StreamTitle every 16000 bytes, counted per listener
//   GET /<channel>/status     listeners, the layer on air, the title, frames sent, gaps, R2 reads, the gate's age;
//                             with nobody listening, the title the wall clock puts on air (one gate and one R2 read)
//   GET /stream/<channel>     the same stream, for the player at b.v2in.positron.studio (a route on that host)
//   GET /stream/status-json.xsl   Icecast's shape ({ icestats: { source: [{ listenurl, title, listeners }] } }) from
//                             every channel's status, which the player polls for titles; cached 4 s on the host
//   GET /                     a test page with the three channels
//   POST /whip/<channel>      WHIP: an SDP offer, Authorization: Bearer <show key> -> 201 with the answer and a Location
//   DELETE /whip/<channel>/<session>   the sender stops (OBS does this on Stop streaming)
//   GET /stream/<channel>/live?t=      the SFU's egress WebSocket into the channel's object (whip.mjs)
// The object runs while a show is live even with nobody listening, and asks the gate every alarm (beat) whether the
// show may stay on: a kick on the admin page takes it off within about a second.
// The object runs only while someone listens: a 100 ms setTimeout chain paces the frames 1 s ahead of the wall, and
// a 1 s alarm reads the gate and R2 (each alarm is its own invocation, so the subrequest and CPU limits start over).
// 20 s after the last listener leaves it stops, and Cloudflare evicts it.
// A deploy: a busy object keeps its old code for up to 300 s, then Cloudflare resets it. The old instance's open
// responses outlive the reset but its alarms stop, so its listeners would get silent frames for as long as they
// stayed (measured 2026-11-03: 270 s of digital silence, connection open). The watchdog in pace() notices the alarm
// has gone quiet for ALARM_LOST_MS, tries to set it again, and when storage refuses (the reset instance) ends every
// listener's response, so players and apps reconnect to the new code. Tested 2026-11-04 (a 336 s listen across a
// deploy): the stream ended about 300 s after the deploy with no silence in it, since the playlist queue runs 20 s ahead.
import { DurableObject } from 'cloudflare:workers';
import { createFramer } from './mp3.mjs';
import { silentFrame } from './silence.mjs';
import { LiveInput, publishOffer, MAX_SDP } from './whip.mjs';
import PAGE from './page.html';

const TICK_MS = 100, ALARM_MS = 1000, LEAD_S = 1, BURST_S = 2, AHEAD_S = 20, CHUNK = 512 * 1024;
const ALARM_LOST_MS = 10_000, METAINT = 16000, MAX_BEHIND = 600, LINGER_MS = 20_000, INDEX_MS = 10 * 60_000;
const FRAME_S = 1152 / 44100;
/** Playlist folders read from another folder in R2 while this slice has no files of their own. */
const ALIAS = { live: 'radio1965' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'icy-metadata, range', 'access-control-expose-headers': 'icy-metaint, icy-name, x-v2in-title' };
const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const SILENT = silentFrame();

export class Channel extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.subs = new Set();
    this.timer = null; this.linger = null; this.running = false;
    this.gs = null; this.gsAt = 0; this.cfg = null; this.rev = '';
    this.indexes = new Map();      // folder -> { at, index }
    this.queue = [];               // playlist frames ahead: { data, a (air second it is due), title }
    this.load = null;              // where the next playlist read starts: { folder, i, byte, a }
    this.loading = null;
    this.shots = new Map();        // oneshot key -> { seq, frames, i, title } (frames null while it loads)
    this.airS = 0;                 // the air time of the next frame to go out, in epoch seconds
    this.recent = [];              // the last BURST_S of bytes, for a new listener
    this.title = ''; this.layer = '';
    this.live = null;              // the show on air by WHIP (whip.mjs LiveInput), or null
    this.lastLive = null;          // the last one's status, for /status
    this.st = { startedAt: 0, frames: 0, silentFrames: 0, gapFrames: 0, skips: 0, served: 0, peak: 0, dropped: 0, r2Reads: 0, alarms: 0, gateReads: 0, gateFails: 0, lines: [] };
  }

  say(l) { const line = `${new Date().toISOString().slice(11, 23)} ${l}`; this.st.lines.push(line); if (this.st.lines.length > 30) this.st.lines.shift(); console.log(`${this.id}: ${l}`); }

  async fetch(req) {
    const url = new URL(req.url);
    this.id ||= url.searchParams.get('ch');
    // tools/deploy-cast.mjs lets a busy object keep its old code for a day; an idle one that something keeps in
    // memory (the player's title polls) would keep it as long. The worker says which version it runs (`v`): an object
    // on another with nobody listening and no show resets itself, and the worker asks again, now of the new code.
    const v = url.searchParams.get('v'), mine = this.env.CF_VERSION_METADATA?.id;
    if (v && mine && v !== mine && !this.running && !this.live) { console.log(`${this.id}: idle on ${mine.slice(0, 8)}, ${v.slice(0, 8)} deployed: reset`); this.ctx.abort('adopt the deployed code'); }
    if (url.pathname.endsWith('/status')) return json(await this.status());
    if (/^\/stream\/[a-z0-9-]+\/live$/.test(url.pathname)) return this.live ? this.live.socket(req) : new Response('no live input', { status: 403 });
    if (url.pathname.startsWith('/whip/')) return this.whip(req, url);
    if (req.method === 'HEAD') return new Response(null, { headers: this.head(false) });   // headers only, never a start
    if (!this.running) await this.start();
    const icy = req.headers.get('icy-metadata') === '1';
    const sub = { ctrl: null, sent: 0, icy, said: null };
    const self = this;
    const body = new ReadableStream({
      start(ctrl) {
        sub.ctrl = ctrl; self.subs.add(sub); self.st.peak = Math.max(self.st.peak, self.subs.size);
        if (self.linger) { clearTimeout(self.linger); self.linger = null; }
        for (const b of self.recent) self.send(b, [sub]);
      },
      cancel() { self.drop(sub); },
    });
    return new Response(body, { headers: this.head(icy) });
  }

  head(icy) {
    const h = new Headers({ 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'icy-name': `v2in ${this.id}`,
      'icy-br': '128', 'x-v2in-title': encodeURIComponent(this.title), ...CORS });
    if (icy) h.set('icy-metaint', String(METAINT));
    return h;
  }

  // ── live input by WHIP ──────────────────────────────────────────────────────────────────────────────────────────
  async whip(req, url) {
    const sid = url.pathname.split('/')[3];
    if (req.method === 'DELETE') {
      if (!sid || this.live?.sessionId !== sid) return new Response(null, { status: 404 });
      await this.endLive('ended');
      return new Response(null, { status: 200 });
    }
    if (req.method !== 'POST' || sid) return new Response('POST an offer to /whip/<channel>, DELETE its Location', { status: 405 });
    const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const sdp = await req.text();
    if (sdp.length > MAX_SDP) return new Response('too big', { status: 413 });
    const addr = req.headers.get('cf-connecting-ip') || '';
    const d = await this.env.GATE_LIVE.publish({ channel: this.id, key, via: 'whip', addr });
    if (!d.ok) { this.say(`whip refused: ${d.reason}`); return new Response(`refused: ${d.reason}`, { status: d.reason === 'unknown key' ? 401 : 403 }); }
    const p = await publishOffer(this.env, sdp);
    if (p.error) {
      this.say(`whip: ${p.error}`);
      if (this.live?.showId !== d.show.id) await this.env.GATE_LIVE.done({ channel: this.id, id: d.show.id, why: 'failed' }).catch(() => {});
      return new Response(p.error, { status: p.status });
    }
    // a reconnect of the same show, or a scheduled show taking over: the old input goes, the gate already knows
    if (this.live) await this.endLive(d.reason === 'reconnect' ? 'reconnected' : 'taken over', { tell: false, cut: true });
    if (!this.running) await this.start();
    if (this.linger) { clearTimeout(this.linger); this.linger = null; }
    const live = new LiveInput({ env: this.env, channel: this.id, host: url.searchParams.get('host') || 'v2in-cast.kristjan-jansen.workers.dev',
      rec: { sessionId: p.sessionId, audio: p.audio, mids: p.mids, show: d.show },
      record: !!this.cfg?.channels.find((c) => c.id === this.id)?.record, say: (l) => this.say(l),
      onEnd: (why) => { if (this.live === live) this.endLive(why); } });
    this.live = live;
    this.say(`live: ${d.reason} #${d.show.id} ${live.title}`);
    live.start().catch((e) => { this.say(`live: start ${e.message}`); if (this.live === live) this.endLive('failed'); });
    return new Response(p.sdp, { status: 201, headers: { 'content-type': 'application/sdp', 'cache-control': 'no-store',
      location: `/whip/${this.id}/${p.sessionId}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'location' } });
  }

  /** The show leaves the air: the input closes, the gate hears it (unless it was the gate's doing), the linger starts. */
  async endLive(why, { tell = true, cut = false } = {}) {
    const live = this.live;
    if (!live) return;
    this.live = null;
    await live.end(why, { cut });
    this.lastLive = { ...live.status(), ended: why, endedAt: new Date().toISOString() };
    if (tell) await this.env.GATE_LIVE.done({ channel: this.id, id: live.showId, why }).catch((e) => this.say(`gate done: ${e.message}`));
    this.idle();
  }

  /** With nobody listening and no show live, the channel stops LINGER_MS later. */
  idle() {
    if (this.subs.size === 0 && this.running && !this.live && !this.linger) {
      this.linger = setTimeout(() => { this.linger = null; if (this.subs.size === 0 && !this.live) this.stop('no listeners'); }, LINGER_MS);
    }
  }

  // ── running ─────────────────────────────────────────────────────────────────────────────────────────────────────
  async start() {
    this.running = true;
    this.st.startedAt = Date.now(); this.alarmAt = Date.now();
    this.airS = Date.now() / 1000;
    this.say('start');
    await this.refresh(true);
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    const go = () => { try { this.pace(); } catch (e) { this.say(`pace: ${e}`); } this.timer = this.running ? setTimeout(go, TICK_MS) : null; };
    this.timer = setTimeout(go, 0);
  }

  /** The alarm has gone quiet: set it again, or, when this instance was reset by a code update, end every stream. */
  async rearm() {
    this.rearming = true;
    try { await this.ctx.storage.setAlarm(Date.now() + 100); this.alarmAt = Date.now(); this.say('alarm set again'); }
    catch (e) {
      this.say(`alarm lost (${e.message}), ending ${this.subs.size} streams so they reconnect`);
      for (const sub of [...this.subs]) { this.subs.delete(sub); try { sub.ctrl.close(); } catch { /* gone */ } }
      this.stop('reset');
    } finally { this.rearming = false; }
  }

  stop(why) {
    this.running = false;
    clearTimeout(this.timer); this.timer = null;
    this.queue = []; this.load = null; this.recent = [];
    this.ctx.storage.deleteAlarm().catch(() => {});   // refused in an instance reset by a code update
    this.say(`stop: ${why}`);
  }

  async alarm() {
    if (!this.running) return;
    this.st.alarms++; this.alarmAt = Date.now();
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    await this.refresh(false);
    // the gate may have taken the show off (a kick, a takeover, a lost beat): then the input goes, and its tracks
    const live = this.live;
    if (live) {
      const on = await this.env.GATE_LIVE.beat({ channel: this.id, id: live.showId }).catch(() => true);
      if (!on && this.live === live) { this.say('live: taken off by the gate'); await this.endLive('taken off', { tell: false, cut: true }); }
    }
  }

  /** The gate, the layers when they changed, ALL CLEAR pieces due, and the playlist kept AHEAD_S ahead. */
  async refresh(first) {
    try {
      const r = await this.env.GATE.fetch('https://v2in-gate/state');
      if (!r.ok) throw new Error(`gate ${r.status}`);
      this.gs = await r.json(); this.gsAt = Date.now(); this.st.gateReads++;
      if (this.gs.rev !== this.rev || !this.cfg) {
        this.cfg = await (await this.env.GATE.fetch('https://v2in-gate/layers.json')).json();
        this.rev = this.cfg.rev;
        this.say(`layers ${this.rev}`);
      }
    } catch (e) { this.st.gateFails++; if (first || this.st.gateFails % 10 === 1) this.say(`gate: ${e.message}`); }
    const stack = this.stack();
    for (const l of stack) if (l.kind === 'allclear') await this.oneshot(l, first);
    const pl = stack.find((l, i) => l.kind === 'playlist' && this.active(l, i));
    if (pl) await this.fill(ALIAS[pl.arg] || pl.arg);
  }

  stack() { return this.cfg?.channels.find((c) => c.id === this.id)?.layers || []; }

  /** A layer without `when:` is always eligible; one with it only while the gate lists it as on. */
  active(l, i) { return !l.when || !!this.gs?.on?.some((x) => x.channel === this.id && x.i === i); }

  async index(folder) {
    const c = this.indexes.get(folder);
    if (c && Date.now() - c.at < INDEX_MS) return c.index;
    const o = await this.env.MEDIA.get(`cast/${folder}/index.json`);
    this.st.r2Reads++;
    const index = o ? await o.json() : null;
    if (index && !(index.files || []).length) return null;
    this.indexes.set(folder, { at: Date.now(), index });
    return index;
  }

  /** Where the wall clock puts air second `a` in the folder: file i and seconds into it. */
  where(index, a) {
    let t = (a + (hash(this.id) % 3600)) % index.seconds;
    for (let i = 0; i < index.files.length; i++) {
      if (t < index.files[i].seconds) return { i, s: t };
      t -= index.files[i].seconds;
    }
    return { i: 0, s: 0 };
  }

  async fill(folder) {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const index = await this.index(folder);
      if (!index) return;
      // drop what is already late, and start again from the clock after a gap or a change of folder
      while (this.queue.length && this.queue[0].a < this.airS - FRAME_S / 2) this.queue.shift();
      const end = this.queue.length ? this.queue[this.queue.length - 1].a + FRAME_S : null;
      if (!this.load || this.load.folder !== folder || end == null || Math.abs(this.load.a - end) > 0.5) {
        this.queue = [];
        const a = this.airS, { i, s } = this.where(index, a), f = index.files[i];
        const byte = f.start + Math.floor(Math.floor(s / FRAME_S) * (f.bytes - f.start) / f.frames);
        this.load = { folder, i, byte, a };
      }
      for (let n = 0; n < 4 && this.load.a < this.airS + AHEAD_S; n++) await this.read(index);
    })().catch((e) => this.say(`fill: ${e.message}`)).finally(() => { this.loading = null; });
    return this.loading;
  }

  /** One range read of the current file onto the queue. */
  async read(index) {
    const L = this.load, f = index.files[L.i % index.files.length];
    if (L.byte >= f.bytes) { this.next(index); return; }
    const o = await this.env.MEDIA.get(f.key, { range: { offset: L.byte, length: Math.min(CHUNK, f.bytes - L.byte) } });
    this.st.r2Reads++;
    if (!o) { this.say(`missing ${f.key}`); this.next(index); return; }
    const b = new Uint8Array(await o.arrayBuffer());
    const last = L.byte + b.length >= f.bytes;
    const fr = createFramer();
    const frames = fr.push(b, last);
    const title = f.artist ? `${f.artist} - ${f.title}` : f.title;
    let used = fr.skipped;
    for (const x of frames) { this.queue.push({ data: x.data, a: L.a, title }); L.a += FRAME_S; used += x.data.length; }
    if (last) this.next(index); else L.byte += used;
  }

  next(index) {
    const L = this.load;
    L.i = (L.i + 1) % index.files.length;
    L.byte = index.files[L.i].start;
  }

  /** An ALL CLEAR piece when the gate's seq for this layer goes up; at the first read, only one still playing. */
  async oneshot(l, first) {
    const key = `${l.after}|${l.arg}`, o = this.gs?.oneshots?.find((x) => x.key === key);
    if (!o) return;
    const cur = this.shots.get(key);
    if (cur && o.seq <= cur.seq) return;
    const late = (Date.now() - (o.at || 0)) / 1000;
    if ((first || !cur) && !(o.file && late < (o.seconds || 15))) { this.shots.set(key, { seq: o.seq, frames: [], i: 0 }); return; }
    const shot = { seq: o.seq, frames: null, i: 0, title: `${o.artist ? `${o.artist} - ` : ''}All clear: ${o.title || ''}` };
    this.shots.set(key, shot);
    if (!o.file) { shot.frames = []; return; }
    const obj = await this.env.MEDIA.get(o.file);
    this.st.r2Reads++;
    shot.frames = obj ? createFramer().push(new Uint8Array(await obj.arrayBuffer()), true) : [];
    if (first || !cur) shot.i = Math.min(shot.frames.length, Math.floor(late / FRAME_S));
    this.say(`all clear ${o.seq}: ${o.file} from ${(shot.i * FRAME_S).toFixed(1)} s`);
  }

  /** The frame for air second `a`, from the top layer that has sound, and that layer's title. */
  frameAt(a) {
    const stack = this.stack(), on = this.gs?.on || [];
    while (this.queue.length && this.queue[0].a < a - FRAME_S / 2) this.queue.shift();
    const pl = this.queue.length && this.queue[0].a <= a + FRAME_S / 2 ? this.queue.shift() : null;   // rolls on, heard or not
    const lv = this.live ? this.live.take() : null;                                                  // so does a live show
    for (let i = 0; i < stack.length; i++) {
      const l = stack[i];
      if (!this.active(l, i)) continue;
      if (l.kind === 'silence') {
        const o = on.find((x) => x.channel === this.id && x.i === i);
        if (o) return { data: SILENT.data, layer: 'silence', title: o.title || 'Silence', silent: true };
      } else if (l.kind === 'allclear') {
        const s = this.shots.get(`${l.after}|${l.arg}`);
        if (s && s.frames === null) return { data: SILENT.data, layer: 'allclear', title: s.title, silent: true };
        if (s && s.i < s.frames.length) return { data: s.frames[s.i++].data, layer: 'allclear', title: s.title };
      } else if (l.kind === 'live') {
        if (this.live?.on) return lv ? { data: lv, layer: 'live', title: this.live.title } : { data: SILENT.data, layer: 'live', title: this.live.title, silent: true };
      } else if (l.kind === 'playlist') {
        if (pl) return { data: pl.data, layer: 'playlist', title: pl.title };
        this.st.gapFrames++;
        return { data: SILENT.data, layer: 'playlist (waiting for R2)', title: this.title, silent: true };
      }
    }
    return { data: SILENT.data, layer: 'none', title: '', silent: true };
  }

  /** Every 100 ms: the frames due, LEAD_S ahead of the wall, to every listener at once. */
  pace() {
    if (Date.now() - this.alarmAt > ALARM_LOST_MS && !this.rearming) this.rearm();
    const wall = Date.now() / 1000;
    if (this.airS < wall - 2) { this.st.skips++; this.say(`behind by ${(wall - this.airS).toFixed(1)} s, skipped ahead`); this.airS = wall; }
    const out = [];
    while (this.airS < wall + LEAD_S) {
      const f = this.frameAt(this.airS);
      if (f.layer !== this.layer) { this.say(`layer ${f.layer}`); this.layer = f.layer; }
      if (f.title !== this.title) this.title = f.title;
      out.push(f.data);
      this.st.frames++; if (f.silent) this.st.silentFrames++;
      this.airS += FRAME_S;
    }
    if (!out.length) return;
    const n = out.reduce((s, d) => s + d.length, 0), b = new Uint8Array(n);
    let o = 0; for (const d of out) { b.set(d, o); o += d.length; }
    this.recent.push(b);
    let keep = 0; for (let i = this.recent.length - 1; i >= 0; i--) { keep += this.recent[i].length; if (keep > BURST_S * 16000) { this.recent.splice(0, i); break; } }
    this.send(b, [...this.subs]);
  }

  // ── listeners, after positron workers/shout/worker.mjs (Mount.send, block, drop) at c316c417 ───────────────────
  send(chunk, subs) {
    for (const sub of subs) {
      try {
        let rest = chunk;
        while (rest.byteLength) {
          if (sub.icy) {
            const room = METAINT - (sub.sent % METAINT), take = Math.min(room, rest.byteLength);
            sub.ctrl.enqueue(rest.slice(0, take));
            sub.sent += take; this.st.served += take; rest = rest.subarray(take);
            if (sub.sent % METAINT === 0) sub.ctrl.enqueue(this.block(sub));
          } else {
            sub.ctrl.enqueue(rest.slice());
            sub.sent += rest.byteLength; this.st.served += rest.byteLength; rest = rest.subarray(rest.byteLength);
          }
        }
        // radio has no rewind: a listener MAX_BEHIND chunks (about a minute) behind is dropped, not queued without end
        if (sub.ctrl.desiredSize !== null && sub.ctrl.desiredSize < -MAX_BEHIND) { this.st.dropped++; this.drop(sub); }
      } catch { this.drop(sub); }
    }
  }

  /** One ICY metadata block: the title when it changed for this listener, a single zero byte when not. */
  block(sub) {
    if (sub.said === this.title) return new Uint8Array([0]);
    sub.said = this.title;
    const body = new TextEncoder().encode(`StreamTitle='${this.title.replace(/'/g, '')}';`);
    const n = Math.ceil(body.byteLength / 16), out = new Uint8Array(1 + n * 16);
    out[0] = n; out.set(body, 1);
    return out;
  }

  drop(sub) {
    if (!this.subs.delete(sub)) return;
    try { sub.ctrl.close(); } catch { /* already gone */ }
    this.idle();
  }

  /** With nobody listening: the title the top layer with sound would carry now, without starting the channel. */
  async peek() {
    await this.refreshGate();
    const stack = this.stack(), now = Date.now();
    for (let i = 0; i < stack.length; i++) {
      const l = stack[i];
      if (!this.active(l, i)) continue;
      if (l.kind === 'silence') return { layer: 'silence', title: this.gs.on.find((x) => x.channel === this.id && x.i === i)?.title || 'Silence' };
      if (l.kind === 'allclear') {
        const o = this.gs?.oneshots?.find((x) => x.key === `${l.after}|${l.arg}`);
        if (o?.file && (now - (o.at || 0)) / 1000 < (o.seconds || 15)) return { layer: 'allclear', title: `${o.artist ? `${o.artist} - ` : ''}All clear: ${o.title || ''}` };
      }
      if (l.kind === 'playlist') {
        const index = await this.index(ALIAS[l.arg] || l.arg);
        if (!index) return { layer: 'playlist (empty)', title: '' };
        const f = index.files[this.where(index, now / 1000).i];
        return { layer: 'playlist', title: f.artist ? `${f.artist} - ${f.title}` : f.title };
      }
    }
    return { layer: 'none', title: '' };
  }

  async refreshGate() {
    const r = await this.env.GATE.fetch('https://v2in-gate/state');
    this.gs = await r.json(); this.gsAt = Date.now();
    if (this.gs.rev !== this.rev || !this.cfg) { this.cfg = await (await this.env.GATE.fetch('https://v2in-gate/layers.json')).json(); this.rev = this.cfg.rev; }
  }

  async status() {
    const wall = Date.now() / 1000;
    const idle = this.running ? null : await this.peek().catch((e) => ({ layer: `peek: ${e.message}`, title: '' }));
    return { channel: this.id, version: this.env.CF_VERSION_METADATA?.id || null, running: this.running, listeners: this.subs.size,
      layer: idle ? idle.layer : this.layer, title: idle ? idle.title : this.title,
      aheadS: +(this.airS - wall).toFixed(2), queuedS: +(this.queue.length * FRAME_S).toFixed(1),
      gate: this.gs ? { state: this.gs.state, ageS: +((Date.now() - this.gsAt) / 1000).toFixed(1) } : null, rev: this.rev,
      upS: this.st.startedAt && this.running ? Math.round((Date.now() - this.st.startedAt) / 1000) : 0, ...this.st, lines: this.st.lines.slice(-15),
      live: this.live ? this.live.status() : null, lastLive: this.lastLive };
  }
}

/** A request to a channel's object, marked with this worker's version; asked once more when the object reset itself to
 *  adopt it. A body is read once, so a request with one (a WHIP offer) goes after a HEAD that does the same. */
async function channel(env, id, req) {
  const u = new URL(req.url), v = env.CF_VERSION_METADATA?.id;
  const stub = () => env.CHANNEL.get(env.CHANNEL.idFromName(id));
  if (req.body) {
    if (v) await channel(env, id, new Request(`https://v2in-cast/${id}.mp3?ch=${id}`, { method: 'HEAD' })).catch(() => {});
    return stub().fetch(new Request(u, req));
  }
  if (v) u.searchParams.set('v', v);
  try { return await stub().fetch(new Request(u, req)); }
  catch (e) { console.log(`${id}: asked again after ${e.message}`); u.searchParams.delete('v'); return stub().fetch(new Request(u, req)); }
}

/** The player's titles in Icecast's status shape, one status read per channel. */
async function icestats(req, env, ctx) {
  const url = new URL(req.url), cache = caches.default, key = new Request(`${url.origin}/stream/status-json.xsl`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const layers = await (await env.GATE.fetch('https://v2in-gate/layers.json')).json();
  const source = await Promise.all(layers.channels.map(async ({ id }) => {
    const st = await channel(env, id, new Request(`https://v2in-cast/${id}/status?ch=${id}`)).then((r) => r.json()).catch(() => ({}));
    return { listenurl: `${url.origin}/stream/${id}`, server_name: `v2in ${id}`, title: st.title || '', listeners: st.listeners || 0 };
  }));
  const res = new Response(JSON.stringify({ icestats: { source } }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=4', ...CORS } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'access-control-allow-methods': 'GET, HEAD, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'icy-metadata, range, authorization, content-type' } });
    if (url.pathname === '/') return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.pathname === '/stream/status-json.xsl') return icestats(req, env, ctx);
    const m = /^\/([a-z0-9][a-z0-9-]*)(\.mp3|\/status)$/.exec(url.pathname) || /^\/stream\/([a-z0-9][a-z0-9-]*)(\/live)?$/.exec(url.pathname)
      || /^\/whip\/([a-z0-9][a-z0-9-]*)(\/[A-Za-z0-9_-]{8,128})?$/.exec(url.pathname);
    if (!m) return json({ error: 'GET /<channel>.mp3, /<channel>/status, /stream/<channel>, /stream/status-json.xsl' }, 404);
    const layers = await (await env.GATE.fetch('https://v2in-gate/layers.json')).json().catch(() => null);
    if (!layers?.channels?.some((c) => c.id === m[1])) return json({ error: `no channel ${m[1]}` }, 404);
    const u = new URL(req.url); u.searchParams.set('ch', m[1]);
    if (url.pathname.startsWith('/whip/')) u.searchParams.set('host', url.host);   // where the SFU dials back
    return channel(env, m[1], new Request(u, req));
  },
};
