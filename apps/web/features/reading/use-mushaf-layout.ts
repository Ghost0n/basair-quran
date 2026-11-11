"use client";

import { useEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { MushafPageLayoutResponse } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

import { loadPageFonts, prefetchPageFont } from "./qcf-font-loader";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// Layouts are immutable per (mushaf, page): keep recent ones so a prefetched or
// revisited page renders without a network round trip. `null` = no usable
// authentic layout for that page (non-Hafs / empty) — also worth remembering.
const LAYOUT_CACHE_MAX = 48;
const layoutCache = new Map<string, Promise<MushafPageLayoutResponse | null>>();
// Layouts whose glyph fonts are loaded too: a page drawn from here shows its
// glyphs from its first frame (no text stand-in swapped out a moment later,
// which would move whatever is below it).
const readyLayouts = new Map<string, MushafPageLayoutResponse>();

function markReady(mushafId: number, page: number, data: MushafPageLayoutResponse): void {
  const key = `${mushafId}:${page}`;
  readyLayouts.delete(key);
  readyLayouts.set(key, data);
  if (readyLayouts.size > LAYOUT_CACHE_MAX) {
    const oldest = readyLayouts.keys().next().value;
    if (oldest !== undefined) readyLayouts.delete(oldest);
  }
}

/** The page's layout when it and its glyph font are both ready, else null. */
export function readyMushafLayout(mushafId: number | null | undefined, page: number | null | undefined): MushafPageLayoutResponse | null {
  if (!mushafId || !page) return null;
  return readyLayouts.get(`${mushafId}:${page}`) ?? null;
}

function fetchLayout(mushafId: number, page: number): Promise<MushafPageLayoutResponse | null> {
  const key = `${mushafId}:${page}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;
  const promise = api
    .getMushafPageLayout(mushafId, page)
    .then((data) => (!data.found || data.fallback || !data.lines || data.lines.length === 0 ? null : data))
    .catch(() => {
      layoutCache.delete(key); // allow a retry
      return null;
    });
  layoutCache.set(key, promise);
  if (layoutCache.size > LAYOUT_CACHE_MAX) {
    const oldest = layoutCache.keys().next().value;
    if (oldest !== undefined) layoutCache.delete(oldest);
  }
  return promise;
}

/** Warm a page's layout + glyph font so turning to it is instant. Best-effort. */
export function prefetchMushafLayout(mushafId: number | null | undefined, page: number, totalPages = 604): void {
  if (!mushafId || page < 1 || page > totalPages) return;
  void fetchLayout(mushafId, page).then((data) => {
    if (data) prefetchPageFont(data.font_base_path ?? "", page);
  });
}

/**
 * Make a page ready to draw: its layout and its glyph font, awaited (the app's
 * start-up warm-up), then the neighbouring pages in the background.
 */
export async function warmMushafPage(mushafId: number, page: number, totalPages = 604): Promise<void> {
  const data = await fetchLayout(mushafId, page);
  if (!data) return;
  if (await loadPageFonts(data.font_base_path ?? "", page)) markReady(mushafId, page, data);
  prefetchMushafLayout(mushafId, page + 1, totalPages);
  prefetchMushafLayout(mushafId, page - 1, totalPages);
}

type MushafLayoutState = {
  /** The usable authentic layout — non-null only when found AND the page font is ready. */
  layout: MushafPageLayoutResponse | null;
  /**
   * The first authentic page is still on its way (layout + glyph font). The
   * reader shows an empty page frame meanwhile, never the Unicode text: the
   * text stands in only when the authentic page really is unavailable.
   */
  pending: boolean;
};

/**
 * useMushafLayout — fetch the authentic QCF page layout for the current page and
 * load its glyph fonts, returning the layout only once it is fully usable.
 *
 * It is fallback-safe by construction: when authentic mode is off, the page is
 * non-Hafs (endpoint returns `fallback: "reader"`), the layout is empty, or the
 * page font fails to load, `layout` stays null and the caller keeps rendering
 * the Unicode reader. Because the layout becomes usable only after fonts load,
 * the simple reader naturally serves as the always-legible placeholder (no FOUT).
 *
 * Selection is intentionally NOT a fetch input — `selectedAyahId` is applied
 * client-side in GlyphPage (word.ayah_id === selectedAyahId), so changing the
 * selection never refetches the layout.
 */
export function useMushafLayout({
  enabled,
  mushafId,
  page,
}: {
  enabled: boolean;
  mushafId: number | null | undefined;
  page: number | null | undefined;
}): MushafLayoutState {
  // A page made ready beforehand (warmMushafPage) draws its glyphs at once.
  const [layout, setLayout] = useState<MushafPageLayoutResponse | null>(() => (enabled ? readyMushafLayout(mushafId, page) : null));
  const [pending, setPending] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled || !mushafId || !page) {
      setLayout(null);
      setPending(false);
      return;
    }
    const request = ++requestRef.current;
    const ready = readyMushafLayout(mushafId, page);
    if (ready) {
      setLayout(ready);
      setPending(false);
      return;
    }
    // While a later page loads, the current one stays on screen (no frame);
    // only a reader with nothing to show yet waits on the empty frame.
    setPending(true);
    let cancelled = false;
    const isCurrent = () => !cancelled && request === requestRef.current;

    void (async () => {
      try {
        const data = await fetchLayout(mushafId, page);
        if (!isCurrent()) return;
        // Not Hafs / no layout tables / empty page → stay on the Unicode reader.
        if (!data) {
          setLayout(null);
          setPending(false);
          return;
        }
        const base = data.font_base_path ?? "";
        const fontsReady = await loadPageFonts(base, page);
        if (!isCurrent()) return;
        if (!fontsReady) {
          setLayout(null);
          setPending(false);
          return;
        }
        markReady(mushafId, page, data);
        setLayout(data);
        setPending(false);
        // Warm the neighbouring page fonts so navigation is instant.
        prefetchPageFont(base, page + 1);
        prefetchPageFont(base, page - 1);
      } catch {
        if (isCurrent()) {
          setLayout(null);
          setPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, mushafId, page]);

  return { layout, pending };
}
