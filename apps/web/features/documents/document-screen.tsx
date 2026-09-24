"use client";

import "./documents.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type {
  AyahRef,
  DocumentAudit,
  QuoteVerification,
  ResearchDocument,
  ResearchDocumentSave,
  ResearchReference,
  ResearchSection,
  ResearchSectionKind,
  SurahListItem,
} from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { TafssirDisclaimer } from "@/features/studio/tafssir-disclaimer";

import { documentToMarkdown } from "./convert";
import { downloadBlob, renderShareCard, shareOrDownload } from "./share-card";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const SAVE_DELAY_MS = 1200;

const KIND_LABEL: Record<ResearchSectionKind, string> = {
  text: "نص",
  ayahs: "آيات",
  note: "ملاحظة",
  question: "سؤال",
  ai_answer: "جواب آلي",
};

const AUDIT_LABEL: Record<string, string> = {
  quotes_verified: "نصوص الآيات مطابقة للمصحف",
  has_content: "للبحث عنوان ومحتوى",
  ai_sections_labelled: "الأقسام المولَّدة آلياً موسومة",
  tafssir_disclaimer: "القراءة التفسيرية تحمل التنبيه",
  ayah_references_resolve: "مراجع الآيات صحيحة",
};

function editable(document: ResearchDocument): ResearchDocumentSave {
  const { id: _id, v: _v, version: _version, created_at: _c, updated_at: _u, verification: _verification, ...rest } =
    document;
  return rest;
}

let sectionCounter = 0;
function newSectionId(): string {
  sectionCounter += 1;
  return `s-${Date.now().toString(36)}-${sectionCounter}`;
}

/**
 * البحث — the research document editor: title, summary, ordered sections
 * (questions, AI answers, quoted ayahs, notes, free text) and references.
 * Autosaves; every quoted ayah is verified against the mushaf on save, and the
 * pre-publication audit shows what community sharing will require.
 */
export function DocumentScreen() {
  const params = useSearchParams();
  const documentId = params.get("id") ?? "";
  const { setMode } = useShellMode();
  const mushaf = useMushaf();
  const formatNumber = useNumerals();

  const [doc, setDoc] = useState<ResearchDocumentSave | null>(null);
  const [meta, setMeta] = useState<{ version: number; updated_at: number } | null>(null);
  const [verification, setVerification] = useState<QuoteVerification | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "untitled">("idle");
  const [audit, setAudit] = useState<DocumentAudit | null>(null);
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const docRef = useRef<ResearchDocumentSave | null>(null);
  docRef.current = doc;

  useEffect(() => {
    api.getSurahs(2).then(setSurahs).catch(() => {});
  }, []);

  useEffect(() => {
    if (!documentId) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    api
      .getDocument(documentId)
      .then((loaded) => {
        if (cancelled) return;
        setDoc(editable(loaded));
        setMeta({ version: loaded.version, updated_at: loaded.updated_at });
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(err instanceof Error && /404/.test(err.message) ? "missing" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const save = useCallback(async () => {
    const current = docRef.current;
    if (!current || !dirtyRef.current) return;
    if (!current.title.trim()) {
      setSaveState("untitled");
      return;
    }
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      const saved = await api.saveDocument(documentId, current);
      setMeta({ version: saved.version, updated_at: saved.updated_at });
      setVerification(saved.verification ?? null);
      // Adopt server-filled quotes (empty ayah text → mushaf text) without
      // clobbering edits typed while the save was in flight.
      if (!dirtyRef.current) setDoc(editable(saved));
      setSaveState("saved");
    } catch {
      dirtyRef.current = true;
      setSaveState("error");
    }
  }, [documentId]);

  // Flush on leave.
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void save();
    },
    [save],
  );

  function update(patch: Partial<ResearchDocumentSave>) {
    setDoc((current) => (current ? { ...current, ...patch } : current));
    dirtyRef.current = true;
    setAudit(null);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  function updateSection(id: string, patch: Partial<ResearchSection>) {
    if (!doc) return;
    update({ sections: doc.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)) });
  }

  function moveSection(id: string, delta: number) {
    if (!doc) return;
    const index = doc.sections.findIndex((section) => section.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= doc.sections.length) return;
    const sections = [...doc.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    update({ sections });
  }

  function removeSection(id: string) {
    if (!doc) return;
    update({
      sections: doc.sections.filter((section) => section.id !== id),
      provenance: { ...doc.provenance, ai_sections: doc.provenance.ai_sections.filter((sectionId) => sectionId !== id) },
    });
  }

  function addSection(kind: ResearchSectionKind) {
    if (!doc) return;
    update({ sections: [...doc.sections, { id: newSectionId(), kind, title: null, body: "", ayahs: [] }] });
  }

  function fixQuote(sectionId: string, ref: AyahRef, expected: string) {
    if (!doc) return;
    update({
      sections: doc.sections.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              ayahs: section.ayahs.map((entry) =>
                entry.surah_id === ref.surah_id && entry.ayah === ref.ayah ? { ...entry, text: expected } : entry,
              ),
            },
      ),
    });
  }

  const surahName = (surahId: number) => surahs.find((surah) => surah.id === surahId)?.name ?? String(surahId);

  async function runAudit() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    await save();
    try {
      setAudit(await api.auditDocument(documentId));
    } catch {
      setAudit(null);
    }
  }

  function exportMarkdown() {
    if (!doc) return;
    const blob = new Blob([documentToMarkdown(doc, surahName)], { type: "text/markdown;charset=utf-8" });
    downloadBlob(blob, `${doc.title.slice(0, 60) || "research"}.md`);
  }

  function exportJson() {
    if (!doc) return;
    const payload = { v: 1, ...doc, id: documentId, version: meta?.version };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${documentId}.json`);
  }

  const ayahTotal = doc?.sections.reduce((sum, section) => sum + section.ayahs.length, 0) ?? 0;

  async function shareResearchCard() {
    if (!doc) return;
    setShareNote(null);
    const firstAyah = doc.sections.flatMap((section) => section.ayahs)[0];
    try {
      const blob = await renderShareCard({
        kind: "research",
        title: doc.title,
        summary: doc.summary,
        meta: `${formatNumber(doc.sections.length)} أقسام، ${formatNumber(ayahTotal)} آية`,
        excerpt: firstAyah?.text ?? null,
      });
      const result = await shareOrDownload(blob, "basair-research.png", doc.title);
      setShareNote(result === "shared" ? "تمت المشاركة." : "حُفظت البطاقة صورةً.");
    } catch {
      setShareNote("تعذّر إنشاء البطاقة.");
    }
  }

  async function shareVerseCard(ref: AyahRef, note?: string | null) {
    setShareNote(null);
    try {
      const blob = await renderShareCard({
        kind: "verse",
        text: ref.text,
        reference: `سورة ${surahName(ref.surah_id)}، الآية ${formatNumber(ref.ayah)}`,
        note: note ?? null,
      });
      const result = await shareOrDownload(blob, `basair-${ref.surah_id}-${ref.ayah}.png`, ref.text);
      setShareNote(result === "shared" ? "تمت المشاركة." : "حُفظت البطاقة صورةً.");
    } catch {
      setShareNote("تعذّر إنشاء البطاقة.");
    }
  }

  async function removeDocument() {
    try {
      await api.deleteDocument(documentId);
      dirtyRef.current = false;
      setMode("notebook");
    } catch {
      setShareNote("تعذّر حذف البحث.");
    }
  }

  if (status === "missing" || status === "error") {
    return (
      <div className="qb-doc-state">
        <p>{status === "missing" ? "لم يُعثر على هذا البحث." : "تعذّر تحميل البحث."}</p>
        <button type="button" onClick={() => setMode("notebook")}>العودة إلى الدفتر</button>
      </div>
    );
  }
  if (!doc) return <div className="qb-doc-state">جارٍ التحميل…</div>;

  const issuesBySection = new Map<string, QuoteVerification["issues"]>();
  for (const issue of verification?.issues ?? []) {
    issuesBySection.set(issue.section_id, [...(issuesBySection.get(issue.section_id) ?? []), issue]);
  }
  const saveLabel =
    saveState === "saving"
      ? "جارٍ الحفظ…"
      : saveState === "error"
        ? "تعذّر الحفظ"
        : saveState === "untitled"
          ? "العنوان مطلوب للحفظ"
          : saveState === "saved"
            ? "محفوظ"
            : "";

  return (
    <div className="qb-doc" dir="rtl">
      <div className="qb-doc-bar">
        <button type="button" className="back" onClick={() => setMode("notebook")} aria-label="العودة إلى الدفتر">
          <Icon name="chevRight" size={18} />
        </button>
        <span className="kicker">
          بحث{doc.provenance.created_from === "studio" ? "، من الدراسة" : doc.provenance.created_from === "board" ? "، من لوحة موضوع" : ""}
        </span>
        <span className={`save ${saveState}`} role="status" aria-live="polite">
          {saveLabel}
        </span>
        <div className="acts">
          <button type="button" onClick={() => void shareResearchCard()}>
            <Icon name="share" size={15} /> <span className="lbl">بطاقة</span>
          </button>
          <button type="button" onClick={exportMarkdown}>
            <Icon name="download" size={15} /> <span className="lbl">Markdown</span>
          </button>
          <button type="button" onClick={exportJson}>
            <Icon name="download" size={15} /> <span className="lbl">JSON</span>
          </button>
          <button type="button" onClick={() => void runAudit()}>
            <Icon name="shieldCheck" size={15} /> <span className="lbl">جاهزية النشر</span>
          </button>
        </div>
      </div>

      <div className="qb-doc-body">
        {shareNote ? <div className="qb-doc-flash" role="status">{shareNote}</div> : null}

        <input
          className="title"
          value={doc.title}
          onChange={(event) => update({ title: event.target.value.slice(0, 200) })}
          placeholder="عنوان البحث"
          aria-label="عنوان البحث"
        />
        <textarea
          className="summary"
          value={doc.summary ?? ""}
          onChange={(event) => update({ summary: event.target.value.slice(0, 1200) })}
          placeholder="ملخّص قصير للبحث…"
          aria-label="ملخّص البحث"
          rows={2}
        />
        <div className="stats">
          {formatNumber(doc.sections.length)} أقسام، {formatNumber(ayahTotal)} آية
          {meta ? `، الإصدار ${formatNumber(meta.version)}` : ""}، خاصّ بك
        </div>

        {doc.provenance.mode === "tafssir" ? <TafssirDisclaimer /> : null}

        {verification && !verification.ok ? (
          <div className="qb-doc-warn" role="alert">
            <Icon name="alert" size={15} /> بعض النصوص المقتبسة لا تطابق نص المصحف — راجِعها في الأقسام المعلَّمة.
          </div>
        ) : null}

        {audit ? (
          <div className={`qb-doc-audit${audit.publishable ? " ok" : ""}`}>
            <div className="head">
              <strong>{audit.publishable ? "البحث جاهز للنشر حين تُتاح المشاركة" : "قبل النشر:"}</strong>
              <button type="button" onClick={() => setAudit(null)} aria-label="إغلاق">
                <Icon name="close" size={14} />
              </button>
            </div>
            <ul>
              {audit.checks.map((check) => (
                <li key={check.rule} className={check.passed ? "pass" : "fail"}>
                  <Icon name={check.passed ? "check" : "alert"} size={13} /> {AUDIT_LABEL[check.rule] ?? check.rule}
                  {check.detail ? <span className="detail"> — {check.detail}</span> : null}
                </li>
              ))}
            </ul>
            <p className="fine">
              مشاركة الأبحاث مع المجتمع قادمة: تمرّ قبلها بهذه الفحوص وبمراجعة آلية ثم بشرية وفق إرشادات المجتمع.
            </p>
          </div>
        ) : null}

        <ol className="sections">
          {doc.sections.map((section, index) => {
            const issues = issuesBySection.get(section.id) ?? [];
            const isAi = section.kind === "ai_answer";
            return (
              <li key={section.id} className={`qb-doc-section kind-${section.kind}`}>
                <div className="section-head">
                  <span className={`badge${isAi ? " ai" : ""}`}>
                    {isAi ? <Icon name="sparkles" size={11} /> : null} {KIND_LABEL[section.kind]}
                  </span>
                  <input
                    className="section-title"
                    value={section.title ?? ""}
                    placeholder={section.kind === "ayahs" ? "عنوان الآيات (اختياري)" : "عنوان القسم (اختياري)"}
                    onChange={(event) => updateSection(section.id, { title: event.target.value.slice(0, 200) || null })}
                    aria-label="عنوان القسم"
                  />
                  <div className="section-acts">
                    <button type="button" onClick={() => moveSection(section.id, -1)} disabled={index === 0} aria-label="إلى الأعلى">
                      <Icon name="chevUp" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, 1)}
                      disabled={index === doc.sections.length - 1}
                      aria-label="إلى الأسفل"
                    >
                      <Icon name="chevDown" size={14} />
                    </button>
                    <button type="button" onClick={() => removeSection(section.id)} aria-label="حذف القسم">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
                {section.kind !== "ayahs" || section.body ? (
                  <textarea
                    className="section-body"
                    value={section.body}
                    onChange={(event) => updateSection(section.id, { body: event.target.value.slice(0, 8000) })}
                    placeholder={section.kind === "note" ? "ملاحظتك…" : section.kind === "question" ? "السؤال…" : "النص…"}
                    aria-label={`نص القسم: ${KIND_LABEL[section.kind]}`}
                    rows={Math.min(14, Math.max(3, Math.ceil(section.body.length / 70)))}
                  />
                ) : null}
                {section.ayahs.length ? (
                  <ul className="ayahs">
                    {section.ayahs.map((ref) => {
                      const issue = issues.find((entry) => entry.surah_id === ref.surah_id && entry.ayah === ref.ayah);
                      return (
                        <li key={`${ref.surah_id}:${ref.ayah}`} className={issue ? "bad" : ""}>
                          <p className="text">{ref.text || "…"}</p>
                          <div className="ref-row">
                            <button
                              type="button"
                              className="ref"
                              onClick={() => {
                                if (ref.ayah_id) void mushaf.loadByAyah(ref.mushaf_id || 2, ref.ayah_id, []);
                                setMode("reading");
                              }}
                            >
                              ﴿{surahName(ref.surah_id)}: {formatNumber(ref.ayah)}﴾
                            </button>
                            <button type="button" className="mini" onClick={() => void shareVerseCard(ref)}>
                              <Icon name="share" size={12} /> بطاقة
                            </button>
                            <button
                              type="button"
                              className="mini"
                              onClick={() =>
                                updateSection(section.id, {
                                  ayahs: section.ayahs.filter((entry) => entry !== ref),
                                })
                              }
                              aria-label="إزالة الآية من القسم"
                            >
                              <Icon name="close" size={12} />
                            </button>
                          </div>
                          {issue ? (
                            <div className="issue">
                              {issue.problem === "not_found" ? "هذه الآية غير موجودة في المصحف." : "النص المقتبس لا يطابق المصحف."}
                              {issue.expected ? (
                                <button type="button" onClick={() => fixQuote(section.id, ref, issue.expected!)}>
                                  استبدل بنص المصحف
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="add-row">
          <span>أضف:</span>
          <button type="button" onClick={() => addSection("text")}>نص</button>
          <button type="button" onClick={() => addSection("note")}>ملاحظة</button>
          <button type="button" onClick={() => addSection("question")}>سؤال</button>
        </div>

        <References
          references={doc.references}
          onChange={(references) => update({ references })}
        />

        <div className="danger-zone">
          {confirmDelete ? (
            <>
              <span>حذف البحث نهائياً؟</span>
              <button type="button" className="danger" onClick={() => void removeDocument()}>حذف</button>
              <button type="button" onClick={() => setConfirmDelete(false)}>إلغاء</button>
            </>
          ) : (
            <button type="button" className="danger-link" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={13} /> حذف البحث
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const REFERENCE_KINDS: { value: ResearchReference["kind"]; label: string }[] = [
  { value: "book", label: "كتاب" },
  { value: "tafsir", label: "تفسير" },
  { value: "ayah", label: "آية" },
  { value: "url", label: "رابط" },
];

function References({
  references,
  onChange,
}: {
  references: ResearchReference[];
  onChange: (references: ResearchReference[]) => void;
}) {
  const [kind, setKind] = useState<ResearchReference["kind"]>("book");
  const [label, setLabel] = useState("");
  const [locator, setLocator] = useState("");

  return (
    <section className="qb-doc-refs">
      <h2>المراجع</h2>
      {references.length ? (
        <ul>
          {references.map((reference, index) => (
            <li key={`${reference.label}-${index}`}>
              <span className="kind">{REFERENCE_KINDS.find((entry) => entry.value === reference.kind)?.label}</span>
              <span className="label">{reference.label}</span>
              {reference.locator ? <span className="loc">{reference.locator}</span> : null}
              <button
                type="button"
                onClick={() => onChange(references.filter((_, position) => position !== index))}
                aria-label="حذف المرجع"
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">لا مراجع بعد.</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!label.trim()) return;
          onChange([...references, { kind, label: label.trim().slice(0, 300), locator: locator.trim().slice(0, 500) || null }]);
          setLabel("");
          setLocator("");
        }}
      >
        <select value={kind} onChange={(event) => setKind(event.target.value as ResearchReference["kind"])} aria-label="نوع المرجع">
          {REFERENCE_KINDS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="اسم المرجع" aria-label="اسم المرجع" />
        <input
          value={locator}
          onChange={(event) => setLocator(event.target.value)}
          placeholder={kind === "ayah" ? "السورة:الآية (مثلاً 2:255)" : "الموضع (جزء/صفحة/رابط)"}
          aria-label="موضع المرجع"
          dir={kind === "url" ? "ltr" : "rtl"}
        />
        <button type="submit" disabled={!label.trim()}>إضافة</button>
      </form>
    </section>
  );
}
