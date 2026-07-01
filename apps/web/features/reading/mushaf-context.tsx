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

type LoadOptions = {
  selectedAyahId?: number | null;
  highlights?: number[];
  persist?: boolean;
};

export type MushafController = {
  pageData: QuranPageResponse | null;
  isLoading: boolean;
  error: string | null;
  selectedAyahId: number | null;
  selectedHighlights: number[];
  pageDraft: string;
  bodyRef: RefObject<HTMLDivElement | null>;
  loadPage: (mushafId: number, page: number, options?: LoadOptions) => Promise<void>;
  loadByAyah: (mushafId: number, ayahId: number, highlights?: number[]) => Promise<void>;
  loadBySurah: (mushafId: number, surah: number, ayah?: number) => Promise<void>;
  loadByJuz: (mushafId: number, juz: number) => Promise<void>;
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
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPageDraft(pageData?.page ? String(pageData.page) : "");
  }, [pageData?.page]);

  useEffect(() => {
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
    setPageData(data);
    if (persist && data.page) {
      try {
        window.localStorage.setItem(LAST_PAGE_KEY, String(data.page));
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

  const reset = useCallback(() => {
    setPageData(null);
    setError(null);
    setSelectedAyahId(null);
    setSelectedHighlights([]);
    setPageDraft("");
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
    bodyRef,
    loadPage,
    loadByAyah,
    loadBySurah,
    loadByJuz,
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
