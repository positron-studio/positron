#!/bin/sh
# Copy the studio agent and the two shell files it imports to the studio Mac, keeping the repo's layout so the
# imports resolve. ./rig/m1/push-studio.sh [host]   (default mbp)
set -e
H=${1:-mbp}
cd "$(dirname "$0")/../.."
ssh "$H" 'mkdir -p ~/positron-studio/rig/m1 ~/positron-studio/demo/shell ~/.positron && chmod 700 ~/.positron'
scp -q rig/m1/studio-agent.mjs "$H":positron-studio/rig/m1/
scp -q demo/shell/wire.mjs demo/shell/graph-registry.mjs "$H":positron-studio/demo/shell/
scp -q rig/m1/studio.positron.studio-agent.plist "$H":positron-studio/rig/m1/
echo "pushed to $H:~/positron-studio"
