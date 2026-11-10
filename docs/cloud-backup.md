# Backups of a guest's data (standalone app)

Without an account, a reader's own data lives on the phone only: the notebook,
themes and boards, study sessions, followed roots, research documents and
preferences (the device store, `packages/offline-engine` `LocalStore`, saved
as `kv/qb.userdata.json` in the app's data folder). With an account, account
sync keeps it on our server (docs/offline-app.md), and backups don't apply.

Backups are tied to the reader's own Apple or Google account. There is no file
to export or import by hand.

## Active today: the phone's own backup

Nothing to set up, on our side or the reader's (beyond the phone's backup being
on, which it is by default).

| | iPhone | Android |
|---|---|---|
| Where it goes | the device's **iCloud Backup** | **Android Auto Backup** to the reader's Google account |
| What is in it | the app's Documents folder: the device store (`kv/`). Downloads live in `Library/Caches` and the Quran databases in `Library/CapacitorDatabase` (`capacitor.config.ts`), both outside the backup | only `kv/` (the device store), except the sign-in token and session: `android/app/src/main/res/xml/backup_rules.xml` (Android ≤ 11) and `data_extraction_rules.xml` (Android 12+) |
| When it comes back | when the iPhone is restored from that backup (new or reset phone) | on a new phone, and when the app is reinstalled |
| Limits | the iCloud storage the reader has | 25 MB per app (the device store is far smaller; downloads, which would exceed it, are kept out) |

Settings → «النسخ الاحتياطي» says this to a guest in the app
(`apps/web/features/app-mode/backup-settings.tsx`). It shows nothing to a
signed-in reader, and nothing on the web.

To check on Android:
1. `adb shell bmgr enable true` once.
2. Back up: `adb shell bmgr backupnow app.qbasair.quran`.
3. Uninstall, reinstall, and the data is back.

## Not active: syncing with iCloud Drive or Google Drive from the app

Saving to the reader's iCloud Drive or Google Drive app folder from inside the
app is a different thing. It is live and per change, and it moves the data
between an iPhone and an Android phone. It needs developer accounts and
credentials that the project doesn't have yet, so it is **not in the build**.
The earlier manual «Save a backup / Restore a backup» files were removed: a
backup should not depend on the reader saving a file.

### What you need to do to activate it

**iCloud (iPhone)**
1. An **Apple Developer Program** membership (paid). The team ID goes into the
   repository secret `APPLE_TEAM_ID` (already used by the signed IPA step).
2. In Certificates, Identifiers & Profiles:
   - Under **Identifiers**, open the App ID `app.qbasair.quran` and enable **iCloud** (CloudKit, or iCloud Documents).
   - Create the container `iCloud.app.qbasair.quran`.
3. In Xcode (`apps/mobile/ios/App`), go to Signing & Capabilities:
   - Add **iCloud**, tick the container and **iCloud Documents**.
   - This creates `App/App.entitlements` with `com.apple.developer.icloud-container-identifiers`, `com.apple.developer.ubiquity-container-identifiers` and `com.apple.developer.icloud-services`. Commit it.
4. Regenerate the provisioning profile. The signed build already passes `-allowProvisioningUpdates` with the App Store Connect API key secrets (`APPSTORE_API_KEY_ID`, `APPSTORE_API_ISSUER_ID`, `APPSTORE_API_KEY_P8`).
5. Tell us when that is done. The app side is then:
   - A small Swift Capacitor plugin that writes the device store's JSON into the container's `Documents/` with `NSFileCoordinator`, and reads it on launch and when it changes.
   - The newest copy wins, as account sync does.
   - Settings shows it as an on/off switch.

**Google Drive (Android, and iPhone if wanted)**
1. A **Google Cloud project**. In APIs & Services, enable the **Google Drive API**.
2. **OAuth consent screen**:
   - App name, support email, privacy policy URL, and the authorised domain of the site.
   - Scope `https://www.googleapis.com/auth/drive.appdata`. It is the app's own hidden folder, so the reader's files are never visible to the app.
   - Publish the app. Google may ask for verification of the consent screen.
3. **OAuth client IDs**:
   - **Android**: package `app.qbasair.quran`, plus the SHA-1 of the signing certificate. Use both the upload key (repository secret `ANDROID_KEYSTORE_BASE64`) and, once on Google Play, Play App Signing's key.
   - **iOS**, for Drive on iPhone: bundle ID `app.qbasair.quran`.
   - **Web**: needed by Google's Android sign-in libraries. Put its client ID in the build as `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; it is not a secret.
4. Tell us when that is done. The app side is then:
   - Android: Google Identity Services' authorisation for the `drive.appdata` scope (no password, the account already on the phone).
   - The Drive REST API stores the device store's JSON in the app-data folder.
   - The newest copy wins.
   - Settings shows it as an on/off switch with the Google account's address.

Until then, the phone's own backup (above) keeps a guest's data. An account keeps it on every device.
