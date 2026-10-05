/**
 * Verse durations kept outside the player, so they can be ready before it
 * opens: the app's start-up asks for the last-read surah's durations while the
 * splash is up, and the player starts from whatever is already known instead
 * of an estimated timeline.
 *
 * A surah's durations are immutable once every verse is known, so complete
 * lists are also kept on the device: the next launch (offline included) shows
 * exact times at once.
 */
import { createQBasairApiClient } from "@q-basair/api-client";

import { API_BASE_URL } from "@/lib/config";
import { ayahCount } from "@/lib/quran-ranges";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const STORAGE_KEY = "qb.recitation.durations";
/** Complete surahs kept on the device (the least recently stored go first). */
const STORED_MAX = 60;

/** "reciter:surah" -> seconds by verse (NaN = not known yet). */
const known = new Map<string, number[]>();
const inflight = new Map<string, Promise<void>>();
let stored: Record<string, number[]> | null = null;

export const durationKey = (reciterId: string, surah: number) => `${reciterId}:${surah}`;

function readStored(): Record<string, number[]> {
  if (stored) return stored;
  stored = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as Record<string, number[]>;
  } catch {
    /* no storage (private mode, tests): memory only */
  }
  return stored;
}

function writeStored(): void {
  if (!stored) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* quota or private mode: memory only */
  }
}

const isComplete = (list: number[]) => list.length > 0 && list.every((value) => Number.isFinite(value) && value > 0);

function entry(reciterId: string, surah: number): number[] {
  const key = durationKey(reciterId, surah);
  let list = known.get(key);
  if (!list) {
    const count = ayahCount(surah);
    const saved = readStored()[key];
    list = Array.from({ length: count }, (_, index) => {
      const value = saved?.[index];
      return typeof value === "number" && value > 0 ? value : Number.NaN;
    });
    known.set(key, list);
  }
  return list;
}

/** Keep a complete surah on the device (no-op until every verse is known). */
export function rememberDurations(reciterId: string, surah: number, list: number[]): void {
  if (!isComplete(list)) return;
  const key = durationKey(reciterId, surah);
  const all = readStored();
  if (all[key] && all[key].length === list.length) return;
  delete all[key];
  all[key] = list.map((value) => Math.round(value * 1000) / 1000);
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - STORED_MAX))) delete all[old];
  writeStored();
}

/** Merge server values into the shared list; true when something new was learnt. */
export function mergeDurations(reciterId: string, surah: number, values: (number | null)[]): boolean {
  const list = entry(reciterId, surah);
  let changed = false;
  values.forEach((value, index) => {
    if (index < list.length && typeof value === "number" && value > 0 && Number.isNaN(list[index])) {
      list[index] = value;
      changed = true;
    }
  });
  if (changed) rememberDurations(reciterId, surah, list);
  return changed;
}

/** A fresh copy of what is known for this surah (NaN where a verse isn't known yet). */
export function knownDurations(reciterId: string, surah: number): number[] {
  return entry(reciterId, surah).slice();
}

/**
 * Ask the server for a surah's durations ahead of the player (best-effort:
 * offline or unreachable just leaves the player to measure them itself).
 */
export function warmVerseDurations(reciterId: string, surah: number): Promise<void> {
  if (!reciterId || surah < 1 || surah > 114) return Promise.resolve();
  if (isComplete(entry(reciterId, surah))) return Promise.resolve();
  const key = durationKey(reciterId, surah);
  const pending = inflight.get(key);
  if (pending) return pending;
  const work = api
    .getReciterDurations(reciterId, surah)
    .then((answer) => {
      mergeDurations(reciterId, surah, answer.durations);
    })
    .catch(() => undefined)
    .finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}

/** Test hook: forget everything held in memory. */
export function resetVerseDurations(): void {
  known.clear();
  inflight.clear();
  stored = null;
}
