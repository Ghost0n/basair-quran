"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Fit the authentic mushaf page(s) to the reading area — width AND height.
 *
 * Works for a single page or a two-page facing spread: every `.qb-glyph-page`
 * inside `ref` is scaled by ONE uniform factor so that
 *  1. each page fits the available height (one page, no scroll), and
 *  2. all pages sit side by side within the available width.
 * Each page's width is then pinned to its own scaled content width so full
 * justification has no slack to stretch (no giant word gaps); CSS centres the
 * group. Below a scale floor the area is allowed to scroll rather than render
 * illegibly small.
 *
 * `ref` is the spread container (`.qb-glyph-spread`); the scroll viewport
 * (`.qb-mushaf-page`) gives the size budget and the stage is the resize trigger
 * (its size is independent of the viewport's scrollbar, so pinning page widths
 * can't feed back into the observer).
 *
 * Re-runs on stage resize, web-font load, and page/spread change (deps).
 */
const MAX_SCALE = 1;
// Low floor so "one screen, no scroll" wins even with a large font preference;
// below it the page is allowed to scroll rather than become unreadable.
const MIN_SCALE = 0.3;

export function useGlyphFit(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const viewport = container.closest<HTMLElement>(".qb-mushaf-page") ?? container.parentElement;
    const trigger = container.closest<HTMLElement>(".qb-mushaf-stage") ?? viewport;
    if (!viewport || !trigger) return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const pages = Array.from(container.querySelectorAll<HTMLElement>(".qb-glyph-page"));
      if (pages.length === 0) return;

      // Reset to base size / natural width for measurement.
      pages.forEach((page) => {
        page.style.setProperty("--qcf-fit", "1");
        page.style.width = "";
      });

      const cs = getComputedStyle(viewport);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const availW = viewport.clientWidth - padX;
      const availH = viewport.clientHeight - padY;
      if (availW <= 0 || availH <= 0) return;

      const gap = parseFloat(getComputedStyle(container).columnGap) || 0;

      // Per page: intrinsic widest line width (max-content, so justification
      // doesn't inflate it), natural single-line height, and the page's own
      // padding+border (which sit outside the content width under border-box).
      const metrics = pages.map((page) => {
        const pcs = getComputedStyle(page);
        const chromeX =
          (parseFloat(pcs.paddingLeft) || 0) +
          (parseFloat(pcs.paddingRight) || 0) +
          (parseFloat(pcs.borderLeftWidth) || 0) +
          (parseFloat(pcs.borderRightWidth) || 0);
        const lines = Array.from(page.querySelectorAll<HTMLElement>(".qb-glyph-ayah"));
        lines.forEach((line) => {
          line.style.width = "max-content";
        });
        let maxW = 0;
        lines.forEach((line) => {
          if (line.offsetWidth > maxW) maxW = line.offsetWidth;
        });
        const naturalH = page.scrollHeight;
        lines.forEach((line) => {
          line.style.width = "";
        });
        return { maxW, naturalH, chromeX };
      });

      const maxNaturalH = Math.max(...metrics.map((m) => m.naturalH));
      const sumMaxW = metrics.reduce((sum, m) => sum + m.maxW, 0);
      if (maxNaturalH <= 0 || sumMaxW <= 0) return;

      const totalGap = gap * (pages.length - 1);
      const totalChromeX = metrics.reduce((sum, m) => sum + m.chromeX, 0);
      // Height headroom absorbs fixed page padding + banner margins (unscaled).
      const heightScale = (availH * 0.97) / maxNaturalH;
      const widthScale = (availW * 0.997 - totalGap - totalChromeX) / sumMaxW;
      let scale = Math.min(MAX_SCALE, heightScale, widthScale);
      scale = Math.max(scale, MIN_SCALE);

      const apply = (s: number) => {
        pages.forEach((page, index) => {
          page.style.setProperty("--qcf-fit", s.toFixed(4));
          // Content width + the page's own padding/border (border-box), plus a
          // few px of slack so per-glyph rounding can't push a line into a wrap
          // (one wrap would cascade into a height overflow → scrollbar).
          page.style.width = `${Math.ceil(metrics[index].maxW * s) + metrics[index].chromeX + 8}px`;
        });
      };
      apply(scale);

      // Correction pass: fixed bits that don't scale with the font (page
      // padding, a surah banner's margins) can make the linear estimate
      // overshoot the height. If the tallest page still exceeds the budget,
      // nudge the scale down once so the whole page fits without scrolling.
      let tallest = 0;
      pages.forEach((page) => {
        if (page.offsetHeight > tallest) tallest = page.offsetHeight;
      });
      if (tallest > availH) {
        const corrected = Math.max(MIN_SCALE, (scale * availH * 0.98) / tallest);
        if (corrected < scale) apply(corrected);
      }
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
    observer.observe(trigger);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      container.querySelectorAll<HTMLElement>(".qb-glyph-page").forEach((page) => {
        page.style.width = "";
        page.style.removeProperty("--qcf-fit");
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
