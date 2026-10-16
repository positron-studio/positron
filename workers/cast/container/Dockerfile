# positron-cast's audio source: node and the framer, no ffmpeg yet. Build context is workers/cast,
# so mp3.mjs is the same file the worker and mp3-test.mjs use.
FROM node:22-alpine
WORKDIR /app
COPY mp3.mjs container/server.mjs ./
EXPOSE 8080
CMD ["node", "server.mjs"]
