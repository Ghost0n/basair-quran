"use client";

import { useCallback, useEffect, useState } from "react";

import type { AppealItem, GuidelineRule, ModerationDecision, ModerationQueue, ModerationQueueItem } from "@q-basair/shared";

import { relativeAge } from "@/features/companions/use-companions";
import { QUEUE_REASON_LABEL, RULE_LABEL } from "@/features/community/labels";
import { useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

import { api } from "./api";
import { AgentCheck, AuthorBadge } from "./parts";

type Decision = ModerationDecision["decision"];

const DECISION_LABEL: Record<Decision, () => string> = {
  approve: () => t("قبول"),
  decline: () => t("رفض مع السبب"),
  remove: () => t("إزالة"),
  restore: () => t("إبقاء (لا مخالفة)"),
};
const DECISION_TONE: Record<Decision, string> = { approve: "ok", decline: "warn", remove: "danger", restore: "ghost" };

function decisionsFor(item: ModerationQueueItem): Decision[] {
  if (item.item_type === "comment") return item.reason === "reported" ? ["restore", "decline"] : ["approve", "decline"];
  const live = item.post?.status === "published";
  if (item.reason === "reported" && live && !item.post?.review_state) return ["restore", "remove"];
  return ["approve", "decline"];
}

const APPEAL_DECISION_LABEL: Record<string, () => string> = {
  post_decline: () => t("رفض منشور"),
  post_remove: () => t("إزالة منشور"),
  comment_decline: () => t("رفض تعليق"),
  ban_7d: () => t("إيقاف ٧ أيام"),
  ban_30d: () => t("إيقاف ٣٠ يوماً"),
  ban_permanent: () => t("إيقاف نهائي"),
};

/**
 * What waits for a person, oldest first: first posts of unverified authors,
 * items the agent was unsure about or declined, reported items — each with the
 * agent's reasons, the reports and the author's standing — then the open
 * appeals. A decline or removal needs a reason: the author reads it.
 */
export function QueueSection({
  surahName,
  onOpen,
  onChange,
}: {
  surahName: (surahId: number) => string;
  onOpen: (postId: string) => void;
  onChange: () => void;
}) {
  const formatNumber = useNumerals();
  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [error, setError] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(false);
    try {
      setQueue(await api.getModerationQueue());
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const key = (item: ModerationQueueItem) => `${item.item_type}:${item.item_id}`;

  async function decide(item: ModerationQueueItem, decision: Decision) {
    const note = notes[key(item)]?.trim() || null;
    if ((decision === "decline" || decision === "remove") && !note) {
      setProblem((current) => ({ ...current, [key(item)]: t("اكتب السبب؛ يقرؤه الكاتب.") }));
      return;
    }
    setBusy(key(item));
    try {
      if (item.item_type === "post") await api.decidePost(item.item_id, { decision, note });
      else await api.decideComment(Number(item.item_id), { decision, note });
      setQueue((current) => (current ? { ...current, items: current.items.filter((entry) => entry.id !== item.id) } : current));
      onChange();
    } catch {
      setProblem((current) => ({ ...current, [key(item)]: t("تعذّر تسجيل القرار.") }));
    } finally {
      setBusy(null);
    }
  }

  async function decideAppeal(appeal: AppealItem, outcome: "uphold" | "overturn") {
    setBusy(`appeal:${appeal.id}`);
    try {
      await api.decideAppeal(appeal.id, { outcome, note: notes[`appeal:${appeal.id}`]?.trim() || null });
      setQueue((current) => (current ? { ...current, appeals: current.appeals.filter((entry) => entry.id !== appeal.id) } : current));
      onChange();
    } catch {
      setProblem((current) => ({ ...current, [`appeal:${appeal.id}`]: t("يراجع الاعتراضَ مشرفٌ غير صاحب القرار.") }));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <div className="qb-empty">{t("تعذّر تحميل قائمة الإشراف.")}</div>;
  if (!queue) return <div className="qb-skeleton-list" aria-hidden><span /><span /></div>;

  return (
    <>
      <h2>
        {t("بانتظار قرار")} <span className="count">{formatNumber(queue.items.length)}</span>
      </h2>
      {queue.items.length === 0 ? <div className="qb-empty">{t("لا شيء بانتظار المراجعة.")}</div> : null}
      {queue.items.map((item) => (
        <article key={item.id} className={`qb-mod-card qb-glass r-${item.reason}`}>
          <header>
            <span className={`reason r-${item.reason}`}>{QUEUE_REASON_LABEL[item.reason]}</span>
            <span className="meta">{relativeAge(item.opened_at)}</span>
          </header>
          <AuthorBadge author={item.author} />
          {item.post ? (
            <>
              <button type="button" className="title" onClick={() => onOpen(item.item_id)}>
                {item.post.candidate?.title ?? item.post.title}
              </button>
              {item.post.review_state ? <p className="note">{t("نسخة جديدة لمنشور ظاهر؛ تبقى القديمة حتى تُقبل.")}</p> : null}
              {item.post.summary ? <p className="excerpt">{item.post.summary}</p> : null}
              {item.post.excerpt ? (
                <p className="excerpt">
                  <span className="quran">{item.post.excerpt.text.slice(0, 160)}</span>{" "}
                  <span className="ref">
                    ﴿{surahName(item.post.excerpt.surah_id)}: {formatNumber(item.post.excerpt.ayah)}﴾
                  </span>
                </p>
              ) : null}
            </>
          ) : item.comment ? (
            <>
              <p className="comment-body">«{item.comment.body}»</p>
              {item.post_title ? (
                <p className="meta">
                  {t("على:")} {item.post_title}
                </p>
              ) : null}
            </>
          ) : null}
          <AgentCheck checks={item.checks} />
          {item.reports.length ? (
            <ul className="reports">
              {item.reports.map((report) => (
                <li key={report.id}>
                  <b>{RULE_LABEL[report.rule as GuidelineRule] ?? report.rule}</b>
                  {report.note ? <span> — {report.note}</span> : null}
                  <small> · {relativeAge(report.created_at)}</small>
                </li>
              ))}
            </ul>
          ) : null}
          {item.is_mine ? (
            <p className="note">{t("هذا محتواك؛ يقرّر فيه مشرف آخر.")}</p>
          ) : (
            <>
              <textarea
                value={notes[key(item)] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [key(item)]: event.target.value }))}
                placeholder={t("السبب أو الملاحظة للكاتب (يُشترط عند الرفض والإزالة)…")}
                aria-label={t("ملاحظة للكاتب")}
                rows={2}
              />
              {problem[key(item)] ? <p className="problem" role="alert">{problem[key(item)]}</p> : null}
              <div className="decide">
                {decisionsFor(item).map((decision) => (
                  <button
                    key={decision}
                    type="button"
                    className={`qb-btn ${DECISION_TONE[decision]}`}
                    disabled={busy === key(item)}
                    onClick={() => void decide(item, decision)}
                  >
                    {DECISION_LABEL[decision]()}
                  </button>
                ))}
              </div>
            </>
          )}
        </article>
      ))}

      <h2>
        {t("الاعتراضات")} <span className="count">{formatNumber(queue.appeals.length)}</span>
      </h2>
      {queue.appeals.length === 0 ? <div className="qb-empty">{t("لا اعتراضات مفتوحة.")}</div> : null}
      {queue.appeals.map((appeal) => (
        <article key={appeal.id} className="qb-mod-card qb-glass compact">
          <header>
            <span className="reason">{APPEAL_DECISION_LABEL[appeal.decision ?? ""]?.() ?? appeal.decision}</span>
            <span className="meta">{relativeAge(appeal.created_at)}</span>
          </header>
          {appeal.decision_reason ? (
            <p className="note">
              {t("سبب القرار:")} {appeal.decision_reason}
            </p>
          ) : null}
          <p className="comment-body">«{appeal.message}»</p>
          {appeal.target_type === "post" ? (
            <button type="button" className="qb-btn ghost" onClick={() => onOpen(appeal.target_id)}>
              {t("افتح المنشور")}
            </button>
          ) : null}
          <textarea
            value={notes[`appeal:${appeal.id}`] ?? ""}
            onChange={(event) => setNotes((current) => ({ ...current, [`appeal:${appeal.id}`]: event.target.value }))}
            placeholder={t("ملاحظة (اختيارية)…")}
            aria-label={t("ملاحظة على الاعتراض")}
            rows={2}
          />
          {problem[`appeal:${appeal.id}`] ? <p className="problem" role="alert">{problem[`appeal:${appeal.id}`]}</p> : null}
          <div className="decide">
            <button type="button" className="qb-btn ok" disabled={busy === `appeal:${appeal.id}`} onClick={() => void decideAppeal(appeal, "overturn")}>
              {t("قبول الاعتراض")}
            </button>
            <button type="button" className="qb-btn ghost" disabled={busy === `appeal:${appeal.id}`} onClick={() => void decideAppeal(appeal, "uphold")}>
              {t("إبقاء القرار")}
            </button>
          </div>
        </article>
      ))}
    </>
  );
}
