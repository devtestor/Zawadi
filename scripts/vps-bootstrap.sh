#!/bin/bash
# One-shot bootstrap for a fresh Ubuntu 22.04+ VPS.
#
#   ssh root@<host> 'bash -s' < scripts/vps-bootstrap.sh
#
# Installs Docker, creates a dedicated deploy user with sudo + docker, sets up
# /opt/zawadi, creates the SSH key the CI workflow will use, and writes
# /etc/systemd/system/zawadi.service to auto-restart the stack on boot.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-zawadi}"
APP_DIR="/opt/zawadi"

echo "==> Updating system…"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
apt-get install -y curl ca-certificates ufw fail2ban unattended-upgrades

echo "==> Installing Docker…"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
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
KEY="/root/zawadi-deploy"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -f "$KEY" -C "github-actions-zawadi"
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
# Fill these in then run scripts/deploy.sh manually for the first deploy.
API_DOMAIN=api.zawadi.app
WEB_DOMAIN=zawadi.app
GITHUB_REPO=devtestor/Zawadi
IMAGE_TAG=latest
POSTGRES_USER=zawadi
POSTGRES_PASSWORD=changeme
POSTGRES_DB=zawadi
BETTER_AUTH_SECRET=changeme
RESEND_API_KEY=
EMAIL_FROM=ZAWADI <onboarding@resend.dev>
S3_BUCKET=
S3_ENDPOINT=
S3_REGION=auto
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
cat > /etc/systemd/system/zawadi.service <<UNIT
[Unit]
Description=ZAWADI stack
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
systemctl enable zawadi.service

echo "==> Done. Next steps:"
echo "  1. Copy the private key below into the GitHub repo secret DEPLOY_SSH_KEY:"
echo "----------------- BEGIN -----------------"
cat "$KEY"
echo "------------------ END ------------------"
echo "  2. Add DEPLOY_HOST=<this VPS IP> and DEPLOY_USER=$DEPLOY_USER as repo secrets."
echo "  3. Point DNS for \$DOMAIN at this server."
echo "  4. Edit $APP_DIR/.env with real values, then run scripts/deploy.sh as $DEPLOY_USER."
