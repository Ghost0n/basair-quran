import { describe, expect, it } from "vitest";

import { AI_NOTE_LABEL, MAX_CAROUSEL_SLIDES, TAFSSIR_BADGE, buildCarousel, clip, plainText } from "./carousel";

const helpers = { surahName: (id: number) => `س${id}`, formatNumber: (n: number) => String(n) };
const ref = (surah: number, ayah: number) => ({ mushaf_id: 2, surah_id: surah, ayah, text: `نص ${surah}:${ayah}` });

describe("buildCarousel", () => {
  it("has a cover, one slide per ayah (note on the section's first ayah) and a closing slide", () => {
    const slides = buildCarousel(
      {
        title: "الصبر",
        summary: "ملخص",
        sections: [
          { id: "s1", kind: "ayahs", body: "- **أولاً** الصبر عند البلاء", ayahs: [ref(2, 153), ref(2, 155)] },
          { id: "s2", kind: "ai_answer", body: "خلاصة آلية", ayahs: [ref(3, 200)] },
        ],
        author: "مريم",
      },
      helpers,
    );
    expect(slides.map((slide) => slide.kind)).toEqual(["research", "verse", "verse", "verse", "closing"]);
    expect(slides.map((slide) => slide.counter)).toEqual(["1 / 5", "2 / 5", "3 / 5", "4 / 5", "5 / 5"]);
    const [cover, first, second, third] = slides;
    expect(cover).toMatchObject({ meta: "3 آيات، سورتان، مريم", excerpt: null, badge: null });
    expect(first).toMatchObject({ text: "نص 2:153", reference: "سورة س2، الآية 153", note: "أولاً الصبر عند البلاء", noteLabel: null });
    expect(second).toMatchObject({ note: null });
    expect(third).toMatchObject({ note: "خلاصة آلية", noteLabel: AI_NOTE_LABEL });
  });

  it("caps the slides and says how many ayahs were left out", () => {
    const ayahs = Array.from({ length: 12 }, (_, i) => ref(2, i + 1));
    const slides = buildCarousel({ title: "ت", sections: [{ id: "s", kind: "ayahs", body: "", ayahs }] }, helpers);
    expect(slides).toHaveLength(MAX_CAROUSEL_SLIDES);
    const closing = slides[slides.length - 1];
    expect(closing.kind === "closing" && closing.lines[0]).toBe("في البحث 12 آية، هذه 8 منها.");
  });

  it("labels a Tafssir research on the cover and the closing slide, and links a published post", () => {
    const slides = buildCarousel(
      { title: "ت", mode: "tafssir", url: "https://example.org/?mode=post&id=p", sections: [] },
      helpers,
    );
    expect(slides).toHaveLength(2);
    expect(slides[0]).toMatchObject({ badge: TAFSSIR_BADGE });
    expect(slides[1]).toMatchObject({ badge: TAFSSIR_BADGE, title: "اقرأ البحث كاملاً", url: "https://example.org/?mode=post&id=p" });
    expect(slides[1].kind === "closing" && slides[1].lines[0]).toContain("تجريبية");
  });

  it("quotes the first ayah on the cover when it stands alone", () => {
    const [cover] = buildCarousel({ title: "ت", sections: [{ id: "s", kind: "ayahs", body: "", ayahs: [] }] }, helpers);
    expect(cover).toMatchObject({ kind: "research", excerpt: null });
  });
});

describe("text helpers", () => {
  it("flattens the markdown subset to plain text", () => {
    expect(plainText("فقرة **مهمة**\n\n- بند\n- بند آخر")).toBe("فقرة مهمة بند بند آخر");
  });

  it("clips on a word boundary with an ellipsis", () => {
    expect(clip("كلمة كلمة كلمة", 100)).toBe("كلمة كلمة كلمة");
    expect(clip("كلمة كلمة كلمة", 11)).toBe("كلمة كلمة …");
  });
});
