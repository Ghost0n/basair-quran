import { describe, expect, it } from "vitest";

import { citedSurahCounts } from "./cited-surahs";

describe("citedSurahCounts", () => {
  it("counts the cited verses per surah, Al-Fātiḥa first", () => {
    const counts = citedSurahCounts([{ surah_id: 45 }, { surah_id: 2 }, { surah_id: 45 }]);
    expect(counts).toHaveLength(114);
    expect(counts[44]).toBe(2);
    expect(counts[1]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("ignores out-of-range surahs", () => {
    expect(citedSurahCounts([{ surah_id: 0 }, { surah_id: 200 }]).every((c) => c === 0)).toBe(true);
  });
});
