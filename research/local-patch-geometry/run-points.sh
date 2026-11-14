#!/bin/sh
# the points kind (2026-11-14 evening), on the M1's small models through ssh -L 11435:localhost:11434 mbp
cd "$(dirname "$0")"
unload() { curl -s localhost:11435/api/generate -d "{\"model\":\"$1\",\"keep_alive\":0}" >/dev/null; }
node run.mjs --model qwen3.5:4b --schema off --kinds points-json,points-fn --out out/qwen3.5_4b-points.jsonl > out/log-4b-points.txt 2>&1; unload qwen3.5:4b
node run.mjs --model qwen3.5:9b --schema off --kinds points-json,points-fn --out out/qwen3.5_9b-points.jsonl > out/log-9b-points.txt 2>&1; unload qwen3.5:9b
echo ALLDONE >> out/log-9b-points.txt
# 2026-11-14 21:22: the tunnel dropped at points-fn wish 15 (fetch failed); 15..19 rerun with: node run.mjs --model qwen3.5:9b --schema off --kinds points-fn --from 15 --out out/qwen3.5_9b-points.jsonl
