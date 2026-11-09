import type { ReadingProgress, ReadingSeries } from "@q-basair/shared";

/**
 * «تابع القراءة»: the last page of the longest series of page turns.
 *
 * A series is an unbroken run of page turns in the reader. Opening a page any
 * other way (a search result, a saved page, the index…) is not a turn: turning
 * on from there starts a new series — unless that page is where a series
 * stopped, which then goes on. «تابع القراءة» opens the longest series where
 * it stopped and the turns that follow are added to it, so the one long
 * reading (a khatma) is never displaced by a short look elsewhere.
 *
 * A series that reaches the mushaf's last page completes the reading: every
 * series is cleared and «تابع القراءة» starts again from Al-Fatiha. Settings
 * can clear them too (`reset_at`).
 *
 * Saved as the account preference `reading_progress` (on the device for a
 * guest), with a device copy written without re-rendering the app on a turn.
 */

/** Pages this close count as a turn (a spread turns two). */
const TURN_SPAN = 2;

/** How many series are kept (models.api.READING_SERIES_LIMIT). */
export const READING_SERIES_LIMIT = 12;

const STORAGE_KEY = "qb.reading.progress";

export type PageSeen = { page: number; mushaf_id: number };

/** Where the reader is within the series: the series being extended, and the page last on screen. */
export type SeriesTracker = { activeId: string | null; lastSeen: PageSeen | null };

export const EMPTY_PROGRESS: ReadingProgress = { series: [], reset_at: null };

const now = () => Math.floor(Date.now() / 1000);

const isTurn = (from: PageSeen, to: PageSeen) =>
  from.mushaf_id === to.mushaf_id && from.page !== to.page && Math.abs(from.page - to.page) <= TURN_SPAN;

let idCounter = 0;
function newId(at: number): string {
  idCounter = (idCounter + 1) % 1296;
  return `${at.toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** The series «تابع القراءة» continues: the most turns, the latest on a tie. */
export function continueSeries(progress: ReadingProgress | null | undefined): ReadingSeries | null {
  let best: ReadingSeries | null = null;
  for (const series of progress?.series ?? []) {
    if (!best || series.turns > best.turns || (series.turns === best.turns && series.updated_at > best.updated_at)) best = series;
  }
  return best;
}

/** Keeps the limit: the series being extended stays; the shortest, then the oldest, go. */
function trim(series: ReadingSeries[], keepId: string): ReadingSeries[] {
  if (series.length <= READING_SERIES_LIMIT) return series;
  const dropping = series
    .filter((s) => s.id !== keepId)
    .sort((a, b) => a.turns - b.turns || a.updated_at - b.updated_at)
    .slice(0, series.length - READING_SERIES_LIMIT)
    .map((s) => s.id);
  return series.filter((s) => !dropping.includes(s.id));
}

/**
 * A page on the reader's screen (`lastPage`: the page that ends the mushaf on
 * screen — in a spread, the right-hand page facing the last one). Returns the progress and tracker that follow
 * (the same objects when nothing changed) and whether a series just reached
 * the mushaf's last page (the reading is complete: everything was cleared).
 */
export function observePage(
  progress: ReadingProgress,
  tracker: SeriesTracker,
  seen: PageSeen & { surah?: string | null; surah_id?: number | null; lastPage: number; at?: number },
): { progress: ReadingProgress; tracker: SeriesTracker; completed: boolean } {
  const here: PageSeen = { page: seen.page, mushaf_id: seen.mushaf_id };
  const last = tracker.lastSeen;
  const at = seen.at ?? now();
  const complete = () => ({ progress: { series: [], reset_at: at }, tracker: { activeId: null, lastSeen: here }, completed: true });
  if (last && last.page === here.page && last.mushaf_id === here.mushaf_id) {
    // The same page again — it may now show the last page (a spread's facing page drawn late).
    const active = tracker.activeId ? progress.series.find((s) => s.id === tracker.activeId) : undefined;
    if (active && active.end === here.page && here.page >= seen.lastPage) return complete();
    return { progress, tracker, completed: false };
  }

  let series: ReadingSeries | null = null;
  const active = tracker.activeId ? progress.series.find((s) => s.id === tracker.activeId) : undefined;
  if (active && isTurn({ page: active.end, mushaf_id: active.mushaf_id }, here)) {
    series = active;
  } else if (last && isTurn(last, here)) {
    // Turning on from where a series stopped continues it; from anywhere else, a new one.
    series =
      progress.series.find((s) => s.mushaf_id === last.mushaf_id && s.end === last.page) ??
      { id: newId(at), mushaf_id: here.mushaf_id, start: last.page, end: last.page, turns: 0, surah: null, surah_id: null, updated_at: at };
  }

  if (!series) return { progress, tracker: { activeId: null, lastSeen: here }, completed: false };

  const next: ReadingSeries = {
    ...series,
    end: here.page,
    turns: series.turns + 1,
    surah: seen.surah ?? null,
    surah_id: seen.surah_id ?? null,
    updated_at: at,
  };
  if (next.end >= seen.lastPage) return complete();
  const others = progress.series.filter((s) => s.id !== next.id);
  return {
    progress: { ...progress, series: trim([next, ...others], next.id) },
    tracker: { activeId: next.id, lastSeen: here },
    completed: false,
  };
}

/** «تابع القراءة»: the turns that follow are added to the series it opens. */
export function resumeTracker(series: ReadingSeries): SeriesTracker {
  return { activeId: series.id, lastSeen: { page: series.end, mushaf_id: series.mushaf_id } };
}

const newest = (progress: ReadingProgress | null | undefined) =>
  Math.max(progress?.reset_at ?? 0, ...(progress?.series ?? []).map((s) => s.updated_at || 0));

/**
 * The account's copy replaces the device's when it changed after the device's
 * last change (another device read on, or reset).
 */
export function adoptNewerProgress(local: ReadingProgress, remote: ReadingProgress | null | undefined, stamp: number): ReadingProgress {
  if (!remote) return local;
  return newest(remote) > Math.max(stamp, newest(local)) ? { series: remote.series ?? [], reset_at: remote.reset_at ?? null } : local;
}

// --- The device copy and the tracker ------------------------------------------

type Stored = { progress: ReadingProgress; stamp: number };

const EMPTY: Stored = { progress: EMPTY_PROGRESS, stamp: 0 };
let current: Stored | null = null;
let tracker: SeriesTracker = { activeId: null, lastSeen: null };
const listeners = new Set<() => void>();

function load(): Stored {
  if (current) return current;
  current = EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (parsed?.progress && Array.isArray(parsed.progress.series)) {
      current = {
        progress: { series: parsed.progress.series.slice(0, READING_SERIES_LIMIT), reset_at: parsed.progress.reset_at ?? null },
        stamp: Number(parsed.stamp) || 0,
      };
    }
  } catch {
    /* private mode or a damaged copy: start empty */
  }
  return current;
}

export function readProgress(): Stored {
  return typeof window === "undefined" ? EMPTY : load();
}

export function serverProgress(): Stored {
  return EMPTY;
}

/** `stamp`: when this copy changed — now for a change made here, kept when adopting the account's. */
export function writeProgress(progress: ReadingProgress, stamp = now()): void {
  current = { progress, stamp };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* private mode: kept for this visit */
  }
  listeners.forEach((listener) => listener());
}

export function subscribeProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The tracker outlives the reader screen (it unmounts on phones), not the app. */
export function readTracker(): SeriesTracker {
  return tracker;
}

export function writeTracker(next: SeriesTracker): void {
  tracker = next;
}

/** Tests only. */
export function resetProgressForTests(): void {
  current = null;
  tracker = { activeId: null, lastSeen: null };
  listeners.clear();
}
