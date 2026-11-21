import { describe, expect, it, vi } from "vitest";

import type { PaginatedSearchResponse, SearchVerse } from "@q-basair/shared";

import { hasMoreAyahs, interleave, loadMoreAyahsPool } from "./more-ayahs";

const verse = (id: number): SearchVerse => ({
  ayah_id: id,
  mushaf_id: 1,
  surah: "البقرة",
  surah_id: 2,
  ayah: id,
  text: `ayah ${id}`,
  global_index: id,
  highlights: [],
});

const answer = (ids: number[]): PaginatedSearchResponse => ({
  found: true,
  results: [
    {
      result_key: "k",
      root: "صبر",
      search_type: "root",
      page: 1,
      page_size: 50,
      total_pages: 1,
      total_occurrences: ids.length,
      total_verses: ids.length,
      total_surahs: 1,
      verses: ids.map(verse),
    },
  ],
});

describe("more ayahs from an answer's searches", () => {
  it("is offered only when the searches found more than the answer shows", () => {
    const searches = [
      { mode: "root" as const, query: "صبر", result_count: 5 },
      { mode: "exact" as const, query: "الصابرين", result_count: 3 },
    ];
    expect(hasMoreAyahs(searches, 8)).toBe(false);
    expect(hasMoreAyahs(searches, 6)).toBe(true);
  });

  it("runs the same Quran searches again and takes each in turn, skipping what is shown", async () => {
    const searchV2 = vi.fn(async (query: string) => (query === "صبر" ? answer([1, 2, 3, 4]) : answer([2, 9, 10])));
    const pool = await loadMoreAyahsPool(
      searchV2,
      [
        { mode: "root", query: "صبر", result_count: 4 },
        { mode: "exact", query: "الصابرين", result_count: 3 },
        { mode: "root", query: "none", result_count: 0 },
      ],
      1,
      new Set([1]),
    );
    expect(searchV2).toHaveBeenCalledTimes(2);
    expect(searchV2).toHaveBeenCalledWith("صبر", "root", 1, 50);
    expect(pool.map((item) => item.ayah_id)).toEqual([2, 9, 3, 10, 4]);
  });

  it("keeps going when one search fails", async () => {
    const searchV2 = vi.fn(async (query: string) => {
      if (query === "bad") throw new Error("down");
      return answer([7]);
    });
    const pool = await loadMoreAyahsPool(
      searchV2,
      [
        { mode: "root", query: "bad", result_count: 2 },
        { mode: "root", query: "good", result_count: 1 },
      ],
      1,
      new Set(),
    );
    expect(pool.map((item) => item.ayah_id)).toEqual([7]);
  });

  it("lists an ayah once", () => {
    expect(interleave([[verse(1), verse(2)], [verse(2), verse(3)]], new Set()).map((item) => item.ayah_id)).toEqual([1, 2, 3]);
  });
});
