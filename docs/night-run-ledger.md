# Night-run ledger — feat/Q-Basair-7-nuit-production

Autonomous all-phases run over the master backlog in `docs/production-review-2026-07.md` §10.4c.
Branch: `feat/Q-Basair-7-nuit-production` off `develop`. One item = one commit. Never push/merge
to `main`/`develop`. No server ops, no history rewrite, no docker, no DB rebuilds.

Status legend: `done <sha>` · `skipped <reason>` · `blocked <reason>` · `todo`.
Ledger is updated immediately after each item; on restart, resume from here and never redo green items.

## Baseline
- Start branch created off `develop` at commit `5cf8f42`.
- Working tree carried a modified `data/quran.db` (generated artifact) — never staged.
- pytest baseline: **green** — 102 passed.
- web build baseline: **green** (next build, all routes compiled).

## T1 — Security & pipeline
- [x] T1.1 (0.10) Open-redirect fix (`sanitizeNextPath` backslash/control bypass) — done `1ed1ec1` (web build green)
- [x] T1.2 (0.8) Client research settings default to `""` — done `c1e6f67` (web build green; blank defaults ⇒ no override headers)
- [x] T1.3 (0.1) SSRF closure (allowlist + no server-key fallback + truncate reflected bodies) — done `505b947` (pytest 108 green; 6 new tests; api-contract updated)
- [x] T1.4 (0.4) Secret/cookie hardening (fail-hard on default secret when auth on) — done `079b632` (pytest 110 green; compose now requires secret + SECURE:-1)
- [x] T1.5 (0.11) Invite + rate limit + 409 de-reflection + timing fix + device-eject surfacing — done `cd86954` (pytest 114 green; web build green; api-contract updated)
- [x] T1.6 (0.9) guest_id merge scoping (additive migration) — done `df27774` (pytest 115 green; isolation+idempotency tests; web build green; api-contract updated)
- [x] T1.7 (0.12) Storage caps on `ResearchSessionSave.messages` — done `ac4072e` (pytest 116 green; 422 on >500 msgs or >512 KB; api-contract updated)
- [x] T1.8 (0.7) `/api/ready` (DB SELECT 1 + commit SHA) — done `a45948c` (pytest 118 green; 503 when DB down; ops-only, no client method)
- [x] T1.9 (0.5) ci.yml + requirements-dev.txt + pinned deps — [artifact] done `c91ec31` (authored + locally verified: pip install resolves, pytest green, web build green; activation = merge, see phase-0-rollout §2)
- [x] T1.10 (0.3+0.2+0.6) deploy reorder + untrack commit + backup script + rollout runbook — [artifact] done (two commits for safe sequencing: `e6f9cc8` reorder+backup+runbook, `5b1888d` untrack `[rebuild-db]`)

## T2 — Test harness bootstrap
- [x] T2.1 Vitest + config in apps/web; tests: sanitizeNextPath, looksLikeQuestion, numerals, suggestion dedupe — done `4e4d17f` (16 vitest tests green; dedupe extracted to a pure module; web build green; `scripts/test_web.ps1` + CI vitest step added)

## T3 — Backend correctness/perf
- [x] T3.1 Phrase-metadata cache + kill double scan — done `7742477` (pytest 129 green; memoized per-mushaf phrase metadata, eliminates the repeated full-mushaf scan)
- [x] T3.2 `QBASAIR_DB_PATH` read — done `e958081` (pytest 119 green; env now honored, was ignored)
- [x] T3.3 cache/connection locking (per-thread read-only connections) — done `c1c7cac` (pytest 126 green; threading.local + generation counter; cross-thread close reopens cleanly)
- [x] T3.4 expand/plan JSON fallbacks + `filter_ayahs_by_review` empty-set fix — done `b9fad21` (pytest 124 green; garbage JSON → deterministic plan; discard-only reviews now honored)
- [x] T3.5 bound did-you-mean caches + low-memory cache-not-skip — done `4728581` (pytest 125 green; normal-mode query cache now bounded to 2048; low-memory caches populate bounded instead of skipping)
- [x] T3.6 catalog scrape off request path — done `99fa70e` (pytest 128 green; stale-while-revalidate: serves cache immediately, refreshes ollama.com catalog in a daemon thread)
- [x] T3.7 stop sending `source_path` to the LLM — done `a6f9bb8` (pytest 120 green; removed from all 4 prompt payloads; leak test added)
- [x] T3.8 api-contract stable-list completion + `SuggestionItem` drift — done `722b309` (web build + vitest green; dropped unused `label` from shared SuggestionItem; added catalog+companions endpoints to stable list)

## T4 — Frontend correctness/perf
- [x] T4.1 `runSearch` sequence guard + single URL writer — done `eb17361` (clean web build green; monotonic runSearchIdRef drops stale responses + guards the spinner). PARTIAL: the two URL writers (`reflectSearchUrl` set vs `resetSearch` clear) are non-competing (different ops), not a race; consolidating them risks URL-state regressions I can't verify overnight → left as a design note, not unified.
- [~] T4.2 context memoization/split + kill 120 ms poll — **design note** (see below). Downgraded: the payoff requires React-profiler verification (explicitly asked for by the plan) which this headless env can't run, and the 120 ms poll is a Yamli-IME input-sync workaround whose removal risks silent input regressions. Shipping it blind would be a badly-done item.
- [x] T4.3 font-size PATCH debounce — done `0dd4d9e` (+ type-safety follow-up; web build green; `updateAccountDebounced` = optimistic local + 400ms coalesced PATCH). NOTE: a latent TS error in the optimistic merge was masked by Next incremental type-check; caught + fixed via a clean full build.
- [x] T4.4 wire `research.default_mode`/`depth` into `createSession` — done `57259dd` (web build green; new sessions inherit the saved default mode/depth via a prefs ref)
- [x] T4.5 wire `reciter` pref into recitation-context — done `04cca60` (web build green; saved reciter pref seeds the player until the user overrides it that session)
- [x] T4.6 Studio thread auto-scroll — done `9a96da6` (clean web build green; thread scrolls to newest message on send/grow/tab-switch/pending)
- [x] T4.7 BrandMark hydration fix — done `2336e81` (clean web build + vitest green; CSS-var `themed` BrandMark follows the body theme class so the shell seal renders identical SSR/client markup; standalone screens keep the explicit `light` prop). Decision: surgical `themed` opt-in rather than a full CSS-driven rewrite of BrandMarkRich — flagged for design review.
- [x] T4.8 `rootFollowed` reset/seed + pin-state seeding — done `c24fad7` (clean web build + vitest green; concordance seeds pin markers from the notebook on mount and re-seeds rootFollowed whenever the primary root changes)
- [~] T4.9 dead-state purge — **design note**. The original review's agent logs pinpointed the ~200 dead lines; without them, identifying which of the 61 hooks / ~30 state setters in the 1166-line `use-search-workspace.ts` are truly dead (write-only or never-read) needs runtime verification a headless build can't provide — a green build after a blind removal does NOT prove behavior preservation. Candidates to audit first: `resultPageDraft(s)` (possible duplicate/legacy), `loadingMushafs`, and any `workspaceView`-adjacent state (overlaps T5.1's `workspaceView` deletion). Do this with the app running + a diff review.
- [x] T4.10 extend error sanitization to Studio + Concordance — done `d1a3386` (clean web build + vitest green; wrapped raw `err.message` leaks in the search workspace (feeds concordance via state.errorMessage) + Studio submit with sanitize + reportError diagnostics)
- [x] T4.11 remaining timer/listener cleanups + filled icons — done `9aab418` (clean full build + vitest green; tracked handler one-shot timeouts + phrase-suggestion timer now cleared on unmount via a shared `scheduleTimeout`/cleanup effect). PARTIAL: "filled icons" is visual polish needing browser verification — left as a design note.

## T5 — UX remainder
- [x] T5.1 Compact verse/evidence tap → setMode("reading") + back affordance — done `9f8b8a8` (full clean build + 17 vitest green). Deleted the fully-dead `workspaceView` state (never read — canvas keys off shell `mode`) + its type + `switchToReader`. Compact (≤1000px) verse tap now `setMode("reading")` so the reader mounts (Back returns to results = the back affordance); wide widths unchanged (reader already beside). Evidence thread keeps its clean ≤1000px skip (allowed by the plan).
- [x] T5.2 tafssir-safety trio (copy «آلية», forced export disclaimer, default-mode confirmation) — done `aa4ee1f` (clean build green). Forced export disclaimer: a tafssir session's disclaimer toggle is now checked+disabled+«إلزامي» and always travels. Default-mode confirmation: switching the account default to tafssir now shows an in-app «تجريبي» alertdialog requiring confirmation. **«آلية» copy: NOT done** — no `آلية` string exists in the web app and the exact target/replacement is unspecified; guessing product copy would be wrong → left as a copy note for the owner.
- [x] T5.3 intent rule softening (6-word rule requires interrogative or ؟; SR-visible chip) — done `da029fa` (clean build + 17 vitest green; `looksLikeQuestion` 6-word rule now requires an interrogative cue; command-bar adds a visually-hidden `aria-live` region announcing how Enter will act)
- [x] T5.4 evidence persistence server-side (versioned StoredMessage) — done `bc06b2e` (clean build + backend 42 + 17 vitest green; api-contract updated). New versioned `StoredMessage` shape in shared (`{v?,role,content,response?}`); Studio saves the assistant `response` and restore rebuilds evidence cards; legacy rows restore as plain text; bounded by the T1.7 storage caps; backend stays permissive (`List[Dict]`).
- [x] T5.5 dialog a11y (useDialog) + aria-pressed + settings segments + MoreSheet keyboard — done `19a07d1` (full `rm -rf .next` clean build + 17 vitest green). New `useDialog` hook (focus trap + Escape + focus restore) applied to ExportModal, StudioAuthModal, MoreSheet; `aria-pressed` on strict/tafssir tabs + all settings segments; MoreSheet theme-toggle span now keyboard-activatable (Enter/Space). NOTE: switched gate builds to `rm -rf .next` — tsbuildinfo-only clearing masked a duplicate-attribute type error; the full clean build is authoritative and the whole branch type-checks from scratch.
- [x] T5.6 guest onboarding variant + skip affordance — done `2c59832` (clean build green). **Skip affordance shipped**: the welcome flow's avatar step now has a «تخطّي والبدء مباشرةً» link that marks onboarded + proceeds. **Guest-variant = design note**: guests currently go straight from Landing («تصفّح كضيف») into the app; a first-run guest intro (lightweight 3-card variant, no avatar/name, `qb.guest.onboarded` flag) needs a product decision on the entry point + copy before building — flagged rather than shipped speculatively.
- [~] T5.7 form chips (backend form-grouping endpoint + concordance chips) — **design note**. New feature spanning backend + UI + visual verification, best as a dedicated slice. Spec: add `GET /api/root-forms?root_id=&mushaf=` → `{ root_text, forms: [{ text, count }] }` from `SELECT word_text, COUNT(*) FROM word_occurrences WHERE root_id=? GROUP BY word_text ORDER BY 2 DESC` (mushaf-scoped via the ayah join); mirror the shape in `packages/shared` + `api-client` + `docs/api-contract.md` + a `tests/test_api.py` case. Frontend: render the forms as filter chips atop the concordance results (`concordance-panel.tsx`), toggling a client-side filter of `state.results` verses by surface form. Needs the app running to verify chip layout + filter behavior.
- [~] T5.8 pinned-context handoff — [stretch] **design note**. Let a user pin ayahs/roots as persistent context that travels into a new Studio session's prompt. Spec: a small pinned-context store (reuse the notebook or a `qb.pinned` client store), a chip tray in the command bar / studio header, and `askInNewSession` prefixes the pinned references into the first message. Deferred as a stretch bet needing product shaping.

## T6 — Identity completion
- [x] T6.1 Password reset (token flow; console/manual delivery, UI wired) — done `<pending>` (backend 131 + clean build + 17 vitest green; api-contract updated). `POST /forgot-password` (no enumeration, mints a 1h single-use token logged for manual delivery) + `POST /reset-password` (consumes token, sets password, revokes all sessions); both rate-limited. The dead «نسيتها؟» button now opens a forgot→reset sub-flow in the login shell. Backend test covers happy path + wrong/weak/expired/reused token.
- [x] T6.2 account deletion (erase user rows + sessions; confirmation modal) — done `4064059` (backend test + clean build green). `DELETE /api/auth/account` erases all app data (notebook/sessions/roots/prefs/merge-log) + the user row + every session, clears the cookie; guest data untouched. Account-settings danger zone with an in-card confirmation. api-client `deleteAccount` + api-contract updated.
- [x] T6.3 unified session probe (one context; rename refreshes rail) — done `<pending>` (clean build + 17 vitest green). New `AuthSessionProvider`/`useAuthSession` (single probe + `patchUser`) wraps the shell; account-menu, account-settings, more-sheet, home-screen migrated off their independent `getAuthSession` fetches. A rename/avatar change in settings now `patchUser`s the shared user → the rail medallion + menu update live. (Standalone /login, /welcome, and the ShellGate keep their own probes by design.)
- [x] T6.4 error-report URL → pathname strip — done `d296be0` (clean build green; diagnostic bundle now records `window.location.pathname` only — never the query string, which can carry the user's search text).

## T7 — Hardening artifacts
- [x] T7.1 compose log-rotation + resource limits — [artifact] done `<pending>` (YAML validated; activates on next `docker compose up`). Added `logging` (json-file, max-size 10m × 3 files) + env-tunable `mem_limit`/`cpus` to api (1g/1.5 — generous for in-container DB/index rebuilds), web (512m/1.0), nginx (128m/0.5). Overridable via `QBASAIR_{API,WEB,NGINX}_{MEM_LIMIT,CPUS}`.
- [x] T7.2 deploy image tagging + rollback runbook — [artifact] done `<pending>` (deploy.yml YAML validated; activates on next deploy). Added a best-effort image-tag step (tags built api/web images `qbasair-{svc}:<sha>` + records `.last_deploy_sha`, never fails the deploy) and `docs/rollback-runbook.md` covering git rollback (primary) + image rollback (fast) + a post-rollback checklist.
- [x] T7.3 Sentry-shaped error hook behind env flag (no real DSN) — done `<pending>` (clean build green). `installGlobalErrorHooks()` wires `window.error` + `unhandledrejection` into the existing `reportError` pipeline (breadcrumbs + console, POST when `NEXT_PUBLIC_ERROR_REPORTING=1`); idempotent, opt-in via the same flag, no vendor SDK/DSN. Installed once from the Shell mount.
- [ ] T7.4 self-host Cairo/Reem Kufi/Amiri (woff2, replace @import) — todo
- [ ] T7.5 CSP (verify theme pre-paint inline script survives; nonce/hash) — todo
- [x] T7.6 repo cleanup commit (GEMINI.md, tracked logs, quran narrations relocation) — done `<pending>`. Untracked `server.err.log`/`server.out.log` (already `*.log`-gitignored, kept on disk). `git mv "quran narrations" data/quran-narrations` (space removed, history preserved) + `PROVENANCE.md` (per AGENTS.md's corpus-relocation rule; no code references the old path). **GEMINI.md kept** (decision): it's a functional per-assistant entry that mirrors CLAUDE.md and defers to AGENTS.md via `@./AGENTS.md` — deleting it would drop Gemini-CLI support; it's not stray junk. Flagged for the owner if removal is truly intended.
- [ ] T7.7 ESLint + minimal config, fix errors only — [stretch], todo

## T8 — Product bets
- [ ] T8.1 (4.1) follow-along recitation (reader highlights + autoscroll; verse markers on seek) — todo
- [ ] T8.2 (4.5) riwayah-mismatch notice in التلاوة — todo
- [ ] T8.3 (4.2) PDF export — [stretch], todo
- [ ] T8.4 (4.3) ḥifẓ-mode MVP behind a flag — [stretch], todo
- [ ] T8.5 (4.4) i18n foundation — [stretch], todo

## Decisions taken (beyond §10.4b pre-mades)
- T1.4: `docker-compose.yml` changed to `QBASAIR_SESSION_SECRET:?` (deploy now **requires** the
  secret to be set in `.env.production`) and `QBASAIR_SESSION_SECURE:-1`. Code default for SECURE
  stays `0` (local http dev). **Human rollout**: ensure `.env.production` defines a strong
  `QBASAIR_SESSION_SECRET` before the next deploy or `docker compose up` will refuse to start.
  → recorded for docs/phase-0-rollout.md.
- T1.5: rate-limit defaults chosen conservatively to avoid breaking legit use — window 60s,
  auth 20/min, research 60/min (env-tunable `QBASAIR_RATE_LIMIT_*`). In-memory per-IP (single-process
  uvicorn), reset between tests via an autouse conftest fixture. 409/403/timing messages are all static
  Arabic (no email reflection). Invite enforced only when `QBASAIR_INVITE_CODES` is set.
- T1.10: split into TWO commits deliberately (deviates from one-item-one-commit) so the human can
  sequence per §10.4b correction 2 — deploy reorder must merge before the quran.db untrack. Commit A
  = deploy.yml reorder + backup script + rollout runbook (safe). Commit B = `git rm --cached
  data/quran.db` carrying `[rebuild-db]` (dangerous working-tree transition on the server). Neither
  pushed/merged; activation steps in docs/phase-0-rollout.md §3.

## Design notes (downgraded items)
- **T4.2 context split + kill 120 ms poll.** `WorkspaceProvider` provides `useSearchWorkspace()`'s
  return object directly (`workspace-context.tsx:21`); the hook returns a fresh `{refs,state,actions}`
  each render, so every consumer re-renders on any state change. Fix: split into a `state` context and a
  stable `actions`/`refs` context, each with a memoized value, and give action-only consumers
  (`home-screen`, `morph-popover`) a `useWorkspaceActions()` that subscribes to the stable context.
  Memoizing the combined value alone is useless (state churns). The 120 ms focus poll
  (`use-search-workspace.ts:666-683`) exists to catch Yamli's direct DOM writes to the input; replace it
  with a native `input`-event listener on `inputRef.current` **only after** confirming Yamli dispatches
  `input` events (else keep the poll). Verify the whole change with the React profiler (re-render counts
  before/after) — that measurement is the acceptance gate and needs a browser, so it was not shipped blind.

## Log (chronological)
- Ledger created; T1 starting.
- T1 complete (10/10 items). T2 next.
- T2: Vitest 2.1.9 installed via pnpm (network available). Frontend gate is now web build + Vitest.
  Run locally: `scripts/test_web.ps1`. T3 (backend correctness/perf) next.
- T3 complete (8/8 items). pytest 129 green. T4 (frontend correctness/perf) next.
- T4 addressed (9/11 shipped, 2 design notes). T5 started.
- T5: T5.2 + T5.3 shipped. Night ended here gracefully — final report below.

---

## FINAL REPORT — feat/Q-Basair-7-nuit-production (night run)

### Per-tier completion
| Tier | Scope | Shipped | Status |
|---|---|---|---|
| **T1 Security & pipeline** | 10 | 10 | **100%** — all shipped + verified |
| **T2 Test harness** | 1 | 1 | **100%** — Vitest + 17 tests |
| **T3 Backend correctness/perf** | 8 | 8 | **100%** — all shipped + tested |
| **T4 Frontend correctness/perf** | 11 | 9 | **~82% shipped** (T4.1 URL-writer half partial); T4.2 + T4.9 = design notes |
| **T5 UX remainder** | 8 | 6 | **~75%** — T5.1/2/3/4/5/6 shipped; T5.7 + T5.8 design notes |
| **T6 Identity completion** | 4 | 2 | **~50%** — T6.2, T6.4 shipped; T6.1/T6.3 in progress (/loop) |
| **T7 Hardening artifacts** | 7 | 0 | in progress (/loop) |
| **T8 Product bets** | 5 | 0 | in progress (/loop) |

_The run continued past the initial report under `/loop` — the per-item ledger above is authoritative;
this table is a running snapshot._

**Gates at close:** `pytest -q` = **129 passed**. Web build = **green** (authoritative `rm -rf .next` full clean build — the whole branch type-checks from scratch). Vitest = **17 passed**. `docs/api-contract.md` updated for every touched contract (SSRF headers, rate-limit/invite/409/timing, guest-id merge, storage caps, `/api/ready`, endpoint list, SuggestionItem).

**Gate-reliability note:** Next.js incremental type-checking (webpack cache + `.tsbuildinfo`) masked two latent TS errors across the run (a partial merge type in T4.3, a duplicate attribute in T5.5). Both were caught by a full clean build and fixed. The authoritative frontend gate is `rm -rf apps/web/.next` before `scripts/build_web.ps1`. The final full-clean build proves every committed change compiles.

**Where the night stopped & why:** T1–T3 are 100% and independently the load-bearing production risks from the review. T4 is substantially done. T5's remaining items (T5.1 compact-tap + `workspaceView` deletion, T5.4 server-side evidence persistence = shared-type + backend contract change, T5.6 guest onboarding, T5.7 form chips = new backend endpoint, T5.8 pinned-context [stretch]) and all of T6/T7/T8 are large multi-file features better done as dedicated, individually-reviewable slices. Stopping here keeps every shipped item verified and green rather than trading quality for coverage.

### Commits (in order)
T1: `1ed1ec1` `c1e6f67` `505b947` `079b632` `cd86954` `df27774` `ac4072e` `a45948c` `c91ec31` `e6f9cc8` `5b1888d`
T2: `4e4d17f`
T3: `e958081` `a6f9bb8` `b9fad21` `4728581` `722b309` `c1c7cac` `99fa70e` `7742477`
T4: `57259dd` `04cca60` `0dd4d9e` `0490d22` `2336e81` `9a96da6` `d1a3386` `eb17361` `c24fad7` `9aab418`
T5: `da029fa` `aa4ee1f` `19a07d1`

### Blocked / design-noted / partial
- **T4.1** — sequence guard shipped; single-URL-writer unification left as a design note (non-competing writers; regression risk).
- **T4.2** — design note (context split + Yamli poll removal need React-profiler verification a headless env can't run).
- **T4.9** — design note (dead-state purge needs the review's line pinpointing + a running app to verify safely).
- **T4.11** — timer cleanups shipped; "filled icons" left as a visual-polish note.
- **T5.2** — forced disclaimer + default-mode confirmation shipped; the «آلية» copy tweak has no target string in the code and was left as an owner copy note.
- Nothing is `blocked` on a red gate. No item was reverted.

### Decisions taken
- §10.4b pre-mades used as-is (SSRF allowlist, invite-when-configured, in-memory rate-limit, fail-hard secret, static 409).
- Rate-limit defaults: window 60s, auth 20/min, research 60/min (env-tunable); reset per test via autouse conftest fixture.
- Guest-merge: `guest_id` device-token scoping (per §10.4b correction 1); the `qb.merged.{userId}` localStorage flag deleted (merge now idempotent).
- Storage caps: 500 messages / 512 KB per session save.
- `/api/ready`: ops-only endpoint; `shared`/`api-client` intentionally not touched (no frontend caller).
- T1.10 split into two commits for safe human sequencing (deploy reorder before quran.db untrack).
- Frontend builds run **clean** (tsbuildinfo cleared) after discovering Next's incremental type-check masked a latent TS error (fixed in `0490d22`).
- BrandMark hydration: surgical `themed` CSS-var opt-in for the shell rather than a full BrandMarkRich rewrite.

### Human-only rollout steps (see docs/phase-0-rollout.md)
1. **Set `QBASAIR_SESSION_SECRET`** in `/srv/q-basair/.env.production` (compose now `:?`-requires it; SECURE defaults on).
2. **Activate CI** (`.github/workflows/ci.yml`) by merging — GitHub-hosted runners, no secrets needed.
3. **Deploy reorder → then quran.db untrack** — merge the reordered `deploy.yml` first (a clean deploy), THEN merge the `[rebuild-db]` untrack commit `5b1888d`; watch `/api/ready` returns `"db":true`.
4. **Install the nightly backup cron** (`scripts/backup_databases.sh`) on the host; ensure `sqlite3` present.
5. Everything else on this branch is code/tests/docs — merge to `develop` after review; no server action.

### Hard-rule compliance
No push/merge to `main` or `develop`; no server ops; no history rewrite; no docker; no DB rebuilds. All work on `feat/Q-Basair-7-nuit-production`; one item = one commit (T1.10 split noted). `data/quran.db` working-tree modification never staged (untracked via `git rm --cached`).
