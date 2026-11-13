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
