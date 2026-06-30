# syntax=docker/dockerfile:1

# ---- Build Stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

# Persistent data volume for canvas files
RUN mkdir -p /data/canvas

ENV NODE_ENV=production
ENV COWART_HOST=0.0.0.0
ENV COWART_CANVAS_DIR=/data/canvas
ENV PORT=43218

EXPOSE 43218

CMD ["node", "server/index.js"]
