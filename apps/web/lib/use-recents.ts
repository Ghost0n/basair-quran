"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { RecentPage, RecentSearch } from "@q-basair/shared";

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
 * quietly (debounced, no app-wide state change) — for a guest on the web,
 * in the browser's own store (lib/guest-data.ts).
 */
export function useRecordRecents() {
  const { persistQuietly } = usePreferences();

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
  useEffect(() => {
    if (!ready) return;
    const local = readRecents();
    const pages = adoptNewer(local.pages, account.recent_pages, local.stamp);
    const searches = adoptNewer(local.searches, account.recent_searches, local.stamp);
    if (pages !== local.pages || searches !== local.searches) writeRecents({ pages, searches }, local.stamp);
  }, [ready, account.recent_pages, account.recent_searches]);
  return recents;
}
