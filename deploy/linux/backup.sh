#!/usr/bin/env bash
set -euo pipefail
source /opt/kps_erp/.env
mkdir -p /opt/kps_erp/backups
STAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -Fc "$DATABASE_URL" > "/opt/kps_erp/backups/kps_${STAMP}.dump"
find /opt/kps_erp/backups -type f -name 'kps_*.dump' -mtime +14 -delete
echo "Backup created: /opt/kps_erp/backups/kps_${STAMP}.dump"
