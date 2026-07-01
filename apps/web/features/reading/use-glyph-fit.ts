"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Fit an authentic QCF page to its viewport — both width AND height.
 *
 * Three goals:
 *  1. One page, no scroll — the printed lines fit within the reader's height.
 *  2. No stretched spacing — on a wide screen we must NOT let justification
 *     spread the words edge-to-edge. The page is pinned to exactly the (scaled)
 *     natural line width and centred, so full justification only fills the line
 *     the way the printed mushaf does, never the whole monitor.
 *  3. Never enlarge past the base reading size, and never shrink below a floor
 *     (below which the page is allowed to scroll rather than become unreadable).
 *
 * How: measure the widest line's natural single-line width and the page's
 * natural single-line height at base size, then take the largest uniform scale
 * that fits both the available width and height. The scale drives the
 * `--qcf-fit` CSS var (font-size + line gaps); the page width is pinned to the
 * scaled natural width so justification has no slack.
 *
 * Re-runs on reader resize (ResizeObserver on the stage — decoupled from the
 * page's own scrollbar so pinning the width can't feed back into a loop), on
 * web-font load, and on page change (deps).
 */
const MAX_SCALE = 1;
// Floor is low so "one page, no scroll" wins even for a large font preference;
// below this the page is allowed to scroll rather than become unreadable.
const MIN_SCALE = 0.3;

export function useGlyphFit(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // The scroll viewport gives the height/width budget; the stage is a stable
    // resize trigger (its size doesn't change when the viewport's scrollbar
    // toggles, so pinning the page width can't cause an observer feedback loop).
    const viewport = el.closest<HTMLElement>(".qb-mushaf-page") ?? el.parentElement;
    const trigger = el.closest<HTMLElement>(".qb-mushaf-stage") ?? viewport;
    if (!viewport || !trigger) return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const lines = el.querySelectorAll<HTMLElement>(".qb-glyph-ayah");
      if (lines.length === 0) return;

      // Measure at base size with no width cap.
      el.style.setProperty("--qcf-fit", "1");
      el.style.width = "";

      const cs = getComputedStyle(viewport);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const availW = viewport.clientWidth - padX;
      const availH = viewport.clientHeight - padY;
      if (availW <= 0 || availH <= 0) return;

      // Natural widest single-line width + natural single-line page height.
      // `width: max-content` gives the intrinsic (un-justified) line width —
      // measuring scrollWidth alone would just report the justified box width.
      lines.forEach((line) => {
        line.style.width = "max-content";
      });
      let maxW = 0;
      lines.forEach((line) => {
        if (line.offsetWidth > maxW) maxW = line.offsetWidth;
      });
      const naturalH = el.scrollHeight;
      lines.forEach((line) => {
        line.style.width = "";
      });
      if (maxW <= 0 || naturalH <= 0) return;

      // Largest uniform scale that fits both axes (with a hair of safety),
      // clamped so we never enlarge past base nor shrink into illegibility.
      const widthScale = (availW * 0.997) / maxW;
      // A little extra height headroom: some pages carry a surah banner whose
      // fixed margins don't scale with the font, so keep clear of the edge.
      const heightScale = (availH * 0.97) / naturalH;
      let scale = Math.min(MAX_SCALE, widthScale, heightScale);
      scale = Math.max(scale, MIN_SCALE);

      el.style.setProperty("--qcf-fit", scale.toFixed(4));
      // Pin the page to the width the content needs, plus a few px so per-glyph
      // rounding at the scaled size can't push the widest line into a wrap (a
      // single wrap would cascade into a height overflow → scrollbar). The small
      // slack costs only a hair of justified spacing.
      const pageW = Math.min(availW, Math.ceil(maxW * scale) + 8);
      el.style.width = `${pageW}px`;
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
      el.style.width = "";
      el.style.removeProperty("--qcf-fit");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
