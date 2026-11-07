import type { ReaderLayout } from "@q-basair/shared";

import type { IconName } from "@/components/icon";

import { t } from "@/lib/i18n";

/**
 * The two reading modes the UI offers: the printed page, and verse by verse.
 * The stored `reader_layout` keeps its wider vocabulary for compatibility:
 *  - "auto" (the default), "single" and "spread" all mean pages — the reader
 *    decides one page vs. a facing spread by itself from the room available;
 *  - "scroll" (the retired continuous mode) now reads as pages too;
 *  - "ayah" is verse by verse.
 * Choosing «صفحات» stores "single" so it sticks on every device.
 */
export type ReaderMode = "pages" | "ayah";

export const READER_MODES: {
  mode: ReaderMode;
  layout: ReaderLayout;
  label: string;
  hint: string;
  icon: IconName;
}[] = [
  { mode: "pages", layout: "single", get label() {
    return t("صفحات");
  }, get hint() {
    return t("صفحة المصحف كما طُبعت");
  }, icon: "book" },
  { mode: "ayah", layout: "ayah", get label() {
    return t("آية آية");
  }, get hint() {
    return t("كل آية في سطر");
  }, icon: "cards" },
];

/** The mode a stored layout shows (every device reads the same way now). */
export function resolveReaderMode(layout: ReaderLayout | null | undefined): ReaderMode {
  return layout === "ayah" ? "ayah" : "pages";
}

/** Shift+M: the stored layout of the mode after the current one. */
export function nextReaderLayout(layout: ReaderLayout | null | undefined): ReaderLayout {
  const current = resolveReaderMode(layout);
  const index = READER_MODES.findIndex((item) => item.mode === current);
  return READER_MODES[(index + 1) % READER_MODES.length].layout;
}

// The printed page is 1 : 1.52 (keep in step with reading.css «Printed page»).
const PAGE_ASPECT = 1 / 1.52;
// A spread may cost at most this much page size versus a single page.
const SPREAD_MIN_RATIO = 0.9;

/**
 * Should the paged reader show a facing spread in this reading area? Only when
 * two pages side by side stay (almost) as large as one page would be — never
 * shrink the text just to show two pages.
 */
export function spreadFits(areaWidth: number, areaHeight: number, gap = 40): boolean {
  if (areaWidth <= 0 || areaHeight <= 0) return false;
  const singleWidth = PAGE_ASPECT * areaHeight; // one page fitted to the height
  const spreadWidthEach = Math.min(singleWidth, (areaWidth - gap) / 2);
  return spreadWidthEach >= singleWidth * SPREAD_MIN_RATIO && areaWidth >= 880;
}
