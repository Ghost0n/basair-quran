# Responsive design: tablet to phone, iPhone and Android — design

Date: 2026-11-06. Branch: `feat/Q-Basair-55-refonte-design-web`. Owner: the maintainer.

## Intent

The web redesign (the flat, gold "web design" behind `html.qb-web`) was built for wide screens only. Below
it the app falls into two other designs:

- **Medium widths:** the "compact canvas" band (`useIsMobile(1000)`) moves the reader's toolbar out of the
  top bar onto the page, which leaves the top bar empty.
- **Phones:** below 768px, the older phone design (glass, `phone-ergonomics.css`, its own tab bar) takes over.

Shrinking a window, turning an iPad or opening the phone app therefore feels like switching apps.

The goal is **one continuous experience** at every size. The web design is the single source. Smaller
screens change only what the size forces. iPhone and Android each get a light touch so the app feels at
home on them. Every screen matters equally.

## Decisions made by the owner

1. **One design.** The desktop web design becomes the design at every size. The older phone look (glass
   surfaces, its phone-specific chrome) is retired, not kept alongside.
2. **Phones: a bottom tab bar.**
   - On iPhone it is Apple's Liquid Glass: translucent and refracting, floating clear of the home indicator.
   - Each tab is a full screen of its own. Opening a search result, a saved verse or a verse cited in a study
     answer switches to the Mushaf tab at that verse.
3. **iPad (and any tablet-width screen): the side menu, as on desktop.**
   - **Held sideways:** exactly the desktop, with a page beside the Mushaf.
   - **Held upright:** one view at a time. A page takes the full width beside the side menu, and opening a
     result (or the Mushaf item) brings the Mushaf back full size.
4. **Menus and confirmations on phones are bottom sheets**, styled for each platform (below).
5. **Haptics** on taps, page turns and confirmed actions.
6. **The mobile browser gets the same touches as the installed app** (Safari or Chrome on a phone, not
   installed). One platform limit: Safari on iPhone cannot vibrate, so there are no haptics in iOS Safari.
   Android Chrome supports them.

## Constraints carried over from the project

- **The reader.** The Mushaf page rendering, its fit to the screen, spreads, page turns and the reader
  fixes stabilized over many sessions must keep working. The phone reader is restyled, not rewritten.
  Behaviour that exists today on phones keeps working:
  - swipe to turn;
  - the page fitting the screen;
  - the running head;
  - the verse-by-verse mode;
  - the recitation dock.
- **Content rules.**
  - Only the authentic Madani (QCF glyph) Mushaf.
  - Quran words never move or resize when highlights, selection or other reader states change.
  - No cropped text anywhere, in all 23 interface languages (watch Arabic marks, Nastaliq Urdu and Indic
    scripts).
- **Interaction rules.**
  - No click focus rings (the keyboard keeps a fine ring).
  - The active navigation item is always gold.
  - Nothing is selectable except fields and the editor.
- **Strings.** Every new UI string is translated in all 23 locales (`locales.test.ts`) and passes
  `node scripts/i18n.mjs check`.
- **Safe areas.** Content and bars respect `env(safe-area-inset-*)`: notch, home indicator, Android gesture
  bar and landscape phones.
- **Flag.** The explanatory reading («قراءة تفسيرية») stays hidden behind `NEXT_PUBLIC_QB_TAFSSIR`.
- **Blur.** It stays off in the web design except where a decision above asks for glass: the iPhone tab
  bar and iPhone sheets. The studio sessions pane is the existing exception.

## Width bands

These are the builder's starting values (my call), to adjust on real devices:

| Band | Width | Navigation | A page and the Mushaf |
|------|-------|------------|-----------------------|
| Wide | ≥ 1100px | side menu | side by side (today's desktop) |
| Medium | 769–1099px | side menu | one at a time; the top bar always carries the current view's tools |
| Phone | ≤ 768px, or a coarse-pointer screen ≤ 500px high (landscape phone) | bottom tab bar | one full screen per tab |

Width decides the band, not the device: a narrowed desktop browser behaves exactly like a tablet or a phone
of that width. That way no layout ever appears that doesn't also exist on a device. iPad models fall in
bands as follows:

- **Held sideways, Wide:** iPad Air, iPad and iPad Pro (1180–1366px).
- **Held sideways, Medium:** iPad mini (1133px). It still gets the desktop look, one view at a time.
- **Held upright, Medium:** all of them.

**Medium band:**

- Same shell as Wide: side menu and top bar. The top bar is never empty:
  - on the Mushaf it carries the reader's toolbar;
  - on a page it carries that page's name and tools.
- When space runs short, toolbar labels collapse to icons, never to a cut word.
- Turning pages by the side "wings" works when the Mushaf is the view.

**Phone band:**

- **Top bar:** each screen has a compact one (title and its tools); the Mushaf's carries the reader tools.
- **Tab bar:** at the bottom, clear of the safe area, and it tracks the keyboard (the current tab bar
  already handles `--qb-kb` / `--qb-vvh`, so reuse that behaviour).
- **Recitation:** it keeps a dock above the tab bar.

## Platform touches

Detection sets a class on `<html>`: `qb-ios` or `qb-android`, or nothing on desktop.

- **In the app:** `Capacitor.getPlatform()`.
- **In a browser:** the user agent. iPadOS reports a Mac, so use `maxTouchPoints > 1`.

The touches apply in the Phone band. On iPad, the side menu and popovers stay as on desktop (my call).

**iPhone:**

- **Tab bar:** Liquid Glass. It floats, is translucent with a refracting rim, and the active tab is in gold.
- **Bottom sheets:** rounded top, grab handle, glass surface. Swipe down to close; this reuses
  `lib/sheet-swipe.ts`.
- **Back:** the existing edge swipe goes back.
- **Haptics:** light impact on tab change and page turn; success notification on a confirmed action.

**Android:**

- **Tab bar:** Material-style navigation bar, solid surface in our tokens. The active item is marked by a
  gold pill behind its icon.
- **Bottom sheets:** solid surface with a drag handle and a scrim.
- **Back:** the system back button closes the open sheet first, then goes back. This needs `@capacitor/app`
  in the app; in the browser use the history.
- **Haptics:** the same events via `@capacitor/haptics` in the app and `navigator.vibrate` in Chrome.

**Haptics in the app:** `@capacitor/haptics` on both platforms. Adding `@capacitor/haptics` and
`@capacitor/app` to `apps/mobile` is a dependency change, so the owner approves it at plan time.

**What becomes a sheet on phones:** every menu, popover and confirmation:

- select menus;
- the create and account menus;
- the display strip and the reader's popovers;
- delete or convert confirmations;
- the "show in the Mushaf?" pick banner.

The six existing sheets (`navigate-sheet`, `recitation-sheet`, `theme-sheet`, `account-sheet`,
`print-sheet`, `publish-sheet`) are restyled into one shared sheet primitive. Today there is none; only
`.qb-rsheet` + `attachSheetSwipe` exist.

## How it gets made (what exists, and the direction)

**What exists today:**

- Thirteen width breakpoints, with 768 as the phone switch and 1000 as a JS-only "compact" switch.
- `PHONE_QUERY`, `isWebDesign()`, which turns the web design off on phones and in the app (`APP_MODE`).
- The phone tab bar (`mobile-tab-bar.tsx`, five tabs: Home, Reader, Search, Study, Notebook).
- `phone-ergonomics.css` (783 lines, one `@media (max-width: 768px)` block).
- `phone-player.css`.
- 56 safe-area uses.
- No haptics and no shared sheet component.

**Direction:**

- **The web design gate.** `html.qb-web` applies at every width and in the app. `isWebDesign` no longer
  turns off for phones or `APP_MODE`. `navigation.ts` has its own copy of that check, which must follow.
- **Retiring the old phone design.** Its CSS (`phone-ergonomics.css`, the glass phone rules in
  `glass.css`, `shell.css` and the per-feature `@media (max-width: 768px)` rules) is gated off under
  `html.qb-web` or removed. Two kinds of rule must survive:
  - behaviour the phone reader needs (fit, swipe, safe areas, keyboard tracking);
  - the 44px touch targets.

  They are re-expressed in the web design's files.
- **Breakpoints.** One set of named breakpoints (Wide / Medium / Phone) is shared by CSS and JS. It
  replaces `useIsMobile(1000)`, `useIsMobile(768)` and the scattered values within the app. The marketing
  site (`.qb-site`) keeps its own.
- **New CSS** keeps to the project rule: it lives in `*.web.css`, with selectors prefixed `.qb-web` /
  `html.qb-web`. `lib/web-design.test.ts` keeps guarding that.

## Goals

- Resizing a desktop window continuously from 1920px down to 360px never shows:
  - an empty bar;
  - a layout from a different design;
  - horizontal scroll;
  - clipped text;
  - a Mushaf page that doesn't fully fit.
- The same holds for iPad sideways and upright, iPhone (Safari and app) and Android (Chrome and app),
  portrait and landscape.
- Every destination works in every band, including Home, the board and the research editor.
- The clipped-text audit (headless) is clean at 1366, 1180, 1024, 820, 768, 430, 390 and 360px, in ar, en,
  de and ur.

## Non-goals

- No new features.
- The marketing site.
- The backend, the offline engine and the database.
- Native-only screens (widgets, share extensions).

## Anti-goals (a failure even if it "works")

- The phone reader regresses in fit, swipe or the recitation dock.
- Two designs remain reachable by resizing.
- A platform touch makes the app look like a generic iOS or Material template rather than Q-Basair: gold,
  flat and calm, with the Mushaf first.
- Text is cropped in any language.

## Left to the builder

- The exact band values, tuned on devices.
- Which tool labels collapse first.
- Haptic intensities.
- The sheet primitive's API.
- The order of migration screen by screen.
- How the old phone CSS is retired (gating or deleting), as long as the surviving behaviours above are
  kept.

## Calls made in writing (my calls, for the owner to check)

- **Each tab keeps its state.**
  - On phones, Search keeps its query, results and scroll when you jump to the Mushaf and come back.
  - Study keeps its sessions, as it already does.
  - Back (Android back button, iPhone edge swipe, browser back) follows history. After opening a result in
    the Mushaf, back returns to the results.
- **Medium band rotation.** Turning an iPad from sideways to upright keeps the page in front, since it's
  what the user was working in. The side menu's Mushaf item, or opening a result, brings the Mushaf back.
  From the Mushaf, the page's own menu item or back returns to the page.
- **Popovers on iPad.** On iPad, menus stay popovers as on desktop; bottom sheets are for phones.
- **Band values.** The width values above are starting points.

## Owner's answers to the builder check

1. **The tab bar hides in the Mushaf on phones.**
   - The Mushaf keeps the full height.
   - While reading, the tab bar gives way to the reader's own controls: back, plus the reader dock, as today.
   - The page fit stays as stabilized.
   - Leaving the Mushaf brings the tab bar back.
2. **iPhone app: Apple's real control.**
   - The installed iPhone app uses the native iOS tab bar (Liquid Glass) through a small custom Capacitor
     plugin. It is native Swift, drawn over the web view, and sends the chosen tab to the web app.
   - The web app hides its own bar there.
   - Safari on iPhone keeps a close CSS imitation.
   - Android (app and Chrome) keeps the web-drawn Material-style bar.
   - The native bar must follow the same rules as the web one: hidden in the Mushaf, gold active item, and
     clear of the keyboard.
3. **Plugins approved.** `@capacitor/haptics` and `@capacitor/app` are approved for `apps/mobile`.
4. **Testing devices (my assumption; the owner didn't say).**
   - This PC runs Windows, so the iOS app and the native tab bar plugin cannot be built or run here; they
     need a Mac with Xcode.
   - The plan verifies with browser emulation, headless screenshots and the Android emulator where possible.
   - The owner checks on real iPhone and iPad.
   - The native iOS plugin is written so it can be built on a Mac, and is marked untested until then.
