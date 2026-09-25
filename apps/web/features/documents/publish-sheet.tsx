"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { GuidelineRule, PublishResult } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useDialog } from "@/lib/use-dialog";
import { RULE_LABEL } from "@/features/community/labels";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const AUDIT_LABEL: Record<string, string> = {
  quotes_verified: "نصوص الآيات مطابقة للمصحف",
  has_content: "للبحث عنوان ومحتوى",
  ai_sections_labelled: "الأقسام المولَّدة آلياً موسومة",
  tafssir_disclaimer: "القراءة التفسيرية تحمل التنبيه",
  ayah_references_resolve: "مراجع الآيات صحيحة",
};

/**
 * «نشر» — share a research with the community. The author picks public or
 * link-only and confirms the guidelines; the server runs the blocking checks,
 * then the AI audit (which publishes on pass or queues for a moderator).
 */
export function PublishSheet({
  documentId,
  beforePublish,
  onClose,
  onOpenPost,
}: {
  documentId: string;
  beforePublish: () => Promise<void>;
  onClose: () => void;
  onOpenPost: (postId: string) => void;
}) {
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await beforePublish();
      setResult(await api.publishDocument(documentId, { visibility, accept_guidelines: accepted }));
    } catch (err) {
      setError(err instanceof Error && /401|auth/i.test(err.message) ? "سجّل الدخول لتنشر في المجتمع." : "تعذّر النشر الآن.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="qb-rsheet qb-publish-sheet" role="dialog" aria-modal="true" aria-label="نشر في المجتمع">
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <h2>نشر في المجتمع</h2>
          <button type="button" className="close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="body">
          {!result ? (
            <>
              <div className="choices" role="radiogroup" aria-label="من يرى البحث">
                <button type="button" role="radio" aria-checked={visibility === "public"} className={visibility === "public" ? "on" : ""} onClick={() => setVisibility("public")}>
                  <Icon name="users" size={18} />
                  <b>عامّ</b>
                  <span>يظهر في المجتمع للجميع</span>
                </button>
                <button type="button" role="radio" aria-checked={visibility === "unlisted"} className={visibility === "unlisted" ? "on" : ""} onClick={() => setVisibility("unlisted")}>
                  <Icon name="link" size={18} />
                  <b>برابط فقط</b>
                  <span>لمن تشاركه الرابط</span>
                </button>
              </div>
              <ol className="steps">
                <li>فحص نصوص الآيات والمراجع ووسم المحتوى الآلي.</li>
                <li>مراجعة وكيل آلي وفق إرشادات المجتمع.</li>
                <li>إن احتاج البحث نظراً، يراجعه مشرف قبل ظهوره.</li>
              </ol>
              <label className="accept">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                <span>
                  قرأتُ <a href="/?mode=community#guidelines" target="_blank" rel="noreferrer">إرشادات المجتمع</a> وألتزم بها، وأتحمّل مسؤولية ما أنشر.
                </span>
              </label>
              {error ? <p className="error" role="alert">{error}</p> : null}
              <button type="button" className="qb-btn primary block" disabled={!accepted || busy} onClick={() => void publish()}>
                {busy ? "جارٍ الفحص…" : "انشر البحث"}
              </button>
            </>
          ) : (
            <Outcome result={result} onOpenPost={onOpenPost} onClose={onClose} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Outcome({ result, onOpenPost, onClose }: { result: PublishResult; onOpenPost: (postId: string) => void; onClose: () => void }) {
  if (result.status === "blocked") {
    return (
      <div className="outcome blocked">
        <Icon name="alert" size={26} />
        <h3>يحتاج البحث إلى تعديل قبل النشر</h3>
        <ul>
          {result.audit.checks.filter((check) => !check.passed).map((check) => (
            <li key={check.rule}>
              {AUDIT_LABEL[check.rule] ?? check.rule}
              {check.detail ? <small> — {check.detail}</small> : null}
            </li>
          ))}
        </ul>
        <button type="button" className="qb-btn ghost block" onClick={onClose}>عودة إلى البحث</button>
      </div>
    );
  }
  const issues = result.ai_audit?.issues ?? [];
  return (
    <div className={`outcome ${result.status}`}>
      <Icon name={result.status === "published" ? "check" : "shieldCheck"} size={26} />
      <h3>{result.status === "published" ? "نُشر البحث" : "أُرسل البحث للمراجعة"}</h3>
      <p>
        {result.status === "published"
          ? "اجتاز الفحوص والمراجعة الآلية، وهو الآن ظاهر في المجتمع."
          : "سيراجعه مشرف قبل ظهوره، وتصلك ملاحظته في «منشوراتي»."}
      </p>
      {issues.length ? (
        <ul>
          {issues.map((issue, index) => (
            <li key={index}>
              <b>{RULE_LABEL[issue.rule as GuidelineRule] ?? issue.rule}:</b> {issue.explanation_ar}
            </li>
          ))}
        </ul>
      ) : null}
      {result.post_id ? (
        <button type="button" className="qb-btn primary block" onClick={() => onOpenPost(result.post_id!)}>
          افتح المنشور
        </button>
      ) : null}
    </div>
  );
}
