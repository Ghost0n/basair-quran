"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Fit the authentic mushaf pages of the SCROLL column to its width — with ONE
 * uniform scale for every page.
 *
 * The counterpart of `useGlyphFit` (paged: width + height) for continuous
 * scroll. Per-page fitting is wrong here: each QCF page font has its own glyph
 * metrics, so fitting every page to its own widest line gives adjacent pages
 * different text sizes — and pages that hit the scale cap end up with visibly
 * narrower cards. A muṣḥaf's leaves are physically identical, so instead:
 *
 *  1. every full page's widest printed line is measured at base scale;
 *  2. one shared scale is computed from the GLOBAL widest line;
 *  3. every full page gets that same scale and the same pinned card width —
 *     native justification stretches each line edge-to-edge, exactly like print.
 *
 * Opening pages (1–2 and the final page, `.is-opening`, framed short lines)
 * keep their narrow centred card: `min(uniform, own-fit)` so the frame never
 * explodes.
 *
 * SCROLL SAFETY — the measure pass is self-anchoring. Resetting pages to base
 * scale shrinks `scrollHeight` (upscale is the norm on desktop), which would let
 * the browser CLAMP `scrollTop` mid-measure; and because this hook writes
 * `width` on the pages, native CSS scroll anchoring is suppressed for the whole
 * column. So `measure()` records the section at the viewport top before
 * touching anything and restores its offset after applying the final scale —
 * all inside one pre-paint rAF, so nothing is visible. For the same reason the
 * hook mounts ONCE (observers drive refits): a deps-cleanup would reset scales
 * mid-commit and poison `useReaderWindow`'s own anchor restore.
 *
 * Refit triggers: glyph pages mounting/unmounting (MutationObserver, filtered —
 * selection/popover churn inside a page does NOT refit), container resize
 * (content-box, catches scrollbar changes), and page fonts finishing loading.
 */
const MAX_SCALE = 2.4;
const MIN_SCALE = 0.3;

export function useGlyphFitWidth(ref: RefObject<HTMLElement | null>) {
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const wraps = Array.from(
        container.querySelectorAll<HTMLElement>(".qb-glyph-scroll-wrap"),
      );
      if (wraps.length === 0) return;
      const availW = wraps[0].clientWidth;
      if (availW <= 0) return;

      // Anchor: the section straddling the viewport top, and where it sits.
      // Everything below may shrink/grow/clamp during the pass; this pins the
      // reader's place through it.
      const containerTop = container.getBoundingClientRect().top;
      let anchorNode: HTMLElement | null = null;
      let anchorTop = 0;
      for (const section of container.querySelectorAll<HTMLElement>(".qb-scroll-page")) {
        const rect = section.getBoundingClientRect();
        if (rect.bottom - containerTop > 0) {
          anchorNode = section;
          anchorTop = rect.top;
          break;
        }
      }

      type Metric = {
        page: HTMLElement;
        maxW: number;
        chromeX: number;
        boxMaxW: number | null;
        opening: boolean;
      };
      const metrics: Metric[] = [];

      for (const wrap of wraps) {
        const page = wrap.querySelector<HTMLElement>(".qb-glyph-page");
        if (!page) continue;

        // Reset to base scale / natural width for measurement.
        page.style.setProperty("--qcf-fit", "1");
        page.style.width = "";

        const pcs = getComputedStyle(page);
        const chromeX =
          (parseFloat(pcs.paddingLeft) || 0) +
          (parseFloat(pcs.paddingRight) || 0) +
          (parseFloat(pcs.borderLeftWidth) || 0) +
          (parseFloat(pcs.borderRightWidth) || 0);
        const boxMaxW = pcs.maxWidth.endsWith("px") ? parseFloat(pcs.maxWidth) : null;

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
        if (maxW <= 0) continue;

        metrics.push({
          page,
          maxW,
          chromeX,
          boxMaxW,
          opening: page.classList.contains("is-opening"),
        });
      }

      if (metrics.length > 0) {
        // The shared scale comes from the widest line among FULL pages (opening
        // pages are framed short lines — they'd skew the reference).
        const fullPages = metrics.filter((m) => !m.opening);
        const reference = fullPages.length > 0 ? fullPages : metrics;
        const refMaxW = Math.max(...reference.map((m) => m.maxW));
        const refChrome = Math.max(...reference.map((m) => m.chromeX));
        let scale = (availW - refChrome - 4) / refMaxW;
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
        // One width for every full page — identical leaves, like a real mushaf.
        const uniformWidth = Math.ceil(refMaxW * scale) + refChrome + 8;

        for (const m of metrics) {
          if (m.opening) {
            // Keep the opening frame narrow: never wider than its CSS max-width,
            // never a larger scale than the room's uniform one.
            const box = Math.min(availW, m.boxMaxW ?? availW);
            const own = (box - m.chromeX - 4) / m.maxW;
            const s = Math.min(scale, Math.max(MIN_SCALE, own));
            m.page.style.setProperty("--qcf-fit", s.toFixed(4));
            m.page.style.width = `${Math.ceil(m.maxW * s) + m.chromeX + 8}px`;
          } else {
            m.page.style.setProperty("--qcf-fit", scale.toFixed(4));
            m.page.style.width = `${uniformWidth}px`;
          }
        }
      }

      // Restore the anchor section to its pre-measure viewport offset. The
      // delta form self-corrects any clamping that happened mid-pass, and the
      // final (scaled) layout is the tall one, so the target is reachable.
      if (anchorNode && anchorNode.isConnected) {
        const delta = anchorNode.getBoundingClientRect().top - anchorTop;
        if (delta !== 0) container.scrollTop += delta;
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

    // Viewport resize (content-box also catches scrollbar appearance).
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(container);

    // Refit ONLY when pages (or their glyph bodies) mount/unmount — the window
    // sliding or a page's font swap-in. Word-selection re-renders, save-icon
    // swaps, and the morphology popover mutate small nodes inside a page and
    // must not re-measure the whole column on every click.
    const isRelevant = (node: Node) =>
      node instanceof HTMLElement &&
      (node.matches(".qb-scroll-page, .qb-glyph-scroll-wrap, .qb-glyph-page") ||
        node.querySelector(".qb-glyph-page") !== null);
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (isRelevant(node)) {
            schedule();
            return;
          }
        }
        for (const node of mutation.removedNodes) {
          if (isRelevant(node)) {
            schedule();
            return;
          }
        }
      }
    });
    mutationObserver.observe(container, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      container.querySelectorAll<HTMLElement>(".qb-glyph-page").forEach((page) => {
        page.style.width = "";
        page.style.removeProperty("--qcf-fit");
      });
    };
    // Mount-once by design (see SCROLL SAFETY above) — observers drive refits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
