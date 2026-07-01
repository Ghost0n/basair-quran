"use client";

import { useEffect, useState } from "react";

/**
 * Tracks whether the viewport is at least `breakpoint` wide — used to decide
 * when the authentic reader shows a two-page facing spread. Below it, the
 * reader collapses to a single centred page. SSR-safe (starts false).
 */
export function useWideScreen(breakpoint = 1180): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpoint]);

  return wide;
}
