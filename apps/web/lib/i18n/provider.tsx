"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { ensureScriptFont, scriptFamily } from "@/lib/script-fonts";

import { LOCALE_CODES, SOURCE_LOCALE, localeInfo, matchLocale, type LocaleInfo } from "./locales";
import { setActiveDictionary, type Dictionary } from "./translate";

import { LOCALE_STORAGE_KEY } from "./init-script";

export { LOCALE_STORAGE_KEY };

type I18nValue = {
  locale: string;
  info: LocaleInfo;
  /** Switch the interface language (persisted on this device). */
  setLocale: (code: string) => Promise<void>;
  /** True when the language came from an explicit choice on this device. */
  explicit: boolean;
};

const I18nContext = createContext<I18nValue>({
  locale: SOURCE_LOCALE,
  info: localeInfo(SOURCE_LOCALE),
  setLocale: async () => {},
  explicit: false,
});

const cache = new Map<string, Promise<Dictionary>>();

function loadDictionary(code: string): Promise<Dictionary> {
  let pending = cache.get(code);
  if (!pending) {
    pending = import(`./locales/${code}.json`).then((module) => (module.default ?? module) as Dictionary);
    cache.set(code, pending);
    pending.catch(() => cache.delete(code));
  }
  return pending;
}

function readStored(): string | null {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return value && LOCALE_CODES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/** `<html lang dir>` and the font stacks for the locale's script. */
function applyDocument(info: LocaleInfo) {
  const root = document.documentElement;
  root.lang = info.code;
  root.dir = info.dir;
  const family = scriptFamily(info.code);
  if (family) {
    ensureScriptFont(info.code);
    root.style.setProperty("--font-arabic-ui", `'${family}', 'Cairo', system-ui, sans-serif`);
    root.style.setProperty("--font-arabic-heading", `'Amiri', '${family}', serif`);
  } else {
    root.style.removeProperty("--font-arabic-ui");
    root.style.removeProperty("--font-arabic-heading");
  }
}

function reveal() {
  delete document.documentElement.dataset.i18nPending;
}

/**
 * Interface language. On first load it uses, in order: this device's explicit
 * choice (`qb.locale`), then the browser's primary language when supported,
 * else Arabic. (An account's language is applied by `LocaleAccountSync` once
 * preferences load.) The dictionary is installed before the app remounts
 * under the new language, so every `t()` call sees it.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(SOURCE_LOCALE);
  const [explicit, setExplicit] = useState(false);

  const apply = useCallback(async (code: string, persist: boolean) => {
    const info = localeInfo(code);
    if (info.code === SOURCE_LOCALE) {
      setActiveDictionary(SOURCE_LOCALE, {}, null);
    } else {
      try {
        const [messages, fallback] = await Promise.all([
          loadDictionary(info.code),
          info.code === "en" ? Promise.resolve(null) : loadDictionary("en").catch(() => null),
        ]);
        setActiveDictionary(info.code, messages, fallback);
      } catch {
        return; // dictionary unavailable: stay in the current language
      }
    }
    applyDocument(info);
    if (persist) {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, info.code);
      } catch {
        /* private mode — applies for this visit */
      }
      setExplicit(true);
    }
    setLocaleState(info.code);
  }, []);

  useEffect(() => {
    const stored = readStored();
    if (stored) setExplicit(true);
    const initial = stored ?? matchLocale(navigator.languages?.length ? [navigator.languages[0]] : [navigator.language]);
    if (initial === SOURCE_LOCALE) {
      applyDocument(localeInfo(SOURCE_LOCALE));
      reveal();
      return;
    }
    void apply(initial, false).finally(reveal);
  }, [apply]);

  return (
    <I18nContext.Provider value={{ locale, info: localeInfo(locale), setLocale: (code) => apply(code, true), explicit }}>
      {/* Remount under a new language: memoised text and module getters re-read the dictionary. */}
      <Fragment key={locale}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
