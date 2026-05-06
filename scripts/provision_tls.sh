#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"

usage() {
  cat <<'EOF'
Usage: ./scripts/provision_tls.sh [--env-file PATH]

This script obtains or refreshes a Let's Encrypt certificate for the configured
QBASAIR_PUBLIC_DOMAIN using the docker-compose certbot service, then restarts
nginx so the new certificate is loaded.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

cd "$PROJECT_ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file '$ENV_FILE' was not found." >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

if [[ -z "${QBASAIR_PUBLIC_DOMAIN:-}" ]]; then
  echo "QBASAIR_PUBLIC_DOMAIN must be set in $ENV_FILE." >&2
  exit 1
fi

if [[ -z "${QBASAIR_LETSENCRYPT_EMAIL:-}" ]]; then
  echo "QBASAIR_LETSENCRYPT_EMAIL must be set in $ENV_FILE." >&2
  exit 1
fi

compose=(docker compose --env-file "$ENV_FILE")

echo "Ensuring nginx is reachable on HTTP for the ACME challenge..."
"${compose[@]}" up -d nginx web api

echo "Requesting/refreshing the Let's Encrypt certificate for ${QBASAIR_PUBLIC_DOMAIN}..."
"${compose[@]}" run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "${QBASAIR_LETSENCRYPT_EMAIL}" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  --keep-until-expiring \
  -d "${QBASAIR_PUBLIC_DOMAIN}"

echo "Restarting nginx to enable HTTPS..."
"${compose[@]}" restart nginx

echo "TLS provisioning complete."
