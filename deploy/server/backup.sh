#!/usr/bin/env bash
#
# Nightly backup of the user data (docs/deployment.md → "Backups"), from the
# cron that deploy/server/setup.sh installs (02:42, as the deploy user):
#
#   - auth.db       accounts and sessions
#   - app_data.db   notebook, themes, study sessions, followed roots, research
#                   documents, preferences, community, feedback
#   - research_agent.db (regenerable, best effort)
#   - .env.production (the server's settings and secrets)
# quran.db, translations.db, the offline packs and the recitations are not
# backed up: the deploy regenerates them.
#
# SQLite's online ".backup" gives a consistent copy while the API has the
# databases open. Snapshots go to backups/<timestamp>.tar.gz and are kept
# QBASAIR_BACKUP_RETENTION_DAYS days (default 14). With
# QBASAIR_BACKUP_RCLONE_REMOTE set (e.g. "r2:qbasair-backups") and rclone
# configured for the deploy user, each archive is also copied off the server.
#
# Overrides: QBASAIR_DATA_DIR, QBASAIR_BACKUP_DIR (default: data/ and backups/
# next to this checkout).

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${APP_DIR}/.env.production"
env_value() { [[ -f "${ENV_FILE}" ]] && grep -E "^$1=" "${ENV_FILE}" | tail -1 | cut -d= -f2- || true; }

DATA_DIR="${QBASAIR_DATA_DIR:-${APP_DIR}/data}"
BACKUP_DIR="${QBASAIR_BACKUP_DIR:-${APP_DIR}/backups}"
RETENTION_DAYS="${QBASAIR_BACKUP_RETENTION_DAYS:-$(env_value QBASAIR_BACKUP_RETENTION_DAYS)}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
RCLONE_REMOTE="${QBASAIR_BACKUP_RCLONE_REMOTE:-$(env_value QBASAIR_BACKUP_RCLONE_REMOTE)}"

timestamp="$(date +%Y%m%d-%H%M%S)"
dest="${BACKUP_DIR}/${timestamp}"
mkdir -p "${dest}"
chmod 700 "${BACKUP_DIR}" "${dest}"

DATABASES="auth.db app_data.db research_agent.db"

timestamp="$(date +%Y%m%d-%H%M%S)"
dest="${BACKUP_DIR}/${timestamp}"
mkdir -p "${dest}"

backup_one() {
  local name="$1"
  local src="${DATA_DIR}/${name}"
  local out="${dest}/${name}"
  if [ ! -f "${src}" ]; then
    echo "skip: ${src} not found"
    return 0
  fi
  if command -v sqlite3 >/dev/null 2>&1; then
    # Consistent online backup — safe while the DB is open by the API.
    sqlite3 "${src}" ".backup '${out}'"
  else
    # Fallback: plain copy (small risk of an inconsistent snapshot under load).
    cp "${src}" "${out}"
  fi
  echo "backed up: ${name} -> ${out}"
}

for db in ${DATABASES}; do
  backup_one "${db}"
done

if [[ -f "${ENV_FILE}" ]]; then
  install -m 600 "${ENV_FILE}" "${dest}/env.production"
  echo "backed up: .env.production"
fi

# Compress the snapshot dir to save space. Archiving is best-effort — a failure
# must never discard the good uncompressed copies already written above.
if command -v tar >/dev/null 2>&1; then
  if tar -czf "${dest}.tar.gz" -C "${BACKUP_DIR}" "${timestamp}"; then
    rm -rf "${dest}"
    echo "archived: ${dest}.tar.gz"
  else
    echo "warning: archiving failed; keeping uncompressed snapshot at ${dest}"
  fi
fi

# Prune old backups beyond the retention window.
find "${BACKUP_DIR}" -maxdepth 1 -name '*.tar.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete || true
find "${BACKUP_DIR}" -maxdepth 1 -type d -name '20*' -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true

if [[ -n "${RCLONE_REMOTE}" && -f "${dest}.tar.gz" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "${dest}.tar.gz" "${RCLONE_REMOTE}" && echo "copied off the server: ${RCLONE_REMOTE}"
  else
    echo "warning: QBASAIR_BACKUP_RCLONE_REMOTE is set but rclone is not installed"
  fi
fi

echo "backup complete: ${timestamp}"
