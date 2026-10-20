# Public site and search engines

The app lives at `/` (a client app, `?mode=` screens). Around it, a few
server-rendered pages exist for visitors, search engines and shared links.

| Path | What | Source |
|---|---|---|
| `/about` | The landing page: goals, features, technical highlights, privacy promises, community guidelines (summary), calls to open the app or create an account | `features/site/site-landing.tsx`, `app/about/page.tsx` |
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
- **Promises on the landing page** must stay true: no ads, no trackers (there
  is no analytics; error reporting is off unless `NEXT_PUBLIC_ERROR_REPORTING=1`),
  no selling or marketing use of data, reading and search without an account,
  account and data deletion.

## Next (with the domain and the production platform)

- Public, server-rendered pages per surah, verse and published post, with
  their own addresses (then the sitemap lists them and shared post links show
  a rich card and open the app through universal / app links).
- Per-language addresses (e.g. `/en/about`) with `hreflang`, so search engines
  index every interface language rather than Arabic only.
