import { useEffect, useRef } from "react";

/**
 * One transient surface at a time — menus, strips, popovers and sheets.
 *
 * Opening one closes whichever was open (a tap on a second tool closes the
 * first one's menu instead of stacking them), as native apps behave. Each
 * surface registers while it is open; the previous one's `close` runs first.
 */
type Entry = { close: () => void };

let current: Entry | null = null;

/** Claim the screen while `open`; the surface open before is closed. */
export function useExclusiveOverlay(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const entry: Entry = { close: () => closeRef.current() };
    const previous = current;
    current = entry;
    if (previous && previous !== entry) previous.close();
    return () => {
      if (current === entry) current = null;
    };
  }, [open]);
}

/**
 * A tap outside a menu only closes the menu (as on iOS): the click that
 * follows the press is swallowed, so the word or button under the finger
 * doesn't also react. Call it from the outside-press handler.
 */
export function swallowNextClick(): void {
  if (typeof document === "undefined") return;
  const swallow = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
    cleanup();
  };
  const cleanup = () => {
    document.removeEventListener("click", swallow, true);
    window.clearTimeout(timer);
  };
  // A press that turns into a scroll never clicks: forget it soon.
  const timer = window.setTimeout(cleanup, 600);
  document.addEventListener("click", swallow, true);
}

/** Close whatever transient surface is open (e.g. leaving a screen). */
export function closeExclusiveOverlay(): void {
  const entry = current;
  current = null;
  entry?.close();
}
