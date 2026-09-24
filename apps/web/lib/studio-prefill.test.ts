import { describe, expect, it } from "vitest";

import { looksLikeQuestion, parseStudioAsk } from "./studio-prefill";

describe("looksLikeQuestion", () => {
  it("is false for empty or short search-like input", () => {
    expect(looksLikeQuestion("")).toBe(false);
    expect(looksLikeQuestion("  ")).toBe(false);
    expect(looksLikeQuestion("رحمة")).toBe(false);
    expect(looksLikeQuestion("ب ص ر")).toBe(false);
  });

  it("is true when it ends with a question mark (Arabic or Latin)", () => {
    expect(looksLikeQuestion("ما الرحمة؟")).toBe(true);
    expect(looksLikeQuestion("what is mercy?")).toBe(true);
  });

  it("is true for a long phrase that carries an interrogative", () => {
    expect(looksLikeQuestion("ما معنى الرحمة في سياق آيات القرآن الكريم")).toBe(true);
  });

  it("is false for a long phrase with no interrogative cue (softened 6-word rule)", () => {
    // A 7-word ayah fragment / phrase search must stay a search, not the Studio.
    expect(looksLikeQuestion("الحمد لله رب العالمين الرحمن الرحيم مالك")).toBe(false);
  });

  it("is true when it opens with an Arabic interrogative (>= 3 words)", () => {
    expect(looksLikeQuestion("لماذا خلق الإنسان")).toBe(true);
  });

  it("stays false for a two-word interrogative (kept strict)", () => {
    expect(looksLikeQuestion("لماذا الرحمة")).toBe(false);
  });
});

describe("parseStudioAsk", () => {
  it("reads the queued JSON with mode and focus", () => {
    const ask = parseStudioAsk(
      JSON.stringify({ question: " فسّر ", mode: "tafssir", focus: { surah: 2, ayah: 255 }, focusLabel: "البقرة" }),
    );
    expect(ask).toEqual({ question: "فسّر", mode: "tafssir", focus: { surah: 2, ayah: 255 }, focusLabel: "البقرة" });
  });

  it("accepts the older plain-string queue format", () => {
    expect(parseStudioAsk("ما معنى البصائر؟")).toEqual({ question: "ما معنى البصائر؟" });
  });

  it("drops invalid mode / focus and empty questions", () => {
    expect(parseStudioAsk(JSON.stringify({ question: "q", mode: "x", focus: { surah: "2" } }))).toEqual({
      question: "q",
    });
    expect(parseStudioAsk(JSON.stringify({ question: "  " }))).toBeNull();
  });
});
