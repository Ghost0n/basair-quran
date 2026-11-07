import { describe, expect, it } from "vitest";

import { wrapWords } from "./share-card";

describe("wrapWords", () => {
  const measure = (text: string) => text.length * 10;

  it("wraps greedily without splitting words", () => {
    expect(wrapWords(measure, "أ ب ج د هـ", 35)).toEqual(["أ ب", "ج د", "هـ"]);
  });

  it("keeps an over-long word on its own line", () => {
    expect(wrapWords(measure, "كلمةطويلةجداً قصيرة", 50)).toEqual(["كلمةطويلةجداً", "قصيرة"]);
  });

  it("returns nothing for blank text", () => {
    expect(wrapWords(measure, "   ", 100)).toEqual([]);
  });
});
