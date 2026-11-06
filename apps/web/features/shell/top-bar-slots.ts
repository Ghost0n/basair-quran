"use client";

import { useLayoutEffect, useState } from "react";

import { useBand } from "@/lib/bands";
import { useWebDesign } from "@/lib/use-web-design";

import { useShellMode } from "./mode-context";

/** Where the reader bar sits in the web top bar (reading/components/reader-bar.tsx). */
export const TOP_BAR_READER_ID = "qb-topbar-reader";

export type TopBarSlots = { start: HTMLElement; end: HTMLElement };

/**
 * The web design's top bar (wide and medium bands): a page puts its own heading, tabs or
 * field in `start` (after the rail, before the command bar) and its actions in
 * `end`, instead of repeating a header inside the page (features/shell/top-bar.tsx).
 *
 * Null on phones, or while `active` is false (a
 * panel kept mounted under another page): the page then draws its own header.
 * The slots are found after commit, like the reader bar's.
 */
export function useTopBarSlots(active = true): TopBarSlots | null {
  const web = useWebDesign();
  const phone = useBand() === "phone";
  const { mode } = useShellMode();
  const [slots, setSlots] = useState<TopBarSlots | null>(null);
  useLayoutEffect(() => {
    const on = web && !phone && active;
    const start = on ? document.getElementById("qb-topbar-slot") : null;
    const end = on ? document.getElementById("qb-topbar-actions") : null;
    setSlots(start && end ? { start, end } : null);
  }, [web, phone, active, mode]);
  return slots;
}
