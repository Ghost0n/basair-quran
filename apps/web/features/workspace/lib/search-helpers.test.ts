import { describe, expect, it } from "vitest";

import type { SuggestionItem } from "@q-basair/shared";

import {
  getSuggestionContext,
  isLatinQuery,
  normalizeSuggestionCandidate,
  pickBestSuggestionForMode,
} from "./search-helpers";

describe("search helpers", () => {
  it("completes the last word of a phrase", () => {
    expect(getSuggestionContext("الحمد")).toEqual({ sourceQuery: "الحمد", prefixQuery: "" });
    expect(getSuggestionContext("صراط  مستق")).toEqual({ sourceQuery: "مستق", prefixQuery: "صراط" });
  });

  it("detects Latin (transliterated) input", () => {
    expect(isLatinQuery("rahma")).toBe(true);
    expect(isLatinQuery("رحمة")).toBe(false);
  });

  it("prefers the suggestion type matching the mode", () => {
    const items = [
      { text: "رحم", type: "root" },
      { text: "رحمة", type: "word" },
    ] as unknown as SuggestionItem[];
    expect(pickBestSuggestionForMode(items, "root")?.text).toBe("رحم");
    expect(pickBestSuggestionForMode(items, "exact")?.text).toBe("رحمة");
    expect(pickBestSuggestionForMode([], "exact")).toBeNull();
  });

  it("normalizes whitespace in candidates", () => {
    expect(normalizeSuggestionCandidate("  صراط   مستقيم ")).toBe("صراط مستقيم");
  });
});
