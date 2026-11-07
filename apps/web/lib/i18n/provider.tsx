"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { startAutoFit } from "@/lib/auto-fit";
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

/**
 * The web app bundles every dictionary (one chunk each). The standalone app
 * bundles only English and reads the others from downloaded interface packs;
 * the build-time constant keeps the other chunks out of its export.
 */
const importDictionary: (code: string) => Promise<Dictionary> =
  process.env.NEXT_PUBLIC_APP_MODE === "1"
    ? (code) =>
        code === "en"
          ? import("./locales/en.json").then((module) => (module.default ?? module) as Dictionary)
          : import("@/lib/app-mode/interface-packs").then(({ installedDictionary }) => installedDictionary(code) as Promise<Dictionary>)
    : (code) => import(`./locales/${code}.json`).then((module) => (module.default ?? module) as Dictionary);

function loadDictionary(code: string): Promise<Dictionary> {
  let pending = cache.get(code);
  if (!pending) {
    pending = importDictionary(code);
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
 * Interface language. On first load it uses this device's explicit choice
 * (`qb.locale`), else — on the web — the browser's language (`matchLocale`,
 * not saved, so it never counts as a choice), else Arabic. (An account's language is
 * applied by `LocaleAccountSync` once preferences load, and wins over the browser's.) The dictionary is installed before the app remounts
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
        // Dictionary unavailable: stay in the current language (the app build
        // falls back to its bundled English when a language pack is missing).
        if (process.env.NEXT_PUBLIC_APP_MODE === "1" && info.code !== "en") return apply("en", false);
        return;
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

  // Controls re-measure their labels in every language (see lib/auto-fit.ts).
  useEffect(() => startAutoFit(), []);

  useEffect(() => {
    const stored = readStored();
    if (stored) setExplicit(true);
    // The standalone app starts in English until onboarding asks for a language;
    // the web opens in the browser's language (Arabic when it isn't one of ours)
    // until the reader picks one.
    const initial =
      stored ??
      (process.env.NEXT_PUBLIC_APP_MODE === "1"
        ? "en"
        : matchLocale(typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]));
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
