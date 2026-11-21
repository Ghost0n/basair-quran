import { useState } from "react";

import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { useScript } from "keycloakify/login/pages/Login.useScript";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";

import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import { AccountChoice } from "./AccountChoice";
import { PasswordInput } from "./PasswordInput";

/**
 * The account page's «دخول» tab (login.ftl): the tabs and providers
 * (AccountChoice), then the web's form — email, password with «نسيتها؟»
 * beside its label, the gold «دخول». Its «حساب جديد» tab is Register.
 */
export default function Login(props: PageProps<Extract<KcContext, { pageId: "login.ftl" }>, I18n>) {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { social, realm, url, usernameHidden, login, auth, registrationDisabled, messagesPerField, enableWebAuthnConditionalUI, authenticators } =
    kcContext;
  const { msg, msgStr } = i18n;
  const [submitting, setSubmitting] = useState(false);
  const webAuthnButtonId = "authenticateWebAuthnButton";

  const fieldError = messagesPerField.existsError("username", "password");
  const canRegister = realm.password && realm.registrationAllowed && !registrationDisabled;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={doUseDefaultCss}
      classes={classes}
      displayMessage={!fieldError}
      headerNode={msg("loginAccountTitle")}
    >
      {/* After a provider or a failed attempt shows who is signing in, only the form remains. */}
      {usernameHidden ? null : (
        <AccountChoice
          i18n={i18n}
          active="login"
          loginUrl={url.loginUrl}
          registrationUrl={canRegister ? url.registrationUrl : undefined}
          providers={social?.providers && realm.password ? social.providers : undefined}
        />
      )}
      {realm.password ? (
        <form
          id="kc-form-login"
          className="qb-kc-form"
          onSubmit={() => {
            setSubmitting(true);
            return true;
          }}
          action={url.loginAction}
          method="post"
        >
          {!usernameHidden ? (
            <div className="qb-auth-field">
              <label htmlFor="username" className="label">
                {!realm.loginWithEmailAllowed ? msg("username") : !realm.registrationEmailAsUsername ? msg("usernameOrEmail") : msg("email")}
              </label>
              <input
                id="username"
                className="qb-auth-input ltr"
                name="username"
                defaultValue={login.username ?? ""}
                type="text"
                inputMode={realm.registrationEmailAsUsername ? "email" : undefined}
                dir="ltr"
                autoFocus
                autoComplete={enableWebAuthnConditionalUI ? "username webauthn" : "username"}
                placeholder="name@example.com"
                aria-invalid={fieldError}
                aria-describedby={fieldError ? "input-error" : undefined}
              />
            </div>
          ) : null}

          <div className="qb-auth-field">
            <span className="label-row">
              <label htmlFor="password" className="label">
                {msg("password")}
              </label>
              {realm.resetPasswordAllowed ? (
                <a className="forgot" href={url.loginResetCredentialsUrl}>
                  {msg("doForgotPassword")}
                </a>
              ) : null}
            </span>
            <PasswordInput
              i18n={i18n}
              id="password"
              name="password"
              autoComplete="current-password"
              invalid={fieldError}
              describedBy={fieldError ? "input-error" : undefined}
            />
            {fieldError ? (
              <span
                id="input-error"
                className="qb-kc-field-error"
                aria-live="polite"
                dangerouslySetInnerHTML={{ __html: kcSanitize(messagesPerField.getFirstError("username", "password")) }}
              />
            ) : null}
          </div>

          {realm.rememberMe && !usernameHidden ? (
            <label className="qb-kc-check">
              <input id="rememberMe" name="rememberMe" type="checkbox" defaultChecked={!!login.rememberMe} />
              <span>{msg("rememberMe")}</span>
            </label>
          ) : null}

          <input type="hidden" id="id-hidden-input" name="credentialId" value={auth.selectedCredential} />
          <button className="qb-auth-cta" name="login" id="kc-login" type="submit" disabled={submitting}>
            {submitting ? <span className="qb-auth-spinner" aria-hidden="true" /> : null}
            {msgStr("doLogIn")}
          </button>
        </form>
      ) : null}

      {enableWebAuthnConditionalUI ? (
        <>
          <PasskeyScripts webAuthnButtonId={webAuthnButtonId} kcContext={kcContext} i18n={i18n} />
          <form id="webauth" action={url.loginAction} method="post">
            <input type="hidden" id="clientDataJSON" name="clientDataJSON" />
            <input type="hidden" id="authenticatorData" name="authenticatorData" />
            <input type="hidden" id="signature" name="signature" />
            <input type="hidden" id="credentialId" name="credentialId" />
            <input type="hidden" id="userHandle" name="userHandle" />
            <input type="hidden" id="error" name="error" />
          </form>
          {authenticators !== undefined && authenticators.authenticators.length !== 0 ? (
            <form id="authn_select" className={kcClsx("kcFormClass")}>
              {authenticators.authenticators.map((authenticator, index) => (
                <input key={index} type="hidden" name="authn_use_chk" readOnly value={authenticator.credentialId} />
              ))}
            </form>
          ) : null}
          <input id={webAuthnButtonId} type="button" className="qb-auth-secondary" value={msgStr("passkey-doAuthenticate")} />
        </>
      ) : null}
    </Template>
  );
}

/**
 * Keycloak's passkey scripts (Keycloakify's useScript), mounted only when the realm
 * offers passkeys: that hook reloads the page when it mounts a second time, which a
 * switch between the account page's tabs (inPlace.ts) would otherwise do.
 */
function PasskeyScripts(props: Parameters<typeof useScript>[0]) {
  useScript(props);
  return null;
}
