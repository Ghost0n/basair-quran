# Authentic Madani (Hafs) Mushaf Reader — Design

Status: **in progress** (branch `feat/Q-Basair-4-authentic-mushaf`). This documents the
plan to add a line‑for‑line, page‑faithful Madani mushaf view (like quran.com) that
**augments** — never replaces — the existing multi‑riwāyah Unicode reader.

> **Implementation update — QPC version is V1, not V2.** The chosen QCF version is
> **V1**, not V2 as originally proposed below. Reason discovered during build: only
> **V1** is distributed as **WOFF2** (`nuqayah/qpc-fonts/mushaf-woff2`, `QCF_PNNN.woff2`
> + `QCF_BSML.woff2`); V2 ships only as TTF, and the KFGQPC "no‑modify" license forbids
> converting TTF→WOFF2 ourselves. V1 (1405H Madani) renders the authentic calligraphy
> and is visually near‑identical. The DB stores **both** `glyph_v1` and `glyph_v2`
> per word, so V2 can be enabled later if a clean V2 WOFF2 source appears. The endpoint
> serves `glyph_v1` and `font_base_path = /fonts/qpc-hafs-v1`.

## Why this is a separate feature

The current reader renders the Unicode `ayah.text` as justified flowing text. The
authentic printed‑page look (15 lines/page, each line filled edge‑to‑edge with the
exact calligraphic line breaks) is **not achievable with CSS** on Unicode text:
browsers only stretch inter‑word spaces (no Arabic kashida justification), and our
data has only **ayah‑level** `line_start`/`line_end` — no word‑to‑line mapping.

The printed look is produced by two decoupled assets used together:

1. **Per‑page line‑layout data** — for each of the 604 pages: the lines, each line's
   `line_type` (`surah_name` / `basmallah` / `ayah`), `is_centered`, and the word
   range, so words can be grouped onto lines and justified.
2. **QCF/QPC glyph fonts** — one WOFF2 **per page**; words render as page‑specific
   private‑use glyph codes (`qpcV1`/`qpcV2`), reproducing Uthman Taha's calligraphy
   exactly. The line‑filling is intrinsic to the glyphs, not a runtime algorithm.

## Data sources (recommended)

| Asset | Source | License | Notes |
|---|---|---|---|
| Layout dataset | QUL/Tarteel `mushaf-layout` (authoritative) or `zonetecde/mushaf-layout` (render‑ready per‑page JSON) | **Freely redistributable** (layout data) | `zonetecde` already pairs words with `qpcV1`/`qpcV2` codes → fastest MVP |
| Glyph fonts | `nuqayah/qpc-fonts` (QCF **V2**, 604 page WOFF2) | **KFGQPC "Freeware, Non‑Commercial"** | Use/Copy/Distribute free; **no sell, no modify/subset, no reverse‑engineer** |
| (rejected) | Quran Foundation API | Terms forbid redistributing raw data; revocable key | Fine as a cross‑check, wrong as the self‑hosted spine |

**QCF version:** **V2** (604 fonts, most mature — what quran.com historically shipped)
as default; **V4** (47 fonts, lighter, tajweed‑colored, newer/partly gated) as a later
opt‑in. Page weight is handled by **lazy‑loading only the visible page's font**, not by
subsetting (subsetting would violate the no‑modify term).

### The one licensing decision the owner must accept

The QCF fonts are **KFGQPC freeware/non‑commercial**: redistributable as‑is and free of
charge, but **may not be sold, modified, subset, or reverse‑engineered**. A free,
ad‑free research reader that self‑hosts the fonts unmodified is squarely within the
grant. Monetizing the fonts themselves, or subsetting them, would not be.

## Backend (Hafs‑only, additive)

Hafs is `mushaf_id = 2`. Everything here is **parallel** to the existing
`/quran-page` path, which is left byte‑for‑byte unchanged.

- **New ingest script** `scripts/build_mushaf_layout.py` (separate from `build_db.py`),
  writing **additive** tables into `data/quran.db`:
  - `mushaf_layout_lines(layout_id, mushaf_id, page, line_number, line_type, is_centered, surah_number, font_family)`
  - `mushaf_layout_words(line_id, position_in_line, surah_number, ayah_number, word_position, ayah_id, is_ayah_marker, glyph, …)`
  - `mushaf_layout_meta(layout_id, page_count, header_font, font_base_path, source)`
- **Reconciliation pass (integrity contract):** every Hafs `(ayah_id, word_position)`
  must map 1:1 to exactly one layout glyph; the build fails loudly otherwise. This is
  what keeps word‑click + `/api/morphology` coherent on the glyph layout.
- **New endpoint** `GET /api/mushaf-page-layout?page=N&mushaf=2` → ordered lines with
  `{line_number, line_type, is_centered, surah_number?, glyphs[]}` where each glyph
  carries `glyph` + `word_key="surah:ayah:word_position"` + `ayah_id` + `is_selected`.
  Non‑Hafs or a DB built without the layout step → `{found:false, fallback:"reader"}`
  (graceful degrade, never 500).
- **Fonts are not served by the API.** They are static assets under
  `apps/web/public/fonts/qpc-hafs-v2/…`; the response only returns the font family/URL.
- **Deploy:** `build_mushaf_layout.py` writes into `quran.db`, so commits touching it or
  its source JSON on `main` carry **`[rebuild-db]`**, and the script is chained after
  `build_db.py` in `.github/workflows/deploy.yml`.

## Frontend (augment, with fallback)

- **Optional glyph payload** on the page response (`glyph_layout` + `lines`); absent →
  the Unicode reader is untouched. Renderer engages only when `mushaf_render==="authentic"`
  **and** riwāyah is Hafs **and** the layout/fonts are present and load.
- **Per‑page font loader** (`FontFace` API, `display:swap`, memoized, prefetch ±1 page).
  While loading, the existing `AyatFlow` stays visible as the always‑legible placeholder.
- **`GlyphPage`**: each line a flex row; `font-size:0` container trick to kill markup
  whitespace; word glyphs via `dangerouslySetInnerHTML` (trusted server PUA strings only);
  `justify-content: space-between` fills ayah lines; centered surah_name/basmallah.
- **Interactions preserved** via `data-surah/ayah/ayah-id/word-position` + the
  `word_position` parity contract (the one silent failure mode → gets a dedicated
  round‑trip test against `/api/morphology`). Selection highlight = `.in-selected-ayah`
  on every span sharing `selectedAyahId`.
- **Setting:** `mushaf_render: "authentic" | "simple"` (default `"simple"`), toggled in
  Quick Settings; opt‑in so nothing changes for existing users until they choose it.

## Phased rollout

- **Phase 0 — backend + data (prerequisite, `[rebuild-db]`):** acquire layout + V2 fonts,
  ingest script + reconciliation, tables, endpoint, shared types/api‑client, round‑trip test.
- **Phase 1 — read‑only glyph page:** font loader + `GlyphPage`, FOUT gate with `AyatFlow`
  fallback, surah/basmala/ayah lines. Dev flag `?render=authentic`.
- **Phase 2 — interactions:** word‑click morphology + ayah selection/scroll on glyphs.
- **Phase 3 — toggle + polish:** `mushaf_render` preference + Quick Settings toggle,
  authentic surah‑title/basmala glyph rows, docs.

## Open decisions (owner)

1. **Accept the KFGQPC freeware/non‑commercial + no‑modify font terms?** (Required.)
2. **QCF version:** V2 (604 fonts, mature) now, V4 (47, lighter) later? (Recommended: V2.)
3. **Font asset hosting:** self‑host under `apps/web/public` and **fetch at deploy**
   (recommended — keeps ~tens of MB of binaries out of git) vs commit to the repo.
4. **Scope confirmation:** authentic mode is **Hafs‑only**, opt‑in; the default Qalūn
   experience and all other riwāyāt keep today's Unicode reader.
