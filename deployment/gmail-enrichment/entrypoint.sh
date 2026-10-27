#!/bin/sh
set -eu
fail() { printf '%s\n' 'enrichment_volume_bootstrap_failed' >&2; exit 1; }
[ ! -L /data ] && [ -d /data ] || fail
: "${TREG_CALL_LOG_DIR:=/data/treg-calls}"
[ "$TREG_CALL_LOG_DIR" = /data/treg-calls ] || fail
export TREG_CALL_LOG_DIR
[ ! -L "$TREG_CALL_LOG_DIR" ] || fail
if [ -e "$TREG_CALL_LOG_DIR" ]; then [ -d "$TREG_CALL_LOG_DIR" ] || fail; fi
mkdir -p "$TREG_CALL_LOG_DIR"
chown 1000:1000 /data "$TREG_CALL_LOG_DIR"
chmod 0700 /data "$TREG_CALL_LOG_DIR"
exec gosu node node server/gmail-enrichment/cli.js scheduled
