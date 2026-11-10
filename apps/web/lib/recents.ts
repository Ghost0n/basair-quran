import type { RecentPage, RecentSearch } from "@q-basair/shared";

/**
 * Home's recents: the last places read and the last searches run.
 *
 * Both are account preferences (`recent_pages`, `recent_searches`): saved on
 * the server for a signed-in reader, on the device for a guest (and in a
 * guest backup). The device keeps a working copy, written on every change
 * WITHOUT a React re-render of the whole app (a page turn updates it), and
 * the copy with the newest entry wins when the account's arrives.
 */

/** How many of each Home keeps (models.api.RECENTS_LIMIT). */
export const RECENTS_LIMIT = 10;

/** Page turns this close to the last place read continue it rather than start a new one (a spread turns two). */
const TURN_SPAN = 2;

const STORAGE_KEY = "qb.recents";

export type Recents = { pages: RecentPage[]; searches: RecentSearch[] };

/** The device copy, with when it last changed (a clearing counts). */
type Stored = Recents & { stamp: number };

const now = () => Math.floor(Date.now() / 1000);

/**
 * A page reached in the reader. Turning on from the last place read moves
 * that place to the new page; anywhere else is a new place, first in the list
 * (an older entry for the same page goes).
 */
export function addRecentPage(list: RecentPage[], entry: Omit<RecentPage, "at"> & { at?: number }, limit = RECENTS_LIMIT): RecentPage[] {
  const item: RecentPage = { page: entry.page, mushaf_id: entry.mushaf_id, surah: entry.surah ?? null, at: entry.at ?? now() };
  const head = list[0];
  const continues = head && head.mushaf_id === item.mushaf_id && Math.abs(head.page - item.page) <= TURN_SPAN;
  const rest = (continues ? list.slice(1) : list).filter((p) => !(p.page === item.page && p.mushaf_id === item.mushaf_id));
  return [item, ...rest].slice(0, limit);
}

/** Compare searches as typed: spacing and Arabic diacritics don't make a new one. */
function searchKey(query: string): string {
  return query
    .normalize("NFC")
    .replace(/[ً-ٰٟۖ-ۭ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A search run: first in the list, once (the same words in the same mode). */
export function addRecentSearch(list: RecentSearch[], entry: Omit<RecentSearch, "at"> & { at?: number }, limit = RECENTS_LIMIT): RecentSearch[] {
  const query = entry.query.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!query) return list;
  const key = searchKey(query);
  const item: RecentSearch = { query, mode: entry.mode, at: entry.at ?? now() };
  return [item, ...list.filter((s) => !(s.mode === item.mode && searchKey(s.query) === key))].slice(0, limit);
}

const newest = (list: { at: number }[]) => list.reduce((max, item) => Math.max(max, item.at || 0), 0);

/**
 * The account's copy replaces the device's when it holds something newer than
 * the device's last change (another device read on) — so a list cleared here
 * doesn't come back from an older account copy.
 */
export function adoptNewer<T extends { at: number }>(local: T[], remote: T[] | null | undefined, stamp: number): T[] {
  if (!remote?.length) return local;
  return newest(remote) > Math.max(stamp, newest(local)) ? remote.slice(0, RECENTS_LIMIT) : local;
}

// --- The device copy ---------------------------------------------------------

const EMPTY: Stored = { pages: [], searches: [], stamp: 0 };
let current: Stored | null = null;
const listeners = new Set<() => void>();

function load(): Stored {
  if (current) return current;
  current = EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (parsed) {
      current = {
        pages: Array.isArray(parsed.pages) ? parsed.pages.slice(0, RECENTS_LIMIT) : [],
        searches: Array.isArray(parsed.searches) ? parsed.searches.slice(0, RECENTS_LIMIT) : [],
        stamp: Number(parsed.stamp) || 0,
      };
    }
  } catch {
    /* private mode or a damaged copy: start empty */
  }
  return current;
}

export function readRecents(): Stored {
  return typeof window === "undefined" ? EMPTY : load();
}

/** `stamp`: when this copy changed — now for a change made here, the account's newest entry when adopted. */
export function writeRecents(next: Recents, stamp = now()): void {
  current = { pages: next.pages, searches: next.searches, stamp };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode: kept for this visit */
  }
  listeners.forEach((listener) => listener());
}

export function subscribeRecents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function serverRecents(): Stored {
  return EMPTY;
}

/** Tests only: forget the device copy. */
export function resetRecentsForTests(): void {
  current = null;
  listeners.clear();
}
