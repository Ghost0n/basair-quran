import { describe, expect, it } from "vitest";

import { rootSpreadCounts } from "./study-extras-model";

describe("rootSpreadCounts", () => {
  it("places each surah's count at its index, Al-Fātiḥa first", () => {
    const counts = rootSpreadCounts({
      surahs: [
        { surah_id: 2, count: 9 },
        { surah_id: 45, count: 2 },
      ] as never,
    });
    expect(counts).toHaveLength(114);
    expect(counts[1]).toBe(9);
    expect(counts[44]).toBe(2);
    expect(counts[0]).toBe(0);
  });

  it("ignores surah ids out of range", () => {
    const counts = rootSpreadCounts({ surahs: [{ surah_id: 0, count: 3 }, { surah_id: 115, count: 1 }] as never });
    expect(counts.every((c) => c === 0)).toBe(true);
  });
});
