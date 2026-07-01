# syntax=docker/dockerfile:1

# ---- Build Stage ----
FROM node:22-alpine AS build
WORKDIR /app

# tldraw license key for production (Vite build-time env)
ARG VITE_TLDRAW_LICENSE_KEY
ENV VITE_TLDRAW_LICENSE_KEY=$VITE_TLDRAW_LICENSE_KEY

# Ensure rebuild when license key changes (invalidates Docker cache)
RUN if [ -n "$VITE_TLDRAW_LICENSE_KEY" ]; then echo "License key set for build ($(echo $VITE_TLDRAW_LICENSE_KEY | cut -c1-20)... )"; else echo "License key NOT set — canvas will be blank after 5s!"; fi

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
