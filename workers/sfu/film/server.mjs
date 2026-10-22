// positron-sfu's film container: one room's stage film, sent into the Cloudflare SFU as a participant would.
// ffmpeg copies the WebRTC shaped film to RTP on loopback (no encode) and werift sends it: ffmpeg's own WHIP
// muxer cannot finish DTLS with this SFU. why: lessons/workers-sfu.md#film
//   POST /start { room, base, film }  -> { sessionId, proof, tracks: [{ trackName, kind }] }
//   POST /stop                        -> { stopped }
//   GET  /status                      -> { state, room, sessionId, sentS, error }
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { spawn } from 'node:child_process';
import { RTCPeerConnection, RTCRtpCodecParameters, MediaStreamTrack } from 'werift';

const PORT = Number(process.env.PORT) || 8080;
// Only our bucket, only the films named here: a body cannot point ffmpeg anywhere else.
const MEDIA = 'https://positron-station.kristjan-jansen.workers.dev/media/';
const FILMS = new Set(['mimproject/party-container-vabaduse-valjak-2010-webrtc.mp4']);
const ROOM_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const BASE_RE = /^https:\/\/(sfu\.positron\.studio|positron-sfu\.kristjan-jansen\.workers\.dev)$/;
const RTP_V = 5004, RTP_A = 5006;

let run = null;   // { room, sessionId, pc, ff, socks, startedAt, state, error }

async function post(base, room, path, body) {
  const r = await fetch(`${base}/room/${room}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'positron-film/1.0' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path.split('/').pop()} ${r.status} ${j.error || ''}`.trim());
  return j;
}

function stop(why = 'stopped') {
  if (!run) return;
  const r = run; run = { ...r, state: why, pc: null, ff: null, socks: [] };
  try { r.ff?.kill('SIGTERM'); } catch { /* gone */ }
  for (const s of r.socks || []) try { s.close(); } catch { /* gone */ }
  r.pc?.close().catch(() => {});
}

async function start({ room, base, film }) {
  if (!ROOM_RE.test(room || '')) throw new Error('bad room');
  if (!BASE_RE.test(base || '')) throw new Error('bad base');
  if (!FILMS.has(film)) throw new Error('not a film here');
  if (run?.pc) stop();
  // What it is doing, for /status while a start is under way.
  run = { room, sessionId: null, pc: null, ff: null, socks: [], startedAt: Date.now(), state: 'starting', step: 'offer', error: null, packets: 0 };
  const step = (x) => { run.step = x; };
  const pc = new RTCPeerConnection({
    bundlePolicy: 'max-bundle',
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    codecs: {
      video: [new RTCRtpCodecParameters({ mimeType: 'video/H264', clockRate: 90000,
        parameters: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
        rtcpFeedback: [{ type: 'nack' }, { type: 'nack', parameter: 'pli' }] })],
      audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2 })],
    },
  });
  const v = new MediaStreamTrack({ kind: 'video' }), a = new MediaStreamTrack({ kind: 'audio' });
  const tv = pc.addTransceiver(v, { direction: 'sendonly' }), ta = pc.addTransceiver(a, { direction: 'sendonly' });
  await pc.setLocalDescription(await pc.createOffer());
  step('gathering');
  await new Promise((ok) => { if (pc.iceGatheringState === 'complete') ok(); else { pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && ok(); setTimeout(ok, 2000); } });
  step('session');
  const s = await post(base, room, 'session');
  step('publish');
  // A new name per start, so a tab that pulled the last one does not take this one for it.
  const tag = Math.random().toString(36).slice(2, 8);
  const tracks = [{ mid: tv.mid, trackName: `film-${tag}-video`, kind: 'stream' }, { mid: ta.mid, trackName: `film-${tag}-sound`, kind: 'sound' }];
  const r = await post(base, room, `${s.sessionId}/publish`, { proof: s.proof, offer: { type: 'offer', sdp: pc.localDescription.sdp },
    tracks: tracks.map(({ mid, trackName }) => ({ mid, trackName })) });
  const bad = r.tracks?.find((t) => t.errorCode);
  if (bad) throw new Error(`publish ${bad.errorCode}`);
  step('answer');
  await pc.setRemoteDescription(r.answer);
  run = { room, sessionId: s.sessionId, pc, ff: null, socks: [], startedAt: Date.now(), state: 'connecting', step: 'connecting', error: null, packets: 0 };
  const me = run;
  pc.onconnectionstatechange = () => {
    if (run !== me) return;
    if (pc.connectionState === 'connected' && !me.ff) play(me, film, v, a);
    if (pc.connectionState === 'failed') { me.error = 'connection failed'; stop('failed'); }
  };
  return { sessionId: s.sessionId, proof: s.proof, tracks: tracks.map(({ trackName, kind }) => ({ trackName, kind })) };
}

/** Once the SFU has us: ffmpeg copies the film to RTP on loopback, at its own pace, once through. */
function play(me, film, v, a) {
  me.state = 'playing';
  for (const [port, track] of [[RTP_V, v], [RTP_A, a]]) {
    const sock = createSocket('udp4');
    sock.on('message', (buf) => { me.packets++; track.writeRtp(buf); });
    sock.bind(port, '127.0.0.1');
    me.socks.push(sock);
  }
  me.ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-re', '-i', MEDIA + film,
    '-map', '0:v:0', '-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'rtp', '-pkt_size', '1200', `rtp://127.0.0.1:${RTP_V}`,
    '-map', '0:a:0', '-c:a', 'copy', '-f', 'rtp', '-pkt_size', '1200', `rtp://127.0.0.1:${RTP_A}`], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  me.ff.stderr.on('data', (b) => { err = (err + b).slice(-600); });
  me.ff.on('exit', (code) => { if (run !== me) return; if (code) me.error = `ffmpeg exit ${code}: ${err.trim()}`; stop(code ? 'failed' : 'ended'); });
}

const json = (res, o, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://c');
  if (url.pathname === '/status') return json(res, { state: run?.state || 'idle', room: run?.room || null, sessionId: run?.sessionId || null,
    sentS: run ? Math.round((Date.now() - run.startedAt) / 1000) : 0, packets: run?.packets || 0, step: run?.step || null, error: run?.error || null });
  if (req.method !== 'POST') return json(res, { error: 'use POST /start /stop, GET /status' }, 404);
  let body = ''; for await (const c of req) body += c;
  let o = {}; try { o = JSON.parse(body || '{}'); } catch { return json(res, { error: 'not json' }, 400); }
  if (url.pathname === '/stop') { stop(); return json(res, { stopped: true }); }
  if (url.pathname === '/start') {
    try { return json(res, await start(o)); } catch (e) { stop('failed'); if (run) run.error = e.message; return json(res, { error: e.message }, 502); }
  }
  return json(res, { error: 'not a route' }, 404);
}).listen(PORT, () => console.log(`film on ${PORT}`));
