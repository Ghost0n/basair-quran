"use client";

import { useEffect, useRef } from "react";

import { LOCALE_CODES, SOURCE_LOCALE } from "@/lib/i18n";
import { numeralsForLanguageChoice } from "@/lib/i18n/first-language";
import { useI18n } from "@/lib/i18n/provider";
import { usePreferences } from "@/lib/preferences-context";

/**
 * A language chosen on another device follows the account: once preferences
 * load, a device without its own explicit choice adopts `ui_language`. When
 * the account has none, the browser's language (the web's default, see
 * `I18nProvider`) is the reader's first language: it brings its usual digits,
 * once, as a first choice in Settings would (`numeralsForLanguageChoice`).
 */
export function LocaleAccountSync() {
  const { ready, account, updateAccount } = usePreferences();
  const { locale, setLocale, explicit } = useI18n();
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current || explicit) return;
    done.current = true;
    const wanted = account.ui_language;
    if (wanted && wanted !== SOURCE_LOCALE && wanted !== locale && LOCALE_CODES.includes(wanted)) {
      void setLocale(wanted);
      return;
    }
    if (locale === SOURCE_LOCALE) return;
    const numerals = numeralsForLanguageChoice({
      code: locale,
      explicit,
      accountLanguage: account.ui_language,
      accountNumerals: account.numerals,
    });
    if (numerals) void updateAccount({ numerals }).catch(() => {});
  }, [ready, explicit, account.ui_language, account.numerals, locale, setLocale, updateAccount]);

  return null;
}
