"use client";

import { useEffect, type RefObject } from "react";

/** Areas that keep their own wheel: the pages beside the Mushaf, menus, dialogs. */
const OWN_WHEEL = ".qb-side-panel, .qb-companion-panel, .qb-study-slot, [role='dialog'], [role='listbox'], [role='menu']";

/** Whether `element` (or an ancestor up to the page) would itself scroll by `deltaY`. */
function scrollsItself(element: Element | null, deltaY: number): boolean {
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (!/(auto|scroll|overlay)/.test(style.overflowY) || node.scrollHeight <= node.clientHeight + 1) continue;
    const room = deltaY < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1;
    if (room) return true;
  }
  return false;
}

/** The wheel's travel in pixels, whatever unit the device reports. */
function wheelPixels(event: WheelEvent, page: number): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 40;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * page;
  return event.deltaY;
}

/**
 * The verse-by-verse reader scrolls from anywhere on the page, not only over
 * its column: a wheel turned over the margins, the top bar or the rail moves
 * the verses. Whatever scrolls by itself (a side page, a menu, a dialog) keeps
 * its wheel; a pinch-zoom (ctrl+wheel) is left to the browser.
 */
export function useWheelAnywhere(scrollerRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function onWheel(event: WheelEvent) {
      const scroller = scrollerRef.current;
      if (!scroller || event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || scroller.contains(target) || target.closest(OWN_WHEEL)) return;
      if (scrollsItself(target, event.deltaY)) return;
      event.preventDefault();
      scroller.scrollBy({ top: wheelPixels(event, scroller.clientHeight), behavior: "auto" });
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [scrollerRef, enabled]);
}
