import { describe, expect, it } from "vitest";

import { surahLengths, surahsOfKind } from "./surah-filter";

const surahs = [
  { id: 1, name: "الفاتحة", type: "meccan", ayah_count: 7 },
  { id: 2, name: "البقرة", type: "medinan", ayah_count: 286 },
  { id: 3, name: "آل عمران", type: "medinan", ayah_count: 200 },
  { id: 114, name: "الناس", type: "meccan", ayah_count: 6 },
];

describe("surahsOfKind", () => {
  it("keeps every surah for «الكل»", () => {
    expect([...surahsOfKind(surahs, "all")]).toEqual([1, 2, 3, 114]);
  });

  it("splits Meccan and Medinan surahs", () => {
    expect([...surahsOfKind(surahs, "meccan")]).toEqual([1, 114]);
    expect([...surahsOfKind(surahs, "medinan")]).toEqual([2, 3]);
  });
});

describe("surahLengths", () => {
  it("gives one ayah count per surah, Al-Fātiḥa first, 0 where unknown", () => {
    const lengths = surahLengths(surahs);
    expect(lengths).toHaveLength(114);
    expect(lengths[0]).toBe(7);
    expect(lengths[1]).toBe(286);
    expect(lengths[3]).toBe(0);
    expect(lengths[113]).toBe(6);
  });
});
