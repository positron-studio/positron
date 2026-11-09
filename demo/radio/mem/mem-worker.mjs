// demo/radio/mem/mem-worker.mjs: one MEM engine in a module Web Worker, live (the page pulls chunks to play) or as an
// offline render (as fast as it goes, then a report). The page decodes the source files and hands them over at the
// host's rate; the ring takes exactly the frames each chunk renders, so a render with a seed repeats. Or, live only,
// the page hands over an audio input at the host's rate as it is captured.
import { Mem } from '/shell/mem.mjs';
import { bootSync, loadVendor } from '/shell/scsynth-sync.mjs';

let mem = null, sr = 44100, mode = 'live';
const queue = [];            // { pcm: Int16Array stereo, at: frame } waiting to be fed
let queued = 0, asked = false, starved = 0, waiters = [];
// A live input goes into the ring as it arrives and silence fills a gap over 3 s at the wall's pace, as v2in's run.mjs
// live() does with its ffmpeg feed, so the gate sees quiet and takes nothing stale.
let liveIn = false, lastData = 0, filled = 0, inputName = '';
// Where each source began in the ring, so a take's `ringAt` names the file (or the input) it was cut from.
const segs = [];   // { w: ring frame, name }, in order
const mark = (w, name) => { if (segs.at(-1)?.name !== name) segs.push({ w, name }); if (segs.length > 400) segs.shift(); };
// a take may start a moment before its source's first frame (the gate keeps a little lead-in), so before the first
// source is the first source
const nameAt = (w) => { let n = segs[0]?.name ?? null; for (const x of segs) { if (x.w <= w) n = x.name; else break; } return n; };
function named(st) { for (const l of st.loops) if (l && l.file == null && l.ringAt != null) l.file = nameAt(l.ringAt); return st; }
const post = (m, t) => self.postMessage(m, t || []);
const log = (line) => post({ type: 'log', line });

// ── the feed ───────────────────────────────────────────────────────────────────────────────────────────────────────
function want() { if (!liveIn && !asked && queued < sr * 60) { asked = true; post({ type: 'need' }); } }
/** n frames of the source into `out` (stereo s16), or silence where there is none yet. Returns frames that were real. */
function take(n, out) {
  let o = 0;
  while (o < n && queue.length) {
    const q = queue[0], left = (q.pcm.length >> 1) - q.at, k = Math.min(left, n - o);
    if (q.at === 0 && mem) mark(mem.ring.w + o, q.name);
    out.set(q.pcm.subarray(q.at * 2, (q.at + k) * 2), o * 2);
    q.at += k; o += k; queued -= k;
    if (q.at * 2 >= q.pcm.length) queue.shift();
  }
  if (o < n) out.fill(0, o * 2);
  want();
  return o;
}
const enough = (n) => queued >= n;
const until = (n) => (enough(n) ? null : new Promise((ok) => waiters.push({ n, ok })));

// ── the meter: K-weighted loudness (BS.1770, the RBJ form of its two filters, any rate), peaks, the mono fold ─────
function biquad(type, f, q, gainDb = 0) {
  const A = 10 ** (gainDb / 40), w = 2 * Math.PI * f / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'shelf') {
    const s = 2 * Math.sqrt(A) * al;
    b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s);
    a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s;
  } else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
function createMeter() {
  const kw = () => { const a = biquad('shelf', 1681.97, 0.7072, 4), b = biquad('hp', 38.135, 0.5003); return (x) => b(a(x)); };
  const kl = kw(), kr = kw(), block = Math.round(sr * 0.1);
  let acc = 0, n = 0, peak = 0, st = 0, mono = 0;
  const blocks = [];            // mean square per 100 ms
  return {
    feed(pcm) {
      for (let i = 0; i < pcm.length; i += 2) {
        const l = pcm[i] / 32768, r = pcm[i + 1] / 32768, a = kl(l), b = kr(r);
        acc += a * a + b * b; st += l * l + r * r; mono += ((l + r) / 2) ** 2;
        const p = Math.max(Math.abs(l), Math.abs(r)); if (p > peak) peak = p;
        if (++n === block) { blocks.push(acc / block); acc = 0; n = 0; }
      }
    },
    /** Loudness of the last `s` seconds, LUFS. */
    last(s) { const k = Math.round(s * 10), xs = blocks.slice(-k); if (xs.length < k) return null; return lufs(xs.reduce((a, x) => a + x, 0) / k); },
    report() {
      const mom = []; for (let i = 3; i < blocks.length; i++) mom.push((blocks[i] + blocks[i - 1] + blocks[i - 2] + blocks[i - 3]) / 4);
      const abs = mom.filter((x) => lufs(x) > -70), m1 = abs.reduce((a, x) => a + x, 0) / (abs.length || 1);
      const rel = abs.filter((x) => lufs(x) > lufs(m1) - 10), I = lufs(rel.reduce((a, x) => a + x, 0) / (rel.length || 1));
      const sts = []; for (let i = 29; i < blocks.length; i += 10) { let s = 0; for (let j = i - 29; j <= i; j++) s += blocks[j]; sts.push(lufs(s / 30)); }
      const sa = sts.filter((x) => x > -70), sm = lufs(sa.reduce((a, x) => a + 10 ** ((x + 0.691) / 10), 0) / (sa.length || 1)), sr2 = sa.filter((x) => x > sm - 20).sort((a, b) => a - b);
      const pc = (p) => sr2.length ? sr2[Math.min(sr2.length - 1, Math.floor(p * sr2.length))] : null;
      return { lufs: I, lra: sr2.length ? pc(0.95) - pc(0.1) : null, peak: 20 * Math.log10(peak + 1e-12), mono: 10 * Math.log10((mono + 1e-12) / (st / 2 + 1e-12)), shortTerm: sts };
    },
  };
}
const lufs = (ms) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -120);

// ── a spectrum for the render's picture: 48 log bands every half second ─────────────────────────────────────────────
const FFT = 2048, BANDS = 48;
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) {
      const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
      re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
      const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
function spectrum(pcm, at) {
  const re = new Float64Array(FFT), im = new Float64Array(FFT);
  for (let i = 0; i < FFT; i++) { const j = (at + i) * 2; const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FFT); re[i] = j + 1 < pcm.length ? (pcm[j] + pcm[j + 1]) / 65536 * w : 0; }
  fft(re, im);
  const out = new Uint8Array(BANDS), lo = 50, hi = Math.min(16000, sr / 2);
  for (let b = 0; b < BANDS; b++) {
    const f0 = lo * (hi / lo) ** (b / BANDS), f1 = lo * (hi / lo) ** ((b + 1) / BANDS);
    const k0 = Math.max(1, Math.floor(f0 / sr * FFT)), k1 = Math.max(k0 + 1, Math.ceil(f1 / sr * FFT));
    let e = 0; for (let k = k0; k < k1; k++) e += re[k] * re[k] + im[k] * im[k];
    const db = 10 * Math.log10(e / (k1 - k0) + 1e-12);
    out[b] = Math.max(0, Math.min(255, Math.round((db + 40) * 3.2)));   // -40 dB to +40 dB onto 0..255
  }
  return out;
}

// ── what the loops did, sampled once a second ───────────────────────────────────────────────────────────────────────
function createWatch() {
  const secs = [];
  return {
    tick() {
      const s = mem.status(), loops = s.loops.filter((l) => l && !l.resting && !l.leaving);
      secs.push({ t: s.t, players: loops.length, lens: loops.map((l) => l.len), talk: loops.filter((l) => l.speech >= 0.5).length, c: { ...s.counts }, mood: s.mood });
    },
    report(meter, seconds) {
      const lens = secs.flatMap((x) => x.lens).sort((a, b) => a - b), pc = (p) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor(p * lens.length))] : null);
      const sounding = secs.reduce((a, x) => a + x.players, 0), talk = secs.reduce((a, x) => a + x.talk, 0);
      const last = secs.at(-1)?.c || {}, min = seconds / 60;
      const perMin = [];
      for (let m = 0; m * 60 < secs.length; m++) {
        const xs = secs.slice(m * 60, m * 60 + 60), st = meter.shortTerm.slice(m * 60, m * 60 + 60).filter((x) => x > -70);
        perMin.push({ players: +(xs.reduce((a, x) => a + x.players, 0) / xs.length).toFixed(1), lufs: st.length ? +(st.reduce((a, x) => a + x, 0) / st.length).toFixed(1) : null, mood: xs.at(-1)?.mood || null });
      }
      return { players: +(sounding / (secs.length || 1)).toFixed(1), talk: sounding ? talk / sounding : 0,
        replaced: (last.replaced || 0) / min, glides: (last.glides || 0) / min, freezes: (last.freezes || 0) / min,
        len: [pc(0.1), pc(0.5), pc(0.9)], perMin };
    },
  };
}

// ── messages ────────────────────────────────────────────────────────────────────────────────────────────────────────
let meter = null, watch = null, nextWatch = 0, ctlAt = 0;
self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'boot') {
      mode = m.mode || 'live';
      const vendor = await loadVendor('/shell/vendor/');
      mem = new Mem({ preset: m.preset, seed: m.seed, host: m.host, log, now: () => Date.UTC(2026, 10, 20, 20, 0) + mem.t / sr * 1000 });
      sr = mem.sr;
      await mem.boot(bootSync, vendor);
      meter = createMeter(); watch = createWatch(); nextWatch = sr;
      post({ type: 'ready', rate: sr, host: mem.host });
      want();
      if (mode === 'render') render(m.seconds);
    } else if (m.type === 'source') {
      queue.push({ pcm: m.pcm, at: 0, name: m.name || 'a recording' }); queued += m.pcm.length >> 1; asked = false;
      waiters = waiters.filter((w) => (enough(w.n) ? (w.ok(), false) : true));
      want();
    } else if (m.type === 'live') {
      liveIn = !!m.on; lastData = filled = Date.now(); inputName = m.name || 'live input';
    } else if (m.type === 'input' && mem && liveIn) {
      mark(mem.ring.w, inputName); mem.ring.write(m.pcm); lastData = filled = Date.now();
    } else if (m.type === 'pull' && mem) {
      const n = m.frames;
      if (liveIn) {
        const now = Date.now();
        if (now - lastData > 3000) { mem.ring.silence(Math.round((now - filled) / 1000 * sr)); filled = now; }
      } else {
        const src = new Int16Array(n * 2);
        if (take(n, src) < n) starved++;
        mem.ring.write(src);
      }
      const pcm = mem.render(n).slice(0, n * 2);
      meter.feed(pcm);
      while (mem.t >= nextWatch) { watch.tick(); nextWatch += sr; }
      const out = { type: 'audio', pcm, t: mem.t / sr };
      if (mem.t >= ctlAt) { ctlAt = mem.t + sr / 4; out.status = named(mem.status()); out.st = meter.last(3); out.starved = starved; }
      post(out, [pcm.buffer]);
    } else if (m.type === 'edit' && mem) {
      mem.edit(m.preset);
    } else if (m.type === 'preset' && mem) {
      mem.setPreset(m.preset, { force: true });
    }
  } catch (e) {
    post({ type: 'error', message: e?.message || String(e) });
  }
};

async function render(seconds) {
  const total = Math.round(seconds * sr), chunk = 4096, out = new Int16Array(total * 2), bands = [];
  const src = new Int16Array(chunk * 2), t0 = performance.now();
  let at = 0, nextBand = 0, nextProgress = 0;
  while (at < total) {
    const n = Math.min(chunk, total - at);
    const w = until(n); if (w) await w;
    take(n, src); mem.ring.write(n === chunk ? src : src.subarray(0, n * 2));
    const pcm = mem.render(n);
    out.set(pcm.subarray(0, n * 2), at * 2);
    meter.feed(pcm.subarray(0, n * 2));
    at += n;
    while (mem.t >= nextWatch) { watch.tick(); nextWatch += sr; }
    while (nextBand + FFT <= at) { bands.push(spectrum(out, nextBand)); nextBand += sr / 2; }
    if (at >= nextProgress) { post({ type: 'progress', t: at / sr, of: seconds }); nextProgress += sr * 10; }
  }
  const m = meter.report(), w = watch.report(m, seconds);
  post({ type: 'report', seconds, rate: sr, ms: performance.now() - t0, pcm: out, bands, report: { ...m, ...w, shortTerm: undefined, takes: mem.status().counts.takes } }, [out.buffer]);
}
