#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "DIRECT_URL is required (use the Supabase session pooler URL)." >&2
  exit 1
fi

backup_dir="${PATHOS_BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
outfile="$backup_dir/pathos-$stamp.dump"

pg_dump "$DIRECT_URL" --format=custom --no-owner --no-privileges --file "$outfile"
printf 'Created %s\n' "$outfile"
