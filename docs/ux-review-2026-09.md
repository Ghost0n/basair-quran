# Q-Basair — UX, design & responsiveness review (2026-09-24)

**State reviewed:** `feat/Q-Basair-11-mushaf-madani-unique` (Madani Ḥafṣ is the only edition).
**Method:** the production-shaped build (`NEXT_PUBLIC_AUTH_ENABLED=1`, authentic layout + QPC fonts
built locally) driven in Chromium at 390×844 (phone), 844×390 (phone landscape), 820×1180
(tablet), 1366×768 (laptop), 1920×1080 (desktop), dark + light, every reader layout, every
screen, plus scripted probes (page turns, morphology, overflow, touch-target sizes, network).

**Verdict.** The foundations are strong — the authentic Madani page is beautiful, search ↔ reader
sync works, no horizontal overflow anywhere, no console errors, the API is fast (search 10–30 ms,
morphology 3 ms). What holds the product back is **the reader's chrome and sizing model**:
on a phone the Quran gets ~40 % of the screen, each layout sizes text by a different rule, and
three separate navigation UIs compete. Fixing that is the highest-value work before launch.

Severity: **P0** blocks a good first impression · **P1** fix before launch · **P2** polish.

---

## 1. Reader (the core)

| # | Sev | Finding | Evidence |
|---|---|---|---|
| R1 | P0 | **Mobile reader is chrome-dominated.** At 390×844 the Quran text gets ~330 px of 844: top bar (search + 2 icons), 4 rows of reader header (title, 3 nav pills, surah select, 5-way layout switch), a progress bar, a 2-row footer, then the tab bar. In landscape (844×390) only **2 lines** of Quran are visible. | `m-auto`, `ml-auto` captures |
| R2 | P0 | **No immersive / focus reading.** Chrome never hides — no tap-to-toggle, no hide-on-scroll. Every serious mushaf app does this. | all reader captures |
| R3 | P0 | **No swipe to turn pages on touch.** Page turns are only the small footer arrows. | no touch/pointer handlers in `features/reading` |
| R4 | P1 | **Inconsistent sizing model across layouts.** Paged fits the page to the viewport; *scroll* fits to width — at 1920 px that's ~5 giant lines per screen; *ayah* renders small glyphs in a narrow column. The font-size slider means something different in each mode. | `d-scroll`, `d-ayah` |
| R5 | P1 | **`auto` picks a spread on a 1366×768 laptop**, shrinking each page to ~13 px lines, with ~280 px of empty frame on both sides. Spread should only be chosen when each page still renders at a comfortable line height. | `l-auto` |
| R6 | P1 | **Spread pages are drawn at different sizes** (left page taller/wider than the right). Facing pages must share one scale and one frame. | `d-auto`, `l-auto` |
| R7 | P1 | **Three navigation UIs**: header pills (آية/سورة/جزء + select), footer page field, and the command bar's «انتقل». Plus the layout switch in the header *and* in Quick Settings *and* Settings. | header/footer/command bar |
| R8 | P1 | **Page turns wait on the network every time**: page data + layout are fetched on each turn (fonts are prefetched ±1; a spread turn needs +2/+3). Instant locally, a visible lag on real networks. | page-turn probe |
| R9 | P1 | **Verse 1 is boxed/highlighted on every surah jump or resume**, even when the user didn't target a verse. Should be transient (fade) or only for targeted verses (search hit, notebook). | `d-auto`, `t-auto` |
| R10 | P2 | Ayah mode duplicates the verse number (badge **and** the mushaf's own ﴿n﴾ marker), puts each verse in a heavy card, save icon inside. | `m-ayah`, `d-ayah` |
| R11 | P2 | Nested frames (canvas card → page card) waste ~40 px of width on phones. | `m-auto` |
| R12 | P2 | The Fatiha/Baqarah opening spread renders small in the middle of a mostly empty frame. | `d-fatiha-auto` |
| R13 | P2 | Header shows the *loaded* page's surah even when the facing page is another surah; the layout switcher jumps to a 2nd row in some modes (header reflows between layouts). | `d-auto`, `d-ayah` |
| R14 | P2 | Footer still says «رواية حفص» — now constant, it can go (the edition is a setting). | footer |

## 2. Design system & shell

| # | Sev | Finding |
|---|---|---|
| D1 | P1 | **Letter-spacing on Arabic** breaks cursive joining: ~20 `letter-spacing` rules on "kicker" labels also hit Arabic (visible: «الشرح · ٦» on Home, «آية ١ / ٢٠٠» in the reader). Tracking must only apply to Latin runs. |
| D2 | P1 | **Touch targets**: 8–32 visible controls under 32 px per screen (reader header/footer, Quick Settings segments, search results). Minimum should be 44 px on touch. |
| D3 | P1 | **Panel side is inconsistent**: Search and Notebook open on the right (next to the rail), Studio on the left. Pick one side (inline-start = right in RTL). |
| D4 | P2 | Bilingual decorative kickers («CONCORDANCE · المطابقة», «SETTINGS», «LIBRARY», «BASAIR · THE SCHOLAR'S ROOM») in an Arabic-first product — decide: drop the Latin, or keep it consistently. |
| D5 | P2 | Top bar: Quick Settings and theme toggle float alone in the far corner, away from the reader they configure; the `Ctrl K` hint is shown on phones/tablets. |
| D6 | P2 | Home (desktop) is sparse: three small cards in a large dark field; «تابع القراءة» shows an empty progress bar and no page/verse; the «بصائر» wordmark is tiny and faint. |

## 3. Other screens

| # | Sev | Finding |
|---|---|---|
| S1 | P1 | **Settings → devices**: every login creates a device; all are named «جهاز» / «نشط الآن»; the list is unbounded (85 rows in testing) and pushes reading settings below the fold. Needs device name (browser · OS), last-seen, top 3 + "show all", "sign out other devices"; reading settings first. |
| S2 | P1 | **Root map on phones**: the 10-column grid overflows the viewport (cells at x = −7 px) and the large root title overlaps its subtitle. |
| S3 | P1 | Settings offers UI languages (EN/FR/TR/ID/UR) that don't exist — the UI is Arabic-only. Hide until i18n is real. |
| S4 | P2 | Search results render each ayah in large glyphs → ~2 results per screen; add a compact density. «تابع هذا الجذر» is offered on a *word* search (ambiguous). On phones the mode chips hide the typed query. |
| S5 | P2 | Login: the password label is larger than the email label; «نسيتها؟» is a tiny target. |

## 4. Functions, performance, robustness

| # | Sev | Finding |
|---|---|---|
| F1 | P1 | **Morphology puts the whole ayah text in the URL** (`/api/morphology?…&text=…`): 2:282 produces a ~7 KB request line — nginx's default limit is 8 KB → 414 risk. Resolve server-side from `mushaf` + `ayah_id`. |
| F2 | P1 | **No HTTP caching**: glyph fonts (604 files, 48 MB) are served `max-age=0` (revalidated on every visit); Quran API responses (immutable) carry no `Cache-Control`; nginx has no gzip for JSON. |
| F3 | P2 | Code health before the reader redesign: `use-search-workspace.ts` is a 1,150-line hook mixing search, theme, mushaf and URL state; `WorkspaceProvider` is unmemoized (whole shell re-renders); `reading.css` is 1,377 lines. |

---

## 5. Proposed direction (core changes)

1. **Immersive reader.** Tap the page (or press `F`) to hide all chrome; chrome also hides on
   scroll-down and returns on scroll-up. On phones, reading is edge-to-edge (no outer card).
2. **One compact reader bar** instead of header + footer: surah · juz · page on one line, plus
   two buttons — «انتقل» (one sheet for surah / ayah / juz / page, replacing the pills, the
   select and the footer page field) and «العرض» (layout + font size). Prev/next move to swipe
   and edge tap-zones; recitation stays in the media bar.
3. **Three layouts, not five**: «صفحات» (automatic single ↔ spread), «تمرير», «آية آية».
   `single` / `spread` / `auto` are one concept; the automatic choice should be decided by the
   resulting line height, not the viewport width alone.
4. **One sizing model**: the font-size preference is the glyph size everywhere; paged mode
   fits the page, scroll and ayah honour the preference with a capped column width.
5. **Instant page turns**: prefetch the neighbouring pages' data + layout (±2 in spread) into an
   in-memory cache, and add long-lived HTTP caching for fonts and Quran API responses.
6. **Returning readers land in the reader** (resume at `last_position`); Home stays the entry
   for first visits and is one tap away.

## 6. Suggested order

| Step | Content | Size |
|---|---|---|
| 1 | Quick wins: D1 Arabic tracking, S2 root map on phones, S3 hide fake languages, D5 hide `Ctrl K` on touch, R14 footer label, R9 transient highlight | S |
| 2 | Robustness: F1 morphology by id, F2 caching (fonts immutable, API `Cache-Control`, gzip) | S–M |
| 3 | Reader core: R1/R2/R7 immersive + compact bar + «انتقل» sheet, R3 swipe, R8 prefetch | L |
| 4 | Reader sizing: R4/R5/R6/R12 one sizing model, smarter `auto`, equal spread pages, 3 layouts | M–L |
| 5 | Screens: S1 devices, D3 panel side, D2 touch targets, R10 ayah mode, S4 search density | M |
| 6 | Code health (F3) — best done as part of step 3, not separately | M |
