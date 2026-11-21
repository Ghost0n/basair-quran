import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdown, textDirection } from "./chat-markdown";

describe("the chat's Markdown", () => {
  it("reads headings, paragraphs, lists, quotes and rules", () => {
    const blocks = parseMarkdown("## الآيات\nسطر أول\nسطر ثانٍ\n\n- واحد\n- اثنان\n\n1. أولاً\n2. ثانياً\n\n> مقتبس\n\n---");
    expect(blocks.map((block) => block.kind)).toEqual(["h", "p", "ul", "ol", "quote", "hr"]);
    expect(blocks[1]).toEqual({ kind: "p", inline: [{ text: "سطر أول\nسطر ثانٍ" }] });
    expect(blocks[2]).toMatchObject({ kind: "ul", items: [[{ text: "واحد" }], [{ text: "اثنان" }]] });
    expect(blocks[3]).toMatchObject({ kind: "ol", start: 1 });
  });

  it("reads bold, italic and code, and leaves the rest as written", () => {
    expect(parseInline("a **b** *c* `d` e_f_g 2*3*4")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", code: true },
      { text: " e_f_g 2*3*4" },
    ]);
  });

  it("never turns markup into HTML: tags stay text", () => {
    expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([
      { kind: "p", inline: [{ text: "<img src=x onerror=alert(1)>" }] },
    ]);
  });
});

describe("an answer's direction", () => {
  it("follows the answer's own words, not the ayahs it quotes", () => {
    expect(textDirection("The ayahs speak of patience: ﴿وَاصْبِرْ وَمَا صَبْرُكَ إِلَّا بِاللَّهِ﴾ (16:127).")).toBe("ltr");
    expect(textDirection("تتحدث الآيات عن الصبر: ﴿وَاصْبِرْ﴾")).toBe("rtl");
    expect(textDirection("صبر کا ذکر ان آیات میں ہے")).toBe("rtl");
    expect(textDirection("Les versets parlent de la patience.")).toBe("ltr");
    expect(textDirection("﴿وَاصْبِرْ﴾")).toBe("rtl");
  });
});
