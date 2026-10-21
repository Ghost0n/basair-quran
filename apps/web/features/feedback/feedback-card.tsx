"use client";

import { useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { FeedbackItem, FeedbackKind } from "@q-basair/shared";

import { relativeAge } from "@/features/companions/use-companions";
import { FEEDBACK_KIND_LABEL, FEEDBACK_STATUS_LABEL } from "@/features/community/labels";
import { useAuthSession } from "@/lib/auth-session-context";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { useI18n } from "@/lib/i18n/provider";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const KINDS: FeedbackKind[] = ["contact", "bug", "help", "feature"];

/**
 * «الدعم والملاحظات» — write to the team (docs/feedback-centre.md): a message,
 * a bug, a request for help or a feature idea. Guests may leave an email to be
 * answered; signed-in readers see what they sent and where it stands.
 */
export function FeedbackCard() {
  const { user } = useAuthSession();
  const { locale } = useI18n();
  const signedIn = !AUTH_ENABLED || Boolean(user);
  const [kind, setKind] = useState<FeedbackKind>("contact");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [mine, setMine] = useState<FeedbackItem[]>([]);

  useEffect(() => {
    if (signedIn) api.getMyFeedback().then(setMine).catch(() => {});
  }, [signedIn, state]);

  async function send() {
    if (!message.trim()) return;
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
    } catch {
      setState("failed");
    }
  }

  return (
    <section className="qb-setting-card qb-feedback-card">
      <h3>{t("الدعم والملاحظات")}</h3>
      <p className="card-sub">{t("راسل الفريق: سؤال، أو خلل وجدته، أو اقتراح ميزة. يقرأ كلَّ رسالة شخصٌ من الفريق.")}</p>
      <div className="qb-setting-seg qb-fit-choice" data-autofit="2" role="radiogroup" aria-label={t("نوع الرسالة")}>
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
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("بريدك للرد (اختياري)")}
            aria-label={t("بريدك للرد (اختياري)")}
            autoComplete="email"
          />
        ) : null}
        <button type="submit" className="qb-btn primary" disabled={!message.trim() || state === "sending"}>
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
