# Q-Basair API Contract

This document freezes the backend contract that the future frontend migration will target.

## Stability policy

- The existing public endpoints stay available during the migration.
- `/api/search` remains the compatibility endpoint.
- `/api/search-v2` and `/api/search-result-page` remain the paginated search surface for the current UI.
- Reader endpoints remain additive and backward-compatible.
- `/api/research-agent` is additive and returns strict-context Quran research responses.
- `GET /api/research-agent/settings` is additive and exposes the active Ollama provider, available models, and plan-limit guidance for the research UI.
- `/api/auth/*` provides the identity layer (signup, login, profile, devices, guest-merge). Everything is
  open to guests (reading, search, the Studio, the AI connections); only writing to the Community
  (publish, comment, like, save, report, appeal) requires an account. An account decides where the
  reader's data is kept (our server), not what they can use.
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
- `GET /api/auth/linked-accounts` (Keycloak mode)
- `POST /api/auth/linked-accounts/{alias}/unlink` (Keycloak mode)
- `GET /api/auth/oidc/link/{alias}` (Keycloak mode, a browser navigation)
- `POST /api/auth/merge-guest-data`
- `POST /api/auth/merge-guest-data/undo`
- `GET /api/mushafs` — each `MushafItem` now includes a normalized `riwayah` key (matches
  `ReciterItem.riwayah`), so the UI can flag a reciter/mushaf riwāyah mismatch during recitation.
- `GET /api/surahs` — optional `mushaf` (default `1`): `ayah_count` follows that mushaf's
  numbering (e.g. al-Baqarah: Hafs 286, Qaloun 285). The web client passes the selected riwāyah.
- `GET /api/reciters` — every reciter (`ReciterItem`): `audio_base` (verse-by-verse files;
  empty for a reciter heard only from prepared surahs), `surahs` (the surahs prepared as one
  recording) and `attribution` (their sources) — `docs/recitation-audio.md`.
- `GET /api/recitations/{reciter_id}/{surah}` → `SurahRecitation` `{reciter_id, surah, audio_url,
  duration_ms, bytes, attribution, verses: [{ayah, start_ms, end_ms}]}` — a prepared surah as one
  recording and each verse's place in it; `404` when it isn't prepared (recite it verse by verse).
  `Cache-Control: public, max-age=86400`.
- `GET /api/recitations/audio/{reciter_id}/{SSS}.mp3?v={version}` — the prepared recording, with
  byte ranges (`206`, `416`), `immutable` for a year, `Cross-Origin-Resource-Policy: cross-origin`.
  Served by nginx as a static file in production; by the API elsewhere.
- `GET /api/reciters/{reciter_id}/durations/{surah}` → `ReciterDurations`
  `{reciter_id, surah, durations: (number|null)[], complete}` — every verse's audio
  duration (seconds) for the recitation bar's whole-surah progress. **Shared server
  cache:** each reciter's surah is measured once on the server (the first 16 KB of
  each MP3: ID3 size + frame header, Xing/VBRI frame count for VBR, bytes × 8 /
  bitrate for CBR — `src/app/services/audio_duration.py`) and stored in
  `data/cache.db` (`QBASAIR_CACHE_DB_PATH`), then served to every user. A request
  never waits on the network: an incomplete surah returns what is known (`null`
  for the rest, `complete: false`, `no-store`) and starts one background job per
  reciter+surah; the client asks again every 2.5 s. A complete surah is sent with
  `Cache-Control: public, max-age=31536000, immutable`. Only the catalogue's
  audio host (`everyayah.com`, HTTPS) is ever fetched. `404` unknown reciter,
  `422` surah outside 1–114. The web client falls back to reading durations
  itself only when this route can't be reached (offline / standalone app).
- `GET /api/root-distribution`
- `GET /api/suggest`
- `POST /api/suggest-batch`
- `GET /api/search`
- `GET /api/search-v2`
- `GET /api/search-result-page`
  - Both take an optional `surah` (1–114): only that surah's verses are returned, and each card's
    `total_occurrences`, `total_verses`, `total_surahs` and `total_pages` then describe that surah.
    A card whose root or word has no verse there is left out; nothing found gives `found: false`
    without a spelling suggestion. Out-of-range values are rejected (422). The concordance's surah
    ribbon uses it; the on-device engine (`packages/offline-engine`) answers it the same way.
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
- `POST /api/documents/{id}/publish` · `GET /api/community/feed` · `GET /api/community/tags` · `GET /api/community/mine` · `GET|DELETE /api/community/posts/{id}` · `POST|DELETE /api/community/posts/{id}/like` · `PUT|DELETE /api/community/posts/{id}/save` · `GET|POST /api/community/posts/{id}/comments` · `DELETE /api/community/comments/{id}` · `POST /api/community/reports` · `GET /api/community/me/standing` · `GET|POST /api/community/appeals`
- `GET /api/moderation/queue` · `POST /api/moderation/posts/{id}/decision` · `POST /api/moderation/comments/{id}/decision` · `POST /api/moderation/appeals/{id}/decision` · `GET /api/moderation/users?kind=suspicious|banned` · `POST /api/moderation/users/{id}/ban` · `POST /api/moderation/users/{id}/unban` · `GET /api/moderation/actions` · `GET|POST /api/moderation/team` · `GET /api/moderation/health` · `POST /api/moderation/run` · `GET /api/moderation/feedback` · `PATCH /api/moderation/feedback/{id}`
- `POST /api/feedback` · `GET /api/feedback/mine`
- `GET /api/themes` · `POST /api/themes` · `GET /api/themes/{theme_id}` · `PATCH /api/themes/{theme_id}` · `PUT /api/themes/{theme_id}/board` · `DELETE /api/themes/{theme_id}`
- `GET /api/sessions` · `GET /api/sessions/{session_id}` · `POST /api/sessions` · `DELETE /api/sessions/{session_id}`
- `GET /api/roots` · `POST /api/roots` · `DELETE /api/roots/{root_id}`
- `GET /api/user/preferences` · `PATCH /api/user/preferences`
- `GET /api/offline/{name}` — the standalone app's downloadable packs (see below)

## Standalone app notes

- The Android app answers the Quran routes (catalog, search, suggestions, reader, layout, count,
  morphology, translations) and the user-data routes (notebook, themes, documents, sessions, roots,
  preferences) **on the device**, with `packages/offline-engine`, and must return the same JSON as
  this API. A change to any of those routes or to their models is ported there too; the parity suite
  (`docs/offline-engine.md`) fails otherwise.
- `GET /api/offline/{name}` serves the files of `scripts/build_offline_packs.py`
  (`QBASAIR_OFFLINE_PACKS_PATH`, default `build/offline/`): `manifest.json` (`Cache-Control:
  no-cache`), `narration-<id>.db`, `translation-<slug>.db`, `interface-<code>.json`
  (`public, max-age=86400`). Other names are `404`. Open without sign-in.
- The app calls the server from its own origin (`https://localhost` on Android,
  `capacitor://localhost` on iOS): add both to `QBASAIR_CORS_ORIGINS`. It authenticates with `Authorization: Bearer <token>` (the `token` of
  `AuthSessionResponse`), never cookies.

## Text count notes (reader «تحديد» → «إحصاء»)

- `GET /api/text-count?text=…&mushaf=2[&surah=N][&page=P]` → `TextCountResponse {text, word_count,
  phrase: {quran, surah?, page?}, letters: [{letter, in_selection, quran, surah?, page?}]}`.
  `surah` / `page` counts are `null` unless that scope is requested.
- Deterministic and rasm-based: counted on the mushaf's undiacritized text with the search
  normalization (alif forms folded to ا, lone hamza and tatweel dropped, Qālūn/Warsh «ے» read as ي
  and a yā' with a separate hamza mark as ئ). A phrase counts as a
  whole-word sequence inside one ayah (so «رب العالمين» does not count «لرب العالمين»); `page` is the
  ayah's starting page (the first page of a boundary range such as `"85-86"`).
- `text` is 1–300 chars and at most 12 words (`422` otherwise, or when it has no letters to count).
  Cached like search (`public, max-age=600`).

## Research documents notes

The shareable research format (design: `docs/research-workspace-spec.md` §5–6). Documents are
private to their author; sharing happens by publishing a snapshot to the community (see Community notes).

- `ResearchDocumentSave {title (1–200), summary?, language, tags[≤12], theme_ids[], sections[≤60],
  references[≤80], provenance, visibility: "private"}`; the whole document is ≤ 512 KB (`413`), and a
  user keeps at most 300 documents.
  - `sections[]`: `{id (unique), kind: text|ayahs|note|question|ai_answer, title?, body (≤ 8000, a
    markdown subset rendered as text), ayahs[≤40]: AyahRef}`.
  - `AyahRef`: `{mushaf_id, surah_id, ayah, ayah_id?, text}`.
  - `references[]`: `{kind: ayah|tafsir|book|url, label, locator?}`; an `ayah` locator is `"S:A"`.
  - `provenance`: `{mode: strict|tafssir|null, ai_sections[], created_from: studio|board|manual,
    source_id?}`. For `board`, `source_id` is `"<theme id>:<board id>"` (a bare `"<theme id>"` from
    older exports means that theme's first board); the post snapshot copies that board.
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

## Translations of meanings

Details in `docs/quran-translations.md`.

- `GET /api/translations` returns `TranslationInfo[]`:
  `{key, language, kind: translation|transliteration, name, translator, description, source:
  quranenc|tanzil, source_url, terms, version, direction: ltr|rtl, ayah_count}`. It is `[]` when
  `data/translations.db` has not been built.
- `GET /api/translations/ayahs?keys&refs` returns `{translations: TranslationMeta[], ayahs:
  [{surah, ayah, texts: [{key, text, footnotes?}]}]}`.
  - At most 3 keys, and unknown keys are dropped. Refs look like `2:255` or `2:1-7`,
    comma-separated, with at most 400 ayahs; otherwise `422`.
  - Texts are verbatim and use Ḥafṣ numbering.
- `UserPreferences.translations: string[]` holds up to 3 keys, in display order (`422` for more).

## Community notes

Publishing and the community (guidelines: `docs/community-guidelines.md`; moderation:
`docs/community-moderation-design.md`).

- **Access.** Reading the feed and published posts is open to guests. Publish, like, comment, report
  and appeal need an account when auth is enabled (`401 {code: "auth_required", gate: "community"}`).
  `/api/moderation/*` needs a moderator or an admin (`403`); the team, the full action log and
  `POST /api/moderation/run` need an admin. With auth disabled the local user is both.
  `AuthUserInfo.is_moderator` marks an appointed moderator.
- **Publish** `POST /api/documents/{id}/publish {visibility: public|unlisted, accept_guidelines}`.
  - `accept_guidelines: false` returns `422`; a banned author gets
    `403 {code: "banned", message, banned_until, reason}`.
  - The server runs the deterministic audit at once. If it fails, the response is
    `{status: "blocked", audit}` and no post is created.
  - Otherwise the post is **queued**: `PublishResult {status: "queued", post_id, audit}`. No agent
    runs in the request.
  - Republishing a document whose post is published keeps the published version up and queues the new
    one as a candidate (`PostSummary.review_state`, `PostDetail.candidate`); it replaces the published
    snapshot only once it passes. Republishing an unpublished post replaces it and re-queues it.
- **The batches** (`moderation_service.run_batch`, every `QBASAIR_MODERATION_INTERVAL_SECONDS`, 900 by
  default; reported items between batches) check queued posts, unchecked comments and reported items
  with the agent in the **author's interface language**, under `QBASAIR_MODERATION_DAILY_BUDGET` agent
  calls per UTC day.
  - The agent answers `{verdict: valid|unsure|declined, confidence, issues[{target, rule, severity,
    quote, explanation, suggestion}]}`. An issue whose quote isn't in the cited text is dropped. The
    verdict is never laxer than the issues (high → declined, medium → unsure). A confidence under
    `QBASAIR_MODERATION_MIN_CONFIDENCE` (0.7) is `unsure`. A provider error or invalid output is
    `unsure` (it **fails closed**).
  - A **verified** author's valid post is published. Every other outcome sends the post to a person:
    an unverified author's valid post (`first_post`), `unsure`, `declined`. An agent decline also
    makes the author unverified again (it is not a strike).
- **Trust** `GET /api/community/me/standing` → `AuthorStanding {level: unverified|verified,
  upheld_declines, suspicious, banned, banned_until (-1 = permanent), ban_reason, is_staff}`. Every
  account starts unverified. A moderator approving one of its posts verifies it. Staff publish as
  verified.
- **Posts are snapshots** of a document version. A document exported from a theme board also
  carries a read-only board copy with the ayahs' mushaf text (`PostDetail.board`).
- **Visibility.** `unlisted` posts are reachable by link only. Queued, pending, changes-requested and
  removed posts are visible only to their author and to moderators. `reviews[]` lists the checks
  (`stage: deterministic|agent|human`, `verdict`, `confidence`, `issues`, `language`, `note`) for them
  only. A post that three different people reported (or that the agent declines after a report) is
  `hidden` from readers until a moderator decides (`404` for others, out of the feed).
- **Feed** `GET /api/community/feed?cursor&limit≤50&sort&q&surah&tag&mode&board&author&saved` returns
  published public posts.
  - `sort=latest` (default): newest first, keyset pagination (`next_cursor`).
  - `sort=top` («الأبرز»): the 500 most recent matches ranked by
    `(likes + 2·comments + 1) / (age_hours + 2)^1.4`, offset pagination (the cursor is opaque either way).
    The ranked ids are cached per filter set for 60 s (and dropped on any publish, like, comment,
    moderation or withdrawal), so paging walks one stable ranking.
  - `q` (≤120 chars): every word must appear in the title, summary, tags or section text; matching
    ignores diacritics and folds أ/إ/آ/ٱ→ا, ى→ي, ة→ه.
  - `surah` (1–114): posts quoting an ayah of that surah. `tag`: a whole tag (a leading `#` is
    ignored). `mode=strict|tafssir`. `board=true`: posts that carry a theme board. `author`: a user id
    (`PostSummary.author_id`).
  - `saved=true`: the viewer's bookmarks (`401` for a guest when auth is enabled).
- `PostSummary` also carries `author_id`, `tags[]` (≤8, `#`/`|` stripped), `surah_ids[]`,
  `reading_minutes` (≈180 words a minute, at least 1) and `saved_by_me`.
- **Tags** `GET /api/community/tags?limit≤50` returns `[{tag, count}]`, the most used tags across the
  1,000 most recent public posts.
- **Saved posts** `PUT|DELETE /api/community/posts/{id}/save` → `{saved}`: a private, idempotent
  bookmark on a published post (`404` otherwise). There is no public save count.
- **Comments** are 1–2000 chars with at most 2 links (`422` otherwise). A verified author's comment is
  `visible` at once and checked afterwards; a failing check hides it. An unverified author's comment
  is `pending` until its check: it is shown to its author only, and a failing check keeps it hidden
  for a person. To others a hidden comment comes back as `{status: "hidden", body: "", author_name: ""}`
  («تعليق مخفي»). Its author deletes it (`DELETE /api/community/comments/{id}`); moderators decide
  through the queue. Likes are idempotent per user.
- **Reports** `{target_type: post|comment, target_id, rule, note?}`. One's own content can't be reported
  (`422`). Duplicate open reports from the same user collapse into one. A report queues the item for a
  person and has the agent re-check it.
- **Moderation** (staff):
  - `GET /api/moderation/queue` → `{items[{item_type, item_id, reason: first_post|unsure|declined|reported,
    checks, reports, post|comment, author: AuthorStanding, is_mine}], appeals[]}`, oldest first.
  - `POST /api/moderation/posts/{id}/decision` and `/comments/{id}/decision` take
    `{decision: approve|decline|remove|restore, note}`. `decline` and `remove` need a `note` (`422`),
    which the author reads.
  - A decline or removal a moderator takes is a strike (`upheld_declines`); three make the author
    suspicious. Nobody decides on their own content (`403`).
  - Bans: `POST /api/moderation/users/{id}/ban {days: 7|30|null, reason}`, where `null` is permanent
    (admins only); `.../unban`. A ban stops posting and commenting only.
  - Appeals: `POST /api/community/appeals {target_type: post|comment|ban, target_id, message}`, once
    per decision (`409`). Another moderator than the one who decided rules on it with
    `POST /api/moderation/appeals/{id}/decision {outcome: uphold|overturn}`. Overturning restores the
    item and removes the strike, or lifts the ban.
  - `GET /api/moderation/users?kind=suspicious|banned`, `GET /api/moderation/actions[?mine=true]`,
    `GET|POST /api/moderation/team {email, role: moderator|user}` (admins), `GET /api/moderation/health`
    (backlog, last batch, today's checks against the budget, where the worker runs),
    `POST /api/moderation/run` (admins: a batch now).
  - Every check is journalled in `moderation_checks` with the item version, every human action in
    `moderation_actions`.
- **Rate limit.** Publish, comment and report share the `community` bucket
  (`QBASAIR_RATE_LIMIT_COMMUNITY_MAX`, default 30 per window per IP).
- **Account deletion** removes the user's posts, likes, saves, comments, reports, trust standing,
  appeals and feedback, and refreshes counts (the action log keeps the actions, without the user).

## Feedback centre notes

`docs/feedback-centre.md`.

- `POST /api/feedback {kind: contact|bug|help|feature|error, message, email?, detail?, url?, language?}`
  (a `contact` message is also emailed to `QBASAIR_CONTACT_EMAIL`, default `contact@basairquran.com`,
  when SMTP is configured; `docs/feedback-centre.md`)
  → `FeedbackItem`. It is open to guests and rate-limited per IP (`QBASAIR_RATE_LIMIT_FEEDBACK_MAX`,
  default 10). Every kind needs a message except `error`. An `error` report needs its diagnostic
  `detail` (≤32 KB, `413` beyond). A guest's message (any kind but `error`) needs an `email`, which
  is checked without being written to (`src/app/services/email_check.py`); a refused address is
  `422 {detail: {code, message}}` with `code` one of `email_required`, `email_invalid` (syntax),
  `email_domain` (a reserved domain, or one that takes no mail: no MX nor address, or a null MX)
  and `email_disposable` (a throwaway inbox). A DNS lookup that can't decide lets the address through.
- `GET /api/feedback/mine` → what the signed-in sender wrote (not their diagnostic reports), with its
  status.
- Staff: `GET /api/moderation/feedback?status&kind&before` → `{items, next_before, counts}` (newest
  first, 50 a page, with the sender, email, detail, page, user agent).
  `PATCH /api/moderation/feedback/{id} {status: new|in_progress|resolved|closed, staff_note,
  assigned_to}`.

## Themes (مواضيع) notes

Saving an ayah highlights it with themes — named colours that group saved ayahs by subject
(design: `docs/research-workspace-spec.md` §1–2).

- `ThemeSummary {id, name, color, description?, item_count, created_at, updated_at}`; `color` is one
  of a fixed palette: `green, blue, rose, violet, teal, sand, gold, grey` (`422` otherwise). Names are
  1–60 chars; at most 200 themes per user (`409` beyond).
- `NotebookItem.theme_ids: int[]` (additive, defaults to `[]`). `POST /api/notebook` accepts
  `theme_ids`; `PUT /api/notebook/{item_id}/themes {theme_ids}` replaces them (an empty list keeps the
  ayah saved, untagged). Ids the user doesn't own are dropped silently; duplicates collapse; max 12.
- `GET /api/themes/{id}` returns `ThemeDetail` = summary + `board` (the theme's boards JSON, `null` until
  one is created). The list endpoint never includes boards.
- `PUT /api/themes/{id}/board {board}` stores the boards as opaque JSON (≤ 256 KB for all of a theme's
  boards, `413` beyond). A theme holds **several named boards, or none** — boards are created on
  purpose. Shape (`packages/shared` `ThemeBoardSet`): `{v: 2, boards: [{id, name, created_at, updated_at,
  board: ThemeBoard}]}`. A legacy value (one `ThemeBoard`, `v: 1`) reads as a set of one board with id
  `b-1`, and is rewritten as `v: 2` on the next save.
- `ThemeBoard`: `{v: 1, nodes: [{id, type: ayah|note|heading|shape, x, y, w?, h?, data}], edges: [{id,
  source, target, label?}], viewport?, hidden?}`. Ayah node ids are `a-<mushaf_id>-<ayah_id>`
  (`data: {ayah_id, mushaf_id, expanded?}`); any node may carry `data.style` (text colour, fill, border,
  size, font); shapes carry `data.shape: rect|ellipse|diamond`. `hidden` lists ayah node ids taken off the
  board (they stay in the theme; their edges are kept). The web app reconciles ayah nodes with the
  theme's ayahs on open (skipping hidden ones; a newly themed ayah appears) and always fits the view
  (it saves `viewport: null` — viewports are per-device).
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
- `numerals` is an account preference on `GET/PATCH /api/user/preferences`:
  `"auto"` (default — the digits of the interface language on screen),
  `"arabic-indic"`, `"latin"` or `"persian"`. Preferences stored before `"auto"`
  existed read their `"arabic-indic"` (the old default, saved with every
  change) as `"auto"` until they are saved again; other scripts are kept
  (docs/i18n.md).
- `reader_layout` is an account preference on `GET/PATCH /api/user/preferences`.
  The API keeps its five values for compatibility; the web client offers **two
  reading modes** and maps them:
  - «صفحات» (pages) ← `"single"` or `"spread"`: the printed page; the client shows
    a facing spread by itself only when two pages keep (almost) single-page size
    in the reading area (`spreadFits` in `features/reading/reader-modes.ts`).
    Choosing «صفحات» stores `"single"`.
  - «آية آية» ← `"ayah"`: one verse per row at the chosen text size.
  - `"auto"` (default) reads as «صفحات» on every device (phones turn pages by
    swipe). `"scroll"` — the retired continuous mode — is still accepted and also
    reads as «صفحات».
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

## Home sections

- `home_hidden` is an account preference on `GET/PATCH /api/user/preferences`:
  the Home sections the reader hid in Settings («الرئيسية»), from `greeting`,
  `verse`, `continue`, `recent_pages`, `recent_searches`. Defaults to `[]`
  (everything shown); unknown ids are rejected (422). `search`, `index`, `saved`,
  `study` and `community` (Home's old search field and shortcuts to screens the
  navigation bar opens) are no longer shown but still accepted, so a stored list
  stays valid. Wholesale-replace semantics like `saved_pages`. Sections are
  listed as hidden so that a section added later shows by default.

## Recents

- `recent_pages` and `recent_searches` are account preferences on
  `GET/PATCH /api/user/preferences`, newest first, at most 10 each (11+ is a 422),
  wholesale-replace semantics like `saved_pages` (`[]` clears them).
  - `recent_pages`: `{ page (1–1000), mushaf_id, surah?, at }` — the last places
    read. The client counts consecutive page turns (±2 pages, a spread turns two)
    as one place, moved to the page reached; a jump starts a new place, and one
    page is listed once.
  - `recent_searches`: `{ query (1–200 chars), mode: "exact" | "root", at }` —
    the last searches that found results; the same words in the same mode
    (spacing and diacritics aside) are listed once.
  - `at` is Unix seconds. The web keeps a device copy (`qb.recents`) written on
    every change without re-rendering the app, saves it quietly (debounced), and
    adopts the account's copy when it holds an entry newer than the device's last
    change (so a list cleared on this device doesn't come back). A guest's
    preferences, recents included, are kept on their device (see «A guest's own
    data is not on the server»). Home shows them
    (the place «تابع القراءة» already offers isn't repeated); Settings
    «الرئيسية» hides either list and clears both.

## Reading progress («تابع القراءة»)

- `reading_progress` is an account preference on `GET/PATCH /api/user/preferences`:
  `{ series: ReadingSeries[] (≤ 12), reset_at: int | null }`, default
  `{ series: [], reset_at: null }`, wholesale-replace semantics.
  `ReadingSeries` is `{ id, mushaf_id, start, end, turns, surah?, surah_id?,
  updated_at }` (pages 1–1000; `end` is the page it reached last).
- A series is an unbroken run of page turns in the reader (±2 pages, a spread
  turns two). The web client (`lib/reading-progress.ts`) records them:
  - a page opened any other way (search, saved page, index…) is not a turn;
    turning on from it starts a new series — unless it is where a series
    stopped, which then goes on;
  - «تابع القراءة» on Home opens the **last page of the longest series** (most
    turns, the latest on a tie), and the turns that follow are added to that
    series;
  - a series reaching the mushaf's last page (in a spread, the pair that shows
    it) completes the reading: every series is cleared and `reset_at` stamped,
    so «تابع القراءة» starts again from Al-Fatiha;
  - Settings «الرئيسية» resets it the same way (a second tap confirms);
  - at most 12 series are kept: the shortest, then the oldest, go first.
- Before the first series (and never reset), Home falls back to
  `last_position`. The device keeps a working copy (`qb.reading.progress`),
  written on every turn without re-rendering the app, saved quietly, and
  replaced by the account's when that changed after the device's last change.
  A guest keeps it on their device, like the rest of their preferences.

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
- `/api/community/tags` (the same for everyone) sends
  `public, max-age=60, stale-while-revalidate=300`.
- Only successful `GET`s are marked; per-user surfaces (auth, preferences,
  notebook, sessions, followed roots, research, the community feed) are never
  cached. Policy lives in `src/app/core/http_cache.py`.
- In production, nginx keeps **one shared copy** of every response marked this
  way (edge cache with request collapsing and stale serving; `X-Cache-Status`
  header) — see `docs/caching.md` for the layers, rules and audit.
- The web server serves `/fonts/*` (versioned glyph fonts) with
  `public, max-age=31536000, immutable`; nginx gzips JSON/CSS/JS.

## Authentication notes

- **Keycloak** (`QBASAIR_AUTH_PROVIDER=keycloak`, `docs/keycloak.md`): `GET /api/auth/session` also
  answers `provider: "keycloak"`, `login_url`, `signup_url` (append `return_to`, `locale`) and
  `account_url` (Keycloak's account console); `GET /api/auth/oidc/login` and
  `GET /api/auth/oidc/callback` run the code flow with PKCE and open the session cookie;
  `POST /api/auth/logout` also answers `logout_url` (visit it to end Keycloak's session); Bearer
  tokens may be Keycloak access tokens (audience `qbasair-api`); the password routes (`login`,
  `signup`, `forgot-password`, `reset-password`) answer `409 {code: "use_identity_provider"}`.
  `AuthSessionResponse.provider` is `"local"` otherwise.
- **Linked sign-in providers** (Keycloak mode; `404` with local accounts; auth required):
  - `GET /api/auth/linked-accounts` → `LinkedAccountsResponse { providers: LinkedProvider[], has_password }`:
    the realm's enabled providers (Apple, Google, Meta, in that order) as `{ alias, name, linked, username }`
    (`username`: the provider's account name, when linked), and whether the account has a password.
    `503` when Keycloak cannot be reached.
  - `GET /api/auth/oidc/link/{alias}?return_to=&locale=` (a page load) asks Keycloak to link that provider
    to the signed-in account (`kc_action=idp_link:<alias>`, `login_hint` = the account's email): Keycloak
    confirms, sends the reader to the provider, then back through `/api/auth/oidc/callback`, which leaves
    the session as it was and returns to `return_to` with `linked=<alias>` or
    `link_error=cancelled|in_use|other_account|failed` (`other_account`: Keycloak was signed in to another
    account). Signed out → `/login?next=<return_to>`. A provider account already linked to another
    account stops on Keycloak's own error page.
  - `POST /api/auth/linked-accounts/{alias}/unlink` `UnlinkProviderRequest { password? }` →
    `LinkedAccountsResponse`. An account **without a password** must send `password`, set as its password
    (Keycloak's policy: 10+ characters, not the email) **before** the link goes, so it can still sign in:
    missing → `422 {code: "password_required"}`, refused by the policy → `422 {code: "password_rejected",
    reason}` (the link stays). Not linked → `404`.

- Authentication is controlled by `QBASAIR_AUTH_ENABLED`.
- **Open by default.** When enabled, every router is **open to guests** with *soft* auth: if a valid
  token is present the request resolves to that user, otherwise it proceeds as guest. This includes the
  Studio (`GET /api/research-agent/settings`, `POST /api/research-agent` — stateless) and `/api/ai/*`.
  `GET /api/health` and `/api/auth/*` are always open.
- **A guest's own data is not on the server.** With accounts on, the account data routes (`/api/notebook`,
  `/api/themes`, `/api/documents`, `/api/sessions`, `/api/roots`, `/api/user/preferences`) answer only a
  signed-in reader; a guest gets
  `401 { "detail": { "code": "auth_required", "gate": "account", "message": "Authentication required." } }`.
  There is no shared guest record (`user_id 0` would be every guest's data at once). Guests keep that data
  on their own device: the web answers those routes in the browser (`apps/web/lib/guest-data.ts`: the
  offline engine's `LocalStore`, in IndexedDB; quoted ayahs in documents are checked against
  `GET /api/quran-page`), the installed app in its device store (docs/offline-app.md). Signing in uploads it
  to the account (the app's account sync, `syncAccount`) and empties the browser store; the account's
  preferences stay the account's. With accounts off (single user), `user_id 0` is that user.
- **The one gate: Community writes.** Publishing, commenting, liking, saving a post, reporting and
  appealing check the resolved user in their routes; a guest gets
  `401 { "detail": { "code": "auth_required", "gate": "community", "message": "Authentication required." } }`
  (the UI shows a sign-in prompt instead of the action). Moderation needs a moderator (`gate: "moderation"`).
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
  (the medallion's look, `p<pattern>t<tone>` — not an image URL; `null` or an older value means the look given from the account id, `apps/web/lib/avatar.ts`), and `onboarded`.
- `POST /api/auth/login` accepts `email`, `password`, and optional `device_label` / `platform`; it mints a
  session and returns the raw `token` (native clients keep it; the web app uses the cookie).
- `POST /api/auth/signup` accepts `email`, `password`, optional `name`, optional `invite_code`, and optional
  `device_label` / `platform`. Duplicate email → `409` with a **static** detail (never reflects whether the
  email exists). When `QBASAIR_INVITE_CODES` (comma-separated) is set, a missing/wrong `invite_code` → `403`;
  when unset, registration stays open. Login runs a constant-time hash on unknown emails to avoid an
  enumeration timing oracle.
- `POST /api/auth/logout` revokes the current session row and clears the cookie.
  The web then forgets what the account left in the browser (study sessions, cached
  preferences, recents, reading progress; `apps/web/lib/forget-account.ts`),
  keeping the device's own choices (language, theme, and the AI connection: the reader's
  provider keys stay on this device across sign-out and sign-in).
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
- `PATCH /api/auth/profile` (auth) sets `name` / `avatar` / `onboarded` — used by Settings (name, the
  medallion's pattern and colour) and the once-per-account onboarding (`onboarded` only: a new
  account chooses nothing there).
- `GET /api/auth/devices` (auth) lists active sessions with an `is_current` flag;
  `DELETE /api/auth/devices/{session_id}` (auth) ejects a device (ejecting the current row == logout).
- **Guest identity header.** Guest (`user_id=0`) rows written before guests kept their data on their device
  are stamped with the per-device `X-QBasair-Guest-Id` token the web app still sends on every request. This
  scopes the merge to the caller's own device rows (new guest data never reaches the server).
- `POST /api/auth/merge-guest-data` (auth) re-attributes **only the caller's own** guest (`user_id=0`) rows —
  those whose `guest_id` matches the presented `X-QBasair-Guest-Id` header — to the account (notebook,
  themes, sessions, followed roots, optionally preferences). A missing token merges nothing (fail-safe; no
  cross-guest harvesting). Rows are **moved, never deleted**; the exact ids are journalled under an
  `undo_token`. The merge is idempotent and re-runnable (moved rows leave the guest scope), so later guest
  data stays claimable. `POST /api/auth/merge-guest-data/undo` flips those exact ids back to the guest,
  deleting nothing.
- Accounts can also be managed offline through `scripts/manage_users.py`.
- **Storage caps.** `POST /api/sessions` (`ResearchSessionSave`) bounds `messages` to at most
  `500` entries and `512 KB` serialized; oversized payloads are rejected with `422` (the browser and app
  stores apply the same cap).
- **Persisted messages** use the versioned `StoredMessage` shape (`{ v?, role, content, response? }`).
  Assistant messages carry their full research `response`, so restoring a saved session rebuilds its
  evidence cards; legacy rows without `response` restore as plain text. The backend stores `messages` as
  opaque JSON (`List[Dict[str, Any]]`) — the shape is a frontend contract, bounded by the caps above.

## Research agent notes

- **A reader's own AI provider** (`docs/ai-connections.md`): `X-QBasair-LLM-Provider`
  (`openrouter` · `openai` · `anthropic` · `gemini` · `mistral` · `deepseek` · `groq` · `xai` ·
  `ollama`), `X-QBasair-LLM-Key` (the reader's key; required), `X-QBasair-LLM-Model`. The
  provider's address is fixed on the server (never sent); an unknown provider or a missing key
  answers `503`. `ResearchProviderInfo.provider` names it. When present, it replaces the
  `X-QBasair-Ollama-*` headers below.
- `X-QBasair-LLM-Thinking` (optional, with a provider): `off` · `low` · `medium` · `high`, how much
  the model thinks before answering. The web no longer sends it (each model's default); it is
  kept for older clients. Only the levels the provider lists in
  `AiProviderItem.thinking` are sent on; anything else means the model's own default. A model that
  refuses the thinking fields is asked again without them.
- `GET /api/ai/providers` → `AiProviderItem[]` `{id, name, key_url, signin, prefer, thinking}`
  (`thinking`: the levels it takes; empty for Mistral and DeepSeek, whose models decide).
- `POST /api/ai/openrouter/key` `{code, code_verifier}` → `{key}` (OpenRouter's PKCE sign-in;
  `422` on a malformed verifier, `502` when OpenRouter refuses).
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
- **Quran only.** The agent reads nothing but the Quran. Search terms come from the
  conversation and the Quran's own vocabulary (roots and words from `quran.db`); no book,
  transcript, tafsir or other corpus is retrieved or sent to the model. The final answer is
  written only from the ayahs Quran search returned; its prompt (`QURAN_ONLY_ANSWER_RULES`)
  forbids tafsir, hadith, scholars' opinions, rulings and outside knowledge, asks for each
  ayah to be cited by surah and number, and for the answer to say when the ayahs do not
  answer the question. The answer is short and points to the ayahs (they are shown beside it,
  so it names them by reference instead of copying them out; Markdown, often a short list),
  and ends with one follow-up question that would narrow the search when the question is
  vague or the ayahs only touch it from afar.
- **Answer language.** `answer_language` (`"auto"` by default: detected from the question —
  Arabic, French, else English) names the language of the answer and of any clarifying
  question, e.g. `"english"`, `"urdu"`; the model writes in it whatever language the question
  is in. The web sends the reader's «لغة الجواب» (Settings → AI; the interface language
  unless another is chosen, `apps/web/lib/answer-language.ts`). The fixed fallback texts (no
  ayah found, a generic clarifying question) exist in Arabic, French and English; other
  languages get the English one.
- **Ayahs read in their passage.** Every ayah sent to the final stage carries its context
  from the Quran DB: `context.surah` (name, Meccan/Medinan type, ayah count),
  `context.position`, and `context.before` / `context.after`, the neighbouring ayahs of the
  same surah (±1; ±5 for the focus ayah; each clipped to 600 chars). Neighbours are context
  only: kept ayahs still come from the evidence list.
- **No interpretive mode.** `response_mode` and `tafssir_depth` are still accepted (older
  clients send them) and ignored: the response's `mode` is always `"strict"`, and its
  `tafssir` and `disclaimer` are `null`. Answers saved by the former experimental
  explanatory reading («قراءة تفسيرية») keep their `mode: "tafssir"` and display with
  their disclaimer.
- `POST /api/research-agent` also returns provider metadata and per-request usage metrics.
- **Focus ayah (additive).** `ResearchAgentRequest.focus = {surah, ayah}` (optional, read in
  the request's `mushaf`) centres the research on one ayah: its reference and DB text are
  appended to the latest user message for every stage, it leads the evidence list, it is
  always kept after review, the answer is never turned into a clarifying question, and a
  search with no hits still answers from it. An unknown ayah returns `422`.
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
