"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { QuranPageResponse } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const LAST_PAGE_KEY = "qbasair.mushaf.lastPage";
// The surah at the top of the last-read page — display sugar for the Home
// "continue reading" card (the page number stays the source of truth).
const LAST_SURAH_KEY = "qbasair.mushaf.lastSurah";

type LoadOptions = {
  selectedAyahId?: number | null;
  highlights?: number[];
  persist?: boolean;
};

/**
 * A far page jump worth a "travel" flourish — the gold wash + page-counter scrub
 * (see TravelOverlay). Emitted by `applyResult` when a load lands ≥ FAR_JUMP_MIN
 * pages from the last one, so every jump path (evidence, search, surah/juz,
 * footer page jump) gets the same ceremony without touching each call site. `id`
 * makes each jump a fresh, keyable event.
 */
export type TravelJump = { from: number; to: number; id: number };

// A jump this many pages or more is "travel", not a page turn. Adjacent turns
// (delta 1, or 2 for a spread) and the scroll reader's page-by-page streaming
// stay silent; only a real leap earns the wash + counter.
const FAR_JUMP_MIN = 5;

export type MushafController = {
  pageData: QuranPageResponse | null;
  isLoading: boolean;
  error: string | null;
  selectedAyahId: number | null;
  selectedHighlights: number[];
  pageDraft: string;
  /** A pending far-jump flourish, or null. Cleared by the overlay when done. */
  travel: TravelJump | null;
  clearTravel: () => void;
  bodyRef: RefObject<HTMLDivElement | null>;
  loadPage: (mushafId: number, page: number, options?: LoadOptions) => Promise<void>;
  loadByAyah: (mushafId: number, ayahId: number, highlights?: number[]) => Promise<void>;
  loadBySurah: (mushafId: number, surah: number, ayah?: number) => Promise<void>;
  loadByJuz: (mushafId: number, juz: number) => Promise<void>;
  /**
   * Swap the active page to one already fetched elsewhere (e.g. the scroll
   * reader's window) WITHOUT a network round-trip — keeps the footer/juz and the
   * persisted last-page in sync as the user scrolls. Suppresses the one
   * scroll-into-view pass so it can't fight the user's own scrolling.
   */
  setActivePage: (data: QuranPageResponse) => void;
  setPageDraft: (value: string) => void;
  reset: () => void;
  readLastPage: () => number;
};

const READER_ERROR = "حدث خطأ في تحميل صفحة المصحف.";
const NOT_FOUND = "تعذر تحميل صفحة المصحف.";

/**
 * Single source of truth for Quran-page reading state. Consumed by both
 * the Reading mode (MushafStage) and the legacy search workspace's reader,
 * so a page navigated in one place is consistent everywhere.
 */
function useMushafController(): MushafController {
  const [pageData, setPageData] = useState<QuranPageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAyahId, setSelectedAyahId] = useState<number | null>(null);
  const [selectedHighlights, setSelectedHighlights] = useState<number[]>([]);
  const [pageDraft, setPageDraft] = useState("");
  const [travel, setTravel] = useState<TravelJump | null>(null);
  // The last applied page + a monotonic id, for far-jump detection in applyResult.
  const prevPageRef = useRef<number | null>(null);
  const travelIdRef = useRef(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Set by setActivePage so the next scroll-into-view pass is skipped (the scroll
  // reader is already positioned; auto-centring the selection would fight it).
  const suppressScrollIntoViewRef = useRef(false);

  useEffect(() => {
    setPageDraft(pageData?.page ? String(pageData.page) : "");
  }, [pageData?.page]);

  useEffect(() => {
    if (suppressScrollIntoViewRef.current) {
      suppressScrollIntoViewRef.current = false;
      return;
    }
    if (!bodyRef.current) return;
    // Include the glyph reader's selection block (.qb-glyph-sel) so a saved/
    // jumped-to ayah scrolls into view there too, on the rare occasions the
    // authentic page can't fully fit and scrolls.
    const node = bodyRef.current.querySelector(
      ".qb-ayah-tok.selected, .quran-page-ayah.selected, .qb-glyph-sel",
    );
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [pageData]);

  const applyResult = useCallback((data: QuranPageResponse, persist: boolean) => {
    // Far-jump detection — the single choke-point every load path passes through.
    // Compare where we WERE to where we're landing; a big leap earns the travel
    // flourish. First load (prev null) and adjacent turns stay silent.
    const nextPage = data.page ?? null;
    const prevPage = prevPageRef.current;
    if (nextPage != null && prevPage != null && Math.abs(nextPage - prevPage) >= FAR_JUMP_MIN) {
      travelIdRef.current += 1;
      setTravel({ from: prevPage, to: nextPage, id: travelIdRef.current });
    }
    if (nextPage != null) prevPageRef.current = nextPage;
    setPageData(data);
    if (persist && data.page) {
      try {
        window.localStorage.setItem(LAST_PAGE_KEY, String(data.page));
        const surah = data.ayahs[0]?.surah;
        if (surah) window.localStorage.setItem(LAST_SURAH_KEY, surah);
      } catch {
        // localStorage unavailable (private mode) — last page just won't persist.
      }
    }
  }, []);

  const loadPage = useCallback(
    async (mushafId: number, page: number, options: LoadOptions = {}) => {
      setIsLoading(true);
      setError(null);
      if (options.highlights !== undefined) setSelectedHighlights(options.highlights);
      if (options.selectedAyahId !== undefined) setSelectedAyahId(options.selectedAyahId);
      try {
        const data = await api.getQuranPage(mushafId, page, options.selectedAyahId ?? undefined);
        if (!data.found) throw new Error(NOT_FOUND);
        applyResult(data, options.persist ?? false);
      } catch (err) {
        setError(err instanceof Error ? err.message : READER_ERROR);
      } finally {
        setIsLoading(false);
      }
    },
    [applyResult],
  );

  const loadByAyah = useCallback(
    async (mushafId: number, ayahId: number, highlights: number[] = []) => {
      setIsLoading(true);
      setError(null);
      setSelectedAyahId(ayahId);
      setSelectedHighlights(highlights);
      try {
        const data = await api.getQuranPageForAyah(mushafId, ayahId);
        if (!data.found) throw new Error(NOT_FOUND);
        applyResult(data, false);
      } catch (err) {
        setError(err instanceof Error ? err.message : READER_ERROR);
      } finally {
        setIsLoading(false);
      }
    },
    [applyResult],
  );

  const loadBySurah = useCallback(
    async (mushafId: number, surah: number, ayah?: number) => {
      setIsLoading(true);
      setError(null);
      setSelectedHighlights([]);
      try {
        const data = await api.getQuranPageForSurah(mushafId, surah, ayah);
        if (!data.found) throw new Error(NOT_FOUND);
        setSelectedAyahId(data.selected_ayah_id ?? null);
        applyResult(data, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : READER_ERROR);
      } finally {
        setIsLoading(false);
      }
    },
    [applyResult],
  );

  const loadByJuz = useCallback(
    async (mushafId: number, juz: number) => {
      setIsLoading(true);
      setError(null);
      setSelectedHighlights([]);
      try {
        const data = await api.getQuranPageForJuz(mushafId, juz);
        if (!data.found) throw new Error(NOT_FOUND);
        setSelectedAyahId(data.selected_ayah_id ?? null);
        applyResult(data, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : READER_ERROR);
      } finally {
        setIsLoading(false);
      }
    },
    [applyResult],
  );

  const setActivePage = useCallback(
    (data: QuranPageResponse) => {
      suppressScrollIntoViewRef.current = true;
      applyResult(data, true);
    },
    [applyResult],
  );

  const clearTravel = useCallback(() => setTravel(null), []);

  const reset = useCallback(() => {
    setPageData(null);
    setError(null);
    setSelectedAyahId(null);
    setSelectedHighlights([]);
    setPageDraft("");
    setTravel(null);
    prevPageRef.current = null;
  }, []);

  const readLastPage = useCallback(() => {
    try {
      const stored = Number(window.localStorage.getItem(LAST_PAGE_KEY) ?? "1");
      return Number.isFinite(stored) && stored >= 1 ? stored : 1;
    } catch {
      return 1;
    }
  }, []);

  return {
    pageData,
    isLoading,
    error,
    selectedAyahId,
    selectedHighlights,
    pageDraft,
    travel,
    clearTravel,
    bodyRef,
    loadPage,
    loadByAyah,
    loadBySurah,
    loadByJuz,
    setActivePage,
    setPageDraft,
    reset,
    readLastPage,
  };
}

const MushafContext = createContext<MushafController | null>(null);

export function MushafProvider({ children }: { children: ReactNode }) {
  const value = useMushafController();
  return <MushafContext.Provider value={value}>{children}</MushafContext.Provider>;
}

export function useMushaf(): MushafController {
  const ctx = useContext(MushafContext);
  if (!ctx) {
    throw new Error("useMushaf must be used within <MushafProvider>");
  }
  return ctx;
}
