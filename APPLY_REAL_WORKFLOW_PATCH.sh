#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-/Users/gauravburman/Desktop/E365/e365_erp_enterprise_v8_9_10}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$TARGET/backend/app/integrations"
cp "$SRC_DIR/backend/app/routers/accounts.py" "$TARGET/backend/app/routers/accounts.py"
cp "$SRC_DIR/backend/app/routers/bookings.py" "$TARGET/backend/app/routers/bookings.py"
cp "$SRC_DIR/backend/app/routers/service_jobs.py" "$TARGET/backend/app/routers/service_jobs.py"
cp -R "$SRC_DIR/backend/app/integrations/tally" "$TARGET/backend/app/integrations/"
cp "$SRC_DIR/frontend/src/pages/AccountsPage.jsx" "$TARGET/frontend/src/pages/AccountsPage.jsx"
cp "$SRC_DIR/frontend/src/pages/BookingsPage.jsx" "$TARGET/frontend/src/pages/BookingsPage.jsx"
cp "$SRC_DIR/frontend/src/api.js" "$TARGET/frontend/src/api.js"
cp "$SRC_DIR/frontend/src/styles.css" "$TARGET/frontend/src/styles.css"

echo "Patch files copied to: $TARGET"
echo "Now restart backend and frontend dev server."
