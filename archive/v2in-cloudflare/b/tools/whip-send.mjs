// node b/tools/whip-send.mjs <whip url> <show key> [seconds] [hz]: a WHIP sender for testing B's live input without
// OBS. werift (0.22.9, a devDependency of b/) makes the WebRTC connection, as OBS's libdatachannel does: ffmpeg's own
// WHIP muxer cannot finish DTLS with the Cloudflare SFU (positron lessons/workers-sfu.md#film). ffmpeg makes the sound,
// a sine tone at `hz` (default 1000) as Opus RTP on loopback, which werift sends on. Nothing is played here.
// After positron workers/sfu/film/server.mjs at commit 2b2a709f (the werift publisher), now as a WHIP client.
// Prints the WHIP answer's status and Location, the connection's states, and the packets sent; at the end (or on
// Ctrl-C) it DELETEs the Location as OBS does on Stop streaming. `--no-delete` leaves without it, as a crashed sender.
import { createSocket } from 'node:dgram';
import { spawn } from 'node:child_process';
import { RTCPeerConnection, RTCRtpCodecParameters, MediaStreamTrack } from 'werift';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [url, key] = args, seconds = Number(args[2] || 60), hz = Number(args[3] || 1000);
const noDelete = process.argv.includes('--no-delete');
if (!url) { console.log('usage: node b/tools/whip-send.mjs <whip url> <show key> [seconds] [hz] [--no-delete]'); process.exit(2); }
const t0 = Date.now(), T = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s`;
const RTP = 5016 + Math.floor(Math.random() * 100) * 2;

const pc = new RTCPeerConnection({
  bundlePolicy: 'max-bundle',
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
  codecs: { audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2, payloadType: 111 })] },
});
const track = new MediaStreamTrack({ kind: 'audio' });
pc.addTransceiver(track, { direction: 'sendonly' });
await pc.setLocalDescription(await pc.createOffer());
await new Promise((ok) => { if (pc.iceGatheringState === 'complete') ok(); else { pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && ok(); setTimeout(ok, 2000); } });

const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/sdp', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: pc.localDescription.sdp });
const text = await r.text();
console.log(T(), 'POST', r.status, r.headers.get('location') || '', r.status === 201 ? '' : text.slice(0, 200));
if (r.status !== 201) { await pc.close(); process.exit(1); }
const location = new URL(r.headers.get('location'), url).toString();
await pc.setRemoteDescription({ type: 'answer', sdp: text });

let ff = null, packets = 0, sock = null;
pc.connectionStateChange.subscribe((s) => {
  console.log(T(), 'connection', s);
  if (s === 'connected' && !ff) {
    sock = createSocket('udp4');
    sock.on('message', (buf) => { packets++; track.writeRtp(buf); });
    sock.bind(RTP, '127.0.0.1');
    ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=48000`,
      '-ac', '2', '-af', 'volume=0.5', '-c:a', 'libopus', '-b:a', '96k', '-payload_type', '111', '-f', 'rtp', `rtp://127.0.0.1:${RTP}`], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
});
const tick = setInterval(() => console.log(T(), 'sent', packets, 'packets'), 10_000);

async function finish() {
  clearInterval(tick);
  try { ff?.kill('SIGTERM'); } catch { /* gone */ }
  try { sock?.close(); } catch { /* gone */ }
  if (!noDelete) { const d = await fetch(location, { method: 'DELETE', headers: key ? { authorization: `Bearer ${key}` } : {} }); console.log(T(), 'DELETE', d.status); }
  await pc.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', finish);
setTimeout(finish, seconds * 1000);
