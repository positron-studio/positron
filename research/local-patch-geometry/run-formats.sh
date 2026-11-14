#!/bin/sh
# second run (2026-11-14 evening): the easier formats on the M1's small models, through ssh -L 11435:localhost:11434 mbp
cd "$(dirname "$0")"
unload() { curl -s localhost:11435/api/generate -d "{\"model\":\"$1\",\"keep_alive\":0}" >/dev/null; }
node run.mjs --model qwen3.5:4b --schema off --kinds sdf-tree,lsystem-presets,scene-blocks,patch-sv --out out/qwen3.5_4b-formats.jsonl > out/log-4b-formats.txt 2>&1; unload qwen3.5:4b
node run.mjs --model qwen3.5:9b --schema off --kinds sdf-tree,lsystem-presets,scene-blocks --out out/qwen3.5_9b-formats.jsonl > out/log-9b-formats.txt 2>&1; unload qwen3.5:9b
echo ALLDONE >> out/log-9b-formats.txt
