# Responsive tablet → phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One continuous Q-Basair design at every width, from desktop through iPad down to iPhone and Android
(browser and app), with light platform touches.

**Architecture:**

- **Width bands.** A pure band module (Wide ≥ 1100 / Medium 769–1099 / Phone) replaces the scattered
  `useIsMobile(1000|768)` switches.
- **Platform class.** A before-paint script sets `qb-ios` / `qb-android` on `<html>`.
- **Web design everywhere.** `html.qb-web` turns on at every width and in the app. The old phone CSS stays
  for the behaviour it carries (reader fit, swipe, keyboard, safe areas). Its looks are overridden in
  `*.web.css` under `.qb-web`, never edited.
- **Native pieces.** One shared `Sheet` primitive turns menus and confirmations into bottom sheets on
  phones. `@capacitor/haptics`, `@capacitor/app` and a local native iOS tab-bar plugin provide the native
  touches.

**Tech Stack:** Next.js 15 / React 19 (apps/web), Vitest, Capacitor 8.5 (apps/mobile, SPM iOS project),
Swift 5 for the iOS plugin.

**Spec:** `docs/superpowers/specs/2026-11-06-responsive-tablet-phone-design.md`

## Global Constraints

- **Bands.**
  - Wide is ≥ 1100px.
  - Medium is 769–1099px.
  - Phone is `(max-width: 768px), (max-height: 500px) and (pointer: coarse)`, the existing `PHONE_QUERY`.
  - Width decides, not the device.
- **Reader.** Its rendering, fit, spreads, page turns and phone swipe are restyled, never rewritten. No
  edits to `glyph-page.tsx` layout maths, `use-reader-window.ts` or the page-fit code.
- **Content rules.**
  - Only the authentic Madani (QCF) Mushaf.
  - Quran words never move or resize on highlight or selection.
  - No cropped text in any of the 23 locales (ar, en, de, ur are the audit set).
- **CSS rules.**
  - New CSS goes in `*.web.css` only, every selector starting `.qb-web` or `html.qb-web`.
  - Existing CSS files are never edited.
  - `lib/web-design.test.ts` must pass. Its parser splits on commas, so never use `:is(a, b)`.
- **Visual rules.**
  - Tokens only: no colour literals in components.
  - Amber/gold active item.
  - No click focus rings.
  - Nothing is selectable except fields and the editor.
  - No blur, except the iPhone tab bar imitation, iPhone sheets and the studio sessions pane.
- **Strings.** Every new UI string goes in all 23 locales. Message ids are the Arabic strings. Run
  `node scripts/i18n.mjs catalog` then `check`.
- **Flag.** `NEXT_PUBLIC_QB_TAFSSIR` stays off.
- **Phone tab bar.**
  - It hides in the Mushaf (reading mode); the reader keeps its own back button and dock, as today.
  - Its tabs are the existing `PHONE_TABS` (Home, Mushaf, Search, Study, Notebook). Community and Settings
    are reached from Home and the account sheet. This is my call; the spec left the set open.
- **iPad.** Popovers stay popovers; sheets are for the Phone band.
- **Haptics.**
  - Light impact on tab change and page turn; success on a confirmed action.
  - Through `@capacitor/haptics` in the app and `navigator.vibrate` in Android Chrome.
  - None in iOS Safari.
- **Commits.** `feat|fix: [Q-Basair-55] - <French>`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Files are CRLF.
- **Tests.** From apps/web, with PATH including `.runtime/node-v22.22.0-win-x64`:
  - `node ./node_modules/vitest/vitest.mjs run --exclude lib/script-fonts.test.ts`
  - `node ./node_modules/typescript/bin/tsc --noEmit -p .`
- **Visual checks.** Headless, with `cdp-check.mjs` (scratchpad) against `next start` on 3005.

## Review Focus

1. **A phone on its side** (coarse pointer, ≤ 500px tall, > 768px wide) is in the Phone band: the tab bar
   hides in the Mushaf and the page still fits. Covered by the Task 1 test and the Task 5 check at 844×390.
2. **Resizing live across a band** (1150 → 900 → 700 → 1150) keeps the open page and its state, and never
   leaves an empty top bar. Covered by the Task 11 sweep.
3. **The keyboard on a phone** (the search field focused) keeps the field and the tab bar above the
   keyboard. Covered by the Task 6 check with `--qb-kb` set.
4. **Long labels in the phone tab bar and the compact top bar** (de, ur) never clip. Covered by the Task 4
   crop audit at 360px.
5. **The Android back button with a sheet open** closes the sheet, not the page. Covered by the Task 9 unit
   test.

---

### Task 1: Bands and platform foundation

**Files:**
- Create: `apps/web/lib/bands.ts`, `apps/web/lib/bands.test.ts`
- Create: `apps/web/lib/platform-class.ts`, `apps/web/lib/platform-class.test.ts`
- Modify: `apps/web/app/layout.tsx` (add the platform init script next to `WEB_DESIGN_INIT_SCRIPT`)

**Interfaces:**
- Produces: `type Band = "wide" | "medium" | "phone"`.
- Produces: `WIDE_MIN = 1100`.
- Produces: `bandFor(width: number, height: number, coarse: boolean): Band`. Phone wins first, through the
  `PHONE_QUERY` semantics: width ≤ 768, or (coarse and height ≤ 500).
- Produces: the hook `useBand(): Band`, client only and SSR-safe; its server snapshot is "wide".
- Produces: `type Platform = "ios" | "android" | null`.
- Produces: `detectPlatform(input: { ua: string; maxTouchPoints: number; native: string | null }): Platform`.
  `native` is `Capacitor.getPlatform()` when native, else null. iPadOS reports "Macintosh" with
  maxTouchPoints > 1, and that counts as "ios".
- Produces: `PLATFORM_INIT_SCRIPT: string`. It sets `qb-ios` or `qb-android` on `<html>` before paint and
  reads `window.Capacitor?.getPlatform?.()`.

- [ ] **Step 1:** Write the tests.
  - `bandFor(1440, 900, false) === "wide"`, `bandFor(1100, 800, false) === "wide"`,
    `bandFor(1099, 800, false) === "medium"`, `bandFor(769, 1024, true) === "medium"`,
    `bandFor(768, 1024, true) === "phone"`, `bandFor(844, 390, true) === "phone"`,
    `bandFor(844, 390, false) === "medium"`.
  - `detectPlatform`: iPhone UA → "ios"; Mac UA with 5 touch points → "ios"; Mac UA with 0 → null;
    Android UA → "android"; Windows → null; native "ios" wins over any UA.
- [ ] **Step 2:** Run them and see them fail. Then implement the code, run again (PASS), and add the
  script to `layout.tsx`.
- [ ] **Step 3:** Commit `feat: [Q-Basair-55] - Bandes de largeur et détection de plateforme`.

### Task 2: The web design at every width and in the app

**Files:**
- Modify: `apps/web/lib/web-design.ts` (`isWebDesign` → true; the init script always adds `qb-web`)
- Modify: `apps/web/lib/web-design.test.ts`
- Modify: `apps/web/lib/use-web-design.ts`, if it no longer needs the phone subscription

**Interfaces:**
- Produces: `isWebDesign(): boolean`. It always returns true (the signature drops its arguments). The class
  stays as the design's scope.

- [ ] **Step 1:** Update the test so `isWebDesign()` is true, and so `WEB_DESIGN_INIT_SCRIPT` adds `qb-web`
  regardless of `APP_MODE` or the phone query. Run it and see it fail.
- [ ] **Step 2:** Implement. `tsc` lists every caller of the old signature: fix each one to the no-argument
  form. Run the tests (PASS).
- [ ] **Step 3:** Run a headless check at 390×844 that `html.qb-web` is present. Commit
  `feat: [Q-Basair-55] - Le design web s'applique à toutes les largeurs et dans l'app`.

### Task 3: The Medium band (iPad, a narrowed window)

**Files:**
- Modify: `features/shell/workspace-canvas.tsx` (the compact test becomes `band !== "wide"`)
- Modify: `features/shell/top-bar-slots.ts` (slots active in Wide and Medium)
- Modify: `features/reading/components/reader-bar.tsx` (in the top bar in Wide and Medium)
- Modify: `features/reading/mushaf-stage.tsx`, `reading/tools/selection-bar.tsx`,
  `settings/settings-screen.tsx`, `studio/studio-panel.tsx`, `companions/library-screen.tsx`,
  `concordance/concordance-panel.tsx`. Each `useIsMobile(1000)` becomes a `useBand()` comparison with the
  same meaning.
- Create: `features/reading/reader-bar-place.ts`, `features/reading/reader-bar-place.test.ts`
- Modify: `features/shell/shell.web.css` (the compact top bar)

**Interfaces:**
- Consumes: `useBand()` and `Band` from Task 1.
- Produces: `readerBarInTopBar(band: Band, mode: ShellMode, roomWide: boolean): boolean`. It is true when
  band ≠ "phone" and (mode === "reading" or (band === "wide" and !roomWide)).

- [ ] **Step 1:** Write the tests.
  - `readerBarInTopBar("medium","reading",false) === true`
  - `readerBarInTopBar("medium","search",false) === false`
  - `readerBarInTopBar("wide","search",false) === true`
  - `readerBarInTopBar("phone","reading",false) === false`

  Run them and see them fail.
- [ ] **Step 2:** Implement the function and use it in `reader-bar.tsx`. Then replace the 1000px switches.
- [ ] **Step 3:** Add the compact top bar to `shell.web.css` with `@container` on `.qb-topbar-web`. Below
  a 900px bar:
  - the reader tool labels (`.qb-reader-bar .act .lbl`, the Display/Read labels) hide, leaving icons with
    their `aria-label`;
  - the juz/page meta keeps one line with an ellipsis only when no glyph is cut;
  - nothing wraps.
- [ ] **Step 4:** Run headless at 1027×896 and 820×1180, in reading mode and in search mode:
  - in reading, `#qb-topbar-reader` holds `.qb-reader-bar`;
  - in search, `#qb-topbar-slot` is not empty;
  - no `.qb-reader-bar` floats in the stage;
  - no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`).
- [ ] **Step 5:** Run the tests and `tsc`. Commit
  `feat: [Q-Basair-55] - Bande moyenne : une vue à la fois, barre supérieure toujours remplie`.

### Task 4: The phone shell (top bar and tab bar)

**Files:**
- Modify: `features/shell/top-bar.tsx`. The web top bar renders in the Phone band too, as a compact bar:
  the page title from the slots plus its actions. It is hidden in reading mode.
- Modify: `features/shell/mobile-tab-bar.tsx`. Keep its logic (tabs, lens, re-tap to top, keyboard);
  add `data-platform` from the html class, for the CSS.
- Create: `features/shell/mobile-tab-bar.web.css` (import it next to `mobile-tab-bar.css`)
- Modify: `features/shell/shell.web.css`. The rail is hidden in the Phone band, and the canvas leaves room
  for the bar, using the existing `--page-bottom`.

**Interfaces:**
- Consumes: `useBand()` from Task 1. Consumes the `qb-ios` / `qb-android` classes from Task 1.
- Produces: the CSS hook `html.qb-web .qb-tabbar`, the phone bar in the web design. Task 10 hides it when
  the native iOS bar is up: `html.qb-native-tabbar .qb-tabbar { display: none }`.

- [ ] **Step 1:** Style the web tab bar.
  - **Base (Android and anything else):** solid `--bg-elev-1` surface, a hairline top, 64px plus the bottom
    safe area. The active item gets a gold pill (`--gold-soft`, 56×30, radius 15) behind its icon, and its
    label is `--gold-text`.
  - **`html.qb-web.qb-ios`:** a floating capsule 14px from the sides and above the home indicator, a
    translucent `--bg` mix, and the backdrop blur allowed (an `!important` exception like the studio pane).
    Add an inner highlight rim. The active item is gold.
  - **Labels:** 11px, line-height 1.6, never clipped (the de/ur check is in Step 3).
- [ ] **Step 2:** Make the web top bar compact in the Phone band: 56px plus the top safe area; the title
  is 18px Arabic heading, with the actions at the end.
- [ ] **Step 3:** Run headless at 390×844 and 360×780 (ar, en, de, ur) on home, search, studio and
  notebook:
  - the tab bar is visible, with 5 tabs;
  - in reading mode it is hidden (`display:none` or off-screen) and `.qb-rail` is not displayed;
  - the crop audit (`crop.js`) reports nothing.
- [ ] **Step 4:** Commit `feat: [Q-Basair-55] - Téléphone : barre d'onglets et barre supérieure du design web`.

### Task 5: The phone reader, restyled

**Files:**
- Modify: `features/reading/reading.web.css` (`@media (max-width: 768px)` under `.qb-web`)

**Interfaces:**
- Consumes: the dock and bottom reader bar the old phone CSS lays out (`phone-ergonomics.css`). It is
  overridden here, not edited.

- [ ] **Step 1:** Before any CSS, record the Mushaf page rectangle (`.qb-glyph-page`) at 390×844, 360×780
  and 844×390 (coarse), on page 3 and page 1, in the build from Task 4. These are the reference values.
- [ ] **Step 2:** Restyle the reader's phone chrome in the web design.
  - The bottom reader bar and dock get the flat `--bg-elev-1` surface, a gold active state and token
    borders.
  - The back button uses the web icon style.
  - The running head uses the web type.
  - On `qb-ios` the dock surface may be translucent like the tab bar.
- [ ] **Step 3:** Run headless at the same three sizes. The page rectangle is equal to Step 1's within 1px,
  and a swipe (pointer drag 200px) still turns the page (the page number changes).
- [ ] **Step 4:** Commit `feat: [Q-Basair-55] - Téléphone : le lecteur dans le design web, mise en page inchangée`.

### Task 6: The phone screens

**Files:**
- Modify: the `*.web.css` of each destination, with `@media (max-width: 768px)` rules under `.qb-web`:
  - `home/home.web.css`
  - `concordance/concordance.web.css`
  - `studio/studio.web.css`
  - `companions/*.web.css` (notebook, saved, history)
  - `settings/settings.web.css`
  - `community/community.web.css`
  - `board/board.web.css`
  - `documents/documents.web.css`
  - the index and go-to pages

  Create a `*.web.css` where a destination has none, imported where its `.css` is.

**Interfaces:**
- Consumes: the compact top bar slots (Task 4). Each page keeps portaling its name and tools into them.

- [ ] **Step 1:** For each destination, one column at 16px side padding. Its toolbars wrap or scroll
  horizontally inside their own row, never the page. Lists use full-width rows with ≥ 44px targets.
  - **Studio:** the sessions pane is a full-width overlay. The composer stays above the keyboard, so use
    `--qb-kb` from the tab bar logic.
  - **Settings:** the side index becomes a horizontal chip row at the top.
  - **Community:** the hero shrinks to the title and the guidelines link.
  - **Board and research editor:** one column; their side parts go under the main part.
- [ ] **Step 2:** Run headless at 390×844 and 360×780 (ar, en, de, ur) across every destination:
  - the crop audit is clean;
  - no horizontal scroll;
  - with the search field focused and `--qb-kb: 300px` set on `<html>`, the field's bottom is
    ≤ innerHeight − 300.
- [ ] **Step 3:** Commit per two or three destinations, e.g.
  `feat: [Q-Basair-55] - Téléphone : accueil, recherche et étude`.

### Task 7: One sheet primitive; menus and confirmations as sheets on phones

**Files:**
- Create: `apps/web/components/sheet.tsx`, `apps/web/components/sheet.web.css`,
  `apps/web/components/sheet.test.tsx`
- Modify: `components/select-menu.tsx`, `identity/account-menu.tsx`, the create menu (the shell's «+»),
  `reading/components/display-strip.tsx`, `reading/tools/tool-picker.tsx`, `recitation/range-picker.tsx`,
  `reading/components/morph-popover.tsx`
- Modify (confirmations): `reading/tools/selection-bar.tsx` (the «عرض التحديد في المصحف؟» banner),
  `studio/studio-panel.tsx` (the «حوّل إلى بحث» confirm), the `swipe-row` delete confirm, if any

**Interfaces:**
- Produces: `Sheet(props: { label: string; onClose: () => void; children: ReactNode; className?: string;
  size?: "auto" | "tall" }): JSX.Element`.
  - It renders the existing `.qb-rsheet > .backdrop + .panel > .grip` structure through `useDialog`, so
    Escape, swipe-to-close and the focus trap come with it.
  - It registers in `sheetStack` (below).
- Produces: `sheetStack: { push(close: () => void): () => void; closeTop(): boolean }` in
  `apps/web/lib/sheet-stack.ts`. `closeTop` returns true when it closed one.
- Produces: `usePhoneSheets(): boolean`, which is `useBand() === "phone"`. A component renders its menu
  inside `<Sheet>` when true, and as today otherwise.

- [ ] **Step 1:** Write the tests.
  - `sheetStack.closeTop()` returns false when empty.
  - After two pushes, it calls the second's close first.
  - The function returned by `push` removes its entry.
  - Rendering `<Sheet label="x" onClose={fn}>` and pressing Escape calls `fn` once.

  Run them and see them fail. Implement, and run them again (PASS).
- [ ] **Step 2:** Style the sheet in `sheet.web.css`.
  - **Base:** `--bg-elev-1`, radius 22 at the top, a 36×5 grip, a `--scrim` backdrop, and the bottom safe
    area padding.
  - **`qb-ios`:** a translucent surface with backdrop blur (allowed exception).
  - **`qb-android`:** solid surface, 28 radius, and the grip at 32×4.
  - **Options:** list rows 48px; the selected option gets a gold check.
- [ ] **Step 3:** Convert each listed menu and confirmation, gated by `usePhoneSheets()`. Confirmations
  become a sheet with the question as title, the primary action full width (`--btn-grad`) and cancel
  under it.
- [ ] **Step 4:** Run headless at 390×844: open the display strip, a select menu in settings and the
  account menu, and check that each renders inside `.qb-rsheet`. At 1440 the same controls still render
  as today (no `.qb-rsheet`). Commit `feat: [Q-Basair-55] - Téléphone : menus et confirmations en feuilles`.

### Task 8: Haptics

**Files:**
- Modify: `apps/mobile/package.json` (add `@capacitor/haptics` at the 8.x version that matches
  `@capacitor/core` 8.5.2; install with pnpm)
- Create: `apps/web/lib/haptics.ts`, `apps/web/lib/haptics.test.ts`
- Modify: `features/shell/mobile-tab-bar.tsx` (tab change), `features/reading/mushaf-stage.tsx` (page turn
  committed, at the existing page-change point, without touching the layout code), `components/sheet.tsx`
  (the confirm action)

**Interfaces:**
- Produces: `haptic(kind: "light" | "success"): void`.
  - Native (`Capacitor.isNativePlatform()`): `Haptics.impact({ style: ImpactStyle.Light })` or
    `Haptics.notification({ type: NotificationType.Success })`, through a dynamic import.
  - Otherwise, when `html.qb-android` and `navigator.vibrate` exist: `vibrate(10)` or `vibrate([12, 40, 18])`.
  - Otherwise nothing.
  - It never throws.

- [ ] **Step 1:** Write the tests.
  - With `navigator.vibrate` mocked and `qb-android` on `<html>`, `haptic("light")` calls `vibrate(10)`.
  - With `qb-ios` and no native platform, it calls nothing.
  - With `vibrate` throwing, it does not throw.

  Run them and see them fail. Implement, and run them again (PASS).
- [ ] **Step 2:** Wire the three call sites. Commit `feat: [Q-Basair-55] - Retours haptiques`.

### Task 9: The Android back button

**Files:**
- Modify: `apps/mobile/package.json` (add `@capacitor/app` 8.x)
- Create: `apps/web/lib/app-back.ts`, `apps/web/lib/app-back.test.ts`
- Modify: the app-mode boot (`apps/web/lib/app-mode/boot.ts`), to install the listener on Android only

**Interfaces:**
- Consumes: `sheetStack` from Task 7.
- Produces: `handleBack(deps: { closeTopSheet: () => boolean; canGoBack: () => boolean; goBack: () => void;
  exit: () => void }): "sheet" | "back" | "exit"`. It closes the top sheet first, then goes back in
  history, then exits (`App.minimizeApp()`).
- Produces: `installAppBack(): Promise<() => void>`. It wires `App.addListener("backButton", …)` to
  `handleBack`.

- [ ] **Step 1:** Write the tests.
  - With a sheet open, the result is "sheet" and `goBack` is not called.
  - With no sheet and history, the result is "back".
  - With neither, the result is "exit".

  Run them and see them fail. Implement, and run them again (PASS).
- [ ] **Step 2:** Install the listener in boot when `Capacitor.getPlatform() === "android"`. Commit
  `feat: [Q-Basair-55] - Bouton retour Android : feuille, puis page, puis sortie`.

### Task 10: The native iOS tab bar (app only)

**Files:**
- Create: `apps/mobile/ios/App/App/NativeTabBarPlugin.swift`, a `CAPPlugin` with `@objc` methods `show`,
  `setActive` and `hide`, plus the event `tabSelected`.
  - It draws a `UITabBar` pinned to the bottom safe area over the web view.
  - Items are SF Symbols (book, magnifyingglass, sparkles, note.text, house), and the tint is the gold
    token value passed from the web.
  - On iOS 26 the system bar is Liquid Glass by itself.
- Create: `apps/mobile/ios/App/App/MainViewController.swift`, a `CAPBridgeViewController` subclass that
  registers the plugin in `capacitorDidLoad()`. Point `Main.storyboard`'s view controller class at it.
- Create: `apps/web/lib/native-tab-bar.ts`
- Modify: `features/shell/mobile-tab-bar.tsx`. When `nativeTabBarAvailable()`, it calls `show` with the
  tabs, keeps `setActive` in step with the mode, hides in reading mode, maps `tabSelected` to the same
  navigation as a web tab tap, and sets `html.qb-native-tabbar` so the web bar hides.

**Interfaces:**
- Produces: `nativeTabBarAvailable(): boolean`, true when native iOS and the plugin is registered.
- Produces: `NativeTabBar: { show(o: { tabs: { id: string; title: string; symbol: string }[]; active: string;
  tint: string }): Promise<void>; setActive(o: { id: string }): Promise<void>; hide(): Promise<void>;
  addListener("tabSelected", cb: (e: { id: string }) => void) }`, through `registerPlugin("NativeTabBar")`.

- [ ] **Step 1:** Write `native-tab-bar.ts` and a unit test: `nativeTabBarAvailable()` is false outside
  native iOS, and the mobile tab bar does not call `show` when it is false.
- [ ] **Step 2:** Write the Swift plugin and the controller. They cannot be compiled on Windows: mark the
  commit body "non compilé (pas de Mac)", and record the Xcode steps in the plan's notes below.
- [ ] **Step 3:** Commit `feat: [Q-Basair-55] - Barre d'onglets native iOS (Liquid Glass) dans l'app`.

### Task 11: The continuous sweep and the audit

**Files:**
- Create: `scratchpad/sweep.js` (not committed). It resizes through 1920, 1440, 1366, 1180, 1100, 1099,
  1024, 900, 820, 769, 768, 430, 390 and 360, on reading, search and studio, and reports at each width:
  - an empty top bar (`.qb-topbar-web` visible with no element in its zones);
  - horizontal scroll;
  - `.qb-glyph-page` overflowing its stage;
  - two navigations visible at once (`.qb-rail` and `.qb-tabbar` both displayed).

- [ ] **Step 1:** Run the sweep and the crop audit (ar, en, de, ur) at the eight goal widths. Fix every
  finding in the owning task's files.
- [ ] **Step 2:** Run the full tests, `tsc`, the i18n check and a build. Commit the fixes.
- [ ] **Step 3:** Update the memory file `q-basair-web-prototype.md`: bands, one design, platform touches,
  the native bar untested.

## Notes for the Mac build (Task 10)

1. In `apps/mobile`: `pnpm install`, `npx cap sync ios`, then open `ios/App/App.xcodeproj`.
2. Add `NativeTabBarPlugin.swift` and `MainViewController.swift` to the App target, if not picked up.
3. In `Main.storyboard`, set the Bridge View Controller's class to `MainViewController` (module App).
4. Run on an iOS 26 simulator. The tab bar appears outside the Mushaf, disappears in it, and a tap
   switches tabs.
