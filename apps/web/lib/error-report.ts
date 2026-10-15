"use client";

import { t } from "@/lib/i18n";

/**
 * Client error reporting — two jobs:
 *
 *  1. sanitizeErrorMessage() — NEVER leak a raw technical error to a user. The
 *     api-client throws strings like "API request failed: 500 Internal Server
 *     Error"; those are for logs, not people. This maps anything that looks
 *     technical to a calm, actionable Arabic message, while letting already-
 *     friendly Arabic messages (the reader's own copy) pass through.
 *
 *  2. reportError() / sendDiagnosticReport() — SCAFFOLD for a future
 *     "send a report to the admin panel" feature. Today they capture a
 *     breadcrumb trail + a diagnostic bundle and log it (dev console). When the
 *     server side lands, flip NEXT_PUBLIC_ERROR_REPORTING=1 and they POST the
 *     bundle to /api/reports. See docs/error-reporting.md for the full design.
 */

const TECHNICAL_PATTERNS = [
  /API request failed/i,
  /internal server error/i,
  /\b[45]\d\d\b/, // bare HTTP status codes (400–599)
  /failed to fetch/i,
  /networkerror/i,
  /load failed|network connection was lost/i, // WebKit (iOS) fetch network errors
  /\bfetch\b/i,
  /\btimeout\b/i,
  /ECONN|ETIMEDOUT|ENOTFOUND/i,
  /unexpected token|not valid json|<!doctype/i,
  /did not match the expected pattern|JSON\.parse|SyntaxError/i, // WebKit / JSON parse errors
  /traceback|stack/i,
];

/** The one message users see when something technical goes wrong. */
const GENERIC_USER_MESSAGE = "تعذّر إتمام الطلب الآن. تحقّق من اتصالك وحاول مرة أخرى.";

/**
 * Returns a user-facing message: the given one if it's already a friendly
 * (non-technical) string, otherwise a calm generic message. Empty/undefined
 * also falls back to the generic message.
 */
export function sanitizeErrorMessage(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) return t(GENERIC_USER_MESSAGE);
  if (TECHNICAL_PATTERNS.some((pattern) => pattern.test(value))) return t(GENERIC_USER_MESSAGE);
  return value;
}

/** True if the message carries technical detail we shouldn't show a user. */
export function isTechnicalMessage(raw?: string | null): boolean {
  const value = (raw ?? "").trim();
  return !value || TECHNICAL_PATTERNS.some((pattern) => pattern.test(value));
}

// ---------------------------------------------------------------------------
// Breadcrumbs + diagnostic capture (scaffold)
// ---------------------------------------------------------------------------

export type Breadcrumb = { at: number; scope: string; message: string };

const MAX_BREADCRUMBS = 40;
const breadcrumbs: Breadcrumb[] = [];

function pushBreadcrumb(scope: string, message: string): void {
  breadcrumbs.push({ at: Date.now(), scope, message });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Record an error for diagnostics. Called at the CATCH site (where the raw error
 * lives). Logs in dev and adds a breadcrumb; the technical detail never reaches
 * the UI — the UI shows sanitizeErrorMessage() instead.
 */
export function reportError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  const detail = errorText(error);
  pushBreadcrumb(scope, detail);
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.error(`[qb:${scope}]`, detail, context ?? "");
  }
}

export type DiagnosticReport = {
  scope: string;
  user_message: string;
  detail?: string;
  url?: string;
  user_agent?: string;
  at: number;
  breadcrumbs: Breadcrumb[];
  context?: Record<string, unknown>;
};

const REPORTING_ENABLED = process.env.NEXT_PUBLIC_ERROR_REPORTING === "1";

let globalHooksInstalled = false;

/**
 * Sentry-shaped global capture — routes uncaught errors and unhandled promise
 * rejections into the same reporting pipeline (breadcrumbs + console, plus the
 * POST transport when it's enabled). Installed once, and only when
 * `NEXT_PUBLIC_ERROR_REPORTING=1` (opt-in, no real DSN/vendor SDK). Idempotent.
 */
export function installGlobalErrorHooks(): void {
  if (globalHooksInstalled || typeof window === "undefined" || !REPORTING_ENABLED) return;
  globalHooksInstalled = true;
  window.addEventListener("error", (event) => {
    reportError("window.error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError("unhandledrejection", event.reason);
  });
}

/**
 * The user-initiated "send a report" action (future admin pipeline). Assembles a
 * diagnostic bundle (sanitized user message + technical detail + recent
 * breadcrumbs + url/agent) and:
 *   • always logs it locally (so a dev/admin can retrieve it today), and
 *   • POSTs it to /api/reports ONLY when NEXT_PUBLIC_ERROR_REPORTING=1 (the
 *     endpoint + admin panel are a future implementation — see
 *     docs/error-reporting.md). Never throws; returns whether it was accepted.
 */
export async function sendDiagnosticReport(
  scope: string,
  input: { userMessage: string; detail?: string; context?: Record<string, unknown> },
): Promise<boolean> {
  const report: DiagnosticReport = {
    scope,
    user_message: input.userMessage,
    detail: input.detail,
    // Pathname only — never the query string, which can carry the user's search
    // text or other sensitive params into the diagnostic bundle.
    url: typeof window !== "undefined" ? window.location.pathname : undefined,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    at: Date.now(),
    breadcrumbs: [...breadcrumbs],
    context: input.context,
  };

  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn("[qb:report]", report);
  }

  if (!REPORTING_ENABLED) {
    // Captured locally; the transport is a future implementation.
    return true;
  }

  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    return response.ok;
  } catch {
    return false;
  }
}
