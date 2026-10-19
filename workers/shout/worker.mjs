// positron-shout: relays allowlisted Icecast mounts with CORS, so a page can read and measure them.
// STATIONS is an allowlist, never a URL parameter: the account's egress is the project's.
// The body passes through unbuffered; reading it here would add latency to every byte.
// why: lessons/workers-shout.md#header

import { OPEN } from '../_lib/http.mjs';

const ERR = 'https://icecast.err.ee';

// id -> full upstream URL. `radio1965` is plain HTTP on port 8001 with no ACAO, so an https page
// cannot play it at all without this relay. Somebody else's stream on our egress, added on purpose.
// why: lessons/workers-shout.md#stations
const IDA = 'https://broadcast.idaidaida.net/listen';

const STATIONS = {
  // Last in the page's list: a page opens the first entry, and the front is where the load lands.
  // One upstream connection however many listen (`GET /tee/radio1965`). Plain HTTP, port 8001.
  // Estonian Centre of Contemporary Music's community station (uuu.ee).
  // why: lessons/workers-shout.md#radio1965
  radio1965: 'http://live.uuu.ee:8001/radio1965',
  // ERR's five public radio streams, 128 kbps MP3.
  vikerraadio: `${ERR}/vikerraadio.mp3`,
  raadio2: `${ERR}/raadio2.mp3`,
  klassikaraadio: `${ERR}/klassikaraadio.mp3`,
  raadio4: `${ERR}/raadio4.mp3`,
  raadiotallinn: `${ERR}/raadiotallinn.mp3`,
  // Ida's mounts, at the back of the list: 320 kbit/s, and a page opens the first entry it finds.
  // Held through the tee, so `GET /tee/ida-tallinn` must read upstreamConnections 1.
  // why: lessons/workers-shout.md#ida
  'ida-tallinn': `${IDA}/tallinn/stream`,
  'ida-helsinki': `${IDA}/helsinki/stream`,
  // Our own cast's preview, held here so a cast deploy (which restarts the cast's objects and swaps its container)
  // never ends a listener: when the cast's stream ends, the tee dials again and the listener stays connected.
  preview: 'https://cast.positron.studio/listen/preview',
};
/** Origins that are ours and come back after a deploy: the tee redials them for REDIAL_S rather than dropping listeners. */
const REDIAL = new Set(['https://cast.positron.studio/listen/preview']);
const REDIAL_S = 90;

// Everything a client needs to read about the stream, including the ICY fields
// that only exist on this protocol. Without expose-headers a browser sees the
// response but not one header of it.
const EXPOSE = [
  'icy-name', 'icy-description', 'icy-genre', 'icy-br', 'icy-url', 'icy-pub',
  'icy-metaint', 'content-type', 'x-shout-ttfb', 'x-shout-station',
  // Recordings need length and range headers for a scrub bar; live mounts never have them.
  // why: lessons/workers-shout.md#rec-headers
  'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag',
  'x-shout-recording',
].join(',');

// Health answers are collapsed per isolate: it absorbs a burst, it is not a global bound.
// /rec/ carries eccm.ee recordings (200, Range 206, no ACAO). A name pattern, never a URL
// parameter: a slug of at most 20 characters and a datestamp, no slashes, no traversal.
// why: lessons/workers-shout.md#rec
const REC_BASE = 'https://eccm.ee/radio/streams/';
const REC_NAME = /^[a-z0-9-]{1,20}-\d{8}-\d{6}\.mp3$/;
// A recording never changes once it is written, which is the opposite of the
// streams above. It is worth caching at the edge and worth a client keeping.
const REC_CACHE = 'public, max-age=86400, immutable';

const HEALTH_TTL_MS = 20000;
const healthCache = new Map();

const cors = (h = {}) => ({
  ...OPEN,
  'access-control-expose-headers': EXPOSE,
  'cache-control': 'no-store',
  ...h,
});

export default {
  // `env` carries the Durable Object binding; without it every listen is a 500.
  // why: lessons/workers-shout.md#env
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors({
        'access-control-allow-methods': 'GET,HEAD,OPTIONS',
        'access-control-allow-headers': 'icy-metadata,range',
      }) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405, headers: cors() });
    }

    if (url.pathname === '/' || url.pathname === '/stations') {
      // The upstream host per station, since there is no single origin.
      // why: lessons/workers-shout.md#hosts
      return Response.json({
        stations: Object.fromEntries(
          Object.entries(STATIONS).map(([k, v]) => [k, new URL(v).host])),
      }, { headers: cors() });
    }

    // Is each station up, answered 200 whatever the answer: a page fetching a dead mount gets a 502
    // the browser logs to the console. Cancel every body (streams are endless); answers are cached.
    // why: lessons/workers-shout.md#health
    if (url.pathname === '/health') {
      // This fans out to every mount, so it is cached for HEALTH_TTL_MS, takes `only`, and a
      // refusal
      // is never answered with another request. Polling it got ERR mounts answering us 502 in 9 ms.
      // why: lessons/workers-shout.md#fan-out
      const only = (url.searchParams.get('only') || '')
        .split(',').map((x) => x.trim()).filter(Boolean);
      const wanted = Object.entries(STATIONS).filter(([k]) => !only.length || only.includes(k));
      const now = Date.now();
      const fresh = {};
      const toProbe = [];
      for (const [k, upstream] of wanted) {
        const c = healthCache.get(k);
        if (c && now - c.at < HEALTH_TTL_MS) fresh[k] = c.value;
        else toProbe.push([k, upstream]);
      }
      const probed = await Promise.all(toProbe.map(async ([k, upstream]) => {
        const t = Date.now();
        try {
          const up = await fetch(upstream, {
            method: 'GET',
            headers: { 'user-agent': 'positron-shout/1 (+https://positron.studio)' },
            cf: { cacheEverything: false, cacheTtl: 0 },
          });
          const live = up.ok && !!up.body;
          try { await up.body?.cancel(); } catch { /* already gone */ }
          return [k, { up: live, status: up.status, ms: Date.now() - t }];
        } catch (e) {
          // A throw is the origin refusing or timing out: a station that is down, not an error
          // page.
          // why: lessons/workers-shout.md#down
          return [k, { up: false, status: 0, ms: Date.now() - t, why: String(e).slice(0, 80) }];
        }
      }));
      for (const [k, v] of probed) { healthCache.set(k, { at: Date.now(), value: v }); fresh[k] = v; }
      return Response.json(
        { stations: fresh, cached_for_ms: HEALTH_TTL_MS, probed_now: probed.length },
        { headers: cors({ 'cache-control': 'no-store' }) });
    }

    // ── a past broadcast, rather than the live one ──────────────────────
    if (url.pathname.startsWith('/rec/')) {
      const name = url.pathname.slice('/rec/'.length);
      if (!REC_NAME.test(name)) {
        return new Response('no such recording', { status: 404, headers: cors() });
      }
      // Forward Range: seeking in an hour of audio is a Range request, not a fresh download.
      // why: lessons/workers-shout.md#range
      const range = req.headers.get('range');
      const rt0 = Date.now();
      const up = await fetch(REC_BASE + name, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: {
          ...(range ? { range } : {}),
          'user-agent': 'positron-shout/1 (+https://positron.studio)',
        },
      });
      // Not `!up.ok`: a Range request answers 206.
      // why: lessons/workers-shout.md#206
      if (up.status >= 400) {
        return new Response(`origin ${up.status}`, { status: 502, headers: cors() });
      }
      const h = cors({
        'content-type': up.headers.get('content-type') || 'audio/mpeg',
        'cache-control': REC_CACHE,
        'x-shout-ttfb': String(Date.now() - rt0),
        'x-shout-recording': name,
      });
      for (const k of ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
        const v = up.headers.get(k);
        if (v) h[k] = v;
      }
      return new Response(req.method === 'HEAD' ? null : up.body, { status: up.status, headers: h });
    }

    // `GET /tee/<id>`: listeners served and connections held upstream, which must be 1.
    // why: lessons/workers-shout.md#tee
    if (url.pathname.startsWith('/tee/')) {
      const who = url.pathname.slice(5).replace(/\.mp3$/, '');
      if (!STATIONS[who]) return new Response('no such station', { status: 404, headers: cors() });
      const room = env.MOUNT.get(env.MOUNT.idFromName(who));
      const r = await room.fetch('https://mount/stats');
      return new Response(r.body, { headers: cors({ 'content-type': 'application/json' }) });
    }

    const id = url.pathname.replace(/^\/+/, '').replace(/\.mp3$/, '');
    const upstream = STATIONS[id];
    if (!upstream) return new Response('no such station', { status: 404, headers: cors() });

    // `?bytes=N` hangs up after N bytes, because a radio stream never ends on its own.
    // why: lessons/workers-shout.md#bytes
    const bytes = Math.min(Number(url.searchParams.get('bytes')) || 0, 4 << 20);

    // Through the tee: `idFromName(id)` is one object everywhere, holding one upstream socket.
    // A HEAD goes direct and hangs up before audio; /rec/ files never pass here. No `?direct=1`.
    // why: lessons/workers-shout.md#through-tee
    if (req.method !== 'HEAD') {
      const room = env.MOUNT.get(env.MOUNT.idFromName(id));
      const q = new URLSearchParams({ u: upstream });
      if (req.headers.get('icy-metadata') === '1') q.set('icy', '1');
      if (bytes) q.set('bytes', String(bytes));
      const r = await room.fetch(`https://mount/listen?${q}`);
      if (!r.ok) return new Response(`origin ${r.status}`, { status: 502, headers: cors() });
      const h = cors({ 'x-shout-station': id });
      for (const [k, v] of r.headers) h[k] = v;
      return new Response(r.body, { headers: h });
    }

    const t0 = Date.now();
    // Always GET upstream: Icecast 2.4.4 answers HEAD with 400. Keep the headers, cancel the body.
    // why: lessons/workers-shout.md#get-upstream
    const up = await fetch(upstream, {
      method: 'GET',
      headers: {
        // ICY metadata is opt-in and the client's choice, not ours: asking for
        // it when the client did not would splice 16-byte-aligned metadata
        // blocks into bytes the client is about to treat as pure MP3.
        ...(req.headers.get('icy-metadata') === '1' ? { 'Icy-MetaData': '1' } : {}),
        'user-agent': 'positron-shout/1 (+https://positron.studio)',
      },
      // The origin is Icecast (infinite body, HTTP/1.0); a cached radio stream is a contradiction.
      // why: lessons/workers-shout.md#no-cache
      cf: { cacheEverything: false, cacheTtl: 0 },
    });
    const ttfb = Date.now() - t0;

    if (!up.ok || !up.body) {
      return new Response(`origin ${up.status}`, { status: 502, headers: cors() });
    }

    // Forward the content-type, never invent one: the page picks its MP3 or AAC frame scanner from
    // it,
    // and it handles an absent header by looking at the bytes.
    // why: lessons/workers-shout.md#content-type
    const upType = up.headers.get('content-type');
    const headers = cors({
      ...(upType ? { 'content-type': upType } : {}),
      'x-shout-ttfb': String(ttfb),          // what the relay itself waited for
      'x-shout-station': id,
    });
    for (const k of ['icy-name', 'icy-description', 'icy-genre', 'icy-br', 'icy-url', 'icy-pub', 'icy-metaint']) {
      const v = up.headers.get(k);
      if (v) headers[k] = v;
    }
    if (req.method === 'HEAD') {
      up.body.cancel?.();          // hang up on the origin; nobody is listening
      return new Response(null, { headers });
    }

    return new Response(bytes ? cap(up.body, bytes) : up.body, { headers });
  },
};

// Pass bytes through until `limit`, then close; the stream itself never will.
// why: lessons/workers-shout.md#cap
function cap(body, limit) {
  let sent = 0;
  return body.pipeThrough(new TransformStream({
    transform(chunk, ctrl) {
      const room = limit - sent;
      if (room <= 0) { ctrl.terminate(); return; }
      if (chunk.byteLength <= room) { sent += chunk.byteLength; ctrl.enqueue(chunk); return; }
      ctrl.enqueue(chunk.subarray(0, room));
      sent = limit;
      ctrl.terminate();
    },
  }));
}

// One upstream connection per mount, fanned out: `idFromName(station)` is one object per mount.
// ICY metadata counts from each client's first byte, so blocks are parsed out once and re-inserted
// at each subscriber's own offset. A late joiner starting mid-frame is fine: decoders resync.
// why: lessons/workers-shout.md#mount
const METAINT = 16000;
/** How long the origin is held after the last listener leaves. A reload is two
 *  seconds of nobody; hanging up and dialling again on every one of those is
 *  more connections to the broadcaster, not fewer. */
const LINGER_MS = 20000;
/** A listener whose socket has stopped draining. Radio has no rewind, so the
 *  honest thing is to drop the listener rather than buffer the broadcast for
 *  them and let the queue grow without bound. */
const MAX_BEHIND = 512 * 1024;

export class Mount {
  constructor(state) {
    this.state = state;
    this.subs = new Set();
    this.reader = null;
    this.head = null;          // the origin's own headers, for every joiner
    this.title = '';
    this.startedAt = 0;
    this.served = 0;           // bytes copied out, across every listener
    this.pulled = 0;           // bytes taken from the origin, once
    this.peak = 0;             // most listeners at one time
    this.dropped = 0;
    this.linger = null;
    this.opening = null;       // the dial in flight, shared by every caller
    this.upstreams = 0;        // origin connections open right now
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/stats') {
      return new Response(JSON.stringify({
        listeners: this.subs.size, peak: this.peak, upstream: !!this.reader,
        title: this.title, pulled: this.pulled, served: this.served,
        dropped: this.dropped, redials: this.redials || 0,
        // Must be 1 with listeners on; counted per dial and per pump end, so a duplicate dial reads
        // 2.
        // why: lessons/workers-shout.md#upstreams
        upstreamConnections: this.upstreams,
        openFor: this.startedAt ? Date.now() - this.startedAt : 0,
      }), { headers: { 'content-type': 'application/json' } });
    }

    const origin = url.searchParams.get('u');
    const wantIcy = url.searchParams.get('icy') === '1';
    const cap = Math.min(Number(url.searchParams.get('bytes')) || 0, 4 << 20);
    if (!origin) return new Response('no origin', { status: 400 });

    const opened = await this.open(origin);
    if (!opened || !this.reader) return new Response('origin refused', { status: 502 });

    // Each subscriber counts its own bytes, so its metadata blocks land at its own 16000-byte
    // offsets.
    // why: lessons/workers-shout.md#own-bytes
    const sub = { ctrl: null, sent: 0, behind: 0, cap, icy: wantIcy, said: '' };
    const self = this;
    const body = new ReadableStream({
      start(ctrl) { sub.ctrl = ctrl; self.subs.add(sub); self.peak = Math.max(self.peak, self.subs.size); },
      cancel() { self.drop(sub); },
    });

    const h = new Headers(this.head);
    h.set('x-shout-listeners', String(this.subs.size));
    h.set('x-shout-tee', '1');
    if (wantIcy) h.set('icy-metaint', String(METAINT)); else h.delete('icy-metaint');
    if (this.title) h.set('x-shout-title', this.title);
    return new Response(body, { headers: h });
  }

  /** Open the origin, once. Safe to call on every subscribe, including two at once. */
  open(origin) {
    if (this.linger) { clearTimeout(this.linger); this.linger = null; }
    if (this.reader) return Promise.resolve(true);
    // The input gate does not cover an outbound fetch, so a second caller
    // arriving mid-dial must wait on the first dial, never start its own.
    if (!this.opening) this.opening = this.dial(origin).finally(() => { this.opening = null; });
    return this.opening;
  }

  async dial(origin) {
    this.origin = origin;
    const up = await fetch(origin, {
      method: 'GET',
      headers: {
        // Always asked for: one upstream serves everybody, and metadata is re-written per
        // subscriber.
        // why: lessons/workers-shout.md#icy-always
        'Icy-MetaData': '1',
        'user-agent': 'positron-shout/2 (+https://positron.studio)',
      },
      cf: { cacheEverything: false, cacheTtl: 0 },
    }).catch(() => null);
    if (!up || !up.ok || !up.body) return false;

    const keep = new Headers();
    const type = up.headers.get('content-type');
    if (type) keep.set('content-type', type);
    for (const k of ['icy-name', 'icy-description', 'icy-genre', 'icy-br', 'icy-url', 'icy-pub']) {
      const v = up.headers.get(k);
      if (v) keep.set(k, v);
    }
    this.head = keep;
    this.metaint = Number(up.headers.get('icy-metaint')) || 0;
    this.startedAt = Date.now();
    this.reader = up.body.getReader();
    this.upstreams++;
    this.pump();
    return true;
  }

  // Read the origin forever and copy to everyone. Not awaited by fetch: a radio never ends.
  // why: lessons/workers-shout.md#pump
  async pump() {
    const reader = this.reader;
    let toMeta = this.metaint;          // bytes of audio until the next block
    let need = 0;                       // bytes of a metadata block still owed
    let meta = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || this.reader !== reader) break;
        this.pulled += value.byteLength;
        let i = 0;
        while (i < value.byteLength) {
          if (need > 0) {
            const take = Math.min(need, value.byteLength - i);
            meta.push(value.subarray(i, i + take));
            i += take; need -= take;
            if (need === 0) this.readTitle(meta), meta = [];
            continue;
          }
          if (this.metaint && toMeta === 0) {
            // the length byte: blocks are 16 bytes each
            need = value[i] * 16;
            i += 1;
            toMeta = this.metaint;
            if (need === 0) meta = [];
            continue;
          }
          const room = this.metaint ? Math.min(toMeta, value.byteLength - i) : value.byteLength - i;
          this.send(value.subarray(i, i + room));
          i += room;
          if (this.metaint) toMeta -= room;
        }
      }
    } catch { /* the origin hung up; fall through and close */ }
    this.upstreams--;
    // A pump whose reader was cancelled by the linger must not tear down the
    // connection a later listener opened in its place.
    if (this.reader !== reader) return;
    this.reader = null;
    // our cast's stream ends at a hand-over or a deploy and is back within seconds: keep the listeners and dial again
    if (REDIAL.has(this.origin)) {
      for (let k = 0; k < REDIAL_S && this.subs.size; k++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (this.reader) return;
        if (await this.open(this.origin)) { this.redials = (this.redials || 0) + 1; return; }
      }
    }
    for (const s of [...this.subs]) this.drop(s);
  }

  /** `StreamTitle='...'` out of one metadata block. */
  readTitle(parts) {
    let n = 0;
    for (const p of parts) n += p.byteLength;
    const buf = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { buf.set(p, o); o += p.byteLength; }
    const s = new TextDecoder().decode(buf);
    const m = /StreamTitle='([^']*)'/.exec(s);
    // An empty title is recorded: a stale song title is worse than none.
    // why: lessons/workers-shout.md#empty-title
    if (m) this.title = m[1];
  }

  /** One chunk of clean audio, to every listener, with their own metadata. */
  send(chunk) {
    if (!chunk.byteLength) return;
    for (const sub of [...this.subs]) {
      try {
        let rest = chunk;
        while (rest.byteLength) {
          if (sub.icy) {
            const room = METAINT - (sub.sent % METAINT);
            const take = Math.min(room, rest.byteLength);
            sub.ctrl.enqueue(rest.subarray(0, take));
            sub.sent += take; this.served += take;
            rest = rest.subarray(take);
            if (sub.sent % METAINT === 0) sub.ctrl.enqueue(this.block(sub));
          } else {
            sub.ctrl.enqueue(rest);
            sub.sent += rest.byteLength; this.served += rest.byteLength;
            rest = rest.subarray(rest.byteLength);
          }
        }
        // `desiredSize` going negative is the only backpressure signal; radio has no rewind, so
        // drop.
        // why: lessons/workers-shout.md#behind
        if (sub.ctrl.desiredSize !== null && sub.ctrl.desiredSize < -MAX_BEHIND) {
          this.dropped++; this.drop(sub);
        }
        if (sub.cap && sub.sent >= sub.cap) this.drop(sub);
      } catch { this.drop(sub); }
    }
  }

  /** One ICY metadata block for this subscriber: the title when it changed,
   *  a single zero byte when it did not. */
  block(sub) {
    if (sub.said === this.title) return new Uint8Array([0]);
    sub.said = this.title;
    const body = new TextEncoder().encode(`StreamTitle='${this.title.replace(/'/g, '')}';`);
    const n = Math.ceil(body.byteLength / 16);
    const out = new Uint8Array(1 + n * 16);
    out[0] = n;
    out.set(body, 1);
    return out;
  }

  drop(sub) {
    if (!this.subs.delete(sub)) return;
    try { sub.ctrl.close(); } catch { /* already gone */ }
    // The last listener leaving must close the origin, after a linger so a 2 s reload does not
    // redial.
    // why: lessons/workers-shout.md#linger
    if (this.subs.size === 0 && this.reader && !this.linger) {
      this.linger = setTimeout(() => {
        this.linger = null;
        if (this.subs.size === 0 && this.reader) {
          try { this.reader.cancel(); } catch { /* already gone */ }
          this.reader = null;
          this.startedAt = 0;
        }
      }, LINGER_MS);
    }
  }
}
