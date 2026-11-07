import { useLayoutEffect, type RefObject } from "react";

/** Room kept between a popover and the screen edges (beyond the safe areas). */
const MARGIN = 8;

let probe: HTMLDivElement | null = null;
/** The device's safe-area insets (notch, home indicator), in px. */
export function safeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  if (typeof document === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;inset:0 auto auto 0;width:0;height:0;" +
      "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
}

/**
 * Keep an anchored popover fully on screen: shift it back inside the
 * viewport (and its safe areas) when its anchor sits near an edge, and cap
 * its height to the room there is (its content scrolls). Re-runs on resize.
 */
export function useKeepOnScreen(ref: RefObject<HTMLElement | null>, open: boolean): void {
  useLayoutEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const place = () => {
      node.style.translate = "";
      node.style.maxHeight = "";
      const rect = node.getBoundingClientRect();
      const inset = safeAreaInsets();
      const minX = inset.left + MARGIN;
      const maxX = window.innerWidth - inset.right - MARGIN;
      const minY = inset.top + MARGIN;
      const maxY = window.innerHeight - inset.bottom - MARGIN;
      let dx = 0;
      if (rect.width > maxX - minX) dx = minX - rect.left;
      else if (rect.left < minX) dx = minX - rect.left;
      else if (rect.right > maxX) dx = maxX - rect.right;
      if (dx) node.style.translate = `${Math.round(dx)}px 0`;
      // Opens upward from a bottom bar, or downward from a top one: cap to the side it grows into.
      const room = rect.bottom > maxY ? maxY - rect.top : rect.top < minY ? rect.bottom - minY : null;
      if (room !== null) node.style.maxHeight = `${Math.max(120, Math.floor(room))}px`;
      if (rect.width > maxX - minX) node.style.maxWidth = `${Math.floor(maxX - minX)}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [ref, open]);
}
