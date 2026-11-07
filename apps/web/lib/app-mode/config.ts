/**
 * The standalone (Android) app is this same web app, built as a static export
 * with NEXT_PUBLIC_APP_MODE=1 (see docs/offline-app.md). In that build the
 * Quran routes and the user's own data are answered on the device; accounts,
 * the research agent and Community go to the server when online.
 */
export const APP_MODE = process.env.NEXT_PUBLIC_APP_MODE === "1";

/** The server the app talks to when online (accounts, Studio, Community, pack downloads). */
export const REMOTE_ORIGIN = (process.env.NEXT_PUBLIC_REMOTE_ORIGIN ?? "").replace(/\/$/, "");

/** Where the downloadable packs and their manifest live (scripts/build_offline_packs.py output). */
export const PACKS_URL = (process.env.NEXT_PUBLIC_PACKS_URL || (REMOTE_ORIGIN ? `${REMOTE_ORIGIN}/api/offline` : "/offline")).replace(/\/$/, "");

/** The bundled core database, inside the app (Capacitor SQLite reads assets/databases/). */
export const CORE_DB_ASSET = "/assets/databases/coreSQLite.db";
