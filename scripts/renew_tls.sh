#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"

usage() {
  cat <<'EOF'
Usage: ./scripts/renew_tls.sh [--env-file PATH]

Runs certbot renew inside Docker Compose and reloads nginx afterward.
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

compose=(docker compose --env-file "$ENV_FILE")

echo "Renewing Let's Encrypt certificates..."
"${compose[@]}" run --rm certbot renew --webroot --webroot-path /var/www/certbot --quiet

echo "Restarting nginx to pick up renewed certificates..."
"${compose[@]}" restart nginx

echo "Certificate renewal complete."
