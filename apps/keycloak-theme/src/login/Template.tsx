import { useEffect, useState } from "react";

import { GirihPattern } from "@web/components/girih";
import { SelectMenu } from "@web/components/select-menu";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { TemplateProps } from "keycloakify/login/TemplateProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import { useSetClassName } from "keycloakify/tools/useSetClassName";

import { BrandSeal } from "./brand";
import type { I18n } from "./i18n";
import type { KcContext } from "./KcContext";
import { localeDirection, nativeName, sortLanguages } from "./locales";
import { STILL_KEY } from "./pages/AccountChoice";
import { useKeycloakScripts } from "./useKeycloakScripts";

/**
 * Every sign-in page's frame, in the web's sign-in design
 * (apps/web/features/auth/login-page-shell.tsx): the rosette drawn once
 * behind, the seal and wordmark, one quiet card, the way back to the app.
 * Arabic first and right to left; each language in its own direction.
 */
export default function Template(props: TemplateProps<KcContext, I18n>) {
  const {
    displayInfo = false,
    displayMessage = true,
    displayRequiredFields = false,
    headerNode,
    socialProvidersNode = null,
    infoNode = null,
    documentTitle,
    bodyClassName,
    kcContext,
    i18n,
    doUseDefaultCss,
    classes,
    children,
  } = props;

  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { msg, msgStr, currentLanguage, enabledLanguages } = i18n;
  const { auth, url, message, isAppInitiatedAction, client } = kcContext;
  const direction = localeDirection(currentLanguage.languageTag);
  // Followed from the other account tab (AccountChoice): the page stays put, as one page would.
  const [still] = useState(() => {
    try {
      const value = sessionStorage.getItem(STILL_KEY) === "1";
      sessionStorage.removeItem(STILL_KEY);
      return value;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.title = documentTitle ?? msgStr("qbWordmark");
  }, [documentTitle, msgStr]);

  // Keycloakify decides the direction from its own list (which counts Latin-script
  // Azerbaijani as right to left): the web's list decides here.
  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = currentLanguage.languageTag;
  }, [direction, currentLanguage.languageTag]);

  useSetClassName({ qualifiedName: "html", className: kcClsx("kcHtmlClass") });
  useSetClassName({ qualifiedName: "body", className: bodyClassName ?? kcClsx("kcBodyClass") });

  useKeycloakScripts(kcContext);

  const showAttemptedUser = auth !== undefined && auth.showUsername && !auth.showResetCredentials;
  // The app's address (the client's baseUrl in scripts/keycloak_realm.py); Keycloak
  // serialises it on every page though Keycloakify's types only name it on some.
  // Error and info pages carry Keycloak's own «back to application» link.
  const ownBackLink = kcContext.pageId === "error.ftl" || kcContext.pageId === "info.ftl";
  const backToApp = ownBackLink ? undefined : (client as { baseUrl?: string }).baseUrl;

  return (
    <div className={still ? "qb-auth qb-kc qb-kc-still" : "qb-auth qb-kc"} dir={direction}>
      <GirihPattern className="qb-auth-girih" drawn={!still} />

      {enabledLanguages.length > 1 ? (
        <div className="qb-kc-locale">
          {/* The web's own themed dropdown (a bottom sheet on a phone), not a native list. */}
          <div className="qb-kc-locale-pill">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
            </svg>
            <SelectMenu
              ariaLabel={msgStr("qbLanguage")}
              value={currentLanguage.languageTag}
              options={sortLanguages(enabledLanguages).map(({ languageTag }) => ({
                value: languageTag,
                label: nativeName(languageTag),
              }))}
              onChange={(tag) => {
                const target = enabledLanguages.find(({ languageTag }) => languageTag === tag);
                if (target) window.location.href = target.href;
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="qb-kc-rise">
        <BrandSeal size={66} />
      </div>
      <div className="qb-auth-head qb-kc-rise" style={{ animationDelay: "80ms" }}>
        <div className="qb-auth-wordmark">{msg("qbWordmark")}</div>      </div>

      <main className="qb-auth-card qb-kc-card qb-kc-rise" style={{ animationDelay: "160ms" }}>
        <header className="qb-kc-header">
          {showAttemptedUser ? (
            <div id="kc-username" className="qb-kc-attempted">
              <bdi id="kc-attempted-username">{auth.attemptedUsername}</bdi>
              <a id="reset-login" href={url.loginRestartFlowUrl} aria-label={msgStr("restartLoginTooltip")}>
                {msg("restartLoginTooltip")}
              </a>
            </div>
          ) : (
            <h1 id="kc-page-title" className="qb-auth-reset-title">
              {headerNode}
            </h1>
          )}
          {displayRequiredFields ? (
            <p className="qb-kc-required">
              <span className="required">*</span> {msg("requiredFields")}
            </p>
          ) : null}
        </header>

        {displayMessage && message !== undefined && (message.type !== "warning" || !isAppInitiatedAction) ? (
          <div
            className={`qb-kc-alert is-${message.type}`}
            role={message.type === "error" ? "alert" : "status"}
            // A message Keycloak only has in English must not be reordered by the page's direction.
            dir="auto"
            dangerouslySetInnerHTML={{ __html: kcSanitize(message.summary) }}
          />
        ) : null}

        {children}

        {auth !== undefined && auth.showTryAnotherWayLink ? (
          <form id="kc-select-try-another-way-form" action={url.loginAction} method="post" className="qb-kc-try-another">
            <input type="hidden" name="tryAnotherWay" value="on" />
            <button type="submit" className="qb-kc-link">
              {msg("doTryAnotherWay")}
            </button>
          </form>
        ) : null}

        {socialProvidersNode}

        {displayInfo ? (
          <div id="kc-info" className="qb-kc-info">
            {infoNode}
          </div>
        ) : null}
      </main>

      {backToApp ? (
        <a className="qb-landing-guest qb-kc-back" href={backToApp}>
          {msg("qbGuest")}
        </a>
      ) : null}
    </div>
  );
}
