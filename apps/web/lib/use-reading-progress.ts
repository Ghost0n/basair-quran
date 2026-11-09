"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { ReadingProgress, ReadingSeries } from "@q-basair/shared";

import { useAccountKeepsData } from "@/lib/account-keeps-data";
import { usePreferences } from "@/lib/preferences-context";
import {
  adoptNewerProgress,
  observePage,
  readProgress,
  readTracker,
  resumeTracker,
  serverProgress,
  subscribeProgress,
  writeProgress,
  writeTracker,
  type PageSeen,
} from "@/lib/reading-progress";

/**
 * Writing the reading progress (the reader, Home's «تابع», Settings): no
 * subscription, so a page turn never re-renders the screen that records it.
 * Saved to the account quietly (debounced, no app-wide state change) — on
 * this device only for a guest on the web (lib/account-keeps-data.ts).
 */
export function useRecordReading() {
  const { persistQuietly } = usePreferences();
  const keeps = useAccountKeepsData();

  const save = useCallback(
    (progress: ReadingProgress) => {
      writeProgress(progress);
      if (keeps) persistQuietly({ reading_progress: progress });
    },
    [keeps, persistQuietly],
  );

  /** A page on the reader's screen. */
  const notePage = useCallback(
    (seen: PageSeen & { surah?: string | null; surah_id?: number | null; lastPage: number }) => {
      const before = readProgress().progress;
      const result = observePage(before, readTracker(), seen);
      writeTracker(result.tracker);
      if (result.progress !== before) save(result.progress);
    },
    [save],
  );

  /** «تابع القراءة»: the next turns go on this series. */
  const resume = useCallback((series: ReadingSeries) => writeTracker(resumeTracker(series)), []);

  /** Settings: «تابع القراءة» starts again from Al-Fatiha. */
  const reset = useCallback(() => {
    writeTracker({ activeId: null, lastSeen: null });
    save({ series: [], reset_at: Math.floor(Date.now() / 1000) });
  }, [save]);

  return useMemo(() => ({ notePage, resume, reset }), [notePage, resume, reset]);
}

/** Showing the reading progress (Home, Settings): the device copy, the account's when newer. */
export function useReadingProgress(): ReadingProgress {
  const stored = useSyncExternalStore(subscribeProgress, readProgress, serverProgress);
  const { ready, account } = usePreferences();
  const keeps = useAccountKeepsData();
  useEffect(() => {
    if (!ready || !keeps) return;
    const local = readProgress();
    const adopted = adoptNewerProgress(local.progress, account.reading_progress, local.stamp);
    if (adopted !== local.progress) writeProgress(adopted, local.stamp);
  }, [ready, keeps, account.reading_progress]);
  return stored.progress;
}
