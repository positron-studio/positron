// v2in-web: the gate's paths on b.v2in.positron.studio, passed to v2in-gate as they came (the token included); every
// other path is a file from web/ (wrangler.jsonc). /stream/* never reaches this worker: it is v2in-cast's route.
export default {
  fetch(req, env) {
    const p = new URL(req.url).pathname;
    if (p === '/state' || p === '/layers' || p === '/layers.json' || p.startsWith('/admin/')) return env.GATE.fetch(req);
    return env.ASSETS.fetch(req);
  },
};
