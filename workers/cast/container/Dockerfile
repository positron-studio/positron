# positron-cast's audio source: node and the framer, Icecast for the `preview` target, ffmpeg for mix mode.
# Build context is workers/cast and the image keeps its layout, so mp3.mjs is the file the worker uses.
# Alpine 3.21 because its Icecast is 2.4.4, the version Väin runs; 3.24 ships 2.5.0.
# why: lessons/workers-cast.md#preview-icecast
FROM node:22-alpine3.21
RUN apk add --no-cache icecast ffmpeg && ffmpeg -hide_banner -encoders | grep -q libmp3lame
WORKDIR /app
COPY mp3.mjs ./
COPY container/ ./container/
EXPOSE 8080 8000
CMD ["node", "container/server.mjs"]
