#!/bin/bash
# Everything the Palm page needs on the Pi, run on boot (crontab @reboot): the drum grid bridge (drums.sh, its own
# loop), the Circuit on Fast Track input 1 (room studio-1-line) and the SM57 on input 2 (room studio-1-mic), each
# sender started again 3 s after it exits (a JACK restart ends them with Broken pipe). A part already running is left.
# Stop all: pkill -f '[s]tart.sh|[d]rums.sh'; pkill -f '[b]ridge.mjs|[m]ic.mjs'
cd "$(dirname "$0")"
sleep "${PALM_BOOT_WAIT:-20}"   # on boot: let the board raise JACK first
running() { pgrep -f "$1" > /dev/null; }
# JACK names the Fast Track's inputs system:capture_N or circuit:capture_N depending on how the board raised it,
# so each start asks which name input N has now
cap() { timeout 5 jack_lsp 2>/dev/null | grep -m1 -E "^(system|circuit):capture_$1\$" || echo "system:capture_$1"; }
mic() {
  local log=$1 n=$2; shift 2
  while true; do
    node mic.mjs --port "$(cap "$n")" "$@" >> "$log" 2>&1
    echo "$(date +%T) mic.mjs input $n exited $?, again in 3 s" >> "$log"; sleep 3
  done
}
running '[d]rums.sh' || setsid nohup ./drums.sh > /dev/null 2>&1 < /dev/null &
running '[m]ic.mjs .*--line' || mic line.log 1 --line --client posline &
running '[m]ic.mjs --port [a-z]*:capture_2' || mic mic.log 2 &
wait
