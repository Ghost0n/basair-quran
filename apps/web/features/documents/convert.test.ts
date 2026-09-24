import { describe, expect, it } from "vitest";

import type { NotebookItem, ResearchAgentResponse, ThemeBoard } from "@q-basair/shared";

import { TAFSSIR_DOCUMENT_NOTE, documentFromBoard, documentFromSession, documentToMarkdown } from "./convert";

const response: ResearchAgentResponse = {
  status: "answered",
  mode: "tafssir",
  answer: "plain",
  tafssir: { summary: "خلاصة", linguistic_analysis: "تحليل" },
  related_terms: [],
  searches: [],
  ayahs: [
    { ayah_id: 262, mushaf_id: 2, surah: "البقرة", surah_id: 2, ayah: 255, text: "ٱللَّهُ لَآ إِلَٰهَ", global_index: 1, highlights: [], matched_terms: [] },
  ],
};

describe("documentFromSession", () => {
  it("keeps questions, labels AI answers, lists evidence and adds the tafssir note", () => {
    const doc = documentFromSession({
      id: "studio-1",
      title: "آية الكرسي",
      mode: "tafssir",
      messages: [
        { role: "user", content: "ما دلالة آية الكرسي؟" },
        { role: "assistant", content: "fallback", response },
      ],
    });
    expect(doc.sections.map((section) => [section.id, section.kind])).toEqual([
      ["disclaimer", "note"],
      ["q0", "question"],
      ["a1", "ai_answer"],
      ["e1", "ayahs"],
    ]);
    expect(doc.sections[0].body).toBe(TAFSSIR_DOCUMENT_NOTE);
    expect(doc.sections[0].body).toContain("تجريبي");
    expect(doc.sections[2].body).toContain("**الخلاصة:** خلاصة");
    expect(doc.sections[3].ayahs[0]).toMatchObject({ surah_id: 2, ayah: 255, ayah_id: 262 });
    expect(doc.provenance).toEqual({ mode: "tafssir", ai_sections: ["a1"], created_from: "studio", source_id: "studio-1" });
    expect(doc.summary).toBe("ما دلالة آية الكرسي؟");
  });

  it("uses the plain answer in strict mode, without a disclaimer", () => {
    const doc = documentFromSession({
      id: "s",
      title: "",
      mode: "strict",
      messages: [
        { role: "user", content: "سؤال" },
        { role: "assistant", content: "x", response: { ...response, mode: "strict", tafssir: null } },
      ],
    });
    expect(doc.sections[0].kind).toBe("question");
    expect(doc.sections[1].body).toBe("plain");
    expect(doc.title).toBe("سؤال");
  });
});

describe("documentFromBoard", () => {
  const items: NotebookItem[] = [
    { id: 1, ayah_id: 10, mushaf_id: 2, surah: "البقرة", surah_id: 2, ayah: 3, theme_ids: [5], created_at: 1 },
    { id: 2, ayah_id: 20, mushaf_id: 2, surah: "البقرة", surah_id: 2, ayah: 4, theme_ids: [5], created_at: 2 },
  ];
  const nodeId = (item: NotebookItem) => `a-${item.mushaf_id}-${item.ayah_id}`;

  it("reads headings, ayahs, notes and relations top-to-bottom", () => {
    const board: ThemeBoard = {
      v: 1,
      nodes: [
        { id: "a-2-20", type: "ayah", x: 0, y: 200, data: {} },
        { id: "h1", type: "heading", x: 0, y: 0, data: { text: "صفات المتقين" } },
        { id: "a-2-10", type: "ayah", x: 400, y: 200, data: {} },
        { id: "n1", type: "note", x: 0, y: 600, data: { text: "تأمل" } },
        { id: "n2", type: "note", x: 0, y: 700, data: { text: "  " } },
      ],
      edges: [{ id: "e", source: "a-2-10", target: "a-2-20", label: "يؤكّد" }],
    };
    const doc = documentFromBoard({ id: 5, name: "التقوى" }, board, items, nodeId);
    expect(doc.title).toBe("التقوى");
    expect(doc.theme_ids).toEqual([5]);
    expect(doc.sections.map((section) => section.id)).toEqual(["h1", "n1", "relations"]);
    // RTL: the right-most ayah (x=400) reads first.
    expect(doc.sections[0].ayahs.map((ref) => ref.ayah)).toEqual([3, 4]);
    expect(doc.sections[0].ayahs[0].text).toBe("");
    expect(doc.sections[2].body).toBe("- البقرة 3 ← يؤكّد → البقرة 4");
    expect(doc.provenance.created_from).toBe("board");
  });
});

describe("documentToMarkdown", () => {
  it("renders sections, marks AI output and quotes ayahs with references", () => {
    const md = documentToMarkdown(
      {
        title: "بحث",
        summary: "ملخص",
        sections: [
          { id: "a", kind: "ai_answer", title: null, body: "جواب", ayahs: [] },
          { id: "b", kind: "ayahs", title: null, body: "", ayahs: [{ mushaf_id: 2, surah_id: 2, ayah: 255, text: "نص" }] },
        ],
        references: [{ kind: "book", label: "مقاييس اللغة", locator: "ج1" }],
        provenance: { ai_sections: ["a"], created_from: "studio" },
      },
      () => "البقرة",
    );
    expect(md).toContain("# بحث");
    expect(md).toContain("## جواب الباحث الآلي (مولَّد آلياً)");
    expect(md).toContain("> نص ﴿البقرة: 255﴾");
    expect(md).toContain("- مقاييس اللغة — ج1");
  });
});
