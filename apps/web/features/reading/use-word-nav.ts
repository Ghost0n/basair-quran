"use client";

import { useEffect, type RefObject } from "react";

/**
 * Roving word navigation for the reader surfaces.
 *
 * Words render with `tabIndex={-1}` (focusable, not tabbable) so a page is ONE
 * tab stop — the reader container — instead of hundreds. From the container (or
 * any focused word), arrow keys walk the words in reading order:
 *
 *   ArrowLeft  → next word (RTL: forward)      ArrowRight → previous word
 *   Home       → first word                     End        → last word
 *   Escape     → back to the container
 *
 * Enter/Space keep their per-word behaviour (open morphology). `focus()` scrolls
 * the word into view natively, so walking words also pans the page.
 */
export function useWordNav(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const words = () =>
      Array.from(container.querySelectorAll<HTMLElement>(".qb-word, .qb-glyph-word"));

    const onKeyDown = (event: KeyboardEvent) => {
      const { key } = event;
      if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End" && key !== "Escape") {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const onWord = active?.matches?.(".qb-word, .qb-glyph-word") ?? false;
      // Only own the keys when focus is on the container itself or a word —
      // never steal arrows from other focusables (save buttons, seek bar…).
      if (!onWord && active !== container) return;

      if (key === "Escape") {
        if (onWord) {
          event.preventDefault();
          container.focus();
        }
        return;
      }

      const list = words();
      if (list.length === 0) return;

      let target: HTMLElement | undefined;
      if (key === "Home") {
        target = list[0];
      } else if (key === "End") {
        target = list[list.length - 1];
      } else {
        const delta = key === "ArrowLeft" ? 1 : -1; // RTL: left = forward
        if (!onWord) {
          // Entering the word list from the container.
          target = delta === 1 ? list[0] : list[list.length - 1];
        } else {
          const index = list.indexOf(active as HTMLElement);
          if (index === -1) return;
          target = list[index + delta];
          if (!target) return; // at either end — stay put
        }
      }
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [containerRef]);
}
