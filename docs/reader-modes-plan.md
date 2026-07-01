# Reader Modes — Implementation Plan (night-shift spec)

Status: **plan / not yet built.** Target branch: `feat/Q-Basair-6-refonte-design`
(the night-shift enhancement/design branch, off `develop`). Each phase = its own
verified commit, French message, `[Q-Basair-6]` token, no push, no generated DBs.

## 1. Goal

Give the reader multiple **layout modes** so it uses screen space well on any
device, while keeping the mushaf readable and scroll-free where that's the point.
Layout is **orthogonal** to the existing rendering choice.

- `mushaf_render` (existing): `simple` (Unicode/AyatFlow) | `authentic` (QCF glyph).
  Authentic renders **Hafs only**; otherwise falls back to simple.
- `reader_layout` (**new**): how pages/ayahs are arranged. Values below.

## 2. Layout modes (`reader_layout`)

| Value | Behavior | Renderer | Scroll? |
|---|---|---|---|
| `auto` (default) | width-aware: authentic→`spread` on wide / `single` otherwise; simple→`single` | either | no (paged) |
| `single` | one page, fit-to-height, centered | either | no |
| `spread` | two facing pages, fit-to-height (authentic/Hafs only; else `single`) | authentic | no |
| `scroll` | **continuous** vertical scroll of pages, each fit-to-**width** (large text) | either | yes |
| `ayah` | ayah-by-ayah vertical list (one ayah per row/card) | simple (glyph per-ayah later) | yes |

Notes:
- `single`/`spread`/`auto` already exist as the current fit-to-height reader
  (`useGlyphFit` + spread). This work adds the switcher + `scroll` + `ayah`.
- `scroll` is the biggest win for 16:9 desktop (fills width with one wide page,
  scroll vertically) — the "wasted width" fix.
- `ayah` leaves room for future translation/tafsir per verse.

## 3. Smart defaults (`auto`)

Pick a default per viewport, still overridable by the switcher:
- Wide desktop (≥1180px): authentic→`spread`, simple→`single`.
- Tablet (768–1180): `single`.
- Mobile (<768): `scroll` (or `ayah`) — portrait phones read better scrolling.

Persist the user's explicit choice; `auto` recomputes on resize.

## 4. Component architecture

Refactor `MushafStage` into a **mode dispatcher** so each mode is isolated:

```
MushafStage
 ├─ header (compact, existing)
 ├─ body: switch(reader_layout)
 │    ├─ PagedReader   (single | spread | auto→paged)  ← extract current logic
 │    ├─ ScrollReader  (continuous pages, fit-to-width)
 │    └─ AyahReader    (ayah list)
 └─ footer (existing; page indicator meaning adapts per mode)
```

- Extract today's spread/single + `useGlyphFit` into `PagedReader`.
- `ScrollReader` and `AyahReader` are new, reusing `GlyphPage`/`AyatFlow` and the
  shared word-click + save handlers.
- Keep `mushaf.pageData`/`loadPage`/`loadByAyah`/`selectedAyahId` as the shared
  state; modes differ only in presentation + how they page.

## 5. Per-mode notes

### 5.1 `scroll` (continuous mushaf)
- Render a window of pages stacked vertically inside the app-shell scroll region
  (`.qb-mushaf-page` becomes the scroller again — remove `is-glyph` centering for
  this mode).
- Each page fit-to-**width** only (new `useGlyphFitWidth`: scale so the widest
  line fills the available width; **no** height cap — the page is as tall as it
  needs and the column scrolls). Big, readable text on 16:9.
- Load neighbors on scroll: fetch page N-1/N+1 as they approach the viewport
  (IntersectionObserver sentinels), cap the window (e.g. ±3 pages) and drop far
  ones to bound DOM. Persist "current page" = the page nearest the viewport top,
  and update the footer indicator from it.
- Simple renderer: continuous flow of `AyatFlow` blocks across pages.

### 5.2 `ayah` (ayah-by-ayah)
- Vertical list; each ayah is a row: number chip · ayah text (Unicode `AyatFlow`
  tokenization so word-click morphology + save reuse directly) · save toggle.
- Source ayahs from the current page(s) or the whole surah (decide: page-window
  vs surah; surah is nicer for study but heavier — start page-windowed, load more
  on scroll like `scroll` mode).
- Selected ayah highlighted + scrolled into view (reuse the mushaf-context effect;
  ensure a matching selector class exists).

### 5.3 `paged` (existing)
- No behavior change; just moved into `PagedReader`. Keep the fit-to-height,
  spread pairing, ornament, save parity, correction pass.

## 6. Shared concerns (already solved — must keep working in every mode)

- **Word-click morphology**: reuse `handleWordClick`/`handleWordKey` +
  `MorphPopover`. Popover positioning uses `mushaf.bodyRef` — verify per mode.
- **Save-ayah affordance**: reuse `useSavedAyat` + `handleGlyphSave` / AyatFlow
  toggle in every mode.
- **Selection highlight + scroll-into-view**: `selectedAyahId` match; the
  mushaf-context scroll effect selector list must include each mode's selection
  class (already has `.qb-ayah-tok.selected`, `.qb-glyph-sel`).
- **Cross-riwayah open + numbering divergence**: already fixed at the reconcile
  layer — carries over.
- **No document scroll**: the app-shell caps the shell; `scroll`/`ayah` scroll
  **inside** `.qb-mushaf-page`, not the document.

## 7. Switcher UI

- A segmented control in **Quick Settings** (top-bar popover) next to the existing
  simple/authentic toggle: single | two-page | scroll | ayah (+ auto).
- Disable `two-page` when not authentic/Hafs (with the existing note pattern).
- Persist via preference; reflect the effective mode.

## 8. Preference plumbing (Phase 1)

Keep backend model, shared types, api-client, frontend aligned (AGENTS.md rule):
- `src/app/models/api.py`: `UserPreferences.reader_layout: Literal[...] = "auto"`.
- `packages/shared/src/index.ts`: add `reader_layout` to the type.
- `packages/api-client/src/index.ts`: no shape change beyond the type.
- `apps/web/lib/preferences-context.tsx`: `DEFAULT_PREFERENCES.reader_layout = "auto"`.
- `docs/api-contract.md`: document the new field.
- Tests: `tests/test_api.py` preferences round-trip includes the field.

## 9. Phased task breakdown (one commit each)

1. **Pref end-to-end** — `reader_layout` model + shared type + default + api-contract + test. (small)
2. **Mode switcher** — Quick Settings segmented control; wire to preference; two-page disabled off-Hafs. (small)
3. **Extract PagedReader** — move current single/spread/fit into `PagedReader`; MushafStage becomes a dispatcher; behavior unchanged (regression-verify). (medium)
4. **Scroll mode** — `ScrollReader` + `useGlyphFitWidth` + neighbor loading + footer sync. (medium/large)
5. **Ayah mode** — `AyahReader` + list rows + reuse morphology/save/highlight. (medium)
6. **Smart defaults** — `auto` per-viewport resolution + remember explicit choice. (small)
7. **Polish + tests** — transitions, a11y (roving tabindex, mode announced), targeted tests, docs (`README.md` reader section, `docs/authentic-mushaf-reader.md`). (medium)

## 10. Verification (per phase, in-browser + build)

- Build green (`scripts/build_web.ps1`) each phase.
- Per mode at desktop 1920×1080, tablet ~800, mobile 375:
  - `scroll`: document does NOT scroll; `.qb-mushaf-page` scrolls; text large
    (fit-to-width); neighbor pages load; footer page indicator tracks scroll.
  - `ayah`: rows render; word-click opens morphology; save toggles (library
    count); selected ayah highlights + scrolls into view.
  - `paged`: unchanged (spread on wide, single narrow, no scroll, save/morph OK).
- Switcher persists across reload; two-page disabled off-Hafs; no console errors.

## 11. Constraints & rules (from CLAUDE.md / AGENTS.md)

- Strict research mode stays Quran-only; Tafssir stays experimental (untouched here).
- Do NOT commit `data/quran.db` / `data/research_agent.db` or corpora.
- Keep backend model ↔ shared types ↔ api-client ↔ frontend ↔ docs ↔ tests aligned
  in the same slice when a shape changes.
- Commits: `type: [Q-Basair-6] - message` (French), one logical change each, no push.
- Merge to `main` for this branch must carry `[rebuild-db]` (earlier work touched
  `build_mushaf_layout` deploy wiring). Reader-modes phases themselves are frontend/
  API only → no deploy tag needed on their own.
- Preserve: fit-to-height correctness, spread pairing, ornament, save parity,
  cross-riwayah adopt, dropdown scroll fix, compact chrome.

## 12. Open decisions for the loop

- `ayah` mode source: page-window (start here) vs full-surah list.
- `ayah` in authentic: per-ayah glyph rendering vs always Unicode (start Unicode).
- `scroll` window size / virtualization strategy (start ±3 pages, revisit if DOM heavy).
- Whether `auto` mobile default is `scroll` or `ayah` (A/B in-browser, pick by feel).
