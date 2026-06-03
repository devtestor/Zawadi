#!/bin/bash
# Pull the new image, restart the stack, run migrations, sanity-check health.
# Designed to be idempotent — safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing /opt/zawadi/.env — copy from .env.example and fill in." >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a; source .env; set +a

if [ -z "${GITHUB_REPO:-}" ]; then
  echo "GITHUB_REPO is not set in .env" >&2
  exit 1
fi

# Log in to GHCR if a token is present (only needed for private repos).
if [ -n "${GHCR_TOKEN:-}" ] && [ -n "${GHCR_USER:-}" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
fi

docker compose -f docker-compose.prod.yml pull backend
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "Waiting for /health…"
for i in $(seq 1 30); do
  if curl -fsS "https://${DOMAIN}/health" >/dev/null 2>&1; then
    echo "✅ healthy at https://${DOMAIN}"
    exit 0
  fi
  sleep 2
done
echo "❌ Backend did not become healthy in 60s" >&2
docker compose -f docker-compose.prod.yml logs --tail=80 backend
exit 1
