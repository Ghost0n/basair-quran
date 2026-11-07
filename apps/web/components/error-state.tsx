"use client";

import { useState } from "react";

import { isTechnicalMessage, sanitizeErrorMessage, sendDiagnosticReport } from "@/lib/error-report";

import { Icon } from "./icon";

import { t } from "@/lib/i18n";

/**
 * A recoverable error surface — a calm, non-technical message plus an optional
 * Retry action so a transient backend/network failure isn't a dead end. Raw
 * technical strings (e.g. "API request failed: 500 …") are NEVER shown to the
 * user — they're sanitized to friendly copy and kept only for the diagnostic
 * report. Pass `reportScope` to offer a "report this problem" button (captures a
 * diagnostic bundle; wired to the future admin pipeline — see
 * docs/error-reporting.md).
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = t("إعادة المحاولة"),
  className = "",
  reportScope,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  reportScope?: string;
}) {
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent">("idle");

  const shown = sanitizeErrorMessage(message);
  // Keep the raw text only when it's technical — it's the report detail, never
  // displayed.
  const detail = isTechnicalMessage(message) ? message : undefined;

  async function report() {
    if (reportState !== "idle" || !reportScope) return;
    setReportState("sending");
    await sendDiagnosticReport(reportScope, { userMessage: shown, detail });
    setReportState("sent");
  }

  return (
    <div className={`qb-error-state ${className}`.trim()} role="alert">
      <Icon name="alert" size={20} />
      <p className="qb-error-state-msg">{shown}</p>
      <div className="qb-error-state-actions">
        {onRetry ? (
          <button type="button" className="qb-error-state-retry" onClick={onRetry}>
            <Icon name="history" size={13} /> {retryLabel}
          </button>
        ) : null}
        {reportScope ? (
          <button
            type="button"
            className="qb-error-state-report"
            onClick={() => void report()}
            disabled={reportState !== "idle"}
          >
            {reportState === "sent" ? t("شُكراً، تمّ الإبلاغ") : t("أبلِغ عن المشكلة")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
