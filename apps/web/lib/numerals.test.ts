import { describe, expect, it } from "vitest";

import { digitsSetting, formatNumber, resolveNumerals, setActiveNumerals, toArabicDigits, toLatinDigits, toPersianDigits } from "./numerals";

describe("numerals", () => {
  it("maps to Arabic-Indic digits by default", () => {
    expect(toArabicDigits(2026)).toBe("٢٠٢٦");
    expect(formatNumber(7)).toBe("٧");
  });

  it("maps to Persian digits", () => {
    expect(toPersianDigits(45)).toBe("۴۵");
    expect(formatNumber(45, "persian")).toBe("۴۵");
  });

  it("maps Arabic/Persian back to Latin", () => {
    expect(toLatinDigits("٢٠٢٦")).toBe("2026");
    expect(toLatinDigits("۴۵")).toBe("45");
    expect(formatNumber("١٢٣", "latin")).toBe("123");
  });

  it("follows the active digits when no script is given", () => {
    try {
      setActiveNumerals("latin");
      expect(formatNumber("٢ / 3")).toBe("2 / 3");
      setActiveNumerals("persian");
      expect(formatNumber(45)).toBe("۴۵");
      expect(formatNumber(45, "arabic-indic")).toBe("٤٥");
    } finally {
      setActiveNumerals("arabic-indic");
    }
  });

  it("resolves the setting against the language, and saves the language's own digits as auto", () => {
    expect(resolveNumerals("auto", "latin")).toBe("latin");
    expect(resolveNumerals("persian", "latin")).toBe("persian");
    expect(digitsSetting("latin", "latin")).toBe("auto");
    expect(digitsSetting("arabic-indic", "latin")).toBe("arabic-indic");
  });

  it("leaves non-digit characters untouched", () => {
    expect(toArabicDigits("page 12")).toBe("page ١٢");
  });
});
