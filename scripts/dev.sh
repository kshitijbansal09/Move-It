#!/bin/sh
# Start the C++ API and Vite frontend together; preserve all database contents.
set -eu
cd "$(dirname "$0")/.."
make web
if [ ! -d frontend/node_modules ]; then
    (cd frontend && npm ci)
fi
./build/moveit-web --serve &
api_pid=$!
cleanup() {
    kill "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
(cd frontend && npm run dev)
