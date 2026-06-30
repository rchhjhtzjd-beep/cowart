#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_DIR="$PWD"
PORT="${COWART_PORT:-43217}"
BACKEND_PORT="${COWART_BACKEND_PORT:-43218}"
PROJECT_DIR="${COWART_PROJECT_DIR:-${1:-$CALLER_DIR}}"
CANVAS_DIR="${COWART_CANVAS_DIR:-$PROJECT_DIR/canvas}"

export COWART_PROJECT_DIR="$PROJECT_DIR"
export COWART_CANVAS_DIR="$CANVAS_DIR"
export COWART_BACKEND_PORT="$BACKEND_PORT"

cd "$ROOT_DIR"

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/vite ]; then
  npm install
fi

# Start Express backend in background
echo "Cowart backend: http://127.0.0.1:${BACKEND_PORT}"
COWART_PORT="$BACKEND_PORT" node server/index.js &
BACKEND_PID=$!

# Cleanup on exit
cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Give backend a moment to start
sleep 1

echo "Cowart canvas: http://127.0.0.1:${PORT}"
echo "Cowart canvas data: ${CANVAS_DIR}/pages/<page-id>/cowart-canvas.json"
echo "Cowart page assets: ${CANVAS_DIR}/pages/<page-id>/assets -> http://127.0.0.1:${PORT}/page-assets/<page-id>/"
exec npm run dev -- --host 127.0.0.1 --port "$PORT"
