import type { SearchMode, SuggestionItem } from "@q-basair/shared";

import { isTechnicalMessage, reportError } from "@/lib/error-report";
import { isPhraseInputValue } from "@/lib/quran-ui";

/**
 * Pure helpers of the search workspace (no React state): error sanitizing,
 * suggestion-context parsing, and suggestion ranking.
 */

export const MAX_SUGGESTIONS = 10;
export const SUGGESTION_DEBOUNCE_MS = 120;
export const QUICK_EXAMPLES: Array<{ label: string; query: string; mode: SearchMode }> = [
  { label: "الحمد", query: "الحمد", mode: "exact" },
  { label: "صراط مستقيم", query: "صراط مستقيم", mode: "exact" },
  { label: "كتب", query: "كتب", mode: "root" },
];

/**
 * Never surface a raw technical error string. Logs the real error for
 * diagnostics and returns the friendly message: a non-technical error message
 * as-is, otherwise the context-specific Arabic fallback.
 */
export function toUserError(scope: string, error: unknown, fallback: string): string {
  reportError(scope, error);
  const raw = error instanceof Error ? error.message : "";
  return isTechnicalMessage(raw) ? fallback : raw;
}

export function isLatinQuery(text: string) {
  return /[a-zA-Z]/.test(text);
}

/** For a phrase, suggestions complete the LAST word; the rest is the prefix. */
export function getSuggestionContext(query: string) {
  if (!isPhraseInputValue(query.trim())) {
    return { sourceQuery: query.trim(), prefixQuery: "" };
  }

  const tokens = query.trim().split(/\s+/);
  return {
    sourceQuery: tokens[tokens.length - 1] ?? "",
    prefixQuery: tokens.slice(0, -1).join(" "),
  };
}

export function pickBestSuggestionForMode(items: SuggestionItem[], mode: SearchMode) {
  if (items.length === 0) {
    return null;
  }

  if (mode === "root") {
    return items.find((item) => item.type === "root") ?? items[0];
  }

  return items.find((item) => item.type === "word") ?? items[0];
}

export function normalizeSuggestionCandidate(text: string) {
  return text.trim().replace(/\s+/g, " ");
}
