#!/bin/sh
cd "$(dirname "$0")"
node run.mjs --via hosted --model @cf/qwen/qwen2.5-coder-32b-instruct > out/log-h-coder32.txt 2>&1
node run.mjs --via hosted --model @cf/qwen/qwen3.8-27b > out/log-h-q38.txt 2>&1
echo ALLDONE >> out/log-h-q38.txt
