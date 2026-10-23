# Page lessons: /radio1965/

## header

demo/radio1965/index.html, built 2026-10-23 from plans/plan-radio1965-landscape.md. The scan landscape of
/shader/landscape/ (scan-field.mjs), full screen through the video panel, its six knobs driven by the radio1965
cast: rows by listeners (Väin's count plus our own ears, 16 + 12 each), height by the scene's wet, loud by the
level each frame, swell by the drone level, counts by the granulator's density, heave by the file's kind (speech
0.2, field 0.5, music 0.8). Every knob eases toward its target over the scene's own blend, so nothing jumps. No
colour from the key (owner: *"no color"*).

The sound is `cast /listen/radio1965`, our own container's frames (tap.mjs), never Väin's mount (plain HTTP, and a
listener in their statistics). The numbers are `cast /state/radio1965`, edge cached 5 s and never asking the
container, read every 10 s. Counts come from rises in the level, not from a grain feed: the page has no grain ring of
its own. Unlisted until it is measured on phones.

## ios-tap

iPhone Safari hands an AnalyserNode on a live stream's media element zeros (WebKit 180696), so the landscape moved on
the scene numbers and drift but showed no grains or sound-driven action (owner's phone, 2026-10-23: *"Ios do not get
grains or action??"*). When the analyser reads zeros for 2 s while the element's time moves, the page opens a second
copy of our own /listen, cuts it at MP3 frame boundaries, decodes each chunk and schedules it silently into the
analyser, as /radio/cast/ does for its wave (lessons/workers-cast.md#ios-scope). One more ear on our own server, never
on Väin's.
