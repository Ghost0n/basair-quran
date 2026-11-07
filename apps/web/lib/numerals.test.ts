import { describe, expect, it } from "vitest";

import { formatNumber, toArabicDigits, toLatinDigits, toPersianDigits } from "./numerals";

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

  it("leaves non-digit characters untouched", () => {
    expect(toArabicDigits("page 12")).toBe("page ١٢");
  });
});
