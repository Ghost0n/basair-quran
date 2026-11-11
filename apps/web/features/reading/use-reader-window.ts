"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { QuranPageResponse } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

import { useMushaf } from "./mushaf-context";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Bound the loaded window so the DOM stays light. Once the cap is reached the
// window SLIDES: growing one edge prunes the far edge, so endless scrolling
// keeps a constant-size DOM. Anchor compensation keeps the view still.
const MAX_PAGES = 12;

// The scroll is "settled" once no scroll event or touch has come for this
// long. Anything that changes the content ABOVE the reading position (a page
// joining at the top, the top pages pruned) waits for it: iOS drops a
// scrollTop correction made during a fling, so the view would jump.
const SETTLE_MS = 160;

// Browsers that keep the view still themselves when content above it changes
// size (CSS scroll anchoring). iOS Safari doesn't.
const nativeAnchoring = () => typeof CSS !== "undefined" && CSS.supports?.("overflow-anchor", "auto") === true;

export type ScrollControls = { scrollByPage: (delta: number) => void };

type UseReaderWindowArgs = {
  mushafId: number;
  /** The current anchor page (MushafStage's pageData); a far jump resets the window. */
  anchorData: QuranPageResponse;
  totalPages: number;
  /** Lets MushafStage route the footer prev/next to a smooth in-place scroll. */
  registerControls: (controls: ScrollControls | null) => void;
  /**
   * Readies a page before it joins the window (its glyph layout and font), so
   * it is drawn once, in its final form, and never grows above the reader.
   */
  prepare?: (page: number) => Promise<void>;
  /**
   * Keep the view still by hand when a page above it changes size later (its
   * translations arriving…), where the browser has no scroll anchoring.
   */
  manualAnchor?: boolean;
};

const pageOf = (data: QuranPageResponse) => data.page ?? 0;

/**
 * useReaderWindow — the shared engine behind the continuous readers (scroll +
 * ayah). It keeps a sliding window of fetched pages around an anchor, streams
 * neighbours in by scroll proximity (plus a fill pass for short/initial pages),
 * prunes the far edge past the cap, tracks the top-of-viewport page (→ footer +
 * persisted last page via `setActivePage`), and registers a `scrollByPage`
 * control for the footer prev/next.
 *
 * View stability uses ANCHOR compensation: before a window mutation the active
 * page element's viewport offset is recorded; after render, scrollTop is nudged
 * so that element sits exactly where it was. This is exact for every case —
 * prepend, append, and a prune at either edge — unlike height arithmetic.
 *
 * The consuming component owns the scroll element (`mushaf.bodyRef`) and must
 * render each page inside a `.qb-scroll-page[data-page="N"]` wrapper — the DOM
 * contract this hook reads for page tracking, jumps, and anchoring. How the
 * ayahs inside are laid out is entirely the component's call.
 */
export function useReaderWindow({
  mushafId,
  anchorData,
  totalPages,
  registerControls,
  prepare,
  manualAnchor = false,
}: UseReaderWindowArgs): { pages: QuranPageResponse[] } {
  const mushaf = useMushaf();

  const [pages, setPages] = useState<QuranPageResponse[]>([anchorData]);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const loadingRef = useRef<Set<number>>(new Set());
  // Bumped when the window is reset (a jump): loads begun before it are dropped.
  const generationRef = useRef(0);
  const prevMushafRef = useRef(mushafId);

  // Anchor bookkeeping: the active page element's viewport top, captured just
  // before a window mutation, restored (via scrollTop) just after it renders.
  const anchorPosRef = useRef<{ page: number; top: number } | null>(null);

  // The page currently at the top of the viewport (drives footer + prev/next).
  const activePageRef = useRef<number>(anchorData.page ?? 1);
  const hasScrolledRef = useRef(false);

  // When the reader last scrolled or touched the page, and whether a finger is on it.
  const lastMoveRef = useRef(0);
  const touchingRef = useRef(false);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const whenSettled = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const check = () => {
          const quiet = performance.now() - lastMoveRef.current;
          if (!touchingRef.current && quiet >= SETTLE_MS) resolve();
          else window.setTimeout(check, Math.max(40, SETTLE_MS - quiet));
        };
        check();
      }),
    [],
  );

  // Capture the active page's viewport top just before a window mutation.
  const captureAnchor = useCallback(() => {
    const el = mushaf.bodyRef.current;
    const node = el?.querySelector<HTMLElement>(`.qb-scroll-page[data-page="${activePageRef.current}"]`);
    if (node) anchorPosRef.current = { page: activePageRef.current, top: node.getBoundingClientRect().top };
  }, [mushaf.bodyRef]);

  // Fetch a neighbour into the window (dedup guarded); growing past the cap
  // prunes the opposite edge so the window slides instead of stalling.
  const loadNeighbour = useCallback(
    async (page: number, side: "top" | "bottom") => {
      if (page < 1 || page > totalPages) return;
      if (loadingRef.current.has(page)) return;
      if (pagesRef.current.some((pg) => pageOf(pg) === page)) return;
      loadingRef.current.add(page);
      const generation = generationRef.current;
      try {
        const data = await api.getQuranPage(mushafId, page);
        if (!data.found || data.mushaf_id !== mushafId) return;
        // Drawn once, in its final form (its glyphs ready).
        await prepareRef.current?.(page).catch(() => undefined);
        // A page joining above the reader moves everything: not mid-fling.
        if (side === "top") await whenSettled();
        // The reader jumped elsewhere meanwhile: this page belongs to the old window.
        if (generation !== generationRef.current) return;
        if (mushaf.bodyRef.current) captureAnchor();
        setPages((prev) => {
          if (prev.some((pg) => pageOf(pg) === page)) return prev;
          let next = [...prev, data].sort((a, b) => pageOf(a) - pageOf(b));
          // Slide: a page at the top drops the bottom one at once (nothing
          // above the reader moves); a page at the bottom lets the top ones go
          // once the scroll settles (below).
          if (side === "top" && next.length > MAX_PAGES) next = next.slice(0, MAX_PAGES);
          return next;
        });
        if (side === "bottom") {
          await whenSettled();
          if (generation === generationRef.current && pagesRef.current.length > MAX_PAGES) {
            captureAnchor();
            setPages((prev) => (prev.length > MAX_PAGES ? prev.slice(prev.length - MAX_PAGES) : prev));
          }
        }
      } catch {
        /* a failed neighbour just isn't added; the reader stays usable */
      } finally {
        loadingRef.current.delete(page);
      }
    },
    [mushafId, totalPages, mushaf.bodyRef, whenSettled, captureAnchor],
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
    generationRef.current += 1;
    loadingRef.current.clear();
    anchorPosRef.current = null;
    activePageRef.current = page;
    hasScrolledRef.current = false;
    setPages([anchorData]);
    requestAnimationFrame(() => {
      const el = mushaf.bodyRef.current;
      if (!el) return;
      // A jump that targets a selected ayah is positioned by the selection
      // scroll-into-view (mushaf-context, block:center). Forcing scrollTop=0
      // here would beat it and land at the top of the page instead of the
      // verse — so only reset when the anchor page carries no selection.
      const hasSelection =
        anchorData.selected_ayah_id != null || anchorData.ayahs.some((a) => a.is_selected);
      if (hasSelection) return;
      el.scrollTop = 0;
    });
  }, [anchorData, mushafId, mushaf.bodyRef]);

  // Restore the anchor page to its pre-mutation viewport position.
  useLayoutEffect(() => {
    const el = mushaf.bodyRef.current;
    const anchor = anchorPosRef.current;
    anchorPosRef.current = null;
    if (!el || !anchor) return;
    const node = el.querySelector<HTMLElement>(`.qb-scroll-page[data-page="${anchor.page}"]`);
    if (!node) return; // anchor got pruned (shouldn't happen — it's in view)
    const delta = node.getBoundingClientRect().top - anchor.top;
    if (delta !== 0) el.scrollTop += delta;
  }, [pages, mushaf.bodyRef]);

  // LATE content swaps (a section above the viewport growing after its commit)
  // are covered differently per path. Unicode column: the browser's native CSS
  // scroll anchoring (overflow-anchor, on by default) compensates exactly — do
  // NOT add a manual ResizeObserver correction on top; it double-compensates
  // with the native one (measured). Authentic glyph column: the fit hook writes
  // `width` on the pages, which SUPPRESSES native anchoring — so
  // useGlyphFitWidth carries its own pre-paint anchor around every refit
  // (including the font swap-in that triggers it). The layout-effect above is
  // still required for React window mutations: it corrects pre-paint, so
  // whichever late-swap mechanism follows sees no displacement.

  // Where the browser has no scroll anchoring (iOS Safari), a page above the
  // reading position that changes size later (its translations arriving)
  // would push the text the reader is on: move the scroll by the same amount.
  // Pages joining the window are left to the layout effect above (they have
  // no size on record yet).
  useEffect(() => {
    const el = mushaf.bodyRef.current;
    if (!manualAnchor || !el || nativeAnchoring() || typeof ResizeObserver === "undefined") return;
    const heights = new WeakMap<Element, number>();
    const observer = new ResizeObserver((entries) => {
      const line = el.getBoundingClientRect().top + 72;
      let shift = 0;
      for (const entry of entries) {
        const height = (entry.target as HTMLElement).offsetHeight;
        const before = heights.get(entry.target);
        heights.set(entry.target, height);
        if (before === undefined || before === height) continue;
        if (entry.target.getBoundingClientRect().bottom <= line) shift += height - before;
      }
      if (shift) el.scrollTop += shift;
    });
    const watch = () => el.querySelectorAll(".qb-scroll-page").forEach((node) => observer.observe(node));
    watch();
    const mutations = new MutationObserver(watch);
    mutations.observe(el, { childList: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [manualAnchor, mushaf.bodyRef]);

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
      // Approaching the bottom → append the next page (window slides if full).
      if (el.scrollHeight - (el.scrollTop + el.clientHeight) < 700) {
        void loadNeighbour(Math.max(...loaded.map(pageOf)) + 1, "bottom");
      }
      // Approaching the top (only after a real scroll) → prepend the previous.
      if (el.scrollTop < 500 && hasScrolledRef.current) {
        void loadNeighbour(Math.min(...loaded.map(pageOf)) - 1, "top");
      }
    };
    const onScroll = () => {
      lastMoveRef.current = performance.now();
      if (!raf) raf = requestAnimationFrame(measure);
    };
    const onTouchStart = () => {
      touchingRef.current = true;
      lastMoveRef.current = performance.now();
    };
    const onTouchEnd = () => {
      touchingRef.current = false;
      lastMoveRef.current = performance.now();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
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
  // (beyond the window), re-anchor through the shared loader.
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
        // Scroll the page's own scroller only (scrollIntoView would also move
        // the shell canvas and push the reader bar off-screen).
        const top = el.scrollTop + node.getBoundingClientRect().top - el.getBoundingClientRect().top;
        el.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
      } else {
        void mushaf.loadPage(mushafId, target, { persist: true });
      }
    };
    registerControls({ scrollByPage });
    return () => registerControls(null);
  }, [registerControls, totalPages, mushafId, mushaf.bodyRef, mushaf.loadPage]);

  return { pages };
}
