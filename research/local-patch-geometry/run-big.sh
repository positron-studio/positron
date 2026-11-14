#!/bin/sh
# second run (2026-11-14 evening): the big models on the M2 Pro laptop's own Ollama (port 11434), thinking off, no schema
# (Ollama's MLX runner answers 501 "structured output is unavailable" for gemma4:26b and qwen3.8:27b)
cd "$(dirname "$0")"
L=http://127.0.0.1:11434
unload() { curl -s $L/api/generate -d "{\"model\":\"$1\",\"keep_alive\":0}" >/dev/null; }
# gemma4:26b, all 80 wishes: node run.mjs --model gemma4:26b --schema off --ollama $L --out out/gemma4_26b.jsonl (started by hand first)
while pgrep -f "run.mjs --model gemma4:26b --schema off --ollama $L --out out/gemma4_26b.jsonl" >/dev/null; do sleep 10; done
node run.mjs --model gemma4:26b --schema off --ollama $L --kinds sdf-tree,lsystem-presets,scene-blocks --out out/gemma4_26b-formats.jsonl > out/log-gemma-formats.txt 2>&1; unload gemma4:26b
sleep 5
node run.mjs --model qwen3.8:27b --schema off --ollama $L --timeout 300 --out out/qwen3.8_27b.jsonl > out/log-q38local.txt 2>&1
node run.mjs --model qwen3.8:27b --schema off --ollama $L --timeout 300 --kinds sdf-tree,lsystem-presets,scene-blocks --out out/qwen3.8_27b-formats.jsonl > out/log-q38local-formats.txt 2>&1; unload qwen3.8:27b
echo ALLDONE >> out/log-q38local-formats.txt
