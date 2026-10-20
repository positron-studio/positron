// An Icecast source over a raw TCP socket, the shape of cloudflare:sockets connect(). `connect` is passed in, so
// relay-test.mjs drives it with a fake socket and the worker with the real one. The password is never logged.
import { sourceHead, readStatus } from './icecast.mjs';

export const ANSWER_MS = 8000, WRITE_MS = 15000;

/**
 * Opens the source and resolves once Icecast answers ` 200`; rejects with an Error carrying `.why`
 * (`refused-auth`, `refused-in-use`, `refused`, `timeout`, `unreachable`). The sink: `write(bytes)` (a write
 * that does not drain in WRITE_MS closes it), `close()`, `closed` (a promise of the reason), `why`.
 */
export async function openSource({ connect, host, port, mount, pw, answerMs = ANSWER_MS, writeMs = WRITE_MS }) {
  if (!host || !port || !mount) throw Object.assign(new Error('the source has no host, port or mount'), { why: 'unconfigured' });
  let sock;
  try { sock = connect({ hostname: host, port: Number(port) }, { secureTransport: 'off', allowHalfOpen: false }); }
  catch (e) { throw Object.assign(new Error(`connect: ${e.message}`), { why: 'unreachable' }); }
  const writer = sock.writable.getWriter(), reader = sock.readable.getReader();
  const fail = (why, msg) => { try { sock.close(); } catch { /* gone */ } return Object.assign(new Error(msg), { why }); };
  let timer;
  const timeout = new Promise((_, no) => { timer = setTimeout(() => no(fail('timeout', `${host}:${port} answered nothing in ${answerMs / 1000} s`)), answerMs); });
  let ans;
  try {
    ans = await Promise.race([timeout, (async () => {
      await sock.opened;
      await writer.write(sourceHead({ mount, pw }));
      let text = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw fail('refused', `${host}:${port} closed before answering`);
        for (const c of value) text += String.fromCharCode(c);
        const s = readStatus(text);
        if (s) return s;
      }
    })()]);
  } catch (e) {
    clearTimeout(timer);
    if (e.why) throw e;
    throw fail('unreachable', `${host}:${port}: ${e.message}`);
  }
  clearTimeout(timer);
  if (!ans.ok) throw fail(ans.why, `${host}:${port} answered "${ans.line}"`);

  const sink = { why: null, closed: null, bytes: 0, writes: 0 };
  let closedRes;
  sink.closed = new Promise((r) => { closedRes = r; });
  const end = (why) => { if (sink.why) return; sink.why = why; try { sock.close(); } catch { /* gone */ } closedRes(why); };
  // drain whatever Icecast says after the status line, as their app does; the end of it is the server letting go
  (async () => { try { while (!(await reader.read()).done); end('the server closed the connection'); } catch (e) { end(`read: ${e.message}`); } })();
  sock.closed?.then(() => end('the socket closed'), (e) => end(`socket: ${e?.message || e}`));
  sink.write = async (bytes) => {
    if (sink.why) return false;
    let t;
    try {
      await Promise.race([writer.write(bytes), new Promise((_, no) => { t = setTimeout(() => no(new Error(`the server stopped reading for ${writeMs / 1000} s`)), writeMs); })]);
      sink.bytes += bytes.length; sink.writes++;
      return true;
    } catch (e) { end(e.message); return false; } finally { clearTimeout(t); }
  };
  sink.close = () => end('closed by the relay');
  return sink;
}
