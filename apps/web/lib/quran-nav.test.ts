import { describe, expect, it } from "vitest";

import { foldArabicName, parseNavCommand, surahMatches, toAsciiDigits } from "./quran-nav";

describe("parseNavCommand", () => {
  it("parses references in any numeral script", () => {
    expect(parseNavCommand("2:255")).toEqual({ type: "ayah", surah: 2, ayah: 255 });
    expect(parseNavCommand("٢:٢٥٥")).toEqual({ type: "ayah", surah: 2, ayah: 255 });
    expect(parseNavCommand("صفحة ٥٠")).toEqual({ type: "page", page: 50 });
    expect(parseNavCommand("سورة 18")).toEqual({ type: "surah", surah: 18 });
    expect(parseNavCommand("جزء ٣٠")).toEqual({ type: "juz", juz: 30 });
  });

  it("rejects out-of-range values and free text", () => {
    expect(parseNavCommand("115:1")).toBeNull();
    expect(parseNavCommand("صفحة 605")).toBeNull();
    expect(parseNavCommand("جزء 31")).toBeNull();
    expect(parseNavCommand("رحمة")).toBeNull();
  });
});

describe("surah name matching", () => {
  it("folds tashkeel, alef forms and the article", () => {
    expect(foldArabicName("البَقَرَة")).toBe("بقره");
    expect(foldArabicName("الأعراف")).toBe("اعراف");
    expect(toAsciiDigits("۱۲")).toBe("12");
  });

  it("matches by folded name, number prefix, or English name", () => {
    const baqara = { id: 2, name: "البَقَرَة", name_english: "Al-Baqarah" };
    expect(surahMatches("بقرة", baqara)).toBe(true);
    expect(surahMatches("البقره", baqara)).toBe(true);
    expect(surahMatches("٢", baqara)).toBe(true);
    expect(surahMatches("baq", baqara)).toBe(true);
    expect(surahMatches("عمران", baqara)).toBe(false);
    expect(surahMatches("", baqara)).toBe(true);
  });
});
