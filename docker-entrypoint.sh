#!/bin/sh
# Make the data directory writable for the app user, then drop root.
# PUID/PGID let you match the owner of a host bind mount (default 1000:1000).
set -e
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  if [ "$(stat -c '%u:%g' "$DATA_DIR")" != "$PUID:$PGID" ]; then
    chown -R "$PUID:$PGID" "$DATA_DIR" || echo "warning: could not chown $DATA_DIR; it must be writable by $PUID:$PGID" >&2
  fi
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
fi
exec "$@"
