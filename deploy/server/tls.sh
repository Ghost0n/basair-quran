#!/usr/bin/env bash
#
# Let's Encrypt certificate for the site (docs/deployment.md → "HTTPS").
#
#   ./deploy/server/tls.sh issue    the first time (the stack must be running:
#                                   nginx answers the HTTP-01 challenge on port 80)
#   ./deploy/server/tls.sh renew    from the daily cron (setup.sh): renews when
#                                   less than 30 days are left, then reloads nginx
#
# Reads QBASAIR_PUBLIC_DOMAIN and CERTBOT_EMAIL from .env.production; with
# QBASAIR_TLS_WWW=1 the certificate also covers www.<domain>. Certificates are
# kept in letsencrypt/ next to this checkout (mounted read-only into nginx).

set -euo pipefail

cd "$(dirname "$0")/../.."
ENV_FILE=".env.production"
[[ -f "${ENV_FILE}" ]] || { echo "${ENV_FILE} is missing." >&2; exit 1; }
env_value() { grep -E "^$1=" "${ENV_FILE}" | tail -1 | cut -d= -f2- | tr -d '"' || true; }

DOMAIN="$(env_value QBASAIR_PUBLIC_DOMAIN)"
EMAIL="$(env_value CERTBOT_EMAIL)"
WWW="$(env_value QBASAIR_TLS_WWW)"
[[ -n "${DOMAIN}" ]] || { echo "QBASAIR_PUBLIC_DOMAIN is not set in ${ENV_FILE}." >&2; exit 1; }

compose() { docker compose --env-file "${ENV_FILE}" "$@"; }
certbot() { compose --profile tls run --rm certbot "$@"; }
mkdir -p letsencrypt certbot-webroot

case "${1:-}" in
  issue)
    [[ -n "${EMAIL}" ]] || { echo "CERTBOT_EMAIL is not set in ${ENV_FILE}." >&2; exit 1; }
    domains=(-d "${DOMAIN}")
    [[ "${WWW}" == "1" ]] && domains+=(-d "www.${DOMAIN}")
    certbot certonly --webroot -w /var/www/certbot "${domains[@]}" \
      --email "${EMAIL}" --agree-tos --no-eff-email --non-interactive --keep-until-expiring
    # nginx chooses its HTTPS config at start when the certificate exists.
    compose restart nginx
    echo "Certificate in place; nginx restarted on HTTPS."
    ;;
  renew)
    certbot renew --webroot -w /var/www/certbot --quiet
    compose exec -T nginx nginx -s reload
    echo "$(date -u +%FT%TZ) renewal checked, nginx reloaded."
    ;;
  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
