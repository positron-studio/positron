# The cast, listenable on a commute

2026-10-19. Asked after the owner listened to preview for about 20 minutes on a
commute, no noise cancelling: boring, the effects inaudible apart from echoes
that repeat, the dry signal impossible to tell apart, Darth Vader voices, and
much harder to hear than any podcast in the same place. BACKLOG has the words.

## What went wrong, read from the code

1. **Level.** Every file is levelled to -23 LUFS (`workers/cast/gains.mjs`
   `TARGET`), the broadcast figure for a quiet living room. Podcasts and
   streaming sit at -16 to -14 LUFS. The dry share is 4 to 20 %, the granulator
   3 to 8.5 dB under the dry voice, the layers capped at 0.4. INFERENCE, not
   measured: the sum lands around -26 to -30 LUFS, 10 to 14 dB under a podcast.
   There is no compressor or leveller on the sum, only peak limiters, so the
   quiet stretches (already measured at -51 to -57 dB on 10-18) stay quiet.
   On a train everything under the noise floor is gone, and what is left is
   the loudest thing: the echoes.
2. **Darth Vader.** `MAX_PITCH 1` stopped voices going UP. Voices still go DOWN:
   `GHOST_SHIFTS [0.5, 0.5, 1]` (two ghosts in three an octave down), the
   harmonizer on 60 % of speech scenes with every voice under the speaker
   (`ODDS.speech.harm`), patches Fog at 0.75 and Cathedral at 0.5. The rule was
   about pitch up; the complaint was about transposing people.
3. **Timid by accretion.** Two days of fixes each made something quieter or
   rarer: `WET_CAP` 0.8, `LAYER_SCALE` 0.8, `CARRY` 0.2, `DRONE_TRIM`, no
   resonators, no rhythm, no stutter, ghosts 11 to 15 dB under. Each was right
   for the complaint in front of it, judged on LOCAL with good monitoring. The
   sum is a mix where nothing is ever clearly ON.
4. **No contrast.** *No naked speech* (10-18) plus *minimal time dry* (10-19)
   means the listener never hears the reference, so an effect has nothing to be
   heard against. The owner now says exactly that.
5. **Material.** The archive is 13 files, two of them 15 s clip tests, an audio
   test, several home and field recordings; newest first puts those in front.
   The concerts and tape loops carried the listen because of what they are.

## What to do, in order

1. **Loudness to podcast level, with a leveller.** On the container's sum, in
   SuperCollider (clipping cannot be undone in node): a slow leveller (AGC,
   seconds), then a compressor, then a true peak limiter at -1 dBTP. Target
   -16 LUFS integrated, loudness range under 8 LU. LOCAL gets the same chain.
   MEASURED by: 10 min of preview recorded and run through `ffmpeg ebur128`,
   before and after. Cheapest and most likely to change the commute listen.
2. **No transposed voices, in either direction.** A person's recording plays at
   pitch 1, always: ghosts as they are, harmonizer off speech and ambiguous
   files (kept only on music, or removed), Fog and Cathedral at 1. Low colour
   comes from synthesised drones and bass, never from pitching a person down.
   A life-test check: no voice path in 2000 scenes has a ratio other than 1.
3. **Contrast: dry, then one effect you can name, then dry.** A scene states the
   file dry for 8 to 20 s, then one effect comes in at full strength and stays
   long enough to be the subject, then goes. Fewer things at once, each louder.
   ⚠️ This changes *no naked speech* to *short naked speech, as a reference*,
   which is the owner's call.
4. **Retire what got repetitive.** The echo heavy patches (Fog, Cathedral,
   Tide, the echowash bridge) rarer or gone; the repetition the owner heard is
   probably those plus a 13 file archive.
5. **Material weighting.** Music, concert and tape loop files more often and
   longer; field, home and test recordings shorter visits or ghosts only.
   Reverses *"test recordings are fine"*, also the owner's call.
6. **Judge in the room it is for.** Each round is a rendered 20 min sample,
   loudness checked, listened to on a phone with ambient noise, not only on
   LOCAL at the desk.

## Not settled

- The output loudness in point 1 is arithmetic from the code. One recording of
  preview turns it into a number; the owner starts casts.
- Whether contrast (3) and material weighting (5) are wanted: both reverse
  earlier instructions.
