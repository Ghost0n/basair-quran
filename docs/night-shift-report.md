# Q-Basair Night-Shift Report — design & UX overhaul

Branch: `feat/Q-Basair-6-refonte-design` (not pushed). Baseline: `79089d6`
(the aligned plan). This is an honest close-out of the autonomous `/loop`
session — what shipped, what was verified, what's deferred, and what's next.
It is not a victory lap; the gaps section is deliberately long.

## How it was built & verified

- **15 commits**, one logical change each, French messages, `[Q-Basair-6]` token.
  Nothing pushed. `data/quran.db` (modified in the working tree) was **never staged**.
- Every code commit: `scripts/build_web.ps1` green, then in-browser verification
  through the preview tools (DOM inspection at **1920×1080** and **375**; ~800 spot-
  checked), console-error check each time. The preview served fresh chunks after
  each change (rebuild → restart the `next start` server).
- Verification leaned on **DOM/computed-style inspection**, not screenshots — the
  preview screenshots render as small scaled thumbnails, so measured values
  (classes, rects, computed styles, `aria-*`) were the source of truth.
- The one backend change (`reader_layout`) has a **pytest** round-trip
  (`tests/test_companions.py`, green). The frontend has **no unit-test harness**
  in the repo, so all frontend behavior was verified by build + in-browser only.
- Local-env note: another session held `:3000`, so the preview ran on `:3005`,
  built with `NEXT_PUBLIC_API_BASE_URL=/api` (same-origin via the Next rewrite → no
  CORS). This is a verification-only detail — committed `lib/config.ts` is unchanged
  (localhost still targets `:8001` directly). The backend was restarted once to pick
  up the `reader_layout` model.

---

## Shipped, per workstream

### A · Reader modes (reader-modes-plan.md phases 1–7) — complete

| Phase | Commit | What |
|---|---|---|
| 1 | `db037f5` | `reader_layout` preference end-to-end (model → shared type → client default → api-contract → pytest) |
| 2 | `a1fbf03` | Layout switcher in Quick Settings (5-way grid; `صفحتان` gated to authentic-Ḥafṣ) |
| 3 | `655fca0` | Extracted `PagedReader`; `MushafStage` became a mode dispatcher |
| 4 | `84dd7f8` | Continuous **scroll** mode (`ScrollReader` + `setActivePage`) |
| 5 | `305a9d8` | **Ayah-by-ayah** mode (shared `useReaderWindow` hook + `AyahTokens`) |
| 6 | `cbb5cb9` | Smart `auto` — resolves per viewport, recomputes on resize |
| 7 | `a6d0de5` | Mode-swap fade, keyboard-focusable reader regions, docs |

**Before:** one reader (single page / authentic spread), fixed. **After:** five
layouts — `auto` (viewport-resolved), `single`, `spread`, `scroll`, `ayah` — chosen
from Quick Settings, orthogonal to the `simple`/`authentic` renderer. Scroll and ayah
share one windowing engine (`useReaderWindow`): bounded 12-page window,
scroll-proximity + fill-to-overflow loading, prepend scroll-compensation, footer
tracks the top-of-viewport page and persists it. Phone `auto` → scroll.

**Verified (high confidence):** paged (Unicode + authentic Ḥafṣ 2-page spread),
`single` forces one page on wide Ḥafṣ, scroll streams neighbours and the footer
tracks, ayah rows render with word-click morphology / save / number chip, `auto`
flips paged↔scroll live on resize. Earned work intact: word-click morphology, glyph
save, cross-riwāyah, selection, app-shell height cap.

### B · Motion & fluidity pass — complete

| Commit | What |
|---|---|
| `e3583ff` | Theme cross-fade (body), universal `<button>` press (`scale .97`), shared keyframes `qbPopIn`/`qbRise`/`qbFade`/`qbPulse` |
| `8be7f7b` | Overlay entrances (onboarding, shortcuts, export, quick-settings, select-menu, morph-popover) |
| `7c41382` | Side-panel slide-ins + staggered result mounts |

**Before:** instant theme flip, overlays/panels popped in. **After:** 240ms theme
cross-fade, `scale(0.96→1)` overlay entrances with anchored origins, `translateX`
panel slide-ins, and 35ms-staggered result rows. All auto-gated by the **existing
global `prefers-reduced-motion` reset** (no per-rule gating needed). Verified: body
transition + keyframes present, theme toggles, quick-panel/morph/onboarding animate,
result stagger with hover-lift preserved (used `backwards` fill so it never locks
`transform`).

### C · Floating media bar (retires the recitation screen) — complete

| Commit | What |
|---|---|
| `55fbd31` | Global bottom media bar + `seek()` context method + filterable `ReciterSheet` |
| `563a175` | Retired `RecitationScreen`; rail `التلاوة` opens the sheet; removed the `audio` mode/branch |

**Before:** a dedicated full-screen recitation room reached via a rail destination.
**After:** a persistent bottom bar (transport · reciter chip · **seekable** progress ·
repeat/speed/stop), a fixed slice of `.qb-main` so the reader recomputes above it (no
overlap), with reciter browsing in a bottom sheet. Verified: bar appears on playback,
**real-audio seek** (everyayah loaded; click moved 2%→30%), sheet filters + picks,
sits above the mobile tab bar, authentic spread still fits above it.

### D · Home landing + command-bar "اسأل" — complete

| Commit | What |
|---|---|
| `ba4b0d0` | Command bar routes a natural-language question → Studio (prefilled + submitted) |
| `508aa36` | **Home** as the default entry (hero, ask bar, quick cards, continue-reading, rotating āyah) |

**Before:** app opened to the reader; the command bar's "اسأل" placeholder was
unfulfilled. **After:** `home` is the default mode; a prominent ask bar and the
command bar both hand a question to the Studio via a small sessionStorage+event
prefill relay. Verified: default load → Home; ask → Studio (question in the thread);
`نور` still routes to search; cards + continue navigate; rail brand returns Home;
cards stack on mobile.

### E · Redesign polish + docs — this commit set

- `02b0a71` — README documents Home, the command-bar ask, and the media bar.
- This report.
- Final holistic smoke test (Home → reading → morphology → media bar) — clean, no
  console errors.

---

## Not done / deferred (be honest)

- **Glyph fit-to-width scroll.** Scroll and ayah modes render the **Unicode** reader
  for every riwāyah; authentic QCF glyph pages are not yet fit-to-width for a scroll
  column (`useGlyphFitWidth` was never written). On Ḥafṣ+authentic, choosing scroll/
  ayah silently drops to Unicode.
- **No window virtualization.** `useReaderWindow` caps at 12 pages and does **not**
  prune; past the cap, auto-loading pauses until a footer/surah jump re-anchors. Fine
  for a reading session, not for marathon scrolling.
- **Roving tabindex not done.** Every reader word is still its own tab stop — a large
  tab sequence. Logged in `docs/authentic-mushaf-reader.md`; a real roving-focus pass
  is future a11y work. The scroll/ayah surfaces are at least focusable regions now.
- **Dead CSS left in place.** Retiring `RecitationScreen` orphaned the
  `.qb-recitation-*` / `.qb-reciter-list` rules in `recitation.css` (and the
  `.qb-companion-panel .qb-recitation*` overrides in `concordance.css`). They're
  unused/harmless; I chose not to hand-delete ~170 lines late in the session (higher
  risk than value). `.qb-reciter-row*` is still used by the sheet.
- **Footer `AudioMiniPlayer` kept.** It overlaps the media bar's job; kept because
  it's synced via the same context and still handy for "play this page". Should be
  reconciled (remove, or repurpose as a follow-along toggle).
- **Ask heuristic is conservative** and one-directional. The command bar only routes
  clear questions (ends with ؟, ≥6 words, or interrogative-led ≥3 words); it can miss
  a terse question. The **Home ask bar** treats *all* input as a question (no search
  fallback). No "ask" mode chip to force intent.
- **Prefilled ask targets the active session**, not a fresh one — an ask can land in
  an existing (possibly tafssir) thread and inherit its mode/context.
- **Home is thin vs. the brief.** No light stats (saved āyāt / followed roots), no
  recent sessions; the rotating āyah is a **curated 5-item set**, not from the API;
  continue-reading shows the **page number only** (no surah name). Onboarding's
  "ابدأ القراءة" now lands on Home (default), a slight label mismatch.
- **Theme cross-fade is body-level only** — panels/surfaces still snap; a fuller
  themed-surface transition was out of scope.
- **Motion leftovers.** `qbPulse` is defined but unused; list-stagger is only on
  concordance results (library/session/bookmark lists don't stagger); the media-bar
  seek is the only "progress" surface touched.
- **Tablet width** (~800) was spot-checked, not exhaustively verified per feature;
  primary coverage was 1920 + 375.
- **No new automated tests** beyond the `reader_layout` round-trip — the repo has no
  frontend test runner, so reader modes, intent routing, and the media bar rely on
  build + in-browser verification.

## Future work (to finish/harden each stream)

- **Reader:** write `useGlyphFitWidth` for authentic scroll; add true virtualization
  (prune with scroll compensation both edges); per-ayah translation/tafsir slot in
  ayah mode (the column was sized for it); roving-tabindex + arrow-key word nav.
- **Media bar:** verse markers on the seek track; range-repeat (repeat A→B); a
  follow-along mode that highlights the playing āyah in the reader and auto-scrolls;
  remove/repurpose the footer mini-player.
- **Home/ask:** live stats + recent sessions; a real "verse of the moment" endpoint;
  surah name on continue-reading; an "ask vs search" mode chip; start a **new** studio
  session per ask.
- **Cleanup:** delete the dead recitation CSS; reconcile the two audio players; add a
  frontend test runner (Vitest) and cover intent routing + `useReaderWindow`.
- **i18n:** strings are Arabic-literal; route them through `t()` before adding locales.

## New functionality ideas (beyond the brief)

- **Memorization (ḥifẓ) mode:** progressive hide/reveal of words or lines, per-ayah
  repeat counts, and a "test me" blank-fill — the ayah reader is the natural host.
- **Share an āyah as an image** (rendered card with the reciter/translation) — the
  brand system already has the visual language for it.
- **Tajwīd coloring** layer on the authentic glyph page (QCF V4 ships tajwīd fonts).
- **Offline PWA:** cache the last N pages + played reciter audio; the reader/media
  layers are already client-driven.
- **Reading goals & streaks** surfaced on Home (pages/day, last-read resume across
  devices once sessions sync).
- **Command-bar palette upgrade:** typed "go" actions (jump to juz/hizb, toggle
  riwāyah, switch layout) alongside search/ask — the single-input model is ready for it.
- **Concordance heatmap on Home** as a "concept of the day" (a root's distribution),
  linking into the existing heatmap screen.
