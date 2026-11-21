#!/usr/bin/env bash
#
# Deploys one release of Q-Basair on the server (docs/deployment.md). The
# release workflow runs it over SSH after copying the deploy files here; run
# it by hand to redeploy or roll back:
#
#   cd /srv/q-basair
#   ./deploy/server/deploy.sh --tag <commit-sha>            # that release's images
#   ./deploy/server/deploy.sh --rollback                     # the release before the current one
#   ./deploy/server/deploy.sh --tag <sha> --jobs rebuild-db  # plus a data job
#
# Steps: pull the images tagged <sha> from GHCR, restart the stack on them,
# run the data jobs asked for, then wait for /api/ready to report that commit.
# If the new release doesn't become ready, the previous one is put back.
#
# Data jobs (--jobs, comma-separated; the workflow passes the deploy tags
# found in the merge commit's message — AGENTS.md → "Deploy tags"):
#   rebuild-db            quran.db + the Madani layout tables, then restart the API
#   rebuild-translations  translations.db then the app's offline packs (background)
#   prefill-recitation    the shared verse-duration cache (background)
#   prepare-recitations   one recording per surah (background, resumable;
#                         QBASAIR_PREPARE_RECITERS in .env.production)
# Missing generated data is built without asking: translations.db, the
# offline packs and the duration cache.
#
# With COMPOSE_PROFILES=keycloak in .env.production (docs/keycloak.md →
# "Production"), the release's Keycloak image runs too: the realm «qbasair» is
# rendered from .env.production into keycloak/import/ before it starts, and
# imported on Keycloak's first start (an existing realm is left as it is).

set -euo pipefail

cd "$(dirname "$0")/../.."
APP_DIR="$(pwd)"
ENV_FILE="${APP_DIR}/.env.production"
STATE_DIR="${APP_DIR}/.deploy"
TAG=""
JOBS=""
ROLLBACK=0
READY_TIMEOUT=300

usage() { sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="${2:-}"; shift 2 ;;
    --jobs) JOBS="${2:-}"; shift 2 ;;
    --rollback) ROLLBACK=1; shift ;;
    --ready-timeout) READY_TIMEOUT="${2:-300}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

[[ -f "${ENV_FILE}" ]] || fail "${ENV_FILE} is missing (copy .env.production.example, fill it in)."
mkdir -p "${STATE_DIR}" data data/recitations letsencrypt certbot-webroot backups

CURRENT="$(cat "${STATE_DIR}/current" 2>/dev/null || true)"
PREVIOUS="$(cat "${STATE_DIR}/previous" 2>/dev/null || true)"
if [[ "${ROLLBACK}" == "1" ]]; then
  [[ -n "${PREVIOUS}" ]] || fail "no previous release recorded in ${STATE_DIR}/previous."
  TAG="${PREVIOUS}"
  log "rolling back from ${CURRENT:-?} to ${TAG}"
fi
[[ -n "${TAG}" ]] || fail "--tag <commit-sha> (or --rollback) is required."

compose() {
  QBASAIR_IMAGE_TAG="$1" QBASAIR_COMMIT_SHA="$1" QBASAIR_RUN_UID="$(id -u)" QBASAIR_RUN_GID="$(id -g)" \
    docker compose --env-file "${ENV_FILE}" "${@:2}"
}

has_job() { [[ ",${JOBS}," == *",$1,"* ]]; }

env_value() { grep -E "^$1=" "${ENV_FILE}" | tail -1 | cut -d= -f2- || true; }

# A value without its quotes or spaces.
env_bare() { env_value "$1" | tr -d "\"' "; }

keycloak_enabled() { [[ ",$(env_bare COMPOSE_PROFILES)," == *",keycloak,"* ]]; }

# Keycloak's settings, checked before anything changes.
if keycloak_enabled; then
  missing=""
  for key in QBASAIR_AUTH_DOMAIN QBASAIR_PUBLIC_URL QBASAIR_OIDC_CLIENT_SECRET KC_DB_PASSWORD KC_BOOTSTRAP_ADMIN_PASSWORD; do
    [[ -n "$(env_bare "${key}")" ]] || missing="${missing} ${key}"
  done
  [[ -z "${missing}" ]] || fail "COMPOSE_PROFILES has keycloak but .env.production lacks:${missing} (docs/deployment.md → Keycloak)."
  [[ "$(env_bare QBASAIR_AUTH_PROVIDER)" == "keycloak" ]] \
    || log "note: the keycloak profile is on but QBASAIR_AUTH_PROVIDER is not \"keycloak\": sign-in stays local."
fi

wait_ready() {
  local tag="$1" deadline=$((SECONDS + READY_TIMEOUT)) body="" domain
  domain="$(env_value QBASAIR_PUBLIC_DOMAIN)"
  while (( SECONDS < deadline )); do
    # Through nginx, as a visitor would: HTTPS once the certificate exists
    # (plain HTTP then only redirects), plain HTTP before.
    if [[ -n "${domain}" && -f "letsencrypt/live/${domain}/fullchain.pem" ]]; then
      body="$(curl -sSk --max-time 5 --resolve "${domain}:443:127.0.0.1" "https://${domain}/api/ready" 2>/dev/null || true)"
    else
      body="$(curl -sS --max-time 5 -H "Host: ${domain:-localhost}" http://127.0.0.1/api/ready 2>/dev/null || true)"
    fi
    if [[ "${body}" == *'"db":true'* && "${body}" == *"\"commit\":\"${tag}\""* ]]; then
      return 0
    fi
    sleep 5
  done
  log "last /api/ready answer: ${body:-none}"
  return 1
}

start_release() {
  local tag="$1"
  log "pulling the images of ${tag}"
  # Every service of the active profiles (Keycloak and its database with the
  # keycloak profile); certbot's `tls` profile stays out.
  compose "${tag}" pull
  if keycloak_enabled; then
    log "rendering the Keycloak realm from .env.production"
    install -d -m 700 keycloak keycloak/import
    compose "${tag}" run --rm --no-deps keycloak-realm >/dev/null
    chmod 600 keycloak/import/qbasair-realm.json
  fi
  log "starting ${tag}"
  compose "${tag}" up -d --no-build --remove-orphans
}

# Keycloak doesn't gate the release (the site serves without it), but a
# sign-in that can't work is worth a loud line in the run.
wait_keycloak() {
  local deadline=$((SECONDS + 240)) state=""
  while (( SECONDS < deadline )); do
    state="$(docker inspect -f '{{.State.Health.Status}}' "$(compose "${TAG}" ps -q keycloak)" 2>/dev/null || true)"
    [[ "${state}" == "healthy" ]] && { log "Keycloak is healthy"; return 0; }
    sleep 5
  done
  log "WARNING: Keycloak is not healthy (${state:-not running}): sign-in won't work — docker compose --env-file .env.production logs keycloak"
  return 1
}

# Once: the admin console lives behind the SSH tunnel (KC_HOSTNAME_ADMIN), and
# nginx hides the master realm, so the master realm's own address is set to the
# tunnel's — otherwise the console waits forever for the public address. Runs
# inside the container with its bootstrap admin (the password stays there).
keycloak_console_address() {
  [[ -f "${STATE_DIR}/keycloak-console" ]] && return 0
  if compose "${TAG}" exec -T keycloak bash -c '
      cfg=/tmp/kcadm.config; kc=/opt/keycloak/bin/kcadm.sh
      trap "rm -f $cfg" EXIT
      $kc config credentials --config "$cfg" --server http://127.0.0.1:8080 --realm master \
        --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1
      $kc update realms/master --config "$cfg" -s "attributes.frontendUrl=$KC_HOSTNAME_ADMIN"'; then
    touch "${STATE_DIR}/keycloak-console"
    log "Keycloak's admin console set to the SSH tunnel's address"
  else
    log "WARNING: could not set the admin console's address (docs/deployment.md → Keycloak)."
  fi
}

# 1. The new release.
start_release "${TAG}"

# 2. Data jobs that the new code needs before it serves (quran.db).
if has_job rebuild-db; then
  log "rebuilding quran.db and the Madani layout tables"
  compose "${TAG}" run --rm api python scripts/build_db.py
  # build_db.py recreates quran.db without the layout tables: rebuild them.
  compose "${TAG}" run --rm api python scripts/build_mushaf_layout.py
  compose "${TAG}" up -d --no-deps --no-build api worker
  # The API cache (docs/caching.md) may hold an hour of answers from the old database.
  compose "${TAG}" exec -T nginx sh -c 'rm -rf /var/cache/nginx/qbasair/*' || true
fi

# 3. Readiness: the new commit answers, with its database. Otherwise roll back.
log "waiting for /api/ready to report ${TAG}"
if ! wait_ready "${TAG}"; then
  if [[ -n "${CURRENT}" && "${CURRENT}" != "${TAG}" ]]; then
    log "${TAG} did not become ready: putting ${CURRENT} back"
    start_release "${CURRENT}"
    wait_ready "${CURRENT}" || log "WARNING: ${CURRENT} is not ready either — check 'docker compose logs api'."
  fi
  fail "${TAG} did not become ready within ${READY_TIMEOUT}s."
fi
if [[ "${CURRENT}" != "${TAG}" ]]; then
  [[ -n "${CURRENT}" ]] && echo "${CURRENT}" > "${STATE_DIR}/previous"
  echo "${TAG}" > "${STATE_DIR}/current"
fi
# So that a plain `docker compose --env-file .env.production ...` by hand
# addresses the release that is live.
if grep -qE '^QBASAIR_IMAGE_TAG=' "${ENV_FILE}"; then
  sed -i "s/^QBASAIR_IMAGE_TAG=.*/QBASAIR_IMAGE_TAG=${TAG}/" "${ENV_FILE}"
else
  echo "QBASAIR_IMAGE_TAG=${TAG}" >> "${ENV_FILE}"
fi
echo "$(date -u +%FT%TZ) ${TAG} ${JOBS:-}" >> "${STATE_DIR}/history"
log "${TAG} is live"
if keycloak_enabled && wait_keycloak; then keycloak_console_address; fi

# 4. Long data jobs, in the background (detached containers; resumable).
# Run on the deploy files themselves: the offline packs read the interface
# dictionaries under apps/web/lib/i18n, which the API image doesn't carry.
run_detached_on_files() {
  compose "${TAG}" run -d --rm -v "${APP_DIR}:/repo" -w /repo -e PYTHONPATH=/repo api sh -c "$1" >/dev/null
}
packs="python scripts/build_offline_packs.py --output data/offline"
if has_job rebuild-translations || [[ ! -f data/translations.db ]]; then
  log "background: translations.db (QuranEnc / Tanzil), then the offline packs"
  run_detached_on_files "python scripts/build_translations.py && ${packs}"
elif has_job rebuild-db || [[ ! -f data/offline/manifest.json ]]; then
  log "background: the offline packs"
  run_detached_on_files "${packs}"
fi
if has_job prefill-recitation || [[ ! -f data/cache.db ]]; then
  log "background: the shared recitation-duration cache"
  compose "${TAG}" run -d --rm api python scripts/prefill_recitation_cache.py >/dev/null
fi
if has_job prepare-recitations; then
  reciters="$(env_value QBASAIR_PREPARE_RECITERS)"
  log "background: preparing the recitations (${reciters:-configured}) — docs/deployment.md → Preparing the recitations"
  compose "${TAG}" run -d --rm api python scripts/build_recitations.py --reciters "${reciters:-configured}" >/dev/null
fi

# 5. Old images: keep this release and the one before (a quick rollback);
# remove the other releases' images and anything dangling.
prefix="$(env_value QBASAIR_IMAGE_PREFIX)"
prefix="${prefix:-ghcr.io/ghost0n/basair-quran}"
keep_previous="$(cat "${STATE_DIR}/previous" 2>/dev/null || true)"
docker image ls --format '{{.Repository}}:{{.Tag}}' \
  | grep -E "^${prefix}-(api|web|keycloak):" \
  | grep -vE ":(${TAG}|${keep_previous:-none}|latest)$" \
  | xargs -r docker image rm >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
log "done"
