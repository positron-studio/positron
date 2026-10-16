# positron-cast's audio source: node and the framer, plus Icecast for the `preview` target.
# Build context is workers/cast, so mp3.mjs is the same file the worker and mp3-test.mjs use.
# Alpine 3.21 because its Icecast is 2.4.4, the version Väin runs; 3.24 ships 2.5.0.
# why: lessons/workers-cast.md#preview-icecast
FROM node:22-alpine3.21
RUN apk add --no-cache icecast
WORKDIR /app
COPY mp3.mjs container/server.mjs container/icecast.xml ./
EXPOSE 8080 8000
CMD ["node", "server.mjs"]
