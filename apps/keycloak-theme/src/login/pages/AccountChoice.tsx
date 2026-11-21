import type { MouseEvent } from "react";

import { kcSanitize } from "keycloakify/lib/kcSanitize";

import { ProviderIcon } from "../brand";
import type { I18n } from "../i18n";
import { openInPlace } from "../inPlace";
import type { KcContext } from "../KcContext";

const PROVIDER_ORDER = ["apple", "google", "facebook"];

/** Set when a tab is followed, so the next page skips the entrance (Template): one page, two tabs. */
export const STILL_KEY = "qb-kc-still";

type Provider = { alias: string; displayName: string; loginUrl: string };

/**
 * The top of the one account page (sign in and sign up, login.ftl and
 * register.ftl): the «دخول | حساب جديد» tabs, then the realm's identity
 * providers (Apple, Google, Meta — each present only when its keys are set;
 * a provider signs in and creates the account alike), then «أو بالبريد
 * الإلكتروني» above the tab's email form. Without registration there are no
 * tabs; without providers, no buttons nor divider.
 */
export function AccountChoice(props: {
  i18n: I18n;
  active: "login" | "register";
  loginUrl: string;
  registrationUrl?: string;
  providers: readonly Provider[] | undefined;
}) {
  const { i18n, active, loginUrl, registrationUrl, providers = [] } = props;
  const { msg, msgStr } = i18n;
  // Keycloak lists providers in the realm's order: show Apple, Google, Meta, then any other.
  const rank = (alias: string) => {
    const index = PROVIDER_ORDER.indexOf(alias);
    return index < 0 ? PROVIDER_ORDER.length : index;
  };
  const sorted = [...providers].sort((a, b) => rank(a.alias) - rank(b.alias));
  // The other tab is drawn in place (inPlace.ts), else loaded; either way without the entrance.
  const openTab = (event: MouseEvent<HTMLAnchorElement>) => {
    try {
      sessionStorage.setItem(STILL_KEY, "1");
    } catch {
      // Storage can be blocked: the page then simply rises again.
    }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const href = event.currentTarget.href;
    void openInPlace(href).then((drawn) => {
      if (!drawn) window.location.assign(href);
    });
  };

  return (
    <>
      {registrationUrl ? (
        <nav className="qb-auth-tabs qb-kc-tabs" aria-label={msgStr("qbAccount")}>
          <a className={`qb-auth-tab${active === "login" ? " active" : ""}`} href={loginUrl} aria-current={active === "login" ? "page" : undefined} onClick={openTab}>
            {msg("doLogIn")}
          </a>
          <a
            className={`qb-auth-tab${active === "register" ? " active" : ""}`}
            href={registrationUrl}
            aria-current={active === "register" ? "page" : undefined}
            onClick={openTab}
          >
            {msg("qbSignUp")}
          </a>
        </nav>
      ) : null}

      {sorted.length > 0 ? (
        <section id="kc-social-providers" className="qb-kc-social">
          <ul>
            {sorted.map((provider) => (
              <li key={provider.alias}>
                <a id={`social-${provider.alias}`} className={`qb-auth-secondary qb-kc-provider is-${provider.alias}`} href={provider.loginUrl}>
                  <ProviderIcon alias={provider.alias} />
                  <span dangerouslySetInnerHTML={{ __html: kcSanitize(provider.displayName) }} />
                </a>
              </li>
            ))}
          </ul>
          <p className="qb-kc-divider" role="separator">
            <span>{msg("qbOrEmail")}</span>
          </p>
        </section>
      ) : null}
    </>
  );
}

/** The providers a page offers: only where the realm signs in with passwords (else Keycloak redirects). */
export function pageProviders(kcContext: Extract<KcContext, { pageId: "login.ftl" | "register.ftl" }>): Provider[] | undefined {
  const social = (kcContext as { social?: { providers?: Provider[] } }).social;
  return (kcContext.realm as { password?: boolean }).password === false ? undefined : social?.providers;
}
