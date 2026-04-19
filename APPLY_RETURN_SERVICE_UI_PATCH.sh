#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-/Users/gauravburman/Desktop/KPS/kps_erp_enterprise_v8_9_10}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

cp "$SRC_DIR/backend/app/routers/service_jobs.py" "$TARGET/backend/app/routers/service_jobs.py"
cp "$SRC_DIR/frontend/src/pages/AccountsPage.jsx" "$TARGET/frontend/src/pages/AccountsPage.jsx"
cp "$SRC_DIR/frontend/src/pages/BookingsPage.jsx" "$TARGET/frontend/src/pages/BookingsPage.jsx"
cp "$SRC_DIR/frontend/src/styles.css" "$TARGET/frontend/src/styles.css"

echo "Return/service + payment UI patch copied to: $TARGET"
echo "Restart backend and frontend dev server. If the browser still shows old UI, hard refresh Chrome with Cmd+Shift+R."
