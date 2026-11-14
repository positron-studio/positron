#!/bin/sh
# every 20 s, on this machine (the M2 Pro): what Ollama has loaded, free memory and wired memory
while true; do
  { date +%T; ollama ps | tail -n +2; memory_pressure | grep "free percentage"; vm_stat | awk '/wired down/ {print "wired_gb", $4*16384/1e9}'; } >> "$(dirname "$0")/out/mem-local.txt" 2>&1
  sleep 20
done
