"use client";

import { useEffect, useRef } from "react";

import { LOCALE_CODES, SOURCE_LOCALE } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { usePreferences } from "@/lib/preferences-context";

/**
 * A language chosen on another device follows the account: once preferences
 * load, a device without its own explicit choice adopts `ui_language`.
 */
export function LocaleAccountSync() {
  const { ready, account } = usePreferences();
  const { locale, setLocale, explicit } = useI18n();
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current || explicit) return;
    done.current = true;
    const wanted = account.ui_language;
    if (wanted && wanted !== SOURCE_LOCALE && wanted !== locale && LOCALE_CODES.includes(wanted)) void setLocale(wanted);
  }, [ready, explicit, account.ui_language, locale, setLocale]);

  return null;
}
