import { useLayoutEffect, useState } from "react";

import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { UserProfileFormFieldsProps } from "keycloakify/login/UserProfileFormFieldsProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import type { LazyOrNot } from "keycloakify/tools/LazyOrNot";
import type { JSX } from "keycloakify/tools/JSX";

import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import { AccountChoice, pageProviders } from "./AccountChoice";

type RegisterProps = PageProps<Extract<KcContext, { pageId: "register.ftl" }>, I18n> & {
  UserProfileFormFields: LazyOrNot<(props: UserProfileFormFieldsProps) => JSX.Element>;
};

/**
 * The account page's «حساب جديد» tab (register.ftl): the same tabs and
 * providers as «دخول» (AccountChoice), then the realm's profile fields
 * (Keycloakify's, so the realm's user profile decides them) and «أنشئ حسابك».
 * Keycloakify's own page, kept for terms and reCAPTCHA when the realm asks.
 */
export default function Register(props: RegisterProps) {
  const { kcContext, i18n, doUseDefaultCss, Template, classes, UserProfileFormFields } = props;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { url, messagesPerField, recaptchaRequired, recaptchaVisible, recaptchaSiteKey, recaptchaAction, termsAcceptanceRequired } = kcContext;
  const { msg, msgStr } = i18n;
  const [isFormSubmittable, setIsFormSubmittable] = useState(false);
  const [areTermsAccepted, setAreTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Keycloak serialises its own address on this page too; Keycloakify's type leaves it out.
  const registrationUrl = (url as { registrationUrl?: string }).registrationUrl;

  useLayoutEffect(() => {
    (window as unknown as Record<string, unknown>).onSubmitRecaptcha = () => {
      (document.getElementById("kc-register-form") as HTMLFormElement | null)?.requestSubmit();
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).onSubmitRecaptcha;
    };
  }, []);

  const invisibleRecaptcha = recaptchaRequired && !recaptchaVisible && recaptchaAction !== undefined;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={doUseDefaultCss}
      classes={classes}
      headerNode={msg("loginAccountTitle")}
      displayMessage={messagesPerField.exists("global")}
    >
      <AccountChoice i18n={i18n} active="register" loginUrl={url.loginUrl} registrationUrl={registrationUrl} providers={pageProviders(kcContext)} />
      <form
        id="kc-register-form"
        className="qb-kc-form"
        action={url.registrationAction}
        method="post"
        onSubmit={() => {
          setSubmitting(true);
          return true;
        }}
      >
        <UserProfileFormFields
          kcContext={kcContext}
          i18n={i18n}
          kcClsx={kcClsx}
          onIsFormSubmittableValueChange={setIsFormSubmittable}
          doMakeUserConfirmPassword={true}
        />
        {termsAcceptanceRequired ? (
          <div className="qb-kc-terms">
            <p>{msg("termsTitle")}</p>
            <div id="kc-registration-terms-text">{msg("termsText")}</div>
            <label className="qb-kc-check">
              <input
                type="checkbox"
                id="termsAccepted"
                name="termsAccepted"
                checked={areTermsAccepted}
                onChange={(event) => setAreTermsAccepted(event.target.checked)}
                aria-invalid={messagesPerField.existsError("termsAccepted")}
              />
              <span>{msg("acceptTerms")}</span>
            </label>
            {messagesPerField.existsError("termsAccepted") ? (
              <span
                id="input-error-terms-accepted"
                className="qb-kc-field-error"
                aria-live="polite"
                dangerouslySetInnerHTML={{ __html: kcSanitize(messagesPerField.get("termsAccepted")) }}
              />
            ) : null}
          </div>
        ) : null}
        {recaptchaRequired && (recaptchaVisible || recaptchaAction === undefined) ? (
          <div className="g-recaptcha" data-size="compact" data-sitekey={recaptchaSiteKey} data-action={recaptchaAction} />
        ) : null}
        <button
          id="kc-register"
          type="submit"
          className={invisibleRecaptcha ? "qb-auth-cta g-recaptcha" : "qb-auth-cta"}
          data-sitekey={invisibleRecaptcha ? recaptchaSiteKey : undefined}
          data-callback={invisibleRecaptcha ? "onSubmitRecaptcha" : undefined}
          data-action={invisibleRecaptcha ? recaptchaAction : undefined}
          disabled={submitting || (!invisibleRecaptcha && (!isFormSubmittable || (termsAcceptanceRequired && !areTermsAccepted)))}
        >
          {submitting ? <span className="qb-auth-spinner" aria-hidden="true" /> : null}
          {msgStr("doRegister")}
        </button>
      </form>
    </Template>
  );
}
