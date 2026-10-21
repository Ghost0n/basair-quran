"use client";

import { useState } from "react";

import type { ModerationHealth } from "@q-basair/shared";

import { relativeAge } from "@/features/companions/use-companions";
import { useNumerals } from "@/lib/preferences-context";

import { t } from "@/lib/i18n";

import { api } from "./api";

/**
 * The checking batches: what waits (for the agent and for people), the last
 * batch, today's agent checks against the daily budget, and where the worker
 * runs. Admins can run a batch now.
 */
export function HealthSection({ health, onRefresh, canRun }: { health: ModerationHealth | null; onRefresh: () => void; canRun: boolean }) {
  const formatNumber = useNumerals();
  const [running, setRunning] = useState(false);
  if (!health) return <div className="qb-skeleton-list" aria-hidden><span /><span /></div>;

  const backlog: [string, number][] = [
    [t("منشورات بانتظار الفحص"), health.backlog.queued_posts ?? 0],
    [t("تعليقات بانتظار الفحص"), health.backlog.unchecked_comments ?? 0],
    [t("بلاغات بانتظار الفحص"), health.backlog.unchecked_reports ?? 0],
    [t("بانتظار قرار مشرف"), health.backlog.waiting_for_people ?? 0],
    [t("اعتراضات مفتوحة"), health.backlog.open_appeals ?? 0],
    [t("ملاحظات مفتوحة"), health.backlog.open_feedback ?? 0],
  ];
  const worker =
    health.worker === "external" ? t("حاوية مستقلة") : health.worker === "embedded" ? t("داخل الخادم") : t("متوقّف");

  async function runNow() {
    setRunning(true);
    await api.runModerationBatch().catch(() => null);
    setRunning(false);
    onRefresh();
  }

  return (
    <>
      <div className="qb-mod-stats">
        {backlog.map(([label, value]) => (
          <div key={label} className={`stat qb-glass${value ? " busy" : ""}`}>
            <b>{formatNumber(value)}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <article className="qb-mod-card qb-glass">
        <p className="note">
          {t("الفحص الآلي:")} {worker} · {t("كل")} {formatNumber(Math.round(health.interval_seconds / 60))} {t("دقيقة")}
        </p>
        <p className="note">
          {t("فحوص اليوم:")} {formatNumber(health.today.checks)} / {formatNumber(health.today.budget)}
          {health.today.errors ? ` · ${t("أخطاء:")} ${formatNumber(health.today.errors)}` : ""}
        </p>
        {health.last_batch ? (
          <p className="note">
            {t("آخر دفعة:")} {relativeAge(health.last_batch.started_at)} · {formatNumber(health.last_batch.checked)} {t("عنصر")} ·{" "}
            {formatNumber(health.last_batch.duration_seconds)} {t("ث")}
            {health.last_batch.budget_reached ? ` · ${t("بلغت الميزانية اليومية")}` : ""}
          </p>
        ) : (
          <p className="note">{t("لم تجرِ أي دفعة بعد.")}</p>
        )}
        {canRun ? (
          <div className="decide">
            <button type="button" className="qb-btn primary" disabled={running} onClick={() => void runNow()}>
              {running ? t("جارٍ الفحص…") : t("افحص الآن")}
            </button>
          </div>
        ) : null}
      </article>
    </>
  );
}
