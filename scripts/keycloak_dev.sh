#!/usr/bin/env bash
# Run Keycloak locally for development (docs/keycloak.md): the server
# distribution from Maven Central (no container registry needed), the realm
# «qbasair» rendered by scripts/keycloak_realm.py --dev (admin@ / moderator@ /
# member@basair.test, password Basair-dev-1), on http://127.0.0.1:8080.
#
#   scripts/keycloak_dev.sh            # download if needed, (re)import the realm, start
#
# The email-code extension (apps/keycloak-email-code, built with Maven when
# missing) and the login theme «qbasair» (apps/keycloak-theme, once built with
# pnpm --filter @q-basair/keycloak-theme build:jar) are copied into providers/;
# without the theme, set KC_THEME= (empty) for Keycloak's own pages. Theme
# caching is off, so template and style edits show on reload; a new JAR needs a restart.
#
# Then start the API with:
#   QBASAIR_AUTH_ENABLED=1 QBASAIR_AUTH_PROVIDER=keycloak \
#   QBASAIR_OIDC_ISSUER=http://127.0.0.1:8080/realms/qbasair \
#   QBASAIR_OIDC_CLIENT_SECRET=dev-web-secret QBASAIR_PUBLIC_URL=http://127.0.0.1:3000 \
#   QBASAIR_SESSION_SECRET=dev-only-secret QBASAIR_SESSION_SECURE=0 python scripts/start_api.py
set -euo pipefail

VERSION="${KEYCLOAK_VERSION:-26.8.2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="$ROOT/.runtime/keycloak-$VERSION"
PORT="${KEYCLOAK_PORT:-8080}"

if [ ! -x "$HOME_DIR/bin/kc.sh" ]; then
  mkdir -p "$ROOT/.runtime"
  url="https://repo1.maven.org/maven2/org/keycloak/keycloak-quarkus-dist/$VERSION/keycloak-quarkus-dist-$VERSION.zip"
  echo "downloading Keycloak $VERSION…"
  curl -fsSL "$url" -o "$ROOT/.runtime/keycloak-$VERSION.zip"
  (cd "$ROOT/.runtime" && unzip -q -o "keycloak-$VERSION.zip")
fi

# Local secrets (mail, sign-in providers) as KEY=value lines in .runtime/keycloak.env
# (git-ignored; docs/keycloak.md «Development»), read literally: no shell expansion.
if [ -f "$ROOT/.runtime/keycloak.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    export "${line%%=*}=${line#*=}"
  done < "$ROOT/.runtime/keycloak.env"
fi

export QBASAIR_PUBLIC_URL="${QBASAIR_PUBLIC_URL:-http://127.0.0.1:3000}"
export QBASAIR_OIDC_CLIENT_SECRET="${QBASAIR_OIDC_CLIENT_SECRET:-dev-web-secret}"
mkdir -p "$HOME_DIR/data/import"
PYTHON="$(command -v python3 || command -v python)"
"$PYTHON" "$ROOT/scripts/keycloak_realm.py" --dev --output "$HOME_DIR/data/import/qbasair-realm.json"

# The email-code required action the realm names (apps/keycloak-email-code):
# built with Maven when missing; without it, sign-up cannot verify an email.
EMAIL_CODE_JAR="$ROOT/apps/keycloak-email-code/target/qbasair-keycloak-email-code.jar"
if [ ! -f "$EMAIL_CODE_JAR" ] && command -v mvn >/dev/null; then
  (cd "$ROOT/apps/keycloak-email-code" && mvn -q -B package)
fi
if [ -f "$EMAIL_CODE_JAR" ]; then
  cp "$EMAIL_CODE_JAR" "$HOME_DIR/providers/"
else
  echo "note: the email-code extension is not built (apps/keycloak-email-code: mvn package) — new accounts cannot verify their email" >&2
fi

THEME_JAR="$ROOT/apps/keycloak-theme/dist_keycloak/qbasair-keycloak-theme.jar"
if [ -f "$THEME_JAR" ]; then
  cp "$THEME_JAR" "$HOME_DIR/providers/"
elif [ "${KC_THEME-qbasair}" = "qbasair" ]; then
  echo "note: the login theme is not built (apps/keycloak-theme, docs/keycloak.md) — Keycloak will fall back to its own pages" >&2
fi

export KC_BOOTSTRAP_ADMIN_USERNAME="${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}"
export KC_BOOTSTRAP_ADMIN_PASSWORD="${KC_BOOTSTRAP_ADMIN_PASSWORD:-admin}"
exec "$HOME_DIR/bin/kc.sh" start-dev --http-port "$PORT" --http-host 127.0.0.1 --import-realm \
  --spi-theme--cache-themes=false --spi-theme--cache-templates=false --spi-theme--static-max-age=-1
