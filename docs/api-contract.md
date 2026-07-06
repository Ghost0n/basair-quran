# Q-Basair API Contract

This document freezes the backend contract that the future frontend migration will target.

## Stability policy

- The existing public endpoints stay available during the migration.
- `/api/search` remains the compatibility endpoint.
- `/api/search-v2` and `/api/search-result-page` remain the paginated search surface for the current UI.
- Reader endpoints remain additive and backward-compatible.
- `/api/research-agent` is additive and returns strict-context Quran research responses.
- `GET /api/research-agent/settings` is additive and exposes the active Ollama provider, available models, and plan-limit guidance for the research UI.
- `/api/auth/*` provides the identity layer (signup, login, profile, devices, guest-merge) with hybrid
  gating: reading + search stay open to guests; only the Studio/research surface requires an account.

## Canonical schema source

- Runtime OpenAPI schema: `/openapi.json`
- FastAPI app entrypoint: `src/app/factory.py`
- Typed request/response models: `src/app/models/api.py`

## Stable endpoints

- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/logout`
- `PATCH /api/auth/profile`
- `GET /api/auth/devices`
- `DELETE /api/auth/devices/{session_id}`
- `POST /api/auth/merge-guest-data`
- `POST /api/auth/merge-guest-data/undo`
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

## Saved pages

- `saved_pages` is an account preference on `GET/PATCH /api/user/preferences`: a
  list of bookmarked muṣḥaf pages, each `{ page, mushaf_id, surah?, surah_id?,
  saved_at? }`. Defaults to `[]`. It uses **wholesale-replace** semantics like
  `last_position` — the client sends the full array on every change (add/remove),
  so PATCHing `[]` clears it. Stored in the `user_preferences` JSON, so it roams
  with the account and merges from guest on sign-up. The Home screen lists them to
  reopen the reader at that page; the reader footer toggles the current page.

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
- **Hybrid gating.** When enabled, reading + search + the notebook (companions) stay **open to guests**
  (`user_id=0`); only the Studio/research surface (`GET /api/research-agent/settings`, `POST /api/research-agent`)
  is hard-gated. Open routers use *soft* auth: if a valid token is present the request resolves to that user,
  otherwise it proceeds as guest. `GET /api/health` and `/api/auth/*` are always open.
- **Gate contract.** A gated endpoint reached by a guest returns
  `401 { "detail": { "code": "auth_required", "gate": "studio", "message": "Authentication required." } }`.
  The frontend intercepts this code to open the on-demand auth prompt and resume the pending action.
- **Session model — opaque tokens, cross-platform.** Identity resolves from an opaque token presented as
  **either** an httpOnly cookie (web) **or** an `Authorization: Bearer` header (native; Bearer takes
  precedence). Each token is one row of the `sessions` table (also the devices registry); only its sha256
  hash is stored, and every authenticated request slides the 14-day expiry. Config env:
  - `QBASAIR_SESSION_SECRET` (required when auth is enabled — the app refuses to start on the dev default)
  - `QBASAIR_SESSION_COOKIE_NAME`
  - `QBASAIR_SESSION_SECURE`
- **Rate limiting.** `POST /api/auth/login`, `POST /api/auth/signup`, and `POST /api/research-agent` carry a
  per-IP sliding-window throttle (in-memory, single-process). Exhausting a window returns
  `429 { "detail": "…" }`. Tunable via `QBASAIR_RATE_LIMIT_WINDOW_SECONDS`, `QBASAIR_RATE_LIMIT_AUTH_MAX`
  (default 20), and `QBASAIR_RATE_LIMIT_RESEARCH_MAX` (default 60).
- **One-time re-login on deploy.** Switching the identity source from signed-cookie sessions to the token
  table invalidates any pre-existing signed-cookie sessions — users sign in once after this ships.
- `GET /api/auth/session` returns `{ enabled, authenticated, user }`. `user` carries `name`, `avatar`
  (a calligraphic medallion character/index — not an image URL), and `onboarded`.
- `POST /api/auth/login` accepts `email`, `password`, and optional `device_label` / `platform`; it mints a
  session and returns the raw `token` (native clients keep it; the web app uses the cookie).
- `POST /api/auth/signup` accepts `email`, `password`, optional `name`, optional `invite_code`, and optional
  `device_label` / `platform`. Duplicate email → `409` with a **static** detail (never reflects whether the
  email exists). When `QBASAIR_INVITE_CODES` (comma-separated) is set, a missing/wrong `invite_code` → `403`;
  when unset, registration stays open. Login runs a constant-time hash on unknown emails to avoid an
  enumeration timing oracle.
- `POST /api/auth/logout` revokes the current session row and clears the cookie.
- `PATCH /api/auth/profile` (auth) sets `name` / `avatar` / `onboarded` — used by the avatar picker and the
  once-per-account onboarding.
- `GET /api/auth/devices` (auth) lists active sessions with an `is_current` flag;
  `DELETE /api/auth/devices/{session_id}` (auth) ejects a device (ejecting the current row == logout).
- **Guest identity header.** Guest (`user_id=0`) writes to the notebook, sessions, roots, and preferences
  are stamped with the per-device `X-QBasair-Guest-Id` token the web app sends on every request. This scopes
  the merge to the caller's own device rows.
- `POST /api/auth/merge-guest-data` (auth) re-attributes **only the caller's own** guest (`user_id=0`) rows —
  those whose `guest_id` matches the presented `X-QBasair-Guest-Id` header — to the account (notebook,
  sessions, followed roots, optionally preferences). A missing token merges nothing (fail-safe; no
  cross-guest harvesting). Rows are **moved, never deleted**; the exact ids are journalled under an
  `undo_token`. The merge is idempotent and re-runnable (moved rows leave the guest scope), so later guest
  data stays claimable. `POST /api/auth/merge-guest-data/undo` flips those exact ids back to the guest,
  deleting nothing.
- Accounts can also be managed offline through `scripts/manage_users.py`.

## Research agent notes

- Both research endpoints accept optional per-request Ollama override headers:
  - `X-QBasair-Ollama-Key`
  - `X-QBasair-Ollama-Chat-Model`
  - `X-QBasair-Ollama-Embed-Model`
  - `X-QBasair-Ollama-Base-Url`
- The intended browser flow is session-scoped user keys supplied by the frontend. The backend should use the headers for the current request only and must not persist them.
- **`X-QBasair-Ollama-Base-Url` is treated as an untrusted client override** (SSRF closure):
  - It must be `https://` and its host must be on the allowlist (`ollama.com` by default, extendable via `QBASAIR_OLLAMA_ALLOWED_HOSTS`). Otherwise the request fails with `503` and a sanitized detail.
  - When a client supplies a base-URL override, the server's own Ollama key is **never** attached — only a client-supplied `X-QBasair-Ollama-Key` is honored for that request.
  - The server's own `QBASAIR_OLLAMA_BASE_URL` (no client override) is trusted and not subject to the allowlist.
  - Upstream provider error details reflected back to the client are collapsed and capped (≤200 chars) so a 5xx cannot become an exfiltration oracle.
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
