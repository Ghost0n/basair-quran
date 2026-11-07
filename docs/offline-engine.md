# On-device Quran engine (`packages/offline-engine`)

The standalone app has no server to call for Quran search and reading, so it
carries its own: a TypeScript port of the backend's Quran services that answers
the same `/api/*` requests with **the same JSON**, from the local SQLite database
(`core.db` plus the installed packs, see `docs/offline-packs.md`). The web app is
unchanged: it keeps calling the FastAPI server. The two implementations are held
together by a parity suite, not by trust.

## What it answers

| Route | Ported from |
|---|---|
| `GET /api/mushafs`, `/api/surahs`, `/api/reciters` | `src/app/routes/mushafs.py` |
| `GET /api/suggest`, `POST /api/suggest-batch`, `GET /api/search`, `/api/search-v2`, `/api/search-result-page`, `/api/root-distribution` | `src/app/routes/search.py` + `quran_service.py` |
| `GET /api/quran-page`, `/api/mushaf-page-layout`, `/api/ayah-reader`, `/api/ayah-reader-more`, `/api/text-count`, `/api/morphology` | `src/app/routes/reader.py` + `quran_service.py`, `morphology_service.py` |
| `GET /api/translations`, `/api/translations/ayahs` | `src/app/routes/translations.py` + `translation_service.py` |

With a `userData` storage, it also answers the user's own data — notebook,
themes and boards, research documents (with quoted-ayah verification and the
publication audit), research sessions, followed roots and preferences — from
a local JSON store (`src/local-store.ts`, ported from `app_data_service.py`
and `research_document_service.py`): same validation, limits, ordering and
shapes. Changed rows are marked and deletions leave tombstones, which
`src/sync.ts` (`syncAccount`) uses to reconcile the device with the account
(see "Account sync" in `docs/offline-app.md`).

Everything else — accounts, the research agent, Community — is not answered
on the device: `OfflineApi.handle()` returns `null` and the app decides (the
network when online, an explicit offline state otherwise; see
`docs/offline-app.md`).

```ts
import { OfflineApi } from "@q-basair/offline-engine";

const api = new OfflineApi({ quran: coreDbDriver, translations: translationsDriver });
const response = await api.handle({ method: "GET", url: "/api/search-v2?q=رحم&mode=root&mushaf=2" });
// → { status: 200, body: { found: true, page_size: 10, results: [...] } }
```

The engine needs one thing from its host: a `SqlDriver` with
`all(sql, params) → rows`. Tests use `node:sqlite`; the Android app uses the
native SQLite plugin.

## How it stays identical

- **Same logic, same order.** Each function keeps its Python name (camelCased)
  and order of operations. Queries that run once per request are the server's
  SQL, unchanged, so SQLite orders them the same way on both sides.
- **Python semantics, reproduced** (`src/py.ts`): `str.split()` / `strip()`
  whitespace, code-point string order, tuple sort keys with stable sorting,
  left-to-right float `sum()`, `round(x, 3)` (half-to-even on exact ties such
  as 0.0625) and `difflib.SequenceMatcher.ratio()` line for line.
- **Same response shaping.** `scripts/generate_offline_models.py` generates
  `src/models.generated.ts` from the Pydantic models (fields, defaults, nesting)
  and the reciter list; the engine drops unknown keys, fills defaults and applies
  `response_model_exclude_none` exactly where the route does.
  `tests/test_offline_models.py` fails when the generated file is stale — run
  the script after changing `src/app/models/api.py`.
- **One deliberate difference: speed.** Per-token morphology lookups (thousands
  of tiny queries on the server) read an in-memory copy of
  `morphology_search_variants` sorted with the server's `ORDER BY`. Heavy
  indexes (phrase metadata, did-you-mean candidates, Latin keys, page index,
  layout) are cached per narration like the server's; `OfflineApi.reset()`
  clears them after a pack is installed or removed.
- **Morphology** comes from core.db's `morphology_segments` table (the same
  lines the server parses from `data/quran-morphology.txt`), indexed one surah
  at a time.

Known, deliberate divergence: for a Latin query with `with_chakl=true`, when
two vocalized spellings share one plain spelling the server picks one by set
iteration order (arbitrary across processes); the engine keeps the first.

## The parity suite

```bash
python scripts/build_offline_packs.py          # build/offline/core.db
python scripts/offline_parity.py               # records ~4,000 server answers
pnpm --filter @q-basair/offline-engine test    # replays them against the engine
```

`scripts/offline_parity.py` asks the real FastAPI app a deterministic sample of
requests drawn from the database itself — words (plain and diacritized), roots,
2–3-word phrases, typos of both (did-you-mean), prefixes (suggestions), Latin
transliterations, the follow-up result pages, reader pages and locators, page
layouts, ayah readers, counts, morphology, translations, and invalid input — and
records each status and JSON. It then plays a scripted session over the
user's own data (themes, notebook, boards, sessions, roots, documents with
matching / mismatching / missing quotes, audits, preferences, and every error
case) against a fresh store with a clock that ticks once per request; the
engine replays it with the same clock (random document ids are compared by
name). The test requires identical JSON (and, for
FastAPI's own validation errors, the same status). Other databases and
narrations: `--db data/quran.db --mushaf 1` (add `morphology_segments` for the
morphology cases), `--seed`, `--sample`.

CI (`Offline engine (server parity)`) runs the same suite on the small pytest
fixture (`--fixture`). Locally, on the real data: 4,025 requests (default seed) for Ḥafṣ on
`core.db` and 5,028 for Qālūn on the full database, all identical. The first
real-data run also found a server bug the port avoided: `/api/text-count`
answered 500 for narrations whose ayahs straddle two pages (`"85-86"`); the
server now counts them on their starting page, like the engine.
