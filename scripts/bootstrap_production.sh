#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE=".env.production"
SKIP_DB=0
SKIP_INDEX=0
WITH_EMBEDDINGS=0
NO_BUILD=0
PROVISION_TLS=0

usage() {
  cat <<'EOF'
Usage: ./scripts/bootstrap_production.sh [options]

Options:
  --env-file PATH         Compose env file to use (default: .env.production)
  --skip-db               Skip the quran.db rebuild step
  --skip-index            Skip the research index rebuild step
  --with-embeddings       Rebuild the research index with embeddings
  --no-build              Start the stack without rebuilding images
  --provision-tls         Request/refresh the Let's Encrypt certificate after boot
  --help                  Show this help message

Examples:
  ./scripts/bootstrap_production.sh
  ./scripts/bootstrap_production.sh --env-file .env.production --with-embeddings
  ./scripts/bootstrap_production.sh --skip-index --no-build
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --skip-db)
      SKIP_DB=1
      shift
      ;;
    --skip-index)
      SKIP_INDEX=1
      shift
      ;;
    --with-embeddings)
      WITH_EMBEDDINGS=1
      shift
      ;;
    --no-build)
      NO_BUILD=1
      shift
      ;;
    --provision-tls)
      PROVISION_TLS=1
      shift
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
  if [[ -f ".env.production.example" ]]; then
    echo "Start by copying .env.production.example to $ENV_FILE and editing it." >&2
  fi
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi

compose=(docker compose --env-file "$ENV_FILE")

echo "Validating Docker Compose configuration..."
"${compose[@]}" config >/dev/null

if [[ $SKIP_DB -eq 0 ]]; then
  echo "Rebuilding quran.db..."
  "${compose[@]}" run --rm api python scripts/build_db.py
else
  echo "Skipping quran.db rebuild."
fi

if [[ $SKIP_INDEX -eq 0 ]]; then
  if find "$PROJECT_ROOT/data/research_sources" -type f -print -quit 2>/dev/null | grep -q .; then
    echo "Rebuilding research_agent.db..."
    if [[ $WITH_EMBEDDINGS -eq 1 ]]; then
      "${compose[@]}" run --rm api python scripts/build_research_index.py --with-embeddings
    else
      "${compose[@]}" run --rm api python scripts/build_research_index.py
    fi
  else
    echo "No files found under data/research_sources; skipping research index rebuild."
  fi
else
  echo "Skipping research index rebuild."
fi

echo "Starting the production stack..."
if [[ $NO_BUILD -eq 1 ]]; then
  "${compose[@]}" up -d
else
  "${compose[@]}" up -d --build
fi

echo
echo "Current service status:"
"${compose[@]}" ps

if [[ $PROVISION_TLS -eq 1 ]]; then
  echo
  echo "Provisioning HTTPS certificate..."
  "${PROJECT_ROOT}/scripts/provision_tls.sh" --env-file "$ENV_FILE"
fi

echo
echo "Bootstrap complete."
