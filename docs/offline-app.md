# The standalone app (offline-first, Android and iOS)

The Android and iOS app is **the same web app**, built as a static bundle that runs
on the phone without a server. The web app is unchanged and keeps using the
FastAPI server; both are released from this repository.

| | Web app | Standalone app |
|---|---|---|
| Build | `pnpm --filter @q-basair/web build` (Next server) | `pnpm --filter @q-basair/web build:app` (static export) |
| Quran search, reader, layout, morphology, count | server (`quran_service.py`) | on the device (`packages/offline-engine`) |
| Translations of meanings | server | on the device (installed packs) |
| Notebook, themes, boards, documents, sessions, roots, preferences | server (per account) | on the device (local store); synced with the account when online |
| Account, Studio (research agent), Community | server | server, when online |
| Data | `data/quran.db` | `core.db` inside the app + downloaded packs |

## What ships and what downloads

- **Inside the app:** the Madani mushaf (Ḥafṣ) with its authentic 604-page
  layout and fonts, every search index, the morphology, and the English
  interface (the onboarding language and the fallback of every dictionary).
  See `docs/offline-packs.md` for `core.db`.
- **On demand** (Settings → «التنزيلات» / Downloads): the other narrations
  (Qālūn, Warsh, Shuʿba, al-Dūrī, al-Sūsī), every translation of meanings,
  every interface language, and recitations: one surah, or a reciter's
  whole recitation («تنزيل الكل», `lib/app-mode/audio-jobs.ts`: four files at
  a time; it carries on while the reader uses the rest of the app, «إيقاف»
  keeps the complete surahs and «استئناف» skips them; «حذف الكل» asks for a
  second tap). A new narration or translation on the server appears in the
  catalogue without an app update. Installed packs whose content changed show
  «تحديث» (update).

Nothing limits the app offline once a pack is installed: an installed
narration is searched and read like Ḥafṣ, with the same engine.

## First launch: the language

The first page is in English and assumes nothing (Arabic is not a default).
The reader picks one language; that single choice installs **both** the
interface language and the recommended translation of meanings in that
language (QuranEnc's preferred translation first, then Tanzil, never a
transliteration; Arabic installs only the interface). Offline at first launch,
English and Arabic are available immediately and the other languages wait for
a connection. Changing the language later in Settings works the same way.

## How requests are answered

`apps/web/lib/app-mode/fetch-router.ts` sits in front of `fetch` for every
`/api/*` request, so the rest of the app is untouched:

1. **On the device** — the Quran routes and the user-data routes, through
   `OfflineApi` (`packages/offline-engine`, see `docs/offline-engine.md`),
   online or not.
2. **On the server** — everything else, at `NEXT_PUBLIC_REMOTE_ORIGIN`, with
   the account's bearer token (captured at sign-in, kept on the device;
   cookies are never used).
3. **Offline** — server-only routes answer `503`; Studio and Community show
   «يتطلّب هذا القسم اتصالًا بالإنترنت» instead of failing, and the account
   menu shows the last signed-in account.

## Account sync

The device is offline-first: the notebook, themes and boards, research
sessions, followed roots, research documents and preferences are always read
and written on the device. When online and signed in, they are reconciled
with the account (`packages/offline-engine/src/sync.ts`, scheduled by
`apps/web/lib/app-mode/sync.ts`) through the account's ordinary routes:

1. **Push** what changed here: deletions of rows the account has, new rows
   (the account's ids are recorded), edits. Theme references in saved ayahs
   are translated to the account's theme ids.
2. **Pull** the account: rows from other devices arrive, rows deleted
   elsewhere go, edits land (theme references translated back).

It runs at start, when the connection returns, a few seconds after a change
on the device, right after sign-in, and every five minutes; a failed run
keeps what it already sent and retries on the next trigger. Conflicts: the
last device to sync wins, per row.

- Data saved on the device before signing in is uploaded to the account that
  signs in (the app's equivalent of the web's guest → account merge).
- Signing out removes the account's data from the device; anything created
  while signed out stays. Another account signing in never sees the previous
  account's synced data.

## Code map

| Path | Role |
|---|---|
| `apps/web/lib/app-mode/config.ts` | `APP_MODE`, `REMOTE_ORIGIN`, `PACKS_URL` (build-time constants) |
| `apps/web/lib/app-mode/runtime.ts` | opens the device databases once and wires the engine, local store and packs |
| `apps/web/lib/app-mode/platform.ts` | the device contract (databases, key-value, files) |
| `apps/web/lib/app-mode/platform-capacitor.ts` | Android and iOS: native SQLite, Filesystem |
| `apps/web/lib/app-mode/platform-web.ts` | a desktop browser preview: sql.js + IndexedDB |
| `apps/web/lib/app-mode/packs.ts` | catalogue, download, SHA-256 check, install / update / remove |
| `apps/web/lib/app-mode/language.ts` | one language choice → interface + translation + preferences |
| `apps/web/lib/app-mode/audio.ts` | recitations downloaded per surah, played from the device |
| `apps/web/lib/app-mode/sync.ts` | when account sync runs (the algorithm is in `packages/offline-engine/src/sync.ts`) |
| `apps/web/features/app-mode/` | onboarding, the Downloads card, the online-only notice |
| `apps/web/app/**/*.app.tsx` | the app build's route files (the static shell layout) |

The app build is selected by `NEXT_PUBLIC_APP_MODE=1`: `next.config.ts`
switches to `output: "export"` and gives `.app.tsx` route files precedence,
and the i18n loader bundles only English (other dictionaries are packs).
Everything app-only is behind the build-time `APP_MODE` constant, so the web
build does not change.

## Building and previewing

```bash
python scripts/build_offline_packs.py                 # build/offline/ (core.db + packs)
pnpm --filter @q-basair/web build:app                 # apps/web/out/ + the bundled core.db
pnpm --filter @q-basair/web build:app -- --with-packs # also copies the packs to out/offline/
cd apps/web/out && python -m http.server 3100         # desktop preview of the app build
```

Build-time settings: `NEXT_PUBLIC_REMOTE_ORIGIN` (the server, e.g.
`https://basair.example`), `NEXT_PUBLIC_PACKS_URL` (default
`$NEXT_PUBLIC_REMOTE_ORIGIN/api/offline`, or `/offline` for a local preview),
`NEXT_PUBLIC_AUTH_ENABLED=1` for accounts.

Server side: `GET /api/offline/{name}` serves `build/offline/`
(`QBASAIR_OFFLINE_PACKS_PATH`; `/app/data/offline` in production, where the
deploy rebuilds it after `[rebuild-db]`, after a translations build, or when it
is missing), and the app's origin must be in
`QBASAIR_CORS_ORIGINS` (see `docs/api-contract.md`).

## Android and iOS

`apps/mobile` is the Capacitor shell (`app.qbasair.quran`, "Basair"): its
`android/` and `ios/` projects are committed; the web assets they serve are
copied from `apps/web/out` by `cap sync` and are not. Both platforms run the
same code (`apps/web/lib/app-mode/platform-capacitor.ts`).

- **Databases:** the bundled `core.db` is copied into the app's databases on
  first launch (native SQLite). `assets/databases/core.version` records its
  data version: an app update with new data replaces the copy and applies
  the installed narration packs again from the files kept on the device, so
  downloads survive updates. Installed translations live in their own
  database and are untouched.
- **Storage:** settings, the user's data, kept packs and recitations are
  files in the app's private storage (`@capacitor/filesystem`); recitations
  are downloaded natively (no CORS) and played from the device.
- **iOS specifics:**
  - The app is served from `capacitor://localhost` (Android:
    `https://localhost`); the server must allow both origins.
  - Nothing re-downloadable is backed up to iCloud (an App Store rule): the
    databases live in `Library/CapacitorDatabase` (excluded from backup), and
    packs and recitations in `Library/Caches`. The system may purge that
    folder: recitations then stream again, and at start the pack registry is
    reconciled with the database (`PackManager.reconcile`), so a purged pack
    is offered for download again.
  - Recitations keep playing with the screen locked (`UIBackgroundModes:
    audio`); the app declares no non-exempt encryption (HTTPS only).
- **System media controls** (`features/recitation/media-session.tsx`): the
  verse, the reciter, «بصائر» and the app's mark on the lock screen, in
  Control Center and the Dynamic Island (iPhone), the notification shade
  (Android) and the browser's media hub (web), with play / pause, previous /
  next verse and the surah's progress (dragging it seeks within the surah).
  iPhone and the web use the Media Session API of WebKit / the browser;
  Android's WebView has none, so `@capgo/capacitor-media-session` (pinned,
  a media-playback foreground service) draws the notification there
  (`FOREGROUND_SERVICE_MEDIA_PLAYBACK` in the manifest).
- **Sharing** (`lib/native-share.ts`): images and links go through the
  phone's own share sheet (`@capacitor/share`; files are written to the
  cache first). Shared links point to the public site (`NEXT_PUBLIC_SITE_URL`,
  else the server), never to the device's `capacitor://localhost`.
- **Fonts:** the mushaf fonts ship in the bundle; the interface fonts
  (Amiri, Cairo) are committed under `apps/web/public/fonts/ui/` and
  self-hosted by the web too (`app/tokens.css`), so no launch ever fetches a
  font. The Noto fonts for translations and languages in other scripts are
  downloaded into the bundle at build time (`out/fonts/noto/`, see
  `docs/i18n.md`).
- **Cold start:** the native splash (`@capacitor/splash-screen`,
  `launchAutoHide: false`) stays up while `lib/app-mode/boot.ts` warms what
  the first screens need: interface fonts, the device databases, the
  last-read page (payload, authentic layout, glyph font, neighbours) and the
  local notebook and sessions. It lifts when that is done, or after ~3s (the
  databases may hold it up to 15s, an 8s safety cap otherwise); on a first
  launch the language choice shows at once while the core database copies.
  Search indexes are then built in idle time so the first search answers at
  once. The verse durations of the last-read page's surahs, for the user's
  reciter, are asked for alongside (`features/recitation/verse-durations.ts`)
  without holding the splash, so the player opens on exact surah times.
  Returning from the background never shows the splash.
- **Icons and splash:** `python apps/mobile/scripts/make_icons.py` (Pillow +
  fontTools) draws the logo — the ۞ star whose centre dot is the dot of a ب
  drawn from the repository's Amiri Quran font — in gold on the app's dark
  background into `android/app/src/main/res` and `ios/App/App/Assets.xcassets`,
  the web favicon, touch and PWA icons and `icon.svg` into `apps/web/public`,
  and the ب outline used by the React `BrandMark`
  (`apps/web/components/brand-glyph.generated.ts`).

### Building

CI: `.github/workflows/mobile.yml` runs on changes to the app on `develop` /
`main`, on `mobile-v*` tags and on demand. One job builds the Quran data
(fonts, `quran.db`, the Madani layout), the offline core and packs
(verified) and the app bundle; then, from that same bundle:

- **Android** (Linux): `assembleDebug`, `assembleRelease`, `bundleRelease` →
  the APKs and the AAB.
- **iOS** (macOS, Xcode): a simulator build (`Basair-simulator.zip`: unzip and
  drag `App.app` onto a running iOS Simulator), and a device build — a signed
  `.ipa` when the Apple secrets exist, otherwise `Basair-unsigned.ipa` (to be
  re-signed before it installs). On a `mobile-v*` tag the signed build is
  uploaded to App Store Connect (TestFlight).

Versions: the build number is the run number; the version is the tag
(`mobile-v1.2.0`) or `0.1.<run>`.

- Android signing: repository secrets `ANDROID_KEYSTORE_BASE64` (the `.jks`, base64),
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
  Without them the release outputs are unsigned; the debug APK installs as is.
- iOS signing: an Apple Developer account, an App Store Connect API key
  ("App Manager" role) and the app's bundle id `app.qbasair.quran` registered
  (App Store Connect → Apps → new app). Repository secrets `APPLE_TEAM_ID`,
  `APPSTORE_API_KEY_ID`, `APPSTORE_API_ISSUER_ID` and `APPSTORE_API_KEY_P8`
  (the `.p8` file's contents). Xcode's cloud-managed signing creates the
  certificate and profile itself — no certificate or profile to export.
- The server: repository variable `QBASAIR_REMOTE_ORIGIN` (e.g.
  `https://basair.example`), which must serve `/api/offline/*` (publish the
  `basair-offline-packs` artifact to `QBASAIR_OFFLINE_PACKS_PATH`) and list
  `https://localhost` (Android) and `capacitor://localhost` (iOS) in
  `QBASAIR_CORS_ORIGINS`.

Locally (Android: Android Studio + SDK 36, JDK 21; iOS: a Mac with Xcode 16+):

```bash
python scripts/build_offline_packs.py
pnpm --filter @q-basair/web build:app
pnpm --filter @q-basair/mobile sync               # cap sync (both platforms)
pnpm --filter @q-basair/mobile open               # Android Studio
pnpm --filter @q-basair/mobile exec cap open ios  # Xcode (pick your team under Signing, then Run)
```

## Tests

- `packages/offline-engine`: the parity suite — the device answers the same
  JSON as the server for ~4,000 recorded Quran requests and a scripted
  user-data session (`docs/offline-engine.md`).
- `packages/offline-engine/test/sync.test.ts`: two devices and one account —
  offline saves reach the other device with theme references intact, edits
  and deletions travel both ways, a quiet sync writes nothing, accounts never
  mix, a failed sync leaves no duplicates.
- `apps/web/lib/app-mode/*.test.ts`: pack install / checksum refusal / removal
  / language install / updates, and the fetch router (device vs server vs
  offline, bearer token).
