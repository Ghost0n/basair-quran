import type { ReadingPosition } from "@q-basair/shared";

/**
 * Where the reader opens, and how it recovers when that first load fails.
 *
 * The first attempt resumes at the exact last-read verse (`last_position`).
 * Every later attempt opens the plain page instead (the position's page in
 * this mushaf, else the last page read on this device): a saved verse the
 * server can't answer for must never keep the reader on an error screen.
 */
export type ReaderOpenPlan =
  | { kind: "ayah"; ayahId: number }
  | { kind: "surah"; surah: number; ayah: number }
  | { kind: "page"; page: number };

export function readerOpenPlan({
  position,
  mushafId,
  lastPage,
  attempt,
}: {
  position: ReadingPosition | null | undefined;
  mushafId: number;
  lastPage: number;
  attempt: number;
}): ReaderOpenPlan {
  const sameMushaf = position?.mushaf_id === mushafId;
  if (attempt === 0) {
    if (position?.ayah_id && sameMushaf) return { kind: "ayah", ayahId: position.ayah_id };
    // A verse saved in another riwāyah (ayah ids are per-mushaf) resumes by its
    // surah:ayah reference in the current edition.
    if (position?.surah && position.ayah) return { kind: "surah", surah: position.surah, ayah: position.ayah };
  }
  const page = sameMushaf && position?.page && position.page >= 1 ? position.page : lastPage;
  return { kind: "page", page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1 };
}

/** Automatic retries of a failed first load: soon, then less often, then only on demand. */
const AUTO_RETRY_DELAYS_MS = [1000, 3000, 8000];

/** The wait before automatic attempt `attempt` (1 = the first retry), or null when it's the reader's turn to ask. */
export function readerRetryDelay(attempt: number): number | null {
  return AUTO_RETRY_DELAYS_MS[attempt - 1] ?? null;
}
