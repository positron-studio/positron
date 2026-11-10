#!/bin/sh
# Build a Palm app folder inside the toolchain container: rig/palm/build.sh hello
set -e
here=$(cd "$(dirname "$0")" && pwd)
docker image inspect positron-palm-dev >/dev/null 2>&1 || docker build --platform linux/amd64 -t positron-palm-dev "$here"
docker run --rm --platform linux/amd64 -v "$here/$1:/src" positron-palm-dev make
