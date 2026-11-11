#!/bin/sh
# Build the desktop installers (Windows .exe and Ubuntu .deb) with Docker only.
#   desktop/build.sh            both
#   desktop/build.sh linux      just the .deb
#   desktop/build.sh win        just the .exe
# Output: desktop/dist/
# Install scripts are skipped: better-sqlite3 13 ships Node-API prebuilds (npm would
# otherwise try node-gyp, which needs Python), and electron-builder fetches Electron itself.
set -e
cd "$(dirname "$0")/.."
ROOT=$PWD
TARGETS=${1:-all}
UIDGID="$(id -u):$(id -g)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}"
mkdir -p "$CACHE/electron" "$CACHE/electron-builder"

echo "==> Building web app and server (node:22)"
docker run --rm -v "$ROOT:/app" -w /app -u "$UIDGID" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 node:22-bookworm-slim \
  sh -c "npm ci --ignore-scripts --no-audit --no-fund >/dev/null && npm run build >/dev/null && echo built"

case "$TARGETS" in
  linux) DIST="npx electron-builder --linux deb" ;;
  win) DIST="npx electron-builder --win nsis" ;;
  *) DIST="npx electron-builder --linux deb --win nsis" ;;
esac

echo "==> Packaging ($TARGETS) in electronuserland/builder:wine"
docker run --rm -v "$ROOT:/project" -w /project/desktop \
  -v "$CACHE/electron:/root/.cache/electron" -v "$CACHE/electron-builder:/root/.cache/electron-builder" \
  electronuserland/builder:wine \
  sh -c "(npm ci --ignore-scripts --no-audit --no-fund 2>/dev/null || npm install --ignore-scripts --no-audit --no-fund) && node prepare.mjs && $DIST; chown -R $UIDGID /project/desktop"

ls -lh desktop/dist/*.exe desktop/dist/*.deb 2>/dev/null
