#!/bin/sh
# Builds on the Pi. Needs libdrm-dev libgbm-dev libegl-dev libgles-dev libturbojpeg0-dev.
set -e
cd "$(dirname "$0")"
gcc -O2 -Wall -o hdmi-scan hdmi-scan.c $(pkg-config --cflags --libs libdrm gbm egl glesv2 libturbojpeg)
