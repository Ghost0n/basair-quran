#!/usr/bin/env bash
# Run Keycloak locally for development (docs/keycloak.md): the server
# distribution from Maven Central (no container registry needed), the realm
# «qbasair» rendered by scripts/keycloak_realm.py --dev (admin@ / moderator@ /
# member@basair.test, password Basair-dev-1), on http://127.0.0.1:8080.
#
#   scripts/keycloak_dev.sh            # download if needed, (re)import the realm, start
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

export QBASAIR_PUBLIC_URL="${QBASAIR_PUBLIC_URL:-http://127.0.0.1:3000}"
export QBASAIR_OIDC_CLIENT_SECRET="${QBASAIR_OIDC_CLIENT_SECRET:-dev-web-secret}"
mkdir -p "$HOME_DIR/data/import"
python3 "$ROOT/scripts/keycloak_realm.py" --dev --output "$HOME_DIR/data/import/qbasair-realm.json"

export KC_BOOTSTRAP_ADMIN_USERNAME="${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}"
export KC_BOOTSTRAP_ADMIN_PASSWORD="${KC_BOOTSTRAP_ADMIN_PASSWORD:-admin}"
exec "$HOME_DIR/bin/kc.sh" start-dev --http-port "$PORT" --http-host 127.0.0.1 --import-realm
