import { describe, expect, it } from "vitest";

import { parseBlocks, parseInline } from "./markdown-lite";

describe("markdown-lite", () => {
  it("splits bold runs", () => {
    expect(parseInline("**الخلاصة:** نص")).toEqual([
      { text: "الخلاصة:", bold: true },
      { text: " نص", bold: false },
    ]);
  });

  it("groups paragraphs and bullet lists", () => {
    expect(parseBlocks("سطر أول\nتابع\n\n- أ\n- **ب**\nفقرة")).toEqual([
      { kind: "p", inline: [{ text: "سطر أول تابع", bold: false }] },
      { kind: "ul", items: [[{ text: "أ", bold: false }], [{ text: "ب", bold: true }]] },
      { kind: "p", inline: [{ text: "فقرة", bold: false }] },
    ]);
  });

  it("never interprets HTML", () => {
    expect(parseBlocks("<img src=x onerror=alert(1)>")).toEqual([
      { kind: "p", inline: [{ text: "<img src=x onerror=alert(1)>", bold: false }] },
    ]);
  });
});
