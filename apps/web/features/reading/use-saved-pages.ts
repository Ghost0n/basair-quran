"use client";

import { createContext, useCallback, useContext } from "react";

import { usePreferences } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

/** A page to (un)save — listed on Home to reopen the reader there. */
export type SavablePage = {
  page: number;
  mushaf_id: number;
  surah: string | null;
  surah_id: number | null;
};

/** The reader's saved pages (account preference `saved_pages`): check and toggle. */
export function useSavedPages() {
  const { preferences, updateAccount } = usePreferences();
  const pages = preferences.saved_pages ?? [];

  const isSaved = useCallback(
    (page: number, mushafId?: number | null) =>
      pages.some((entry) => entry.page === page && (!mushafId || !entry.mushaf_id || entry.mushaf_id === mushafId)),
    [pages],
  );

  const toggle = useCallback(
    (target: SavablePage) => {
      const saved = pages.some((entry) => entry.page === target.page && entry.mushaf_id === target.mushaf_id);
      const next = saved
        ? pages.filter((entry) => !(entry.page === target.page && entry.mushaf_id === target.mushaf_id))
        : [{ ...target, surah: target.surah ?? t("المصحف"), saved_at: Math.floor(Date.now() / 1000) }, ...pages];
      void updateAccount({ saved_pages: next }).catch(() => {});
    },
    [pages, updateAccount],
  );

  return { isSaved, toggle };
}

/**
 * Desktop: every page wears a ribbon at its upper-left corner — an outline on
 * an unsaved page, red on a saved one; a click (un)saves the page. Phones use
 * the floating bookmark button beside the reader bar instead (no ribbon).
 */
export type PageRibbons = {
  enabled: boolean;
  isSaved: (page: number) => boolean;
  toggle: (page: number, surahId: number | null) => void;
};

const PageRibbonsContext = createContext<PageRibbons>({ enabled: false, isSaved: () => false, toggle: () => {} });

export const PageRibbonsProvider = PageRibbonsContext.Provider;

export function usePageRibbons(): PageRibbons {
  return useContext(PageRibbonsContext);
}
