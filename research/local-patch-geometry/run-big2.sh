#!/bin/sh
# qwen3.8:27b on the M2 Pro after it began to swap (2026-11-14 20:45): its MLX size grew from 18 GB to 27 GB, swap
# reached 10.6 GB and decode fell from 17 to 1.5 tokens/s. So: one kind at a time, the model unloaded between kinds.
cd "$(dirname "$0")"
L=http://127.0.0.1:11434
unload() { curl -s $L/api/generate -d '{"model":"qwen3.8:27b","keep_alive":0}' >/dev/null; sleep 5; }
for k in sdf-tree lsystem-presets scene-blocks; do
  node run.mjs --model qwen3.8:27b --schema off --ollama $L --timeout 300 --kinds $k --out out/qwen3.8_27b-formats.jsonl >> out/log-q38local-formats.txt 2>&1; unload
done
for k in points-json points-fn; do
  node run.mjs --model qwen3.8:27b --schema off --ollama $L --timeout 300 --kinds $k --out out/qwen3.8_27b-points.jsonl >> out/log-q38local-points.txt 2>&1; unload
done
echo ALLDONE >> out/log-q38local-points.txt
# STOPPED by hand at 20:55: after the reload qwen3.8 still decoded at 1.4 to 1.8 tokens/s (swap 5 GB, 22 GB wired, OrbStack's
# Kubernetes VM up), so the points run went to gemma4:26b instead (run-big3.sh). qwen3.8 formats stop at sdf-tree 0..15.
