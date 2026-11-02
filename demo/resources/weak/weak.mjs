// demo/weak/weak.mjs: weak.c in JavaScript, byte for byte the same frames for the same
// seed and calls (weak-test.mjs checks it against the wasm). For pages where WebAssembly
// is not allowed; prefer the wasm.
export function createWeak({ w, h, ch = 4, block = 16, gop = 50, seed = 1 }) {
  const n = w * h * ch, bw = Math.ceil(w / block), bh = Math.ceil(h / block);
  const nb = bw * bh, shown = new Uint8Array(n), prev = new Uint8Array(n), dirty = new Uint8Array(nb).fill(1), lost = new Uint8Array(nb);
  let rng = (seed >>> 0) || 1, frame = -1;
  const rnd = () => { let x = rng; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (rng = x); };
  const pm = () => rnd() % 1000;
  const isColour = (c) => (ch >= 3 ? c < 3 : true);
  const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const span = (bx, by) => [bx * block, by * block, Math.min(bx * block + block, w), Math.min(by * block + block, h)];
  const div = (a, b) => Math.trunc(a / b);

  function copyClean(f, bx, by) {
    const [x0, y0, x1, y1] = span(bx, by);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * ch; for (let c = 0; c < ch; c++) shown[i + c] = f[i + c]; }
  }
  function residual(f, bx, by) {
    const [x0, y0, x1, y1] = span(bx, by);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      for (let c = 0; c < ch; c++) if (isColour(c)) shown[i + c] = clamp8(shown[i + c] + f[i + c] - prev[i + c]);
    }
  }
  function smear(bx, by, dx, dy) {
    const [x0, y0, x1, y1] = span(bx, by);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      let sx = x + dx, sy = y + dy;
      if (sx < 0) sx = 0; if (sx >= w) sx = w - 1; if (sy < 0) sy = 0; if (sy >= h) sy = h - 1;
      const i = (y * w + x) * ch, j = (sy * w + sx) * ch;
      for (let c = 0; c < ch; c++) if (isColour(c)) shown[i + c] = shown[j + c];
    }
  }
  function flatten(f, bx, by, chroma, push, amount) {
    const sum = [0, 0, 0, 0];
    const [x0, y0, x1, y1] = span(bx, by), cnt = (x1 - x0) * (y1 - y0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < ch && c < 4; c++) sum[c] += f[(y * w + x) * ch + c];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      for (let c = 0; c < ch && c < 4; c++) if (isColour(c)) {
        let v = div(sum[c], cnt);
        if (chroma && ch >= 3) v += (c === 1 ? -push : push) * amount;
        shown[i + c] = clamp8(v);
      }
    }
  }

  function tint(bx, by, push) {
    const amount = 40 + (rnd() % 90);
    if (ch < 3) return;
    const [x0, y0, x1, y1] = span(bx, by);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      for (let c = 0; c < 3; c++) shown[i + c] = clamp8(shown[i + c] + (c === 1 ? -push : push) * amount);
    }
  }
  function step(f, signal) {
    signal = Math.max(0, Math.min(1000, signal | 0));
    let flags = 0;
    frame++;
    const iframe = frame % gop === 0;
    if (iframe) flags |= 2;
    if (signal < 60) flags |= 1;
    else {
      const chance = div((1000 - signal) * (1000 - signal), 1000);
      const ev = [];
      lost.fill(0);
      for (let e = 0; e < 6; e++) {
        if (pm() >= chance) continue;
        const start = rnd() % nb;
        const rows = 1 + (rnd() % 4);
        const len = 1 + (rnd() % (bw * rows));
        const r = pm();
        const mode = r < 550 ? 1 : r < 850 ? 2 : r < 980 ? 3 : 4;
        const dx = ((rnd() % 5) - 2) * div(block, 2);
        const dy = ((rnd() % 3) - 1) * div(block, 2);
        const push = (rnd() & 1) ? 1 : -1;
        const amount = 60 + (rnd() % 80);
        ev[e] = { dx, dy, push, amount };
        for (let k = start; k < start + len && k < nb; k++) lost[k] = mode | (e << 4);
      }
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const k = by * bw + bx;
        if (lost[k] === 0) {
          if (iframe || !dirty[k]) { copyClean(f, bx, by); dirty[k] = 0; }
          else residual(f, bx, by);
        } else {
          const mode = lost[k] & 15, e = ev[lost[k] >> 4];
          dirty[k] = 1;
          if (mode === 2) smear(bx, by, e.dx, e.dy);
          else if (mode === 3) flatten(f, bx, by, false, 0, 0);
          else if (mode === 4) tint(bx, by, e.push);
        }
      }
    }
    for (let i = 0; i < n; i++) { prev[i] = f[i]; if (ch === 4 && i % 4 === 3) continue; f[i] = shown[i]; }
    return flags;
  }
  return { step };
}
