#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/e365_erp/backend

sudo mkdir -p /opt/e365_erp
sudo rsync -av --delete ./backend/ /opt/e365_erp/backend/
cd "$APP_DIR"

python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt

sudo cp ../deploy/linux/e365-backend.service /etc/systemd/system/e365-backend.service
sudo systemctl daemon-reload
sudo systemctl enable e365-backend
sudo systemctl restart e365-backend
sudo systemctl status e365-backend --no-pager
