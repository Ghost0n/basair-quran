import { describe, expect, it } from "vitest";

import { positionCounts } from "./home-web-model";

describe("positionCounts (where you are in the Mushaf)", () => {
  it("lights every surah before the current one", () => {
    const counts = positionCounts(45);
    expect(counts).toHaveLength(114);
    expect(counts.slice(0, 44).every((c) => c === 1)).toBe(true);
    expect(counts.slice(44).every((c) => c === 0)).toBe(true);
  });

  it("is empty before any reading", () => {
    expect(positionCounts(null).every((c) => c === 0)).toBe(true);
  });

  it("clamps out-of-range surahs", () => {
    expect(positionCounts(200).filter(Boolean)).toHaveLength(113);
    expect(positionCounts(0).filter(Boolean)).toHaveLength(0);
  });
});
