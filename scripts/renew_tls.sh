#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"

usage() {
  cat <<'EOF'
Usage: ./scripts/renew_tls.sh [--env-file PATH]

Renews the Let's Encrypt certificates in /srv/letsencrypt that are due (within
30 days of expiry) through the `certbot` Compose service and the DuckDNS DNS-01
challenge, then makes nginx serve the current certificate. Safe to run daily:
when nothing is due, certbot changes nothing and nginx only reloads.

Schedule it on the server, e.g. as the deploy user:
  17 4 * * * cd /srv/q-basair && ./scripts/renew_tls.sh >> "$HOME/qbasair-tls-renew.log" 2>&1
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

# Read one KEY=value from the env file without executing it as shell code.
env_value() {
  local value
  value="$(sed -n "s/^${1}=//p" "$ENV_FILE" | tail -n 1)"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

DOMAIN="$(env_value QBASAIR_PUBLIC_DOMAIN)"
TOKEN="$(env_value DUCKDNS_TOKEN)"
if [[ -z "$TOKEN" ]]; then
  echo "DUCKDNS_TOKEN must be set in $ENV_FILE." >&2
  exit 1
fi

compose=(docker compose --env-file "$ENV_FILE")

echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') Renewing Let's Encrypt certificates that are due..."
# The renewal config written at issuance already names the dns-duckdns
# authenticator; the token is passed again so a rotated DUCKDNS_TOKEN is used.
"${compose[@]}" run --rm certbot renew \
  --non-interactive \
  --dns-duckdns-token "$TOKEN" \
  --dns-duckdns-propagation-seconds 60

if [[ -n "$DOMAIN" ]]; then
  "${compose[@]}" run --rm certbot certificates -d "$DOMAIN" | grep -E "Domains:|Expiry Date:" || true
fi

# nginx reads certificates when it (re)loads its config. A reload swaps in a
# renewed certificate without dropping connections; but if nginx started
# before any certificate existed it is running the HTTP-only config, and only
# a restart makes start-nginx.sh pick the HTTPS one.
if "${compose[@]}" exec -T nginx grep -q ssl_certificate /etc/nginx/conf.d/default.conf \
  || [[ "$(env_value QBASAIR_ENABLE_TLS)" != "1" ]]; then
  echo "Reloading nginx..."
  "${compose[@]}" exec -T nginx nginx -s reload
else
  echo "nginx is running its HTTP-only config; restarting it so it can switch to HTTPS..."
  "${compose[@]}" restart nginx
fi

echo "Certificate renewal complete."
