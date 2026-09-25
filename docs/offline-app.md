# The standalone app (offline-first, Android)

The Android app is **the same web app**, built as a static bundle that runs
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
  every interface language, and recitations (one surah at a time per
  reciter). A new narration or translation on the server appears in the
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

## Code map

| Path | Role |
|---|---|
| `apps/web/lib/app-mode/config.ts` | `APP_MODE`, `REMOTE_ORIGIN`, `PACKS_URL` (build-time constants) |
| `apps/web/lib/app-mode/runtime.ts` | opens the device databases once and wires the engine, local store and packs |
| `apps/web/lib/app-mode/platform.ts` | the device contract (databases, key-value, files) |
| `apps/web/lib/app-mode/platform-capacitor.ts` | Android: native SQLite, Preferences, Filesystem |
| `apps/web/lib/app-mode/platform-web.ts` | a desktop browser preview: sql.js + IndexedDB |
| `apps/web/lib/app-mode/packs.ts` | catalogue, download, SHA-256 check, install / update / remove |
| `apps/web/lib/app-mode/language.ts` | one language choice → interface + translation + preferences |
| `apps/web/lib/app-mode/audio.ts` | recitations downloaded per surah, played from the device |
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
(`QBASAIR_OFFLINE_PACKS_PATH`), and the app's origin must be in
`QBASAIR_CORS_ORIGINS` (see `docs/api-contract.md`).

## Tests

- `packages/offline-engine`: the parity suite — the device answers the same
  JSON as the server for ~4,000 recorded Quran requests and a scripted
  user-data session (`docs/offline-engine.md`).
- `apps/web/lib/app-mode/*.test.ts`: pack install / checksum refusal / removal
  / language install / updates, and the fetch router (device vs server vs
  offline, bearer token).
