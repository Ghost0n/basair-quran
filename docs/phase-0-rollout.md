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

## 3. Deploy reorder + quran.db untrack + backups (T1.10)

Highest-risk group — human-supervised, never run overnight. Do the sub-steps **in this order**.

### 3a. Deploy reorder (`.github/workflows/deploy.yml`) — merge FIRST

The workflow was reordered so the image is **built before** any rebuild step (previously the
`[rebuild-db]`/`[rebuild-index]` scripts ran against a stale image), the `api` container is
restarted after a DB/index rebuild so it reopens the regenerated file, and the health gate now
polls **`/api/ready`** (DB `SELECT 1`) with a retry loop instead of `/api/health`.

**Action:** get this deploy.yml onto `main` **before** the untrack commit below. A normal deploy
with no rebuild tag is unaffected.

### 3b. Untrack `data/quran.db` — a SEPARATE commit carrying `[rebuild-db]`

`data/quran.db` is already in `.gitignore` but was still tracked (ignore does not untrack). The
untrack commit runs `git rm --cached data/quran.db` (file kept on disk). **It carries
`[rebuild-db]`** so the deploy regenerates the DB in the same run.

⚠️ **Landmine:** when this commit reaches the server, `git reset --hard origin/main` transitions
`data/quran.db` from tracked→absent and **deletes it from the server working tree** while
containers may hold it open. Mitigations, all already in place:
- 3a (deploy reorder) must be live first, so the build+rebuild ordering is correct.
- The untrack commit carries `[rebuild-db]`, so `build_db.py` regenerates the file.
- `QBASAIR_BUILD_DB_ON_START=auto` is a second safety net that rebuilds on boot if the file is
  missing.

**Action:** merge 3a, confirm a clean deploy, THEN merge the untrack commit (with `[rebuild-db]`).
Watch the deploy logs; confirm `/api/ready` returns `"db":true` afterward. Consider taking a
manual `data/*.db` copy on the host before this deploy.

### 3c. Nightly backups (`scripts/backup_databases.sh`)

Consistent SQLite `.backup` of `auth.db` + `app_data.db` (irreplaceable user data) and, best-effort,
`research_agent.db`. Retention-pruned, gzip-archived. Locally smoke-tested (the consistent-copy
path); it targets the Linux host.

**Action (one-time, on the Hetzner host):** install a cron entry, e.g.
```
15 3 * * *  /srv/q-basair/scripts/backup_databases.sh >> /var/log/qbasair-backup.log 2>&1
```
Ensure `sqlite3` is installed on the host (else it falls back to `cp`). Backups land in
`/srv/q-basair/backups` (override via `QBASAIR_BACKUP_DIR`).

