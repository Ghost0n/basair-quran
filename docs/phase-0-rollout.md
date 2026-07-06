# Phase 0 rollout — human-only activation steps

The autonomous night-run authored and locally verified the items below, but their
**activation** is deliberately left to the owner (they push to `main`, touch the
server, or change deploy behavior). Nothing here has been pushed or merged. Do the
steps in order; each is small.

Branch containing the work: `feat/Q-Basair-7-nuit-production` (off `develop`).

---

## 1. Session secret is now required (T1.4)

`docker-compose.yml` changed:
- `QBASAIR_SESSION_SECRET: ${QBASAIR_SESSION_SECRET:?…}` — compose now **refuses to start**
  if the variable is unset/empty.
- `QBASAIR_SESSION_SECURE: ${QBASAIR_SESSION_SECURE:-1}` — secure cookies default **on**.

The app also fails hard at startup if `QBASAIR_AUTH_ENABLED=1` and the session secret is the
dev default.

**Action before the next deploy:** ensure `/srv/q-basair/.env.production` defines a strong
`QBASAIR_SESSION_SECRET` (e.g. `python -c "import secrets; print(secrets.token_urlsafe(48))"`).
If it is already set, no change is needed. Without it, `docker compose up` will error out.

---

## 2. CI quality gate (T1.9) — `.github/workflows/ci.yml`

Authored: runs `pytest` (backend) and the web build (frontend) on every PR and on pushes to
`develop`/`main`. It is **not** the deploy workflow (`deploy.yml`, main-only) and does not deploy.

Locally verified:
- `python -m pip install -r requirements-dev.txt` resolves cleanly (pins match the working env).
- `PYTHONPATH=. pytest -q` is green.
- The web build is green via `scripts/build_web.ps1`.

Pinned deps: `requirements.txt` now pins fastapi/starlette/pydantic/uvicorn/itsdangerous;
`requirements-dev.txt` adds pytest + httpx.

**Action to activate:** merge the branch so the workflow file lands on `develop`/`main`.
GitHub-hosted runners execute it automatically — no secrets required for CI (only `deploy.yml`
uses the self-hosted runner). First run will populate the pip/pnpm caches.
Escape hatch: put `[skip-expensive-ci]` in a commit message to skip the frontend build job
(tiny doc/metadata commits only).

---

## 3. (reserved) Deploy reorder + quran.db untrack + backups (T1.10)

Filled in when T1.10 lands. These are the highest-risk, human-supervised steps
(server working-tree transition for `data/quran.db`); never run overnight.
