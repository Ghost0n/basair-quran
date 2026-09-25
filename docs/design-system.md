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
| Side panels (search, Studio) | Floating glass panes beside the mushaf (radius 26px) |
| Sheets, popovers, menus | Strong tint (`--glass-tint-strong`), 28px blur, spring entrance |
| Cards | Glass material with lighter shadow; they lift 2px on hover |
| List rows inside a glass pane | Tint + sheen only (no nested blur, for performance) |

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
4. Check both themes and a 390px phone. The glass tokens are theme-aware; nothing should set its
   own `.light` background for a glass surface.
