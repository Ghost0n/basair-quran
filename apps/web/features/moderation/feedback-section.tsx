"use client";

import { useCallback, useEffect, useState } from "react";

import type { FeedbackItem, FeedbackKind, FeedbackPage, FeedbackStatus } from "@q-basair/shared";

import { relativeAge } from "@/features/companions/use-companions";
import { FEEDBACK_KIND_LABEL, FEEDBACK_STATUS_LABEL } from "@/features/community/labels";
import { useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

import { api } from "./api";

const STATUSES: FeedbackStatus[] = ["new", "in_progress", "resolved", "closed"];
const KINDS: FeedbackKind[] = ["contact", "bug", "help", "feature", "error"];

/**
 * The feedback centre: contact messages, bug reports, help and feature
 * requests and diagnostic reports, newest first, filtered by status and kind.
 * Staff move each one along (new → in progress → resolved / closed) with a note.
 */
export function FeedbackSection({ onChange }: { onChange: () => void }) {
  const formatNumber = useNumerals();
  const [status, setStatus] = useState<FeedbackStatus | null>("new");
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [page, setPage] = useState<FeedbackPage | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(
    async (before?: number) => {
      const next = await api
        .getFeedbackTriage({ status: status ?? undefined, kind: kind ?? undefined, before })
        .catch(() => null);
      if (!next) return;
      setPage((current) => (before && current ? { ...next, items: [...current.items, ...next.items] } : next));
    },
    [status, kind],
  );
  useEffect(() => {
    setPage(null);
    void load();
  }, [load]);

  async function move(item: FeedbackItem, next: FeedbackStatus) {
    const updated = await api.updateFeedback(item.id, { status: next, staff_note: notes[item.id] ?? item.staff_note ?? null }).catch(() => null);
    if (!updated) return;
    setPage((current) =>
      current
        ? {
            ...current,
            items: status && status !== next ? current.items.filter((entry) => entry.id !== item.id) : current.items.map((entry) => (entry.id === item.id ? updated : entry)),
          }
        : current,
    );
    onChange();
  }

  return (
    <>
      <div className="qb-filter-row" role="group" aria-label={t("تصفية الملاحظات")}>
        {STATUSES.map((value) => (
          <button key={value} type="button" className={`qb-chip toggle${status === value ? " on" : ""}`} onClick={() => setStatus(status === value ? null : value)}>
            {FEEDBACK_STATUS_LABEL[value]}
            {page ? <span className="count">{formatNumber(page.counts[value] ?? 0)}</span> : null}
          </button>
        ))}
      </div>
      <div className="qb-filter-row" role="group" aria-label={t("النوع")}>
        {KINDS.map((value) => (
          <button key={value} type="button" className={`qb-chip toggle${kind === value ? " on" : ""}`} onClick={() => setKind(kind === value ? null : value)}>
            {FEEDBACK_KIND_LABEL[value]}
          </button>
        ))}
      </div>
      {page === null ? <div className="qb-skeleton-list" aria-hidden><span /><span /></div> : null}
      {page?.items.length === 0 ? <div className="qb-empty">{t("لا ملاحظات هنا.")}</div> : null}
      {page?.items.map((item) => (
        <article key={item.id} className={`qb-mod-card qb-glass k-${item.kind}`}>
          <header>
            <span className={`reason k-${item.kind}`}>{FEEDBACK_KIND_LABEL[item.kind]}</span>
            <span className="meta">
              {FEEDBACK_STATUS_LABEL[item.status]} · {relativeAge(item.created_at)}
            </span>
          </header>
          {item.message ? <p className="comment-body">{item.message}</p> : null}
          <p className="meta">
            {item.user_id != null ? `${t("حساب")} #${formatNumber(item.user_id)}` : t("زائر")}
            {item.email ? ` · ${item.email}` : ""}
            {item.language ? ` · ${item.language}` : ""}
            {item.url ? ` · ${item.url}` : ""}
          </p>
          {item.detail || item.user_agent ? (
            <button type="button" className="qb-btn ghost" onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}>
              {open === item.id ? t("إخفاء التفاصيل التقنية") : t("التفاصيل التقنية")}
            </button>
          ) : null}
          {open === item.id ? (
            <pre className="detail" dir="ltr">
              {JSON.stringify({ ...(item.detail ?? {}), user_agent: item.user_agent }, null, 2)}
            </pre>
          ) : null}
          <textarea
            value={notes[item.id] ?? item.staff_note ?? ""}
            onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
            placeholder={t("ملاحظة داخلية…")}
            aria-label={t("ملاحظة داخلية")}
            rows={2}
          />
          <div className="decide">
            {STATUSES.filter((value) => value !== item.status).map((value) => (
              <button key={value} type="button" className={`qb-btn ${value === "resolved" ? "ok" : "ghost"}`} onClick={() => void move(item, value)}>
                {FEEDBACK_STATUS_LABEL[value]}
              </button>
            ))}
          </div>
        </article>
      ))}
      {page?.next_before ? (
        <button type="button" className="qb-btn ghost block" onClick={() => void load(page.next_before ?? undefined)}>
          {t("المزيد")}
        </button>
      ) : null}
    </>
  );
}
