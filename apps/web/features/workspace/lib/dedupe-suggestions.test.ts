import { describe, expect, it } from "vitest";
import type { SuggestionItem } from "@q-basair/shared";

import { dedupeSuggestionItems } from "./dedupe-suggestions";

function item(type: string, text: string): SuggestionItem {
  return { type, text } as SuggestionItem;
}

describe("dedupeSuggestionItems", () => {
  it("drops duplicates keyed by (type, text), keeping first-seen order", () => {
    const result = dedupeSuggestionItems([
      item("root", "ر ح م"),
      item("word", "رحمة"),
      item("root", "ر ح م"),
      item("word", "رحمة"),
      item("phrase", "رحمة"),
    ]);
    expect(result.map((r) => `${r.type}:${r.text}`)).toEqual([
      "root:ر ح م",
      "word:رحمة",
      "phrase:رحمة",
    ]);
  });

  it("keeps same text under different types", () => {
    const result = dedupeSuggestionItems([item("root", "x"), item("word", "x")]);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array unchanged", () => {
    expect(dedupeSuggestionItems([])).toEqual([]);
  });
});
