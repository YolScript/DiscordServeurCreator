#!/usr/bin/env bash
# A executer sur la VM pour mettre a jour le bot apres un git push.
set -euo pipefail

APP_DIR="/opt/discordserveurcreator"
SERVICE_USER="discordbot"

cd "$APP_DIR"
sudo -u "$SERVICE_USER" git pull
sudo -u "$SERVICE_USER" npm ci --omit=dev
sudo systemctl restart discordserveurcreator
sudo systemctl status discordserveurcreator --no-pager
