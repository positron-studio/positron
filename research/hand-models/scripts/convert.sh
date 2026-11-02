#!/bin/sh
# MediaPipe hand models -> ONNX, as run on 2026-10-29. Needs Python with
# tensorflow-cpu and tf2onnx (tflite2onnx failed on the palm models).
set -e
pip download mediapipe==0.10.14 --no-deps -d w14 --only-binary=:all: \
  --python-version 3.12 --platform manylinux_2_17_x86_64
# 0.10.14 still bundles the .tflite files; newer wheels (1.x) do not.
python3 - << 'PY'
import zipfile, glob
z = zipfile.ZipFile(glob.glob('w14/*.whl')[0])
for n in z.namelist():
    if n.endswith('.tflite') and ('hand_landmark' in n or 'palm_detection' in n):
        z.extract(n, 'models')
PY
mkdir -p onnx2
for m in palm_detection_lite palm_detection_full hand_landmark_lite hand_landmark_full; do
  python3 -m tf2onnx.convert --tflite "$(find models -name "$m.tflite")" --output "onnx2/$m.onnx" --opset 17
done
