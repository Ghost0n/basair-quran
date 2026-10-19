# Phone ergonomics

The phone interface, grounded in the research below. It started as an opt-in
prototype (`m2`, Q-Basair-mobile-ux-prototype) and was adopted as the only
phone interface in Q-Basair-51: the per-device switch, the `/prototype/mobile`
page and the worlds coin are gone.

- Scope: phones. The rules live in `features/shell/phone-ergonomics.css`
  under `@media (max-width: 768px)`; the tab bar is
  `features/shell/mobile-tab-bar.tsx`; Home is one tree for every size
  (`features/home/home-screen.tsx`, arranged by `home.css`).
- Wide screens keep their layout (reader toolbar on top, recitation bar,
  command bar). Their rail lists every destination, grouped by world, with no
  world switch (there is room for all of them), and Home keeps the rotating
  verse as its centrepiece above the same continue card, shortcuts and search
  as the phone.

## What the research says

| # | Finding | Source |
|---|---|---|
| R1 | 49% of people hold the phone in one hand and use their thumb; 36% cradle it, 15% use two hands. The thumb is the primary pointer most of the time. | Hoober, *How Do Users Really Hold Mobile Devices?* (UXmatters, 2013, 1,333 observations) — https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php |
| R2 | The thumb's comfortable functional area is the lower and middle part of the screen; the top corners need a grip change. | Bergstrom-Lehtovirta & Oulasvirta, *Modeling the Functional Area of the Thumb on Mobile Touchscreen Surfaces*, CHI 2014 — https://doi.org/10.1145/2556288.2557354 |
| R3 | People read and tap mostly in the centre of the screen; they scroll content there and are less accurate at the edges. | Hoober, *Design for Fingers, Touch, and People* (UXmatters, 2017) — https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php |
| R4 | Split the screen: the top for viewing, the bottom for interacting. | Samsung One UI design guidelines — https://developer.samsung.com/one-ui |
| R5 | Moving the address bar and its controls to the bottom improves one-handed reach (Safari iOS 15, Chrome Android option). | Apple, Safari iOS 15 release notes; https://developer.apple.com/design/human-interface-guidelines/toolbars |
| R6 | Hidden navigation is used about half as often as visible navigation on mobile, lowers discoverability by ~20% and makes tasks ~15% slower. | Pernice & Budiu, *Hamburger Menus and Hidden Navigation Hurt UX Metrics* (NN/g, 2016) — https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/ |
| R7 | A bottom navigation bar should show 3–5 top-level destinations, always visible, each with an icon and a label, in a stable order. | Material 3, Navigation bar — https://m3.material.io/components/navigation-bar/guidelines ; Apple HIG, Tab bars — https://developer.apple.com/design/human-interface-guidelines/tab-bars |
| R8 | Icons alone are ambiguous; labels make them usable. | Harley, *Icon Usability* (NN/g, 2014) — https://www.nngroup.com/articles/icon-usability/ |
| R9 | Stable positions let people build spatial memory and select by location instead of searching; moving items destroys that. | Scarr, Cockburn & Gutwin, *Supporting and Exploiting Spatial Memory in User Interfaces* (Foundations and Trends in HCI, 2013) — https://doi.org/10.1561/1100000046 |
| R10 | Error rates fall sharply up to ~9.2 mm (single taps) and ~9.6 mm (serial taps); smaller targets cost accuracy and time. | Parhi, Karlson & Bederson, *Target Size Study for One-Handed Thumb Use on Small Touchscreen Devices*, MobileHCI 2006 — https://doi.org/10.1145/1152215.1152260 ; Park & Han 2010 (target location effects) — https://doi.org/10.1016/j.ergon.2009.08.004 |
| R11 | Minimum target sizes: 24×24 CSS px (WCAG 2.2 AA, 2.5.8), 44×44 (AAA, 2.5.5); 44pt (Apple), 48dp (Material). | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum ; https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced |
| R12 | Time to hit a target grows with distance and shrinks with size (Fitts); choice time grows with the number of options (Hick–Hyman). | Fitts 1954; Hick 1952; Hyman 1953 — summarised at https://lawsofux.com/fittss-law/ and https://lawsofux.com/hicks-law/ |
| R13 | Dark text on a light background reads better for detail; the reader keeps its themes, and this layout does not change them. | Piepenbrock, Mayr, Mund & Buchner, *Positive display polarity is advantageous for both younger and older adults*, Ergonomics 2013 — https://doi.org/10.1080/00140139.2013.790485 |

## What changed, and why

| Change | Before | After | Grounded in |
|---|---|---|---|
| **Stable five-tab bar** (`features/shell/mobile-tab-bar.tsx`) | The worlds coin: one button that fans out and changes the tabs under the thumb per world; six of nine pages behind a tap. | Home · المصحف · البحث · الدراسة · الدفتر, always in the same place, icon + label, active pill in the world tint. A second tap on the current tab scrolls back to the top. The bar steps aside while the keyboard is open. | R6, R7, R8, R9, R12 |
| **Home in the thumb zone** (`features/home/home-screen.tsx`) | Greeting and cards from the top down; actions spread across the screen. | The upper part is for looking (greeting). The actions stack from the bottom up: continue reading (one primary gold button), four labelled shortcuts (index, saved pages, study, community), and the search field last, closest to the thumb. | R1, R2, R4, R12 |
| **The printed page is the screen** (`phone-ergonomics.css`, section 1b) | The page sat on a sheet sized to the reading area, so it shrank and moved when the bars came and went; its type size followed each page's widest line (±10% from page to page). | Pages mode pins the page to the screen, from the top safe area to the dock, full width, with no sheet. Focus mode only hides the bars, so the page never moves. One type size for every page (a 16.3em measure; the ~5% wider pages step down to fit). Juz and surah sit in the top corners; the page number sits under the dock in every mode. The size control shows inactive in this mode. | R3, R4 |
| **The reader's dock** (`reader-bar.tsx`, section 1c) | The reader's bar sat above the tab bar; the bookmark beside it; recitation had its own player and a capsule. | In the reader the tab bar splits in two: a round glass back button on the side the interface reads from (the right in Arabic, the left in left-to-right languages), and the dock — the surah's name (it opens «انتقل», in both modes), «قراءة» (no tool, the default: the only tool where a tap on the page toggles focus mode), «العرض», «تلاوة». While reciting, the dock holds previous · play · next · «الإعدادات» (the recitation sheet); the back button folds them into «تلاوة», which keeps a live mark and reopens them, while the audio plays on — paused, back ends the recitation. The bookmark floats in the top corner over the printed page's running head (juz top right, surah top left, alike; focus mode shows them whole). Verse by verse, the verses fill the screen and scroll under the floating chrome, without a scroll indicator or a second page number. «انتقل» opens on «المحفوظة» (the saved pages) when there are some; Home's «الفهرس» and «المحفوظة» open the reader on that sheet rather than pages of their own. A verse opened from search or the library lights as one block that glows for 5 seconds and fades. Focus mode hides all of it. Phones on their side keep the previous layout. | R2, R3, R4, R8, R10 |
| **The reader opens on Al-Fatiha** (`features/reading/reader-entry.ts`) | The app forwarded returning readers to the reader on launch, and the reader reopened at the last position. | The app always opens on Home. The first time the reader is entered after launch it opens on Al-Fatiha, unless the way in named a place (a saved page, a search result, a library verse…), Home's «تابع» asked to resume, or a recitation is under way (it opens on the recited verse). After that, leaving for another page and coming back keeps the reader where it was. The reader always opens in «قراءة». A fresh Al-Fatiha isn't saved as the reading position until the reader moves. Opened from the tab bar, the reader's back button returns Home and wears the app's mark; opened from another page, it is an arrow back to that page. | R4 |
| **One place per setting** (`settings-screen.tsx`) | Settings repeated the reader's reading mode and text size and the study's mode and depth, and offered an opaque mode. | Settings keeps what has no screen of its own (theme, language, numerals, Home, mushaf, translations, downloads, account); the app is always glass (the system's reduce-transparency setting still applies). Every UI number follows the numerals choice (insights, dates, onboarding, hints). Language and numerals are independent: changing the language keeps the digits, and the screen stays on Settings. «الرئيسية» has a switch for each part of Home (greeting, the wide-screen verse, continue reading, the four shortcuts, search), saved on the account (`home_hidden`); an odd last shortcut takes the whole row. | R6 |
| **Native touch** (`postcss-touch-hover.cjs`, `app/globals.css`) | iOS kept `:hover` on the last element touched: a tapped word stayed gold, a brushed button stayed lit; the interface text could be selected and copied. | Every `:hover` rule is compiled behind `@media (hover: hover)`; tapped words lose their focus ring; no text selection, callout or tap flash on touch screens (fields and editors excepted). | R11 |
| **Gestures** (`lib/sheet-swipe.ts`, `lib/exclusive-overlay.ts`, `features/shell/edge-swipe-back.tsx`) | Sheets closed with an X; a second tool's menu opened over the first; back was only the reader's arrow. | Bottom sheets follow the finger down and close (their X is gone on touch screens); a tap outside a menu only closes it; opening a menu, «العرض» or a sheet closes the one already open. A swipe from the screen's edge (right in Arabic) goes back, the screen following the finger — except in the reader, a board and a research being edited, where sideways drags already mean something. The tab bar's lens slides between tabs and can be dragged along the bar. | R3, R8 |
| **Liquid glass and the way into the reader** (`app/glass.css`, `app/motion.css`) | Frosted, flat chrome; screens cross-faded. | The floating chrome (tab bar, dock, back button, bookmark, search bar, capsule, menus) is a clear, saturated glass with a lit rim; presses swell like a drop. Entering the reader, the tab bar visibly splits into the back button and the dock (view transitions) and the page arrives from the reading direction. The dock's buttons are in place from the first frame (they only animate when reading and recitation swap), and on iPhone the morphing pieces use a solid tint of the glass's tone while the transition runs, since WebKit captures blurred glass as an empty square patch. | R3 |
| **Search is one page** (`concordance-panel.tsx`) | A title, subtitle, icon and watermark took the top half; the results sat below a fixed bar. | The results scroll under a floating glass search bar and the tab bar. Before a search only the guiding line and the suggestions show, right under the bar. Each result has ▶ beside its pin: that verse alone is recited (the capsule shows at the top meanwhile). Opening a verse and coming back returns to the same place in the results (restored once the search layout is in place, retried until it holds); another page of results starts at its top. | R1, R4 |
| **Swipe to delete** (`components/swipe-row.tsx`) | Saved verses, researches, studies and followed roots had a small trash button beside each row; saved pages couldn't be removed from the list. | On touch screens a row swipes aside (towards the side the text starts from) to uncover a red «حذف» button; only a second tap on it deletes. A tap elsewhere, or opening another row, slides it back; past the button the row resists, so a long swipe never deletes. Saved pages (the page and «انتقل»'s «المحفوظة») gain the same. Mouse and keyboard keep the trash button. | R3, R8 |
| **Study** (`studio.css`, section 3) | The guidance floated mid-screen; with the keyboard open iOS scrolled the screen up, under the status bar. | The guidance sits at the top under the session title; with the keyboard up the app frame follows the visible area, so the composer sits on the keyboard. | R1, R5 |
| **Swipe settles into the page** (`mushaf-stage.tsx`) | After swiping, the chrome stayed; the new page replaced the old one at once. | The page follows the finger like a photo, with the pages on either side already drawn beside it (RTL: the next page on the left); past a quarter of the screen, or on a flick, it glides over and turns, else it springs back. The turn enters the immersive view (the page alone); a tap brings the chrome back. | R3, R4 |
| **Search field at the bottom** | The field was at the top of the search screen; suggestions opened downward. | The field floats just above the tab bar and rides on the keyboard when typing (`visualViewport`); suggestions open upward with 48px rows. Results summary keeps two 44px actions and drops the decorative header. | R2, R5, R10 |
| **44px floor** | 33 visible targets under 44px across seven screens (2 under 24px). | 0. Close buttons, icon buttons, tabs, chips, pins and the study composer all get 44×44 hit areas. | R10, R11 |
| **Community still one step away** | In the coin fan. | Home tile, and a row in the account sheet. | R6 |

Also fixed while building it:
`.qb-companion-canvas > .qb-world-page` now fills the canvas
(`features/concordance/concordance.css`), which removed a narrow-column glitch.

## Measured result

`apps/web/scripts/ergonomics-audit.mjs` (Playwright, iPhone 13 profile,
390×844) counts the visible touch targets on each screen. Measured when the
prototype was introduced, before (the worlds coin) → after:

| Screen | targets | under 44px | under 24px | in bottom half | in top quarter |
|---|---|---|---|---|---|
| Home | 8 → 13 | 1 → 0 | 0 → 0 | 7 → 10 | 1 → 1 |
| Reader | 11 → 10 | 5 → 0 | 0 → 0 | 5 → 10 | 6 → 0 |
| Search (empty) | 10 → 10 | 1 → 0 | 0 → 0 | 8 → 6 | 2 → 1 |
| Search results | 12 → 13 | 6 → 0 | 0 → 0 | 8 → 7 | 4 → 5 |
| Study | 17 → 17 | 11 → 0 | 2 → 0 | 8 → 8 | 7 → 7 |
| Index | 17 → 17 | 4 → 0 | 0 → 0 | 9 → 10 | 5 → 1 |
| Notebook | 10 → 10 | 5 → 0 | 0 → 0 | 5 → 5 | 5 → 5 |
| **Total** | | **33 → 0** | **2 → 0** | | |

The reader page takes 77% of the screen height with its controls visible
(80% before), and 100% after a swipe.

Navigation (inferred from the code, not measured with people): the five main
destinations are one tap from anywhere, where search, study and the notebook
used to take two or more from the reader. The index, saved pages and community
are two taps (Home tile, or the surah name for the index).

## Limitations

- Not tested with people. The numbers above are geometry, not task times;
  a short hallway test (5 people, one hand, standing) is the next step.
- The on-screen keyboard behaviour (bar hiding, field riding on the keyboard,
  the study frame following the visible area) could not be exercised in
  headless Chromium; it needs a real phone.
- Liquid Glass is Apple's native material (iOS 26); the web view can only
  approximate it with CSS (blur, saturation, a lit rim). The edge swipe is
  the app's own (the web view's system gesture isn't used), and the split
  into the reader needs view transitions (iOS 18+): older systems switch
  without the animation.
- The study screen is a conversation: no frame, no session tabs (the session title opens a sheet of open sessions with new/close), no close or export buttons; the strict/tafssir switch sits in the composer. «حوّل إلى بحث» shows only once the session has messages and asks for confirmation in a banner before creating the document.
- Catalogues the app can't work without (reciters, surahs, mushafs, account
  preferences) now retry until they load (`lib/retry.ts`: 1 s doubling to
  30 s, and at once when the connection returns or the app comes back). A
  catalogue that loads but is empty is taken as loaded.
- In landscape the Home tab bar overlays content, as it does today (content scrolls).
- In `next dev`, the reader occasionally logs "Maximum update depth exceeded"
  from `useElementSize` (`features/reading/use-wide-screen.ts`); it predates
  this layout and never reproduced in the production build.

## Follow-ups

1. Hallway test with one-handed tasks (open a surah, search a root, resume a study).
2. Move the study screen's tabs and composer actions down if the test confirms.
