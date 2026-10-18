#!/bin/sh
set -eu

fail() {
  printf '%s\n' 'web_volume_bootstrap_failed' >&2
  exit 1
}

# Only the dedicated mount and its exact private auth file may change ownership.
[ ! -L /data ] && [ -d /data ] || fail
: "${MIRO_MCP_AUTH_FILE:=/data/miro-auth.json}"
[ "$MIRO_MCP_AUTH_FILE" = /data/miro-auth.json ] || fail
export MIRO_MCP_AUTH_FILE
[ ! -L "$MIRO_MCP_AUTH_FILE" ] || fail
if [ -e "$MIRO_MCP_AUTH_FILE" ]; then
  [ -f "$MIRO_MCP_AUTH_FILE" ] || fail
fi

chown 1000:1000 /data
chmod 0700 /data
if [ -e "$MIRO_MCP_AUTH_FILE" ]; then
  chown 1000:1000 "$MIRO_MCP_AUTH_FILE"
  chmod 0600 "$MIRO_MCP_AUTH_FILE"
fi
exec gosu node node server/web.js
