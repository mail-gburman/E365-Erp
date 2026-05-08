#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/e365_erp/frontend
WEB_DIR=/var/www/e365-frontend

sudo mkdir -p /opt/e365_erp
sudo rsync -av --delete ./frontend/ /opt/e365_erp/frontend/
cd "$APP_DIR"

npm install
npm run build

sudo mkdir -p "$WEB_DIR"
sudo rsync -av --delete dist/ "$WEB_DIR"/
sudo cp ../deploy/nginx/e365.conf /etc/nginx/sites-available/e365.conf
sudo ln -sf /etc/nginx/sites-available/e365.conf /etc/nginx/sites-enabled/e365.conf
sudo nginx -t
sudo systemctl reload nginx
