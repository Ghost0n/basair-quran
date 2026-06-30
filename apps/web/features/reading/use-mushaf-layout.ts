"use client";

import { useEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { MushafPageLayoutResponse } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

import { loadPageFonts, prefetchPageFont } from "./qcf-font-loader";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

type MushafLayoutState = {
  /** The usable authentic layout — non-null only when found AND the page font is ready. */
  layout: MushafPageLayoutResponse | null;
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
  const [layout, setLayout] = useState<MushafPageLayoutResponse | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled || !mushafId || !page) {
      setLayout(null);
      return;
    }
    const request = ++requestRef.current;
    let cancelled = false;
    const isCurrent = () => !cancelled && request === requestRef.current;

    void (async () => {
      try {
        const data = await api.getMushafPageLayout(mushafId, page);
        if (!isCurrent()) return;
        // Not Hafs / no layout tables / empty page → stay on the Unicode reader.
        if (!data.found || data.fallback || !data.lines || data.lines.length === 0) {
          setLayout(null);
          return;
        }
        const base = data.font_base_path ?? "";
        const fontsReady = await loadPageFonts(base, page);
        if (!isCurrent()) return;
        if (!fontsReady) {
          setLayout(null);
          return;
        }
        setLayout(data);
        // Warm the neighbouring page fonts so navigation is instant.
        prefetchPageFont(base, page + 1);
        prefetchPageFont(base, page - 1);
      } catch {
        if (isCurrent()) setLayout(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, mushafId, page]);

  return { layout };
}
