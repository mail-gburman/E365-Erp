#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/kps_erp/frontend
WEB_DIR=/var/www/kps-frontend

sudo mkdir -p /opt/kps_erp
sudo rsync -av --delete ./frontend/ /opt/kps_erp/frontend/
cd "$APP_DIR"

npm install
npm run build

sudo mkdir -p "$WEB_DIR"
sudo rsync -av --delete dist/ "$WEB_DIR"/
sudo cp ../deploy/nginx/kps.conf /etc/nginx/sites-available/kps.conf
sudo ln -sf /etc/nginx/sites-available/kps.conf /etc/nginx/sites-enabled/kps.conf
sudo nginx -t
sudo systemctl reload nginx
