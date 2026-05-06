# Q-Basair API Contract

This document freezes the backend contract that the future frontend migration will target.

## Stability policy

- The existing public endpoints stay available during the migration.
- `/api/search` remains the compatibility endpoint.
- `/api/search-v2` and `/api/search-result-page` remain the paginated search surface for the current UI.
- Reader endpoints remain additive and backward-compatible.
- `/api/research-agent` is additive and returns strict-context Quran research responses.
- `GET /api/research-agent/settings` is additive and exposes the active Ollama provider, available models, and plan-limit guidance for the research UI.
- `/api/auth/*` is additive and supports invite-only session authentication when enabled.

## Canonical schema source

- Runtime OpenAPI schema: `/openapi.json`
- FastAPI app entrypoint: `src/app/factory.py`
- Typed request/response models: `src/app/models/api.py`

## Stable endpoints

- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/mushafs`
- `GET /api/suggest`
- `POST /api/suggest-batch`
- `GET /api/search`
- `GET /api/search-v2`
- `GET /api/search-result-page`
- `GET /api/research-agent/settings`
- `POST /api/research-agent`
- `GET /api/ayah-reader`
- `GET /api/ayah-reader-more`
- `GET /api/quran-page`

## Authentication notes

- Authentication is controlled by `QBASAIR_AUTH_ENABLED`.
- When enabled, all application API routes except `GET /api/health` and `/api/auth/*` require a valid session.
- Sessions are stored in signed cookies. The backend expects:
  - `QBASAIR_SESSION_SECRET`
  - `QBASAIR_SESSION_COOKIE_NAME`
  - `QBASAIR_SESSION_SECURE`
- Public signup is intentionally absent in this slice. Accounts are managed through `scripts/manage_users.py`.
- `GET /api/auth/session` returns whether auth is enabled and whether the current browser session is authenticated.
- `POST /api/auth/login` accepts:
  - `email`
  - `password`
- `POST /api/auth/logout` clears the current session.

## Research agent notes

- Both research endpoints accept optional per-request Ollama override headers:
  - `X-QBasair-Ollama-Key`
  - `X-QBasair-Ollama-Chat-Model`
  - `X-QBasair-Ollama-Embed-Model`
  - `X-QBasair-Ollama-Base-Url`
- The intended browser flow is session-scoped user keys supplied by the frontend. The backend should use the headers for the current request only and must not persist them.
- `POST /api/research-agent` may now include:
  - provider metadata
  - per-request usage metrics
  - structured Tafssir sections when `response_mode="tafssir"`
- `GET /api/research-agent/settings` returns:
  - current provider metadata
  - `available_models`
  - `limits` guidance for Ollama cloud plans and observability

## Migration note

The backend is now organized around:

- app factory
- route modules
- typed API models
- service-layer search and reader logic

This keeps the current behavior intact while giving the upcoming web/mobile frontend work a stable API boundary.
