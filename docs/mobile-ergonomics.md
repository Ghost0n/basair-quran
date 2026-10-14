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
| **The reader's dock** (`reader-bar.tsx`, section 1c) | The reader's bar sat above the tab bar; the bookmark beside it; recitation had its own player and a capsule. | In the reader the tab bar becomes the dock: «قراءة» (no tool, the default, so a tap on the page toggles focus mode), «العرض», «تلاوة», and a back arrow to the screen the reader was opened from. While reciting, the dock holds previous · play · next · reciter · close instead. The bookmark floats in the top corner; tapping the surah name at the top of the page opens «انتقل». Focus mode hides all of it. Phones on their side keep the previous layout. | R2, R3, R4, R8, R10 |
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
- The on-screen keyboard behaviour (bar hiding, field riding on the keyboard)
  could not be exercised in headless Chromium; it needs a real phone.
- The study screen keeps its header at the top; only its targets were enlarged.
- In landscape the Home tab bar overlays content, as it does today (content scrolls).
- In `next dev`, the reader occasionally logs "Maximum update depth exceeded"
  from `useElementSize` (`features/reading/use-wide-screen.ts`); it predates
  this layout and never reproduced in the production build.

## Follow-ups

1. Hallway test with one-handed tasks (open a surah, search a root, resume a study).
2. Move the study screen's tabs and composer actions down if the test confirms.
