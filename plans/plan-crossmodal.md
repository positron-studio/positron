# plan-crossmodal: sound into picture, picture into sound

Status: plan, 2026-10-28. INFERRED unless READ.

**Goal.** Converter nodes between `audio` and `frame` (and `pointer`), so one
medium can play another, through the patchbay with its shape checks.

## 1. Converters, not bends

A link stays in one medium (plan-bends). A change of medium is an `engine` node
with an input port of one medium and an output of another. Simplest of all:
audio as control, a loudness or envelope `value` into fx parameters, no
conversion of the picture needed.

## 2. Audio to frame

| Converter | What |
|---|---|
| `scope-xy` | stereo left and right as x and y: oscilloscope figures |
| `scope-trace` | waveform across the screen |
| `spectrum` | FFT as bars or a scrolling spectrogram (256 points fit the Pico 2) |
| `raster-write` | samples written as pixels, line by line |

## 3. Frame to audio

| Converter | What |
|---|---|
| `wavetable-rows` | each row is one single-cycle wave (128 samples); scanning rows makes timbre |
| `score-read` | rows as frequencies, columns as time, after Murzin's ANS synthesizer (1958) and Oram's Oramics |
| `raster-read` | pixels in scan order as a waveform; one 128x64 frame is about 170 ms at 48 kHz |
| `image-control` | lit count, centroid, a column's cells as cc or notes; a Life automaton as a sequencer |

## 4. The loop

audio to frame to audio is audiovisual feedback. It needs the bend guards:
limiter, stuck-note guard, panic.

## 5. Where the code lives

Small C beside `fx.c`: `fx_scope_xy`, `fx_spectrum`, `fx_wavetable_row`, so the
wasm, the Pi and the Pico share them. Audio-rate parts in the browser run in the
AudioWorklet.

## 6. Order

1. Audio loudness into fx parameters (no new code in C).
2. `scope-xy` and `wavetable-rows`, with a preview that plays a frame and draws
   sound.
3. `spectrum`.
4. `score-read`.
5. The loop, guards first.

## 7. Measure

Latency audio in to pixel out; that the wavetable from a known frame equals the
expected samples byte for byte.
