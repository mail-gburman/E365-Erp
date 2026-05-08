#!/usr/bin/env bash
set -euo pipefail
source /opt/e365_erp/.env
mkdir -p /opt/e365_erp/backups
STAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -Fc "$DATABASE_URL" > "/opt/e365_erp/backups/e365_${STAMP}.dump"
find /opt/e365_erp/backups -type f -name 'e365_*.dump' -mtime +14 -delete
echo "Backup created: /opt/e365_erp/backups/e365_${STAMP}.dump"
