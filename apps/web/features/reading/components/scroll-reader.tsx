"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { QuranPageAyah, QuranPageResponse } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";

import { AyatFlow, type WordClickHandler, type WordKeyHandler } from "./ayat-flow";
import { MorphPopover, type MorphTarget } from "./morph-popover";
import { useMushaf } from "../mushaf-context";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Bound the loaded window so the DOM stays light. No pruning in this pass — once
// the cap is reached, auto-loading pauses; the footer (or a surah/juz jump)
// re-anchors and starts a fresh window. Windowed virtualization is future work.
const MAX_PAGES = 12;

export type ScrollControls = { scrollByPage: (delta: number) => void };

type ScrollReaderProps = {
  mushafId: number;
  /** The current anchor page (MushafStage's pageData); a far jump resets the window. */
  anchorData: QuranPageResponse;
  totalPages: number;
  selectedAyahId: number | null;
  isSaved: (ayahId: number) => boolean;
  onToggleSave: (ayah: QuranPageAyah) => void;
  onWordClick: WordClickHandler;
  onWordKey: WordKeyHandler;
  morphTarget: MorphTarget | null;
  onClearMorph: () => void;
  /** Lets MushafStage route the footer prev/next to a smooth in-place scroll. */
  registerControls: (controls: ScrollControls | null) => void;
};

/**
 * ScrollReader — continuous vertical reading: pages stacked in the
 * `.qb-mushaf-page` scroller, neighbours streamed in as you approach either
 * edge. The document never scrolls (the app-shell caps height); only this
 * viewport does. As the top-of-viewport page changes it becomes the active page
 * (footer + persisted last page), via `setActivePage` so no refetch happens.
 *
 * Renders the Unicode reader for every riwāyah — authentic glyph pages are not
 * yet fit-to-width in scroll mode (future work), so scroll degrades to Unicode.
 */
export function ScrollReader({
  mushafId,
  anchorData,
  totalPages,
  selectedAyahId,
  isSaved,
  onToggleSave,
  onWordClick,
  onWordKey,
  morphTarget,
  onClearMorph,
  registerControls,
}: ScrollReaderProps) {
  const mushaf = useMushaf();
  const formatNumber = useNumerals();

  const [pages, setPages] = useState<QuranPageResponse[]>([anchorData]);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const loadingRef = useRef<Set<number>>(new Set());
  const prevMushafRef = useRef(mushafId);

  // Scroll-compensation bookkeeping: keep the first-visible page fixed when a
  // page is prepended above it (adding height above the viewport would jump it).
  const preScrollRef = useRef<{ height: number; top: number } | null>(null);
  const firstPageRef = useRef<number | null>(anchorData.page ?? null);

  // The page currently at the top of the viewport (drives footer + prev/next).
  const activePageRef = useRef<number>(anchorData.page ?? 1);
  const hasScrolledRef = useRef(false);

  const pageOf = (data: QuranPageResponse) => data.page ?? 0;

  // Fetch a neighbour into the window (dedup + cap guarded). `side` records which
  // edge grew, so the layout effect can compensate a top insertion.
  const loadNeighbour = useCallback(
    async (page: number, side: "top" | "bottom") => {
      if (page < 1 || page > totalPages) return;
      if (loadingRef.current.has(page)) return;
      if (pagesRef.current.some((pg) => pageOf(pg) === page)) return;
      if (pagesRef.current.length >= MAX_PAGES) return;
      loadingRef.current.add(page);
      try {
        const data = await api.getQuranPage(mushafId, page);
        if (!data.found || data.mushaf_id !== mushafId) return;
        const el = mushaf.bodyRef.current;
        if (el && side === "top") {
          preScrollRef.current = { height: el.scrollHeight, top: el.scrollTop };
        }
        setPages((prev) => {
          if (prev.some((pg) => pageOf(pg) === page)) return prev;
          return [...prev, data].sort((a, b) => pageOf(a) - pageOf(b));
        });
      } catch {
        /* a failed neighbour just isn't added; the reader stays usable */
      } finally {
        loadingRef.current.delete(page);
      }
    },
    [mushafId, totalPages, mushaf.bodyRef],
  );

  // Reset the window when the anchor moves out of it (a surah/juz/page jump) or
  // the riwāyah changes. Same-riwāyah in-window changes (our own setActivePage
  // echoes) are ignored so scrolling doesn't thrash the window.
  useEffect(() => {
    const page = anchorData.page ?? 1;
    const mushafChanged = prevMushafRef.current !== mushafId;
    prevMushafRef.current = mushafId;
    const inWindow = !mushafChanged && pagesRef.current.some((pg) => pageOf(pg) === page);
    if (inWindow) return;
    loadingRef.current.clear();
    preScrollRef.current = null;
    firstPageRef.current = page;
    activePageRef.current = page;
    hasScrolledRef.current = false;
    setPages([anchorData]);
    requestAnimationFrame(() => {
      if (mushaf.bodyRef.current) mushaf.bodyRef.current.scrollTop = 0;
    });
  }, [anchorData, mushafId, mushaf.bodyRef]);

  // Compensate scrollTop after a prepend so the previously-first page stays put.
  useLayoutEffect(() => {
    const el = mushaf.bodyRef.current;
    const newFirst = pages.length ? pageOf(pages[0]) : null;
    const prevFirst = firstPageRef.current;
    if (el && prevFirst != null && newFirst != null && newFirst < prevFirst && preScrollRef.current) {
      const delta = el.scrollHeight - preScrollRef.current.height;
      el.scrollTop = preScrollRef.current.top + delta;
    }
    firstPageRef.current = newFirst;
    preScrollRef.current = null;
  }, [pages, mushaf.bodyRef]);

  // On scroll: (1) mark the top-of-viewport page active (footer + persistence),
  // and (2) stream neighbours in by proximity. Scroll-driven loading is used
  // instead of IntersectionObserver so a sentinel that stays continuously in
  // view (short pages) can't silently stop firing.
  useEffect(() => {
    const el = mushaf.bodyRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      if (el.scrollTop > 4) hasScrolledRef.current = true;
      const rootTop = el.getBoundingClientRect().top;
      const nodes = el.querySelectorAll<HTMLElement>(".qb-scroll-page");
      for (const node of nodes) {
        const r = node.getBoundingClientRect();
        // The page straddling a line ~72px below the viewport top is "current".
        if (r.top - rootTop <= 72 && r.bottom - rootTop > 72) {
          const page = Number(node.dataset.page);
          if (page && page !== activePageRef.current) {
            activePageRef.current = page;
            const data = pagesRef.current.find((pg) => pageOf(pg) === page);
            if (data) mushaf.setActivePage(data);
          }
          break;
        }
      }
      const loaded = pagesRef.current;
      if (loaded.length >= MAX_PAGES) return;
      // Approaching the bottom → append the next page.
      if (el.scrollHeight - (el.scrollTop + el.clientHeight) < 700) {
        void loadNeighbour(Math.max(...loaded.map(pageOf)) + 1, "bottom");
      }
      // Approaching the top (only after a real scroll) → prepend the previous.
      if (el.scrollTop < 500 && hasScrolledRef.current) {
        void loadNeighbour(Math.min(...loaded.map(pageOf)) - 1, "top");
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mushaf.bodyRef, mushaf.setActivePage, loadNeighbour]);

  // Fill the viewport: while the stacked pages don't yet overflow, keep loading
  // downward. This covers short pages (Al-Fatiha) and the initial mount, where a
  // scroll can't be triggered because there's nothing to scroll yet.
  useEffect(() => {
    const el = mushaf.bodyRef.current;
    if (!el || pages.length >= MAX_PAGES) return;
    if (el.scrollHeight <= el.clientHeight + 4) {
      const maxP = Math.max(...pages.map(pageOf));
      if (maxP < totalPages) void loadNeighbour(maxP + 1, "bottom");
    }
  }, [pages, loadNeighbour, totalPages, mushaf.bodyRef]);

  // Footer prev/next → smooth scroll to the adjacent page. If it isn't loaded
  // (beyond the cap), re-anchor through the shared loader.
  useEffect(() => {
    const scrollByPage = (delta: number) => {
      const target = activePageRef.current + delta;
      if (target < 1 || target > totalPages) return;
      const el = mushaf.bodyRef.current;
      const node = el?.querySelector<HTMLElement>(`.qb-scroll-page[data-page="${target}"]`);
      if (el && node) {
        const reduce =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        node.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      } else {
        void mushaf.loadPage(mushafId, target, { persist: true });
      }
    };
    registerControls({ scrollByPage });
    return () => registerControls(null);
  }, [registerControls, totalPages, mushafId, mushaf.bodyRef, mushaf.loadPage]);

  return (
    <div className="qb-mushaf-page is-scroll" ref={mushaf.bodyRef} onClick={onClearMorph}>
      {pages.map((pg) => (
        <section className="qb-scroll-page" data-page={pageOf(pg)} key={`${mushafId}-${pageOf(pg)}`}>
          <AyatFlow
            ayahs={pg.ayahs}
            selectedAyahId={selectedAyahId}
            isSaved={isSaved}
            onToggleSave={onToggleSave}
            onWordClick={onWordClick}
            onWordKey={onWordKey}
          />
          <div className="qb-scroll-page-mark" aria-hidden>
            صفحة {formatNumber(pageOf(pg))}
          </div>
        </section>
      ))}
      {morphTarget ? <MorphPopover target={morphTarget} onClose={onClearMorph} /> : null}
    </div>
  );
}
