# plan-cast-patches-scenes: way more patches and scenes, and a piece that moves

Written 2026-10-18 for the cast's live mode (https://positron.studio/radio/cast/, the `local` station first).
Asked: *"We need way more payvhes and scenes. Plan first"*, right after *"I want dynamicness. I want, it's okay to
listen by try signal for a while to identify original, but then I really want to go to into with Strony stuff and
granular stuff, etc. So it has to be a dynamic musical installation piece."*

Tags: **MEASURED** (a number, and where it was taken), **READ** (from code or a document here, file named),
**INFERRED** (reasoned, not run, not heard). Nothing in this file is built and nothing in it has been heard.

## 0. Verdict

"Way more" is safe only if it comes with **more structure at the same time**. Adding 38 patches to today's
flat pick (any patch, any movable control, any window, two random tweaks, any interlude) would make the piece
more random, not more dynamic: what the owner heard as ducks and nervous elements already comes out of that
flat pick, not out of the patches (section 1.2). So the plan is four layers of choice, each small, each
constrained by the one above it:

1. **A tide over the hour** sets how intense the piece is allowed to be now (section 4).
2. **Sections** of three to six scenes each have a shape (arrival, weather, ritual, chapel, tape, night),
   never the same section twice in a row (section 4).
3. **Scene types**, a grammar of nine (dry intro, naked speech, slow build, deep drone, granular storm,
   rhythmic, choir, breath, coda), each with its own envelope, layers, lengths and interlude kinds (section 3).
4. **Patch families**, seven (drone, cloud, choir, tape, rhythmic, glitch, spectral), each with several
   members and **guard ranges**: what the hand may move and how far, so a member cannot be pushed into the
   sound the family is not (section 2).

A scene type picks families, a family picks a patch, the guard ranges bound the hand. The votes keep their job
(which of the allowed candidates), and learn at the family and type level too, so a liked Backwards teaches
"tape" and not only "Backwards".

And the transitions get a **direct crossfade path that skips the tuner's dial sweep**: one pure function in a
new cast-only module, called from `local.mjs` and `mixer.mjs` during the blend. Eight new interlude kinds stand
on it (dissolve, filter hand-over, echo wash, tape stop, frozen bridge, drone bridge, chord hand-over, dead
air). The radio sweep stays, rare, as the station's signature (section 3.3).

Everything in the first six build steps is **life.mjs plus two small engine changes**, with **no change to the
ring's program** (`demo/granulator/grain-ring.mjs`, shared by five pages and the container). Three patches that
would need a ring change are listed and parked (section 2.4).

## 1. What there is, and what the votes already say

### 1.1 The pieces (READ)

| thing | where |
| --- | --- |
| the ring's 20 controls: freeze speed back density scatter size jitter pitch detune pan amp tone echo time dark drop ramp dir lock, plus mix | `demo/granulator/grain-ring.mjs` PROGRAM and DEFAULTS |
| its 10 page patches (Tape stop, Dub, Cloud, Frozen choir, Gate, Slow motion, Shimmer, Backwards, Undertow, Sparks) | same, PATCHES |
| the 6 cast patches (Fog, Cathedral, Swarm, Tide, Stutter, Glass): a page patch as base plus a value set | `demo/radio/cast/life.mjs` CAST_PATCHES |
| the clamps both engines apply | `PATCH_LIMITS` in `demo/radio/cast/local.mjs` and `workers/cast/container/grain-patch.mjs`, equal by `workers/cast/local-test.mjs` |
| a scene: one patch, one moved control on a window, length short 45 / mid 80 / long 150 s, two tweaks, an interlude kind (radio, smear, clean, drift), layers, key, dry share 0.12 to 0.3, intensity | `life.mjs` |
| intensity: `0.55 + 0.45 * (0.5 - 0.5 cos(2 pi i / 5))`, a cosine over ARC = 5 scenes | `life.mjs` intensityAt |
| the layers: key drone, freeze drone (both on their own bus 10/11, past the scene fade), 12 resonators, 3 voice harmonizer, ghost, room | `demo/radio/cast/layers.mjs` |
| compiler UGens: SinOsc Saw Pulse LFSaw LFTri LFNoise1 LFNoise2 WhiteNoise LPF HPF RLPF BPF Ringz CombC CombL FreeVerb FreeVerb2 PitchShift Limiter LeakDC Lag VarSaw Pan2 EnvGen Impulse Dust TRand Phasor BufFrames BufDur In BufWr GrainBuf SendReply DelayC LocalIn LocalOut | `UGENS` in `demo/shell/sclang-lite.mjs`. No FFT or PV_, no Select or TChoose, no Latch |
| every blend goes through the AM dial: the needle sweeps between slots 0.46 and 0.54 by `handTurn`, the noise is `0.04 + 0.26 (1 - best clear)` times the clock's `noise`, plus the whistle | `demo/shell/tuner-mix.mjs` createMix, `local.mjs` tick, `workers/cast/container/mixer.mjs` block |
| the ring's input is always the tuner's output, so grains and dry are both the 200 Hz to 3.5 kHz AM band | `local.mjs` build (`toGrains`), `mixer.mjs` createTuner |
| container: 0.5 vCPU; live with all layers at 24.7 to 25.2 % of one core, of which scsynth 4.1 %, node 10.8 to 11.0 % | `lessons/workers-cast.md#live-container`, MEASURED there 2026-10-18 (OrbStack, `--cpus 0.5`) |
| a ring patch reaches the container's scsynth 0.43 to 0.72 s before the audio it acts on | same, MEASURED there |

### 1.2 The votes, read once from https://cast.positron.studio/votes (MEASURED 2026-10-18: 11 votes)

| patch | votes | comments |
| --- | --- | --- |
| Backwards | 2, 3, 3, 3, 4, 3 | *"bg sounds interesting but soooo noisy too long"*, *"like rythmic aspect"*, *"interesting drone but bit nervous elements here and there"*, *"drone is fine but seems thematically disconnected to text"* |
| Shimmer | 3, 4, 4 | *"sometimes good, choir like..then stupid bunch of ducks."* |
| Gate | 3 | |
| Sparks | 2 | *"this "ragin" is still there (from original material?). a too netwouus cacophony of birds"* |

Interlude kinds that were voted: clean 4 and 4, radio 4 (noise 1.34 on a field recording), drift 3, smear 3.

What the defs show, computed from them (INFERRED from `life.mjs` toT/fromT, not heard):

- **The ducks scene** is Shimmer (pitch 2) with the hand on `scatter` from 0.18 to 0.73 and a tweak putting
  `size` at 0.26 s. Octave-up grains a quarter second long keep a syllable whole and shift its formants, so a
  voice becomes a quack, and scatter makes it a flock. Pitch 2 is fine on long or frozen grains; it is the
  combination with short grains and scatter.
- **The nervous scene** is Backwards (size 0.6 by its patch) with a tweak at t 0.06 on `size`, which is
  **0.037 s**: tiny reversed grains, clicks. The tweak was drawn uniformly over the whole `MOVABLE` range
  (0.03 to 1.2 s), not near the patch's value. Today **every tweak is uniform over the whole range**
  (`complete()`: `d.tweak[k] = r2(r())`), so any patch can be pushed far outside itself.
- **The birds** are Sparks (pitch 4, size 0.025, scatter 1) with a tweak at size 0.10: random chirps.
- **The hand window** is up to 0.8 of a control's whole range on a long scene, so a long scene on `pitch`
  sweeps 0.6 to 1.8, through the duck zone.

So the cure for ducks and nerves is **guard ranges per family**, not fewer patches.

### 1.3 Three things in today's code that the new patches would trip on (INFERRED, from reading)

- **A frozen patch freezes the interlude.** At a landing the driver sets the new patch at once
  (`live.mjs` tick, `index.html` lifeTick). For Frozen choir and Cathedral that is `freeze 1`, so the ring
  stops writing at the landing and holds the eight seconds before it: the blend, with its noise. A frozen
  patch should freeze after the scene's dry share, once the new file fills the ring.
- **Lock is only in time when density is a whole number of grains a beat** (`lessons/page-granulator.md`,
  granulator-13). Stutter has `density 8` against a scene tempo drawn 60 to 120 bpm, so at 72 bpm it is 6.67
  grains a beat and the grid drifts against the hits. A rhythmic patch's density must come from the tempo.
- **The next file leaks in before every blend.** The incoming slot is opened up to 4 s before the blend and sits
  0.08 off the needle, where createMix gives it `clear` 0.005 and `echo` 0.24 (computed from CLEAR_W 0.035,
  ECHO_W 0.13, ECHO_MAX 0.35): a 900 Hz band-passed echo of the next file under the end of each dwell. This may
  be part of what reads as cartoonish; listen before and after.

Also: smear's `freeze: swell(x)` takes values between 0 and 1, and the program uses freeze as a rate and a
level (`Phasor.ar(0, 1 - freeze ...)`, `input * (1 - freeze)`), so a half freeze is a half-speed, half-level
write, not a hold. Not wrong, but not a freeze.

## 2. Patch families and the new patches

### 2.1 The families and their guard ranges

The guard is what the hand and the tweaks may do in a scene on that family. Ranges are in control values;
`life.mjs` turns them into the hand's 0 to 1 window with its existing `toT`. Tweaks are drawn within the guard
and within 0.15 (in t) of the patch's own value, never uniform over everything. Controls not listed are not
moved. "Overlap" is density times size, the number of grains sounding at once, which is both the CPU and the
level divisor (`amp / sqrt(density * size + 1)`).

| family | what it is for | hand may move | never | overlap |
| --- | --- | --- | --- | --- |
| drone | a floor under talk: long, low, slow | tone 500 to 3000, size 1.2 to 4, speed 0.1 to 0.5, echo 0.2 to 0.6, pan, detune 0 to 0.01 | pitch above 0.85 | 10 to 20 |
| cloud | mid register texture, the file blurred | size 0.25 to 1.2, density 8 to 40, tone 1500 to 8000, scatter 0.4 to 1, echo 0.1 to 0.6, pan, speed 0.25 to 1 | pitch moved at all; size under 0.25 | 5 to 16 |
| choir | the file sung: long grains on an interval | tone 1500 to 6000, detune 0 to 0.015, echo, pan, size 0.6 to 2.5 | pitch moved; scatter over 0.35; size under 0.6 when pitch is over 1.3 | 8 to 16 |
| tape | reversed, slowing, dub | tone, echo 0.1 to 0.8, size 0.3 to 2.5, speed 0.25 to 1, pan, density 2 to 12 | size under 0.25 | 1.5 to 8 |
| rhythmic | locked to the scene's tempo | tone, echo, pan, size 0.06 to 0.6, speed 0.5 to 1 | density moved (it is the tempo's) | 0.5 to 6 |
| glitch | broken, short, only in storms | tone 2000 to 10000, echo, size 0.02 to 0.1, pan | long scenes; pitch over 1 | 0.5 to 3 |
| spectral | the file's colour without its time, by frozen overlap | tone 800 to 6000, detune 0 to 0.02, echo, pan, jitter 1 to 4 | short scenes | 16 to 24 |

Two global rules on top, checked in `life-test.mjs`: **the duck rule** (no scene may reach pitch over 1.3 with
size under 0.5 and scatter over 0.3), and **the overlap cap** (no patch over 24, a CPU and a mud rule).

The existing 16 join families: Tape stop, Dub, Backwards, Tide to tape; Cloud, Fog to cloud; Frozen choir,
Shimmer, Glass to choir; Slow motion, Undertow, Cathedral to drone; Gate, Stutter to rhythmic; Sparks, Swarm to
glitch. Shimmer under the choir guard can no longer be scattered past 0.35 with short grains, which is the
ducks scene made impossible rather than the patch removed.

### 2.2 How a cast patch is written

As today: `{ name, base, set }`, the base a page patch, so nothing new reaches the ring. One change: every set
is written through a helper that fills `freeze 0, drop 0, ramp 0.5, dir 1, lock 0` before the set, so a base's
freeze, drop or reverse never leaks into a patch that did not ask for it (Tape stop, Dub, Frozen choir and
Backwards all carry one). Two optional fields, read only by `life.mjs`: `freezeAfterDry: true` (freeze from the
end of the dry share, section 1.3) and `sub` (grains a beat for a locked patch: density is
`bpm / 60 * sub`, and `time` is given in beats as `beats`).

### 2.3 The 38 new patches (all within PATCH_LIMITS, READ against `local.mjs`)

Need column: **none** = values only, plays today with no other change; **freeze** = needs freeze after the dry
share (step 3); **tempo** = needs density and echo time from the scene's bpm (step 8). None needs a ring change.
Risk: ducks (high pitch with scatter on speech), birds (tiny scattered high grains), nervous (short grains at
random), harsh (bright and pitched up), mud (low, long, wet), snap (a sawtooth jump), level (to measure).

**Drone** (6)

| # | name | base | values | you hear | risk | need |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Sediment | Undertow | size 2.5, density 6, pitch 0.5, speed 0.25, back 3, scatter 0.6, jitter 1.5, detune 0.004, pan 0.7, tone 900, echo 0.55, time 1.1, dark 600, amp 1.4 (overlap 15) | the file an octave down at a quarter speed, a dark floor with no words left in it | mud | none |
| 2 | Low choir | Frozen choir | freeze 1, size 3, density 5, pitch 0.5, speed 0, back 2, scatter 0.3, jitter 0.8, detune 0.008, pan 0.9, tone 1600, echo 0.4, time 0.9, dark 1500, amp 1.4 (15) | one held moment an octave down, a slow low chord of it | mud | freeze |
| 3 | Fifth below | Undertow | size 1.8, density 8, pitch 0.667, speed 0.33, back 2.5, scatter 0.5, jitter 1, detune 0.003, pan 0.8, tone 2000, echo 0.45, time 0.75, dark 1200, amp 1.4 (14.4) | the voice a fifth under itself and three times slower, sitting with the key drone | mud, mild | none |
| 4 | Hum | Undertow | size 4, density 4, pitch 0.25, speed 0.125, back 4, scatter 0.4, jitter 2, detune 0.002, pan 0.5, tone 600, echo 0.3, time 1.3, dark 400, amp 1.6 (16) | two octaves down, nearly a hum, felt more than heard | mud; little left on a phone speaker (the AM band two octaves down is 50 to 875 Hz) | none |
| 5 | Breath bed | Slow motion | size 2, density 6, pitch 1, speed 0.1, back 1.5, scatter 0.8, jitter 1.2, detune 0.002, pan 1, tone 2500, echo 0.25, time 0.6, dark 2000, amp 1.4 (12) | the voice's breath and room stretched ten times at its own pitch, a soft wash | low | none |
| 6 | Riverbed | Undertow | dir -1, size 2.2, density 7, pitch 0.5, speed 0.4, back 3, scatter 0.7, jitter 1.5, detune 0.005, pan 0.9, tone 1100, echo 0.5, time 1, dark 700, amp 1.4 (15.4) | the low drone played backwards, every swell rising into its start | mud | none |

**Cloud** (6)

| # | name | base | values | you hear | risk | need |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | Mist | Cloud | size 0.5, density 24, pitch 1, speed 1, back 2.5, scatter 1, jitter 2, detune 0.006, pan 1, tone 5000, echo 0.35, time 0.3, dark 3000, amp 1.4 (12) | the last few seconds scattered as a soft mist, words blurred into syllables | nervous if size went short (guarded at 0.25) | none |
| 8 | Murmur | Cloud | size 0.3, density 32, pitch 1, speed 0.5, back 3, scatter 1, jitter 3, detune 0.01, pan 1, tone 4000, echo 0.2, time 0.25, dark 2500, amp 1.4 (9.6) | a crowd made of one voice, many syllables from the last six seconds at once | nervous, mild | none |
| 9 | Haze | Cloud | size 1, density 14, pitch 1, speed 0.75, back 1.5, scatter 0.7, jitter 0.8, detune 0.004, pan 0.8, tone 3000, echo 0.5, time 0.7, dark 1800, amp 1.4 (14) | long soft grains a little behind the voice, the file through frosted glass | low | none |
| 10 | Eddy | Cloud | size 0.6, density 18, pitch 1, speed 1, back 4, scatter 0.5, jitter 3.5, detune 0.003, pan 0.9, tone 6000, echo 0.3, time 0.45, dark 3500, amp 1.4 (10.8) | grains from anywhere in the last eight seconds, so phrases come back out of order | low | none |
| 11 | Dusk | Cloud | size 0.9, density 12, pitch 0.841, speed 0.6, back 2, scatter 0.8, jitter 1, detune 0.005, pan 0.9, tone 1800, echo 0.6, time 0.8, dark 1000, amp 1.4 (10.8) | a minor third down, slower and darker, evening light on the voice | mud, mild | none |
| 12 | Rain | Cloud | size 0.12, density 40, pitch 1, speed 1, back 3, scatter 1, jitter 2.5, detune 0.01, pan 1, tone 7000, echo 0.15, time 0.15, dark 4000, amp 1.6 (4.8) | short grains falling like rain on a roof, texture and no words | nervous: storm scenes only | none |

**Choir** (6)

| # | name | base | values | you hear | risk | need |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | Choir of fifths | Shimmer | size 0.9, density 10, pitch 1.5, speed 0.25, back 1.5, scatter 0.2, jitter 0.15, detune 0.004, pan 0.8, tone 4500, echo 0.45, time 0.6, dark 2500, amp 1.4 (9) | the voice a fifth up, slowed into long overlapping notes, sung rather than spoken | ducks if size fell under 0.6 (guarded) | none |
| 14 | Halo | Shimmer | freeze 1, size 1.2, density 8, pitch 2, speed 0, back 1, scatter 0.15, jitter 0.08, detune 0.006, pan 0.9, tone 5000, echo 0.5, time 0.5, dark 3000, amp 1.3 (9.6) | Shimmer's octave as a held high chord of one frozen moment, no syllables left to quack | harsh, mild | freeze |
| 15 | Plainchant | Frozen choir | size 0.8, density 12, pitch 1.335, speed 0.5, back 1, scatter 0.1, jitter 0.1, detune 0.002, pan 0.6, tone 5000, echo 0.35, time 0.75, dark 2500, amp 1.4 (9.6) | a fourth up at half speed, nearly even grains, like a monotone chant | ducks at half speed on speech (listen first) | none |
| 16 | Undersong | Frozen choir | size 1.4, density 9, pitch 0.749, speed 0.33, back 2, scatter 0.25, jitter 0.3, detune 0.003, pan 0.7, tone 2500, echo 0.4, time 0.8, dark 1500, amp 1.4 (12.6) | a fourth under, long held notes, a low choir out of any voice | mud, mild | none |
| 17 | Hymn | Frozen choir | freeze 1, size 2, density 8, pitch 1, speed 0, back 1.5, scatter 0.4, jitter 0.5, detune 0.012, pan 1, tone 4000, echo 0.55, time 0.9, dark 2200, amp 1.3 (16) | one held second smeared into a slow chorus at its own pitch, about 20 cents either side | low | freeze |
| 18 | Organ | Frozen choir | freeze 1, size 0.8, density 16, pitch 1, speed 0, back 1, scatter 0, jitter 0.02, detune 0, pan 0.3, tone 3000, echo 0.3, time 0.6, dark 2000, amp 1.3 (12.8) | one frozen instant sustained as a steady tone, still and narrow | a 16 Hz flutter from even grains on one spot (listen) | freeze |

**Tape** (7)

| # | name | base | values | you hear | risk | need |
| --- | --- | --- | --- | --- | --- | --- |
| 19 | Rewind | Backwards | dir -1, size 1, density 5, pitch 1, speed 1, back 2, scatter 0.2, jitter 0.2, detune 0.002, pan 0.6, tone 7000, echo 0.3, time 0.5, dark 3500, amp 1.4 (5) | whole words reversed, each swelling into its own start: the liked Backwards, longer and calmer | low | none |
| 20 | Reverse dub | Backwards | dir -1, size 0.5, density 4, pitch 1, speed 1, back 0.8, scatter 0, jitter 0.05, detune 0, pan 0.5, tone 3500, echo 0.65, time 0.5, dark 1500, amp 1.5 (2) | reversed half-second phrases on an even step, each followed by a dark echo | echo build-up | none |
| 21 | Worn tape | Dub | drop 0.15, ramp 0.08, size 0.4, density 12, pitch 1, speed 1, back 0.4, scatter 0.2, jitter 0.05, detune 0.004, pan 0.4, tone 3000, echo 0.2, time 0.3, dark 2000, amp 1.4 (4.8) | the file a little behind itself on a tired tape, sagging in pitch over twelve seconds | snap at the end of each sag | none |
| 22 | Slow stop | Tape stop | drop 1, ramp 0.1, size 0.3, density 24, pitch 1, speed 1, back 0.1, scatter 0, jitter 0, detune 0, pan 0.2, tone 8000, echo 0.15, time 0.3, dark 4000, amp 0.95 (7.2) | the tape winding all the way down over ten seconds, then catching again | the gesture repeats: short and mid scenes only | none |
| 23 | Wow | Tape stop | drop 0.06, ramp 0.7, size 0.25, density 30, pitch 1, speed 1, back 0.15, scatter 0, jitter 0, detune 0.002, pan 0.3, tone 6000, echo 0.1, time 0.2, dark 4000, amp 1 (7.5) | a warped record, the pitch sagging and catching under every second and a half | snap (LFSaw falls then jumps back) | none |
| 24 | Long dub | Dub | drop 0.03, ramp 0.1, size 0.5, density 3, pitch 1, speed 1, back 1, scatter 0, jitter 0.02, detune 0, pan 0.9, tone 2500, echo 0.8, time 0.75, dark 1000, amp 1.5 (1.5) | three phrases a second into a long dark echo that keeps answering | mud and level as the 0.8 echo builds | none |
| 25 | Reverse swell | Backwards | dir -1, size 2.5, density 2, pitch 1, speed 0.5, back 3, scatter 0.3, jitter 0.5, detune 0.003, pan 0.8, tone 5000, echo 0.4, time 1.2, dark 2000, amp 1.5 (5) | two long reversed swells a second, each rising out of nothing into a word | low | none |

**Rhythmic** (7). Density is `bpm / 60 * sub`; time is in beats (`beats`) and set from the bpm; lock 1. Values
for 90 bpm in brackets.

| # | name | base | values | you hear | risk | need |
| --- | --- | --- | --- | --- | --- | --- |
| 26 | Pulse | Gate | lock 1, sub 2 (density 3), size 0.18, pitch 1, speed 1, back 0.25, scatter 0, jitter 0, detune 0, pan 0.3, tone 6000, echo 0.3, beats 0.75 (time 0.5), dark 3000, amp 1.8 | the voice cut into even eighths on the scene's tempo with a dotted echo | nervous, mild | tempo |
| 27 | Triplets | Gate | lock 1, sub 3 (4.5), size 0.12, pitch 1, speed 1, back 0.5, scatter 0, jitter 0.02, detune 0, pan 0.6, tone 5000, echo 0.25, beats 0.667 (0.444), dark 3000, amp 1.9 | the same voice in triplets, a rolling three against the pulse | nervous, mild | tempo |
| 28 | Half time | Gate | lock 1, sub 1 (1.5), size 0.6, pitch 0.749, speed 0.5, back 1, scatter 0, jitter 0, detune 0.002, pan 0.5, tone 3000, echo 0.5, beats 0.5 (0.333), dark 1500, amp 1.5 | one long chunk a beat, a fourth down, heavy and slow | mud, mild | tempo |
| 29 | Shuffle | Stutter | lock 1, sub 4 (6), size 0.08, pitch 1, speed 1, back 0.1, scatter 0.15, jitter 0.01, detune 0, pan 0.8, tone 7000, echo 0.35, beats 0.75 (0.5), dark 4000, drop 0.2, ramp a bar (0.375), amp 2 | sixteenth chops that sag across each bar like a tape | nervous: mid scenes in storms only | tempo |
| 30 | Heartbeat | Gate | lock 1, sub 1 (1.5), size 0.3, pitch 0.5, speed 1, back 0.3, scatter 0, jitter 0, detune 0, pan 0, tone 900, echo 0.55, beats 0.25 (0.167), dark 600, amp 2 | a low thud a beat with a quick answer after it, the voice as a heartbeat | mud; little on a phone | tempo |
| 31 | Pendulum | Backwards | lock 1, sub 2 (3), dir -1, size 0.4, pitch 1, speed 1, back 0.6, scatter 0, jitter 0.03, detune 0, pan 1, tone 5000, echo 0.2, beats 1 (0.667), dark 2500, amp 1.6 | reversed eighths swinging from side to side | low (the liked rhythmic Backwards) | tempo |
| 32 | Skip | Gate | lock 1, sub 4 (6), speed 0, size 0.07, pitch 1, back 0.07, scatter 0, jitter 0, detune 0, pan 0.2, tone 7000, echo 0.2, beats 0.5 (0.333), dark 4000, amp 1.8 | a CD skipping: the same 70 ms on sixteenths, changing every eight seconds as new sound passes under it | nervous, harsh | tempo |

**Glitch** (2, kept few on purpose: the owner disliked nerves)

| # | name | base | values | you hear | risk | need |
| --- | --- | --- | --- | --- | --- | --- |
| 33 | Splinter | Gate | size 0.03, density 20, pitch 1, speed 1, back 0.5, scatter 0.3, jitter 0.1, detune 0, pan 0.7, tone 9000, echo 0.4, time 0.0625, dark 6000, drop 0.5, ramp 3, amp 2.2 (0.6) | the voice broken into clicks and a buzzing echo, the tape slipping three times a second | nervous, harsh: short storm scenes only | none |
| 34 | Crumble | Sparks | size 0.05, density 30, pitch 0.5, speed 1, back 2, scatter 1, jitter 1, detune 0.03, pan 1, tone 2500, echo 0.3, time 0.11, dark 1500, amp 2 (1.5) | the sound crumbled into low dust, an octave down so it rattles rather than chirps | nervous | none |

**Spectral** (4, by frozen overlap; real spectral processing is refused in section 7)

| # | name | base | values | you hear | risk | need |
| --- | --- | --- | --- | --- | --- | --- |
| 35 | Smear | Frozen choir | freeze 1, size 3.5, density 6, scatter 1, jitter 3, pitch 1, speed 0, back 3, detune 0.002, pan 1, tone 6000, echo 0.3, time 1.2, dark 3000, amp 1.4 (21) | the last eight seconds held and averaged into one slowly shifting colour | CPU (overlap 21), mud, mild | freeze |
| 36 | Spectrum | Slow motion | size 2, density 10, scatter 1, jitter 3.5, pitch 1, speed 0.05, back 4, detune 0.02, pan 1, tone 3500, echo 0.6, time 1.4, dark 1800, amp 1.4 (20) | the file's colour without its time, a slowly moving chord of its own spectrum | CPU, mud | none |
| 37 | Prism | Frozen choir | freeze 1, size 1.5, density 12, scatter 1, jitter 2, pitch 1.5, speed 0, back 2, detune 0.002, pan 1, tone 5000, echo 0.45, time 0.9, dark 2500, amp 1.3 (18) | the frozen colour a fifth up, bright and wide | harsh, mild | freeze |
| 38 | Ember | Frozen choir | freeze 1, size 2.5, density 8, scatter 0.8, jitter 2, pitch 0.5, speed 0, back 3, detune 0.004, pan 0.8, tone 1200, echo 0.5, time 1.1, dark 800, amp 1.5 (20) | the frozen colour an octave down, a dark glow | mud | freeze |

That makes 54 patches (10 page, 6 cast today, 38 new): drone 9, cloud 8, choir 9, tape 11, rhythmic 9, glitch 4,
spectral 4. `amp` here is a first guess beside the existing ones (1.3 to 1.6 for overlapped patches, 1.8 to 2.2
for sparse ones); every patch's level must be MEASURED on one source before it plays (step 4), because Cloud's
`amp 1.5` already clips 81 samples in 88 s (MEASURED, `lessons/workers-cast.md#grains`).

### 2.4 Parked: three patches that would need a ring change

| name | family | what it needs | why parked |
| --- | --- | --- | --- |
| Chord cloud | choir | each grain picks 1, 1.5 or 2 (a chord inside the ring): TChoose or Select in the compiler and the program | the ring is shared by five pages and the container; the harmonizer layer already gives a chord |
| Cued stop | tape | `drop` from a Phasor reset at a cue, so the stop starts when asked (LFSaw's phase is free running) | the tape stop interlude in 3.3 does it with pitch and speed instead |
| Euclid gate | rhythmic | a `gate` multiplier on the trigger, set per step | the resonator pulse already plays the pattern; and see the post bus in step 10 |

## 3. Scene types

### 3.1 The envelope, generalised

Today: `envelope(x, dry)` is 0 through the dry share, up over 0.18, 1 until 0.85, down over 0.15. It becomes
`envelope(x, { dry, rise, hold, floor })`: dry share, then a rise of `rise`, a hold to `hold`, a release to 1;
`floor` is the wet left at the top of a light scene's arc (1 for a deep scene). The layers follow the same four
numbers (`layerLevel` takes them too). Today's call is `{ dry, rise: 0.18, hold: 0.85 }`, so grammar 1 stays
bit for bit.

### 3.2 The nine types

| type | dry share | rise | hold until | peak (wet) | layers | families | length | interludes out | how often |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dry intro | 0.5 to 0.8 | 0.15 | 0.92 | 0.3 to 0.5 | key drone low; nothing else | cloud, tape | mid | dissolve, filter | opens most sections |
| Naked speech | 1 | none | none | 0 | none, noise 0 | none | long | dissolve, dead air | 1 in 8 scenes on talk, never on music; never twice in a row |
| Slow build | 0.15 to 0.25 | 0.5 | 0.9 | 0.8 to 1 | drone from the start, resonators from half way | drone, cloud, choir | long | echo wash, drone bridge | in arrival, chapel |
| Deep drone | 0.1 to 0.15 | 0.15 | 0.9 | 0.9 to 1 | both drones, resonators fifths or minor7 low, room 0.3 to 0.5 | drone, spectral | long | drone bridge, frozen bridge | in arrival, night |
| Granular storm | 0.1 | 0.1 | 0.85 | 1 | harmonizer cluster or none; ghosts as events every 15 to 30 s | cloud, glitch, spectral | short, mid | tape stop, dead air | only when the tide is over 0.5 |
| Rhythmic | 0.15 | 0.12 | 0.88 | 0.8 to 1 | pulse 70 to 110 bpm, resonators on the pulse, key drone | rhythmic, tape | mid | tape stop, filter | in ritual, tape |
| Choir | 0.15 to 0.25 | 0.25 | 0.88 | 0.8 to 1 | harmonizer octfifth or triad, resonators on the chord, key drone | choir, spectral | mid, long | chord hand-over, frozen bridge | in chapel, ritual |
| Breath | 0.3 | 0.2 | 0.6 | 0.2 to 0.4 | drone fading, nothing else | drone, cloud (lightest members) | 25 to 40 s (a new `breath` length, 30) | dissolve, dead air | after every storm, ends weather |
| Coda | 0.1 | 0.2 | 0.5 | 0.8, then a long release over the last half | drone fading with it | drone, spectral (frozen) | long | dead air, drone bridge | ends arrival, ritual, tape |

**What the votes learn per type.** Two new features in `FEATURES`: the scene type (weight 2) and the patch's
family (weight 2), beside the patch name's 3. So a liked Rewind lifts the other tape patches a little and
Rewind itself more, and a disliked storm lowers storms without banning a patch that played well elsewhere.
The dry share gets its own kernel feature (weight 1), so a liked long dry intro moves dry shares up. An old vote
has no type: its family is looked up from its patch name, its type feature counts 0.

**Ghosts per type** (the backlog's *"ghsot voices a bit lame"*): off in dry intro, naked, breath and coda;
as today in slow build and choir; as events in deep drone and storm: louder (level 0.25 to 0.4), longer (8 to
15 s), slowed (shift 0.5 or 0.75 only), in the big room. The longer the file, the more visits (backlog: visits
every `ghostEvery * clamp(300 / seconds, 0.5, 1.5)`).

### 3.3 Interlude kinds: the transitions

The new piece in both engines: **a crossfade path**, chosen per interlude, that replaces the dial's mix during
the blend. Pure, in a new cast-only module `demo/radio/cast/crossfade.mjs` (added to `SC_FILES` in
`workers/cast/sc-files.mjs`, so the container runs the same file, as it does `soften.mjs`). Not named
`handover`: that word already means the twin handover (`lessons/workers-cast.md#handover`). It returns the same
shape as `createMix(...)(t)`: `{ st: [{ clear, echo, bright }] x 2, near, noise, whistle, pitch }`.

| path | number | outgoing slot | incoming slot | noise, whistle |
| --- | --- | --- | --- | --- |
| dial | 0 | today: the needle's sweep by handTurn | today | today |
| dissolve | 1 | clear `cos(pi k / 2)`, echo 0, bright 3500 | clear `sin(pi k / 2)`, echo 0, bright 3500 | 0.04 floor, whistle 0 |
| filter | 2 | equal power as dissolve, bright 3500 down to 300 over k 0 to 0.6 (log) | bright 300 up to 3500 over k 0.4 to 1 | 0.04, 0 |
| gap | 3 | out over k 0 to 0.35 (cosine) | in over k 0.65 to 1 (sine), nothing between | 0, 0 |

At k 1 every path ends where `mix(SLOTS[to].at)` is for the incoming slot (clear 1, bright 3500), and the gains
still move through the 0.04 s smoothing both tuners apply, so the landing has no step. With any path other than
dial, the incoming slot's echo during the last seconds of the dwell is 0 too (`dwellMix`), which removes the leak
in 1.3.

**Exactly what changes in `demo/radio/cast/local.mjs`:**
- `DEFAULTS` gets `path: 0`; `LIMITS` gets `path: [0, 3]`; `clampSet` rounds `path` to a whole number.
- `tick()`: `m = ctl.path && phase === 'blend' ? crossfade(ctl.path, from, k) : ctl.path && phase === 'dwell' ? dwellMix(mix(tune), from) : mix(tune)`. The clock is untouched; `tune` still sweeps for the status.
- `status()` reports `path`.

**Exactly what changes in `workers/cast/container/mixer.mjs`:** the same three lines in `DEFAULTS`, `LIMITS`,
`clampSet`, and the same expression in `block()` where it says `m = mix(tune)`; `status()` reports `path`.
`local-test.mjs` already goes red if the two LIMITS differ.

**Drivers** (`workers/cast/container/live.mjs` tick and `demo/radio/cast/index.html` lifeTick, the same two
lines each): at the blend's start `e.set('path', s.iPath)` beside today's `e.set('noise', s.iNoise)`; during the
blend the layers' level is the interlude's `v.layer` instead of 0, and `layers.bridge(v.bridge)` when it carries
one. `layers.mjs` gets `bridge({ drone, freeze, room, roomSize, resAmp })`: the same `/n_set`s `apply` makes,
for the blend only. Nothing else in `layers.mjs` changes.

The interlude kinds (life.mjs `IKINDS`), each made in both engines by the parts above:

| kind | path | blend s | noise | ring during the blend | layers during the blend |
| --- | --- | --- | --- | --- | --- |
| radio (today, demoted) | dial | 10 to 16 | 0.25 to 0.5 (halved) | wet 0.15 to 0.3 | 0 |
| drift (today, quieter) | dial | 8 to 14 | 0.1 to 0.25 | wet 0.3 to 0.5 | 0 |
| clean (today) | dissolve | 4 to 8 | 0 | wet 0.05 to 0.15 | 0 |
| smear (today) | dial, freeze swell | 8 to 18 | 0 to 0.12 | as today | 0 |
| dissolve | dissolve | 8 to 20 | 0 | wet 0.1 to 0.25 swell | the scene's level, halving |
| filter hand-over | filter | 10 to 20 | 0 | the hand on `tone` (forced), down then up | 0.5 of the scene's |
| echo wash | dissolve | 10 to 18 | 0 | wet up to 0.8, extra `echo 0.85, time 0.9 to 1.3, dark 2500, scatter 1, size 1` | room mix to 0.8, size 0.95 |
| tape stop | gap | 6 to 10 | 0 | wet 1 over k 0 to 0.4, extra `pitch` 1 to 0.25 and `speed` 1 to 0 (eased), then out | 0 |
| frozen bridge | gap | 10 to 18 | 0 | extra `freeze 1` from k 0 (a real hold, not a swell), `size 1.5, density 12, scatter 0.6`, wet 0.9 until k 0.7, out by k 1 | 0 |
| drone bridge | gap | 10 to 20 | 0 | wet 0 | drones held at 0.5 (bridge), gliding to the next scene's key at k 0.5 |
| chord hand-over | dissolve | 12 to 20 | 0 | wet 0.2 | resonators held at 0.4 on both files; retuned to the next scene's chord at k 0.5 (a pivot: the next key is usually a fifth, a fourth or a step away) |
| dead air | gap | 3 to 6 | 0 | 0 | 0, drones to 0 at k 0 (their 4 s lag leaves about -30 dB after 2 s) |

Odds: radio 0.05 (and only between sections, as the station's signature), drift 0.05, the rest by the scene
type's list. Never the same kind twice in a row (today's rule stays). The next scene's key for the drone bridge
and the chord hand-over comes from `life.scene(i + 1, { kind: nextItem.kind })`, built early; the heard key
replaces it a few seconds into the scene as today, and the 6 s glide takes it there.

How the tape stop and the frozen bridge work with no ring change (INFERRED from the program): `pitch` and
`speed` are read per grain and per sample with no lag, so the 50 ms driver steps land as per-grain steps, not
zipper; and `freeze 1` makes the write rate and the write level both 0. In the container all of this arrives
0.43 to 0.72 s early (1.2), which is under a second against blends of 6 s and more.

## 4. Dynamics over the whole piece

### 4.1 Sections

A section is three to six scenes in an order of types:

| section | scenes, in order | intensity shape |
| --- | --- | --- |
| Arrival | dry intro, slow build, deep drone, coda | up, top, down |
| Weather | dry intro, slow build (cloud), storm, storm or rhythmic, breath | up late, peak, drop |
| Ritual | dry intro, rhythmic, rhythmic, choir, coda | up early, plateau, down |
| Chapel | naked speech or dry intro, choir, deep drone, breath | low, up, down |
| Tape | dry intro, slow build (tape), rhythmic, coda | up, peak, down |
| Night | deep drone, spectral deep drone, breath | high and still, then a breath |

A section can drop or repeat its middle scene (three to six scenes); its first scene is always one you can
recognise the file in (dry intro or naked, except Night, which follows something lighter by rule). This is the
owner's ask in structure: listen to the original for a while, then go deep.

**Never the same section twice in a row**, and Weather only when the tide is over 0.5. The choice between the
allowed sections is weighted by how well the section's mean intensity fits the tide now, times what the votes
say about that section (4.3).

### 4.2 The tide

The intensity of scene i becomes:

`intensity = typeLo + (typeHi - typeLo) * tide(T_i) + jitter (plus or minus 0.075)`

where `T_i` is the planned time at scene i (the sum of planned dwell and blend before it, so it is pure in the
seed and twin handover still rebuilds it to the bit), and `tide(T) = 0.5 - 0.5 cos(2 pi T / 3600 + phase)`
with the phase from the seed. Each type has its band (dry intro 0.3 to 0.5, deep drone 0.8 to 1, storm 0.85
to 1, breath 0.1 to 0.3). So over an hour the piece swells from mostly arrivals and chapels to weather and
night and back; inside each section the types still rise and fall; inside each scene the envelope does. Three
nested arcs where today there is one cosine over five scenes. The real time drifts from the planned time when
files are shorter than their scenes (the short-files rule), which only stretches or squeezes the tide.

### 4.3 How the votes steer it

- **What, not when.** Votes weight the section choice (a section type's score is the sum of its scenes' votes,
  the weight `e^(2 * score / (abs(score) + 4))`, at most about 7 times), the scene type and family (the new
  features), and the patch (as today). They never move the tide or the order inside a section, so a liked storm
  does not make the whole hour a storm.
- **Explore always.** Today's rule stays: the best candidate is at most `e^LEAN` times the worst, half the scenes
  at least are new, a disliked scene's core never comes back. With 54 patches, every patch should still play in
  a long life; `life-test.mjs` checks it.
- **Votes carry the new fields.** A def gains `type`, `section`, `iPath`, and `set` (the bpm-tied values); old
  defs without them still parse.

### 4.4 Grammar 1 and grammar 2

`createLife({ seed, votes, grammar })`: grammar 1 is today's life exactly (protected by a fixture of today's
scene ids), grammar 2 is this plan. The page's `local` uses grammar 2 first; the container (`live.mjs`) stays
on grammar 1 until the owner has voted grammar 2 scenes locally, because `life.mjs` is copied into the
container on every deploy and a deploy refreshes a running station (`lessons/workers-cast.md#refresh-on-deploy`).
The crossfade path in the mixer can ship to both at once: grammar 1 never sets `path`, so the air sounds as now.

## 5. Cost

### 5.1 CPU per family in the container (INFERRED from the overlap; to be MEASURED)

A patch changes values, not the graph, so the ring's CPU moves only with the number of grains sounding at once.
Every layer program runs all the time at amp 0 (`createLayerEngine` starts all of them), so scene types do not
change the layers' CPU. MEASURED today: scsynth 4.1 % of one core for the ring and every layer, node 10.8 to
11.0 %, the container 24.7 to 25.2 % of a 50 % budget.

| family | overlap | ring CPU against today's typical patches (overlap about 10) |
| --- | --- | --- |
| glitch, rhythmic | 0.5 to 6 | lower |
| tape | 1.5 to 8 | lower |
| cloud, choir | 5 to 16 | about the same |
| drone | 10 to 20 | up to twice |
| spectral | 16 to 24 | about twice |

Even if the spectral family doubled all of scsynth's 4.1 %, the container would sit near 29 % of a core, inside
its 50 %. INFERRED, because nobody has split scsynth's 4.1 % between the ring and the layers. The overlap cap of
24 keeps the worst case bounded. The crossfade path costs nothing measurable (a few multiplications a block, in
place of `mix(tune)`). The browser: one ring 23 to 25 % of a core with everything on (MEASURED,
`plans/plan-cast-reinterpret.md` section 1); watch `glitchCount` on the spectral patches.

### 5.2 What stays local first

Grammar 2 (types, sections, tide, families, guards, the 38 patches, freeze after dry, bpm-tied rhythm, the new
interlude kinds) plays in the page's `local` first. The crossfade path, `bridge()`, and `path` in both LIMITS go
to both engines together, since they are inert under grammar 1. The container moves to grammar 2 after votes,
and after one `live-test.mjs --live` run per family (5.3).

### 5.3 Test changes

`demo/radio/cast/life-test.mjs` (pure, no browser):
- **change** "all ten patches are used" to every one of the 54 plays in 2000 scenes; **change**
  `CAST_PATCHES.length === 6` to 44, each on an existing base.
- **new** every patch is inside PATCH_LIMITS: `clampPatch` refuses nothing and changes no value.
- **new** no two patches are the same after rounding on size, density, pitch, speed, freeze, dir, lock, scatter
  (the grain-presets plan's "no two the same" check); NEGATIVE CONTROL: a copied patch goes red.
- **new** overlap at most 24 for every patch; NEGATIVE CONTROL: density 64, size 4 goes red.
- **new** the duck rule holds for every scene's window and tweaks under grammar 2; NEGATIVE CONTROL: grammar 1
  breaks it (the voted Shimmer scene is one).
- **new** every tweak is within its family's guard and 0.15 of the patch's value.
- **new** a frozen patch is freeze 0 through its dry share and 1 after.
- **new** a locked patch's density is `bpm / 60 * sub` to 1e-9 and its time is its `beats` of the scene's beat.
- **new** never the same section twice in a row; storms only above tide 0.5; every type and every section occurs.
- **new** over a planned hour, the mean intensity of the high-tide half is above the low-tide half by 0.2.
- **new** votes: a liked section type and a liked family come up more; every family still plays.
- **new** the 11 votes from /votes as a fixture still count (Backwards scores positive under both grammars).
- **new** grammar 1 rebuilds today's first 40 scene ids bit for bit (a fixture saved before the change).

`workers/cast/mixer-test.mjs` and `workers/cast/local-test.mjs`:
- **new** `crossfade`: dissolve has `a^2 + b^2 = 1` within 1e-9 at every k; gap has both legs 0 from k 0.35 to
  0.65; filter's brights are monotonic; noise and whistle as the table; every path at k 1 matches
  `mix(SLOTS[to].at)` for the incoming slot within 1e-3; NEGATIVE CONTROL: dial at k 0.5 has noise over 0.2.
- **new** a rendered blend of two tones with path 1 has a noise tap of 0, and path 0 does not.
- **new** with path set, the incoming slot's echo during the dwell is 0.
- the existing LIMITS parity check covers `path` once both have it.

`workers/cast/live-test.mjs`: the existing planner-apart check, run for grammar 2 as well (def, control, value,
wet to the bit). With `--live`: one run per family with its heaviest patch held, reading scsynth's own
`/status` average, the cgroup's CPU, xruns at period 8192 and the MP3's peak. `demo/radio/cast/layers-test.mjs`:
`bridge()` sets what it says. Levels: every new patch's rms on the browser test's voice source, against
Cloud's, so the `amp` column can be corrected before anything plays.

Verify economically: `life-test`, `mixer-test` and `local-test` are pure and quick; one `live-test --live` per
family at the end, not per patch.

## 6. Build order

| step | what | effort | answers |
| --- | --- | --- | --- |
| 1 | `crossfade.mjs` (dissolve, filter, gap, dwellMix), `path` in both engines and both drivers, the kinds dissolve, filter hand-over, dead air; radio and drift demoted | S | *"too winds noise, cartoonish"* |
| 2 | families and guard ranges for the hand and the tweaks; the duck rule; Shimmer and Sparks under their guards | S | ducks, nervous elements, birds |
| 3 | freeze after the dry share; `set` (absolute values) in a scene def, merged in both drivers' `engPatch` | S | frozen patches freezing the blend |
| 4 | the 38 patches through the `full()` helper; the patch checks; one level measurement and the `amp` column corrected | M | *"way more payvhes"* |
| 5 | the nine scene types and the generalised envelope; type and family features in `FEATURES`; the breath length | M | *"way more ... scenes"* |
| 6 | sections, the tide, never twice in a row, votes on sections; `grammar` 1 and 2 | M | *"dynamic musical installation piece"* |
| 7 | the bridges: `layers.bridge()`, layers during a blend, echo wash, tape stop, frozen bridge, drone bridge, chord hand-over | M | the rest of the transition list |
| 8 | density and echo time from the scene's bpm for locked patches (`sub`, `beats`) | S | rhythm in time |
| 9 | ghosts as events in deep and storm scenes, visits scaled by the file's length | S | *"ghsot voices a bit lame"*, the longer file the more ghosts |
| 10 | later, if wanted: compile the ring to a private bus in the cast only (a `bus` option on `createRingEngine`, default 0, so the other four pages are unchanged) and a cast-only post program: a real reverb wash of the file, a euclidean gate, a master filter | L | parked transitions and rhythm |
| 11 | the container on grammar 2, after votes and one `--live` run per family | S | on air |

Steps 1 to 3 are one sitting and audible on their own. Step 4 without step 2 would make things worse (more
patches pushed outside themselves), so 2 comes first.

## 7. Refused, and why

- **No change to the ring's program or its PATCHES list.** Five pages and the container share it; settings and
  the granulator pages list PATCHES. Every new sound is a cast patch on a page patch.
- **No real spectral processing** (FFT, PV_ freeze or blur). Not in sclang-lite, and it would mean FFT buffers in
  both engines. The spectral family is frozen overlap, named for what it sounds like, not how it is made.
- **No second ring** in parallel: about 0.25 of a core each and a bigger instance on air
  (`plans/plan-cast-reinterpret.md` 2.8). The families get variety from one ring.
- **No pitch over 1.3 on short scattered grains**, anywhere. That is the ducks.
- **Votes do not steer the tide.** They choose what plays, not when the piece is loud, so it stays a piece.
- **The radio sweep is not removed**, only made rare: it is the station's identity. If the owner wants it gone,
  its odds go to 0 and nothing else changes.
- **Naked speech still passes the tuner's AM band and saturation.** A bypass of the band for a naked scene
  (asked in the backlog as *"naked nonprocesses speech only"*) touches `createTunerGraph` in the shared
  `demo/shell/tuner-mix.mjs` and the container's `createTuner`; it is its own item, not in this plan.

## 8. Not settled without listening

- Whether 54 patches are 54 sounds. The check says no two are equal in numbers; the ear may hear four drones as
  one. Families are where to cut if so.
- Every `amp`: the levels are guesses until measured.
- Whether Plainchant (a fourth up at half speed) and Choir of fifths quack on talk despite the guard.
- What a frozen patch catches after the dry share: a word, a breath, or the room. Possibly the freeze point
  should wait for a loud moment (an onset from the existing detector); not planned yet.
- Whether Organ flutters, whether Wow and Worn tape's snap is a charm or a fault.
- Whether Hum, Heartbeat and Ember are audible on a phone at all.
- Whether a dissolve sounds too plain for a radio piece, and which of the eight new interludes the owner likes;
  the votes will say, since `iKind` is already a feature.
- Whether the leak of the next file before each blend (1.3) is audible and part of the cartoon.
- Whether an hour is the right tide for someone who listens for twenty minutes; the period is one number.
- Rhythm on air: the pulse runs on node's timers at half a vCPU; nobody has measured the hits' jitter in the
  MP3. A steady rhythmic scene is where it would show.
- CPU per family, both engines (5.1 is inferred).
