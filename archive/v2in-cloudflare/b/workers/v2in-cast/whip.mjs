// Live input for B: OBS (or any WHIP sender) posts its offer to /whip/<channel> with the show key as its Bearer token;
// the channel's object asks v2in-gate whether the key may go live (core/shows.mjs), publishes the offer into the
// Cloudflare Realtime SFU (positron's app), and has the SFU send the sound back as PCM over a WebSocket adapter
// (egress), which LAME encodes to the channel's own MP3 format, frame by frame, for the `live` layer.
//
// After positron at commit a742863e (2026-11-04): sfu() and the WHIP offer handling from workers/sfu/worker.mjs
// (whip(), here without rooms or HMAC keys: the gate checks the show key), the egress socket from
// workers/edgecast/adapter.mjs (socket(), onEgress()), the adapter calls from SfuAdmin in workers/sfu/worker.mjs.
// Why it is built this way: positron lessons/workers-edgecast-adapter.md and lessons/workers-sfu.md#whip.
//  - The SFU dials us: the egress adapter is a WebSocket the SFU opens to /stream/<channel>/live?t=<token>; the token
//    is random per session and lives only in the object's memory: a reset object (a code update past its delay)
//    loses the input, and the gate takes the show off as lost 30 s later; OBS must reconnect. Not solved yet.
//  - The adapter can be made only once the sender's track is flowing, so creation is retried for ADAPTER_TRY_MS.
//  - The SFU retries a lost egress socket for 15 s; past EGRESS_GONE_MS without one the show is over ('lost').
import { decodePacket } from './packet.mjs';
import { createMp3Encoder } from './lame.mjs';
import { createFramer } from './mp3.mjs';
import lameModule from './vendor/lame.wasm';

const SFU = 'https://rtc.live.cloudflare.com/v1/apps';
const UA = 'v2in-cast/1.0';   // Cloudflare's edge 1010-blocks a generic user agent on a server-to-server fetch
export const MAX_SDP = 64 * 1024;
const ADAPTER_TRY_MS = 30_000, EGRESS_GONE_MS = 20_000, QUIET_MS = 3000;
const FRAME_S = 1152 / 44100;
const PRE_FRAMES = Math.round(0.6 / FRAME_S);   // buffered before the live layer sounds, and again after a stall
const MAX_FRAMES = Math.round(3 / FRAME_S);     // beyond this the oldest go: a radio show has no rewind
const PART = 5 * 1024 * 1024;                   // R2 multipart: every part but the last the same size, at least 5 MiB

const token = () => { const b = crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

export async function sfu(env, method, path, body) {
  const r = await fetch(`${SFU}/${env.CF_REALTIME_APP_ID}/${path}`, {
    method,
    headers: { authorization: `Bearer ${env.CF_REALTIME_APP_SECRET}`, 'content-type': 'application/json', 'user-agent': UA },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

/**
 * A WHIP offer into the SFU: a new session, every audio and video section published as a track. Only the sound is
 * used; OBS always sends a picture too, which costs nothing coming in. Answers { sessionId, sdp, audio, mids } or
 * { status, error }.
 */
export async function publishOffer(env, sdp) {
  if (!env.CF_REALTIME_APP_SECRET || !env.CF_REALTIME_APP_ID) return { status: 503, error: 'no SFU secret on v2in-cast' };
  const media = [...sdp.matchAll(/^m=(audio|video) [^\r\n]*[\s\S]*?^a=mid:(\S+)/gm)].map((m) => ({ kind: m[1], mid: m[2] }));
  if (media.filter((m) => m.kind === 'audio').length !== 1 || media.length > 2) return { status: 400, error: 'send one sound, and at most one picture' };
  const made = await sfu(env, 'POST', 'sessions/new');
  if (made.status !== 201 || !made.json?.sessionId) return { status: 502, error: `sfu sessions/new ${made.status}` };
  const sessionId = made.json.sessionId, tag = token().slice(0, 8);
  const tracks = media.map((m) => ({ location: 'local', mid: m.mid, trackName: `${m.kind}-${tag}` }));
  const r = await sfu(env, 'POST', `sessions/${sessionId}/tracks/new`, { sessionDescription: { type: 'offer', sdp }, tracks });
  if (r.status !== 200 || !r.json?.sessionDescription?.sdp) return { status: 502, error: `sfu publish ${r.status} ${r.text.slice(0, 200)}` };
  const bad = r.json.tracks?.find((t) => t.errorCode);
  if (bad) return { status: 502, error: `sfu publish ${bad.errorCode}` };
  return { sessionId, sdp: r.json.sessionDescription.sdp, audio: `audio-${tag}`, mids: media.map((m) => m.mid) };
}

/** One live session's file in R2, written as it goes (multipart), finished when the show ends. */
class Recording {
  constructor(bucket, key, meta) { this.bucket = bucket; this.key = key; this.meta = meta; this.buf = []; this.n = 0; this.parts = []; this.bytes = 0; this.line = Promise.resolve(); this.up = null; this.error = null; }
  add(u8) {
    this.buf.push(u8); this.n += u8.length; this.bytes += u8.length;
    if (this.n >= PART) { const chunk = this.take(PART); this.line = this.line.then(() => this.part(chunk)).catch((e) => { this.error = e.message; }); }
  }
  take(len) {
    const all = new Uint8Array(this.n); let o = 0; for (const b of this.buf) { all.set(b, o); o += b.length; }
    const head = all.slice(0, len), rest = all.slice(len);
    this.buf = rest.length ? [rest] : []; this.n = rest.length;
    return head;
  }
  async part(chunk) {
    this.up ||= await this.bucket.createMultipartUpload(this.key, { httpMetadata: { contentType: 'audio/mpeg' }, customMetadata: this.meta });
    this.parts.push(await this.up.uploadPart(this.parts.length + 1, chunk));
  }
  /** The rest as the last part, then the file is whole. Answers its size, or null when nothing was kept. */
  finish() {
    const rest = this.n ? this.take(this.n) : null;
    this.line = this.line.then(async () => {
      if (!this.up && rest) { await this.bucket.put(this.key, rest, { httpMetadata: { contentType: 'audio/mpeg' }, customMetadata: this.meta }); return; }
      if (rest) await this.part(rest);
      if (this.up) await this.up.complete(this.parts);
    }).catch((e) => { this.error = e.message; });
    return this.line.then(() => (this.bytes ? this.bytes : null));
  }
}

/**
 * One show's input on one channel. `rec` is { sessionId, audio, mids, show, token?, since? };
 * `onEnd(why)` is called once when the input ends by itself (lost, or the adapter could not be made).
 */
export class LiveInput {
  constructor({ env, channel, host, rec, record, say, onEnd }) {
    this.env = env; this.channel = channel; this.say = say; this.onEnd = onEnd;
    this.rec = { ...rec, token: rec.token || token(), since: rec.since || Date.now() };
    this.endpoint = `wss://${host}/stream/${channel}/live?t=${this.rec.token}`;
    const s = this.rec.show;
    this.title = s.artist ? `${s.artist} - ${s.title}` : s.title;
    this.q = []; this.playing = false; this.ws = null; this.lastAt = 0; this.adapterId = null; this.ended = false; this.timers = {};
    this.enc = null; this.framer = createFramer(); this.encoding = null;
    this.st = { connects: 0, packets: 0, bad: 0, seqGaps: 0, frames: 0, dropped: 0, underruns: 0, adapterTries: 0, lastError: null, lastSeq: null };
    if (record) {
      const d = new Date(this.rec.since).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      this.file = new Recording(env.MEDIA, `recordings/${channel}-${d}.mp3`, { channel, show: String(s.id), title: s.title, artist: s.artist || '' });
    }
  }

  get sessionId() { return this.rec.sessionId; }
  get showId() { return this.rec.show.id; }
  /** The live layer has sound to give: the socket is up and sound came within QUIET_MS (a sender gone without a word
   *  leaves the SFU's socket open for about 30 s; the playlist comes back meanwhile, not silence). */
  get on() { return !this.ended && !!this.ws && this.st.frames > 0 && Date.now() - this.lastAt < QUIET_MS; }

  async start() {
    this.enc = await createMp3Encoder(lameModule, { sampleRate: 48000 });
    this.timers.cap = setTimeout(() => { if (!this.ws && !this.adapterId) this.finish('no sound came'); }, ADAPTER_TRY_MS + 5000);
    const t0 = Date.now();
    while (!this.ended && Date.now() - t0 < ADAPTER_TRY_MS) {
      this.st.adapterTries++;
      const r = await sfu(this.env, 'POST', 'adapters/websocket/new', { tracks: [{ location: 'remote', sessionId: this.rec.sessionId,
        trackName: this.rec.audio, endpoint: this.endpoint, outputCodec: 'pcm' }] }).catch((e) => ({ status: 0, text: e.message }));
      const t = r.json?.tracks?.[0];
      if (t?.adapterId && !t.errorCode) {
        if (this.ended) { await this.closeAdapter(t.adapterId); return; }
        this.adapterId = t.adapterId;
        this.say(`live: adapter up after ${this.st.adapterTries} tries, ${Date.now() - t0} ms`);
        return;
      }
      this.st.lastError = t?.errorCode ? `${t.errorCode} ${t.errorDescription || ''}` : `${r.status} ${(r.text || '').slice(0, 120)}`;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    if (!this.ended) { this.say(`live: no adapter (${this.st.lastError})`); this.finish('no sound came'); }
  }

  /** The SFU's egress socket. */
  socket(req) {
    const u = new URL(req.url);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket only', { status: 426 });
    if (this.ended || !same(u.searchParams.get('t'), this.rec.token)) return new Response('no such input', { status: 403 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    try { this.ws?.close(1000, 'replaced'); } catch { /* gone */ }
    this.ws = server; this.st.connects++;
    clearTimeout(this.timers.gone);
    let line = Promise.resolve();
    server.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') return;
      line = line.then(async () => this.packet(ev.data instanceof ArrayBuffer ? ev.data : await ev.data.arrayBuffer()))
        .catch((e) => { this.st.lastError = String(e.message || e); });
    });
    const gone = () => {
      if (this.ws !== server) return;
      this.ws = null; this.playing = false;
      this.timers.gone = setTimeout(() => { if (!this.ws) this.finish('lost'); }, EGRESS_GONE_MS);
    };
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }

  packet(data) {
    if (this.ended || !this.enc) return;
    const st = this.st;
    let pkt;
    try { pkt = decodePacket(new Uint8Array(data)); } catch (e) { st.bad++; st.lastError = e.message; return; }
    const pl = pkt.payload;
    if (pl.length % 4) { st.bad++; st.lastError = `payload ${pl.length} bytes is not whole stereo s16 frames`; return; }
    st.packets++; this.lastAt = Date.now();
    if (st.lastSeq !== null && pkt.sequenceNumber !== st.lastSeq + 1) st.seqGaps++;
    st.lastSeq = pkt.sequenceNumber;
    const pcm = new Int16Array(pl.slice().buffer), n = pcm.length >> 1;   // a copy: the payload view may sit at an odd offset
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { L[i] = pcm[2 * i] / 32768; R[i] = pcm[2 * i + 1] / 32768; }
    for (const f of this.framer.push(this.enc.encode(L, R))) {
      st.frames++;
      this.file?.add(f.data);
      this.q.push(f.data);
      if (this.q.length > MAX_FRAMES) { this.q.shift(); st.dropped++; }
    }
  }

  /** The next frame for the air, or null while it buffers. Called once per frame slot, heard or not. */
  take() {
    if (!this.playing) { if (this.q.length < PRE_FRAMES) return null; this.playing = true; }
    if (!this.q.length) { this.st.underruns++; this.playing = false; return null; }
    return this.q.shift();
  }

  async closeAdapter(id) {
    const r = await sfu(this.env, 'POST', 'adapters/websocket/close', { tracks: [{ adapterId: id }] }).catch((e) => ({ status: 0, text: e.message }));
    if (r.status >= 300 || !r.status) this.say(`live: adapter close ${r.status} ${(r.text || '').slice(0, 120)}`);
  }

  /**
   * Ends the input. `cut` also closes the sender's tracks on the SFU, so a kicked show's sound stops there too (OBS
   * may stay connected to nothing; its key no longer works for a reconnect). Answers the recording's size, if any.
   */
  async end(why, { cut = false } = {}) {
    if (this.ended) return null;
    this.ended = true; this.why = why;
    for (const t of Object.values(this.timers)) clearTimeout(t);
    this.q = [];
    try { this.ws?.close(1000, why); } catch { /* gone */ }
    this.ws = null;
    const id = this.adapterId; this.adapterId = null;
    if (id) await this.closeAdapter(id);
    if (cut) {
      const r = await sfu(this.env, 'PUT', `sessions/${this.rec.sessionId}/tracks/close`, { tracks: this.rec.mids.map((mid) => ({ mid })), force: true }).catch(() => null);
      if (r && r.status !== 200) this.say(`live: tracks close ${r.status}`);
    }
    try { const tail = this.enc?.flush(); if (tail?.length) for (const f of this.framer.push(tail, true)) this.file?.add(f.data); } catch { /* the encoder is gone */ }
    const size = this.file ? await this.file.finish() : null;
    this.say(`live: ended (${why}), ${(this.st.frames * FRAME_S).toFixed(1)} s of sound${this.file ? `, recording ${this.file.key} ${size ?? 0} B${this.file.error ? ` error ${this.file.error}` : ''}` : ''}`);
    return size;
  }

  /** An end the input came to by itself: the channel is told, then the gate. */
  finish(why) { if (!this.ended) this.onEnd(why); }

  status() {
    const s = this.rec.show;
    return { show: { id: s.id, title: s.title, artist: s.artist }, since: new Date(this.rec.since).toISOString(), on: this.on, socket: !!this.ws,
      adapter: !!this.adapterId, bufferedS: +(this.q.length * FRAME_S).toFixed(2), recording: this.file ? { key: this.file.key, bytes: this.file.bytes, parts: this.file.parts.length, error: this.file.error } : null,
      ...this.st };
  }
}
