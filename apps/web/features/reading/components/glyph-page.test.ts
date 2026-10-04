import { describe, expect, it } from "vitest";

import type { MushafLayoutGlyph } from "@q-basair/shared";

import { splitAyahEnd } from "./glyph-page";

const word = (text: string, glyph: string) => ({ text, glyph }) as MushafLayoutGlyph;

describe("splitAyahEnd", () => {
  it("splits the verse-number ornament off an ayah's last word", () => {
    expect(splitAyahEnd(word("ٱلْحَمِيدُ ٦", "ﭤ ﭥ"))).toEqual({ glyph: "ﭤ", mark: "ﭥ" });
  });

  it("leaves ordinary words (and marks without a number) whole", () => {
    expect(splitAyahEnd(word("ٱللَّهَ", "ﭡ"))).toEqual({ glyph: "ﭡ", mark: null });
    expect(splitAyahEnd(word("۞ عَسَى", "ﭦ ﭧ"))).toEqual({ glyph: "ﭦ ﭧ", mark: null });
  });
});
