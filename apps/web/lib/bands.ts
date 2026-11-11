"use client";

import { useSyncExternalStore } from "react";

/**
 * The three width bands of the responsive design (docs/responsive-design.md). Width decides the band, not
 * the device, so a narrowed desktop window looks exactly like a tablet or a
 * phone of that width.
 *
 * - wide: the desktop, a page beside the Mushaf.
 * - medium: the side menu, one view at a time.
 * - phone: the bottom tab bar, one full screen per tab (same test as PHONE_QUERY).
 */
export type Band = "wide" | "medium" | "phone";

/** The narrowest width of the wide band. Keep in step with the `*.web.css` rules. */
export const WIDE_MIN = 1100;

/** The phone band's limits, as in PHONE_QUERY. */
const PHONE_MAX_WIDTH = 768;
const PHONE_MAX_HEIGHT = 500;

export function bandFor(width: number, height: number, coarse: boolean): Band {
  if (width <= PHONE_MAX_WIDTH || (coarse && height <= PHONE_MAX_HEIGHT)) return "phone";
  return width >= WIDE_MIN ? "wide" : "medium";
}

function currentBand(): Band {
  return bandFor(
    window.innerWidth,
    window.innerHeight,
    window.matchMedia("(pointer: coarse)").matches,
  );
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  window.addEventListener("orientationchange", listener);
  return () => {
    window.removeEventListener("resize", listener);
    window.removeEventListener("orientationchange", listener);
  };
}

/** The current band (client components only; "wide" during SSR). */
export function useBand(): Band {
  return useSyncExternalStore(subscribe, currentBand, () => "wide");
}
