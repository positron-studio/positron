# plan-cast-variety: what repeats in the Väin cast, new sounds for it, more bass, and how to keep it moving

Written 2026-10-19 for the Väin cast (https://positron.studio/radio/cast/, LOCAL first, then the container on
radio1965). Asked, the same day: *"more fx ideas / soudscapes?"*, *"its cool but repeating"*, and then
*"add more bassy stuff?"*.

Tags: **MEASURED** (a number, and the command that made it), **COMPILED** (the sketch went through
`compile()` in `demo/shell/sclang-lite.mjs` in node and was accepted; it never ran in scsynth and nobody heard
it), **READ** (from code or a document here, file named), **FROM DOCS**, **INFERRED** (reasoned, not run, not
heard). Nothing in this file is built. Nothing in it has been heard.

The owner's standing rules this plan is held to, all said 2026-10-18 or 2026-10-19: no naked speech, speech as an
instrument; never pitch a voice up (MAX_PITCH 1, harmonizer voicings all under the voice); drones are one trick
(about 36 % of scenes), no annoying high pitch; not metallic; no silence and no fading volume, prefer wet, use the
full wet and dry range but little time dry; pitch moves glide like a voice (three Lags); not too loud, no clipping.

## 0. Verdict

**The repetition is structural, not a missing memory.** Over 2,400 simulated scenes (MEASURED, section 1) the
listener hears the same three patches (Smear, Spectrum, Ember) in 22 % of all scenes, because the spectral family
has only three members once MAX_PITCH 1 cut Prism, and five scene types draw from it. Resonators sound in 69 % of
scenes because four scene types force them, which is also where *"very mettallic"* comes from. Every scene has
the same arc (dry, rise, hold, release), every file starts at 0 s so its dry opening is the same words on every
return, and with 13 to 17 files each file comes back about twice an hour, in the same order. A plain "do not
repeat the last N patches" memory was prototyped and does little on its own: the pools a scene type may pick from
are as small as 3 patches (MEASURED, section 4.1).

So the plan has three parts:

1. **Variety in life.mjs first** (section 4): grow the small pools (four new spectral patches, values only), a
   soft patch, family and file memory, stop forcing resonators, a layer-combination memory, the hand on
   audible controls. Prototyped in a copy of life.mjs: the most played patch falls from 7.5 % to 4.3 % of
   scenes, a patch coming back within two scenes from 67 cases to 10, resonators from 69 % to 46 %, the same
   layer combination within five scenes from 36 % to 23 % (MEASURED).
2. **Fourteen new effects and soundscapes** (section 2), every SuperCollider one COMPILED inside the sclang-lite
   subset. The strongest: a vocoder that makes the drone speak with the speaker's words (the in-graph envelope
   follower `LPF(LPF(x.squared)).sqrt` turns out to be possible in the subset), breathing band filters,
   a falling reverb that only goes down, a second long ring for layered time-stretch, pause bloom, a syllable
   drum struck by onsets found inside the graph, plus a post bus (tape, slow sweep, orbit) that also puts one
   limiter on the whole sum.
3. **Bass** (section 3): the file path is the tuner's 200 Hz to 3.5 kHz AM band (READ), so nothing under 200 Hz
   reaches the listener except the drones and octave-down grains. Four low layers that follow the speech
   rather than sit as a bed, and a low bus after the room's reverb so the low end is not smeared.

Recommended first step (section 5): the section 4 changes that are life.mjs only, grammar 2 only, with no
engine and no program change, shipped on LOCAL first and measured with the same simulation.

## 1. What repeats, measured

### 1.1 How it was measured

A script in the session scratchpad (`repeat-sim.mjs`, its core in the appendix) imports
`demo/radio/cast/life.mjs` as it is on 2026-10-19 14:27 (commit 9420391e, the soak at -0.7 to 0.9 with
DRIER_SHARE 0.15, MAX_PITCH 1), and for each of 8 seeds (1, 2, 3, 7, 42, 99, 1234, 31337) calls
`createLife({ seed }).scene(i, { kind, soft })` for i = 0 to 299. The file of scene i is `i % F` of a program of
F files, as the program loops (READ, `lessons/workers-cast.md#program`). The archive's kinds are not read from
the feed (that would touch Väin's side); the program is ASSUMED at 9 speech, 4 field, 2 music in 15, three of
them `soft`. Kind only moves `layersOf`'s odds, which `typeLayers` mostly overrides in grammar 2 (READ).

Commands: `node repeat-sim.mjs 300 15`, `node repeat-hour.mjs 13|15|17`, `VOTES=1 node repeat-sim.mjs 300 15`
(the 11 votes in `demo/radio/cast/votes-2026-10-18.json`).

### 1.2 The numbers (MEASURED, 8 seeds x 300 scenes, 15 files, no votes unless said)

| what | number |
| --- | --- |
| planned length | 9.7 h per seed; a scene plus its blend 116.4 s on average (planned dwell; a scene is cut short on a file shorter than its dwell, READ `#short-files`) |
| patches in the code | 54 (10 page patches, 44 cast patches) |
| reachable in grammar 2 | **47**. MAX_PITCH 1 cuts 7: Shimmer, Sparks, Glass, Choir of fifths, Halo, Plainchant, Prism. The overlap cap of 24 cuts none |
| reachable per scene type | intro 20, build 20, rhythm 20, breath 16, storm 14, deep 12, coda 12, tapebuild 10, choir **7**, cloudbuild **7**, sdeep **3** |
| patches used per seed in 300 scenes | 40 to 43 of 47 |
| most played patches | **Smear 7.5 %, Spectrum 7.5 %, Ember 7.4 %** (the whole spectral family), then Slow motion 4.1, Undertow 4.0, Breath bed 4.0, Hum 3.9 |
| least played | Swarm 0.0 %, Crumble 0.1, Splinter 0.2, Rain 0.3, Stutter 0.3, Shuffle 0.3 |
| gap between two plays of the same patch, in scenes | min **2**, p10 **4**, median 18, p90 74, max 250; a gap of 2 in 67 of 2,066 repeats |
| the same, in minutes (`repeat-hour.mjs`) | min 1.5 to 2.1, p10 7.3 to 7.9, median 33 to 35, p90 128 to 143 (13, 15, 17 files) |
| one listening hour (216 to 220 windows of 3600 s) | 28 to 35 scenes; 13 to 27 distinct patches (median 20); the most played patch of that hour plays a median **4** times, up to 8; spectral scenes median 7, up to 14 |
| families | drone 33.1 %, spectral 22.3, cloud 17.0, choir 12.3, tape 10.9, rhythmic 4.1, glitch 0.3 |
| same family as the scene before | 21.1 %; the family was heard in one of the three scenes before in **46.8 %** |
| grains pitched below 0.9 | **41 to 43 %** of scenes (the drone family is octave-down grain beds, a second drone even when the drone layer is off) |
| a frozen patch | 30 to 31 % |
| scene types | intro **20.4 %**, coda 13.2, deep 13.1, rhythm 11.0, breath 10.6, choir 10.5, build 6.2, sdeep 6.1, tapebuild 4.0, storm 3.0, cloudbuild 2.0 |
| sections | tape 20.1, arrival 18.4, ritual 18.1, chapel 18.0, night 13.4, weather 12.0 |
| interludes | dissolve 23.8, dronebridge 18.7, clean 15.9, frozenbridge 13.8, tapestop 9.0, smear 5.5, echowash 3.9, filter 3.7, chordbridge 3.7, radio 2.1 |
| the hand's control | pan **15.5**, echo 15.0, tone 13.4, speed 13.2, detune **12.6**, size 10.0, scatter 8.3, density 6.4, jitter 5.8 |
| drone layer | none 64.1 % (so 35.9 % with one, as asked) |
| resonators | **68.7 %** of scenes (minor7 25.4, fifths 21.4, major 18.5, cluster 3.5) |
| harmonizer | 43.2 % (triad 32.8) |
| ghost | 41.7 % |
| layer combination (drone, res, harm, ghost, pulse) | 31 combinations; the top one (nothing) 14.3 %; the same combination in one of the five scenes before **36.3 %**; 460 distinct patch and combination pairs |
| soak | mean 0.50; at or over 0.5 (the bigger room) in 66.5 % |
| keys | flat, 7.0 to 10.0 % per root |
| with the 11 votes | top patches Hymn 6.0, Ember 6.0, Smear 5.9, Spectrum 5.8; gap p10 4, max 269; gaps of 2 in 89 of 2,078. The lean toward liked patches makes the repeats slightly worse |

### 1.3 What the numbers mean (INFERRED from them and from the code)

- **The spectral family is the loop the ear hears.** Three patches, all long frozen smears, are picked by deep,
  coda, storm, choir and sdeep. sdeep may only pick those three. Each comes back every 14 scenes on average,
  27 minutes, often much sooner (p10 4 scenes).
- **The arc is identical in every scene.** `envelope()` and `layerLevel()` (READ) are one shape: dry share,
  rise, hold, release. Only the numbers move. A listener learns the shape in three scenes.
- **The resonators are the default colour.** typeLayers forces them in intro (always), deep (always), choir
  (always) and rhythm (when none was drawn). That is 69 % of scenes, and the reason *"very mettallic"* keeps
  coming back even after lres was darkened.
- **Intros are a fifth of the piece and all alike**: four of six sections open on one, and every intro is the
  voice sung through resonators with an even chance of the triad.
- **28 % of scenes move a control the ear hardly hears** (pan, detune), so those scenes sound static.
- **About 42 % of scenes are octave-down grains**, so between the drone family and the drone layer the low
  murmur is far more than "one trick", though it is grains, not the drone layer the rule counts.

### 1.4 The files (READ, plus the measured returns)

- 13 to 17 files in the program, played in program order and looped (READ, `#program`: a queue edit is rotated so
  the current file comes round last). At 116 s planned per scene a 15 file program comes round every
  ~29 minutes; real scenes end with a shorter file (`#short-files`), and the two measured lengths are 74 s
  (Oriental analog) and 102 s (Driving along), so INFERRED 20 to 29 minutes. **Every file plays about twice an
  hour.**
- **Every visit starts the file at 0 s** (READ: `local.mjs` places a slot with no `from`; the container's
  `open(it, { from })` is used only to resume after a death). The dry opening, the one moment that is
  recognisably the file, is therefore the same words on every return.
- **The order is the same every loop**, so the ghost visiting from the next or previous file (`ghostSide`) is
  the same pair of files every time round (INFERRED from the order and `ghostSide`).
- On a return the file gets the same patch as on its last visit in 4.1 to 4.6 % of returns, the same family in
  23.6 to 24.5 %, the same scene type in 12.3 to 13.9 % (MEASURED, 13, 15 and 17 files). The file count barely
  moves these; the family pools do.

## 2. New effects and soundscapes

### 2.0 Three pieces of plumbing several ideas need

- **P1. A post bus, cast only.** Today the ring writes bus 0 and the room writes bus 0 beside it, and since this
  morning the ghost writes past the room under its own 0.3 limiter while the room ducks to 0.45 and drops its
  ceiling to 0.25 during a visit (READ, `layers.mjs` working tree). The worst case sum is ring 0.43 plus room 0.4
  = 0.83 outside a visit and 0.43 + 0.25 + 0.3 = 0.98 inside one (INFERRED from the ceilings), so there is
  almost no headroom for any new path. The plumbing: compile the ring, the room and the ghost with `bus: 12`
  (`compile(src, { bus })` already takes it, READ `sclang-lite.mjs:290`; the ring's PROGRAM text, shared by five
  pages, does not change), and add one `lpost` program reading 12 and 13, carrying the post effects (2.3, 2.4,
  2.14) at amounts the life sets, and ending in `Limiter.ar(x, 0.9, 0.01)` on bus 0. That is also the limiter on
  the whole sum the backlog's *"too loud, clips"* item asks for (local has one since 9420391e, READ; whether the
  container has one was not checked). Cost: a Limiter and a few delays, INFERRED under 0.5 % of a core.
- **P2. Pause the layers that are silent.** `createLayerEngine` starts every layer at amp 0 and leaves it
  running (READ). With six layers that cost scsynth 4.1 % of a core together with the ring (MEASURED in
  `lessons/workers-cast.md#live-container`, OrbStack, half vCPU); doubling the programs would roughly double the
  layers' share if they all ran (INFERRED). `/n_run node 0` on a layer whose amp has been 0 for longer than its
  tail (8 s covers a FreeVerb room of 0.97, INFERRED), and `/n_run node 1` a block before its amp rises. Every
  new layer below assumes this.
- **P3. A low bus after the reverb**, for section 3: the room sums busses 8 to 11 into FreeVerb2, so any bass in
  a layer gets reverb and mud. `lroom2` (COMPILED, section 3.5) adds busses 14 and 15 after the reverb and before
  the same Limiter.

The container's CPU today is **39 % of one vCPU** on radio1965 at 1 vCPU (MEASURED, HANDOFF.md, 2026-10-19), and
25 % of a core on OrbStack with scsynth 4.1 % of it (MEASURED, `#live-container`). The 14 points between the two
are not explained (`plans/plan-cast-cheaper.md` section 6). CPU per idea below is INFERRED from what it is made
of, against `lres` (12 Ringz, two LPF, a Limiter: 3,459 B compiled) and `lfreeze` (PitchShift, FreeVerb: 857 B).
Nothing below was run in scsynth.

The sketches are written as they would sit in `layers.mjs` PROGRAMS (JavaScript template strings, so a backslash
is doubled and `${glide(...)}` is the three-Lag glide already there). Each one is in the scratchpad's
`sketches.mjs` and `bass.mjs` and was accepted by `compile()` on 2026-10-19 (sizes in bytes after each name).

### 2.1 Spoken drone (`lvocode`, a vocoder) COMPILED 3,700 B

**Sound:** a low chord on the scene's key that says the speaker's words, the voice's shape on a dark choir
instead of the voice. This is speech as an instrument in the most literal way, and no voice is pitched at all.

```js
const BANDS = [200, 300, 450, 670, 1000, 1500, 2200, 3200];
lvocode: `{ var amp = Lag.kr(\\amp.kr(0), 2);
  var x = Mix(In.ar(2, 2)) * 0.5;
  var car = (VarSaw.ar(${glide('\\f0.kr(65)', 4)}, 0, 0.4) + VarSaw.ar(${glide('\\f1.kr(98)', 4)} * 1.002, 0, 0.5)
    + VarSaw.ar(${glide('\\f2.kr(131)', 4)}, 0, 0.6) + (WhiteNoise.ar * \\breath.kr(0.15))) * 0.3;
  var v = Mix([${BANDS.map((f) => `BPF.ar(car, ${f}, 0.3) * LPF.ar(LPF.ar(BPF.ar(x, ${f}, 0.3).squared, 14), 14).sqrt`).join(', ')}]);
  Pan2.ar(Limiter.ar(LPF.ar(v * 6, 2500), 0.4, 0.01) * amp, LFNoise2.kr(0.03) * 0.3) }`,
```

- **Home:** a new layer, and a new value of the res slot ("colour") that intro, choir and deep may pick instead
  of the resonators. `breath` 0 to 1 moves it from sung to whispered.
- **CPU:** 16 BPF, 16 LPF, three VarSaw, a noise: INFERRED about lres, under 1 % of a core native.
- **Rules:** carriers are the key's root, fifth and octave in the C2 to C3 register (65 to 131 Hz), always under
  the voice. Saw buzz could read metallic: VarSaw widths, a 2.5 kHz low-pass and the noise share keep it soft;
  if it still buzzes, drop the 3.2 kHz band. It is silent when nobody speaks (the bands follow the voice), so it
  is not a drone bed. The intelligibility it keeps is the point; whether it counts as "naked" is for the ear.

### 2.2 Breathing filters (`lband`, spectral smear) COMPILED 5,561 B

**Sound:** the voice through ten wide filters that each rise and sink on their own slow breath, so its colour keeps
shifting like light through moving water.

```js
const SMEAR = [150, 210, 290, 400, 560, 780, 1090, 1520, 2120, 2960];
lband: `{ var amp = Lag.kr(\\amp.kr(0), 2);
  var x = Mix(In.ar(2, 2)) * 0.5;
  var b = ${SMEAR.map((f, i) => `Pan2.ar(BPF.ar(x, ${f} * (1 + (LFNoise2.kr(0.02) * 0.1)), 0.35)
    * (LFNoise2.kr(${(0.04 + i * 0.013).toFixed(3)}) + 1).squared * 0.5, ${i % 2 ? '' : '-'}0.${3 + (i % 5)})`).join(' + ')};
  LPF.ar(FreeVerb.ar(b, 0.3, 0.6, 0.6), 3000) * amp }`,
```

- **Home:** a new layer and a colour (as 2.1). Also a natural partner for the cloud family.
- **CPU:** 10 BPF, 20 LFNoise2 at control rate, one FreeVerb: INFERRED about lres.
- **Rules:** rq 0.35 is about a major third wide, too wide to ring, which is what keeps it off *"mettallic"*.
  Each band fades but ten independent ones keep the sum steady, so no fading volume overall.

### 2.3 Tape (`ltape`, wow, flutter, warmth) on the post bus COMPILED 1,273 B

**Sound:** the whole station as if played off a slightly tired tape: a slow sway, a faint flutter, soft warmth
and a breath of hiss.

```js
ltape: `{ var x = In.ar(12, 2);
  var d = 0.012 + (LFNoise2.kr(\\wowrate.kr(0.4)) * \\wow.kr(0.0015)) + (SinOsc.kr(6.3) * \\flut.kr(0.0001));
  var y = DelayC.ar(x, 0.03, d);
  var dr = \\drive.kr(1.5);
  var sat = (y * dr).tanh / dr;
  var hiss = LPF.ar(WhiteNoise.ar, 5000) * \\hiss.kr(0.002);
  Limiter.ar(LPF.ar(HPF.ar(sat, 70), \\top.kr(7000)) + hiss, 0.8, 0.01) }`,
```

- **Home:** the post bus (P1), with the amount a slow walk in the life (a tape section leans on it).
- **CPU:** two DelayC, a tanh, three filters: INFERRED under 0.3 %.
- **Rules:** a moving delay bends pitch both ways. At these depths the wow peaks near 9 cents and the flutter
  near 5 cents (INFERRED: the delay's rate of change, 1.5 ms at 0.4 Hz and 0.1 ms at 6.3 Hz), around a mean of
  exactly 1. That is not a transposition, but it is "up" for an instant, so it needs the owner's yes; with
  `wow` 0.0008 and `flut` 0 it stays under 5 cents. `tanh` only rounds peaks, it adds no level.

### 2.4 Slow sweep (`lsweep`, a phaser-like jet sweep) on the post bus COMPILED 865 B

**Sound:** a slow hollow sweep across everything, like wind passing over the sound, once every half minute, the two
sides out of step.

```js
lsweep: `{ var l = In.ar(12, 1), r = In.ar(13, 1);
  var dp = \\depth.kr(0.5);
  var ml = LFTri.kr(\\rate.kr(0.03)).range(0.0015, 0.011), mr = LFTri.kr(\\rate.kr(0.03), 1).range(0.0015, 0.011);
  [(l + (DelayC.ar(l, 0.02, ml) * dp)) / (1 + dp), (r + (DelayC.ar(r, 0.02, mr) * dp)) / (1 + dp)] }`,
```

- **Home:** post bus, as a per-section colour; or a bridge (the sweep at full depth across a blend).
- **CPU:** two DelayC: negligible.
- **Rules:** no feedback, so the notches never ring. Pitch moves under 1 cent (9.5 ms over 16 s, INFERRED).
  Dividing by 1 + depth keeps the level.

### 2.5 Strata (`lstrata`, a second, long ring for layered time-stretch) COMPILED 2,128 B

**Sound:** the voice of a few seconds ago crawling at half speed under the present one, and further down an older
moment at a quarter speed an octave lower, three times at once.

```js
lstrata: `{ var amp = Lag.kr(\\amp.kr(0), 3);
  var buf = \\buf.kr(1);
  var frames = BufFrames.kr(buf);
  var sr = frames / 32;
  var x = Mix(In.ar(2, 2)) * 0.5;
  var write = Phasor.ar(0, 1, 0, frames);
  var ra = Phasor.ar(Impulse.ar(\\cyclea.kr(0.05)), 0.5, 0, frames, (write - (\\backa.kr(6) * sr) + frames) % frames);
  var rb = Phasor.ar(Impulse.ar(\\cycleb.kr(0.03)), 0.25, 0, frames, (write - (\\backb.kr(12) * sr) + frames) % frames);
  var ta = Impulse.ar(6), tb = Dust.ar(4);
  var a = GrainBuf.ar(2, ta, 0.6, buf, 1, ra / frames, 2, TRand.ar(-0.6, 0.6, ta));
  var b = GrainBuf.ar(2, tb, 1.2, buf, 0.5, (rb / frames) + (TRand.ar(-0.01, 0.01, tb)) % 1, 2, TRand.ar(-0.9, 0.9, tb));
  BufWr.ar(x, buf, write);
  LPF.ar((a * 0.25) + (b * 0.3), 3000) * amp }`,
```

- **Home:** a new layer with its own 32 s buffer (buffer 1, `/b_alloc` in the layer engine), and the heart of a
  rare "long memory" event: words from 10 to 30 s earlier in the file resurfacing under the present.
- **CPU:** one BufWr and two grain streams of 3.6 and 4.8 grains sounding at once (the ring's patches run 2 to 24):
  INFERRED a third to a half of the ring, 1 to 2 % of a core. Memory 6.1 MB at 48 kHz, 5.6 MB at 44.1 kHz.
- **Rules:** grain rates 1 and 0.5 only, never above. This is the parked "parallel rings" of
  `plans/plan-cast-reinterpret.md` 2.8 at a fraction of the cost, because it reads rather than runs a second
  full ring.

### 2.6 The archive's own room (`lbed`, a field recording as a far bed) COMPILED 708 B

**Sound:** a field recording from the archive itself, darkened and pushed into a distant hall, under a whole
section like the weather outside.

```js
lbed: `{ var amp = Lag.kr(\\amp.kr(0), 6);
  var x = Mix(In.ar(6, 2)) * 0.5;
  var low = LPF.ar(HPF.ar(x, 80), 900 * (1 + (LFNoise2.kr(0.01) * 0.5)));
  Pan2.ar(FreeVerb.ar(low, 0.7, 0.95, 0.7) * amp, LFNoise2.kr(0.02) * 0.6) }`,
```

- **Home:** a layer on a third input pair (busses 6 and 7). LOCAL: a third media element into the merger (as the
  ghost's `inputPairs`). Container: `jack-stdin` with six channels, scsynth `-i 6`, and a third decoder
  (decoders cost 0.2 % MEASURED, `#live-container`). Chosen per section from files of kind `field`, held across
  the section.
- **CPU:** a FreeVerb and two filters plus a decoder: INFERRED under 1 %.
- **Rules:** unpitched, so it is not a drone, but it is a bed, so it gets a share like DRONE_SHARE (about one
  section in four, and never with a drone section). It also means no silence between words of a quiet file.

### 2.7 Falling well (`lwell`, a reverb that only goes down) COMPILED 917 B

**Sound:** a reverb whose tail falls an octave every time it comes round, so each word sinks into a deep well under
the voice.

```js
lwell: `{ var amp = Lag.kr(\\amp.kr(0), 2);
  var x = LPF.ar(Mix(In.ar(2, 2)) * 0.5, 2000);
  var fb = LocalIn.ar(1);
  var down = LPF.ar(PitchShift.ar(fb, 0.3, 0.5, 0.01, 0.06), 1200);
  var w = FreeVerb.ar(x + (down * \\fall.kr(0.45)), 1, 0.9, 0.5);
  LocalOut.ar(LeakDC.ar(w));
  Pan2.ar(Limiter.ar(LeakDC.ar(w), 0.4, 0.01) * amp, LFNoise2.kr(0.05) * 0.4) }`,
```

- **Home:** a layer, a colour for deep, coda and night, and the inverse of the "shimmer" reverb that would break
  the pitch rule.
- **CPU:** FreeVerb plus PitchShift: INFERRED about lfreeze.
- **Rules:** only downward, which is the respectful direction. A PitchShift in a loop can turn grainy: the
  1.2 kHz low-pass inside the loop and `fall` at most 0.5 keep it dark and decaying. The Limiter at 0.4 inside
  the layer keeps it under the room's ceiling.

### 2.8 Syllable drum (`lsyll`, rhythm from the speech's own onsets, found in the graph) COMPILED 1,397 B

**Sound:** each stressed syllable strikes a soft low drum made partly of the voice itself, so the speaker plays the
rhythm.

```js
lsyll: `{ var amp = Lag.kr(\\amp.kr(0), 1);
  var x = Mix(In.ar(2, 2)) * 0.5;
  var lv = x.squared;
  var fast = LPF.ar(LPF.ar(lv, 40), 40).sqrt, slow = LPF.ar(LPF.ar(lv, 2), 2).sqrt;
  var on = fast - (slow * \\ratio.kr(1.8)) - \\floor.kr(0.01);
  var e = EnvGen.ar(Env.perc(0.004, \\len.kr(0.35)), on);
  var body = SinOsc.ar(\\f0.kr(65) * (1 + (e * 0.3))) * e;
  var thump = LPF.ar(x, 300) * e * 2;
  Pan2.ar(LPF.ar(body + thump, 600) * amp, 0) }`,
```

- **Home:** a layer, and the `onsets` pulse kind without the resonators. EnvGen fires when `on` crosses from 0 or
  below to above 0 (INFERRED from EnvGen's gate, not tested here), so the onset is found inside scsynth: no
  node timer, none of the container's 0.43 to 0.72 s backlog (MEASURED, `#live-container`), no setTimeout jitter.
- **CPU:** five filters, a sine, an EnvGen: negligible.
- **Rules:** the drum's pitch is the scene root in octave 1, under the voice. Too busy is the risk: `ratio` and
  `floor` set how strong a syllable must be; a level 18 dB under the file. Also counted as bass (3.6).

### 2.9 Pause bloom (`lbloom`) COMPILED 949 B

**Sound:** every pause in the talk fills with a soft wide cloud of the last words, which steps back the moment the
speaker talks again.

```js
lbloom: `{ var amp = Lag.kr(\\amp.kr(0), 2);
  var x = Mix(In.ar(2, 2)) * 0.5;
  var talk = (LPF.ar(LPF.ar(x.squared, 3), 3).sqrt * \\sense.kr(20)).tanh;
  var duck = 1 - (talk * \\depth.kr(0.8));
  var tail = FreeVerb.ar(LPF.ar(x, 2500), 1, 0.97, 0.6);
  Pan2.ar(LeakDC.ar(tail) * duck * amp, LFNoise2.kr(0.04) * 0.5) }`,
```

- **Home:** a layer, strongest in breath and intro scenes and on talk with long pauses.
- **CPU:** one FreeVerb: INFERRED under lfreeze.
- **Rules:** made for "no silence". Pumping is the risk: the 3 Hz double low-pass makes the duck move over about
  a third of a second; `depth` 0.8 never ducks to nothing.

### 2.10 Sink and surface (a bridge)

**Sound:** the outgoing file sinks as if under water, darker and a little lower, and the next one rises up out of it.

- **Home:** a new interlude kind in IKINDS and `shapeOf`, ring extras only, like tapestop:
  `sink: { wet: 0.9, blend: [10, 16], path: 1 }`, shape: tone eases 9000 to 500 and pitch 1 to 0.84 (a minor
  third down) over the first 60 %, echo 0.5 to 0.8, the dark following tone; the incoming file starts at tone 500
  and opens over the last 40 %.
- **CPU:** none (values on the ring).
- **Rules:** pitch only falls. The ring's `pitch` has no Lag of its own, so the driver's 50 ms ticks carry an
  eased curve, as tapestop already does (READ, `shapeOf`).

### 2.11 Duet (a scene type)

**Sound:** two archive voices at once from the two sides, each blurred in its own way, talking past each other.

- **Home:** a new scene type `duet` (rare, in ritual and night sections): the ghost held for the whole scene at a
  steady level, panned opposite the ring (the ghost's pan becomes a control), the ring wet at least 0.6.
- **CPU:** the ghost decoder already runs during visits; a duet keeps it on for one scene.
- **Rules:** since this morning the ghost keeps "its own voice whole" (READ, working tree), so a duet must keep its
  band, comb or resonator colour on and the ring wet, or it becomes two naked voices.

### 2.12 Arc shapes (life.mjs)

**Sound:** scenes that do not all breathe the same way: one starts deep in grains and lets the voice surface for a
moment in the middle, one swells twice, one never lets the voice out at all, one slowly clears.

- **Home:** a `shape` per scene in make2, read by `inScene` and `layerLevel`: `classic` (today), `emerge` (wet,
  the floor at 55 to 65 % for a few seconds, wet again), `waves` (two swells), `plateau` (no dry at all, only the
  DRIER_FLOOR glimpse), `ebb` (full to the floor over the last third, then the blend). Weighted by type.
- **CPU:** none.
- **Rules:** every shape keeps the granulator at or over DRIER_FLOOR, so no naked speech and little time dry; the
  layers never fall to nothing in mid scene, so no fading volume.

### 2.13 Patch morph (life.mjs plus the drivers)

**Sound:** a scene that slowly turns from one sound into another of its family, a fog becoming a hymn over two
minutes.

- **Home:** a second patch `morph` per scene from the same or a neighbouring family; over the hold, every
  continuous control glides from patch A's value to B's (the drivers already send values every tick through
  `fixed`/`knob`). freeze, dir and lock switch at the midpoint inside a short wet dip.
- **CPU:** a few `/n_set` a second.
- **Rules:** both patches under MAX_PITCH, so the glide stays at or under 1. It doubles the reachable sounds
  without a new preset.

### 2.14 Orbit (`lorbit`, a slowly moving stereo field) on the post bus COMPILED 1,142 B

**Sound:** the whole sound drifts slowly round the listener and widens and narrows over a minute or two.

```js
lorbit: `{ var l = In.ar(12, 1), r = In.ar(13, 1);
  var a = LFNoise2.kr(\\rate.kr(0.01)) * \\turn.kr(0.5);
  var w = LFNoise2.kr(0.013).range(0.7, 1.3);
  var m = (l + r) * 0.5, s = (l - r) * 0.5 * w;
  var l2 = m + s, r2 = m - s;
  [(l2 * a.cos) - (r2 * a.sin * 0.3), (r2 * a.cos) + (l2 * a.sin * 0.3)] }`,
```

- **Home:** post bus.
- **CPU:** a few multiplications.
- **Rules:** width on mid and side keeps the mono sum (a phone, a mono speaker) unchanged; the turn term is kept
  at 0.3 so the mono level moves under 1 dB (INFERRED). Whether the MP3 to Icecast is stereo was not checked.

### 2.15 Summary

| # | idea | home | CPU (INFERRED) | rule most at risk |
| --- | --- | --- | --- | --- |
| 2.1 | spoken drone (vocoder) | layer, colour | ~lres | metallic buzz; naked? |
| 2.2 | breathing filters | layer, colour | ~lres | none if rq stays wide |
| 2.3 | tape | post | tiny | wow bends pitch up for an instant |
| 2.4 | slow sweep | post or bridge | tiny | none |
| 2.5 | strata, long memory | layer, rare event | 1 to 2 % | none |
| 2.6 | archive room | layer, third input | <1 % plus a decoder | a second bed |
| 2.7 | falling well | layer, colour | ~lfreeze | grain in the loop |
| 2.8 | syllable drum | layer, pulse kind | tiny | too busy |
| 2.9 | pause bloom | layer | <lfreeze | pumping |
| 2.10 | sink and surface | bridge | none | none |
| 2.11 | duet | scene type | none new | naked if the colour is off |
| 2.12 | arc shapes | life | none | none |
| 2.13 | patch morph | life, drivers | none | none |
| 2.14 | orbit | post | tiny | mono sum |

If every layer above ran at once the layers' share of scsynth would roughly double; with P2 only the few a scene
uses run (INFERRED). A scene should carry at most three colours at once (one of res, vocode, band, well; one of
bloom, strata, ghost; one post amount), which also keeps it from being everything every time.

## 3. Bass

Asked: *"add more bassy stuff?"*.

### 3.1 Why there is so little (READ)

The tuner's graph is a mono high-pass at **200 Hz** and low-pass at **3.5 kHz** (`demo/shell/tuner-mix.mjs`
lines 73 and 75), and the ring and every layer read the tuner. So the file, the grains and every layer made from
the file start at 200 Hz. The only energy under 200 Hz is the drone layer (saws on root, fifth and octave from
C1 to C3, in 36 % of scenes), lfreeze and octave-down grains (pitch 0.5 maps the band to 100 Hz and up, 0.25 to
50 Hz). Bass therefore has to be made, and it must follow the speech rather than sit as a bed, or it becomes the
drone the owner limited to one trick.

### 3.2 Headroom (READ and INFERRED)

The ring peaks near 0.43, the room's Limiter is at 0.4 (0.25 while a ghost visits), the ghost has its own 0.3
past the room. A sine's crest is only 3 dB, but low energy fills a limiter first: a bass layer in the room makes
the room's limiter work on everything else in it. So every bass layer: goes into the room (bus 14 and 15 of
`lroom2`, after the reverb, under the same ceiling, scaled by the scene gain), is high-passed at 35 Hz (nothing
the MP3 and most speakers carry is wasted below), is mono (Pan2 at 0), carries a little second harmonic through
`tanh` so a phone, which plays almost nothing under 100 to 150 Hz, still hints at it (INFERRED), and starts
14 to 20 dB under the file at -23 LUFS, the level the other layers were set to (8 to 16 dB under, MEASURED in
`#live-container` and the layers comment). Each level is a first guess until measured as the layers were
(`layers-test.mjs --browser`, `live-test.mjs --live`).

### 3.3 Sub shadow (`lsub`) COMPILED 804 B

**Sound:** a dark shadow of the voice an octave under it, so the speech gets a chest it never had through the radio.

```js
lsub: `{ var amp = Lag.kr(\\amp.kr(0), 2);
  var x = LPF.ar(Mix(In.ar(2, 2)) * 0.5, 500);
  var d = PitchShift.ar(x, 0.4, ${glide('\\ratio.kr(0.5)', 4)}, 0, 0.02);
  var lo = LPF.ar(LPF.ar(d, 200), 200);
  Pan2.ar(HPF.ar((lo * 2).tanh * 0.5, 35) * amp, 0) }`,
```

- **Home:** a layer on the low bus; `ratio` 0.5 (the band's 200 to 500 Hz becomes 100 to 250) or 0.25 (50 to 125)
  for deep scenes. Level 14 to 18 dB under the file.
- **CPU:** a PitchShift and four filters: INFERRED below lfreeze (no reverb).
- **Rules:** down only; it moves with the words and stops with them, so it is not a bed.

### 3.4 Breathing root (`lroot`) COMPILED 1,153 B

**Sound:** a low note on the scene's key that swells while somebody speaks and settles low in the pauses, like a
cello under a reader.

```js
lroot: `{ var amp = Lag.kr(\\amp.kr(0), 2);
  var x = Mix(In.ar(2, 2)) * 0.5;
  var talk = (LPF.ar(LPF.ar(x.squared, 4), 4).sqrt * \\sense.kr(12)).tanh;
  var f = ${glide('\\f0.kr(55)', 4)};
  var s = (SinOsc.ar(f) + (SinOsc.ar(f * 2) * 0.25)) * ((talk * 0.8) + 0.2);
  Pan2.ar(LPF.ar((s * 1.5).tanh, 300) * amp, 0) }`,
```

- **Home:** a layer on the low bus, `f0` the key's root in octave 1 (33 to 62 Hz) or 2, gliding with the key
  through the three Lags. Level 16 to 20 dB under the file.
- **CPU:** two sines and three filters: negligible.
- **Rules:** this is the closest to a drone, so it shares the drone's budget: never in a drone section, never
  with `lsub` in the same scene, and the floor of 0.2 keeps the pauses from going silent without making it a
  bed.

### 3.5 Low comb choir (`lcomb`) and the low bus (`lroom2`) COMPILED 1,405 B and 1,010 B

**Sound:** a low hollow choir on root, fifth and octave that the voice sets humming, like singing into a piano with
the pedal down, but dark.

```js
lcomb: `{ var amp = Lag.kr(\\amp.kr(0), 2);
  var x = LPF.ar(Mix(In.ar(2, 2)) * 0.5, 600) * 0.05;
  var c = CombC.ar(x, 0.05, 1 / ${glide('\\f0.kr(65)', 4)}, \\decay.kr(0.6)) + CombC.ar(x, 0.05, 1 / ${glide('\\f1.kr(98)', 4)}, \\decay.kr(0.6))
    + (CombC.ar(x, 0.05, 1 / ${glide('\\f2.kr(131)', 4)}, \\decay.kr(0.6)) * 0.6);
  Pan2.ar(Limiter.ar(LeakDC.ar(LPF.ar(LPF.ar(c, 400), 400)), 0.3, 0.01) * amp, 0) }`,
// the room with the low pair added after the reverb
lroom2: `{ var g = Lag.kr(\\gain.kr(1), 2) * Lag.kr(\\duck.kr(1), 1.5);
  var l = (In.ar(8, 1) * g) + In.ar(10, 1);
  var r = (In.ar(9, 1) * g) + In.ar(11, 1);
  var w = FreeVerb2.ar(l, r, \\mix.kr(0.3), \\size.kr(0.7), 0.5);
  Limiter.ar(w + (In.ar(14, 2) * g), Lag.kr(\\ceil.kr(0.4), 1.5), 0.01) }`,
```

- **Home:** a layer on the low bus, and a colour for choir scenes in place of the resonators. Level about 16 dB
  under the file.
- **CPU:** three CombC and two filters: INFERRED under half of lres.
- **Rules:** a comb at 65 to 131 Hz behind a double 400 Hz low-pass is a hum, not a ring; the short decay (0.6 s)
  keeps it from turning into a bell. Fundamentals all under the voice.

### 3.6 Slow low swell (a bridge) and the syllable drum

- **Low swell bridge** (`lowswell`, an interlude kind): across the blend, the drone layer at the next key's root
  in its lowest register (`droneOct -2`, `cut` 200) swells over the first 60 % and settles over the rest while the
  ring's tone falls to 600. **Sound:** the floor rises under the change of file and lets it go. No new program
  (ldrone with a shape in `shapeOf`, like dronebridge), no CPU. It is a drone for 10 to 20 s, so the rule is
  respected by its being a bridge, and it should not follow a drone section.
- **Syllable drum** (2.8) is the rhythmic bass.

### 3.7 Bass as a ring patch (INFERRED)

The ring can only reach low by pitch: Hum (0.25) and the drone family already do. A new low patch adds more of the
octave-down murmur that is already in 42 % of scenes (1.2), so the plan prefers the layers above, which follow the
speech, over another low patch.

## 4. How to vary it so it does not repeat

### 4.1 The prototype (MEASURED)

A copy of life.mjs in the scratchpad (`life-proto.mjs`) with four changes, measured with the same script
(`PROTO=lrufam CMB=1 node repeat-proto.mjs 300 15`):

| change | numbers before, then after |
| --- | --- |
| memory only (soft patch memory 1 - e^(-ago/16), family weight 0.25 one scene back, 0.6 two back, a file's last family 0.3) | top patch 7.5 to 7.8 %; p10 gap 4 to 7; gaps of 2: 67 to 16; same family as the scene before 21.1 to 14.0 %; a file's same family on return 24.5 to 14.9 %. **Little effect on the top three: the pools are the limit** |
| plus four spectral patches under MAX_PITCH (4.2) | top patch **4.3 %** (Ember), the old three 3.5 to 4.1 %; gap p10 **8**, median **26**; gaps of 2: **10** of 2,027; sdeep's pool 3 to 7, choir 7 to 11, deep and coda 12 to 16; 585 distinct patch and combination pairs (was 460) |
| plus resonators not forced (intro 40 %, deep 50 %, choir 50 %) | resonators 68.7 to **41.5 %** |
| plus a layer-combination memory (redraw typeLayers up to 4 times if its res, harm, ghost and pulse are those of one of the last 4 scenes) | the same combination within five scenes 36.3 to **23.3 %**; resonators 45.7 % |
| family-first picking (each family equally likely in a type), tried and REFUSED | it lifted the three-member spectral family to 26 % and Ember to 9 %: worse |

### 4.2 The changes, concrete, with the expected effect

- **V1. Grow the small pools.** Four spectral patches, values only on page patches, all within PATCH_LIMITS as
  read, overlaps 18 to 21 (under 24), pitch at most 1:
  `Vapour` (Slow motion: size 2.5, density 8, scatter 1, jitter 4, pitch 1, speed 0.08, back 4, detune 0.008,
  pan 1, tone 4500, echo 0.5, time 1, dark 2200, amp 1.4); `Ash` (Frozen choir: freeze 1, size 3, density 7,
  scatter 0.9, jitter 2.5, pitch 0.75, back 3, tone 2000, echo 0.55, time 1.2, dark 1200, amp 1.5); `Glow`
  (Frozen choir: freeze 1, size 1.8, density 10, scatter 1, jitter 1.5, pitch 1, back 2, detune 0.006, tone 3500,
  echo 0.4, time 0.8, dark 2000, amp 1.4); `Sand` (Slow motion: dir -1, size 1.5, density 14, scatter 1,
  jitter 3, pitch 1, speed 0.15, back 3, detune 0.01, tone 5000, echo 0.3, time 0.9, dark 2500, amp 1.4). Every
  amp a first guess, to be measured as the 38 were (3.0 to 8.5 dB under the source, no peak over -7.4 dBFS,
  `lessons/workers-cast.md#grammar-2`). Then two or three choir members at pitch 1 or under (a low hymn at 0.75,
  an unfrozen organ) so choir's pool of 7 grows. Effect: section 4.1, row 2.
- **V2. A soft memory, grammar 2 only.** In `fresh()`, when `T` is given, pick with
  `weighted(pool, w, r)` instead of `pickOne`: `w = (1 - exp(-ago / 12)) x famWeight x fileWeight`. It draws
  one `r()` as `pickOne` does, so nothing else in the life moves. Grammar 1 must keep `pickOne`, or
  `life-g1.json` goes red. Pure in the scenes before, so a twin in the container rebuilds the same life.
- **V3. Resonators as one colour of several.** typeLayers draws a colour per type from {res, none} today and
  from {res, vocode, band, well, comb, none} once those layers exist, each type with its own weights. Effect:
  resonators 69 to about 42 % now, under 25 % once the new colours exist (INFERRED), and less metallic.
- **V4. Layer-combination memory**, as prototyped. Effect: 36 to 23 %.
- **V5. The hand on audible controls.** pan and detune drawn at a third of the weight of the others. Effect:
  28 % of scenes moving a near-silent control to about 10 % (INFERRED).
- **V6. A different place in the file on each visit** (engines). Visit k of a file starts at
  `((k x 0.618) % 1) x max(0, seconds - dwell)`; the container has `open(it, { from })` already, LOCAL needs
  `from` on `place`. Effect: the dry opening is a different passage on every return instead of the same words
  (100 % today, READ). The feed's `seconds` is needed; a file with no known length starts at 0.
- **V7. Shuffle the program on each loop** (drivers): a seeded shuffle with the last file of one loop never the
  first of the next. Effect: the ghost pairs and the file order stop repeating every 20 to 29 minutes.
- **V8. Seasons: a second, slower tide** (6 h, its own phase) leaning the section weights, the room size, a
  tone ceiling and which colours are favoured. Pure in planned time, so twins agree. Effect: hour 1 and hour 4
  of a seven day run on radio1965 sound like different weather (INFERRED; nothing to count until built).
- **V9. Rare events with a budget**: duet (2.11), strata surge (2.5), a two minute total freeze, sink bridge
  (2.10), each at most once per 90 minutes and only near a tide crest. Effect: something unexpected about every
  half hour, never the same one twice in an hour.
- **V10. Arc shapes and patch morph** (2.12, 2.13). Effect: the scene's shape stops being the same in 100 % of
  scenes; with five shapes and the morph, about 47 patches x 5 shapes x a second patch instead of 47 sounds.
- **V11. Fewer, varied intros.** Let one in three `open` or `intro` slots become breath or an `emerge` arc, and
  draw an intro's colour like V3. Effect: intros 20 % to about 13 %, and not all through resonators.
- **V12. Votes with a novelty term.** `exp(LEAN x learned) x w` instead of `exp(LEAN x learned)`, so a liked patch
  is preferred but still waits its turn. Effect: with today's 11 votes the top patch at 6.0 % comes under the
  memory's ceiling (INFERRED). The new layers, the shape and the morph become FEATURES2 entries so the votes
  learn them.

## 5. Recommended first step, and what to measure after it

**Step 1: V1 (the four spectral patches), V2 (memory, grammar 2 only), V3 now (resonators not forced), V4
(combination memory), V5 (hand weights).** All in `demo/radio/cast/life.mjs`, no engine change, no ring change,
no new program, so no CPU change. LOCAL first; the container copy (`workers/cast/container/sc/radio/cast/life.mjs`)
only with a cast deploy while nothing is on air on Väin's channels, asked first.

Before it ships:
- `node demo/radio/cast/life-test.mjs` stays green (98 today) and `life-g1.json` unchanged (grammar 1 untouched).
- New asserts over 8 seeds x 300 scenes: no patch over 5 % of scenes, the p10 gap at least 7 scenes, gaps of 2
  under 1 % of repeats, resonators under 45 %, the same combination within five scenes under 26 %.
- Each new patch's level, wet on the voice-like source, as the 38 were measured: 3 to 9 dB under, peak under
  -7.4 dBFS.
- The live test's twin check (`live-test.mjs --live`: the planner apart matching `status.life`) still exact.

After it ships, measure: the same simulation (expected: top 4.3 %, p10 8, median 26, resonators 42 to 46 %,
combination 23 %); one listening hour on LOCAL with the owner; the votes on the four new patches. If the owner
still hears repetition after step 1, the next step is V6 and V7 (the files), then P1 and P2 and the first two
colours (2.1 spoken drone, 2.2 breathing filters) with `lsub` (3.3) for the bass.

## 6. Refused, and why

- **Family-first picking.** Measured worse (4.1).
- **Any pitch above 1**, in a patch, a morph, a harmonizer, a reverb (no shimmer, the falling well instead).
- **FFT or PV_ spectral freeze.** Not in sclang-lite; the band bank and the vocoder are the spectral ideas here.
- **A second full ring.** Strata reads a second buffer with two thin heads instead.
- **A bigger bass bed.** Every bass idea follows the speech or is a short bridge; a held low pad would be the drone
  again.
- **New ring patches for bass.** 42 % of scenes are already octave-down grains.

## 7. Not settled

- **Nothing here has been heard**, and nothing ran in scsynth: every sound sentence is what the graph should do.
- **CPU of each sketch.** INFERRED from its parts; to be measured in `live-test.mjs --live` on OrbStack at 1 vCPU,
  with the 39 % on Cloudflare against 25 % on OrbStack still unexplained.
- **Whether EnvGen triggers cleanly on `fast - slow` crossings** of AM-band speech (2.8), and how often.
- **Whether a few cents of wow is "pitching up"** to the owner (2.3).
- **The archive's kinds and lengths.** The simulation assumed 9 speech, 4 field, 2 music, 3 soft in 15; the real
  scene length is the shorter of dwell and file, so the real file return time is 20 to 29 minutes only by
  inference.
- **Whether the MP3 is stereo**, which decides whether orbit and the stereo spreads matter on air.
- **What a phone plays of any bass**: INFERRED very little under 100 to 150 Hz; the `tanh` harmonics are the hedge.
- **Whether the vocoder's intelligible words count as naked speech** to the owner.
- **Headroom with the ghost's new path**: the 0.98 worst case inside a visit is from the ceilings, not measured;
  P1's final limiter makes it moot once built.

## Appendix: the core of `repeat-sim.mjs` (scratchpad, not in the repository)

```js
import { createLife, CAST_PATCHES, familyOf, TYPES, MAX_PITCH, OVERLAP_CAP, overlapOf, patchValues } from './demo/radio/cast/life.mjs';
const N = 300, F = 15, seeds = [1, 2, 3, 7, 42, 99, 1234, 31337];
const files = Array.from({ length: F }, (_, k) => ({ kind: k % 15 < 9 ? 'speech' : k % 15 < 13 ? 'field' : 'music', soft: k % 5 === 4 }));
for (const seed of seeds) {
  const life = createLife({ seed }), last = {}, fileLast = {};
  for (let i = 0; i < N; i++) {
    const f = files[i % F], s = life.scene(i, f), L = s.layers;
    // count s.patch, familyOf(s.patch), s.type, s.section, s.iKind, s.param, L.drone/res/harm/ghost/bpm,
    // the gap since last[s.patch], and what the same file got on its last visit (fileLast[i % F])
    last[s.patch] = i; fileLast[i % F] = s;
  }
}
```
