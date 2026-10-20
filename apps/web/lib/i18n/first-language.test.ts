import { describe, expect, it } from "vitest";

import { numeralsForLanguageChoice } from "./first-language";

const first = { explicit: false, accountLanguage: "ar", accountNumerals: "arabic-indic" };

describe("numeralsForLanguageChoice", () => {
  it("gives the first language choice that language's digits", () => {
    expect(numeralsForLanguageChoice({ ...first, code: "fr" })).toBe("latin");
    expect(numeralsForLanguageChoice({ ...first, code: "fa" })).toBe("persian");
    expect(numeralsForLanguageChoice({ ...first, accountLanguage: null, code: "ja" })).toBe("latin");
  });

  it("leaves the digits alone when they already match", () => {
    expect(numeralsForLanguageChoice({ ...first, code: "ar" })).toBeUndefined();
  });

  it("keeps the digits on any later change of language", () => {
    expect(numeralsForLanguageChoice({ ...first, explicit: true, code: "fr" })).toBeUndefined();
    // English with Latin digits, then Arabic: the digits stay Latin.
    expect(numeralsForLanguageChoice({ explicit: false, accountLanguage: "en", accountNumerals: "latin", code: "ar" })).toBeUndefined();
  });

  it("keeps digits the reader set themselves", () => {
    expect(numeralsForLanguageChoice({ ...first, accountNumerals: "latin", code: "fa" })).toBeUndefined();
  });
});
