import { describe, expect, it } from "vitest";

import { compressRefs } from "./use-ayah-translations";

describe("compressRefs", () => {
  it("merges consecutive ayahs per surah and keeps singles", () => {
    const refs = [
      { surah: 2, ayah: 3 },
      { surah: 2, ayah: 1 },
      { surah: 2, ayah: 2 },
      { surah: 2, ayah: 2 },
      { surah: 3, ayah: 5 },
      { surah: 3, ayah: 7 },
      { surah: 3, ayah: 8 },
    ];
    expect(compressRefs(refs)).toEqual(["2:1-3", "3:5", "3:7-8"]);
    expect(compressRefs([])).toEqual([]);
  });
});
