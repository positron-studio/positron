// The station's side of edgecast-relay: frames collected as the station makes them, posted once per pump through the
// RELAY service binding. A post that fails is dropped, never retried: the relay fills the gap with silence.
// Hooked into station.mjs as the report says (Station.send and Station.alarm). why: lessons/edgecast.md#relay

/** `post(bytes)` answers a Response-like `{ ok }`; `maxBytes` caps one post (the relay refuses over 1 MiB). */
/** A relay that answers idle (not started) is asked again after `idleMs`; frames in between are not sent. */
export function createRelayFeed({ post, maxBytes = 512 * 1024, idleMs = 10_000, now = Date.now }) {
  let parts = [], n = 0, busy = null, idleUntil = 0;
  const st = { posts: 0, bytes: 0, failed: 0, dropped: 0, idle: 0, lastError: null };
  return {
    st,
    push(f) {
      if (now() < idleUntil) { st.idle += f.data.length; return; }
      if (n + f.data.length > maxBytes) { st.dropped += f.data.length; return; }
      parts.push(f.data); n += f.data.length;
    },
    /** One post of what has collected; a flush while one is in flight waits for it, so the order holds. */
    async flush() {
      await busy;
      if (!n) return;
      const b = new Uint8Array(n);
      let o = 0;
      for (const p of parts) { b.set(p, o); o += p.length; }
      parts = []; n = 0;
      busy = (async () => {
        try { const r = await post(b); if (r && r.ok === false) throw new Error(`relay answered ${r.status}`); if (r && r.idle) idleUntil = now() + idleMs; st.posts++; st.bytes += b.length; }
        catch (e) { st.failed++; st.lastError = String(e.message || e).slice(0, 160); }
      })();
      await busy;
    },
  };
}

/** The post through a service binding: `env.RELAY.fetch` with the cast's key. */
export const bindingPost = (env) => async (body) => {
  const r = await env.RELAY.fetch(`https://relay/push?key=${encodeURIComponent(env.CAST_KEY)}`, { method: 'POST', body });
  if (!r.ok) return r;
  const j = await r.json().catch(() => ({}));
  return { ok: true, idle: j.ok === false };
};
