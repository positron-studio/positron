# plan-radio1965-landscape: the scan landscape, full screen, moved by our radio1965 stream

Asked 2026-10-23: *"plan a positron.studio/radio1965 page what uses our landcsape visualization, fullscreen (desktop
and mobile) and parameters take data from our steam"*, then *"listeners count is also an input?"* (yes).

Status: PLAN, nothing built. Read from the code on 2026-10-23 (demo/shader/landscape/, demo/shell/scan-field.mjs,
workers/cast/worker.mjs, demo/radio/cast/index.html). Nothing measured in a browser; the phone GPU cost is unknown.

## 0. Answers, short

- **A page at https://positron.studio/radio1965/**: the free address (no folder, no manifest row, no route takes it
  today), one full-screen picture, a tap to start sound.
- **The picture is /shader/landscape/'s scan field** (demo/shell/scan-field.mjs), its six knobs driven by the
  stream instead of a hand.
- **Sound and the per-frame motion come from our own container's MP3**, never from Väin's server. Scene-level numbers
  come from the cast's state. **The listener count is one of the inputs.**
- **The blocker:** the two routes it needs are a cast worker change, and a cast deploy hands Väin's mount to a new
  container, which ends every listener's connection. So that part waits until the 2-day broadcast started
  2026-10-23 07:10Z is over.

## 1. What exists

- **The picture.** `createScanField` draws ridges from a data texture: an audio level per frame plus grain events
  (`ev.of === 'grain'`) bucketed into rows. /shader/landscape/ turns six of its uniforms into knobs, each a bay node
  whose `value-in` can take a wire:
  `rows` 8 to 132, `height` (ampM) 0.5 to 8, `loud` (ampL) 0 to 0.5, `swell` (swellY) 0 to 0.05,
  `counts` (bucket) 0 to 1, `heave` 0 to 1. Every other number holds the `quartz` look.
- **The stream's state**, in `GET https://cast.positron.studio/status/radio1965` today:
  - the file playing, `now.title`;
  - the scene, `life.def`: `kind` (music, speech, field), `patch`, `param`, `section`, `type`, `dwell` and `blend`
    seconds, `iWet` (0 to 0.95), `tweak.density`, `tweak.echo`;
  - the key, `key.root` and `key.minor`, and whether it was heard;
  - the layers, `layers.drone` and `layers.droneLevel`, `res` and `harm`;
  - `listeners.now` and `listeners.peak`, read from Väin's Icecast every 55 s by the Caster;
  - `seconds` on air.
- **Listeners over time**, `GET /listens/radio1965`: Analytics Engine rows, edge cached 30 s, public, and it never
  asks the container.
- **Full screen**: demo/shell/fullscreen.mjs, the real API where there is one and a fixed cover on iPhone, which has
  no element full screen.

## 2. Two things the page must never do

1. **Ask the container per visitor.** `/status/<station>` calls the container's `/status` live on every request (no
   cache, worker.mjs `status()` then `cstatus()`), and one such call has stalled node's write loop 350 ms
   (positron-cast §7). A public page polling it is a load generator pointed at the broadcast.
   ⚠️ /radio/cast/ already polls it every 3 s for each of six stations while open. That is a suspect for the audio
   holes reported 2026-10-23, not yet tested (section 8).
2. **Connect to Väin's mount.** `live.uuu.ee:8001` is plain HTTP, so an HTTPS page cannot play it at all
   (mixed content). And each connection would be a listener in their statistics.

## 3. The two routes, on the cast worker (after the broadcast)

- **`GET /state/radio1965`**: built from what the Caster already holds, the last status it read on its 30 s alarm
  and its listener poll. It never calls the container. Edge cached 5 s, CORS `*`. It carries only what the page
  maps: title, kind, patch, section, iWet, density, echo, key, droneLevel, res and harm on or off, listeners now and
  peak, scene index, the scene's start and blend, seconds on air.
  - Granularity is the alarm's 30 s. Scenes last 40 to 120 s and blend over 8 to 20 s, so that is enough to start;
    finer means the container pushing scene changes to its Caster, a second step.
- **`GET /listen/radio1965`**: the preview pattern (`listen()` and `createEar`), opened on our own container's MP3
  instead of Väin's. Every visitor is an ear on the Caster, the same audio Väin's listeners hear, and Väin's server
  sees nothing.
  - Cost: Workers egress, 16 kB/s per ear.
  - A visitor here is not in Väin's listener count. The page can show both numbers: theirs and ours.
- Both go in the same deploy, after the broadcast, with every Väin mount checked off air first (positron-cast §6).

## 4. The mapping, every input a real field

| knob | range | driven by | why |
| --- | --- | --- | --- |
| rows | 8 to 132 | listeners: 16 + 12 per listener, capped at 132 | a listener is lines in the landscape |
| height | 0.5 to 8 | `iWet` | dry scenes lie flat, wet ones rise |
| loud | 0 to 0.5 | the audio level each frame, from the MP3 through an AnalyserNode | the motion is the sound |
| swell | 0 to 0.05 | `droneLevel`, 0 when no drone | a drone is a slow swell |
| counts | 0 to 1 | `tweak.density` | the granulator's density is the grain counts |
| heave | 0 to 1 | kind: speech 0.2, field 0.5, music 0.8 | speech sits still, music moves |
| colour | the look | `key.root` as hue (12 steps), minor darker | one key, one colour |

- **Grain events:** the browser has no grain ring of its own here, so the `counts` rows are filled from onsets in the
  audio level (a peak picker on the analyser) rather than from SendReply. A real grain feed from the container is a
  later step.
- **Every change glides over the scene's own `blend` seconds.** No jump, because nothing on a page may jitter while
  it plays (positron-ui, owner corrections).
- **No text on the picture** (*"no annotations on a visual"*). The title, kind and both listener counts go in a
  footer that shows on tap, and is hidden in full screen.

## 5. The page

- Mount, the picture filling the window (`100dvh`, safe-area insets), one button over the picture before the first
  tap: **Listen**, which starts the ear and the AudioContext in one press (one press gives sound at once).
- Full screen: a button in the footer (fullscreen.mjs). Phones get the fixed cover, and the screen wake lock while
  playing so it does not dim.
- Without a tap, or without sound: the picture still moves on the state alone (rows, height, swell, heave, colour),
  with `loud` resting at a floor.
- The patchbay under the fold, drawn from its own bay:
  - `cf-cast:radio1965:audio-out` -> `<tab>:speaker:audio-in` and `<tab>:landscape:audio-in`
    (transport https, through the ear);
  - `cf-cast:state:value-out` -> `<tab>:landscape:value-in`;
  - `uuu:icecast:value-out` (an `external` node, the listener count the Caster reads) -> `cf-cast:state:value-in`.
- The address: `demo/radio1965/index.html` as a manifest row, top level as asked. A concept slug would have to be a
  word with no digit. Whether it is listed on the front page is a decision (section 9).

## 6. What can be built now, during the broadcast

- **The page, the picture, full screen, the mapping and the footer**, fed by a stand-in for `/state` (a local file or
  `demo/fake-*` style server) and an archive file for the sound. Site only, so nothing reaches the cast.
- **The listener input, live, already**: `/listens/radio1965` is public and edge cached, so the `rows` knob can follow
  the real listener count today without a cast deploy.
- Then, after the broadcast: the cast deploy with `/state` and `/listen`, and the page switches from stand-in to live.

## 7. Cost and risk

- Phone GPU: the scan field's cost on a phone at full screen is not measured. Measure on an iPhone and an Android
  before calling it done (`?selfcheck=1` frame time).
- Ears: many visitors are many streams through one Durable Object. The preview ear has never had more than a few.
  Measure at 20 ears before sharing the link widely.
- The 30 s state lag: the picture changes up to 30 s after the sound does. Acceptable for a first version; say so in
  the footer's words rather than claim it is in step.

## 8. The audio holes, tested and not (2026-10-23)

- MEASURED, our side, 07:10Z to 07:18Z: 0 xruns, 0 underruns, 0 frames skipped, 0 drops, 0 restarts, 128 kbit/s
  leaving, the audio not falling behind the wall (a 4.7 s boot gap that does not grow), 43 % of the container's CPU.
  A monitor polls our status every 2 minutes and stops at the first anomaly.
- Not tested: whether the holes are in the network after our source, in Väin's Icecast, in a player, or made by the
  status polling above. Cheapest test: close every /radio/cast/ tab and listen whether the holes stop.

## 9. What the owner decides

1. Audio through our own ear (`/listen/radio1965`), as recommended, so no visitor counts on Väin's server: yes?
2. The mapping in section 4, or other pairings (for example listeners as colour instead of rows).
3. Listed on the front page, or unlisted until it is measured on phones.
4. Build the site part now against a stand-in, and the cast routes after the broadcast?
