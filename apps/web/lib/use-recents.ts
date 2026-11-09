"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { RecentPage, RecentSearch } from "@q-basair/shared";

import { useAccountKeepsData } from "@/lib/account-keeps-data";
import { usePreferences } from "@/lib/preferences-context";
import {
  addRecentPage,
  addRecentSearch,
  adoptNewer,
  readRecents,
  serverRecents,
  subscribeRecents,
  writeRecents,
  type Recents,
} from "@/lib/recents";

/**
 * Writing the recents (the reader, the search): no subscription, so a page
 * turn never re-renders the screen that records it. Saved to the account
 * quietly (debounced, no app-wide state change) — on this device only for a
 * guest on the web (lib/account-keeps-data.ts).
 */
export function useRecordRecents() {
  const { persistQuietly: persistToAccount } = usePreferences();
  const keeps = useAccountKeepsData();
  const persistQuietly = useCallback(
    (patch: Parameters<typeof persistToAccount>[0]) => {
      if (keeps) persistToAccount(patch);
    },
    [keeps, persistToAccount],
  );

  const recordPage = useCallback(
    (entry: Omit<RecentPage, "at">) => {
      const local = readRecents();
      const pages = addRecentPage(local.pages, entry);
      writeRecents({ ...local, pages });
      persistQuietly({ recent_pages: pages });
    },
    [persistQuietly],
  );

  const recordSearch = useCallback(
    (entry: Omit<RecentSearch, "at">) => {
      const local = readRecents();
      const searches = addRecentSearch(local.searches, entry);
      if (searches === local.searches) return;
      writeRecents({ ...local, searches });
      persistQuietly({ recent_searches: searches });
    },
    [persistQuietly],
  );

  const clearRecents = useCallback(() => {
    writeRecents({ pages: [], searches: [] });
    persistQuietly({ recent_pages: [], recent_searches: [] });
  }, [persistQuietly]);

  return useMemo(() => ({ recordPage, recordSearch, clearRecents }), [recordPage, recordSearch, clearRecents]);
}

/** Showing the recents (Home, Settings): the device copy, the account's when newer. */
export function useRecents(): Recents {
  const recents = useSyncExternalStore(subscribeRecents, readRecents, serverRecents);
  const { ready, account } = usePreferences();
  const keeps = useAccountKeepsData();
  useEffect(() => {
    if (!ready || !keeps) return;
    const local = readRecents();
    const pages = adoptNewer(local.pages, account.recent_pages, local.stamp);
    const searches = adoptNewer(local.searches, account.recent_searches, local.stamp);
    if (pages !== local.pages || searches !== local.searches) writeRecents({ pages, searches }, local.stamp);
  }, [ready, keeps, account.recent_pages, account.recent_searches]);
  return recents;
}
