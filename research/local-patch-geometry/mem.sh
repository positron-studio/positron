#!/bin/sh
# every 20 s: what Ollama has loaded and the resident size of its runner, on the M1
while true; do
  ssh mbp 'export PATH=/opt/homebrew/bin:$PATH; date +%T; ollama ps | tail -n +2; ps -axo rss,comm | grep -i "ollama" | awk "{s+=\$1} END {print \"ollama_rss_mb\", int(s/1024)}"; memory_pressure | grep "free percentage"; vm_stat | awk "/wired down/ {print \"wired_gb\", \$4*16384/1e9}"' >> "$(dirname "$0")/out/mem.txt" 2>&1
  sleep 20
done
