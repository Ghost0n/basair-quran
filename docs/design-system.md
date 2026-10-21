# Design system

Two design languages coexist while the redesign is rolled out:

- **The web design (2026-10, Q-Basair-55)** for the desktop web: the language of the public landing
  page carried into every screen. It is the target design.
- **Liquid glass** for phones and the native apps, until their redesign is agreed (below, from
  «Design system — liquid glass»).

## The web design (desktop web)

Source of truth: the approved prototype `design/prototype-web-full/` (open `local.html#<screen>`
after `python -m http.server 3012` in that folder): `BUILDING.md` holds its rules, `INVENTORY.md`
every production capability it covers. Plan: `docs/superpowers/plans/2026-10-21-refonte-design-web.md`.

### Where it applies

- `<html class="qb-web">` is set before first paint (`lib/use-web-design.ts`,
  `WEB_DESIGN_INIT_SCRIPT`) when the build is not the native app (`APP_MODE`) and the screen is not
  a phone (`PHONE_QUERY`). Components read it with `useWebDesign()`.
- Every rule of the web design lives in a `*.web.css` file and is scoped under `.qb-web`; its tokens
  are set on `html.qb-web body` and `html.qb-web body.light` (`app/web-design.css`). Existing CSS is
  not edited, so phones and the native apps keep the liquid-glass look unchanged.

### Principles

- **The Mushaf is the room.** On wide screens the Mushaf stays; Search, Study, the Notebook, the
  Index and Saved open as a panel beside it, which can widen to full width.
- **Only the authentic Madani Mushaf.** Reader pages are the QCF V1 glyph pages (Hafs). The page
  rendering, fit, spreads and turning are stabilized and are not part of the redesign; only the
  chrome around the page is.
- **Gold means "you" or "act".** Your place, your selection, matched words and primary actions.
  Worlds tint small marks only (`--world`: gold for reading, teal for research, copper for
  community); copper also marks Tafssir. Semantic `--ok/--warn/--bad/--info` are for state only.
- **Quiet surfaces.** Flat `--bg-elev-*` surfaces, hairline borders, hairline lists instead of card
  grids, one panel where a region is a separate object. Radii by role: controls 10px, panels 18px,
  pills 999.
- **Signature devices from the landing page.** The 114-bar surah ribbon (`components/ribbon.tsx`) is
  the one instrument for "where in the Quran"; the rosette (`components/girih.tsx`) appears at most
  once per screen; the word-by-word reveal is for a hero verse only.
- **Type.** Amiri Quran for Quran text (never in a gradient), Amiri for headings, Cairo for UI.
  Numbers go through the numerals preference.

### Prototype → app

| Prototype screen | App files |
|---|---|
| core (rail, top bar, room, dock, sheets, toasts) | `features/shell/*`, `features/recitation/recitation-bar.tsx` |
| home | `features/home/*` |
| reader (+ study panel) | reader chrome in `features/reading/*` (not the page itself) |
| index / saved / «انتقل» | `features/reading/components/navigate-sheet.tsx`, `features/reading/reading-pages.tsx` |
| search / heatmap | `features/concordance/*` |
| study | `features/studio/*`, `features/export/*` |
| notebook + save sheet | `features/companions/*`, `features/themes/*` |
| board | `features/board/*` |
| document | `features/documents/*` |
| community / post | `features/community/*` |
| settings / account | `features/settings/*`, `features/identity/*`, `features/auth/*`, `features/onboarding/*` |

# Design system — liquid glass

Q-Basair's UI is one material and a few primitives, defined once in `apps/web/app/glass.css`
(tokens in `app/tokens.css` / `app/tokens-motion.css`).

## Principles

- **Glass is for chrome, never for the Quran.** Bars, rails, sheets, popovers, panels and cards
  are translucent. Mushaf pages and quoted ayahs stay opaque, with high contrast and no blur behind
  the text.
- **One material everywhere.** Every floating surface uses the same four layers: a tint
  (`--glass-tint*`) over a backdrop blur, a specular sheen on the top edge (`--glass-sheen`), a
  hairline rim (`--glass-rim`), and a soft depth shadow (`--glass-shadow`, `--glass-shadow-lift` on
  hover or when raised).
- **Gold means action or selection.**
  - Primary actions use the glossy **gold gel** (`--gold-gel` + `--gold-gel-shadow`).
  - A selected segment, tab, filter or rail item uses the **tinted gel** (`--seg-on-bg` +
    `--seg-on-shadow`).
  - Tafssir (experimental) states use the copper variant (`--seg-copper-bg`).
- **Ambient light.** The page carries slow, very soft colour fields (`--aurora-*`) so translucency
  reads as glass rather than grey.

## Surfaces

| Surface | Treatment |
|---|---|
| Rail (desktop) | Floating glass column, inset 10px, radius 26px; the active item is a lit gel with a springy icon pop |
| Command bar | Glass capsule; a gold focus ring in search mode |
| Reader / board / document / post bars | Glass capsules (radius 22px) |
| Tab bar (phones) | Floating glass dock (radius 24px) above the safe area |
| Side panels (search, Studio, concordance) | Floating glass panes beside the mushaf (radius 26px) |
| Sheets, popovers, menus | Strong tint (`--glass-tint-strong`), `--glass-blur-strong` (40px), spring entrance |
| Cards | Glass material with lighter shadow; they lift 2px on hover |
| List rows inside a glass pane | Tint + sheen only (no nested blur, for performance) |

## Typography

Three faces, each with one job:

| Face | Token | Used for |
|---|---|---|
| Amiri Quran | `--font-arabic-display` | Quran text only (mushaf, ayah cards, verse snippets via `.qb-quran-snip`) and the brand wordmark |
| Amiri | `--font-arabic-heading` | Titles, surah and reciter names, card headings |
| Cairo | `--font-arabic-ui` | Everything else: body, buttons, inputs, labels, meta |

- Form controls inherit the page font (`button, input, select, textarea { font-family: inherit }`).
- Title tiers: `--fs-title-page` (clamp 28–38px), `--fs-title-section` (22px),
  `--fs-title-card` (19px). Titles use `--lh-heading` (1.6) so Arabic marks above and below the
  line are not cut.
- A Quran quote shown inside UI text must be wrapped in `.qb-quran-snip`; Cairo has no glyphs for
  the Uthmani marks and renders boxes.
- **No cropped titles.** A single-line ellipsis title sets `overflow: hidden; overflow-x: clip;
  overflow-y: visible;` so only the inline axis is clipped.
- Clamped Quran text that a reader may need whole offers a toggle (the theme mini-verses' «الآية
  كاملة»); a clamped excerpt that opens its full page (a feed card) needs none. A line-clamped block adds
  `padding-block: 0.3em`; a clamped Quran snippet uses line-height 2.

## Glass tokens

`--glass-blur` 30px and `--glass-blur-strong` 40px with `--glass-saturate` 185%. Tints are kept
low (dark 0.44 / 0.66 / 0.26, light 0.48 / 0.72 / 0.32 for base / strong / soft) so the ambient
light shows through; `--glass-edge` adds a top highlight, an inner glow and a soft bottom inset.
The mushaf page and Quran text stay opaque.

- **Phones and touch screens** (`max-width: 640px` or `pointer: coarse`) use a lighter radius
  (20px / 26px, saturation 165%) so scrolling stays smooth on modest GPUs.
- **Reduced transparency:** the system's `prefers-reduced-transparency: reduce`, or the per-device
  choice «الشفافية ← مُعتِمة» in Settings (`<html data-transparency="reduced">`, stored in
  `localStorage` as `qb.transparency` and applied before first paint), makes every tint opaque and
  removes all backdrop filters.

## Primitives

- `.qb-glass`, `.qb-glass-strong`, `.qb-glass-bar`: the material.
- `.qb-btn` (plus `primary`, `ghost`, `ok`, `warn`, `danger`, `block`, `like`): buttons. They
  press to 0.97 scale.
- `.qb-icon-round`: round icon buttons.
- `.qb-segmented`, `.qb-pill`, `.qb-lib-tabs`: segmented controls, all sharing the same track
  and selected gel.
- `.qb-chip`: small labels.
- `.qb-empty`, `.qb-skeleton-list`, `.qb-toast-inline`: empty, loading and feedback states.

## Motion

- **Cross-mode navigation** runs inside a View Transition: the page cross-fades with a slight
  depth move, and the shared omnibar morphs between Home and the top bar.
- **Screens** settle in with `qbPageEnter`; lists and cards rise with `qbRise`, staggered 30–60ms
  and capped.
- **Springs** (`--spring`, `--spring-soft`) are for selection changes, sheet entrances and icon
  pops. Presses scale to `--press-scale`.
- **`prefers-reduced-motion`** turns off every movement (aurora drift, rises, springs, view
  transitions). Opacity changes remain.
- **No backdrop-filter support:** surfaces fall back to the strong tint.

## Rules for new UI

1. Use the primitives above instead of new one-off button, segment or card styles.
2. Never put a hard-coded gold gradient in a component: use `--gold-gel` or the selected gel.
3. Keep feature class names prefixed and specific (`qb-<feature>-…`). Every feature stylesheet
   ships on the same route, so generic names collide.
4. Check both themes and a 390px phone (no horizontal scroll, no cut titles). The glass tokens are theme-aware; nothing should set its
   own `.light` background for a glass surface.
5. Write visible text in Arabic wrapped in `t()` (see `docs/i18n.md`). Use logical CSS
   (`inset-inline`, `margin-inline-start`, `text-align: start`) — never hard-code `direction: rtl`
   on a page container; only Quran-font text and the mushaf force RTL. Give directional icons
   the `dir-flip` class via `Icon` so they mirror in LTR locales.
6. Size controls to their text, never to a fixed width: labels change length with the interface
   language. Give option groups `qb-fit-choice` and tab strips `qb-fit-track` with
   `data-autofit="2"` / `"1"`. For a bar that must shed text, mark it `data-autofit="N"`, mark the
   text that must not be cut (e.g. a title) with `data-fit-watch`, and write one CSS rule per
   `[data-fit="k"]` level saying what goes first. `lib/auto-fit.ts` measures and picks the lowest
   level that fits, and re-measures on resize, text change, font load and language change.
7. Borders are implicit. A surface is shaped by light — the glass top highlight (`--glass-edge`),
   its tint and its shadow — not by an outline: `--glass-rim` is almost transparent and there is
   no uniform inner ring. Use `--border` (faint) for wells and cards, `--border-accent` for
   hover/selected, `--border-focus` + `--focus-glow` for focus/open, and `--divider-fade`
   (`border-image: var(--divider-fade) 1`) for row dividers so they fade out at both ends.
   Selection glows (`--seg-on-shadow`, soft gold halo) instead of being outlined. Never hard-code a
   gold `rgba(212, 175, 55, …)` border.
