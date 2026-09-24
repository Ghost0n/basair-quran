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
- `GET /api/health` is pure liveness (never touches the DB; used by the container healthcheck).
  `GET /api/ready` is the deploy gate: `{ status, db, commit, timestamp }` — runs `SELECT 1` against the
  Quran DB and reports the running commit (`QBASAIR_COMMIT_SHA`); returns `503` when the DB is unreachable.
  It is an ops endpoint with no frontend client method.

## Canonical schema source

- Runtime OpenAPI schema: `/openapi.json`
- FastAPI app entrypoint: `src/app/factory.py`
- Typed request/response models: `src/app/models/api.py`

## Stable endpoints

- `GET /api/health`
- `GET /api/ready`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/logout`
- `DELETE /api/auth/account`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `PATCH /api/auth/profile`
- `GET /api/auth/devices`
- `DELETE /api/auth/devices/{session_id}`
- `POST /api/auth/merge-guest-data`
- `POST /api/auth/merge-guest-data/undo`
- `GET /api/mushafs` — each `MushafItem` now includes a normalized `riwayah` key (matches
  `ReciterItem.riwayah`), so the UI can flag a reciter/mushaf riwāyah mismatch during recitation.
- `GET /api/surahs` — optional `mushaf` (default `1`): `ayah_count` follows that mushaf's
  numbering (e.g. al-Baqarah: Hafs 286, Qaloun 285). The web client passes the selected riwāyah.
- `GET /api/reciters`
- `GET /api/root-distribution`
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
- `GET /api/text-count`
- `GET /api/notebook` · `POST /api/notebook` · `DELETE /api/notebook/{item_id}` · `PUT /api/notebook/{item_id}/themes`
- `GET /api/documents` · `POST /api/documents` · `GET /api/documents/{id}` · `PUT /api/documents/{id}` · `GET /api/documents/{id}/audit` · `DELETE /api/documents/{id}`
- `GET /api/themes` · `POST /api/themes` · `GET /api/themes/{theme_id}` · `PATCH /api/themes/{theme_id}` · `PUT /api/themes/{theme_id}/board` · `DELETE /api/themes/{theme_id}`
- `GET /api/sessions` · `GET /api/sessions/{session_id}` · `POST /api/sessions` · `DELETE /api/sessions/{session_id}`
- `GET /api/roots` · `POST /api/roots` · `DELETE /api/roots/{root_id}`
- `GET /api/user/preferences` · `PATCH /api/user/preferences`

## Text count notes (reader «تحديد» → «إحصاء»)

- `GET /api/text-count?text=…&mushaf=2[&surah=N][&page=P]` → `TextCountResponse {text, word_count,
  phrase: {quran, surah?, page?}, letters: [{letter, in_selection, quran, surah?, page?}]}`.
  `surah` / `page` counts are `null` unless that scope is requested.
- Deterministic and rasm-based: counted on the mushaf's undiacritized text with the search
  normalization (alif forms folded to ا, lone hamza and tatweel dropped). A phrase counts as a
  whole-word sequence inside one ayah (so «رب العالمين» does not count «لرب العالمين»); `page` is the
  ayah's starting page.
- `text` is 1–300 chars and at most 12 words (`422` otherwise, or when it has no letters to count).
  Cached like search (`public, max-age=600`).

## Research documents notes

The shareable research format (design: `docs/research-workspace-spec.md` §5–6). Documents are
private; the format is fixed now so community publishing can ship without migration.

- `ResearchDocumentSave {title (1–200), summary?, language, tags[≤12], theme_ids[], sections[≤60],
  references[≤80], provenance, visibility: "private"}`; the whole document is ≤ 512 KB (`413`), and a
  user keeps at most 300 documents.
  - `sections[]`: `{id (unique), kind: text|ayahs|note|question|ai_answer, title?, body (≤ 8000, a
    markdown subset rendered as text), ayahs[≤40]: AyahRef}`.
  - `AyahRef`: `{mushaf_id, surah_id, ayah, ayah_id?, text}`.
  - `references[]`: `{kind: ayah|tafsir|book|url, label, locator?}`; an `ayah` locator is `"S:A"`.
  - `provenance`: `{mode: strict|tafssir|null, ai_sections[], created_from: studio|board|manual,
    source_id?}`.
- **Quote verification on every save.** Each `AyahRef` is checked against the Quran DB:
  - An empty `text` is filled with the mushaf text, and `ayah_id` is set.
  - A quote whose normalized rasm differs is kept as written and reported in
    `verification.issues[] {section_id, surah_id, ayah, problem: text_mismatch|not_found, expected?}`.
- `ResearchDocument` = save body + `{id, v: 1, version (incremented on each PUT), created_at,
  updated_at, verification?}` (`verification` is present on create/replace responses).
- `GET /api/documents/{id}/audit` → `DocumentAudit {publishable, checks[{rule, passed, detail?}]}`.
  These are the deterministic, blocking pre-publication checks:
  - `quotes_verified`, `has_content`, `ai_sections_labelled` (`ai_answer` sections ⇔
    `provenance.ai_sections`), `ayah_references_resolve`;
  - `tafssir_disclaimer` for tafssir documents: the summary or a section must carry the «تجريبي»
    note.

  The advisory AI audit is designed in `docs/ai-audit-agent.md`.
- Guest→account merge moves the device's documents; account deletion erases them.

## Themes (مواضيع) notes

Saving an ayah highlights it with themes — named colours that group saved ayahs by subject
(design: `docs/research-workspace-spec.md` §1–2).

- `ThemeSummary {id, name, color, description?, item_count, created_at, updated_at}`; `color` is one
  of a fixed palette: `green, blue, rose, violet, teal, sand, gold, grey` (`422` otherwise). Names are
  1–60 chars; at most 200 themes per user (`409` beyond).
- `NotebookItem.theme_ids: int[]` (additive, defaults to `[]`). `POST /api/notebook` accepts
  `theme_ids`; `PUT /api/notebook/{item_id}/themes {theme_ids}` replaces them (an empty list keeps the
  ayah saved, untagged). Ids the user doesn't own are dropped silently; duplicates collapse; max 12.
- `GET /api/themes/{id}` returns `ThemeDetail` = summary + `board` (the theme board JSON, `null` until
  saved). The list endpoint never includes boards.
- `PUT /api/themes/{id}/board {board}` stores the board as opaque JSON (≤ 256 KB, `413` beyond). Shape
  (`packages/shared` `ThemeBoard`): `{v: 1, nodes: [{id, type: ayah|note|heading, x, y, w?, h?, data}],
  edges: [{id, source, target, label?}], viewport?}`. Ayah node ids are `a-<mushaf_id>-<ayah_id>`
  (`data: {ayah_id, mushaf_id, expanded?}`); the web app reconciles them with the theme's ayahs on open
  and always fits the view (it saves `viewport: null` — viewports are per-device).
- `DELETE /api/themes/{id}` deletes the theme and its board; its ayahs stay saved without it.
- Migration: when `theme_ids` is added to an existing store, each distinct free-text `collection`
  becomes a theme (per owner, colours in palette order). `collection` is still returned for compatibility.
- Guest→account merge moves the device's themes with its notebook rows; undo moves them back; account
  deletion erases them.

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

- `mushaf_edition` is the account preference that picks **which mushaf** the reader shows. An
  edition fixes the riwāyah and how it is drawn. Version 1 offers a single edition,
  `"madani-hafs"` (the Madani mushaf: Ḥafṣ, mushaf id `2`, authentic QCF glyph pages), which is
  also the default. PATCH rejects unknown ids (422); a stored id that is no longer offered reads
  back as the default. Future standard editions are added to `MUSHAF_EDITION_IDS`
  (`src/app/models/api.py`) and `MUSHAF_EDITIONS` (`apps/web/lib/mushaf-defaults.ts`).
- `riwayah` and `mushaf_render` are **deprecated** since `mushaf_edition`: still returned and
  accepted for compatibility (defaults `2` / `"authentic"`), but the web client ignores them.
  The other riwāyāt stay in the database and API (`GET /api/mushafs`, `mushaf=` on search/reader
  endpoints, whose query default remains `1`); the web client always sends the edition's mushaf.
  A page or verse arriving in another riwāyah (e.g. a notebook item saved under Qālūn) is
  re-opened in the edition by `surah:ayah`.
- `reader_layout` is an account preference on `GET/PATCH /api/user/preferences`.
  The API keeps its five values for compatibility; the web client offers **three
  reading modes** and maps them:
  - «صفحات» (pages) ← `"single"` or `"spread"`: the printed page; the client shows
    a facing spread by itself only when two pages keep (almost) single-page size
    in the reading area (`spreadFits` in `features/reading/reader-modes.ts`).
    Choosing «صفحات» stores `"single"`.
  - «تمرير» ← `"scroll"`: continuous pages, fitted to the column width but never
    larger than the chosen text size (`font_size`).
  - «آية آية» ← `"ayah"`: one verse per row at the chosen text size.
  - `"auto"` (default) is device-smart: «تمرير» on phones and short/landscape
    screens (≤768 px wide or ≤560 px tall), «صفحات» elsewhere.
- It is a **presentation** preference consumed by the client only; no server
  reader endpoint changes shape.
- `last_position` (a `ReadingPosition`: `ayah_id`, `mushaf_id`, optional
  `surah`/`ayah`/`page`/`updated_at`) is written by the reader as you read
  (debounced) and read back on open, so the reader **resumes to the exact last
  verse** rather than the top of the last page (the verse is marked for ~2.5 s,
  then the mark clears without changing the saved position). A position saved in
  another riwāyah resumes by its `surah:ayah`; with no saved verse the client
  falls back to the local last page.

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
- It accepts an optional `mushaf` param (preferred): the server reads that mushaf's
  ayah text itself and matches it as described below, so the client never sends the
  verse in the URL (2:282 made a ~7 KB request line with `text`). The web client
  always sends `mushaf`.
- It also accepts a **deprecated** `text` param (the displayed ayah). When present, the
  verse is matched by its normalized consonant skeleton — first as a whole verse,
  then (if boundaries differ) as a **contiguous word run** in the surah's word
  stream. This is correct even for riwāyāt whose ayah **numbering** differs
  (e.g. Madani/Qalūn) *and* where a verse is **split or merged** relative to the
  Kufan source (the run is re-indexed to the displayed word positions). Without
  `text`, it falls back to the `(surah, ayah)` number — correct only for
  Kufan-numbered riwāyāt (Hafs). Clients should send `mushaf` for non-Hafs reading.
- `position` is the 1-based word index within the verse; word counts are stable
  across riwāyāt, so the displayed word index aligns once the verse is matched.

## HTTP caching

- Read-only Quran endpoints (a pure function of `quran.db`) send
  `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`:
  `/api/quran-page`, `/api/mushaf-page-layout`, `/api/ayah-reader`,
  `/api/ayah-reader-more`, `/api/morphology`, `/api/surahs`, `/api/mushafs`,
  `/api/reciters`, `/api/root-distribution`.
- Search endpoints (`/api/search`, `/api/search-v2`, `/api/search-result-page`,
  `/api/suggest`) send `public, max-age=600, stale-while-revalidate=3600`.
- Only successful `GET`s are marked; per-user surfaces (auth, preferences,
  notebook, sessions, followed roots, research) are never cached. Policy lives in
  `src/app/core/http_cache.py`.
- The web server serves `/fonts/*` (versioned glyph fonts) with
  `public, max-age=31536000, immutable`; nginx gzips JSON/CSS/JS.

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
- `POST /api/auth/forgot-password` `{ email }` always returns `{ ok: true }` (no account enumeration).
  When the account exists it mints a single-use, 1-hour reset token and **emails** it (Arabic message with
  a link `${QBASAIR_PUBLIC_URL}/login?reset=<token>` that opens the reset step pre-filled, plus the raw
  code) when `QBASAIR_SMTP_HOST` is configured; otherwise the token is only logged server-side for manual
  delivery. Delivery errors are logged, never surfaced. Rate-limited (auth bucket).
- `POST /api/auth/reset-password` `{ token, password }` consumes the token, sets the new password, and
  **revokes all sessions**. `400` on invalid/expired/used token, `422` on a weak password. Rate-limited.
- `DELETE /api/auth/account` (auth) permanently deletes the account: all app data (notebook, sessions,
  followed roots, preferences, merge log), then the user row and **every** session (all devices), and clears
  the cookie. Returns `{ deleted }`. Irreversible; guest (`user_id=0`) data is never touched.
- `PATCH /api/auth/profile` (auth) sets `name` / `avatar` / `onboarded` — used by the avatar picker and the
  once-per-account onboarding.
- `GET /api/auth/devices` (auth) lists active sessions with an `is_current` flag;
  `DELETE /api/auth/devices/{session_id}` (auth) ejects a device (ejecting the current row == logout).
- **Guest identity header.** Guest (`user_id=0`) writes to the notebook, sessions, roots, and preferences
  are stamped with the per-device `X-QBasair-Guest-Id` token the web app sends on every request. This scopes
  the merge to the caller's own device rows.
- `POST /api/auth/merge-guest-data` (auth) re-attributes **only the caller's own** guest (`user_id=0`) rows —
  those whose `guest_id` matches the presented `X-QBasair-Guest-Id` header — to the account (notebook,
  themes, sessions, followed roots, optionally preferences). A missing token merges nothing (fail-safe; no
  cross-guest harvesting). Rows are **moved, never deleted**; the exact ids are journalled under an
  `undo_token`. The merge is idempotent and re-runnable (moved rows leave the guest scope), so later guest
  data stays claimable. `POST /api/auth/merge-guest-data/undo` flips those exact ids back to the guest,
  deleting nothing.
- Accounts can also be managed offline through `scripts/manage_users.py`.
- **Storage caps.** `POST /api/sessions` (`ResearchSessionSave`) bounds `messages` to at most
  `500` entries and `512 KB` serialized; oversized payloads are rejected with `422` (guests reach this
  endpoint, so the cap protects the shared `app_data.db`).
- **Persisted messages** use the versioned `StoredMessage` shape (`{ v?, role, content, response? }`).
  Assistant messages carry their full research `response`, so restoring a saved session rebuilds its
  evidence cards; legacy rows without `response` restore as plain text. The backend stores `messages` as
  opaque JSON (`List[Dict[str, Any]]`) — the shape is a frontend contract, bounded by the caps above.

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
- **Contextual Tafssir.** In `response_mode="tafssir"` every ayah sent to the final stage
  carries its context from the Quran DB: `context.surah` (name, Meccan/Medinan type, ayah
  count), `context.position`, and `context.before` / `context.after` — neighbouring ayahs of
  the same surah (±1 fast, ±2 balanced, ±3 deep; ±5 for the focus ayah; each clipped to 600
  chars). The system prompt requires reading each ayah with its neighbours and the whole
  surah's themes before interpreting, and saying when context changes the reading.
  Neighbours are context only: kept ayahs still come from the evidence list. Strict mode is
  unchanged.
- **Focus ayah (additive).** `ResearchAgentRequest.focus = {surah, ayah}` (optional, read in
  the request's `mushaf`) centres the research on one ayah: its reference and DB text are
  appended to the latest user message for every stage, it leads the evidence list, it is
  always kept after review, the answer is never turned into a clarifying question, and a
  search with no hits still answers from it. An unknown ayah returns `422`. Works in both
  modes (in strict mode it is Quran evidence like any other ayah).
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
