"use client";

import "./documents.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
import { PublishSheet } from "./publish-sheet";
import { downloadBlob } from "./share-card";
import { ShareStudio, type ShareArtifact } from "./share-studio";

import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const SAVE_DELAY_MS = 1200;

const KIND_LABEL: Record<ResearchSectionKind, string> = {
  get text() {
    return t("نص");
  },
  get ayahs() {
    return t("آيات");
  },
  get note() {
    return t("ملاحظة");
  },
  get question() {
    return t("سؤال");
  },
  get ai_answer() {
    return t("جواب آلي");
  },
};

const AUDIT_LABEL: Record<string, string> = {
  get quotes_verified() {
    return t("نصوص الآيات مطابقة للمصحف");
  },
  get has_content() {
    return t("للبحث عنوان ومحتوى");
  },
  get ai_sections_labelled() {
    return t("الأقسام المولَّدة آلياً موسومة");
  },
  get tafssir_disclaimer() {
    return t("القراءة التفسيرية تحمل التنبيه");
  },
  get ayah_references_resolve() {
    return t("مراجع الآيات صحيحة");
  },
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
  const router = useRouter();
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
  const [publishing, setPublishing] = useState(false);
  const [sharing, setSharing] = useState<{ artifact: ShareArtifact; ayahKey?: string } | null>(null);
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

  async function removeDocument() {
    try {
      await api.deleteDocument(documentId);
      dirtyRef.current = false;
      setMode("notebook");
    } catch {
      setShareNote(t("تعذّر حذف البحث."));
    }
  }

  if (status === "missing" || status === "error") {
    return (
      <div className="qb-doc-state">
        <p>{status === "missing" ? t("لم يُعثر على هذا البحث.") : t("تعذّر تحميل البحث.")}</p>
        <button type="button" onClick={() => setMode("notebook")}>{t("العودة إلى الدفتر")}</button>
      </div>
    );
  }
  if (!doc) return <div className="qb-doc-state">{t("جارٍ التحميل…")}</div>;

  const issuesBySection = new Map<string, QuoteVerification["issues"]>();
  for (const issue of verification?.issues ?? []) {
    issuesBySection.set(issue.section_id, [...(issuesBySection.get(issue.section_id) ?? []), issue]);
  }
  const saveLabel =
    saveState === "saving"
      ? t("جارٍ الحفظ…")
      : saveState === "error"
        ? t("تعذّر الحفظ")
        : saveState === "untitled"
          ? t("العنوان مطلوب للحفظ")
          : saveState === "saved"
            ? t("محفوظ")
            : "";

  return (
    <div className="qb-doc">
      <div className="qb-doc-bar">
        <button type="button" className="back" onClick={() => setMode("notebook")} aria-label={t("العودة إلى الدفتر")}>
          <Icon name="chevRight" size={18} />
        </button>
        <span className="kicker">
          {t("بحث")}{doc.provenance.created_from === "studio" ? t("، من الدراسة") : doc.provenance.created_from === "board" ? t("، من لوحة موضوع") : ""}
        </span>
        <span className={`save ${saveState}`} role="status" aria-live="polite">
          {saveLabel}
        </span>
        <div className="acts">
          <button type="button" onClick={() => setSharing({ artifact: "research" })}>
            <Icon name="share" size={15} /> <span className="lbl">{t("مشاركة")}</span>
          </button>
          <button type="button" onClick={exportMarkdown}>
            <Icon name="download" size={15} /> <span className="lbl">Markdown</span>
          </button>
          <button type="button" onClick={exportJson}>
            <Icon name="download" size={15} /> <span className="lbl">JSON</span>
          </button>
          <button type="button" onClick={() => void runAudit()}>
            <Icon name="shieldCheck" size={15} /> <span className="lbl">{t("جاهزية النشر")}</span>
          </button>
          <button type="button" className="publish" onClick={() => setPublishing(true)}>
            <Icon name="users" size={15} /> <span className="lbl">{t("نشر")}</span>
          </button>
        </div>
      </div>

      <div className="qb-doc-body">
        {shareNote ? <div className="qb-doc-flash" role="status">{shareNote}</div> : null}

        <input
          className="title"
          value={doc.title}
          onChange={(event) => update({ title: event.target.value.slice(0, 200) })}
          placeholder={t("عنوان البحث")}
          aria-label={t("عنوان البحث")}
        />
        <textarea
          className="summary"
          value={doc.summary ?? ""}
          onChange={(event) => update({ summary: event.target.value.slice(0, 1200) })}
          placeholder={t("ملخّص قصير للبحث…")}
          aria-label={t("ملخّص البحث")}
          rows={2}
        />
        <div className="stats">
          {tn("{0} قسم", doc.sections.length, { 0: formatNumber(doc.sections.length) })}
          {t("، ")}
          {tn("{0} آية", ayahTotal, { 0: formatNumber(ayahTotal) })}
          {meta ? t("، الإصدار {0}", { 0: formatNumber(meta.version) }) : ""}
        </div>

        {doc.provenance.mode === "tafssir" ? <TafssirDisclaimer /> : null}

        {verification && !verification.ok ? (
          <div className="qb-doc-warn" role="alert">
            <Icon name="alert" size={15} /> {t("بعض النصوص المقتبسة لا تطابق نص المصحف — راجِعها في الأقسام المعلَّمة.")}
          </div>
        ) : null}

        {audit ? (
          <div className={`qb-doc-audit${audit.publishable ? " ok" : ""}`}>
            <div className="head">
              <strong>{audit.publishable ? t("البحث جاهز للنشر") : t("قبل النشر:")}</strong>
              <button type="button" onClick={() => setAudit(null)} aria-label={t("إغلاق")}>
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
              {t("عند النشر تمرّ هذه الفحوص، ثم مراجعة آلية وبشرية عند الحاجة وفق إرشادات المجتمع.")}
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
                    placeholder={section.kind === "ayahs" ? t("عنوان الآيات (اختياري)") : t("عنوان القسم (اختياري)")}
                    onChange={(event) => updateSection(section.id, { title: event.target.value.slice(0, 200) || null })}
                    aria-label={t("عنوان القسم")}
                  />
                  <div className="section-acts">
                    <button type="button" onClick={() => moveSection(section.id, -1)} disabled={index === 0} aria-label={t("إلى الأعلى")}>
                      <Icon name="chevUp" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, 1)}
                      disabled={index === doc.sections.length - 1}
                      aria-label={t("إلى الأسفل")}
                    >
                      <Icon name="chevDown" size={14} />
                    </button>
                    <button type="button" onClick={() => removeSection(section.id)} aria-label={t("حذف القسم")}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
                {section.kind !== "ayahs" || section.body ? (
                  <textarea
                    className="section-body"
                    value={section.body}
                    onChange={(event) => updateSection(section.id, { body: event.target.value.slice(0, 8000) })}
                    placeholder={section.kind === "note" ? t("ملاحظتك…") : section.kind === "question" ? t("السؤال…") : t("النص…")}
                    aria-label={t("نص القسم: {0}", { 0: KIND_LABEL[section.kind] })}
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
                            <button
                              type="button"
                              className="mini"
                              onClick={() => setSharing({ artifact: "verse", ayahKey: `${section.id}:${ref.surah_id}:${ref.ayah}` })}
                            >
                              <Icon name="share" size={12} /> {t("بطاقة")}
                            </button>
                            <button
                              type="button"
                              className="mini"
                              onClick={() =>
                                updateSection(section.id, {
                                  ayahs: section.ayahs.filter((entry) => entry !== ref),
                                })
                              }
                              aria-label={t("إزالة الآية من القسم")}
                            >
                              <Icon name="close" size={12} />
                            </button>
                          </div>
                          {issue ? (
                            <div className="issue">
                              {issue.problem === "not_found" ? t("هذه الآية غير موجودة في المصحف.") : t("النص المقتبس لا يطابق المصحف.")}
                              {issue.expected ? (
                                <button type="button" onClick={() => fixQuote(section.id, ref, issue.expected!)}>
                                  {t("استبدل بنص المصحف")}
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
          <span>{t("أضف:")}</span>
          <button type="button" onClick={() => addSection("text")}>{t("نص")}</button>
          <button type="button" onClick={() => addSection("note")}>{t("ملاحظة")}</button>
          <button type="button" onClick={() => addSection("question")}>{t("سؤال")}</button>
        </div>

        <References
          references={doc.references}
          onChange={(references) => update({ references })}
        />

        {sharing ? (
          <ShareStudio
            research={{
              title: doc.title,
              summary: doc.summary,
              mode: doc.provenance.mode ?? null,
              sections: doc.sections,
              aiSectionIds: doc.provenance.ai_sections,
            }}
            references={doc.references}
            surahName={surahName}
            initial={sharing}
            onClose={() => setSharing(null)}
          />
        ) : null}

        {publishing ? (
          <PublishSheet
            documentId={documentId}
            beforePublish={async () => {
              if (timerRef.current) window.clearTimeout(timerRef.current);
              await save();
            }}
            onClose={() => setPublishing(false)}
            onOpenPost={(postId) => router.push(`/?mode=post&id=${encodeURIComponent(postId)}`)}
          />
        ) : null}

        <div className="danger-zone">
          {confirmDelete ? (
            <>
              <span>{t("حذف البحث نهائياً؟")}</span>
              <button type="button" className="danger" onClick={() => void removeDocument()}>{t("حذف")}</button>
              <button type="button" onClick={() => setConfirmDelete(false)}>{t("إلغاء")}</button>
            </>
          ) : (
            <button type="button" className="danger-link" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={13} /> {t("حذف البحث")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const REFERENCE_KINDS: { value: ResearchReference["kind"]; label: string }[] = [
  { value: "book", get label() {
    return t("كتاب");
  } },
  { value: "tafsir", get label() {
    return t("تفسير");
  } },
  { value: "ayah", get label() {
    return t("آية");
  } },
  { value: "url", get label() {
    return t("رابط");
  } },
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
      <h2>{t("المراجع")}</h2>
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
                aria-label={t("حذف المرجع")}
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">{t("لا مراجع بعد.")}</p>
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
        <select value={kind} onChange={(event) => setKind(event.target.value as ResearchReference["kind"])} aria-label={t("نوع المرجع")}>
          {REFERENCE_KINDS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("اسم المرجع")} aria-label={t("اسم المرجع")} />
        <input
          value={locator}
          onChange={(event) => setLocator(event.target.value)}
          placeholder={kind === "ayah" ? t("السورة:الآية (مثلاً 2:255)") : t("الموضع (جزء/صفحة/رابط)")}
          aria-label={t("موضع المرجع")}
          dir={kind === "url" ? "ltr" : "rtl"}
        />
        <button type="submit" disabled={!label.trim()}>{t("إضافة")}</button>
      </form>
    </section>
  );
}
