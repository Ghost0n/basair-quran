# Q-Basair — Release readiness review (2026-09-24)

**Scope:** `develop` @ `cf4d5fc` vs production `main` @ `bc0a426`.
**Goal:** the shortest safe path to a stable public version.

## 1. Where the project stands

| Area | State | Evidence |
|---|---|---|
| Backend tests | ✅ green | `PYTHONPATH=. pytest -q` → **132 passed** |
| Frontend unit tests | ✅ green | `pnpm --filter @q-basair/web test` → **17 passed** |
| Frontend build | ✅ green | clean build (`rm -rf apps/web/.next`) succeeds |
| CI on GitHub | ✅ green | last 3 `CI` runs on `develop` succeeded |
| Fresh-DB boot | ✅ works | `build_db.py` (≈47 s, 176 MB) → API boots → `/api/ready` = `"db":true`, search + reader answer 200 |
| Security backlog (review §10) | ✅ T1–T3 done | SSRF closure, guest-merge scoping, secret fail-hard, rate limits, storage caps, `/api/ready` |
| Production (`main`) | ⚠️ **stale** | last deploy 2026-05-08; `develop` carries ~100 commits of features + all security fixes |

**Bottom line:** the code on `develop` is in a releasable state. What blocks going
online is not code quality — it is **release plumbing**: `main` and `develop` do not
share history, a few production settings are not wired, and one CSP rule breaks audio.

## 2. Blockers found in this review

1. **`main` and `develop` have unrelated git histories.** `git merge-tree origin/main develop`
   → `refusing to merge unrelated histories`. A normal PR `develop → main` cannot be
   opened/merged. `develop` already contains everything `main` has (DuckDNS certbot,
   `/srv/nginx-vhosts.d`, `qbasair-nginx`, non-internal `app` network) — the only
   `main`-side differences are the older versions of the same files.
2. **Recitation audio will be blocked in production.** Audio is loaded from
   `https://everyayah.com` (`src/app/services/reciter_service.py:13`), but the CSP in
   `deploy/nginx/tls.conf.template:60` has no `media-src`, so it falls back to
   `default-src 'self'`. The media bar will silently fail behind TLS.
3. **Production settings that exist in code but cannot be set in Docker.** These env vars
   are read by the API but are **not passed through `docker-compose.yml`**:
   - `QBASAIR_INVITE_CODES` → signup is **open to anyone** in production and cannot be closed.
   - `QBASAIR_OLLAMA_ALLOWED_HOSTS` → only `ollama.com` usable (acceptable default).
   - `QBASAIR_COMMIT_SHA` → `/api/ready` reports `"commit":"unknown"`.
   - `QBASAIR_APP_DB_PATH`, `QBASAIR_MUSHAF_LAYOUT_PATH` → defaults are fine under `/app/data`.
4. **Deploy depends on two external downloads** (`scripts/fetch_mushaf_fonts.py`,
   `scripts/build_mushaf_layout.py` from GitHub). If either host is unreachable, the
   authentic Madani reader degrades. Verify once on the server; keep a copy of
   `data/mushaf_layout/` and `apps/web/public/fonts/` in the backups.
5. **`data/quran.db` untrack is a one-way step.** `develop` untracks it (commit `5b1888d`,
   `[rebuild-db]`); `main` still tracks it. The first deploy of `develop` will delete
   the file from the server working tree and must rebuild it (see step 4 below).

Non-blocking but worth knowing: password-reset tokens are only logged server-side (no
email transport yet); Google Fonts are still loaded via `@import` (privacy/offline);
ESLint not set up; 15 design-noted items remain in `docs/night-run-ledger.md`.

## 3. Simple steps to a stable online version

Do them in order. Each step is small and verifiable.

### Step 1 — Fix the two config gaps (one small PR into `develop`)
- Add `media-src 'self' https://everyayah.com;` to the CSP in `deploy/nginx/tls.conf.template`
  (and the HTTP template if it sets a CSP).
- In `docker-compose.yml` (`api.environment`) add:
  `QBASAIR_INVITE_CODES: ${QBASAIR_INVITE_CODES:-}`,
  `QBASAIR_OLLAMA_ALLOWED_HOSTS: ${QBASAIR_OLLAMA_ALLOWED_HOSTS:-}`,
  `QBASAIR_COMMIT_SHA: ${QBASAIR_COMMIT_SHA:-unknown}`.
- Add them to `.env.production.example`; in `deploy.yml` export
  `QBASAIR_COMMIT_SHA=$(git rev-parse --short HEAD)` before `docker compose up`.
- Gate: `pytest -q`, web build, `docker compose --env-file .env.production.example config`.

### Step 2 — Decide the launch mode
- **Recommended for a first public release: invite-only.** Set `QBASAIR_INVITE_CODES`
  and keep `QBASAIR_AUTH_ENABLED=1` / `NEXT_PUBLIC_AUTH_ENABLED=1`. Search and reading
  stay available to guests; the Studio (LLM) stays behind accounts.
- Keep `OLLAMA_API_KEY` empty (bring-your-own-key) unless you accept paying for all traffic.

### Step 3 — Reconcile `main` with `develop` (one-time, supervised)
Because histories are unrelated, pick one:
- **Option A (recommended): make `main` follow `develop`.** Create a merge commit on a
  release branch with `git merge --allow-unrelated-histories -X theirs develop` from
  `main`, check the diff equals `develop`'s tree (`git diff develop` → empty), open the
  PR `release/Q-Basair-<n>-... → main`. Keeps `main`'s history; future PRs are normal.
- Option B: reset `main` to `develop` and force-push. Simpler, but rewrites `main`
  history — only if nobody else depends on it.

Put `[rebuild-db]` in the final commit message that lands on `main` (see step 4).

### Step 4 — Prepare the server before the first deploy of the new `main`
On the Hetzner host (`/srv/q-basair`):
1. Back up now: `cp data/*.db` somewhere safe (auth/app data are irreplaceable).
2. In `.env.production`: set a strong `QBASAIR_SESSION_SECRET`
   (`python3 -c "import secrets; print(secrets.token_urlsafe(48))"`),
   `QBASAIR_SESSION_SECURE=1`, `QBASAIR_INVITE_CODES=...` — compose now **refuses to
   start** without the secret.
3. Make sure `sqlite3` and `python3` are installed (backup script + font fetch).

### Step 5 — Deploy and verify
- Merge the step-3 PR (with `[rebuild-db]`). Watch the `Deploy to production` run:
  fonts fetched → stack built → `quran.db` + Madani layout rebuilt → `/api/ready` → `"db":true`.
- Manual smoke test on the public URL (phone + desktop): home, search `رحمة`, root search,
  open reader page 1 (authentic Ḥafṣ), play a recitation, sign in, save to notebook,
  one Studio question with a personal Ollama key, Tafssir disclaimer visible.
- If anything is wrong: `docs/rollback-runbook.md`.

### Step 6 — Turn on the safety net (same day)
- Install the nightly backup cron (`scripts/backup_databases.sh`, see `docs/phase-0-rollout.md` §3c).
- Add an external uptime check on `https://<domain>/api/ready` (e.g. UptimeRobot, free).
- Confirm TLS renewal (`scripts/renew_tls.sh` / certbot profile) is scheduled.
- Protect `main` on GitHub: require the `CI` checks and a PR for every change.

### Step 7 — After launch (not blocking)
- Email transport for password reset (currently console only).
- Self-host fonts, then tighten CSP (drop `fonts.googleapis.com`, Yamli if unused).
- ESLint + browser smoke tests for the main flows (search → reader → Studio).
- Work down the design-noted items in `docs/night-run-ledger.md`.

## 4. How this review was verified

- `pip install -r requirements-dev.txt && PYTHONPATH=. pytest -q` → 132 passed.
- `pnpm install --frozen-lockfile && pnpm --filter @q-basair/web test` → 17 passed;
  `rm -rf apps/web/.next && pnpm --filter @q-basair/web build` → green.
- `python scripts/build_db.py` → OK; API booted on a spare port; `/api/ready`,
  `/api/search-v2?q=رحمة`, `/api/quran-page?page_number=1` → 200.
- `scripts/build_mushaf_layout.py` could not be verified here (outbound GitHub blocked in
  the review sandbox) — verify on the server during step 5.
- GitHub Actions: last `CI` runs on `develop` green; last `Deploy to production` on `main`
  green (2026-05-08).
