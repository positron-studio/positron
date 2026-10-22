# positron-sfu's film container: ffmpeg copies the film to RTP, werift sends it into the SFU (server.mjs).
FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs .
EXPOSE 8080
CMD ["node", "server.mjs"]
