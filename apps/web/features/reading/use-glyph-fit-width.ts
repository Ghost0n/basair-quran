"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Fit an authentic mushaf page to the WIDTH of the scroll column.
 *
 * The counterpart of `useGlyphFit` (paged: width + height) for continuous
 * scroll: the page's widest printed line is scaled to fill the available column
 * width and the page grows as tall as it needs — the column scrolls. Upscaling
 * beyond 1 is the point here (big readable text on a 16:9 desktop), bounded so
 * an ultra-wide column can't blow the glyphs up absurdly.
 *
 * `ref` wraps ONE `.qb-glyph-page`. The wrapper's own width is the budget, so
 * the hook needs no knowledge of the scroller; a ResizeObserver on the wrapper
 * re-fits on any column change. Width is pinned to the scaled content width so
 * justification has no slack to stretch (same trick as the paged fit).
 */
const MAX_SCALE = 2.4;
const MIN_SCALE = 0.3;

export function useGlyphFitWidth(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    const wrap = ref.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const page = wrap.querySelector<HTMLElement>(".qb-glyph-page");
      if (!page) return;

      // Reset to base scale / natural width for measurement.
      page.style.setProperty("--qcf-fit", "1");
      page.style.width = "";

      const availW = wrap.clientWidth;
      if (availW <= 0) return;

      const pcs = getComputedStyle(page);
      const chromeX =
        (parseFloat(pcs.paddingLeft) || 0) +
        (parseFloat(pcs.paddingRight) || 0) +
        (parseFloat(pcs.borderLeftWidth) || 0) +
        (parseFloat(pcs.borderRightWidth) || 0);

      // Intrinsic widest line at max-content (justification can't inflate it).
      const lines = Array.from(page.querySelectorAll<HTMLElement>(".qb-glyph-ayah"));
      lines.forEach((line) => {
        line.style.width = "max-content";
      });
      let maxW = 0;
      lines.forEach((line) => {
        if (line.offsetWidth > maxW) maxW = line.offsetWidth;
      });
      lines.forEach((line) => {
        line.style.width = "";
      });
      if (maxW <= 0) return;

      let scale = (availW - chromeX - 4) / maxW;
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

      page.style.setProperty("--qcf-fit", scale.toFixed(4));
      // A few px of slack so per-glyph rounding can't wrap a printed line.
      page.style.width = `${Math.ceil(maxW * scale) + chromeX + 8}px`;
    };

    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    schedule();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          if (!cancelled) schedule();
        })
        .catch(() => {});
    }

    const observer = new ResizeObserver(schedule);
    observer.observe(wrap);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      const page = wrap.querySelector<HTMLElement>(".qb-glyph-page");
      if (page) {
        page.style.width = "";
        page.style.removeProperty("--qcf-fit");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
