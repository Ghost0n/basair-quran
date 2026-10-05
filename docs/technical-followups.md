# Technical Follow-ups

This document captures recommended improvements that were found during the cleanup, performance, and security audit pass. They are intentionally left for later implementation so the current migration foundation stays focused.

## High Priority

- Precompute phrase-search metadata instead of building it lazily from ayah text on first use. A dedicated phrase/ngram index, either in SQLite or as a generated artifact, should make cold multi-word searches and no-result "did you mean" checks consistently fast.
- Replace the shared global SQLite connection with a request-scoped, thread-local, or small pooled read-only connection manager. The current runtime connection is now read-only/query-only, but a single `check_same_thread=False` connection is still not ideal for future concurrent deployments.
- Add request cancellation to the web API client. Suggestion, search, result-page, and reader calls should accept an `AbortSignal` so stale requests are cancelled instead of only ignored by sequence guards.

## Medium Priority

- Add startup cache warming for common mushaf metadata, page bounds, and suggestion indexes. This can reduce the first interaction cost while keeping the UI responsive.
- Move fuzzy "did you mean" scoring into a bounded indexed search path. Current memoization makes repeated misses fast, but the first miss can still scan many candidates.
- Add lightweight backend timing tests or benchmarks for suggestions, phrase hits, and phrase misses. This will make future performance regressions visible before manual testing.
- Keep dependency audits in the release checklist. `pnpm audit --prod` should stay clean, and Python dependencies should be pinned before a production deployment.

## Security And Deployment

- Keep CORS origin configuration environment-driven for public deployments. `QBASAIR_CORS_ORIGINS` should be set explicitly outside local development.
- Self-hosting fonts: done for the interface faces (Cairo, Amiri: `apps/web/public/fonts/ui/`); the Noto faces for non-Latin scripts (`lib/script-fonts.ts`) still come from Google Fonts on first use. Still to do: isolate external transliteration dependencies before publishing publicly. This reduces privacy exposure and improves offline/mobile readiness.
- Add a basic Content Security Policy once external dependencies are finalized.
- Treat `data/quran.db` as a generated artifact in the long term. Either rebuild it during release or distribute it outside source control to avoid accidental binary diffs.

## Product And UX

- Revisit compound-search performance before expanding grammar filters. Grammar-aware search will likely need indexed morphology tables rather than additional runtime scans.
- Add a dedicated advanced-search model before exposing grammatical filters. It should separate user-visible query intent from low-level token/root/morphology matching.
- Add browser-level smoke tests for the main researcher flows: Latin input suggestions, exact/root switching, phrase search, result paging, and reader page navigation.
