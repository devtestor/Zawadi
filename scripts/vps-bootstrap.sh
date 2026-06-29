#!/bin/bash
# One-shot bootstrap for a fresh Ubuntu 22.04+ VPS (Linode-friendly).
#
#   ssh root@<host> 'bash -s' < scripts/vps-bootstrap.sh
#
# Installs Docker, creates a dedicated deploy user with sudo + docker, sets up
# /opt/alcurry, creates the SSH key the CI workflow will use, provisions a
# 2 GB swapfile (recommended for Linode 2 GB), and writes a systemd unit to
# auto-restart the stack on boot.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-alcurry}"
APP_DIR="/opt/alcurry"

echo "==> Updating system…"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
apt-get install -y curl ca-certificates ufw fail2ban unattended-upgrades

echo "==> Installing Docker…"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Provisioning swap (2 GB) for headroom under bun install / prisma…"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  # Mild swap pressure preferences for a long-running web stack.
  sysctl -w vm.swappiness=10 >/dev/null
  sysctl -w vm.vfs_cache_pressure=50 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  grep -q '^vm.vfs_cache_pressure' /etc/sysctl.conf || echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
fi

echo "==> Creating deploy user '$DEPLOY_USER'…"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
fi
mkdir -p "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"

echo "==> Generating CI SSH key (paste the PRIVATE part into GitHub secret DEPLOY_SSH_KEY)"
KEY="/root/alcurry-deploy"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -f "$KEY" -C "github-actions-alcurry"
  cat "$KEY.pub" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER":"$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

echo "==> Firewall…"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

echo "==> Hardened sshd…"
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd || true

echo "==> App directory…"
mkdir -p "$APP_DIR/scripts" "$APP_DIR/backups"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'ENV'
# Starter env — replace with values from .env.production.example before the
# first deploy. Keep this file mode 600.
API_DOMAIN=api.alcurry.app
WEB_DOMAIN=alcurry.app
GITHUB_REPO=devtestor/Zawadi
IMAGE_TAG=latest
LOG_LEVEL=info

POSTGRES_USER=alcurry
POSTGRES_PASSWORD=changeme
POSTGRES_DB=alcurry

BETTER_AUTH_SECRET=changeme

RESEND_API_KEY=
EMAIL_FROM="ALCURRY <onboarding@resend.dev>"

STORAGE_PROVIDER=s3
S3_REGION=auto
S3_BUCKET=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=

PESAPAL_CONSUMER_KEY=
PESAPAL_CONSUMER_SECRET=
PESAPAL_BASE_URL=https://pay.pesapal.com/v3
PESAPAL_CURRENCY=KES
ENV
  chown "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

echo "==> systemd unit…"
cat > /etc/systemd/system/alcurry.service <<UNIT
[Unit]
Description=ALCURRY stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable alcurry.service

echo "==> Done. Next steps:"
echo "  1. Copy the private key below into the GitHub repo secret DEPLOY_SSH_KEY:"
echo "----------------- BEGIN -----------------"
cat "$KEY"
echo "------------------ END ------------------"
echo "  2. Add DEPLOY_HOST=<this VPS IP> and DEPLOY_USER=$DEPLOY_USER as repo secrets."
echo "  3. Point alcurry.app + api.alcurry.app DNS at this server (DNS only, no proxy)."
echo "  4. Edit $APP_DIR/.env with real values, then run scripts/deploy.sh as $DEPLOY_USER."
