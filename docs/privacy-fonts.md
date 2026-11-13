# Fonts and privacy: no request to Google from a visitor's browser

**Rule:** no page of Basair — the public site (landing, guide, FAQ,
guidelines), the app, or the standalone mobile app — makes the browser contact
`fonts.googleapis.com` or `fonts.gstatic.com`. A browser's network tab shows
no request to either host, in any interface language.

## Why

Loading a font from Google's servers sends the visitor's IP address to Google
before they have agreed to anything. On 20 January 2022 the Regional Court of
Munich (Landgericht München I, case 3 O 17493/20) held that a website which
embedded Google Fonts this way breached the GDPR, ordered it to stop and
awarded the visitor damages. Self-hosting the fonts removes the transfer
entirely, and keeps the landing page's promise of no trackers.

## How it is kept

- **Every font is served from our own origin.** Cairo, Amiri and Amiri Quran
  are committed under `apps/web/public/fonts/` (SIL OFL). The King Fahd Complex
  page fonts are fetched at deploy time (`scripts/fetch_mushaf_fonts.py`). The
  Noto faces for other scripts (Japanese, Hindi, Korean, Urdu…) are downloaded
  **at build time** by `apps/web/scripts/fetch-script-fonts.mjs`, which rewrites
  their stylesheets to point at the local copies and refuses to write one that
  still names a Google host.
- **No fallback to Google.** `ensureScriptFont` (`apps/web/lib/script-fonts.ts`)
  loads only `/fonts/noto/<script>.css`; if that file is missing, the text uses
  the device's own fonts.
- **The browser is not allowed to.** The Content-Security-Policy that nginx sends
  (`deploy/nginx/*.conf.template`) has `font-src 'self' data:` and
  `style-src 'self' 'unsafe-inline'`: even a stray link would be blocked.
- **CI checks it.** `apps/web/lib/no-google-fonts.test.ts` fails if any page,
  component, stylesheet or public file names a Google font host, or if the
  security policy allows one. The build script is the only exception, since it
  runs on the build machine, not in a visitor's browser.

## Checking it by hand

Open the site with the browser's developer tools → Network, enable "Preserve
log", filter on `google`, then visit the landing page, `/guide` (both
versions), `/faq`, `/guidelines` and the app's screens, switching the interface
to a language with its own script (Japanese, Hindi, Urdu). The filter stays
empty.

`apps/web/scripts/audit-third-party-requests.mjs` does the same in a browser,
for every page, in nine interface languages, on desktop and phone sizes, and
once more with the self-hosted Noto files blocked; it fails on any request to a
Google font host and lists every third-party host contacted.

## Other third-party requests

The same rule holds for everything a visitor's browser loads. The only optional
third-party script, Yamli (Arabic typing aid, `api.yamli.com`), is **opt-in**: it
loads only when the web is built with `NEXT_PUBLIC_ENABLE_YAMLI=1`, and the
production build sets `0`. The app also plays recitations straight from their
sources when the server has not prepared them (`NOTICE.md` → *Services the app
calls while running*); the AI providers are reached by the server, not the
browser.

## Last audit (November 2026)

273 page loads and 10,087 requests (the public pages and the app's main screens,
in Arabic, English, Japanese, Hindi, Korean, Urdu, Bengali, Chinese and
Russian, desktop and phone, plus the run with the self-hosted fonts blocked):
**0 requests** to `fonts.googleapis.com` or `fonts.gstatic.com`. The only
third-party host was Yamli, because the test server was built without
`NEXT_PUBLIC_ENABLE_YAMLI`, which then defaulted to on; it is now opt-in, and a
second pass contacted no third-party host at all.
