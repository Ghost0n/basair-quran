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
- [x] T3.4 expand/plan JSON fallbacks + `filter_ayahs_by_review` empty-set fix — done `<pending>` (pytest 124 green; garbage JSON → deterministic plan; discard-only reviews now honored)
- [x] T3.5 bound did-you-mean caches + low-memory cache-not-skip — done `4728581` (pytest 125 green; normal-mode query cache now bounded to 2048; low-memory caches populate bounded instead of skipping)
- [x] T3.6 catalog scrape off request path — done `99fa70e` (pytest 128 green; stale-while-revalidate: serves cache immediately, refreshes ollama.com catalog in a daemon thread)
- [x] T3.7 stop sending `source_path` to the LLM — done `<pending>` (pytest 120 green; removed from all 4 prompt payloads; leak test added)
- [x] T3.8 api-contract stable-list completion + `SuggestionItem` drift — done `<pending>` (web build + vitest green; dropped unused `label` from shared SuggestionItem; added catalog+companions endpoints to stable list)

## T4 — Frontend correctness/perf
- [x] T4.1 `runSearch` sequence guard + single URL writer — done `eb17361` (clean web build green; monotonic runSearchIdRef drops stale responses + guards the spinner). PARTIAL: the two URL writers (`reflectSearchUrl` set vs `resetSearch` clear) are non-competing (different ops), not a race; consolidating them risks URL-state regressions I can't verify overnight → left as a design note, not unified.
- [~] T4.2 context memoization/split + kill 120 ms poll — **design note** (see below). Downgraded: the payoff requires React-profiler verification (explicitly asked for by the plan) which this headless env can't run, and the 120 ms poll is a Yamli-IME input-sync workaround whose removal risks silent input regressions. Shipping it blind would be a badly-done item.
- [x] T4.3 font-size PATCH debounce — done `0dd4d9e` (+ type-safety follow-up; web build green; `updateAccountDebounced` = optimistic local + 400ms coalesced PATCH). NOTE: a latent TS error in the optimistic merge was masked by Next incremental type-check; caught + fixed via a clean full build.
- [x] T4.4 wire `research.default_mode`/`depth` into `createSession` — done `57259dd` (web build green; new sessions inherit the saved default mode/depth via a prefs ref)
- [x] T4.5 wire `reciter` pref into recitation-context — done `04cca60` (web build green; saved reciter pref seeds the player until the user overrides it that session)
- [x] T4.6 Studio thread auto-scroll — done `9a96da6` (clean web build green; thread scrolls to newest message on send/grow/tab-switch/pending)
- [x] T4.7 BrandMark hydration fix — done `2336e81` (clean web build + vitest green; CSS-var `themed` BrandMark follows the body theme class so the shell seal renders identical SSR/client markup; standalone screens keep the explicit `light` prop). Decision: surgical `themed` opt-in rather than a full CSS-driven rewrite of BrandMarkRich — flagged for design review.
- [x] T4.8 `rootFollowed` reset/seed + pin-state seeding — done `c24fad7` (clean web build + vitest green; concordance seeds pin markers from the notebook on mount and re-seeds rootFollowed whenever the primary root changes)
- [ ] T4.9 dead-state purge — todo
- [x] T4.10 extend error sanitization to Studio + Concordance — done `d1a3386` (clean web build + vitest green; wrapped raw `err.message` leaks in the search workspace (feeds concordance via state.errorMessage) + Studio submit with sanitize + reportError diagnostics)
- [x] T4.11 remaining timer/listener cleanups + filled icons — done `<pending>` (clean full build + vitest green; tracked handler one-shot timeouts + phrase-suggestion timer now cleared on unmount via a shared `scheduleTimeout`/cleanup effect). PARTIAL: "filled icons" is visual polish needing browser verification — left as a design note.

## T5 — UX remainder
- [ ] T5.1 Compact verse/evidence tap → setMode("reading") + back affordance — todo
- [ ] T5.2 tafssir-safety trio (copy «آلية», forced export disclaimer, default-mode confirmation) — todo
- [ ] T5.3 intent rule softening (6-word rule requires interrogative or ؟; SR-visible chip) — todo
- [ ] T5.4 evidence persistence server-side (versioned StoredMessage) — todo
- [ ] T5.5 dialog a11y (useDialog) + aria-pressed + settings segments + MoreSheet keyboard — todo
- [ ] T5.6 guest onboarding variant + skip affordance — todo
- [ ] T5.7 form chips (backend form-grouping endpoint + concordance chips) — todo
- [ ] T5.8 pinned-context handoff — [stretch], todo

## T6 — Identity completion
- [ ] T6.1 Password reset (token flow; console/manual delivery, UI wired) — todo
- [ ] T6.2 account deletion (erase user rows + sessions; confirmation modal) — todo
- [ ] T6.3 unified session probe (one context; rename refreshes rail) — todo
- [ ] T6.4 error-report URL → pathname strip — todo

## T7 — Hardening artifacts
- [ ] T7.1 compose log-rotation + resource limits — [artifact], todo
- [ ] T7.2 deploy image tagging + rollback runbook — [artifact], todo
- [ ] T7.3 Sentry-shaped error hook behind env flag (no real DSN) — todo
- [ ] T7.4 self-host Cairo/Reem Kufi/Amiri (woff2, replace @import) — todo
- [ ] T7.5 CSP (verify theme pre-paint inline script survives; nonce/hash) — todo
- [ ] T7.6 repo cleanup commit (GEMINI.md, tracked logs, quran narrations relocation) — todo
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
