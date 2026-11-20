import { describe, expect, it } from "vitest";

import { numeralsForLanguage, numeralsForLanguageChoice } from "./first-language";

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

describe("numeralsForLanguage", () => {
  it("brings the language's usual digits on every choice", () => {
    expect(numeralsForLanguage("fr", "arabic-indic")).toBe("latin");
    expect(numeralsForLanguage("fa", "latin")).toBe("persian");
    // Back to Arabic after English: Arabic digits again.
    expect(numeralsForLanguage("ar", "latin")).toBe("arabic-indic");
  });

  it("changes nothing when the digits already are the language's", () => {
    expect(numeralsForLanguage("ar", "arabic-indic")).toBeUndefined();
    expect(numeralsForLanguage("en", "latin")).toBeUndefined();
  });
});
