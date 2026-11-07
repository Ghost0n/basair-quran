# Refonte design web (Q-Basair-55) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the web app's "liquid glass" look with the design language of the approved prototype (the public landing page's language carried into every screen), keeping every existing feature, API call and behaviour.

**Execution:** native (implemented in-session, task by task), one whole-branch review at the end.

**Architecture:** Presentation-only port on `feat/Q-Basair-55-refonte-design-web` (from `feat/Q-Basair-52-mobile-native-ux-ipa`). Phase A lays the foundation once — tokens, a flat material replacing glass under the same class names, shared React primitives (ribbon, rosette), the shell and the room layout. Phase B ports each screen inside its own feature folder (independent, parallelisable). Phase C adds the new interface strings to the 23 locales and verifies the whole branch.

**Tech Stack:** Next.js (App Router) + React + TypeScript, plain CSS per feature, Vitest (node environment, `*.test.ts` only — no DOM library: test pure functions, and markup with `react-dom/server` `renderToStaticMarkup`; interactions are checked in the browser), the i18n layer in `apps/web/lib/i18n` (gettext-style Arabic ids, `t()` / `tn()`).

**Spec:** `design/prototype-web-full/` — `index.html` + `core.css` + `core.js` + `screens/*` (the approved, clickable design; open with `python -m http.server 3012` there, `local.html#<screen>`), `BUILDING.md` (design rules), `INVENTORY.md` (every production capability that must survive). The prototype → app screen map is in Task 0.

## Global Constraints

- **Web only (owner, 2026-10-21).** Phone layouts and the native apps keep today's design untouched; they will be discussed later. Gate: `<html class="qb-web">`, set before first paint by an init script when `!APP_MODE` and `!matchMedia(PHONE_QUERY)` (`lib/use-phone-layout.ts`), and kept in sync on resize. All new CSS goes in new `*.web.css` files whose every rule is scoped under `.qb-web` (tokens under `html.qb-web body` / `html.qb-web body.light`). **Existing CSS files are not edited.** Structural TSX changes are gated by `useWebDesign(): boolean` (`lib/use-web-design.ts`); the non-web branch renders today's markup unchanged.
- **Only the authentic Madani Mushaf (owner).** Reader pages stay the QCF V1 glyph pages (Hafs, King Fahd Madani layout) — never re-render a page with a text font, never add another narration or text source. The prototype's Amiri-text page was a stand-in.
- **Reader pages are stabilized (owner).** Do not touch `glyph-page.tsx`, `paged-reader.tsx`, page fit/spread/turn logic, page sizing, or the page rules of `reading.css`. Only the chrome around the page (reader bar, display strip, selection bar, tools chrome, the new study panel, overlays) is redesigned. The study panel opens only on a selection or an explicit toggle, so plain reading keeps the full width it has today.

- Keep every feature, state, API call and keyboard shortcut listed in `INVENTORY.md`. This is a redesign, not a rewrite: change markup/CSS/presentational components; do not touch hooks' data flow, backend, `packages/*`, or `src/`.
- Colours only through tokens in `apps/web/app/tokens.css` (dark first + `.light`). No hex in components or feature CSS (CLAUDE.md rule).
- Gold means "you" (your place, selection, matches) or "act" (primary actions). Teal = research world, copper = community world and Tafssir. Semantic `--ok/--warn/--bad/--info` only for state.
- Type: Amiri Quran for Quran text only (never inside a gradient, line-height ≥ 2); Amiri for headings; Cairo for UI. Quran quotes in UI text keep `.qb-quran-snip`.
- Logical CSS only (`inline-start/end`, `margin-inline`, `inset-inline`): the app runs in 21 LTR locales too. Mushaf stage and page keep `direction: rtl`.
- Every new visible string goes through `t()` / `tn()` (counted phrases via `tn`, Arabic plurals in `lib/i18n/plurals-ar.ts`). Feature tasks only add Arabic ids; Task 16 adds the translations.
- Signature devices: the 114-bar ribbon (`components/ribbon`) for any distribution across surahs; the rosette (`components/girih`) at most once per screen; word-by-word reveal only for a hero verse. One bold element per screen.
- No SaaS card kit: hairline lists and open layouts; one panel only where a region is a separate object. Radii by role: controls 10px, panels 18px, pills 999.
- No template tells: no all-caps eyebrows, no `01/02/03` unless sequential, no emoji, no "→" glued to labels, no " · "-joined meta strings in new copy.
- Phones and the Capacitor app share this bundle: everything above is gated by `.qb-web` / `useWebDesign()`, so they are unaffected.
- `prefers-reduced-motion` stops all motion; visible keyboard focus; no horizontal page scroll at 400px.
- No new dependencies.
- Commits: `feat: [Q-Basair-55] - <verbe à l'impératif, en français>`, one logical change each; never `--no-verify`.

## Review Focus

- **LTR locale (`en`) layout:** rails, panels, ribbons and bars mirror correctly; the ribbon still reads Al-Fātiḥa → An-Nās in the reading direction of the Mushaf (right to left) in every locale. Test: `ribbon.test.ts` › "keeps surah order independent of dir"; visual check in Task 17.
- **Long translated labels** (de, ru) in rail items, tabs and buttons wrap or truncate without breaking layout. Check in Task 17 with `en` and `de`.
- **Phone / Capacitor untouched:** at 390×844 and in an APP_MODE build nothing changes (no `qb-web` class, no new markup). Test: `use-web-design.test.ts`; visual check in Task 17.
- **Light theme contrast:** gold text on parchment and faint ribbon bars stay legible (WCAG AA for text). Check in every screen task.
- **Numerals setting:** every number the redesign adds (ribbon readouts, figures, page numbers) uses `useNumerals()`; switching to Latin/Persian digits updates them. Test: `ribbon.test.ts` › "formats readout with the numerals helper".

---

### Task 0: Branch, spec in the repo, design-system doc

**Files:**
- Create: `design/prototype-web-full/**` (copy of the approved prototype; already on disk, untracked)
- Modify: `docs/design-system.md` (rewrite: replace "liquid glass" with the new language)
- Create: `docs/superpowers/plans/2026-10-21-refonte-design-web.md` (this plan)

Prototype → app map (put it in `docs/design-system.md`):

| Prototype screen | App files |
|---|---|
| core (rail, topbar, room, dock, sheets, toasts) | `features/shell/*`, `app/glass.css`, `features/recitation/recitation-bar.tsx`, `recitation.css` |
| home | `features/home/*` |
| reader (+ study panel) | `features/reading/*` (mushaf-stage, components/reader-bar, display-strip, tools/*, glyph-page, ayah-reader) |
| index / saved / «انتقل» | `features/reading/components/navigate-sheet.tsx`, `features/reading/reading-pages.tsx` |
| search / heatmap | `features/concordance/*` |
| study | `features/studio/*`, `features/export/*` |
| notebook + save sheet | `features/companions/*`, `features/themes/*` |
| board | `features/board/*` |
| document | `features/documents/*` |
| community / post | `features/community/*` |
| settings / account | `features/settings/*`, `features/identity/*`, `features/auth/*`, `features/onboarding/*` |

- [ ] **Step 1:** `git add design/prototype-web-full docs/superpowers/plans/2026-10-21-refonte-design-web.md` and rewrite `docs/design-system.md` (principles from the Global Constraints, the token table of Task 1, the primitives of Task 2, the map above).
- [ ] **Step 2: Commit** `docs: [Q-Basair-55] - Ajoute le prototype approuvé et le plan de la refonte`

### Task 1: Web gate, tokens and the flat material

**Files:**
- Create: `apps/web/lib/use-web-design.ts` (+ `use-web-design.test.ts`), `apps/web/app/web-design.css`
- Modify: `apps/web/app/layout.tsx` (init script + import), `features/shell/shell.tsx` (keep the class in sync)

**Interfaces (Produces):**
- `WEB_DESIGN_INIT_SCRIPT: string` (sets/removes `qb-web` on `<html>` before paint), `isWebDesign(appMode: boolean, phone: boolean): boolean`, `useWebDesign(): boolean` (SSR-safe false).
- In `web-design.css`, scoped `html.qb-web body` (dark) and `html.qb-web body.light`: new tokens `--world`, `--world-soft`, `--teal(-soft)`, `--copper(-soft)`, `--th-green|blue|pink|purple|teal|sand|gold|gray`, `--ok|warn|bad|info(-soft)`, `--gold-line`, `--gold-soft`, `--gold-glow`, `--gold-here`, `--gold-grad`, `--bar-on`, `--bar-off`, `--btn-grad`, `--on-gold`, `--scrim`, `--r-ctl: 10px`, `--r-panel: 18px` (values from `design/prototype-web-full/core.css`), and the flat material for the shared glass classes (`.qb-glass`, `.qb-glass-strong`, `.qb-glass-bar`, `.qb-btn`, `.qb-segmented`, `.qb-icon-round`, `.qb-chip`, `.qb-empty`, `.qb-toast-inline`): solid `--bg-elev-*`, hairline `--border-strong`, `backdrop-filter: none`, shadow only on panels.

- [ ] **Step 1: Failing test** `use-web-design.test.ts`: `isWebDesign(false,false)` true; `(true,false)` false; `(false,true)` false; `WEB_DESIGN_INIT_SCRIPT` contains the exact `PHONE_QUERY` string; every selector in `web-design.css` (read as text) starts with `html.qb-web` or `.qb-web`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; build; desktop `/` flat in dark/light; at 390px wide nothing changed.
- [ ] **Step 5: Commit** `feat: [Q-Basair-55] - Introduit la porte web et la matière plate de la refonte`

### Task 2: Shared primitives — ribbon, rosette, gold figures

**Files:**
- Create: `apps/web/components/ribbon.tsx`, `apps/web/components/ribbon.css`, `apps/web/components/ribbon.test.ts`
- Create: `apps/web/components/girih.tsx` (moved from `features/site/landing/pattern.tsx`; landing re-exports it)
- Modify: `apps/web/features/site/landing/pattern.tsx`, `root-ribbon.tsx` (use the shared ribbon pieces where it is a drop-in)

**Interfaces (Produces):**
- `ribbonHeights(counts: number[], opts?: { flat?: boolean }): number[]` — heights 0–1: `flat` → `count ? 1 : 0.32`; else `count ? 0.12 + 0.88 * sqrt(count / peak) : 0.05`.
- `<Ribbon counts: number[] here?: number focus?: number | null flat?: boolean grow?: boolean height?: number label: string readout?: (i: number) => string restReadout?: string onPick?: (i: number | null) => void />` — 114 bars, Al-Fātiḥa at the inline-start of the RTL axis regardless of page `dir` (the ribbon root forces `direction: rtl`); hover/focus readout; with `onPick`: click, drag (pointer capture) and ArrowLeft/ArrowRight/Escape pick; axis row with first/last surah names and the readout.
- `<MiniRibbon counts: number[] />` — 114px, no gaps.
- `<Girih className?: string drawn?: boolean />` — the landing rosette (same geometry), drawn once when `drawn`.
- CSS classes `.qb-gold-num`, `.qb-letters`, `.qb-word-in` (hero reveal) in `ribbon.css` (shared visual primitives).

- [ ] **Step 1: Write failing tests** in `ribbon.test.ts`: `ribbonHeights([0,4,16])` → `[0.05, 0.12+0.88*0.5, 1]`; `ribbonHeights([0,3],{flat:true})` → `[0.32,1]`; "keeps surah order independent of dir": `renderToStaticMarkup(<div dir="ltr"><Ribbon counts={114 counts} label="x" /></div>)` — the first `.qb-ribbon-bar` has `data-i="0"` and the ribbon root carries the `qb-ribbon` class whose CSS sets `direction: rtl` (assert the class and, reading `ribbon.css` as text, the rule); "formats readout with the numerals helper": with `here={44}` and `readout={(i)=>\`n${i}\`}`, the axis markup contains `n44`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; landing `/about` still renders the root ribbon and rosette.
- [ ] **Step 5: Commit** `feat: [Q-Basair-55] - Partage le ruban des sourates et la rosace entre les écrans`

### Task 3: Shell, worlds, room layout, recitation bar

**Files:**
- Modify: `features/shell/shell.css`, `left-rail.tsx`, `top-bar.tsx`, `command-bar.tsx`, `worlds.css`, `workspace-canvas.tsx`, `shortcuts-modal.css`, `features/identity/account-menu.css`, `features/recitation/recitation-bar.tsx`, `features/recitation/recitation.css`
- Create: `features/shell/use-room-wide.ts` (+ `use-room-wide.test.ts`)

**Interfaces:**
- Consumes: Task 1 tokens, Task 2 nothing.
- Produces: `useRoomWide(): [wide: boolean, setWide: (on: boolean) => void]` (session-scoped, per shell mode); `<RoomWideToggle />` button for panel headers (labels «وسّع اللوحة» / «أظهر المصحف»). Room layout: the panel sits on the inline-end side of the Mushaf (prototype), width per mode via `--panel-w` (search 560, studio 600, notebook/index/saved 560), top hairline in `--world`; `wide` hides the Mushaf. Kicker class `.qb-kicker` coloured `--world`.
- Rail: prototype order and labels (already production), flat column with hairline, active item = gold text + 2px gold indicator line with glow (no gel); account medallion at the bottom.
- Top bar: crumbs (Amiri title + subtitle) + command bar (flat field, `Ctrl K` kbd hint).
- Recitation bar: the prototype dock (segmented verse track, chips for speed/repeat/range, reciter as Amiri name) keeping every control of INVENTORY §4.

- [ ] **Step 1: Write failing test** `use-room-wide.test.ts`: default `false`; `setWide(true)` → `true`; resets when the shell mode changes.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement hook + restyle. **Step 4:** Run → PASS; visual: `/?mode=search` shows the panel beside the Mushaf with a teal hairline, toggle widens it; recitation bar shows the segmented track; `/?mode=search` in `en` mirrors correctly.
- [ ] **Step 5: Commit** `feat: [Q-Basair-55] - Redessine le cadre, le rail et la barre de récitation`

> Tasks 4–15 are independent of each other (each owns its feature folder) and can run in parallel after Task 3. Each one: port the screen from the prototype, keep every INVENTORY capability, check dark/light/`en`/400px, commit. Shared helpers they need are in Tasks 1–3; anything else stays inside the feature folder.

### Task 4: Home

**Files:** `features/home/home-screen.tsx`, `home.css`, `greeting.ts` (logic unchanged)
- Hero: rotating-verse slot becomes the verse-of-the-day hero (Amiri Quran, `.qb-word-in` reveal over `<Girih drawn>`, first translation chosen in settings under it when available, actions «اقرأها في سياقها» / «استمع»). Keep the 5-verse rotation on wide screens (reveal replays per verse).
- «تابع القراءة»: surah + `.qb-gold-num` page «٥٠٠ من ٦٠٤», flat `<Ribbon>` of surahs read (`here` = current), actions «تابع» + «استمع من حيث توقفت»; first-run variant unchanged.
- Tiles become the aside lists (الفهرس, تابع دراستك, المحفوظة, المجتمع with its dot) + the search pill; every Settings › «الرئيسية» switch still hides its block.
- [ ] Test `home-sections.test.ts`: pure `visibleHomeBlocks(sections): HomeBlock[]` — all true → all 8 blocks in order; `{saved:false}` → every block but `saved`. Implement (home-screen renders from it), visual check, commit `feat: [Q-Basair-55] - Refond l'accueil autour du verset du jour et du ruban`.

### Task 5: Reader and the study panel

**Files:** `features/reading/mushaf-stage.tsx`, `reading.css`, `components/reader-bar.tsx`, `components/display-strip.tsx`, `components/glyph-page.tsx`, `ayah-reader.tsx`, `tools/*`, `tools/tools.css`; Create `features/reading/components/study-panel.tsx` (+ `study-panel.css`), `features/reading/study-panel-model.ts` (+ `study-panel-model.test.ts`)
- Reader bar, page frame (double hairline), surah title frame, verse markers, progress line, page ribbon bookmark, focus pill, travel overlay: prototype `screens/reader.*`.
- Study panel (new, wide screens in `reading` mode, collapsible, under 1000px stacks under the Mushaf): selected word → word, facts (الجذر/الأصل/القسم/الإعراب + features from the existing morphology call), root letters + figures + `<Ribbon>` of `GET /api/root-distribution` (click a bar → search that root), meaning tabs for chosen translations, actions «كل المواضع» / «احفظ» (save-ayah sheet) / «اسأل الدراسة»; nothing selected → surah facts + saved verses on this page.
- Selection bar, tools, «العرض» strip, recitation highlighting (recited word glow, other verses fade): prototype styles; behaviour unchanged.
- [ ] Test `study-panel-model.test.ts`: pure `studyPanelView(selection, morph): {kind:'page'} | {kind:'word', root: string | null, letters: string[]} | {kind:'range'}` — no selection → `page`; a word with root `بصر` → `word` with letters `['ب','ص','ر']`; a word without root → `word` with `root: null`; several words → `range`. Implement (reuse existing morphology/root-distribution hooks), visual, commit `feat: [Q-Basair-55] - Ajoute le panneau d'étude à côté du mushaf et redessine le lecteur`.

### Task 6: Index, saved, «انتقل»

**Files:** `features/reading/components/navigate-sheet.tsx`, `features/reading/reading-pages.tsx`, their CSS; Create `features/reading/surah-filter.ts` (+ test)
- `surahFilter(index, kind: 'all'|'meccan'|'medinan'): Set<number>`; Surahs tab gets the surah-length `<Ribbon>` (ayah counts, Medinan strip, filter chips الكل/مكّيّة/مدنيّة dim bars + filter list, click bar scrolls list). Juz/hizb grids typographic; saved pages list per prototype `screens/navigate.*`.
- [ ] Test `surah-filter.test.ts`: meccan count 86, medinan 28 on `/api/surahs` fixture. Implement, visual, commit `feat: [Q-Basair-55] - Redessine le sommaire avec le ruban des longueurs de sourates`.

### Task 7: Search (concordance) and heatmap

**Files:** `features/concordance/concordance-panel.tsx`, `heatmap-screen.tsx`, `concordance.css`; Create `features/concordance/forms.ts` (+ test)
- `wordForms(verses: {text: string; highlights: number[]}[]): {form: string; shown: string; count: number}[]` — highlights are **1-based** word positions; diacritics-stripped grouping, sorted by count desc.
- Summary (big `.qb-letters`, figures, follow, heatmap link), live `<Ribbon onPick>` surah filter with removable chip, forms facet, result rows (▶, pin, Amiri Quran with gold `mark`), group pager; wide panel layout per prototype `screens/search.*` (container query). Heatmap: 7-level grid via `color-mix` of `--gold`, top 4, second lens = `<Ribbon>`.
- [ ] Test `forms.test.ts`: two verses highlighting «أَبۡصَٰرِهِمۡ» and «يُبۡصِرُونَ» → two forms with counts; position 1 maps to the first word. Implement, visual, commit `feat: [Q-Basair-55] - Filtre la concordance par sourate et par forme`.

### Task 8: Study (Studio)

**Files:** `features/studio/*`, `features/export/export.css`
- Thread typeset (no bubbles for answers), «السؤال» quote rule, evidence list with numbered citations, inline `[n]` buttons that scroll+flash the evidence, `<MiniRibbon>` of cited surahs under the evidence, mode tabs gold/copper with the exact disclaimer, depth chips, composer, session tabs, sessions sheet, export modal: prototype `screens/study.*`.
- [ ] Test `citations-ribbon.test.ts`: `citedSurahCounts(evidence)` returns 114 counts. Implement, visual (strict + Tafssir), commit `feat: [Q-Basair-55] - Redessine l'étude, ses citations et son ruban des sources`.

### Task 9: Notebook and the save-and-highlight sheet

**Files:** `features/companions/*`, `features/themes/*`
- Tabs, verse rows with theme dots, by-theme sections + `<Ribbon>` of where saved verses sit (click filters), boards/documents/sessions/roots rows with `<MiniRibbon>` for roots; «حفظ وتظليل» sheet per prototype (chips with colour, swatches from `--th-*`).
- [ ] Test `saved-spread.test.ts`: `savedSurahCounts(items)` → 114 counts. Implement, visual, commit `feat: [Q-Basair-55] - Redessine le carnet et la feuille d'enregistrement`.

### Task 10: Board

**Files:** `features/board/board.css`, `board-nodes.tsx`, `board-style.ts`, `board-screen.tsx` (React Flow kept)
- Drafting-table surface (dotted bg tokens, faint `<Girih>` at origin), ayah nodes as mushaf excerpts, hairline gold edges with relation pills (dash style per relation), flat toolbars and style panel per prototype `screens/board.*`.
- [ ] Verification only (no new logic): every tool of INVENTORY §10 clicked once in dark/light; commit `feat: [Q-Basair-55] - Redessine la table de travail des planches`.

### Task 11: Research document

**Files:** `features/documents/*`
- Paper column (Amiri headings, Amiri Quran verses with markers), outline rail on wide screens, audit box with ok/warn pills, sections chrome, ayah picker, references, share studio live card (night/paper styles keep their own palette via scoped tokens `--card-night-*`, `--card-paper-*` added in `documents.css`), publish sheet: prototype `screens/document.*`.
- [ ] Verification: audit, share studio, publish outcomes in dark/light; commit `feat: [Q-Basair-55] - Met en page la recherche comme un article`.

### Task 12: Community and post

**Files:** `features/community/*`; Create `features/community/feed-spread.ts` (+ test)
- `feedSurahCounts(posts): number[]` (cited verses per surah); hero + `<Ribbon onPick>` filter, editorial single-column feed, guidelines side column, moderation tab, post page as a paper, comments, report dialog: prototype `screens/community.*`; copper world marks.
- [ ] Test `feed-spread.test.ts`. Implement, visual (guest + admin), commit `feat: [Q-Basair-55] - Redessine le flux de la communauté et la page d'un article`.

### Task 13: Settings

**Files:** `features/settings/*`, `features/identity/account-settings.*`
- Two-column page with scroll-spy section index, hairline sections, rows label/description/control; medal picker grid; devices list: prototype `screens/settings.*`.
- [ ] Visual + keyboard check; commit `feat: [Q-Basair-55] - Redessine les réglages`.

### Task 14: Sign-in, sign-up, reset, welcome, merge toast

**Files:** `features/auth/*`, `features/onboarding/*`, `features/identity/merge-toast.*`
- Split layout (brand side: mark, wordmark, rosette, 45:20; form side), welcome steps, merge toast with countdown ring: prototype `screens/settings.*` (`account`).
- [ ] Visual for every tab and error; commit `feat: [Q-Basair-55] - Redessine l'entrée et l'accueil des nouveaux comptes`.

### Task 15: (removed — mobile is out of scope for this branch)

### Task 16: Interface strings in 23 locales

**Files:** `apps/web/lib/i18n/locales/*.json`, `lib/i18n/plurals.json`, `plurals-ar.ts`
- [ ] **Step 1:** `pnpm --filter @q-basair/web i18n:check` → lists missing ids (expected FAIL).
- [ ] **Step 2:** Add each new id to every locale (machine draft, same style as existing entries; counted phrases with the locale's CLDR categories).
- [ ] **Step 3:** `i18n:check` → PASS; `pnpm --filter @q-basair/web test` → PASS.
- [ ] **Step 4: Commit** `feat: [Q-Basair-55] - Traduit les libellés de la refonte dans les 23 langues`

### Task 17: Whole-branch verification

- [ ] `pnpm --filter @q-basair/web test` → all pass. `pnpm --filter @q-basair/web build` → succeeds. `python -m pytest -q` (backend untouched) → passes.
- [ ] Visual pass against the prototype for every screen: dark, light, `en` (LTR), `de` (long labels), 400px, reduced motion. Fix regressions in the owning task's folder.
- [ ] `grep -rn "#[0-9a-fA-F]\{3,6\}" apps/web/features --include=*.css` → no new hex outside documented exceptions.
- [ ] Update `docs/design-system.md` screenshots/notes if anything changed; commit `docs: [Q-Basair-55] - Met à jour le système de design après la refonte`.
