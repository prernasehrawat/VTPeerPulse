#!/usr/bin/env sh
# Manual on-demand backup (compressed custom format).
# Usage: DATABASE_URL=postgresql://... ./scripts/backup.sh [output-dir]
set -eu
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
TS=$(date +%Y%m%d-%H%M%S)
FILE="$OUT_DIR/vtpeerpulse-$TS.dump"
pg_dump --format=custom --dbname="${DATABASE_URL:?set DATABASE_URL}" --file="$FILE"
echo "Backup written to $FILE"
