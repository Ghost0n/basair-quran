import type { ReaderLayout } from "@q-basair/shared";

import type { IconName } from "@/components/icon";

/**
 * The three reading modes the UI offers. The stored `reader_layout` keeps its
 * wider vocabulary for compatibility: "single" / "spread" / "auto" are all the
 * paged mode («صفحات»), which decides one page vs. a facing spread by itself.
 */
export type ReaderMode = "auto" | "scroll" | "ayah";

export const READER_MODES: { value: ReaderMode; label: string; hint: string; icon: IconName }[] = [
  { value: "auto", label: "صفحات", hint: "صفحة المصحف كما طُبعت", icon: "book" },
  { value: "scroll", label: "تمرير", hint: "الصفحات متتابعة", icon: "page" },
  { value: "ayah", label: "آية آية", hint: "كل آية في سطر", icon: "cards" },
];

export function toReaderMode(layout: ReaderLayout | null | undefined): ReaderMode {
  return layout === "scroll" ? "scroll" : layout === "ayah" ? "ayah" : "auto";
}

/** Shift+M cycle order. */
export function nextReaderMode(layout: ReaderLayout | null | undefined): ReaderMode {
  const current = toReaderMode(layout);
  const index = READER_MODES.findIndex((mode) => mode.value === current);
  return READER_MODES[(index + 1) % READER_MODES.length].value;
}
