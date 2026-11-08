#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"

usage() {
  cat <<'EOF'
Usage: ./scripts/provision_tls.sh [--env-file PATH]

Obtains (or keeps, when still valid) the Let's Encrypt certificate for
QBASAIR_PUBLIC_DOMAIN through the `certbot` Compose service, using the DuckDNS
DNS-01 challenge, then restarts nginx so it switches to its HTTPS config.

Reads from the env file: QBASAIR_PUBLIC_DOMAIN, DUCKDNS_TOKEN and CERTBOT_EMAIL
(QBASAIR_LETSENCRYPT_EMAIL is still accepted as the older name).
Certificates are written to /srv/letsencrypt on the host.
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

# Read one KEY=value from the env file without executing it as shell code
# (Compose env files are not shell scripts). Surrounding quotes are dropped.
env_value() {
  local value
  value="$(sed -n "s/^${1}=//p" "$ENV_FILE" | tail -n 1)"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

DOMAIN="$(env_value QBASAIR_PUBLIC_DOMAIN)"
TOKEN="$(env_value DUCKDNS_TOKEN)"
EMAIL="$(env_value CERTBOT_EMAIL)"
[[ -n "$EMAIL" ]] || EMAIL="$(env_value QBASAIR_LETSENCRYPT_EMAIL)"

missing=0
[[ -n "$DOMAIN" ]] || { echo "QBASAIR_PUBLIC_DOMAIN must be set in $ENV_FILE." >&2; missing=1; }
[[ -n "$TOKEN" ]] || { echo "DUCKDNS_TOKEN must be set in $ENV_FILE." >&2; missing=1; }
[[ -n "$EMAIL" ]] || { echo "CERTBOT_EMAIL must be set in $ENV_FILE." >&2; missing=1; }
[[ "$missing" -eq 0 ]] || exit 1

case "$DOMAIN" in
  *.duckdns.org) ;;
  *)
    echo "$DOMAIN is not a duckdns.org name: the DuckDNS DNS challenge cannot issue it." >&2
    echo "See docs/deployment-hetzner.md (\"A domain outside DuckDNS\")." >&2
    exit 1
    ;;
esac

compose=(docker compose --env-file "$ENV_FILE")

echo "Requesting the Let's Encrypt certificate for ${DOMAIN} (DNS-01 via DuckDNS)..."
"${compose[@]}" run --rm certbot certonly \
  --non-interactive \
  --agree-tos \
  --no-eff-email \
  --email "$EMAIL" \
  --preferred-challenges dns \
  --authenticator dns-duckdns \
  --dns-duckdns-token "$TOKEN" \
  --dns-duckdns-propagation-seconds 60 \
  --keep-until-expiring \
  -d "$DOMAIN"

"${compose[@]}" run --rm certbot certificates -d "$DOMAIN" | grep -E "Domains:|Expiry Date:" || true

# start-nginx.sh picks the HTTP or the HTTPS config when the container starts,
# so a restart (not a reload) is what turns HTTPS on after a first issuance.
echo "Restarting nginx to load the certificate..."
"${compose[@]}" up -d nginx
"${compose[@]}" restart nginx

echo "TLS provisioning complete."
