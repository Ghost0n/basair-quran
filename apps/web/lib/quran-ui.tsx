import type { ReactNode } from "react";

import type { PaginatedSearchResult, SearchVerse, SuggestionItem } from "@q-basair/shared";

export const ITEMS_PER_PAGE = 10;

const DIACRITICS_EXCEPT_SHADDA = /[\u064B-\u0650\u0652\u0670]/;
const CHAKL_EXCEPT_SHADDA = /[\u0610-\u061A\u064B-\u0650\u0652-\u065F\u0670\u06D6-\u06ED]/g;

export function hasArabicDiacritics(text: string) {
  return DIACRITICS_EXCEPT_SHADDA.test(text);
}

export function removeChakl(text: string) {
  return text.replace(CHAKL_EXCEPT_SHADDA, "");
}

export function isPhraseInputValue(value: string) {
  return value.trim().includes(" ");
}

export function getResultLabelText(result: PaginatedSearchResult) {
  if (result.search_type === "exact") {
    return result.match_type === "phrase" ? "العبارة" : "الكلمة";
  }
  return "الجذر";
}

export function getSuggestionTypeLabel(mode: "root" | "exact", item: SuggestionItem) {
  if (item.type === "root") {
    return "جذر";
  }
  if (item.type === "phrase" || (mode === "exact" && item.text.trim().includes(" "))) {
    return "عبارة";
  }
  return "كلمة";
}

export function getVerseSelectionKey(resultKey: string, verse: SearchVerse) {
  const highlightKey = Array.isArray(verse.highlights) ? verse.highlights.join(",") : "";
  return `${resultKey}:${verse.ayah_id}:${highlightKey}`;
}

export function clampPage(page: number, totalPages: number) {
  return Math.max(1, Math.min(page, totalPages));
}

export function renderHighlightedVerseText(text: string, highlights: number[] = []): ReactNode[] {
  const highlightSet = new Set(highlights);
  return text.split(" ").map((word, index, array) => {
    const content = highlightSet.has(index + 1) ? <span className="highlight">{word}</span> : word;
    return (
      <span key={`${word}-${index}`}>
        {content}
        {index < array.length - 1 ? " " : null}
      </span>
    );
  });
}

/**
 * Key-word-in-context window for compact result rows: the words around the
 * first highlighted word (±radius), with flags for elided text on either side.
 * `highlights` are 1-based word positions (as returned by the search API).
 */
export function kwicWindow(
  text: string,
  highlights: number[] = [],
  radius = 4,
): { words: { word: string; position: number; hit: boolean }[]; before: boolean; after: boolean } {
  const all = text.trim().split(/\s+/).filter(Boolean);
  const hits = new Set(highlights);
  const first = highlights.length ? Math.min(...highlights) : 1;
  const last = highlights.length ? Math.max(...highlights) : 1;
  // Keep every hit when they sit close together; otherwise centre on the first.
  const end = last - first <= radius * 2 ? last : first;
  const from = Math.max(1, first - radius);
  const to = Math.min(all.length, end + radius);
  const words = [];
  for (let position = from; position <= to; position += 1) {
    words.push({ word: all[position - 1], position, hit: hits.has(position) });
  }
  return { words, before: from > 1, after: to < all.length };
}
