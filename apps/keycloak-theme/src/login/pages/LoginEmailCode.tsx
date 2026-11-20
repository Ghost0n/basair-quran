import { useEffect, useState } from "react";

import type { PageProps } from "keycloakify/login/pages/PageProps";

import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import { localeDigits } from "../locales";

/**
 * «login-email-code.ftl»: the email is confirmed by the 6-digit code mailed to
 * it (apps/keycloak-email-code, docs/keycloak.md «Email code»). One field for
 * the code (Latin, Arabic-Indic or Persian digits all count), a resend that
 * waits out the server's cooldown, and the way back to sign-in.
 */
export default function LoginEmailCode(props: PageProps<Extract<KcContext, { pageId: "login-email-code.ftl" }>, I18n>) {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { url, qbCodeEmail, qbCodeLength, qbCodeMinutes, qbCodeResendIn, qbCodeSendsLeft, qbCodeTriesLeft, message } = kcContext;
  const { msg, msgStr, currentLanguage } = i18n;
  // Numbers in the language's own digits, as on the web; the code itself stays as typed.
  const digits = (n: number) => localeDigits(currentLanguage.languageTag, n);

  const [submitting, setSubmitting] = useState(false);
  const wait = useCountdown(qbCodeResendIn);
  const invalid = message?.type === "error" && qbCodeTriesLeft !== undefined;

  return (
    <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={msg("qbEmailCodeTitle")}>
      <div className="qb-kc-code-intro">
        <p>{msg("qbEmailCodeSentTo")}</p>
        <p className="qb-kc-code-email">
          <bdi dir="ltr">{qbCodeEmail}</bdi>
        </p>
        <p className="qb-kc-help">{msg("qbEmailCodeValidFor", digits(qbCodeMinutes))}</p>
      </div>

      <form
        id="kc-email-code-form"
        className="qb-kc-form"
        action={url.loginAction}
        method="post"
        onSubmit={() => {
          setSubmitting(true);
          return true;
        }}
      >
        <div className="qb-auth-field">
          <label htmlFor="code" className="label">
            {msg("qbEmailCodeLabel")}
          </label>
          <input
            id="code"
            name="code"
            className="qb-auth-input qb-kc-code-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            autoFocus
            required
            // Room for a pasted «123 456» or direction marks; the server reads the digits.
            maxLength={qbCodeLength + 6}
            placeholder={"•".repeat(qbCodeLength)}
            aria-invalid={invalid}
            aria-describedby={invalid ? "code-tries" : undefined}
          />
          {invalid ? (
            <span id="code-tries" className="qb-kc-field-error" aria-live="polite">
              {msg("qbEmailCodeTriesLeft", digits(qbCodeTriesLeft))}
            </span>
          ) : null}
        </div>
        <button className="qb-auth-cta" type="submit" disabled={submitting}>
          {submitting ? <span className="qb-auth-spinner" aria-hidden="true" /> : null}
          {msgStr("qbEmailCodeSubmit")}
        </button>
      </form>

      <div className="qb-kc-code-actions">
        {qbCodeSendsLeft > 0 ? (
          <form action={url.loginAction} method="post">
            <button type="submit" name="resend" value="1" className="qb-kc-link" disabled={wait > 0} aria-live="polite">
              {wait > 0 ? msg("qbEmailCodeResendIn", digits(wait)) : msg("qbEmailCodeResend")}
            </button>
          </form>
        ) : null}
        <a className="qb-kc-link" href={url.loginRestartFlowUrl}>
          {msg("backToLogin")}
        </a>
      </div>
    </Template>
  );
}

/** Seconds left of the server's resend cooldown, counted down on the page. */
function useCountdown(from: number) {
  const [left, setLeft] = useState(Math.max(0, Math.ceil(from)));
  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
  return left;
}
