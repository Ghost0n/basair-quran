# Public site and search engines

The app lives at `/` (a client app, `?mode=` screens). Around it, a few
server-rendered pages exist for visitors, search engines and shared links.

| Path | What | Source |
|---|---|---|
| `/about` | The landing page (sections below), calls to open the app or create an account | `features/site/site-landing.tsx`, `features/site/landing/`, `app/about/page.tsx` |
| `/` (visitor's door) | The same landing, shown by `ShellGate` to web visitors who are neither signed in nor guests (auth enabled); «ابدأ القراءة» opens the app in place | `features/identity/shell-gate.tsx` |
| `/guidelines` | The community guidelines in full: Arabic (the reference, `docs/community-guidelines.md`) or English for every other interface language | `features/site/guidelines-content.ts`, `app/guidelines/page.tsx` |
| `/robots.txt`, `/sitemap.xml` | Crawl rules (API and account pages excluded) and the public pages | `app/robots.ts`, `app/sitemap.ts`, `lib/site.ts` |

- **Site address**: `NEXT_PUBLIC_SITE_URL` (build time; Docker build arg from
  `QBASAIR_PUBLIC_URL`, `vars.QBASAIR_SITE_URL` for the mobile build) gives
  canonical links, the sitemap, Open Graph URLs and the links on shared cards.
- **Shared-link card**: `public/og-image.png` (1200×630), drawn by
  `node apps/web/scripts/make-og-image.mjs` in Chromium with the app's fonts
  (server-side image renderers don't shape Arabic). Each page that sets its own
  `openGraph` repeats `OG_IMAGES` (a page's block replaces the layout's).
- **Structured data**: `/about` carries a schema.org `WebApplication`.
- **Language**: pages render in Arabic (the source language) for crawlers and
  switch to the reader's interface language in the browser; the guidelines'
  long text exists in Arabic and English only (not run through `t()`).
- **Neutral voice**: the landing page and the guidelines describe a method,
  never a school, sect or tradition; they don't name groups to protect or to
  avoid (one rule covers every group and belief), and don't use the vocabulary
  of religious authority (the app issues no rulings).
  `features/site/guidelines-content.test.ts` keeps such words out of the
  guidelines and keeps `docs/community-guidelines.md` equal to the Arabic text.
- **Promises on the landing page** must stay true: no ads, no trackers (there
  is no analytics; error reporting is off unless `NEXT_PUBLIC_ERROR_REPORTING=1`),
  no selling or marketing use of data, reading and search without an account,
  account and data deletion.

## The landing page

Built around the app's name, from real data, with no screenshots yet (the
phones are drawn in the app's style; real screenshots can replace them later):

1. **Hero** — a rosette (`landing/pattern.tsx`) draws itself around the mark
   while «هذا بصائر للناس» (45:20) appears word by word; a soft light follows
   the pointer on desktop.
2. **Pillars** — the text first, verifiable and repeatable, open to everyone.
3. **The method** («منهجٌ يمكن مراجعته») — observation, induction (every
   occurrence, not a selection), comparison, a disciplined conclusion (what the
   verse states / allows / what one thinks), review; five steps on one thread.
   The app presents itself as a research tool, not an authority.
4. **The root of the name** (`landing/root-ribbon.tsx`) — the root ب ص ر over
   the 114 surahs, one bar per surah (Al-Fātiḥa on the right). Visitors can type
   any word or root: the ribbon is redrawn live from
   `GET /api/root-distribution` (Ḥafṣ) and the occurrences open in the app's
   search. Without the API (offline, static app) the ribbon keeps the name's root
   and says live search isn't available.
5. **«بصائر في يدك»** (`landing/phone-story.tsx`) — read, search, recite,
   study, told on a phone that stays in place and changes screen as each step
   scrolls into view (≥ 900 px); on phones every step carries its own phone.
6. **Under the hood** — offline, verified text, trusted translations, AI limits.
7. **The Quran in numbers** (`landing/numbers.tsx`) — counted up when seen.
8. **The pledge** (privacy promises) and the **community principles**, with a
   link to `/guidelines`.

Every figure and verse comes from `features/site/landing-data.json`, written by
`python scripts/build_landing_data.py` from `data/quran.db` (Ḥafṣ) and the
reciter catalogue; `--check` (and `tests/test_landing_data.py`) fail when the
committed file no longer matches the database — re-run it after a database
rebuild. Motion respects `prefers-reduced-motion` (everything is shown at once).

## Next (with the domain and the production platform)

- Public, server-rendered pages per surah, verse and published post, with
  their own addresses (then the sitemap lists them and shared post links show
  a rich card and open the app through universal / app links).
- Per-language addresses (e.g. `/en/about`) with `hreflang`, so search engines
  index every interface language rather than Arabic only.
