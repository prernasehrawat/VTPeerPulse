#!/usr/bin/env sh
# Restores a pg_dump custom-format backup into DATABASE_URL.
# DESTRUCTIVE: drops and recreates objects that exist in the dump.
# Usage: DATABASE_URL=postgresql://... ./scripts/restore.sh backups/vtpeerpulse-<ts>.dump
set -eu
DUMP="${1:?usage: restore.sh <dump-file>}"
[ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }
echo "Restoring $DUMP into ${DATABASE_URL:?set DATABASE_URL}"
printf "Type 'restore' to continue: "
read -r answer
[ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$DUMP"
echo "Restore complete. Run smoke checks: GET /api/health and a professor login."
