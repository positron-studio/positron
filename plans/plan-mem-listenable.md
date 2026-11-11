# MEM listenable on v2in: how much is the medium

Asked 2026-11-11: *"make plan to make it listenable. or is just nature of medium?"*, then *"we can not control
input material. it will be interviews, modular loops, AM scans..."* and *"listen stream 10min"*.

Nothing here is deployed, committed or pushed. The repository files `demo/shell/mem.mjs` and
`demo/shell/mem-presets.json` are unchanged; every candidate ran from a scratch copy of v2in's engine
(`server/engines/mem/`, byte for byte positron's, `mem-sync --check` read `same` for all four files).

## Verdict

**About half the problem is the medium and about half is MEM, and the half that is MEM is fixable without
choosing material.** MEASURED:

- **The medium.** The 36 AM recordings in v2in's `huddersfield` folder are **47.9 % broadband hiss by duration**
  (1 s windows whose spectral flatness, 200 Hz to 4 kHz, is over 0.3), 12,050 s measured. Nine files are over
  80 % hiss and `kiwi-m7gmg-night-1035` is 98.7 %: there is no programme in it to loop. When the last five
  minutes MEM can hear are hiss, every take is hiss, and no engine choice changes that. That is the floor.
- **MEM roughly doubles it.** The same 20 minutes of AM in and out (feed A, below): source **31.8 %** hiss,
  current MEM **58.3 %**. A mixed feed (speech, AM, modular) of **27.5 %** hiss comes out at **64.6 %**. The
  2 to 5 kHz share of the power (harshness) goes from **0.09 in the source to 0.37** out, the centroid from
  1050 Hz to 1689 Hz.
- **The live stream says the same.** The coordinator's 10 minute recording of the mem mount
  (`live-mem-10min.mp3`, what listeners heard): **50.1 % hiss**, -16.9 LUFS, LRA 5.4, centroid 1104 Hz,
  harshness 0.19, minutes 1 to 5 at 68 to 95 % hiss and minute 5 at harshness 0.63. The last three minutes are
  0 % hiss, so the input changed then (what it was is not known: no stream was opened to find out).
- **Speech and modular input are not the problem.** On a synthetic interview and a synthetic modular loop
  the current MEM gives **0 % hiss, harshness 0.04 and 0.001**. The listenability problem is hiss, and only
  on input that carries hiss.

Why MEM doubles it, from reading `mem.mjs` and confirmed by the renders:

1. **Talk weighted down picks hiss.** `takes.speech` 0.2 weights talk to a fifth and passes 80 % of talk picks
   over outright, and a non-talk take replaces playing talk loops. On AM the non-talk candidates are mostly
   hiss (it has no syllabic swing), so the rule built to remove voices selects hiss. Alone, `speech` 0.6
   brings feed A from 58 % to 46 %.
2. **Hiss is always above the gate.** `findStart` keeps any stretch over -38 dB with sound in most cells.
   Continuous hiss always passes; speech with pauses sometimes does not.
3. **Hiss stays.** 40 % of loops live 5 to 15 minutes (`takes.stay`), so a hiss loop taken at minute 2 is
   still playing at minute 10, after the input went clean. MEASURED feed A minutes 7 to 10: source 5 to 8 %
   hiss, MEM 40 to 93 %.
4. **The colour takes the body away and keeps the hiss band.** High pass 80 to 400 Hz (the high slot 400 to
   900) and home bands 250 Hz to 3.2 kHz at -9 dB floor remove where AM programme energy is (under 1 kHz) and
   keep 2 to 5 kHz, where AM hiss is as loud as anything. Alone, lower high passes and a -4 dB floor bring
   harshness from 0.37 to 0.29.
5. **Five loops summed.** Uncorrelated loops sum toward flat; the `fewer` candidate (3 players) measured
   35 % hiss on feed A but no better on the mixed feed (57 %), and it is a change of character, so it is not
   proposed.

## What was rendered and how it was measured

All renders: `node server/engines/mem/run.mjs --render <feed> --seconds 1200 --preset colours --seed 1`,
20 minutes each, 20 to 35 s wall per render on this Mac. 32 renders in all.

Feeds (no download, nothing from anybody's server):

| feed | what | source hiss | made from |
| --- | --- | --- | --- |
| A | AM scan | 31.8 % | v2in `server/media/huddersfield`, shuffled with seed 7 like Liquidsoap's randomize: mw-1368, 49m-5980, southport-558, lf-77.5, night-1296 |
| Speech | interview | 0.3 % | macOS `say`, two voices (Daniel, Samantha) alternating, pink room tone at -50 dB |
| Modular | synth loops | 0 % | ffmpeg `aevalsrc`: FM sequences at 4 tempos and keys, kick, hat, slow drone |
| Mixed | all three | 27.5 % | speech 4 min, night-1035 (pure hiss) 4 min, modular 4, southport-963 2, speech 4, 49m-5860 4, modular 4 |

Measures (`measure.mjs`, Node, own FFT, no Python): ffmpeg `ebur128` for LUFS, LRA and true peak; per 100 ms
centroid, flatness, 2 to 5 kHz share of power, L/R correlation; each 1 s window classed silence (under -50 dB),
tone (flatness under 0.08 with the peak bin steady in 8 of 10 frames), hiss (flatness over 0.3) or content;
level jumps over 6 dB within 200 ms per minute (a stutter proxy; speech and drums make many by nature).

## The candidates, measured

Hiss share of 1 s windows, then harshness (2 to 5 kHz share), centroid, loudness:

| engine | A (AM) | Mixed | Speech | Modular | note |
| --- | --- | --- | --- | --- | --- |
| source | 31.8 %, 0.09, 1050 Hz | 27.5 %, 0.08 | 0.3 % | 0 % | |
| **now** | **58.3 %, 0.37, 1689 Hz, -15.7** | **64.6 %, 0.29** | 0 %, 0.04, -18.5 | 0 %, 0.001, -21.4 | |
| noise (hiss weighted 0.15) | 54.3 %, 0.34 | 48.5 %, 0.27 | same as now | same as now | selection alone is not enough |
| talkok (speech 0.6) | 45.8 %, 0.33 | 48.0 %, 0.22 | 0 %, 0.05 | 0 % | |
| body (hp 40 to 150, floor -4) | 48.7 %, 0.29, 1373 Hz | 63.5 %, 0.25 | 0 %, 0.03 | 0 % | |
| fewer (3 players) | 35.2 %, 0.31 | 57.2 %, 0.36 | 0 % | 0 % | refused, see below |
| denoise (afftdn on intake) | 26.4 %, 0.37 | 64.1 %, 0.29 | 0 % | 0 % | helps AM with programme, nothing on pure hiss |
| calm (noise + talkok + hiss leaves) | 22.8 %, 0.20, 1248 Hz, -17.7 | 9.3 %, 0.16 | 0 %, 0.05 | 0 % | a 25 s gap on A |
| calm2 (calm + guard) | 38.4 %, 0.23 | 9.3 %, 0.16 | 0 %, 0.05 | 0 % | no gap |
| **calm2b (calm2 + body)** | **25.3 %, 0.18, 1087 Hz, -17.0** | **7.2 %, 0.11, 769 Hz** | 0 %, 0.03, -16.9 | 0 %, 0.000, -19.7 | **proposed** |
| calmdn (calm + denoise) | 20.1 %, 0.19 | 9.6 %, 0.12 | 0 % | 0 % | small gain over calm |

What each named change is:

- **noise**: a hiss measure beside the talk measure. Twelve 512 sample frames across a candidate, median
  spectral flatness 200 Hz to 4 kHz, mapped 0.2 to 0 and 0.35 to 1 (`noiseOfFrames`). Candidates are weighted
  by `takes.noise` the way talk is weighted by `takes.speech`, and a hiss pick is passed over at the same odds.
- **hiss leaves**: a hiss take never `stay`s, lives half as long, plays up to 4.4 dB down, and when a take that
  is not hiss arrives, the hiss loops playing are replaced within 5 to 25 s (the same rule talk already has).
- **guard**: hiss is passed over only while two or more loops sound, so passing it over never leaves the room
  empty. `calm` without it had a 25 s stretch under -45 dB on A at 436 s (thin mood, one loop leaving, hiss
  refused); `calm2` has none longer than 1 s.
- **body**: `colour.hp` 80 to 400 to 40 to 150, mid slot 100 to 350 to 40 to 150, high slot 400 to 900 to 150 to
  400, `bands.floor` -9 to -4. Low passes unchanged, so the brightness the kcmd comparison asked for stays.
- **talkok**: `takes.speech` 0.2 to 0.6.

**calm2b on the worst minute.** `now` on feed A at 630 s reads 71.7 % hiss and harshness 0.47; the same minute
in calm2b reads 3.3 % and 0.06 (the source there is 23 %). The mixed feed at 360 s (pure hiss coming in): now
100 %, calm2b 0 %. Where the ring holds only hiss (feed A at 120 s, source 70 % hiss), calm2b still reads 32 %:
that is the medium.

**Cost.** calm2b rendered 20 minutes in 20.5 s against now's 21.3 s; the hiss measure is 12 FFTs of 512 per
candidate, about 156 per take. Unmeasured on the worker and phone hosts, but small against `speechOf`.

## Ranked plan

1. **Hiss aware takes with the guard, hiss leaves, talk at 0.6** (`mem.mjs` and `takes.noise` 0.1,
   `takes.speech` 0.6). The biggest effect: mixed 64.6 to 9.3 %, AM 58.3 to 38.4 % (to 22.8 % without the guard,
   at the cost of a gap). No effect on speech or modular input beyond what `speech` 0.6 does.
2. **Body** (preset only). Harshness 0.23 to 0.18 on AM, 0.16 to 0.11 on mixed; centroid down about 270 Hz.
3. **Intake denoise in v2in `run.mjs`** (`-af afftdn=nr=15:nf=-40:tn=1` on the input ffmpeg). Optional: 22.8
   to 20.1 % on AM and nothing on pure hiss. It is v2in's own file, not the shared engine, so positron's lab
   would not hear it. Worth it only if the owner hears a difference in `calmdn` vs `calm`.

## Listen first (A/B, 60 s each)

Folder: `/private/tmp/claude-501/-Users-s32863-personal-positron/659afcc9-23dc-4e8b-9117-b11a4501b49b/scratchpad/mem/listen/`
(scratch, a temporary directory: copy it if it is to be kept). Same minute, same seed, the name says the feed,
the second into the render and the engine:

- `0-live-295s-now-onair.mp3`: the live stream's worst minute (93 % hiss, harshness 0.63)
- `1-am-630s-{source,now,calm,calm2,calm2b,calmdn}.mp3`: now's worst AM minute
- `2-am-120s-{source,now,calm,calm2,calm2b,calmdn}.mp3`: a minute where the ring holds mostly hiss (the medium)
- `3-mixed-360s-{now,calm,calm2,calmdn,calm2b}.mp3`: pure hiss arriving after speech
- `4-speech-300s-{now,calm2,calm2b}.mp3` and `5-modular-300s-{now,calm2,calm2b}.mp3`: nothing should get worse

Whole 20 minute renders: `…/scratchpad/mem/out/<engine>-<feed>.mp3` (feeds A, Speech, Modular, Mixed) with
`.log` (status every 60 s) and `.json` (every 1 s window).

## Refused, and why

- **A material allowlist or removing files.** The input is not controlled (*"it will be interviews, modular
  loops, AM scans"*). Every change above works on what is heard, not on file names.
- **Fewer players.** It helped AM (35 %) but not the mixed feed (57 %) and it changes MEM's density, which the
  owner has tuned several times.
- **A global loudness or level fix.** Integrated loudness is already level (-15.7 now, -17.0 calm2b, the live
  stream -16.9); hiss is a share of the time, not a level.
- **Spectral gating inside scsynth.** Not tried: `afftdn` before the ring measured only 3 points on AM, so a
  denoiser in the room is unlikely to be worth its CPU.

## Not settled

- **Steady tones go up when hiss goes down.** calm on A: tone windows 0.2 to 17.7 % (calm2b 8.0 %), from
  `lf-77.5` (the 1 kHz ticking the owner put out of AM UK). The owner's rule is *"tones are cool, depends how
  harsh"*. A tone measure (steady peak, pitch, burstiness) could weight harsh tones the same way, and was not
  built in this time box.
- **Quiet stretches exist in `now` already.** Runs of 10 to 20 s under -45 dB RMS: now A 10 s, now Speech 10 s,
  calm2b Modular 20 s at 1115 s (thin mood with a loop two octaves down). Not caused by this change, not fixed by it.
- **The thresholds are set from these 36 files** (hiss flatness about 0.45 to 0.5, programme under 0.2).
  A clean noise instrument (a modular noise voice, a cymbal wash) would read as hiss and be weighted down too.
  Not measured.
- **Whether it sounds better** is the owner's call; every number here is a proxy. The hiss class is
  flatness, not a listener.
- **mem-test.mjs fails on calm2b**: `colours: some loops stay long (70 s)`. Its fixture feeds white noise
  bursts, which the new measure rightly calls hiss, so no loop stays. The fixture needs a feed that is not
  hiss (filtered or tonal) and a new check: a hiss feed passes takes over, a tone feed does not. To do with
  the change.
- What v2in's live input played during the recording: unknown, no stream was opened.

## Deploy, later (NOT executed)

After the owner has listened and said yes:

1. positron: apply the two diffs below to `demo/shell/mem.mjs` and `demo/shell/mem-presets.json`; fix
   `mem-test.mjs` as above; `node demo/shell/mem-test.mjs` (or its home in positron) passes; commit path
   limited (`git commit -F msg -- demo/shell/mem.mjs demo/shell/mem-presets.json demo/shell/mem-test.mjs`).
2. v2in: `node tools/mem-sync.mjs` (copies the master), `node tools/mem-sync.mjs --check` reads `same`;
   `node server/engines/mem/mem-test.mjs`; one 20 minute render on the huddersfield folder as above.
3. Optionally the intake `afftdn` in v2in `server/engines/mem/run.mjs` (step 3 of the plan).
4. Push v2in main (its CI deploys and restarts the mem engine); pushing positron needs the personal account
   dance in CLAUDE.md.
5. Listen to https://v2in.stream/stream/mem for ten minutes: hiss should come and go within a minute of the
   input changing, not stay for ten.

### Proposed preset diff (colours)

```diff
-        "speech": 0.2,
+        "speech": 0.6,
-        "alone": true
+        "alone": true,
+        "noise": 0.1
       "colour": { "hp": [80, 400] -> [40, 150]
       slots mid  "hp": [100, 350] -> [40, 150]
       slots high "hp": [400, 900] -> [150, 400]
       "bands": { "floor": -9 -> -4 }
```

Full file: `…/scratchpad/mem/presets.diff`.

### Proposed engine diff

```diff
--- a/demo/shell/mem.mjs	2026-11-10 21:55:12
+++ b/demo/shell/mem.mjs	2026-11-11 19:55:37
@@ -72,6 +72,28 @@
 // stations in server/media/huddersfield-talk have medians 3.5 to 5.4 dB and 10th percentiles of 2.4 or more; skywave
 // noise and steady stations 0.6 to 1.8. `speechOf` maps 1.8 dB to 0 and 3.2 dB to 1.
 export const SPEECH_DB = [1.8, 3.2];
+
+// ── what a stretch sounds like: hiss or not ──
+// Spectral flatness (geometric over arithmetic mean of the power, 200 Hz to 4 kHz) of 512-sample frames: broadband hiss
+// is near 0.5, music and voices under 0.2. `noiseOfFrames` maps a median of 0.2 to 0 and 0.35 to 1.
+export const NOISE_FLAT = [0.2, 0.35];
+const NF = 512, NWIN = Float64Array.from({ length: NF }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NF));
+function flatOf(x, sr) {
+  const re = new Float64Array(NF), im = new Float64Array(NF);
+  for (let i = 0; i < NF; i++) re[i] = (x[i] / 32768) * NWIN[i];
+  for (let i = 1, j = 0; i < NF; i++) { let b = NF >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
+  for (let len = 2; len <= NF; len <<= 1) { const a = -2 * Math.PI / len;
+    for (let i = 0; i < NF; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), sn = Math.sin(a * k), p = i + k, q = p + len / 2;
+      const vr = re[q] * c - im[q] * sn, vi = re[q] * sn + im[q] * c; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; } }
+  const k0 = Math.max(1, Math.round(200 / sr * NF)), k1 = Math.round(4000 / sr * NF);
+  let lg = 0, ar = 0; for (let k = k0; k < k1; k++) { const p = re[k] * re[k] + im[k] * im[k] + 1e-20; lg += Math.log(p); ar += p; }
+  const n = k1 - k0; return ar / n < 1e-9 ? 0 : Math.exp(lg / n) / (ar / n);
+}
+/** How hiss-like `frames` (an array of Int16Array of 512) are, 0 to 1. */
+export function noiseOfFrames(frames, sr = SR) {
+  const v = frames.map((x) => flatOf(x, sr)).sort((a, b) => a - b), m = v[v.length >> 1] ?? 0;
+  return Math.max(0, Math.min(1, (m - NOISE_FLAT[0]) / (NOISE_FLAT[1] - NOISE_FLAT[0])));
+}
 /** A band pass (RBJ biquad, constant peak gain) at f with quality q, per sample. */
 function bandpass(f, q, sr = SR) {
   const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
@@ -122,6 +144,8 @@
   get from() { return Math.max(0, this.w - this.n); }
   /** Energy (mean square) of the 10 ms cells [c0, c1), cells counted from the start of the feed. */
   cellsOf(c0, c1, arr = this.cells) { const nc = arr.length, out = new Float32Array(Math.max(0, c1 - c0)); for (let c = c0; c < c1; c++) out[c - c0] = arr[c % nc]; return out; }
+  /** How hiss-like the cells [c0, c1) are, 0 to 1: a dozen frames across them. */
+  noise(c0, c1) { const g = this.grid ?? Math.round(this.sr / 100), f = []; for (let k = 0; k < 12; k++) f.push(this.mono((c0 + Math.floor((c1 - c0 - 6) * (k + 0.5) / 12)) * g, NF)); return noiseOfFrames(f, this.sr); }
   /** How speech-like the cells [c0, c1) are, 0 to 1. */
   speech(c0, c1) { return speechOfSwing(swingOf(this.cellsOf(c0, c1, this.bands))); }
   /** Frames [f0, f0 + n) summed to mono, 16-bit. */
@@ -485,13 +509,13 @@
       const c = lo + Math.floor(r.next() * (hi - lo));
       const s = findStart(this.ring.cellsOf(c, Math.min(lastCell, c + 200 + span)), span, 200, T.gateDb);
       if (s < 0 || !free(c + s)) continue;
-      cands.push({ c: c + s, speech: this.ring.speech(c + s, c + s + span) });
+      cands.push({ c: c + s, speech: this.ring.speech(c + s, c + s + span), noise: this.ring.noise(c + s, c + s + span) });
     }
     // and the newest stretch, as before: the strongest onset in the last 10 s that leaves room for the take
     const c0 = Math.max(firstCell, lastCell - span - 1000), s = findStart(this.ring.cellsOf(c0, lastCell), span, lastCell - c0 - span, T.gateDb);
-    if (s >= 0 && free(c0 + s)) cands.push({ c: c0 + s, speech: this.ring.speech(c0 + s, c0 + s + span) });
+    if (s >= 0 && free(c0 + s)) cands.push({ c: c0 + s, speech: this.ring.speech(c0 + s, c0 + s + span), noise: this.ring.noise(c0 + s, c0 + s + span) });
     if (!cands.length) return 'no sound';
-    const wt = (x) => 1 - x.speech * (1 - (T.speech ?? 1)) + 1e-3;
+    const wt = (x) => (1 - x.speech * (1 - (T.speech ?? 1))) * (1 - (x.noise ?? 0) * (1 - (T.noise ?? 1))) + 1e-3;
     let u = r.next() * cands.reduce((a, x) => a + wt(x), 0), pick = cands[0];
     for (const x of cands) { u -= wt(x); if (u <= 0) { pick = x; break; } }
     // talk is also passed over outright at the same odds, unless nothing has been taken for a long while (a feed that
@@ -499,22 +523,31 @@
     const long = (this.t - (this.lastTakeAt ?? 0)) / this.sr > (this.takes.length ? 1.5 * T.every[1] : 45);   // at the start, 45 s at most
     // an opening takes its first take, talk or not
     if (pick.speech >= 0.5 && !long && !talk && !(this.firstTake && this.p.open) && r.next() > (T.speech ?? 1)) { this.counts.passed = (this.counts.passed || 0) + 1; return 'talk'; }
+    const sounding = this.players.filter((pl) => !pl.rest && !pl.leaving && pl.voices.some((v) => !v.out)).length;
+    if ((pick.noise ?? 0) >= 0.5 && !long && sounding >= 2 && r.next() > (T.noise ?? 1)) { this.counts.hiss = (this.counts.hiss || 0) + 1; return 'talk'; }   // hiss passed over at the same odds as talk
     this.recentTakes = [...recent, [pick.c, pick.c + span]].slice(-4);
     const f0 = pick.c * this.grid, data = this.ring.mono(f0, need * this.grid + this.seam + 2);
     // ringAt: the frame of the feed it was cut at, so a host that knows what it fed can name the source
-    return this.addTake(data, need, { from: 'live', speech: pick.speech, ringAt: f0, wall: this.now() - (this.ring.w - f0) / this.sr * 1000 });
+    return this.addTake(data, need, { from: 'live', speech: pick.speech, noise: pick.noise ?? 0, ringAt: f0, wall: this.now() - (this.ring.w - f0) / this.sr * 1000 });
   }
   addTake(data, cs, meta) {
     let ss = 0; for (let i = 0; i < data.length; i++) { const v = data[i] / 32768; ss += v * v; }
     const rms = Math.sqrt(ss / data.length) + 1e-9;
     const take = { id: ++this.tid, data, cs, at: this.t / this.sr, uses: 0, gain: Math.min(2.5, 0.1 / rms), ...meta };   // at most +8 dB: a faint take of hiss or whistle is not turned up to everything else
     take.speech ??= speechOf(data, this.sr); this.lastTakeAt = this.t;
+    if (take.noise === undefined) { const fr = []; for (let k = 0; k < 12; k++) fr.push(data.subarray(Math.floor((data.length - NF) * (k + 0.5) / 12)).slice(0, NF)); take.noise = noiseOfFrames(fr, this.sr); }
+    take.gain *= 1 - 0.4 * take.noise;   // hiss sits under what it plays beside, up to 4.4 dB down
     this.takes.push(take); this.counts.takes++; if (meta.from !== 'live') this.counts.past++;
     if (take.speech >= 0.5) this.counts.talk = (this.counts.talk || 0) + 1;
     // a take that is not talk: the loops of talk playing are replaced soon, one after another (when talk is weighted down)
     if (take.speech < 0.5 && (this.p.takes.speech ?? 1) < 1) {
       const talking = this.players.filter((pl) => !pl.rest && !pl.leaving && !pl.toRest && pl.voices.some((v) => !v.out && v.take.speech >= 0.5));
       talking.forEach((pl, j) => { pl.replaceAt = Math.min(pl.replaceAt, this.t + (this.r.range([5, 25]) + j * 2 * (this.p.spacing ?? 0)) * this.sr); });
+    }
+    // a take that is not hiss: the loops of hiss playing are replaced soon, one after another
+    if (take.noise < 0.5 && (this.p.takes.noise ?? 1) < 1) {
+      const hissing = this.players.filter((pl) => !pl.rest && !pl.leaving && !pl.toRest && pl.voices.some((v) => !v.out && (v.take.noise ?? 0) >= 0.5));
+      hissing.forEach((pl, j) => { pl.replaceAt = Math.min(pl.replaceAt, this.t + (this.r.range([5, 25]) + j * 2 * (this.p.spacing ?? 0)) * this.sr); });
     }
     this.onTake?.(take);
     while (this.takes.length > this.p.takes.memory) { const k = this.takes.findIndex((x) => !x.uses); if (k < 0) break; this.takes.splice(k, 1); }
@@ -611,8 +644,9 @@
     // a long loop lives long enough to be heard round three times, within the preset's longest life
     const talkLife = take.speech >= 0.5 ? 0.5 + 0.5 * (T.speech ?? 1) : 1;   // talk, when it comes, does not stay long
     // a share of the loops stay long (preset `takes.stay`), the rest come and go at `life`
-    const life = slot?.life ? r.range(slot.life) : T.stay && r.chance(T.stay.p) ? r.range(T.stay.life) : r.range(T.life);
-    pl.replaceAt = this.t + Math.max(life, Math.min(3 * n / 100, T.life[1])) * this.pace * talkLife * this.sr;
+    const hiss = (take.noise ?? 0) >= 0.5 && (T.noise ?? 1) < 1;   // hiss never stays long
+    const life = slot?.life ? r.range(slot.life) : !hiss && T.stay && r.chance(T.stay.p) ? r.range(T.stay.life) : r.range(T.life);
+    pl.replaceAt = this.t + Math.max(life, Math.min(3 * n / 100, T.life[1])) * this.pace * talkLife * (hiss ? 0.5 : 1) * this.sr;
     // a freeze, now and then, partway through the take's life
     const F = this.p.process.freeze;
     if (F.p > 0 && r.chance(F.p * this.proc)) pl.freezeAt = this.t + r.range([0.25, 0.6]) * (pl.replaceAt - this.t); else pl.freezeAt = Infinity;
```

The scratch engine with both applied: `…/scratchpad/mem/eng/calm2b/server/engines/mem/`. The measuring script: `…/scratchpad/mem/measure.mjs`.

## Softer, on top of calm2b (2026-11-11, second pass)

Asked: *"work on it more. soften somehow?"*. Three scratch engines copied from calm2b, same renders (20 min, colours, seed 1):

- **hissdark** (engine + preset): a speaker's low pass follows the loop it plays, `lp * (1 - (1 - colour.hissLp) * noise)`
  with `hissLp` 0.4, so a hiss loop sits at 40 % of its colour's low pass (new `lpOf(pl)` in place of the four
  `Math.min(this.top, pl.colour.lp)`); hiss gain down `takes.hissDown` 0.6 (up to 8 dB, was 0.4 fixed).
- **soft1** (preset only): `colour.lp` 4 to 9 kHz to 2.5 to 6 (mid 2.5 to 5.5, high 4 to 7), drive 1 to 1.6 to
  1 to 1.25 (high 1 to 1.15), reverb damp 0.55 to 0.75, `solo.sudden` 0.15 to 0. Gives back part of the kcmd brightness.
- **soft2**: both.

| engine | A hiss, harsh, centroid, LUFS | Mixed hiss, harsh, centroid | Speech harsh | Modular | jumps/min A |
| --- | --- | --- | --- | --- | --- |
| now | 58.3 %, 0.37, 1689 Hz, -15.7 | 64.6 %, 0.29 | 0.04 | 0 % | |
| calm2b | 25.3 %, 0.18, 1087 Hz, -17.0 | 7.2 %, 0.11, 769 Hz | 0.033 | 0 %, silence 1.6 % | 31.9 |
| hissdark | 20.3 %, 0.12, 877 Hz, -17.8 | 4.0 %, 0.10, 726 Hz | 0.033 | same as calm2b | 36.7 |
| soft1 | 18.9 %, 0.14, 917 Hz, -17.2 | 0.7 %, 0.05, 528 Hz | 0.026 | 0 %, silence 0 | 36.1 |
| **soft2** | **8.4 %, 0.07, 681 Hz, -18.3** | **0.4 %, 0.05, 516 Hz** | 0.026 | 0 %, silence 0 | 43.3 |

The hardest minute (A at 120 s, the ring mostly hiss): now 75 %, calm2b 32 %, soft2 20 % hiss, harshness 0.42,
0.26, 0.16. No gaps in any of the three.

Caveats: the hiss class is flatness from 200 Hz to 4 kHz, and a low pass under 4 kHz lowers flatness by itself, so
part of hissdark's and soft2's drop is the filter changing what the measure sees rather than hiss leaving. The hiss
still plays, darker. Level jumps per minute on A go up (31.9 to 43.3); not listened to, and it may only be the
louder content standing out against quieter hiss. soft1 trades back brightness that the kcmd comparison asked for.

Listen: `…/scratchpad/mem/listen/ab2.html` (five columns: now, calm2b, hissdark, soft1, soft2). Engines at
`…/scratchpad/mem/eng/{hissdark,soft1,soft2}/`.
