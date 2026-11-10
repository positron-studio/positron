# Palm OS 68k cross toolchain: prc-tools-remix 2.3.6, pilrc, the Palm OS SDKs.
# amd64 only (no arm64 builds are published); OrbStack runs it under Rosetta.
# Build: docker build --platform linux/amd64 -t positron-palm-dev rig/palm
FROM --platform=linux/amd64 debian:bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates unzip make && rm -rf /var/lib/apt/lists/*
RUN cd /tmp \
 && curl -sSLO https://github.com/jichu4n/prc-tools-remix/releases/download/v2.3.6/prc-tools-remix_2.3.6.bookworm_amd64.deb \
 && curl -sSLO https://github.com/jichu4n/pilrc/releases/download/2.3.91/pilrc_3.2.91.bookworm_amd64.deb \
 && apt-get update && apt-get install -y --no-install-recommends ./prc-tools-remix_2.3.6.bookworm_amd64.deb ./pilrc_3.2.91.bookworm_amd64.deb \
 && rm -rf /var/lib/apt/lists/* /tmp/*.deb
RUN curl -sSL -o /tmp/sdk.zip https://github.com/jichu4n/palm-os-sdk/archive/master.zip \
 && unzip -q -d /tmp /tmp/sdk.zip && rm -rf /opt/palmdev && mv /tmp/palm-os-sdk-master /opt/palmdev \
 && rm /tmp/sdk.zip && palmdev-prep -d sdk-5r3
WORKDIR /src
