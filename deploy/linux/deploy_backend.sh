#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/kps_erp/backend

sudo mkdir -p /opt/kps_erp
sudo rsync -av --delete ./backend/ /opt/kps_erp/backend/
cd "$APP_DIR"

python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt

sudo cp ../deploy/linux/kps-backend.service /etc/systemd/system/kps-backend.service
sudo systemctl daemon-reload
sudo systemctl enable kps-backend
sudo systemctl restart kps-backend
sudo systemctl status kps-backend --no-pager
