import type { SuggestionItem } from "@q-basair/shared";

/**
 * Drop duplicate suggestions, keyed by (type, text), preserving first-seen
 * order. Extracted as a pure helper so it is unit-testable in isolation.
 */
export function dedupeSuggestionItems(items: SuggestionItem[]): SuggestionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}::${item.text}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
