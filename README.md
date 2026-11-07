# Q-Basair

Q-Basair is a Quranic research tool for Arabic word, root, and phrase search. It combines a FastAPI backend over a local SQLite Quran database with a modern Next.js web interface.

## Current Capabilities

- A Home landing: on wide screens a rotating āyah (a random one on arrival, then the
  next every few seconds) holds the centre above a «continue reading» card (gold
  button, listen from where you stopped), four shortcuts (index, saved pages, the last
  study session, community) and the search field. Phones show the same actions
  stacked at the bottom, within the thumb's reach, without the verse. Returning
  readers with a saved position land directly in the reader (once per browser session).
- One command bar (`⌘K` / `/`) that searches and navigates, and routes a
  natural-language question to the Studio (prefilled and submitted).
- Smart exact-word search with safe handling for Arabic prefixes and Quranic orthography.
  Every narration is searched alike: Qālūn and Warsh write a final yā' as «ے» (فِے, رَبِّے) and
  some «ئ» as a yā' with a separate hamza mark; search reads them as ي and ئ, so «ربي» or «في» finds
  the same verses in every narration (`fold_narration_letters`, mirrored in `packages/offline-engine`).
- Root search with paginated result cards.
- Compound phrase search within a single ayah.
- High-confidence "did you mean" suggestions for close misses.
- Quran page reader synchronized with the selected search result.
- A focused reader: one compact bar (surah · juz · page, «انتقل», «العرض», play
  page, bookmark, focus mode, page arrows), a single «انتقل» sheet (surah search,
  `2:255`, «صفحة 50», «جزء 30», juz grid), swipe to turn pages on touch screens,
  focus mode (`F` or a tap on the page) that hides all chrome, and prefetching of the
  neighbouring pages so turns are instant.
- Two reading modes — «صفحات» (the printed page, frameless; a facing spread when two
  pages fit at full size) and «آية آية» (one verse per row, with the chosen
  translations) — with one text-size setting that means the same thing in both. The
  reader bar's «العرض» opens a strip under the bar (mode, text size, highlights) so
  the page stays in view while it changes (see
  [docs/api-contract.md](docs/api-contract.md) → Reader layout notes).
- The Madani mushaf (Hafs, authentic line-faithful QCF pages) as the reader's single edition in this first version, chosen from Settings → «المصحف». Each page is laid out like the printed King Fahd mushaf (its drawn borders aside): a paper sheet with a fixed 15-line grid, the type size set per page so the widest line fills the measure, justified lines with a surah's short closing line centred, surah titles in the ornamental QCF frame with the calligraphic name, the calligraphic basmala, the running head (juz, surah) and the page number; two facing pages on wide screens. The database also holds Qaloun, Warsh, Shuba, Douri, and Sousi for future standard editions; they are not exposed in the UI.
- A reader toolbox (open registry, keys 1–2) that sets what a tap on the text does: «تحديد» (the
  default — a tapped word shows its analysis: root, lemma, part of speech, iʿrāb; tap a second word
  for a run, or the verse-number ornament for the whole verse; then exact / root search, ask the
  Studio, count the phrase and each letter in page / surah / Quran, or copy with the reference) and
  «تظليل» (a tap anywhere on a verse selects it whole and opens save + themes — the only save path;
  there is no per-verse bookmark). Contextual tafssir is asked from the Studio.
- Page turns: swipe on touch screens (every reading mode; the continuous ones scroll a page); on
  pointer screens, glowing edge zones (click) and the mouse wheel / trackpad once the page can't
  scroll further. A tap on the empty page toggles focus mode. Saving a page: on desktop every page
  wears a ribbon at its upper-left corner (outline; red once saved — a click toggles it); on phones a
  floating bookmark button beside the reader bar (red when saved). Phones have no page arrows.
- Phones (`docs/mobile-ergonomics.md`): controls sit where the thumb reaches — the reader's bar under
  the page with labelled 48px actions (the surah name opens «انتقل»), the search field just above the
  tab bar (it rides on the keyboard; suggestions open upward), and a 44px minimum touch target. A
  swiped page turn hides the chrome; a tap brings it back. The top search bar shows in Search only on
  desktop (`⌘K` / `/` open it from anywhere).
- Small interface choices (notebook grouping and filters, the folded reader bar, the picker source)
  are remembered per device without a setting; account preferences are cached on the device so the
  reader opens as it was left.
- Themes (مواضيع): the reader's save action highlights an ayah with one or more named colours, so
  saved ayahs group by subject as you read; the library lists them by theme (rename, recolour,
  delete) and «العرض» can hide the highlights.
- Theme boards (لوحات, `/?mode=board&theme=<id>&board=<board id>`): a theme can have several named
  boards, or none — a board is created on purpose (the notebook's «اللوحات» tab, «+ لوحة» on a theme,
  or «لوحة لـ…» when saving an ayah). A board puts the theme's ayahs on a canvas to arrange, annotate
  (notes, headings, shapes — rectangle / ellipse / diamond) and link with labelled relations
  («يفسّر»، «يؤكّد»…); elements can be restyled or deleted, ayahs hidden from the board (they stay in the
  theme), and changes undone / redone (7 steps). Boards autosave as the theme's metadata; Home offers to
  resume the last board, and a research exported from one shows it (with its relations) in its editor.
- «الدفتر» reopens where it was left (a board, a research, the tab) from the tab bar or rail.
- Research documents («الأبحاث»): a structured, versioned research format (sections, quoted ayahs
  verified against the mushaf, notes, references, AI sections labelled), created from a Studio
  session («حوّل إلى بحث»), a theme board («صدّر كبحث») or from scratch; verses are added with
  «أضف آيات» (from the notebook, a Quran search, or a surah + verse range); exported as Markdown / JSON,
  or through the «مشاركة» studio as a research or verse card, a numbered carousel (ZIP or
  multi-image share) or a print / PDF page — in 4:5, square or story size and three styles. Publishing to the community runs a blocking audit, then
  queues the research for the moderation batches (below).
- Translations of the Quran's meanings («ترجمة المعاني»): up to three per reader, shown under each
  ayah in the «آية آية» mode, from trusted sources (QuranEnc — the Noble Quran Encyclopedia —
  first, Tanzil for the gaps; about 60 languages by default, every QuranEnc language with `--all`),
  stored verbatim with translator, source and version. Built by `python scripts/build_translations.py`
  into `data/translations.db` (see `docs/quran-translations.md`).
- Interface languages: Arabic (source) plus English, French, Spanish, German, Portuguese, Italian,
  Dutch, Russian, Turkish, Azerbaijani, Uzbek, Bosnian, Albanian, Persian, Urdu, Indonesian, Malay,
  Bengali, Hindi, Chinese, Japanese, Korean and Swahili, with RTL/LTR
  switching and per-script fonts. Non-Arabic dictionaries are machine-drafted (marked β) pending
  native review. Quran text is never translated by this layer (see `docs/i18n.md`).
- Offline data packs for the standalone Android and iOS app: `python scripts/build_offline_packs.py --verify`
  splits the data into a ~53 MB core (the Madani mushaf, Ḥafṣ, with every search index) and
  downloadable narration, translation, interface and reciter packs, and proves the split changes no
  search or reader answer (see `docs/offline-packs.md`).
- On-device Quran engine for the standalone app (`packages/offline-engine`): the Quran
  routes ported to TypeScript, held to the server's exact JSON by a parity suite —
  `python scripts/offline_parity.py && pnpm --filter @q-basair/offline-engine test`
  (see `docs/offline-engine.md`).
- Standalone Android and iOS app, offline-first: the same web app built as a static bundle
  (`pnpm --filter @q-basair/web build:app`) that answers the Quran and the user's data on the device,
  starts with a language choice (interface + translation in one), and downloads narrations,
  translations, languages and recitations on demand (see `docs/offline-app.md`).
- Community («المجتمع»): a feed of published researches (public or link-only) — latest or trending
  («الأبرز»), searchable, filterable by surah, tag, research mode, board or author, with infinite
  scroll — post pages with the document and its read-only board, likes, private bookmarks
  («المحفوظة»), link sharing, comments and reports — governed by `docs/community-guidelines.md`.
- Moderation (`docs/community-moderation-design.md`): every 15 minutes a worker checks new posts,
  comments and reported items with an agent that applies the guidelines and explains its reasons in
  the author's interface language, failing closed to a person. Authors earn trust: an unverified
  author's posts wait for a moderator. Declines a moderator upholds count as strikes, and moderators
  ban from posting for 7 or 30 days (admins permanently). Authors see the reasons, edit and resubmit,
  and appeal once. A supervision panel (Community → «الإشراف») holds the queue, suspicious and banned
  users, appeals, the team (admins appoint moderators) and the batches' health.
- Feedback centre (`docs/feedback-centre.md`): contact, bug, help and feature messages
  (Settings → «الدعم والملاحظات», guests included) and the error screens' diagnostic reports, triaged
  by staff in the same panel.
- A "liquid glass" design system (`docs/design-system.md`): one translucent material for all chrome
  (floating rail and tab dock, capsule bars, glass sheets and panes), glossy gold for actions, a
  shared selected state, spring micro-interactions and view-transition page changes — with the
  mushaf itself kept opaque and reduced-motion respected.
- Fixed navigation: on phones a five-tab bar (Home · المصحف · البحث · الدراسة · الدفتر), always in
  the same place with labels (a second tap scrolls back to the top); the index, saved pages and
  community are one tap away from Home. The desktop rail opens Home from its brand mark and lists every destination, grouped by world —
  reading (المصحف · الفهرس · المحفوظة), research (البحث · الدراسة · الدفتر) and community — each lit
  in its world's colour (gold, teal, copper). Home's greeting follows the moment (morning / evening,
  Ramadan, Eid, a return after a while) with today's Hijri date; on phones account and settings
  open from Home's corner button.
- A persistent floating media bar (transport · reciter chip · seekable progress ·
  repeat/speed) shown across every screen on larger screens. On phones a recitation is a
  session, from play until the player is closed: the reader opens on a clear view (page +
  a two-row player; the reader bar and tab bar step away), a tap on the page shrinks the
  player into a capsule under the status bar and brings the tab bar back, and pausing
  changes nothing on screen. The recitation sheet (reciter · what to recite · repeat ·
  speed · end) opens from the player or the capsule. Phones held sideways (a touch screen
  at most 500px tall) get the same session in landscape form: a one-row player
  beside the side rail, and a sheet with the transport and the settings side by side.
  During a session the reading tools are
  locked (dimmed; verse taps do nothing). The recited verse is lit as one traced block (no
  per-line boxes; neighbouring lit verses keep a 4px gap), and the reader always follows it
  (pages turn, the verse-by-verse list scrolls).
  «نطاق التلاوة» recites a range — the page, a surah, a juz, a hizb or a custom from → to —
  and stops at its end or repeats it. Juz / hizb / quarter boundaries come from
  `apps/web/lib/quran-divisions.generated.ts` (`scripts/build_quran_divisions.py`: King Fahd
  juz, quran.com hizb/quarters verified against the printed ۞ signs). The bar's whole-surah
  progress and timestamps use verse durations measured once on the server and shared by all
  users (`GET /api/reciters/{id}/durations/{surah}`, cached in `data/cache.db`, immutable
  once complete). A surah whose durations are all known is also kept on the device, so the
  next recitation of it (offline included) shows exact times at once; the app asks for the
  last-read surah's durations during its splash.
- Optional invite-only authentication with backend-managed users and signed session cookies.
- Strict-context research agent that uses local transcript/book sources for term discovery and answers only from Quran search results.
- Dedicated `/research` workspace with per-session Ollama cloud key entry, model switching, request-usage observability, and an experimental Tafssir mode that reads every ayah with its neighbouring ayahs and its surah's context (and can be centred on one ayah).

## Project Layout

- `src/app`: FastAPI application, routes, API models, and Quran search services.
- `apps/web`: Next.js frontend.
- `packages/api-client`: typed frontend API client.
- `packages/shared`: shared TypeScript contracts.
- `scripts`: database and frontend helper scripts.
- `data`: source dictionaries, morphology data, mushaf JSON files, and generated SQLite database.
- `tests`: backend API, search behavior, and database builder tests.

## Running Locally

1. Install Python dependencies:

```powershell
pip install -r requirements.txt
```

2. Build the Quran database if `data/quran.db` is missing, or rebuild it after pulling changes that touch `scripts/build_db.py`:

```powershell
python scripts/build_db.py
```

The builder now precomputes phrase-token metadata and morphology search variants into SQLite so the API does not need to keep large search indexes in memory at runtime.

Each word's root is read from the morphology source (`data/quran-morphology.txt`, the Quranic Arabic Corpus, Ḥafṣ) word by word, not looked up by spelling: «قُلۡ» is قول while «قَلَّ» is قلل, and particles such as «مِن», «ما», «إنّ» or «على» have no root. Narrations that number or spell verses differently take the root of the same word in a nearby verse of the surah (hamza seats, alifs and the final yā' barī «ے» set aside); `data/word_root_dictionary.json` is only the fallback for spellings the source never uses. Each build prints, per narration, how many roots came from each step (`scripts/build_db.py`, `RootResolver`; tests in `tests/test_build_db.py`).

3. Add optional research-agent sources under `data/research_sources/`, then build the generated research index:

```powershell
python scripts/build_research_index.py
```

Supported source formats are `.txt`, `.md`, `.json`, `.srt`, `.vtt`, and `.pdf` when `pypdf` is installed. Add `--with-embeddings` to store Ollama embeddings in the index; otherwise the agent uses FTS5 plus the Quran term catalog.

4. Start the API on port `8001`:

```powershell
python -m uvicorn src.main:app --host 127.0.0.1 --port 8001
```

For deployments where you cannot run a separate pre-deploy rebuild step, you can start the API through the startup wrapper instead:

```powershell
python scripts/start_api.py
```

The wrapper checks whether `quran.db` already contains the required offline-precompute tables and rebuilds the DB only when it is missing or outdated. You can control this behavior with `QBASAIR_BUILD_DB_ON_START`:

- `auto` (default): rebuild only when required tables are missing
- `always`: always rebuild before starting the API
- `never`: never rebuild on startup

By default, browser CORS is limited to `http://127.0.0.1:3000` and `http://localhost:3000`. To allow another frontend origin, set `QBASAIR_CORS_ORIGINS` to a comma-separated list before starting the API.

For constrained deployments such as Render free tier, you can enable the lower-memory runtime profile with:

```powershell
$env:QBASAIR_LOW_MEMORY_MODE='1'
```

This keeps the same search behavior but reduces SQLite cache pages and limits the size of in-process runtime caches.

The research agent now defaults to direct Ollama cloud access at `https://ollama.com` with `QBASAIR_LLM_CHAT_MODEL=gemma4:31b-cloud` and `QBASAIR_LLM_EMBED_MODEL=nomic-embed-text`. Override these with `QBASAIR_LLM_PROVIDER`, `QBASAIR_OLLAMA_BASE_URL`, `QBASAIR_LLM_CHAT_MODEL`, and `QBASAIR_LLM_EMBED_MODEL`.
For slower cloud-backed models, the backend now defaults to `QBASAIR_LLM_TIMEOUT_SECONDS=120`. You can raise it further if needed:

```powershell
$env:QBASAIR_LLM_TIMEOUT_SECONDS='180'
```

For local development, the recommended user flow is to open the dedicated research page and add an Ollama API key there:

```powershell
http://127.0.0.1:3000/research
```

The frontend keeps the key in browser `sessionStorage` only and forwards it to the backend through request headers. The backend does not persist the key.

If you prefer an environment-based server default, set:

```powershell
$env:OLLAMA_API_KEY='your_api_key'
$env:QBASAIR_OLLAMA_BASE_URL='https://ollama.com'
```

If you want to keep using a local Ollama daemon instead of direct cloud API requests, point the backend or the research settings panel back to:

```powershell
$env:QBASAIR_OLLAMA_BASE_URL='http://127.0.0.1:11434'
```

If you want to test the private auth flow locally, set:

```powershell
$env:QBASAIR_AUTH_ENABLED='1'
$env:QBASAIR_SESSION_SECRET='replace-me-with-a-long-random-secret'
$env:QBASAIR_SESSION_SECURE='0'
python scripts\manage_users.py create --email you@example.com
```

5. Start the web app on port `3000`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_web_dev.ps1
```

6. Open `http://127.0.0.1:3000` for the main search workspace, or `http://127.0.0.1:3000/research` for the dedicated research agent page.

## Verification

Run the backend test suite:

```powershell
$env:PYTHONPATH='.'
pytest -q
```

Build the frontend:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_web.ps1
```

## Docker Compose Deployment

The repository now includes a production-oriented Docker Compose stack with:

- `nginx` as the only public entrypoint
- internal `web` and `api` services
- rate limits for `/api/research-agent`
- a hardened public default that disables Yamli through `NEXT_PUBLIC_ENABLE_YAMLI=0`
- a Linux bootstrap helper at `scripts/bootstrap_production.sh`
- a free Let's Encrypt path through `scripts/provision_tls.sh` and `scripts/renew_tls.sh`
- an invite-only auth flow managed from the VM through `scripts/manage_users.py`

The intended first production shape is a single-host deployment with persistent `data/` storage and one backend replica because the app currently relies on SQLite.

Pushes and merges to `main` trigger automatic deployment via a GitHub Actions self-hosted runner on the Hetzner server. Append `[rebuild-db]` or `[rebuild-index]` to the commit message when the deploy also needs to regenerate a database.

For the full Hetzner-oriented deployment guide including CI/CD runner setup, see [docs/deployment-hetzner.md](docs/deployment-hetzner.md).

## Architecture Note

The FastAPI app is API-only. The old static frontend was removed during the migration cleanup; the active user interface lives in `apps/web` and calls the API through Next.js rewrites.
