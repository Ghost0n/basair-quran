import { describe, expect, it } from "vitest";

import { cleanAyahText } from "./use-saved-ayat";

describe("cleanAyahText", () => {
  it("drops the trailing ayah-number word joined from glyph layouts", () => {
    expect(cleanAyahText("وَأَنزَلَ ٱلتَّوۡرَىٰةَ وَٱلۡإِنجِيلَ ٣")).toBe("وَأَنزَلَ ٱلتَّوۡرَىٰةَ وَٱلۡإِنجِيلَ");
    expect(cleanAyahText("ٱلۡحَكِيمُ ٢٥٥ ")).toBe("ٱلۡحَكِيمُ");
    expect(cleanAyahText("text 12")).toBe("text");
  });

  it("keeps text without a trailing number intact", () => {
    expect(cleanAyahText("قُلۡ هُوَ ٱللَّهُ أَحَدٌ")).toBe("قُلۡ هُوَ ٱللَّهُ أَحَدٌ");
  });
});
