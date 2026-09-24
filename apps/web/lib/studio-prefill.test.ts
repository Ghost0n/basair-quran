import { describe, expect, it } from "vitest";

import { parseStudioAsk } from "./studio-prefill";

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
