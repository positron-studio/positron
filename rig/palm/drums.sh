#!/bin/bash
# The Palm as a drum grid, started again 3 s after it exits: a tap on pframe's top strip reopens the
# port, which ends the bridge with EIO. Stop with: pkill -f palm/drums.sh; pkill -f '[b]ridge.mjs'
cd "$(dirname "$0")"
while true; do
  node bridge.mjs /dev/ttyUSB0 --view drums --voice --wave-port system:capture_1 "$@" >> bridge.log 2>&1
  echo "$(date +%T.%3N) bridge exited $?, again in 3 s" >> bridge.log
  sleep 3
done
