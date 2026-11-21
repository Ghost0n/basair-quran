"use client";

import { useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";

import { Icon } from "@/components/icon";
import { emailProblemOf, emailSyntaxProblem, EMAIL_PROBLEM_TEXT, type EmailProblem } from "@/features/feedback/feedback-card";
import { API_BASE_URL } from "@/lib/config";
import { useI18n } from "@/lib/i18n/provider";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

// i18n-ignore — the team's address.
export const CONTACT_EMAIL = "contact@basairquran.com";

/**
 * «راسلنا» in the public site's footer: a message to the team, kept in the
 * feedback centre (kind `contact`) and forwarded to contact@basairquran.com
 * (docs/feedback-centre.md). The address is asked so the team can answer.
 */
export function ContactForm() {
  const { locale } = useI18n();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [emailProblem, setEmailProblem] = useState<EmailProblem | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function send() {
    const problem = emailSyntaxProblem(email);
    setEmailProblem(problem);
    if (problem || !message.trim()) return;
    setState("sending");
    try {
      await api.sendFeedback({
        kind: "contact",
        message: message.trim(),
        email: email.trim(),
        url: typeof window === "undefined" ? null : window.location.pathname,
        language: locale,
      });
      setState("sent");
    } catch (error) {
      const refused = emailProblemOf(error);
      setEmailProblem(refused);
      setState(refused ? "idle" : "failed");
    }
  }

  if (state === "sent") {
    return (
      <div className="qb-contact is-sent" role="status">
        <Icon name="check" size={20} />
        <p>{t("وصلت رسالتك إلى الفريق، ويصلك الرد على بريدك.")}</p>
        <button
          type="button"
          className="qb-site-ghost"
          onClick={() => {
            setMessage("");
            setState("idle");
          }}
        >
          {t("رسالة أخرى")}
        </button>
      </div>
    );
  }

  return (
    <form
      className="qb-contact"
      noValidate
      aria-labelledby="contact-title"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <h2 id="contact-title">{t("راسلنا")}</h2>
      <p className="hint">{t("اكتب رسالتك إلى فريق بصائر، ويصلك الرد على بريدك.")}</p>
      <input
        type="email"
        value={email}
        autoComplete="email"
        maxLength={200}
        placeholder={t("بريدك الإلكتروني (ليصلك الرد)")}
        aria-label={t("بريدك الإلكتروني (ليصلك الرد)")}
        aria-invalid={emailProblem ? true : undefined}
        onChange={(event) => {
          setEmail(event.target.value);
          setEmailProblem(null);
        }}
      />
      {emailProblem ? <p className="error">{EMAIL_PROBLEM_TEXT[emailProblem]}</p> : null}
      <textarea
        value={message}
        rows={4}
        maxLength={4000}
        placeholder={t("رسالتك")}
        aria-label={t("رسالتك")}
        onChange={(event) => setMessage(event.target.value)}
      />
      {state === "failed" ? <p className="error">{t("تعذّر الإرسال. حاول مرة أخرى.")}</p> : null}
      <div className="row">
        <button type="submit" className="qb-site-cta sm" disabled={!message.trim() || !email.trim() || state === "sending"}>
          {t("أرسل")}
        </button>
        <span className="direct">
          {t("أو اكتب إلى")}{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr">
            {CONTACT_EMAIL}
          </a>
        </span>
      </div>
    </form>
  );
}
