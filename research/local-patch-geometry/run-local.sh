#!/bin/sh
cd "$(dirname "$0")"
unload() { curl -s localhost:11435/api/generate -d "{\"model\":\"$1\",\"keep_alive\":0}" >/dev/null; }
node run.mjs --model qwen3.5:4b --schema off > out/log-4b.txt 2>&1; unload qwen3.5:4b
node run.mjs --model qwen3.5:9b --schema off > out/log-9b.txt 2>&1; unload qwen3.5:9b
node run.mjs --model qwen2.5-coder:7b --schema on > out/log-coder.txt 2>&1
node run.mjs --model qwen2.5-coder:7b --schema off --kinds patch,scene,lsystem --out out/qwen2.5-coder_7b-noschema.jsonl > out/log-coder-noschema.txt 2>&1; unload qwen2.5-coder:7b
echo ALLDONE >> out/log-coder-noschema.txt
