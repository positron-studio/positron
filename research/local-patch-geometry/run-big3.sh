#!/bin/sh
# the points kind on gemma4:26b on the M2 Pro (qwen3.8:27b was swapping, see run-big2.sh)
cd "$(dirname "$0")"
L=http://127.0.0.1:11434
node run.mjs --model gemma4:26b --schema off --ollama $L --kinds points-json,points-fn --out out/gemma4_26b-points.jsonl > out/log-gemma-points.txt 2>&1
curl -s $L/api/generate -d '{"model":"gemma4:26b","keep_alive":0}' >/dev/null
echo ALLDONE >> out/log-gemma-points.txt
