import { LOCALES, SOURCE_LOCALE } from "@web/lib/i18n/locales";
import { formatNumber } from "@web/lib/numerals";

/**
 * The interface languages, from the web's list (apps/web/lib/i18n/locales.ts):
 * the same names and the same direction. Keycloak names the web's «zh» zh-CN
 * (scripts/keycloak_realm.py LOCALES).
 */
export const KEYCLOAK_TAGS: readonly string[] = LOCALES.map((locale) => keycloakTag(locale.code));

export function keycloakTag(webCode: string): string {
  return webCode === "zh" ? "zh-CN" : webCode;
}

export function webCode(tag: string | undefined): string {
  const base = (tag ?? SOURCE_LOCALE).toLowerCase().split(/[-_]/)[0];
  return LOCALES.some((locale) => locale.code === base) ? base : SOURCE_LOCALE;
}

/** Right-to-left for Arabic, Persian and Urdu only — never for Latin-script Azerbaijani,
 * which Keycloakify's own list counts as right-to-left. */
export function localeDirection(tag: string | undefined): "rtl" | "ltr" {
  const code = webCode(tag);
  return LOCALES.find((locale) => locale.code === code)?.dir ?? "rtl";
}

/** Keycloak lists the realm's languages in no fixed order: show them in the web's. */
export function sortLanguages<T extends { languageTag: string }>(languages: readonly T[]): T[] {
  const rank = (tag: string) => {
    const index = KEYCLOAK_TAGS.indexOf(tag);
    return index < 0 ? KEYCLOAK_TAGS.length : index;
  };
  return [...languages].sort((a, b) => rank(a.languageTag) - rank(b.languageTag));
}

export function nativeName(tag: string): string {
  const code = webCode(tag);
  return LOCALES.find((locale) => locale.code === code)?.native ?? tag;
}

/** A number in the language's own digits, as the web writes it by default
 * (Arabic-Indic in Arabic, Persian in Persian and Urdu, Latin elsewhere). */
export function localeDigits(tag: string | undefined, n: number | string): string {
  const code = webCode(tag);
  return formatNumber(n, LOCALES.find((locale) => locale.code === code)?.numerals ?? "arabic-indic");
}
