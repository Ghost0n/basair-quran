import { describe, expect, it } from "vitest";

import { EMPTY_FILTERS, activeFilterCount, feedQuery } from "./feed-filters";

describe("feed filters", () => {
  it("counts only narrowing filters, not the sort order", () => {
    expect(EMPTY_FILTERS.sort).toBe("top");
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, sort: "latest" })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: "   " })).toBe(0);
    expect(
      activeFilterCount({ ...EMPTY_FILTERS, q: "صبر", tag: "تدبر", surah: 2, board: true, author: { id: 3, name: "أ" } }),
    ).toBe(5);
  });

  it("maps the state to the API query (debounced text, author id, saved tab)", () => {
    const filters = { ...EMPTY_FILTERS, q: "صبر وشكر", tag: "تدبر", author: { id: 7, name: "باحث" } };
    expect(feedQuery(filters, "صبر", true, "cur")).toEqual({
      cursor: "cur",
      sort: "top",
      q: "صبر",
      surah: null,
      tag: "تدبر",
      board: false,
      author: 7,
      saved: true,
    });
  });
});
