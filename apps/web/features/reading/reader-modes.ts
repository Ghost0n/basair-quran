import type { ReaderLayout } from "@q-basair/shared";

import type { IconName } from "@/components/icon";

/**
 * The three reading modes the UI offers. The stored `reader_layout` keeps its
 * wider vocabulary for compatibility:
 *  - "auto" (the default) is device-smart: continuous scroll on phones and
 *    short/landscape screens, pages elsewhere;
 *  - "single" / "spread" both mean pages — the reader decides one page vs. a
 *    facing spread by itself from the room available;
 *  - "scroll" / "ayah" are explicit.
 * Choosing «صفحات» stores "single" so it sticks on every device.
 */
export type ReaderMode = "pages" | "scroll" | "ayah";

export const READER_MODES: {
  mode: ReaderMode;
  layout: ReaderLayout;
  label: string;
  hint: string;
  icon: IconName;
}[] = [
  { mode: "pages", layout: "single", label: "صفحات", hint: "صفحة المصحف كما طُبعت", icon: "book" },
  { mode: "scroll", layout: "scroll", label: "تمرير", hint: "الصفحات متتابعة", icon: "page" },
  { mode: "ayah", layout: "ayah", label: "آية آية", hint: "كل آية في سطر", icon: "cards" },
];

/** The mode a stored layout shows on this device (`compact` = phone / short screen). */
export function resolveReaderMode(layout: ReaderLayout | null | undefined, compact: boolean): ReaderMode {
  if (layout === "scroll") return "scroll";
  if (layout === "ayah") return "ayah";
  if (layout === "single" || layout === "spread") return "pages";
  return compact ? "scroll" : "pages";
}

/** Shift+M: the stored layout of the mode after the current one. */
export function nextReaderLayout(layout: ReaderLayout | null | undefined, compact: boolean): ReaderLayout {
  const current = resolveReaderMode(layout, compact);
  const index = READER_MODES.findIndex((item) => item.mode === current);
  return READER_MODES[(index + 1) % READER_MODES.length].layout;
}

// A Madani page (frame included) is ~0.62 as wide as it is tall.
const PAGE_ASPECT = 0.62;
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
