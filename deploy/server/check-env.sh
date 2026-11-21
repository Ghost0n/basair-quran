#!/usr/bin/env bash
#
# Checks .env.production before anything uses it (docs/deployment.md →
# "4. Production settings"): deploy.sh runs it before it changes anything,
# tls.sh before it asks for a certificate. Run it by hand after an edit:
#
#   ./deploy/server/check-env.sh [path]    # default: .env.production of this checkout
#
# It prints setting names and line numbers, never a value. An error (exit 1)
# is a file Compose can't read, or a production address that is a local one;
# a warning names a setting that is probably wrong but stops nothing.

set -euo pipefail

FILE="${1:-$(cd "$(dirname "$0")/../.." && pwd)/.env.production}"
errors=0
error() { echo "ERROR: $*" >&2; errors=$((errors + 1)); }
warn() { echo "WARNING: $*" >&2; }

[[ -f "${FILE}" ]] || { echo "ERROR: ${FILE} is missing (copy .env.production.example and fill it in)." >&2; exit 1; }

# --- The file's form: what Compose reads ------------------------------------

# An editor's byte order mark sits before the first «#»: Compose then reads
# line 1 as a variable name ("unexpected character … in variable name").
if [[ "$(head -c 3 "${FILE}" | od -An -tx1 | tr -d ' \n')" == "efbbbf" ]]; then
  error "the file starts with a byte order mark (BOM): save it as UTF-8 without BOM."
fi
# Windows line ends leave a \r at the end of every value.
crlf="$(grep -c $'\r' "${FILE}" || true)"
if [[ "${crlf}" != "0" ]]; then
  error "${crlf} line(s) end with CRLF (Windows): convert the file to LF (sed -i 's/\\r\$//' .env.production)."
fi
# Every line: a comment, empty, or NAME=value.
bad="$(tr -d '\r' < "${FILE}" | sed '1s/^\xEF\xBB\xBF//' \
  | grep -nvE '^[[:space:]]*(#.*)?$|^[A-Za-z_][A-Za-z0-9_]*=' | cut -d: -f1 | paste -sd, - || true)"
if [[ -n "${bad}" ]]; then
  error "line(s) ${bad} are not «NAME=value», a comment or empty."
fi

# --- The values ---------------------------------------------------------------

# The last value of a setting, without quotes, \r or trailing spaces.
value() { grep -E "^$1=" "${FILE}" | tail -1 | cut -d= -f2- | tr -d "\"'\r" | sed 's/[[:space:]]*$//' || true; }
host_of() { local h="${1#*://}"; h="${h%%/*}"; echo "${h%%:*}"; }
# A name no certificate can be issued for and no visitor can reach.
is_local() {
  local h="${1,,}"
  [[ -z "${h}" || "${h}" != *.* || "${h}" == localhost || "${h}" == *.localhost \
    || "${h}" =~ ^[0-9]+(\.[0-9]+){3}$ || "${h}" == *:* ]]
}
profile_on() { [[ ",$(value COMPOSE_PROFILES | tr -d ' ')," == *",$1,"* ]]; }

domain="$(value QBASAIR_PUBLIC_DOMAIN)"
public_url="$(value QBASAIR_PUBLIC_URL)"
if is_local "${domain}"; then
  error "QBASAIR_PUBLIC_DOMAIN must be the site's public name (e.g. basairquran.com), not empty, localhost or an IP."
fi
if [[ "${public_url}" != https://* ]] || is_local "$(host_of "${public_url}")"; then
  error "QBASAIR_PUBLIC_URL must be https://<the public domain> (sign-in links and the realm's addresses are built from it)."
elif [[ -n "${domain}" && "$(host_of "${public_url}")" != "${domain}" && "$(host_of "${public_url}")" != "www.${domain}" ]]; then
  warn "QBASAIR_PUBLIC_URL is not on QBASAIR_PUBLIC_DOMAIN."
fi
[[ -n "$(value QBASAIR_SESSION_SECRET)" ]] || error "QBASAIR_SESSION_SECRET is empty (openssl rand -hex 32)."
[[ "$(value QBASAIR_ENABLE_TLS)" == "1" ]] \
  || warn "QBASAIR_ENABLE_TLS is not 1: nginx serves plain HTTP only, even once tls.sh has issued the certificates."
[[ "$(value QBASAIR_SESSION_SECURE)" != "0" ]] \
  || warn "QBASAIR_SESSION_SECURE is 0: the session cookie is not marked Secure."
if [[ "$(value QBASAIR_CORS_ORIGINS)" =~ localhost|127\.0\.0\. ]]; then
  warn "QBASAIR_CORS_ORIGINS still lists a local address."
fi

if profile_on keycloak; then
  for key in QBASAIR_AUTH_DOMAIN QBASAIR_OIDC_CLIENT_SECRET KC_DB_PASSWORD KC_BOOTSTRAP_ADMIN_PASSWORD; do
    [[ -n "$(value "${key}")" ]] || error "COMPOSE_PROFILES has keycloak but ${key} is empty (docs/deployment.md → Keycloak)."
  done
  auth_domain="$(value QBASAIR_AUTH_DOMAIN)"
  if [[ -n "${auth_domain}" ]] && is_local "${auth_domain}"; then
    error "QBASAIR_AUTH_DOMAIN must be the sign-in's public name (e.g. auth.basairquran.com)."
  fi
  issuer="$(value QBASAIR_OIDC_ISSUER)"
  if [[ -n "${issuer}" && -n "${auth_domain}" && "${issuer%/}" != "https://${auth_domain}/realms/qbasair" ]]; then
    error "QBASAIR_OIDC_ISSUER must be https://<QBASAIR_AUTH_DOMAIN>/realms/qbasair (the API checks every sign-in against it)."
  fi
  [[ "$(value QBASAIR_AUTH_PROVIDER)" == "keycloak" ]] \
    || warn "the keycloak profile is on but QBASAIR_AUTH_PROVIDER is not \"keycloak\": sign-in stays local."
  if [[ "$(value KC_SMTP_FROM)" =~ localhost ]]; then
    warn "KC_SMTP_FROM is a localhost address: mail providers refuse it (the realm's sender is changed in the console → Realm settings → Email)."
  fi
fi

if (( errors > 0 )); then
  echo "${errors} problem(s) in ${FILE}." >&2
  exit 1
fi
