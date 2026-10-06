import { describe, expect, it } from "vitest";

import type { MushafLayoutGlyph, MushafLayoutLine } from "@q-basair/shared";

import {
  isCenteredLine,
  juzHeading,
  juzOf,
  measurePage,
  SHORT_LINE_RATIO,
  splitAyahEnd,
  surahHeading,
  surahNameGlyph,
} from "./glyph-page";

const word = (text: string, glyph: string) => ({ text, glyph }) as MushafLayoutGlyph;

const ayahLine = (line_number: number, glyphs: string[], extra: Partial<MushafLayoutLine> = {}): MushafLayoutLine =>
  ({
    line_number,
    line_type: "ayah",
    font_family: "qcf-p1",
    words: glyphs.map((glyph, index) => ({ word_key: `${line_number}:${index}`, glyph })),
    ...extra,
  }) as unknown as MushafLayoutLine;

const titleLine = (line_number: number): MushafLayoutLine =>
  ({ line_number, line_type: "surah_name", surah_number: 2, words: [] }) as unknown as MushafLayoutLine;

// A stand-in for the canvas: one em per glyph character (and per joining space).
const fakeMeasure = (text: string) => text.length;

describe("splitAyahEnd", () => {
  it("splits the verse-number ornament off an ayah's last word", () => {
    expect(splitAyahEnd(word("ٱلْحَمِيدُ ٦", "ﭤ ﭥ"))).toEqual({ glyph: "ﭤ", mark: "ﭥ" });
  });

  it("leaves ordinary words (and marks without a number) whole", () => {
    expect(splitAyahEnd(word("ٱللَّهَ", "ﭡ"))).toEqual({ glyph: "ﭡ", mark: null });
    expect(splitAyahEnd(word("۞ عَسَى", "ﭦ ﭧ"))).toEqual({ glyph: "ﭦ ﭧ", mark: null });
  });
});

describe("printed page", () => {
  it("maps surah numbers to the QCF_BSML calligraphic name glyphs", () => {
    expect(surahNameGlyph(1)).toBe("ﮍ");
    expect(surahNameGlyph(37)).toBe(String.fromCharCode(0xfb8d + 36));
    expect(surahNameGlyph(38)).toBe("ﯓ");
    expect(surahNameGlyph(114)).toBe(String.fromCharCode(0xfbd3 + 76));
    expect(surahNameGlyph(0)).toBe("");
    expect(surahNameGlyph(115)).toBe("");
  });

  it("names the running head's juz and surah like the print", () => {
    expect(juzOf(1, 1)).toBe(1);
    expect(juzOf(2, 142)).toBe(2);
    expect(juzOf(2, 141)).toBe(1);
    expect(juzOf(114, 6)).toBe(30);
    expect(juzHeading(1)).toBe("الجزء الأول");
    expect(juzHeading(30)).toBe("الجزء الثلاثون");
    expect(juzHeading(31)).toBe("");
    expect(surahHeading("البقرة")).toBe("سورة البقرة");
    expect(surahHeading(null)).toBe("");
  });

  it("sizes the page from its widest ayah line", () => {
    const lines = [titleLine(1), ayahLine(2, ["aaaa", "bbbb"]), ayahLine(3, ["cc"])];
    const { widths, maxEm } = measurePage(lines, fakeMeasure);
    expect(widths).toEqual([0, 9, 2]);
    expect(maxEm).toBe(9);
  });

  it("centres only a surah's short closing line", () => {
    const lines = [ayahLine(1, ["aaaaaaaaaa"]), ayahLine(2, ["aaa"]), ayahLine(3, ["aaaaaaaaaa"]), ayahLine(4, ["aaa"]), ayahLine(5, ["aaaaaaaaa"]), titleLine(6)];
    const { widths, maxEm } = measurePage(lines, fakeMeasure);
    // Short, but the surah goes on: justified.
    expect(isCenteredLine(lines, 1, widths, maxEm, 10)).toBe(false);
    // Closes a surah but nearly full (≥ 88% of the widest): justified.
    expect(widths[4] / maxEm).toBeGreaterThanOrEqual(SHORT_LINE_RATIO);
    expect(isCenteredLine(lines, 4, widths, maxEm, 10)).toBe(false);
    // The last line before a title, short: centred.
    const closing = [ayahLine(1, ["aaaaaaaaaa"]), ayahLine(2, ["aaa"]), titleLine(3)];
    const measured = measurePage(closing, fakeMeasure);
    expect(isCenteredLine(closing, 1, measured.widths, measured.maxEm, 10)).toBe(true);
  });

  it("centres the mushaf's final line and any line the layout marks centred", () => {
    const lines = [ayahLine(1, ["aaaaaaaaaa"]), ayahLine(2, ["aaa"])];
    const { widths, maxEm } = measurePage(lines, fakeMeasure);
    expect(isCenteredLine(lines, 1, widths, maxEm, 604)).toBe(true);
    expect(isCenteredLine(lines, 1, widths, maxEm, 603)).toBe(false);
    const marked = [ayahLine(1, ["aaaaaaaaaa"], { is_centered: true } as Partial<MushafLayoutLine>)];
    expect(isCenteredLine(marked, 0, [10], 10, 5)).toBe(true);
  });
});
