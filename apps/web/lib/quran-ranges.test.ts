import { describe, expect, it } from "vitest";

import { customRange, divisionOf, divisionRange, inRange, nextVerse, previousVerse, SURAH_AYAHS } from "./quran-ranges";

describe("quran ranges", () => {
  it("counts 6,236 Ḥafṣ ayahs", () => {
    expect(SURAH_AYAHS.reduce((sum, n) => sum + n, 0)).toBe(6236);
  });

  it("steps across surah boundaries", () => {
    expect(nextVerse({ surah: 1, ayah: 7 })).toEqual({ surah: 2, ayah: 1 });
    expect(nextVerse({ surah: 114, ayah: 6 })).toBeNull();
    expect(previousVerse({ surah: 2, ayah: 1 })).toEqual({ surah: 1, ayah: 7 });
    expect(previousVerse({ surah: 1, ayah: 1 })).toBeNull();
  });

  it("builds whole divisions", () => {
    expect(divisionRange("surah", 1)).toEqual({ start: { surah: 1, ayah: 1 }, end: { surah: 1, ayah: 7 } });
    // Madani juz 4 opens at «لن تنالوا البر» (3:92); juz 3 ends just before it.
    expect(divisionRange("juz", 3).end).toEqual({ surah: 3, ayah: 91 });
    expect(divisionRange("juz", 4).start).toEqual({ surah: 3, ayah: 92 });
    expect(divisionRange("juz", 30)).toEqual({ start: { surah: 78, ayah: 1 }, end: { surah: 114, ayah: 6 } });
    expect(divisionRange("hizb", 1)).toEqual({ start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 74 } });
  });

  it("finds the division a verse is in", () => {
    expect(divisionOf("juz", { surah: 2, ayah: 141 })).toBe(1);
    expect(divisionOf("juz", { surah: 2, ayah: 142 })).toBe(2);
    expect(divisionOf("hizb", { surah: 2, ayah: 75 })).toBe(2);
    expect(divisionOf("juz", { surah: 114, ayah: 6 })).toBe(30);
    expect(divisionOf("surah", { surah: 36, ayah: 1 })).toBe(36);
  });

  it("orders and clamps a custom range", () => {
    expect(customRange({ surah: 2, ayah: 10 }, { surah: 1, ayah: 99 })).toEqual({
      start: { surah: 1, ayah: 7 },
      end: { surah: 2, ayah: 10 },
    });
    const range = customRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 5 });
    expect(inRange({ surah: 2, ayah: 5 }, range)).toBe(true);
    expect(inRange({ surah: 2, ayah: 6 }, range)).toBe(false);
  });
});
