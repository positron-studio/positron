#!/bin/bash
# Install ~/palm/frame.prc on the Palm: run this FIRST, then tap HotSync. The drums loop and the bridge stop,
# pilot-xfer waits on ttyUSB1 for the tap, then the drums loop comes back. Log: ~/palm/install.log
cd "$(dirname "$0")"
pkill -f 'palm/drums.sh|[.]/drums.sh'; pkill -f '[b]ridge.mjs /dev/ttyUSB0'; sleep 2
sudo -n modprobe visor
echo "$(date +%T) waiting for a HotSync tap on the Palm (5 min)"
# udev loads visor again on the tap and it takes the USB, so the install goes over its HotSync tty
timeout 300 pilot-xfer -p /dev/ttyUSB1 -i frame.prc; rc=$?
echo "$(date +%T) pilot-xfer exited $rc"
sudo -n modprobe visor; sleep 3
setsid nohup ./drums.sh > /dev/null 2>&1 < /dev/null &
echo "$(date +%T) visor back, drums loop started"
