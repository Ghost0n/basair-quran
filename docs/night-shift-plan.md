# Q-Basair Night-Shift Plan — design & UX overhaul (master)

This is the authoritative brief for autonomous overnight `/loop` sessions. It
consolidates the user's decisions and sequences the workstreams. The reader-modes
detail lives in [`reader-modes-plan.md`](./reader-modes-plan.md).

## Decisions (authoritative — from the user)

1. **Visual latitude: bigger redesign is allowed.** Not just refine — the loop may
   restyle components, rework layouts, and evolve the visual language. Keep the
   Q-Basair soul (dignified Arabic reading room), but push quality hard.
2. **A real Home page, as the default entry.** The app should open to a Home:
   brand identity, a prominent "ask any question" bar that hands off to the Studio
   (with the query prefilled), quick-entry cards (read / search / study),
   **continue reading** (last page), and a live/rotating āyah. One click to the reader.
3. **Floating media bar replaces the recitation screen.** A persistent bottom media
   bar (current reciter · play/pause · seek · prev/next) shown across all screens;
   reciter selection moves into a sheet/popover opened from the bar. The dedicated
   `RecitationScreen` (CompanionCanvas `audio` mode) is retired.
4. **Order: reader modes FIRST.** Then the rest (recommended sequence below; the
   user will re-sequence as they wish).

## Working mode & guardrails (autonomous loop)

- One logical change per commit; **French** message; `type: [Q-Basair-5] - …`;
  **do not push**; **never commit** `data/quran.db` / `data/research_agent.db` or corpora.
- **Verify every change in-browser** (preview_* tools) + `scripts/build_web.ps1`
  green before committing. Backend up on 8001, web on 3000 (CORS needs :3000).
- Be **proactive**: fix spacing/hierarchy/empty-state/a11y issues on surfaces you
  touch. Log anything structurally large rather than silently reshaping core logic.
- **Do not break** what's already earned this branch: app-shell height cap,
  fit-to-height reader + spread + ornament, glyph save parity, cross-riwāyah adopt,
  dropdown scroll fix, compact chrome, morphology word-click, selection highlight.
- Keep contracts intact: strict research mode = Qurʾān-only; Tafssir = experimental
  & labeled; keep backend model ↔ shared types ↔ api-client ↔ frontend ↔ docs ↔
  tests aligned in the same slice when a shape changes.
- Respect `prefers-reduced-motion` (already global) for every new animation.
- Merge to `main` for this branch must carry `[rebuild-db]` (earlier `build_mushaf_layout`
  wiring); individual frontend/API phases need no deploy tag.
- Design tokens exist — **use them** (`--gold-*`, `--fg-*`, `--bg-elev-*`, `--r-*`,
  `--shadow-*`, `--dur*`, `--ease-*`, `--fs-*`, `--sp-*`). Don't hardcode.

## Recommended sequence

1. **Reader modes** (chosen first) → `reader-modes-plan.md` phases 1-7.
2. **Motion & fluidity pass** (foundational — later surfaces inherit it).
3. **Floating media bar** (self-contained, high value, replaces recitation screen).
4. **Home landing + command-bar "ask" → Studio**.
5. **Redesign polish pass** (component restyle, hierarchy, empty states, a11y),
   plus proactive fixes folded into every workstream above.

---

## Workstream A — Reader modes  ⟶ see reader-modes-plan.md (FIRST)

single / two-page (have) + continuous scroll (fit-to-width, fills 16:9) + ayah-by-ayah
list + Quick-Settings switcher + per-viewport smart defaults. Full spec + tasks in
`reader-modes-plan.md`. Add mode-change transitions here or in the motion pass.

## Workstream B — Motion & fluidity pass

Goal: make the app feel alive and fluid using the existing motion tokens; nothing
gratuitous. All gated by `prefers-reduced-motion`.

Targets (from the audit):
- **Theme toggle**: 200–240ms cross-fade on `body` background/color (currently instant).
- **Overlays** (onboarding, export, shortcuts, quick-settings, morph-popover):
  opacity + `scale(0.96→1)` entrance at `--dur`/`--ease-out`; backdrop fade.
- **Panels** (studio/concordance/companion slide-ins): `translateX` in from the
  RTL edge at `--dur`.
- **Mode/route change**: subtle cross-fade/slide when the canvas swaps screens.
- **List mounts** (search results, verse rows, library rows): opacity + `translateY(8→0)`
  staggered ~30–40ms/item (cap the count; CSS `animation-delay` via index var).
- **Buttons**: `:active { transform: scale(0.98) }` tactile feedback, universal.
- **Progress/seek**: smooth progress fill; seekable bar (ties into media bar).
- Consider a light `@keyframes qbPulse` for indeterminate loading beyond shimmer.

Files: `globals.css`, `tokens.css`, feature CSS, overlay components. Verify no
layout shift, reduced-motion collapses cleanly, 60fps feel.

## Workstream C — Floating media bar (replaces recitation screen)

Goal: a persistent bottom media bar, global across all screens, with a reciter
sheet — retire the dedicated recitation screen.

What already exists (reuse — the hard part is done):
- `RecitationProvider` is mounted **above** the routes (`shell.tsx`) with a single
  global `<audio>`; state persists across every screen.
- State: `reciters`, `reciterId`/`reciter`, `current {surah,ayah}`, `isPlaying`,
  `progress`, `speed`, `repeatAyah`. API: `setReciter`, `setSpeed`, `toggleRepeat`,
  `playAyah`, `toggle`, `stop`, `next`, `prev`.
- Wired footer `AudioMiniPlayer` (reference for building the bar).
- Reciters via `api.getReciters()`; audio URL = `${audio_base}/[SSS][AAA].mp3` (everyayah).

To build:
- `add seek(ratio: number)` to the recitation context (`audio.currentTime = duration*ratio`).
- New `<RecitationBar>` mounted in the Shell (global, above canvas), slim by default,
  visible when `current !== null` (or persistent slim). Transport + reciter chip +
  seekable progress + speed/repeat; expandable.
- `<ReciterSheet>` (bottom sheet / popover from the bar) for browsing/picking the
  50+ reciters (search/filter). Reuse the current reciter list styling.
- Retire `RecitationScreen` + the `audio` CompanionCanvas branch; the rail
  "التلاوة" opens the reciter sheet (or focuses/expands the bar).
- Follow-along: keep the reader ↔ playback link (playing an āyah highlights/loads it).
- Responsive: don't overlap the reader footer / mobile tab bar; account for the
  app-shell height cap (the bar takes a fixed slice; reader area recomputes).

Verify: playback persists across every mode; seek works; reciter sheet filters;
mobile layout clean; no double audio; footer mini-player either removed or kept in sync.

## Workstream D — Home landing + command-bar "ask"

Goal: a real default Home + deliver the command bar's unfulfilled "اسأل" promise.

- New shell mode `home` (default). `mode-context` default → `home`; returning readers
  with a saved last page may deep-link to reading (decide: Home-always vs Home-for-idle;
  the user picked "a real Home (default)", so default to Home, with a prominent
  "تابع القراءة" continue button).
- Home content: brand/hero; **ask bar** (natural-language) that routes to Studio with
  the text prefilled + submitted; quick-entry cards (read / search / study);
  continue-reading (last page + surah); a rotating/verse-of-the-moment; maybe light
  stats (saved āyāt, followed roots) and recent sessions.
- **Command-bar intent routing**: detect a question / "ask" intent (vs root/word/ayah
  jump) and route to Studio prefilled — the placeholder already promises "اسأل".
  Start with a heuristic (length / question words / a leading "؟" or mode chip),
  keep search/navigate behavior for the rest.
- Onboarding: fold into / align with the new Home so first-run feels cohesive.

Files: `app/(shell)/page.tsx`, `mode-context`, `left-rail`, `command-bar`,
`use-search-workspace`, new `features/home/*`. Keep shared types/docs aligned.

Verify: Home is the default; ask→Studio prefilled works; continue-reading lands on
last page; quick cards route correctly; mobile layout; no regression to search.

## Workstream E — Redesign polish

Proactive + a dedicated pass: consistent spacing/rhythm, type hierarchy, empty
states, focus/hover states, a11y (roving tabindex in lists/readers, ARIA, contrast),
and cohesion across the (now bolder) surfaces. Update `README.md` +
`docs/authentic-mushaf-reader.md` where user-visible behavior changes.

## Verification cadence (every phase)

- `scripts/build_web.ps1` green; no console errors.
- In-browser at 1920×1080, ~800 (tablet), 375 (mobile).
- Confirm the "do not break" list still holds (reader correctness, save, cross-riwāyah,
  dropdowns, shell containment).
- Targeted tests where logic changes (preferences, intent routing, seek).
