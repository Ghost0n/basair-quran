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
| **Stable five-tab bar** (`features/shell/mobile-tab-bar.tsx`) | The worlds coin: one button that fans out and changes the tabs under the thumb per world; six of nine pages behind a tap. | Home · المصحف · البحث · الدراسة · الدفتر, always in the same place, icon + label (Home is the app's logo, unlabelled: the one icon everyone already knows), active pill always gold. A second tap on the current tab scrolls back to the top. The bar steps aside while the keyboard is open. | R6, R7, R8, R9, R12 |
| **Home in the thumb zone** (`features/home/home-screen.tsx`) | Greeting and cards from the top down; actions spread across the screen. | The upper part is for looking: the greeting and date open the screen, beside the account button (the brand is the Home tab). The actions stack from the bottom up: continue reading (one primary gold button), four labelled shortcuts (index, saved pages, study, community), and the search field last, closest to the thumb. | R1, R2, R4, R12 |
| **Reader controls at the bottom** (`phone-ergonomics.css`, reader section) | The reader's bar sat at the top; its icons were unlabelled and some were under 44px. | The page fills the top; the bar sits under it at 56px with 48×48 labelled actions (تلاوة, عرض…). The surah name opens the index (with a chevron). The display strip opens upward. | R2, R3, R4, R8, R10 |
| **Swipe settles into the page** (`mushaf-stage.tsx`) | After swiping, the chrome stayed. | A page swipe on a phone enters the immersive view (the page alone, with a small "صفحة ٣" pill); a tap brings the chrome back. | R3, R4 |
| **Search field at the top, results as the page** | The field floated at the bottom, above the tab bar; it was hard to follow what was typed there (owner's iPhone review). The results sat in a framed glass pane with a close button and a density toggle. | The field stays at the top, where typing is expected; suggestions open downward with 48px rows. The results are the page itself, like the notebook: no pane, no close button (the tabs are the way out), always full verse cards (the one-line view is gone everywhere), and rows only fade in (a rising row under glass left magenta seams on iOS). The summary keeps two 44px actions. | R5, R10 |
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
- The study screen is a conversation: no frame, no session tabs (the session title opens a sheet of open sessions with new/close), no close or export buttons; the strict/tafssir switch sits in the composer. «حوّل إلى بحث» shows only once the session has messages and asks for confirmation in a banner before creating the document.
- In landscape the Home tab bar overlays content, as it does today (content scrolls).
- In `next dev`, the reader occasionally logs "Maximum update depth exceeded"
  from `useElementSize` (`features/reading/use-wide-screen.ts`); it predates
  this layout and never reproduced in the production build.

## Follow-ups

1. Hallway test with one-handed tasks (open a surah, search a root, resume a study).
2. Move the study screen's tabs and composer actions down if the test confirms.
