"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { PublishResult } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useDialog } from "@/lib/use-dialog";
import { isBanned } from "@/features/community/labels";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

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
      setError(
        isBanned(err)
          ? t("النشر والتعليق موقوفان مؤقتاً لحسابك.")
          : err instanceof Error && /401|auth/i.test(err.message)
            ? t("سجّل الدخول لتنشر في المجتمع.")
            : t("تعذّر النشر الآن."),
      );
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="qb-rsheet qb-publish-sheet" role="dialog" aria-modal="true" aria-label={t("نشر في المجتمع")}>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <h2>{t("نشر في المجتمع")}</h2>
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="body">
          {!result ? (
            <>
              <div className="choices" role="radiogroup" aria-label={t("من يرى البحث")}>
                <button type="button" role="radio" aria-checked={visibility === "public"} className={visibility === "public" ? "on" : ""} onClick={() => setVisibility("public")}>
                  <Icon name="users" size={18} />
                  <b>{t("عامّ")}</b>
                  <span>{t("يظهر في المجتمع للجميع")}</span>
                </button>
                <button type="button" role="radio" aria-checked={visibility === "unlisted"} className={visibility === "unlisted" ? "on" : ""} onClick={() => setVisibility("unlisted")}>
                  <Icon name="link" size={18} />
                  <b>{t("برابط فقط")}</b>
                  <span>{t("لمن تشاركه الرابط")}</span>
                </button>
              </div>
              <ol className="steps">
                <li>{t("فحص نصوص الآيات والمراجع ووسم المحتوى الآلي.")}</li>
                <li>{t("مراجعة وكيل آلي وفق إرشادات المجتمع.")}</li>
                <li>{t("إن احتاج البحث نظراً، يراجعه مشرف قبل ظهوره.")}</li>
              </ol>
              <label className="accept">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                <span>
                  {t("قرأتُ")} <a href="/?mode=community#guidelines" target="_blank" rel="noreferrer">{t("إرشادات المجتمع")}</a> {t("وألتزم بها، وأتحمّل مسؤولية ما أنشر.")}
                </span>
              </label>
              {error ? <p className="error" role="alert">{error}</p> : null}
              <button type="button" className="qb-btn primary block" disabled={!accepted || busy} onClick={() => void publish()}>
                {busy ? t("جارٍ الفحص…") : t("انشر البحث")}
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
        <h3>{t("يحتاج البحث إلى تعديل قبل النشر")}</h3>
        <ul>
          {result.audit.checks.filter((check) => !check.passed).map((check) => (
            <li key={check.rule}>
              {AUDIT_LABEL[check.rule] ?? check.rule}
              {check.detail ? <small> — {check.detail}</small> : null}
            </li>
          ))}
        </ul>
        <button type="button" className="qb-btn ghost block" onClick={onClose}>{t("عودة إلى البحث")}</button>
      </div>
    );
  }
  return (
    <div className="outcome queued">
      <Icon name="shieldCheck" size={26} />
      <h3>{t("أُرسل البحث للمراجعة")}</h3>
      <p>{t("اجتاز الفحوص الحاسمة. يُفحص آلياً خلال ربع ساعة تقريباً وفق إرشادات المجتمع، ثم يظهر أو يراجعه مشرف؛ وتجد النتيجة وأسبابها في «منشوراتي».")}</p>
      {result.post_id ? (
        <button type="button" className="qb-btn primary block" onClick={() => onOpenPost(result.post_id!)}>
          {t("افتح المنشور")}
        </button>
      ) : null}
    </div>
  );
}
