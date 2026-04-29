# Q-Basair API Contract

This document freezes the backend contract that the future frontend migration will target.

## Stability policy

- The existing public endpoints stay available during the migration.
- `/api/search` remains the compatibility endpoint.
- `/api/search-v2` and `/api/search-result-page` remain the paginated search surface for the current UI.
- Reader endpoints remain additive and backward-compatible.

## Canonical schema source

- Runtime OpenAPI schema: `/openapi.json`
- FastAPI app entrypoint: `src/app/factory.py`
- Typed request/response models: `src/app/models/api.py`

## Stable endpoints

- `GET /api/health`
- `GET /api/mushafs`
- `GET /api/suggest`
- `POST /api/suggest-batch`
- `GET /api/search`
- `GET /api/search-v2`
- `GET /api/search-result-page`
- `GET /api/ayah-reader`
- `GET /api/ayah-reader-more`
- `GET /api/quran-page`

## Migration note

The backend is now organized around:

- app factory
- route modules
- typed API models
- service-layer search and reader logic

This keeps the current behavior intact while giving the upcoming web/mobile frontend work a stable API boundary.
