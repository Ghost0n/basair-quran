/**
 * The standalone app's start-up, behind the native splash screen (cold start
 * only: returning from the background never shows it again).
 *
 * While the splash is up, the work that would otherwise stall the first
 * screens runs: the interface fonts, the device databases (copied from the
 * bundle on first launch), the last-read page drawn ready (payload, authentic
 * layout, glyph font, its neighbours) and the user's local data. The splash
 * lifts when that is done, or after BUDGET_MS whatever remains (it then
 * finishes in the background); only the databases may hold it longer, since
 * nothing can show without them. Search indexes warm up just after, in idle
 * time, so the first search answers at once.
 *
 * The verse durations of the last-read page's surahs, for the user's reciter,
 * are asked for alongside, so the player opens on exact surah times. They
 * never hold the splash: they come from the server and nothing on the first
 * screen needs them.
 */
import { createQBasairApiClient } from "@q-basair/api-client";

import { API_BASE_URL } from "@/lib/config";
import { DEFAULT_MUSHAF_ID } from "@/lib/mushaf-defaults";
import { lastReadPage, warmQuranPage } from "@/features/reading/mushaf-context";
import { warmMushafPage } from "@/features/reading/use-mushaf-layout";
import { warmVerseDurations } from "@/features/recitation/verse-durations";

import { appRuntime } from "./runtime";

/** Most a normal start-up waits on warm-ups before the splash lifts. */
const BUDGET_MS = 3000;
/** Most it waits on the databases (the first launch copies the core database). */
const DATABASE_MS = 15000;
/** The native splash never outlives this, whatever happens (a crash in start-up included). */
const SAFETY_MS = 8000;

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Data, not interface text: the letters the fonts are loaded for, and the
// root / word whose searches build the search indexes.
const FONT_SAMPLE = "بصائر";
// The account preferences cached on the device, and the player's reciter when none is set.
const PREFS_CACHE_KEY = "qb.prefs.cache";
const DEFAULT_RECITER = "alafasy";
const WARM_ROOT = "رحم";
const WARM_WORD = "رحمة";

const within = (ms: number, work: Promise<unknown>) =>
  Promise.race([work.then(() => undefined, () => undefined), new Promise<void>((resolve) => setTimeout(resolve, ms))]);

let hidden = false;
let liftSplash: () => void = () => undefined;
/** Settles when the splash is asked to lift (the native fade then runs on its own). */
const splashLifted = new Promise<void>((resolve) => {
  liftSplash = resolve;
});

async function hideSplash(): Promise<void> {
  if (hidden) return;
  hidden = true;
  liftSplash();
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    /* web preview of the app build: there is no native splash */
  }
}

function loadFonts(): Promise<unknown> {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  return Promise.all([
    document.fonts.load("400 16px Cairo", FONT_SAMPLE),
    document.fonts.load("700 16px Cairo", FONT_SAMPLE),
    document.fonts.load("700 20px Amiri", FONT_SAMPLE),
    document.fonts.load("20px 'Amiri Quran'", FONT_SAMPLE),
  ]);
}

/** The reciter the player will start with (the cached account preference, as the player reads it). */
function preferredReciter(): string {
  try {
    const cached = JSON.parse(window.localStorage.getItem(PREFS_CACHE_KEY) ?? "{}") as { reciter?: unknown };
    if (typeof cached.reciter === "string" && cached.reciter) return cached.reciter;
  } catch {
    /* no cached preferences: the player's default */
  }
  return DEFAULT_RECITER;
}

/** The reader's opening page, ready to draw without a step; its surahs' verse durations follow on their own. */
async function warmReader(): Promise<void> {
  const page = lastReadPage();
  const [payload] = await Promise.all([warmQuranPage(DEFAULT_MUSHAF_ID, page), warmMushafPage(DEFAULT_MUSHAF_ID, page)]);
  const reciter = preferredReciter();
  for (const surah of payload?.surahs ?? []) void warmVerseDurations(reciter, surah.id);
}

/** The user's local data (notebook, sessions): read once so Home fills at once. */
function warmUserData(): Promise<unknown> {
  return Promise.all([api.getNotebook(), api.getSessions()]);
}

/** Search indexes are built on the first search: build them now, while nothing else runs. */
function warmSearchWhenIdle(): void {
  const run = () => {
    void api
      .searchV2(WARM_ROOT, "root", DEFAULT_MUSHAF_ID, 10)
      .then(() => api.searchV2(WARM_WORD, "exact", DEFAULT_MUSHAF_ID, 10))
      .catch(() => undefined);
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

let started = false;

/**
 * Run the start-up once. `onboarded` false (first launch): the language
 * choice shows as soon as the fonts are in, and the databases copy behind it.
 */
export function bootApp({ onboarded }: { onboarded: boolean }): Promise<void> {
  if (started || typeof window === "undefined") return splashLifted;
  started = true;
  window.setTimeout(() => void hideSplash(), SAFETY_MS);

  const fonts = loadFonts();
  const databases = appRuntime();

  if (!onboarded) {
    void within(1500, fonts).then(hideSplash);
    return splashLifted;
  }

  // Everything that reads data waits for the databases first.
  const warmups = databases.then(() => Promise.all([warmReader(), warmUserData()]));
  void Promise.all([
    within(DATABASE_MS, databases),
    within(BUDGET_MS, Promise.all([fonts, warmups])),
  ]).then(() => {
    void hideSplash();
    warmSearchWhenIdle();
  });
  return splashLifted;
}
