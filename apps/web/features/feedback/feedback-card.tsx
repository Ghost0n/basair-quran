"use client";

import { useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { FeedbackItem, FeedbackKind } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { relativeAge } from "@/features/companions/use-companions";
import { FEEDBACK_KIND_LABEL, FEEDBACK_STATUS_LABEL } from "@/features/community/labels";
import { useAuthSession } from "@/lib/auth-session-context";
import { APP_MODE } from "@/lib/app-mode/config";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { useI18n } from "@/lib/i18n/provider";
import { publicOrigin, SOURCE_URL } from "@/lib/site";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const KINDS: FeedbackKind[] = ["contact", "bug", "help", "feature"];

/** Why an address was refused (the server's codes, src/app/services/email_check.py). */
export type EmailProblem = "email_required" | "email_invalid" | "email_domain" | "email_disposable";

export const EMAIL_PROBLEM_TEXT: Record<EmailProblem, string> = {
  get email_required() {
    return t("اكتب بريدك الإلكتروني لنتمكّن من الردّ عليك.");
  },
  get email_invalid() {
    return t("عنوان البريد الإلكتروني غير صحيح.");
  },
  get email_domain() {
    return t("هذا النطاق لا يستقبل البريد. تحقّق من العنوان.");
  },
  get email_disposable() {
    return t("استعمل بريداً دائماً، لا بريداً مؤقتاً.");
  },
};

/** The same syntax the server accepts, checked before sending (the domain is the server's to check). */
export function emailSyntaxProblem(value: string): EmailProblem | null {
  const email = value.trim();
  if (!email) return "email_required";
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const labels = email.slice(at + 1).split(".");
  const ok =
    at > 0 &&
    email.length <= 254 &&
    local.length <= 64 &&
    /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local) &&
    labels.length >= 2 &&
    labels.every((label) => /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)) &&
    /^([A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/.test(labels[labels.length - 1]);
  return ok ? null : "email_invalid";
}

/** The reason the server gave for refusing the address, if that was it. */
export function emailProblemOf(error: unknown): EmailProblem | null {
  const match = /"code":\s*"(email_(?:required|invalid|domain|disposable))"/.exec(error instanceof Error ? error.message : "");
  return match ? (match[1] as EmailProblem) : null;
}

/**
 * «الدعم والملاحظات» — write to the team (docs/feedback-centre.md): a message,
 * a bug, a request for help or a feature idea. Guests may leave an email to be
 * answered; signed-in readers see what they sent and where it stands.
 */
/**
 * The website's guide, in a new tab so Settings stays open: the page itself on
 * the web, the public site from the app (null when its address isn't known).
 */
function guideUrl(): string | null {
  if (!APP_MODE) return "/guide";
  const origin = publicOrigin();
  return origin ? `${origin}/guide?on=mobile` : null;
}

export function FeedbackCard() {
  const { user } = useAuthSession();
  const { locale } = useI18n();
  const signedIn = !AUTH_ENABLED || Boolean(user);
  const [kind, setKind] = useState<FeedbackKind>("contact");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  // A guest is answered by email only: required, and checked (here, then on the server).
  const [emailProblem, setEmailProblem] = useState<EmailProblem | null>(null);
  const [mine, setMine] = useState<FeedbackItem[]>([]);
  const guide = guideUrl();

  useEffect(() => {
    if (signedIn) api.getMyFeedback().then(setMine).catch(() => {});
  }, [signedIn, state]);

  async function send() {
    if (!message.trim()) return;
    if (!signedIn) {
      const problem = emailSyntaxProblem(email);
      setEmailProblem(problem);
      if (problem) return;
    }
    setState("sending");
    try {
      await api.sendFeedback({
        kind,
        message: message.trim(),
        email: signedIn ? null : email.trim() || null,
        url: typeof window !== "undefined" ? window.location.pathname : null,
        language: locale,
      });
      setMessage("");
      setState("sent");
    } catch (error) {
      const problem = emailProblemOf(error);
      setEmailProblem(problem);
      setState(problem ? "idle" : "failed");
    }
  }

  return (
    <section className="qb-setting-card qb-feedback-card">
      <h3>{t("الدعم والملاحظات")}</h3>
      <p className="card-sub">{t("راسل الفريق: سؤال، أو خلل وجدته، أو اقتراح ميزة. يقرأ كلَّ رسالة شخصٌ من الفريق.")}</p>
      {guide ? (
        <a className="qb-feedback-guide" href={guide} target="_blank" rel="noopener">
          <Icon name="book" size={18} />
          <span>
            <strong>{t("دليل الاستخدام")}</strong>
            <small>{t("كل ميزة خطوةً خطوة، على الهاتف والحاسوب.")}</small>
          </span>
        </a>
      ) : null}
      <p className="qb-feedback-source">
        <a href={SOURCE_URL} target="_blank" rel="noopener">
          {t("«بصائر» مفتوح المصدر: اقرأ شيفرته أو ساهم فيها.")}
        </a>
      </p>
      <div className="qb-setting-seg qb-fit-choice" data-autofit="2" suppressHydrationWarning role="radiogroup" aria-label={t("نوع الرسالة")}>
        {KINDS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            className={kind === value ? "active" : ""}
            onClick={() => setKind(value)}
          >
            {FEEDBACK_KIND_LABEL[value]}
          </button>
        ))}
      </div>
      <form
        className="qb-feedback-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          value={message}
          onChange={(event) => {
            setMessage(event.target.value.slice(0, 4000));
            if (state !== "sending") setState("idle");
          }}
          placeholder={
            kind === "bug"
              ? t("ماذا حدث؟ وما الذي كنت تفعله قبله؟")
              : kind === "feature"
                ? t("ما الميزة التي تقترحها، وكيف تفيدك؟")
                : t("اكتب رسالتك…")
          }
          aria-label={t("الرسالة")}
          rows={4}
        />
        {!signedIn ? (
          <>
            <input
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value.slice(0, 254));
                setEmailProblem(null);
              }}
              onBlur={() => setEmailProblem(email.trim() ? emailSyntaxProblem(email) : null)}
              placeholder={t("بريدك الإلكتروني للردّ عليك")}
              aria-label={t("بريدك الإلكتروني للردّ عليك")}
              aria-invalid={emailProblem ? true : undefined}
              aria-describedby={emailProblem ? "qb-feedback-email-problem" : undefined}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
            />
            {emailProblem ? (
              <p className="card-sub qb-feedback-problem" id="qb-feedback-email-problem" role="alert">
                {EMAIL_PROBLEM_TEXT[emailProblem]}
              </p>
            ) : null}
          </>
        ) : null}
        <button
          type="submit"
          className="qb-btn primary"
          disabled={!message.trim() || (!signedIn && !email.trim()) || state === "sending"}
        >
          {state === "sending" ? t("جارٍ الإرسال…") : t("أرسل")}
        </button>
        {state === "sent" ? <p className="card-sub" role="status">{t("وصلت رسالتك. شكراً لك.")}</p> : null}
        {state === "failed" ? <p className="card-sub" role="alert">{t("تعذّر الإرسال الآن. حاول بعد قليل.")}</p> : null}
      </form>
      {mine.length ? (
        <div className="qb-feedback-mine">
          <h4>{t("ما أرسلته")}</h4>
          <ul>
            {mine.slice(0, 8).map((item) => (
              <li key={item.id}>
                <span className="kind">{FEEDBACK_KIND_LABEL[item.kind]}</span>
                <span className="text">{item.message}</span>
                <span className={`status s-${item.status}`}>
                  {FEEDBACK_STATUS_LABEL[item.status]} · {relativeAge(item.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
