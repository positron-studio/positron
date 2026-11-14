// demo/shell/mem-signals.mjs: MEM as a far AM dial (v2in plans/plan-mem-signals.md). Six layers over the live ring: a
// grained bed, dub throws, fading and a sweeping notch, signals (keying that grows into a modular pattern, the pips),
// static, and a rare surprise. JS makes every sample; scsynth does the reverb and MEM's master. Same interface as Mem,
// so run.mjs drives either. The same file, byte for byte, in v2in server/engines/mem/.
import { compile } from './sclang-lite.mjs';
import { program as masterProgram, MASTER } from './mem-master.mjs';
import { QUANTUM } from './scsynth-sync.mjs';
import { rng, Ring, findStart, SR, RING_S } from './mem.mjs';

export const SIGNALS = {
  name: 'signals',
  gateDb: -45,
  bed: { voices: 2, takeS: [12, 40], life: [150, 360], fadeS: [30, 60], grainS: [0.3, 0.9], density: [6, 12], stretch: [25, 100], jitterS: 0.12, lp: [1200, 2600], hp: 120, gain: 0.32, rev: 0.55, speech: 0.15 },
  echo: { every: [20, 75], takeS: [0.3, 1.6], delay: [0.25, 1.1], fb: [0.55, 0.8], lifeS: [6, 18], bp: [500, 1500], swell: 0.15, gain: 0.9, rev: 0.3 },
  waves: { fadeDb: [2, 7], fadeS: [6, 28], notch: [300, 3000], notchS: [40, 90], notchDepth: 0.55 },
  signal: { every: [180, 480], lenS: [6, 16], clearS: [1, 3], pitch: [550, 800], dot: [0.06, 0.09], gain: 0.05, rev: 0.6, stage: [0.55, 0.3, 0.12, 0.03], dirt: 0.5 },
  pips: { gain: 0.05 },
  stat: { every: [90, 260], apart: 60, gain: 0.07 },
  surprise: { every: [480, 1200], first: 180 },
  // intensity: a slow arc that thins and fills every layer; each state a level and how long it holds, then where it may go
  intensity: { glideS: [20, 45], states: {
    rest:   { level: [0.05, 0.15], holdS: [40, 110],  next: ['calm'] },
    calm:   { level: [0.3, 0.45],  holdS: [60, 150],  next: ['active', 'active', 'active', 'rest'] },
    active: { level: [0.6, 0.8],   holdS: [90, 200],  next: ['calm', 'peak', 'rest'] },
    peak:   { level: [0.9, 1],     holdS: [30, 80],   next: ['calm', 'rest'] },
  }, first: 'calm' },
  master: {},
};
const SCALES = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 5, 7, 9], [0, 3, 5, 8, 10]];
const TAU = 2 * Math.PI;

// a biquad (RBJ), mono
class BQ {
  constructor() { this.b0 = 1; this.b1 = this.b2 = this.a1 = this.a2 = 0; this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, f, q, sr) {
    const w = TAU * Math.min(f, sr * 0.45) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2; const a0 = 1 + al;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }   // band pass, 0 dB peak
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}
const hann = (x) => 0.5 - 0.5 * Math.cos(TAU * x);
const fade = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));

// scsynth: inputs 2,3 dry, 4,5 reverb send; both out to the master's bus
const MIX_BUS = 8, NODE = { dry: 1100, rev: 1101, mst: 1102 };
const DRY = `{ [In.ar(2, 1), In.ar(3, 1)] }`;
const REV = `{ var l = LPF.ar(HPF.ar(In.ar(4, 1), 150), 3500);
  var r = LPF.ar(HPF.ar(In.ar(5, 1), 150), 3500);
  FreeVerb2.ar(l, r, 1, \\room.kr(0.92), \\damp.kr(0.75)) * \\level.kr(0.9) }`;
// the leveller barely lifts (GMAX 1.6), so a rest stays quieter than a peak; the level is set here instead
const SIG_MASTER = { TARGET: 0.14, GMAX: 2.5, SLOW: 12, GLIDE: 6 };
const TRIM = 5.5;   // +12 dB into the master: the layers are written at their own sizes

export class Signals {
  constructor({ seed = 1, log = () => {}, recordings = null, now = () => Date.now(), settings = SIGNALS } = {}) {
    this.sr = SR; this.p = { ...settings }; this.seed = seed >>> 0; this.r = rng(this.seed); this.log = log; this.recordings = recordings; this.now = now;
    this.ring = new Ring(RING_S, SR); this.grid = SR / 100;
    this.t = 0; this.n = 4; this.tid = 0; this.events = [];
    this.counts = { takes: 0, throws: 0, swells: 0, phrases: 0, stages: [0, 0, 0, 0], static: 0, surprises: 0, pips: 0, passed: 0 };
    const r = this.r, sr = SR;
    // bed
    this.bed = []; this.bedNext = 8 * sr;
    this.bedLp = [new BQ(), new BQ(), new BQ(), new BQ()]; this.bedHp = [new BQ().set('hp', this.p.bed.hp, 0.7, sr), new BQ().set('hp', this.p.bed.hp, 0.7, sr)];
    this.bedLpHz = r.range(this.p.bed.lp); this.setBedLp();
    // echoes: a ping-pong delay, 2 s each side
    this.dn = 2 * sr; this.dl = new Float32Array(this.dn); this.dr = new Float32Array(this.dn); this.dw = 0;
    this.fbBp = [new BQ(), new BQ()]; this.throw = null; this.throwNext = r.range([10, 25]) * sr; this.fb = 0; this.dly = 0.5 * sr; this.wow = r.next() * TAU;
    // waves
    this.fadeP = [r.next() * TAU, r.next() * TAU, r.range(this.p.waves.fadeS), r.range(this.p.waves.fadeS) * 1.7];
    this.notch = [new BQ(), new BQ()]; this.notchP = r.next() * TAU; this.notchS = r.range(this.p.waves.notchS);
    // signals
    this.notes = []; this.phrase = null; this.phraseNext = r.range([90, 240]) * sr; this.scale = r.pick(SCALES); this.root = r.range([196, 262]); this.hour = -1;
    this.pipsDone = -1; this.sigBp = new BQ().set('bp', 700, 3, sr); this.nz = rng(this.seed ^ 0x5eed);
    // static and surprises
    this.stat = null; this.statNext = r.range(this.p.stat.every) * sr; this.statLast = -1e12;
    this.sur = null; this.surNext = (this.p.surprise.first + r.range([0, 300])) * sr; this.surLast = '';
    this.duck = 1; this.duckTo = 1; this.land = null;
    const I = this.p.intensity, st = I.states[I.first], lv = r.range(st.level);
    this.int = { name: I.first, v: lv, from: lv, to: lv, at: 0, glide: 1, until: r.range(st.holdS) * sr };
    // master EQ: a 4 dB high shelf cut from 3 kHz, low pass 6 kHz, high pass 40 Hz, +2 dB under 150 Hz
    this.eq = [0, 1].map(() => ({ lp3: new BQ().set('lp', 3000, 0.6, sr), lp6: new BQ().set('lp', 6000, 0.7, sr), hp: new BQ().set('hp', 40, 0.7, sr), lp150: new BQ().set('lp', 150, 0.7, sr) }));
    this.ins = Array.from({ length: 4 }, () => new Float32Array(QUANTUM)); this.out = new Int16Array(0);
  }
  setBedLp() { for (const [i, f] of this.bedLp.entries()) f.set('lp', this.bedLpHz, i % 2 ? 0.54 : 1.31, SR); }

  async boot(bootSync, vendor) {
    const defs = [compile(DRY, { name: 'sdry', bus: MIX_BUS }), compile(REV, { name: 'srev', bus: MIX_BUS }),
      compile(masterProgram(MIX_BUS, { ...MASTER, ...SIG_MASTER, ...this.p.master }), { name: 'smst' })];
    for (const d of defs) if (!d.ok) throw new Error(`a SynthDef did not compile: ${d.message}`);
    const w = this.w = await bootSync({ ...vendor, inputs: 4, sr: SR, log: (l) => this.log(`wasm: ${l}`) });
    const boot = async (p) => { let r; p.then((x) => { r = x; }); for (let i = 0; i < 4000 && r === undefined; i++) { w.quantum((c, b) => b.fill(0)); if (i % 8 === 7) await new Promise((s) => setTimeout(s, 0)); } return r; };
    const done = (cmd) => (m) => (m[0] === '/done' && m[1] === cmd) || m[0] === '/fail';
    if ((await boot(w.ask(done('/notify'), 3000, '/notify', 1)))?.[0] !== '/done') throw new Error('wasm scsynth did not answer /notify');
    for (const d of defs) { const a = await boot(w.ask(done('/d_recv'), 5000, '/d_recv', d.bytes)); if (a?.[0] !== '/done') throw new Error(`scsynth refused ${d.name}: ${a ? a.join(' ') : 'no answer'}`); }
    w.send('/s_new', 'sdry', NODE.dry, 1, 0); w.send('/s_new', 'srev', NODE.rev, 1, 0); w.send('/s_new', 'smst', NODE.mst, 1, 0);
    return this;
  }

  // ── takes ──
  // A stretch of the ring at an onset, with its talk and hiss measures; null when nothing passes. `prefer` weighs talk.
  take(seconds, { speech = 1, recent = 1 } = {}) {
    const r = this.r, need = Math.round(seconds * 100), span = need + 3;
    const last = Math.floor(this.ring.w / this.grid) - 2, first = Math.ceil(this.ring.from / this.grid);
    if (last - first < span + 3) return null;
    const cands = [];
    for (let k = 0; k < 8; k++) {
      const lo = r.chance(recent * 0.5) ? Math.max(first, last - span - 3000) : first, hi = last - span - 50;
      if (hi <= lo) continue;
      const c = lo + Math.floor(r.next() * (hi - lo));
      const s = findStart(this.ring.cellsOf(c, Math.min(last, c + 200 + span)), span, 200, this.p.gateDb);
      if (s < 0) continue;
      const x = { c: c + s, speech: this.ring.speech(c + s, c + s + span), noise: this.ring.noise(c + s, c + s + span) };
      if (x.noise >= 0.5) { this.counts.passed++; continue; }   // hiss never goes in the bed or the echoes
      cands.push(x);
    }
    if (!cands.length) return null;
    const wt = (x) => 1 - x.speech * (1 - speech) + 1e-3;
    let u = r.next() * cands.reduce((a, x) => a + wt(x), 0), pick = cands[0];
    for (const x of cands) { u -= wt(x); if (u <= 0) { pick = x; break; } }
    const f0 = pick.c * this.grid, data = this.ring.mono(f0, need * this.grid);
    let ss = 0; for (let i = 0; i < data.length; i += 4) { const v = data[i] / 32768; ss += v * v; }
    const rms = Math.sqrt(ss / (data.length / 4)) + 1e-9;
    this.counts.takes++;
    return { id: ++this.tid, data, gain: Math.min(3, 0.1 / rms), speech: pick.speech, noise: pick.noise, wall: this.now() - (this.ring.w - f0) / SR * 1000, len: data.length };
  }

  // ── intensity ──
  intStep() {
    const I = this.p.intensity, n = this.int, t = this.t, r = this.r, sr = SR;
    const x = (t - n.at) / n.glide; n.v = n.from + (n.to - n.from) * fade(x);
    if (t < n.until) return;
    const name = r.pick(I.states[n.name].next), st = I.states[name];
    Object.assign(n, { name, from: n.v, to: r.range(st.level), at: t, glide: r.range(I.glideS) * sr });
    n.until = t + n.glide + r.range(st.holdS) * sr;
    this.events.push({ t: t / sr, kind: `intensity ${name}` }); this.log(`intensity: ${name}`);
  }

  // ── the bed: long takes, grained ──
  bedStep() {
    const P = this.p.bed, r = this.r, t = this.t, sr = SR;
    for (const v of this.bed) if (!v.out && t >= v.endAt) v.out = t;
    this.bed = this.bed.filter((v) => !v.out || t < v.out + v.fade);
    if (t >= this.bedNext && this.bed.filter((v) => !v.out).length < (this.int.v < 0.3 ? 1 : P.voices)) {
      const heard = this.ring.w / sr, s = Math.min(r.range(P.takeS), Math.max(6, heard - 4));
      const tk = heard > 10 ? this.take(s, { speech: P.speech }) : null;
      if (tk) {
        const fadeS = r.range(P.fadeS);
        this.bed.push({ tk, at: t, fade: fadeS * sr, endAt: t + r.range(P.life) * sr, out: 0, pos: r.next() * tk.len, drift: 1 / r.range(P.stretch) * (r.chance(0.3) ? -1 : 1),
          grains: [], gNext: t, density: r.range(P.density), gS: P.grainS, norm: 0, rate: tk.speech < 0.3 && r.chance(0.2) ? 0.5 : 1, pan: r.range([-0.5, 0.5]) });
        { const v = this.bed.at(-1); v.norm = Math.sqrt(2.3 / (v.density * (P.grainS[0] + P.grainS[1]) / 2)); }   // as loud as 12 short grains a second were
        this.bedNext = t + r.range([P.fadeS[0], P.life[0]]) * sr * (this.bed.length < 2 ? 0.4 : 1);
        if (r.chance(0.3)) { this.bedLpHz = r.range(P.lp); this.setBedLp(); }
      } else this.bedNext = t + 3 * sr;
    }
  }
  bedSample(v, t) {
    const sr = SR, r = this.r, tk = v.tk;
    if (t >= v.gNext) {
      const len = Math.round(r.range(v.gS) * sr), j = this.p.bed.jitterS, at = (v.pos + r.range([-j, j]) * sr + tk.len * 4) % tk.len;
      v.grains.push({ at, len, i: 0, pan: Math.max(-1, Math.min(1, v.pan + r.range([-0.5, 0.5]))), rate: v.rate * (1 + r.range([-0.004, 0.004])) });
      v.gNext = t + Math.round(sr / v.density * r.range([0.6, 1.4]));
    }
    v.pos = (v.pos + v.drift + tk.len) % tk.len;
    const env = Math.min(fade((t - v.at) / v.fade), v.out ? 1 - fade((t - v.out) / v.fade) : 1) * tk.gain * v.norm;
    let l = 0, rr = 0;
    for (let k = v.grains.length - 1; k >= 0; k--) {
      const g = v.grains[k], p = g.at + g.i * g.rate, j = Math.floor(p) % tk.len, x = tk.data[j] / 32768 * hann(g.i / g.len);
      l += x * (1 - g.pan) * 0.5; rr += x * (1 + g.pan) * 0.5;
      if (++g.i >= g.len) v.grains.splice(k, 1);
    }
    return [l * env, rr * env];
  }

  // ── the echoes: a phrase thrown into a ping-pong delay ──
  echoStep() {
    const P = this.p.echo, r = this.r, t = this.t, sr = SR;
    if (t < this.throwNext || this.throw) return;
    if (this.int.v < 0.25 && !this.forceSwell) { this.throwNext = t + 5 * sr; return; }   // no throws at rest
    const tk = this.take(r.range(P.takeS), { speech: 1, recent: 1.5 });
    if (!tk) { this.throwNext = t + 3 * sr; return; }
    const swell = r.chance(P.swell) || this.forceSwell;
    const life = (swell ? r.range([10, 25]) : r.range(P.lifeS)) * sr;
    this.dly = r.range(P.delay) * sr;
    const bp = r.range(P.bp); for (const f of this.fbBp) f.set('bp', bp, 1, sr);
    this.throw = { tk, i: 0, at: t, life, fb0: swell ? r.range([0.88, 0.94]) : r.range(P.fb), swell, side: r.chance(0.5) ? 0 : 1, hold: swell ? r.range([0.4, 0.7]) : 0 };
    this.forceSwell = false;
    this.counts.throws++; if (swell) this.counts.swells++;
    this.events.push({ t: t / sr, kind: swell ? 'swell' : 'throw', delay: +(this.dly / sr).toFixed(2), take: tk.id });
    this.throwNext = t + life + r.range(P.every) * (1.6 - this.int.v) * sr;
  }
  echoSample(t) {
    const th = this.throw, n = this.dn;
    let inL = 0, inR = 0;
    if (th) {
      const x = (t - th.at) / th.life;
      this.fb = x >= 1 ? this.fb * 0.99999 : x < th.hold ? th.fb0 : th.fb0 + (0.25 - th.fb0) * ((x - th.hold) / (1 - th.hold));
      if (th.i < th.tk.len) {
        const e = Math.min(1, th.i / 220, (th.tk.len - th.i) / 220), s = th.tk.data[th.i++] / 32768 * th.tk.gain * e;
        if (th.side) inR = s; else inL = s;
      }
      if (x >= 1.3) this.throw = null;
    } else this.fb *= 0.99998;
    const d = this.dly * (1 + 0.004 * Math.sin(this.wow + TAU * 0.13 * t / SR)), rp = this.dw - d + n * 2, i0 = Math.floor(rp), fr = rp - i0;
    const yl = this.dl[i0 % n] * (1 - fr) + this.dl[(i0 + 1) % n] * fr, yr = this.dr[i0 % n] * (1 - fr) + this.dr[(i0 + 1) % n] * fr;
    // ping-pong: each side feeds the other, through the band pass, gently saturated
    this.dl[this.dw % n] = inL + Math.tanh(this.fbBp[0].run(yr) * this.fb * 1.2) / 1.2;
    this.dr[this.dw % n] = inR + Math.tanh(this.fbBp[1].run(yl) * this.fb * 1.2) / 1.2;
    this.dw++;
    return [yl + inL * 0.5, yr + inR * 0.5];
  }

  // ── signals: keying that grows into a modular pattern ──
  hourStep() {
    const h = Math.floor(this.now() / 3600000);
    if (h !== this.hour) { this.hour = h; const r = rng(this.seed ^ h); this.scale = r.pick(SCALES); this.root = r.range([196, 262]); }
  }
  phraseStep() {
    const P = this.p.signal, r = this.r, t = this.t, sr = SR;
    if (!this.phrase && t >= this.phraseNext) {
      let u = r.next(), max = 1; for (let k = 0; k < 4; k++) { u -= P.stage[k]; if (u <= 0) { max = k + 1; break; } }
      if (this.forceDry) max = Math.max(max, 2);
      const len = r.range(P.lenS) * sr, dot = r.range(P.dot) * sr, f = r.range(P.pitch);
      // the pattern a locked phrase repeats: dots and dashes, 1 and 3 steps, with gaps
      const pat = []; const steps = r.int(12, 20); let k = 0;
      while (k < steps) { const on = r.chance(0.55) ? 1 : 3; pat.push({ k, on, deg: r.int(0, 9) }); k += on + (r.chance(0.3) ? 3 : 1); }
      const clear = Math.min(len * 0.4, r.range(P.clearS) * sr), clearAt = t + r.range([0.35, 0.55]) * (len - clear);
      this.phrase = { at: t, len, max, dot, f, pan: r.range([-0.6, 0.6]), next: t, pat, steps: k, step: 0, dry: !!this.forceDry, clear, clearAt, flut: r.range([2.5, 7]), flP: r.next() * TAU };
      this.sigBp.set('bp', f, 3, sr);
      this.forceDry = false;
      this.counts.phrases++; this.counts.stages[max - 1]++;
      this.events.push({ t: t / sr, kind: 'phrase', stages: max });
    }
    const ph = this.phrase; if (!ph) return;
    const x = (t - ph.at) / ph.len;
    if (x >= 1) { this.phrase = null; this.phraseNext = t + r.range(P.every) * sr; return; }
    if (t < ph.next) return;
    const stage = Math.min(ph.max, 1 + Math.floor(x * (ph.max + 0.6)));
    ph.stage = stage;
    const thin = x > 0.8 ? (x - 0.8) / 0.2 : 0;   // the end thins back to a few dots
    if (stage === 1) {   // free keying: morse-like, no message
      const on = r.chance(0.55) ? 1 : 3, gap = r.chance(0.25) ? (r.chance(0.3) ? 7 : 3) : 1;
      if (!r.chance(thin)) this.notes.push({ t0: t, dur: on * ph.dot, f: ph.f * (1 + r.range([-0.002, 0.002])), kind: 'key', amp: 1, pan: ph.pan, ph: 0, dry: ph.dry, phr: ph });
      ph.next = t + (on + gap) * ph.dot;
    } else {   // locked to a clock: the pattern, stepping in pitch from stage 3, pinged and answered at 4
      const unit = ph.dot * 1.6, s = ph.step % ph.steps, hit = ph.pat.find((p) => p.k === s);
      if (hit && !r.chance(thin)) {
        if (stage >= 4 && r.chance(0.12)) hit.deg = r.int(0, 9);   // small mutations
        const deg = hit.deg, f = stage >= 3 ? this.root * 2 ** ((this.scale[deg % 5] + 12 * Math.floor(deg / 5)) / 12) * 2 : ph.f;
        const kind = stage >= 3 ? 'ping' : 'key';
        this.notes.push({ t0: t, dur: hit.on * unit, f, kind, amp: 1, pan: ph.pan, ph: 0, decay: r.range([0.15, 0.6]) * SR, dry: ph.dry, dub: stage >= 3, phr: ph });
        if (stage >= 4 && r.chance(0.5)) this.notes.push({ t0: t + unit * r.int(1, 2), dur: unit, f: f * (r.chance(0.5) ? 1.5 : 2), kind, amp: 0.6, pan: -ph.pan, ph: 0, decay: r.range([0.1, 0.4]) * SR, dry: ph.dry, dub: true, phr: ph });
      }
      ph.step++; ph.next = t + unit;
    }
  }
  pipsStep() {
    const ms = this.now(), s = Math.floor(ms / 1000), m = Math.floor(s / 60) % 60, sec = s % 60;
    if (!((m === 59 || m === 29) && sec >= 55) && !((m === 0 || m === 30) && sec === 0)) return;
    if (this.pipsDone === s) return; this.pipsDone = s;
    const long = sec === 0;
    this.notes.push({ t0: this.t, dur: (long ? 0.5 : 0.1) * SR, f: 1000, kind: 'pip', amp: 1, pan: 0, ph: 0 });
    if (long) { this.counts.pips++; this.events.push({ t: this.t / SR, kind: 'pips' }); }
  }
  // how near a phrase is: mostly far, up to clear for `clear` frames, then away (squared, so the far part is faint)
  phraseEnv(ph, t) {
    if (!ph || ph.dry) return 1;
    const up = (t - ph.at) / (ph.clearAt - ph.at), down = (ph.at + ph.len - t) / (ph.at + ph.len - ph.clearAt - ph.clear);
    const e = t < ph.clearAt ? fade(up) : t < ph.clearAt + ph.clear ? 1 : fade(down);
    return e * e;
  }
  noteSample(t) {
    const P = this.p.signal; let l = 0, rr = 0, wl = 0, wr = 0, dub = 0;
    for (let k = this.notes.length - 1; k >= 0; k--) {
      const nt = this.notes[k], i = t - nt.t0;
      if (i < 0) continue;
      let e;
      if (nt.kind === 'ping') { e = Math.exp(-i / nt.decay); if (i > nt.decay * 7) { this.notes.splice(k, 1); continue; } }
      else { const a = 0.005 * SR; e = Math.min(1, i / a, Math.max(0, (nt.dur - i) / a)); if (i >= nt.dur) { this.notes.splice(k, 1); continue; } }
      nt.ph += TAU * nt.f / SR;
      const x = (nt.kind === 'ping' ? Math.sin(nt.ph) + 0.25 * Math.sin(2 * nt.ph) * e : Math.sin(nt.ph)) * e * nt.amp * (nt.kind === 'pip' ? this.p.pips.gain / P.gain : 1);
      const g = P.gain * (nt.dry ? 1.6 : 1) * this.phraseEnv(nt.phr, t);
      l += x * g * (1 - nt.pan) * 0.5; rr += x * g * (1 + nt.pan) * 0.5;
      const sendk = nt.kind === 'pip' ? 0.9 : nt.dry ? 0.1 : P.rev;
      wl += x * g * sendk * 0.5; wr += x * g * sendk * 0.5;
      if (nt.dub) dub += x * g * 1.5;
    }
    // a far signal is not clean: it flutters, and a band of noise rides with it, as near as it is
    const ph = this.phrase;
    if (ph && !ph.dry) {
      const e = this.phraseEnv(ph, t), s = t / SR;
      const fl = 0.65 + 0.35 * Math.sin(ph.flP + TAU * ph.flut * s) * Math.sin(ph.flP * 1.7 + TAU * 0.6 * s);
      l *= fl; rr *= fl;
      const nz = this.sigBp.run(this.nz.next() * 2 - 1) * P.gain * P.dirt * 1.5 * Math.sqrt(e);
      l += nz * (1 - ph.pan) * 0.5; rr += nz * (1 + ph.pan) * 0.5;
    }
    return [l, rr, wl, wr, dub];
  }

  // ── static, on purpose ──
  statStep() {
    const P = this.p.stat, r = this.r, t = this.t, sr = SR;
    if (this.stat || t < this.statNext) return;
    if (this.int.v < 0.35) { this.statNext = t + 10 * sr; return; }
    const kind = r.pick(['sweep', 'sweep', 'crackle', 'hiss']), len = (kind === 'sweep' ? r.range([1, 3]) : kind === 'crackle' ? r.range([0.5, 2]) : r.range([2, 6])) * sr;
    const f0 = r.range([400, 2500]), f1 = r.range([400, 2500]);
    this.stat = { kind, at: t, len, f0, f1, bp: new BQ(), hp: new BQ().set('hp', 1500, 0.7, sr), lp: new BQ().set('lp', 3200, 0.7, sr), ph: 0, cr: 0, pan: r.range([-0.5, 0.5]) };
    this.counts.static++; this.events.push({ t: t / sr, kind: `static ${kind}` });
    this.statNext = t + Math.max(P.apart, r.range(P.every)) * sr;
  }
  statSample(t) {
    const s = this.stat; if (!s) return 0;
    const x = (t - s.at) / s.len; if (x >= 1) { this.stat = null; return 0; }
    const r = this.r, env = Math.sin(Math.PI * x) ** 0.7, n = r.next() * 2 - 1;
    let y;
    if (s.kind === 'sweep') {
      const f = s.f0 * (s.f1 / s.f0) ** x;
      if ((t & 63) === 0) s.bp.set('bp', f, 3, SR);
      s.ph += TAU * (f + 400 * Math.sin(TAU * 3 * x)) / SR;
      y = s.bp.run(n) * 2 + 0.25 * Math.sin(s.ph) * (0.5 + 0.5 * Math.sin(TAU * 7 * x));
    } else if (s.kind === 'crackle') { s.cr = r.chance(0.0015) ? r.range([-1, 1]) : s.cr * 0.93; y = s.hp.run(s.cr) * 2; }
    else y = s.lp.run(n) * 0.6;
    return y * env * this.p.stat.gain;
  }

  // ── surprise ──
  surStep() {
    const r = this.r, t = this.t, sr = SR;
    if (this.sur && t >= this.sur.end) { this.sur = null; this.duckTo = 1; }
    if (this.sur || t < this.surNext) return;
    let kind = r.pick(['land', 'drop', 'swell', 'old', 'key'].filter((k) => k !== this.surLast));
    const sur = { kind, at: t, end: t };
    if (kind === 'land') {
      const tk = this.take(r.range([4, 10]), { speech: 1, recent: 1.5 });
      if (!tk) kind = sur.kind = 'swell'; else { this.land = { tk, i: 0, hp: new BQ().set('hp', 150, 0.7, sr), lp: new BQ().set('lp', 5000, 0.7, sr) }; sur.end = t + tk.len + 2 * sr; this.duckTo = 0.2; }
    }
    if (kind === 'drop') { sur.end = t + r.range([10, 20]) * sr; this.duckTo = 0; this.phrase = null; this.phraseNext = t + 1.5 * sr; this.forceDry = true; }
    if (kind === 'swell') { this.throw = null; this.throwNext = t; this.forceSwell = true; sur.end = t + 2 * sr; }
    if (kind === 'old') {
      // the oldest part of the ring, slowed a little, as a bed voice
      const heard = Math.min(this.ring.w, this.ring.n) / sr;
      if (heard > 120) { const v = this.bed.find((x) => !x.out); if (v) v.endAt = t; this.bedNext = t; this.oldNext = true; }
      sur.end = t + 2 * sr;
    }
    if (kind === 'key') { const rk = rng(this.seed ^ t); this.scale = rk.pick(SCALES); this.root *= 2 ** (rk.pick([5, 7, -5, 3]) / 12); sur.end = t + sr; }
    this.sur = sur; this.surLast = kind; this.counts.surprises++;
    this.events.push({ t: t / sr, kind: `surprise ${kind}` });
    this.surNext = t + r.range(this.p.surprise.every) * sr;
  }
  landSample() {
    const L = this.land; if (!L) return 0;
    const tk = L.tk; if (L.i >= tk.len) { this.land = null; this.duckTo = this.sur?.kind === 'land' ? 1 : this.duckTo; return 0; }
    const e = Math.min(1, L.i / (0.8 * SR), (tk.len - L.i) / (1.2 * SR));
    return L.lp.run(L.hp.run(tk.data[L.i++] / 32768)) * tk.gain * e * 0.9;
  }

  render(frames) {
    const q = Math.ceil(frames / QUANTUM), need = q * QUANTUM * 2, sr = SR, W = this.p.waves;
    if (this.out.length < need) this.out = new Int16Array(need);
    const o16 = this.out, [dl, dr, wl, wr] = this.ins;
    let o = 0;
    for (let k = 0; k < q; k++) {
      this.intStep(); this.hourStep(); this.bedStep(); this.echoStep(); this.phraseStep(); this.pipsStep(); this.statStep(); this.surStep();
      if (this.oldNext && this.bed.length && this.bed.at(-1).at === this.t) { this.bed.at(-1).rate = 0.94; this.oldNext = false; }
      // the notch moves once a quantum
      const nf = W.notch[0] * (W.notch[1] / W.notch[0]) ** (0.5 + 0.5 * Math.sin(this.notchP + TAU * this.t / sr / this.notchS));
      for (const f of this.notch) f.set('bp', nf, 2, sr);
      for (let i = 0; i < QUANTUM; i++) {
        const t = this.t + i, s = t / sr;
        this.duck += (this.duckTo - this.duck) * 0.00005;
        // the bed
        let bl = 0, br = 0;
        for (const v of this.bed) { const [a, b] = this.bedSample(v, t); bl += a; br += b; }
        bl = this.bedLp[1].run(this.bedLp[0].run(this.bedHp[0].run(bl))); br = this.bedLp[3].run(this.bedLp[2].run(this.bedHp[1].run(br)));
        const ig = 0.3 + 0.7 * this.int.v;   // the bed about 10 dB down at rest
        bl *= this.p.bed.gain * ig; br *= this.p.bed.gain * ig;
        // the signals, some into the dub
        const [nl, nr, nwl, nwr, dub] = this.noteSample(t);
        if (this.throw === null && dub) { /* a ping reaches the delay even between throws */ }
        const [el0, er0] = this.echoSample(t);
        if (dub) { this.dl[(this.dw - 1) % this.dn] += dub * 0.3; }
        const el = el0 * this.p.echo.gain, er = er0 * this.p.echo.gain;
        // waves: fading and the sweeping notch over the bed and the echoes
        const fd = 0.5 + 0.25 * Math.sin(this.fadeP[0] + TAU * s / this.fadeP[2]) + 0.25 * Math.sin(this.fadeP[1] + TAU * s / this.fadeP[3]);
        const fg = 10 ** (-(W.fadeDb[0] + (W.fadeDb[1] - W.fadeDb[0]) * fd) / 20) * this.duck;
        const far = this.phrase?.dry ? 0 : 1;
        let ml = (bl + el + nl * far) * fg, mr = (br + er + nr * far) * fg;
        ml -= W.notchDepth * this.notch[0].run(ml); mr -= W.notchDepth * this.notch[1].run(mr);
        const st = this.statSample(t), ld = this.landSample();
        let L = ml + nl * (1 - far) + st + ld, R = mr + nr * (1 - far) + st * 0.8 + ld;
        // master EQ
        const e0 = this.eq[0], e1 = this.eq[1];
        L = e0.hp.run(L); L = L - 0.37 * (L - e0.lp3.run(L)); L = e0.lp6.run(L) + 0.26 * e0.lp150.run(L);
        R = e1.hp.run(R); R = R - 0.37 * (R - e1.lp3.run(R)); R = e1.lp6.run(R) + 0.26 * e1.lp150.run(R);
        dl[i] = L * TRIM; dr[i] = R * TRIM;
        wl[i] = ((bl * this.p.bed.rev + el * this.p.echo.rev) * fg + nwl) * TRIM; wr[i] = ((br * this.p.bed.rev + er * this.p.echo.rev) * fg + nwr) * TRIM;
      }
      const ins = this.ins;
      this.onQuantum?.(ins);
      const y = this.w.quantum((c, b) => b.set(ins[c]));
      const Lo = y[0], Ro = y[1];
      for (let i = 0; i < QUANTUM; i++) {
        const l = Lo[i] * 32767, r = Ro[i] * 32767;
        o16[o++] = l > 32767 ? 32767 : l < -32768 ? -32768 : Math.round(l);
        o16[o++] = r > 32767 ? 32767 : r < -32768 ? -32768 : Math.round(r);
      }
      this.t += QUANTUM;
    }
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    return this.out.subarray(0, need);
  }

  setPreset() { return false; }
  edit() { return false; }
  clear() { this.bed = []; this.ring.clear(); }

  /** What it is doing: run.mjs's status line and title read `loops` as Mem's; `layers` is this engine's own. */
  status() {
    const t = this.t, sr = SR;
    const loops = this.bed.filter((v) => !v.out).map((v, i) => ({ player: i + 1, take: v.tk.id, len: +(v.tk.len / sr).toFixed(1), pos: +(v.pos / sr).toFixed(1), pass: 0, rate: v.rate, frozen: false, a: 0, d: 1, wall: v.tk.wall, speech: +v.tk.speech.toFixed(2) }));
    const ph = this.phrase;
    return { t: +(t / sr).toFixed(1), preset: 'signals', seed: this.seed, players: loops.length, want: this.p.bed.voices, mood: `${this.int.name} ${this.int.v.toFixed(2)}${ph ? `, signal ${ph.stage ?? 1}/${ph.max}` : ''}`, resting: 0, counts: { ...this.counts }, loops,
      layers: { bed: loops.length, throw: this.throw ? { delay: +(this.dly / sr).toFixed(2), fb: +this.fb.toFixed(2), swell: this.throw.swell } : null, phrase: ph ? { stage: ph.stage ?? 1, max: ph.max, f: Math.round(ph.f) } : null,
        notes: this.notes.length, static: this.stat?.kind ?? null, surprise: this.sur?.kind ?? null, duck: +this.duck.toFixed(2), bedLp: Math.round(this.bedLpHz) },
      events: this.events.slice(-20) };
  }
}
