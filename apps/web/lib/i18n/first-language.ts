import { SOURCE_LOCALE, localeInfo } from "./locales";

type Numerals = ReturnType<typeof localeInfo>["numerals"];

/**
 * The digits a language choice brings (docs/i18n.md): the digits are a
 * setting of their own, except on the reader's first language choice, which
 * takes the language's usual digits — as long as the reader hasn't set the
 * digits themselves (they still are the current language's). Returns
 * `undefined` when the digits stay as they are.
 */
export function numeralsForLanguageChoice({
  code,
  explicit,
  accountLanguage,
  accountNumerals,
}: {
  /** The language being chosen. */
  code: string;
  /** This device already has an explicit language choice. */
  explicit: boolean;
  /** The account's saved interface language. */
  accountLanguage: string | null | undefined;
  /** The account's saved digits. */
  accountNumerals: string;
}): Numerals | undefined {
  const current = accountLanguage || SOURCE_LOCALE;
  const first = !explicit && current === SOURCE_LOCALE;
  if (!first || accountNumerals !== localeInfo(current).numerals) return undefined;
  const wanted = localeInfo(code).numerals;
  return wanted === accountNumerals ? undefined : wanted;
}

/**
 * The digits a language picked by the reader brings (the landing page's bar,
 * Settings, the app's onboarding): that language's usual digits, every time —
 * the digits menu stays to set others afterwards. Returns `undefined` when the
 * digits already are those.
 */
export function numeralsForLanguage(code: string, currentNumerals: string): Numerals | undefined {
  const wanted = localeInfo(code).numerals;
  return wanted === currentNumerals ? undefined : wanted;
}
