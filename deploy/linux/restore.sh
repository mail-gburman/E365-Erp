#!/usr/bin/env bash
set -euo pipefail
source /opt/e365_erp/.env
FILE=${1:?Usage: restore.sh /path/to/backup.dump}
pg_restore -d "$DATABASE_URL" "$FILE"
echo "Restore complete from $FILE"
