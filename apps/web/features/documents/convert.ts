import type {
  AyahRef,
  NotebookItem,
  ResearchAgentResponse,
  ResearchDocumentSave,
  ResearchSection,
  ThemeBoard,
  ThemeSummary,
} from "@q-basair/shared";

import { t } from "@/lib/i18n";

/**
 * Conversions into the research document format (spec §5): a Studio session
 * or a theme board becomes an editable, shareable document. Pure functions —
 * the server fills/verifies quoted ayah text on save.
 */

export const TAFSSIR_DOCUMENT_NOTE =
  "قراءة تفسيرية تجريبية — مولَّدة من نموذج لغوي، ليست حُجَّة شرعية ولا تنوب عن أهل العلم. الدليل المعتمد هو الآيات.";

type SessionLike = {
  id: string;
  title: string;
  mode: "strict" | "tafssir";
  messages: { role: "user" | "assistant"; content: string; response?: ResearchAgentResponse }[];
};

function ayahRefsFrom(response: ResearchAgentResponse | undefined): AyahRef[] {
  return (response?.ayahs ?? []).map((ayah) => ({
    mushaf_id: ayah.mushaf_id,
    surah_id: ayah.surah_id,
    ayah: ayah.ayah,
    ayah_id: ayah.ayah_id,
    text: ayah.text,
  }));
}

function answerBody(message: SessionLike["messages"][number]): string {
  const tafssir = message.response?.tafssir;
  if (tafssir) {
    const parts: [string, string | null | undefined][] = [
      [t("الخلاصة"), tafssir.summary],
      [t("التحليل اللغوي"), tafssir.linguistic_analysis],
      [t("صلات الآيات"), tafssir.ayah_connections],
      [t("حدود وتنبيهات"), tafssir.limits_and_cautions],
    ];
    const text = parts
      .filter(([, value]) => value && value.trim())
      .map(([label, value]) => `**${label}:** ${value!.trim()}`)
      .join("\n\n");
    if (text) return text;
  }
  return (message.response?.answer ?? message.content ?? "").trim();
}

export function documentFromSession(session: SessionLike): ResearchDocumentSave {
  const sections: ResearchSection[] = [];
  const aiSections: string[] = [];
  if (session.mode === "tafssir") {
    sections.push({ id: "disclaimer", kind: "note", title: t("تنبيه"), body: TAFSSIR_DOCUMENT_NOTE, ayahs: [] });
  }
  session.messages.forEach((message, index) => {
    if (message.role === "user") {
      sections.push({ id: `q${index}`, kind: "question", title: null, body: message.content.trim(), ayahs: [] });
      return;
    }
    const id = `a${index}`;
    aiSections.push(id);
    sections.push({ id, kind: "ai_answer", title: null, body: answerBody(message), ayahs: [] });
    const refs = ayahRefsFrom(message.response);
    if (refs.length) sections.push({ id: `e${index}`, kind: "ayahs", title: t("الآيات"), body: "", ayahs: refs });
  });
  const firstQuestion = session.messages.find((message) => message.role === "user")?.content.trim() ?? "";
  return {
    title: (session.title || firstQuestion || t("بحث")).slice(0, 200),
    summary: firstQuestion ? firstQuestion.slice(0, 600) : null,
    language: "ar",
    tags: [],
    theme_ids: [],
    sections,
    references: [],
    provenance: { mode: session.mode, ai_sections: aiSections, created_from: "studio", source_id: session.id },
  };
}

/**
 * A board reads top-to-bottom, right-to-left (RTL): headings open sections,
 * the ayahs below a heading belong to it, notes become note sections, and the
 * drawn relations are listed at the end.
 */
export function documentFromBoard(
  theme: Pick<ThemeSummary, "id" | "name">,
  board: ThemeBoard,
  items: NotebookItem[],
  ayahNodeId: (item: NotebookItem) => string,
): ResearchDocumentSave {
  const itemByNode = new Map(items.map((item) => [ayahNodeId(item), item]));
  const label = (nodeId: string): string => {
    const node = board.nodes.find((entry) => entry.id === nodeId);
    if (!node) return "";
    if (node.type === "ayah") {
      const item = itemByNode.get(nodeId);
      return item ? `${item.surah ?? ""} ${item.ayah ?? ""}`.trim() : t("آية");
    }
    return String(node.data.text ?? "").trim() || (node.type === "note" ? t("ملاحظة") : t("عنوان"));
  };

  const ordered = [...board.nodes].sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : b.x - a.x));
  const sections: ResearchSection[] = [];
  let current: ResearchSection | null = null;
  for (const node of ordered) {
    if (node.type === "heading") {
      current = { id: node.id, kind: "text", title: String(node.data.text ?? "").trim() || null, body: "", ayahs: [] };
      sections.push(current);
    } else if (node.type === "note") {
      const text = String(node.data.text ?? "").trim();
      if (text) sections.push({ id: node.id, kind: "note", title: null, body: text, ayahs: [] });
    } else {
      const item = itemByNode.get(node.id);
      if (!item || item.surah_id == null || item.ayah == null) continue;
      if (!current) {
        current = { id: "ayahs", kind: "ayahs", title: t("الآيات"), body: "", ayahs: [] };
        sections.push(current);
      }
      current.ayahs.push({
        mushaf_id: item.mushaf_id || 2,
        surah_id: item.surah_id,
        ayah: item.ayah,
        ayah_id: item.ayah_id,
        text: "",
      });
    }
  }
  const relations = board.edges
    .map((edge) => `- ${label(edge.source)} ← ${edge.label || t("مرتبطة بـ")} → ${label(edge.target)}`)
    .filter((line) => line.length > 8);
  if (relations.length) {
    sections.push({ id: "relations", kind: "text", title: t("العلاقات"), body: relations.join("\n"), ayahs: [] });
  }
  return {
    title: theme.name,
    summary: null,
    language: "ar",
    tags: [theme.name],
    theme_ids: [theme.id],
    sections: sections.filter((section) => section.body || section.ayahs.length || section.title),
    references: [],
    provenance: { mode: null, ai_sections: [], created_from: "board", source_id: String(theme.id) },
  };
}

const KIND_LABEL: Record<ResearchSection["kind"], string> = {
  text: "",
  get ayahs() {
    return t("الآيات");
  },
  get note() {
    return t("ملاحظة");
  },
  get question() {
    return t("السؤال");
  },
  get ai_answer() {
    return t("جواب الباحث الآلي");
  },
};

/** Plain Markdown export (the document stays readable anywhere). */
export function documentToMarkdown(
  document: Pick<ResearchDocumentSave, "title" | "summary" | "sections" | "references" | "provenance">,
  surahName: (surahId: number) => string,
): string {
  const lines: string[] = [`# ${document.title}`, ""];
  if (document.summary) lines.push(`> ${document.summary}`, "");
  for (const section of document.sections) {
    const heading = section.title || KIND_LABEL[section.kind];
    if (heading) lines.push(`## ${heading}${section.kind === "ai_answer" ? t(" (مولَّد آلياً)") : ""}`, "");
    if (section.body) lines.push(section.body, "");
    for (const ref of section.ayahs) {
      lines.push(`> ${ref.text} ﴿${surahName(ref.surah_id)}: ${ref.ayah}﴾`, "");
    }
  }
  if (document.references.length) {
    lines.push(t("## المراجع"), "");
    for (const reference of document.references) {
      lines.push(`- ${reference.label}${reference.locator ? ` — ${reference.locator}` : ""}`);
    }
    lines.push("");
  }
  lines.push("---", t("أُعدّ في «بصائر»."));
  return lines.join("\n");
}
