// a/conductor/boot.mjs: the image's entry. Under docker compose it only starts the conductor (main.mjs). On Cloudflare
// (a/cloudflare/), where the container's disk starts empty on every start, BOOT_URL is set and it first fetches, from
// the Worker in front of it:
//   - the media: MEDIA_MAP "folder=prefix,..." copies each R2 prefix of v2in-media into /media/<folder>/
//   - the gate's last database snapshot (keys, the log, switches) into $DATA_DIR/gate.sqlite, if there is one
// BOOT_URL is http://v2in.boot, a host the Worker intercepts for this container only. A file that fails is skipped
// and logged; the conductor starts anyway.
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const BOOT = process.env.BOOT_URL;
if (BOOT) {
  const MEDIA = process.env.MEDIA_DIR || '/media', DATA = process.env.DATA_DIR || '/data';
  const t0 = Date.now();
  const get = async (path) => {
    // the first answers can take a while: the host is intercepted only once the container is placed
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${BOOT}${path}`, { signal: AbortSignal.timeout(60_000) });
        if (r.ok || r.status === 404) return r;
        console.log(`[boot] ${path}: ${r.status}`);
      } catch (e) { console.log(`[boot] ${path}: ${e.message}`); }
      await new Promise((ok) => setTimeout(ok, 3000));
    }
    return null;
  };
  const jobs = [];
  for (const pair of (process.env.MEDIA_MAP || '').split(',').filter(Boolean)) {
    const [folder, prefix] = pair.split('=');
    const dir = `${MEDIA}/${folder}`;
    mkdirSync(dir, { recursive: true });
    const r = await get(`/_boot/list?prefix=${encodeURIComponent(prefix)}`);
    const keys = r?.ok ? (await r.json()).keys : [];
    for (const key of keys.filter((k) => /\.(mp3|ogg|flac|wav|m4a)$/i.test(k))) jobs.push({ key, to: `${dir}/${key.split('/').pop()}` });
  }
  let n = 0, bytes = 0;
  const worker = async () => {
    while (jobs.length) {
      const { key, to } = jobs.shift();
      if (existsSync(to)) continue;
      const r = await get(`/_boot/media/${key.split('/').map(encodeURIComponent).join('/')}`);
      if (!r?.ok) { console.log(`[boot] ${key} skipped`); continue; }
      const b = Buffer.from(await r.arrayBuffer());
      writeFileSync(to, b); n++; bytes += b.length;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const folders = readdirSync(MEDIA).map((f) => `${f} ${readdirSync(`${MEDIA}/${f}`).length}`).join(', ');
  console.log(`[boot] media: ${n} files, ${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s (${folders})`);
  mkdirSync(DATA, { recursive: true });
  const d = await get('/_boot/db');
  if (d?.ok) { const b = Buffer.from(await d.arrayBuffer()); writeFileSync(`${DATA}/gate.sqlite`, b); console.log(`[boot] gate database restored, ${b.length} bytes`); }
  else console.log('[boot] no gate database snapshot, a new one');
}
await import('./main.mjs');
