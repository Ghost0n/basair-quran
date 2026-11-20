import { createGetKcContextMock } from "keycloakify/login/KcContext";

import type { KcContext, KcContextExtension, KcContextExtensionPerPage } from "./KcContext";
import { KEYCLOAK_TAGS } from "./locales";

const { getKcContextMock } = createGetKcContextMock({
  kcContextExtension: { themeName: "qbasair", properties: {} } satisfies KcContextExtension,
  kcContextExtensionPerPage: {
    "login-email-code.ftl": { qbCodeEmail: "reader@example.com", qbCodeLength: 6, qbCodeMinutes: 10, qbCodeResendIn: 42, qbCodeSendsLeft: 4 },
  } satisfies KcContextExtensionPerPage,
  overrides: {
    realm: { displayName: "بصائر القرآن", registrationEmailAsUsername: true },
  },
});

const PROVIDERS = [
  { alias: "google", providerId: "google", displayName: "Google" },
  { alias: "facebook", providerId: "facebook", displayName: "Meta (Facebook)" },
  { alias: "apple", providerId: "apple", displayName: "Apple" },
].map((provider) => ({ ...provider, loginUrl: "#", iconClasses: "" }));

/** A page as Keycloak would render it, for `pnpm dev` and the tests. */
export function mockContext(pageId: string, locale: string, social = false): KcContext {
  const context = getKcContextMock({
    pageId: pageId as "login.ftl",
    overrides: {
      locale: {
        currentLanguageTag: locale,
        supported: KEYCLOAK_TAGS.map((languageTag) => ({ languageTag, label: languageTag, url: `?page=${pageId}&locale=${languageTag}${social ? "&social" : ""}` })),
      },
      social: { providers: social ? PROVIDERS : [] },
    },
  }) as KcContext;
  // The realm's client links back to the app (scripts/keycloak_realm.py baseUrl).
  Object.assign(context.client, { baseUrl: "http://127.0.0.1:3005/" });
  if ("realm" in context) Object.assign(context.realm, { loginWithEmailAllowed: true, rememberMe: true, resetPasswordAllowed: true });
  return context;
}
