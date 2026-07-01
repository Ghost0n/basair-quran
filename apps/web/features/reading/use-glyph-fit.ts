"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Fit-to-width for the authentic QCF page.
 *
 * Each printed Madani line must stay on ONE visual line at any container width.
 * QCF glyph lines have a fixed natural width (tuned for a wide page), so on a
 * narrow viewport they would reflow onto several visual lines — breaking the
 * line-faithful layout. We measure the widest line's natural (single-line)
 * width and expose a uniform down-scale as the CSS var `--qcf-fit`, which the
 * line font-size multiplies. It only ever shrinks (never enlarges past the base
 * size — desktop already fits), so wide screens are untouched.
 *
 * Re-runs on container resize (ResizeObserver), web-font load (fonts.ready), and
 * whenever `deps` change (a new page/layout).
 */
export function useGlyphFit(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const lines = el.querySelectorAll<HTMLElement>(".qb-glyph-ayah");
      if (lines.length === 0) return;

      // Measure natural widths at the base size (scale reset to 1).
      el.style.setProperty("--qcf-fit", "1");

      const cs = getComputedStyle(el);
      const padStart = parseFloat(cs.paddingInlineStart) || 0;
      const padEnd = parseFloat(cs.paddingInlineEnd) || 0;
      const avail = el.clientWidth - padStart - padEnd;
      if (avail <= 0) return;

      // Force each line onto one line, read its natural width, then restore.
      // Batched (all writes, then all reads, then all writes) to limit reflow.
      lines.forEach((line) => {
        line.style.whiteSpace = "nowrap";
      });
      let maxNatural = 0;
      lines.forEach((line) => {
        if (line.scrollWidth > maxNatural) maxNatural = line.scrollWidth;
      });
      lines.forEach((line) => {
        line.style.whiteSpace = "";
      });

      if (maxNatural <= 0) return;
      // Shrink to fit; never grow past 1. A tiny safety margin (0.995) keeps the
      // last justified glyph off the edge.
      const scale = Math.min(1, (avail * 0.995) / maxNatural);
      el.style.setProperty("--qcf-fit", scale.toFixed(4));
    };

    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    schedule();
    // Glyph metrics are only correct once the page's web font is applied.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          if (!cancelled) schedule();
        })
        .catch(() => {});
    }

    const observer = new ResizeObserver(schedule);
    observer.observe(el);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
