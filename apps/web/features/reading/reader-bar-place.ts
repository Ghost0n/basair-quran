import type { Band } from "@/lib/bands";

import type { ShellMode } from "../shell/mode-context";

/**
 * Whether the reader's toolbar sits in the shell's top bar (rather than on the
 * page). Wide: wherever the Mushaf shows, on the reading page and beside a
 * page unless that page is widened over it. Medium: on the reading page only,
 * since a page there takes the whole canvas and fills the top bar itself.
 * Phones keep the reader's own bar.
 */
export function readerBarInTopBar(band: Band, mode: ShellMode, roomWide: boolean): boolean {
  if (band === "phone") return false;
  return mode === "reading" || (band === "wide" && !roomWide);
}
