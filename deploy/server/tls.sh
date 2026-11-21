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
# QBASAIR_TLS_WWW=1 the certificate also covers www.<domain>. With
# QBASAIR_AUTH_DOMAIN set (Keycloak, e.g. auth.<domain>), that name gets its own
# certificate too. Certificates are kept in letsencrypt/ next to this checkout
# (mounted read-only into nginx). `issue` checks the settings first
# (check-env.sh; QBASAIR_ENABLE_TLS=1), recreates nginx on them, then checks
# that HTTPS answers.

set -euo pipefail

cd "$(dirname "$0")/../.."
ENV_FILE=".env.production"
[[ -f "${ENV_FILE}" ]] || { echo "${ENV_FILE} is missing." >&2; exit 1; }
env_value() { grep -E "^$1=" "${ENV_FILE}" | tail -1 | cut -d= -f2- | tr -d '"' || true; }

DOMAIN="$(env_value QBASAIR_PUBLIC_DOMAIN)"
EMAIL="$(env_value CERTBOT_EMAIL)"
WWW="$(env_value QBASAIR_TLS_WWW)"
AUTH_DOMAIN="$(env_value QBASAIR_AUTH_DOMAIN)"
TLS_ON="$(env_value QBASAIR_ENABLE_TLS | tr -d "' \r")"
[[ -n "${DOMAIN}" ]] || { echo "QBASAIR_PUBLIC_DOMAIN is not set in ${ENV_FILE}." >&2; exit 1; }

compose() { docker compose --env-file "${ENV_FILE}" "$@"; }
certbot() { compose --profile tls run --rm certbot "$@"; }
mkdir -p letsencrypt certbot-webroot

# nginx answers HTTPS for the site and, with Keycloak, the auth domain: the
# check right after a restart, so a certificate nginx doesn't serve shows here.
https_answers() {
  local name="$1" path="$2" code="" _
  for _ in $(seq 1 12); do
    code="$(curl -sk --max-time 5 --resolve "${name}:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://${name}${path}" || true)"
    [[ "${code}" == "200" ]] && return 0
    sleep 5
  done
  echo "https://${name}${path} answered ${code:-nothing} through nginx." >&2
  return 1
}

case "${1:-}" in
  issue)
    # A local name (a test copy's localhost) can't get a certificate.
    bash deploy/server/check-env.sh "${ENV_FILE}" || exit 1
    [[ -n "${EMAIL}" ]] || { echo "CERTBOT_EMAIL is not set in ${ENV_FILE}." >&2; exit 1; }
    # Without it nginx keeps its HTTP configuration whatever certificates exist.
    [[ "${TLS_ON}" == "1" ]] || { echo "Set QBASAIR_ENABLE_TLS=1 in ${ENV_FILE} first: without it nginx never serves HTTPS." >&2; exit 1; }
    domains=(-d "${DOMAIN}")
    [[ "${WWW}" == "1" ]] && domains+=(-d "www.${DOMAIN}")
    certbot certonly --webroot -w /var/www/certbot "${domains[@]}" \
      --email "${EMAIL}" --agree-tos --no-eff-email --non-interactive --keep-until-expiring
    if [[ -n "${AUTH_DOMAIN}" ]]; then
      # Its own certificate (letsencrypt/live/<auth domain>/), so the site's
      # stays as it was; nginx serves the HTTP-01 file for this name too.
      certbot certonly --webroot -w /var/www/certbot -d "${AUTH_DOMAIN}" --cert-name "${AUTH_DOMAIN}" \
        --email "${EMAIL}" --agree-tos --no-eff-email --non-interactive --keep-until-expiring
    fi
    # nginx chooses its HTTPS config at start when the certificate exists.
    # Recreated, not restarted: a restart keeps the settings it was created
    # with (QBASAIR_ENABLE_TLS, the domains) even after .env.production changed.
    compose up -d --no-deps --force-recreate nginx
    https_answers "${DOMAIN}" /healthz \
      || { echo "nginx is not serving HTTPS: docker compose --env-file ${ENV_FILE} logs --tail 20 nginx" >&2; exit 1; }
    if [[ -n "${AUTH_DOMAIN}" ]]; then
      https_answers "${AUTH_DOMAIN}" /realms/qbasair \
        || echo "WARNING: Keycloak doesn't answer on https://${AUTH_DOMAIN} yet (docs/deployment.md → Keycloak)." >&2
    fi
    echo "Certificate(s) in place; nginx serves HTTPS."
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
