#!/bin/bash
# Everything the Palm page needs on the Pi, run on boot (crontab @reboot): the drum grid bridge (drums.sh, its own
# loop), the Circuit on Fast Track input 1 (room studio-1-line) and the SM57 on input 2 (room studio-1-mic), each
# sender started again 3 s after it exits (a JACK restart ends them with Broken pipe). A part already running is left.
# Stop all: pkill -f '[s]tart.sh|[d]rums.sh'; pkill -f '[b]ridge.mjs|[m]ic.mjs'
cd "$(dirname "$0")"
sleep "${PALM_BOOT_WAIT:-20}"   # on boot: let the board raise JACK first
running() { pgrep -f "$1" > /dev/null; }
loop() { local log=$1; shift; while true; do "$@" >> "$log" 2>&1; echo "$(date +%T) $* exited $?, again in 3 s" >> "$log"; sleep 3; done; }
running '[d]rums.sh' || setsid nohup ./drums.sh > /dev/null 2>&1 < /dev/null &
running '[m]ic.mjs --line' || loop line.log node mic.mjs --line --port system:capture_1 --client posline &
running '[m]ic.mjs --port system:capture_2' || loop mic.log node mic.mjs --port system:capture_2 &
wait
