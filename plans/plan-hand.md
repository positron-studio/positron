# plan-hand: a finger as a pointer source

Status: plan, 2026-10-28. INFERRED unless READ; every speed below is a guess

Related: `plan-xr-hands.md` is the headset's own hands, done; this one is a camera and a model, for any page. Evidence: `research/hand-models/`.
until MEASURED.

**Goal.** A camera and a hand-tracking model become one more source of the
samples `demo/draw` already records, then a patchbay node anything can use.

## 1. The mapping

READ: `demo/draw` records `{ x, y, pressure, at }` through
`demo/shell/pointer-adapter.mjs` (hold, linear, Catmull-Rom, with measured error).

- index fingertip: `x, y`
- thumb to index distance: `pressure`; a closing pinch is pen down
- the camera frame time: `at`

The adapter and its readouts stay unchanged. Camera input is about 30 noisy
samples a second, so the interpolation comparison gets real work.

## 2. Where the model runs

| Where | Route |
|---|---|
| Browser | MediaPipe Hand Landmarker (`@mediapipe/tasks-vision`), 21 points a hand, WASM with GPU |
| Pi 5, first | Node with TensorFlow.js on its WebAssembly backend: no Python, no native build. Frames from `rpicam-vid` as raw YUV at about 320x240 on stdout |
| Pi 5, if too slow | a small Rust binary (tract or ort) on OpenCV Zoo's ONNX conversions of MediaPipe's palm detector and hand landmarker (Apache 2.0). Not Ultralytics YOLO hand-pose (see §2.1) |
| Pico | no camera tracking. An 8x8 time-of-flight sensor (VL53L5CX or VL53L7CX) for coarse hand position and height; the Pico is otherwise the output, the OLED |

### 2.1 Model choice (READ, 2026-10-28)

- **OpenCV Zoo `palm_detection_mediapipe` + `handpose_estimation_mediapipe`:**
  ONNX conversions of MediaPipe's models, Apache 2.0, 21 keypoints, with
  reference demo code (anchors, NMS, rotated crop) to port. Use the fp32
  landmark model: the zoo warns its int8 version may give invalid results.
- **Ultralytics hand-keypoints (YOLO pose), rejected for now:** the code is
  AGPL-3.0, the dataset images are CC BY-NC-SA 4.0 (non-commercial), and its
  labels were generated with MediaPipe, so a model trained on it learns to
  imitate MediaPipe, not to beat it.
- **Cost saver, as MediaPipe itself does:** run the palm detector only when no
  hand is tracked; otherwise crop around the last frame's landmarks and run only
  the landmark model.

## 3. The patchbay

- A node `hand` (engine) on the site that runs the model.
- A new medium `pointer`, shape `{ rate, points: ['index', 'thumb'] }`.
- Gestures (pinch, open hand) as discrete events on their own ports.
- Converters: pointer to midi (x and y to cc, pinch to note), pointer to frame
  (a stroke on the OLED via plan-screens), pointer to fx parameters, pointer to
  `demo/draw`.

## 4. Privacy

Only landmarks leave the device, a few hundred bytes a frame, never video.
Nothing is stored unless recorded on purpose. The Pi keeps `camera.mjs`'s key
gate and idle stop, and the shared `/dev/video11` rule (READ).

## 5. Order

1. `demo/hand` in the browser into the pointer adapter.
2. The `pointer` medium and the `hand` node.
3. Pi in Node, landmarks over the relay.
4. Converters to midi and frame.
5. Pico with the time-of-flight sensor.

## 6. Measure

Camera to landmark to relay to OLED latency; jitter in px against mouse and
touch on the same pad; which interpolation wins on tracker data; Pi frames per
second at each resolution.
