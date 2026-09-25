"use client";

import { useCallback, useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ModerationDecision, ModerationQueue, PostDetail } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { relativeAge } from "@/features/companions/use-companions";
import { useNumerals } from "@/lib/preferences-context";

import { RULE_LABEL } from "./labels";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const DECISIONS: { value: ModerationDecision["decision"]; label: string; tone: string }[] = [
  { value: "publish", label: "نشر", tone: "ok" },
  { value: "request_changes", label: "طلب تعديل", tone: "warn" },
  { value: "reject", label: "رفض", tone: "danger" },
];

/**
 * The moderators' queue: posts the AI audit routed to a human (with its
 * reasons, quoted passages and suggestions) and open reports. The human
 * decision is final; the author sees the note.
 */
export function ModerationPanel({ surahName, onOpen }: { surahName: (surahId: number) => string; onOpen: (postId: string) => void }) {
  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [error, setError] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const formatNumber = useNumerals();

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

  async function decide(post: PostDetail, decision: ModerationDecision["decision"]) {
    setBusy(post.id);
    try {
      await api.decidePost(post.id, { decision, note: notes[post.id]?.trim() || null });
      setQueue((current) => (current ? { ...current, posts: current.posts.filter((entry) => entry.id !== post.id) } : current));
    } finally {
      setBusy(null);
    }
  }

  async function resolveReport(reportId: number, hideCommentId?: number) {
    if (hideCommentId != null) await api.hideComment(hideCommentId);
    else await api.resolveReport(reportId);
    setQueue((current) => (current ? { ...current, reports: current.reports.filter((entry) => entry.id !== reportId) } : current));
  }

  if (error) return <div className="qb-empty">تعذّر تحميل قائمة الإشراف.</div>;
  if (!queue) return <div className="qb-skeleton-list" aria-hidden><span /><span /></div>;

  return (
    <div className="qb-moderation">
      <h2>
        بانتظار المراجعة <span className="count">{queue.posts.length}</span>
      </h2>
      {queue.posts.length === 0 ? <div className="qb-empty">لا منشورات بانتظار المراجعة.</div> : null}
      {queue.posts.map((post) => {
        const ai = post.reviews.find((review) => review.stage === "ai");
        const issues = (ai?.issues ?? []) as { rule?: string; severity?: string; quote?: string; explanation_ar?: string; suggestion_ar?: string }[];
        return (
          <article key={post.id} className="qb-mod-card qb-glass">
            <header>
              <button type="button" className="title" onClick={() => onOpen(post.id)}>
                {post.title}
              </button>
              <span className="meta">
                {post.author_name}، {relativeAge(post.updated_at)}
              </span>
            </header>
            {post.excerpt ? (
              <p className="excerpt">
                <span className="quran">{post.excerpt.text.slice(0, 160)}</span>{" "}
                <span className="ref">﴿{surahName(post.excerpt.surah_id)}: {formatNumber(post.excerpt.ayah)}﴾</span>
              </p>
            ) : null}
            <div className="ai">
              <Icon name="shieldCheck" size={14} />
              <span>
                الوكيل الآلي: <b>{ai?.verdict === "reject" ? "يوصي بالرفض" : "يحتاج نظراً بشرياً"}</b>
                {ai?.note === "provider_unavailable" ? " (لم يكن الوكيل متاحاً)" : ai?.note === "invalid_output" ? " (مخرجات غير صالحة)" : ""}
              </span>
            </div>
            {issues.length ? (
              <ul className="issues">
                {issues.map((issue, index) => (
                  <li key={index} className={`sev-${issue.severity}`}>
                    <b>{RULE_LABEL[(issue.rule ?? "other") as keyof typeof RULE_LABEL] ?? issue.rule}</b>
                    {issue.quote ? <q>{issue.quote}</q> : null}
                    <span>{issue.explanation_ar}</span>
                    {issue.suggestion_ar ? <span className="suggest">اقتراح: {issue.suggestion_ar}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <textarea
              value={notes[post.id] ?? ""}
              onChange={(event) => setNotes((current) => ({ ...current, [post.id]: event.target.value }))}
              placeholder="ملاحظة للكاتب (اختيارية)…"
              aria-label="ملاحظة للكاتب"
              rows={2}
            />
            <div className="decide">
              {DECISIONS.map((decision) => (
                <button
                  key={decision.value}
                  type="button"
                  className={`qb-btn ${decision.tone}`}
                  disabled={busy === post.id}
                  onClick={() => void decide(post, decision.value)}
                >
                  {decision.label}
                </button>
              ))}
            </div>
          </article>
        );
      })}

      <h2>
        البلاغات <span className="count">{queue.reports.length}</span>
      </h2>
      {queue.reports.length === 0 ? <div className="qb-empty">لا بلاغات مفتوحة.</div> : null}
      {queue.reports.map((report) => (
        <article key={report.id} className="qb-mod-card qb-glass compact">
          <header>
            <span className="title">{report.target_type === "post" ? "منشور" : "تعليق"}: {RULE_LABEL[report.rule as keyof typeof RULE_LABEL] ?? report.rule}</span>
            <span className="meta">{relativeAge(report.created_at)}</span>
          </header>
          {report.target_preview ? <p className="excerpt">«{report.target_preview}»</p> : null}
          {report.note ? <p className="note">{report.note}</p> : null}
          <div className="decide">
            {report.target_type === "post" ? (
              <button type="button" className="qb-btn ghost" onClick={() => onOpen(report.target_id)}>
                افتح المنشور
              </button>
            ) : (
              <button type="button" className="qb-btn danger" onClick={() => void resolveReport(report.id, Number(report.target_id))}>
                إخفاء التعليق
              </button>
            )}
            <button type="button" className="qb-btn ghost" onClick={() => void resolveReport(report.id)}>
              لا مخالفة
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
