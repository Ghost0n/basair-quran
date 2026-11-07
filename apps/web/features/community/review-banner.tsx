"use client";

import { useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { GuidelineRule, PostDetail } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";

import { t } from "@/lib/i18n";

import { REVIEW_STATE_LABEL, RULE_LABEL, STATUS_LABEL } from "./labels";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

type Issue = { rule?: string; explanation?: string; suggestion?: string; quote?: string };

/**
 * What the author of a post sees while it is reviewed
 * (docs/community-moderation-design.md, «Author experience»): where it is
 * («قيد الفحص» until the next batch, then «بانتظار مشرف»), the agent's
 * reasons in their interface language and the moderator's note; after a
 * decline, «عدّل وأعد الإرسال» and one «اعتراض».
 */
export function ReviewBanner({ post, onEdit }: { post: PostDetail; onEdit: () => void }) {
  const [appealing, setAppealing] = useState(false);
  const [message, setMessage] = useState("");
  const [appealState, setAppealState] = useState<"idle" | "sending" | "sent" | "already" | "failed">("idle");

  // A published post may carry a new version under review; otherwise the post itself is.
  const state = post.status === "published" ? post.review_state ?? null : post.status;
  if (!state && !post.hidden) return null;

  const human = post.reviews.find((review) => review.stage === "human");
  const agent = post.reviews.find((review) => review.stage === "agent");
  const issues = (agent?.issues ?? []) as Issue[];
  const declined = state === "changes_requested" || state === "removed" || state === "rejected";
  const title =
    post.status === "published" && post.review_state
      ? REVIEW_STATE_LABEL[post.review_state]
      : state
        ? STATUS_LABEL[state]
        : t("مخفي مؤقتاً");

  async function sendAppeal() {
    const text = message.trim();
    if (!text) return;
    setAppealState("sending");
    try {
      await api.appeal({ target_type: "post", target_id: post.id, message: text });
      setAppealState("sent");
      setAppealing(false);
    } catch (error) {
      setAppealState(error instanceof Error && /\b409\b/.test(error.message) ? "already" : "failed");
    }
  }

  return (
    <div className={`qb-review-banner s-${state ?? "hidden"} qb-glass`} role="status">
      <strong>{title}</strong>
      {state === "queued" ? <p>{t("يُفحص بحثك آلياً خلال ربع ساعة تقريباً، ثم يظهر أو يراجعه مشرف.")}</p> : null}
      {state === "pending_review" ? <p>{t("يراجع مشرفٌ بحثك قبل ظهوره في المجتمع.")}</p> : null}
      {post.status === "published" && post.review_state ? <p>{t("تبقى النسخة المنشورة ظاهرة حتى تُقبل الجديدة.")}</p> : null}
      {post.hidden ? <p>{t("أخفته البلاغات عن القرّاء حتى يقرّر مشرف.")}</p> : null}
      {human?.note && declined ? (
        <p>
          {t("ملاحظة المشرف:")} {human.note}
        </p>
      ) : null}
      {issues.length && state !== "queued" ? (
        <ul>
          {issues.map((issue, index) => (
            <li key={index}>
              <b>{RULE_LABEL[(issue.rule ?? "other") as GuidelineRule] ?? issue.rule}:</b> {issue.explanation}
              {issue.quote ? <q>{issue.quote}</q> : null}
              {issue.suggestion ? <span className="suggest"> — {issue.suggestion}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {declined ? (
        <div className="actions">
          {state === "changes_requested" ? (
            <button type="button" className="qb-btn primary" onClick={onEdit}>
              <Icon name="edit" size={14} /> {t("عدّل وأعد الإرسال")}
            </button>
          ) : null}
          {appealState === "sent" ? (
            <span className="note">{t("وصل اعتراضك؛ يراجعه مشرف آخر.")}</span>
          ) : appealState === "already" ? (
            <span className="note">{t("سبق الاعتراض على هذا القرار.")}</span>
          ) : (
            <button type="button" className="qb-btn ghost" onClick={() => setAppealing((open) => !open)} aria-expanded={appealing}>
              {t("اعتراض")}
            </button>
          )}
        </div>
      ) : null}
      {appealing ? (
        <form
          className="appeal"
          onSubmit={(event) => {
            event.preventDefault();
            void sendAppeal();
          }}
        >
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, 2000))}
            placeholder={t("لماذا ترى أن القرار يحتاج مراجعة؟ (اعتراض واحد لكل قرار)")}
            aria-label={t("نص الاعتراض")}
            rows={3}
          />
          <button type="submit" className="qb-btn primary" disabled={!message.trim() || appealState === "sending"}>
            {t("أرسل الاعتراض")}
          </button>
          {appealState === "failed" ? <span className="note">{t("تعذّر إرسال الاعتراض.")}</span> : null}
        </form>
      ) : null}
    </div>
  );
}
