# Hand models in tract: tested, 2026-10-29

For `plans/plan-hand.md` §2.1. Run in a sandbox: x86, **one CPU core**, no GPU.
Tags as in the repo: MEASURED here, READ from a source, INFERRED.

## Answer

**MediaPipe's hand models convert to ONNX and run in tract with the same
results as the original TFLite.** The route to a Python-free Pi tracker is open.

## What was run

1. MEASURED: `mediapipe==0.10.14` from PyPI still bundles the models
   (`palm_detection_lite/full.tflite`, `hand_landmark_lite/full.tflite`);
   wheels from 1.x do not. Apache 2.0 (READ: MediaPipe).
2. MEASURED: `tflite2onnx` converted the landmark models but **failed** on both
   palm models. `tf2onnx` (opset 17) converted all four.
3. MEASURED: the ONNX graphs use only common operators. Palm: `Add, Concat,
   Conv, MaxPool, PRelu, Pad, Reshape, Resize, Transpose`. Landmarks: `Add,
   Clip, Conv, Gemm, GlobalAveragePool, MaxPool, Sigmoid, Squeeze, Transpose`.
4. MEASURED: tract 0.23.9 (Python bindings) and onnxruntime 1.24 loaded and ran
   all four with the input fixed to `1,192,192,3` and `1,224,224,3`.

## Same numbers as TFLite

Max absolute difference from TFLite on the same random input:

| Model | onnxruntime | tract |
|---|---|---|
| palm lite | 1.3e-4 | 1.3e-4 |
| landmark lite | 1.1e-4 | 9.2e-5 |
| palm full | 1.2e-4 | 1.5e-4 |
| landmark full | 6.9e-5 | 6.9e-5 |

On a real photo, all three runtimes gave the same palm score, the same centre
and the same index-tip pixel.

## Speed (one x86 core, median of 30; not a Pi prediction)

| ms per frame | TFLite (XNNPACK) | onnxruntime | tract |
|---|---|---|---|
| palm lite | 5.7 | 7.1 | 20.5 |
| landmark lite | 2.9 | 3.0 | 12.6 |
| palm full | 7.6 | 9.3 | 25.7 |
| landmark full | 6.3 | 6.0 | 20.1 |

tract is about 3x slower than the optimised x86 runtimes here. INFERRED: in
tracking mode (palm only to acquire, landmarks every frame), tract with the full
landmark model is about 20 ms a frame on this core. The Pi 5 has 4 ARM cores
and different kernels: MEASURE there before deciding between tract and ort.

## The pipeline works on real photos

`scripts/pipe.py` decodes the palm detector (2016 anchors: stride 8 at 2 per
cell, stride 16 at 6 per cell), takes the best box, builds MediaPipe's rotated
crop (wrist to middle-finger base, scale 2.6, shift up 0.5) and maps the 21
landmarks back to the photo.

| Photo | palm score (full) | presence (full) | Result |
|---|---|---|---|
| A: hand on a bedsheet | 0.932 | 0.965 | landmarks on the hand |
| B: open palm filling the frame | 0.148 | 0.992 | landmarks correct |

Findings from B:

- **The palm detector is weak when the hand fills the frame** (0.148, below the
  usual 0.5 threshold), yet the landmark model was right. Tracking mode
  matters: once a hand is found, crop from the last landmarks, not from a fresh
  detection.
- **The lite landmark model failed on B** (presence 0.012). Use the full model;
  check lite on the actual camera before choosing it for speed.
- Presence must gate output: below a threshold, send nothing.

## Rust, tract-onnx 0.23.9 (MEASURED, same core)

Built with Rust 1.91 from Ubuntu; one dependency wants Rust 1.96, so the build
needs `CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS=fallback`. Release build
without LTO: 12 minutes on one core; binary 31 MB (not stripped).

| | lite | full |
|---|---|---|
| max diff vs TFLite, palm | 1.3e-4 | 1.5e-4 |
| max diff vs TFLite, landmark | 9.2e-5 | 6.9e-5 |
| median ms, palm | 20.4 | 24.3 |
| median ms, landmark | 12.0 | 18.7 |
| load and optimise both models | 2.8 s | 1.3 s |

**Rust is as fast as the Python bindings, so the 3x gap to TFLite and ort is
tract's x86 kernels, not the bindings.** The 28 depthwise and 35 ordinary
convolutions in the palm model (16 and 31 in the landmark model) are where
XNNPACK and MLAS are strongest (INFERRED). Decide on the Pi.

The whole pipeline in Rust (letterbox, palm decode, rotated crop, bilinear
resampling, landmarks) took 47 ms a frame.

| Photo | Python (PIL resampling) | Rust (own resampling) |
|---|---|---|
| A, palm score | 0.932 | 0.918 |
| A, index tip | (436, 151) | (431, 154) |
| B, palm | 0.148 at (396, 988), landmarks right | 0.293 at (685, 429), a wrong small box |
| B, presence | 0.992 | 0.000: rejected, nothing sent |

Photo B shows the palm detector's weakness again: with slightly different
resampling a different weak candidate won. Taking only the best-scoring anchor
is not enough. Needed: a score threshold, non-maximum suppression over all
candidates, landmarks on the top few, and tracking from the last landmarks. The
presence score did its job: a wrong crop gave 0.000.

## Next

1. On the Pi 5: this Rust binary (cross-compiled for aarch64) and ort, at
   320x240 camera input. That decides tract or ort.
2. Port the decode and crop from `pipe.py` (about 150 lines) to Rust.
3. Tracking mode and a presence threshold, then landmarks over the relay.

## Files

- `scripts/convert.sh`: TFLite to ONNX, as run.
- `scripts/pipe.py`, `scripts/run.py`: runtimes, decode, crop, timing, overlay.
- `rust/`: the Rust test (`cargo run --release -- onnx2 ref photo.jpg`).
- `images/hand-a-full-tract.jpg`, `images/hand-b-full-tract.jpg`: the full
  models through tract. Photos from Wikimedia Commons, CC BY-SA 4.0: "A Hand" by
  Gaurav Dhwaj Khadka; "Mehndi on palm 01" by Vinayaraj.
