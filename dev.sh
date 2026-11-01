#!/usr/bin/env bash
# Run npm inside a Node 22 container (no Node needed on the host).
#   ./dev.sh install | ./dev.sh test | ./dev.sh run typecheck | ./dev.sh run dev
set -euo pipefail
cd "$(dirname "$0")"
exec docker run --rm -it -v "$PWD:/app" -w /app -u "$(id -u):$(id -g)" \
  -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -p "${WEB_PORT:-5173}:5173" -p "${API_PORT:-8085}:8085" \
  node:22-bookworm-slim npm "$@"
