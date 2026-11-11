#!/bin/bash
# Install ~/palm/frame.prc on the Palm: the drums loop and the bridge stop, visor goes (pilot-xfer needs the USB),
# pilot-xfer waits for a HotSync tap on the Palm, then visor and the drums loop come back. Log: ~/palm/install.log
cd "$(dirname "$0")"
pkill -f 'palm/drums.sh|[.]/drums.sh'; pkill -f '[b]ridge.mjs /dev/ttyUSB0'; sleep 2
sudo -n rmmod visor
echo "$(date +%T) waiting for a HotSync tap on the Palm (5 min)"
timeout 300 pilot-xfer -p usb: -i frame.prc; rc=$?
echo "$(date +%T) pilot-xfer exited $rc"
sudo -n modprobe visor; sleep 3
setsid nohup ./drums.sh > /dev/null 2>&1 < /dev/null &
echo "$(date +%T) visor back, drums loop started"
