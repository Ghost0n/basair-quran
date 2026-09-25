# Q-Basair

Q-Basair is a Quranic research tool for Arabic word, root, and phrase search. It combines a FastAPI backend over a local SQLite Quran database with a modern Next.js web interface.

## Current Capabilities

- A Home landing for first visits: a rotating āyah as the centerpiece, a
  natural-language "اسأل/ابحث" bar (questions → Studio, terms → search), a desk row
  (continue-reading at the saved verse + library stats), and the latest research
  sessions. Returning readers with a saved position land directly in the reader
  (once per browser session).
- One command bar (`⌘K` / `/`) that searches and navigates, and routes a
  natural-language question to the Studio (prefilled and submitted).
- Smart exact-word search with safe handling for Arabic prefixes and Quranic orthography.
- Root search with paginated result cards.
- Compound phrase search within a single ayah.
- High-confidence "did you mean" suggestions for close misses.
- Quran page reader synchronized with the selected search result.
- A focused reader: one compact bar (surah · juz · page, «انتقل», «العرض», play
  page, bookmark, focus mode, page arrows), a single «انتقل» sheet (surah search,
  `2:255`, «صفحة 50», «جزء 30», juz grid), swipe to turn pages on touch screens,
  focus mode (`F` or a tap on the page) that hides all chrome, and prefetching of the
  neighbouring pages so turns are instant.
- Three reading modes — «صفحات» (the printed page; a facing spread when two pages fit
  at full size), «تمرير» (continuous pages) and «آية آية» (one verse per row) — with
  one text-size setting that means the same thing in every mode. The default adapts:
  continuous scroll on phones and landscape screens, pages elsewhere (see
  [docs/api-contract.md](docs/api-contract.md) → Reader layout notes).
- The Madani mushaf (Hafs, authentic line-faithful QCF pages) as the reader's single edition in this first version, chosen from Settings → «المصحف». The database also holds Qaloun, Warsh, Shuba, Douri, and Sousi for future standard editions; they are not exposed in the UI.
- A reader toolbox (open registry, keys 1–4) that sets what a tap on the text does: «تحليل» (grammar
  insights: root, lemma, iʿrāb), «تظليل» (save + theme an ayah), «تحديد» (select words, then exact /
  root search, ask the Studio, count the phrase and each letter in page / surah / Quran, or copy with
  the reference) and «تفسير» (an experimental tafssir of the tapped ayah, read in its context).
- Themes (مواضيع): the reader's save action highlights an ayah with one or more named colours, so
  saved ayahs group by subject as you read; the library lists them by theme (rename, recolour,
  delete) and «العرض» can hide the highlights.
- Theme boards (لوحة الموضوع, `/?mode=board&theme=<id>`): a theme's ayahs on a canvas to arrange,
  annotate (notes, headings) and link with labelled relations («يفسّر»، «يؤكّد»…); an ayah expands
  into a scrollable mini reader of its passage. The board autosaves as the theme's metadata.
- Research documents («الأبحاث»): a structured, versioned research format (sections, quoted ayahs
  verified against the mushaf, notes, references, AI sections labelled), created from a Studio
  session («حوّل إلى بحث»), a theme board («صدّر كبحث») or from scratch; exported as Markdown / JSON,
  or through the «مشاركة» studio as a research or verse card, a numbered carousel (ZIP or
  multi-image share) or a print / PDF page — in 4:5, square or story size and three styles. Publishing to the community runs a blocking audit, then
  an AI audit agent that fails closed to human moderation.
- Translations of the Quran's meanings («ترجمة المعاني»): up to three per reader, shown under each
  ayah in the «آية آية» mode, from trusted sources (QuranEnc — the Noble Quran Encyclopedia —
  first, Tanzil for the gaps; about 60 languages by default, every QuranEnc language with `--all`),
  stored verbatim with translator, source and version. Built by `python scripts/build_translations.py`
  into `data/translations.db` (see `docs/quran-translations.md`).
- Community («المجتمع»): a feed of published researches (public or link-only) — latest or trending
  («الأبرز»), searchable, filterable by surah, tag, research mode, board or author, with infinite
  scroll — post pages with the document and its read-only board, likes, private bookmarks
  («المحفوظة»), link sharing, comments, reports, and a moderation queue for admins — governed by
  `docs/community-guidelines.md`.
- A "liquid glass" design system (`docs/design-system.md`): one translucent material for all chrome
  (floating rail and tab dock, capsule bars, glass sheets and panes), glossy gold for actions, a
  shared selected state, spring micro-interactions and view-transition page changes — with the
  mushaf itself kept opaque and reduced-motion respected.
- A persistent floating media bar (transport · reciter chip · seekable progress ·
  repeat/speed) shown across every screen; reciter selection lives in a filterable
  sheet opened from the bar or the rail.
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
