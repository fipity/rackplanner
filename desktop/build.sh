#!/bin/sh
# Build the desktop installers (Windows .exe and Ubuntu .deb) with Docker only.
#   desktop/build.sh            both
#   desktop/build.sh linux      just the .deb
#   desktop/build.sh win        just the .exe
# Output: desktop/dist/
# Install scripts are skipped: better-sqlite3 13 and sharp ship Node-API prebuilds (npm would
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
  linux) DIST="npx electron-builder --linux deb"; WIN=0 ;;
  win) DIST="npx electron-builder --win nsis"; WIN=1 ;;
  *) DIST="npx electron-builder --linux deb --win nsis"; WIN=1 ;;
esac
# sharp (thumbnails) ships per-platform binaries; npm only installs the Linux
# ones here, so add the Windows package alongside for the .exe.
WIN_SHARP=":"
# Installed in a separate prefix and copied in, so npm can't prune the Linux ones.
[ "$WIN" = 1 ] && WIN_SHARP="npm install --prefix /tmp/winsharp --no-save --ignore-scripts --no-audit --no-fund --force --os=win32 --cpu=x64 @img/sharp-win32-x64@\$(node -p \"require('./package-lock.json').packages['node_modules/sharp'].version\") >/dev/null 2>&1 && cp -r /tmp/winsharp/node_modules/@img/sharp-win32-x64 node_modules/@img/"


echo "==> Packaging ($TARGETS) in electronuserland/builder:wine"
docker run --rm -v "$ROOT:/project" -w /project/desktop \
  -v "$CACHE/electron:/root/.cache/electron" -v "$CACHE/electron-builder:/root/.cache/electron-builder" \
  electronuserland/builder:wine \
  sh -c "(npm ci --ignore-scripts --no-audit --no-fund 2>/dev/null || npm install --ignore-scripts --no-audit --no-fund) && $WIN_SHARP && node prepare.mjs && $DIST; chown -R $UIDGID /project/desktop"

ls -lh desktop/dist/*.exe desktop/dist/*.deb 2>/dev/null
