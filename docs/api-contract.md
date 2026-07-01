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
- `GET /api/mushaf-page-layout`
- `GET /api/morphology`

## Authentic Madani layout notes

- `GET /api/mushaf-page-layout?page=N` returns the line-by-line QCF glyph layout
  for the printed Madani page. It is **Hafs-only** and **additive** — it does not
  change `/api/quran-page`. For non-Hafs riwāyāt, or a DB built without
  `scripts/build_mushaf_layout.py`, it returns `{ "found": false, "fallback": "reader" }`
  (never a 500); the client then renders the Unicode reader.
- Each line carries `line_type` (`ayah` | `surah_name` | `basmalah`), `is_centered`,
  and for ayah/basmalah lines the QCF glyph(s). Each ayah-line word carries `glyph`,
  `word_key` (`surah:ayah:word_position`), `ayah_id`, and `text`.
- `word_position` matches `ayah_words.word_position` (the text-split tokenization the
  Unicode reader also uses), guaranteed by a build-time alignment in
  `build_mushaf_layout.py`. The printed mushaf's "disconnected words" (e.g. `لَّوْ مَا`,
  `بَعْدَ مَا`) are reconciled there.
- Glyph strings are **trusted, server-generated** private-use codepoints, rendered
  via `dangerouslySetInnerHTML` with the page font; they are never user input.
- Per line, `font_family` is `qcf-p{page}` for ayah lines and `qcf-bsml` for the
  basmala line; the frontend loads `${font_base_path}/p{page}.woff2` and
  `${font_base_path}/bsml.woff2` on demand via the FontFace API.
- The page WOFF2 fonts are **QPC V1** static assets under `font_base_path`
  (`/fonts/qpc-hafs-v1`), fetched at deploy by `scripts/fetch_mushaf_fonts.py`
  — not served by the API. (V1 because only V1 ships as redistributable WOFF2;
  see `docs/authentic-mushaf-reader.md`.)
- The authentic renderer is gated on the `mushaf_render: "authentic" | "simple"`
  account preference (default `"simple"`). When `"authentic"` and the current
  riwāyah is Hafs and the layout/fonts load, the client renders the glyph page;
  otherwise it renders the Unicode reader. Non-Hafs always degrades gracefully
  via `fallback: "reader"`.

## Reader layout notes

- `reader_layout` is an account preference on `GET/PATCH /api/user/preferences`,
  **orthogonal** to `mushaf_render`. It selects how pages/ayahs are arranged, not
  which renderer draws them: `"auto"` (default, resolved per viewport), `"single"`
  (one fit-to-height page), `"spread"` (two facing pages, authentic/Hafs only —
  degrades to `single` otherwise), `"scroll"` (continuous vertical scroll of pages,
  fit-to-width), `"ayah"` (ayah-by-ayah list).
- It is a **presentation** preference consumed by the client only; no server
  reader endpoint changes shape. Unknown/off-Hafs combinations degrade gracefully
  on the client (e.g. `spread` → `single`).

## Morphology notes

- `GET /api/morphology?surah=N&ayah=M` returns per-word morphology (root, lemma,
  POS, case, features) sourced from the Quranic Arabic Corpus, which is
  **Kufan/Hafs-numbered**.
- It accepts an optional `text` param (the displayed ayah). When present, the
  verse is matched by its normalized consonant skeleton — first as a whole verse,
  then (if boundaries differ) as a **contiguous word run** in the surah's word
  stream. This is correct even for riwāyāt whose ayah **numbering** differs
  (e.g. Madani/Qalūn) *and* where a verse is **split or merged** relative to the
  Kufan source (the run is re-indexed to the displayed word positions). Without
  `text`, it falls back to the `(surah, ayah)` number — correct only for
  Kufan-numbered riwāyāt (Hafs). Clients should send `text` for non-Hafs reading.
- `position` is the 1-based word index within the verse; word counts are stable
  across riwāyāt, so the displayed word index aligns once the verse is matched.

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
