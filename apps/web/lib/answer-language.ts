/**
 * The language the study answers in (Settings → «الذكاء الاصطناعي» → «لغة
 * الجواب»): the interface language by default, or one of the interface
 * languages chosen once. The answer comes in it whatever language the question
 * is written in. Kept on this device, like the interface language (signing
 * out keeps it).
 */
import { useSyncExternalStore } from "react";

import { activeLocale, LOCALE_CODES } from "@/lib/i18n";

export const ANSWER_LANGUAGE_KEY = "qb.studio.answerLanguage";
export const FOLLOW_INTERFACE = "auto";

// The name the research agent is given (`answer_language`), in English.
const LANGUAGE_NAMES: Record<string, string> = {
  ar: "arabic",
  en: "english",
  fr: "french",
  es: "spanish",
  de: "german",
  pt: "portuguese",
  it: "italian",
  nl: "dutch",
  ru: "russian",
  tr: "turkish",
  az: "azerbaijani",
  uz: "uzbek",
  bs: "bosnian",
  sq: "albanian",
  fa: "persian",
  ur: "urdu",
  id: "indonesian",
  ms: "malay",
  bn: "bengali",
  hi: "hindi",
  zh: "chinese",
  ja: "japanese",
  ko: "korean",
  sw: "swahili",
};

const listeners = new Set<() => void>();
let cached: string | null = null;

function read(): string {
  try {
    const saved = window.localStorage.getItem(ANSWER_LANGUAGE_KEY);
    return saved && LOCALE_CODES.includes(saved) ? saved : FOLLOW_INTERFACE;
  } catch {
    return FOLLOW_INTERFACE;
  }
}

/** The saved choice: a locale code, or `auto` (the interface language). */
export function answerLanguageChoice(): string {
  if (typeof window === "undefined") return FOLLOW_INTERFACE;
  cached ??= read();
  return cached;
}

export function setAnswerLanguage(choice: string): void {
  cached = LOCALE_CODES.includes(choice) ? choice : FOLLOW_INTERFACE;
  try {
    if (cached === FOLLOW_INTERFACE) window.localStorage.removeItem(ANSWER_LANGUAGE_KEY);
    else window.localStorage.setItem(ANSWER_LANGUAGE_KEY, cached);
  } catch {
    /* storage unavailable: kept until the next load */
  }
  for (const listener of listeners) listener();
}

export function useAnswerLanguageChoice(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    answerLanguageChoice,
    () => FOLLOW_INTERFACE,
  );
}

/** The locale the next answer is written in. */
export function answerLocale(choice: string = answerLanguageChoice(), interfaceLocale: string = activeLocale()): string {
  return choice !== FOLLOW_INTERFACE && LOCALE_CODES.includes(choice) ? choice : interfaceLocale;
}

/** What the research agent is sent as `answer_language` for that locale. */
export function answerLanguageName(locale: string = answerLocale()): string {
  return LANGUAGE_NAMES[locale] ?? "arabic";
}

export function resetAnswerLanguageForTests(): void {
  cached = null;
  listeners.clear();
}
