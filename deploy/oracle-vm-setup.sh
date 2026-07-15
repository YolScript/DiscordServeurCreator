#!/usr/bin/env bash
# A executer une seule fois sur une VM Ubuntu fraiche (Oracle Cloud Always Free).
# Usage : ssh sur la VM, puis "bash oracle-vm-setup.sh"
set -euo pipefail

REPO_URL="https://github.com/YolScript/DiscordServeurCreator.git"
APP_DIR="/opt/discordserveurcreator"
SERVICE_USER="discordbot"

echo "== Installation de Node.js 22 =="
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

echo "== Utilisateur systeme dedie =="
id -u "$SERVICE_USER" &>/dev/null || sudo useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"

echo "== Recuperation du code =="
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$SERVICE_USER" git -C "$APP_DIR" pull
else
  sudo git clone "$REPO_URL" "$APP_DIR"
  sudo chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"
fi

cd "$APP_DIR"
sudo -u "$SERVICE_USER" npm ci --omit=dev

if [ ! -f "$APP_DIR/.env" ]; then
  echo ""
  echo "!! Cree d'abord $APP_DIR/.env (DISCORD_TOKEN, DISCORD_CLIENT_ID, CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN)"
  echo "   puis relance ce script."
  exit 1
fi
sudo chown "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR/.env"
sudo chmod 600 "$APP_DIR/.env"

echo "== Service systemd =="
sudo cp "$APP_DIR/deploy/discordserveurcreator.service" /etc/systemd/system/discordserveurcreator.service
sudo systemctl daemon-reload
sudo systemctl enable --now discordserveurcreator

echo "== Statut =="
sudo systemctl status discordserveurcreator --no-pager
